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

/**
 * Encounter mass scale multipliers:
 * LOW (1)  - Baseline compact encounters (1x)
 * MID (2)  - Balanced emergent squads and packs (2x default)
 * HIGH (4) - Large-scale battles, raids, and warbands (4x)
 */
export const LIVING_ENCOUNTER_SCALE = Object.freeze({
  LOW: 1,
  MID: 2,
  HIGH: 4,
});

/** Loot policy for urban crisis skirmishes. */
export const LIVING_URBAN_LOOT = Object.freeze({
  ZERO: 'zero',       // Classic LT: corpses emptied to protect local economy
  SUPPLIES: 'supplies', // Dropping small gold, potions, arrows, bandages
  FULL: 'full',       // Standard DFF gear and weapon drops
});

/** Loot policy for wilderness camps, road encounters, and checkpoints. */
export const LIVING_WILDERNESS_LOOT = Object.freeze({
  FULL: 'full',       // Standard DFF drops
  SUPPLIES: 'supplies', // Consumables and pocket gold only
});

/** Loot policy for defeated living world adventurers. */
export const LIVING_ADVENTURER_LOOT = Object.freeze({
  ZERO: 'zero',       // Corpses emptied / pocket copper only
  SUPPLIES: 'supplies', // Consumables and pocket gold only
  STANDARD: 'standard', // Classic DFU humanoid loot (~25% gear drop)
  FULL: 'full',       // 100% droppable loot (worn gear, artifacts, gold)
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

  get dungeonMobTraits() { return readTierPref('livingDungeonMobTraits', PRESENCE.MID); },
  set dungeonMobTraits(v) { setPref('livingDungeonMobTraits', Number(v)); },

  // Competition toggles
  get allowQuestCompetition() { return getPref('livingQuestCompetition') === true; },
  set allowQuestCompetition(v) { setPref('livingQuestCompetition', Boolean(v)); },

  // Encounter Scale (1x LOW, 2x MID, 4x HIGH)
  get encounterScale() {
    const v = getPref('livingEncounterScale');
    if (v === 'mid' || v === 2 || v === '2') return LIVING_ENCOUNTER_SCALE.MID;
    if (v === 'high' || v === 4 || v === '3' || v === '4') return LIVING_ENCOUNTER_SCALE.HIGH;
    return LIVING_ENCOUNTER_SCALE.LOW;
  },
  set encounterScale(v) {
    let n = LIVING_ENCOUNTER_SCALE.LOW;
    if (v === 'mid' || v === 2) n = LIVING_ENCOUNTER_SCALE.MID;
    else if (v === 'high' || v === 4 || v === 3) n = LIVING_ENCOUNTER_SCALE.HIGH;
    setPref('livingEncounterScale', n);
  },

  // Loot Policies
  get urbanLootMode() {
    const v = String(getPref('livingUrbanLootMode') ?? LIVING_URBAN_LOOT.ZERO).toLowerCase();
    if (v === LIVING_URBAN_LOOT.FULL || v === LIVING_URBAN_LOOT.SUPPLIES) return v;
    return LIVING_URBAN_LOOT.ZERO;
  },
  set urbanLootMode(v) {
    setPref('livingUrbanLootMode', String(v).toLowerCase());
  },

  get wildernessLootMode() {
    const v = String(getPref('livingWildernessLootMode') ?? LIVING_WILDERNESS_LOOT.FULL).toLowerCase();
    if (v === LIVING_WILDERNESS_LOOT.SUPPLIES) return v;
    return LIVING_WILDERNESS_LOOT.FULL;
  },
  set wildernessLootMode(v) {
    setPref('livingWildernessLootMode', String(v).toLowerCase());
  },

  get adventurerLootMode() {
    const v = String(getPref('livingAdventurerLootMode') ?? LIVING_ADVENTURER_LOOT.FULL).toLowerCase();
    if (v === LIVING_ADVENTURER_LOOT.ZERO || v === LIVING_ADVENTURER_LOOT.SUPPLIES || v === LIVING_ADVENTURER_LOOT.STANDARD) return v;
    return LIVING_ADVENTURER_LOOT.FULL;
  },
  set adventurerLootMode(v) {
    setPref('livingAdventurerLootMode', String(v).toLowerCase());
  },

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
 * Helper returning the current numeric encounter scale multiplier (1, 2, or 4).
 * @returns {number}
 */
export function getLivingEncounterScale() {
  const v = LivingTamrielConfig.encounterScale;
  if (v === LIVING_ENCOUNTER_SCALE.MID || v === 'mid' || v === 2) return LIVING_ENCOUNTER_SCALE.MID;
  if (v === LIVING_ENCOUNTER_SCALE.HIGH || v === 'high' || v === 4) return LIVING_ENCOUNTER_SCALE.HIGH;
  return LIVING_ENCOUNTER_SCALE.LOW;
}

/**
 * Rolls an integer uniformly inside [min, max] inclusive using the given RNG.
 * @param {number} min
 * @param {number} max
 * @param {() => number} [rng=Math.random]
 * @returns {number}
 */
export function rollEncounterRange(min, max, rng = Math.random) {
  if (min >= max) return min;
  return min + Math.floor(rng() * (max - min + 1));
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
  setPref('livingDungeonMobTraits', PRESENCE.MID);
  setPref('livingQuestCompetition', false);
  setPref('livingEncounterScale', LIVING_ENCOUNTER_SCALE.LOW);
  setPref('livingUrbanLootMode', LIVING_URBAN_LOOT.ZERO);
  setPref('livingWildernessLootMode', LIVING_WILDERNESS_LOOT.FULL);

  LivingTamrielConfig.adventurerPoolPerRegion = 13;
  LivingTamrielConfig.navalSpawnDistanceMeters = 250;
  LivingTamrielConfig.bountyWildernessWeight = 0.70;
  LivingTamrielConfig.bountyRewardWildMult = 4.0;
  LivingTamrielConfig.bountyRewardDungeonMult = 7.5;
  LivingTamrielConfig.luckRerollThreshold = 5;
  LivingTamrielConfig.travelInterruptionCooldownMinutes = 2880;
}
