// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerVirtualMod,
  setModLoadOrder,
  getModLoadOrder,
  getActiveMods,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import {
  syncModData,
  getModCombatConfig,
  _resetModDataSync,
} from '../../src/systems/mods/modDataSync.js';

test('LoadOrderAndConflicts: later mod in load order safely overrides conflicting values', () => {
  _resetModRegistry();
  _resetModDataSync();

  registerVirtualMod(
    {
      id: 'mod-base',
      name: 'Base Combat Mod',
      enabled: true,
      data: { combat: 'combat.json' },
    },
    {
      'combat.json': JSON.stringify({
        heavyArmorFatigueMultiplier: 1.2,
        lightArmorFatigueMultiplier: 0.9,
      }),
    }
  );

  registerVirtualMod(
    {
      id: 'mod-override',
      name: 'Override Heavy Armor Mod',
      enabled: true,
      data: { combat: 'combat.json' },
    },
    {
      'combat.json': JSON.stringify({
        heavyArmorFatigueMultiplier: 1.5,
      }),
    }
  );

  // 1. Order: [mod-base, mod-override] -> override should win for heavy armor
  setModLoadOrder(['mod-base', 'mod-override']);
  const active1 = getActiveMods();
  assert.equal(active1[0].id, 'mod-base');
  assert.equal(active1[1].id, 'mod-override');

  syncModData();
  const cfg1 = getModCombatConfig();
  assert.equal(cfg1.heavyArmorFatigueMultiplier, 1.5, 'mod-override should win');
  assert.equal(cfg1.lightArmorFatigueMultiplier, 0.9, 'mod-base non-conflicting key should remain');

  // 2. Change Order: [mod-override, mod-base] -> base should win for heavy armor
  setModLoadOrder(['mod-override', 'mod-base']);
  const active2 = getActiveMods();
  assert.equal(active2[0].id, 'mod-override');
  assert.equal(active2[1].id, 'mod-base');

  syncModData();
  const cfg2 = getModCombatConfig();
  assert.equal(cfg2.heavyArmorFatigueMultiplier, 1.2, 'mod-base should win when loaded last');
  assert.equal(cfg2.lightArmorFatigueMultiplier, 0.9);

  _resetModRegistry();
  _resetModDataSync();
});

