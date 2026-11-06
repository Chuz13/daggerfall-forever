// @ts-check
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  registerCorpse,
  getCorpse,
  corpsesNear,
  evaluateCorpseState,
  tickCorpseDecay,
  harvestCorpse,
  consumeCorpse,
  clearSceneCorpses,
  CORPSE_STATE,
  DECAY_THRESHOLDS,
  _resetCorpseRegistryForTests,
} from '../../src/systems/necromancy/corpseRegistry.js';

import {
  calculateUndeadCapacity,
  canAffordUndead,
  addUndeadMinion,
  removeUndeadMinion,
  activeUndeadCount,
  activeUndeadRoster,
  usedUndeadPoints,
  UNDEAD_SLOT_COST,
  initUndeadCompanionAdapter,
  _resetUndeadCapacityForTests,
} from '../../src/systems/necromancy/undeadCapacity.js';

import {
  applyLichdom,
  liveLichdom,
  isLich,
  cureLichdom,
  LICH_STAT_MODS,
  LICH_SKILL_MODS,
} from '../../src/systems/necromancy/lichdomStatus.js';

import { liveStat } from '../../src/systems/statMods.js';
import { skillValue, SKILLS } from '../../src/systems/skills.js';
import { companionsWithYou, companionRoster, _resetCompanionSlotsForTests } from '../../src/systems/companionSlots.js';
import { WEAPON_MATERIALS } from '../../src/characters/weapons.js';

beforeEach(() => {
  _resetCorpseRegistryForTests();
  _resetUndeadCapacityForTests();
  _resetCompanionSlotsForTests();
});

// =========================================================================
// CORPSE REGISTRY & LIFECYCLE TESTS
// =========================================================================

test('CorpseRegistry: registers new corpse with default fresh state', () => {
  const corpse = registerCorpse({
    entityType: 'humanoid',
    entityName: 'Skaafin',
    position: [10, 0, 10],
    sceneKey: 'dungeon_01',
    deathTimestamp: 100,
  });

  assert.ok(corpse);
  assert.equal(corpse.entityName, 'Skaafin');
  assert.equal(corpse.corpseState, CORPSE_STATE.FRESH);
  assert.deepEqual(corpse.position, [10, 0, 10]);

  const fetched = getCorpse(corpse.id);
  assert.equal(fetched?.id, corpse.id);
});

test('CorpseRegistry: evaluates decay state across game time thresholds', () => {
  const corpse = registerCorpse({
    deathTimestamp: 1000,
  });
  assert.ok(corpse);

  // At 1000 + 100 min (elapsed: 100 min < 360 min) -> FRESH
  assert.equal(evaluateCorpseState(corpse, 1100), CORPSE_STATE.FRESH);

  // At 1000 + 400 min (elapsed: 400 min > 360 min but < 1440 min) -> DECAYING
  assert.equal(evaluateCorpseState(corpse, 1400), CORPSE_STATE.DECAYING);

  // At 1000 + 1500 min (elapsed: 1500 min > 1440 min) -> SKELETAL
  assert.equal(evaluateCorpseState(corpse, 2500), CORPSE_STATE.SKELETAL);
});

test('CorpseRegistry: finds corpses within radius', () => {
  registerCorpse({ id: 'c1', position: [0, 0, 0], sceneKey: 'room1' });
  registerCorpse({ id: 'c2', position: [3, 0, 4], sceneKey: 'room1' }); // dist = 5
  registerCorpse({ id: 'c3', position: [20, 0, 20], sceneKey: 'room1' }); // dist ~ 28.2
  registerCorpse({ id: 'c4', position: [1, 0, 1], sceneKey: 'room2' }); // different scene

  const near = corpsesNear([0, 0, 0], 10, { sceneKey: 'room1' });
  assert.equal(near.length, 2);
  assert.equal(near[0].id, 'c1');
  assert.equal(near[1].id, 'c2');
});

test('CorpseRegistry: harvesting rules and desecration', () => {
  const corpse = registerCorpse({ deathTimestamp: 100, entityType: 'undead' });
  assert.ok(corpse);

  // Harvest flesh on fresh corpse
  const fleshRes = harvestCorpse(corpse.id, 'flesh');
  assert.equal(fleshRes.success, true);
  assert.equal(fleshRes.itemYield, 'Flesh');

  // Second harvest of same part should fail
  const fleshRes2 = harvestCorpse(corpse.id, 'flesh');
  assert.equal(fleshRes2.success, false);

  // Harvest ectoplasm from undead
  const ectoRes = harvestCorpse(corpse.id, 'ectoplasm');
  assert.equal(ectoRes.success, true);
  assert.equal(ectoRes.itemYield, 'Ectoplasm');

  // Harvest bones & skull -> transitions to desecrated
  harvestCorpse(corpse.id, 'bones');
  harvestCorpse(corpse.id, 'skull');
  assert.equal(corpse.corpseState, CORPSE_STATE.DESECRATED);
});

test('CorpseRegistry: consumption and scene cleanup', () => {
  const c1 = registerCorpse({ id: 'c1', sceneKey: 'dungeonA' });
  const c2 = registerCorpse({ id: 'c2', sceneKey: 'dungeonB' });

  assert.ok(consumeCorpse('c1'));
  assert.equal(getCorpse('c1'), null); // Consumed corpses not returned by getCorpse

  clearSceneCorpses('dungeonB');
  assert.equal(getCorpse('c2'), null);
});

// =========================================================================
// UNDEAD CAPACITY & COMPANION SLOTS TESTS
// =========================================================================

test('UndeadCapacity: scales correctly with player stats', () => {
  const player = {
    stats: { Intelligence: 60, Willpower: 60 },
    activeEffects: [],
    skills: { [SKILLS.Mysticism]: 50 },
  };

  // intBonus: 60 / 20 = 3
  // wilBonus: 60 / 30 = 2
  // mystBonus: 50 / 25 = 2
  // Total = 7
  const cap = calculateUndeadCapacity(player);
  assert.equal(cap, 7);

  // Test fixed cap setting override
  assert.equal(calculateUndeadCapacity(player, { fixedCap: 3 }), 3);
});

test('UndeadCapacity: minion limits and companionSlots integration', () => {
  initUndeadCompanionAdapter();

  const player = {
    stats: { Intelligence: 50, Willpower: 30 },
    activeEffects: [],
    skills: { [SKILLS.Mysticism]: 25 },
  };
  // Cap: 2 + 1 + 1 = 4 points

  assert.equal(canAffordUndead(player, 'skeleton'), true); // Cost 1
  assert.equal(canAffordUndead(player, 'mummy'), true); // Cost 4
  assert.equal(canAffordUndead(player, 'lich'), false); // Cost 8 > 4

  addUndeadMinion({ id: 'skel_1', type: 'skeleton', name: 'Rattles' });
  addUndeadMinion({ id: 'zomb_1', type: 'zombie', name: 'Rotter' });

  // Used: 1 + 2 = 3 points
  assert.equal(usedUndeadPoints(), 3);
  assert.equal(activeUndeadCount(), 2);

  // companionSlots reflects the 2 undead minions!
  assert.equal(companionsWithYou(), 2);
  const roster = companionRoster();
  assert.equal(roster.length, 2);
  assert.equal(roster[0].name, 'Rattles');
  assert.equal(roster[0].kind, 'undead');

  // Can still afford 1 skeleton (3 + 1 = 4 <= 4), but not another zombie (3 + 2 = 5 > 4)
  assert.equal(canAffordUndead(player, 'skeleton'), true);
  assert.equal(canAffordUndead(player, 'zombie'), false);

  // Remove a minion
  removeUndeadMinion('skel_1');
  assert.equal(activeUndeadCount(), 1);
  assert.equal(companionsWithYou(), 1);
});

// =========================================================================
// LICHDOM RACIAL OVERRIDE TESTS
// =========================================================================

test('Lichdom: applies racialOverride with full immunities and stat mods', () => {
  const player = {
    isPlayer: true,
    stats: { Intelligence: 50, Willpower: 50, Personality: 50 },
    skills: { [SKILLS.Mysticism]: 40, [SKILLS.Destruction]: 30, [SKILLS.Alteration]: 25 },
    activeEffects: [],
    racialOverride: null,
  };

  const entry = applyLichdom(player, { phylacteryId: 'urn_of_mannimarco' });
  assert.ok(entry);
  assert.equal(player.racialOverride?.racial, 'lichdom');
  assert.equal(isLich(player), true);

  // Immunities check
  assert.equal(entry.immuneParalysis, true);
  assert.equal(entry.immuneDisease, true);
  assert.equal(entry.immunePoison, true);
  assert.equal(entry.minMetalToHit, WEAPON_MATERIALS.Silver);

  // Live Stat checks through DFF's liveStat()
  assert.equal(liveStat(player, 'Intelligence'), 50 + 25);
  assert.equal(liveStat(player, 'Willpower'), 50 + 25);
  assert.equal(liveStat(player, 'Personality'), 50 - 30);

  // Live Skill checks through DFF's skillValue()
  assert.equal(skillValue(player, SKILLS.Mysticism), 40 + 30);
  assert.equal(skillValue(player, SKILLS.Destruction), 30 + 20);
  assert.equal(skillValue(player, SKILLS.Alteration), 25 + 20);
});

test('Lichdom: mutual exclusivity with existing curses and cure', () => {
  const werewolf = {
    racialOverride: { kind: 'racialOverride', racial: 'lycanthropy' },
    activeEffects: [],
  };

  // Cannot become a Lich if already transformed
  assert.equal(applyLichdom(werewolf), null);

  const mortal = { activeEffects: [], racialOverride: null };
  applyLichdom(mortal);
  assert.equal(isLich(mortal), true);

  // Cure Lichdom
  assert.equal(cureLichdom(mortal), true);
  assert.equal(isLich(mortal), false);
  assert.equal(mortal.racialOverride, null);
});

