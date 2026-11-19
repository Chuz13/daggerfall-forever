// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AURBIS_DIVINE_SHIELD_COST,
  APOTHEOSIS_DIVINE_SHIELD_ROUNDS,
  APOTHEOSIS_MYTHIC_DECAY_FLAT,
  ensureApotheosisState,
  selectApotheosisPortfolio,
  ensurePantheonState,
  changeDeityRelation,
  setRegionInfluenceShare,
  addApotheosisFaith,
  getFaithMax,
  tickApotheosisMythicDecay,
  evaluateAurbisCommand,
  computeDivineShieldStrength,
  applyApotheosisDivineShield,
  summonApotheosisChampions,
  clearApotheosisChampions,
  getAlliedGodChampionBonus,
  foundPlayerUndergroundSanctuary,
  playerHatchSiteKey,
  getCultPassiveFaithPerDay,
  proclaimRegionalEdict,
  tickCultAndEdictsDay,
  desecrateRoadsideShrine,
  ensureCultPetition,
  notifyCultPetitionProgress,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import { playerEntity, damageShieldPool } from '../../src/characters/playerEntity.js';
import { liveBundles } from '../../src/systems/mysticism.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';
import { isLich, isAncientLich, cureLichdom, cureAncientLichdom } from '../../src/systems/necromancy/lichdomStatus.js';
import { challengeFine } from '../../src/systems/standing.js';
import { changeLegalRep } from '../../src/systems/court.js';
import { createRegionConditions } from '../../src/systems/region/regionConditions.js';
import { _resetForTests as resetOfflineHomes } from '../../src/systems/offlineHomes.js';

function makeAscended(portfolio = 'magic', { region = 17, faith = 1000, level = 18 } = {}) {
  const ent = {
    name: 'Agent',
    level,
    currentRegionIndex: region,
    goldPieces: 100000,
    health: 500,
    maxHealth: 500,
    stats: { strength: 50, intelligence: 80, willpower: 80, agility: 50, endurance: 60, personality: 50, speed: 50, luck: 50 },
    skills: {},
    activeEffects: [],
    factionRep: { dict: new Map() },
    regionConditions: createRegionConditions(),
    apotheosis: {
      ascended: true,
      stage: 'ascended',
      source: 'mantella',
      portfolio,
      ascendedAtMinutes: 1000,
      faith,
      cultFaithBonus: 400,
    },
  };
  ensureApotheosisState(ent);
  selectApotheosisPortfolio(ent, portfolio, { force: true, nowMinutes: 1000 });
  ent.apotheosis.faith = faith;
  return ent;
}

test('Release Polish: Divine Aegis (divine_shield) costs 1000 Faith, scales Level x 50 for 24h, absorbs hits, & integrates HUD bundles', () => {
  const god = makeAscended('magic', { region: 17, faith: 1200, level: 18 });

  const ev = evaluateAurbisCommand('divine_shield', god, { witnessCount: 1 });
  assert.equal(ev.allowed, true);
  assert.equal(ev.faithCost, AURBIS_DIVINE_SHIELD_COST);
  assert.equal(ev.faithCost, 1000);
  assert.equal(ev.alignment, 'aligned');

  // Alias support (`aegis`) + Arcane Convergence (-20% Aurbis cost -> 800)
  ensurePantheonState(god, { nowMinutes: 1000 });
  setRegionInfluenceShare(god, 17, 'player', 35);
  assert.equal(proclaimRegionalEdict(god, 17, 'arcane', { nowMinutes: 1000, force: true }).ok, true);
  const evAlias = evaluateAurbisCommand('aegis', god);
  assert.equal(evAlias.allowed, true);
  assert.equal(evAlias.faithCost, 800);

  // Level 18 -> 900 Shield HP for 1440 magic rounds (24 in-game hours)
  assert.equal(computeDivineShieldStrength(god), 900);
  const res = applyApotheosisDivineShield(god);
  assert.equal(res.ok, true);
  assert.equal(res.pool, 900);
  assert.equal(res.rounds, APOTHEOSIS_DIVINE_SHIELD_ROUNDS);
  assert.equal(res.rounds, 1440);

  const shieldEff = god.activeEffects.find((a) => a.kind === 'shield' && !a.ended);
  assert.ok(shieldEff);
  assert.equal(shieldEff.startingShield, 900);
  assert.equal(shieldEff.shieldRemaining, 900);
  assert.equal(shieldEff.roundsRemaining, 1440);
  assert.equal(shieldEff.bundleIcon, 17);
  assert.equal(shieldEff.bundlePower, true);

  // HUD liveBundles surfaces the Shield bundle
  const bundles = liveBundles(god);
  assert.equal(bundles.length, 1);
  assert.equal(bundles[0].showIcon, true);
  assert.equal(bundles[0].icon, 17);
  assert.equal(bundles[0].entries[0].kind, 'shield');

  // Shield pool absorbs incoming damage, leaving excess only after depletion
  assert.equal(damageShieldPool(god, 300), 0);
  assert.equal(shieldEff.shieldRemaining, 600);

  // Recast tops pool & duration back up cleanly
  god.level = 20;
  applyApotheosisDivineShield(god);
  assert.equal(shieldEff.startingShield, 1000);
  assert.equal(shieldEff.shieldRemaining, 1000);
  assert.equal(shieldEff.roundsRemaining, 1440);
});

test('Release Polish: Lich & Archlich on/off Aurbis decrees & console commands work cleanly', () => {
  const god = makeAscended('magic', { region: 17, faith: 1000 });

  for (const [cmd, expectedCost] of [
    ['lich on', 400],
    ['lich off', 100],
    ['archlich on', 600],
    ['archlich off', 100],
    ['arch_lich on', 600],
    ['arch_lich off', 100],
    ['necro archlich on', 600],
    ['ancient_lich on', 600],
    ['ancient_lich off', 100],
  ]) {
    const ev = evaluateAurbisCommand(cmd, god, { witnessCount: 1 });
    assert.equal(ev.allowed, true, `${cmd} must be allowed in Scroll of Aurbis`);
    assert.equal(ev.faithCost, expectedCost, `${cmd} expected ${expectedCost} Faith`);
    assert.equal(ev.alignment, 'aligned', `${cmd} should align with Magic portfolio`);
  }

  // Console commands for lich on/off and archlich on/off mutate live lichdom state cleanly
  const prevLich = isLich(playerEntity);
  const prevAnc = isAncientLich(playerEntity);
  try {
    cureLichdom(playerEntity);
    cureAncientLichdom(playerEntity);

    assert.ok(getConsoleCommand('lich'), 'console command lich exists');
    assert.ok(getConsoleCommand('archlich'), 'console command archlich exists');
    assert.ok(getConsoleCommand('arch_lich'), 'console command arch_lich exists');

    getConsoleCommand('lich').callback(['on']);
    assert.equal(isLich(playerEntity), true);
    getConsoleCommand('lich').callback(['off']);
    assert.equal(isLich(playerEntity), false);

    getConsoleCommand('archlich').callback(['on']);
    assert.equal(isAncientLich(playerEntity), true);
    getConsoleCommand('archlich').callback(['off']);
    assert.equal(isAncientLich(playerEntity), false);
  } finally {
    cureLichdom(playerEntity);
    cureAncientLichdom(playerEntity);
    if (prevLich) getConsoleCommand('lich').callback(['on']);
    if (prevAnc) getConsoleCommand('archlich').callback(['on']);
  }
});

test('Release Polish: Shadow Tithe cuts watch challengeFine & Aurbis bounty clear cost in half', () => {
  const god = makeAscended('shadows', { region: 17, faith: 1000 });
  god.regionalBounties = { 17: 2000 };
  changeLegalRep(god, 17, -40);
  ensurePantheonState(god, { nowMinutes: 1000 });
  setRegionInfluenceShare(god, 17, 'player', 35);

  const fineBase = challengeFine(god, 17, { ownNow: 1000, worldNow: 1000 });
  const clearBase = evaluateAurbisCommand('bounty clear', god).faithCost;
  assert.equal(clearBase, 100, 'ceil(2000 / 20) = 100 base Faith cost');

  assert.equal(proclaimRegionalEdict(god, 17, 'shadow', { nowMinutes: 1000, force: true }).ok, true);

  const fineShadow = challengeFine(god, 17, { ownNow: 1000, worldNow: 1000 });
  const clearShadow = evaluateAurbisCommand('bounty clear', god).faithCost;
  assert.equal(fineShadow, Math.max(1, Math.round(fineBase * 0.5)), 'Shadow Tithe halves spot watch fine');
  assert.equal(clearShadow, 50, 'Shadow Tithe halves Aurbis bounty clear cost (100 -> 50)');

  // Outside decreed region retains full cost/fine
  const fineOther = challengeFine(god, 18, { ownNow: 1000, worldNow: 1000 });
  god.regionalBounties[18] = 2000;
  god.currentRegionIndex = 18;
  assert.equal(evaluateAurbisCommand('bounty clear', god).faithCost, 100);
  assert.ok(fineOther >= fineShadow);
});

test('Release Polish: Faith unification (Stage 3.3/3.4 capped cleanly) & markDailyGain:false keeps Mythic Decay alive on passive income', () => {
  resetOfflineHomes();
  const god = makeAscended('order', { region: 17, faith: 500 });
  ensurePantheonState(god, { nowMinutes: 10000 });
  god.apotheosis.cultFaithBonus = 100; // maxFaith = 1100
  god.apotheosis.faith = 1500; // temporarily above max

  // addApotheosisFaith enforces maxFaith clamp cleanly while reporting requested reward for HUD
  const aboveRes = addApotheosisFaith(god, 20, { reason: 'test', nowMinutes: 10000 });
  assert.equal(aboveRes.added, 0);
  assert.equal(aboveRes.requested, 20);
  assert.equal(god.apotheosis.faith, getFaithMax(god.apotheosis));

  // Stage 3.3 roadside desecration & petition completion respect getFaithMax
  assert.equal(foundPlayerUndergroundSanctuary(god, {
    mapId: 778,
    regionIndex: 17,
    locationName: 'Daggerfall',
    nowMinutes: 11000,
    force: true,
  }).ok, true);
  god.apotheosis.cultFaithBonus = 100; // keep explicit test maxFaith = 1100
  god.apotheosis.faith = getFaithMax(god.apotheosis) - 5; // 1095
  const des = desecrateRoadsideShrine(god, {
    shrineId: 'roadside:wild:test:cap',
    godId: 'molag_bal',
    regionIndex: 17,
    isWild: true,
    nowMinutes: 12000,
    rng: () => 0.99,
  });
  assert.equal(des.ok, true);
  assert.equal(god.apotheosis.faith, getFaithMax(god.apotheosis));
  assert.equal(des.faithGained, 5);

  god.apotheosis.faith = getFaithMax(god.apotheosis) - 10; // 1090
  const pet = ensureCultPetition(god, { regionIndex: 17, nowMinutes: 20000, rng: () => 0.75, force: true });
  assert.ok(pet);
  const done = notifyCultPetitionProgress(god, 'edict_proclaimed', { regionIndex: 17, nowMinutes: 20100 });
  assert.equal(done.completed, true);
  assert.equal(god.apotheosis.faith, getFaithMax(god.apotheosis));

  // Passive Sanctuary Faith (Tier I = 4/day) does NOT stamp lastFaithGainDay, so Mythic Decay still triggers on idle days
  const decayGod = makeAscended('shadows', { region: 17, faith: 500 });
  const pState = ensurePantheonState(decayGod, { nowMinutes: 1440 * 9 });
  pState.lastPantheonTickDay = 9;
  const fRes = foundPlayerUndergroundSanctuary(decayGod, {
    mapId: 777,
    regionIndex: 17,
    locationName: 'Anticlere',
    nowMinutes: 1440 * 9,
    force: true,
  });
  assert.equal(fRes.ok, true);
  assert.equal(getCultPassiveFaithPerDay(decayGod), 4);
  decayGod.apotheosis.faith = 500;
  decayGod.apotheosis.lastFaithGainDay = 9;
  decayGod.apotheosis.lastFaithDecayDay = 9;

  const cultTick = tickCultAndEdictsDay(decayGod, 1440 * 10, 10);
  assert.equal(cultTick.faithEarned, 4);
  assert.equal(decayGod.apotheosis.faith, 504);
  assert.equal(decayGod.apotheosis.lastFaithGainDay, 9, 'Passive cult income leaves lastFaithGainDay untouched');

  // Day 10 Mythic Decay still sees idle day 9 < 10 and applies -15 decay cleanly
  pState.lastPantheonTickDay = 10; // avoid double-paying day 10 cult income after direct cultTick above
  const decayTick = tickApotheosisMythicDecay(decayGod, 1440 * 10);
  assert.equal(decayTick.decayedDays, 1);
  assert.equal(decayTick.faithLost, APOTHEOSIS_MYTHIC_DECAY_FLAT);
  assert.equal(decayGod.apotheosis.faith, 504 - APOTHEOSIS_MYTHIC_DECAY_FLAT);

  // Day 11 integrated tick: -15 Mythic Decay + 4 passive Cult Faith = 478 net (-11/day), lastFaithGainDay remains 9
  const day11Tick = tickApotheosisMythicDecay(decayGod, 1440 * 11);
  assert.equal(day11Tick.decayedDays, 1);
  assert.equal(day11Tick.faithLost, APOTHEOSIS_MYTHIC_DECAY_FLAT);
  assert.equal(decayGod.apotheosis.lastFaithGainDay, 9);
  assert.equal(decayGod.apotheosis.faith, 489 - APOTHEOSIS_MYTHIC_DECAY_FLAT + 4);
});

test('Release Polish: Allied Deity +1 Bonus Champion joins Summon Champion & Party without affecting unallied gods', () => {
  try {
    clearApotheosisChampions();

    // Without Pantheon Allied deity: base count 1 and 4
    const soloGod = makeAscended('war', { region: 17, faith: 600 });
    assert.equal(getAlliedGodChampionBonus(soloGod), null);
    assert.equal(summonApotheosisChampions(soloGod, 1, { nowMinutes: 5000 }).count, 1);
    assert.equal(summonApotheosisChampions(soloGod, 4, { nowMinutes: 5000 }).count, 4);

    // With two Allied deities: picks highest-relation Allied deity (`azura` at 85 beats `akatosh` at 65)
    ensurePantheonState(soloGod, { nowMinutes: 5000 });
    soloGod.apotheosis.pantheon.deities.akatosh.status = 'allied';
    soloGod.apotheosis.pantheon.deities.akatosh.allied = true;
    soloGod.apotheosis.pantheon.deities.akatosh.relation = 65;
    soloGod.apotheosis.pantheon.deities.azura.status = 'allied';
    soloGod.apotheosis.pantheon.deities.azura.allied = true;
    soloGod.apotheosis.pantheon.deities.azura.relation = 85;

    const bonus = getAlliedGodChampionBonus(soloGod);
    assert.ok(bonus);
    assert.equal(bonus.deityId, 'azura');

    const onePlusAlly = summonApotheosisChampions(soloGod, 1, { faithAtCast: 800, nowMinutes: 5000 });
    assert.equal(onePlusAlly.count, 2);
    assert.equal(onePlusAlly.champions.length, 2);
    assert.ok(onePlusAlly.alliedReinforcement);
    assert.equal(onePlusAlly.alliedReinforcement.isAlliedDeityChampion, true);
    assert.equal(onePlusAlly.alliedReinforcement.alliedDeityId, 'azura');
    assert.match(onePlusAlly.message, /Azura/);

    const partyPlusAlly = summonApotheosisChampions(soloGod, 4, { faithAtCast: 800, nowMinutes: 5000 });
    assert.equal(partyPlusAlly.count, 5);
    assert.equal(partyPlusAlly.champions.filter((c) => c.isAlliedDeityChampion).length, 1);
  } finally {
    clearApotheosisChampions();
  }
});
