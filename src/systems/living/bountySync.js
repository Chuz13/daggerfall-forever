// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// BOUNTY SYNC (Living Tamriel)
//
// Pure adapter between the town Bounty Boards (systems/bounty/bountyBoard.js) and the regional
// crisis state: the wilderness/dungeon contract mix, reward multipliers, and the effect of a
// completed contract on the region. It owns no board state and writes nothing to the save.
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE, isLivingBountyScalingEnabled } from './livingConfig.js';
import {
  getRegionState,
  CRISIS_PHASE,
  PHASE_DURATIONS_DAYS,
  CRISIS_TYPE,
  hasRegionCrisis,
  applyPlayerCrisisImpact,
  getBoundRegionConditions,
} from './regionState.js';

export const CONTRACT_KIND = Object.freeze({ WILDERNESS: 'WILDERNESS', DUNGEON: 'DUNGEON', FORT: 'FORT' });

/**
 * Whether Living Tamriel bounty reward scaling is active in the current session.
 * Returns false in isolated unit tests where LivingDirector / resetLivingConfig was never initialized,
 * preserving deterministic vanilla board calculations.
 */
export function isLivingBountyScalingActive() {
  return isLivingBountyScalingEnabled();
}

/** Allowed multiplier bands (spec): wilderness x3-x5, dungeon bosses x5-x10. */
export const WILD_MULT_RANGE = Object.freeze([3, 5]);
export const DUNGEON_MULT_RANGE = Object.freeze([5, 10]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Rolls the kind of a contract by the configured weight (default 70% wilderness).
 * @param {() => number} [rng]
 */
export function rollContractKind(rng = Math.random) {
  const w = clamp(Number(LivingTamrielConfig.bountyWildernessWeight), 0, 1);
  return rng() < w ? CONTRACT_KIND.WILDERNESS : CONTRACT_KIND.DUNGEON;
}

/** The reward multiplier for a kind, clamped to the spec band. 1 when bounties are OFF. */
export function rewardMultiplier(kind) {
  if (Number(LivingTamrielConfig.bounties) === PRESENCE.OFF) return 1;
  return kind === CONTRACT_KIND.DUNGEON
    ? clamp(LivingTamrielConfig.bountyRewardDungeonMult, ...DUNGEON_MULT_RANGE)
    : clamp(LivingTamrielConfig.bountyRewardWildMult, ...WILD_MULT_RANGE);
}

/**
 * Scales a base purse (gold) for a contract kind.
 * @param {number} baseGold
 * @param {string} kind CONTRACT_KIND
 */
export const scaledReward = (baseGold, kind) => Math.round(Math.max(0, baseGold) * rewardMultiplier(kind));

/** Tension a completed contract removes from its region. */
export const CONTRACT_TENSION_RELIEF = 5;
/** Fort assault contracts remove significantly more tension from an afflicted region. */
export const FORT_CONTRACT_TENSION_RELIEF = 15;

/**
 * Checks whether a region currently has an active crisis eligible for a Fort / Outpost assault bounty
 * (WAR, CIVIL_STRIFE, or PLAGUE).
 * @param {number|null} regionIndex
 * @returns {string|null} The active crisis type or null
 */
export function getRegionFortCrisis(regionIndex) {
  if (regionIndex == null || !Number.isInteger(regionIndex) || regionIndex < 0) return null;
  for (const c of [CRISIS_TYPE.WAR, CRISIS_TYPE.CIVIL_STRIFE, CRISIS_TYPE.PLAGUE]) {
    if (hasRegionCrisis(regionIndex, c)) return c;
  }
  return null;
}

/**
 * A completed contract eases the region: tension down, and an active crisis moves one step
 * toward its END phase once the tension has been worn down.
 * @param {number} regionIndex
 * @param {string|null} [contractKind]
 * @returns {{ tension:number, phase:string }}
 */
export function onContractCompleted(regionIndex, contractKind = null, playerEntity = null) {
  const isFort = contractKind === CONTRACT_KIND.FORT || contractKind === 'FORT';
  const relief = isFort ? FORT_CONTRACT_TENSION_RELIEF : CONTRACT_TENSION_RELIEF;
  if (playerEntity?.regionConditions || getBoundRegionConditions()) {
    applyPlayerCrisisImpact(regionIndex, {
      stance: 'defenders',
      degree: isFort ? 'TRIUMPH' : 'SUCCESS',
      category: 'WAR',
      playerEntity,
    });
  }
  const st = getRegionState(regionIndex);
  st.tension = Math.max(0, st.tension - relief);
  const step = isFort ? 2 : 1;
  if (st.phase === CRISIS_PHASE.START || st.phase === CRISIS_PHASE.MID) {
    st.phaseDaysRemaining = Math.max(1, st.phaseDaysRemaining - step); // the crisis timer runs toward END
  } else if (st.phase === CRISIS_PHASE.END) {
    st.phaseDaysRemaining = Math.max(1, Math.min(st.phaseDaysRemaining, PHASE_DURATIONS_DAYS[CRISIS_PHASE.END]) - step);
  }
  return { tension: st.tension, phase: st.phase };
}

