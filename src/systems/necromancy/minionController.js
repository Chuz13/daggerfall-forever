// @ts-check
// MINION-CONTROLLER: Tactical command system, AI stance management,
// shadow tethering, and willpower rebellion checks for active undead.
//
// Key principles:
// 1. Minions have distinct tactical roles and combat profiles.
// 2. Commands: FOLLOW, GUARD (feign death / ambush), ATTACK, RECALL.
// 3. Shadow Tether: Auto-snaps stuck or falling minions back to master.
// 4. Rebellion: If master's mental stamina breaks (0 Magicka/Fatigue),
//    undead can break the leash and attack the caster.

import { addUndeadMinion, removeUndeadMinion, usedUndeadPoints, setUndeadMinionsStance } from './undeadCapacity.js';
import { liveStat } from '../statMods.js';
import { NecroConfig } from './necroConfig.js';

export const MINION_STANCES = Object.freeze({
  FOLLOW: 'follow',
  GUARD: 'guard',
  FEIGN_DEATH: 'feign_death',
  ATTACK: 'attack',
});

export const MINION_PROFILES = Object.freeze({
  skeleton: {
    type: 'skeleton',
    name: 'Skeletal Minion',
    baseHealth: 60,
    speed: 1.1,
    immunePoison: true,
    immuneParalysis: true,
    weaknessBlunt: 1.5,
  },
  zombie: {
    type: 'zombie',
    name: 'Rotting Zombie',
    baseHealth: 150,
    speed: 0.65,
    immunePoison: true,
    immuneParalysis: true,
    diseaseOnHit: true,
    resistSlashing: 0.75,
  },
  ghost: {
    type: 'ghost',
    name: 'Bound Phantom',
    baseHealth: 80,
    speed: 1.0,
    ethereal: true,
    drainFatigue: true,
  },
  mummy: {
    type: 'mummy',
    name: 'Crypt Mummy',
    baseHealth: 220,
    speed: 0.7,
    curseOnHit: true,
    weaknessFire: 2.0,
  },
  lich: {
    type: 'lich',
    name: 'Bound Lich',
    baseHealth: 350,
    speed: 0.9,
    spellCaster: true,
    darkAura: true,
  },
});

/** @type {Map<string, object>} */
const _spawnedMinions = new Map();

let _minionIdCounter = 1;

/**
 * Spawns an undead minion in the game world.
 * @param {object} params
 * @param {'skeleton'|'zombie'|'ghost'|'mummy'|'lich'} params.type
 * @param {[number, number, number]} params.position
 * @param {object} params.masterEntity
 * @param {string} [params.name]
 * @returns {object} The spawned minion instance
 */
export function spawnMinion({
  type = 'skeleton',
  position = [0, 0, 0],
  masterEntity = null,
  name = null,
} = {}) {
  const profile = MINION_PROFILES[type] || MINION_PROFILES.skeleton;
  const id = `minion_${Date.now().toString(36)}_${_minionIdCounter++}`;

  const minion = {
    id,
    type,
    name: name || profile.name,
    health: profile.baseHealth,
    maxHealth: profile.baseHealth,
    position: [...position],
    feet: [...position],
    stance: MINION_STANCES.FOLLOW,
    master: masterEntity,
    profile,
    dead: false,
    rebelled: false,
    spawnTime: Date.now(),
  };

  _spawnedMinions.set(id, minion);
  addUndeadMinion({
    id,
    type,
    name: minion.name,
    health: minion.health,
  });

  return minion;
}

/**
 * Fetches an active spawned minion by ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getSpawnedMinion(id) {
  return _spawnedMinions.get(id) || null;
}

/**
 * Returns all live spawned minions.
 * @returns {Array<object>}
 */
export function allSpawnedMinions() {
  return Array.from(_spawnedMinions.values()).filter((m) => !m.dead);
}

/**
 * Updates the tactical stance of a specific minion.
 * @param {string} minionId
 * @param {'follow'|'guard'|'feign_death'|'attack'} stance
 * @returns {boolean}
 */
export function setMinionStance(minionId, stance) {
  const m = getSpawnedMinion(minionId);
  if (!m || m.dead || m.rebelled) return false;
  if (!Object.values(MINION_STANCES).includes(stance)) return false;
  m.stance = stance;
  return true;
}

/**
 * Updates the tactical stance for all commanded minions at once.
 * @param {'follow'|'guard'|'feign_death'|'attack'} stance
 * @returns {number} Count of updated minions
 */
export function setAllMinionsStance(stance) {
  if (!Object.values(MINION_STANCES).includes(stance)) return 0;
  let count = 0;
  for (const m of allSpawnedMinions()) {
    if (!m.rebelled) {
      m.stance = stance;
      count++;
    }
  }
  setUndeadMinionsStance(stance);
  return count;
}

/**
 * "Shadow Tether": Recalls all active followers directly to the master's side.
 * Resolves stuck pathfinding or elevation drops.
 * @param {[number, number, number]} masterPosition
 * @param {number} [spreadRadius=1.5]
 * @returns {number} Number of recalled minions
 */
export function orderRecall(masterPosition, spreadRadius = 1.5) {
  if (!masterPosition) return 0;
  const [mx, my, mz] = masterPosition;
  const minions = allSpawnedMinions();
  let recalled = 0;

  minions.forEach((m, idx) => {
    if (m.rebelled) return;
    const angle = (idx / Math.max(1, minions.length)) * Math.PI * 2;
    const nx = mx + Math.cos(angle) * spreadRadius;
    const nz = mz + Math.sin(angle) * spreadRadius;

    m.position = [nx, my, nz];
    m.feet = [nx, my, nz];
    m.stance = MINION_STANCES.FOLLOW;
    recalled++;
  });

  return recalled;
}

/**
 * Detonates a minion for an explosive sacrifice.
 * @param {string} minionId
 * @param {object} [options]
 * @param {number} [options.radius=6]
 * @param {number} [options.damage=50]
 * @param {Array<object>} [options.nearbyFoes=[]]
 * @returns {{ success: boolean, hitCount: number, damage: number, reason?: string }}
 */
export function detonateMinion(minionId, { radius = 6, damage = 50, nearbyFoes = [] } = {}) {
  const m = getSpawnedMinion(minionId);
  if (!m || m.dead) return { success: false, hitCount: 0, damage: 0, reason: 'Invalid minion' };

  m.dead = true;
  removeUndeadMinion(minionId);
  _spawnedMinions.delete(minionId);

  const [cx, cy, cz] = m.position;
  let hitCount = 0;

  for (const foe of nearbyFoes) {
    if (!foe || foe.dead) continue;
    const [fx, fy, fz] = foe.feet || foe.position || [0, 0, 0];
    const dist = Math.hypot(fx - cx, fy - cy, fz - cz);
    if (dist <= radius) {
      if (typeof foe.hurt === 'function') {
        foe.hurt(damage);
      } else if (typeof foe.health === 'number') {
        foe.health = Math.max(0, foe.health - damage);
        if (foe.health <= 0) foe.dead = true;
      }
      hitCount++;
    }
  }

  return { success: true, hitCount, damage };
}

/**
 * Checks if a minion rebels against its master due to depleted willpower or magicka exhaustion.
 * @param {object} playerEntity
 * @param {object} minion
 * @param {object} [options]
 * @param {() => number} [options.rolls]
 * @returns {boolean} True if minion broke leash and rebelled
 */
export function checkMinionRebellion(playerEntity, minion, { rolls = Math.random } = {}) {
  if (!NecroConfig.minionRebellion) return false;
  if (!minion || minion.dead || minion.rebelled) return false;
  if (!playerEntity) return false;

  const curFatigue = playerEntity.fatigue ?? playerEntity.currentFatigue ?? 100;
  const curMagicka = playerEntity.magicka ?? playerEntity.currentMagicka ?? 100;
  const willpower =
    liveStat(playerEntity, 'willpower') ||
    liveStat(playerEntity, 'Willpower') ||
    playerEntity.stats?.willpower ||
    playerEntity.stats?.Willpower ||
    50;

  // Master is fully fit: leash holds firm
  if (curFatigue > 0 && curMagicka > 0) return false;

  // Exhaustion danger threshold
  const usedSlots = usedUndeadPoints();
  const safeControlPoints = Math.floor(willpower / 15);

  if (usedSlots > safeControlPoints) {
    const dangerScore = (usedSlots - safeControlPoints) * 0.15;
    if (rolls() < dangerScore) {
      minion.rebelled = true;
      minion.stance = MINION_STANCES.ATTACK;
      removeUndeadMinion(minion.id);
      return true;
    }
  }

  return false;
}

/**
 * Dismisses and destroys all active spawned minions.
 */
export function dismissAllMinions() {
  for (const m of _spawnedMinions.values()) {
    m.dead = true;
  }
  _spawnedMinions.clear();
}

/**
 * Test helper to clear spawned minions.
 */
export function _resetMinionControllerForTests() {
  _spawnedMinions.clear();
  _minionIdCounter = 1;
}

