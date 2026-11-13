// @ts-check
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

import { dumpSessionLog } from '../../src/systems/diagnostics/sessionLogger.js';
import { applyLichdom, isLich, liveLichdom } from '../../src/systems/necromancy/lichdomStatus.js';
import { addNecroTaint, getPlayerTaint, _resetTaintForTests } from '../../src/systems/necromancy/necroTaint.js';
import { spawnMinion, _resetMinionControllerForTests } from '../../src/systems/necromancy/minionController.js';
import { _resetUndeadCapacityForTests } from '../../src/systems/necromancy/undeadCapacity.js';
import { t, setLocale, patchLocaleTable } from '../../src/systems/textManager.js';

beforeEach(() => {
  _resetTaintForTests();
  _resetMinionControllerForTests();
  _resetUndeadCapacityForTests();
});

// =========================================================================
// DIAGNOSTICS & TELEMETRY
// =========================================================================

test('NecroDiagnostics: session logger captures necromancy subsystem telemetry', () => {
  const player = {
    name: 'Mannimarco',
    stats: { Intelligence: 80, Willpower: 80 },
    skills: {},
    activeEffects: [],
  };

  applyLichdom(player);
  addNecroTaint(75, player);
  spawnMinion({ type: 'skeleton' });
  spawnMinion({ type: 'zombie' });

  const snapshot = dumpSessionLog('test_run');
  assert.ok(snapshot.systems);
  assert.ok(snapshot.systems.necromancy);

  const necroLog = snapshot.systems.necromancy;
  assert.equal(typeof necroLog.enabled, 'boolean');
  assert.equal(necroLog.enabled, true);
  assert.equal(typeof necroLog.isLich, 'boolean');
  assert.equal(typeof necroLog.taint, 'number');
  assert.equal(necroLog.minions, 2);
  assert.equal(necroLog.usedSlots, 3); // 1 (skeleton) + 2 (zombie)
});

// =========================================================================
// LOCALIZATION INTEGRITY ACROSS ALL 26 LOCALES
// =========================================================================

test('NecroL10N: all 26 locale files contain the necromancy keys', () => {
  const localesDir = resolve('locales');
  const dirs = readdirSync(localesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  assert.equal(dirs.length, 26, 'Must have 26 locale directories');

  const requiredKeys = [
    'spell.necro.animateDead',
    'spell.necro.corpseExplosion',
    'spell.necro.lifeTap',
    'spell.necro.boneArmor',
    'necro.lich.success',
    'necro.alert.witchHunters',
    'necro.cmd.recall',
    'necro.harvest.action',
  ];

  for (const dir of dirs) {
    const csvPath = join(localesDir, dir, 'Port_Strings.csv');
    const content = readFileSync(csvPath, 'utf8');

    for (const key of requiredKeys) {
      assert.ok(
        content.includes(`${key},`),
        `Locale ${dir} must include key ${key}`,
      );
    }
  }
});

test('NecroL10N: keys resolve properly through textManager t()', () => {
  patchLocaleTable('en', 'Port_Strings', Object.entries({
    'spell.necro.animateDead': 'Animate Dead',
    'spell.necro.corpseExplosion': 'Corpse Explosion',
    'necro.alert.abomination': 'Abomination! Guards, to arms!',
  }));

  patchLocaleTable('ru', 'Port_Strings', Object.entries({
    'spell.necro.animateDead': 'Воскрешение мертвеца',
    'spell.necro.corpseExplosion': 'Взрыв трупа',
    'necro.alert.abomination': 'Нечестивая тварь! Стража, к оружию!',
  }));

  // Test English
  setLocale('en');
  assert.equal(t('spell.necro.animateDead'), 'Animate Dead');
  assert.equal(t('spell.necro.corpseExplosion'), 'Corpse Explosion');
  assert.equal(t('necro.alert.abomination'), 'Abomination! Guards, to arms!');

  // Test Russian
  setLocale('ru');
  assert.equal(t('spell.necro.animateDead'), 'Воскрешение мертвеца');
  assert.equal(t('spell.necro.corpseExplosion'), 'Взрыв трупа');
  assert.equal(t('necro.alert.abomination'), 'Нечестивая тварь! Стража, к оружию!');

  // Reset to English
  setLocale('en');
});

// =========================================================================
// SAVE & RESTORE SERIALIZATION COMPATIBILITY
// =========================================================================

test('NecroSave: Lichdom state round-trips via JSON serialization', () => {
  const originalPlayer = {
    isPlayer: true,
    stats: { Intelligence: 50, Willpower: 50, Personality: 50 },
    skills: {},
    activeEffects: [],
    racialOverride: null,
  };

  applyLichdom(originalPlayer, { phylacteryId: 'phyl_test_123' });
  assert.equal(isLich(originalPlayer), true);

  // Simulate save serialization (JSON round-trip)
  const jsonStr = JSON.stringify(originalPlayer.activeEffects);
  const deserializedEffects = JSON.parse(jsonStr);

  const restoredPlayer = {
    isPlayer: true,
    stats: { Intelligence: 50, Willpower: 50, Personality: 50 },
    skills: {},
    activeEffects: deserializedEffects,
    racialOverride: deserializedEffects.find((a) => a.kind === 'racialOverride' && a.racial === 'lichdom'),
  };

  assert.equal(isLich(restoredPlayer), true);
  const restoredLich = liveLichdom(restoredPlayer);
  assert.equal(restoredLich?.phylacteryId, 'phyl_test_123');
  assert.equal(restoredLich?.immuneParalysis, true);
  assert.equal(restoredLich?.immuneDisease, true);
  assert.equal(restoredLich?.statMods.intelligence, 25);
});
