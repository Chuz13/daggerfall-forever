import test from 'node:test';
import assert from 'node:assert/strict';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { LOCATION_TYPES } from '../../src/formats/mapsFile.js';
import { CLIMATES } from '../../src/formats/mapsTables.js';
import { SKILLS } from '../../src/systems/skills.js';
import {
  LivingTamrielConfig,
  PRESENCE,
  LIVING_ENCOUNTER_SCALE,
  LIVING_URBAN_LOOT,
  resetLivingConfig,
} from '../../src/systems/living/livingConfig.js';
import {
  getLivingSaveData,
  restoreLivingSaveData,
  getLastUndeadHordeMinute,
  setLastUndeadHordeMinute,
} from '../../src/systems/living/livingDirector.js';
import {
  UNDEAD_HORDE_EVENT_ID,
  UNDEAD_HORDE_ACTIVE_CAP,
  UNDEAD_HORDE_GLOBAL_COOLDOWN_MINUTES,
  computeUndeadHordeCounts,
  buildUndeadHordeRoster,
  buildNecromancerBossSpec,
  buildNecromancerBossLoot,
  shouldTriggerUndeadHorde,
  selectUndeadToCrumble,
} from '../../src/systems/living/undeadHorde.js';
import { planUrbanSkirmish } from '../../src/systems/living/urbanDirector.js';
import {
  LIVING_SITE_KINDS,
  createLivingSceneHost,
  executeLivingConsoleCommand,
} from '../../src/systems/living/livingWorldSpawner.js';

function makeMockPlayer({ level = 12, restoration = 80, mysticism = 80 } = {}) {
  return {
    level,
    goldPieces: 500,
    fatigue: 100,
    stats: { Personality: 60, Luck: 60, Intelligence: 70, Willpower: 70 },
    skills: {
      [SKILLS.Restoration]: restoration,
      [SKILLS.Mysticism]: mysticism,
      [SKILLS.Etiquette]: 50,
    },
    legalRep: { 17: 0 },
    regionalReputations: { 17: 0 },
    sGroupReputations: new Array(11).fill(0),
    items: [],
  };
}

function makeTestHost({ player, inLocationRect = true, nowMin = 10000 } = {}) {
  const pool = [];
  const messages = [];
  let openedChoice = null;
  const host = createLivingSceneHost({
    feet: () => [0, 0, 0],
    ready: () => true,
    clock: () => nowMin,
    regionIndex: () => 17,
    locationRecord: () => ({ mapTableData: { mapId: 1700, locationType: LOCATION_TYPES.TownCity }, name: 'TestCity' }),
    inLocationRect: () => inLocationRect,
    onRoad: () => true,
    afloat: () => false,
    heightAt: () => 0,
    playerEntity: () => player,
    spawn: async (mobileType, feet, opts) => {
      const rec = {
        mobileType,
        feet: [...feet],
        dead: false,
        entity: { currentHealth: 100, maxHealth: 100, items: [] },
        ai: { feet: [...feet], isHostile: false, detected: false, target: null, targetSenses: null },
        opts,
      };
      pool.push(rec);
      return rec;
    },
    remove: (f) => {
      const idx = pool.indexOf(f);
      if (idx >= 0) pool.splice(idx, 1);
    },
    inPool: (f) => pool.includes(f),
    say: (msg) => messages.push(msg),
    openChoice: (spec) => {
      openedChoice = spec;
    },
  });
  return { host, pool, messages, getOpenedChoice: () => openedChoice };
}

test('Undead Horde: scales 15 / 30 / 60 by LT encounter scale with 20-active cap', () => {
  const low = computeUndeadHordeCounts(LIVING_ENCOUNTER_SCALE.LOW);
  assert.equal(low.totalUndead, 15);
  assert.equal(low.vanguardCount, 15);
  assert.equal(low.reserveCount, 0);

  const mid = computeUndeadHordeCounts(LIVING_ENCOUNTER_SCALE.MID);
  assert.equal(mid.totalUndead, 30);
  assert.equal(mid.vanguardCount, UNDEAD_HORDE_ACTIVE_CAP);
  assert.equal(mid.reserveCount, 10);

  const high = computeUndeadHordeCounts(LIVING_ENCOUNTER_SCALE.HIGH);
  assert.equal(high.totalUndead, 60);
  assert.equal(high.vanguardCount, UNDEAD_HORDE_ACTIVE_CAP);
  assert.equal(high.reserveCount, 40);
});

test('Undead Horde: crisis-independent trigger works even with political=OFF & persists cooldown', () => {
  resetLivingConfig();
  LivingTamrielConfig.political = PRESENCE.OFF;
  assert.equal(
    shouldTriggerUndeadHorde({
      nowMinutes: 10000,
      lastHordeMinute: -999999,
      presenceTier: PRESENCE.MID,
      isNight: true,
      locationType: LOCATION_TYPES.Graveyard,
      climateIndex: CLIMATES.HauntedWoodlands,
      rng: () => 0.01,
    }),
    true,
  );
  assert.equal(
    shouldTriggerUndeadHorde({
      nowMinutes: 10000,
      lastHordeMinute: 10000 - UNDEAD_HORDE_GLOBAL_COOLDOWN_MINUTES + 10,
      presenceTier: PRESENCE.HIGH,
      rng: () => 0.0,
    }),
    false,
  );

  setLastUndeadHordeMinute(12345);
  const snap = getLivingSaveData();
  setLastUndeadHordeMinute(0);
  restoreLivingSaveData(snap);
  assert.equal(getLastUndeadHordeMinute(), 12345);
});

test('Undead Horde: level-gated roster, Necromancer boss spec, and canonical loot', () => {
  const lowRoster = buildUndeadHordeRoster(15, { playerLevel: 2, rng: () => 0.1 });
  assert.equal(lowRoster.length, 15);
  assert.ok(lowRoster.every((id) => id === MOBILE_TYPES.SkeletalWarrior || id === MOBILE_TYPES.Zombie));

  const highRoster = buildUndeadHordeRoster(60, { playerLevel: 20, rng: () => 0.22 });
  assert.equal(highRoster.length, 60);
  const liches = highRoster.filter((id) => id === MOBILE_TYPES.Lich).length;
  assert.ok(liches <= 2);

  const boss = buildNecromancerBossSpec({ playerLevel: 12, rng: () => 0.5 });
  assert.ok(boss.forcedBossTraits.includes('warded'));
  assert.equal(boss.level, 14);

  const player = makeMockPlayer({ level: 12 });
  const loot = buildNecromancerBossLoot({ playerEntity: player, playerLevel: 12, scale: 2, rng: () => 0.1 });
  assert.ok(loot.length >= 3);
  assert.ok(loot.every((it) => it && typeof it === 'object' && 'value' in it && 'templateIndex' in it));
});

test('Undead Horde: planUrbanSkirmish places vanguard, reserve, and Necromancer boss', () => {
  resetLivingConfig();
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.MID;
  const plan = planUrbanSkirmish({
    centerX: 0,
    centerZ: 0,
    heightSampler: () => 0,
    playerEntity: makeMockPlayer({ level: 10 }),
    forcedEventId: UNDEAD_HORDE_EVENT_ID,
    rng: () => 0.3,
  });
  assert.ok(plan);
  assert.equal(plan.rebels.length, 20);
  assert.equal(plan.hordeReserve.length, 10);
  assert.equal(plan.hordeTotalUndead, 30);
  assert.ok(plan.necromancer);
  resetLivingConfig();
});

test('Undead Horde: wave spawning, boss death 50% crumble, and Option 4 1-on-1 duel', async () => {
  resetLivingConfig();
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.MID;
  LivingTamrielConfig.urbanLootMode = LIVING_URBAN_LOOT.ZERO;
  const player = makeMockPlayer({ level: 15, restoration: 90, mysticism: 90 });

  // 1. Urban horde: test wave spawning + boss death 50% crumble
  const urban = makeTestHost({ player, inLocationRect: true });
  const outUrban = executeLivingConsoleCommand(['spawn', 'urban', UNDEAD_HORDE_EVENT_ID], {
    playerEntity: player,
    playerFeet: [0, 0, 0],
    heightAt: () => 0,
    regionIndex: 17,
    sceneHost: urban.host,
  });
  assert.match(outUrban, /EVT_UNDEAD_HORDE_INVASION/);
  await new Promise((r) => setTimeout(r, 20));

  const site = urban.host.getActiveSite();
  assert.ok(site);
  assert.equal(site.hordeReserve.length, 10);
  assert.ok(site.necromancerFoe);
  // Boss loot bypasses urbanLootMode=ZERO
  assert.ok(site.necromancerFoe.entity.items.length >= 2);
  assert.equal(site.necromancerFoe._suppressLoot, false);

  // Kill 6 vanguard undead so live undead <= 14 triggers wave refill
  const minions = site.foes.filter((f) => f.isHordeMinion);
  assert.equal(minions.length, 20);
  for (let i = 0; i < 6; i++) {
    minions[i].dead = true;
    urban.pool.splice(urban.pool.indexOf(minions[i]), 1);
  }
  site.hordeMinWaveGapS = 0;
  urban.host.frame(1.1);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(site.hordeReserve.length, 4);

  // Kill Necromancer -> reserve cleared & 50% of remaining living undead crumble
  const beforeBossDeath = site.foes.filter((f) => f.isHordeMinion && !f.dead && urban.pool.includes(f)).length;
  site.necromancerFoe.dead = true;
  urban.host.frame(1.1);
  const afterBossDeath = site.foes.filter((f) => f.isHordeMinion && !f.dead && urban.pool.includes(f)).length;
  assert.equal(site.hordeReserve.length, 0);
  assert.equal(afterBossDeath, beforeBossDeath - Math.round(beforeBossDeath * 0.5));

  // 2. Wilderness horde: test Option 2 (Obelisk shatter -> 100% banished, 1-on-1 duel with Necromancer)
  const wild = makeTestHost({ player, inLocationRect: false });
  const outWild = executeLivingConsoleCommand(['spawn', 'undead_horde'], {
    playerEntity: player,
    playerFeet: [0, 0, 0],
    heightAt: () => 0,
    regionIndex: 17,
    sceneHost: wild.host,
  });
  assert.match(outWild, /UNDEAD_HORDE/);
  await new Promise((r) => setTimeout(r, 20));

  wild.host.frame(1.1);
  const choice = wild.getOpenedChoice();
  assert.ok(choice, 'Wilderness horde opens ChoiceWindow');
  assert.equal(choice.options.length, 4);

  // Trigger Option 2 (obelisk shatter -> 1-on-1 duel)
  choice.options[1].action();
  const wildSite = wild.host.getActiveSite();
  assert.equal(wildSite.skirmishStance, 'necromancer_duel');
  assert.equal(wildSite.hordeReserve.length, 0);
  const remainingMinions = wildSite.foes.filter((f) => f.isHordeMinion && !f.dead && wild.pool.includes(f));
  assert.equal(remainingMinions.length, 0);
  assert.equal(wildSite.necromancerFoe.ai.isHostile, true);
  assert.equal(wildSite.necromancerFoe.ai.target, player);
  assert.equal(wildSite.blueprint.meshes.some((m) => m.destructible), false);

  const crumbleEmpty = selectUndeadToCrumble([]);
  assert.deepEqual(crumbleEmpty, []);
  resetLivingConfig();
});

test('Undead Horde: Urban Choice 2 & Wilderness Choice 3 grant reagent to player.items without crashing and omit Supernatural rep', async () => {
  resetLivingConfig();
  LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.LOW;
  const player = makeMockPlayer({ level: 12 });
  player.NecroGrimoireRead = true;

  const totalItems = () => player.items.reduce((sum, it) => sum + (it.stackCount ?? 1), 0);

  // 1. Urban Choice 2 (attackers)
  const urban = makeTestHost({ player, inLocationRect: true });
  executeLivingConsoleCommand(['spawn', 'urban', UNDEAD_HORDE_EVENT_ID], {
    playerEntity: player,
    playerFeet: [0, 0, 0],
    heightAt: () => 0,
    regionIndex: 17,
    sceneHost: urban.host,
  });
  await new Promise((r) => setTimeout(r, 20));
  urban.host.frame(1.1);
  const urbanChoice = urban.getOpenedChoice();
  assert.ok(urbanChoice, 'Urban horde opens ChoiceWindow');
  urbanChoice.options[1].action();
  assert.equal(totalItems(), 1, 'Urban Choice 2 grants 1 reagent item');
  assert.ok(player.legalRep[17] < 0, 'Living legal rep decreases');
  assert.ok(player.sGroupReputations[0] < 0, 'Commoners rep decreases');
  assert.equal(player.sGroupReputations[5] ?? 0, 0, 'SupernaturalBeings rep is untouched');

  // 2. Wilderness Choice 3 (Dark Arts pact)
  const wild = makeTestHost({ player, inLocationRect: false });
  executeLivingConsoleCommand(['spawn', 'undead_horde'], {
    playerEntity: player,
    playerFeet: [0, 0, 0],
    heightAt: () => 0,
    regionIndex: 17,
    sceneHost: wild.host,
  });
  await new Promise((r) => setTimeout(r, 20));
  wild.host.frame(1.1);
  const wildChoice = wild.getOpenedChoice();
  assert.ok(wildChoice, 'Wilderness horde opens ChoiceWindow');
  wildChoice.options[2].action();
  assert.equal(totalItems(), 2, 'Wilderness Choice 3 grants 1 reagent item without crashing');
  assert.equal(wild.host.getActiveSite().skirmishStance, 'peace');
  resetLivingConfig();
});
