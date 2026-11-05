// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// LIVING TAMRIEL CONFIGURATION REGISTRY
//
// Governs presence tiers, encounter frequencies, and system tunables for the
// modular "Living Tamriel" emergent world framework.
// ═══════════════════════════════════════════════════════════════════════════════

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
 * Global configuration parameters for Living Tamriel.
 * Designed to be modular, editable via settings, and safely defaults to MID tiers.
 */
export const LivingTamrielConfig = {
  // Presence Tiers (0..3)
  political: PRESENCE.MID,          // Faction tension, regional disasters, city skirmishes
  adventurers: PRESENCE.MID,        // Dynamic adventurer sim & Nemesis hunters
  wilderness: PRESENCE.MID,         // Road traffic, ambushes, predator-prey ecology
  urban: PRESENCE.MID,              // City events, pickpockets, distress calls
  naval: PRESENCE.MID,              // High-seas multi-ship skirmishes (up to 3v3)
  travelInterruption: PRESENCE.MID, // Fast travel interception (Things Betwixt style)
  camps: PRESENCE.MID,              // WoD outpost & campsite spawning with slope snap
  quarantine: PRESENCE.HIGH,        // Gate lock-down & road cordons during plague
  bounties: PRESENCE.MID,           // Physical bounty board dynamic sync

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
  LivingTamrielConfig.political = PRESENCE.MID;
  LivingTamrielConfig.adventurers = PRESENCE.MID;
  LivingTamrielConfig.wilderness = PRESENCE.MID;
  LivingTamrielConfig.urban = PRESENCE.MID;
  LivingTamrielConfig.naval = PRESENCE.MID;
  LivingTamrielConfig.travelInterruption = PRESENCE.MID;
  LivingTamrielConfig.camps = PRESENCE.MID;
  LivingTamrielConfig.quarantine = PRESENCE.HIGH;
  LivingTamrielConfig.bounties = PRESENCE.MID;
  LivingTamrielConfig.adventurerPoolPerRegion = 13;
  LivingTamrielConfig.navalSpawnDistanceMeters = 250;
  LivingTamrielConfig.bountyWildernessWeight = 0.70;
  LivingTamrielConfig.bountyRewardWildMult = 4.0;
  LivingTamrielConfig.bountyRewardDungeonMult = 7.5;
  LivingTamrielConfig.luckRerollThreshold = 5;
  LivingTamrielConfig.travelInterruptionCooldownMinutes = 2880;
}

