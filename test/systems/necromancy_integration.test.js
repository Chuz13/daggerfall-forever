// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raiseEnemyDeath, openCorpseLoot } from '../../src/scenes/corpseMarker.js';
import { getCorpse, corpsesNear, registerCorpse, canHarvestCorpseWithInventory, harvestAllFromCorpse, _resetCorpseRegistryForTests } from '../../src/systems/necromancy/corpseRegistry.js';
import { applySpell } from '../../src/systems/effects.js';
import { activeUndead, _resetUndeadCapacityForTests, undeadParty } from '../../src/systems/necromancy/undeadCapacity.js';
import { checkCityLawViolation } from '../../src/systems/necromancy/cityLaw.js';
import { isLich, isAncientLich, isAnyLich, applyLichdom, applyAncientLichdom, cureLichdom, cureAncientLichdom } from '../../src/systems/necromancy/lichdomStatus.js';
import { blowTaken } from '../../src/systems/blowTaken.js';
import { survivalCtx } from '../../src/systems/survival/env.js';
import { feltTemperature, resistTemperature } from '../../src/systems/survival/temperature.js';
import { survivalHudChips } from '../../src/systems/survival/status.js';
import { createPhylactery, performRitualOfUnlife, reconstituteLich, drinkElixirOfUnlife, PHYLACTERY_STATE } from '../../src/systems/necromancy/lichdomRitual.js';
import { castAnimateDead, castCorpseExplosion, castBoneArmor } from '../../src/systems/necromancy/necromanticSpells.js';
import { spawnMinion } from '../../src/systems/necromancy/minionController.js';
import { mixCauldron, ELIXIR_OF_UNLIFE_RECIPE, ELIXIR_OF_UNLIFE_KEY } from '../../src/systems/potions.js';
import { hurtPlayer, playerEntity } from '../../src/characters/playerEntity.js';
import { tickPlayerMinutes, setNecroRestManaLock } from '../../src/systems/worldTick.js';
import { executeConsoleLine } from '../../src/systems/consoleCommands.js';
import { NecroConfig } from '../../src/systems/necromancy/necroConfig.js';
import { CRIMES } from '../../src/systems/crimes.js';

test('NecroIntegration: raiseEnemyDeath automatically populates corpseRegistry', () => {
  _resetCorpseRegistryForTests();

  const fakeEnemy = {
    id: 'orc_warlord_101',
    mobileType: 140,
    level: 7,
    feet: [10, 0, 20],
    items: [{ shortName: 'Orcish Mace', value: 150 }],
  };

  raiseEnemyDeath(fakeEnemy, { feet: [10, 0, 20] });

  const found = corpsesNear([10, 0, 20], 5);
  assert.equal(found.length, 1, 'Corpse must be registered near the death coordinates');
  assert.equal(found[0].id, 'orc_warlord_101');
  assert.equal(found[0].level, 7);
});

test('NecroIntegration: applySpell executes Animate Dead in the live spell engine', () => {
  _resetCorpseRegistryForTests();
  _resetUndeadCapacityForTests();

  // Register a fallen foe to reanimate
  raiseEnemyDeath({ id: 'fallen_skeletal_1', mobileType: 140, feet: [5, 0, 5] });

  const animateSpell = {
    element: 4, // Magic
    rangeType: 1, // Target
    effects: [
      {
        type: 47,
        subType: 255,
        durationBase: 10,
        durationMod: 1,
        durationPerLevel: 1,
        magnitudeBaseLow: 10,
        magnitudeBaseHigh: 10,
        magnitudeLevelBase: 1,
        magnitudeLevelHigh: 1,
        magnitudePerLevel: 1,
        chanceBase: 100,
        chanceMod: 0,
        chancePerLevel: 1,
      },
    ],
  };

  const fakeCaster = {
    entity: {
      isPlayer: true,
      stats: { intelligence: 70, willpower: 60 },
      skills: new Array(35).fill(50),
    },
    sinks: {
      say: () => {},
    },
  };

  const targetPoint = { pos: [5, 0, 5], feet: [5, 0, 5] };
  const sinks = { hurt: () => {}, say: () => {} };

  const res = applySpell(animateSpell, 10, targetPoint, sinks, () => 0.5, fakeCaster);
  assert.equal(res.animateDead, 1, 'Spell engine must record animateDead application');

  const minions = activeUndead();
  assert.ok(minions.length >= 1, 'Minion must be instantiated in undeadCapacity');
});

test('NecroIntegration: applySpell executes Corpse Explosion and damages targets', () => {
  _resetCorpseRegistryForTests();

  // Create a corpse in explosion range
  raiseEnemyDeath({ id: 'explodable_corpse_1', mobileType: 140, feet: [0, 0, 0] });

  const explosionSpell = {
    element: 2, // DiseaseOrPoison
    rangeType: 1, // Target
    effects: [
      {
        type: 48,
        subType: 255,
        durationBase: 0,
        durationMod: 0,
        durationPerLevel: 1,
        magnitudeBaseLow: 25,
        magnitudeBaseHigh: 25,
        magnitudeLevelBase: 0,
        magnitudeLevelHigh: 0,
        magnitudePerLevel: 1,
        chanceBase: 100,
        chanceMod: 0,
        chancePerLevel: 1,
      },
    ],
  };

  let hurtDamage = 0;
  const sinks = {
    hurt: (dmg) => { hurtDamage += dmg; },
    say: () => {},
  };

  const targetEnemy = { pos: [0, 0, 0], feet: [0, 0, 0], health: 50 };
  const res = applySpell(explosionSpell, 5, targetEnemy, sinks, () => 0.5, null);

  assert.equal(res.corpseExplosion, 1, 'Corpse explosion must execute');
  assert.ok(hurtDamage > 0, 'Target must receive explosion damage');
});

test('NecroIntegration: applySpell with Corpse Explosion fizzles and deals 0 damage without corpse within 2m', () => {
  _resetCorpseRegistryForTests();

  // Corpse is far away at 10m
  raiseEnemyDeath({ id: 'far_corpse_1', mobileType: 140, feet: [10, 0, 0] });

  const explosionSpell = {
    element: 2, // DiseaseOrPoison
    rangeType: 1, // Target
    effects: [
      {
        type: 48,
        subType: 255,
        durationBase: 0,
        durationMod: 0,
        durationPerLevel: 1,
        chanceBase: 100,
        chanceMod: 0,
        chancePerLevel: 1,
        magnitudeBaseLow: 25,
        magnitudeBaseHigh: 25,
        magnitudeLevelBase: 0,
        magnitudeLevelHigh: 0,
        magnitudePerLevel: 1,
        chanceBase: 100,
        chanceMod: 0,
        chancePerLevel: 1,
      },
    ],
  };

  let hurtDamage = 0;
  const sinks = {
    hurt: (dmg) => { hurtDamage += dmg; },
    say: () => {},
  };

  const targetEnemy = { pos: [0, 0, 0], feet: [0, 0, 0], health: 50 };
  const res = applySpell(explosionSpell, 5, targetEnemy, sinks, () => 0.5, null);

  assert.equal(res.corpseExplosion ?? 0, 0, 'Corpse explosion must not execute');
  assert.equal(hurtDamage, 0, 'Target must receive zero damage when no corpse is in 2m');
});

test('NecroIntegration: undeadParty bridges minions to crewAshore', () => {
  _resetUndeadCapacityForTests();

  const partyList = undeadParty.party;
  assert.ok(Array.isArray(partyList));

  // Add minion directly to active list
  activeUndead();
  assert.equal(typeof undeadParty.knock, 'function');
  assert.equal(typeof undeadParty.hurt, 'function');
});

test('NecroIntegration: tickPlayerMinutes drains magicka for active minions', () => {
  _resetUndeadCapacityForTests();

  NecroConfig.enabled = true;
  NecroConfig.minionUpkeep = true;

  // Add a minion to capacity
  raiseEnemyDeath({ id: 'tick_corpse', mobileType: 140, feet: [0, 0, 0] });
  applySpell({
    element: 4, rangeType: 1,
    effects: [{
      type: 47,
      subType: 255,
      durationBase: 10,
      durationMod: 1,
      durationPerLevel: 1,
      magnitudeBaseLow: 10,
      magnitudeBaseHigh: 10,
      magnitudeLevelBase: 1,
      magnitudeLevelHigh: 1,
      magnitudePerLevel: 1,
      chanceBase: 100,
      chanceMod: 0,
      chancePerLevel: 1,
    }],
  }, 10, { pos: [0, 0, 0], feet: [0, 0, 0] }, { hurt: () => {}, say: () => {} }, () => 0.5, {
    entity: { isPlayer: true, stats: { intelligence: 60, willpower: 60 }, skills: new Array(35).fill(50) },
  });

  const testPlayer = {
    isPlayer: true,
    magicka: 50,
    maxMagicka: 50,
    health: 100,
    maxHealth: 100,
    fatigue: 1000,
    maxFatigue: 1000,
    lastGameMinutes: 0,
    skills: new Array(35).fill(50),
    stats: { intelligence: 60, willpower: 60, endurance: 50, strength: 50, agility: 50, speed: 50, personality: 50, luck: 50 },
    effects: [],
  };

  let drained = 0;
  tickPlayerMinutes({
    entity: testPlayer,
    classicMinutes: 0,
    dt: 1,
    sinks: {
      drainMagicka: (amount) => { drained += amount; },
      drainFatigue: () => {},
      hurt: () => {},
      heal: () => {},
    },
  });

  assert.ok(drained > 0, 'tickPlayerMinutes must drain magicka for active minion upkeep');
});

test('NecroIntegration: cityLaw violation triggers guard alerts on unmasked Lich', () => {
  const lichPlayer = {
    isPlayer: true,
    racialOverride: 'lichdom',
    isHooded: false,
    crimeCommitted: 0,
  };

  let crimeAssigned = 0;
  let alertSpoken = null;

  const res = checkCityLawViolation({
    playerEntity: lichPlayer,
    isInsideSettlement: true,
    minions: [],
    isDisguised: false,
    crimeAlertSink: (msg) => { alertSpoken = msg; },
    crimeSeveritySink: (crime) => { crimeAssigned = crime; },
  });

  assert.equal(res.infraction, true);
  assert.equal(res.isHostile, true);
  assert.equal(crimeAssigned, CRIMES.Treason);
  assert.ok(alertSpoken != null);
});

test('NecroIntegration: hurtPlayer restores Lich at phylactery instead of dying', () => {
  const mortalLich = {
    isPlayer: true,
    racialOverride: null,
    health: 10,
    maxHealth: 100,
    level: 10,
    stats: { intelligence: 80, willpower: 80 },
    skills: new Array(35).fill(60),
    items: [],
  };

  // Perform ritual
  const phylactery = createPhylactery({ anchorPosition: [100, 50, 200] });
  const ritual = performRitualOfUnlife(mortalLich, phylactery);
  assert.equal(ritual.success, true);
  assert.equal(isLich(mortalLich), true);

  mortalLich.phylacteryAnchor = phylactery;

  // Fatal blow
  const died = hurtPlayer(mortalLich, 50);

  assert.equal(died, false, 'Lich must NOT die upon lethal blow');
  assert.equal(mortalLich.health, 100, 'Health must be fully restored by reconstitution');
});

test('NecroIntegration: harvesting requires dagger or skinning knife and mints reagents', () => {
  _resetCorpseRegistryForTests();
  const corpse = registerCorpse({ id: 'test_corpse_h1', entityType: 'humanoid', position: [0, 0, 0] });
  const unarmedPlayer = { items: [] };
  assert.equal(canHarvestCorpseWithInventory(unarmedPlayer), false);

  const knifePlayer = { items: [{ templateIndex: 603, group: 'UselessItems2' }] };
  assert.equal(canHarvestCorpseWithInventory(knifePlayer), true);

  const res = harvestAllFromCorpse(corpse, knifePlayer);
  assert.equal(res.success, true);
  assert.ok(res.itemsAdded.length >= 2, 'Should harvest multiple reagents into inventory');
});

test('NecroIntegration: Bone Armor consumes nearest skeleton for 3x maxHealth shield & Corpse Explosion deals 5x maxHealth to enemies only', () => {
  _resetCorpseRegistryForTests();
  _resetUndeadCapacityForTests();

  const caster = { isPlayer: true, stats: { intelligence: 100, willpower: 100 }, skills: new Array(35).fill(100), pos: [0, 0, 0] };
  const skel = spawnMinion({ masterEntity: caster, type: 'skeleton', position: [2, 0, 0] });
  assert.ok(skel, 'Skeleton minion spawned');

  const armorRes = castBoneArmor(caster, 25, 10);
  assert.equal(armorRes.success, true);
  assert.equal(armorRes.consumedSkeleton, true);
  assert.equal(armorRes.shieldRemaining, skel.maxHealth * 3, 'Bone Armor shield must equal 3x skeleton maxHealth');

  // Register a corpse with maxHealth = 80 within 2m radius and a friendly minion nearby
  registerCorpse({ id: 'corpse_80hp', maxHealth: 80, position: [1.5, 0, 0] });
  const zomb = spawnMinion({ masterEntity: caster, type: 'zombie', position: [1, 0, 0] });

  let enemyDamage = 0;
  let allyDamage = 0;
  const hostileEnemy = {
    id: 'enemy_1',
    pos: [4, 0, 0],
    isHostile: true,
    health: 500,
    hurt: (dmg) => { enemyDamage += dmg; },
  };
  const alliedMinionTarget = {
    id: zomb.id,
    pos: [1, 0, 0],
    allied: true,
    livingRole: 'undead_minion',
    health: 120,
    hurt: (dmg) => { allyDamage += dmg; },
  };

  const expRes = castCorpseExplosion({
    casterEntity: caster,
    originPosition: [0, 0, 0],
    nearbyFoes: [hostileEnemy, alliedMinionTarget],
  });

  assert.equal(expRes.success, true);
  assert.equal(expRes.sacrificedMinion, false, 'Must prioritize corpse over minion when untargeted');
  assert.equal(expRes.damage, 80 * 5, 'Corpse Explosion must deal 5x corpse maxHealth');
  assert.equal(enemyDamage, 400, 'Hostile enemy takes 5x maxHealth damage');
  assert.equal(allyDamage, 0, 'Allied minion takes zero friendly fire damage');
});

test('NecroIntegration: Rest Mana Lock pauses minion upkeep during rest and unblocks after', () => {
  _resetUndeadCapacityForTests();
  const caster = {
    isPlayer: true,
    magicka: 100,
    maxMagicka: 100,
    health: 100,
    maxHealth: 100,
    fatigue: 1000,
    maxFatigue: 1000,
    lastGameMinutes: 0,
    skills: new Array(35).fill(80),
    stats: { intelligence: 80, willpower: 80, endurance: 50, strength: 50, agility: 50, speed: 50, personality: 50, luck: 50 },
    effects: [],
  };
  spawnMinion({ masterEntity: caster, type: 'skeleton', position: [0, 0, 0] });

  setNecroRestManaLock(caster, true);
  let drainedWhileResting = 0;
  tickPlayerMinutes({
    entity: caster,
    classicMinutes: 10,
    dt: 1,
    sinks: { drainMagicka: (n) => { drainedWhileResting += n; }, drainFatigue: () => {}, hurt: () => {}, heal: () => {} },
  });
  assert.equal(drainedWhileResting, 0, 'No magicka drained for minions while resting');

  setNecroRestManaLock(caster, false);
  let drainedAfterRest = 0;
  tickPlayerMinutes({
    entity: caster,
    classicMinutes: 20,
    dt: 1,
    sinks: { drainMagicka: (n) => { drainedAfterRest += n; }, drainFatigue: () => {}, hurt: () => {}, heal: () => {} },
  });
  assert.ok(drainedAfterRest > 0, 'Magicka drain resumes once rest ends');
});

test('NecroIntegration: Elixir of Unlife cauldron recipe & Level 20 + Mysticism 100 requirement', () => {
  const mix = mixCauldron([53, 38, 45, 39]);
  assert.equal(mix.kind, 'mixed');
  assert.equal(mix.key, ELIXIR_OF_UNLIFE_KEY);
  assert.equal(mix.recipe.name, ELIXIR_OF_UNLIFE_RECIPE.name);

  const lowPlayer = { level: 10, skills: new Array(35).fill(50), health: 100, maxHealth: 100 };
  let poisonHurt = 0;
  const failDrink = drinkElixirOfUnlife(lowPlayer, { hurtPlayer: (n) => { poisonHurt += n; } });
  assert.equal(failDrink.success, false);
  assert.ok(poisonHurt > 0, 'Drinking Elixir below requirements inflicts lethal poison damage');

  const archmage = { level: 20, skills: new Array(35).fill(100), stats: { intelligence: 100, willpower: 100 }, NecroGrimoireRead: true, health: 100, maxHealth: 100, items: [] };
  const okDrink = drinkElixirOfUnlife(archmage, {});
  assert.equal(okDrink.success, true);
  assert.equal(isLich(archmage), true);
});

test('NecroIntegration: Wave 2 real-world corpse position via opts.feet, openCorpseLoot carving & 3D minion lifecycle', () => {
  _resetCorpseRegistryForTests();
  _resetUndeadCapacityForTests();

  // 1. Real enemy entity without .feet on entity, passed via opts.feet & opts.mobileType
  const realEnemyEntity = { id: 'dungeon_vamp_1', level: 10, maxHealth: 150, items: [] };
  raiseEnemyDeath(realEnemyEntity, { feet: [2400, 12, -1800], mobileType: 28 });

  const nearby = corpsesNear([2402, 12, -1801], 6);
  assert.equal(nearby.length, 1, 'Corpse must be registered at opts.feet [2400, 12, -1800], not [0, 0, 0]');
  assert.equal(nearby[0].entityType, 'undead');

  // 2. Harvesting corpse in world with a Dagger (113) carves necromantic remains into player's inventory
  const playerWithDagger = { items: [{ templateIndex: 113, name: 'Dagger' }], goldPieces: 0 };
  const harvestRes = harvestAllFromCorpse(nearby[0], playerWithDagger);
  assert.equal(harvestRes.success, true, 'Harvesting undead corpse with Dagger succeeds');
  assert.ok(playerWithDagger.items.length >= 2, 'Undead corpse harvested with Dagger in inventory yields necromantic reagents');

  // 3. castAnimateDead spawns 3D minion body via __sceneContext and castBoneArmor cleans it up
  const spawned3d = [];
  const killed3d = [];
  const prevCtx = globalThis.__sceneContext;
  globalThis.__sceneContext = {
    spawnUndeadMinion: (type, pos, name) => {
      const b = { type, pos, name, dead: false };
      spawned3d.push(b);
      return b;
    },
    killMinionBody: (b) => {
      killed3d.push(b);
    },
  };
  try {
    const skelCorpse = registerCorpse({
      id: 'skel_corpse_w2',
      entityType: 'humanoid',
      preferredType: 'skeleton',
      maxHealth: 80,
      position: [2400, 12, -1800],
    });
    const caster = { isPlayer: true, stats: { intelligence: 80, willpower: 80 }, skills: new Array(35).fill(80), activeEffects: [] };
    const animRes = castAnimateDead(caster, skelCorpse);
    assert.equal(animRes.success, true);
    assert.equal(spawned3d.length, 1, 'castAnimateDead must spawn 3D minion body in scene');
    assert.equal(animRes.minion.sceneBody, spawned3d[0]);

    const armorRes = castBoneArmor(caster, 15, 50);
    assert.equal(armorRes.consumedSkeleton, true);
    assert.equal(killed3d.length, 1, 'Absorbing skeleton into Bone Armor must remove its 3D scene body');
  } finally {
    globalThis.__sceneContext = prevCtx;
  }
});

test('NecroIntegration: Ancient Lich console command transforms and cures player', () => {
  // Ensure clean mortal baseline
  cureLichdom(playerEntity);
  cureAncientLichdom(playerEntity);
  assert.equal(isAncientLich(playerEntity), false);
  assert.equal(isLich(playerEntity), false);

  // 1. Transform via `ancient_lich` command
  const res1 = executeConsoleLine('ancient_lich');
  assert.ok(res1.includes('Ancient Lichdom transformation complete'));
  assert.equal(isAncientLich(playerEntity), true);
  assert.equal(playerEntity.racialOverride?.racial, 'ancient_lichdom');
  assert.equal(playerEntity.racialOverride?.raceNameOverride, 'Ancient Lich');

  // Status check in console
  const statusRes = executeConsoleLine('necro status');
  assert.ok(statusRes.includes('ACTIVE (Ancient Lich)'));

  // 2. Untransform via `ancient_lich off`
  const resOff = executeConsoleLine('ancient_lich off');
  assert.ok(resOff.includes('Ancient Lichdom stripped'));
  assert.equal(isAncientLich(playerEntity), false);
  assert.equal(playerEntity.racialOverride, null);

  // 3. Transform via `necro ancient_lich`
  const resNecro = executeConsoleLine('necro ancient_lich');
  assert.ok(resNecro.includes('Ancient Lichdom transformation complete'));
  assert.equal(isAncientLich(playerEntity), true);

  // 4. Toggle off via `ancientlich`
  const resToggle = executeConsoleLine('ancientlich');
  assert.ok(resToggle.includes('Ancient Lichdom stripped'));
  assert.equal(isAncientLich(playerEntity), false);
});

test('NecroIntegration: Arrow mitigation for Lich (50%) and Ancient Lich (80%)', () => {
  cureLichdom(playerEntity);
  cureAncientLichdom(playerEntity);
  const attacker = { isPlayer: false };
  const arrowInfo = { kind: 'arrow' };
  const meleeInfo = { kind: 'melee' };

  // Mortal baseline
  assert.equal(blowTaken(100, attacker, playerEntity, null, arrowInfo), 100);
  assert.equal(blowTaken(100, attacker, playerEntity, null, meleeInfo), 100);

  // Lichdom -> 50% arrow damage
  applyLichdom(playerEntity);
  assert.equal(blowTaken(100, attacker, playerEntity, null, arrowInfo), 50);
  assert.equal(blowTaken(100, attacker, playerEntity, null, meleeInfo), 100);
  assert.equal(playerEntity.racialOverride.minMetalToHit, 2); // Silver

  // Ancient Lichdom -> 80% mitigation (takes 20% damage)
  applyAncientLichdom(playerEntity, { force: true });
  assert.equal(blowTaken(100, attacker, playerEntity, null, arrowInfo), 20);
  assert.equal(blowTaken(100, attacker, playerEntity, null, meleeInfo), 100);
  assert.equal(playerEntity.racialOverride.minMetalToHit, 5); // Mithril

  cureAncientLichdom(playerEntity);
  assert.equal(blowTaken(100, attacker, playerEntity, null, arrowInfo), 100);
});

test('NecroIntegration: Lich & Ancient Lich survival and climate immunity', () => {
  applyLichdom(playerEntity);
  const ctxLich = survivalCtx(playerEntity);
  assert.equal(ctxLich.lich, true);
  assert.equal(feltTemperature({}, null, ctxLich).felt, 0);
  assert.equal(feltTemperature({}, null, ctxLich).abs, 0);
  assert.equal(resistTemperature(50, ctxLich), 0);
  assert.equal(resistTemperature(-50, ctxLich), 0);

  // HUD chips suppressed
  const chipsLich = survivalHudChips({ thirst: 100, sleepDebt: 100, exposure: 100 }, { abs: 60, felt: 60 }, { lich: true });
  assert.equal(chipsLich.length, 0);

  cureLichdom(playerEntity);
  applyAncientLichdom(playerEntity, { force: true });
  const ctxAncient = survivalCtx(playerEntity);
  assert.equal(ctxAncient.lich, true);
  assert.equal(feltTemperature({}, null, ctxAncient).felt, 0);
  assert.equal(feltTemperature({}, null, ctxAncient).abs, 0);
  assert.equal(resistTemperature(50, ctxAncient), 0);
  assert.equal(resistTemperature(-50, ctxAncient), 0);

  const chipsAncient = survivalHudChips({ thirst: 100, sleepDebt: 100, exposure: 100 }, { abs: 60, felt: 60 }, { lich: true });
  assert.equal(chipsAncient.length, 0);

  cureAncientLichdom(playerEntity);
});



