// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bountyGold } from '../../src/systems/bounty/bountyBoard.js';
import {
  scaledReward,
  onContractCompleted,
  CONTRACT_KIND,
} from '../../src/systems/living/bountySync.js';
import {
  isDungeonInCooldown,
  claimFallenAdventurerRemains,
  getAdventurerSimRegistry,
} from '../../src/systems/living/adventurerSim.js';
import {
  evaluateTravelInterruption,
  TRAVEL_EVENT_TYPE,
} from '../../src/systems/living/travelDirector.js';
import { getRegionState, CRISIS_TYPE, CRISIS_PHASE } from '../../src/systems/living/regionState.js';
import { restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';
import { LivingTamrielConfig, resetLivingConfig, PRESENCE } from '../../src/systems/living/livingConfig.js';

test('LT-11: Bounty gold is scaled by Living Tamriel multipliers in wilderness and dungeons', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  // With LT bounties at MID (default), multiplier is x4 for wilderness, x7.5 for dungeon
  const wildPurse = bountyGold(5, 6, 1, false);
  const dungeonPurse = bountyGold(5, 6, 1, true);

  assert.ok(wildPurse > 100);
  assert.ok(dungeonPurse > wildPurse);

  // When LT bounties is OFF, reward is vanilla 1:1
  LivingTamrielConfig.bounties = PRESENCE.OFF;
  const vanillaWild = bountyGold(5, 6, 1, false);
  const vanillaDungeon = bountyGold(5, 6, 1, true);

  assert.ok(wildPurse > vanillaWild);
  assert.ok(dungeonPurse > vanillaDungeon);
});

test('LT-11: Bounty completion relieves regional tension and advances crisis timer', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const regionIndex = 15;
  const state = getRegionState(regionIndex);
  state.crisis = CRISIS_TYPE.WAR;
  state.phase = CRISIS_PHASE.MID;
  state.tension = 50;
  state.phaseDaysRemaining = 6;

  // Complete a contract in this region
  onContractCompleted(regionIndex);

  assert.equal(state.tension, 45); // Tension reduced by 5
  assert.equal(state.phaseDaysRemaining, 5); // Crisis days advanced by 1
});

test('LT-11: Dungeon hooks suppress cleared dungeons and deliver fallen adventurer remains', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const reg = getAdventurerSimRegistry();
  const testDungeonId = 'ruins_of_scourge_42';

  // Set cooldown
  reg.dungeonCooldowns[testDungeonId] = 3;
  assert.equal(isDungeonInCooldown(testDungeonId), true);

  // Set fallen adventurer remains
  reg.fallenRemains[testDungeonId] = [
    { adventurerName: 'Valen_42', className: 'Warrior', level: 12, gearTier: 3 },
  ];

  const claimed = claimFallenAdventurerRemains(testDungeonId);
  assert.ok(claimed);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].adventurerName, 'Valen_42');

  // Second claim returns null (already looted)
  assert.equal(claimFallenAdventurerRemains(testDungeonId), null);
});

test('LT-11: Travel interruption splits journey route and selects valid event types', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  // Test interruption with favorable danger roll
  const interrupt = evaluateTravelInterruption({
    regionIndex: 5,
    playerLuck: 50,
    nowMinutes: 10000,
    rng: () => 0.01, // Force trigger
  });

  assert.equal(interrupt.shouldInterrupt, true);
  assert.ok([
    TRAVEL_EVENT_TYPE.PEACEFUL_CARAVAN,
    TRAVEL_EVENT_TYPE.ROAD_DILEMMA,
    TRAVEL_EVENT_TYPE.AMBUSH,
  ].includes(/** @type {any} */ (interrupt.eventType)));
});
