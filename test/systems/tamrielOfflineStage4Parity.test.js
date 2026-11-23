import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  tavernMenu,
  regionMenuDay,
  DRINK_ALCOHOL,
  drinkCategoryFor,
  PROVINCE_MENU_KEY_BY_REGION,
  PROVINCE_TAVERN_DISHES,
  PROVINCE_FOOD_MENUS,
  PROVINCE_TAVERN_DRINKS,
  PROVINCE_DRINK_MENUS,
} from '../../src/systems/survival/tavernMenu.js';
import { CLIMATES } from '../../src/formats/mapsFile.js';
import { paperDollBackground, PROVINCE_BACKGROUND_CHARS } from '../../src/ui/paperDoll.js';
import { dryPixel } from '../../src/systems/naval/harbourBook.js';
import { hasPortFor, setWorldPorts } from '../../src/systems/travel/travelPorts.js';
import { createTravelMapWindow } from '../../src/ui/travel/travelMapDoor.js';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';

function fakeHeldMapDom() {
  let ids = 0;
  const ctxOf = (canvas) => {
    const st = { globalAlpha: 1 };
    return new Proxy({}, {
      get: (_, k) => {
        if (k === 'canvas') return canvas;
        if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
        if (k === 'createImageData' || k === 'getImageData')
          return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w?.width ?? w ?? 1) * (h ?? 1) * 4)), width: w, height: h });
        if (k === 'getLineDash') return () => [];
        return k in st ? st[k] : () => {};
      },
      set: (_, k, v) => {
        st[k] = v;
        return true;
      },
    });
  };
  const node = (tag) => {
    const n = {
      tag,
      id: '',
      children: [],
      style: { setProperty() {} },
      dataset: {},
      classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
      append(...k) { n.children.push(...k); },
      appendChild(k) { n.children.push(k); return k; },
      remove() {},
      addEventListener() {},
      removeEventListener() {},
      setPointerCapture() {},
      querySelector: () => null,
      querySelectorAll: () => [],
      className: '',
      textContent: '',
      title: '',
      attrs: {},
      setAttribute(k, v) { n.attrs[k] = v; },
      getAttribute() { return null; },
      set innerHTML(_v) { n.children = []; },
      get innerHTML() { return ''; },
    };
    if (tag === 'canvas') {
      n.id = `c${++ids}`;
      n.width = 300;
      n.height = 150;
      const c = ctxOf(n);
      n.getContext = () => c;
    }
    return n;
  };
  return {
    createElement: (t) => node(t),
    createElementNS: (t) => node(t),
    createTextNode: (t) => ({ textContent: t }),
    getElementById: () => null,
    head: node('head'),
    body: node('body'),
    addEventListener() {},
    removeEventListener() {},
    fonts: { load: () => ({ then() {} }) },
    baseURI: 'https://h.test/',
  };
}

afterEach(() => {
  _resetForTests();
  setWorldPorts(null);
  delete globalThis.location;
  delete globalThis.document;
  delete globalThis.window;
  delete globalThis.ImageData;
});

test('Stage 4 C1a: province tavern menus (62..70) serve dedicated dishes, drinks, alcohol, categories, and holiday free drinks', () => {
  assert.deepEqual(
    [62, 63, 64, 65, 66, 67, 68, 69, 70].map((r) => regionMenuDay(r, CLIMATES.Woodlands)),
    ['n', 's', 'skyrim', 'morrowind', 'sumurset', 'valenwood', 'elsweyr', 'blackmarsh', 'cyrodiil'],
  );
  assert.equal(Object.keys(PROVINCE_MENU_KEY_BY_REGION).length, 9);

  const uniqueKeys = ['skyrim', 'morrowind', 'sumurset', 'valenwood', 'elsweyr', 'blackmarsh', 'cyrodiil'];
  const regionOfKey = { skyrim: 64, morrowind: 65, sumurset: 66, valenwood: 67, elsweyr: 68, blackmarsh: 69, cyrodiil: 70 };
  const tierSpecs = [
    ['low', 3, 3, 5],
    ['mid', 10, 4, 7],
    ['high', 15, 5, 9],
  ];

  for (const key of uniqueKeys) {
    for (const [tier, quality, expectedFoods, expectedDrinks] of tierSpecs) {
      assert.ok(PROVINCE_TAVERN_DISHES[PROVINCE_FOOD_MENUS[tier][key]], `${key} ${tier} dishes`);
      assert.ok(PROVINCE_TAVERN_DRINKS[PROVINCE_DRINK_MENUS[tier][key]], `${key} ${tier} drinks`);
      const m = tavernMenu({ regionIndex: regionOfKey[key], climateIndex: CLIMATES.Woodlands, quality, hour: 12 });
      assert.equal(m.key, key);
      const foods = m.rows.filter((r) => r.kind === 'food');
      const waters = m.rows.filter((r) => r.kind === 'water');
      const drinks = m.rows.filter((r) => r.kind === 'drink');
      assert.equal(foods.length, expectedFoods, `${key} ${tier} food count`);
      assert.ok(foods.every((f) => f.worth === 240), `${key} ${tier} food worth 240`);
      assert.equal(waters.length, 1, `${key} ${tier} water row`);
      assert.equal(drinks.length, expectedDrinks, `${key} ${tier} drink count`);
      drinks.forEach((dr, i) => {
        assert.equal(dr.strength, DRINK_ALCOHOL[tier][i], `${key} ${tier} drink ${dr.name} alcohol`);
        const cat = drinkCategoryFor(dr.name, dr.strength);
        assert.ok(['milk_juice', 'tea_coffee', 'light_alcohol', 'wine', 'spirits'].includes(cat));
        if (dr.strength === 0) assert.ok(cat === 'milk_juice' || cat === 'tea_coffee', `${dr.name} soft`);
        else assert.ok(cat !== 'milk_juice' && cat !== 'tea_coffee', `${dr.name} alcoholic`);
      });
    }
  }

  // New Life (day 1) free drinks on mid table (last two drinks cost 0)
  const newLife = 405 * 518400 + 20 * 60;
  const skyrimMidDrinks = tavernMenu({ regionIndex: 64, climateIndex: CLIMATES.Mountain, quality: 10, hour: 20, minutes: newLife })
    .rows.filter((r) => r.kind === 'drink')
    .map((r) => r.price);
  assert.deepEqual(skyrimMidDrinks, [2, 4, 4, 6, 8, 0, 0]);

  // Province breakfasts (06:00-10:59) serve regional dishes instead of Iliac Bay Gruel/Bread and Cheese
  const solitudeBreakfast = tavernMenu({ regionIndex: 64, climateIndex: CLIMATES.Mountain, quality: 10, hour: 8 });
  const solitudeFoods = solitudeBreakfast.rows.filter((r) => r.kind === 'food').map((r) => r.name);
  assert.deepEqual(solitudeFoods, ['Warm Barley Porridge', 'Rye Bread and Eidar Cheese']);

  for (const key of uniqueKeys) {
    for (const [tier, quality, expectedFoods] of [['low', 3, 1], ['mid', 10, 2], ['high', 15, 3]]) {
      const bm = tavernMenu({ regionIndex: regionOfKey[key], climateIndex: CLIMATES.Woodlands, quality, hour: 8 });
      const bFoods = bm.rows.filter((r) => r.kind === 'food');
      assert.equal(bFoods.length, expectedFoods, `${key} ${tier} breakfast count`);
      assert.ok(bFoods.every((f) => f.worth === 240), `${key} ${tier} breakfast worth 240`);
      assert.ok(!bFoods.some((f) => f.name === 'Gruel' || f.name === 'Bread and Cheese'), `${key} ${tier} no Bay Gruel/Bread`);
    }
  }

  // Iliac Bay keeps classic breakfast
  const bayBreakfast = tavernMenu({ regionIndex: 17, climateIndex: CLIMATES.Woodlands, quality: 10, hour: 8 });
  assert.deepEqual(bayBreakfast.rows.filter((r) => r.kind === 'food').map((r) => r.name), ['Gruel', 'Bread and Cheese']);
});

test('Stage 4 C1b: Paper Doll province open-road geographic backdrops (62..70)', () => {
  const RACE = 'SCBG00I0.IMG';
  assert.deepEqual(PROVINCE_BACKGROUND_CHARS, {
    62: '0',
    63: '1',
    64: '2',
    65: '3',
    66: '0',
    67: '5',
    68: '1',
    69: '6',
    70: '0',
  });
  for (const r of [62, 63, 64, 65, 66, 67, 68, 69, 70]) {
    assert.equal(
      paperDollBackground(RACE, { enabled: true, region: r }),
      `SCBG0${PROVINCE_BACKGROUND_CHARS[r]}I0.IMG`,
      `region ${r} open road`,
    );
    assert.equal(paperDollBackground(RACE, { enabled: true, region: r, inTown: true }), 'SCBG04I0.IMG');
    assert.equal(paperDollBackground(RACE, { enabled: true, region: r, inDungeon: true }), 'SCBG07I0.IMG');
    assert.equal(paperDollBackground(RACE, { enabled: true, region: r, inGraveyard: true }), 'SCBG08I0.IMG');
    assert.equal(paperDollBackground(RACE, { enabled: false, region: r }), RACE);
  }
  assert.equal(paperDollBackground(RACE, { enabled: true, region: 71 }), RACE);
});

test('Stage 4 C2a: dryPixel works beyond the Iliac Bay on tamriel ground without pixel-id collisions', () => {
  const mkWoods = (isTamrielGround) => {
    const heightAt = (x, y) => (x === 1569 && y === -430 ? 40 : x === 1569 && y === -450 ? 0 : 40);
    return {
      isTamrielGround,
      getHeightMapValuesRange1Dim: (x0, y0, dim) => {
        const out = new Uint8Array(dim * dim);
        for (let r = 0; r < dim; r++) for (let c = 0; c < dim; c++) out[r + c * dim] = heightAt(x0 + r, y0 + c);
        return out;
      },
      getLargeHeightMapValuesRange: (_x0, _y0, dim) => new Uint8Array(dim * 3 * dim * 3),
    };
  };

  const bayOnly = mkWoods(false);
  assert.equal(dryPixel(bayOnly, -1, 10), false);
  assert.equal(dryPixel(bayOnly, 1569, -430), false);

  let sampleCalls = 0;
  const tamriel = mkWoods(true);
  const origRange = tamriel.getHeightMapValuesRange1Dim;
  tamriel.getHeightMapValuesRange1Dim = (...args) => {
    sampleCalls++;
    return origRange(...args);
  };

  assert.equal(dryPixel(tamriel, 1569, -430), true, 'dry province land');
  assert.equal(dryPixel(tamriel, 1569, -450), false, 'province sea');
  assert.equal(dryPixel(tamriel, 99999, 0), false, 'outside WORLD_PIXEL_SPAN');
  // (569, -429) would collide with (1569, -430) under py * 1000 + px: verify no collision and memo hit on repeat
  const callsAfterTwo = sampleCalls;
  assert.equal(dryPixel(tamriel, 1569, -430), true, 'memo hit');
  assert.equal(sampleCalls, callsAfterTwo);
  assert.equal(dryPixel(tamriel, 569, -429), true);
  assert.equal(sampleCalls, callsAfterTwo + 1, 'distinct worldPixelKey for 569,-429 vs 1569,-430');
});

test('Stage 4 C2b: pixelBuild livingTown uses hasPortFor for Tamriel ports', () => {
  const pb = readFileSync(new URL('../../src/scenes/pixelBuild.js', import.meta.url), 'utf8');
  assert.match(pb, /import \{ hasPortFor \} from '\.\.\/systems\/travel\/travelPorts\.js';/);
  assert.match(pb, /port: hasPortFor\(dfLocation\.mapTableData\?\.mapId\)/);
  assert.doesNotMatch(pb, /hasPort\(/);

  const SOLITUDE_ID = 0x0a77a001;
  assert.equal(hasPortFor(SOLITUDE_ID), false);
  setWorldPorts((id) => id === SOLITUDE_ID);
  assert.equal(hasPortFor(SOLITUDE_ID), true);
});

test('Stage 4 Classic UI fallback: opens HeldMapWindow outside Iliac Bay when DOM and tamrielMapOn are active', () => {
  const baseDeps = (px, py) => ({
    getPlayerPixel: () => ({ x: px, y: py }),
    getClimateIndex: () => CLIMATES.Mountain,
    woods: { heightMapBuffer: new Uint8Array(500000).fill(10) },
    mapSize: { width: 1000, height: 500 },
    gold: () => 0,
    goldPieces: () => 0,
    hasHorse: false,
    hasCart: false,
    hasShip: false,
    diseaseCount: () => 0,
    poisonCount: () => 0,
  });

  // Headless (no document): stays null
  globalThis.location = { search: '?skin=classic' };
  assert.equal(createTravelMapWindow(baseDeps(1569, -430)), null);

  // With DOM: classic skin outside Bay opens HeldMapWindow; inside Bay stays classic (null without art)
  globalThis.document = fakeHeldMapDom();
  globalThis.window = { addEventListener() {}, removeEventListener() {}, innerWidth: 1600, innerHeight: 900, devicePixelRatio: 1 };
  globalThis.ImageData = class {
    constructor(d, w, h) {
      this.data = d;
      this.width = w;
      this.height = h;
    }
  };

  const outside = createTravelMapWindow(baseDeps(1569, -430));
  assert.ok(outside && outside.constructor.name === 'HeldMapWindow', 'classic skin outside Bay falls back to HeldMapWindow');
  outside.dispose?.();

  assert.equal(createTravelMapWindow(baseDeps(207, 213)), null, 'classic skin inside Bay keeps classic window');

  // Enhanced skin with heldMap=false behaves identically
  globalThis.location = { search: '?skin=enhanced' };
  setPref('heldMap', false);
  const enhancedOffOutside = createTravelMapWindow(baseDeps(1569, -430));
  assert.ok(enhancedOffOutside && enhancedOffOutside.constructor.name === 'HeldMapWindow');
  enhancedOffOutside.dispose?.();
  assert.equal(createTravelMapWindow(baseDeps(207, 213)), null);

  // tamrielMap=false disables past-Bay fallback
  setPref('tamrielMap', false);
  assert.equal(createTravelMapWindow(baseDeps(1569, -430)), null);
});
