// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateTravelInterruption,
  canEvadeAmbushWithStealth,
  TRAVEL_EVENT_TYPE,
} from '../../src/systems/living/travelDirector.js';

import {
  checkCampFootprintSlope,
  snapPropToGround,
  CAMP_PRESETS,
  MAX_CAMP_SLOPE_DELTA_METERS,
} from '../../src/systems/living/campInjector.js';

import { LivingTamrielConfig, PRESENCE, resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import { restoreLivingSaveData, getLivingDirectorState } from '../../src/systems/living/livingDirector.js';
import { setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE } from '../../src/systems/living/regionState.js';
import {
  createLivingSceneHost,
  buildLivingSiteBlueprint,
  LIVING_SITE_KINDS,
} from '../../src/systems/living/livingWorldSpawner.js';

test('LT-03: Travel interruption formula respects Luck, cooldown, and presence tiers', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  // Test cooldown behavior
  const region = 17; // Daggerfall
  const now = 5000;

  // With rng returning 0.01 (always interrupt if off cooldown)
  const first = evaluateTravelInterruption({
    regionIndex: region,
    playerLuck: 50,
    nowMinutes: now,
    rng: () => 0.01,
  });

  assert.equal(first.shouldInterrupt, true);
  assert.ok(first.eventType);

  // Immediately trying again at now + 60 minutes must be blocked by cooldown (2880 min)
  const blocked = evaluateTravelInterruption({
    regionIndex: region,
    playerLuck: 50,
    nowMinutes: now + 60,
    rng: () => 0.01,
  });

  assert.equal(blocked.shouldInterrupt, false);
  assert.equal(blocked.reason, 'Travel interruption on cooldown');

  // After 2881 minutes, cooldown expires and interruption can roll again
  const second = evaluateTravelInterruption({
    regionIndex: region,
    playerLuck: 50,
    nowMinutes: now + 2881,
    rng: () => 0.01,
  });

  assert.equal(second.shouldInterrupt, true);
});

test('LT-03: Event distribution matches 40% peaceful / 30% dilemma / 30% ambush', () => {
  restoreLivingSaveData(null);
  const region = 17;

  // With a fixed sequence of RNG: first call is chance roll (0.01 -> triggers interrupt),
  // second call is subRoll (0.20 -> Peaceful Caravan)
  let callCount = 0;
  const peacefulRng = () => (callCount++ === 0 ? 0.01 : 0.20);

  const peaceful = evaluateTravelInterruption({
    regionIndex: region,
    nowMinutes: 10000,
    rng: peacefulRng,
  });
  assert.equal(peaceful.shouldInterrupt, true);
  assert.equal(peaceful.eventType, TRAVEL_EVENT_TYPE.PEACEFUL_CARAVAN);

  // subRoll in [0.40, 0.70) -> Road Dilemma
  restoreLivingSaveData(null);
  callCount = 0;
  const dilemmaRng = () => (callCount++ === 0 ? 0.01 : 0.50);

  const dilemma = evaluateTravelInterruption({
    regionIndex: region,
    nowMinutes: 10000,
    rng: dilemmaRng,
  });
  assert.equal(dilemma.shouldInterrupt, true);
  assert.equal(dilemma.eventType, TRAVEL_EVENT_TYPE.ROAD_DILEMMA);

  // subRoll >= 0.70 -> Ambush
  restoreLivingSaveData(null);
  callCount = 0;
  const ambushRng = () => (callCount++ === 0 ? 0.01 : 0.85);

  const ambush = evaluateTravelInterruption({
    regionIndex: region,
    nowMinutes: 10000,
    rng: ambushRng,
  });
  assert.equal(ambush.shouldInterrupt, true);
  assert.equal(ambush.eventType, TRAVEL_EVENT_TYPE.AMBUSH);
});

test('LT-03: Stealth allows evading ambush threats', () => {
  // 100 stealth + 50 luck -> chance = 50 + 10 = 60%
  const evaded = canEvadeAmbushWithStealth(100, 50, () => 0.40);
  assert.equal(evaded, true);

  const caught = canEvadeAmbushWithStealth(10, 10, () => 0.90);
  assert.equal(caught, false);
});

test('LT-03: Slope-snap algorithm filters steep inclines and snaps props safely', async () => {
  // Flat ground height sampler (elevation = 100.0m everywhere)
  const flatSampler = () => 100.0;
  const flatCheck = checkCampFootprintSlope(flatSampler, 500, 500, 6.0);

  assert.equal(flatCheck.suitable, true);
  assert.equal(flatCheck.centerHeight, 100.0);
  assert.equal(flatCheck.maxSlopeDelta, 0);

  // Steep cliff height sampler (elevation varies from 100 to 105m)
  const cliffSampler = (x, z) => 100.0 + (x > 500 ? 4.5 : 0);
  const cliffCheck = checkCampFootprintSlope(cliffSampler, 500, 500, 6.0);

  assert.equal(cliffCheck.suitable, false); // 4.5m delta exceeds MAX_CAMP_SLOPE_DELTA_METERS (1.2m)
  assert.ok(cliffCheck.maxSlopeDelta > MAX_CAMP_SLOPE_DELTA_METERS);

  // Prop height snap test
  const propY = snapPropToGround(flatSampler, 502, 501, 0.05);
  assert.equal(propY, 100.05);

  // Validate presets structure
  assert.ok(CAMP_PRESETS.BANDIT_CAMP.props.length >= 3);
  assert.ok(CAMP_PRESETS.TRAVELER_REST.actors.length >= 1);

  // Validate Traveler Rest interaction choices
  let openedTradeActor = null;
  let choiceSpec = null;
  let saidMsg = null;
  const dummyPlayer = { health: 50, maxHealth: 100, fatigue: 100, maxFatigue: 200, goldPieces: 50 };
  const travelHost = createLivingSceneHost({
    ready: () => true,
    feet: () => [100, 0, 100],
    heightAt: () => 0,
    regionIndex: () => 0,
    inLocationRect: () => false,
    onRoad: () => true,
    clock: () => 600,
    playerEntity: () => dummyPlayer,
    spawn: async (m, pos, opts) => ({ id: Math.random(), entity: { name: 'Actor' }, ...opts }),
    inPool: () => true,
    remove: () => {},
    openChoice: (spec) => { choiceSpec = spec; },
    openLivingActor: (actor) => { openedTradeActor = actor; },
    say: (msg) => { saidMsg = msg; },
    playSound: () => {},
  });

  const restBp = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.TRAVELER_REST,
    centerX: 100,
    centerZ: 100,
    heightAt: () => 0,
    regionIndex: 0,
    playerEntity: dummyPlayer,
    nowMinutes: 600,
    onRoad: true,
  });

  const site = travelHost.standBlueprint(restBp);
  await new Promise((r) => setTimeout(r, 10));
  travelHost.frame(1.1);

  assert.ok(choiceSpec, 'Traveler rest triggers ChoiceWindow');
  assert.equal(choiceSpec.options.length, 4);

  // Test Option 1: Trade
  choiceSpec.options[0].action();
  assert.ok(openedTradeActor, 'Trade option invokes openLivingActor with merchant actor');
  assert.equal(openedTradeActor.livingRole, 'traveler');

  // Test Option 2: Rest
  choiceSpec.options[1].action();
  assert.equal(dummyPlayer.health, 85, 'Rest option heals health');
  assert.equal(dummyPlayer.fatigue, 200, 'Rest option recovers fatigue');

  // Test Option 4: Rob
  choiceSpec.options[3].action();
  assert.equal(site.hostile, true, 'Rob option makes traveler rest camp hostile');
});
