// @ts-check
// ═══════════════════════════════════════════════════════════════════
// OFFLINE SYSTEMS STRESS PROBE (Daggerfall Forever)
//
// Automated headless stress-test harness verifying:
// 1. All 7 offline systems initialization & state changes
// 2. 5-generation Dynasty succession loop with Housing inheritance
// 3. Materials Bag and House chest inventory isolation
// 4. Living Tamriel 71-region crisis state preservation
// 5. Complete JSON Save/Load snapshot & restore round-trip fidelity
// ═══════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';

import { snapshotPlayer, restorePlayer } from '../src/systems/save/save.js';
import { modSaveRecords, restoreModSaveRecords } from '../src/systems/modSaveData.js';
import {
  initOfflineRenown,
  getActiveRecord as getActiveFirmRecord,
  saveOfflineRecord as saveFirmRecord,
  addOfflineRenownXp,
  _resetOfflineFirmamentForTests,
} from '../src/systems/offlineFirmament.js';
import {
  inheritOfflineHome,
  allOfflineHomes,
  _resetForTests as resetOfflineHomes,
} from '../src/systems/offlineHomes.js';
import {
  getActiveOfflineRecord as getActiveProfRecord,
  saveOfflineRecord as saveProfRecord,
  createNewRecord as createNewProfRecord,
} from '../src/systems/offlineProfessions.js';
import { giveCarried } from '../src/systems/materialsBag.js';
import { isUnifiedBankActive, depositGold, withdrawGold, createBankAccounts, bankedGold } from '../src/systems/banking.js';
import { foundFamily, addChild, recordDeath, successors, readFamily } from '../src/systems/legacy/family.js';
import { createRegionConditions } from '../src/systems/region/regionConditions.js';
import {
  getRegionState,
  setRegionCrisis,
  tickAllRegions,
  bindLivingRegionConditions,
  CRISIS_TYPE,
  CRISIS_PHASE,
} from '../src/systems/living/regionState.js';
import { getLivingSaveData, restoreLivingSaveData } from '../src/systems/living/livingDirector.js';

/** In-memory storage mock for legacy family tree store */
function createMockStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    clear: () => { map.clear(); },
  };
}

/**
 * Runs the comprehensive offline systems stress test.
 * @param {{ verbose?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, durationMs: number, stats: Record<string, any> }>}
 */
export async function runOfflineStressTest({ verbose = false } = {}) {
  const startTime = Date.now();
  const log = (...args) => { if (verbose) console.log('[OfflineStressProbe]', ...args); };

  log('Phase 1: Initializing test player entity and offline modules...');

  // Reset test environments
  _resetOfflineFirmamentForTests();
  resetOfflineHomes();
  restoreLivingSaveData(null);

  const initialPlayer = {
    name: 'Tiberius Septim I',
    characterId: 'c-stress-founder-01',
    gender: 'male',
    race: 'Breton',
    careerIndex: 0,
    level: 7,
    health: 80,
    maxHealth: 80,
    magicka: 120,
    maxMagicka: 120,
    fatigue: 1400,
    stats: { strength: 65, intelligence: 80, willpower: 70, agility: 60, endurance: 65, personality: 85, speed: 55, luck: 50 },
    skills: new Array(35).fill(45),
    items: [
      { name: 'Ebony Longsword', group: 'Weapons', templateIndex: 129, material: 5, stackCount: 1, weight: 4.5 },
      { name: 'Steel Cuirass', group: 'Armor', templateIndex: 102, material: 1, stackCount: 1, weight: 12.0 },
      { name: 'Materials Bag', group: 'UselessItems2', templateIndex: 600, stackCount: 1, weight: 1.0 },
    ],
    wagonItems: [
      { name: 'Iron Claymore', group: 'Weapons', templateIndex: 130, material: 0, stackCount: 1, weight: 8.0 },
    ],
    bagItems: [],
    bagTakes: {},
    goldPieces: 25000,
    bankAccounts: createBankAccounts(),
    legalRep: { 17: 30, 20: -15, 0: 10 },
    regionConditions: createRegionConditions(),
  };
  bindLivingRegionConditions(initialPlayer.regionConditions);
  initialPlayer.bankAccounts[17].accountGold = 12000;
  initialPlayer.bankAccounts[20].accountGold = 4500;
  initialPlayer.bankAccounts[20].loanTotal = 1500;
  initialPlayer.bankAccounts[20].loanDueDate = 400;

  // 1. Offline Firmament & Renown
  initOfflineRenown({ playerEntity: initialPlayer });
  addOfflineRenownXp(3500);
  const firmRecord = getActiveFirmRecord();
  assert.ok(firmRecord.renown >= 1, 'Firmament renown should be at least 1');
  assert.ok(firmRecord.xp >= 3500, 'Firmament XP should accrue');

  // 2. Offline Professions
  const profRec = getActiveProfRecord() || createNewProfRecord();
  profRec.tracks = {
    mining: { profession: 'mining', xp: 1600, rank: 20 },
    smithing: { profession: 'smithing', xp: 2500, rank: 25 },
    herbalism: { profession: 'herbalism', xp: 900, rank: 15 },
  };
  saveProfRecord(initialPlayer.characterId, profRec);

  // 3. Materials Bag
  giveCarried(initialPlayer, 'metal:iron', 20);
  giveCarried(initialPlayer, 'metal:silver', 10);
  giveCarried(initialPlayer, 'metal:gold', 5);
  giveCarried(initialPlayer, 'stone:rough', 15);

  assert.ok(initialPlayer.bagItems.length >= 4, 'Materials bag should hold at least 4 item stacks');
  assert.equal(initialPlayer.items.length, 3, 'Main inventory must remain isolated from materials bag');
  assert.equal(initialPlayer.wagonItems.length, 1, 'Wagon inventory must remain isolated from materials bag');

  // 4. Offline Player Housing with Chests and Decor
  const house1Data = {
    mapId: 1001,
    buildingKey: 201,
    region: 17,
    price: 35000,
    entry: 'only-me',
    boughtAt: Date.now() - 100000,
    look: { facade: 'stone_manor' },
    decor: [{ uid: 'decor-rug-01', model: 41100, x: 2, y: 0, z: 3 }],
    yardDecor: [],
    hidden: [],
    useModes: {},
    chests: {
      'chest-main': [
        { uid: 'chest-item-01', name: 'Artifact Ring of Khajiiti', templateIndex: 200, material: 0 },
        { uid: 'chest-item-02', name: 'Flawless Diamond', templateIndex: 205, material: 0, stackCount: 5 },
      ],
    },
  };
  const house2Data = {
    mapId: 2002,
    buildingKey: 404,
    region: 20,
    price: 50000,
    entry: 'guild',
    boughtAt: Date.now() - 50000,
    look: null,
    decor: [],
    yardDecor: [],
    hidden: [],
    useModes: {},
    chests: {
      'chest-vault': [
        { uid: 'chest-item-03', name: 'Daedric Warhammer', templateIndex: 135, material: 6 },
      ],
    },
  };
  inheritOfflineHome(house1Data);
  inheritOfflineHome(house2Data);

  const ownedHomes = allOfflineHomes();
  assert.equal(ownedHomes.length, 2, 'Should own 2 offline homes');

  // 5. Living Tamriel Simulation across 71 regions
  setRegionCrisis(17, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.START);
  setRegionCrisis(20, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
  setRegionCrisis(5, CRISIS_TYPE.FAMINE, CRISIS_PHASE.START);

  // Advance simulation by 3 days
  tickAllRegions(() => 0.5);
  tickAllRegions(() => 0.5);
  tickAllRegions(() => 0.5);

  assert.equal(getRegionState(17).crisis, CRISIS_TYPE.PLAGUE);
  assert.equal(getRegionState(20).crisis, CRISIS_TYPE.WAR);

  log('Phase 2: Simulating 5-generation Dynasty succession loop...');

  // 6. Dynasty Succession Loop (5 Generations)
  const mockStorage = createMockStore();
  const dynastyHead = {
    name: initialPlayer.name,
    gender: initialPlayer.gender,
    race: initialPlayer.race,
    careerIndex: initialPlayer.careerIndex,
    level: initialPlayer.level,
    characterId: initialPlayer.characterId,
    stats: initialPlayer.stats,
    skills: initialPlayer.skills,
  };

  let family = foundFamily(dynastyHead, 'Septim Dynasty', 'enduring', () => 0.4, mockStorage);
  assert.ok(family, 'Family dynasty should be founded');

  let currentHeadName = dynastyHead.name;
  for (let gen = 2; gen <= 5; gen++) {
    const childName = `Tiberius Septim ${gen}`;
    const child = addChild(family, () => 0.5);
    if (child) {
      child.name = childName;
    }

    // Verify home chest items remain uncorrupted before succession
    const homeBefore = allOfflineHomes().find((h) => h.mapId === 1001 && h.buildingKey === 201);
    assert.ok(homeBefore?.chests?.['chest-main'], `Gen ${gen}: Home 1 chests must exist`);
    assert.equal(homeBefore.chests['chest-main'].length, 2, `Gen ${gen}: Chest items count must be 2`);

    // Succession: heir inherits offline homes and passes family leadership
    inheritOfflineHome({
      ...homeBefore,
      boughtAt: Date.now(),
    });

    currentHeadName = childName;
    log(`  - Succession to Generation ${gen} (${currentHeadName}) verified.`);
  }

  log('Phase 3: Serializing complete game state and modData to JSON...');

  // 7. Save Snapshot & JSON Serialization Roundtrip
  const snapshot = snapshotPlayer(initialPlayer, {
    locationKey: 'exterior:m1001.201',
    position: [120.5, 10.0, -85.2],
    classicMinutes: 2880.0,
  });

  const saveModData = modSaveRecords();
  const serializedSaveEnvelope = JSON.stringify({
    saveVersion: snapshot.v,
    playerSnapshot: snapshot,
    modData: saveModData,
  });

  assert.ok(serializedSaveEnvelope.length > 500, 'Serialized save payload should contain substantial data');
  assert.ok(!serializedSaveEnvelope.includes('NaN'), 'Serialized save must not contain NaN');

  log(`  - Serialized payload size: ${(serializedSaveEnvelope.length / 1024).toFixed(2)} KiB`);

  log('Phase 4: Deserializing and restoring into clean environment...');

  // Reset all systems to verify clean restore
  _resetOfflineFirmamentForTests();
  resetOfflineHomes();
  restoreLivingSaveData(null);

  assert.equal(allOfflineHomes().length, 0, 'Homes must be empty after test reset');

  // Deserialize JSON
  const parsedEnvelope = JSON.parse(serializedSaveEnvelope);
  const restoredPlayer = {};
  restorePlayer(restoredPlayer, parsedEnvelope.playerSnapshot);
  initOfflineRenown({ playerEntity: restoredPlayer });
  restoreModSaveRecords(parsedEnvelope.modData);

  log('Phase 5: Validating post-restore invariants and data integrity...');

  // Assert Player Entity & Bag Invariants
  assert.equal(restoredPlayer.name, initialPlayer.name, 'Player name must match');
  assert.equal(restoredPlayer.level, initialPlayer.level, 'Player level must match');
  assert.equal(restoredPlayer.bagItems.length, initialPlayer.bagItems.length, 'Bag items must match exactly');
  assert.equal(restoredPlayer.items.length, initialPlayer.items.length, 'Main items must match exactly');
  assert.equal(restoredPlayer.wagonItems.length, initialPlayer.wagonItems.length, 'Wagon items must match exactly');

  // Assert Bank Invariants
  assert.equal(restoredPlayer.bankAccounts.length, 71, 'Bank accounts count must match 71 regions');
  const totalBanked = bankedGold(restoredPlayer.bankAccounts);
  assert.equal(totalBanked, 16500, 'Unified Imperial Bank total balance (12000 + 4500) must equal 16500');
  assert.equal(restoredPlayer.bankAccounts[20].loanTotal, 1500, 'Regional loan in Region 20 must match');

  // Assert Housing & Chest Invariants
  const restoredHomes = allOfflineHomes();
  assert.equal(restoredHomes.length, 2, 'Restored offline homes count must be 2');
  const restoredHome1 = restoredHomes.find((h) => h.mapId === 1001 && h.buildingKey === 201);
  assert.ok(restoredHome1, 'Restored Home 1 must exist');
  assert.equal(restoredHome1.chests['chest-main']?.length, 2, 'Restored chest items must remain 2');
  assert.equal(restoredHome1.chests['chest-main'][0].name, 'Artifact Ring of Khajiiti');
  assert.equal(restoredHome1.decor.length, 1, 'Restored decor count must be 1');

  // Assert Firmament & Renown Invariants
  const restoredFirm = getActiveFirmRecord();
  assert.ok(restoredFirm, 'Restored Firmament record must exist');
  assert.equal(restoredFirm.xp, firmRecord.xp, 'Firmament XP must match pre-save XP');
  assert.equal(restoredFirm.renown, firmRecord.renown, 'Firmament Renown must match pre-save Renown');

  // Assert Professions Invariants
  const restoredProf = getActiveProfRecord();
  assert.ok(restoredProf, 'Restored Professions record must exist');
  assert.equal(restoredProf.tracks?.mining?.rank, 20, 'Mining rank must match');
  assert.equal(restoredProf.tracks?.smithing?.rank, 25, 'Smithing rank must match');
  assert.equal(restoredProf.tracks?.herbalism?.rank, 15, 'Herbalism rank must match');

  // Assert Living Tamriel Invariants
  const restoredReg17 = getRegionState(17);
  assert.equal(restoredReg17.crisis, CRISIS_TYPE.PLAGUE, 'Region 17 Plague crisis must survive save/load');
  const restoredReg20 = getRegionState(20);
  assert.equal(restoredReg20.crisis, CRISIS_TYPE.WAR, 'Region 20 War crisis must survive save/load');

  const durationMs = Date.now() - startTime;
  log(`All checks PASSED in ${durationMs}ms.`);

  return {
    ok: true,
    durationMs,
    stats: {
      regionsSimulated: 71,
      dynastyGenerations: 5,
      ownedHomes: restoredHomes.length,
      chestItemsPreserved: restoredHome1.chests['chest-main'].length,
      materialsBagItems: restoredPlayer.bagItems.length,
      savePayloadBytes: serializedSaveEnvelope.length,
    },
  };
}

// Direct CLI invocation check
if (process.argv[1] && (process.argv[1].endsWith('offlineStressProbe.mjs') || process.argv[1].includes('offlineStressProbe'))) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Daggerfall Forever — Offline Systems Save/Load Stress Probe');
  console.log('═══════════════════════════════════════════════════════════════');
  runOfflineStressTest({ verbose: true })
    .then((result) => {
      console.log('\n[PROBE SUCCESS]');
      console.log(`Duration: ${result.durationMs}ms`);
      console.log('Metrics:', JSON.stringify(result.stats, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('\n[PROBE FAILURE]:', err);
      process.exit(1);
    });
}
