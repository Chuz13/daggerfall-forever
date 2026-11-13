import test from 'node:test';
import assert from 'node:assert/strict';

import { createModApi, _resetModPluginApi, setModApiContext } from '../../src/systems/mods/modPluginApi.js';
import { emitModEvent } from '../../src/systems/mods/modEventBus.js';
import {
  getAllPerks,
  getUnlockedPerks,
  hasUnlockedPerk,
  getPerkHitBonus,
  clearDynamicPerks,
} from '../../src/systems/perks/perkRegistry.js';
import { calculateSuccessfulHit } from '../../src/combat/formulas.js';
import initDuelistsFlow from '../../mods/examples/duelists-flow/plugin.js';

test("Duelist's Flow: Rhythmic combat combo system, perk unlock, save safety, toggle enable/disable & hit bonus", () => {
  _resetModPluginApi();
  clearDynamicPerks();

  // 1. Initial State
  const player = {
    isPlayer: true,
    level: 3,
    health: 40,
    maxHealth: 50,
    fatigue: 50,
    maxFatigue: 100,
    skills: { 22: 40 }, // Long blade
    skillValues: { 22: 40 },
    stats: { agility: 40, luck: 50 },
    unlockedPerks: [],
  };
  setModApiContext({ player });

  assert.equal(getAllPerks().length, 0);
  assert.equal(hasUnlockedPerk(player, 'duelists_trance'), false);
  assert.equal(getPerkHitBonus(player), 0);

  // 2. Initialize Duelist's Flow mod plugin
  const modId = 'duelists-flow';
  const api = createModApi(modId);

  // Capture HUD and MidScreen notifications
  const hudLogs = [];
  const midScreenLogs = [];
  api.ui.notify = (msg) => hudLogs.push(msg);
  api.ui.showMidScreen = (msg, dur) => midScreenLogs.push({ msg, dur });

  initDuelistsFlow(api);

  // Perk should now be registered dynamically
  assert.equal(getAllPerks().length, 1);
  assert.equal(getAllPerks()[0].id, 'duelists_trance');
  assert.equal(hasUnlockedPerk(player, 'duelists_trance'), false);

  // 3. Test Combo Flow (Hits 1 to 5)
  // Hit 1: Streak starts
  emitModEvent('combatAttackResolved', { attacker: player, hit: true });
  assert.equal(midScreenLogs.length, 0); // No midscreen for x1

  // Hit 2: Streak x2 -> MidScreen shown
  emitModEvent('combatAttackResolved', { attacker: player, hit: true });
  assert.equal(midScreenLogs.length, 1);
  assert.equal(midScreenLogs[0].msg, '⚔ COMBO x2');

  // Hit 3: Tier 1 - Flow State (+12 SP)
  const spBefore3 = player.fatigue;
  emitModEvent('combatAttackResolved', { attacker: player, hit: true });
  assert.equal(player.fatigue, spBefore3 + 12);
  assert.equal(midScreenLogs[1].msg, '⚔ COMBO x3');
  assert.ok(hudLogs.some((m) => m.includes('Flow State') || m.includes('Боевой поток')));

  // Hit 4: Streak x4
  emitModEvent('combatAttackResolved', { attacker: player, hit: true });
  assert.equal(midScreenLogs[2].msg, '⚔ COMBO x4');

  // Hit 5: Tier 2 - Deadly Precision (+5 HP, +25 SP, unlocks Duelist's Trance)
  const hpBefore5 = player.health;
  const spBefore5 = player.fatigue;
  emitModEvent('combatAttackResolved', { attacker: player, hit: true });
  assert.equal(player.health, hpBefore5 + 5);
  assert.equal(player.fatigue, Math.min(player.maxFatigue, spBefore5 + 25));
  assert.equal(midScreenLogs[3].msg, '⚔ COMBO x5');
  assert.ok(hudLogs.some((m) => m.includes('Deadly Precision') || m.includes('Смертоносная точность')));
  assert.ok(hudLogs.some((m) => m.includes('FEAT ACCOMPLISHED') || m.includes('ПОДВИГ СОВЕРШЕН')));

  // Check that perk is unlocked on player
  assert.equal(hasUnlockedPerk(player, 'duelists_trance'), true);
  assert.equal(getPerkHitBonus(player), 5);

  // Verify hit bonus affects combat hit calculation (+5% to hit chance)
  const target = { armorValues: [50, 50, 50, 50, 50, 50, 50], stats: { agility: 30, luck: 50 } };
  const mockAttackerWithoutPerk = { ...player, unlockedPerks: [] };
  const notesBase = {};
  const notesWithPerk = {};
  calculateSuccessfulHit(mockAttackerWithoutPerk, target, 0, 0, () => 0.5, notesBase);
  calculateSuccessfulHit(player, target, 0, 0, () => 0.5, notesWithPerk);
  assert.equal(notesWithPerk.diag.toHit.rawChance - notesBase.diag.toHit.rawChance, 5);

  // Check persistent career best streak
  assert.equal(api.storage.get('bestStreak'), 5);

  // 4. Test Miss / Rhythm Broken with Perk Halved Penalty
  // Current streak is 5 (>= 2). A miss should drain 5 FP (instead of default 10 FP) because of 'duelists_trance'
  const spBeforeMiss = player.fatigue;
  emitModEvent('combatAttackResolved', { attacker: player, hit: false });
  assert.equal(player.fatigue, spBeforeMiss - 5);
  assert.equal(midScreenLogs[midScreenLogs.length - 1].msg, 'Flow broken!');
  assert.ok(hudLogs.some((m) => m.includes('-5 FP') || m.includes('-5 SP')));

  // 5. Test Toggling Off / Mod Disable Safety
  // Simulating disabling the mod (clearing registered perks)
  clearDynamicPerks();
  assert.equal(getAllPerks().length, 0);
  assert.equal(hasUnlockedPerk(player, 'duelists_trance'), false);
  assert.equal(getPerkHitBonus(player), 0);

  // To-hit calculation with disabled mod reverts exactly to baseline
  const notesDisabled = {};
  calculateSuccessfulHit(player, target, 0, 0, () => 0.5, notesDisabled);
  assert.equal(notesDisabled.diag.toHit.rawChance, notesBase.diag.toHit.rawChance);

  // 6. Test Re-enabling the Mod
  initDuelistsFlow(api);
  assert.equal(getAllPerks().length, 1);
  assert.equal(hasUnlockedPerk(player, 'duelists_trance'), true);
  assert.equal(getPerkHitBonus(player), 5);

  _resetModPluginApi();
  clearDynamicPerks();
});

test("Duelist's Flow: Live DFO player entity stamina scaling, fatigue cap safety and clamp", () => {
  _resetModPluginApi();

  // Live DFO player structure: stats 60 STR / 60 END -> maxFatigue = (60+60)*64 = 7680 raw units
  const livePlayer = {
    isPlayer: true,
    stats: { strength: 60, endurance: 60 },
    fatigue: 3000,
    health: 80,
    maxHealth: 100,
  };
  setModApiContext({ player: livePlayer });

  const api = createModApi('test-stamina-scaling');

  // 1. Restore fatigue by 12 points -> should add 12 * 64 = 768 raw units
  api.player.restoreFatigue(12);
  assert.equal(livePlayer.fatigue, 3768);

  // 2. Restore fatigue near cap -> must NOT exceed maxFatigue cap (7680)
  livePlayer.fatigue = 7600;
  api.player.restoreFatigue(25); // 25 * 64 = 1600 units, would exceed 7680
  assert.equal(livePlayer.fatigue, 7680); // strictly clamped to cap

  // 3. Already at cap -> must stay at cap, never grow higher
  api.player.restoreFatigue(35);
  assert.equal(livePlayer.fatigue, 7680);

  // 4. Damage fatigue -> drains 10 points (10 * 64 = 640 raw units)
  api.player.damageFatigue(10);
  assert.equal(livePlayer.fatigue, 7680 - 640);

  // 5. Massive drain -> must clamp at 0, never drop below zero
  api.player.damageFatigue(500);
  assert.equal(livePlayer.fatigue, 0);

  _resetModPluginApi();
});

