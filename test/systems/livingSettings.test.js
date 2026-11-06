// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, whereIs } from '../../src/ui/settings/settingsMap.js';
import { FEATURES, featureForControl } from '../../src/systems/features.js';
import { LivingTamrielConfig, PRESENCE, resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';

const rd = (relPath) => readFileSync(new URL('../../' + relPath, import.meta.url), 'utf8');

test('LT-07: Living Tamriel is a top-level settings tab alongside Graphics with 3 structured sections', () => {
  const livingTab = CATEGORIES.find((c) => c.id === 'living');
  assert.ok(livingTab, 'Living Tamriel tab must exist in CATEGORIES');
  assert.equal(livingTab.title, 'Living Tamriel');

  // Verify tab order: Graphics is first, Living Tamriel is second
  assert.equal(CATEGORIES[0].id, 'graphics');
  assert.equal(CATEGORIES[1].id, 'living');

  const sectionIds = livingTab.sections.map((s) => s.id);
  assert.deepEqual(sectionIds, ['living-politics', 'living-rivals', 'living-travel']);

  // Verify all 9 features are placed in the living tab
  const expectedFeatures = [
    'feat:living-political',
    'feat:living-quarantine',
    'feat:living-urban',
    'feat:living-bounties',
    'feat:living-adventurers',
    'feat:living-nemesis',
    'feat:living-travel',
    'feat:living-camps',
    'feat:living-naval',
  ];

  for (const featId of expectedFeatures) {
    const loc = whereIs(featId);
    assert.ok(loc, `${featId} must be mapped in settingsMap`);
    assert.equal(loc.tab.id, 'living', `${featId} must be in living tab`);
  }
});

test('LT-07: Living Tamriel feature rows have valid controls, 4-tier presence, and quest competition part', () => {
  const livingFeats = FEATURES.filter((f) => f.id.startsWith('living-') && f.id !== 'living-world');
  assert.equal(livingFeats.length, 9, 'Expected 9 living feature declarations');

  for (const feat of livingFeats) {
    assert.equal(feat.group, 'world');
    assert.ok(feat.kinds.includes('enhanced'));
    assert.ok(feat.title && feat.title.length > 0);
    assert.ok(feat.note && feat.note.length > 0);

    const c = feat.control;
    assert.equal(c.store, 'prefs');
    assert.equal(c.tiers?.length, 4, `${feat.id} must declare 4 presence tiers (0..3)`);
    assert.equal(c.tiers[0][0], PRESENCE.OFF);
    assert.equal(c.tiers[1][0], PRESENCE.LIGHT);
    assert.equal(c.tiers[2][0], PRESENCE.MID);
    assert.equal(c.tiers[3][0], PRESENCE.HIGH);
  }

  // Verify adventurers row has quest competition part toggle
  const advRow = FEATURES.find((f) => f.id === 'living-adventurers');
  assert.ok(advRow, 'living-adventurers row must exist');
  assert.ok(advRow.control.parts?.some((p) => p.key === 'livingQuestCompetition'));
});

test('LT-07: LivingTamrielConfig is synchronized with uiPrefs and settings mutations', () => {
  resetLivingConfig();

  // Test tier read/write synchronization
  assert.equal(LivingTamrielConfig.political, PRESENCE.MID);
  LivingTamrielConfig.political = PRESENCE.HIGH;
  assert.equal(LivingTamrielConfig.political, PRESENCE.HIGH);
  assert.equal(getPref('livingPolitical'), PRESENCE.HIGH);

  setPref('livingPolitical', PRESENCE.OFF);
  assert.equal(LivingTamrielConfig.political, PRESENCE.OFF);

  // Test Quest competition toggle synchronization
  assert.equal(LivingTamrielConfig.allowQuestCompetition, false);
  LivingTamrielConfig.allowQuestCompetition = true;
  assert.equal(LivingTamrielConfig.allowQuestCompetition, true);
  assert.equal(getPref('livingQuestCompetition'), true);

  resetLivingConfig();
  assert.equal(LivingTamrielConfig.political, PRESENCE.MID);
  assert.equal(LivingTamrielConfig.allowQuestCompetition, false);
});

test('LT-07: Localization keys for all living settings are registered in en and ru catalogs', () => {
  const enCsv = rd('locales/en/Port_Strings.csv');
  const ruCsv = rd('locales/ru/Port_Strings.csv');

  const requiredKeys = [
    'features.tier.light',
    'features.tier.mid',
    'features.tier.high',
    'features.livingPolitical.title',
    'features.livingPolitical.note',
    'features.livingQuarantine.title',
    'features.livingQuarantine.note',
    'features.livingUrban.title',
    'features.livingUrban.note',
    'features.livingBounties.title',
    'features.livingBounties.note',
    'features.livingAdventurers.title',
    'features.livingAdventurers.note',
    'features.livingAdventurers.questComp',
    'features.livingNemesis.title',
    'features.livingNemesis.note',
    'features.livingTravel.title',
    'features.livingTravel.note',
    'features.livingCamps.title',
    'features.livingCamps.note',
    'features.livingNaval.title',
    'features.livingNaval.note',
  ];

  for (const k of requiredKeys) {
    assert.match(enCsv, new RegExp(`^${k.replace(/\./g, '\\.')},`, 'm'), `${k} missing in en catalog`);
    assert.match(ruCsv, new RegExp(`^${k.replace(/\./g, '\\.')},`, 'm'), `${k} missing in ru catalog`);
  }
});
