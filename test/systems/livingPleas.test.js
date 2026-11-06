// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluatePleaEncounter,
  resolvePleaResponse,
  PLEA_TYPE,
  PLEA_OUTCOME,
  PLEA_COOLDOWN_MINUTES,
} from '../../src/systems/living/pleaHost.js';

import { getRegionState, CRISIS_TYPE } from '../../src/systems/living/regionState.js';
import { restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';
import { resetLivingConfig } from '../../src/systems/living/livingConfig.js';
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
