// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mobTraitChance,
  isUndeadMinion,
  maybeApplyMobTraits,
  bossTraitsOf,
  BOSS_TRAITS,
} from '../../src/systems/bossTraits.js';
import {
  LivingTamrielConfig,
  PRESENCE,
  resetLivingConfig,
} from '../../src/systems/living/livingConfig.js';
import { executeLivingConsoleCommand } from '../../src/systems/living/livingWorldSpawner.js';

test('LT-MOB-TRAITS: 4-tier presence calculation and player level scaling', () => {
  // Tier 0 (OFF): always 0% chance regardless of level
  assert.equal(mobTraitChance(PRESENCE.OFF, 1), 0);
  assert.equal(mobTraitChance(PRESENCE.OFF, 20), 0);
  assert.equal(mobTraitChance(PRESENCE.OFF, 50), 0);

  // Tier 1 (LIGHT): 8% base, +0.5% per level, capped at 25%
  assert.equal(mobTraitChance(PRESENCE.LIGHT, 1), 0.08);
  assert.equal(mobTraitChance(PRESENCE.LIGHT, 10), 0.125);
  assert.equal(mobTraitChance(PRESENCE.LIGHT, 20), 0.175);
  assert.equal(mobTraitChance(PRESENCE.LIGHT, 50), 0.25); // cap

  // Tier 2 (MID): 16% base, +1.0% per level, capped at 50%
  assert.equal(mobTraitChance(PRESENCE.MID, 1), 0.16);
  assert.equal(mobTraitChance(PRESENCE.MID, 10), 0.25);
  assert.equal(mobTraitChance(PRESENCE.MID, 25), 0.40);
  assert.equal(mobTraitChance(PRESENCE.MID, 50), 0.50); // cap

  // Tier 3 (HIGH): 30% base, +1.5% per level, capped at 75%
  assert.equal(mobTraitChance(PRESENCE.HIGH, 1), 0.30);
  assert.equal(mobTraitChance(PRESENCE.HIGH, 10), 0.435);
  assert.equal(mobTraitChance(PRESENCE.HIGH, 20), 0.585);
  assert.equal(mobTraitChance(PRESENCE.HIGH, 50), 0.75); // cap
});

test('LT-MOB-TRAITS: Necromancy summons and allies are strictly excluded from mob traits', () => {
  const minionCases = [
    { name: 'Raised Skeleton', livingRole: 'undead_minion', health: 50, maxHealth: 50 },
    { name: 'Zombie Minion', team: 'PlayerAlly', health: 80, maxHealth: 80 },
    { name: 'Ghost Minion', mobileTeam: 'PlayerAlly', health: 40, maxHealth: 40 },
    { name: 'Controlled Lich', controlledUndead: true, health: 200, maxHealth: 200 },
    { name: 'Summoned Cadaver', isMinion: true, health: 150, maxHealth: 150 },
    { name: 'Companion Undead', companion: 'undead_mummy', health: 120, maxHealth: 120 },
    { name: 'Allied Fighter', allied: true, health: 100, maxHealth: 100 },
  ];

  for (const c of minionCases) {
    assert.equal(isUndeadMinion(c), true, `${c.name} must be detected as an undead minion or ally`);
    // Attempt to apply traits with 100% success roll and HIGH presence
    const applied = maybeApplyMobTraits(c, {
      playerLevel: 30,
      tier: PRESENCE.HIGH,
      roll: () => 0.001,
    });
    assert.equal(applied, false, `${c.name} must never receive mob traits`);
    assert.equal(bossTraitsOf(c).length, 0, `${c.name} must have no boss traits`);
    assert.equal(c.bossTitle, undefined, `${c.name} must not receive a bossTitle`);
  }
});

test('LT-MOB-TRAITS: Regular mobs roll traits when active, and skip when tier is OFF', () => {
  resetLivingConfig();

  // 1. When tier is OFF, regular mobs get no traits
  LivingTamrielConfig.mobTraits = PRESENCE.OFF;
  const mobOff = { name: 'Grizzly Bear', health: 80, maxHealth: 80 };
  const appliedOff = maybeApplyMobTraits(mobOff, {
    playerLevel: 25,
    roll: () => 0.001,
  });
  assert.equal(appliedOff, false);
  assert.equal(bossTraitsOf(mobOff).length, 0);

  // 2. When tier is MID and roll succeeds, regular mob gets traits
  LivingTamrielConfig.mobTraits = PRESENCE.MID;
  const mobMid = { name: 'Skeletal Warrior', health: 70, maxHealth: 70 };
  const appliedMid = maybeApplyMobTraits(mobMid, {
    playerLevel: 10,
    roll: () => 0.05, // 0.05 < 0.25 (MID chance at level 10)
  });
  assert.equal(appliedMid, true);
  const traits = bossTraitsOf(mobMid);
  assert.equal(traits.length >= 1, true);
  for (const t of traits) {
    assert.ok(BOSS_TRAITS.includes(t), `Trait ${t} must be a valid BOSS_TRAIT`);
  }
  assert.ok(typeof mobMid.bossTitle === 'string' && mobMid.bossTitle.length > 0);

  // 3. If roll is greater than chance, no traits applied
  const mobFail = { name: 'Giant Bat', health: 30, maxHealth: 30 };
  const appliedFail = maybeApplyMobTraits(mobFail, {
    playerLevel: 1,
    roll: () => 0.99,
  });
  assert.equal(appliedFail, false);
  assert.equal(bossTraitsOf(mobFail).length, 0);

  // 4. Puppets and already-traited entities are skipped
  const puppetMob = { name: 'Orc', health: 100, maxHealth: 100 };
  assert.equal(maybeApplyMobTraits(puppetMob, { puppet: true, roll: () => 0.001 }), false);

  const existingTraited = { name: 'Elite Orc', bossTraits: ['warded'], health: 100, maxHealth: 100 };
  assert.equal(maybeApplyMobTraits(existingTraited, { roll: () => 0.001 }), false);
});

test('LT-MOB-TRAITS: /living traits console command inspects and updates presence tier', () => {
  resetLivingConfig();

  const mockCtx = {
    regionIndex: 0,
    playerEntity: { level: 12 },
  };

  // Inspect current status
  const out1 = executeLivingConsoleCommand(['traits'], mockCtx);
  assert.ok(out1.includes('MID (2)'));
  assert.ok(out1.includes('Player Level: 12'));
  assert.ok(out1.includes('Spawn Chance: 27.0%')); // 16% + (12 - 1)*1% = 27%

  // Update tier to HIGH
  const out2 = executeLivingConsoleCommand(['traits', 'high'], mockCtx);
  assert.equal(LivingTamrielConfig.mobTraits, PRESENCE.HIGH);
  assert.ok(out2.includes('HIGH (3)'));
  assert.ok(out2.includes('Spawn Chance: 46.5%')); // 30% + (12 - 1)*1.5% = 46.5%

  // Update tier to OFF
  const out3 = executeLivingConsoleCommand(['traits', '0'], mockCtx);
  assert.equal(LivingTamrielConfig.mobTraits, PRESENCE.OFF);
  assert.ok(out3.includes('OFF (0)'));
  assert.ok(out3.includes('Spawn Chance: 0.0%'));

  resetLivingConfig();
});
