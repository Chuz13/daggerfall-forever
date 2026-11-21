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
import { CLIMATES } from '../../src/formats/mapsTables.js';
import { BAG_TEMPLATE } from '../../src/net/bagLaw.js';
import { setItemFields } from '../../src/systems/item/itemTemplates.js';
import {
  heldOf,
  roomFor,
  mintCarried,
  takeCarried,
  giveCarried,
  bagTakesOf,
} from '../../src/systems/materialsBag.js';
import { storesLine } from '../../src/scenes/gatherHost.js';
import { harvestHauls } from '../../src/ui/haulCards.js';

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
    kind: 'logs',
    climate: CLIMATES.Woodlands,
    region: 17,
    act: { cuts: 2, clean: true },
    carry: true,
  });

  assert.equal(harvestRes?.ok, true);
  assert.ok(harvestRes.data?.material?.startsWith('log:'));
  assert.equal(harvestRes.data?.carried?.material, harvestRes.data?.material);
  assert.ok((harvestRes.data?.qty ?? 0) > 0);
  assert.ok((harvestRes.data?.xp ?? 0) > 0);
  assert.ok(harvestRes.data?.track?.xp > 0);

  // Harvesting the same node again on the same day should fail (node-taken)
  const repeatRes = await book.harvest({
    node: 'tree:100:200:0:0',
    kind: 'logs',
    climate: CLIMATES.Woodlands,
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

test('offline professions: gathering mints real items into pack without Materials Bag and into bag with Materials Bag', async () => {
  const prevShell = globalThis.daggerShell;
  const mem = new Map();
  globalThis.daggerShell = {
    storage: {
      length: () => mem.size,
      key: (i) => [...mem.keys()][i] ?? null,
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => mem.set(k, String(v)),
      removeItem: (k) => mem.delete(k),
    },
  };
  try {
    const entity = {
      characterId: 'gatherer_' + Date.now(),
      name: 'Gatherer',
      stats: { strength: 50 },
      items: [],
      bagItems: [],
      goldPieces: 0,
    };

    const carry = {
      held: (k) => heldOf(entity, k, { counter: false }),
      heldAll: (k) => heldOf(entity, k),
      room: (k) => roomFor(entity, k),
      mint: (k, n) => mintCarried(entity, k, n),
      take: (k, n, id, order, counter = false) => takeCarried(entity, k, n, id, order, { counter }),
      give: (k, n) => giveCarried(entity, k, n),
      stamped: (id) => Object.hasOwn(bagTakesOf(entity), id),
      unstamp: (id) => {
        if (entity.bagTakes) delete entity.bagTakes[id];
      },
      stamps: () => Object.entries(bagTakesOf(entity)).map(([id, t]) => ({ id, ...t })),
      flush: async () => true,
    };

    const book = createOfflineProfBook({
      playerEntity: entity,
      carry,
      now: () => 2000 * 60 * 1000,
      nowMinutes: () => 2000,
    });

    await book.refresh({ force: true });

    // 1. No Materials Bag: vein, tree, and herb patch all mint into pack (entity.items)
    const veinRes = await book.harvest({
      node: 'vein:100:200:0:0',
      kind: 'ore',
      climate: CLIMATES.Woodlands,
      region: 17,
      act: { glints: 2, clean: true },
    });
    const treeRes = await book.harvest({
      node: 'tree:100:200:0:0',
      kind: 'logs',
      climate: CLIMATES.Woodlands,
      region: 17,
      act: { cuts: 2, clean: true },
    });
    const herbRes = await book.harvest({
      node: 'herb:100:200:0:0',
      kind: 'herbs',
      climate: CLIMATES.Woodlands,
      region: 17,
      act: { clean: false, bruised: false },
    });

    for (const res of [veinRes, treeRes, herbRes]) {
      assert.equal(res?.ok, true);
      assert.equal(typeof res.data?.material, 'string');
      assert.ok(res.data.qty >= 1);
      assert.ok(res.data.xp > 0);
      assert.ok(heldOf(entity, res.data.material) >= res.data.qty, `minted ${res.data.material} into pack`);
      assert.equal(entity.bagItems.length, 0);
      assert.equal(res.data.put.bag, 0);
      assert.ok(res.data.put.pack + res.data.put.over >= res.data.qty);
      assert.equal(res.data.put.left, 0);

      const line = storesLine(res.data);
      assert.ok(!line.includes('undefined'), `storesLine must not contain undefined: ${line}`);
      assert.ok(line.includes('to your pack'), `storesLine must say pack without bag: ${line}`);

      const hauls = harvestHauls(res.data);
      assert.ok(hauls.length >= 1);
      assert.ok(hauls[0].count >= 1);
      assert.equal(hauls[0].xp, res.data.xp);
    }

    // 2. With Materials Bag: vein mints into bag (entity.bagItems)
    entity.items.push(setItemFields({ group: 'UselessItems2', templateIndex: BAG_TEMPLATE }));
    const bagVeinRes = await book.harvest({
      node: 'vein:100:200:0:1',
      kind: 'ore',
      climate: CLIMATES.Woodlands,
      region: 17,
      act: { glints: 2, clean: true },
    });
    assert.equal(bagVeinRes?.ok, true);
    assert.ok(bagVeinRes.data.put.bag >= bagVeinRes.data.qty);
    assert.ok(entity.bagItems.length > 0);
    const bagLine = storesLine(bagVeinRes.data);
    assert.ok(!bagLine.includes('undefined'));
    assert.ok(bagLine.includes('to your bag'));

    // 3. Carried persistence across deposit / withdraw / refresh
    const oreMat = bagVeinRes.data.material;
    const totalOreHeld = heldOf(entity, oreMat);
    assert.ok(totalOreHeld >= bagVeinRes.data.qty);

    const depRes = await book.deposit(oreMat, totalOreHeld);
    assert.equal(depRes?.ok, true);
    assert.equal(book.storesHeld(oreMat), totalOreHeld);
    assert.equal(book.carried(oreMat).own, 0);
    assert.equal(heldOf(entity, oreMat), 0);

    const minted = [];
    const wdRes = await book.withdraw(oreMat, 1, (k, q) => minted.push(mintCarried(entity, k, q)));
    assert.equal(wdRes?.ok, true);
    assert.deepEqual(minted, [{ bag: 1, pack: 0, left: 0 }]);
    assert.equal(book.carried(oreMat).own, 1);

    await book.refresh({ force: true });
    assert.equal(book.carried(oreMat).own, 1);
  } finally {
    globalThis.daggerShell = prevShell;
  }
});
