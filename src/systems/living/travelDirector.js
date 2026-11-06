// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// TRAVEL DIRECTOR & ROAD ECOLOGY (Living Tamriel)
//
// Intercepts long journeys (Things Betwixt port style), handles emergent
// daytime/nighttime interruptions, and applies luck & skill checks.
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getRegionState } from './regionState.js';
import { getLivingDirectorState } from './livingDirector.js';

export const TRAVEL_EVENT_TYPE = Object.freeze({
  PEACEFUL_CARAVAN: 'PEACEFUL_CARAVAN', // 40% Friendly merchants, pilgrims, bards
  ROAD_DILEMMA: 'ROAD_DILEMMA',         // 30% Broken cart, distressed travelers asking for aid
  AMBUSH: 'AMBUSH',                     // 30% Bandits, deserters, wilderness beasts
});

/**
 * Calculates whether a fast travel segment should be intercepted.
 *
 * Formula:
 * InterruptChance = baseDanger + (regionTension / 5) - Math.floor(playerLuck / 10)
 *
 * Safety Gates:
 * 1. Cooldown gate: At least travelInterruptionCooldownMinutes (48 hours) between interruptions.
 * 2. Presence gate: If travelInterruption is OFF, chance is 0.
 *
 * @param {Object} params
 * @param {number} params.regionIndex Current or traversal region index
 * @param {number} params.playerLuck Player Luck attribute (default 50)
 * @param {number} params.nowMinutes Current game clock minute
 * @param {() => number} [params.rng]
 * @returns {{ shouldInterrupt: boolean, eventType: string|null, reason: string }}
 */
export function evaluateTravelInterruption({
  regionIndex,
  playerLuck = 50,
  nowMinutes = 0,
  rng = Math.random,
}) {
  const tier = Number(LivingTamrielConfig.travelInterruption);
  if (tier === PRESENCE.OFF) {
    return { shouldInterrupt: false, eventType: null, reason: 'Travel interruption disabled' };
  }

  const root = getLivingDirectorState();
  if (!root.subsystems.travel) {
    root.subsystems.travel = { lastInterruptMinute: -999999 };
  }

  // 1. Cooldown Failsafe Check (48 game hours)
  const lastMinute = Number(root.subsystems.travel.lastInterruptMinute) || -999999;
  const cooldown = LivingTamrielConfig.travelInterruptionCooldownMinutes || 2880;
  if (nowMinutes - lastMinute < cooldown) {
    return { shouldInterrupt: false, eventType: null, reason: 'Travel interruption on cooldown' };
  }

  // 2. Base Danger by Presence Tier (LIGHT: 5%, MID: 12%, HIGH: 22%)
  const baseDanger = tier === PRESENCE.LIGHT ? 5 : tier === PRESENCE.HIGH ? 22 : 12;
  const regState = getRegionState(regionIndex);
  const tensionModifier = Math.floor((regState?.tension ?? 10) / 5);
  const luckReduction = Math.floor(playerLuck / 10);

  const netChance = Math.max(3, baseDanger + tensionModifier - luckReduction);
  const roll = rng() * 100;

  if (roll >= netChance) {
    return { shouldInterrupt: false, eventType: null, reason: 'Journey proceeded safely' };
  }

  // Interruption occurs: Record timestamp
  root.subsystems.travel.lastInterruptMinute = nowMinutes;

  // 3. Roll event distribution: 40% peaceful / 30% dilemma / 30% ambush
  const subRoll = rng();
  /** @type {string} */
  let eventType = TRAVEL_EVENT_TYPE.PEACEFUL_CARAVAN;
  if (subRoll >= 0.70) {
    eventType = TRAVEL_EVENT_TYPE.AMBUSH;
  } else if (subRoll >= 0.40) {
    eventType = TRAVEL_EVENT_TYPE.ROAD_DILEMMA;
  }

  return {
    shouldInterrupt: true,
    eventType,
    reason: `Journey interrupted by ${eventType}`,
  };
}

/**
 * Checks whether high Stealth allows player to detect an ambush early and bypass it safely.
 * @param {number} stealthSkill Player Stealth skill value
 * @param {number} [luck=50] Player Luck
 * @param {() => number} [rng]
 * @returns {boolean} True if player spots and evades the threat peacefully
 */
export function canEvadeAmbushWithStealth(stealthSkill, luck = 50, rng = Math.random) {
  const evadeChance = Math.trunc(stealthSkill / 2) + Math.trunc(luck / 5);
  return rng() * 100 < evadeChance;
}
