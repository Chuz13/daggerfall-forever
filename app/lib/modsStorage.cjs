// DFF NATIVE MOD STORAGE: File-backed mod directory scanner and loader
//
// Desktop shell's interface to <userData>/Mods/<modId>/...
// Scans folders, reads manifest.json, and safely loads mod files without path traversal.
// Follows the same doctrine as fileStorage.cjs (plain Node, CommonJS, no Electron imports).

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLED_MARKER = '.dff-bundled.json';

function createModsStorage(userDataRoot, { seedExamples = false, bundledExamplesDir = null } = {}) {
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
    if (bundledExamplesDir) return bundledExamplesDir;
    const candidates = [
      ...(process.resourcesPath
        ? [
            path.join(process.resourcesPath, 'app.asar.unpacked', 'mods', 'examples'),
            path.join(process.resourcesPath, 'mods', 'examples'),
            path.join(process.resourcesPath, 'app', 'mods', 'examples'),
          ]
        : []),
      path.resolve(__dirname, '..', '..', 'mods', 'examples'),
      path.resolve(__dirname, '..', 'mods', 'examples'),
      path.resolve(__dirname, '..', 'dist', 'mods', 'examples'),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) return cand;
    }
    return null;
  }

  function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, ent.name);
      const d = path.join(dest, ent.name);
      if (ent.isDirectory()) {
        copyDirSync(s, d);
      } else if (ent.isFile()) {
        fs.writeFileSync(d, fs.readFileSync(s));
      }
    }
  }

  function collectModFiles(dir) {
    const out = [];
    const walk = (rel) => {
      const abs = rel ? path.join(dir, rel) : dir;
      for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
        const relPath = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          walk(relPath);
        } else if (ent.isFile() && relPath !== BUNDLED_MARKER) {
          out.push(relPath);
        }
      }
    };
    walk('');
    return out.sort();
  }

  function hashDirFiles(dir, files) {
    const h = crypto.createHash('sha256');
    for (const relPath of files) {
      h.update(relPath, 'utf8');
      h.update('\0');
      h.update(fs.readFileSync(path.join(dir, relPath)));
      h.update('\0');
    }
    return h.digest('hex');
  }

  function writeBundledMarker(targetPath, sha256, files) {
    fs.writeFileSync(
      path.join(targetPath, BUNDLED_MARKER),
      JSON.stringify({ schema: 1, sha256, files }, null, 2) + '\n',
      'utf8',
    );
  }

  function readBundledMarker(targetPath) {
    const markerPath = path.join(targetPath, BUNDLED_MARKER);
    try {
      if (!fs.existsSync(markerPath)) return null;
      const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
      if (
        parsed &&
        parsed.schema === 1 &&
        typeof parsed.sha256 === 'string' &&
        Array.isArray(parsed.files)
      ) {
        return parsed;
      }
    } catch {
      // treat corrupt marker as missing
    }
    return null;
  }

  function seedBundledExamples() {
    if (!seedExamples) return;
    try {
      const examplesDir = findBundledExamplesDir();
      if (!examplesDir || !fs.existsSync(examplesDir)) return;

      const bundled = fs.readdirSync(examplesDir, { withFileTypes: true });
      for (const ent of bundled) {
        if (!ent.isDirectory()) continue;
        const srcDir = path.join(examplesDir, ent.name);
        const targetPath = path.join(modsDir, ent.name);
        try {
          const bundledFiles = collectModFiles(srcDir);
          const bundledHash = hashDirFiles(srcDir, bundledFiles);

          if (!fs.existsSync(targetPath)) {
            copyDirSync(srcDir, targetPath);
            writeBundledMarker(targetPath, bundledHash, bundledFiles);
            continue;
          }

          const marker = readBundledMarker(targetPath);
          if (!marker) {
            copyDirSync(srcDir, targetPath);
            writeBundledMarker(targetPath, bundledHash, bundledFiles);
            continue;
          }

          if (marker.sha256 === bundledHash) continue;

          const currentFiles = collectModFiles(targetPath);
          const currentHash = hashDirFiles(targetPath, currentFiles);
          if (currentHash === marker.sha256) {
            const bundledSet = new Set(bundledFiles);
            const targetRoot = path.resolve(targetPath);
            for (const oldRel of marker.files) {
              if (!bundledSet.has(oldRel)) {
                const candidate = path.resolve(targetRoot, oldRel);
                if (candidate.startsWith(targetRoot + path.sep) && fs.existsSync(candidate)) {
                  fs.unlinkSync(candidate);
                }
              }
            }
            copyDirSync(srcDir, targetPath);
            writeBundledMarker(targetPath, bundledHash, bundledFiles);
          } else {
            console.info(`[ModsStorage] Preserving local edits in bundled mod ${ent.name}`);
          }
        } catch (err) {
          console.warn(`[ModsStorage] Failed to sync mod ${ent.name}:`, err?.message ?? err);
        }
      }
    } catch (e) {
      console.warn('[ModsStorage] Failed to seed bundled examples:', e?.message ?? e);
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
