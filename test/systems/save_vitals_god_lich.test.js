import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { playerEntity } from '../../src/characters/playerEntity.js';
import { defineLiveMaxHealth, defineLiveMaxMagicka } from '../../src/systems/chargen.js';
import { snapshotPlayer, restorePlayer, savedVitalsOf, SAVE_VERSION } from '../../src/systems/save/save.js';
import { restoreModSaveRecords } from '../../src/systems/modSaveData.js';
import {
  createOfflineFirmamentBook,
  initOfflineRenown,
  _resetOfflineFirmamentForTests,
} from '../../src/systems/offlineFirmament.js';
import { _resetFirmamentLiveForTests } from '../../src/systems/firmamentLive.js';
import '../../src/systems/firmamentPowers.js';
import { setRenownLayer, setOnlineLayerExtra } from '../../src/systems/renownLayer.js';
import { computeEntityMods } from '../../src/systems/entityMods.js';
import { applyAncientLichdom, cureLichdom } from '../../src/systems/necromancy/lichdomStatus.js';
import {
  selectApotheosisPortfolio,
  startApotheosisFromMantella,
  completeApotheosisQuestline,
  setDebugFateWeight,
  resetApotheosisForDebug,
  REQUIRED_FATE_WEIGHT,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import { registerPerk, clearDynamicPerks } from '../../src/systems/perks/perkRegistry.js';
import { evenHpFloor } from '../../src/systems/levelEven.js';
import { executeConsoleLine } from '../../src/systems/consoleCommands.js';
import { setPref } from '../../src/systems/uiPrefs.js';

const storeMap = new Map();
const prevShell = globalThis.daggerShell;

const BASE_CAREER = Object.freeze({
  name: 'CustomGod',
  hitPointsPerLevel: 30,
  abilityFlagsAndSpellPointsBitfield: 0x1000,
  primarySkills: [28, 30, 31],
  majorSkills: [29, 32, 33],
  minorSkills: [12, 13, 14, 15, 16, 17],
});

const BASE_STATS = Object.freeze({
  strength: 55,
  intelligence: 100,
  willpower: 17,
  agility: 60,
  endurance: 53,
  personality: 48,
  speed: 85,
  luck: 59,
});

function makeLegacySaveSnap({
  characterId = 'bdfa40bf-b0f1-4221-b236-81de598ace0c',
  level = 25,
  health = 55,
  maxHealth = 55,
  xp = 93778,
  renown = 21,
  tree = 'st.start|st.c7.0,st.c7.1,st.s1,st.s2',
  ascended = true,
  portfolio = 'war',
  activeEffects = [],
} = {}) {
  return {
    v: SAVE_VERSION,
    name: 'HMR Main Test',
    characterId,
    level,
    health,
    maxHealth,
    magicka: 100,
    maxMagicka: 100,
    fatigue: 6912,
    careerIndex: 0,
    career: { ...BASE_CAREER },
    stats: { ...BASE_STATS },
    skills: new Array(35).fill(50),
    skillUses: new Array(35).fill(0),
    items: [],
    spells: [],
    activeEffects,
    classicMinutes: 10000,
    apotheosis: ascended ? { ascended: true, stage: 'ascended', portfolio, faith: 500 } : null,
    modData: {
      firmament: { xp, renown, tree, said: 1 },
    },
  };
}

function resetPlayerForTest() {
  setOnlineLayerExtra(playerEntity, null);
  setRenownLayer(playerEntity, null);
  playerEntity.spireHp = 0;
  playerEntity.maxHealthLimiter = 0;
  cureLichdom(playerEntity);
  resetApotheosisForDebug(playerEntity);
  Object.assign(playerEntity, {
    isPlayer: true,
    peer: false,
    name: 'HMR Main Test',
    characterId: 'bdfa40bf-b0f1-4221-b236-81de598ace0c',
    level: 1,
    careerIndex: 0,
    career: { ...BASE_CAREER },
    stats: { ...BASE_STATS },
    skills: new Array(35).fill(50),
    skillUses: new Array(35).fill(0),
    items: [],
    spells: [],
    activeEffects: [],
    racialOverride: null,
    apotheosis: null,
    unlockedPerks: undefined,
  });
  defineLiveMaxHealth(playerEntity);
  defineLiveMaxMagicka(playerEntity);
  playerEntity.maxHealth = 55;
  playerEntity.rawMaxHealth = 55;
  playerEntity.health = 55;
  playerEntity.magicka = playerEntity.maxMagicka;
}

beforeEach(() => {
  storeMap.clear();
  globalThis.daggerShell = {
    storage: {
      length: () => storeMap.size,
      key: (i) => [...storeMap.keys()][i],
      getItem: (k) => storeMap.get(k) ?? null,
      setItem: (k, v) => {
        storeMap.set(k, String(v));
      },
      removeItem: (k) => {
        storeMap.delete(k);
      },
    },
  };
  setPref('offlineFirmament', true);
  clearDynamicPerks();
  _resetFirmamentLiveForTests();
  _resetOfflineFirmamentForTests();
  resetPlayerForTest();
});

afterEach(() => {
  clearDynamicPerks();
  _resetFirmamentLiveForTests();
  _resetOfflineFirmamentForTests();
  if (prevShell === undefined) delete globalThis.daggerShell;
  else globalThis.daggerShell = prevShell;
});

test('Case 1 (SAVE2 replica): Level 25 Ascended God card shows full 1150+ maxHealth and restores at 100% HP (no ~10% load bug)', () => {
  const snap2 = makeLegacySaveSnap({ health: 55, maxHealth: 55 });

  const cardVitals = savedVitalsOf(snap2);
  assert.ok(cardVitals.maxHealth > 1100, `expected maxHealth > 1100, got ${cardVitals.maxHealth}`);
  assert.equal(cardVitals.health, cardVitals.maxHealth, 'full-HP legacy god save should read at 100% HP on card');

  const book = createOfflineFirmamentBook({ entity: playerEntity });
  initOfflineRenown({ playerEntity, firmBook: book });

  assert.ok(restorePlayer(playerEntity, snap2));
  restoreModSaveRecords(snap2.modData);

  assert.equal(playerEntity.rawMaxHealth, 55, 'rawMaxHealth remains untouched on load');
  assert.equal(playerEntity.maxHealth, cardVitals.maxHealth, 'loaded live maxHealth matches save card maxHealth');
  assert.equal(playerEntity.health, playerEntity.maxHealth, 'loaded health is 100% instead of dropping to ~10%');
});

test('Case 2 (SAVE3 & SAVE5 replicas): injured Ascended God and Ascended God + Ancient Lich compute card vitals and load proportionally', () => {
  // Injured Ascended God (27 / 55 in legacy snapshot ≈ 49.09%)
  const snap3 = makeLegacySaveSnap({ health: 27, maxHealth: 55, xp: 93137, renown: 21 });
  const card3 = savedVitalsOf(snap3);
  assert.ok(card3.maxHealth > 1100);
  const expectedRatio3 = 27 / 55;
  assert.ok(
    Math.abs(card3.health / card3.maxHealth - expectedRatio3) < 0.02,
    `SAVE3 card ratio ${card3.health}/${card3.maxHealth} should match ~${expectedRatio3.toFixed(3)}`,
  );

  const book3 = createOfflineFirmamentBook({ entity: playerEntity });
  initOfflineRenown({ playerEntity, firmBook: book3 });
  assert.ok(restorePlayer(playerEntity, snap3));
  restoreModSaveRecords(snap3.modData);
  assert.equal(playerEntity.maxHealth, card3.maxHealth);
  assert.ok(
    Math.abs(playerEntity.health / playerEntity.maxHealth - expectedRatio3) < 0.02,
    `SAVE3 loaded HP ${playerEntity.health}/${playerEntity.maxHealth} should preserve ~49% health`,
  );

  // Ascended God + Ancient Lich (+250 HP inside snap.activeEffects), 35 / 55 ≈ 63.6%
  resetPlayerForTest();
  _resetFirmamentLiveForTests();
  _resetOfflineFirmamentForTests();
  const snap5 = makeLegacySaveSnap({
    health: 35,
    maxHealth: 55,
    xp: 93137,
    renown: 21,
    activeEffects: [{ kind: 'racialOverride', racial: 'ancient_lichdom', hpBonus: 250 }],
  });
  const card5 = savedVitalsOf(snap5);
  assert.equal(card5.offMax, 55 + 500 + 250, 'offMax includes raw (55) + God (+500) + Ancient Lich (+250)');
  assert.ok(card5.maxHealth > 1350, `expected maxHealth > 1350 with Ancient Lich, got ${card5.maxHealth}`);
  const expectedRatio5 = 35 / 55;
  assert.ok(
    Math.abs(card5.health / card5.maxHealth - expectedRatio5) < 0.02,
    `SAVE5 card ratio ${card5.health}/${card5.maxHealth} should match ~${expectedRatio5.toFixed(3)}`,
  );

  const book5 = createOfflineFirmamentBook({ entity: playerEntity });
  initOfflineRenown({ playerEntity, firmBook: book5 });
  assert.ok(restorePlayer(playerEntity, snap5));
  restoreModSaveRecords(snap5.modData);
  assert.equal(playerEntity.maxHealth, card5.maxHealth);
  assert.ok(
    Math.abs(playerEntity.health / playerEntity.maxHealth - expectedRatio5) < 0.02,
    `SAVE5 loaded HP ${playerEntity.health}/${playerEntity.maxHealth} should preserve ~64% health`,
  );
});

test('Case 3: God + Ancient Lich + Iron Constitution round-trip save/load and in-session F11 quickload preserve HP and never inflate rawMaxHealth', () => {
  registerPerk({
    id: 'iron_constitution',
    name: 'Iron Constitution',
    desc: '+15 Max HP',
    check: (e) => (Number(e?.level) || 1) >= 5,
  });

  playerEntity.level = 25;
  playerEntity.maxHealth = 595;
  playerEntity.rawMaxHealth = 595;
  playerEntity.health = 595;

  setDebugFateWeight(playerEntity, REQUIRED_FATE_WEIGHT);
  startApotheosisFromMantella(playerEntity);
  completeApotheosisQuestline(playerEntity);
  selectApotheosisPortfolio(playerEntity, 'war', { nowMinutes: 1000 });
  applyAncientLichdom(playerEntity, { nowMinutes: 1000 });

  storeMap.set(
    `firm1.offline.${playerEntity.characterId}`,
    JSON.stringify({ xp: 93778, renown: 21, tree: 'st.start|st.c7.0,st.c7.1,st.s1,st.s2', said: 1 }),
  );
  const book = createOfflineFirmamentBook({ entity: playerEntity });
  initOfflineRenown({ playerEntity, firmBook: book });

  // Heal to full live maxHealth
  playerEntity.health = playerEntity.maxHealth;
  const fullLiveMax = playerEntity.maxHealth;
  assert.equal(playerEntity.rawMaxHealth, 595);
  assert.ok(fullLiveMax >= 595 + 500 + 250 + 15, `fullLiveMax=${fullLiveMax} includes all bonuses + renown/firmament`);

  // Save at 100% HP
  const snapFull = JSON.parse(JSON.stringify(snapshotPlayer(playerEntity, { classicMinutes: 10000 })));
  snapFull.modData = { firmament: { xp: 93778, renown: 21, tree: 'st.start|st.c7.0,st.c7.1,st.s1,st.s2', said: 1 } };
  assert.equal(snapFull.maxHealth, 595);
  assert.equal(snapFull.vitalBaseMax, 595 + 500 + 250 + 15);
  assert.equal(snapFull.health, 595 + 500 + 250 + 15);

  const cardFull = savedVitalsOf(snapFull);
  assert.equal(cardFull.maxHealth, fullLiveMax);
  assert.equal(cardFull.health, fullLiveMax);

  // Save at 50% HP
  const halfHp = Math.round(fullLiveMax / 2);
  playerEntity.health = halfHp;
  const snapHalf = JSON.parse(JSON.stringify(snapshotPlayer(playerEntity, { classicMinutes: 10001 })));
  snapHalf.modData = { firmament: { xp: 93778, renown: 21, tree: 'st.start|st.c7.0,st.c7.1,st.s1,st.s2', said: 1 } };
  const cardHalf = savedVitalsOf(snapHalf);
  assert.equal(cardHalf.maxHealth, fullLiveMax);
  assert.ok(Math.abs(cardHalf.health - halfHp) <= 1, `50% HP card ${cardHalf.health} matches ${halfHp}`);

  // Simulate in-session F11 quickload when renownHp is already active on playerEntity and HP was dropped to 1
  playerEntity.health = 1;
  assert.ok(restorePlayer(playerEntity, snapHalf));
  restoreModSaveRecords(snapHalf.modData);
  assert.equal(playerEntity.rawMaxHealth, 595);
  assert.equal(playerEntity.maxHealth, fullLiveMax);
  assert.ok(Math.abs(playerEntity.health - halfHp) <= 1, `F11 quickload restored ${playerEntity.health} instead of ~${halfHp}`);

  // Repeated full-HP save -> load cycles must never drift rawMaxHealth or lose HP
  for (let i = 0; i < 2; i++) {
    assert.ok(restorePlayer(playerEntity, snapFull));
    restoreModSaveRecords(snapFull.modData);
    assert.equal(playerEntity.rawMaxHealth, 595);
    assert.equal(playerEntity.maxHealth, fullLiveMax);
    assert.equal(playerEntity.health, fullLiveMax);
    const resaved = snapshotPlayer(playerEntity, { classicMinutes: 10002 + i });
    assert.equal(resaved.maxHealth, 595);
    assert.equal(resaved.vitalBaseMax, 595 + 500 + 250 + 15);
    assert.equal(resaved.health, 595 + 500 + 250 + 15);
  }
});

test('Case 4: Mortal regression — snapshots and save cards behave identically with no vitalBaseMax stamped', () => {
  const mortal = defineLiveMaxHealth({
    isPlayer: true,
    name: 'Mortal',
    level: 3,
    career: { ...BASE_CAREER },
    stats: { ...BASE_STATS },
    skills: [],
    items: [],
    spells: [],
    activeEffects: [],
    maxHealth: 80,
    health: 80,
  });

  const snapPlain = snapshotPlayer(mortal, {});
  assert.equal(snapPlain.maxHealth, 80);
  assert.equal(snapPlain.health, 80);
  assert.equal('vitalBaseMax' in snapPlain, false, 'mortal without bonusHp should not stamp vitalBaseMax');

  setRenownLayer(mortal, 20);
  mortal.health = mortal.maxHealth;
  const snapFull = snapshotPlayer(mortal, {});
  assert.equal(snapFull.maxHealth, 80);
  assert.equal(snapFull.health, 80);
  assert.equal('vitalBaseMax' in snapFull, false);

  mortal.health = Math.round(mortal.maxHealth / 2);
  const snapHalf = snapshotPlayer(mortal, {});
  assert.equal(snapHalf.maxHealth, 80);
  assert.equal(snapHalf.health, 40);
  assert.equal('vitalBaseMax' in snapHalf, false);
});

test('Case 5: Dev console set_level / apo set maxhp & first ascension vitals fill cleanly', async () => {
  playerEntity.level = 1;
  playerEntity.maxHealth = 55;
  playerEntity.rawMaxHealth = 55;
  playerEntity.health = 55;

  const expectedFloor = evenHpFloor(playerEntity, playerEntity.stats.endurance);
  assert.equal(expectedFloor, 55);

  const resLvl = executeConsoleLine('set_level 25');
  assert.equal(resLvl, 'Player level set to 25.');
  assert.equal(playerEntity.level, 25);
  assert.equal(playerEntity.rawMaxHealth, 595, 'set_level 25 updates rawMaxHealth to evenHpFloor (595)');
  assert.equal(playerEntity.health, playerEntity.maxHealth, 'full HP stays full after set_level');

  const resMaxHp = await executeConsoleLine('apo set maxhp 800');
  assert.ok(resMaxHp.includes('Set maxhp=800'));
  assert.equal(playerEntity.rawMaxHealth, 800);
  assert.ok(playerEntity.health >= 800 && playerEntity.health === playerEntity.maxHealth);

  // First ascension fills health and magicka to the new divine maximums
  resetPlayerForTest();
  setDebugFateWeight(playerEntity, REQUIRED_FATE_WEIGHT);
  startApotheosisFromMantella(playerEntity);
  completeApotheosisQuestline(playerEntity);
  const resAsc = selectApotheosisPortfolio(playerEntity, 'war', { nowMinutes: 2000 });
  assert.equal(resAsc.ok, true);
  assert.equal(playerEntity.maxHealth, 55 + 500);
  assert.equal(playerEntity.health, playerEntity.maxHealth, 'first ascension fills HP to new divine max');
  assert.equal(playerEntity.magicka, playerEntity.maxMagicka, 'first ascension fills MP to new divine max');
});
