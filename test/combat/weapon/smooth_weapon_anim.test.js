import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEATURES, checkFeature } from '../../../src/systems/features.js';
import { whereIs } from '../../../src/ui/settings/settingsMap.js';
import { getPref, setPref, _resetForTests } from '../../../src/systems/uiPrefs.js';
import {
  smoothWeaponConfig,
  analyzeWeaponFrame,
  nextSwingFrame,
  smoothSlide,
  createSmoothTracker,
  drawSmoothedWeapon,
} from '../../../src/combat/weapon/smoothWeaponAnim.js';
import { extendFrameEdges, expandedRectForPad } from '../../../src/combat/weapon/extendEdges.js';
import { WEAPON_TYPES, drawFpsWeapon } from '../../../src/combat/fpsWeapon.js';
import { LEFT_UNARMED_ANIMS } from '../../../src/characters/weaponStates.js';
import { createWeaponWidget } from '../../../src/combat/weapon/weaponWidget.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function makeFrame(w, h, fillFn) {
  const colors = new Uint32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      colors[y * w + x] = fillFn(x, y);
    }
  }
  return { width: w, height: h, colors };
}

const RGBA = (r, g, b, a = 255) => ((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff);

test('Settings contract: feat:smooth-weapon-anim is placed in Combat > Weapons in hand, passes checkFeature, toggles at runtime, and is localized in all 26 locales', () => {
  const loc = whereIs('feat:smooth-weapon-anim');
  assert.ok(loc, 'feat:smooth-weapon-anim must be registered in settingsMap');
  assert.equal(loc.tab.id, 'combat');
  assert.equal(loc.section.id, 'weapons');

  const entry = FEATURES.find((f) => f.id === 'smooth-weapon-anim');
  assert.ok(entry, 'smooth-weapon-anim must exist in FEATURES');
  assert.deepEqual(checkFeature(entry), []);

  _resetForTests();
  try {
    assert.equal(getPref('smoothWeaponAnim'), true, 'enabled by default');
    assert.equal(smoothWeaponConfig('').enabled, true);
    assert.equal(smoothWeaponConfig('?smoothweapon=off').enabled, false);

    setPref('smoothWeaponAnim', false);
    assert.equal(smoothWeaponConfig('').enabled, false);

    setPref('smoothWeaponAnim', true);
    setPref('reducedMotion', true);
    assert.equal(smoothWeaponConfig('').blur, 'off', 'reducedMotion disables motion blur');
  } finally {
    _resetForTests();
  }

  const expectedKeys = [
    'features.smoothWeaponAnim.title',
    'features.smoothWeaponAnim.note',
    'features.smoothWeaponAnim.strength',
    'features.smoothWeaponAnim.strength.subtle',
    'features.smoothWeaponAnim.strength.normal',
    'features.smoothWeaponAnim.strength.full',
    'features.smoothWeaponAnim.start',
    'features.smoothWeaponAnim.blur',
    'features.smoothWeaponAnim.blur.subtle',
    'features.smoothWeaponAnim.blur.strong',
    'features.smoothWeaponAnim.edges',
  ];
  const locales = readdirSync(join(root, 'locales'));
  assert.equal(locales.length, 26);
  for (const lang of locales) {
    const csv = readFileSync(join(root, 'locales', lang, 'Port_Strings.csv'), 'utf8');
    for (const k of expectedKeys) {
      assert.ok(csv.includes(`${k},`), `${lang}/Port_Strings.csv missing ${k}`);
    }
  }
});

test('analyzeWeaponFrame computes bbox, centroid, cut flags, and PCA axis/elongation', () => {
  // Tall vertical blade cut at bottom edge
  const blade = makeFrame(40, 80, (x, y) => (x >= 18 && x <= 21 && y >= 10 ? RGBA(200, 200, 220) : 0));
  const m = analyzeWeaponFrame(blade);
  assert.equal(m.cutB, true);
  assert.equal(m.cutL, false);
  assert.equal(m.cutR, false);
  assert.ok(Math.abs(m.cx - 0.5) < 0.08);
  assert.ok(m.elongation > 0.7, `expected high elongation, got ${m.elongation}`);

  // Diagonal blade cut at right and bottom
  const diag = makeFrame(60, 60, (x, y) => (Math.abs(x - y) <= 2 && x >= 15 ? RGBA(255, 180, 90) : 0));
  const md = analyzeWeaponFrame(diag);
  assert.equal(md.cutR, true);
  assert.equal(md.cutB, true);
  assert.ok(md.elongation > 0.7);
  assert.ok(Math.abs(Math.abs(md.axisAngle) - Math.PI / 4) < 0.25);
});

test('extendFrameEdges returns null when uncut, extends cut sides along slope, and expandedRectForPad preserves content placement', () => {
  const uncut = makeFrame(32, 32, (x, y) => (x >= 10 && x <= 20 && y >= 5 && y <= 25 ? RGBA(100, 150, 200) : 0));
  assert.equal(extendFrameEdges(uncut, analyzeWeaponFrame(uncut)), null);

  // Diagonal handle cut at bottom
  const cut = makeFrame(40, 40, (x, y) => {
    const cx = 10 + y * 0.5;
    return Math.abs(x - cx) <= 2 && y >= 10 ? RGBA(180, 120, 60) : 0;
  });
  const meta = analyzeWeaponFrame(cut);
  assert.equal(meta.cutB, true);
  const ext = extendFrameEdges(cut, meta, { padNative: 10, artWidth: 40, artHeight: 40 });
  assert.ok(ext);
  assert.equal(ext.pad.b, 10);
  assert.equal(ext.width, 40);
  assert.equal(ext.height, 50);
  // Extended bottom rows should contain opaque pixels shifted along slope
  let extOpaque = 0;
  for (let x = 0; x < ext.width; x++) {
    if (((ext.colors[45 * ext.width + x] >>> 24) & 0xff) >= 128) extOpaque++;
  }
  assert.ok(extOpaque >= 3, 'extended rows should carry opaque pixels');

  const rect = { x: 100, y: 120, w: 80, h: 80 };
  const exp = expandedRectForPad(rect, { l: 4, t: 0, r: 0, b: 10 }, 40, 40, false);
  assert.equal(exp.x, 100 - 8);
  assert.equal(exp.w, 88);
  assert.equal(exp.h, 100);

  const expMirrored = expandedRectForPad(rect, { l: 4, t: 0, r: 0, b: 10 }, 40, 40, true);
  assert.equal(expMirrored.x, 100);
  assert.equal(expMirrored.w, 88);
});

test('nextSwingFrame handles forward melee, recoil reverse, LEFT_UNARMED_ANIMS, bow hold, and hold ticks', () => {
  assert.equal(nextSwingFrame({ state: 'Idle', frame: 0, numFrames: 5 }), null);
  assert.equal(nextSwingFrame({ state: 'StrikeDown', frame: 1, numFrames: 5, dir: 1 }), 2);
  assert.equal(nextSwingFrame({ state: 'StrikeDown', frame: 4, numFrames: 5, dir: 1 }), null);
  assert.equal(nextSwingFrame({ state: 'StrikeDown', frame: 2, numFrames: 5, dir: -1 }), 1);
  assert.equal(nextSwingFrame({ state: 'StrikeDown', frame: 0, numFrames: 5, dir: -1 }), null);
  assert.equal(nextSwingFrame({ state: 'StrikeDown', frame: 4, numFrames: 5, dir: 1, hold: 1 }), null);
  assert.equal(nextSwingFrame({ state: 'StrikeUp', frame: 3, numFrames: 7, isBow: true, dir: 1 }), null);
  assert.equal(
    nextSwingFrame({ state: 'StrikeLeft', frame: 4, numFrames: 5, isUnarmed: true, animIndex: 5, dir: 1 }),
    LEFT_UNARMED_ANIMS[5],
  );
});

test('smoothSlide interpolates with soft-clamp, SmoothStart decay, and rigid-only rotation', () => {
  const currMeta = { cx: 0.5, cy: 0.5, minX: 0.4, maxX: 0.6, minY: 0.1, maxY: 0.9, cutL: false, cutR: false, cutB: false, axisAngle: 0, elongation: 0.85 };
  const nextMeta = { ...currMeta, axisAngle: 0.35 };
  const currRect = { x: 200, y: 100, w: 60, h: 100 };
  const nextRect = { x: 140, y: 120, w: 60, h: 100 };
  const prevIdleRect = { x: 240, y: 110, w: 60, h: 100 };
  const cfg = { enabled: true, strength: 1, smoothStart: true, blur: 'subtle', blurTaps: 2, blurAlpha: 0.24, extendEdges: true };

  // At t=0 on first frame, SmoothStart pulls toward prevIdleRect
  const s0 = smoothSlide({
    currRect, currMeta, nextRect, nextMeta, prevIdleRect, prevIdleMeta: currMeta,
    t: 0, isFirstFrame: true, config: cfg, weaponType: WEAPON_TYPES.LongBlade, screenW: 320, screenH: 200,
  });
  assert.ok(s0.rect.x > currRect.x, 'SmoothStart should pull toward idle');
  assert.equal(s0.rotate, null);

  // At t=0.5 rigid sword rotates (clamped <= 10 deg), Flail does not rotate
  const sSword = smoothSlide({
    currRect, currMeta, nextRect, nextMeta,
    t: 0.5, config: cfg, weaponType: WEAPON_TYPES.LongBlade, screenW: 320, screenH: 200,
  });
  assert.ok(sSword.rotate && Math.abs(sSword.rotate.rad) <= (10 * Math.PI) / 180 + 1e-6);

  const sFlail = smoothSlide({
    currRect, currMeta, nextRect, nextMeta,
    t: 0.5, config: cfg, weaponType: WEAPON_TYPES.Flail, screenW: 320, screenH: 200,
  });
  assert.equal(sFlail.rotate, null);
});

test('drawSmoothedWeapon emits motion blur trails without duplicating glow and passes base cut + rotate to glow', () => {
  const quads = [];
  const glows = [];
  const renderer = {
    drawScreenQuad: (tex, dst, src, color, opts) => quads.push({ tex, dst, src, color, opts }),
    drawScreenQuadGlow: (tex, dst, src, glow, frame) => glows.push({ tex, dst, src, glow, frame }),
  };
  const canvas = { width: 320, height: 200 };
  const tracker = createSmoothTracker();
  const cfg = { enabled: true, strength: 1, smoothStart: true, blur: 'subtle', blurTaps: 2, blurAlpha: 0.25, extendEdges: false };
  const glow = { code: 1, level: 1, win: [4, 6, 2], ramp: new Float32Array(12), look: 'fire' };
  const baseRect = { x: 0, y: 100, w: 60, h: 100 };

  drawSmoothedWeapon(renderer, canvas, {
    tex: 't0', rect: { x: 10, y: 100, w: 60, h: 100 }, baseRect, uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
    glow, glowArt: [60, 100], rotate: { rad: 0.1, px: 40, py: 190 }, tracker, config: cfg, attacking: true, dt: 0.016,
  });
  drawSmoothedWeapon(renderer, canvas, {
    tex: 't0', rect: { x: 25, y: 100, w: 60, h: 100 }, baseRect, uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
    glow, glowArt: [60, 100], rotate: { rad: 0.1, px: 55, py: 190 }, tracker, config: cfg, attacking: true, dt: 0.016,
  });

  // 1st call: 1 main quad + 1 glow. 2nd call: 1 trail quad + 1 main quad + 1 glow
  assert.equal(quads.length, 3);
  assert.equal(quads[1].opts?.blend, true);
  assert.equal(glows.length, 2, 'glow must never be duplicated on motion blur trail');
  assert.deepEqual(glows[1].frame.cut, { l: true, r: false });
  assert.equal(glows[1].frame.rotate.rad, 0.1);
});

test('drawFpsWeapon with smoothWeaponAnim disabled draws exact unshifted rect', () => {
  _resetForTests();
  setPref('smoothWeaponAnim', false);
  const quads = [];
  const renderer = {
    drawScreenQuad: (tex, dst) => quads.push(dst),
  };
  const art = {
    weaponType: WEAPON_TYPES.LongBlade,
    anims: [{ Record: 0, NumFrames: 1, FramePerSecond: 10, Alignment: 2, Offset: 0 }, { Record: 1, NumFrames: 5, FramePerSecond: 10, Alignment: 2, Offset: 0 }],
    records: [
      { width: 40, height: 60, frames: ['idle'], meta: [{ cx: 0.5, cy: 0.5, minX: 0, maxX: 1, minY: 0, maxY: 1, cutL: false, cutR: true, cutB: true, axisAngle: 0, elongation: 0.8 }] },
      { width: 50, height: 70, frames: ['s0', 's1'], meta: [{ cx: 0.5, cy: 0.5, minX: 0, maxX: 1, minY: 0, maxY: 1, cutL: false, cutR: false, cutB: false, axisAngle: 0, elongation: 0.8 }, { cx: 0.2, cy: 0.3, minX: 0, maxX: 1, minY: 0, maxY: 1, cutL: false, cutR: false, cutB: false, axisAngle: 0.2, elongation: 0.8 }] },
    ],
  };
  try {
    drawFpsWeapon(renderer, { width: 320, height: 200 }, art, 'StrikeDown', 0, {
      flipHorizontal: false,
      offsetHeight: 0,
      smooth: { t: 0.5, dir: 1, dt: 0.016 },
    });
    assert.deepEqual(quads[0], { x: 270, y: 130, w: 50, h: 70 });
  } finally {
    _resetForTests();
  }
});

test('Regression: Weapon Widget unarmed StrikeLeft advances linearly (isUnarmed: false) toward frame 2, not backward to frame 0', () => {
  assert.equal(nextSwingFrame({ state: 'StrikeLeft', frame: 1, numFrames: 5, isUnarmed: false, dir: 1 }), 2);

  _resetForTests();
  setPref('smoothWeaponAnim', true);
  setPref('smoothWeaponEdges', false);
  const quads = [];
  const renderer = {
    uploadTexture: (_a, rec) => rec,
    drawScreenQuad: (tex, dst) => quads.push({ tex, dst }),
  };
  const canvas = { width: 320, height: 200 };
  const mkMeta = (cx) => ({
    cx,
    cy: 0.5,
    minX: 0.2,
    maxX: 0.8,
    minY: 0.2,
    maxY: 0.8,
    cutL: false,
    cutR: false,
    cutB: false,
    axisAngle: 0,
    elongation: 0.2,
  });
  // Frame 0 is on the right (cx=0.8), frame 1 in the middle (cx=0.5), frame 2 on the left (cx=0.2)
  const art = {
    weaponType: WEAPON_TYPES.Melee,
    anims: [
      { Record: 0, NumFrames: 1, FramePerSecond: 10, Alignment: 2, Offset: 0 },
      { Record: 1, NumFrames: 5, FramePerSecond: 10, Alignment: 1, Offset: 0 },
      { Record: 2, NumFrames: 5, FramePerSecond: 10, Alignment: 1, Offset: 0 },
      { Record: 3, NumFrames: 5, FramePerSecond: 10, Alignment: 1, Offset: 0 },
    ],
    records: [
      { width: 40, height: 60, frames: ['idle'], meta: [mkMeta(0.5)] },
      { width: 40, height: 60, frames: ['d0', 'd1', 'd2', 'd3', 'd4'], meta: [mkMeta(0.5), mkMeta(0.5), mkMeta(0.5), mkMeta(0.5), mkMeta(0.5)] },
      { width: 40, height: 60, frames: ['dl0', 'dl1', 'dl2', 'dl3', 'dl4'], meta: [mkMeta(0.5), mkMeta(0.5), mkMeta(0.5), mkMeta(0.5), mkMeta(0.5)] },
      { width: 100, height: 60, frames: ['l0', 'l1', 'l2', 'l3', 'l4'], meta: [mkMeta(0.8), mkMeta(0.5), mkMeta(0.2), mkMeta(0.2), mkMeta(0.2)] },
    ],
  };

  try {
    const widget = createWeaponWidget({
      settings: () => ({
        enabled: true,
        swing: false,
        ambidexterity: false,
        bob: false,
        offset: false,
        stepTransforms: false,
        inertia: false,
        doubleScale: false,
        trueSize: false,
        recoil: false,
        swingWindup: 0,
        swingRecovery: 0,
        swingSpeed: 1,
        swingAlignmentOverride: false,
        swingRecoveryOverride: false,
        swingNoDaggerRight: false,
        offsetSpeed: 10,
        bobLength: 1,
        bobOffset: 0,
        bobSizeXMod: 1,
        bobSizeYMod: 1,
        moveSmoothSpeed: 1,
        bobSmoothSpeed: 1,
        bobShape: 0,
        bobWhileIdle: false,
        inertiaScale: 0,
        inertiaSpeed: 0,
        inertiaForwardScale: 0,
        inertiaForwardSpeed: 0,
        stepLength: 0,
        stepCondition: 0,
        recoilChance: 0,
        recoilCondition: 0,
        recoilEnvironment: false,
        playMissVFXEntity: false,
        playMissVFXEnvironment: false,
        playMissVFXPos: 0,
        mirrorBows: false,
        mirrorTwoHandedSwords: false,
        mirrorTwoHandedAxes: false,
        mirrorTwoHandedBlunts: false,
        textureScaleFactor: 1,
      }),
      handedness: () => false,
    });
    const machine = { state: 'StrikeLeft', frame: 1, isBow: false, isUnarmed: true };
    const ctx = {
      renderer,
      canvas,
      art,
      weapon: null,
      weaponType: WEAPON_TYPES.Melee,
      material: 0,
      machine,
      sheathed: false,
      usingRightHand: true,
      shown: true,
      thirdPerson: false,
      motion: { grounded: true, standing: true, speedRatio: 0 },
    };
    widget.lateUpdate(0.016, ctx);
    // Advance coroutine to frame 1 with half-tick remaining
    widget._w.weaponState = 3;
    widget._w.currentFrame = 1;
    widget._w.animating = { gen: (function* () {})(), wait: 0.1, waitTotal: 0.2, stepDir: 1, isFirstAttackFrame: false };
    widget.draw(renderer, canvas);
    assert.equal(quads.length, 1);
    // Base center x = 110; frame 2 has cx=0.2 (to the LEFT), frame 0 has cx=0.8 (to the RIGHT).
    // Sliding toward frame 2 must move x < 110!
    assert.ok(quads[0].dst.x < 110, `expected StrikeLeft frame 1 to slide left toward frame 2 (x < 110), got ${quads[0].dst.x}`);
  } finally {
    _resetForTests();
  }
});

test('Regression: Weapon Widget extended-edge textures key by custom texture name rather than weaponType/record/frame', () => {
  _resetForTests();
  setPref('smoothWeaponAnim', true);
  setPref('smoothWeaponEdges', true);
  const uploadedKeys = [];
  const renderer = {
    uploadTexture: (_a, rec) => {
      uploadedKeys.push(rec);
      return rec;
    },
    drawScreenQuad: () => {},
  };
  const solid4x4 = makeFrame(4, 4, () => RGBA(200, 180, 160));
  const cutMeta = analyzeWeaponFrame(solid4x4);
  try {
    const widget = createWeaponWidget({
      handedness: () => false,
      settings: () => ({
        enabled: true,
        swing: false,
        ambidexterity: false,
        bob: false,
        offset: false,
        stepTransforms: false,
        inertia: false,
        doubleScale: false,
        trueSize: false,
        recoil: false,
        swingWindup: 0,
        swingRecovery: 0,
        swingSpeed: 1,
        swingAlignmentOverride: false,
        swingRecoveryOverride: false,
        swingNoDaggerRight: false,
        offsetSpeed: 10,
        bobLength: 1,
        bobOffset: 0,
        bobSizeXMod: 1,
        bobSizeYMod: 1,
        moveSmoothSpeed: 1,
        bobSmoothSpeed: 1,
        bobShape: 0,
        bobWhileIdle: false,
        inertiaScale: 0,
        inertiaSpeed: 0,
        inertiaForwardScale: 0,
        inertiaForwardSpeed: 0,
        stepLength: 0,
        stepCondition: 0,
        recoilChance: 0,
        recoilCondition: 0,
        recoilEnvironment: false,
        playMissVFXEntity: false,
        playMissVFXEnvironment: false,
        playMissVFXPos: 0,
        mirrorBows: false,
        mirrorTwoHandedSwords: false,
        mirrorTwoHandedAxes: false,
        mirrorTwoHandedBlunts: false,
        textureScaleFactor: 1,
      }),
    });
    const art = {
      weaponType: WEAPON_TYPES.LongBlade,
      anims: [
        { Record: 0, NumFrames: 1, FramePerSecond: 10, Alignment: 2, Offset: 0 },
        { Record: 1, NumFrames: 5, FramePerSecond: 10, Alignment: 2, Offset: 0 },
      ],
      records: [
        { width: 4, height: 4, frames: ['idle'], meta: [cutMeta] },
        { width: 4, height: 4, frames: ['s0', 's1', 's2', 's3', 's4'], meta: [cutMeta, cutMeta, cutMeta, cutMeta, cutMeta] },
      ],
    };
    const canvas = { width: 320, height: 200 };
    const baseCtx = {
      renderer,
      canvas,
      art,
      weaponType: WEAPON_TYPES.LongBlade,
      material: 1,
      machine: { state: 'StrikeDown', frame: 1, isBow: false, isUnarmed: false },
      sheathed: false,
      usingRightHand: true,
      shown: true,
      thirdPerson: false,
      motion: { grounded: true, standing: true, speedRatio: 0 },
    };

    // Weapon 1: Steel Longsword (templateIndex 120)
    widget.lateUpdate(0.016, { ...baseCtx, weapon: { templateIndex: 120, material: 1 } });
    widget._w.weaponState = 1;
    widget._w.currentFrame = 1;
    widget._w.animating = { gen: (function* () {})(), wait: 0.1, waitTotal: 0.2, stepDir: 1, isFirstAttackFrame: false };
    widget._w.curCustomTexture = {
      name: 'LONGSWORD.CIF_1-1_Steel',
      tex: 't_longsword',
      width: 4,
      height: 4,
      doubled: false,
      meta: cutMeta,
      src: solid4x4,
      ext: undefined,
    };
    widget.draw(renderer, canvas);

    // Weapon 2: Daedric Katana (templateIndex 121, material 9)
    widget.lateUpdate(0.016, { ...baseCtx, material: 9, weapon: { templateIndex: 121, material: 9 } });
    widget._w.weaponState = 1;
    widget._w.currentFrame = 1;
    widget._w.curCustomTexture = {
      name: 'KATANA.CIF_1-1_Daedric',
      tex: 't_katana',
      width: 4,
      height: 4,
      doubled: false,
      meta: cutMeta,
      src: solid4x4,
      ext: undefined,
    };
    widget.draw(renderer, canvas);

    const extKeys = uploadedKeys.filter((k) => k.endsWith(':ext'));
    assert.deepEqual(extKeys, ['ww:LONGSWORD.CIF_1-1_Steel:ext', 'ww:KATANA.CIF_1-1_Daedric:ext']);
  } finally {
    _resetForTests();
  }
});

test('Regression: analyzeWeaponFrame and extendFrameEdges handle Uint8ClampedArray (toScreenOrder) identically to Uint32Array', () => {
  const w = 16, h = 16;
  const u32 = new Uint32Array(w * h);
  const u8 = new Uint8ClampedArray(w * h * 4);
  for (let y = 4; y < h; y++) {
    for (let x = 6; x <= 10; x++) {
      const i = y * w + x;
      const o = i * 4;
      u8[o] = 0x11; u8[o + 1] = 0x22; u8[o + 2] = 0x33; u8[o + 3] = 0xff;
      u32[i] = (0x11 | (0x22 << 8) | (0x33 << 16) | (0xff << 24)) >>> 0;
    }
  }
  const meta32 = analyzeWeaponFrame({ width: w, height: h, colors: u32 });
  const meta8 = analyzeWeaponFrame({ width: w, height: h, colors: u8 });
  assert.equal(meta8.cutB, true);
  assert.deepEqual(meta8, meta32);

  const ext32 = extendFrameEdges({ width: w, height: h, colors: u32 }, meta32, { artWidth: w, artHeight: h });
  const ext8 = extendFrameEdges({ width: w, height: h, colors: u8 }, meta8, { artWidth: w, artHeight: h });
  assert.ok(ext8 && ext32);
  assert.equal(ext8.width, ext32.width);
  assert.equal(ext8.height, ext32.height);
  assert.deepEqual(ext8.colors, ext32.colors);
});

test('Regression: drawSmoothedWeapon crops UV v1 proportionally when offsetHeight clamps bottom edge padding', () => {
  const calls = [];
  const renderer = {
    drawScreenQuad: (tex, rect, uv) => calls.push({ tex, rect, uv }),
  };
  const canvas = { width: 320, height: 200 };
  const rect = { x: 100, y: 120, w: 64, h: 48 };
  // canvas.height - offsetHeight = 168, rect ends at 168, extended rect adds 20px -> 188, clamped to 48px
  drawSmoothedWeapon(renderer, canvas, {
    tex: 'orig',
    extendedTex: 'ext',
    pad: { l: 0, t: 0, r: 0, b: 20 },
    origSize: [64, 48],
    rect,
    baseRect: rect,
    uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
    offsetHeight: 32,
    attacking: false,
    config: { enabled: true, extendEdges: true, blurTaps: 0, blurAlpha: 0, slideStrength: 1, maxShiftFrac: 0.25, rotateDeg: 6 },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tex, 'ext');
  assert.equal(calls[0].rect.h, 48);
  assert.ok(Math.abs(calls[0].uv.v1 - 48 / 68) < 1e-6, `Expected cropped v1 ~ ${48 / 68}, got ${calls[0].uv.v1}`);
});
