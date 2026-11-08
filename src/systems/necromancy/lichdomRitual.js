// @ts-check
// LICHDOM-RITUAL: The dark apotheosis — phylactery binding, the death elixir,
// and eternal reconstitution upon physical destruction.
//
// Key principles:
// 1. A phylactery anchors the soul to the mortal plane.
// 2. Transformation requires high Mysticism (>=40), character level (>=5),
//    a bound Black Soul Gem, and absence of conflicting curses (Vampirism/Lycanthropy).
// 3. Reconstitution: If a Lich player is defeated in combat, the soul retreats
//    to the bound phylactery rather than suffering permanent demise.

import { applyLichdom, applyAncientLichdom, isLich, isAncientLich, isAnyLich, liveLichdom } from './lichdomStatus.js';
import { skillValue, displaySkillValue, realSkillValue, SKILLS } from '../skills.js';
import { liveStat, maxFatigue } from '../statMods.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';
import { t } from '../textManager.js';

export const hasReadGrimoire = (entity) => !!(entity?.NecroGrimoireRead || entity?.necroGrimoireRead);

export const PHYLACTERY_STATE = Object.freeze({
  UNBOUND: 'unbound',
  BOUND: 'bound',
  SHATTERED: 'shattered',
});

export const MIN_LICHDOM_LEVEL = 5;
export const MIN_LICHDOM_MYSTICISM = 40;
export const ELIXIR_LICHDOM_LEVEL = 20;
export const ELIXIR_LICHDOM_MYSTICISM = 100;
export const ELIXIR_LICHDOM_MIN_STAT = 100;

let _forceDeathHook = null;
export function setForceDeathHook(fn) {
  _forceDeathHook = typeof fn === 'function' ? fn : null;
}

/**
 * Checks whether the player meets the strict Elixir of Unlife alchemy ascension requirements:
 * 1. Has read the Grimoire of the Worm
 * 2. Level >= 20
 * 3. Mysticism >= 100
 * 4. Intelligence >= 100
 * 5. Willpower >= 100
 * @param {object} playerEntity
 * @returns {{ eligible: boolean, alreadyLich?: boolean, reason?: string }}
 */
export function canDrinkElixirOfUnlife(playerEntity) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { eligible: false, reason: 'Necromancy is disabled.' };
  }
  if (!playerEntity) {
    return { eligible: false, reason: 'Invalid player entity.' };
  }
  if (isAnyLich(playerEntity)) {
    return { eligible: false, alreadyLich: true, reason: 'You have already ascended to Lichdom.' };
  }
  if (!hasReadGrimoire(playerEntity)) {
    return {
      eligible: false,
      reason: 'You have not unlocked the dark secrets of the Grimoire of the Worm.',
    };
  }
  const level = playerEntity.level || 1;
  if (level < ELIXIR_LICHDOM_LEVEL) {
    return {
      eligible: false,
      reason: `Your mortal vessel is too weak for the Elixir of Unlife (Requires Level ${ELIXIR_LICHDOM_LEVEL}, current: ${level}).`,
    };
  }
  const mystSkill = Math.max(
    displaySkillValue(playerEntity, SKILLS.Mysticism),
    realSkillValue(playerEntity, SKILLS.Mysticism),
    skillValue(playerEntity, SKILLS.Mysticism),
    playerEntity.skills?.[SKILLS.Mysticism] ?? 0,
  );
  if (mystSkill < ELIXIR_LICHDOM_MYSTICISM) {
    return {
      eligible: false,
      reason: `Your mastery of Mysticism is insufficient to bind your soul (Requires ${ELIXIR_LICHDOM_MYSTICISM}, current: ${mystSkill}).`,
    };
  }
  const intStat = Math.max(
    liveStat(playerEntity, 'intelligence'),
    playerEntity.stats?.intelligence ?? 0,
  );
  if (intStat < ELIXIR_LICHDOM_MIN_STAT) {
    return {
      eligible: false,
      reason: `Your Intelligence is insufficient to preserve your consciousness (Requires ${ELIXIR_LICHDOM_MIN_STAT}, current: ${intStat}).`,
    };
  }
  const wilStat = Math.max(
    liveStat(playerEntity, 'willpower'),
    playerEntity.stats?.willpower ?? 0,
  );
  if (wilStat < ELIXIR_LICHDOM_MIN_STAT) {
    return {
      eligible: false,
      reason: `Your Willpower is insufficient to anchor your soul (Requires ${ELIXIR_LICHDOM_MIN_STAT}, current: ${wilStat}).`,
    };
  }
  return { eligible: true };
}

/**
 * Drinks the Elixir of Unlife.
 * If requirements are met, binds a Phylactery and ascends to Lichdom.
 * Otherwise, the elixir acts as a lethal poison that kills the drinker's mortal body.
 * @param {object} playerEntity
 * @param {object} [options]
 * @returns {{ success: boolean, lichdom: boolean, poisonDamage?: number, reason?: string, message?: string }}
 */
export function drinkElixirOfUnlife(playerEntity, { hurtPlayer = null, forceDeath = null, nowMinutes = 0 } = {}) {
  const check = canDrinkElixirOfUnlife(playerEntity);
  if (!check.eligible) {
    const triggerDeath = forceDeath ?? _forceDeathHook;
    if (typeof triggerDeath === 'function') {
      triggerDeath(playerEntity);
    } else {
      const lethalDmg = Math.max(99999, (playerEntity?.maxHealth ?? 100) * 10);
      if (typeof hurtPlayer === 'function') {
        hurtPlayer(lethalDmg, { bypassShield: true });
      } else if (playerEntity && typeof playerEntity.health === 'number') {
        playerEntity.health = 0;
      }
    }
    return {
      success: false,
      lichdom: false,
      poisonDamage: 99999,
      reason: check.reason,
    };
  }
  if (!playerEntity.phylacteryAnchor || playerEntity.phylacteryAnchor.destroyed) {
    playerEntity.phylacteryAnchor = createPhylactery({
      anchorPosition: playerEntity.position || playerEntity.pos || [0, 0, 0],
      anchorScene: playerEntity.sceneKey || 'interior_sanctum',
    });
  }
  const res = performRitualOfUnlife(playerEntity, playerEntity.phylacteryAnchor, { nowMinutes });
  return {
    success: res.success,
    lichdom: res.success,
    reason: res.reason,
    message: res.message,
  };
}

/**
 * Performs the Lichdom transformation ritual via dedicated spell.
 * Requires mortal caster, Level >= 20, Mysticism >= 100.
 * If requirements are NOT met, triggers lethal collapse (just like Elixir of Unlife).
 * @param {object} caster
 * @param {object} [options]
 * @returns {{ success: boolean, reason?: string, message?: string, racialOverride?: object }}
 */
export function performLichdomRitual(caster, { hurtPlayer = null, sinks = null, nowMinutes = 0 } = {}) {
  const check = canDrinkElixirOfUnlife(caster);
  if (check.alreadyLich) {
    const msg = t('spell.necro.alreadyLich', 'You have already ascended to Lichdom. Do not squander your power in vain.');
    return {
      success: false,
      alreadyLich: true,
      reason: msg,
      message: msg,
    };
  }
  if (!check.eligible) {
    const hurtFn = hurtPlayer ?? sinks?.hurt;
    const lethalDmg = Math.max(99999, (caster?.maxHealth ?? 100) * 10);
    if (typeof hurtFn === 'function') {
      hurtFn(lethalDmg, { bypassShield: true });
    }
    if (caster && typeof caster.health === 'number') {
      caster.health = 0;
      if (caster.currentHealth != null) caster.currentHealth = 0;
    }
    return {
      success: false,
      reason: check.reason || 'The unholy dark forces overwhelm your mortal vessel!',
    };
  }

  if (!caster.phylacteryAnchor || caster.phylacteryAnchor.destroyed) {
    caster.phylacteryAnchor = createPhylactery({
      anchorPosition: caster.position || caster.pos || [0, 0, 0],
      anchorScene: caster.sceneKey || 'interior_sanctum',
    });
  }

  const res = performRitualOfUnlife(caster, caster.phylacteryAnchor, { nowMinutes });
  return {
    success: res.success,
    reason: res.reason,
    message: res.message,
    racialOverride: res.racialOverride,
  };
}

/**
 * Creates a new, unbound phylactery vessel.
 * @param {object} [params]
 * @param {string} [params.id]
 * @param {string} [params.containerName]
 * @param {string} [params.gemType]
 * @param {[number, number, number]} [params.anchorPosition]
 * @returns {object}
 */
export function createPhylactery({
  id = `phylactery_${Date.now().toString(36)}`,
  containerName = 'Gilded Reliquary',
  gemType = 'Black Soul Gem',
  anchorPosition = [0, 0, 0],
} = {}) {
  return {
    id,
    containerName,
    gemType,
    state: PHYLACTERY_STATE.UNBOUND,
    anchorPosition: [...anchorPosition],
    boundTimestamp: 0,
    charges: 3, // Number of reconstitutions before needing soul recharging
  };
}

/**
 * Checks whether player meets all prerequisites for the Lichdom ritual.
 * @param {object} playerEntity
 * @param {object} phylactery
 * @returns {{ valid: boolean, reasons: Array<string> }}
 */
export function validateRitualPrerequisites(playerEntity, phylactery) {
  const reasons = [];

  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    reasons.push('Necromancy system is disabled.');
  }

  if (!playerEntity) {
    reasons.push('No player entity.');
    return { valid: false, reasons };
  }

  if (playerEntity.racialOverride) {
    reasons.push('A conflicting curse (Vampirism/Lycanthropy) corrupts your blood.');
  }

  const level = playerEntity.level ?? 1;
  if (level < MIN_LICHDOM_LEVEL) {
    reasons.push(`Requires character level ${MIN_LICHDOM_LEVEL} (current: ${level}).`);
  }

  const myst = skillValue(playerEntity, SKILLS.Mysticism) || 0;
  if (myst < MIN_LICHDOM_MYSTICISM) {
    reasons.push(`Requires Mysticism skill ${MIN_LICHDOM_MYSTICISM} (current: ${myst}).`);
  }

  if (!phylactery || phylactery.state === PHYLACTERY_STATE.SHATTERED) {
    reasons.push('Phylactery is missing or shattered.');
  } else if (phylactery.state === PHYLACTERY_STATE.BOUND) {
    reasons.push('Phylactery is already bound to another soul.');
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}

/**
 * Performs the dark ritual of unlife, transforming the player into a Lich.
 * @param {object} playerEntity
 * @param {object} phylactery
 * @param {object} [options]
 * @param {number} [options.nowMinutes=0]
 * @returns {{ success: boolean, message: string, racialOverride?: object }}
 */
export function performRitualOfUnlife(playerEntity, phylactery, { nowMinutes = 0 } = {}) {
  const check = validateRitualPrerequisites(playerEntity, phylactery);
  if (!check.valid) {
    return {
      success: false,
      message: check.reasons.join(' '),
    };
  }

  // Bind phylactery
  phylactery.state = PHYLACTERY_STATE.BOUND;
  phylactery.boundTimestamp = nowMinutes;

  // Apply Lichdom status
  const override = applyLichdom(playerEntity, {
    phylacteryId: phylactery.id,
    nowMinutes,
  });

  if (!override) {
    phylactery.state = PHYLACTERY_STATE.UNBOUND;
    return {
      success: false,
      message: 'The unholy ritual failed to take hold.',
    };
  }

  return {
    success: true,
    message: 'The mortal spark is snuffed. You rise as an immortal Lich of the Iliac Bay.',
    racialOverride: override,
  };
}

export const LICH_RESPAWN_MONTH_MINUTES = 30 * 1440; // 43,200 in-game minutes (1 calendar month)

let _lichCemeteryRespawnHook = null;
export function setLichCemeteryRespawnHook(fn) {
  _lichCemeteryRespawnHook = fn ?? null;
}

/**
 * Handles physical death of a Lich or Ancient Lich.
 * Intercepts death:
 * - Restores full vitals (health, magicka, fatigue)
 * - Advances calendar time by 1 in-game month (30 days / 43,200 minutes)
 * - Relocates to the nearest cemetery (no charges required, infinite reconstitutions)
 * - Bypasses all other death penalties (no gold loss, no permadeath, no lost years).
 * @param {object} playerEntity
 * @param {object} [options]
 * @returns {{ reconstituted: boolean, minutesAdvanced?: number, daysAdvanced?: number, reason?: string, cemetery?: object }}
 */
export function handleLichMortalFall(playerEntity, options = {}) {
  if (!isAnyLich(playerEntity)) {
    return { reconstituted: false, reason: 'Not a Lich' };
  }

  // 1. Full vitals restored:
  const maxHp = playerEntity.maxHealth ?? 100;
  playerEntity.health = maxHp;
  if (typeof playerEntity.currentHealth === 'number') playerEntity.currentHealth = maxHp;
  playerEntity.magicka = playerEntity.maxMagicka ?? 100;
  const maxFat = Number.isFinite(playerEntity.maxFatigue)
    ? playerEntity.maxFatigue
    : (maxFatigue(playerEntity) || 1000);
  playerEntity.fatigue = maxFat;

  if (Array.isArray(playerEntity.activeEffects)) {
    for (const a of playerEntity.activeEffects) {
      if (a && (a.kind === 'poison' || a.kind === 'disease' || a.kind === 'drainAttribute')) {
        a.ended = true;
      }
    }
  }

  // Phylactery anchor position fallback if passed
  const phylactery = options?.anchorPosition ? options : (playerEntity.phylacteryAnchor ?? null);
  const respawnPosition = phylactery?.anchorPosition ? [...phylactery.anchorPosition] : null;

  // 2. Delegate cemetery relocation to registered hook (in world scene context):
  let cemetery = null;
  if (typeof _lichCemeteryRespawnHook === 'function') {
    try {
      cemetery = _lichCemeteryRespawnHook(playerEntity, options);
    } catch (e) {
      console.error('[necro] lich cemetery respawn hook error:', e);
    }
  }

  return {
    reconstituted: true,
    minutesAdvanced: LICH_RESPAWN_MONTH_MINUTES,
    daysAdvanced: 30,
    respawnPosition,
    cemetery,
  };
}

export const reconstituteLich = handleLichMortalFall;

export const ARCH_LICH_MIN_LEVEL = 30;
export const ARCH_LICH_MIN_MYSTICISM = 200;
export const ARCH_LICH_MIN_INTELLIGENCE = 115;
export const ARCH_LICH_MIN_WILLPOWER = 115;

/**
 * Validates prerequisites for Arch-Lichdom ascension:
 * 1. Must ALREADY be an active Lich (liveLichdom).
 * 2. Character level >= 30.
 * 3. Mysticism skill >= 200.
 * 4. Intelligence stat >= 115.
 * 5. Willpower stat >= 115.
 * @param {object} caster
 * @returns {{ eligible: boolean, isMortal: boolean, reasons: string[] }}
 */
export function canAscendToArchLichdom(caster) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { eligible: false, isMortal: false, alreadyAncient: false, reasons: ['Necromancy is disabled.'] };
  }
  if (!caster) {
    return { eligible: false, isMortal: true, alreadyAncient: false, reasons: ['Invalid caster.'] };
  }

  // Already Ancient Lich: no harm, no effect
  if (isAncientLich(caster)) {
    return {
      eligible: false,
      isMortal: false,
      alreadyAncient: true,
      reasons: ['You have already ascended to Ancient Lichdom.'],
    };
  }

  // Must ALREADY be a Lich
  if (!isLich(caster)) {
    return {
      eligible: false,
      isMortal: true,
      alreadyAncient: false,
      reasons: ['You are mortal. The ritual requires having already achieved Lichdom.'],
    };
  }

  const reasons = [];
  const level = caster.level || 1;
  if (level < ARCH_LICH_MIN_LEVEL) {
    reasons.push(`Level ${ARCH_LICH_MIN_LEVEL} required (current: ${level}).`);
  }

  const myst = Math.max(
    displaySkillValue(caster, SKILLS.Mysticism),
    realSkillValue(caster, SKILLS.Mysticism),
    skillValue(caster, SKILLS.Mysticism),
    caster.skills?.[SKILLS.Mysticism] ?? 0,
  );
  if (myst < ARCH_LICH_MIN_MYSTICISM) {
    reasons.push(`Mysticism ${ARCH_LICH_MIN_MYSTICISM} required (current: ${myst}).`);
  }

  const intStat = Math.max(
    liveStat(caster, 'intelligence'),
    caster.stats?.intelligence ?? 0,
  );
  if (intStat < ARCH_LICH_MIN_INTELLIGENCE) {
    reasons.push(`Intelligence ${ARCH_LICH_MIN_INTELLIGENCE} required (current: ${intStat}).`);
  }

  const wilStat = Math.max(
    liveStat(caster, 'willpower'),
    caster.stats?.willpower ?? 0,
  );
  if (wilStat < ARCH_LICH_MIN_WILLPOWER) {
    reasons.push(`Willpower ${ARCH_LICH_MIN_WILLPOWER} required (current: ${wilStat}).`);
  }

  return {
    eligible: reasons.length === 0,
    isMortal: false,
    reasons,
  };
}

/**
 * Performs the Arch-Lichdom transformation ritual.
 * If requirements are met, ascends the Lich into an Ancient Lich.
 * If requirements are NOT met, or if invoked by a mortal, triggers lethal collapse:
 * - Mortal caster: instant lethal death.
 * - Lich caster: normal Lich death, triggering phylactery reconstitution if charged.
 * @param {object} caster
 * @param {object} [options]
 * @returns {{ success: boolean, reason?: string, message?: string, racialOverride?: object }}
 */
export function performArchLichdomRitual(caster, { hurtPlayer = null, sinks = null, forceDeath = null, nowMinutes = 0 } = {}) {
  const check = canAscendToArchLichdom(caster);
  if (check.alreadyAncient) {
    const msg = t('spell.necro.alreadyAncientLich', 'You have already achieved Ancient Lichdom. Do not squander your power in vain.');
    return {
      success: false,
      alreadyAncient: true,
      reason: msg,
      message: msg,
    };
  }
  if (!check.eligible) {
    const triggerDeath = forceDeath ?? _forceDeathHook;
    if (typeof triggerDeath === 'function') {
      triggerDeath(caster);
    } else {
      const hurtFn = hurtPlayer ?? sinks?.hurt;
      const lethalDmg = Math.max(99999, (caster?.maxHealth ?? 100) * 20);
      if (typeof hurtFn === 'function') {
        hurtFn(lethalDmg, { bypassShield: true });
      }
      if (caster && typeof caster.health === 'number') {
        caster.health = 0;
        if (caster.currentHealth != null) caster.currentHealth = 0;
      }
      if (caster?.phylacteryAnchor && isLich(caster)) {
        handleLichMortalFall(caster, caster.phylacteryAnchor);
      }
    }

    const failReason = check.reasons.join(' ');
    return {
      success: false,
      reason: check.isMortal
        ? 'A mortal vessel cannot channel the ancient cosmos! You are destroyed by the catastrophic surge.'
        : `The unholy ritual turns upon you with fatal fury! (${failReason})`,
    };
  }

  const phylacteryId = caster.phylacteryAnchor?.id ?? 'phylactery_ancient';
  const override = applyAncientLichdom(caster, { phylacteryId, nowMinutes });
  if (!override) {
    return {
      success: false,
      reason: 'The ancient apotheosis refused to take hold.',
    };
  }

  return {
    success: true,
    message: 'The veil of eternity tears asunder. You have ascended to Ancient Lichdom!',
    racialOverride: override,
  };
}


