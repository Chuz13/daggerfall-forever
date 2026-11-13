// @ts-check
// DFF DATA-DRIVEN SYNC DISPATCHER
//
// Reads JSON data overrides from active mods in load order and provides safe,
// non-destructive APIs for game systems (Combat, Potions, Encounters).
// Defaults to exact vanilla values (zero side effects) if no mods are installed.

import { getActiveMods, readModFile } from './modRegistry.js';
import { deepMerge } from './jsonMerge.js';
import { POTION_RECIPES } from '../potionRecipes.js';
import { overridePotionRecipes } from '../potions.js';
import { isPlate, isChain, isLeather, plateMetal, registerMaterialArmorResolver, registerQualityArmorModifierResolver } from '../armorMaterials.js';
import { ENEMY_GROUPS, enemyEntityGroup } from '../../combat/enemyGroups.js';

export const VANILLA_WEAPON_MATERIAL_MODIFIER = Object.freeze([-1, 0, 0, 1, 2, 3, 3, 4, 5, 6]);
export const REBALANCED_WEAPON_MATERIAL_MODIFIER = Object.freeze([0, 0, 0, 1, 1, 2, 2, 3, 3, 4]);

export const DEFAULT_QUALITY_TIERS = Object.freeze([
  Object.freeze({ tier: 0, id: 'crude', damageModifier: -1, armorModifier: -1, conditionLossMultiplier: 1.25, conditionMaxMultiplier: 0.85, priceMultiplier: 0.6, baseWeight: 15 }),
  Object.freeze({ tier: 1, id: 'standard', damageModifier: 0, armorModifier: 0, conditionLossMultiplier: 1.0, conditionMaxMultiplier: 1.0, priceMultiplier: 1.0, baseWeight: 55 }),
  Object.freeze({ tier: 2, id: 'fine', damageModifier: 1, armorModifier: 1, conditionLossMultiplier: 0.85, conditionMaxMultiplier: 1.15, priceMultiplier: 1.5, baseWeight: 20 }),
  Object.freeze({ tier: 3, id: 'superior', damageModifier: 2, armorModifier: 2, conditionLossMultiplier: 0.7, conditionMaxMultiplier: 1.3, priceMultiplier: 2.5, baseWeight: 8 }),
  Object.freeze({ tier: 4, id: 'masterwork', damageModifier: 3, armorModifier: 3, conditionLossMultiplier: 0.5, conditionMaxMultiplier: 1.5, priceMultiplier: 4.0, baseWeight: 2 }),
]);

export const MATERIAL_NAMES = Object.freeze([
  'Iron',
  'Steel',
  'Silver',
  'Elven',
  'Dwarven',
  'Mithril',
  'Adamantium',
  'Ebony',
  'Orcish',
  'Daedric',
]);

/**
 * Default vanilla combat fatigue multipliers.
 */
const DEFAULT_COMBAT_CONFIG = {
  heavyArmorFatigueMultiplier: 1.0,
  mediumArmorFatigueMultiplier: 1.0,
  lightArmorFatigueMultiplier: 1.0,
};

/**
 * Default materials configuration (1.0 / 0.0 = vanilla behavior).
 */
const DEFAULT_MATERIALS_CONFIG = {
  Iron: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0 },
  Steel: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0 },
  Silver: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, vsUndeadMultiplier: 1.0, vsWerecreatureMultiplier: 1.0 },
  Elven: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0 },
  Dwarven: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0 },
  Mithril: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0 },
  Adamantium: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0 },
  Ebony: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, minStrength: 0, lowStrengthSpeedPenalty: 1.0 },
  Orcish: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0 },
  Daedric: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0 },
};

let _currentCombatConfig = { ...DEFAULT_COMBAT_CONFIG };
let _currentMaterialsConfig = JSON.parse(JSON.stringify(DEFAULT_MATERIALS_CONFIG));
let _currentQualityConfig = [...DEFAULT_QUALITY_TIERS];
let _isQualityEnabled = false;
let _isMaterialsRebalanced = false;
let _rebalancedWeaponModifiers = [...REBALANCED_WEAPON_MATERIAL_MODIFIER];
let _rebalancedArmorLadder = {
  leather: 4,
  chain: 6,
  plate: [7, 8, 8, 9, 10, 11, 11, 12, 13, 14],
};
let _synced = false;

registerMaterialArmorResolver(getEffectiveMaterialArmorValue);
registerQualityArmorModifierResolver(getQualityArmorModifier);

/**
 * Sync and apply all data modifications from active mods.
 */
export function syncModData() {
  _currentCombatConfig = { ...DEFAULT_COMBAT_CONFIG };
  _currentMaterialsConfig = JSON.parse(JSON.stringify(DEFAULT_MATERIALS_CONFIG));
  _currentQualityConfig = [...DEFAULT_QUALITY_TIERS];
  _isQualityEnabled = false;
  _isMaterialsRebalanced = false;
  _rebalancedWeaponModifiers = [...REBALANCED_WEAPON_MATERIAL_MODIFIER];
  _rebalancedArmorLadder = {
    leather: 4,
    chain: 6,
    plate: [7, 8, 8, 9, 10, 11, 11, 12, 13, 14],
  };
  const activeMods = getActiveMods();

  // 1. Sync Combat Overrides
  for (const mod of activeMods) {
    const combatFile = mod.manifest?.data?.combat;
    if (combatFile) {
      const raw = readModFile(mod.id, combatFile);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          _currentCombatConfig = deepMerge(_currentCombatConfig, parsed);
        } catch (e) {
          console.error(`[ModDataSync] Failed to parse combat data in mod ${mod.id}:`, e);
        }
      }
    }
  }

  // 2. Sync Potion Recipes
  /** @type {any[]} */
  let aggregatedPotions = [...POTION_RECIPES];
  let customPotionsAdded = false;

  for (const mod of activeMods) {
    const potionFile = mod.manifest?.data?.potions;
    if (potionFile) {
      const raw = readModFile(mod.id, potionFile);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            aggregatedPotions = deepMerge(aggregatedPotions, parsed);
            customPotionsAdded = true;
          }
        } catch (e) {
          console.error(`[ModDataSync] Failed to parse potion data in mod ${mod.id}:`, e);
        }
      }
    }
  }

  if (customPotionsAdded) {
    overridePotionRecipes(aggregatedPotions);
  }

  // 3. Sync Materials Overrides
  for (const mod of activeMods) {
    const materialsFile = mod.manifest?.data?.materials;
    if (materialsFile) {
      const raw = readModFile(mod.id, materialsFile);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.rebalanced === true) {
            _isMaterialsRebalanced = true;
          }
          if (Array.isArray(parsed.weaponModifiers)) {
            _rebalancedWeaponModifiers = [...parsed.weaponModifiers];
          }
          if (parsed.armorLadder) {
            _rebalancedArmorLadder = { ..._rebalancedArmorLadder, ...parsed.armorLadder };
          }
          _currentMaterialsConfig = deepMerge(_currentMaterialsConfig, parsed);
        } catch (e) {
          console.error(`[ModDataSync] Failed to parse materials data in mod ${mod.id}:`, e);
        }
      }
    }
  }

  // 4. Sync Quality Overrides
  for (const mod of activeMods) {
    const qualityFile = mod.manifest?.data?.quality;
    if (qualityFile) {
      const raw = readModFile(mod.id, qualityFile);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.tiers)) {
            _currentQualityConfig = parsed.tiers;
            _isQualityEnabled = true;
          }
        } catch (e) {
          console.error(`[ModDataSync] Failed to parse quality data in mod ${mod.id}:`, e);
        }
      }
    }
  }

  registerMaterialArmorResolver(getEffectiveMaterialArmorValue);
  registerQualityArmorModifierResolver(getQualityArmorModifier);

  _synced = true;
}

/**
 * Identify worn armor classes for an entity.
 * @param {any} entity
 * @returns {{ hasHeavy: boolean, hasMedium: boolean, hasLight: boolean }}
 */
export function getEntityWornArmorClasses(entity) {
  if (!entity) return { hasHeavy: false, hasMedium: false, hasLight: false };
  const slots = entity.equip?.slots ?? {};
  let hasHeavy = false;
  let hasMedium = false;
  let hasLight = false;

  for (const item of Object.values(slots)) {
    if (!item || (item.group && item.group !== 'Armor') || item.material === undefined) continue;
    const m = item.material;
    if (isPlate(m)) hasHeavy = true;
    else if (isChain(m)) hasMedium = true;
    else if (isLeather(m)) hasLight = true;
  }

  return { hasHeavy, hasMedium, hasLight };
}

/**
 * Calculate fatigue scale based on active mod configs and player's worn armor.
 * @param {any} entity
 * @returns {number} Multiplier (1.0 = vanilla unchanged)
 */
export function getModArmorFatigueScale(entity) {
  if (!_synced) syncModData();

  // If no overrides were loaded, short-circuit to 1.0
  if (
    _currentCombatConfig.heavyArmorFatigueMultiplier === 1.0 &&
    _currentCombatConfig.mediumArmorFatigueMultiplier === 1.0 &&
    _currentCombatConfig.lightArmorFatigueMultiplier === 1.0
  ) {
    return 1.0;
  }

  const { hasHeavy, hasMedium, hasLight } = getEntityWornArmorClasses(entity);
  if (hasHeavy) return _currentCombatConfig.heavyArmorFatigueMultiplier ?? 1.0;
  if (hasMedium) return _currentCombatConfig.mediumArmorFatigueMultiplier ?? 1.0;
  if (hasLight) return _currentCombatConfig.lightArmorFatigueMultiplier ?? 1.0;
  return 1.0;
}

/**
 * Get the active combat data configuration.
 */
export function getModCombatConfig() {
  if (!_synced) syncModData();
  return { ..._currentCombatConfig };
}

/**
 * Get the active materials configuration.
 */
export function getModMaterialsConfig() {
  if (!_synced) syncModData();
  return { ..._currentMaterialsConfig };
}

/**
 * Get configuration object for a specific material by index (0..9) or name.
 * @param {number|string} material
 */
export function getMaterialConfig(material) {
  if (!_synced) syncModData();
  const name = typeof material === 'number' ? MATERIAL_NAMES[material] : material;
  return _currentMaterialsConfig[name] ?? null;
}

/**
 * Calculate damage multiplier for a material against a specific target.
 * @param {number} materialIndex
 * @param {any} target
 * @returns {number} Multiplier (1.0 = normal)
 */
export function getMaterialDamageMultiplier(materialIndex, target) {
  const cfg = getMaterialConfig(materialIndex);
  if (!cfg) return 1.0;

  let mult = cfg.damageMultiplier ?? 1.0;

  if (target) {
    const isMonsterCareer = !target.isClass && target.careerIndex !== undefined;
    const isUndead =
      Boolean(target.isUndead) ||
      target.affinity === 'Undead' ||
      (isMonsterCareer && enemyEntityGroup(target.careerIndex) === ENEMY_GROUPS.Undead);

    if (isUndead && cfg.vsUndeadMultiplier) {
      mult *= cfg.vsUndeadMultiplier;
    }

    const isWerecreature =
      Boolean(target.isWerecreature) ||
      (isMonsterCareer &&
        (target.careerIndex === 9 || target.careerIndex === 14 ||
          (enemyEntityGroup(target.careerIndex) === ENEMY_GROUPS.Animals && target.minMetalToHit >= 2)));

    if (isWerecreature && cfg.vsWerecreatureMultiplier) {
      mult *= cfg.vsWerecreatureMultiplier;
    }
  }

  return mult;
}

/**
 * Calculate swing speed multiplier (e.g. 1.2 = 20% faster, 0.75 = 25% slower).
 * @param {number} materialIndex
 * @param {number} [strength=50]
 * @returns {number}
 */
export function getMaterialSwingSpeedMultiplier(materialIndex, strength = 50) {
  const cfg = getMaterialConfig(materialIndex);
  if (!cfg) return 1.0;

  let speedMult = cfg.swingSpeedMultiplier ?? 1.0;

  if (cfg.minStrength && strength < cfg.minStrength) {
    speedMult *= cfg.lowStrengthSpeedPenalty ?? 0.8;
  }

  return speedMult;
}

/**
 * Calculate weapon condition loss multiplier (e.g. 1.5 = breaks 50% faster, 0.3 = 70% more durable).
 * @param {number} materialIndex
 * @returns {number}
 */
export function getMaterialConditionLossMultiplier(materialIndex) {
  const cfg = getMaterialConfig(materialIndex);
  return cfg?.conditionLossMultiplier ?? 1.0;
}

/**
 * Calculate attack swing fatigue cost multiplier (e.g. 0.8 = 20% less fatigue cost).
 * @param {number} materialIndex
 * @returns {number}
 */
export function getMaterialFatigueCostMultiplier(materialIndex) {
  const cfg = getMaterialConfig(materialIndex);
  return cfg?.fatigueCostMultiplier ?? 1.0;
}

/**
 * Get chance to sunder/damage enemy armor (0.0 to 1.0).
 * @param {number} materialIndex
 * @returns {number}
 */
export function getMaterialSunderArmorChance(materialIndex) {
  const cfg = getMaterialConfig(materialIndex);
  return cfg?.sunderArmorChance ?? 0.0;
}

/**
 * Get stamina drain amount applied on successful hit.
 * @param {number} materialIndex
 * @returns {number}
 */
export function getMaterialStaminaDrain(materialIndex) {
  const cfg = getMaterialConfig(materialIndex);
  return cfg?.staminaDrainOnHit ?? 0;
}

/**
 * Check whether item quality mod is currently active.
 * @returns {boolean}
 */
export function isQualityEnabled() {
  if (!_synced) syncModData();
  return _isQualityEnabled;
}

/**
 * Get quality configuration for a given quality tier (0: Crude .. 4: Masterwork).
 * @param {number|undefined|null} quality
 */
export function getQualityConfig(quality) {
  if (!_synced) syncModData();
  if (!_isQualityEnabled) {
    return DEFAULT_QUALITY_TIERS[1];
  }
  const q = Number.isInteger(quality) ? Math.max(0, Math.min(4, Number(quality))) : 1;
  return _currentQualityConfig[q] ?? DEFAULT_QUALITY_TIERS[1];
}

/**
 * Get damage modifier for an item's quality.
 * @param {number|undefined|null} quality
 * @returns {number}
 */
export function getQualityDamageModifier(quality) {
  if (!_synced) syncModData();
  if (!_isQualityEnabled) return 0;
  return getQualityConfig(quality).damageModifier ?? 0;
}

/**
 * Get armor rating modifier for an item's quality.
 * @param {number|undefined|null} quality
 * @returns {number}
 */
export function getQualityArmorModifier(quality) {
  if (!_synced) syncModData();
  if (!_isQualityEnabled) return 0;
  return getQualityConfig(quality).armorModifier ?? 0;
}

/**
 * Get base price multiplier for an item's quality.
 * @param {number|undefined|null} quality
 * @returns {number}
 */
export function getQualityPriceMultiplier(quality) {
  if (!_synced) syncModData();
  if (!_isQualityEnabled) return 1.0;
  return getQualityConfig(quality).priceMultiplier ?? 1.0;
}

/**
 * Get condition degradation loss multiplier for an item's quality (e.g. 1.25 for crude, 0.5 for masterwork).
 * @param {number|undefined|null} quality
 * @returns {number}
 */
export function getQualityConditionLossMultiplier(quality) {
  if (!_synced) syncModData();
  if (!_isQualityEnabled) return 1.0;
  return getQualityConfig(quality).conditionLossMultiplier ?? 1.0;
}

/**
 * Get max condition multiplier for an item's quality (e.g. 0.85 for crude, 1.5 for masterwork).
 * @param {number|undefined|null} quality
 * @returns {number}
 */
export function getQualityConditionMaxMultiplier(quality) {
  if (!_synced) syncModData();
  if (!_isQualityEnabled) return 1.0;
  return getQualityConfig(quality).conditionMaxMultiplier ?? 1.0;
}

/**
 * Check whether materials rebalancing is currently active.
 * @returns {boolean}
 */
export function isMaterialsRebalanced() {
  if (!_synced) syncModData();
  return _isMaterialsRebalanced;
}

/**
 * Get weapon material damage modifier (Iron..Daedric).
 * Uses rebalanced values if active, otherwise exact vanilla table.
 * @param {number|undefined|null} materialIndex
 * @returns {number}
 */
export function getEffectiveWeaponMaterialModifier(materialIndex) {
  if (!_synced) syncModData();
  const m = Number.isInteger(materialIndex) ? Number(materialIndex) : 0;
  if (_isMaterialsRebalanced) {
    return _rebalancedWeaponModifiers[m] ?? 0;
  }
  return VANILLA_WEAPON_MATERIAL_MODIFIER[m] ?? 0;
}

/**
 * Get effective material armor rating (Leather, Chain, Iron..Daedric).
 * Returns null if rebalance is not active (falling back to vanilla materialArmorValue).
 * @param {number|undefined|null} material
 * @returns {number|null}
 */
export function getEffectiveMaterialArmorValue(material) {
  if (!_synced) syncModData();
  if (!_isMaterialsRebalanced) return null;
  if (isLeather(material)) return _rebalancedArmorLadder.leather ?? 4;
  if (isChain(material)) return _rebalancedArmorLadder.chain ?? 6;
  if (isPlate(material)) {
    const p = plateMetal(material);
    if (p !== null) {
      return _rebalancedArmorLadder.plate?.[p] ?? 7;
    }
  }
  return null;
}

/**
 * Roll a quality tier (0: Crude, 1: Standard, 2: Fine, 3: Superior, 4: Masterwork)
 * taking player/item level gating into account.
 * If quality mod is not enabled, always returns 1 (Standard).
 * @param {number} [level=1]
 * @param {() => number} [rolls=Math.random]
 * @returns {number}
 */
export function rollItemQuality(level = 1, rolls = Math.random) {
  if (!_synced) syncModData();
  if (!_isQualityEnabled) return 1;

  let w0 = 15;
  let w1 = 55;
  let w2 = 20;
  let w3 = 8;
  let w4 = 2;

  if (level < 3) {
    w4 = 0;
    w3 = 3;
    w1 += 7;
  } else if (level < 6) {
    w4 = 1;
    w3 = 6;
    w1 += 3;
  }

  const total = w0 + w1 + w2 + w3 + w4;
  let roll = Math.floor(rolls() * total);
  if (roll < w0) return 0;
  roll -= w0;
  if (roll < w1) return 1;
  roll -= w1;
  if (roll < w2) return 2;
  roll -= w2;
  if (roll < w3) return 3;
  return 4;
}

/**
 * Roll a quality tier for shop shelves (0: Crude, 1: Standard, 2: Fine, 3: Superior, 4: Masterwork)
 * taking shop quality (0..20) into account.
 * If quality mod is not enabled, always returns 1 (Standard).
 * @param {number} [shopQuality=10]
 * @param {() => number} [rolls=Math.random]
 * @returns {number}
 */
export function rollShopItemQuality(shopQuality = 10, rolls = Math.random) {
  if (!_synced) syncModData();
  if (!_isQualityEnabled) return 1;

  const sq = Math.max(0, Math.min(20, Math.round(Number(shopQuality) || 10)));
  let w0 = 5;
  let w1 = 65;
  let w2 = 25;
  let w3 = 5;
  let w4 = 0;

  if (sq <= 4) {
    // 0..4 (Decrepit / Rusty / Flea shops)
    w0 = 35;
    w1 = 55;
    w2 = 10;
    w3 = 0;
    w4 = 0;
  } else if (sq <= 9) {
    // 5..9 (Shabby / Modest shops)
    w0 = 20;
    w1 = 65;
    w2 = 15;
    w3 = 0;
    w4 = 0;
  } else if (sq <= 14) {
    // 10..14 (Average / Good shops)
    w0 = 5;
    w1 = 65;
    w2 = 25;
    w3 = 5;
    w4 = 0;
  } else if (sq <= 18) {
    // 15..18 (Quality / Fine shops)
    w0 = 0;
    w1 = 40;
    w2 = 40;
    w3 = 17;
    w4 = 3;
  } else {
    // 19..20 (Palatial / "Finest" shops, like Togar's Finest Shields)
    w0 = 0;
    w1 = 20;
    w2 = 45;
    w3 = 25;
    w4 = 10;
  }

  const total = w0 + w1 + w2 + w3 + w4;
  let roll = Math.floor(rolls() * total);
  if (roll < w0) return 0;
  roll -= w0;
  if (roll < w1) return 1;
  roll -= w1;
  if (roll < w2) return 2;
  roll -= w2;
  if (roll < w3) return 3;
  return 4;
}

/**
 * Reset data sync state (for test isolation).
 */
export function _resetModDataSync() {
  _currentCombatConfig = { ...DEFAULT_COMBAT_CONFIG };
  _currentMaterialsConfig = JSON.parse(JSON.stringify(DEFAULT_MATERIALS_CONFIG));
  _currentQualityConfig = [...DEFAULT_QUALITY_TIERS];
  _isQualityEnabled = false;
  _isMaterialsRebalanced = false;
  _rebalancedWeaponModifiers = [...REBALANCED_WEAPON_MATERIAL_MODIFIER];
  _rebalancedArmorLadder = {
    leather: 4,
    chain: 6,
    plate: [7, 8, 8, 9, 10, 11, 11, 12, 13, 14],
  };
  registerMaterialArmorResolver(getEffectiveMaterialArmorValue);
  registerQualityArmorModifierResolver(getQualityArmorModifier);
  _synced = false;
  overridePotionRecipes(null);
}
