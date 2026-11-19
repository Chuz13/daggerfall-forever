// CITY-LAW: Settlement vigilance, social reactions, and anti-necromantic criminal infractions.
//
// Key principles:
// 1. Openly commanding undead or walking as a Lich inside a settlement is a serious crime.
// 2. Disguise: Ordering minions to FEIGN_DEATH outside the city or drawing a hood avoids alarm.
// 3. Regional Law: Redguards of Hammerfell enforce shoot-on-sight capital punishment
//    for disturbing the honored dead.

import { CRIMES } from '../crimes.js';
import { setCrimeCommitted, REPUTATION_LOSS_PER_CRIME } from '../court.js';
import { racialSuppressCrime } from '../lycanthropy.js';
import { t } from '../textManager.js';
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
 * Pure read-only check whether the player currently has an open necromancy/lichdom violation
 * in a settlement (without mutating crimeCommitted or firing alert sinks).
 * @param {object} playerEntity
 * @param {object} [options]
 * @param {boolean} [options.isInsideSettlement=true]
 * @param {boolean} [options.isDisguised=false]
 * @returns {boolean}
 */
export function hasOpenNecroViolation(
  playerEntity,
  { isInsideSettlement = true, isDisguised = false } = {},
) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY || !isInsideSettlement || !playerEntity) {
    return false;
  }
  if (NecroConfig.socialLaw === SOCIAL_LAW_MODES.OFF) {
    return false;
  }
  const effectiveDisguised = isDisguised || isPlayerDisguised(playerEntity);
  if (isAnyLich(playerEntity) && !effectiveDisguised) {
    return true;
  }
  return allSpawnedMinions().some(
    (m) => m && !m.dead && !m.rebelled && m.stance !== MINION_STANCES.FEIGN_DEATH,
  );
}

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
  const visibleMinions = allSpawnedMinions().filter(
    (m) => m && !m.dead && !m.rebelled && m.stance !== MINION_STANCES.FEIGN_DEATH,
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
      isHostile: true,
    };
  }

  return { infraction: false, crime: CRIMES.None, alertText: null, isHostile: false };
}

export const checkCityLawViolation = (opts) => checkSettlementInfraction(opts.playerEntity, opts);

/**
 * Evaluates and commits a vanilla Assault crime when harvesting corpse remains
 * in a settlement or inhabited building in view of a witness.
 * Never downgrades a heavier active crime (e.g. Murder or Treason).
 * @param {object} playerEntity
 * @param {object} [options]
 * @returns {{ crimeCommitted: boolean, crime: number }}
 */
export function reportCorpseHarvestCrime(
  playerEntity,
  {
    isInsideSettlement = false,
    isInsideBuilding = false,
    isInsideDungeon = false,
    hasWitness = false,
    spawnWitnessGuards = null,
    say = null,
  } = {},
) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY || !playerEntity) {
    return { crimeCommitted: false, crime: CRIMES.None };
  }
  if (NecroConfig.socialLaw === SOCIAL_LAW_MODES.OFF) {
    return { crimeCommitted: false, crime: CRIMES.None };
  }
  if (isInsideDungeon || (!isInsideSettlement && !isInsideBuilding)) {
    return { crimeCommitted: false, crime: CRIMES.None };
  }
  if (!hasWitness || racialSuppressCrime(playerEntity)) {
    return { crimeCommitted: false, crime: CRIMES.None };
  }

  const harvestCrime = CRIMES.Assault;
  const currentCrime = Number(playerEntity.crimeCommitted) || 0;
  const currentWeight = REPUTATION_LOSS_PER_CRIME[currentCrime] ?? 0;
  const newWeight = REPUTATION_LOSS_PER_CRIME[harvestCrime] ?? 0;

  if (!currentCrime || newWeight > currentWeight) {
    setCrimeCommitted(playerEntity, harvestCrime);
  }

  if (typeof spawnWitnessGuards === 'function') {
    spawnWitnessGuards();
  }
  if (typeof say === 'function') {
    say(t('necro.harvest.crimeWitnessed', 'Someone witnessed your desecration of the dead! The watch has been alerted!'));
  }

  return { crimeCommitted: true, crime: playerEntity.crimeCommitted || harvestCrime };
}
