// MINION-CONTROLLER: Tactical command system, AI stance management,
// shadow tethering, and willpower rebellion checks for active undead.
//
// Key principles:
// 1. Minions have distinct tactical roles and combat profiles.
// 2. Commands: FOLLOW, GUARD (feign death / ambush), ATTACK, RECALL.
// 3. Shadow Tether: Auto-snaps stuck or falling minions back to master.
// 4. Rebellion: If master's mental stamina breaks (0 Magicka/Fatigue),
//    undead can break the leash and attack the caster.

import {
  addUndeadMinion,
  removeUndeadMinion,
  usedUndeadPoints,
  setUndeadMinionsStance,
  getUndeadCapacityEntry,
  releaseControlledUndeadFromCapacity,
  releaseAllControlledUndeadFromCapacity,
} from './undeadCapacity.js';
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
  wraith: {
    type: 'wraith',
    name: 'Bound Wraith',
    baseHealth: 180,
    speed: 1.0,
    ethereal: true,
    spellCaster: true,
  },
  vampire: {
    type: 'vampire',
    name: 'Thrall Vampire',
    baseHealth: 260,
    speed: 1.15,
    spellCaster: true,
  },
  vampire_ancient: {
    type: 'vampire_ancient',
    name: 'Ancient Vampire Thrall',
    baseHealth: 420,
    speed: 1.2,
    spellCaster: true,
  },
  lich: {
    type: 'lich',
    name: 'Bound Lich',
    baseHealth: 350,
    speed: 0.9,
    spellCaster: true,
    darkAura: true,
  },
  ancient_lich: {
    type: 'ancient_lich',
    name: 'Ancient Lich',
    baseHealth: 600,
    speed: 0.95,
    spellCaster: true,
    darkAura: true,
    spectralShield: true,
  },
  cadaver: {
    type: 'cadaver',
    name: 'Flesh Colossus',
    mobileType: 37,
    scale: 1.35,
    slotCost: 6,
    upkeep: 4,
    baseHealth: 250,
    speed: 0.85,
    minDmg: 25,
    maxDmg: 45,
    sunderOnHit: 2,
    blunt: true,
    immunePoison: true,
    immuneParalysis: true,
    resistMagic: 25,
  },
});

/** @type {Map<string, object>} */
const _spawnedMinions = new Map();

let _minionIdCounter = 1;
let _controlledReleaseHook = null;

/**
 * Registers a scene callback invoked when a controlled undead loses control (timer expiry or console command).
 * @param {((minion: object, capEntry: object|null) => void)|null} fn
 */
export function registerControlledReleaseHook(fn) {
  _controlledReleaseHook = typeof fn === 'function' ? fn : null;
}

/**
 * Spawns an undead minion in the game world.
 * @param {object} params
 * @param {string} [params.type]
 * @param {[number, number, number]} [params.position]
 * @param {object} [params.masterEntity]
 * @param {string} [params.name]
 * @param {boolean} [params.controlled]
 * @param {number|null} [params.roundsRemaining]
 * @param {number|null} [params.mobile]
 * @param {object|null} [params.sceneBody]
 * @param {number|null} [params.health]
 * @param {number|null} [params.maxHealth]
 * @returns {object} The spawned minion instance
 */
export function spawnMinion({
  type = 'skeleton',
  position = [0, 0, 0],
  masterEntity = null,
  name = null,
  controlled = false,
  roundsRemaining = null,
  mobile = null,
  sceneBody = null,
  health = null,
  maxHealth = null,
  stance = null,
} = {}) {
  const profile = MINION_PROFILES[type] || MINION_PROFILES.skeleton;
  const id = `minion_${Date.now().toString(36)}_${_minionIdCounter++}`;
  const hp = Number.isFinite(health) && health > 0 ? health : profile.baseHealth;
  const maxHp = Number.isFinite(maxHealth) && maxHealth > 0 ? maxHealth : Math.max(hp, profile.baseHealth);

  const minion = {
    id,
    type,
    name: name || profile.name,
    health: hp,
    maxHealth: maxHp,
    slotCost: profile.slotCost ?? null,
    upkeep: profile.upkeep ?? null,
    position: [...position],
    feet: [...position],
    stance: stance || MINION_STANCES.FOLLOW,
    master: masterEntity,
    profile,
    dead: false,
    rebelled: false,
    controlled: !!controlled,
    roundsRemaining: controlled && Number.isFinite(roundsRemaining) ? Math.max(1, Math.round(roundsRemaining)) : null,
    mobile: mobile ?? profile.mobileType ?? null,
    sceneBody: sceneBody ?? null,
    spawnTime: Date.now(),
  };

  _spawnedMinions.set(id, minion);
  addUndeadMinion({
    id,
    type,
    name: minion.name,
    health: minion.health,
    maxHealth: minion.maxHealth,
    slotCost: minion.slotCost,
    upkeep: minion.upkeep,
    profile: minion.profile,
    controlled: minion.controlled,
    roundsRemaining: minion.roundsRemaining,
    mobile: minion.mobile,
    sceneBody: minion.sceneBody,
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
export function detonateMinion(minionId = null, { radius = 6, damage = 50, nearbyFoes = [] } = {}) {
  let m = typeof minionId === 'string' ? getSpawnedMinion(minionId) : (minionId?.id ? (getSpawnedMinion(minionId.id) || minionId) : null);
  if (!m && minionId === null) {
    for (const cand of _spawnedMinions.values()) {
      if (!cand.dead) {
        m = cand;
        break;
      }
    }
  }
  if (!m || m.dead) return { success: false, hitCount: 0, damage: 0, reason: 'Invalid minion' };

  m.dead = true;
  removeUndeadMinion(m.id);
  _spawnedMinions.delete(m.id);

  const [cx, cy, cz] = m.position || [0, 0, 0];
  let hitCount = 0;

  for (const foe of nearbyFoes) {
    if (!foe || foe.dead) continue;
    if (foe.isPlayer || foe.allied || foe.team === 'PlayerAlly' || foe.entity?.team === 'PlayerAlly' || foe.livingRole === 'undead_minion') {
      continue;
    }
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

  return { success: true, hitCount, damage, minion: m, id: m.id, maxHealth: m.maxHealth, position: m.position };
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
  if (!playerEntity) return false;
  if (Array.isArray(minion)) {
    let anyRebelled = false;
    for (const m of minion) {
      if (m && !m.controlled && checkMinionRebellion(playerEntity, m, { rolls })) {
        anyRebelled = true;
      }
    }
    return anyRebelled;
  }
  if (!minion || minion.dead || minion.rebelled || minion.controlled) return false;

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
 * Releases a single controlled undead minion (acquired via Control Undead spell),
 * turning it back into a hostile enemy without affecting corpse-raised summons.
 * @param {string} minionId
 * @returns {object|null}
 */
export function releaseControlledUndead(minionId) {
  const m = getSpawnedMinion(minionId);
  if (!m || !m.controlled) return null;
  m.rebelled = true;
  m.releasedFromControl = true;
  m.stance = MINION_STANCES.ATTACK;
  _spawnedMinions.delete(minionId);
  const capEntry = releaseControlledUndeadFromCapacity(minionId);
  if (_controlledReleaseHook) {
    _controlledReleaseHook(m, capEntry);
  }
  return m;
}

/**
 * Releases ALL undead minions that were acquired via the Control Undead spell effect.
 * Corpse-raised summons (controlled === false) are completely untouched.
 * @returns {Array<object>} List of released controlled minions
 */
export function releaseAllControlledUndead() {
  const released = [];
  for (const [id, m] of Array.from(_spawnedMinions.entries())) {
    if (m && m.controlled && !m.dead) {
      const r = releaseControlledUndead(id);
      if (r) released.push(r);
    }
  }
  // Also ensure any orphan capacity entries marked controlled are released
  const orphanCap = releaseAllControlledUndeadFromCapacity();
  for (const cap of orphanCap) {
    if (!released.some((r) => r.id === cap.id)) {
      if (_controlledReleaseHook) _controlledReleaseHook(cap, cap);
      released.push(cap);
    }
  }
  return released;
}

/**
 * Ticks duration for all active controlled undead once per magic round.
 * Corpse-raised summons (controlled === false) do not have roundsRemaining and never expire on timer.
 * @param {object} [opts]
 * @param {((msg: string) => void)|null} [opts.say]
 * @returns {Array<object>} List of controlled minions whose duration expired this round
 */
export function tickControlledUndeadRound({ say = null } = {}) {
  const expired = [];
  for (const [id, m] of Array.from(_spawnedMinions.entries())) {
    if (!m || m.dead || !m.controlled) continue;
    if (typeof m.roundsRemaining === 'number') {
      m.roundsRemaining -= 1;
      const capEntry = getUndeadCapacityEntry(id);
      if (capEntry) capEntry.roundsRemaining = m.roundsRemaining;
      if (m.roundsRemaining <= 0) {
        const r = releaseControlledUndead(id);
        if (r) {
          expired.push(r);
          if (typeof say === 'function') {
            say(`${r.name || 'Controlled undead'} breaks free from your control!`);
          }
        }
      }
    }
  }
  return expired;
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

