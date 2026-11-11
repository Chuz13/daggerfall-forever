import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getPref, setPref, _resetForTests as resetPrefs } from '../../../src/systems/uiPrefs.js';
import { setHudRenown } from '../../../src/ui/hud/hudRenown.js';
import { t, setLocale, _resetTextManagerForTests, loadStringTableCsv, patchLocaleTable } from '../../../src/systems/textManager.js';
import { LOCALE_CATALOG } from '../../../src/systems/localeCatalog.js';
import { whereIs } from '../../../src/ui/settings/settingsMap.js';

beforeEach(() => {
  resetPrefs();
  _resetTextManagerForTests();
  setHudRenown(null);
});

test('Renown toggle setting: mapped in settingsMap under Interface -> HUD', () => {
  const loc = whereIs('port:showRenownBar');
  assert.ok(loc, 'port:showRenownBar must be mapped in settingsMap');
  assert.equal(loc.tab.id, 'interface');
  assert.equal(loc.section.id, 'hud');
});

test('Renown toggle setting: showRenownBar defaults to false (hidden) and persists', () => {
  assert.equal(getPref('showRenownBar'), false, 'showRenownBar must be false by default');

  setPref('showRenownBar', true);
  assert.equal(getPref('showRenownBar'), true, 'showRenownBar must be true after setPref');

  setPref('showRenownBar', false);
  assert.equal(getPref('showRenownBar'), false, 'showRenownBar must be false after toggle off');
});

test('Localization: all 26 catalog locales contain renownBar keys in Port_Strings.csv', () => {
  const REQUIRED_KEYS = [
    'menu.hud.renownBar',
    'menu.hud.renownBarNote',
  ];

  for (const { code } of LOCALE_CATALOG) {
    if (code === 'qps-ploc') continue; // pseudo-locale
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
  assert.equal(t('menu.hud.renownBar', 'Renown bar'), 'Renown bar');
  assert.equal(
    t('menu.hud.renownBarNote', 'Show your Renown level and progress bar under the vitals.'),
    'Show your Renown level and progress bar under the vitals.',
  );

  setLocale('ru');
  assert.equal(t('menu.hud.renownBar', 'Renown bar'), 'Шкала известности');
  assert.equal(
    t('menu.hud.renownBarNote', 'Show your Renown level and progress bar under the vitals.'),
    'Показывать уровень известности и шкалу прогресса под показателями здоровья.',
  );
});

test('Enhanced HUD DOM rendering: renown bar is hidden by default and shown when enabled', async () => {
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

    // Provide renown data (level 5, 25000 XP)
    setHudRenown(() => ({ level: 5, xp: 25000, pending: 0 }));

    // 1. Default: showRenownBar is false -> .hud-renown should NOT have class 'on'
    setPref('showRenownBar', false);
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    const root = document.body.children.find((n) => n.className === 'hud');
    const renownRow = find(root, 'hud-renown');
    assert.ok(renownRow, 'hud-renown row must exist in DOM');
    assert.equal(renownRow.classList.contains('on'), false, 'hud-renown must not have "on" class when showRenownBar is false');

    // 2. Enable: showRenownBar is true -> .hud-renown must have class 'on'
    setPref('showRenownBar', true);
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(renownRow.classList.contains('on'), true, 'hud-renown must have "on" class when showRenownBar is true');

    // 3. Disable again: showRenownBar is false -> .hud-renown must lose 'on'
    setPref('showRenownBar', false);
    drawEnhancedHud(entity, 0, 0, { weapon: null, weaponSheathed: true });
    assert.equal(renownRow.classList.contains('on'), false, 'hud-renown must lose "on" class when toggled off');
  } finally {
    destroyEnhancedHud();
    globalThis.document = prevDoc;
  }
});
