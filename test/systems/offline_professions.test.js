import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  isOfflineProfessionsActive,
  createOfflineProfBook,
  createNewRecord,
  sanitizeRecord,
  _resetOfflineProfessionsForTests,
} from '../../src/systems/offlineProfessions.js';
import { foragingCustomItemsForGroup } from '../../src/systems/foraging/foragingInstall.js';
import { knifeCustomItemsForGroup, PROF_ITEM_GROUP } from '../../src/systems/professions/profTemplates.js';
import { FT } from '../../src/systems/foraging/foragingLaw.js';
import { SKINNING_KNIFE } from '../../src/net/professionLaw.js';

beforeEach(() => {
  _resetOfflineProfessionsForTests();
});

test('offline professions: active by default in offline mode', () => {
  assert.equal(isOfflineProfessionsActive(), true);
});

test('offline professions: tools shelved in shops offline', () => {
  const tools = foragingCustomItemsForGroup('UselessItems2');
  assert.ok(tools.includes(FT.PickAxe), 'Pick-Axe shelved offline');
  assert.ok(tools.includes(FT.WoodAxe), 'Wood-Axe shelved offline');
  assert.ok(tools.includes(FT.Sickle), 'Sickle shelved offline');

  const knives = knifeCustomItemsForGroup(PROF_ITEM_GROUP);
  assert.ok(knives.includes(SKINNING_KNIFE.templateIndex), 'Skinning Knife shelved offline');
});

test('offline professions: record creation and sanitization', () => {
  const fresh = createNewRecord();
  assert.deepEqual(fresh.made, { crafts: [], works: [], brews: [] });
  assert.deepEqual(fresh.harvestedNodes, { day: 0, keys: [] });

  const sanitized = sanitizeRecord({
    made: { crafts: ['iron_dagger'] },
    harvestedNodes: { day: 5, keys: ['test|node'] },
    hauls: 3,
  });
  assert.equal(sanitized.made.crafts[0], 'iron_dagger');
  assert.equal(sanitized.harvestedNodes.day, 5);
  assert.equal(sanitized.hauls, 3);
});

test('offline professions: createOfflineProfBook and state lifecycle', async () => {
  let minutes = 100;
  const fakeEntity = {
    characterId: 'char_' + Date.now(),
    name: 'Craftsman',
    items: [],
    bagItems: [],
  };

  const stamps = new Set();
  const carryHands = {
    held: () => 0,
    heldAll: () => 0,
    room: () => 100,
    mint: (k, n) => ({ bag: n, pack: 0, over: 0, left: 0 }),
    take: (k, n, stamp) => {
      if (stamp) stamps.add(stamp);
      return { taken: n, back: () => { if (stamp) stamps.delete(stamp); } };
    },
    give: (k, n) => ({ bag: n, pack: 0, over: 0, left: 0 }),
    stamped: (id) => stamps.has(id),
    unstamp: (id) => { stamps.delete(id); },
    stamps: () => [...stamps].map((id) => ({ id, material: 'metal:iron', qty: 10 })),
    flush: async () => true,
  };

  const book = createOfflineProfBook({
    playerEntity: fakeEntity,
    carry: carryHands,
    now: () => minutes * 60 * 1000,
    nowMinutes: () => minutes,
  });

  assert.ok(book);
  const stateRes = await book.refresh({ force: true });
  assert.equal(stateRes?.ok, true);
  assert.equal(book.state.open, true);
  assert.ok(book.state.tracks.has('mining'));
  assert.ok(book.state.tracks.has('smithing'));

  // Test deposit into Stores
  const depRes = await book.deposit('metal:iron', 10);
  assert.equal(depRes?.ok, true);
  assert.equal(book.held('metal:iron'), 10);

  // Test withdrawal from Stores
  const withRes = await book.withdraw('metal:iron', 4, (k, n) => {});
  assert.equal(withRes?.ok, true);
  assert.equal(book.held('metal:iron'), 6);

  // Advance time past 1 day (1440 mins)
  minutes += 1500;
  assert.equal(book.stale(), true);
  const nextRes = await book.refresh({ force: true });
  assert.equal(nextRes?.ok, true);
  assert.equal(book.state.day, Math.floor(minutes / 1440));
});

test('offline professions: harvesting and crafting', async () => {
  const fakeEntity = {
    characterId: 'crafter_' + Date.now(),
    name: 'Smith',
    items: [],
    bagItems: [],
  };

  const stamps = new Set();
  const carryHands = {
    held: () => 0,
    heldAll: () => 0,
    room: () => 100,
    mint: (k, n) => ({ bag: n, pack: 0, over: 0, left: 0 }),
    take: (k, n, stamp) => {
      if (stamp) stamps.add(stamp);
      return { taken: n, back: () => { if (stamp) stamps.delete(stamp); } };
    },
    give: (k, n) => ({ bag: n, pack: 0, over: 0, left: 0 }),
    stamped: (id) => stamps.has(id),
    unstamp: (id) => { stamps.delete(id); },
    stamps: () => [...stamps].map((id) => ({ id, material: 'ingot:iron', qty: 5 })),
    flush: async () => true,
  };

  const book = createOfflineProfBook({
    playerEntity: fakeEntity,
    carry: carryHands,
    now: () => 1000 * 60 * 1000,
    nowMinutes: () => 1000,
  });

  await book.refresh({ force: true });

  // Harvest a tree node
  const harvestRes = await book.harvest({
    node: 'tree:100:200:0:0',
    kind: 'wood',
    climate: 2, // Woodlands
    region: 17,
    act: { cuts: 2, clean: true },
    carry: true,
  });

  assert.equal(harvestRes?.ok, true);
  assert.ok(harvestRes.data?.carried?.material.startsWith('wood:'));
  assert.ok(harvestRes.data?.track?.xp > 0);

  // Harvesting the same node again on the same day should fail (node-taken)
  const repeatRes = await book.harvest({
    node: 'tree:100:200:0:0',
    kind: 'wood',
    climate: 2,
    region: 17,
    act: { cuts: 2, clean: true },
    carry: true,
  });
  assert.equal(repeatRes?.ok, false);
  assert.equal(repeatRes?.error, 'node-taken');

  // Deposit iron ingots and tin for crafting test
  await book.deposit('ingot:iron', 5);
  await book.deposit('metal:tin', 5);
  assert.equal(book.held('ingot:iron'), 5);
  assert.equal(book.held('metal:tin'), 5);

  // Craft an iron dagger (recipe 'dagger:iron')
  const craftRes = await book.craft('dagger:iron', { clean: true }, (data) => {});
  assert.equal(craftRes?.ok, true);
  assert.equal(craftRes.data?.recipe, 'dagger:iron');
  assert.ok(craftRes.data?.pieces?.length > 0);
  assert.ok(craftRes.data?.xp > 0);
  assert.ok(book.state.tracks.get('smithing').xp > 0);
});
