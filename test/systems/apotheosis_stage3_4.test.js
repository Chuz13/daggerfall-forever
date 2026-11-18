// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APOTHEOSIS_SIEGE_TIERS,
  CULT_FOUND_FAITH_COST,
  CULT_FOUND_GOLD_COST,
  CULT_UPGRADE_TIERS,
  DIVINE_WAR_SUPPORT_COST,
  DIVINE_WAR_TRUCE_COST,
  DIVINE_SKIRMISH_PACIFY_FAITH_COST,
  WAR_SKIRMISH_PACIFY_GOAL,
  getApotheosisSiegeConfig,
  getCultSiegePreview,
  getActiveCultSieges,
  startCultSiteSiege,
  resolveCultSiegeOutcome,
  getActiveGodWars,
  startInterDeityWar,
  supportGodWarSide,
  enforceGodWarTruce,
  tickStage34Daily,
  getActiveWarForRegion,
  setWarPlayerStance,
  resetMundaneWarProgress,
  canSpawnWarSkirmish,
  markWarSkirmishSpawned,
  resolveWarSkirmishPacify,
  shouldInterruptFastTravelForWar,
  ensurePantheonState,
  ensureCultState,
  ensureCityCultSites,
  foundPlayerUndergroundSanctuary,
  upgradeCultSite,
  selectCultSiteBranch,
  consecrateSiteByForce,
  clearSiteGuardians,
  getRegionInfluence,
  shiftRegionInfluence,
  igniteRegionWar,
  areRegionsAtWar,
  ensureCultPetition,
  proclaimRegionalEdict,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import {
  registerPresenter,
  _resetNotifyForTests,
} from '../../src/systems/notify.js';
import {
  createRegionConditions,
  REGION_FLAGS,
  turnOnConditionFlag,
  conditionFlag,
} from '../../src/systems/region/regionConditions.js';
import { LIVING_ROLL_DEGREE } from '../../src/systems/living/livingRolls.js';
import { LIVING_WILDERNESS_LOOT, LivingTamrielConfig } from '../../src/systems/living/livingConfig.js';
import { LIVING_SITE_KINDS, createLivingSceneHost } from '../../src/systems/living/livingWorldSpawner.js';
import { setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE } from '../../src/systems/living/regionState.js';
import { SKILLS } from '../../src/systems/skills.js';
import { CLIMATES } from '../../src/formats/mapsFile.js';
import { setPref } from '../../src/systems/uiPrefs.js';
import { createApotheosisCultHost } from '../../src/scenes/apotheosisCultHost.js';
import { foeHostile } from '../../src/systems/encounters.js';
import { getTargets, PLAYER_TARGET } from '../../src/characters/enemy/enemyTargets.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { snapshotPlayer, restorePlayer } from '../../src/systems/save/save.js';
import { executeConsoleCommand } from '../../src/systems/consoleCommands.js';
import {
  markFoeHovered,
  foeTarget,
  clearFoeTarget,
  FOE_HOVER_DISTANCE,
} from '../../src/ui/hud/hudFoeTarget.js';

function makeAscended(portfolio = 'war', { region = 17, faith = 2000 } = {}) {
  const ent = {
    name: 'Divus',
    level: 25,
    currentRegionIndex: region,
    goldPieces: 250000,
    fatigue: 200,
    stats: { strength: 65, endurance: 70, willpower: 75, personality: 80, luck: 60 },
    skills: { [SKILLS.Etiquette]: 85 },
    factionRep: { dict: new Map() },
    regionConditions: createRegionConditions(),
    apotheosis: {
      ascended: true,
      stage: 'ascended',
      source: 'mantella',
      portfolio,
      ascendedAtMinutes: 1000,
      faith,
      cultFaithBonus: 2000,
    },
  };
  ensurePantheonState(ent, { nowMinutes: 1000 });
  ensureCultState(ent);
  return ent;
}

test('Stage 3.4: apotheosisTempleSieges 4-tier setting config', () => {
  assert.deepEqual([...APOTHEOSIS_SIEGE_TIERS], ['off', 'low', 'mid', 'high']);

  const offCfg = getApotheosisSiegeConfig('off');
  assert.equal(offCfg.enabled, false);
  assert.equal(offCfg.maxActiveSieges, 0);
  assert.equal(offCfg.fastTravelInterruptChance, 0);

  const lowCfg = getApotheosisSiegeConfig('low');
  assert.equal(lowCfg.dailySiegeChance, 0.25);
  assert.equal(lowCfg.maxActiveSieges, 2);
  assert.equal(lowCfg.skirmishCooldownMinutes, 300);
  assert.equal(lowCfg.fastTravelInterruptChance, 0.20);

  const midCfg = getApotheosisSiegeConfig('mid');
  assert.equal(midCfg.dailySiegeChance, 0.50);
  assert.equal(midCfg.maxActiveSieges, 3);
  assert.equal(midCfg.skirmishCooldownMinutes, 120);
  assert.equal(midCfg.fastTravelInterruptChance, 0.40);

  const highCfg = getApotheosisSiegeConfig('high');
  assert.equal(highCfg.dailySiegeChance, 0.80);
  assert.equal(highCfg.maxActiveSieges, 5);
  assert.equal(highCfg.skirmishCooldownMinutes, 60);
  assert.equal(highCfg.fastTravelInterruptChance, 0.70);
});

test('Stage 3.4: Temple & Sanctuary Sieges — Militant 5d timer, victory bonus & expiry sacrifice loss', () => {
  setPref('apotheosisTempleSieges', 'mid');
  const ent = makeAscended('war', { region: 17, faith: 500 });
  shiftRegionInfluence(ent, 17, 'player', 25);

  const f1 = foundPlayerUndergroundSanctuary(ent, {
    mapId: 1017,
    regionIndex: 17,
    locationName: 'Daggerfall',
    branch: 'militant',
    nowMinutes: 1440,
    force: true,
  });
  assert.equal(f1.ok, true);
  upgradeCultSite(ent, f1.site.siteKey, { force: true });
  selectCultSiteBranch(ent, f1.site.siteKey, 'militant', { force: true });

  // Militant branch resists siege for 5 days (7200 min)
  const sRes = startCultSiteSiege(ent, f1.site.siteKey, 'mehrunes_dagon', { nowMinutes: 1440, force: true });
  assert.equal(sRes.ok, true);
  assert.equal(sRes.siege.durationDays, 5);
  assert.equal(sRes.siege.expiresAtMinutes, 1440 + 7200);
  assert.equal(getActiveCultSieges(ent).length, 1);

  // Victory grants +30% Faith bonus for Militant branch
  const faithBefore = ent.apotheosis.faith;
  const vRes = resolveCultSiegeOutcome(ent, f1.site.siteKey, 'victory', { nowMinutes: 2000 });
  assert.equal(vRes.ok, true);
  assert.equal(vRes.faithGained, Math.round(140 * 1.3)); // Tier 2 base 140 * 1.3 = 182
  assert.equal(ent.apotheosis.faith, faithBefore + vRes.faithGained);
  assert.equal(getActiveCultSieges(ent).length, 0);

  // Tier 3 Missionary sanctum sacrificed (expires) loses 12% influence & reverts to attacker Tier 1
  ensureCityCultSites(ent, {
    mapId: 2017,
    regionIndex: 17,
    locationName: 'Wayrest',
    temples: [{ buildingKey: 44, factionId: 26, name: 'Wayrest Temple' }],
  });
  const sites = ensureCultState(ent).sites;
  const temple = Object.values(sites).find((s) => s.mapId === 2017 && s.kind === 'temple');
  clearSiteGuardians(ent, temple.siteKey);
  consecrateSiteByForce(ent, temple.siteKey, { force: true });
  upgradeCultSite(ent, temple.siteKey, { force: true }); // Tier 2
  upgradeCultSite(ent, temple.siteKey, { force: true }); // Tier 3
  selectCultSiteBranch(ent, temple.siteKey, 'missionary', { force: true });

  const infBeforeLoss = getRegionInfluence(ent, 17).playerShare;
  const molagBefore = getRegionInfluence(ent, 17).shares.molag_bal ?? 0;
  const s2 = startCultSiteSiege(ent, temple.siteKey, 'molag_bal', { nowMinutes: 5000, force: true });
  assert.equal(s2.siege.durationDays, 3); // Non-militant is 3 days

  // Advance past expiry via tickStage34Daily
  tickStage34Daily(ent, 5000 + 4400, 7, () => 0.99, 'off');
  assert.equal(temple.siege, null);
  assert.equal(temple.ownerId, 'molag_bal');
  assert.equal(temple.tier, 1);
  assert.equal(temple.branch, null);
  const infAfterLoss = getRegionInfluence(ent, 17).playerShare;
  const molagAfter = getRegionInfluence(ent, 17).shares.molag_bal ?? 0;
  assert.ok(Math.abs((infBeforeLoss - infAfterLoss) - 12) <= 0.2);
  assert.ok(molagAfter - molagBefore >= 5);
});

test('Stage 3.4: Inter-Deity Religious Wars (Support Side 600 Faith & Divine Truce 900 Faith)', () => {
  const ent = makeAscended('order', { region: 17, faith: 2500 });
  const warRes = startInterDeityWar(ent, 'akatosh', 'mehrunes_dagon', {
    nowMinutes: 1440,
    regions: [17, 18, 20],
  });
  assert.equal(warRes.ok, true);
  assert.equal(getActiveGodWars(ent).length, 1);
  assert.equal(conditionFlag(ent.regionConditions, 17, REGION_FLAGS.WarOngoing), true);
  assert.equal(conditionFlag(ent.regionConditions, 20, REGION_FLAGS.WarOngoing), true);

  // Support Akatosh (-600 Faith) locks stance and boosts influence across all 3 war regions
  const f0 = ent.apotheosis.faith;
  const infBefore = getRegionInfluence(ent, 18).playerShare;
  const supRes = supportGodWarSide(ent, warRes.war.id, 'akatosh', { nowMinutes: 1500 });
  assert.equal(supRes.ok, true);
  assert.equal(ent.apotheosis.faith, f0 - DIVINE_WAR_SUPPORT_COST);
  assert.equal(warRes.war.playerStance, 'sideA');
  assert.ok(getRegionInfluence(ent, 18).playerShare > infBefore);

  // Enforce Divine Truce (-900 Faith) halts war across all regions
  const f1 = ent.apotheosis.faith;
  const truceRes = enforceGodWarTruce(ent, warRes.war.id, { nowMinutes: 1600 });
  assert.equal(truceRes.ok, true);
  assert.equal(ent.apotheosis.faith, f1 - DIVINE_WAR_TRUCE_COST);
  assert.equal(getActiveGodWars(ent).length, 0);
  assert.equal(conditionFlag(ent.regionConditions, 17, REGION_FLAGS.WarOngoing), false);
});

test('Stage 3.4: Unified Wilderness War Skirmishes — Divine & Mundane wars, 5-stage Pacify (3 ends war) & Strict No-Sea Guard', () => {
  setPref('apotheosisTempleSieges', 'mid');
  const ent = makeAscended('order', { region: 19, faith: 1000 });
  setRegionCrisis(19, CRISIS_TYPE.WAR, CRISIS_PHASE.MID, 10);
  turnOnConditionFlag(ent.regionConditions, 19, REGION_FLAGS.WarOngoing);

  // Mundane war detected automatically
  const mWar = getActiveWarForRegion(ent, 19);
  assert.ok(mWar);
  assert.equal(mWar.warKind, 'mundane');

  // Strict NON-SEA GUARD: Ocean pixel & sailing player NEVER get skirmishes or fast travel interrupts!
  assert.equal(canSpawnWarSkirmish(ent, 19, 1000, { isOcean: true, isAfloat: false }), false);
  assert.equal(canSpawnWarSkirmish(ent, 19, 1000, { isOcean: false, isAfloat: true }), false);
  assert.equal(shouldInterruptFastTravelForWar(ent, 19, 1000, { isOcean: true, rng: () => 0 }), false);
  assert.equal(shouldInterruptFastTravelForWar(ent, 19, 1000, { isAfloat: true, rng: () => 0 }), false);

  // Land spawns allowed, respects 120m cooldown on mid
  assert.equal(canSpawnWarSkirmish(ent, 19, 1000, { isOcean: false, isAfloat: false }), true);
  assert.equal(shouldInterruptFastTravelForWar(ent, 19, 1000, { isOcean: false, isAfloat: false, rng: () => 0.10 }), true);
  markWarSkirmishSpawned(ent, 1000);
  assert.equal(canSpawnWarSkirmish(ent, 19, 1060, { isOcean: false, isAfloat: false }), false);
  assert.equal(canSpawnWarSkirmish(ent, 19, 1125, { isOcean: false, isAfloat: false }), true);

  // Pacification Critical Failure turns both hostile (low diplomacy fails hard DC 85)
  const lowDip = makeAscended('war', { region: 19, faith: 1000 });
  lowDip.skills[SKILLS.Etiquette] = 10;
  lowDip.stats.personality = 20;
  lowDip.stats.willpower = 20;
  lowDip.regionConditions = ent.regionConditions;
  const lowWar = getActiveWarForRegion(lowDip, 19);
  const critFail = resolveWarSkirmishPacify(lowDip, lowWar, { nowMinutes: 1125, rng: () => 0.0 });
  assert.equal(critFail.degree, LIVING_ROLL_DEGREE.CRITICAL_FAILURE);
  assert.equal(critFail.skirmishStance, 'both_hostile');

  // Reconcile 3 times ends Mundane war in region early!
  const p1 = resolveWarSkirmishPacify(ent, mWar, { nowMinutes: 1125, rng: () => 0.70 });
  assert.equal(p1.pacified, true);
  assert.equal(p1.warEndedEarly, false);
  const p2 = resolveWarSkirmishPacify(ent, mWar, { nowMinutes: 1125, rng: () => 0.99 }); // TRIUMPH adds +2 -> reaches >= 3!
  assert.equal(p2.pacified, true);
  assert.equal(p2.warEndedEarly, true);
  assert.equal(conditionFlag(ent.regionConditions, 19, REGION_FLAGS.WarOngoing), false);
});

test('Stage 3.4: Scene Host spawns WAR_SKIRMISH on land, obeys wildernessLootMode & honors 1-time stance', async () => {
  setPref('apotheosisTempleSieges', 'mid');
  const prevWildLoot = LivingTamrielConfig.wildernessLootMode;
  LivingTamrielConfig.wildernessLootMode = LIVING_WILDERNESS_LOOT.SUPPLIES;
  const ent = makeAscended('order', { region: 21, faith: 1200 });
  const warRes = startInterDeityWar(ent, 'stendarr', 'molag_bal', { nowMinutes: 2000, regions: [21] });
  assert.equal(warRes.ok, true);

  let choiceCount = 0;
  let lastChoice = null;
  const spawnedFoes = [];
  const host = createLivingSceneHost({
    feet: () => [0, 0, 0],
    ready: () => true,
    clock: () => 2500,
    regionIndex: () => 21,
    inLocationRect: () => false,
    onRoad: () => true,
    afloat: () => false,
    climateIndex: () => CLIMATES.TemperateWoodlands,
    heightAt: () => 0,
    playerEntity: () => ent,
    spawn: async (_type, feet, opts) => {
      const rec = {
        dead: false,
        feet,
        allied: !!opts.allied,
        ai: { isHostile: true, detected: false, target: null, feet },
        entity: {
          items: [
            { isGold: true, count: 10 },
            { category: 'Weapon', isWeapon: true, name: 'Iron Sword' },
          ],
        },
      };
      spawnedFoes.push(rec);
      return rec;
    },
    remove: () => {},
    inPool: (f) => spawnedFoes.includes(f),
    say: () => {},
    openChoice: (spec) => {
      choiceCount++;
      lastChoice = spec;
    },
  });

  try {
    const res1 = host.spawnWarSkirmishNow({ force: true });
    assert.equal(res1.ok, true);
    assert.equal(choiceCount, 1);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(spawnedFoes.length, 6); // mid = 3 vs 3
    // Verify wildernessLootMode SUPPLIES filtered out non-consumable weapons!
    assert.equal(spawnedFoes[0].entity.items.some((it) => it.isWeapon), false);
    assert.equal(spawnedFoes[0].entity.items.some((it) => it.isGold), true);

    // Choose Side A (option 1): saves stance on war!
    lastChoice.options[0].action();
    assert.equal(warRes.war.playerStance, 'sideA');

    // Second skirmish in the same war must NOT reopen ChoiceWindow!
    const res2 = host.spawnWarSkirmishNow({ force: true });
    assert.equal(res2.ok, true);
    assert.equal(choiceCount, 1);
  } finally {
    LivingTamrielConfig.wildernessLootMode = prevWildLoot;
  }
});

test('Stage 3.3 -> 3.4 Fix: Edict Petition completion emits live HUD notification', () => {
  _resetNotifyForTests();
  const hudLines = [];
  const unregister = registerPresenter({
    active: () => true,
    priority: 10,
    hudText: (txt) => {
      hudLines.push(txt);
      return true;
    },
  });

  try {
    const ent = makeAscended('order', { region: 17, faith: 1500 });
    shiftRegionInfluence(ent, 17, 'player', 40);
    const f = foundPlayerUndergroundSanctuary(ent, {
      mapId: 901,
      regionIndex: 17,
      locationName: 'Daggerfall',
      nowMinutes: 1000,
      force: true,
    });
    assert.equal(f.ok, true);
    const pet = ensureCultPetition(ent, { regionIndex: 17, nowMinutes: 1000, rng: () => 0.9 });
    assert.equal(pet?.type, 'edict');

    const res = proclaimRegionalEdict(ent, 17, 'prosperity', { nowMinutes: 1100, force: true });
    assert.equal(res.ok, true);
    assert.equal(res.petitionCompleted?.completed, true);
    assert.equal(hudLines.length, 1);
    assert.ok(hudLines[0].includes('+80 Faith') || hudLines[0].includes('80'));
  } finally {
    unregister();
    _resetNotifyForTests();
  }
});

test('Stage 3.4 Polish: getCultSiegePreview & save.js deep-clone of cult & roadBlessing', () => {
  const ent = makeAscended('order', { region: 17, faith: 800 });
  ent.skills[SKILLS.Etiquette] = 50;
  const f = foundPlayerUndergroundSanctuary(ent, {
    mapId: 902,
    regionIndex: 17,
    locationName: 'Daggerfall',
    branch: 'militant',
    nowMinutes: 1000,
    force: true,
  });
  assert.equal(f.ok, true);
  startCultSiteSiege(ent, f.site.siteKey, 'molag_bal', { nowMinutes: 1000, force: true });
  const prev = getCultSiegePreview(ent, f.site);
  assert.ok(prev);
  assert.equal(prev.victoryFaith, Math.round(80 * 1.3)); // Tier 1 Militant +30% = 104
  assert.equal(prev.lossInfluence, 3);

  ent.apotheosis.roadBlessing = { godId: 'mara', tier: 2, expiresAtMinutes: 2000 };
  const snap = snapshotPlayer(ent, {});
  // Mutate original entity after snapshot — must NOT mutate snap!
  ent.apotheosis.cult.sites[f.site.siteKey].siege.attackerCount = 99;
  ent.apotheosis.roadBlessing.tier = 1;
  assert.notEqual(snap.apotheosis.cult.sites[f.site.siteKey].siege.attackerCount, 99);
  assert.equal(snap.apotheosis.roadBlessing.tier, 2);

  const restored = makeAscended('war', { region: 17, faith: 100 });
  restorePlayer(restored, snap, new Map());
  assert.equal(restored.apotheosis.roadBlessing.tier, 2);
  assert.ok(restored.apotheosis.cult.sites[f.site.siteKey].siege);
  restored.apotheosis.roadBlessing.tier = 3;
  assert.equal(snap.apotheosis.roadBlessing.tier, 2);
});

test('Stage 3.4 Polish: Siege leaving-town cull does NOT grant victory; killing all attackers DOES', async () => {
  const prevApo = playerEntity.apotheosis;
  const prevReg = playerEntity.currentRegionIndex;
  const prevGold = playerEntity.goldPieces;
  try {
    setPref('apotheosisTempleSieges', 'low'); // base 3 attackers, 1 defender
    playerEntity.currentRegionIndex = 17;
    playerEntity.goldPieces = 1000;
    playerEntity.apotheosis = {
      ascended: true,
      stage: 'ascended',
      source: 'mantella',
      portfolio: 'war',
      ascendedAtMinutes: 1000,
      faith: 500,
      cultFaithBonus: 500,
    };
    ensurePantheonState(playerEntity, { nowMinutes: 1000 });
    ensureCultState(playerEntity);

    const f = foundPlayerUndergroundSanctuary(playerEntity, {
      mapId: 505,
      regionIndex: 17,
      locationName: 'Testburg',
      nowMinutes: 1000,
      force: true,
    });
    assert.equal(f.ok, true);
    const siegeRes = startCultSiteSiege(playerEntity, f.site.siteKey, 'mehrunes_dagon', { nowMinutes: 1000, force: true });
    assert.equal(siegeRes.ok, true);
    assert.equal(f.site.siege.attackerCount, 3);
    assert.equal(f.site.siege.remainingAttackers, 3);

    const extPool = [];
    const talks = [];
    const builtMap = new Map();
    const host = createApotheosisCultHost({
      built: () => builtMap,
      renderer: null,
      pipeline: null,
      state: { pixelTranslation: () => [0, 0, 0] },
      townTalk: { say: (msg) => talks.push(msg) },
      modes: () => ({ mode: 'exterior' }),
      groundAt: () => 0,
      worldMinutes: () => 1200,
      placeFeet: () => {},
      playerPos: () => [0, 0, 0],
      playerFeet: () => [0, 0, 0],
      spawnExteriorFoe: async (_mob, pos, opts) => {
        const rec = { dead: false, feet: pos, allied: !!opts.allied, ai: { isHostile: true, target: null }, entity: { items: [] } };
        extPool.push(rec);
        return rec;
      },
      exteriorFoes: () => ({ foes: extPool }),
      buildingDoors: () => [],
      currentLoc: () => ({ mapTableData: { mapId: 505 }, name: 'Testburg' }),
    });

    assert.equal(host.spawnCultSiegeBattle(f.site.siteKey), true);
    await new Promise((r) => setTimeout(r, 10));
    const attackers = extPool.filter((r) => r.livingRole === 'cult_siege_attacker');
    assert.equal(attackers.length, 3);

    // 1. Kill ONLY 1 attacker, then simulate leaving town (culling the other 2 from extPool without killing them!)
    attackers[0].dead = true;
    host.frame();
    assert.equal(f.site.siege.remainingAttackers, 2);
    assert.equal(getActiveCultSieges(playerEntity).length, 1);

    // Cull living attackers 1 and 2 from extPool (player left town!)
    extPool.length = 0;
    host.frame();
    // MUST NOT award victory; remainingAttackers stays 2 and siege stays active with spawned=false!
    assert.equal(getActiveCultSieges(playerEntity).length, 1);
    assert.equal(f.site.siege.remainingAttackers, 2);
    assert.equal(f.site.siege.spawned, false);

    // 2. Return to city -> only remaining 2 attackers respawn, kill them cleanly -> victory!
    assert.equal(host.spawnCultSiegeBattle(f.site.siteKey), true);
    await new Promise((r) => setTimeout(r, 10));
    const wave2Attackers = extPool.filter((r) => r.livingRole === 'cult_siege_attacker');
    assert.equal(wave2Attackers.length, 2);
    for (const a of wave2Attackers) a.dead = true;
    host.frame();
    assert.equal(getActiveCultSieges(playerEntity).length, 0);
  } finally {
    playerEntity.apotheosis = prevApo;
    playerEntity.currentRegionIndex = prevReg;
    playerEntity.goldPieces = prevGold;
  }
});

test('Stage 3.4 Polish: WAR_SKIRMISH Side B first-contact victory, non-criminal strike & ally disarm', async () => {
  setPref('apotheosisTempleSieges', 'mid');
  const ent = makeAscended('shadows', { region: 22, faith: 800 });
  const warRes = startInterDeityWar(ent, 'akatosh', 'boethiah', { nowMinutes: 2000, regions: [22] });
  assert.equal(warRes.ok, true);

  let lastChoice = null;
  const extPool = [];
  const host = createLivingSceneHost({
    feet: () => [0, 0, 0],
    ready: () => true,
    clock: () => 2500,
    regionIndex: () => 22,
    inLocationRect: () => false,
    onRoad: () => true,
    afloat: () => false,
    climateIndex: () => CLIMATES.TemperateWoodlands,
    heightAt: () => 0,
    playerEntity: () => ent,
    spawn: async (_type, feet, opts) => {
      const rec = {
        dead: false,
        feet,
        allied: !!opts.allied,
        ai: { isHostile: true, detected: false, target: null, feet },
        entity: { items: [{ isGold: true, count: 10 }] },
      };
      extPool.push(rec);
      return rec;
    },
    remove: () => {},
    inPool: (f) => extPool.includes(f),
    say: () => {},
    openChoice: (spec) => { lastChoice = spec; },
  });

  const spawnRes = host.spawnWarSkirmishNow({ force: true });
  assert.equal(spawnRes.ok, true);
  await new Promise((r) => setTimeout(r, 10));
  const sideA = extPool.filter((f) => f.livingRole === 'skirmish_guard');
  const sideB = extPool.filter((f) => f.livingRole === 'skirmish_rebel');
  assert.equal(sideA.length, 3);
  assert.equal(sideB.length, 3);

  // Pick Side B in ChoiceWindow (option index 1)
  lastChoice.options[1].action();
  assert.equal(warRes.war.playerStance, 'sideB');
  // Siding with Side B must NEVER mark hitting Side A as criminal
  assert.equal(host.isCriminalTarget(sideA[0]), false);

  // Culling Side A without dying must NOT award victory
  extPool.length = 0;
  for (const r of sideB) extPool.push(r);
  host.frame(1.1);
  assert.equal(ent.apotheosis.faith, 800);

  // Actual deaths of Side A award +35 Faith and disarm surviving Side B allies!
  for (const g of sideA) {
    g.dead = true;
    extPool.push(g);
  }
  host.frame(1.1);
  assert.equal(ent.apotheosis.faith, 835);
  assert.equal(sideB[0].ai.isHostile, false);
});

test('Stage 3.4 Polish: Console commands apo siege start (auto-found) and apo war stance/pacify/cooldown', async () => {
  const prevApo = playerEntity.apotheosis;
  const prevReg = playerEntity.currentRegionIndex;
  try {
    playerEntity.currentRegionIndex = 17;
    playerEntity.apotheosis = {
      ascended: true,
      stage: 'ascended',
      source: 'mantella',
      portfolio: 'war',
      ascendedAtMinutes: 1000,
      faith: 1500,
      cultFaithBonus: 500,
    };
    ensurePantheonState(playerEntity, { nowMinutes: 1000 });
    ensureCultState(playerEntity);

    const siegeMsg = await executeConsoleCommand('apo', ['siege', 'start']);
    assert.ok(String(siegeMsg).includes('Siege started:'));
    assert.equal(getActiveCultSieges(playerEntity).length, 1);

    const warMsg = await executeConsoleCommand('apo', ['war', 'here', 'akatosh', 'mehrunes_dagon']);
    assert.ok(String(warMsg).includes('Religious War'));
    const stMsg = await executeConsoleCommand('apo', ['war', 'stance', 'watch']);
    assert.ok(String(stMsg).includes('watch'));
    const resetMsg = await executeConsoleCommand('apo', ['war', 'stance', 'reset']);
    assert.ok(String(resetMsg).includes('reset'));
    const cdMsg = await executeConsoleCommand('apo', ['war', 'cooldown', 'clear']);
    assert.ok(String(cdMsg).includes('Cleared'));
    const pacMsg = await executeConsoleCommand('apo', ['war', 'pacify', 'partial']);
    assert.ok(String(pacMsg).includes('PARTIAL'));
  } finally {
    playerEntity.apotheosis = prevApo;
    playerEntity.currentRegionIndex = prevReg;
  }
});

test('Stage 3.4 Feedback: Cult Founding (50,000g) & Upgrade (25,000g / 50,000g) gold costs + atomic validation', () => {
  assert.equal(CULT_FOUND_GOLD_COST, 50000);
  assert.equal(CULT_UPGRADE_TIERS[2].upgradeGoldCost, 25000);
  assert.equal(CULT_UPGRADE_TIERS[3].upgradeGoldCost, 50000);

  const god = makeAscended('order', { region: 17, faith: 2000 });
  god.goldPieces = 49999;
  const failFound = foundPlayerUndergroundSanctuary(god, { mapId: 3301, regionIndex: 17, locationName: 'Daggerfall', nowMinutes: 100 });
  assert.equal(failFound.ok, false);
  assert.equal(god.apotheosis.faith, 2000, 'Failed gold check must not deduct Faith');
  assert.equal(god.goldPieces, 49999);

  god.goldPieces = 125000;
  const okFound = foundPlayerUndergroundSanctuary(god, { mapId: 3301, regionIndex: 17, locationName: 'Daggerfall', nowMinutes: 100 });
  assert.equal(okFound.ok, true);
  assert.equal(okFound.faithSpent, CULT_FOUND_FAITH_COST);
  assert.equal(okFound.goldSpent, 50000);
  assert.equal(god.goldPieces, 75000);

  // Tier 2 upgrade costs 25,000g + 220 Faith; check insufficient gold first
  god.goldPieces = 24999;
  const faithBeforeT2 = god.apotheosis.faith;
  const failT2 = upgradeCultSite(god, okFound.site.siteKey, { nowMinutes: 120 });
  assert.equal(failT2.ok, false);
  assert.equal(god.apotheosis.faith, faithBeforeT2);

  god.goldPieces = 75000;
  const okT2 = upgradeCultSite(god, okFound.site.siteKey, { nowMinutes: 120 });
  assert.equal(okT2.ok, true);
  assert.equal(okT2.tier, 2);
  assert.equal(okT2.goldSpent, 25000);
  assert.equal(god.goldPieces, 50000);

  // Tier 3 upgrade costs 50,000g + 420 Faith
  god.goldPieces = 49999;
  const failT3 = upgradeCultSite(god, okFound.site.siteKey, { nowMinutes: 130 });
  assert.equal(failT3.ok, false);

  god.goldPieces = 50000;
  const okT3 = upgradeCultSite(god, okFound.site.siteKey, { nowMinutes: 130 });
  assert.equal(okT3.ok, true);
  assert.equal(okT3.tier, 3);
  assert.equal(okT3.goldSpent, 50000);
  assert.equal(god.goldPieces, 0);
});

test('Stage 3.4 Feedback: dismissCultSiegeBattle despawns attackers & defenders via portal leave when sacrificing sanctum', async () => {
  const prevApo = playerEntity.apotheosis;
  try {
    playerEntity.apotheosis = {
      ascended: true,
      stage: 'ascended',
      source: 'mantella',
      portfolio: 'war',
      ascendedAtMinutes: 1000,
      faith: 1200,
      cultFaithBonus: 500,
    };
    ensurePantheonState(playerEntity, { nowMinutes: 1000 });
    ensureCultState(playerEntity);
    const f = foundPlayerUndergroundSanctuary(playerEntity, { mapId: 3302, regionIndex: 17, locationName: 'Wayrest', nowMinutes: 1000, force: true });
    startCultSiteSiege(playerEntity, f.site.siteKey, 'molag_bal', { nowMinutes: 1000, force: true });

    const extPool = [];
    const portalLeaves = [];
    const extObj = {
      foes: extPool,
      companionFx: {
        leave(rec, done) {
          portalLeaves.push(rec);
          done();
        },
      },
      removeFoe(rec) {
        const idx = extPool.indexOf(rec);
        if (idx >= 0) extPool.splice(idx, 1);
      },
    };
    const host = createApotheosisCultHost({
      built: () => new Map([['10,10', { key: '10,10', px: 10, py: 10, homeTown: 3302, frames: new Map() }]]),
      groundAt: () => 0,
      modes: () => ({ mode: 'exterior' }),
      worldMinutes: () => 1000,
      exteriorFoes: () => extObj,
      spawnExteriorFoe: async (mob, pos, opts) => {
        const rec = { mobileType: mob, pos: [...pos], entity: { team: opts.team }, ai: { isHostile: true, detected: true, target: playerEntity, feet: [...pos] }, dead: false };
        extPool.push(rec);
        return rec;
      },
    });
    host.spawnCultSiegeBattle(f.site.siteKey);
    await new Promise((r) => setTimeout(r, 15));
    assert.ok(extPool.length > 0);

    resolveCultSiegeOutcome(playerEntity, f.site.siteKey, 'failed', { nowMinutes: 1010 });
    const count = host.dismissCultSiegeBattle(f.site.siteKey);
    assert.ok(count > 0);
    assert.equal(portalLeaves.length, count, 'Every siege mob departs via portal animation');
    assert.equal(extPool.length, 0, 'Siege pool clears cleanly after sacrificing sanctum');
  } finally {
    playerEntity.apotheosis = prevApo;
  }
});

test('Stage 3.4 Feedback: Named Geopolitical wars, preferKind disambiguation & skirmishNeutralToPlayer / TravelOptions safety', async () => {
  const ent = makeAscended('war', { region: 17, faith: 1500 });
  const geoRes = igniteRegionWar(ent, 17, 23, { nowMinutes: 1000, force: true }); // Daggerfall (#17) vs Wayrest (#23)
  assert.equal(geoRes.ok, true);
  assert.equal(areRegionsAtWar(ent, 17, 23), true);

  const munWar = getActiveWarForRegion(ent, 17);
  assert.ok(munWar);
  assert.equal(munWar.warKind, 'mundane');
  assert.deepEqual(munWar.regions, [17, 23]);
  assert.ok(munWar.sideAName.includes('Daggerfall') && munWar.sideBName.includes('Wayrest'));

  // Disambiguate mundane vs divine when an active God War also touches region 17
  startInterDeityWar(ent, 'akatosh', 'molag_bal', { nowMinutes: 1000, regions: [17] });
  assert.equal(getActiveWarForRegion(ent, 17).warKind, 'divine');
  assert.equal(getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }).warKind, 'mundane');

  // Unchosen/neutral WAR_SKIRMISH foes never trigger foeHostile() or target the player, while clashing with each other
  const extPool = [];
  let openedChoice = null;
  const host = createLivingSceneHost({
    feet: () => [0, 0, 0],
    ready: () => true,
    clock: () => 2000,
    regionIndex: () => 17,
    inLocationRect: () => false,
    onRoad: () => true,
    afloat: () => false,
    heightAt: () => 0,
    playerEntity: () => ent,
    spawn: async (mob, pos, opts) => {
      const rec = {
        mobileType: mob,
        dead: false,
        feet: [...pos],
        entity: { team: opts.team, mobileTeam: opts.team },
        ai: { isHostile: true, detected: true, target: null, feet: [...pos], yaw: opts.yaw ?? 0, height: 1.8, sightRadius: 30, wouldBeSpawned: true, collider: { raycast: () => null } },
      };
      extPool.push(rec);
      return rec;
    },
    remove: (r) => { const idx = extPool.indexOf(r); if (idx >= 0) extPool.splice(idx, 1); },
    inPool: (r) => extPool.includes(r),
    say: () => {},
    openChoice: (spec) => { openedChoice = spec; },
  });

  const spawnRes = host.spawnWarSkirmishNow({ force: true, preferKind: 'mundane' });
  assert.equal(spawnRes.ok, true);
  assert.equal(spawnRes.warDesc.warKind, 'mundane');
  assert.ok(openedChoice?.options?.length === 4);
  await new Promise((r) => setTimeout(r, 15));

  const sideA = extPool.filter((f) => f.livingRole === 'skirmish_guard');
  const sideB = extPool.filter((f) => f.livingRole === 'skirmish_rebel');
  assert.ok(sideA.length >= 2 && sideB.length >= 2);
  assert.equal(foeHostile(sideA[0]), false, 'Side A neutral to player until side is chosen');
  assert.equal(foeHostile(sideB[0]), false, 'Side B neutral to player until side is chosen');

  const chosenRes = getTargets(sideA[0], [sideB[0], PLAYER_TARGET], [0, 0, 0], { infighting: false });
  assert.equal(chosenRes.target, sideB[0], 'Skirmish armies target each other and ignore player even when infighting toggle is off');
  const onlyPlayerRes = getTargets(sideA[0], [PLAYER_TARGET], [0, 0, 0], { infighting: false });
  assert.equal(onlyPlayerRes.target, null, 'Neutral skirmish soldier must never target PLAYER_TARGET');
});

test('Stage 3.4 Follow-up Fixes: preferredMapId siege selection, named rival kingdoms, autopilot ChoiceWindow & live stance sync, close-range hover HP bar', async () => {
  // 1. startCultSiteSiege with preferredMapId picks the current town sanctum over another town sanctum
  const ent = makeAscended('war', { region: 17, faith: 2000 });
  const siteA = foundPlayerUndergroundSanctuary(ent, { mapId: 351438067, regionIndex: 17, locationName: 'Newtower', nowMinutes: 100, force: true }).site;
  const siteB = foundPlayerUndergroundSanctuary(ent, { mapId: 109159001, regionIndex: 17, locationName: 'Gothway Garden', nowMinutes: 110, force: true }).site;
  const siegeRes = startCultSiteSiege(ent, null, 'mara', { nowMinutes: 120, force: true, preferredMapId: siteB.mapId });
  assert.equal(siegeRes.ok, true);
  assert.equal(siegeRes.site.siteKey, siteB.siteKey, 'preferredMapId selects Gothway Garden sanctum instead of Newtower');
  assert.equal(siteA.siege ?? null, null);

  // 2. Mundane regional war without explicit pair still resolves a real named rival kingdom (Wayrest Vanguard for Daggerfall)
  setRegionCrisis(17, CRISIS_TYPE.WAR, CRISIS_PHASE.MID, 8);
  turnOnConditionFlag(ent.regionConditions, 17, REGION_FLAGS.WarOngoing);
  // Simulate stale observer stance from an earlier war
  setWarPlayerStance(ent, getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }), 'watch');
  assert.equal(getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }).playerStance, 'watch');
  resetMundaneWarProgress(ent, 17);
  const warAfterReset = getActiveWarForRegion(ent, 17, { preferKind: 'mundane' });
  assert.ok(warAfterReset);
  assert.equal(warAfterReset.playerStance, null, 'resetMundaneWarProgress restores undeclared stance');
  assert.equal(warAfterReset.sideAName, 'Daggerfall Vanguard');
  assert.equal(warAfterReset.sideBName, 'Wayrest Vanguard', 'Never falls back to generic Invading Warband');
  assert.deepEqual(warAfterReset.regions, [17, 23]);

  // 3. Fast-travel autopilot does not consume WAR_SKIRMISH interacted flag early; interactCurrentSiteIfWarSkirmish opens ChoiceWindow
  // 4. Mid-skirmish setWarPlayerStance live-syncs actors on the very next frame(dt)
  let autopilot = true;
  let choiceOpenCount = 0;
  let lastChoice = null;
  const extPool = [];
  const host = createLivingSceneHost({
    feet: () => [0, 0, 0],
    ready: () => true,
    clock: () => 500,
    regionIndex: () => 17,
    inLocationRect: () => false,
    onRoad: () => true,
    afloat: () => false,
    isAutopiloting: () => autopilot,
    heightAt: () => 0,
    playerEntity: () => ent,
    spawn: async (mob, pos, opts) => {
      const rec = {
        mobileType: mob,
        dead: false,
        feet: [...pos],
        entity: { team: opts.team, mobileTeam: opts.team, health: 40, maxHealth: 40 },
        ai: { isHostile: true, detected: true, target: null, feet: [...pos], yaw: opts.yaw ?? 0, height: 1.8, sightRadius: 30, wouldBeSpawned: true, collider: { raycast: () => null } },
      };
      extPool.push(rec);
      return rec;
    },
    remove: (r) => { const idx = extPool.indexOf(r); if (idx >= 0) extPool.splice(idx, 1); },
    inPool: (r) => extPool.includes(r),
    say: () => {},
    openChoice: (spec) => { choiceOpenCount++; lastChoice = spec; },
  });

  // Spawn while autopiloting at range -> simulate player pressing Stop Here in travel interrupt
  const sp = host.spawnWarSkirmishNow({ force: true, preferKind: 'mundane' });
  assert.equal(sp.ok, true);
  await new Promise((r) => setTimeout(r, 15));
  // Even if frame runs while autopilot is active, interactCurrentSiteIfWarSkirmish still opens ChoiceWindow reliably
  host.frame(1.1);
  autopilot = false;
  const openedAfterStop = host.interactCurrentSiteIfWarSkirmish();
  assert.equal(openedAfterStop, true);
  assert.ok(choiceOpenCount >= 1 && lastChoice?.options?.length === 4);

  // Switch stance via Apotheosis UI mid-skirmish -> next frame retargets live actors immediately!
  const sideA = extPool.filter((f) => f.livingRole === 'skirmish_guard');
  const sideB = extPool.filter((f) => f.livingRole === 'skirmish_rebel');
  assert.equal(sideA[0].entity.name, 'Daggerfall Vanguard');
  assert.equal(sideB[0].entity.name, 'Wayrest Vanguard');

  setWarPlayerStance(ent, getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }), 'sideA');
  host.frame(1.1);
  assert.equal(sideA[0].entity.team, 'PlayerAlly');
  assert.equal(sideA[0].entity.skirmishNeutralToPlayer, true);
  assert.equal(sideB[0].entity.team, 'PlayerEnemy');
  assert.equal(sideB[0].entity.skirmishNeutralToPlayer, false);

  setWarPlayerStance(ent, getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }), 'sideB');
  host.frame(1.1);
  assert.equal(sideB[0].entity.team, 'PlayerAlly');
  assert.equal(sideB[0].entity.skirmishNeutralToPlayer, true);
  assert.equal(sideA[0].entity.team, 'PlayerEnemy');
  assert.equal(sideA[0].entity.skirmishNeutralToPlayer, false);

  // 5. Close-range combat mob hover surfaces name & health bar in hudFoeTarget
  clearFoeTarget();
  const nearEye = [sideA[0].ai.feet[0], sideA[0].ai.feet[1] + 1.6, sideA[0].ai.feet[2] + 1.9];
  const farEye = [sideA[0].ai.feet[0], sideA[0].ai.feet[1] + 1.6, sideA[0].ai.feet[2] + (FOE_HOVER_DISTANCE + 1.0)];

  assert.equal(markFoeHovered(sideA[0], farEye, 'Knight'), false, 'Beyond close range does not hijack bar');
  assert.equal(foeTarget(), null);

  assert.equal(markFoeHovered(sideA[0], nearEye, 'Knight'), true, 'Within close range shows combat mob bar');
  assert.equal(foeTarget().name, 'Daggerfall Vanguard');
  assert.equal(foeTarget().health, 40);

  // Monster without entity.name uses fallback enemyDisplayName
  const wolf = { entity: { health: 18, maxHealth: 20 }, ai: { isHostile: true, feet: [0, 0, 0] }, dead: false };
  assert.equal(markFoeHovered(wolf, [0, 1.6, 1.5], 'Wolf'), true);
  assert.equal(foeTarget().name, 'Wolf');

  // Peaceful non-combat NPC/guard is ignored by combat hover bar
  const peacefulGuard = { entity: { name: 'City Watch', health: 50, maxHealth: 50 }, ai: { isHostile: false, feet: [0, 0, 0] }, dead: false };
  assert.equal(markFoeHovered(peacefulGuard, [0, 1.6, 1.0], 'City Watch'), false);
  clearFoeTarget();

  // igniteRegionWar also clears stale mundane stances
  setWarPlayerStance(ent, getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }), 'watch');
  igniteRegionWar(ent, 17, 23, { nowMinutes: 600, force: true });
  assert.equal(getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }).playerStance, null);
});

test('Stage 3.4 QA Pass: rival symmetry & cross-region stance sync, Observer/reset mid-skirmish, post-victory calming & siege infighting', async () => {
  // 1. Only region #17 flagged at war -> rival region #23 (Wayrest) mirrors it symmetrically
  const ent = makeAscended('order', { region: 23, faith: 1500 });
  turnOnConditionFlag(ent.regionConditions, 17, REGION_FLAGS.WarOngoing);
  const w17 = getActiveWarForRegion(ent, 17, { preferKind: 'mundane' });
  const w23 = getActiveWarForRegion(ent, 23, { preferKind: 'mundane' });
  assert.ok(w17 && w23);
  assert.equal(w23.sideAName, 'Wayrest Vanguard');
  assert.equal(w23.sideBName, 'Daggerfall Vanguard');
  assert.deepEqual(w23.regions, [23, 17]);

  // Setting stance to Side A (Daggerfall) in #17 flips to Side B (Daggerfall) in #23
  setWarPlayerStance(ent, w17, 'sideA');
  assert.equal(getActiveWarForRegion(ent, 23, { preferKind: 'mundane' }).playerStance, 'sideB');
  setWarPlayerStance(ent, w17, 'watch');
  assert.equal(getActiveWarForRegion(ent, 23, { preferKind: 'mundane' }).playerStance, 'watch');
  setWarPlayerStance(ent, w17, null);
  assert.equal(getActiveWarForRegion(ent, 23, { preferKind: 'mundane' }).playerStance, null);

  // 2. Live mid-skirmish: Side A -> Observer resets teams; Reset/Ask re-opens ChoiceWindow; Victory calms surviving allies
  let choiceOpenCount = 0;
  const extPool = [];
  const host = createLivingSceneHost({
    feet: () => [0, 0, 0],
    ready: () => true,
    clock: () => 1200,
    regionIndex: () => 17,
    inLocationRect: () => false,
    onRoad: () => true,
    afloat: () => false,
    isAutopiloting: () => false,
    heightAt: () => 0,
    playerEntity: () => ent,
    spawn: async (mob, pos, opts) => {
      const rec = {
        mobileType: mob,
        dead: false,
        feet: [...pos],
        entity: { team: opts.team, mobileTeam: opts.team, health: 40, maxHealth: 40 },
        ai: { isHostile: true, detected: true, target: null, feet: [...pos], yaw: opts.yaw ?? 0, height: 1.8, sightRadius: 30, wouldBeSpawned: true, collider: { raycast: () => null } },
      };
      extPool.push(rec);
      return rec;
    },
    remove: (r) => { const idx = extPool.indexOf(r); if (idx >= 0) extPool.splice(idx, 1); },
    inPool: (r) => extPool.includes(r),
    say: () => {},
    openChoice: () => { choiceOpenCount++; },
  });

  host.spawnWarSkirmishNow({ force: true, preferKind: 'mundane' });
  await new Promise((r) => setTimeout(r, 15));
  const sideA = extPool.filter((f) => f.livingRole === 'skirmish_guard');
  const sideB = extPool.filter((f) => f.livingRole === 'skirmish_rebel');

  setWarPlayerStance(ent, getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }), 'sideA');
  host.frame(1.1);
  assert.equal(sideA[0].entity.team, 'PlayerAlly');

  setWarPlayerStance(ent, getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }), 'watch');
  host.frame(1.1);
  assert.equal(sideA[0].entity.team, 'WarSideA');
  assert.equal(sideB[0].entity.team, 'WarSideB');
  assert.equal(sideA[0].allied, false);

  const prevChoices = choiceOpenCount;
  setWarPlayerStance(ent, getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }), null);
  host.frame(1.1);
  assert.equal(choiceOpenCount, prevChoices + 1, 'Resetting stance mid-skirmish re-opens ChoiceWindow on active clash');

  setWarPlayerStance(ent, getActiveWarForRegion(ent, 17, { preferKind: 'mundane' }), 'sideA');
  host.frame(1.1);
  for (const r of sideB) r.dead = true;
  host.frame(1.1);
  assert.equal(sideA[0].ai.isHostile, false, 'Surviving allies calm down after skirmish victory');
  assert.equal(sideA[0].entity.skirmishForceInfighting, false);

  // 3. Siege attackers & defenders have infighting + defender friendly-fire protection and calm on victory
  const prevApo = playerEntity.apotheosis;
  const prevReg = playerEntity.currentRegionIndex;
  try {
    playerEntity.currentRegionIndex = 17;
    playerEntity.apotheosis = {
      ascended: true,
      stage: 'ascended',
      source: 'mantella',
      portfolio: 'war',
      ascendedAtMinutes: 1300,
      faith: 1500,
      cultFaithBonus: 500,
    };
    ensurePantheonState(playerEntity, { nowMinutes: 1300 });
    ensureCultState(playerEntity);
    const sSite = foundPlayerUndergroundSanctuary(playerEntity, { mapId: 9012, regionIndex: 17, locationName: 'TestTown', nowMinutes: 1300, force: true }).site;
    startCultSiteSiege(playerEntity, sSite.siteKey, 'mehrunes_dagon', { nowMinutes: 1310, force: true });
    const siegePool = [];
    const cultHost = createApotheosisCultHost({
      modes: () => ({ mode: 'exterior' }),
      built: () => new Map([['0,0', { key: '0,0', homeTown: 9012, px: 0, py: 0, frames: new Map() }]]),
      state: { pixelTranslation: () => [0, 0, 0] },
      exteriorFoes: () => ({
        foes: siegePool,
        removeFoe: (f) => { const idx = siegePool.indexOf(f); if (idx >= 0) siegePool.splice(idx, 1); },
      }),
      spawnExteriorFoe: async (mob, pos, opts) => {
        const rec = {
          mobileType: mob,
          dead: false,
          feet: [...pos],
          entity: { team: opts.team, mobileTeam: opts.team, health: 50, maxHealth: 50 },
          ai: { isHostile: true, detected: true, target: null, feet: [...pos], yaw: opts.yaw ?? 0, height: 1.8, sightRadius: 30, wouldBeSpawned: true },
        };
        siegePool.push(rec);
        return rec;
      },
      worldMinutes: () => 1320,
      groundAt: () => 0,
      collider: () => ({ raycast: () => null }),
      townTalk: { say: () => {} },
    });

    assert.equal(cultHost.spawnCultSiegeBattle(sSite.siteKey), true);
    await new Promise((r) => setTimeout(r, 15));
    const atks = siegePool.filter((f) => f.livingRole === 'cult_siege_attacker');
    const defs = siegePool.filter((f) => f.livingRole === 'cult_siege_defender');
    assert.ok(atks.length >= 2 && defs.length >= 1);
    assert.equal(atks[0].entity.skirmishForceInfighting, true);
    assert.equal(defs[0].entity.skirmishForceInfighting, true);
    assert.equal(defs[0].entity.skirmishNeutralToPlayer, true);

    cultHost.frame();
    for (const a of atks) a.dead = true;
    cultHost.frame();
    assert.equal(sSite.siege, null, 'Siege resolves as victory when all attackers fall');
    assert.equal(defs[0].ai.isHostile, false, 'Surviving garrison calms down after siege victory');
    assert.equal(defs[0].entity.skirmishForceInfighting, false);
  } finally {
    playerEntity.apotheosis = prevApo;
    playerEntity.currentRegionIndex = prevReg;
  }
});
