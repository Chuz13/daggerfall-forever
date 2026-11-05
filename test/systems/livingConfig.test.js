// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LivingTamrielConfig,
  PRESENCE,
  isLivingFeatureActive,
  resetLivingConfig,
} from '../../src/systems/living/livingConfig.js';

import {
  LIVING_TAMRIEL_VENDOR,
  LIVING_TAMRIEL_SAVE_VERSION,
  newLivingSaveData,
  getLivingSaveData,
  restoreLivingSaveData,
  onLivingWorldTick,
  getLivingDirectorState,
  initLivingDirector,
} from '../../src/systems/living/livingDirector.js';

import { modSaveRecords, restoreModSaveRecords } from '../../src/systems/modSaveData.js';

test('LT-01: LivingTamrielConfig provides canonical defaults and presence tiers', () => {
  resetLivingConfig();

  assert.equal(LivingTamrielConfig.political, PRESENCE.MID);
  assert.equal(LivingTamrielConfig.adventurers, PRESENCE.MID);
  assert.equal(LivingTamrielConfig.wilderness, PRESENCE.MID);
  assert.equal(LivingTamrielConfig.urban, PRESENCE.MID);
  assert.equal(LivingTamrielConfig.naval, PRESENCE.MID);
  assert.equal(LivingTamrielConfig.travelInterruption, PRESENCE.MID);
  assert.equal(LivingTamrielConfig.camps, PRESENCE.MID);
  assert.equal(LivingTamrielConfig.quarantine, PRESENCE.HIGH);
  assert.equal(LivingTamrielConfig.bounties, PRESENCE.MID);

  assert.equal(LivingTamrielConfig.adventurerPoolPerRegion, 13);
  assert.equal(LivingTamrielConfig.navalSpawnDistanceMeters, 250);
  assert.equal(LivingTamrielConfig.bountyWildernessWeight, 0.70);
  assert.equal(LivingTamrielConfig.bountyRewardWildMult, 4.0);
  assert.equal(LivingTamrielConfig.bountyRewardDungeonMult, 7.5);
  assert.equal(LivingTamrielConfig.luckRerollThreshold, 5);

  assert.equal(isLivingFeatureActive('political'), true);

  LivingTamrielConfig.political = PRESENCE.OFF;
  assert.equal(isLivingFeatureActive('political'), false);

  resetLivingConfig();
  assert.equal(isLivingFeatureActive('political'), true);
});

test('LT-01: LivingDirector initializes and serializes clean, zero-bloat save records', () => {
  initLivingDirector();

  const fresh = newLivingSaveData();
  assert.equal(fresh.version, LIVING_TAMRIEL_SAVE_VERSION);
  assert.equal(fresh.lastWorldTickMinute, 0);
  assert.ok(Number.isFinite(fresh.seed));
  assert.deepEqual(fresh.config.political, PRESENCE.MID);

  const serialized = JSON.stringify(fresh);
  // Zero-bloat guarantee: Must be tiny (< 1024 bytes)
  assert.ok(serialized.length < 1024, `Save record too large: ${serialized.length} bytes`);

  // modSaveData integration check
  const allRecords = modSaveRecords();
  assert.ok(allRecords[LIVING_TAMRIEL_VENDOR], 'Living Tamriel not found in modSaveRecords');
  assert.equal(allRecords[LIVING_TAMRIEL_VENDOR].version, LIVING_TAMRIEL_SAVE_VERSION);
});

test('LT-01: restoreLivingSaveData safely handles corrupted or partial data', () => {
  // Test invalid types without crashing
  restoreLivingSaveData(null);
  restoreLivingSaveData(undefined);
  restoreLivingSaveData('invalid string');
  restoreLivingSaveData({ version: 999, corrupted: true });

  const state = getLivingDirectorState();
  assert.equal(state.version, LIVING_TAMRIEL_SAVE_VERSION);

  // Test partial restore with valid config overrides
  const customSave = {
    version: 1,
    lastWorldTickMinute: 14400,
    seed: 4242,
    config: {
      political: PRESENCE.HIGH,
      adventurers: PRESENCE.OFF,
    },
    subsystems: {
      travel: { lastInterruptMinute: 12000 },
    },
  };

  restoreLivingSaveData(customSave);
  assert.equal(state.lastWorldTickMinute, 14400);
  assert.equal(state.seed, 4242);
  assert.equal(LivingTamrielConfig.political, PRESENCE.HIGH);
  assert.equal(LivingTamrielConfig.adventurers, PRESENCE.OFF);
  assert.equal(state.subsystems.travel.lastInterruptMinute, 12000);

  // Restore via modSaveData host runner
  restoreModSaveRecords({
    [LIVING_TAMRIEL_VENDOR]: {
      version: 1,
      lastWorldTickMinute: 28800,
      seed: 9999,
    },
  });

  const restoredState = getLivingDirectorState();
  assert.equal(restoredState.lastWorldTickMinute, 28800);
  assert.equal(restoredState.seed, 9999);
});

test('LT-01: onLivingWorldTick updates simulation time and caps discrete catch-up steps', () => {
  restoreLivingSaveData({
    version: 1,
    lastWorldTickMinute: 1000,
    seed: 1234,
  });

  // Advance less than a day -> updates state marker smoothly
  onLivingWorldTick(1500);
  const state = getLivingDirectorState();
  assert.equal(state.lastWorldTickMinute, 1000); // Only day boundaries trigger advance

  // Advance by 5 full days (7200 minutes) -> governor clamps discrete steps to 3
  onLivingWorldTick(1000 + 7200);
  assert.equal(state.lastWorldTickMinute, 8200);
});

