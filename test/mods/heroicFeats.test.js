import test from 'node:test';
import assert from 'node:assert/strict';

import { createModApi, _resetModPluginApi } from '../../src/systems/mods/modPluginApi.js';
import {
  getAllPerks,
  getUnlockedPerks,
  hasUnlockedPerk,
  getPerkCritBonus,
  getPerkBackstabBonus,
  getPerkMagickaBonus,
  getPerkSavingThrowBonus,
  getPerkGoldModifier,
  clearDynamicPerks,
} from '../../src/systems/perks/perkRegistry.js';
import { generateRandomLoot } from '../../src/systems/loot/loot.js';
import { skillsToHit, backstabDamage } from '../../src/combat/formulas.js';

test('Heroic-Feats & Dynamic Perks: lifecycle, unlock, gameplay hooks & save safety', () => {
  _resetModPluginApi();
  clearDynamicPerks();

  // 1. Initial state without mods: 0 dynamic perks registered
  assert.equal(getAllPerks().length, 0);

  const player = {
    level: 1,
    skills: { 20: 10, 22: 10, 25: 10, 27: 10 },
    skillValues: { 20: 10, 22: 10, 25: 10, 27: 10 },
    unlockedPerks: [],
  };

  assert.equal(getUnlockedPerks(player).length, 0);
  assert.equal(hasUnlockedPerk(player, 'blade_mastery'), false);
  assert.equal(getPerkCritBonus(player), 0);
  assert.equal(getPerkBackstabBonus(player), 0);
  assert.equal(getPerkMagickaBonus(player), 0);
  assert.equal(getPerkSavingThrowBonus(player, 'poison'), 0);
  assert.equal(getPerkGoldModifier(player), 1.0);

  // 2. Load heroic-feats mod plugin
  const api = createModApi('heroic-feats');
  api.perks.register({
    id: 'blade_mastery',
    name: 'Blade Mastery',
    desc: '+15% damage and +10% crit chance',
    check: (e) => (e?.skills?.[22] ?? 0) >= 50,
  });
  api.perks.register({
    id: 'arcane_reservoir',
    name: 'Arcane Reservoir',
    desc: '+25 max Magicka',
    check: (e) => (e?.skills?.[25] ?? 0) >= 50,
  });
  api.perks.register({
    id: 'shadow_step',
    name: 'Shadow Step',
    desc: '+25% backstab damage',
    check: (e) => (e?.skills?.[20] ?? 0) >= 50,
  });
  api.perks.register({
    id: 'iron_constitution',
    name: 'Iron Constitution',
    desc: '+15 saving throw bonus against poison/disease',
    check: (e) => (Number(e?.level) || 1) >= 5,
  });
  api.perks.register({
    id: 'treasure_hunter',
    name: 'Treasure Hunter',
    desc: '+20% gold from loot',
    check: (e) => (e?.skills?.[27] ?? 0) >= 40,
  });

  assert.equal(getAllPerks().length, 5);

  // Player levels up and meets criteria
  player.level = 5;
  player.skills[22] = 55; // Long blade
  player.skills[20] = 52; // Stealth
  player.skills[25] = 50; // Mysticism
  player.skills[27] = 45; // Mercantile

  const unlocked = getUnlockedPerks(player);
  assert.equal(unlocked.length, 5);
  assert.ok(unlocked.includes('blade_mastery'));
  assert.ok(unlocked.includes('iron_constitution'));

  // 3. Test gameplay hooks
  assert.equal(getPerkCritBonus(player), 0.10);
  assert.equal(getPerkBackstabBonus(player), 0.25);
  assert.equal(getPerkMagickaBonus(player), 25);
  assert.equal(getPerkSavingThrowBonus(player, 'poison'), 15);
  assert.equal(getPerkGoldModifier(player), 1.20);

  // Combat formula backstab calculation incorporates perk bonus
  const baseDmg = 10;
  const backstabDmg = backstabDamage(baseDmg, 50, () => 0.01, null, player);
  assert.equal(backstabDmg, 33); // 10 * (3 + 0.25) rounded = 33

  // Loot generation incorporates treasure hunter bonus
  const matrix = { MinGold: 10, MaxGold: 10, WP: 0, AM: 0, C1: 0, C2: 0, C3: 0 };
  const loot = generateRandomLoot(matrix, player, () => 0.5);
  // Base gold = 10 * level 5 = 50; with 1.2x mod = 60
  assert.equal(loot[0].stackCount, 60);

  // 4. Test Save-Safety on Mod Unload / Disable
  // Simulating disabling the mod: clear dynamic perks
  clearDynamicPerks();
  assert.equal(getAllPerks().length, 0);

  // Even though player has 'blade_mastery' saved in their save state:
  player.unlockedPerks = ['blade_mastery', 'iron_constitution'];
  assert.equal(hasUnlockedPerk(player, 'blade_mastery'), false); // Mod disabled -> inactive
  assert.equal(getPerkCritBonus(player), 0); // Neutral 0, no crashes
  assert.equal(getPerkBackstabBonus(player), 0);
  assert.equal(getPerkMagickaBonus(player), 0);
  assert.equal(getPerkGoldModifier(player), 1.0);

  _resetModPluginApi();
  clearDynamicPerks();
});
