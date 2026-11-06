// @ts-check
// DFF NATIVE MOD PLUGIN API
//
// Safe sandbox facade provided to third-party plugin scripts (plugin.js).
// Gives plugins access to events, player state, HUD notifications, and
// save-game persistence through src/systems/modSaveData.js.

import { onModEvent, offModEvent, emitModEvent } from './modEventBus.js';
import { registerModSaveData } from '../modSaveData.js';
import { hudText } from '../notify.js';
import { hurtPlayer } from '../../characters/playerEntity.js';
import { FATIGUE_MULTIPLIER } from '../statMods.js';
import { SOUND } from '../soundClips.js';
import * as audio from '../audio.js';

/** @type {Map<string, Record<string, any>>} */
const _modStorageStore = new Map();

/** @type {Map<string, Map<string, { id: string, name: string, desc: string, icon?: string }>>} */
const _registeredPerks = new Map();

export function getModPerks(modId) {
  const perks = _registeredPerks.get(modId);
  return perks ? Array.from(perks.values()) : [];
}

export function getAllRegisteredPerks() {
  const all = [];
  for (const [modId, perks] of _registeredPerks.entries()) {
    for (const perk of perks.values()) {
      all.push({ modId, ...perk });
    }
  }
  return all;
}

/**
 * Global game state accessors wired by runtime scene hosts.
 */
let _playerRef = null;
let _worldRef = null;

export function setModApiContext({ player = null, world = null } = {}) {
  if (player) _playerRef = player;
  if (world) _worldRef = world;
}

/**
 * Create a scoped API instance for a specific mod.
 * @param {string} modId
 */
export function createModApi(modId) {
  // Ensure mod save slot is registered with core save system
  if (!_modStorageStore.has(modId)) {
    _modStorageStore.set(modId, {});

    registerModSaveData(modId, {
      newSaveData: () => ({}),
      getSaveData: () => _modStorageStore.get(modId) ?? {},
      restoreSaveData: (savedData) => {
        _modStorageStore.set(modId, savedData ? { ...savedData } : {});
      },
      newGame: () => {
        _modStorageStore.set(modId, {});
      },
    });
  }

  return {
    modId,

    events: {
      /**
       * @param {string} event
       * @param {Function} handler
       */
      on: (event, handler) => onModEvent(event, handler, modId),
      /**
       * @param {string} event
       * @param {Function} handler
       */
      off: (event, handler) => offModEvent(event, handler),
    },

    player: {
      getEntity: () => _playerRef,
      /**
       * Reduce player fatigue points.
       * @param {number} amount
       */
      damageFatigue: (amount) => {
        if (!_playerRef || !Number.isFinite(amount) || amount <= 0) return;
        const max = _playerRef.maxFatigue ?? 100;
        const scale = max > 200 ? FATIGUE_MULTIPLIER : 1;
        _playerRef.fatigue = Math.max(0, (_playerRef.fatigue ?? 0) - amount * scale);
      },
      /**
       * Restore player fatigue points.
       * @param {number} amount
       */
      restoreFatigue: (amount) => {
        if (!_playerRef || !Number.isFinite(amount) || amount <= 0) return;
        const max = _playerRef.maxFatigue ?? 100;
        const scale = max > 200 ? FATIGUE_MULTIPLIER : 1;
        _playerRef.fatigue = Math.min(max, (_playerRef.fatigue ?? 0) + amount * scale);
      },
      /**
       * Reduce player health points.
       * @param {number} amount
       */
      damageHealth: (amount) => {
        if (!_playerRef || !Number.isFinite(amount) || amount <= 0) return;
        hurtPlayer(_playerRef, amount);
      },
      /**
       * Restore player health points.
       * @param {number} amount
       */
      heal: (amount) => {
        if (!_playerRef || !Number.isFinite(amount) || amount <= 0) return;
        const max = _playerRef.maxHealth ?? 100;
        _playerRef.health = Math.min(max, (_playerRef.health ?? 0) + amount);
      },
      /**
       * Check if player has an active magic effect by key or name.
       * @param {string} effectKey
       * @returns {boolean}
       */
      hasEffect: (effectKey) => {
        if (effectKey === 'resistFrost' && (_playerRef?.resistances?.frost > 0 || _playerRef?.career?.Frost >= 1)) {
          return true;
        }
        const effects = _playerRef?.activeEffects;
        if (!Array.isArray(effects)) return false;
        return effects.some(
          (e) =>
            !e?.ended &&
            (e?.key === effectKey ||
              e?.name === effectKey ||
              e?.kind === effectKey ||
              (effectKey === 'resistFrost' && e?.kind === 'elementalResistance' && e?.element === 1)),
        );
      },
    },

    world: {
      getGameMinutes: () => _worldRef?.gameMinutes ?? _playerRef?.lastGameMinutes ?? 0,
      isNight: () => {
        const mins = _worldRef?.gameMinutes ?? _playerRef?.lastGameMinutes ?? 0;
        const hour = Math.floor((mins / 60) % 24);
        return hour >= 20 || hour < 6;
      },
      isInterior: () => !!_worldRef?.isInterior,
      getCurrentBiome: () => _worldRef?.biome ?? 'temperate',
    },

    ui: {
      /**
       * Display an on-screen HUD popup message.
       * @param {string} text
       */
      notify: (text) => {
        if (typeof hudText === 'function') {
          hudText(text);
        } else {
          console.log(`[HUD Notification]: ${text}`);
        }
      },
    },

    perks: {
      /**
       * Register a perk definition for this mod.
       * @param {{ id: string, name: string, desc: string, icon?: string }} def
       */
      register: (def) => {
        if (!def?.id || !def?.name) return;
        let map = _registeredPerks.get(modId);
        if (!map) {
          map = new Map();
          _registeredPerks.set(modId, map);
        }
        map.set(def.id, {
          id: String(def.id),
          name: String(def.name),
          desc: String(def.desc ?? ''),
          icon: def.icon ? String(def.icon) : undefined,
        });
      },

      /**
       * Check if player has unlocked this perk.
       * @param {string} perkId
       * @returns {boolean}
       */
      has: (perkId) => {
        const store = _modStorageStore.get(modId) ?? {};
        const unlocked = store._unlockedPerks;
        return Array.isArray(unlocked) && unlocked.includes(perkId);
      },

      /**
       * Unlock a perk for the player.
       * @param {string} perkId
       * @returns {boolean}
       */
      unlock: (perkId) => {
        let store = _modStorageStore.get(modId);
        if (!store) {
          store = {};
          _modStorageStore.set(modId, store);
        }
        const unlocked = Array.isArray(store._unlockedPerks) ? [...store._unlockedPerks] : [];
        if (!unlocked.includes(perkId)) {
          unlocked.push(perkId);
          store._unlockedPerks = unlocked;
          try {
            audio?.play2d?.(SOUND.ArenaFanfareLevelUp, 0.8);
          } catch {}
          emitModEvent('perk:unlocked', { modId, perkId });
          return true;
        }
        return false;
      },

      /**
       * List all registered perks for this mod along with unlock state.
       */
      getAll: () => {
        const list = getModPerks(modId);
        const store = _modStorageStore.get(modId) ?? {};
        const unlocked = Array.isArray(store._unlockedPerks) ? store._unlockedPerks : [];
        return list.map((p) => ({
          ...p,
          unlocked: unlocked.includes(p.id),
        }));
      },
    },

    storage: {
      /**
       * Retrieve a value from the mod's persistent save data.
       * @param {string} key
       * @param {any} [defaultValue=null]
       */
      get: (key, defaultValue = null) => {
        const data = _modStorageStore.get(modId);
        return data?.[key] !== undefined ? data[key] : defaultValue;
      },
      /**
       * Store a value in the mod's persistent save data.
       * @param {string} key
       * @param {any} value
       */
      set: (key, value) => {
        let data = _modStorageStore.get(modId);
        if (!data) {
          data = {};
          _modStorageStore.set(modId, data);
        }
        data[key] = value;
      },
    },
  };
}

/**
 * Reset all mod API storage state (for testing).
 */
export function _resetModPluginApi() {
  _modStorageStore.clear();
  _registeredPerks.clear();
  _playerRef = null;
  _worldRef = null;
}

