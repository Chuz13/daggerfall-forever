// @ts-check
// DFF NATIVE MOD REGISTRY & LOADER
//
// Discovers, validates, and manages active native mods (Data-driven & Plugins).
// Connects to Electron's daggerShell.mods bridge on desktop, or virtual mock registry in web/tests.
// Adheres strictly to .agentrules (zero unhandled exceptions, surgical integration, no bloat).

import { FORK_FLAGS } from '../../config/forkFlags.js';

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

/**
 * Storage key for user mod toggle preference.
 * @param {string} modId
 */
const modPrefKey = (modId) => `dagger.mods.${modId}.enabled`;
const MOD_LOAD_ORDER_KEY = 'dagger.mods.loadOrder';

/**
 * Get user configured mod load order (array of mod IDs).
 * @returns {string[]}
 */
export function getModLoadOrder() {
  if (_inMemoryLoadOrder !== null) return [..._inMemoryLoadOrder];
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(MOD_LOAD_ORDER_KEY);
      if (val) {
        const parsed = JSON.parse(val);
        if (Array.isArray(parsed)) {
          _inMemoryLoadOrder = parsed;
          return parsed;
        }
      }
    }
  } catch {
    // localStorage unavailable
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
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MOD_LOAD_ORDER_KEY, JSON.stringify(orderArray));
    }
  } catch {
    // localStorage unavailable
  }
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
  try {
    if (typeof localStorage !== 'undefined') {
      const val = localStorage.getItem(modPrefKey(modId));
      if (val !== null) return val === 'true';
    }
  } catch {
    // localStorage unavailable
  }
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
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(modPrefKey(modId), String(!!enabled));
    }
  } catch {
    // localStorage unavailable
  }
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
 * Reset all registry state (for testing).
 */
export function _resetModRegistry() {
  _mods.clear();
  _initialized = false;
  _virtualRegistry.clear();
  _inMemoryLoadOrder = null;
  _inMemoryModToggles.clear();
}

