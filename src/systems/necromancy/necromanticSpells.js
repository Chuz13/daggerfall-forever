// @ts-check
// NECROMANTIC-SPELLS: Dark Arts spell builders and runtime cast resolvers.
// Integrated into DFF's classic spell record system and magic schools:
// - Animate Dead (47,255) -> Mysticism
// - Corpse Explosion (48,255) -> Destruction
// - Life Tap (49,255) -> Restoration
// - Bone Armor (51,255) -> Alteration

import { FORK_FLAGS } from '../../config/forkFlags.js';
import { getCorpse, consumeCorpse, corpsesNear, CORPSE_STATE } from './corpseRegistry.js';
import { canAffordUndead, removeUndeadMinion } from './undeadCapacity.js';
import { spawnMinion, allSpawnedMinions, detonateMinion } from './minionController.js';
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
        durationBase: 0,
        durationMod: 0,
        durationPerLevel: 1,
        chanceBase: 0,
        chanceMod: 4,
        chancePerLevel: 1,
        magnitudeBaseLow: 1,
        magnitudeBaseHigh: 1,
        magnitudeLevelBase: 0,
        magnitudeLevelHigh: 0,
        magnitudePerLevel: 1,
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
        durationBase: 0,
        durationMod: 0,
        durationPerLevel: 1,
        chanceBase: 100,
        chanceMod: 0,
        chancePerLevel: 1,
        magnitudeBaseLow: 40,
        magnitudeBaseHigh: 40,
        magnitudeLevelBase: 0,
        magnitudeLevelHigh: 0,
        magnitudePerLevel: 1,
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
        durationBase: 0,
        durationMod: 0,
        durationPerLevel: 1,
        chanceBase: 100,
        chanceMod: 0,
        chancePerLevel: 1,
        magnitudeBaseLow: 30,
        magnitudeBaseHigh: 30,
        magnitudeLevelBase: 0,
        magnitudeLevelHigh: 0,
        magnitudePerLevel: 1,
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
        durationBase: 15, // 15 rounds
        durationMod: 0,
        durationPerLevel: 1,
        chanceBase: 100,
        chanceMod: 0,
        chancePerLevel: 1,
        magnitudeBaseLow: 50, // 50 damage shield
        magnitudeBaseHigh: 50,
        magnitudeLevelBase: 0,
        magnitudeLevelHigh: 0,
        magnitudePerLevel: 1,
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

  // Support single-object signature: castAnimateDead({ casterEntity, targetCorpse, position, ... })
  if (caster && typeof caster === 'object' && !targetCorpse && ('casterEntity' in caster || 'targetCorpse' in caster)) {
    targetCorpse = caster.targetCorpse || caster.position;
    caster = caster.casterEntity;
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

  let corpse = typeof targetCorpse === 'string' ? getCorpse(targetCorpse) : targetCorpse;
  if (!corpse || corpse.consumed || !corpse.corpseState) {
    const pos =
      targetCorpse?.necroTargetPos ||
      targetCorpse?.pos ||
      targetCorpse?.position ||
      targetCorpse?.feet ||
      (Array.isArray(targetCorpse) ? targetCorpse : null);
    if (pos) {
      corpse = corpsesNear(pos, 8)[0] ?? null;
    }
    if (!corpse) {
      const casterPos = casterEntity?.position || casterEntity?.pos || casterEntity?.feet || null;
      if (casterPos) {
        corpse = corpsesNear(casterPos, 10)[0] ?? null;
      }
    }
  }

  if (!corpse || corpse.consumed) {
    return { success: false, reason: 'Target is not a viable corpse' };
  }

  // Determine what can be raised based on preferredType, reagents, decay state, and entity type
  // 5-tier hierarchy: skeleton (1), zombie (2), ghost (3), mummy (4), lich (8)
  const items = Array.isArray(casterEntity?.items) ? casterEntity.items : [];
  const hasReagent = (tpl) => items.some((it) => it && Number(it.templateIndex) === tpl && (it.stackCount ?? 1) > 0);
  const mystSkill = skillValue(casterEntity, SKILLS.Mysticism) || 20;

  let minionType = 'skeleton';
  if (corpse.preferredType && ['skeleton', 'zombie', 'ghost', 'mummy', 'lich'].includes(corpse.preferredType)) {
    minionType = corpse.preferredType;
  } else if (corpse.entityType === 'lich' || (hasReagent(45) && mystSkill >= 80 && canAffordUndead(casterEntity, 'lich'))) {
    minionType = 'lich';
  } else if (corpse.entityType === 'undead' && corpse.corpseState === CORPSE_STATE.FRESH) {
    minionType = 'mummy';
  } else if (corpse.entityType === 'ghost' || corpse.entityType === 'wraith' || corpse.corpseState === CORPSE_STATE.ASH) {
    minionType = 'ghost';
  } else if (corpse.corpseState === CORPSE_STATE.FRESH) {
    if (hasReagent(49) && canAffordUndead(casterEntity, 'mummy')) {
      minionType = 'mummy';
    } else {
      minionType = 'zombie';
    }
  } else if (corpse.corpseState === CORPSE_STATE.DECAYING) {
    if (hasReagent(39) && canAffordUndead(casterEntity, 'ghost')) {
      minionType = 'ghost';
    } else {
      minionType = 'zombie';
    }
  } else if (corpse.corpseState === CORPSE_STATE.SKELETAL) {
    minionType = 'skeleton';
  } else {
    return { success: false, reason: 'Corpse has been desecrated' };
  }

  // Fallback down the hierarchy if capacity is tight for higher-tier reagent promotion
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

  if (minion && typeof globalThis.__sceneContext?.spawnUndeadMinion === 'function') {
    const maybeBody = globalThis.__sceneContext.spawnUndeadMinion(minionType, corpse.position, minion.name);
    if (maybeBody && typeof maybeBody.then === 'function') {
      maybeBody.then((body) => {
        if (body) minion.sceneBody = body;
      }).catch(() => {});
    } else if (maybeBody) {
      minion.sceneBody = maybeBody;
    }
  }

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

  // Support single-object signature
  if (caster && typeof caster === 'object' && !targetCorpse && ('casterEntity' in caster || 'originPosition' in caster)) {
    const opts = caster;
    targetCorpse = opts.targetCorpse || opts.originPosition;
    radius = opts.radius ?? radius;
    baseDamage = opts.damage ?? opts.baseDamage ?? baseDamage;
    nearbyFoes = opts.nearbyFoes ?? nearbyFoes;
    caster = opts.casterEntity;
  }

  const casterEntity = caster?.entity || caster;
  const searchOrigin =
    targetCorpse?.pos ||
    targetCorpse?.position ||
    targetCorpse?.feet ||
    (Array.isArray(targetCorpse) ? targetCorpse : null) ||
    casterEntity?.position ||
    casterEntity?.pos ||
    [0, 0, 0];

  // Priority 1: Direct corpse record or ID
  let corpse = typeof targetCorpse === 'string' ? getCorpse(targetCorpse) : (targetCorpse?.corpseState ? targetCorpse : null);
  // Priority 2: Direct minion target passed as targetCorpse
  let minionTarget = (!corpse && targetCorpse && (targetCorpse.livingRole === 'undead_minion' || (targetCorpse.id && String(targetCorpse.id).startsWith('minion_'))))
    ? targetCorpse
    : null;

  // Priority 3: Nearest viable corpse in range (strict priority on corpse over minion)
  if ((!corpse || corpse.consumed) && !minionTarget && searchOrigin) {
    corpse = corpsesNear(searchOrigin, radius * 2)[0] ?? null;
  }

  // Priority 4: Nearest active undead minion if no corpse found
  if ((!corpse || corpse.consumed) && !minionTarget) {
    const active = allSpawnedMinions();
    if (active.length > 0) {
      let best = null;
      let bestDist = Infinity;
      const [ox, oy, oz] = searchOrigin;
      for (const m of active) {
        if (!m || m.dead) continue;
        const [mx, my, mz] = m.position || [0, 0, 0];
        const d = Math.hypot(mx - ox, my - oy, mz - oz);
        if (d < bestDist) {
          bestDist = d;
          best = m;
        }
      }
      minionTarget = best;
    }
  }

  if ((!corpse || corpse.consumed) && !minionTarget) {
    return { success: false, hitCount: 0, damage: 0, reason: 'No corpse to detonate' };
  }

  let explosionOrigin = [0, 0, 0];
  let sourceMaxHp = 0;

  if (corpse && !corpse.consumed) {
    explosionOrigin = corpse.position || searchOrigin;
    sourceMaxHp = Number(corpse.maxHealth) || 0;
    consumeCorpse(corpse.id);
    corpse.consumed = true;
    if (typeof corpse.destroyCorpse === 'function') {
      try { corpse.destroyCorpse(); } catch {}
    }
    if (typeof globalThis.__sceneContext?.destroyCorpse === 'function') {
      try { globalThis.__sceneContext.destroyCorpse(corpse); } catch {}
    }
  } else if (minionTarget) {
    const sacrificed = detonateMinion(minionTarget) || minionTarget;
    sacrificed.dead = true;
    if (sacrificed.sceneBody) {
      sacrificed.sceneBody.dead = true;
      globalThis.__sceneContext?.killMinionBody?.(sacrificed.sceneBody);
    }
    explosionOrigin = sacrificed.position || sacrificed.pos || sacrificed.feet || searchOrigin;
    sourceMaxHp = Number(sacrificed.maxHealth ?? sacrificed.entity?.maxHealth) || 60;
  }

  // Damage = 5x source maxHealth when maxHealth is tracked; fallback to skill-scaled baseDamage for legacy mocks
  const destSkill = skillValue(casterEntity, SKILLS.Destruction) || 20;
  const damage = sourceMaxHp > 0
    ? Math.round(sourceMaxHp * 5)
    : Math.round(baseDamage * (0.8 + destSkill / 100));

  const [cx, cy, cz] = explosionOrigin;
  let hitCount = 0;

  // Smart AoE: damages ONLY hostile enemies (never self, allies, or undead minions)
  for (const foe of nearbyFoes) {
    if (!foe || foe.dead) continue;
    if (
      foe === caster ||
      foe === casterEntity ||
      foe.isPlayer ||
      foe.allied ||
      foe.shipmate ||
      foe.team === 'PlayerAlly' ||
      foe.entity?.team === 'PlayerAlly' ||
      foe.livingRole === 'undead_minion'
    ) {
      continue;
    }
    const [fx, fy, fz] = foe.feet || foe.position || foe.pos || [0, 0, 0];
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
    sacrificedMinion: !!minionTarget,
  };
}

/**
 * Executes Life Tap, siphoning health from target to caster.
 * If targeting an allied undead minion (or if no target provided and an active minion exists),
 * drains up to 100% of the minion's remaining health to heal the caster.
 * @param {object} caster
 * @param {object} [target]
 * @param {number} [amount=30]
 * @returns {{ success: boolean, drained: number, reason?: string }}
 */
export function castLifeTap(caster, target, amount = 30) {
  if (!caster) return { success: false, drained: 0, reason: 'Invalid targets' };
  if (!target) {
    const active = allSpawnedMinions();
    if (active.length > 0) target = active[0];
  }
  if (!target) return { success: false, drained: 0, reason: 'Invalid targets' };

  const isMinion = !!(
    target.livingRole === 'undead_minion' ||
    target.team === 'PlayerAlly' ||
    (target.id && String(target.id).startsWith('minion_'))
  );
  const maxDrain = isMinion ? Math.max(amount, target.health ?? target.maxHealth ?? amount) : amount;

  let drained = maxDrain;
  if (typeof target.health === 'number') {
    drained = Math.min(maxDrain, target.health);
    target.health = Math.max(0, target.health - drained);
    if (target.health <= 0) {
      target.dead = true;
      if (target.id) removeUndeadMinion(target.id);
    }
  } else if (typeof target.hurt === 'function') {
    target.hurt(maxDrain);
  }

  const casterEntity = caster.entity || caster;
  if (typeof caster.heal === 'function') {
    caster.heal(drained);
  } else {
    const maxHp = casterEntity.maxHealth || 100;
    if (typeof casterEntity.health === 'number') {
      casterEntity.health = Math.min(maxHp, casterEntity.health + drained);
    }
    if (typeof casterEntity.currentHealth === 'number') {
      casterEntity.currentHealth = Math.min(maxHp, casterEntity.currentHealth + drained);
    }
  }

  return {
    success: true,
    drained,
  };
}

/**
 * Applies Bone Armor protective shield to the caster.
 * If an allied skeleton minion is active, consumes the nearest skeleton to grant
 * a bone shield equal to 3x the skeleton's maxHealth!
 * @param {object} caster
 * @param {number} [duration=15]
 * @param {number} [pool=50]
 * @returns {{ success: boolean, shieldRemaining: number, roundsRemaining: number, consumedSkeleton?: boolean }}
 */
export function castBoneArmor(caster, duration = 15, pool = 50) {
  const entity = caster?.entity || caster;
  if (!entity) return { success: false, shieldRemaining: 0, roundsRemaining: 0 };

  let consumedSkeleton = false;
  const activeSkeletons = allSpawnedMinions().filter((m) => m && !m.dead && m.type === 'skeleton');
  if (activeSkeletons.length > 0) {
    const preferred = activeSkeletons.find((m) => m.sceneBody) || activeSkeletons[activeSkeletons.length - 1];
    const skel = detonateMinion(preferred) || preferred;
    skel.dead = true;
    const body = skel.sceneBody || preferred.sceneBody;
    if (body) {
      body.dead = true;
      globalThis.__sceneContext?.killMinionBody?.(body);
    }
    const skelMaxHp = Number(skel.maxHealth ?? skel.profile?.maxHealth) || 60;
    pool = Math.round(skelMaxHp * 3);
    consumedSkeleton = true;
  }

  entity.activeEffects = entity.activeEffects || [];
  const existing = entity.activeEffects.find((e) => e.kind === 'boneArmor' && !e.ended);
  if (existing) {
    existing.startingShield = Math.max(existing.startingShield || pool, pool);
    existing.shieldRemaining = pool;
    existing.roundsRemaining = duration;
  } else {
    entity.activeEffects.push({
      kind: 'boneArmor',
      startingShield: pool,
      shieldRemaining: pool,
      roundsRemaining: duration,
      ended: false,
    });
  }

  return {
    success: true,
    shieldRemaining: pool,
    roundsRemaining: duration,
    consumedSkeleton,
  };
}

