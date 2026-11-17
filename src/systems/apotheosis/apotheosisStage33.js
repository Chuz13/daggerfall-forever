// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 3.3: ROADSIDE SHRINES, ROAD BLESSING, BASTION DEFENSE &
// CULT PETITIONS (PILGRIMS & SUPPLICANTS)
// ═══════════════════════════════════════════════════════════════════════════════

import { t } from '../textManager.js';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
import { computeEntityMods, registerEntityFold } from '../entityMods.js';
import { liveStat, maxFatigue } from '../statMods.js';
import { isAscendedGod } from './apotheosisLive.js';
import {
  PANTHEON_DEITIES,
  TAMRIEL_REGION_COUNT,
  getPantheonDeity,
  ensurePantheonState,
  resolveRegionPatronDeityId,
  getRegionInfluence,
  shiftRegionInfluence,
  changeDeityRelation,
} from './apotheosisStage3.js';
import {
  ensureCultState,
  getAllCultSites,
  getActiveRegionalEdict,
  setEdictProclaimedHook,
} from './apotheosisCult.js';

export const ROAD_BLESSING_DURATION_MINUTES = 720; // 12 in-game hours
export const ROAD_BLESSING_MIN_GOLD = 50;
export const ROAD_BLESSING_WARMTH_DEGREES = 6;
export const ROADSIDE_DESECRATE_FAITH_BASE = 15;
export const ROADSIDE_DESECRATE_INF_BASE = 0.5;
export const ROADSIDE_WILD_REWARD_MULT = 3;
export const ROADSIDE_DESECRATE_RELATION_PENALTY = -10;
export const ROADSIDE_DESECRATE_COOLDOWN_MINUTES = 1440; // 1 in-game day per shrine node

export const BASTION_DEFENSE_PER_SITE = 0.15;
export const BASTION_DEFENSE_MAX = 0.45;

export const CULT_PETITION_COOLDOWN_MINUTES = 4320; // 3 in-game days
export const CULT_PETITION_DURATION_MINUTES = 10080; // 7 in-game days

function clampReg(regionIndex) {
  const n = Math.trunc(Number(regionIndex) || 0);
  return Math.max(0, Math.min(TAMRIEL_REGION_COUNT - 1, n));
}

function hashStr32(str) {
  let h = 2166136261 >>> 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function ensureApotheosisContainer(entity) {
  if (!entity || typeof entity !== 'object') return null;
  if (!entity.apotheosis || typeof entity.apotheosis !== 'object') {
    entity.apotheosis = {};
  }
  return entity.apotheosis;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ROAD BLESSING ("Under-the-hood" timed buff + HUD tile + Fatigue/Warmth)
// ─────────────────────────────────────────────────────────────────────────────

/** Grants or refreshes the timed Roadside Blessing buff on `entity`. */
export function grantRoadBlessing(entity, godId, donationGold = 50, nowMinutes = 0) {
  const apo = ensureApotheosisContainer(entity);
  if (!apo) return null;
  const gold = Math.max(ROAD_BLESSING_MIN_GOLD, Math.trunc(Number(donationGold) || 0));
  const deity = getPantheonDeity(godId);
  const now = Number(nowMinutes) || 0;
  const tier = gold >= 500 ? 3 : gold >= 200 ? 2 : 1;
  const fatiguePerMin = tier === 3 ? 4 : tier === 2 ? 3 : 2;
  const warmthDegrees = tier === 3 ? 8 : tier === 2 ? 6 : 4;
  const expiresAtMinutes = now + ROAD_BLESSING_DURATION_MINUTES;

  apo.roadBlessing = {
    godId: deity?.id ?? String(godId ?? 'akatosh'),
    godName: deity?.name ?? String(godId ?? 'Divine'),
    tier,
    fatiguePerMin,
    warmthDegrees,
    grantedAtMinutes: now,
    expiresAtMinutes,
  };

  // Immediate stamina/fatigue relief proportional to donation tier
  const capFatigue = maxFatigue(entity);
  if (Number.isFinite(entity.fatigue) && capFatigue > 0) {
    const instantPct = tier === 3 ? 0.35 : tier === 2 ? 0.25 : 0.15;
    entity.fatigue = Math.min(capFatigue, Math.max(0, entity.fatigue + Math.round(capFatigue * instantPct)));
  }

  computeEntityMods(entity);
  return apo.roadBlessing;
}

/** Returns live Road Blessing status (clearing expired entries automatically). */
export function getRoadBlessingInfo(entity, nowMinutes = 0) {
  const b = entity?.apotheosis?.roadBlessing;
  if (!b || typeof b !== 'object') return null;
  const now = Number(nowMinutes) || 0;
  const exp = Number(b.expiresAtMinutes) || 0;
  if (now >= exp) {
    delete entity.apotheosis.roadBlessing;
    computeEntityMods(entity);
    return null;
  }
  const minutesLeft = Math.max(0, Math.ceil(exp - now));
  const deity = getPantheonDeity(b.godId);
  return {
    active: true,
    godId: b.godId,
    godName: deity?.name ?? b.godName ?? b.godId,
    tier: b.tier ?? 1,
    fatiguePerMin: Number(b.fatiguePerMin) || 2,
    warmthDegrees: Number(b.warmthDegrees) || ROAD_BLESSING_WARMTH_DEGREES,
    minutesLeft,
    hoursLeft: Math.ceil(minutesLeft / 60),
    expiresAtMinutes: exp,
  };
}

/** EntityMods fold for active Road Blessing (weather/warmth + fatigueLess + elemental resist). */
export function computeRoadBlessingMods(entity) {
  const b = entity?.apotheosis?.roadBlessing;
  if (!b || typeof b !== 'object') return null;
  const deg = Math.max(2, Number(b.warmthDegrees) || ROAD_BLESSING_WARMTH_DEGREES);
  return {
    warmth: deg,
    coldDegrees: deg,
    heatDegrees: deg,
    dry: 0.25,
    fatigueLess: 0.20,
    resist: { frost: 10, fire: 10, shock: 10 },
  };
}

registerEntityFold('apotheosis_road_blessing', computeRoadBlessingMods);

/** Restores fatigue over elapsed in-game minutes while Road Blessing is active. */
export function tickRoadBlessingFatigue(entity, deltaMinutes = 0, nowMinutes = 0) {
  if (!entity || !(deltaMinutes > 0)) return 0;
  const info = getRoadBlessingInfo(entity, nowMinutes);
  if (!info) return 0;
  const cap = maxFatigue(entity);
  if (!Number.isFinite(entity.fatigue) || cap <= 0) return 0;
  const before = entity.fatigue;
  const gain = Math.min(cap - before, info.fatiguePerMin * deltaMinutes);
  if (gain > 0) {
    entity.fatigue = Math.min(cap, before + gain);
    return entity.fatigue - before;
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ROADSIDE SHRINES (Suburban exits & Ephemeral Wild Road Shrines)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Picks a deterministic patron deity for a Roadside Shrine node.
 * Rule (Balance Step 1): if `isSettlementWithoutTemple && exitIndex === 0`,
 * guarantees the region's Aedra patron (`resolveRegionPatronDeityId`).
 * Otherwise picks weighted by `getRegionInfluence(entity, regionIndex)`.
 */
export function pickRoadsideShrineGod(entity, {
  shrineId = 'roadside:default',
  regionIndex = 0,
  exitIndex = 0,
  isSettlementWithoutTemple = false,
} = {}) {
  const reg = clampReg(regionIndex);
  if (isSettlementWithoutTemple && exitIndex === 0) {
    return resolveRegionPatronDeityId(reg);
  }
  const inf = getRegionInfluence(entity, reg);
  const entries = PANTHEON_DEITIES.map((d) => ({
    id: d.id,
    weight: Math.max(0.5, Number(inf.shares?.[d.id] ?? 0)),
  }));
  const total = entries.reduce((acc, e) => acc + e.weight, 0);
  const h = hashStr32(shrineId);
  const roll = (h / 0x100000000) * total;
  let acc = 0;
  for (const e of entries) {
    acc += e.weight;
    if (roll <= acc) return e.id;
  }
  return resolveRegionPatronDeityId(reg);
}

function pruneOldDesecrations(cult, nowMinutes) {
  if (!cult.desecratedShrines || typeof cult.desecratedShrines !== 'object') {
    cult.desecratedShrines = {};
    return;
  }
  const cutoff = (Number(nowMinutes) || 0) - ROADSIDE_DESECRATE_COOLDOWN_MINUTES * 3;
  for (const [k, ts] of Object.entries(cult.desecratedShrines)) {
    if ((Number(ts) || 0) < cutoff) delete cult.desecratedShrines[k];
  }
}

/** Returns true if this roadside shrine was desecrated within the daily cooldown. */
export function isRoadsideShrineDesecrated(entity, shrineId, nowMinutes = 0) {
  const ts = entity?.apotheosis?.cult?.desecratedShrines?.[shrineId];
  if (ts == null) return false;
  return (Number(nowMinutes) || 0) - Number(ts) < ROADSIDE_DESECRATE_COOLDOWN_MINUTES;
}

/**
 * Pray & donate gold at a Roadside Shrine.
 * Grants relation (+1..+8), small regional influence for the patron god,
 * and Road Blessing (if gold >= 50).
 */
export function prayAtRoadsideShrine(entity, {
  shrineId = 'roadside:unknown',
  godId = 'akatosh',
  regionIndex = 0,
  goldAmount = 100,
  nowMinutes = 0,
} = {}) {
  if (!entity) return { ok: false, reason: t('apotheosis.roadShrine.err.noEntity', 'No character active.') };
  const amount = Math.max(0, Math.trunc(Number(goldAmount) || 0));
  if (amount <= 0) {
    return { ok: false, reason: t('apotheosis.roadShrine.err.zeroGold', 'Enter a positive gold offering.') };
  }
  const curGold = Math.max(0, Math.trunc(Number(entity.goldPieces) || 0));
  if (curGold < amount) {
    return {
      ok: false,
      reason: t('apotheosis.roadShrine.err.notEnoughGold', 'Not enough gold ({have}g / {need}g).', { have: curGold, need: amount }),
    };
  }

  const reg = clampReg(regionIndex);
  const now = Number(nowMinutes) || 0;
  const deity = getPantheonDeity(godId);
  const targetGodId = deity?.id ?? resolveRegionPatronDeityId(reg);

  entity.goldPieces = curGold - amount;

  // Small faith tithe if already ascended
  let faithSpent = 0;
  if (isAscendedGod(entity) && (entity.apotheosis.faith || 0) > 0) {
    faithSpent = Math.min(entity.apotheosis.faith, Math.min(25, Math.floor(entity.apotheosis.faith * 0.02)));
    entity.apotheosis.faith -= faithSpent;
  }

  const relGain = clamp(Math.floor(amount / 100) + 1, 1, 8);
  const infGain = Number(clamp(amount / 1200, 0.2, 0.8).toFixed(1));
  if (isAscendedGod(entity)) {
    ensurePantheonState(entity, { nowMinutes: now });
    changeDeityRelation(entity, targetGodId, relGain, { propagate: false });
    shiftRegionInfluence(entity, reg, targetGodId, infGain);
  }

  const blessing = amount >= ROAD_BLESSING_MIN_GOLD
    ? grantRoadBlessing(entity, targetGodId, amount, now)
    : null;

  return {
    ok: true,
    shrineId,
    godId: targetGodId,
    godName: deity?.name ?? targetGodId,
    goldSpent: amount,
    faithSpent,
    relationGain: relGain,
    influenceGain: infGain,
    blessingGranted: !!blessing,
    blessing,
  };
}

/**
 * Desecrates a Roadside Shrine:
 * - Wild ephemeral shrines (`isWild: true`) grant 3x Faith & 3x regional influence shift!
 * - Luck-based chance to summon deity champions/zealots right at the shrine.
 * - Updates active `desecrate_shrine` Cult Petition if matching.
 */
export function desecrateRoadsideShrine(entity, {
  shrineId = 'roadside:unknown',
  godId = 'akatosh',
  regionIndex = 0,
  isWild = false,
  nowMinutes = 0,
  rng = Math.random,
} = {}) {
  if (!entity) return { ok: false, reason: t('apotheosis.roadShrine.err.noEntity', 'No character active.') };
  const cult = ensureCultState(entity);
  const now = Number(nowMinutes) || 0;
  pruneOldDesecrations(cult, now);

  if (isRoadsideShrineDesecrated(entity, shrineId, now)) {
    return {
      ok: false,
      reason: t('apotheosis.roadShrine.err.alreadyDesecrated', 'This shrine has already been desecrated today.'),
    };
  }

  const reg = clampReg(regionIndex);
  const deity = getPantheonDeity(godId);
  const targetGodId = deity?.id ?? resolveRegionPatronDeityId(reg);
  const mult = isWild ? ROADSIDE_WILD_REWARD_MULT : 1;

  const faithGain = ROADSIDE_DESECRATE_FAITH_BASE * mult;
  const infShift = Number((ROADSIDE_DESECRATE_INF_BASE * mult).toFixed(1));

  cult.desecratedShrines[shrineId] = now;

  let ascended = isAscendedGod(entity);
  if (ascended) {
    ensurePantheonState(entity, { nowMinutes: now });
    entity.apotheosis.faith = (entity.apotheosis.faith || 0) + faithGain;
    changeDeityRelation(entity, targetGodId, ROADSIDE_DESECRATE_RELATION_PENALTY, { propagate: false });
    shiftRegionInfluence(entity, reg, targetGodId, -infShift);
    shiftRegionInfluence(entity, reg, 'player', infShift);
  }

  // Luck-based chance to spawn deity defenders (whether part of a quest or freeform)
  const luck = Number(liveStat(entity, 'luck')) || 50;
  const baseChance = isWild ? 0.75 : 0.55;
  const spawnChance = clamp(baseChance - (luck - 50) * 0.005, isWild ? 0.20 : 0.15, 0.90);
  const guardiansTriggered = rng() < spawnChance;
  const guardianCount = guardiansTriggered ? (isWild ? 2 : 1) : 0;

  // Notify Cult Petition tracker (if desecrate_shrine petition matches region & god)
  const petitionDone = notifyCultPetitionProgress(entity, 'desecrate_shrine', {
    godId: targetGodId,
    regionIndex: reg,
    isWild: !!isWild,
    nowMinutes: now,
  });

  return {
    ok: true,
    shrineId,
    godId: targetGodId,
    godName: deity?.name ?? targetGodId,
    isWild: !!isWild,
    multiplier: mult,
    faithGained: ascended ? faithGain : 0,
    relationPenalty: ascended ? ROADSIDE_DESECRATE_RELATION_PENALTY : 0,
    influenceShift: ascended ? infShift : 0,
    spawnChance,
    guardiansTriggered,
    guardianCount,
    petitionCompleted: petitionDone?.completed ? petitionDone : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. BASTION DEFENSE (Balance Step 3: held sites protect deity regional share)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes Bastion Defense (`0..0.45`) for `godId` in `regionIndex` from
 * undefeated Temples and Daedric Sanctuaries held by that deity in the region.
 */
export function getDeityRegionBastionDefense(entity, regionIndex, godId) {
  const sites = entity?.apotheosis?.cult?.sites;
  if (!sites || !godId || godId === 'player') return 0;
  const reg = clampReg(regionIndex);
  let activeCount = 0;
  for (const s of Object.values(sites)) {
    if (!s || s.regionIndex !== reg) continue;
    if (s.ownerId !== godId) continue;
    activeCount++;
  }
  return Math.min(BASTION_DEFENSE_MAX, activeCount * BASTION_DEFENSE_PER_SITE);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CULT PETITIONS (Pilgrims & Supplicants at Player Altars / Cult Tab)
// ─────────────────────────────────────────────────────────────────────────────

function pickEnemyDeityForPetition(entity, regionIndex, rng = Math.random) {
  const p = entity?.apotheosis?.pantheon;
  if (!p?.deities) return resolveRegionPatronDeityId(regionIndex);
  const candidates = PANTHEON_DEITIES.filter((d) => {
    const st = p.deities[d.id]?.status;
    return st === 'war' || st === 'hostile';
  });
  const pool = candidates.length ? candidates : PANTHEON_DEITIES;
  return pool[Math.floor(rng() * pool.length) % pool.length].id;
}

/** Returns currently active (unexpired) Cult Petition, or null. */
export function getActiveCultPetition(entity, nowMinutes = 0) {
  const pet = entity?.apotheosis?.cult?.petition;
  if (!pet || typeof pet !== 'object') return null;
  const now = Number(nowMinutes) || 0;
  if (pet.expiresAtMinutes != null && now >= pet.expiresAtMinutes) {
    entity.apotheosis.cult.petition = null;
    return null;
  }
  return pet;
}

/**
 * Generates a new Cult Petition once per `CULT_PETITION_COOLDOWN_MINUTES` (3 days)
 * when the ascended player owns at least 1 Cult site and has no active petition.
 */
export function ensureCultPetition(entity, {
  regionIndex = 0,
  nowMinutes = 0,
  rng = Math.random,
  force = false,
} = {}) {
  if (!entity || !isAscendedGod(entity)) return null;
  const cult = ensureCultState(entity);
  const now = Number(nowMinutes) || 0;
  const existing = getActiveCultPetition(entity, now);
  if (existing) return existing;

  const ownedSites = getAllCultSites(entity, { ownedOnly: true });
  if (!ownedSites.length) return null;

  if (!force && cult.lastPetitionAtMinutes != null && (now - cult.lastPetitionAtMinutes) < CULT_PETITION_COOLDOWN_MINUTES) {
    return null;
  }

  const reg = clampReg(regionIndex);
  const regionalOwned = ownedSites.filter((s) => s.regionIndex === reg);
  const targetSite = regionalOwned[0] ?? ownedSites[0];
  const targetReg = targetSite.regionIndex ?? reg;
  const enemyGodId = pickEnemyDeityForPetition(entity, targetReg, rng);
  const enemyDeity = getPantheonDeity(enemyGodId);

  const roll = rng();
  let type = 'desecrate_shrine';
  if (roll < 0.40) type = 'inquisition';
  else if (roll < 0.80) type = 'desecrate_shrine';
  else type = 'edict';

  const baseFaith = type === 'inquisition' ? 100 : type === 'edict' ? 80 : 60;
  const baseGold = type === 'inquisition' ? 600 : type === 'edict' ? 500 : 350;
  const baseInf = 2.5;

  const petition = {
    id: `pet_${Math.trunc(now)}_${hashStr32(`${type}_${targetReg}_${enemyGodId}`) % 10000}`,
    type,
    godId: enemyGodId,
    godName: enemyDeity?.name ?? enemyGodId,
    targetRegion: targetReg,
    targetSiteKey: targetSite.siteKey,
    targetSiteName: targetSite.name,
    progress: 0,
    goal: type === 'inquisition' ? 2 : 1,
    rewardFaith: baseFaith,
    rewardGold: baseGold,
    rewardInfluence: baseInf,
    inquisitionSpawned: false,
    createdAtMinutes: now,
    expiresAtMinutes: now + CULT_PETITION_DURATION_MINUTES,
  };

  cult.petition = petition;
  cult.lastPetitionAtMinutes = now;
  return petition;
}

/** Dismisses the active Cult Petition so another may appear after cooldown. */
export function dismissCultPetition(entity) {
  const cult = ensureCultState(entity);
  if (!cult?.petition) return { ok: false };
  cult.petition = null;
  return { ok: true };
}

/**
 * Advances / completes the active Cult Petition on matching world events:
 * - `inquisition`: killing spawned inquisitors at `targetSiteKey`
 * - `desecrate_shrine`: desecrating a roadside shrine of `godId` in `targetRegion` (x3 reward if `isWild`!)
 * - `edict`: proclaiming a Regional Edict in `targetRegion`
 */
export function notifyCultPetitionProgress(entity, eventKind, {
  godId = null,
  regionIndex = null,
  siteKey = null,
  isWild = false,
  nowMinutes = 0,
} = {}) {
  const pet = getActiveCultPetition(entity, nowMinutes);
  if (!pet) return { completed: false };

  let matched = false;
  if (pet.type === 'inquisition' && eventKind === 'inquisition_cleared') {
    if (!siteKey || siteKey === pet.targetSiteKey) matched = true;
  } else if (pet.type === 'desecrate_shrine' && eventKind === 'desecrate_shrine') {
    const regOk = regionIndex == null || clampReg(regionIndex) === pet.targetRegion;
    const godOk = !godId || godId === pet.godId;
    if (regOk && godOk) matched = true;
  } else if (pet.type === 'edict' && eventKind === 'edict_proclaimed') {
    if (regionIndex == null || clampReg(regionIndex) === pet.targetRegion) matched = true;
  }

  if (!matched) return { completed: false };

  const mult = (pet.type === 'desecrate_shrine' && isWild) ? ROADSIDE_WILD_REWARD_MULT : 1;
  const faithGained = pet.rewardFaith * mult;
  const goldGained = pet.rewardGold * mult;
  const infGained = Number((pet.rewardInfluence * mult).toFixed(1));

  entity.apotheosis.faith = (entity.apotheosis.faith || 0) + faithGained;
  entity.goldPieces = (Math.max(0, Math.trunc(Number(entity.goldPieces) || 0))) + goldGained;
  ensurePantheonState(entity, { nowMinutes });
  shiftRegionInfluence(entity, pet.targetRegion, 'player', infGained);

  entity.apotheosis.cult.petition = null;
  return {
    completed: true,
    petition: pet,
    multiplier: mult,
    isWild: !!isWild,
    faithGained,
    goldGained,
    influenceGained: infGained,
  };
}

/** Checks if an `edict` petition is already satisfied by an existing Regional Edict. */
export function syncEdictPetitionIfActive(entity, nowMinutes = 0) {
  const pet = getActiveCultPetition(entity, nowMinutes);
  if (!pet || pet.type !== 'edict') return null;
  const activeEd = getActiveRegionalEdict(entity, pet.targetRegion, nowMinutes);
  if (!activeEd) return null;
  return notifyCultPetitionProgress(entity, 'edict_proclaimed', {
    regionIndex: pet.targetRegion,
    nowMinutes,
  });
}

setEdictProclaimedHook((entity, regionIndex, nowMinutes) =>
  notifyCultPetitionProgress(entity, 'edict_proclaimed', { regionIndex, nowMinutes }),
);
