// @ts-check
// DFF NATIVE MOD PLUGIN LOADER
//
// Initializes scripted native plugins (plugin.js) from active mods.
// Passes isolated `api` context to mod's `init(api)` function.

import { getActiveMods, readModFile } from './modRegistry.js';
import { createModApi } from './modPluginApi.js';
import { removeModListeners } from './modEventBus.js';

/** @type {Set<string>} */
const _loadedPluginIds = new Set();

/** @type {Map<string, Function>} */
const _virtualInitHandlers = new Map();

/**
 * Register a virtual script handler for unit tests or web demos.
 * @param {string} modId
 * @param {Function} initFn
 */
export function registerVirtualPluginHandler(modId, initFn) {
  _virtualInitHandlers.set(modId, initFn);
}

/**
 * Load and execute all active scripted mod plugins.
 */
export async function loadActiveModPlugins() {
  const activeMods = getActiveMods();

  for (const mod of activeMods) {
    if (_loadedPluginIds.has(mod.id)) continue;

    const entryFile = mod.manifest?.entry;
    const virtualHandler = _virtualInitHandlers.get(mod.id);

    if (!entryFile && !virtualHandler) continue;

    const api = createModApi(mod.id);

    // 1. Virtual handler (tests)
    if (virtualHandler) {
      try {
        await virtualHandler(api);
        _loadedPluginIds.add(mod.id);
      } catch (err) {
        console.error(`[ModPluginLoader] Error initializing virtual plugin '${mod.id}':`, err);
      }
      continue;
    }

    // 2. File-backed plugin
    if (entryFile) {
      const code = readModFile(mod.id, entryFile);
      if (!code) {
        console.warn(`[ModPluginLoader] Could not read entry file '${entryFile}' for mod '${mod.id}'`);
        continue;
      }

      try {
        // Execute plugin function safely passing api
        const runner = new Function('api', `
          "use strict";
          ${code}
          if (typeof init === 'function') {
            return init(api);
          }
        `);
        await runner(api);
        _loadedPluginIds.add(mod.id);
      } catch (err) {
        console.error(`[ModPluginLoader] Error executing plugin '${mod.id}':`, err);
      }
    }
  }
}

/**
 * Unload all running plugins and detach their event bus listeners.
 */
export function unloadModPlugins() {
  for (const modId of _loadedPluginIds) {
    removeModListeners(modId);
  }
  _loadedPluginIds.clear();
}

/**
 * Reset plugin loader state (for testing).
 */
export function _resetModPluginLoader() {
  unloadModPlugins();
  _virtualInitHandlers.clear();
}
