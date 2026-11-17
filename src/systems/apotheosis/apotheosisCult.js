// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 3 (MILESTONE 3.2): CULT TEMPLES, UNDERGROUND SANCTUARIES &
// 71-REGION EDICTS
// ═══════════════════════════════════════════════════════════════════════════════

import { t, getLocalizedRegionName } from '../textManager.js';
import { REGION_NAMES } from '../../formats/mapsTables.js';
import {
  REGION_FLAGS,
  turnOnConditionFlag,
  turnOffConditionFlag,
  createRegionConditions,
} from '../region/regionConditions.js';
import { getDivine } from '../guild/guildVariants.js';
import { inheritOfflineHome } from '../offlineHomes.js';
import { SKILLS, skillValue } from '../skills.js';
import { liveStat } from '../statMods.js';
import { isAscendedGod } from './apotheosisLive.js';
import {
  addApotheosisFaith,
  spendApotheosisFaith,
  setCultStage2Hooks,
} from './apotheosisStage2.js';
import {
  PANTHEON_DEITIES,
  TAMRIEL_REGION_COUNT,
  getPantheonDeity,
  ensurePantheonState,
  getRegionInfluence,
  shiftRegionInfluence,
  changeDeityRelation,
  setCultDailyTickHook,
  appendPantheonChronicle,
} from './apotheosisStage3.js';
import {
  SANCTUARY_HATCH_MODELS,
  SANCTUARY_INTERIOR_POOLS,
  pickSanctuaryArchitecture,
} from '../../world/apotheosisSanctuaryInterior.js';

export const CULT_FOUND_FAITH_COST = 350;
export const CULT_CONSECRATE_FORCE_FAITH_COST = 200;
export const CULT_CONSECRATE_PEACEFUL_FAITH_COST = 450;
export const CULT_BRANCH_SWITCH_COST = 180;
export const CULT_BRANCH_COOLDOWN_DAYS = 7;
export const CULT_BRANCH_COOLDOWN_MINUTES = CULT_BRANCH_COOLDOWN_DAYS * 1440;
export const CULT_TELEPORT_SANCTUARY_FAITH_COST = 75;
export const CULT_BASH_COOLDOWN_MINUTES = 60;
export const CULT_GUARDIAN_RESPAWN_COOLDOWN_MINUTES = 3 * 1440;
export const CULT_BREAKIN_RELATION_PENALTY = -35;
export const CULT_TRESPASS_RELATION_PENALTY = -5;
export const REGIONAL_EDICT_COST = 200;
export const REGIONAL_EDICT_DURATION_DAYS = 30;
export const REGIONAL_EDICT_DURATION_MINUTES = REGIONAL_EDICT_DURATION_DAYS * 1440;
export const EDICT_INFLUENCE_REQUIREMENT = 25;

/** Unified 2D statue billboard flat rendered for non-player deity altars. */
export const DEITY_DEFAULT_ALTAR_FLAT = Object.freeze({ archive: 202, record: 0 });
export const DEITY_DEFAULT_ALTAR_BY_GOD = Object.freeze({
  // 8 Aedra Divines (authentic classic Daggerfall temple statues from TEXTURE.097)
  akatosh: Object.freeze({ archive: 97, record: 3 }),
  arkay: Object.freeze({ archive: 97, record: 0 }),
  dibella: Object.freeze({ archive: 97, record: 12 }),
  julianos: Object.freeze({ archive: 97, record: 7 }),
  kynareth: Object.freeze({ archive: 97, record: 13 }),
  mara: Object.freeze({ archive: 97, record: 11 }),
  stendarr: Object.freeze({ archive: 97, record: 18 }),
  zenithar: Object.freeze({ archive: 97, record: 1 }),
  // 8 Daedric Princes (summon manifestations & shrines from TEXTURE.175 / TEXTURE.202)
  azura: Object.freeze({ archive: 175, record: 0 }),
  boethiah: Object.freeze({ archive: 175, record: 1 }),
  hermaeus_mora: Object.freeze({ archive: 175, record: 12 }),
  mehrunes_dagon: Object.freeze({ archive: 175, record: 6 }),
  mephala: Object.freeze({ archive: 175, record: 7 }),
  molag_bal: Object.freeze({ archive: 202, record: 1 }),
  nocturnal: Object.freeze({ archive: 175, record: 11 }),
  sheogorath: Object.freeze({ archive: 175, record: 14 }),
});

/** Player-selectable Cult Altar Statues (both 2D billboard flats & 3D statue models from Decorator's `statues`). */
export const CULT_ALTAR_STYLES = Object.freeze([
  Object.freeze({ id: 'flat_202_0', kind: 'flat', archive: 202, record: 0, nameKey: 'apotheosis.cult.altarStyle.flat_202_0', fallbackName: 'Horned Gargoyle Pillar (2D)' }),
  Object.freeze({ id: 'flat_202_1', kind: 'flat', archive: 202, record: 1, nameKey: 'apotheosis.cult.altarStyle.flat_202_1', fallbackName: 'Horned Daedra Lord with Scourge (2D)' }),
  Object.freeze({ id: 'flat_202_2', kind: 'flat', archive: 202, record: 2, nameKey: 'apotheosis.cult.altarStyle.flat_202_2', fallbackName: 'Four-Armed Fire Goddess Idol (2D)' }),
  Object.freeze({ id: 'flat_202_3', kind: 'flat', archive: 202, record: 3, nameKey: 'apotheosis.cult.altarStyle.flat_202_3', fallbackName: 'Crouching Gargoyle Monument (2D)' }),
  Object.freeze({ id: 'flat_202_4', kind: 'flat', archive: 202, record: 4, nameKey: 'apotheosis.cult.altarStyle.flat_202_4', fallbackName: 'Horned Daedric Bust (2D)' }),
  Object.freeze({ id: 'flat_202_5', kind: 'flat', archive: 202, record: 5, nameKey: 'apotheosis.cult.altarStyle.flat_202_5', fallbackName: 'Dark Bronze Knight Statue (2D)' }),
  Object.freeze({ id: 'flat_202_6', kind: 'flat', archive: 202, record: 6, nameKey: 'apotheosis.cult.altarStyle.flat_202_6', fallbackName: 'Patina Knight Statue (2D)' }),
  Object.freeze({ id: 'flat_97_0', kind: 'flat', archive: 97, record: 0, nameKey: 'apotheosis.cult.altarStyle.flat_97_0', fallbackName: 'Hooded Prophet Statue (2D)' }),
  Object.freeze({ id: 'flat_97_1', kind: 'flat', archive: 97, record: 1, nameKey: 'apotheosis.cult.altarStyle.flat_97_1', fallbackName: 'Imperial Patrician Statue (2D)' }),
  Object.freeze({ id: 'flat_97_2', kind: 'flat', archive: 97, record: 2, nameKey: 'apotheosis.cult.altarStyle.flat_97_2', fallbackName: 'Bared Rose Maiden of Dibella (2D)' }),
  Object.freeze({ id: 'flat_97_4', kind: 'flat', archive: 97, record: 4, nameKey: 'apotheosis.cult.altarStyle.flat_97_4', fallbackName: 'Crowned Golden Queen of Dibella (2D)' }),
  Object.freeze({ id: 'flat_97_5', kind: 'flat', archive: 97, record: 5, nameKey: 'apotheosis.cult.altarStyle.flat_97_5', fallbackName: 'Flute Muse of Dibella (2D)' }),
  Object.freeze({ id: 'flat_97_10', kind: 'flat', archive: 97, record: 10, nameKey: 'apotheosis.cult.altarStyle.flat_97_10', fallbackName: 'Draped Bronze Maiden of Dibella (2D)' }),
  Object.freeze({ id: 'flat_97_12', kind: 'flat', archive: 97, record: 12, nameKey: 'apotheosis.cult.altarStyle.flat_97_12', fallbackName: 'Reclining Nude Idol of Dibella (2D)' }),
  Object.freeze({ id: 'flat_97_13', kind: 'flat', archive: 97, record: 13, nameKey: 'apotheosis.cult.altarStyle.flat_97_13', fallbackName: 'Unveiled Jade Goddess of Kynareth (2D)' }),
  Object.freeze({ id: 'flat_97_14', kind: 'flat', archive: 97, record: 14, nameKey: 'apotheosis.cult.altarStyle.flat_97_14', fallbackName: 'Exalted Nude Goddess Statue (2D)' }),
  Object.freeze({ id: 'flat_97_16', kind: 'flat', archive: 97, record: 16, nameKey: 'apotheosis.cult.altarStyle.flat_97_16', fallbackName: 'Unveiled Golden Goddess of Dibella (2D)' }),
  Object.freeze({ id: 'flat_175_0', kind: 'flat', archive: 175, record: 0, nameKey: 'apotheosis.cult.altarStyle.flat_175_0', fallbackName: 'Manifestation of Azura (2D)' }),
  Object.freeze({ id: 'flat_175_7', kind: 'flat', archive: 175, record: 7, nameKey: 'apotheosis.cult.altarStyle.flat_175_7', fallbackName: 'Manifestation of Mephala (2D)' }),
  Object.freeze({ id: 'flat_175_11', kind: 'flat', archive: 175, record: 11, nameKey: 'apotheosis.cult.altarStyle.flat_175_11', fallbackName: 'Manifestation of Nocturnal (2D)' }),
  Object.freeze({ id: 'flat_98_0', kind: 'flat', archive: 98, record: 0, nameKey: 'apotheosis.cult.altarStyle.flat_98_0', fallbackName: 'Abyssal Ritual Brazier (2D)' }),
  Object.freeze({ id: 'flat_190_10', kind: 'flat', archive: 190, record: 10, nameKey: 'apotheosis.cult.altarStyle.flat_190_10', fallbackName: 'Ancient Sentinel Statue (2D)' }),
  Object.freeze({ id: 'flat_190_11', kind: 'flat', archive: 190, record: 11, nameKey: 'apotheosis.cult.altarStyle.flat_190_11', fallbackName: 'Gargoyle Ward Statue (2D)' }),
  Object.freeze({ id: 'model_62323', kind: 'model', modelId: 62323, nameKey: 'apotheosis.cult.altarStyle.model_62323', fallbackName: 'Heroic Sovereign Statue (3D)' }),
  Object.freeze({ id: 'model_62324', kind: 'model', modelId: 62324, nameKey: 'apotheosis.cult.altarStyle.model_62324', fallbackName: 'Robed Sage Monument (3D)' }),
  Object.freeze({ id: 'model_62325', kind: 'model', modelId: 62325, nameKey: 'apotheosis.cult.altarStyle.model_62325', fallbackName: 'Armored Crusader Statue (3D)' }),
  Object.freeze({ id: 'model_62326', kind: 'model', modelId: 62326, nameKey: 'apotheosis.cult.altarStyle.model_62326', fallbackName: 'Weeping Angel Pillar (3D)' }),
  Object.freeze({ id: 'model_62327', kind: 'model', modelId: 62327, nameKey: 'apotheosis.cult.altarStyle.model_62327', fallbackName: 'Seated Monarch Statue (3D)' }),
  Object.freeze({ id: 'model_62328', kind: 'model', modelId: 62328, nameKey: 'apotheosis.cult.altarStyle.model_62328', fallbackName: 'Obelisk of Dominion (3D)' }),
  Object.freeze({ id: 'model_62329', kind: 'model', modelId: 62329, nameKey: 'apotheosis.cult.altarStyle.model_62329', fallbackName: 'Dark Stone Guardian Statue (3D)' }),
  Object.freeze({ id: 'model_62330', kind: 'model', modelId: 62330, nameKey: 'apotheosis.cult.altarStyle.model_62330', fallbackName: 'Enthroned Elder Statue (3D)' }),
  Object.freeze({ id: 'model_62317', kind: 'model', modelId: 62317, nameKey: 'apotheosis.cult.altarStyle.model_62317', fallbackName: 'Sacred Marble Arch (3D)' }),
  Object.freeze({ id: 'model_74091', kind: 'model', modelId: 74091, nameKey: 'apotheosis.cult.altarStyle.model_74091', fallbackName: 'Grand Temple Altar Pedestal (3D)' }),
]);

export const AEDRA_IDS = Object.freeze(
  PANTHEON_DEITIES.filter((d) => d.kind === 'aedra').map((d) => d.id),
);
export const DAEDRA_IDS = Object.freeze(
  PANTHEON_DEITIES.filter((d) => d.kind === 'daedra').map((d) => d.id),
);

/** Direct DFU Temple Divine Faction IDs (guildFactions.js DIVINES). */
export const AEDRA_FACTION_TO_GOD = Object.freeze({
  26: 'akatosh',
  21: 'arkay',
  29: 'dibella',
  27: 'julianos',
  35: 'kynareth',
  24: 'mara',
  33: 'stendarr',
  22: 'zenithar',
});

export const CULT_UPGRADE_TIERS = Object.freeze({
  1: Object.freeze({
    tier: 1,
    nameKey: 'apotheosis.cult.tier1',
    fallbackName: 'Initiate Shrine',
    upgradeCost: 0,
    faithPerDay: 12,
    maxFaithBonus: 100,
    infPerDay: 0.4,
    guardCount: 2,
  }),
  2: Object.freeze({
    tier: 2,
    nameKey: 'apotheosis.cult.tier2',
    fallbackName: 'Sacred Precinct',
    upgradeCost: 220,
    faithPerDay: 22,
    maxFaithBonus: 250,
    infPerDay: 0.8,
    guardCount: 3,
  }),
  3: Object.freeze({
    tier: 3,
    nameKey: 'apotheosis.cult.tier3',
    fallbackName: 'Grand Sanctum',
    upgradeCost: 420,
    faithPerDay: 36,
    maxFaithBonus: 500,
    infPerDay: 1.4,
    guardCount: 4,
  }),
});

export const CULT_BRANCHES = Object.freeze({
  missionary: Object.freeze({
    id: 'missionary',
    nameKey: 'apotheosis.cult.branch.missionary',
    fallbackName: 'Missionary Choir',
    descKey: 'apotheosis.cult.branch.missionaryDesc',
    fallbackDesc: '+50% daily regional influence conversion in this city.',
    infMult: 1.5,
    extraGuards: 0,
    bonusFaithPerDay: 0,
    maxFaithBonus: 0,
  }),
  militant: Object.freeze({
    id: 'militant',
    nameKey: 'apotheosis.cult.branch.militant',
    fallbackName: 'Militant Chapter',
    descKey: 'apotheosis.cult.branch.militantDesc',
    fallbackDesc: '+2 hardened Cult Guards & Champions stationed here.',
    infMult: 1.0,
    extraGuards: 2,
    bonusFaithPerDay: 0,
    maxFaithBonus: 0,
  }),
  oracle: Object.freeze({
    id: 'oracle',
    nameKey: 'apotheosis.cult.branch.oracle',
    fallbackName: 'Oracle Reliquary',
    descKey: 'apotheosis.cult.branch.oracleDesc',
    fallbackDesc: '+12 bonus daily Faith offerings and +150 Max Faith capacity from devout pilgrims.',
    infMult: 1.0,
    extraGuards: 0,
    bonusFaithPerDay: 12,
    maxFaithBonus: 150,
  }),
});

export const REGIONAL_EDICTS = Object.freeze({
  prosperity: Object.freeze({
    id: 'prosperity',
    nameKey: 'apotheosis.edict.prosperity.name',
    fallbackName: 'Prosperous Harvest',
    whatKey: 'apotheosis.edict.prosperity.whatHappens',
    fallbackWhat: 'Banishes Famine/Drought/Plague flags in the region, yields +150 gold and +8 Faith/day for 30 days.',
    dailyGold: 150,
    dailyFaith: 8,
    dailyInfluence: 0.25,
    championDamageMult: 1.0,
    aurbisCostMult: 1.0,
    bountyMult: 1.0,
    turnOnFlags: Object.freeze([REGION_FLAGS.PricesLow, REGION_FLAGS.HappyHoliday]),
    turnOffFlags: Object.freeze([
      REGION_FLAGS.FamineBeginning,
      REGION_FLAGS.FamineOngoing,
      REGION_FLAGS.FamineEnding,
      REGION_FLAGS.PlagueBeginning,
      REGION_FLAGS.PlagueOngoing,
      REGION_FLAGS.PlagueEnding,
      REGION_FLAGS.BadHarvest,
      REGION_FLAGS.PricesHigh,
    ]),
  }),
  crusade: Object.freeze({
    id: 'crusade',
    nameKey: 'apotheosis.edict.crusade.name',
    fallbackName: 'Sanctified Crusade',
    whatKey: 'apotheosis.edict.crusade.whatHappens',
    fallbackWhat: 'Summoned Divine Champions deal +25% damage inside this region and Cult influence grows +0.6%/day for 30 days.',
    dailyGold: 0,
    dailyFaith: 4,
    dailyInfluence: 0.6,
    championDamageMult: 1.25,
    aurbisCostMult: 1.0,
    bountyMult: 1.0,
    turnOnFlags: Object.freeze([REGION_FLAGS.HolyHoliday]),
    turnOffFlags: Object.freeze([REGION_FLAGS.PersecutedTemple]),
  }),
  arcane: Object.freeze({
    id: 'arcane',
    nameKey: 'apotheosis.edict.arcane.name',
    fallbackName: 'Arcane Convergence',
    whatKey: 'apotheosis.edict.arcane.whatHappens',
    fallbackWhat: '-20% Scroll of Aurbis Faith cost inside this region, clears Magic Bans, and silently unlocks Underground Hatches.',
    dailyGold: 0,
    dailyFaith: 6,
    dailyInfluence: 0.3,
    championDamageMult: 1.0,
    aurbisCostMult: 0.8,
    bountyMult: 1.0,
    turnOnFlags: Object.freeze([]),
    turnOffFlags: Object.freeze([REGION_FLAGS.WitchBurnings, REGION_FLAGS.MadWizardNearby]),
  }),
  shadow: Object.freeze({
    id: 'shadow',
    nameKey: 'apotheosis.edict.shadow.name',
    fallbackName: 'Shadow Tithe',
    whatKey: 'apotheosis.edict.shadow.whatHappens',
    fallbackWhat: 'Reduces regional criminal court fines by 50% here and extracts +220 gold and +18 Faith/day for 30 days.',
    dailyGold: 220,
    dailyFaith: 18,
    dailyInfluence: 0.2,
    championDamageMult: 1.0,
    aurbisCostMult: 1.0,
    bountyMult: 0.5,
    turnOnFlags: Object.freeze([REGION_FLAGS.CrimeWave]),
    turnOffFlags: Object.freeze([]),
  }),
});

export const REGIONAL_EDICT_IDS = Object.freeze(Object.keys(REGIONAL_EDICTS));

function hash32(str) {
  let h = 2166136261 >>> 0;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function clampReg(regionIndex) {
  const n = Math.trunc(Number(regionIndex));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(TAMRIEL_REGION_COUNT - 1, n));
}

function dayFromMinutes(min) {
  return Math.floor(Math.max(0, Number(min) || 0) / 1440);
}

/** Deterministic non-colliding synthetic negative buildingKey for underground hatches. */
export function sanctuaryBuildingKeyFor(mapId, isPlayerFounded = false) {
  const cleanMap = Math.abs(Math.trunc(Number(mapId) || 0)) % 500000;
  return isPlayerFounded ? -(800000 + cleanMap) : -(200000 + cleanMap);
}

export function templeSiteKey(mapId, buildingKey) {
  return `temple:${Number(mapId) >>> 0}:${Math.trunc(Number(buildingKey) || 0)}`;
}

export function daedraHatchSiteKey(mapId) {
  return `daedra_hatch:${Number(mapId) >>> 0}`;
}

export function playerHatchSiteKey(mapId) {
  return `player_hatch:${Number(mapId) >>> 0}`;
}

/** Resolves an Aedra Pantheon deity ID from a Temple building's factionId or key. */
export function resolveTemplePatronGodId(factionId = 0, buildingKey = 0, mapId = 0, factionDict = null) {
  const fid = Number(factionId) || 0;
  if (AEDRA_FACTION_TO_GOD[fid]) return AEDRA_FACTION_TO_GOD[fid];
  if (factionDict) {
    const divineName = getDivine(factionDict, fid);
    if (divineName) {
      const id = divineName.toLowerCase();
      if (AEDRA_IDS.includes(id)) return id;
    }
  }
  const h = hash32(`${fid}:${mapId}:${buildingKey}`);
  return AEDRA_IDS[h % AEDRA_IDS.length];
}

/** Resolves a deterministic Daedric Prince for a city's underground sanctuary hatch. */
export function pickDaedricPatronForCity(mapId = 0, regionIndex = 0) {
  const h = hash32(`daedra:${Number(mapId) >>> 0}:${clampReg(regionIndex)}`);
  return DAEDRA_IDS[h % DAEDRA_IDS.length];
}

/** Recomputes `entity.apotheosis.cultFaithBonus` from all owned Temples and Underground Sanctuaries. */
export function recomputeCultFaithBonus(entity) {
  if (!entity?.apotheosis || typeof entity.apotheosis !== 'object') return 0;
  const sites = entity.apotheosis.cult?.sites;
  let total = 0;
  if (sites && typeof sites === 'object') {
    for (const s of Object.values(sites)) {
      if (!s || s.ownerId !== 'player') continue;
      const tierSpec = CULT_UPGRADE_TIERS[Math.max(1, Math.min(3, Math.trunc(Number(s.tier) || 1)))] ?? CULT_UPGRADE_TIERS[1];
      const branchSpec = s.branch ? CULT_BRANCHES[s.branch] : null;
      total += (tierSpec.maxFaithBonus ?? 0) + (branchSpec?.maxFaithBonus ?? 0);
    }
  }
  entity.apotheosis.cultFaithBonus = total;
  return total;
}

/** Ensures `entity.apotheosis.cult` structure exists and returns it. */
export function ensureCultState(entity) {
  if (!entity || typeof entity !== 'object') return null;
  if (!entity.apotheosis || typeof entity.apotheosis !== 'object') {
    entity.apotheosis = {};
  }
  const existing = entity.apotheosis.cult;
  if (!existing || typeof existing !== 'object') {
    entity.apotheosis.cult = {
      sites: {},
      edicts: {},
      sanctuaryKeys: {},
      altarStyle: CULT_ALTAR_STYLES[0].id,
    };
  } else {
    if (!existing.sites || typeof existing.sites !== 'object') existing.sites = {};
    if (!existing.edicts || typeof existing.edicts !== 'object') existing.edicts = {};
    if (!existing.sanctuaryKeys || typeof existing.sanctuaryKeys !== 'object') existing.sanctuaryKeys = {};
    if (!existing.altarStyle) existing.altarStyle = CULT_ALTAR_STYLES[0].id;
  }
  const hasOwned = Object.values(entity.apotheosis.cult.sites).some((s) => s?.ownerId === 'player');
  if (hasOwned) {
    recomputeCultFaithBonus(entity);
  } else if (entity.apotheosis.cultFaithBonus == null) {
    entity.apotheosis.cultFaithBonus = 0;
  }
  return entity.apotheosis.cult;
}

/** Returns the player's currently chosen Cult Altar Statue descriptor (`CULT_ALTAR_STYLES`). */
export function getCultAltarStyle(entity) {
  const id = entity?.apotheosis?.cult?.altarStyle ?? CULT_ALTAR_STYLES[0].id;
  return CULT_ALTAR_STYLES.find((s) => s.id === id) ?? CULT_ALTAR_STYLES[0];
}

/** Sets the player's Cult Altar Statue appearance (`CULT_ALTAR_STYLES` entry ID). */
export function setCultAltarStyle(entity, styleId) {
  const cult = ensureCultState(entity);
  if (!cult) return { ok: false, reason: t('apotheosis.cult.err.unknownAltarStyle', 'Unknown altar statue style.') };
  const picked = CULT_ALTAR_STYLES.find((s) => s.id === String(styleId ?? ''));
  if (!picked) {
    return { ok: false, reason: t('apotheosis.cult.err.unknownAltarStyle', 'Unknown altar statue style.') };
  }
  cult.altarStyle = picked.id;
  return { ok: true, style: picked };
}

/** Marks a town Sanctuary hatch/site as discovered (so its nameplate appears on the town map). */
export function discoverCultSite(entity, siteKey) {
  const site = getCultSite(entity, siteKey);
  if (!site) return false;
  if (!site.discovered) site.discovered = true;
  return true;
}

/** Safely registers an acquired Temple or Underground Sanctuary into offline housing persistence. */
export function registerCultSiteAsOfflineHome(site) {
  if (!site || !Number.isFinite(Number(site.mapId))) return false;
  try {
    return !!inheritOfflineHome({
      mapId: Number(site.mapId) >>> 0,
      buildingKey: Math.trunc(Number(site.buildingKey) || 0),
      region: clampReg(site.regionIndex),
      price: 0,
    });
  } catch {
    return false;
  }
}

/** Ensures deterministic Cult sites (Temples + 1 Daedric Hatch) exist for a city/town. */
export function ensureCityCultSites(entity, {
  mapId = 0,
  regionIndex = 0,
  locationName = '',
  temples = [],
  buildingCount = null,
  factionDict = null,
} = {}) {
  const cult = ensureCultState(entity);
  if (!cult) return [];
  const mid = Number(mapId) >>> 0;
  const reg = clampReg(regionIndex);
  const regName = getLocalizedRegionName(reg, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const locLabel = locationName || regName;

  if (Array.isArray(temples)) {
    for (const tpl of temples) {
      const bk = Math.trunc(Number(tpl?.buildingKey ?? tpl?.key ?? 0));
      const sk = templeSiteKey(mid, bk);
      if (!cult.sites[sk]) {
        const defaultPatronId = resolveTemplePatronGodId(tpl?.factionId ?? 0, bk, mid, factionDict);
        const god = getPantheonDeity(defaultPatronId);
        cult.sites[sk] = {
          siteKey: sk,
          kind: 'temple',
          mapId: mid,
          buildingKey: bk,
          regionIndex: reg,
          locationName: locLabel,
          name: tpl?.name || `${locLabel} — ${god?.name ?? defaultPatronId}`,
          defaultPatronId,
          ownerId: defaultPatronId,
          formerOwnerId: null,
          isPlayerFounded: false,
          discovered: true,
          peacefulTransfer: false,
          unlocked: true,
          unlockMethod: null,
          alarmTriggered: false,
          guardiansCleared: false,
          tier: 1,
          branch: null,
          hatchModelId: null,
          interiorPool: null,
          consecratedAtMinutes: null,
        };
      } else if (locationName && locationName !== regName) {
        const cur = cult.sites[sk];
        if (!cur.locationName || cur.locationName === regName) {
          cur.locationName = locationName;
          const patron = getPantheonDeity(cur.defaultPatronId ?? cur.ownerId);
          cur.name = tpl?.name || `${locationName} — ${patron?.name ?? cur.defaultPatronId}`;
        }
      }
    }
  }

  // Every city or settlement with a Temple or >=16 buildings hosts 1 hidden Daedric Underground Sanctuary hatch;
  // tiny hamlets without a Temple spawn one at a deterministic 25% rate to keep Aedra vs Daedra sites balanced.
  const isSmallHamlet = buildingCount != null
    && (!Array.isArray(temples) || temples.length === 0)
    && Number(buildingCount) < 16;
  const allowDaedraHatch = mid > 0 && (!isSmallHamlet || ((Math.imul(mid, 2654435761) >>> 0) % 4 === 0));
  if (allowDaedraHatch) {
    const dk = daedraHatchSiteKey(mid);
    if (!cult.sites[dk]) {
      const princeId = pickDaedricPatronForCity(mid, reg);
      const prince = getPantheonDeity(princeId);
      const arch = pickSanctuaryArchitecture(dk);
      cult.sites[dk] = {
        siteKey: dk,
        kind: 'sanctuary',
        mapId: mid,
        buildingKey: sanctuaryBuildingKeyFor(mid, false),
        regionIndex: reg,
        locationName: locLabel,
        name: `${locLabel}: ${prince?.name ?? princeId}`,
        defaultPatronId: princeId,
        ownerId: princeId,
        formerOwnerId: null,
        isPlayerFounded: false,
        discovered: false,
        peacefulTransfer: false,
        unlocked: false,
        unlockMethod: null,
        alarmTriggered: false,
        guardiansCleared: false,
        tier: 1,
        branch: null,
        hatchModelId: arch.hatchModelId ?? SANCTUARY_HATCH_MODELS[0],
        interiorPool: arch.poolId ?? SANCTUARY_INTERIOR_POOLS[0],
        consecratedAtMinutes: null,
      };
    } else if (locationName && locationName !== regName) {
      const cur = cult.sites[dk];
      if (!cur.locationName || cur.locationName === regName) {
        cur.locationName = locationName;
        const prince = getPantheonDeity(cur.defaultPatronId ?? cur.ownerId);
        cur.name = `${locationName}: ${prince?.name ?? cur.defaultPatronId}`;
      }
    }
  }

  return getCityCultSites(entity, mid);
}

/** Returns all registered Cult sites for a city (`mapId`). */
export function getCityCultSites(entity, mapId) {
  const cult = ensureCultState(entity);
  if (!cult) return [];
  const mid = Number(mapId) >>> 0;
  return Object.values(cult.sites).filter((s) => (Number(s?.mapId) >>> 0) === mid);
}

/** Returns all Cult sites across Tamriel, optionally filtered by `regionIndex` or `ownerOnly`. */
export function getAllCultSites(entity, { regionIndex = null, ownedOnly = false } = {}) {
  const cult = ensureCultState(entity);
  if (!cult) return [];
  return Object.values(cult.sites).filter((s) => {
    if (!s) return false;
    if (regionIndex != null && clampReg(s.regionIndex) !== clampReg(regionIndex)) return false;
    if (ownedOnly && s.ownerId !== 'player') return false;
    return true;
  });
}

/** Returns a single Cult site record by siteKey. */
export function getCultSite(entity, siteKey) {
  const cult = ensureCultState(entity);
  if (!cult || !siteKey) return null;
  return cult.sites[String(siteKey)] ?? null;
}

/** Looks up a Cult site matching `(mapId, buildingKey)`. */
export function getCultSiteByBuilding(entity, mapId, buildingKey) {
  const cult = ensureCultState(entity);
  if (!cult) return null;
  const mid = Number(mapId) >>> 0;
  const bk = Math.trunc(Number(buildingKey) || 0);
  return Object.values(cult.sites).find(
    (s) => s && (Number(s.mapId) >>> 0) === mid && Math.trunc(Number(s.buildingKey) || 0) === bk,
  ) ?? null;
}

/** Returns true if the player owns the Cult site `(mapId, buildingKey)`. */
export function isPlayerCultSiteOwned(entity, mapId, buildingKey) {
  const site = getCultSiteByBuilding(entity, mapId, buildingKey);
  return site?.ownerId === 'player';
}

/** Returns true specifically if the player owns an Aedra Temple `(mapId, buildingKey)`. */
export function isPlayerCultTempleOwned(entity, mapId, buildingKey) {
  const site = getCultSiteByBuilding(entity, mapId, buildingKey);
  return site?.kind === 'temple' && site?.ownerId === 'player';
}

/** Returns whether player holds the Sanctuary Seal Key for `siteKey`. */
export function hasSanctuaryKey(entity, siteKey) {
  const cult = ensureCultState(entity);
  return !!cult?.sanctuaryKeys?.[String(siteKey ?? '')];
}

function applySanctuaryBreakInConsequences(entity, site, nowMinutes = 0) {
  if (!entity || !site || site.ownerId === 'player') {
    return { warDeclared: false, relationDelta: 0, deityName: '' };
  }
  const god = getPantheonDeity(site.ownerId);
  const deityName = god?.name ?? site.ownerId;
  if (site.breakInPenalized) {
    const p = ensurePantheonState(entity, { nowMinutes });
    const entry = p?.deities?.[site.ownerId];
    if (entry && entry.status !== 'war') {
      entry.pact = false;
      entry.allied = false;
      entry.manualWar = true;
      entry.status = 'war';
    }
    return { warDeclared: true, relationDelta: 0, deityName };
  }
  site.breakInPenalized = true;
  const p = ensurePantheonState(entity, { nowMinutes });
  const entry = p?.deities?.[site.ownerId];
  let relationDelta = 0;
  if (entry) {
    entry.pact = false;
    entry.allied = false;
    entry.truceUntilMinutes = null;
    entry.graceUntilMinutes = null;
    entry.manualWar = true;
    const rel = changeDeityRelation(entity, site.ownerId, CULT_BREAKIN_RELATION_PENALTY, {
      nowMinutes,
      category: 'against_me',
    });
    relationDelta = rel?.deltaApplied ?? CULT_BREAKIN_RELATION_PENALTY;
    entry.status = 'war';
  }
  appendPantheonChronicle(entity, {
    day: dayFromMinutes(nowMinutes),
    minutes: nowMinutes,
    category: 'against_me',
    godId: site.ownerId,
    regionIndex: site.regionIndex,
    text: t('apotheosis.cult.chronicle.breakInWar', 'Forced intrusion into {site} provoked Holy War with {god} ({delta} Relation)!', {
      site: site.name,
      god: deityName,
      delta: relationDelta || CULT_BREAKIN_RELATION_PENALTY,
    }),
  });
  return { warDeclared: true, relationDelta: relationDelta || CULT_BREAKIN_RELATION_PENALTY, deityName };
}

/**
 * Applies a small once-per-day trespass relation penalty (`-5`) when entering an enemy
 * (`hostile` or `war`) deity's unowned Temple or Sanctuary without consecrating it.
 */
export function applySanctumTrespassPenalty(entity, site, nowMinutes = 0) {
  if (!entity || !site || site.ownerId === 'player') return { penalized: false };
  const p = ensurePantheonState(entity, { nowMinutes });
  const entry = p?.deities?.[site.ownerId];
  if (!entry || (entry.status !== 'war' && entry.status !== 'hostile')) {
    return { penalized: false };
  }
  const day = dayFromMinutes(nowMinutes);
  if (site.lastTrespassDay === day) return { penalized: false };
  site.lastTrespassDay = day;
  const god = getPantheonDeity(site.ownerId);
  const rel = changeDeityRelation(entity, site.ownerId, CULT_TRESPASS_RELATION_PENALTY, {
    nowMinutes,
    propagate: false,
    category: 'against_me',
  });
  return {
    penalized: true,
    relationDelta: rel?.deltaApplied ?? CULT_TRESPASS_RELATION_PENALTY,
    deityName: god?.name ?? site.ownerId,
  };
}

/**
 * Grants a Sanctuary Seal Key from the outdoor Cult Gatekeeper via Pickpocket or Loot.
 * Looting (slaying) or detected Pickpocket sets `site.alarmTriggered = true` and provokes Holy War.
 */
export function obtainSanctuaryKeyFromGatekeeper(entity, siteKey, mode = 'pickpocket', { rng = Math.random, skillOverride = null, nowMinutes = 0, force = false } = {}) {
  const cult = ensureCultState(entity);
  const site = getCultSite(entity, siteKey);
  if (!cult || !site) return { ok: false, detected: false, reason: t('apotheosis.cult.err.unknownSite', 'Sanctuary site not found.') };

  if (mode === 'loot') {
    cult.sanctuaryKeys[site.siteKey] = true;
    site.alarmTriggered = true;
    const breakIn = force ? { warDeclared: false, deityName: '' } : applySanctuaryBreakInConsequences(entity, site, nowMinutes);
    return {
      ok: true,
      hasKey: true,
      detected: true,
      alarm: true,
      warDeclared: breakIn.warDeclared,
      message: t('apotheosis.cult.keyLooted', 'Took the Sanctuary Seal Key from the fallen Gatekeeper (Alarm triggered & Holy War!).'),
    };
  }

  const pickSkill = skillOverride != null ? Number(skillOverride) : (skillValue(entity, SKILLS.Pickpocket) ?? 30);
  const chance = Math.max(0.2, Math.min(0.95, 0.35 + (pickSkill - 25) * 0.01));
  const success = force || rng() < chance;
  if (success) {
    cult.sanctuaryKeys[site.siteKey] = true;
    return {
      ok: true,
      hasKey: true,
      detected: false,
      alarm: !!site.alarmTriggered,
      message: t('apotheosis.cult.keyStolen', 'Quietly lifted the Sanctuary Seal Key from the Gatekeeper.'),
    };
  }

  site.alarmTriggered = true;
  const breakIn = force ? { warDeclared: false, deityName: '' } : applySanctuaryBreakInConsequences(entity, site, nowMinutes);
  return {
    ok: false,
    hasKey: false,
    detected: true,
    alarm: true,
    warDeclared: breakIn.warDeclared,
    reason: t('apotheosis.cult.keyPickFail', 'The Gatekeeper caught your hand! The Sanctuary Alarm has sounded and {god} declares Holy War!', {
      god: breakIn.deityName || site.ownerId,
    }),
  };
}

/**
 * Attempts to unlock a Daedric Underground Sanctuary Hatch via one of 4 player methods:
 *  - `'lockpick'`: Lockpicking check; breaking in without Pact/Alliance provokes Holy War (-35), failure rings street Alarm.
 *  - `'bash'`: Strength check + 60m cooldown; rings street Alarm and provokes Holy War (-35) whether it succeeds or fails.
 *  - `'magic'`: Open spell active, Magic Portfolio, or active `arcane` Edict -> quiet unlock (provokes Holy War if no Pact/Alliance).
 *  - `'key'`: Gatekeeper Seal Key OR Pact/Alliance with owner Daedra Prince -> clean unlock with no war/alarm.
 */
export function attemptUnlockSanctuaryHatch(entity, siteKey, method = 'lockpick', opts = {}) {
  const site = getCultSite(entity, siteKey);
  if (!site) return { ok: false, unlocked: false, alarm: false, reason: t('apotheosis.cult.err.unknownSite', 'Sanctuary site not found.') };

  if (site.unlocked || site.ownerId === 'player') {
    site.unlocked = true;
    site.discovered = true;
    return { ok: true, unlocked: true, alarm: !!site.alarmTriggered, method: site.unlockMethod ?? method };
  }

  const m = String(method ?? 'lockpick').toLowerCase();
  const force = !!opts.force;
  const nowMin = Math.max(0, Math.trunc(Number(opts.nowMinutes) || 0));
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const p = ensurePantheonState(entity, { nowMinutes: nowMin });
  const entry = p?.deities?.[site.ownerId];
  const cordial = entry?.status === 'pact' || entry?.status === 'allied';

  if (m === 'bash') {
    const cdUntil = Number(site.bashCooldownUntilMinutes ?? 0);
    if (!force && Number.isFinite(cdUntil) && nowMin < cdUntil) {
      const remMin = Math.max(1, Math.ceil(cdUntil - nowMin));
      return {
        ok: false,
        unlocked: false,
        alarm: false,
        onCooldown: true,
        remainingMinutes: remMin,
        method: 'bash',
        reason: t('apotheosis.cult.err.bashCooldown', 'You must recover before bashing this hatch again ({min}m remaining).', {
          min: remMin,
        }),
      };
    }
    const str = opts.strength != null ? Number(opts.strength) : (liveStat(entity, 'strength') ?? 50);
    const chance = Math.max(0.15, Math.min(0.90, 0.20 + (str - 40) * 0.012));
    const succeeded = force || rng() < chance;
    site.bashCooldownUntilMinutes = force ? 0 : nowMin + CULT_BASH_COOLDOWN_MINUTES;
    site.alarmTriggered = true;
    site.discovered = true;
    const breakIn = force || cordial
      ? { warDeclared: false, deityName: getPantheonDeity(site.ownerId)?.name ?? site.ownerId }
      : applySanctuaryBreakInConsequences(entity, site, nowMin);

    if (!succeeded) {
      return {
        ok: false,
        unlocked: false,
        alarm: true,
        warDeclared: breakIn.warDeclared,
        method: 'bash',
        reason: t('apotheosis.cult.err.bashFailed', 'Your blow rings off the iron bolts (STR {str})! Cult Guardians rush the street!', {
          str,
        }),
      };
    }

    site.unlocked = true;
    site.unlockMethod = 'bash';
    return {
      ok: true,
      unlocked: true,
      alarm: true,
      warDeclared: breakIn.warDeclared,
      method: 'bash',
      message: t('apotheosis.cult.unlockBash', 'You smash the hatch bolts apart! Cult Guardians rush the street and {god} vows vengeance!', {
        god: breakIn.deityName || site.ownerId,
      }),
    };
  }

  if (m === 'magic') {
    const hasOpen = !!opts.hasOpenSpell;
    const isMagicGod = isAscendedGod(entity) && entity?.apotheosis?.portfolio === 'magic';
    const hasArcaneEdict = getActiveRegionalEdict(entity, site.regionIndex)?.edictId === 'arcane';
    if (!force && !hasOpen && !isMagicGod && !hasArcaneEdict) {
      return {
        ok: false,
        unlocked: false,
        alarm: false,
        method: 'magic',
        reason: t('apotheosis.cult.err.needMagicUnlock', 'Requires an active Open spell, Magic Portfolio, or Arcane Convergence edict in this region.'),
      };
    }
    if (typeof opts.onConsumeOpenSpell === 'function' && hasOpen) {
      opts.onConsumeOpenSpell();
    }
    site.unlocked = true;
    site.unlockMethod = 'magic';
    site.discovered = true;
    const breakIn = force || cordial ? { warDeclared: false } : applySanctuaryBreakInConsequences(entity, site, nowMin);
    return {
      ok: true,
      unlocked: true,
      alarm: false,
      warDeclared: breakIn.warDeclared,
      method: 'magic',
      message: breakIn.warDeclared
        ? t('apotheosis.cult.unlockMagicWar', 'Arcane resonance parts the hatch seals — the patron senses your intrusion and declares Holy War!')
        : t('apotheosis.cult.unlockMagic', 'Arcane resonance silently parts the warded hatch seals.'),
    };
  }

  if (m === 'key') {
    if (!force && !hasSanctuaryKey(entity, site.siteKey) && !cordial) {
      return {
        ok: false,
        unlocked: false,
        alarm: false,
        method: 'key',
        reason: t('apotheosis.cult.err.needKeyUnlock', 'You lack the Gatekeeper\'s Sanctuary Seal Key and hold no Pact/Alliance with the patron.'),
      };
    }
    site.unlocked = true;
    site.unlockMethod = 'key';
    site.discovered = true;
    return {
      ok: true,
      unlocked: true,
      alarm: false,
      method: 'key',
      message: t('apotheosis.cult.unlockKey', 'The Sanctuary Seal turns silently in the lock.'),
    };
  }

  // Default: 'lockpick'
  const skill = opts.lockpickSkill != null ? Number(opts.lockpickSkill) : (skillValue(entity, SKILLS.Lockpicking) ?? 25);
  const luckBonus = Math.floor((liveStat(entity, 'luck') ?? 50) / 10);
  const dc = opts.dc != null ? Number(opts.dc) : (35 + (hash32(site.siteKey) % 4) * 10);
  const roll = force || (skill + luckBonus) >= dc || (rng() * 100) < Math.max(15, 50 + (skill - dc));
  site.discovered = true;
  const breakIn = force || cordial ? { warDeclared: false, deityName: '' } : applySanctuaryBreakInConsequences(entity, site, nowMin);
  if (roll) {
    site.unlocked = true;
    site.unlockMethod = 'lockpick';
    return {
      ok: true,
      unlocked: true,
      alarm: !!site.alarmTriggered,
      warDeclared: breakIn.warDeclared,
      method: 'lockpick',
      message: breakIn.warDeclared
        ? t('apotheosis.cult.unlockPickOkWar', 'You pick the hatch lock quietly, but the patron marks the intrusion as Holy War!')
        : t('apotheosis.cult.unlockPickOk', 'You pick the warded hatch lock without disturbing the guards.'),
    };
  }

  site.alarmTriggered = true;
  return {
    ok: false,
    unlocked: false,
    alarm: true,
    warDeclared: breakIn.warDeclared,
    method: 'lockpick',
    reason: t('apotheosis.cult.unlockPickFail', 'The pick snaps inside the ward! Cult Guardians rush the street!'),
  };
}

/** Marks interior Guardians as defeated so the altar may be forcibly consecrated. */
export function clearSiteGuardians(entity, siteKey) {
  const site = getCultSite(entity, siteKey);
  if (!site) return { ok: false, reason: t('apotheosis.cult.err.unknownSite', 'Sanctuary site not found.') };
  site.guardiansCleared = true;
  return { ok: true, site };
}

/** Returns how many Guardians spawn inside (`2` normal, `4` when alarm triggered). */
export function getSanctuaryGuardianCount(site) {
  if (!site || site.ownerId === 'player' || site.guardiansCleared) return 0;
  return site.alarmTriggered ? 4 : 2;
}

/**
 * Consecrates an Aedra Temple or Underground Daedric Sanctuary to the Player's Cult by Force.
 * Requires Hostile/War with current owner AND interior Guardians cleared (unless `force: true`).
 */
export function consecrateSiteByForce(entity, siteKey, { nowMinutes = 0, force = false, alreadyPaid = false } = {}) {
  if (!entity || (!force && !isAscendedGod(entity))) {
    return { ok: false, reason: t('apotheosis.cult.err.notAscended', 'Ascend to Godhood first.') };
  }
  const p = ensurePantheonState(entity, { nowMinutes });
  const site = getCultSite(entity, siteKey);
  if (!site) return { ok: false, reason: t('apotheosis.cult.err.unknownSite', 'Sanctuary site not found.') };
  if (site.ownerId === 'player') {
    return { ok: false, reason: t('apotheosis.cult.err.alreadyOwned', 'This sanctum already belongs to your Cult.') };
  }

  const oldOwnerId = site.ownerId;
  const oldGod = getPantheonDeity(oldOwnerId);
  const oldEntry = p?.deities?.[oldOwnerId];

  if (!force) {
    if (oldEntry?.status !== 'war' && oldEntry?.status !== 'hostile') {
      return {
        ok: false,
        reason: t('apotheosis.cult.err.needHostileOrWar', 'Force consecration requires Hostile or War standing with {god} (or Allied at 100 for Peaceful Dedication).', {
          god: oldGod?.name ?? oldOwnerId,
        }),
      };
    }
    if (!site.guardiansCleared) {
      return {
        ok: false,
        reason: t('apotheosis.cult.err.clearGuardiansFirst', 'Enter inside and activate the Altar to declare Holy War and defeat the defending Cult Guardians.'),
      };
    }
  }

  const paidAlready = !!alreadyPaid || !!site.consecrationPaid;
  const cost = force || paidAlready ? 0 : CULT_CONSECRATE_FORCE_FAITH_COST;
  if (cost > 0) {
    const spend = spendApotheosisFaith(entity, cost, { reason: `consecrate_force:${site.siteKey}` });
    if (!spend.ok) return { ok: false, reason: spend.reason };
  }

  const hadBreakInPenalty = !!site.breakInPenalized;
  site.formerOwnerId = oldOwnerId;
  site.ownerId = 'player';
  site.unlocked = true;
  site.discovered = true;
  site.guardiansCleared = true;
  site.consecrationPaid = false;
  site.consecrationPending = false;
  site.peacefulTransfer = false;
  site.tier = Math.max(1, site.tier || 1);
  site.consecratedAtMinutes = nowMinutes;

  shiftRegionInfluence(entity, site.regionIndex, oldOwnerId, -10);
  shiftRegionInfluence(entity, site.regionIndex, 'player', 10);
  if (oldGod && !hadBreakInPenalty) {
    changeDeityRelation(entity, oldOwnerId, -35, { nowMinutes, category: 'my_cult' });
  }
  registerCultSiteAsOfflineHome(site);
  recomputeCultFaithBonus(entity);

  const regName = getLocalizedRegionName(site.regionIndex, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  appendPantheonChronicle(entity, {
    day: dayFromMinutes(nowMinutes),
    minutes: nowMinutes,
    category: 'my_cult',
    godId: oldOwnerId,
    regionIndex: site.regionIndex,
    text: t('apotheosis.cult.chronicle.forceConsecrate', 'Forcibly consecrated {site} ({region}) from {god} (+10% Influence, -35 rel).', {
      site: site.name,
      region: regName,
      god: oldGod?.name ?? oldOwnerId,
    }),
  });

  return { ok: true, mode: 'force', faithSpent: cost, site };
}

/**
 * Initiates a conscious Force Consecration assault from an interior Altar:
 * spends 200 Faith once, provokes Holy War (-35 Relation) with the patron deity,
 * and marks `site.consecrationPending = true` so the Temple/Sanctuary claims automatically
 * as soon as all defending Cult Guardians are slain (or immediately if `guardiansCleared`).
 */
export function initiateForceConsecrationAssault(entity, siteKey, { nowMinutes = 0 } = {}) {
  if (!entity || !isAscendedGod(entity)) {
    return { ok: false, reason: t('apotheosis.cult.err.notAscended', 'Ascend to Godhood first.') };
  }
  const p = ensurePantheonState(entity, { nowMinutes });
  const site = getCultSite(entity, siteKey);
  if (!site) return { ok: false, reason: t('apotheosis.cult.err.unknownSite', 'Sanctuary site not found.') };
  if (site.ownerId === 'player') {
    return { ok: false, reason: t('apotheosis.cult.err.alreadyOwned', 'This sanctum already belongs to your Cult.') };
  }

  let faithSpent = 0;
  if (!site.consecrationPaid) {
    const spend = spendApotheosisFaith(entity, CULT_CONSECRATE_FORCE_FAITH_COST, { reason: `consecrate_force:${site.siteKey}` });
    if (!spend.ok) return { ok: false, reason: spend.reason };
    site.consecrationPaid = true;
    faithSpent = CULT_CONSECRATE_FORCE_FAITH_COST;
  }

  const oldOwnerId = site.ownerId;
  const entry = p?.deities?.[oldOwnerId];
  const breakIn = entry?.status === 'war' && site.breakInPenalized
    ? { warDeclared: false, relationDelta: 0, deityName: getPantheonDeity(oldOwnerId)?.name ?? oldOwnerId }
    : applySanctuaryBreakInConsequences(entity, site, nowMinutes);

  if (site.guardiansCleared) {
    const res = consecrateSiteByForce(entity, site.siteKey, { nowMinutes, alreadyPaid: true });
    if (!res.ok) return res;
    return {
      ...res,
      faithSpent,
      warDeclared: !!breakIn.warDeclared,
      completedImmediately: true,
      assaultStarted: false,
    };
  }

  site.consecrationPending = true;
  site.lastGuardianSpawnMinutes = null;
  return {
    ok: true,
    faithSpent,
    warDeclared: !!breakIn.warDeclared,
    completedImmediately: false,
    assaultStarted: true,
    oldOwner: oldOwnerId,
    deityName: breakIn.deityName || oldOwnerId,
    site,
  };
}

/**
 * Peacefully dedicates an Aedra Temple or Daedric Sanctuary to the Player's Cult.
 * Strictly requires `Allied` status AT `100` relation with the patron deity (`450 Faith`).
 */
export function dedicateSitePeacefully(entity, siteKey, { nowMinutes = 0, force = false } = {}) {
  if (!entity || (!force && !isAscendedGod(entity))) {
    return { ok: false, reason: t('apotheosis.cult.err.notAscended', 'Ascend to Godhood first.') };
  }
  const p = ensurePantheonState(entity, { nowMinutes });
  const site = getCultSite(entity, siteKey);
  if (!site) return { ok: false, reason: t('apotheosis.cult.err.unknownSite', 'Sanctuary site not found.') };
  if (site.ownerId === 'player') {
    return { ok: false, reason: t('apotheosis.cult.err.alreadyOwned', 'This sanctum already belongs to your Cult.') };
  }

  const oldOwnerId = site.ownerId;
  const oldGod = getPantheonDeity(oldOwnerId);
  const oldEntry = p?.deities?.[oldOwnerId];

  if (!force) {
    if (oldEntry?.status !== 'allied' || Number(oldEntry?.relation ?? 0) !== 100) {
      return {
        ok: false,
        reason: t('apotheosis.cult.err.needMaxAlly', 'Peaceful dedication requires Allied status at exactly 100 relation with {god}.', {
          god: oldGod?.name ?? oldOwnerId,
        }),
      };
    }
  }

  const cost = force ? 0 : CULT_CONSECRATE_PEACEFUL_FAITH_COST;
  if (cost > 0) {
    const spend = spendApotheosisFaith(entity, cost, { reason: `consecrate_peaceful:${site.siteKey}` });
    if (!spend.ok) return { ok: false, reason: spend.reason };
  }

  site.formerOwnerId = oldOwnerId;
  site.ownerId = 'player';
  site.unlocked = true;
  site.discovered = true;
  site.guardiansCleared = true;
  site.peacefulTransfer = true;
  site.tier = Math.max(1, site.tier || 1);
  site.consecratedAtMinutes = nowMinutes;

  shiftRegionInfluence(entity, site.regionIndex, oldOwnerId, -8);
  shiftRegionInfluence(entity, site.regionIndex, 'player', 8);
  if (oldGod) {
    if (oldEntry && oldEntry.graceUntilMinutes != null && nowMinutes < oldEntry.graceUntilMinutes) {
      oldEntry.personalHistory = Math.max(-140, (oldEntry.personalHistory || 0) - 10);
      const portfolio = entity.apotheosis?.portfolio || 'war';
      oldEntry.relation = Math.max(-100, Math.min(100, oldEntry.personalHistory + (oldGod.portfolioAffinity?.[portfolio] ?? 0)));
    } else {
      changeDeityRelation(entity, oldOwnerId, -10, { nowMinutes, propagate: false, category: 'my_cult' });
    }
  }
  registerCultSiteAsOfflineHome(site);
  recomputeCultFaithBonus(entity);

  const regName = getLocalizedRegionName(site.regionIndex, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  appendPantheonChronicle(entity, {
    day: dayFromMinutes(nowMinutes),
    minutes: nowMinutes,
    category: 'my_cult',
    godId: oldOwnerId,
    regionIndex: site.regionIndex,
    text: t('apotheosis.cult.chronicle.peacefulDedicate', '{god} graciously granted peaceful stewardship of {site} ({region}) to your Cult (+8% Influence).', {
      god: oldGod?.name ?? oldOwnerId,
      site: site.name,
      region: regName,
    }),
  });

  return { ok: true, mode: 'peaceful', faithSpent: cost, site };
}

/**
 * Founds a new Player Underground Sanctuary (`player_hatch:${mapId}`) in a city
 * where the player does not yet own any Temple or Sanctuary (`350 Faith`).
 */
export function foundPlayerUndergroundSanctuary(entity, {
  mapId = 0,
  regionIndex = 0,
  locationName = '',
  branch = null,
  nowMinutes = 0,
  force = false,
} = {}) {
  if (!entity || (!force && !isAscendedGod(entity))) {
    return { ok: false, reason: t('apotheosis.cult.err.notAscended', 'Ascend to Godhood first.') };
  }
  const cult = ensureCultState(entity);
  const mid = Number(mapId) >>> 0;
  if (!mid) return { ok: false, reason: t('apotheosis.cult.err.needCity', 'Enter a city or town to found an Underground Sanctuary.') };

  const reg = clampReg(regionIndex);
  const citySites = getCityCultSites(entity, mid);
  if (!force && citySites.some((s) => s.ownerId === 'player')) {
    return { ok: false, reason: t('apotheosis.cult.err.cityHasSanctuary', 'Your Cult already holds a sanctuary in this city.') };
  }

  const pk = playerHatchSiteKey(mid);
  if (cult.sites[pk]) {
    return { ok: false, reason: t('apotheosis.cult.err.cityHasSanctuary', 'Your Cult already holds a sanctuary in this city.') };
  }

  const cost = force ? 0 : CULT_FOUND_FAITH_COST;
  if (cost > 0) {
    const spend = spendApotheosisFaith(entity, cost, { reason: `found_sanctuary:${mid}` });
    if (!spend.ok) return { ok: false, reason: spend.reason };
  }

  const initialBranch = branch && CULT_BRANCHES[String(branch).toLowerCase()]
    ? String(branch).toLowerCase()
    : null;
  const regName = getLocalizedRegionName(reg, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const locLabel = locationName || regName;
  const arch = pickSanctuaryArchitecture(pk);
  const site = {
    siteKey: pk,
    kind: 'sanctuary',
    mapId: mid,
    buildingKey: sanctuaryBuildingKeyFor(mid, true),
    regionIndex: reg,
    locationName: locLabel,
    name: `${locLabel} — ${t('apotheosis.cult.playerSanctuaryTitle', 'Cult Undercroft')}`,
    defaultPatronId: 'player',
    ownerId: 'player',
    formerOwnerId: null,
    isPlayerFounded: true,
    discovered: true,
    peacefulTransfer: false,
    unlocked: true,
    unlockMethod: 'key',
    alarmTriggered: false,
    guardiansCleared: true,
    tier: 1,
    branch: initialBranch,
    branchCooldownUntilMinutes: null,
    hatchModelId: arch.hatchModelId ?? SANCTUARY_HATCH_MODELS[0],
    interiorPool: arch.poolId ?? SANCTUARY_INTERIOR_POOLS[2],
    consecratedAtMinutes: nowMinutes,
  };
  cult.sites[pk] = site;
  shiftRegionInfluence(entity, reg, 'player', 15);
  registerCultSiteAsOfflineHome(site);
  recomputeCultFaithBonus(entity);

  appendPantheonChronicle(entity, {
    day: dayFromMinutes(nowMinutes),
    minutes: nowMinutes,
    category: 'my_cult',
    regionIndex: reg,
    text: t('apotheosis.cult.chronicle.founded', 'Founded secret Cult Undercroft in {city} ({region}, +15% Influence).', {
      city: locLabel,
      region: regName,
    }),
  });

  return { ok: true, faithSpent: cost, site };
}

/** Upgrades a player-owned Cult Temple or Sanctuary (`Tier 1 -> 2 -> 3`). */
export function upgradeCultSite(entity, siteKey, { nowMinutes = 0, force = false } = {}) {
  const site = getCultSite(entity, siteKey);
  if (!site || site.ownerId !== 'player') {
    return { ok: false, reason: t('apotheosis.cult.err.notOwned', 'You can only upgrade Cult sanctuaries you own.') };
  }
  const curTier = Math.max(1, Math.min(3, Math.trunc(Number(site.tier) || 1)));
  if (curTier >= 3) {
    return { ok: false, reason: t('apotheosis.cult.err.maxTier', 'This sanctuary is already at Grand Sanctum (Tier III).') };
  }
  const nextSpec = CULT_UPGRADE_TIERS[curTier + 1];
  const cost = force ? 0 : nextSpec.upgradeCost;
  if (cost > 0) {
    const spend = spendApotheosisFaith(entity, cost, { reason: `upgrade_cult:${site.siteKey}` });
    if (!spend.ok) return { ok: false, reason: spend.reason };
  }
  site.tier = nextSpec.tier;
  recomputeCultFaithBonus(entity);
  appendPantheonChronicle(entity, {
    day: dayFromMinutes(nowMinutes),
    minutes: nowMinutes,
    category: 'my_cult',
    regionIndex: site.regionIndex,
    text: t('apotheosis.cult.chronicle.upgraded', 'Elevated {site} to Tier {tier}.', {
      site: site.name,
      tier: nextSpec.tier,
    }),
  });
  return { ok: true, tier: site.tier, faithSpent: cost, site };
}

/** Returns specialization switch cooldown info for an owned site. */
export function getCultBranchCooldownInfo(site, nowMinutes = 0) {
  const curMin = Math.max(0, Number(nowMinutes) || 0);
  const until = site?.branchCooldownUntilMinutes != null ? Number(site.branchCooldownUntilMinutes) : null;
  if (until == null || !Number.isFinite(until) || curMin >= until) {
    return { onCooldown: false, remainingMinutes: 0, remainingDays: 0 };
  }
  const remainingMinutes = Math.max(0, Math.ceil(until - curMin));
  const remainingDays = Math.max(1, Math.ceil(remainingMinutes / 1440));
  return { onCooldown: true, remainingMinutes, remainingDays };
}

/** Assigns or switches a player-owned site's specialization branch (`missionary` | `militant` | `oracle`). */
export function selectCultSiteBranch(entity, siteKey, branchId, { nowMinutes = 0, force = false } = {}) {
  const site = getCultSite(entity, siteKey);
  if (!site || site.ownerId !== 'player') {
    return { ok: false, reason: t('apotheosis.cult.err.notOwnedBranch', 'You can only specialize Cult sanctuaries you own.') };
  }
  const bid = String(branchId ?? '').toLowerCase();
  const branch = CULT_BRANCHES[bid];
  if (!branch) {
    return { ok: false, reason: t('apotheosis.cult.err.unknownBranch', 'Unknown branch. Choose missionary, militant, or oracle.') };
  }
  if (site.branch === bid) {
    return { ok: false, reason: t('apotheosis.cult.err.sameBranch', 'This sanctuary already follows that branch.') };
  }
  const isSwitch = Boolean(site.branch);
  if (!force && isSwitch) {
    const cd = getCultBranchCooldownInfo(site, nowMinutes);
    if (cd.onCooldown) {
      return {
        ok: false,
        reason: t('apotheosis.cult.err.branchCooldown', 'Specialization switch is on cooldown ({days}d remaining).', {
          days: cd.remainingDays,
        }),
      };
    }
  }
  const cost = force || !isSwitch ? 0 : CULT_BRANCH_SWITCH_COST;
  if (cost > 0) {
    const spend = spendApotheosisFaith(entity, cost, { reason: `branch:${site.siteKey}:${bid}` });
    if (!spend.ok) return { ok: false, reason: spend.reason };
  }
  site.branch = bid;
  if (isSwitch && !force) {
    site.branchCooldownUntilMinutes = Math.max(0, Number(nowMinutes) || 0) + CULT_BRANCH_COOLDOWN_MINUTES;
  }
  recomputeCultFaithBonus(entity);
  return { ok: true, branch: bid, faithSpent: cost, switched: isSwitch, site };
}

/** Spends Faith when remotely teleporting into an owned Cult Sanctuary from UI (free when standing at the street hatch). */
export function teleportToCultSanctuary(entity, siteKey, { isNearHatch = false, force = false } = {}) {
  if (!entity || (!force && !isAscendedGod(entity))) {
    return { ok: false, reason: t('apotheosis.cult.err.notAscended', 'Ascend to Godhood first.') };
  }
  const site = getCultSite(entity, siteKey);
  if (!site) {
    return { ok: false, reason: t('apotheosis.cult.err.unknownSite', 'Sanctuary site not found.') };
  }
  if (!force && site.ownerId !== 'player' && !isNearHatch) {
    return {
      ok: false,
      reason: t('apotheosis.cult.err.teleportOwnedOnly', 'Remote teleportation only works for your own Cult Sanctuaries. Stand near the hatch on the street to enter.'),
    };
  }
  if (site.ownerId !== 'player' && !site.unlocked) {
    return { ok: false, reason: t('apotheosis.cult.err.lockedRemote', 'Unlock or consecrate this sanctuary first.') };
  }
  const cost = force || isNearHatch ? 0 : CULT_TELEPORT_SANCTUARY_FAITH_COST;
  if (cost > 0) {
    const spend = spendApotheosisFaith(entity, cost, { reason: `tp_sanctuary:${site.siteKey}` });
    if (!spend.ok) return { ok: false, reason: spend.reason };
  }
  return { ok: true, faithSpent: cost, site };
}

/** Returns whether player is eligible to proclaim a Regional Edict in `regionIndex` (`>=25%` influence or >=1 owned site). */
export function canIssueRegionalEdict(entity, regionIndex) {
  const reg = clampReg(regionIndex);
  const inf = Number(getRegionInfluence(entity, reg)?.playerShare ?? 0);
  const ownedCount = getAllCultSites(entity, { regionIndex: reg, ownedOnly: true }).length;
  const ok = inf >= EDICT_INFLUENCE_REQUIREMENT || ownedCount >= 1;
  return {
    ok,
    regionIndex: reg,
    influence: inf,
    ownedCount,
    reason: ok
      ? null
      : t('apotheosis.edict.err.ineligible', 'Requires at least 25% Cult influence OR an owned Temple/Sanctuary in {region} (now {inf}%, {sites} sites).', {
          region: getLocalizedRegionName(reg, (i) => REGION_NAMES[i] ?? `Region ${i}`),
          inf: inf.toFixed(1),
          sites: ownedCount,
        }),
  };
}

/** Returns active regional edict in `regionIndex` or null. */
export function getActiveRegionalEdict(entity, regionIndex) {
  const cult = ensureCultState(entity);
  if (!cult) return null;
  const reg = clampReg(regionIndex);
  const row = cult.edicts[reg];
  if (!row || !REGIONAL_EDICTS[row.edictId]) return null;
  if (Number(row.daysRemaining ?? 0) <= 0) return null;
  return row;
}

function applyEdictFlagsToRegion(entity, regionIndex, edictSpec) {
  if (!entity || !edictSpec) return;
  if (!Array.isArray(entity.regionConditions)) {
    entity.regionConditions = createRegionConditions();
  }
  const reg = clampReg(regionIndex);
  for (const f of edictSpec.turnOffFlags) turnOffConditionFlag(entity.regionConditions, reg, f);
  for (const f of edictSpec.turnOnFlags) turnOnConditionFlag(entity.regionConditions, reg, f);
}

let _edictProclaimedHook = null;

/** Registers callback notified whenever a Regional Edict is proclaimed. */
export function setEdictProclaimedHook(fn) {
  _edictProclaimedHook = typeof fn === 'function' ? fn : null;
}

/**
 * Proclaims one of the 4 Regional Edicts in `regionIndex` (`200 Faith`, `30 days`).
 * Logs proclamation to the Pantheon Chronicle and applies immediate regional flags.
 */
export function proclaimRegionalEdict(entity, regionIndex, edictId, { nowMinutes = 0, force = false } = {}) {
  if (!entity || (!force && !isAscendedGod(entity))) {
    return { ok: false, reason: t('apotheosis.cult.err.notAscended', 'Ascend to Godhood first.') };
  }
  const reg = clampReg(regionIndex);
  const eid = String(edictId ?? '').toLowerCase();
  const cult = ensureCultState(entity);

  if (eid === 'clear' || eid === 'none') {
    delete cult.edicts[reg];
    return { ok: true, cleared: true, regionIndex: reg };
  }

  const spec = REGIONAL_EDICTS[eid];
  if (!spec) {
    return { ok: false, reason: t('apotheosis.edict.err.unknownEdict', 'Unknown Regional Edict.') };
  }

  if (!force) {
    const elig = canIssueRegionalEdict(entity, reg);
    if (!elig.ok) return { ok: false, reason: elig.reason };
  }

  const cost = force ? 0 : REGIONAL_EDICT_COST;
  if (cost > 0) {
    const spend = spendApotheosisFaith(entity, cost, { reason: `edict:${reg}:${eid}` });
    if (!spend.ok) return { ok: false, reason: spend.reason };
  }

  const issuedAt = Math.max(0, Math.trunc(Number(nowMinutes) || 0));
  const record = {
    edictId: spec.id,
    regionIndex: reg,
    issuedAtMinutes: issuedAt,
    expiresAtMinutes: issuedAt + REGIONAL_EDICT_DURATION_MINUTES,
    daysRemaining: REGIONAL_EDICT_DURATION_DAYS,
    issuedDay: dayFromMinutes(issuedAt),
  };
  cult.edicts[reg] = record;
  applyEdictFlagsToRegion(entity, reg, spec);

  const regName = getLocalizedRegionName(reg, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const edictName = t(spec.nameKey, spec.fallbackName);
  appendPantheonChronicle(entity, {
    day: dayFromMinutes(issuedAt),
    minutes: issuedAt,
    category: 'regions',
    regionIndex: reg,
    text: t('apotheosis.edict.chronicle.proclaimed', 'Proclaimed {edict} across {region} for 30 days.', {
      edict: edictName,
      region: regName,
    }),
  });

  const petitionCompleted = _edictProclaimedHook ? _edictProclaimedHook(entity, reg, issuedAt) : null;

  return { ok: true, edict: record, faithSpent: cost, petitionCompleted };
}

/** Computes total passive Faith generated per day by all player-owned Cult Temples & Sanctuaries. */
export function getCultPassiveFaithPerDay(entity) {
  const owned = getAllCultSites(entity, { ownedOnly: true });
  let total = 0;
  for (const s of owned) {
    const tierSpec = CULT_UPGRADE_TIERS[Math.max(1, Math.min(3, s.tier || 1))] ?? CULT_UPGRADE_TIERS[1];
    const branchSpec = s.branch ? CULT_BRANCHES[s.branch] : null;
    total += tierSpec.faithPerDay + (branchSpec?.bonusFaithPerDay ?? 0);
  }
  return total;
}

/** Returns Aurbis Faith multiplier (`0.8` under Arcane Convergence in active region, else `1.0`). */
export function getRegionalEdictAurbisCostMultiplier(entity, regionIndex = entity?.currentRegionIndex ?? 0) {
  const active = getActiveRegionalEdict(entity, regionIndex);
  return active ? (REGIONAL_EDICTS[active.edictId]?.aurbisCostMult ?? 1.0) : 1.0;
}

/** Returns Champion / combat damage multiplier (`1.25` under Sanctified Crusade in active region, else `1.0`). */
export function getRegionalEdictChampionDamageMultiplier(entity, regionIndex = entity?.currentRegionIndex ?? 0) {
  const active = getActiveRegionalEdict(entity, regionIndex);
  return active ? (REGIONAL_EDICTS[active.edictId]?.championDamageMult ?? 1.0) : 1.0;
}

/** Returns Regional fine/bounty multiplier (`0.5` under Shadow Tithe in active region, else `1.0`). */
export function getRegionalEdictBountyMultiplier(entity, regionIndex = entity?.currentRegionIndex ?? 0) {
  const active = getActiveRegionalEdict(entity, regionIndex);
  return active ? (REGIONAL_EDICTS[active.edictId]?.bountyMult ?? 1.0) : 1.0;
}

/**
 * Daily simulation tick for Cult Temples/Sanctuaries and 71-Region Edicts.
 * Executed automatically inside `tickPantheonDay`.
 */
export function tickCultAndEdictsDay(entity, simMin = 0, simDay = null) {
  const cult = ensureCultState(entity);
  if (!cult || !isAscendedGod(entity)) return { faithEarned: 0, goldEarned: 0, expiredEdicts: [] };
  const resolvedDay = simDay != null ? simDay : dayFromMinutes(simMin);

  let dailyFaith = 0;
  let dailyGold = 0;
  const expiredEdicts = [];

  for (const site of getAllCultSites(entity, { ownedOnly: true })) {
    const tierSpec = CULT_UPGRADE_TIERS[Math.max(1, Math.min(3, site.tier || 1))] ?? CULT_UPGRADE_TIERS[1];
    const branchSpec = site.branch ? CULT_BRANCHES[site.branch] : null;
    dailyFaith += tierSpec.faithPerDay + (branchSpec?.bonusFaithPerDay ?? 0);
    const infGain = tierSpec.infPerDay * (branchSpec?.infMult ?? 1.0);
    shiftRegionInfluence(entity, site.regionIndex, 'player', infGain);
  }

  for (const [regKey, row] of Object.entries(cult.edicts)) {
    const reg = Number(regKey);
    const spec = REGIONAL_EDICTS[row?.edictId];
    if (!row || !spec) {
      delete cult.edicts[regKey];
      continue;
    }
    dailyFaith += spec.dailyFaith;
    dailyGold += spec.dailyGold;
    if (spec.dailyInfluence > 0) {
      shiftRegionInfluence(entity, reg, 'player', spec.dailyInfluence);
    }
    applyEdictFlagsToRegion(entity, reg, spec);

    row.daysRemaining = Math.max(0, Math.trunc(Number(row.daysRemaining ?? 0)) - 1);
    if (row.daysRemaining <= 0 || (row.expiresAtMinutes != null && simMin >= row.expiresAtMinutes && resolvedDay > (row.issuedDay ?? -1))) {
      delete cult.edicts[regKey];
      expiredEdicts.push({ regionIndex: reg, edictId: spec.id });
      const regName = getLocalizedRegionName(reg, (i) => REGION_NAMES[i] ?? `Region ${i}`);
      const edictName = t(spec.nameKey, spec.fallbackName);
      appendPantheonChronicle(entity, {
        day: resolvedDay,
        minutes: simMin,
        category: 'regions',
        regionIndex: reg,
        text: t('apotheosis.edict.chronicle.expired', '{edict} in {region} has expired after 30 days.', {
          edict: edictName,
          region: regName,
        }),
      });
    }
  }

  if (dailyFaith > 0) {
    addApotheosisFaith(entity, dailyFaith, { source: 'cult_daily', nowMinutes: simMin });
  }
  if (dailyGold > 0 && typeof entity === 'object') {
    entity.goldPieces = Math.max(0, (Number(entity.goldPieces) || 0) + dailyGold);
  }

  return { faithEarned: dailyFaith, goldEarned: dailyGold, expiredEdicts };
}

// Register daily cult tick & Stage 2 edict hooks cleanly without circular imports.
setCultDailyTickHook((entity, simMin, simDay) => tickCultAndEdictsDay(entity, simMin, simDay));
setCultStage2Hooks({
  getAurbisCostMult: getRegionalEdictAurbisCostMultiplier,
  getChampionDamageMult: getRegionalEdictChampionDamageMultiplier,
  getBountyMult: getRegionalEdictBountyMultiplier,
  getPassiveFaithPerDay: getCultPassiveFaithPerDay,
});
