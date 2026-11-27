// Smooth Weapon Animation: sub-frame interpolation, SmoothStart, procedural
// edge extension, soft rigid-weapon PCA rotation, and multi-tap motion blur
// for all 2D first-person weapon lanes (classic, Weapon Widget, Two-Hands,
// Diverse Weapons). Preserves classic frame timing and hit frames 1:1.
// Inspired by "Smooth Weapon Animation" by Seluje (https://www.nexusmods.com/daggerfallunity/mods/1422);
// independent clean-room implementation written from scratch for Daggerfall Forever.

import { getPref } from '../../systems/uiPrefs.js';
import { pageParam } from '../../systems/pageQuery.js';
import { WEAPON_TYPES } from '../fpsWeapon.js';
import { BOW_DRAWN_HOLD_FRAME, LEFT_UNARMED_ANIMS } from '../../characters/weaponStates.js';
import { expandedRectForPad } from './extendEdges.js';

export const STRENGTH_VALUES = Object.freeze({
  subtle: 0.5,
  normal: 0.85,
  full: 1.0,
});

export const BLUR_CONFIG = Object.freeze({
  off: Object.freeze({ taps: 0, alpha: 0 }),
  subtle: Object.freeze({ taps: 2, alpha: 0.24 }),
  strong: Object.freeze({ taps: 3, alpha: 0.36 }),
});

const MAX_ROT_RAD = (10 * Math.PI) / 180;
const ELONGATION_MIN = 0.45;
const TRAIL_SLOTS = 3;
const ALPHA_THRESHOLD = 128;

let _rigidRotateTypes = null;
export function isRigidRotateType(weaponType) {
  if (!_rigidRotateTypes) {
    _rigidRotateTypes = new Set([
      WEAPON_TYPES.LongBlade,
      WEAPON_TYPES.LongBlade_Magic,
      WEAPON_TYPES.Dagger,
      WEAPON_TYPES.Dagger_Magic,
      WEAPON_TYPES.Staff,
      WEAPON_TYPES.Staff_Magic,
      WEAPON_TYPES.Mace,
      WEAPON_TYPES.Mace_Magic,
      WEAPON_TYPES.Warhammer,
      WEAPON_TYPES.Warhammer_Magic,
      WEAPON_TYPES.Battleaxe,
      WEAPON_TYPES.Battleaxe_Magic,
    ]);
  }
  return _rigidRotateTypes.has(weaponType);
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const softClamp = (v, max) => (max > 0 ? max * Math.tanh(v / max) : 0);

/** Read live Smooth Weapon Animation settings (never cached at module load). */
export function smoothWeaponConfig(search = globalThis.location?.search ?? '') {
  const enabled = !!getPref('smoothWeaponAnim') && pageParam('smoothweapon', search) !== 'off';
  const strengthKey = getPref('smoothWeaponStrength');
  const strength = STRENGTH_VALUES[strengthKey] ?? STRENGTH_VALUES.normal;
  const smoothStart = !!getPref('smoothWeaponStart');
  const reducedMotion = !!getPref('reducedMotion');
  const rawBlur = getPref('smoothWeaponBlur');
  const blur = reducedMotion ? 'off' : BLUR_CONFIG[rawBlur] ? rawBlur : 'subtle';
  const blurSpec = BLUR_CONFIG[blur];
  const extendEdges = !!getPref('smoothWeaponEdges');
  return {
    enabled,
    strength,
    smoothStart,
    blur,
    blurTaps: blurSpec.taps,
    blurAlpha: blurSpec.alpha,
    extendEdges,
  };
}

/**
 * Single-pass pixel analysis of a Color32 frame (top-first RGBA Uint32Array).
 * Computes normalized bbox, centroid, cut-edge flags, and PCA major axis.
 */
export function analyzeWeaponFrame(c32) {
  const w = c32?.width | 0;
  const h = c32?.height | 0;
  const colors = c32?.colors;
  if (!(w > 0) || !(h > 0) || !colors?.length) {
    return { cx: 0.5, cy: 0.5, minX: 0, maxX: 1, minY: 0, maxY: 1, cutL: false, cutR: false, cutB: false, axisAngle: 0, elongation: 0 };
  }
  const isBytes = colors instanceof Uint8Array || colors instanceof Uint8ClampedArray || colors.length === w * h * 4;
  if (!isBytes && colors.length < w * h) {
    return { cx: 0.5, cy: 0.5, minX: 0, maxX: 1, minY: 0, maxY: 1, cutL: false, cutR: false, cutB: false, axisAngle: 0, elongation: 0 };
  }
  const alphaAt = isBytes ? (idx) => colors[idx * 4 + 3] : (idx) => (colors[idx] >>> 24) & 0xff;
  const stride = Math.max(1, Math.floor(Math.max(w, h) / 160));
  let count = 0;
  let sumX = 0,
    sumY = 0;
  let minX = w,
    maxX = -1,
    minY = h,
    maxY = -1;

  for (let y = 0; y < h; y += stride) {
    const row = y * w;
    for (let x = 0; x < w; x += stride) {
      if (alphaAt(row + x) < ALPHA_THRESHOLD) continue;
      count++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // Exact border scan (stride 1) for cut-edge detection
  let bL = 0,
    bR = 0,
    bB = 0;
  for (let y = 0; y < h; y++) {
    if (alphaAt(y * w) >= ALPHA_THRESHOLD) bL++;
    if (alphaAt(y * w + (w - 1)) >= ALPHA_THRESHOLD) bR++;
  }
  const botRow = (h - 1) * w;
  for (let x = 0; x < w; x++) {
    if (alphaAt(botRow + x) >= ALPHA_THRESHOLD) bB++;
  }
  const cutL = bL >= 2;
  const cutR = bR >= 2;
  const cutB = bB >= 2;

  if (count === 0) {
    return { cx: 0.5, cy: 0.5, minX: 0, maxX: 1, minY: 0, maxY: 1, cutL, cutR, cutB, axisAngle: 0, elongation: 0 };
  }

  const meanX = sumX / count;
  const meanY = sumY / count;
  let mxx = 0,
    myy = 0,
    mxy = 0;
  for (let y = 0; y < h; y += stride) {
    const row = y * w;
    const dy = y - meanY;
    for (let x = 0; x < w; x += stride) {
      if (alphaAt(row + x) < ALPHA_THRESHOLD) continue;
      const dx = x - meanX;
      mxx += dx * dx;
      myy += dy * dy;
      mxy += dx * dy;
    }
  }
  mxx /= count;
  myy /= count;
  mxy /= count;

  const trace = mxx + myy;
  const diff = mxx - myy;
  const disc = Math.sqrt(Math.max(0, diff * diff + 4 * mxy * mxy));
  const l1 = (trace + disc) * 0.5;
  const l2 = (trace - disc) * 0.5;
  const elongation = l1 + l2 > 1e-6 ? clamp((l1 - l2) / (l1 + l2 + 1e-6), 0, 1) : 0;
  const axisAngle = 0.5 * Math.atan2(2 * mxy, diff);

  return {
    cx: clamp(meanX / w, 0, 1),
    cy: clamp(meanY / h, 0, 1),
    minX: clamp(minX / w, 0, 1),
    maxX: clamp((maxX + 1) / w, 0, 1),
    minY: clamp(minY / h, 0, 1),
    maxY: clamp((maxY + 1) / h, 0, 1),
    cutL,
    cutR,
    cutB,
    axisAngle: Number.isFinite(axisAngle) ? axisAngle : 0,
    elongation: Number.isFinite(elongation) ? elongation : 0,
  };
}

/**
 * Determine the target next frame index for sub-frame interpolation,
 * or null if the animation is idle, paused, or at the end of a cycle.
 */
export function nextSwingFrame({
  state,
  frame,
  numFrames,
  isBow = false,
  isUnarmed = false,
  animIndex = 0,
  dir = 1,
  hold = 0,
}) {
  if (!state || state === 'Idle' || dir === 0 || hold > 0) return null;
  if (!(numFrames > 1) || frame < 0) return null;
  if (isBow && state === 'StrikeUp' && frame >= BOW_DRAWN_HOLD_FRAME) return null;

  if (isUnarmed && state === 'StrikeLeft' && dir > 0) {
    if (animIndex >= 0 && animIndex < LEFT_UNARMED_ANIMS.length) {
      return LEFT_UNARMED_ANIMS[animIndex];
    }
    return null;
  }

  const target = frame + (dir > 0 ? 1 : -1);
  if (target < 0 || target >= numFrames) return null;
  return target;
}

function shortestAxisDelta(a0, a1) {
  let d = (a1 - a0) % Math.PI;
  if (d > Math.PI * 0.5) d -= Math.PI;
  if (d < -Math.PI * 0.5) d += Math.PI;
  return d;
}

/**
 * Compute sub-frame interpolated screen rect and optional soft rotation.
 */
export function smoothSlide({
  currRect,
  currMeta,
  nextRect = null,
  nextMeta = null,
  prevIdleRect = null,
  prevIdleMeta = null,
  mirror = false,
  t = 0,
  isFirstFrame = false,
  config,
  weaponType = -1,
  screenW = 320,
  screenH = 200,
}) {
  if (!currRect || !currMeta || !config?.enabled) {
    return { rect: currRect, rotate: null };
  }
  const u = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  const strength = clamp(config.strength ?? 0.85, 0, 1);
  if (strength <= 0) return { rect: currRect, rotate: null };

  const cx = (r, m) => r.x + (mirror ? 1 - m.cx : m.cx) * r.w;
  const cy = (r, m) => r.y + m.cy * r.h;
  const currCx = cx(currRect, currMeta);
  const currCy = cy(currRect, currMeta);

  const maxX = screenW * 0.22;
  const maxY = screenH * 0.22;
  let dx = 0,
    dy = 0;

  if (nextRect && nextMeta) {
    const ease = u * (0.75 + 0.25 * u);
    dx += softClamp((cx(nextRect, nextMeta) - currCx) * ease * strength, maxX);
    dy += softClamp((cy(nextRect, nextMeta) - currCy) * ease * strength, maxY);
  }

  if (config.smoothStart && isFirstFrame && prevIdleRect && prevIdleMeta && u < 1) {
    const decay = (1 - u) * (1 - u);
    dx += softClamp((cx(prevIdleRect, prevIdleMeta) - currCx) * decay * strength, screenW * 0.18);
    dy += softClamp((cy(prevIdleRect, prevIdleMeta) - currCy) * decay * strength, screenH * 0.18);
  }

  // Cut-edge separation guard when ExtendEdges is off
  if (!config.extendEdges) {
    const cL = mirror ? currMeta.cutR : currMeta.cutL;
    const cR = mirror ? currMeta.cutL : currMeta.cutR;
    if (cL && dx > 0) dx = 0;
    if (cR && dx < 0) dx = 0;
    if (currMeta.cutB && dy < 0) dy = 0;
  }

  const outRect = {
    x: currRect.x + (Number.isFinite(dx) ? dx : 0),
    y: currRect.y + (Number.isFinite(dy) ? dy : 0),
    w: currRect.w,
    h: currRect.h,
  };

  let rotate = null;
  if (
    isRigidRotateType(weaponType) &&
    nextMeta &&
    currMeta.elongation >= ELONGATION_MIN &&
    nextMeta.elongation >= ELONGATION_MIN
  ) {
    const a0 = mirror ? -currMeta.axisAngle : currMeta.axisAngle;
    const a1 = mirror ? -nextMeta.axisAngle : nextMeta.axisAngle;
    const dAngle = shortestAxisDelta(a0, a1);
    const rad = clamp(dAngle * u * strength, -MAX_ROT_RAD, MAX_ROT_RAD);
    if (Math.abs(rad) > 1e-4 && Number.isFinite(rad)) {
      const px = outRect.x + (mirror ? 1 - currMeta.cx : currMeta.cx) * outRect.w;
      const py = outRect.y + currMeta.maxY * outRect.h;
      if (Number.isFinite(px) && Number.isFinite(py)) rotate = { rad, px, py };
    }
  }

  return { rect: outRect, rotate };
}

/**
 * Per-hand smooth state tracker with a zero-allocation 3-slot motion blur trail.
 */
export function createSmoothTracker() {
  const slots = Array.from({ length: TRAIL_SLOTS }, () => ({
    valid: false,
    tex: null,
    rect: { x: 0, y: 0, w: 0, h: 0 },
    uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
    rotate: null,
    age: 0,
  }));
  let count = 0;
  let head = 0;
  let idleRect = null;
  let idleMeta = null;
  let lastAttackKey = null;

  return {
    get idleRect() {
      return idleRect;
    },
    get idleMeta() {
      return idleMeta;
    },
    recordIdle(rect, meta) {
      if (rect) idleRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
      if (meta) idleMeta = meta;
      this.clearTrail();
      lastAttackKey = null;
    },
    clearTrail() {
      count = 0;
      head = 0;
      for (let i = 0; i < TRAIL_SLOTS; i++) slots[i].valid = false;
    },
    reset() {
      this.clearTrail();
      idleRect = null;
      idleMeta = null;
      lastAttackKey = null;
    },
    checkAttackKey(key) {
      if (key !== lastAttackKey) {
        this.clearTrail();
        lastAttackKey = key;
        return true;
      }
      return false;
    },
    pushTrail(tex, rect, uv, rotate, dt) {
      if (!tex || !rect) return;
      const d = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60;
      for (let i = 0; i < TRAIL_SLOTS; i++) {
        if (slots[i].valid) slots[i].age += d;
      }
      // Avoid pushing identical frames (e.g. same-frame redraws)
      if (count > 0) {
        const prev = slots[(head - 1 + TRAIL_SLOTS) % TRAIL_SLOTS];
        if (
          prev.valid &&
          prev.age < 0.008 &&
          Math.abs(prev.rect.x - rect.x) < 0.5 &&
          Math.abs(prev.rect.y - rect.y) < 0.5
        ) {
          return;
        }
      }
      const s = slots[head];
      s.valid = true;
      s.tex = tex;
      s.rect.x = rect.x;
      s.rect.y = rect.y;
      s.rect.w = rect.w;
      s.rect.h = rect.h;
      const u = uv ?? { u0: 0, v0: 0, u1: 1, v1: 1 };
      s.uv.u0 = u.u0;
      s.uv.v0 = u.v0;
      s.uv.u1 = u.u1;
      s.uv.v1 = u.v1;
      s.rotate = rotate ? { rad: rotate.rad, px: rotate.px, py: rotate.py } : null;
      s.age = 0;
      head = (head + 1) % TRAIL_SLOTS;
      if (count < TRAIL_SLOTS) count++;
    },
    forEachTrail(maxTaps, fn) {
      const n = Math.min(count, maxTaps);
      if (n <= 0) return;
      // Oldest to newest (skipping the most recent sample if it's age 0)
      const start = (head - count + TRAIL_SLOTS) % TRAIL_SLOTS;
      const skip = count - n;
      for (let i = skip; i < count; i++) {
        const s = slots[(start + i) % TRAIL_SLOTS];
        if (!s.valid || s.age > 0.14) continue;
        fn(s, i - skip, n);
      }
    },
  };
}

/**
 * Draw a 2D first-person weapon with optional edge extension, motion blur trail,
 * soft rotation, and synchronized Weapon Glow.
 */
export function drawSmoothedWeapon(
  renderer,
  canvas,
  {
    tex,
    extendedTex = null,
    pad = null,
    origSize = null,
    rect,
    baseRect = rect,
    uv,
    mirror = false,
    tint = null,
    glow = null,
    glowArt = null,
    rotate = null,
    tracker = null,
    config = null,
    attacking = false,
    dt = 0,
    offsetHeight = 0,
  },
) {
  if (!renderer || !canvas || !tex || !rect) return;
  const cfg = config ?? smoothWeaponConfig();
  const useExtended = !!(cfg.enabled && cfg.extendEdges && extendedTex && pad && origSize);
  let drawTex = tex;
  let drawRect = rect;
  let drawUv = uv;
  if (useExtended) {
    drawTex = extendedTex;
    drawRect = expandedRectForPad(rect, pad, origSize[0], origSize[1], mirror);
    // Keep bottom padding above docked Large HUD strip when offsetHeight > 0 and crop UV proportionally
    if (offsetHeight > 0 && drawRect.y + drawRect.h > canvas.height - offsetHeight && drawRect.h > 0) {
      const clampedH = Math.max(1, canvas.height - offsetHeight - drawRect.y);
      const frac = Math.max(0, Math.min(1, clampedH / drawRect.h));
      drawUv = { ...uv, v1: uv.v0 + (uv.v1 - uv.v0) * frac };
      drawRect = { ...drawRect, h: clampedH };
    }
  }

  // Motion blur ghosts (only during active swings, never duplicated with glow)
  if (cfg.enabled && attacking && cfg.blurTaps > 0 && tracker) {
    const tr = tint ? tint[0] : 1;
    const tg = tint ? tint[1] : 1;
    const tb = tint ? tint[2] : 1;
    const baseA = tint && tint[3] != null ? tint[3] : 1;
    tracker.forEachTrail(cfg.blurTaps, (s, idx, total) => {
      const frac = (idx + 1) / (total + 1);
      const alpha = cfg.blurAlpha * frac * baseA;
      if (alpha <= 0.01) return;
      renderer.drawScreenQuad(
        s.tex,
        s.rect,
        s.uv,
        [tr, tg, tb, alpha],
        s.rotate ? { blend: true, rotate: s.rotate } : { blend: true },
      );
    });
    tracker.pushTrail(drawTex, drawRect, drawUv, rotate, dt);
  }

  renderer.drawScreenQuad(drawTex, drawRect, drawUv, tint ?? undefined, rotate ? { rotate } : undefined);

  if (glow) {
    renderer.drawScreenQuadGlow?.(tex, rect, uv, glow, {
      art: glowArt,
      view: [canvas.width, canvas.height],
      cut: {
        l: baseRect.x <= 0.5,
        r: baseRect.x + baseRect.w >= canvas.width - 0.5,
      },
      rotate,
    });
  }
}
