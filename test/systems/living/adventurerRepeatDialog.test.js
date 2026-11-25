// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyCompanionEntityStamp,
  buildAdventurerMeetingChoiceSpec,
  buildWanderingAdventurerChoiceSpec,
  buildDungeonAdventurerChoiceSpec,
  ensureAdventurerDialogState,
} from '../../../src/systems/living/livingWorldSpawner.js';
import { beginSparEnd } from '../../../src/systems/living/sparSurrender.js';
import {
  getDungeonActiveAdventurer,
  getAdventurerSimRegistry,
  ROAD_ADVENTURER_SITUATION,
} from '../../../src/systems/living/adventurerSim.js';
import { LivingTamrielConfig, resetLivingConfig } from '../../../src/systems/living/livingConfig.js';
import { restoreLivingSaveData } from '../../../src/systems/living/livingDirector.js';
import { LIVING_WORDS } from '../../../src/systems/living/livingWords.js';
import { activateMobileEnemy } from '../../../src/player/mobileEnemyActivate.js';
import { SKILLS } from '../../../src/systems/skills.js';
import { parseStringTableCsv } from '../../../src/systems/textManager.js';

function makePlayer(overrides = {}) {
  const skills = new Array(35).fill(20);
  skills[SKILLS.Mercantile] = 50;
  skills[SKILLS.Etiquette] = 95;
  skills[SKILLS.Streetwise] = 95;
  return {
    name: 'TestHero',
    level: 10,
    goldPieces: 10000,
    items: [],
    skills,
    skillUses: new Array(35).fill(0),
    stats: {
      strength: 50,
      intelligence: 50,
      willpower: 50,
      agility: 50,
      endurance: 50,
      personality: 80,
      speed: 50,
      luck: 50,
    },
    sGroupReputations: new Array(11).fill(0),
    legalRep: { 0: 0 },
    regionalReputations: { 0: 0 },
    necroTaint: 0,
    ...overrides,
  };
}

function makeAdvFoe(adv, role = 'rival_adventurer') {
  return {
    seq: 1,
    livingRole: role,
    dead: false,
    _isSparring: false,
    _surrenderedSpar: false,
    _advRecord: adv,
    entity: {
      name: `${adv.name} (${adv.className})`,
      level: adv.level,
      health: 100,
      maxHealth: 100,
      currentHealth: 100,
      isClass: true,
      team: 'Adventurer',
      activeEffects: [],
    },
    ai: {
      feet: [0, 0, 0],
      yaw: 0,
      isHostile: false,
      detected: false,
      target: null,
      secondaryTarget: null,
      makeHostileToPlayer() {},
    },
  };
}

test('ADVENTURER_MEETING: post-wager repeat hides Wager & Forfeit, keeps Etiquette/Intimidate once, Hire & Decline', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  const player = makePlayer();
  const adv = { id: 10, name: 'Garrick', className: 'Knight', level: 8, trait: 'DUELIST', currentRegion: 0 };
  const foe = makeAdvFoe(adv, 'rival_adventurer');

  const spec1 = buildAdventurerMeetingChoiceSpec({
    adv,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    rng: () => 0.1,
  });
  assert.ok(spec1);
  assert.equal(spec1.options.length, 6);
  assert.deepEqual(spec1.options.map((o) => o.code), ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']);

  // Trigger wager spar, then end it with player winning
  spec1.options[0].action();
  assert.equal(foe._isSparring, true);
  assert.equal(foe._advDialog.used.wager, true);
  beginSparEnd(foe, { playerWon: true, foes: [foe], playerEntity: player, now: 1000 });
  assert.equal(foe._advDialog.sparOutcome, 'PLAYER_WON');

  // Re-open dialog after wager
  const spec2 = buildAdventurerMeetingChoiceSpec({
    adv,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.ok(spec2);
  assert.match(spec2.lines[0], new RegExp(LIVING_WORDS.adventurerReTalkAfterWin().slice(0, 15)));
  // Remaining: Etiquette, Intimidate, Hire, Decline (4 options, Wager & Forfeit hidden)
  assert.equal(spec2.options.length, 4);
  assert.deepEqual(spec2.options.map((o) => o.code), ['Digit1', 'Digit2', 'Digit3', 'Digit4']);

  // Use Etiquette once -> hidden on next talk
  spec2.options[0].action();
  const spec3 = buildAdventurerMeetingChoiceSpec({
    adv,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.ok(spec3);
  assert.equal(spec3.options.length, 3); // Intimidate, Hire, Decline

  // Use Intimidate once -> hidden on next talk
  spec3.options[0].action();
  const spec4 = buildAdventurerMeetingChoiceSpec({
    adv,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.ok(spec4);
  assert.equal(spec4.options.length, 2); // Hire, Decline
});

test('ADVENTURER_MEETING: post-loss header and CUTTHROAT exhaustion returns null', () => {
  const player = makePlayer();
  const adv = { id: 11, name: 'Vex', className: 'Rogue', level: 8, trait: 'CUTTHROAT', currentRegion: 0 };
  const foe = makeAdvFoe(adv, 'rival_adventurer');

  const spec1 = buildAdventurerMeetingChoiceSpec({
    adv,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    rng: () => 0.1,
  });
  assert.ok(spec1);
  // CUTTHROAT has no Hire: Wager, Etiquette, Intimidate, Decline, Forfeit (5)
  assert.equal(spec1.options.length, 5);

  spec1.options[0].action();
  beginSparEnd(foe, { playerWon: false, foes: [foe], playerEntity: player, now: 2000 });
  assert.equal(foe._advDialog.sparOutcome, 'PLAYER_LOST');

  const spec2 = buildAdventurerMeetingChoiceSpec({
    adv,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.ok(spec2);
  assert.match(spec2.lines[0], new RegExp(LIVING_WORDS.adventurerReTalkAfterLoss().slice(0, 15)));
  assert.equal(spec2.options.length, 3); // Etiquette, Intimidate, Decline

  spec2.options[0].action(); // Etiquette
  const spec3 = buildAdventurerMeetingChoiceSpec({
    adv,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.ok(spec3);
  spec3.options[0].action(); // Intimidate

  const spec4 = buildAdventurerMeetingChoiceSpec({
    adv,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.equal(spec4, null, 'CUTTHROAT with all actionable options spent returns null');
});

test('WANDERING_ADVENTURER: Decline burns nothing; Intel & Wager hide once used; Extort locks dialog cold', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  const player = makePlayer();
  const adv = { id: 12, name: 'Kaelen', className: 'Ranger', level: 6, trait: 'HONORABLE', currentRegion: 0 };
  const foe = makeAdvFoe(adv, 'wandering_adventurer');

  const spec1 = buildWanderingAdventurerChoiceSpec({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    rng: () => 0.1,
  });
  assert.ok(spec1);
  assert.equal(spec1.options.length, 5); // Intel, Hire, Wager, Extort, Leave

  // Leave burns nothing
  spec1.options[4].action();
  const specRetry = buildWanderingAdventurerChoiceSpec({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.ok(specRetry);
  assert.equal(specRetry.options.length, 5);
  assert.match(specRetry.lines[0], new RegExp(LIVING_WORDS.adventurerReTalkPeaceful().slice(0, 15)));

  // Use Share Intel -> hidden on next open
  specRetry.options[0].action();
  const specAfterIntel = buildWanderingAdventurerChoiceSpec({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.ok(specAfterIntel);
  assert.equal(specAfterIntel.options.length, 4); // Hire, Wager, Extort, Leave

  // Wager Spar -> beginSparEnd -> hidden on next open
  specAfterIntel.options[1].action();
  beginSparEnd(foe, { playerWon: true, foes: [foe], playerEntity: player, now: 3000 });
  const specAfterWager = buildWanderingAdventurerChoiceSpec({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.ok(specAfterWager);
  assert.equal(specAfterWager.options.length, 3); // Hire, Extort, Leave

  // Successful Extort -> sets extorted = true, subsequent build returns null
  specAfterWager.options[1].action();
  assert.equal(foe._advDialog.extorted, true);
  const specAfterExtort = buildWanderingAdventurerChoiceSpec({
    adv,
    situation: ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP,
    playerEntity: player,
    foeRecord: foe,
    regionIndex: 0,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.equal(specAfterExtort, null);
});

test('applyCompanionEntityStamp restores 100% HP and clears spar surrender flags on hire', () => {
  const adv = { id: 13, name: 'Baren', className: 'Warrior', level: 8, trait: 'HONORABLE' };
  const foe = makeAdvFoe(adv, 'rival_adventurer');
  foe._isSparring = true;
  foe.entity.health = 20;
  foe.entity.currentHealth = 20;
  foe.entity.maxHealth = 100;
  beginSparEnd(foe, { playerWon: true, foes: [foe], now: 1000 });

  assert.equal(foe._surrenderedSpar, true);
  assert.equal(foe._sparKneeling, true);
  assert.ok(foe._sparGraceLeft > 0);

  applyCompanionEntityStamp(foe, {
    id: 13,
    name: 'Baren',
    displayName: 'Baren (Warrior)',
    className: 'Warrior',
    level: 8,
    gearTier: 2,
    trait: 'HONORABLE',
  });

  assert.equal(foe.entity.health, foe.entity.maxHealth);
  assert.equal(foe.entity.currentHealth, foe.entity.maxHealth);
  assert.equal(foe._surrenderedSpar, false);
  assert.equal(foe._sparKneeling, false);
  assert.equal(foe._sparGraceLeft, 0);
  assert.equal(foe._isSparring, false);
  assert.equal(foe.livingRole, 'recruited_companion');
});

test('getDungeonActiveAdventurer ignores stale interceptedQuests when allowQuestCompetition is false, and buildDungeonAdventurerChoiceSpec supports repeat dialog', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  assert.equal(LivingTamrielConfig.allowQuestCompetition, false);

  const reg = getAdventurerSimRegistry();
  reg.interceptedQuests = {
    dung_99: {
      adventurerId: 77,
      adventurerName: 'Valen',
      adventurerClass: 'Rogue',
      adventurerLevel: 8,
      adventurerTrait: 'ARROGANT',
      recovered: false,
    },
  };
  assert.equal(getDungeonActiveAdventurer('dung_99', 0), null, 'interceptedQuests must be ignored while competition is off');

  const player = makePlayer();
  const adv = { id: 77, name: 'Valen', className: 'Rogue', level: 8, trait: 'ARROGANT', currentRegion: 0 };
  const foe = makeAdvFoe(adv, 'rival_adventurer');
  const spec1 = buildDungeonAdventurerChoiceSpec({
    adv,
    intercepted: null,
    locationId: 'dung_99',
    regionIndex: 0,
    playerEntity: player,
    foeRecord: foe,
    rng: () => 0.1,
  });
  assert.ok(spec1);
  assert.equal(spec1.options.length, 5); // Wager, Etiquette, Intimidate, Hire, Decline

  spec1.options[0].action();
  beginSparEnd(foe, { playerWon: true, foes: [foe], playerEntity: player, now: 4000 });

  const spec2 = buildDungeonAdventurerChoiceSpec({
    adv,
    intercepted: null,
    locationId: 'dung_99',
    regionIndex: 0,
    playerEntity: player,
    foeRecord: foe,
    state: foe._advDialog,
    rng: () => 0.1,
  });
  assert.ok(spec2);
  assert.equal(spec2.options.length, 4); // Etiquette, Intimidate, Hire, Decline

  // Intercepted path still re-opens if buyout failed, and returns null once recovered
  const intercepted = { recovered: false, forfeited: false };
  const intSpec1 = buildDungeonAdventurerChoiceSpec({
    adv,
    intercepted,
    locationId: 'dung_99',
    regionIndex: 0,
    playerEntity: makePlayer({ goldPieces: 0 }),
    foeRecord: foe,
  });
  assert.ok(intSpec1);
  intSpec1.options[1].action(); // Buyout fails (0 gold)
  assert.equal(intercepted.recovered, false);
  assert.ok(buildDungeonAdventurerChoiceSpec({ adv, intercepted, locationId: 'dung_99', regionIndex: 0, playerEntity: player }));

  intercepted.recovered = true;
  assert.equal(buildDungeonAdventurerChoiceSpec({ adv, intercepted, locationId: 'dung_99', regionIndex: 0, playerEntity: player }), null);
});

test('activateMobileEnemy opens living dialog for peaceful adventurers in talk/grab but not when hostile, sparring, info, or steal', () => {
  const player = makePlayer();
  let opened = 0;
  const openLiving = () => {
    opened++;
    return true;
  };
  const adv = { id: 1, name: 'Kaelen', className: 'Ranger', level: 5, trait: 'HONORABLE' };

  const peaceful = makeAdvFoe(adv, 'wandering_adventurer');
  assert.equal(activateMobileEnemy(peaceful, 1.5, 'talk', player, { openLiving }), true);
  assert.equal(opened, 1);
  assert.equal(activateMobileEnemy(peaceful, 1.5, 'grab', player, { openLiving }), true);
  assert.equal(opened, 2);

  // Info mode must NOT open dialog
  assert.equal(activateMobileEnemy(peaceful, 1.5, 'info', player, { openLiving, hud: () => {} }), true);
  assert.equal(opened, 2);

  // Hostile or active sparring must NOT open dialog
  const hostile = makeAdvFoe(adv, 'rival_adventurer');
  hostile.ai.isHostile = true;
  assert.equal(activateMobileEnemy(hostile, 1.5, 'talk', player, { openLiving, hud: () => {} }), true);
  assert.equal(opened, 2);

  const sparring = makeAdvFoe(adv, 'rival_adventurer');
  sparring._isSparring = true;
  assert.equal(activateMobileEnemy(sparring, 1.5, 'talk', player, { openLiving, hud: () => {} }), true);
  assert.equal(opened, 2);
});

test('all 26 locales have translated non-English strings and preserved {name} placeholders for the 5 new keys', () => {
  const catalog = [
    'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja',
    'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant',
  ];
  const keys = [
    'living.adventurer.reTalkAfterWin',
    'living.adventurer.reTalkAfterLoss',
    'living.adventurer.reTalkPeaceful',
    'living.adventurer.settledCold',
    'living.roadAdv.extortedCold',
  ];
  const rdMap = (loc) => new Map(parseStringTableCsv(readFileSync(new URL(`../../../locales/${loc}/Port_Strings.csv`, import.meta.url), 'utf8')));
  const enMap = rdMap('en');

  for (const loc of catalog) {
    const locMap = rdMap(loc);
    for (const k of keys) {
      const val = locMap.get(k);
      assert.ok(val && val.length > 0, `Missing ${k} in ${loc}`);
      if (loc !== 'en') {
        assert.notEqual(val, enMap.get(k), `${loc} ${k} must be translated`);
      }
      if (k === 'living.adventurer.settledCold' || k === 'living.roadAdv.extortedCold') {
        assert.match(val, /\{name\}/, `${loc} ${k} must preserve {name}`);
      }
    }
  }
});
