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
import { SKILLS } from '../../src/systems/skills.js';
import {
  LivingTamrielConfig,
  LIVING_ENCOUNTER_SCALE,
  PRESENCE,
  resetLivingConfig,
} from '../../src/systems/living/livingConfig.js';
import { restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';
import { CRISIS_EVENTS, SKIRMISH_PROP_THEME } from '../../src/systems/living/crisisRegistry.js';
import {
  createLivingSceneHost,
  buildLivingSiteBlueprint,
  LIVING_SITE_KINDS,
} from '../../src/systems/living/livingWorldSpawner.js';

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
  assert.ok(plan.rebels.length >= (plan.event?.baseAttackers === 1 ? 1 : 2) && plan.rebels.length <= 8);
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

test('Urban skirmish single attacker, rat swarm clustering, all 12 prop themes, grounding, and real demolition', async () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  LivingTamrielConfig.urban = PRESENCE.MID;

  // 1. Single-attacker event keeps rebel count at 1 across LOW/MID/HIGH
  for (const sc of [LIVING_ENCOUNTER_SCALE.LOW, LIVING_ENCOUNTER_SCALE.MID, LIVING_ENCOUNTER_SCALE.HIGH]) {
    LivingTamrielConfig.encounterScale = sc;
    const plan = planUrbanSkirmish({
      centerX: 0,
      centerZ: 0,
      heightSampler: () => 0,
      regionIndex: 17,
      locationType: 6, // Tavern
      forcedEventId: 'EVT_TAVERN_CHESS_WAGER',
      rng: () => 0.5,
    });
    assert.ok(plan);
    assert.equal(plan.rebels.length, 1, `Expected 1 opponent at scale ${sc}`);
    assert.equal(plan.guards.length, 1, `Expected 1 ally at scale ${sc}`);
  }

  // 2. Rat swarm scales 5-7 LOW / 8-12 MID / 13-18 HIGH within compact radius <= 4.5m
  setRegionCrisis(17, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.MID);
  const ranges = [
    [LIVING_ENCOUNTER_SCALE.LOW, 5, 7],
    [LIVING_ENCOUNTER_SCALE.MID, 8, 12],
    [LIVING_ENCOUNTER_SCALE.HIGH, 13, 18],
  ];
  for (const [sc, min, max] of ranges) {
    LivingTamrielConfig.encounterScale = sc;
    const swarm = planUrbanSkirmish({
      centerX: 10,
      centerZ: 10,
      heightSampler: () => 0,
      regionIndex: 17,
      locationType: 0,
      forcedEventId: 'EVT_PLAGUE_RAT_SWARM',
      rng: () => 0.5,
    });
    assert.ok(swarm);
    assert.ok(swarm.rebels.length >= min && swarm.rebels.length <= max, `Swarm scale ${sc}: ${swarm.rebels.length}`);
    for (const r of swarm.rebels) {
      assert.ok(Math.hypot(r.dx, r.dz) <= 4.5, `Swarm actor offset too wide: ${Math.hypot(r.dx, r.dz)}`);
    }
  }

  // 3. All 12 SKIRMISH_PROP_THEME presets build within URBAN_PROP_LIMIT (2) meshes
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.LOW;
  for (const theme of Object.values(SKIRMISH_PROP_THEME)) {
    const sampleEvt = CRISIS_EVENTS.find((e) => e.propTheme === theme);
    assert.ok(sampleEvt, `No sample event for propTheme ${theme}`);
    setRegionCrisis(17, sampleEvt.category === 'WAR' || sampleEvt.category === 'PLAGUE' || sampleEvt.category === 'FAMINE' || sampleEvt.category === 'CRIME' || sampleEvt.category === 'CIVIL_STRIFE' ? sampleEvt.category : CRISIS_TYPE.PEACE, CRISIS_PHASE.MID);
    const bp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.URBAN_SKIRMISH,
      centerX: 0,
      centerZ: 0,
      heightAt: () => 0,
      regionIndex: 17,
      locationType: sampleEvt.locationTypes[0],
      forcedEventId: sampleEvt.id,
      rng: () => 0.3,
    });
    assert.ok(bp, `Failed to build blueprint for theme ${theme} (${sampleEvt.id})`);
    assert.ok(bp.meshes.length <= URBAN_PROP_LIMIT, `Theme ${theme} exceeded mesh cap: ${bp.meshes.length}`);
  }

  // 4. Mesh grounding lifts negative minY meshes and destroyDestructibles removes statue & well
  const removedBuckets = [];
  const addedBuckets = [];
  const drawMats = [];
  const destroyedBatches = [];
  const mockCpu = new Map();
  const triPos = new Float32Array([0, -1.25, 0, 1, 1, 0, 0, 1, 1]);
  const triIdx = new Uint16Array([0, 1, 2]);
  const host = createLivingSceneHost({
    ready: () => true,
    feet: () => [0, 0, 0],
    heightAt: () => 0,
    regionIndex: () => 17,
    inLocationRect: () => true,
    onRoad: () => true,
    clock: () => 1000,
    playerEntity: () => ({ level: 8, goldPieces: 200 }),
    spawn: async () => ({ entity: { team: 'Neutral' }, ai: { isHostile: false } }),
    inPool: () => true,
    remove: () => {},
    say: () => {},
    meshes: {
      cpuModels: mockCpu,
      getGpuMesh: async (modelId) => {
        mockCpu.set(modelId, { positions: triPos, indices: triIdx });
        return { bounds: { min: [-0.5, -1.25, -0.5], max: [0.5, 1.5, 0.5] } };
      },
    },
    collider: {
      addMesh: (key, _p, _i, mat) => addedBuckets.push({ key, y: mat[13] }),
      removeBucket: (key) => removedBuckets.push(key),
    },
    renderer: {
      drawMesh: (_gpu, mat) => {
        drawMats.push(mat[13]);
        return true;
      },
      createBillboardBatch: (opts) => ({ opts }),
      destroyBillboardBatch: (b) => destroyedBatches.push(b),
    },
    getTexture: async () => ({}),
    rng: () => 0.3,
  });

  // Statue demolition & grounding
  const statueBp = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.URBAN_SKIRMISH,
    centerX: 0,
    centerZ: 0,
    heightAt: () => 0,
    regionIndex: 17,
    locationType: 0,
    forcedEventId: 'EVT_NEW_RULER_STATUE_UNVEILING',
    rng: () => 0.3,
  });
  assert.ok(statueBp.meshes.some((m) => m.destructible));
  const statueSite = host.standBlueprint(statueBp);
  await Promise.resolve();
  await Promise.resolve();

  const expectedY = statueBp.meshes[0].feet[1] + 1.25;
  const drawnCount = host.draw({
    drawMesh: (_gpu, mat) => {
      drawMats.push(mat[13]);
      return true;
    },
  });
  assert.ok(drawnCount > 0);
  assert.ok(drawMats.every((y) => Math.abs(y - expectedY) < 1e-4), `Expected yLift=${expectedY}, got ${drawMats}`);
  assert.ok(addedBuckets.some((b) => Math.abs(b.y - expectedY) < 1e-4));

  host.batches();
  assert.equal(host.destroyDestructibles(), true);
  assert.equal(statueSite.blueprint.meshes.some((m) => m.destructible), false);
  assert.ok(removedBuckets.length > 0);
  assert.ok(destroyedBatches.length > 0);

  // Well demolition removes both mesh and destructible bucket flats
  const wellBp = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.URBAN_SKIRMISH,
    centerX: 0,
    centerZ: 0,
    heightAt: () => 0,
    regionIndex: 17,
    locationType: 0,
    forcedEventId: 'EVT_PLAGUE_WATER_WELL_SCARE',
    rng: () => 0.3,
  });
  assert.ok(wellBp.meshes.some((m) => m.destructible));
  assert.ok(wellBp.flats.some((fl) => fl.destructible));
  const wellSite = host.standBlueprint(wellBp);
  await Promise.resolve();
  assert.equal(host.destroyDestructibles(), true);
  assert.equal(wellSite.blueprint.meshes.some((m) => m.destructible), false);
  assert.equal(wellSite.blueprint.flats.some((fl) => fl.destructible), false);

  host.clear();
  resetLivingConfig();
});

test('Urban skirmish persists both_hostile after crit fail and calms winning rebel allies after guard defeat', async () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  LivingTamrielConfig.urban = PRESENCE.HIGH;
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.LOW;
  setRegionCrisis(17, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);

  const spawned = [];
  let choiceSpec = null;
  const weakPlayer = {
    level: 5,
    goldPieces: 100,
    skills: { [SKILLS.Thaumaturgy]: 1, [SKILLS.Etiquette]: 1 },
    stats: { Intelligence: 1, Personality: 1, Willpower: 1, Agility: 1, Luck: 1 },
    legalRep: {},
    regionalReputations: {},
  };
  const host = createLivingSceneHost({
    ready: () => true,
    feet: () => [0, 0, 0],
    heightAt: () => 0,
    regionIndex: () => 17,
    inLocationRect: () => true,
    onRoad: () => true,
    clock: () => 1000,
    playerEntity: () => weakPlayer,
    spawn: async (_mob, feet, opts) => {
      const rec = { dead: false, feet, allied: !!opts.allied, entity: { team: opts.team, items: [] }, ai: { isHostile: false, detected: false, target: null } };
      spawned.push(rec);
      return rec;
    },
    inPool: (r) => !r.dead && spawned.includes(r),
    remove: () => {},
    say: () => {},
    openChoice: (spec) => { choiceSpec = spec; },
    rng: () => 0.001,
  });

  // 1. Critical failure sets both_hostile and persists across subsequent frames
  const witchBp = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.URBAN_SKIRMISH,
    centerX: 4,
    centerZ: 0,
    heightAt: () => 0,
    regionIndex: 17,
    locationType: 0,
    playerEntity: weakPlayer,
    forcedEventId: 'EVT_WITCH_COVEN_ASSAULT',
    rng: () => 0.001,
  });
  const site1 = host.standBlueprint(witchBp);
  await Promise.resolve();
  await Promise.resolve();

  const guard0 = spawned.find((f) => f.livingRole === 'skirmish_guard');
  assert.ok(guard0);
  assert.equal(guard0.entity.skirmishNeutralToPlayer, true);
  assert.equal(guard0.entity.skirmishForceInfighting, true);

  host.frame(1.5);
  assert.ok(choiceSpec && choiceSpec.options.length === 4);
  choiceSpec.options[3].action(); // Choice 4: Thaumaturgy check fails critically with 0.001 roll + skill 1
  assert.equal(site1.skirmishStance, 'both_hostile');

  host.frame(1.5);
  assert.equal(site1.skirmishStance, 'both_hostile');
  assert.equal(guard0.entity.team, 'PlayerEnemy');
  assert.equal(guard0.entity.skirmishNeutralToPlayer, false);
  assert.equal(guard0.ai.target, weakPlayer);
  assert.equal(host.isCriminalTarget(guard0), false);

  // 2. Siding with rebels and defeating all guards sets orderRestored and calms surviving rebels
  host.clear();
  spawned.length = 0;
  choiceSpec = null;

  const warBp = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.URBAN_SKIRMISH,
    centerX: 4,
    centerZ: 0,
    heightAt: () => 0,
    regionIndex: 17,
    locationType: 0,
    playerEntity: weakPlayer,
    forcedEventId: 'EVT_WAR_GARRISON_REVOLT',
    rng: () => 0.2,
  });
  const site2 = host.standBlueprint(warBp);
  await Promise.resolve();
  await Promise.resolve();

  host.frame(1.5);
  assert.ok(choiceSpec && choiceSpec.options.length >= 2);
  choiceSpec.options[1].action(); // Choice 2: side with attackers (rebels)
  assert.equal(site2.skirmishStance, 'rebels');

  for (const g of spawned.filter((f) => f.livingRole === 'skirmish_guard')) {
    g.dead = true;
  }
  host.frame(1.5);
  assert.equal(site2.orderRestored, true);
  const liveRebels = spawned.filter((f) => f.livingRole === 'skirmish_rebel' && !f.dead);
  assert.ok(liveRebels.length > 0);
  for (const r of liveRebels) {
    assert.equal(r.entity.skirmishForceInfighting, false);
    assert.equal(r.ai.isHostile, false);
  }

  host.clear();
  setRegionCrisis(17, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  resetLivingConfig();
});

