// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ADVENTURER_HIRE_GOLD_PER_LEVEL_PER_DAY,
  COMPANION_CONTRACT_OPTIONS_DAYS,
  MAX_COMPANION_CONTRACT_DAYS,
  COMPANION_DURATION_MINUTES,
  calculateAdventurerHireQuote,
  getAdventurerHaggleQuality,
  resolveWanderingAdventurerInteraction,
  recruitAdventurerCompanion,
  extendAdventurerCompanion,
  getActiveAdventurerCompanion,
  getCompanionRemainingMinutes,
  dismissAdventurerCompanion,
  setAdventurerTrait,
  ensureAdventurerPool,
  getAdventurerSimRegistry,
} from '../../src/systems/living/adventurerSim.js';
import {
  LIVING_SITE_KINDS,
  buildLivingSiteBlueprint,
  createLivingSceneHost,
  applyCompanionEntityStamp,
  buildAdventurerHireSubmenuSpec,
  buildRecruitedCompanionChoiceSpec,
  buildDungeonAdventurerChoiceSpec,
  executeLivingConsoleCommand,
} from '../../src/systems/living/livingWorldSpawner.js';
import { LivingTamrielConfig, PRESENCE } from '../../src/systems/living/livingConfig.js';
import { setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE } from '../../src/systems/living/regionState.js';
import { HOLIDAYS, holidayDayOfYear, MINUTES_PER_YEAR } from '../../src/systems/holidays.js';
import { SOCIAL_GROUPS } from '../../src/formats/factionFile.js';
import { SKILLS } from '../../src/systems/skills.js';
import { applyLichdom, cureLichdom } from '../../src/systems/necromancy/lichdomStatus.js';
import { getPlayerTaint, setNecroTaint, _resetTaintForTests } from '../../src/systems/necromancy/necroTaint.js';
import { letterOfCredit, LETTER_OF_CREDIT_TEMPLATE } from '../../src/systems/inventory.js';
import { mintCondition, setItemFields } from '../../src/systems/item/itemTemplates.js';
import { totalGoldAmount } from '../../src/systems/court.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { worldMinutes, setWorldMinutes } from '../../src/systems/worldTick.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';

function makePlayer(overrides = {}) {
  const skills = new Array(35).fill(20);
  skills[SKILLS.Mercantile] = 20;
  skills[SKILLS.Etiquette] = 80;
  return {
    name: 'TestHero',
    level: 10,
    goldPieces: 20000,
    items: [],
    skills,
    skillUses: new Array(35).fill(0),
    stats: {
      strength: 50,
      intelligence: 50,
      willpower: 50,
      agility: 50,
      endurance: 50,
      personality: 50,
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

test('hire quote uses 200g/lvl/day base, trait quality tiers, mercantile+personality clamp, festival, war, RCF & taint', () => {
  const prevRcf = LivingTamrielConfig.reputationConsequences;
  try {
    setRegionCrisis(0, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
    LivingTamrielConfig.reputationConsequences = PRESENCE.HIGH;

    assert.equal(getAdventurerHaggleQuality('HONORABLE'), 16);
    assert.equal(getAdventurerHaggleQuality('CAUTIOUS'), 16);
    assert.equal(getAdventurerHaggleQuality('DUELIST'), 18);
    assert.equal(getAdventurerHaggleQuality('MERCENARY'), 20);
    assert.equal(getAdventurerHaggleQuality('ARROGANT'), 20);
    assert.equal(getAdventurerHaggleQuality('ENVIOUS'), 20);
    assert.equal(getAdventurerHaggleQuality('CUTTHROAT'), 20);

    const neutral = makePlayer();
    const advBase = { id: 1, name: 'Garrick', className: 'Warrior', level: 10, trait: 'DUELIST' };
    const q3 = calculateAdventurerHireQuote(advBase, neutral, { days: 3, regionIndex: 0, nowMinutes: 600 });
    assert.equal(q3.baseDaily, ADVENTURER_HIRE_GOLD_PER_LEVEL_PER_DAY * 10);
    assert.equal(q3.baseCost, 6000);
    assert.equal(q3.isWartime, false);
    assert.equal(q3.isMerchantsFestival, false);

    // Trait ordering under same player stats
    const qHon = calculateAdventurerHireQuote({ ...advBase, trait: 'HONORABLE' }, neutral, { days: 1, regionIndex: 0, nowMinutes: 600 });
    const qDuel = calculateAdventurerHireQuote({ ...advBase, trait: 'DUELIST' }, neutral, { days: 1, regionIndex: 0, nowMinutes: 600 });
    const qMerc = calculateAdventurerHireQuote({ ...advBase, trait: 'MERCENARY' }, neutral, { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.ok(qHon.totalCost < qDuel.totalCost && qDuel.totalCost < qMerc.totalCost, `expected qHon(${qHon.totalCost}) < qDuel(${qDuel.totalCost}) < qMerc(${qMerc.totalCost})`);

    // High Mercantile + Personality gives lower cost than low Mercantile + Personality
    const masterHaggler = makePlayer();
    masterHaggler.skills[SKILLS.Mercantile] = 100;
    masterHaggler.stats.personality = 100;
    const poorHaggler = makePlayer();
    poorHaggler.skills[SKILLS.Mercantile] = 5;
    poorHaggler.stats.personality = 15;
    const qMaster = calculateAdventurerHireQuote(advBase, masterHaggler, { days: 1, regionIndex: 0, nowMinutes: 600 });
    const qPoor = calculateAdventurerHireQuote(advBase, poorHaggler, { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.ok(qMaster.totalCost < qPoor.totalCost);

    // Offline MERC-CAP guard: stats boosted past 200 clamp to 100 and never produce <= 0 gold
    const overCapped = makePlayer();
    overCapped.skills[SKILLS.Mercantile] = 260;
    overCapped.stats.personality = 260;
    const qCap = calculateAdventurerHireQuote(advBase, overCapped, { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.equal(qCap.mercantile, 100);
    assert.equal(qCap.personality, 100);
    assert.equal(qCap.totalCost, qMaster.totalCost);
    assert.ok(qCap.totalCost > 0);

    // RCF Merchants rep affects buy price
    const liked = makePlayer();
    liked.sGroupReputations[SOCIAL_GROUPS.Merchants] = 80;
    const disliked = makePlayer();
    disliked.sGroupReputations[SOCIAL_GROUPS.Merchants] = -80;
    assert.ok(
      calculateAdventurerHireQuote(advBase, liked, { days: 1, regionIndex: 0, nowMinutes: 600 }).totalCost <
      calculateAdventurerHireQuote(advBase, disliked, { days: 1, regionIndex: 0, nowMinutes: 600 }).totalCost,
    );

    // Necro Taint increases price compared to pristine player
    const tainted = makePlayer({ necroTaint: 95 });
    const qTainted = calculateAdventurerHireQuote(advBase, tainted, { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.ok(qTainted.totalCost >= qHon.totalCost);
    neutral.necroTaint = 0;

    // Merchants Festival 50% discount
    const festMinutes = (holidayDayOfYear(HOLIDAYS.Merchants_Festival) - 1) * 1440 + 720;
    const qFest = calculateAdventurerHireQuote(advBase, makePlayer(), { days: 1, regionIndex: 0, nowMinutes: festMinutes });
    assert.equal(qFest.isMerchantsFestival, true);
    const qNorm = calculateAdventurerHireQuote(advBase, makePlayer(), { days: 1, regionIndex: 0, nowMinutes: festMinutes + 1440 });
    assert.equal(qNorm.isMerchantsFestival, false);
    assert.ok(Math.abs(qFest.totalCost / qNorm.totalCost - 0.5) < 0.03);

    // Wartime mercenary rate increase
    setRegionCrisis(0, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
    const qWar = calculateAdventurerHireQuote(advBase, makePlayer(), { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.equal(qWar.isWartime, true);
    assert.ok(qWar.warFactor > 1.0);
    assert.ok(qWar.totalCost > qDuel.totalCost);
  } finally {
    setRegionCrisis(0, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
    LivingTamrielConfig.reputationConsequences = prevRcf;
  }
});

test('hire supports Letters of Credit, tallies Mercantile, handles 1/3/7d + extensions up to 14d cap & replacement confirm', () => {
  dismissAdventurerCompanion();
  getAdventurerSimRegistry().pool = [];
  try {
    const loc = mintCondition(setItemFields(letterOfCredit(10000)));
    const p = makePlayer({ goldPieces: 20, items: [loc] });
    assert.equal(totalGoldAmount(p), 10020);

    const advA = { id: 101, name: 'Alden', className: 'Knight', level: 4, trait: 'HONORABLE', gearTier: 2 };
    const advB = { id: 102, name: 'Brynja', className: 'Ranger', level: 6, trait: 'DUELIST', gearTier: 3 };

    const hiredRes = resolveWanderingAdventurerInteraction({
      adv: advA,
      playerEntity: p,
      action: 'RECRUIT_ALLY',
      days: 7,
      regionIndex: 0,
      nowMinutes: 1000,
    });
    assert.equal(hiredRes.allied, true);
    assert.ok(hiredRes.goldDelta < 0);
    assert.equal(totalGoldAmount(p), 10020 + hiredRes.goldDelta);
    assert.equal(p.skillUses[SKILLS.Mercantile], 1, 'Mercantile skill use tallied on hire');
    assert.equal(getActiveAdventurerCompanion(1000).gearTier, 2);

    // Extension +3d +3d works; another +3d (> 14d cap) refuses without gold loss
    const ext1 = extendAdventurerCompanion({ playerEntity: p, days: 3, regionIndex: 0, nowMinutes: 1000 });
    assert.equal(ext1.ok, true);
    const ext2 = extendAdventurerCompanion({ playerEntity: p, days: 3, regionIndex: 0, nowMinutes: 1000 });
    assert.equal(ext2.ok, true);
    const goldBeforeCap = totalGoldAmount(p);
    const extCap = extendAdventurerCompanion({ playerEntity: p, days: 3, regionIndex: 0, nowMinutes: 1000 });
    assert.equal(extCap.ok, false);
    assert.equal(extCap.reason, 'max_duration');
    assert.equal(extCap.maxDays, MAX_COMPANION_CONTRACT_DAYS);
    assert.equal(totalGoldAmount(p), goldBeforeCap);
    assert.equal(
      getCompanionRemainingMinutes(getActiveAdventurerCompanion(1000), 1000),
      13 * COMPANION_DURATION_MINUTES,
    );

    // Replacement confirmation opens without calling say() beforehand
    let confirmSpec = null;
    let saidBeforeConfirm = false;
    const sub = buildAdventurerHireSubmenuSpec({
      adv: advB,
      playerEntity: p,
      regionIndex: 0,
      nowMinutes: 1000,
      openChoice: (spec) => {
        confirmSpec = spec;
      },
      say: () => {
        if (!confirmSpec) saidBeforeConfirm = true;
      },
    });
    assert.deepEqual(COMPANION_CONTRACT_OPTIONS_DAYS, [1, 3, 7]);
    assert.equal(sub.options.length, 4);
    sub.options[0].action(); // Pick 1d hire for advB -> opens confirmation submenu
    assert.equal(saidBeforeConfirm, false, 'must not call say() before openChoice() inside ChoiceWindow');
    assert.ok(confirmSpec && confirmSpec.options.length === 2);
    confirmSpec.options[0].action(); // Confirm replace
    assert.equal(getActiveAdventurerCompanion(1000).id, advB.id);

    // Companion management spec: extend +1d and dismiss
    let dismissedCalled = false;
    const compSpec = buildRecruitedCompanionChoiceSpec({
      comp: getActiveAdventurerCompanion(1000),
      playerEntity: p,
      regionIndex: 0,
      nowMinutes: 1000,
      onDismissed: () => {
        dismissedCalled = true;
      },
    });
    assert.equal(compSpec.options.length, 4);
    compSpec.options[0].action(); // +1d
    assert.equal(
      getCompanionRemainingMinutes(getActiveAdventurerCompanion(1000), 1000),
      2 * COMPANION_DURATION_MINUTES,
    );
    compSpec.options[2].action(); // Dismiss
    assert.equal(dismissedCalled, true);
    assert.equal(getActiveAdventurerCompanion(1000), null);
  } finally {
    dismissAdventurerCompanion();
  }
});

test('no free Etiquette hire in ADVENTURER_MEETING/dungeon, CUTTHROAT cannot be hired, gear deterministic & loot suppressed, scene detach', async () => {
  dismissAdventurerCompanion();
  try {
    const p = makePlayer({ goldPieces: 20000 });
    const cutthroat = { id: 201, name: 'Vex', className: 'Assassin', level: 5, trait: 'CUTTHROAT' };
    const foeCut = { entity: { name: 'Vex', team: 'Enemy', mobileTeam: 'Enemy' }, ai: { isHostile: false } };
    const cutSpec = buildDungeonAdventurerChoiceSpec({
      adv: cutthroat,
      intercepted: null,
      locationId: 100,
      regionIndex: 0,
      playerEntity: p,
      foeRecord: foeCut,
      rng: () => 0.1,
    });
    assert.equal(cutSpec.options.length, 4, 'CUTTHROAT rival omits paid hire option');
    cutSpec.options[1].action();
    assert.equal(getActiveAdventurerCompanion(600), null);
    assert.notEqual(foeCut.entity.team, 'PlayerAlly');

    // Deterministic equip & _suppressLoot on companion stamp
    const foeA = { entity: { name: 'Comp', items: [], equipTable: [], maxHealth: 100, stats: {} }, ai: { feet: [0, 0, 0] } };
    const foeB = { entity: { name: 'Comp', items: [], equipTable: [], maxHealth: 100, stats: {} }, ai: { feet: [0, 0, 0] } };
    const compRec = recruitAdventurerCompanion({ id: 333, name: 'Lyra', className: 'Knight', level: 10, gearTier: 3, trait: 'HONORABLE' }, 600, 3);
    applyCompanionEntityStamp(foeA, compRec, () => [1, 0, 1]);
    applyCompanionEntityStamp(foeB, compRec, () => [1, 0, 1]);
    assert.equal(foeA.livingRole, 'recruited_companion');
    assert.equal(foeA._suppressLoot, true);
    assert.equal(foeA.lootDropped, true);
    assert.deepEqual(
      foeA.entity.items.map((it) => `${it.itemGroup}:${it.templateIndex}`),
      foeB.entity.items.map((it) => `${it.itemGroup}:${it.templateIndex}`),
      'applyCompanionEntityStamp produces deterministic loadout by companion id',
    );
    dismissAdventurerCompanion();

    // ADVENTURER_MEETING: Etiquette grants peace (no companion); Hire transfers actor off site.foes so releaseSite does not remove companion
    const spawned = [];
    const removed = [];
    let openedSpec = null;
    let playerPos = [0, 0, 0];
    const host = createLivingSceneHost({
      ready: () => true,
      feet: () => playerPos,
      clock: () => 600,
      regionIndex: () => 0,
      heightAt: () => 0,
      playerEntity: () => p,
      spawn: (_t, feet, o) => {
        const rec = {
          entity: { name: o.name, team: o.team, items: [], equipTable: [] },
          ai: { feet: [...feet], isHostile: o.hostile },
          livingRole: o.role,
          dead: false,
        };
        spawned.push(rec);
        return rec;
      },
      remove: (rec) => {
        rec.dead = true;
        removed.push(rec);
      },
      inPool: (rec) => !rec.dead,
      say: () => {},
      openChoice: (spec) => {
        openedSpec = spec;
      },
    });
    const bp = buildLivingSiteBlueprint({
      kind: LIVING_SITE_KINDS.ADVENTURER_MEETING,
      centerX: 10,
      centerZ: 10,
      heightAt: () => 0,
      regionIndex: 0,
      playerEntity: p,
      nowMinutes: 600,
      rng: () => 0.5,
    });
    bp.meta.adv.trait = 'HONORABLE';
    host.standBlueprint(bp);
    await new Promise((r) => setTimeout(r, 5));
    playerPos = [10, 0, 10];
    host.frame(1.1);
    assert.ok(openedSpec && openedSpec.options.length === 6);
    openedSpec.options[1].action(); // Etiquette -> peaceful parley, not hired
    assert.equal(getActiveAdventurerCompanion(600), null);
    assert.equal(spawned[0].entity.team, 'Adventurer');

    const outer = openedSpec;
    openedSpec = null;
    outer.options[3].action(); // Paid hire -> opens 1/3/7d submenu
    assert.ok(openedSpec && openedSpec.options.length === 4);
    openedSpec.options[0].action(); // 1d hire
    assert.ok(getActiveAdventurerCompanion(600));
    assert.equal(spawned[0].livingRole, 'recruited_companion');
    assert.equal(spawned[0].entity.team, 'PlayerAlly');

    host.clear(); // releaseSite must NOT remove the detached hired companion
    assert.equal(removed.includes(spawned[0]), false);
    dismissAdventurerCompanion();
    host.dismissCompanionBody();
    assert.equal(removed.includes(spawned[0]), true);
  } finally {
    dismissAdventurerCompanion();
  }
});

test('new console commands: add_credit, set_holiday, living adv settrait/quote/companion', () => {
  dismissAdventurerCompanion();
  const prevItems = Array.isArray(playerEntity.items) ? [...playerEntity.items] : [];
  const prevMinutes = worldMinutes();
  try {
    ensureAdventurerPool();
    playerEntity.items = [];
    const creditMsg = getConsoleCommand('add_credit').callback(['2500']);
    assert.match(creditMsg, /2500/);
    const loc = playerEntity.items.find((it) => it.group === 'MiscItems' && it.templateIndex === LETTER_OF_CREDIT_TEMPLATE);
    assert.ok(loc && loc.value === 2500);

    const festMsg = getConsoleCommand('set_holiday').callback(['merchants']);
    assert.match(festMsg, /Merchants Festival/);
    assert.equal(Math.floor(worldMinutes() / MINUTES_PER_YEAR), Math.floor(Math.max(0, prevMinutes) / MINUTES_PER_YEAR));
    const noneMsg = getConsoleCommand('set_holiday').callback(['none']);
    assert.match(noneMsg, /None/);

    const setTraitMsg = executeLivingConsoleCommand(['adv', 'settrait', '0', 'HONORABLE'], { playerEntity, nowMinutes: 600 });
    assert.match(setTraitMsg, /HONORABLE/);
    const quoteMsg = executeLivingConsoleCommand(['adv', 'quote', '0', '3'], { playerEntity, nowMinutes: 600 });
    assert.match(quoteMsg, /Hire Quote:.*3d Total:/s);

    recruitAdventurerCompanion({ id: 901, name: 'Torin', className: 'Warrior', level: 5, trait: 'HONORABLE' }, 600, 2);
    const compStatus = executeLivingConsoleCommand(['adv', 'companion', 'status'], { playerEntity, nowMinutes: 600 });
    assert.match(compStatus, /Torin/);
    const compDismiss = executeLivingConsoleCommand(['adv', 'companion', 'dismiss'], { playerEntity, nowMinutes: 600 });
    assert.match(compDismiss, /Dismissed/);
    assert.equal(getActiveAdventurerCompanion(600), null);
  } finally {
    playerEntity.items = prevItems;
    setWorldMinutes(prevMinutes);
    dismissAdventurerCompanion();
  }
});

test('Lichdom quote increases price, cureLichdom resets taint & survival debuff so quote restores mortal price', () => {
  _resetTaintForTests();
  try {
    const adv = { id: 501, name: 'Valen', className: 'Warrior', level: 2, trait: 'GREEDY' };
    const clean = makePlayer({
      stats: { personality: 60, intelligence: 60, willpower: 60, strength: 60, agility: 60, endurance: 60, speed: 60, luck: 60 },
      skills: (() => { const a = new Array(35).fill(30); a[SKILLS.Mercantile] = 60; return a; })(),
    });
    const qBefore = calculateAdventurerHireQuote(adv, clean, { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.equal(qBefore.tradeTaint, 0);
    assert.equal(qBefore.effectivePersonality, 60);

    assert.ok(applyLichdom(clean, { nowMinutes: 600 }));
    const qLich = calculateAdventurerHireQuote(adv, clean, { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.equal(qLich.tradeTaint, 100);
    assert.equal(qLich.personality, 30);
    assert.equal(qLich.effectivePersonality, 0);
    assert.ok(qLich.dailyCost > qBefore.dailyCost, 'Lichdom must raise hire quote above mortal baseline');

    assert.equal(cureLichdom(clean), true);
    assert.equal(getPlayerTaint(clean), 0, 'cureLichdom must reset player taint to 0');
    const qAfter = calculateAdventurerHireQuote(adv, clean, { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.equal(qAfter.tradeTaint, 0);
    assert.equal(qAfter.effectivePersonality, 60);
    assert.equal(qAfter.dailyCost, qBefore.dailyCost, 'After cureLichdom, quote must return to mortal baseline');

    // Starving/Dehydrated/Exhausted mortal: applyLichdom strips stale survival activeEffect
    const starved = makePlayer({
      stats: { personality: 60, intelligence: 60, willpower: 60, strength: 60, agility: 60, endurance: 60, speed: 60, luck: 60 },
      skills: (() => { const a = new Array(35).fill(30); a[SKILLS.Mercantile] = 60; return a; })(),
      activeEffects: [{ kind: 'survival', statMods: { personality: -50 } }],
    });
    assert.ok(applyLichdom(starved, { nowMinutes: 600 }));
    assert.equal(starved.activeEffects.some((a) => a?.kind === 'survival'), false, 'applyLichdom must clear stale survival effect');
    const qStarvedLich = calculateAdventurerHireQuote(adv, starved, { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.equal(cureLichdom(starved), true);
    const qStarvedCured = calculateAdventurerHireQuote(adv, starved, { days: 1, regionIndex: 0, nowMinutes: 600 });
    assert.equal(qStarvedCured.effectivePersonality, 60);
    assert.ok(qStarvedLich.dailyCost > qStarvedCured.dailyCost, 'Cured mortal quote must be lower than Lich quote');

    // setNecroTaint lowers taint for mortal but stays 100 for active Lich
    setNecroTaint(80, starved);
    assert.equal(getPlayerTaint(starved), 80);
    setNecroTaint(0, starved);
    assert.equal(getPlayerTaint(starved), 0);
    applyLichdom(starved, { nowMinutes: 600 });
    setNecroTaint(0, starved);
    assert.equal(getPlayerTaint(starved), 100);
    cureLichdom(starved);
  } finally {
    _resetTaintForTests();
  }
});
