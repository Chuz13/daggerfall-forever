import test from 'node:test';
import assert from 'node:assert/strict';

import { ENTRY_WORDS } from '../../src/ui/hud/statusTips.js';
import {
  resolveUndeadControlTarget,
  castControlUndead,
} from '../../src/systems/necromancy/necromanticSpells.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import {
  isPlayerDisguised,
  applyLichdom,
  cureLichdom,
  applyAncientLichdom,
  cureAncientLichdom,
} from '../../src/systems/necromancy/lichdomStatus.js';
import { checkSettlementInfraction } from '../../src/systems/necromancy/cityLaw.js';
import { CRIMES } from '../../src/systems/crimes.js';
import { spawnMinion, dismissAllMinions, MINION_STANCES } from '../../src/systems/necromancy/minionController.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';
import { createStandingWatch, STANDING_LOOK_MS } from '../../src/scenes/standingHost.js';
import { createCityGuards } from '../../src/scenes/cityGuards.js';

test('Bone Armor HUD Card: ENTRY_WORDS.boneArmor mirrors shield with real-time remaining values', () => {
  assert.equal(typeof ENTRY_WORDS.boneArmor, 'function');
  
  const buffWithHp = { kind: 'boneArmor', shieldRemaining: 150 };
  const tipWithHp = ENTRY_WORDS.boneArmor(buffWithHp);
  assert.match(tipWithHp, /Absorbs 150 more damage/);

  const buffZeroHp = { kind: 'boneArmor', shieldRemaining: 0 };
  const tipZeroHp = ENTRY_WORDS.boneArmor(buffZeroHp);
  assert.match(tipZeroHp, /Absorbs 0 more damage/);

  const buffNoHp = { kind: 'boneArmor' };
  const tipNoHp = ENTRY_WORDS.boneArmor(buffNoHp);
  assert.match(tipNoHp, /Absorbs damage/);
});

test('Control Undead Target Resolution: correctly maps DFU MOBILE_TYPES (Skeleton is 15, not Werewolf 9)', () => {
  // Skeleton
  const skel1 = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.SkeletalWarrior });
  assert.equal(skel1.type, 'skeleton');
  assert.equal(skel1.mobile, 15, 'SkeletalWarrior mobile type must be 15');

  const skelByName = resolveUndeadControlTarget({ name: 'Skeletal Warrior' });
  assert.equal(skelByName.type, 'skeleton');
  assert.equal(skelByName.mobile, 15, 'Skeleton fallback mobile must be 15, NOT Werewolf (9)');

  // Zombie
  const zombie = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Zombie });
  assert.equal(zombie.type, 'zombie');
  assert.equal(zombie.mobile, 17);

  // Ghost
  const ghost = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Ghost });
  assert.equal(ghost.type, 'ghost');
  assert.equal(ghost.mobile, 18);

  // Mummy
  const mummy = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Mummy });
  assert.equal(mummy.type, 'mummy');
  assert.equal(mummy.mobile, 19);

  // Wraith
  const wraith = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Wraith });
  assert.equal(wraith.type, 'wraith');
  assert.equal(wraith.mobile, 23);

  // Vampire
  const vamp = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Vampire });
  assert.equal(vamp.type, 'vampire');
  assert.equal(vamp.mobile, 28);

  // Vampire Ancient
  const vampAncient = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.VampireAncient });
  assert.equal(vampAncient.type, 'vampire_ancient');
  assert.equal(vampAncient.mobile, 30);

  // Lich
  const lich = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.Lich });
  assert.equal(lich.type, 'lich');
  assert.equal(lich.mobile, 32);

  // Ancient Lich
  const ancientLich = resolveUndeadControlTarget({ mobileType: MOBILE_TYPES.AncientLich });
  assert.equal(ancientLich.type, 'ancient_lich');
  assert.equal(ancientLich.mobile, 33);
});

test('Control Undead Cast: converts existing targeted foe and pacifies AI/hostility', () => {
  const dummyPlayer = { isPlayer: true, name: 'Necromancer' };
  const hostileFoe = {
    name: 'Skeletal Warrior',
    mobileType: MOBILE_TYPES.SkeletalWarrior,
    isUndead: true,
    dead: false,
    entity: {
      team: 'PlayerEnemy',
      mobileTeam: 'PlayerEnemy',
      health: 80,
      maxHealth: 80,
    },
    ai: {
      isHostile: true,
      target: dummyPlayer,
      secondaryTarget: dummyPlayer,
      giveUpTimer: 10,
    },
  };

  const res = castControlUndead(dummyPlayer, hostileFoe, {
    magnitude: 100,
    duration: 20,
    chance: 100,
  });

  assert.equal(res.success, true);
  assert.ok(res.minion);
  assert.equal(hostileFoe.controlledUndead, true);
  assert.equal(hostileFoe.entity.team, 'PlayerAlly');
  assert.equal(hostileFoe.ai.isHostile, false, 'Controlled foe must not be hostile');
  assert.equal(hostileFoe.ai.target, null, 'Controlled foe target must be cleared');
  assert.equal(hostileFoe.ai.secondaryTarget, null);
  assert.equal(hostileFoe.ai.giveUpTimer, 0);
});

test('Guards & Lichdom/Minions Law: undisguised Lich and visible minions alert guards', () => {
  const player = {
    isPlayer: true,
    name: 'Necromancer',
    activeEffects: [],
    crimeCommitted: 0,
  };

  // 1. Mortal player without minions -> no infraction
  dismissAllMinions();
  cureLichdom(player);
  cureAncientLichdom(player);
  const cleanCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(cleanCheck.infraction, false);

  // 2. Undisguised Lich in Daggerfall -> Treason, hostile
  applyLichdom(player, { nowMinutes: 100 });
  assert.equal(isPlayerDisguised(player), false);
  const undisguisedLichCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(undisguisedLichCheck.infraction, true);
  assert.equal(undisguisedLichCheck.crime, CRIMES.Treason);
  assert.equal(undisguisedLichCheck.isHostile, true);

  // 3. Disguised Lich (Mortal Disguise active) -> passes peacefully
  player.activeEffects.push({ kind: 'disguise', roundsRemaining: 10, ended: false });
  assert.equal(isPlayerDisguised(player), true);
  const disguisedCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(disguisedCheck.infraction, false);

  // 4. Disguised Lich WITH visible minions -> Minions trigger infraction and hostility!
  spawnMinion({ type: 'skeleton', masterEntity: player, stance: MINION_STANCES.FOLLOW });
  const minionCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(minionCheck.infraction, true);
  assert.equal(minionCheck.crime, CRIMES.Criminal_Conspiracy);
  assert.equal(minionCheck.isHostile, true, 'Visible minions must cause guards to engage');

  // 5. Minions ordered to FEIGN_DEATH -> no visible minions -> passes peacefully
  dismissAllMinions();
  spawnMinion({ type: 'skeleton', masterEntity: player, stance: MINION_STANCES.FEIGN_DEATH });
  const feignCheck = checkSettlementInfraction(player, { isInsideSettlement: true, regionName: 'Daggerfall' });
  assert.equal(feignCheck.infraction, false);
});

test('Console Command necro control: works for both targeted live undead and standalone spawn', async () => {
  const necroCmd = getConsoleCommand('necro');
  assert.ok(necroCmd);

  // Test headless fallback
  const res = necroCmd.callback(['control', 'skeleton', '15']);
  assert.match(res, /Enslaved Controlled skeleton \(skeleton/);
  assert.match(res, /for 15 rounds/);
  dismissAllMinions();
});

test('StandingWatch & Named Guards in guardPool: two named guards in a conversation circle or idle react to undisguised Arch-Lich and visible minions', () => {
  dismissAllMinions();
  const player = {
    isPlayer: true,
    name: 'ArchLichTester',
    health: 100,
    activeEffects: [],
    crimeCommitted: 0,
    legalRep: { 3: 0 },
  };
  applyAncientLichdom(player, { nowMinutes: 500 });

  // Two named guards standing 3m in front of the player, facing sideways/away in a conversation circle
  const namedGuards = [
    { pos: [0, 0, 3], fwdYaw: 0, guard: true, person: { guard: true, nameNPC: 'Sir Gallant', state: 'idle' } },
    { pos: [1, 0, 3], fwdYaw: Math.PI / 2, guard: true, person: { guard: true, nameNPC: 'Sir Cedric', state: 'circle' } },
  ];

  const cg = createCityGuards({
    renderer: { createBillboardBatch: () => ({}), textures: new Map(), destroyBillboardBatch: () => {} },
    collider: { heightAt: () => 0, raycast: () => Infinity, raycastHit: () => ({ dist: Infinity, normal: null }), sphereOverlaps: () => false },
    fetchBytes: async () => { throw new Error('no art'); },
    getTexture: async () => null,
    uploadRecordFrame: () => {},
    currentMinute: () => 0,
    playerEntity: player,
    audio: null,
    onPlayerHurt: () => {},
    rand: () => 0.5,
  });

  // Verify guardSpotsPlayerNear detects the named guards at 3m even though fwdYaw is facing away
  assert.equal(cg.guardSeesPlayer({ playerFeet: [0, 0, 0], pool: namedGuards }), null, 'Strict 95-deg cone misses sideways/back-turned guards');
  assert.equal(cg.guardSpotsPlayerNear({ playerFeet: [0, 0, 0], pool: namedGuards }), namedGuards[0], 'Close-range/idle awareness spots the player right in front of the guard');

  let convertedCalls = 0;
  let crimeResponses = 0;
  const alerts = [];
  let clockMs = 1000;

  const watch = createStandingWatch({
    playerEntity: player,
    townTalk: { say: (msg) => alerts.push(msg) },
    arrestFlow: { inCourt: () => false, surrenderToChallenge: () => true },
    cityGuards: {
      guardSeesPlayer: (o) => cg.guardSeesPlayer(o),
      guardSpotsPlayerNear: (o) => cg.guardSpotsPlayerNear(o),
      makeNpcGuardsIntoEnemies: async () => { convertedCalls++; },
      anyWatchStanding: () => convertedCalls > 0,
      guards: [],
    },
    guardPool: () => namedGuards,
    playerFeet: () => [0, 0, 0],
    regionIndex: () => 3,
    regionName: () => 'Daggerfall',
    ownNow: () => 1000,
    worldNow: () => 1000,
    crimeResponse: () => { crimeResponses++; },
    onStreet: () => true,
    blocked: () => true, // Even when blocked() is true (e.g. a hostile foe or minion is near)
    clock: () => clockMs,
  });

  // 1. Undisguised Arch-Lich approaches the two named guards
  assert.equal(watch.frame(), true, 'StandingWatch must trigger for undisguised Arch-Lich near named guards');
  assert.equal(player.crimeCommitted, CRIMES.Treason);
  assert.equal(convertedCalls, 1, 'Named guards in pool must be converted into hostile watchmen');
  assert.equal(crimeResponses, 1, 'crimeResponse must be invoked');
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /A foul Lich walks our streets/);

  // 2. Next second while still standing there: converts any remaining unconverted guards without spamming HUD alert
  clockMs += STANDING_LOOK_MS;
  assert.equal(watch.frame(), true);
  assert.equal(alerts.length, 1, 'HUD alert must not spam every second for the same crime');

  // 3. Disguised Arch-Lich with no minions -> no reaction
  player.crimeCommitted = 0;
  convertedCalls = 0;
  crimeResponses = 0;
  player.activeEffects.push({ kind: 'disguise', roundsRemaining: 20, ended: false });
  clockMs += STANDING_LOOK_MS;
  assert.equal(watch.frame(), false, 'Disguised Arch-Lich without minions should not trigger guards');
  assert.equal(convertedCalls, 0);

  // 4. Disguised Arch-Lich spawns a skeleton minion -> guards immediately react to the minion!
  spawnMinion({ type: 'skeleton', masterEntity: player, stance: MINION_STANCES.FOLLOW });
  clockMs += STANDING_LOOK_MS;
  assert.equal(watch.frame(), true, 'Disguised Arch-Lich with a visible skeleton must trigger guards');
  assert.equal(player.crimeCommitted, CRIMES.Criminal_Conspiracy);
  assert.equal(convertedCalls, 1);
  assert.equal(crimeResponses, 1);
  assert.equal(alerts.length, 2);
  assert.match(alerts[1], /Necromancy in the city square/);

  dismissAllMinions();
  cureAncientLichdom(player);
});

test('Harvest Remains crime: Assault in settlement/building with witness, none in dungeon or unwitnessed, never downgrades Murder/Treason', async () => {
  const { reportCorpseHarvestCrime } = await import('../../src/systems/necromancy/cityLaw.js');
  const { NecroConfig, resetNecroConfig, SOCIAL_LAW_MODES } = await import('../../src/systems/necromancy/necroConfig.js');
  const { registerCorpse, harvestAllFromCorpse, _resetCorpseRegistryForTests } = await import('../../src/systems/necromancy/corpseRegistry.js');

  resetNecroConfig();
  const player = { isPlayer: true, crimeCommitted: 0, items: [{ templateIndex: 603, name: 'Skinning Knife' }] };

  // 1. Dungeon -> no crime
  let guardSpawns = 0;
  const rDungeon = reportCorpseHarvestCrime(player, {
    isInsideDungeon: true,
    isInsideSettlement: true,
    hasWitness: true,
    spawnWitnessGuards: () => { guardSpawns++; },
  });
  assert.equal(rDungeon.crimeCommitted, false);
  assert.equal(player.crimeCommitted, 0);
  assert.equal(guardSpawns, 0);

  // 2. Settlement without witness -> no crime
  const rUnwitnessed = reportCorpseHarvestCrime(player, {
    isInsideSettlement: true,
    hasWitness: false,
    spawnWitnessGuards: () => { guardSpawns++; },
  });
  assert.equal(rUnwitnessed.crimeCommitted, false);
  assert.equal(player.crimeCommitted, 0);
  assert.equal(guardSpawns, 0);

  // 3. Settlement WITH witness -> CRIMES.Assault + witness guard call
  let alertSaid = '';
  const rWitnessed = reportCorpseHarvestCrime(player, {
    isInsideSettlement: true,
    hasWitness: true,
    spawnWitnessGuards: () => { guardSpawns++; },
    say: (m) => { alertSaid = m; },
  });
  assert.equal(rWitnessed.crimeCommitted, true);
  assert.equal(player.crimeCommitted, CRIMES.Assault);
  assert.equal(guardSpawns, 1);
  assert.ok(alertSaid.length > 0);

  // 4. Heavier crime (Murder) must NOT be downgraded to Assault
  player.crimeCommitted = CRIMES.Murder;
  const rMurder = reportCorpseHarvestCrime(player, {
    isInsideSettlement: true,
    hasWitness: true,
    spawnWitnessGuards: () => { guardSpawns++; },
  });
  assert.equal(rMurder.crimeCommitted, true);
  assert.equal(player.crimeCommitted, CRIMES.Murder, 'Must not downgrade Murder to Assault');

  // 5. Social law OFF -> no crime
  player.crimeCommitted = 0;
  NecroConfig.socialLaw = SOCIAL_LAW_MODES.OFF;
  const rOff = reportCorpseHarvestCrime(player, {
    isInsideSettlement: true,
    hasWitness: true,
    spawnWitnessGuards: () => { guardSpawns++; },
  });
  assert.equal(rOff.crimeCommitted, false);
  assert.equal(player.crimeCommitted, 0);
  resetNecroConfig();

  // 6. cityGuards.anyoneSeesPlayer detects civilian in cone and respects walls
  const cg = createCityGuards({
    renderer: { createBillboardBatch: () => ({}), textures: new Map(), destroyBillboardBatch: () => {} },
    collider: {
      heightAt: () => 0,
      raycast: (eye) => (eye[2] > 50 ? 1 : Infinity),
      raycastHit: () => ({ dist: Infinity, normal: null }),
      sphereOverlaps: () => false,
    },
    fetchBytes: async () => { throw new Error('no art'); },
    getTexture: async () => null,
    uploadRecordFrame: () => {},
    currentMinute: () => 0,
    playerEntity: player,
    audio: null,
    onPlayerHurt: () => {},
    rand: () => 0.5,
  });
  const civilianFacing = { pos: [0, 0, 10], fwdYaw: Math.PI, guard: false };
  const civilianBehindWall = { pos: [0, 0, 60], fwdYaw: Math.PI, guard: false };
  assert.equal(cg.anyoneSeesPlayer({ playerFeet: [0, 0, 0], pool: [civilianBehindWall] }), null);
  assert.equal(cg.anyoneSeesPlayer({ playerFeet: [0, 0, 0], pool: [civilianFacing] }), civilianFacing);

  // 7. harvestAllFromCorpse triggers __sceneContext.reportHarvestCrime on success only
  _resetCorpseRegistryForTests();
  const prevCtx = globalThis.__sceneContext;
  let hookCalls = 0;
  globalThis.__sceneContext = { reportHarvestCrime: () => { hookCalls++; } };
  try {
    const corpse = registerCorpse({ id: 'c_crime_1', entityName: 'Bandit', position: [0, 0, 0] });
    const hRes = harvestAllFromCorpse(corpse, player);
    assert.equal(hRes.success, true);
    assert.equal(hookCalls, 1);

    const hAgain = harvestAllFromCorpse(corpse, player);
    assert.equal(hAgain.success, false);
    assert.equal(hookCalls, 1, 'Failed harvest must not trigger crime');
  } finally {
    globalThis.__sceneContext = prevCtx;
    _resetCorpseRegistryForTests();
  }
});

test('Mortal Disguise: breaks on successful cast of all non-disguise necromancy spells (including enchanted disguise items)', async () => {
  const {
    mortalDisguiseSpell,
    animateDeadSpell,
    corpseExplosionSpell,
    lifeTapSpell,
    boneArmorSpell,
    controlUndeadSpell,
    sutureCadaverSpell,
    lichParalyzingTouchSpell,
    necroLevitateSpell,
    fingerOfDeathSpell,
    isNonDisguiseNecroSpell,
  } = await import('../../src/systems/necromancy/necromanticSpells.js');
  const { applySpell } = await import('../../src/systems/effects.js');
  const { registerCorpse, _resetCorpseRegistryForTests } = await import('../../src/systems/necromancy/corpseRegistry.js');
  const { _resetUndeadCapacityForTests } = await import('../../src/systems/necromancy/undeadCapacity.js');
  const { enchantmentMagicRound } = await import('../../src/systems/enchantments.js');

  assert.equal(isNonDisguiseNecroSpell(mortalDisguiseSpell()), false);
  assert.equal(isNonDisguiseNecroSpell(animateDeadSpell()), true);
  assert.equal(isNonDisguiseNecroSpell(lichParalyzingTouchSpell()), true);
  assert.equal(isNonDisguiseNecroSpell(necroLevitateSpell()), true);
  assert.equal(isNonDisguiseNecroSpell(fingerOfDeathSpell()), true);
  // Plain vanilla Levitate without necro tag must NOT be treated as necro
  assert.equal(
    isNonDisguiseNecroSpell({ index: 10, name: 'Levitate', rangeType: 0, effects: [{ type: 14, subType: 255, durationBase: 10, durationMod: 1, durationPerLevel: 1 }] }),
    false,
  );

  const makeLich = () => {
    const p = {
      isPlayer: true,
      level: 25,
      health: 200,
      maxHealth: 200,
      stats: { intelligence: 100, willpower: 100, personality: 50 },
      skills: {},
      activeEffects: [],
      items: [],
      position: [0, 0, 0],
    };
    applyLichdom(p, { nowMinutes: 100 });
    return p;
  };

  const applyDisguise = (p) => {
    applySpell(mortalDisguiseSpell(), 25, p, {}, () => 0.5, { entity: p });
    assert.equal(isPlayerDisguised(p), true);
  };

  _resetCorpseRegistryForTests();
  _resetUndeadCapacityForTests();
  dismissAllMinions();

  const lich = makeLich();
  const casterWrap = { entity: lich, sinks: { say: () => {}, heal: () => {} } };

  // 1. Casting Mortal Disguise itself keeps disguise active
  applyDisguise(lich);
  applySpell(mortalDisguiseSpell(), 25, lich, {}, () => 0.5, casterWrap);
  assert.equal(isPlayerDisguised(lich), true);

  // 2. Bone Armor breaks disguise
  applySpell(boneArmorSpell(), 25, lich, {}, () => 0.5, casterWrap);
  assert.equal(isPlayerDisguised(lich), false);

  // 3. Dark Flight (necro Levitate) breaks disguise
  applyDisguise(lich);
  applySpell(necroLevitateSpell(), 25, lich, {}, () => 0.5, casterWrap);
  assert.equal(isPlayerDisguised(lich), false);

  // 4. Plain vanilla Levitate does NOT break disguise
  applyDisguise(lich);
  applySpell(
    { index: 10, name: 'Levitate', rangeType: 0, element: 4, effects: [{ type: 14, subType: 255, durationBase: 10, durationMod: 0, durationPerLevel: 1 }] },
    25,
    lich,
    {},
    () => 0.5,
    casterWrap,
  );
  assert.equal(isPlayerDisguised(lich), true);

  // 5. Failed Suture Cadaver (<3 corpses) does NOT break disguise; successful one DOES
  applySpell(sutureCadaverSpell(), 25, lich, {}, () => 0.5, casterWrap);
  assert.equal(isPlayerDisguised(lich), true, 'Failed Suture Cadaver must not break disguise');

  for (let i = 0; i < 3; i++) {
    registerCorpse({ id: `sut_${i}`, entityName: 'Bandit', maxHealth: 100, position: [1, 0, 1] });
  }
  applySpell(sutureCadaverSpell(), 25, lich, {}, () => 0.5, casterWrap);
  assert.equal(isPlayerDisguised(lich), false, 'Successful Suture Cadaver must break disguise');

  // 6. Animate Dead: failed (no corpse) keeps disguise; successful breaks disguise
  applyDisguise(lich);
  applySpell(animateDeadSpell(), 25, lich, {}, () => 0.5, casterWrap);
  assert.equal(isPlayerDisguised(lich), true, 'Failed Animate Dead must not break disguise');
  registerCorpse({ id: 'anim_1', entityName: 'Bandit', maxHealth: 100, position: [0, 0, 0] });
  applySpell(animateDeadSpell(), 25, lich, {}, () => 0.01, casterWrap);
  assert.equal(isPlayerDisguised(lich), false, 'Successful Animate Dead must break disguise');

  // 7. Corpse Explosion: failed (no corpse) keeps disguise; successful breaks disguise
  applyDisguise(lich);
  applySpell(corpseExplosionSpell(), 25, lich, {}, () => 0.5, casterWrap);
  assert.equal(isPlayerDisguised(lich), true, 'Failed Corpse Explosion must not break disguise');
  registerCorpse({ id: 'ce_1', entityName: 'Bandit', maxHealth: 100, position: [0, 0, 0] });
  applySpell(corpseExplosionSpell(), 25, lich, {}, () => 0.5, casterWrap);
  assert.equal(isPlayerDisguised(lich), false, 'Successful Corpse Explosion must break disguise');

  // 8. Life Tap on enemy target breaks disguise
  applyDisguise(lich);
  const foe = { health: 100, maxHealth: 100, stats: { willpower: 10 } };
  applySpell(lifeTapSpell(), 25, foe, { hurt: (n) => { foe.health -= n; } }, () => 0.99, casterWrap);
  assert.equal(isPlayerDisguised(lich), false);

  // 9. Control Undead: resisted keeps disguise; success breaks disguise
  applyDisguise(lich);
  const undeadFoe = { name: 'Skeleton', mobileType: MOBILE_TYPES.SkeletalWarrior, isUndead: true, health: 50, maxHealth: 50, entity: { team: 'PlayerEnemy' } };
  applySpell(controlUndeadSpell(), 1, undeadFoe, {}, () => 0.99, casterWrap);
  assert.equal(isPlayerDisguised(lich), true, 'Resisted Control Undead must not break disguise');
  applySpell(controlUndeadSpell(), 25, undeadFoe, {}, () => 0.99, casterWrap);
  assert.equal(isPlayerDisguised(lich), false, 'Successful Control Undead must break disguise');

  // 10. Paralyzing Touch & Finger of Death: break on hit, keep on save
  applyDisguise(lich);
  const mortalTarget = { health: 80, maxHealth: 80, stats: { willpower: 50 } };
  applySpell(lichParalyzingTouchSpell(), 25, mortalTarget, { hurt: () => {} }, () => 0.99, casterWrap);
  assert.equal(isPlayerDisguised(lich), false, 'Successful Paralyzing Touch must break disguise');

  applyDisguise(lich);
  applySpell(fingerOfDeathSpell(), 25, mortalTarget, { hurt: (n) => { mortalTarget.health -= n; } }, () => 0.99, casterWrap);
  assert.equal(isPlayerDisguised(lich), false, 'Successful Finger of Death must break disguise');

  // 11. Equipped item enchanted with Mortal Disguise (-54) breaks on necro cast and recovers after 2 magic rounds
  const ring = {
    equipSlot: 6,
    enchantments: [{ type: 1, param: -54 }],
  };
  lich.items.push(ring);
  lich.activeEffects.push({ kind: 'disguise', heldItem: ring, roundsRemaining: 30, ended: false });
  assert.equal(isPlayerDisguised(lich), true);

  applySpell(necroLevitateSpell(), 25, lich, {}, () => 0.5, casterWrap);
  assert.equal(isPlayerDisguised(lich), false, 'Enchanted disguise ring must also break on necro cast');
  assert.equal(ring._disguiseBroken, true);

  enchantmentMagicRound(lich, 1, { nowMinutes: 101 });
  assert.equal(isPlayerDisguised(lich), false, 'Still broken after 1 round');
  enchantmentMagicRound(lich, 2, { nowMinutes: 102 });
  assert.equal(isPlayerDisguised(lich), true, 'Recovered after 2 magic rounds');

  dismissAllMinions();
  cureLichdom(lich);
  _resetCorpseRegistryForTests();
  _resetUndeadCapacityForTests();
});

