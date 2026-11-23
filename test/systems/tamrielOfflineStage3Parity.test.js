// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  setRegionalDungeonProvider,
  ensureAdventurerPool,
  getAdventurerSimRegistry,
  ADVENTURER_STATUS,
} from '../../src/systems/living/adventurerSim.js';
import { getLivingDirectorState } from '../../src/systems/living/livingDirector.js';
import { capitalPlaceId } from '../../src/world/tamrielCapitals.js';
import { capitalIndexOfId, canonicalCapitalMapId } from '../../src/world/capitalLane.js';
import {
  setSettlementProsperity,
  getSettlementProsperityDelta,
  clearSettlementProsperity,
} from '../../src/systems/living/settlementProsperity.js';
import { calculateLocationProsperity, PROSPERITY_TIER } from '../../src/systems/living/crisisRegistry.js';
import { fabricSliceSites } from '../../src/world/imperialFabricBuildings.js';
import { setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE } from '../../src/systems/living/regionState.js';
import { LivingTamrielConfig, PRESENCE } from '../../src/systems/living/livingConfig.js';
import {
  resolveLocationEventKey,
  createLivingSceneHost,
  LIVING_SITE_KINDS,
} from '../../src/systems/living/livingWorldSpawner.js';
import { HeldMapWindow } from '../../src/ui/heldMap.js';
import { LOCATION_TYPES } from '../../src/formats/mapsFile.js';
import { BUILDING_TYPES } from '../../src/world/buildingNames.js';
import { setTravelMapMarkedMapId, travelMapMarkedMapId } from '../../src/systems/travel/travelMapState.js';

test('Stage3-Fix: upgradeSyntheticProvinceDelves upgrades legacy Skyrim Mine [Mine] delves to real on-map dungeons', () => {
  const root = getLivingDirectorState();
  const prevAdv = JSON.stringify(root.subsystems.adventurers ?? {});
  try {
    const reg = getAdventurerSimRegistry();
    reg.pool = [
      {
        id: 821,
        name: 'Symmachus the Battlemage',
        className: 'Battlemage',
        trait: 'ENVIOUS',
        level: 1,
        gearTier: 1,
        currentRegion: 64,
        targetLocationId: 'dungeon_64_4',
        targetLocationName: 'Skyrim Mine [Mine]',
        targetDungeonType: 'Mine',
        targetPixel: null,
        status: ADVENTURER_STATUS.DELVING,
        daysRemainingInAction: 2,
        delveSuccessCount: 0,
        duelsWon: 0,
        duelsLost: 0,
      },
    ];

    setRegionalDungeonProvider((r) =>
      r === 64
        ? [
            { mapId: 0x90081001, name: 'The Barrow of Olaf', type: 'Crypt', px: 1595, py: -427 },
            { mapId: 0x90081002, name: 'Ruins of Soljund', type: 'Mine', px: 1546, py: -406 },
          ]
        : null,
    );

    ensureAdventurerPool(Math.random, 71);
    const adv = reg.pool[0];
    assert.equal(adv.targetLocationId, 0x90081001);
    assert.equal(adv.targetLocationName, 'The Barrow of Olaf [Crypt]');
    assert.deepEqual(adv.targetPixel, { x: 1595, y: -427 });
  } finally {
    setRegionalDungeonProvider(null);
    root.subsystems.adventurers = JSON.parse(prevAdv);
  }
});

test('Stage3-A4: Multi-slice capital prosperity, fabric prosperity, shared cooldown keys, and open-city quarantine', () => {
  const icCentre = capitalPlaceId(0, 0);
  const icWaterfront = capitalPlaceId(0, 12);
  const solitudeCentre = capitalPlaceId(1, 0);
  const solitudeEast = capitalPlaceId(1, 1);

  assert.equal(capitalIndexOfId(icWaterfront), 0);
  assert.equal(canonicalCapitalMapId(icWaterfront), icCentre);
  assert.equal(canonicalCapitalMapId(solitudeEast), solitudeCentre);
  assert.equal(canonicalCapitalMapId(199102), 199102);

  clearSettlementProsperity();
  const prevPol = LivingTamrielConfig.political;
  const prevUrban = LivingTamrielConfig.urban;
  const prevQuar = LivingTamrielConfig.quarantine;
  try {
    LivingTamrielConfig.political = PRESENCE.MID;
    LivingTamrielConfig.urban = PRESENCE.MID;
    LivingTamrielConfig.quarantine = PRESENCE.MID;

    // Shared prosperity across all slices of Imperial City
    setSettlementProsperity(icWaterfront, 4, 1);
    assert.equal(getSettlementProsperityDelta(icCentre), 4);
    assert.equal(getSettlementProsperityDelta(icWaterfront), 4);

    // Imperial City fabric slice prosperity uses fabric baseline + shift
    const fabricSlice = Array.from({ length: 625 }, (_, i) => i).find((i) => fabricSliceSites(i).length > 0);
    assert.ok(fabricSlice != null);
    const highTier = calculateLocationProsperity(
      { regionIndex: 70, capital: { k: 0, s: fabricSlice }, mapTableData: { mapId: icWaterfront }, exterior: { buildings: [] } },
    );
    assert.equal(highTier, PROSPERITY_TIER.HIGH);

    setSettlementProsperity(icCentre, -5, 1);
    const depressedTier = calculateLocationProsperity(
      { regionIndex: 70, capital: { k: 0, s: fabricSlice }, mapTableData: { mapId: icWaterfront }, exterior: { buildings: [] } },
    );
    assert.equal(depressedTier, PROSPERITY_TIER.MID);

    // Shared urban event cooldown key for multi-slice capital
    assert.equal(
      resolveLocationEventKey({ capital: { k: 0, s: 0 }, mapTableData: { mapId: icCentre } }, 70),
      'cap_0',
    );
    assert.equal(
      resolveLocationEventKey({ capital: { k: 0, s: 12 }, mapTableData: { mapId: icWaterfront } }, 70),
      'cap_0',
    );
    assert.equal(
      resolveLocationEventKey({ mapTableData: { mapId: 0x80001234 } }, 64),
      `map_${0x80001234}`,
    );

    // Open-city quarantine (no physical cityGates) spawns QUARANTINE_TENT reliably during PLAGUE.MID
    setRegionCrisis(64, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.MID);
    const host = createLivingSceneHost({
      ready: () => true,
      feet: () => [0, 0, 0],
      clock: () => 50000,
      regionIndex: () => 64,
      locationRecord: () => ({ mapTableData: { mapId: 0x80009999 }, regionIndex: 64, name: 'Dawnstar' }),
      playerTravelPixel: () => ({ x: 1500, y: -400 }),
      inLocationRect: () => true,
      hasCityGates: () => false,
      onRoad: () => false,
      climateIndex: () => 231,
      afloat: () => false,
      heightAt: () => 0,
      playerEntity: () => ({ level: 5 }),
      spawn: () => null,
      remove: () => {},
      inPool: () => false,
      say: () => {},
      rng: () => 0.95, // would miss 40% gate roll, hits 100% open-city roll
    });
    host.frame(2.0);
    assert.equal(host.shown()?.kind, LIVING_SITE_KINDS.QUARANTINE_TENT);
  } finally {
    setRegionCrisis(64, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
    clearSettlementProsperity();
    LivingTamrielConfig.political = prevPol;
    LivingTamrielConfig.urban = prevUrban;
    LivingTamrielConfig.quarantine = prevQuar;
  }
});

test('Stage3-B3: HeldMapWindow supports KeyI info, quest lines, and middle-click mark outside Iliac Bay', () => {
  const prevMarked = travelMapMarkedMapId();
  try {
    setTravelMapMarkedMapId(-1);
    const win = Object.create(HeldMapWindow.prototype);
    win._tamriel = true;
    win._zoneMap = false;
    win._it = null;
    win._info = null;
    win._dirty = false;
    win._view = { ox: 0, oy: 0, scale: 1 };
    win._size = { width: 1000, height: 500 };
    win._renderBox = () => {};
    win._onSheet = () => true;
    win._markerAt = () => null;
    win._pastBayHover = () => ({
      on: 'city',
      label: 'Skyrim : Whiterun',
      city: { mapId: 0x80004444, name: 'Whiterun' },
    });

    Object.defineProperty(win, 'markedMapId', {
      get: () => travelMapMarkedMapId(),
      set: (v) => setTravelMapMarkedMapId(v),
      configurable: true,
    });

    // Middle-click toggles past-Bay city mark
    win._markLocationHandler(100, 100);
    assert.equal(win.markedMapId, 0x80004444);
    win._markLocationHandler(100, 100);
    assert.equal(win.markedMapId, -1);

    // KeyI Location Info works on past-Bay place, but stays disabled on bare wilderness
    let askedSummary = null;
    win.deps = {
      placeSummaryAt: () => ({ mapId: 0x80004444, locationType: LOCATION_TYPES.TownCity, regionIndex: 64, name: 'Whiterun' }),
      discoveredBuildings: (s) => {
        askedSummary = s;
        return [{ buildingType: BUILDING_TYPES.GeneralStore, displayName: 'Belethor Goods' }];
      },
      buildingTypeName: () => 'General Store',
      maps: { getPoliticIndex: () => 128 + 64 },
    };

    // Bare wilderness coords must still do nothing
    win._selected = { coords: true, x: 1500, y: -300, name: 'Wilderness' };
    win._displayLocationInfo();
    assert.equal(win._info, null, 'Bare wilderness coords must not open I box');

    // Selected past-Bay place opens I box
    win._selected = {
      coords: true,
      place: true,
      pastBay: true,
      x: 1550,
      y: -350,
      name: 'Whiterun',
      town: { locationType: LOCATION_TYPES.TownCity },
    };
    win._displayLocationInfo();
    assert.equal(askedSummary?.mapId, 0x80004444);
    assert.equal(win._info?.title, 'Whiterun');
    assert.deepEqual(win._info?.cells, ['General Store  1']);
  } finally {
    setTravelMapMarkedMapId(prevMarked);
  }
});
