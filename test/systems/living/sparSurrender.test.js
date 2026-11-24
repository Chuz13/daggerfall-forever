import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SPAR_GRACE_SECONDS,
  isSparProtected,
  isSparKneeling,
  isSparPeaceful,
  clearSparCombatEffects,
  beginSparEnd,
  stepSparSurrender,
  sparKneelPose,
} from '../../../src/systems/living/sparSurrender.js';
import { sparedBySwing, sparedByPlayer } from '../../../src/combat/friendlyFire.js';
import { foeActor } from '../../../src/characters/foeBodies.js';
import { MOBILE_TYPES } from '../../../src/characters/mobile/mobileTypes.js';
import { getTargets, runTargetMachine } from '../../../src/characters/enemy/enemyTargets.js';
import { applyDamageToNonPlayer } from '../../../src/scenes/hostCombat.js';

function makeFoe(overrides = {}) {
  return {
    seq: 1,
    mobileType: MOBILE_TYPES.Knight,
    dead: false,
    _isSparring: true,
    _surrenderedSpar: false,
    entity: {
      health: 10,
      maxHealth: 100,
      team: 'PlayerEnemy',
      activeEffects: [],
    },
    ai: {
      feet: [0, 0, 0],
      yaw: 0,
      moving: true,
      giveUpTimer: 1,
      isHostile: true,
      target: { isPlayer: true },
      secondaryTarget: { isPlayer: true },
      velX: 2,
      velZ: 3,
      path: [[1, 0, 1]],
      _tac: { state: 'windup', blow: { poise: 10 } },
    },
    attack: {
      _held: true,
      machine: { state: 'StrikeDown', acc: 0.4 },
    },
    ...overrides,
  };
}

test('beginSparEnd (PLAYER_WON) arms 5s grace, kneels, cancels windup, clears DoTs and ally targets', () => {
  const foe = makeFoe();
  foe.entity.activeEffects = [
    { kind: 'continuousDamage', caster: { isPlayer: true } },
    { kind: 'poison', caster: null },
    { kind: 'paralyze', caster: { isPlayer: true } },
    { kind: 'shield', caster: foe.entity },
  ];
  const companion = {
    dead: false,
    ai: { target: foe, secondaryTarget: foe },
  };
  const player = { isPlayer: true, activeEffects: [{ kind: 'poison', caster: null }] };

  beginSparEnd(foe, { playerWon: true, foes: [foe, companion], playerEntity: player, now: 1000 });

  assert.equal(foe._isSparring, false);
  assert.equal(foe._surrenderedSpar, true);
  assert.equal(foe._sparGraceLeft, SPAR_GRACE_SECONDS);
  assert.equal(foe._sparKneeling, true);
  assert.equal(isSparProtected(foe), true);
  assert.equal(isSparKneeling(foe), true);
  assert.equal(isSparPeaceful(foe), true);

  assert.equal(foe.ai.isHostile, false);
  assert.equal(foe.ai.target, null);
  assert.equal(foe.ai.secondaryTarget, null);
  assert.equal(foe.ai.velX, 0);
  assert.equal(foe.ai.velZ, 0);
  assert.equal(foe.ai.moving, false);
  assert.equal(foe.ai.path, null);
  assert.equal(foe.ai._tac.state, 'engage');
  assert.equal(foe.attack.machine.state, 'Idle');
  assert.equal(foe.attack._held, false);

  assert.deepEqual(foe.entity.activeEffects.map((e) => e.kind), ['shield']);
  assert.equal(player.activeEffects.length, 1, 'player effects untouched on PLAYER_WON');
  assert.equal(companion.ai.target, null);
  assert.equal(companion.ai.secondaryTarget, null);
  assert.equal(sparedBySwing(foe), true);
  assert.equal(sparedByPlayer(foe), true);
});

test('beginSparEnd (PLAYER_LOST) protects opponent for 5s without kneeling and clears opponent DoTs on player', () => {
  const foe = makeFoe();
  const otherCaster = { name: 'Skeleton' };
  const player = {
    isPlayer: true,
    activeEffects: [
      { kind: 'continuousDamage', caster: foe.entity },
      { kind: 'continuousDamage', caster: otherCaster },
      { kind: 'poison', caster: null },
    ],
  };

  beginSparEnd(foe, { playerWon: false, foes: [foe], playerEntity: player, now: 2000 });

  assert.equal(isSparProtected(foe), true);
  assert.equal(isSparKneeling(foe), false, 'winner does not kneel');
  assert.equal(isSparPeaceful(foe), true);
  assert.equal(player.activeEffects.length, 1);
  assert.equal(player.activeEffects[0].caster, otherCaster);
});

test('stepSparSurrender counts down real dt and stands opponent up after 5 seconds', () => {
  const foe = makeFoe();
  beginSparEnd(foe, { playerWon: true, foes: [foe], now: 1000 });

  assert.equal(stepSparSurrender(foe, 0), false);
  assert.equal(foe._sparGraceLeft, 5);

  assert.equal(stepSparSurrender(foe, 3.2), false);
  assert.equal(isSparProtected(foe), true);
  assert.equal(isSparKneeling(foe), true);

  assert.equal(stepSparSurrender(foe, 2.0), true);
  assert.equal(foe._sparGraceLeft, 0);
  assert.equal(isSparProtected(foe), false);
  assert.equal(isSparKneeling(foe), false);
  assert.equal(isSparPeaceful(foe), true);
  assert.equal(sparedBySwing(foe), false);
});

test('foeActor sets kneel:true and drawn:false for kneeling adventurers and yielded revenants', () => {
  const adv = makeFoe();
  beginSparEnd(adv, { playerWon: true, foes: [adv], now: 1000 });
  const a1 = foeActor(adv, 1);
  assert.equal(a1.kneel, true);
  assert.equal(a1.drawn, false);
  assert.equal(a1.moving, false);

  stepSparSurrender(adv, 5.1);
  const a2 = foeActor(adv, 1);
  assert.equal(a2.kneel, false);
  assert.equal(a2.drawn, false, 'peaceful stood-up adventurer keeps weapon sheathed');

  adv.ai.isHostile = true;
  const a3 = foeActor(adv, 1);
  assert.equal(a3.drawn, true, 're-provoked adventurer draws weapon');

  const rev = makeFoe({ _isSparring: false, yielded: { at: 500 } });
  const r1 = foeActor(rev, 2);
  assert.equal(r1.kneel, true);
  assert.equal(r1.drawn, false);
  assert.equal(r1.moving, false);
});

test('sparKneelPose holds hurt last frame with periodic breath frame -2', () => {
  const calls = [];
  const foe = makeFoe({
    _sparYieldAt: 1000,
    mobile: {
      heldPose: (state, frame, yaw, feet, eye) => {
        calls.push({ state, frame, yaw, feet, eye });
        return { record: 5, frame, flip: false };
      },
    },
  });
  const p1 = sparKneelPose(foe, [0, 1.6, 2], 1100);
  const p2 = sparKneelPose(foe, [0, 1.6, 2], 1500);
  assert.equal(p1.frame, -2);
  assert.equal(p2.frame, -1);
  assert.equal(calls[0].state, 'hurt');
});

test('clearSparCombatEffects handles null/empty activeEffects safely', () => {
  assert.doesNotThrow(() => clearSparCombatEffects(null));
  assert.doesNotThrow(() => clearSparCombatEffects({}));
});

test('beginSparEnd clears targetSenses, shoot latches, and ranged mobile state on duelist and companion', () => {
  const foe = makeFoe({
    mobile: { state: 'ranged', frame: 3, _timer: 0.2, _attackFrames: [1, -1], _iter: 1, shootArrow: true, doMeleeDamage: true },
  });
  foe.ai.targetSenses = { ai: {} };
  foe.ai._targetCandidate = { isPlayer: false };
  foe.ai.detected = true;
  foe.ai.inSight = true;
  foe.ai.lastKnownTargetPos = [1, 0, 2];
  foe.ai.predictedTargetPos = [1, 0, 2];
  foe.ai._blowShot = { fired: false };
  foe.ai._wantAimed = true;
  foe.attack.firedRanged = true;
  foe.attack.meleeTimer = 1.5;

  const companion = makeFoe({
    seq: 2,
    _isSparring: false,
    companion: 'c1',
    entity: { health: 80, maxHealth: 80, team: 'PlayerAlly', mobileTeam: 'PlayerAlly', activeEffects: [] },
    mobile: { state: 'ranged', frame: 2, _timer: 0.1, _attackFrames: [1, -1], _iter: 0, shootArrow: true, doMeleeDamage: false },
  });
  companion.ai.target = foe;
  companion.ai.secondaryTarget = foe;
  companion.ai.targetSenses = foe;
  companion.ai._targetCandidate = foe;
  companion.ai.detected = true;
  companion.ai.inSight = true;
  companion.ai.giveUpTimer = 5;
  companion.ai.lastKnownTargetPos = [0, 0, 0];
  companion.attack.firedRanged = true;

  beginSparEnd(foe, { playerWon: true, foes: [foe, companion], now: 1000 });

  assert.equal(foe.ai.targetSenses, null);
  assert.equal(foe.ai._targetCandidate, null);
  assert.equal(foe.ai.detected, false);
  assert.equal(foe.ai.inSight, false);
  assert.equal(foe.ai.giveUpTimer, 0);
  assert.equal(foe.ai.lastKnownTargetPos, null);
  assert.equal(foe.ai.predictedTargetPos, null);
  assert.equal(foe.ai._blowShot, null);
  assert.equal(foe.ai._wantAimed, false);
  assert.equal(foe.attack.firedRanged, false);
  assert.equal(foe.attack.meleeTimer, 0);
  assert.equal(foe.mobile.shootArrow, false);
  assert.equal(foe.mobile.doMeleeDamage, false);
  assert.equal(foe.mobile.state, 'idle');

  assert.equal(companion.ai.target, null);
  assert.equal(companion.ai.secondaryTarget, null);
  assert.equal(companion.ai.targetSenses, null);
  assert.equal(companion.ai._targetCandidate, null);
  assert.equal(companion.ai.detected, false);
  assert.equal(companion.ai.giveUpTimer, 0);
  assert.equal(companion.attack.firedRanged, false);
  assert.equal(companion.attack.machine.state, 'Idle');
  assert.equal(companion.mobile.shootArrow, false);
  assert.equal(companion.mobile.state, 'idle');
});

test('getTargets and runTargetMachine prevent surrendered duelist and companions from targeting or recruiting each other', () => {
  const duelist = makeFoe();
  beginSparEnd(duelist, { playerWon: true, foes: [duelist], now: 1000 });
  stepSparSurrender(duelist, 5.5); // standing peacefully post-grace
  assert.equal(isSparProtected(duelist), false);
  assert.equal(isSparPeaceful(duelist), true);

  const companion = makeFoe({
    seq: 2,
    _isSparring: false,
    companion: 'c1',
    entity: { health: 80, maxHealth: 80, team: 'PlayerAlly', mobileTeam: 'PlayerAlly', activeEffects: [] },
  });
  companion.ai.isHostile = false;
  companion.ai.target = duelist;
  companion.ai.secondaryTarget = duelist;
  companion.ai.targetSenses = duelist;
  companion.ai.classicTargetUpdateTimer = 999;
  companion.ai.wouldBeSpawned = true;

  // Companion drops stale target/targetSenses pointing at peaceful duelist and does not recruit it
  const compPos = runTargetMachine(companion, [duelist], [0, 0, 0], 1, { infighting: true });
  assert.equal(compPos, null);
  assert.equal(companion.ai.target, null);
  assert.equal(companion.ai.secondaryTarget, null);
  assert.equal(companion.ai.targetSenses, null);
  assert.equal(duelist.ai.target, null);

  // Peaceful duelist acquires no targets even with hostile/ally candidates nearby
  const got = getTargets(duelist, [companion], [0, 0, 0], { infighting: true });
  assert.equal(got.target, null);

  duelist.ai.target = companion;
  duelist.ai.targetSenses = companion;
  const duelPos = runTargetMachine(duelist, [companion], [0, 0, 0], 1, { infighting: true });
  assert.equal(duelPos, null);
  assert.equal(duelist.ai.target, null);
  assert.equal(duelist.ai.targetSenses, null);
});

test('applyDamageToNonPlayer ignores protected duelists and companion hits on peaceful duelists', () => {
  const duelist = makeFoe();
  let hostileCalls = 0;
  let dmgCalls = 0;
  duelist.ai.makeEnemyHostileToAttacker = () => { hostileCalls++; };

  const companion = makeFoe({
    seq: 2,
    _isSparring: false,
    companion: 'c1',
    entity: { health: 80, maxHealth: 80, team: 'PlayerAlly', mobileTeam: 'PlayerAlly', activeEffects: [] },
  });
  const monster = makeFoe({ seq: 3, _isSparring: false });

  beginSparEnd(duelist, { playerWon: true, foes: [duelist, companion], now: 1000 });

  // During 5s grace: neither companion nor wild monster can damage or re-aggro duelist
  assert.equal(applyDamageToNonPlayer(companion, duelist, {
    bowAttack: true,
    calculateAttackDamage: () => 25,
    dealDamage: () => { dmgCalls++; },
  }), 0);
  assert.equal(applyDamageToNonPlayer(monster, duelist, {
    bowAttack: true,
    calculateAttackDamage: () => 25,
    dealDamage: () => { dmgCalls++; },
  }), 0);
  assert.equal(dmgCalls, 0);
  assert.equal(hostileCalls, 0);

  // After 5s grace: companion still cannot damage or re-aggro peaceful duelist
  stepSparSurrender(duelist, 5.5);
  assert.equal(applyDamageToNonPlayer(companion, duelist, {
    bowAttack: true,
    calculateAttackDamage: () => 25,
    dealDamage: () => { dmgCalls++; },
  }), 0);
  assert.equal(dmgCalls, 0);
  assert.equal(hostileCalls, 0);
});
