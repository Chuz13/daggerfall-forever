// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// LIVING TAMRIEL CONFIGURATION REGISTRY
//
// Governs presence tiers, encounter frequencies, and system tunables for the
// modular "Living Tamriel" emergent world framework.
// Connected to the UI preferences shelf (uiPrefs.js) and settings menu.
// ═══════════════════════════════════════════════════════════════════════════════

import { getPref, setPref } from '../uiPrefs.js';

/**
 * Four-tier presence model:
 * 0 (OFF)   - Subsystem completely disabled, vanilla engine behavior untouched.
 * 1 (LIGHT) - Rare, unobtrusive presence (gentle ambient flavor).
 * 2 (MID)   - Recommended default: balanced emergent activity and encounters.
 * 3 (HIGH)  - Dynamic, frequent encounters for action-heavy gameplay.
 */
export const PRESENCE = Object.freeze({
  OFF: 0,
  LIGHT: 1,
  MID: 2,
  HIGH: 3,
});

function parseTierValue(v) {
  if (Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'off' || s === '0') return PRESENCE.OFF;
    if (s === 'light' || s === '1') return PRESENCE.LIGHT;
    if (s === 'mid' || s === '2') return PRESENCE.MID;
    if (s === 'high' || s === '3') return PRESENCE.HIGH;
  }
  return null;
}

/**
 * Reads a presence tier from uiPrefs, falling back to a default tier if unset.
 * @param {string} key
 * @param {number} fallback
 * @returns {number}
 */
function readTierPref(key, fallback) {
  const parsed = parseTierValue(getPref(key));
  return parsed !== null ? parsed : fallback;
}

let _bountyScalingEnabled = false;

export function enableLivingBountyScaling(enabled = true) {
  _bountyScalingEnabled = Boolean(enabled);
}

export function isLivingBountyScalingEnabled() {
  return _bountyScalingEnabled && Number(LivingTamrielConfig.bounties) > PRESENCE.OFF;
}

/**
 * Global configuration parameters for Living Tamriel.
 * Designed to be modular, editable via settings, and safely defaults to MID tiers.
 */
export const LivingTamrielConfig = {
  // Presence Tiers (0..3) backed by UI preferences
  get political() { return readTierPref('livingPolitical', PRESENCE.MID); },
  set political(v) { setPref('livingPolitical', Number(v)); },

  get adventurers() { return readTierPref('livingAdventurers', PRESENCE.MID); },
  set adventurers(v) { setPref('livingAdventurers', Number(v)); },

  get roadAdventurers() { return readTierPref('livingRoadAdventurers', PRESENCE.MID); },
  set roadAdventurers(v) { setPref('livingRoadAdventurers', Number(v)); },

  get wilderness() {
    const w = parseTierValue(getPref('livingWilderness'));
    if (w !== null) return w;
    return readTierPref('livingTravel', PRESENCE.MID);
  },
  set wilderness(v) {
    const n = parseTierValue(v) ?? Number(v);
    setPref('livingTravel', n);
    setPref('livingWilderness', n);
  },

  get urban() { return readTierPref('livingUrban', PRESENCE.MID); },
  set urban(v) { setPref('livingUrban', Number(v)); },

  get naval() { return readTierPref('livingNaval', PRESENCE.MID); },
  set naval(v) { setPref('livingNaval', Number(v)); },

  get travelInterruption() { return readTierPref('livingTravel', PRESENCE.MID); },
  set travelInterruption(v) { setPref('livingTravel', Number(v)); },

  get camps() { return readTierPref('livingCamps', PRESENCE.MID); },
  set camps(v) { setPref('livingCamps', Number(v)); },

  get quarantine() { return readTierPref('livingQuarantine', PRESENCE.HIGH); },
  set quarantine(v) { setPref('livingQuarantine', Number(v)); },

  get bounties() { return readTierPref('livingBounties', PRESENCE.MID); },
  set bounties(v) {
    _bountyScalingEnabled = Number(v) > PRESENCE.OFF;
    setPref('livingBounties', Number(v));
  },

  get nemesis() { return readTierPref('livingNemesis', PRESENCE.MID); },
  set nemesis(v) { setPref('livingNemesis', Number(v)); },

  get mobTraits() { return readTierPref('livingMobTraits', PRESENCE.MID); },
  set mobTraits(v) { setPref('livingMobTraits', Number(v)); },

  // Competition toggles
  get allowQuestCompetition() { return getPref('livingQuestCompetition') === true; },
  set allowQuestCompetition(v) { setPref('livingQuestCompetition', Boolean(v)); },

  // Tunables & Thresholds
  adventurerPoolPerRegion: 13,      // Default 13, configurable up to 30 for stress-tests
  navalSpawnDistanceMeters: 250,    // Spawn radius for naval encounters (200-300m)
  bountyWildernessWeight: 0.70,     // 70% wilderness / 30% dungeons
  bountyRewardWildMult: 4.0,        // x3 - x5 baseline reward
  bountyRewardDungeonMult: 7.5,     // x5 - x10 baseline reward
  luckRerollThreshold: 5,           // Margin of skill check failure where Luck offers a reroll
  travelInterruptionCooldownMinutes: 2880, // 48 in-game hours cooldown between travel interrupts
};

/**
 * Helper to check whether a specific subsystem is active (tier > OFF).
 * @param {keyof typeof LivingTamrielConfig} featureKey
 * @returns {boolean}
 */
export function isLivingFeatureActive(featureKey) {
  const tier = LivingTamrielConfig[featureKey];
  return typeof tier === 'number' && tier > PRESENCE.OFF;
}

/**
 * Resets configuration back to canonical defaults.
 */
export function resetLivingConfig() {
  _bountyScalingEnabled = true;
  setPref('livingPolitical', PRESENCE.MID);
  setPref('livingAdventurers', PRESENCE.MID);
  setPref('livingRoadAdventurers', PRESENCE.MID);
  setPref('livingUrban', PRESENCE.MID);
  setPref('livingNaval', PRESENCE.MID);
  setPref('livingTravel', PRESENCE.MID);
  setPref('livingWilderness', null);
  setPref('livingCamps', PRESENCE.MID);
  setPref('livingQuarantine', PRESENCE.HIGH);
  setPref('livingBounties', PRESENCE.MID);
  setPref('livingNemesis', PRESENCE.MID);
  setPref('livingMobTraits', PRESENCE.MID);
  setPref('livingQuestCompetition', false);

  LivingTamrielConfig.adventurerPoolPerRegion = 13;
  LivingTamrielConfig.navalSpawnDistanceMeters = 250;
  LivingTamrielConfig.bountyWildernessWeight = 0.70;
  LivingTamrielConfig.bountyRewardWildMult = 4.0;
  LivingTamrielConfig.bountyRewardDungeonMult = 7.5;
  LivingTamrielConfig.luckRerollThreshold = 5;
  LivingTamrielConfig.travelInterruptionCooldownMinutes = 2880;
}
