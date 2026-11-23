// @ts-check
import { breakWindup } from '../../ai/tactics.js';

/** Real-time (unpaused) protection window after a wager/sparring duel ends (seconds). */
export const SPAR_GRACE_SECONDS = 5;

const SPAR_CLEAR_KINDS = new Set([
  'continuousDamage',
  'continuousDamageSpellPoints',
  'continuousDamageFatigue',
  'poison',
  'paralyze',
]);

/** Whether `foe` is currently within its post-duel surrender grace window. */
export const isSparProtected = (f) => !!(f && !f.dead && f._sparGraceLeft > 0);

/** Whether `foe` is currently kneeling in surrender (during the grace window after losing a duel). */
export const isSparKneeling = (f) => !!(f && !f.dead && f._sparKneeling && f._sparGraceLeft > 0);

/** Whether `foe` is a surrendered sparring opponent that has not been re-provoked. */
export const isSparPeaceful = (f) => !!(f && !f.dead && f._surrenderedSpar && !f.ai?.isHostile);

/**
 * Strip lingering hostile DoTs, poisons, and paralysis from `entity.activeEffects` when a spar ends.
 * When `onlyFrom` is provided (for the player on loss), only removes entries cast by `onlyFrom`
 * plus active poison ticks (since weapon poison entries carry no caster).
 * @param {any} entity
 * @param {{ onlyFrom?: any }} [opts]
 */
export function clearSparCombatEffects(entity, { onlyFrom = null } = {}) {
  const list = entity?.activeEffects;
  if (!Array.isArray(list) || !list.length) return;
  entity.activeEffects = list.filter((a) => {
    if (!a || !SPAR_CLEAR_KINDS.has(a.kind)) return true;
    if (onlyFrom == null) return false;
    if (a.caster === onlyFrom) return false;
    if (a.kind === 'poison' && a.caster == null) return false;
    return true;
  });
}

/**
 * Transition a sparring adventurer into its post-duel state (`PLAYER_WON` or `PLAYER_LOST`),
 * arming the 5-second protection window, resetting attack/windup state, clearing DoTs/poisons,
 * and detaching any player allies/summons that were targeting it.
 * @param {any} foe
 * @param {{ playerWon?: boolean, foes?: any[], playerEntity?: any, now?: number }} [opts]
 */
export function beginSparEnd(foe, { playerWon = true, foes = [], playerEntity = null, now = Date.now() } = {}) {
  if (!foe) return;
  foe._isSparring = false;
  foe._surrenderedSpar = true;
  foe._sparGraceLeft = SPAR_GRACE_SECONDS;
  foe._sparKneeling = !!playerWon;
  foe._sparYieldAt = now;

  if (foe.ai) {
    foe.ai.isHostile = false;
    foe.ai.target = null;
    foe.ai.secondaryTarget = null;
    foe.ai.velX = 0;
    foe.ai.velZ = 0;
    foe.ai.moving = false;
    foe.ai.path = null;
    breakWindup(foe.ai);
  }
  if (foe.attack?.machine) {
    foe.attack.machine.state = 'Idle';
    foe.attack.machine.acc = 0;
    foe.attack._held = false;
  }

  clearSparCombatEffects(foe.entity);
  if (!playerWon && playerEntity) {
    clearSparCombatEffects(playerEntity, { onlyFrom: foe.entity });
  }

  for (const ally of foes) {
    if (!ally || ally === foe || ally.dead || !ally.ai) continue;
    if (ally.ai.target === foe) ally.ai.target = null;
    if (ally.ai.secondaryTarget === foe) ally.ai.secondaryTarget = null;
  }
}

/**
 * Advance the post-duel grace timer by `dt` real (unpaused) seconds.
 * Returns `true` on the frame the grace window expires and the adventurer stands back up.
 * @param {any} foe
 * @param {number} dt
 * @returns {boolean}
 */
export function stepSparSurrender(foe, dt) {
  if (!foe || foe.dead || !(foe._sparGraceLeft > 0)) return false;
  foe._sparGraceLeft = Math.max(0, foe._sparGraceLeft - Math.max(0, Number(dt) || 0));
  if (foe._sparKneeling && foe.ai) {
    foe.ai.velX = 0;
    foe.ai.velZ = 0;
    foe.ai.moving = false;
  }
  if (foe._sparGraceLeft <= 0) {
    foe._sparGraceLeft = 0;
    foe._sparKneeling = false;
    return true;
  }
  return false;
}

/**
 * 2D sprite pose for a kneeling surrendered adventurer: holds the last hurt frame with a subtle breath.
 * Mirrors `kneelPose` in `systems/revenant/revenantFate.js`.
 * @param {any} foe
 * @param {number[]|null|undefined} eye
 * @param {number} [now]
 */
export function sparKneelPose(foe, eye, now = Date.now()) {
  if (!foe?.mobile?.heldPose || !foe.ai) return foe?._mout ?? null;
  const breath = (now - (foe._sparYieldAt ?? 0)) % 1700 < 320;
  return foe.mobile.heldPose('hurt', breath ? -2 : -1, foe.ai.yaw, foe.ai.feet, eye ?? foe.ai.feet);
}
