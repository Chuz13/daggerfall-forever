// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// REGIONAL STATE ENGINE (Living Tamriel)
//
// Manages dynamic political, crisis, and epidemiological states across all
// 62 regions of Tamriel. Ticks daily via advanceWorldMinutes(1440).
// ═══════════════════════════════════════════════════════════════════════════════

import { BAY_REGION_COUNT, REGION_NAMES, regionOfTheatre } from '../../formats/mapsTables.js';
import { inBay } from '../../world/tamriel/tamrielFrame.js';
import { theatreAt } from '../../world/worldWide/worldGrid.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getLivingDirectorState } from './livingDirector.js';

export const TOTAL_REGION_COUNT = REGION_NAMES.length;

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
    crises: {},
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
 * Returns state for a specific region by index (0..70), auto-initializing if missing.
 * Supports all 62 Iliac Bay regions and all 9 continental provinces of Tamriel.
 * @param {number} regionIndex
 * @returns {RegionStateRecord}
 */
export function getRegionState(regionIndex) {
  if (!Number.isInteger(regionIndex) || regionIndex < 0 || regionIndex >= REGION_NAMES.length) {
    return createDefaultRegionState(0);
  }
  const dict = getRegionStates();
  if (!dict[regionIndex]) {
    dict[regionIndex] = createDefaultRegionState(regionIndex);
  }
  return dict[regionIndex];
}

/**
 * Resolves the region index for world map coordinates (px, py) across all of Tamriel.
 * @param {number} px
 * @param {number} py
 * @param {number} [defaultIndex=0]
 * @returns {number}
 */
export function getRegionIndexAt(px, py, defaultIndex = 0) {
  if (inBay(px, py)) {
    return defaultIndex; // Within Iliac Bay, callers use their local map/town region index
  }
  const th = theatreAt(px, py);
  if (th > 0) {
    const reg = regionOfTheatre(th);
    if (reg >= 0 && reg < REGION_NAMES.length) return reg;
  }
  return defaultIndex;
}

const CRISIS_PRIORITY = Object.freeze({
  [CRISIS_TYPE.WAR]: 4,
  [CRISIS_TYPE.CIVIL_STRIFE]: 3,
  [CRISIS_TYPE.PLAGUE]: 2,
  [CRISIS_TYPE.FAMINE]: 1,
});

/**
 * Synchronizes the legacy single `.crisis`, `.phase`, `.phaseDaysRemaining` properties
 * with the highest-priority entry in `state.crises`.
 * @param {RegionStateRecord} state
 */
function _syncPrimaryCrisis(state) {
  if (!state.crises || typeof state.crises !== 'object') {
    state.crises = {};
  }
  const entries = Object.entries(state.crises).filter(
    ([type, rec]) => rec && rec.phase !== CRISIS_PHASE.NONE && type !== CRISIS_TYPE.PEACE,
  );
  if (entries.length === 0) {
    state.crisis = CRISIS_TYPE.PEACE;
    state.phase = CRISIS_PHASE.NONE;
    state.phaseDaysRemaining = 0;
    return;
  }
  if (state.crisis && state.crises[state.crisis] && state.crises[state.crisis].phase !== CRISIS_PHASE.NONE) {
    state.phase = state.crises[state.crisis].phase;
    state.phaseDaysRemaining = state.crises[state.crisis].phaseDaysRemaining ?? 0;
    return;
  }
  entries.sort(([typeA], [typeB]) => (CRISIS_PRIORITY[typeB] || 0) - (CRISIS_PRIORITY[typeA] || 0));
  const [topType, topRec] = entries[0];
  state.crisis = topType;
  state.phase = topRec.phase;
  state.phaseDaysRemaining = topRec.phaseDaysRemaining ?? 0;
}

/**
 * Returns all active crises in the region as an array of objects.
 * @param {number} regionIndex
 * @returns {Array<{ type: string, phase: string, phaseDaysRemaining: number }>}
 */
export function getActiveCrises(regionIndex) {
  const state = getRegionState(regionIndex);
  if (!state) return [];
  if (!state.crises || typeof state.crises !== 'object') {
    state.crises = {};
  }
  const list = [];
  for (const [type, rec] of Object.entries(state.crises)) {
    if (rec && rec.phase !== CRISIS_PHASE.NONE && type !== CRISIS_TYPE.PEACE) {
      list.push({
        type,
        phase: rec.phase,
        phaseDaysRemaining: rec.phaseDaysRemaining ?? 0,
      });
    }
  }
  if (list.length === 0 && state.crisis && state.crisis !== CRISIS_TYPE.PEACE && state.phase !== CRISIS_PHASE.NONE) {
    list.push({
      type: state.crisis,
      phase: state.phase,
      phaseDaysRemaining: state.phaseDaysRemaining ?? 0,
    });
  }
  return list;
}

/**
 * Checks whether a region currently has an active crisis of a specific type.
 * @param {number} regionIndex
 * @param {string} crisisType
 * @param {string} [matchingPhase]
 * @returns {boolean}
 */
export function hasRegionCrisis(regionIndex, crisisType, matchingPhase = null) {
  const state = getRegionState(regionIndex);
  if (!state) return false;
  if (state.crises && state.crises[crisisType]) {
    const rec = state.crises[crisisType];
    if (rec.phase && rec.phase !== CRISIS_PHASE.NONE) {
      return matchingPhase ? rec.phase === matchingPhase : true;
    }
  }
  if (state.crisis === crisisType && state.phase !== CRISIS_PHASE.NONE) {
    return matchingPhase ? state.phase === matchingPhase : true;
  }
  return false;
}

/**
 * Whether the specified region is currently in active peak quarantine (PLAGUE.MID).
 * @param {number} regionIndex
 * @returns {boolean}
 */
export function isRegionInQuarantine(regionIndex) {
  const tier = Number(LivingTamrielConfig.quarantine);
  if (tier === PRESENCE.OFF) return false;
  return hasRegionCrisis(regionIndex, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.MID);
}

/**
 * Whether the specified region is in active military conflict (WAR.MID or CIVIL_STRIFE.MID).
 * @param {number} regionIndex
 * @returns {boolean}
 */
export function isRegionInSkirmishPhase(regionIndex) {
  const tier = Number(LivingTamrielConfig.political);
  if (tier === PRESENCE.OFF) return false;
  return (
    hasRegionCrisis(regionIndex, CRISIS_TYPE.WAR, CRISIS_PHASE.MID) ||
    hasRegionCrisis(regionIndex, CRISIS_TYPE.CIVIL_STRIFE, CRISIS_PHASE.MID)
  );
}

/**
 * Manually trigger or set a crisis on a region (used by quests, bounties, or random rolls).
 * Supports simultaneous coexistence of one crisis per type.
 * @param {number} regionIndex
 * @param {string} crisisType
 * @param {string} [startPhase]
 * @param {number} [daysRemaining]
 */
export function setRegionCrisis(regionIndex, crisisType, startPhase = CRISIS_PHASE.START, daysRemaining = null) {
  const state = getRegionState(regionIndex);
  if (!state.crises || typeof state.crises !== 'object') {
    state.crises = {};
  }
  if (crisisType === CRISIS_TYPE.PEACE) {
    state.crises = {};
    state.crisis = CRISIS_TYPE.PEACE;
    state.phase = CRISIS_PHASE.NONE;
    state.phaseDaysRemaining = 0;
    state.tension = Math.max(5, (state.tension || 10) - 20);
    return;
  }
  if (startPhase === CRISIS_PHASE.NONE) {
    delete state.crises[crisisType];
    _syncPrimaryCrisis(state);
    return;
  }
  const days = daysRemaining ?? (PHASE_DURATIONS_DAYS[startPhase] || 5);
  state.crises[crisisType] = {
    phase: startPhase,
    phaseDaysRemaining: days,
  };
  state.crisis = crisisType;
  state.phase = startPhase;
  state.phaseDaysRemaining = days;
  if (crisisType === CRISIS_TYPE.WAR || crisisType === CRISIS_TYPE.CIVIL_STRIFE) {
    state.tension = Math.min(100, (state.tension || 10) + 35);
  } else if (crisisType === CRISIS_TYPE.PLAGUE) {
    state.tension = Math.min(100, (state.tension || 10) + 20);
  } else if (crisisType === CRISIS_TYPE.FAMINE) {
    state.tension = Math.min(100, (state.tension || 10) + 15);
  }
}

/**
 * Advance a region's crisis lifecycle by one day.
 * @param {RegionStateRecord} state
 * @param {() => number} [rng]
 */
export function tickRegionDay(state, rng = Math.random) {
  if (!state.crises || typeof state.crises !== 'object') {
    state.crises = {};
    if (state.crisis && state.crisis !== CRISIS_TYPE.PEACE && state.phase !== CRISIS_PHASE.NONE) {
      state.crises[state.crisis] = {
        phase: state.phase,
        phaseDaysRemaining: state.phaseDaysRemaining ?? 5,
      };
    }
  }

  const activeTypes = Object.keys(state.crises);
  if (activeTypes.length === 0) {
    // Chance to initiate a crisis scales with regional tension (base 1.5% + up to 15% at max tension)
    const outbreakChance = Math.min(0.25, 0.015 + Math.max(0, state.tension || 0) * 0.0015);
    if (LivingTamrielConfig.political > PRESENCE.OFF && rng() < outbreakChance) {
      const roll = rng();
      const nextCrisis =
        roll < 0.35
          ? CRISIS_TYPE.WAR
          : roll < 0.60
            ? CRISIS_TYPE.PLAGUE
            : roll < 0.85
              ? CRISIS_TYPE.FAMINE
              : CRISIS_TYPE.CIVIL_STRIFE;
      setRegionCrisis(state.regionIndex, nextCrisis, CRISIS_PHASE.START);
    }
    return;
  }

  for (const type of activeTypes) {
    const rec = state.crises[type];
    if (!rec) continue;
    rec.phaseDaysRemaining--;
    if (rec.phaseDaysRemaining <= 0) {
      if (rec.phase === CRISIS_PHASE.START) {
        rec.phase = CRISIS_PHASE.MID;
        rec.phaseDaysRemaining = PHASE_DURATIONS_DAYS[CRISIS_PHASE.MID];
      } else if (rec.phase === CRISIS_PHASE.MID) {
        rec.phase = CRISIS_PHASE.END;
        rec.phaseDaysRemaining = PHASE_DURATIONS_DAYS[CRISIS_PHASE.END];
      } else {
        delete state.crises[type];
        state.tension = Math.max(5, (state.tension || 10) - 20);
      }
    }
  }

  _syncPrimaryCrisis(state);
}

/**
 * Daily tick for all 71 regions across Tamriel, called by LivingDirector upon day boundaries.
 * @param {() => number} [rng]
 */
export function tickAllRegions(rng = Math.random) {
  for (let i = 0; i < REGION_NAMES.length; i++) {
    tickRegionDay(getRegionState(i), rng);
  }
}

