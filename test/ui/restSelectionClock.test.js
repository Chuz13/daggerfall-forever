import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RestWindow } from '../../src/ui/restWindow.js';
import { CLASSIC_GAME_START_TIME, MINUTES_PER_DAY } from '../../src/systems/gameDate.js';

function mkEl(tag) {
  const node = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    style: {},
    children: [],
    append(...kids) {
      for (const k of kids) {
        if (k && typeof k === 'object') {
          k.parentNode = node;
          node.children.push(k);
        }
      }
    },
    replaceChildren(...kids) {
      node.children = [];
      node.append(...kids);
    },
    remove() {
      const i = node.parentNode?.children.indexOf(node);
      if (i >= 0) node.parentNode.children.splice(i, 1);
    },
    focus() {},
    select() {},
    set innerHTML(_v) {
      node.children = [];
    },
    get innerHTML() {
      return '';
    },
  };
  return node;
}

const walk = (n, out = []) => {
  out.push(n);
  for (const k of n.children ?? []) walk(k, out);
  return out;
};

const byClass = (n, cls) => walk(n).filter((x) => String(x.className).split(' ').includes(cls));
const button = (n, label) => walk(n).find((x) => x.tagName === 'BUTTON' && x.textContent === label);

async function withEnhancedRest(depsOver, fn) {
  const prevD = globalThis.document;
  const prevW = globalThis.window;
  const prevRaf = globalThis.requestAnimationFrame;
  globalThis.document = {
    createElement: mkEl,
    getElementById: () => null,
    head: mkEl('head'),
    body: mkEl('body'),
    addEventListener() {},
    removeEventListener() {},
    pointerLockElement: null,
    exitPointerLock() {},
    querySelector: () => null,
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = () => 0;
  try {
    const { mountEnhancedRest } = await import('../../src/ui/enhanced/enhancedRest.js');
    const host = mkEl('div');
    const deps = {
      setResting() {},
      setLoitering() {},
      vitals: () => ({ health: 10, maxHealth: 20, fatigue: 10, magicka: 10 }),
      tickVitals: () => false,
      fullyHealed: () => false,
      dead: () => false,
      enemiesNearby: () => false,
      advanceMinutes() {},
      endLines: (id) => [`text ${id}`],
      say() {},
      ...depsOver,
    };
    const overlay = mountEnhancedRest(host, deps);
    await fn({ host, overlay });
  } finally {
    globalThis.document = prevD;
    globalThis.window = prevW;
    globalThis.requestAnimationFrame = prevRaf;
  }
}

const classicDeps = (over = {}) => ({
  advanceMinutes() {},
  tickVitals: () => false,
  fullyHealed: () => false,
  enemiesNearby: () => false,
  dead: () => false,
  endLines: (id) => [`text:${id}`],
  ...over,
});

test('enhanced rest selection card shows current time when minutes are available', async () => {
  await withEnhancedRest({ nowMinutes: () => CLASSIC_GAME_START_TIME }, async ({ host }) => {
    const card = byClass(host, 'card')[0];
    assert.deepEqual(
      card.children.map((n) => n.className || n.tagName),
      ['H2', 'clock-line selection-clock', 'acts selection-acts'],
    );
    assert.equal(byClass(host, 'selection-clock')[0].textContent, 'Current time 13:30');
  });

  await withEnhancedRest({ nowMinutes: () => MINUTES_PER_DAY * 2 + 5 }, async ({ host }) => {
    assert.equal(byClass(host, 'selection-clock')[0].textContent, 'Current time 00:05');
  });

  let mins = CLASSIC_GAME_START_TIME;
  await withEnhancedRest({ nowMinutes: () => mins }, async ({ host }) => {
    assert.equal(byClass(host, 'selection-clock')[0].textContent, 'Current time 13:30');
    button(host, 'Loiter').onclick();
    mins += 45;
    button(host, 'Back').onclick();
    assert.equal(byClass(host, 'selection-clock')[0].textContent, 'Current time 14:15');
  });

  await withEnhancedRest(
    { sharedMinutes: () => CLASSIC_GAME_START_TIME + 60, nowMinutes: () => CLASSIC_GAME_START_TIME },
    async ({ host }) => {
      assert.equal(byClass(host, 'selection-clock')[0].textContent, 'Current time 14:30');
    },
  );

  await withEnhancedRest({}, async ({ host }) => {
    assert.equal(byClass(host, 'selection-clock').length, 0);
  });
});

test('classic RestWindow selection screen shows current time without changing status()', () => {
  const startWin = new RestWindow(classicDeps({ nowMinutes: () => CLASSIC_GAME_START_TIME }));
  assert.deepEqual(startWin.status(), { panel: 'main' });
  assert.deepEqual(startWin.selectionLines(), [
    'How would you like to rest?',
    'Current time 13:30',
    '',
    '1. Rest for a while',
    '2. Rest until healed',
    '3. Loiter',
    '',
    'Esc - never mind',
  ]);

  const paddedWin = new RestWindow(classicDeps({ nowMinutes: () => MINUTES_PER_DAY * 3 + 5 }));
  assert.equal(paddedWin.selectionLines()[1], 'Current time 00:05');

  const sharedWin = new RestWindow(
    classicDeps({ sharedMinutes: () => CLASSIC_GAME_START_TIME + 60, nowMinutes: () => CLASSIC_GAME_START_TIME }),
  );
  assert.equal(sharedWin.selectionLines()[1], 'Current time 14:30');

  const noClockWin = new RestWindow(classicDeps());
  assert.deepEqual(noClockWin.selectionLines(), [
    'How would you like to rest?',
    '',
    '1. Rest for a while',
    '2. Rest until healed',
    '3. Loiter',
    '',
    'Esc - never mind',
  ]);
});
