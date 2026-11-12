// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// ADVENTURER EQUIPMENT & CORPSE LOOT GENERATOR (Living Tamriel)
//
// Canonical equipment pipeline for virtual and spawned adventurers across Tiers 1..9.
// Complies strictly with .agentrules:
//  - Item factories (setItemFields, createWeapon, armorOfMaterial).
//  - Direct equipTableOf(entity) and entity.items synchronization for 3D Morrowind bodies.
//  - Real material tiers (Iron..Daedric) with probabilistic variance (T-2..T+1).
//  - Loot Rarity affixes (Magic/Rare/Legendary via applyRarity).
//  - Tier 9 (Lv 40-45) up to 2 distinct, slot-compatible DFU artifacts.
//  - Configurable corpse loot modes (ZERO, SUPPLIES, STANDARD, FULL).
// ═══════════════════════════════════════════════════════════════════════════════

import {
  WEAPONS_ENUM,
  ARMOR_ENUM,
  ARMOR_MATERIAL,
  createWeapon,
  armorOfMaterial,
} from '../../combat/enemyEquipment.js';
import { addItem, goldStack, isGoldPieces } from '../inventory.js';
import { equipItem, equipTableOf, getEquipSlot, EQUIP_SLOTS } from '../equip.js';
import { applyRarity, rarityEligible } from '../loot/lootRarity.js';
import { createArtifact, getMagicItemTemplates } from '../loot/loot.js';
import { makePotion, potionRecipeKey, POTION_RECIPES } from '../potions.js';
import { LivingTamrielConfig, LIVING_ADVENTURER_LOOT } from './livingConfig.js';

export { LIVING_ADVENTURER_LOOT };

const CLASS_WEAPONS = Object.freeze({
  Warrior: [WEAPONS_ENUM.Longsword, WEAPONS_ENUM.Broadsword, WEAPONS_ENUM.Claymore, WEAPONS_ENUM['Battle Axe'], WEAPONS_ENUM.Warhammer],
  Knight: [WEAPONS_ENUM.Longsword, WEAPONS_ENUM.Broadsword, WEAPONS_ENUM.Claymore],
  Barbarian: [WEAPONS_ENUM['Battle Axe'], WEAPONS_ENUM['War Axe'], WEAPONS_ENUM.Claymore, WEAPONS_ENUM.Warhammer],
  Rogue: [WEAPONS_ENUM.Shortsword, WEAPONS_ENUM.Saber, WEAPONS_ENUM.Broadsword, WEAPONS_ENUM.Dagger],
  Thief: [WEAPONS_ENUM.Dagger, WEAPONS_ENUM.Shortsword, WEAPONS_ENUM.Tanto],
  Assassin: [WEAPONS_ENUM.Dagger, WEAPONS_ENUM.Shortsword, WEAPONS_ENUM.Tanto, WEAPONS_ENUM.Wakazashi],
  Mage: [WEAPONS_ENUM.Staff, WEAPONS_ENUM.Dagger],
  Sorcerer: [WEAPONS_ENUM.Staff, WEAPONS_ENUM.Dagger],
  Battlemage: [WEAPONS_ENUM.Longsword, WEAPONS_ENUM['Battle Axe'], WEAPONS_ENUM.Staff, WEAPONS_ENUM.Warhammer],
  Spellsword: [WEAPONS_ENUM.Longsword, WEAPONS_ENUM.Shortsword, WEAPONS_ENUM.Katana],
  Nightblade: [WEAPONS_ENUM.Shortsword, WEAPONS_ENUM.Dagger, WEAPONS_ENUM.Saber],
  Healer: [WEAPONS_ENUM.Staff, WEAPONS_ENUM.Mace, WEAPONS_ENUM.Flail],
});

const TWO_HANDED_WEAPONS = new Set([
  WEAPONS_ENUM.Claymore,
  WEAPONS_ENUM['Dai-Katana'],
  WEAPONS_ENUM.Warhammer,
  WEAPONS_ENUM['Battle Axe'],
  WEAPONS_ENUM['Long Bow'],
]);

const SHIELD_TEMPLATES = [
  ARMOR_ENUM.Buckler,
  ARMOR_ENUM.Round_Shield,
  ARMOR_ENUM.Kite_Shield,
  ARMOR_ENUM.Tower_Shield,
];

const TWO_HANDED_ARTIFACTS = new Set([10, 12, 14]); // Volendrung, Auriel's Bow, Chrysamere
const WEAPON_ARTIFACTS = new Set([1, 2, 4, 6, 7, 10, 12, 14, 16, 22]);
const SHIELD_ARTIFACTS = new Set([19, 20]); // Auriel's Shield, Spell Breaker
const CUIRASS_ARTIFACTS = new Set([15, 18]); // Lord's Mail, Ebony Mail
const HELM_ARTIFACTS = new Set([0]); // Masque of Clavicus Vile

const ADVENTURER_ARTIFACT_POOL = [
  0, 1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22,
];

/**
 * Rolls an equipment tier with probabilistic variance centered at baseTier.
 * E.g., for baseTier 6: ~60% T6, ~25% T5, ~10% T4, ~5% T7.
 * @param {number} baseTier
 * @param {Function} [rolls=Math.random]
 * @returns {number} 1..9
 */
export function rollTierWithVariance(baseTier, rolls = Math.random) {
  const t = Math.max(1, Math.min(9, Math.trunc(Number(baseTier) || 1)));
  const r = rolls();
  if (r < 0.60) return t;
  if (r < 0.85) return Math.max(1, t - 1);
  if (r < 0.95) return Math.max(1, t - 2);
  return Math.min(9, t + 1);
}

/**
 * Maps a tier (1..9) to weapon metal material (0=Iron..9=Daedric).
 * @param {number} tier
 * @param {Function} [rolls=Math.random]
 * @returns {number}
 */
export function getWeaponMaterialForTier(tier, rolls = Math.random) {
  switch (tier) {
    case 1: return 0; // Iron
    case 2: return 1; // Steel
    case 3: return 2; // Silver
    case 4: return rolls() < 0.5 ? 3 : 4; // Elven (3) or Dwarven (4)
    case 5: return 5; // Mithril
    case 6: return 6; // Adamantium
    case 7: return 7; // Ebony
    case 8: return rolls() < 0.5 ? 8 : 9; // Orcish (8) or Daedric (9)
    case 9:
    default: return 9; // Daedric
  }
}

/**
 * Maps a tier (1..9) to armor material.
 * @param {number} tier
 * @param {Function} [rolls=Math.random]
 * @returns {number}
 */
export function getArmorMaterialForTier(tier, rolls = Math.random) {
  if (tier === 1) {
    return rolls() < 0.5 ? ARMOR_MATERIAL.Leather : ARMOR_MATERIAL.PLATE_BASE + 0;
  }
  if (tier === 2) {
    return rolls() < 0.3 ? ARMOR_MATERIAL.Chain : ARMOR_MATERIAL.PLATE_BASE + 1;
  }
  const metalMat = getWeaponMaterialForTier(tier, rolls);
  return ARMOR_MATERIAL.PLATE_BASE + metalMat;
}

/**
 * Determines loot rarity level for an item given its material tier.
 * @param {number} tier
 * @param {Function} [rolls=Math.random]
 * @returns {string|null}
 */
function rollRarityForTier(tier, rolls = Math.random) {
  const r = rolls();
  if (tier <= 2) return null;
  if (tier <= 4) return r < 0.25 ? 'magic' : null;
  if (tier <= 6) {
    if (r < 0.15) return 'rare';
    if (r < 0.65) return 'magic';
    return null;
  }
  if (tier <= 8) {
    if (r < 0.60) return 'rare';
    if (r < 0.90) return 'magic';
    return null;
  }
  // Tier 9
  if (r < 0.10) return 'legendary';
  if (r < 0.85) return 'rare';
  return 'magic';
}

/**
 * Tests whether two artifact indices can be equipped simultaneously without slot collision.
 * @param {number} art1
 * @param {number} art2
 * @returns {boolean}
 */
export function areArtifactsSlotCompatible(art1, art2) {
  if (art1 === art2) return false;
  const is1TwoHanded = TWO_HANDED_ARTIFACTS.has(art1);
  const is2TwoHanded = TWO_HANDED_ARTIFACTS.has(art2);
  if (is1TwoHanded && (WEAPON_ARTIFACTS.has(art2) || SHIELD_ARTIFACTS.has(art2))) return false;
  if (is2TwoHanded && (WEAPON_ARTIFACTS.has(art1) || SHIELD_ARTIFACTS.has(art1))) return false;
  if (SHIELD_ARTIFACTS.has(art1) && SHIELD_ARTIFACTS.has(art2)) return false;
  if (CUIRASS_ARTIFACTS.has(art1) && CUIRASS_ARTIFACTS.has(art2)) return false;
  if (HELM_ARTIFACTS.has(art1) && HELM_ARTIFACTS.has(art2)) return false;
  return true;
}

/**
 * Equips an adventurer entity with real tier-appropriate weapons, armors, affixes,
 * and up to 2 distinct slot-compatible artifacts for T9.
 * Synchronizes both equipTableOf(entity) and entity.items.
 *
 * @param {any} entity Foe entity
 * @param {Object} adv Virtual adventurer record
 * @param {number} [playerLevel=1]
 * @param {Function} [rolls=Math.random]
 */
export function equipAdventurerEntity(entity, adv, playerLevel = 1, rolls = Math.random) {
  if (!entity || typeof entity !== 'object') return;
  entity.items = Array.isArray(entity.items) ? entity.items : [];

  const baseTier = Math.max(1, Math.min(9, Math.trunc(Number(adv?.gearTier) || Math.floor((adv?.level || 1) / 5) + 1)));
  const className = String(adv?.className || 'Warrior');
  const gender = adv?.gender === 'female' ? 'female' : 'male';

  const classWeaponPool = CLASS_WEAPONS[className] ?? CLASS_WEAPONS.Warrior;
  const weaponTmpl = classWeaponPool[Math.floor(rolls() * classWeaponPool.length)];
  const isTwoHanded = TWO_HANDED_WEAPONS.has(weaponTmpl);

  // 1. Weapon
  const wepTier = rollTierWithVariance(baseTier, rolls);
  const wepMat = getWeaponMaterialForTier(wepTier, rolls);
  const weapon = createWeapon(weaponTmpl, wepMat, rolls);
  if (weapon) {
    const wepRarity = rollRarityForTier(wepTier, rolls);
    if (wepRarity && rarityEligible(weapon)) {
      applyRarity(weapon, wepRarity, rolls);
    }
    addItem(entity.items, weapon);
    equipItem(entity, weapon);
  }

  // 2. Off-hand shield (if 1H weapon and suitable class)
  let shield = null;
  if (!isTwoHanded && (className === 'Warrior' || className === 'Knight' || className === 'Battlemage' || className === 'Spellsword')) {
    if (rolls() < 0.65) {
      const shieldTmpl = SHIELD_TEMPLATES[Math.floor(rolls() * SHIELD_TEMPLATES.length)];
      const shieldTier = rollTierWithVariance(baseTier, rolls);
      const shieldMat = getArmorMaterialForTier(shieldTier, rolls);
      shield = armorOfMaterial(shieldTmpl, shieldMat);
      if (shield) {
        const shieldRarity = rollRarityForTier(shieldTier, rolls);
        if (shieldRarity && rarityEligible(shield)) {
          applyRarity(shield, shieldRarity, rolls);
        }
        addItem(entity.items, shield);
        equipItem(entity, shield);
      }
    }
  }

  // 3. Full Armor Set
  const armorPieces = [
    ARMOR_ENUM.Cuirass,
    ARMOR_ENUM.Gauntlets,
    ARMOR_ENUM.Greaves,
    ARMOR_ENUM.Left_Pauldron,
    ARMOR_ENUM.Right_Pauldron,
    ARMOR_ENUM.Helm,
    ARMOR_ENUM.Boots,
  ];

  for (const piece of armorPieces) {
    const pTier = rollTierWithVariance(baseTier, rolls);
    const pMat = getArmorMaterialForTier(pTier, rolls);
    const armorItem = armorOfMaterial(piece, pMat);
    if (armorItem) {
      const pRarity = rollRarityForTier(pTier, rolls);
      if (pRarity && rarityEligible(armorItem)) {
        applyRarity(armorItem, pRarity, rolls);
      }
      addItem(entity.items, armorItem);
      equipItem(entity, armorItem);
    }
  }

  // 4. Tier 9 (Lv 40-45) Artifacts: Up to 2 distinct, slot-compatible artifacts
  if (baseTier >= 9 || (adv?.level && adv.level >= 40)) {
    const magicTemplates = getMagicItemTemplates();
    if (Array.isArray(magicTemplates) && magicTemplates.length > 0) {
      // 40% chance for first artifact
      if (rolls() < 0.40) {
        const candidates1 = ADVENTURER_ARTIFACT_POOL.filter((idx) => {
          if (isTwoHanded && (WEAPON_ARTIFACTS.has(idx) || SHIELD_ARTIFACTS.has(idx))) return false;
          if (shield && SHIELD_ARTIFACTS.has(idx)) return false;
          return true;
        });

        if (candidates1.length > 0) {
          const art1Idx = candidates1[Math.floor(rolls() * candidates1.length)];
          try {
            const art1 = createArtifact(magicTemplates, art1Idx, { gender });
            if (art1) {
              addItem(entity.items, art1);
              equipItem(entity, art1);

              // 15% chance for a second distinct, slot-compatible artifact
              if (rolls() < 0.15) {
                const candidates2 = ADVENTURER_ARTIFACT_POOL.filter((idx) => areArtifactsSlotCompatible(art1Idx, idx));
                if (candidates2.length > 0) {
                  const art2Idx = candidates2[Math.floor(rolls() * candidates2.length)];
                  const art2 = createArtifact(magicTemplates, art2Idx, { gender });
                  if (art2) {
                    addItem(entity.items, art2);
                    equipItem(entity, art2);
                  }
                }
              }
            }
          } catch (_) {
            // Safe fallback if specific artifact row is unresolvable
          }
        }
      }
    }
  }

  // 5. Gold Purse (Tier-scaled) and Field Supplies
  const baseGold = Math.max(30, (adv?.level || 1) * 25);
  const totalGold = baseGold + Math.floor(rolls() * baseGold * 0.5);
  entity.goldPieces = totalGold;
  addItem(entity.items, goldStack(totalGold));

  // Adventurers carry 1-2 standard field supplies (potions)
  const healRec = POTION_RECIPES.find((r) => r.name === 'healing');
  if (healRec) {
    addItem(entity.items, makePotion(potionRecipeKey(healRec.ingredients)));
  }
  if (rolls() < 0.5) {
    const stamRec = POTION_RECIPES.find((r) => r.name === 'stamina');
    if (stamRec) {
      addItem(entity.items, makePotion(potionRecipeKey(stamRec.ingredients)));
    }
  }
}

/**
 * Applies adventurer loot mode policy to an adventurer corpse's items.
 *
 * Modes:
 *  - ZERO: empty corpse (protects local economy).
 *  - SUPPLIES: potions, bandages, small gold purse only.
 *  - STANDARD: ~25% chance for 1 weapon or armor piece (DFU humanoid loot) + supplies + gold.
 *  - FULL: 100% droppable loot (all worn gear from equipTable, carried supplies, gold, and artifacts).
 *
 * @param {any} entity Corpse entity
 * @param {string} [mode]
 * @param {Function} [rolls=Math.random]
 */
export function applyAdventurerCorpseLoot(entity, mode = null, rolls = Math.random) {
  if (!entity || !Array.isArray(entity.items)) return;
  // Clear any mob lootCap so standard plain-foe caps don't strip adventurer gear
  delete entity.lootCap;

  const lootMode = (mode || LivingTamrielConfig.adventurerLootMode || LIVING_ADVENTURER_LOOT.FULL).toLowerCase();

  if (lootMode === LIVING_ADVENTURER_LOOT.ZERO) {
    entity.items = [];
    entity.goldPieces = Math.min(Number(entity.goldPieces) || 0, 5);
    return;
  }

  if (lootMode === LIVING_ADVENTURER_LOOT.SUPPLIES) {
    const supplies = entity.items.filter((it) => it?.isPotion || it?.category === 'Consumables' || it?.group === 'Gems');
    const goldCoins = Math.min(Number(entity.goldPieces) || 30, 40);
    entity.goldPieces = goldCoins;
    if (goldCoins > 0) {
      supplies.push(goldStack(goldCoins));
    }
    // Guarantee at least 1 healing potion if empty so corpse is never unexpectedly barren
    if (!supplies.some((it) => it?.isPotion)) {
      const healRec = POTION_RECIPES.find((r) => r.name === 'healing');
      if (healRec) {
        supplies.push(makePotion(potionRecipeKey(healRec.ingredients)));
      }
    }
    entity.items = supplies;
    return;
  }

  if (lootMode === LIVING_ADVENTURER_LOOT.STANDARD) {
    // 25% chance to retain 1 equipped piece, plus keep any artifacts, supplies, and modest gold
    const kept = [];
    const artifacts = entity.items.filter((it) => it?.artifact);
    const standardGear = entity.items.filter((it) => !it?.artifact && (it?.group === 'Weapons' || it?.group === 'Armor'));
    if (standardGear.length > 0 && rolls() < 0.25) {
      kept.push(standardGear[Math.floor(rolls() * standardGear.length)]);
    }
    const potions = entity.items.filter((it) => it?.isPotion);
    const goldCoins = Math.min(Number(entity.goldPieces) || 50, 75);
    entity.goldPieces = goldCoins;
    const goldItem = goldCoins > 0 ? [goldStack(goldCoins)] : [];
    entity.items = [...kept, ...artifacts, ...potions.slice(0, 1), ...goldItem];
    return;
  }

  // FULL mode: ensure ALL worn equipment from equipTable, artifacts, inventory supplies, and full gold purse are in items
  const table = equipTableOf(entity);
  if (table) {
    for (const slotItem of Object.values(table)) {
      if (slotItem && !entity.items.includes(slotItem)) {
        entity.items.push(slotItem);
      }
    }
  }
  const fullGold = Number(entity.goldPieces) || 50;
  if (fullGold > 0 && !entity.items.some(isGoldPieces)) {
    entity.items.push(goldStack(fullGold));
  }
}
