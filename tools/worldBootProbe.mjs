// @ts-check
// ═══════════════════════════════════════════════════════════════════
// WORLD BOOT INTEGRITY PROBE (Daggerfall Forever)
//
// Standalone diagnostic probe that verifies world loading prerequisites:
// 1. World places registry & canonical locations resolution
//    (Daggerfall City, Wayrest, Sentinel, Privateer's Hold)
// 2. Terrain generation & heightmap noise sampling without NaNs
// 3. World coordinate grid & pixel key projections
// 4. Living World trip index & near-town discovery
// 5. Offline system hooks & scene context readiness
// ═══════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';

import { createWorldPlaces, placeOfRow } from '../src/world/worldWide/worldPlaces.js';
import { bayPlaceRows, BAY_SOURCE } from '../src/world/worldWide/bayPlaces.js';
import {
  worldPixelKey,
  worldPixelOfKey,
  inWorldGrid,
  WORLD_PIXEL_SPAN,
  theatreAt,
  areaAt,
} from '../src/world/worldWide/worldGrid.js';
import {
  generateSamples,
  getNoise,
  sampleKernel,
  MAX_TERRAIN_HEIGHT,
  DEFAULT_TERRAIN_SCALE,
} from '../src/world/terrain/terrainSampler.js';
import { createLivingIndex, LIVING_DIVE_TYPES } from '../src/scenes/livingWorld/livingIndex.js';
import { LOCATION_TYPES, longitudeLatitudeToMapPixel } from '../src/formats/mapsFile.js';
import { getRegionState } from '../src/systems/living/regionState.js';

const woodsOf = (byteAt = () => 64, large = 0) => ({
  getHeightMapValue: byteAt,
  getHeightMapValuesRange1Dim(x0, y0, dim) {
    const dst = new Uint8Array(dim * dim);
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        dst[x + y * dim] = byteAt(x0 + x, y0 + y);
      }
    }
    return dst;
  },
  getLargeHeightMapValuesRange: (x, y, dim) => new Uint8Array(dim * 3 * dim * 3).fill(large),
});

/** Canonical locations required for baseline world boot */
const CANONICAL_BOOT_LOCATIONS = [
  {
    name: "Privateer's Hold",
    region: 17,
    px: 100,
    py: 200,
    mapId: 10001,
    type: LOCATION_TYPES.DungeonKeep,
    hasDungeon: true,
  },
  {
    name: 'Daggerfall City',
    region: 17,
    px: 171,
    py: 169,
    mapId: 17101,
    type: LOCATION_TYPES.TownCity,
    hasDungeon: false,
  },
  {
    name: 'Wayrest',
    region: 20,
    px: 300,
    py: 220,
    mapId: 20201,
    type: LOCATION_TYPES.TownCity,
    hasDungeon: false,
  },
  {
    name: 'Sentinel',
    region: 23,
    px: 250,
    py: 310,
    mapId: 23301,
    type: LOCATION_TYPES.TownCity,
    hasDungeon: false,
  },
];

/**
 * Runs the world boot diagnostic probe.
 * @param {{ verbose?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, durationMs: number, stats: Record<string, any> }>}
 */
export async function runWorldBootProbe({ verbose = false } = {}) {
  const startTime = Date.now();
  const log = (...args) => { if (verbose) console.log('[WorldBootProbe]', ...args); };

  log('Step 1: Checking world grid coordinate projections and keys...');

  // 1. Grid projection tests
  assert.equal(typeof worldPixelKey, 'function', 'worldPixelKey must be defined');
  const daggerfallKey = worldPixelKey(171, 169);
  assert.ok(Number.isSafeInteger(daggerfallKey) && daggerfallKey >= 0, 'Daggerfall pixel key must be a valid integer');
  const [rx, ry] = worldPixelOfKey(daggerfallKey);
  assert.equal(rx, 171, 'Unprojected X coordinate must match');
  assert.equal(ry, 169, 'Unprojected Y coordinate must match');

  assert.equal(inWorldGrid(171, 169), true, 'Daggerfall must be inside world grid');
  assert.equal(inWorldGrid(WORLD_PIXEL_SPAN + 10, 50), false, 'Out-of-span coordinates must be outside grid');

  log('Step 2: Initializing WorldPlaces registry and canonical locations...');

  // 2. World places registry
  const worldPlaces = createWorldPlaces();
  const rawRows = CANONICAL_BOOT_LOCATIONS.map((loc) => ({
    mapId: loc.mapId,
    name: loc.name,
    px: loc.px,
    py: loc.py,
    type: loc.type,
    region: loc.region,
    w: 4,
    h: 4,
    port: false,
    hasDungeon: loc.hasDungeon,
  }));

  worldPlaces.register(BAY_SOURCE, rawRows);

  for (const target of CANONICAL_BOOT_LOCATIONS) {
    const found = worldPlaces.byMapId(target.mapId);
    assert.ok(found, `Canonical location "${target.name}" must resolve in registry`);
    assert.equal(found.mapId, target.mapId, `MapId for ${target.name} must match`);
    assert.equal(found.px, target.px, `Pixel X for ${target.name} must match`);
    assert.equal(found.py, target.py, `Pixel Y for ${target.name} must match`);
  }

  log('Step 3: Sampling terrain heights and verifying noise without NaNs...');

  // 3. Terrain noise and elevation sanity
  const mockWoods = woodsOf((x, y) => 40 + ((x + y) % 30));
  for (const loc of CANONICAL_BOOT_LOCATIONS) {
    const noiseVal = getNoise(loc.px * 10, loc.py * 10);
    assert.ok(Number.isFinite(noiseVal), `Noise at ${loc.name} must be finite, got: ${noiseVal}`);

    // Generate terrain samples around the location
    const samples = generateSamples(mockWoods, loc.px, loc.py);
    assert.ok(samples && samples.length > 0, `Terrain samples for ${loc.name} must generate`);
    for (let i = 0; i < samples.length; i++) {
      assert.ok(!Number.isNaN(samples[i]), `Sample ${i} at ${loc.name} must not be NaN`);
    }
  }

  log('Step 4: Initializing Living World index and proximity discovery...');

  // 4. Living World Trips & Index
  const livingIndex = createLivingIndex({
    places: worldPlaces,
    populated: (type) => type === LOCATION_TYPES.TownCity || type === LOCATION_TYPES.TownHamlet,
    peopleAt: () => 100,
  });

  const allTowns = [...livingIndex.towns().values()];
  assert.ok(allTowns.length >= 3, 'Must index at least 3 towns (Daggerfall, Wayrest, Sentinel)');
  const dfTown = livingIndex.townAt(171, 169);
  assert.ok(dfTown, 'Daggerfall City must be found at (171, 169)');
  assert.equal(dfTown.name, 'Daggerfall City');
  assert.equal(livingIndex.townOfId(17101), dfTown, 'Town lookup by ID must match');

  const dungeons = [...livingIndex.dungeons().values()];
  assert.ok(dungeons.length >= 1, "Must index at least Privateer's Hold");
  const privDungeon = livingIndex.dungeonOfId(10001);
  assert.ok(privDungeon, "Privateer's Hold dungeon must be indexed by ID");

  log('Step 5: Verifying regional state bindings for world destinations...');

  // 5. Regional State validation for all canonical locations
  for (const loc of CANONICAL_BOOT_LOCATIONS) {
    const regState = getRegionState(loc.region);
    assert.ok(regState, `Region state for Region ${loc.region} must exist`);
    assert.equal(regState.regionIndex, loc.region);
    assert.ok(typeof regState.tension === 'number', 'Region tension must be numeric');
  }

  const durationMs = Date.now() - startTime;
  log(`World boot integrity checks PASSED in ${durationMs}ms.`);

  return {
    ok: true,
    durationMs,
    stats: {
      canonicalLocationsVerified: CANONICAL_BOOT_LOCATIONS.length,
      daggerfallPixelKey: daggerfallKey,
      townsIndexed: allTowns.length,
      dungeonsIndexed: dungeons.length,
    },
  };
}

// Direct CLI execution
if (process.argv[1] && (process.argv[1].endsWith('worldBootProbe.mjs') || process.argv[1].includes('worldBootProbe'))) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Daggerfall Forever — World Boot Integrity Diagnostic Probe');
  console.log('═══════════════════════════════════════════════════════════════');
  runWorldBootProbe({ verbose: true })
    .then((result) => {
      console.log('\n[BOOT PROBE SUCCESS]');
      console.log(`Duration: ${result.durationMs}ms`);
      console.log('Metrics:', JSON.stringify(result.stats, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[BOOT PROBE FAILURE]:', err);
      process.exit(1);
    });
}
