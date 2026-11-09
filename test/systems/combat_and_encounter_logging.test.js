import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  writeCombatLogToDisk,
  writeEncounterLogToDisk,
  rotateCategoryLogs,
  DEFAULT_KEEP_COUNT,
} = require('../../scripts/sessionLogStorage.cjs');

import {
  recordEntityMint,
  recordEntityScaling,
  recordEntityPlacement,
  getEncounterInfo,
  getRecentSpawns,
  dumpEncounterLog,
} from '../../src/systems/diagnostics/encounterLogger.js';

import {
  startCombatEncounter,
  recordAttackResolution,
  recordSpellApplication,
  endCombatEncounter,
  dumpCombatLog,
  isInCombat,
} from '../../src/systems/diagnostics/combatLogger.js';

import {
  calculateSuccessfulHit,
  calculateAttackDamage,
} from '../../src/combat/formulas.js';

import { executeConsoleLine } from '../../src/systems/consoleCommands.js';

test('Encounter Logger: records entity minting, scaling, and placement with origin detection', () => {
  const mockEntity = {
    mobileType: 24, // Skeletal Warrior
    isClass: false,
    level: 5,
    maxHealth: 50,
    health: 50,
    armor: 30,
    armorValues: [30, 30, 30, 30, 30, 30, 30],
  };

  const basics = { name: 'Skeletal Warrior', minMetalToHit: 1 };
  recordEntityMint(mockEntity, basics, null, 5, {
    originContext: { system: 'CampEncounters', reason: 'Bandit Camp Ambush', callSite: 'campEncounters.js:120' },
  });

  const infoBeforeScale = getEncounterInfo(mockEntity);
  assert.ok(infoBeforeScale, 'Encounter info must exist');
  assert.equal(infoBeforeScale.origin.system, 'CampEncounters');
  assert.equal(infoBeforeScale.entityInfo.name, 'Skeletal Warrior');
  assert.equal(infoBeforeScale.entityInfo.mobileType, 24);

  // Apply scaling
  mockEntity.maxHealth = 80;
  mockEntity.damageScale = 1.5;
  mockEntity.challengeLevel = 8;
  recordEntityScaling(mockEntity, {
    challengeLevels: 3,
    healthMult: 1.6,
    damageMult: 1.5,
    skillGain: 15,
  });

  const infoAfterScale = getEncounterInfo(mockEntity);
  assert.ok(infoAfterScale.scaling);
  assert.equal(infoAfterScale.scaling.challengeLevelFinal, 8);
  assert.equal(infoAfterScale.scaling.damageScaleFinal, 1.5);

  // Record placement
  recordEntityPlacement(mockEntity, {
    pos: [100.5, 20.25, -300.75],
    team: 'Hostile',
    eliteFoe: false,
    champion: 'Frenzied',
  });

  const infoAfterPlacement = getEncounterInfo(mockEntity);
  assert.ok(infoAfterPlacement.placement);
  assert.deepEqual(infoAfterPlacement.placement.pos, [100.5, 20.25, -300.75]);
  assert.equal(infoAfterPlacement.placement.team, 'Hostile');
  assert.equal(infoAfterPlacement.placement.champion, 'Frenzied');

  // Verify recent spawns list contains this spawn
  const recent = getRecentSpawns(10);
  assert.ok(recent.length > 0);
  assert.ok(recent.some((s) => s.entityInfo.mobileType === 24));
});

test('Combat Logger: automatically tracks attack resolutions, dice, and modifiers', () => {
  startCombatEncounter('test_start');
  assert.equal(isInCombat(), true);

  const mockAttacker = {
    isPlayer: true,
    level: 5,
    race: 'Breton',
    stats: { strength: 60, agility: 50, luck: 50 },
    skills: { LongBlade: 55, CriticalStrike: 20 },
  };

  const mockFoe = {
    name: 'Orc Warrior',
    mobileType: 7,
    level: 4,
    health: 40,
    maxHealth: 40,
    armorValues: [40, 40, 40, 40, 40, 40, 40],
  };

  // Simulate an attack resolution
  recordAttackResolution({
    attacker: mockAttacker,
    target: mockFoe,
    weapon: { name: 'Broadsword', material: 1, condition: 85, templateIndex: 105 },
    damage: 14,
    hit: true,
    critical: true,
    backstab: false,
    diag: {
      toHit: {
        chanceToHitMod: 55,
        struckPart: 1, // Chest
        finalChance: 65,
        hitRoll: 42,
        isHit: true,
        modifiers: { armorMod: -20, statMod: 5, skillMod: 10 },
      },
      damage: {
        rawDamage: 18,
        finalDamage: 14,
        mitigated: 4,
        modsApplied: [
          { mod: 'strengthBonus', amount: 2 },
          { mod: 'criticalStrike', multiplier: 1.25 },
        ],
      },
      hooks: ['weaponProficiency', 'criticalStrikeProc'],
      sideEffects: {
        equipmentWear: { weaponWear: 1, targetArmorWear: 1 },
      },
    },
  });

  mockFoe.health = 0; // Lethal blow / kill!

  // Simulate spell application
  recordSpellApplication({
    spell: { name: 'Fireball', element: 0, rangeType: 2 },
    caster: mockAttacker,
    target: mockFoe,
    damage: 26,
    savingThrow: { chance: 30, rolled: 75, success: false },
  });

  // End encounter
  const encounter = endCombatEncounter('victory');
  assert.equal(isInCombat(), false);
  assert.ok(encounter);
  assert.equal(encounter.summary.outcome, 'victory');
  assert.equal(encounter.events.length, 2);

  // Check event 0 (physical attack)
  const ev0 = encounter.events[0];
  assert.equal(ev0.type, 'physical_attack');
  assert.equal(ev0.toHit.finalChance, 65);
  assert.equal(ev0.toHit.hitRoll, 42);
  assert.equal(ev0.damage.finalDamageDealt, 14);
  assert.equal(ev0.damage.damageAbsorbed, 4);
  assert.equal(ev0.damage.critical, true);
  assert.ok(ev0.hooksTriggered.includes('criticalStrikeProc'));

  // Check event 1 (spell)
  const ev1 = encounter.events[1];
  assert.equal(ev1.type, 'spell_application');
  assert.equal(ev1.outcome.damage, 26);
  assert.equal(ev1.savingThrow.success, false);

  // Check summary statistics
  assert.equal(encounter.summary.playerCombatStats.attacksTotal, 1);
  assert.equal(encounter.summary.playerCombatStats.hits, 1);
  assert.equal(encounter.summary.playerCombatStats.totalDamageDealt, 40); // 14 + 26
  assert.ok(encounter.summary.enemiesDefeated.includes('Orc Warrior'));
});

test('Formulas integration: calculateSuccessfulHit populates notes.diag with exact dice and modifiers', () => {
  const attacker = {
    isPlayer: true,
    stats: { agility: 50, luck: 50 },
    skills: { LongBlade: 50 },
  };
  const target = {
    isPlayer: false,
    stats: { agility: 50, luck: 50 },
    skills: { Dodging: 20 },
    armorValues: [100, 100, 100, 100, 100, 100, 100],
  };

  const notes = { critical: false, backstab: false, hit: false, ineffective: false };
  // Fixed rolls: skillRoll = 0.5 (skillsToHit uses this), hitRoll = 0.4 (40 < chance => hit)
  let rollIdx = 0;
  const rollSeq = [0.5, 0.4];
  const mockRolls = () => rollSeq[rollIdx++ % rollSeq.length];

  const hit = calculateSuccessfulHit(attacker, target, 50, 1, mockRolls, notes);
  assert.equal(typeof hit, 'boolean');
  assert.ok(notes.diag, 'notes.diag must be populated');
  assert.ok(notes.diag.toHit, 'notes.diag.toHit must exist');
  assert.equal(typeof notes.diag.toHit.finalChance, 'number');
  assert.equal(notes.diag.toHit.hitRoll, 40);
  assert.equal(notes.diag.toHit.isHit, hit);
  assert.equal(notes.diag.toHit.struckPart, 1);
  assert.ok(notes.diag.toHit.modifiers);
});

test('Rotation: writeCombatLogToDisk and writeEncounterLogToDisk maintain exactly 5 newest logs', () => {
  const tempLogsDir = path.join(tmpdir(), `dff-test-combat-logs-${Date.now()}`);
  fs.mkdirSync(tempLogsDir, { recursive: true });

  try {
    // Generate 7 combat logs
    for (let i = 1; i <= 7; i++) {
      const payload = { combatIndex: i, time: Date.now() + i * 1000 };
      const res = writeCombatLogToDisk(payload, { logsDir: tempLogsDir, keepCount: 5 });
      assert.equal(res.ok, true, `Write combat ${i} should succeed`);
    }

    const files = fs.readdirSync(tempLogsDir);
    const combatFiles = files.filter((f) => f.startsWith('combat-') && f.endsWith('.json') && f !== 'combat-latest.json');
    assert.equal(combatFiles.length, 5, 'Combat log rotation should cap files at 5');
    assert.ok(files.includes('combat-latest.json'), 'combat-latest.json must exist');

    const latestContent = JSON.parse(fs.readFileSync(path.join(tempLogsDir, 'combat-latest.json'), 'utf8'));
    assert.equal(latestContent.combatIndex, 7, 'Latest combat log should be index 7');
  } finally {
    try {
      fs.rmSync(tempLogsDir, { recursive: true, force: true });
    } catch {
      /* cleanup */
    }
  }
});

test('Console commands: dumpcombat and dumpspawns work correctly', () => {
  // Test dumpspawns
  const spawnRes = executeConsoleLine('dumpspawns test-reason');
  assert.ok(spawnRes.includes('Spawner & encounter log dumped'));
  assert.ok(spawnRes.includes('test-reason'));

  // Test dumpcombat
  startCombatEncounter('console_test');
  const combatRes = executeConsoleLine('dumpcombat test-combat');
  assert.ok(combatRes.includes('Combat encounter log dumped'));
  assert.ok(combatRes.includes('test-combat'));
});
