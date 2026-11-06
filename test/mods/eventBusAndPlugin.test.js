// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  onModEvent,
  offModEvent,
  emitModEvent,
  _resetModEventBus,
} from '../../src/systems/mods/modEventBus.js';
import {
  createModApi,
  setModApiContext,
  _resetModPluginApi,
} from '../../src/systems/mods/modPluginApi.js';
import {
  loadActiveModPlugins,
  unloadModPlugins,
  _resetModPluginLoader,
} from '../../src/systems/mods/modPluginLoader.js';
import {
  registerVirtualMod,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import {
  modSaveRecords,
  restoreModSaveRecords,
  _resetModSaveData,
} from '../../src/systems/modSaveData.js';
import fs from 'node:fs';
import path from 'node:path';

test('modEventBus: handles events and isolates errors cleanly', () => {
  _resetModEventBus();

  let okCalled = false;
  onModEvent('testEvent', () => {
    throw new Error('Crashing mod!');
  }, 'bad-mod');

  onModEvent('testEvent', () => {
    okCalled = true;
  }, 'good-mod');

  // Must not throw despite 'bad-mod' throwing
  assert.doesNotThrow(() => {
    emitModEvent('testEvent', { data: 123 });
  });

  assert.equal(okCalled, true, 'Good mod should execute even when preceding mod threw an error');

  _resetModEventBus();
});

test('modPluginApi: isolated per-mod storage hooks into core modSaveData records', () => {
  _resetModPluginApi();
  _resetModSaveData();

  const apiA = createModApi('mod-a');
  const apiB = createModApi('mod-b');

  apiA.storage.set('level', 5);
  apiB.storage.set('reputation', -15);

  assert.equal(apiA.storage.get('level'), 5);
  assert.equal(apiB.storage.get('reputation'), -15);
  assert.equal(apiA.storage.get('reputation'), null);

  // Check core save system integration
  const snapshot = modSaveRecords();
  assert.deepEqual(snapshot['mod-a'], { level: 5 });
  assert.deepEqual(snapshot['mod-b'], { reputation: -15 });

  // Reset and restore from saved snapshot
  _resetModPluginApi();
  const freshApiA = createModApi('mod-a');
  assert.equal(freshApiA.storage.get('level'), null);

  restoreModSaveRecords(snapshot);
  assert.equal(freshApiA.storage.get('level'), 5);

  _resetModPluginApi();
  _resetModSaveData();
});

test('modPluginLoader & desert-frost: executes plugin and simulates freezing night tick', async () => {
  _resetModRegistry();
  _resetModEventBus();
  _resetModPluginApi();
  _resetModPluginLoader();

  // Read actual desert-frost plugin file
  const pluginCode = fs.readFileSync(
    path.join(process.cwd(), 'mods/examples/desert-frost/plugin.js'),
    'utf8'
  );

  registerVirtualMod(
    {
      id: 'desert-frost',
      name: 'Desert Frost',
      enabled: true,
      entry: 'plugin.js',
    },
    {
      'plugin.js': pluginCode,
    }
  );

  await loadActiveModPlugins();

  const dummyPlayer = {
    fatigue: 50,
    health: 100,
    maxHealth: 100,
    activeEffects: [],
  };

  const dummyWorld = {
    gameMinutes: 22 * 60, // 22:00 (Night)
    isInterior: false,
    biome: 'desert',
  };

  setModApiContext({ player: dummyPlayer, world: dummyWorld });

  // Simulate worldTick event
  emitModEvent('worldTick', { entity: dummyPlayer });

  assert.equal(dummyPlayer.fatigue, 45, 'Fatigue should decrease by 5 in cold desert night');

  const api = createModApi('desert-frost');
  assert.equal(api.storage.get('freezeTicks'), 1);

  // Now give player frost resistance
  dummyPlayer.activeEffects.push({ name: 'resistFrost' });
  emitModEvent('worldTick', { entity: dummyPlayer });

  assert.equal(dummyPlayer.fatigue, 45, 'Fatigue should NOT decrease when protected by resistFrost');
  assert.equal(api.storage.get('freezeTicks'), 1);

  _resetModRegistry();
  _resetModEventBus();
  _resetModPluginApi();
  _resetModPluginLoader();
});
