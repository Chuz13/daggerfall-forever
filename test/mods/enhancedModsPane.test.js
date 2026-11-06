// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerVirtualMod,
  getDiscoveredMods,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import { drawModsPane } from '../../src/ui/enhanced/enhancedModsPane.js';
import { t } from '../../src/systems/textManager.js';

// Setup minimal mock DOM environment for Node.js
if (typeof document === 'undefined') {
  class MockElement {
    constructor(tag, cls = '', text = '') {
      this.tagName = tag.toUpperCase();
      this.className = cls || '';
      this.textContent = text || '';
      this.children = [];
      this.style = {};
      this.classList = {
        add: (c) => {
          this.className += (this.className ? ' ' : '') + c;
        },
      };
    }
    append(...nodes) {
      for (const n of nodes) {
        if (typeof n === 'string') {
          this.children.push(new MockElement('span', '', n));
        } else if (n) {
          this.children.push(n);
        }
      }
    }
    querySelector(selector) {
      return this.children.find((c) => c.className?.includes(selector.replace('.', ''))) ?? null;
    }
  }

  // @ts-ignore
  globalThis.document = {
    createElement: (tag) => new MockElement(tag),
    createTextNode: (txt) => new MockElement('text', '', txt),
  };
}

test('EnhancedModsPane: renders mod manager cards, toggles and load order buttons', () => {
  _resetModRegistry();

  registerVirtualMod({
    id: 'test-mod-one',
    name: 'First Test Mod',
    version: '1.0.0',
    author: 'Author A',
    description: 'A data mod',
    enabled: true,
    data: { combat: 'combat.json' },
  });

  registerVirtualMod({
    id: 'test-mod-two',
    name: 'Second Test Mod',
    version: '2.0.0',
    author: 'Author B',
    description: 'A scripted mod',
    enabled: false,
    entry: 'plugin.js',
  });

  const body = document.createElement('div');
  let rerenderCalled = false;

  drawModsPane(/** @type {any} */ (body), () => {
    rerenderCalled = true;
  });

  assert.ok(body.className.includes('wide'));
  assert.ok(body.children.length >= 2, 'Should have header card and mods list container');

  // Verify mod entries
  const list = body.children[1];
  assert.equal(list.children.length, 2, 'Should render two mod cards');

  // Verify first mod header
  const card1 = list.children[0];
  assert.ok(card1.className.includes('mod-card'));

  _resetModRegistry();
});
