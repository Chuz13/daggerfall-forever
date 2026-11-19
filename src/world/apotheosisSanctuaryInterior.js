// @ts-check
// Apotheosis Stage 3.2: subterranean Sanctuary layouts and hatch placement.
// Builds 3 windowless sanctuary interiors via `fabricInteriorPlan` / `fabricInteriorRecord`
// with blind perimeter walls, altar dais (41020), braziers, spawn nodes, and hatches.

import {
  FABRIC_SIDES,
  fabricCellMiddle,
  fabricInteriorPlan,
  fabricInteriorRecord,
} from './interior/fabricInterior.js';
import {
  KIT_CELL,
  KIT_PIECE,
  KIT_SET_ARCHIVES,
  kitModel,
} from './interior/fabricInteriorKit.js';
import { EDITOR_FLATS_ARCHIVE } from './rmbFlats.js';
import { INTERIOR_MARKER } from './interior/interiorLayout.js';
import { NAV_CELL, NAV_CELLS_PER_BLOCK } from './city/cityNavigation.js';
import { BUILDING_TYPES } from './buildingNames.js';

/** Authentic ARCH3D underground stair & cellar hatch slab model IDs. */
export const SANCTUARY_HATCH_MODELS = Object.freeze([43600, 43603]);

/** Three distinct windowless subterranean architectural pools. */
export const SANCTUARY_INTERIOR_POOLS = Object.freeze([
  'catacomb_nave',
  'forbidden_ossuary',
  'cult_undercroft',
]);

const POOL_SPECS = Object.freeze({
  catacomb_nave: Object.freeze({
    id: 'catacomb_nave',
    fabricPool: 'temple',
    set: 6, // TEXTURE.163 — Temple subterranean stone
    storeys: 1,
    cells: Object.freeze([
      [0, 0],
      [0, 1],
      [-1, 1],
      [1, 1],
      [0, 2],
      [-1, 2],
      [1, 2],
      [0, 3],
    ]),
    altarCell: Object.freeze([0, 3]),
  }),
  forbidden_ossuary: Object.freeze({
    id: 'forbidden_ossuary',
    fabricPool: 'library',
    set: 2, // TEXTURE.137 — Arcane / Ossuary stonework
    storeys: 1,
    cells: Object.freeze([
      [0, 0],
      [0, 1],
      [0, 2],
      [-1, 2],
      [1, 2],
      [0, 3],
      [-1, 3],
      [1, 3],
    ]),
    altarCell: Object.freeze([0, 3]),
  }),
  cult_undercroft: Object.freeze({
    id: 'cult_undercroft',
    fabricPool: 'house1',
    set: 8, // TEXTURE.171 — Dark crypt masonry
    storeys: 1,
    cells: Object.freeze([
      [0, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
      [-1, 2],
    ]),
    altarCell: Object.freeze([0, 2]),
  }),
});

function hashStr(str) {
  let h = 2166136261 >>> 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Resolves metadata for a subterranean sanctuary pool ID. */
export function getSanctuaryPoolSpec(poolId) {
  return POOL_SPECS[poolId] ?? POOL_SPECS.catacomb_nave;
}

/** Picks a deterministic subterranean pool and hatch model ID for a site key. */
export function pickSanctuaryArchitecture(seedKey) {
  const h = hashStr(seedKey);
  const poolId = SANCTUARY_INTERIOR_POOLS[h % SANCTUARY_INTERIOR_POOLS.length];
  const hatchModelId = SANCTUARY_HATCH_MODELS[(h >>> 4) % SANCTUARY_HATCH_MODELS.length];
  return { poolId, hatchModelId };
}

/** Collects every outer perimeter cell side so zero exterior windows are emitted. */
function buildAllBlindEdges(cells) {
  const set = new Set(cells.map(([i, j]) => `${i},${j}`));
  const blind = [];
  for (const [i, j] of cells) {
    for (let s = 0; s < 4; s++) {
      const [dx, dz] = FABRIC_SIDES[s];
      if (!set.has(`${i + dx},${j + dz}`)) {
        blind.push(`${i},${j},${s}`);
      }
    }
  }
  return blind;
}

/** Returns true if a generated interior model ID is any kit window piece (`x018`). */
export function isWindowModelId(modelIdNum) {
  const n = Number(modelIdNum) || 0;
  const mod = n % 100;
  if (mod !== KIT_PIECE.window % 100) return false;
  const setIdx = Math.floor((n - KIT_PIECE.window) / 100);
  return setIdx >= 0 && setIdx < KIT_SET_ARCHIVES.length;
}

/** Builds a windowless subterranean interior plan for the given sanctuary site. */
export function buildSanctuaryPlan(site) {
  const key = String(site?.siteKey ?? `sanctuary:${site?.mapId ?? 0}`);
  const spec = getSanctuaryPoolSpec(site?.interiorPool ?? pickSanctuaryArchitecture(key).poolId);
  const cells = spec.cells.map(([i, j]) => [i, j]);
  const blind = buildAllBlindEdges(cells);
  const plan = fabricInteriorPlan({
    key: 0,
    pool: spec.fabricPool,
    cells,
    blind,
    storeys: spec.storeys,
  });
  return {
    ...plan,
    set: spec.set,
    poolId: spec.id,
    altarCell: spec.altarCell,
  };
}

/**
 * Builds an RMB-shaped block record containing one windowless subterranean sanctuary
 * interior, complete with Enter marker, Altar pedestal (`41020`), brazier/lights, and spawn points.
 */
export function buildSanctuaryBlock(site) {
  const plan = buildSanctuaryPlan(site);
  const interior = fabricInteriorRecord(plan, null);
  const [ax, az] = fabricCellMiddle(plan.altarCell[0], plan.altarCell[1]);

  // Safety pass: verify every window block is stripped/converted to blind wall;
  // also remove any random 41020 lecterns placed by fabricInteriorRecord and any furniture overlapping the apse Altar spot
  const wallId = kitModel(KIT_PIECE.wall, plan.set);
  const isNearAltarSpot = (obj) => {
    const mid = Number(obj.modelIdNum);
    if (mid === 41020) return true;
    if (mid >= 41000 && mid <= 43999 && mid !== 41409) {
      const dx = (Number(obj.xPos) || 0) - ax;
      const dz = (Number(obj.zPos) || 0) - az;
      if ((dx * dx + dz * dz) < (72 * 72)) return true;
    }
    return false;
  };
  const cleaned3d = (interior.block3dObjectRecords ?? [])
    .filter((obj) => !isNearAltarSpot(obj))
    .map((obj) => (
      isWindowModelId(obj.modelIdNum)
        ? { ...obj, modelIdNum: wallId, modelId: String(wallId) }
        : obj
    ));

  // Unconditionally place the single ritual Altar pedestal cleanly at the sanctuary's apse cell
  cleaned3d.push({
    modelId: '41020',
    modelIdNum: 41020,
    objectType: 13,
    xPos: Math.round(ax),
    yPos: 0,
    zPos: Math.round(az),
    xRotation: 0,
    yRotation: 1024,
    zRotation: 0,
  });

  const flats = [...(interior.blockFlatObjectRecords ?? [])];
  if (!flats.some((f) => f.textureArchive === EDITOR_FLATS_ARCHIVE && f.textureRecord === INTERIOR_MARKER.ENTER)) {
    const [ex, ez] = fabricCellMiddle(0, 0);
    flats.push({
      xPos: Math.round(ex),
      yPos: 0,
      zPos: Math.round(ez),
      textureArchive: EDITOR_FLATS_ARCHIVE,
      textureRecord: INTERIOR_MARKER.ENTER,
      textureBitfield: (EDITOR_FLATS_ARCHIVE << 7) | INTERIOR_MARKER.ENTER,
      factionID: 0,
      flags: 0,
    });
  }
  // Ambient brazier/candle light positioned slightly in front and above the altar so it does not overlap the statue head
  flats.push({
    xPos: Math.round(ax),
    yPos: -96,
    zPos: Math.round(az - 55),
    textureArchive: 210,
    textureRecord: 13,
    textureBitfield: (210 << 7) | 13,
    factionID: 0,
    flags: 0,
  });

  const spawns = [...(interior.blockSection3Records ?? [])];
  if (spawns.length === 0) {
    spawns.push({
      xPos: Math.round(ax),
      yPos: 0,
      zPos: Math.round(az - Math.round(KIT_CELL * 0.4)),
      unknown1: 0,
      unknown2: 10,
      unknown3: 0,
    });
  }

  const finalInterior = {
    ...interior,
    header: {
      ...(interior.header ?? {}),
      num3dObjectRecords: cleaned3d.length,
      numFlatObjectRecords: flats.length,
      numSection3Records: spawns.length,
    },
    block3dObjectRecords: cleaned3d,
    blockFlatObjectRecords: flats,
    blockSection3Records: spawns,
  };

  const blockName = `APOCULT_${String(plan.poolId).toUpperCase().slice(0, 6)}.RMB`;
  return {
    name: blockName,
    index: -1,
    poolId: plan.poolId,
    isApotheosisSanctuary: true,
    altarLocal: [ax, 0, az],
    rmbBlock: {
      subRecords: [{ interior: finalInterior }],
    },
  };
}

/**
 * Picks a deterministic `[x, y, z, yaw]` for an underground sanctuary hatch, clear of buildings, roads, and center square.
 * @param {Map<any, any> | null} frames
 * @param {{ minX?: number, maxX?: number, minZ?: number, maxZ?: number } | null} [locationRect]
 * @param {(x: number, z: number) => number} [heightAtFn]
 * @param {string} [seedKey] - base seed key, @param {number} [variant] - hatch variant, @param {((x: number, z: number) => boolean) | null} [isRoadFn]
 */
export function pickSanctuaryHatchPosition(
  frames,
  locationRect = null,
  heightAtFn = null,
  seedKey = '',
  variant = 0,
  isRoadFn = null,
) {
  const boxes = [];
  let sumX = 0;
  let sumZ = 0;
  let minBX = Infinity;
  let maxBX = -Infinity;
  let minBZ = Infinity;
  let maxBZ = -Infinity;
  if (frames && typeof frames.values === 'function') {
    for (const f of frames.values()) {
      if (!f?.box) continue;
      boxes.push(f.box);
      const cx = (f.box[0] + f.box[3]) * 0.5;
      const cz = (f.box[2] + f.box[5]) * 0.5;
      sumX += cx;
      sumZ += cz;
      if (f.box[0] < minBX) minBX = f.box[0];
      if (f.box[3] > maxBX) maxBX = f.box[3];
      if (f.box[2] < minBZ) minBZ = f.box[2];
      if (f.box[5] > maxBZ) maxBZ = f.box[5];
    }
  }

  const centreX = boxes.length ? sumX / boxes.length : 128;
  const centreZ = boxes.length ? sumZ / boxes.length : 128;
  const span = boxes.length
    ? Math.max(24, Math.min(85, Math.max(maxBX - minBX, maxBZ - minBZ) * 0.46))
    : 32;

  const h = hashStr(`${seedKey}:${variant}`);
  const baseAngle = ((h % 360) * Math.PI) / 180 + (variant ? Math.PI : 0);

  const isOffRoad = (x, z) => {
    if (typeof isRoadFn !== 'function') return true;
    return !isRoadFn(x, z)
      && !isRoadFn(x + 2, z)
      && !isRoadFn(x - 2, z)
      && !isRoadFn(x, z + 2)
      && !isRoadFn(x, z - 2);
  };

  const isClear = (x, z, pad = 5.5) => {
    for (const b of boxes) {
      if (x >= b[0] - pad && x <= b[3] + pad && z >= b[2] - pad && z <= b[5] + pad) {
        return false;
      }
    }
    if (locationRect && Number.isFinite(locationRect.minX)) {
      if (x < locationRect.minX + 3 || x > locationRect.maxX - 3 || z < locationRect.minZ + 3 || z > locationRect.maxZ - 3) {
        return false;
      }
    }
    return isOffRoad(x, z);
  };

  for (let r = span; r >= 14; r -= 6) {
    for (let step = 0; step < 16; step++) {
      const ang = baseAngle + (step * Math.PI) / 8;
      const x = centreX + Math.cos(ang) * r;
      const z = centreZ + Math.sin(ang) * r;
      if (!isClear(x, z)) continue;
      const y = typeof heightAtFn === 'function' ? heightAtFn(x, z) : 0;
      if (typeof heightAtFn === 'function' && !Number.isFinite(y)) continue;
      return [x, y, z, ang + Math.PI];
    }
  }

  // Fallback outer ring spot if dense town layout filled every inner ring
  let fx = (maxBX !== -Infinity ? maxBX : centreX + 20) + (variant ? -10 : 8);
  let fz = (maxBZ !== -Infinity ? maxBZ : centreZ + 20) + (variant ? -10 : 8);
  for (let tries = 0; tries < 8 && !isOffRoad(fx, fz); tries++) {
    fx += variant ? -3 : 3;
    fz += variant ? -3 : 3;
  }
  const fy = typeof heightAtFn === 'function' ? heightAtFn(fx, fz) : 0;
  return [fx, Number.isFinite(fy) ? fy : 0, fz, 0];
}

const HATCH_MAP_BLOCK_M = NAV_CELLS_PER_BLOCK * NAV_CELL;
const HATCH_MAP_BYTE = BUILDING_TYPES.Temple + 1;

/**
 * Stamps Cult Underground Sanctuary hatches onto the Town Automap block rows:
 * - Paints a 2x2 Temple-colored square at the hatch's navgrid coordinates on `r.autoMap`.
 * - Adds a Temple-style nameplate to `r.places` once discovered (`h.discovered || h.ownerId === 'player'`).
 * Pure copy-on-write over `rows`, compatible with both Classic & Enhanced town maps.
 */
export function cultHatchTownBlocks(rows, hatches) {
  if (!Array.isArray(rows) || !hatches?.length) return rows;
  const N = NAV_CELLS_PER_BLOCK;
  const out = rows.map((r) => ({ ...r }));
  const copied = new Set();
  const rowAt = (bx, by) => out.find((r) => r.x === bx && r.y === by) ?? null;

  for (const h of hatches) {
    if (!h || !Number.isFinite(h.x) || !Number.isFinite(h.z)) continue;
    const gx = Math.floor(h.x / NAV_CELL);
    const gy = Math.floor(h.z / NAV_CELL);
    for (let cy = gy; cy < gy + 2; cy++) {
      for (let cx = gx; cx < gx + 2; cx++) {
        const bx = Math.floor(cx / N);
        const by = Math.floor(cy / N);
        const r = rowAt(bx, by);
        if (!r?.autoMap?.length) continue;
        if (!copied.has(r)) {
          r.autoMap = r.autoMap.slice();
          copied.add(r);
        }
        const lx = cx - bx * N;
        const ly = cy - by * N;
        if (lx >= 0 && lx < N && ly >= 0 && ly < N) {
          r.autoMap[(N - 1 - ly) * N + lx] = HATCH_MAP_BYTE;
        }
      }
    }
    if (h.discovered || h.ownerId === 'player') {
      const bx = Math.floor(h.x / HATCH_MAP_BLOCK_M);
      const by = Math.floor(h.z / HATCH_MAP_BLOCK_M);
      const r = rowAt(bx, by);
      if (r && h.name) {
        r.places = [
          ...(r.places ?? []),
          {
            name: h.name,
            position: [h.x - bx * HATCH_MAP_BLOCK_M, 0, h.z - by * HATCH_MAP_BLOCK_M],
            buildingType: BUILDING_TYPES.Temple,
            cultHatch: true,
          },
        ];
      }
    }
  }
  return out;
}
