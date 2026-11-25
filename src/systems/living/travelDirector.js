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
import { SKILLS } from '../skills.js';
import { resolveLivingRoll, resolveLivingSurrender } from './livingRolls.js';

export const TRAVEL_EVENT_TYPE = Object.freeze({
  PEACEFUL_CARAVAN: 'PEACEFUL_CARAVAN', // Friendly merchants, pilgrims, bards
  ROAD_DILEMMA: 'ROAD_DILEMMA',         // Broken cart, distressed travelers asking for aid
  AMBUSH: 'AMBUSH',                     // Bandits, deserters
  WILD_BEASTS: 'WILD_BEASTS',           // Climate wildlife pack
  WEATHER_HAZARD: 'WEATHER_HAZARD',     // Storm / blizzard / sandstorm on the road or at sea
});

export const TRAVEL_INTERRUPT_COOLDOWN_MINUTES = 720; // 12 game hours
export const ROAD_INTEL_DURATION_MINUTES = 1440; // 24 game hours

/**
 * Grants a temporary "Road Intel" travel safety buff (24 in-game hours by default)
 * after exchanging road news and warnings with a wandering adventurer.
 *
 * @param {number|null|undefined} regionIndex
 * @param {number} [nowMinutes=0]
 * @param {number} [durationMinutes=ROAD_INTEL_DURATION_MINUTES]
 * @returns {{ untilMinute: number, regionIndex: number|null, durationHours: number }}
 */
export function grantRoadIntelBuff(
  regionIndex,
  nowMinutes = 0,
  durationMinutes = ROAD_INTEL_DURATION_MINUTES,
) {
  const root = getLivingDirectorState();
  if (!root.subsystems.travel || typeof root.subsystems.travel !== 'object') {
    root.subsystems.travel = { lastInterruptMinute: -999999, roadIntelUntilMinute: 0, roadIntelRegion: null };
  }
  const baseNow =
    Number.isFinite(nowMinutes) && nowMinutes > 0
      ? nowMinutes
      : Number(root.lastWorldTickMinute) || 0;
  const safeDuration = Math.max(60, Number(durationMinutes) || ROAD_INTEL_DURATION_MINUTES);
  const prevUntil = Number(root.subsystems.travel.roadIntelUntilMinute) || 0;
  const untilMinute = Math.max(prevUntil, baseNow + safeDuration);
  const safeRegion = Number.isInteger(regionIndex) ? regionIndex : null;
  root.subsystems.travel.roadIntelUntilMinute = untilMinute;
  root.subsystems.travel.roadIntelRegion = safeRegion;
  return {
    untilMinute,
    regionIndex: safeRegion,
    durationHours: Math.max(1, Math.round(safeDuration / 60)),
  };
}

/**
 * Returns whether the temporary "Road Intel" buff is currently active.
 *
 * @param {number} [nowMinutes=0]
 * @returns {{ active: boolean, remainingMinutes: number, regionIndex: number|null, untilMinute: number }}
 */
export function getActiveRoadIntelBuff(nowMinutes = 0) {
  const root = getLivingDirectorState();
  const travel = root?.subsystems?.travel;
  const until = Number(travel?.roadIntelUntilMinute) || 0;
  const now =
    Number.isFinite(nowMinutes) && nowMinutes >= 0
      ? nowMinutes
      : Number(root?.lastWorldTickMinute) || 0;
  const active = until > 0 && now < until;
  return {
    active,
    remainingMinutes: active ? until - now : 0,
    regionIndex: Number.isInteger(travel?.roadIntelRegion) ? travel.roadIntelRegion : null,
    untilMinute: until,
  };
}

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
 * @param {number} [params.playerLuck=50] Player Luck attribute (default 50)
 * @param {number} [params.nowMinutes=0] Current game clock minute
 * @param {number} [params.tripMinutes=60] Total journey duration in game minutes
 * @param {boolean} [params.sleepModeInn=true] Whether traveling via inns (vs. camping out)
 * @param {boolean} [params.speedCautious=true] Whether traveling cautiously (vs. recklessly)
 * @param {boolean} [params.sailing=false] Whether traveling by sea
 * @param {number} [params.maxInterrupts=1] Maximum interruption roll cap for the journey
 * @param {() => number} [params.rng]
 * @returns {{ shouldInterrupt: boolean, eventType: string|null, reason: string, rolls: number }}
 */
export function evaluateTravelInterruption({
  regionIndex,
  playerLuck = 50,
  nowMinutes = 0,
  tripMinutes = 60,
  sleepModeInn = true,
  speedCautious = true,
  sailing = false,
  maxInterrupts = 1,
  rng = Math.random,
}) {
  const tier = Number(LivingTamrielConfig.travelInterruption);
  if (tier === PRESENCE.OFF) {
    return { shouldInterrupt: false, eventType: null, reason: 'Travel interruption disabled', rolls: 0 };
  }
  if (tripMinutes < 180) {
    return { shouldInterrupt: false, eventType: null, reason: 'Short journey', rolls: 0 };
  }

  const root = getLivingDirectorState();
  if (!root.subsystems.travel) {
    root.subsystems.travel = { lastInterruptMinute: -999999 };
  }

  // 1. Cooldown Failsafe Check (12 game hours)
  const lastMinute = Number(root.subsystems.travel.lastInterruptMinute) || -999999;
  const cooldown = Math.min(
    TRAVEL_INTERRUPT_COOLDOWN_MINUTES,
    Number(LivingTamrielConfig.travelInterruptionCooldownMinutes) || TRAVEL_INTERRUPT_COOLDOWN_MINUTES,
  );
  if (nowMinutes - lastMinute < cooldown) {
    return { shouldInterrupt: false, eventType: null, reason: 'Travel interruption on cooldown', rolls: 0 };
  }

  // 2. Danger scaled by duration, camp-out vs inns, and reckless vs cautious
  const baseDanger = tier === PRESENCE.LIGHT ? 5 : tier === PRESENCE.HIGH ? 22 : 12;
  const regState = getRegionState(regionIndex);
  const tensionModifier = Math.floor((regState?.tension ?? 10) / 5);
  const luckReduction = Math.floor(playerLuck / 10);
  const tripDays = Math.max(1, tripMinutes / 1440);
  const campMod = sleepModeInn ? 0 : 8;
  const paceMod = speedCautious ? 0 : 6;

  let netChance = Math.max(4, Math.min(65, baseDanger + tensionModifier + campMod + paceMod - luckReduction));
  const roadIntel = getActiveRoadIntelBuff(nowMinutes);
  if (roadIntel.active && !sailing) {
    const regionalExtra = roadIntel.regionIndex === regionIndex ? 5 : 0;
    netChance = Math.max(2, Math.round(netChance * 0.5) - regionalExtra);
  }
  const numRolls = Math.max(1, Math.min(maxInterrupts, Math.ceil(tripDays / 2)));

  let triggered = false;
  for (let i = 0; i < numRolls; i++) {
    if (rng() * 100 < netChance) {
      triggered = true;
      break;
    }
  }

  if (!triggered) {
    return {
      shouldInterrupt: false,
      eventType: null,
      reason: 'Journey proceeded safely',
      rolls: numRolls,
      roadIntelActive: roadIntel.active,
    };
  }

  // Interruption occurs: Record timestamp
  root.subsystems.travel.lastInterruptMinute = nowMinutes;

  // 3. Roll event distribution (sea vs land)
  const subRoll = rng();
  /** @type {string} */
  let eventType = TRAVEL_EVENT_TYPE.PEACEFUL_CARAVAN;
  if (sailing) {
    eventType = TRAVEL_EVENT_TYPE.WEATHER_HAZARD;
  } else if (subRoll >= 0.84) {
    eventType = TRAVEL_EVENT_TYPE.WEATHER_HAZARD;
  } else if (subRoll >= 0.68) {
    eventType = TRAVEL_EVENT_TYPE.WILD_BEASTS;
  } else if (subRoll >= 0.48) {
    eventType = TRAVEL_EVENT_TYPE.AMBUSH;
  } else if (subRoll >= 0.26) {
    eventType = TRAVEL_EVENT_TYPE.ROAD_DILEMMA;
  }

  return {
    shouldInterrupt: true,
    eventType,
    rolls: numRolls,
    roadIntelActive: roadIntel.active,
    reason: `Journey interrupted by ${eventType}`,
  };
}

/**
 * Evaluates a typed Stealth + Agility + Luck ambush detection & evasion check.
 *
 * @param {any} playerOrStealth Player entity or numeric Stealth skill value
 * @param {number} [luck=50] Player Luck fallback
 * @param {() => number} [rng=Math.random]
 * @param {{ nowMinutes?: number } | null} [opts=null]
 */
export function evaluateAmbushStealthRoll(playerOrStealth, luck = 50, rng = Math.random, opts = null) {
  const playerEntity =
    typeof playerOrStealth === 'number'
      ? { skills: { [SKILLS.Stealth]: playerOrStealth }, stats: { Luck: luck, Agility: 50 } }
      : playerOrStealth;
  const roadIntelBonus =
    opts?.nowMinutes != null && getActiveRoadIntelBuff(opts.nowMinutes).active ? 15 : 0;
  return resolveLivingRoll({
    formulaId: 'STEALTH_INFILTRATION',
    playerEntity,
    skillId: SKILLS.Stealth,
    statName: 'agility',
    difficulty: 0,
    contextBonus: roadIntelBonus,
    allowLuckReroll: false,
    rng,
  });
}

/**
 * Checks whether high Stealth allows player to detect an ambush early and bypass it safely.
 * @param {number|any} stealthSkill Player Stealth skill value or player entity
 * @param {number} [luck=50] Player Luck
 * @param {() => number} [rng]
 * @param {{ nowMinutes?: number } | null} [opts=null]
 * @returns {boolean} True if player spots and evades the threat peacefully
 */
export function canEvadeAmbushWithStealth(stealthSkill, luck = 50, rng = Math.random, opts = null) {
  const res = evaluateAmbushStealthRoll(stealthSkill, luck, rng, opts);
  return res.margin > 0;
}

/**
 * Resolves surrender / ransom consequences when ambushed on the road.
 *
 * @param {any} playerEntity
 * @param {number} [threatLevel=1]
 */
export function resolveAmbushSurrender(playerEntity, threatLevel = 1) {
  return resolveLivingSurrender({ playerEntity, threatLevel });
}
