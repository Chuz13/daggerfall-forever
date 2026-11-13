// ═══════════════════════════════════════════════════════════════════════════════
// CRISIS REGISTRY & 39 LIVING TAMRIEL ENCOUNTERS
//
// Full 39-event encounter matrix bridging political crises, regional conditions,
// location types, settlement prosperity, and roleplay ChoiceWindows.
//
// Rules:
//  - All mobs strictly drawn from MOBILE_TYPES in src/characters/mobile/mobileTypes.js
//  - Zero loot on spawned actors (lootDropped: false, items: []) to prevent economy exploit
//  - Roleplay choices with skill checks (Etiquette, Streetwise, Orcish, Restoration, etc.)
//  - Location prosperity calculated from average exterior building quality (1..20)
// ═══════════════════════════════════════════════════════════════════════════════

import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import { LOCATION_TYPES } from '../../formats/mapsFile.js';
import { REGION_NAMES, BAY_REGION_COUNT } from '../../formats/mapsTables.js';
import { getLocalizedRegionName, t } from '../textManager.js';
import { LIVING_WORDS } from './livingWords.js';
import { BORDER_REGIONS } from '../faction/factionRelations.js';
import { SKILLS } from '../skills.js';
import { REGION_FLAGS } from '../region/regionConditions.js';
import {
  CRISIS_TYPE,
  CRISIS_PHASE,
  getRegionState,
  getActiveCrises,
  getBoundRegionConditions,
} from './regionState.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import {
  LIVING_ROLL_DEGREE,
  resolveLivingRoll,
  computeRoleplayBribeMultiplier,
  getPlayerRoleplayContextMod,
} from './livingRolls.js';

/** Prosperity Tiers */
export const PROSPERITY_TIER = Object.freeze({
  LOW: 'LOW',
  MID: 'MID',
  HIGH: 'HIGH',
});

/**
 * Calculates the prosperity of a location based on exterior building quality (1..20).
 * @param {any} dfLocation
 * @returns {'LOW' | 'MID' | 'HIGH'}
 */
export function calculateLocationProsperity(dfLocation) {
  const buildings = dfLocation?.exterior?.buildings;
  if (!Array.isArray(buildings) || buildings.length === 0) {
    return PROSPERITY_TIER.MID;
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < buildings.length; i++) {
    const q = Number(buildings[i]?.quality ?? 10);
    if (!Number.isNaN(q) && q > 0) {
      sum += q;
      count++;
    }
  }
  if (count === 0) return PROSPERITY_TIER.MID;
  const avg = sum / count;
  if (avg >= 14) return PROSPERITY_TIER.HIGH;
  if (avg >= 7) return PROSPERITY_TIER.MID;
  return PROSPERITY_TIER.LOW;
}

/**
 * Gets a neighbor or enemy province name for interprovincial narrative.
 * @param {number} regionIndex
 * @param {() => number} [rng=Math.random]
 * @returns {string}
 */
export function getEnemyProvinceName(regionIndex, rng = Math.random) {
  if (regionIndex >= 0 && regionIndex < BAY_REGION_COUNT) {
    const offset = regionIndex * 11;
    const candidates = [];
    for (let i = 0; i < 11; i++) {
      const neighbor = BORDER_REGIONS[offset + i];
      if (neighbor > 0 && neighbor !== regionIndex && neighbor < REGION_NAMES.length) {
        candidates.push(neighbor);
      }
    }
    if (candidates.length > 0) {
      const idx = Math.floor(rng() * candidates.length);
      const regId = candidates[idx];
      return getLocalizedRegionName(regId, () => REGION_NAMES[regId] ?? '');
    }
  }
  return regionIndex === 16 ? getLocalizedRegionName(16, () => 'Sentinel') : 'Orsinium';
}

// Localized title of a crisis event.
export function getEventDisplayName(event) {
  if (!event) return '';
  return t(`living.event.${event.id}.name`, event.name || 'Crisis Event');
}

/**
 * The 39 Core Living Tamriel Crisis & Exploration Encounters.
 */
export const CRISIS_EVENTS = Object.freeze([
  // ── 1. WAR & MARTIAL CONFLICTS (5) ──────────────────────────────────────────
  {
    id: 'EVT_WAR_INTERPROVINCIAL',
    name: 'Interprovincial Skirmish',
    category: 'WAR',
    crisisTypes: [CRISIS_TYPE.WAR],
    regionFlags: [REGION_FLAGS.WarBeginning, REGION_FLAGS.WarOngoing, REGION_FLAGS.WarLost],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet, LOCATION_TYPES.DungeonKeep],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior, MOBILE_TYPES.Archer, MOBILE_TYPES.Battlemage],
    attackersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior, MOBILE_TYPES.Archer, MOBILE_TYPES.Barbarian, MOBILE_TYPES.Spellsword],
    getFactionNames: (reg, enemy) => {
      const r = Number.isInteger(reg) ? getLocalizedRegionName(reg, () => REGION_NAMES[reg] ?? '') : (reg || 'Local');
      return { f1: LIVING_WORDS.factionDefenders(r), f2: LIVING_WORDS.factionVanguard(enemy) };
    },
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_WAR_INTERPROVINCIAL.1', '1. Defend the settlement alongside [{f1}]', { f1 }), stance: 'defenders', goldReward: 200, repF1: 7, repF2: -10, xp: 100 },
      { text: t('living.choice.EVT_WAR_INTERPROVINCIAL.2', '2. Support the assault of [{f2}]', { f2 }), stance: 'attackers', goldReward: 150, repF1: -12, repF2: 7, bountyHostile: true },
      { text: t('living.choice.EVT_WAR_INTERPROVINCIAL.3', '3. Do not intervene in the interprovincial war'), stance: 'neutral' },
      { text: t('living.choice.EVT_WAR_INTERPROVINCIAL.4', '4. Martial diplomacy: Call for a truce (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 4, repF2: 4, xp: 140 },
    ],
  },
  {
    id: 'EVT_WAR_ORSINIUM_RAID',
    name: 'Orsinium Orcish Raid',
    category: 'WAR',
    crisisTypes: [CRISIS_TYPE.WAR],
    regionFlags: [REGION_FLAGS.WarBeginning, REGION_FLAGS.WarOngoing],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet, LOCATION_TYPES.HomeFarms],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Archer, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Orc, MOBILE_TYPES.OrcSergeant, MOBILE_TYPES.OrcWarlord, MOBILE_TYPES.OrcShaman],
    getFactionNames: (reg) => {
      const r = Number.isInteger(reg) ? getLocalizedRegionName(reg, () => REGION_NAMES[reg] ?? '') : (reg || 'Town');
      return { f1: LIVING_WORDS.factionGarrison(r), f2: LIVING_WORDS.factionWarband() };
    },
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_WAR_ORSINIUM_RAID.1', '1. Repel the orc raid alongside [{f1}]', { f1 }), stance: 'defenders', goldReward: 250, repF1: 8, repF2: -15, xp: 120 },
      { text: t('living.choice.EVT_WAR_ORSINIUM_RAID.2', '2. Join the [{f2}] assault against the garrison', { f2 }), stance: 'attackers', goldReward: 150, repF1: -15, repF2: 10, bountyHostile: true },
      { text: t('living.choice.EVT_WAR_ORSINIUM_RAID.3', '3. Do not intervene in the orcish raid'), stance: 'neutral' },
      { text: t('living.choice.EVT_WAR_ORSINIUM_RAID.4', '4. Invoke the orcish honor code to halt the raid (Orcish)'), stance: 'peace', skillCheck: { skill: SKILLS.Orcish, target: 40 }, repF1: 4, repF2: 10, xp: 150 },
    ],
  },
  {
    id: 'EVT_WAR_PRISONER_EXECUTION',
    name: 'Prisoner of War Execution',
    category: 'WAR',
    crisisTypes: [CRISIS_TYPE.WAR],
    regionFlags: [REGION_FLAGS.WarOngoing, REGION_FLAGS.WarWon, REGION_FLAGS.WarLost],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.HomeFarms, LOCATION_TYPES.Tavern],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Rogue],
    getFactionNames: (reg, enemy) => {
      const r = Number.isInteger(reg) ? getLocalizedRegionName(reg, () => REGION_NAMES[reg] ?? '') : (reg || 'Provost');
      return { f1: LIVING_WORDS.factionGarrison(r), f2: LIVING_WORDS.factionCaptives(enemy) };
    },
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_WAR_PRISONER_EXECUTION.1', '1. Uphold the sentence and assist the guard [{f1}]', { f1 }), stance: 'defenders', repF1: 5, repF2: -8, xp: 50 },
      { text: t('living.choice.EVT_WAR_PRISONER_EXECUTION.2', '2. Free the prisoners by force for [{f2}]', { f2 }), stance: 'attackers', repF1: -10, repF2: 10, bountyHostile: true },
      { text: t('living.choice.EVT_WAR_PRISONER_EXECUTION.3', '3. Do not intervene in the execution'), stance: 'neutral' },
      { text: t('living.choice.EVT_WAR_PRISONER_EXECUTION.4', '4. Ransom the prisoners to spare their lives (100 gold)'), stance: 'peace', goldCost: 100, repF1: 4, repF2: 6, xp: 80 },
    ],
  },
  {
    id: 'EVT_WAR_DESERTERS_SHAKEDOWN',
    name: 'Deserters Shakedown',
    category: 'WAR',
    crisisTypes: [CRISIS_TYPE.WAR, CRISIS_TYPE.FAMINE],
    regionFlags: [REGION_FLAGS.WarWon, REGION_FLAGS.WarLost, REGION_FLAGS.FamineBeginning, REGION_FLAGS.BadHarvest],
    locationTypes: [LOCATION_TYPES.HomeFarms, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Ranger, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Barbarian, MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    getFactionNames: () => ({ f1: 'Local Millers & Farmers', f2: 'Armed Deserters' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_WAR_DESERTERS_SHAKEDOWN.1', '1. Defend the farmers and drive off the looters'), stance: 'defenders', goldReward: 50, repF1: 6, xp: 80 },
      { text: t('living.choice.EVT_WAR_DESERTERS_SHAKEDOWN.2', '2. Help the deserters seize farm provisions'), stance: 'attackers', goldReward: 40, repF1: -8, repF2: 6 },
      { text: t('living.choice.EVT_WAR_DESERTERS_SHAKEDOWN.3', '3. Do not intervene in peasant quarrels'), stance: 'neutral' },
      { text: t('living.choice.EVT_WAR_DESERTERS_SHAKEDOWN.4', '4. Intimidate deserters with your reputation (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 5, repF2: 4, xp: 100 },
    ],
  },
  {
    id: 'EVT_WAR_RECRUITMENT_PRESSGANG',
    name: 'Forced Conscription Pressgang',
    category: 'WAR',
    crisisTypes: [CRISIS_TYPE.WAR],
    regionFlags: [REGION_FLAGS.WarBeginning, REGION_FLAGS.WarOngoing],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Knight],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Crown'} Recruiter`, f2: 'Reluctant Peasants' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_WAR_RECRUITMENT_PRESSGANG.1', '1. Help the officer [{f1}] round up recruits', { f1 }), stance: 'defenders', goldReward: 60, repF1: 4 },
      { text: t('living.choice.EVT_WAR_RECRUITMENT_PRESSGANG.2', '2. Defend the townsfolk with steel against pressgang'), stance: 'attackers', repF1: -8, repF2: 8, bountyHostile: true },
      { text: t('living.choice.EVT_WAR_RECRUITMENT_PRESSGANG.3', '3. Do not intervene in the recruitment'), stance: 'neutral' },
      { text: t('living.choice.EVT_WAR_RECRUITMENT_PRESSGANG.4', '4. Pay an exemption fee for the recruits (80 gold)'), stance: 'peace', goldCost: 80, repF1: 2, repF2: 8, xp: 70 },
    ],
  },

  // ── 2. FAMINE & SCARCITY (5) ────────────────────────────────────────────────
  {
    id: 'EVT_FAMINE_BARN_RAID',
    name: 'Famine Bread Riot',
    category: 'FAMINE',
    crisisTypes: [CRISIS_TYPE.FAMINE],
    regionFlags: [REGION_FLAGS.FamineBeginning, REGION_FLAGS.FamineOngoing, REGION_FLAGS.BadHarvest],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.HomeFarms],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief, MOBILE_TYPES.Warrior],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Granary'} Guards`, f2: 'Starving Mob' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_FAMINE_BARN_RAID.1', '1. Help the guard hold the granary by force'), stance: 'defenders', goldReward: 80, repF1: 5, repF2: -6 },
      { text: t('living.choice.EVT_FAMINE_BARN_RAID.2', '2. Help the starving break the lock and share grain'), stance: 'attackers', repF1: -8, repF2: 10, bountyHostile: true },
      { text: t('living.choice.EVT_FAMINE_BARN_RAID.3', '3. Do not intervene in the granary riot'), stance: 'neutral' },
      { text: t('living.choice.EVT_FAMINE_BARN_RAID.4', '4. Buy grain for the crowd and negotiate peace (100 gold)'), stance: 'peace', goldCost: 100, repF1: 6, repF2: 8, xp: 120 },
    ],
  },
  {
    id: 'EVT_FAMINE_PREDATOR_INVASION',
    name: 'Starving Predators Attack',
    category: 'FAMINE',
    crisisTypes: [CRISIS_TYPE.FAMINE],
    regionFlags: [REGION_FLAGS.FamineOngoing, REGION_FLAGS.FamineEnding, REGION_FLAGS.BadHarvest],
    locationTypes: [LOCATION_TYPES.HomeFarms, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Ranger, MOBILE_TYPES.Monk],
    attackersPool: [MOBILE_TYPES.GrizzlyBear, MOBILE_TYPES.SabertoothTiger, MOBILE_TYPES.Rat, MOBILE_TYPES.Wereboar],
    getFactionNames: () => ({ f1: 'Local Shepherds', f2: 'Famished Wild Beasts' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_FAMINE_PREDATOR_INVASION.1', '1. Slay the beasts with steel and save the flock'), stance: 'defenders', goldReward: 40, repF1: 6, xp: 90 },
      { text: t('living.choice.EVT_FAMINE_PREDATOR_INVASION.2', '2. Exploit the chaos to raid the unguarded farm pens'), stance: 'attackers', goldReward: 50, repF1: -8 },
      { text: t('living.choice.EVT_FAMINE_PREDATOR_INVASION.3', '3. Do not intervene in the predator attack'), stance: 'neutral' },
      { text: t('living.choice.EVT_FAMINE_PREDATOR_INVASION.4', '4. Pacify and lure away the beasts with bait (Animal Lore)'), stance: 'peace', skillCheck: { skill: SKILLS.Stealth, target: 40 }, repF1: 6, xp: 80 },
    ],
  },
  {
    id: 'EVT_FAMINE_RELIEF_CARAVAN',
    name: 'Relief Caravan Ambush',
    category: 'FAMINE',
    crisisTypes: [CRISIS_TYPE.FAMINE],
    regionFlags: [REGION_FLAGS.FamineOngoing, REGION_FLAGS.FamineEnding],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.Tavern],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior, MOBILE_TYPES.Spellsword],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief, MOBILE_TYPES.Nightblade],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Crown'} Relief Escort`, f2: 'Grain Raiders' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_FAMINE_RELIEF_CARAVAN.1', '1. Defend the royal relief wagon from raiders'), stance: 'defenders', goldReward: 180, repF1: 8, repF2: -8, xp: 110 },
      { text: t('living.choice.EVT_FAMINE_RELIEF_CARAVAN.2', '2. Help the raiders seize the relief caravan'), stance: 'attackers', goldReward: 120, repF1: -12, repF2: 8, bountyHostile: true },
      { text: t('living.choice.EVT_FAMINE_RELIEF_CARAVAN.3', '3. Do not intervene in the caravan ambush'), stance: 'neutral' },
      { text: t('living.choice.EVT_FAMINE_RELIEF_CARAVAN.4', '4. Negotiate an emergency grain ration sharing (Mercantile)'), stance: 'peace', skillCheck: { skill: SKILLS.Mercantile, target: 45 }, repF1: 6, repF2: 6, xp: 100 },
    ],
  },
  {
    id: 'EVT_FAMINE_SOUP_KITCHEN_SPOILAGE',
    name: 'Spoiled Monastery Soup',
    category: 'FAMINE',
    crisisTypes: [CRISIS_TYPE.FAMINE],
    regionFlags: [REGION_FLAGS.FamineBeginning, REGION_FLAGS.FamineOngoing],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.ReligionTemple],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Monk, MOBILE_TYPES.Healer],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief],
    getFactionNames: () => ({ f1: 'Temple Almoners', f2: 'Discontented Town Paupers' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_FAMINE_SOUP_KITCHEN_SPOILAGE.1', '1. Pacify the vagrants and support the monks'), stance: 'defenders', repF1: 4, repF2: -4, xp: 40 },
      { text: t('living.choice.EVT_FAMINE_SOUP_KITCHEN_SPOILAGE.2', '2. Denounce the monastery and support the hungry mob'), stance: 'attackers', repF1: -6, repF2: 6 },
      { text: t('living.choice.EVT_FAMINE_SOUP_KITCHEN_SPOILAGE.3', '3. Do not intervene in the soup kitchen dispute'), stance: 'neutral' },
      { text: t('living.choice.EVT_FAMINE_SOUP_KITCHEN_SPOILAGE.4', '4. Purify the spoiled food with restoration magic (Restoration)'), stance: 'peace', skillCheck: { skill: SKILLS.Restoration, target: 40 }, repF1: 8, repF2: 8, xp: 120 },
    ],
  },
  {
    id: 'EVT_FAMINE_RATION_SCAM',
    name: 'Rotten Provisions Speculator',
    category: 'FAMINE',
    crisisTypes: [CRISIS_TYPE.FAMINE],
    regionFlags: [REGION_FLAGS.FamineOngoing, REGION_FLAGS.PricesHigh],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Rogue],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Rogue],
    getFactionNames: () => ({ f1: 'Angry Customers', f2: 'Gouging Merchant & Thugs' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_FAMINE_RATION_SCAM.1', '1. Force the speculator to refund coin with steel'), stance: 'defenders', goldReward: 50, repF1: 5, repF2: -8 },
      { text: t('living.choice.EVT_FAMINE_RATION_SCAM.2', '2. Guard the merchant and disperse the angry customers'), stance: 'attackers', goldReward: 60, repF1: -6, repF2: 6 },
      { text: t('living.choice.EVT_FAMINE_RATION_SCAM.3', '3. Do not intervene in the market quarrel'), stance: 'neutral' },
      { text: t('living.choice.EVT_FAMINE_RATION_SCAM.4', '4. Demand merchant guild license and fair prices (Mercantile)'), stance: 'peace', skillCheck: { skill: SKILLS.Mercantile, target: 45 }, repF1: 6, repF2: 4, xp: 80 },
    ],
  },

  // ── 3. PLAGUE & CONTAGION (4) ───────────────────────────────────────────────
  {
    id: 'EVT_PLAGUE_QUARANTINE_CLASH',
    name: 'Quarantine Breach at Gate',
    category: 'PLAGUE',
    crisisTypes: [CRISIS_TYPE.PLAGUE],
    regionFlags: [REGION_FLAGS.PlagueBeginning, REGION_FLAGS.PlagueOngoing, REGION_FLAGS.PlagueEnding],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Knight],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Barbarian, MOBILE_TYPES.Warrior],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Town'} Cordons`, f2: 'Infected Refugees' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_PLAGUE_QUARANTINE_CLASH.1', '1. Hold the crowd back with quarantine guards'), stance: 'defenders', goldReward: 100, repF1: 6, repF2: -8 },
      { text: t('living.choice.EVT_PLAGUE_QUARANTINE_CLASH.2', '2. Breach the gates for refugees by force'), stance: 'attackers', repF1: -10, repF2: 8, bountyHostile: true },
      { text: t('living.choice.EVT_PLAGUE_QUARANTINE_CLASH.3', '3. Do not intervene in the quarantine standoff'), stance: 'neutral' },
      { text: t('living.choice.EVT_PLAGUE_QUARANTINE_CLASH.4', '4. Heal the afflicted at the gate with prayer (Restoration)'), stance: 'peace', skillCheck: { skill: SKILLS.Restoration, target: 45 }, repF1: 10, repF2: 10, xp: 150 },
    ],
  },
  {
    id: 'EVT_PLAGUE_PYRE_DESECRATION',
    name: 'Plague Pyres and Risen Dead',
    category: 'PLAGUE',
    crisisTypes: [CRISIS_TYPE.PLAGUE],
    regionFlags: [REGION_FLAGS.PlagueOngoing, REGION_FLAGS.PlagueEnding],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.Graveyard],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Monk, MOBILE_TYPES.Healer],
    attackersPool: [MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Zombie, MOBILE_TYPES.Rat],
    getFactionNames: () => ({ f1: 'Temple Undertakers', f2: 'Risen Plague Dead' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_PLAGUE_PYRE_DESECRATION.1', '1. Exterminate the risen dead with silver and steel'), stance: 'defenders', repF1: 8, xp: 120 },
      { text: t('living.choice.EVT_PLAGUE_PYRE_DESECRATION.2', '2. Channel the necromantic surge against the undertakers'), stance: 'attackers', repF1: -10, repF2: 8 },
      { text: t('living.choice.EVT_PLAGUE_PYRE_DESECRATION.3', '3. Do not intervene by the diseased pyres'), stance: 'neutral' },
      { text: t('living.choice.EVT_PLAGUE_PYRE_DESECRATION.4', '4. Consecrate the funeral pyre and banish the dead (Restoration)'), stance: 'peace', skillCheck: { skill: SKILLS.Restoration, target: 40 }, repF1: 10, xp: 140 },
    ],
  },
  {
    id: 'EVT_PLAGUE_WATER_WELL_SCARE',
    name: 'Poisoned Well Panic',
    category: 'PLAGUE',
    crisisTypes: [CRISIS_TYPE.PLAGUE],
    regionFlags: [REGION_FLAGS.PlagueBeginning, REGION_FLAGS.PlagueOngoing],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Town'} Watch`, f2: 'Hysterical Crowd' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_PLAGUE_WATER_WELL_SCARE.1', '1. Disperse the panicked crowd with the city watch'), stance: 'defenders', repF1: 4, repF2: -6 },
      { text: t('living.choice.EVT_PLAGUE_WATER_WELL_SCARE.2', '2. Lead the crowd to smash the contaminated well'), stance: 'attackers', repF1: -4, repF2: 6 },
      { text: t('living.choice.EVT_PLAGUE_WATER_WELL_SCARE.3', '3. Do not intervene in the water well panic'), stance: 'neutral' },
      { text: t('living.choice.EVT_PLAGUE_WATER_WELL_SCARE.4', '4. Test the well water and calm the crowd (Medical)'), stance: 'peace', skillCheck: { skill: SKILLS.Medical, target: 40 }, repF1: 8, repF2: 8, xp: 110 },
    ],
  },
  {
    id: 'EVT_PLAGUE_QUACK_MIRACLE_CURE',
    name: 'Quack Healer with Fake Cure',
    category: 'PLAGUE',
    crisisTypes: [CRISIS_TYPE.PLAGUE],
    regionFlags: [REGION_FLAGS.PlagueOngoing, REGION_FLAGS.PlagueEnding, REGION_FLAGS.PricesHigh],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Spellsword],
    getFactionNames: () => ({ f1: 'Deceived Sick Townsfolk', f2: 'Quack Alchemist & Bodyguards' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_PLAGUE_QUACK_MIRACLE_CURE.1', '1. Defend the sick townsfolk and demand justice'), stance: 'defenders', goldReward: 80, repF1: 6, repF2: -6 },
      { text: t('living.choice.EVT_PLAGUE_QUACK_MIRACLE_CURE.2', '2. Act as bodyguard for the quack alchemist'), stance: 'attackers', goldReward: 70, repF1: -8, repF2: 8 },
      { text: t('living.choice.EVT_PLAGUE_QUACK_MIRACLE_CURE.3', '3. Do not intervene in the cure dispute'), stance: 'neutral' },
      { text: t('living.choice.EVT_PLAGUE_QUACK_MIRACLE_CURE.4', '4. Publicly expose the fake remedy with medicine (Medical)'), stance: 'peace', skillCheck: { skill: SKILLS.Medical, target: 45 }, repF1: 8, repF2: 4, xp: 120 },
    ],
  },

  // ── 4. WITCH HUNTS & OCCULT (4) ────────────────────────────────────────────
  {
    id: 'EVT_WITCH_HUNT_SIEGE',
    name: 'Inquisition Siege of Witch Coven',
    category: 'OCCULT',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.WitchBurnings],
    locationTypes: [LOCATION_TYPES.Coven, LOCATION_TYPES.TownVillage, LOCATION_TYPES.DungeonRuin],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Battlemage],
    attackersPool: [MOBILE_TYPES.Mage, MOBILE_TYPES.Nightblade, MOBILE_TYPES.Werewolf],
    getFactionNames: () => ({ f1: 'Holy Inquisitors', f2: 'Coven Witches & Thralls' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_WITCH_HUNT_SIEGE.1', '1. Join the inquisition and purge the coven'), stance: 'defenders', goldReward: 150, repF1: 8, repF2: -15 },
      { text: t('living.choice.EVT_WITCH_HUNT_SIEGE.2', '2. Shield the witches from the pyre'), stance: 'attackers', goldReward: 100, repF1: -15, repF2: 12 },
      { text: t('living.choice.EVT_WITCH_HUNT_SIEGE.3', '3. Do not intervene in the witch hunt'), stance: 'neutral' },
      { text: t('living.choice.EVT_WITCH_HUNT_SIEGE.4', '4. Persuade the inquisitor to accept penance (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 55 }, repF1: 4, repF2: 4, xp: 130 },
    ],
  },
  {
    id: 'EVT_WITCH_ENTHRALLED_AMBUSH',
    name: 'Enthralled Coven Guards Ambush',
    category: 'OCCULT',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.WitchBurnings, REGION_FLAGS.ScaryHoliday, REGION_FLAGS.MadWizardNearby],
    locationTypes: [LOCATION_TYPES.TownHamlet, LOCATION_TYPES.HomeFarms, LOCATION_TYPES.Coven],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Ranger],
    attackersPool: [MOBILE_TYPES.Spellsword, MOBILE_TYPES.Nightblade],
    getFactionNames: () => ({ f1: 'Bewitched Rangers', f2: 'Travelling Wayfarers' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_WITCH_ENTHRALLED_AMBUSH.1', '1. Stand and fight the enthralled sentries'), stance: 'defenders', goldReward: 40, xp: 80 },
      { text: t('living.choice.EVT_WITCH_ENTHRALLED_AMBUSH.2', '2. Attack the wayfarers under the witching influence'), stance: 'attackers', goldReward: 50, repF1: -8 },
      { text: t('living.choice.EVT_WITCH_ENTHRALLED_AMBUSH.3', '3. Do not intervene in the roadside ambush'), stance: 'neutral' },
      { text: t('living.choice.EVT_WITCH_ENTHRALLED_AMBUSH.4', '4. Dispel the witchcraft illusion trance (Thaumaturgy)'), stance: 'peace', skillCheck: { skill: SKILLS.Thaumaturgy, target: 40 }, repF1: 6, xp: 120 },
    ],
  },
  {
    id: 'EVT_WITCH_HERBALIST_SHAKEDOWN',
    name: 'Witch Hunters Harassing Herbalist',
    category: 'OCCULT',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.WitchBurnings],
    locationTypes: [LOCATION_TYPES.TownVillage, LOCATION_TYPES.HomeFarms, LOCATION_TYPES.TownHamlet],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Barbarian, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Healer, MOBILE_TYPES.Monk],
    getFactionNames: () => ({ f1: 'Zealous Witchhunters', f2: 'Village Herbalist' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_WITCH_HERBALIST_SHAKEDOWN.1', '1. Assist witchhunters in searching the apothecary'), stance: 'defenders', repF1: 5, repF2: -8 },
      { text: t('living.choice.EVT_WITCH_HERBALIST_SHAKEDOWN.2', '2. Defend the herbalist against zealous hunters'), stance: 'attackers', goldReward: 50, repF1: -8, repF2: 8 },
      { text: t('living.choice.EVT_WITCH_HERBALIST_SHAKEDOWN.3', '3. Do not intervene in the herbalist shakedown'), stance: 'neutral' },
      { text: t('living.choice.EVT_WITCH_HERBALIST_SHAKEDOWN.4', '4. Verify apothecary herbs are non-toxic (Medical)'), stance: 'peace', skillCheck: { skill: SKILLS.Medical, target: 40 }, repF1: 4, repF2: 6, xp: 100 },
    ],
  },
  {
    id: 'EVT_WITCH_DAEDRA_PACT_SIGHTING',
    name: 'Secret Night Daedra Summoning',
    category: 'OCCULT',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.WitchBurnings, REGION_FLAGS.ScaryHoliday, REGION_FLAGS.MadWizardNearby, REGION_FLAGS.MadWizardDies],
    locationTypes: [LOCATION_TYPES.Graveyard, LOCATION_TYPES.DungeonRuin, LOCATION_TYPES.Coven],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Mage, MOBILE_TYPES.Sorcerer],
    attackersPool: [MOBILE_TYPES.FireDaedra, MOBILE_TYPES.Imp],
    getFactionNames: () => ({ f1: 'Occult Summoners', f2: 'Unbound Daedra' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_WITCH_DAEDRA_PACT_SIGHTING.1', '1. Assist the summoners in binding the unbound Daedra'), stance: 'defenders', repF1: 6, xp: 100 },
      { text: t('living.choice.EVT_WITCH_DAEDRA_PACT_SIGHTING.2', '2. Strike down the occultists and their fiends'), stance: 'attackers', repF1: -10, xp: 150 },
      { text: t('living.choice.EVT_WITCH_DAEDRA_PACT_SIGHTING.3', '3. Do not intervene in the dark ritual'), stance: 'neutral' },
      { text: t('living.choice.EVT_WITCH_DAEDRA_PACT_SIGHTING.4', '4. Banish the summoned Daedra and seal the rift (Daedric)'), stance: 'peace', skillCheck: { skill: SKILLS.Daedric, target: 40 }, repF1: 8, xp: 140 },
    ],
  },

  // ── 5. CRIME WAVE & UNDERWORLD (4) ──────────────────────────────────────────
  {
    id: 'EVT_CRIME_DAYLIGHT_HEIST',
    name: 'Daylight Moneylender Heist',
    category: 'CRIME',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.CrimeWave, REGION_FLAGS.TGMInJail, REGION_FLAGS.TGMSetFree, REGION_FLAGS.NewTGM],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Burglar, MOBILE_TYPES.Rogue],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Town'} Watch`, f2: 'Thieves Guild Heist Crew' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_CRIME_DAYLIGHT_HEIST.1', '1. Intercept the burglars and return the loot'), stance: 'defenders', goldReward: 120, repF1: 6, repF2: -8 },
      { text: t('living.choice.EVT_CRIME_DAYLIGHT_HEIST.2', '2. Cover the thieves retreat from the city watch'), stance: 'attackers', goldReward: 100, repF1: -8, repF2: 8, bountyHostile: true },
      { text: t('living.choice.EVT_CRIME_DAYLIGHT_HEIST.3', '3. Do not intervene in the daylight robbery'), stance: 'neutral' },
      { text: t('living.choice.EVT_CRIME_DAYLIGHT_HEIST.4', '4. Persuade thieves to drop the loot and flee (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 50 }, repF1: 4, repF2: 4, xp: 80 },
    ],
  },
  {
    id: 'EVT_CRIME_BROTHERHOOD_CONTRACT',
    name: 'Dark Brotherhood Street Contract',
    category: 'CRIME',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.CrimeWave, REGION_FLAGS.TGMExecuted, REGION_FLAGS.NewTGM],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.Tavern],
    baseDefenders: 2,
    baseAttackers: 1,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Assassin, MOBILE_TYPES.Nightblade],
    getFactionNames: () => ({ f1: 'Target Noble & Guard', f2: 'Brotherhood Assassin' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_CRIME_BROTHERHOOD_CONTRACT.1', '1. Shield the marked target from the assassin'), stance: 'defenders', goldReward: 200, repF1: 8, repF2: -15 },
      { text: t('living.choice.EVT_CRIME_BROTHERHOOD_CONTRACT.2', '2. Assist the Dark Brotherhood assassin in the hit'), stance: 'attackers', repF1: -15, repF2: 10, bountyHostile: true },
      { text: t('living.choice.EVT_CRIME_BROTHERHOOD_CONTRACT.3', '3. Do not intervene in Brotherhood business'), stance: 'neutral' },
      { text: t('living.choice.EVT_CRIME_BROTHERHOOD_CONTRACT.4', '4. Distract the assassin and spirit the target away (Stealth)'), stance: 'peace', skillCheck: { skill: SKILLS.Stealth, target: 45 }, repF1: 6, xp: 120 },
    ],
  },
  {
    id: 'EVT_CRIME_PICKPOCKET_CHASE',
    name: 'Bazaar Pickpocket Chase',
    category: 'CRIME',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.CrimeWave, REGION_FLAGS.PricesHigh, REGION_FLAGS.TGMSetFree],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 1,
    baseAttackers: 1,
    defendersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Knight_CityWatch],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Burglar],
    getFactionNames: () => ({ f1: 'Robbed Merchant', f2: 'Fleeing Pickpocket' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_CRIME_PICKPOCKET_CHASE.1', '1. Tackle the fleeing cutpurse to the ground'), stance: 'defenders', goldReward: 25, repF1: 4 },
      { text: t('living.choice.EVT_CRIME_PICKPOCKET_CHASE.2', '2. Trip the pursuing merchant and let the thief flee'), stance: 'attackers', repF1: -4, repF2: 6 },
      { text: t('living.choice.EVT_CRIME_PICKPOCKET_CHASE.3', '3. Do not intervene in the bazaar chase'), stance: 'neutral' },
      { text: t('living.choice.EVT_CRIME_PICKPOCKET_CHASE.4', '4. Compensate the merchant for the stolen goods (25 gold)'), stance: 'peace', goldCost: 25, repF1: 4, repF2: 4, xp: 50 },
    ],
  },
  {
    id: 'EVT_CRIME_GAMBLING_DEN_BUST',
    name: 'Watch Raid on Gambling Den',
    category: 'CRIME',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.CrimeWave, REGION_FLAGS.TGMInJail, REGION_FLAGS.TGMExecuted],
    locationTypes: [LOCATION_TYPES.Tavern, LOCATION_TYPES.TownCity],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Knight],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief, MOBILE_TYPES.Warrior],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Watch'} Sergeants`, f2: 'Den Gamblers & Bouncers' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_CRIME_GAMBLING_DEN_BUST.1', '1. Assist the watch in raiding the illicit den'), stance: 'defenders', goldReward: 80, repF1: 6, repF2: -6 },
      { text: t('living.choice.EVT_CRIME_GAMBLING_DEN_BUST.2', '2. Defend the gamblers and hold the door for escape'), stance: 'attackers', repF1: -6, repF2: 8 },
      { text: t('living.choice.EVT_CRIME_GAMBLING_DEN_BUST.3', '3. Do not intervene in the gambling den raid'), stance: 'neutral' },
      { text: t('living.choice.EVT_CRIME_GAMBLING_DEN_BUST.4', '4. Bribe the sergeant to overlook the cellar (75 gold)'), stance: 'peace', goldCost: 75, repF1: 2, repF2: 6, xp: 60 },
    ],
  },

  // ── 6. TEMPLE PERSECUTION & FAITH (4) ───────────────────────────────────────
  {
    id: 'EVT_TEMPLE_PURGE_SIEGE',
    name: 'Cult Purge: Shrine Siege',
    category: 'FAITH',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.PersecutedTemple],
    locationTypes: [LOCATION_TYPES.ReligionTemple, LOCATION_TYPES.ReligionCult],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Monk, MOBILE_TYPES.Healer, MOBILE_TYPES.Spellsword],
    attackersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior, MOBILE_TYPES.Archer],
    getFactionNames: (reg) => ({ f1: 'Sanctuary Clergy', f2: `${REGION_NAMES[reg] ?? 'Crown'} Enforcers` }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_TEMPLE_PURGE_SIEGE.1', '1. Protect the sanctuary clergy and sacred relics'), stance: 'defenders', repF1: 10, repF2: -12, xp: 120 },
      { text: t('living.choice.EVT_TEMPLE_PURGE_SIEGE.2', '2. Help the city enforcers storm the shrine'), stance: 'attackers', goldReward: 100, repF1: -12, repF2: 8 },
      { text: t('living.choice.EVT_TEMPLE_PURGE_SIEGE.3', '3. Do not intervene in the holy sanctuary siege'), stance: 'neutral' },
      { text: t('living.choice.EVT_TEMPLE_PURGE_SIEGE.4', '4. Ancient sanctuary right: Invoke immunity (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 6, repF2: 6, xp: 140 },
    ],
  },
  {
    id: 'EVT_TEMPLE_CLERGY_STANDOFF',
    name: 'Clergy Standoff over Relic',
    category: 'FAITH',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.PersecutedTemple, REGION_FLAGS.HolyHoliday],
    locationTypes: [LOCATION_TYPES.ReligionTemple, LOCATION_TYPES.ReligionCult, LOCATION_TYPES.TownHamlet],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Monk, MOBILE_TYPES.Knight],
    attackersPool: [MOBILE_TYPES.Monk, MOBILE_TYPES.Spellsword],
    getFactionNames: () => ({ f1: 'Orthodox Guardians', f2: 'Schismatic Reformers' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_TEMPLE_CLERGY_STANDOFF.1', '1. Defend the orthodox keepers of the relic'), stance: 'defenders', repF1: 6, repF2: -6, xp: 70 },
      { text: t('living.choice.EVT_TEMPLE_CLERGY_STANDOFF.2', '2. Support the reformist schismatics'), stance: 'attackers', repF1: -6, repF2: 6, xp: 70 },
      { text: t('living.choice.EVT_TEMPLE_CLERGY_STANDOFF.3', '3. Do not intervene in the theological dispute'), stance: 'neutral' },
      { text: t('living.choice.EVT_TEMPLE_CLERGY_STANDOFF.4', '4. Reconcile both sides with sacred scripture (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 45 }, repF1: 4, repF2: 4, xp: 90 },
    ],
  },
  {
    id: 'EVT_TEMPLE_HERETIC_GRAFFITI',
    name: 'Heretic Desecration of Temple Gates',
    category: 'FAITH',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.PersecutedTemple, REGION_FLAGS.CrimeWave],
    locationTypes: [LOCATION_TYPES.ReligionTemple],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Monk, MOBILE_TYPES.Knight_CityWatch],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief],
    getFactionNames: () => ({ f1: 'Temple Wardens', f2: 'Heretic Vandal Gang' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_TEMPLE_HERETIC_GRAFFITI.1', '1. Drive off the desecrators with the temple wardens'), stance: 'defenders', goldReward: 50, repF1: 6, repF2: -6 },
      { text: t('living.choice.EVT_TEMPLE_HERETIC_GRAFFITI.2', '2. Join the heretics in defacing the temple facade'), stance: 'attackers', repF1: -6, repF2: 6 },
      { text: t('living.choice.EVT_TEMPLE_HERETIC_GRAFFITI.3', '3. Do not intervene in the temple vandalism'), stance: 'neutral' },
      { text: t('living.choice.EVT_TEMPLE_HERETIC_GRAFFITI.4', '4. Cleanse the slogans and counsel the vandals (Restoration)'), stance: 'peace', skillCheck: { skill: SKILLS.Restoration, target: 35 }, repF1: 6, repF2: 4, xp: 80 },
    ],
  },
  {
    id: 'EVT_TEMPLE_ALMS_DISPUTE',
    name: 'Beggars Brawl over Temple Alms',
    category: 'FAITH',
    crisisTypes: [CRISIS_TYPE.FAMINE, CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.PersecutedTemple, REGION_FLAGS.FamineOngoing],
    locationTypes: [LOCATION_TYPES.ReligionTemple, LOCATION_TYPES.TownCity],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Monk],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Rogue],
    getFactionNames: () => ({ f1: 'Elder Beggars', f2: 'Young Vagrants' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_TEMPLE_ALMS_DISPUTE.1', '1. Defend the elder beggars from the young vagrants'), stance: 'defenders', repF1: 5, repF2: -4 },
      { text: t('living.choice.EVT_TEMPLE_ALMS_DISPUTE.2', '2. Support the young vagrants claiming temple space'), stance: 'attackers', repF1: -4, repF2: 5 },
      { text: t('living.choice.EVT_TEMPLE_ALMS_DISPUTE.3', '3. Do not intervene in the beggar brawl'), stance: 'neutral' },
      { text: t('living.choice.EVT_TEMPLE_ALMS_DISPUTE.4', '4. Scatter coins and divide alms evenly (20 gold)'), stance: 'peace', goldCost: 20, repF1: 6, repF2: 6, xp: 60 },
    ],
  },

  // ── 7. NEW RULER & SUCCESSION (3) ──────────────────────────────────────────
  {
    id: 'EVT_NEW_RULER_CORONATION',
    name: 'New Ruler Coronation and Rebels',
    category: 'POLITICS',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.NewRuler],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.DungeonKeep],
    baseDefenders: 3,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Spellsword],
    attackersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Rogue, MOBILE_TYPES.Battlemage],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'New'} Royal Guard`, f2: 'Old Regime Loyalists' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_NEW_RULER_CORONATION.1', '1. Shield the coronation retinue from conspirators'), stance: 'defenders', goldReward: 250, repF1: 12, repF2: -15, xp: 150 },
      { text: t('living.choice.EVT_NEW_RULER_CORONATION.2', '2. Support the loyalists of the old regime in revolt'), stance: 'attackers', repF1: -15, repF2: 12, bountyHostile: true },
      { text: t('living.choice.EVT_NEW_RULER_CORONATION.3', '3. Do not intervene in the dynastic struggle'), stance: 'neutral' },
      { text: t('living.choice.EVT_NEW_RULER_CORONATION.4', '4. Mediate a truce before the lord (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 6, repF2: 6, xp: 160 },
    ],
  },
  {
    id: 'EVT_NEW_RULER_STATUE_UNVEILING',
    name: 'Toppling of Former Lord\'s Statue',
    category: 'POLITICS',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.NewRuler],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Knight],
    attackersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Town'} Watch`, f2: 'Rebellious Townsfolk' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_NEW_RULER_STATUE_UNVEILING.1', '1. Help the guard protect the monument from the mob'), stance: 'defenders', goldReward: 80, repF1: 6, repF2: -6 },
      { text: t('living.choice.EVT_NEW_RULER_STATUE_UNVEILING.2', '2. Help the rebellious townsfolk topple the monument'), stance: 'attackers', repF1: -8, repF2: 8 },
      { text: t('living.choice.EVT_NEW_RULER_STATUE_UNVEILING.3', '3. Do not intervene in the monument riot'), stance: 'neutral' },
      { text: t('living.choice.EVT_NEW_RULER_STATUE_UNVEILING.4', '4. Speech on preserving historical memory (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 5, repF2: 5, xp: 100 },
    ],
  },
  {
    id: 'EVT_NEW_RULER_OATH_CEREMONY',
    name: 'Citadel Vassal Oath Ceremony',
    category: 'POLITICS',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.NewRuler],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.DungeonKeep],
    baseDefenders: 3,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Spellsword],
    attackersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Barbarian],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Crown'} Retinue`, f2: 'Defiant Baron Warband' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_NEW_RULER_OATH_CEREMONY.1', '1. Uphold the feudal oath alongside the crown retinue'), stance: 'defenders', goldReward: 120, repF1: 8, repF2: -10 },
      { text: t('living.choice.EVT_NEW_RULER_OATH_CEREMONY.2', '2. Defend the defiant barons charter of rights'), stance: 'attackers', repF1: -10, repF2: 8 },
      { text: t('living.choice.EVT_NEW_RULER_OATH_CEREMONY.3', '3. Do not intervene in the feudal standoff'), stance: 'neutral' },
      { text: t('living.choice.EVT_NEW_RULER_OATH_CEREMONY.4', '4. Arbitrate a legal feudal compromise (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 45 }, repF1: 6, repF2: 6, xp: 120 },
    ],
  },

  // ── 8. COMMERCE & TAXATION (2) ──────────────────────────────────────────────
  {
    id: 'EVT_PRICES_TAX_REVOLT',
    name: 'Market Square Tax Revolt',
    category: 'COMMERCE',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.PricesHigh],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief, MOBILE_TYPES.Warrior],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Crown'} Tax Bailiffs`, f2: 'Merchant Guild & Crafters' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_PRICES_TAX_REVOLT.1', '1. Help the tax bailiffs enforce collection by arms'), stance: 'defenders', goldReward: 100, repF1: 6, repF2: -8 },
      { text: t('living.choice.EVT_PRICES_TAX_REVOLT.2', '2. Stand with the merchants against extortionate taxes'), stance: 'attackers', repF1: -8, repF2: 8, bountyHostile: true },
      { text: t('living.choice.EVT_PRICES_TAX_REVOLT.3', '3. Do not intervene in the tax revolt'), stance: 'neutral' },
      { text: t('living.choice.EVT_PRICES_TAX_REVOLT.4', '4. Audit the ledgers and negotiate tax relief (Mercantile)'), stance: 'peace', skillCheck: { skill: SKILLS.Mercantile, target: 50 }, repF1: 5, repF2: 8, xp: 120 },
    ],
  },
  {
    id: 'EVT_PRICES_PRICE_GOUGING_INSPECTION',
    name: 'Price-Gouging Shop Inspection',
    category: 'COMMERCE',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.PricesHigh],
    locationTypes: [LOCATION_TYPES.TownCity],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Rogue],
    getFactionNames: () => ({ f1: 'Market Magistrate', f2: 'Usurer & Bodyguards' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_PRICES_PRICE_GOUGING_INSPECTION.1', '1. Defend the magistrate from violent moneylenders'), stance: 'defenders', goldReward: 90, repF1: 6, repF2: -6 },
      { text: t('living.choice.EVT_PRICES_PRICE_GOUGING_INSPECTION.2', '2. Back the shopkeeper and expel the inspector'), stance: 'attackers', goldReward: 80, repF1: -6, repF2: 6 },
      { text: t('living.choice.EVT_PRICES_PRICE_GOUGING_INSPECTION.3', '3. Do not intervene in the market inspection'), stance: 'neutral' },
      { text: t('living.choice.EVT_PRICES_PRICE_GOUGING_INSPECTION.4', '4. Enforce fair commerce by merchant court law (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 5, repF2: 5, xp: 80 },
    ],
  },

  // ── 9. HOLIDAYS & FESTIVITIES (4) ───────────────────────────────────────────
  {
    id: 'EVT_HOLIDAY_TOWN_BRAWL',
    name: 'Holiday Tavern Brawl',
    category: 'HOLIDAY',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.HappyHoliday, REGION_FLAGS.WarWon, REGION_FLAGS.PricesLow],
    locationTypes: [LOCATION_TYPES.Tavern, LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Rogue],
    attackersPool: [MOBILE_TYPES.Barbarian, MOBILE_TYPES.Rogue],
    getFactionNames: () => ({ f1: 'Tavern Keep & Bouncers', f2: 'Rowdy Holidaymakers' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_HOLIDAY_TOWN_BRAWL.1', '1. Help the bouncers restore tavern order'), stance: 'defenders', goldReward: 40, repF1: 5, xp: 60 },
      { text: t('living.choice.EVT_HOLIDAY_TOWN_BRAWL.2', '2. Join the rowdy holidaymakers in the brawl'), stance: 'attackers', repF2: 5, xp: 50 },
      { text: t('living.choice.EVT_HOLIDAY_TOWN_BRAWL.3', '3. Do not intervene in the tavern brawl'), stance: 'neutral' },
      { text: t('living.choice.EVT_HOLIDAY_TOWN_BRAWL.4', '4. Buy a round of spiced ale for the tavern (35 gold)'), stance: 'peace', goldCost: 35, repF1: 6, repF2: 6, xp: 70 },
    ],
  },
  {
    id: 'EVT_HOLIDAY_CARNIVAL_MASQUERADE',
    name: 'Carnival Masquerade Turmoil',
    category: 'HOLIDAY',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.HappyHoliday, REGION_FLAGS.HolyHoliday, REGION_FLAGS.WarWon, REGION_FLAGS.PricesLow],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Bard, MOBILE_TYPES.Acrobat],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Burglar],
    getFactionNames: () => ({ f1: 'Carnival Troupe', f2: 'Masked Tricksters' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_HOLIDAY_CARNIVAL_MASQUERADE.1', '1. Protect the carnival troupe from tricksters'), stance: 'defenders', goldReward: 50, repF1: 6 },
      { text: t('living.choice.EVT_HOLIDAY_CARNIVAL_MASQUERADE.2', '2. Join the masked tricksters in teasing the crowd'), stance: 'attackers', repF2: 6, xp: 50 },
      { text: t('living.choice.EVT_HOLIDAY_CARNIVAL_MASQUERADE.3', '3. Do not intervene in the masquerade turmoil'), stance: 'neutral' },
      { text: t('living.choice.EVT_HOLIDAY_CARNIVAL_MASQUERADE.4', '4. Perform a grand theatrical act to unite the crowd (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 40 }, repF1: 8, repF2: 8, xp: 100 },
    ],
  },
  {
    id: 'EVT_SCARY_NIGHT_HORROR',
    name: 'Scary Night Horror Incursion',
    category: 'HOLIDAY',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.ScaryHoliday],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.Graveyard],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Ghost, MOBILE_TYPES.Zombie, MOBILE_TYPES.SkeletalWarrior],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Town'} Night Watch`, f2: 'Horrors of the Dark' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_SCARY_NIGHT_HORROR.1', '1. Cleanse the street alongside the night watch'), stance: 'defenders', goldReward: 120, repF1: 8, xp: 130 },
      { text: t('living.choice.EVT_SCARY_NIGHT_HORROR.2', '2. Embrace the horror and attack the night watch'), stance: 'attackers', repF1: -10, xp: 100 },
      { text: t('living.choice.EVT_SCARY_NIGHT_HORROR.3', '3. Do not intervene in the nighttime incursion'), stance: 'neutral' },
      { text: t('living.choice.EVT_SCARY_NIGHT_HORROR.4', '4. Turn and banish the horrors with holy prayer (Restoration)'), stance: 'peace', skillCheck: { skill: SKILLS.Restoration, target: 45 }, repF1: 10, xp: 150 },
    ],
  },
  {
    id: 'EVT_HOLY_DAY_FANATICS',
    name: 'Holy Day Procession Attack',
    category: 'HOLIDAY',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.HolyHoliday],
    locationTypes: [LOCATION_TYPES.ReligionTemple, LOCATION_TYPES.TownCity],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Monk, MOBILE_TYPES.Healer],
    attackersPool: [MOBILE_TYPES.Barbarian, MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    getFactionNames: () => ({ f1: 'Holy Procession', f2: 'Heretical Agitators' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_HOLY_DAY_FANATICS.1', '1. Defend the holy procession from agitators'), stance: 'defenders', repF1: 8, repF2: -8, xp: 90 },
      { text: t('living.choice.EVT_HOLY_DAY_FANATICS.2', '2. Join the agitators against religious hypocrisy'), stance: 'attackers', repF1: -8, repF2: 8, xp: 70 },
      { text: t('living.choice.EVT_HOLY_DAY_FANATICS.3', '3. Do not intervene in the festival confrontation'), stance: 'neutral' },
      { text: t('living.choice.EVT_HOLY_DAY_FANATICS.4', '4. Lead a joint prayer of festival reconciliation (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 45 }, repF1: 6, repF2: 6, xp: 100 },
    ],
  },

  // ── 10. ARCANE ANOMALY (1) ──────────────────────────────────────────────────
  {
    id: 'EVT_MAD_WIZARD_RAMPAGE',
    name: 'Mad Wizard and Summoned Elementals',
    category: 'ARCANE',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.MadWizardNearby, REGION_FLAGS.MadWizardDies],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.DungeonRuin],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Battlemage, MOBILE_TYPES.Knight],
    attackersPool: [MOBILE_TYPES.Mage, MOBILE_TYPES.FireAtronach, MOBILE_TYPES.IronAtronach],
    getFactionNames: () => ({ f1: 'Mages Guild Responders', f2: 'Deranged Mage & Elementals' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_MAD_WIZARD_RAMPAGE.1', '1. Assist the battlemages in subduing the rampaging mage'), stance: 'defenders', goldReward: 180, repF1: 10, xp: 140 },
      { text: t('living.choice.EVT_MAD_WIZARD_RAMPAGE.2', '2. Unleash destruction alongside the rogue elementalist'), stance: 'attackers', repF1: -12, xp: 130 },
      { text: t('living.choice.EVT_MAD_WIZARD_RAMPAGE.3', '3. Do not intervene in the arcane rampage'), stance: 'neutral' },
      { text: t('living.choice.EVT_MAD_WIZARD_RAMPAGE.4', '4. Dispel the magical trance of madness (Thaumaturgy)'), stance: 'peace', skillCheck: { skill: SKILLS.Thaumaturgy, target: 50 }, repF1: 12, xp: 160 },
    ],
  },

  // ── 11. MUNDANE & EXPLORATION (3) ───────────────────────────────────────────
  {
    id: 'EVT_FARM_RUNAWAY_CATTLE',
    name: 'Enraged Beast on the Farmstead',
    category: 'MUNDANE',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.BadHarvest],
    locationTypes: [LOCATION_TYPES.HomeFarms, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet],
    baseDefenders: 2,
    baseAttackers: 1,
    defendersPool: [MOBILE_TYPES.Ranger, MOBILE_TYPES.Monk],
    attackersPool: [MOBILE_TYPES.Wereboar, MOBILE_TYPES.GrizzlyBear],
    getFactionNames: () => ({ f1: 'Distressed Homesteaders', f2: 'Rampaging Wild Beast' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_FARM_RUNAWAY_CATTLE.1', '1. Slay the enraged beast and protect the homestead'), stance: 'defenders', goldReward: 35, repF1: 5, xp: 70 },
      { text: t('living.choice.EVT_FARM_RUNAWAY_CATTLE.2', '2. Provoke the beast towards the greedy landlord manor'), stance: 'attackers', repF1: -6, xp: 50 },
      { text: t('living.choice.EVT_FARM_RUNAWAY_CATTLE.3', '3. Do not intervene in the farmstead trouble'), stance: 'neutral' },
      { text: t('living.choice.EVT_FARM_RUNAWAY_CATTLE.4', '4. Calm and tame the beast with food and gentleness (Stealth)'), stance: 'peace', skillCheck: { skill: SKILLS.Stealth, target: 40 }, repF1: 6, xp: 90 },
    ],
  },
  {
    id: 'EVT_GRAVEYARD_WEEPING_MOURNER',
    name: 'Robbery of Grieving Mourner at Grave',
    category: 'MUNDANE',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.MadWizardDies, REGION_FLAGS.WarLost],
    locationTypes: [LOCATION_TYPES.Graveyard, LOCATION_TYPES.TownHamlet],
    baseDefenders: 1,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Healer],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Rogue],
    getFactionNames: () => ({ f1: 'Grieving Widower', f2: 'Graveyard Grave-Robbers' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_GRAVEYARD_WEEPING_MOURNER.1', '1. Teach the grave robbers a lesson with steel'), stance: 'defenders', goldReward: 40, repF1: 6, xp: 70 },
      { text: t('living.choice.EVT_GRAVEYARD_WEEPING_MOURNER.2', '2. Help the grave robbers crack the crypt for loot'), stance: 'attackers', goldReward: 60, repF1: -8 },
      { text: t('living.choice.EVT_GRAVEYARD_WEEPING_MOURNER.3', '3. Do not intervene in the graveyard robbery'), stance: 'neutral' },
      { text: t('living.choice.EVT_GRAVEYARD_WEEPING_MOURNER.4', '4. Intimidate robbers to leave the mourner in peace (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 5, repF2: 4, xp: 80 },
    ],
  },
  {
    id: 'EVT_TAVERN_CHESS_WAGER',
    name: 'Tavern Chess Wager and War Dispute',
    category: 'MUNDANE',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.PricesLow, REGION_FLAGS.WarWon],
    locationTypes: [LOCATION_TYPES.Tavern],
    baseDefenders: 1,
    baseAttackers: 1,
    defendersPool: [MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Rogue],
    getFactionNames: () => ({ f1: 'Veteran Mercenary Captain', f2: 'Cunning Cartographer' }),
    getChoices: (f1, f2) => [
      { text: t('living.choice.EVT_TAVERN_CHESS_WAGER.1', '1. Advise the mercenary captain on the winning move'), stance: 'defenders', goldReward: 30, repF1: 4, xp: 40 },
      { text: t('living.choice.EVT_TAVERN_CHESS_WAGER.2', '2. Advise the cartographer on the winning strategy'), stance: 'attackers', goldReward: 30, repF2: 4, xp: 40 },
      { text: t('living.choice.EVT_TAVERN_CHESS_WAGER.3', '3. Do not intervene and enjoy your tavern ale'), stance: 'neutral', xp: 20 },
      { text: t('living.choice.EVT_TAVERN_CHESS_WAGER.4', '4. Propose a friendly stalemate and buy a pitcher of wine (20 gold)'), stance: 'peace', goldCost: 20, repF1: 5, repF2: 5, xp: 60 },
    ],
  },
]);

/**
 * Matches an encounter from the 39 matrix based on location, regional condition flags,
 * active Living Tamriel crises, and prosperity.
 *
 * @param {Object} params
 * @param {number} params.regionIndex
 * @param {number} params.locationType
 * @param {any} [params.dfLocation=null]
 * @param {any} [params.playerEntity=null]
 * @param {() => number} [params.rng=Math.random]
 * @returns {any | null} Matched event definition
 */
export function matchLivingCrisisEvent({
  regionIndex,
  locationType,
  dfLocation = null,
  playerEntity = null,
  rng = Math.random,
}) {
  const regState = getRegionState(regionIndex);
  const activeCrises = getActiveCrises(regionIndex);
  const condRecord = playerEntity?.regionConditions?.[regionIndex] ?? getBoundRegionConditions()?.[regionIndex];
  const condFlags = condRecord?.flags ?? [];

  const flagCandidates = [];
  const candidates = [];

  for (let i = 0; i < CRISIS_EVENTS.length; i++) {
    const evt = CRISIS_EVENTS[i];

    // 1. Location type filter
    if (evt.locationTypes.length > 0 && !evt.locationTypes.includes(locationType)) {
      continue;
    }

    // 2. Direct vanilla REGION_FLAGS match (prioritized so specific stages/flags spawn their own events)
    let matchesFlag = false;
    if (evt.regionFlags.length > 0) {
      for (const flagId of evt.regionFlags) {
        if (condFlags[flagId]) {
          matchesFlag = true;
          break;
        }
      }
    }
    if (matchesFlag) {
      flagCandidates.push(evt);
    }

    // 3. Macro crisis category fallback (WAR, PLAGUE, FAMINE, CIVIL_STRIFE)
    let matchesCrisis = matchesFlag;
    if (!matchesCrisis && evt.crisisTypes.length > 0) {
      for (const ct of evt.crisisTypes) {
        if (activeCrises.some((c) => c.type === ct)) {
          matchesCrisis = true;
          break;
        }
      }
    }

    // 4. Mundane category events (can appear anytime if no crisis is strict)
    if (evt.category === 'MUNDANE' && !matchesCrisis) {
      matchesCrisis = rng() < 0.35; // 35% chance to consider mundane encounters
    }

    if (matchesCrisis) {
      candidates.push(evt);
    }
  }

  const pool = flagCandidates.length > 0 ? flagCandidates : candidates;
  if (pool.length === 0) {
    // Fallback: interprovincial war or daylight crime if conditions are loose
    return CRISIS_EVENTS[0];
  }

  const pickIdx = Math.floor(rng() * pool.length);
  return pool[pickIdx];
}

/**
 * Resolves a roleplay encounter choice using the typed formula engine (`livingRolls.js`).
 * Produces 5 degrees of outcome: TRIUMPH, SUCCESS, PARTIAL, FAILURE, CRITICAL_FAILURE.
 * @param {any} playerEntity
 * @param {any} choice
 * @param {{ regionIndex?: number, rng?: () => number }} [opts]
 */
export function resolveCrisisChoiceCheck(
  playerEntity,
  choice,
  { regionIndex = 0, rng = Math.random } = {},
) {
  const baseGoldCost = Number(choice?.goldCost ?? 0);
  const effectiveGoldCost =
    baseGoldCost > 0
      ? Math.max(10, Math.round(baseGoldCost * computeRoleplayBribeMultiplier(playerEntity, SKILLS.Mercantile)))
      : 0;

  const playerGold = Number(playerEntity?.goldPieces ?? 0);
  if (effectiveGoldCost > 0 && playerGold < effectiveGoldCost) {
    return {
      hasSkillCheck: Boolean(choice?.skillCheck),
      degree: LIVING_ROLL_DEGREE.FAILURE,
      passed: false,
      peaceResolved: false,
      hostileToPlayer: false,
      goldShortage: true,
      xpAwarded: 0,
      repF1Delta: 0,
      repF2Delta: 0,
      goldCost: effectiveGoldCost,
      goldReward: 0,
      fatigueCost: 0,
      rollResult: null,
    };
  }

  if (!choice?.skillCheck) {
    return {
      hasSkillCheck: false,
      degree: LIVING_ROLL_DEGREE.SUCCESS,
      passed: true,
      peaceResolved: true,
      hostileToPlayer: false,
      xpAwarded: Number(choice?.xp ?? 0),
      repF1Delta: Number(choice?.repF1 ?? 0),
      repF2Delta: Number(choice?.repF2 ?? 0),
      goldCost: effectiveGoldCost,
      goldReward: Number(choice?.goldReward ?? 0),
      fatigueCost: 0,
      rollResult: null,
    };
  }

  const skillId = choice.skillCheck.skill;
  const target = Number(choice.skillCheck.target ?? 45);
  let formulaId = 'CRISIS_SPECIALIST';
  if (skillId === SKILLS.Etiquette) formulaId = 'SOCIAL_DIPLOMACY';
  else if (skillId === SKILLS.Streetwise) formulaId = 'STREETWISE_LEVERAGE';
  else if (skillId === SKILLS.Stealth) formulaId = 'STEALTH_INFILTRATION';

  // Normalize difficulty so target 45..55 maps cleanly into the formula's targetOffset
  const difficulty =
    formulaId === 'CRISIS_SPECIALIST'
      ? target
      : formulaId === 'STEALTH_INFILTRATION'
        ? Math.max(0, target - 45)
        : Math.max(20, target - 10);

  const rollRes = resolveLivingRoll({
    formulaId,
    playerEntity,
    skillId,
    difficulty,
    contextBonus: getPlayerRoleplayContextMod(playerEntity),
    regionIndex,
    fallbackSkill: 35,
    rng,
  });

  const baseXp = Number(choice?.xp ?? 100);
  const baseRep1 = Number(choice?.repF1 ?? 3);
  const baseRep2 = Number(choice?.repF2 ?? 0);
  const baseGoldReward = Number(choice?.goldReward ?? 0);

  if (rollRes.degree === LIVING_ROLL_DEGREE.TRIUMPH) {
    return {
      hasSkillCheck: true,
      degree: rollRes.degree,
      passed: true,
      peaceResolved: true,
      hostileToPlayer: false,
      xpAwarded: Math.round(baseXp * 1.5),
      repF1Delta: baseRep1 + 3,
      repF2Delta: baseRep2 > 0 ? baseRep2 + 3 : 2,
      goldCost: effectiveGoldCost,
      goldReward: baseGoldReward + 50,
      fatigueCost: 0,
      rollResult: rollRes,
    };
  }

  if (rollRes.degree === LIVING_ROLL_DEGREE.SUCCESS) {
    return {
      hasSkillCheck: true,
      degree: rollRes.degree,
      passed: true,
      peaceResolved: true,
      hostileToPlayer: false,
      xpAwarded: baseXp,
      repF1Delta: baseRep1,
      repF2Delta: baseRep2,
      goldCost: effectiveGoldCost,
      goldReward: baseGoldReward,
      fatigueCost: 0,
      rollResult: rollRes,
    };
  }

  if (rollRes.degree === LIVING_ROLL_DEGREE.PARTIAL) {
    return {
      hasSkillCheck: true,
      degree: rollRes.degree,
      passed: true,
      peaceResolved: true,
      hostileToPlayer: false,
      xpAwarded: Math.max(25, Math.round(baseXp * 0.5)),
      repF1Delta: Math.max(1, Math.trunc(baseRep1 / 2)),
      repF2Delta: Math.trunc(baseRep2 / 2),
      goldCost: effectiveGoldCost,
      goldReward: Math.round(baseGoldReward * 0.5),
      fatigueCost: 15,
      rollResult: rollRes,
    };
  }

  if (rollRes.degree === LIVING_ROLL_DEGREE.CRITICAL_FAILURE) {
    return {
      hasSkillCheck: true,
      degree: rollRes.degree,
      passed: false,
      peaceResolved: false,
      hostileToPlayer: true,
      xpAwarded: 0,
      repF1Delta: -2,
      repF2Delta: -2,
      goldCost: 0,
      goldReward: 0,
      fatigueCost: 0,
      rollResult: rollRes,
    };
  }

  // Standard FAILURE: sides ignore the player and continue clashing with each other
  return {
    hasSkillCheck: true,
    degree: rollRes.degree,
    passed: false,
    peaceResolved: false,
    hostileToPlayer: false,
    xpAwarded: 0,
    repF1Delta: 0,
    repF2Delta: 0,
    goldCost: 0,
    goldReward: 0,
    fatigueCost: 0,
    rollResult: rollRes,
  };
}
