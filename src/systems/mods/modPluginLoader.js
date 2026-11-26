// @ts-check
// DFF NATIVE MOD PLUGIN LOADER
//
// Initializes scripted native plugins (plugin.js) from active mods.
// Passes isolated `api` context to mod's `init(api)` function.

import { getActiveMods, readModFile } from './modRegistry.js';
import { createModApi, unregisterModPerks, cleanupModResources } from './modPluginApi.js';
import { removeModListeners } from './modEventBus.js';
import { unregisterPerk } from '../perks/perkRegistry.js';

/** @type {Set<string>} */
const _loadedPluginIds = new Set();

/** @type {Map<string, Function>} */
const _virtualInitHandlers = new Map();

/** @type {Map<string, string>} */
const _pluginErrors = new Map();

/**
 * Get the last runtime/load error message for a mod plugin, if any.
 * @param {string} modId
 * @returns {string|null}
 */
export function getPluginError(modId) {
  return _pluginErrors.get(modId) || null;
}

/**
 * Get a map of all mod plugin runtime/load errors keyed by modId.
 * @returns {Record<string, string>}
 */
export function getAllPluginErrors() {
  return Object.fromEntries(_pluginErrors);
}

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
        _pluginErrors.delete(mod.id);
      } catch (err) {
        const msg = err?.message ? String(err.message) : String(err);
        _pluginErrors.set(mod.id, msg);
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
        // Strip ES module syntax if present (default & named exports)
        let executableCode = code
          .replace(/^\s*export\s+default\s+(async\s+)?function\s+/gm, '$1function ')
          .replace(/^\s*export\s+(async\s+)?function\s+/gm, '$1function ')
          .replace(/^\s*export\s+(const|let|var|class)\s+/gm, '$1 ')
          .replace(/^\s*export\s+default\s+/gm, '')
          .replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, '');

        // Execute plugin function safely passing api
        const runner = new Function('api', `
          "use strict";
          ${executableCode}
          if (typeof init === 'function') {
            return init(api);
          }
        `);
        await runner(api);
        _loadedPluginIds.add(mod.id);
        _pluginErrors.delete(mod.id);
      } catch (err) {
        const msg = err?.message ? String(err.message) : String(err);
        _pluginErrors.set(mod.id, msg);
        console.error(`[ModPluginLoader] Error executing plugin '${mod.id}':`, err);
      }
    }
  }
}

/**
 * Unload all running plugins and detach their event bus listeners and registered perks.
 */
export function unloadModPlugins() {
  for (const modId of _loadedPluginIds) {
    removeModListeners(modId);
    unregisterPerk(modId);
    unregisterModPerks(modId);
    cleanupModResources(modId);
  }
  _loadedPluginIds.clear();
  _pluginErrors.clear();
}

/**
 * Reset plugin loader state (for testing).
 */
export function _resetModPluginLoader() {
  unloadModPlugins();
  _virtualInitHandlers.clear();
}

