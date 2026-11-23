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
