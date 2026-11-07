import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { formatVitalValue, HUD_VITALS_MODES, vitalsModeNow } from '../../../src/ui/enhanced/enhancedHud.js';
import { getPref, setPref, _resetForTests as resetPrefs } from '../../../src/systems/uiPrefs.js';
import { FATIGUE_MULTIPLIER } from '../../../src/systems/statMods.js';
import { t, setLocale, _resetTextManagerForTests, loadStringTableCsv, patchLocaleTable } from '../../../src/systems/textManager.js';
import { LOCALE_CATALOG } from '../../../src/systems/localeCatalog.js';

beforeEach(() => {
  resetPrefs();
  _resetTextManagerForTests();
});

test('Enhanced HUD vitals display modes: formatVitalValue handles percent, currentMax, and combo modes', () => {
  // Percent mode
  assert.equal(formatVitalValue(100, 100, 'health', 'percent'), '100%');
  assert.equal(formatVitalValue(50, 100, 'health', 'percent'), '50%');
  assert.equal(formatVitalValue(0, 100, 'health', 'percent'), '0%');
  assert.equal(formatVitalValue(1, 1000, 'health', 'percent'), '1%'); // never 0% while > 0

  // CurrentMax mode - health & magicka
  assert.equal(formatVitalValue(100, 100, 'health', 'currentMax'), '100 / 100');
  assert.equal(formatVitalValue(45, 100, 'health', 'currentMax'), '45 / 100');
  assert.equal(formatVitalValue(0, 100, 'health', 'currentMax'), '0 / 100');
  assert.equal(formatVitalValue(0, 0, 'magicka', 'currentMax'), '0 / 0');

  // CurrentMax mode - fatigue (scaled by FATIGUE_MULTIPLIER = 64)
  assert.equal(formatVitalValue(6400, 6400, 'fatigue', 'currentMax'), '100 / 100');
  assert.equal(formatVitalValue(3200, 6400, 'fatigue', 'currentMax'), '50 / 100');
  assert.equal(formatVitalValue(0, 6400, 'fatigue', 'currentMax'), '0 / 100');
  assert.equal(formatVitalValue(10, 6400, 'fatigue', 'currentMax'), '1 / 100'); // never 0 while > 0

  // Combo mode
  assert.equal(formatVitalValue(100, 100, 'health', 'combo'), '100 / 100 (100%)');
  assert.equal(formatVitalValue(50, 100, 'health', 'combo'), '50 / 100 (50%)');
  assert.equal(formatVitalValue(0, 100, 'health', 'combo'), '0 / 100 (0%)');
  assert.equal(formatVitalValue(3200, 6400, 'fatigue', 'combo'), '50 / 100 (50%)');
});

test('Enhanced HUD vitals display setting: hudVitalsMode preference and vitalsModeNow', () => {
  assert.deepEqual(HUD_VITALS_MODES, ['percent', 'currentMax', 'combo']);
  assert.equal(getPref('hudVitalsMode'), 'percent');
  assert.equal(vitalsModeNow(), 'percent');

  setPref('hudVitalsMode', 'currentMax');
  assert.equal(vitalsModeNow(), 'currentMax');

  setPref('hudVitalsMode', 'combo');
  assert.equal(vitalsModeNow(), 'combo');

  // Invalid preference falls back to percent
  setPref('hudVitalsMode', 'invalid');
  assert.equal(vitalsModeNow(), 'percent');
});

test('Localization: all 26 catalog locales contain the vitalsMode keys in Port_Strings.csv', () => {
  const REQUIRED_KEYS = [
    'menu.hud.vitalsMode',
    'menu.hud.vitalsModeNote',
    'menu.hud.vitalsModePercent',
    'menu.hud.vitalsModeCurrentMax',
    'menu.hud.vitalsModeCombo',
  ];

  for (const { code } of LOCALE_CATALOG) {
    if (code === 'qps-ploc') continue; // pseudo-locale is dynamically generated
    const csvPath = join(process.cwd(), 'locales', code, 'Port_Strings.csv');
    assert.ok(existsSync(csvPath), `Port_Strings.csv must exist for ${code}`);
    const content = readFileSync(csvPath, 'utf8');
    const rows = loadStringTableCsv(content);
    const map = new Map(rows);
    for (const key of REQUIRED_KEYS) {
      assert.ok(map.has(key), `Locale ${code} must define ${key}`);
      assert.ok(map.get(key).length > 0, `Locale ${code} must have non-empty value for ${key}`);
    }
  }
});

test('Localization: Russian and English strings resolve properly via textManager', () => {
  const enCsv = readFileSync(join(process.cwd(), 'locales', 'en', 'Port_Strings.csv'), 'utf8');
  patchLocaleTable('en', 'Port_Strings', loadStringTableCsv(enCsv));
  const ruCsv = readFileSync(join(process.cwd(), 'locales', 'ru', 'Port_Strings.csv'), 'utf8');
  patchLocaleTable('ru', 'Port_Strings', loadStringTableCsv(ruCsv));

  setLocale('en');
  assert.equal(t('menu.hud.vitalsMode', 'Status bars display'), 'Status bars display');
  assert.equal(t('menu.hud.vitalsModePercent', 'Percentage'), 'Percentage');
  assert.equal(t('menu.hud.vitalsModeCurrentMax', 'Current / Max'), 'Current / Max');
  assert.equal(t('menu.hud.vitalsModeCombo', 'Combo'), 'Combo');

  setLocale('ru');
  assert.equal(t('menu.hud.vitalsMode', 'Status bars display'), 'Отображение показателей');
  assert.equal(t('menu.hud.vitalsModePercent', 'Percentage'), 'Проценты');
  assert.equal(t('menu.hud.vitalsModeCurrentMax', 'Current / Max'), 'Текущее / Макс');
  assert.equal(t('menu.hud.vitalsModeCombo', 'Combo'), 'Комбо');
});

test('Enhanced HUD DOM rendering: vitals bar text updates correctly per mode', async () => {
  const mkEl = () => ({
    className: '', textContent: '', id: '', rel: '', href: '', src: '', alt: '', children: [], dataset: {},
    style: { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } },
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, on) { if (on === undefined) on = !this._s.has(c); if (on) this._s.add(c); else this._s.delete(c); return on; }, contains(c) { return this._s.has(c); },
    },
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    removeAttribute(a) { delete this.attrs[a]; this[a] = ''; }, remove() {},
    append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); return c; },
    replaceChildren(...c) { this.children = c; }, addEventListener(type, fn) { (this._on ??= {})[type] = fn; },
    removeEventListener() {},
  });

  const prevDoc = globalThis.document;
  globalThis.document = {
    createElement: mkEl,
    createElementNS: (ns) => Object.assign(mkEl(), { ns }),
    getElementById: () => null,
    head: mkEl(),
    body: mkEl(),
  };

  const { drawEnhancedHud, destroyEnhancedHud } = await import('../../../src/ui/enhanced/enhancedHud.js');
  const entity = { health: 60, maxHealth: 100, magicka: 30, maxMagicka: 50, fatigue: 3200, items: [], equip: { slots: {} }, lightSource: null, stats: { strength: 50, endurance: 50 } };

  try {
    const find = (node, cls) => {
      if (String(node.className ?? '').split(/\s+/).includes(cls)) return node;
      for (const c of node.children ?? []) { const got = find(c, cls); if (got) return got; }
      return null;
    };

    // 1. Percent mode (default)
    setPref('hudVitalsMode', 'percent');
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    const root = document.body.children.find((n) => n.className === 'hud');
    const healthVital = find(root, 'hud-health');
    const healthNum = find(healthVital, 'hud-num');
    assert.equal(healthNum.textContent, '60%');

    // 2. CurrentMax mode
    setPref('hudVitalsMode', 'currentMax');
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(healthNum.textContent, '60 / 100');

    // 3. Combo mode
    setPref('hudVitalsMode', 'combo');
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(healthNum.textContent, '60 / 100 (60%)');
  } finally {
    destroyEnhancedHud();
    globalThis.document = prevDoc;
  }
});

