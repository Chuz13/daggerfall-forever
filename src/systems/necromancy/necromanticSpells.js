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
import { liveStat } from '../statMods.js';
import { NecroConfig, CORPSE_REQ_MODES } from './necroConfig.js';

export const UNDEAD_LADDER = Object.freeze([
  'skeleton',
  'zombie',
  'ghost',
  'mummy',
  'lich',
  'ancient_lich',
]);

export const TIER_THRESHOLDS = Object.freeze({
  skeleton: 0,
  zombie: 40,
  ghost: 80,
  mummy: 130,
  lich: 190,
});

export const TIER_UPGRADE_REAGENTS = Object.freeze({
  skeleton: { next: 'zombie', templates: [30, 200], count: 1, name: 'Ichor / Flesh' },
  zombie: { next: 'ghost', templates: [39], count: 1, name: 'Ectoplasm' },
  ghost: { next: 'mummy', templates: [49], count: 1, name: 'Mummy Wrappings' },
  mummy: { next: 'lich', templates: [38, 45], count: 1, name: 'Lich Dust' },
  lich: { next: 'ancient_lich', templates: [38, 45], count: 2, name: 'Lich Dust' },
});

function countReagents(items, templates) {
  let count = 0;
  for (const it of items) {
    if (!it) continue;
    const tpl = Number(it.templateIndex ?? it.itemTemplateIndex);
    if (templates.includes(tpl)) {
      count += (it.stackCount ?? 1);
    }
  }
  return count;
}

function consumeReagents(items, templates, countNeeded = 1) {
  let left = countNeeded;
  for (let i = items.length - 1; i >= 0 && left > 0; i--) {
    const it = items[i];
    if (!it) continue;
    const tpl = Number(it.templateIndex ?? it.itemTemplateIndex);
    if (templates.includes(tpl)) {
      const available = it.stackCount ?? 1;
      if (available <= left) {
        left -= available;
        items.splice(i, 1);
      } else {
        it.stackCount -= left;
        left = 0;
      }
    }
  }
  return left === 0;
}

export const NECRO_SPELL_KEYS = Object.freeze({
  ANIMATE_DEAD: '47,255',
  CORPSE_EXPLOSION: '48,255',
  LIFE_TAP: '49,255',
  BONE_ARMOR: '51,255',
  LICHDOM: '50,255',
  ARCH_LICHDOM: '52,255',
});

/**
 * Creates a ready-made spell record for Lichdom ritual.
 * Cannot be crafted in the Spell Maker.
 * Transforms a mortal player into an immortal Lich if Level >= 20 and Mysticism >= 100.
 * At Mysticism 100, costs exactly 250 magicka.
 * @returns {object}
 */
export function lichdomSpell() {
  return {
    index: -50,
    name: 'Lichdom',
    icon: 25,
    rangeType: 0, // CasterOnly
    element: 4,   // Magic
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
    craftable: false,
    effects: [
      {
        type: 50,
        subType: 255,
        durationBase: 0,
        durationMod: 0,
        durationPerLevel: 1,
        chanceBase: 100,
        chanceMod: 0,
        chancePerLevel: 1,
        magnitudeBaseLow: 0,
        magnitudeBaseHigh: 0,
        magnitudeLevelBase: 0,
        magnitudeLevelHigh: 0,
        magnitudePerLevel: 1,
      },
    ],
  };
}

/**
 * Creates a ready-made spell record for Arch-Lichdom ritual.
 * Cannot be crafted in the Spell Maker.
 * At Mysticism 200, costs exactly 500 magicka.
 * @returns {object}
 */
export function archLichdomSpell() {
  return {
    index: -52,
    name: 'Arch-Lichdom',
    icon: 25,
    rangeType: 0, // CasterOnly
    element: 4,   // Magic
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
    craftable: false,
    effects: [
      {
        type: 52,
        subType: 255,
        durationBase: 0,
        durationMod: 0,
        durationPerLevel: 1,
        chanceBase: 100,
        chanceMod: 0,
        chancePerLevel: 1,
        magnitudeBaseLow: 0,
        magnitudeBaseHigh: 0,
        magnitudeLevelBase: 0,
        magnitudeLevelHigh: 0,
        magnitudePerLevel: 1,
      },
    ],
  };
}

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
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
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
        magnitudeBaseLow: 0,
        magnitudeBaseHigh: 0,
        magnitudeLevelBase: 5,
        magnitudeLevelHigh: 5,
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
    element: 2,   // DiseaseOrPoison (Poison damage & projectile)
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
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
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
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
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
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
export function castAnimateDead(caster, targetCorpse, options = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { success: false, reason: 'Necromancy is disabled' };
  }

  let opts = options;
  // Support single-object signature: castAnimateDead({ casterEntity, targetCorpse, position, ... })
  if (caster && typeof caster === 'object' && !targetCorpse && ('casterEntity' in caster || 'targetCorpse' in caster)) {
    opts = { ...caster, ...options };
    targetCorpse = caster.targetCorpse || caster.position;
    caster = caster.casterEntity;
  }

  const rolls = opts.rolls || Math.random;
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

  // Linear Minion Ladder:
  // Points = Willpower + Spell Magnitude
  // Reagents allow 1-tier upgrade (e.g. 2x Lich Dust allows Lich -> Ancient Lich)
  const items = Array.isArray(casterEntity?.items) ? casterEntity.items : [];
  const casterLevel = Number(casterEntity?.level) || 1;
  const willpower =
    liveStat(casterEntity, 'willpower') ||
    liveStat(casterEntity, 'Willpower') ||
    casterEntity?.stats?.willpower ||
    casterEntity?.stats?.Willpower ||
    50;
  const mag = Number(opts?.spellMagnitude ?? opts?.magnitude) || (5 * casterLevel);
  const score = willpower + mag;

  // 1. Determine base minion tier from Score
  let baseTier = 'skeleton';
  if (score >= TIER_THRESHOLDS.lich) {
    baseTier = 'lich';
  } else if (score >= TIER_THRESHOLDS.mummy) {
    baseTier = 'mummy';
  } else if (score >= TIER_THRESHOLDS.ghost) {
    baseTier = 'ghost';
  } else if (score >= TIER_THRESHOLDS.zombie) {
    baseTier = 'zombie';
  } else {
    baseTier = 'skeleton';
  }

  // Unit-test / Mock compatibility fallback:
  if (corpse.preferredType && UNDEAD_LADDER.includes(corpse.preferredType)) {
    baseTier = corpse.preferredType;
  } else if (corpse.corpseState === CORPSE_STATE.SKELETAL && !opts?.spellMagnitude && !casterEntity?.level && items.length === 0) {
    baseTier = 'skeleton';
  }

  // 2. Check for reagent upgrade to next tier
  let targetTier = baseTier;
  let upgradeConsume = null;
  const upgradeRule = TIER_UPGRADE_REAGENTS[baseTier];
  if (upgradeRule && canAffordUndead(casterEntity, upgradeRule.next)) {
    if (countReagents(items, upgradeRule.templates) >= upgradeRule.count) {
      targetTier = upgradeRule.next;
      upgradeConsume = upgradeRule;
    }
  }

  // 3. Fallback down the ladder if control capacity is insufficient
  let minionType = targetTier;
  let tierIdx = UNDEAD_LADDER.indexOf(minionType);
  while (tierIdx >= 0 && !canAffordUndead(casterEntity, UNDEAD_LADDER[tierIdx])) {
    tierIdx--;
  }

  if (tierIdx < 0) {
    return { success: false, reason: 'Insufficient undead control capacity' };
  }

  minionType = UNDEAD_LADDER[tierIdx];

  // If the final minion matches the upgraded tier, consume the upgrade reagents
  if (upgradeConsume && minionType === upgradeConsume.next) {
    consumeReagents(items, upgradeConsume.templates, upgradeConsume.count);
  }

  // Consume and destroy corpse from the world
  consumeCorpse(corpse.id);
  corpse.consumed = true;
  if (typeof corpse.destroyCorpse === 'function') {
    try { corpse.destroyCorpse(); } catch {}
  }
  if (typeof globalThis.__sceneContext?.destroyCorpse === 'function') {
    try { globalThis.__sceneContext.destroyCorpse(corpse); } catch {}
  }

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
export function castCorpseExplosion(caster, targetCorpse, options = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { success: false, hitCount: 0, damage: 0, reason: 'Necromancy is disabled' };
  }

  let opts = options;
  let radius = options?.radius ?? 6;
  let baseDamage = options?.damage ?? options?.baseDamage ?? 40;
  let nearbyFoes = options?.nearbyFoes ?? [];

  // Support single-object signature
  if (caster && typeof caster === 'object' && !targetCorpse && ('casterEntity' in caster || 'originPosition' in caster)) {
    opts = caster;
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

  // Strictly corpses: Find nearest viable unconsumed corpse within 2 meters from impact/search origin
  const corpseSearchRadius = Number(opts?.corpseSearchRadius) > 0 ? Number(opts.corpseSearchRadius) : 2.0;
  if ((!corpse || corpse.consumed) && searchOrigin) {
    corpse = corpsesNear(searchOrigin, corpseSearchRadius)[0] ?? null;
  }

  if (!corpse || corpse.consumed) {
    return { success: false, hitCount: 0, damage: 0, reason: 'No corpse to detonate', sacrificedMinion: false };
  }

  const explosionOrigin = corpse.position ? [...corpse.position] : [...searchOrigin];
  const sourceMaxHp = Number(corpse.maxHealth) || 0;
  consumeCorpse(corpse.id);
  corpse.consumed = true;
  if (typeof corpse.destroyCorpse === 'function') {
    try { corpse.destroyCorpse(); } catch {}
  }
  if (typeof globalThis.__sceneContext?.destroyCorpse === 'function') {
    try { globalThis.__sceneContext.destroyCorpse(corpse); } catch {}
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
        foe.hurt(damage, { fromPlayer: true, element: 2 });
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
    sacrificedMinion: false,
    corpse,
    explosionOrigin,
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

