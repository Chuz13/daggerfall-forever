// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createModApi,
  _resetModPluginApi,
} from '../../src/systems/mods/modPluginApi.js';
import {
  modSaveRecords,
  restoreModSaveRecords,
  newGameModSaveRecords,
  registerModSaveData,
  _resetModSaveData,
} from '../../src/systems/modSaveData.js';
import { snapshotPlayer } from '../../src/systems/save/save.js';

test('SaveSafetyAudit: 1. Vanilla legacy save (null modData) loads cleanly into modded environment', () => {
  _resetModPluginApi();
  _resetModSaveData();

  // Create mod API for desert-frost
  const api = createModApi('desert-frost');

  // Legacy vanilla save snapshot with null modData
  const legacySnapshot = {
    v: 1,
    classicMinutes: 1000,
    modData: null,
  };

  let errorReported = false;
  restoreModSaveRecords(legacySnapshot.modData, () => {
    errorReported = true;
  });

  assert.equal(errorReported, false, 'Loading legacy save with null modData must not report errors');
  assert.equal(api.storage.get('freezeTicks'), null, 'Mod storage should gracefully default to null');

  _resetModPluginApi();
  _resetModSaveData();
});

test('SaveSafetyAudit: 2. Active mod state persists through snapshotPlayer and restores faithfully', () => {
  _resetModPluginApi();
  _resetModSaveData();

  const api = createModApi('desert-frost');
  api.storage.set('freezeTicks', 24);
  api.storage.set('campWarmthBuff', true);

  // Snapshot generation
  const records = modSaveRecords();
  assert.deepEqual(records['desert-frost'], {
    freezeTicks: 24,
    campWarmthBuff: true,
  });

  const dummyEntity = { name: 'Hero', fatigue: 80, health: 100 };
  const snapshot = snapshotPlayer(dummyEntity, {
    classicMinutes: 5000,
    modData: records,
  });

  assert.ok(snapshot.modData);
  assert.equal(snapshot.modData['desert-frost'].freezeTicks, 24);

  // Clear memory and simulate clean game reload
  _resetModPluginApi();
  const reloadedApi = createModApi('desert-frost');
  assert.equal(reloadedApi.storage.get('freezeTicks'), null);

  // Restore save
  restoreModSaveRecords(snapshot.modData);

  assert.equal(reloadedApi.storage.get('freezeTicks'), 24);
  assert.equal(reloadedApi.storage.get('campWarmthBuff'), true);

  _resetModPluginApi();
  _resetModSaveData();
});

test('SaveSafetyAudit: 3. Clean Uninstall - removing mod leaves save and other mods 100% intact', () => {
  _resetModPluginApi();
  _resetModSaveData();

  // Create two mods
  const apiKeep = createModApi('survival-core');
  const apiRemove = createModApi('uninstalled-mod');

  apiKeep.storage.set('hunger', 10);
  apiRemove.storage.set('someTempState', 999);

  const saveSnapshot = modSaveRecords();

  // Now simulate uninstallation: 'uninstalled-mod' is deleted from mods folder
  // Only 'survival-core' registers its API on launch
  _resetModPluginApi();
  _resetModSaveData();

  const reloadedKeep = createModApi('survival-core');

  let errorLogged = false;
  restoreModSaveRecords(saveSnapshot, () => {
    errorLogged = true;
  });

  // The engine simply ignores unregistered vendor entries without throwing or corrupting
  assert.equal(errorLogged, false);
  assert.equal(reloadedKeep.storage.get('hunger'), 10);

  // Subsequent save does not carry the uninstalled mod bloat if only active mods register
  const nextSaveSnapshot = modSaveRecords();
  assert.equal(nextSaveSnapshot['uninstalled-mod'], undefined);
  assert.deepEqual(nextSaveSnapshot['survival-core'], { hunger: 10 });

  _resetModPluginApi();
  _resetModSaveData();
});

test('SaveSafetyAudit: 4. Corrupted mod payload triggers onError without interrupting game load', () => {
  _resetModPluginApi();
  _resetModSaveData();

  // Register a mod that has strict validation on restore
  createModApi('sensitive-mod');

  // Corrupted save data where a custom mod threw during restore
  const corruptedSave = {
    'sensitive-mod': { count: 1 },
  };

  let capturedErrorVendor = null;
  const errorCallback = (vendor, err) => {
    capturedErrorVendor = vendor;
  };

  // We intentionally inject a crashing restore
  registerModSaveData('broken-vendor', {
    newSaveData: () => ({}),
    getSaveData: () => ({}),
    restoreSaveData: () => {
      throw new Error('Fatal mod data corruption!');
    },
  });

  assert.doesNotThrow(() => {
    restoreModSaveRecords({ 'broken-vendor': { bad: true } }, errorCallback);
  });

  assert.equal(capturedErrorVendor, 'broken-vendor');

  _resetModPluginApi();
  _resetModSaveData();
});
