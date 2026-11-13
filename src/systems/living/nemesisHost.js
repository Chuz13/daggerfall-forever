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
import { LivingTamrielConfig, PRESENCE, getLivingEncounterScale, rollEncounterRange, LIVING_ENCOUNTER_SCALE } from './livingConfig.js';
import { getLivingDirectorState } from './livingDirector.js';
import { LEVEL_CAP } from '../levelCap.js';
import { GUILD_GROUPS } from '../../formats/factionFile.js';
import {
  resolveLivingRoll,
  computeRoleplayBribeMultiplier,
  readPlayerSkill,
} from './livingRolls.js';
import { evaluateFactionNemesisPool } from './reputationConsequences.js';

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

  // 1b. Reputation Consequences Framework: severe faction hostilities
  if (evaluateFactionNemesisPool(player).length > 0 && level >= 3) return true;

  // 2. Shadow Assassin: Deep infamy <= -40 and level >= 5
  if (legalReputation <= -40 && level >= 5) return true;

  // 3. Glory Challenger: High level champion (level >= 8) with positive standing
  const isKnightOrFighter = Boolean(
    player?.guildMemberships?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0 ||
    player?.guildMemberships?.[GUILD_GROUPS.FightersGuild]?.rank > 0 ||
    player?.guilds?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0 ||
    player?.guilds?.[GUILD_GROUPS.FightersGuild]?.rank > 0
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

  const pool = evaluateFactionNemesisPool(player);
  if (pool.length === 1) {
    return NEMESIS_ARCHETYPES[pool[0].archetype];
  }
  if (pool.length > 1) {
    const roll = typeof rng === 'function' ? rng() : Math.random();
    const idx = Math.floor(Math.max(0, Math.min(0.9999999, roll)) * pool.length);
    return NEMESIS_ARCHETYPES[pool[idx].archetype];
  }

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
 * Selects a specific faction/generic nemesis assignment for the next ambush spawn,
 * rotating round-robin across all hostile factions and preserving recurring rival names.
 *
 * @param {Object} player
 * @param {Object} [context]
 * @returns {{ archetype: string, factionKey: string|null, factionId: number|null, factionName: string|null, customName: string|undefined }}
 */
export function selectNemesisAssignment(player, context = {}) {
  const pool = evaluateFactionNemesisPool(player);
  const mem = ensureNemesisMem();
  if (pool.length > 0) {
    const nextIdx = (mem.lastFactionIndex + 1) % pool.length;
    mem.lastFactionIndex = nextIdx;
    const chosen = pool[nextIdx];
    const tracked = mem.factionHunters?.[chosen.factionKey];
    const customName =
      tracked?.name ||
      (chosen.archetype === 'GRUDGE_AVENGER' && mem.hasGrudge && mem.lastNemesisName ? mem.lastNemesisName : undefined);
    return {
      archetype: NEMESIS_ARCHETYPES[chosen.archetype] || NEMESIS_ARCHETYPES.BOUNTY_HUNTER,
      factionKey: chosen.factionKey,
      factionId: chosen.factionId ?? null,
      factionName: chosen.factionName,
      customName,
    };
  }
  const archetype = determineNemesisArchetype(player, context);
  const customName =
    archetype === NEMESIS_ARCHETYPES.GRUDGE_AVENGER && mem.hasGrudge && mem.lastNemesisName
      ? mem.lastNemesisName
      : undefined;
  return {
    archetype,
    factionKey: null,
    factionId: null,
    factionName: null,
    customName,
  };
}

/**
 * Returns active hostile-faction nemeses enriched with encounter memory.
 * @param {Object} player
 */
export function getActiveFactionNemeses(player) {
  const mem = getNemesisMemory();
  return evaluateFactionNemesisPool(player).map((entry) => ({
    ...entry,
    hunter: mem?.factionHunters?.[entry.factionKey] ?? null,
  }));
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
  let factionKey = null;
  let factionId = null;
  let factionName = null;
  let rng = Math.random;

  if (typeof nameOrOptions === 'string') {
    customName = nameOrOptions;
  } else if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
    if (nameOrOptions.name) customName = nameOrOptions.name;
    if (nameOrOptions.archetype) customArchetype = nameOrOptions.archetype;
    if (nameOrOptions.factionKey) factionKey = nameOrOptions.factionKey;
    if (nameOrOptions.factionId != null) factionId = nameOrOptions.factionId;
    if (nameOrOptions.factionName) factionName = nameOrOptions.factionName;
    if (typeof nameOrOptions.rng === 'function') rng = nameOrOptions.rng;
  }

  const archetype = customArchetype || NEMESIS_ARCHETYPES.BOUNTY_HUNTER;
  const namePool = ARCHETYPE_NAMES[archetype] || ARCHETYPE_NAMES[NEMESIS_ARCHETYPES.BOUNTY_HUNTER];
  const name = customName || namePool[Math.floor(rng() * namePool.length)];
  const className = ARCHETYPE_CLASSES[archetype] || 'Assassin';

  const nemesisLevel = Math.min(LEVEL_CAP, Math.max(1, playerLevel + 1));
  const gearTier = Math.min(9, Math.floor(nemesisLevel / 5) + 1);

  // Scaled minions based on Nemesis level and encounter scale
  const scale = getLivingEncounterScale();
  let minionCount = 0;
  if (scale === LIVING_ENCOUNTER_SCALE.LOW) {
    if (nemesisLevel >= 31) minionCount = rollEncounterRange(2, 3, rng);
    else if (nemesisLevel >= 16) minionCount = 2;
    else if (nemesisLevel >= 6) minionCount = 1;
    else minionCount = 0;
  } else if (scale === LIVING_ENCOUNTER_SCALE.MID) {
    if (nemesisLevel >= 31) minionCount = rollEncounterRange(3, 5, rng);
    else if (nemesisLevel >= 16) minionCount = rollEncounterRange(2, 4, rng);
    else if (nemesisLevel >= 6) minionCount = 2;
    else minionCount = 1;
  } else if (scale === LIVING_ENCOUNTER_SCALE.HIGH) {
    if (nemesisLevel >= 31) minionCount = rollEncounterRange(6, 9, rng);
    else if (nemesisLevel >= 16) minionCount = rollEncounterRange(5, 7, rng);
    else if (nemesisLevel >= 6) minionCount = rollEncounterRange(3, 4, rng);
    else minionCount = 2;
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
    factionKey,
    factionId,
    factionName,
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
 * @returns {{ resolution: string, message: string, bribeGold?: number }}
 */
export function resolveNemesisConfrontation(
  player,
  nemesis,
  approach,
  rng = Math.random,
) {
  if (approach === 'duel') {
    recordNemesisMemory(nemesis, NEMESIS_RESOLUTION.DUEL);
    return {
      resolution: NEMESIS_RESOLUTION.DUEL,
      message: `${nemesis.name} unsheathes cold steel. "Draw your blade; let blood settle this!"`,
    };
  }

  const difficulty = 40 + (nemesis.level * 3);

  // 1. Etiquette: Appeal to honor, heraldry, or chivalry
  if (approach === 'etiquette') {
    // Glory Challengers and Knights respect etiquette greatly (+20 bonus)
    const bonus = nemesis.archetype === NEMESIS_ARCHETYPES.GLORY_CHALLENGER ? 20 : 0;
    const rollRes = resolveLivingRoll({
      formulaId: 'SOCIAL_DIPLOMACY',
      playerEntity: player,
      skillId: SKILLS.Etiquette,
      statName: 'personality',
      difficulty,
      contextBonus: bonus,
      targetLevel: nemesis.level,
      rng,
    });

    if (rollRes.cleanSuccess) {
      recordNemesisMemory(nemesis, NEMESIS_RESOLUTION.PACIFIED);
      return {
        resolution: NEMESIS_RESOLUTION.PACIFIED,
        degree: rollRes.degree,
        rollResult: rollRes,
        message: `${nemesis.name} lowers their weapon. "A person of honour. This contract is dishonourable — I shall take my leave."`,
      };
    }

    if (rollRes.luckSaved) {
      recordNemesisMemory(nemesis, NEMESIS_RESOLUTION.LUCK_SAVED);
      return {
        resolution: NEMESIS_RESOLUTION.LUCK_SAVED,
        degree: rollRes.degree,
        rollResult: rollRes,
        message: `By blind fortune, a distraction turns ${nemesis.name}'s attention away, breaking their resolve to strike!`,
      };
    }
  }

  // 2. Streetwise: Buyout, underworld negotiation, or intimidation
  if (approach === 'streetwise') {
    // Bounty Hunters and Marauders are susceptible to gold/negotiation
    const bonus =
      nemesis.archetype === NEMESIS_ARCHETYPES.BOUNTY_HUNTER ||
      nemesis.archetype === NEMESIS_ARCHETYPES.CHAOTIC_MARAUDER
        ? 15
        : 0;
    const rollRes = resolveLivingRoll({
      formulaId: 'STREETWISE_LEVERAGE',
      playerEntity: player,
      skillId: SKILLS.Streetwise,
      statName: 'personality',
      difficulty,
      contextBonus: bonus,
      targetLevel: nemesis.level,
      rng,
    });

    if (rollRes.cleanSuccess) {
      if (nemesis.archetype === NEMESIS_ARCHETYPES.CHAOTIC_MARAUDER || rollRes.isTriumph && nemesis.archetype === NEMESIS_ARCHETYPES.GRUDGE_AVENGER) {
        recordNemesisMemory(nemesis, NEMESIS_RESOLUTION.INTIMIDATED);
        return {
          resolution: NEMESIS_RESOLUTION.INTIMIDATED,
          degree: rollRes.degree,
          rollResult: rollRes,
          bribeGold: 0,
          message: `${nemesis.name} blanches at your cold stare and backs away into the shadows.`,
        };
      }
      const baseBribe = Math.max(50, (nemesis.level || 1) * 40);
      const discountMult = rollRes.isTriumph
        ? Math.min(0.65, computeRoleplayBribeMultiplier(player, SKILLS.Streetwise))
        : computeRoleplayBribeMultiplier(player, SKILLS.Streetwise);
      const bribeGold = Math.max(50, Math.floor(baseBribe * discountMult));
      recordNemesisMemory(nemesis, NEMESIS_RESOLUTION.BRIBED);
      return {
        resolution: NEMESIS_RESOLUTION.BRIBED,
        degree: rollRes.degree,
        rollResult: rollRes,
        bribeGold,
        message: `${nemesis.name} smirks and accepts your pouch. "Good business doing business with you. I'll tell the employer you perished in the bay."`,
      };
    }

    if (rollRes.luckSaved) {
      recordNemesisMemory(nemesis, NEMESIS_RESOLUTION.LUCK_SAVED);
      return {
        resolution: NEMESIS_RESOLUTION.LUCK_SAVED,
        degree: rollRes.degree,
        rollResult: rollRes,
        message: `By blind fortune, a distraction turns ${nemesis.name}'s attention away, breaking their resolve to strike!`,
      };
    }
  }

  // 3. Taunt: "На слабо" dare that forces the Nemesis to dismiss minions and fight 1v1
  if (approach === 'taunt') {
    const rollRes = resolveLivingRoll({
      formulaId: 'STREETWISE_LEVERAGE',
      playerEntity: player,
      skillId: SKILLS.Streetwise,
      statName: 'personality',
      difficulty: difficulty - 10,
      targetLevel: nemesis.level,
      rng,
    });
    const chance = Math.max(15, Math.min(95, rollRes.playerScore - difficulty + 50));

    if (rollRes.cleanSuccess || rollRes.roll < chance) {
      // Strips minions out of the encounter!
      nemesis.minions = [];
      recordNemesisMemory(nemesis, NEMESIS_RESOLUTION.SOLO_DUEL_ACCEPTED);
      return {
        resolution: NEMESIS_RESOLUTION.SOLO_DUEL_ACCEPTED,
        degree: rollRes.degree,
        rollResult: rollRes,
        message: `${nemesis.name} sneers and gestures for their retinue to step back. "Stay out of this, fools! This cur is mine alone!"`,
      };
    }

    if (rollRes.luckSaved) {
      nemesis.minions = [];
      recordNemesisMemory(nemesis, NEMESIS_RESOLUTION.SOLO_DUEL_ACCEPTED);
      return {
        resolution: NEMESIS_RESOLUTION.SOLO_DUEL_ACCEPTED,
        degree: rollRes.degree,
        rollResult: rollRes,
        message: `${nemesis.name} waves their minions away in frustration. "One on one, coward!"`,
      };
    }
  }

  // Fallback on failed checks: Combat
  recordNemesisMemory(nemesis, NEMESIS_RESOLUTION.DUEL);
  return {
    resolution: NEMESIS_RESOLUTION.DUEL,
    bribeGold: 0,
    message: `${nemesis.name} draws steel with a cold grin. "Nice try, but your head is worth too much in gold. En garde!"`,
  };
}

function ensureNemesisMem() {
  const root = getLivingDirectorState();
  if (!root.subsystems.nemesis) {
    root.subsystems.nemesis = {
      encounters: 0,
      escapedCount: 0,
      lastNemesisName: null,
      lastArchetype: null,
      hasGrudge: false,
      lastFactionIndex: -1,
      factionHunters: {},
    };
  }
  const mem = root.subsystems.nemesis;
  if (typeof mem.lastFactionIndex !== 'number') mem.lastFactionIndex = -1;
  if (!mem.factionHunters || typeof mem.factionHunters !== 'object') mem.factionHunters = {};
  return mem;
}

/**
 * Records a Nemesis confrontation outcome into the persistent LivingDirector state
 * so recurring rivals remember past escapes, bribes, and defeats.
 *
 * @param {any} nemesis
 * @param {string} resolution
 */
export function recordNemesisMemory(nemesis, resolution) {
  if (!nemesis) return;
  const mem = ensureNemesisMem();
  mem.encounters = (mem.encounters || 0) + 1;
  mem.lastNemesisName = nemesis.name || mem.lastNemesisName;
  mem.lastArchetype = nemesis.archetype || mem.lastArchetype;
  const escaped =
    resolution === NEMESIS_RESOLUTION.PACIFIED ||
    resolution === NEMESIS_RESOLUTION.BRIBED ||
    resolution === NEMESIS_RESOLUTION.INTIMIDATED ||
    resolution === NEMESIS_RESOLUTION.LUCK_SAVED;
  if (escaped) {
    mem.escapedCount = (mem.escapedCount || 0) + 1;
    nemesis.escapedCount = (nemesis.escapedCount || 0) + 1;
  } else {
    mem.hasGrudge = true;
    nemesis.hasMemoryOfDefeat = true;
  }
  if (nemesis.factionKey) {
    const fh = mem.factionHunters[nemesis.factionKey] ?? {
      factionKey: nemesis.factionKey,
      factionName: nemesis.factionName || nemesis.factionKey,
      archetype: nemesis.archetype,
      name: nemesis.name,
      encounters: 0,
      escapedCount: 0,
      hasGrudge: false,
    };
    fh.encounters = (fh.encounters || 0) + 1;
    fh.name = nemesis.name || fh.name;
    fh.archetype = nemesis.archetype || fh.archetype;
    if (escaped) fh.escapedCount = (fh.escapedCount || 0) + 1;
    fh.hasGrudge = true;
    mem.factionHunters[nemesis.factionKey] = fh;
  }
}

/**
 * Marks a defeated or humiliated rival adventurer in Nemesis memory so they can
 * later hunt the player as a `GRUDGE_AVENGER`.
 *
 * @param {string|null|undefined} advName
 */
export function recordAdventurerGrudge(advName) {
  if (!advName) return;
  const mem = ensureNemesisMem();
  mem.hasGrudge = true;
  mem.lastNemesisName = String(advName);
  mem.lastArchetype = NEMESIS_ARCHETYPES.GRUDGE_AVENGER;
}

/**
 * Clears an active Nemesis grudge once the Nemesis hunter is slain.
 */
export function clearNemesisGrudge() {
  const root = getLivingDirectorState();
  if (root?.subsystems?.nemesis) {
    root.subsystems.nemesis.hasGrudge = false;
  }
}

/**
 * Returns the persistent Nemesis encounter memory from LivingDirector.
 */
export function getNemesisMemory() {
  const root = getLivingDirectorState();
  return root?.subsystems?.nemesis || {
    encounters: 0,
    escapedCount: 0,
    lastNemesisName: null,
    lastArchetype: null,
    hasGrudge: false,
    lastFactionIndex: -1,
    factionHunters: {},
  };
}
