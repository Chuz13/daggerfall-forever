// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// REGIONAL ECONOMY & CRISIS MARKET DYNAMICS (Living Tamriel)
//
// Governs dynamic price shifts, supply shortages, and merchant adjustments
// driven by regional crises (WAR, FAMINE, PLAGUE, CIVIL_STRIFE) across Tamriel.
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getRegionState, CRISIS_TYPE, CRISIS_PHASE } from './regionState.js';

/**
 * Economic commodity categories affected by regional crises.
 */
export const ECONOMY_CATEGORY = Object.freeze({
  GENERAL: 'general',
  WEAPONS_ARMOR: 'weaponsArmor',
  FOOD_LODGING: 'foodLodging',
  POTIONS_ALCH: 'potionsAlch',
});

/**
 * Calculates price adjustment multipliers for all commodity groups in a region.
 *
 * @param {number} regionIndex
 * @returns {{ general: number, weaponsArmor: number, foodLodging: number, potionsAlch: number }}
 */
export function getRegionEconomyMultipliers(regionIndex) {
  const tier = Number(LivingTamrielConfig.political);
  const neutral = { general: 1.0, weaponsArmor: 1.0, foodLodging: 1.0, potionsAlch: 1.0 };
  if (tier === PRESENCE.OFF) return neutral;

  const state = getRegionState(regionIndex);
  if (!state || state.crisis === CRISIS_TYPE.PEACE || state.phase === CRISIS_PHASE.NONE) {
    return neutral;
  }

  // Phase intensity scalar: MID = 1.0, START = 0.5, END = 0.25
  const phaseScale =
    state.phase === CRISIS_PHASE.MID ? 1.0 : state.phase === CRISIS_PHASE.START ? 0.5 : 0.25;

  let general = 1.0;
  let weaponsArmor = 1.0;
  let foodLodging = 1.0;
  let potionsAlch = 1.0;

  switch (state.crisis) {
    case CRISIS_TYPE.WAR:
    case CRISIS_TYPE.CIVIL_STRIFE:
      weaponsArmor += 0.35 * phaseScale; // +35% for martial gear at peak
      general += 0.15 * phaseScale;
      break;

    case CRISIS_TYPE.FAMINE:
      foodLodging += 0.50 * phaseScale; // +50% for provisions & inn beds at peak
      general += 0.20 * phaseScale;
      break;

    case CRISIS_TYPE.PLAGUE:
      potionsAlch += 0.40 * phaseScale; // +40% for remedies and alchemy reagents at peak
      general += 0.10 * phaseScale;
      break;
  }

  return { general, weaponsArmor, foodLodging, potionsAlch };
}

/**
 * Calculates modified item trade/purchase price given the item category and current region.
 *
 * @param {number} basePrice
 * @param {number} regionIndex
 * @param {string} [category=ECONOMY_CATEGORY.GENERAL]
 * @returns {number} Modified price in gold
 */
export function applyCrisisPriceMultiplier(basePrice, regionIndex, category = ECONOMY_CATEGORY.GENERAL) {
  if (basePrice <= 0) return basePrice;
  const mults = getRegionEconomyMultipliers(regionIndex);
  const factor = mults[category] ?? mults.general;
  return Math.max(1, Math.round(basePrice * factor));
}

/**
 * Calculates regional price adjustment for tavern stay during famine / wartime.
 *
 * @param {number} baseRoomPrice
 * @param {number} regionIndex
 * @returns {number}
 */
export function applyTavernRoomCrisisPrice(baseRoomPrice, regionIndex) {
  return applyCrisisPriceMultiplier(baseRoomPrice, regionIndex, ECONOMY_CATEGORY.FOOD_LODGING);
}

/**
 * Maps a Daggerfall buildingType (`BUILDING_TYPES`) to its regional crisis economy category
 * and returns the active price multiplier (`1.0` when at peace).
 *
 * @param {number|string|null|undefined} buildingType
 * @param {number|null|undefined} regionIndex
 * @returns {number}
 */
export function getBuildingCrisisFactor(buildingType, regionIndex) {
  if (regionIndex == null || !Number.isInteger(regionIndex) || regionIndex < 0) return 1.0;
  const mults = getRegionEconomyMultipliers(regionIndex);
  switch (buildingType) {
    case 2:
    case 13:
    case 'Armorer':
    case 'WeaponSmith':
      return mults.weaponsArmor;
    case 0:
    case 14:
    case 'Alchemist':
    case 'Temple':
      return mults.potionsAlch;
    case 6:
    case 12:
    case 'GeneralStore':
    case 'Tavern':
      return mults.foodLodging;
    default:
      return mults.general;
  }
}

