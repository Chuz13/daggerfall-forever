// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  getRegionNeighbors,
  getEnemyProvinceName,
} from '../../src/systems/living/crisisRegistry.js';
import {
  getRegionalDungeonDescriptor,
  isQuestImmuneLocation,
  setRegionalDungeonProvider,
  ILIAC_BAY_DUNGEON_SLOTS,
} from '../../src/systems/living/adventurerSim.js';
import {
  setRegionCrisis,
  CRISIS_TYPE,
  CRISIS_PHASE,
} from '../../src/systems/living/regionState.js';
import { REGION_NAMES } from '../../src/formats/mapsTables.js';
import { HeldMapWindow } from '../../src/ui/heldMap.js';

test('Stage1 LT Parity: getRegionNeighbors connects all 71 regions symmetrically without self-loops', () => {
  for (let r = 0; r < REGION_NAMES.length; r++) {
    const neighbors = getRegionNeighbors(r);
    assert.ok(neighbors.length > 0, `Region ${r} (${REGION_NAMES[r]}) must have at least 1 neighbor`);
    assert.ok(!neighbors.includes(r), `Region ${r} must not list itself as neighbor`);
    for (const n of neighbors) {
      assert.ok(n >= 0 && n < REGION_NAMES.length, `Neighbor ${n} out of range`);
      assert.ok(getRegionNeighbors(n).includes(r), `Border ${r} <-> ${n} must be symmetric`);
    }
  }
  // Verify Sumurset Isle (66) maritime links
  assert.deepEqual([...getRegionNeighbors(66)], [63, 67, 70]);
});

test('Stage1 LT Parity: getEnemyProvinceName returns real neighbors for all provinces (62..70), never Orsinium fallback', () => {
  for (let r = 62; r < REGION_NAMES.length; r++) {
    const neighborNames = new Set(getRegionNeighbors(r).map((id) => REGION_NAMES[id]));
    for (const roll of [0, 0.45, 0.99]) {
      const enemy = getEnemyProvinceName(r, () => roll);
      assert.notEqual(enemy, 'Orsinium', `Province ${r} (${REGION_NAMES[r]}) must not fall back to Orsinium`);
      assert.ok(neighborNames.has(enemy), `Enemy "${enemy}" for ${REGION_NAMES[r]} must be a real neighbor`);
    }
  }
});

test('Stage1 LT Parity: getRegionalDungeonDescriptor uses real map dungeons via provider and falls back cleanly without fake names', () => {
  try {
    setRegionalDungeonProvider((r) =>
      r === 64
        ? [{ mapId: 0x90080001, name: 'Frostwind Barrow', type: 'Crypt', px: 1200, py: -50 }]
        : null,
    );
    const skyrimReal = getRegionalDungeonDescriptor(64, 0);
    assert.equal(skyrimReal.id, 0x90080001);
    assert.equal(skyrimReal.name, 'Frostwind Barrow [Crypt]');
    assert.equal(skyrimReal.isRealMapDungeon, true);

    setRegionalDungeonProvider(null);
    const sk2 = getRegionalDungeonDescriptor(64, 2);
    assert.equal(sk2.id, 'dungeon_64_2');
    assert.equal(sk2.name, 'Skyrim Labyrinth [Labyrinth]');
  } finally {
    setRegionalDungeonProvider(null);
  }
});

test('Stage1 LT Parity: isQuestImmuneLocation matches mapId, locationId, and past-Bay slot keys', () => {
  const skyrimLairId = 0x90001234;
  const slotKey = `dungeon_64_${skyrimLairId % ILIAC_BAY_DUNGEON_SLOTS}`;
  const sites = [{ locationId: skyrimLairId, regionIndex: 64, isMainQuest: false }];
  assert.equal(isQuestImmuneLocation(skyrimLairId, sites, false), true);
  assert.equal(isQuestImmuneLocation(slotKey, sites, false), true);
  assert.equal(isQuestImmuneLocation('dungeon_64_9', sites, false), false);
});

test('Stage1 LT Parity: HeldMapWindow hover shows Living Tamriel & Apotheosis tooltips outside Iliac Bay', () => {
  setRegionCrisis(64, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
  try {
    const fakePlayer = {
      apotheosis: {
        stage: 3,
        ascended: true,
        pantheon: {
          regions: Object.fromEntries([[64, { player: 72, akatosh: 28 }]]),
        },
      },
    };
    let hoverKind = 'land';
    const fakeWin = Object.create(HeldMapWindow.prototype);
    fakeWin._tamriel = true;
    fakeWin._zoneMap = false;
    fakeWin._view = { ox: 0, oy: 0, scale: 1 };
    fakeWin._size = { width: 1000, height: 500 };
    fakeWin.teleportationTravel = false;
    fakeWin.deps = {
      maps: {
        regionCount: 62,
        getPoliticIndex: () => 128 + 64,
      },
      playerEntity: () => fakePlayer,
      townTipAt: ({ mapId }) => (mapId === 999001 ? { title: 'Whiterun', lines: ['Booming (+3)', 'At War'] } : null),
      seatAt: () => null,
      oreAt: () => null,
    };
    fakeWin._onSheet = () => true;
    fakeWin._waypointHover = () => null;
    fakeWin._partyAt = () => null;
    fakeWin._markerAt = () => null;
    fakeWin._questAt = () => null;
    fakeWin._ringCoreAt = () => null;
    fakeWin._raidAt = () => null;
    fakeWin._starAt = () => null;
    fakeWin._fissureAt = () => null;
    fakeWin._gateAt = () => null;
    fakeWin._zoneLaws = () => false;
    fakeWin._walksPastBay = () => false;
    fakeWin._travelsPastBay = () => false;
    fakeWin._pastBayPressPick = () => null;
    fakeWin._pastBayHover = () => {
      if (hoverKind === 'land') return { on: 'land', label: 'Skyrim' };
      if (hoverKind === 'city') return { on: 'city', label: 'Skyrim : Whiterun', city: { name: 'Whiterun', mapId: 999001, pixel: { x: 1500, y: -200 } } };
      if (hoverKind === 'sea') return { on: 'sea', label: 'Sea of Ghosts' };
      return null;
    };

    // 1. Land hover in Skyrim shows war crisis + Apotheosis dominion
    hoverKind = 'land';
    const landRes = fakeWin._hoverLabel(1500, -200);
    assert.equal(landRes?.label, 'Skyrim');
    assert.ok(landRes?.tip, 'Land hover past the Bay must include tip');
    assert.ok(landRes.tip.lines.some((l) => /Dominion:/i.test(l)), 'Land tip includes Apotheosis dominion');
    assert.ok(landRes.tip.lines.some((l) => /war|weapons|arms|conflict|siege/i.test(l)), 'Land tip includes LT crisis line');

    // 2. City hover past the Bay uses townTipAt({ mapId })
    hoverKind = 'city';
    const cityRes = fakeWin._hoverLabel(1500, -200);
    assert.equal(cityRes?.label, 'Skyrim : Whiterun');
    assert.ok(cityRes?.tip?.lines?.includes('Booming (+3)'), 'City hover shows townTipAt prosperity line');

    // 3. Sea hover returns no crisis tip
    hoverKind = 'sea';
    const seaRes = fakeWin._hoverLabel(1500, -200);
    assert.equal(seaRes?.label, 'Sea of Ghosts');
    assert.equal(seaRes?.tip, undefined);
  } finally {
    setRegionCrisis(64, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  }
});

test('Stage1 LT Parity: world.js emits mapId for quest sites and tele2crisis falls back to worldPlaces.inTheatre', () => {
  const worldSrc = readFileSync(new URL('../../src/scenes/world.js', import.meta.url), 'utf8');
  assert.match(worldSrc, /setLivingQuestSitesProvider\(\(\) => \{[\s\S]{0,400}mapId:\s*p\.mapId,/);
  const teleArm = worldSrc.slice(worldSrc.indexOf('tele2crisis: async'), worldSrc.indexOf('spawnFoe: async'));
  assert.match(teleArm, /worldPlaces\?\.inTheatre\?\.\(theatre\)/);
});
