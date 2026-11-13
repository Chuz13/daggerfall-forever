// ═══════════════════════════════════════════════════════════════════════════════
// REGIONAL STATE ENGINE (Living Tamriel)
//
// Manages dynamic political, crisis, and epidemiological states across all
// 62 regions of Tamriel. Ticks daily via advanceWorldMinutes(1440).
// ═══════════════════════════════════════════════════════════════════════════════

import { BAY_REGION_COUNT, REGION_NAMES, regionOfTheatre } from '../../formats/mapsTables.js';
import { inBay } from '../../world/tamriel/tamrielFrame.js';
import { theatreAt } from '../../world/worldWide/worldGrid.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';
import { FACTION_TYPES } from '../../formats/factionFile.js';
import { changePower, THE_THIEVES_GUILD, THE_DARK_BROTHERHOOD } from '../faction/factionRep.js';
import { MERCHANTS_FACTION_ID } from '../guild/guilds.js';
import {
  REGION_FLAGS,
  FLAGS_TO_FLAGS2,
  turnOnConditionFlag,
  turnOffConditionFlag,
} from '../region/regionConditions.js';
import { getEffectiveRegionTempleId } from '../region/regionPower.js';
import { findFactionByTypeAndRegion } from '../talk/talk.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getLivingDirectorState } from './livingDirector.js';

export const TOTAL_REGION_COUNT = REGION_NAMES.length;

let _boundRegionConditions = null;
let _boundFactionRep = null;

/**
 * Binds the active player's vanilla `regionConditions` and `factionRep` stores
 * so Living Tamriel derives regional crises and stages directly from the vanilla simulation.
 * @param {Array<Object>|null} regionConditions
 * @param {Object|null} [factionRep]
 */
export function bindLivingRegionConditions(regionConditions, factionRep = undefined) {
  _boundRegionConditions = Array.isArray(regionConditions) ? regionConditions : null;
  if (factionRep !== undefined) {
    _boundFactionRep = factionRep;
  }
}

export function getBoundRegionConditions() {
  return _boundRegionConditions;
}

export function getBoundFactionRep() {
  return _boundFactionRep;
}

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
 * Synchronizes a Living Tamriel `RegionStateRecord` directly from a vanilla
 * `regionConditions[regionIndex]` record (`flags` + `values`).
 *
 * Maps the 26 vanilla `REGION_FLAGS` into `WAR`, `PLAGUE`, `FAMINE`, `CIVIL_STRIFE`
 * and phases `START` (`Beginning`), `MID` (`Ongoing`/active peak), `END` (`Ending`/`Won`/`Lost`).
 *
 * @param {number} regionIndex
 * @param {RegionStateRecord} state
 * @param {Object} condRecord
 */
export function syncRegionStateFromVanilla(regionIndex, state, condRecord) {
  if (!state || !condRecord || !Array.isArray(condRecord.flags)) return;
  const f = condRecord.flags;
  const v = condRecord.values || [];
  const valOf = (flagId, fallback = 3) => Math.max(1, Number(v[flagId]) || fallback);

  const nextCrises = {};

  // 1. WAR (flags 0..3)
  if (f[REGION_FLAGS.WarOngoing]) {
    nextCrises[CRISIS_TYPE.WAR] = {
      phase: CRISIS_PHASE.MID,
      phaseDaysRemaining: valOf(REGION_FLAGS.WarOngoing, 5),
      flagId: REGION_FLAGS.WarOngoing,
    };
  } else if (f[REGION_FLAGS.WarBeginning]) {
    nextCrises[CRISIS_TYPE.WAR] = {
      phase: CRISIS_PHASE.START,
      phaseDaysRemaining: valOf(REGION_FLAGS.WarBeginning, 3),
      flagId: REGION_FLAGS.WarBeginning,
    };
  } else if (f[REGION_FLAGS.WarWon] || f[REGION_FLAGS.WarLost]) {
    const endFlag = f[REGION_FLAGS.WarWon] ? REGION_FLAGS.WarWon : REGION_FLAGS.WarLost;
    nextCrises[CRISIS_TYPE.WAR] = {
      phase: CRISIS_PHASE.END,
      phaseDaysRemaining: valOf(endFlag, 2),
      flagId: endFlag,
    };
  }

  // 2. PLAGUE (flags 4..6)
  if (f[REGION_FLAGS.PlagueOngoing]) {
    nextCrises[CRISIS_TYPE.PLAGUE] = {
      phase: CRISIS_PHASE.MID,
      phaseDaysRemaining: valOf(REGION_FLAGS.PlagueOngoing, 5),
      flagId: REGION_FLAGS.PlagueOngoing,
    };
  } else if (f[REGION_FLAGS.PlagueBeginning]) {
    nextCrises[CRISIS_TYPE.PLAGUE] = {
      phase: CRISIS_PHASE.START,
      phaseDaysRemaining: valOf(REGION_FLAGS.PlagueBeginning, 3),
      flagId: REGION_FLAGS.PlagueBeginning,
    };
  } else if (f[REGION_FLAGS.PlagueEnding]) {
    nextCrises[CRISIS_TYPE.PLAGUE] = {
      phase: CRISIS_PHASE.END,
      phaseDaysRemaining: valOf(REGION_FLAGS.PlagueEnding, 2),
      flagId: REGION_FLAGS.PlagueEnding,
    };
  }

  // 3. FAMINE (flags 7..9, plus BadHarvest 13 as precursor)
  if (f[REGION_FLAGS.FamineOngoing]) {
    nextCrises[CRISIS_TYPE.FAMINE] = {
      phase: CRISIS_PHASE.MID,
      phaseDaysRemaining: valOf(REGION_FLAGS.FamineOngoing, 5),
      flagId: REGION_FLAGS.FamineOngoing,
    };
  } else if (f[REGION_FLAGS.FamineBeginning] || f[REGION_FLAGS.BadHarvest]) {
    const startFlag = f[REGION_FLAGS.FamineBeginning] ? REGION_FLAGS.FamineBeginning : REGION_FLAGS.BadHarvest;
    nextCrises[CRISIS_TYPE.FAMINE] = {
      phase: CRISIS_PHASE.START,
      phaseDaysRemaining: valOf(startFlag, 3),
      flagId: startFlag,
    };
  } else if (f[REGION_FLAGS.FamineEnding]) {
    nextCrises[CRISIS_TYPE.FAMINE] = {
      phase: CRISIS_PHASE.END,
      phaseDaysRemaining: valOf(REGION_FLAGS.FamineEnding, 2),
      flagId: REGION_FLAGS.FamineEnding,
    };
  }

  // 4. CIVIL_STRIFE (CrimeWave 11, WitchBurnings 10, PersecutedTemple 18, MadWizardNearby 24,
  //    NewRuler 12, TGMInJail 14, PricesHigh 19, TGMSetFree 15, TGMExecuted 16, NewTGM 17, MadWizardDies 25)
  const midStrifeFlags = [
    REGION_FLAGS.CrimeWave,
    REGION_FLAGS.WitchBurnings,
    REGION_FLAGS.PersecutedTemple,
    REGION_FLAGS.MadWizardNearby,
  ];
  const startStrifeFlags = [
    REGION_FLAGS.NewRuler,
    REGION_FLAGS.TGMInJail,
    REGION_FLAGS.PricesHigh,
  ];
  const endStrifeFlags = [
    REGION_FLAGS.TGMSetFree,
    REGION_FLAGS.TGMExecuted,
    REGION_FLAGS.NewTGM,
    REGION_FLAGS.MadWizardDies,
  ];

  const activeMidStrife = midStrifeFlags.find((id) => Boolean(f[id]));
  const activeStartStrife = startStrifeFlags.find((id) => Boolean(f[id]));
  const activeEndStrife = endStrifeFlags.find((id) => Boolean(f[id]));

  if (activeMidStrife !== undefined) {
    nextCrises[CRISIS_TYPE.CIVIL_STRIFE] = {
      phase: CRISIS_PHASE.MID,
      phaseDaysRemaining: valOf(activeMidStrife, 4),
      flagId: activeMidStrife,
    };
  } else if (activeStartStrife !== undefined) {
    nextCrises[CRISIS_TYPE.CIVIL_STRIFE] = {
      phase: CRISIS_PHASE.START,
      phaseDaysRemaining: valOf(activeStartStrife, 3),
      flagId: activeStartStrife,
    };
  } else if (activeEndStrife !== undefined) {
    nextCrises[CRISIS_TYPE.CIVIL_STRIFE] = {
      phase: CRISIS_PHASE.END,
      phaseDaysRemaining: valOf(activeEndStrife, 2),
      flagId: activeEndStrife,
    };
  }

  state.crises = nextCrises;
  state.crisis = null;
  _syncPrimaryCrisis(state);

  // ── Calculate regional tension dynamically from vanilla faction state and flags ──
  const fRep = _boundFactionRep;
  const dict = fRep?.dict ?? fRep?.FactionDict;
  const prov = dict ? findFactionByTypeAndRegion(dict, FACTION_TYPES.Province, regionIndex) : null;

  let baseInstability = 10;
  let rulerRelief = 0;
  let diplomaticTension = 0;

  if (prov) {
    const power = Number(prov.power ?? 50);
    baseInstability = Math.max(5, Math.min(50, Math.trunc((100 - power) * 0.5)));
    rulerRelief = Math.min(15, Math.trunc((Number(prov.rulerPowerBonus ?? 0)) * 0.25));

    let allyP = 0;
    for (const id of [prov.ally1, prov.ally2, prov.ally3]) {
      if (id) allyP += dict.get?.(id)?.power ?? 0;
    }
    let enemyP = 0;
    for (const id of [prov.enemy1, prov.enemy2, prov.enemy3]) {
      if (id) enemyP += dict.get?.(id)?.power ?? 0;
    }
    diplomaticTension = Math.max(0, Math.min(20, Math.trunc((enemyP - allyP) / 10)));
  }

  let flagTension = 0;
  if (f[REGION_FLAGS.WarOngoing]) flagTension += 40;
  else if (f[REGION_FLAGS.WarBeginning]) flagTension += 20;
  else if (f[REGION_FLAGS.WarLost]) flagTension += 25;

  if (f[REGION_FLAGS.CivilWarOngoing]) flagTension += 35;
  else if (f[REGION_FLAGS.CivilWarBeginning]) flagTension += 20;

  if (f[REGION_FLAGS.PlagueOngoing]) flagTension += 30;
  else if (f[REGION_FLAGS.PlagueBeginning]) flagTension += 15;

  if (f[REGION_FLAGS.FamineOngoing]) flagTension += 25;
  else if (f[REGION_FLAGS.FamineBeginning]) flagTension += 12;

  if (f[REGION_FLAGS.CrimeWave]) flagTension += 15;
  if (f[REGION_FLAGS.WitchBurnings]) flagTension += 12;
  if (f[REGION_FLAGS.PersecutedTemple]) flagTension += 10;
  if (f[REGION_FLAGS.BadHarvest]) flagTension += 8;

  state.tension = Math.max(5, Math.min(100, Math.max(10, baseInstability - rulerRelief + diplomaticTension) + flagTension));
}

/**
 * Returns all active vanilla `REGION_FLAGS` in the given region with their names and endurance counters.
 * @param {number} regionIndex
 * @param {Array<Object>|null} [regionConditionsOverride]
 * @returns {Array<{ flagId: number, flagName: string, value: number }>}
 */
export function getActiveRegionFlags(regionIndex, regionConditionsOverride = null) {
  const rc = regionConditionsOverride ?? _boundRegionConditions;
  const rec = rc?.[regionIndex];
  if (!rec || !Array.isArray(rec.flags)) return [];
  const out = [];
  for (const [name, id] of Object.entries(REGION_FLAGS)) {
    if (id <= 25 && rec.flags[id]) {
      out.push({
        flagId: id,
        flagName: name,
        value: Number(rec.values?.[id] ?? 0),
      });
    }
  }
  return out;
}

/**
 * Returns state for a specific region by index (0..70), auto-initializing if missing.
 * Supports all 62 Iliac Bay regions and all 9 continental provinces of Tamriel.
 * When bound to vanilla `regionConditions` (and `ENABLE_LT_STANDALONE_SIM` is false),
 * automatically derives crisis types and phases from the vanilla simulation flags.
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
  const state = dict[regionIndex];
  if (!FORK_FLAGS.ENABLE_LT_STANDALONE_SIM && _boundRegionConditions?.[regionIndex]) {
    syncRegionStateFromVanilla(regionIndex, state, _boundRegionConditions[regionIndex]);
  }
  return state;
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

const CRISIS_TYPE_VANILLA_FLAG_GROUPS = Object.freeze({
  [CRISIS_TYPE.WAR]: [
    REGION_FLAGS.WarBeginning,
    REGION_FLAGS.WarOngoing,
    REGION_FLAGS.WarWon,
    REGION_FLAGS.WarLost,
  ],
  [CRISIS_TYPE.PLAGUE]: [
    REGION_FLAGS.PlagueBeginning,
    REGION_FLAGS.PlagueOngoing,
    REGION_FLAGS.PlagueEnding,
  ],
  [CRISIS_TYPE.FAMINE]: [
    REGION_FLAGS.BadHarvest,
    REGION_FLAGS.FamineBeginning,
    REGION_FLAGS.FamineOngoing,
    REGION_FLAGS.FamineEnding,
  ],
  [CRISIS_TYPE.CIVIL_STRIFE]: [
    REGION_FLAGS.WitchBurnings,
    REGION_FLAGS.CrimeWave,
    REGION_FLAGS.NewRuler,
    REGION_FLAGS.TGMInJail,
    REGION_FLAGS.TGMSetFree,
    REGION_FLAGS.TGMExecuted,
    REGION_FLAGS.NewTGM,
    REGION_FLAGS.PersecutedTemple,
    REGION_FLAGS.PricesHigh,
    REGION_FLAGS.MadWizardNearby,
    REGION_FLAGS.MadWizardDies,
  ],
});

const CRISIS_PHASE_TO_VANILLA_FLAG = Object.freeze({
  [CRISIS_TYPE.WAR]: {
    [CRISIS_PHASE.START]: REGION_FLAGS.WarBeginning,
    [CRISIS_PHASE.MID]: REGION_FLAGS.WarOngoing,
    [CRISIS_PHASE.END]: REGION_FLAGS.WarWon,
  },
  [CRISIS_TYPE.PLAGUE]: {
    [CRISIS_PHASE.START]: REGION_FLAGS.PlagueBeginning,
    [CRISIS_PHASE.MID]: REGION_FLAGS.PlagueOngoing,
    [CRISIS_PHASE.END]: REGION_FLAGS.PlagueEnding,
  },
  [CRISIS_TYPE.FAMINE]: {
    [CRISIS_PHASE.START]: REGION_FLAGS.FamineBeginning,
    [CRISIS_PHASE.MID]: REGION_FLAGS.FamineOngoing,
    [CRISIS_PHASE.END]: REGION_FLAGS.FamineEnding,
  },
  [CRISIS_TYPE.CIVIL_STRIFE]: {
    [CRISIS_PHASE.START]: REGION_FLAGS.NewRuler,
    [CRISIS_PHASE.MID]: REGION_FLAGS.CrimeWave,
    [CRISIS_PHASE.END]: REGION_FLAGS.TGMSetFree,
  },
});

function _syncVanillaConditionsFromSet(regionIndex, crisisType, startPhase, days) {
  const cond = _boundRegionConditions?.[regionIndex];
  if (!cond || !Array.isArray(cond.flags)) return;

  if (crisisType === CRISIS_TYPE.PEACE) {
    for (const group of Object.values(CRISIS_TYPE_VANILLA_FLAG_GROUPS)) {
      for (const fid of group) {
        if (cond.flags[fid]) turnOffConditionFlag(_boundRegionConditions, regionIndex, fid);
      }
    }
    return;
  }

  const group = CRISIS_TYPE_VANILLA_FLAG_GROUPS[crisisType];
  if (!group) return;
  for (const fid of group) {
    if (cond.flags[fid]) turnOffConditionFlag(_boundRegionConditions, regionIndex, fid);
  }
  if (startPhase === CRISIS_PHASE.NONE) return;

  const targetFlag = CRISIS_PHASE_TO_VANILLA_FLAG[crisisType]?.[startPhase];
  if (targetFlag !== undefined) {
    turnOnConditionFlag(_boundRegionConditions, regionIndex, targetFlag);
    if (cond.values) {
      cond.values[targetFlag] = Math.max(1, Math.min(99, Number(days) || 3));
    }
  }
}

/**
 * Manually trigger or set a crisis on a region (used by quests, bounties, console, or fallback rolls).
 * When bound to vanilla `regionConditions`, also sets/clears the corresponding vanilla flags.
 * @param {number} regionIndex
 * @param {string} crisisType
 * @param {string} [startPhase]
 * @param {number} [daysRemaining]
 */
export function setRegionCrisis(regionIndex, crisisType, startPhase = CRISIS_PHASE.START, daysRemaining = null) {
  const days = daysRemaining ?? (PHASE_DURATIONS_DAYS[startPhase] || 5);
  if (_boundRegionConditions?.[regionIndex]) {
    _syncVanillaConditionsFromSet(regionIndex, crisisType, startPhase, days);
  }

  const dict = getRegionStates();
  if (!dict[regionIndex]) {
    dict[regionIndex] = createDefaultRegionState(regionIndex);
  }
  const state = dict[regionIndex];
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
    if (state.crisis === crisisType) state.crisis = null;
    _syncPrimaryCrisis(state);
    return;
  }
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

const VANILLA_NEXT_STAGE_FLAG = Object.freeze({
  [REGION_FLAGS.WarBeginning]: REGION_FLAGS.WarOngoing,
  [REGION_FLAGS.WarOngoing]: REGION_FLAGS.WarWon,
  [REGION_FLAGS.PlagueBeginning]: REGION_FLAGS.PlagueOngoing,
  [REGION_FLAGS.PlagueOngoing]: REGION_FLAGS.PlagueEnding,
  [REGION_FLAGS.BadHarvest]: null, // Prevented from escalating into famine!
  [REGION_FLAGS.FamineBeginning]: REGION_FLAGS.FamineOngoing,
  [REGION_FLAGS.FamineOngoing]: REGION_FLAGS.FamineEnding,
  [REGION_FLAGS.TGMInJail]: REGION_FLAGS.TGMSetFree,
  [REGION_FLAGS.TGMSetFree]: REGION_FLAGS.NewTGM,
  [REGION_FLAGS.TGMExecuted]: REGION_FLAGS.NewTGM,
  [REGION_FLAGS.MadWizardNearby]: REGION_FLAGS.MadWizardDies,
});

/**
 * Translates player encounter outcomes and completed crisis contracts into:
 *  1. Vanilla `faction.power` nudges (`changePower` on Province, Temple, WitchesCoven, Guilds, or Enemy).
 *  2. Vanilla `regionConditions[regionIndex].values[flagId]` endurance counter adjustments:
 *     - `defenders` / `peace`: decrements `values[flagId]` by 1 (or 2 on `TRIUMPH`),
 *       advancing the vanilla flag stage ONLY when `values[flagId]` reaches `0`.
 *     - `attackers`: increments `values[flagId]` by +1, prolonging the crisis stage.
 *
 * @param {number} regionIndex
 * @param {Object} [opts]
 * @param {'defenders'|'attackers'|'peace'|'neutral'} [opts.stance='defenders']
 * @param {string} [opts.degree='SUCCESS']
 * @param {string} [opts.category='WAR']
 * @param {any} [opts.playerEntity=null]
 * @param {() => number} [opts.rolls=Math.random]
 * @returns {{ flagId: number|null, newValue: number|null, transitionedTo: number|null, powerDelta: number }}
 */
export function applyPlayerCrisisImpact(
  regionIndex,
  {
    stance = 'defenders',
    degree = 'SUCCESS',
    category = 'WAR',
    playerEntity = null,
    rolls = Math.random,
  } = {},
) {
  if (!Number.isInteger(regionIndex) || regionIndex < 0 || regionIndex >= REGION_NAMES.length) {
    return { flagId: null, newValue: null, transitionedTo: null, powerDelta: 0 };
  }
  if (stance === 'neutral' || degree === 'FAILURE' || degree === 'CRITICAL_FAILURE') {
    return { flagId: null, newValue: null, transitionedTo: null, powerDelta: 0 };
  }

  const rc = playerEntity?.regionConditions ?? _boundRegionConditions;
  const fRep = playerEntity?.factionRep ?? _boundFactionRep;
  const isTriumph = degree === 'TRIUMPH';
  const step = isTriumph ? 2 : 1;
  let powerDelta = 0;

  // 1. Nudge vanilla faction power
  if (fRep && fRep.dict) {
    const prov = findFactionByTypeAndRegion(fRep.dict, FACTION_TYPES.Province, regionIndex);
    const provId = prov?.id ?? 0;
    const templeId = getEffectiveRegionTempleId(regionIndex);
    const coven = findFactionByTypeAndRegion(fRep.dict, FACTION_TYPES.WitchesCoven, regionIndex);
    const covenId = coven?.id ?? 0;

    if (stance === 'defenders' || stance === 'peace') {
      if (provId > 0) {
        changePower(fRep, provId, step);
        powerDelta += step;
      }
      if ((category === 'PLAGUE' || category === 'FAITH') && templeId > 0) {
        changePower(fRep, templeId, 1);
      }
      if (category === 'COMMERCE') {
        changePower(fRep, MERCHANTS_FACTION_ID, 1);
      }
    } else if (stance === 'attackers') {
      if (provId > 0) {
        changePower(fRep, provId, -1);
        powerDelta -= 1;
        if (category === 'WAR' && prov && prov.enemy1 > 0) {
          changePower(fRep, prov.enemy1, 1);
        }
      }
      if (category === 'CRIME') {
        changePower(fRep, THE_THIEVES_GUILD, 1);
        changePower(fRep, THE_DARK_BROTHERHOOD, 1);
      } else if (category === 'OCCULT' && covenId > 0) {
        changePower(fRep, covenId, 1);
      }
    }
  }

  // 2. Nudge vanilla regionConditions[regionIndex].values[flagId] endurance counter
  const cond = rc?.[regionIndex];
  let targetFlagId = null;
  let newValue = null;
  let transitionedTo = null;

  if (cond && Array.isArray(cond.flags) && cond.values) {
    const priorityFlags = [
      REGION_FLAGS.WarOngoing,
      REGION_FLAGS.WarBeginning,
      REGION_FLAGS.WarWon,
      REGION_FLAGS.WarLost,
      REGION_FLAGS.PlagueOngoing,
      REGION_FLAGS.PlagueBeginning,
      REGION_FLAGS.PlagueEnding,
      REGION_FLAGS.FamineOngoing,
      REGION_FLAGS.FamineBeginning,
      REGION_FLAGS.BadHarvest,
      REGION_FLAGS.FamineEnding,
      REGION_FLAGS.CrimeWave,
      REGION_FLAGS.WitchBurnings,
      REGION_FLAGS.PersecutedTemple,
      REGION_FLAGS.MadWizardNearby,
      REGION_FLAGS.TGMInJail,
      REGION_FLAGS.NewRuler,
      REGION_FLAGS.PricesHigh,
      REGION_FLAGS.TGMSetFree,
      REGION_FLAGS.TGMExecuted,
      REGION_FLAGS.NewTGM,
      REGION_FLAGS.MadWizardDies,
    ];
    for (const fid of priorityFlags) {
      if (cond.flags[fid]) {
        targetFlagId = fid;
        break;
      }
    }

    if (targetFlagId !== null) {
      const curVal = Math.max(1, Number(cond.values[targetFlagId]) || 2);
      if (stance === 'defenders' || stance === 'peace') {
        const nextVal = curVal - step;
        if (nextVal <= 0) {
          turnOffConditionFlag(rc, regionIndex, targetFlagId);
          const nextStageFlag = VANILLA_NEXT_STAGE_FLAG[targetFlagId];
          if (nextStageFlag !== undefined && nextStageFlag !== null) {
            turnOnConditionFlag(rc, regionIndex, nextStageFlag, rolls);
            cond.values[nextStageFlag] = Math.max(2, Number(cond.values[nextStageFlag]) || 3);
            transitionedTo = nextStageFlag;
            newValue = cond.values[nextStageFlag];
          } else {
            newValue = 0;
          }
        } else {
          cond.values[targetFlagId] = nextVal;
          newValue = nextVal;
        }
      } else if (stance === 'attackers') {
        cond.values[targetFlagId] = Math.min(99, curVal + 1);
        newValue = cond.values[targetFlagId];
      }
    }
  }

  // 3. Also update the in-memory RegionStateRecord (and sync from vanilla if bound)
  const dict = getRegionStates();
  const state = dict[regionIndex] || createDefaultRegionState(regionIndex);
  dict[regionIndex] = state;
  if (!FORK_FLAGS.ENABLE_LT_STANDALONE_SIM && cond) {
    syncRegionStateFromVanilla(regionIndex, state, cond);
  } else if (state.crises && state.crisis && state.crises[state.crisis]) {
    const rec = state.crises[state.crisis];
    if (stance === 'defenders' || stance === 'peace') {
      rec.phaseDaysRemaining = (rec.phaseDaysRemaining ?? 3) - step;
      if (rec.phaseDaysRemaining <= 0) {
        if (rec.phase === CRISIS_PHASE.START) {
          rec.phase = CRISIS_PHASE.MID;
          rec.phaseDaysRemaining = PHASE_DURATIONS_DAYS[CRISIS_PHASE.MID];
        } else if (rec.phase === CRISIS_PHASE.MID) {
          rec.phase = CRISIS_PHASE.END;
          rec.phaseDaysRemaining = PHASE_DURATIONS_DAYS[CRISIS_PHASE.END];
        } else {
          delete state.crises[state.crisis];
          state.crisis = null;
        }
      }
    } else if (stance === 'attackers') {
      rec.phaseDaysRemaining = (rec.phaseDaysRemaining ?? 3) + 1;
    }
    _syncPrimaryCrisis(state);
  }

  return { flagId: targetFlagId, newValue, transitionedTo, powerDelta };
}

/**
 * Advance a region's crisis lifecycle by one day.
 * When `FORK_FLAGS.ENABLE_LT_STANDALONE_SIM` is false and vanilla `regionConditions`
 * is bound, synchronizes directly from vanilla `regionConditions` without running
 * the standalone random crisis generator.
 * @param {RegionStateRecord} state
 * @param {() => number} [rng]
 */
export function tickRegionDay(state, rng = Math.random) {
  if (!FORK_FLAGS.ENABLE_LT_STANDALONE_SIM && _boundRegionConditions?.[state?.regionIndex]) {
    syncRegionStateFromVanilla(state.regionIndex, state, _boundRegionConditions[state.regionIndex]);
    return;
  }

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
    // Legacy standalone generator (gated behind FORK_FLAGS.ENABLE_LT_STANDALONE_SIM in live play)
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

