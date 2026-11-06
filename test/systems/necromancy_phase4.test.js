// @ts-check
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  NecroConfig,
  resetNecroConfig,
  CORPSE_REQ_MODES,
  SOCIAL_LAW_MODES,
  WITCH_HUNTER_MODES,
  CAP_MODES,
} from '../../src/systems/necromancy/necroConfig.js';

import {
  calculateUndeadCapacity,
  canAffordUndead,
  _resetUndeadCapacityForTests,
} from '../../src/systems/necromancy/undeadCapacity.js';

import {
  checkSettlementInfraction,
} from '../../src/systems/necromancy/cityLaw.js';

import {
  checkWitchHunterAmbush,
} from '../../src/systems/necromancy/witchHunters.js';

import {
  spawnMinion,
  checkMinionRebellion,
  _resetMinionControllerForTests,
} from '../../src/systems/necromancy/minionController.js';

import {
  castAnimateDead,
} from '../../src/systems/necromancy/necromanticSpells.js';

import { applyLichdom } from '../../src/systems/necromancy/lichdomStatus.js';
import { addNecroTaint, _resetTaintForTests } from '../../src/systems/necromancy/necroTaint.js';
import { _resetCorpseRegistryForTests } from '../../src/systems/necromancy/corpseRegistry.js';

beforeEach(() => {
  resetNecroConfig();
  _resetUndeadCapacityForTests();
  _resetMinionControllerForTests();
  _resetTaintForTests();
  _resetCorpseRegistryForTests();
});

test('NecroConfig: defaults and pref modification', () => {
  assert.equal(NecroConfig.enabled, true);
  assert.equal(NecroConfig.corpseRequirement, CORPSE_REQ_MODES.PHYSICAL);
  assert.equal(NecroConfig.socialLaw, SOCIAL_LAW_MODES.HARDCORE);
  assert.equal(NecroConfig.minionRebellion, true);
  assert.equal(NecroConfig.witchHunterFrequency, WITCH_HUNTER_MODES.FREQUENT);
  assert.equal(NecroConfig.capMode, CAP_MODES.STAT_SCALED);
  assert.equal(NecroConfig.fixedCap, 4);

  // Modify values
  NecroConfig.socialLaw = SOCIAL_LAW_MODES.OFF;
  assert.equal(NecroConfig.socialLaw, SOCIAL_LAW_MODES.OFF);

  NecroConfig.fixedCap = 8;
  assert.equal(NecroConfig.fixedCap, 8);

  // Reset restores defaults
  resetNecroConfig();
  assert.equal(NecroConfig.socialLaw, SOCIAL_LAW_MODES.HARDCORE);
  assert.equal(NecroConfig.fixedCap, 4);
});

test('NecroConfig: Fixed Cap Mode bypasses stats math', () => {
  const weakling = {
    stats: { Intelligence: 20, Willpower: 20 },
    skills: {},
    activeEffects: [],
  };

  // In stat scaled, cap is low
  assert.equal(calculateUndeadCapacity(weakling), 1);

  // Switch to fixed cap
  NecroConfig.capMode = CAP_MODES.FIXED;
  NecroConfig.fixedCap = 6;
  assert.equal(calculateUndeadCapacity(weakling), 6);
  assert.equal(canAffordUndead(weakling, 'mummy'), true); // Mummy costs 4 <= 6
});

test('NecroConfig: Social Law OFF suppresses all guard reactions and crimes', () => {
  const player = { activeEffects: [] };
  applyLichdom(player);
  spawnMinion({ type: 'zombie' });

  // With default Hardcore, triggers crime
  assert.equal(checkSettlementInfraction(player, { regionName: 'Sentinel' }).infraction, true);

  // Turn off social law
  NecroConfig.socialLaw = SOCIAL_LAW_MODES.OFF;
  assert.equal(checkSettlementInfraction(player, { regionName: 'Sentinel' }).infraction, false);
});

test('NecroConfig: Witch Hunter OFF prevents all ambushes', () => {
  const defiler = { activeEffects: [] };
  addNecroTaint(100, defiler);

  NecroConfig.witchHunterFrequency = WITCH_HUNTER_MODES.OFF;
  const res = checkWitchHunterAmbush(defiler, { isResting: true, rolls: () => 0.001 });
  assert.equal(res.ambush, false);
});

test('NecroConfig: Minion Rebellion toggle prevents leash breaks', () => {
  const exhaustedPlayer = {
    currentFatigue: 0,
    currentMagicka: 0,
    stats: { Willpower: 20 },
    activeEffects: [],
  };

  const m1 = spawnMinion({ type: 'lich' }); // 8 slots > safe limit

  // With rebellion OFF
  NecroConfig.minionRebellion = false;
  assert.equal(checkMinionRebellion(exhaustedPlayer, m1, { rolls: () => 0.001 }), false);
});

test('NecroConfig: Abstract Corpse Mode allows conjuring without corpse', () => {
  const caster = {
    stats: { Intelligence: 60, Willpower: 60 },
    skills: {},
    activeEffects: [],
  };

  // In physical mode, null corpse fails
  assert.equal(castAnimateDead(caster, null).success, false);

  // In abstract mode, raises directly from thin air
  NecroConfig.corpseRequirement = CORPSE_REQ_MODES.ABSTRACT;
  const res = castAnimateDead(caster, null);
  assert.equal(res.success, true);
  assert.equal(res.minion?.type, 'skeleton');
});
