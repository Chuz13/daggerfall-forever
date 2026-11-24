import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  REGION_RISK_PREF,
  regionRiskMode,
  regionRiskTierOf,
  regionRiskProfile,
  applyRegionRiskToFoe,
  getRegionRiskLine,
} from '../../src/systems/regionRisk.js';
import { REGION_NAMES } from '../../src/formats/mapsTables.js';
import { setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { FEATURES } from '../../src/systems/features.js';
import { whereIs } from '../../src/ui/settings/settingsMap.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';

test('Block 6: All 71 regions resolve to valid risk tiers and multipliers', () => {
  resetPrefs();
  assert.equal(regionRiskMode(), 'standard');
  for (let i = 0; i < REGION_NAMES.length; i++) {
    const p = regionRiskProfile(i);
    assert.ok(p.tier >= 1 && p.tier <= 4, `Region ${i} tier out of range`);
    assert.ok(['heartland', 'frontier', 'wilds', 'perilous'].includes(p.id));
    assert.ok(['I', 'II', 'III', 'IV'].includes(p.roman));
    assert.ok(p.hpMult >= 1 && p.damageMult >= 1);
  }
});

test('Block 6: Canonical tier placements (Heartland / Frontier / Wilds / Perilous)', () => {
  assert.equal(regionRiskTierOf(17), 1); // Daggerfall
  assert.equal(regionRiskTierOf(20), 1); // Sentinel
  assert.equal(regionRiskTierOf(23), 1); // Wayrest

  assert.equal(regionRiskTierOf(10), 2); // Bantha
  assert.equal(regionRiskTierOf(59), 2); // Glenumbra Moors
  assert.equal(regionRiskTierOf(70), 2); // Cyrodiil

  assert.equal(regionRiskTierOf(0), 3);  // Alik'r Desert
  assert.equal(regionRiskTierOf(16), 3); // Wrothgarian Mountains
  assert.equal(regionRiskTierOf(26), 3); // Orsinium Area
  assert.equal(regionRiskTierOf(64), 3); // Skyrim

  assert.equal(regionRiskTierOf(7), 4);  // Devilrock
  assert.equal(regionRiskTierOf(61), 4); // Cybiades
  assert.equal(regionRiskTierOf(65), 4); // Morrowind
  assert.equal(regionRiskTierOf(69), 4); // Black Marsh
});

test('Block 6: applyRegionRiskToFoe scales offline foes and is a no-op online or when off', () => {
  resetPrefs();
  const entity = { maxHealth: 100, health: 100, healthMult: 1, damageScale: 1 };
  const prof = applyRegionRiskToFoe(entity, 26, { online: false }); // Orsinium Tier 3 standard
  assert.equal(prof.tier, 3);
  assert.equal(entity.maxHealth, 118);
  assert.equal(entity.health, 118);
  assert.ok(Math.abs(entity.damageScale - 1.24) < 1e-6);
  assert.equal(entity.regionRiskTier, 3);
  assert.equal(entity.regionRiskId, 'wilds');

  // Harsh mode Tier 4 (Morrowind 65)
  setPref(REGION_RISK_PREF, 'harsh');
  const harshEntity = { maxHealth: 100, health: 100, healthMult: 1, damageScale: 1 };
  applyRegionRiskToFoe(harshEntity, 65, { online: false });
  assert.equal(harshEntity.maxHealth, 145);
  assert.ok(Math.abs(harshEntity.damageScale - 1.55) < 1e-6);

  // Online mode is always a no-op
  const onlineEntity = { maxHealth: 100, health: 100, healthMult: 1, damageScale: 1 };
  const onlineProf = applyRegionRiskToFoe(onlineEntity, 65, { online: true });
  assert.equal(onlineProf.mode, 'off');
  assert.equal(onlineEntity.maxHealth, 100);
  assert.equal(onlineEntity.damageScale, 1);

  // Off mode is a no-op
  setPref(REGION_RISK_PREF, 'off');
  const offEntity = { maxHealth: 100, health: 100, healthMult: 1, damageScale: 1 };
  applyRegionRiskToFoe(offEntity, 65, { online: false });
  assert.equal(offEntity.maxHealth, 100);
  assert.equal(offEntity.damageScale, 1);

  // Unknown/null regionIndex must never fall back to region 0 (Alik'r Desert)
  const unknownEntity = { maxHealth: 100, health: 100, healthMult: 1, damageScale: 1 };
  const unknownProf = applyRegionRiskToFoe(unknownEntity, null, { online: false, mode: 'harsh' });
  assert.equal(unknownProf.mode, 'off');
  assert.equal(unknownEntity.maxHealth, 100);
  assert.equal(unknownEntity.damageScale, 1);
});

test('Block 6: getRegionRiskLine formats threat lines offline and returns null online/off', () => {
  resetPrefs();
  const line1 = getRegionRiskLine(17);
  const line2 = getRegionRiskLine(10);
  const line3 = getRegionRiskLine(26);
  const line4 = getRegionRiskLine(65);
  assert.ok(line1 && line1.includes('I'));
  assert.ok(line2 && line2.includes('II') && line2.includes('+12%'));
  assert.ok(line3 && line3.includes('III') && line3.includes('+24%'));
  assert.ok(line4 && line4.includes('IV') && line4.includes('+36%'));
  assert.equal(getRegionRiskLine(65, { online: true }), null);
  assert.equal(getRegionRiskLine(65, { mode: 'off' }), null);
});

test('Block 6: Feature registry, settingsMap placement, and risk console command', () => {
  resetPrefs();
  const feat = FEATURES.find((f) => f.id === 'regional-risk-zones');
  assert.ok(feat);
  assert.equal(feat.control.key, REGION_RISK_PREF);
  assert.equal(feat.control.initial, 'standard');
  const loc = whereIs('feat:regional-risk-zones');
  assert.ok(loc);
  assert.equal(loc.tab.id, 'combat');
  assert.equal(loc.section.id, 'enemies');

  const cmd = getConsoleCommand('risk');
  assert.ok(cmd && typeof cmd.callback === 'function');
  const out26 = cmd.callback(['26']);
  assert.ok(out26.includes('Orsinium Area') && out26.includes('Tier III'));
  const outHarsh = cmd.callback(['harsh']);
  assert.ok(outHarsh.includes('harsh'));
  assert.equal(regionRiskMode(), 'harsh');
  cmd.callback(['standard']);
});

test('Block 6: All 26 locales define all 11 new regionalRiskZones/regionRisk keys', () => {
  const required = [
    'features.regionalRiskZones.title',
    'features.regionalRiskZones.note',
    'features.regionalRiskZones.off',
    'features.regionalRiskZones.standard',
    'features.regionalRiskZones.harsh',
    'regionRisk.tier.heartland',
    'regionRisk.tier.frontier',
    'regionRisk.tier.wilds',
    'regionRisk.tier.perilous',
    'regionRisk.map.lineBase',
    'regionRisk.map.lineScaled',
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
