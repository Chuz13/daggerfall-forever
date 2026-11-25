// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureAdventurerPool,
  tickAdventurerSimulation,
  isQuestImmuneLocation,
  createVirtualAdventurer,
  evaluateAdventurerTension,
  resolveAdventurerEncounter,
  confrontInterceptingAdventurer,
  recruitAdventurerCompanion,
  getDelvesRequiredForLevel,
  getAdventurerEcosystemStats,
  ADVENTURER_STATUS,
  ADVENTURER_TRAITS,
  CHALLENGE_TYPE,
  DUEL_OUTCOME,
  RECLAIM_OUTCOME,
  RIVALRY_ATTITUDES,
  getAdventurerSimRegistry,
} from '../../src/systems/living/adventurerSim.js';

import { restoreLivingSaveData, getLivingSaveData } from '../../src/systems/living/livingDirector.js';
import { LivingTamrielConfig, resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import { LEVEL_CAP } from '../../src/systems/levelCap.js';
import { SKILLS } from '../../src/systems/skills.js';

test('LT-09: Adventurer pool maintains population via immediate newcomer respawn on demise', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const pool = ensureAdventurerPool();
  const initialCount = pool.length;

  // Force first adventurer into fatal delve
  const fatalAdv = pool[0];
  fatalAdv.status = ADVENTURER_STATUS.DELVING;
  fatalAdv.targetLocationId = 'crypt_of_peril';
  fatalAdv.daysRemainingInAction = 1;

  // Run simulation with high RNG guaranteeing failure (demise)
  tickAdventurerSimulation({ rng: () => 0.999 });

  assert.equal(fatalAdv.status, ADVENTURER_STATUS.DEAD);
  // Total pool count must have grown by 1 because of the newly respawned newcomer!
  assert.equal(pool.length, initialCount + 1);

  const newcomer = pool[pool.length - 1];
  assert.ok(newcomer.id > initialCount);
  assert.equal(newcomer.currentRegion, fatalAdv.currentRegion);
  assert.equal(newcomer.status, ADVENTURER_STATUS.IDLE);
  assert.ok(newcomer.level >= 1 && newcomer.level <= 4);
  assert.ok(ADVENTURER_TRAITS.includes(newcomer.trait));
});

test('LT-09: Adventurers scale level up to LEVEL_CAP (45) and gear tiers 1..9', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const adv = createVirtualAdventurer(999, 10);
  adv.level = 44;
  adv.gearTier = 8;
  adv.delveSuccessCount = 1;
  adv.delveLevelProgress = getDelvesRequiredForLevel(44) - 1;
  adv.status = ADVENTURER_STATUS.DELVING;
  adv.targetLocationId = 'dungeon_high_level';
  adv.daysRemainingInAction = 1;

  const reg = getAdventurerSimRegistry();
  reg.pool = [adv];

  // Guaranteed success
  tickAdventurerSimulation({ rng: () => 0.01 });

  assert.equal(adv.level, LEVEL_CAP); // Exactly 45
  assert.equal(adv.gearTier, 9); // Artifact / Max Daedric tier

  // Delve again at cap 45: level must NOT exceed 45
  adv.status = ADVENTURER_STATUS.DELVING;
  adv.targetLocationId = 'dungeon_high_level_2';
  adv.daysRemainingInAction = 1;

  tickAdventurerSimulation({ rng: () => 0.01 });
  assert.equal(adv.level, LEVEL_CAP);
  assert.equal(adv.gearTier, 9);
});

test('LT-09: Personality traits generate rivalry, dares, and honor duel encounters', () => {
  const dummyPlayer = {
    level: 15,
    regionalReputations: { 5: 20 },
    stats: { Luck: 50 },
    skills: { [SKILLS.Streetwise]: 75, [SKILLS.Etiquette]: 75 },
  };

  // Arrogant rival dares the player ("на слабо")
  const arrogantAdv = createVirtualAdventurer(1, 5);
  arrogantAdv.trait = 'ARROGANT';
  arrogantAdv.level = 10;
  const arrogantEval = evaluateAdventurerTension(arrogantAdv, dummyPlayer);
  assert.equal(arrogantEval.attitude, RIVALRY_ATTITUDES.RIVAL);
  assert.equal(arrogantEval.challengeType, CHALLENGE_TYPE.DARE);
  assert.ok(arrogantEval.wagerGold >= 50);

  // Honorable duelist
  const honorableAdv = createVirtualAdventurer(2, 5);
  honorableAdv.trait = 'HONORABLE';
  const honorableEval = evaluateAdventurerTension(honorableAdv, dummyPlayer);
  assert.equal(honorableEval.attitude, RIVALRY_ATTITUDES.HONORABLE);
  assert.equal(honorableEval.challengeType, CHALLENGE_TYPE.MUTUAL_RESPECT);

  // Duel resolution: Player wins
  const duelWinResult = resolveAdventurerEncounter({
    adv: arrogantAdv,
    playerEntity: dummyPlayer,
    action: 'ACCEPT_DUEL',
    wagerGold: 100,
    rng: () => 0.1, // Favorable roll for player
  });
  assert.equal(duelWinResult.outcome, DUEL_OUTCOME.PLAYER_WON);
  assert.equal(duelWinResult.goldDelta, 100);
  assert.equal(arrogantAdv.duelsLost, 1);

  // Intimidation check
  const intimidateResult = resolveAdventurerEncounter({
    adv: arrogantAdv,
    playerEntity: dummyPlayer,
    action: 'INTIMIDATE',
    rng: () => 0.1,
  });
  assert.equal(intimidateResult.outcome, DUEL_OUTCOME.DIPLOMACY_PEACE);
});

test('LT-09: Quest competition toggle shields main story while allowing radiant quest interceptions', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const dummyPlayer = {
    level: 10,
    stats: { Luck: 50 },
    skills: { [SKILLS.Streetwise]: 80, [SKILLS.Etiquette]: 70 },
  };

  const activeQuestSites = [
    { mapId: 101, isMainQuest: true },       // Main story quest
    { mapId: 'side_cave_88', isMainQuest: false }, // Radiant guild quest
  ];

  // When competition is OFF (default & permanently muted in config):
  LivingTamrielConfig.allowQuestCompetition = false;
  assert.equal(LivingTamrielConfig.allowQuestCompetition, false);
  assert.equal(isQuestImmuneLocation(101, activeQuestSites), true);
  assert.equal(isQuestImmuneLocation('side_cave_88', activeQuestSites), true);

  // If competition were explicitly enabled in logic parameter:
  assert.equal(isQuestImmuneLocation(101, activeQuestSites, true), true); // Still immune!
  assert.equal(isQuestImmuneLocation('side_cave_88', activeQuestSites, true), false); // Open to competition!

  // Simulate adventurer clearing the side quest dungeon
  const reg = getAdventurerSimRegistry();
  const adv = createVirtualAdventurer(77, 1);
  adv.trait = 'MERCENARY';
  adv.level = 8;
  adv.status = ADVENTURER_STATUS.DELVING;
  adv.targetLocationId = 'side_cave_88';
  adv.daysRemainingInAction = 1;
  reg.pool = [adv];

  tickAdventurerSimulation({ activeQuestSites, rng: () => 0.01, allowQuestCompetition: true });

  // Adventurer intercepted the quest!
  const interception = reg.interceptedQuests['side_cave_88'];
  assert.ok(interception);
  assert.equal(interception.adventurerId, 77);
  assert.equal(interception.recovered, false);

  // Player buys back the intercepted trophy using Streetwise discount
  const buybackResult = confrontInterceptingAdventurer({
    locationId: 'side_cave_88',
    playerEntity: dummyPlayer,
    method: 'BUYOUT',
    goldOffered: 500,
    rng: () => 0.5,
  });

  assert.ok(buybackResult);
  assert.equal(buybackResult.outcome, RECLAIM_OUTCOME.BOUGHT_BACK);
  assert.equal(buybackResult.recovered, true);
  assert.ok(buybackResult.goldCost > 0 && buybackResult.goldCost <= 500);
  assert.equal(reg.interceptedQuests['side_cave_88'].recovered, true);
});

test('LT-09: 30/region pool initializes with seeded level pyramid and 2130 total adventurers', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const pool = ensureAdventurerPool();
  assert.equal(pool.length, 30 * 71);
  assert.ok(pool[0].level >= 1 && pool[0].level <= 4);
  assert.equal(pool[0].gearTier, 1);

  const stats = getAdventurerEcosystemStats(17);
  assert.equal(stats.regionAlive, 30);
  assert.ok(stats.regionMaxLevel >= 24, `expected a regional champion Lv 24+, got ${stats.regionMaxLevel}`);
});

test('LT-09: 365-day simulation keeps 1-3 elites/region, bounded remains/cooldowns, and <950 KB save', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  let s = 12345 >>> 0;
  const rng = () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 4294967296; };

  ensureAdventurerPool(rng);
  for (let d = 0; d < 365; d++) {
    tickAdventurerSimulation({ rng });
  }

  const stats = getAdventurerEcosystemStats(17);
  assert.ok(stats.avgElitesPerRegion >= 0.5 && stats.avgElitesPerRegion <= 4.0, `avgElitesPerRegion=${stats.avgElitesPerRegion}`);
  assert.equal(Object.keys(stats.traitCountsAt25).length, 7, 'all 7 traits represented among Lv 25+ elites');
  assert.ok(stats.cooldownPct < 45, `cooldownPct=${stats.cooldownPct}% should stay < 45%`);
  assert.ok(stats.remainsCount < 600, `remainsCount=${stats.remainsCount} should stay bounded`);

  const reg = getAdventurerSimRegistry();
  for (const list of Object.values(reg.fallenRemains)) {
    assert.ok(list.length <= 2, 'max 2 fallen remains per dungeon slot');
  }

  const saveBytes = JSON.stringify(getLivingSaveData()).length;
  assert.ok(saveBytes < 950 * 1024, `saveBytes=${saveBytes} should stay < 950 KB`);
});

test('LT-09: Lv 45 legend retirement cycles cap adventurers without remains, while active companion is protected', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const reg = getAdventurerSimRegistry();
  const capAdv = createVirtualAdventurer(501, 17, () => 0.5, 45);
  capAdv.status = ADVENTURER_STATUS.DELVING;
  capAdv.targetLocationId = 'dungeon_17_2';
  capAdv.daysRemainingInAction = 1;

  const compAdv = createVirtualAdventurer(502, 17, () => 0.5, 20);
  compAdv.status = ADVENTURER_STATUS.DELVING;
  compAdv.targetLocationId = 'dungeon_17_3';
  compAdv.daysRemainingInAction = 1;

  reg.pool = [capAdv, compAdv];
  recruitAdventurerCompanion(compAdv, 1000, 3);

  // rng=0.01 triggers delve success AND cap retirement (< 0.08)
  tickAdventurerSimulation({ rng: () => 0.01 });

  assert.equal(capAdv.status, ADVENTURER_STATUS.DEAD, 'Lv 45 legend retires');
  assert.equal(reg.retiredCount, 1);
  assert.equal(reg.fallenRemains['dungeon_17_2'], undefined, 'retired legend leaves no fallenRemains');
  assert.equal(compAdv.status, ADVENTURER_STATUS.DELVING, 'active hired companion is protected from background sim');
});

