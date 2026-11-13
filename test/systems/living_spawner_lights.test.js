import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLivingSceneHost,
  buildLivingSiteBlueprint,
  LIVING_SITE_KINDS,
} from '../../src/systems/living/livingWorldSpawner.js';
import { withPlayerLights } from '../../src/scenes/magicCandle.js';
import { packLight } from '../../src/render/lightId.js';

test('LivingWorldSpawner: campfire/brazier lights conform to canonical point light contract without NaNs', () => {
  const host = createLivingSceneHost({
    feet: () => [100, 10, 200],
    ready: () => true,
    clock: () => 720,
    regionIndex: () => 17,
    inLocationRect: () => false,
    onRoad: () => true,
    heightAt: () => 10,
    playerEntity: () => ({ level: 10 }),
    spawn: async () => null,
    remove: () => {},
    inPool: () => false,
    say: () => {},
  });

  const bp = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.WANDERING_ADVENTURER,
    centerX: 100,
    centerZ: 200,
    heightAt: () => 10,
    regionIndex: 17,
    playerEntity: { level: 10 },
    nowMinutes: 720,
    onRoad: false,
    rng: () => 0.80, // >= 0.55 and !onRoad guarantees ROADSIDE_CAMP with CAMPFIRE
  });

  host.standBlueprint(bp);

  const lights = host.lights();
  assert.ok(Array.isArray(lights), 'lights() must return an array');
  assert.ok(lights.length > 0, 'WANDERING_ADVENTURER site with campfire should yield at least 1 light');

  for (const l of lights) {
    assert.equal(typeof l, 'object', 'Each light must be an object');
    assert.ok(!Array.isArray(l), 'Light must NOT be a raw coordinate array [x,y,z,r]');
    assert.equal(typeof l.x, 'number', 'Light must have numeric x');
    assert.equal(typeof l.y, 'number', 'Light must have numeric y');
    assert.equal(typeof l.z, 'number', 'Light must have numeric z');
    assert.equal(typeof l.range, 'number', 'Light must have numeric range');
    assert.ok(Number.isFinite(l.x), 'l.x must be finite');
    assert.ok(Number.isFinite(l.y), 'l.y must be finite');
    assert.ok(Number.isFinite(l.z), 'l.z must be finite');
    assert.ok(Number.isFinite(l.range), 'l.range must be finite');
  }

  // Pack through withPlayerLights as done in world.js (withPlayerLights)
  const baseLights = new Float32Array(0);
  const packed = withPlayerLights(baseLights, ...lights);
  assert.ok(packed instanceof Float32Array, 'packed lights must be Float32Array');
  assert.equal(packed.length, lights.length * 4, 'packed lights array length must equal lights.length * 4');

  for (let i = 0; i < packed.length; i++) {
    assert.ok(!Number.isNaN(packed[i]), `packed light float at index ${i} must NOT be NaN`);
    assert.ok(Number.isFinite(packed[i]), `packed light float at index ${i} must be finite`);
  }

  host.clear();
  assert.deepEqual(host.lights(), [], 'lights() must return empty array after site clear');
});

