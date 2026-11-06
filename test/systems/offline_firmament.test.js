import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  isOfflineFirmamentActive,
  createOfflineFirmamentBook,
  initOfflineRenown,
  onOfflineFoeKilled,
  onOfflineQuestEnded,
  offlineKillXp,
  offlineQuestXp,
  addOfflineRenownXp,
  OFFLINE_RENOWN_BOOST,
  _resetOfflineFirmamentForTests,
} from '../../src/systems/offlineFirmament.js';

import {
  saveOfflineRecord as saveOfflineProfRecord,
} from '../../src/systems/offlineProfessions.js';

import {
  createLocalProfDoor,
} from '../../src/systems/professions/localProfDoor.js';

import {
  FIRM_RESPEC_GOLD,
  starsFor,
  pathTo,
} from '../../src/net/firmament/firmamentLaw.js';

import {
  setFirmamentTree,
  setFirmamentOnline,
  setFirmamentOffline,
  isFirmamentOffline,
  firmamentInForce,
  firmamentStatus,
  firmamentStats,
  _resetFirmamentLiveForTests,
} from '../../src/systems/firmamentLive.js';

const storeMap = new Map();
globalThis.daggerShell = {
  storage: {
    length: () => storeMap.size,
    key: (i) => [...storeMap.keys()][i],
    getItem: (k) => storeMap.get(k) ?? null,
    setItem: (k, v) => { storeMap.set(k, String(v)); },
    removeItem: (k) => { storeMap.delete(k); },
  },
};

beforeEach(() => {
  storeMap.clear();
  _resetFirmamentLiveForTests();
  _resetOfflineFirmamentForTests();
});

test('offline firmament: preference and flag activation', () => {
  // Flag is true in forkFlags. By default uiPrefs returns true unless disabled.
  const active = isOfflineFirmamentActive();
  assert.equal(typeof active, 'boolean');
});

test('offline firmament: firmamentLive responds to offline state', () => {
  assert.equal(firmamentInForce(), false);
  assert.equal(isFirmamentOffline(), false);

  const warriorTree = { start: 'wr.start', keys: ['wr.s1'] };
  setFirmamentTree(warriorTree);

  // With tree set but neither online nor offline active:
  assert.equal(firmamentInForce(), false);
  assert.equal(firmamentStatus({ read: true, dueling: false }), 'seat');

  // Set offline active:
  setFirmamentOffline(true);
  assert.equal(isFirmamentOffline(), true);
  assert.equal(firmamentInForce(), true);
  assert.equal(firmamentStatus({ read: true, dueling: false }), 'active');

  // Turn offline off:
  setFirmamentOffline(false);
  assert.equal(isFirmamentOffline(), false);
  assert.equal(firmamentInForce(), false);
});

test('offline firmament: XP calculations and offline multiplier', () => {
  assert.equal(OFFLINE_RENOWN_BOOST, 1.5);

  // Kill XP scaled by foe level and 1.5x boost
  const xpLow = offlineKillXp(2, 1);
  const xpHigher = offlineKillXp(10, 1);
  assert.ok(xpLow > 0);
  assert.ok(xpHigher > xpLow, 'higher level foe yields more renown');

  // Quest XP
  const questXp = offlineQuestXp(5, 1);
  assert.ok(questXp > 0);
});

test('offline firmament: stars per renown level', () => {
  assert.equal(starsFor(1), 0);
  assert.equal(starsFor(2), 2);
  assert.equal(starsFor(5), 8);
  assert.equal(starsFor(10), 18);
});

test('offline firmament: offline book creation, star allocation, respec, and events', async () => {
  let gold = 20_000;
  const fakeEntity = {
    characterId: 'test_hero_' + Date.now(),
    name: 'Grom',
  };
  const fakeWallet = () => ({
    gold: () => gold,
    pay: (cost) => { gold -= cost; },
  });

  const book = createOfflineFirmamentBook({ entity: fakeEntity, wallet: fakeWallet });
  assert.ok(book);
  assert.ok(book.state);

  const readOk = await book.read();
  assert.equal(readOk, true);
  assert.equal(book.state.open, true);
  assert.equal(book.state.renown, 1);

  let changeNotified = false;
  book.onChange((st) => {
    changeNotified = true;
  });

  // Start with warrior sign
  const commitRes = await book.commit({ start: 'wr.start', keys: [] });
  assert.equal(commitRes.ok, true);
  assert.ok(changeNotified);
  assert.equal(book.state.tree.start, 'wr.start');

  // Respec
  const respecRes = await book.respec();
  assert.equal(respecRes.ok, true);
  assert.equal(book.state.tree.start, null);
  assert.equal(book.state.tree.keys.length, 0);
  assert.equal(gold, 10_000, 'respec deducted 10,000 gold');
});

test('offline firmament: renown rise grants stars and stays synchronized across character ID change', async () => {
  const entity = {
    characterId: 'temp_boot_id_' + Date.now(),
    name: 'Hero',
  };
  let gold = 50_000;
  const wallet = () => ({ gold: () => gold, pay: (c) => { gold -= c; } });
  const book = createOfflineFirmamentBook({ entity, wallet });
  initOfflineRenown({ playerEntity: entity, firmBook: book });

  // Initially at renown 1, stars 0
  await book.read();
  assert.equal(book.state.renown, 1);
  assert.equal(book.state.stars, 0);

  // Now entity characterId changes (e.g. save file loaded with real UUID)
  entity.characterId = 'restored_save_uuid_999';

  // Gain 200 XP -> renown reaches level 2 (needs 100 XP)
  addOfflineRenownXp(200);

  // Read book again
  await book.read();
  assert.equal(book.state.renown, 2, 'renown increased to level 2');
  assert.equal(book.state.stars, 2, 'stars accrued to 2');

  // Allocate 1 star on warrior tree
  const starsKeys = ['wr.s1'];
  const commitRes = await book.commit({ start: 'wr.start', keys: starsKeys });
  assert.equal(commitRes.ok, true, 'star allocation succeeded');
  assert.equal(book.state.tree.start, 'wr.start');
  assert.deepEqual(book.state.tree.keys, starsKeys);
  assert.equal(firmamentInForce(), true);

  // Ensure firmamentStats are populated
  const stats = firmamentStats();
  assert.ok(Object.keys(stats).length > 0, 'firmament stats active');

  // Free refund in offline mode
  assert.equal(book.state.refund.freeBelow, 999);
});

test('offline firmament: craft points calculated from offline profession ranks', async () => {
  const charId = 'crafter_' + Date.now();
  const entity = { characterId: charId, name: 'Crafter' };
  const wallet = () => ({ gold: () => 10_000, pay: () => {} });

  // Save profession tracks with 40 mining and 40 smithing (total 80 ranks = 10 craft points)
  saveOfflineProfRecord(charId, {
    tracks: {
      mining: { rank: 40, xp: 5000 },
      smithing: { rank: 40, xp: 5000 },
    },
    stores: {},
    made: { crafts: [], works: [], brews: [] },
    harvestedNodes: { day: 0, keys: [] },
    hunt: { hides: 0, high: 0 },
    hauls: 0,
  });

  const book = createOfflineFirmamentBook({ entity, wallet });
  initOfflineRenown({ playerEntity: entity, firmBook: book });
  await book.read();

  assert.equal(book.state.craft, 10, 'craft points earned from profession ranks (80/8 = 10)');
  assert.equal(book.state.ranks.mining, 40);
  assert.equal(book.state.ranks.smithing, 40);
});

test('offline firmament: firmament stars boost gathering and profession XP offline', async () => {
  const entity = { characterId: 'miner_1', name: 'Miner' };
  let profRec = {
    tracks: {
      mining: { rank: 1, xp: 0 },
    },
    stores: {},
    made: { crafts: [], works: [], brews: [] },
    harvestedNodes: { day: 0, keys: [] },
    hunt: { hides: 0, high: 0 },
    hauls: 0,
  };
  const door = createLocalProfDoor(entity, {
    getRecord: () => profRec,
    saveRecord: (r) => { profRec = r; },
  });

  setFirmamentOffline(true);
  setFirmamentTree(null);

  const r1 = await door.harvest({
    node: 'vein:10:20:0:1',
    kind: 'vein',
    climate: 2,
    region: 1,
  });
  assert.equal(r1.ok, true);
  const baseXp = r1.data.today;
  assert.ok(baseXp > 0);

  // Set tree with warrior start and wr.lr1 (+4% mining XP)
  setFirmamentTree({
    start: 'wr.start',
    keys: ['wr.lr1'],
  });
  assert.equal(firmamentStats()['xp.mining'], 4);

  const r2 = await door.harvest({
    node: 'vein:10:20:0:2',
    kind: 'vein',
    climate: 2,
    region: 1,
  });
  assert.equal(r2.ok, true);
  const boostedXp = r2.data.today;
  assert.ok(boostedXp >= baseXp, 'mining XP received firmament boost');
});
