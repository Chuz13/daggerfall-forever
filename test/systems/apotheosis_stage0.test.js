import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  REQUIRED_FATE_WEIGHT,
  REQUIRED_ARTIFACTS_COUNT,
  TOTAL_FATE_TRIGGERS,
  TOTAL_CANONICAL_ARTIFACTS,
  APOTHEOSIS_STAGES,
  APOTHEOSIS_QUEST_STEPS,
  APOTHEOSIS_SOURCES,
  APOTHEOSIS_PORTFOLIOS,
  NECRO_GRIMOIRE_BOOK_ID,
  canonicalArtifactName,
  defaultApotheosisState,
  ensureApotheosisState,
  recordBookRead,
  recordNemesisDefeated,
  recordQuestCompleted,
  artifactSubTypeOf,
  isEquippedOnEntity,
  scanInventoryArtifactsForApotheosis,
  mintCanonicalArtifact,
  grantArtifactPack,
  evaluateFateWeight,
  canStartApotheosisViaArtifacts,
  startApotheosisFromMantella,
  startApotheosisFromArtifacts,
  completeApotheosisQuestline,
  selectApotheosisPortfolio,
  setDebugFateWeight,
  resetApotheosisForDebug,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import { EQUIP_SLOTS, equipTableOf } from '../../src/systems/equip.js';
import { SKILLS } from '../../src/systems/skills.js';
import { reportPlayerKill } from '../../src/systems/playerKills.js';
import { applyLichdom, applyAncientLichdom, isAnyLich } from '../../src/systems/necromancy/lichdomStatus.js';
import { createVampirismCurse } from '../../src/systems/vampirism.js';
import { createLycanthropyCurse } from '../../src/systems/lycanthropy.js';
import { setFirmamentTree, _resetFirmamentLiveForTests } from '../../src/systems/firmamentLive.js';
import { saveOfflineRecord as saveFirmRecord, _resetOfflineFirmamentForTests } from '../../src/systems/offlineFirmament.js';
import { renownXpFor } from '../../src/net/renown.js';
import { saveOfflineRecord as saveProfRecord, _resetOfflineProfessionsForTests } from '../../src/systems/offlineProfessions.js';
import { discoverLocation, snapshotDiscovery, restoreDiscovery } from '../../src/systems/discovery.js';
import { SHIP_TYPES } from '../../src/systems/banking.js';
import { inheritOfflineHome, _resetForTests as resetOfflineHomes } from '../../src/systems/offlineHomes.js';
import { recordNemesisMemory } from '../../src/systems/living/nemesisHost.js';
import { snapshotPlayer, restorePlayer } from '../../src/systems/save/save.js';
import { PREF_DEFAULTS, getPref, setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { executeConsoleCommand, getConsoleCommand } from '../../src/systems/consoleCommands.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { LOCALE_CATALOG } from '../../src/systems/localeCatalog.js';
import { parseStringTableCsv, parseMessage, _resetTextManagerForTests } from '../../src/systems/textManager.js';

function makeFreshEntity(characterId = 'apo_fresh') {
  return {
    name: 'Tester',
    characterId,
    level: 1,
    maxHealth: 50,
    rawMaxHealth: 50,
    goldPieces: 0,
    stats: {
      strength: 40,
      intelligence: 40,
      willpower: 40,
      agility: 40,
      endurance: 40,
      personality: 40,
      speed: 40,
      luck: 40,
    },
    skills: {},
    items: [],
    bankAccounts: [],
    houses: [],
    ownedShip: SHIP_TYPES.None,
    activeEffects: [],
    spells: [],
  };
}

let savedLocalStorageDescriptor;
let initialDiscoverySnap;

function installMemoryStorage() {
  const store = new Map();
  const mock = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true, writable: true });
}

beforeEach(() => {
  savedLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  initialDiscoverySnap = snapshotDiscovery();
  installMemoryStorage();
  _resetTextManagerForTests();
  resetPrefs();
  _resetFirmamentLiveForTests();
  _resetOfflineFirmamentForTests();
  _resetOfflineProfessionsForTests();
  resetOfflineHomes();
});

afterEach(() => {
  restoreDiscovery(initialDiscoverySnap);
  _resetFirmamentLiveForTests();
  _resetOfflineFirmamentForTests();
  _resetOfflineProfessionsForTests();
  resetOfflineHomes();
  resetPrefs();
  if (savedLocalStorageDescriptor) {
    Object.defineProperty(globalThis, 'localStorage', savedLocalStorageDescriptor);
  } else {
    delete globalThis.localStorage;
  }
});

test('Trigger #8 (Transcending Mortal Flesh): strictly unlocks ONLY for Lichdom, Ancient Lichdom, Vampirism, or Lycanthropy', () => {
  const mortal = makeFreshEntity('t8_mortal');
  mortal.activeEffects = [
    { kind: 'statBuff', permanent: true, spellName: 'Ascended Aegis' },
    { kind: 'disease', permanent: false, name: 'Plague' },
  ];
  assert.equal(evaluateFateWeight(mortal).triggers.find((t) => t.id === 'tr08_mortal_flesh').natural, false);

  const lich = makeFreshEntity('t8_lich');
  applyLichdom(lich, { nowMinutes: 100 });
  assert.equal(isAnyLich(lich), true);
  assert.equal(evaluateFateWeight(lich).triggers.find((t) => t.id === 'tr08_mortal_flesh').natural, true);

  const ancientLich = makeFreshEntity('t8_ancient');
  applyAncientLichdom(ancientLich, { nowMinutes: 100 });
  assert.equal(isAnyLich(ancientLich), true);
  assert.equal(evaluateFateWeight(ancientLich).triggers.find((t) => t.id === 'tr08_mortal_flesh').natural, true);

  const vampire = makeFreshEntity('t8_vamp');
  createVampirismCurse(vampire, 153, { now: 100 });
  assert.equal(evaluateFateWeight(vampire).triggers.find((t) => t.id === 'tr08_mortal_flesh').natural, true);

  const werewolf = makeFreshEntity('t8_wolf');
  createLycanthropyCurse(werewolf, 'werewolf', { now: 100 });
  assert.equal(evaluateFateWeight(werewolf).triggers.find((t) => t.id === 'tr08_mortal_flesh').natural, true);
});

test('All 24 Fate Weight triggers + boundary conditions + progression hooks work live', () => {
  assert.equal(TOTAL_FATE_TRIGGERS, 24);
  assert.equal(REQUIRED_FATE_WEIGHT, 16);
  const e = makeFreshEntity('all_24');
  const findTr = (id) => evaluateFateWeight(e).triggers.find((tr) => tr.id === id);

  assert.equal(evaluateFateWeight(e).naturalCount, 0);

  // tr01: >= 3 attributes at 100+
  e.stats.intelligence = 100;
  e.stats.willpower = 100;
  e.stats.strength = 99;
  assert.equal(findTr('tr01_awakened_mind').natural, false);
  e.stats.strength = 100;
  assert.equal(findTr('tr01_awakened_mind').natural, true);

  // tr19: character level >= 30
  e.level = 29;
  assert.equal(findTr('tr19_mortal_apex').natural, false);
  e.level = 30;
  assert.equal(findTr('tr19_mortal_apex').natural, true);

  // tr02: 25 distinct books (10000 canonicalizes to 5 without duplicate count)
  recordBookRead(e, 10000);
  assert.equal(recordBookRead(e, 5), false);
  assert.equal(recordBookRead(e, NECRO_GRIMOIRE_BOOK_ID), true);
  for (let i = 10; i < 33; i++) recordBookRead(e, i);
  assert.equal(e.booksRead.length, 25);
  assert.equal(findTr('tr02_tower_scholar').natural, true);

  // tr03: Daedric >= 100
  e.skills[SKILLS.Daedric] = 99;
  assert.equal(findTr('tr03_speaker_oblivion').natural, false);
  e.skills[SKILLS.Daedric] = 100;
  assert.equal(findTr('tr03_speaker_oblivion').natural, true);

  // tr04: Any arcane school >= 100
  e.skills[SKILLS.Mysticism] = 99;
  assert.equal(findTr('tr04_mystic_weave').natural, false);
  e.skills[SKILLS.Mysticism] = 100;
  assert.equal(findTr('tr04_mystic_weave').natural, true);

  // tr20: Renown >= 25 (does NOT unlock tr05_firmament_child)
  saveFirmRecord(e.characterId, { xp: renownXpFor(24), renown: 24, tree: '', said: 0 });
  assert.equal(findTr('tr20_renowned_legend').natural, false);
  saveFirmRecord(e.characterId, { xp: renownXpFor(25), renown: 25, tree: '', said: 0 });
  assert.equal(findTr('tr20_renowned_legend').natural, true);
  assert.equal(findTr('tr05_firmament_child').natural, false);

  // tr05: 50 Firmament stars only
  setFirmamentTree({ start: 's0', keys: Array.from({ length: 49 }, (_, i) => `k${i}`) });
  assert.equal(findTr('tr05_firmament_child').natural, false);
  setFirmamentTree({ start: 's0', keys: Array.from({ length: 50 }, (_, i) => `k${i}`) });
  assert.equal(findTr('tr05_firmament_child').natural, true);

  // tr06: 50 quests only (failed quests ignored; Mantella does not shortcut Fate Weight)
  e.apotheosis = { mantellaCompleted: true };
  assert.equal(findTr('tr06_hero_iliac').natural, false);
  delete e.apotheosis;
  for (let i = 0; i < 49; i++) recordQuestCompleted(e, { questSuccess: true });
  recordQuestCompleted(e, { questSuccess: false });
  assert.equal(e.questsCompleted, 49);
  assert.equal(findTr('tr06_hero_iliac').natural, false);
  recordQuestCompleted(e, { questSuccess: true });
  assert.equal(findTr('tr06_hero_iliac').natural, true);

  // tr07: 5000 kills via playerKillListener
  reportPlayerKill(e, {});
  assert.equal(e.totalKills, 1);
  e.totalKills = 4999;
  assert.equal(findTr('tr07_harbinger_ash').natural, false);
  reportPlayerKill(e, {});
  assert.equal(e.totalKills, 5000);
  assert.equal(findTr('tr07_harbinger_ash').natural, true);

  // tr09: 10 Nemeses defeated
  recordNemesisDefeated(e, 9);
  assert.equal(findTr('tr09_scourge_rivals').natural, false);
  recordNemesisDefeated(e, 1);
  assert.equal(findTr('tr09_scourge_rivals').natural, true);

  // tr10: Martial >= 100
  e.skills[SKILLS.LongBlade] = 99;
  assert.equal(findTr('tr10_peerless_warrior').natural, false);
  e.skills[SKILLS.LongBlade] = 100;
  assert.equal(findTr('tr10_peerless_warrior').natural, true);

  // tr11: 3 distinct Daedric artifacts (duplicate subtype only counts once!)
  const a0a = mintCanonicalArtifact(0);
  const a0b = mintCanonicalArtifact(0);
  const a14 = mintCanonicalArtifact(14); // Chrysamere
  e.items.push(a0a, a0b, a14);
  assert.equal(findTr('tr11_relic_bearer').natural, false);
  e.items.push(mintCanonicalArtifact(15)); // Lord's Mail
  assert.equal(findTr('tr11_relic_bearer').natural, true);

  // tr12: Stealth >= 100 ONLY; tr21: maxHealth >= 500 ONLY
  e.skills[SKILLS.Stealth] = 99;
  e.maxHealth = 499;
  assert.equal(findTr('tr12_unbroken').natural, false);
  assert.equal(findTr('tr21_titan_vitality').natural, false);
  e.maxHealth = 500;
  assert.equal(findTr('tr21_titan_vitality').natural, true);
  assert.equal(findTr('tr12_unbroken').natural, false, 'Max HP no longer satisfies Walker in Shadows');
  e.skills[SKILLS.Stealth] = 100;
  assert.equal(findTr('tr12_unbroken').natural, true);

  // tr13: Guild rank >= 9
  e.guildMemberships = { mortal: { FightersGuild: { guild: 'FightersGuild', rank: 8 } }, vampire: {} };
  assert.equal(findTr('tr13_guildmaster').natural, false);
  e.guildMemberships.mortal.FightersGuild.rank = 9;
  assert.equal(findTr('tr13_guildmaster').natural, true);

  // tr14: Profession master rank (100)
  saveProfRecord(e.characterId, { tracks: { smithing: { rank: 99, xp: 0 } } });
  assert.equal(findTr('tr14_grand_artisan').natural, false);
  saveProfRecord(e.characterId, { tracks: { smithing: { rank: 100, xp: 0 } } });
  assert.equal(findTr('tr14_grand_artisan').natural, true);

  // tr15: >= 75 discovered places
  for (let i = 1; i <= 74; i++) discoverLocation(9000 + i, { name: `Loc${i}` });
  assert.equal(findTr('tr15_cartographer').natural, false);
  discoverLocation(9075, { name: 'Loc75' });
  assert.equal(findTr('tr15_cartographer').natural, true);

  // tr16: >= 500,000 total gold (purse + bankAccounts)
  e.goldPieces = 399999;
  e.bankAccounts = [{ regionIndex: 0, accountGold: 100000 }];
  assert.equal(findTr('tr16_magnate').natural, false);
  e.goldPieces = 400000;
  assert.equal(findTr('tr16_magnate').natural, true);

  // tr17: Freehold house / offline home ONLY; tr22: Sea vessel ONLY
  assert.equal(findTr('tr17_landed_sovereign').natural, false);
  assert.equal(findTr('tr22_sea_captain').natural, false);
  e.ownedShip = SHIP_TYPES.Small;
  assert.equal(findTr('tr22_sea_captain').natural, true);
  assert.equal(findTr('tr17_landed_sovereign').natural, false, 'Vessel no longer satisfies Landed Sovereign');
  inheritOfflineHome({ mapId: 123, buildingKey: 1, region: 17 });
  assert.equal(findTr('tr17_landed_sovereign').natural, true);

  // tr18: Faction rep >= 50
  e.savedFactionRep = { 40: { rep: 49 } };
  assert.equal(findTr('tr18_living_legend').natural, false);
  e.savedFactionRep[40].rep = 50;
  assert.equal(findTr('tr18_living_legend').natural, true);

  // tr23: Any skill >= 200 (100/199 insufficient)
  assert.equal(findTr('tr23_skill_200').natural, false);
  e.skills[SKILLS.LongBlade] = 199;
  assert.equal(findTr('tr23_skill_200').natural, false);
  e.skills[SKILLS.LongBlade] = 200;
  assert.equal(findTr('tr23_skill_200').natural, true);

  // tr24: Dual-skill specialization (arcane or martial)
  assert.equal(findTr('tr24_specialization').natural, false);
  e.arcanePath = 'battlemage';
  assert.equal(findTr('tr24_specialization').natural, true);
  e.arcanePath = null;
  assert.equal(findTr('tr24_specialization').natural, false);
  e.martialPath = 'blademaster';
  assert.equal(findTr('tr24_specialization').natural, true);

  // Plus tr08 via Lichdom -> all 24/24 natural triggers fulfilled!
  applyLichdom(e, { nowMinutes: 50 });
  const fullEval = evaluateFateWeight(e);
  assert.equal(fullEval.naturalCount, 24);
  assert.equal(fullEval.count, TOTAL_FATE_TRIGGERS);
  assert.equal(fullEval.ready, true);
  assert.equal(fullEval.categories.length, 3);
  assert.deepEqual(fullEval.categories.map((c) => c.triggers.length), [8, 8, 8]);
});

test('Retro-estimation on legacy saves: books in pack/wagon, Firmament XP -> kills & renown, Nemesis memory -> rivals', () => {
  const legacy = makeFreshEntity('legacy_retro');
  // 25 distinct books split across pack and wagon, with bookRead counter empty (0)
  for (let i = 1; i <= 15; i++) legacy.items.push({ group: 'Books', message: i });
  legacy.wagonItems = [];
  for (let i = 16; i <= 25; i++) legacy.wagonItems.push({ group: 'Books', message: i });

  // Firmament XP high enough for >= 5000 estimated kills (175000 / 35 = 5000) and Renown 25 (renownXpFor(25) === 159120)
  saveFirmRecord(legacy.characterId, { xp: 175000, renown: 25, tree: '', said: 1 });

  // Record 10 nemesis confrontations in persistent Nemesis memory
  for (let i = 1; i <= 10; i++) {
    recordNemesisMemory({ id: `n${i}`, archetype: 'champion', factionName: `F${i}` }, { outcome: 'PLAYER_WON' });
  }

  const fw = evaluateFateWeight(legacy);
  const byId = new Map(fw.triggers.map((t) => [t.id, t]));
  assert.equal(byId.get('tr02_tower_scholar').natural, true, '25 books in pack + wagon fulfill Tower Scholar');
  assert.equal(byId.get('tr05_firmament_child').natural, false, 'Renown alone does not fulfill Child of the Firmament');
  assert.equal(byId.get('tr20_renowned_legend').natural, true, 'Renown 25 fulfills Herald of Renown');
  assert.equal(byId.get('tr07_harbinger_ash').natural, true, 'Firmament XP 175000 estimates >= 5000 kills');
  assert.equal(byId.get('tr09_scourge_rivals').natural, true, '10 resolved nemesis encounters fulfill Scourge of Rivals');
});

test('Canonical Daedric artifacts (all 23 indices 0..22): Chrysamere & Lords Mail, equipped protection, distinct subtype deduplication', () => {
  const e = makeFreshEntity('art_scanner');

  // Verify all 23 canonical artifacts mint and resolve exact subType + localized name
  for (let i = 0; i < TOTAL_CANONICAL_ARTIFACTS; i++) {
    const art = mintCanonicalArtifact(i);
    assert.equal(artifactSubTypeOf(art), i, `subType ${i} resolves`);
    assert.ok(canonicalArtifactName(i).length > 0, `canonical name for ${i}`);
    e.items.push(art);
  }
  // Equip Chrysamere (14) and Lord's Mail (15)
  const chrysamere = e.items[14];
  const lordsMail = e.items[15];
  equipTableOf(e)[EQUIP_SLOTS.RightHand] = chrysamere;
  equipTableOf(e)[EQUIP_SLOTS.ChestArmor] = lordsMail;

  // Add a duplicate unequipped copy of index 0 and another copy of Chrysamere (14)
  const dup0 = mintCanonicalArtifact(0);
  const unequippedChrysamere = mintCanonicalArtifact(14);
  e.items.push(dup0, unequippedChrysamere);

  const scan = scanInventoryArtifactsForApotheosis(e);
  assert.equal(scan.equippedCount, 2, '2 equipped artifacts are protected');
  assert.equal(scan.distinctOwnedCount, 23, 'all 23 canonical indices detected');
  // Indices 0..22 minus equipped Lord's Mail (15), since Chrysamere has an unequipped copy -> 22 distinct unequipped!
  assert.equal(scan.distinctUnequippedCount, 22);
  assert.equal(isEquippedOnEntity(e, chrysamere), true);
  assert.equal(isEquippedOnEntity(e, unequippedChrysamere), false);
});

test('Full Stage 0 loop: Fate + 13 unequipped artifacts -> questline placeholder -> Portfolio -> free switch + Mantella mutual exclusion', () => {
  const e = makeFreshEntity('full_loop');

  // Grant 15 distinct artifacts and equip one extra copy outside those 15
  const g = grantArtifactPack(e, 15);
  assert.equal(g.added, 15);
  const protectedSword = mintCanonicalArtifact(14); // Chrysamere
  e.items.push(protectedSword);
  equipTableOf(e)[EQUIP_SLOTS.RightHand] = protectedSword;

  // Before Fate Weight >= 8 -> cannot ascend or pick portfolio
  assert.equal(canStartApotheosisViaArtifacts(e).eligible, false);
  assert.equal(selectApotheosisPortfolio(e, 'war').ok, false);

  // Set debug Fate Weight to 8/22
  const fwReady = setDebugFateWeight(e, REQUIRED_FATE_WEIGHT);
  assert.equal(fwReady.count, REQUIRED_FATE_WEIGHT);
  assert.equal(fwReady.ready, true);
  assert.equal(fwReady.debugBoosted, true);

  assert.equal(canStartApotheosisViaArtifacts(e).eligible, true);

  const scan = scanInventoryArtifactsForApotheosis(e);
  const selected13 = scan.distinctUnequippedSubTypes
    .slice(0, REQUIRED_ARTIFACTS_COUNT)
    .map((sub) => scan.unequippedEntries.find((entry) => entry.subType === sub).item);

  // Reject equipped item if snuck into selection
  const withEquipped = [...selected13.slice(0, 12), protectedSword];
  assert.equal(startApotheosisFromArtifacts(e, withEquipped).ok, false);
  assert.equal(e.items.includes(protectedSword), true, 'protected equipped item remains untouched');

  // Reject duplicate subtype if snuck into selection
  const extraCopy = mintCanonicalArtifact(scan.distinctUnequippedSubTypes[0]);
  e.items.push(extraCopy);
  const withDupSub = [selected13[0], extraCopy, ...selected13.slice(2)];
  assert.equal(startApotheosisFromArtifacts(e, withDupSub).ok, false);

  // Perform valid 13-artifact shatter -> starts Stage 1 questline
  const beforeCount = e.items.length;
  const ritual = startApotheosisFromArtifacts(e, selected13);
  assert.equal(ritual.ok, true);
  assert.equal(ritual.stage, APOTHEOSIS_STAGES.QUESTLINE_ACTIVE);
  assert.equal(ritual.source, APOTHEOSIS_SOURCES.ARTIFACTS);
  assert.equal(ritual.sacrificedSubTypes.length, REQUIRED_ARTIFACTS_COUNT);
  assert.equal(e.apotheosis.questlineStarted, true);
  assert.equal(e.apotheosis.questStep, APOTHEOSIS_QUEST_STEPS.DRAGON_BREAK);
  assert.equal(e.apotheosis.questlineCompletedNotice, false);
  assert.equal(e.apotheosis.ascended, false, 'ascended flips true after choosing initial Portfolio');
  assert.equal(e.items.length, beforeCount - REQUIRED_ARTIFACTS_COUNT);
  assert.equal(e.items.includes(protectedSword), true, 'equipped artifact survived ritual');
  for (const destroyed of selected13) {
    assert.equal(e.items.includes(destroyed), false, 'sacrificed item removed from pack');
  }

  // Cannot claim Portfolio before trial finishes -> complete questline first
  assert.equal(selectApotheosisPortfolio(e, 'war').ok, false);
  const doneQuest = completeApotheosisQuestline(e);
  assert.equal(doneQuest.ok, true);
  assert.equal(doneQuest.stage, APOTHEOSIS_STAGES.AWAITING_PORTFOLIO);
  assert.equal(e.apotheosis.questlineCompletedNotice, true);

  // Mutual exclusion against Mantella while in/after Artifact Ascension
  assert.equal(startApotheosisFromMantella(e).ok, false);

  // Choose initial Portfolio -> becomes God
  const claim = selectApotheosisPortfolio(e, 'war', { nowMinutes: 12345 });
  assert.equal(claim.ok, true);
  assert.equal(claim.switching, false);
  assert.equal(e.apotheosis.ascended, true);
  assert.equal(e.apotheosis.stage, APOTHEOSIS_STAGES.ASCENDED);
  assert.equal(e.apotheosis.portfolio, 'war');
  assert.equal(e.apotheosis.ascendedAtMinutes, 12345);

  // Free Portfolio switch after 30-day cooldown
  const sw = selectApotheosisPortfolio(e, 'magic', { nowMinutes: 12345 + 30 * 1440 });
  assert.equal(sw.ok, true);
  assert.equal(sw.switching, true);
  assert.equal(e.apotheosis.portfolio, 'magic');
  assert.equal(e.apotheosis.ascendedAtMinutes, 12345, 'first ascension timestamp preserved');

  // Cannot re-trigger Artifact Ascension once Ascended
  assert.equal(canStartApotheosisViaArtifacts(e).eligible, false);
  assert.equal(APOTHEOSIS_PORTFOLIOS.length, 4);

  // Reverse mutual exclusion: Mantella path starts questline & locks out Artifact path
  resetApotheosisForDebug(e);
  const man = startApotheosisFromMantella(e);
  assert.equal(man.ok, true);
  assert.equal(man.source, APOTHEOSIS_SOURCES.MANTELLA);
  assert.equal(man.stage, APOTHEOSIS_STAGES.QUESTLINE_ACTIVE);
  assert.equal(canStartApotheosisViaArtifacts(e).eligible, false);
});

test('Console commands (`apotheosis` / `apo`) manage debug Fate Weight, artifacts, set metrics, status, and reset cleanly', async () => {
  const prev = {
    items: [...(playerEntity.items ?? [])],
    apotheosis: playerEntity.apotheosis ? structuredClone(playerEntity.apotheosis) : undefined,
    totalKills: playerEntity.totalKills,
    booksRead: playerEntity.booksRead ? [...playerEntity.booksRead] : undefined,
    nemesesDefeated: playerEntity.nemesesDefeated,
    questsCompleted: playerEntity.questsCompleted,
    maxHealth: playerEntity.maxHealth,
    rawMaxHealth: playerEntity.rawMaxHealth,
    currentHealth: playerEntity.currentHealth,
    characterId: playerEntity.characterId,
    ownedShip: playerEntity.ownedShip,
    houses: playerEntity.houses ? [...playerEntity.houses] : undefined,
    skills: Array.isArray(playerEntity.skills) ? [...playerEntity.skills] : (playerEntity.skills ? { ...playerEntity.skills } : undefined),
    arcanePath: playerEntity.arcanePath,
    martialPath: playerEntity.martialPath,
  };
  try {
    assert.ok(getConsoleCommand('apotheosis'));
    const apo = getConsoleCommand('apo');
    assert.ok(apo);

    assert.match(await executeConsoleCommand('apo', ['reset']), /reset/i);
    assert.match(await executeConsoleCommand('apo', ['fate', 'ready']), /16\/24/);
    assert.equal(playerEntity.apotheosis.debugFateCount, 16);

    assert.match(await executeConsoleCommand('apo', ['fate', 'full']), /24\/24/);
    assert.equal(playerEntity.apotheosis.debugFateCount, 24);

    assert.match(await executeConsoleCommand('apo', ['reset']), /reset/i);
    assert.match(await executeConsoleCommand('apo', ['set', 'kills']), /Set kills=5000/);
    assert.match(await executeConsoleCommand('apo', ['set', 'quests']), /Set quests=50/);
    assert.match(await executeConsoleCommand('apo', ['set', 'nemesis']), /Set nemesis=10/);
    assert.match(await executeConsoleCommand('apo', ['set', 'books']), /Set books=25/);
    assert.match(await executeConsoleCommand('apo', ['set', 'discover']), /Set discover=75/);
    assert.match(await executeConsoleCommand('apo', ['set', 'maxhp']), /Set maxhp=500/);
    assert.match(await executeConsoleCommand('apo', ['set', 'renown']), /Set renown=25/);
    assert.match(await executeConsoleCommand('apo', ['set', 'stars']), /Set stars=50/);
    assert.match(await executeConsoleCommand('apo', ['set', 'home']), /Set home=1/);
    assert.match(await executeConsoleCommand('apo', ['set', 'ship']), /Set ship=1/);
    assert.match(await executeConsoleCommand('apo', ['set', 'skill200']), /Set skill200=200/);
    assert.match(await executeConsoleCommand('apo', ['set', 'spec']), /Set spec=1/);
    assert.match(await executeConsoleCommand('apo', ['set', 'unknown_metric']), /^Usage: apo set/);

    const fwById = new Map(evaluateFateWeight(playerEntity).triggers.map((tr) => [tr.id, tr.natural]));
    assert.equal(fwById.get('tr07_harbinger_ash'), true);
    assert.equal(fwById.get('tr06_hero_iliac'), true);
    assert.equal(fwById.get('tr09_scourge_rivals'), true);
    assert.equal(fwById.get('tr02_tower_scholar'), true);
    assert.equal(fwById.get('tr15_cartographer'), true);
    assert.equal(fwById.get('tr21_titan_vitality'), true);
    assert.equal(fwById.get('tr12_unbroken'), false);
    assert.equal(fwById.get('tr05_firmament_child'), true);
    assert.equal(fwById.get('tr20_renowned_legend'), true);
    assert.equal(fwById.get('tr17_landed_sovereign'), true);
    assert.equal(fwById.get('tr22_sea_captain'), true);
    assert.equal(fwById.get('tr23_skill_200'), true);
    assert.equal(fwById.get('tr24_specialization'), true);

    const artMsg = await executeConsoleCommand('apo', ['artifacts', '15']);
    assert.match(artMsg, /15/);
    assert.ok(scanInventoryArtifactsForApotheosis(playerEntity).distinctUnequippedCount >= 15);

    const statusMsg = await executeConsoleCommand('apo', ['status']);
    assert.match(statusMsg, /\[Apotheosis\] stage=/);
  } finally {
    playerEntity.items = prev.items;
    if (prev.apotheosis === undefined) delete playerEntity.apotheosis;
    else playerEntity.apotheosis = prev.apotheosis;
    if (prev.totalKills === undefined) delete playerEntity.totalKills;
    else playerEntity.totalKills = prev.totalKills;
    if (prev.booksRead === undefined) delete playerEntity.booksRead;
    else playerEntity.booksRead = prev.booksRead;
    if (prev.nemesesDefeated === undefined) delete playerEntity.nemesesDefeated;
    else playerEntity.nemesesDefeated = prev.nemesesDefeated;
    if (prev.questsCompleted === undefined) delete playerEntity.questsCompleted;
    else playerEntity.questsCompleted = prev.questsCompleted;
    if (prev.maxHealth === undefined) delete playerEntity.maxHealth;
    else playerEntity.maxHealth = prev.maxHealth;
    if (prev.rawMaxHealth === undefined) delete playerEntity.rawMaxHealth;
    else playerEntity.rawMaxHealth = prev.rawMaxHealth;
    if (prev.currentHealth === undefined) delete playerEntity.currentHealth;
    else playerEntity.currentHealth = prev.currentHealth;
    if (prev.characterId === undefined) delete playerEntity.characterId;
    else playerEntity.characterId = prev.characterId;
    if (prev.ownedShip === undefined) delete playerEntity.ownedShip;
    else playerEntity.ownedShip = prev.ownedShip;
    if (prev.houses === undefined) delete playerEntity.houses;
    else playerEntity.houses = prev.houses;
    if (prev.skills === undefined) delete playerEntity.skills;
    else playerEntity.skills = prev.skills;
    if (prev.arcanePath === undefined) delete playerEntity.arcanePath;
    else playerEntity.arcanePath = prev.arcanePath;
    if (prev.martialPath === undefined) delete playerEntity.martialPath;
    else playerEntity.martialPath = prev.martialPath;
  }
});

test('Save/Restore round-trip (`snapshotPlayer` / `restorePlayer`) and Settings toggle (`apotheosisShowTracker`) persist cleanly', () => {
  assert.equal(PREF_DEFAULTS.apotheosisShowTracker, true);
  assert.equal(getPref('apotheosisShowTracker'), true);
  setPref('apotheosisShowTracker', false);
  assert.equal(getPref('apotheosisShowTracker'), false);

  const e = makeFreshEntity('save_test');
  e.totalKills = 512;
  e.booksRead = [1, 2, 5];
  e.nemesesDefeated = 4;
  e.questsCompleted = 22;
  ensureApotheosisState(e);
  e.apotheosis = {
    ascended: true,
    stage: APOTHEOSIS_STAGES.ASCENDED,
    source: APOTHEOSIS_SOURCES.ARTIFACTS,
    portfolio: 'shadows',
    questlineStarted: true,
    questStep: APOTHEOSIS_QUEST_STEPS.COMPLETED,
    siegeWave: 13,
    towerSiegeCleared: true,
    questlineCompletedNotice: true,
    sacrificedArtifacts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15],
    debugFateCount: 8,
    mantellaCompleted: false,
    ascendedAtMinutes: 7777,
  };

  const snap = JSON.parse(JSON.stringify(snapshotPlayer(e, {})));
  assert.equal(snap.totalKills, 512);
  assert.deepEqual(snap.booksRead, [1, 2, 5]);
  assert.equal(snap.nemesesDefeated, 4);
  assert.equal(snap.questsCompleted, 22);
  assert.equal(snap.apotheosis.portfolio, 'shadows');

  const restored = makeFreshEntity('restored_test');
  restorePlayer(restored, snap, new Map());
  assert.equal(restored.totalKills, 512);
  assert.deepEqual(restored.booksRead, [1, 2, 5]);
  assert.equal(restored.nemesesDefeated, 4);
  assert.equal(restored.questsCompleted, 22);
  assert.deepEqual(restored.apotheosis, e.apotheosis);

  // Legacy snapshot without apotheosis fields restores safely to clean defaults
  const legacySnap = JSON.parse(JSON.stringify(snapshotPlayer(makeFreshEntity('old'), {})));
  delete legacySnap.apotheosis;
  delete legacySnap.totalKills;
  delete legacySnap.booksRead;
  delete legacySnap.nemesesDefeated;
  delete legacySnap.questsCompleted;
  const legacyRestored = makeFreshEntity('legacy_restored');
  restorePlayer(legacyRestored, legacySnap, new Map());
  assert.equal(legacyRestored.totalKills, 0);
  assert.deepEqual(legacyRestored.booksRead, []);
  assert.equal(legacyRestored.apotheosis, null);
  assert.deepEqual(ensureApotheosisState(legacyRestored), defaultApotheosisState());
});

test('Localization: all 26 locales have all Apotheosis keys with valid CSV and matching ICU placeholders', () => {
  const isApoKey = (k) => k.startsWith('apotheosis.')
    || k === 'pause.tab.apotheosis'
    || k === 'settings.sec.apotheosis'
    || k === 'menu.apotheosis.showTracker.name'
    || k === 'menu.apotheosis.showTracker.note';

  const argNames = (pattern) => {
    const args = new Set();
    const walk = (nodes) => {
      for (const n of nodes) {
        if (typeof n === 'object' && n?.arg) {
          args.add(n.arg);
          if (n.options) for (const branch of n.options.values()) walk(branch);
        }
      }
    };
    walk(parseMessage(pattern));
    return [...args].sort();
  };

  const obsoleteKeys = [
    'apotheosis.tr.tr06.mantella',
    'apotheosis.tr.tr17.owned',
    'apotheosis.tr.tr17.none',
  ];

  const enRows = parseStringTableCsv(readFileSync(new URL('../../locales/en/Port_Strings.csv', import.meta.url), 'utf8'));
  const enApo = new Map(enRows.filter(([k]) => isApoKey(k)));
  assert.equal(enApo.size, 817, 'expected 817 Apotheosis/Settings/Pause keys in English table');
  for (const oldKey of obsoleteKeys) {
    assert.equal(enApo.has(oldKey), false, `en still has obsolete key ${oldKey}`);
  }

  const expectedArgs = new Map();
  for (const [k, v] of enApo) {
    assert.ok(v && v.trim().length > 0, `en missing value for ${k}`);
    expectedArgs.set(k, argNames(v));
  }

  const realLocales = LOCALE_CATALOG.filter((l) => !l.hidden);
  assert.equal(realLocales.length, 26, 'expected 26 non-hidden locales');

  for (const loc of realLocales) {
    const csv = readFileSync(new URL(`../../locales/${loc.code}/Port_Strings.csv`, import.meta.url), 'utf8');
    const locMap = new Map(parseStringTableCsv(csv));
    for (const oldKey of obsoleteKeys) {
      assert.equal(locMap.has(oldKey), false, `${loc.code} still has obsolete key ${oldKey}`);
    }
    for (const [k, args] of expectedArgs) {
      assert.ok(locMap.has(k), `${loc.code}: missing key ${k}`);
      const val = locMap.get(k);
      assert.ok(typeof val === 'string' && val.trim().length > 0, `${loc.code}: empty value for ${k}`);
      assert.deepEqual(argNames(val), args, `${loc.code}: ICU args mismatch for ${k}`);
    }
  }
});
