// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 3.4: TEMPLE & SANCTUARY SIEGES, INTER-DEITY RELIGIOUS WARS,
// AND UNIFIED WILDERNESS WAR SKIRMISHES (DIVINE & MUNDANE WARS)
// ═══════════════════════════════════════════════════════════════════════════════

import { t, getLocalizedRegionName } from '../textManager.js';
import { hudText } from '../notify.js';
import { getPref } from '../uiPrefs.js';
import { REGION_NAMES } from '../../formats/mapsTables.js';
import { SKILLS } from '../skills.js';
import { liveStat } from '../statMods.js';
import {
  REGION_FLAGS,
  conditionFlag,
  turnOnConditionFlag,
  turnOffConditionFlag,
  createRegionConditions,
} from '../region/regionConditions.js';
import {
  getRegionState,
  setRegionCrisis,
  CRISIS_TYPE,
  CRISIS_PHASE,
} from '../living/regionState.js';
import { LIVING_ROLL_DEGREE, resolveLivingRoll } from '../living/livingRolls.js';
import { isAscendedGod } from './apotheosisLive.js';
import { addApotheosisFaith, spendApotheosisFaith } from './apotheosisStage2.js';
import {
  PANTHEON_DEITIES,
  TAMRIEL_REGION_COUNT,
  getPantheonDeity,
  ensurePantheonState,
  getRegionInfluence,
  setRegionInfluenceShare,
  shiftRegionInfluence,
  changeDeityRelation,
  setStage34DailyTickHook,
  appendPantheonChronicle,
} from './apotheosisStage3.js';
import {
  CULT_TELEPORT_SANCTUARY_FAITH_COST,
  ensureCultState,
  getAllCultSites,
  getCultSite,
} from './apotheosisCult.js';

export const APOTHEOSIS_SIEGE_TIERS = Object.freeze(['off', 'low', 'mid', 'high']);

export const DIVINE_WAR_SUPPORT_COST = 600;
export const DIVINE_WAR_TRUCE_COST = 900;
export const DIVINE_SKIRMISH_PACIFY_FAITH_COST = 150;
export const MUNDANE_WAR_PACIFY_EXTRA_GOLD = 100;
export const DIVINE_WAR_DURATION_DAYS = 10;
export const WAR_SKIRMISH_PACIFY_GOAL = 3;
export const MAX_CONCURRENT_GOD_WARS = 3;

const SIEGE_TIER_CONFIGS = Object.freeze({
  off: Object.freeze({
    tier: 'off',
    enabled: false,
    dailySiegeChance: 0,
    maxActiveSieges: 0,
    siegeCooldownDays: 999,
    skirmishCooldownMinutes: 0,
    squadScale: 0,
    allyScale: 0,
    skirmishSize: 0,
    warRegionsRange: Object.freeze([0, 0]),
    fastTravelInterruptChance: 0,
  }),
  low: Object.freeze({
    tier: 'low',
    enabled: true,
    dailySiegeChance: 0.25,
    maxActiveSieges: 2,
    siegeCooldownDays: 3,
    skirmishCooldownMinutes: 300, // 5 in-game hours
    squadScale: 1.0,
    allyScale: 1.0,
    skirmishSize: 2,
    warRegionsRange: Object.freeze([1, 2]),
    fastTravelInterruptChance: 0.20,
  }),
  mid: Object.freeze({
    tier: 'mid',
    enabled: true,
    dailySiegeChance: 0.50,
    maxActiveSieges: 3,
    siegeCooldownDays: 1,
    skirmishCooldownMinutes: 120, // 2 in-game hours
    squadScale: 1.5,
    allyScale: 1.5,
    skirmishSize: 3,
    warRegionsRange: Object.freeze([2, 3]),
    fastTravelInterruptChance: 0.40,
  }),
  high: Object.freeze({
    tier: 'high',
    enabled: true,
    dailySiegeChance: 0.80,
    maxActiveSieges: 5,
    siegeCooldownDays: 0,
    skirmishCooldownMinutes: 60, // 1 in-game hour
    squadScale: 2.5,
    allyScale: 2.0,
    skirmishSize: 5,
    warRegionsRange: Object.freeze([3, 4]),
    fastTravelInterruptChance: 0.70,
  }),
});

function clampReg(regionIndex) {
  const n = Math.trunc(Number(regionIndex) || 0);
  return Math.max(0, Math.min(TAMRIEL_REGION_COUNT - 1, n));
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function round1(v) {
  return Math.round(Number(v) * 10) / 10;
}

function rollInt(min, max, rng = Math.random) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1)) % (hi - lo + 1);
}

/**
 * Resolves active 4-tier settings configuration (`apotheosisTempleSieges`:
 * `'off' | 'low' | 'mid' | 'high'`, default `'mid'`).
 */
export function getApotheosisSiegeConfig(overrideTier = null) {
  const raw = overrideTier ?? getPref('apotheosisTempleSieges') ?? 'mid';
  const key = String(raw).toLowerCase();
  return SIEGE_TIER_CONFIGS[key] ?? SIEGE_TIER_CONFIGS.mid;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. TEMPLE & SANCTUARY SIEGES
// ─────────────────────────────────────────────────────────────────────────────

/** Returns all player-owned sanctuaries & temples currently under siege. */
export function getActiveCultSieges(entity) {
  if (!entity) return [];
  const sites = getAllCultSites(entity, { ownedOnly: true });
  return sites.filter((s) => s && s.siege && typeof s.siege === 'object');
}

function pickAttackerGodForSiege(entity, requestedGodId = null, allowAnyHostile = false) {
  const p = ensurePantheonState(entity);
  if (requestedGodId) {
    const g = getPantheonDeity(requestedGodId);
    if (g) return g;
  }
  if (p?.deities) {
    const warGods = PANTHEON_DEITIES.filter((d) => p.deities[d.id]?.status === 'war');
    if (warGods.length > 0) return warGods[0];
    if (allowAnyHostile) {
      const sorted = [...PANTHEON_DEITIES].sort(
        (a, b) => (p.deities[a.id]?.relation ?? 0) - (p.deities[b.id]?.relation ?? 0),
      );
      if (sorted[0]) return sorted[0];
    }
  }
  return getPantheonDeity('mehrunes_dagon') ?? PANTHEON_DEITIES[0];
}

/**
 * Initiates a siege against a player-owned Temple or Underground Sanctuary.
 * Militant sanctums resist for 5 days (7200 min) vs 3 days (4320 min) otherwise.
 */
export function startCultSiteSiege(
  entity,
  siteKey = null,
  attackerGodId = null,
  { nowMinutes = 0, force = false, tierOverride = null, preferredMapId = null } = {},
) {
  if (!entity) return { ok: false, reason: t('apotheosis.siege.errNoEntity', 'No active character.') };
  const cult = ensureCultState(entity);
  if (!cult) return { ok: false, reason: t('apotheosis.siege.errNoCult', 'Cult state unavailable.') };

  const cfg = getApotheosisSiegeConfig(tierOverride);
  if (!force && !cfg.enabled) {
    return { ok: false, reason: t('apotheosis.siege.errDisabled', 'Temple Sieges are disabled in Settings.') };
  }

  const owned = getAllCultSites(entity, { ownedOnly: true });
  const unbesieged = owned.filter((s) => !s.siege);
  const prefMid = preferredMapId != null && Number(preferredMapId) > 0 ? (Number(preferredMapId) >>> 0) : 0;
  const preferredUnbesieged = prefMid
    ? unbesieged.find((s) => (Number(s.mapId) >>> 0) === prefMid)
    : null;
  const preferredAny = prefMid
    ? owned.find((s) => (Number(s.mapId) >>> 0) === prefMid)
    : null;
  const site = siteKey
    ? getCultSite(entity, siteKey)
    : (preferredUnbesieged ?? preferredAny ?? unbesieged[0] ?? owned[0] ?? null);

  if (!site) {
    return { ok: false, reason: t('apotheosis.siege.errNoSite', 'No player-owned Temple or Sanctuary found to besiege.') };
  }
  if (!force && site.ownerId !== 'player') {
    return { ok: false, reason: t('apotheosis.siege.errNotOwned', 'Only player-owned sanctums can be besieged.') };
  }
  if (!force && site.siege) {
    return { ok: false, reason: t('apotheosis.siege.errAlreadySieged', '{site} is already under siege.', { site: site.name }) };
  }

  const attacker = pickAttackerGodForSiege(entity, attackerGodId, force);
  const tier = Math.max(1, Math.min(3, Number(site.tier) || 1));
  const durationDays = site.branch === 'militant' ? 5 : 3;
  const durationMinutes = durationDays * 1440;
  const now = Number(nowMinutes) || 0;

  const squadScale = cfg.enabled ? cfg.squadScale : 1.5;
  const allyScale = cfg.enabled ? cfg.allyScale : 1.5;
  const baseAttackers = tier === 3 ? 5 : tier === 2 ? 4 : 3;
  const attackerCount = Math.max(2, Math.min(12, Math.round(baseAttackers * squadScale)));
  const baseDefenders = (tier === 3 ? 3 : tier === 2 ? 2 : 1) + (site.branch === 'militant' ? 2 : 0);
  const defenderCount = Math.max(1, Math.min(10, Math.round(baseDefenders * allyScale)));

  const siege = {
    attackerGodId: attacker.id,
    attackerGodName: attacker.name,
    startedAtMinutes: now,
    expiresAtMinutes: now + durationMinutes,
    durationDays,
    attackerCount,
    remainingAttackers: attackerCount,
    defenderCount,
    spawned: false,
  };
  site.siege = siege;
  cult.lastSiegeStartedDay = Math.floor(now / 1440);

  const p = ensurePantheonState(entity, { nowMinutes: now });
  const regName = getLocalizedRegionName(site.regionIndex, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const msg = t(
    'apotheosis.siege.startedHud',
    '{god} has laid siege to {site} in {region}! ({days}d remaining to defend)',
    { god: attacker.name, site: site.name, region: regName, days: durationDays },
  );
  appendPantheonChronicle(entity, {
    day: Math.floor(now / 1440),
    minutes: now,
    category: 'against_me',
    godId: attacker.id,
    regionIndex: site.regionIndex,
    text: msg,
  });
  if (p?.deities?.[attacker.id] && !p.deities[attacker.id].status) {
    p.deities[attacker.id].status = 'war';
  }
  hudText(msg, 7);

  return { ok: true, site, siege, message: msg };
}

/**
 * Computes exact Siege victory rewards and failure/sacrifice penalties for `site`.
 */
export function getCultSiegePreview(entity, site) {
  if (!site?.siege) return null;
  const tier = Math.max(1, Math.min(3, Number(site.tier) || 1));
  const baseReward = tier === 3
    ? { faith: 220, influence: 5.0, gold: 3000 }
    : tier === 2
      ? { faith: 140, influence: 3.0, gold: 1500 }
      : { faith: 80, influence: 1.5, gold: 750 };
  const victoryFaith = site.branch === 'militant'
    ? Math.round(baseReward.faith * 1.3)
    : baseReward.faith;
  const baseLoss = tier === 3 ? 10 : tier === 2 ? 6 : 3;
  const lossInfluence = Math.min(12, baseLoss + (site.branch === 'missionary' ? 2 : 0));
  const attackerDef = getPantheonDeity(site.siege.attackerGodId);
  return {
    attackerGodId: site.siege.attackerGodId,
    attackerName: site.siege.attackerGodName ?? attackerDef?.name ?? site.siege.attackerGodId,
    attackerCount: Number(site.siege.attackerCount) || 3,
    remainingAttackers: Math.max(0, Number(site.siege.remainingAttackers ?? site.siege.attackerCount) || 0),
    defenderCount: Number(site.siege.defenderCount) || 2,
    durationDays: Number(site.siege.durationDays) || 3,
    victoryFaith,
    victoryGold: baseReward.gold,
    victoryInfluence: baseReward.influence,
    lossInfluence,
  };
}

/**
 * Resolves an active siege on `siteKey` with either `'victory'` or `'failed'`.
 * Victory rewards Faith/Gold/Influence (+30% Faith if Militant).
 * Failure/Sacrifice reverts the sanctum to attacker Tier 1 and shifts -3%..-12% influence.
 */
export function resolveCultSiegeOutcome(
  entity,
  siteKey,
  outcome = 'victory',
  { nowMinutes = 0 } = {},
) {
  if (!entity) return { ok: false, reason: t('apotheosis.siege.errNoEntity', 'No active character.') };
  const site = getCultSite(entity, siteKey);
  if (!site || !site.siege) {
    return { ok: false, reason: t('apotheosis.siege.errNoActiveSiege', 'That sanctum is not currently under siege.') };
  }

  const siege = site.siege;
  const preview = getCultSiegePreview(entity, site);
  const now = Number(nowMinutes) || 0;
  const p = ensurePantheonState(entity, { nowMinutes: now });
  const attackerId = siege.attackerGodId || 'mehrunes_dagon';
  const attackerName = preview?.attackerName ?? attackerId;
  const regName = getLocalizedRegionName(site.regionIndex, (i) => REGION_NAMES[i] ?? `Region ${i}`);

  if (outcome === 'victory') {
    const faithReward = entity?.apotheosis
      ? addApotheosisFaith(entity, preview.victoryFaith, { reason: 'siege_victory', nowMinutes: now, force: true }).requested
      : 0;
    const goldReward = preview.victoryGold;
    const infReward = preview.victoryInfluence;
    entity.goldPieces = Math.max(0, Math.trunc(Number(entity.goldPieces) || 0) + goldReward);
    shiftRegionInfluence(entity, site.regionIndex, 'player', infReward);

    if (p?.deities?.[attackerId]) {
      p.deities[attackerId].warscore = (Number(p.deities[attackerId].warscore) || 0) + 1;
      p.deities[attackerId].championsDefeated = (Number(p.deities[attackerId].championsDefeated) || 0) + 1;
    }

    site.siege = null;
    const msg = t(
      'apotheosis.siege.victoryHud',
      'Siege broken at {site}! +{faith} Faith, +{gold}g, +{inf}% Influence.',
      { site: site.name, faith: faithReward, gold: goldReward, inf: infReward },
    );
    appendPantheonChronicle(entity, {
      day: Math.floor(now / 1440),
      minutes: now,
      category: 'my_cult',
      godId: attackerId,
      regionIndex: site.regionIndex,
      text: msg,
    });
    hudText(msg, 7);

    return {
      ok: true,
      outcome: 'victory',
      site,
      faithGained: faithReward,
      goldGained: goldReward,
      influenceGained: infReward,
      message: msg,
    };
  }

  // Failed / Sacrificed site falls to attacker at Tier 1
  const infLoss = preview.lossInfluence;

  const regInf = getRegionInfluence(entity, site.regionIndex);
  const targetPlayerShare = round1(Math.max(0, (regInf?.playerShare ?? 0) - infLoss));
  shiftRegionInfluence(entity, site.regionIndex, attackerId, infLoss);
  setRegionInfluenceShare(entity, site.regionIndex, 'player', targetPlayerShare);

  site.formerOwnerId = site.ownerId;
  site.ownerId = attackerId;
  site.tier = 1;
  site.branch = null;
  site.guardiansCleared = false;
  site.siege = null;

  const msg = t(
    'apotheosis.siege.lostHud',
    '{site} in {region} fell to {god} (-{inf}% Influence)!',
    { site: site.name, region: regName, god: attackerName, inf: infLoss },
  );
  appendPantheonChronicle(entity, {
    day: Math.floor(now / 1440),
    minutes: now,
    category: 'against_me',
    godId: attackerId,
    regionIndex: site.regionIndex,
    text: msg,
  });
  hudText(msg, 7);

  return {
    ok: true,
    outcome: 'failed',
    site,
    influenceLost: infLoss,
    lostToGodId: attackerId,
    message: msg,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. INTER-DEITY RELIGIOUS WARS & PLAYER INTERVENTIONS
// ─────────────────────────────────────────────────────────────────────────────

/** Returns active inter-deity religious wars from `pantheon.activeGodWars`. */
export function getActiveGodWars(entity) {
  if (!entity) return [];
  const p = ensurePantheonState(entity);
  if (!p) return [];
  if (!Array.isArray(p.activeGodWars)) p.activeGodWars = [];
  return p.activeGodWars;
}

function setSingleRegionWarFlag(entity, regionIndex, atWar) {
  const reg = clampReg(regionIndex);
  if (!Array.isArray(entity.regionConditions)) {
    entity.regionConditions = createRegionConditions(TAMRIEL_REGION_COUNT);
  }
  if (atWar) {
    turnOnConditionFlag(entity.regionConditions, reg, REGION_FLAGS.WarOngoing);
    const curState = getRegionState(reg);
    if (curState && curState.crisis !== CRISIS_TYPE.WAR) {
      setRegionCrisis(reg, CRISIS_TYPE.WAR, CRISIS_PHASE.MID, DIVINE_WAR_DURATION_DAYS);
    }
  } else {
    turnOffConditionFlag(entity.regionConditions, reg, REGION_FLAGS.WarBeginning);
    turnOffConditionFlag(entity.regionConditions, reg, REGION_FLAGS.WarOngoing);
    turnOnConditionFlag(entity.regionConditions, reg, REGION_FLAGS.WarWon);
    setRegionCrisis(reg, CRISIS_TYPE.WAR, CRISIS_PHASE.NONE);
  }
}

function pickContestedRegionsForGods(entity, godA, godB, count, rng = Math.random) {
  const p = ensurePantheonState(entity);
  const scored = [];
  for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
    const shares = p?.regionInfluence?.[r] ?? {};
    const combined = (shares[godA] || 0) + (shares[godB] || 0);
    scored.push({ r, combined, jitter: rng() });
  }
  scored.sort((x, y) => (y.combined - x.combined) || (y.jitter - x.jitter));
  return scored.slice(0, Math.max(1, count)).map((item) => item.r);
}

/**
 * Starts an Inter-Deity Religious War between `godA` and `godB` across 1–4 regions.
 */
export function startInterDeityWar(
  entity,
  godA = null,
  godB = null,
  { nowMinutes = 0, regions = null, rng = Math.random, tierOverride = null } = {},
) {
  if (!entity) return { ok: false, reason: t('apotheosis.siege.errNoEntity', 'No active character.') };
  const p = ensurePantheonState(entity, { nowMinutes });
  if (!p) return { ok: false, reason: t('apotheosis.war.errNoPantheon', 'Pantheon state unavailable.') };
  if (!Array.isArray(p.activeGodWars)) p.activeGodWars = [];

  let defA = godA ? getPantheonDeity(godA) : null;
  let defB = godB ? getPantheonDeity(godB) : null;
  if (!defA || !defB || defA.id === defB.id) {
    defA = getPantheonDeity('akatosh') ?? PANTHEON_DEITIES[0];
    defB = getPantheonDeity('mehrunes_dagon') ?? PANTHEON_DEITIES.find((d) => d.id !== defA.id) ?? PANTHEON_DEITIES[1];
  }

  const pk = pairKey(defA.id, defB.id);
  const existing = p.activeGodWars.find((w) => pairKey(w.godA, w.godB) === pk);
  if (existing) {
    return { ok: true, alreadyActive: true, war: existing, message: `${defA.name} vs ${defB.name} is already active.` };
  }

  const cfg = getApotheosisSiegeConfig(tierOverride);
  const [minReg, maxReg] = cfg.enabled ? cfg.warRegionsRange : [2, 3];
  const regCount = rollInt(Math.max(1, minReg), Math.max(1, maxReg), rng);
  const targetRegions = Array.isArray(regions) && regions.length > 0
    ? [...new Set(regions.map(clampReg))]
    : pickContestedRegionsForGods(entity, defA.id, defB.id, regCount, rng);

  const now = Number(nowMinutes) || 0;
  const simDay = Math.floor(now / 1440);
  const war = {
    id: `godwar_${defA.id}_${defB.id}_${simDay}`,
    godA: defA.id,
    godB: defB.id,
    godAName: defA.name,
    godBName: defB.name,
    regions: targetRegions,
    startedDay: simDay,
    expiresDay: simDay + DIVINE_WAR_DURATION_DAYS,
    daysRemaining: DIVINE_WAR_DURATION_DAYS,
    playerStance: null, // null | 'sideA' | 'sideB' | 'peace' | 'watch'
    regionPacified: {},
    pacifiedCount: 0,
  };
  p.activeGodWars.push(war);

  for (const r of targetRegions) {
    setSingleRegionWarFlag(entity, r, true);
  }

  const regionNames = targetRegions
    .map((r) => getLocalizedRegionName(r, (i) => REGION_NAMES[i] ?? `Region ${i}`))
    .join(', ');
  const msg = t(
    'apotheosis.war.startedHud',
    'Religious War erupted between {godA} and {godB} across {regions}!',
    { godA: defA.name, godB: defB.name, regions: regionNames },
  );
  appendPantheonChronicle(entity, {
    day: simDay,
    minutes: now,
    category: 'diplomacy',
    godId: defA.id,
    regionIndex: targetRegions[0],
    text: msg,
  });
  hudText(msg, 6);

  return { ok: true, war, message: msg };
}

/**
 * Supports one side in an active Inter-Deity Religious War (`600` Faith).
 * Locks `war.playerStance` for the whole war across all its regions.
 */
export function supportGodWarSide(entity, warId, sideGodId, { nowMinutes = 0, force = false } = {}) {
  const wars = getActiveGodWars(entity);
  const war = wars.find((w) => w.id === warId) ?? wars[0];
  if (!war) return { ok: false, reason: t('apotheosis.war.errNoWar', 'No matching active Religious War.') };
  if (sideGodId !== war.godA && sideGodId !== war.godB) {
    return { ok: false, reason: t('apotheosis.war.errBadSide', 'Deity is not a belligerent in this war.') };
  }

  if (!force) {
    const spend = spendApotheosisFaith(entity, DIVINE_WAR_SUPPORT_COST, { reason: `godwar_support_${sideGodId}` });
    if (!spend.ok) return { ok: false, reason: spend.error };
  }

  const rivalId = sideGodId === war.godA ? war.godB : war.godA;
  const sideDef = getPantheonDeity(sideGodId);
  const rivalDef = getPantheonDeity(rivalId);
  const now = Number(nowMinutes) || 0;

  war.playerStance = sideGodId === war.godA ? 'sideA' : 'sideB';
  changeDeityRelation(entity, sideGodId, 25, { nowMinutes: now, propagate: false });
  changeDeityRelation(entity, rivalId, -25, { nowMinutes: now, propagate: false });

  for (const reg of war.regions) {
    shiftRegionInfluence(entity, reg, 'player', 3);
    shiftRegionInfluence(entity, reg, sideGodId, 3);
  }

  const msg = t(
    'apotheosis.war.supportedHud',
    'Backed {ally} against {foe} in their Religious War (+3% Influence across {n} regions)!',
    { ally: sideDef?.name ?? sideGodId, foe: rivalDef?.name ?? rivalId, n: war.regions.length },
  );
  appendPantheonChronicle(entity, {
    day: Math.floor(now / 1440),
    minutes: now,
    category: 'my_cult',
    godId: sideGodId,
    regionIndex: war.regions[0],
    text: msg,
  });
  hudText(msg, 6);

  return { ok: true, war, sideGodId, rivalId, message: msg };
}

/**
 * Enforces a Divine Truce across an entire Inter-Deity Religious War (`900` Faith),
 * halting hostilities across all 1–4 regions and raising inter-deity standing.
 */
export function enforceGodWarTruce(entity, warId, { nowMinutes = 0, force = false } = {}) {
  const p = ensurePantheonState(entity, { nowMinutes });
  const wars = getActiveGodWars(entity);
  const idx = wars.findIndex((w) => w.id === warId);
  const war = idx >= 0 ? wars[idx] : wars[0];
  if (!war || !p) return { ok: false, reason: t('apotheosis.war.errNoWar', 'No matching active Religious War.') };

  if (!force) {
    const spend = spendApotheosisFaith(entity, DIVINE_WAR_TRUCE_COST, { reason: `godwar_truce_${war.id}` });
    if (!spend.ok) return { ok: false, reason: spend.error };
  }

  const now = Number(nowMinutes) || 0;
  for (const reg of war.regions) {
    setSingleRegionWarFlag(entity, reg, false);
    shiftRegionInfluence(entity, reg, 'player', 2);
  }

  const pk = pairKey(war.godA, war.godB);
  p.interGodRelations[pk] = Math.max(-35, Number(p.interGodRelations[pk] ?? -80));
  changeDeityRelation(entity, war.godA, 15, { nowMinutes: now, propagate: false });
  changeDeityRelation(entity, war.godB, 15, { nowMinutes: now, propagate: false });

  const rmIdx = p.activeGodWars.indexOf(war);
  if (rmIdx >= 0) p.activeGodWars.splice(rmIdx, 1);

  const msg = t(
    'apotheosis.war.truceHud',
    'Enforced Divine Truce between {godA} and {godB} across {n} regions (+2% Influence)!',
    { godA: war.godAName ?? war.godA, godB: war.godBName ?? war.godB, n: war.regions.length },
  );
  appendPantheonChronicle(entity, {
    day: Math.floor(now / 1440),
    minutes: now,
    category: 'diplomacy',
    godId: war.godA,
    regionIndex: war.regions[0],
    text: msg,
  });
  hudText(msg, 6);

  return { ok: true, endedWar: war, regionsCleared: war.regions.length, message: msg };
}

// Daily simulation tick (sieges and inter-deity wars)

/**
 * Runs daily Stage 3.4 simulation inside `tickPantheonDay`:
 * expires overdue sieges, starts new temple/sanctuary sieges, shifts influence
 * in active wars, and ignites new wars when mutual standing drops below -75.
 */
export function tickStage34Daily(entity, simMin = 0, simDay = 0, rng = Math.random, tierOverride = null, { preAscension = false } = {}) {
  const ascended = isAscendedGod(entity);
  if (!entity || (!ascended && !preAscension)) return { expiredSieges: 0, startedSieges: 0, startedWars: 0 };
  const p = ensurePantheonState(entity, { nowMinutes: simMin });
  if (!p) return { expiredSieges: 0, startedSieges: 0, startedWars: 0 };
  const playerActive = ascended && !preAscension;
  const cult = playerActive ? ensureCultState(entity) : null;
  if (playerActive && !cult) return { expiredSieges: 0, startedSieges: 0, startedWars: 0 };

  let expiredSieges = 0;
  let startedSieges = 0;
  let startedWars = 0;

  if (playerActive) {
    // 1) Resolve overdue sieges first regardless of toggle
    for (const site of getActiveCultSieges(entity)) {
      if (simMin >= Number(site.siege?.expiresAtMinutes ?? Infinity)) {
        const res = resolveCultSiegeOutcome(entity, site.siteKey, 'failed', { nowMinutes: simMin });
        if (res.ok) expiredSieges++;
      }
    }
  }

  const cfg = getApotheosisSiegeConfig(tierOverride);
  if (!cfg.enabled) {
    return { expiredSieges, startedSieges, startedWars };
  }

  if (playerActive) {
    // 2) Warring deities try to lay siege to player Temples / Sanctuaries
    let activeCount = getActiveCultSieges(entity).length;
    for (const d of PANTHEON_DEITIES) {
      if (activeCount >= cfg.maxActiveSieges) break;
      if (p.deities?.[d.id]?.status !== 'war') continue;
      const lastDay = cult.lastSiegeStartedDay ?? -999;
      if ((simDay - lastDay) < cfg.siegeCooldownDays) continue;
      if (rng() >= cfg.dailySiegeChance) continue;

      const candidates = getAllCultSites(entity, { ownedOnly: true }).filter((s) => !s.siege);
      if (!candidates.length) break;
      const pick = candidates[Math.floor(rng() * candidates.length) % candidates.length];
      const started = startCultSiteSiege(entity, pick.siteKey, d.id, { nowMinutes: simMin, tierOverride });
      if (started.ok) {
        startedSieges++;
        activeCount++;
      }
    }
  }

  // 3) Advance active Inter-Deity Religious Wars
  if (!Array.isArray(p.activeGodWars)) p.activeGodWars = [];
  for (let i = p.activeGodWars.length - 1; i >= 0; i--) {
    const war = p.activeGodWars[i];
    for (const r of war.regions) {
      setSingleRegionWarFlag(entity, r, true);
      const shiftAmt = round1(2 + rng() * 2);
      const favorA = war.playerStance === 'sideA'
        ? rng() < 0.72
        : war.playerStance === 'sideB'
          ? rng() < 0.28
          : rng() < 0.5;
      const winner = favorA ? war.godA : war.godB;
      const loser = favorA ? war.godB : war.godA;
      shiftRegionInfluence(entity, r, loser, -shiftAmt);
      shiftRegionInfluence(entity, r, winner, shiftAmt);
      if (war.playerStance === 'sideA' || war.playerStance === 'sideB') {
        shiftRegionInfluence(entity, r, 'player', 0.5);
      }
    }
    war.daysRemaining = Math.max(0, Math.trunc(Number(war.daysRemaining ?? 0)) - 1);
    if (war.daysRemaining <= 0) {
      p.activeGodWars.splice(i, 1);
      for (const r of war.regions) {
        setSingleRegionWarFlag(entity, r, false);
      }
      appendPantheonChronicle(entity, {
        day: simDay,
        minutes: simMin,
        category: 'diplomacy',
        godId: war.godA,
        regionIndex: war.regions[0],
        text: t(
          'apotheosis.war.endedChronicle',
          'The Religious War between {godA} and {godB} has exhausted its fervor.',
          { godA: war.godAName ?? war.godA, godB: war.godBName ?? war.godB },
        ),
      });
    }
  }

  // 4) Ignite new Inter-Deity Wars when mutual standing drops below -75
  if (p.activeGodWars.length < MAX_CONCURRENT_GOD_WARS) {
    for (const [k, relVal] of Object.entries(p.interGodRelations)) {
      if (p.activeGodWars.length >= MAX_CONCURRENT_GOD_WARS) break;
      if (Number(relVal) >= -75) continue;
      const [gA, gB] = k.split('|');
      if (!gA || !gB || gA === gB) continue;
      if (p.activeGodWars.some((w) => pairKey(w.godA, w.godB) === k)) continue;
      const wRes = startInterDeityWar(entity, gA, gB, { nowMinutes: simMin, rng, tierOverride });
      if (wRes.ok && !wRes.alreadyActive) startedWars++;
    }
  }

  return { expiredSieges, startedSieges, startedWars };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. UNIFIED WILDERNESS WAR SKIRMISHES (DIVINE & MUNDANE WARS)
// ─────────────────────────────────────────────────────────────────────────────

function buildDivineWarDescriptor(divineWar, reg, regName) {
  const defA = getPantheonDeity(divineWar.godA);
  const defB = getPantheonDeity(divineWar.godB);
  const godAName = defA?.name ?? divineWar.godAName ?? divineWar.godA;
  const godBName = defB?.name ?? divineWar.godBName ?? divineWar.godB;
  return {
    warKind: 'divine',
    warId: divineWar.id,
    regIdx: reg,
    regionName: regName,
    regions: Array.isArray(divineWar.regions) && divineWar.regions.length ? [...divineWar.regions] : [reg],
    godA: divineWar.godA,
    godB: divineWar.godB,
    sideAId: divineWar.godA,
    sideBId: divineWar.godB,
    sideAName: t('apotheosis.skirmish.crusaders', '{god} Crusaders', { god: godAName }),
    sideBName: t('apotheosis.skirmish.zealots', '{god} Zealots', { god: godBName }),
    playerStance: divineWar.playerStance ?? null,
    pacifiedCount: Number(divineWar.regionPacified?.[reg] || 0),
    war: divineWar,
  };
}

const CANONICAL_RIVAL_REGIONS = Object.freeze({
  17: 23, // Daggerfall <-> Wayrest
  23: 17, // Wayrest <-> Daggerfall
  19: 20, // Betony <-> Sentinel
  20: 22, // Sentinel <-> Lainlyn
  22: 20, // Lainlyn <-> Sentinel
  18: 17, // Glenpoint -> Daggerfall
  21: 17, // Anticlere -> Daggerfall
  16: 26, // Wrothgarian Mountains <-> Orsinium Area
  26: 23, // Orsinium Area -> Wayrest
  5: 17,  // Dwynnen -> Daggerfall
  9: 23,  // Isle of Balfiera -> Wayrest
  34: 23, // Alcaire -> Wayrest
  33: 23, // Menevia -> Wayrest
});

function resolveCanonicalRivalRegion(reg) {
  const mapped = CANONICAL_RIVAL_REGIONS[reg];
  if (Number.isInteger(mapped) && mapped !== reg) return mapped;
  return reg === 17 ? 23 : 17;
}

/**
 * Clears saved stance & pacification progress for a mundane war in `regionIndex`
 * so newly declared regional wars start undeclared (`ChoiceWindow` opens on first clash).
 */
export function resetMundaneWarProgress(entity, regionIndex) {
  const cult = ensureCultState(entity);
  if (!cult) return;
  const reg = clampReg(regionIndex);
  if (cult.mundaneWarStances && typeof cult.mundaneWarStances === 'object') {
    delete cult.mundaneWarStances[reg];
  }
  if (cult.mundaneWarPacified && typeof cult.mundaneWarPacified === 'object') {
    delete cult.mundaneWarPacified[reg];
  }
}

function findExplicitRivalWarRegions(entity, reg) {
  const out = [];
  const regWars = entity?.apotheosis?.pantheon?.regionWars;
  if (!regWars || typeof regWars !== 'object') return out;
  for (const [pk, active] of Object.entries(regWars)) {
    if (!active) continue;
    const [aStr, bStr] = String(pk).split('|');
    const rA = Number(aStr);
    const rB = Number(bStr);
    if (!Number.isInteger(rA) || !Number.isInteger(rB)) continue;
    if (rA === reg && rB !== reg && !out.includes(rB)) out.push(rB);
    else if (rB === reg && rA !== reg && !out.includes(rA)) out.push(rA);
  }
  return out;
}

function getDivineWarRegionSet(entity) {
  const divineRegs = new Set();
  const wars = entity?.apotheosis?.pantheon?.activeGodWars;
  if (Array.isArray(wars)) {
    for (const w of wars) {
      for (const r of w?.regions ?? []) divineRegs.add(r);
    }
  }
  return divineRegs;
}

function findRivalWarRegions(entity, reg) {
  const out = findExplicitRivalWarRegions(entity, reg);
  if (out.length === 0) {
    const divineRegs = getDivineWarRegionSet(entity);
    const canon = resolveCanonicalRivalRegion(reg);
    const canonFlag = conditionFlag(entity?.regionConditions, canon, REGION_FLAGS.WarOngoing)
      || conditionFlag(entity?.regionConditions, canon, REGION_FLAGS.WarBeginning);
    if (canonFlag && !divineRegs.has(canon)) {
      out.push(canon);
    } else {
      for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
        if (r === reg || divineRegs.has(r)) continue;
        const fl = conditionFlag(entity?.regionConditions, r, REGION_FLAGS.WarOngoing)
          || conditionFlag(entity?.regionConditions, r, REGION_FLAGS.WarBeginning);
        if (fl) {
          out.push(r);
          break;
        }
      }
    }
  }
  return out;
}

function findIncomingMundaneRivals(entity, reg) {
  const out = [];
  const divineRegs = getDivineWarRegionSet(entity);
  for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
    if (r === reg || divineRegs.has(r)) continue;
    const st = getRegionState(r);
    const fl = conditionFlag(entity?.regionConditions, r, REGION_FLAGS.WarOngoing)
      || conditionFlag(entity?.regionConditions, r, REGION_FLAGS.WarBeginning);
    if (!fl && st?.crisis !== CRISIS_TYPE.WAR) continue;
    const rivals = findRivalWarRegions(entity, r);
    const primary = rivals.length > 0 ? rivals[0] : resolveCanonicalRivalRegion(r);
    if (primary === reg) out.push(r);
  }
  return out;
}

function buildMundaneWarDescriptor(entity, reg, regName) {
  const regState = getRegionState(reg);
  const flagWar = conditionFlag(entity?.regionConditions, reg, REGION_FLAGS.WarOngoing)
    || conditionFlag(entity?.regionConditions, reg, REGION_FLAGS.WarBeginning);
  const explicitRivals = findExplicitRivalWarRegions(entity, reg);
  const incomingRivals = (flagWar || regState?.crisis === CRISIS_TYPE.WAR || explicitRivals.length > 0)
    ? []
    : findIncomingMundaneRivals(entity, reg);
  const isMundaneWar = Boolean(flagWar || regState?.crisis === CRISIS_TYPE.WAR || explicitRivals.length > 0 || incomingRivals.length > 0);
  if (!isMundaneWar) {
    const cult = entity?.apotheosis?.cult;
    if (cult?.mundaneWarStances) delete cult.mundaneWarStances[reg];
    if (cult?.mundaneWarPacified) delete cult.mundaneWarPacified[reg];
    return null;
  }
  const rivalRegs = incomingRivals.length > 0 ? [...incomingRivals] : findRivalWarRegions(entity, reg);
  if (rivalRegs.length === 0) {
    rivalRegs.push(resolveCanonicalRivalRegion(reg));
  }

  const cult = entity?.apotheosis?.cult;
  const playerStance = cult?.mundaneWarStances?.[reg] ?? null;
  const pacifiedCount = Number(cult?.mundaneWarPacified?.[reg] || 0);
  const rivalName = getLocalizedRegionName(rivalRegs[0], (i) => REGION_NAMES[i] ?? `Region ${i}`);
  return {
    warKind: 'mundane',
    warId: `mundane_war_${reg}`,
    regIdx: reg,
    regionName: regName,
    regions: [reg, ...rivalRegs],
    godA: null,
    godB: null,
    sideAId: 'vanguard',
    sideBId: 'invaders',
    sideAName: t('apotheosis.skirmish.vanguard', '{region} Vanguard', { region: regName }),
    sideBName: t('apotheosis.skirmish.vanguard', '{region} Vanguard', { region: rivalName }),
    playerStance,
    pacifiedCount,
    war: null,
  };
}

/**
 * Inspects `regionIndex` and returns a unified war descriptor if either an
 * Inter-Deity Religious War (`warKind: 'divine'`) or a Mundane regional war
 * (`warKind: 'mundane'`) is currently active in that region.
 * Pass `{ preferKind: 'mundane' | 'divine' }` to disambiguate when both exist.
 */
export function getActiveWarForRegion(entity, regionIndex, { preferKind = null } = {}) {
  const reg = clampReg(regionIndex);
  const regName = getLocalizedRegionName(reg, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const wars = entity?.apotheosis?.pantheon?.activeGodWars;
  const divineWar = Array.isArray(wars)
    ? wars.find((w) => Array.isArray(w?.regions) && w.regions.includes(reg))
    : null;

  if (preferKind === 'mundane') {
    return buildMundaneWarDescriptor(entity, reg, regName)
      ?? (divineWar ? buildDivineWarDescriptor(divineWar, reg, regName) : null);
  }
  if (divineWar) {
    return buildDivineWarDescriptor(divineWar, reg, regName);
  }
  if (preferKind === 'divine') return null;
  return buildMundaneWarDescriptor(entity, reg, regName);
}

/**
 * Persists the player's chosen war stance (`'sideA' | 'sideB' | 'peace' | 'watch' | null`)
 * across all skirmishes of that Divine or Mundane war.
 */
export function setWarPlayerStance(entity, warDesc, stance) {
  if (!entity || !warDesc) return false;
  const nextStance = stance === 'reset' ? null : (stance ?? null);
  warDesc.playerStance = nextStance;
  if (warDesc.warKind === 'divine' && warDesc.war) {
    warDesc.war.playerStance = nextStance;
    return true;
  }
  const cult = ensureCultState(entity);
  if (!cult) return false;
  if (!cult.mundaneWarStances || typeof cult.mundaneWarStances !== 'object') {
    cult.mundaneWarStances = {};
  }
  const writeRegStance = (rIdx, st) => {
    if (!Number.isInteger(rIdx)) return;
    if (st == null) delete cult.mundaneWarStances[rIdx];
    else cult.mundaneWarStances[rIdx] = st;
  };
  writeRegStance(warDesc.regIdx, nextStance);
  const flipped = nextStance === 'sideA' ? 'sideB' : nextStance === 'sideB' ? 'sideA' : nextStance;
  if (Array.isArray(warDesc.regions)) {
    for (const r of warDesc.regions) {
      if (Number.isInteger(r) && r !== warDesc.regIdx) {
        writeRegStance(r, flipped);
      }
    }
  }
  return true;
}

/**
 * Checks whether a Wilderness War Skirmish can spawn in `regionIndex` at `nowMinutes`.
 * STRICT SEA GUARD: never spawns when `isOcean` or `isAfloat` is true.
 */
export function canSpawnWarSkirmish(
  entity,
  regionIndex,
  nowMinutes = 0,
  { isOcean = false, isAfloat = false, force = false, tierOverride = null } = {},
) {
  if (!entity || isOcean || isAfloat) return false;
  const cfg = getApotheosisSiegeConfig(tierOverride);
  if (!cfg.enabled) return false;
  const warDesc = getActiveWarForRegion(entity, regionIndex);
  if (!warDesc) return false;
  if (force) return true;

  const cult = ensureCultState(entity);
  const lastMin = Number(cult?.lastWarSkirmishMinutes ?? -999999);
  return (Number(nowMinutes) - lastMin) >= cfg.skirmishCooldownMinutes;
}

/** Records the game-clock timestamp of a spawned Wilderness War Skirmish. */
export function markWarSkirmishSpawned(entity, nowMinutes = 0) {
  const cult = ensureCultState(entity);
  if (!cult) return;
  cult.lastWarSkirmishMinutes = Number(nowMinutes) || 0;
}

/**
 * Resolves the hard Diplomacy + Willpower + Faith Pacification option for a War Skirmish:
 *  - Divine War costs 150 Faith up front;
 *  - Roll is SOCIAL_DIPLOMACY DC 85 (Etiquette + Personality + Willpower mod);
 *  - Multi-stage 5-degree outcome (Triumph / Success / Partial / Failure / Critical Failure);
 *  - At 3 pacifications in a region, ends the regional war early!
 */
export function resolveWarSkirmishPacify(
  entity,
  warDesc,
  { nowMinutes = 0, rng = Math.random, force = false, forcedDegree = null } = {},
) {
  if (!entity || !warDesc) {
    return { ok: false, reason: t('apotheosis.war.errNoWar', 'No matching active Religious War.'), skirmishStance: 'neutral_watch' };
  }

  const now = Number(nowMinutes) || 0;
  const reg = clampReg(warDesc.regIdx);
  const isDivine = warDesc.warKind === 'divine';

  if (isDivine && !force) {
    const spend = spendApotheosisFaith(entity, DIVINE_SKIRMISH_PACIFY_FAITH_COST, { reason: 'skirmish_pacify' });
    if (!spend.ok) {
      return {
        ok: false,
        faithShortage: true,
        reason: spend.error,
        skirmishStance: 'neutral_watch',
      };
    }
  }

  const wp = Number(liveStat(entity, 'willpower') ?? entity?.attributes?.willpower ?? entity?.stats?.willpower ?? 50);
  const willpowerMod = Math.trunc((wp - 50) * 0.35);

  const rollResult = resolveLivingRoll({
    formulaId: 'SOCIAL_DIPLOMACY',
    playerEntity: entity,
    skillId: SKILLS.Etiquette,
    statName: 'personality',
    difficulty: 35, // SOCIAL_DIPLOMACY targetOffset is 50 => DC 85
    contextBonus: willpowerMod,
    regionIndex: reg,
    rng,
  });

  const degree = forcedDegree ?? rollResult.degree;
  let pacified = false;
  let skirmishStance = 'neutral_watch';
  let pacifyIncrement = 0;
  let faithReward = 0;
  let goldReward = 0;
  let infReward = 0;
  let warEndedEarly = false;

  if (degree === LIVING_ROLL_DEGREE.CRITICAL_FAILURE) {
    skirmishStance = 'both_hostile';
  } else if (degree === LIVING_ROLL_DEGREE.FAILURE) {
    skirmishStance = 'neutral_watch';
  } else {
    pacified = true;
    skirmishStance = 'peace';
    setWarPlayerStance(entity, warDesc, 'peace');

    if (degree === LIVING_ROLL_DEGREE.TRIUMPH) {
      pacifyIncrement = 2;
      faithReward = isDivine ? 75 : 25;
      goldReward = isDivine ? 0 : 150;
      infReward = 2.5;
    } else if (degree === LIVING_ROLL_DEGREE.PARTIAL) {
      pacifyIncrement = 1;
      faithReward = isDivine ? 25 : 0;
      goldReward = 0;
      infReward = 1.0;
      // Extra stamina + Faith/Gold sacrifice for Partial compromise
      if (Number.isFinite(entity.fatigue)) {
        entity.fatigue = Math.max(1, Math.floor(entity.fatigue * 0.5));
      }
      if (isDivine && !force) {
        spendApotheosisFaith(entity, 75, { reason: 'skirmish_pacify_partial' });
      } else if (!isDivine && Number.isFinite(entity.goldPieces)) {
        entity.goldPieces = Math.max(0, Number(entity.goldPieces) - MUNDANE_WAR_PACIFY_EXTRA_GOLD);
      }
    } else {
      // SUCCESS
      pacifyIncrement = 1;
      faithReward = isDivine ? 50 : 20;
      goldReward = isDivine ? 0 : 100;
      infReward = 1.5;
    }

    if (faithReward > 0 && entity?.apotheosis) {
      faithReward = addApotheosisFaith(entity, faithReward, {
        reason: 'skirmish_pacify',
        nowMinutes: now,
        force: true,
      }).requested;
    }
    if (goldReward > 0) {
      entity.goldPieces = Math.max(0, (Number(entity.goldPieces) || 0) + goldReward);
    }
    if (infReward > 0 && isAscendedGod(entity)) {
      shiftRegionInfluence(entity, reg, 'player', infReward);
    }

    // Track regional pacification counter; at >= 3 end the war in that region early!
    let nextCount = pacifyIncrement;
    if (isDivine && warDesc.war) {
      if (!warDesc.war.regionPacified || typeof warDesc.war.regionPacified !== 'object') {
        warDesc.war.regionPacified = {};
      }
      nextCount = Number(warDesc.war.regionPacified[reg] || 0) + pacifyIncrement;
      warDesc.war.regionPacified[reg] = nextCount;
      warDesc.war.pacifiedCount = (warDesc.war.pacifiedCount || 0) + pacifyIncrement;
    } else {
      const cult = ensureCultState(entity);
      if (cult) {
        if (!cult.mundaneWarPacified || typeof cult.mundaneWarPacified !== 'object') {
          cult.mundaneWarPacified = {};
        }
        nextCount = Number(cult.mundaneWarPacified[reg] || 0) + pacifyIncrement;
        cult.mundaneWarPacified[reg] = nextCount;
      }
    }
    warDesc.pacifiedCount = nextCount;

    if (nextCount >= WAR_SKIRMISH_PACIFY_GOAL) {
      warEndedEarly = true;
      setSingleRegionWarFlag(entity, reg, false);
      if (isDivine && warDesc.war) {
        warDesc.war.regions = warDesc.war.regions.filter((r) => r !== reg);
        if (warDesc.war.regions.length === 0) {
          const p = ensurePantheonState(entity, { nowMinutes: now });
          const wIdx = p?.activeGodWars?.indexOf(warDesc.war) ?? -1;
          if (wIdx >= 0) p.activeGodWars.splice(wIdx, 1);
        }
      } else {
        const cult = ensureCultState(entity);
        const affected = new Set([reg, ...(Array.isArray(warDesc.regions) ? warDesc.regions : [])]);
        const regWars = entity?.apotheosis?.pantheon?.regionWars;
        if (regWars && typeof regWars === 'object') {
          for (const [pk, active] of Object.entries(regWars)) {
            if (!active) continue;
            const [aStr, bStr] = String(pk).split('|');
            const rA = Number(aStr);
            const rB = Number(bStr);
            if (rA === reg || rB === reg) {
              regWars[pk] = false;
              const otherReg = rA === reg ? rB : rA;
              if (Number.isInteger(otherReg) && findRivalWarRegions(entity, otherReg).length === 0) {
                affected.add(otherReg);
              }
            }
          }
        }
        for (const r of affected) {
          if (!Number.isInteger(r)) continue;
          if (cult?.mundaneWarPacified) delete cult.mundaneWarPacified[r];
          if (cult?.mundaneWarStances) delete cult.mundaneWarStances[r];
          setSingleRegionWarFlag(entity, r, false);
        }
      }
      if (isAscendedGod(entity)) {
        addApotheosisFaith(entity, 100, { reason: 'skirmish_war_ended', nowMinutes: now });
        shiftRegionInfluence(entity, reg, 'player', 3);
      } else {
        entity.goldPieces = Math.max(0, (Number(entity.goldPieces) || 0) + 250);
      }
      const endMsg = t(
        'apotheosis.skirmish.warEndedEarlyHud',
        'Peace restored in {region}! Three skirmishes pacified — the regional war has ended early.',
        { region: warDesc.regionName },
      );
      if (isAscendedGod(entity)) {
        appendPantheonChronicle(entity, {
          day: Math.floor(now / 1440),
          minutes: now,
          category: 'regions',
          regionIndex: reg,
          text: endMsg,
        });
      }
      hudText(endMsg, 7);
    }
  }

  return {
    ok: true,
    pacified,
    degree,
    rollResult,
    skirmishStance,
    pacifyIncrement,
    pacifiedCount: warDesc.pacifiedCount,
    faithReward,
    goldReward,
    infReward,
    warEndedEarly,
  };
}

/**
 * Determines whether paid fast travel should be interrupted by a Wilderness War Skirmish.
 * STRICT SEA GUARD: returns `false` whenever `isOcean` or `isAfloat` is true.
 */
export function shouldInterruptFastTravelForWar(
  entity,
  regionIndex,
  nowMinutes = 0,
  { isOcean = false, isAfloat = false, rng = Math.random, tierOverride = null } = {},
) {
  if (isOcean || isAfloat) return false;
  if (!canSpawnWarSkirmish(entity, regionIndex, nowMinutes, { isOcean, isAfloat, tierOverride })) {
    return false;
  }
  const cfg = getApotheosisSiegeConfig(tierOverride);
  return rng() < cfg.fastTravelInterruptChance;
}

// Register daily Stage 3.4 tick into `tickPantheonDay` cleanly without import cycles.
setStage34DailyTickHook((entity, simMin, simDay, rng, tierOverride = null, opts = {}) =>
  tickStage34Daily(entity, simMin, simDay, rng, tierOverride, opts),
);
