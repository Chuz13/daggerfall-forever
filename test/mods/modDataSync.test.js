// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerVirtualMod,
  setModEnabled,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import {
  syncModData,
  getModArmorFatigueScale,
  _resetModDataSync,
} from '../../src/systems/mods/modDataSync.js';
import { potionRecipeByKey, potionRecipeKey } from '../../src/systems/potions.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';

test('modDataSync: default state returns vanilla multipliers (1.0) and leaves recipes intact', () => {
  _resetModRegistry();
  _resetModDataSync();

  const dummyHeavyEntity = {
    equip: {
      slots: {
        chest: { material: ARMOR_MATERIAL.Iron }, // Iron cuirass -> heavy
      },
    },
  };

  assert.equal(getModArmorFatigueScale(dummyHeavyEntity), 1.0);

  _resetModRegistry();
  _resetModDataSync();
});

test('modDataSync: applies combat and potion overrides from active mods', () => {
  _resetModRegistry();
  _resetModDataSync();

  // Register steel-and-sinew
  registerVirtualMod(
    {
      id: 'steel-and-sinew',
      name: 'Steel & Sinew',
      enabled: true,
      data: { combat: 'combat.json' },
    },
    {
      'combat.json': JSON.stringify({
        heavyArmorFatigueMultiplier: 1.25,
        lightArmorFatigueMultiplier: 0.85,
      }),
    }
  );

  // Register apothecary-elixirs
  registerVirtualMod(
    {
      id: 'apothecary-elixirs',
      name: 'Apothecary Elixirs',
      enabled: true,
      data: { potions: 'potions.json' },
    },
    {
      'potions.json': JSON.stringify([
        {
          name: 'frostwardCordial',
          price: 85,
          ingredients: [5, 22, 59],
          effect: '8,1',
          displayName: 'Frostward Cordial',
        },
      ]),
    }
  );

  syncModData();

  // 1. Verify Armor Fatigue Scales
  const heavyEntity = {
    equip: {
      slots: {
        chest: { material: ARMOR_MATERIAL.Iron }, // Iron plate
      },
    },
  };
  const lightEntity = {
    equip: {
      slots: {
        chest: { material: ARMOR_MATERIAL.Leather }, // Leather
      },
    },
  };
  const nakedEntity = {
    equip: {
      slots: {},
    },
  };

  assert.equal(getModArmorFatigueScale(heavyEntity), 1.25);
  assert.equal(getModArmorFatigueScale(lightEntity), 0.85);
  assert.equal(getModArmorFatigueScale(nakedEntity), 1.0);

  // 2. Verify Potion Injection
  const customKey = potionRecipeKey([5, 22, 59]);
  const recipe = potionRecipeByKey(customKey);
  assert.ok(recipe, 'Custom potion should be discoverable by ingredient key');
  assert.equal(recipe.displayName, 'Frostward Cordial');
  assert.equal(recipe.effect, '8,1');

  // 3. Verify Vanilla Potions remain functional
  // Vanilla resistFrost recipe ingredients: [5, 14, 22, 64]
  const vanillaKey = potionRecipeKey([5, 14, 22, 64]);
  const vanillaRecipe = potionRecipeByKey(vanillaKey);
  assert.ok(vanillaRecipe, 'Vanilla resistFrost must still resolve');
  assert.equal(vanillaRecipe.name, 'resistFrost');

  // 4. Test disabling mod resets back to vanilla
  setModEnabled('steel-and-sinew', false);
  syncModData();
  assert.equal(getModArmorFatigueScale(heavyEntity), 1.0);

  _resetModRegistry();
  _resetModDataSync();
});
