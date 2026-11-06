// @ts-check
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  animateDeadSpell,
  corpseExplosionSpell,
  lifeTapSpell,
  boneArmorSpell,
  castAnimateDead,
  castCorpseExplosion,
  castLifeTap,
  castBoneArmor,
  NECRO_SPELL_KEYS,
} from '../../src/systems/necromancy/necromanticSpells.js';

import {
  spawnMinion,
  getSpawnedMinion,
  allSpawnedMinions,
  setMinionStance,
  setAllMinionsStance,
  orderRecall,
  detonateMinion,
  checkMinionRebellion,
  MINION_STANCES,
  _resetMinionControllerForTests,
} from '../../src/systems/necromancy/minionController.js';

import {
  createPhylactery,
  validateRitualPrerequisites,
  performRitualOfUnlife,
  handleLichMortalFall,
  PHYLACTERY_STATE,
} from '../../src/systems/necromancy/lichdomRitual.js';

import {
  registerCorpse,
  getCorpse,
  CORPSE_STATE,
  _resetCorpseRegistryForTests,
} from '../../src/systems/necromancy/corpseRegistry.js';

import {
  _resetUndeadCapacityForTests,
  activeUndeadCount,
  usedUndeadPoints,
} from '../../src/systems/necromancy/undeadCapacity.js';

import { EFFECT_COST_TABLE } from '../../src/systems/spellcost.js';
import { allowedTargetsOf, TARGET_FLAGS_SELF, TARGET_FLAGS_OTHER } from '../../src/systems/spell/spellMaker.js';
import { SKILLS } from '../../src/systems/skills.js';
import { isLich } from '../../src/systems/necromancy/lichdomStatus.js';

beforeEach(() => {
  _resetCorpseRegistryForTests();
  _resetUndeadCapacityForTests();
  _resetMinionControllerForTests();
});

// =========================================================================
// SPELL DEFINITIONS & SPELLMAKER INTEGRATION
// =========================================================================

test('NecroSpells: builders generate valid SPELLS.STD records', () => {
  const anim = animateDeadSpell();
  assert.equal(anim.name, 'Animate Dead');
  assert.equal(anim.effects[0].type, 47);

  const exp = corpseExplosionSpell();
  assert.equal(exp.name, 'Corpse Explosion');
  assert.equal(exp.effects[0].type, 48);

  const tap = lifeTapSpell();
  assert.equal(tap.name, 'Life Tap');
  assert.equal(tap.effects[0].type, 49);

  const bone = boneArmorSpell();
  assert.equal(bone.name, 'Bone Armor');
  assert.equal(bone.effects[0].type, 51);
});

test('NecroSpells: registered in EFFECT_COST_TABLE under correct schools', () => {
  assert.equal(EFFECT_COST_TABLE[NECRO_SPELL_KEYS.ANIMATE_DEAD]?.skill, SKILLS.Mysticism);
  assert.equal(EFFECT_COST_TABLE[NECRO_SPELL_KEYS.CORPSE_EXPLOSION]?.skill, SKILLS.Destruction);
  assert.equal(EFFECT_COST_TABLE[NECRO_SPELL_KEYS.LIFE_TAP]?.skill, SKILLS.Restoration);
  assert.equal(EFFECT_COST_TABLE[NECRO_SPELL_KEYS.BONE_ARMOR]?.skill, SKILLS.Alteration);
});

test('NecroSpells: allowedTargets classified correctly in SpellMaker', () => {
  assert.equal(allowedTargetsOf(51, 255), TARGET_FLAGS_SELF); // Bone Armor is Self-only
  assert.equal(allowedTargetsOf(47, 255), TARGET_FLAGS_OTHER); // Animate Dead is Target/Touch
  assert.equal(allowedTargetsOf(48, 255), TARGET_FLAGS_OTHER); // Corpse Explosion is Target/Area
  assert.equal(allowedTargetsOf(49, 255), TARGET_FLAGS_OTHER); // Life Tap is Target
});

// =========================================================================
// SPELL CASTING LOGIC
// =========================================================================

test('NecroSpells: castAnimateDead raises skeleton from skeletal remains', () => {
  const caster = {
    stats: { Intelligence: 70, Willpower: 60 },
    skills: { [SKILLS.Mysticism]: 50 },
    activeEffects: [],
  };

  const corpse = registerCorpse({
    deathTimestamp: 0,
    entityName: 'Dead Bandit',
    position: [5, 0, 5],
  });
  corpse.corpseState = CORPSE_STATE.SKELETAL;

  const result = castAnimateDead(caster, corpse);
  assert.equal(result.success, true);
  assert.equal(result.minion?.type, 'skeleton');
  assert.deepEqual(result.minion?.position, [5, 0, 5]);

  // Corpse consumed
  assert.equal(getCorpse(corpse.id), null);
  assert.equal(activeUndeadCount(), 1);
});

test('NecroSpells: castCorpseExplosion damages enemies in radius', () => {
  const corpse = registerCorpse({
    position: [0, 0, 0],
    entityName: 'Fallen Guard',
  });

  const caster = {
    skills: { [SKILLS.Destruction]: 50 },
  };

  const foeNear = { feet: [2, 0, 0], health: 100, dead: false };
  const foeFar = { feet: [15, 0, 0], health: 100, dead: false };

  const res = castCorpseExplosion(caster, corpse, { radius: 6, baseDamage: 40, nearbyFoes: [foeNear, foeFar] });
  assert.equal(res.success, true);
  assert.equal(res.hitCount, 1);
  assert.ok(foeNear.health < 100);
  assert.equal(foeFar.health, 100); // Out of blast radius

  // Corpse consumed
  assert.equal(getCorpse(corpse.id), null);
});

test('NecroSpells: castLifeTap siphons target HP to caster', () => {
  const caster = {
    currentHealth: 50,
    maxHealth: 100,
  };
  const foe = {
    health: 60,
    dead: false,
  };

  const res = castLifeTap(caster, foe, 30);
  assert.equal(res.success, true);
  assert.equal(res.drained, 30);
  assert.equal(foe.health, 30);
  assert.equal(caster.currentHealth, 80);
});

test('NecroSpells: castBoneArmor applies shield buff to caster', () => {
  const caster = {
    activeEffects: [],
  };

  const res = castBoneArmor(caster, 12, 60);
  assert.equal(res.success, true);
  assert.equal(res.shieldRemaining, 60);
  assert.equal(res.roundsRemaining, 12);
  assert.equal(caster.activeEffects.length, 1);
  assert.equal(caster.activeEffects[0].kind, 'boneArmor');
});

// =========================================================================
// MINION CONTROLLER & TACTICAL COMMANDS
// =========================================================================

test('MinionController: spawns minion and updates stance', () => {
  const minion = spawnMinion({
    type: 'zombie',
    position: [10, 0, 10],
  });

  assert.ok(minion);
  assert.equal(minion.type, 'zombie');
  assert.equal(minion.stance, MINION_STANCES.FOLLOW);

  assert.equal(setMinionStance(minion.id, MINION_STANCES.GUARD), true);
  assert.equal(minion.stance, MINION_STANCES.GUARD);

  setAllMinionsStance(MINION_STANCES.FEIGN_DEATH);
  assert.equal(minion.stance, MINION_STANCES.FEIGN_DEATH);
});

test('MinionController: orderRecall moves minions to master (Shadow Tether)', () => {
  const m1 = spawnMinion({ type: 'skeleton', position: [100, 0, 100] });
  const m2 = spawnMinion({ type: 'zombie', position: [-50, 0, 50] });

  const recalled = orderRecall([0, 0, 0], 2.0);
  assert.equal(recalled, 2);

  // Minions should now be within 3m of master
  const dist1 = Math.hypot(m1.position[0], m1.position[2]);
  const dist2 = Math.hypot(m2.position[0], m2.position[2]);
  assert.ok(dist1 <= 3.0);
  assert.ok(dist2 <= 3.0);
});

test('MinionController: detonateMinion sacrifices minion for area damage', () => {
  const minion = spawnMinion({ type: 'skeleton', position: [0, 0, 0] });
  const enemy = { feet: [2, 0, 0], health: 80, dead: false };

  const res = detonateMinion(minion.id, { radius: 5, damage: 50, nearbyFoes: [enemy] });
  assert.equal(res.success, true);
  assert.equal(res.hitCount, 1);
  assert.equal(enemy.health, 30);
  assert.equal(minion.dead, true);
  assert.equal(getSpawnedMinion(minion.id), null);
});

test('MinionController: checkMinionRebellion breaks leash on exhaustion', () => {
  const player = {
    currentFatigue: 0, // Exhausted!
    currentMagicka: 0,
    stats: { Willpower: 30 }, // Low willpower
    activeEffects: [],
  };

  const m1 = spawnMinion({ type: 'mummy', position: [0, 0, 0] }); // 4 slots
  const m2 = spawnMinion({ type: 'mummy', position: [0, 0, 0] }); // 4 slots -> total 8 slots > 2 safe

  // Force roll to trigger rebellion
  const rebelled = checkMinionRebellion(player, m1, { rolls: () => 0.01 });
  assert.equal(rebelled, true);
  assert.equal(m1.rebelled, true);
  assert.equal(m1.stance, MINION_STANCES.ATTACK);
});

// =========================================================================
// LICHDOM RITUAL & PHYLACTERY
// =========================================================================

test('LichdomRitual: prerequisites check and transformation', () => {
  const phylactery = createPhylactery({ anchorPosition: [100, 10, 200] });
  assert.equal(phylactery.state, PHYLACTERY_STATE.UNBOUND);

  // Underleveled player fails
  const weakPlayer = { level: 2, skills: { [SKILLS.Mysticism]: 20 }, activeEffects: [] };
  const checkFail = validateRitualPrerequisites(weakPlayer, phylactery);
  assert.equal(checkFail.valid, false);

  // Qualified player succeeds
  const archmage = {
    isPlayer: true,
    level: 10,
    skills: { [SKILLS.Mysticism]: 65 },
    stats: { Intelligence: 75, Willpower: 70, Personality: 50 },
    activeEffects: [],
    racialOverride: null,
  };

  const res = performRitualOfUnlife(archmage, phylactery, { nowMinutes: 5000 });
  assert.equal(res.success, true);
  assert.equal(phylactery.state, PHYLACTERY_STATE.BOUND);
  assert.equal(isLich(archmage), true);

  // Reconstitution test: mortal fall retreats soul to phylactery anchor
  archmage.currentHealth = 0;
  archmage.maxHealth = 120;
  const fallRes = handleLichMortalFall(archmage, phylactery);
  assert.equal(fallRes.reconstituted, true);
  assert.deepEqual(fallRes.respawnPosition, [100, 10, 200]);
  assert.equal(archmage.currentHealth, 60); // Restored to 50% max HP
  assert.equal(phylactery.charges, 2); // 1 charge consumed
});
