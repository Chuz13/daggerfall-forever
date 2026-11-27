// @ts-check
// Stage 0: Procedural Mini-Locations JSON Blueprint v1 schema, validator,
// climate-safe texture restyle resolver, subterranean interior builder,
// and curated ARCH3D catalog + sample presets.

import { getWorldClimateSettings } from '../../formats/mapsFile.js';
import { applyClimate } from '../climateSwaps.js';
import { GLOBAL_SCALE } from '../meshReader.js';
import { INTERIOR_MARKER } from '../interior/interiorLayout.js';
import {
  FABRIC_SIDES,
  fabricCellMiddle,
  fabricInteriorPlan,
  fabricInteriorRecord,
} from '../interior/fabricInterior.js';
import {
  KIT_PIECE,
  KIT_SET_ARCHIVES,
  kitModel,
} from '../interior/fabricInteriorKit.js';

const EDITOR_FLATS_ARCHIVE = 199;

export const MINI_DUNGEON_SCHEMA_VERSION = 1;

export const MINI_DUNGEON_KINDS = Object.freeze(['overworld', 'underground', 'sea_island']);
export const PLACEMENT_MODES = Object.freeze(['flat', 'slope', 'sea']);

export const CLIMATE_BASES = Object.freeze({
  Desert: 0,
  Mountain: 100,
  Temperate: 300,
  Swamp: 400,
});

const VALID_CLIMATE_BASES = new Set([0, 100, 300, 400]);

export const UNDERGROUND_TEXTURE_SETS = Object.freeze({
  CryptA: 19,
  CryptB: 20,
  DungeonsA: 22,
  DungeonsB: 23,
  DungeonsC: 24,
  DungeonsNEWCs: 25,
  FarmInt: 28,
  Mines: 45,
  Caves: 47,
  TempleInt: 63,
  Sewer: 68,
});

const KIT_SET_ARCHIVES_SET = new Set(KIT_SET_ARCHIVES);
const INTERIOR_REMAP_SKIP_SETS = new Set([74, 75, 76, 77, 79, 80, 82, 83]);

/**
 * Sanitizes climateBase into {0, 100, 300, 400} via getWorldClimateSettings.
 * Prevents sprite-archive texture shifts (such as 267/293/304).
 * @param {number} value @returns {number}
 */
export function sanitizeClimateBase(value) {
  const n = Number(value);
  if (VALID_CLIMATE_BASES.has(n)) return n;
  if (Number.isInteger(n) && n >= 223 && n <= 232) {
    const settings = getWorldClimateSettings(n);
    if (VALID_CLIMATE_BASES.has(settings?.climateType)) return settings.climateType;
  }
  return CLIMATE_BASES.Temperate;
}

/**
 * Resolves a submesh texture archive with climate and optional restyleSet.
 * @param {number} archive @param {number} record @param {number} climateBase
 * @param {number} season @param {number | null} [restyleSet] @returns {number}
 */
export function resolveRemappedArchive(archive, record, climateBase, season, restyleSet = null) {
  const safeClimate = sanitizeClimateBase(climateBase);
  const arch = Number(archive) || 0;
  const setMod = arch < 500 ? arch % 100 : -1;
  if (
    restyleSet != null &&
    Number.isInteger(restyleSet) &&
    restyleSet >= 0 &&
    restyleSet < 100 &&
    !INTERIOR_REMAP_SKIP_SETS.has(setMod) &&
    (KIT_SET_ARCHIVES_SET.has(arch) || setMod === 16 || setMod === 28 || setMod === 37 || setMod === 40 || setMod === 44 || setMod === 60 || setMod === 63 || setMod === 66 || setMod === 71)
  ) {
    return safeClimate + restyleSet;
  }
  return applyClimate(arch, record, safeClimate, season);
}

/**
 * Validates a Mini-Dungeon JSON Blueprint v1 object.
 * @param {any} bp
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateMiniDungeonBlueprint(bp) {
  const errors = [];
  const warnings = [];
  if (!bp || typeof bp !== 'object' || Array.isArray(bp)) {
    return { ok: false, errors: ['Blueprint must be a JSON object.'], warnings };
  }
  if (bp.schemaVersion !== MINI_DUNGEON_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${MINI_DUNGEON_SCHEMA_VERSION}.`);
  }
  if (typeof bp.id !== 'string' || !/^[a-z0-9_-]+$/i.test(bp.id)) {
    errors.push('id must be a non-empty alphanumeric/dash/underscore string.');
  }
  if (!MINI_DUNGEON_KINDS.includes(bp.kind)) {
    errors.push(`kind must be one of: ${MINI_DUNGEON_KINDS.join(', ')}.`);
  }
  const mode = bp.placement?.mode;
  if (!PLACEMENT_MODES.includes(mode)) {
    errors.push(`placement.mode must be one of: ${PLACEMENT_MODES.join(', ')}.`);
  }
  if (!Array.isArray(bp.containers) || bp.containers.length === 0) {
    errors.push('containers must be a non-empty array.');
  } else {
    let hasMain = false;
    for (let i = 0; i < bp.containers.length; i++) {
      const c = bp.containers[i];
      if (!c || typeof c !== 'object') {
        errors.push(`containers[${i}] must be an object.`);
        continue;
      }
      if (!Number.isFinite(Number(c.modelId))) {
        errors.push(`containers[${i}].modelId must be a finite number.`);
      }
      if (!Number.isFinite(Number(c.dx)) || !Number.isFinite(Number(c.dz))) {
        errors.push(`containers[${i}] must have finite dx and dz.`);
      }
      if (c.role === 'main') hasMain = true;
    }
    if (!hasMain) {
      errors.push("containers must include at least one entry with role === 'main'.");
    }
  }

  if (bp.exterior && typeof bp.exterior === 'object') {
    if (Array.isArray(bp.exterior.models)) {
      for (let i = 0; i < bp.exterior.models.length; i++) {
        const m = bp.exterior.models[i];
        if (!Number.isFinite(Number(m?.modelId)) || !Number.isFinite(Number(m?.dx)) || !Number.isFinite(Number(m?.dz))) {
          errors.push(`exterior.models[${i}] requires finite modelId, dx, dz.`);
        }
      }
    }
    if (Array.isArray(bp.exterior.flats)) {
      for (let i = 0; i < bp.exterior.flats.length; i++) {
        const f = bp.exterior.flats[i];
        if (!Number.isFinite(Number(f?.archive)) || !Number.isFinite(Number(f?.record)) || !Number.isFinite(Number(f?.dx)) || !Number.isFinite(Number(f?.dz))) {
          errors.push(`exterior.flats[${i}] requires finite archive, record, dx, dz.`);
        }
      }
    }
  }

  if (bp.kind === 'underground') {
    if (!bp.interior || !Array.isArray(bp.interior.cells) || bp.interior.cells.length === 0) {
      errors.push('underground blueprints require interior.cells with at least one [i, j] cell.');
    } else {
      for (let i = 0; i < bp.interior.cells.length; i++) {
        const cell = bp.interior.cells[i];
        if (!Array.isArray(cell) || cell.length < 2 || !Number.isInteger(cell[0]) || !Number.isInteger(cell[1])) {
          errors.push(`interior.cells[${i}] must be an [int, int] pair.`);
        }
      }
    }
  }

  if (!bp.overworldIcon || !Number.isFinite(Number(bp.overworldIcon.modelId))) {
    warnings.push('overworldIcon.modelId is missing; Overworld map will fall back to default marker.');
  }
  if (!bp.encounters || !Array.isArray(bp.encounters.pool) || bp.encounters.pool.length === 0) {
    warnings.push('encounters.pool is empty; this location will always spawn empty of foes.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

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

function isWindowModelId(modelIdNum) {
  const n = Number(modelIdNum) || 0;
  const mod = n % 100;
  if (mod !== KIT_PIECE.window % 100) return false;
  const setIdx = Math.floor((n - KIT_PIECE.window) / 100);
  return setIdx >= 0 && setIdx < KIT_SET_ARCHIVES.length;
}

function toClassicCoords(entry) {
  if (Array.isArray(entry.cell) && entry.cell.length >= 2) {
    const [mx, mz] = fabricCellMiddle(entry.cell[0], entry.cell[1]);
    return {
      x: Math.round(mx + (Number(entry.dx) || 0) / GLOBAL_SCALE),
      y: Math.round(-(Number(entry.dy) || 0) / GLOBAL_SCALE),
      z: Math.round(mz + (Number(entry.dz) || 0) / GLOBAL_SCALE),
    };
  }
  const [ox, oz] = fabricCellMiddle(0, 0);
  return {
    x: Math.round(ox + (Number(entry.dx) || 0) / GLOBAL_SCALE),
    y: Math.round(-(Number(entry.dy) || 0) / GLOBAL_SCALE),
    z: Math.round(oz + (Number(entry.dz) || 0) / GLOBAL_SCALE),
  };
}

/**
 * Builds a windowless subterranean RMB-shaped interior record from a Mini-Dungeon blueprint.
 * @param {any} bp
 * @param {number} [seed]
 */
export function buildMiniDungeonInteriorRecord(bp, seed = 0) {
  const spec = bp?.interior ?? {};
  const cells = Array.isArray(spec.cells) && spec.cells.length ? spec.cells.map(([i, j]) => [i, j]) : [[0, 0]];
  const blind = buildAllBlindEdges(cells);
  const storeys = Math.max(1, Math.min(2, Math.trunc(Number(spec.storeys) || 1)));
  const fabricPool = typeof spec.fabricPool === 'string' ? spec.fabricPool : 'temple';

  const plan = fabricInteriorPlan({
    key: Number(seed) >>> 0,
    pool: fabricPool,
    cells,
    blind,
    storeys,
  });
  if (Number.isInteger(spec.wallSet)) {
    plan.set = spec.wallSet;
  }

  const interior = fabricInteriorRecord(plan, null);
  const wallId = kitModel(KIT_PIECE.wall, plan.set);

  // Strip windows (x018 -> blind wall) and optionally strip random procedural furniture
  const keepRandomFurniture = spec.keepRandomFurniture === true;
  const cleaned3d = [];
  for (const obj of interior.block3dObjectRecords ?? []) {
    const mid = Number(obj.modelIdNum);
    if (isWindowModelId(mid)) {
      cleaned3d.push({ ...obj, modelIdNum: wallId, modelId: String(wallId) });
      continue;
    }
    if (!keepRandomFurniture && mid >= 41000 && mid <= 43999 && mid !== 41409) {
      continue;
    }
    cleaned3d.push(obj);
  }

  // Place explicit props from blueprint
  for (const prop of spec.props ?? []) {
    const c = toClassicCoords(prop);
    const yawDeg = Number(prop.yawDeg) || 0;
    const yRotation = (((Math.round((yawDeg / 360) * 2048) % 2048) + 2048) % 2048);
    cleaned3d.push({
      modelId: String(prop.modelId),
      modelIdNum: Number(prop.modelId),
      objectType: 13,
      xPos: c.x,
      yPos: c.y,
      zPos: c.z,
      xRotation: 0,
      yRotation,
      zRotation: 0,
      ...(Number.isFinite(prop.scale) && prop.scale !== 1 ? { xScale: prop.scale, yScale: prop.scale, zScale: prop.scale } : {}),
    });
  }

  // Place interior containers from blueprint
  const containersMeta = [];
  for (const cont of bp?.containers ?? []) {
    if (cont.where !== 'interior') continue;
    const c = toClassicCoords(cont);
    const yawDeg = Number(cont.yawDeg) || 0;
    const yRotation = (((Math.round((yawDeg / 360) * 2048) % 2048) + 2048) % 2048);
    cleaned3d.push({
      modelId: String(cont.modelId),
      modelIdNum: Number(cont.modelId),
      objectType: 13,
      xPos: c.x,
      yPos: c.y,
      zPos: c.z,
      xRotation: 0,
      yRotation,
      zRotation: 0,
    });
    containersMeta.push({
      id: cont.id,
      role: cont.role || 'side',
      modelIdNum: Number(cont.modelId),
      lootBias: Number(cont.lootBias) || 1,
      x: (c.x) * GLOBAL_SCALE,
      y: -(c.y) * GLOBAL_SCALE,
      z: (c.z) * GLOBAL_SCALE,
    });
  }

  // Flats: ensure Enter marker at [0, 0], add blueprint lights & flats
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
  for (const fl of spec.flats ?? []) {
    const c = toClassicCoords(fl);
    const arch = Number(fl.archive) || 210;
    const rec = Number(fl.record) || 0;
    flats.push({
      xPos: c.x,
      yPos: c.y,
      zPos: c.z,
      textureArchive: arch,
      textureRecord: rec,
      textureBitfield: (arch << 7) | rec,
      factionID: 0,
      flags: 0,
    });
  }

  // Spawn points
  const spawns = [];
  const spawnPointsMeta = [];
  for (const sp of spec.spawnPoints ?? []) {
    const c = toClassicCoords(sp);
    spawns.push({
      xPos: c.x,
      yPos: c.y,
      zPos: c.z,
      unknown1: 0,
      unknown2: 10,
      unknown3: 0,
    });
    spawnPointsMeta.push({
      x: c.x * GLOBAL_SCALE,
      y: -c.y * GLOBAL_SCALE,
      z: c.z * GLOBAL_SCALE,
    });
  }
  if (spawns.length === 0) {
    const farCell = cells[cells.length - 1];
    const [sx, sz] = fabricCellMiddle(farCell[0], farCell[1]);
    spawns.push({
      xPos: Math.round(sx),
      yPos: 0,
      zPos: Math.round(sz),
      unknown1: 0,
      unknown2: 10,
      unknown3: 0,
    });
    spawnPointsMeta.push({ x: sx * GLOBAL_SCALE, y: 0, z: sz * GLOBAL_SCALE });
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

  return {
    plan,
    interior: finalInterior,
    restyleSet: Number.isInteger(spec.restyleSet) ? spec.restyleSet : null,
    wallSet: plan.set,
    containersMeta,
    spawnPointsMeta,
    dfBlock: {
      name: `MINIDUN_${String(bp?.id ?? 'LOC').toUpperCase().slice(0, 8)}.RMB`,
      index: -1,
      isMiniDungeon: true,
      rmbBlock: {
        subRecords: [{ interior: finalInterior }],
      },
    },
  };
}

/** Curated ARCH3D model IDs verified in the codebase for the Model Inspector. */
export const CURATED_ARCH3D_CATALOG = Object.freeze({
  entrances: Object.freeze([
    { id: 43600, label: 'Underground Hatch / Stair Slab A' },
    { id: 43603, label: 'Underground Hatch / Stair Slab B' },
    { id: 43502, label: 'Ruined Wall Arch' },
    { id: 43506, label: 'Ruined Wall Segment' },
    { id: 43508, label: 'Ruined Corner Wall' },
    { id: 43509, label: 'Ruined Watchtower' },
    { id: 43512, label: 'Ruined Foundation Block A' },
    { id: 43513, label: 'Ruined Foundation Block B' },
    { id: 43514, label: 'Ruined Vault / Portal' },
    { id: 62317, label: 'Marble Monument Arch' },
  ]),
  campsAndProps: Object.freeze([
    { id: 41606, label: 'Wilderness Camp Tent' },
    { id: 41607, label: 'Command Pavilion Tent' },
    { id: 41610, label: 'Open Merchant Canopy' },
    { id: 41214, label: 'Supply Wagon' },
    { id: 42560, label: 'Military Banner' },
    { id: 41731, label: 'Broken Pillar A' },
    { id: 41732, label: 'Broken Pillar B' },
    { id: 62323, label: 'Sovereign Statue' },
    { id: 62328, label: 'Dark Stone Obelisk' },
    { id: 74069, label: 'Stone Sarcophagus' },
    { id: 74071, label: 'Open Coffin' },
    { id: 74082, label: 'Shrine Pedestal' },
    { id: 74086, label: 'Stone Wellhead' },
    { id: 74091, label: 'Grand Altar' },
    { id: 74229, label: 'Iron Cage' },
  ]),
  rocks: Object.freeze([
    { id: 41713, label: 'Boulder A (41713)' },
    { id: 41716, label: 'Boulder B (41716)' },
    { id: 41717, label: 'Boulder C (41717)' },
    { id: 41719, label: 'Rock Outcrop (41719)' },
    { id: 60610, label: 'WOD Shrub / Boulder (60610)' },
    { id: 60711, label: 'Rock Pebble A (60711)' },
    { id: 60712, label: 'Rock Pebble B (60712)' },
    { id: 60715, label: 'Rock Pebble C (60715)' },
  ]),
  containersAndFurniture: Object.freeze([
    { id: 41811, label: 'Strongbox Chest A (41811)' },
    { id: 41812, label: 'Strongbox Chest B (41812)' },
    { id: 41813, label: 'Small Chest (41813)' },
    { id: 41818, label: 'Small Crate (41818)' },
    { id: 41822, label: 'Medium Crate (41822)' },
    { id: 41832, label: 'Provision Boxes (41832)' },
    { id: 41834, label: 'Supply Crate Stack (41834)' },
    { id: 41000, label: 'Simple Bed (41000)' },
    { id: 41003, label: 'Wardrobe (41003)' },
    { id: 41020, label: 'Pedestal (41020)' },
    { id: 41108, label: 'Wooden Table (41108)' },
    { id: 41116, label: 'Hearth / Fireplace (41116)' },
    { id: 41409, label: 'Ladder (41409)' },
  ]),
});

/** Three Stage 0 sample JSON Blueprint v1 presets for 3D previewing. */
export const MINI_DUNGEON_SAMPLE_BLUEPRINTS = Object.freeze([
  Object.freeze({
    schemaVersion: 1,
    id: 'ruined_watchtower',
    kind: 'overworld',
    nameKey: 'miniLoc.ruined_watchtower.name',
    name: 'Ruined Watchtower',
    weight: 10,
    climates: ['Temperate', 'Mountain', 'Desert', 'Swamp'],
    placement: { mode: 'flat', radius: 10, maxSlope: 1.6 },
    overworldIcon: { modelId: 43509, heightM: 15 },
    exterior: {
      models: [
        { modelId: 43509, dx: 0, dy: 0, dz: 0, yawDeg: 0, sinkM: 0.3 },
        { modelId: 43506, dx: 4.8, dy: 0, dz: -2.0, yawDeg: 90, sinkM: 0.25 },
        { modelId: 43508, dx: -4.2, dy: 0, dz: 2.8, yawDeg: 180, sinkM: 0.25 },
        { modelId: 41731, dx: 2.8, dy: 0, dz: 3.6, yawDeg: 25, sinkM: 0.15 },
        { modelId: 42560, dx: -1.6, dy: 0, dz: -3.2, yawDeg: 0, sinkM: 0.1 },
      ],
      flats: [
        { archive: 210, record: 1, dx: -1.4, dy: 0, dz: 1.8, light: { range: 12, color: [1.0, 0.72, 0.38] } },
        { archive: 205, record: 24, dx: 2.2, dy: 0, dz: -0.9 },
      ],
    },
    interior: null,
    containers: [
      { id: 'main_chest', role: 'main', where: 'exterior', modelId: 41811, dx: 0.8, dy: 0, dz: 0.6, yawDeg: 35, lootBias: 1.2 },
      { id: 'crates_1', role: 'side', where: 'exterior', modelId: 41834, dx: -2.6, dy: 0, dz: -1.1, yawDeg: 15, lootBias: 0.75 },
    ],
    encounters: {
      count: [2, 4],
      spawnPoints: [
        { where: 'exterior', dx: -3.0, dz: 3.2 },
        { where: 'exterior', dx: 3.6, dz: -3.0 },
        { where: 'exterior', dx: 0.5, dz: 4.5 },
      ],
      pool: [
        { mobile: 'Rogue', weight: 4 },
        { mobile: 'Archer', weight: 3 },
        { mobile: 'Warrior', weight: 2, minLevel: 4 },
      ],
    },
  }),
  Object.freeze({
    schemaVersion: 1,
    id: 'ruined_cellar',
    kind: 'underground',
    nameKey: 'miniLoc.ruined_cellar.name',
    name: 'Ruined Cellar',
    weight: 10,
    climates: ['Temperate', 'Mountain', 'Swamp'],
    placement: { mode: 'flat', radius: 8, maxSlope: 1.5 },
    overworldIcon: { modelId: 43513, heightM: 14 },
    exterior: {
      entrance: { modelId: 43600, dx: 0, dy: 0, dz: 0, yawDeg: 0, sinkM: 0.05 },
      models: [
        { modelId: 43513, dx: -3.2, dy: 0, dz: 2.4, yawDeg: 20, sinkM: 0.25 },
        { modelId: 43506, dx: 3.4, dy: 0, dz: 2.2, yawDeg: -85, sinkM: 0.25 },
        { modelId: 41832, dx: 2.1, dy: 0, dz: -1.6, yawDeg: 15, sinkM: 0.1 },
      ],
      flats: [
        { archive: 210, record: 22, dx: -1.5, dy: 0, dz: -1.2, light: { range: 10, color: [1.0, 0.78, 0.45] } },
      ],
    },
    interior: {
      fabricPool: 'house1',
      wallSet: 6,
      restyleSet: 22,
      storeys: 1,
      keepRandomFurniture: false,
      cells: [
        [0, 0],
        [0, 1],
        [-1, 1],
        [1, 1],
        [0, 2],
        [-1, 2],
        [1, 2],
      ],
      props: [
        { modelId: 41834, cell: [-1, 1], dx: -0.9, dz: 0.4, yawDeg: 0 },
        { modelId: 41822, cell: [-1, 2], dx: -0.8, dz: 0.7, yawDeg: 20 },
        { modelId: 41108, cell: [1, 1], dx: 0.5, dz: 0.0, yawDeg: 90 },
      ],
      flats: [
        { archive: 210, record: 13, cell: [0, 1], dx: 0.0, dy: 1.5, dz: 0.0 },
        { archive: 210, record: 13, cell: [0, 2], dx: 0.0, dy: 1.5, dz: 0.8 },
        { archive: 205, record: 24, cell: [1, 2], dx: 0.9, dy: 0.0, dz: 0.7 },
      ],
      spawnPoints: [
        { cell: [0, 1], dx: 0.0, dz: 0.4 },
        { cell: [-1, 2], dx: 0.3, dz: 0.0 },
        { cell: [1, 2], dx: -0.2, dz: 0.2 },
      ],
    },
    containers: [
      { id: 'main_chest', role: 'main', where: 'interior', cell: [0, 2], modelId: 41811, dx: 0.0, dy: 0, dz: 0.9, yawDeg: 180, lootBias: 1.25 },
      { id: 'cellar_crate', role: 'side', where: 'interior', cell: [-1, 2], modelId: 41818, dx: 0.5, dy: 0, dz: 0.8, yawDeg: 40, lootBias: 0.7 },
    ],
    encounters: {
      count: [2, 4],
      pool: [
        { mobile: 'Rat', weight: 4 },
        { mobile: 'Spider', weight: 3 },
        { mobile: 'Rogue', weight: 2 },
      ],
    },
  }),
  Object.freeze({
    schemaVersion: 1,
    id: 'hillside_beast_cave',
    kind: 'underground',
    nameKey: 'miniLoc.hillside_beast_cave.name',
    name: 'Hillside Beast Cave',
    weight: 10,
    climates: ['Temperate', 'Mountain', 'Desert'],
    placement: { mode: 'slope', radius: 9, minSlope: 18, maxSlope: 45, sinkBackM: 1.8 },
    overworldIcon: { modelId: 43514, heightM: 15 },
    exterior: {
      entrance: { modelId: 43514, dx: 0, dy: 0, dz: 0, yawDeg: 0, sinkM: 0.4 },
      models: [
        { modelId: 41713, dx: -2.8, dy: 0.2, dz: 0.8, yawDeg: 30, sinkM: 0.5 },
        { modelId: 41716, dx: 2.9, dy: 0.2, dz: 0.6, yawDeg: -45, sinkM: 0.5 },
        { modelId: 41717, dx: 0.2, dy: 2.2, dz: 1.8, yawDeg: 90, sinkM: 0.6 },
      ],
      flats: [
        { archive: 100, record: 9, dx: -1.1, dy: 0, dz: -2.2 },
        { archive: 100, record: 10, dx: 1.3, dy: 0, dz: -2.5 },
      ],
    },
    interior: {
      fabricPool: 'temple',
      wallSet: 6,
      restyleSet: 47,
      storeys: 1,
      keepRandomFurniture: false,
      cells: [
        [0, 0],
        [0, 1],
        [1, 1],
        [0, 2],
        [-1, 2],
        [1, 2],
        [0, 3],
      ],
      props: [
        { modelId: 41716, cell: [1, 1], dx: 0.9, dz: 0.8, yawDeg: 35 },
        { modelId: 41717, cell: [-1, 2], dx: -0.8, dz: -0.7, yawDeg: 110 },
        { modelId: 41713, cell: [1, 2], dx: 0.8, dz: 0.8, yawDeg: 210 },
      ],
      flats: [
        { archive: 210, record: 1, cell: [0, 2], dx: 0.0, dy: 0.0, dz: 0.0 },
        { archive: 100, record: 9, cell: [0, 3], dx: -0.7, dy: 0.0, dz: 0.5 },
        { archive: 216, record: 0, cell: [0, 3], dx: 0.8, dy: 0.0, dz: 0.6 },
      ],
      spawnPoints: [
        { cell: [0, 1], dx: 0.0, dz: 0.5 },
        { cell: [0, 2], dx: -0.4, dz: 0.4 },
        { cell: [0, 3], dx: 0.0, dz: -0.4 },
      ],
    },
    containers: [
      { id: 'main_chest', role: 'main', where: 'interior', cell: [0, 3], modelId: 41812, dx: 0.0, dy: 0, dz: 0.9, yawDeg: 180, lootBias: 1.3 },
    ],
    encounters: {
      count: [1, 3],
      pool: [
        { mobile: 'GrizzlyBear', weight: 4 },
        { mobile: 'Spider', weight: 3 },
        { mobile: 'SabertoothTiger', weight: 2 },
      ],
    },
  }),
]);
