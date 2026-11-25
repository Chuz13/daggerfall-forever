import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createPlayerMagic } from '../../src/scenes/hostMagic.js';
import {
  AOE_SELF_FF_PREF,
  AOE_ALLY_FF_PREF,
  aoeSelfFriendlyFireEnabled,
  aoeAllyFriendlyFireEnabled,
  isAoeAlly,
  sparedByPlayer,
} from '../../src/combat/friendlyFire.js';
import { FEATURES, checkFeature } from '../../src/systems/features.js';
import { whereIs } from '../../src/ui/settings/settingsMap.js';
import { getPref, setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { runMagicRoundsFor } from '../../src/systems/worldTick.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';

const dmgFx = (type = 4, mag = 12, durationBase = 0) => ({
  type,
  subType: 0,
  magnitudeBaseLow: mag,
  magnitudeBaseHigh: mag,
  magnitudeLevelBase: 0,
  magnitudeLevelHigh: 0,
  magnitudePerLevel: 1,
  durationBase,
  durationMod: 0,
  durationPerLevel: 1,
  chanceBase: 100,
  chanceMod: 0,
  chancePerLevel: 1,
});

const healFx = (mag = 12) => ({
  type: 10,
  subType: 8,
  magnitudeBaseLow: mag,
  magnitudeBaseHigh: mag,
  magnitudeLevelBase: 0,
  magnitudeLevelHigh: 0,
  magnitudePerLevel: 1,
  durationBase: 0,
  durationMod: 0,
  durationPerLevel: 1,
  chanceBase: 100,
  chanceMod: 0,
  chancePerLevel: 1,
});

const fireballSpell = () => ({
  name: 'Fireball',
  index: 901,
  element: 0,
  rangeType: 4,
  effects: [dmgFx(4, 15, 0)],
});

const firestormSpell = () => ({
  name: 'Fire Storm',
  index: 902,
  element: 0,
  rangeType: 3,
  effects: [dmgFx(4, 15, 0)],
});

const fireballDotSpell = () => ({
  name: 'Fireball DoT',
  index: 903,
  element: 0,
  rangeType: 4,
  effects: [dmgFx(1, 10, 3)],
});

const healAreaSpell = () => ({
  name: 'Area Heal',
  index: 904,
  element: 4,
  rangeType: 4,
  effects: [healFx(15)],
});

function makePlayer() {
  return {
    isPlayer: true,
    level: 5,
    health: 100,
    maxHealth: 100,
    magicka: 500,
    maxMagicka: 500,
    skills: new Array(40).fill(50),
    skillUses: new Array(40).fill(0),
    stats: { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 },
    career: {},
    activeEffects: [],
    spells: [],
  };
}

function makeActor(id, feet, { team = 'Criminals', isHostile = true, ...extra } = {}) {
  return {
    id,
    dead: false,
    ai: { feet, height: 1.8, isHostile },
    entity: {
      level: 3,
      health: 100,
      maxHealth: 100,
      magicka: 50,
      maxMagicka: 50,
      team,
      mobileTeam: team,
      skills: new Array(40).fill(30),
      stats: { willpower: 30, endurance: 30, luck: 30 },
      career: {},
      activeEffects: [],
    },
    ...extra,
  };
}

function makeHarness(foesList = []) {
  const player = makePlayer();
  const playerHurts = [];
  const playerHeals = [];
  const foeHurts = [];
  const sinkCalls = [];
  const said = [];

  const foeSinks = (f, fromPlayer = true) => {
    sinkCalls.push({ id: f.id, fromPlayer });
    return {
      hurt: (n, o = {}) => {
        const fp = o.fromPlayer ?? fromPlayer;
        foeHurts.push({ id: f.id, n, fromPlayer: fp, round: !!o.round });
        f.entity.health -= n;
        if (fp) {
          f.ai.isHostile = true;
          if (f.entity.team === 'PlayerAlly') f.entity.team = 'Orcs';
        }
      },
      heal: (n) => {
        f.entity.health = Math.min(f.entity.maxHealth, f.entity.health + n);
      },
      drainMagicka() {},
      restoreMagicka() {},
      drainFatigue() {},
      restoreFatigue() {},
    };
  };

  const magic = createPlayerMagic({
    renderer: { createBillboardBatch: () => ({}), destroyBillboardBatch: () => {} },
    audio: { playOneShot() {}, play3d() {}, playOneShotId() {}, play3dId() {} },
    getTexture: async () => ({ getSize: () => [16, 16], getScale: () => [0, 0] }),
    uploadRecord() {},
    uploadRecordFrame() {},
    collider: { raycast: () => Infinity },
    playerEntity: player,
    playerSinks: {
      hurt: (n) => {
        playerHurts.push(n);
        player.health -= n;
      },
      heal: (n) => {
        playerHeals.push(n);
        player.health = Math.min(player.maxHealth, player.health + n);
      },
      drainMagicka() {},
      restoreMagicka() {},
      drainFatigue() {},
      restoreFatigue() {},
      say: (l) => said.push(l),
    },
    say: (l) => said.push(l),
    surfacePlayer() {},
    foes: () => foesList,
    foeSinks,
    absorbCtx: () => ({ inside: true, day: false }),
    rolls: () => 0.99,
    startCastAnim: null,
  });

  return { player, magic, foeSinks, playerHurts, playerHeals, foeHurts, sinkCalls, said };
}

test('AoE FF settings contract: Combat > Rules & armour placement, checkFeature, defaults, and 26 locales', () => {
  resetPrefs();
  assert.equal(getPref(AOE_SELF_FF_PREF), true);
  assert.equal(getPref(AOE_ALLY_FF_PREF), false);
  assert.equal(aoeSelfFriendlyFireEnabled(), true);
  assert.equal(aoeAllyFriendlyFireEnabled(), false);

  for (const id of ['aoe-self-friendly-fire', 'aoe-ally-friendly-fire']) {
    const loc = whereIs(`feat:${id}`);
    assert.equal(loc?.tab?.id, 'combat', `${id} lives on Combat tab`);
    assert.equal(loc?.section?.id, 'rules', `${id} lives in Rules & armour section`);
    const entry = FEATURES.find((f) => f.id === id);
    assert.ok(entry, `${id} exists in FEATURES`);
    assert.deepEqual(checkFeature(entry), [], `${id} passes checkFeature`);
  }

  const requiredKeys = [
    'features.aoeSelfFriendlyFire.title',
    'features.aoeSelfFriendlyFire.note',
    'features.aoeAllyFriendlyFire.title',
    'features.aoeAllyFriendlyFire.note',
  ];
  const localesDir = path.resolve('locales');
  const dirs = fs.readdirSync(localesDir, { withFileTypes: true }).filter((d) => d.isDirectory());
  assert.equal(dirs.length, 26);
  for (const dir of dirs) {
    const csvPath = path.join(localesDir, dir.name, 'Port_Strings.csv');
    const text = fs.readFileSync(csvPath, 'utf8');
    for (const k of requiredKeys) {
      assert.ok(text.includes(k), `Missing ${k} in ${csvPath}`);
    }
  }
  resetPrefs();
});

test('AoE Self FF: toggles player self-damage on player AreaAtRange blasts while enemy blasts and beneficial AoE still apply', () => {
  resetPrefs();
  const hostile = makeActor('hostile', [1, 0, 0]);
  const { player, magic, playerHurts, playerHeals, foeHurts } = makeHarness([hostile]);
  const fb = fireballSpell();

  // Default ON: player's own Fireball at feet hurts both player and hostile
  magic.explodeAt([0, 0.5, 0], fb, 5, [0, 0, 0], { entity: player });
  assert.ok(playerHurts.length > 0, 'self FF ON hurts player');
  assert.ok(foeHurts.some((h) => h.id === 'hostile'), 'hostile is hit');

  // Toggle OFF: player takes 0 damage from own Fireball, hostile still takes damage
  setPref(AOE_SELF_FF_PREF, false);
  assert.equal(aoeSelfFriendlyFireEnabled(), false);
  const hurtsBefore = playerHurts.length;
  const foeHurtsBefore = foeHurts.length;
  magic.explodeAt([0, 0.5, 0], fb, 5, [0, 0, 0], { entity: player });
  assert.equal(playerHurts.length, hurtsBefore, 'self FF OFF spares player from own Fireball');
  assert.ok(foeHurts.length > foeHurtsBefore, 'hostile still takes damage');

  // Enemy Fireball still hurts player even when self FF is OFF
  magic.explodeAt([0, 0.5, 0], fb, 5, [0, 0, 0], { entity: hostile.entity, foe: hostile });
  assert.ok(playerHurts.length > hurtsBefore, 'enemy AoE still hurts player when self FF is OFF');

  // Beneficial AoE gift (Area Heal) still heals player when self FF is OFF
  player.health = 50;
  magic.readySpell(healAreaSpell());
  magic.castInput([0, 1.5, 0], [0, 0, 1]);
  assert.ok(playerHeals.length > 0 && player.health > 50, 'beneficial AoE still heals caster');

  resetPrefs();
});

test('AoE Ally FF: AreaAtRange and AreaAroundCaster spare allies when OFF, and damage all ally types WITHOUT aggro when ON', () => {
  resetPrefs();
  const allyGeneric = makeActor('allyGeneric', [1, 0, 0], { team: 'PlayerAlly', isHostile: false });
  const allyShipmate = makeActor('allyShipmate', [1.2, 0, 0], { team: 'PlayerAlly', isHostile: false, shipmate: true, companion: 'c1' });
  const allyDefender = makeActor('allyDefender', [1.4, 0, 0], { team: 'PlayerAlly', isHostile: false, defender: true });
  const allyMinion = makeActor('allyMinion', [1.6, 0, 0], { team: 'PlayerAlly', isHostile: false, livingRole: 'undead_minion' });
  const allyChampion = makeActor('allyChampion', [1.8, 0, 0], { team: 'PlayerAlly', isHostile: false, livingRole: 'apotheosis_champion' });
  const sparProtected = makeActor('sparProtected', [1.9, 0, 0], { team: 'Criminals', isHostile: false, _sparGraceLeft: 4 });
  const hostile = makeActor('hostile', [2.0, 0, 0]);

  const all = [allyGeneric, allyShipmate, allyDefender, allyMinion, allyChampion, sparProtected, hostile];
  for (const a of [allyGeneric, allyShipmate, allyDefender, allyMinion, allyChampion]) {
    assert.equal(isAoeAlly(a), true, `${a.id} recognized as AoE ally`);
  }
  assert.equal(isAoeAlly(hostile), false);
  assert.equal(sparedByPlayer(allyShipmate), true);

  const { player, magic, foeHurts, sinkCalls } = makeHarness(all);
  const fb = fireballSpell();
  const fs = firestormSpell();

  // Default OFF: AreaAtRange and AreaAroundCaster hit ONLY hostile
  magic.explodeAt([0, 0.5, 0], fb, 5, [10, 0, 10], { entity: player });
  assert.deepEqual([...new Set(foeHurts.map((h) => h.id))], ['hostile'], 'AreaAtRange spares all allies when OFF');

  foeHurts.length = 0;
  magic.readySpell(fs);
  magic.castInput([0, 1.5, 0], [0, 0, 1]);
  assert.deepEqual([...new Set(foeHurts.map((h) => h.id))], ['hostile'], 'AreaAroundCaster spares all allies when OFF');

  // Toggle ON: all allies take damage, but fromPlayer === false, no _provokedByPlayer, no team/hostility flip
  setPref(AOE_ALLY_FF_PREF, true);
  assert.equal(aoeAllyFriendlyFireEnabled(), true);

  foeHurts.length = 0;
  sinkCalls.length = 0;
  magic.explodeAt([0, 0.5, 0], fb, 5, [10, 0, 10], { entity: player });
  for (const a of [allyGeneric, allyShipmate, allyDefender, allyMinion, allyChampion]) {
    assert.ok(foeHurts.some((h) => h.id === a.id && h.fromPlayer === false), `${a.id} took AreaAtRange damage with fromPlayer=false`);
    assert.ok(sinkCalls.some((s) => s.id === a.id && s.fromPlayer === false), `${a.id} sink created with fromPlayer=false`);
    assert.equal(a.entity.team, 'PlayerAlly', `${a.id} stays PlayerAlly`);
    assert.equal(a.ai.isHostile, false, `${a.id} does not turn hostile`);
    assert.equal(a.entity._provokedByPlayer, undefined, `${a.id} not marked _provokedByPlayer`);
  }
  assert.ok(foeHurts.some((h) => h.id === 'hostile' && h.fromPlayer === true), 'hostile still takes fromPlayer=true');
  assert.equal(foeHurts.some((h) => h.id === 'sparProtected'), false, 'spar-protected foe remains immune');

  // AreaAroundCaster also damages allies without aggro when ON
  foeHurts.length = 0;
  magic.readySpell(fs);
  magic.castInput([0, 1.5, 0], [0, 0, 1]);
  for (const a of [allyGeneric, allyShipmate, allyDefender, allyMinion, allyChampion]) {
    assert.ok(foeHurts.some((h) => h.id === a.id && h.fromPlayer === false), `${a.id} took AreaAroundCaster damage with fromPlayer=false`);
    assert.equal(a.entity.team, 'PlayerAlly');
    assert.equal(a.ai.isHostile, false);
  }

  resetPrefs();
});

test('AoE Ally FF: DoT rounds and direct AreaAtRange missile flight respect setting and keep zero aggro', () => {
  resetPrefs();
  const ally = makeActor('allyDot', [0, 0, 3], { team: 'PlayerAlly', isHostile: false });
  const { player, magic, foeSinks, foeHurts } = makeHarness([ally]);

  // 1) Direct missile flight aimed at ally: passes through when OFF, detonates on ally with fromPlayer=false when ON
  magic.readySpell(fireballSpell());
  magic.castInput([0, 1.0, 0], [0, 0, 1]);
  for (let i = 0; i < 20; i++) magic.update(0.05, [0, 0, -5], [0, 0, 1]);
  assert.equal(foeHurts.length, 0, 'Fireball missile passes through ally when Ally FF is OFF');

  setPref(AOE_ALLY_FF_PREF, true);
  magic.readySpell(fireballSpell());
  magic.castInput([0, 1.0, 0], [0, 0, 1]);
  for (let i = 0; i < 20; i++) magic.update(0.05, [0, 0, -5], [0, 0, 1]);
  assert.ok(foeHurts.some((h) => h.id === 'allyDot' && h.fromPlayer === false), 'Fireball missile hits ally with fromPlayer=false when ON');
  assert.equal(ally.entity.team, 'PlayerAlly');
  assert.equal(ally.ai.isHostile, false);

  // 2) AoE DoT round 2+ via runMagicRoundsFor keeps fromPlayer=false
  ally.entity.stats.willpower = 0;
  foeHurts.length = 0;
  magic.explodeAt([0, 0.5, 3], fireballDotSpell(), 5, [0, 0, -5], { entity: player });
  assert.ok(foeHurts.some((h) => h.id === 'allyDot' && h.fromPlayer === false && h.round === true), 'initial DoT round is noAggro');

  foeHurts.length = 0;
  runMagicRoundsFor(ally.entity, 0, 1, { sinks: foeSinks(ally, false), rolls: () => 0.99 });
  assert.ok(foeHurts.some((h) => h.id === 'allyDot' && h.fromPlayer === false && h.round === true), 'subsequent DoT round keeps fromPlayer=false');
  assert.equal(ally.entity.team, 'PlayerAlly');
  assert.equal(ally.ai.isHostile, false);
  assert.equal(ally.entity._provokedByPlayer, undefined);

  resetPrefs();
});

test('Console commands: aoe_ff / aoeff and addspell fireball/firestorm/fireball_dot work cleanly', () => {
  resetPrefs();
  const cmd = getConsoleCommand('aoe_ff');
  const alias = getConsoleCommand('aoeff');
  assert.ok(cmd && alias);

  assert.equal(cmd.callback(['status']), 'AoE Friendly Fire: self=ON, allies=OFF');
  assert.equal(cmd.callback(['self', 'off']), 'AoE Friendly Fire: self=OFF, allies=OFF');
  assert.equal(aoeSelfFriendlyFireEnabled(), false);

  assert.equal(alias.callback(['allies', 'on']), 'AoE Friendly Fire: self=OFF, allies=ON');
  assert.equal(aoeAllyFriendlyFireEnabled(), true);

  assert.equal(cmd.callback(['off']), 'AoE Friendly Fire: self=OFF, allies=OFF');
  assert.equal(cmd.callback(['on']), 'AoE Friendly Fire: self=ON, allies=ON');

  const addSpell = getConsoleCommand('addspell');
  assert.ok(addSpell);
  assert.match(addSpell.callback(['fireball']), /Fireball/);
  assert.match(addSpell.callback(['firestorm']), /Fire Storm/);
  assert.match(addSpell.callback(['fireball_dot']), /Fireball \(DoT\)/);

  resetPrefs();
});
