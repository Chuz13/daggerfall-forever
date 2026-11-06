import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runOfflineStressTest } from '../../tools/offlineStressProbe.mjs';

test('Offline Systems Stress Probe: 7 systems, 5 generations dynasty, housing, materials & save/load roundtrip', async () => {
  const result = await runOfflineStressTest({ verbose: false });
  assert.equal(result.ok, true, 'Offline stress test should succeed');
  assert.equal(result.stats.regionsSimulated, 71, 'All 71 regions simulated');
  assert.equal(result.stats.dynastyGenerations, 5, '5 generations of dynasty succession');
  assert.equal(result.stats.ownedHomes, 2, '2 offline homes owned and preserved');
  assert.equal(result.stats.chestItemsPreserved, 2, 'House chest items intact');
  assert.equal(result.stats.materialsBagItems, 4, 'Materials bag items preserved');
  assert.ok(result.stats.savePayloadBytes > 1000, 'Valid save payload generated');
});
