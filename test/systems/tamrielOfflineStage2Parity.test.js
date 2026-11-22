// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import { CRISIS_EVENTS, matchLivingCrisisEvent } from '../../src/systems/living/crisisRegistry.js';
import { setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE, getRegionState } from '../../src/systems/living/regionState.js';

const clearCrises = (regs) => {
  for (const r of regs) setRegionCrisis(r, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
};
import { parseCrisisTpQuery } from '../../src/systems/living/crisisTpQuery.js';
import { REGION_NAMES } from '../../src/formats/mapsTables.js';
import { LOCATION_TYPES } from '../../src/formats/mapsFile.js';
import { REGION_FLAGS } from '../../src/systems/region/regionConditions.js';
import {
  findSafeLandInterruptSpot,
  selectInterruptRegion,
  resolveInterruptLanding,
} from '../../src/systems/living/travelInterruptSpot.js';
import { hasPort, hasPortFor, setWorldPorts, setSeatHarbours } from '../../src/systems/travel/travelPorts.js';
import { enforceShipRestriction } from '../../src/ui/travel/travelPopUp.js';
import { planRoute } from '../../src/systems/travel/travelRoute.js';
import { createTravelOptions } from '../../src/systems/travel/travelOptions.js';
import { E, W, mapPixelWorldOrigin, P_SIZE } from '../../src/systems/travel/travelPaths.js';

const TO_PORT_SETTINGS = Object.freeze({
  shipTravelPortsOnly: true,
  shipTravelDestinationPortsOnly: true,
  targetCoordsAllowed: true,
  cautiousTravel: true,
  stopAtInnsTravel: false,
  cautiousTravelMultiplier: 0.8,
  recklessTravelMultiplier: 1,
  teleportCost: false,
});

test('Stage2-Fix1: EVT_WAR_ORSINIUM_RAID restricted to Iliac Bay + High Rock + Hammerfell (0..63), excluded in Skyrim & far provinces', () => {
  assert.equal(CRISIS_EVENTS.length, 41);
  const regs = [17, 20, 62, 63, 64, 65, 66, 69, 70];
  clearCrises(regs);
  try {
    for (const reg of regs) {
      setRegionCrisis(reg, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
    }

    const warAllowedCount = (reg) => {
      const hits = new Set();
      for (let i = 0; i < 40; i++) {
        const evt = matchLivingCrisisEvent({
          regionIndex: reg,
          locationType: LOCATION_TYPES.TownCity,
          rng: () => (i + 0.01) / 40,
        });
        if (evt) hits.add(evt.id);
      }
      return hits;
    };

    // High Rock (62), Hammerfell (63), Iliac Bay (17, 20) can roll Orsinium raid
    assert.ok(warAllowedCount(17).has('EVT_WAR_ORSINIUM_RAID'));
    assert.ok(warAllowedCount(62).has('EVT_WAR_ORSINIUM_RAID'));
    assert.ok(warAllowedCount(63).has('EVT_WAR_ORSINIUM_RAID'));

    // Skyrim (64), Morrowind (65), Sumurset (66), Black Marsh (69), Cyrodiil (70) never roll Orsinium raid
    for (const farReg of [64, 65, 66, 69, 70]) {
      const hits = warAllowedCount(farReg);
      assert.equal(hits.has('EVT_WAR_ORSINIUM_RAID'), false, `Region ${farReg} must not roll EVT_WAR_ORSINIUM_RAID`);
      assert.ok(hits.has('EVT_WAR_INTERPROVINCIAL'), `Region ${farReg} still rolls normal WAR events`);
    }

    // Explicit forcedEventId still works anywhere
    const forced = matchLivingCrisisEvent({
      regionIndex: 64,
      locationType: LOCATION_TYPES.TownCity,
      forcedEventId: 'EVT_WAR_ORSINIUM_RAID',
    });
    assert.equal(forced?.id, 'EVT_WAR_ORSINIUM_RAID');
  } finally {
    clearCrises(regs);
  }
});

test('Stage2-Fix2: parseCrisisTpQuery handles type, region number, province name, beyond/bay, and unknown targets', () => {
  const empty = parseCrisisTpQuery(null, REGION_NAMES, REGION_FLAGS);
  assert.equal(empty.filterType, null);
  assert.equal(empty.target, null);

  const typeOnly = parseCrisisTpQuery(['famine'], REGION_NAMES, REGION_FLAGS);
  assert.equal(typeOnly.filterType, 'famine');
  assert.equal(typeOnly.target, null);

  const famineBeyond = parseCrisisTpQuery(['famine', 'beyond'], REGION_NAMES, REGION_FLAGS);
  assert.equal(famineBeyond.filterType, 'famine');
  assert.equal(famineBeyond.target?.kind, 'beyond');
  assert.equal(famineBeyond.target?.matches(65), true);
  assert.equal(famineBeyond.target?.matches(17), false);

  const famineMultiWord = parseCrisisTpQuery(['famine', 'high', 'rock'], REGION_NAMES, REGION_FLAGS);
  assert.equal(famineMultiWord.filterType, 'famine');
  assert.equal(famineMultiWord.target?.regionIndex, 62);

  const directProvince = parseCrisisTpQuery(['morrowind'], REGION_NAMES, REGION_FLAGS);
  assert.equal(directProvince.filterType, null);
  assert.equal(directProvince.target?.regionIndex, 65);

  const directAlias = parseCrisisTpQuery(['summerset'], REGION_NAMES, REGION_FLAGS);
  assert.equal(directAlias.filterType, null);
  assert.equal(directAlias.target?.regionIndex, 66);

  const directNumber = parseCrisisTpQuery(['65'], REGION_NAMES, REGION_FLAGS);
  assert.equal(directNumber.filterType, null);
  assert.equal(directNumber.target?.regionIndex, 65);

  const flagAndScope = parseCrisisTpQuery(['WitchBurnings', 'skyrim'], REGION_NAMES, REGION_FLAGS);
  assert.equal(flagAndScope.filterType, 'witchburnings');
  assert.equal(flagAndScope.target?.regionIndex, 64);

  const badTarget = parseCrisisTpQuery(['war', 'narnia'], REGION_NAMES, REGION_FLAGS);
  assert.equal(badTarget.unknownTarget, 'narnia');
});

test('Stage2-A3: findSafeLandInterruptSpot, selectInterruptRegion, and resolveInterruptLanding avoid ocean and Ghostfence', () => {
  // Concave coast: midpoint (5, 0) is ocean, (2, 0) / (8, 0) are dry land
  const waterMid = findSafeLandInterruptSpot(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { isWater: (x) => x >= 3 && x <= 7 },
  );
  assert.ok(waterMid.pixel);
  assert.equal(waterMid.hasWater, true);
  assert.equal(waterMid.allWater, false);
  assert.ok(waterMid.pixel.x < 3 || waterMid.pixel.x > 7, 'Must never pick an ocean pixel');

  // Ghostfence blocked midpoint (5, 0) snaps outside Ghostfence
  const fenceMid = findSafeLandInterruptSpot(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { isWater: () => false, isBlocked: (x) => x >= 4 && x <= 6 },
  );
  assert.ok(fenceMid.pixel);
  assert.ok(fenceMid.pixel.x < 4 || fenceMid.pixel.x > 6, 'Must never land inside Ghostfence');

  // Pure open-sea crossing has no land spot
  const openSea = findSafeLandInterruptSpot(
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { isWater: () => true },
  );
  assert.equal(openSea.pixel, null);
  assert.equal(openSea.allWater, true);

  // Maritime WEATHER_HAZARD lands at destination harbor instead of ocean
  const seaStorm = resolveInterruptLanding({
    eventType: 'WEATHER_HAZARD',
    spot: openSea,
    destPixel: { x: 200, y: 300 },
    computedMinutes: 1440,
    sailingNow: false,
    travelShip: true,
  });
  assert.deepEqual(seaStorm, { x: 200, y: 300, minutes: 1440, landedAtDestination: true });

  // Land ambush lands on safe dry spot with scaled minutes
  const landAmbush = resolveInterruptLanding({
    eventType: 'AMBUSH',
    spot: waterMid,
    destPixel: { x: 10, y: 0 },
    computedMinutes: 1000,
    sailingNow: false,
    travelShip: false,
  });
  assert.ok(landAmbush);
  assert.equal(landAmbush.landedAtDestination, false);
  assert.equal(landAmbush.x, waterMid.pixel.x);
  assert.ok(landAmbush.minutes >= 200 && landAmbush.minutes <= 850);

  // selectInterruptRegion picks highest-tension/crisis region along route
  clearCrises([17, 65, 64]);
  try {
    setRegionCrisis(65, CRISIS_TYPE.WAR, CRISIS_PHASE.PEAK);
    const chosen = selectInterruptRegion([17, 65, 64], getRegionState);
    assert.equal(chosen, 65);
  } finally {
    clearCrises([17, 65, 64]);
  }
});

test('Stage2-B1: setWorldPorts extends hasPortFor for past-Bay ports without altering Bay-only hasPort', () => {
  const PAST_BAY_PORT_ID = 0x90001234 >>> 0;
  const PAST_BAY_INLAND_ID = 0x90005678 >>> 0;
  try {
    assert.equal(hasPort(PAST_BAY_PORT_ID), false);
    assert.equal(hasPortFor(PAST_BAY_PORT_ID), false);

    setWorldPorts((id) => (id >>> 0) === PAST_BAY_PORT_ID);

    assert.equal(hasPort(PAST_BAY_PORT_ID), false, 'Bay-only hasPort table stays untouched');
    assert.equal(hasPortFor(PAST_BAY_PORT_ID), true, 'hasPortFor recognizes past-Bay port');
    assert.equal(hasPortFor(PAST_BAY_INLAND_ID), false, 'Past-Bay inland town stays non-port');

    const portToPort = enforceShipRestriction(TO_PORT_SETTINGS, { travelShip: true }, {
      currentLocationMapId: 199102, // Whitecroft (Bay port)
      isOnShip: false,
      destinationMapId: PAST_BAY_PORT_ID,
      oceanPixels: 12,
    });
    assert.equal(portToPort.travelShip, true, 'Ship allowed between Bay port and past-Bay port');

    const portToInland = enforceShipRestriction(TO_PORT_SETTINGS, { travelShip: true }, {
      currentLocationMapId: PAST_BAY_PORT_ID,
      isOnShip: false,
      destinationMapId: PAST_BAY_INLAND_ID,
      oceanPixels: 12,
    });
    assert.equal(portToInland.travelShip, false, 'Ship blocked to past-Bay inland town when Only To Ports is on');
  } finally {
    setWorldPorts(null);
    setSeatHarbours(null);
  }
});

test('Stage2-B2: pavedStep respects pathsBeyond road causeways and locationTileRect supports past-Bay Follow Paths', () => {
  // Plan a route crossing the Bay boundary (x = 9 -> 11) where x=10 is water,
  // with a past-Bay road causeway across (9,5)-(10,5)-(11,5)
  const w = 10;
  const h = 10;
  const roads = new Uint8Array(w * h);
  const tracks = new Uint8Array(w * h);
  const beyond = (kind, x, y) => {
    if (kind === 'join' && x === 9 && y === 5) return E;
    if (kind === 'roads' && y === 5) {
      if (x === 10) return W | E;
      if (x === 11) return W;
    }
    return 0;
  };
  const route = planRoute(
    { x: 9, y: 5 },
    { x: 11, y: 5 },
    {
      width: w,
      height: h,
      roads,
      tracks,
      isWater: (x) => x === 10,
      pathsBeyond: beyond,
      noWayBack: true,
    },
  );
  assert.ok(route, 'Past-Bay road causeway must allow crossing water pixel');
  assert.equal(route.pixels.some((p) => p.x === 10 && p.y === 5), true);

  // Track (not road) across the same water pixel must be refused
  const trackBeyond = (kind, x, y) => {
    if (kind === 'tracks' && y === 5) {
      if (x === 9) return E;
      if (x === 10) return W | E;
      if (x === 11) return W;
    }
    return 0;
  };
  const blockedTrack = planRoute(
    { x: 9, y: 5 },
    { x: 11, y: 5 },
    {
      width: w,
      height: h,
      roads,
      tracks,
      isWater: (x) => x === 10,
      pathsBeyond: trackBeyond,
      noWayBack: true,
    },
  );
  assert.equal(blockedTrack, null, 'Past-Bay track over water must not act as a paved causeway');

  // TravelOptions Follow Paths: single-slice past-Bay town enters circumnavigation; multi-slice capital skips ring walk
  const px = -120;
  const py = 240;
  const origin = mapPixelWorldOrigin(px, py);
  // Tile border rect spans tiles 16..112; place player in border ring (between outer and inner inset)
  const tileSize = 256;
  const borderX = origin.x + 17.5 * tileSize;
  const borderZ = origin.z + 64 * tileSize;
  let yaw = 90;
  let curPos = { x: borderX, z: borderZ };
  let multiSlice = false;

  const to = createTravelOptions({
    settings: {
      roadsIntegration: true,
      roadsJunctionMap: false,
      toggleMapOffPaths: false,
      cautiousTravelMultiplier: 0.8,
      recklessTravelMultiplier: 1,
    },
    worldPos: () => curPos,
    mapPixel: () => ({ x: px, y: py }),
    yaw: () => yaw,
    worldTimeScale: () => 1,
    setTimeScale: () => {},
    roads: () => ({
      width: 1000,
      height: 500,
      roads: new Uint8Array(1000 * 500),
      tracks: new Uint8Array(1000 * 500),
      beyond: () => 0,
    }),
    locationTileRect: () => ({
      tileRect: { x: 16, y: 16, width: 96, height: 96 },
      locationType: LOCATION_TYPES.TownCity,
      hasCustomPosition: false,
      multiSlice,
    }),
    hasCurrentLocation: () => true,
    say: () => {},
  });

  to.initLocationRects({ x: px, y: py });
  assert.equal(to.followPath(), true, 'Single-slice past-Bay town border ring must trigger circumnavigation');
  assert.equal(to.state.walk, 'ring');
  to.clearTravelDestination();

  multiSlice = true;
  to.initLocationRects({ x: px, y: py });
  assert.equal(to.followPath(), false, 'Multi-slice capital must skip single-pixel border-ring circumnavigation');
  assert.ok(P_SIZE > 0);
});
