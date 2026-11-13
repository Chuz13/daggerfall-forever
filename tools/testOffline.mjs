#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// OFFLINE TEST PROFILE (Daggerfall Forever)
//
// Fast, deterministic test runner dedicated to offline singleplayer
// mechanics:
//   1. World & Save Diagnostic Probes (Stress & Boot Integrity)
//   2. Cross-System Mechanics Audit (Lichdom, RCF, Crises, Economy)
//   3. Living Tamriel Suite (71 Regions, Adventurers, Nemesis, Surrender)
//   4. Necromancy, Combat, Bounty Forts, Shop Stock, Weapons Reforged
//   5. Architecture & Seam Types Gate
// ═══════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import process from 'node:process';

const startTime = performance.now();

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('   DAGGERFALL FOREVER — OFFLINE INTEGRITY & MECHANICS SUITE');
console.log('═══════════════════════════════════════════════════════════════════════\n');

let totalFailures = 0;

function runStep(title, cmd, args) {
  const stepStart = performance.now();
  process.stdout.write(`▶ ${title}... `);
  const result = spawnSync(cmd, args, { stdio: 'pipe', encoding: 'utf8' });
  const duration = ((performance.now() - stepStart) / 1000).toFixed(2);

  if (result.status === 0) {
    console.log(`[PASS] (${duration}s)`);
    return true;
  } else {
    console.log(`[FAIL] (${duration}s)`);
    console.error(`\n--- Error output for ${title} ---`);
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
    console.error('---------------------------------\n');
    totalFailures++;
    return false;
  }
}

// 1. Diagnostics Probes
runStep('Probe: Offline Systems Stress & Save/Load Integrity', process.execPath, ['tools/offlineStressProbe.mjs']);
runStep('Probe: World Boot Integrity & Coordinate Mapping', process.execPath, ['tools/worldBootProbe.mjs']);

// 2. Offline Mechanics & Cross-System Suites
const testFiles = [
  'test/systems/dff_cross_mechanics_audit.test.js',
  'test/systems/reputationConsequences.test.js',
  'test/systems/necromancy_integration.test.js',
  'test/systems/necromancy_phase5.test.js',
  'test/systems/necromancy_perks.test.js',
  'test/systems/shopstock.test.js',
  'test/systems/bountyForts.test.js',
  'test/systems/chargenTooltips.test.js',
  'test/systems/combat_and_encounter_logging.test.js',
  'test/systems/living_spawner_lights.test.js',
  'test/mods/duelistsFlow.test.js',
  'test/mods/weaponsReforged.test.js',
  'test/systems/livingAdventurers.test.js',
  'test/systems/livingAdventurersV2.test.js',
  'test/systems/livingConfig.test.js',
  'test/systems/livingCrisisMatrix.test.js',
  'test/systems/livingEncounterDensity.test.js',
  'test/systems/livingNavalBounty.test.js',
  'test/systems/livingNemesisV2.test.js',
  'test/systems/livingPlayableBeta.test.js',
  'test/systems/livingPleas.test.js',
  'test/systems/livingRegionState.test.js',
  'test/systems/livingSceneWiring.test.js',
  'test/systems/livingSettings.test.js',
  'test/systems/livingSurrender.test.js',
  'test/systems/livingTamrielWide.test.js',
  'test/systems/livingTravel.test.js',
  'test/systems/livingUrban.test.js',
  'test/systems/livingWords.test.js',
  'test/systems/living_adventurer_gear_combat.test.js',
  'test/systems/living_mob_traits.test.js',
  'test/systems/save/hard3_types.test.js'
];

runStep('Suites: Offline Mechanics, Living Tamriel & Cross-Audit', process.execPath, ['--test', ...testFiles]);

const totalDuration = ((performance.now() - startTime) / 1000).toFixed(2);
console.log('\n═══════════════════════════════════════════════════════════════════════');
if (totalFailures === 0) {
  console.log(`✔ ALL OFFLINE SUITES PASSED in ${totalDuration}s`);
  console.log('═══════════════════════════════════════════════════════════════════════');
  process.exit(0);
} else {
  console.error(`✖ ${totalFailures} SUITE(S) FAILED in ${totalDuration}s`);
  console.log('═══════════════════════════════════════════════════════════════════════');
  process.exit(1);
}
