// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// NEMESIS & RIVAL HUNTER HOST (Living Tamriel)
//
// Dispatches a leveled rival bounty hunter when player infamy is high or
// dark contracts exist. Features multiple dialogue resolutions (Etiquette,
// Streetwise, Luck) and duel mechanics.
// ═══════════════════════════════════════════════════════════════════════════════

import { SKILLS, skillValue } from '../skills.js';
import { liveStat } from '../statMods.js';
import { dice100 } from '../../combat/formulas.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';

export const NEMESIS_RESOLUTION = Object.freeze({
  DUEL: 'DUEL',           // Social checks failed -> Fight to the death
  PACIFIED: 'PACIFIED',   // Etiquette check succeeded -> Honorable stand-down
  BRIBED: 'BRIBED',       // Streetwise check succeeded -> Contract bought out
  LUCK_SAVED: 'LUCK_SAVED', // Second chance by Luck saved the encounter
});

/**
 * Evaluates whether conditions merit dispatching a Nemesis hunter.
 * @param {Object} player
 * @param {number} legalReputation Negative legal reputation in current province
 * @param {number} [playerLevel=1]
 * @returns {boolean}
 */
export function shouldDispatchNemesis(player, legalReputation = 0, playerLevel = 1) {
  const tier = Number(LivingTamrielConfig.adventurers);
  if (tier === PRESENCE.OFF) return false;
  // Dispatched when legal reputation drops below -20 or player level >= 5
  return legalReputation <= -20 && playerLevel >= 3;
}

/**
 * Creates a leveled Nemesis hunter record.
 * @param {number} playerLevel
 * @param {string} [name='Valen the Relentless']
 */
export function createNemesisHunter(playerLevel, name = 'Valen the Relentless') {
  return {
    name,
    level: Math.max(1, playerLevel + 1), // Slightly above player
    className: 'Assassin',
    gearTier: Math.min(6, Math.floor(playerLevel / 3) + 2),
    contractBounty: playerLevel * 250,
    escapedCount: 0,
    hasMemoryOfDefeat: false,
  };
}

/**
 * Resolves dialogue confrontation with the Nemesis.
 *
 * @param {Object} player Player entity
 * @param {Object} nemesis Nemesis entity record
 * @param {'etiquette'|'streetwise'} approach Chosen dialogue tactic
 * @param {() => number} [rng]
 * @returns {{ resolution: string, message: string }}
 */
export function resolveNemesisConfrontation(
  player,
  nemesis,
  approach,
  rng = Math.random,
) {
  const isEtiquette = approach === 'etiquette';
  const skillId = isEtiquette ? SKILLS.Etiquette : SKILLS.Streetwise;
  const skillVal = skillValue(player, skillId) || 30;
  const personality = liveStat(player, 'personality') || 50;
  const luck = liveStat(player, 'luck') || 50;

  // Base threshold: Target difficulty scales with Nemesis level
  const difficulty = 40 + (nemesis.level * 3);
  const totalScore = skillVal + Math.trunc(personality / 3);

  const roll = rng() * 100;

  if (roll + totalScore >= difficulty + 50) {
    // Primary success
    if (isEtiquette) {
      return {
        resolution: NEMESIS_RESOLUTION.PACIFIED,
        message: `${nemesis.name} lowers their weapon. "A person of honour. This contract is dishonourable — I shall take my leave."`,
      };
    } else {
      return {
        resolution: NEMESIS_RESOLUTION.BRIBED,
        message: `${nemesis.name} smirks and accepts your pouch. "Good business doing business with you. I'll tell the employer you perished in the bay."`,
      };
    }
  }

  // Check narrow failure for Luck reroll
  const delta = (difficulty + 50) - (roll + totalScore);
  const luckThreshold = LivingTamrielConfig.luckRerollThreshold || 5;

  if (delta <= luckThreshold) {
    if (dice100(Math.trunc(luck / 2), rng())) {
      return {
        resolution: NEMESIS_RESOLUTION.LUCK_SAVED,
        message: `By blind fortune, a distraction turns ${nemesis.name}'s attention away, breaking their resolve to strike!`,
      };
    }
  }

  // Failure: Duel
  return {
    resolution: NEMESIS_RESOLUTION.DUEL,
    message: `${nemesis.name} draws steel with a cold grin. "Nice try, but your head is worth too much in gold. En garde!"`,
  };
}
