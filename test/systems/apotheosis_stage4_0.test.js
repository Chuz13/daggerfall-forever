// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APOTHEOSIS_STAGES,
  APOTHEOSIS_PORTFOLIO_SWITCH_COST,
  APOTHEOSIS_PORTFOLIO_ALTAR_SWITCH_COST,
  PORTFOLIO_FAITH_GUIDE,
  ensureApotheosisState,
  selectApotheosisPortfolio,
  ensurePantheonState,
  initializePlayerIntoPantheon,
  changeDeityRelation,
  tickPantheonDay,
  tickApotheosisMythicDecay,
  addApotheosisFaith,
  tickApotheosisChampions,
  foundPlayerUndergroundSanctuary,
  playerHatchSiteKey,
  getApotheosisTempleServiceBlock,
  getSanctumCommunionInfo,
  communeAtCultAltar,
  getGlobalInfluenceSummary,
  resolveWarSkirmishPacify,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import { statusTiles } from '../../src/ui/hud/hudStatus.js';
import { statusTip } from '../../src/ui/hud/statusTips.js';
import { snapshotPlayer, restorePlayer } from '../../src/systems/save/save.js';
import { _resetForTests as resetOfflineHomes } from '../../src/systems/offlineHomes.js';

function makeMortal({ region = 17, level = 10 } = {}) {
  return {
    name: 'MortalHero',
    level,
    currentRegionIndex: region,
    goldPieces: 100000,
    health: 120,
    maxHealth: 120,
    magicka: 80,
    maxMagicka: 80,
    fatigue: 200,
    maxFatigue: 200,
    items: [],
    activeEffects: [],
    stats: {},
    skills: {},
    apotheosis: ensureApotheosisState({}).apotheosis ?? {
      ascended: false,
      stage: APOTHEOSIS_STAGES.MORTAL,
    },
  };
}

function makeAscended(portfolio = 'magic', { region = 17, faith = 600, nowMinutes = 10000 } = {}) {
  const ent = makeMortal({ region, level: 20 });
  ent.apotheosis = {
    ascended: true,
    stage: APOTHEOSIS_STAGES.AWAITING_PORTFOLIO,
    source: 'mantella',
    faith,
    sacrificedArtifacts: [],
  };
  selectApotheosisPortfolio(ent, portfolio, { nowMinutes });
  ent.apotheosis.faith = faith;
  return ent;
}

test('Phase 4.0: Pre-Ascension Pantheon sim runs with allowPreAscension without harming player or breaking direct mortal guard', () => {
  const mortal = makeMortal({ region: 17 });
  ensureApotheosisState(mortal);

  // Direct calls without allowPreAscension remain a safe no-op for unit-test compatibility
  const direct = tickPantheonDay(mortal, 5 * 1440, { daysOverride: 2, rng: () => 0.1 });
  assert.equal(direct.daysProcessed, 0);
  assert.equal(direct.aiMoves, 0);

  // World-tick pre-Ascension simulation advances inter-deity relations and influence
  const preRes = tickApotheosisMythicDecay(mortal, 10 * 1440, { daysOverride: 3, allowPreAscension: true });
  assert.equal(preRes.decayedDays, 0);
  assert.equal(preRes.pantheon.daysProcessed, 3);
  assert.ok(preRes.pantheon.aiMoves > 0);
  assert.equal(mortal.apotheosis.pantheon.playerJoinedPantheon, false);
  assert.equal(mortal.apotheosis.pantheon.regionInfluence[17].player ?? 0, 0);

  // Ascending later preserves world history while computing personalHistory, Grace, and 10% foothold
  mortal.apotheosis.stage = APOTHEOSIS_STAGES.AWAITING_PORTFOLIO;
  mortal.apotheosis.source = 'mantella';
  const ascMin = 15 * 1440;
  const claim = selectApotheosisPortfolio(mortal, 'order', { nowMinutes: ascMin });
  assert.equal(claim.ok, true);
  assert.equal(mortal.apotheosis.pantheon.playerJoinedPantheon, true);
  assert.ok((mortal.apotheosis.pantheon.regionInfluence[17].player ?? 0) >= 10);
  assert.ok(mortal.apotheosis.pantheon.chronicle.length > 0);

  // Idempotent second call does not reset anything
  const beforeLen = mortal.apotheosis.pantheon.chronicle.length;
  initializePlayerIntoPantheon(mortal, ascMin + 100);
  assert.equal(mortal.apotheosis.pantheon.chronicle.length, beforeLen);
});

test('Phase 4.0: Hostile Aedra temples block services (except Donate on hostile; all blocked on war)', () => {
  const mortal = makeMortal();
  assert.equal(getApotheosisTempleServiceBlock(mortal, { guild: { divine: 'Akatosh', factionId: 26 }, service: 'CureDisease' }).blocked, false);

  const god = makeAscended('shadows', { nowMinutes: 10000 });
  // Ensure Akatosh is hostile (-45)
  const akEntry = god.apotheosis.pantheon.deities.akatosh;
  akEntry.personalHistory = -10;
  changeDeityRelation(god, 'akatosh', 0, { nowMinutes: 10000 });
  akEntry.personalHistory = -10; // relation = -10 + (-40 shadows) = -50 -> hostile
  ensurePantheonState(god, { nowMinutes: 10000 });
  assert.equal(god.apotheosis.pantheon.deities.akatosh.status, 'hostile');

  const hostileHeal = getApotheosisTempleServiceBlock(god, { guild: { divine: 'Akatosh', factionId: 26 }, service: 'CureDisease' });
  assert.equal(hostileHeal.blocked, true);
  assert.equal(hostileHeal.status, 'hostile');

  // Donate remains allowed on hostile so player can appease
  const hostileDonate = getApotheosisTempleServiceBlock(god, { guild: { divine: 'Akatosh', factionId: 26 }, service: 'Donate' });
  assert.equal(hostileDonate.blocked, false);

  // Own consecrated temple is never blocked
  const ownAllow = getApotheosisTempleServiceBlock(god, { guild: { divine: 'Akatosh', factionId: 26 }, service: 'CureDisease', ownTemple: true });
  assert.equal(ownAllow.blocked, false);

  // War blocks even Donate
  akEntry.manualWar = true;
  ensurePantheonState(god, { nowMinutes: 10000 });
  assert.equal(god.apotheosis.pantheon.deities.akatosh.status, 'war');
  const warDonate = getApotheosisTempleServiceBlock(god, { guild: { divine: 'Akatosh', factionId: 26 }, service: 'Donate' });
  assert.equal(warDonate.blocked, true);
  assert.equal(warDonate.status, 'war');
});

test('Phase 4.0: Personal Altar Communion & 125F (50% off) Portfolio Switch', () => {
  resetOfflineHomes();
  const nowMin = 20 * 1440;
  const god = makeAscended('war', { region: 17, faith: 800, nowMinutes: nowMin });
  god.goldPieces = 100000;
  const founded = foundPlayerUndergroundSanctuary(god, {
    mapId: 9001,
    regionIndex: 17,
    locationName: 'Daggerfall',
    branch: 'oracle',
    nowMinutes: nowMin,
  });
  assert.equal(founded.ok, true);
  const siteKey = playerHatchSiteKey(9001);

  // Damage vitals, add negative effect & Apostasy stack
  god.health = 10;
  god.magicka = 5;
  god.fatigue = 1;
  god.bleeding = 3;
  god.activeEffects = [{ kind: 'poison', ended: false }, { kind: 'shield', ended: false }];
  god.apotheosis.apostasyCount = 2;

  const com = communeAtCultAltar(god, siteKey, { nowMinutes: nowMin });
  assert.equal(com.ok, true);
  assert.equal(god.health, god.maxHealth);
  assert.equal(god.magicka, god.maxMagicka);
  assert.equal(god.fatigue, god.maxFatigue);
  assert.equal(god.bleeding, 0);
  assert.equal(god.activeEffects[0].ended, true);
  assert.equal(god.activeEffects[1].ended, false);
  assert.equal(god.apotheosis.apostasyCount, 1);
  assert.equal(god.apotheosis.lastFaithGainDay, 20);

  const info = getSanctumCommunionInfo(god, nowMin + 60);
  assert.ok(info && info.active);
  assert.equal(info.bonusPct, 15);

  // Communion is 1/day
  const comAgain = communeAtCultAltar(god, siteKey, { nowMinutes: nowMin + 120 });
  assert.equal(comAgain.ok, false);
  assert.equal(comAgain.alreadyUsed, true);

  // +15% Faith gain bonus while Sanctum Communion is active
  const beforeF = god.apotheosis.faith;
  const gained = addApotheosisFaith(god, 100, { nowMinutes: nowMin + 120 });
  assert.equal(gained.added, 115);
  assert.equal(god.apotheosis.faith, beforeF + 115);

  // Altar Portfolio switch costs 125 Faith (50% off 250) after 30d cooldown
  const swTime = nowMin + 31 * 1440;
  const fBeforeSw = god.apotheosis.faith;
  const sw = selectApotheosisPortfolio(god, 'magic', { nowMinutes: swTime, atAltar: true });
  assert.equal(sw.ok, true);
  assert.equal(APOTHEOSIS_PORTFOLIO_ALTAR_SWITCH_COST, 125);
  assert.equal(APOTHEOSIS_PORTFOLIO_SWITCH_COST, 250);
  assert.equal(fBeforeSw - god.apotheosis.faith, 125);

  // Save/Restore round-trip preserves playerJoinedPantheon, communionBuff, and lastCommunionDay
  const snap = snapshotPlayer(god);
  const restored = makeMortal();
  restorePlayer(restored, snap);
  assert.equal(restored.apotheosis.pantheon.playerJoinedPantheon, true);
  assert.equal(restored.apotheosis.cult.lastCommunionDay, 20);
  assert.equal(restored.apotheosis.communionBuff.bonusPct, 15);
  // Mutating restored does not alias snapshot
  restored.apotheosis.communionBuff.bonusPct = 99;
  assert.equal(snap.apotheosis.communionBuff.bonusPct, 15);
  tickApotheosisChampions(0);
});

test('Phase 4.0: PORTFOLIO_FAITH_GUIDE documents all 4 portfolios and key caveats', () => {
  for (const id of ['war', 'magic', 'shadows', 'order']) {
    const g = PORTFOLIO_FAITH_GUIDE[id];
    assert.ok(g);
    assert.ok(g.sources().length >= 3);
    assert.ok(g.alignedMiracles().length > 0);
    assert.ok(g.opposedMiracles().length > 0);
  }
  assert.match(PORTFOLIO_FAITH_GUIDE.magic.caveat(), /0 Faith/i);
  assert.match(PORTFOLIO_FAITH_GUIDE.order.sources().join(' '), /\+10 Faith\/day/i);
  assert.match(PORTFOLIO_FAITH_GUIDE.order.alignedMiracles(), /bounty clear/i);
  assert.match(PORTFOLIO_FAITH_GUIDE.order.opposedMiracles(), /bounty set/i);
  assert.doesNotMatch(PORTFOLIO_FAITH_GUIDE.war.alignedMiracles(), /set_attr/i);
  assert.doesNotMatch(PORTFOLIO_FAITH_GUIDE.magic.alignedMiracles(), /addspell/i);
});

test('Phase 4.0 Audit: statusTiles keeps distinct keys for road_blessing and sanctum_communion', () => {
  const roadOnly = statusTiles({
    blessing: { key: 'road_blessing', active: true, name: 'Blessing of Mara', foot: '2h' },
  });
  const communionOnly = statusTiles({
    blessing: { key: 'sanctum_communion', active: true, name: 'Sanctum Communion', foot: '24h' },
  });
  assert.equal(roadOnly[0].key, 'road_blessing');
  assert.equal(communionOnly[0].key, 'sanctum_communion');
});

test('Phase 4.0 Audit: Mortal pacifying pre-Ascension divine war skirmish uses gold/diplomacy without Faith', () => {
  const mortal = makeMortal({ region: 17 });
  mortal.apotheosis.faith = 0;
  const warDesc = {
    warKind: 'divine',
    warId: 'godwar_akatosh_mehrunes_dagon_1',
    regIdx: 17,
    regions: [17],
    godA: 'akatosh',
    godB: 'mehrunes_dagon',
    war: { id: 'godwar_akatosh_mehrunes_dagon_1', regions: [17], regionPacified: {}, pacifiedCount: 0 },
  };
  const res = resolveWarSkirmishPacify(mortal, warDesc, { nowMinutes: 5000, forcedDegree: 'SUCCESS' });
  assert.equal(res.ok, true);
  assert.equal(res.faithShortage, undefined);
  assert.equal(res.faithReward, 0);
  assert.equal(res.goldReward, 100);
  assert.equal(mortal.apotheosis.faith, 0);
});

test('Phase 4.0 Audit: communeAtCultAltar syncs currentHealth & selectApotheosisPortfolio distinguishes 250 vs 125 error', () => {
  resetOfflineHomes();
  const nowMin = 25 * 1440;
  const god = makeAscended('war', { region: 17, faith: 100, nowMinutes: nowMin });
  god.goldPieces = 100000;
  god.apotheosis.faith = 500;
  assert.equal(foundPlayerUndergroundSanctuary(god, { mapId: 9002, regionIndex: 17, locationName: 'Wayrest', nowMinutes: nowMin }).ok, true);

  god.health = 25;
  god.currentHealth = 25;
  const com = communeAtCultAltar(god, playerHatchSiteKey(9002), { nowMinutes: nowMin });
  assert.equal(com.ok, true);
  assert.equal(god.health, god.maxHealth);
  assert.equal(god.currentHealth, god.maxHealth);

  // Switch failure messages after 30d cooldown
  god.apotheosis.faith = 100;
  const later = nowMin + 31 * 1440;
  const failNormal = selectApotheosisPortfolio(god, 'magic', { nowMinutes: later });
  assert.equal(failNormal.ok, false);
  assert.equal(failNormal.requiredFaith, 250);
  assert.match(failNormal.error, /250 Faith/);

  const failAltar = selectApotheosisPortfolio(god, 'magic', { nowMinutes: later, atAltar: true });
  assert.equal(failAltar.ok, false);
  assert.equal(failAltar.requiredFaith, 125);
  assert.match(failAltar.error, /125 Faith/);
});

test('Phase 4.0 Fix: Sanctum Communion shields next-day Mythic Decay & statusTip renders Communion/Blessing lines', () => {
  resetOfflineHomes();
  const day20 = 20 * 1440 + 600;
  const god = makeAscended('magic', { region: 17, faith: 500, nowMinutes: day20 });
  god.goldPieces = 100000;
  assert.equal(foundPlayerUndergroundSanctuary(god, { mapId: 9003, regionIndex: 17, locationName: 'Sentinel', nowMinutes: day20 }).ok, true);

  const com = communeAtCultAltar(god, playerHatchSiteKey(9003), { nowMinutes: day20 });
  assert.equal(com.ok, true);

  // apo decay 1 (daysOverride: 1 -> day 21) is shielded by 24h Sanctum Communion
  const d1 = tickApotheosisMythicDecay(god, day20, { daysOverride: 1 });
  assert.equal(d1.decayedDays, 0);
  assert.equal(d1.faithLost, 0);

  // apo decay 2 (daysOverride: 2 -> day 21 shielded, day 22 decays 15)
  const d2 = tickApotheosisMythicDecay(god, day20, { daysOverride: 2 });
  assert.equal(d2.decayedDays, 1);
  assert.equal(d2.faithLost, 15);

  // Real day rollover (day 20 -> day 21) is also shielded
  god.apotheosis.lastFaithDecayDay = 20;
  const realRoll = tickApotheosisMythicDecay(god, day20 + 1440);
  assert.equal(realRoll.decayedDays, 0);
  assert.equal(realRoll.faithLost, 0);

  // statusTip exposes tile.say for sanctum_communion and road_blessing
  const communionTip = statusTip({
    key: 'sanctum_communion',
    kind: 'buff',
    name: 'Sanctum Communion',
    foot: '24h',
    say: '+15% Faith gain & Mythic Decay Shield for the next day (24h left).',
  }, god);
  assert.equal(communionTip.title, 'Sanctum Communion');
  assert.equal(communionTip.foot, '24h');
  assert.deepEqual(communionTip.lines, ['+15% Faith gain & Mythic Decay Shield for the next day (24h left).']);

  const roadTip = statusTip({
    key: 'road_blessing',
    kind: 'buff',
    name: 'Blessing of Mara',
    foot: '2h',
    say: 'Blessing of Mara: +3/min Fatigue, +10° Weather Resist, +10% Elemental Resist (2h left)',
  }, god);
  assert.equal(roadTip.title, 'Blessing of Mara');
  assert.equal(roadTip.foot, '2h');
  assert.deepEqual(roadTip.lines, ['Blessing of Mara: +3/min Fatigue, +10° Weather Resist, +10% Elemental Resist (2h left)']);
});
