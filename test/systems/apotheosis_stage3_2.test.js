// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CULT_BRANCH_COOLDOWN_DAYS,
  CULT_BRANCH_COOLDOWN_MINUTES,
  CULT_TELEPORT_SANCTUARY_FAITH_COST,
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
} from '../../src/world/apotheosisSanctuaryInterior.js';
import {
  getTempleCultDoorSubtitle,
  createSanctuaryInteriorEntry,
  isPlayerCultSiteOwned,
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
    goldPieces: 5000,
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

  // 2) Bash opens unconditionally & triggers Alarm
  ensureCityCultSites(god, { mapId: 502, regionIndex: 17, locationName: 'Gothway' });
  const bashKey = daedraHatchSiteKey(502);
  const bashRes = attemptUnlockSanctuaryHatch(god, bashKey, 'bash');
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

  assert.equal(attemptUnlockSanctuaryHatch(god, dk, 'bash').ok, true);
  god.apotheosis.faith = 200;
  const tpRemote = teleportToCultSanctuary(god, dk, { isNearHatch: false });
  assert.equal(tpRemote.ok, true);
  assert.equal(tpRemote.faithSpent, CULT_TELEPORT_SANCTUARY_FAITH_COST);
  assert.equal(god.apotheosis.faith, 200 - CULT_TELEPORT_SANCTUARY_FAITH_COST);

  const tpHatch = teleportToCultSanctuary(god, dk, { isNearHatch: true });
  assert.equal(tpHatch.ok, true);
  assert.equal(tpHatch.faithSpent, 0);

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
