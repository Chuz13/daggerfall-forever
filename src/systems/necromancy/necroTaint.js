// @ts-check
// NECRO-TAINT: Tracking occult infamy, spiritual decay, and physical pallor.
//
// Key principles:
// 1. Taint increases upon casting dark arts or desecrating corpses.
// 2. High taint alters NPC disposition and triggers Witch-Hunter investigations.
// 3. Lichdom locks taint at maximum (100).
// 4. Inactivity slowly washes taint away (-1 per classic game day) unless Lich.

import { isLich, isAnyLich, isPlayerDisguised } from './lichdomStatus.js';

export const TAINT_TIERS = Object.freeze({
  PRISTINE: 'pristine',     // 0..25: Untainted mortal
  TAINTED: 'tainted',       // 26..50: Gaunt, pale, eyes sunken
  DEFILER: 'defiler',       // 51..75: Reeks of grave dirt, Arkay inquisitors seek you
  ABOMINATION: 'abomination',// 76..100: Open creature of darkness (Lichdom is locked here)
});

let _playerTaint = 0;
let _lastDecayDay = 0;

/**
 * Locks global taint at 100 upon becoming a Lich or Ancient Lich.
 */
export function lockLichTaint() {
  _playerTaint = 100;
}

/**
 * Returns the current numerical taint (0..100).
 * @param {object} [playerEntity]
 * @returns {number}
 */
export function getPlayerTaint(playerEntity = null) {
  if (playerEntity && isAnyLich(playerEntity)) {
    _playerTaint = 100;
    return 100;
  }
  if (
    playerEntity &&
    typeof playerEntity === 'object' &&
    typeof playerEntity.necroTaint === 'number' &&
    Number.isFinite(playerEntity.necroTaint)
  ) {
    _playerTaint = Math.max(0, Math.min(100, playerEntity.necroTaint));
    return _playerTaint;
  }
  return _playerTaint;
}

/**
 * Returns the effective taint for trade/disposition (0 when disguised via Mortal Disguise spell or enchantment).
 * @param {object} [playerEntity]
 * @returns {number}
 */
export function getEffectiveTradeTaint(playerEntity = null) {
  if (playerEntity && isPlayerDisguised(playerEntity)) {
    return 0;
  }
  return getPlayerTaint(playerEntity);
}

/**
 * Returns the semantic taint tier.
 * @param {object} [playerEntity]
 * @returns {'pristine'|'tainted'|'defiler'|'abomination'}
 */
export function getTaintTier(playerEntity = null) {
  const taint = getPlayerTaint(playerEntity);
  if (taint >= 76) return TAINT_TIERS.ABOMINATION;
  if (taint >= 51) return TAINT_TIERS.DEFILER;
  if (taint >= 26) return TAINT_TIERS.TAINTED;
  return TAINT_TIERS.PRISTINE;
}

/**
 * Increases the player's necromantic taint.
 * @param {number} amount
 * @param {object} [playerEntity]
 * @returns {number} New taint level
 */
export function addNecroTaint(amount, playerEntity = null) {
  if (playerEntity && isAnyLich(playerEntity)) {
    _playerTaint = 100;
    if (typeof playerEntity === 'object') playerEntity.necroTaint = 100;
    return 100;
  }
  _playerTaint = Math.min(100, Math.max(0, _playerTaint + Math.max(0, amount)));
  if (playerEntity && typeof playerEntity === 'object') {
    playerEntity.necroTaint = _playerTaint;
  }
  return _playerTaint;
}

/**
 * Daily decay of taint when no dark magic is practiced.
 * @param {number} currentDay
 * @param {object} [playerEntity]
 */
export function tickTaintDaily(currentDay, playerEntity = null) {
  if (playerEntity && isAnyLich(playerEntity)) {
    _playerTaint = 100;
    if (typeof playerEntity === 'object') playerEntity.necroTaint = 100;
    return;
  }
  if (!Number.isFinite(currentDay)) return;
  if (currentDay < _lastDecayDay) {
    _lastDecayDay = currentDay;
    return;
  }
  if (_lastDecayDay === 0 && currentDay > 365) {
    _lastDecayDay = currentDay;
    return;
  }
  if (currentDay > _lastDecayDay) {
    const daysPassed = currentDay - _lastDecayDay;
    _playerTaint = Math.max(0, _playerTaint - daysPassed);
    _lastDecayDay = currentDay;
    if (playerEntity && typeof playerEntity === 'object') {
      playerEntity.necroTaint = _playerTaint;
    }
  }
}

/**
 * Synchronizes module-level taint state and decay anchor from a restored save entity.
 * Prevents taint from a previous Lich session bleeding onto a newly loaded mortal save.
 * @param {object} [playerEntity]
 * @param {number|null} [currentDay]
 * @returns {number}
 */
export function syncNecroTaintFromEntity(playerEntity = null, currentDay = null) {
  if (playerEntity && isAnyLich(playerEntity)) {
    _playerTaint = 100;
    playerEntity.necroTaint = 100;
  } else if (
    playerEntity &&
    typeof playerEntity === 'object' &&
    typeof playerEntity.necroTaint === 'number' &&
    Number.isFinite(playerEntity.necroTaint)
  ) {
    _playerTaint = Math.max(0, Math.min(100, playerEntity.necroTaint));
    playerEntity.necroTaint = _playerTaint;
  } else {
    _playerTaint = 0;
    if (playerEntity && typeof playerEntity === 'object') {
      playerEntity.necroTaint = 0;
    }
  }
  if (typeof currentDay === 'number' && Number.isFinite(currentDay) && currentDay >= 0) {
    _lastDecayDay = Math.floor(currentDay);
  }
  return _playerTaint;
}

/**
 * Modifies merchant and dialogue disposition based on taint.
 * @param {number} baseDisposition
 * @param {object} [playerEntity]
 * @returns {number} Modified disposition
 */
export function applyTaintDisposition(baseDisposition, playerEntity = null) {
  if (playerEntity && isPlayerDisguised(playerEntity)) {
    return baseDisposition;
  }
  const tier = getTaintTier(playerEntity);
  switch (tier) {
    case TAINT_TIERS.TAINTED:
      return Math.max(0, baseDisposition - 10);
    case TAINT_TIERS.DEFILER:
      return Math.max(0, baseDisposition - 25);
    case TAINT_TIERS.ABOMINATION:
      return Math.max(0, baseDisposition - 50);
    default:
      return baseDisposition;
  }
}

/**
 * Resets taint state for tests.
 */
export function _resetTaintForTests() {
  _playerTaint = 0;
  _lastDecayDay = 0;
}

