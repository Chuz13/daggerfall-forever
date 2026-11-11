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
    name: 'Межпровинциальный штурм / стычка',
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
      { text: `1. Защитить город плечом к плечу с [${f1}]`, stance: 'defenders', repF1: 7, repF2: -10, goldReward: 200, xp: 100 },
      { text: `2. Поддержать штурм авангарда [${f2}]`, stance: 'attackers', repF1: -12, repF2: 7, bountyHostile: true, goldReward: 150 },
      { text: `3. Военная дипломатия: Призвать к перемирию (Этикет)`, stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 3, repF2: 3, xp: 150 },
      { text: '4. Не вмешиваться (Наблюдать за исходом боя)', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WAR_ORSINIUM_RAID',
    name: 'Орочий набег Орсиниума',
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
      { text: `1. Отразить набег орков вместе с [${f1}]`, stance: 'defenders', repF1: 8, repF2: -15, goldReward: 250, xp: 120 },
      { text: `2. Взвать к орочьему кодексу чести (Орочий язык)`, stance: 'peace', skillCheck: { skill: SKILLS.Orcish, target: 40 }, repF1: 4, repF2: 10, xp: 150 },
      { text: '3. Откупиться данью за поселение (150 золотых)', stance: 'bribe', goldCost: 150, repF1: 5, repF2: 5 },
      { text: '4. Скрыться в укрытии', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WAR_PRISONER_EXECUTION',
    name: 'Полевой суд / Казнь военнопленных',
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
      { text: `1. Одобрить приговор и помочь страже [${f1}]`, stance: 'defenders', repF1: 5, repF2: -8, xp: 50 },
      { text: `2. Отбить пленных силой за [${f2}]`, stance: 'attackers', repF1: -10, repF2: 10, bountyHostile: true },
      { text: '3. Выкупить жизнь пленников (100 золотых)', stance: 'ransom', goldCost: 100, repF1: 4, repF2: 6, xp: 80 },
      { text: '4. Пройти мимо чужого суда', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WAR_DESERTERS_SHAKEDOWN',
    name: 'Дезертиры вымогают зерно у мельницы',
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
      { text: '1. Защитить фермеров и прогнать мародеров', stance: 'defenders', repF1: 6, goldReward: 50, xp: 80 },
      { text: '2. Запугать дезертиров громом имени (Streetwise)', stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 5, xp: 100 },
      { text: '3. Нанять дезертиров к себе в отряд (120 золотых)', stance: 'hire', goldCost: 120, repF1: 4, xp: 60 },
      { text: '4. Не вмешиваться в крестьянские распри', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WAR_RECRUITMENT_PRESSGANG',
    name: 'Принудительный рекрутский набор на площади',
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
      { text: `1. Помочь офицеру [${f1}] загнать новобранцев`, stance: 'defenders', repF1: 4, goldReward: 60 },
      { text: '2. Заступиться за парней оружием против вербовщиков', stance: 'attackers', repF1: -8, repF2: 8, bountyHostile: true },
      { text: '3. Внести отступные за освобождение парней (80 золотых)', stance: 'pay_release', goldCost: 80, repF1: 2, repF2: 8, xp: 70 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },

  // ── 2. FAMINE & SCARCITY (5) ────────────────────────────────────────────────
  {
    id: 'EVT_FAMINE_BARN_RAID',
    name: 'Голодный бунт у амбара зерна',
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
      { text: '1. Помочь страже удержать амбар силой', stance: 'defenders', repF1: 5, repF2: -6, goldReward: 80 },
      { text: '2. Помочь голодным взломать замок и раздать хлеб', stance: 'attackers', repF1: -8, repF2: 10, bountyHostile: true },
      { text: '3. Выкупить зерно для бедняков из своего кошелька (150 золотых)', stance: 'buy_grain', goldCost: 150, repF1: 6, repF2: 8, xp: 120 },
      { text: '4. Торговая речь: Убедить управляющего снизить цены (Mercantile)', stance: 'peace', skillCheck: { skill: SKILLS.Mercantile, target: 45 }, repF1: 4, repF2: 6, xp: 100 },
      { text: '5. Пройти мимо', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_FAMINE_PREDATOR_INVASION',
    name: 'Нападение оголодавших хищников',
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
      { text: '1. Перебить хищников оружием и спасти отару', stance: 'defenders', repF1: 6, goldReward: 40, xp: 90 },
      { text: '2. Приманить и отвлечь зверей едой (2 пайка)', stance: 'feed_beasts', repF1: 4, xp: 60 },
      { text: '3. Укрыться за оградой', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_FAMINE_RELIEF_CARAVAN',
    name: 'Разграбление продовольственного обоза',
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
      { text: '1. Защитить обоз короны от налетчиков', stance: 'defenders', repF1: 8, repF2: -8, goldReward: 180, xp: 110 },
      { text: '2. Помочь налетчикам отбить зерно', stance: 'attackers', repF1: -12, repF2: 8, goldReward: 120, bountyHostile: true },
      { text: '3. Пройти мимо', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_FAMINE_SOUP_KITCHEN_SPOILAGE',
    name: 'Испорченная монастырская похлебка',
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
      { text: '1. Утихомирить бродяг и поддержать монахов', stance: 'defenders', repF1: 4, repF2: -4, xp: 40 },
      { text: '2. Обвинить монастырь в черствости и жадности', stance: 'attackers', repF1: -6, repF2: 6 },
      { text: '3. Очистить чан магией исцеления (Restoration)', stance: 'purify', skillCheck: { skill: SKILLS.Restoration, target: 40 }, repF1: 8, repF2: 8, xp: 120 },
      { text: '4. Пожертвовать свежие пайки (3 порции)', stance: 'donate_rations', repF1: 6, repF2: 6, xp: 80 },
      { text: '5. Пройти мимо', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_FAMINE_RATION_SCAM',
    name: 'Спекулянт гнилым провиантом',
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
      { text: '1. Заставить спекулянта вернуть деньги силой', stance: 'defenders', repF1: 5, repF2: -8, goldReward: 50 },
      { text: '2. Проверить гильдейскую лицензию торговца (Mercantile)', stance: 'peace', skillCheck: { skill: SKILLS.Mercantile, target: 45 }, repF1: 6, xp: 80 },
      { text: '3. Взять долю у торговца и прогнать нищих (100 золотых)', stance: 'bribe', goldReward: 100, repF1: -6 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },

  // ── 3. PLAGUE & CONTAGION (4) ───────────────────────────────────────────────
  {
    id: 'EVT_PLAGUE_QUARANTINE_CLASH',
    name: 'Прорыв чумного карантина у ворот',
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
      { text: '1. Сдержать толпу вместе с карантинной стражей', stance: 'defenders', repF1: 6, repF2: -8, goldReward: 100 },
      { text: '2. Пробить ворота для беженцев силой', stance: 'attackers', repF1: -10, repF2: 8, bountyHostile: true },
      { text: '3. Исцелить больных у ворот молитвой (Restoration)', stance: 'cure', skillCheck: { skill: SKILLS.Restoration, target: 45 }, repF1: 10, repF2: 10, xp: 150 },
      { text: '4. Обойти кордон стороной', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_PLAGUE_PYRE_DESECRATION',
    name: 'Чумные костры и восстание мертвецов',
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
      { text: '1. Истребить мертвецов серебром и сталью', stance: 'defenders', repF1: 8, xp: 120 },
      { text: '2. Освятить погребальный огонь (Restoration)', stance: 'consecrate', skillCheck: { skill: SKILLS.Restoration, target: 40 }, repF1: 10, xp: 140 },
      { text: '3. Спасаться бегством от чумного праха', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_PLAGUE_WATER_WELL_SCARE',
    name: 'Паника у городского колодца',
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
      { text: '1. Успокоить толпу твердым словом (Streetwise)', stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 50 }, repF1: 6, xp: 100 },
      { text: '2. Проверить воду на отраву (Medical)', stance: 'test_water', skillCheck: { skill: SKILLS.Medical, target: 40 }, repF1: 8, xp: 110 },
      { text: '3. Разогнать паникеров силой', stance: 'defenders', repF1: 4, repF2: -6 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_PLAGUE_QUACK_MIRACLE_CURE',
    name: 'Шарлатан с поддельной панацеей от мора',
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
      { text: '1. Разоблачить шарлатана публично (Medical)', stance: 'expose', skillCheck: { skill: SKILLS.Medical, target: 45 }, repF1: 8, repF2: -10, xp: 120 },
      { text: '2. Выбить деньги мошенника оружием', stance: 'defenders', repF1: 6, goldReward: 80 },
      { text: '3. Купить «панацею» за 100 золотых', stance: 'buy_fake', goldCost: 100 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },

  // ── 4. WITCH HUNTS & OCCULT (4) ────────────────────────────────────────────
  {
    id: 'EVT_WITCH_HUNT_SIEGE',
    name: 'Штурм ведьмовского ковена инквизицией',
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
      { text: '1. Примкнуть к инквизиции и искоренить ересь', stance: 'defenders', repF1: 8, repF2: -15, goldReward: 150 },
      { text: '2. Защитить ведьм от костра инквизиторов', stance: 'attackers', repF1: -15, repF2: 12, goldReward: 100 },
      { text: '3. Дипломатия магии: Отговорить инквизитора (Mysticism / Etiquette)', stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 55 }, repF1: 4, repF2: 4, xp: 130 },
      { text: '4. Уйти в тень', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WITCH_ENTHRALLED_AMBUSH',
    name: 'Засада околдованных стражей ковена',
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
      { text: '1. Принять бой и обороняться оружием', stance: 'defenders', goldReward: 40, xp: 80 },
      { text: '2. Рассеять морок колдовства (Thaumaturgy / Mysticism)', stance: 'dispel', skillCheck: { skill: SKILLS.Thaumaturgy, target: 40 }, xp: 120, repF1: 6 },
      { text: '3. Прокрасться мимо незамеченным (Stealth)', stance: 'stealth', skillCheck: { skill: SKILLS.Stealth, target: 45 }, xp: 90 },
      { text: '4. Бежать', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WITCH_HERBALIST_SHAKEDOWN',
    name: 'Охотники трясут невинную травницу',
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
      { text: '1. Заступиться за травницу с мечом в руке', stance: 'attackers', repF1: -8, repF2: 8, goldReward: 50 },
      { text: '2. Доказать целебную природу трав (Medical)', stance: 'peace', skillCheck: { skill: SKILLS.Medical, target: 40 }, repF1: 4, repF2: 6, xp: 100 },
      { text: '3. Помочь сжечь припасы травницы', stance: 'defenders', repF1: 5, repF2: -8 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_WITCH_DAEDRA_PACT_SIGHTING',
    name: 'Тайный ночной призыв младшего Даэдра',
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
      { text: '1. Прервать ритуал и изгнать призванную нечисть', stance: 'attackers', repF1: 8, xp: 150 },
      { text: '2. Произнести даэдрическую клятву повиновения (Daedric)', stance: 'daedric', skillCheck: { skill: SKILLS.Daedric, target: 40 }, xp: 140 },
      { text: '3. Скрыться во тьме', stance: 'neutral' },
    ],
  },

  // ── 5. CRIME WAVE & UNDERWORLD (4) ──────────────────────────────────────────
  {
    id: 'EVT_CRIME_DAYLIGHT_HEIST',
    name: 'Дневной грабёж ростовщика гильдией воров',
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
      { text: '1. Помочь страже повязать грабителей', stance: 'defenders', repF1: 6, repF2: -8, goldReward: 120 },
      { text: '2. Прикрыть отход собратьев-воров', stance: 'attackers', repF1: -8, repF2: 8, goldReward: 100, bountyHostile: true },
      { text: '3. Воровской код: Получить долю за молчание (Streetwise)', stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 50 }, repF2: 6, goldReward: 80, xp: 80 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_CRIME_BROTHERHOOD_CONTRACT',
    name: 'Уличное покушение Тёмного Братства',
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
      { text: '1. Защитить дворянина от клинка ассасина', stance: 'defenders', repF1: 8, repF2: -15, goldReward: 200 },
      { text: '2. Помочь ассасину завершить контракт', stance: 'attackers', repF1: -15, repF2: 10, bountyHostile: true },
      { text: '3. Уйти в тень переулка', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_CRIME_PICKPOCKET_CHASE',
    name: 'Погоня за карманником на базаре',
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
      { text: '1. Сбить карманника подсечкой', stance: 'defenders', repF1: 4, goldReward: 25 },
      { text: '2. Заблокировать путь страже плечом', stance: 'attackers', repF1: -4, repF2: 6 },
      { text: '3. Оплатить украденное из своего кармана (20 золотых)', stance: 'pay_theft', goldCost: 20, repF1: 4, repF2: 4, xp: 50 },
      { text: '4. Проигнорировать крики', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_CRIME_GAMBLING_DEN_BUST',
    name: 'Облава стражи на подпольный притон',
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
      { text: '1. Возглавить штурм вместе со стражей', stance: 'defenders', repF1: 6, repF2: -6, goldReward: 80 },
      { text: '2. Помочь завсегдатаям выбить окно и бежать', stance: 'attackers', repF1: -6, repF2: 8 },
      { text: '3. Дать взятку сержанту за проход (70 золотых)', stance: 'bribe', goldCost: 70, repF2: 6, xp: 60 },
      { text: '4. Сделать ставку и не двигаться', stance: 'neutral' },
    ],
  },

  // ── 6. TEMPLE PERSECUTION & FAITH (4) ───────────────────────────────────────
  {
    id: 'EVT_TEMPLE_PURGE_SIEGE',
    name: 'Гонения на культ: Осада святилища стражей',
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
      { text: '1. Встать на защиту алтаря и жрецов', stance: 'defenders', repF1: 10, repF2: -12, xp: 120 },
      { text: '2. Поддержать указ правителя о закрытии культа', stance: 'attackers', repF1: -12, repF2: 8, goldReward: 100 },
      { text: '3. Священный пакт о неприкосновенности (Этикет)', stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 6, repF2: 6, xp: 140 },
      { text: '4. Не гневить богов и уйти', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_TEMPLE_CLERGY_STANDOFF',
    name: 'Стычка жрецов за реликвию у загородного алтаря',
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
      { text: '1. Защитить канонических хранителей реликвии', stance: 'defenders', repF1: 6, repF2: -6, xp: 70 },
      { text: '2. Поддержать реформу раскольников', stance: 'attackers', repF1: -6, repF2: 6, xp: 70 },
      { text: '3. Рассудить спор толкованием писания (Streetwise / Etiquette)', stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 45 }, repF1: 4, repF2: 4, xp: 90 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_TEMPLE_HERETIC_GRAFFITI',
    name: 'Осквернение храмовых врат еретиками',
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
      { text: '1. Перебить осквернителей на ступенях святилища', stance: 'defenders', repF1: 6, repF2: -6, goldReward: 50 },
      { text: '2. Задержать вандалов живыми для церковного суда', stance: 'arrest', repF1: 8, xp: 80 },
      { text: '3. Помочь отмыть кощунственные надписи', stance: 'cleanse', repF1: 5, xp: 60 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_TEMPLE_ALMS_DISPUTE',
    name: 'Драка нищих из-за храмовой милостыни',
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
      { text: '1. Разнять драчунов строгим окриком (Streetwise)', stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 40 }, repF1: 4, repF2: 4, xp: 50 },
      { text: '2. Бросить в толпу горсть золота (15 золотых)', stance: 'scatter_gold', goldCost: 15, repF1: 6, repF2: 6, xp: 60 },
      { text: '3. Позвать храмового служку с розгами', stance: 'defenders', repF1: 3, repF2: -4 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },

  // ── 7. NEW RULER & SUCCESSION (3) ──────────────────────────────────────────
  {
    id: 'EVT_NEW_RULER_CORONATION',
    name: 'Коронация нового правителя: Парад и мятежники',
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
      { text: '1. Защитить нового правителя от заговорщиков', stance: 'defenders', repF1: 12, repF2: -15, goldReward: 250, xp: 150 },
      { text: '2. Поддержать мятежников и свергнуть узурпатора', stance: 'attackers', repF1: -15, repF2: 12, bountyHostile: true },
      { text: '3. Закрыть лорда своим щитом в критический миг', stance: 'bodyguard', repF1: 15, goldReward: 300, xp: 200 },
      { text: '4. Скрыться в ликующей толпе', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_NEW_RULER_STATUE_UNVEILING',
    name: 'Свержение статуи прежнего лорда',
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
      { text: '1. Помочь страже оттеснить вандалов от постамента', stance: 'defenders', repF1: 6, repF2: -6, goldReward: 80 },
      { text: '2. Взяться за канат и свалить монумент с народом', stance: 'attackers', repF1: -8, repF2: 8 },
      { text: '3. Речь о сохранении памяти истории (Этикет)', stance: 'peace', skillCheck: { skill: SKILLS.Etiquette, target: 50 }, repF1: 5, repF2: 5, xp: 100 },
      { text: '4. Наблюдать со стороны', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_NEW_RULER_OATH_CEREMONY',
    name: 'Присяга вассалов у ворот цитадели',
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
      { text: '1. Поддержать присягу верности короне', stance: 'defenders', repF1: 8, repF2: -10, goldReward: 120 },
      { text: '2. Поддержать право барона на независимость', stance: 'attackers', repF1: -10, repF2: 8 },
      { text: '3. Рыцарский поединок за честь сторон (1 на 1)', stance: 'duel', repF1: 6, repF2: 6, xp: 150 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },

  // ── 8. COMMERCE & TAXATION (2) ──────────────────────────────────────────────
  {
    id: 'EVT_PRICES_TAX_REVOLT',
    name: 'Налоговый бунт на ярмарочной площади',
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
      { text: '1. Помочь сборщикам податей собрать налог силой', stance: 'defenders', repF1: 6, repF2: -8, goldReward: 100 },
      { text: '2. Встать на сторону купеческой гильдии', stance: 'attackers', repF1: -8, repF2: 8, bountyHostile: true },
      { text: '3. Аудит налоговых свитков: Найти ошибку (Mercantile)', stance: 'peace', skillCheck: { skill: SKILLS.Mercantile, target: 50 }, repF1: 5, repF2: 8, xp: 120 },
      { text: '4. Не лезть в чужие кошельки', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_PRICES_PRICE_GOUGING_INSPECTION',
    name: 'Ревизия ростовщика в лавке',
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
      { text: '1. Защитить ревизора от расправы головорезов', stance: 'defenders', repF1: 6, repF2: -6, goldReward: 90 },
      { text: '2. Взять взятку у ростовщика за молчание (150 золотых)', stance: 'bribe', goldReward: 150, repF1: -8 },
      { text: '3. Пригрозить судом купеческой гильдии (Streetwise)', stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 5, xp: 80 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },

  // ── 9. HOLIDAYS & FESTIVITIES (4) ───────────────────────────────────────────
  {
    id: 'EVT_HOLIDAY_TOWN_BRAWL',
    name: 'Праздничная трактирная потасовка',
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
      { text: '1. Навести порядок кулаками (Без оружия)', stance: 'defenders', repF1: 5, goldReward: 40, xp: 60 },
      { text: '2. Присоединиться к веселой драке стенка на стенку', stance: 'brawl', repF2: 5, xp: 50 },
      { text: '3. Выставить бочонок эля за свой счет (30 золотых)', stance: 'buy_drinks', goldCost: 30, repF1: 6, repF2: 6, xp: 70 },
      { text: '4. Допивать кружку в углу', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_HOLIDAY_CARNIVAL_MASQUERADE',
    name: 'Карнавальный переполох и шуты',
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
      { text: '1. Поймать ряженых воришек с поличным', stance: 'defenders', repF1: 6, goldReward: 50 },
      { text: '2. Сыграть роль в представлении на потеху публике (Personality)', stance: 'performance', skillCheck: { skill: SKILLS.Etiquette, target: 40 }, repF1: 8, xp: 100 },
      { text: '3. Аплодировать из толпы', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_SCARY_NIGHT_HORROR',
    name: 'Прорыв нечисти в Зловещую ночь',
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
      { text: '1. Очистить улицу святым огнем и сталью', stance: 'defenders', repF1: 8, goldReward: 120, xp: 130 },
      { text: '2. Прочитать изгоняющую молитву Аркея (Restoration)', stance: 'turn_undead', skillCheck: { skill: SKILLS.Restoration, target: 45 }, repF1: 10, xp: 150 },
      { text: '3. Бежать к свету факелов заставы', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_HOLY_DAY_FANATICS',
    name: 'Священный день: Процессия и нападение еретиков',
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
      { text: '1. Защитить шествие верующих от дубин еретиков', stance: 'defenders', repF1: 8, repF2: -8, xp: 90 },
      { text: '2. Разогнать обе стороны во избежание кровопролития', stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 4, repF2: 4, xp: 100 },
      { text: '3. Присоединиться к молитвенному шествию', stance: 'pray', repF1: 6, xp: 60 },
      { text: '4. Пройти мимо', stance: 'neutral' },
    ],
  },

  // ── 10. ARCANE ANOMALY (1) ──────────────────────────────────────────────────
  {
    id: 'EVT_MAD_WIZARD_RAMPAGE',
    name: 'Безумный волшебник и призванные элементали',
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
      { text: '1. Сбить безумца метким выстрелом или контрзаклинанием', stance: 'defenders', repF1: 10, goldReward: 180, xp: 140 },
      { text: '2. Развеять магический транс безумия (Mysticism / Thaumaturgy)', stance: 'dispel', skillCheck: { skill: SKILLS.Thaumaturgy, target: 50 }, repF1: 12, xp: 160 },
      { text: '3. В укрытие от летящих огненных шаров', stance: 'neutral' },
    ],
  },

  // ── 11. MUNDANE & EXPLORATION (3) ───────────────────────────────────────────
  {
    id: 'EVT_FARM_RUNAWAY_CATTLE',
    name: 'Сбежавший разъяренный зверь / вепрь на хуторе',
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
      { text: '1. Заколоть зверя оружием и спасти постройки', stance: 'defenders', repF1: 5, goldReward: 35, xp: 70 },
      { text: '2. Успокоить зверя лаской и кормом (Ranger / Stealth)', stance: 'tame', skillCheck: { skill: SKILLS.Stealth, target: 40 }, repF1: 6, xp: 90 },
      { text: '3. Запрыгнуть на крышу сарая', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_GRAVEYARD_WEEPING_MOURNER',
    name: 'Ограбление безутешного вдовца на могиле',
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
      { text: '1. Проучить могильных мародеров мечом', stance: 'defenders', repF1: 6, goldReward: 40, xp: 70 },
      { text: '2. Запугать воров громом имени (Streetwise)', stance: 'peace', skillCheck: { skill: SKILLS.Streetwise, target: 45 }, repF1: 5, xp: 80 },
      { text: '3. Пройти мимо чужого горя', stance: 'neutral' },
    ],
  },
  {
    id: 'EVT_TAVERN_CHESS_WAGER',
    name: 'Шахматная баталия / спор над картой в таверне',
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
      { text: '1. Рассудить партию блестящим матом (Etiquette)', stance: 'chess_move', skillCheck: { skill: SKILLS.Etiquette, target: 45 }, xp: 100 },
      { text: '2. Сделать ставку золотом на картографа (30 золотых)', stance: 'wager', goldCost: 30, goldReward: 60 },
      { text: '3. Заказать кружку эля и слушать байки', stance: 'neutral', xp: 20 },
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
