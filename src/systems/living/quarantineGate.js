// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// QUARANTINE GATE & OUTPOST CONTROLLER (Living Tamriel)
//
// Manages exterior city gate lockouts, cordons, and emergency relief posts
// during active regional plague outbreaks (PLAGUE.MID).
// ═══════════════════════════════════════════════════════════════════════════════

import { isRegionInQuarantine } from './regionState.js';
import { SKILLS } from '../skills.js';
import { resolveLivingRoll, computeRoleplayBribeMultiplier } from './livingRolls.js';

export const QUARANTINE_WARNING_TEXT = 'Quarantine in effect: City gates are sealed by decree of the magistrate.';

/**
 * Checks whether exterior city gates in the current region should be locked shut.
 * Overrides 24/7 city infrastructure settings while plague is at peak (PLAGUE.MID).
 *
 * @param {number|null} [regionIndex] Specific region index, or null to check active quarantine
 * @returns {boolean} True if gates are locked shut due to quarantine
 */
export function isCityGateQuarantined(regionIndex = null) {
  if (regionIndex === null || typeof regionIndex !== 'number') return false;
  return isRegionInQuarantine(regionIndex);
}

/**
 * Returns emergency relief services outside the walls (Safety Guard).
 * Allows curing disease/poison even when the city is locked down, with Mercantile/Medical discount.
 *
 * @param {number} regionIndex
 * @param {any} [playerEntity=null]
 */
export function getQuarantineReliefPostInfo(regionIndex, playerEntity = null) {
  if (!isRegionInQuarantine(regionIndex)) return null;
  const mult = playerEntity ? computeRoleplayBribeMultiplier(playerEntity, SKILLS.Medical) : 1.0;
  return {
    healerPresent: true,
    cureCostMultiplier: 2.0, // Higher cost due to emergency cordon supplies
    cureCostGold: Math.max(50, Math.round(100 * mult)),
    dialogue: 'Halt, traveler! The city within suffers pestilence. Stay without or seek aid at our field pavilion.',
  };
}

/**
 * Evaluates a roleplay skill/stat roll at a quarantined city gate or field cordon.
 * Supports 'medical' (Medical + Intelligence), 'etiquette' (Etiquette + Personality),
 * or 'stealth' (Stealth + Agility).
 *
 * @param {Object} params
 * @param {any} params.playerEntity
 * @param {'medical'|'etiquette'|'stealth'} [params.method='medical']
 * @param {number} [params.regionIndex=0]
 * @param {() => number} [params.rng=Math.random]
 */
export function resolveQuarantineGateCheck({
  playerEntity,
  method = 'medical',
  regionIndex = 0,
  rng = Math.random,
}) {
  const skillId =
    method === 'etiquette'
      ? SKILLS.Etiquette
      : method === 'stealth'
        ? SKILLS.Stealth
        : SKILLS.Medical;
  const formulaId =
    method === 'etiquette'
      ? 'SOCIAL_DIPLOMACY'
      : method === 'stealth'
        ? 'STEALTH_INFILTRATION'
        : 'CRISIS_SPECIALIST';
  return resolveLivingRoll({
    formulaId,
    playerEntity,
    skillId,
    difficulty: 45,
    regionIndex,
    rng,
  });
}

