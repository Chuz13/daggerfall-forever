// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  resolveWanderingAdventurerInteraction,
  ROAD_ADVENTURER_SITUATION,
  WANDERING_OUTCOME,
  getAdventurerSimRegistry,
  setRegionalDungeonProvider,
} from '../../../src/systems/living/adventurerSim.js';
import {
  buildWanderingAdventurerChoiceSpec,
  executeLivingConsoleCommand,
  LIVING_SITE_KINDS,
} from '../../../src/systems/living/livingWorldSpawner.js';
import {
  grantRoadIntelBuff,
  getActiveRoadIntelBuff,
  buildRoadIntelHudChip,
  evaluateTravelInterruption,
  evaluateAmbushStealthRoll,
  ROAD_INTEL_DURATION_MINUTES,
} from '../../../src/systems/living/travelDirector.js';
import {
  statusTiles,
  STATUS_GLYPHS,
  statusGlyphSvg,
  statusGlyphColor32,
} from '../../../src/ui/hud/hudStatus.js';
import { statusTip } from '../../../src/ui/hud/statusTips.js';
import {
  restoreLivingSaveData,
  getLivingSaveData,
} from '../../../src/systems/living/livingDirector.js';
import { resetLivingConfig } from '../../../src/systems/living/livingConfig.js';
import { setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE } from '../../../src/systems/living/regionState.js';
import { LIVING_WORDS } from '../../../src/systems/living/livingWords.js';
import { SKILLS } from '../../../src/systems/skills.js';
import { parseStringTableCsv } from '../../../src/systems/textManager.js';

function makePlayer(overrides = {}) {
  const skills = new Array(35).fill(30);
  skills[SKILLS.Etiquette] = 50;
  skills[SKILLS.Streetwise] = 50;
  skills[SKILLS.Stealth] = 40;
  return {
    name: 'TestHero',
    level: 10,
    health: 50,
    maxHealth: 100,
    fatigue: 400,
    goldPieces: 1000,
    items: [],
    skills,
    skillUses: new Array(35).fill(0),
    stats: {
      strength: 50,
      intelligence: 50,
      willpower: 50,
      agility: 50,
      endurance: 50,
      personality: 65,
      speed: 50,
      luck: 50,
    },
    legalRep: { 17: 0, 64: 0 },
    regionalReputations: { 17: 0, 64: 0 },
    ...overrides,
  };
}

test('SHARE_INTEL: ROADSIDE_CAMP restores +15 HP, Fatigue, practices Etiquette, and preserves existing HP invariant', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  setRegionalDungeonProvider(null);

  const player = makePlayer({ health: 50, maxHealth: 100, fatigue: 400 });
  const adv = { id: 1, name: 'Kaelen', className: 'Ranger', level: 6, trait: 'HONORABLE', currentRegion: 17 };

  const res = resolveWanderingAdventurerInteraction({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP,
    playerEntity: player,
    action: 'SHARE_INTEL',
    regionIndex: 17,
    nowMinutes: 1000,
  });

  assert.equal(res.outcome, WANDERING_OUTCOME.INTEL_SHARED);
  assert.equal(res.healed, true);
  assert.equal(res.healthRestored, 15);
  assert.equal(player.health, 65);
  assert.ok(res.fatigueRestored > 0, 'fatigueRestored should be > 0');
  assert.ok(player.fatigue > 400, 'player.fatigue should increase');
  assert.equal(res.repDelta, 1);
  assert.equal(res.practicedSkill, 'Etiquette');
  assert.equal(player.skillUses[SKILLS.Etiquette], 1);
  assert.equal(res.roadWarningGranted, true);
  assert.equal(res.roadIntelHours, 24);
});

test('SHARE_INTEL: SKIRMISH_WITH_MONSTERS grants gold, +2 rep, Streetwise, and 24h road buff', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  const player = makePlayer({ goldPieces: 100 });
  const adv = { id: 2, name: 'Garrick', className: 'Warrior', level: 5, trait: 'HONORABLE', currentRegion: 17 };

  const res = resolveWanderingAdventurerInteraction({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS,
    playerEntity: player,
    action: 'SHARE_INTEL',
    regionIndex: 17,
    nowMinutes: 2000,
  });

  assert.equal(res.goldDelta, 60); // max(25, 5 * 12)
  assert.equal(player.goldPieces, 160);
  assert.equal(res.repDelta, 2);
  assert.equal(res.practicedSkill, 'Streetwise');
  assert.equal(res.roadWarningGranted, true);
  assert.equal(getActiveRoadIntelBuff(2000).active, true);
});

test('SHARE_INTEL: Iliac Bay slot fallenRemains & Outer Province numeric mapId reveal via discoverDungeon', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  // 1) Iliac Bay (region 17) slot-based fallenRemains
  const reg = getAdventurerSimRegistry();
  reg.fallenRemains['dungeon_17_3'] = [
    { adventurerName: 'Valen', className: 'Battlemage', level: 12, dungeonName: 'Daggerfall Crypt [Crypt]' },
  ];

  const discoveredCalls = [];
  const resBay = resolveWanderingAdventurerInteraction({
    adv: { id: 3, name: 'Cyrus', className: 'Knight', level: 8, trait: 'HONORABLE', currentRegion: 17 },
    situation: ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
    playerEntity: makePlayer(),
    action: 'SHARE_INTEL',
    regionIndex: 17,
    nowMinutes: 500,
    resolveRegionDungeon: ({ regionIndex, slotIndex }) => {
      assert.equal(regionIndex, 17);
      assert.equal(slotIndex, 3);
      return { mapId: 17003, name: 'Shedungent', shown: 'Shedungent', regionName: 'Daggerfall', discovered: false };
    },
    discoverDungeon: (info) => {
      discoveredCalls.push(info);
      return { ...info, shown: info.name, newlyDiscovered: true };
    },
  });

  assert.equal(resBay.dungeonIntel?.type, 'FALLEN_REMAINS');
  assert.equal(resBay.dungeonIntel?.fallenName, 'Valen');
  assert.equal(resBay.dungeonIntel?.dungeonName, 'Shedungent');
  assert.equal(resBay.dungeonIntel?.newlyDiscovered, true);
  assert.equal(discoveredCalls.length, 1);

  // 2) Outer Province (region 64 - Skyrim) numeric mapId via setRegionalDungeonProvider
  restoreLivingSaveData(null);
  setRegionalDungeonProvider((r) =>
    r === 64
      ? [{ id: 640042, mapId: 640042, name: 'Bleak Falls Barrow', type: 'Crypt', px: 500, py: 300 }]
      : null,
  );
  const regProv = getAdventurerSimRegistry();
  regProv.dungeonCooldowns['640042'] = 4;

  const provDiscovered = [];
  const resProv = resolveWanderingAdventurerInteraction({
    adv: { id: 4, name: 'Nulfaga', className: 'Mage', level: 10, trait: 'DUELIST', currentRegion: 64 },
    situation: ROAD_ADVENTURER_SITUATION.RETURNING_WITH_SPOILS,
    playerEntity: makePlayer(),
    action: 'SHARE_INTEL',
    regionIndex: 64,
    nowMinutes: 600,
    discoverDungeon: (info) => {
      provDiscovered.push(info);
      return { ...info, shown: info.name, newlyDiscovered: true };
    },
  });

  assert.equal(resProv.dungeonIntel?.type, 'CLEARED_COOLDOWN');
  assert.equal(resProv.dungeonIntel?.daysLeft, 4);
  assert.equal(resProv.dungeonIntel?.mapId, 640042);
  assert.match(resProv.dungeonIntel?.dungeonName || '', /Bleak Falls Barrow/);
  assert.equal(provDiscovered.length, 1);

  setRegionalDungeonProvider(null);
});

test('SHARE_INTEL: falls back to neighbor crisis for Road News when current region is at PEACE', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  // Region 17 (Daggerfall) at PEACE, neighbor 18 (Glenpoint) or 19 (Glenumbra Moors) in WAR
  setRegionCrisis(17, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  setRegionCrisis(18, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);

  const res = resolveWanderingAdventurerInteraction({
    adv: { id: 5, name: 'Medora', className: 'Sorcerer', level: 7, trait: 'HONORABLE', currentRegion: 17 },
    situation: ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
    playerEntity: makePlayer(),
    action: 'SHARE_INTEL',
    regionIndex: 17,
    nowMinutes: 100,
  });

  assert.ok(res.roadNews, 'roadNews should resolve from neighbor crisis');
  assert.equal(res.roadNews.isNeighbor, true);
  assert.ok(res.roadNews.rumor.length > 0);
});

test('SHARE_INTEL: GUARDED CUTTHROAT withholds deep intel on low social stats, shares on high Streetwise', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  const reg = getAdventurerSimRegistry();
  reg.fallenRemains['dungeon_17_2'] = [
    { adventurerName: 'Lhotun', className: 'Warrior', level: 5, dungeonName: 'Daggerfall Keep' },
  ];

  const lowSocial = makePlayer();
  lowSocial.skills[SKILLS.Streetwise] = 20;
  lowSocial.stats.personality = 30;
  const adv = { id: 6, name: 'Vex', className: 'Assassin', level: 6, trait: 'CUTTHROAT', currentRegion: 17 };

  const resLow = resolveWanderingAdventurerInteraction({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
    playerEntity: lowSocial,
    action: 'SHARE_INTEL',
    regionIndex: 17,
  });
  assert.equal(resLow.traitTone, 'GUARDED');
  assert.equal(resLow.dungeonIntel, null);

  const highSocial = makePlayer();
  highSocial.skills[SKILLS.Streetwise] = 65;
  const resHigh = resolveWanderingAdventurerInteraction({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
    playerEntity: highSocial,
    action: 'SHARE_INTEL',
    regionIndex: 17,
  });
  assert.equal(resHigh.traitTone, 'GUARDED');
  assert.equal(resHigh.dungeonIntel?.type, 'FALLEN_REMAINS');
});

test('travelDirector: 24h road-intel buff lowers interruption chance, boosts ambush stealth, and round-trips in save data', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const startMin = 10000;
  const buff = grantRoadIntelBuff(17, startMin);
  assert.equal(buff.durationHours, 24);
  assert.equal(buff.untilMinute, startMin + ROAD_INTEL_DURATION_MINUTES);
  assert.equal(getActiveRoadIntelBuff(startMin + 60).active, true);
  assert.equal(getActiveRoadIntelBuff(startMin + ROAD_INTEL_DURATION_MINUTES + 1).active, false);

  // Save/load round-trip
  const saved = getLivingSaveData();
  restoreLivingSaveData(null);
  assert.equal(getActiveRoadIntelBuff(startMin + 60).active, false);
  restoreLivingSaveData(saved);
  assert.equal(getActiveRoadIntelBuff(startMin + 60).active, true);
  assert.equal(getActiveRoadIntelBuff(startMin + 60).regionIndex, 17);

  // Interruption check reports roadIntelActive and reduces chance (rng=0.05 fails reduced ~2% chance)
  const travelRes = evaluateTravelInterruption({
    regionIndex: 17,
    playerLuck: 50,
    nowMinutes: startMin + 60,
    tripMinutes: 300,
    rng: () => 0.05,
  });
  assert.equal(travelRes.roadIntelActive, true);
  assert.equal(travelRes.shouldInterrupt, false);

  // Stealth ambush roll receives +15 contextBonus when road intel is active
  const baseRoll = evaluateAmbushStealthRoll(30, 50, () => 0.5, null);
  const buffedRoll = evaluateAmbushStealthRoll(30, 50, () => 0.5, { nowMinutes: startMin + 60 });
  assert.equal(buffedRoll.totalScore - baseRoll.totalScore, 15);
});

test('buildWanderingAdventurerChoiceSpec: dynamic label, consequence lines, sound, notebook, and repeat hide', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  setRegionCrisis(17, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.MID);

  const player = makePlayer({ goldPieces: 200 });
  const adv = { id: 7, name: 'Barenziah', className: 'Mage', level: 5, trait: 'HONORABLE', currentRegion: 17 };
  const foe = { seq: 1, livingRole: 'wandering_adventurer', dead: false };
  const said = [];
  const sounds = [];
  const notes = [];

  const spec = buildWanderingAdventurerChoiceSpec({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 17,
    nowMinutes: 3000,
    say: (msg) => said.push(msg),
    playSound: (id) => sounds.push(id),
    addNote: (txt) => notes.push(txt),
    resolveRegionDungeon: () => ({ mapId: 17009, name: 'Crypt of Hearts', shown: 'Crypt of Hearts', regionName: 'Daggerfall' }),
    discoverDungeon: (d) => ({ ...d, shown: d.name, newlyDiscovered: true }),
  });

  assert.ok(spec);
  assert.ok(spec.options[0].label.includes(LIVING_WORDS.roadAdvOptionIntelSkirmish()));

  spec.options[0].action();
  assert.equal(foe._advDialog.used.intel, true);
  assert.ok(sounds.length > 0, 'skirmish gold reward should play coin sound');
  assert.ok(notes.length === 1, 'dungeon intel should be added to notebook');
  assert.ok(said.some((l) => l.includes('Gold Pieces')), 'should report gold gained');
  assert.ok(said.some((l) => l.includes('Crypt of Hearts')), 'should report dungeon intel');
  assert.ok(said.some((l) => l.includes('24h')), 'should report 24h road buff');

  // Repeat open hides option 1
  const specRepeat = buildWanderingAdventurerChoiceSpec({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 17,
    nowMinutes: 3005,
    state: foe._advDialog,
  });
  assert.ok(specRepeat);
  assert.ok(!specRepeat.options.some((o) => o.label.includes(LIVING_WORDS.roadAdvOptionIntelSkirmish())));
});

test('console: /living spawn adv <camp|road|skirmish|spoils> forces situation and /living status shows roadIntel', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const stood = [];
  const out = executeLivingConsoleCommand(['spawn', 'adv', 'spoils'], {
    regionIndex: 17,
    playerFeet: [0, 0, 0],
    heightAt: () => 0,
    playerEntity: makePlayer(),
    nowMinutes: 1000,
    sceneHost: { standBlueprint: (bp) => stood.push(bp) },
  });
  assert.match(out, /RETURNING_WITH_SPOILS/);
  assert.equal(stood[0]?.kind, LIVING_SITE_KINDS.WANDERING_ADVENTURER);
  assert.equal(stood[0]?.meta?.situation, ROAD_ADVENTURER_SITUATION.RETURNING_WITH_SPOILS);

  grantRoadIntelBuff(17, 1000);
  const status = executeLivingConsoleCommand(['status'], {
    regionIndex: 17,
    nowMinutes: 1000,
  });
  assert.match(status, /roadIntel=24h/);
});

test('all 26 locales have translated non-English strings and preserved placeholders for all 19 new keys', () => {
  const catalog = [
    'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja',
    'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant',
  ];
  const keys = [
    'living.notify.fatigueGained',
    'living.notify.healthGained',
    'living.roadAdv.intelCamp',
    'living.roadAdv.intelCleared',
    'living.roadAdv.intelDiscovered',
    'living.roadAdv.intelFallen',
    'living.roadAdv.intelGuarded',
    'living.roadAdv.intelIntercepted',
    'living.roadAdv.intelRoad',
    'living.roadAdv.intelSkirmish',
    'living.roadAdv.intelSpoils',
    'living.roadAdv.newsLine',
    'living.roadAdv.notifyMapUpdated',
    'living.roadAdv.notifySafeRoad',
    'living.roadAdv.notifySkill',
    'living.roadAdv.optionIntelCamp',
    'living.roadAdv.optionIntelRoad',
    'living.roadAdv.optionIntelSkirmish',
    'living.roadAdv.optionIntelSpoils',
    'living.roadIntel.hudAria',
    'living.roadIntel.hudAriaRegion',
    'living.roadIntel.hudFoot',
    'living.roadIntel.hudMeta',
    'living.roadIntel.hudName',
    'living.roadIntel.hudTipAmbush',
    'living.roadIntel.hudTipRegion',
    'living.roadIntel.hudTipStealth',
    'living.roadIntel.timerHours',
    'living.roadIntel.timerMinutes',
  ];
  const rdMap = (loc) =>
    new Map(parseStringTableCsv(readFileSync(new URL(`../../../locales/${loc}/Port_Strings.csv`, import.meta.url), 'utf8')));
  const enMap = rdMap('en');

  for (const loc of catalog) {
    const locMap = rdMap(loc);
    for (const k of keys) {
      const enVal = enMap.get(k);
      const val = locMap.get(k);
      assert.ok(val && val.length > 0, `Missing ${k} in ${loc}`);
      if (loc !== 'en') {
        assert.notEqual(val, enVal, `${loc} ${k} must be translated`);
      }
      const placeholders = [...(enVal?.matchAll(/\{([a-zA-Z]+)\}/g) ?? [])].map((m) => m[1]);
      for (const ph of placeholders) {
        assert.match(val, new RegExp(`\\{${ph}\\}`), `${loc} ${k} missing {${ph}}`);
      }
    }
  }
});

test('HUD buff chip: buildRoadIntelHudChip, statusTiles, 16x16 glyph, and statusTip card work end-to-end', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  assert.equal(buildRoadIntelHudChip(1000), null, 'inactive buff returns null');

  const startMin = 5000;
  grantRoadIntelBuff(17, startMin);

  // Freshly granted: 24h, not blinking
  const fresh = buildRoadIntelHudChip(startMin);
  assert.ok(fresh);
  assert.equal(fresh.active, true);
  assert.equal(fresh.foot, '24h');
  assert.equal(fresh.blink, false);
  assert.equal(fresh.regionName, 'Daggerfall');

  // Final hour (45m left): switches to minutes and blinks
  const ending = buildRoadIntelHudChip(startMin + ROAD_INTEL_DURATION_MINUTES - 45);
  assert.ok(ending);
  assert.equal(ending.foot, '45m');
  assert.equal(ending.blink, true);

  // Outer province (region 64 - Skyrim)
  restoreLivingSaveData(null);
  grantRoadIntelBuff(64, startMin);
  const prov = buildRoadIntelHudChip(startMin);
  assert.ok(prov);
  assert.ok(prov.regionName && prov.regionName.length > 0);

  // Expired returns null
  assert.equal(buildRoadIntelHudChip(startMin + ROAD_INTEL_DURATION_MINUTES), null);

  // Glyph is strictly 16x16 and renders SVG + Color32
  const glyph = STATUS_GLYPHS.road_intel;
  assert.ok(glyph);
  assert.equal(glyph.rows.length, 16);
  for (const row of glyph.rows) assert.equal(row.length, 16);
  assert.ok(statusGlyphSvg('road_intel')?.includes('<svg'));
  assert.equal(statusGlyphColor32('road_intel')?.width, 16);

  // statusTiles + statusTip
  const tiles = statusTiles({ roadIntel: fresh });
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].key, 'road_intel');
  assert.equal(tiles[0].kind, 'buff');
  assert.equal(tiles[0].glyph, 'road_intel');
  assert.equal(tiles[0].foot, '24h');

  const tip = statusTip(tiles[0], null);
  assert.ok(tip);
  assert.equal(tip.title, LIVING_WORDS.roadIntelHudName());
  assert.equal(tip.meta, LIVING_WORDS.roadIntelHudMeta());
  assert.ok(tip.lines.some((l) => l.includes('Halves road ambush')));
  assert.ok(tip.lines.some((l) => l.includes('+15 Stealth')));
  assert.ok(tip.lines.some((l) => l.includes('Daggerfall')));
  assert.equal(tip.foot, '24h remaining');
});
