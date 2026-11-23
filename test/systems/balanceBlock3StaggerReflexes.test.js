import '../modsOff.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setPref } from '../../src/systems/uiPrefs.js';
import { Collider } from '../../src/player/collider.js';
import { PlayerMotor } from '../../src/player/motor.js';
import { TRANSPORT_MODES } from '../../src/systems/transport.js';
import { EnemyAttack, resetMeleeTimer } from '../../src/characters/enemy/enemyAttack.js';
import { MOBILE_TYPES as M } from '../../src/characters/mobile/mobileTypes.js';
import { WEAPONS } from '../../src/characters/weapons.js';
import { setTacticsClock } from '../../src/ai/tacticsClock.js';
import { resetTactics, noteLocalPlayer } from '../../src/ai/tactics.js';
import { resetBlows, BLOW_TIER_LEVEL, blowTier } from '../../src/ai/foeBlows.js';
import { ARENA_BLOW_TIER_LEVEL } from '../../src/net/arena/arenaLaw.js';
import { TELL, reflexesWindupMult, reflexesCooldownMult, windupSeconds, blowCooldown } from '../../src/ai/tells.js';
import {
  BLOW_EFFECT,
  blowEffectOf,
  queueBlowEffect,
  drainBlowEffects,
  applyPlayerStagger,
  clearPlayerStagger,
  playerStaggerLocked,
  playerStaggered,
  playerStaggerState,
  _resetBlowEffectsForTests,
} from '../../src/systems/blowEffects.js';
import { calculateAttackDamage } from '../../src/combat/formulas.js';
import { blowTakenScale, blowTaken } from '../../src/systems/blowTaken.js';
import { afflictionRows, statusTiles } from '../../src/ui/hud/hudStatus.js';
import { activeSpellIcons, STAGGERED_GLYPH } from '../../src/ui/hud/hudActiveSpells.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';

let T = 10;
setTacticsClock(() => T);

beforeEach(() => {
  T = 10;
  resetTactics();
  resetBlows();
  _resetBlowEffectsForTests();
  setPref('enhancedAI', true);
});

test('Block 3: BLOW_TIER_LEVEL lowered to 5 and enemy stagger/overreach nerfed', () => {
  assert.equal(BLOW_TIER_LEVEL, 5);
  assert.equal(ARENA_BLOW_TIER_LEVEL, 5);
  assert.equal(blowTier({ level: 4, mobileType: M.Orc }), false);
  assert.equal(blowTier({ level: 5, mobileType: M.Orc }), true);
  assert.equal(TELL.STAGGER_TAKEN, 1.1);
  assert.equal(TELL.PUNISH_TAKEN, 1.12);
  assert.equal(TELL.STAGGER_IMMUNE, 6);
  assert.deepEqual({ ...TELL.STAGGER_S }, { light: 0.9, medium: 0.8, heavy: 0.65, massive: 0.5 });
});

test('Block 3: Hard Player Stagger locks swing/cast 0.45s, slows 0.55s, adds +15% taken for 1.0s, and enforces 4.5s guard', () => {
  const rattles = [];
  const shakes = [];
  const motor = { riding: false, blowRattle: (s, k) => rattles.push([s, k]) };
  const player = {
    isPlayer: true,
    isClass: false,
    level: 12,
    health: 300,
    maxHealth: 300,
    stats: { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 },
    skills: new Array(40).fill(50),
    armorValues: new Array(7).fill(60),
    activeEffects: [],
  };

  assert.equal(applyPlayerStagger({ motor, entity: player, shake: (k) => shakes.push(k), now: T }), true);
  assert.equal(playerStaggerLocked(T + 0.4), true);
  assert.equal(playerStaggerLocked(T + 0.46), false);
  assert.equal(playerStaggered(T + 0.9), true);
  assert.equal(playerStaggered(T + 1.05), false);
  assert.deepEqual(rattles, [[0.55, 0.6]]);
  assert.deepEqual(shakes, [BLOW_EFFECT.STAGGER_SHAKE]);
  assert.equal(blowTakenScale(null, player), 1.15);
  assert.equal(blowTaken(100, null, player), 115);

  const attacker = { isPlayer: false, isClass: false, level: 12, skills: 50, stats: player.stats, career: { attackModifierFlags: 0 } };
  const opts = { weapon: { templateIndex: WEAPONS.Longsword, material: 1, flags: 0 }, toHitMod: 1000, rolls: () => 0.5, dfRand: () => 0.5 };
  const dmgStaggered = calculateAttackDamage(attacker, player, opts);
  clearPlayerStagger(player);
  const dmgPlain = calculateAttackDamage(attacker, player, opts);
  assert.equal(dmgStaggered, Math.max(1, Math.round(dmgPlain * 1.15)));

  // Anti-stunlock guard: 1.0s stagger + 4.5s guard = 5.5s total before next stagger
  assert.equal(applyPlayerStagger({ motor, entity: player, now: T }), true);
  assert.equal(applyPlayerStagger({ motor, entity: player, now: T + 3.0 }), false);
  assert.equal(applyPlayerStagger({ motor, entity: player, now: T + 5.6 }), true);
});

test('Block 3: iron lunge/sweep knock down, and riding skips knockdown + walk slow while keeping stagger lock & vuln', () => {
  assert.equal(blowEffectOf('lunge', true).knockdown, true);
  assert.equal(blowEffectOf('sweep', true).knockdown, true);

  const m = new PlayerMotor(new Collider(() => 0), { speed: 50, running: 30, swimming: 30 });
  m.spawn(0, 0, 0);
  m.transportMode = TRANSPORT_MODES.Horse; // Horse riding
  assert.equal(m.riding, true);
  assert.equal(m.blowKnockDown(0.9, 0.6), false);

  const rattles = [];
  const mountedMotor = { riding: true, blowRattle: (s, k) => rattles.push([s, k]), blowKnockDown: () => false, blowPush: () => {} };
  const player = { isPlayer: true, health: 200, maxHealth: 200, activeEffects: [] };
  queueBlowEffect(blowEffectOf('slam', true), 25, [1, 0], { id: 'orc' });
  drainBlowEffects({ motor: mountedMotor, entity: player, now: T });
  assert.deepEqual(rattles, [], 'mounted player is not slowed by blowRattle');
  assert.equal(playerStaggerLocked(T + 0.1), true);
  assert.equal(playerStaggered(T + 0.1), true);
  assert.equal(playerStaggerState(T + 0.1).staggered, true);
});

test('Block 3: HUD chip Staggered renders in afflictionRows and activeSpellIcons, and all 26 locales have keys', () => {
  const player = { isPlayer: true, health: 200, playerStaggerUntil: T + 0.8, activeEffects: [] };
  const rows = afflictionRows(player);
  assert.ok(rows.some((r) => r.key === 'staggered' && r.glyph === 'staggered' && r.blink === true));
  const tiles = statusTiles({ afflictions: rows });
  assert.ok(tiles.some((x) => x.key === 'staggered' && x.glyph === 'staggered'));
  const icons = activeSpellIcons(player).other;
  assert.ok(icons.some((i) => i.glyph === STAGGERED_GLYPH));

  T += 1.0;
  assert.equal(afflictionRows(player).some((r) => r.key === 'staggered'), false);

  const locales = ['en', 'ru', 'uk', 'bg', 'cs', 'da', 'de', 'el', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja', 'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'sv', 'tr', 'vi', 'zh-Hans', 'zh-Hant'];
  for (const loc of locales) {
    const csv = readFileSync(new URL(`../../locales/${loc}/Port_Strings.csv`, import.meta.url), 'utf8');
    assert.ok(csv.includes('"hud.status.staggered"'), `${loc}: hud.status.staggered`);
    assert.ok(csv.includes('"hud.status.staggeredTip"'), `${loc}: hud.status.staggeredTip`);
  }
});

test('Block 3: live playerEntity.reflexes updates EnemyAttack, tactics windups/cooldowns, and console commands', () => {
  const player = { isPlayer: true, reflexes: 2, health: 200, maxHealth: 200 };
  const atk = new EnemyAttack({ liveSpeed: () => 50, playerLevel: () => 10, reflexes: () => player.reflexes, rolls: () => 0.5 });
  assert.equal(atk.reflexes, 2);
  player.reflexes = 0; // Very High
  assert.equal(atk.reflexes, 0);
  assert.ok(resetMeleeTimer(10, atk.reflexes, 0.5) < resetMeleeTimer(10, 2, 0.5));

  assert.ok(reflexesWindupMult(0) < reflexesWindupMult(2));
  assert.ok(reflexesCooldownMult(0) < reflexesCooldownMult(2));
  assert.ok(windupSeconds(1.0, null, { roll: 0.5, reflexes: 0 }) < windupSeconds(1.0, null, { roll: 0.5, reflexes: 4 }));
  assert.ok(blowCooldown(null, 0.5, 0) < blowCooldown(null, 0.5, 4));
  noteLocalPlayer([0, 0, 0], [0, 0, 1], 0);

  const refCmd = getConsoleCommand('reflexes');
  assert.ok(refCmd);
  assert.match(refCmd.callback(['veryhigh']), /Very High \(0\)/);

  const stagCmd = getConsoleCommand('stagger');
  assert.ok(stagCmd);
  assert.match(stagCmd.callback(['me']), /Player staggered/);
  assert.match(stagCmd.callback(['clear']), /cleared/);
});
