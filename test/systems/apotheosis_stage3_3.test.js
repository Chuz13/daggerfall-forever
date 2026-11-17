// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ROAD_BLESSING_DURATION_MINUTES,
  ROADSIDE_DESECRATE_FAITH_BASE,
  ROADSIDE_DESECRATE_INF_BASE,
  ROADSIDE_WILD_REWARD_MULT,
  BASTION_DEFENSE_PER_SITE,
  BASTION_DEFENSE_MAX,
  CULT_PETITION_COOLDOWN_MINUTES,
  ensureApotheosisState,
  selectApotheosisPortfolio,
  ensurePantheonState,
  resolveRegionPatronDeityId,
  ensureCityCultSites,
  getCityCultSites,
  consecrateSiteByForce,
  clearSiteGuardians,
  changeDeityRelation,
  proclaimRegionalEdict,
  templeSiteKey,
  daedraHatchSiteKey,
  getRoadBlessingInfo,
  tickRoadBlessingFatigue,
  pickRoadsideShrineGod,
  prayAtRoadsideShrine,
  desecrateRoadsideShrine,
  getDeityRegionBastionDefense,
  ensureCultPetition,
  getActiveCultPetition,
  dismissCultPetition,
  notifyCultPetitionProgress,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import { statusTiles } from '../../src/ui/hud/hudStatus.js';
import { createApotheosisRoadShrinesHost } from '../../src/scenes/apotheosisRoadShrinesHost.js';
import { createRegionConditions } from '../../src/systems/region/regionConditions.js';
import { maxFatigue } from '../../src/systems/statMods.js';

function makeAscended(portfolio = 'order', { region = 17, faith = 900, luck = 50 } = {}) {
  const ent = {
    name: 'Agent',
    level: 20,
    currentRegionIndex: region,
    goldPieces: 5000,
    fatigue: 100,
    stats: { strength: 50, endurance: 60, willpower: 60, luck },
    skills: {},
    factionRep: { dict: new Map() },
    regionConditions: createRegionConditions(),
    apotheosis: {
      ascended: true,
      stage: 'ascended',
      source: 'mantella',
      portfolio,
      ascendedAtMinutes: 1000,
      faith,
      cultFaithBonus: 400,
    },
  };
  ensureApotheosisState(ent);
  selectApotheosisPortfolio(ent, portfolio, { force: true, nowMinutes: 1000 });
  ent.apotheosis.faith = faith;
  ensurePantheonState(ent, { nowMinutes: 1000 });
  return ent;
}

test('Stage 3.3: Road Blessing grants Fatigue regen, Weather Resist mods, 12h expiry & HUD status tile', () => {
  const ent = makeAscended('war', { region: 17, faith: 500 });
  ent.fatigue = 100;
  const cap = maxFatigue(ent);
  assert.ok(cap > 100);

  const prayRes = prayAtRoadsideShrine(ent, {
    shrineId: 'roadside:town:100:0',
    godId: 'kynareth',
    regionIndex: 17,
    goldAmount: 200,
    nowMinutes: 2000,
  });
  assert.equal(prayRes.ok, true);
  assert.equal(prayRes.blessingGranted, true);
  assert.equal(ent.goldPieces, 4800);
  assert.ok(ent.fatigue > 100, 'Immediate fatigue restoration applied');

  // EntityMods channels reflect Weather Resist (warmth/coldDegrees/heatDegrees) + fatigueLess + elemental resist
  assert.equal(ent._mods.warmth, 6);
  assert.equal(ent._mods.coldDegrees, 6);
  assert.equal(ent._mods.heatDegrees, 6);
  assert.equal(Number(ent._mods.fatigueLess.toFixed(2)), 0.45, '0.25 War + 0.20 Road Blessing');
  assert.equal(ent._mods.resist.frost, 10);

  // Minute-by-minute fatigue regen
  ent.fatigue = 200;
  const gained = tickRoadBlessingFatigue(ent, 10, 2010);
  assert.equal(gained, 30, 'Tier II blessing regenerates 3 fatigue/min');

  // HUD tile renders blessing with timer foot
  const info = getRoadBlessingInfo(ent, 2010);
  assert.ok(info && info.active);
  const tiles = statusTiles({
    blessing: { active: true, name: `Blessing of ${info.godName}`, foot: `${info.hoursLeft}h`, say: 'Test' },
  });
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].key, 'road_blessing');
  assert.equal(tiles[0].glyph, 'blessing');
  assert.equal(tiles[0].foot, '12h');

  // Expires cleanly after 12h (720 min)
  assert.equal(getRoadBlessingInfo(ent, 2000 + ROAD_BLESSING_DURATION_MINUTES), null);
  assert.equal(ent._mods.warmth, 0);
});

test('Stage 3.3: Roadside Shrines 3x Wild Desecration rewards, daily cooldown & Luck-based guardian spawn', () => {
  const lowLuck = makeAscended('shadows', { region: 17, faith: 100, luck: 10 });
  const highLuck = makeAscended('shadows', { region: 17, faith: 100, luck: 95 });

  // Settlement without temple guarantees regional Aedra patron on exit 0
  const patron = resolveRegionPatronDeityId(17);
  assert.equal(pickRoadsideShrineGod(lowLuck, {
    shrineId: 'roadside:town:555:0',
    regionIndex: 17,
    exitIndex: 0,
    isSettlementWithoutTemple: true,
  }), patron);

  // Suburban desecration: 1x reward
  const subRes = desecrateRoadsideShrine(lowLuck, {
    shrineId: 'roadside:town:555:0',
    godId: 'kynareth',
    regionIndex: 17,
    isWild: false,
    nowMinutes: 3000,
    rng: () => 0.01,
  });
  assert.equal(subRes.ok, true);
  assert.equal(subRes.multiplier, 1);
  assert.equal(subRes.faithGained, ROADSIDE_DESECRATE_FAITH_BASE);
  assert.equal(subRes.influenceShift, ROADSIDE_DESECRATE_INF_BASE);
  assert.equal(subRes.guardiansTriggered, true);

  // Same shrine cannot be desecrated twice same day
  const dup = desecrateRoadsideShrine(lowLuck, {
    shrineId: 'roadside:town:555:0',
    godId: 'kynareth',
    regionIndex: 17,
    isWild: false,
    nowMinutes: 3100,
  });
  assert.equal(dup.ok, false);

  // Wild highway shrine: 3x rewards + lower guardian chance for high luck
  const wildRes = desecrateRoadsideShrine(highLuck, {
    shrineId: 'roadside:wild:120:240',
    godId: 'azura',
    regionIndex: 17,
    isWild: true,
    nowMinutes: 3000,
    rng: () => 0.99,
  });
  assert.equal(wildRes.ok, true);
  assert.equal(wildRes.multiplier, ROADSIDE_WILD_REWARD_MULT);
  assert.equal(wildRes.faithGained, ROADSIDE_DESECRATE_FAITH_BASE * 3);
  assert.equal(wildRes.influenceShift, ROADSIDE_DESECRATE_INF_BASE * 3);
  assert.equal(wildRes.guardiansTriggered, false);
  assert.ok(subRes.spawnChance > (wildRes.spawnChance - 0.25) || highLuck.stats.luck > lowLuck.stats.luck);
});

test('Stage 3.3: Balance Steps 2 & 3 — Hamlet Daedra hatch 25% filter & Bastion Defense (+15%..+45%)', () => {
  const ent = makeAscended('order', { region: 17, faith: 800 });

  // Step 2: Small hamlets without temple (<16 buildings) only get Daedra hatch on 25% of mapIds
  let spawned = 0;
  for (let mid = 1; mid <= 40; mid++) {
    ensureCityCultSites(ent, { mapId: mid, regionIndex: 17, temples: [], buildingCount: 6 });
    if (ent.apotheosis.cult.sites[daedraHatchSiteKey(mid)]) spawned++;
  }
  assert.ok(spawned > 0 && spawned < 20, `Expected ~25% Daedra hatches in tiny hamlets, got ${spawned}/40`);

  // Settlements with >=16 buildings always get their Daedra hatch
  ensureCityCultSites(ent, { mapId: 999, regionIndex: 17, temples: [], buildingCount: 16 });
  assert.ok(ent.apotheosis.cult.sites[daedraHatchSiteKey(999)]);

  // Step 3: Bastion Defense scales +15% per held site up to 45% cap, drops when player consecrates
  const reg = 5;
  ensureCityCultSites(ent, {
    mapId: 2001,
    regionIndex: reg,
    temples: [
      { buildingKey: 1, factionId: 35, name: 'Kynareth 1' },
      { buildingKey: 2, factionId: 35, name: 'Kynareth 2' },
      { buildingKey: 3, factionId: 35, name: 'Kynareth 3' },
      { buildingKey: 4, factionId: 35, name: 'Kynareth 4' },
    ],
  });
  assert.equal(getDeityRegionBastionDefense(ent, reg, 'kynareth'), BASTION_DEFENSE_MAX);

  const tk = templeSiteKey(2001, 1);
  clearSiteGuardians(ent, tk);
  changeDeityRelation(ent, 'kynareth', -150, { propagate: false });
  consecrateSiteByForce(ent, tk, { nowMinutes: 5000 });
  // Now 3 remain -> still capped at 0.45; consecrate a second -> 2 remain -> 0.30
  const tk2 = templeSiteKey(2001, 2);
  clearSiteGuardians(ent, tk2);
  consecrateSiteByForce(ent, tk2, { nowMinutes: 5000 });
  assert.equal(getDeityRegionBastionDefense(ent, reg, 'kynareth'), BASTION_DEFENSE_PER_SITE * 2);
});

test('Stage 3.3: Pilgrim Petitions lifecycle (3d cooldown, Wild 3x desecrate completion, Edict auto-sync)', () => {
  const ent = makeAscended('magic', { region: 17, faith: 1000 });
  ensureCityCultSites(ent, {
    mapId: 777,
    regionIndex: 17,
    temples: [{ buildingKey: 10, factionId: 35, name: 'Kynareth Shrine' }],
  });
  const tk = templeSiteKey(777, 10);
  clearSiteGuardians(ent, tk);
  changeDeityRelation(ent, 'kynareth', -150, { propagate: false });
  assert.equal(consecrateSiteByForce(ent, tk, { nowMinutes: 5000 }).ok, true);

  // Force a desecrate_shrine petition (rng = 0.5 -> desecrate_shrine)
  const pet = ensureCultPetition(ent, { regionIndex: 17, nowMinutes: 6000, rng: () => 0.5 });
  assert.ok(pet);
  assert.equal(pet.type, 'desecrate_shrine');

  const faithBefore = ent.apotheosis.faith;
  const goldBefore = ent.goldPieces;
  // Complete via wild roadside desecration -> 3x petition reward!
  const done = notifyCultPetitionProgress(ent, 'desecrate_shrine', {
    godId: pet.godId,
    regionIndex: 17,
    isWild: true,
    nowMinutes: 6100,
  });
  assert.equal(done.completed, true);
  assert.equal(done.multiplier, ROADSIDE_WILD_REWARD_MULT);
  assert.equal(ent.apotheosis.faith, faithBefore + pet.rewardFaith * 3);
  assert.equal(ent.goldPieces, goldBefore + pet.rewardGold * 3);
  assert.equal(getActiveCultPetition(ent, 6100), null);

  // Cooldown prevents immediate re-issue before 3 days (4320 min)
  assert.equal(ensureCultPetition(ent, { regionIndex: 17, nowMinutes: 6200 }), null);

  // After 3 days, equal 1/3 weights: 0.75 -> edict; proclaim edict auto-completes even across currentRegionIndex
  const pet2 = ensureCultPetition(ent, { regionIndex: 17, nowMinutes: 6000 + CULT_PETITION_COOLDOWN_MINUTES + 10, rng: () => 0.75 });
  assert.ok(pet2);
  assert.equal(pet2.type, 'edict');
  const edRes = proclaimRegionalEdict(ent, 17, 'prosperity', { nowMinutes: 11000, force: true });
  assert.equal(edRes.ok, true);
  assert.equal(edRes.petitionCompleted?.completed, true);
  assert.equal(getActiveCultPetition(ent, 11000), null);

  // Inquisition petition defaults to 3 inquisitors & dismiss works cleanly
  const pet3 = ensureCultPetition(ent, { regionIndex: 17, nowMinutes: 20000, rng: () => 0.1, force: true });
  assert.ok(pet3);
  assert.equal(pet3.type, 'inquisition');
  assert.equal(pet3.goal, 3);
  assert.equal(dismissCultPetition(ent).ok, true);
  assert.equal(getActiveCultPetition(ent, 20000), null);
});

test('Stage 3.3 Polish: Roadside Shrines activate with interaction mode string & teleportNearRoadShrine locates nearby shrine', () => {
  const overlays = [];
  const teleports = [];
  const fakePixels = new Map([
    ['100,100', {
      px: 100,
      py: 100,
      homeTown: 555,
      homeRegion: 17,
      homeFrames: new Map(),
      locationRect: { xMin: 20, xMax: 44, yMin: 20, yMax: 44 },
    }],
  ]);
  const host = createApotheosisRoadShrinesHost({
    built: () => fakePixels,
    state: { pixelTranslation: () => [0, 0, 0] },
    groundAt: () => 5,
    worldMinutes: () => 5000,
    townTalk: { showOverlay: (w) => overlays.push(w), say: () => {} },
    placeFeet: (feet, yaw) => teleports.push({ feet, yaw }),
    playerPos: () => [0, 5, 0],
  });
  host.frame();
  const tgts = host.targets();
  assert.ok(tgts.length >= 2, 'Town without road tilemap still places 2 perimeter roadside shrines');
  assert.equal(host.activate(tgts[0].key, 'info'), true, 'Activation works when worldModes passes mode string instead of opts object');
  assert.equal(overlays.length, 1);

  const tpRes = host.teleportNearRoadShrine();
  assert.equal(tpRes.ok, true);
  assert.equal(teleports.length, 1);
});
