// @ts-check
import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { hasBowAttack } from '../../src/scenes/hostCombat.js';
import { MONSTER_SPELL_LISTS } from '../../src/systems/enemySpells.js';
import {
  composeBanditCampSubordinates,
  composeCheckpointGuards,
  composeNemesisMinions,
  composeWarSquadRoles,
  enrichHumanoidSkirmishPool,
  composeFortPack,
} from '../../src/systems/living/tacticalPacks.js';
import { buildLivingSiteBlueprint, LIVING_SITE_KINDS } from '../../src/systems/living/livingWorldSpawner.js';
import { resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import { restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';
import { getTargets, PLAYER_TARGET } from '../../src/characters/enemy/enemyTargets.js';
import {
  BOSS_TRAITS,
  CURB_SHARE,
  CURB_SHARE_ELITE,
  WRATH_AFTER_S,
  WRATH_HP_SHARE,
  WRATH_X,
  giveBossTraits,
  bossTake,
  bossTakeAt,
} from '../../src/systems/bossTraits.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';

function assertRealSpawnable(mobileType, role = '') {
  const b = ENEMY_BASICS[mobileType];
  assert.ok(b, `mobileType ${mobileType} must exist in ENEMY_BASICS`);
  assert.ok(Number.isInteger(b.maleTexture) && b.maleTexture > 0, `mobileType ${mobileType} must have valid maleTexture`);
  if (role === 'archer') {
    assert.equal(hasBowAttack(b), true, `archer mobileType ${mobileType} must have hasBowAttack`);
  }
  if (role === 'caster') {
    const canCast = mobileType >= 128 ? b.castsMagic === true : Boolean(MONSTER_SPELL_LISTS[mobileType]);
    assert.equal(canCast, true, `caster mobileType ${mobileType} must be able to cast spells`);
  }
}

test('Block 4: all tactical pack composers emit only real spawnable mobileTypes with valid archer/caster capabilities', () => {
  for (const lvl of [1, 5, 10, 15, 25]) {
    for (const m of composeBanditCampSubordinates(6, lvl)) assertRealSpawnable(m.mobileType, m.tacticalRole);
    for (const m of composeCheckpointGuards(6, lvl)) assertRealSpawnable(m.mobileType, m.tacticalRole);
    for (const m of composeNemesisMinions(4, lvl, MOBILE_TYPES.Assassin)) assertRealSpawnable(m.mobileType, m.tacticalRole);
    for (const m of composeNemesisMinions(4, lvl, MOBILE_TYPES.Battlemage)) assertRealSpawnable(m.mobileType, m.tacticalRole);
    for (const m of composeWarSquadRoles(4, { warKind: 'mundane', isSideB: false, playerLevel: lvl })) assertRealSpawnable(m.mobileType, m.tacticalRole);
    for (const m of composeWarSquadRoles(4, { warKind: 'mundane', isSideB: true, playerLevel: lvl })) assertRealSpawnable(m.mobileType, m.tacticalRole);
    for (const m of composeWarSquadRoles(4, { warKind: 'divine', godKind: 'daedra', playerLevel: lvl })) assertRealSpawnable(m.mobileType, m.tacticalRole);
    for (const m of composeWarSquadRoles(4, { warKind: 'divine', godKind: 'aedra', playerLevel: lvl })) assertRealSpawnable(m.mobileType, m.tacticalRole);

    const urb = enrichHumanoidSkirmishPool([MOBILE_TYPES.Warrior, MOBILE_TYPES.Rogue], 5, { side: 'rebels', playerLevel: lvl });
    assert.equal(urb.length, 5);
    for (const id of urb) assertRealSpawnable(id);
    if (lvl >= 5) {
      assert.ok(urb.includes(MOBILE_TYPES.Archer), 'urban humanoid pack includes archer');
      assert.ok(urb.includes(MOBILE_TYPES.Nightblade), 'urban humanoid pack includes caster');
    }

    // Monster pools stay untouched
    assert.deepEqual(enrichHumanoidSkirmishPool([MOBILE_TYPES.Rat, MOBILE_TYPES.GiantBat], 4, { playerLevel: lvl }), [
      MOBILE_TYPES.Rat,
      MOBILE_TYPES.GiantBat,
      MOBILE_TYPES.Rat,
      MOBILE_TYPES.GiantBat,
    ]);

    for (const base of [MOBILE_TYPES.Warrior, MOBILE_TYPES.Orc, MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Daedroth, MOBILE_TYPES.Giant]) {
      const fort = composeFortPack(base, 5, lvl);
      assert.equal(fort.length, 5);
      for (const id of fort) assertRealSpawnable(id);
    }
  }
});

test('Block 4: tactical packs preserve teams, suppressInfighting/campId isolation, and aggro toward player/rivals', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const baseArgs = {
    centerX: 0,
    centerZ: 0,
    heightAt: () => 0,
    regionIndex: 17,
    playerEntity: { level: 12, goldPieces: 5000, skills: {} },
    nowMinutes: 1000,
    rng: () => 0.4,
  };

  const banditBp = buildLivingSiteBlueprint({ ...baseArgs, kind: LIVING_SITE_KINDS.BANDIT_CAMP });
  assert.ok(banditBp.actors.length >= 3);
  for (const a of banditBp.actors) {
    assert.equal(a.team, 'Criminals');
    assert.equal(a.suppressInfighting, true);
    assert.equal(a.hostile, true);
    assertRealSpawnable(a.mobileType);
  }
  // Real getTargets check: mixed Warrior + Archer + Battlemage/Nightblade bandits never fight each other and target player
  const mockCollider = { raycast: () => null };
  const fakeCandidates = banditBp.actors.map((a, idx) => ({
    ai: { feet: [idx * 2, 0, 10], yaw: Math.PI, height: 1.8, sightRadius: 60, isHostile: true, target: null, collider: mockCollider },
    entity: { team: a.team, mobileTeam: a.team, suppressInfighting: a.suppressInfighting, campId: 'camp1', health: 100 },
  }));
  const res = getTargets(fakeCandidates[0], fakeCandidates, [0, 0, 0], { infighting: true });
  assert.equal(res.target, PLAYER_TARGET, 'bandit leader targets player, never campmates');

  const cpBp = buildLivingSiteBlueprint({ ...baseArgs, kind: LIVING_SITE_KINDS.CHECKPOINT });
  for (const a of cpBp.actors) {
    assert.equal(a.team, 'SkirmishLaw');
    assert.equal(a.suppressInfighting, true);
  }

  const nemBp = buildLivingSiteBlueprint({ ...baseArgs, kind: LIVING_SITE_KINDS.NEMESIS_AMBUSH });
  for (const a of nemBp.actors) {
    assert.equal(a.team, 'NemesisGang');
    assert.equal(a.suppressInfighting, true);
  }

  const warBp = buildLivingSiteBlueprint({ ...baseArgs, kind: LIVING_SITE_KINDS.WAR_SKIRMISH });
  const sideA = warBp.actors.filter((a) => a.factionSide === 'guards');
  const sideB = warBp.actors.filter((a) => a.factionSide === 'rebels');
  assert.ok(sideA.length >= 2 && sideB.length >= 2);
  assert.ok(sideA.every((a) => a.team === 'WarSideA'));
  assert.ok(sideB.every((a) => a.team === 'WarSideB'));
});

test('Block 4: BOSS_TRAITS revamp (wrathful <45% HP or 25s, non-raid curbing 15%, 26 locales)', () => {
  // Wrath triggers immediately on crossing <45% HP even at t=1s
  const said = [];
  const wr = { maxHealth: 1000, health: 600, damageScale: 2 };
  giveBossTraits(wr, ['wrathful']);
  const dealt1 = bossTakeAt(wr, 100, false, 1, (l) => said.push(l), () => 'Nemesis');
  assert.equal(dealt1, 100);
  assert.equal(wr.bossWrath, undefined, '500/1000 = 50% >= 45%, not enraged yet');
  wr.health -= dealt1; // 500
  const dealt2 = bossTakeAt(wr, 100, false, 2, (l) => said.push(l), () => 'Nemesis'); // 400/1000 = 40% < 45%
  assert.equal(dealt2, 100);
  assert.equal(wr.bossWrath, true, 'enraged immediately below 45% HP');
  assert.equal(wr.damageScale, 2 * WRATH_X);
  assert.equal(said.length, 1);

  // Lethal blow does not trigger wrath
  const wrDead = { maxHealth: 100, health: 40, damageScale: 1 };
  giveBossTraits(wrDead, ['wrathful']);
  bossTakeAt(wrDead, 50, false, 1, null, () => 'Dead');
  assert.equal(wrDead.bossWrath, undefined, 'no wrath when blow is lethal');

  // Time fallback at 25s
  const wrTime = { maxHealth: 1000, health: 900, damageScale: 1 };
  giveBossTraits(wrTime, ['wrathful']);
  bossTake(wrTime, 10, { nowS: 10 });
  bossTake(wrTime, 10, { nowS: 10 + WRATH_AFTER_S - 1 });
  assert.equal(wrTime.bossWrath, undefined);
  bossTake(wrTime, 10, { nowS: 10 + WRATH_AFTER_S });
  assert.equal(wrTime.bossWrath, true);
  assert.equal(WRATH_AFTER_S, 25);
  assert.equal(WRATH_HP_SHARE, 0.45);

  // Curbing 15% non-raid vs 5% raidLeader
  const elite = { maxHealth: 1000, health: 1000 };
  giveBossTraits(elite, ['curbing']);
  assert.equal(bossTake(elite, 500).damage, 1000 * CURB_SHARE_ELITE);
  const raid = { maxHealth: 1000, health: 1000, raidLeader: true };
  giveBossTraits(raid, ['curbing']);
  assert.equal(bossTake(raid, 500).damage, 1000 * CURB_SHARE);

  // 26 locales have updated wrathful & curbing rules
  const locales = ['en', 'ru', 'uk', 'bg', 'cs', 'da', 'de', 'el', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja', 'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'sv', 'tr', 'vi', 'zh-Hans', 'zh-Hant'];
  for (const loc of locales) {
    const csv = readFileSync(new URL(`../../locales/${loc}/Port_Strings.csv`, import.meta.url), 'utf8');
    const wrathLine = csv.split(/\r?\n/).find((l) => l.startsWith('bossTraits.rule.wrathful,') || l.startsWith('"bossTraits.rule.wrathful",'));
    assert.ok(wrathLine && wrathLine.includes('{pct}') && wrathLine.includes('{s}'), `${loc}: wrathful rule has {pct} and {s}`);
  }
});

test('Block 4: testtrait console command is registered and validates traits', async () => {
  const cmd = getConsoleCommand('testtrait');
  assert.ok(cmd);
  const helpOut = await cmd.callback([]);
  for (const tr of BOSS_TRAITS) assert.ok(helpOut.includes(tr), `lists ${tr}`);
  const badMob = await cmd.callback(['wrathful', 'nonexistentmob']);
  assert.match(badMob, /Unknown mob/i);
});
