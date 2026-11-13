// @ts-check
import '../modsOff.js';
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLichdom,
  applyAncientLichdom,
  isLich,
  isAncientLich,
  cureLichdom,
  cureAncientLichdom,
  LICH_STAT_MODS,
  LICH_SKILL_MODS,
  ANCIENT_LICH_STAT_MODS,
  ANCIENT_LICH_SKILL_MODS,
} from '../../src/systems/necromancy/lichdomStatus.js';
import {
  setLichCemeteryRespawnHook,
} from '../../src/systems/necromancy/lichdomRitual.js';
import {
  _resetTaintForTests,
  addNecroTaint,
  getPlayerTaint,
  getEffectiveTradeTaint,
  tickTaintDaily,
} from '../../src/systems/necromancy/necroTaint.js';
import { liveUndeadCurse } from '../../src/systems/racialLive.js';
import { liveStat } from '../../src/systems/statMods.js';
import { SKILLS, skillValue } from '../../src/systems/skills.js';
import { snapshotPlayer, restorePlayer } from '../../src/systems/save/save.js';
import { bonusOrPenaltyByEnemyType } from '../../src/combat/formulas.js';
import { pcaaoBonusOrPenaltyByEnemyType } from '../../src/combat/pcaao.js';
import { survivalHudChips, survivalStatusLines } from '../../src/systems/survival/status.js';
import { hurtPlayer, setDeathPresenter, setDeathListener } from '../../src/characters/playerEntity.js';
import { createLegacyHost } from '../../src/scenes/legacyHost.js';
import { MODELS, familyRng } from '../../src/systems/legacy/family.js';
import { _resetModSaveData } from '../../src/systems/modSaveData.js';
import { LOCATION_TYPES } from '../../src/formats/mapsFile.js';
import {
  LivingTamrielConfig,
  PRESENCE,
  LIVING_ADVENTURER_LOOT,
  resetLivingConfig,
} from '../../src/systems/living/livingConfig.js';
import {
  getLivingSaveData,
  restoreLivingSaveData,
} from '../../src/systems/living/livingDirector.js';
import {
  CRISIS_TYPE,
  CRISIS_PHASE,
  setRegionCrisis,
} from '../../src/systems/living/regionState.js';
import {
  acceptRegionalCrisisContract,
  completeRegionalCrisisContract,
} from '../../src/systems/living/crisisPresenter.js';
import { resolvePleaResponse, PLEA_TYPE, PLEA_OUTCOME } from '../../src/systems/living/pleaHost.js';
import { adjustPlayerRegionalRep } from '../../src/systems/living/livingWorldSpawner.js';
import { shouldDispatchNemesis } from '../../src/systems/living/nemesisHost.js';
import {
  getReputationPriceModifier,
  evaluateHousePurchaseReputation,
  evaluateShipyardReputation,
} from '../../src/systems/living/reputationConsequences.js';
import {
  ECONOMY_CATEGORY,
  applyCrisisPriceMultiplier,
  getBuildingCrisisFactor,
} from '../../src/systems/living/regionEconomy.js';
import { BUILDING_TYPES } from '../../src/world/buildingNames.js';
import { calculateTradePrice } from '../../src/systems/shopStock.js';
import { tradeCost } from '../../src/systems/tradeModes.js';
import { markStolen } from '../../src/systems/stolenGoods.js';
import {
  registerVirtualMod,
  setModEnabled,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import {
  syncModData,
  getMaterialDamageMultiplier,
  _resetModDataSync,
} from '../../src/systems/mods/modDataSync.js';
import { potionRecipeByKey, potionRecipeKey } from '../../src/systems/potions.js';
import {
  registerPerk,
  clearDynamicPerks,
  getUnlockedPerks,
  getPerkBladeMasteryDamageMultiplier,
} from '../../src/systems/perks/perkRegistry.js';

function makePlayer(over = {}) {
  const skills = new Array(35).fill(30);
  skills[SKILLS.Mysticism] = 60;
  skills[SKILLS.Destruction] = 50;
  skills[SKILLS.Alteration] = 40;
  skills[SKILLS.LongBlade] = 60;
  return {
    isPlayer: true,
    name: 'AuditHero',
    gender: 'male',
    race: 'Breton',
    raceId: 0,
    faceIndex: 0,
    careerIndex: 5,
    career: { name: 'Nightblade', primarySkills: [28, 22, 16], majorSkills: [19, 24, 13], minorSkills: [1, 2, 3, 4, 5, 6] },
    level: 10,
    characterId: 'c-audit',
    chargenDone: true,
    health: 150,
    maxHealth: 150,
    magicka: 120,
    maxMagicka: 120,
    fatigue: 200,
    maxFatigue: 200,
    stats: {
      strength: 60,
      intelligence: 60,
      willpower: 60,
      agility: 60,
      endurance: 60,
      personality: 60,
      speed: 60,
      luck: 50,
    },
    skills,
    activeEffects: [],
    racialOverride: null,
    items: [],
    gold: 1000,
    legalRep: new Array(72).fill(0),
    regionalReputations: new Array(72).fill(0),
    sGroupReputations: [0, 0, 0, 0, 0, 0, 0],
    survival: {
      lastAte: -1500,
      thirst: 90,
      wet: 0,
      sleepDebt: 10,
      awakeSince: -1500,
      exposure: 0,
      fed: 0,
      drunk: 0,
    },
    ...over,
  };
}

function makeMemStore() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

beforeEach(() => {
  _resetTaintForTests();
  resetLivingConfig();
  restoreLivingSaveData(null);
  _resetModRegistry();
  _resetModDataSync();
  clearDynamicPerks();
});

afterEach(() => {
  _resetTaintForTests();
  resetLivingConfig();
  restoreLivingSaveData(null);
  setRegionCrisis(0, CRISIS_TYPE.PEACE);
  _resetModRegistry();
  _resetModDataSync();
  clearDynamicPerks();
  setLichCemeteryRespawnHook(null);
  setDeathPresenter(null);
  setDeathListener('audit_cross_listener', null);
});

describe('Suite 1: Lichdom, Ancient Lichdom, Stats/Skills, Taint & Save/Restore', () => {
  test('Lichdom & Ancient Lichdom apply exact modifiers, guard against Vampire overwrite, and round-trip save without Taint bleed', () => {
    const hero = makePlayer({ stats: { ...makePlayer().stats, personality: 80 } });
    const lichOver = applyLichdom(hero, { phylacteryId: 'phyl_1', nowMinutes: 100 });
    assert.ok(lichOver);
    assert.equal(isLich(hero), true);
    assert.ok(liveUndeadCurse(hero));

    assert.equal(liveStat(hero, 'intelligence'), 60 + LICH_STAT_MODS.intelligence);
    assert.equal(liveStat(hero, 'willpower'), 60 + LICH_STAT_MODS.willpower);
    assert.equal(liveStat(hero, 'personality'), 80 + LICH_STAT_MODS.personality);
    assert.equal(skillValue(hero, SKILLS.Mysticism), 60 + LICH_SKILL_MODS[SKILLS.Mysticism]);
    assert.equal(skillValue(hero, SKILLS.Destruction), 50 + LICH_SKILL_MODS[SKILLS.Destruction]);
    assert.equal(skillValue(hero, SKILLS.Alteration), 40 + LICH_SKILL_MODS[SKILLS.Alteration]);
    assert.equal(getPlayerTaint(hero), 100);

    // Vampire mutual-exclusion guard for BOTH applyLichdom and applyAncientLichdom
    const vamp = makePlayer({
      racialOverride: { kind: 'racialOverride', racial: 'vampirism', ended: false },
      activeEffects: [{ kind: 'racialOverride', racial: 'vampirism', ended: false }],
    });
    assert.equal(applyLichdom(vamp), null, 'Lichdom must not overwrite active Vampirism');
    assert.equal(applyAncientLichdom(vamp), null, 'Ancient Lichdom must not overwrite active Vampirism');
    assert.equal(vamp.racialOverride.racial, 'vampirism');

    // Ascend Lich -> Ancient Lichdom
    const archOver = applyAncientLichdom(hero, { phylacteryId: 'phyl_1', nowMinutes: 500 });
    assert.ok(archOver);
    assert.equal(isAncientLich(hero), true);
    assert.equal(liveStat(hero, 'intelligence'), 60 + ANCIENT_LICH_STAT_MODS.intelligence);
    assert.equal(liveStat(hero, 'willpower'), 60 + ANCIENT_LICH_STAT_MODS.willpower);
    assert.equal(liveStat(hero, 'personality'), 80 + ANCIENT_LICH_STAT_MODS.personality);
    assert.equal(skillValue(hero, SKILLS.Mysticism), 60 + ANCIENT_LICH_SKILL_MODS[SKILLS.Mysticism]);
    assert.equal(skillValue(hero, SKILLS.Destruction), 50 + ANCIENT_LICH_SKILL_MODS[SKILLS.Destruction]);
    assert.equal(skillValue(hero, SKILLS.Alteration), 40 + ANCIENT_LICH_SKILL_MODS[SKILLS.Alteration]);

    // Snapshot & restore into fresh entity
    const snap = JSON.parse(JSON.stringify(snapshotPlayer(hero, { classicMinutes: 1440 * 500 })));
    const loadedLich = makePlayer({ name: 'FreshSlot', skills: new Array(35).fill(10) });
    restorePlayer(loadedLich, snap);

    assert.equal(isAncientLich(loadedLich), true);
    assert.equal(loadedLich.necroTaint, 100);
    assert.equal(getPlayerTaint(loadedLich), 100);
    assert.equal(liveStat(loadedLich, 'intelligence'), 60 + ANCIENT_LICH_STAT_MODS.intelligence);
    assert.equal(skillValue(loadedLich, SKILLS.Mysticism), 60 + ANCIENT_LICH_SKILL_MODS[SKILLS.Mysticism]);

    // Now load a mortal save AFTER Lich session: _playerTaint MUST reset to 0 (no cross-save bleed)
    const cleanMortal = makePlayer({ name: 'MortalSave', necroTaint: 0 });
    const mortalSnap = JSON.parse(JSON.stringify(snapshotPlayer(cleanMortal, { classicMinutes: 1440 * 10 })));
    const restoredMortal = makePlayer({ necroTaint: 99 });
    restorePlayer(restoredMortal, mortalSnap);

    assert.equal(isLich(restoredMortal), false);
    assert.equal(isAncientLich(restoredMortal), false);
    assert.equal(restoredMortal.necroTaint, 0);
    assert.equal(getPlayerTaint(restoredMortal), 0);
  });

  test('tickTaintDaily guards unanchored high calendar days and backward save loads', () => {
    const caster = makePlayer();
    addNecroTaint(50, caster);
    assert.equal(getPlayerTaint(caster), 50);

    // High DFU calendar day when _lastDecayDay === 0 must anchor without wiping 500 days
    tickTaintDaily(500, caster);
    assert.equal(getPlayerTaint(caster), 50);
    tickTaintDaily(501, caster);
    const afterOneDay = getPlayerTaint(caster);
    assert.ok(afterOneDay < 50 && afterOneDay >= 45, `Expected 1 day decay from 50, got ${afterOneDay}`);

    // Backward save load (currentDay < _lastDecayDay) must re-anchor so subsequent day decays properly
    tickTaintDaily(120, caster);
    assert.equal(getPlayerTaint(caster), afterOneDay);
    tickTaintDaily(121, caster);
    const afterBackLoadTick = getPlayerTaint(caster);
    assert.ok(afterBackLoadTick < afterOneDay, `Expected decay on day 121 after backward load, got ${afterBackLoadTick}`);
  });
});

describe('Suite 2: Lichdom vs Combat Enemy Group (Stock & PCAAO), Survival, Reconstitution & Project Legacy', () => {
  test('Stock formulas and PCAAO classify Lich, Ancient Lich, and Vampire players as Undead', () => {
    const UNDEAD_BONUS = 0x01;
    const UNDEAD_PHOBIA = 0x10;
    const HUMANOID_BONUS = 0x04;
    const rolls = () => 0.5;

    const undeadHunter = { level: 8, attackModifierFlags: UNDEAD_BONUS, stats: { willpower: 40 } };
    const undeadPhobic = { level: 8, attackModifierFlags: UNDEAD_PHOBIA, stats: { willpower: 40 } };
    const humanHunter = { level: 8, attackModifierFlags: HUMANOID_BONUS, stats: { willpower: 40 } };

    const mortal = makePlayer({ level: 20 });
    const vamp = makePlayer({ level: 20, activeEffects: [{ kind: 'racialOverride', racial: 'vampirism', ended: false }] });
    const lich = makePlayer({ level: 20 });
    applyLichdom(lich);
    const archLich = makePlayer({ level: 20 });
    applyAncientLichdom(archLich);

    // Stock combat formulas
    assert.equal(bonusOrPenaltyByEnemyType(undeadHunter, mortal), 0);
    assert.equal(bonusOrPenaltyByEnemyType(undeadHunter, vamp), 8);
    assert.equal(bonusOrPenaltyByEnemyType(undeadHunter, lich), 8);
    assert.equal(bonusOrPenaltyByEnemyType(undeadHunter, archLich), 8);
    assert.equal(bonusOrPenaltyByEnemyType(undeadPhobic, lich), -8);
    assert.equal(bonusOrPenaltyByEnemyType(humanHunter, mortal), 8);
    assert.equal(bonusOrPenaltyByEnemyType(humanHunter, lich), 0);
    assert.equal(bonusOrPenaltyByEnemyType(humanHunter, archLich), 0);

    // PCAAO combat formulas
    assert.equal(pcaaoBonusOrPenaltyByEnemyType(undeadHunter, mortal, rolls), 0);
    assert.ok(pcaaoBonusOrPenaltyByEnemyType(undeadHunter, vamp, rolls) > 0, 'PCAAO Undead bonus must hit Vampire');
    assert.ok(pcaaoBonusOrPenaltyByEnemyType(undeadHunter, lich, rolls) > 0, 'PCAAO Undead bonus must hit Lich');
    assert.ok(pcaaoBonusOrPenaltyByEnemyType(undeadHunter, archLich, rolls) > 0, 'PCAAO Undead bonus must hit Ancient Lich');
    assert.ok(pcaaoBonusOrPenaltyByEnemyType(undeadPhobic, archLich, rolls) < 0, 'PCAAO Undead phobia must penalize attacker vs Ancient Lich');
    assert.ok(pcaaoBonusOrPenaltyByEnemyType(humanHunter, mortal, rolls) > 0);
    assert.equal(pcaaoBonusOrPenaltyByEnemyType(humanHunter, lich, rolls), 0, 'PCAAO Humanoid bonus must NOT hit Lich');
    assert.equal(pcaaoBonusOrPenaltyByEnemyType(humanHunter, vamp, rolls), 0, 'PCAAO Humanoid bonus must NOT hit Vampire');
  });

  test('Survival HUD hides mortal needs for Lich/Ancient Lich and returns undead status lines', () => {
    const mortal = makePlayer({ health: 100, maxHealth: 100 });
    const mortalChips = survivalHudChips(mortal, 0);
    assert.ok(mortalChips.some((c) => c.key === 'hunger'));

    const lich = makePlayer({ health: 100, maxHealth: 100 });
    applyLichdom(lich);
    const lichChips = survivalHudChips(lich, 0);
    assert.equal(lichChips.some((c) => ['hunger', 'thirst', 'sleep', 'temp'].includes(c.key)), false);
    const lines = survivalStatusLines(lich, 0);
    assert.ok(lines.some((l) => /Undead vessel/i.test(l)));
    assert.ok(lines.some((l) => /Deathly cold/i.test(l)));

    const archShaped = makePlayer({ racialOverride: 'ancient_lichdom' });
    const archChips = survivalHudChips(archShaped, 0);
    assert.equal(archChips.some((c) => ['hunger', 'thirst', 'sleep', 'temp'].includes(c.key)), false);
  });

  test('hurtPlayer reconstitutes Lich via phylactery without invoking mortal DeathScreen or death listeners', () => {
    let deathPresenterCalled = false;
    let deathListenerCalled = false;
    let cemeteryCalled = false;

    setDeathPresenter(() => { deathPresenterCalled = true; });
    setDeathListener('audit_cross_listener', () => { deathListenerCalled = true; });
    setLichCemeteryRespawnHook(() => { cemeteryCalled = true; return { name: 'Scourg Barrow' }; });

    const lich = makePlayer({ health: 40, maxHealth: 180, magicka: 10, maxMagicka: 300 });
    applyLichdom(lich, { phylacteryId: 'phyl_bound' });

    const died = hurtPlayer(lich, 9999, { bypassShield: true });
    assert.equal(died, false);
    assert.equal(lich.health, lich.maxHealth);
    assert.equal(lich.magicka, lich.maxMagicka);
    assert.equal(cemeteryCalled, true);
    assert.equal(deathPresenterCalled, false);
    assert.equal(deathListenerCalled, false);
  });

  test('Project Legacy AGELESS-CURSE spares Enduring Lich & Ancient Lich from mortal age toll', () => {
    for (const kind of ['lich', 'ancient_lich']) {
      _resetModSaveData();
      const storage = makeMemStore();
      const tab = makeMemStore();
      const said = [];
      const e = makePlayer();
      const host = createLegacyHost({
        entity: e,
        storage: () => storage,
        tab: () => tab,
        on: () => true,
        online: () => false,
        now: () => 100,
        own: () => 0,
        here: () => ({ pixel: { x: 10, y: 20 }, region: 'Daggerfall', mode: 'exterior', loc: 'Gothway Garden', locationType: LOCATION_TYPES.TownCity }),
        town: (h) => ({ region: h.region, loc: h.loc }),
        nearestTown: () => ({ region: 'Daggerfall', loc: 'Gothway Garden' }),
        gold: () => 1000,
        say: (l) => said.push(l),
        boot: () => {},
        search: () => '?world',
        loadCharacter: () => true,
        saveNow: () => true,
        inFight: () => false,
        payEstate: () => {},
        rng: familyRng(42),
      });
      host.found(MODELS.enduring);
      const member = host.current();
      if (kind === 'lich') applyLichdom(e);
      else applyAncientLichdom(e);

      const first = host.deathOutcome();
      assert.equal(first.kind, 'rise', `${kind}: Enduring undead rises`);
      assert.equal(member.toll | 0, 0, `${kind}: no mortal years taken`);

      member.toll = 500;
      const spent = host.deathOutcome();
      assert.equal(spent.kind, 'rise', `${kind}: even with mortal span spent, curse holds Arkay back`);
      assert.equal(member.died, null);

      if (kind === 'lich') cureLichdom(e);
      else cureAncientLichdom(e);

      const curedOutcome = host.deathOutcome();
      assert.equal(curedOutcome.kind, 'fall', `${kind}: once cured, spent mortal falls to age`);
      assert.equal(member.died?.cause, 'years');
    }
  });
});

describe('Suite 3: Living Tamriel Canonical legalRep Sync, RCF, Nemesis & Config Save/Load', () => {
  test('Crisis contracts, Pleas, and adjustPlayerRegionalRep keep legalRep & regionalReputations synced through save/load & Nemesis', () => {
    LivingTamrielConfig.political = PRESENCE.HIGH;
    LivingTamrielConfig.nemesis = PRESENCE.HIGH;
    LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;

    const hero = makePlayer();
    setRegionCrisis(0, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
    const active = acceptRegionalCrisisContract(0, 5, 100);
    assert.ok(active);
    const completed = completeRegionalCrisisContract(0, hero);
    assert.ok(completed);
    assert.equal(hero.legalRep[0], 5);
    assert.equal(hero.regionalReputations[0], 5);

    const helpOutcome = resolvePleaResponse({
      plea: { type: PLEA_TYPE.FAMINE_BREAD, requiredGold: 15 },
      playerEntity: hero,
      regionIndex: 0,
      response: 'HELP',
      goldOffered: 20,
      nowMinutes: 200,
    });
    assert.equal(helpOutcome.outcome, PLEA_OUTCOME.HELPED);
    assert.ok(helpOutcome.repDelta > 0);
    assert.equal(hero.legalRep[0], 5 + helpOutcome.repDelta);
    assert.equal(hero.regionalReputations[0], hero.legalRep[0]);

    const rudeOutcome = resolvePleaResponse({
      plea: { type: PLEA_TYPE.FAMINE_BREAD, requiredGold: 15 },
      playerEntity: hero,
      regionIndex: 0,
      response: 'REFUSE_RUDE',
      nowMinutes: 300,
      rng: () => 0.99,
    });
    assert.equal(rudeOutcome.outcome, PLEA_OUTCOME.REBUFFED);
    assert.ok(rudeOutcome.repDelta < 0);
    assert.equal(hero.legalRep[0], 5 + helpOutcome.repDelta + rudeOutcome.repDelta);
    assert.equal(hero.regionalReputations[0], hero.legalRep[0]);

    hero.legalRep[0] = 0;
    hero.regionalReputations[0] = 0;
    adjustPlayerRegionalRep(hero, 0, -45);
    assert.equal(hero.legalRep[0], -45);
    assert.equal(hero.regionalReputations[0], -45);

    // Clamp bounds
    adjustPlayerRegionalRep(hero, 0, -200);
    assert.equal(hero.legalRep[0], -100);
    assert.equal(hero.regionalReputations[0], -100);

    // Reset back to -40 and round-trip through save/load -> triggers Nemesis
    hero.legalRep[0] = -40;
    hero.regionalReputations[0] = -40;
    const snap = JSON.parse(JSON.stringify(snapshotPlayer(hero)));
    const reloaded = makePlayer();
    restorePlayer(reloaded, snap);
    assert.equal(reloaded.legalRep[0], -40);

    const nemesisCheck = shouldDispatchNemesis(reloaded, {
      legalReputation: reloaded.legalRep[0],
      playerLevel: reloaded.level,
      nowMinutes: 50000,
      rng: () => 0.01,
    });
    assert.equal(nemesisCheck, true);

    // RCF House & Shipyard refusal/discount checks
    assert.equal(evaluateHousePurchaseReputation({ sGroupReputations: [0, 0, 0, -30, 0, 0, 0] }).refused, true);
    assert.ok(evaluateHousePurchaseReputation({ sGroupReputations: [0, 0, 0, 45, 0, 0, 0] }).discountMult < 1.0);
    assert.equal(evaluateShipyardReputation({ sGroupReputations: [0, -40, 0, 0, 0, 0, 0] }).refused, true);
    assert.ok(evaluateShipyardReputation({ sGroupReputations: [0, 40, 0, 0, 0, 0, 0] }).discountMult < 1.0);
  });

  test('LivingTamrielConfig resets adventurerLootMode and round-trips all 4 audit fields via LivingDirector save data', () => {
    LivingTamrielConfig.mobTraits = PRESENCE.LIGHT;
    LivingTamrielConfig.dungeonMobTraits = PRESENCE.MID;
    LivingTamrielConfig.reputationConsequences = PRESENCE.OFF;
    LivingTamrielConfig.adventurerLootMode = LIVING_ADVENTURER_LOOT.SUPPLIES;

    const saved = JSON.parse(JSON.stringify(getLivingSaveData()));
    resetLivingConfig();
    assert.equal(LivingTamrielConfig.adventurerLootMode, LIVING_ADVENTURER_LOOT.FULL);

    restoreLivingSaveData(saved);
    assert.equal(LivingTamrielConfig.mobTraits, PRESENCE.LIGHT);
    assert.equal(LivingTamrielConfig.dungeonMobTraits, PRESENCE.MID);
    assert.equal(LivingTamrielConfig.reputationConsequences, PRESENCE.OFF);
    assert.equal(LivingTamrielConfig.adventurerLootMode, LIVING_ADVENTURER_LOOT.SUPPLIES);
  });
});

describe('Suite 4: Multi-System Trade & Economy Intersection (Taint + Disguise + RCF + Crises)', () => {
  test('calculateTradePrice intersects Necro Taint, Mortal Disguise suppression, and RCF Merchant standing', () => {
    LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;
    LivingTamrielConfig.political = PRESENCE.HIGH;

    const cleanTrader = makePlayer();
    const basePrice = calculateTradePrice(1000, 10, { mercantile: 50, personality: 50, entity: cleanTrader }, false, { online: false });

    // Adding Necro Taint increases buy price via personality disposition penalty
    addNecroTaint(60, cleanTrader);
    assert.ok(getEffectiveTradeTaint(cleanTrader) > 0);
    const taintedPrice = calculateTradePrice(1000, 10, { mercantile: 50, personality: 50, entity: cleanTrader }, false, { online: false });
    assert.ok(taintedPrice > basePrice, `Tainted trader must pay more (${taintedPrice} > ${basePrice})`);

    // Mortal Disguise / hood suppresses trade taint back to baseline
    cleanTrader.isDisguised = true;
    assert.equal(getEffectiveTradeTaint(cleanTrader), 0);
    const disguisedPrice = calculateTradePrice(1000, 10, { mercantile: 50, personality: 50, entity: cleanTrader }, false, { online: false });
    assert.equal(disguisedPrice, basePrice);

    // RCF Merchants social standing discount stacks cleanly
    cleanTrader.isDisguised = true;
    cleanTrader.sGroupReputations = [0, 60, 0, 0, 0, 0, 0]; // Merchants = +60
    const honoredPrice = calculateTradePrice(1000, 10, { mercantile: 50, personality: 50, entity: cleanTrader }, false, { online: false });
    assert.ok(honoredPrice < basePrice, `Merchant standing discount must lower price (${honoredPrice} < ${basePrice})`);
  });

  test('tradeCost Sell applies RCF Underworld fenceBonus to stolen items, and Wartime crises inflate WeaponSmith factor', () => {
    LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;
    LivingTamrielConfig.political = PRESENCE.HIGH;

    const fenceHero = makePlayer({ sGroupReputations: [0, 0, 0, 0, 60, 0, 0] }); // Underworld = +60
    const { fenceBonus } = getReputationPriceModifier(fenceHero);
    assert.ok(fenceBonus > 0);

    const honestSword = { uid: 'item-h', group: 'Weapons', templateIndex: 118, value: 1000, stackCount: 1, currentCondition: 100, maxCondition: 100 };
    const stolenSword = markStolen([{ ...honestSword, uid: 'item-s' }])[0];

    const honestPayout = tradeCost('Sell', [honestSword], { quality: 10, priceAdjustment: 1000, online: false, entity: fenceHero }).cost;
    const stolenPayout = tradeCost('Sell', [stolenSword], { quality: 10, priceAdjustment: 1000, online: false, entity: fenceHero }).cost;
    assert.ok(stolenPayout > honestPayout);
    assert.equal(stolenPayout, Math.round(honestPayout * (1 + fenceBonus)));

    // Economy vs Regional Crisis
    setRegionCrisis(0, CRISIS_TYPE.PEACE);
    const peaceFactor = getBuildingCrisisFactor(BUILDING_TYPES.WeaponSmith, 0);
    const peacePrice = applyCrisisPriceMultiplier(100, 0, ECONOMY_CATEGORY.WEAPONS_ARMOR);

    setRegionCrisis(0, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
    const warFactor = getBuildingCrisisFactor(BUILDING_TYPES.WeaponSmith, 0);
    const warPrice = applyCrisisPriceMultiplier(100, 0, ECONOMY_CATEGORY.WEAPONS_ARMOR);
    assert.ok(warFactor > peaceFactor, `Wartime WeaponSmith factor (${warFactor}) > peace (${peaceFactor})`);
    assert.ok(warPrice > peacePrice, `Wartime weapons price (${warPrice}) > peace (${peacePrice})`);
  });
});

describe('Suite 5: Mod Loader, Potion Recipe Reset, Silver vs racialOverride & Dynamic Perks', () => {
  test('Disabling custom potion mod restores vanilla recipes, and custom Silver material scales vs Lich/Vampire/Werewolf', () => {
    registerVirtualMod(
      {
        id: 'audit-alchemy',
        name: 'Audit Alchemy',
        enabled: true,
        data: { potions: 'potions.json' },
      },
      {
        'potions.json': JSON.stringify([
          { name: 'auditElixir', price: 100, ingredients: [5, 22, 59], effect: '8,1', displayName: 'Audit Elixir' },
        ]),
      },
    );
    registerVirtualMod(
      {
        id: 'audit-materials',
        name: 'Audit Materials',
        enabled: true,
        data: { materials: 'materials.json' },
      },
      {
        'materials.json': JSON.stringify({
          Silver: { vsUndeadMultiplier: 2.0, vsWerecreatureMultiplier: 2.0 },
        }),
      },
    );

    syncModData();
    const customKey = potionRecipeKey([5, 22, 59]);
    assert.equal(potionRecipeByKey(customKey)?.displayName, 'Audit Elixir');

    // Silver index = 2
    const SILVER = 2;
    const mortal = makePlayer();
    const mortalMonkCareer = makePlayer({ careerIndex: 15 }); // 15 matches Skeletal Warrior in Monster careers, must NOT be treated as undead for player
    const lich = makePlayer();
    applyLichdom(lich);
    const arch = makePlayer();
    applyAncientLichdom(arch);
    const vamp = makePlayer({ racialOverride: { kind: 'racialOverride', racial: 'vampirism', ended: false } });
    const wolf = makePlayer({ racialOverride: { kind: 'racialOverride', racial: 'lycanthropy', ended: false } });

    assert.equal(getMaterialDamageMultiplier(SILVER, mortal), 1.0);
    assert.equal(getMaterialDamageMultiplier(SILVER, mortalMonkCareer), 1.0);
    assert.equal(getMaterialDamageMultiplier(SILVER, lich), 2.0);
    assert.equal(getMaterialDamageMultiplier(SILVER, arch), 2.0);
    assert.equal(getMaterialDamageMultiplier(SILVER, vamp), 2.0);
    assert.equal(getMaterialDamageMultiplier(SILVER, wolf), 2.0);

    // Disable both mods -> vanilla potion recipe overrides cleared, Silver reverts to 1.0
    setModEnabled('audit-alchemy', false);
    setModEnabled('audit-materials', false);
    syncModData();

    assert.equal(potionRecipeByKey(customKey), null, 'Custom potion recipe must be cleared when potion mods are disabled');
    assert.equal(getMaterialDamageMultiplier(SILVER, lich), 1.0);
    assert.equal(getMaterialDamageMultiplier(SILVER, wolf), 1.0);
  });

  test('Dynamic perks unlock cleanly and clear completely on reset', () => {
    registerPerk({
      id: 'blade_mastery',
      name: 'Blade Mastery',
      desc: '+15% Long Blade damage',
      check: (e) => (e?.skills?.[SKILLS.LongBlade] ?? 0) >= 50,
    });
    const warrior = makePlayer();
    const longsword = { group: 'Weapons', templateIndex: 120, flags: 0x10 };
    assert.equal(getUnlockedPerks(warrior).includes('blade_mastery'), true);
    assert.equal(getPerkBladeMasteryDamageMultiplier(warrior, longsword), 1.15);

    clearDynamicPerks();
    assert.equal(getUnlockedPerks(warrior).length, 0);
    assert.equal(getPerkBladeMasteryDamageMultiplier(warrior, longsword), 1.0);
  });
});
