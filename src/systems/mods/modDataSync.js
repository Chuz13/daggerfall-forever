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

/**
 * Default vanilla combat fatigue multipliers.
 */
const DEFAULT_COMBAT_CONFIG = {
  heavyArmorFatigueMultiplier: 1.0,
  mediumArmorFatigueMultiplier: 1.0,
  lightArmorFatigueMultiplier: 1.0,
};

let _currentCombatConfig = { ...DEFAULT_COMBAT_CONFIG };
let _synced = false;

/**
 * Sync and apply all data modifications from active mods.
 */
export function syncModData() {
  _currentCombatConfig = { ...DEFAULT_COMBAT_CONFIG };
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
 * Reset data sync state (for test isolation).
 */
export function _resetModDataSync() {
  _currentCombatConfig = { ...DEFAULT_COMBAT_CONFIG };
  _synced = false;
  overridePotionRecipes(null);
}
