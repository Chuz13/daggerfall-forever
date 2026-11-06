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
import { getDirectorState } from './livingDirector.js';
import { getRegionState, isRegionInQuarantine, CRISIS_TYPE, CRISIS_PHASE } from './regionState.js';
import { onContractCompleted } from './bountySync.js';
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

// ═══════════════════════════════════════════════════════════════════════════════
// REGIONAL CRISIS RADIANT CONTRACTS (Post-Beta 1.1)
//
// Procedural micro-contracts tied to a region's active crisis:
//  - WAR: Eliminate the Deserter Warlord / Saboteur Commander
//  - PLAGUE: Recover Stolen Plague Remedies from Quarantine Smugglers
//  - FAMINE: Seize Hoarded Black-Market Grain Cache
//  - CIVIL_STRIFE: Suppress Insurgent Ringleader Cell
// Completing a contract awards gold, +5 regional reputation, and calls
// `onContractCompleted(regionIndex)` to ease regional crisis tension.
// ═══════════════════════════════════════════════════════════════════════════════

export const CRISIS_QUEST_TYPE = Object.freeze({
  WAR_DESERTER_LEADER: 'WAR_DESERTER_LEADER',
  PLAGUE_SMUGGLED_CURE: 'PLAGUE_SMUGGLED_CURE',
  FAMINE_HOARDER_CACHE: 'FAMINE_HOARDER_CACHE',
  STRIFE_AGITATOR_CELL: 'STRIFE_AGITATOR_CELL',
});

function getCrisisQuestRegistry() {
  const dir = getDirectorState();
  if (!dir.subsystems.crisisQuests) {
    dir.subsystems.crisisQuests = {};
  }
  return dir.subsystems.crisisQuests;
}

/**
 * Generates an available regional crisis contract offer if the region is in crisis.
 *
 * @param {number|null|undefined} regionIndex
 * @param {number} [playerLevel=1]
 * @returns {{
 *   id: string,
 *   regionIndex: number,
 *   crisis: string,
 *   questType: string,
 *   title: string,
 *   targetName: string,
 *   rewardGold: number,
 *   repDelta: number,
 *   status: string
 * } | null}
 */
export function offerRegionalCrisisContract(regionIndex, playerLevel = 1) {
  if (regionIndex == null || !Number.isInteger(regionIndex) || regionIndex < 0) return null;
  if (Number(LivingTamrielConfig.political) === PRESENCE.OFF) return null;

  const state = getRegionState(regionIndex);
  if (!state || state.crisis === CRISIS_TYPE.PEACE || state.phase === CRISIS_PHASE.NONE) {
    return null;
  }

  const lvl = Math.max(1, Number(playerLevel) || 1);
  const rewardGold = 250 + lvl * 40;

  /** @type {string} */
  let questType = CRISIS_QUEST_TYPE.WAR_DESERTER_LEADER;
  let title = LIVING_WORDS.crisisContractWarTitle();
  let targetName = 'Deserter Warlord';

  if (state.crisis === CRISIS_TYPE.PLAGUE) {
    questType = CRISIS_QUEST_TYPE.PLAGUE_SMUGGLED_CURE;
    title = LIVING_WORDS.crisisContractPlagueTitle();
    targetName = 'Plague Contraband Smuggler';
  } else if (state.crisis === CRISIS_TYPE.FAMINE) {
    questType = CRISIS_QUEST_TYPE.FAMINE_HOARDER_CACHE;
    title = LIVING_WORDS.crisisContractFamineTitle();
    targetName = 'Grain Syndicate Hoarder';
  } else if (state.crisis === CRISIS_TYPE.CIVIL_STRIFE) {
    questType = CRISIS_QUEST_TYPE.STRIFE_AGITATOR_CELL;
    title = LIVING_WORDS.crisisContractStrifeTitle();
    targetName = 'Insurgent Ringleader';
  }

  return {
    id: `crisis_contract_${regionIndex}_${state.crisis}`,
    regionIndex,
    crisis: state.crisis,
    questType,
    title,
    targetName,
    rewardGold,
    repDelta: 5,
    status: 'OFFERED',
  };
}

/**
 * Accepts and persists a regional crisis contract in the LivingDirector save state.
 *
 * @param {number} regionIndex
 * @param {number} [playerLevel=1]
 * @param {number} [nowMinutes=0]
 */
export function acceptRegionalCrisisContract(regionIndex, playerLevel = 1, nowMinutes = 0) {
  const offer = offerRegionalCrisisContract(regionIndex, playerLevel);
  if (!offer) return null;
  const reg = getCrisisQuestRegistry();
  const active = {
    ...offer,
    status: 'ACTIVE',
    acceptedAtMinutes: Number.isFinite(nowMinutes) ? nowMinutes : 0,
  };
  reg[regionIndex] = active;
  return active;
}

/**
 * Returns the currently active crisis contract for `regionIndex`, or `null` if none.
 *
 * @param {number|null|undefined} regionIndex
 */
export function getActiveCrisisContract(regionIndex) {
  if (regionIndex == null || !Number.isInteger(regionIndex) || regionIndex < 0) return null;
  const reg = getCrisisQuestRegistry();
  const c = reg[regionIndex];
  if (!c || c.status !== 'ACTIVE') return null;
  return c;
}

/**
 * Completes the active regional crisis contract for `regionIndex`, granting gold,
 * +5 regional reputation, and reducing regional crisis tension via `onContractCompleted`.
 *
 * @param {number} regionIndex
 * @param {any} [playerEntity=null]
 */
export function completeRegionalCrisisContract(regionIndex, playerEntity = null) {
  const reg = getCrisisQuestRegistry();
  const c = reg[regionIndex];
  if (!c || c.status !== 'ACTIVE') return null;

  c.status = 'COMPLETED';
  const rewardGold = Number(c.rewardGold || 290);
  const repDelta = Number(c.repDelta || 5);

  if (playerEntity) {
    if (typeof playerEntity.goldPieces === 'number') {
      playerEntity.goldPieces += rewardGold;
    } else {
      playerEntity.goldPieces = rewardGold;
    }
    if (playerEntity.regionalReputations && typeof playerEntity.regionalReputations === 'object') {
      playerEntity.regionalReputations[regionIndex] =
        Number(playerEntity.regionalReputations[regionIndex] || 0) + repDelta;
    }
  }

  onContractCompleted(regionIndex);

  return {
    completed: true,
    contract: c,
    rewardGold,
    repDelta,
    message: LIVING_WORDS.crisisContractCompleted(rewardGold),
  };
}

/**
 * Formats active Regional Crisis Contracts and Rival Quest Interceptions as
 * native `questBridge.questLog` active quest entries so they appear in the
 * player's Quest Log (`Q`) and Pause Quests tab.
 *
 * @param {number} [nowMinutes=0]
 * @returns {Array<{ id: string, questId: string, name: string, questName: string, clockSeconds: number, messages: Array<Array<{ formatting: string, text: string }>> }>}
 */
export function getLivingQuestLogEntries(nowMinutes = 0) {
  void nowMinutes;
  const line = (text) => ({ formatting: 'text', text });
  /** @type {Array<{ id: string, questId: string, name: string, questName: string, clockSeconds: number, messages: Array<Array<{ formatting: string, text: string }>> }>} */
  const entries = [];

  const reg = getCrisisQuestRegistry();
  for (const [regKey, c] of Object.entries(reg)) {
    if (!c || c.status !== 'ACTIVE') continue;
    const regIdx = Number(c.regionIndex ?? regKey);
    const regState = getRegionState(regIdx);
    const daysLeft = Math.max(1, Number(regState?.phaseDaysRemaining || 3));
    const lines = [
      c.title,
      `Region: ${regState?.regionName || `Region ${regIdx}`} (${c.crisis})`,
      `Target: ${c.targetName} (in regional camps, skirmishes, or dungeons)`,
      `Reward: ${c.rewardGold} gold pieces and +${c.repDelta || 5} regional renown.`,
    ];
    entries.push({
      id: `LIVING:${c.id}`,
      questId: `living_crisis_${regIdx}`,
      name: c.title,
      questName: 'LIVING_CRISIS',
      clockSeconds: daysLeft * 86400,
      messages: [lines.map(line)],
    });
  }

  const root = getDirectorState();
  const intercepted = root?.subsystems?.adventurers?.interceptedQuests;
  if (intercepted && typeof intercepted === 'object') {
    for (const [slotKey, iq] of Object.entries(intercepted)) {
      if (!iq || iq.recovered || iq.forfeited) continue;
      const lines = [
        LIVING_WORDS.adventurerQuestIntercepted(),
        `Rival: ${iq.adventurerName || 'Rival Adventurer'} (${iq.adventurerClass || 'Adventurer'}, Lv.${iq.adventurerLevel || 5})`,
        `Site: ${iq.locationId || slotKey}`,
      ];
      entries.push({
        id: `LIVING:intercepted_${slotKey}`,
        questId: `living_intercept_${slotKey}`,
        name: `Rival Interception: ${iq.adventurerName || 'Rival Adventurer'}`,
        questName: 'LIVING_RIVAL',
        clockSeconds: 3 * 86400,
        messages: [lines.map(line)],
      });
    }
  }

  return entries;
}


