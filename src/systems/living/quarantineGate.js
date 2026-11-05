// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// QUARANTINE GATE & OUTPOST CONTROLLER (Living Tamriel)
//
// Manages exterior city gate lockouts, cordons, and emergency relief posts
// during active regional plague outbreaks (PLAGUE.MID).
// ═══════════════════════════════════════════════════════════════════════════════

import { isRegionInQuarantine } from './regionState.js';

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
 * Allows curing disease/poison even when the city is locked down.
 */
export function getQuarantineReliefPostInfo(regionIndex) {
  if (!isRegionInQuarantine(regionIndex)) return null;
  return {
    healerPresent: true,
    cureCostMultiplier: 2.0, // Higher cost due to emergency cordon supplies
    dialogue: 'Halt, traveler! The city within suffers pestilence. Stay without or seek aid at our field pavilion.',
  };
}

