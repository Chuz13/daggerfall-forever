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
import { isPlate, isChain, isLeather } from '../armorMaterials.js';
import { ENEMY_GROUPS, enemyEntityGroup } from '../../combat/enemyGroups.js';

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
  Iron: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, armorPenetration: 0.0 },
  Steel: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, armorPenetration: 0.0 },
  Silver: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, vsUndeadMultiplier: 1.0, vsWerecreatureMultiplier: 1.0 },
  Elven: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, armorPenetration: 0.0 },
  Dwarven: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, vsConstructMultiplier: 1.0 },
  Mithril: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, armorPenetration: 0.0 },
  Adamantium: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, armorPenetration: 0.0 },
  Ebony: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, minStrength: 0, lowStrengthSpeedPenalty: 1.0 },
  Orcish: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, armorPenetration: 0.0 },
  Daedric: { damageMultiplier: 1.0, swingSpeedMultiplier: 1.0, armorPenetration: 0.0 },
};

let _currentCombatConfig = { ...DEFAULT_COMBAT_CONFIG };
let _currentMaterialsConfig = JSON.parse(JSON.stringify(DEFAULT_MATERIALS_CONFIG));
let _synced = false;

/**
 * Sync and apply all data modifications from active mods.
 */
export function syncModData() {
  _currentCombatConfig = { ...DEFAULT_COMBAT_CONFIG };
  _currentMaterialsConfig = JSON.parse(JSON.stringify(DEFAULT_MATERIALS_CONFIG));
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
          _currentMaterialsConfig = deepMerge(_currentMaterialsConfig, parsed);
        } catch (e) {
          console.error(`[ModDataSync] Failed to parse materials data in mod ${mod.id}:`, e);
        }
      }
    }
  }

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
    if (!item || item.material === undefined) continue;
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
    const isUndead =
      target.careerIndex !== undefined &&
      (enemyEntityGroup(target.careerIndex) === ENEMY_GROUPS.Undead ||
        target.affinity === 'Undead' ||
        target.isUndead);

    if (isUndead && cfg.vsUndeadMultiplier) {
      mult *= cfg.vsUndeadMultiplier;
    }

    const isWerecreature =
      target.isWerecreature ||
      (target.careerIndex !== undefined && enemyEntityGroup(target.careerIndex) === ENEMY_GROUPS.Animals && target.minMetalToHit >= 2);

    if (isWerecreature && cfg.vsWerecreatureMultiplier) {
      mult *= cfg.vsWerecreatureMultiplier;
    }

    const isConstruct =
      target.isConstruct ||
      target.careerIndex === 17 || // Iron Golem
      target.careerIndex === 18;  // Centurion

    if (isConstruct && cfg.vsConstructMultiplier) {
      mult *= cfg.vsConstructMultiplier;
    }
  }

  return mult;
}

/**
 * Calculate armor penetration fraction (0.0 to 1.0) for a material.
 * @param {number} materialIndex
 * @returns {number}
 */
export function getMaterialArmorPenetration(materialIndex) {
  const cfg = getMaterialConfig(materialIndex);
  return cfg?.armorPenetration ?? 0.0;
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
 * Whether weapon inflicts holy burn DoT on undead.
 * @param {number} materialIndex
 * @returns {boolean}
 */
export function getMaterialHolyBurn(materialIndex) {
  const cfg = getMaterialConfig(materialIndex);
  return !!cfg?.holyBurn;
}

/**
 * Reset data sync state (for test isolation).
 */
export function _resetModDataSync() {
  _currentCombatConfig = { ...DEFAULT_COMBAT_CONFIG };
  _currentMaterialsConfig = JSON.parse(JSON.stringify(DEFAULT_MATERIALS_CONFIG));
  _synced = false;
  overridePotionRecipes(null);
}
