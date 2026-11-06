import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  newLivingSaveData,
  getLivingSaveData,
  restoreLivingSaveData,
} from '../../src/systems/living/livingDirector.js';
import { resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import {
  getRegionState,
  setRegionCrisis,
  tickAllRegions,
  tickRegionDay,
} from '../../src/systems/living/regionState.js';
import {
  tickAdventurerSimulation,
  ensureAdventurerPool,
  isDungeonInCooldown,
  claimFallenAdventurerRemains,
} from '../../src/systems/living/adventurerSim.js';
import {
  getRegionCrisisLines,
  getSettlementEntryNotification,
  getRegionCrisisRumor,
  getRegionCrisisBulletinTokens,
} from '../../src/systems/living/crisisPresenter.js';
import { getBuildingCrisisFactor } from '../../src/systems/living/regionEconomy.js';
import { makeCityGate, updateCityGate } from '../../src/world/city/cityGate.js';
import { createTownEcon } from '../../src/systems/town/townEcon.js';
import { RumorMill } from '../../src/systems/rumorMill.js';
import { rentalDecision } from '../../src/systems/tavern.js';
import { CATEGORIES } from '../../src/ui/settings/settingsMap.js';
import { setPref } from '../../src/systems/uiPrefs.js';

describe('Living Tamriel Playable Beta — Steps 1–3 Wiring', () => {
  beforeEach(() => {
    restoreLivingSaveData(null);
    resetLivingConfig();
    setPref('livingPolitical', 'Mid');
    setPref('livingQuarantine', 'Mid');
    setPref('livingAdventurers', 'Mid');
    setPref('livingAllowQuestCompetition', true);
  });

  it('Step 1a: tickAllRegions covers all 71 regions and tension scales crisis outbreak probability including CIVIL_STRIFE', () => {
    const reg68 = getRegionState(68);
    assert.ok(reg68, 'region 68 should be initialized');
    reg68.tension = 100;
    // Probability with tension=100 is min(0.25, 0.015 + 0.15) = 0.165.
    // Roll = 0.10 triggers outbreak; index Roll = 0.90 selects CIVIL_STRIFE (> 0.85).
    let call = 0;
    const rolls = [0.10, 0.90];
    tickRegionDay(reg68, () => rolls[call++] ?? 0.5);
    assert.equal(getRegionState(68).crisis, 'CIVIL_STRIFE');
    assert.equal(getRegionState(68).phase, 'START');

    // Verify tickAllRegions ticks region 70
    setRegionCrisis(70, 'WAR', 'START');
    const beforeDays = getRegionState(70).phaseDaysRemaining;
    tickAllRegions(() => 0.99);
    assert.equal(getRegionState(70).phaseDaysRemaining, beforeDays - 1);
  });

  it('Step 1b: updateCityGate physically locks gates at midday during PLAGUE.MID quarantine', () => {
    setRegionCrisis(17, 'PLAGUE', 'MID');
    const gate = makeCityGate(446);
    updateCityGate(gate, false, { online: false, region: 17 });
    assert.equal(gate.isOpen, false, 'gate should lock during daytime when region 17 is under PLAGUE.MID');

    setRegionCrisis(17, 'PEACE', 'NONE');
    updateCityGate(gate, false, { online: false, region: 17 });
    assert.equal(gate.isOpen, true, 'gate should open during daytime when region 17 returns to PEACE');
  });

  it('Step 1c: dungeon numeric mapId matches deterministic regional dungeon slots and prunes previous-day DEAD adventurers', () => {
    const pool = ensureAdventurerPool();
    pool[0].status = 'DELVING';
    pool[0].targetLocationId = 'dungeon_0_3';
    pool[0].daysRemainingInAction = 1;

    // Resolve delve with roll = 0.99 (> baseSuccess so adventurer dies and leaves remains in dungeon_0_3)
    tickAdventurerSimulation({ rng: () => 0.99 });

    assert.equal(pool[0].status, 'DEAD', 'adventurer should fall on failed delve roll');
    const numericMapId = 5003; // 5003 % 10 === 3 -> matches dungeon_0_3 in region 0

    const claimed = claimFallenAdventurerRemains(numericMapId, 0);
    assert.ok(Array.isArray(claimed) && claimed.length === 1, 'numeric mapId in region 0 should match fallen adventurer slot');
    assert.equal(claimed[0].adventurerName, pool[0].name);

    // Next day: prune previous-day DEAD records and succeed delve on dungeon_0_7
    const nextAdv = ensureAdventurerPool().find((a) => a.currentRegion === 0 && a.status !== 'DEAD');
    nextAdv.status = 'DELVING';
    nextAdv.targetLocationId = 'dungeon_0_7';
    nextAdv.daysRemainingInAction = 1;
    tickAdventurerSimulation({ rng: () => 0.01 });

    const allAfterClear = ensureAdventurerPool();
    assert.equal(allAfterClear.length, 13 * 62, `total pool size should stay at 806 without dead bloat (got ${allAfterClear.length})`);
    assert.equal(allAfterClear.filter((a) => a.status === 'DEAD').length, 0, 'previous-day DEAD records should be pruned');
    assert.equal(isDungeonInCooldown(9007, 0), true, 'numeric mapId 9007 should match dungeon cooldown slot 7 in region 0');
  });

  it('Step 1d: savestate round-trips nemesis, allowQuestCompetition, and pleas state', () => {
    const raw = newLivingSaveData();
    raw.config.nemesis = 3;
    raw.config.allowQuestCompetition = false;
    raw.subsystems.pleas = { lastPleaMinute: 4321 };
    restoreLivingSaveData(raw);

    const saved = getLivingSaveData();
    assert.equal(saved.config.nemesis, 3);
    assert.equal(saved.config.allowQuestCompetition, false);
    assert.equal(saved.subsystems.pleas?.lastPleaMinute, 4321);
  });

  it('Step 2a: Crisis Presenter & TownEcon surface crisis status in Settlement Banner, Town Panel, and Map Hover (online & offline)', () => {
    assert.deepEqual(getRegionCrisisLines(17), []);
    assert.equal(getSettlementEntryNotification(17, 'Daggerfall'), null);

    setRegionCrisis(17, 'WAR', 'MID');
    const lines = getRegionCrisisLines(17);
    assert.equal(lines.length, 2);
    assert.match(lines[0], /Open Warfare/i);
    assert.match(lines[1], /Weapons and armor/i);

    const banner = getSettlementEntryNotification(17, 'Daggerfall');
    assert.match(banner, /Daggerfall.*martial law/i);

    // Offline TownEcon still shows regional crisis lines on hover and Town Panel!
    const econOffline = createTownEcon({
      online: () => false,
      townOf: () => ({ name: 'Daggerfall', type: 0, region: 17 }),
      nowMs: () => 1000,
    });
    const offlineTip = econOffline.tipAt(100);
    assert.ok(offlineTip && offlineTip.lines.some((l) => /Open Warfare/i.test(l)));
    assert.equal(econOffline.panelLinesAt(100).length, 2);
    assert.equal(typeof econOffline.tipFnAt(100), 'function');
  });

  it('Step 2b: RumorMill connects spoken NPC rumors and bulletin boards to active regional crises', () => {
    setRegionCrisis(17, 'PLAGUE', 'MID');
    const rm = new RumorMill({
      currentRegionIndex: () => 17,
      rolls: () => 0.01,
    });

    const rumor = rm.getNewsOrRumors();
    assert.match(rumor, /Plague has locked the city gates of Daggerfall/i);

    const boardTokens = rm.getNewsOrRumorsForBulletinBoard();
    assert.ok(Array.isArray(boardTokens) && boardTokens.length > 0);
    assert.match(boardTokens[0].text, /Plague has locked the city gates of Daggerfall/i);

    assert.ok(getRegionCrisisRumor(17));
    assert.ok(getRegionCrisisBulletinTokens(17));
  });

  it('Step 3: Regional Crisis Economy scales shop building factors, tavern room prices, and settings labels', () => {
    setRegionCrisis(17, 'WAR', 'MID');
    assert.equal(getBuildingCrisisFactor('WeaponSmith', 17), 1.35);
    assert.equal(getBuildingCrisisFactor(2, 17), 1.35);

    setRegionCrisis(17, 'PLAGUE', 'MID');
    assert.equal(getBuildingCrisisFactor('Alchemist', 17), 1.4);
    assert.equal(getBuildingCrisisFactor(0, 17), 1.4);

    setRegionCrisis(17, 'FAMINE', 'MID');
    assert.equal(getBuildingCrisisFactor('GeneralStore', 17), 1.5);
    assert.equal(getBuildingCrisisFactor(6, 17), 1.5);

    const baseQuote = rentalDecision('1', { quality: 10, date: { month: 1, day: 1 }, regionIndex: 0 });
    const famineQuote = rentalDecision('1', { quality: 10, date: { month: 1, day: 1 }, regionIndex: 17 });
    assert.ok(famineQuote.price > baseQuote.price, `famine tavern price (${famineQuote.price}) should exceed peace price (${baseQuote.price})`);

    const livingTab = CATEGORIES.find((tab) => tab.id === 'living');
    assert.ok(livingTab);
    assert.equal(livingTab.title, 'Living Tamriel');
    assert.equal(livingTab.sections.length, 3);
  });
});
