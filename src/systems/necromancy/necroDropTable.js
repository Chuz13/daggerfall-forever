// NECRO-DROP-TABLE: Curated alchemical & necromantic reagent drop tables
// for all monsters, animals, daedra, and humanoids in Daggerfall Forever.
// Replaces previous hardcoded harvest yields.
// Scales dynamically with player's Mysticism skill.

import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import { GROUP_TEMPLATE_INDICES } from '../item/itemTemplatesData.js';
import { setItemFields, templateByIndex } from '../item/itemTemplates.js';
import { skillValue, SKILLS } from '../skills.js';

/**
 * Item Template Indices for Necromantic / Alchemical reagents.
 * All correspond 1:1 to DFU ItemTemplates.json.
 */
export const NECRO_REAGENT_IDX = Object.freeze({
  WerewolfsBlood: 33,
  WereboarsTusk: 34,
  FairyDragonScales: 35,
  NymphHair: 36,
  UnicornHorn: 37,
  WraithEssence: 38,
  Ectoplasm: 39,
  GhoulsTongue: 40,
  SpidersVenom: 41,
  TrollsBlood: 42,
  SnakeVenom: 43,
  GorgonSnake: 44,
  LichDust: 45,
  DragonsScales: 46,
  GiantScorpionStinger: 47,
  SmallScorpionStinger: 48,
  MummyWrappings: 49,
  GiantsBlood: 50,
  BasilisksEye: 51,
  GryphonsFeather: 52,
  DaedrasHeart: 53,
  SaintsHair: 54,
  HolyRelic: 55,
  BigTooth: 56,
  MediumTooth: 57,
  SmallTooth: 58,
  PureWater: 59,
  RainWater: 60,
  OrcsBlood: 61,
  ElixirVitae: 62,
  Nectar: 63,
  Ichor: 64,
  Mercury: 65,
  Lodestone: 68,
  Sulphur: 69,
  Iron: 71,
  Ivory: 76,
  Pearl: 77,
  Finger: 283,
});

/**
 * Humanoid class drop profiles.
 */
export const HUMAN_MAGE_DROPS = Object.freeze([
  { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 1.00 },
  { templateIndex: NECRO_REAGENT_IDX.Finger, chance: 1.00 },
  { templateIndex: NECRO_REAGENT_IDX.PureWater, chance: 0.40 },
  { templateIndex: NECRO_REAGENT_IDX.SaintsHair, chance: 0.25 },
]);

export const HUMAN_WARRIOR_DROPS = Object.freeze([
  { templateIndex: NECRO_REAGENT_IDX.MediumTooth, chance: 1.00 },
  { templateIndex: NECRO_REAGENT_IDX.Finger, chance: 1.00 },
  { templateIndex: NECRO_REAGENT_IDX.ElixirVitae, chance: 0.35 },
]);

export const HUMAN_ROGUE_DROPS = Object.freeze([
  { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 1.00 },
  { templateIndex: NECRO_REAGENT_IDX.Finger, chance: 1.00 },
  { templateIndex: NECRO_REAGENT_IDX.SnakeVenom, chance: 0.40 },
]);

/**
 * Reagent drop configuration per creature mobileType.
 * chance: base chance (0.0 to 1.0) before Mysticism scaling.
 * minCount: minimum items granted on success (default 1).
 * maxCount: maximum items granted on high-roll / master scaling (default 1).
 * @type {Record<number, ReadonlyArray<{ templateIndex: number, chance: number, minCount?: number, maxCount?: number }>>}
 */
export const CREATURE_REAGENT_DROPS = Object.freeze({
  // --- UNDEAD ---
  [MOBILE_TYPES.SkeletalWarrior]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 0.35 },
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.15 },
  ]),
  [MOBILE_TYPES.Zombie]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.Ichor, chance: 0.55 },
    { templateIndex: NECRO_REAGENT_IDX.GhoulsTongue, chance: 0.30 },
  ]),
  [MOBILE_TYPES.Ghost]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 1.00, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.WraithEssence, chance: 0.25 },
  ]),
  [MOBILE_TYPES.Wraith]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.WraithEssence, chance: 0.85, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.70 },
    { templateIndex: NECRO_REAGENT_IDX.LichDust, chance: 0.20 },
  ]),
  [MOBILE_TYPES.Mummy]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.MummyWrappings, chance: 0.90, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.GhoulsTongue, chance: 0.35 },
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.30 },
  ]),
  [MOBILE_TYPES.Vampire]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 1.00 },
    { templateIndex: NECRO_REAGENT_IDX.ElixirVitae, chance: 0.45 },
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.35 },
  ]),
  [MOBILE_TYPES.VampireAncient]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 1.00, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.ElixirVitae, chance: 0.75 },
    { templateIndex: NECRO_REAGENT_IDX.WraithEssence, chance: 0.50 },
    { templateIndex: NECRO_REAGENT_IDX.LichDust, chance: 0.30 },
  ]),
  [MOBILE_TYPES.Lich]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.LichDust, chance: 0.85, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.WraithEssence, chance: 0.75 },
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.80 },
    { templateIndex: NECRO_REAGENT_IDX.MummyWrappings, chance: 0.40 },
  ]),
  [MOBILE_TYPES.AncientLich]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.LichDust, chance: 1.00, minCount: 1, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.WraithEssence, chance: 1.00, minCount: 1, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.90 },
    { templateIndex: NECRO_REAGENT_IDX.HolyRelic, chance: 0.35 },
  ]),

  // --- ORCS ---
  [MOBILE_TYPES.Orc]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.OrcsBlood, chance: 0.75 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.60 },
  ]),
  [MOBILE_TYPES.OrcSergeant]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.OrcsBlood, chance: 0.80 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.70 },
  ]),
  [MOBILE_TYPES.OrcShaman]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.OrcsBlood, chance: 0.90 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.75 },
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.40 },
    { templateIndex: NECRO_REAGENT_IDX.Ichor, chance: 0.35 },
  ]),
  [MOBILE_TYPES.OrcWarlord]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.OrcsBlood, chance: 1.00, minCount: 1, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.90 },
  ]),

  // --- DAEDRA ---
  [MOBILE_TYPES.Imp]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.DaedrasHeart, chance: 0.30 },
    { templateIndex: NECRO_REAGENT_IDX.Sulphur, chance: 0.45 },
    { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 0.40 },
  ]),
  [MOBILE_TYPES.FrostDaedra]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.DaedrasHeart, chance: 0.70 },
    { templateIndex: NECRO_REAGENT_IDX.PureWater, chance: 0.65 },
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.50 },
  ]),
  [MOBILE_TYPES.FireDaedra]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.DaedrasHeart, chance: 0.75 },
    { templateIndex: NECRO_REAGENT_IDX.Sulphur, chance: 0.80 },
    { templateIndex: NECRO_REAGENT_IDX.Ichor, chance: 0.40 },
  ]),
  [MOBILE_TYPES.Daedroth]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.DaedrasHeart, chance: 0.80 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.80 },
    { templateIndex: NECRO_REAGENT_IDX.Ichor, chance: 0.50 },
  ]),
  [MOBILE_TYPES.DaedraSeducer]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.DaedrasHeart, chance: 0.85 },
    { templateIndex: NECRO_REAGENT_IDX.SaintsHair, chance: 0.40 },
    { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.50 },
  ]),
  [MOBILE_TYPES.DaedraLord]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.DaedrasHeart, chance: 1.00, minCount: 1, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.WraithEssence, chance: 0.60 },
    { templateIndex: NECRO_REAGENT_IDX.Sulphur, chance: 0.85 },
    { templateIndex: NECRO_REAGENT_IDX.LichDust, chance: 0.40 },
  ]),

  // --- ATRONACHS ---
  [MOBILE_TYPES.FireAtronach]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.Sulphur, chance: 0.90 },
    { templateIndex: NECRO_REAGENT_IDX.Mercury, chance: 0.45 },
  ]),
  [MOBILE_TYPES.IronAtronach]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.Iron, chance: 1.00 },
    { templateIndex: NECRO_REAGENT_IDX.Lodestone, chance: 0.50 },
  ]),
  [MOBILE_TYPES.IceAtronach]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.PureWater, chance: 1.00 },
    { templateIndex: NECRO_REAGENT_IDX.RainWater, chance: 0.50 },
  ]),
  [MOBILE_TYPES.FleshAtronach]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.Ichor, chance: 0.75, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.GhoulsTongue, chance: 0.40 },
  ]),

  // --- LYCANTHROPES & BEASTS ---
  [MOBILE_TYPES.Werewolf]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.WerewolfsBlood, chance: 1.00 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.80 },
  ]),
  [MOBILE_TYPES.Wereboar]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.WereboarsTusk, chance: 1.00 },
    { templateIndex: NECRO_REAGENT_IDX.WerewolfsBlood, chance: 0.40 },
  ]),
  [MOBILE_TYPES.Giant]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.GiantsBlood, chance: 0.90 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.80 },
  ]),
  [MOBILE_TYPES.Harpy]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.GryphonsFeather, chance: 0.85 },
    { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 0.50 },
  ]),
  [MOBILE_TYPES.Nymph]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.NymphHair, chance: 0.95 },
    { templateIndex: NECRO_REAGENT_IDX.FairyDragonScales, chance: 0.45 },
    { templateIndex: NECRO_REAGENT_IDX.PureWater, chance: 0.50 },
  ]),
  [MOBILE_TYPES.Centaur]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.NymphHair, chance: 0.35 },
    { templateIndex: NECRO_REAGENT_IDX.MediumTooth, chance: 0.60 },
  ]),
  [MOBILE_TYPES.Gargoyle]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.Sulphur, chance: 0.60 },
    { templateIndex: NECRO_REAGENT_IDX.Lodestone, chance: 0.45 },
  ]),
  [MOBILE_TYPES.Dreugh]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.DragonsScales, chance: 0.75 },
    { templateIndex: NECRO_REAGENT_IDX.Pearl, chance: 0.50 },
    { templateIndex: NECRO_REAGENT_IDX.Ichor, chance: 0.40 },
  ]),
  [MOBILE_TYPES.Lamia]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.SnakeVenom, chance: 0.85 },
    { templateIndex: NECRO_REAGENT_IDX.DragonsScales, chance: 0.65 },
  ]),
  [MOBILE_TYPES.Spriggan]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.Nectar, chance: 0.70 },
    { templateIndex: NECRO_REAGENT_IDX.PureWater, chance: 0.50 },
  ]),

  // --- ANIMALS & VERMIN ---
  [MOBILE_TYPES.Spider]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.SpidersVenom, chance: 0.85 },
    { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 0.40 },
  ]),
  [MOBILE_TYPES.GiantScorpion]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.GiantScorpionStinger, chance: 0.85 },
    { templateIndex: NECRO_REAGENT_IDX.SmallScorpionStinger, chance: 0.50 },
  ]),
  [MOBILE_TYPES.Dragonling]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.FairyDragonScales, chance: 0.85 },
    { templateIndex: NECRO_REAGENT_IDX.DragonsScales, chance: 0.40 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.70 },
    { templateIndex: NECRO_REAGENT_IDX.Sulphur, chance: 0.50 },
  ]),
  [MOBILE_TYPES.Dragonling_Alternate]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.FairyDragonScales, chance: 0.85 },
    { templateIndex: NECRO_REAGENT_IDX.DragonsScales, chance: 0.40 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.70 },
    { templateIndex: NECRO_REAGENT_IDX.Sulphur, chance: 0.50 },
  ]),
  [MOBILE_TYPES.GrizzlyBear]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.80 },
    { templateIndex: NECRO_REAGENT_IDX.MediumTooth, chance: 0.60 },
  ]),
  [MOBILE_TYPES.SabertoothTiger]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 1.00, maxCount: 2 },
    { templateIndex: NECRO_REAGENT_IDX.MediumTooth, chance: 0.70 },
  ]),
  [MOBILE_TYPES.GiantBat]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 0.50 },
    { templateIndex: NECRO_REAGENT_IDX.Ichor, chance: 0.30 },
  ]),
  [MOBILE_TYPES.Rat]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 0.50 },
  ]),
  [MOBILE_TYPES.Slaughterfish]: Object.freeze([
    { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 0.70 },
    { templateIndex: NECRO_REAGENT_IDX.DragonsScales, chance: 0.65 },
  ]),

  // --- DEX ENEMIES ---
  270: Object.freeze([ // Troll
    { templateIndex: NECRO_REAGENT_IDX.TrollsBlood, chance: 1.00 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.75 },
  ]),
  264: Object.freeze([ // Hell Hound
    { templateIndex: NECRO_REAGENT_IDX.DaedrasHeart, chance: 0.40 },
    { templateIndex: NECRO_REAGENT_IDX.Sulphur, chance: 0.75 },
    { templateIndex: NECRO_REAGENT_IDX.BigTooth, chance: 0.80 },
  ]),
  262: Object.freeze([ // Wolf
    { templateIndex: NECRO_REAGENT_IDX.MediumTooth, chance: 0.80 },
  ]),
  263: Object.freeze([ // Snow Wolf
    { templateIndex: NECRO_REAGENT_IDX.MediumTooth, chance: 0.80 },
  ]),
  281: Object.freeze([ // Mudcrab
    { templateIndex: NECRO_REAGENT_IDX.DragonsScales, chance: 0.50 },
    { templateIndex: NECRO_REAGENT_IDX.Ichor, chance: 0.40 },
  ]),
});

/**
 * Resolves the inventory item group for a given template index.
 * @param {number} templateIndex
 * @returns {string}
 */
export function groupForTemplateIndex(templateIndex) {
  for (const [groupName, indices] of Object.entries(GROUP_TEMPLATE_INDICES)) {
    if (indices.includes(templateIndex)) {
      return groupName;
    }
  }
  return 'CreatureIngredients1';
}

/**
 * Calculates harvest chance multiplier based on player's Mysticism skill.
 * - Mysticism 0: 1.0x (standard authored base chance)
 * - Mysticism 50: 1.5x (50% bonus chance, unlocks double drops)
 * - Mysticism 100: 2.0x (100% bonus chance, double drops on guaranteed items)
 * @param {object} playerEntity
 * @returns {number}
 */
export function getMysticismHarvestMultiplier(playerEntity) {
  let mystVal = 0;
  try {
    mystVal = skillValue(playerEntity, SKILLS.Mysticism) || 0;
  } catch {
    mystVal = 0;
  }
  return 1.0 + (mystVal / 100);
}

/**
 * Gets the drop pool for a given corpse entity or record.
 * @param {object} corpse
 * @returns {ReadonlyArray<{ templateIndex: number, chance: number, minCount?: number, maxCount?: number }>}
 */
export function getCreatureDropPool(corpse) {
  const mobType = corpse?.mobileType ?? corpse?.foe;
  if (typeof mobType === 'number') {
    if (CREATURE_REAGENT_DROPS[mobType]) {
      return CREATURE_REAGENT_DROPS[mobType];
    }
    // Mages
    if (mobType >= 128 && mobType <= 132) {
      return HUMAN_MAGE_DROPS;
    }
    // Rogues
    if (mobType >= 133 && mobType <= 139) {
      return HUMAN_ROGUE_DROPS;
    }
    // Warriors
    if (mobType >= 140 && mobType <= 146) {
      return HUMAN_WARRIOR_DROPS;
    }
  }

  // Fallback by entityType
  const type = String(corpse?.entityType || '').toLowerCase();
  if (type === 'undead') {
    if ((corpse?.level ?? 1) >= 8) {
      return [
        { templateIndex: NECRO_REAGENT_IDX.LichDust, chance: 0.85, maxCount: 2 },
        { templateIndex: NECRO_REAGENT_IDX.WraithEssence, chance: 0.75 },
        { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.80 },
      ];
    }
    return [
      { templateIndex: NECRO_REAGENT_IDX.Ectoplasm, chance: 0.70 },
      { templateIndex: NECRO_REAGENT_IDX.GhoulsTongue, chance: 0.35 },
      { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 0.50 },
    ];
  }
  if (type === 'daedra') {
    return [
      { templateIndex: NECRO_REAGENT_IDX.DaedrasHeart, chance: 0.75 },
      { templateIndex: NECRO_REAGENT_IDX.Sulphur, chance: 0.80 },
      { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 0.40 },
    ];
  }

  // Default humanoid fallback
  return [
    { templateIndex: NECRO_REAGENT_IDX.SmallTooth, chance: 1.00 },
    { templateIndex: NECRO_REAGENT_IDX.Finger, chance: 1.00 },
    { templateIndex: NECRO_REAGENT_IDX.MediumTooth, chance: 0.40 },
  ];
}

/**
 * Rolls necromantic reagent drops for a harvested corpse, scaled by player's Mysticism skill.
 * @param {object} corpse
 * @param {object} playerEntity
 * @returns {{ items: object[], yields: string[], multiplier: number }}
 */
export function rollHarvestReagents(corpse, playerEntity) {
  const mult = getMysticismHarvestMultiplier(playerEntity);
  const dropPool = getCreatureDropPool(corpse);
  const items = [];
  const yields = [];

  for (const entry of dropPool) {
    const adjustedChance = entry.chance * mult;
    if (Math.random() < Math.min(1.0, adjustedChance)) {
      let count = entry.minCount ?? 1;
      const max = entry.maxCount ?? 1;
      if (max > count && adjustedChance >= 1.0) {
        if (Math.random() < (adjustedChance - 1.0)) {
          count = Math.min(max, count + 1);
        }
      }

      const tmpl = templateByIndex(entry.templateIndex);
      const name = tmpl?.name || `Reagent #${entry.templateIndex}`;
      const group = groupForTemplateIndex(entry.templateIndex);
      const item = setItemFields({
        group,
        templateIndex: entry.templateIndex,
        currentCondition: tmpl?.hitPoints ?? 1,
        maxCondition: tmpl?.hitPoints ?? 1,
        stackCount: count,
      });

      if (item) {
        items.push(item);
        yields.push(count > 1 ? `${name} x${count}` : name);
      }
    }
  }

  return { items, yields, multiplier: mult };
}
