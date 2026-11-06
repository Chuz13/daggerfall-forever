// @ts-check
// NECROMANTIC-SPELLS: Dark Arts spell builders and runtime cast resolvers.
// Integrated into DFF's classic spell record system and magic schools:
// - Animate Dead (47,255) -> Mysticism
// - Corpse Explosion (48,255) -> Destruction
// - Life Tap (49,255) -> Restoration
// - Bone Armor (51,255) -> Alteration

import { FORK_FLAGS } from '../../config/forkFlags.js';
import { getCorpse, consumeCorpse, CORPSE_STATE } from './corpseRegistry.js';
import { canAffordUndead } from './undeadCapacity.js';
import { spawnMinion } from './minionController.js';
import { skillValue, SKILLS } from '../skills.js';
import { NecroConfig, CORPSE_REQ_MODES } from './necroConfig.js';

export const NECRO_SPELL_KEYS = Object.freeze({
  ANIMATE_DEAD: '47,255',
  CORPSE_EXPLOSION: '48,255',
  LIFE_TAP: '49,255',
  BONE_ARMOR: '51,255',
});

/**
 * Creates a ready-made spell record for Animate Dead.
 * @returns {object}
 */
export function animateDeadSpell() {
  return {
    index: -47,
    name: 'Animate Dead',
    icon: 25,
    rangeType: 1, // ByTouch / Target
    element: 4,   // Magic
    effects: [
      {
        type: 47,
        subType: 255,
        duration: 0,
        chance: 100,
        magnitude: 1,
      },
    ],
  };
}

/**
 * Creates a ready-made spell record for Corpse Explosion.
 * @returns {object}
 */
export function corpseExplosionSpell() {
  return {
    index: -48,
    name: 'Corpse Explosion',
    icon: 12,
    rangeType: 4, // AreaAtRange
    element: 0,   // Fire/Magic detonation
    effects: [
      {
        type: 48,
        subType: 255,
        duration: 0,
        chance: 100,
        magnitude: 40,
      },
    ],
  };
}

/**
 * Creates a ready-made spell record for Life Tap.
 * @returns {object}
 */
export function lifeTapSpell() {
  return {
    index: -49,
    name: 'Life Tap',
    icon: 8,
    rangeType: 2, // SingleTargetAtRange
    element: 4,   // Magic
    effects: [
      {
        type: 49,
        subType: 255,
        duration: 0,
        chance: 100,
        magnitude: 30,
      },
    ],
  };
}

/**
 * Creates a ready-made spell record for Bone Armor.
 * @returns {object}
 */
export function boneArmorSpell() {
  return {
    index: -51,
    name: 'Bone Armor',
    icon: 17,
    rangeType: 0, // CasterOnly
    element: 4,   // Magic
    effects: [
      {
        type: 51,
        subType: 255,
        duration: 15, // 15 rounds
        chance: 100,
        magnitude: 50, // 50 damage shield
      },
    ],
  };
}

/**
 * Executes Animate Dead on a targeted corpse.
 * @param {object} caster Entity casting the spell
 * @param {object|string} targetCorpse Corpse record or ID
 * @param {object} [options]
 * @returns {{ success: boolean, minion?: object, reason?: string }}
 */
export function castAnimateDead(caster, targetCorpse, { rolls = Math.random } = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { success: false, reason: 'Necromancy is disabled' };
  }

  const casterEntity = caster?.entity || caster;

  // In Abstract mode, can conjure from thin air if no corpse provided
  if (!targetCorpse && NecroConfig.corpseRequirement === CORPSE_REQ_MODES.ABSTRACT) {
    if (!canAffordUndead(casterEntity, 'skeleton')) {
      return { success: false, reason: 'Insufficient undead control capacity' };
    }
    const spawnPos = casterEntity?.position ? [...casterEntity.position] : [0, 0, 0];
    const minion = spawnMinion({
      type: 'skeleton',
      position: spawnPos,
      masterEntity: casterEntity,
    });
    return { success: true, minion };
  }

  const corpse = typeof targetCorpse === 'string' ? getCorpse(targetCorpse) : targetCorpse;
  if (!corpse || corpse.consumed) {
    return { success: false, reason: 'Target is not a viable corpse' };
  }

  // Determine what can be raised based on decay state and entity type
  let minionType = 'skeleton';
  if (corpse.corpseState === CORPSE_STATE.FRESH) {
    minionType = corpse.entityType === 'undead' ? 'mummy' : 'zombie';
  } else if (corpse.corpseState === CORPSE_STATE.DECAYING) {
    minionType = 'zombie';
  } else if (corpse.corpseState === CORPSE_STATE.SKELETAL) {
    minionType = 'skeleton';
  } else {
    return { success: false, reason: 'Corpse has been desecrated' };
  }

  // Capacity check
  if (!canAffordUndead(casterEntity, minionType)) {
    return { success: false, reason: 'Insufficient undead control capacity' };
  }

  // Consume corpse from the world
  consumeCorpse(corpse.id);

  // Spawn the minion
  const minion = spawnMinion({
    type: minionType,
    position: corpse.position,
    masterEntity: casterEntity,
  });

  return {
    success: true,
    minion,
  };
}

/**
 * Executes Corpse Explosion, destroying the corpse and damaging surrounding enemies.
 * @param {object} caster
 * @param {object|string} targetCorpse
 * @param {object} [options]
 * @param {number} [options.radius=6]
 * @param {number} [options.baseDamage=40]
 * @param {Array<object>} [options.nearbyFoes=[]]
 * @returns {{ success: boolean, hitCount: number, damage: number, reason?: string }}
 */
export function castCorpseExplosion(caster, targetCorpse, { radius = 6, baseDamage = 40, nearbyFoes = [] } = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { success: false, hitCount: 0, damage: 0, reason: 'Necromancy is disabled' };
  }

  const corpse = typeof targetCorpse === 'string' ? getCorpse(targetCorpse) : targetCorpse;
  if (!corpse || corpse.consumed) {
    return { success: false, hitCount: 0, damage: 0, reason: 'No corpse to detonate' };
  }

  const casterEntity = caster?.entity || caster;
  const destSkill = skillValue(casterEntity, SKILLS.Destruction) || 20;
  const damage = Math.round(baseDamage * (0.8 + destSkill / 100));

  // Consume corpse
  consumeCorpse(corpse.id);

  const [cx, cy, cz] = corpse.position;
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

  return {
    success: true,
    hitCount,
    damage,
  };
}

/**
 * Executes Life Tap, siphoning health from target to caster.
 * @param {object} caster
 * @param {object} target
 * @param {number} [amount=30]
 * @returns {{ success: boolean, drained: number, reason?: string }}
 */
export function castLifeTap(caster, target, amount = 30) {
  if (!caster || !target) return { success: false, drained: 0, reason: 'Invalid targets' };

  let drained = amount;
  if (typeof target.health === 'number') {
    drained = Math.min(amount, target.health);
    target.health = Math.max(0, target.health - drained);
    if (target.health <= 0) target.dead = true;
  } else if (typeof target.hurt === 'function') {
    target.hurt(amount);
  }

  const casterEntity = caster.entity || caster;
  if (typeof caster.heal === 'function') {
    caster.heal(drained);
  } else if (typeof casterEntity.currentHealth === 'number') {
    const maxHp = casterEntity.maxHealth || 100;
    casterEntity.currentHealth = Math.min(maxHp, casterEntity.currentHealth + drained);
  }

  return {
    success: true,
    drained,
  };
}

/**
 * Applies Bone Armor protective shield to the caster.
 * @param {object} caster
 * @param {number} [duration=15]
 * @param {number} [pool=50]
 * @returns {{ success: boolean, shieldRemaining: number, roundsRemaining: number }}
 */
export function castBoneArmor(caster, duration = 15, pool = 50) {
  const entity = caster?.entity || caster;
  if (!entity) return { success: false, shieldRemaining: 0, roundsRemaining: 0 };

  entity.activeEffects = entity.activeEffects || [];
  const entry = {
    kind: 'boneArmor',
    startingShield: pool,
    shieldRemaining: pool,
    roundsRemaining: duration,
    ended: false,
  };

  entity.activeEffects.push(entry);

  return {
    success: true,
    shieldRemaining: pool,
    roundsRemaining: duration,
  };
}

