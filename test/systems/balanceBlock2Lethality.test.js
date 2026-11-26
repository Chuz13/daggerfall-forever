// @ts-check
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { heroThreat } from '../../src/systems/heroThreat.js';
import {
  COMBAT_LETHALITY_PREF,
  COMBAT_LETHALITY_ORDER,
  COMBAT_LETHALITY_PRESETS,
  combatLethalityMode,
  combatLethalityScale,
  applyCombatLethality,
  direnniDamageScaleForLethality,
} from '../../src/systems/combatLethality.js';
import { applyDirenniForcedTraits } from '../../src/systems/apotheosis/apotheosisStage1.js';
import { setPref, _resetForTests } from '../../src/systems/uiPrefs.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';
import { FEATURES, checkFeature } from '../../src/systems/features.js';
import { whereIs } from '../../src/ui/settings/settingsMap.js';

afterEach(() => {
  _resetForTests();
});

test('Block 2: HERO_THREAT closes L5-L10 dip while keeping L1-L5 untouched and L30/R50 in band', () => {
  assert.deepEqual(heroThreat(1), { damage: 1, health: 1, level: 0, renown: 0 });
  assert.deepEqual(heroThreat(5, 8), { damage: 1, health: 1, level: 0, renown: 0 });

  const lv8 = heroThreat(8);
  assert.ok(lv8.damage > 1.15 && lv8.health > 1.08, 'L8 enemies hit harder without sponginess');

  const lv12 = heroThreat(12);
  assert.ok(lv12.damage > 1.4 && lv12.health > 1.2, 'L12 HMR Main Test scaling elevated');

  const top = heroThreat(30, 50);
  assert.ok(top.damage >= 5 && top.damage <= 6, 'L30/R50 damage stays in 4x-6x target');
  assert.ok(top.health >= 2.5 && top.health <= 3, 'L30/R50 health stays in 2x-3x target');
});

test('Block 2: Combat Lethality presets scale offline foes regardless of lootRarity and no-op online', () => {
  _resetForTests();
  setPref('lootRarity', false);

  assert.equal(combatLethalityMode(), 'classic');
  assert.deepEqual(combatLethalityScale(), COMBAT_LETHALITY_PRESETS.classic);

  setPref(COMBAT_LETHALITY_PREF, 'lethal');
  assert.equal(combatLethalityMode(), 'lethal');

  const offlineFoe = { maxHealth: 100, health: 100, damageScale: 1 };
  applyCombatLethality(offlineFoe, { online: false });
  assert.equal(offlineFoe.maxHealth, 110);
  assert.equal(offlineFoe.damageScale, 1.45);
  assert.equal(offlineFoe.combatLethality, 'lethal');

  const onlineFoe = { maxHealth: 100, health: 100, damageScale: 1 };
  applyCombatLethality(onlineFoe, { online: true });
  assert.equal(onlineFoe.maxHealth, 100);
  assert.equal(onlineFoe.damageScale, 1);
});

test('Block 2: Direnni Hard-Mode attenuates extra damage when Combat Lethality is active', () => {
  _resetForTests();
  setPref(COMBAT_LETHALITY_PREF, 'classic');
  assert.equal(direnniDamageScaleForLethality(1.3), 1.3);

  setPref(COMBAT_LETHALITY_PREF, 'lethal');
  const att = direnniDamageScaleForLethality(1.3);
  assert.ok(att > 1.0 && att < 1.3, 'Direnni extra multiplier attenuated under Lethal');

  const foe = { maxHealth: 100, health: 100, damageScale: 1.45 };
  applyDirenniForcedTraits(foe, () => 0.1);
  assert.ok(Math.abs(foe.damageScale - 1.45 * att) < 1e-6);
});

test('Block 2: Easy Combat Lethality scales offline foes to 0.5x HP and damage with 1 HP floor and no-op online', () => {
  _resetForTests();
  assert.equal(COMBAT_LETHALITY_ORDER[0], 'easy');
  assert.deepEqual(COMBAT_LETHALITY_PRESETS.easy, { id: 'easy', damage: 0.5, health: 0.5 });

  setPref(COMBAT_LETHALITY_PREF, 'easy');
  assert.equal(combatLethalityMode(), 'easy');
  assert.deepEqual(combatLethalityScale(), COMBAT_LETHALITY_PRESETS.easy);

  const offlineFoe = { maxHealth: 100, health: 100, damageScale: 1 };
  applyCombatLethality(offlineFoe, { online: false });
  assert.equal(offlineFoe.maxHealth, 50);
  assert.equal(offlineFoe.health, 50);
  assert.equal(offlineFoe.healthMult, 0.5);
  assert.equal(offlineFoe.damageScale, 0.5);
  assert.equal(offlineFoe.combatLethality, 'easy');

  const tinyFoe = { maxHealth: 1, health: 1, damageScale: 1 };
  applyCombatLethality(tinyFoe, { online: false });
  assert.equal(tinyFoe.maxHealth, 1);
  assert.equal(tinyFoe.health, 1);

  const onlineFoe = { maxHealth: 100, health: 100, damageScale: 1 };
  applyCombatLethality(onlineFoe, { online: true });
  assert.equal(onlineFoe.maxHealth, 100);
  assert.equal(onlineFoe.damageScale, 1);

  assert.equal(direnniDamageScaleForLethality(1.3), 1.3);
});

test('Block 2: lethality console command inspects and switches presets', () => {
  _resetForTests();
  const cmd = getConsoleCommand('lethality');
  assert.ok(cmd, 'lethality command registered');
  const out = cmd.callback(['sharp']);
  assert.match(out, /sharp/i);
  assert.equal(combatLethalityMode(), 'sharp');
  assert.match(cmd.callback([]), /sharp/i);

  const easyOut = cmd.callback(['easy']);
  assert.match(easyOut, /easy/i);
  assert.match(easyOut, /0\.50/);
  assert.equal(combatLethalityMode(), 'easy');
  const easyStatus = cmd.callback([]);
  assert.match(easyStatus, /easy/i);
  assert.match(easyStatus, /0\.50/);
});

test('Block 2: combat-lethality settings contract', () => {
  const place = whereIs('feat:combat-lethality');
  assert.equal(place?.tab?.id, 'combat');
  assert.equal(place?.section?.id, 'enemies');
  const entry = FEATURES.find((f) => f.id === 'combat-lethality');
  assert.deepEqual(checkFeature(entry), []);
});

test('Block 2: all 26 locales define features.combatLethality.* keys', () => {
  const keys = [
    'features.combatLethality.title',
    'features.combatLethality.note',
    'features.combatLethality.effect',
    'features.combatLethality.easy',
    'features.combatLethality.classic',
    'features.combatLethality.sharp',
    'features.combatLethality.lethal',
    'features.combatLethality.brutal',
  ];
  const dirs = readdirSync(new URL('../../locales', import.meta.url));
  assert.equal(dirs.length, 26);
  for (const lang of dirs) {
    const csv = readFileSync(new URL(`../../locales/${lang}/Port_Strings.csv`, import.meta.url), 'utf8');
    for (const k of keys) {
      assert.ok(csv.includes(`${k},`), `${lang} missing ${k}`);
    }
  }
});
