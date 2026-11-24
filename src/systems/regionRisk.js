// @ts-check
import { getPref } from './uiPrefs.js';
import { t } from './textManager.js';
import { REGION_NAMES } from '../formats/mapsTables.js';

export const REGION_RISK_PREF = 'regionalRiskZones';
export const REGION_RISK_MODES = Object.freeze(['off', 'standard', 'harsh']);

/**
 * @typedef {'off' | 'standard' | 'harsh'} RegionRiskMode
 * @typedef {'heartland' | 'frontier' | 'wilds' | 'perilous'} RegionRiskId
 * @typedef {{ regionIndex: number, regionName: string, tier: 1 | 2 | 3 | 4, id: RegionRiskId, roman: 'I' | 'II' | 'III' | 'IV', mode: RegionRiskMode, hpMult: number, damageMult: number, eliteBonus: number, minLevelFloor: number }} RegionRiskProfile
 */

/** @type {Set<number>} */
const PERILOUS_REGIONS = new Set([
  7,  // Devilrock
  61, // Cybiades
  65, // Morrowind
  69, // Black Marsh
]);

/** @type {Set<number>} */
const WILDS_REGIONS = new Set([
  0,  // Alik'r Desert
  1,  // Dragontail Mountains
  16, // Wrothgarian Mountains
  26, // Orsinium Area
  64, // Skyrim
  67, // Valenwood
  68, // Elsweyr
]);

/** @type {Set<number>} */
const FRONTIER_REGIONS = new Set([
  2,  // Glenpoint Foothills
  3,  // Daggerfall Bluffs
  4,  // Yeorth Burrowland
  5,  // Dwynnen
  6,  // Ravennian Forest
  8,  // Malekna Forest
  9,  // Isle of Balfiera
  10, // Bantha
  11, // Dak'fron
  12, // Islands in the Western Iliac Bay
  13, // Tamarilyn Point
  14, // Lainlyn Cliffs
  15, // Bjoulsae River
  27, // Skeffington Wood
  29, // Hammerfell sea coast
  31, // High Rock sea coast
  32, // Northmoor
  33, // Menevia
  38, // Phrygias
  39, // Urvaius
  42, // Shalgora
  43, // Abibon-Gora
  52, // Mournoth
  59, // Glenumbra Moors
  60, // Ilessan Hills
  62, // High Rock
  63, // Hammerfell
  66, // Sumurset Isle
  70, // Cyrodiil
]);

/** @type {Record<1 | 2 | 3 | 4, { id: RegionRiskId, roman: 'I' | 'II' | 'III' | 'IV' }>} */
const TIER_META = Object.freeze({
  1: Object.freeze({ id: 'heartland', roman: 'I' }),
  2: Object.freeze({ id: 'frontier', roman: 'II' }),
  3: Object.freeze({ id: 'wilds', roman: 'III' }),
  4: Object.freeze({ id: 'perilous', roman: 'IV' }),
});

/** @type {Record<RegionRiskMode, Record<1 | 2 | 3 | 4, { hpMult: number, damageMult: number, eliteBonus: number, minLevelFloor: number }>>} */
const MODE_SCALES = Object.freeze({
  off: Object.freeze({
    1: Object.freeze({ hpMult: 1.0, damageMult: 1.0, eliteBonus: 0, minLevelFloor: 1 }),
    2: Object.freeze({ hpMult: 1.0, damageMult: 1.0, eliteBonus: 0, minLevelFloor: 1 }),
    3: Object.freeze({ hpMult: 1.0, damageMult: 1.0, eliteBonus: 0, minLevelFloor: 1 }),
    4: Object.freeze({ hpMult: 1.0, damageMult: 1.0, eliteBonus: 0, minLevelFloor: 1 }),
  }),
  standard: Object.freeze({
    1: Object.freeze({ hpMult: 1.0, damageMult: 1.0, eliteBonus: 0.0, minLevelFloor: 1 }),
    2: Object.freeze({ hpMult: 1.08, damageMult: 1.12, eliteBonus: 0.03, minLevelFloor: 5 }),
    3: Object.freeze({ hpMult: 1.18, damageMult: 1.24, eliteBonus: 0.06, minLevelFloor: 10 }),
    4: Object.freeze({ hpMult: 1.28, damageMult: 1.36, eliteBonus: 0.1, minLevelFloor: 14 }),
  }),
  harsh: Object.freeze({
    1: Object.freeze({ hpMult: 1.0, damageMult: 1.05, eliteBonus: 0.0, minLevelFloor: 1 }),
    2: Object.freeze({ hpMult: 1.15, damageMult: 1.22, eliteBonus: 0.05, minLevelFloor: 6 }),
    3: Object.freeze({ hpMult: 1.3, damageMult: 1.38, eliteBonus: 0.1, minLevelFloor: 12 }),
    4: Object.freeze({ hpMult: 1.45, damageMult: 1.55, eliteBonus: 0.15, minLevelFloor: 16 }),
  }),
});

/**
 * Current offline Regional Risk Zones mode (`off` | `standard` | `harsh`).
 * @returns {RegionRiskMode}
 */
export function regionRiskMode() {
  const raw = String(getPref(REGION_RISK_PREF) ?? 'standard').toLowerCase();
  if (raw === 'off' || raw === 'harsh') return raw;
  return 'standard';
}

/**
 * Returns the canonical risk tier (`1..4`) for any region index (`0..70`).
 * @param {number|null|undefined} regionIndex
 * @returns {1 | 2 | 3 | 4}
 */
export function regionRiskTierOf(regionIndex) {
  if (!Number.isInteger(regionIndex)) return 1;
  const idx = /** @type {number} */ (regionIndex);
  if (PERILOUS_REGIONS.has(idx)) return 4;
  if (WILDS_REGIONS.has(idx)) return 3;
  if (FRONTIER_REGIONS.has(idx)) return 2;
  return 1;
}

/**
 * Resolves the full regional risk profile for a region under current offline settings.
 * Online mode always uses uniform `off` scaling.
 * @param {number|null|undefined} regionIndex
 * @param {{ online?: boolean, mode?: RegionRiskMode|null }} [opts]
 * @returns {RegionRiskProfile}
 */
export function regionRiskProfile(regionIndex, { online = false, mode = null } = {}) {
  const regIdx = Number.isInteger(regionIndex) ? /** @type {number} */ (regionIndex) : -1;
  const tier = regionRiskTierOf(regIdx);
  const meta = TIER_META[tier];
  /** @type {RegionRiskMode} */
  const effectiveMode = online || regIdx < 0 || regIdx >= REGION_NAMES.length
    ? 'off'
    : (mode === 'off' || mode === 'standard' || mode === 'harsh' ? mode : regionRiskMode());
  const scales = MODE_SCALES[effectiveMode][tier];
  const regionName = regIdx >= 0 && regIdx < REGION_NAMES.length ? REGION_NAMES[regIdx] : 'Unknown';
  return Object.freeze({
    regionIndex: regIdx,
    regionName,
    tier,
    id: meta.id,
    roman: meta.roman,
    mode: effectiveMode,
    hpMult: scales.hpMult,
    damageMult: scales.damageMult,
    eliteBonus: scales.eliteBonus,
    minLevelFloor: scales.minLevelFloor,
  });
}

/**
 * Applies offline Regional Risk Zone scaling to a newly spawned foe entity.
 * @param {any} entity
 * @param {number|null|undefined} regionIndex
 * @param {{ online?: boolean, mode?: RegionRiskMode|null }} [opts]
 * @returns {RegionRiskProfile}
 */
export function applyRegionRiskToFoe(entity, regionIndex, { online = false, mode = null } = {}) {
  const profile = regionRiskProfile(regionIndex, { online, mode });
  if (!entity || online || profile.mode === 'off' || profile.regionIndex < 0) return profile;

  if (profile.hpMult > 1) {
    entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * profile.hpMult));
    entity.health = entity.maxHealth;
    entity.healthMult = (entity.healthMult ?? 1) * profile.hpMult;
  }
  if (profile.damageMult > 1) {
    entity.damageScale =
      (Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1) * profile.damageMult;
  }
  entity.regionRiskTier = profile.tier;
  entity.regionRiskId = profile.id;
  return profile;
}

/**
 * Returns the localized Travel Map / Bounty Board threat line for a region,
 * or `null` when online, invalid, or Regional Risk Zones are `off`.
 * @param {number|null|undefined} regionIndex
 * @param {{ online?: boolean, mode?: RegionRiskMode|null }} [opts]
 * @returns {string|null}
 */
export function getRegionRiskLine(regionIndex, { online = false, mode = null } = {}) {
  if (online) return null;
  if (!Number.isInteger(regionIndex)) return null;
  const idx = /** @type {number} */ (regionIndex);
  if (idx < 0 || idx >= REGION_NAMES.length) return null;

  const profile = regionRiskProfile(idx, { online, mode });
  if (profile.mode === 'off') return null;

  let tierLabel = t('regionRisk.tier.heartland', 'Heartland');
  if (profile.id === 'frontier') tierLabel = t('regionRisk.tier.frontier', 'Frontier');
  else if (profile.id === 'wilds') tierLabel = t('regionRisk.tier.wilds', 'Wilds');
  else if (profile.id === 'perilous') tierLabel = t('regionRisk.tier.perilous', 'Perilous');

  if (profile.damageMult <= 1 && profile.hpMult <= 1) {
    return t('regionRisk.map.lineBase', 'Threat: {tier} (Tier {roman})', {
      tier: tierLabel,
      roman: profile.roman,
    });
  }

  return t('regionRisk.map.lineScaled', 'Threat: {tier} (Tier {roman} · +{dmgPct}% Dmg, +{hpPct}% HP)', {
    tier: tierLabel,
    roman: profile.roman,
    dmgPct: Math.round((profile.damageMult - 1) * 100),
    hpPct: Math.round((profile.hpMult - 1) * 100),
  });
}
