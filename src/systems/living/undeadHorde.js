// @ts-check
// Undead Horde Invasion Engine (Living Tamriel): crisis-independent horde
// scaled by livingEncounterScale (15 / 30 / 60) with vanguard, reserve waves,
// boss-death 50% crumble, and obelisk-shatter 1-on-1 duel.

import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import { LOCATION_TYPES } from '../../formats/mapsFile.js';
import { CLIMATES, REGION_RACES } from '../../formats/mapsTables.js';
import { goldStack } from '../inventory.js';
import { setItemFields, templateByIndex } from '../item/itemTemplates.js';
import { makePotion, potionRecipeKey, POTION_RECIPES } from '../potions.js';
import { NECRO_REAGENT_IDX, groupForTemplateIndex } from '../necromancy/necroDropTable.js';
import { hasReadGrimoire, mintNecroGrimoire } from '../necromancy/necroGrimoire.js';
import { PRESENCE, LIVING_ENCOUNTER_SCALE, getLivingEncounterScale } from './livingConfig.js';

export const UNDEAD_HORDE_EVENT_ID = 'EVT_UNDEAD_HORDE_INVASION';
export const UNDEAD_HORDE_BASE_COUNT = 15;
export const UNDEAD_HORDE_ACTIVE_CAP = 20;
export const UNDEAD_HORDE_REFILL_THRESHOLD = 14;
export const UNDEAD_HORDE_WAVE_INTERVAL_S = 8;
export const UNDEAD_HORDE_MIN_WAVE_GAP_S = 3;
export const UNDEAD_HORDE_GLOBAL_COOLDOWN_MINUTES = 4320;
export const UNDEAD_HORDE_DEATH_CRUMBLE_RATIO = 0.5;

const NECROMANCER_NAMES = Object.freeze([
  'Malakor',
  'Vornath',
  'Kaelen',
  'Morvath',
  'Veldrin',
  'Xarath',
  'Seregil',
  'Nerevarin',
  'Draven',
  'Zoltan',
  'Korvath',
  'Valerius',
]);

function isDesertRegionOrClimate(regionIndex, climateIndex = null) {
  if (Number.isFinite(climateIndex)) {
    return (
      climateIndex === CLIMATES.Desert ||
      climateIndex === CLIMATES.Desert2 ||
      climateIndex === CLIMATES.Subtropical
    );
  }
  const race = REGION_RACES[regionIndex];
  return race === 1 || race === 6;
}

/**
 * Computes horde size, vanguard/reserve split, wave batch size, defender count, and gold reward
 * from the Living Tamriel encounter scale (1x = 15, 2x = 30, 4x = 60).
 * @param {number} [scale]
 * @returns {{ scale: number, totalUndead: number, vanguardCount: number, reserveCount: number, waveBatchSize: number, defenderCount: number, goldReward: number }}
 */
export function computeUndeadHordeCounts(scale = getLivingEncounterScale()) {
  const s = scale >= LIVING_ENCOUNTER_SCALE.HIGH ? 4 : scale >= LIVING_ENCOUNTER_SCALE.MID ? 2 : 1;
  const totalUndead = UNDEAD_HORDE_BASE_COUNT * s;
  const vanguardCount = Math.min(UNDEAD_HORDE_ACTIVE_CAP, totalUndead);
  const reserveCount = Math.max(0, totalUndead - vanguardCount);
  const waveBatchSize = s >= 4 ? 8 : s >= 2 ? 6 : 5;
  const defenderCount = s >= 4 ? 11 : s >= 2 ? 7 : 4;
  const goldReward = s >= 4 ? 650 : s >= 2 ? 400 : 250;
  return {
    scale: s,
    totalUndead,
    vanguardCount,
    reserveCount,
    waveBatchSize,
    defenderCount,
    goldReward,
  };
}

/**
 * Builds a level-gated, climate-aware undead horde roster of `count` mobileTypes.
 * ~75-80% core fodder (Skeleton/Zombie) and ~20-25% level-gated specialists,
 * capping Liches to at most 2 across the roster.
 * @param {number} count
 * @param {{ playerLevel?: number, regionIndex?: number, climateIndex?: number|null, rng?: () => number }} [opts]
 * @returns {number[]}
 */
export function buildUndeadHordeRoster(
  count,
  { playerLevel = 1, regionIndex = 0, climateIndex = null, rng = Math.random } = {},
) {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const lvl = Math.max(1, Number(playerLevel) || 1);
  const desert = isDesertRegionOrClimate(regionIndex, climateIndex);

  /** @type {number[]} */
  const corePool = [
    MOBILE_TYPES.SkeletalWarrior,
    MOBILE_TYPES.SkeletalWarrior,
    MOBILE_TYPES.Zombie,
    MOBILE_TYPES.Zombie,
  ];
  if (desert && lvl >= 6) {
    corePool.push(MOBILE_TYPES.Mummy);
  }

  /** @type {number[]} */
  const specialistPool = [];
  if (lvl >= 6) {
    specialistPool.push(MOBILE_TYPES.Ghost, MOBILE_TYPES.Mummy);
    if (desert) specialistPool.push(MOBILE_TYPES.Mummy);
  }
  if (lvl >= 11) {
    specialistPool.push(MOBILE_TYPES.Wraith, MOBILE_TYPES.FleshAtronach);
  }
  if (lvl >= 16) {
    specialistPool.push(MOBILE_TYPES.Vampire, MOBILE_TYPES.Lich);
  }

  /** @type {number[]} */
  const roster = [];
  let lichCount = 0;

  for (let i = 0; i < n; i++) {
    const useSpecialist = specialistPool.length > 0 && rng() < 0.23;
    if (useSpecialist) {
      let pick = specialistPool[Math.floor(rng() * specialistPool.length)];
      if (pick === MOBILE_TYPES.Lich) {
        if (lichCount >= 2) {
          pick = MOBILE_TYPES.Wraith;
        } else {
          lichCount++;
        }
      }
      roster.push(pick);
    } else {
      roster.push(corePool[Math.floor(rng() * corePool.length)]);
    }
  }

  return roster;
}

/**
 * Builds the Necromancer boss specification leading the undead horde.
 * @param {{ playerLevel?: number, rng?: () => number }} [opts]
 * @returns {{ name: string, mobileType: number, level: number, hpMult: number, damageMult: number, forcedBossTraits: string[] }}
 */
export function buildNecromancerBossSpec({ playerLevel = 1, rng = Math.random } = {}) {
  const lvl = Math.max(1, Number(playerLevel) || 1);
  const isLichBoss = lvl >= 18 && rng() < 0.4;
  const baseName = NECROMANCER_NAMES[Math.floor(rng() * NECROMANCER_NAMES.length)];
  const title = isLichBoss ? `Arch-Necromancer ${baseName}` : `Necromancer ${baseName}`;
  const traits = ['warded'];
  if (lvl >= 10) {
    const secondary = ['frostproof', 'venomproof', 'curbing'];
    traits.push(secondary[Math.floor(rng() * secondary.length)]);
  }
  return {
    name: title,
    mobileType: isLichBoss ? MOBILE_TYPES.Lich : MOBILE_TYPES.Sorcerer,
    level: Math.max(5, lvl + 2),
    hpMult: lvl >= 12 ? 2.4 : 2.0,
    damageMult: 1.25,
    forcedBossTraits: traits,
  };
}

function mintNecroReagentItem(templateIndex, count = 1) {
  const tmpl = templateByIndex(templateIndex);
  const group = groupForTemplateIndex(templateIndex);
  return setItemFields({
    group,
    templateIndex,
    currentCondition: tmpl?.hitPoints ?? 1,
    maxCondition: tmpl?.hitPoints ?? 1,
    stackCount: count,
  });
}

/**
 * Builds canonical loot items for the Necromancer boss corpse (bypasses urban zero-loot).
 * @param {{ playerEntity?: any, playerLevel?: number, scale?: number, rng?: () => number }} [opts]
 * @returns {any[]}
 */
export function buildNecromancerBossLoot({
  playerEntity = null,
  playerLevel = 1,
  scale = 1,
  rng = Math.random,
} = {}) {
  const lvl = Math.max(1, Number(playerLevel) || 1);
  const scaleMult = scale >= 4 ? 1.6 : scale >= 2 ? 1.25 : 1.0;
  const goldAmt = Math.max(25, Math.round((80 + lvl * 15) * scaleMult));

  /** @type {any[]} */
  const items = [goldStack(goldAmt)];

  const reagentPool = [
    NECRO_REAGENT_IDX.Ectoplasm,
    NECRO_REAGENT_IDX.WraithEssence,
    NECRO_REAGENT_IDX.LichDust,
  ];
  const r1 = mintNecroReagentItem(reagentPool[Math.floor(rng() * reagentPool.length)], 1);
  if (r1) items.push(r1);
  if (rng() < 0.65) {
    const r2 = mintNecroReagentItem(reagentPool[Math.floor(rng() * reagentPool.length)], 1);
    if (r2) items.push(r2);
  }

  const potionPref = rng() < 0.5 ? 'healing' : 'restore power';
  const recipe = POTION_RECIPES.find((r) => r.name === potionPref) || POTION_RECIPES[0];
  if (recipe) {
    const pot = makePotion(potionRecipeKey(recipe.ingredients));
    if (pot) items.push(pot);
  }

  if (lvl >= 10 && !hasReadGrimoire(playerEntity) && rng() < 0.15) {
    const grimoire = mintNecroGrimoire();
    if (grimoire) items.push(grimoire);
  }

  return items;
}

/**
 * Evaluates whether a crisis-independent Undead Horde Invasion should trigger.
 * Independent of regional crisis state and `LivingTamrielConfig.political`.
 * @param {{ nowMinutes?: number, lastHordeMinute?: number, presenceTier?: number, isNight?: boolean, locationType?: number, climateIndex?: number|null, inWilderness?: boolean, rng?: () => number }} [opts]
 * @returns {boolean}
 */
export function shouldTriggerUndeadHorde({
  nowMinutes = 0,
  lastHordeMinute = -999999,
  presenceTier = PRESENCE.MID,
  isNight = false,
  locationType = 0,
  climateIndex = null,
  inWilderness = false,
  rng = Math.random,
} = {}) {
  if (Number(presenceTier) <= PRESENCE.OFF) return false;
  if (nowMinutes - lastHordeMinute < UNDEAD_HORDE_GLOBAL_COOLDOWN_MINUTES) return false;

  let baseChance = 0;
  if (inWilderness) {
    baseChance = presenceTier >= PRESENCE.HIGH ? 0.18 : presenceTier === PRESENCE.MID ? 0.12 : 0.06;
  } else {
    baseChance = presenceTier >= PRESENCE.HIGH ? 0.25 : presenceTier === PRESENCE.MID ? 0.15 : 0.08;
  }

  let mult = 1.0;
  if (isNight) mult *= 1.5;
  if (locationType === LOCATION_TYPES.Graveyard) mult *= 2.0;
  if (climateIndex === CLIMATES.HauntedWoodlands) mult *= 1.5;

  const finalChance = Math.min(0.55, baseChance * mult);
  return rng() < finalChance;
}

/**
 * Selects a random subset (`ratio` = 50% default) of living undead minions to crumble
 * when their Necromancer master falls.
 * @template T
 * @param {T[]} livingUndead
 * @param {number} [ratio=UNDEAD_HORDE_DEATH_CRUMBLE_RATIO]
 * @param {() => number} [rng=Math.random]
 * @returns {T[]}
 */
export function selectUndeadToCrumble(
  livingUndead,
  ratio = UNDEAD_HORDE_DEATH_CRUMBLE_RATIO,
  rng = Math.random,
) {
  if (!Array.isArray(livingUndead) || livingUndead.length === 0) return [];
  const valid = livingUndead.filter((f) => Boolean(f) && !/** @type {any} */ (f).dead);
  if (valid.length === 0) return [];
  const count = Math.min(valid.length, Math.max(1, Math.round(valid.length * ratio)));
  const copy = [...valid];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy.slice(0, count);
}
