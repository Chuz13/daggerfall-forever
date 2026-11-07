// @ts-check
/**
 * LIVING TAMRIEL — TRAVELING ROAD MERCHANT SYSTEM
 *
 * Implements road commerce, adaptive inventory (climate, biomes, and political crisis),
 * roadside fencing of illicit spoils, and dynamic purse economics for wayfaring merchants.
 */

import { stockShopShelf } from '../shopStock.js';
import { mintHealingPotion, mintMagickaPotion } from '../healingSupply.js';
import { createPotion } from '../loot/loot.js';
import { clearStolen, isStolen } from '../stolenGoods.js';
import { getActiveCrises, CRISIS_TYPE } from './regionState.js';
import { mintCondition, setItemFields } from '../item/itemTemplates.js';
import { createWeapon } from '../../combat/enemyEquipment.js';

// Classic recipe key for Cure Disease
export const CURE_DISEASE_RECIPE_KEY = 111516185;
// Classic recipe key for Restore Power / Stamina
export const STAMINA_RECIPE_KEY = 221871;

export const BASE_MERCHANT_GOLD = 1500;

// Canonical item templates:
// UselessItems2: Torch = 247, Bandage = 249, Oil = 252, CampingEquipment = 530, Rations = 531, Waterskin = 539, Campfire = 541
// Weapons: Arrow = 131
const ITEM_IDS = Object.freeze({
  Torch: 247,
  Bandage: 249,
  Oil: 252,
  CampingEquipment: 530,
  Rations: 531,
  Waterskin: 539,
  Campfire: 541,
  Arrow: 131,
});

/**
 * Creates custom emergency rations, waterskin, torches, or arrows for travelers.
 * @param {number} templateIndex
 * @param {string} group
 * @param {number} count
 */
function createTravelSupplyItem(templateIndex, group = 'UselessItems2', count = 1) {
  if (group === 'Weapons' && templateIndex === ITEM_IDS.Arrow) {
    return mintCondition(setItemFields({ ...createWeapon(ITEM_IDS.Arrow, 0, () => 0), stackCount: count }));
  }
  return mintCondition(
    setItemFields({
      group,
      templateIndex,
      material: 0,
      flags: 0,
      variant: 0,
      message: 0,
      stackCount: count,
    }),
  );
}

/**
 * Generates an adaptive, contextual inventory for a wayfaring road merchant.
 *
 * @param {Object} params
 * @param {number} [params.regionIndex=0]
 * @param {number} [params.climateIndex=231]
 * @param {any} [params.playerEntity=null]
 * @param {() => number} [params.rng=Math.random]
 * @returns {{ items: any[], coin: number, fenceAllowed: boolean }}
 */
export function stockTravelingMerchantTrunk({
  regionIndex = 0,
  climateIndex = 231,
  playerEntity = null,
  rng = Math.random,
} = {}) {
  // 1. Base general store shelf stock (quality 12 for reliable quality road wares)
  const baseItems = stockShopShelf({ buildingType: 1, quality: 12 }, playerEntity);
  const items = Array.isArray(baseItems) ? [...baseItems] : [];

  // 2. Guaranteed traveler essentials
  // - 2x Healing Potions
  // - 1x Magicka Potion
  items.push(mintHealingPotion(), mintHealingPotion(), mintMagickaPotion());

  // Rations / torches / oil / bandages / waterskin
  items.push(
    createTravelSupplyItem(ITEM_IDS.Rations, 'UselessItems2', 3), // Food rations
    createTravelSupplyItem(ITEM_IDS.Torch, 'UselessItems2', 2), // Torches
    createTravelSupplyItem(ITEM_IDS.Oil, 'UselessItems2', 2), // Oil flasks
    createTravelSupplyItem(ITEM_IDS.Bandage, 'UselessItems2', 3), // Bandages
    createTravelSupplyItem(ITEM_IDS.Waterskin, 'UselessItems2', 1), // Waterskin
  );

  // 3. Climate Adaptation
  // Climates: 224, 225 = Desert; 226..229 = Mountain / Highlands; 230 = Woods; 231 = Swamp
  const isDesert = climateIndex === 224 || climateIndex === 225;
  const isMountain = climateIndex >= 226 && climateIndex <= 229;

  if (isDesert) {
    // Deserts require stamina and extra hydration
    items.push(
      createPotion(STAMINA_RECIPE_KEY),
      createPotion(STAMINA_RECIPE_KEY),
      createTravelSupplyItem(ITEM_IDS.Waterskin, 'UselessItems2', 2), // Extra waterskins
    );
  } else if (isMountain) {
    // Mountainous passes require stamina, torches, and camping gear
    items.push(
      createPotion(STAMINA_RECIPE_KEY),
      createTravelSupplyItem(ITEM_IDS.Torch, 'UselessItems2', 3),
      createTravelSupplyItem(ITEM_IDS.CampingEquipment, 'UselessItems2', 1),
    );
  }

  // 4. Regional Crisis Adaptation
  const activeCrises = getActiveCrises(regionIndex);
  const hasPlague = activeCrises.some((c) => c.type === CRISIS_TYPE.PLAGUE);
  const hasWar = activeCrises.some(
    (c) => c.type === CRISIS_TYPE.WAR || c.type === CRISIS_TYPE.CIVIL_STRIFE,
  );
  const hasFamine = activeCrises.some((c) => c.type === CRISIS_TYPE.FAMINE);

  if (hasPlague) {
    // During an active epidemic, merchant carries life-saving Cure Disease elixirs
    items.push(
      createPotion(CURE_DISEASE_RECIPE_KEY),
      createPotion(CURE_DISEASE_RECIPE_KEY),
    );
  }

  if (hasWar) {
    // During war/strife, merchant stocks arrows and medical bandages
    items.push(
      createTravelSupplyItem(ITEM_IDS.Arrow, 'Weapons', 30), // Arrows (quiver)
      createTravelSupplyItem(ITEM_IDS.Bandage, 'UselessItems2', 4), // Medical bandages
    );
  }

  if (hasFamine) {
    // During famine, food rations are scarce and precious
    items.push(createTravelSupplyItem(ITEM_IDS.Rations, 'UselessItems2', 5));
  }

  return {
    items,
    coin: BASE_MERCHANT_GOLD,
    fenceAllowed: true,
  };
}

/**
 * Handles road fencing: allows selling stolen items without alerting the town watch.
 * Clears stolen tags on items successfully bought by the road merchant.
 *
 * @param {any[]} stagedItems
 * @param {number} totalGoldPrice
 * @param {{ coin: number }} merchantShelf
 * @returns {{ ok: boolean, error?: string, earnedGold: number }}
 */
export function executeRoadsideFenceSale(stagedItems, totalGoldPrice, merchantShelf) {
  if (!merchantShelf || merchantShelf.coin < totalGoldPrice) {
    return {
      ok: false,
      error: 'The merchant does not have enough coin for all those goods.',
      earnedGold: 0,
    };
  }

  // Deduct coin from merchant
  merchantShelf.coin = Math.max(0, merchantShelf.coin - totalGoldPrice);

  // Clear stolen flags because they are fenced away from town jurisdiction
  for (const it of stagedItems ?? []) {
    if (it && isStolen(it)) {
      clearStolen(it);
    }
  }

  return {
    ok: true,
    earnedGold: totalGoldPrice,
  };
}
