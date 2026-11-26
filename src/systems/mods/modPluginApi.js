// @ts-check
// DFF NATIVE MOD PLUGIN API
//
// Safe sandbox facade provided to third-party plugin scripts (plugin.js).
// Gives plugins access to events, player state, HUD notifications, and
// save-game persistence through src/systems/modSaveData.js.

import { onModEvent, offModEvent, emitModEvent } from './modEventBus.js';
import { registerModSaveData } from '../modSaveData.js';
import { registerPerk, unregisterPerk, clearDynamicPerks, hasUnlockedPerk } from '../perks/perkRegistry.js';
import { hudText } from '../notify.js';
import { setMidScreenText } from '../../ui/midScreenText.js';
import { t } from '../textManager.js';
import { hurtPlayer, surfacePlayer } from '../../characters/playerEntity.js';
import { FATIGUE_MULTIPLIER, maxFatigue, liveStat } from '../statMods.js';
import { skillValue } from '../skills.js';
import { SOUND } from '../soundClips.js';
import { audio } from '../audio.js';
import { computeEntityMods, registerEntityFold, registerWeaponBlowMod, EMPTY_MODS } from '../entityMods.js';
import { registerBlowTakenMod } from '../blowTaken.js';
import { registerSwingPaceMod } from '../../characters/weaponStates.js';
import { registerSpellCostMod, registerSpellFreeCast } from '../spellcost.js';
import { registerSpellPowerMod, registerSpellPierceMod, registerSpellLandedListener } from '../spell/spellPower.js';
import { registerCastSpeedMod } from '../castSpeed.js';
import { registerAbsorptionChance } from '../absorption.js';
import { registerEnemyLootExtra, registerTabledLootHandler } from '../loot/loot.js';
import { registerContainerLootHandler } from '../containerLoot.js';
import { registerModPreventRestCondition, clearModPreventRestConditions } from '../rest/restSession.js';
import { registerPlayerCastListener } from '../playerCasts.js';
import { registerPlayerKillListener } from '../playerKills.js';
import { registerPlayerStruckListener } from '../../combat/formulas.js';
import { registerTakeListener, goldPiecesOf, addGoldPieces, addItem } from '../inventory.js';
import { getInteractionMode, setInteractionMode, interactionModeText, onInteractionModeChange } from '../../player/interactionMode.js';
import { onMotorStep } from '../../player/motor.js';
import { currentWeather, currentWeatherEnum } from '../weather/weatherSim.js';
import { dateFromClassicMinutes } from '../gameDate.js';
import { getModSetting, setModSetting, getModSettingsSchema } from './modRegistry.js';
import { registerItemUseHandler, setItemFields, mintCondition, templateByIndex } from '../item/itemTemplates.js';
import { legendaryById, applyRarity } from '../loot/lootRarity.js';
import { getModCustomItemMeta, getModSpellRecord, getModLegendaryRecord } from './modDataSync.js';

/** @type {Map<string, Record<string, any>>} */
const _modStorageStore = new Map();

var _modSettingListeners;
function modSettingListeners() {
  return (_modSettingListeners ??= new Map());
}

/**
 * Notify a mod's registered `api.settings.onChange` listeners when a setting changes.
 * @param {string} modId
 * @param {string} key
 * @param {any} value
 */
export function notifyModSettingChanged(modId, key, value) {
  const listeners = modSettingListeners().get(modId);
  if (!listeners || listeners.size === 0) return;
  for (const entry of [...listeners]) {
    if (entry.key !== null && entry.key !== key) continue;
    try {
      entry.fn(value, key);
    } catch (err) {
      console.warn(`[ModPluginApi] Settings listener error for '${modId}.${key}':`, err?.message ?? err);
    }
  }
}

/** @type {Map<string, Map<string, { id: string, name: string, desc: string, icon?: string }>>} */
const _registeredPerks = new Map();

export function getModPerks(modId) {
  const perks = _registeredPerks.get(modId);
  return perks ? Array.from(perks.values()) : [];
}

export function unregisterModPerks(modId) {
  _registeredPerks.delete(modId);
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
 * Safely resolve maximum fatigue for a player entity.
 * Works with live DFO playerEntity, derived stat objects, or simple test mocks with .maxFatigue.
 * @param {any} entity
 * @returns {number}
 */
export function getPlayerMaxFatigue(entity) {
  if (!entity) return 100;
  if (typeof entity.maxFatigue === 'number' && entity.maxFatigue > 0) {
    return entity.maxFatigue;
  }
  if (!entity.stats && (entity.fatigue ?? 0) <= 100) {
    return 100;
  }
  try {
    const calc = maxFatigue(entity);
    if (Number.isFinite(calc) && calc > 0) return calc;
  } catch {
    // liveStat lookup fallback
  }
  if (entity.stats) {
    const str = entity.stats?.strength ?? 50;
    const end = entity.stats?.endurance ?? 50;
    return (str + end) * FATIGUE_MULTIPLIER;
  }
  return 100;
}

/**
 * Global game state accessors wired by runtime scene hosts.
 */
let _playerRef = null;
let _worldRef = null;

/** @type {Map<string, Set<() => void>>} */
const _modCleanups = new Map();

/** @type {Map<string, Map<string, any>>} */
const _modStatusChips = new Map();
let _modStatusChipsVersion = 0;

/** @type {Set<string>} */
var _activeModCommands;
function activeModCommands() {
  return (_activeModCommands ??= new Set());
}

var _consoleBridge;
/** @type {Array<{ name: string, description: string, usage: string, fn: Function, cmdKey: string }>} */
var _pendingModCommands;
function pendingModCommands() {
  return (_pendingModCommands ??= []);
}

/**
 * Late-bind consoleCommands registry to avoid circular TDZ on bundled boot.
 * @param {{ registerCommand: Function, gateConsoleCommand?: Function }} bridge
 */
export function bindModConsoleBridge(bridge) {
  if (!bridge || typeof bridge.registerCommand !== 'function') return;
  _consoleBridge = bridge;
  const pending = pendingModCommands();
  const active = activeModCommands();
  while (pending.length > 0) {
    const entry = pending.shift();
    if (!entry || !active.has(entry.cmdKey)) continue;
    _consoleBridge.registerCommand(entry.name, entry.description, entry.usage, entry.fn);
    _consoleBridge.gateConsoleCommand?.(entry.name, () => active.has(entry.cmdKey));
  }
}

let _movementState = {
  crouching: false,
  sneaking: false,
  running: false,
  grounded: true,
  swimming: false,
  riding: false,
  levitating: false,
};
let _secondAccum = 0;
let _bridgesWired = false;

function addModCleanup(modId, fn) {
  let set = _modCleanups.get(modId);
  if (!set) {
    set = new Set();
    _modCleanups.set(modId, set);
  }
  set.add(fn);
}

/**
 * Update tracked movement state and emit crouch/sneak transition events.
 * @param {Partial<typeof _movementState>} nextState
 */
export function setModMovementState(nextState) {
  if (!nextState || typeof nextState !== 'object') return;
  const prevCrouching = _movementState.crouching;
  const prevSneaking = _movementState.sneaking;
  _movementState = {
    crouching: nextState.crouching !== undefined ? !!nextState.crouching : _movementState.crouching,
    sneaking: nextState.sneaking !== undefined ? !!nextState.sneaking : _movementState.sneaking,
    running: nextState.running !== undefined ? !!nextState.running : _movementState.running,
    grounded: nextState.grounded !== undefined ? !!nextState.grounded : _movementState.grounded,
    swimming: nextState.swimming !== undefined ? !!nextState.swimming : _movementState.swimming,
    riding: nextState.riding !== undefined ? !!nextState.riding : _movementState.riding,
    levitating: nextState.levitating !== undefined ? !!nextState.levitating : _movementState.levitating,
  };
  if (_movementState.crouching !== prevCrouching) {
    emitModEvent('player:crouchChanged', { crouching: _movementState.crouching, prev: prevCrouching });
  }
  if (_movementState.sneaking !== prevSneaking) {
    emitModEvent('player:sneakChanged', {
      sneaking: _movementState.sneaking,
      crouching: _movementState.crouching,
      prev: prevSneaking,
    });
  }
}

/**
 * Wire core engine listeners once (idempotent) to forward gameplay events onto modEventBus.
 */
export function ensureModEngineBridges() {
  if (_bridgesWired) return;
  _bridgesWired = true;

  onInteractionModeChange((evt) => {
    emitModEvent('player:interactionModeChanged', evt);
  });

  onMotorStep((motor, dt) => {
    setModMovementState({
      crouching: !!motor?.crouching,
      sneaking: !!motor?.isSneaking,
      running: !!motor?.isRunning,
      grounded: !!motor?.grounded,
      swimming: !!motor?.isPlayerSwimming,
      riding: !!motor?.riding,
      levitating: !!motor?.levitating,
    });
    const clampedDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
    if (clampedDt > 0) {
      _secondAccum += clampedDt;
      while (_secondAccum >= 1.0) {
        _secondAccum -= 1.0;
        emitModEvent('secondTick', { dt: 1 });
      }
    }
  });

  registerPlayerCastListener('__modBridge', (entity, spell, cost) => {
    emitModEvent('playerCast', { entity, spell, cost });
  });
  registerSpellLandedListener('__modBridge', (info) => {
    emitModEvent('spellLanded', info);
  });
  registerPlayerStruckListener('__modBridge', (attacker, target, damage) => {
    emitModEvent('playerStruck', { attacker, target, damage });
  });
  registerPlayerKillListener('__modBridge', (entity, info) => {
    emitModEvent('playerKill', { target: entity, ...info });
  });
  registerTakeListener('__modBridge', (item) => {
    emitModEvent('itemTaken', { item });
  });
}

export function getModStatusChips() {
  const out = [];
  for (const [modId, map] of _modStatusChips.entries()) {
    for (const [chipId, def] of map.entries()) {
      out.push({
        key: `mod:${modId}:${chipId}`,
        modId,
        id: chipId,
        ...def,
      });
    }
  }
  return out;
}

export function getModStatusChipsVersion() {
  return _modStatusChipsVersion;
}

/**
 * Clean up all modifiers, HUD chips, rest gates, and console commands registered by a mod.
 * @param {string} modId
 */
export function cleanupModResources(modId) {
  modSettingListeners().delete(modId);
  const cleanups = _modCleanups.get(modId);
  if (cleanups) {
    for (const fn of cleanups) {
      try {
        fn();
      } catch (e) {
        console.warn(`[ModPluginApi] Cleanup error for '${modId}':`, e?.message ?? e);
      }
    }
    _modCleanups.delete(modId);
  }
  if (_modStatusChips.delete(modId)) {
    _modStatusChipsVersion++;
  }
  if (_playerRef) {
    try {
      computeEntityMods(_playerRef);
      surfacePlayer?.();
    } catch {
      // ignore on partial test mocks
    }
  }
}

export function setModApiContext({ player = null, world = null } = {}) {
  if (player) _playerRef = player;
  if (world) _worldRef = world;
}

/**
 * Create a scoped API instance for a specific mod.
 * @param {string} modId
 */
export function createModApi(modId) {
  ensureModEngineBridges();

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

  const regModKey = (name) => `mod:${modId}:${String(name ?? 'default')}`;

  return {
    modId,

    log: (...args) => console.log(`[Mod:${modId}]`, ...args),
    warn: (...args) => console.warn(`[Mod:${modId}]`, ...args),

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
        const max = getPlayerMaxFatigue(_playerRef);
        const scale = max > 200 ? FATIGUE_MULTIPLIER : 1;
        _playerRef.fatigue = Math.max(0, (_playerRef.fatigue ?? 0) - amount * scale);
        surfacePlayer?.();
      },
      /**
       * Restore player fatigue points up to maximum cap.
       * @param {number} amount
       */
      restoreFatigue: (amount) => {
        if (!_playerRef || !Number.isFinite(amount) || amount <= 0) return;
        const max = getPlayerMaxFatigue(_playerRef);
        const scale = max > 200 ? FATIGUE_MULTIPLIER : 1;
        _playerRef.fatigue = Math.min(max, (_playerRef.fatigue ?? 0) + amount * scale);
        surfacePlayer?.();
      },
      /**
       * Reduce player health points.
       * @param {number} amount
       */
      damageHealth: (amount) => {
        if (!_playerRef || !Number.isFinite(amount) || amount <= 0) return;
        hurtPlayer(_playerRef, amount);
        surfacePlayer?.();
      },
      /**
       * Restore player health points up to maximum cap.
       * @param {number} amount
       */
      heal: (amount) => {
        if (!_playerRef || !Number.isFinite(amount) || amount <= 0) return;
        const max = _playerRef.maxHealth ?? 100;
        _playerRef.health = Math.min(max, (_playerRef.health ?? 0) + amount);
        surfacePlayer?.();
      },
      /**
       * Reduce player magicka / spell points.
       * @param {number} amount
       */
      damageMagicka: (amount) => {
        if (!_playerRef || !Number.isFinite(amount) || amount <= 0) return;
        _playerRef.magicka = Math.max(0, (_playerRef.magicka ?? 0) - amount);
        surfacePlayer?.();
      },
      /**
       * Restore player magicka / spell points up to maximum cap.
       * @param {number} amount
       */
      restoreMagicka: (amount) => {
        if (!_playerRef || !Number.isFinite(amount) || amount <= 0) return;
        const max = _playerRef.maxMagicka ?? _playerRef.stats?.intelligence ?? 100;
        _playerRef.magicka = Math.min(max, (_playerRef.magicka ?? 0) + amount);
        surfacePlayer?.();
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
      getVitals: () => {
        const health = _playerRef?.health ?? 0;
        const maxHealth = _playerRef?.maxHealth ?? 100;
        const maxF = getPlayerMaxFatigue(_playerRef);
        const scale = maxF > 200 ? FATIGUE_MULTIPLIER : 1;
        const fatigue = Math.round((_playerRef?.fatigue ?? 0) / scale);
        const maxFatigueDisplay = Math.round(maxF / scale);
        const magicka = _playerRef?.magicka ?? 0;
        const maxMagicka = _playerRef?.maxMagicka ?? _playerRef?.stats?.intelligence ?? 100;
        return {
          health,
          maxHealth,
          fatigue,
          maxFatigue: maxFatigueDisplay,
          rawFatigue: _playerRef?.fatigue ?? 0,
          rawMaxFatigue: maxF,
          magicka,
          maxMagicka,
        };
      },
      getInteractionMode: () => getInteractionMode(),
      setInteractionMode: (mode, { notify = false } = {}) => {
        const ok = setInteractionMode(mode, { source: 'mod' });
        if (ok && notify && typeof setMidScreenText === 'function') {
          setMidScreenText(interactionModeText(mode), 1.2);
        }
        return ok;
      },
      isCrouching: () => _movementState.crouching,
      isSneaking: () => _movementState.sneaking,
      isRunning: () => _movementState.running,
      getMovementState: () => ({ ..._movementState }),
      getGold: () => goldPiecesOf(_playerRef),
      addGold: (amount) => {
        if (!_playerRef || !Number.isFinite(amount)) return goldPiecesOf(_playerRef);
        const next = addGoldPieces(_playerRef, Math.trunc(amount));
        surfacePlayer?.();
        return next;
      },
      getStat: (statName) => (_playerRef ? liveStat(_playerRef, statName) : 0),
      getSkill: (skillId) => (_playerRef ? skillValue(_playerRef, skillId) : 0),
      getEquipped: () => ({ ...(_playerRef?.equip?.slots ?? {}) }),
      giveItem: (item) => {
        if (!_playerRef || !item) return false;
        _playerRef.items = _playerRef.items || [];
        addItem(_playerRef.items, item);
        surfacePlayer?.();
        return true;
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
      getWeather: () => ({
        index: currentWeatherEnum(),
        name: currentWeather() ?? 'sunny',
      }),
      isRaining: () => {
        const idx = currentWeatherEnum();
        return idx === 4 || idx === 5;
      },
      isSnowing: () => currentWeatherEnum() === 6,
      getSeason: () => {
        const mins = _worldRef?.gameMinutes ?? _playerRef?.lastGameMinutes ?? 0;
        const month = dateFromClassicMinutes(mins).month;
        if (month === 11 || month <= 1) return 'winter';
        if (month <= 4) return 'spring';
        if (month <= 7) return 'summer';
        return 'autumn';
      },
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
      /**
       * Display a prominent mid-screen battle or status line (native HUD text).
       * @param {string} message
       * @param {number} [durationSeconds=1.5]
       */
      showMidScreen: (message, durationSeconds = 1.5) => {
        if (typeof setMidScreenText === 'function') {
          setMidScreenText(message, durationSeconds);
        } else {
          console.log(`[MidScreen Text]: ${message}`);
        }
      },
      /**
       * Translate a localized key through the engine's 26-language text core.
       * @param {string} key
       * @param {string} fallbackEn
       * @param {Record<string, any>} [vars]
       * @returns {string}
       */
      t: (key, fallbackEn, vars) => t(key, fallbackEn, vars),
      /**
       * Create or update a native HUD status chip with hover tooltip description.
       * @param {string} chipId
       * @param {{ name: string, kind?: 'buff'|'debuff'|'set'|'warn'|'danger', foot?: string|null, glyph?: string, meta?: string, lines?: string[], say?: string, tipFoot?: string|null, blink?: boolean }} def
       */
      setStatusChip: (chipId, def) => {
        if (!chipId || !def) return;
        let map = _modStatusChips.get(modId);
        if (!map) {
          map = new Map();
          _modStatusChips.set(modId, map);
        }
        map.set(String(chipId), { ...def });
        _modStatusChipsVersion++;
      },
      /**
       * Remove a mod's HUD status chip.
       * @param {string} chipId
       */
      clearStatusChip: (chipId) => {
        const map = _modStatusChips.get(modId);
        if (map && map.delete(String(chipId))) {
          _modStatusChipsVersion++;
        }
      },
    },

    audio: {
      play: (soundKeyOrId, volume = 0.8) => {
        const clip = typeof soundKeyOrId === 'string' ? SOUND[soundKeyOrId] : soundKeyOrId;
        if (clip == null) return false;
        try {
          audio?.playOneShot?.(clip, volume);
          return true;
        } catch {
          return false;
        }
      },
    },

    console: {
      register: (name, description, usage, fn) => {
        if (!name || typeof fn !== 'function') return;
        const cmdKey = String(name).toLowerCase();
        const active = activeModCommands();
        active.add(cmdKey);
        if (_consoleBridge) {
          _consoleBridge.registerCommand(name, description ?? '', usage ?? name, fn);
          _consoleBridge.gateConsoleCommand?.(name, () => active.has(cmdKey));
        } else {
          pendingModCommands().push({ name, description: description ?? '', usage: usage ?? name, fn, cmdKey });
        }
        addModCleanup(modId, () => {
          active.delete(cmdKey);
        });
      },
    },

    modifiers: {
      entityFold: (name, fn) => {
        const key = regModKey(name);
        if (typeof fn !== 'function') {
          registerEntityFold(key, null);
          return;
        }
        registerEntityFold(key, (entity) => {
          try {
            return fn(entity) ?? EMPTY_MODS;
          } catch {
            return EMPTY_MODS;
          }
        });
        addModCleanup(modId, () => registerEntityFold(key, null));
        if (_playerRef) {
          try {
            computeEntityMods(_playerRef);
            surfacePlayer?.();
          } catch {}
        }
      },
      weaponBlow: (name, fn) => {
        const key = regModKey(name);
        registerWeaponBlowMod(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerWeaponBlowMod(key, null));
      },
      blowTaken: (name, fn) => {
        const key = regModKey(name);
        registerBlowTakenMod(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerBlowTakenMod(key, null));
      },
      swingPace: (name, fn) => {
        const key = regModKey(name);
        registerSwingPaceMod(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerSwingPaceMod(key, null));
      },
      spellCost: (name, fn) => {
        const key = regModKey(name);
        registerSpellCostMod(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerSpellCostMod(key, null));
      },
      spellFreeCast: (name, fn) => {
        const key = regModKey(name);
        registerSpellFreeCast(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerSpellFreeCast(key, null));
      },
      spellPower: (name, fn) => {
        const key = regModKey(name);
        registerSpellPowerMod(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerSpellPowerMod(key, null));
      },
      spellPierce: (name, fn) => {
        const key = regModKey(name);
        registerSpellPierceMod(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerSpellPierceMod(key, null));
      },
      castSpeed: (name, fn) => {
        const key = regModKey(name);
        registerCastSpeedMod(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerCastSpeedMod(key, null));
      },
      absorption: (name, fn) => {
        const key = regModKey(name);
        registerAbsorptionChance(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerAbsorptionChance(key, null));
      },
      enemyLoot: (name, fn) => {
        const key = regModKey(name);
        registerEnemyLootExtra(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerEnemyLootExtra(key, null));
      },
      tabledLoot: (name, fn) => {
        const key = regModKey(name);
        registerTabledLootHandler(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerTabledLootHandler(key, null));
      },
      containerLoot: (name, fn) => {
        const key = regModKey(name);
        registerContainerLootHandler(key, fn);
        if (typeof fn === 'function') addModCleanup(modId, () => registerContainerLootHandler(key, null));
      },
      preventRest: (name, fn, message) => {
        const key = regModKey(name);
        registerModPreventRestCondition(key, fn, message);
        if (typeof fn === 'function') addModCleanup(modId, () => registerModPreventRestCondition(key, null));
      },
      refresh: () => {
        if (_playerRef) {
          try {
            computeEntityMods(_playerRef);
            surfacePlayer?.();
          } catch {}
        }
      },
    },

    perks: {
      /**
       * Register a perk definition for this mod.
       * @param {{ id: string, name: string, desc: string, icon?: string, check?: (entity: any) => boolean }} def
       */
      register: (def) => {
        if (!def?.id || !def?.name) return;
        let map = _registeredPerks.get(modId);
        if (!map) {
          map = new Map();
          _registeredPerks.set(modId, map);
        }
        const record = {
          id: String(def.id),
          name: String(def.name),
          desc: String(def.desc ?? ''),
          icon: def.icon ? String(def.icon) : undefined,
          check: typeof def.check === 'function' ? def.check : undefined,
          modId,
        };
        map.set(def.id, record);
        registerPerk(record);
      },

      /**
       * Check if player has unlocked this perk.
       * @param {string} perkId
       * @returns {boolean}
       */
      has: (perkId) => {
        if (_playerRef && hasUnlockedPerk(_playerRef, perkId)) return true;
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
        let didUnlock = false;
        if (!unlocked.includes(perkId)) {
          unlocked.push(perkId);
          store._unlockedPerks = unlocked;
          didUnlock = true;
        }

        if (_playerRef) {
          if (!Array.isArray(_playerRef.unlockedPerks)) _playerRef.unlockedPerks = [];
          if (!_playerRef.unlockedPerks.includes(perkId)) {
            _playerRef.unlockedPerks.push(perkId);
            didUnlock = true;
          }
        }

        if (didUnlock) {
          try {
            audio?.playOneShot?.(SOUND.ArenaFanfareLevelUp, 0.8);
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

    items: {
      /**
       * Register a custom Use handler for a templateIndex (auto-cleaned when mod disables).
       * @param {number} templateIndex
       * @param {Function} fn
       */
      onUse: (templateIndex, fn) => {
        if (!Number.isInteger(templateIndex) || typeof fn !== 'function') return;
        const wrapped = (item, collection, ctx = {}) => {
          const consume = () => {
            if ((item?.stackCount ?? 1) > 1) {
              item.stackCount -= 1;
            } else if (Array.isArray(collection)) {
              const idx = collection.indexOf(item);
              if (idx >= 0) collection.splice(idx, 1);
            }
          };
          try {
            const res = fn(item, collection, { ...ctx, consume });
            if (typeof res === 'string') return { kind: 'text', text: res };
            if (res && typeof res === 'object' && res.kind) return res;
            return { kind: 'handled' };
          } catch (err) {
            console.warn(`[ModPluginApi] items.onUse error in '${modId}' for template ${templateIndex}:`, err?.message ?? err);
            return { kind: 'text', text: 'Nothing happens.' };
          }
        };
        registerItemUseHandler(templateIndex, wrapped);
        addModCleanup(modId, () => registerItemUseHandler(templateIndex, null));
      },
      /**
       * Mint and give a template-backed item (custom or vanilla) to the player.
       * @param {number} templateIndex
       * @param {{ count?: number, group?: string }} [opts]
       */
      give: (templateIndex, { count = 1, group } = {}) => {
        if (!_playerRef || !templateByIndex(templateIndex)) return null;
        const meta = getModCustomItemMeta(templateIndex);
        const item = mintCondition(
          setItemFields({
            group: group || meta?.group || 'MiscItems',
            templateIndex,
            ...(count > 1 ? { stackCount: count } : {}),
          }),
        );
        _playerRef.items = _playerRef.items || [];
        addItem(_playerRef.items, item);
        surfacePlayer?.();
        return item;
      },
      /**
       * Mint and give a specific legendary item (mod-defined or built-in) to the player.
       * @param {string} legendaryId
       * @param {{ templateIndex?: number, group?: string, material?: number }} [opts]
       */
      giveLegendary: (legendaryId, { templateIndex, group, material } = {}) => {
        const rec = getModLegendaryRecord(legendaryId) ?? legendaryById(legendaryId);
        if (!_playerRef || !rec) return null;
        const tpl = templateIndex ?? rec.templates?.[0] ?? 135;
        const base = mintCondition(
          setItemFields({
            group: group ?? rec.group,
            templateIndex: tpl,
            ...(material != null ? { material } : {}),
          }),
        );
        applyRarity(base, 'legendary', Math.random, [rec]);
        _playerRef.items = _playerRef.items || [];
        addItem(_playerRef.items, base);
        surfacePlayer?.();
        return base;
      },
    },

    spells: {
      /**
       * Look up a mod-registered spell record by index.
       * @param {number} spellIndex
       */
      get: (spellIndex) => getModSpellRecord(spellIndex),
      /**
       * Check if the player's spellbook already contains a spell with this index.
       * @param {number} spellIndex
       */
      has: (spellIndex) =>
        Array.isArray(_playerRef?.spells) && _playerRef.spells.some((s) => s?.index === spellIndex),
      /**
       * Grant a mod-defined (or custom) spell to the player's spellbook.
       * @param {number|Record<string, any>} spellIndexOrObj
       */
      grant: (spellIndexOrObj) => {
        const rec =
          typeof spellIndexOrObj === 'number' ? getModSpellRecord(spellIndexOrObj) : spellIndexOrObj;
        if (!_playerRef || !rec) return false;
        _playerRef.spells = _playerRef.spells || [];
        const already = _playerRef.spells.some(
          (s) =>
            (Number.isInteger(rec.index) && rec.index >= 0 && s?.index === rec.index) ||
            (rec.name && s?.name === rec.name),
        );
        if (already) return false;
        _playerRef.spells.push(structuredClone(rec));
        surfacePlayer?.();
        return true;
      },
    },

    settings: {
      /**
       * Read a declared mod setting value (with manifest default & coercion).
       * @param {string} key
       * @returns {any}
       */
      get: (key) => getModSetting(modId, key),
      /**
       * Update a declared mod setting value and notify listeners.
       * @param {string} key
       * @param {any} value
       * @returns {any}
       */
      set: (key, value) => {
        const next = setModSetting(modId, key, value);
        notifyModSettingChanged(modId, key, next);
        return next;
      },
      /**
       * Return an object of all declared settings for this mod.
       * @returns {Record<string, any>}
       */
      getAll: () => {
        const out = {};
        for (const s of getModSettingsSchema(modId)) {
          if (s?.key) out[s.key] = getModSetting(modId, s.key);
        }
        return out;
      },
      /**
       * Subscribe to live MCM setting changes for this mod.
       * Supports `onChange(fn)` or `onChange(key, fn)`. Returns an unsubscribe function.
       * @param {string|Function} keyOrFn
       * @param {Function} [maybeFn]
       * @returns {() => void}
       */
      onChange: (keyOrFn, maybeFn) => {
        const hasKey = typeof keyOrFn === 'string';
        const targetKey = hasKey ? keyOrFn : null;
        const fn = hasKey ? maybeFn : keyOrFn;
        if (typeof fn !== 'function') return () => {};
        let set = modSettingListeners().get(modId);
        if (!set) {
          set = new Set();
          modSettingListeners().set(modId, set);
        }
        const entry = { key: targetKey, fn };
        set.add(entry);
        return () => set.delete(entry);
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
  for (const modId of [..._modCleanups.keys()]) {
    cleanupModResources(modId);
  }
  _modCleanups.clear();
  _modStatusChips.clear();
  _modStatusChipsVersion++;
  activeModCommands().clear();
  pendingModCommands().length = 0;
  modSettingListeners().clear();
  clearModPreventRestConditions();
  _movementState = {
    crouching: false,
    sneaking: false,
    running: false,
    grounded: true,
    swimming: false,
    riding: false,
    levitating: false,
  };
  _secondAccum = 0;
  _modStorageStore.clear();
  _registeredPerks.clear();
  clearDynamicPerks();
  _playerRef = null;
  _worldRef = null;
}

