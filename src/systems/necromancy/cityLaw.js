// @ts-check
// CITY-LAW: Settlement vigilance, social reactions, and anti-necromantic criminal infractions.
//
// Key principles:
// 1. Openly commanding undead or walking as a Lich inside a settlement is a serious crime.
// 2. Disguise: Ordering minions to FEIGN_DEATH outside the city or drawing a hood avoids alarm.
// 3. Regional Law: Redguards of Hammerfell enforce shoot-on-sight capital punishment
//    for disturbing the honored dead.

import { CRIMES } from '../crimes.js';
import { setCrimeCommitted } from '../court.js';
import { isLich, isAnyLich, isPlayerDisguised } from './lichdomStatus.js';
import { allSpawnedMinions, MINION_STANCES } from './minionController.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';
import { NecroConfig, SOCIAL_LAW_MODES } from './necroConfig.js';

export const HAMMERFELL_REGIONS = Object.freeze(new Set([
  'Sentinel',
  'Alik\'r Desert',
  'Dragontail Mountains',
  'Dak\'fron',
  'Tigonus',
  'Kozanset',
  'Lainlyn',
  'Santaki',
  'Totambu',
  'Ephes',
  'Rihad',
  'Taneth',
]));

/**
 * Checks whether the player or their minions commit an open crime against settlement law.
 * @param {object} playerEntity
 * @param {object} [options]
 * @param {boolean} [options.isInsideSettlement=true]
 * @param {string} [options.regionName='Daggerfall']
 * @param {boolean} [options.isDisguised=false] Whether player has cloak hood drawn
 * @returns {{ infraction: boolean, crime: number, alertText: string|null, isHostile: boolean }}
 */
export function checkSettlementInfraction(
  playerEntity,
  {
    isInsideSettlement = true,
    regionName = 'Daggerfall',
    isDisguised = false,
    crimeAlertSink = null,
    crimeSeveritySink = null,
  } = {},
) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY || !isInsideSettlement || !playerEntity) {
    return { infraction: false, crime: CRIMES.None, alertText: null, isHostile: false };
  }

  if (NecroConfig.socialLaw === SOCIAL_LAW_MODES.OFF) {
    return { infraction: false, crime: CRIMES.None, alertText: null, isHostile: false };
  }

  const isHammerfell = HAMMERFELL_REGIONS.has(regionName);
  const effectiveDisguised = isDisguised || isPlayerDisguised(playerEntity);

  // 1. Check Lich status (suppressed while Mortal Disguise spell/enchantment or hood is active)
  if (isAnyLich(playerEntity) && !effectiveDisguised) {
    const crime = isHammerfell ? CRIMES.High_Treason : CRIMES.Treason;
    setCrimeCommitted(playerEntity, crime);
    const alertText = isHammerfell
      ? 'Defiler of ancestors! By Tu\'whacca, strike the unholy fiend down!'
      : 'A foul Lich walks our streets! Guards, sound the alarm!';
    if (typeof crimeAlertSink === 'function') crimeAlertSink(alertText);
    if (typeof crimeSeveritySink === 'function') crimeSeveritySink(crime);
    return {
      infraction: true,
      crime,
      alertText,
      isHostile: true,
    };
  }

  // 2. Check active undead minions
  const activeMinions = allSpawnedMinions();
  const visibleMinions = activeMinions.filter(
    (m) => !m.dead && !m.rebelled && m.stance !== MINION_STANCES.FEIGN_DEATH,
  );

  if (visibleMinions.length > 0) {
    const crime = isHammerfell ? CRIMES.High_Treason : CRIMES.Criminal_Conspiracy;
    setCrimeCommitted(playerEntity, crime);
    const alertText = isHammerfell
      ? 'Desecration! A necromancer and their walking corpses defile our city!'
      : 'Guards! Necromancy in the city square! Slay the abominations!';
    if (typeof crimeAlertSink === 'function') crimeAlertSink(alertText);
    if (typeof crimeSeveritySink === 'function') crimeSeveritySink(crime);
    return {
      infraction: true,
      crime,
      alertText,
      isHostile: isHammerfell,
    };
  }

  return { infraction: false, crime: CRIMES.None, alertText: null, isHostile: false };
}

export const checkCityLawViolation = (opts) => checkSettlementInfraction(opts.playerEntity, opts);
