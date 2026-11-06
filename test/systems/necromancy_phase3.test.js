// @ts-check
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getPlayerTaint,
  addNecroTaint,
  getTaintTier,
  tickTaintDaily,
  applyTaintDisposition,
  TAINT_TIERS,
  _resetTaintForTests,
} from '../../src/systems/necromancy/necroTaint.js';

import {
  checkWitchHunterAmbush,
  generatePurifierParty,
  HUNTER_TYPES,
} from '../../src/systems/necromancy/witchHunters.js';

import {
  checkSettlementInfraction,
  HAMMERFELL_REGIONS,
} from '../../src/systems/necromancy/cityLaw.js';

import {
  spawnMinion,
  MINION_STANCES,
  _resetMinionControllerForTests,
} from '../../src/systems/necromancy/minionController.js';

import {
  applyLichdom,
  cureLichdom,
} from '../../src/systems/necromancy/lichdomStatus.js';

import { CRIMES } from '../../src/systems/crimes.js';
import { WEAPON_MATERIALS } from '../../src/characters/weapons.js';

beforeEach(() => {
  _resetTaintForTests();
  _resetMinionControllerForTests();
});

// =========================================================================
// NECROMANTIC TAINT TESTS
// =========================================================================

test('NecroTaint: accumulation, tiers, and decay', () => {
  const mortal = { activeEffects: [], racialOverride: null };

  assert.equal(getPlayerTaint(mortal), 0);
  assert.equal(getTaintTier(mortal), TAINT_TIERS.PRISTINE);

  addNecroTaint(30, mortal);
  assert.equal(getPlayerTaint(mortal), 30);
  assert.equal(getTaintTier(mortal), TAINT_TIERS.TAINTED);

  addNecroTaint(35, mortal); // Total 65
  assert.equal(getTaintTier(mortal), TAINT_TIERS.DEFILER);

  addNecroTaint(20, mortal); // Total 85
  assert.equal(getTaintTier(mortal), TAINT_TIERS.ABOMINATION);

  // Daily decay reduces taint for mortals
  tickTaintDaily(5, mortal);
  assert.equal(getPlayerTaint(mortal), 80);

  // Disposition penalty
  assert.equal(applyTaintDisposition(100, mortal), 50); // -50 for Abomination
});

test('NecroTaint: Lichdom locks taint at 100 without decay', () => {
  const lich = { activeEffects: [], racialOverride: null };
  applyLichdom(lich);

  assert.equal(getPlayerTaint(lich), 100);
  assert.equal(getTaintTier(lich), TAINT_TIERS.ABOMINATION);

  // Daily decay does nothing to a Lich
  tickTaintDaily(10, lich);
  assert.equal(getPlayerTaint(lich), 100);
});

// =========================================================================
// WITCH-HUNTERS & PURIFIERS
// =========================================================================

test('WitchHunters: party generation has silver equipment and anti-undead spells', () => {
  const party = generatePurifierParty(TAINT_TIERS.ABOMINATION);
  assert.equal(party.length, 3);
  assert.equal(party[0].type, HUNTER_TYPES.INQUISITOR);
  assert.equal(party[0].weaponMaterial, WEAPON_MATERIALS.Silver);
  assert.ok(party[0].spells.includes('Dispel Undead'));
});

test('WitchHunters: ambushes only trigger on tainted souls', () => {
  const innocent = { activeEffects: [] };
  assert.equal(checkWitchHunterAmbush(innocent, { rolls: () => 0.01 }).ambush, false);

  const defiler = { activeEffects: [] };
  addNecroTaint(60, defiler);

  // Force roll to trigger ambush
  const res = checkWitchHunterAmbush(defiler, { isResting: true, rolls: () => 0.01 });
  assert.equal(res.ambush, true);
  assert.ok(res.party.length > 0);
  assert.ok(res.message?.includes('Arkay'));
});

// =========================================================================
// CITY LAW & SOCIAL REACTIONS
// =========================================================================

test('CityLaw: visible undead minions cause criminal infraction', () => {
  const player = { activeEffects: [] };

  // No minions, inside town -> no crime
  const cleanRes = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(cleanRes.infraction, false);

  // Spawn visible minion
  const minion = spawnMinion({ type: 'zombie' });
  const crimeRes = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(crimeRes.infraction, true);
  assert.equal(crimeRes.crime, CRIMES.Criminal_Conspiracy);
  assert.equal(player.crimeCommitted, CRIMES.Criminal_Conspiracy);

  // Disguise minion by feigning death -> no alarm!
  minion.stance = MINION_STANCES.FEIGN_DEATH;
  const feignRes = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(feignRes.infraction, false);
});

test('CityLaw: revealed Lich triggers high treason, disguised Lich passes', () => {
  const player = { activeEffects: [] };
  applyLichdom(player);

  // Revealed Lich in town
  const openRes = checkSettlementInfraction(player, { isInsideSettlement: true, isDisguised: false, regionName: 'Wayrest' });
  assert.equal(openRes.infraction, true);
  assert.equal(openRes.crime, CRIMES.Treason);

  // Disguised with hood up
  const hoodRes = checkSettlementInfraction(player, { isInsideSettlement: true, isDisguised: true, regionName: 'Wayrest' });
  assert.equal(hoodRes.infraction, false);

  // In Hammerfell, offense is High Treason and immediately hostile
  const redguardRes = checkSettlementInfraction(player, { isInsideSettlement: true, isDisguised: false, regionName: 'Sentinel' });
  assert.equal(redguardRes.infraction, true);
  assert.equal(redguardRes.crime, CRIMES.High_Treason);
  assert.equal(redguardRes.isHostile, true);
  assert.ok(redguardRes.alertText?.includes('Tu\'whacca'));
});
