import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChoiceWindow } from '../../src/ui/talkWindow.js';
import { HudText } from '../../src/ui/hud/hudText.js';
import { drawEnhancedChoice, closeEnhancedChoice } from '../../src/ui/enhanced/enhancedDialog.js';

function fakeNode(tag) {
  const n = {
    tagName: tag.toUpperCase(),
    children: [],
    parent: null,
    className: '',
    textContent: '',
    id: '',
    attrs: {},
    listeners: {},
    append(...cs) {
      for (const c of cs) {
        if (c && typeof c === 'object') {
          c.parent = n;
          n.children.push(c);
        }
      }
    },
    setAttribute(k, v) { n.attrs[k] = v; },
    removeAttribute(k) { delete n.attrs[k]; },
    addEventListener(type, fn) { (n.listeners[type] ??= []).push(fn); },
    remove() {
      if (n.parent) {
        n.parent.children.splice(n.parent.children.indexOf(n), 1);
        n.parent = null;
      }
      n.removed = true;
    },
  };
  return n;
}

function fakeDocument() {
  const doc = { createElement: (t) => fakeNode(t) };
  doc.head = fakeNode('head');
  doc.body = fakeNode('body');
  const byId = (n, id) => {
    if (n.id === id) return n;
    for (const c of n.children) {
      const f = byId(c, id);
      if (f) return f;
    }
    return null;
  };
  doc.getElementById = (id) => byId(doc.head, id) ?? byId(doc.body, id);
  return doc;
}

const find = (n, cls, out = []) => {
  if (typeof n.className === 'string' && n.className.split(/\s+/).includes(cls)) out.push(n);
  for (const c of n.children ?? []) find(c, cls, out);
  return out;
};

test('ChoiceWindow keeps window open and presents consequences in header when action notifies', () => {
  const hadDoc = globalThis.document;
  const doc = fakeDocument();
  globalThis.document = doc;

  try {
    const hud = new HudText('choice-test');
    let chosen = false;

    const win = new ChoiceWindow({
      lines: ['The guard demands a toll.'],
      options: [
        {
          code: 'Digit1',
          label: '1 - Pay 50 gold',
          action: () => {
            chosen = true;
            hud.add('Toll paid: 50 gold deducted.');
            hud.add('Guard says: "Move along."');
          },
        },
        {
          code: 'Digit2',
          label: '2 - Refuse',
          action: () => {},
        },
      ],
    });

    assert.equal(win.done, false);
    assert.equal(win.concluded, false);
    assert.equal(win.consequences, null);

    // Pick option 1
    win.input('Digit1');

    assert.equal(chosen, true);
    assert.equal(win.done, false, 'window stays open to show consequences');
    assert.equal(win.concluded, true);
    assert.deepEqual(win.consequences, [
      'Toll paid: 50 gold deducted.',
      'Guard says: "Move along."',
    ]);
    assert.equal(win.options.length, 1);
    assert.equal(win.options[0].code, 'Escape');

    // Enhanced dialog rendering presents consequences header and close button
    const drawn = drawEnhancedChoice(win, win.lines, win.options, doc);
    assert.equal(drawn, true);

    const shell = find(doc.body, 'dlg-choice')[0];
    assert.ok(shell, 'dialog shell created');
    const head = find(shell, 'dlg-head')[0];
    assert.ok(head, 'consequences header rendered');
    assert.equal(head.children.length, 2);
    assert.equal(head.children[0].textContent, 'Toll paid: 50 gold deducted.');
    assert.equal(head.children[1].textContent, 'Guard says: "Move along."');

    // Check close button
    const btns = find(shell, 'dlg-btn');
    assert.equal(btns.length, 1);

    // Dismiss window via Escape or confirm
    win.input('Escape');
    assert.equal(win.done, true, 'window finishes after close input');
  } finally {
    closeEnhancedChoice();
    if (hadDoc === undefined) delete globalThis.document;
    else globalThis.document = hadDoc;
  }
});

test('ChoiceWindow closes immediately when chosen action produces no notifications', () => {
  let chosen = false;
  const win = new ChoiceWindow({
    lines: ['A quiet crossroad.'],
    options: [
      {
        code: 'Digit1',
        label: '1 - Go north',
        action: () => {
          chosen = true;
        },
      },
    ],
  });

  win.input('Digit1');
  assert.equal(chosen, true);
  assert.equal(win.done, true, 'window closes immediately when no notifications were emitted');
  assert.equal(win.consequences, null);
});
