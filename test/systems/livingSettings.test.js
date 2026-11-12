// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORIES, whereIs } from '../../src/ui/settings/settingsMap.js';
import { FEATURES, featureForControl } from '../../src/systems/features.js';
import { LivingTamrielConfig, PRESENCE, resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';

const rd = (relPath) => readFileSync(new URL('../../' + relPath, import.meta.url), 'utf8');

test('LT-07: Living Tamriel is a section in DFF settings tab at bottom', () => {
  const dffTab = CATEGORIES.find((c) => c.id === 'dff');
  assert.ok(dffTab, 'DFF tab must exist in CATEGORIES');
  const livingSec = dffTab.sections.find((s) => s.id === 'living');
  assert.ok(livingSec, 'Living Tamriel section must exist in DFF tab');
  assert.equal(livingSec.title, 'Living Tamriel (Experimental, pre-alpha)');

  // Verify tab order: Graphics is first, DFF is at bottom
  assert.equal(CATEGORIES[0].id, 'graphics');
  assert.equal(CATEGORIES[CATEGORIES.length - 1].id, 'dff');

  // Verify all 16 features are placed in the dff tab under living section
  const expectedFeatures = [
    'feat:living-political',
    'feat:living-quarantine',
    'feat:living-urban',
    'feat:living-bounties',
    'feat:living-adventurers',
    'feat:living-road-adventurers',
    'feat:living-nemesis',
    'feat:living-travel',
    'feat:living-camps',
    'feat:living-naval',
    'feat:living-mob-traits',
    'feat:living-dungeon-mob-traits',
    'feat:lt-encounter-scale',
    'feat:lt-urban-loot',
    'feat:lt-wilderness-loot',
    'feat:lt-adventurer-loot',
  ];

  for (const featId of expectedFeatures) {
    const loc = whereIs(featId);
    assert.ok(loc, `${featId} must be mapped in settingsMap`);
    assert.equal(loc.tab.id, 'dff', `${featId} must be in dff tab`);
    assert.equal(loc.section.id, 'living', `${featId} must be in living section`);
  }
});

test('LT-07: Living Tamriel feature rows have valid controls, 4-tier presence, and quest competition part', () => {
  const livingFeats = FEATURES.filter((f) => f.id.startsWith('living-') && f.id !== 'living-world');
  assert.equal(livingFeats.length, 12, 'Expected 12 living feature declarations');

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

  // Test mobTraits synchronization
  assert.equal(LivingTamrielConfig.mobTraits, PRESENCE.MID);
  LivingTamrielConfig.mobTraits = PRESENCE.HIGH;
  assert.equal(LivingTamrielConfig.mobTraits, PRESENCE.HIGH);
  assert.equal(getPref('livingMobTraits'), PRESENCE.HIGH);
  setPref('livingMobTraits', PRESENCE.OFF);
  assert.equal(LivingTamrielConfig.mobTraits, PRESENCE.OFF);

  // Test dungeonMobTraits synchronization
  assert.equal(LivingTamrielConfig.dungeonMobTraits, PRESENCE.MID);
  LivingTamrielConfig.dungeonMobTraits = PRESENCE.HIGH;
  assert.equal(LivingTamrielConfig.dungeonMobTraits, PRESENCE.HIGH);
  assert.equal(getPref('livingDungeonMobTraits'), PRESENCE.HIGH);
  setPref('livingDungeonMobTraits', PRESENCE.OFF);
  assert.equal(LivingTamrielConfig.dungeonMobTraits, PRESENCE.OFF);

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
    'features.livingRoadAdventurers.title',
    'features.livingRoadAdventurers.note',
    'features.livingNemesis.title',
    'features.livingNemesis.note',
    'features.livingTravel.title',
    'features.livingTravel.note',
    'features.livingCamps.title',
    'features.livingCamps.note',
    'features.livingNaval.title',
    'features.livingNaval.note',
    'features.livingMobTraits.title',
    'features.livingMobTraits.note',
    'features.livingDungeonMobTraits.title',
    'features.livingDungeonMobTraits.note',
    'features.livingAdventurerLoot.title',
    'features.livingAdventurerLoot.note',
    'features.livingAdventurerLoot.zero',
    'features.livingAdventurerLoot.supplies',
    'features.livingAdventurerLoot.standard',
    'features.livingAdventurerLoot.full',
  ];

  for (const k of requiredKeys) {
    assert.match(enCsv, new RegExp(`^${k.replace(/\./g, '\\.')},`, 'm'), `${k} missing in en catalog`);
    assert.match(ruCsv, new RegExp(`^${k.replace(/\./g, '\\.')},`, 'm'), `${k} missing in ru catalog`);
  }
});
