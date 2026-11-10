// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LivingTamrielConfig,
  LIVING_ENCOUNTER_SCALE,
  LIVING_URBAN_LOOT,
  LIVING_WILDERNESS_LOOT,
  getLivingEncounterScale,
  resetLivingConfig,
} from '../../src/systems/living/livingConfig.js';
import { planUrbanSkirmish } from '../../src/systems/living/urbanDirector.js';
import {
  buildLivingSiteBlueprint,
  rollLivingChunkCampRoster,
  rollLivingWildernessEncounter,
  executeLivingConsoleCommand,
  LIVING_SITE_KINDS,
} from '../../src/systems/living/livingWorldSpawner.js';
import { createNemesisHunter, NEMESIS_ARCHETYPES } from '../../src/systems/living/nemesisHost.js';
import { ROAD_ADVENTURER_SITUATION } from '../../src/systems/living/adventurerSim.js';

test('LT-Density: Encounter scale and loot modes configuration', () => {
  resetLivingConfig();

  // 1. Encounter scale defaults to LOW (1x)
  assert.equal(LivingTamrielConfig.encounterScale, LIVING_ENCOUNTER_SCALE.LOW);
  assert.equal(getLivingEncounterScale(), 1);

  // 2. Mutation to MID (2x) and HIGH (4x)
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.MID;
  assert.equal(LivingTamrielConfig.encounterScale, LIVING_ENCOUNTER_SCALE.MID);
  assert.equal(getLivingEncounterScale(), 2);

  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.HIGH;
  assert.equal(LivingTamrielConfig.encounterScale, LIVING_ENCOUNTER_SCALE.HIGH);
  assert.equal(getLivingEncounterScale(), 4);

  // 3. Loot modes
  assert.equal(LivingTamrielConfig.urbanLootMode, LIVING_URBAN_LOOT.ZERO);
  assert.equal(LivingTamrielConfig.wildernessLootMode, LIVING_WILDERNESS_LOOT.FULL);

  LivingTamrielConfig.urbanLootMode = LIVING_URBAN_LOOT.SUPPLIES;
  assert.equal(LivingTamrielConfig.urbanLootMode, 'supplies');
  LivingTamrielConfig.urbanLootMode = LIVING_URBAN_LOOT.FULL;
  assert.equal(LivingTamrielConfig.urbanLootMode, 'full');

  resetLivingConfig();
});

test('LT-Density: Urban skirmish ranges scale across Low, Mid, and High', () => {
  const flatSampler = () => 10.0;

  // LOW scale (x1)
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.LOW;
  for (let i = 0; i < 5; i++) {
    const plan = planUrbanSkirmish({
      centerX: 100,
      centerZ: 200,
      heightSampler: flatSampler,
    });
    assert.ok(plan);
    assert.ok(plan.guards.length >= 1 && plan.guards.length <= 2, `Expected 1..2 guards, got ${plan.guards.length}`);
    assert.ok(plan.rebels.length >= 2 && plan.rebels.length <= 3, `Expected 2..3 rebels, got ${plan.rebels.length}`);
  }

  // MID scale (x2)
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.MID;
  for (let i = 0; i < 5; i++) {
    const plan = planUrbanSkirmish({
      centerX: 100,
      centerZ: 200,
      heightSampler: flatSampler,
    });
    assert.ok(plan);
    assert.ok(plan.guards.length >= 3 && plan.guards.length <= 6, `Expected 3..6 guards on MID, got ${plan.guards.length}`);
    assert.ok(plan.rebels.length >= 4 && plan.rebels.length <= 7, `Expected 4..7 rebels on MID, got ${plan.rebels.length}`);
  }

  // HIGH scale (x4)
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.HIGH;
  for (let i = 0; i < 5; i++) {
    const plan = planUrbanSkirmish({
      centerX: 100,
      centerZ: 200,
      heightSampler: flatSampler,
    });
    assert.ok(plan);
    assert.ok(plan.guards.length >= 6 && plan.guards.length <= 10, `Expected 6..10 guards on HIGH, got ${plan.guards.length}`);
    assert.ok(plan.rebels.length >= 8 && plan.rebels.length <= 14, `Expected 8..14 rebels on HIGH, got ${plan.rebels.length}`);
  }

  resetLivingConfig();
});

test('LT-Density: Bandit camps scale subordinates while leader is strictly 1', () => {
  const heightAt = () => 0;

  // LOW
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.LOW;
  const bpLow = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.BANDIT_CAMP,
    centerX: 50,
    centerZ: 50,
    heightAt,
  });
  const leadersLow = bpLow.actors.filter((a) => a.role === 'bandit_camp' && a.name.includes('Highway Brigand'));
  assert.equal(leadersLow.length, 1, 'Leader must be strictly 1');
  assert.ok(bpLow.actors.length >= 3 && bpLow.actors.length <= 4, `Expected 3..4 total bandits on LOW, got ${bpLow.actors.length}`);

  // MID
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.MID;
  const bpMid = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.BANDIT_CAMP,
    centerX: 50,
    centerZ: 50,
    heightAt,
  });
  assert.ok(bpMid.actors.length >= 5 && bpMid.actors.length <= 8, `Expected 5..8 total bandits on MID, got ${bpMid.actors.length}`);

  // HIGH
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.HIGH;
  const bpHigh = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.BANDIT_CAMP,
    centerX: 50,
    centerZ: 50,
    heightAt,
  });
  assert.ok(bpHigh.actors.length >= 9 && bpHigh.actors.length <= 15, `Expected 9..15 total bandits on HIGH, got ${bpHigh.actors.length}`);

  resetLivingConfig();
});

test('LT-Density: Checkpoint guards scale while captain is strictly 1', () => {
  const heightAt = () => 0;

  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.LOW;
  const bpLow = buildLivingSiteBlueprint({ kind: LIVING_SITE_KINDS.CHECKPOINT, centerX: 0, centerZ: 0, heightAt });
  assert.ok(bpLow.actors.length >= 2 && bpLow.actors.length <= 3, `Expected 2..3 guards on LOW, got ${bpLow.actors.length}`);
  assert.equal(bpLow.actors[0].name, 'Checkpoint Captain');

  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.MID;
  const bpMid = buildLivingSiteBlueprint({ kind: LIVING_SITE_KINDS.CHECKPOINT, centerX: 0, centerZ: 0, heightAt });
  assert.ok(bpMid.actors.length >= 4 && bpMid.actors.length <= 6, `Expected 4..6 guards on MID, got ${bpMid.actors.length}`);
  assert.equal(bpMid.actors[0].name, 'Checkpoint Captain');

  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.HIGH;
  const bpHigh = buildLivingSiteBlueprint({ kind: LIVING_SITE_KINDS.CHECKPOINT, centerX: 0, centerZ: 0, heightAt });
  assert.ok(bpHigh.actors.length >= 7 && bpHigh.actors.length <= 11, `Expected 7..11 guards on HIGH, got ${bpHigh.actors.length}`);
  assert.equal(bpHigh.actors[0].name, 'Checkpoint Captain');

  resetLivingConfig();
});

test('LT-Density: Chunk camp roster and Nemesis minions scale dynamically', () => {
  // Chunk camp roster
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.LOW;
  const cLow = rollLivingChunkCampRoster({ climateIndex: 231, skyMinutes: 720 }, () => 0.1);
  assert.ok(cLow && cLow.mobileTypes.length >= 2 && cLow.mobileTypes.length <= 3);

  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.MID;
  const cMid = rollLivingChunkCampRoster({ climateIndex: 231, skyMinutes: 720 }, () => 0.1);
  assert.ok(cMid && cMid.mobileTypes.length >= 4 && cMid.mobileTypes.length <= 6);

  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.HIGH;
  const cHigh = rollLivingChunkCampRoster({ climateIndex: 231, skyMinutes: 720 }, () => 0.1);
  assert.ok(cHigh && cHigh.mobileTypes.length >= 8 && cHigh.mobileTypes.length <= 12);

  // Nemesis minions
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.HIGH;
  const nemHigh = createNemesisHunter(25, { archetype: NEMESIS_ARCHETYPES.BOUNTY_HUNTER, rng: () => 0.5 });
  assert.ok(nemHigh.minions.length >= 5 && nemHigh.minions.length <= 9, `Expected 5..9 minions on HIGH for lvl 25, got ${nemHigh.minions.length}`);

  resetLivingConfig();
});

test('LT-Density: Console commands /living scale and /living loot', () => {
  resetLivingConfig();

  const outScale = executeLivingConsoleCommand(['scale', 'high'], {});
  assert.match(outScale, /HIGH \(x4\)/);
  assert.equal(LivingTamrielConfig.encounterScale, LIVING_ENCOUNTER_SCALE.HIGH);

  const outLoot = executeLivingConsoleCommand(['loot', 'supplies'], {});
  assert.match(outLoot, /SUPPLIES/);
  assert.equal(LivingTamrielConfig.urbanLootMode, LIVING_URBAN_LOOT.SUPPLIES);

  resetLivingConfig();
});
