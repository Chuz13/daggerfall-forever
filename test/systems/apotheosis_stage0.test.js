import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  REQUIRED_FATE_WEIGHT,
  REQUIRED_ARTIFACTS_COUNT,
  TOTAL_FATE_TRIGGERS,
  TOTAL_CANONICAL_ARTIFACTS,
  APOTHEOSIS_STAGES,
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

test('All remaining 17 Fate Weight triggers + boundary conditions + progression hooks work live', () => {
  const e = makeFreshEntity('all_18');
  const findTr = (id) => evaluateFateWeight(e).triggers.find((tr) => tr.id === id);

  assert.equal(evaluateFateWeight(e).naturalCount, 0);

  // tr01: attribute >= 100 or level >= 25
  e.level = 24;
  e.stats.intelligence = 99;
  assert.equal(findTr('tr01_awakened_mind').natural, false);
  e.level = 25;
  assert.equal(findTr('tr01_awakened_mind').natural, true);
  e.level = 1;
  e.stats.willpower = 100;
  assert.equal(findTr('tr01_awakened_mind').natural, true);

  // tr02: 25 distinct books (10000 canonicalizes to 5 without duplicate count)
  recordBookRead(e, 10000);
  assert.equal(recordBookRead(e, 5), false);
  assert.equal(recordBookRead(e, NECRO_GRIMOIRE_BOOK_ID), true);
  for (let i = 10; i < 33; i++) recordBookRead(e, i);
  assert.equal(e.booksRead.length, 25);
  assert.equal(findTr('tr02_tower_scholar').natural, true);

  // tr03: Daedric >= 80
  e.skills[SKILLS.Daedric] = 79;
  assert.equal(findTr('tr03_speaker_oblivion').natural, false);
  e.skills[SKILLS.Daedric] = 80;
  assert.equal(findTr('tr03_speaker_oblivion').natural, true);

  // tr04: Any arcane school >= 95
  e.skills[SKILLS.Mysticism] = 94;
  assert.equal(findTr('tr04_mystic_weave').natural, false);
  e.skills[SKILLS.Mysticism] = 95;
  assert.equal(findTr('tr04_mystic_weave').natural, true);

  // tr05: 15 Firmament stars or Renown >= 15
  setFirmamentTree({ start: 's0', keys: Array.from({ length: 14 }, (_, i) => `k${i}`) });
  assert.equal(findTr('tr05_firmament_child').natural, false);
  setFirmamentTree({ start: 's0', keys: Array.from({ length: 15 }, (_, i) => `k${i}`) });
  assert.equal(findTr('tr05_firmament_child').natural, true);

  // tr06: 20 quests (failed quests ignored; Mantella also unlocks)
  for (let i = 0; i < 19; i++) recordQuestCompleted(e, { questSuccess: true });
  recordQuestCompleted(e, { questSuccess: false });
  assert.equal(e.questsCompleted, 19);
  assert.equal(findTr('tr06_hero_iliac').natural, false);
  recordQuestCompleted(e, { questSuccess: true });
  assert.equal(findTr('tr06_hero_iliac').natural, true);

  // tr07: 500 kills via playerKillListener
  reportPlayerKill(e, {});
  assert.equal(e.totalKills, 1);
  e.totalKills = 499;
  assert.equal(findTr('tr07_harbinger_ash').natural, false);
  reportPlayerKill(e, {});
  assert.equal(e.totalKills, 500);
  assert.equal(findTr('tr07_harbinger_ash').natural, true);

  // tr09: 3 Nemeses defeated
  recordNemesisDefeated(e, 2);
  assert.equal(findTr('tr09_scourge_rivals').natural, false);
  recordNemesisDefeated(e, 1);
  assert.equal(findTr('tr09_scourge_rivals').natural, true);

  // tr10: Martial >= 95
  e.skills[SKILLS.LongBlade] = 94;
  assert.equal(findTr('tr10_peerless_warrior').natural, false);
  e.skills[SKILLS.LongBlade] = 95;
  assert.equal(findTr('tr10_peerless_warrior').natural, true);

  // tr11: 3 distinct Daedric artifacts (duplicate subtype only counts once!)
  const a0a = mintCanonicalArtifact(0);
  const a0b = mintCanonicalArtifact(0);
  const a14 = mintCanonicalArtifact(14); // Chrysamere
  e.items.push(a0a, a0b, a14);
  assert.equal(findTr('tr11_relic_bearer').natural, false);
  e.items.push(mintCanonicalArtifact(15)); // Lord's Mail
  assert.equal(findTr('tr11_relic_bearer').natural, true);

  // tr12: Stealth >= 90 OR maxHealth >= 250
  e.skills[SKILLS.Stealth] = 89;
  e.maxHealth = 249;
  assert.equal(findTr('tr12_unbroken').natural, false);
  e.skills[SKILLS.Stealth] = 90;
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

  // tr15: >= 25 discovered places
  for (let i = 1; i <= 24; i++) discoverLocation(9000 + i, { name: `Loc${i}` });
  assert.equal(findTr('tr15_cartographer').natural, false);
  discoverLocation(9025, { name: 'Loc25' });
  assert.equal(findTr('tr15_cartographer').natural, true);

  // tr16: >= 250,000 total gold (purse + bankAccounts)
  e.goldPieces = 149999;
  e.bankAccounts = [{ regionIndex: 0, accountGold: 100000 }];
  assert.equal(findTr('tr16_magnate').natural, false);
  e.goldPieces = 150000;
  assert.equal(findTr('tr16_magnate').natural, true);

  // tr17: Freehold house, offline home, or vessel
  assert.equal(findTr('tr17_landed_sovereign').natural, false);
  e.ownedShip = SHIP_TYPES.Small;
  assert.equal(findTr('tr17_landed_sovereign').natural, true);
  e.ownedShip = SHIP_TYPES.None;
  inheritOfflineHome({ mapId: 123, buildingKey: 1, region: 17 });
  assert.equal(findTr('tr17_landed_sovereign').natural, true);

  // tr18: Faction rep >= 50
  e.savedFactionRep = { 40: { rep: 49 } };
  assert.equal(findTr('tr18_living_legend').natural, false);
  e.savedFactionRep[40].rep = 50;
  assert.equal(findTr('tr18_living_legend').natural, true);

  // Plus tr08 via Lichdom -> all 18/18 natural triggers fulfilled!
  applyLichdom(e, { nowMinutes: 50 });
  const fullEval = evaluateFateWeight(e);
  assert.equal(fullEval.naturalCount, 18);
  assert.equal(fullEval.count, TOTAL_FATE_TRIGGERS);
  assert.equal(fullEval.ready, true);
  assert.equal(fullEval.categories.length, 3);
});

test('Retro-estimation on legacy saves: books in pack/wagon, Firmament XP -> kills & renown, Nemesis memory -> rivals', () => {
  const legacy = makeFreshEntity('legacy_retro');
  // 25 distinct books split across pack and wagon, with bookRead counter empty (0)
  for (let i = 1; i <= 15; i++) legacy.items.push({ group: 'Books', message: i });
  legacy.wagonItems = [];
  for (let i = 16; i <= 25; i++) legacy.wagonItems.push({ group: 'Books', message: i });

  // Firmament XP high enough for >= 500 estimated kills and Renown 15 (renownXpFor(15) === 23350)
  saveFirmRecord(legacy.characterId, { xp: 23350, renown: 15, tree: '', said: 1 });

  // Record 3 nemesis confrontations in persistent Nemesis memory
  recordNemesisMemory({ id: 'n1', archetype: 'champion', factionName: 'A' }, { outcome: 'PLAYER_WON' });
  recordNemesisMemory({ id: 'n2', archetype: 'assassin', factionName: 'B' }, { outcome: 'PACIFIED' });
  recordNemesisMemory({ id: 'n3', archetype: 'warlock', factionName: 'C' }, { outcome: 'INTIMIDATED' });

  const fw = evaluateFateWeight(legacy);
  const byId = new Map(fw.triggers.map((t) => [t.id, t]));
  assert.equal(byId.get('tr02_tower_scholar').natural, true, '25 books in pack + wagon fulfill Tower Scholar');
  assert.equal(byId.get('tr05_firmament_child').natural, true, 'Renown 15 fulfills Child of the Firmament');
  assert.equal(byId.get('tr07_harbinger_ash').natural, true, 'Firmament XP 18000 estimates >= 500 kills');
  assert.equal(byId.get('tr09_scourge_rivals').natural, true, '3 resolved nemesis encounters fulfill Scourge of Rivals');
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

  // Before Fate Weight >= 12 -> cannot ascend or pick portfolio
  assert.equal(canStartApotheosisViaArtifacts(e).eligible, false);
  assert.equal(selectApotheosisPortfolio(e, 'war').ok, false);

  // Set debug Fate Weight to 12/18
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

  // Perform valid 13-artifact shatter
  const beforeCount = e.items.length;
  const ritual = startApotheosisFromArtifacts(e, selected13);
  assert.equal(ritual.ok, true);
  assert.equal(ritual.stage, APOTHEOSIS_STAGES.AWAITING_PORTFOLIO);
  assert.equal(ritual.source, APOTHEOSIS_SOURCES.ARTIFACTS);
  assert.equal(ritual.sacrificedSubTypes.length, REQUIRED_ARTIFACTS_COUNT);
  assert.equal(e.apotheosis.questlineStarted, true);
  assert.equal(e.apotheosis.questlineCompletedNotice, true);
  assert.equal(e.apotheosis.ascended, false, 'ascended flips true after choosing initial Portfolio');
  assert.equal(e.items.length, beforeCount - REQUIRED_ARTIFACTS_COUNT);
  assert.equal(e.items.includes(protectedSword), true, 'equipped artifact survived ritual');
  for (const destroyed of selected13) {
    assert.equal(e.items.includes(destroyed), false, 'sacrificed item removed from pack');
  }

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

  // Free Portfolio switch in Stage 0
  const sw = selectApotheosisPortfolio(e, 'magic', { nowMinutes: 12500 });
  assert.equal(sw.ok, true);
  assert.equal(sw.switching, true);
  assert.equal(e.apotheosis.portfolio, 'magic');
  assert.equal(e.apotheosis.ascendedAtMinutes, 12345, 'first ascension timestamp preserved');

  // Cannot re-trigger Artifact Ascension once Ascended
  assert.equal(canStartApotheosisViaArtifacts(e).eligible, false);
  assert.equal(APOTHEOSIS_PORTFOLIOS.length, 4);

  // Reverse mutual exclusion: Mantella path locks out Artifact path
  resetApotheosisForDebug(e);
  const man = startApotheosisFromMantella(e);
  assert.equal(man.ok, true);
  assert.equal(man.source, APOTHEOSIS_SOURCES.MANTELLA);
  assert.equal(man.stage, APOTHEOSIS_STAGES.AWAITING_PORTFOLIO);
  assert.equal(canStartApotheosisViaArtifacts(e).eligible, false);
});

test('Console commands (`apotheosis` / `apo`) manage debug Fate Weight, artifacts, status, and reset cleanly', () => {
  const prev = {
    items: [...(playerEntity.items ?? [])],
    apotheosis: playerEntity.apotheosis ? structuredClone(playerEntity.apotheosis) : undefined,
    totalKills: playerEntity.totalKills,
    booksRead: playerEntity.booksRead ? [...playerEntity.booksRead] : undefined,
    nemesesDefeated: playerEntity.nemesesDefeated,
    questsCompleted: playerEntity.questsCompleted,
  };
  try {
    assert.ok(getConsoleCommand('apotheosis'));
    const apo = getConsoleCommand('apo');
    assert.ok(apo);

    assert.match(executeConsoleCommand('apo', ['reset']), /reset/i);
    assert.match(executeConsoleCommand('apo', ['fate', 'ready']), /12\/18/);
    assert.equal(playerEntity.apotheosis.debugFateCount, 12);

    assert.match(executeConsoleCommand('apo', ['fate', 'full']), /18\/18/);
    assert.equal(playerEntity.apotheosis.debugFateCount, 18);

    const artMsg = executeConsoleCommand('apo', ['artifacts', '15']);
    assert.match(artMsg, /15/);
    assert.ok(scanInventoryArtifactsForApotheosis(playerEntity).distinctUnequippedCount >= 15);

    const statusMsg = executeConsoleCommand('apo', ['status']);
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
    questlineCompletedNotice: true,
    sacrificedArtifacts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15],
    debugFateCount: 12,
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

test('Localization: all 26 locales have all 169 Apotheosis keys with valid CSV and matching ICU placeholders', () => {
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

  const enRows = parseStringTableCsv(readFileSync(new URL('../../locales/en/Port_Strings.csv', import.meta.url), 'utf8'));
  const enApo = new Map(enRows.filter(([k]) => isApoKey(k)));
  assert.equal(enApo.size, 169, 'expected 169 Apotheosis/Settings/Pause keys in English table');

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
    for (const [k, args] of expectedArgs) {
      assert.ok(locMap.has(k), `${loc.code}: missing key ${k}`);
      const val = locMap.get(k);
      assert.ok(typeof val === 'string' && val.trim().length > 0, `${loc.code}: empty value for ${k}`);
      assert.deepEqual(argNames(val), args, `${loc.code}: ICU args mismatch for ${k}`);
    }
  }
});
