import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runWorldBootProbe } from '../../tools/worldBootProbe.mjs';

test('World Boot Integrity: world places, heightmap sampling, coordinates, and living index readiness', async () => {
  const result = await runWorldBootProbe({ verbose: false });

  assert.equal(result.ok, true, 'World boot probe must succeed');
  assert.equal(result.stats.canonicalLocationsVerified, 4, 'Canonical locations verified (Daggerfall, Wayrest, Sentinel, Privateer)');
  assert.ok(result.stats.townsIndexed >= 3, 'Towns indexed for world boot');
  assert.ok(result.stats.dungeonsIndexed >= 1, 'Starting dungeon indexed for world boot');
});
