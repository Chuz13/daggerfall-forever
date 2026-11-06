// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureAdventurerPool,
  tickAdventurerSimulation,
  isDungeonInCooldown,
  claimFallenAdventurerRemains,
  isQuestImmuneLocation,
  ADVENTURER_STATUS,
  getAdventurerSimRegistry,
} from '../../src/systems/living/adventurerSim.js';

import {
  shouldDispatchNemesis,
  createNemesisHunter,
  resolveNemesisConfrontation,
  NEMESIS_RESOLUTION,
} from '../../src/systems/living/nemesisHost.js';

import { SKILLS } from '../../src/systems/skills.js';
import { restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';
import { LivingTamrielConfig, resetLivingConfig } from '../../src/systems/living/livingConfig.js';

test('LT-04: Adventurer pool initializes across all 62 regions with zero bloat', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const pool = ensureAdventurerPool();
  // 13 per region * 62 regions = 806 adventurers
  assert.equal(pool.length, 13 * 62);

  const first = pool[0];
  assert.ok(first.name);
  assert.ok(first.className);
  assert.equal(first.gearTier, 1);
  assert.equal(first.status, ADVENTURER_STATUS.IDLE);
});

test('LT-04: Quest-protected dungeons are strictly immune to adventurer simulation clearing', () => {
  const activeQuestSites = [{ mapId: 'quest_dungeon_42' }, { mapId: 1050 }];

  assert.equal(isQuestImmuneLocation('quest_dungeon_42', activeQuestSites), true);
  assert.equal(isQuestImmuneLocation(1050, activeQuestSites), true);
  assert.equal(isQuestImmuneLocation('random_cave', activeQuestSites), false);
});

test('LT-04: Adventurers delve dungeons, apply cooldowns, and leave fallen loot upon death', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const reg = getAdventurerSimRegistry();
  const pool = ensureAdventurerPool();

  // Pick one adventurer and force into DELVING state with mock dungeon
  const mockDungeon = 'ruins_of_scourg';
  pool[0].status = ADVENTURER_STATUS.DELVING;
  pool[0].targetLocationId = mockDungeon;
  pool[0].daysRemainingInAction = 1;

  // Simulate tick with guaranteed success (rng = 0.01)
  tickAdventurerSimulation({ rng: () => 0.01 });

  assert.equal(isDungeonInCooldown(mockDungeon), true);
  assert.equal(pool[0].status, ADVENTURER_STATUS.IDLE);
  assert.equal(pool[0].delveSuccessCount, 1);

  // Now test demise in another dungeon (rng = 0.99 -> failure)
  const fatalDungeon = 'crypt_of_dire';
  pool[1].status = ADVENTURER_STATUS.DELVING;
  pool[1].targetLocationId = fatalDungeon;
  pool[1].daysRemainingInAction = 1;

  tickAdventurerSimulation({ rng: () => 0.99 });

  assert.equal(pool[1].status, ADVENTURER_STATUS.DEAD);
  const loot = claimFallenAdventurerRemains(fatalDungeon);
  assert.ok(loot);
  assert.equal(loot.length, 1);
  assert.equal(loot[0].adventurerName, pool[1].name);

  // Claiming a second time returns null (already looted)
  assert.equal(claimFallenAdventurerRemains(fatalDungeon), null);
});

test('LT-04: Nemesis Hunter is dispatched on infamy and resolves through dialogue & luck', () => {
  const dummyPlayer = {
    skills: { [SKILLS.Etiquette]: 60, [SKILLS.Streetwise]: 60 },
    stats: { personality: 60, luck: 80 },
  };

  // Infamy check
  assert.equal(shouldDispatchNemesis(dummyPlayer, -5, 10), false);
  assert.equal(shouldDispatchNemesis(dummyPlayer, -25, 2), false); // Level too low
  assert.equal(shouldDispatchNemesis(dummyPlayer, -25, 5), true);  // Level >= 3 and rep <= -20

  const hunter = createNemesisHunter(5);
  assert.ok(hunter.level >= 5);

  // 1. Successful Etiquette check
  const pacified = resolveNemesisConfrontation(dummyPlayer, hunter, 'etiquette', () => 0.95);
  assert.equal(pacified.resolution, NEMESIS_RESOLUTION.PACIFIED);

  // 2. Successful Streetwise check
  const bribed = resolveNemesisConfrontation(dummyPlayer, hunter, 'streetwise', () => 0.95);
  assert.equal(bribed.resolution, NEMESIS_RESOLUTION.BRIBED);

  // 3. Narrow failure rescued by Luck
  // roll = 0 -> roll + totalScore fails difficulty, but delta <= 5 -> luck dice100 roll
  let counter = 0;
  const luckSaved = resolveNemesisConfrontation(dummyPlayer, hunter, 'etiquette', () => {
    return counter++ === 0 ? 0.05 : 0.01; // First call is contest roll, second is luck reroll
  });
  assert.ok(
    luckSaved.resolution === NEMESIS_RESOLUTION.LUCK_SAVED ||
    luckSaved.resolution === NEMESIS_RESOLUTION.DUEL
  );
});

