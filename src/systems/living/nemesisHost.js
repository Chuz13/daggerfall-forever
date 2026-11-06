// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// NEMESIS & RIVAL HUNTER HOST 2.0 (Living Tamriel)
//
// Dynamic leveled adversaries that hunt or confront the player based on:
//  - Legal infamy and bounties (Bounty Hunter)
//  - Dark guild hostilities (Shadow Assassin)
//  - Fame and prowess (Glory Challenger)
//  - Past rivalries, tavern defeats and stolen quests (Grudge Avenger)
//  - Arcane relic jealousy (Arcane Rival)
//  - Highway banditry and chaos (Chaotic Marauder)
//
// Features:
//  - Archetype-specific motives, dialogue, and backstories.
//  - Retinues / Minions scaled by level band (1..45).
//  - Deep social checks (Etiquette, Streetwise, Taunt/Dare) with Luck saves.
// ═══════════════════════════════════════════════════════════════════════════════

import { SKILLS, skillValue } from '../skills.js';
import { liveStat } from '../statMods.js';
import { dice100 } from '../../combat/formulas.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { LEVEL_CAP } from '../levelCap.js';
import { GUILD_GROUPS } from '../../formats/factionFile.js';

export const NEMESIS_ARCHETYPES = Object.freeze({
  BOUNTY_HUNTER: 'BOUNTY_HUNTER',       // Enforcer hunting legal bounties & criminals
  SHADOW_ASSASSIN: 'SHADOW_ASSASSIN',   // Dark Brotherhood contract / guild hitman
  GLORY_CHALLENGER: 'GLORY_CHALLENGER', // Seeks renown by defeating a famous adventurer
  GRUDGE_AVENGER: 'GRUDGE_AVENGER',     // "Обиженка" avenging a prior duel or lost loot
  ARCANE_RIVAL: 'ARCANE_RIVAL',         // Jealous mage hunting rare artifacts/spells
  CHAOTIC_MARAUDER: 'CHAOTIC_MARAUDER', // Bloodthirsty highway predator demanding gold
});

export const NEMESIS_RESOLUTION = Object.freeze({
  DUEL: 'DUEL',                         // Social check failed -> Full combat
  PACIFIED: 'PACIFIED',                 // Etiquette check succeeded -> Honorable stand-down
  BRIBED: 'BRIBED',                     // Streetwise buyout -> Contract cleared
  INTIMIDATED: 'INTIMIDATED',           // Streetwise/strength -> Nemesis backs down
  SOLO_DUEL_ACCEPTED: 'SOLO_DUEL_ACCEPTED', // Taunt succeeded -> Minions ordered to stand back
  LUCK_SAVED: 'LUCK_SAVED',             // Narrow failure averted by blind Luck
});

const ARCHETYPE_NAMES = Object.freeze({
  [NEMESIS_ARCHETYPES.BOUNTY_HUNTER]: ['Valen the Relentless', 'Gideon Ironbound', 'Draven the Tracker'],
  [NEMESIS_ARCHETYPES.SHADOW_ASSASSIN]: ['Whisper in the Dark', 'Nocturna the Silent', 'Malakor Nightfang'],
  [NEMESIS_ARCHETYPES.GLORY_CHALLENGER]: ['Sir Gareth the Valiant', 'Brond the Unbeaten', 'Morwenna the Challenger'],
  [NEMESIS_ARCHETYPES.GRUDGE_AVENGER]: ['Eldon the Bitter', 'Korgan Sore-Loser', 'Lyra Blood-Debt'],
  [NEMESIS_ARCHETYPES.ARCANE_RIVAL]: ['Arch-Pyromancer Vaelen', 'Kaelith the Envious', 'Solon Spell-Thief'],
  [NEMESIS_ARCHETYPES.CHAOTIC_MARAUDER]: ['Ghorbash Flesh-Ripper', 'Vorg the Reaver', 'Scarlett the Ruthless'],
});

const ARCHETYPE_CLASSES = Object.freeze({
  [NEMESIS_ARCHETYPES.BOUNTY_HUNTER]: 'Knight',
  [NEMESIS_ARCHETYPES.SHADOW_ASSASSIN]: 'Assassin',
  [NEMESIS_ARCHETYPES.GLORY_CHALLENGER]: 'Warrior',
  [NEMESIS_ARCHETYPES.GRUDGE_AVENGER]: 'Barbarian',
  [NEMESIS_ARCHETYPES.ARCANE_RIVAL]: 'Battlemage',
  [NEMESIS_ARCHETYPES.CHAOTIC_MARAUDER]: 'Rogue',
});

const ARCHETYPE_MINION_ROLES = Object.freeze({
  [NEMESIS_ARCHETYPES.BOUNTY_HUNTER]: ['War Hound', 'Hired Tracker', 'Enforcer'],
  [NEMESIS_ARCHETYPES.SHADOW_ASSASSIN]: ['Shadow Initiate', 'Poisoner', 'Venomous Stalker'],
  [NEMESIS_ARCHETYPES.GLORY_CHALLENGER]: ['Loyal Squire', 'Shieldbearer', 'Herald'],
  [NEMESIS_ARCHETYPES.GRUDGE_AVENGER]: ['Hired Thug', 'Bitter Kinsman', 'Cutthroat'],
  [NEMESIS_ARCHETYPES.ARCANE_RIVAL]: ['Apprentice Mage', 'Bound Imp', 'Acolyte'],
  [NEMESIS_ARCHETYPES.CHAOTIC_MARAUDER]: ['Marauder Raider', 'Reaver Cutpurse', 'Rabid Hound'],
});

/**
 * Evaluates whether conditions merit dispatching a Nemesis hunter.
 * Fully backward-compatible with legacy (player, legalReputation, playerLevel)
 * signature while supporting expanded conditions.
 *
 * @param {Object} player
 * @param {number|{ legalReputation?: number, playerLevel?: number, isCrisis?: boolean, hasGrudge?: boolean, playerGold?: number }} [repOrOptions=0]
 * @param {number} [playerLevel=1]
 * @returns {boolean}
 */
export function shouldDispatchNemesis(player, repOrOptions = 0, playerLevel = 1) {
  const tier = Number(LivingTamrielConfig.nemesis ?? LivingTamrielConfig.adventurers);
  if (tier === PRESENCE.OFF) return false;

  let legalReputation = 0;
  let level = playerLevel;
  let isCrisis = false;
  let hasGrudge = false;
  let playerGold = 0;

  if (typeof repOrOptions === 'number') {
    legalReputation = repOrOptions;
  } else if (typeof repOrOptions === 'object' && repOrOptions !== null) {
    if (typeof repOrOptions.legalReputation === 'number') legalReputation = repOrOptions.legalReputation;
    if (typeof repOrOptions.playerLevel === 'number') level = repOrOptions.playerLevel;
    if (typeof repOrOptions.isCrisis === 'boolean') isCrisis = repOrOptions.isCrisis;
    if (typeof repOrOptions.hasGrudge === 'boolean') hasGrudge = repOrOptions.hasGrudge;
    if (typeof repOrOptions.playerGold === 'number') playerGold = repOrOptions.playerGold;
  }

  // 1. Classic Bounty Hunter condition: Infamy <= -20 and level >= 3
  if (legalReputation <= -20 && level >= 3) return true;

  // 2. Shadow Assassin: Deep infamy <= -40 and level >= 5
  if (legalReputation <= -40 && level >= 5) return true;

  // 3. Glory Challenger: High level champion (level >= 8) with positive standing
  const isKnightOrFighter = Boolean(
    player?.guildMemberships?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0 ||
    player?.guildMemberships?.[GUILD_GROUPS.FightersGuild]?.rank > 0
  );
  if (level >= 8 && (legalReputation >= 15 || isKnightOrFighter)) return true;

  // 4. Grudge Avenger: Past rivalry or tavern defeat (level >= 4)
  if (hasGrudge && level >= 4) return true;

  // 5. Arcane Rival: Magical prowess (Thaumaturgy or Destruction >= 50) and level >= 6
  const magicSkill = Math.max(
    skillValue(player, SKILLS.Thaumaturgy) || 0,
    skillValue(player, SKILLS.Destruction) || 0,
  );
  if (magicSkill >= 50 && level >= 6) return true;

  // 6. Chaotic Marauder: Travel in wartime crisis or high wealth (level >= 3)
  if ((isCrisis || playerGold >= 1500) && level >= 3) return true;

  return false;
}

/**
 * Determines the most fitting archetype based on the player's circumstances.
 *
 * @param {Object} player
 * @param {Object} [context]
 * @param {number} [context.legalReputation=0]
 * @param {number} [context.playerLevel=1]
 * @param {boolean} [context.isCrisis=false]
 * @param {boolean} [context.hasGrudge=false]
 * @param {number} [context.playerGold=0]
 * @param {() => number} [context.rng=Math.random]
 * @returns {string} One of NEMESIS_ARCHETYPES
 */
export function determineNemesisArchetype(player, {
  legalReputation = 0,
  playerLevel = 1,
  isCrisis = false,
  hasGrudge = false,
  playerGold = 0,
  rng = Math.random,
} = {}) {
  /** @type {string[]} */
  const candidates = [];

  if (legalReputation <= -20 && playerLevel >= 3) {
    candidates.push(NEMESIS_ARCHETYPES.BOUNTY_HUNTER);
  }
  if (legalReputation <= -40 && playerLevel >= 5) {
    candidates.push(NEMESIS_ARCHETYPES.SHADOW_ASSASSIN);
  }
  const isKnightOrFighter = Boolean(
    player?.guildMemberships?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0 ||
    player?.guildMemberships?.[GUILD_GROUPS.FightersGuild]?.rank > 0
  );
  if (playerLevel >= 8 && (legalReputation >= 15 || isKnightOrFighter)) {
    candidates.push(NEMESIS_ARCHETYPES.GLORY_CHALLENGER);
  }
  if (hasGrudge) {
    candidates.push(NEMESIS_ARCHETYPES.GRUDGE_AVENGER);
  }
  const magicSkill = Math.max(
    skillValue(player, SKILLS.Thaumaturgy) || 0,
    skillValue(player, SKILLS.Destruction) || 0,
  );
  if (magicSkill >= 50 && playerLevel >= 6) {
    candidates.push(NEMESIS_ARCHETYPES.ARCANE_RIVAL);
  }
  if ((isCrisis || playerGold >= 1500) && playerLevel >= 3) {
    candidates.push(NEMESIS_ARCHETYPES.CHAOTIC_MARAUDER);
  }

  if (candidates.length === 0) {
    return NEMESIS_ARCHETYPES.BOUNTY_HUNTER;
  }
  return candidates[Math.floor(rng() * candidates.length)];
}

/**
 * Creates a leveled Nemesis hunter record complete with archetype, motive,
 * and scaled retinue / minions.
 *
 * @param {number} playerLevel
 * @param {string|{ name?: string, archetype?: string, rng?: () => number }} [nameOrOptions]
 */
export function createNemesisHunter(playerLevel, nameOrOptions) {
  let customName = null;
  let customArchetype = null;
  let rng = Math.random;

  if (typeof nameOrOptions === 'string') {
    customName = nameOrOptions;
  } else if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
    if (nameOrOptions.name) customName = nameOrOptions.name;
    if (nameOrOptions.archetype) customArchetype = nameOrOptions.archetype;
    if (typeof nameOrOptions.rng === 'function') rng = nameOrOptions.rng;
  }

  const archetype = customArchetype || NEMESIS_ARCHETYPES.BOUNTY_HUNTER;
  const namePool = ARCHETYPE_NAMES[archetype] || ARCHETYPE_NAMES[NEMESIS_ARCHETYPES.BOUNTY_HUNTER];
  const name = customName || namePool[Math.floor(rng() * namePool.length)];
  const className = ARCHETYPE_CLASSES[archetype] || 'Assassin';

  const nemesisLevel = Math.min(LEVEL_CAP, Math.max(1, playerLevel + 1));
  const gearTier = Math.min(9, Math.floor(nemesisLevel / 5) + 1);

  // Scaled minions based on Nemesis level
  let minionCount = 0;
  if (nemesisLevel >= 31) {
    minionCount = 2 + Math.floor(rng() * 2); // 2..3 elite minions
  } else if (nemesisLevel >= 16) {
    minionCount = 2;                         // 2 veterans
  } else if (nemesisLevel >= 6) {
    minionCount = 1;                         // 1 assistant
  }

  const rolePool = ARCHETYPE_MINION_ROLES[archetype] || ['Hired Thug'];
  const minions = [];
  for (let m = 0; m < minionCount; m++) {
    const role = rolePool[m % rolePool.length];
    minions.push({
      name: `${role} #${m + 1}`,
      role,
      level: Math.max(1, nemesisLevel - 3),
      gearTier: Math.max(1, gearTier - 1),
    });
  }

  let motiveKey = 'living.nemesis.motive.bounty';
  if (archetype === NEMESIS_ARCHETYPES.SHADOW_ASSASSIN) motiveKey = 'living.nemesis.motive.assassin';
  else if (archetype === NEMESIS_ARCHETYPES.GLORY_CHALLENGER) motiveKey = 'living.nemesis.motive.glory';
  else if (archetype === NEMESIS_ARCHETYPES.GRUDGE_AVENGER) motiveKey = 'living.nemesis.motive.grudge';
  else if (archetype === NEMESIS_ARCHETYPES.ARCANE_RIVAL) motiveKey = 'living.nemesis.motive.arcane';
  else if (archetype === NEMESIS_ARCHETYPES.CHAOTIC_MARAUDER) motiveKey = 'living.nemesis.motive.marauder';

  return {
    name,
    archetype,
    motiveKey,
    className,
    level: nemesisLevel,
    gearTier,
    contractBounty: nemesisLevel * 250,
    minions,
    escapedCount: 0,
    hasMemoryOfDefeat: false,
  };
}

/**
 * Resolves dialogue confrontation with the Nemesis.
 * Supports Etiquette, Streetwise, and Taunt tactics with Luck rerolls.
 *
 * @param {Object} player Player entity
 * @param {Object} nemesis Nemesis entity record
 * @param {'etiquette'|'streetwise'|'taunt'|'duel'} approach Chosen dialogue tactic
 * @param {() => number} [rng]
 * @returns {{ resolution: string, message: string }}
 */
export function resolveNemesisConfrontation(
  player,
  nemesis,
  approach,
  rng = Math.random,
) {
  if (approach === 'duel') {
    return {
      resolution: NEMESIS_RESOLUTION.DUEL,
      message: `${nemesis.name} unsheathes cold steel. "Draw your blade; let blood settle this!"`,
    };
  }

  const personality = liveStat(player, 'personality') || 50;
  const luck = liveStat(player, 'luck') || 50;
  const difficulty = 40 + (nemesis.level * 3);

  // 1. Etiquette: Appeal to honor, heraldry, or chivalry
  if (approach === 'etiquette') {
    const etVal = skillValue(player, SKILLS.Etiquette) || 30;
    // Glory Challengers and Knights respect etiquette greatly (+20 bonus)
    const bonus = nemesis.archetype === NEMESIS_ARCHETYPES.GLORY_CHALLENGER ? 20 : 0;
    const totalScore = etVal + bonus + Math.trunc(personality / 3);
    const roll = rng() * 100;

    if (roll + totalScore >= difficulty + 50) {
      return {
        resolution: NEMESIS_RESOLUTION.PACIFIED,
        message: `${nemesis.name} lowers their weapon. "A person of honour. This contract is dishonourable — I shall take my leave."`,
      };
    }

    // Near failure Luck reroll
    const delta = (difficulty + 50) - (roll + totalScore);
    if (delta <= LivingTamrielConfig.luckRerollThreshold && dice100(Math.trunc(luck / 2), rng())) {
      return {
        resolution: NEMESIS_RESOLUTION.LUCK_SAVED,
        message: `By blind fortune, a distraction turns ${nemesis.name}'s attention away, breaking their resolve to strike!`,
      };
    }
  }

  // 2. Streetwise: Buyout, underworld negotiation, or intimidation
  if (approach === 'streetwise') {
    const swVal = skillValue(player, SKILLS.Streetwise) || 30;
    // Bounty Hunters and Marauders are susceptible to gold/negotiation
    const bonus = (nemesis.archetype === NEMESIS_ARCHETYPES.BOUNTY_HUNTER || nemesis.archetype === NEMESIS_ARCHETYPES.CHAOTIC_MARAUDER) ? 15 : 0;
    const totalScore = swVal + bonus + Math.trunc(personality / 3);
    const roll = rng() * 100;

    if (roll + totalScore >= difficulty + 50) {
      if (nemesis.archetype === NEMESIS_ARCHETYPES.CHAOTIC_MARAUDER) {
        return {
          resolution: NEMESIS_RESOLUTION.INTIMIDATED,
          message: `${nemesis.name} blanches at your cold stare and backs away into the shadows.`,
        };
      }
      return {
        resolution: NEMESIS_RESOLUTION.BRIBED,
        message: `${nemesis.name} smirks and accepts your pouch. "Good business doing business with you. I'll tell the employer you perished in the bay."`,
      };
    }

    // Near failure Luck reroll
    const delta = (difficulty + 50) - (roll + totalScore);
    if (delta <= LivingTamrielConfig.luckRerollThreshold && dice100(Math.trunc(luck / 2), rng())) {
      return {
        resolution: NEMESIS_RESOLUTION.LUCK_SAVED,
        message: `By blind fortune, a distraction turns ${nemesis.name}'s attention away, breaking their resolve to strike!`,
      };
    }
  }

  // 3. Taunt: "На слабо" dare that forces the Nemesis to dismiss minions and fight 1v1
  if (approach === 'taunt') {
    const swVal = skillValue(player, SKILLS.Streetwise) || 30;
    const totalScore = swVal + Math.trunc(personality / 3);
    const roll = rng() * 100;

    if (roll + totalScore >= difficulty + 40) {
      // Strips minions out of the encounter!
      nemesis.minions = [];
      return {
        resolution: NEMESIS_RESOLUTION.SOLO_DUEL_ACCEPTED,
        message: `${nemesis.name} sneers and gestures for their retinue to step back. "Stay out of this, fools! This cur is mine alone!"`,
      };
    }

    // Near failure Luck reroll
    const delta = (difficulty + 40) - (roll + totalScore);
    if (delta <= LivingTamrielConfig.luckRerollThreshold && dice100(Math.trunc(luck / 2), rng())) {
      nemesis.minions = [];
      return {
        resolution: NEMESIS_RESOLUTION.SOLO_DUEL_ACCEPTED,
        message: `${nemesis.name} waves their minions away in frustration. "One on one, coward!"`,
      };
    }
  }

  // Fallback on failed checks: Combat
  return {
    resolution: NEMESIS_RESOLUTION.DUEL,
    message: `${nemesis.name} draws steel with a cold grin. "Nice try, but your head is worth too much in gold. En garde!"`,
  };
}
