// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluatePleaEncounter,
  resolvePleaResponse,
  PLEA_TYPE,
  PEACE_PLEA_TYPES,
  PLEA_OUTCOME,
  PLEA_COOLDOWN_MINUTES,
} from '../../src/systems/living/pleaHost.js';

import { getRegionState, CRISIS_TYPE } from '../../src/systems/living/regionState.js';
import { restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';
import { resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import {
  createLivingSceneHost,
  buildLivingSiteBlueprint,
  LIVING_SITE_KINDS,
} from '../../src/systems/living/livingWorldSpawner.js';
import { SKILLS } from '../../src/systems/skills.js';

test('LT-12: Ambient NPC pleas adapt to the local regional crisis', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const regionIndex = 12;
  const state = getRegionState(regionIndex);

  // 1. Plague crisis plea
  state.crisis = CRISIS_TYPE.PLAGUE;
  const plaguePlea = evaluatePleaEncounter({
    regionIndex,
    nowMinutes: 1000,
    rng: () => 0.01, // Force trigger
  });
  assert.equal(plaguePlea.shouldPlea, true);
  assert.equal(plaguePlea.plea?.type, PLEA_TYPE.PLAGUE_CURE);

  // 2. Famine crisis plea
  state.crisis = CRISIS_TYPE.FAMINE;
  const faminePlea = evaluatePleaEncounter({
    regionIndex,
    nowMinutes: 1000,
    rng: () => 0.01,
  });
  assert.equal(faminePlea.shouldPlea, true);
  assert.equal(faminePlea.plea?.type, PLEA_TYPE.FAMINE_BREAD);

  // 3. War crisis plea
  state.crisis = CRISIS_TYPE.WAR;
  const warPlea = evaluatePleaEncounter({
    regionIndex,
    nowMinutes: 1000,
    rng: () => 0.01,
  });
  assert.equal(warPlea.shouldPlea, true);
  assert.equal(warPlea.plea?.type, PLEA_TYPE.WAR_REFUGEE);
});

test('LT-12: Plea encounter enforces a 12-hour cooldown between ambient events', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const regionIndex = 5;
  const first = evaluatePleaEncounter({
    regionIndex,
    nowMinutes: 1000,
    rng: () => 0.01,
  });
  assert.equal(first.shouldPlea, true);

  // Resolving sets cooldown
  resolvePleaResponse({
    plea: first.plea,
    playerEntity: { regionalReputations: { 5: 0 } },
    regionIndex,
    response: 'HELP',
    goldOffered: 100,
    nowMinutes: 1000,
  });

  // Try again 1 hour later (should be blocked by cooldown)
  const tooSoon = evaluatePleaEncounter({
    regionIndex,
    nowMinutes: 1060,
    rng: () => 0.01,
  });
  assert.equal(tooSoon.shouldPlea, false);

  // Try again after 13 hours (past 12-hour cooldown)
  const afterCooldown = evaluatePleaEncounter({
    regionIndex,
    nowMinutes: 1000 + PLEA_COOLDOWN_MINUTES + 60,
    rng: () => 0.01,
  });
  assert.equal(afterCooldown.shouldPlea, true);
});

test('LT-12: Charitable aid increases local reputation while polite refusal uses etiquette', () => {
  const dummyPlayer = {
    regionalReputations: { 3: 5 },
    skills: { [SKILLS.Etiquette]: 75 },
    stats: { personality: 70, luck: 50 },
  };

  const samplePlea = {
    type: PLEA_TYPE.FAMINE_BREAD,
    requiredGold: 20,
    messageKey: 'living.plea.famine',
  };

  // 1. Helping with enough gold awards +3 local reputation
  const helpResult = resolvePleaResponse({
    plea: samplePlea,
    playerEntity: dummyPlayer,
    regionIndex: 3,
    response: 'HELP',
    goldOffered: 25,
    nowMinutes: 5000,
  });
  assert.equal(helpResult.outcome, PLEA_OUTCOME.HELPED);
  assert.equal(helpResult.repDelta, 3);
  assert.equal(dummyPlayer.regionalReputations[3], 8);

  // 2. Helping without enough gold is rejected
  const poorResult = resolvePleaResponse({
    plea: samplePlea,
    playerEntity: dummyPlayer,
    regionIndex: 3,
    response: 'HELP',
    goldOffered: 5,
    nowMinutes: 5000,
  });
  assert.equal(poorResult.outcome, PLEA_OUTCOME.INSUFFICIENT_FUNDS);

  // 3. Polite refusal with high etiquette parts peacefully
  const politeResult = resolvePleaResponse({
    plea: samplePlea,
    playerEntity: dummyPlayer,
    regionIndex: 3,
    response: 'REFUSE_POLITE',
    nowMinutes: 5000,
    rng: () => 0.1,
  });
  assert.equal(politeResult.outcome, PLEA_OUTCOME.PARTED_PEACEFULLY);

  // 4. Rude refusal creates resentment
  const rudeResult = resolvePleaResponse({
    plea: samplePlea,
    playerEntity: dummyPlayer,
    regionIndex: 3,
    response: 'REFUSE_RUDE',
    nowMinutes: 5000,
  });
  assert.equal(rudeResult.outcome, PLEA_OUTCOME.REBUFFED);
});

test('Peace street scenes have 90m cooldown, custom help perks, and non-criminal provocation', async () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  assert.equal(PLEA_COOLDOWN_MINUTES, 90);

  const regionIndex = 17;
  getRegionState(regionIndex).crisis = CRISIS_TYPE.PEACE;

  // Varied RNG values hit each of the 6 new grounded peace scenes + escort
  const seen = new Set();
  for (let i = 0; i < PEACE_PLEA_TYPES.length; i++) {
    restoreLivingSaveData(null);
    const ev = evaluatePleaEncounter({
      regionIndex,
      nowMinutes: 500,
      force: true,
      rng: () => (i + 0.1) / PEACE_PLEA_TYPES.length,
    });
    assert.equal(ev.shouldPlea, true);
    seen.add(ev.plea?.type);
  }
  assert.equal(seen.size, PEACE_PLEA_TYPES.length);

  // Help rewards across the new peace types
  const cartPlea = evaluatePleaEncounter({
    regionIndex,
    nowMinutes: 600,
    force: true,
    forcedPleaType: PLEA_TYPE.BROKEN_CART_MERCHANT,
  }).plea;
  const cartHelp = resolvePleaResponse({
    plea: cartPlea,
    playerEntity: { goldPieces: 200, level: 5, skills: {}, skillUses: {}, legalRep: { [regionIndex]: 0 }, regionalReputations: { [regionIndex]: 0 } },
    regionIndex,
    response: 'HELP',
    goldOffered: 200,
    nowMinutes: 600,
  });
  assert.equal(cartHelp.outcome, PLEA_OUTCOME.HELPED);
  assert.equal(cartHelp.grantHealingPotion, true);

  const preacherPlea = evaluatePleaEncounter({
    regionIndex,
    nowMinutes: 700,
    force: true,
    forcedPleaType: PLEA_TYPE.STREET_PREACHER,
  }).plea;
  const preacherPlayer = {
    goldPieces: 100,
    health: 10,
    maxHealth: 80,
    fatigue: 5,
    maxFatigue: 100,
    magicka: 2,
    maxMagicka: 40,
    legalRep: { [regionIndex]: 0 },
    regionalReputations: { [regionIndex]: 0 },
  };
  const preacherHelp = resolvePleaResponse({
    plea: preacherPlea,
    playerEntity: preacherPlayer,
    regionIndex,
    response: 'HELP',
    goldOffered: 100,
    nowMinutes: 700,
  });
  assert.equal(preacherHelp.fullRestore, true);
  assert.equal(preacherPlayer.health, 80);
  assert.equal(preacherPlayer.fatigue, 100);

  // Provoking a peaceful PLEA_ENCOUNTER flips NPC hostile and marks target non-criminal
  const spawned = [];
  let choiceSpec = null;
  const player = { level: 4, goldPieces: 100, skills: { [SKILLS.Etiquette]: 30 }, legalRep: {}, regionalReputations: {} };
  const host = createLivingSceneHost({
    ready: () => true,
    feet: () => [0, 0, 0],
    heightAt: () => 0,
    regionIndex: () => regionIndex,
    inLocationRect: () => true,
    onRoad: () => true,
    clock: () => 800,
    playerEntity: () => player,
    spawn: async (_mob, feet, opts) => {
      const rec = { feet, allied: !!opts.allied, entity: { team: 'Civilian', items: [] }, ai: { isHostile: false, detected: false, target: null } };
      spawned.push(rec);
      return rec;
    },
    inPool: (r) => spawned.includes(r),
    remove: () => {},
    say: () => {},
    openChoice: (spec) => { choiceSpec = spec; },
    rng: () => 0.25,
  });

  const pleaObj = evaluatePleaEncounter({
    regionIndex,
    nowMinutes: 800,
    force: true,
    forcedPleaType: PLEA_TYPE.DRUNKEN_BRAWLER,
  }).plea;
  const bp = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.PLEA_ENCOUNTER,
    centerX: 4,
    centerZ: 0,
    heightAt: () => 0,
    regionIndex,
    playerEntity: player,
    nowMinutes: 800,
    plea: pleaObj,
    rng: () => 0.25,
  });
  const site = host.standBlueprint(bp);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(spawned.length, 1);
  host.frame(2.0);
  assert.ok(choiceSpec && choiceSpec.options.length === 3);

  // Trigger choice 3 (insult/provoke)
  choiceSpec.options[2].action();
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(site.hostile, true);
  assert.equal(spawned[0].entity.team, 'PlayerEnemy');
  assert.equal(spawned[0].entity.skirmishNeutralToPlayer, false);
  assert.equal(spawned[0].entity.suppressInfighting, true);
  assert.equal(host.isCriminalTarget(spawned[0]), false);
  assert.ok(spawned.length >= 2, 'Provoking spawns scaled street companion backup');
  host.clear();

  // Quarantine Tent rude refusal does NOT turn healer hostile
  choiceSpec = null;
  const qBp = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.QUARANTINE_TENT,
    centerX: 4,
    centerZ: 0,
    heightAt: () => 0,
    regionIndex,
    playerEntity: player,
    nowMinutes: 900,
    rng: () => 0.25,
  });
  const qSite = host.standBlueprint(qBp);
  await Promise.resolve();
  host.frame(2.0);
  assert.ok(choiceSpec && choiceSpec.options.length >= 3);
  choiceSpec.options[2].action();
  assert.notEqual(qSite.hostile, true);
  host.clear();
});
