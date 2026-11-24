import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  DIFFICULTY_PRESETS,
  DIFFICULTY_PRESET_ROWS,
  difficultyPresetNow,
} from '../../src/systems/difficultyPresets.js';
import { FEATURES, resolveControl } from '../../src/systems/features.js';
import { getPref, setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { applyDifficultyPreset } from '../../src/ui/enhanced/enhancedMenu.js';
import { whereIs } from '../../src/ui/settings/settingsMap.js';
import { heroThreat, HERO_THREAT_PREF } from '../../src/systems/heroThreat.js';
import { blowTierLevel, TACTICAL_STAGGER_PREF } from '../../src/ai/foeBlows.js';
import { blowEffectOf } from '../../src/systems/blowEffects.js';
import {
  composeFortPack,
  composeBanditCampSubordinates,
  enrichHumanoidSkirmishPool,
  TACTICAL_PACKS_PREF,
} from '../../src/systems/living/tacticalPacks.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';

const readRow = (id) => {
  const f = FEATURES.find((x) => x.id === id);
  const c = resolveControl(f);
  return c?.read ? c.read() : getPref(c?.key);
};

test('Block 7: Default prefs match Balanced DFF preset and applyDifficultyPreset switches all 4 presets cleanly', () => {
  resetPrefs();
  assert.equal(difficultyPresetNow(readRow)?.id, 'balanced');

  for (const preset of DIFFICULTY_PRESETS) {
    applyDifficultyPreset(preset);
    assert.equal(difficultyPresetNow(readRow)?.id, preset.id, `Expected preset ${preset.id}`);
  }

  // Changing any single modular knob flips preset to Custom (null)
  setPref(TACTICAL_PACKS_PREF, false);
  assert.equal(difficultyPresetNow(readRow), null);
  resetPrefs();
});

test('Block 7: heroThreatMode off / classic / early behave accurately', () => {
  resetPrefs();
  assert.ok(heroThreat(8).damage > 1, 'Early (default) scales at Lv.8');

  setPref(HERO_THREAT_PREF, 'classic');
  assert.equal(heroThreat(10).damage, 1, 'Classic does not scale at Lv.10');
  assert.ok(heroThreat(15).damage > 1, 'Classic scales past Lv.10');

  setPref(HERO_THREAT_PREF, 'off');
  assert.equal(heroThreat(25).damage, 1, 'Off disables hero scaling');
  assert.equal(heroThreat(25).health, 1);
  resetPrefs();
});

test('Block 7: tacticalStagger classic vs tactical toggles tell level, hard stagger, and iron knockdown', () => {
  resetPrefs();
  assert.equal(blowTierLevel({ online: false }), 5);
  assert.equal(blowEffectOf('lunge', true).stagger, true);
  assert.equal(blowEffectOf('lunge', true).knockdown, true);

  setPref(TACTICAL_STAGGER_PREF, 'classic');
  assert.equal(blowTierLevel({ online: false }), 10);
  assert.equal(blowEffectOf('lunge', true).stagger, false);
  assert.equal(blowEffectOf('lunge', true).knockdown, false);
  assert.equal(blowEffectOf('slam', true).knockdown, true);
  resetPrefs();
});

test('Block 7: tacticalPacks false restores uniform packs and true restores mixed packs', () => {
  resetPrefs();
  const mixedFort = composeFortPack(MOBILE_TYPES.Knight, 4, 8);
  assert.ok(new Set(mixedFort).size >= 3, 'Mixed fort pack has multiple roles');

  setPref(TACTICAL_PACKS_PREF, false);
  const uniformFort = composeFortPack(MOBILE_TYPES.Knight, 4, 8);
  assert.deepEqual(uniformFort, [MOBILE_TYPES.Knight, MOBILE_TYPES.Knight, MOBILE_TYPES.Knight, MOBILE_TYPES.Knight]);
  const uniformBandits = composeBanditCampSubordinates(4, 8);
  assert.equal(uniformBandits.every((m) => m.tacticalRole === 'skirmisher'), true);
  const rawSkirmish = enrichHumanoidSkirmishPool([MOBILE_TYPES.Warrior, MOBILE_TYPES.Knight], 4, { playerLevel: 8 });
  assert.deepEqual(rawSkirmish, [MOBILE_TYPES.Warrior, MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior, MOBILE_TYPES.Knight]);
  resetPrefs();
});

test('Block 7: Settings placement and difficulty console command', () => {
  resetPrefs();
  assert.equal(whereIs('preset:difficulty')?.section?.id, 'enemies');
  assert.equal(whereIs('feat:hero-threat-scaling')?.section?.id, 'enemies');
  assert.equal(whereIs('feat:tactical-stagger')?.section?.id, 'enemies');
  assert.equal(whereIs('feat:tactical-packs')?.section?.id, 'enemies');

  const cmd = getConsoleCommand('difficulty');
  assert.ok(cmd && typeof cmd.callback === 'function');
  assert.ok(cmd.callback(['status']).includes('Balanced DFF'));
  assert.ok(cmd.callback(['hardcore']).includes('Hardcore'));
  assert.equal(difficultyPresetNow(readRow)?.id, 'hardcore');
  cmd.callback(['balanced']);
  assert.equal(difficultyPresetNow(readRow)?.id, 'balanced');
});

test('Block 7: All 26 locales define all 19 difficulty preset & modular toggle keys', () => {
  const required = [
    'menu.settings.diffPreset.name',
    'menu.settings.diffPreset.note',
    'menu.settings.diffPreset.effect',
    'menu.settings.diffPreset.classic',
    'menu.settings.diffPreset.balanced',
    'menu.settings.diffPreset.veteran',
    'menu.settings.diffPreset.hardcore',
    'features.heroThreatScaling.title',
    'features.heroThreatScaling.note',
    'features.heroThreatScaling.off',
    'features.heroThreatScaling.classic',
    'features.heroThreatScaling.early',
    'features.tacticalStagger.title',
    'features.tacticalStagger.note',
    'features.tacticalStagger.classic',
    'features.tacticalStagger.tactical',
    'features.tacticalPacks.title',
    'features.tacticalPacks.note',
    'features.tacticalPacks.effect',
  ];
  const localesDir = path.resolve('locales');
  const dirs = fs.readdirSync(localesDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.equal(dirs.length, 26);
  for (const dir of dirs) {
    const csvPath = path.join(localesDir, dir.name, 'Port_Strings.csv');
    const text = fs.readFileSync(csvPath, 'utf8');
    for (const key of required) {
      assert.ok(text.includes(key), `Missing ${key} in ${csvPath}`);
    }
  }
});

