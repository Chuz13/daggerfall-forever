// @ts-check
import { t } from '../textManager.js';
import { DecisionBoxWindow } from '../../ui/decisionBox.js';
import { rollBossTraits, giveBossTraits } from '../bossTraits.js';
import { equipTableOf, EQUIP_SLOTS } from '../equip.js';
import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import { SKILLS, SKILL_NAMES } from '../skills.js';
import { effectiveLevel } from '../mentorMode.js';
import { liveStat } from '../statMods.js';
import {
  APOTHEOSIS_STAGES,
  APOTHEOSIS_QUEST_STEPS,
  REQUIRED_FATE_WEIGHT,
  ensureApotheosisState,
  evaluateMantellaFork,
  startApotheosisFromMantella,
  advanceApotheosisQuestStep,
  completeApotheosisQuestline,
} from './apotheosisCore.js';
import {
  computeShadowResistProfile,
  triggerApotheosisScreenFlash,
} from './apotheosisLive.js';

export const DIRENNI_TOWER_MAP_ID = 43196334;
export const DIRENNI_TOWER_LOCATION_ID = 0xc364; // 50020
export const MANTELLAN_CRUX_MAP_ID = 1001;
export const MANTELLAN_CRUX_LOCATION_ID = 50000;

export const DIRENNI_SIEGE_TOTAL_WAVES = 13;
export const DIRENNI_SIEGE_FALLBACK_S = 35;
export const DIRENNI_SIEGE_MAX_DIST_M = 95;
export const DIRENNI_INTERIOR_SPAWN_INTERVAL_S = 26;
export const DIRENNI_INTERIOR_MAX_ACTIVE = 6;
export const APOTHEOSIS_ZERO_STONE_KEY = 'apotheosis:zerostone';
export const APOTHEOSIS_ORRERY_EXIT_KEY = 'apotheosis:exit';
export const APOTHEOSIS_STORM_WEATHER_INTERVAL_SEC = 5;
export const APOTHEOSIS_STORM_TIME_SPAN_MINUTES = 360 * 1440; // ±1 year around storm start
export const APOTHEOSIS_STORM_WEATHERS = Object.freeze([
  'sunny',
  'cloudy',
  'overcast',
  'fog',
  'rain',
  'thunder',
  'snow',
]);

/**
 * Picks a random weather word from `APOTHEOSIS_STORM_WEATHERS`, avoiding repeating `currentWeather`.
 */
export function pickNextApotheosisStormWeather(currentWeather = null, rng = Math.random) {
  const choices = APOTHEOSIS_STORM_WEATHERS.filter((w) => w !== currentWeather);
  const pool = choices.length ? choices : APOTHEOSIS_STORM_WEATHERS;
  const r = typeof rng === 'function' ? rng() : Math.random();
  const idx = Math.max(0, Math.min(pool.length - 1, Math.floor((Number.isFinite(r) ? r : 0) * pool.length)));
  return pool[idx];
}

/**
 * Picks a randomized classic calendar minute within ±1 year (`±360 days`) of `baseMinutes`
 * so the Dragon Break temporal storm shifts time-of-day, date, and season each round.
 */
export function pickNextApotheosisStormMinutes(baseMinutes, rng = Math.random) {
  const base = Number.isFinite(baseMinutes) && baseMinutes > 0 ? Math.floor(baseMinutes) : 500000;
  const raw = typeof rng === 'function' ? rng() : Math.random();
  const r = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0.5;
  const offset = Math.round(((r * 2) - 1) * APOTHEOSIS_STORM_TIME_SPAN_MINUTES);
  return Math.max(1440, base + offset);
}

/**
 * Finds an exterior spawn position around `anchorPos` using wall/roof/lodged geometry checks
 * (matching the Living Tamriel safe spawner pipeline) so Siege waves never spawn inside tower geometry.
 */
export function findSafeSiegeSpawnPos(
  anchorPos,
  preferredDist = 12,
  baseAngle = 0,
  {
    groundAt = null,
    raycastHit = null,
    lodgedIn = null,
    freeLodgedFeet = null,
  } = {},
) {
  const base = anchorPos ?? [0, 0, 0];
  const minWallDist = 5.5;
  const maxAttempts = 16;

  for (let pass = 0; pass < 2; pass++) {
    const targetDist = pass === 0 ? preferredDist : Math.max(5.5, preferredDist * 0.6);
    for (let k = 0; k < maxAttempts; k++) {
      const sign = k % 2 === 0 ? 1 : -1;
      const step = Math.ceil(k / 2);
      const ang = baseAngle + sign * ((step / maxAttempts) * Math.PI * 2);
      const dx = Math.cos(ang);
      const dz = Math.sin(ang);
      let dist = targetDist;

      if (typeof raycastHit === 'function') {
        const wallHit = raycastHit([base[0], base[1] + 1.2, base[2]], [dx, 0, dz], dist + 1.5);
        if (wallHit && Number.isFinite(wallHit.dist) && wallHit.back !== true && wallHit.dist < dist + 0.8) {
          if (wallHit.dist >= minWallDist) {
            dist = Math.max(4.0, wallHit.dist - 1.6);
          } else {
            continue;
          }
        }
      }

      const x = base[0] + dx * dist;
      const z = base[2] + dz * dist;
      const gy = groundAt?.(x, z);
      const y = Number.isFinite(gy) ? gy : base[1];
      const feet = [x, y, z];

      if (typeof raycastHit === 'function') {
        // Anti-roof probe from 18m above feet
        const topHit = raycastHit([x, y + 18, z], [0, -1, 0], 28);
        if (topHit && Number.isFinite(topHit.dist)) {
          const surfaceY = y + 18 - topHit.dist;
          if (surfaceY - y > 0.85) continue;
        }
        // Anti-ceiling/interior overhang probe
        const skyHit = raycastHit([x, y + 1.8, z], [0, 1, 0], 3.0);
        if (skyHit && Number.isFinite(skyHit.dist) && skyHit.back !== true) continue;
      }

      if (lodgedIn?.(feet)) {
        freeLodgedFeet?.(feet);
        if (lodgedIn?.(feet)) continue;
      }

      return feet;
    }
  }

  // Fallback near base anchor
  const fx = base[0] + Math.cos(baseAngle) * 4.5;
  const fz = base[2] + Math.sin(baseAngle) * 4.5;
  const fgy = groundAt?.(fx, fz);
  return [fx, Number.isFinite(fgy) ? fgy : base[1], fz];
}

function readLocationIds(loc) {
  if (!loc) return { mapId: null, locId: null, name: '' };
  const mapId = Number(loc?.mapTableData?.mapId ?? loc?.mapId ?? NaN);
  const locId = Number(
    loc?.dungeon?.recordElement?.header?.locationId
    ?? loc?.locationId
    ?? NaN,
  );
  const name = String(loc?.name ?? '').trim();
  return {
    mapId: Number.isFinite(mapId) ? mapId : null,
    locId: Number.isFinite(locId) ? locId : null,
    name,
  };
}

/** True when `loc` refers to Direnni Tower on Isle of Balfiera. */
export function isDirenniTowerLocation(loc) {
  const { mapId, locId, name } = readLocationIds(loc);
  if (mapId === DIRENNI_TOWER_MAP_ID) return true;
  if (locId === DIRENNI_TOWER_LOCATION_ID || locId === DIRENNI_TOWER_MAP_ID) return true;
  return /direnni\s*tower/i.test(name);
}

/** True when `loc` refers to the Mantellan Crux final main-quest realm. */
export function isMantellanCruxLocation(loc) {
  const { mapId, locId, name } = readLocationIds(loc);
  if (mapId === MANTELLAN_CRUX_MAP_ID) return true;
  if (locId === MANTELLAN_CRUX_LOCATION_ID || locId === MANTELLAN_CRUX_MAP_ID) return true;
  return /mantellan\s*crux/i.test(name);
}

/**
 * True only when the player is actively inside Direnni Tower during Stage 1's
 * interior delving phase (`questline_active` + `tower_interior`).
 */
export function isDirenniHardModeActive(dfLocation, playerEntity) {
  if (!isDirenniTowerLocation(dfLocation) || !playerEntity) return false;
  const state = ensureApotheosisState(playerEntity);
  return state.stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE
    && state.questStep === APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR;
}

/**
 * Rolls Direnni Hard-Mode forced boss traits: 100% 1st trait, 50% 2nd trait.
 * Uses distinct trait definitions from bossTraits.js.
 */
export function rollDirenniForcedTraits(roll = Math.random) {
  const count = roll() < 0.5 ? 2 : 1;
  return rollBossTraits(count, roll);
}

/**
 * Applies Direnni Hard-Mode traits and combat scaling onto a spawned foe entity.
 */
export function applyDirenniForcedTraits(entity, roll = Math.random) {
  if (!entity || entity.allied || entity.team === 'PlayerAlly') return [];
  entity.direnniHardMode = true;
  const traits = rollDirenniForcedTraits(roll);
  if (traits.length) giveBossTraits(entity, traits, { own: true });
  entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 30) * 1.6));
  entity.health = entity.maxHealth;
  entity.damageScale = (Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1) * 1.3;
  return traits;
}

/**
 * Handles touching/activating the Mantella inside the Mantellan Crux.
 * Returns `true` if handled asynchronously via modal choice (caller skips vanilla globalVar 36),
 * or `false` if vanilla ending proceeds immediately.
 */
export function handleMantellaCruxTouch({
  dfLocation,
  playerEntity,
  presentWindow,
  say,
  onUsurpExit,
  onVanillaConfirm,
} = {}) {
  if (!isMantellanCruxLocation(dfLocation) || !playerEntity) return false;
  const state = ensureApotheosisState(playerEntity);
  if (state.mantellaVanillaChosen) {
    onVanillaConfirm?.();
    return false;
  }
  const fork = evaluateMantellaFork(playerEntity);

  if (!fork.eligible) {
    if (fork.reason !== 'fate_weight') {
      // Exclusive, active, or already-ascended runs cannot revisit Mantella usurpation.
      // Low Fate Weight stays reversible so unit/re-entry flows can still test reaching 16 later.
      ensureApotheosisState(playerEntity).mantellaVanillaChosen = true;
    }
    if (fork.reason === 'exclusive') {
      say?.(t(
        'apotheosis.mantella.blockedArtifacts',
        'You already ignited the path of Ascension through 13 Daedric Artifacts. The Mantella slips beyond your grasp.',
      ));
    } else if (fork.reason === 'fate_weight') {
      say?.(t(
        'apotheosis.mantella.blockedFate',
        'Your Fate Weight ({cur}/{req}) is too slight to usurp the Mantella; it follows its mortal course.',
        { cur: fork.fate?.count ?? 0, req: fork.fate?.required ?? REQUIRED_FATE_WEIGHT },
      ));
    } else if (fork.message) {
      say?.(fork.message);
    }
    onVanillaConfirm?.();
    return false;
  }

  if (typeof presentWindow !== 'function') return false;

  const choiceWin = new DecisionBoxWindow({
    rows: [
      t('apotheosis.mantella.promptTitle', 'The Mantella hums with Aedric fire.'),
      t('apotheosis.mantella.promptBody', 'Yes: Usurp its divinity (Begin Apotheosis: Path of CHIM) / No: Fulfill the Mortal Ending'),
    ],
    onYes: () => {
      const res = startApotheosisFromMantella(playerEntity);
      if (!res.ok) {
        say?.(res.error || '');
        onVanillaConfirm?.();
        return;
      }
      triggerApotheosisScreenFlash(0.8);
      const confirmWin = new DecisionBoxWindow({
        ok: true,
        rows: [
          t(
            'apotheosis.mantella.usurpedConsequence',
            'You tear the divine spark from the Mantella! A Dragon Break tears open the Iliac sky — fight your way to Direnni Tower.',
          ),
        ],
        onYes: () => { onUsurpExit?.(); },
      });
      presentWindow(confirmWin);
    },
    onNo: () => {
      ensureApotheosisState(playerEntity).mantellaVanillaChosen = true;
      const vanillaWin = new DecisionBoxWindow({
        ok: true,
        rows: [
          t(
            'apotheosis.mantella.vanillaConsequence',
            'You return the Mantella to its rightful fate and let Numidium walk.',
          ),
        ],
        onYes: () => {
          ensureApotheosisState(playerEntity).mantellaVanillaChosen = true;
          onVanillaConfirm?.();
        },
      });
      presentWindow(vanillaWin);
    },
  });

  presentWindow(choiceWin);
  return true;
}

const WAVE_COMPOSITIONS = Object.freeze([
  // Waves 1-3: scouts & lesser daedra
  () => [MOBILE_TYPES.Imp, MOBILE_TYPES.Imp, MOBILE_TYPES.FireDaedra],
  () => [MOBILE_TYPES.FireDaedra, MOBILE_TYPES.FrostDaedra, MOBILE_TYPES.Daedroth],
  () => [MOBILE_TYPES.Daedroth, MOBILE_TYPES.FireDaedra, MOBILE_TYPES.FrostDaedra, MOBILE_TYPES.Imp],
  // Waves 4-6: seducers & atronachs
  () => [MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.FireAtronach, MOBILE_TYPES.Daedroth],
  () => [MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.IceAtronach, MOBILE_TYPES.FrostDaedra, MOBILE_TYPES.FireDaedra],
  () => [MOBILE_TYPES.FleshAtronach, MOBILE_TYPES.IronAtronach, MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.Daedroth],
  // Waves 7-9: heavy daedra & battlemages
  () => [MOBILE_TYPES.DaedraLord, MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.Battlemage, MOBILE_TYPES.FireAtronach],
  () => [MOBILE_TYPES.DaedraLord, MOBILE_TYPES.Sorcerer, MOBILE_TYPES.IceAtronach, MOBILE_TYPES.IronAtronach],
  () => [MOBILE_TYPES.DaedraLord, MOBILE_TYPES.DaedraLord, MOBILE_TYPES.Battlemage, MOBILE_TYPES.DaedraSeducer],
  // Waves 10-12: elites & liches
  () => [MOBILE_TYPES.DaedraLord, MOBILE_TYPES.AncientLich, MOBILE_TYPES.Battlemage, MOBILE_TYPES.FireAtronach, MOBILE_TYPES.IceAtronach],
  () => [MOBILE_TYPES.DaedraLord, MOBILE_TYPES.DaedraLord, MOBILE_TYPES.Sorcerer, MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.Lich],
  () => [MOBILE_TYPES.DaedraLord, MOBILE_TYPES.DaedraLord, MOBILE_TYPES.AncientLich, MOBILE_TYPES.Battlemage, MOBILE_TYPES.FleshAtronach],
]);

/** Returns spawn mobileType list for waves 1..13. */
export function direnniSiegeWaveMobs(wave) {
  const idx = Math.max(1, Math.min(DIRENNI_SIEGE_TOTAL_WAVES, wave)) - 1;
  if (idx < WAVE_COMPOSITIONS.length) return WAVE_COMPOSITIONS[idx]();
  return [MOBILE_TYPES.DaedraLord, MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.FireAtronach];
}

/**
 * Exterior 13-wave siege & Wave 13 3-phase Aspect of the Tower boss controller.
 * Keeps no corpse spam/credit if abandoned (`removeFoe` despawn on retreat/mode switch).
 */
export function createDirenniSiegeController({
  playerEntity,
  getPlayerPos,
  getPlayerMode,
  groundAt,
  raycastHit = null,
  lodgedIn = null,
  freeLodgedFeet = null,
  spawnFoe,
  removeFoe,
  hurtPlayer,
  flashDamage,
  say,
  nowSec = () => performance.now() / 1000,
} = {}) {
  let active = false;
  let anchor = null;
  let wave = 0;
  let waveTimer = 0;
  let spawningCount = 0;
  let currentWaveFoes = [];
  let allSpawnedFoes = [];
  let bossFoe = null;
  let bossPhase = 0;
  let telegraphCooldown = 3.5;
  let telegraphs = [];
  let epoch = 0;

  const isAlive = (f) => f && !f.dead && !f._gone && (f.entity?.health ?? 0) > 0;

  function syncPlayerProgress(w) {
    const state = ensureApotheosisState(playerEntity);
    state.siegeWave = w;
  }

  function clearTelegraphs() {
    telegraphs.length = 0;
  }

  function despawnAll(reasonText = null) {
    for (const f of allSpawnedFoes) {
      if (f && !f._gone) {
        try { removeFoe?.(f); } catch { /* ignore */ }
      }
    }
    allSpawnedFoes = [];
    currentWaveFoes = [];
    bossFoe = null;
    bossPhase = 0;
    spawningCount = 0;
    wave = 0;
    waveTimer = 0;
    active = false;
    clearTelegraphs();
    syncPlayerProgress(0);
    if (reasonText) say?.(reasonText);
  }

  function spawnRingPos(idx, total, radius = 14) {
    const base = anchor ?? getPlayerPos?.() ?? [0, 0, 0];
    const ang = (idx / Math.max(1, total)) * Math.PI * 2 + wave * 0.7;
    return findSafeSiegeSpawnPos(base, radius, ang, {
      groundAt,
      raycastHit,
      lodgedIn,
      freeLodgedFeet,
    });
  }

  function configureSiegeFoeAlignment(f) {
    if (!f) return f;
    f.campId = 'direnni_siege';
    if (f.entity) {
      f.entity.team = 'Daedra';
      f.entity.mobileTeam = 'Daedra';
      f.entity.campId = 'direnni_siege';
      f.entity.suppressInfighting = true;
    }
    return f;
  }

  async function spawnBoss(myEpoch) {
    const pos = spawnRingPos(0, 1, 16);
    spawningCount++;
    try {
      const f = await spawnFoe?.(MOBILE_TYPES.DaedraLord, pos, {
        loose: true,
        transient: true,
        eliteFoe: true,
        level: Math.max(20, effectiveLevel(playerEntity) + 6),
        feetGiven: true,
      });
      if (!f || !active || epoch !== myEpoch) {
        if (f) removeFoe?.(f);
        return;
      }
      configureSiegeFoeAlignment(f);
      const lvl = effectiveLevel(playerEntity);
      f.entity.name = t('apotheosis.boss.aspectName', 'Aspect of the Tower');
      f.entity.apotheosisAspectBoss = true;
      f.entity.sizeScale = 3;
      f.entity.maxHealth = Math.max(1200, (lvl + 12) * 95);
      f.entity.health = f.entity.maxHealth;
      f.entity.damageScale = Math.max(f.entity.damageScale ?? 1, 1.85);
      giveBossTraits(f.entity, rollBossTraits(2, Math.random), { own: true });
      f.hitFlash = 0.5;
      bossFoe = f;
      bossPhase = 1;
      telegraphCooldown = 3.0;
      currentWaveFoes.push(f);
      allSpawnedFoes.push(f);
      triggerApotheosisScreenFlash(0.4);
      say?.(t(
        'apotheosis.siege.bossArrive',
        'Wave 13/13: The Aspect of the Tower manifests before the Direnni Gates!',
      ));
    } finally {
      spawningCount = Math.max(0, spawningCount - 1);
    }
  }

  async function spawnWaveBatch(waveNum, myEpoch) {
    const list = direnniSiegeWaveMobs(waveNum);
    const total = list.length;
    if (waveNum >= DIRENNI_SIEGE_TOTAL_WAVES) {
      await spawnBoss(myEpoch);
    }
    for (let i = 0; i < total; i++) {
      if (!active || epoch !== myEpoch) return;
      const mobileType = list[i];
      const pos = spawnRingPos(i, total, waveNum === DIRENNI_SIEGE_TOTAL_WAVES ? 13 : 11 + (waveNum % 4));
      spawningCount++;
      try {
        const f = await spawnFoe?.(mobileType, pos, {
          loose: true,
          transient: true,
          eliteFoe: waveNum >= 8 && i === 0,
          level: Math.max(10, effectiveLevel(playerEntity) + Math.floor(waveNum / 3)),
          feetGiven: true,
        });
        if (!f || !active || epoch !== myEpoch) {
          if (f) removeFoe?.(f);
          continue;
        }
        configureSiegeFoeAlignment(f);
        currentWaveFoes.push(f);
        allSpawnedFoes.push(f);
      } finally {
        spawningCount = Math.max(0, spawningCount - 1);
      }
    }
  }

  function startWave(waveNum) {
    if (!active) return;
    wave = Math.max(1, Math.min(DIRENNI_SIEGE_TOTAL_WAVES, waveNum));
    waveTimer = 0;
    currentWaveFoes = [];
    syncPlayerProgress(wave);
    if (wave < DIRENNI_SIEGE_TOTAL_WAVES) {
      say?.(t('apotheosis.siege.waveStart', 'Siege of Direnni Tower — Wave {cur}/{total} approaches!', {
        cur: wave,
        total: DIRENNI_SIEGE_TOTAL_WAVES,
      }));
    }
    const myEpoch = epoch;
    void spawnWaveBatch(wave, myEpoch);
  }

  function completeSiege() {
    for (const f of allSpawnedFoes) {
      if (f && !f.dead && !f._gone) {
        try { removeFoe?.(f); } catch { /* ignore */ }
      }
    }
    allSpawnedFoes = [];
    currentWaveFoes = [];
    bossFoe = null;
    bossPhase = 0;
    active = false;
    clearTelegraphs();
    advanceApotheosisQuestStep(playerEntity, APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR, {
      towerSiegeCleared: true,
      siegeWave: DIRENNI_SIEGE_TOTAL_WAVES,
    });
    triggerApotheosisScreenFlash(0.65);
    say?.(t(
      'apotheosis.siege.cleared',
      'The Aspect of the Tower is shattered! The seals of Direnni Tower unlock.',
    ));
  }

  function spawnTelegraphAtPlayer(radius = 3.4, duration = 1.8) {
    const p = getPlayerPos?.();
    if (!p) return;
    const gy = groundAt?.(p[0], p[2]);
    const y = Number.isFinite(gy) ? gy : p[1];
    telegraphs.push({
      origin: [p[0], y, p[2]],
      r: radius,
      start: nowSec(),
      duration,
      elapsed: 0,
      color: bossPhase >= 3 ? [1.0, 0.28, 0.14, 1.0] : [1.0, 0.72, 0.18, 1.0],
    });
  }

  function spawnPhaseAdds(count) {
    const myEpoch = epoch;
    const mobs = [MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.FireAtronach, MOBILE_TYPES.FrostDaedra];
    for (let i = 0; i < count; i++) {
      const m = mobs[i % mobs.length];
      const pos = spawnRingPos(i, count, 12);
      void spawnFoe?.(m, pos, { loose: true, transient: true, feetGiven: true }).then((f) => {
        if (!f || !active || epoch !== myEpoch) {
          if (f) removeFoe?.(f);
          return;
        }
        configureSiegeFoeAlignment(f);
        currentWaveFoes.push(f);
        allSpawnedFoes.push(f);
      });
    }
  }

  function updateBossMechanics(dt) {
    if (!bossFoe || !isAlive(bossFoe)) return;
    const hpRatio = (bossFoe.entity.health || 0) / Math.max(1, bossFoe.entity.maxHealth || 1);
    if (bossPhase === 1 && hpRatio <= 0.66) {
      bossPhase = 2;
      bossFoe.hitFlash = 0.5;
      say?.(t('apotheosis.siege.bossPhase2', 'The Aspect of the Tower tears at time itself (Phase 2)!'));
      spawnPhaseAdds(2);
      spawnTelegraphAtPlayer(3.8, 1.7);
    } else if (bossPhase === 2 && hpRatio <= 0.33) {
      bossPhase = 3;
      bossFoe.hitFlash = 0.6;
      bossFoe.entity.damageScale = (bossFoe.entity.damageScale ?? 1.85) * 1.15;
      say?.(t('apotheosis.siege.bossPhase3', 'The Aspect of the Tower burns with Aetherial wrath (Phase 3)!'));
      spawnPhaseAdds(3);
      spawnTelegraphAtPlayer(4.2, 1.5);
    }

    telegraphCooldown -= dt;
    if (telegraphCooldown <= 0) {
      const count = bossPhase >= 3 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        spawnTelegraphAtPlayer(bossPhase >= 3 ? 4.0 : 3.4, bossPhase >= 3 ? 1.5 : 1.85);
      }
      telegraphCooldown = bossPhase >= 3 ? 3.2 : bossPhase === 2 ? 4.2 : 5.4;
    }
  }

  function tickTelegraphs(dt) {
    const p = getPlayerPos?.();
    const kept = [];
    for (const tg of telegraphs) {
      tg.elapsed += dt;
      if (tg.elapsed >= tg.duration) {
        if (p) {
          const dist = Math.hypot(p[0] - tg.origin[0], p[2] - tg.origin[2]);
          if (dist <= tg.r) {
            const dmg = 26 + bossPhase * 12;
            hurtPlayer?.(dmg);
            flashDamage?.(dmg);
          }
        }
      } else {
        kept.push(tg);
      }
    }
    telegraphs = kept;
  }

  return {
    get active() { return active; },
    get wave() { return wave; },
    get bossPhase() { return bossPhase; },
    get waveTimer() { return waveTimer; },
    get bossFoe() { return bossFoe; },
    get anchor() { return anchor ? [...anchor] : null; },
    start({ startWaveNum = 1, anchorPos = null } = {}) {
      const state = ensureApotheosisState(playerEntity);
      if (state.stage !== APOTHEOSIS_STAGES.QUESTLINE_ACTIVE) return false;
      if (state.towerSiegeCleared) return false;
      if (active && startWaveNum <= wave) return true;
      if (active) despawnAll();
      epoch++;
      active = true;
      anchor = anchorPos ? [...anchorPos] : [...(getPlayerPos?.() ?? [0, 0, 0])];
      advanceApotheosisQuestStep(playerEntity, APOTHEOSIS_QUEST_STEPS.TOWER_SIEGE);
      startWave(startWaveNum);
      return true;
    },
    abandon(reason = null) {
      if (!active) return false;
      epoch++;
      despawnAll(reason ?? t(
        'apotheosis.siege.abandoned',
        'You retreated from Direnni Tower — the siege dissipates until you challenge the gates again.',
      ));
      return true;
    },
    onModeOrWorldChange() {
      if (active) this.abandon();
    },
    tick(dt) {
      if (!active || !(dt > 0)) return;
      if (getPlayerMode && getPlayerMode() !== 'exterior') {
        this.abandon();
        return;
      }
      const p = getPlayerPos?.();
      if (p && anchor) {
        const dist = Math.hypot(p[0] - anchor[0], p[2] - anchor[2]);
        if (dist > DIRENNI_SIEGE_MAX_DIST_M) {
          this.abandon();
          return;
        }
      }

      tickTelegraphs(dt);

      if (wave < DIRENNI_SIEGE_TOTAL_WAVES) {
        waveTimer += dt;
        const aliveCount = currentWaveFoes.reduce((n, f) => n + (isAlive(f) ? 1 : 0), 0);
        if (spawningCount === 0 && (aliveCount === 0 || waveTimer >= DIRENNI_SIEGE_FALLBACK_S)) {
          startWave(wave + 1);
        }
      } else {
        updateBossMechanics(dt);
        if (spawningCount === 0 && bossFoe && (bossFoe.dead || !isAlive(bossFoe))) {
          completeSiege();
        }
      }
    },
    getTelegraphDrawables() {
      const tNow = nowSec();
      return telegraphs.map((tg) => ({
        blow: {
          kind: 'slam',
          technique: true,
          origin: tg.origin,
          yaw: 0,
          slope: [0, 0],
          r: tg.r,
          ahead: 0,
          start: tg.start,
          land: tg.start + tg.duration,
          color: tg.color,
        },
        phase: {
          t: Math.min(1, tg.elapsed / Math.max(0.05, tg.duration)),
          flash: tg.elapsed >= tg.duration * 0.85 ? 1 : 0,
          cut: 0,
          shatter: 0,
        },
        nearFloor: Math.max(0, 1 - Math.abs((getPlayerPos?.()?.[1] ?? tg.origin[1]) - tg.origin[1]) / 3),
        _t: tNow,
      }));
    },
  };
}

/**
 * Computes a reachable Zero Stone placement inside Direnni Tower.
 * Prefers a distant enemy/layout marker (24..55m) or falls back ahead of startMarker.
 */
export function pickZeroStoneSpot(startPos, enemies = [], collider = null) {
  const base = startPos ?? [0, 0, 0];
  let best = null;
  let bestScore = -1;
  for (const e of enemies) {
    if (!Number.isFinite(e?.x) || !Number.isFinite(e?.y) || !Number.isFinite(e?.z)) continue;
    const d = Math.hypot(e.x - base[0], e.z - base[2]);
    if (d < 12) continue;
    const score = d <= 55 ? d : 55 - (d - 55) * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = [e.x, e.y, e.z];
    }
  }
  if (!best) best = [base[0], base[1], base[2] + 8];
  if (collider?.raycast) {
    const down = collider.raycast([best[0], best[1] + 1.5, best[2]], [0, -1, 0], 6);
    if (Number.isFinite(down)) best[1] = best[1] + 1.5 - down;
  }
  return best;
}

/**
 * Periodic interior reinforcement spawner scoped exclusively to Direnni Hard-Mode.
 */
export function createDirenniInteriorReinforcer({
  isActive,
  getPlayerPos,
  getFoes,
  spawnLooseFoe,
  say,
} = {}) {
  let timer = 0;
  let spawning = false;
  let announced = false;
  const mobs = [MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.FireAtronach, MOBILE_TYPES.DaedraLord, MOBILE_TYPES.Daedroth];

  return {
    tick(dt) {
      if (!isActive?.() || !(dt > 0)) return;
      if (!announced) {
        announced = true;
        say?.(t(
          'apotheosis.tower.hardModeEntered',
          'Direnni Tower trembles under the Dragon Break — seek the Zero Stone within!',
        ));
      }
      timer += dt;
      if (timer < DIRENNI_INTERIOR_SPAWN_INTERVAL_S || spawning) return;
      timer = 0;
      const foes = getFoes?.() ?? [];
      const liveCount = foes.reduce((n, f) => n + (!f.dead && !f._gone && f.entity?.team !== 'PlayerAlly' ? 1 : 0), 0);
      if (liveCount >= DIRENNI_INTERIOR_MAX_ACTIVE) return;
      const p = getPlayerPos?.();
      if (!p || !spawnLooseFoe) return;
      spawning = true;
      const ang = Math.random() * Math.PI * 2;
      const mt = mobs[Math.floor(Math.random() * mobs.length)];
      const pos = [p[0] + Math.cos(ang) * 7.5, p[1] + 0.3, p[2] + Math.sin(ang) * 7.5];
      Promise.resolve(spawnLooseFoe(mt, pos, { feetGiven: false }))
        .then((f) => {
          if (f?.entity) applyDirenniForcedTraits(f.entity);
        })
        .catch(() => {})
        .finally(() => { spawning = false; });
    },
  };
}

/**
 * Copies player build stats & equipped gear onto the Shadow of the Agent
 * and arms `entity.shadowResist` against all high (>100) or top skills.
 */
export function configureShadowEntity(shadowEntity, playerEntity) {
  if (!shadowEntity || !playerEntity) return shadowEntity;
  shadowEntity.name = t('apotheosis.shadow.name', 'Shadow of the Agent');
  shadowEntity.shadowBoss = true;
  shadowEntity.noLootDrop = true;
  shadowEntity.items = [];
  shadowEntity.level = Math.max(15, effectiveLevel(playerEntity));
  shadowEntity.maxHealth = Math.max(1200, Math.round((playerEntity.maxHealth || 250) * 5.2));
  shadowEntity.health = shadowEntity.maxHealth;
  shadowEntity.maxMagicka = Math.max(400, playerEntity.maxMagicka || 200);
  shadowEntity.magicka = shadowEntity.maxMagicka;
  shadowEntity.damageScale = Math.max(shadowEntity.damageScale ?? 1, 1.75);

  if (shadowEntity.stats && playerEntity.stats) {
    for (const key of Object.keys(shadowEntity.stats)) {
      const pVal = playerEntity.stats[key];
      if (Number.isFinite(pVal)) {
        shadowEntity.stats[key] = Math.max(shadowEntity.stats[key] ?? 50, pVal);
      }
    }
  }

  const pEq = equipTableOf(playerEntity);
  const sEq = equipTableOf(shadowEntity);
  if (pEq && sEq) {
    for (const slot of Object.values(EQUIP_SLOTS)) {
      if (pEq[slot]) sEq[slot] = { ...pEq[slot], value: 0, shadowClone: true };
    }
  }

  giveBossTraits(shadowEntity, rollBossTraits(2, Math.random), { own: true });
  shadowEntity.shadowResist = computeShadowResistProfile(playerEntity);
  return shadowEntity;
}

/** Formats human-readable resistance warning for the Shadow boss fight. */
export function describeShadowResistances(profile) {
  if (!profile) return '';
  const all = profile.allSkills ?? [...(profile.martialSkills ?? []), ...(profile.magicSkills ?? []), ...(profile.magicSchools ?? [])];
  const names = all.map((id) => SKILL_NAMES[id]).filter(Boolean);
  return names.join(', ');
}

/**
 * Picks humanoid Shadow archetype closest to player's dominant discipline.
 */
export function pickShadowMobileType(playerEntity) {
  const int = liveStat(playerEntity, 'intelligence');
  const wp = liveStat(playerEntity, 'willpower');
  const str = liveStat(playerEntity, 'strength');
  if (int + wp > str * 2.1) return MOBILE_TYPES.Sorcerer;
  if (int > 70) return MOBILE_TYPES.Battlemage;
  return MOBILE_TYPES.Knight;
}

/**
 * Spawns and monitors the Shadow of the Agent in the Cut Clockwork Orrery.
 */
export async function spawnShadowOfTheAgent({
  spawnLooseFoe,
  playerEntity,
  spawnPos = [0, 0, -14],
  say,
} = {}) {
  if (!spawnLooseFoe || !playerEntity) return null;
  const mobileType = pickShadowMobileType(playerEntity);
  const f = await spawnLooseFoe(mobileType, spawnPos, {
    yawRad: 0,
    feetGiven: true,
    level: Math.max(15, effectiveLevel(playerEntity)),
  });
  if (!f?.entity) return null;
  configureShadowEntity(f.entity, playerEntity);
  f.hitFlash = 0.55;
  const resisted = describeShadowResistances(f.entity.shadowResist);
  say?.(t(
    'apotheosis.shadow.engaged',
    'The Shadow of the Agent rises! It resists 70% of damage from your mastery ({skills}).',
    { skills: resisted || SKILL_NAMES[SKILLS.LongBlade] },
  ));
  return f;
}
