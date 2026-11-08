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
import { liveStat } from '../statMods.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';
import { t } from '../textManager.js';

export const PHYLACTERY_STATE = Object.freeze({
  UNBOUND: 'unbound',
  BOUND: 'bound',
  SHATTERED: 'shattered',
});

export const MIN_LICHDOM_LEVEL = 5;
export const MIN_LICHDOM_MYSTICISM = 40;
export const ELIXIR_LICHDOM_LEVEL = 20;
export const ELIXIR_LICHDOM_MYSTICISM = 100;

/**
 * Checks whether the player meets the strict Elixir of Unlife alchemy ascension requirements:
 * Level >= 20 and Mysticism >= 100.
 * @param {object} playerEntity
 * @returns {{ eligible: boolean, reason?: string }}
 */
export function canDrinkElixirOfUnlife(playerEntity) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { eligible: false, reason: 'Necromancy is disabled.' };
  }
  if (!playerEntity) {
    return { eligible: false, reason: 'Invalid player entity.' };
  }
  if (isAnyLich(playerEntity)) {
    return { eligible: false, reason: 'You have already ascended to Lichdom.' };
  }
  const level = playerEntity.level || 1;
  if (level < ELIXIR_LICHDOM_LEVEL) {
    return {
      eligible: false,
      reason: `Your mortal vessel is too weak for the Elixir of Unlife (Requires Level ${ELIXIR_LICHDOM_LEVEL}, current: ${level}).`,
    };
  }
  const mystSkill = skillValue(playerEntity, SKILLS.Mysticism) || 15;
  if (mystSkill < ELIXIR_LICHDOM_MYSTICISM) {
    return {
      eligible: false,
      reason: `Your mastery of Mysticism is insufficient to bind your soul (Requires ${ELIXIR_LICHDOM_MYSTICISM}, current: ${mystSkill}).`,
    };
  }
  return { eligible: true };
}

/**
 * Drinks the Elixir of Unlife.
 * If Level >= 20 and Mysticism >= 100, binds a Phylactery and ascends to Lichdom.
 * Otherwise, the elixir acts as a lethal poison that ravages the drinker's mortal body.
 * @param {object} playerEntity
 * @param {object} [options]
 * @returns {{ success: boolean, lichdom: boolean, poisonDamage?: number, reason?: string, message?: string }}
 */
export function drinkElixirOfUnlife(playerEntity, { hurtPlayer = null, nowMinutes = 0 } = {}) {
  const check = canDrinkElixirOfUnlife(playerEntity);
  if (!check.eligible) {
    const lethalDmg = Math.max(100, (playerEntity?.maxHealth ?? 100) * 2);
    if (typeof hurtPlayer === 'function') {
      hurtPlayer(lethalDmg);
    } else if (playerEntity && typeof playerEntity.health === 'number') {
      playerEntity.health = Math.max(0, playerEntity.health - lethalDmg);
    }
    return {
      success: false,
      lichdom: false,
      poisonDamage: lethalDmg,
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

/**
 * Handles physical death of a Lich. If phylactery has charges, reconstitutes the player.
 * @param {object} playerEntity
 * @param {object} phylactery
 * @returns {{ reconstituted: boolean, respawnPosition: [number, number, number]|null, reason?: string }}
 */
export function handleLichMortalFall(playerEntity, phylactery) {
  if (!isAnyLich(playerEntity)) {
    return { reconstituted: false, respawnPosition: null, reason: 'Not a Lich' };
  }

  if (!phylactery || phylactery.state !== PHYLACTERY_STATE.BOUND) {
    return { reconstituted: false, respawnPosition: null, reason: 'Phylactery is not bound or destroyed' };
  }

  if (phylactery.charges <= 0) {
    phylactery.state = PHYLACTERY_STATE.SHATTERED;
    return { reconstituted: false, respawnPosition: null, reason: 'Phylactery soul energy exhausted' };
  }

  // Consume a charge and restore the Lich
  phylactery.charges--;
  const maxHp = playerEntity.maxHealth || 100;
  const restoredHp = Math.floor(maxHp * 0.5);
  playerEntity.health = restoredHp;
  playerEntity.currentHealth = restoredHp;

  return {
    reconstituted: true,
    respawnPosition: [...phylactery.anchorPosition],
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
export function performArchLichdomRitual(caster, { hurtPlayer = null, sinks = null, nowMinutes = 0 } = {}) {
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


