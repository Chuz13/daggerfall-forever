// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  planSquadronEncounter,
  resolveSideChoice,
  maxShipsPerSide,
  shouldPromptSideChoice,
  shouldCullSquadron,
  canFireProjectile,
  NAVAL_CHOICE,
  NAVAL_SPAWN_MIN_M,
  NAVAL_SPAWN_MAX_M,
  NAVAL_PROJECTILE_CAP,
} from '../../src/systems/living/navalIncidentHost.js';
import {
  rollContractKind,
  rewardMultiplier,
  scaledReward,
  onContractCompleted,
  CONTRACT_KIND,
} from '../../src/systems/living/bountySync.js';
import { LivingTamrielConfig, PRESENCE, resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import { restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';
import { setRegionCrisis, getRegionState, CRISIS_TYPE, CRISIS_PHASE } from '../../src/systems/living/regionState.js';

const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

test('LT-05: squadrons spawn 200-300 m from the player, 1v1 up to the tier cap', () => {
  resetLivingConfig();
  for (let i = 0; i < 200; i++) {
    const plan = planSquadronEncounter({ playerX: 1000, playerZ: -500, rng: seeded(i + 1) });
    assert.ok(plan);
    assert.ok(plan.distance >= NAVAL_SPAWN_MIN_M && plan.distance <= NAVAL_SPAWN_MAX_M);
    assert.ok(plan.law.length >= 1 && plan.law.length <= 2); // MID, no war
    assert.ok(plan.pirates.length >= 1 && plan.pirates.length <= 2);
  }
  LivingTamrielConfig.naval = PRESENCE.HIGH;
  assert.equal(maxShipsPerSide(PRESENCE.HIGH), 3);
  assert.equal(maxShipsPerSide(PRESENCE.MID, true), 3);
  assert.equal(maxShipsPerSide(PRESENCE.LIGHT), 1);
  LivingTamrielConfig.naval = PRESENCE.OFF;
  assert.equal(planSquadronEncounter({ playerX: 0, playerZ: 0 }), null);
  resetLivingConfig();
});

test('LT-05: side choice sets allies, hostility, underworld rep and bounty', () => {
  resetLivingConfig();
  const mk = () => planSquadronEncounter({ playerX: 0, playerZ: 0, rng: seeded(7) });

  const lawPlan = mk();
  const law = resolveSideChoice(lawPlan, NAVAL_CHOICE.LAW);
  assert.ok(lawPlan.law.every((s) => s.isAlly));
  assert.ok(lawPlan.pirates.every((s) => !s.isAlly));
  assert.equal(law.piratesHostileToPlayer, true);

  const pirPlan = mk();
  const pir = resolveSideChoice(pirPlan, NAVAL_CHOICE.PIRATES);
  assert.ok(pirPlan.pirates.every((s) => s.isAlly));
  assert.equal(pir.lawHostileToPlayer, true);
  assert.ok(pir.underworldRep > 0);
  assert.equal(pir.regionalBountyIssued, true);

  const neu = resolveSideChoice(mk(), NAVAL_CHOICE.NEUTRAL);
  assert.equal(neu.scavenge, true);
  assert.equal(neu.lawHostileToPlayer || neu.piratesHostileToPlayer, false);
});

test('LT-05: prompt at 40 m, cull past 450 m, projectile cap 12', () => {
  assert.equal(shouldPromptSideChoice(39), true);
  assert.equal(shouldPromptSideChoice(41), false);
  assert.equal(shouldCullSquadron(451), true);
  assert.equal(shouldCullSquadron(300), false);
  assert.equal(canFireProjectile(NAVAL_PROJECTILE_CAP - 1), true);
  assert.equal(canFireProjectile(NAVAL_PROJECTILE_CAP), false);
});

test('LT-05: contract mix is ~70/30 and multipliers stay in their bands', () => {
  resetLivingConfig();
  const rng = seeded(42);
  let wild = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) if (rollContractKind(rng) === CONTRACT_KIND.WILDERNESS) wild++;
  assert.ok(Math.abs(wild / N - 0.7) < 0.03, `wilderness share ${wild / N}`);

  assert.equal(rewardMultiplier(CONTRACT_KIND.WILDERNESS), 4);
  assert.equal(rewardMultiplier(CONTRACT_KIND.DUNGEON), 7.5);
  assert.equal(scaledReward(100, CONTRACT_KIND.WILDERNESS), 400);
  assert.equal(scaledReward(100, CONTRACT_KIND.DUNGEON), 750);

  LivingTamrielConfig.bountyRewardWildMult = 99; // out of band -> clamped to x5
  LivingTamrielConfig.bountyRewardDungeonMult = 1; // -> clamped to x5
  assert.equal(rewardMultiplier(CONTRACT_KIND.WILDERNESS), 5);
  assert.equal(rewardMultiplier(CONTRACT_KIND.DUNGEON), 5);
  LivingTamrielConfig.bounties = PRESENCE.OFF;
  assert.equal(rewardMultiplier(CONTRACT_KIND.DUNGEON), 1);
  resetLivingConfig();
});

test('LT-05: a completed contract lowers tension and shortens the crisis', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  setRegionCrisis(17, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
  const st = getRegionState(17);
  const before = { tension: st.tension, days: st.phaseDaysRemaining };
  onContractCompleted(17);
  assert.equal(st.tension, before.tension - 5);
  assert.equal(st.phaseDaysRemaining, before.days - 1);
  for (let i = 0; i < 40; i++) onContractCompleted(17);
  assert.ok(st.tension >= 0 && st.phaseDaysRemaining >= 1);
});

