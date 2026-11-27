// Procedural edge extension for cut 2D first-person weapon frames.
// Extrapolates opaque pixels along the local silhouette slope at cut screen
// boundaries (left, right, bottom) so sliding frames off an edge does not
// expose flat cutoffs.

const ALPHA_THRESHOLD = 128;
const MAX_PAD_TEXELS = 96;
const MAX_SLOPE = 1.5;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const alphaOf = (px) => (px >>> 24) & 0xff;

function toUint32Colors(colors, w, h) {
  const n = w * h;
  if (colors instanceof Uint32Array) return colors.length >= n ? colors : null;
  if ((colors instanceof Uint8Array || colors instanceof Uint8ClampedArray) && colors.length >= n * 4) {
    const u32 = new Uint32Array(n);
    for (let i = 0, o = 0; i < n; i++, o += 4) {
      u32[i] = (colors[o] | (colors[o + 1] << 8) | (colors[o + 2] << 16) | (colors[o + 3] << 24)) >>> 0;
    }
    return u32;
  }
  return null;
}

/**
 * Estimate median slope (dx per row) of opaque spans across the last few rows
 * near the bottom edge, or (dy per col) near the left/right edges.
 */
function estimateBottomSlope(colors, w, h) {
  const rows = Math.min(8, h);
  if (rows < 2) return 0;
  const spans = [];
  for (let r = 0; r < rows; r++) {
    const y = h - 1 - r;
    const rowOff = y * w;
    let minX = w,
      maxX = -1;
    for (let x = 0; x < w; x++) {
      if (alphaOf(colors[rowOff + x]) >= ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (maxX >= minX && maxX - minX < w - 2) {
      spans.push({ r, mid: (minX + maxX) * 0.5 });
    }
  }
  if (spans.length < 2) return 0;
  const first = spans[0],
    last = spans[spans.length - 1];
  const dr = last.r - first.r;
  if (dr <= 0) return 0;
  // Moving downward (dy > 0) is opposite to increasing r (moving upward from bottom)
  const dxPerDown = (first.mid - last.mid) / dr;
  return Number.isFinite(dxPerDown) ? clamp(dxPerDown, -MAX_SLOPE, MAX_SLOPE) : 0;
}

function estimateSideSlope(colors, w, h, xEdge, inwardSign) {
  const cols = Math.min(8, w);
  if (cols < 2) return 0;
  const spans = [];
  for (let c = 0; c < cols; c++) {
    const x = xEdge + inwardSign * c;
    let minY = h,
      maxY = -1;
    for (let y = 0; y < h; y++) {
      if (alphaOf(colors[y * w + x]) >= ALPHA_THRESHOLD) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxY >= minY && maxY - minY < h - 2) {
      spans.push({ c, mid: (minY + maxY) * 0.5 });
    }
  }
  if (spans.length < 2) return 0;
  const first = spans[0],
    last = spans[spans.length - 1];
  const dc = last.c - first.c;
  if (dc <= 0) return 0;
  // Moving outward (opposite to inwardSign)
  const dyPerOut = (first.mid - last.mid) / dc;
  return Number.isFinite(dyPerOut) ? clamp(dyPerOut, -MAX_SLOPE, MAX_SLOPE) : 0;
}

/**
 * Extend opaque edges on cut sides of a top-first RGBA Color32 frame.
 * Returns null if the frame has no cut edges (`cutL`, `cutR`, `cutB`).
 */
export function extendFrameEdges(c32, meta, { padNative = 20, artWidth = c32?.width ?? 1, artHeight = c32?.height ?? 1 } = {}) {
  if (!c32?.colors || !meta) return null;
  const { width: w, height: h } = c32;
  if (!(w > 0) || !(h > 0)) return null;
  const colors = toUint32Colors(c32.colors, w, h);
  if (!colors) return null;
  const cutL = !!meta.cutL,
    cutR = !!meta.cutR,
    cutB = !!meta.cutB;
  if (!cutL && !cutR && !cutB) return null;

  const scaleX = w / Math.max(1, artWidth);
  const scaleY = h / Math.max(1, artHeight);
  const padX = clamp(Math.round(padNative * scaleX), 4, MAX_PAD_TEXELS);
  const padY = clamp(Math.round(padNative * scaleY), 4, MAX_PAD_TEXELS);
  const pad = { l: cutL ? padX : 0, t: 0, r: cutR ? padX : 0, b: cutB ? padY : 0 };

  const nw = w + pad.l + pad.r;
  const nh = h + pad.t + pad.b;
  const out = new Uint32Array(nw * nh);

  // Copy original pixels
  for (let y = 0; y < h; y++) {
    out.set(colors.subarray(y * w, (y + 1) * w), (y + pad.t) * nw + pad.l);
  }

  // Bottom extension
  if (cutB && pad.b > 0) {
    const slope = estimateBottomSlope(colors, w, h);
    const srcRow = (h - 1) * w;
    for (let dy = 1; dy <= pad.b; dy++) {
      const dstRow = (pad.t + h - 1 + dy) * nw;
      const shift = Math.round(slope * dy);
      for (let x = 0; x < w; x++) {
        const sx = clamp(x - shift, 0, w - 1);
        const px = colors[srcRow + sx];
        if (alphaOf(px) >= ALPHA_THRESHOLD) out[dstRow + pad.l + x] = px;
      }
    }
  }

  // Left extension
  if (cutL && pad.l > 0) {
    const slope = estimateSideSlope(colors, w, h, 0, 1);
    for (let dx = 1; dx <= pad.l; dx++) {
      const dstX = pad.l - dx;
      const shift = Math.round(slope * dx);
      for (let y = 0; y < h; y++) {
        const sy = clamp(y - shift, 0, h - 1);
        const px = colors[sy * w];
        if (alphaOf(px) >= ALPHA_THRESHOLD) out[(pad.t + y) * nw + dstX] = px;
      }
    }
  }

  // Right extension
  if (cutR && pad.r > 0) {
    const slope = estimateSideSlope(colors, w, h, w - 1, -1);
    for (let dx = 1; dx <= pad.r; dx++) {
      const dstX = pad.l + w - 1 + dx;
      const shift = Math.round(slope * dx);
      for (let y = 0; y < h; y++) {
        const sy = clamp(y - shift, 0, h - 1);
        const px = colors[sy * w + (w - 1)];
        if (alphaOf(px) >= ALPHA_THRESHOLD) out[(pad.t + y) * nw + dstX] = px;
      }
    }
  }

  // Fill bottom-left / bottom-right corners if both sides are cut
  if (cutB && cutL && pad.b > 0 && pad.l > 0) {
    const cornerPx = colors[(h - 1) * w];
    if (alphaOf(cornerPx) >= ALPHA_THRESHOLD) {
      for (let dy = 1; dy <= pad.b; dy++) {
        const row = (pad.t + h - 1 + dy) * nw;
        const leftMost = out[row + pad.l];
        const fill = alphaOf(leftMost) >= ALPHA_THRESHOLD ? leftMost : cornerPx;
        for (let x = 0; x < pad.l; x++) out[row + x] = fill;
      }
    }
  }
  if (cutB && cutR && pad.b > 0 && pad.r > 0) {
    const cornerPx = colors[(h - 1) * w + (w - 1)];
    if (alphaOf(cornerPx) >= ALPHA_THRESHOLD) {
      for (let dy = 1; dy <= pad.b; dy++) {
        const row = (pad.t + h - 1 + dy) * nw;
        const rightMost = out[row + pad.l + w - 1];
        const fill = alphaOf(rightMost) >= ALPHA_THRESHOLD ? rightMost : cornerPx;
        for (let x = pad.l + w; x < nw; x++) out[row + x] = fill;
      }
    }
  }

  return { width: nw, height: nh, colors: out, pad, origW: w, origH: h };
}

/**
 * Expand a screen-space rect to account for texture edge padding so the
 * original `[0..origW, 0..origH]` content lands on the exact same pixels.
 */
export function expandedRectForPad(rect, pad, origW, origH, mirrored = false) {
  if (!rect || !pad || !(origW > 0) || !(origH > 0)) return rect;
  const pl = mirrored ? pad.r : pad.l;
  const pr = mirrored ? pad.l : pad.r;
  const pt = pad.t;
  const pb = pad.b;
  const pxW = rect.w / origW;
  const pxH = rect.h / origH;
  return {
    x: rect.x - pl * pxW,
    y: rect.y - pt * pxH,
    w: rect.w + (pl + pr) * pxW,
    h: rect.h + (pt + pb) * pxH,
  };
}
