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

import { applyLichdom, isLich } from './lichdomStatus.js';
import { skillValue, SKILLS } from '../skills.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';

export const PHYLACTERY_STATE = Object.freeze({
  UNBOUND: 'unbound',
  BOUND: 'bound',
  SHATTERED: 'shattered',
});

export const MIN_LICHDOM_LEVEL = 5;
export const MIN_LICHDOM_MYSTICISM = 40;

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
  if (!isLich(playerEntity)) {
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

