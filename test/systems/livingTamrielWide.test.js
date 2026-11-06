// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TOTAL_REGION_COUNT,
  getRegionState,
  setRegionCrisis,
  getRegionIndexAt,
  tickAllRegions,
  CRISIS_TYPE,
  CRISIS_PHASE,
} from '../../src/systems/living/regionState.js';

import {
  ECONOMY_CATEGORY,
  getRegionEconomyMultipliers,
  applyCrisisPriceMultiplier,
  applyTavernRoomCrisisPrice,
} from '../../src/systems/living/regionEconomy.js';

import {
  CHECKPOINT_OUTCOME,
  shouldSpawnRoadCheckpoint,
  evaluateCheckpointEncounter,
  resolveCheckpointInteraction,
} from '../../src/systems/living/roadCheckpointHost.js';

import { GUILD_GROUPS } from '../../src/formats/factionFile.js';
import { SKILLS } from '../../src/systems/skills.js';
import { REGION_NAMES } from '../../src/formats/mapsTables.js';

test('LT-08: RegionState scales across all 71 regions of Tamriel and supports continental coordinate mapping', () => {
  assert.equal(TOTAL_REGION_COUNT, REGION_NAMES.length);
  assert.equal(TOTAL_REGION_COUNT, 71);

  // Validate Bay region (e.g. Daggerfall index 17)
  const daggerfall = getRegionState(17);
  assert.equal(daggerfall.regionIndex, 17);
  assert.equal(daggerfall.regionName, 'Daggerfall');

  // Validate Continental province (e.g. Cyrodiil index 70)
  const cyrodiil = getRegionState(70);
  assert.equal(cyrodiil.regionIndex, 70);
  assert.equal(cyrodiil.regionName, 'Cyrodiil');

  // Daily tick touches all 71 regions in sub-millisecond time
  const t0 = performance.now();
  tickAllRegions(() => 0.5);
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 10, `All 71 regions ticked in ${elapsed}ms (< 10ms target)`);
});

test('LT-08: Economic crisis multipliers apply correctly to weapons, food, and remedies', () => {
  const regId = 5; // Dwynnen
  const baseCost = 1000;

  // In Peace: baseline 1.0x
  setRegionCrisis(regId, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  const peaceMults = getRegionEconomyMultipliers(regId);
  assert.equal(peaceMults.weaponsArmor, 1.0);
  assert.equal(peaceMults.foodLodging, 1.0);
  assert.equal(peaceMults.potionsAlch, 1.0);
  assert.equal(applyCrisisPriceMultiplier(baseCost, regId, ECONOMY_CATEGORY.WEAPONS_ARMOR), 1000);

  // In War (MID): weapons & armor +35%
  setRegionCrisis(regId, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);
  const warMults = getRegionEconomyMultipliers(regId);
  assert.equal(warMults.weaponsArmor, 1.35);
  assert.equal(applyCrisisPriceMultiplier(baseCost, regId, ECONOMY_CATEGORY.WEAPONS_ARMOR), 1350);

  // In Famine (MID): food and tavern beds +50%
  setRegionCrisis(regId, CRISIS_TYPE.FAMINE, CRISIS_PHASE.MID);
  const famineMults = getRegionEconomyMultipliers(regId);
  assert.equal(famineMults.foodLodging, 1.50);
  assert.equal(applyCrisisPriceMultiplier(baseCost, regId, ECONOMY_CATEGORY.FOOD_LODGING), 1500);
  assert.equal(applyTavernRoomCrisisPrice(10, regId), 15);

  // In Plague (MID): potions & alchemy +40%
  setRegionCrisis(regId, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.MID);
  const plagueMults = getRegionEconomyMultipliers(regId);
  assert.equal(plagueMults.potionsAlch, 1.40);
  assert.equal(applyCrisisPriceMultiplier(baseCost, regId, ECONOMY_CATEGORY.POTIONS_ALCH), 1400);

  // Reset
  setRegionCrisis(regId, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
});

test('LT-08: Road checkpoints spawn in conflict regions and Knightly Order members pass freely', () => {
  const regId = 8;
  setRegionCrisis(regId, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);

  assert.equal(shouldSpawnRoadCheckpoint({ regionIndex: regId, isHighway: true }), true);
  assert.equal(shouldSpawnRoadCheckpoint({ regionIndex: regId, isHighway: false }), false);

  const knightPlayer = {
    guildMemberships: {
      [GUILD_GROUPS.KnightlyOrder]: { rank: 2 },
    },
    regionalReputations: { [regId]: 0 },
    stats: { Luck: 50 },
  };

  const encounter = evaluateCheckpointEncounter({ playerEntity: knightPlayer, regionIndex: regId });
  assert.equal(encounter.isKnight, true);
  assert.equal(encounter.canPassFree, true);

  const resKnight = resolveCheckpointInteraction({
    playerEntity: knightPlayer,
    method: 'knight',
    regionIndex: regId,
  });
  assert.equal(resKnight.outcome, CHECKPOINT_OUTCOME.PASSED_FREE);

  // Commoner without standing is refused free pass
  const commonerPlayer = {
    guildMemberships: {},
    regionalReputations: { [regId]: 0 },
    stats: { Luck: 50 },
  };
  const resRefused = resolveCheckpointInteraction({
    playerEntity: commonerPlayer,
    method: 'knight',
    regionIndex: regId,
  });
  assert.equal(resRefused.outcome, CHECKPOINT_OUTCOME.REFUSED);

  // Paying toll succeeds
  const resToll = resolveCheckpointInteraction({
    playerEntity: commonerPlayer,
    method: 'toll',
    tollGoldRequired: 50,
    tollPaid: 50,
    regionIndex: regId,
  });
  assert.equal(resToll.outcome, CHECKPOINT_OUTCOME.TOLL_PAID);

  // Reset
  setRegionCrisis(regId, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
});

test('LT-08: Checkpoint social diplomacy and Luck reroll resolve on narrow failure', () => {
  const regId = 12;
  setRegionCrisis(regId, CRISIS_TYPE.CIVIL_STRIFE, CRISIS_PHASE.MID);

  const diplomaticPlayer = {
    skills: { [SKILLS.Etiquette]: 60 },
    stats: { Personality: 60, Luck: 50 },
    guildMemberships: {},
  };

  // High roll: Passes diplomacy directly
  const resSuccess = resolveCheckpointInteraction({
    playerEntity: diplomaticPlayer,
    method: 'etiquette',
    regionIndex: regId,
    rng: () => 0.95, // High roll
  });
  assert.equal(resSuccess.outcome, CHECKPOINT_OUTCOME.PASSED_DIPLOMACY);

  // Narrow failure rescued by Luck
  // DC is 55, score is 60. roll = 0.44 -> rollVal = 44. Total = 104. Needed: 105. Delta: 1 point!
  let calls = 0;
  const seqRng = () => {
    calls++;
    if (calls === 1) return 0.44; // Narrow failure delta = 1
    return 0.10; // Luck roll succeeds (dice100 < 25)
  };

  const resLuck = resolveCheckpointInteraction({
    playerEntity: diplomaticPlayer,
    method: 'etiquette',
    regionIndex: regId,
    rng: seqRng,
  });
  assert.equal(resLuck.outcome, CHECKPOINT_OUTCOME.LUCK_SAVED);

  // Complete defiance
  const resHostile = resolveCheckpointInteraction({
    playerEntity: diplomaticPlayer,
    method: 'force',
    regionIndex: regId,
  });
  assert.equal(resHostile.outcome, CHECKPOINT_OUTCOME.HOSTILE);

  // Reset
  setRegionCrisis(regId, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
});
