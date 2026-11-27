import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIMATE_BASES,
  MINI_DUNGEON_SAMPLE_BLUEPRINTS,
  UNDERGROUND_TEXTURE_SETS,
  buildMiniDungeonInteriorRecord,
  resolveRemappedArchive,
  sanitizeClimateBase,
  validateMiniDungeonBlueprint,
} from '../../src/world/miniDungeons/miniDungeonBlueprint.js';
import { CLIMATES } from '../../src/formats/mapsFile.js';
import { INTERIOR_MARKER } from '../../src/world/interior/interiorLayout.js';

const EDITOR_FLATS_ARCHIVE = 199;

test('sanitizeClimateBase keeps valid bases and converts worldClimate 223..232 (including 230)', () => {
  for (const base of [0, 100, 300, 400]) {
    assert.equal(sanitizeClimateBase(base), base);
  }
  const from230 = sanitizeClimateBase(230);
  assert.ok([0, 100, 300, 400].includes(from230), `230 resolved to valid base ${from230}`);
  assert.notEqual(from230, 230);

  for (const wc of Object.values(CLIMATES)) {
    const res = sanitizeClimateBase(wc);
    assert.ok([0, 100, 300, 400].includes(res), `climate ${wc} -> ${res}`);
  }
  assert.equal(sanitizeClimateBase(NaN), CLIMATE_BASES.Temperate);
  assert.equal(sanitizeClimateBase(undefined), CLIMATE_BASES.Temperate);
});

test('resolveRemappedArchive never shifts temple/ossuary/cave/door textures into monster sprites (250..309)', () => {
  const testArchives = [163, 137, 171, 74];
  for (const arch of testArchives) {
    const remapped = resolveRemappedArchive(arch, 0, 230, 0, null);
    assert.ok(remapped < 250 || remapped > 309, `archive ${arch} with climate 230 remapped to ${remapped}`);
  }
  // Restyle to Caves (47) in Mountain (100) -> 147, while doors (74) remain 174
  assert.equal(resolveRemappedArchive(163, 0, 100, 0, UNDERGROUND_TEXTURE_SETS.Caves), 147);
  assert.equal(resolveRemappedArchive(74, 0, 100, 0, UNDERGROUND_TEXTURE_SETS.Caves), 174);
  // Restyle to Caves (47) in Temperate (300) -> 347
  assert.equal(resolveRemappedArchive(163, 0, 300, 0, UNDERGROUND_TEXTURE_SETS.Caves), 347);
});

test('validateMiniDungeonBlueprint accepts all 3 sample blueprints and rejects invalid ones', () => {
  for (const bp of MINI_DUNGEON_SAMPLE_BLUEPRINTS) {
    const res = validateMiniDungeonBlueprint(bp);
    assert.equal(res.ok, true, `${bp.id} errors: ${res.errors.join('; ')}`);
    assert.equal(res.errors.length, 0);
  }

  const noMain = structuredClone(MINI_DUNGEON_SAMPLE_BLUEPRINTS[0]);
  noMain.containers[0].role = 'side';
  assert.equal(validateMiniDungeonBlueprint(noMain).ok, false);

  const emptyCells = structuredClone(MINI_DUNGEON_SAMPLE_BLUEPRINTS[1]);
  emptyCells.interior.cells = [];
  assert.equal(validateMiniDungeonBlueprint(emptyCells).ok, false);

  const badVer = structuredClone(MINI_DUNGEON_SAMPLE_BLUEPRINTS[0]);
  badVer.schemaVersion = 99;
  assert.equal(validateMiniDungeonBlueprint(badVer).ok, false);
});

test('buildMiniDungeonInteriorRecord builds windowless interiors with Enter marker, containers, and spawns', () => {
  for (const bp of MINI_DUNGEON_SAMPLE_BLUEPRINTS.filter((b) => b.kind === 'underground')) {
    const built = buildMiniDungeonInteriorRecord(bp, 42);
    const objs = built.interior.block3dObjectRecords;
    const flats = built.interior.blockFlatObjectRecords;
    const spawns = built.interior.blockSection3Records;

    assert.ok(objs.length > 0, `${bp.id} has 3D objects`);
    assert.ok(!objs.some((o) => Number(o.modelIdNum) % 100 === 18 && Number(o.modelIdNum) >= 3000 && Number(o.modelIdNum) < 4000), `${bp.id} has zero windows`);
    assert.ok(flats.some((f) => f.textureArchive === EDITOR_FLATS_ARCHIVE && f.textureRecord === INTERIOR_MARKER.ENTER), `${bp.id} has Enter marker`);
    assert.ok(built.containersMeta.some((c) => c.role === 'main'), `${bp.id} has main container`);
    assert.ok(spawns.length > 0, `${bp.id} has spawn points`);
  }
});
