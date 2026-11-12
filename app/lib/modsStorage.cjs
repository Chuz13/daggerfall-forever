// DFF NATIVE MOD STORAGE: File-backed mod directory scanner and loader
//
// Desktop shell's interface to <userData>/Mods/<modId>/...
// Scans folders, reads manifest.json, and safely loads mod files without path traversal.
// Follows the same doctrine as fileStorage.cjs (plain Node, CommonJS, no Electron imports).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createModsStorage(userDataRoot, { seedExamples = false } = {}) {
  const modsDir = path.join(userDataRoot, 'Mods');

  function ensureDir() {
    try {
      if (!fs.existsSync(modsDir)) {
        fs.mkdirSync(modsDir, { recursive: true });
      }
    } catch (e) {
      console.error('[ModsStorage] Failed to create Mods directory:', e?.message ?? e);
    }
  }

  function findBundledExamplesDir() {
    const candidates = [
      path.resolve(__dirname, '..', '..', 'mods', 'examples'),
      path.resolve(__dirname, '..', 'mods', 'examples'),
      path.resolve(__dirname, '..', 'dist', 'mods', 'examples'),
      ...(process.resourcesPath
        ? [
            path.join(process.resourcesPath, 'mods', 'examples'),
            path.join(process.resourcesPath, 'app.asar.unpacked', 'mods', 'examples'),
            path.join(process.resourcesPath, 'app', 'mods', 'examples'),
          ]
        : []),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) return cand;
    }
    return null;
  }

  function seedBundledExamples() {
    if (!seedExamples) return;
    try {
      const examplesDir = findBundledExamplesDir();
      if (!examplesDir) return;

      const bundled = fs.readdirSync(examplesDir, { withFileTypes: true });
      for (const ent of bundled) {
        if (!ent.isDirectory()) continue;
        const targetPath = path.join(modsDir, ent.name);
        if (!fs.existsSync(targetPath)) {
          fs.cpSync(path.join(examplesDir, ent.name), targetPath, { recursive: true });
        }
      }
    } catch (_e) {
      // safe fallback on read-only environments
    }
  }

  ensureDir();
  seedBundledExamples();

  function sanitizeRelPath(relPath) {
    const normalized = path.normalize(relPath).replace(/^(\.\.(\/|\\|$))+/, '');
    return normalized.replace(/^[/\\]+/, '');
  }

  function listMods() {
    ensureDir();
    seedBundledExamples();
    const results = [];
    let entries = [];
    try {
      entries = fs.readdirSync(modsDir, { withFileTypes: true });
    } catch (e) {
      console.warn('[ModsStorage] Failed to read Mods directory:', e?.message ?? e);
      return results;
    }

    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const modFolder = path.join(modsDir, ent.name);
      const manifestPath = path.join(modFolder, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(raw);
          results.push({
            folder: ent.name,
            id: manifest.id || ent.name,
            manifest,
            path: modFolder,
          });
        } catch (e) {
          console.error(`[ModsStorage] Corrupted manifest in ${ent.name}:`, e?.message ?? e);
          results.push({
            folder: ent.name,
            id: ent.name,
            error: e?.message ?? 'JSON parse error',
            path: modFolder,
          });
        }
      }
    }
    return results;
  }

  function readModFile(modFolder, relPath) {
    const cleanRel = sanitizeRelPath(relPath);
    const fullPath = path.join(modsDir, modFolder, cleanRel);
    // Security check: ensure path is within modsDir/modFolder
    const expectedPrefix = path.join(modsDir, modFolder);
    if (!fullPath.startsWith(expectedPrefix)) {
      console.warn(`[ModsStorage] Blocked path traversal attempt: ${relPath}`);
      return null;
    }
    try {
      if (!fs.existsSync(fullPath)) return null;
      return fs.readFileSync(fullPath, 'utf8');
    } catch (e) {
      console.error(`[ModsStorage] Error reading ${fullPath}:`, e?.message ?? e);
      return null;
    }
  }

  return {
    dir: modsDir,
    listMods,
    readModFile,
  };
}

module.exports = { createModsStorage };
