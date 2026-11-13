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
  isQualityEnabled,
  rollItemQuality,
  rollShopItemQuality,
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
import { stockShopShelf } from '../../src/systems/shopStock.js';
import { BUILDING_TYPES } from '../../src/world/buildingNames.js';
import { itemLine } from '../../src/ui/enhanced/enhancedInventory.js';

test('items-quality: zero changes when mod is disabled (exact vanilla baseline)', () => {
  clearVirtualMods();
  _resetModDataSync();
  syncModData();

  // Mod is inactive
  assert.equal(isQualityEnabled(), false);
  assert.equal(isMaterialsRebalanced(), false);

  // All quality modifiers are strictly zero / 1.0
  for (let q = 0; q <= 4; q++) {
    assert.equal(getQualityDamageModifier(q), 0);
    assert.equal(getQualityArmorModifier(q), 0);
    assert.equal(getQualityPriceMultiplier(q), 1.0);
    assert.equal(getQualityConditionLossMultiplier(q), 1.0);
    assert.equal(getQualityConditionMaxMultiplier(q), 1.0);
  }

  // Roll quality always gives 1 (Standard)
  for (let lvl = 1; lvl <= 20; lvl += 5) {
    assert.equal(rollItemQuality(lvl, () => 0.0), 1);
    assert.equal(rollItemQuality(lvl, () => 0.999), 1);
  }

  // Exact vanilla material modifiers
  assert.equal(getEffectiveWeaponMaterialModifier(0), -1); // Iron
  assert.equal(getEffectiveWeaponMaterialModifier(1), 0);  // Steel
  assert.equal(getEffectiveWeaponMaterialModifier(9), 6);  // Daedric

  // Exact vanilla armor values
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Leather), 3);
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Chain), 6);
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Iron), 7);
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Daedric), 21);

  // Tooltips show NO quality line when mod is off
  const sword = { group: 'Weapons', templateIndex: WEAPONS_ENUM.Longsword, material: 1, quality: 4 };
  assert.equal(itemQualityText(sword), null);
  const rows = itemStatRows(sword);
  assert.equal(rows.some((r) => r.label === 'Quality'), false);
});

test('items-quality: active mod data sync and calculations', () => {
  clearVirtualMods();
  _resetModDataSync();

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

  assert.equal(isQualityEnabled(), true);
  assert.equal(isMaterialsRebalanced(), true);

  // Quality modifiers when active
  assert.equal(getQualityDamageModifier(0), -1);
  assert.equal(getQualityDamageModifier(1), 0);
  assert.equal(getQualityDamageModifier(2), 1);
  assert.equal(getQualityDamageModifier(3), 2);
  assert.equal(getQualityDamageModifier(4), 3);

  assert.equal(getQualityArmorModifier(0), -1);
  assert.equal(getQualityArmorModifier(1), 0);
  assert.equal(getQualityArmorModifier(2), 1);
  assert.equal(getQualityArmorModifier(3), 2);
  assert.equal(getQualityArmorModifier(4), 3);

  assert.equal(getQualityPriceMultiplier(0), 0.6);
  assert.equal(getQualityPriceMultiplier(1), 1.0);
  assert.equal(getQualityPriceMultiplier(2), 1.5);
  assert.equal(getQualityPriceMultiplier(3), 2.5);
  assert.equal(getQualityPriceMultiplier(4), 4.0);

  assert.equal(getQualityConditionLossMultiplier(0), 1.25);
  assert.equal(getQualityConditionLossMultiplier(4), 0.5);

  assert.equal(getQualityConditionMaxMultiplier(0), 0.85);
  assert.equal(getQualityConditionMaxMultiplier(4), 1.5);

  // Rebalanced weapon modifiers: Iron(0) is 0, Daedric(9) is 4
  assert.equal(getEffectiveWeaponMaterialModifier(0), 0);
  assert.equal(getEffectiveWeaponMaterialModifier(9), 4);

  // Rebalanced armor ladder: Leather is 4, Iron plate is 7, Daedric plate is 14
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Leather), 4);
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Iron), 7);
  assert.equal(materialArmorValue(ARMOR_MATERIAL.Daedric), 14);

  // Tooltip with active mod
  const mwSword = { group: 'Weapons', templateIndex: WEAPONS_ENUM.Longsword, material: 1, quality: 4 };
  assert.equal(itemQualityText(mwSword), 'Masterwork');
  const rows = itemStatRows(mwSword);
  const qRow = rows.find((r) => r.label === 'Quality');
  assert.ok(qRow);
  assert.equal(qRow.text, 'Masterwork');

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

test('items-quality: value and condition scaling with active mod', () => {
  clearVirtualMods();
  _resetModDataSync();
  registerVirtualMod({
    id: 'items-quality',
    name: 'Items Quality & Rebalance',
    enabled: true,
    data: { quality: 'quality.json' },
  }, {
    'quality.json': JSON.stringify({ tiers: [
      { tier: 0, priceMultiplier: 0.6, conditionMaxMultiplier: 0.85 },
      { tier: 1, priceMultiplier: 1.0, conditionMaxMultiplier: 1.0 },
      { tier: 2, priceMultiplier: 1.5, conditionMaxMultiplier: 1.15 },
      { tier: 3, priceMultiplier: 2.5, conditionMaxMultiplier: 1.3 },
      { tier: 4, priceMultiplier: 4.0, conditionMaxMultiplier: 1.5 },
    ]}),
  });
  syncModData();

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

  clearVirtualMods();
  _resetModDataSync();
});

test('items-quality: armor value with quality tiers when active', () => {
  clearVirtualMods();
  _resetModDataSync();
  registerVirtualMod({
    id: 'items-quality',
    name: 'Items Quality & Rebalance',
    enabled: true,
    data: { quality: 'quality.json' },
  }, {
    'quality.json': JSON.stringify({ tiers: [
      { tier: 0, armorModifier: -1 },
      { tier: 1, armorModifier: 0 },
      { tier: 2, armorModifier: 1 },
      { tier: 3, armorModifier: 2 },
      { tier: 4, armorModifier: 3 },
    ]}),
  });
  syncModData();

  const stdCuirass = { group: 'Armor', templateIndex: 102, material: ARMOR_MATERIAL.Iron, quality: 1 };
  const mwCuirass = { group: 'Armor', templateIndex: 102, material: ARMOR_MATERIAL.Iron, quality: 4 };
  const crudeCuirass = { group: 'Armor', templateIndex: 102, material: ARMOR_MATERIAL.Iron, quality: 0 };

  const baseIronVal = materialArmorValue(ARMOR_MATERIAL.Iron);
  assert.equal(itemArmorValue(stdCuirass), baseIronVal);
  assert.equal(itemArmorValue(mwCuirass), baseIronVal + 3);
  assert.equal(itemArmorValue(crudeCuirass), baseIronVal - 1);

  clearVirtualMods();
  _resetModDataSync();
});

test('items-quality: roll quality distribution when active', () => {
  clearVirtualMods();
  _resetModDataSync();
  registerVirtualMod({
    id: 'items-quality',
    name: 'Items Quality & Rebalance',
    enabled: true,
    data: { quality: 'quality.json' },
  }, {
    'quality.json': JSON.stringify({ tiers: [{}, {}, {}, {}, {}] }),
  });
  syncModData();

  // Test rollItemQuality level gating
  const mockRoll = (val) => () => val;

  // Level 1: roll high should give Superior at most (no Masterwork)
  const lowLvlResult = rollItemQuality(1, mockRoll(0.999));
  assert.ok(lowLvlResult <= 3, 'Level 1 cannot roll Masterwork (tier 4)');

  // Level 10: roll high can give Masterwork
  const highLvlResult = rollItemQuality(10, mockRoll(0.999));
  assert.equal(highLvlResult, 4, 'Level 10 with max roll should give Masterwork');

  clearVirtualMods();
  _resetModDataSync();
});

test('items-quality: roll shop quality distribution and shelf stocking', () => {
  clearVirtualMods();
  _resetModDataSync();

  // 1. Mod disabled: rollShopItemQuality always returns 1 (Standard)
  assert.equal(isQualityEnabled(), false);
  for (let sq = 0; sq <= 20; sq += 5) {
    assert.equal(rollShopItemQuality(sq, () => 0.0), 1);
    assert.equal(rollShopItemQuality(sq, () => 0.999), 1);
  }

  // Stocking shop shelves with mod disabled: all weapons & armor have quality === 1
  const vanillaStock = stockShopShelf(
    { buildingType: BUILDING_TYPES.Armorer, quality: 18 },
    { level: 5 },
    { rolls: () => 0.5 },
  );
  const vanillaArmorOrWeapons = vanillaStock.filter((it) => it.group === 'Armor' || it.group === 'Weapons');
  assert.ok(vanillaArmorOrWeapons.length > 0, 'Shop stocked armor or weapons');
  for (const it of vanillaArmorOrWeapons) {
    assert.equal(it.quality, 1, 'Without mod, shelf item quality is standard (1)');
    const line = itemLine(it);
    assert.equal(line.quality, null, 'Without mod, itemLine quality is null');
  }

  // 2. Mod enabled:
  registerVirtualMod({
    id: 'items-quality',
    name: 'Items Quality & Rebalance',
    enabled: true,
    data: { quality: 'quality.json' },
  }, {
    'quality.json': JSON.stringify({
      tiers: [
        { tier: 0, id: 'crude', priceMultiplier: 0.6 },
        { tier: 1, id: 'standard', priceMultiplier: 1.0 },
        { tier: 2, id: 'fine', priceMultiplier: 1.5 },
        { tier: 3, id: 'superior', priceMultiplier: 2.5 },
        { tier: 4, id: 'masterwork', priceMultiplier: 4.0 },
      ],
    }),
  });
  syncModData();
  assert.equal(isQualityEnabled(), true);

  const mockRoll = (val) => () => val;

  // In decrepit shop (quality 2): 0.0 roll gives Crude (0), max roll gives Fine (2), never Superior/Masterwork
  assert.equal(rollShopItemQuality(2, mockRoll(0.0)), 0);
  assert.equal(rollShopItemQuality(2, mockRoll(0.999)), 2);

  // In palatial shop (quality 20): 0.0 roll gives Standard (1, no Crude!), max roll gives Masterwork (4)
  assert.equal(rollShopItemQuality(20, mockRoll(0.0)), 1);
  assert.equal(rollShopItemQuality(20, mockRoll(0.999)), 4);

  // Stocking shop shelf in high-end shop: verifies quality roll is active on shelf items
  let rollIdx = 0;
  // Use rolls that give Masterwork for quality roll (0.95) and pass dice100 (0.01)
  const controlledRoll = () => {
    rollIdx++;
    // Dice100 stock check: low roll
    // Quality roll: high roll (0.95 -> Masterwork in quality 20 shop)
    return rollIdx % 3 === 0 ? 0.95 : 0.01;
  };

  const modStock = stockShopShelf(
    { buildingType: BUILDING_TYPES.Armorer, quality: 20 },
    { level: 5 },
    { rolls: controlledRoll },
  );
  const modEquip = modStock.filter((it) => (it.group === 'Armor' || it.group === 'Weapons') && it.name !== 'Arrow' && it.name !== 'Hand Wraps');
  assert.ok(modEquip.length > 0, 'High-end shop stocked items');
  for (const it of modEquip) {
    assert.ok(it.quality >= 1 && it.quality <= 4, `Quality is valid tier, got ${it.quality}`);
    assert.notEqual(it.quality, 0, 'Quality 20 shop never rolls Crude (tier 0)');
    const line = itemLine(it);
    assert.ok(line.quality != null, 'itemLine has quality label');
  }

  clearVirtualMods();
  _resetModDataSync();
});
