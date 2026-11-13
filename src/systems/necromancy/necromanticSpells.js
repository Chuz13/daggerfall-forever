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
  CONTROL_UNDEAD: '53,255',
  DISGUISE: '54,255',
  SUTURE_CADAVER: '55,255',
});

export const UNDEAD_CONTROL_MAGNITUDE_TIERS = Object.freeze({
  skeleton: 10,
  zombie: 15,
  ghost: 20,
  mummy: 25,
  wraith: 30,
  vampire: 35,
  lich: 45,
  vampire_ancient: 55,
  ancient_lich: 65,
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
 * Creates a ready-made spell record for Paralyzing Touch (granted upon becoming a Lich).
 * Uses existing Paralyze effect (0,255) ByTouch, minimal mana cost (5 SP), maximum duration.
 * Not added to Spell Maker or Grimoire.
 * @returns {object}
 */
export function lichParalyzingTouchSpell() {
  return {
    index: -55,
    name: 'Paralyzing Touch',
    icon: 18,
    rangeType: 1, // ByTouch
    element: 4,   // Magic
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
    craftable: false,
    minimumCastingCost: true,
    effects: [
      {
        type: 0,
        subType: 255,
        durationBase: 60,
        durationMod: 20,
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
 * Creates a ready-made spell record for Dark Flight (Levitation at will, granted by Grimoire).
 * Uses existing Levitate effect (14,255) CasterOnly, minimal mana cost (5 SP), maximum duration.
 * @returns {object}
 */
export function necroLevitateSpell() {
  return {
    index: -56,
    name: 'Dark Flight',
    icon: 12,
    rangeType: 0, // CasterOnly
    element: 4,   // Magic
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
    craftable: false,
    minimumCastingCost: true,
    effects: [
      {
        type: 14,
        subType: 255,
        durationBase: 60,
        durationMod: 20,
        durationPerLevel: 1,
        chanceBase: 0,
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
 * Creates a ready-made spell record for Control Undead (53,255).
 * Granted by the Grimoire and unlocked in Spell Maker under Necromancy tag.
 * @returns {object}
 */
export function controlUndeadSpell() {
  return {
    index: -53,
    name: 'Control Undead',
    icon: 16,
    rangeType: 2, // SingleTargetAtRange
    element: 4,   // Magic
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
    effects: [
      {
        type: 53,
        subType: 255,
        durationBase: 15,
        durationMod: 5,
        durationPerLevel: 1,
        chanceBase: 75,
        chanceMod: 5,
        chancePerLevel: 1,
        magnitudeBaseLow: 20,
        magnitudeBaseHigh: 20,
        magnitudeLevelBase: 2,
        magnitudeLevelHigh: 2,
        magnitudePerLevel: 1,
      },
    ],
  };
}

/**
 * Creates a ready-made spell record for Mortal Disguise (54,255).
 * Granted upon becoming a Lich; effect unlocked in Spell Maker upon reading the Grimoire.
 * @returns {object}
 */
export function mortalDisguiseSpell() {
  return {
    index: -54,
    name: 'Mortal Disguise',
    icon: 13,
    rangeType: 0, // CasterOnly
    element: 4,   // Magic
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
    effects: [
      {
        type: 54,
        subType: 255,
        durationBase: 30,
        durationMod: 10,
        durationPerLevel: 1,
        chanceBase: 0,
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
 * Creates a ready-made spell record for Suture Cadaver (stitching 3-5 corpses into a Flesh Colossus).
 * Granted on reading the Grimoire of the Worm and craftable in the Spell Maker once unlocked.
 * @param {object} [params]
 * @returns {object}
 */
export function sutureCadaverSpell({
  name = 'Suture Cadaver',
  chanceBase = 80,
  chanceMod = 5,
  magnitudeBaseLow = 25,
  magnitudeBaseHigh = 45,
} = {}) {
  return {
    index: -57,
    name,
    icon: 25,
    rangeType: 0, // CasterOnly (scans 8m around caster)
    element: 4,   // Magic
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
    effects: [
      {
        type: 55,
        subType: 255,
        durationBase: 0,
        durationMod: 0,
        durationPerLevel: 1,
        chanceBase,
        chanceMod,
        chancePerLevel: 1,
        magnitudeBaseLow,
        magnitudeBaseHigh,
        magnitudeLevelBase: 5,
        magnitudeLevelHigh: 5,
        magnitudePerLevel: 1,
      },
    ],
  };
}

/**
 * Creates the innate Finger of Death spell granted upon ascending to Ancient Lich.
 * Single Target at Range Disintegrate (type 5, subType 255) with fixed 50 base magicka cost.
 * NOT a Spell Maker effect and NOT granted by the Grimoire.
 * @returns {object}
 */
export function fingerOfDeathSpell() {
  return {
    index: -58,
    name: 'Finger of Death',
    icon: 12,
    rangeType: 2, // SingleTargetAtRange
    element: 4,   // Magic
    tag: 'некро',
    tags: ['некро', 'necro'],
    necro: true,
    custom: true,
    craftable: false,
    baseCastingCost: 50,
    effects: [
      {
        type: 5,
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

/**
 * Resolves whether a target is undead and what minion type + magnitude threshold it corresponds to.
 * @param {object} target
 * @returns {{ isUndead: boolean, type: string, requiredMagnitude: number, mobile: number|null, name: string }}
 */
export function resolveUndeadControlTarget(target) {
  if (!target) {
    return { isUndead: false, type: 'skeleton', requiredMagnitude: 10, mobile: null, name: 'Undead' };
  }
  const ent = target.entity || target;
  const mobileId = Number(
    target.mobileType ?? target.mobile ?? ent.mobileType ?? ent.mobile ?? ent.careerIndex ?? -1
  );
  const rawType = String(target.type || ent.type || target.name || ent.name || '').toLowerCase();

  let type = null;
  let mobile = Number.isFinite(mobileId) && mobileId >= 0 ? mobileId : null;

  if (mobileId === 15 || rawType.includes('skeleton') || rawType.includes('skeletal')) {
    type = 'skeleton';
    if (mobile == null) mobile = 15;
  } else if (mobileId === 17 || rawType.includes('zombie')) {
    type = 'zombie';
    if (mobile == null) mobile = 17;
  } else if (mobileId === 18 || rawType.includes('ghost')) {
    type = 'ghost';
    if (mobile == null) mobile = 18;
  } else if (mobileId === 19 || rawType.includes('mummy')) {
    type = 'mummy';
    if (mobile == null) mobile = 19;
  } else if (mobileId === 23 || rawType.includes('wraith')) {
    type = 'wraith';
    if (mobile == null) mobile = 23;
  } else if (mobileId === 30 || rawType.includes('vampire_ancient') || rawType.includes('vampire ancient') || rawType.includes('ancient vampire')) {
    type = 'vampire_ancient';
    if (mobile == null) mobile = 30;
  } else if (mobileId === 28 || rawType.includes('vampire')) {
    type = 'vampire';
    if (mobile == null) mobile = 28;
  } else if (mobileId === 33 || rawType.includes('ancient_lich') || rawType.includes('ancient lich')) {
    type = 'ancient_lich';
    if (mobile == null) mobile = 33;
  } else if (mobileId === 32 || rawType.includes('lich')) {
    type = 'lich';
    if (mobile == null) mobile = 32;
  } else if (
    target.isUndead ||
    ent.isUndead ||
    target.mobileTeam === 'Undead' ||
    ent.mobileTeam === 'Undead' ||
    ent.affinity === 'Undead'
  ) {
    type = 'skeleton';
    if (mobile == null) mobile = 15;
  }

  if (!type) {
    return { isUndead: false, type: 'skeleton', requiredMagnitude: 10, mobile: null, name: target.name || ent.name || 'Target' };
  }

  const requiredMagnitude = Number(
    target.requiredMagnitude ?? ent.requiredMagnitude ?? UNDEAD_CONTROL_MAGNITUDE_TIERS[type] ?? 10
  );
  const name = target.name || ent.name || `Controlled ${type.replace('_', ' ')}`;
  return { isUndead: true, type, requiredMagnitude, mobile, name };
}

/**
 * Executes the Control Undead spell effect on a target undead creature.
 * Does NOT consume the permanent undead summon capacity pool.
 * @param {object} caster
 * @param {object} target
 * @param {object} [options]
 * @param {number} [options.magnitude=20]
 * @param {number} [options.duration=15]
 * @param {number} [options.chance=100]
 * @param {() => number} [options.rolls]
 * @returns {{ success: boolean, minion?: object, reason?: string, requiredMagnitude?: number, magnitude?: number }}
 */
export function castControlUndead(
  caster,
  target,
  { magnitude = 20, duration = 15, chance = 100, rolls = Math.random } = {},
) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { success: false, reason: 'Necromancy is disabled' };
  }
  if (!target || target.dead || target.entity?.dead) {
    return { success: false, reason: 'Invalid target' };
  }
  if (target.isPlayer || target.entity?.isPlayer) {
    return { success: false, reason: 'Cannot control player' };
  }

  const resolved = resolveUndeadControlTarget(target);
  if (!resolved.isUndead) {
    return { success: false, reason: 'Target is not undead' };
  }

  if (magnitude < resolved.requiredMagnitude) {
    return {
      success: false,
      reason: 'Target undead tier is too powerful for this spell magnitude',
      requiredMagnitude: resolved.requiredMagnitude,
      magnitude,
    };
  }

  const clampedChance = Math.max(0, Math.min(100, Number(chance) || 0));
  if (clampedChance < 100 && rolls() * 100 >= clampedChance) {
    return { success: false, reason: 'Target resisted Control Undead' };
  }

  const casterEntity = caster?.entity || caster;
  const pos = target.feet || target.position || target.pos || casterEntity?.position || [0, 0, 0];
  const rounds = Math.max(1, Math.round(Number(duration) || 15));
  const ent = target.entity || target;

  // If already controlled by us, refresh its duration
  if (target.controlledUndead && target.controlledMinionId) {
    const existing = allSpawnedMinions().find((m) => m.id === target.controlledMinionId);
    if (existing) {
      existing.roundsRemaining = rounds;
      return { success: true, minion: existing, refreshed: true };
    }
  }

  const minion = spawnMinion({
    type: resolved.type,
    position: Array.isArray(pos) ? [...pos] : [0, 0, 0],
    masterEntity: casterEntity,
    name: resolved.name,
    controlled: true,
    roundsRemaining: rounds,
    mobile: resolved.mobile,
    sceneBody: target.sceneBody || (target.ai ? target : null),
    health: ent.health ?? target.health ?? null,
    maxHealth: ent.maxHealth ?? target.maxHealth ?? null,
  });

  target.controlledUndead = true;
  target.controlledMinionId = minion.id;
  target.livingRole = 'undead_minion';
  target.undeadStance = 'follow';
  if (target.entity && typeof target.entity === 'object') {
    target.entity.team = 'PlayerAlly';
    target.entity.mobileTeam = 'PlayerAlly';
  } else {
    target.team = 'PlayerAlly';
    target.mobileTeam = 'PlayerAlly';
  }
  if (target.ai) {
    target.ai.isHostile = false;
    target.ai.target = null;
    target.ai.secondaryTarget = null;
    target.ai.giveUpTimer = 0;
  }
  if (target.sceneBody?.ai) {
    target.sceneBody.ai.isHostile = false;
    target.sceneBody.ai.target = null;
    target.sceneBody.ai.secondaryTarget = null;
    target.sceneBody.ai.giveUpTimer = 0;
  }

  return {
    success: true,
    minion,
    requiredMagnitude: resolved.requiredMagnitude,
    magnitude,
  };
}

/**
 * Executes Suture Cadaver: requires 3 to 5 corpses within 8m of the caster/target.
 * If fewer than 3 corpses are nearby, fails without consuming any corpses.
 * If 3 or more corpses are nearby, consumes and destroys strictly 3 to 5 corpses (leaving any 6th+ untouched)
 * and spawns a Flesh Colossus ('cadaver') minion with HP = max(250, round(sum(corpse.maxHealth) * 0.8)).
 * @param {object} caster
 * @param {object|null} [targetCorpse]
 * @param {object} [options]
 * @returns {{ success: boolean, minion?: object, consumedCount: number, consumedCorpses?: Array<object>, reason?: string, reasonCode?: string }}
 */
export function castSutureCadaver(caster, targetCorpse = null, options = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { success: false, consumedCount: 0, reason: 'Necromancy is disabled', reasonCode: 'DISABLED' };
  }

  let opts = options;
  if (caster && typeof caster === 'object' && !targetCorpse && ('casterEntity' in caster || 'targetCorpse' in caster)) {
    opts = { ...caster, ...options };
    targetCorpse = caster.targetCorpse || caster.position || null;
    caster = caster.casterEntity;
  }

  const casterEntity = caster?.entity || caster;
  const radius = Number(opts?.radius) > 0 ? Number(opts.radius) : 8;

  const searchPos =
    targetCorpse?.necroTargetPos ||
    targetCorpse?.position ||
    targetCorpse?.pos ||
    targetCorpse?.feet ||
    (Array.isArray(targetCorpse) ? targetCorpse : null) ||
    casterEntity?.position ||
    casterEntity?.pos ||
    casterEntity?.feet ||
    globalThis.__sceneContext?.getPlayerPos?.() ||
    [0, 0, 0];

  const viable = corpsesNear(searchPos, radius);

  if (viable.length < 3) {
    return {
      success: false,
      consumedCount: 0,
      reasonCode: 'NOT_ENOUGH_CORPSES',
      reason: 'Not enough flesh to stitch a colossus. Requires at least 3 corpses nearby.',
    };
  }

  if (!canAffordUndead(casterEntity, 'cadaver')) {
    return {
      success: false,
      consumedCount: 0,
      reasonCode: 'INSUFFICIENT_CAPACITY',
      reason: 'Insufficient undead control capacity',
    };
  }

  // Strictly consume 3 to 5 nearest corpses (never more than 5!)
  const toConsume = viable.slice(0, 5);
  let totalCorpseHp = 0;

  for (const c of toConsume) {
    totalCorpseHp += Number(c.maxHealth) || 60;
    consumeCorpse(c.id);
    c.destroyCorpse?.();
    opts?.sinks?.destroyCorpse?.(c);
    globalThis.__sceneContext?.destroyCorpse?.(c);
  }

  const maxHealth = Math.max(250, Math.round(totalCorpseHp * 0.8));
  const firstPos = toConsume[0]?.position || searchPos;
  const spawnPos = Array.isArray(firstPos) ? [...firstPos] : [0, 0, 0];

  const minion = spawnMinion({
    type: 'cadaver',
    position: spawnPos,
    masterEntity: casterEntity,
    health: maxHealth,
    maxHealth,
  });

  return {
    success: true,
    minion,
    consumedCount: toConsume.length,
    consumedCorpses: toConsume,
  };
}



