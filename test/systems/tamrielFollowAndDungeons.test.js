// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  N,
  NE,
  E,
  S,
  T_SIZE,
  MP_WORLD_UNITS,
  mapPixelWorldOrigin,
  playerOnPathAt,
  playerOnCurvedPath,
  closestForwardDirection,
} from '../../src/systems/travel/travelPaths.js';
import { createTravelOptions } from '../../src/systems/travel/travelOptions.js';
import { LOCATION_TYPES, DUNGEON_TYPES } from '../../src/formats/mapsFile.js';
import { collectProvinceDungeons } from '../../src/systems/living/provinceDungeonPool.js';
import {
  setRegionalDungeonProvider,
  tickAdventurerSimulation,
  getDungeonActiveAdventurer,
  isDungeonInCooldown,
  getAdventurerSimRegistry,
  ADVENTURER_STATUS,
} from '../../src/systems/living/adventurerSim.js';
import { getLivingDirectorState } from '../../src/systems/living/livingDirector.js';
import { lairCellOf, lairSite } from '../../src/world/tamrielDungeons.js';
import { arenaRoadByte } from '../../src/world/arenaRoads.js';
import { setRoadsPastTable } from '../../src/world/road/pathData.js';

test('Problem1: playerOnCurvedPath and playerOnPathAt detect VOYAGER2 curved roads outside Iliac Bay', () => {
  // On a 90-degree bend (S | E), the quadratic curve [64,0 -> 64,64 -> 128,64] passes at t=0.5 through (80, 48),
  // which is ~16 tiles (4096 world units) SE of Basic Roads' straight center cross (64, 64).
  const px = -120;
  const py = 240;
  const origin = mapPixelWorldOrigin(px, py);
  const curveApexX = origin.x + 80 * T_SIZE;
  const curveApexZ = origin.z + 48 * T_SIZE;

  // Outside Bay: curved path must be detected at (80, 48) tiles!
  const maskPastBay = playerOnPathAt(S | E, curveApexX, curveApexZ, px, py);
  assert.equal(maskPastBay, S | E, 'Past-Bay curved road S|E must detect player on curve apex');

  // Inside Bay: Hazelnut straight-arm check must still return 0 at (80, 48)
  const bayOrigin = mapPixelWorldOrigin(200, 200);
  assert.equal(
    playerOnPathAt(S | E, bayOrigin.x + 80 * T_SIZE, bayOrigin.z + 48 * T_SIZE, 200, 200),
    0,
    'Bay pixels keep exact Hazelnut straight-arm detection',
  );

  // Far off-road outside Bay returns 0
  assert.equal(playerOnCurvedPath(S | E, 10 * T_SIZE, 110 * T_SIZE), 0);
});

test('Problem1: closestForwardDirection and followPath follow curved past-Bay roads even at intermediate headings', () => {
  assert.equal(closestForwardDirection(S | E, 45, 67.5), E);
  assert.equal(closestForwardDirection(S | NE, 25, 67.5), NE);
  assert.equal(closestForwardDirection(S | E, 340, 67.5), 0);

  const px = -150;
  const py = -40;
  const origin = mapPixelWorldOrigin(px, py);
  const net = {
    width: 1000,
    height: 500,
    roads: new Uint8Array(1000 * 500),
    tracks: new Uint8Array(1000 * 500),
  };

  setRoadsPastTable((kind) => (kind === 'roads' ? S | NE : 0));
  try {
    // Player stands on the S|NE curve near (76, 80) tiles facing NNE (25 deg)
    let curYaw = 25;
    const to = createTravelOptions({
      settings: {
        roadsIntegration: true,
        roadsJunctionMap: false,
        toggleMapOffPaths: false,
        cautiousTravelMultiplier: 0.8,
        recklessTravelMultiplier: 1,
      },
      worldPos: () => ({ x: origin.x + 80 * T_SIZE, z: origin.z + 64 * T_SIZE }),
      mapPixel: () => ({ x: px, y: py }),
      yaw: () => curYaw,
      worldTimeScale: () => 1,
      setTimeScale: () => {},
      roads: () => net,
      locationTileRect: () => null,
      hasCurrentLocation: () => false,
      say: () => {},
    });

    assert.equal(to.followPath(), true, 'Follow Paths (K) on curved past-Bay S|NE road at 25deg yaw must succeed');
    assert.equal(to.state.walk, 'path');
    assert.equal(to.state.road, true);
    assert.deepEqual(to.state.autopilot?.destinationMapPixel, { x: px + 1, y: py - 1 });
    to.clearTravelDestination();

    // Off-road position still fails cleanly
    const offRoad = createTravelOptions({
      settings: {
        roadsIntegration: true,
        roadsJunctionMap: false,
        toggleMapOffPaths: false,
        cautiousTravelMultiplier: 0.8,
        recklessTravelMultiplier: 1,
      },
      worldPos: () => ({ x: origin.x + 8 * T_SIZE, z: origin.z + 8 * T_SIZE }),
      mapPixel: () => ({ x: px, y: py }),
      yaw: () => 0,
      worldTimeScale: () => 1,
      setTimeScale: () => {},
      roads: () => net,
      locationTileRect: () => null,
      hasCurrentLocation: () => false,
      say: () => {},
    });
    assert.equal(offRoad.followPath(), false);
  } finally {
    setRoadsPastTable(arenaRoadByte);
    assert.ok(MP_WORLD_UNITS > 0 && N > 0);
  }
});

test('Problem2: collectProvinceDungeons gathers real map lairs and adventurerSim uses real mapId & cooldowns', () => {
  const skyrimRegion = 64;
  const settlements = [{ px: 500, py: -80, region: skyrimRegion }];
  const fakeLairs = new Map();

  // Populate 3 real lair cells near (500, -80) and 1 TownCity (which must be excluded)
  const c0 = lairCellOf(500, -80);
  const c1 = lairCellOf(508, -80);
  const c2 = lairCellOf(500, -88);
  const s0 = lairSite(c0);
  const s1 = lairSite(c1);
  const s2 = lairSite(c2);

  fakeLairs.set(`${s0.px},${s0.py}`, {
    mapId: 0x90081001,
    name: 'The Barrow of Olaf',
    region: skyrimRegion,
    type: LOCATION_TYPES.DungeonLabyrinth,
    dungeonType: DUNGEON_TYPES.Crypt,
    hasDungeon: true,
    px: s0.px,
    py: s0.py,
  });
  fakeLairs.set(`${s1.px},${s1.py}`, {
    mapId: 0x90081002,
    name: 'Ruins of Soljund',
    region: skyrimRegion,
    type: LOCATION_TYPES.DungeonRuin,
    dungeonType: DUNGEON_TYPES.Mine,
    hasDungeon: true,
    px: s1.px,
    py: s1.py,
  });
  fakeLairs.set(`${s2.px},${s2.py}`, {
    mapId: 0x90081003,
    name: 'Solitude Palace',
    region: skyrimRegion,
    type: LOCATION_TYPES.TownCity,
    hasDungeon: true,
    px: s2.px,
    py: s2.py,
  });

  const collected = collectProvinceDungeons(skyrimRegion, {
    settlements,
    placeAt: (x, y) => fakeLairs.get(`${x},${y}`) ?? null,
    lairCellOf,
    lairSite,
    maxCount: 24,
    ringRadius: 2,
  });

  assert.equal(collected.length, 2, 'Only real lairs (not TownCity) are collected');
  assert.equal(collected[0].name, 'The Barrow of Olaf');
  assert.equal(collected[0].type, 'Crypt');
  assert.equal(collected[1].name, 'Ruins of Soljund');
  assert.equal(collected[1].type, 'Mine');

  const root = getLivingDirectorState();
  const prevAdv = JSON.stringify(root.subsystems.adventurers ?? {});
  try {
    const reg = getAdventurerSimRegistry();
    reg.pool = [
      {
        id: 5001,
        name: 'Jorund the Warrior',
        className: 'Warrior',
        trait: 'HONORABLE',
        level: 5,
        gearTier: 2,
        currentRegion: skyrimRegion,
        targetLocationId: null,
        status: ADVENTURER_STATUS.IDLE,
        daysRemainingInAction: 0,
        delveSuccessCount: 0,
        duelsWon: 0,
        duelsLost: 0,
      },
    ];
    reg.dungeonCooldowns = {};
    reg.fallenRemains = {};
    reg.interceptedQuests = {};

    setRegionalDungeonProvider((r) => (r === skyrimRegion ? collected : null));

    // Roll 0.1 -> delve, slot 0 -> 'The Barrow of Olaf [Crypt]' with real mapId
    tickAdventurerSimulation({ rng: () => 0.1 });
    const adv = reg.pool[0];
    assert.equal(adv.status, ADVENTURER_STATUS.DELVING);
    assert.equal(adv.targetLocationId, 0x90081001);
    assert.equal(adv.targetLocationName, 'The Barrow of Olaf [Crypt]');
    assert.deepEqual(adv.targetPixel, { x: s0.px, y: s0.py });

    const activeHit = getDungeonActiveAdventurer(0x90081001, skyrimRegion);
    assert.equal(activeHit?.adv?.id, 5001, 'getDungeonActiveAdventurer matches real province dungeon mapId');

    // Finish delve -> real mapId enters cooldown
    adv.daysRemainingInAction = 1;
    tickAdventurerSimulation({ rng: () => 0.1 });
    assert.equal(isDungeonInCooldown(0x90081001, skyrimRegion), true);
  } finally {
    setRegionalDungeonProvider(null);
    root.subsystems.adventurers = JSON.parse(prevAdv);
  }
});
