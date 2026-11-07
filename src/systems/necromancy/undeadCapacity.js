// @ts-check
// UNDEAD-CAPACITY: Control limit calculations and integration with
// Daggerfall Forever's unified companion slots system (companionSlots.js).
//
// Key principles:
// 1. Minions have tier-based slot weights (Skeletons: 1, Zombies: 2, Mummies: 4, Liches: 8).
// 2. Control pool scales smoothly from player's Intelligence, Willpower, and Mysticism skill.
// 3. Registers under kind 'undead' with companionSlots.js so other systems know how many walk at heel.

import { registerCompanionCount, registerCompanionRoster } from '../companionSlots.js';
import { liveStat } from '../statMods.js';
import { skillValue, SKILLS } from '../skills.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';
import { NecroConfig, CAP_MODES } from './necroConfig.js';

export const UNDEAD_SLOT_COST = Object.freeze({
  skeleton: 1,
  zombie: 2,
  ghost: 2,
  mummy: 4,
  lich: 8,
});

/** @type {Array<object>} */
const _activeMinions = [];

/**
 * Calculates max undead control points a character can command simultaneously.
 * @param {object} playerEntity
 * @param {object} [options]
 * @param {number} [options.fixedCap] If setting specifies a fixed cap
 * @returns {number}
 */
export function calculateUndeadCapacity(playerEntity, { fixedCap = null } = {}) {
  if (fixedCap !== null && fixedCap > 0) {
    return Math.floor(fixedCap);
  }
  if (NecroConfig.capMode === CAP_MODES.FIXED) {
    return NecroConfig.fixedCap;
  }

  if (!playerEntity) return 1;

  const intVal =
    liveStat(playerEntity, 'intelligence') ||
    liveStat(playerEntity, 'Intelligence') ||
    playerEntity.stats?.intelligence ||
    playerEntity.stats?.Intelligence ||
    50;
  const wilVal =
    liveStat(playerEntity, 'willpower') ||
    liveStat(playerEntity, 'Willpower') ||
    playerEntity.stats?.willpower ||
    playerEntity.stats?.Willpower ||
    50;
  const mystVal = skillValue(playerEntity, SKILLS.Mysticism) || 15;

  const intBonus = Math.floor(intVal / 20);
  const wilBonus = Math.floor(wilVal / 30);
  const skillBonus = Math.floor(mystVal / 25);

  return Math.max(1, intBonus + wilBonus + skillBonus);
}

/**
 * Returns total control points currently consumed by active minions.
 * @returns {number}
 */
export function usedUndeadPoints() {
  let sum = 0;
  for (const m of _activeMinions) {
    if (!m.dead) {
      sum += UNDEAD_SLOT_COST[m.type] || 1;
    }
  }
  return sum;
}

/**
 * Returns raw count of active minions walking with player.
 * @returns {number}
 */
export function activeUndeadCount() {
  return _activeMinions.filter((m) => !m.dead).length;
}

/**
 * Returns list of active minions formatted for the companion roster.
 * @returns {Array<{ name: string, role: string, type: string, id: string }>}
 */
export function activeUndeadRoster() {
  return _activeMinions
    .filter((m) => !m.dead)
    .map((m) => ({
      name: m.name || `Undead ${m.type}`,
      role: `Minion (${m.type})`,
      type: m.type,
      id: m.id,
    }));
}

/**
 * Checks if the player has enough capacity to summon or raise an undead minion.
 * @param {object} playerEntity
 * @param {'skeleton'|'zombie'|'ghost'|'mummy'|'lich'} minionType
 * @param {object} [options]
 * @returns {boolean}
 */
export function canAffordUndead(playerEntity, minionType, options = {}) {
  const cost = UNDEAD_SLOT_COST[minionType] || 1;
  const cap = calculateUndeadCapacity(playerEntity, options);
  const used = usedUndeadPoints();
  return used + cost <= cap;
}

/**
 * Adds an undead minion to the active commanded list.
 * @param {object} minion
 * @param {string} minion.id
 * @param {string} minion.type
 * @param {string} [minion.name]
 * @param {number} [minion.health]
 * @returns {boolean}
 */
export function addUndeadMinion(minion) {
  if (!minion || !minion.id) return false;
  _activeMinions.push({
    id: minion.id,
    type: minion.type || 'skeleton',
    name: minion.name || `Raised ${minion.type || 'Undead'}`,
    health: minion.health || 50,
    dead: false,
    raisedTimestamp: Date.now(),
  });
  return true;
}

/**
 * Marks a minion dead or removes it from active command.
 * @param {string} minionId
 * @returns {boolean}
 */
export function removeUndeadMinion(minionId) {
  const idx = _activeMinions.findIndex((m) => m.id === minionId);
  if (idx !== -1) {
    _activeMinions.splice(idx, 1);
    return true;
  }
  return false;
}

/**
 * Returns all active undead minions.
 * @returns {Array<object>}
 */
export function activeUndead() {
  return _activeMinions.filter((m) => !m.dead);
}

import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';

function minionMobileType(type) {
  switch (String(type).toLowerCase()) {
    case 'zombie': return MOBILE_TYPES.Zombie;
    case 'ghost': return MOBILE_TYPES.Ghost;
    case 'mummy': return MOBILE_TYPES.Mummy;
    case 'wraith': return MOBILE_TYPES.Wraith;
    case 'lich': return MOBILE_TYPES.Lich;
    case 'skeleton':
    default:
      return MOBILE_TYPES.SkeletalWarrior;
  }
}

/**
 * Unified party bridge for crewAshore 3D follower simulation.
 */
export const undeadParty = {
  get party() {
    return _activeMinions
      .filter((m) => !m.dead)
      .map((m) => {
        m.key = m.key || m.id;
        m.boat = 'undead';
        m.team = 'PlayerAlly';
        m.mobileTeam = 'PlayerAlly';
        m.mobile = m.mobile || minionMobileType(m.type);
        m.gender = m.gender || 'unspecified';
        return m;
      });
  },
  wake: () => {},
  isAshore: (boat, name) => {
    return _activeMinions.some(
      (m) => (m.name === name || m.id === name || m.key === name) && !m.dead
    );
  },
  knock: (boat, name) => {
    const minion = _activeMinions.find((m) => m.name === name || m.id === name || m.key === name);
    if (minion) minion.dead = true;
    return true;
  },
  hurt: (boat, name, hp, maxHp) => {
    const minion = _activeMinions.find((m) => m.name === name || m.id === name || m.key === name);
    if (minion) {
      minion.health = hp;
      minion.maxHealth = maxHp;
      if (hp <= 0) minion.dead = true;
    }
  },
};

/**
 * Registers this subsystem with DFF's unified companion slots engine.
 */
export function initUndeadCompanionAdapter() {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) return;
  registerCompanionCount('undead', () => activeUndeadCount());
  registerCompanionRoster('undead', () => activeUndeadRoster());
}

/**
 * Clears all active undead minions from the capacity tracker.
 */
export function clearAllUndeadMinions() {
  _activeMinions.length = 0;
}

/**
 * Resets state for unit testing.
 */
export function _resetUndeadCapacityForTests() {
  _activeMinions.length = 0;
}

