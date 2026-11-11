// @ts-check
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
import { CRISIS_TYPE, CRISIS_PHASE, getRegionState, getActiveCrises } from './regionState.js';
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
      { text: t('living.choice.EVT_WAR_INTERPROVINCIAL.1', '1. Defend the settlement alongside [{f1}]', { f1 }), stance: 'defenders', repF1: 7, repF2: -10, goldReward: 200, xp: 100 },
      { text: t('living.choice.EVT_WAR_INTERPROVINCIAL.2', '2. Support the assault of [{f2}]', { f2 }), stance: 'attackers', repF1: -12, repF2: 7, bountyHostile: true, goldReward: 150 },
      { text: t('living.choice.EVT_WAR_INTERPROVINCIAL.3', '3. Martial diplomacy: Call for a truce (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 3, repF2: 3, xp: 150 },
      { text: t('living.choice.EVT_WAR_INTERPROVINCIAL.4', '4. Do not intervene (Watch the battle unfold)'), stance: 'neutral' },
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
      { text: t('living.choice.EVT_WAR_ORSINIUM_RAID.1', '1. Repel the orc raid alongside [{f1}]', { f1 }), stance: 'defenders', repF1: 8, repF2: -15, goldReward: 250, xp: 120 },
      { text: t('living.choice.EVT_WAR_ORSINIUM_RAID.2', '2. Invoke the orcish honor code (Orcish)'), stance: 'peace', skillCheck: { skill: SKILLS.Orcish, target: 40 }, repF1: 4, repF2: 10, xp: 150 },
      { text: t('living.choice.EVT_WAR_ORSINIUM_RAID.3', '3. Pay tribute to spare the settlement (150 gold)'), stance: 'bribe', goldCost: 150, repF1: 5, repF2: 5 },
      { text: t('living.choice.EVT_WAR_ORSINIUM_RAID.4', '4. Take cover'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WAR_PRISONER_EXECUTION',
    name: 'Prisoner of War Execution',
    category: 'WAR',
    crisisTypes: [CRISIS_TYPE.WAR],
    regionFlags: [REGION_FLAGS.WarOngoing, REGION_FLAGS.WarLost],
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
      { text: t('living.choice.EVT_WAR_PRISONER_EXECUTION.3', '3. Ransom the prisoners (100 gold)'), stance: 'ransom', goldCost: 100, repF1: 4, repF2: 6, xp: 80 },
      { text: t('living.choice.EVT_WAR_PRISONER_EXECUTION.4', '4. Pass by the tribunal'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WAR_DESERTERS_SHAKEDOWN',
    name: 'Deserters Shakedown',
    category: 'WAR',
    crisisTypes: [CRISIS_TYPE.WAR, CRISIS_TYPE.FAMINE],
    regionFlags: [REGION_FLAGS.WarEnding, REGION_FLAGS.WarLost, REGION_FLAGS.FamineBeginning],
    locationTypes: [LOCATION_TYPES.HomeFarms, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Ranger, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Barbarian, MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    getFactionNames: () => ({ f1: 'Local Millers & Farmers', f2: 'Armed Deserters' }),
    getChoices: () => [
      { text: t('living.choice.EVT_WAR_DESERTERS_SHAKEDOWN.1', '1. Defend the farmers and drive off the looters'), stance: 'defenders', repF1: 6, goldReward: 50, xp: 80 },
      { text: t('living.choice.EVT_WAR_DESERTERS_SHAKEDOWN.2', '2. Intimidate deserters with your reputation (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 5, xp: 100 },
      { text: t('living.choice.EVT_WAR_DESERTERS_SHAKEDOWN.3', '3. Hire the deserters into your band (120 gold)'), stance: 'hire', goldCost: 120, repF1: 4, xp: 60 },
      { text: t('living.choice.EVT_WAR_DESERTERS_SHAKEDOWN.4', '4. Do not intervene in peasant quarrels'), stance: 'neutral' },
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
    getChoices: (f1) => [
      { text: t('living.choice.EVT_WAR_RECRUITMENT_PRESSGANG.1', '1. Help the officer [{f1}] round up recruits', { f1 }), stance: 'defenders', repF1: 4, goldReward: 60 },
      { text: t('living.choice.EVT_WAR_RECRUITMENT_PRESSGANG.2', '2. Defend the townsfolk with steel against pressgang'), stance: 'attackers', repF1: -8, repF2: 8, bountyHostile: true },
      { text: t('living.choice.EVT_WAR_RECRUITMENT_PRESSGANG.3', '3. Pay an exemption fee for the recruits (80 gold)'), stance: 'pay_release', goldCost: 80, repF1: 2, repF2: 8, xp: 70 },
      { text: t('living.choice.EVT_WAR_RECRUITMENT_PRESSGANG.4', '4. Pass by'), stance: 'neutral' },
    ],
  },

  // ── 2. FAMINE & SCARCITY (5) ────────────────────────────────────────────────
  {
    id: 'EVT_FAMINE_BARN_RAID',
    name: 'Famine Bread Riot',
    category: 'FAMINE',
    crisisTypes: [CRISIS_TYPE.FAMINE],
    regionFlags: [REGION_FLAGS.FamineBeginning, REGION_FLAGS.FamineOngoing],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.HomeFarms],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief, MOBILE_TYPES.Warrior],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Granary'} Guards`, f2: 'Starving Mob' }),
    getChoices: () => [
      { text: t('living.choice.EVT_FAMINE_BARN_RAID.1', '1. Help the guard hold the granary by force'), stance: 'defenders', repF1: 5, repF2: -6, goldReward: 80 },
      { text: t('living.choice.EVT_FAMINE_BARN_RAID.2', '2. Help the starving break the lock and share grain'), stance: 'attackers', repF1: -8, repF2: 10, bountyHostile: true },
      { text: t('living.choice.EVT_FAMINE_BARN_RAID.3', '3. Buy grain for the poor from your purse (150 gold)'), stance: 'buy_grain', goldCost: 150, repF1: 6, repF2: 8, xp: 120 },
      { text: t('living.choice.EVT_FAMINE_BARN_RAID.4', '4. Bargain: Persuade manager to lower prices (Mercantile)'), stance: 'peace', skillCheck: { skill: SKILLS.Mercantile, target: 45 }, repF1: 4, repF2: 6, xp: 100 },
      { text: t('living.choice.EVT_FAMINE_BARN_RAID.5', '5. Pass by'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_FAMINE_PREDATOR_INVASION',
    name: 'Starving Predators Attack',
    category: 'FAMINE',
    crisisTypes: [CRISIS_TYPE.FAMINE],
    regionFlags: [REGION_FLAGS.FamineOngoing, REGION_FLAGS.FamineEnding],
    locationTypes: [LOCATION_TYPES.HomeFarms, LOCATION_TYPES.TownVillage, LOCATION_TYPES.TownHamlet],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Ranger, MOBILE_TYPES.Monk],
    attackersPool: [MOBILE_TYPES.GrizzlyBear, MOBILE_TYPES.SabertoothTiger, MOBILE_TYPES.Rat, MOBILE_TYPES.Wereboar],
    getFactionNames: () => ({ f1: 'Local Shepherds', f2: 'Famished Wild Beasts' }),
    getChoices: () => [
      { text: t('living.choice.EVT_FAMINE_PREDATOR_INVASION.1', '1. Slay the beasts with steel and save the flock'), stance: 'defenders', repF1: 6, goldReward: 40, xp: 90 },
      { text: t('living.choice.EVT_FAMINE_PREDATOR_INVASION.2', '2. Lure and distract beasts with food (2 rations)'), stance: 'feed_beasts', repF1: 4, xp: 60 },
      { text: t('living.choice.EVT_FAMINE_PREDATOR_INVASION.3', '3. Take shelter behind the fence'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_FAMINE_RELIEF_CARAVAN.1', '1. Defend the royal relief wagon from raiders'), stance: 'defenders', repF1: 8, repF2: -8, goldReward: 180, xp: 110 },
      { text: t('living.choice.EVT_FAMINE_RELIEF_CARAVAN.2', '2. Help the raiders seize the grain'), stance: 'attackers', repF1: -12, repF2: 8, goldReward: 120, bountyHostile: true },
      { text: t('living.choice.EVT_FAMINE_RELIEF_CARAVAN.3', '3. Pass by'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_FAMINE_SOUP_KITCHEN_SPOILAGE.1', '1. Pacify the vagrants and support the monks'), stance: 'defenders', repF1: 4, repF2: -4, xp: 40 },
      { text: t('living.choice.EVT_FAMINE_SOUP_KITCHEN_SPOILAGE.2', '2. Denounce the monastery for callous greed'), stance: 'attackers', repF1: -6, repF2: 6 },
      { text: t('living.choice.EVT_FAMINE_SOUP_KITCHEN_SPOILAGE.3', '3. Purify the cauldron with healing magic (Restoration)'), stance: 'purify', skillCheck: { skill: SKILLS.Restoration, target: 40 }, repF1: 8, repF2: 8, xp: 120 },
      { text: t('living.choice.EVT_FAMINE_SOUP_KITCHEN_SPOILAGE.4', '4. Donate fresh rations (3 portions)'), stance: 'donate_rations', repF1: 6, repF2: 6, xp: 80 },
      { text: t('living.choice.EVT_FAMINE_SOUP_KITCHEN_SPOILAGE.5', '5. Pass by'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_FAMINE_RATION_SCAM.1', '1. Force the speculator to refund coin with steel'), stance: 'defenders', repF1: 5, repF2: -8, goldReward: 50 },
      { text: t('living.choice.EVT_FAMINE_RATION_SCAM.2', '2. Demand the merchant guild trade license (Mercantile)'), stance: 'peace', skillCheck: { skill: SKILLS.Mercantile, target: 45 }, repF1: 6, xp: 80 },
      { text: t('living.choice.EVT_FAMINE_RATION_SCAM.3', '3. Take a kickback and shoo the beggars (100 gold)'), stance: 'bribe', goldReward: 100, repF1: -6 },
      { text: t('living.choice.EVT_FAMINE_RATION_SCAM.4', '4. Pass by'), stance: 'neutral' },
    ],
  },

  // ── 3. PLAGUE & CONTAGION (4) ───────────────────────────────────────────────
  {
    id: 'EVT_PLAGUE_QUARANTINE_CLASH',
    name: 'Quarantine Breach at Gate',
    category: 'PLAGUE',
    crisisTypes: [CRISIS_TYPE.PLAGUE],
    regionFlags: [REGION_FLAGS.PlagueBeginning, REGION_FLAGS.PlagueOngoing],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Knight],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Barbarian, MOBILE_TYPES.Warrior],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Town'} Cordons`, f2: 'Infected Refugees' }),
    getChoices: () => [
      { text: t('living.choice.EVT_PLAGUE_QUARANTINE_CLASH.1', '1. Hold the crowd back with quarantine guards'), stance: 'defenders', repF1: 6, repF2: -8, goldReward: 100 },
      { text: t('living.choice.EVT_PLAGUE_QUARANTINE_CLASH.2', '2. Breach the gates for refugees by force'), stance: 'attackers', repF1: -10, repF2: 8, bountyHostile: true },
      { text: t('living.choice.EVT_PLAGUE_QUARANTINE_CLASH.3', '3. Heal the afflicted at the gate with prayer (Restoration)'), stance: 'cure', skillCheck: { skill: SKILLS.Restoration, target: 45 }, repF1: 10, repF2: 10, xp: 150 },
      { text: t('living.choice.EVT_PLAGUE_QUARANTINE_CLASH.4', '4. Bypass the checkpoint cordon'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_PLAGUE_PYRE_DESECRATION.1', '1. Exterminate the risen dead with silver and steel'), stance: 'defenders', repF1: 8, xp: 120 },
      { text: t('living.choice.EVT_PLAGUE_PYRE_DESECRATION.2', '2. Consecrate the funeral pyre (Restoration)'), stance: 'consecrate', skillCheck: { skill: SKILLS.Restoration, target: 40 }, repF1: 10, xp: 140 },
      { text: t('living.choice.EVT_PLAGUE_PYRE_DESECRATION.3', '3. Flee from the diseased ashes'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_PLAGUE_WATER_WELL_SCARE.1', '1. Calm the crowd with authoritative words (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 50 }, repF1: 6, xp: 100 },
      { text: t('living.choice.EVT_PLAGUE_WATER_WELL_SCARE.2', '2. Test the well water for contamination (Medical)'), stance: 'test_water', skillCheck: { skill: SKILLS.Medical, target: 40 }, repF1: 8, xp: 110 },
      { text: t('living.choice.EVT_PLAGUE_WATER_WELL_SCARE.3', '3. Disperse the panicked crowd with force'), stance: 'defenders', repF1: 4, repF2: -6 },
      { text: t('living.choice.EVT_PLAGUE_WATER_WELL_SCARE.4', '4. Pass by'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_PLAGUE_QUACK_MIRACLE_CURE',
    name: 'Quack Healer with Fake Cure',
    category: 'PLAGUE',
    crisisTypes: [CRISIS_TYPE.PLAGUE],
    regionFlags: [REGION_FLAGS.PlagueOngoing, REGION_FLAGS.PricesHigh],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Spellsword],
    getFactionNames: () => ({ f1: 'Deceived Sick Townsfolk', f2: 'Quack Alchemist & Bodyguards' }),
    getChoices: () => [
      { text: t('living.choice.EVT_PLAGUE_QUACK_MIRACLE_CURE.1', '1. Expose the fraud publicly (Medical)'), stance: 'expose', skillCheck: { skill: SKILLS.Medical, target: 45 }, repF1: 8, repF2: -10, xp: 120 },
      { text: t('living.choice.EVT_PLAGUE_QUACK_MIRACLE_CURE.2', '2. Shake down the quack for his counterfeit profits'), stance: 'defenders', repF1: 6, goldReward: 80 },
      { text: t('living.choice.EVT_PLAGUE_QUACK_MIRACLE_CURE.3', '3. Buy the "miracle cure" for 100 gold'), stance: 'buy_fake', goldCost: 100 },
      { text: t('living.choice.EVT_PLAGUE_QUACK_MIRACLE_CURE.4', '4. Pass by'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_WITCH_HUNT_SIEGE.1', '1. Join the inquisition and purge the coven'), stance: 'defenders', repF1: 8, repF2: -15, goldReward: 150 },
      { text: t('living.choice.EVT_WITCH_HUNT_SIEGE.2', '2. Shield the witches from the pyre'), stance: 'attackers', repF1: -15, repF2: 12, goldReward: 100 },
      { text: t('living.choice.EVT_WITCH_HUNT_SIEGE.3', '3. Arcane diplomacy: Dissuade the inquisitor (Mysticism / Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 55 }, repF1: 4, repF2: 4, xp: 130 },
      { text: t('living.choice.EVT_WITCH_HUNT_SIEGE.4', '4. Slip away into the shadows'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WITCH_ENTHRALLED_AMBUSH',
    name: 'Enthralled Coven Guards Ambush',
    category: 'OCCULT',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.WitchBurnings, REGION_FLAGS.ScaryHoliday],
    locationTypes: [LOCATION_TYPES.TownHamlet, LOCATION_TYPES.HomeFarms, LOCATION_TYPES.Coven],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Ranger],
    attackersPool: [MOBILE_TYPES.Spellsword, MOBILE_TYPES.Nightblade],
    getFactionNames: () => ({ f1: 'Bewitched Rangers', f2: 'Travelling Wayfarers' }),
    getChoices: () => [
      { text: t('living.choice.EVT_WITCH_ENTHRALLED_AMBUSH.1', '1. Stand and fight the enthralled sentries'), stance: 'defenders', goldReward: 40, xp: 80 },
      { text: t('living.choice.EVT_WITCH_ENTHRALLED_AMBUSH.2', '2. Dispel the witchcraft illusion (Thaumaturgy)'), stance: 'dispel', skillCheck: { skill: SKILLS.Thaumaturgy, target: 40 }, xp: 120, repF1: 6 },
      { text: t('living.choice.EVT_WITCH_ENTHRALLED_AMBUSH.3', '3. Retreat out of the thralls sight'), stance: 'stealth', skillCheck: { skill: SKILLS.Stealth, target: 45 }, xp: 90 },
      { text: t('living.choice.EVT_WITCH_ENTHRALLED_AMBUSH.4', '4. Flee the ambush'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_WITCH_HERBALIST_SHAKEDOWN.1', '1. Defend the apothecary against zealous hunters'), stance: 'attackers', repF1: -8, repF2: 8, goldReward: 50 },
      { text: t('living.choice.EVT_WITCH_HERBALIST_SHAKEDOWN.2', '2. Assist inquisitors in searching the apothecary'), stance: 'peace', skillCheck: { skill: SKILLS.Medical, target: 40 }, repF1: 4, repF2: 6, xp: 100 },
      { text: t('living.choice.EVT_WITCH_HERBALIST_SHAKEDOWN.3', '3. Verify apothecary herbs are non-toxic (Medical)'), stance: 'defenders', repF1: 5, repF2: -8 },
      { text: t('living.choice.EVT_WITCH_HERBALIST_SHAKEDOWN.4', '4. Pass by'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WITCH_DAEDRA_PACT_SIGHTING',
    name: 'Secret Night Daedra Summoning',
    category: 'OCCULT',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.WitchBurnings, REGION_FLAGS.ScaryHoliday],
    locationTypes: [LOCATION_TYPES.Graveyard, LOCATION_TYPES.DungeonRuin, LOCATION_TYPES.Coven],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Mage, MOBILE_TYPES.Sorcerer],
    attackersPool: [MOBILE_TYPES.FireDaedra, MOBILE_TYPES.Imp],
    getFactionNames: () => ({ f1: 'Occult Summoners', f2: 'Unbound Daedra' }),
    getChoices: () => [
      { text: t('living.choice.EVT_WITCH_DAEDRA_PACT_SIGHTING.1', '1. Disrupt the dark ritual with drawn steel'), stance: 'attackers', repF1: 8, xp: 150 },
      { text: t('living.choice.EVT_WITCH_DAEDRA_PACT_SIGHTING.2', '2. Banish the summoned Daedra with holy light (Restoration)'), stance: 'daedric', skillCheck: { skill: SKILLS.Daedric, target: 40 }, xp: 140 },
      { text: t('living.choice.EVT_WITCH_DAEDRA_PACT_SIGHTING.3', '3. Study the arcane ritual in secret (Mysticism)'), stance: 'neutral' },
    ],
  },

  // ── 5. CRIME WAVE & UNDERWORLD (4) ──────────────────────────────────────────
  {
    id: 'EVT_CRIME_DAYLIGHT_HEIST',
    name: 'Daylight Moneylender Heist',
    category: 'CRIME',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.CrimeWave],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Burglar, MOBILE_TYPES.Rogue],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Town'} Watch`, f2: 'Thieves Guild Heist Crew' }),
    getChoices: () => [
      { text: t('living.choice.EVT_CRIME_DAYLIGHT_HEIST.1', '1. Intercept the burglars and return the loot'), stance: 'defenders', repF1: 6, repF2: -8, goldReward: 120 },
      { text: t('living.choice.EVT_CRIME_DAYLIGHT_HEIST.2', '2. Cover the thieves retreat from the city watch'), stance: 'attackers', repF1: -8, repF2: 8, goldReward: 100, bountyHostile: true },
      { text: t('living.choice.EVT_CRIME_DAYLIGHT_HEIST.3', '3. Demand a cut to look the other way (120 gold)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 50 }, repF2: 6, goldReward: 80, xp: 80 },
      { text: t('living.choice.EVT_CRIME_DAYLIGHT_HEIST.4', '4. Pretend to notice nothing'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_CRIME_BROTHERHOOD_CONTRACT',
    name: 'Dark Brotherhood Street Contract',
    category: 'CRIME',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.CrimeWave],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.Tavern],
    baseDefenders: 2,
    baseAttackers: 1,
    defendersPool: [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Assassin, MOBILE_TYPES.Nightblade],
    getFactionNames: () => ({ f1: 'Target Noble & Guard', f2: 'Brotherhood Assassin' }),
    getChoices: () => [
      { text: t('living.choice.EVT_CRIME_BROTHERHOOD_CONTRACT.1', '1. Shield the marked target from the assassin'), stance: 'defenders', repF1: 8, repF2: -15, goldReward: 200 },
      { text: t('living.choice.EVT_CRIME_BROTHERHOOD_CONTRACT.2', '2. Assist the Dark Brotherhood assassin in the hit'), stance: 'attackers', repF1: -15, repF2: 10, bountyHostile: true },
      { text: t('living.choice.EVT_CRIME_BROTHERHOOD_CONTRACT.3', '3. Flash the underworld token of silence (Streetwise)'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_CRIME_PICKPOCKET_CHASE',
    name: 'Bazaar Pickpocket Chase',
    category: 'CRIME',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.CrimeWave, REGION_FLAGS.PricesHigh],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 1,
    baseAttackers: 1,
    defendersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Knight_CityWatch],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Burglar],
    getFactionNames: () => ({ f1: 'Robbed Merchant', f2: 'Fleeing Pickpocket' }),
    getChoices: () => [
      { text: t('living.choice.EVT_CRIME_PICKPOCKET_CHASE.1', '1. Tackle the fleeing cutpurse to the ground'), stance: 'defenders', repF1: 4, goldReward: 25 },
      { text: t('living.choice.EVT_CRIME_PICKPOCKET_CHASE.2', '2. Trip the pursuing merchant and let the thief flee'), stance: 'attackers', repF1: -4, repF2: 6 },
      { text: t('living.choice.EVT_CRIME_PICKPOCKET_CHASE.3', '3. Shrewd mediation: Buy the stolen purse (25 gold)'), stance: 'pay_theft', goldCost: 20, repF1: 4, repF2: 4, xp: 50 },
      { text: t('living.choice.EVT_CRIME_PICKPOCKET_CHASE.4', '4. Stand aside in the bazaar crowd'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_CRIME_GAMBLING_DEN_BUST',
    name: 'Watch Raid on Gambling Den',
    category: 'CRIME',
    crisisTypes: [CRISIS_TYPE.CIVIL_STRIFE],
    regionFlags: [REGION_FLAGS.CrimeWave],
    locationTypes: [LOCATION_TYPES.Tavern, LOCATION_TYPES.TownCity],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Knight_CityWatch, MOBILE_TYPES.Knight],
    attackersPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Thief, MOBILE_TYPES.Warrior],
    getFactionNames: (reg) => ({ f1: `${REGION_NAMES[reg] ?? 'Watch'} Sergeants`, f2: 'Den Gamblers & Bouncers' }),
    getChoices: () => [
      { text: t('living.choice.EVT_CRIME_GAMBLING_DEN_BUST.1', '1. Assist the watch in raiding the illicit den'), stance: 'defenders', repF1: 6, repF2: -6, goldReward: 80 },
      { text: t('living.choice.EVT_CRIME_GAMBLING_DEN_BUST.2', '2. Defend the gamblers and hold the door for escape'), stance: 'attackers', repF1: -6, repF2: 8 },
      { text: t('living.choice.EVT_CRIME_GAMBLING_DEN_BUST.3', '3. Bribe the sergeant to overlook the cellar (100 gold)'), stance: 'bribe', goldCost: 70, repF2: 6, xp: 60 },
      { text: t('living.choice.EVT_CRIME_GAMBLING_DEN_BUST.4', '4. Slip out through the back door'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_TEMPLE_PURGE_SIEGE.1', '1. Join the temple crusade and storm the shrine'), stance: 'defenders', repF1: 10, repF2: -12, xp: 120 },
      { text: t('living.choice.EVT_TEMPLE_PURGE_SIEGE.2', '2. Protect the secret shrine and its devotees'), stance: 'attackers', repF1: -12, repF2: 8, goldReward: 100 },
      { text: t('living.choice.EVT_TEMPLE_PURGE_SIEGE.3', '3. Ancient sanctuary right: Invoke immunity (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 6, repF2: 6, xp: 140 },
      { text: t('living.choice.EVT_TEMPLE_PURGE_SIEGE.4', '4. Do not anger the gods, depart'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_TEMPLE_CLERGY_STANDOFF.1', '1. Defend the orthodox keepers of the relic'), stance: 'defenders', repF1: 6, repF2: -6, xp: 70 },
      { text: t('living.choice.EVT_TEMPLE_CLERGY_STANDOFF.2', '2. Support the reformist schismatics'), stance: 'attackers', repF1: -6, repF2: 6, xp: 70 },
      { text: t('living.choice.EVT_TEMPLE_CLERGY_STANDOFF.3', '3. Resolve dispute by scripture (Streetwise / Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 45 }, repF1: 4, repF2: 4, xp: 90 },
      { text: t('living.choice.EVT_TEMPLE_CLERGY_STANDOFF.4', '4. Pass by'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_TEMPLE_HERETIC_GRAFFITI.1', '1. Cut down the desecrators on the temple steps'), stance: 'defenders', repF1: 6, repF2: -6, goldReward: 50 },
      { text: t('living.choice.EVT_TEMPLE_HERETIC_GRAFFITI.2', '2. Subdue the vandals alive for ecclesiastical court'), stance: 'arrest', repF1: 8, xp: 80 },
      { text: t('living.choice.EVT_TEMPLE_HERETIC_GRAFFITI.3', '3. Help scrub the blasphemous slogans from the walls'), stance: 'cleanse', repF1: 5, xp: 60 },
      { text: t('living.choice.EVT_TEMPLE_HERETIC_GRAFFITI.4', '4. Pass by'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_TEMPLE_ALMS_DISPUTE.1', '1. Break up the brawl with a commanding shout (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 40 }, repF1: 4, repF2: 4, xp: 50 },
      { text: t('living.choice.EVT_TEMPLE_ALMS_DISPUTE.2', '2. Scatter a handful of gold into the crowd (15 gold)'), stance: 'scatter_gold', goldCost: 15, repF1: 6, repF2: 6, xp: 60 },
      { text: t('living.choice.EVT_TEMPLE_ALMS_DISPUTE.3', '3. Summon the temple beadle with rods'), stance: 'defenders', repF1: 3, repF2: -4 },
      { text: t('living.choice.EVT_TEMPLE_ALMS_DISPUTE.4', '4. Pass by'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_NEW_RULER_CORONATION.1', '1. Shield the new ruler from conspirators'), stance: 'defenders', repF1: 12, repF2: -15, goldReward: 250, xp: 150 },
      { text: t('living.choice.EVT_NEW_RULER_CORONATION.2', '2. Support the rebels and topple the usurper'), stance: 'attackers', repF1: -15, repF2: 12, bountyHostile: true },
      { text: t('living.choice.EVT_NEW_RULER_CORONATION.3', '3. Interpose your shield to guard the lord'), stance: 'bodyguard', repF1: 15, goldReward: 300, xp: 200 },
      { text: t('living.choice.EVT_NEW_RULER_CORONATION.4', '4. Blend into the cheering crowd'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_NEW_RULER_STATUE_UNVEILING.1', '1. Help the guard push vandals away from the plinth'), stance: 'defenders', repF1: 6, repF2: -6, goldReward: 80 },
      { text: t('living.choice.EVT_NEW_RULER_STATUE_UNVEILING.2', '2. Pull on the ropes to help the mob topple the monument'), stance: 'attackers', repF1: -8, repF2: 8 },
      { text: t('living.choice.EVT_NEW_RULER_STATUE_UNVEILING.3', '3. Speech on preserving historical memory (Etiquette)'), stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 5, repF2: 5, xp: 100 },
      { text: t('living.choice.EVT_NEW_RULER_STATUE_UNVEILING.4', '4. Watch from the sidelines'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_NEW_RULER_OATH_CEREMONY.1', '1. Uphold the feudal oath of fealty to the crown'), stance: 'defenders', repF1: 8, repF2: -10, goldReward: 120 },
      { text: t('living.choice.EVT_NEW_RULER_OATH_CEREMONY.2', '2. Defend the barons charter of independence'), stance: 'attackers', repF1: -10, repF2: 8 },
      { text: t('living.choice.EVT_NEW_RULER_OATH_CEREMONY.3', '3. Champions duel for honor of the sides (1 on 1)'), stance: 'duel', repF1: 6, repF2: 6, xp: 150 },
      { text: t('living.choice.EVT_NEW_RULER_OATH_CEREMONY.4', '4. Pass by'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_PRICES_TAX_REVOLT.1', '1. Help the tax bailiffs collect arrears by force'), stance: 'defenders', repF1: 6, repF2: -8, goldReward: 100 },
      { text: t('living.choice.EVT_PRICES_TAX_REVOLT.2', '2. Stand alongside the merchants guild'), stance: 'attackers', repF1: -8, repF2: 8, bountyHostile: true },
      { text: t('living.choice.EVT_PRICES_TAX_REVOLT.3', '3. Audit tax ledgers: Point out calculation error (Mercantile)'), stance: 'peace', skillCheck: { skill: SKILLS.Mercantile, target: 50 }, repF1: 5, repF2: 8, xp: 120 },
      { text: t('living.choice.EVT_PRICES_TAX_REVOLT.4', '4. Keep your nose out of other purses'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_PRICES_PRICE_GOUGING_INSPECTION.1', '1. Defend the magistrate from violent thugs'), stance: 'defenders', repF1: 6, repF2: -6, goldReward: 90 },
      { text: t('living.choice.EVT_PRICES_PRICE_GOUGING_INSPECTION.2', '2. Accept the moneylenders hush money (150 gold)'), stance: 'bribe', goldReward: 150, repF1: -8 },
      { text: t('living.choice.EVT_PRICES_PRICE_GOUGING_INSPECTION.3', '3. Threaten with merchant court tribunal (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 5, xp: 80 },
      { text: t('living.choice.EVT_PRICES_PRICE_GOUGING_INSPECTION.4', '4. Pass by'), stance: 'neutral' },
    ],
  },

  // ── 9. HOLIDAYS & FESTIVITIES (4) ───────────────────────────────────────────
  {
    id: 'EVT_HOLIDAY_TOWN_BRAWL',
    name: 'Holiday Tavern Brawl',
    category: 'HOLIDAY',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.HappyHoliday],
    locationTypes: [LOCATION_TYPES.Tavern, LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Rogue],
    attackersPool: [MOBILE_TYPES.Barbarian, MOBILE_TYPES.Rogue],
    getFactionNames: () => ({ f1: 'Tavern Keep & Bouncers', f2: 'Rowdy Holidaymakers' }),
    getChoices: () => [
      { text: t('living.choice.EVT_HOLIDAY_TOWN_BRAWL.1', '1. Restore order with bare fists (Unarmed)'), stance: 'defenders', repF1: 5, goldReward: 40, xp: 60 },
      { text: t('living.choice.EVT_HOLIDAY_TOWN_BRAWL.2', '2. Join the merry tavern brawl'), stance: 'brawl', repF2: 5, xp: 50 },
      { text: t('living.choice.EVT_HOLIDAY_TOWN_BRAWL.3', '3. Buy a cask of spiced ale for the tavern (30 gold)'), stance: 'buy_drinks', goldCost: 30, repF1: 6, repF2: 6, xp: 70 },
      { text: t('living.choice.EVT_HOLIDAY_TOWN_BRAWL.4', '4. Sip your ale in the corner'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_HOLIDAY_CARNIVAL_MASQUERADE',
    name: 'Carnival Masquerade Turmoil',
    category: 'HOLIDAY',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.HappyHoliday],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage],
    baseDefenders: 2,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Bard, MOBILE_TYPES.Acrobat],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Burglar],
    getFactionNames: () => ({ f1: 'Carnival Troupe', f2: 'Masked Tricksters' }),
    getChoices: () => [
      { text: t('living.choice.EVT_HOLIDAY_CARNIVAL_MASQUERADE.1', '1. Catch the costumed cutpurses red-handed'), stance: 'defenders', repF1: 6, goldReward: 50 },
      { text: t('living.choice.EVT_HOLIDAY_CARNIVAL_MASQUERADE.2', '2. Play an impromptu role in the pageant (Personality)'), stance: 'performance', skillCheck: { skill: SKILLS.Etiquette, target: 40 }, repF1: 8, xp: 100 },
      { text: t('living.choice.EVT_HOLIDAY_CARNIVAL_MASQUERADE.3', '3. Applaud from the spectators'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_SCARY_NIGHT_HORROR.1', '1. Cleanse the street with holy fire and steel'), stance: 'defenders', repF1: 8, goldReward: 120, xp: 130 },
      { text: t('living.choice.EVT_SCARY_NIGHT_HORROR.2', '2. Recite the turning prayer of Arkay (Restoration)'), stance: 'turn_undead', skillCheck: { skill: SKILLS.Restoration, target: 45 }, repF1: 10, xp: 150 },
      { text: t('living.choice.EVT_SCARY_NIGHT_HORROR.3', '3. Run toward the lighted torches of the watchtower'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_HOLY_DAY_FANATICS.1', '1. Defend the devout procession from heretic clubs'), stance: 'defenders', repF1: 8, repF2: -8, xp: 90 },
      { text: t('living.choice.EVT_HOLY_DAY_FANATICS.2', '2. Disperse both factions to avoid bloodshed (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 4, repF2: 4, xp: 100 },
      { text: t('living.choice.EVT_HOLY_DAY_FANATICS.3', '3. Join the solemn prayer procession'), stance: 'pray', repF1: 6, xp: 60 },
      { text: t('living.choice.EVT_HOLY_DAY_FANATICS.4', '4. Pass by'), stance: 'neutral' },
    ],
  },

  // ── 10. ARCANE ANOMALY (1) ──────────────────────────────────────────────────
  {
    id: 'EVT_MAD_WIZARD_RAMPAGE',
    name: 'Mad Wizard and Summoned Elementals',
    category: 'ARCANE',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.MadWizardNearby],
    locationTypes: [LOCATION_TYPES.TownCity, LOCATION_TYPES.TownVillage, LOCATION_TYPES.DungeonRuin],
    baseDefenders: 2,
    baseAttackers: 3,
    defendersPool: [MOBILE_TYPES.Battlemage, MOBILE_TYPES.Knight],
    attackersPool: [MOBILE_TYPES.Mage, MOBILE_TYPES.FireAtronach, MOBILE_TYPES.IronAtronach],
    getFactionNames: () => ({ f1: 'Mages Guild Responders', f2: 'Deranged Mage & Elementals' }),
    getChoices: () => [
      { text: t('living.choice.EVT_MAD_WIZARD_RAMPAGE.1', '1. Strike the madman down with arrow or counter-spell'), stance: 'defenders', repF1: 10, goldReward: 180, xp: 140 },
      { text: t('living.choice.EVT_MAD_WIZARD_RAMPAGE.2', '2. Dispel the magical trance of madness (Thaumaturgy)'), stance: 'dispel', skillCheck: { skill: SKILLS.Thaumaturgy, target: 50 }, repF1: 12, xp: 160 },
      { text: t('living.choice.EVT_MAD_WIZARD_RAMPAGE.3', '3. Dive for cover from stray fireballs'), stance: 'neutral' },
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
    getChoices: () => [
      { text: t('living.choice.EVT_FARM_RUNAWAY_CATTLE.1', '1. Slay the enraged beast and protect the homestead'), stance: 'defenders', repF1: 5, goldReward: 35, xp: 70 },
      { text: t('living.choice.EVT_FARM_RUNAWAY_CATTLE.2', '2. Calm the animal with soothing gestures and feed (Stealth)'), stance: 'tame', skillCheck: { skill: SKILLS.Stealth, target: 40 }, repF1: 6, xp: 90 },
      { text: t('living.choice.EVT_FARM_RUNAWAY_CATTLE.3', '3. Leap onto the barn roof'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_GRAVEYARD_WEEPING_MOURNER',
    name: 'Robbery of Grieving Mourner at Grave',
    category: 'MUNDANE',
    crisisTypes: [],
    regionFlags: [],
    locationTypes: [LOCATION_TYPES.Graveyard, LOCATION_TYPES.TownHamlet],
    baseDefenders: 1,
    baseAttackers: 2,
    defendersPool: [MOBILE_TYPES.Healer],
    attackersPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Rogue],
    getFactionNames: () => ({ f1: 'Grieving Widower', f2: 'Graveyard Grave-Robbers' }),
    getChoices: () => [
      { text: t('living.choice.EVT_GRAVEYARD_WEEPING_MOURNER.1', '1. Teach the grave robbers a lesson with steel'), stance: 'defenders', repF1: 6, goldReward: 40, xp: 70 },
      { text: t('living.choice.EVT_GRAVEYARD_WEEPING_MOURNER.2', '2. Intimidate robbers with your reputation (Streetwise)'), stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 5, xp: 80 },
      { text: t('living.choice.EVT_GRAVEYARD_WEEPING_MOURNER.3', '3. Walk past stranger grief'), stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_TAVERN_CHESS_WAGER',
    name: 'Tavern Chess Wager and War Dispute',
    category: 'MUNDANE',
    crisisTypes: [],
    regionFlags: [REGION_FLAGS.PricesLow],
    locationTypes: [LOCATION_TYPES.Tavern],
    baseDefenders: 1,
    baseAttackers: 1,
    defendersPool: [MOBILE_TYPES.Warrior],
    attackersPool: [MOBILE_TYPES.Rogue],
    getFactionNames: () => ({ f1: 'Veteran Mercenary Captain', f2: 'Cunning Cartographer' }),
    getChoices: () => [
      { text: t('living.choice.EVT_TAVERN_CHESS_WAGER.1', '1. Resolve the game with a brilliant checkmate (Etiquette)'), stance: 'chess_move', skillCheck: { skill: SKILLS.Etiquette, target: 45 }, xp: 100 },
      { text: t('living.choice.EVT_TAVERN_CHESS_WAGER.2', '2. Place a wager on the cartographer (30 gold)'), stance: 'wager', goldCost: 30, goldReward: 60 },
      { text: t('living.choice.EVT_TAVERN_CHESS_WAGER.3', '3. Order an ale and listen to tall tales'), stance: 'neutral', xp: 20 },
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
  const condRecord = playerEntity?.regionConditions?.[regionIndex];
  const condFlags = condRecord?.flags ?? [];

  const candidates = [];

  for (let i = 0; i < CRISIS_EVENTS.length; i++) {
    const evt = CRISIS_EVENTS[i];

    // 1. Location type filter
    if (evt.locationTypes.length > 0 && !evt.locationTypes.includes(locationType)) {
      continue;
    }

    // 2. Crisis / Flag conditions check
    let matchesCrisis = false;

    // Check dynamic crisis (WAR, PLAGUE, FAMINE, CIVIL_STRIFE)
    if (evt.crisisTypes.length > 0) {
      for (const ct of evt.crisisTypes) {
        if (activeCrises.some((c) => c.type === ct)) {
          matchesCrisis = true;
          break;
        }
      }
    }

    // Check vanilla 29 region condition flags (WarBeginning, PlagueOngoing, CrimeWave, etc.)
    if (!matchesCrisis && evt.regionFlags.length > 0) {
      for (const flagId of evt.regionFlags) {
        if (condFlags[flagId]) {
          matchesCrisis = true;
          break;
        }
      }
    }

    // Check mundane category events (can appear anytime if no crisis is strict)
    if (evt.category === 'MUNDANE' && !matchesCrisis) {
      matchesCrisis = rng() < 0.35; // 35% chance to consider mundane encounters
    }

    if (matchesCrisis) {
      candidates.push(evt);
    }
  }

  if (candidates.length === 0) {
    // Fallback: interprovincial war or daylight crime if conditions are loose
    return CRISIS_EVENTS[0];
  }

  const pickIdx = Math.floor(rng() * candidates.length);
  return candidates[pickIdx];
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
