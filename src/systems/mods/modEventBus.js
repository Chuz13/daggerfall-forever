// @ts-check
// DFF NATIVE MOD EVENT BUS
//
// Lightweight, zero-dependency event bus for native scripted plugins.
// Features:
// - Absolute error isolation (a throwing mod listener never breaks other mods or the game loop)
// - Mod-scoped listener registration for clean unloads

/**
 * @typedef {Object} ListenerRecord
 * @property {string} modId
 * @property {Function} fn
 */

/** @type {Map<string, Set<ListenerRecord>>} */
const _listeners = new Map();

/**
 * Subscribe a mod's listener function to an event.
 * @param {string} eventName
 * @param {Function} fn
 * @param {string} [modId='anonymous']
 */
export function onModEvent(eventName, fn, modId = 'anonymous') {
  if (typeof fn !== 'function') return;
  if (!_listeners.has(eventName)) {
    _listeners.set(eventName, new Set());
  }
  _listeners.get(eventName)?.add({ modId, fn });
}

/**
 * Unsubscribe a listener from an event.
 * @param {string} eventName
 * @param {Function} fn
 */
export function offModEvent(eventName, fn) {
  const set = _listeners.get(eventName);
  if (!set) return;
  for (const rec of set) {
    if (rec.fn === fn) {
      set.delete(rec);
      break;
    }
  }
}

/**
 * Remove all listeners registered by a specific mod.
 * @param {string} modId
 */
export function removeModListeners(modId) {
  for (const set of _listeners.values()) {
    for (const rec of set) {
      if (rec.modId === modId) {
        set.delete(rec);
      }
    }
  }
}

/**
 * Emit an event to all subscribers with isolated try/catch per listener.
 * @param {string} eventName
 * @param {any} [payload]
 */
export function emitModEvent(eventName, payload) {
  const set = _listeners.get(eventName);
  if (!set || set.size === 0) return;

  for (const { modId, fn } of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[ModEventBus] Error in mod '${modId}' on event '${eventName}':`, err);
    }
  }
}

/**
 * Reset all event listeners (for tests).
 */
export function _resetModEventBus() {
  _listeners.clear();
}
