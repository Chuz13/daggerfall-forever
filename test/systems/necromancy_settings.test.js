// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES } from '../../src/ui/settings/settingsMap.js';
import { portPool, restoreTabDefaults, itemChanged } from '../../src/ui/enhanced/enhancedMenu.js';
import { getPref, setPref, PREF_DEFAULTS, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { NecroConfig, PREF_KEYS, CORPSE_REQ_MODES, SOCIAL_LAW_MODES, WITCH_HUNTER_MODES, CAP_MODES } from '../../src/systems/necromancy/necroConfig.js';
import { t, setLocale, patchLocaleTable } from '../../src/systems/textManager.js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function fakeDocument() {
  const make = (tag) => {
    const n = {
      tag, children: [], className: '', textContent: '', title: '', type: '', disabled: false, style: {}, dataset: {}, attrs: {},
      append(...cs) { for (const c of cs) n.children.push(c); }, prepend(...cs) { n.children.unshift(...cs); },
      setAttribute(k, v) { n.attrs[k] = v; }, addEventListener() {}, querySelectorAll: () => [],
      classList: {
        add: (c) => { n.className = `${n.className} ${c}`.trim(); },
        toggle: (c, on) => { const has = n.className.split(/\s+/).includes(c); if (on ?? !has) { if (!has) n.classList.add(c); } else n.className = n.className.split(/\s+/).filter((x) => x !== c).join(' '); },
        contains: (c) => n.className.split(/\s+/).includes(c),
      },
    };
    return n;
  };
  return { createElement: make, createTextNode: (t) => ({ textContent: t }), querySelectorAll: () => [], getElementById: () => null };
}

function withFakeDOM(fn) {
  globalThis.document = fakeDocument();
  globalThis.window = { location: { search: '?touch=1' }, navigator: { maxTouchPoints: 5 }, ontouchstart: null, matchMedia: () => ({ matches: true }) };
  try { return fn(); } finally { delete globalThis.document; delete globalThis.window; }
}

test('NecroSettings: section is present in Gameplay tab with all 7 options', () => {
  const gameplay = CATEGORIES.find((c) => c.id === 'gameplay');
  assert.ok(gameplay, 'Gameplay tab must exist');

  const necroSec = gameplay.sections.find((s) => s.id === 'necromancy');
  assert.ok(necroSec, 'Necromancy section must exist in Gameplay tab');
  assert.equal(necroSec.title, 'Dark Arts & Necromancy');

  const expectedItems = [
    'port:necroEnabled',
    'port:necroCorpseReq',
    'port:necroSocialLaw',
    'port:necroMinionUpkeep',
    'port:necroMinionRebellion',
    'port:necroWitchHunters',
    'port:necroCapMode',
  ];

  assert.deepEqual([...necroSec.items], expectedItems);
});

test('NecroSettings: portPool builds all 7 necromancy rows with correct dataset opt/pref', () => {
  const pool = withFakeDOM(() => portPool());

  const expectedKeys = [
    'necroEnabled',
    'necroCorpseReq',
    'necroSocialLaw',
    'necroMinionUpkeep',
    'necroMinionRebellion',
    'necroWitchHunters',
    'necroCapMode',
  ];

  for (const k of expectedKeys) {
    assert.ok(pool.has(k), `portPool must contain row for ${k}`);
    const row = pool.get(k);
    assert.equal(row.dataset.opt, k);
    assert.equal(row.dataset.pref, k);
  }
});

test('NecroSettings: itemChanged detects preference adjustments and restoreTabDefaults resets them', () => {
  resetPrefs();
  const pool = withFakeDOM(() => portPool());

  assert.equal(itemChanged('port:necroEnabled', pool), false);
  assert.equal(itemChanged('port:necroSocialLaw', pool), false);

  // Alter settings
  setPref(PREF_KEYS.ENABLED, false);
  setPref(PREF_KEYS.SOCIAL_LAW, SOCIAL_LAW_MODES.OFF);

  assert.equal(itemChanged('port:necroEnabled', pool), true, 'necroEnabled should be marked changed');
  assert.equal(itemChanged('port:necroSocialLaw', pool), true, 'necroSocialLaw should be marked changed');

  // Restore defaults for gameplay tab
  const gameplay = CATEGORIES.find((c) => c.id === 'gameplay');
  withFakeDOM(() => restoreTabDefaults(gameplay));

  assert.equal(getPref(PREF_KEYS.ENABLED), PREF_DEFAULTS.necroEnabled);
  assert.equal(getPref(PREF_KEYS.SOCIAL_LAW), PREF_DEFAULTS.necroSocialLaw);
  assert.equal(itemChanged('port:necroEnabled', pool), false);
  assert.equal(itemChanged('port:necroSocialLaw', pool), false);
});

test('NecroSettings: all 26 locale files contain the settings keys', () => {
  const localesDir = join(process.cwd(), 'locales');
  const dirs = readdirSync(localesDir).filter((d) =>
    statSync(join(localesDir, d)).isDirectory(),
  );
  assert.equal(dirs.length, 26);

  const testKeys = [
    'settings.sec.necromancy',
    'menu.necro.enabled.name',
    'menu.necro.corpseReq.physical',
    'menu.necro.socialLaw.hardcore',
    'menu.necro.upkeep.name',
    'menu.necro.rebellion.name',
    'menu.necro.witchHunters.name',
    'menu.necro.capMode.name',
  ];

  for (const dir of dirs) {
    const csvPath = join(localesDir, dir, 'Port_Strings.csv');
    const content = readFileSync(csvPath, 'utf8');
    for (const key of testKeys) {
      assert.ok(
        content.includes(`${key},`),
        `Locale ${dir} must include key ${key}`,
      );
    }
  }
});

test('NecroSettings: localization keys resolve in Russian and English', () => {
  patchLocaleTable('en', 'Port_Strings', Object.entries({
    'settings.sec.necromancy': 'Dark Arts & Necromancy',
    'menu.necro.corpseReq.physical': 'Physical Corpses',
    'menu.necro.socialLaw.hardcore': 'Hardcore (Alarms & Treason)',
  }));

  patchLocaleTable('ru', 'Port_Strings', Object.entries({
    'settings.sec.necromancy': 'Тёмные искусства и некромантия',
    'menu.necro.corpseReq.physical': 'Физические тела',
    'menu.necro.socialLaw.hardcore': 'Хардкор (тревога и измена)',
  }));

  setLocale('en');
  assert.equal(t('settings.sec.necromancy'), 'Dark Arts & Necromancy');
  assert.equal(t('menu.necro.corpseReq.physical'), 'Physical Corpses');
  assert.equal(t('menu.necro.socialLaw.hardcore'), 'Hardcore (Alarms & Treason)');

  // Switch to Russian
  setLocale('ru');
  assert.equal(t('settings.sec.necromancy'), 'Тёмные искусства и некромантия');
  assert.equal(t('menu.necro.corpseReq.physical'), 'Физические тела');
  assert.equal(t('menu.necro.socialLaw.hardcore'), 'Хардкор (тревога и измена)');

  // Reset back to English
  setLocale('en');
});
