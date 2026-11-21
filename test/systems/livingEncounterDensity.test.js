// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LivingTamrielConfig,
  LIVING_ENCOUNTER_SCALE,
  LIVING_LOCATION_COOLDOWN,
  LIVING_URBAN_LOOT,
  LIVING_WILDERNESS_LOOT,
  PRESENCE,
  getLivingEncounterScale,
  resetLivingConfig,
} from '../../src/systems/living/livingConfig.js';
import { planUrbanSkirmish } from '../../src/systems/living/urbanDirector.js';
import {
  createLivingSceneHost,
  buildLivingSiteBlueprint,
  rollLivingChunkCampRoster,
  rollLivingWildernessEncounter,
  executeLivingConsoleCommand,
  locationEventCooldowns,
  LIVING_SITE_KINDS,
} from '../../src/systems/living/livingWorldSpawner.js';
import { setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE } from '../../src/systems/living/regionState.js';
import { restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';
import {
  setSettlementProsperity,
  getSettlementProsperityDelta,
  clearSettlementProsperity,
} from '../../src/systems/living/settlementProsperity.js';
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
  setRegionCrisis(17, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);

  // LOW scale (x1)
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.LOW;
  for (let i = 0; i < 5; i++) {
    const plan = planUrbanSkirmish({
      centerX: 100,
      centerZ: 200,
      heightSampler: flatSampler,
      regionIndex: 17,
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
      regionIndex: 17,
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
      regionIndex: 17,
    });
    assert.ok(plan);
    assert.ok(plan.guards.length >= 6 && plan.guards.length <= 10, `Expected 6..10 guards on HIGH, got ${plan.guards.length}`);
    assert.ok(plan.rebels.length >= 8 && plan.rebels.length <= 14, `Expected 8..14 rebels on HIGH, got ${plan.rebels.length}`);
  }

  setRegionCrisis(17, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
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

test('Settlement event cooldown setting, 40/60 quarantine split, and 65/35 peace roulette govern town spawns', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  locationEventCooldowns.clear();

  let nowClock = 1000;
  let seqIdx = 0;
  let rngValues = [0.1, 0.1, 0.1, 0.1, 0.1];
  const makeHost = () =>
    createLivingSceneHost({
      ready: () => true,
      feet: () => [0, 0, 0],
      heightAt: () => 0,
      regionIndex: () => 17,
      inLocationRect: () => true,
      onRoad: () => true,
      clock: () => nowClock,
      locationRecord: () => ({ name: 'Daggerfall', locationType: 0, mapTableData: { mapId: 990101 } }),
      playerEntity: () => ({ level: 8, goldPieces: 200 }),
      spawn: async () => ({ entity: { team: 'Neutral', items: [] }, ai: { isHostile: false } }),
      inPool: () => true,
      remove: () => {},
      say: () => {},
      rng: () => {
        const val = rngValues[seqIdx % rngValues.length];
        seqIdx++;
        return val;
      },
    });

  // 1. Configurable settlement cooldown: 2h allows re-trigger after 120m while blocking at 60m
  LivingTamrielConfig.urban = PRESENCE.HIGH;
  LivingTamrielConfig.locationCooldownMinutes = LIVING_LOCATION_COOLDOWN.HOURS_2;
  setRegionCrisis(17, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  const host = makeHost();

  rngValues = [0.2, 0.2, 0.1, 0.2, 0.2];
  seqIdx = 0;
  host.frame(2.0);
  assert.equal(host.shown()?.kind, LIVING_SITE_KINDS.PLEA_ENCOUNTER);
  host.clear();

  // Blocked at 60 min (< 120 min)
  nowClock = 1060;
  host.frame(2.0);
  assert.equal(host.shown(), null);

  // Allowed at 125 min (>= 120 min) -> Priority 3 angle consumes first rng, then >= 0.65 hits mundane skirmish
  nowClock = 1125;
  rngValues = [0.1, 0.85, 0.2, 0.2, 0.2];
  seqIdx = 0;
  host.frame(2.0);
  assert.equal(host.shown()?.kind, LIVING_SITE_KINDS.URBAN_SKIRMISH);
  host.clear();

  // 3-day cooldown (4320) blocks after 1440 min and allows after 4325 min
  LivingTamrielConfig.locationCooldownMinutes = LIVING_LOCATION_COOLDOWN.DAYS_3;
  nowClock = 1125 + 1440;
  host.frame(2.0);
  assert.equal(host.shown(), null);

  nowClock = 1125 + 4325;
  // Plague 40/60 split: < 0.40 -> QUARANTINE_TENT
  setRegionCrisis(17, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.MID);
  LivingTamrielConfig.quarantine = PRESENCE.HIGH;
  rngValues = [0.2, 0.1, 0.1, 0.1];
  seqIdx = 0;
  host.frame(2.0);
  assert.equal(host.shown()?.kind, LIVING_SITE_KINDS.QUARANTINE_TENT);
  host.clear();

  // Plague >= 0.40 falls through to Plague URBAN_SKIRMISH
  locationEventCooldowns.clear();
  rngValues = [0.6, 0.1, 0.1, 0.1];
  seqIdx = 0;
  host.frame(2.0);
  assert.equal(host.shown()?.kind, LIVING_SITE_KINDS.URBAN_SKIRMISH);

  host.clear();
  locationEventCooldowns.clear();
  setRegionCrisis(17, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  resetLivingConfig();
});

test('Console /living spawn urban, plea aliases, and /living cooldown commands', () => {
  resetLivingConfig();
  locationEventCooldowns.clear();

  let lastSite = null;
  const ctx = {
    regionIndex: 17,
    playerFeet: [100, 0, 200],
    heightAt: () => 0,
    playerEntity: { level: 6, goldPieces: 200 },
    nowMinutes: 1500,
    climateIndex: 231,
    sceneHost: { standBlueprint: (bp) => { lastSite = bp; } },
  };

  const outRat = executeLivingConsoleCommand(['spawn', 'urban', 'EVT_PLAGUE_RAT_SWARM'], ctx);
  assert.match(outRat, /URBAN_SKIRMISH \[EVT_PLAGUE_RAT_SWARM/);
  assert.equal(lastSite?.meta?.event?.id, 'EVT_PLAGUE_RAT_SWARM');

  const outDrunk = executeLivingConsoleCommand(['spawn', 'plea', 'drunk'], ctx);
  assert.match(outDrunk, /PLEA_ENCOUNTER \[DRUNKEN_BRAWLER\]/);
  assert.equal(lastSite?.meta?.plea?.type, 'DRUNKEN_BRAWLER');

  const outCart = executeLivingConsoleCommand(['spawn', 'plea', 'cart'], ctx);
  assert.match(outCart, /PLEA_ENCOUNTER \[BROKEN_CART_MERCHANT\]/);
  assert.equal(lastSite?.meta?.plea?.type, 'BROKEN_CART_MERCHANT');

  const outCd = executeLivingConsoleCommand(['cooldown', '2h'], ctx);
  assert.match(outCd, /120m/);
  assert.equal(LivingTamrielConfig.locationCooldownMinutes, LIVING_LOCATION_COOLDOWN.HOURS_2);

  locationEventCooldowns.set('test_map', 1000);
  const outClear = executeLivingConsoleCommand(['cooldown', 'clear'], ctx);
  assert.match(outClear, /Cleared/);
  assert.equal(locationEventCooldowns.size, 0);

  const outStatus = executeLivingConsoleCommand(['status'], ctx);
  assert.match(outStatus, /cooldown=120m/);

  resetLivingConfig();
});

test('Console /living prosperity and settlement prosperity status output', () => {
  resetLivingConfig();
  clearSettlementProsperity();
  setRegionCrisis(17, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);

  const ctx = {
    mapId: 9001,
    regionIndex: 17,
    nowMinutes: 1440 * 5,
  };

  const outNoTown = executeLivingConsoleCommand(['prosperity', '+2'], { regionIndex: 17 });
  assert.match(outNoTown, /Stand inside a settlement/);

  const outSet = executeLivingConsoleCommand(['prosperity', '+3'], ctx);
  assert.match(outSet, /set to \+3/);
  assert.equal(getSettlementProsperityDelta(9001), 3);

  const outStatus = executeLivingConsoleCommand(['status'], ctx);
  assert.match(outStatus, /prosperity=3/);

  const outProspStatus = executeLivingConsoleCommand(['prosperity', 'status'], ctx);
  assert.match(outProspStatus, /local=\+3/);

  const outClamp = executeLivingConsoleCommand(['prosperity', '-9'], ctx);
  assert.match(outClamp, /set to -5/);
  assert.equal(getSettlementProsperityDelta(9001), -5);

  const outClear = executeLivingConsoleCommand(['prosperity', 'clear'], ctx);
  assert.match(outClear, /Cleared/);
  assert.equal(getSettlementProsperityDelta(9001), 0);

  clearSettlementProsperity();
  resetLivingConfig();
});
