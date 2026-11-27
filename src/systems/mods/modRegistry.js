// DFF NATIVE MOD REGISTRY & LOADER
//
// Discovers, validates, and manages active native mods (Data-driven & Plugins).
// Connects to Electron's daggerShell.mods bridge on desktop, or virtual mock registry in web/tests.
// Adheres strictly to .agentrules (zero unhandled exceptions, surgical integration, no bloat).

import { FORK_FLAGS } from '../../config/forkFlags.js';
import { appStorage } from '../appStorage.js';

/**
 * @typedef {Object} ModManifest
 * @property {string} id - Unique identifier (e.g. "steel-and-sinew")
 * @property {string} name - Human readable display name
 * @property {string} [version] - Semantic version string
 * @property {string} [author] - Author name or handle
 * @property {string} [description] - Description of features
 * @property {boolean} [enabled] - Default enabled flag in manifest
 * @property {Record<string, string>} [data] - Map of data category to relative JSON path (e.g. { combat: "combat.json" })
 * @property {string} [entry] - Relative path to plugin entrypoint (e.g. "plugin.js")
 * @property {string} [locales] - Relative path to mod localization JSON (e.g. "locales.json")
 */

/**
 * @typedef {Object} LoadedMod
 * @property {string} id
 * @property {ModManifest} manifest
 * @property {string} folder
 * @property {boolean} enabled
 * @property {boolean} isVirtual
 * @property {string|null} [error]
 * @property {Map<string, string>} [files] - Virtual or cached file contents
 */

/** @type {Map<string, LoadedMod>} */
const _mods = new Map();
let _initialized = false;

// Mock registry for headless unit tests or pure web fallback
/** @type {Map<string, { manifest: ModManifest, files: Record<string, string> }>} */
const _virtualRegistry = new Map();

/**
 * Register a virtual mod (primarily for tests, mock runs, and web demos).
 * @param {ModManifest} manifest
 * @param {Record<string, string>} [files]
 */
export function registerVirtualMod(manifest, files = {}) {
  if (!manifest?.id) throw new Error('[ModRegistry] Virtual mod must provide manifest.id');
  _virtualRegistry.set(manifest.id, {
    manifest,
    files,
  });
  if (_initialized) {
    discoverMods();
  }
}

/**
 * Clear virtual mods registry (for test teardowns).
 */
export function clearVirtualMods() {
  _virtualRegistry.clear();
  if (_initialized) {
    discoverMods();
  }
}

/** @type {string[]|null} */
let _inMemoryLoadOrder = null;
const _inMemoryModToggles = new Map();
/** @type {Map<string, Map<string, any>>} */
const _inMemoryModSettings = new Map();

/**
 * Storage key for user mod toggle preference.
 * @param {string} modId
 */
const modPrefKey = (modId) => `dagger.mods.${modId}.enabled`;
const modSettingKey = (modId, key) => `dagger.mods.${modId}.setting.${key}`;
const MOD_LOAD_ORDER_KEY = 'dagger.mods.loadOrder';

function readModStorage(key) {
  try {
    const store = appStorage();
    const val = store?.getItem(key);
    if (val !== null && val !== undefined) return val;
    // One-way fallback migration for desktop profiles that stored mod prefs in localStorage before DA1 seam adoption.
    const fallback = typeof localStorage !== 'undefined' ? localStorage : null;
    if (fallback && fallback !== store) {
      const legacy = fallback.getItem(key);
      if (legacy !== null && legacy !== undefined) {
        try {
          store?.setItem(key, legacy);
        } catch {
          // ignore migration write failure
        }
        return legacy;
      }
    }
  } catch {
    // storage unavailable
  }
  return null;
}

function writeModStorage(key, value) {
  try {
    appStorage()?.setItem(key, value);
  } catch {
    // storage unavailable
  }
}

/**
 * Get user configured mod load order (array of mod IDs).
 * @returns {string[]}
 */
export function getModLoadOrder() {
  if (_inMemoryLoadOrder !== null) return [..._inMemoryLoadOrder];
  try {
    const val = readModStorage(MOD_LOAD_ORDER_KEY);
    if (val) {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        _inMemoryLoadOrder = parsed;
        return parsed;
      }
    }
  } catch {
    // storage unavailable
  }
  return [];
}

/**
 * Set and persist user mod load order.
 * @param {string[]} orderArray
 */
export function setModLoadOrder(orderArray) {
  if (!Array.isArray(orderArray)) return;
  _inMemoryLoadOrder = [...orderArray];
  writeModStorage(MOD_LOAD_ORDER_KEY, JSON.stringify(orderArray));
}

/**
 * Sort a list of mods according to saved load order.
 * @param {LoadedMod[]} modList
 * @returns {LoadedMod[]}
 */
function sortModsByLoadOrder(modList) {
  const order = getModLoadOrder();
  if (order.length === 0) return modList;

  const orderMap = new Map(order.map((id, index) => [id, index]));
  return [...modList].sort((a, b) => {
    const idxA = orderMap.has(a.id) ? orderMap.get(a.id) : 999999;
    const idxB = orderMap.has(b.id) ? orderMap.get(b.id) : 999999;
    return idxA - idxB;
  });
}

/**
 * Get saved user preference for mod enabled state, or default from manifest.
 * @param {string} modId
 * @param {boolean} defaultState
 * @returns {boolean}
 */
function isModUserEnabled(modId, defaultState = true) {
  if (_inMemoryModToggles.has(modId)) {
    return !!_inMemoryModToggles.get(modId);
  }
  const val = readModStorage(modPrefKey(modId));
  if (val !== null) return val === 'true';
  return defaultState;
}

/**
 * Save user preference for mod enabled state.
 * @param {string} modId
 * @param {boolean} enabled
 */
export function setModEnabled(modId, enabled) {
  _inMemoryModToggles.set(modId, !!enabled);
  const mod = _mods.get(modId);
  if (mod) {
    mod.enabled = !!enabled;
  }
  writeModStorage(modPrefKey(modId), String(!!enabled));
}

/**
 * Read a file belonging to a mod (either from desktop disk via preload or from virtual files).
 * @param {string} modId
 * @param {string} relPath
 * @returns {string|null}
 */
export function readModFile(modId, relPath) {
  const mod = _mods.get(modId);
  if (!mod) return null;

  if (mod.isVirtual) {
    return mod.files?.get(relPath) ?? null;
  }

  // Desktop electron bridge
  if (typeof window !== 'undefined' && window.daggerShell?.mods?.readFile) {
    try {
      return window.daggerShell.mods.readFile(mod.folder, relPath);
    } catch (e) {
      console.error(`[ModRegistry] Failed to read mod file ${modId}/${relPath}:`, e);
      return null;
    }
  }

  return null;
}

/**
 * Scan and discover all available mods (from disk or virtual registry).
 * Does not throw; records errors in mod record.
 */
export function discoverMods() {
  _mods.clear();
  _initialized = true;

  if (!FORK_FLAGS.ENABLE_MODS) {
    return [];
  }

  // 1. Scan desktop disk mods if running inside Electron shell
  if (typeof window !== 'undefined' && window.daggerShell?.mods?.list) {
    try {
      const scanned = window.daggerShell.mods.list();
      for (const item of scanned) {
        if (!item || !item.id) continue;
        if (item.error) {
          _mods.set(item.id, {
            id: item.id,
            folder: item.folder,
            manifest: item.manifest || { id: item.id, name: item.id },
            enabled: false,
            isVirtual: false,
            error: item.error,
          });
          continue;
        }

        const defaultEnabled = item.manifest?.enabled !== false;
        const enabled = isModUserEnabled(item.id, defaultEnabled);

        _mods.set(item.id, {
          id: item.id,
          folder: item.folder,
          manifest: item.manifest,
          enabled,
          isVirtual: false,
        });
      }
    } catch (e) {
      console.error('[ModRegistry] Error scanning desktop mods:', e);
    }
  }

  // 2. Add virtual mods (mock registry / test fixtures)
  for (const [id, entry] of _virtualRegistry) {
    const defaultEnabled = entry.manifest.enabled !== false;
    const enabled = isModUserEnabled(id, defaultEnabled);
    const filesMap = new Map(Object.entries(entry.files || {}));

    _mods.set(id, {
      id,
      folder: id,
      manifest: entry.manifest,
      enabled,
      isVirtual: true,
      files: filesMap,
    });
  }

  return getDiscoveredMods();
}

/**
 * Return all discovered mods.
 * @returns {LoadedMod[]}
 */
export function getDiscoveredMods() {
  if (!_initialized) discoverMods();
  return sortModsByLoadOrder(Array.from(_mods.values()));
}

/**
 * Return active (enabled and error-free) mods.
 * @returns {LoadedMod[]}
 */
export function getActiveMods() {
  if (!_initialized) discoverMods();
  return sortModsByLoadOrder(Array.from(_mods.values()).filter((m) => m.enabled && !m.error));
}

/**
 * Get a specific loaded mod by ID.
 * @param {string} modId
 * @returns {LoadedMod|undefined}
 */
export function getMod(modId) {
  if (!_initialized) discoverMods();
  return _mods.get(modId);
}

/**
 * Coerce and clamp a raw setting value according to its manifest schema entry.
 * @param {Record<string, any>} schema
 * @param {any} raw
 */
function coerceModSetting(schema, raw) {
  if (!schema) return raw;
  if (raw === undefined || raw === null) return schema.default;

  if (schema.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true' || raw === '1' || raw === 1) return true;
    if (raw === 'false' || raw === '0' || raw === 0) return false;
    return Boolean(schema.default);
  }

  if (schema.type === 'number') {
    let n = Number(raw);
    if (!Number.isFinite(n)) n = Number(schema.default) || 0;
    const min = Number(schema.min);
    const max = Number(schema.max);
    if (Number.isFinite(min)) n = Math.max(min, n);
    if (Number.isFinite(max)) n = Math.min(max, n);
    const step = Number(schema.step);
    if (Number.isFinite(step) && step > 0) {
      const base = Number.isFinite(min) ? min : 0;
      n = Math.round((n - base) / step) * step + base;
      if (Number.isFinite(min)) n = Math.max(min, n);
      if (Number.isFinite(max)) n = Math.min(max, n);
      n = Number(n.toFixed(6));
    }
    return n;
  }

  if (schema.type === 'select') {
    const opts = Array.isArray(schema.options) ? schema.options : [];
    for (const opt of opts) {
      const optVal = opt && typeof opt === 'object' ? opt.value : opt;
      if (optVal === raw || String(optVal) === String(raw)) {
        return optVal;
      }
    }
    return schema.default;
  }

  return raw;
}

/**
 * Get the declared settings schema array from a mod's manifest.
 * @param {string} modId
 * @returns {Array<Record<string, any>>}
 */
export function getModSettingsSchema(modId) {
  const mod = getMod(modId);
  const raw = mod?.manifest?.settings;
  return Array.isArray(raw) ? raw : [];
}

/**
 * Read a mod setting value (falling back to manifest default, coerced by schema).
 * @param {string} modId
 * @param {string} key
 * @returns {any}
 */
export function getModSetting(modId, key) {
  const schema = getModSettingsSchema(modId).find((s) => s && s.key === key) || null;
  let stored;
  const memMap = _inMemoryModSettings.get(modId);
  if (memMap && memMap.has(key)) {
    stored = memMap.get(key);
  } else {
    const raw = readModStorage(modSettingKey(modId, key));
    if (raw !== undefined && raw !== null) {
      stored = raw;
      if (!memMap) {
        _inMemoryModSettings.set(modId, new Map([[key, raw]]));
      } else {
        memMap.set(key, raw);
      }
    }
  }
  if (stored === undefined) stored = schema?.default;
  return schema ? coerceModSetting(schema, stored) : stored;
}

/**
 * Persist a mod setting value (coerced/clamped if schema entry exists).
 * @param {string} modId
 * @param {string} key
 * @param {any} value
 * @returns {any}
 */
export function setModSetting(modId, key, value) {
  const schema = getModSettingsSchema(modId).find((s) => s && s.key === key) || null;
  const finalVal = schema ? coerceModSetting(schema, value) : value;
  let memMap = _inMemoryModSettings.get(modId);
  if (!memMap) {
    memMap = new Map();
    _inMemoryModSettings.set(modId, memMap);
  }
  memMap.set(key, finalVal);
  writeModStorage(modSettingKey(modId, key), String(finalVal));
  return finalVal;
}

/**
 * Reset all declared settings of a mod back to their manifest defaults.
 * @param {string} modId
 * @returns {Record<string, any>}
 */
export function resetModSettings(modId) {
  const out = {};
  for (const schema of getModSettingsSchema(modId)) {
    if (!schema?.key) continue;
    out[schema.key] = setModSetting(modId, schema.key, schema.default);
  }
  return out;
}

/**
 * Reset all registry state (for testing).
 */
export function _resetModRegistry() {
  _mods.clear();
  _initialized = false;
  _virtualRegistry.clear();
  _inMemoryLoadOrder = null;
  _inMemoryModToggles.clear();
  _inMemoryModSettings.clear();
}

