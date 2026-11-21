// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  offlineStarSpoilsList,
  rollOfflineStarSpoils,
  OFFLINE_STARFALL_LOOT_CONFIG,
} from '../../../src/systems/starfall/offlineStarfallLoot.js';
import {
  shouldRollStarToday,
  pickOfflineStarPixel,
  spawnOfflineStar,
  offlineStarSiteOf,
  stepOfflineStarClock,
  stepOfflineLedger,
  recordOfflineStarHeld,
  starSearchRing,
  getOfflineStarfallState,
  _resetOfflineStarfallForTests,
  OFFLINE_STARFALL_MIN_LEVEL,
  OFFLINE_LIFE_MS,
  OFFLINE_FAST_TRAVEL_MIN_LEFT_MS,
} from '../../../src/systems/starfall/offlineStarfall.js';
import { isStarglass } from '../../../src/systems/starfall/starglass.js';
import { itemFindings } from '../../../src/systems/item/itemLaw.js';
import { setPref } from '../../../src/systems/uiPrefs.js';
import { P_GATHER, P_WAVE, P_BREATH, P_MASTER, P_HELD, starTimes } from '../../../src/net/starfall/starfallLaw.js';
import { createStarfallHost, STAR_FLASH_LIGHT_M } from '../../../src/scenes/starfall/starfallHost.js';
import { STAR_FLASH_W } from '../../../src/render/starfall/starfallPass.js';
import { starTrackerModel } from '../../../src/systems/starfall/starfallClient.js';

function makeScan() {
  const byRegion = new Map();
  // Region 42 (Daggerfall): pixels around (100, 100)
  const list = [];
  for (let dy = -6; dy <= 6; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= 2) {
        list.push((100 + dy) * 1000 + (100 + dx));
      }
    }
  }
  byRegion.set(42, Int32Array.from(list));
  const towns = [{ name: 'Daggerfall', px: 100, py: 100, region: 42 }];
  const townAt = new Int32Array(1000 * 500).fill(0);
  return { byRegion, towns, townAt };
}

test('1. offlineStarfallLoot respects Lv 1-5 / Lv 6-11 / Lv 12+ curve and itemLaw', () => {
  const lv4 = rollOfflineStarSpoils({ seed: 12345, level: 4, heart: false });
  assert.ok(lv4.gold > 0);
  assert.equal(lv4.starglass, null, 'No Starfall Glass below Lv 6');
  assert.equal(lv4.pieces.length, 1, 'Only Magic+ item below Lv 12');
  assert.deepEqual(itemFindings(lv4.pieces[0].item), []);

  const lv8 = rollOfflineStarSpoils({ seed: 12345, level: 8, heart: false });
  assert.ok(isStarglass(lv8.starglass), 'Starfall Glass drops at Lv 6+');
  assert.ok(lv8.starglass.stackCount >= 1 && lv8.starglass.stackCount <= OFFLINE_STARFALL_LOOT_CONFIG.starglassMidMax);
  assert.equal(lv8.pieces.length, 1, 'No Starspun Weave below Lv 12');
  assert.deepEqual(itemFindings(lv8.starglass), []);

  const lv14Heart = rollOfflineStarSpoils({
    seed: 98765,
    level: 14,
    heart: true,
    isFound: (id) => (id === 'starspun-cowl' ? null : 1),
  });
  assert.ok(isStarglass(lv14Heart.starglass));
  assert.ok(lv14Heart.starglass.stackCount >= 2, 'Heart-Star doubles Starfall Glass');
  assert.equal(lv14Heart.pieces.length, 2, 'Heart-Star guarantees Starspun Weave at Lv 12+');
  assert.equal(lv14Heart.pieces[1].item.aetheric, 'starspun-cowl', 'Unfound bias picks missing piece');
  for (const p of lv14Heart.pieces) assert.deepEqual(itemFindings(p.item), []);

  const flat = offlineStarSpoilsList({ seed: 12345, level: 12, heart: true });
  assert.ok(flat.some((x) => x.kind === 'gold'));
  assert.ok(flat.some((x) => x.kind === 'item' && isStarglass(x.item)));
});

test('2. Director pity timer, search ring offset, and dual-clock Fast Travel tolerance', () => {
  _resetOfflineStarfallForTests();
  setPref('offlineStarfall', 'normal');

  assert.equal(shouldRollStarToday(1, () => 0), false, 'Respects startDayMin');
  assert.equal(shouldRollStarToday(10, () => 0.1), true, 'Triggers when roll succeeds past cooldown');

  const scan = makeScan();
  const active = spawnOfflineStar({
    scan,
    playerPx: 100,
    playerPy: 100,
    playerRegion: 42,
    classicMinutes: 10 * 1440,
    rolls: () => 0.5,
  });
  assert.ok(active, 'Spawns active star near player');
  const distToStar = Math.max(Math.abs(active.px - 100), Math.abs(active.py - 100));
  assert.ok(distToStar >= 2 && distToStar <= 8, 'Star is 2..8 px from player');

  const ring = starSearchRing(active.n, active.k, active.px, active.py, active.spot);
  const offset = Math.hypot(ring.gx - ring.cx, ring.gy - ring.cy);
  assert.ok(offset >= 0.39 && offset < ring.r, 'Star is inside search ring, never dead-center');

  // Pause freeze: dtMs = 0 does not advance elapsed
  const beforeEl = active.activeElapsedMs;
  stepOfflineStarClock(active, 0, 10 * 1440, 100, 100);
  assert.equal(active.activeElapsedMs, beforeEl);

  // Short Fast Travel (e.g. 5 game hours to nearby town) preserves star and transitions omen -> fallen
  const stageAfterFt = stepOfflineStarClock(active, 16, 10 * 1440 + 300, 101, 100);
  assert.equal(stageAfterFt, 'fallen');
  assert.ok(active.activeElapsedMs <= 20 * 60_000 - OFFLINE_FAST_TRAVEL_MIN_LEFT_MS);

  // Long Fast Travel (> 36h or > 25 px) expires star
  const expired = stepOfflineStarClock(active, 16, 10 * 1440 + 400, 200, 200);
  assert.equal(expired, 'gone');
  assert.equal(getOfflineStarfallState().active, null);
});

test('3. Local solo ledger clears waves and master without online anti-cheat floor delays', () => {
  _resetOfflineStarfallForTests();
  const scan = makeScan();
  const active = spawnOfflineStar({
    scan,
    playerPx: 100,
    playerPy: 100,
    playerRegion: 42,
    classicMinutes: 5 * 1440,
    startFallen: true,
  });
  assert.ok(active);

  // First word starts gather
  let res = stepOfflineLedger(active, { lv: 10, s: 1, o: 1, kw: 0, kn: 0, wc: 0, hb: 0, mf: 0 }, true);
  assert.equal(res.st.p, P_GATHER);

  // Advance 11s -> Wave 1
  active.activeElapsedMs += 11_000;
  res = stepOfflineLedger(active, { lv: 10, s: 1, o: 1, kw: 0, kn: 0, wc: 0, hb: 0, mf: 0 }, true);
  assert.equal(res.st.p, P_WAVE);
  assert.equal(res.st.w, 1);

  // Instant wave clear (no 10s online floor!)
  res = stepOfflineLedger(active, { lv: 10, s: 1, o: 1, kw: 1, kn: 4, wc: 1, hb: 0, mf: 0 }, true);
  assert.equal(res.st.p, P_BREATH);

  // Fast-forward through waves 2..4 to Master
  for (let w = 2; w <= 4; w++) {
    active.activeElapsedMs += 8_000;
    res = stepOfflineLedger(active, { lv: 10, s: 1, o: 1, kw: w - 1, kn: 0, wc: 0, hb: 0, mf: 0 }, true);
    assert.equal(res.st.p, P_WAVE);
    assert.equal(res.st.w, w);
    res = stepOfflineLedger(active, { lv: 10, s: 1, o: 1, kw: w, kn: 4 + w - 1, wc: w, hb: 0, mf: 0 }, true);
    assert.equal(res.st.p, P_BREATH);
  }

  active.activeElapsedMs += 8_000;
  res = stepOfflineLedger(active, { lv: 10, s: 1, o: 1, kw: 4, kn: 0, wc: 0, hb: 0, mf: 0 }, true);
  assert.equal(res.st.p, P_MASTER);

  // Instant master kill (no 45s online floor!)
  res = stepOfflineLedger(active, { lv: 10, s: 1, o: 1, kw: 4, kn: 0, wc: 0, hb: 0, mf: 1 }, true);
  assert.equal(res.st.p, P_HELD);
  assert.equal(res.heldJustNow, true);

  // Auto-start flag deferred below Lv 6, immediate at Lv 6+
  const lowHold = recordOfflineStarHeld(active, 3);
  assert.equal(lowHold.firstHold, true);
  assert.equal(lowHold.autoStartNow, false);
  assert.equal(getOfflineStarfallState().pendingAutoLine, true);

  active.awarded = false;
  const highHold = recordOfflineStarHeld({ ...active, awarded: false }, OFFLINE_STARFALL_MIN_LEVEL);
  assert.equal(highHold.autoStartNow, true);
});

test('4. Offline fallen star clock does not go negative before fallAt or blow up impact flash', () => {
  _resetOfflineStarfallForTests();
  setPref('offlineStarfall', 'normal');
  const scan = makeScan();
  let nearModel = null;
  const host = createStarfallHost({
    offline: true,
    renderer: null,
    state: { pixelTranslation: (px, py, out) => { out[0] = px * 100; out[1] = 0; out[2] = py * 100; return out; } },
    gateScanOf: () => scan,
    warmGateScan: () => {},
    surfaceAt: () => 0,
    player: { feetAt: () => [100 * 100, 0, 100 * 100] },
    playerPixel: () => ({ x: 100, y: 100 }),
    classicMinutes: () => 10 * 1440,
    walkMode: true,
    playerSpawned: true,
    _questRegionIndex: () => 42,
    gamePaused: () => false,
    townTalk: { hudHidden: false },
  });
  const active = host.spawnDebugStar({ startFallen: true });
  assert.ok(active);
  const site = offlineStarSiteOf(active);

  active.activeElapsedMs = 0;
  host.step();
  const eye = [100 * 100, 2, 100 * 100];
  const lists0 = host.skyLists(eye);
  assert.ok(lists0.glows.length <= 1);
  if (lists0.glows.length === 1) {
    assert.ok(lists0.glows[0].w <= STAR_FLASH_W, `flash width ${lists0.glows[0].w} must not exceed STAR_FLASH_W`);
    assert.ok(lists0.glows[0].light <= 2, `flash light ${lists0.glows[0].light} must not exceed 2`);
  }
  const fl = host.flash();
  assert.ok(fl && fl.range <= STAR_FLASH_LIGHT_M);
  const trackerT = starTimes(active.n, active.k).endAt - OFFLINE_LIFE_MS;
  nearModel = starTrackerModel(site, active.led, trackerT, '', false);
  assert.match(nearModel.left, /20:00/);

  // Past STAR_FLASH_MS: flash glow gone, beacon visible
  active.activeElapsedMs = 2500;
  host.step();
  const lists2500 = host.skyLists(eye);
  assert.equal(lists2500.glows.length, 0);
  assert.equal(lists2500.beacons.length, 1);
  assert.ok(lists2500.beacons[0].fade > 0);
});
