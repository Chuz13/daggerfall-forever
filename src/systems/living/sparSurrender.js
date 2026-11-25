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

/** Whether `f` is a player-allied body (companion, shipmate, minion, champion, or PlayerAlly team). */
export function isPlayerAllyFoe(f) {
  if (!f) return false;
  const team = f.entity?.team;
  const mTeam = f.entity?.mobileTeam ?? f.entity?.basics?.team;
  return team === 'PlayerAlly'
    || mTeam === 'PlayerAlly'
    || f.companion != null
    || !!f.shipmate
    || f.livingRole === 'undead_minion'
    || f.livingRole === 'apotheosis_champion'
    || !!f.allied;
}

/** Clear active AI/attack/mobile combat latches on `rec` so an ended duel never leaks arrows, swings, or stale `targetSenses`. */
function resetCombatBody(rec) {
  if (!rec) return;
  if (rec.ai) {
    rec.ai.target = null;
    rec.ai.secondaryTarget = null;
    rec.ai.targetSenses = null;
    rec.ai._targetCandidate = null;
    rec.ai.detected = false;
    rec.ai.inSight = false;
    rec.ai.giveUpTimer = 0;
    rec.ai.lastKnownTargetPos = null;
    rec.ai.oldLastKnownTargetPos = null;
    rec.ai.predictedTargetPos = null;
    rec.ai._blowShot = null;
    rec.ai._wantAimed = false;
    rec.ai._blowWind = false;
    rec.ai._blowSwing = false;
    rec.ai._blowHold = false;
    rec.ai.velX = 0;
    rec.ai.velZ = 0;
    rec.ai.moving = false;
    rec.ai.path = null;
    breakWindup(rec.ai);
  }
  if (rec.attack) {
    rec.attack.firedRanged = false;
    rec.attack.meleeTimer = 0;
    rec.attack._held = false;
    if (rec.attack.machine) {
      rec.attack.machine.state = 'Idle';
      rec.attack.machine.acc = 0;
    }
  }
  if (rec.mobile) {
    rec.mobile.shootArrow = false;
    rec.mobile.doMeleeDamage = false;
    if (rec.mobile.state === 'ranged' || rec.mobile.state === 'attack' || rec.mobile.state === 'spell') {
      if (typeof rec.mobile._change === 'function') rec.mobile._change('idle');
      else {
        rec.mobile.state = 'idle';
        rec.mobile.frame = 0;
        rec.mobile._timer = 0;
        rec.mobile._attackFrames = null;
        rec.mobile._iter = 0;
        rec.mobile._underHold = false;
        rec.mobile._heldSwing = false;
      }
    }
  }
}

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
  const outcome = playerWon ? 'PLAYER_WON' : 'PLAYER_LOST';
  foe._lastSparOutcome = outcome;
  if (foe._advDialog) {
    foe._advDialog.used = foe._advDialog.used ?? {};
    foe._advDialog.used.wager = true;
    foe._advDialog.sparOutcome = outcome;
  }

  if (foe.ai) foe.ai.isHostile = false;
  resetCombatBody(foe);

  clearSparCombatEffects(foe.entity);
  if (!playerWon && playerEntity) {
    clearSparCombatEffects(playerEntity, { onlyFrom: foe.entity });
  }

  for (const ally of foes) {
    if (!ally || ally === foe || ally.dead || !ally.ai) continue;
    const hadTarget = ally.ai.target === foe;
    if (hadTarget || ally.ai.secondaryTarget === foe || ally.ai.targetSenses === foe || ally.ai._targetCandidate === foe) {
      if (ally.ai.target === foe) ally.ai.target = null;
      if (ally.ai.secondaryTarget === foe) ally.ai.secondaryTarget = null;
      if (ally.ai.targetSenses === foe) ally.ai.targetSenses = null;
      if (ally.ai._targetCandidate === foe) ally.ai._targetCandidate = null;
      if (hadTarget) {
        ally.ai.detected = false;
        ally.ai.inSight = false;
        ally.ai.giveUpTimer = 0;
        ally.ai.lastKnownTargetPos = null;
        ally.ai.oldLastKnownTargetPos = null;
        ally.ai.predictedTargetPos = null;
        ally.ai._blowShot = null;
        ally.ai._wantAimed = false;
        ally.ai._blowWind = false;
        ally.ai._blowSwing = false;
        ally.ai._blowHold = false;
        breakWindup(ally.ai);
        if (ally.attack) {
          ally.attack.firedRanged = false;
          ally.attack.meleeTimer = 0;
          ally.attack._held = false;
          if (ally.attack.machine) {
            ally.attack.machine.state = 'Idle';
            ally.attack.machine.acc = 0;
          }
        }
        if (ally.mobile) {
          ally.mobile.shootArrow = false;
          ally.mobile.doMeleeDamage = false;
          if (ally.mobile.state === 'ranged' || ally.mobile.state === 'attack' || ally.mobile.state === 'spell') {
            if (typeof ally.mobile._change === 'function') ally.mobile._change('idle');
            else {
              ally.mobile.state = 'idle';
              ally.mobile.frame = 0;
              ally.mobile._timer = 0;
              ally.mobile._attackFrames = null;
              ally.mobile._iter = 0;
              ally.mobile._underHold = false;
              ally.mobile._heldSwing = false;
            }
          }
        }
      }
    }
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
