import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentWeather,
  resetWeatherSim,
  sampleWeatherField,
  setDivineWeatherOverride,
  setWeatherFieldLaw,
  setWeatherMapLaw,
} from '../../src/systems/weather/weatherSim.js';

import {
  APOTHEOSIS_FAITH_BASE_MAX,
  APOTHEOSIS_INITIAL_FAITH,
  APOTHEOSIS_MYTHIC_DECAY_FLAT,
  APOTHEOSIS_PORTFOLIO_SWITCH_COST,
  APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_MINUTES,
  APOTHEOSIS_CHAMPION_DURATION_MINUTES,
  APOTHEOSIS_REBIRTH_FAITH_COST,
  AURBIS_COMMAND_CATALOG,
  AURBIS_PORTAL_FAITH_COST,
  REQUIRED_FATE_WEIGHT,
  completeApotheosisQuestline,
  computeChampionFaithScaling,
  clearApotheosisChampions,
  defaultApotheosisState,
  ensureApotheosisState,
  evaluateAurbisCommand,
  executeAurbisCommand,
  getActiveApotheosisChampions,
  getFaithMax,
  getPortfolioSwitchCooldownInfo,
  getSpawnCreatureFaithCost,
  handleApotheosisKillFaith,
  notifyApotheosisEvent,
  reconstituteAscendedGod,
  recordApotheosisMagicCraft,
  recordApotheosisShadowAct,
  recordQuestCompleted,
  resetApotheosisForDebug,
  selectApotheosisPortfolio,
  setActiveApotheosisPlayer,
  setApotheosisRebirthFailedHook,
  setApotheosisRebirthHook,
  setDebugFateWeight,
  spendApotheosisFaith,
  startApotheosisFromMantella,
  summonApotheosisChampions,
  tickApotheosisChampions,
  tickApotheosisMythicDecay,
  addApotheosisFaith,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import { ORDER_DAILY_LAW_FAITH_BONUS } from '../../src/systems/apotheosis/apotheosisStage2.js';
import { SKILLS } from '../../src/systems/skills.js';
import { defineLiveMaxHealth, defineLiveMaxMagicka } from '../../src/systems/chargen.js';
import { forcePlayerDeath, hurtPlayer, playerEntity, setDeathPresenter } from '../../src/characters/playerEntity.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { reportPlayerKill } from '../../src/systems/playerKills.js';
import { tellSpellLanded } from '../../src/systems/spell/spellPower.js';
import { runDayChange, DAY_ARMS } from '../../src/systems/worldTick.js';
import { newBountyLedger, takeBounty, payBounty, bountyId } from '../../src/systems/bounty/bountyBoard.js';
import { donate } from '../../src/systems/guild/guildServiceActions.js';
import { createFactionRep } from '../../src/systems/faction/factionRep.js';
import { pickpocket } from '../../src/systems/talk/talk.js';
import { createLockpickAct } from '../../src/systems/lockpick/lockpickAct.js';
import { applyLichdom, cureLichdom } from '../../src/systems/necromancy/lichdomStatus.js';
import { setLichCemeteryRespawnHook } from '../../src/systems/necromancy/lichdomRitual.js';
import { executeConsoleCommand, setDebugSceneContext } from '../../src/systems/consoleCommands.js';
import { selectApotheosisSection, releaseApotheosisPane } from '../../src/ui/apotheosisPane.js';

function makeGod(portfolio = 'war', { faith = APOTHEOSIS_INITIAL_FAITH, nowMinutes = 10000 } = {}) {
  const e = {
    isPlayer: true,
    name: 'GodHero',
    characterId: `god_${portfolio}`,
    level: 25,
    careerIndex: 12,
    career: { hitPointsPerLevel: 12, abilityFlagsAndSpellPointsBitfield: 0 },
    maxHealth: 400,
    rawMaxHealth: 400,
    health: 400,
    maxMagicka: 300,
    magicka: 300,
    fatigue: 5000,
    goldPieces: 10000,
    items: [],
    activeEffects: [],
    spells: [],
    bankAccounts: [],
    houses: [],
    currentRegionIndex: 17,
    regionalBounties: {},
    legalRep: {},
    stats: {
      strength: 80, intelligence: 80, willpower: 80, agility: 80,
      endurance: 80, personality: 80, speed: 80, luck: 80,
    },
    skills: {
      [SKILLS.LongBlade]: 80,
      [SKILLS.Destruction]: 80,
      [SKILLS.Pickpocket]: 100,
      [SKILLS.Lockpicking]: 100,
    },
  };
  defineLiveMaxHealth(e);
  defineLiveMaxMagicka(e);
  setDebugFateWeight(e, REQUIRED_FATE_WEIGHT);
  startApotheosisFromMantella(e);
  completeApotheosisQuestline(e);
  selectApotheosisPortfolio(e, portfolio, { nowMinutes });
  if (faith != null) e.apotheosis.faith = faith;
  setActiveApotheosisPlayer(e);
  return e;
}

let savedStorageDesc;
function installMemoryStorage() {
  const map = new Map();
  const mock = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  };
  savedStorageDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: mock });
}

beforeEach(() => {
  installMemoryStorage();
  setApotheosisRebirthHook(null);
  setApotheosisRebirthFailedHook(null);
  setLichCemeteryRespawnHook(null);
  setDeathPresenter(null);
  setDebugSceneContext(null);
});

afterEach(() => {
  setActiveApotheosisPlayer(null);
  setApotheosisRebirthHook(null);
  setApotheosisRebirthFailedHook(null);
  setLichCemeteryRespawnHook(null);
  setDeathPresenter(null);
  setDebugSceneContext(null);
  releaseApotheosisPane();
  if (savedStorageDesc) Object.defineProperty(globalThis, 'localStorage', savedStorageDesc);
  else delete globalThis.localStorage;
});

test('Stage 2 Faith Reservoir: initial 500, dynamic getFaithMax via cultFaithBonus, and paid 250 Portfolio switch', () => {
  const god = makeGod('war', { faith: null, nowMinutes: 2880 });
  assert.equal(getFaithMax(god), APOTHEOSIS_FAITH_BASE_MAX);
  assert.equal(APOTHEOSIS_FAITH_BASE_MAX, 1000);
  assert.equal(god.apotheosis.faith, APOTHEOSIS_INITIAL_FAITH);
  assert.equal(APOTHEOSIS_INITIAL_FAITH, 500);

  // Dynamic max scaling hook ready for Stage 3 Cult strength
  god.apotheosis.cultFaithBonus = 600;
  assert.equal(getFaithMax(god), 1600);
  const capped = addApotheosisFaith(god, 5000);
  assert.equal(god.apotheosis.faith, 1600);
  assert.equal(capped.added, 1100);

  // Immediate switch blocked by 30-day Portfolio cooldown
  god.apotheosis.faith = 300;
  const cdBefore = getPortfolioSwitchCooldownInfo(god, 2880 + 1440);
  assert.equal(cdBefore.onCooldown, true);
  assert.equal(cdBefore.remainingDays, 29);
  const swCooldown = selectApotheosisPortfolio(god, 'magic', { nowMinutes: 2880 + 1440 });
  assert.equal(swCooldown.ok, false);
  assert.equal(swCooldown.cooldown, true);
  assert.equal(god.apotheosis.portfolio, 'war');

  // Paid switch costs 250 Faith once the 30-day cooldown elapses
  const afterCooldown = 2880 + APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_MINUTES;
  const sw1 = selectApotheosisPortfolio(god, 'magic', { nowMinutes: afterCooldown });
  assert.equal(sw1.ok, true);
  assert.equal(sw1.switching, true);
  assert.equal(god.apotheosis.portfolio, 'magic');
  assert.equal(god.apotheosis.faith, 300 - APOTHEOSIS_PORTFOLIO_SWITCH_COST);
  assert.equal(god.apotheosis.faith, 50);

  // Switching with < 250 Faith fails cleanly after cooldown
  const swFail = selectApotheosisPortfolio(god, 'order', { nowMinutes: afterCooldown + APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_MINUTES });
  assert.equal(swFail.ok, false);
  assert.equal(swFail.requiredFaith, APOTHEOSIS_PORTFOLIO_SWITCH_COST);
  assert.equal(god.apotheosis.portfolio, 'magic');

  // `{ free: true }` bypasses fee & cooldown when explicitly requested
  const swFree = selectApotheosisPortfolio(god, 'order', { free: true });
  assert.equal(swFree.ok, true);
  assert.equal(god.apotheosis.portfolio, 'order');

  // Stage 2 state fields default consistently
  const fresh = { isPlayer: true };
  assert.deepEqual(ensureApotheosisState(fresh), defaultApotheosisState());
});

test('Stage 2 Mythic Decay: flat -15 Faith/idle day via worldTick.runDayChange + Order lawful daily bonus', () => {
  // Start at day 5 (5 * 1440 = 7200)
  const god = makeGod('war', { faith: 500, nowMinutes: 5 * 1440 });
  god.apotheosis.lastFaithDecayDay = 5;

  // 3 idle days pass (day 5 -> day 8) via worldTick.runDayChange
  runDayChange({
    entity: god,
    lastMinutes: 5 * 1440 + 60,
    nowMinutes: 8 * 1440 + 60,
    arms: DAY_ARMS.own,
  });
  assert.equal(god.apotheosis.faith, 500 - 3 * APOTHEOSIS_MYTHIC_DECAY_FLAT);
  assert.equal(god.apotheosis.faith, 455);

  // Active day does NOT decay
  god.apotheosis.lastFaithGainDay = 9;
  const activeTick = tickApotheosisMythicDecay(god, 9 * 1440 + 100);
  assert.equal(activeTick.decayedDays, 0);
  assert.equal(god.apotheosis.faith, 455);

  // Order Portfolio lawful stewardship: +10/day when bounty === 0 && legalRep >= 15 (net -5 on idle day, +10 on active day)
  const orderGod = makeGod('order', { faith: 400, nowMinutes: 10 * 1440 });
  orderGod.apotheosis.lastFaithDecayDay = 10;
  orderGod.regionalBounties[17] = 0;
  orderGod.legalRep[17] = 20;
  const lawIdle = tickApotheosisMythicDecay(orderGod, 12 * 1440);
  assert.equal(lawIdle.decayedDays, 2);
  assert.equal(lawIdle.faithLost, 30);
  assert.equal(lawIdle.orderBonus, 2 * ORDER_DAILY_LAW_FAITH_BONUS);
  assert.equal(orderGod.apotheosis.faith, 390);
});

test('Stage 2 Divine Rebirth: costs 150 Faith, skips when <150 with message hook, and falls back to Lich cemetery / mortal death', () => {
  // 1. Sufficient Faith -> rebirth deducts 150 and heals
  const god = makeGod('war', { faith: 200 });
  let rebirthHooks = 0;
  setApotheosisRebirthHook(() => { rebirthHooks++; });
  const survived = hurtPlayer(god, 9999, { bypassShield: true });
  assert.equal(survived, false);
  assert.equal(god.apotheosis.faith, 200 - APOTHEOSIS_REBIRTH_FAITH_COST);
  assert.equal(god.apotheosis.rebirthCount, 1);
  assert.equal(rebirthHooks, 1);
  assert.equal(god.health, god.maxHealth);

  // 2. Insufficient Faith (<150) on Lich-God -> skips god rebirth, invokes failed hook, runs Lich cemetery respawn
  god.apotheosis.faith = 100;
  applyLichdom(god, { nowMinutes: 20000 });
  god.health = god.maxHealth;
  let failedHookCalled = 0;
  let failedPayload = null;
  setApotheosisRebirthFailedHook((_ent, info) => {
    failedHookCalled++;
    failedPayload = info;
  });
  let cemeteryCalls = 0;
  setLichCemeteryRespawnHook(() => {
    cemeteryCalls++;
    return { townName: 'Daggerfall Cemetery' };
  });
  const lichFall = hurtPlayer(god, 999999, { bypassShield: true });
  assert.equal(lichFall, false, 'Lich fallback reconstituted at cemetery');
  assert.equal(failedHookCalled, 1);
  assert.equal(failedPayload.faith, 100);
  assert.equal(failedPayload.required, APOTHEOSIS_REBIRTH_FAITH_COST);
  assert.equal(cemeteryCalls, 1);
  assert.equal(god.apotheosis.faith, 100, 'Faith unchanged when god rebirth skipped');

  // 3. Insufficient Faith (<150) on non-Lich God -> falls through to mortal death
  cureLichdom(god);
  let deathPresented = 0;
  setDeathPresenter(() => { deathPresented++; });
  god.health = god.maxHealth;
  god.apotheosis.faith = 50;
  const dead = forcePlayerDeath(god);
  assert.equal(dead, true, 'Non-lich god dies when Faith < 150');
  assert.equal(deathPresented, 1);
  assert.equal(failedHookCalled, 2);
});

test('Stage 2 Portfolio Faith: Magic strictly rejects enchanted weapon kills and rewards real spells/crafting', () => {
  const mage = makeGod('magic', { faith: 100 });
  const bandit = { level: 5, health: 0 };
  const bossFoe = { level: 20, apotheosisAspectBoss: true, health: 0 };

  // Melee/bow kill does NOT grant Magic Faith
  reportPlayerKill(bandit, { kind: 'melee' });
  assert.equal(mage.apotheosis.faith, 100, 'melee kill grants 0 Magic Faith');

  // Enchanted weapon "Cast When Strikes" proc (`cast: null`) does NOT grant Magic Faith
  tellSpellLanded({ caster: mage, target: bandit, foe: bandit, cast: null });
  assert.equal(mage.apotheosis.faith, 100, 'enchanted weapon proc with cast=null grants 0 Faith');
  reportPlayerKill(bandit, { kind: 'spell' });
  assert.equal(mage.apotheosis.faith, 100, 'kill after enchanted weapon proc (cast=null) grants 0 Faith');

  // Real spell cast (`cast.cost = 45`) grants Faith AND tags target for real-spell kill credit
  const realCast = { cost: 45, school: SKILLS.Destruction };
  tellSpellLanded({ caster: mage, target: bossFoe, foe: bossFoe, cast: realCast });
  assert.equal(mage.apotheosis.faith, 103, 'real spell cast grants floor(45/15)=3 Faith');
  reportPlayerKill(bossFoe, { kind: 'spell' });
  assert.equal(mage.apotheosis.faith, 123, 'elite kill from real spell grants +20 Faith');

  // Magic quests & spellcraft/alchemy/enchanting
  recordQuestCompleted(mage, { questSuccess: true, factionId: 40 }); // Mages Guild
  assert.equal(mage.apotheosis.faith, 153);
  notifyApotheosisEvent('magicCraft', { entity: mage, craftKind: 'spellcraft', goldSpent: 1000 });
  assert.equal(mage.apotheosis.faith, 169);
  recordApotheosisMagicCraft(mage, 'alchemy');
  assert.equal(mage.apotheosis.faith, 179);
  notifyApotheosisEvent('magicCraft', { entity: mage, craftKind: 'enchant', goldSpent: 1500 });
  assert.equal(mage.apotheosis.faith, 200);
});

test('Stage 2 Portfolio Faith: War, Shadows, and Order hooks (Bounties, Temples, Donations, Pickpocket, Lockpick)', () => {
  // War
  const war = makeGod('war', { faith: 100 });
  reportPlayerKill({ level: 3 }, { kind: 'melee' });
  assert.equal(war.apotheosis.faith, 105);
  reportPlayerKill({ level: 3 }, { kind: 'spell' });
  assert.equal(war.apotheosis.faith, 105, 'War excludes pure spell kills');
  reportPlayerKill({ level: 18 }, { kind: 'bow' });
  assert.equal(war.apotheosis.faith, 120, 'War elite ranged kill grants +15');
  recordQuestCompleted(war, { questSuccess: true, factionId: 41 }); // Fighters Guild
  assert.equal(war.apotheosis.faith, 150);

  // Shadows
  const shade = makeGod('shadows', { faith: 100 });
  assert.equal(handleApotheosisKillFaith(shade, { level: 5 }, { stealth: false }), 0);
  assert.equal(handleApotheosisKillFaith(shade, { level: 5 }, { stealth: true }), 12);
  recordQuestCompleted(shade, { questSuccess: true, factionId: 42 }); // Thieves Guild
  assert.equal(shade.apotheosis.faith, 142);
  pickpocket(shade, { target: { level: 1 }, rolls: () => 0.01 });
  assert.equal(shade.apotheosis.faith, 152, 'Pickpocket hook grants +10 Shadows Faith');
  const lockAct = createLockpickAct({ lock: 1, chance: 100, seed: 42, rng: () => 0.01 });
  lockAct.auto();
  assert.equal(shade.apotheosis.faith, 164, 'Lockpick auto-open hook grants +12 Shadows Faith');
  recordApotheosisShadowAct(shade, 'other');
  assert.equal(shade.apotheosis.faith, 172);

  // Order: Bounty Board turn-ins, Temple/Knight quests, Temple donations (min 100g, cap 60/day)
  const order = makeGod('order', { faith: 100 });
  const ledger = newBountyLedger();
  const id = bountyId(5, 100, 100, 0, 15); // tier 5 (lvl 15) -> +25 * 5 = +125
  takeBounty(ledger, id, 1000);
  payBounty(ledger, id, 1050, { entity: order });
  assert.equal(order.apotheosis.faith, 225);

  recordQuestCompleted(order, { questSuccess: true, factionMembership: 'order:Knights of the Dragon' });
  assert.equal(order.apotheosis.faith, 260);
  recordQuestCompleted(order, { questSuccess: true, factionMembership: 'temple:Arkay' });
  assert.equal(order.apotheosis.faith, 295);

  const fDict = new Map([[82, { name: 'Temple of Arkay', rep: 10, children: [] }]]);
  const fStore = createFactionRep(fDict);
  donate(order, fStore, 82, 50, () => 0.5); // < 100g => 0 Faith
  assert.equal(order.apotheosis.faith, 295);
  donate(order, fStore, 82, 2000, () => 0.5); // capped at 40 per donation
  assert.equal(order.apotheosis.faith, 335);
  donate(order, fStore, 82, 2000, () => 0.5); // capped at 60 daily total -> +20
  assert.equal(order.apotheosis.faith, 355);
  donate(order, fStore, 82, 500, () => 0.5); // daily cap exhausted -> +0
  assert.equal(order.apotheosis.faith, 355);
});

test('Stage 2 Scroll of Aurbis: strict blacklist, itemBaseValue pricing, crisis/portal/living, and witness reactions', async () => {
  const orderGod = makeGod('order', { faith: 600 });

  // 1. Forbidden commands (stats, skills, firmament, perks, tgm, `necro test`, etc.) MUST be refused except allowed miracles
  for (const bad of ['tgm', 'tcl', 'set_skill 12 100', 'set_attr strength 200', 'firmament add', 'perk unlock foo', 'prof set blacksmith 100', 'necro test', 'set_max_magicka 999', 'set_fatigue 999', 'apo faith 1000', 'heal; tgm']) {
    const ev = evaluateAurbisCommand(bad, orderGod);
    assert.equal(ev.allowed, false, `Command "${bad}" must be forbidden in Scroll of Aurbis`);
  }

  // `heal` IS allowed at 40 Faith
  const healEv = evaluateAurbisCommand('heal', orderGod);
  assert.equal(healEv.allowed, true);
  assert.equal(healEv.faithCost, 40);

  // 2. Creature spawning cost & MOBILE_TYPES lookup (`Dragonling_Alternate`)
  assert.equal(getSpawnCreatureFaithCost('Rat'), 50);
  assert.equal(getSpawnCreatureFaithCost('Vampire'), 100);
  assert.equal(getSpawnCreatureFaithCost('Dragonling_Alternate'), 160);
  assert.ok(MOBILE_TYPES.Dragonling_Alternate === 40);
  const spawnEv = evaluateAurbisCommand('spawnfoe Dragonling_Alternate 2', orderGod);
  assert.equal(spawnEv.allowed, true);
  assert.equal(spawnEv.faithCost, 320);

  // 3. `additem` priced via `itemBaseValue` (daedric vs iron weapon)
  const ironEv = evaluateAurbisCommand('additem 122 1 iron', orderGod); // Longsword iron
  const daedricEv = evaluateAurbisCommand('additem 122 1 daedric', orderGod);
  assert.equal(ironEv.allowed, true);
  assert.equal(daedricEv.allowed, true);
  assert.ok(daedricEv.faithCost > ironEv.faithCost * 5, 'Daedric pricing must scale from real itemBaseValue');

  // 4. Crisis & Living Tamriel pricing
  assert.equal(evaluateAurbisCommand('crisis status', orderGod).faithCost, 0);
  assert.equal(evaluateAurbisCommand('crisis tp', orderGod).faithCost, 180);
  assert.equal(evaluateAurbisCommand('crisis start war', orderGod).faithCost, 500);
  assert.equal(evaluateAurbisCommand('crisis stop war', orderGod).faithCost, 450);
  assert.equal(evaluateAurbisCommand('crisis start PlagueOngoing', orderGod).faithCost, 250);
  assert.equal(evaluateAurbisCommand('crisis tick', orderGod).faithCost, 500);
  assert.equal(evaluateAurbisCommand('living adv tick 3', orderGod).faithCost, 250);

  // 5. Execution + Public Witness bonus (+15 aligned capped 3/day) & penalty (-20 opposed)
  const executed = [];
  orderGod.apotheosis.faith = 400;
  // Order casting `heal` with 2 witnesses -> -40 cost + 15 aligned witness bonus = 375
  const r1 = await executeAurbisCommand('heal', orderGod, {
    witnessCount: 2,
    nowMinutes: 3000,
    executeCommandFn: (cmd, args) => {
      executed.push([cmd, args]);
      return 'Healed';
    },
  });
  assert.equal(r1.ok, true);
  assert.equal(r1.faithSpent, 40);
  assert.equal(r1.witnessDelta, 15);
  assert.equal(orderGod.apotheosis.faith, 375);

  // 2nd and 3rd aligned miracles give +15; 4th on same day caps at +0
  for (let i = 0; i < 3; i++) {
    await executeAurbisCommand('heal', orderGod, { witnessCount: 2, nowMinutes: 3000, executeCommandFn: () => 'ok' });
  }
  // Expected: 375 - 40 + 15 = 350 -> 350 - 40 + 15 = 325 -> 325 - 40 + 0 = 285
  assert.equal(orderGod.apotheosis.faith, 285);

  // Opposed miracle for Order (`killall` in front of witnesses -> -150 cost - 20 witness penalty = 115)
  const rOpp = await executeAurbisCommand('killall', orderGod, {
    witnessCount: 3,
    nowMinutes: 3000,
    executeCommandFn: () => 'Smited',
  });
  assert.equal(rOpp.ok, true);
  assert.equal(rOpp.witnessDelta, -20);
  assert.equal(orderGod.apotheosis.faith, 115);

  // 6. Deferred Divine Portal spend: opening map charges 0; picking destination charges 120 Faith
  orderGod.apotheosis.faith = 200;
  let capturedSpend = null;
  const portalOpen = await executeAurbisCommand('portal', orderGod, {
    witnessCount: 0,
    openPortalFn: ({ onPickSpend }) => {
      capturedSpend = onPickSpend;
      return true;
    },
  });
  assert.equal(portalOpen.ok, true);
  assert.equal(portalOpen.deferred, true);
  assert.equal(orderGod.apotheosis.faith, 200, 'Faith NOT deducted until destination picked');
  const pickPay = capturedSpend({ name: 'Wayrest', pixel: { x: 859, y: 344 } });
  assert.equal(pickPay.ok, true);
  assert.equal(orderGod.apotheosis.faith, 200 - AURBIS_PORTAL_FAITH_COST);

  // Catalog sanity
  assert.ok(AURBIS_COMMAND_CATALOG.length >= 6);
});

test('Stage 2 Console Commands & UI Section: `apo faith`, `apo decay`, `apo witness`, `apo aurbis`, `portal`', async () => {
  const prevApo = playerEntity.apotheosis ? structuredClone(playerEntity.apotheosis) : undefined;
  const prevHp = playerEntity.health;
  const prevMaxHp = playerEntity.maxHealth;
  try {
    await executeConsoleCommand('apo', ['reset']);
    await executeConsoleCommand('apo', ['quest', 'complete']);
    selectApotheosisPortfolio(playerEntity, 'war', { nowMinutes: 5000 });
    playerEntity.apotheosis.faith = 500;

    const faithMsg = await executeConsoleCommand('apo', ['faith', '700']);
    assert.match(faithMsg, /700\/1000/);
    assert.equal(playerEntity.apotheosis.faith, 700);

    const decayMsg = await executeConsoleCommand('apo', ['decay', '2']);
    assert.match(decayMsg, /faithLost=30/);
    assert.equal(playerEntity.apotheosis.faith, 670);

    const witnessSet = await executeConsoleCommand('apo', ['witness', '3']);
    assert.match(witnessSet, /3/);
    assert.equal(playerEntity.apotheosis.debugWitnessCount, 3);

    // Clear sky vs war in front of witnesses (`weather 0` neutral for war, costs 35 Faith)
    const aurbisOk = await executeConsoleCommand('apo', ['aurbis', 'weather', '0']);
    assert.match(aurbisOk, /-35 Faith/);
    assert.equal(playerEntity.apotheosis.faith, 635);

    const aurbisDeny = await executeConsoleCommand('apo', ['aurbis', 'tgm']);
    assert.match(aurbisDeny, /forbidden/i);

    let portalCalls = 0;
    setDebugSceneContext({ apotheosisOpenPortal: () => { portalCalls++; return true; } });
    const portalCmd = await executeConsoleCommand('portal', []);
    assert.match(portalCmd, /Portal Stone/i);
    assert.equal(portalCalls, 1);

    const statusOut = await executeConsoleCommand('apo', ['status']);
    assert.match(statusOut, /Faith: 635\/1000/);

    assert.doesNotThrow(() => {
      selectApotheosisSection('aurbis');
      releaseApotheosisPane();
    });
  } finally {
    playerEntity.health = prevHp;
    playerEntity.maxHealth = prevMaxHp;
    if (prevApo === undefined) delete playerEntity.apotheosis;
    else playerEntity.apotheosis = prevApo;
    spendApotheosisFaith(playerEntity, 0);
  }
});

test('Stage 2 bugfixes: divine weather override resists weatherMap/weatherField and Aurbis refunds Faith on command error string', async () => {
  try {
    resetWeatherSim();
    setWeatherFieldLaw(true);
    setWeatherMapLaw(true);
    setDivineWeatherOverride(5, 180);
    assert.equal(currentWeather(), 'thunder');
    // Live frame sample at t=1000 must NOT overwrite pinned thunder
    const changedBeforeExpiry = sampleWeatherField(1000, 223, [0, 0, 0], () => 223, 'live');
    assert.equal(changedBeforeExpiry, false);
    assert.equal(currentWeather(), 'thunder');
    // Still pinned 179 minutes later
    sampleWeatherField(1179, 223, [0, 0, 0], () => 223, 'live');
    assert.equal(currentWeather(), 'thunder');
    // Expires at +180 minutes (1180)
    sampleWeatherField(1180, 223, [0, 0, 0], () => 223, 'live');

    const p = makeGod('order', { faith: 500 });
    const errRes = await executeAurbisCommand('spawnfoe Rat', p, {
      witnessCount: 2,
      executeCommandFn: () => 'Failed to spawn creature in this scene.',
    });
    assert.equal(errRes.ok, false);
    assert.match(errRes.error, /Failed to spawn/i);
    assert.equal(p.apotheosis.faith, 500);

    // `apo aurbis ...` wrapper unwrapping + `apo status` allowed vs cheat `apo` forbidden
    const unwrappedCrisisTp = evaluateAurbisCommand('apo aurbis crisis tp', p);
    assert.equal(unwrappedCrisisTp.allowed, true);
    assert.equal(unwrappedCrisisTp.cmd, 'crisis');
    assert.deepEqual(unwrappedCrisisTp.args, ['tp']);
    assert.equal(unwrappedCrisisTp.faithCost, 180);

    const unwrappedCrisisStatus = evaluateAurbisCommand('apo aurbis crisis status', p);
    assert.equal(unwrappedCrisisStatus.allowed, true);
    assert.equal(unwrappedCrisisStatus.faithCost, 0);

    const unwrappedCrisisStart = evaluateAurbisCommand('apo aurbis crisis start war', p);
    assert.equal(unwrappedCrisisStart.allowed, true);
    assert.equal(unwrappedCrisisStart.faithCost, 500);

    const unwrappedCrisisStop = evaluateAurbisCommand('apo aurbis crisis stop', p);
    assert.equal(unwrappedCrisisStop.allowed, true);
    assert.equal(unwrappedCrisisStop.faithCost, 450);

    const unwrappedItem = evaluateAurbisCommand('apo aurbis additem daedric_claymore', p);
    assert.equal(unwrappedItem.allowed, true);
    assert.equal(unwrappedItem.cmd, 'additem');

    const unwrappedLiving = evaluateAurbisCommand('apo aurbis living adv list', p);
    assert.equal(unwrappedLiving.allowed, true);
    assert.equal(unwrappedLiving.faithCost, 0);

    const apoStatusOk = evaluateAurbisCommand('apo status', p);
    assert.equal(apoStatusOk.allowed, true);
    assert.equal(apoStatusOk.faithCost, 0);

    for (const badApo of ['apo faith 999', 'apo fate full', 'apo artifacts 13', 'apo aurbis tgm']) {
      const denied = evaluateAurbisCommand(badApo, p);
      assert.equal(denied.allowed, false, `Expected ${badApo} to be denied`);
      assert.equal(denied.forbidden, true, `Expected ${badApo} to be forbidden`);
    }

    // `debugWitnessCount` must stay `null` (not coerced to 0) so live `getNearbyWitnessCount` is queried
    const pLive = makeGod('order', { faith: 500 });
    assert.equal(pLive.apotheosis.debugWitnessCount, null);
    setDebugSceneContext({ getNearbyWitnessCount: () => 4 });
    const liveRes = await executeAurbisCommand('heal', pLive, {
      executeCommandFn: () => 'Healed.',
    });
    assert.equal(liveRes.ok, true);
    assert.equal(liveRes.witnessCount, 4);
    assert.equal(liveRes.witnessDelta, 15);
    assert.equal(pLive.apotheosis.debugWitnessCount, null);
  } finally {
    resetWeatherSim();
  }
});

test('Stage 2 Miracles: `pacifyall` (+Order Faith), Lichdom decrees in Scroll of Aurbis, and Faith-scaled 24h Divine Champions', async () => {
  try {
    clearApotheosisChampions();

    // 1. Lichdom commands allowed & properly priced/aligned in Scroll of Aurbis (`necro test` still forbidden)
    const magicGod = makeGod('magic', { faith: 800 });
    const lichEv = evaluateAurbisCommand('lich', magicGod, { witnessCount: 1 });
    assert.equal(lichEv.allowed, true);
    assert.equal(lichEv.faithCost, 400);
    assert.equal(lichEv.alignment, 'aligned');

    const ancLichEv = evaluateAurbisCommand('ancient_lich', magicGod);
    assert.equal(ancLichEv.allowed, true);
    assert.equal(ancLichEv.faithCost, 600);

    const spellsEv = evaluateAurbisCommand('necro_spells', magicGod);
    assert.equal(spellsEv.allowed, true);
    assert.equal(spellsEv.faithCost, 250);

    const elixirEv = evaluateAurbisCommand('additem elixir_unlife 2', magicGod);
    assert.equal(elixirEv.allowed, true);
    assert.equal(elixirEv.faithCost, 500);

    const orderEvLich = evaluateAurbisCommand('lich', makeGod('order', { faith: 800 }), { witnessCount: 1 });
    assert.equal(orderEvLich.allowed, true);
    assert.equal(orderEvLich.alignment, 'opposed');

    // 2. `pacifyall` pacifies without removing hostiles & grants Order Faith bonus (+20 if hostiles pacified, +10 if 0)
    const orderGod = makeGod('order', { faith: 500 });
    const pacRes = await executeAurbisCommand('pacifyall', orderGod, {
      witnessCount: 0,
      nowMinutes: 4000,
      executeCommandFn: () => 'Pacified 3 hostile entities.',
    });
    assert.equal(pacRes.ok, true);
    assert.equal(pacRes.faithSpent, 80);
    assert.equal(pacRes.orderBonus, 20);
    // 500 - 80 + 20 = 440
    assert.equal(orderGod.apotheosis.faith, 440);

    const calmRes = await executeAurbisCommand('pacifyall', orderGod, {
      witnessCount: 0,
      nowMinutes: 4000,
      executeCommandFn: () => 'Calm radiates across the scene (0 active hostiles).',
    });
    assert.equal(calmRes.ok, true);
    assert.equal(calmRes.orderBonus, 10);
    // 440 - 80 + 10 = 370
    assert.equal(orderGod.apotheosis.faith, 370);

    // War god casting pacifyall in front of witnesses gets -20 opposed penalty and 0 Order bonus
    const warGod = makeGod('war', { faith: 500 });
    const warPac = await executeAurbisCommand('pacifyall', warGod, {
      witnessCount: 2,
      nowMinutes: 4000,
      executeCommandFn: () => 'Pacified 2 hostile entities.',
    });
    assert.equal(warPac.ok, true);
    assert.equal(warPac.orderBonus, 0);
    assert.equal(warPac.witnessDelta, -20);
    assert.equal(warGod.apotheosis.faith, 500 - 80 - 20);

    // 3. Faith scaling strictly from cast-time Faith (Ranks I-V) & thematic per Portfolio
    const rank1 = computeChampionFaithScaling(0);
    assert.equal(rank1.rank, 1);
    assert.equal(rank1.romanRank, 'I');
    assert.equal(rank1.healthMult, 2.5);
    assert.equal(rank1.damageScale, 1.375);

    const rank5 = computeChampionFaithScaling(900);
    assert.equal(rank5.rank, 5);
    assert.equal(rank5.romanRank, 'V');
    assert.equal(rank5.healthMult, 4.5);
    assert.equal(rank5.damageScale, 1.875);

    // Cast `summon_champions` (450 Faith) with 850 Faith -> captures cast-time Faith 850 (Rank V), NOT post-spend 400!
    let castTimeFaithSeen = null;
    const mageChampGod = makeGod('magic', { faith: 850 });
    const partyRes = await executeAurbisCommand('summon_champions', mageChampGod, {
      witnessCount: 0,
      nowMinutes: 5000,
      executeCommandFn: (cmd) => {
        castTimeFaithSeen = mageChampGod._aurbisFaithAtCast;
        assert.equal(cmd, 'summon_champions');
        return summonApotheosisChampions(mageChampGod, 4, {
          faithAtCast: mageChampGod._aurbisFaithAtCast,
          nowMinutes: 5000,
        }).message;
      },
    });
    assert.equal(partyRes.ok, true);
    assert.equal(castTimeFaithSeen, 850);
    assert.equal(mageChampGod._aurbisFaithAtCast, undefined);
    assert.equal(mageChampGod.apotheosis.faith, 400);

    const activeParty = getActiveApotheosisChampions();
    assert.equal(activeParty.length, 4);
    assert.ok(activeParty.every((c) => c.portfolio === 'magic' && c.rank === 5 && c.healthMult === 4.5 && c.damageScale === 1.875));

    // Before 24h: no expiration
    const preExp = tickApotheosisChampions(5000 + APOTHEOSIS_CHAMPION_DURATION_MINUTES - 1);
    assert.equal(preExp.expiredCount, 0);
    assert.equal(getActiveApotheosisChampions().length, 4);

    // At 24h (`1440` minutes): Champions return through portal & fire localized notice
    const exp = tickApotheosisChampions(5000 + APOTHEOSIS_CHAMPION_DURATION_MINUTES);
    assert.equal(exp.expiredCount, 4);
    assert.ok(exp.notice && exp.notice.length > 0);
    assert.equal(getActiveApotheosisChampions().length, 0);
  } finally {
    clearApotheosisChampions();
  }
});
