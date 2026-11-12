// ═══════════════════════════════════════════════════════════════════
// LOG STORAGE & ROTATION (Daggerfall Forever)
//
// Manages persisting game session, combat encounter, and spawner diagnostic
// dumps and enforcing rotation policy (retaining last 5 logs per category).
// Works across both Vite dev server (browser) and Electron shell.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_KEEP_COUNT = 5;
let _writeCounter = 0;

/**
 * Returns default log directory path for given category ('sessions', 'combat', 'encounters').
 * @param {string} [category='sessions']
 * @param {string} [overrideRoot]
 */
function getLogsDir(category = 'sessions', overrideRoot) {
  if (overrideRoot) {
    return path.join(overrideRoot, 'logs', category);
  }
  const root = path.resolve(__dirname, '..', '..');
  return path.join(root, 'logs', category);
}

/**
 * Returns default sessions log directory path.
 * @param {string} [overrideRoot]
 */
function getSessionLogsDir(overrideRoot) {
  return getLogsDir('sessions', overrideRoot);
}

/**
 * Returns default combat log directory path.
 * @param {string} [overrideRoot]
 */
function getCombatLogsDir(overrideRoot) {
  return getLogsDir('combat', overrideRoot);
}

/**
 * Returns default encounter/spawner log directory path.
 * @param {string} [overrideRoot]
 */
function getEncounterLogsDir(overrideRoot) {
  return getLogsDir('encounters', overrideRoot);
}

/**
 * Returns default Living Tamriel & crises log directory path.
 * @param {string} [overrideRoot]
 */
function getLivingLogsDir(overrideRoot) {
  return getLogsDir('living', overrideRoot);
}

/**
 * Returns default chronological event timeline log directory path.
 * @param {string} [overrideRoot]
 */
function getTimelineLogsDir(overrideRoot) {
  return getLogsDir('timeline', overrideRoot);
}

/**
 * Rotates logs directory, retaining only the most recent `keepCount` files for a given prefix.
 * @param {string} logsDir
 * @param {number} [keepCount=DEFAULT_KEEP_COUNT]
 * @param {string} [prefix='session']
 * @returns {string[]} List of deleted file paths
 */
function rotateCategoryLogs(logsDir, keepCount = DEFAULT_KEEP_COUNT, prefix = 'session') {
  if (!fs.existsSync(logsDir)) return [];

  const deleted = [];
  try {
    const latestFileName = `${prefix}-latest.json`;
    const filePrefix = `${prefix}-`;
    const files = fs.readdirSync(logsDir)
      .filter((f) => f.startsWith(filePrefix) && f.endsWith('.json') && f !== latestFileName)
      .map((f) => {
        const fullPath = path.join(logsDir, f);
        try {
          const stats = fs.statSync(fullPath);
          return { file: f, path: fullPath, mtime: stats.mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    // Sort newest first
    files.sort((a, b) => b.mtime - a.mtime || b.file.localeCompare(a.file));

    // If more than keepCount, remove the oldest
    if (files.length > keepCount) {
      const toRemove = files.slice(keepCount);
      for (const item of toRemove) {
        try {
          fs.unlinkSync(item.path);
          deleted.push(item.path);
        } catch (delErr) {
          console.warn(`[LogStorage] Failed to delete rotated log (${prefix}):`, item.path, delErr?.message);
        }
      }
    }
  } catch (err) {
    console.error(`[LogStorage] Failed to rotate ${prefix} logs:`, err);
  }

  return deleted;
}

/**
 * Backward-compatible wrapper for rotating session logs.
 * @param {string} logsDir
 * @param {number} [keepCount]
 */
function rotateSessionLogs(logsDir, keepCount = DEFAULT_KEEP_COUNT) {
  return rotateCategoryLogs(logsDir, keepCount, 'session');
}

/**
 * Generic writer for diagnostic logs with rotation and latest link.
 * @param {any} payload
 * @param {object} [options]
 * @param {string} [options.logsDir]
 * @param {string} [options.prefix='session']
 * @param {number} [options.keepCount=DEFAULT_KEEP_COUNT]
 * @returns {{ ok: boolean, filePath?: string, latestPath?: string, deleted?: string[], error?: string }}
 */
function writeGenericLogToDisk(payload, { logsDir, prefix = 'session', keepCount = DEFAULT_KEEP_COUNT } = {}) {
  try {
    const dir = logsDir || getLogsDir(
      prefix === 'session' ? 'sessions' :
      prefix === 'combat' ? 'combat' :
      prefix === 'encounter' ? 'encounters' :
      prefix === 'living' ? 'living' :
      prefix === 'timeline' ? 'timeline' : prefix
    );
    fs.mkdirSync(dir, { recursive: true });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');
    const seq = String(++_writeCounter % 10000).padStart(4, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${pad3(now.getMilliseconds())}-${seq}`;
    const filename = `${prefix}-${timestamp}.json`;
    const filePath = path.join(dir, filename);
    const latestPath = path.join(dir, `${prefix}-latest.json`);

    const serialized = typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, null, 2);

    // Write specific timestamp file
    fs.writeFileSync(filePath, serialized, 'utf8');

    // Update / overwrite latest file
    fs.writeFileSync(latestPath, serialized, 'utf8');

    // Run rotation
    const deleted = rotateCategoryLogs(dir, keepCount, prefix);

    return {
      ok: true,
      filePath,
      latestPath,
      deleted,
    };
  } catch (err) {
    console.error(`[LogStorage] Failed to write ${prefix} log to disk:`, err);
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

/**
 * Writes session log payload to disk and updates session-latest.json.
 * @param {any} payload
 * @param {{ logsDir?: string, keepCount?: number }} [options]
 */
function writeSessionLogToDisk(payload, { logsDir, keepCount = DEFAULT_KEEP_COUNT } = {}) {
  return writeGenericLogToDisk(payload, { logsDir: logsDir || getSessionLogsDir(), prefix: 'session', keepCount });
}

/**
 * Writes combat log payload to disk and updates combat-latest.json.
 * Retains only the last `keepCount` files.
 * @param {any} payload
 * @param {{ logsDir?: string, keepCount?: number }} [options]
 */
function writeCombatLogToDisk(payload, { logsDir, keepCount = DEFAULT_KEEP_COUNT } = {}) {
  return writeGenericLogToDisk(payload, { logsDir: logsDir || getCombatLogsDir(), prefix: 'combat', keepCount });
}

/**
 * Writes encounter / spawner log payload to disk and updates encounter-latest.json.
 * Retains only the last `keepCount` files.
 * @param {any} payload
 * @param {{ logsDir?: string, keepCount?: number }} [options]
 */
function writeEncounterLogToDisk(payload, { logsDir, keepCount = DEFAULT_KEEP_COUNT } = {}) {
  return writeGenericLogToDisk(payload, { logsDir: logsDir || getEncounterLogsDir(), prefix: 'encounter', keepCount });
}

/**
 * Writes Living Tamriel & crises log payload to disk and updates living-latest.json.
 * Retains only the last `keepCount` files.
 * @param {any} payload
 * @param {{ logsDir?: string, keepCount?: number }} [options]
 */
function writeLivingLogToDisk(payload, { logsDir, keepCount = DEFAULT_KEEP_COUNT } = {}) {
  return writeGenericLogToDisk(payload, { logsDir: logsDir || getLivingLogsDir(), prefix: 'living', keepCount });
}

/**
 * Writes chronological event timeline log payload to disk and updates timeline-latest.json.
 * Retains only the last `keepCount` files.
 * @param {any} payload
 * @param {{ logsDir?: string, keepCount?: number }} [options]
 */
function writeTimelineLogToDisk(payload, { logsDir, keepCount = DEFAULT_KEEP_COUNT } = {}) {
  return writeGenericLogToDisk(payload, { logsDir: logsDir || getTimelineLogsDir(), prefix: 'timeline', keepCount });
}

module.exports = {
  DEFAULT_KEEP_COUNT,
  getLogsDir,
  getSessionLogsDir,
  getCombatLogsDir,
  getEncounterLogsDir,
  getLivingLogsDir,
  getTimelineLogsDir,
  rotateCategoryLogs,
  rotateSessionLogs,
  writeGenericLogToDisk,
  writeSessionLogToDisk,
  writeCombatLogToDisk,
  writeEncounterLogToDisk,
  writeLivingLogToDisk,
  writeTimelineLogToDisk,
};
