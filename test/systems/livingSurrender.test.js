// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateSurrenderRansom,
  resolveLivingSurrender,
  SURRENDER_OUTCOME,
} from '../../src/systems/living/livingRolls.js';
import {
  resolveCheckpointInteraction,
  CHECKPOINT_OUTCOME,
  hasRegionalCheckpointPass,
} from '../../src/systems/living/roadCheckpointHost.js';
import {
  confrontInterceptingAdventurer,
  getAdventurerSimRegistry,
  RECLAIM_OUTCOME,
} from '../../src/systems/living/adventurerSim.js';
import { resolveAmbushSurrender } from '../../src/systems/living/travelDirector.js';
import { SKILLS } from '../../src/systems/skills.js';

test('LT-Surrender: calculateSurrenderRansom scales with level, wealth, and mercantile', () => {
  const wealthyPlayer = {
    goldPieces: 1000,
    skills: { [SKILLS.Mercantile]: 80 },
    stats: { Personality: 70, Luck: 50 },
  };

  const res = calculateSurrenderRansom(wealthyPlayer, 2);
  assert.equal(res.canAfford, true);
  assert.ok(res.ransomGold >= res.minDemand);
  assert.ok(res.ransomGold <= 1000 * 0.25); // Has discount applied
});

test('LT-Surrender: resolveLivingSurrender deducts ransom and leaves health intact when wealthy', () => {
  const player = {
    goldPieces: 500,
    maxHealth: 100,
    health: 100,
    fatigue: 3200,
  };

  const res = resolveLivingSurrender({ playerEntity: player, threatLevel: 2, customRansom: 120 });
  assert.equal(res.outcome, SURRENDER_OUTCOME.ROBBED);
  assert.equal(res.isPauper, false);
  assert.equal(res.goldTaken, 120);
  assert.equal(player.goldPieces, 380);
  assert.equal(player.health, 100);
  assert.equal(player.fatigue, 1600); // winded from stress
});

test('LT-Surrender: resolveLivingSurrender beats pauper to 10% HP/fatigue and zeroes gold', () => {
  const brokePlayer = {
    goldPieces: 5,
    maxHealth: 80,
    health: 80,
    fatigue: 2400,
  };

  const res = resolveLivingSurrender({ playerEntity: brokePlayer, threatLevel: 3 });
  assert.equal(res.outcome, SURRENDER_OUTCOME.BEATEN_PAUPER);
  assert.equal(res.isPauper, true);
  assert.equal(res.goldTaken, 5);
  assert.equal(brokePlayer.goldPieces, 0);
  assert.equal(brokePlayer.health, 8); // 10% of 80
  assert.equal(brokePlayer.fatigue, 240); // 10% of 2400
});

test('LT-Surrender: road checkpoint surrender grants pass for fine or cautions pauper', () => {
  const richPlayer = {
    goldPieces: 200,
    fatigue: 3000,
  };

  const paidRes = resolveCheckpointInteraction({
    playerEntity: richPlayer,
    method: 'surrender',
    tollGoldRequired: 50,
    regionIndex: 12,
    nowMinutes: 1000,
  });

  assert.equal(paidRes.outcome, CHECKPOINT_OUTCOME.SURRENDERED_PAID);
  assert.equal(richPlayer.goldPieces, 125); // 200 - 75 (1.5x toll)
  assert.equal(hasRegionalCheckpointPass(12, 1050), true);

  const pauperPlayer = {
    goldPieces: 10,
    fatigue: 2000,
  };

  const pauperRes = resolveCheckpointInteraction({
    playerEntity: pauperPlayer,
    method: 'surrender',
    tollGoldRequired: 50,
    regionIndex: 13,
    nowMinutes: 2000,
  });

  assert.equal(pauperRes.outcome, CHECKPOINT_OUTCOME.SURRENDERED_PAUPER);
  assert.equal(pauperPlayer.goldPieces, 0);
  assert.equal(pauperPlayer.fatigue, 400); // 20%
  assert.equal(hasRegionalCheckpointPass(13, 2050), true);
});

test('LT-Surrender: travel ambush surrender integrates with livingSurrender', () => {
  const player = {
    goldPieces: 300,
    maxHealth: 60,
    health: 60,
  };

  const res = resolveAmbushSurrender(player, 2);
  assert.equal(res.outcome, SURRENDER_OUTCOME.ROBBED);
  assert.ok(player.goldPieces < 300);
  assert.equal(player.health, 60);
});

test('LT-Surrender: in-dungeon rival forfeit concedes claim peacefully', () => {
  const reg = getAdventurerSimRegistry();
  reg.interceptedQuests = reg.interceptedQuests || {};
  reg.interceptedQuests['side_cave_55'] = {
    adventurerId: 99,
    adventurerName: 'Daric',
    adventurerTrait: 'MERCENARY',
    adventurerLevel: 5,
    locationId: 'side_cave_55',
    recovered: false,
    forfeited: false,
  };

  const player = { goldPieces: 100 };
  const res = confrontInterceptingAdventurer({
    locationId: 'side_cave_55',
    regionIndex: 1,
    playerEntity: player,
    method: 'FORFEIT',
  });

  assert.ok(res);
  assert.equal(res.outcome, RECLAIM_OUTCOME.FORFEITED);
  assert.equal(res.recovered, false);
  assert.equal(res.messageKey, 'living.surrender.conceded');
});
