import test from 'node:test';
import assert from 'node:assert/strict';

import {
  massAnimateDeadSpell,
  castMassAnimateDead,
  calculateMassAnimateDeadRadius,
  isNonDisguiseNecroSpell,
} from '../../src/systems/necromancy/necromanticSpells.js';
import { registerCorpse, _resetCorpseRegistryForTests } from '../../src/systems/necromancy/corpseRegistry.js';
import { _resetMinionControllerForTests, dismissAllMinions, allSpawnedMinions } from '../../src/systems/necromancy/minionController.js';
import { _resetUndeadCapacityForTests, calculateUndeadCapacity } from '../../src/systems/necromancy/undeadCapacity.js';
import { NecroConfig, CORPSE_REQ_MODES, resetNecroConfig } from '../../src/systems/necromancy/necroConfig.js';
import { applyLichdom, applyAncientLichdom, isPlayerDisguised } from '../../src/systems/necromancy/lichdomStatus.js';
import { applySpell } from '../../src/systems/effects.js';
import { calculateCastCost } from '../../src/systems/spellcost.js';
import { SKILLS } from '../../src/systems/skills.js';
import { effectByKey, spellMakerGroups, spellMakerSubgroups } from '../../src/systems/spell/spellEffects.js';
import { allowedTargetsOf, TARGET_FLAGS_SELF, buildCustomSpell } from '../../src/systems/spell/spellMaker.js';
import { shownSpellName } from '../../src/systems/loot/loot.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';
import { playerEntity } from '../../src/characters/playerEntity.js';

function resetState() {
  _resetCorpseRegistryForTests();
  _resetMinionControllerForTests();
  _resetUndeadCapacityForTests();
  dismissAllMinions();
  resetNecroConfig();
}

function makeCaster(over = {}) {
  const skills = new Array(35).fill(30);
  skills[SKILLS.Mysticism] = over.mysticism ?? 100;
  return {
    isPlayer: true,
    level: over.level ?? 25,
    health: 200,
    maxHealth: 200,
    magicka: 1000,
    maxMagicka: 1000,
    stats: {
      intelligence: over.intelligence ?? 100,
      willpower: over.willpower ?? 50,
      Intelligence: over.intelligence ?? 100,
      Willpower: over.willpower ?? 50,
    },
    skills,
    masterSkills: true,
    masteredSkills: [SKILLS.Mysticism],
    activeEffects: [],
    items: over.items ?? [],
    position: over.position ?? [0, 0, 0],
    ...over,
  };
}

test('Mass Animate Dead: radius scales 0.1m/pt from Mysticism, clamps [2m, 30m], works past 100', () => {
  assert.equal(calculateMassAnimateDeadRadius(makeCaster({ mysticism: 0 })), 2);
  assert.equal(calculateMassAnimateDeadRadius(makeCaster({ mysticism: 10 })), 2);
  assert.equal(calculateMassAnimateDeadRadius(makeCaster({ mysticism: 20 })), 2);
  assert.equal(calculateMassAnimateDeadRadius(makeCaster({ mysticism: 50 })), 5);
  assert.equal(calculateMassAnimateDeadRadius(makeCaster({ mysticism: 100 })), 10);
  // Past 100: must NOT be compressed by effectiveSkill softcap (200 -> 20m, not 14m)
  assert.equal(calculateMassAnimateDeadRadius(makeCaster({ mysticism: 150 })), 15);
  assert.equal(calculateMassAnimateDeadRadius(makeCaster({ mysticism: 200 })), 20);
  // Archlich +60 Mysticism bonus on top of 200 -> 260 -> 26m
  const arch = makeCaster({ mysticism: 200 });
  applyAncientLichdom(arch, { nowMinutes: 100 });
  assert.equal(calculateMassAnimateDeadRadius(arch), 26);
  // Upper clamp 30m
  assert.equal(calculateMassAnimateDeadRadius(makeCaster({ mysticism: 300 })), 30);
  assert.equal(calculateMassAnimateDeadRadius(makeCaster({ mysticism: 350 })), 30);
});

test('Mass Animate Dead: mana cost is 250-300 SP at Mysticism 100 and scales past 100 online', () => {
  const caster100 = makeCaster({ mysticism: 100 });
  const sp = massAnimateDeadSpell();
  const cost100 = calculateCastCost(sp, caster100, { online: true, portMods: false });
  assert.ok(cost100.sp >= 250 && cost100.sp <= 300, `Expected 250..300 SP at Mysticism 100, got ${cost100.sp}`);

  const caster200 = makeCaster({ mysticism: 200 });
  const cost200 = calculateCastCost(sp, caster200, { online: true, portMods: false });
  assert.ok(cost200.sp < cost100.sp, 'Cost must continue decreasing past Mysticism 100');

  const craftedMin = buildCustomSpell({
    slots: [{ type: 56, subType: 255, settings: { chanceBase: 1, chanceMod: 1, chancePerLevel: 1, magnitudeBaseLow: 1, magnitudeBaseHigh: 1, magnitudeLevelBase: 1, magnitudeLevelHigh: 1, magnitudePerLevel: 1 } }],
    rangeType: 0,
    name: 'Cheap Mass Raise',
  });
  const minCost = calculateCastCost(craftedMin, caster100, { online: true, portMods: false });
  assert.ok(minCost.sp >= 200, `Minimum Spell Maker craft must still be expensive (>=200 SP), got ${minCost.sp}`);
});

test('Mass Animate Dead: Spell Maker registration, target flags, and Grimoire gating', () => {
  const row = effectByKey('56,255');
  assert.ok(row, '56,255 must exist in effect registry');
  assert.equal(row.craftable, true);
  assert.equal(row.duration, false);
  assert.equal(row.chance, true);
  assert.equal(row.magnitude, true);
  assert.equal(allowedTargetsOf(56, 255), TARGET_FLAGS_SELF);

  const uninitiated = { NecroGrimoireRead: false, necroGrimoireRead: false };
  assert.equal(spellMakerGroups(uninitiated).includes('Mass Animate Dead'), false);

  const initiated = { NecroGrimoireRead: true, necroGrimoireRead: true };
  assert.equal(spellMakerGroups(initiated).includes('Mass Animate Dead'), true);
  const subs = spellMakerSubgroups('Mass Animate Dead', initiated);
  assert.equal(subs.length, 1);
  assert.equal(subs[0].key, '56,255');
});

test('Mass Animate Dead: raises all corpses in Mysticism radius and leaves distant ones untouched', () => {
  resetState();
  // Mysticism 50 -> 5m radius; high INT/WIL so capacity >= 10
  const caster = makeCaster({ mysticism: 50, intelligence: 200, willpower: 40, level: 1 });
  const c1 = registerCorpse({ id: 'near_1', position: [1, 0, 0] });
  const c2 = registerCorpse({ id: 'near_2', position: [0, 0, 4.5] });
  const cFar = registerCorpse({ id: 'far_1', position: [6, 0, 0] }); // outside 5m

  const res = castMassAnimateDead(caster, null, { spellMagnitude: 5 });
  assert.equal(res.success, true);
  assert.equal(res.radius, 5);
  assert.equal(res.raisedCount, 2);
  assert.equal(c1.consumed, true);
  assert.equal(c2.consumed, true);
  assert.equal(cFar.consumed, false, 'Corpse outside 5m radius must remain untouched');
  assert.equal(allSpawnedMinions().length, 2);

  // Now bump Mysticism to 150 -> 15m radius; cFar at 6m should now be raised
  caster.skills[SKILLS.Mysticism] = 150;
  const res2 = castMassAnimateDead(caster, null, { spellMagnitude: 5 });
  assert.equal(res2.success, true);
  assert.equal(res2.radius, 15);
  assert.equal(res2.raisedCount, 1);
  assert.equal(cFar.consumed, true);
});

test('Mass Animate Dead: respects capacity and downgrades tier on remaining slots', () => {
  resetState();
  // INT 100 (5) + WIL 90 (3) + Myst 50 (2) = 10 capacity
  // Score = WIL 90 + Mag 100 = 190 -> Lich (cost 8). Remaining = 2 -> Zombie (cost 2). 3rd corpse untouched.
  const caster = makeCaster({ mysticism: 50, intelligence: 100, willpower: 90, level: 1 });
  assert.equal(calculateUndeadCapacity(caster), 10);

  const c1 = registerCorpse({ id: 'cap_1', position: [1, 0, 0] });
  const c2 = registerCorpse({ id: 'cap_2', position: [2, 0, 0] });
  const c3 = registerCorpse({ id: 'cap_3', position: [3, 0, 0] });

  const res = castMassAnimateDead(caster, null, { spellMagnitude: 100 });
  assert.equal(res.success, true);
  assert.equal(res.raisedCount, 2);
  assert.equal(res.stoppedByCapacity, true);
  assert.equal(res.raised[0].type, 'lich');
  assert.equal(res.raised[1].type, 'zombie');
  assert.equal(c1.consumed, true);
  assert.equal(c2.consumed, true);
  assert.equal(c3.consumed, false, '3rd corpse must remain unconsumed when capacity is full');
});

test('Mass Animate Dead: rolls chance per corpse and handles all-failed chance without breaking disguise', () => {
  resetState();
  const caster = makeCaster({ mysticism: 100, intelligence: 150, willpower: 50, level: 20 });
  applyLichdom(caster, { nowMinutes: 100 });
  applySpell({ element: 4, rangeType: 0, effects: [{ type: 54, subType: 255, durationBase: 20, durationMod: 0, durationPerLevel: 1 }] }, 25, caster, {}, () => 0.5, { entity: caster });
  assert.equal(isPlayerDisguised(caster), true);

  const c1 = registerCorpse({ id: 'ch_1', position: [1, 0, 0] });
  const c2 = registerCorpse({ id: 'ch_2', position: [2, 0, 0] });
  const c3 = registerCorpse({ id: 'ch_3', position: [3, 0, 0] });

  // All fail (chance 50, rolls return 0.9 -> 90 >= 50)
  const outFail = applySpell(massAnimateDeadSpell(), 1, caster, { say: () => {} }, () => 0.9, { entity: caster });
  assert.equal(outFail.massAnimateDead ?? 0, 0);
  assert.equal(outFail.chanceFailed, 3);
  assert.equal(c1.consumed, false);
  assert.equal(c2.consumed, false);
  assert.equal(c3.consumed, false);
  assert.equal(isPlayerDisguised(caster), true, 'All-failed chance must not break Mortal Disguise');

  // Mixed rolls: pass (0.1), fail (0.9), pass (0.2)
  const seq = [0.1, 0.9, 0.2];
  let idx = 0;
  const rolls = () => seq[idx++] ?? 0.1;
  const resMix = castMassAnimateDead(caster, null, { chance: 50, spellMagnitude: 5, rolls });
  assert.equal(resMix.success, true);
  assert.equal(resMix.raisedCount, 2);
  assert.equal(resMix.failedChanceCount, 1);
  assert.equal(c1.consumed, true);
  assert.equal(c2.consumed, false);
  assert.equal(c3.consumed, true);
  assert.equal(isPlayerDisguised(caster), false, 'Successful Mass Animate Dead must break Mortal Disguise');
});

test('Mass Animate Dead: consumes upgrade reagents across corpses until exhausted', () => {
  resetState();
  // WIL 50 + Mag 5 = 55 -> Zombie base; Ectoplasm (39) upgrades Zombie -> Ghost
  const caster = makeCaster({
    mysticism: 100,
    intelligence: 200,
    willpower: 50,
    items: [{ templateIndex: 39, name: 'Ectoplasm', stackCount: 1 }],
  });
  registerCorpse({ id: 'reag_1', position: [1, 0, 0] });
  registerCorpse({ id: 'reag_2', position: [2, 0, 0] });

  const res = castMassAnimateDead(caster, null, { spellMagnitude: 5 });
  assert.equal(res.success, true);
  assert.equal(res.raisedCount, 2);
  assert.equal(res.raised[0].type, 'ghost');
  assert.equal(res.raised[1].type, 'zombie');
  assert.equal(caster.items.length, 0);
});

test('Mass Animate Dead: Abstract mode conjures skeletons up to capacity when no corpses exist', () => {
  resetState();
  NecroConfig.corpseRequirement = CORPSE_REQ_MODES.ABSTRACT;
  // INT 60 (3) + WIL 60 (2) + Myst 50 (2) = 7 capacity
  const caster = makeCaster({ mysticism: 50, intelligence: 60, willpower: 60 });
  assert.equal(calculateUndeadCapacity(caster), 7);

  // Finite loop even when chance fails
  const failRes = castMassAnimateDead(caster, null, { chance: 50, rolls: () => 0.9 });
  assert.equal(failRes.success, false);
  assert.equal(failRes.raisedCount, 0);
  assert.equal(failRes.failedChanceCount, 7);

  // Success fills all 7 slots with skeletons
  const okRes = castMassAnimateDead(caster, null, { chance: 100 });
  assert.equal(okRes.success, true);
  assert.equal(okRes.raisedCount, 7);
  assert.ok(okRes.raised.every((m) => m.type === 'skeleton'));
});

test('Mass Animate Dead: isNonDisguiseNecroSpell, shownSpellName, and console addspell', () => {
  const sp = massAnimateDeadSpell();
  assert.equal(isNonDisguiseNecroSpell(sp), true);
  assert.equal(shownSpellName(sp), 'Mass Animate Dead');

  playerEntity.spells = [];
  const cmd = getConsoleCommand('addspell');
  assert.ok(cmd);
  const out = cmd.callback(['mass_animate_dead']);
  assert.ok(out.includes('Mass Animate Dead'));
  assert.ok(playerEntity.spells.some((s) => s.name === 'Mass Animate Dead'));

  playerEntity.spells = [];
  cmd.callback(['all_necro']);
  assert.ok(playerEntity.spells.some((s) => s.name === 'Mass Animate Dead'));
});
