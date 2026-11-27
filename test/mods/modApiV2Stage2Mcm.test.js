import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  registerVirtualMod,
  discoverMods,
  getModSettingsSchema,
  getModSetting,
  setModSetting,
  resetModSettings,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import {
  registerVirtualPluginHandler as registerVirtualPlugin,
  loadActiveModPlugins,
  unloadModPlugins,
  getPluginError,
  getAllPluginErrors,
  _resetModPluginLoader,
} from '../../src/systems/mods/modPluginLoader.js';
import {
  getModStatusChips,
  setModMovementState,
  _resetModPluginApi,
} from '../../src/systems/mods/modPluginApi.js';
import { emitModEvent } from '../../src/systems/mods/modEventBus.js';
import { drawModsPane } from '../../src/ui/enhanced/enhancedModsPane.js';

import arcaneInit from '../../mods/examples/arcane-overload/plugin.js';
import stealthInit from '../../mods/examples/stealth-auto-steal/plugin.js';
import flowInit from '../../mods/examples/duelists-flow/plugin.js';

const ALL_26_LOCALES = [
  'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja',
  'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant',
];

class MockElement {
  constructor(tagName, className = '', textContent = '') {
    this.tagName = tagName;
    this.className = className;
    this.textContent = textContent;
    this.children = [];
    this.style = {};
    this.type = '';
    this.checked = false;
    this.value = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.disabled = false;
    this.onclick = null;
    this.onchange = null;
    this.oninput = null;
    this.classList = {
      add: (...cls) => {
        this.className = `${this.className} ${cls.join(' ')}`.trim();
      },
    };
  }
  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === 'string') {
        this.children.push(new MockElement('text', '', n));
      } else if (n) {
        this.children.push(n);
      }
    }
  }
  querySelectorAll(cls) {
    const out = [];
    const target = cls.replace(/^\./, '');
    const visit = (node) => {
      if (node.className && node.className.split(/\s+/).includes(target)) out.push(node);
      for (const c of node.children || []) visit(c);
    };
    visit(this);
    return out;
  }
}

function resetAll() {
  _resetModPluginLoader();
  _resetModPluginApi();
  _resetModRegistry();
}

test('Stage 2 MCM: schema coercion, clamping, appStorage persistence and resetModSettings', () => {
  resetAll();
  const store = new Map();
  const prevShellDesc = Object.getOwnPropertyDescriptor(globalThis, 'daggerShell');
  Object.defineProperty(globalThis, 'daggerShell', {
    configurable: true,
    value: {
      storage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
    },
  });

  try {
    registerVirtualMod({
      id: 'mcm-test',
      name: 'MCM Test',
      enabled: true,
      settings: [
        { key: 'flag', type: 'boolean', default: true },
        { key: 'amount', type: 'number', min: 2, max: 10, step: 2, default: 4 },
        {
          key: 'mode',
          type: 'select',
          options: [
            { value: 'fast', label: 'Fast' },
            { value: 'safe', label: 'Safe' },
          ],
          default: 'fast',
        },
      ],
    });
    discoverMods();

    assert.equal(getModSettingsSchema('mcm-test').length, 3);
    assert.equal(getModSetting('mcm-test', 'flag'), true);
    assert.equal(getModSetting('mcm-test', 'amount'), 4);
    assert.equal(getModSetting('mcm-test', 'mode'), 'fast');

    // Clamp & step snap
    assert.equal(setModSetting('mcm-test', 'amount', 99), 10);
    assert.equal(setModSetting('mcm-test', 'amount', 3), 4);
    assert.equal(setModSetting('mcm-test', 'flag', 'false'), false);
    assert.equal(setModSetting('mcm-test', 'mode', 'invalid'), 'fast');
    assert.equal(setModSetting('mcm-test', 'mode', 'safe'), 'safe');

    // Verify appStorage persistence
    assert.equal(store.get('dagger.mods.mcm-test.setting.amount'), '4');
    assert.equal(store.get('dagger.mods.mcm-test.setting.flag'), 'false');
    assert.equal(store.get('dagger.mods.mcm-test.setting.mode'), 'safe');

    // Reset to defaults
    const defaults = resetModSettings('mcm-test');
    assert.deepEqual(defaults, { flag: true, amount: 4, mode: 'fast' });
    assert.equal(getModSetting('mcm-test', 'flag'), true);
  } finally {
    if (prevShellDesc) Object.defineProperty(globalThis, 'daggerShell', prevShellDesc);
    else delete globalThis.daggerShell;
  }
});

test('Stage 2 MCM: api.settings.get/set/getAll/onChange and plugin error diagnostics', async () => {
  resetAll();
  const changes = [];

  registerVirtualMod({
    id: 'good-mod',
    name: 'Good Mod',
    enabled: true,
    settings: [
      { key: 'power', type: 'number', min: 1, max: 5, step: 1, default: 2 },
      { key: 'active', type: 'boolean', default: true },
    ],
  });
  registerVirtualPlugin('good-mod', (api) => {
    assert.deepEqual(api.settings.getAll(), { power: 2, active: true });
    api.settings.onChange('power', (v, k) => changes.push([k, v]));
    api.settings.set('power', 5);
  });

  registerVirtualMod({
    id: 'broken-mod',
    name: 'Broken Mod',
    enabled: true,
  });
  registerVirtualPlugin('broken-mod', () => {
    throw new Error('Boom during plugin init');
  });

  discoverMods();
  await loadActiveModPlugins();

  assert.deepEqual(changes, [['power', 5]]);
  assert.equal(getPluginError('good-mod'), null);
  assert.equal(getPluginError('broken-mod'), 'Boom during plugin init');
  assert.deepEqual(getAllPluginErrors(), { 'broken-mod': 'Boom during plugin init' });

  unloadModPlugins();
  assert.equal(getPluginError('broken-mod'), null);
});

test('Stage 2 MCM UI: enhancedModsPane renders runtime errors, settings controls & reset', async () => {
  resetAll();
  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement: (tag) => new MockElement(tag),
  };

  let observedPower = 2;
  try {
    registerVirtualMod({
      id: 'ui-mcm-mod',
      name: 'UI MCM Mod',
      enabled: true,
      settings: [
        { key: 'power', type: 'number', label: 'Power', min: 1, max: 10, step: 1, default: 2 },
        { key: 'enabledOpt', type: 'boolean', label: 'Enabled Opt', default: true },
      ],
    });
    registerVirtualPlugin('ui-mcm-mod', (api) => {
      api.settings.onChange('power', (val) => {
        observedPower = val;
      });
    });

    registerVirtualMod({
      id: 'ui-broken-mod',
      name: 'UI Broken Mod',
      enabled: true,
    });
    registerVirtualPlugin('ui-broken-mod', () => {
      throw new Error('Init failed');
    });

    discoverMods();
    await loadActiveModPlugins();

    const body = new MockElement('div');
    const rerender = () => {
      body.children = [];
      drawModsPane(body, rerender);
    };
    drawModsPane(body, rerender);

    const errNodes = body.querySelectorAll('mod-runtime-error');
    assert.equal(errNodes.length, 1);
    assert.ok(errNodes[0].textContent.includes('Init failed'));

    const settingsBtns = body.querySelectorAll('mod-settings-btn');
    assert.equal(settingsBtns.length, 1);

    // Expand settings panel
    settingsBtns[0].onclick();
    const boxes = body.querySelectorAll('mod-settings-box');
    assert.equal(boxes.length, 1);

    const range = body.querySelectorAll('mod-setting-range')[0];
    range.value = '7';
    range.oninput();
    assert.equal(observedPower, 7);
    assert.equal(getModSetting('ui-mcm-mod', 'power'), 7);

    // Reset to defaults
    const resetBtn = body.querySelectorAll('mod-settings-reset')[0];
    resetBtn.onclick();
    assert.equal(observedPower, 2);
    assert.equal(getModSetting('ui-mcm-mod', 'power'), 2);
  } finally {
    globalThis.document = prevDoc;
  }
});

test('Stage 2 MCM reactivity: Arcane Overload, Stealth Auto-Steal, Duelist Flow settings', async () => {
  resetAll();

  const aoManifest = JSON.parse(fs.readFileSync('mods/examples/arcane-overload/manifest.json', 'utf8'));
  const sasManifest = JSON.parse(fs.readFileSync('mods/examples/stealth-auto-steal/manifest.json', 'utf8'));
  const dfManifest = JSON.parse(fs.readFileSync('mods/examples/duelists-flow/manifest.json', 'utf8'));

  sasManifest.enabled = true;
  dfManifest.enabled = true;
  registerVirtualMod(aoManifest);
  registerVirtualPlugin('arcane-overload', arcaneInit);
  registerVirtualMod(sasManifest);
  registerVirtualPlugin('stealth-auto-steal', stealthInit);
  registerVirtualMod(dfManifest);
  registerVirtualPlugin('duelists-flow', flowInit);

  discoverMods();
  await loadActiveModPlugins();

  // Arcane Overload: set maxStacks = 2, cast twice -> overcharged & foot=FREE
  setModSetting('arcane-overload', 'maxStacks', 2);
  emitModEvent('playerCast', {});
  emitModEvent('playerCast', {});
  let chips = getModStatusChips();
  assert.equal(chips.find((c) => c.key === 'mod:arcane-overload:overload')?.foot, 'FREE');

  // Duelist's Flow: hit once -> chip appears, hide via showChip=false -> chip disappears
  emitModEvent('combatAttackResolved', { attacker: { isPlayer: true }, hit: true });
  chips = getModStatusChips();
  assert.ok(chips.some((c) => c.key === 'mod:duelists-flow:flow'));

  // Simulate MCM toggle showChip = false via modRegistry + notify
  const { notifyModSettingChanged } = await import('../../src/systems/mods/modPluginApi.js');
  const nextShow = setModSetting('duelists-flow', 'showChip', false);
  notifyModSettingChanged('duelists-flow', 'showChip', nextShow);
  chips = getModStatusChips();
  assert.ok(!chips.some((c) => c.key === 'mod:duelists-flow:flow'));

  // Stealth Auto-Steal: disable enabledOnCrouch -> crouching does not create chip
  const nextStealth = setModSetting('stealth-auto-steal', 'enabledOnCrouch', false);
  notifyModSettingChanged('stealth-auto-steal', 'enabledOnCrouch', nextStealth);
  setModMovementState({ crouching: true });
  chips = getModStatusChips();
  assert.ok(!chips.some((c) => c.key === 'mod:stealth-auto-steal:autosteal'));
});

test('Stage 2 Locales: all 26 Port_Strings.csv and example mod locales.json have MCM keys', () => {
  for (const loc of ALL_26_LOCALES) {
    const csv = fs.readFileSync(path.join('locales', loc, 'Port_Strings.csv'), 'utf8');
    assert.ok(csv.includes('menu.mods.settings,'), `${loc} missing menu.mods.settings`);
    assert.ok(csv.includes('menu.mods.resetDefaults,'), `${loc} missing menu.mods.resetDefaults`);
    assert.ok(csv.includes('menu.mods.scriptError,'), `${loc} missing menu.mods.scriptError`);
  }

  for (const [mod, keys] of [
    ['arcane-overload', ['ao.cfg.maxStacks', 'ao.cfg.powerPerStack', 'ao.cfg.showChip']],
    ['stealth-auto-steal', ['sas.cfg.enabledOnCrouch', 'sas.cfg.restoreMode', 'sas.cfg.showChip']],
    ['duelists-flow', ['df.cfg.decaySeconds', 'df.cfg.tranceThreshold', 'df.cfg.showChip']],
  ]) {
    const json = JSON.parse(fs.readFileSync(path.join('mods', 'examples', mod, 'locales.json'), 'utf8'));
    for (const loc of ALL_26_LOCALES) {
      for (const k of keys) {
        assert.ok(json[loc]?.[k], `${mod}/locales.json missing ${loc}.${k}`);
      }
    }
  }
});
