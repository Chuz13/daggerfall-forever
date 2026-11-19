import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT, packMachine, questSource } from '../qlSources.mjs';
import {
  APOTHEOSIS_QUEST_NAME,
  APOTHEOSIS_QUEST_NAMES,
  isApotheosisQuestName,
} from '../../src/systems/apotheosis/apotheosisQuestIds.js';
import {
  apotheosisPhaseRank,
  wrapQuestLogLines,
  buildApotheosisDungeonMarks,
  setApotheosisQuestHost,
  findActiveApotheosisQuest,
  findAnyApotheosisQuest,
  syncApotheosisQuests,
} from '../../src/systems/apotheosis/apotheosisQuest.js';
import {
  APOTHEOSIS_STAGES,
  APOTHEOSIS_QUEST_STEPS,
  APOTHEOSIS_SOURCES,
  REQUIRED_FATE_WEIGHT,
  setDebugFateWeight,
  startApotheosisQuestline,
  advanceApotheosisQuestStep,
  completeApotheosisQuestline,
  selectApotheosisPortfolio,
  resetApotheosisForDebug,
  recordQuestCompleted,
  ensureApotheosisState,
  grantArtifactPack,
  startApotheosisFromArtifacts,
  startApotheosisFromMantella,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import {
  DIRENNI_TOWER_MAP_ID,
  DIRENNI_TOWER_LOCATION_ID,
  isDirenniHardModeActive,
} from '../../src/systems/apotheosis/apotheosisStage1.js';
import { PROTECTED_QUESTS } from '../../src/systems/quest/machine.js';
import { isMainQuestName } from '../../src/systems/quest/questLists.js';
import { prepareShareData } from '../../src/systems/quest/questShare.js';
import {
  localizedQuestDisplayName,
  localizedQuestMessage,
  localizedQuestSheetText,
} from '../../src/systems/quest/localizedQuest.js';
import { readObjectives, outcomeNow } from '../../src/systems/questlines/qlLaw.js';
import { createQuestlines } from '../../src/systems/questlines/qlLayer.js';
import {
  BASE_LOCALE,
  setLocale,
  patchLocaleTable,
  parseStringTableCsv,
  _resetTextManagerForTests,
} from '../../src/systems/textManager.js';
import { LOCALE_CATALOG } from '../../src/systems/localeCatalog.js';
import { hash } from '../../tools/translate.mjs';

const APOTHEOSIS_L10N_KEYS = Object.freeze([
  'apotheosis.quest.title',
  'apotheosis.quest.log.artifacts',
  'apotheosis.quest.log.mantella',
  'apotheosis.quest.log.siege',
  'apotheosis.quest.log.interior',
  'apotheosis.quest.log.shadow',
  'apotheosis.quest.log.portfolio',
  'apotheosis.quest.log.ascended',
  'apotheosis.quest.obj.reachTower',
  'apotheosis.quest.obj.breakSiege',
  'apotheosis.quest.obj.zeroStone',
  'apotheosis.quest.obj.shadow',
  'apotheosis.quest.obj.portfolio',
  'apotheosis.quest.out.ascended',
  'apotheosis.quest.out.failed',
  'apotheosis.quest.mark.zeroStone',
  'apotheosis.quest.mark.shadow',
  'apotheosis.quest.mark.conduit',
]);

function makeHero() {
  return {
    name: 'Agent',
    level: 25,
    maxHealth: 400,
    health: 400,
    maxMagicka: 200,
    magicka: 200,
    maxFatigue: 300,
    currentFatigue: 300,
    stats: {
      strength: 90,
      intelligence: 90,
      willpower: 90,
      agility: 90,
      endurance: 90,
      personality: 90,
      speed: 90,
      luck: 90,
    },
    skills: {},
    items: [],
    activeEffects: [],
    spells: [],
    goldPieces: 0,
    bankAccounts: [],
    houses: [],
    questsCompleted: 0,
  };
}

function makeWorld(discovered = []) {
  const direnniLoc = {
    loaded: true,
    regionIndex: 42,
    regionName: 'Isle of Balfiera',
    name: 'Direnni Tower',
    mapTableData: {
      mapId: DIRENNI_TOWER_MAP_ID,
      locationId: DIRENNI_TOWER_LOCATION_ID,
      latitude: 1000,
      longitude: 2000,
    },
    exterior: { exteriorData: { locationId: DIRENNI_TOWER_LOCATION_ID, blockNames: [], width: 1, height: 1 } },
    dungeon: { recordElement: { header: { locationId: DIRENNI_TOWER_LOCATION_ID }, blocks: [] } },
  };
  return {
    maps: {
      regionCount: 1,
      getRegion: (r) => (r === 0 ? { locationCount: 1, name: 'Isle of Balfiera' } : null),
      readLocationIdFast: () => DIRENNI_TOWER_LOCATION_ID,
      getLocation: () => direnniLoc,
      getRegionIndex: (n) => (n === 'Isle of Balfiera' ? 42 : -1),
      locationToWorldCoords: () => ({ x: 1000, y: 2000 }),
    },
    discoverLocation: (region, name) => discovered.push({ region, name }),
  };
}

function makeHarness() {
  const hero = makeHero();
  const discovered = [];
  const world = makeWorld(discovered);
  const clock = { sec: 1000 };
  const qlPaidCalls = [];
  const finishedArchives = [];
  const machine = packMachine({
    nowSeconds: () => clock.sec,
    playerEntity: hero,
    world,
    questReward: (q, dfItem, res) => qlPaidCalls.push({ q: q.questName, dfItem, res }),
    addFinishedQuest: (msgs) => finishedArchives.push(msgs.map((m) => m.id)),
  });
  const questlines = createQuestlines({
    machine,
    questLists: null,
    playerEntity: hero,
    nowSeconds: () => clock.sec,
    online: () => false,
  });
  machine.deps.questlinesStamp = (q) => questlines.stamp(q);
  setApotheosisQuestHost({
    getMachine: () => machine,
    getPlayer: () => hero,
  });
  return { hero, world, discovered, clock, machine, questlines, qlPaidCalls, finishedArchives };
}

test('Apotheosis quest identifiers, protections, and main-quest classification', () => {
  assert.equal(APOTHEOSIS_QUEST_NAME, '_APOTHEO');
  assert.deepEqual(APOTHEOSIS_QUEST_NAMES, ['_APOTHEO']);
  assert.equal(isApotheosisQuestName('_APOTHEO'), true);
  assert.equal(isApotheosisQuestName('S0000999'), false);
  assert.ok(PROTECTED_QUESTS.includes('_APOTHEO'));
  assert.equal(isMainQuestName('_APOTHEO'), true);
  assert.ok(questSource('_APOTHEO', true)?.length > 10);
});

test('Openings: 13 Artifacts logs 1010 and Mantella usurpation logs 1011, with Direnni Tower placed and revealed', () => {
  try {
    {
      const { hero, machine } = makeHarness();
      setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
      const granted = grantArtifactPack(hero, 13);
      assert.equal(granted.totalDistinctUnequipped >= 13, true);
      const start = startApotheosisFromArtifacts(hero, hero.items.slice(0, 13));
      assert.equal(start.ok, true);
      const q = findActiveApotheosisQuest(machine);
      assert.ok(q, 'active _APOTHEO quest should start on artifact sacrifice');
      const les = q.getLogMessages();
      assert.deepEqual(les.map((l) => [l.stepID, l.messageID]), [[0, 1010]]);
      const tower = q.resources.get('tower');
      assert.equal(tower?.siteDetails?.locationName, 'Direnni Tower');
      assert.equal(tower?.siteDetails?.regionName, 'Isle of Balfiera');
      assert.equal(tower?.siteDetails?.mapId, DIRENNI_TOWER_MAP_ID);
      const msgText = q.getMessage(1010).getTextTokens(-1, () => 0).map((tok) => tok.text ?? '').join(' ');
      assert.match(msgText, /Direnni Tower/);
      assert.match(msgText, /Isle of Balfiera/);
    }
    {
      const { hero, machine } = makeHarness();
      setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
      const start = startApotheosisFromMantella(hero);
      assert.equal(start.ok, true);
      const q = findActiveApotheosisQuest(machine);
      assert.ok(q, 'active _APOTHEO quest should start on Mantella usurpation');
      const les = q.getLogMessages();
      assert.deepEqual(les.map((l) => [l.stepID, l.messageID]), [[0, 1011]]);
    }
  } finally {
    setApotheosisQuestHost(null);
  }
});

test('Full lifecycle, mainQuest sheet objectives/outcome, ql paid, and protected refusals', () => {
  try {
    const { hero, machine, qlPaidCalls } = makeHarness();
    const sheet = JSON.parse(
      readFileSync(join(ROOT, 'src/systems/questlines/sheets/mainQuest.json'), 'utf8'),
    ).sheets.find((s) => s.quest === '_APOTHEO');
    assert.ok(sheet, '_APOTHEO sheet exists in mainQuest.json');

    setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
    startApotheosisQuestline(hero, { source: APOTHEOSIS_SOURCES.MANTELLA });
    const q = findActiveApotheosisQuest(machine);
    assert.ok(q);

    // Protections against abandon/shelve, restart, retry, and co-op sharing
    assert.equal(machine.shelveRefusal(q.uid), 'protected');
    assert.equal(machine.restartRefusal(q.uid), 'protected');
    assert.equal(machine.storyAgainRefusal('_APOTHEO'), 'protected');
    assert.deepEqual(prepareShareData(q.getSaveData()), { ok: false, reason: 'mainQuest' });

    const statesAt = (quest) =>
      Object.fromEntries(readObjectives(quest, sheet).map((o) => [o.id, o.state]));

    assert.equal(statesAt(q).reachTower, 'open');
    assert.equal(statesAt(q).breakSiege, 'hidden');

    advanceApotheosisQuestStep(hero, APOTHEOSIS_QUEST_STEPS.TOWER_SIEGE);
    assert.equal(q.getLogMessages().some((l) => l.stepID === 1 && l.messageID === 1012), true);
    assert.equal(statesAt(q).reachTower, 'done');
    assert.equal(statesAt(q).breakSiege, 'open');

    advanceApotheosisQuestStep(hero, APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR, { towerSiegeCleared: true, siegeWave: 13 });
    assert.equal(q.getLogMessages().some((l) => l.stepID === 2 && l.messageID === 1013), true);
    assert.equal(statesAt(q).breakSiege, 'done');
    assert.equal(statesAt(q).zeroStone, 'open');

    advanceApotheosisQuestStep(hero, APOTHEOSIS_QUEST_STEPS.SHADOW_DUEL, { towerSiegeCleared: true, siegeWave: 13 });
    assert.equal(q.getLogMessages().some((l) => l.stepID === 3 && l.messageID === 1014), true);
    assert.equal(statesAt(q).zeroStone, 'done');
    assert.equal(statesAt(q).shadow, 'open');

    completeApotheosisQuestline(hero);
    assert.equal(q.getLogMessages().some((l) => l.stepID === 4 && l.messageID === 1015), true);
    assert.equal(statesAt(q).shadow, 'done');
    assert.equal(statesAt(q).portfolio, 'open');
    assert.equal(q.questComplete, false);

    selectApotheosisPortfolio(hero, 'magic');
    assert.equal(q.questComplete, true);
    assert.equal(q.questSuccess, true);
    assert.equal(q.questTombstoned, true);
    assert.equal(statesAt(q).portfolio, 'done');
    assert.equal(q.activeLogMessages.get(5)?.messageID, 1016);
    assert.equal(outcomeNow(q, sheet)?.id, 'ascended');
    assert.equal(hero.apotheosis.journalAscendedSynced, true);
    assert.equal(qlPaidCalls.some((c) => c.q === '_APOTHEO'), true);
  } finally {
    setApotheosisQuestHost(null);
  }
});

test('apo reset purges _APOTHEO and allows clean restart on another route', () => {
  try {
    const { hero, machine } = makeHarness();
    setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
    grantArtifactPack(hero, 13);
    const artRes = startApotheosisFromArtifacts(hero, hero.items.slice(0, 13));
    assert.equal(artRes.ok, true);
    assert.ok(findActiveApotheosisQuest(machine));

    resetApotheosisForDebug(hero);
    assert.equal(findAnyApotheosisQuest(machine), null);
    assert.equal(hero.apotheosis.stage, APOTHEOSIS_STAGES.MORTAL);
    assert.equal(hero.apotheosis.journalAscendedSynced, false);

    setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
    startApotheosisFromMantella(hero);
    const restarted = findActiveApotheosisQuest(machine);
    assert.ok(restarted);
    assert.deepEqual(restarted.getLogMessages().map((l) => [l.stepID, l.messageID]), [[0, 1011]]);
  } finally {
    setApotheosisQuestHost(null);
  }
});

test('Save/restore round-trip, tombstone expiry guard, and legacy backfill', () => {
  try {
    // 1) Save & restore mid-arc preserves ApotheosisState actions and syncs forward
    const h1 = makeHarness();
    setDebugFateWeight(h1.hero, REQUIRED_FATE_WEIGHT);
    startApotheosisFromMantella(h1.hero);
    advanceApotheosisQuestStep(h1.hero, APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR, { towerSiegeCleared: true });
    const saved = h1.machine.getSaveData();

    const h2 = makeHarness();
    h2.hero.apotheosis = structuredClone(h1.hero.apotheosis);
    h2.machine.restoreSaveData(saved);
    const restoredQ = findActiveApotheosisQuest(h2.machine);
    assert.ok(restoredQ);
    assert.equal(restoredQ.getLogMessages().some((l) => l.messageID === 1013), true);

    // Finish on h2 and fast-forward past 1-week tombstone expiry
    completeApotheosisQuestline(h2.hero);
    selectApotheosisPortfolio(h2.hero, 'order');
    assert.equal(h2.hero.apotheosis.journalAscendedSynced, true);
    h2.clock.sec += 8 * 86400;
    h2.machine.tick();
    assert.equal(findAnyApotheosisQuest(h2.machine), null);
    syncApotheosisQuests(h2.machine, h2.hero);
    assert.equal(findAnyApotheosisQuest(h2.machine), null, 'expired ascended quest must never restart');

    // 2) Legacy backfill mid-arc save (stage active, no quest in machine)
    const h3 = makeHarness();
    ensureApotheosisState(h3.hero);
    h3.hero.apotheosis.stage = APOTHEOSIS_STAGES.QUESTLINE_ACTIVE;
    h3.hero.apotheosis.source = APOTHEOSIS_SOURCES.ARTIFACTS;
    h3.hero.apotheosis.questlineStarted = true;
    h3.hero.apotheosis.questStep = APOTHEOSIS_QUEST_STEPS.SHADOW_DUEL;
    h3.hero.apotheosis.towerSiegeCleared = true;
    const backfilledMid = syncApotheosisQuests(h3.machine, h3.hero);
    assert.ok(backfilledMid);
    assert.deepEqual(
      backfilledMid.getLogMessages().map((l) => l.messageID),
      [1010, 1012, 1013, 1014],
    );

    // 3) Legacy backfill ascended save (journalAscendedSynced false, no quest in machine)
    const h4 = makeHarness();
    ensureApotheosisState(h4.hero);
    h4.hero.apotheosis.stage = APOTHEOSIS_STAGES.ASCENDED;
    h4.hero.apotheosis.ascended = true;
    h4.hero.apotheosis.portfolio = 'war';
    h4.hero.apotheosis.source = APOTHEOSIS_SOURCES.MANTELLA;
    h4.hero.apotheosis.questStep = APOTHEOSIS_QUEST_STEPS.COMPLETED;
    const backfilledEnd = syncApotheosisQuests(h4.machine, h4.hero);
    assert.ok(backfilledEnd);
    assert.equal(backfilledEnd.questComplete, true);
    assert.equal(backfilledEnd.questSuccess, true);
    assert.equal(backfilledEnd.questTombstoned, true);
    assert.equal(h4.hero.apotheosis.journalAscendedSynced, true);
    assert.deepEqual(
      [...backfilledEnd.activeLogMessages.values()].map((l) => l.messageID),
      [1011, 1012, 1013, 1014, 1015, 1016],
    );
    assert.deepEqual(h4.finishedArchives, [[1011, 1012, 1013, 1014, 1015, 1016]]);
  } finally {
    setApotheosisQuestHost(null);
  }
});

test('Order Faith and questsCompleted skip _APOTHEO while still counting normal quests', () => {
  const hero = makeHero();
  ensureApotheosisState(hero);
  hero.apotheosis.stage = APOTHEOSIS_STAGES.ASCENDED;
  hero.apotheosis.ascended = true;
  hero.apotheosis.portfolio = 'order';
  hero.apotheosis.faith = 100;

  assert.equal(
    recordQuestCompleted(hero, {
      questName: '_APOTHEO',
      factionId: 368,
      factionMembership: 'temple:akatosh',
      questSuccess: true,
    }),
    0,
  );
  assert.equal(hero.questsCompleted, 0);
  assert.equal(hero.apotheosis.faith, 100);

  assert.equal(
    recordQuestCompleted(hero, {
      questName: 'C0B00Y00',
      factionId: 368,
      factionMembership: 'temple:akatosh',
      questSuccess: true,
    }),
    1,
  );
  assert.equal(hero.questsCompleted, 1);
  assert.equal(hero.apotheosis.faith, 135);
});

test('isDirenniHardModeActive remains armed on SHADOW_DUEL for Recall recovery until Shadow defeated', () => {
  const hero = makeHero();
  const direnniLoc = {
    name: 'Direnni Tower',
    mapTableData: { mapId: DIRENNI_TOWER_MAP_ID, locationId: DIRENNI_TOWER_LOCATION_ID },
  };
  setDebugFateWeight(hero, REQUIRED_FATE_WEIGHT);
  startApotheosisFromMantella(hero);
  assert.equal(isDirenniHardModeActive(direnniLoc, hero), false);

  advanceApotheosisQuestStep(hero, APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR, { towerSiegeCleared: true });
  assert.equal(isDirenniHardModeActive(direnniLoc, hero), true);

  advanceApotheosisQuestStep(hero, APOTHEOSIS_QUEST_STEPS.SHADOW_DUEL, { towerSiegeCleared: true });
  assert.equal(isDirenniHardModeActive(direnniLoc, hero), true, 'Recall recovery keeps Zero Stone active');

  completeApotheosisQuestline(hero);
  assert.equal(isDirenniHardModeActive(direnniLoc, hero), false);
});

test('buildApotheosisDungeonMarks produces Exact marks for Zero Stone, live Shadow, and Conduit', () => {
  const state = {
    stage: APOTHEOSIS_STAGES.QUESTLINE_ACTIVE,
    questStep: APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR,
    shadowDefeated: false,
    ascended: false,
  };
  assert.deepEqual(
    buildApotheosisDungeonMarks({
      state,
      inOrrery: false,
      zeroStonePos: [10, 2, -5],
      followed: true,
    }),
    [{ at: [10, 2, -5], name: 'Zero Stone', followed: true }],
  );

  state.questStep = APOTHEOSIS_QUEST_STEPS.SHADOW_DUEL;
  assert.deepEqual(
    buildApotheosisDungeonMarks({
      state,
      inOrrery: false,
      zeroStonePos: [10, 2, -5],
      followed: false,
    }),
    [{ at: [10, 2, -5], name: 'Zero Stone', followed: false }],
  );

  assert.deepEqual(
    buildApotheosisDungeonMarks({
      state,
      inOrrery: true,
      foes: [
        { dead: false, entity: { shadowBoss: false }, ai: { feet: [1, 1, 1] } },
        { dead: false, entity: { shadowBoss: true }, ai: { feet: [0, 0.5, 14] } },
      ],
      followed: true,
    }),
    [{ at: [0, 0.5, 14], name: 'Shadow of the Agent', followed: true }],
  );

  state.stage = APOTHEOSIS_STAGES.AWAITING_PORTFOLIO;
  state.shadowDefeated = true;
  assert.deepEqual(
    buildApotheosisDungeonMarks({
      state,
      inOrrery: true,
      orreryCenter: [0, 0, 0],
      followed: true,
    }),
    [{ at: [0, 0, 0], name: 'Ascension Conduit', followed: true }],
  );

  state.stage = APOTHEOSIS_STAGES.ASCENDED;
  state.ascended = true;
  assert.deepEqual(buildApotheosisDungeonMarks({ state, inOrrery: true, orreryCenter: [0, 0, 0] }), []);
});

test('26-locale tables, meta hashes, macro parity, CJK/European wrapping, and live locale switch', () => {
  const macroTokens = (s) => (String(s ?? '').match(/(?:____|__)[A-Za-z0-9.]+_/g) ?? []).sort();
  const enCsv = readFileSync(join(ROOT, 'locales/en/Port_Strings.csv'), 'utf8');
  const enMap = new Map(parseStringTableCsv(enCsv));

  const realLocales = LOCALE_CATALOG.filter((l) => !l.hidden);
  assert.equal(realLocales.length, 26);

  for (const loc of realLocales) {
    const csvText = readFileSync(join(ROOT, 'locales', loc.code, 'Port_Strings.csv'), 'utf8');
    const locMap = new Map(parseStringTableCsv(csvText));
    const meta = loc.code === BASE_LOCALE
      ? null
      : JSON.parse(readFileSync(join(ROOT, 'locales', loc.code, 'Port_Strings.meta.json'), 'utf8'));

    for (const k of APOTHEOSIS_L10N_KEYS) {
      assert.ok(locMap.has(k), `${loc.code} missing ${k}`);
      const val = locMap.get(k);
      assert.ok(typeof val === 'string' && val.trim().length > 0, `${loc.code} empty ${k}`);
      assert.deepEqual(macroTokens(val), macroTokens(enMap.get(k)), `${loc.code} ${k} macro mismatch`);
      const wrapped = wrapQuestLogLines(val);
      assert.equal(wrapped[0], '%qdt:');
      for (const bodyLine of wrapped.slice(1)) {
        assert.ok(bodyLine.startsWith(' '), `${loc.code} ${k} missing indent`);
        for (const piece of bodyLine.match(/_*tower_*/g) ?? []) {
          assert.ok(
            piece === '__tower_' || piece === '____tower_',
            `${loc.code} ${k} malformed/split tower macro "${piece}" in "${bodyLine}"`,
          );
        }
      }
      assert.deepEqual(macroTokens(wrapped.slice(1).join(' ')), macroTokens(val), `${loc.code} ${k} lost macro during wrap`);
      if (meta) {
        assert.deepEqual(meta[k], {
          en: hash(enMap.get(k)),
          tr: hash(val),
          by: 'claude-in-session',
        }, `${loc.code} ${k} meta hash mismatch`);
      }
    }
  }

  // Live locale switching check across ru and ja
  try {
    _resetTextManagerForTests();
    patchLocaleTable('en', 'Port_Strings', parseStringTableCsv(enCsv));
    for (const code of ['ru', 'ja']) {
      const p = join(ROOT, 'locales', code, 'Port_Strings.csv');
      assert.equal(existsSync(p), true);
      patchLocaleTable(code, 'Port_Strings', parseStringTableCsv(readFileSync(p, 'utf8')));
    }
    setLocale('ru');
    assert.equal(localizedQuestDisplayName('_APOTHEO'), 'Апофеоз: Путь ЧИМ');
    const ruMsg = localizedQuestMessage('_APOTHEO', 1010);
    assert.ok(Array.isArray(ruMsg) && ruMsg[0] === '%qdt:');
    assert.match(ruMsg.join(' '), /Прорыв Дракона/);
    assert.match(localizedQuestSheetText('_APOTHEO.o.reachTower'), /____tower_/);
    assert.match(localizedQuestSheetText('_APOTHEO.r.ascended'), /Божественный Портфель/);

    setLocale('ja');
    assert.equal(localizedQuestDisplayName('_APOTHEO'), '神格化：CHIMの道');
    const jaMsg = localizedQuestMessage('_APOTHEO', 1010);
    assert.ok(Array.isArray(jaMsg) && jaMsg[0] === '%qdt:');
    assert.deepEqual(macroTokens(jaMsg.join('\n')), macroTokens(enMap.get('apotheosis.quest.log.artifacts')));
  } finally {
    _resetTextManagerForTests();
  }

  assert.equal(apotheosisPhaseRank({ stage: 'mortal', questStep: 'none' }), -1);
  assert.equal(apotheosisPhaseRank({ stage: 'ascended', ascended: true }), 5);
});
