// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverMods,
  getActiveMods,
  getMod,
  registerVirtualMod,
  setModEnabled,
  setModLoadOrder,
  getModLoadOrder,
  readModFile,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import { createModsStorage } from '../../app/lib/modsStorage.cjs';
import {
  createModApi,
  _resetModPluginApi,
  setModApiContext,
  getModStatusChips,
} from '../../src/systems/mods/modPluginApi.js';
import { emitModEvent, _resetModEventBus } from '../../src/systems/mods/modEventBus.js';
import { syncModData, _resetModDataSync } from '../../src/systems/mods/modDataSync.js';
import initMagickaRegen from '../../mods/examples/magicka-regeneration/plugin.js';
import initStaminaRegen from '../../mods/examples/stamina-regeneration/plugin.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('ModRegistry: discovers and manages virtual mods in isolation', () => {
  _resetModRegistry();

  registerVirtualMod(
    {
      id: 'test-armor-mod',
      name: 'Test Armor Mod',
      version: '1.0.0',
      description: 'Adds fatigue cost to heavy armor',
      enabled: true,
      data: { combat: 'combat.json' },
    },
    {
      'combat.json': JSON.stringify({ heavyArmorFatigueMultiplier: 1.25 }),
    }
  );

  registerVirtualMod(
    {
      id: 'test-disabled-mod',
      name: 'Disabled Mod',
      version: '0.9.0',
      enabled: false,
    },
    {}
  );

  const discovered = discoverMods();
  assert.equal(discovered.length, 2);

  const active = getActiveMods();
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'test-armor-mod');

  // Verify file reading
  const content = readModFile('test-armor-mod', 'combat.json');
  assert.ok(content);
  const parsed = JSON.parse(content);
  assert.equal(parsed.heavyArmorFatigueMultiplier, 1.25);

  // Test toggle
  setModEnabled('test-armor-mod', false);
  assert.equal(getActiveMods().length, 0);

  setModEnabled('test-armor-mod', true);
  assert.equal(getActiveMods().length, 1);

  _resetModRegistry();
});

test('ModsStorage: desktop shell filesystem scanning & path sanitization', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dff-mods-test-'));

  try {
    const storage = createModsStorage(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, 'Mods')));

    // Create a mock mod directory
    const modDir = path.join(tmpDir, 'Mods', 'sample-mod');
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(
      path.join(modDir, 'manifest.json'),
      JSON.stringify({
        id: 'sample-mod',
        name: 'Sample Mod',
        version: '1.1.0',
      })
    );
    fs.writeFileSync(path.join(modDir, 'config.json'), JSON.stringify({ key: 'val' }));

    const list = storage.listMods();
    assert.equal(list.length, 1);
    assert.equal(list[0].id, 'sample-mod');
    assert.equal(list[0].manifest.name, 'Sample Mod');

    // Read file
    const fileData = storage.readModFile('sample-mod', 'config.json');
    assert.ok(fileData);
    assert.equal(JSON.parse(fileData).key, 'val');

    // Path traversal safety
    const forbidden = storage.readModFile('sample-mod', '../../package.json');
    assert.equal(forbidden, null);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ModsStorage: auto-seeds missing bundled examples into non-empty Mods folder', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dff-mods-seed-test-'));

  try {
    const modsFolder = path.join(tmpDir, 'Mods');
    fs.mkdirSync(modsFolder, { recursive: true });
    // Pre-populate with an existing mod to simulate an existing player profile
    fs.mkdirSync(path.join(modsFolder, 'pre-existing-mod'), { recursive: true });
    fs.writeFileSync(
      path.join(modsFolder, 'pre-existing-mod', 'manifest.json'),
      JSON.stringify({ id: 'pre-existing-mod', name: 'Pre-existing' })
    );

    const storage = createModsStorage(tmpDir, { seedExamples: true });
    const list = storage.listMods();
    const ids = list.map((m) => m.id);

    // Both pre-existing mod AND bundled mods should be present
    assert.ok(ids.includes('pre-existing-mod'));
    assert.ok(ids.includes('heroic-feats'));
    assert.ok(ids.includes('items-quality'));
    assert.ok(ids.includes('duelists-flow'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ModRegistry: persists mod enabled flags and load order via daggerShell.storage (appStorage seam)', () => {
  const prevShellDesc = Object.getOwnPropertyDescriptor(globalThis, 'daggerShell');
  const prevLsDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const shellStore = new Map([['dagger.mods.legacy-mod.enabled', 'false']]);
  const lsStore = new Map([['dagger.mods.migrated-mod.enabled', 'false']]);

  Object.defineProperty(globalThis, 'daggerShell', {
    configurable: true,
    writable: true,
    value: {
      storage: {
        length: () => shellStore.size,
        key: (i) => [...shellStore.keys()][i] ?? null,
        getItem: (k) => (shellStore.has(k) ? shellStore.get(k) : null),
        setItem: (k, v) => shellStore.set(k, String(v)),
        removeItem: (k) => shellStore.delete(k),
      },
    },
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      get length() { return lsStore.size; },
      key: (i) => [...lsStore.keys()][i] ?? null,
      getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
      setItem: (k, v) => lsStore.set(k, String(v)),
      removeItem: (k) => lsStore.delete(k),
    },
  });

  try {
    _resetModRegistry();
    registerVirtualMod({ id: 'legacy-mod', name: 'Legacy', enabled: true }, {});
    registerVirtualMod({ id: 'migrated-mod', name: 'Migrated', enabled: true }, {});
    registerVirtualMod({ id: 'second-mod', name: 'Second', enabled: true }, {});
    discoverMods();

    assert.equal(getMod('legacy-mod')?.enabled, false, 'reads enabled flag from daggerShell.storage');
    assert.equal(getMod('migrated-mod')?.enabled, false, 'falls back to localStorage and migrates into daggerShell.storage');
    assert.equal(shellStore.get('dagger.mods.migrated-mod.enabled'), 'false');

    setModEnabled('second-mod', false);
    assert.equal(shellStore.get('dagger.mods.second-mod.enabled'), 'false');
    assert.equal(lsStore.has('dagger.mods.second-mod.enabled'), false, 'writes go to appStorage, not raw localStorage');

    setModLoadOrder(['second-mod', 'legacy-mod']);
    assert.equal(shellStore.get('dagger.mods.loadOrder'), JSON.stringify(['second-mod', 'legacy-mod']));

    // Simulate restart
    _resetModRegistry();
    registerVirtualMod({ id: 'legacy-mod', name: 'Legacy', enabled: true }, {});
    registerVirtualMod({ id: 'migrated-mod', name: 'Migrated', enabled: true }, {});
    registerVirtualMod({ id: 'second-mod', name: 'Second', enabled: true }, {});
    discoverMods();

    assert.equal(getMod('second-mod')?.enabled, false);
    assert.deepEqual(getModLoadOrder(), ['second-mod', 'legacy-mod']);
  } finally {
    _resetModRegistry();
    if (prevShellDesc) Object.defineProperty(globalThis, 'daggerShell', prevShellDesc);
    else delete globalThis.daggerShell;
    if (prevLsDesc) Object.defineProperty(globalThis, 'localStorage', prevLsDesc);
    else delete globalThis.localStorage;
  }
});

test('Bundled mods: 13 mods ship with expected 8 ON / 5 OFF defaults and Osmicnosap mods initialize cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dff-mods-13-test-'));
  const expectedDisabled = new Set([
    'blood-tithe',
    'duelists-flow',
    'heroic-feats',
    'magicka-regeneration',
    'stamina-regeneration',
  ]);
  const all26 = [
    'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja',
    'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant',
  ];

  try {
    const storage = createModsStorage(tmpDir, { seedExamples: true });
    const list = storage.listMods();
    assert.equal(list.length, 13);

    for (const item of list) {
      const shouldBeDisabled = expectedDisabled.has(item.id);
      assert.equal(
        item.manifest.enabled,
        !shouldBeDisabled,
        `${item.id} manifest.enabled should be ${!shouldBeDisabled}`,
      );
    }

    for (const id of ['magicka-regeneration', 'stamina-regeneration']) {
      const item = list.find((m) => m.id === id);
      assert.ok(item, `${id} should be seeded`);
      assert.equal(item.manifest.author, 'Osmicnosap');
      const locales = JSON.parse(fs.readFileSync(path.join('mods', 'examples', id, 'locales.json'), 'utf8'));
      for (const code of all26) {
        assert.ok(locales[code] && typeof locales[code] === 'object', `${id} missing locale ${code}`);
      }
    }

    _resetModPluginApi();
    _resetModEventBus();
    _resetModDataSync();
    _resetModRegistry();

    const player = {
      isPlayer: true,
      health: 100,
      maxHealth: 100,
      magicka: 10,
      maxMagicka: 100,
      fatigue: 10,
      maxFatigue: 100,
      stats: { willpower: 80, endurance: 50 },
    };
    setModApiContext({ player });

    const mrManifest = JSON.parse(fs.readFileSync('mods/examples/magicka-regeneration/manifest.json', 'utf8'));
    const srManifest = JSON.parse(fs.readFileSync('mods/examples/stamina-regeneration/manifest.json', 'utf8'));
    registerVirtualMod(mrManifest);
    registerVirtualMod(srManifest);
    syncModData();

    const mrApi = createModApi('magicka-regeneration');
    const srApi = createModApi('stamina-regeneration');
    initMagickaRegen(mrApi);
    initStaminaRegen(srApi);

    emitModEvent('secondTick', { dt: 2 });
    assert.ok(player.magicka > 10, 'magicka-regeneration should restore magicka on secondTick');
    assert.ok(player.fatigue > 10, 'stamina-regeneration should restore fatigue on secondTick');
    assert.equal(getModStatusChips().length, 2);
  } finally {
    _resetModPluginApi();
    _resetModEventBus();
    _resetModDataSync();
    _resetModRegistry();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ModsStorage: updates legacy and unmodified bundled mods on client upgrade while preserving local edits and 3rd-party mods', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dff-mods-upgrade-test-'));
  const bundledDir = path.join(tmpRoot, 'bundled');
  const userDataDir = path.join(tmpRoot, 'userData');
  const modsDir = path.join(userDataDir, 'Mods');

  try {
    // Prepare bundled v1
    const writeBundledMod = (id, files) => {
      const dir = path.join(bundledDir, id);
      fs.mkdirSync(dir, { recursive: true });
      for (const [rel, content] of Object.entries(files)) {
        const full = path.join(dir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
      }
    };

    writeBundledMod('auto-mod', {
      'manifest.json': JSON.stringify({ id: 'auto-mod', name: 'Auto', version: '1.0.0', enabled: true }),
      'plugin.js': 'export default function() { return 1; }\n',
      'obsolete.txt': 'remove me in v2\n',
    });
    writeBundledMod('edited-mod', {
      'manifest.json': JSON.stringify({ id: 'edited-mod', name: 'Edited', version: '1.0.0', enabled: true }),
      'plugin.js': 'export default function() { return 1; }\n',
    });

    // Legacy pre-marker mod (simulates 0.6.9 userData without .dff-bundled.json)
    fs.mkdirSync(path.join(modsDir, 'legacy-mod'), { recursive: true });
    fs.writeFileSync(
      path.join(modsDir, 'legacy-mod', 'manifest.json'),
      JSON.stringify({ id: 'legacy-mod', name: 'Legacy', version: '0.9.0', enabled: true }),
    );
    fs.writeFileSync(path.join(modsDir, 'legacy-mod', 'plugin.js'), '// old 0.6.9 code\n');

    // Third-party user mod (not in bundledDir)
    fs.mkdirSync(path.join(modsDir, 'third-party-mod'), { recursive: true });
    fs.writeFileSync(
      path.join(modsDir, 'third-party-mod', 'manifest.json'),
      JSON.stringify({ id: 'third-party-mod', name: 'Custom', version: '1.0.0', enabled: true }),
    );

    // First launch seeds auto-mod and edited-mod with .dff-bundled.json
    createModsStorage(userDataDir, { seedExamples: true, bundledExamplesDir: bundledDir });
    assert.ok(fs.existsSync(path.join(modsDir, 'auto-mod', '.dff-bundled.json')));
    assert.ok(fs.existsSync(path.join(modsDir, 'edited-mod', '.dff-bundled.json')));

    // User locally edits 'edited-mod/plugin.js'
    fs.writeFileSync(path.join(modsDir, 'edited-mod', 'plugin.js'), '// user custom tweak\n');

    // Client updates to v2: auto-mod & edited-mod change, legacy-mod is now bundled too
    fs.rmSync(path.join(bundledDir, 'auto-mod', 'obsolete.txt'));
    writeBundledMod('auto-mod', {
      'manifest.json': JSON.stringify({ id: 'auto-mod', name: 'Auto', version: '2.0.0', enabled: false }),
      'plugin.js': 'export default function() { return 2; }\n',
    });
    writeBundledMod('edited-mod', {
      'manifest.json': JSON.stringify({ id: 'edited-mod', name: 'Edited', version: '2.0.0', enabled: true }),
      'plugin.js': 'export default function() { return 2; }\n',
    });
    writeBundledMod('legacy-mod', {
      'manifest.json': JSON.stringify({ id: 'legacy-mod', name: 'Legacy', version: '1.0.0', enabled: true }),
      'plugin.js': '// new 0.7.0 code\n',
    });

    createModsStorage(userDataDir, { seedExamples: true, bundledExamplesDir: bundledDir });

    // 1. Unmodified bundled mod updated + obsolete file removed
    assert.equal(fs.readFileSync(path.join(modsDir, 'auto-mod', 'plugin.js'), 'utf8'), 'export default function() { return 2; }\n');
    assert.equal(JSON.parse(fs.readFileSync(path.join(modsDir, 'auto-mod', 'manifest.json'), 'utf8')).enabled, false);
    assert.equal(fs.existsSync(path.join(modsDir, 'auto-mod', 'obsolete.txt')), false);

    // 2. Legacy pre-marker mod updated + marker written
    assert.equal(fs.readFileSync(path.join(modsDir, 'legacy-mod', 'plugin.js'), 'utf8'), '// new 0.7.0 code\n');
    assert.ok(fs.existsSync(path.join(modsDir, 'legacy-mod', '.dff-bundled.json')));

    // 3. Locally edited bundled mod preserved
    assert.equal(fs.readFileSync(path.join(modsDir, 'edited-mod', 'plugin.js'), 'utf8'), '// user custom tweak\n');

    // 4. Third-party mod untouched
    assert.ok(fs.existsSync(path.join(modsDir, 'third-party-mod', 'manifest.json')));
    assert.equal(fs.existsSync(path.join(modsDir, 'third-party-mod', '.dff-bundled.json')), false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

