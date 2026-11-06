// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// REGIONAL CRISIS PRESENTER & RUMOR BRIDGE (Living Tamriel)
//
// Translates live regional crisis states (WAR, PLAGUE, FAMINE, CIVIL_STRIFE)
// and lifecycle phases (START, MID, END) into:
//  1. Map hover & compass Town Panel status/economy lines
//  2. Settlement entry HUD notifications
//  3. Dynamic town Notice Board tokens & NPC spoken rumors
// ═══════════════════════════════════════════════════════════════════════════════

import { RSC, TOKEN_TEXT } from '../../formats/textRsc.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getRegionState, isRegionInQuarantine, CRISIS_TYPE, CRISIS_PHASE } from './regionState.js';
import { LIVING_WORDS } from './livingWords.js';

/**
 * Returns the localized status line for a region's active crisis and phase,
 * or null if the region is at peace or political simulation is OFF.
 *
 * @param {number|null|undefined} regionIndex
 * @returns {string|null}
 */
export function getRegionCrisisStatusLine(regionIndex) {
  if (regionIndex == null || !Number.isInteger(regionIndex) || regionIndex < 0) return null;
  if (Number(LivingTamrielConfig.political) === PRESENCE.OFF) return null;

  const state = getRegionState(regionIndex);
  if (!state || state.crisis === CRISIS_TYPE.PEACE || state.phase === CRISIS_PHASE.NONE) {
    return null;
  }

  switch (state.crisis) {
    case CRISIS_TYPE.WAR:
      if (state.phase === CRISIS_PHASE.START) return LIVING_WORDS.crisisStatusWarStart();
      if (state.phase === CRISIS_PHASE.MID) return LIVING_WORDS.crisisStatusWarMid();
      return LIVING_WORDS.crisisStatusWarEnd();

    case CRISIS_TYPE.PLAGUE:
      if (state.phase === CRISIS_PHASE.START) return LIVING_WORDS.crisisStatusPlagueStart();
      if (state.phase === CRISIS_PHASE.MID) return LIVING_WORDS.crisisStatusPlagueMid();
      return LIVING_WORDS.crisisStatusPlagueEnd();

    case CRISIS_TYPE.FAMINE:
      if (state.phase === CRISIS_PHASE.START) return LIVING_WORDS.crisisStatusFamineStart();
      if (state.phase === CRISIS_PHASE.MID) return LIVING_WORDS.crisisStatusFamineMid();
      return LIVING_WORDS.crisisStatusFamineEnd();

    case CRISIS_TYPE.CIVIL_STRIFE:
      if (state.phase === CRISIS_PHASE.START) return LIVING_WORDS.crisisStatusStrifeStart();
      if (state.phase === CRISIS_PHASE.MID) return LIVING_WORDS.crisisStatusStrifeMid();
      return LIVING_WORDS.crisisStatusStrifeEnd();

    default:
      return null;
  }
}

/**
 * Returns the localized economic impact line for a region's active crisis,
 * or null when at peace.
 *
 * @param {number|null|undefined} regionIndex
 * @returns {string|null}
 */
export function getRegionCrisisEconomyLine(regionIndex) {
  if (regionIndex == null || !Number.isInteger(regionIndex) || regionIndex < 0) return null;
  if (Number(LivingTamrielConfig.political) === PRESENCE.OFF) return null;

  const state = getRegionState(regionIndex);
  if (!state || state.crisis === CRISIS_TYPE.PEACE || state.phase === CRISIS_PHASE.NONE) {
    return null;
  }

  switch (state.crisis) {
    case CRISIS_TYPE.WAR:
    case CRISIS_TYPE.CIVIL_STRIFE:
      return LIVING_WORDS.economyWarShortage();
    case CRISIS_TYPE.FAMINE:
      return LIVING_WORDS.economyFamineFood();
    case CRISIS_TYPE.PLAGUE:
      return LIVING_WORDS.economyPlaguePotions();
    default:
      return null;
  }
}

/**
 * Returns an array of localized crisis lines (`[statusLine, economyLine]`)
 * suitable for the Travel Map hover tooltip card and compass Town Panel.
 * Returns `[]` when the region is at peace.
 *
 * @param {number|null|undefined} regionIndex
 * @returns {string[]}
 */
export function getRegionCrisisLines(regionIndex) {
  const status = getRegionCrisisStatusLine(regionIndex);
  if (!status) return [];
  const econ = getRegionCrisisEconomyLine(regionIndex);
  return econ ? [status, econ] : [status];
}

/**
 * Returns the HUD notification banner shown when the player enters a settlement
 * in a crisis-afflicted region, or null if the region is at peace.
 *
 * @param {number|null|undefined} regionIndex
 * @param {string} [settlementName='']
 * @returns {string|null}
 */
export function getSettlementEntryNotification(regionIndex, settlementName = '') {
  if (regionIndex == null || !Number.isInteger(regionIndex) || regionIndex < 0) return null;
  if (Number(LivingTamrielConfig.political) === PRESENCE.OFF) return null;

  if (isRegionInQuarantine(regionIndex)) {
    return LIVING_WORDS.quarantineGateClosed();
  }

  const state = getRegionState(regionIndex);
  if (!state || state.crisis === CRISIS_TYPE.PEACE || state.phase === CRISIS_PHASE.NONE) {
    return null;
  }

  const town = settlementName || state.regionName || 'the settlement';
  switch (state.crisis) {
    case CRISIS_TYPE.WAR:
      return LIVING_WORDS.crisisEntryWar(town);
    case CRISIS_TYPE.PLAGUE:
      return LIVING_WORDS.crisisEntryPlague(town);
    case CRISIS_TYPE.FAMINE:
      return LIVING_WORDS.crisisEntryFamine(town);
    case CRISIS_TYPE.CIVIL_STRIFE:
      return LIVING_WORDS.crisisEntryStrife(town);
    default:
      return null;
  }
}

/**
 * Returns a localized rumor describing the current regional crisis and phase,
 * used by NPC conversations ("Any news?") and town Notice Boards.
 *
 * @param {number|null|undefined} regionIndex
 * @returns {string|null}
 */
export function getRegionCrisisRumor(regionIndex) {
  if (regionIndex == null || !Number.isInteger(regionIndex) || regionIndex < 0) return null;
  if (Number(LivingTamrielConfig.political) === PRESENCE.OFF) return null;

  const state = getRegionState(regionIndex);
  if (!state || state.crisis === CRISIS_TYPE.PEACE || state.phase === CRISIS_PHASE.NONE) {
    return null;
  }

  const region = state.regionName || `Region ${regionIndex}`;
  switch (state.crisis) {
    case CRISIS_TYPE.WAR:
      if (state.phase === CRISIS_PHASE.START) return LIVING_WORDS.rumorWarStart(region);
      if (state.phase === CRISIS_PHASE.MID) return LIVING_WORDS.rumorWarMid(region);
      return LIVING_WORDS.rumorWarEnd(region);

    case CRISIS_TYPE.PLAGUE:
      if (state.phase === CRISIS_PHASE.START) return LIVING_WORDS.rumorPlagueStart(region);
      if (state.phase === CRISIS_PHASE.MID) return LIVING_WORDS.rumorPlagueMid(region);
      return LIVING_WORDS.rumorPlagueEnd(region);

    case CRISIS_TYPE.FAMINE:
      if (state.phase === CRISIS_PHASE.START) return LIVING_WORDS.rumorFamineStart(region);
      if (state.phase === CRISIS_PHASE.MID) return LIVING_WORDS.rumorFamineMid(region);
      return LIVING_WORDS.rumorFamineEnd(region);

    case CRISIS_TYPE.CIVIL_STRIFE:
      if (state.phase === CRISIS_PHASE.START) return LIVING_WORDS.rumorStrifeStart(region);
      if (state.phase === CRISIS_PHASE.MID) return LIVING_WORDS.rumorStrifeMid(region);
      return LIVING_WORDS.rumorStrifeEnd(region);

    default:
      return null;
  }
}

/**
 * Converts the active regional crisis rumor into TEXT.RSC tokens for `bulletinBoardRows`.
 *
 * @param {number|null|undefined} regionIndex
 * @returns {Array<{ formatting: number, text: string, x: number, y: number }>|null}
 */
export function getRegionCrisisBulletinTokens(regionIndex) {
  const rumor = getRegionCrisisRumor(regionIndex);
  if (!rumor) return null;
  return [
    { formatting: TOKEN_TEXT, text: rumor, x: 0, y: 0 },
    { formatting: RSC.NewLine, text: '', x: 0, y: 0 },
  ];
}
