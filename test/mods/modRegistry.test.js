// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverMods,
  getActiveMods,
  getMod,
  registerVirtualMod,
  setModEnabled,
  readModFile,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import { createModsStorage } from '../../app/lib/modsStorage.cjs';
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

