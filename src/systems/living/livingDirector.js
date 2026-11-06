// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// LIVING TAMRIEL DIRECTOR (Master Coordinator)
//
// Coordinates simulation updates, world-tick pulses, and clean, zero-bloat
// save data persistence under the vendor key 'livingTamriel'.
// ═══════════════════════════════════════════════════════════════════════════════

import { registerModSaveData } from '../modSaveData.js';
import { LivingTamrielConfig, PRESENCE, resetLivingConfig } from './livingConfig.js';
import { tickAllRegions } from './regionState.js';
import { tickAdventurerSimulation } from './adventurerSim.js';

export const LIVING_TAMRIEL_VENDOR = 'livingTamriel';
export const LIVING_TAMRIEL_SAVE_VERSION = 1;

/**
 * In-memory runtime state for the living world director.
 * Ephemeral entities are never saved here; only scalar timestamps and status IDs.
 */
class LivingDirectorState {
  constructor() {
    this.version = LIVING_TAMRIEL_SAVE_VERSION;
    this.lastWorldTickMinute = 0;
    this.seed = Math.floor(Math.random() * 0x7fffffff);
    this.subsystems = {
      // Dynamic modules will attach their scalar payloads here
      regions: {},
      adventurers: {},
      travel: { lastInterruptMinute: -999999 },
      pleas: { lastPleaMinute: -999999 },
    };
  }

  reset() {
    this.version = LIVING_TAMRIEL_SAVE_VERSION;
    this.lastWorldTickMinute = 0;
    this.seed = Math.floor(Math.random() * 0x7fffffff);
    this.subsystems.regions = {};
    this.subsystems.adventurers = {};
    this.subsystems.travel = { lastInterruptMinute: -999999 };
    this.subsystems.pleas = { lastPleaMinute: -999999 };
  }
}

const _state = new LivingDirectorState();
let _isInitialized = false;
/** @type {(() => Array<{ mapId: number|string, isMainQuest?: boolean }>) | null} */
let _questSitesProvider = null;

/**
 * Registers a callback returning active player quest dungeon locations so
 * `onLivingWorldTick` can pass them into `tickAdventurerSimulation`.
 * @param {(() => Array<{ mapId: number|string, isMainQuest?: boolean }>) | null} fn
 */
export function setLivingQuestSitesProvider(fn) {
  _questSitesProvider = typeof fn === 'function' ? fn : null;
}

/**
 * Returns a fresh, sanitized default save data record.
 */
export function newLivingSaveData() {
  return {
    version: LIVING_TAMRIEL_SAVE_VERSION,
    lastWorldTickMinute: 0,
    seed: Math.floor(Math.random() * 0x7fffffff),
    config: {
      political: LivingTamrielConfig.political,
      adventurers: LivingTamrielConfig.adventurers,
      roadAdventurers: LivingTamrielConfig.roadAdventurers,
      nemesis: LivingTamrielConfig.nemesis,
      wilderness: LivingTamrielConfig.wilderness,
      urban: LivingTamrielConfig.urban,
      naval: LivingTamrielConfig.naval,
      travelInterruption: LivingTamrielConfig.travelInterruption,
      camps: LivingTamrielConfig.camps,
      quarantine: LivingTamrielConfig.quarantine,
      bounties: LivingTamrielConfig.bounties,
      allowQuestCompetition: Boolean(LivingTamrielConfig.allowQuestCompetition),
    },
    subsystems: {
      regions: {},
      adventurers: {},
      travel: { lastInterruptMinute: -999999 },
      pleas: { lastPleaMinute: -999999 },
      nemesis: { encounters: 0, escapedCount: 0, lastNemesisName: null, lastArchetype: null, hasGrudge: false },
      checkpoints: { passesByRegion: {} },
    },
  };
}

/**
 * Exports current director state for SaveData_v1.
 * Strictly guarantees zero scene-bloat (< 2 KB).
 */
export function getLivingSaveData() {
  return {
    version: LIVING_TAMRIEL_SAVE_VERSION,
    lastWorldTickMinute: _state.lastWorldTickMinute,
    seed: _state.seed,
    config: {
      political: LivingTamrielConfig.political,
      adventurers: LivingTamrielConfig.adventurers,
      roadAdventurers: LivingTamrielConfig.roadAdventurers,
      nemesis: LivingTamrielConfig.nemesis,
      wilderness: LivingTamrielConfig.wilderness,
      urban: LivingTamrielConfig.urban,
      naval: LivingTamrielConfig.naval,
      travelInterruption: LivingTamrielConfig.travelInterruption,
      camps: LivingTamrielConfig.camps,
      quarantine: LivingTamrielConfig.quarantine,
      bounties: LivingTamrielConfig.bounties,
      allowQuestCompetition: Boolean(LivingTamrielConfig.allowQuestCompetition),
    },
    subsystems: {
      regions: _state.subsystems.regions || {},
      adventurers: _state.subsystems.adventurers || {},
      travel: {
        lastInterruptMinute: Number(_state.subsystems.travel?.lastInterruptMinute) || -999999,
      },
      pleas: {
        lastPleaMinute: Number(_state.subsystems.pleas?.lastPleaMinute) || -999999,
      },
      nemesis: {
        encounters: Number(_state.subsystems.nemesis?.encounters) || 0,
        escapedCount: Number(_state.subsystems.nemesis?.escapedCount) || 0,
        lastNemesisName: _state.subsystems.nemesis?.lastNemesisName ?? null,
        lastArchetype: _state.subsystems.nemesis?.lastArchetype ?? null,
        hasGrudge: Boolean(_state.subsystems.nemesis?.hasGrudge),
      },
      checkpoints: {
        passesByRegion: { ...(_state.subsystems.checkpoints?.passesByRegion || {}) },
      },
    },
  };
}

/**
 * Safe restore with schema validation and fallback (Failsafe Doctrine).
 * If corrupted or incompatible, safely resets to default rather than crashing the save.
 * @param {any} data
 */
export function restoreLivingSaveData(data) {
  _state.reset();

  if (!data || typeof data !== 'object') return;

  try {
    if (Number.isFinite(data.lastWorldTickMinute)) {
      _state.lastWorldTickMinute = Math.max(0, Math.floor(data.lastWorldTickMinute));
    }
    if (Number.isFinite(data.seed)) {
      _state.seed = Math.floor(data.seed);
    }

    // Restore user config preferences if present
    if (data.config && typeof data.config === 'object') {
      const clampTier = (v, def) => (typeof v === 'number' && v >= 0 && v <= 3 ? v : def);
      LivingTamrielConfig.political = clampTier(data.config.political, PRESENCE.MID);
      LivingTamrielConfig.adventurers = clampTier(data.config.adventurers, PRESENCE.MID);
      LivingTamrielConfig.roadAdventurers = clampTier(data.config.roadAdventurers, PRESENCE.MID);
      LivingTamrielConfig.nemesis = clampTier(data.config.nemesis, PRESENCE.MID);
      LivingTamrielConfig.wilderness = clampTier(data.config.wilderness, PRESENCE.MID);
      LivingTamrielConfig.urban = clampTier(data.config.urban, PRESENCE.MID);
      LivingTamrielConfig.naval = clampTier(data.config.naval, PRESENCE.MID);
      LivingTamrielConfig.travelInterruption = clampTier(data.config.travelInterruption, PRESENCE.MID);
      LivingTamrielConfig.camps = clampTier(data.config.camps, PRESENCE.MID);
      LivingTamrielConfig.quarantine = clampTier(data.config.quarantine, PRESENCE.HIGH);
      LivingTamrielConfig.bounties = clampTier(data.config.bounties, PRESENCE.MID);
      if (typeof data.config.allowQuestCompetition === 'boolean') {
        LivingTamrielConfig.allowQuestCompetition = data.config.allowQuestCompetition;
      }
    }

    // Restore subsystem states
    if (data.subsystems && typeof data.subsystems === 'object') {
      if (data.subsystems.regions && typeof data.subsystems.regions === 'object') {
        _state.subsystems.regions = { ...data.subsystems.regions };
      }
      if (data.subsystems.adventurers && typeof data.subsystems.adventurers === 'object') {
        _state.subsystems.adventurers = { ...data.subsystems.adventurers };
      }
      if (data.subsystems.travel && typeof data.subsystems.travel === 'object') {
        _state.subsystems.travel.lastInterruptMinute =
          Number(data.subsystems.travel.lastInterruptMinute) || -999999;
      }
      if (data.subsystems.pleas && typeof data.subsystems.pleas === 'object') {
        _state.subsystems.pleas = {
          lastPleaMinute: Number(data.subsystems.pleas.lastPleaMinute) || -999999,
        };
      }
      if (data.subsystems.nemesis && typeof data.subsystems.nemesis === 'object') {
        _state.subsystems.nemesis = {
          encounters: Number(data.subsystems.nemesis.encounters) || 0,
          escapedCount: Number(data.subsystems.nemesis.escapedCount) || 0,
          lastNemesisName: data.subsystems.nemesis.lastNemesisName ?? null,
          lastArchetype: data.subsystems.nemesis.lastArchetype ?? null,
          hasGrudge: Boolean(data.subsystems.nemesis.hasGrudge),
        };
      }
      if (data.subsystems.checkpoints && typeof data.subsystems.checkpoints === 'object') {
        _state.subsystems.checkpoints = {
          passesByRegion: { ...(data.subsystems.checkpoints.passesByRegion || {}) },
        };
      }
    }
  } catch (err) {
    console.warn('[LivingDirector] Error restoring save data, falling back to default:', err);
    _state.reset();
  }
}

/**
 * Advances the living world simulation across elapsed world minutes.
 * Ensures discrete time step execution (Governor) to prevent frame freezing during long sleeps/travel.
 * @param {number} nowMinutes Current classic world minutes
 */
export function onLivingWorldTick(nowMinutes) {
  if (!Number.isFinite(nowMinutes)) return;

  const current = Math.floor(nowMinutes);
  if (_state.lastWorldTickMinute <= 0) {
    _state.lastWorldTickMinute = current;
    return;
  }

  const delta = current - _state.lastWorldTickMinute;
  if (delta <= 0) return;

  // Maximum discrete daily steps to process at once (e.g. after a 10-day fast travel),
  // preventing runaway loops.
  const MINUTES_PER_DAY = 1440;
  const daysPassed = Math.floor(delta / MINUTES_PER_DAY);

  if (daysPassed > 0) {
    const cappedDays = Math.min(daysPassed, 3); // Max 3 days catch-up simulation
    let activeQuestSites = [];
    if (_questSitesProvider) {
      try {
        activeQuestSites = _questSitesProvider() || [];
      } catch (_e) {
        activeQuestSites = [];
      }
    }
    for (let day = 0; day < cappedDays; day++) {
      tickAllRegions();
      tickAdventurerSimulation({ activeQuestSites });
    }
    _state.lastWorldTickMinute = current;
  }
}

/**
 * Accessor for the active director state (read-only inspection for tests & systems).
 */
export function getLivingDirectorState() {
  return _state;
}

/**
 * Initializes the Living Tamriel system and registers it into DFF modSaveData.
 */
export function initLivingDirector() {
  if (_isInitialized) return;

  registerModSaveData(LIVING_TAMRIEL_VENDOR, {
    newSaveData: newLivingSaveData,
    getSaveData: getLivingSaveData,
    restoreSaveData: restoreLivingSaveData,
    newGame: () => {
      _state.reset();
      resetLivingConfig();
    },
  });

  _isInitialized = true;
}

// Auto-register upon module loading so modSaveData knows this vendor
initLivingDirector();

