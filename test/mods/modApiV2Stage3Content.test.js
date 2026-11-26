import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  registerVirtualMod,
  discoverMods,
  setModEnabled,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import {
  syncModData,
  MOD_ITEM_TEMPLATE_MIN,
  getModCustomItemMeta,
  getModSpellRecord,
  getModLegendaryRecord,
  _resetModDataSync,
} from '../../src/systems/mods/modDataSync.js';
import {
  registerVirtualPluginHandler,
  loadActiveModPlugins,
  unloadModPlugins,
  getPluginError,
  _resetModPluginLoader,
} from '../../src/systems/mods/modPluginLoader.js';
import {
  setModApiContext,
  bindModConsoleBridge,
  getModStatusChips,
  _resetModPluginApi,
} from '../../src/systems/mods/modPluginApi.js';
import { emitModEvent } from '../../src/systems/mods/modEventBus.js';
import { templateByIndex, templateLore, itemUseHandler } from '../../src/systems/item/itemTemplates.js';
import { mergeSpellRecords, registerSpellRecordsAsset, _resetSpellRecordsAssets } from '../../src/systems/spell/standardSpells.js';
import { allLegendaries, legendaryById, legendariesFor } from '../../src/systems/loot/lootRarity.js';

import wayfarerInit, {
  WAYFARER_TONIC_TEMPLATE,
  WAYFARER_STRIDE_SPELL,
  WAYFARER_SIGNET_ID,
} from '../../mods/examples/wayfarers-kit/plugin.js';

const ALL_26_LOCALES = [
  'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja',
  'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant',
];

function resetAll() {
  _resetModPluginLoader();
  _resetModPluginApi();
  _resetModDataSync();
  _resetModRegistry();
}

test('Stage 3: data.items enforces >=9000 guard, registers lore/use handler, and unregisters cleanly', async () => {
  resetAll();

  registerVirtualMod(
    {
      id: 'item-test-mod',
      name: 'Item Test',
      enabled: true,
      data: { items: 'items.json' },
    },
    {
      'items.json': JSON.stringify([
        { index: 120, name: 'Illegal Low Index' },
        { index: 9201, name: 'Test Vial', lore: 'Smells of juniper.', group: 'MiscItems', basePrice: 42 },
      ]),
    },
  );

  let usedCount = 0;
  registerVirtualPluginHandler('item-test-mod', (api) => {
    api.items.onUse(9201, (_item, _list, ctx) => {
      usedCount++;
      ctx.consume();
      return 'Drank test vial.';
    });
  });

  const player = { health: 50, maxHealth: 100, fatigue: 50, maxFatigue: 100, items: [], spells: [] };
  setModApiContext({ player });

  discoverMods();
  syncModData();
  await loadActiveModPlugins();

  // Guarded low index must be skipped
  assert.notEqual(templateByIndex(120)?.name, 'Illegal Low Index');
  assert.equal(getModCustomItemMeta(120), null);

  // Valid >= 9000 index registered
  assert.equal(templateByIndex(9201)?.name, 'Test Vial');
  assert.equal(templateLore({ templateIndex: 9201 }), 'Smells of juniper.');
  const handler = itemUseHandler(9201);
  assert.equal(typeof handler, 'function');

  // Test consume via handler
  const fakeItem = { templateIndex: 9201, group: 'MiscItems', stackCount: 2 };
  const inv = [fakeItem];
  const res = handler(fakeItem, inv, { entity: player });
  assert.equal(usedCount, 1);
  assert.deepEqual(res, { kind: 'text', text: 'Drank test vial.' });
  assert.equal(fakeItem.stackCount, 1);
  handler(fakeItem, inv, { entity: player });
  assert.equal(inv.length, 0);

  // Disable & resync -> clean removal
  setModEnabled('item-test-mod', false);
  unloadModPlugins();
  syncModData();
  assert.equal(templateByIndex(9201), null);
  assert.equal(templateLore({ templateIndex: 9201 }), null);
  assert.equal(itemUseHandler(9201), null);
});

test('Stage 3: data.spells & data.legendaries merge cleanly and leave non-mod records intact on unload', async () => {
  resetAll();
  _resetSpellRecordsAssets();

  // Simulate non-mod built-in asset (e.g. DEX)
  registerSpellRecordsAsset('dex-builtin', [{ index: 777, spellName: 'Builtin DEX Spell', cost: 10 }]);

  registerVirtualMod(
    {
      id: 'content-test-mod',
      name: 'Content Test',
      enabled: true,
      data: { spells: 'spells.json', legendaries: 'legendaries.json' },
    },
    {
      'spells.json': JSON.stringify([
        { index: 9205, spellName: 'Mod Flame', element: 0, rangeType: 2, cost: 15, icon: 1, effects: [] },
      ]),
      'legendaries.json': JSON.stringify([
        {
          id: 'mod-test-ring',
          name: 'Ring of Testing',
          group: 'Jewellery',
          templates: [135],
          affixes: [{ id: 'stat', param: 'luck', value: 10 }],
          lore: 'Forged in unit tests.',
        },
      ]),
    },
  );

  discoverMods();
  syncModData();

  assert.ok(getModSpellRecord(9205));
  const merged = mergeSpellRecords([]);
  assert.ok(merged.some((s) => s.index === 777 && s.name === 'Builtin DEX Spell'));
  assert.ok(merged.some((s) => s.index === 9205 && s.name === 'Mod Flame'));

  assert.ok(getModLegendaryRecord('mod-test-ring'));
  assert.ok(legendaryById('mod-test-ring'));
  assert.ok(legendariesFor({ group: 'Jewellery', templateIndex: 135 }).some((l) => l.id === 'mod-test-ring'));

  // Disable mod -> mod records removed, built-in preserved
  setModEnabled('content-test-mod', false);
  syncModData();

  const afterMerged = mergeSpellRecords([]);
  assert.ok(afterMerged.some((s) => s.index === 777));
  assert.ok(!afterMerged.some((s) => s.index === 9205));
  assert.equal(legendaryById('mod-test-ring'), null);
  assert.ok(allLegendaries().length > 0);
  _resetSpellRecordsAssets();
});

test("Stage 3 Showcase: wayfarers-kit end-to-end (items, spells, legendaries, console, HUD chip, 26 locales)", async () => {
  resetAll();

  const manifest = JSON.parse(fs.readFileSync('mods/examples/wayfarers-kit/manifest.json', 'utf8'));
  const files = {
    'items.json': fs.readFileSync('mods/examples/wayfarers-kit/items.json', 'utf8'),
    'spells.json': fs.readFileSync('mods/examples/wayfarers-kit/spells.json', 'utf8'),
    'legendaries.json': fs.readFileSync('mods/examples/wayfarers-kit/legendaries.json', 'utf8'),
    'locales.json': fs.readFileSync('mods/examples/wayfarers-kit/locales.json', 'utf8'),
  };

  // Verify 26-language completeness
  const locJson = JSON.parse(files['locales.json']);
  for (const loc of ALL_26_LOCALES) {
    assert.ok(locJson[loc]?.['wk.item.tonic.name'], `${loc} missing wk.item.tonic.name`);
    assert.ok(locJson[loc]?.['wk.spell.stride.name'], `${loc} missing wk.spell.stride.name`);
    assert.ok(locJson[loc]?.['wk.legendary.signet.name'], `${loc} missing wk.legendary.signet.name`);
    assert.ok(locJson[loc]?.['wk.cfg.showChip'], `${loc} missing wk.cfg.showChip`);
  }

  const commands = new Map();
  bindModConsoleBridge({
    registerCommand: (name, _desc, _usage, fn) => commands.set(name, fn),
    gateConsoleCommand: () => false,
  });

  const player = {
    health: 40,
    maxHealth: 100,
    fatigue: 20,
    maxFatigue: 100,
    items: [],
    spells: [],
  };
  setModApiContext({ player });

  registerVirtualMod(manifest, files);
  registerVirtualPluginHandler('wayfarers-kit', wayfarerInit);

  discoverMods();
  syncModData();
  await loadActiveModPlugins();

  assert.ok(templateByIndex(WAYFARER_TONIC_TEMPLATE)?.index === WAYFARER_TONIC_TEMPLATE);
  assert.ok(legendaryById(WAYFARER_SIGNET_ID));

  const strideRec = player.spells ? null : null;
  const strideModRec = (await import('../../src/systems/mods/modDataSync.js')).getModSpellRecord(WAYFARER_STRIDE_SPELL);
  assert.equal(strideModRec?.effects?.[0]?.type, 10);
  assert.equal(strideModRec?.effects?.[0]?.subType, 9);
  assert.equal(strideModRec?.effects?.[1]?.type, 9);
  assert.equal(strideModRec?.effects?.[1]?.subType, 6);

  // Console command grants tonic (x3), spell, and legendary ring
  const giveFn = commands.get('wayfarer_give');
  assert.equal(typeof giveFn, 'function');
  const giveOut = giveFn([]);
  assert.ok(giveOut.includes('tonic=x3'));
  assert.ok(giveOut.includes('spell=added'));
  assert.ok(giveOut.includes("Wayfarer's Signet"));
  assert.equal(player.spells.some((s) => s.index === WAYFARER_STRIDE_SPELL), true);
  assert.equal(player.items.some((i) => i.legendary === WAYFARER_SIGNET_ID), true);

  // Use tonic -> heals, restores fatigue, consumes 1, shows HUD chip
  const tonicItem = player.items.find((i) => i.templateIndex === WAYFARER_TONIC_TEMPLATE);
  assert.ok(tonicItem);
  assert.equal(tonicItem.stackCount, 3);

  const useFn = itemUseHandler(WAYFARER_TONIC_TEMPLATE);
  assert.equal(typeof useFn, 'function');
  useFn(tonicItem, player.items, { entity: player });

  assert.equal(tonicItem.stackCount, 2);
  assert.equal(player.health, 55);
  assert.equal(player.fatigue, 55);
  assert.ok(getModStatusChips().some((c) => c.key === 'mod:wayfarers-kit:wayfarer'));

  // Tick down 45 seconds -> chip clears
  for (let i = 0; i < 45; i++) emitModEvent('secondTick', { dt: 1 });
  assert.ok(!getModStatusChips().some((c) => c.key === 'mod:wayfarers-kit:wayfarer'));

  // Clean unload
  setModEnabled('wayfarers-kit', false);
  unloadModPlugins();
  syncModData();
  assert.equal(templateByIndex(WAYFARER_TONIC_TEMPLATE), null);
  assert.equal(legendaryById(WAYFARER_SIGNET_ID), null);
  assert.equal(itemUseHandler(WAYFARER_TONIC_TEMPLATE), null);
});

test('Stage 3: file-backed plugin.js with named export const executes without Unexpected token export', async () => {
  resetAll();

  const manifest = JSON.parse(fs.readFileSync('mods/examples/wayfarers-kit/manifest.json', 'utf8'));
  const files = {
    'items.json': fs.readFileSync('mods/examples/wayfarers-kit/items.json', 'utf8'),
    'spells.json': fs.readFileSync('mods/examples/wayfarers-kit/spells.json', 'utf8'),
    'legendaries.json': fs.readFileSync('mods/examples/wayfarers-kit/legendaries.json', 'utf8'),
    'locales.json': fs.readFileSync('mods/examples/wayfarers-kit/locales.json', 'utf8'),
    'plugin.js': fs.readFileSync('mods/examples/wayfarers-kit/plugin.js', 'utf8'),
  };

  const commands = new Map();
  bindModConsoleBridge({
    registerCommand: (name, _desc, _usage, fn) => commands.set(name, fn),
    gateConsoleCommand: () => false,
  });

  const player = { health: 50, maxHealth: 100, fatigue: 50, maxFatigue: 100, items: [], spells: [] };
  setModApiContext({ player });

  registerVirtualMod(manifest, files);
  discoverMods();
  syncModData();
  await loadActiveModPlugins();

  assert.equal(getPluginError('wayfarers-kit'), null);
  assert.equal(typeof commands.get('wayfarer_give'), 'function');
  const out = commands.get('wayfarer_give')([]);
  assert.ok(out.includes('tonic=x3'));
});

test('Stage 3+: returned cleanup(), api.onCleanup(), and api.files.read/readJson', async () => {
  resetAll();
  const cleanups = [];
  let readText = null;
  let readObj = null;
  let traversalBlocked = false;

  registerVirtualMod(
    {
      id: 'cleanup-files-mod',
      name: 'Cleanup & Files',
      enabled: true,
      entry: 'plugin.js',
    },
    {
      'data/note.txt': 'hello dff',
      'data/cfg.json': JSON.stringify({ bonus: 7 }),
      'plugin.js': `
        export default function init(api) {
          api.onCleanup(() => globalThis.__testCleanupLog.push('onCleanup'));
          globalThis.__testRead = {
            txt: api.files.read('data/note.txt'),
            cfg: api.files.readJson('data/cfg.json'),
            bad1: api.files.read('../secret.txt'),
            bad2: api.files.read('/etc/passwd'),
          };
          return function cleanup() {
            globalThis.__testCleanupLog.push('returnedCleanup');
          };
        }
      `,
    },
  );

  globalThis.__testCleanupLog = cleanups;
  try {
    discoverMods();
    syncModData();
    await loadActiveModPlugins();

    assert.equal(getPluginError('cleanup-files-mod'), null);
    readText = globalThis.__testRead.txt;
    readObj = globalThis.__testRead.cfg;
    traversalBlocked = globalThis.__testRead.bad1 === null && globalThis.__testRead.bad2 === null;
    assert.equal(readText, 'hello dff');
    assert.deepEqual(readObj, { bonus: 7 });
    assert.equal(traversalBlocked, true);

    unloadModPlugins();
    assert.deepEqual(cleanups, ['onCleanup', 'returnedCleanup']);
  } finally {
    delete globalThis.__testCleanupLog;
    delete globalThis.__testRead;
  }
});
