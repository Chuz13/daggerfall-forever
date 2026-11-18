// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  APOTHEOSIS_SIEGE_TIERS,
  DIVINE_WAR_SUPPORT_COST,
  DIVINE_WAR_TRUCE_COST,
  DIVINE_SKIRMISH_PACIFY_FAITH_COST,
  WAR_SKIRMISH_PACIFY_GOAL,
  getApotheosisSiegeConfig,
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

function makeAscended(portfolio = 'war', { region = 17, faith = 2000 } = {}) {
  const ent = {
    name: 'Divus',
    level: 25,
    currentRegionIndex: region,
    goldPieces: 5000,
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
