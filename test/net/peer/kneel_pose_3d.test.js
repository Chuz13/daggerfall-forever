import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  KNEEL_HIP_DROP,
  kneelRigInput,
  kneelRequestFor,
  seatedCamera,
} from '../../../src/player/seatPose.js';
import { parseNif } from '../../../src/formats/morrowind/mwNifFile.js';
import { buildSkeleton, poseSkeleton, skeletonSpaceMatrices, GRAPH_ROOT } from '../../../src/formats/morrowind/mwSkin.js';
import { applyClimbRig, climbBones } from '../../../src/combat/climbRig.js';
import { MW_UNITS_PER_METER } from '../../../src/formats/morrowind/mwFirstPerson.js';
import { motionWord } from '../../../src/characters/bodyMotion/bodyMotion.js';
import { peerMoving } from '../../../src/net/peer/peerClimb.js';
import { kneelFor } from '../../../src/net/peer/peerBodies.js';
import { npcShown } from '../../../src/characters/npcBodies.js';

const U = MW_UNITS_PER_METER;
const RETAIL = 'vendor/weapon-sheathing/Data Files/Animations/xbase_anim/xbase_anim_sh.nif';
const biped = (() => {
  let sk = null;
  return () => (sk ??= buildSkeleton(parseNif(new Uint8Array(readFileSync(new URL(`../../../${RETAIL}`, import.meta.url))))));
})();

function solveKneel(kneel, race = { weight: 1, height: 1 }) {
  const sk = biped();
  const b = climbBones(sk);
  const pose = poseSkeleton(sk, null, null, 0);
  const req = kneelRequestFor(kneel, { unitsPerMetre: U, ...race });
  const out = applyClimbRig(sk, pose, GRAPH_ROOT, skeletonSpaceMatrices, req);
  const m = skeletonSpaceMatrices(sk, pose, GRAPH_ROOT);
  const f = [Math.sin(kneel.yaw), Math.cos(kneel.yaw)];
  const r = [Math.cos(kneel.yaw), -Math.sin(kneel.yaw)];
  const at = (ref) => {
    const t = m.get(ref).t;
    const x = (t[0] * race.weight) / U;
    const y = (t[1] * race.weight) / U;
    const z = (t[2] * race.height) / U;
    return [kneel.feet[0] + r[0] * x + f[0] * y, kneel.feet[1] + z, kneel.feet[2] + r[1] * x + f[1] * y];
  };
  return {
    out,
    hip: at(b.root),
    knees: { L: at(b.L.calf), R: at(b.R.calf) },
    feet: { L: at(b.L.foot), R: at(b.R.foot) },
    wrists: { L: at(b.L.hand), R: at(b.R.hand) },
    head: at(b.head),
  };
}

test('kneelRequestFor guards against null, invalid feet, non-finite yaw, and zero weight', () => {
  assert.equal(kneelRequestFor(null, { unitsPerMetre: U }), null);
  assert.equal(kneelRequestFor({}, { unitsPerMetre: U }), null);
  assert.equal(kneelRequestFor({ feet: [0, NaN, 0], yaw: 0 }, { unitsPerMetre: U }), null);
  assert.equal(kneelRequestFor({ feet: [0, 0, 0], yaw: NaN }, { unitsPerMetre: U }), null);
  assert.equal(kneelRequestFor({ feet: [0, 0, 0], yaw: 0, w: 0 }, { unitsPerMetre: U }), null);
});

test('kneelRigInput produces finite lowered hips and asymmetric one-knee stance', () => {
  const k = kneelRigInput([10, 1, 20], 0);
  assert.equal(k.req.w, 1);
  assert.deepEqual(k.req.offset, [0, -KNEEL_HIP_DROP, 0]);
  assert.ok(k.req.feet.L.at[2] > 20, 'front foot planted ahead (+z at yaw 0)');
  assert.ok(k.req.feet.R.at[2] < 20, 'back foot tucked behind (-z at yaw 0)');
  assert.ok(k.req.lean.pitch > 0.2, 'torso leaned forward in defeat');
});

test('kneelRequestFor solved on retail biped across yaws and race scales: finite joints, lowered pelvis, planted feet, reachable hands', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    for (const race of [
      { weight: 1, height: 1 },
      { weight: 0.9, height: 1.1 },
      { weight: 1.05, height: 0.92 },
    ]) {
      const p = solveKneel({ feet: [2, 0, 5], yaw, w: 1, breath: 0.5 }, race);
      for (const vec of [p.hip, p.knees.L, p.knees.R, p.feet.L, p.feet.R, p.wrists.L, p.wrists.R, p.head]) {
        assert.ok(vec.every(Number.isFinite), `finite coordinates at yaw=${yaw}`);
      }
      assert.ok(p.hip[1] < 0.72 * race.height && p.hip[1] > 0.45 * race.height, `pelvis lowered: ${p.hip[1]}`);
      assert.ok(p.knees.L[1] > p.knees.R[1], `front knee (${p.knees.L[1].toFixed(3)}) higher than trailing knee (${p.knees.R[1].toFixed(3)})`);
      assert.ok(p.knees.R[1] >= -0.05 && p.knees.R[1] < 0.35 * race.height, `trailing knee near floor: ${p.knees.R[1]}`);
      assert.ok(p.out.reach.L < 1 && p.out.reach.R < 1, `hands reach marks (rig units): L=${p.out.reach.L}, R=${p.out.reach.R}`);
    }
  }
});

test('kneel integrates with seatedCamera, motionWord, peerMoving, npcShown, and kneelFor', () => {
  const cam = seatedCamera({ kneel: { feet: [0, 0, 0], yaw: 0 }, move: { forward: 1, strafe: 1, running: true, speed: 5 } });
  assert.equal(cam.move.forward, 0);
  assert.equal(cam.move.speed, 0);
  assert.equal(motionWord({ cam: { kneel: { feet: [0, 0, 0], yaw: 0 } }, third: true }).busy, 'seat');
  assert.equal(peerMoving({ mv: 1, kn: 1 }), false);
  assert.equal(peerMoving({ mv: 1, kn: 0 }), true);

  const shown = npcShown({ feet: [1, 2, 3], yaw: 0.5, moving: false, running: false, drawn: false, kneel: true });
  assert.equal(shown.kn, 1);

  const b = {};
  const k1 = kneelFor(b, [1, 0, 2], 0.5);
  assert.equal(kneelFor(b, [1, 0, 2], 0.5), k1, 'cached while still');
  assert.notEqual(kneelFor(b, [1.5, 0, 2], 0.5), k1, 'rebuilt on move');
});
