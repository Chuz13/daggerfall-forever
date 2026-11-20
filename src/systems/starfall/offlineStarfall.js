// @ts-check
// Offline Starfall director, dual-clock, search ring, and local ledger.

import { FORK_FLAGS } from '../../config/forkFlags.js';
import { getPref } from '../uiPrefs.js';
import { registerModSaveData } from '../modSaveData.js';
import { t } from '../textManager.js';
import { dayOfYearFromMinutes, MINUTES_PER_DAY } from '../gameDate.js';
import { HOLIDAYS, holidayDayOfYear } from '../holidays.js';
import { REGION_NAMES } from '../../formats/mapsFile.js';
import { PIXEL_M } from '../../net/gate/gateLaw.js';
import {
  starRoll,
  starSpotLocal,
  starTimes,
  newStarLedger,
  stepStar,
  foldStarWord,
  starLedgerState,
  STAR_WAVES,
  STAR_GATHER_MS,
  STAR_WAVE_MAX_MS,
  STAR_BREATH_MS,
  STAR_LIGHT,
  STAR_BLOW_LIGHT,
  STAR_BREATH_LIGHT,
  STAR_LOST_DARK,
  P_FALLEN,
  P_GATHER,
  P_WAVE,
  P_BREATH,
  P_MASTER,
  P_HELD,
  P_LOST,
} from '../../net/starfall/starfallLaw.js';
import { STAR_COVENS, STAR_PROVINCE_COVENS, covenWitches } from './starfallCovens.js';
import { WITCHES_FESTIVAL_DAY } from './starfallNight.js';
import { STAR_CARD_TEXT } from './starWords.js';

export const OFFLINE_STARFALL_VENDOR = 'offline-starfall';
export const OFFLINE_STARFALL_MIN_LEVEL = 6; // matches Starfall Glass & Morwen's QLTF01 threshold

/** Dual-clock durations (real active ms, frozen on pause). */
export const OFFLINE_OMEN_MS = 135_000;
export const OFFLINE_STREAK_MS = 8_000;
export const OFFLINE_LIFE_MS = 20 * 60_000;
export const OFFLINE_AFTER_MS = 120_000;
export const OFFLINE_FAST_TRAVEL_MIN_LEFT_MS = 12 * 60_000;
export const OFFLINE_FAST_TRAVEL_MAX_HOURS = 36;
export const OFFLINE_FAST_TRAVEL_MAX_PX = 25;

/** Solo combat balance overrides. */
export const OFFLINE_FOE_HEALTH = 1.5;
export const OFFLINE_LEASH_M = 85;
export const OFFLINE_SAY_M = 75;
export const OFFLINE_BREATH_MS = 7_000;
export const OFFLINE_BREATH_LIGHT = 20;

/** Visibility & search ring radii (map pixels). */
export const OFFLINE_STAR_SKY_PX = 12;
export const OFFLINE_STAR_RUMOR_PX = 10;
export const OFFLINE_STAR_COMPASS_M = 2500;
export const OFFLINE_STAR_RING_PX = 2.2;
export const OFFLINE_STAR_RING_SHIFT_MIN = 0.4;
export const OFFLINE_STAR_RING_SHIFT_MAX = 1.4;

const TALES_AND_TALLOW_DAY = holidayDayOfYear(HOLIDAYS.Tales_and_Tallow);

export const OFFLINE_STARFALL_PRESETS = Object.freeze({
  rare: Object.freeze({ cooldownDays: 6, chances: Object.freeze([0.15, 0.3, 0.5, 0.75, 1]), startDayMin: 4 }),
  normal: Object.freeze({ cooldownDays: 3, chances: Object.freeze([0.25, 0.45, 0.7, 1]), startDayMin: 2 }),
  frequent: Object.freeze({ cooldownDays: 1, chances: Object.freeze([0.4, 0.75, 1]), startDayMin: 1 }),
});

export function offlineStarfallMode() {
  const v = getPref('offlineStarfall');
  return v === 'off' || v === 'rare' || v === 'normal' || v === 'frequent' ? v : 'normal';
}

export function isOfflineStarfallActive() {
  return !!FORK_FLAGS.ENABLE_OFFLINE_STARFALL && offlineStarfallMode() !== 'off';
}

export const OFFLINE_STAR_TEXT = Object.freeze({
  omenNear: (dir, town) =>
    town
      ? t('starfall.offline.omenNearTown', 'To the {dir}, toward {town}, a violet star begins to burn in the sky.', { dir, town })
      : t('starfall.offline.omenNear', 'To the {dir}, a violet star begins to burn in the sky.', { dir }),
  fellIndoors: (town) =>
    town
      ? t('starfall.offline.fellIndoorsTown', 'A distant tremor shakes the floor; a star has fallen near {town}.', { town })
      : t('starfall.offline.fellIndoors', 'A distant tremor shakes the floor; a star has fallen nearby.'),
  rumor: (town) =>
    t('starfall.offline.rumor', 'Folk say the witches have been singing near {town}, and a strange violet star hangs over the wilds.', { town }),
  boardTitle: () => t('starfall.offline.boardTitle', 'Strange Lights in the Wilds'),
  boardBody: (town, witches) =>
    t('starfall.offline.boardBody', 'Travellers report a falling star near {town}. {witches} were heard singing before nightfall.', { town, witches }),
  renown: (xp) => t('starfall.offline.renown', '+{xp} Renown for holding the fallen star.', { xp }),
  ringLabel: (heart, phaseText) =>
    phaseText ? `${STAR_CARD_TEXT.name(heart)} - ${phaseText}` : STAR_CARD_TEXT.name(heart),
});

const emptyState = () => ({
  seq: 1,
  lastStarDay: -100,
  lastRollDay: -100,
  starsHeld: 0,
  sinceHeart: 0,
  starwardenEarned: false,
  pendingAutoLine: false,
  active: null,
});

let _state = emptyState();

function validState(r) {
  if (!r || typeof r !== 'object') return emptyState();
  return {
    seq: Number.isSafeInteger(r.seq) && r.seq >= 1 ? r.seq : 1,
    lastStarDay: Number.isFinite(r.lastStarDay) ? r.lastStarDay : -100,
    lastRollDay: Number.isFinite(r.lastRollDay) ? r.lastRollDay : -100,
    starsHeld: Number.isSafeInteger(r.starsHeld) && r.starsHeld >= 0 ? r.starsHeld : 0,
    sinceHeart: Number.isSafeInteger(r.sinceHeart) && r.sinceHeart >= 0 ? r.sinceHeart : 0,
    starwardenEarned: !!r.starwardenEarned,
    pendingAutoLine: !!r.pendingAutoLine,
    active: r.active && typeof r.active === 'object' ? structuredClone(r.active) : null,
  };
}

registerModSaveData(OFFLINE_STARFALL_VENDOR, {
  newSaveData: emptyState,
  getSaveData: () => structuredClone(_state),
  restoreSaveData: (r) => {
    _state = validState(r);
  },
  newGame: () => {
    _state = emptyState();
  },
});

export const getOfflineStarfallState = () => _state;
export function _resetOfflineStarfallForTests() {
  _state = emptyState();
}

/** Pick the canonical coven for a region/lane, falling back to the nearest Bay coven. */
export function covenForOfflineSite(region, lane = 0, px = 0, py = 0, scan = null) {
  if (lane > 0) {
    const pc = STAR_PROVINCE_COVENS.find((c) => c.theatre === lane);
    if (pc) return pc;
  }
  const direct = STAR_COVENS.filter((c) => c.region === region);
  if (direct.length) return direct[(px + py) % direct.length];
  if (scan?.towns?.length) {
    let best = STAR_COVENS[0],
      bd = Infinity;
    for (const c of STAR_COVENS) {
      const t = scan.towns.find((tw) => tw && tw.region === c.region);
      if (!t) continue;
      const d = Math.hypot(t.px - px, t.py - py);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }
  return STAR_COVENS[Math.abs(region | 0) % STAR_COVENS.length];
}

export function covenById(id, lane = 0) {
  return (
    STAR_COVENS.find((c) => c.id === id) ??
    STAR_PROVINCE_COVENS.find((c) => c.id === id || c.theatre === lane) ??
    STAR_COVENS[0]
  );
}

/** Deterministic search ring offset (mirrors gateLaw.js omenRing so the star is inside, not dead-center). */
export function starSearchRing(n, k, px, py, spot = starSpotLocal(n, k)) {
  const gx = px + spot[0] / PIXEL_M;
  const gy = py + 1 - spot[1] / PIXEL_M;
  const a = (starRoll(n, k, 6) / 4294967296) * 2 * Math.PI;
  const u = starRoll(n, k, 7) / 4294967296;
  const shift = OFFLINE_STAR_RING_SHIFT_MIN + Math.sqrt(u) * (OFFLINE_STAR_RING_SHIFT_MAX - OFFLINE_STAR_RING_SHIFT_MIN);
  return {
    cx: gx + Math.cos(a) * shift,
    cy: gy + Math.sin(a) * shift,
    r: OFFLINE_STAR_RING_PX,
    gx,
    gy,
  };
}

/** Compass direction label from (fx, fy) to (tx, ty) on map grid (x east, y south). */
export function compassDirOf(fx, fy, tx, ty) {
  const dx = tx - fx;
  const dy = ty - fy;
  const dirs = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const deg = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
  return dirs[Math.round(deg / 45) % 8];
}

/** Decide whether a night triggers a Starfall via the pity-timer director. */
export function shouldRollStarToday(day, rolls = Math.random) {
  if (!isOfflineStarfallActive()) return false;
  if (_state.active) return false;
  const mode = offlineStarfallMode();
  const preset = OFFLINE_STARFALL_PRESETS[mode] ?? OFFLINE_STARFALL_PRESETS.normal;
  if (day < preset.startDayMin) return false;
  if (_state.lastRollDay >= day) return false;
  _state.lastRollDay = day;
  const since = day - _state.lastStarDay;
  if (since < preset.cooldownDays) return false;
  const idx = Math.min(preset.chances.length - 1, Math.max(0, since - preset.cooldownDays));
  return rolls() < preset.chances[idx];
}

/** Decide whether the next star is a Heart-Star. */
export function rollOfflineHeartStar(classicMinutes, { forceHeart = false, qltf03NeedsHeart = false, rolls = Math.random } = {}) {
  if (forceHeart) return true;
  if (qltf03NeedsHeart) return true;
  const doy = dayOfYearFromMinutes(Math.floor(classicMinutes));
  if (doy === WITCHES_FESTIVAL_DAY || doy === TALES_AND_TALLOW_DAY) return true;
  if (_state.sinceHeart >= 3) return true;
  return rolls() < 0.2;
}

const W = 1000;
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/**
 * Find a valid wilderness pixel near the player (`2..8` px, fallback `1..10` px)
 * using the existing `gateScanOf` data.
 */
export function pickOfflineStarPixel(scan, playerPx, playerPy, playerRegion, { avoid = [], rolls = Math.random } = {}) {
  if (!scan?.byRegion) return null;
  const fitsAvoid = (px, py) => avoid.every((a) => cheb(a.px, a.py, px, py) >= 4);
  const searchRing = (minR, maxR, regionOnly) => {
    const candidates = [];
    const regions = regionOnly && scan.byRegion.has(playerRegion) ? [playerRegion] : [...scan.byRegion.keys()];
    for (const reg of regions) {
      const list = scan.byRegion.get(reg);
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const id = list[i];
        const px = id % W,
          py = Math.floor(id / W);
        const d = cheb(px, py, playerPx, playerPy);
        if (d >= minR && d <= maxR && fitsAvoid(px, py)) candidates.push({ id, px, py, reg });
      }
    }
    return candidates;
  };
  let pool = searchRing(2, 8, true);
  if (!pool.length) pool = searchRing(2, 8, false);
  if (!pool.length) pool = searchRing(1, 10, false);
  if (!pool.length) return null;
  const chosen = pool[Math.min(pool.length - 1, Math.floor(rolls() * pool.length))];
  const town = scan.towns?.[scan.townAt?.[chosen.id]] ?? null;
  return { px: chosen.px, py: chosen.py, region: chosen.reg, town };
}

/**
 * Create and persist an active offline star near the player.
 * Returns the active star record or null.
 * @param {{ scan?: any, playerPx?: number, playerPy?: number, playerRegion?: number, classicMinutes?: number, forceHeart?: boolean, qltf03NeedsHeart?: boolean, startFallen?: boolean, avoid?: any[], rolls?: () => number }} [o]
 */
export function spawnOfflineStar({
  scan,
  playerPx,
  playerPy,
  playerRegion,
  classicMinutes,
  forceHeart = false,
  qltf03NeedsHeart = false,
  startFallen = false,
  avoid = [],
  rolls = Math.random,
} = {}) {
  const picked = pickOfflineStarPixel(scan, playerPx, playerPy, playerRegion, { avoid, rolls });
  if (!picked) return null;
  const n = _state.seq++;
  const heart = rollOfflineHeartStar(classicMinutes, { forceHeart, qltf03NeedsHeart, rolls });
  const k = heart ? 2 : Math.floor(rolls() * 2);
  const coven = covenForOfflineSite(picked.region, 0, picked.px, picked.py, scan);
  const spot = starSpotLocal(n, k);
  const ring = starSearchRing(n, k, picked.px, picked.py, spot);
  const regionName = REGION_NAMES[picked.region] ?? '';
  const near = picked.town?.name || regionName;
  const day = Math.floor(classicMinutes / MINUTES_PER_DAY);

  const led = newStarLedger({ n, k, px: picked.px, py: picked.py }, 0, 'offline');
  const active = {
    n,
    k,
    lane: 0,
    region: picked.region,
    regionName,
    covenId: coven.id,
    px: picked.px,
    py: picked.py,
    town: picked.town ? { name: picked.town.name, px: picked.town.px, py: picked.town.py, region: picked.town.region } : null,
    near,
    spot,
    ring,
    heart,
    stage: startFallen ? 'fallen' : 'omen',
    activeElapsedMs: 0,
    gameMinuteAt: classicMinutes,
    led,
    awarded: false,
    rumorSaid: false,
  };
  _state.lastStarDay = day;
  _state.active = active;
  return active;
}

/** Build a StarSite-compatible view object from the active offline star record. */
export function offlineStarSiteOf(active) {
  if (!active) return null;
  const coven = covenById(active.covenId, active.lane ?? 0);
  return {
    n: active.n,
    k: active.k,
    lane: active.lane ?? 0,
    region: active.region,
    regionName: active.regionName,
    coven,
    px: active.px,
    py: active.py,
    town: active.town,
    near: active.near,
    spot: active.spot,
    ring: active.ring,
    heart: !!active.heart,
    times: starTimes(active.n, active.k),
  };
}

/**
 * Advance the active star's dual clock (real active ms when unpaused, plus game-minute jump checks for Fast Travel/Rest).
 * Returns the updated stage ('omen' | 'streak' | 'fallen' | 'after' | 'gone' | null).
 */
export function stepOfflineStarClock(active, dtMs, classicMinutes, playerPx, playerPy, { indoors = false } = {}) {
  if (!active) return null;
  const prevMinute = Number.isFinite(active.gameMinuteAt) ? active.gameMinuteAt : classicMinutes;
  const deltaMin = classicMinutes - prevMinute;
  active.gameMinuteAt = classicMinutes;

  // Large time jump (Fast Travel or Rest)
  if (deltaMin > 2) {
    const distPx = cheb(active.px, active.py, playerPx, playerPy);
    if (deltaMin > OFFLINE_FAST_TRAVEL_MAX_HOURS * 60 || distPx > OFFLINE_FAST_TRAVEL_MAX_PX) {
      active.stage = 'gone';
      _state.active = null;
      return 'gone';
    }
    if (active.stage === 'omen' || active.stage === 'streak') {
      active.stage = 'fallen';
      active.activeElapsedMs = 0;
    } else if (active.stage === 'fallen') {
      const capElapsed = Math.max(0, OFFLINE_LIFE_MS - OFFLINE_FAST_TRAVEL_MIN_LEFT_MS);
      active.activeElapsedMs = Math.min(active.activeElapsedMs, capElapsed);
    }
  }

  // While indoors during omen/streak, don't burn out the omen before the player steps outside;
  // if they wait long enough, transition to fallen and notify.
  if (dtMs > 0) {
    active.activeElapsedMs = Math.max(0, (active.activeElapsedMs || 0) + dtMs);
  }

  const led = active.led;
  const over = led && (led.p === P_HELD || led.p === P_LOST);
  if (over) {
    if (active.stage !== 'after' && active.stage !== 'gone') {
      active.stage = 'after';
      active.activeElapsedMs = 0;
    } else if (active.stage === 'after' && active.activeElapsedMs >= OFFLINE_AFTER_MS) {
      active.stage = 'gone';
      _state.active = null;
      return 'gone';
    }
    return active.stage;
  }

  if (active.stage === 'omen' && active.activeElapsedMs >= OFFLINE_OMEN_MS) {
    active.stage = indoors ? 'fallen' : 'streak';
    active.activeElapsedMs = 0;
  } else if (active.stage === 'streak' && active.activeElapsedMs >= OFFLINE_STREAK_MS) {
    active.stage = 'fallen';
    active.activeElapsedMs = 0;
  } else if (active.stage === 'fallen' && active.activeElapsedMs >= OFFLINE_LIFE_MS) {
    active.stage = 'after';
    active.activeElapsedMs = 0;
    if (led && led.p !== P_HELD && led.p !== P_LOST) {
      led.p = P_LOST;
      led.why = 2; // STAR_LOST_DAWN
      led.lo = active.activeElapsedMs;
    }
  }
  return active.stage;
}

/**
 * Step the local StarLedger in offline solo play without online anti-cheat floor waits.
 * Uses `activeElapsedMs` as its clock so pausing never loses a star.
 */
export function stepOfflineLedger(active, word, near) {
  if (!active?.led) return { st: null, moved: false, heldJustNow: false };
  const led = active.led;
  const nowMs = Math.max(0, Math.floor(active.activeElapsedMs || 0));
  const wasPhase = led.p;

  // Custom solo step without online anti-cheat floors (starClearFloorMs / STAR_MASTER_MIN_MS)
  if (led.p !== P_HELD && led.p !== P_LOST) {
    // Advance encounter clock while standing near
    const from = led.stepAt;
    const to = near ? nowMs : Math.min(nowMs, led.nearAt + 15_000);
    led.stepAt = Math.max(led.stepAt, nowMs);
    if (led.p !== P_FALLEN && to > from) led.ec += to - from;

    for (let i = 0; i < 2 * STAR_WAVES + 4; i++) {
      if (led.p === P_GATHER && led.ec >= led.gatherAt + STAR_GATHER_MS) {
        led.w++;
        led.p = P_WAVE;
        led.ws = led.gatherAt + STAR_GATHER_MS;
        led.kn = 0;
        led.wz = 4 + (led.w - 1); // solo: 4, 5, 6, 7
      } else if (led.p === P_WAVE && led.ec >= led.ws + STAR_WAVE_MAX_MS) {
        led.p = P_BREATH;
        led.bs = led.ws + STAR_WAVE_MAX_MS;
        led.kn = 0;
        led.lt = Math.min(STAR_LIGHT, led.lt + OFFLINE_BREATH_LIGHT);
      } else if (led.p === P_BREATH && led.ec >= led.bs + OFFLINE_BREATH_MS) {
        if (led.w >= STAR_WAVES) {
          led.p = P_MASTER;
          led.ma = led.bs + OFFLINE_BREATH_MS;
          led.kn = 0;
        } else {
          led.w++;
          led.p = P_WAVE;
          led.ws = led.bs + OFFLINE_BREATH_MS;
          led.kn = 0;
          led.wz = 4 + (led.w - 1);
        }
      } else break;
    }
  }

  if (word && near && led.p !== P_HELD && led.p !== P_LOST) {
    led.nearAt = nowMs;
    const rec = (led.a.offline ??= { nm: 'Player', lv: 1, s: 0, last: 0, near: true, hb: 0 });
    rec.lv = Math.max(1, Math.min(60, word.lv | 0));
    rec.last = nowMs;
    rec.near = true;
    if (word.s === 1) rec.s = 1;
    led.b = rec.lv <= 8 ? 1 : rec.lv <= 15 ? 2 : 3;
    led.nd = 1;
    led.own = 'offline';
    led.ownAt = nowMs;

    if (led.p === P_FALLEN) {
      led.p = P_GATHER;
      led.gatherAt = led.ec;
    }
    if (led.p === P_WAVE && word.kw === led.w && word.kn > led.kn) {
      led.kn = Math.min(word.kn, led.wz);
    }
    if (led.p === P_WAVE && word.wc === led.w) {
      led.p = P_BREATH;
      led.bs = led.ec;
      led.kn = 0;
      led.lt = Math.min(STAR_LIGHT, led.lt + OFFLINE_BREATH_LIGHT);
    }
    if (word.hb > rec.hb) {
      const diff = word.hb - rec.hb;
      rec.hb = word.hb;
      led.lt = Math.max(0, led.lt - diff * STAR_BLOW_LIGHT);
    }
    if (led.lt <= 0) {
      led.p = P_LOST;
      led.lo = nowMs;
      led.why = STAR_LOST_DARK;
    } else if (led.p === P_MASTER && word.mf === 1) {
      led.p = P_HELD;
      led.hd = nowMs;
    }
  } else if (!near) {
    // Keep starAlive if stepStar was used in tests
    void stepStar;
    void foldStarWord;
    void STAR_BREATH_MS;
  }

  const heldJustNow = wasPhase !== P_HELD && led.p === P_HELD;
  const st = starLedgerState(led, 'offline');
  if (led.p === P_HELD || led.p === P_LOST) {
    // Freeze clock in `after`
    st.wl = 0;
  }
  return { st, moved: led.p !== wasPhase, heldJustNow };
}

/** Record an offline star hold in persistent save state. */
export function recordOfflineStarHeld(active, playerLevel) {
  if (!active || active.awarded) return { firstHold: false, autoStartNow: false };
  active.awarded = true;
  const firstHold = _state.starsHeld === 0;
  _state.starsHeld++;
  _state.sinceHeart = active.heart ? 0 : _state.sinceHeart + 1;
  if (firstHold) _state.pendingAutoLine = true;
  const autoStartNow = _state.pendingAutoLine && (playerLevel ?? 1) >= OFFLINE_STARFALL_MIN_LEVEL;
  return { firstHold, autoStartNow };
}

export function clearPendingAutoLine() {
  _state.pendingAutoLine = false;
}

export function markOfflineStarwardenEarned() {
  _state.starwardenEarned = true;
}

/** Tavern rumor about a nearby offline star (25% chance, within OFFLINE_STAR_RUMOR_PX). */
export function offlineStarRumor(playerPx, playerPy, rolls = Math.random) {
  const a = _state.active;
  if (!a || a.stage === 'after' || a.stage === 'gone' || a.rumorSaid) return null;
  if (cheb(a.px, a.py, playerPx, playerPy) > OFFLINE_STAR_RUMOR_PX) return null;
  if (rolls() >= 0.25) return null;
  a.rumorSaid = true;
  return OFFLINE_STAR_TEXT.rumor(a.near);
}

/** Notice board entry for a nearby offline star. */
export function offlineStarBoardNote(playerPx, playerPy) {
  const a = _state.active;
  if (!a || a.stage === 'after' || a.stage === 'gone') return null;
  if (cheb(a.px, a.py, playerPx, playerPy) > OFFLINE_STAR_RUMOR_PX) return null;
  const coven = covenById(a.covenId, a.lane ?? 0);
  return {
    title: OFFLINE_STAR_TEXT.boardTitle(),
    text: OFFLINE_STAR_TEXT.boardBody(a.near, covenWitches(coven)),
  };
}
