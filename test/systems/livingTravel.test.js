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
import {
  stockTravelingMerchantTrunk,
  executeRoadsideFenceSale,
  CURE_DISEASE_RECIPE_KEY,
  STAMINA_RECIPE_KEY,
} from '../../src/systems/living/travelingMerchant.js';

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
  assert.equal(choiceSpec.options.length, 5);

  // Test Option 1: Trade (Buy)
  choiceSpec.options[0].action();
  assert.ok(openedTradeActor, 'Trade option invokes openLivingActor with merchant actor');
  assert.equal(openedTradeActor.livingRole, 'traveler');

  // Test Option 3: Rest
  choiceSpec.options[2].action();
  assert.equal(dummyPlayer.health, 85, 'Rest option heals health');
  assert.equal(dummyPlayer.fatigue, 200, 'Rest option recovers fatigue');

  // Test Option 5: Rob
  choiceSpec.options[4].action();
  assert.equal(site.hostile, true, 'Rob option makes traveler rest camp hostile');
});

test('LT-04: Traveling Road Merchant adaptive trunk and roadside fence economics', () => {
  restoreLivingSaveData(null);

  // 1. Desert climate inventory adaptation
  const desertTrunk = stockTravelingMerchantTrunk({
    regionIndex: 20, // Sentinel / Alik'r
    climateIndex: 225, // Desert
    playerEntity: { level: 5 },
  });
  assert.ok(desertTrunk.items.length > 5, 'Desert trunk contains basic and climate goods');
  const hasStaminaPotion = desertTrunk.items.some((it) => it.potionRecipeKey === STAMINA_RECIPE_KEY);
  assert.ok(hasStaminaPotion, 'Desert traveling merchant stocks stamina potions for desert treks');

  // 2. Regional Plague Crisis inventory adaptation
  setRegionCrisis(17, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.MID);
  const plagueTrunk = stockTravelingMerchantTrunk({
    regionIndex: 17,
    climateIndex: 230,
    playerEntity: { level: 5 },
  });
  const hasCureDisease = plagueTrunk.items.some((it) => it.potionRecipeKey === CURE_DISEASE_RECIPE_KEY);
  assert.ok(hasCureDisease, 'Merchant stocks Cure Disease elixirs during active regional Plague crisis');

  // 3. Fencing stolen goods
  const stolenItem = { templateIndex: 10, group: 'Weapons', stolen: true, value: 120 };
  const shelf = { coin: 1500, items: [] };

  // Refusal when exceeding purse
  const overPrice = executeRoadsideFenceSale([stolenItem], 2000, shelf);
  assert.equal(overPrice.ok, false);
  assert.equal(stolenItem.stolen, true, 'Stolen mark remains when transaction fails');

  // Successful fence trade
  const successTrade = executeRoadsideFenceSale([stolenItem], 120, shelf);
  assert.equal(successTrade.ok, true);
  assert.equal(shelf.coin, 1380, 'Merchant purse decremented by trade value');
  assert.equal(stolenItem.stolen, undefined, 'Stolen mark cleared upon roadside fencing');
});

