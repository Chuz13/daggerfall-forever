import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../chargenDom.mjs';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { defineLiveMaxHealth, defineLiveMaxMagicka } from '../../src/systems/chargen.js';
import { LOCALE_CATALOG } from '../../src/systems/localeCatalog.js';
import { snapshotPlayer, restorePlayer } from '../../src/systems/save/save.js';
import { SKILLS } from '../../src/systems/skills.js';
import { ELIXIR_OF_UNLIFE_KEY, ELIXIR_OF_UNLIFE_RECIPE, makePotion } from '../../src/systems/potions.js';
import { isPotion } from '../../src/systems/useItem.js';
import { parseMessage, parseStringTableCsv, _resetTextManagerForTests } from '../../src/systems/textManager.js';
import { NECRO_GRIMOIRE_BOOK_ID } from '../../src/systems/apotheosis/apotheosisCore.js';
import {
  applyLichdom,
  applyAncientLichdom,
  isLich,
  isAncientLich,
  cureLichdom,
} from '../../src/systems/necromancy/lichdomStatus.js';
import { readNecroGrimoire } from '../../src/systems/necromancy/necroGrimoire.js';
import { archLichdomSpell } from '../../src/systems/necromancy/necromanticSpells.js';
import { _resetTaintForTests } from '../../src/systems/necromancy/necroTaint.js';
import {
  LICHDOM_STYLE_ID,
  lichdomTabShown,
  selectLichdomSection,
  releaseLichdomPane,
  evaluateLichdomProgress,
  brewElixirOfUnlifeFromPack,
  transformToLichFromPane,
  transformToArchLichFromPane,
  drawLichdomPane,
} from '../../src/ui/lichdomPane.js';
import { mountEnhancedMenu } from '../../src/ui/enhanced/enhancedMenu.js';

function makeActor(id = 'lich_ui_hero') {
  const actor = {
    isPlayer: true,
    name: 'Mortal Scholar',
    characterId: id,
    level: 1,
    careerIndex: 12,
    career: { hitPointsPerLevel: 12, abilityFlagsAndSpellPointsBitfield: 0 },
    maxHealth: 120,
    rawMaxHealth: 120,
    health: 120,
    maxMagicka: 150,
    magicka: 150,
    fatigue: 2000,
    stats: {
      strength: 55,
      intelligence: 60,
      willpower: 55,
      agility: 55,
      endurance: 60,
      personality: 55,
      speed: 55,
      luck: 50,
    },
    skills: Array.from({ length: 35 }, () => 25),
    items: [],
    wagonItems: [],
    bagItems: [],
    furnishings: [],
    otherItems: [],
    activeEffects: [],
    spells: [],
    booksRead: [],
    goldPieces: 1000,
    bankAccounts: [],
    houses: [],
    necroTaint: 0,
  };
  defineLiveMaxHealth(actor);
  defineLiveMaxMagicka(actor);
  return actor;
}

function addReagent(entity, templateIndex, stackCount = 1) {
  entity.items.push({
    group: 'CreatureIngredients1',
    templateIndex,
    stackCount,
  });
}

function findButtons(root, textMatch = null) {
  const all = root.querySelectorAll('button');
  if (!textMatch) return all;
  return all.filter((btn) =>
    typeof textMatch === 'string' ? btn.textContent.includes(textMatch) : textMatch.test(btn.textContent),
  );
}

let savedPlayerSnapshot = null;

beforeEach(() => {
  _resetTextManagerForTests();
  _resetTaintForTests();
  releaseLichdomPane();
  savedPlayerSnapshot = {
    NecroGrimoireRead: playerEntity.NecroGrimoireRead,
    necroGrimoireRead: playerEntity.necroGrimoireRead,
    racialOverride: playerEntity.racialOverride,
    racialOverridePending: playerEntity.racialOverridePending,
    activeEffects: Array.isArray(playerEntity.activeEffects) ? [...playerEntity.activeEffects] : [],
    booksRead: Array.isArray(playerEntity.booksRead) ? [...playerEntity.booksRead] : [],
    items: Array.isArray(playerEntity.items) ? [...playerEntity.items] : [],
    spells: Array.isArray(playerEntity.spells) ? [...playerEntity.spells] : [],
    necroTaint: playerEntity.necroTaint,
    level: playerEntity.level,
    stats: playerEntity.stats ? { ...playerEntity.stats } : undefined,
    skills: Array.isArray(playerEntity.skills) ? [...playerEntity.skills] : playerEntity.skills,
  };
});

afterEach(() => {
  releaseLichdomPane();
  _resetTaintForTests();
  if (savedPlayerSnapshot) {
    playerEntity.NecroGrimoireRead = savedPlayerSnapshot.NecroGrimoireRead;
    playerEntity.necroGrimoireRead = savedPlayerSnapshot.necroGrimoireRead;
    playerEntity.racialOverride = savedPlayerSnapshot.racialOverride;
    playerEntity.racialOverridePending = savedPlayerSnapshot.racialOverridePending;
    playerEntity.activeEffects = savedPlayerSnapshot.activeEffects;
    playerEntity.booksRead = savedPlayerSnapshot.booksRead;
    playerEntity.items = savedPlayerSnapshot.items;
    playerEntity.spells = savedPlayerSnapshot.spells;
    playerEntity.necroTaint = savedPlayerSnapshot.necroTaint;
    playerEntity.level = savedPlayerSnapshot.level;
    if (savedPlayerSnapshot.stats) playerEntity.stats = savedPlayerSnapshot.stats;
    playerEntity.skills = savedPlayerSnapshot.skills;
  }
});

test('lichdomTabShown stays hidden for mortals and appears once Grimoire is read or Lichdom is active', () => {
  const mortal = makeActor('tab_vis');
  assert.equal(lichdomTabShown(mortal), false);

  mortal.NecroGrimoireRead = true;
  assert.equal(lichdomTabShown(mortal), true);

  mortal.NecroGrimoireRead = false;
  mortal.necroGrimoireRead = false;
  assert.equal(lichdomTabShown(mortal), false);

  mortal.booksRead.push(NECRO_GRIMOIRE_BOOK_ID);
  assert.equal(lichdomTabShown(mortal), true);

  const lich = makeActor('tab_lich');
  applyLichdom(lich);
  assert.equal(lichdomTabShown(lich), true);

  const arch = makeActor('tab_arch');
  applyAncientLichdom(arch);
  assert.equal(lichdomTabShown(arch), true);
});

test('Pause menu exposes Lichdom tab next to Apotheosis only after reading Grimoire', () => {
  playerEntity.NecroGrimoireRead = false;
  playerEntity.necroGrimoireRead = false;
  playerEntity.racialOverride = null;
  playerEntity.activeEffects = [];
  playerEntity.booksRead = [];

  const hostHidden = globalThis.document.createElement('div');
  const menuHidden = mountEnhancedMenu(hostHidden, { mode: 'pause', hooks: {}, onAction: () => {}, at: 'lichdom' });
  try {
    const labelsHidden = hostHidden
      .querySelector('.px-tabs')
      .children.map((btn) => btn.textContent.replace(/◆/g, '').trim());
    assert.equal(labelsHidden.includes('Lichdom'), false);
    assert.equal(labelsHidden.includes('Apotheosis'), true);
    const activeHidden = hostHidden
      .querySelector('.px-tabs')
      .children.find((btn) => /\bon\b/.test(btn.className))
      ?.textContent.replace(/◆/g, '')
      .trim();
    assert.equal(activeHidden, 'System');
  } finally {
    menuHidden.unmount();
  }

  readNecroGrimoire(playerEntity);
  assert.equal(lichdomTabShown(playerEntity), true);

  const hostShown = globalThis.document.createElement('div');
  const menuShown = mountEnhancedMenu(hostShown, { mode: 'pause', hooks: {}, onAction: () => {}, at: 'lichdom' });
  try {
    const labelsShown = hostShown
      .querySelector('.px-tabs')
      .children.map((btn) => btn.textContent.replace(/◆/g, '').trim());
    const apoIdx = labelsShown.indexOf('Apotheosis');
    const lichIdx = labelsShown.indexOf('Lichdom');
    assert.ok(apoIdx >= 0 && lichIdx === apoIdx + 1, 'Lichdom sits immediately next to Apotheosis');
    assert.ok(hostShown.querySelector('.lich-pane'), 'Lichdom pane renders when selected');
  } finally {
    menuShown.unmount();
  }
});

test('evaluateLichdomProgress tracks all Stage I and Stage II requirements, curses, reagents, and spells', () => {
  const actor = makeActor('eval_hero');
  actor.racialOverride = { kind: 'racialOverride', racial: 'vampirism', ended: false };
  const vampEval = evaluateLichdomProgress(actor);
  assert.equal(vampEval.conflictingCurse, 'vampirism');
  assert.equal(vampEval.lich.requirements.find((req) => req.id === 'noCurse').fulfilled, false);
  assert.equal(vampEval.lich.eligible, false);

  actor.racialOverride = null;
  readNecroGrimoire(actor);
  actor.level = 20;
  actor.skills[SKILLS.Mysticism] = 100;
  actor.stats.intelligence = 100;
  actor.stats.willpower = 100;
  for (const tpl of ELIXIR_OF_UNLIFE_RECIPE.ingredients) {
    addReagent(actor, tpl, 2);
  }

  const readyLich = evaluateLichdomProgress(actor);
  assert.equal(readyLich.grimoireRead, true);
  assert.equal(readyLich.hasElixirRecipe, true);
  assert.equal(readyLich.hasArchLichdomSpell, true);
  assert.equal(readyLich.canBrewElixir, true);
  assert.equal(readyLich.lich.fulfilledCount, 6);
  assert.equal(readyLich.lich.eligible, true);
  assert.equal(readyLich.lich.canTransformNow, false, 'needs brewed Elixir bottle first');
  assert.equal(readyLich.archlich.eligible, false, 'mortal cannot enter Stage II yet');

  actor.items.push(makePotion(ELIXIR_OF_UNLIFE_KEY));
  const withElixir = evaluateLichdomProgress(actor);
  assert.equal(withElixir.elixirCount, 1);
  assert.equal(withElixir.lich.canTransformNow, true);
});

test('brewElixirOfUnlifeFromPack atomically checks reagents and mints a canonical potion stack', () => {
  const actor = makeActor('brew_hero');
  addReagent(actor, 38, 1);
  addReagent(actor, 39, 1);
  addReagent(actor, 45, 1);
  // Missing 53 (Daedra's Heart)
  const failBrew = brewElixirOfUnlifeFromPack(actor);
  assert.equal(failBrew.ok, false);
  assert.equal(actor.items.length, 3, 'no reagents consumed when one is missing');

  addReagent(actor, 53, 2);
  const okBrew1 = brewElixirOfUnlifeFromPack(actor);
  assert.equal(okBrew1.ok, true);
  assert.equal(isPotion(okBrew1.item), true);
  assert.equal(okBrew1.item.potionRecipeKey, ELIXIR_OF_UNLIFE_KEY);
  assert.ok(okBrew1.item.currentCondition > 0);

  // Add missing 38, 39, 45 again to test stacking on second brew
  addReagent(actor, 38, 1);
  addReagent(actor, 39, 1);
  addReagent(actor, 45, 1);
  const okBrew2 = brewElixirOfUnlifeFromPack(actor);
  assert.equal(okBrew2.ok, true);
  const elixirs = actor.items.filter((item) => isPotion(item) && item.potionRecipeKey === ELIXIR_OF_UNLIFE_KEY);
  assert.equal(elixirs.length, 1, 'second brewed elixir merges into stack');
  assert.equal(elixirs[0].stackCount, 2);
});

test('transformToLichFromPane and transformToArchLichFromPane refuse safely when ineligible and ascend when qualified', () => {
  const actor = makeActor('ritual_safe');
  readNecroGrimoire(actor);
  actor.items.push(makePotion(ELIXIR_OF_UNLIFE_KEY));

  // Unqualified mortal must NOT die or lose the Elixir
  const earlyLich = transformToLichFromPane(actor);
  assert.equal(earlyLich.ok, false);
  assert.equal(actor.health, 120);
  assert.equal(isLich(actor), false);
  assert.equal(evaluateLichdomProgress(actor).elixirCount, 1);

  // Qualify for Stage I
  actor.level = 20;
  actor.skills[SKILLS.Mysticism] = 100;
  actor.stats.intelligence = 100;
  actor.stats.willpower = 100;

  const lichRes = transformToLichFromPane(actor, { nowMinutes: 1000 });
  assert.equal(lichRes.ok, true);
  assert.equal(isLich(actor), true);
  assert.equal(evaluateLichdomProgress(actor).elixirCount, 0, 'one Elixir consumed');
  assert.ok(actor.spells.some((sp) => sp.name === 'Paralyzing Touch'));
  assert.ok(actor.spells.some((sp) => sp.name === 'Mortal Disguise'));

  // Unqualified Lich for Archlich must NOT die/reconstitute
  const earlyArch = transformToArchLichFromPane(actor);
  assert.equal(earlyArch.ok, false);
  assert.equal(isAncientLich(actor), false);
  assert.equal(isLich(actor), true);

  // Qualify for Stage II
  actor.level = 30;
  actor.skills[SKILLS.Mysticism] = 175; // +30 from Lichdom = 205 (>= 200)
  actor.stats.intelligence = 95; // +25 from Lichdom = 120 (>= 115)
  actor.stats.willpower = 95; // +25 from Lichdom = 120 (>= 115)

  // Missing spell refuses safely
  actor.spells = actor.spells.filter((sp) => sp.index !== -52 && sp.name !== 'Arch-Lichdom');
  const noSpellArch = transformToArchLichFromPane(actor);
  assert.equal(noSpellArch.ok, false);

  actor.spells.push(archLichdomSpell());
  const archRes = transformToArchLichFromPane(actor, { nowMinutes: 2000 });
  assert.equal(archRes.ok, true);
  assert.equal(isAncientLich(actor), true);
  assert.ok(actor.spells.some((sp) => sp.name === 'Finger of Death'));
});

test('drawLichdomPane interactive flow drives Overview -> Stage I Brew & Transform -> Stage II Ritual', () => {
  const actor = makeActor('dom_flow');
  readNecroGrimoire(actor);
  actor.level = 30;
  actor.skills[SKILLS.Mysticism] = 175;
  actor.stats.intelligence = 100;
  actor.stats.willpower = 100;
  for (const tpl of ELIXIR_OF_UNLIFE_RECIPE.ingredients) {
    addReagent(actor, tpl, 1);
  }

  const host = globalThis.document.createElement('div');
  drawLichdomPane(host, { entity: actor });
  assert.ok(host.querySelector('.lich-pane'));
  assert.match(host.textContent, /Stage I: Lichdom/);
  assert.match(host.textContent, /Stage II: Archlich/);

  // Navigate to Stage I
  const openStage1 = findButtons(host, 'Open Lichdom Path')[0];
  assert.ok(openStage1);
  openStage1.click();
  assert.match(host.textContent, /Stage I: Ascension to Lichdom/);
  assert.match(host.textContent, /Wraith Essence/);

  const ascBtnBefore = findButtons(host, 'Drink Elixir & Become Lich')[0];
  assert.equal(ascBtnBefore.disabled, true);

  // Brew Elixir in UI
  const brewBtn = findButtons(host, 'Distil Elixir of Unlife')[0];
  assert.equal(brewBtn.disabled, false);
  brewBtn.click();
  assert.match(host.textContent, /Potion of Elixir of Unlife/);

  // Transform to Lich in UI
  const ascBtnAfter = findButtons(host, 'Drink Elixir & Become Lich')[0];
  assert.equal(ascBtnAfter.disabled, false);
  ascBtnAfter.click();
  assert.equal(isLich(actor), true);
  assert.match(host.textContent, /Immortal Lich/);

  // Switch to Stage II via rail
  const stage2Rail = findButtons(host, 'Stage II: Archlich')[0];
  assert.ok(stage2Rail);
  stage2Rail.click();
  assert.match(host.textContent, /Stage II: Ascension to Archlich/);

  const archBtn = findButtons(host, 'Perform Arch-Lichdom Ritual')[0];
  assert.equal(archBtn.disabled, false);
  archBtn.click();
  assert.equal(isAncientLich(actor), true);
  assert.match(host.textContent, /Ancient Lich/);

  releaseLichdomPane();
  selectLichdomSection('archlich');
  releaseLichdomPane();
});

test('Save compatibility: legacy and new snapshots preserve Grimoire, Lich, and Archlich visibility and state', () => {
  const fresh = makeActor('save_fresh');
  const freshSnap = JSON.parse(JSON.stringify(snapshotPlayer(fresh, {})));
  const freshRestored = makeActor('save_fresh_out');
  restorePlayer(freshRestored, freshSnap, new Map());
  assert.equal(lichdomTabShown(freshRestored), false);

  const grimoireActor = makeActor('save_grim');
  readNecroGrimoire(grimoireActor);
  const grimSnap = JSON.parse(JSON.stringify(snapshotPlayer(grimoireActor, {})));
  const grimRestored = makeActor('save_grim_out');
  restorePlayer(grimRestored, grimSnap, new Map());
  assert.equal(lichdomTabShown(grimRestored), true);

  const archActor = makeActor('save_arch');
  readNecroGrimoire(archActor);
  archActor.level = 30;
  archActor.skills[SKILLS.Mysticism] = 200;
  archActor.stats.intelligence = 120;
  archActor.stats.willpower = 120;
  applyLichdom(archActor, { nowMinutes: 500 });
  transformToArchLichFromPane(archActor, { nowMinutes: 600 });
  const archSnap = JSON.parse(JSON.stringify(snapshotPlayer(archActor, {})));
  const archRestored = makeActor('save_arch_out');
  restorePlayer(archRestored, archSnap, new Map());
  assert.equal(lichdomTabShown(archRestored), true);
  assert.equal(isAncientLich(archRestored), true);
  assert.equal(archRestored.necroTaint, 100);
  cureLichdom(archActor);
});

test('Localization: all 26 locales have all Lichdom UI keys with valid CSV and matching ICU placeholders', () => {
  const isLichKey = (key) => key.startsWith('lichdom.') || key === 'pause.tab.lichdom';
  const argNames = (pattern) => {
    const args = new Set();
    const walk = (nodes) => {
      for (const node of nodes) {
        if (typeof node === 'object' && node?.arg) {
          args.add(node.arg);
          if (node.options) for (const branch of node.options.values()) walk(branch);
        }
      }
    };
    walk(parseMessage(pattern));
    return [...args].sort();
  };

  const enRows = parseStringTableCsv(readFileSync(new URL('../../locales/en/Port_Strings.csv', import.meta.url), 'utf8'));
  const enLich = new Map(enRows.filter(([key]) => isLichKey(key)));
  assert.ok(enLich.size >= 70, `expected >= 70 Lichdom keys in English table, got ${enLich.size}`);

  const expectedArgs = new Map();
  for (const [key, val] of enLich) {
    assert.ok(val && val.trim().length > 0, `en missing value for ${key}`);
    expectedArgs.set(key, argNames(val));
  }

  const realLocales = LOCALE_CATALOG.filter((loc) => !loc.hidden);
  assert.equal(realLocales.length, 26);

  for (const loc of realLocales) {
    const csv = readFileSync(new URL(`../../locales/${loc.code}/Port_Strings.csv`, import.meta.url), 'utf8');
    const locMap = new Map(parseStringTableCsv(csv));
    for (const [key, args] of expectedArgs) {
      assert.ok(locMap.has(key), `${loc.code}: missing key ${key}`);
      const val = locMap.get(key);
      assert.ok(val && val.trim().length > 0, `${loc.code}: empty value for ${key}`);
      assert.deepEqual(argNames(val), args, `${loc.code}: ICU placeholder mismatch on ${key}`);
    }
  }
});
