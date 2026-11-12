import test from 'node:test';
import assert from 'node:assert/strict';

import {
  registerVirtualMod,
  clearVirtualMods,
  discoverMods,
} from '../../src/systems/mods/modRegistry.js';
import {
  syncModData,
  _resetModDataSync,
  getQualityDamageModifier,
  getQualityArmorModifier,
  getQualityPriceMultiplier,
  getQualityConditionLossMultiplier,
  getQualityConditionMaxMultiplier,
  getEffectiveWeaponMaterialModifier,
  getEffectiveMaterialArmorValue,
  isMaterialsRebalanced,
  rollItemQuality,
} from '../../src/systems/mods/modDataSync.js';
import {
  itemBaseValue,
  setItemFields,
  mintCondition,
} from '../../src/systems/item/itemTemplates.js';
import { itemArmorValue, materialArmorValue, ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { itemFindings } from '../../src/systems/item/itemLaw.js';
import { itemQualityText, itemStatRows, weaponDamageRange } from '../../src/systems/item/itemInfo.js';
import { calculateAttackDamage } from '../../src/combat/formulas.js';
import { WEAPONS_ENUM } from '../../src/combat/enemyEquipment.js';

test('items-quality: data sync and calculations', (t) => {
  clearVirtualMods();
  _resetModDataSync();

  // Test default (un-modded) baseline
  assert.equal(getQualityDamageModifier(0), -1);
  assert.equal(getQualityDamageModifier(1), 0);
  assert.equal(getQualityDamageModifier(4), 3);
  assert.equal(getQualityArmorModifier(0), -1);
  assert.equal(getQualityArmorModifier(1), 0);
  assert.equal(getQualityArmorModifier(4), 3);
  assert.equal(getQualityPriceMultiplier(1), 1.0);
  assert.equal(getQualityPriceMultiplier(4), 4.0);
  assert.equal(isMaterialsRebalanced(), false);

  // Register items-quality virtual mod
  registerVirtualMod(
    {
      id: 'items-quality',
      name: 'Items Quality & Rebalance',
      version: '1.0.0',
      enabled: true,
      data: {
        quality: 'quality.json',
        materials: 'materials.json',
      },
    },
    {
      'quality.json': JSON.stringify({
        tiers: [
          { tier: 0, id: 'crude', damageModifier: -1, armorModifier: -1, priceMultiplier: 0.6, conditionLossMultiplier: 1.25, conditionMaxMultiplier: 0.85 },
          { tier: 1, id: 'standard', damageModifier: 0, armorModifier: 0, priceMultiplier: 1.0, conditionLossMultiplier: 1.0, conditionMaxMultiplier: 1.0 },
          { tier: 2, id: 'fine', damageModifier: 1, armorModifier: 1, priceMultiplier: 1.5, conditionLossMultiplier: 0.85, conditionMaxMultiplier: 1.15 },
          { tier: 3, id: 'superior', damageModifier: 2, armorModifier: 2, priceMultiplier: 2.5, conditionLossMultiplier: 0.7, conditionMaxMultiplier: 1.3 },
          { tier: 4, id: 'masterwork', damageModifier: 3, armorModifier: 3, priceMultiplier: 4.0, conditionLossMultiplier: 0.5, conditionMaxMultiplier: 1.5 },
        ],
      }),
      'materials.json': JSON.stringify({
        rebalanced: true,
        weaponModifiers: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4],
        armorLadder: {
          leather: 4,
          chain: 6,
          plate: [7, 8, 8, 9, 10, 11, 11, 12, 13, 14],
        },
      }),
    },
  );

  syncModData();

  assert.equal(isMaterialsRebalanced(), true);
  // Rebalanced weapon modifiers: Iron(0) is 0, Daedric(9) is 4
  assert.equal(getEffectiveWeaponMaterialModifier(0), 0);
  assert.equal(getEffectiveWeaponMaterialModifier(9), 4);

  // Rebalanced armor ladder: Leather is 4, Iron plate is 7, Daedric plate is 14
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Leather), 4);
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Iron), 7);
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Daedric), 14);

  // Quality multipliers
  assert.equal(getQualityPriceMultiplier(0), 0.6);
  assert.equal(getQualityPriceMultiplier(1), 1.0);
  assert.equal(getQualityPriceMultiplier(2), 1.5);
  assert.equal(getQualityPriceMultiplier(3), 2.5);
  assert.equal(getQualityPriceMultiplier(4), 4.0);

  assert.equal(getQualityConditionLossMultiplier(0), 1.25);
  assert.equal(getQualityConditionLossMultiplier(4), 0.5);

  assert.equal(getQualityConditionMaxMultiplier(0), 0.85);
  assert.equal(getQualityConditionMaxMultiplier(4), 1.5);

  clearVirtualMods();
  _resetModDataSync();
});

test('items-quality: item law and save compatibility', () => {
  // Items with quality 0..4 are lawful without provenance
  for (let q = 0; q <= 4; q++) {
    const sword = {
      group: 'Weapons',
      templateIndex: WEAPONS_ENUM.Longsword,
      material: 1, // Steel
      quality: q,
      currentCondition: 100,
      maxCondition: 100,
      value: 100,
      weightInKg: 2.0,
      flags: 0,
    };
    const findings = itemFindings(sword);
    assert.deepEqual(findings, [], `Quality ${q} sword must be lawful`);
  }

  // setItemFields defaults missing quality to 1 (Standard)
  const legacyItem = {
    group: 'Weapons',
    templateIndex: WEAPONS_ENUM.Broadsword,
    material: 0,
  };
  const filled = setItemFields(legacyItem);
  assert.equal(filled.quality, 1, 'Legacy weapon must default to Standard (1)');
});

test('items-quality: value and condition scaling', () => {
  _resetModDataSync();

  const baseBroadsword = { group: 'Weapons', templateIndex: WEAPONS_ENUM.Broadsword, material: 1 };
  const standardSword = setItemFields({ ...baseBroadsword, quality: 1 });
  const masterworkSword = setItemFields({ ...baseBroadsword, quality: 4 });
  const crudeSword = setItemFields({ ...baseBroadsword, quality: 0 });

  assert.ok(masterworkSword.value > standardSword.value, 'Masterwork should cost more than standard');
  assert.ok(crudeSword.value < standardSword.value, 'Crude should cost less than standard');
  assert.equal(masterworkSword.value, Math.round(standardSword.value * 4.0));

  // Condition scaling
  const mintedStd = mintCondition({ ...standardSword });
  const mintedMw = mintCondition({ ...masterworkSword });
  assert.ok(mintedMw.maxCondition > mintedStd.maxCondition, 'Masterwork should have higher max condition');
});

test('items-quality: armor value with quality tiers', () => {
  _resetModDataSync();

  const stdCuirass = { group: 'Armor', templateIndex: 102, material: ARMOR_MATERIAL.Iron, quality: 1 };
  const mwCuirass = { group: 'Armor', templateIndex: 102, material: ARMOR_MATERIAL.Iron, quality: 4 };
  const crudeCuirass = { group: 'Armor', templateIndex: 102, material: ARMOR_MATERIAL.Iron, quality: 0 };

  const baseIronVal = materialArmorValue(ARMOR_MATERIAL.Iron);
  assert.equal(itemArmorValue(stdCuirass), baseIronVal);
  assert.equal(itemArmorValue(mwCuirass), baseIronVal + 3);
  assert.equal(itemArmorValue(crudeCuirass), baseIronVal - 1);
});

test('items-quality: tooltips and info display', () => {
  _resetModDataSync();

  const mwSword = { group: 'Weapons', templateIndex: WEAPONS_ENUM.Longsword, material: 1, quality: 4 };
  assert.equal(itemQualityText(mwSword), 'Masterwork');

  const rows = itemStatRows(mwSword);
  const qRow = rows.find((r) => r.label === 'Quality');
  assert.ok(qRow, 'Stat rows should include Quality');
  assert.equal(qRow.text, 'Masterwork');

  const crudeSword = { group: 'Weapons', templateIndex: WEAPONS_ENUM.Longsword, material: 1, quality: 0 };
  assert.equal(itemQualityText(crudeSword), 'Crude');

  // Damage range with quality
  const [stdMin, stdMax] = weaponDamageRange({ group: 'Weapons', templateIndex: WEAPONS_ENUM.Longsword, material: 1, quality: 1 });
  const [mwMin, mwMax] = weaponDamageRange({ group: 'Weapons', templateIndex: WEAPONS_ENUM.Longsword, material: 1, quality: 4 });
  assert.equal(mwMin, stdMin + 3);
  assert.equal(mwMax, stdMax + 3);
});

test('items-quality: roll quality distribution', () => {
  // Test rollItemQuality level gating
  const mockRoll = (val) => () => val;

  // Level 1: roll high should give Superior at most (no Masterwork)
  const lowLvlResult = rollItemQuality(1, mockRoll(0.999));
  assert.ok(lowLvlResult <= 3, 'Level 1 cannot roll Masterwork (tier 4)');

  // Level 10: roll high can give Masterwork
  const highLvlResult = rollItemQuality(10, mockRoll(0.999));
  assert.equal(highLvlResult, 4, 'Level 10 with max roll should give Masterwork');
});
