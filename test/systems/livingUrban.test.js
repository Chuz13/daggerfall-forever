// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldSpawnUrbanSkirmish,
  planUrbanSkirmish,
  isSkirmishBlowCriminal,
  URBAN_PROP_LIMIT,
  MIN_DOORWAY_CLEARANCE_M,
  MAX_URBAN_SLOPE_DELTA_M,
  SKIRMISH_TEAMS,
} from '../../src/systems/living/urbanDirector.js';

import { setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE } from '../../src/systems/living/regionState.js';
import { LivingTamrielConfig, PRESENCE, resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import { restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';

test('LT-06: Urban skirmish spawns only during WAR.MID or CIVIL_STRIFE.MID and outdoors', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const daggerfall = 17;

  // In peaceful times, skirmish should not spawn
  assert.equal(
    shouldSpawnUrbanSkirmish({ regionIndex: daggerfall, isInsideBuilding: false }),
    false,
  );

  // Set region to WAR.MID
  setRegionCrisis(daggerfall, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);

  // Outdoors, it should spawn
  assert.equal(
    shouldSpawnUrbanSkirmish({ regionIndex: daggerfall, isInsideBuilding: false }),
    true,
  );

  // Indoors, it must never spawn
  assert.equal(
    shouldSpawnUrbanSkirmish({ regionIndex: daggerfall, isInsideBuilding: true }),
    false,
  );

  // If one skirmish already exists, don't spawn duplicate (FPS guard)
  assert.equal(
    shouldSpawnUrbanSkirmish({ regionIndex: daggerfall, isInsideBuilding: false, existingActiveSkirmishes: 1 }),
    false,
  );

  // Disabled in config
  LivingTamrielConfig.urban = PRESENCE.OFF;
  assert.equal(
    shouldSpawnUrbanSkirmish({ regionIndex: daggerfall, isInsideBuilding: false }),
    false,
  );

  resetLivingConfig();
});

test('LT-06: Skirmish planning respects slope, doorway clearance, and limits props to 2', () => {
  // 1. Flat ground away from doors -> Success
  const flatSampler = () => 10.0;
  const plan = planUrbanSkirmish({
    centerX: 200,
    centerZ: 300,
    doorwayPositions: [{ x: 250, z: 350 }], // 70m away, safe
    heightSampler: flatSampler,
  });

  assert.ok(plan);
  assert.ok(plan.guards.length >= 1 && plan.guards.length <= 6);
  assert.ok(plan.rebels.length >= 2 && plan.rebels.length <= 8);
  assert.ok(plan.props.length <= URBAN_PROP_LIMIT);
  assert.equal(plan.civiliansShouldPanic, true);

  // 2. Steep slope -> Cancel spawn (avoids floating barricades)
  const steepSampler = (x, z) => (x > 200 ? 15.0 : 10.0); // 5m delta
  const steepPlan = planUrbanSkirmish({
    centerX: 200,
    centerZ: 300,
    heightSampler: steepSampler,
  });
  assert.equal(steepPlan, null);

  // 3. Near a doorway (< 10m) -> Cancel spawn (prevents door blockage/softlock)
  const blockedPlan = planUrbanSkirmish({
    centerX: 200,
    centerZ: 300,
    doorwayPositions: [{ x: 204, z: 302 }], // ~4.5m away, too close
    heightSampler: flatSampler,
  });
  assert.equal(blockedPlan, null);
});

test('LT-06: Faction Neutrality Shield prevents false crimes from crossfire', () => {
  // NPC vs NPC crossfire is never a crime for player
  assert.equal(
    isSkirmishBlowCriminal(SKIRMISH_TEAMS.INSURGENTS, SKIRMISH_TEAMS.CITY_WATCH, false),
    false,
  );
  assert.equal(
    isSkirmishBlowCriminal(SKIRMISH_TEAMS.CITY_WATCH, SKIRMISH_TEAMS.INSURGENTS, false),
    false,
  );

  // Player attacking rebels is not a crime
  assert.equal(
    isSkirmishBlowCriminal('Player', SKIRMISH_TEAMS.INSURGENTS, true),
    false,
  );

  // Player attacking lawful watch is a crime
  assert.equal(
    isSkirmishBlowCriminal('Player', SKIRMISH_TEAMS.CITY_WATCH, true),
    true,
  );
});

