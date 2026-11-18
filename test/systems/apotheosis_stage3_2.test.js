// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CULT_BRANCH_COOLDOWN_DAYS,
  CULT_BRANCH_COOLDOWN_MINUTES,
  CULT_TELEPORT_SANCTUARY_FAITH_COST,
  CULT_BASH_COOLDOWN_MINUTES,
  CULT_GUARDIAN_RESPAWN_COOLDOWN_MINUTES,
  DEITY_DEFAULT_ALTAR_BY_GOD,
  AEDRA_IDS,
  DAEDRA_IDS,
  CULT_ALTAR_STYLES,
  getCultAltarStyle,
  setCultAltarStyle,
  discoverCultSite,
  applySanctumTrespassPenalty,
  recomputeCultFaithBonus,
  getCultBranchCooldownInfo,
  teleportToCultSanctuary,
  getFaithMax,
  ensureApotheosisState,
  selectApotheosisPortfolio,
  computeChampionFaithScaling,
  evaluateAurbisCommand,
  ensurePantheonState,
  tickPantheonDay,
  setRegionInfluenceShare,
  changeDeityRelation,
  getRegionInfluence,
  ensureCityCultSites,
  getCityCultSites,
  attemptUnlockSanctuaryHatch,
  obtainSanctuaryKeyFromGatekeeper,
  clearSiteGuardians,
  getSanctuaryGuardianCount,
  consecrateSiteByForce,
  initiateForceConsecrationAssault,
  dedicateSitePeacefully,
  foundPlayerUndergroundSanctuary,
  upgradeCultSite,
  selectCultSiteBranch,
  canIssueRegionalEdict,
  getActiveRegionalEdict,
  proclaimRegionalEdict,
  getCultPassiveFaithPerDay,
  tickCultAndEdictsDay,
  queryPantheonChronicle,
  templeSiteKey,
  daedraHatchSiteKey,
  playerHatchSiteKey,
  REGIONAL_EDICT_DURATION_DAYS,
} from '../../src/systems/apotheosis/apotheosisCore.js';
import {
  SANCTUARY_HATCH_MODELS,
  SANCTUARY_INTERIOR_POOLS,
  buildSanctuaryBlock,
  isWindowModelId,
  pickSanctuaryHatchPosition,
  cultHatchTownBlocks,
} from '../../src/world/apotheosisSanctuaryInterior.js';
import {
  getTempleCultDoorSubtitle,
  createSanctuaryInteriorEntry,
  isPlayerCultSiteOwned,
  spawnCultInteriorGuardians,
} from '../../src/scenes/apotheosisCultHost.js';
import { peopleAreVisible } from '../../src/characters/interiorPeople.js';
import { BUILDING_TYPES } from '../../src/world/buildingNames.js';
import { REGION_FLAGS, conditionFlag, createRegionConditions } from '../../src/systems/region/regionConditions.js';
import { isOfflineHouseOwned, _resetForTests as resetOfflineHomes } from '../../src/systems/offlineHomes.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { executeConsoleCommand } from '../../src/systems/consoleCommands.js';
import { startCourt, CRIMES } from '../../src/systems/court.js';

function makeAscendedGod(portfolio = 'order', { region = 17, faith = 900 } = {}) {
  const ent = {
    name: 'Agent',
    level: 25,
    currentRegionIndex: region,
    goldPieces: 250000,
    stats: { willpower: 70, luck: 60 },
    skills: { 10: 55, 22: 65 },
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

test('Milestone 3.1/3.2: Pantheon daily AI deity move chance uses clamp(0.35 * actMult, 0.05, 0.95)', () => {
  const god = makeAscendedGod('order');
  const res1 = tickPantheonDay(god, 10000, { daysOverride: 1, rng: () => 0.1 });
  assert.equal(res1.aiMoves, 16, 'Roll below 0.35 triggers all 16 AI deities');
  const res3 = tickPantheonDay(god, 10000, { daysOverride: 3, rng: () => 0.99 });
  assert.equal(res3.aiMoves, 0, 'Roll above 0.35 skips AI deity moves');
});

test('Sanctuary architecture: all 3 pools emit blind walls with ZERO window blocks, Altar, Enter marker & safe street hatch spots', () => {
  assert.deepEqual(SANCTUARY_HATCH_MODELS, [43600, 43603]);
  assert.equal(SANCTUARY_INTERIOR_POOLS.length, 3);
  for (const pool of SANCTUARY_INTERIOR_POOLS) {
    const blk = buildSanctuaryBlock({ siteKey: `test:${pool}`, interiorPool: pool, mapId: 77 });
    const rec = blk.rmbBlock.subRecords[0].interior;
    assert.ok(rec.block3dObjectRecords.length > 0);
    const windows = rec.block3dObjectRecords.filter((o) => isWindowModelId(o.modelIdNum));
    assert.equal(windows.length, 0, `${pool} must emit ZERO window blocks underground`);
    assert.ok(rec.block3dObjectRecords.some((o) => Number(o.modelIdNum) === 41020), `${pool} contains Altar dais 41020`);
    assert.ok(rec.blockFlatObjectRecords.some((f) => f.textureRecord === 8), `${pool} contains INTERIOR_MARKER.ENTER`);
  }

  const frames = new Map([
    [1, { box: [90, 0, 90, 120, 12, 120] }],
    [2, { box: [130, 0, 90, 160, 12, 120] }],
  ]);
  const spotA = pickSanctuaryHatchPosition(frames, null, null, 'daedra_hatch:42', 0);
  const spotB = pickSanctuaryHatchPosition(frames, null, null, 'player_hatch:42', 1);
  for (const spot of [spotA, spotB]) {
    for (const fr of frames.values()) {
      const b = fr.box;
      const inside = spot[0] >= b[0] - 4 && spot[0] <= b[3] + 4 && spot[2] >= b[2] - 4 && spot[2] <= b[5] + 4;
      assert.equal(inside, false, 'Street hatch clears building footprints');
    }
  }
  assert.ok(Math.hypot(spotA[0] - spotB[0], spotA[2] - spotB[2]) > 2, 'Daedric hatch and player hatch avoid overlap');

  const entry = createSanctuaryInteriorEntry({
    siteKey: 'daedra_hatch:42',
    mapId: 42,
    buildingKey: -200042,
    regionIndex: 17,
    name: 'Test Sanctuary',
  }, { hatchWorldPos: [10, 0, 20], hatchYaw: 0.5 });
  assert.ok(entry?.hit?.dfBlock?.rmbBlock?.subRecords?.[0]?.interior);
  assert.equal(entry.hit.door.position.x, 0);
  assert.equal(entry.hit.door.normal.z, 1);
});

test('Underground Sanctuary Hatch 4 Unlock Methods + Alarm & Guardian counts', () => {
  const god = makeAscendedGod('order', { region: 17 });
  ensureCityCultSites(god, { mapId: 501, regionIndex: 17, locationName: 'Daggerfall' });
  const hatchKey = daedraHatchSiteKey(501);

  // 1) Failed Lockpick triggers Alarm -> 4 Guardians inside
  const failPick = attemptUnlockSanctuaryHatch(god, hatchKey, 'lockpick', { lockpickSkill: 5, dc: 80, rng: () => 0.99 });
  assert.equal(failPick.ok, false);
  assert.equal(failPick.alarm, true);
  assert.equal(getSanctuaryGuardianCount(god.apotheosis.cult.sites[hatchKey]), 4);

  // 2) Bash checks Strength + 60m cooldown, triggers Alarm & provokes Holy War (-35 rel)
  ensureCityCultSites(god, { mapId: 502, regionIndex: 17, locationName: 'Gothway' });
  const bashKey = daedraHatchSiteKey(502);
  const bashFail = attemptUnlockSanctuaryHatch(god, bashKey, 'bash', { strength: 25, rng: () => 0.99, nowMinutes: 1000 });
  assert.equal(bashFail.ok, false);
  assert.equal(bashFail.alarm, true);
  assert.equal(bashFail.warDeclared, true);
  assert.equal(god.apotheosis.pantheon.deities[god.apotheosis.cult.sites[bashKey].ownerId].status, 'war');
  const bashCd = attemptUnlockSanctuaryHatch(god, bashKey, 'bash', { strength: 90, rng: () => 0, nowMinutes: 1010 });
  assert.equal(bashCd.ok, false);
  assert.equal(bashCd.onCooldown, true);
  const bashRes = attemptUnlockSanctuaryHatch(god, bashKey, 'bash', {
    strength: 90,
    rng: () => 0,
    nowMinutes: 1000 + CULT_BASH_COOLDOWN_MINUTES + 1,
  });
  assert.equal(bashRes.ok, true);
  assert.equal(bashRes.unlocked, true);
  assert.equal(bashRes.alarm, true);

  // 3) Magic unlock: denied without Open/Magic Portfolio/Arcane Edict; quiet success with Open spell (and Magic Portfolio)
  ensureCityCultSites(god, { mapId: 503, regionIndex: 17, locationName: 'Aldingwall' });
  const magKey = daedraHatchSiteKey(503);
  const noMag = attemptUnlockSanctuaryHatch(god, magKey, 'magic', { hasOpenSpell: false });
  assert.equal(noMag.ok, false);
  let spellConsumed = false;
  const withOpen = attemptUnlockSanctuaryHatch(god, magKey, 'magic', {
    hasOpenSpell: true,
    onConsumeOpenSpell: () => { spellConsumed = true; },
  });
  assert.equal(withOpen.ok, true);
  assert.equal(withOpen.alarm, false);
  assert.equal(spellConsumed, true);
  assert.equal(getSanctuaryGuardianCount(god.apotheosis.cult.sites[magKey]), 2, 'Silent unlock spawns 2 Guardians instead of 4');

  // 4) Gatekeeper Seal Key: pickpocket silently vs loot triggers Alarm
  ensureCityCultSites(god, { mapId: 504, regionIndex: 17, locationName: 'Crosswych' });
  const gkKey = daedraHatchSiteKey(504);
  const noKey = attemptUnlockSanctuaryHatch(god, gkKey, 'key');
  assert.equal(noKey.ok, false);
  const stealRes = obtainSanctuaryKeyFromGatekeeper(god, gkKey, 'pickpocket', { skillOverride: 95, rng: () => 0 });
  assert.equal(stealRes.ok, true);
  assert.equal(stealRes.alarm, false);
  const keyOpen = attemptUnlockSanctuaryHatch(god, gkKey, 'key');
  assert.equal(keyOpen.ok, true);
  assert.equal(keyOpen.alarm, false);
});

test('Consecration Rules: Force requires Hostile/War + cleared Guardians; Peaceful STRICTLY requires Allied at 100; Temples retain priests & offlineHomes', () => {
  resetOfflineHomes();
  const god = makeAscendedGod('order', { region: 17, faith: 1000 });
  const tKey = templeSiteKey(900, 12);
  ensureCityCultSites(god, {
    mapId: 900,
    regionIndex: 17,
    locationName: 'Wayrest',
    temples: [{ buildingKey: 12, factionId: 33, name: 'Temple of Stendarr' }],
  });
  const patron = god.apotheosis.cult.sites[tKey].ownerId;
  assert.equal(patron, 'stendarr');
  assert.match(getTempleCultDoorSubtitle(god, { buildingType: BUILDING_TYPES.Temple, buildingKey: 12, factionId: 33, townMapId: 900 }, 900), /Stendarr/);

  // Strict Peaceful Dedication gate: Allied at 95 -> MUST REJECT; Pact at 50 -> MUST REJECT
  god.apotheosis.pantheon.deities[patron].allied = true;
  changeDeityRelation(god, patron, 95 - god.apotheosis.pantheon.deities[patron].relation, { propagate: false });
  const fail95 = dedicateSitePeacefully(god, tKey, { nowMinutes: 2000 });
  assert.equal(fail95.ok, false, 'Peaceful dedication blocked at 95 even when allied');

  // Force Consecration rejected when allied AND when guardians unclear
  const failForceAlly = consecrateSiteByForce(god, tKey, { nowMinutes: 2000 });
  assert.equal(failForceAlly.ok, false);

  // Set Allied at 100 -> Peaceful Dedication succeeds!
  changeDeityRelation(god, patron, 100, { propagate: false });
  const pass100 = dedicateSitePeacefully(god, tKey, { nowMinutes: 2000 });
  assert.equal(pass100.ok, true);
  assert.equal(pass100.faithSpent, 450);
  assert.equal(isPlayerCultSiteOwned(god, 900, 12), true);
  assert.equal(isOfflineHouseOwned(900, 12), true, 'Consecrated Temple registered in offlineHomes for Decorator & Exterior Paint');
  assert.equal(
    peopleAreVisible({ buildingType: BUILDING_TYPES.Temple, buildingKey: 12, factionId: 33 }, { isHouseOwned: () => true }),
    true,
    'Consecrated Temples retain their priests/services inside',
  );

  // Force Consecration flow on a second Temple
  const t2Key = templeSiteKey(901, 15);
  ensureCityCultSites(god, {
    mapId: 901,
    regionIndex: 23,
    locationName: 'Sentinel',
    temples: [{ buildingKey: 15, factionId: 24, name: 'House of Mara' }],
  });
  god.apotheosis.pantheon.deities.mara.manualWar = true;
  changeDeityRelation(god, 'mara', -200, { propagate: false });
  const needClear = consecrateSiteByForce(god, t2Key, { nowMinutes: 2000 });
  assert.equal(needClear.ok, false);
  clearSiteGuardians(god, t2Key);
  const infBefore = getRegionInfluence(god, 23).playerShare;
  const forceOk = consecrateSiteByForce(god, t2Key, { nowMinutes: 2000 });
  assert.equal(forceOk.ok, true);
  assert.equal(forceOk.faithSpent, 200);
  assert.equal(getRegionInfluence(god, 23).playerShare, Number((infBefore + 10).toFixed(1)));
});

test('Founding Player Underground Sanctuary, Upgrade Tiers I->II->III, and Specialization Branches', () => {
  resetOfflineHomes();
  const god = makeAscendedGod('shadows', { region: 17, faith: 1000 });
  const pk = playerHatchSiteKey(600);

  const fRes = foundPlayerUndergroundSanctuary(god, { mapId: 600, regionIndex: 17, locationName: 'Anticlere', nowMinutes: 2000 });
  assert.equal(fRes.ok, true);
  assert.equal(fRes.faithSpent, 350);
  assert.equal(fRes.site.siteKey, pk);
  assert.equal(isOfflineHouseOwned(600, fRes.site.buildingKey), true);

  // Cannot found duplicate when city already has a player sanctuary
  const dup = foundPlayerUndergroundSanctuary(god, { mapId: 600, regionIndex: 17, locationName: 'Anticlere', nowMinutes: 2000 });
  assert.equal(dup.ok, false);

  // Upgrade Tier 1 -> 2 -> 3 & Oracle Branch
  assert.equal(getCultPassiveFaithPerDay(god), 12);
  god.apotheosis.faith = 1000;
  const u2 = upgradeCultSite(god, pk);
  assert.equal(u2.ok, true);
  assert.equal(u2.tier, 2);
  const u3 = upgradeCultSite(god, pk);
  assert.equal(u3.ok, true);
  assert.equal(u3.tier, 3);
  const u4 = upgradeCultSite(god, pk);
  assert.equal(u4.ok, false);

  const br = selectCultSiteBranch(god, pk, 'oracle');
  assert.equal(br.ok, true);
  assert.equal(getCultPassiveFaithPerDay(god), 48, 'Grand Sanctum (36) + Oracle Reliquary (+12) = +48 passive Faith/day');
});

test('Regional Edicts (71 regions): per-region eligibility, live region-checked gameplay hooks, and 30-day Chronicle lifecycle', () => {
  const god = makeAscendedGod('magic', { region: 17, faith: 1200 });
  god.regionConditions[17].flags[REGION_FLAGS.FamineOngoing] = true;
  god.regionConditions[17].flags[REGION_FLAGS.WitchBurnings] = true;

  // Ineligible at 0% influence and 0 owned sites
  assert.equal(canIssueRegionalEdict(god, 17).ok, false);
  setRegionInfluenceShare(god, 17, 'player', 30);
  assert.equal(canIssueRegionalEdict(god, 17).ok, true);

  // 1) Arcane Convergence: -20% Aurbis cost ONLY when player.currentRegionIndex === 17 + silent Magic hatch unlock
  const evalBefore = evaluateAurbisCommand('heal', god);
  assert.equal(evalBefore.faithCost, 40);
  const pArc = proclaimRegionalEdict(god, 17, 'arcane', { nowMinutes: 14400 });
  assert.equal(pArc.ok, true);
  assert.equal(conditionFlag(god.regionConditions, 17, REGION_FLAGS.WitchBurnings), false, 'Arcane edict clears Witch Burnings in region 17');
  assert.equal(evaluateAurbisCommand('heal', god).faithCost, 32, 'Inside region 17: -20% Aurbis Faith cost (40 -> 32)');
  god.currentRegionIndex = 23;
  assert.equal(evaluateAurbisCommand('heal', god).faithCost, 40, 'Outside region 17: full Aurbis cost (40)');

  ensureCityCultSites(god, { mapId: 707, regionIndex: 17, locationName: 'Daggerfall' });
  const unlockByEdict = attemptUnlockSanctuaryHatch(god, daedraHatchSiteKey(707), 'magic', { hasOpenSpell: false });
  assert.equal(unlockByEdict.ok, true, 'Arcane Convergence in region 17 unlocks Daedric hatch silently');

  // 2) Sanctified Crusade: +25% Champion damage ONLY when player.currentRegionIndex === 23
  setRegionInfluenceShare(god, 23, 'player', 35);
  god.apotheosis.faith = 1000;
  const scaleNormal = computeChampionFaithScaling(800, god).damageScale;
  assert.ok(proclaimRegionalEdict(god, 23, 'crusade', { nowMinutes: 14400 }).ok);
  const scaleCrusade = computeChampionFaithScaling(800, god).damageScale;
  assert.ok(Math.abs(scaleCrusade / scaleNormal - 1.25) < 0.02, 'Inside Crusade region 23: +25% Champion damage');
  god.currentRegionIndex = 17;
  assert.equal(computeChampionFaithScaling(800, god).damageScale, scaleNormal, 'Outside Crusade region 23: base Champion damage');

  // 3) Prosperous Harvest + Shadow Tithe regional court check + 30-day Countdown & Expiration Chronicle
  proclaimRegionalEdict(god, 17, 'prosperity', { nowMinutes: 14400 });
  assert.equal(conditionFlag(god.regionConditions, 17, REGION_FLAGS.FamineOngoing), false);
  assert.equal(conditionFlag(god.regionConditions, 17, REGION_FLAGS.PricesLow), true);
  assert.equal(conditionFlag(god.regionConditions, 17, REGION_FLAGS.HappyHoliday), true);

  // Verify Shadow Tithe edict cuts court fines by 50% ONLY inside the decreed region
  setRegionInfluenceShare(god, 18, 'player', 35);
  god.apotheosis.faith = 1000;
  god.goldPieces = 50000;
  const fineNormal = startCourt(god, 18, CRIMES.Assault, { rolls: () => 0.99, dfRand: () => 1 }).fine;
  assert.ok(proclaimRegionalEdict(god, 18, 'shadow', { nowMinutes: 14400 }).ok);
  const fineShadow = startCourt(god, 18, CRIMES.Assault, { rolls: () => 0.99, dfRand: () => 1 }).fine;
  assert.equal(fineShadow, Math.round(fineNormal * 0.5), 'Shadow Tithe cuts regional court fine in half inside decreed region 18');
  assert.equal(startCourt(god, 17, CRIMES.Assault, { rolls: () => 0.99, dfRand: () => 1 }).fine, fineNormal, 'Outside region 18: full court fine');
  god.goldPieces = 5000;
  const goldBefore = god.goldPieces;
  for (let d = 1; d < REGIONAL_EDICT_DURATION_DAYS; d++) {
    tickCultAndEdictsDay(god, 14400 + d * 1440, 10 + d);
  }
  assert.ok(god.goldPieces > goldBefore, 'Prosperity edict yields daily gold income');
  assert.ok(getActiveRegionalEdict(god, 17), 'Still active on day 29');
  // Final 30th day expires the edict and records expiration in Chronicle
  tickCultAndEdictsDay(god, 14400 + 30 * 1440, 40);
  assert.equal(getActiveRegionalEdict(god, 17), null, 'Expires after 30 days');
  const logRows = queryPantheonChronicle(god, { filter: 'regions' });
  assert.ok(logRows.some((e) => /expired|30 days/i.test(e.text)), 'Chronicle records edict expiration');
  assert.ok(logRows.some((e) => /Proclaimed/i.test(e.text)), 'Chronicle records edict proclamation');

  // 4) ensureApotheosisState preserves cult subobject across reload/normalization
  ensureApotheosisState(god);
  assert.ok(god.apotheosis.cult.sites[daedraHatchSiteKey(707)], 'ensureApotheosisState preserves cult state');
});

test('Console Commands: apo cult subcommands & 16-deity apo pantheon tick output', async () => {
  resetOfflineHomes();
  const prev = playerEntity.apotheosis ? JSON.parse(JSON.stringify(playerEntity.apotheosis)) : null;
  try {
    playerEntity.currentRegionIndex = 17;
    playerEntity.apotheosis = { ascended: true, stage: 'ascended', source: 'mantella', portfolio: 'order', faith: 1000 };
    ensureApotheosisState(playerEntity);
    ensurePantheonState(playerEntity);

    const fOut = await executeConsoleCommand('apo', ['cult', 'found']);
    assert.match(fOut, /Founded Cult Undercroft/);

    const uOut = await executeConsoleCommand('apo', ['cult', 'unlock', 'daedra', 'bash']);
    assert.match(uOut, /unlocked=true, alarm=true/);

    const cOut = await executeConsoleCommand('apo', ['cult', 'consecrate', 'daedra', 'force']);
    assert.match(cOut, /owner=player/);

    const bOut = await executeConsoleCommand('apo', ['cult', 'branch', 'daedra', 'militant']);
    assert.match(bOut, /militant/);

    const eOut = await executeConsoleCommand('apo', ['cult', 'edict', '17', 'shadow']);
    assert.match(eOut, /shadow edict.*30d/);

    const tOut = await executeConsoleCommand('apo', ['pantheon', 'tick', '3']);
    assert.match(tOut, /\d+ deity move\(s\) across 16 AI deities/);

    const tpCultOut = await executeConsoleCommand('apo', ['cult', 'tp', 'daedra']);
    assert.match(tpCultOut, /unavailable|Teleported|not found/i);

    const tpOut = await executeConsoleCommand('apo', ['tp', 'temple']);
    assert.match(tpOut, /unavailable|Teleported|not found/i);

    const tpCultAltarOut = await executeConsoleCommand('apo', ['cult', 'tp', 'altar']);
    assert.match(tpCultAltarOut, /unavailable|Enter a Temple|Teleported/i);

    const tpAltarOut = await executeConsoleCommand('apo', ['tp', 'altar']);
    assert.match(tpAltarOut, /unavailable|Enter a Temple|Teleported/i);
  } finally {
    playerEntity.apotheosis = prev;
  }
});

test('UX & Bugfixes: Max Faith Scaling, Branch Cooldown, Remote Sanctuary TP Cost, Chesterwark Rename & Door Centre', () => {
  resetOfflineHomes();
  const god = makeAscendedGod('order', { region: 17, faith: 1000 });
  god.apotheosis.cultFaithBonus = 0;
  recomputeCultFaithBonus(god);
  const baseMax = getFaithMax(god.apotheosis);

  // Founding with pre-selected specialization branch grants +100 Max Faith immediately
  const fRes = foundPlayerUndergroundSanctuary(god, {
    mapId: 777,
    regionIndex: 17,
    locationName: 'Chesterwark',
    branch: 'militant',
    nowMinutes: 5000,
  });
  assert.equal(fRes.ok, true);
  assert.equal(fRes.site.branch, 'militant');
  assert.equal(god.apotheosis.cultFaithBonus, 100);
  assert.equal(getFaithMax(god.apotheosis), baseMax + 100);

  // Upgrading Tier 2 (+250) -> Tier 3 (+500) scales Max Faith Reservoir
  god.apotheosis.faith = 2000;
  assert.equal(upgradeCultSite(god, fRes.site.siteKey, { nowMinutes: 5000 }).tier, 2);
  assert.equal(god.apotheosis.cultFaithBonus, 250);
  assert.equal(upgradeCultSite(god, fRes.site.siteKey, { nowMinutes: 5000 }).tier, 3);
  assert.equal(god.apotheosis.cultFaithBonus, 500);

  // Switching specialization from Militant -> Oracle costs 180 Faith, triggers 7-day cooldown, adds +150 Max Faith
  const faithBeforeSwitch = god.apotheosis.faith;
  const swOk = selectCultSiteBranch(god, fRes.site.siteKey, 'oracle', { nowMinutes: 5000 });
  assert.equal(swOk.ok, true);
  assert.equal(faithBeforeSwitch - god.apotheosis.faith, 180);
  assert.equal(god.apotheosis.cultFaithBonus, 650);
  assert.equal(getFaithMax(god.apotheosis), baseMax + 650);

  const cdActive = getCultBranchCooldownInfo(fRes.site, 6440); // 1 day later
  assert.equal(cdActive.onCooldown, true);
  assert.equal(cdActive.remainingDays, CULT_BRANCH_COOLDOWN_DAYS - 1);
  const swBlocked = selectCultSiteBranch(god, fRes.site.siteKey, 'missionary', { nowMinutes: 6440 });
  assert.equal(swBlocked.ok, false);

  const swAfterCd = selectCultSiteBranch(god, fRes.site.siteKey, 'missionary', {
    nowMinutes: 5000 + CULT_BRANCH_COOLDOWN_MINUTES + 1,
  });
  assert.equal(swAfterCd.ok, true);
  assert.equal(god.apotheosis.cultFaithBonus, 500);

  // Founding WITHOUT initial branch allows free first pick even with low Faith
  const god2 = makeAscendedGod('magic', { region: 17, faith: 400 });
  god2.apotheosis.cultFaithBonus = 0;
  const fFree = foundPlayerUndergroundSanctuary(god2, {
    mapId: 778,
    regionIndex: 17,
    locationName: 'Anticlere',
    nowMinutes: 5000,
  });
  assert.equal(fFree.ok, true);
  assert.equal(fFree.site.branch, null);
  god2.apotheosis.faith = 10;
  const freePick = selectCultSiteBranch(god2, fFree.site.siteKey, 'oracle', { nowMinutes: 5000 });
  assert.equal(freePick.ok, true);
  assert.equal(god2.apotheosis.faith, 10, 'Initial specialization pick costs 0 Faith');
  assert.equal(god2.apotheosis.cultFaithBonus, 250, 'Tier 1 (100) + Oracle (150)');

  // Teleport to Sanctuary: blocked while locked, 75 Faith remotely, 0 Faith at hatch
  ensureCityCultSites(god, { mapId: 888, regionIndex: 17, locationName: '' });
  const dk = daedraHatchSiteKey(888);
  assert.equal(god.apotheosis.cult.sites[dk].locationName, 'Daggerfall');
  // Calling again with resolved town name repairs stale region-named entry
  ensureCityCultSites(god, { mapId: 888, regionIndex: 17, locationName: 'Chesterwark' });
  assert.equal(god.apotheosis.cult.sites[dk].locationName, 'Chesterwark');
  assert.match(god.apotheosis.cult.sites[dk].name, /^Chesterwark:/);

  const tpLocked = teleportToCultSanctuary(god, dk, { isNearHatch: false });
  assert.equal(tpLocked.ok, false);

  assert.equal(attemptUnlockSanctuaryHatch(god, dk, 'bash', { strength: 90, rng: () => 0 }).ok, true);
  god.apotheosis.faith = 200;
  // Unowned Sanctuary CANNOT be teleported into remotely; must enter at hatch (0 Faith)
  const tpUnownedRemote = teleportToCultSanctuary(god, dk, { isNearHatch: false });
  assert.equal(tpUnownedRemote.ok, false, 'Remote teleport rejected for unowned sanctuary');

  const tpHatch = teleportToCultSanctuary(god, dk, { isNearHatch: true });
  assert.equal(tpHatch.ok, true);
  assert.equal(tpHatch.faithSpent, 0);

  // Owned Sanctuary CAN be teleported into remotely for 75 Faith
  const tpOwnedRemote = teleportToCultSanctuary(god, fRes.site.siteKey, { isNearHatch: false });
  assert.equal(tpOwnedRemote.ok, true);
  assert.equal(tpOwnedRemote.faithSpent, CULT_TELEPORT_SANCTUARY_FAITH_COST);
  assert.equal(god.apotheosis.faith, 200 - CULT_TELEPORT_SANCTUARY_FAITH_COST);

  // Sanctuary interior synthetic door must include door.centre for doorWorldPosition
  const entry = createSanctuaryInteriorEntry(god.apotheosis.cult.sites[dk], { hatchWorldPos: [0, 0, 0], hatchYaw: 0 });
  assert.deepEqual(entry.hit.door.centre, { x: 0, y: 0, z: 0 });

  // Consecrated Temple plaque names the player & portfolio
  ensureCityCultSites(god, {
    mapId: 910,
    regionIndex: 17,
    locationName: 'Chesterwark',
    temples: [{ buildingKey: 5, factionId: 33, name: 'Temple of Mara' }],
  });
  const tk = templeSiteKey(910, 5);
  clearSiteGuardians(god, tk);
  god.apotheosis.faith = 500;
  changeDeityRelation(god, god.apotheosis.cult.sites[tk].ownerId, -150, { propagate: false });
  assert.equal(consecrateSiteByForce(god, tk, { nowMinutes: 5000 }).ok, true);
  const subTitle = getTempleCultDoorSubtitle(god, { buildingType: BUILDING_TYPES.Temple, buildingKey: 5, factionId: 33, townMapId: 910 }, 910);
  assert.match(subTitle, /Agent/);
  assert.match(subTitle, /Tier 1/);
});

test('Round 2 Polish: Road-free hatch placement, Town Automap stamps/discovery, Altar Statues, 3-day Guardian cooldown & Trespass -5/day', () => {
  const god = makeAscendedGod('order', { region: 17, faith: 1000 });

  // 1) Altar Statue chooser supports both 2D flats and 3D statue models
  assert.ok(CULT_ALTAR_STYLES.some((s) => s.kind === 'flat'));
  assert.ok(CULT_ALTAR_STYLES.some((s) => s.kind === 'model' && s.modelId === 62323));
  assert.equal(setCultAltarStyle(god, 'model_62323').ok, true);
  assert.equal(getCultAltarStyle(god).modelId, 62323);

  // 2) Road-free hatch placement skips any tile flagged by isRoadFn
  const frames = new Map([[1, { box: [90, 0, 90, 120, 12, 120] }]]);
  const roadSpot = pickSanctuaryHatchPosition(frames, null, null, 'daedra_hatch:77', 0, (x, z) => x >= 110 && x <= 140 && z >= 80 && z <= 140);
  assert.equal(roadSpot[0] >= 110 && roadSpot[0] <= 140 && roadSpot[2] >= 80 && roadSpot[2] <= 140, false, 'Hatch placement avoids road strip');

  // 3) Town Automap stamps 2x2 Temple square always, and shows nameplate only once discovered or player-owned
  const rows = [{ x: 0, y: 0, autoMap: new Uint8Array(64 * 64), places: [] }];
  const hiddenStamped = cultHatchTownBlocks(rows, [
    { x: 16, z: 32, name: 'Hidden Daedra Hatch', discovered: false, ownerId: 'mehrunes_dagon' },
    { x: 48, z: 32, name: 'Player Undercroft', discovered: false, ownerId: 'player' },
  ]);
  assert.equal(hiddenStamped[0].autoMap[(63 - Math.floor(32 / 1.6)) * 64 + Math.floor(16 / 1.6)], BUILDING_TYPES.Temple + 1);
  assert.equal(hiddenStamped[0].places.length, 1, 'Undiscovered Daedra nameplate hidden until hovered/discovered');
  assert.equal(hiddenStamped[0].places[0].name, 'Player Undercroft');

  ensureCityCultSites(god, { mapId: 333, regionIndex: 17, locationName: 'Daggerfall' });
  const dk = daedraHatchSiteKey(333);
  discoverCultSite(god, dk);
  assert.equal(god.apotheosis.cult.sites[dk].discovered, true);

  // 4) Interior guardian 3-day respawn cooldown + once-per-day trespass relation penalty
  const site = god.apotheosis.cult.sites[dk];
  god.apotheosis.pantheon.deities[site.ownerId].status = 'war';
  const relStart = god.apotheosis.pantheon.deities[site.ownerId].relation;
  const mockFoes = {
    foes: [],
    spawnFoe(mob, pos) {
      const f = { mobileType: mob, pos, dead: false, health: 50 };
      this.foes.push(f);
      return f;
    },
  };
  const bld = { buildingKey: site.buildingKey, townMapId: 333, cultSiteKey: site.siteKey };
  const mockCtx = { landing: [0, 0, 0], spawnPoints: [[2, 0, 2]] };

  const wave1 = spawnCultInteriorGuardians(god, bld, 333, mockFoes, mockCtx, { nowMinutes: 10000 });
  assert.equal(wave1.length, 2);
  assert.equal(god.apotheosis.pantheon.deities[site.ownerId].relation, relStart - 5, 'First trespass on day drops -5 relation');
  // Simulate leaving & re-entering 1 hour later with slain foes (within 3-day cooldown)
  mockFoes.foes.length = 0;
  const waveSoon = spawnCultInteriorGuardians(god, bld, 333, mockFoes, mockCtx, { nowMinutes: 10060 });
  assert.equal(waveSoon.length, 0, 'Does not respawn guardians within 3-day cooldown');
  assert.equal(god.apotheosis.pantheon.deities[site.ownerId].relation, relStart - 5, 'Does not double-penalize trespass on same day');
  // 3+ days later -> respawns + daily trespass -5
  const waveLater = spawnCultInteriorGuardians(god, bld, 333, mockFoes, mockCtx, { nowMinutes: 10000 + CULT_GUARDIAN_RESPAWN_COOLDOWN_MINUTES + 10 });
  assert.equal(waveLater.length, 2, 'Respawns after 3-day cooldown');
  assert.equal(god.apotheosis.pantheon.deities[site.ownerId].relation, relStart - 10, 'New day trespass applies -5 relation');
  assert.equal(applySanctumTrespassPenalty(god, site, 10000 + CULT_GUARDIAN_RESPAWN_COOLDOWN_MINUTES + 10).penalized, false);
  clearInterval(site._guardianCheckTimer);
  site._guardianCheckTimer = null;
});

test('Round 3 Polish: Expanded 33 Altar Statues (incl. Dibella & Daedra), 16 Deity Altars, Single Sanctuary Altar & Shifted Brazier, & Force Consecration Assault -> Async Guardian Kill -> Auto-Consecrate', async () => {
  resetOfflineHomes();
  const god = makeAscendedGod('order', { region: 17, faith: 1000 });

  // 1) 33 total altar styles including authentic Dibella/Kynareth/Daedra flats and 3D models
  assert.equal(CULT_ALTAR_STYLES.length, 33);
  for (const id of [
    'flat_97_2', 'flat_97_4', 'flat_97_5', 'flat_97_10',
    'flat_97_12', 'flat_97_13', 'flat_97_14', 'flat_97_16',
    'flat_175_0', 'flat_175_7', 'flat_175_11',
    'flat_202_3', 'flat_202_5', 'model_62327', 'model_74091',
  ]) {
    assert.ok(CULT_ALTAR_STYLES.some((s) => s.id === id), `Expected altar style ${id}`);
  }
  assert.equal(setCultAltarStyle(god, 'flat_97_5').ok, true);
  assert.equal(getCultAltarStyle(god).record, 5);

  // All 16 deities have per-deity statues in DEITY_DEFAULT_ALTAR_BY_GOD
  for (const deityId of [...AEDRA_IDS, ...DAEDRA_IDS]) {
    assert.ok(DEITY_DEFAULT_ALTAR_BY_GOD[deityId], `Expected default altar for ${deityId}`);
  }
  assert.deepEqual(DEITY_DEFAULT_ALTAR_BY_GOD.azura, { archive: 175, record: 0 });
  assert.deepEqual(DEITY_DEFAULT_ALTAR_BY_GOD.kynareth, { archive: 97, record: 13 });
  assert.deepEqual(DEITY_DEFAULT_ALTAR_BY_GOD.dibella, { archive: 97, record: 12 });
  assert.deepEqual(DEITY_DEFAULT_ALTAR_BY_GOD.stendarr, { archive: 97, record: 18 });

  // 2) buildSanctuaryBlock emits exactly one 41020 altar centered at altarLocal and shifts brazier 210:13 above/front
  for (const poolId of SANCTUARY_INTERIOR_POOLS) {
    const blk = buildSanctuaryBlock({ siteKey: `daedra_hatch:444_${poolId}`, mapId: 444, interiorPool: poolId });
    const interior = blk.rmbBlock.subRecords[0].interior;
    const altars = interior.block3dObjectRecords.filter((o) => Number(o.modelIdNum) === 41020);
    assert.equal(altars.length, 1, `Pool ${poolId} places exactly 1 altar anchor`);
    assert.equal(altars[0].xPos, Math.round(blk.altarLocal[0]));
    assert.equal(altars[0].zPos, Math.round(blk.altarLocal[2]));
    const braziers = interior.blockFlatObjectRecords.filter((f) => f.textureArchive === 210 && f.textureRecord === 13);
    const brazier = braziers.at(-1);
    assert.ok(brazier, `Pool ${poolId} emits brazier light 210:13`);
    assert.equal(brazier.xPos, Math.round(blk.altarLocal[0]));
    assert.equal(brazier.yPos, -96);
    assert.equal(brazier.zPos, Math.round(blk.altarLocal[2] - 55));
  }

  // 3) Force Consecration Assault declares Holy War (-35 rel), spawns async Guardians near altar, and auto-consecrates without double Faith/Relation penalty when last Guardian dies
  ensureCityCultSites(god, {
    mapId: 915,
    regionIndex: 17,
    locationName: 'Chesterwark',
    temples: [{ buildingKey: 21, factionId: 35, name: 'Kynareth Sanctuary' }],
  });
  const kKey = templeSiteKey(915, 21);
  const kSite = god.apotheosis.cult.sites[kKey];
  const faithBefore = god.apotheosis.faith;
  const relBefore = god.apotheosis.pantheon.deities.kynareth.relation;
  const infBefore = getRegionInfluence(god, 17).playerShare;

  const assault = initiateForceConsecrationAssault(god, kKey, { nowMinutes: 12000 });
  assert.equal(assault.ok, true);
  assert.equal(assault.assaultStarted, true);
  assert.equal(assault.faithSpent, 200);
  assert.equal(god.apotheosis.faith, faithBefore - 200);
  assert.equal(kSite.consecrationPaid, true);
  assert.equal(kSite.consecrationPending, true);
  assert.equal(god.apotheosis.pantheon.deities.kynareth.status, 'war');
  assert.equal(god.apotheosis.pantheon.deities.kynareth.relation, relBefore - 35);

  const hudMsgs = [];
  const asyncFoes = {
    foes: [],
    async spawnFoe(mob, pos) {
      await new Promise((r) => setTimeout(r, 10));
      const f = { mobileType: mob, pos, dead: false, entity: { health: 40 } };
      this.foes.push(f);
      return f;
    },
  };
  const templeBld = { buildingType: BUILDING_TYPES.Temple, buildingKey: 21, factionId: 35, townMapId: 915 };
  const templeCtx = { landing: [0, 0, 0], cultAltarAnchors: [{ pos: [5, 0, 8] }], spawnPoints: [[1, 0, 1]] };
  spawnCultInteriorGuardians(god, templeBld, 915, asyncFoes, templeCtx, {
    say: (m) => hudMsgs.push(m),
    nowMinutes: 12000,
    forceSpawn: true,
  });

  // Wait for async spawnFoe promises to resolve and land around altar anchor
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(asyncFoes.foes.length, 2);
  assert.ok(Math.abs(asyncFoes.foes[0].pos[0] - 5) <= 2, 'Guardians spawn around altar anchor');

  // Kill all guardians and wait for guardian watcher poll to auto-consecrate
  for (const f of asyncFoes.foes) {
    f.dead = true;
    f.entity.health = 0;
  }
  await new Promise((r) => setTimeout(r, 700));
  if (kSite._guardianCheckTimer) {
    clearInterval(kSite._guardianCheckTimer);
    kSite._guardianCheckTimer = null;
  }

  assert.equal(kSite.ownerId, 'player', 'Last Guardian death automatically consecrates Temple');
  assert.equal(kSite.consecrationPaid, false);
  assert.equal(kSite.consecrationPending, false);
  assert.equal(god.apotheosis.faith, faithBefore - 200, 'Does NOT double-charge 200 Faith on completion');
  assert.equal(god.apotheosis.pantheon.deities.kynareth.relation, relBefore - 35, 'Does NOT double-penalize -35 relation on completion');
  assert.ok(getRegionInfluence(god, 17).playerShare >= Number((infBefore + 10).toFixed(1)), 'Grants at least +10% player regional influence (plus share redistributed from Kynareth)');
  assert.ok(hudMsgs.some((m) => /Chesterwark|consecrated|повержены|Cult/i.test(m)));
});
