// @ts-check
// BOUNTY-FORT: Physical fort/encampment spawned on crisis fort bounty pixels.
// Deterministic geometry from world/bountyFortPresets.js based on regional crisis.
// Zero save state: stands while bounty is held and pixel is built.
// Lingers until player is FORT_LINGER_M away once contract is completed/abandoned.

import { bountyHash } from '../systems/bounty/bountyBoard.js';
import { trs, multiply } from '../world/mat4.js';
import { onFloatingFrame } from '../player/collider.js';
import { getFortPreset, pickFortPresetName } from '../world/bountyFortPresets.js';

/** How far from a fort whose bounty is over the player must be before it comes down, metres. */
export const FORT_LINGER_M = 200;
/** The pixel's side, and the band of it a fort may stand in. */
export const FORT_PIXEL_SIDE = 819.2;
const FORT_BAND = [0.25, 0.75];
/** How many candidate spots a fort tests on its pixel. */
export const FORT_SPOT_TRIES = 16;
/** How far each model is sunk below ground under its own centre, metres. */
export const FORT_SINK_M = 0.25;
/** A fort whose ground was not ready yet tries again after this many syncs. */
export const FORT_RETRY_SYNCS = 4;
/** Maximum ground rise across a fort block, metres. */
export const FORT_MAX_RISE_M = 8;
/** Clearance outside a fort structure's footprint, metres. */
export const FORT_BUILDING_CLEAR_M = 1.5;
/** The collider bucket prefix - one bucket per fort. */
export const FORT_BUCKET = 'bounty:fort:';

/**
 * The fort's spot in its pixel, pixel-local metres, for try `k`.
 * Pure function of bounty id, distinct salt from farms.
 * @param {string} id
 * @param {number} k
 */
export function fortSpotLocal(id, k = 0) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  const a = bountyHash(h, k, 0xfc);
  const b = bountyHash(h, k, 0xfd);
  const span = FORT_BAND[1] - FORT_BAND[0];
  return [
    FORT_PIXEL_SIDE * (FORT_BAND[0] + span * ((a % 1000) / 1000)),
    FORT_PIXEL_SIDE * (FORT_BAND[0] + span * ((b % 1000) / 1000)),
  ];
}

/**
 * @param {Record<string, any>} deps
 */
export function createBountyForts(deps) {
  /** id -> { id, px, py, lx, lz, ly, models: [{gpu, local}] | null, wanted, gen, bucket, failed, crisis, retry, boxes, house, half } */
  const forts = new Map();
  let gen = 0;
  const _world = new Float32Array(16);

  function takeDown(f) {
    try {
      deps.collider()?.removeBucket?.(f.bucket);
    } catch {
      /* the collider went with the scene */
    }
    forts.delete(f.id);
  }

  function destroyAll() {
    for (const f of [...forts.values()]) takeDown(f);
  }

  /** Where the fort's centre is in the scene now. */
  const centreOf = (f) => {
    const t = deps.pixelTranslation(f.px, f.py);
    return [t[0] + f.lx, t[1] + f.ly, t[2] + f.lz];
  };

  /** Whether scene point (x, z) falls within `r` metres of a standing fort's block. */
  const occupied = (x, z, r = 0, except = null) => {
    for (const f of forts.values()) {
      if (f === except || !f.models || !Number.isFinite(f.half)) continue;
      const c = centreOf(f);
      if (Math.abs(x - c[0]) < f.half + r && Math.abs(z - c[2]) < f.half + r) return true;
    }
    return false;
  };

  /** Where the fort's primary anchor stands in the scene now. */
  const anchorOf = (f) => {
    const t = deps.pixelTranslation(f.px, f.py);
    const h = f.house ?? [f.lx, f.ly, f.lz];
    return [t[0] + h[0], t[1] + h[1], t[2] + h[2]];
  };

  async function stand(f) {
    const myGen = (f.gen = ++gen);
    const presetName = pickFortPresetName(f.id, f.crisis || 'WAR');
    const block = getFortPreset(presetName);
    const pixel = deps.pixelBuilt(f.px, f.py);
    if (!block?.models?.length || !pixel) {
      f.failed = true;
      return;
    }
    const half = (block.side ?? 38.4) / 2;
    const t = deps.pixelTranslation(f.px, f.py);
    const col = deps.collider();
    if (!col?.heightAt) {
      f.retry = FORT_RETRY_SYNCS;
      return;
    }

    let spot = null,
      best = Infinity,
      unbuilt = false;
    for (let k = 0; k < FORT_SPOT_TRIES; k++) {
      const [lx, lz] = fortSpotLocal(f.id, k);
      if (!deps.spotOk(t[0] + lx, t[2] + lz, half + 4) || occupied(t[0] + lx, t[2] + lz, half + 4, f)) continue;
      let lo = Infinity,
        hi = -Infinity;
      for (const dx of [-half, 0, half]) {
        for (const dz of [-half, 0, half]) {
          const h = col.heightAt(t[0] + lx + dx, t[2] + lz + dz);
          if (Number.isFinite(h)) {
            lo = Math.min(lo, h);
            hi = Math.max(hi, h);
          }
        }
      }
      if (!Number.isFinite(lo)) {
        unbuilt = true;
        continue;
      }
      if (hi - lo > FORT_MAX_RISE_M) continue;
      if (hi - lo < best) {
        best = hi - lo;
        spot = [lx, lz];
      }
    }

    if (!spot) {
      if (unbuilt) f.retry = FORT_RETRY_SYNCS;
      else f.failed = true;
      return;
    }

    f.lx = spot[0];
    f.lz = spot[1];
    f.half = half;
    const centreGround = col.heightAt(t[0] + f.lx, t[2] + f.lz);
    f.ly = (Number.isFinite(centreGround) ? centreGround : 0) - t[1];

    const origin = trs(f.lx, 0, f.lz, 0, 0, 0);
    const models = [];
    for (const placed of block.models) {
      let gpu = null;
      try {
        gpu = await deps.getGpuMesh(placed.modelIdNum);
      } catch {
        gpu = null;
      }
      if (forts.get(f.id) !== f || f.gen !== myGen) return;
      if (!gpu) continue;
      try {
        await deps.prepare(gpu, pixel);
      } catch {
        /* standard fallback */
      }
      if (forts.get(f.id) !== f || f.gen !== myGen) return;
      const local = multiply(origin, placed.matrix);
      const g = col.heightAt(t[0] + local[12], t[2] + local[14]);
      local[13] = (Number.isFinite(g) ? g - t[1] : f.ly) + placed.matrix[13] - FORT_SINK_M;
      models.push({ gpu, local, id: placed.modelIdNum });
    }

    if (!models.length) {
      f.failed = true;
      return;
    }

    const live = deps.collider();
    if (live?.addMesh) {
      const tr0 = () => deps.pixelTranslation(f.px, f.py);
      const tr = deps.floatingFrame ? onFloatingFrame(deps.floatingFrame(), tr0) : tr0;
      for (const m of models) {
        const cpu = deps.cpuModel(m.id);
        if (cpu?.positions && cpu.indices) live.addMesh(f.bucket, cpu.positions, cpu.indices, m.local, tr);
      }
    }

    // Footprints of buildings to keep foes clear of walls
    let house = null,
      widest = -1;
    const boxes = [];
    for (const m of models) {
      const pos = deps.cpuModel(m.id)?.positions;
      if (!pos?.length) continue;
      let x0 = Infinity,
        x1 = -Infinity,
        z0 = Infinity,
        z1 = -Infinity,
        y0 = Infinity,
        y1 = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        x0 = Math.min(x0, pos[i]);
        x1 = Math.max(x1, pos[i]);
        y0 = Math.min(y0, pos[i + 1]);
        y1 = Math.max(y1, pos[i + 1]);
        z0 = Math.min(z0, pos[i + 2]);
        z1 = Math.max(z1, pos[i + 2]);
      }
      const area = (x1 - x0) * (z1 - z0);
      if (area > widest) {
        widest = area;
        house = m;
      }
      if (y1 - y0 < 2 || Math.min(x1 - x0, z1 - z0) < 1.5) continue;
      const L = m.local;
      let bx0 = Infinity,
        bx1 = -Infinity,
        bz0 = Infinity,
        bz1 = -Infinity;
      for (const cx of [x0, x1]) {
        for (const cz of [z0, z1]) {
          const wx = L[0] * cx + L[8] * cz + L[12];
          const wz = L[2] * cx + L[10] * cz + L[14];
          bx0 = Math.min(bx0, wx);
          bx1 = Math.max(bx1, wx);
          bz0 = Math.min(bz0, wz);
          bz1 = Math.max(bz1, wz);
        }
      }
      boxes.push([bx0, bz0, bx1, bz1]);
    }

    f.boxes = boxes;
    f.house = house ? [house.local[12], house.local[13], house.local[14]] : [f.lx, f.ly, f.lz];
    f.models = models;
  }

  /**
   * Bring forts in line with active bounties held. `wanted` is [{ id, px, py, crisis }].
   * @param {Array<{ id:string, px:number, py:number, crisis?:string }>} wanted
   */
  function sync(wanted) {
    if (deps.mode() !== 'exterior') {
      destroyAll();
      return;
    }
    const want = new Map((wanted ?? []).map((w) => [w.id, w]));
    const feet = deps.feet();
    for (const f of [...forts.values()]) {
      f.wanted = want.has(f.id);
      if (f.retry > 0 && --f.retry === 0) {
        takeDown(f);
        continue;
      }
      if (!deps.pixelBuilt(f.px, f.py)) {
        takeDown(f);
        continue;
      }
      if (!f.wanted && f.models) {
        const c = centreOf(f);
        if (!feet || Math.hypot(feet[0] - c[0], feet[2] - c[2]) > FORT_LINGER_M) takeDown(f);
      } else if (!f.wanted && !f.models) {
        takeDown(f);
      }
    }
    for (const w of want.values()) {
      if (forts.has(w.id) || !deps.pixelBuilt(w.px, w.py)) continue;
      const f = {
        id: w.id,
        px: w.px,
        py: w.py,
        lx: 0,
        lz: 0,
        ly: 0,
        models: null,
        wanted: true,
        gen: 0,
        bucket: FORT_BUCKET + w.id,
        failed: false,
        crisis: w.crisis || 'WAR',
        retry: 0,
        boxes: [],
        house: null,
        half: 20,
      };
      forts.set(w.id, f);
      stand(f).catch(() => {
        f.failed = true;
      });
    }
  }

  /** Draw forts in the world pass. */
  function draw(r) {
    if (!r?.drawMesh) return 0;
    let n = 0;
    for (const f of forts.values()) {
      if (!f.models) continue;
      const pixel = deps.pixelBuilt(f.px, f.py);
      const t = deps.pixelTranslation(f.px, f.py);
      const pm = trs(t[0], t[1], t[2], 0, 0, 0);
      for (const m of f.models) {
        r.drawMesh(m.gpu, multiply(pm, m.local, _world), pixel?.texRemap ?? null);
        n++;
      }
    }
    return n;
  }

  return {
    sync,
    draw,
    destroyAll,
    /** Central courtyard or primary structure of the fort. */
    anchorFor: (id) => {
      const f = forts.get(id);
      return f?.models ? anchorOf(f) : null;
    },
    failed: (id) => !!forts.get(id)?.failed,
    standing: () => [...forts.values()].filter((f) => f.models).map((f) => f.id),
    occupied: (x, z, r = 0) => occupied(x, z, r),
    inBuilding: (x, z, r = FORT_BUILDING_CLEAR_M) => {
      for (const f of forts.values()) {
        if (!f.models || !f.boxes?.length) continue;
        const t = deps.pixelTranslation(f.px, f.py);
        const lx = x - t[0];
        const lz = z - t[2];
        for (const b of f.boxes) {
          if (lx > b[0] - r && lx < b[2] + r && lz > b[1] - r && lz < b[3] + r) return true;
        }
      }
      return false;
    },
  };
}
