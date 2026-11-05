// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// REGIONAL STATE ENGINE (Living Tamriel)
//
// Manages dynamic political, crisis, and epidemiological states across all
// 62 regions of Tamriel. Ticks daily via advanceWorldMinutes(1440).
// ═══════════════════════════════════════════════════════════════════════════════

import { BAY_REGION_COUNT, REGION_NAMES } from '../../formats/mapsTables.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getLivingDirectorState } from './livingDirector.js';

/**
 * Regional crisis types.
 */
export const CRISIS_TYPE = Object.freeze({
  PEACE: 'PEACE',
  WAR: 'WAR',
  PLAGUE: 'PLAGUE',
  FAMINE: 'FAMINE',
  CIVIL_STRIFE: 'CIVIL_STRIFE',
});

/**
 * Three-stage lifecycle for regional events.
 */
export const CRISIS_PHASE = Object.freeze({
  NONE: 'NONE',
  START: 'START', // Precursors, rumors in taverns, scouts, mild price shifts
  MID: 'MID',     // Peak manifestation: cordons, quarantine, clashing patrols
  END: 'END',     // Truce, relief caravans, fading disease, recovery
});

/**
 * Default duration in game days for each phase.
 */
export const PHASE_DURATIONS_DAYS = Object.freeze({
  [CRISIS_PHASE.START]: 4,
  [CRISIS_PHASE.MID]: 7,
  [CRISIS_PHASE.END]: 4,
});

/**
 * Structure of a single region's dynamic state.
 * @typedef {Object} RegionStateRecord
 * @property {number} regionIndex
 * @property {string} regionName
 * @property {string} crisis
 * @property {string} phase
 * @property {number} phaseDaysRemaining
 * @property {number} tension - Political tension scalar (0..100)
 */

/**
 * Creates default peaceful state for a region.
 * @param {number} regionIndex
 * @returns {RegionStateRecord}
 */
export function createDefaultRegionState(regionIndex) {
  const name = REGION_NAMES[regionIndex] || `Region_${regionIndex}`;
  return {
    regionIndex,
    regionName: name,
    crisis: CRISIS_TYPE.PEACE,
    phase: CRISIS_PHASE.NONE,
    phaseDaysRemaining: 0,
    tension: 10,
  };
}

/**
 * Returns current region states dictionary from director state.
 * @returns {Record<number, RegionStateRecord>}
 */
export function getRegionStates() {
  const root = getLivingDirectorState();
  if (!root.subsystems.regions || typeof root.subsystems.regions !== 'object') {
    root.subsystems.regions = {};
  }
  return root.subsystems.regions;
}

/**
 * Returns state for a specific region by index (0..61), auto-initializing if missing.
 * @param {number} regionIndex
 * @returns {RegionStateRecord}
 */
export function getRegionState(regionIndex) {
  if (regionIndex < 0 || regionIndex >= BAY_REGION_COUNT) {
    return createDefaultRegionState(Math.max(0, regionIndex || 0));
  }
  const dict = getRegionStates();
  if (!dict[regionIndex]) {
    dict[regionIndex] = createDefaultRegionState(regionIndex);
  }
  return dict[regionIndex];
}

/**
 * Whether the specified region is currently in active peak quarantine (PLAGUE.MID).
 * @param {number} regionIndex
 * @returns {boolean}
 */
export function isRegionInQuarantine(regionIndex) {
  const tier = Number(LivingTamrielConfig.quarantine);
  if (tier === PRESENCE.OFF) return false;
  const state = getRegionState(regionIndex);
  return state.crisis === CRISIS_TYPE.PLAGUE && state.phase === CRISIS_PHASE.MID;
}

/**
 * Whether the specified region is in active military conflict (WAR.MID or CIVIL_STRIFE.MID).
 * @param {number} regionIndex
 * @returns {boolean}
 */
export function isRegionInSkirmishPhase(regionIndex) {
  const tier = Number(LivingTamrielConfig.political);
  if (tier === PRESENCE.OFF) return false;
  const state = getRegionState(regionIndex);
  const isConflict = state.crisis === CRISIS_TYPE.WAR || state.crisis === CRISIS_TYPE.CIVIL_STRIFE;
  return isConflict && state.phase === CRISIS_PHASE.MID;
}

/**
 * Manually trigger or set a crisis on a region (used by quests, bounties, or random rolls).
 * @param {number} regionIndex
 * @param {string} crisisType
 * @param {string} [startPhase]
 */
export function setRegionCrisis(regionIndex, crisisType, startPhase = CRISIS_PHASE.START) {
  const state = getRegionState(regionIndex);
  state.crisis = crisisType;
  state.phase = startPhase;
  state.phaseDaysRemaining = PHASE_DURATIONS_DAYS[startPhase] || 5;
  if (crisisType === CRISIS_TYPE.WAR || crisisType === CRISIS_TYPE.CIVIL_STRIFE) {
    state.tension = Math.min(100, state.tension + 35);
  } else if (crisisType === CRISIS_TYPE.PLAGUE) {
    state.tension = Math.min(100, state.tension + 20);
  }
}

/**
 * Advance a region's crisis lifecycle by one day.
 * @param {RegionStateRecord} state
 * @param {() => number} [rng]
 */
export function tickRegionDay(state, rng = Math.random) {
  if (state.crisis === CRISIS_TYPE.PEACE || state.phase === CRISIS_PHASE.NONE) {
    // Small chance to initiate a crisis if tension is elevated
    if (LivingTamrielConfig.political > PRESENCE.OFF && rng() < 0.02) {
      const roll = rng();
      const nextCrisis = roll < 0.4 ? CRISIS_TYPE.WAR : roll < 0.7 ? CRISIS_TYPE.PLAGUE : CRISIS_TYPE.FAMINE;
      setRegionCrisis(state.regionIndex, nextCrisis, CRISIS_PHASE.START);
    }
    return;
  }

  state.phaseDaysRemaining--;
  if (state.phaseDaysRemaining <= 0) {
    // Transition through START -> MID -> END -> PEACE
    if (state.phase === CRISIS_PHASE.START) {
      state.phase = CRISIS_PHASE.MID;
      state.phaseDaysRemaining = PHASE_DURATIONS_DAYS[CRISIS_PHASE.MID];
    } else if (state.phase === CRISIS_PHASE.MID) {
      state.phase = CRISIS_PHASE.END;
      state.phaseDaysRemaining = PHASE_DURATIONS_DAYS[CRISIS_PHASE.END];
    } else {
      // Crisis ended
      state.crisis = CRISIS_TYPE.PEACE;
      state.phase = CRISIS_PHASE.NONE;
      state.phaseDaysRemaining = 0;
      state.tension = Math.max(5, state.tension - 25);
    }
  }
}

/**
 * Daily tick for all 62 regions, called by LivingDirector upon day boundaries.
 * @param {() => number} [rng]
 */
export function tickAllRegions(rng = Math.random) {
  for (let i = 0; i < BAY_REGION_COUNT; i++) {
    tickRegionDay(getRegionState(i), rng);
  }
}

