import test from 'node:test';
import assert from 'node:assert/strict';

import {
  saveSlot, lastSaveKey, QUICK_SAVE_NAME,
} from '../../src/systems/save/saveSlots.js';
import { SAVE_VERSION } from '../../src/systems/save/save.js';
import {
  deathKeys, quickLoadKeyLabel, drawEnhancedDeath, removeEnhancedDeath,
} from '../../src/ui/enhanced/enhancedDeath.js';
import { DeathScreen } from '../../src/ui/deathScreen.js';
import { bindings } from '../../src/ui/input.js';
import {
  setBinding, clearBinding, resetDefaults,
} from '../../src/systems/inputActions.js';

function makeStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(String(k), String(v)); },
    removeItem(k) { m.delete(k); },
  };
}

function makeSnap(characterName, characterId) {
  return {
    v: SAVE_VERSION,
    name: characterName,
    characterId,
    classicMinutes: 100,
  };
}

function withDom(fn) {
  const mk = (tag) => {
    const n = {
      tag,
      children: [],
      style: { setProperty() {} },
      dataset: {},
      className: '',
      textContent: '',
      hidden: false,
      id: '',
      type: '',
      onclick: null,
      append(...k) { n.children.push(...k); },
      after(k) { n.children.push(k); },
      remove() {},
      setAttribute() {},
      querySelector() { return null; },
      replaceChildren() {},
    };
    return n;
  };
  const saved = globalThis.document;
  globalThis.document = {
    createElement: mk,
    head: mk('head'),
    body: mk('body'),
    getElementById: () => null,
    fonts: { load: () => Promise.resolve() },
  };
  try {
    return fn(globalThis.document);
  } finally {
    removeEnhancedDeath();
    if (saved === undefined) delete globalThis.document;
    else globalThis.document = saved;
  }
}

const findAll = (n, pred, out = []) => {
  if (!n) return out;
  if (pred(n)) out.push(n);
  for (const c of n.children ?? []) findAll(c, pred, out);
  return out;
};

test('lastSaveKey prefers QuickSave, falls back to latest save by realTime', () => {
  const s = makeStorage();
  assert.equal(lastSaveKey('Alaric', s, 'cid-1'), null);

  const manualOld = saveSlot('Alaric', 'Manual 1', makeSnap('Alaric', 'cid-1'), { storage: s, now: 100 });
  const manualNew = saveSlot('Alaric', 'Manual 2', makeSnap('Alaric', 'cid-1'), { storage: s, now: 500 });
  const otherNew = saveSlot('Brisa', 'Other', makeSnap('Brisa', 'cid-2'), { storage: s, now: 900 });
  assert.equal(manualOld.ok && manualNew.ok && otherNew.ok, true);

  // No QuickSave yet -> falls back to current character's latest save by realTime
  assert.equal(lastSaveKey('Alaric', s, 'cid-1'), manualNew.key);

  // With QuickSave -> prefers QuickSave even if older than manualNew
  const qs = saveSlot('Alaric', QUICK_SAVE_NAME, makeSnap('Alaric', 'cid-1'), { storage: s, now: 200 });
  assert.equal(qs.ok, true);
  assert.equal(lastSaveKey('Alaric', s, 'cid-1'), qs.key);

  // Character with no saves of its own -> falls back to mostRecentRestorable
  assert.equal(lastSaveKey('Stranger', s, 'cid-9'), otherNew.key);
});

test('enhanced death screen reads QuickLoad keybind, hides cap when unbound, and triggers onLoad on click', () => {
  const store = bindings();
  try {
    resetDefaults(store);
    assert.equal(quickLoadKeyLabel(store), 'F9');
    assert.deepEqual(
      deathKeys('ENTER end   F11 load', false, false, true).map((k) => ({ key: k.key, word: k.word, action: k.action })),
      [
        { key: 'Enter', word: 'Rise', action: undefined },
        { key: 'F9', word: 'Load last save', action: 'load' },
      ],
    );

    // Rebound to a combo
    setBinding(store, 'LSHIFT+F8', 'QuickLoad', true);
    assert.equal(quickLoadKeyLabel(store), 'LSHIFT + F8');

    let loaded = 0;
    withDom((doc) => {
      const screen = new DeathScreen({
        eyeHeight: 1.6,
        capsuleHeight: 1.8,
        entity: { goldPieces: 0, raceId: 1, gender: 0 },
        online: false,
        offlineRespawn: true,
        onLoad: () => { loaded += 1; },
      });
      drawEnhancedDeath(screen, 1);
      const buttons = findAll(doc.body, (n) => n.tag === 'button' && n.className === 'dth-key');
      assert.equal(buttons.length, 2);
      const loadBtn = buttons[1];
      const caps = findAll(loadBtn, (n) => n.className === 'dth-cap');
      assert.equal(caps.length, 1);
      assert.equal(caps[0].textContent, 'LSHIFT + F8');
      loadBtn.onclick();
      assert.equal(loaded, 1);
    });

    // Unbound QuickLoad -> button still works, keycap square is hidden
    clearBinding(store, 'QuickLoad', true);
    clearBinding(store, 'QuickLoad', false);
    assert.equal(quickLoadKeyLabel(store), null);

    withDom((doc) => {
      const screen = new DeathScreen({
        eyeHeight: 1.6,
        capsuleHeight: 1.8,
        entity: { goldPieces: 0, raceId: 1, gender: 0 },
        online: false,
        offlineRespawn: true,
        onLoad: () => { loaded += 1; },
      });
      drawEnhancedDeath(screen, 1);
      const buttons = findAll(doc.body, (n) => n.tag === 'button' && n.className === 'dth-key');
      assert.equal(buttons.length, 2);
      const loadBtn = buttons[1];
      const caps = findAll(loadBtn, (n) => n.className === 'dth-cap');
      assert.equal(caps.length, 0, 'keycap square hidden when QuickLoad is unbound');
      loadBtn.onclick();
      assert.equal(loaded, 2);
    });
  } finally {
    resetDefaults(store);
  }
});
