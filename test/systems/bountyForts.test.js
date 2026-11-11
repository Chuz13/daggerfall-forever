// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  bountySites,
  boardPostings,
  bountyPosting,
  postingFromId,
} from '../../src/systems/bounty/bountyBoard.js';
import {
  getRegionFortCrisis,
  onContractCompleted,
  FORT_CONTRACT_TENSION_RELIEF,
  CONTRACT_TENSION_RELIEF,
} from '../../src/systems/living/bountySync.js';
import {
  setRegionCrisis,
  getRegionState,
  CRISIS_TYPE,
  CRISIS_PHASE,
} from '../../src/systems/living/regionState.js';
import {
  FORT_PRESETS,
  CRISIS_PRESET_POOLS,
  pickFortPresetName,
  getFortPreset,
} from '../../src/world/bountyFortPresets.js';
import {
  createBountyForts,
  fortSpotLocal,
  FORT_LINGER_M,
  FORT_BUCKET,
} from '../../src/scenes/bountyForts.js';
import { createBountyHost } from '../../src/scenes/bountyHost.js';

const allLand = () => true;
const TOWN = { px: 300, py: 200, name: 'Daggerfall' };
const REGION_DAGGERFALL = 17;

test('BOUNTY-FORT: Preset pool contains 7 distinct prefabs across crises', () => {
  const names = Object.keys(FORT_PRESETS);
  assert.equal(names.length, 7);
  assert.ok(names.includes('WOD_BanditFort_01'));
  assert.ok(names.includes('WOD_BanditFort_02'));
  assert.ok(names.includes('WOD_BanditFort_03'));
  assert.ok(names.includes('WOD_BanditCamp_01'));
  assert.ok(names.includes('WOD_BanditCamp_02'));
  assert.ok(names.includes('WOD_Ruins_01'));
  assert.ok(names.includes('WOD_Ruins_03'));

  for (const name of names) {
    const p = getFortPreset(name);
    assert.ok(p.side > 0, `${name} has positive size`);
    assert.ok(p.models.length > 0, `${name} has models`);
    for (const m of p.models) {
      assert.ok(Number.isInteger(m.modelIdNum), 'model id is integer');
      assert.equal(m.matrix.length, 16, 'matrix has 16 elements');
    }
  }

  // Crisis pool diversity
  assert.deepEqual(CRISIS_PRESET_POOLS.WAR.length, 3);
  assert.deepEqual(CRISIS_PRESET_POOLS.CIVIL_STRIFE.length, 3);
  assert.deepEqual(CRISIS_PRESET_POOLS.PLAGUE.length, 3);
});

test('BOUNTY-FORT: Board generates fort contracts ONLY during eligible crises (WAR, CIVIL_STRIFE, PLAGUE)', () => {
  const sites = bountySites(TOWN.px, TOWN.py, allLand);

  // 1. Peace in region: no fort bounties
  setRegionCrisis(REGION_DAGGERFALL, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  assert.equal(getRegionFortCrisis(REGION_DAGGERFALL), null);
  const peacePosts = boardPostings({ day: 100, ...TOWN, level: 5, sites, region: REGION_DAGGERFALL });
  assert.equal(peacePosts.length, 4);
  assert.ok(peacePosts.every((p) => !p.fort), 'no fort postings during peace');

  // 2. War in region: slot 1 is a fort posting
  setRegionCrisis(REGION_DAGGERFALL, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
  assert.equal(getRegionFortCrisis(REGION_DAGGERFALL), CRISIS_TYPE.WAR);
  const warPosts = boardPostings({ day: 100, ...TOWN, level: 5, sites, region: REGION_DAGGERFALL });
  const warFort = warPosts.find((p) => p.fort);
  assert.ok(warFort, 'war fort posting generated');
  assert.equal(warFort.slot, 1);
  assert.equal(warFort.crisis, CRISIS_TYPE.WAR);
  assert.ok(warFort.count >= 6 && warFort.count <= 10, 'fort garrison has 6..10 foes');
  assert.ok(CRISIS_PRESET_POOLS.WAR.includes(warFort.preset), 'picked from WAR preset pool');
  assert.match(warFort.story, /fort|garrison|outpost/i);
  assert.match(warFort.mapLine, /fortification/i);

  // 3. Civil strife in region
  setRegionCrisis(REGION_DAGGERFALL, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  setRegionCrisis(REGION_DAGGERFALL, CRISIS_TYPE.CIVIL_STRIFE, CRISIS_PHASE.START);
  const strifePosts = boardPostings({ day: 100, ...TOWN, level: 5, sites, region: REGION_DAGGERFALL });
  const strifeFort = strifePosts.find((p) => p.fort);
  assert.ok(strifeFort, 'strife fort posting generated');
  assert.equal(strifeFort.crisis, CRISIS_TYPE.CIVIL_STRIFE);
  assert.ok(CRISIS_PRESET_POOLS.CIVIL_STRIFE.includes(strifeFort.preset), 'picked from CIVIL_STRIFE preset pool');

  // 4. Plague in region
  setRegionCrisis(REGION_DAGGERFALL, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  setRegionCrisis(REGION_DAGGERFALL, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.MID);
  const plaguePosts = boardPostings({ day: 100, ...TOWN, level: 5, sites, region: REGION_DAGGERFALL });
  const plagueFort = plaguePosts.find((p) => p.fort);
  assert.ok(plagueFort, 'plague fort posting generated');
  assert.equal(plagueFort.crisis, CRISIS_TYPE.PLAGUE);
  assert.ok(CRISIS_PRESET_POOLS.PLAGUE.includes(plagueFort.preset), 'picked from PLAGUE preset pool');

  // Restore peace
  setRegionCrisis(REGION_DAGGERFALL, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
});

test('BOUNTY-FORT: postingFromId reconstructs fort contract with region', () => {
  setRegionCrisis(REGION_DAGGERFALL, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
  const sites = bountySites(TOWN.px, TOWN.py, allLand);
  const posts = boardPostings({ day: 200, ...TOWN, level: 8, sites, region: REGION_DAGGERFALL });
  const fort = posts.find((p) => p.fort);
  assert.ok(fort);

  const rebuilt = postingFromId(fort.id, { name: TOWN.name, sites, region: REGION_DAGGERFALL });
  assert.ok(rebuilt);
  assert.equal(rebuilt.fort, true);
  assert.equal(rebuilt.preset, fort.preset);
  assert.equal(rebuilt.count, fort.count);
  assert.equal(rebuilt.gold, fort.gold);
  assert.equal(rebuilt.story, fort.story);

  setRegionCrisis(REGION_DAGGERFALL, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
});

test('BOUNTY-FORT: onContractCompleted gives enhanced tension relief for FORT contracts', () => {
  const reg = 20;
  const st = getRegionState(reg);
  st.tension = 50;

  // Regular contract
  onContractCompleted(reg, null);
  assert.equal(st.tension, 50 - CONTRACT_TENSION_RELIEF);

  // Fort contract
  onContractCompleted(reg, 'FORT');
  assert.equal(st.tension, 50 - CONTRACT_TENSION_RELIEF - FORT_CONTRACT_TENSION_RELIEF);
});

test('BOUNTY-FORT: createBountyForts lifecycle - stand on built pixel, linger on clear, destroyAll', async () => {
  const addedMeshes = [];
  const removedBuckets = [];
  let mode = 'exterior';
  let playerFeet = [50, 0, 50];
  const builtPixels = new Set();

  const forts = createBountyForts({
    collider: () => ({
      heightAt: () => 10,
      addMesh: (bucket, pos, idx, local) => addedMeshes.push({ bucket, local }),
      removeBucket: (bucket) => removedBuckets.push(bucket),
    }),
    pixelTranslation: () => [0, 0, 0],
    pixelBuilt: (px, py) => (builtPixels.has(`${px},${py}`) ? { texRemap: null } : null),
    getGpuMesh: async (id) => ({ id, subMeshes: [] }),
    cpuModel: (id) => ({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }),
    prepare: async () => {},
    spotOk: () => true,
    feet: () => playerFeet,
    mode: () => mode,
  });

  const bounty = { id: '999.300.200.1', px: 300, py: 200, crisis: 'WAR' };

  // 1. Pixel not built: fort does not stand
  forts.sync([bounty]);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(forts.standing().length, 0);
  assert.equal(addedMeshes.length, 0);

  // 2. Pixel built: fort stands
  builtPixels.add('300,200');
  forts.sync([bounty]);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(forts.standing().length, 1);
  assert.ok(addedMeshes.length > 0, 'meshes added to collider');
  assert.ok(addedMeshes[0].bucket.startsWith(FORT_BUCKET));
  const anchor = forts.anchorFor(bounty.id);
  assert.ok(anchor !== null, 'has anchor position');

  // 3. Bounty completed while player is nearby: fort lingers
  playerFeet = [anchor[0], anchor[1], anchor[2]];
  forts.sync([]);
  assert.equal(forts.standing().length, 1, 'lingers while nearby');

  // 4. Player walks far away (> 200m): fort despawns
  playerFeet = [anchor[0] + 500, anchor[1], anchor[2] + 500];
  forts.sync([]);
  assert.equal(forts.standing().length, 0, 'despawns once out of reach');
  assert.ok(removedBuckets.includes(FORT_BUCKET + bounty.id), 'collider bucket removed');
});
