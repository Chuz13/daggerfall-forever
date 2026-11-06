// @ts-check
// ═══════════════════════════════════════════════════════════════════
// OFFLINE PROFESSIONS SYSTEM (Daggerfall Forever)
//
// Enables harvesting gathering nodes (mining, logging, herbalism,
// hunting, fishing) and crafting professions in single-player offline mode.
// ═══════════════════════════════════════════════════════════════════

import { FORK_FLAGS } from '../config/forkFlags.js';
import { getPref } from './uiPrefs.js';
import { appStorage } from './appStorage.js';
import { characterIdOf } from './characterId.js';
import { registerModSaveData } from './modSaveData.js';
import { createProfBook } from '../net/profBook.js';
import { createLocalProfDoor } from './professions/localProfDoor.js';

export const OFFLINE_PROFESSIONS_VENDOR = 'professions';
export const OFFLINE_PROF_STORAGE_PREFIX = 'prof1.offline.';

let _activeRecord = null;
let _activeCharId = null;
let _activePlayerEntity = null;
let _activeProfBook = null;

/**
 * Whether offline professions are active.
 */
export function isOfflineProfessionsActive() {
  return !!FORK_FLAGS.ENABLE_OFFLINE_PROFESSIONS && getPref('offlineProfessions') !== false;
}

/**
 * Create a fresh default professions record.
 */
export function createNewRecord() {
  return {
    tracks: {},
    stores: {},
    made: { crafts: [], works: [], brews: [] },
    harvestedNodes: { day: 0, keys: [] },
    hunt: { hides: 0, high: 0 },
    hauls: 0,
  };
}

/**
 * Sanitize an imported or loaded professions record.
 * @param {any} data
 */
export function sanitizeRecord(data) {
  if (!data || typeof data !== 'object') return createNewRecord();
  return {
    tracks: data.tracks && typeof data.tracks === 'object' ? data.tracks : {},
    stores: data.stores && typeof data.stores === 'object' ? data.stores : {},
    made: {
      crafts: Array.isArray(data.made?.crafts) ? data.made.crafts : [],
      works: Array.isArray(data.made?.works) ? data.made.works : [],
      brews: Array.isArray(data.made?.brews) ? data.made.brews : [],
    },
    harvestedNodes: {
      day: Number.isSafeInteger(data.harvestedNodes?.day) ? data.harvestedNodes.day : 0,
      keys: Array.isArray(data.harvestedNodes?.keys) ? data.harvestedNodes.keys : [],
    },
    hunt: {
      hides: Number.isSafeInteger(data.hunt?.hides) ? data.hunt.hides : 0,
      high: Number.isSafeInteger(data.hunt?.high) ? data.hunt.high : 0,
    },
    hauls: Number.isSafeInteger(data.hauls) ? data.hauls : 0,
  };
}

/**
 * Load offline record for character from appStorage.
 * @param {string|null} charId
 */
export function loadOfflineRecord(charId) {
  if (!charId) return createNewRecord();
  try {
    const raw = appStorage()?.getItem(`${OFFLINE_PROF_STORAGE_PREFIX}${charId}`);
    if (raw) {
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        return sanitizeRecord(data);
      }
    }
  } catch {
    /* appStorage fallback */
  }
  return createNewRecord();
}

/**
 * Save offline record for character to appStorage.
 * @param {string|null} charId
 * @param {any} record
 */
export function saveOfflineRecord(charId, record) {
  if (!record) return;
  _activeRecord = record;
  if (!charId) return;
  try {
    appStorage()?.setItem(`${OFFLINE_PROF_STORAGE_PREFIX}${charId}`, JSON.stringify(record));
  } catch {
    /* appStorage fallback */
  }
}

/** Set active offline record in memory. */
export function setActiveOfflineRecord(record) {
  _activeRecord = record;
}

/**
 * Get current active record.
 */
export function getActiveOfflineRecord() {
  return _activeRecord;
}

/**
 * Create a ProfBook for offline play.
 * @param {{
 *   playerEntity: any,
 *   carry?: any,
 *   maps?: any,
 *   now?: () => number,
 *   nowMinutes?: () => number,
 *   saveSoon?: { changed: () => void }
 * }} o
 */
export function createOfflineProfBook({
  playerEntity,
  carry = null,
  maps = null,
  now = () => Date.now(),
  nowMinutes = () => 0,
  saveSoon = null,
}) {
  const charId = characterIdOf(playerEntity);
  _activePlayerEntity = playerEntity;
  _activeCharId = charId;
  _activeRecord = loadOfflineRecord(charId);

  const door = createLocalProfDoor(playerEntity, {
    getRecord: () => {
      if (!_activeRecord) _activeRecord = loadOfflineRecord(_activeCharId);
      return _activeRecord;
    },
    saveRecord: (r) => {
      _activeRecord = r;
      if (_activeCharId) saveOfflineRecord(_activeCharId, r);
    },
    maps,
    nowMinutes,
    saveSoon,
  });

  const book = createProfBook({
    door,
    storage: appStorage(),
    character: () => characterIdOf(playerEntity),
    now,
    carry,
    turnMs: 0,
  });

  _activeProfBook = book;
  return book;
}

// Register with DFU save manager
registerModSaveData(OFFLINE_PROFESSIONS_VENDOR, {
  newSaveData: () => createNewRecord(),
  getSaveData: () => {
    if (_activeRecord) return JSON.parse(JSON.stringify(_activeRecord));
    return createNewRecord();
  },
  restoreSaveData: (data) => {
    _activeRecord = sanitizeRecord(data);
    if (_activeCharId) {
      saveOfflineRecord(_activeCharId, _activeRecord);
    }
    _activeProfBook?.refresh?.({ force: true })?.catch(() => {});
  },
  newGame: () => {
    _activeRecord = createNewRecord();
    if (_activeCharId) {
      saveOfflineRecord(_activeCharId, _activeRecord);
    }
    _activeProfBook?.refresh?.({ force: true })?.catch(() => {});
  },
});

/** Tests only reset seam. */
export function _resetOfflineProfessionsForTests() {
  _activeRecord = null;
  _activeCharId = null;
  _activePlayerEntity = null;
  _activeProfBook = null;
}
