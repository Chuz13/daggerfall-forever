// ═══════════════════════════════════════════════════════════════════
// SESSION LOG STORAGE & ROTATION (Daggerfall Forever)
//
// Manages persisting game session diagnostic dumps and enforcing
// rotation policy (retaining last 3–5 sessions).
// Works across both Vite dev server (browser) and Electron shell.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_KEEP_COUNT = 5;
let _writeCounter = 0;

/**
 * Returns default sessions log directory path.
 * @param {string} [overrideRoot]
 */
function getSessionLogsDir(overrideRoot) {
  if (overrideRoot) {
    return path.join(overrideRoot, 'logs', 'sessions');
  }
  // Try repository root or current working directory
  const root = path.resolve(__dirname, '..', '..');
  return path.join(root, 'logs', 'sessions');
}

/**
 * Rotates logs directory, retaining only the most recent `keepCount` files.
 * @param {string} logsDir
 * @param {number} [keepCount]
 * @returns {string[]} List of deleted file paths
 */
function rotateSessionLogs(logsDir, keepCount = DEFAULT_KEEP_COUNT) {
  if (!fs.existsSync(logsDir)) return [];

  const deleted = [];
  try {
    const files = fs.readdirSync(logsDir)
      .filter((f) => f.startsWith('session-') && f.endsWith('.json') && f !== 'session-latest.json')
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
          console.warn('[SessionLog] Failed to delete rotated log:', item.path, delErr?.message);
        }
      }
    }
  } catch (err) {
    console.error('[SessionLog] Failed to rotate session logs:', err);
  }

  return deleted;
}

/**
 * Writes session log payload to disk and updates session-latest.json.
 * @param {any} payload
 * @param {{ logsDir?: string, keepCount?: number }} [options]
 * @returns {{ ok: boolean, filePath?: string, latestPath?: string, deleted?: string[], error?: string }}
 */
function writeSessionLogToDisk(payload, { logsDir, keepCount = DEFAULT_KEEP_COUNT } = {}) {
  try {
    const dir = logsDir || getSessionLogsDir();
    fs.mkdirSync(dir, { recursive: true });

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const pad3 = (n) => String(n).padStart(3, '0');
    const seq = String(++_writeCounter % 10000).padStart(4, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${pad3(now.getMilliseconds())}-${seq}`;
    const filename = `session-${timestamp}.json`;
    const filePath = path.join(dir, filename);
    const latestPath = path.join(dir, 'session-latest.json');

    const serialized = typeof payload === 'string'
      ? payload
      : JSON.stringify(payload, null, 2);

    // Write specific session timestamp file
    fs.writeFileSync(filePath, serialized, 'utf8');

    // Update / overwrite session-latest.json
    fs.writeFileSync(latestPath, serialized, 'utf8');

    // Run rotation
    const deleted = rotateSessionLogs(dir, keepCount);

    return {
      ok: true,
      filePath,
      latestPath,
      deleted,
    };
  } catch (err) {
    console.error('[SessionLog] Failed to write session log to disk:', err);
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}

module.exports = {
  DEFAULT_KEEP_COUNT,
  getSessionLogsDir,
  rotateSessionLogs,
  writeSessionLogToDisk,
};
