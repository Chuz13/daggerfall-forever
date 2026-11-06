// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge } from '../../src/systems/mods/jsonMerge.js';

test('jsonMerge: deep object property merge with immutability', () => {
  const base = {
    combat: {
      fatigueMultiplier: 1.0,
      materials: { iron: 1.0, steel: 1.1 },
    },
    version: 1,
  };

  const override = {
    combat: {
      fatigueMultiplier: 1.25,
      materials: { steel: 1.3, ebony: 2.0 },
    },
  };

  const result = deepMerge(base, override);

  // Original unmodified
  assert.equal(base.combat.fatigueMultiplier, 1.0);
  assert.equal(base.combat.materials.ebony, undefined);

  // Merged output
  assert.equal(result.combat.fatigueMultiplier, 1.25);
  assert.equal(result.combat.materials.iron, 1.0);
  assert.equal(result.combat.materials.steel, 1.3);
  assert.equal(result.combat.materials.ebony, 2.0);
  assert.equal(result.version, 1);
});

test('jsonMerge: array of keyed items merge and append', () => {
  const baseRecipes = [
    { name: 'healHealth', price: 50, effect: '1,0' },
    { name: 'stamina', price: 40, effect: '26,255' },
  ];

  const modRecipes = [
    { name: 'stamina', price: 60 }, // modifies price
    { name: 'customFrostWard', price: 80, effect: '8,1' }, // appends new
  ];

  const merged = deepMerge(baseRecipes, modRecipes);

  assert.equal(merged.length, 3);
  assert.equal(merged[0].name, 'healHealth');
  assert.equal(merged[1].name, 'stamina');
  assert.equal(merged[1].price, 60);
  assert.equal(merged[1].effect, '26,255');
  assert.equal(merged[2].name, 'customFrostWard');
  assert.equal(merged[2].price, 80);
});
