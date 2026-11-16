// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 3 (MILESTONE 3.1): PANTHEON 8+8, 71-REGION DOMINION & 4X DIPLOMACY
//
// Provides:
//   - Expandable 8 Aedra + 8 Daedra Pantheon registry (`registerPantheonDeity`)
//   - Upstart initial standings (Portfolio, Temple rank/rep, shattered artifacts,
//     Lich/Vampire/Lycanthrope curses) + 30-day Grace Period with x2 offense penalty
//   - Ally/Enemy relation propagation & Portfolio realignment apostate penalties
//   - 71-Region Tamriel divine influence shares (62 Iliac Bay + 9 Tamriel provinces)
//   - Reactive regional shifts from all 26 vanilla World Sim `REGION_FLAGS`
//   - Daily Pantheon AI turns (1 global move per deity per tick) + searchable Chronicle
//   - Diplomatic Decrees (Offering, Pact, Alliance, Sow Discord, Holy War, Dynamic Truce)
//   - Targeted Divine Geopolitics (`igniteRegionWar`, `enforceRegionPeace`)
// ═══════════════════════════════════════════════════════════════════════════════

import { t, getLocalizedRegionName } from '../textManager.js';
import {
  REGION_NAMES,
  PROVINCE_REGION_NAMES,
  BAY_REGION_COUNT,
  isProvinceRegion,
} from '../../formats/mapsTables.js';
import { REGION_TEMPLES } from '../../formats/mapsFile.js';
import { FACTION_TYPES } from '../../formats/factionFile.js';
import {
  REGION_FLAGS,
  conditionFlag,
  turnOnConditionFlag,
  turnOffConditionFlag,
  createRegionConditions,
} from '../region/regionConditions.js';
import { startFactionEnemies, endFactionEnemies } from '../faction/factionRelations.js';
import { provinceFactionId } from '../faction/provinceFactions.js';
import { DIVINES } from '../guild/guildFactions.js';
import { APOTHEOSIS_INITIAL_FAITH, isAscendedGod } from './apotheosisLive.js';
import {
  addApotheosisFaith,
  spendApotheosisFaith,
  getApotheosisPantheonActivityMultiplier,
  getApotheosisWorldHostilityMultiplier,
  setPantheonTickHook,
} from './apotheosisStage2.js';

export const TAMRIEL_REGION_COUNT = REGION_NAMES.length; // 62 Iliac Bay + 9 Provinces = 71
export const APOTHEOSIS_GRACE_PERIOD_DAYS = 30;
export const APOTHEOSIS_GRACE_PERIOD_MINUTES = APOTHEOSIS_GRACE_PERIOD_DAYS * 1440;
export const APOTHEOSIS_TRUCE_DAYS = 30;
export const APOTHEOSIS_TRUCE_MINUTES = APOTHEOSIS_TRUCE_DAYS * 1440;

export const PANTHEON_OFFERING_COST = 100;
export const PANTHEON_PACT_COST = 150;
export const PANTHEON_ALLIANCE_COST = 300;
export const PANTHEON_DISCORD_COST = 200;
export const PANTHEON_WAR_COST = 100;
export const GEOPOLITICS_WAR_COST = 350;
export const GEOPOLITICS_PEACE_COST = 300;
export const MAX_CHRONICLE_ENTRIES = 80;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

function dayFromMinutes(nowMinutes) {
  return Math.floor((Math.max(0, Number(nowMinutes) || 0)) / 1440);
}

/** Canonical 8 Aedra + 8 Key Daedric Princes (designed so extra Princes or Mannimarco can register dynamically). */
const INITIAL_DEITIES = [
  // ── 8 AEDRA ────────────────────────────────────────────────────────────────
  {
    id: 'akatosh',
    name: 'Akatosh',
    title: 'Dragon God of Time',
    kind: 'aedra',
    factionId: DIVINES.Akatosh,
    artifactSubTypes: [],
    baseUpstart: -25,
    portfolioAffinity: { order: 35, war: 5, magic: 15, shadows: -40 },
    personality: 'guardian',
    allies: ['stendarr', 'mara', 'julianos'],
    enemies: ['mehrunes_dagon', 'molag_bal'],
    color: '#e6c34d',
  },
  {
    id: 'arkay',
    name: 'Arkay',
    title: 'Lord of Life & Death',
    kind: 'aedra',
    factionId: DIVINES.Arkay,
    artifactSubTypes: [],
    baseUpstart: -20,
    portfolioAffinity: { order: 20, war: 0, magic: -25, shadows: -40 },
    personality: 'guardian',
    allies: ['stendarr', 'mara'],
    enemies: ['molag_bal', 'mehrunes_dagon'],
    color: '#c29952',
  },
  {
    id: 'dibella',
    name: 'Dibella',
    title: 'Goddess of Beauty',
    kind: 'aedra',
    factionId: DIVINES.Dibella,
    artifactSubTypes: [],
    baseUpstart: -5,
    portfolioAffinity: { order: 10, war: -35, magic: 20, shadows: 0 },
    personality: 'diplomat',
    allies: ['mara', 'kynareth'],
    enemies: ['molag_bal', 'mehrunes_dagon'],
    color: '#e586b5',
  },
  {
    id: 'julianos',
    name: 'Julianos',
    title: 'God of Wisdom & Logic',
    kind: 'aedra',
    factionId: DIVINES.Julianos,
    artifactSubTypes: [],
    baseUpstart: -15,
    portfolioAffinity: { order: 30, war: -10, magic: 40, shadows: -10 },
    personality: 'diplomat',
    allies: ['akatosh', 'zenithar'],
    enemies: ['sheogorath', 'mehrunes_dagon'],
    color: '#6bb8f0',
  },
  {
    id: 'kynareth',
    name: 'Kynareth',
    title: 'Goddess of Winds & Storms',
    kind: 'aedra',
    factionId: DIVINES.Kynareth,
    artifactSubTypes: [],
    baseUpstart: -10,
    portfolioAffinity: { order: 5, war: 30, magic: 10, shadows: 0 },
    personality: 'diplomat',
    allies: ['dibella', 'zenithar'],
    enemies: ['molag_bal', 'sheogorath'],
    color: '#5ec99b',
  },
  {
    id: 'mara',
    name: 'Mara',
    title: 'Mother of Mercy',
    kind: 'aedra',
    factionId: DIVINES.Mara,
    artifactSubTypes: [],
    baseUpstart: -5,
    portfolioAffinity: { order: 25, war: -45, magic: 5, shadows: -20 },
    personality: 'diplomat',
    allies: ['akatosh', 'dibella', 'stendarr'],
    enemies: ['molag_bal', 'mehrunes_dagon', 'mephala'],
    color: '#f2b880',
  },
  {
    id: 'stendarr',
    name: 'Stendarr',
    title: 'God of Justice & Mercy',
    kind: 'aedra',
    factionId: DIVINES.Stendarr,
    artifactSubTypes: [],
    baseUpstart: -25,
    portfolioAffinity: { order: 40, war: 15, magic: -25, shadows: -50 },
    personality: 'expansionist',
    allies: ['akatosh', 'arkay', 'mara'],
    enemies: ['mehrunes_dagon', 'molag_bal', 'nocturnal', 'mephala'],
    color: '#f5dc7a',
  },
  {
    id: 'zenithar',
    name: 'Zenithar',
    title: 'God of Work & Commerce',
    kind: 'aedra',
    factionId: DIVINES.Zenithar,
    artifactSubTypes: [],
    baseUpstart: -10,
    portfolioAffinity: { order: 30, war: -35, magic: 5, shadows: -40 },
    personality: 'diplomat',
    allies: ['julianos', 'kynareth'],
    enemies: ['nocturnal', 'mehrunes_dagon'],
    color: '#d9a441',
  },

  // ── 8 KEY DAEDRIC PRINCES ──────────────────────────────────────────────────
  {
    id: 'mehrunes_dagon',
    name: 'Mehrunes Dagon',
    title: 'Prince of Destruction',
    kind: 'daedra',
    factionId: 2,
    artifactSubTypes: [1],
    baseUpstart: -25,
    portfolioAffinity: { order: -50, war: 40, magic: 0, shadows: 5 },
    personality: 'expansionist',
    allies: ['boethiah', 'molag_bal'],
    enemies: ['akatosh', 'stendarr', 'mara', 'zenithar'],
    color: '#d9483b',
  },
  {
    id: 'molag_bal',
    name: 'Molag Bal',
    title: 'Lord of Domination',
    kind: 'daedra',
    factionId: 3,
    artifactSubTypes: [2],
    baseUpstart: -30,
    portfolioAffinity: { order: -45, war: 20, magic: 0, shadows: 5 },
    personality: 'expansionist',
    allies: ['mehrunes_dagon', 'mephala'],
    enemies: ['arkay', 'stendarr', 'mara', 'boethiah'],
    color: '#8865f2',
  },
  {
    id: 'boethiah',
    name: 'Boethiah',
    title: 'Prince of Plots & Combat',
    kind: 'daedra',
    factionId: 10,
    artifactSubTypes: [18],
    baseUpstart: 5,
    portfolioAffinity: { order: -25, war: 40, magic: -20, shadows: 30 },
    personality: 'expansionist',
    allies: ['mephala', 'mehrunes_dagon'],
    enemies: ['molag_bal', 'mara'],
    color: '#e06b3c',
  },
  {
    id: 'mephala',
    name: 'Mephala',
    title: 'Webspinner of Secrets',
    kind: 'daedra',
    factionId: 15,
    artifactSubTypes: [22],
    baseUpstart: 0,
    portfolioAffinity: { order: -40, war: 5, magic: 5, shadows: 45 },
    personality: 'schemer',
    allies: ['boethiah', 'nocturnal'],
    enemies: ['mara', 'stendarr'],
    color: '#ab5ce0',
  },
  {
    id: 'nocturnal',
    name: 'Nocturnal',
    title: 'Mistress of Shadows',
    kind: 'daedra',
    factionId: 14,
    artifactSubTypes: [21],
    baseUpstart: 5,
    portfolioAffinity: { order: -45, war: 0, magic: 5, shadows: 45 },
    personality: 'schemer',
    allies: ['mephala', 'azura'],
    enemies: ['stendarr', 'zenithar'],
    color: '#5f74b8',
  },
  {
    id: 'hermaeus_mora',
    name: 'Hermaeus Mora',
    title: 'Scryer of Forbidden Lore',
    kind: 'daedra',
    factionId: 8,
    artifactSubTypes: [5],
    baseUpstart: 0,
    portfolioAffinity: { order: 0, war: -10, magic: 40, shadows: 15 },
    personality: 'schemer',
    allies: ['azura'],
    enemies: ['stendarr'],
    color: '#46a892',
  },
  {
    id: 'azura',
    name: 'Azura',
    title: 'Queen of Dawn & Dusk',
    kind: 'daedra',
    factionId: 16,
    artifactSubTypes: [9],
    baseUpstart: 10,
    portfolioAffinity: { order: 10, war: -10, magic: 35, shadows: 15 },
    personality: 'diplomat',
    allies: ['nocturnal', 'hermaeus_mora'],
    enemies: ['molag_bal', 'sheogorath'],
    color: '#8f9cf5',
  },
  {
    id: 'sheogorath',
    name: 'Sheogorath',
    title: 'Mad God of Isles',
    kind: 'daedra',
    factionId: 9,
    artifactSubTypes: [6],
    baseUpstart: 5,
    portfolioAffinity: { order: -50, war: 10, magic: 20, shadows: 15 },
    personality: 'schemer',
    allies: [],
    enemies: ['julianos', 'azura', 'stendarr'],
    color: '#d9b44a',
  },
];

/** Mutable array/map backing expandable Pantheon registry (preloaded with 8 Aedra + 8 Daedra). */
export const PANTHEON_DEITIES = [];
const DEITY_BY_ID = new Map();

/** Registers a new Deity or Daedric Prince dynamically into the 4X Pantheon registry. */
export function registerPantheonDeity(def) {
  if (!def || typeof def.id !== 'string' || !def.id.trim()) return null;
  const clean = Object.freeze({
    id: def.id.trim(),
    name: def.name || def.id,
    title: def.title || '',
    kind: def.kind === 'aedra' ? 'aedra' : def.kind === 'daedra' ? 'daedra' : 'other',
    factionId: Number.isInteger(def.factionId) ? def.factionId : 0,
    artifactSubTypes: Object.freeze(Array.isArray(def.artifactSubTypes) ? [...def.artifactSubTypes] : []),
    baseUpstart: Number.isFinite(Number(def.baseUpstart)) ? Math.trunc(Number(def.baseUpstart)) : -15,
    portfolioAffinity: Object.freeze({
      order: def.portfolioAffinity?.order ?? 0,
      war: def.portfolioAffinity?.war ?? 0,
      magic: def.portfolioAffinity?.magic ?? 0,
      shadows: def.portfolioAffinity?.shadows ?? 0,
    }),
    personality: def.personality || 'diplomat',
    allies: Object.freeze(Array.isArray(def.allies) ? [...def.allies] : []),
    enemies: Object.freeze(Array.isArray(def.enemies) ? [...def.enemies] : []),
    color: def.color || '#d4c080',
  });
  if (DEITY_BY_ID.has(clean.id)) {
    const idx = PANTHEON_DEITIES.findIndex((d) => d.id === clean.id);
    if (idx >= 0) PANTHEON_DEITIES[idx] = clean;
  } else {
    PANTHEON_DEITIES.push(clean);
  }
  DEITY_BY_ID.set(clean.id, clean);
  return clean;
}

for (const d of INITIAL_DEITIES) registerPantheonDeity(d);

export function getPantheonDeities() {
  return [...PANTHEON_DEITIES];
}

export function getPantheonDeity(godId) {
  return DEITY_BY_ID.get(String(godId ?? '').trim().toLowerCase()) ?? null;
}

const TEMPLE_ORDER_FALLBACK = Object.freeze({
  36: 'kynareth',
  82: 'arkay',
  84: 'stendarr',
  88: 'zenithar',
  92: 'akatosh',
  94: 'dibella',
  98: 'julianos',
  106: 'mara',
});

const PROVINCE_SEED_DOMINION = Object.freeze({
  62: ['akatosh', 'stendarr', 'julianos', 'nocturnal'],       // High Rock (beyond the Bay)
  63: ['kynareth', 'zenithar', 'boethiah', 'mehrunes_dagon'], // Hammerfell
  64: ['kynareth', 'akatosh', 'boethiah', 'sheogorath'],      // Skyrim
  65: ['azura', 'boethiah', 'mephala', 'hermaeus_mora'],      // Morrowind
  66: ['akatosh', 'julianos', 'azura', 'mara'],               // Sumurset Isle
  67: ['kynareth', 'dibella', 'azura', 'nocturnal'],          // Valenwood
  68: ['azura', 'nocturnal', 'kynareth', 'sheogorath'],       // Elsweyr
  69: ['mara', 'arkay', 'hermaeus_mora', 'molag_bal'],        // Black Marsh
  70: ['akatosh', 'stendarr', 'julianos', 'mehrunes_dagon'],  // Cyrodiil
});

const BAY_DAEDRA_ROTATION = ['mehrunes_dagon', 'molag_bal', 'boethiah', 'mephala', 'nocturnal', 'hermaeus_mora', 'azura', 'sheogorath'];
const AEDRA_IDS = ['akatosh', 'arkay', 'dibella', 'julianos', 'kynareth', 'mara', 'stendarr', 'zenithar'];

/** Resolves the canonical patron deity ID for a region (`0..70`), consulting live FACTION.TXT first when loaded. */
export function resolveRegionPatronDeityId(regionIndex, dict = null) {
  if (!Number.isInteger(regionIndex) || regionIndex < 0 || regionIndex >= TAMRIEL_REGION_COUNT) return 'akatosh';
  if (isProvinceRegion(regionIndex)) {
    return PROVINCE_SEED_DOMINION[regionIndex]?.[0] ?? 'akatosh';
  }
  const orderId = REGION_TEMPLES[regionIndex] ?? 0;
  if (orderId > 0 && dict instanceof Map) {
    const rec = dict.get(orderId);
    const parentId = rec?.parent > 0 ? rec.parent : orderId;
    const match = PANTHEON_DEITIES.find((d) => d.factionId === parentId);
    if (match) return match.id;
  }
  if (orderId > 0 && TEMPLE_ORDER_FALLBACK[orderId]) {
    return TEMPLE_ORDER_FALLBACK[orderId];
  }
  return AEDRA_IDS[regionIndex % AEDRA_IDS.length];
}

function getStoredFactionRep(entity, factionId) {
  const dict = entity?.factionRep?.dict;
  if (dict instanceof Map) return Number(dict.get(factionId)?.rep ?? 0) || 0;
  if (entity?.factionRep && typeof entity.factionRep[factionId] === 'number') {
    return entity.factionRep[factionId];
  }
  return 0;
}

function getTempleMembershipBonus(entity, deity) {
  if (!entity || !deity || deity.kind !== 'aedra') return 0;
  const book = entity.guildMemberships?.mortal && typeof entity.guildMemberships.mortal === 'object'
    ? entity.guildMemberships.mortal
    : (entity.guildMemberships && typeof entity.guildMemberships === 'object' ? entity.guildMemberships : {});
  for (const m of Object.values(book)) {
    if (!m || typeof m !== 'object') continue;
    const guildName = String(m.guild ?? m.name ?? '').toLowerCase();
    if (guildName.includes(deity.id) || (m.factionId && m.factionId === deity.factionId)) {
      const rank = Math.max(0, Math.min(9, Number(m.rank) || 0));
      return 15 + rank * 2;
    }
  }
  return 0;
}

function hasRacialCurse(entity, curseName) {
  const cur = entity?.racialOverride;
  if (cur && !cur.ended && cur.racial === curseName) return true;
  if (curseName === 'vampirism') return !!(entity?.isVampire || entity?.vampire);
  if (curseName === 'lycanthropy') return !!(entity?.isWerewolf || entity?.lycanthrope);
  return false;
}

function hasAnyLichState(entity) {
  return !!(
    entity?.lichdom?.active ||
    entity?.lichdom?.isLich ||
    entity?.lichdom?.stage > 0 ||
    entity?.ancientLich ||
    entity?.isLich
  );
}

function computeStatusFromEntry(entry, relation, nowMinutes = null) {
  if (entry.manualWar && (!entry.truceUntilMinutes || (nowMinutes ?? 0) >= entry.truceUntilMinutes)) {
    return 'war';
  }
  if (entry.truceUntilMinutes != null && nowMinutes != null && nowMinutes < entry.truceUntilMinutes) {
    return relation <= -40 ? 'hostile' : 'wary';
  }
  if (relation <= -60) return 'war';
  if (relation <= -40) return 'hostile';
  if (entry.allied && relation >= 50) return 'allied';
  if (entry.pact && relation >= 10) return 'pact';
  if (relation >= 75) return 'allied';
  if (relation >= 40) return 'pact';
  return 'wary';
}

function pairKey(idA, idB) {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function buildInitialRegions(entity) {
  const dict = entity?.factionRep?.dict instanceof Map ? entity.factionRep.dict : null;
  const ascReg = Number.isInteger(entity?.currentRegionIndex) && entity.currentRegionIndex >= 0 && entity.currentRegionIndex < TAMRIEL_REGION_COUNT
    ? entity.currentRegionIndex
    : 17;
  const playerAscended = isAscendedGod(entity);
  const out = [];

  for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
    const shares = {};
    if (isProvinceRegion(r)) {
      const seeds = PROVINCE_SEED_DOMINION[r] ?? ['akatosh', 'stendarr', 'julianos', 'mehrunes_dagon'];
      shares[seeds[0]] = 45;
      shares[seeds[1]] = 25;
      shares[seeds[2]] = 18;
      shares[seeds[3]] = 12;
    } else {
      const primaryAedra = resolveRegionPatronDeityId(r, dict);
      const secAedra = AEDRA_IDS[(r + 3) % AEDRA_IDS.length] === primaryAedra
        ? AEDRA_IDS[(r + 4) % AEDRA_IDS.length]
        : AEDRA_IDS[(r + 3) % AEDRA_IDS.length];
      const d1 = BAY_DAEDRA_ROTATION[r % BAY_DAEDRA_ROTATION.length];
      const d2 = BAY_DAEDRA_ROTATION[(r + 3) % BAY_DAEDRA_ROTATION.length];
      shares[primaryAedra] = 56;
      shares[secAedra] = 16;
      shares[d1] = 18;
      shares[d2] = 10;
    }
    if (playerAscended && r === ascReg) {
      // Newly ascended god sparks a 10% foothold in their ascension region.
      const prevKeys = Object.keys(shares);
      for (const k of prevKeys) shares[k] = round1(shares[k] * 0.9);
      shares.player = 10;
    }
    normalizeShareMap(shares);
    out.push(shares);
  }
  return out;
}

function normalizeShareMap(shares) {
  const keys = Object.keys(shares);
  let sum = 0;
  for (const k of keys) {
    const v = Math.max(0, Number(shares[k]) || 0);
    if (v <= 0.04) {
      delete shares[k];
    } else {
      shares[k] = round1(v);
      sum += shares[k];
    }
  }
  const cleanKeys = Object.keys(shares);
  if (cleanKeys.length === 0) {
    shares.akatosh = 100;
    return shares;
  }
  if (Math.abs(sum - 100) > 0.01) {
    const scale = sum > 0 ? 100 / sum : 1;
    let newSum = 0;
    let maxKey = cleanKeys[0];
    for (const k of cleanKeys) {
      shares[k] = round1(shares[k] * scale);
      newSum += shares[k];
      if (shares[k] > shares[maxKey]) maxKey = k;
    }
    shares[maxKey] = round1(Math.max(0, shares[maxKey] + (100 - newSum)));
  }
  return shares;
}

function pushChronicle(pantheon, { day = 0, minutes = 0, category = 'diplomacy', godId = null, regionIndex = null, text = '' }) {
  if (!pantheon || !text) return;
  if (!Array.isArray(pantheon.chronicle)) pantheon.chronicle = [];
  pantheon.chronicle.unshift({
    id: `chr_${day}_${(pantheon._seq = (pantheon._seq || 0) + 1)}`,
    day,
    minutes,
    category,
    godId,
    regionIndex,
    text,
  });
  if (pantheon.chronicle.length > MAX_CHRONICLE_ENTRIES) {
    pantheon.chronicle.length = MAX_CHRONICLE_ENTRIES;
  }
}

function computeUpstartHistory(entity, deity) {
  const apo = entity?.apotheosis ?? {};
  let hist = deity.baseUpstart;

  // 1. Mortal faction reputation & Temple membership on Ascension
  const rep = getStoredFactionRep(entity, deity.factionId);
  hist += clamp(Math.round(rep / 5), -20, 20);
  hist += getTempleMembershipBonus(entity, deity);
  if (entity?.worshippedDeity && String(entity.worshippedDeity).toLowerCase() === deity.id) {
    hist += 20;
  }

  // 2. Daedric Prince penalty if player shattered their artifact in 13-Artifact ritual
  const sacrificed = Array.isArray(apo.sacrificedArtifacts) ? apo.sacrificedArtifacts : [];
  if (deity.artifactSubTypes.some((sub) => sacrificed.includes(sub))) {
    hist -= 30;
  }

  // 3. Undead / Occult curse modifiers
  if (hasAnyLichState(entity)) {
    if (deity.id === 'arkay' || deity.id === 'stendarr') hist -= 40;
    else if (deity.id === 'mara' || deity.id === 'akatosh') hist -= 20;
    else if (deity.id === 'hermaeus_mora' || deity.id === 'molag_bal') hist += 20;
  }
  if (hasRacialCurse(entity, 'vampirism')) {
    if (deity.id === 'arkay' || deity.id === 'stendarr') hist -= 35;
    else if (deity.id === 'molag_bal') hist += 25;
  }
  if (hasRacialCurse(entity, 'lycanthropy')) {
    if (deity.id === 'stendarr') hist -= 15;
    else if (deity.id === 'boethiah') hist += 20;
  }

  return clamp(Math.trunc(hist), -100, 100);
}

/**
 * Ensures `entity.apotheosis.pantheon` is initialized and normalized with all registered deities,
 * inter-god standings, all 71 Tamriel regional influence maps, and the Chronicle.
 */
export function ensurePantheonState(entity, { nowMinutes = null } = {}) {
  if (!entity || typeof entity !== 'object') return null;
  if (!entity.apotheosis || typeof entity.apotheosis !== 'object') return null;
  const apo = entity.apotheosis;
  const portfolio = apo.portfolio || 'war';
  const refMin = nowMinutes != null && Number.isFinite(Number(nowMinutes))
    ? Math.trunc(Number(nowMinutes))
    : (apo.ascendedAtMinutes ?? 0);

  let createdNow = false;
  if (!apo.pantheon || typeof apo.pantheon !== 'object') {
    apo.pantheon = {
      deities: {},
      interGodRelations: {},
      regionInfluence: buildInitialRegions(entity),
      chronicle: [],
      lastPantheonTickDay: dayFromMinutes(refMin),
      initializedPortfolio: portfolio,
      _seq: 0,
    };
    createdNow = true;
  }

  const p = apo.pantheon;
  if (!p.deities || typeof p.deities !== 'object') p.deities = {};
  if (!p.interGodRelations || typeof p.interGodRelations !== 'object') p.interGodRelations = {};
  if (!Array.isArray(p.regionInfluence) || p.regionInfluence.length !== TAMRIEL_REGION_COUNT) {
    p.regionInfluence = buildInitialRegions(entity);
  }
  if (!Array.isArray(p.chronicle)) p.chronicle = [];

  for (const d of PANTHEON_DEITIES) {
    if (!p.deities[d.id] || typeof p.deities[d.id] !== 'object') {
      const personalHistory = computeUpstartHistory(entity, d);
      const relation = clamp(personalHistory + (d.portfolioAffinity[portfolio] ?? 0), -100, 100);
      const hasGrace = relation > -40 && relation < 20;
      p.deities[d.id] = {
        personalHistory,
        relation,
        status: 'wary',
        graceUntilMinutes: hasGrace ? refMin + APOTHEOSIS_GRACE_PERIOD_MINUTES : null,
        truceUntilMinutes: null,
        lastOfferingDay: null,
        allied: false,
        pact: false,
        manualWar: false,
        warscore: 0,
        championsDefeated: 0,
      };
    }
    const entry = p.deities[d.id];
    entry.relation = clamp(
      (Number(entry.personalHistory) || 0) + (d.portfolioAffinity[portfolio] ?? 0),
      -100,
      100,
    );
    entry.status = computeStatusFromEntry(entry, entry.relation, refMin);

    for (const allyId of d.allies) {
      const k = pairKey(d.id, allyId);
      if (p.interGodRelations[k] === undefined) p.interGodRelations[k] = 60;
    }
    for (const enemyId of d.enemies) {
      const k = pairKey(d.id, enemyId);
      if (p.interGodRelations[k] === undefined) p.interGodRelations[k] = -60;
    }
  }

  if (createdNow && isAscendedGod(entity)) {
    pushChronicle(p, {
      day: dayFromMinutes(refMin),
      minutes: refMin,
      category: 'diplomacy',
      text: t(
        'apotheosis.pantheon.logStart',
        'A new divinity ascends across Tamriel. Wary Aedra and Daedra grant a 30-day Grace Period; rivals stir at once.',
      ),
    });
  }

  return p;
}

/**
 * Updates Pantheon standings when the player switches Portfolios.
 * Applies a `-20` apostate penalty to strong patrons of the abandoned Portfolio (unless `{ free: true }`).
 */
export function applyPantheonPortfolioSwitch(entity, oldPortfolio, newPortfolio, { free = false, nowMinutes = null } = {}) {
  if (!entity?.apotheosis) return null;
  const p = ensurePantheonState(entity, { nowMinutes });
  if (!p) return null;
  const refMin = nowMinutes ?? entity.apotheosis.ascendedAtMinutes ?? 0;

  if (oldPortfolio && newPortfolio && oldPortfolio !== newPortfolio && !free) {
    for (const d of PANTHEON_DEITIES) {
      if ((d.portfolioAffinity[oldPortfolio] ?? 0) >= 25 && (d.portfolioAffinity[newPortfolio] ?? 0) < 25) {
        const entry = p.deities[d.id];
        if (entry) {
          entry.personalHistory = clamp((entry.personalHistory || 0) - 20, -140, 140);
        }
      }
    }
    pushChronicle(p, {
      day: dayFromMinutes(refMin),
      minutes: refMin,
      category: 'diplomacy',
      text: t(
        'apotheosis.pantheon.logRealign',
        'Portfolio realigned from {old} to {next}: patrons of your former domain resent your apostasy (-20).',
        { old: oldPortfolio, next: newPortfolio },
      ),
    });
  }

  p.initializedPortfolio = newPortfolio;
  for (const d of PANTHEON_DEITIES) {
    const entry = p.deities[d.id];
    if (!entry) continue;
    entry.relation = clamp((entry.personalHistory || 0) + (d.portfolioAffinity[newPortfolio] ?? 0), -100, 100);
    entry.status = computeStatusFromEntry(entry, entry.relation, refMin);
  }
  return p;
}

/** Checks remaining 30-day Grace Period state for a given deity. */
export function getDeityGraceInfo(entity, godId, nowMinutes = null) {
  const p = ensurePantheonState(entity, { nowMinutes });
  const entry = p?.deities?.[godId];
  if (!entry || entry.graceUntilMinutes == null) return { active: false, remainingDays: 0 };
  const ref = nowMinutes ?? entity?.apotheosis?.ascendedAtMinutes ?? 0;
  const remMin = entry.graceUntilMinutes - ref;
  if (remMin <= 0) return { active: false, remainingDays: 0 };
  return { active: true, remainingDays: Math.max(1, Math.ceil(remMin / 1440)) };
}

/**
 * Mutates relation with `godId`, enforcing doubled Grace Period penalties (`x2` + breaks Grace),
 * world hostility scaling, and ally (`+50%`) / enemy (`-25%`) propagation.
 */
export function changeDeityRelation(entity, godId, delta, {
  propagate = true,
  nowMinutes = null,
  reason = '',
  category = 'diplomacy',
} = {}) {
  const deity = getPantheonDeity(godId);
  if (!deity || !entity?.apotheosis) return { ok: false, error: 'Unknown deity.' };
  const p = ensurePantheonState(entity, { nowMinutes });
  const entry = p.deities[deity.id];
  const refMin = nowMinutes ?? entity.apotheosis.ascendedAtMinutes ?? 0;
  const portfolio = entity.apotheosis.portfolio || 'war';

  let rawDelta = Math.trunc(Number(delta) || 0);
  if (rawDelta === 0) return { ok: true, deityId: deity.id, deltaApplied: 0, relation: entry.relation, status: entry.status };

  let brokeGrace = false;
  if (rawDelta < 0 && entry.graceUntilMinutes != null && refMin < entry.graceUntilMinutes) {
    rawDelta *= 2;
    entry.graceUntilMinutes = null;
    brokeGrace = true;
  } else if (rawDelta < 0 && Math.abs(rawDelta) >= 8) {
    const hMult = getApotheosisWorldHostilityMultiplier();
    if (hMult !== 1) rawDelta = Math.trunc(Math.round(rawDelta * hMult));
  }

  const beforeRel = entry.relation;
  entry.personalHistory = clamp((entry.personalHistory || 0) + rawDelta, -140, 140);
  entry.relation = clamp(entry.personalHistory + (deity.portfolioAffinity[portfolio] ?? 0), -100, 100);
  entry.status = computeStatusFromEntry(entry, entry.relation, refMin);

  if (brokeGrace) {
    pushChronicle(p, {
      day: dayFromMinutes(refMin),
      minutes: refMin,
      category: 'against_me',
      godId: deity.id,
      text: t(
        'apotheosis.pantheon.logGraceBroken',
        '{name} revokes your 30-day Grace Period after your offense ({delta} relation)!',
        { name: deity.name, delta: rawDelta },
      ),
    });
  } else if (reason) {
    pushChronicle(p, {
      day: dayFromMinutes(refMin),
      minutes: refMin,
      category,
      godId: deity.id,
      text: reason,
    });
  }

  const propagated = [];
  if (propagate) {
    const allyDelta = Math.trunc(rawDelta * 0.5);
    if (allyDelta !== 0) {
      for (const allyId of deity.allies) {
        const allyDef = getPantheonDeity(allyId);
        const allyEntry = p.deities[allyId];
        if (!allyDef || !allyEntry) continue;
        allyEntry.personalHistory = clamp((allyEntry.personalHistory || 0) + allyDelta, -140, 140);
        allyEntry.relation = clamp(allyEntry.personalHistory + (allyDef.portfolioAffinity[portfolio] ?? 0), -100, 100);
        allyEntry.status = computeStatusFromEntry(allyEntry, allyEntry.relation, refMin);
        propagated.push({ id: allyId, delta: allyDelta });
      }
    }
    const enemyDelta = Math.trunc(-rawDelta * 0.25);
    if (enemyDelta !== 0) {
      for (const enemyId of deity.enemies) {
        const enemyDef = getPantheonDeity(enemyId);
        const enemyEntry = p.deities[enemyId];
        if (!enemyDef || !enemyEntry) continue;
        enemyEntry.personalHistory = clamp((enemyEntry.personalHistory || 0) + enemyDelta, -140, 140);
        enemyEntry.relation = clamp(enemyEntry.personalHistory + (enemyDef.portfolioAffinity[portfolio] ?? 0), -100, 100);
        enemyEntry.status = computeStatusFromEntry(enemyEntry, enemyEntry.relation, refMin);
        propagated.push({ id: enemyId, delta: enemyDelta });
      }
    }
  }

  return {
    ok: true,
    deityId: deity.id,
    beforeRelation: beforeRel,
    deltaApplied: rawDelta,
    relation: entry.relation,
    status: entry.status,
    brokeGrace,
    propagated,
  };
}

// ── 71-REGION TAMRIEL INFLUENCE SYSTEM ────────────────────────────────────────

/** Returns influence shares (`sum = 100`), leading holder, and player's cult share for `regionIndex` (`0..70`). */
export function getRegionInfluence(entity, regionIndex) {
  const idx = clamp(Math.trunc(Number(regionIndex) || 0), 0, TAMRIEL_REGION_COUNT - 1);
  const p = ensurePantheonState(entity);
  const shares = p?.regionInfluence?.[idx] ?? { akatosh: 100 };
  const sorted = Object.entries(shares)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const [leaderId = 'akatosh', leaderShare = 100] = sorted[0] ?? [];
  return {
    regionIndex: idx,
    regionName: getLocalizedRegionName(idx, (i) => REGION_NAMES[i] ?? `Region ${i}`),
    isProvince: isProvinceRegion(idx),
    shares: { ...shares },
    sorted,
    leaderId,
    leaderShare,
    playerShare: round1(shares.player ?? 0),
  };
}

/** Shifts `holderId` (`'player'` or `godId`) by `deltaShare` inside `regionIndex` (`0..70`) and normalizes to 100%. */
export function shiftRegionInfluence(entity, regionIndex, holderId, deltaShare) {
  const idx = clamp(Math.trunc(Number(regionIndex) || 0), 0, TAMRIEL_REGION_COUNT - 1);
  const p = ensurePantheonState(entity);
  if (!p) return null;
  const shares = p.regionInfluence[idx];
  const cur = Number(shares[holderId] ?? 0);
  const target = clamp(round1(cur + (Number(deltaShare) || 0)), 0, 100);
  return setRegionInfluenceShare(entity, idx, holderId, target);
}

/** Explicitly sets `holderId`'s share (`0..100`) in `regionIndex` and rescales all other cults to preserve `sum === 100`. */
export function setRegionInfluenceShare(entity, regionIndex, holderId, targetShare) {
  const idx = clamp(Math.trunc(Number(regionIndex) || 0), 0, TAMRIEL_REGION_COUNT - 1);
  const p = ensurePantheonState(entity);
  if (!p) return null;
  const shares = p.regionInfluence[idx];
  const clampedTarget = round1(clamp(Number(targetShare) || 0, 0, 100));
  const otherKeys = Object.keys(shares).filter((k) => k !== holderId && (shares[k] ?? 0) > 0);
  const otherTotal = otherKeys.reduce((acc, k) => acc + (shares[k] || 0), 0);
  const remaining = round1(100 - clampedTarget);

  if (otherKeys.length === 0 || otherTotal <= 0) {
    if (remaining > 0) {
      const patron = resolveRegionPatronDeityId(idx, entity?.factionRep?.dict ?? null);
      const fallback = patron === holderId ? 'akatosh' : patron;
      shares[fallback] = remaining;
    }
  } else {
    for (const k of otherKeys) {
      shares[k] = round1((shares[k] / otherTotal) * remaining);
    }
  }
  shares[holderId] = clampedTarget;
  normalizeShareMap(shares);
  return getRegionInfluence(entity, idx);
}

/** Summarizes global average influence and count of dominated regions across all 71 Tamriel regions. */
export function getGlobalInfluenceSummary(entity) {
  const p = ensurePantheonState(entity);
  const totals = { player: 0 };
  const dominatedCounts = { player: 0 };
  for (const d of PANTHEON_DEITIES) {
    totals[d.id] = 0;
    dominatedCounts[d.id] = 0;
  }
  if (!p) return { regionCount: TAMRIEL_REGION_COUNT, avgShares: totals, dominatedCounts };

  for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
    const shares = p.regionInfluence[r] ?? {};
    let bestId = 'akatosh';
    let bestVal = -1;
    for (const [k, val] of Object.entries(shares)) {
      totals[k] = (totals[k] || 0) + val;
      if (val > bestVal) {
        bestVal = val;
        bestId = k;
      }
    }
    dominatedCounts[bestId] = (dominatedCounts[bestId] || 0) + 1;
  }

  const avgShares = {};
  for (const [k, sum] of Object.entries(totals)) {
    avgShares[k] = round1(sum / TAMRIEL_REGION_COUNT);
  }
  return {
    regionCount: TAMRIEL_REGION_COUNT,
    avgShares,
    dominatedCounts,
  };
}

// ── WORLD SIM 26 REGION_FLAGS -> REGIONAL INFLUENCE SHIFTS ────────────────────

const CONDITION_INFLUENCE_TABLE = Object.freeze([
  { flag: REGION_FLAGS.WarBeginning, deities: ['mehrunes_dagon', 'boethiah'], delta: 0.7, portfolio: 'war' },
  { flag: REGION_FLAGS.WarOngoing, deities: ['mehrunes_dagon', 'boethiah', 'kynareth'], delta: 0.9, portfolio: 'war' },
  { flag: REGION_FLAGS.WarWon, deities: ['akatosh', 'stendarr'], delta: 0.8, portfolio: 'order' },
  { flag: REGION_FLAGS.WarLost, deities: ['molag_bal', 'mehrunes_dagon'], delta: 0.6, portfolio: 'war' },
  { flag: REGION_FLAGS.PlagueBeginning, deities: ['molag_bal', 'arkay'], delta: 0.6, portfolio: null },
  { flag: REGION_FLAGS.PlagueOngoing, deities: ['molag_bal', 'arkay'], delta: 0.8, portfolio: null },
  { flag: REGION_FLAGS.PlagueEnding, deities: ['mara', 'stendarr'], delta: 0.8, portfolio: 'order' },
  { flag: REGION_FLAGS.FamineBeginning, deities: ['molag_bal'], delta: 0.5, portfolio: null },
  { flag: REGION_FLAGS.FamineOngoing, deities: ['molag_bal', 'mehrunes_dagon'], delta: 0.7, portfolio: null },
  { flag: REGION_FLAGS.FamineEnding, deities: ['kynareth', 'mara', 'zenithar'], delta: 0.7, portfolio: 'order' },
  { flag: REGION_FLAGS.WitchBurnings, deities: ['stendarr', 'hermaeus_mora'], delta: 0.6, portfolio: 'magic' },
  { flag: REGION_FLAGS.CrimeWave, deities: ['nocturnal', 'mephala'], delta: 0.9, portfolio: 'shadows' },
  { flag: REGION_FLAGS.NewRuler, deities: ['akatosh', 'boethiah'], delta: 0.5, portfolio: 'order' },
  { flag: REGION_FLAGS.BadHarvest, deities: ['kynareth', 'molag_bal'], delta: 0.5, portfolio: null },
  { flag: REGION_FLAGS.TGMInJail, deities: ['stendarr', 'julianos'], delta: 0.5, portfolio: 'order' },
  { flag: REGION_FLAGS.TGMSetFree, deities: ['nocturnal', 'mephala'], delta: 0.7, portfolio: 'shadows' },
  { flag: REGION_FLAGS.TGMExecuted, deities: ['stendarr', 'arkay'], delta: 0.6, portfolio: 'order' },
  { flag: REGION_FLAGS.NewTGM, deities: ['nocturnal', 'mephala'], delta: 0.8, portfolio: 'shadows' },
  { flag: REGION_FLAGS.PersecutedTemple, deities: ['azura', 'mehrunes_dagon'], delta: 0.7, portfolio: null },
  { flag: REGION_FLAGS.PricesHigh, deities: ['mephala', 'molag_bal'], delta: 0.5, portfolio: 'shadows' },
  { flag: REGION_FLAGS.PricesLow, deities: ['zenithar', 'mara'], delta: 0.6, portfolio: 'order' },
  { flag: REGION_FLAGS.HappyHoliday, deities: ['dibella', 'mara'], delta: 0.6, portfolio: 'order' },
  { flag: REGION_FLAGS.ScaryHoliday, deities: ['sheogorath', 'nocturnal'], delta: 0.6, portfolio: 'shadows' },
  { flag: REGION_FLAGS.HolyHoliday, deities: ['akatosh', 'stendarr', 'julianos', 'arkay'], delta: 0.6, portfolio: 'order' },
  { flag: REGION_FLAGS.MadWizardNearby, deities: ['julianos', 'hermaeus_mora', 'sheogorath'], delta: 0.8, portfolio: 'magic' },
  { flag: REGION_FLAGS.MadWizardDies, deities: ['stendarr', 'julianos'], delta: 0.6, portfolio: 'magic' },
]);

/** Applies World Sim shifts across all 26 `REGION_FLAGS` in `regionIndex`. Returns applied rule count. */
export function applyRegionConditionInfluenceShifts(entity, regionIndex) {
  const store = entity?.regionConditions;
  if (!Array.isArray(store) || !store[regionIndex]) return 0;
  let hits = 0;
  const portfolio = entity?.apotheosis?.portfolio;
  const pShares = ensurePantheonState(entity)?.regionInfluence?.[regionIndex];
  const hasPlayerPresence = (pShares?.player ?? 0) >= 1;

  for (const rule of CONDITION_INFLUENCE_TABLE) {
    if (!conditionFlag(store, regionIndex, rule.flag)) continue;
    hits++;
    for (const deityId of rule.deities) {
      shiftRegionInfluence(entity, regionIndex, deityId, rule.delta);
    }
    if (rule.portfolio && rule.portfolio === portfolio && hasPlayerPresence) {
      shiftRegionInfluence(entity, regionIndex, 'player', rule.delta * 0.6);
    }
  }
  return hits;
}

// ── DAILY PANTHEON AI TURN (1 MOVE / GOD / TICK) ──────────────────────────────

function pickDeityTargetRegion(entity, god, rng) {
  const p = entity.apotheosis.pantheon;
  if (god.kind === 'daedra' && Array.isArray(entity.regionConditions)) {
    const crisisRegs = [];
    for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
      if (
        conditionFlag(entity.regionConditions, r, REGION_FLAGS.WarOngoing) ||
        conditionFlag(entity.regionConditions, r, REGION_FLAGS.CrimeWave) ||
        conditionFlag(entity.regionConditions, r, REGION_FLAGS.PlagueOngoing)
      ) {
        crisisRegs.push(r);
      }
    }
    if (crisisRegs.length > 0 && rng() < 0.65) {
      return crisisRegs[Math.floor(rng() * crisisRegs.length) % crisisRegs.length];
    }
  }
  if ((p.deities[god.id]?.status === 'war' || p.deities[god.id]?.status === 'hostile')) {
    const playerRegs = [];
    for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
      if ((p.regionInfluence[r]?.player ?? 0) >= 5) playerRegs.push(r);
    }
    if (playerRegs.length > 0 && rng() < 0.7) {
      return playerRegs[Math.floor(rng() * playerRegs.length) % playerRegs.length];
    }
  }
  return Math.floor(rng() * TAMRIEL_REGION_COUNT) % TAMRIEL_REGION_COUNT;
}

/**
 * Runs daily Pantheon simulation (`worldTick.runDayChange` via `tickApotheosisMythicDecay`):
 * 1) Applies all 26 `REGION_FLAGS` shifts in every region;
 * 2) Gives each of the 16 deities at most 1 global strategic move per day (`apotheosisPantheonActivity`).
 */
export function tickPantheonDay(entity, nowMinutes = 0, { daysOverride = null, rng = Math.random } = {}) {
  if (!entity || !isAscendedGod(entity)) return { daysProcessed: 0, aiMoves: 0 };
  const p = ensurePantheonState(entity, { nowMinutes });
  if (!p) return { daysProcessed: 0, aiMoves: 0 };

  const currentDay = dayFromMinutes(nowMinutes);
  let daysToRun = 0;
  if (daysOverride != null) {
    daysToRun = clamp(Math.trunc(Number(daysOverride) || 0), 0, 30);
  } else {
    const prev = p.lastPantheonTickDay ?? currentDay;
    daysToRun = clamp(currentDay - prev, 0, 30);
    p.lastPantheonTickDay = currentDay;
  }
  if (daysToRun <= 0) return { daysProcessed: 0, aiMoves: 0 };

  const actMult = getApotheosisPantheonActivityMultiplier();
  const hostMult = getApotheosisWorldHostilityMultiplier();
  let aiMoves = 0;

  for (let step = 0; step < daysToRun; step++) {
    const simDay = daysOverride != null ? currentDay + step + 1 : currentDay - daysToRun + step + 1;
    const simMin = simDay * 1440;

    if (Array.isArray(entity.regionConditions)) {
      for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
        applyRegionConditionInfluenceShifts(entity, r);
      }
    }

    for (const d of PANTHEON_DEITIES) {
      const entry = p.deities[d.id];
      if (!entry) continue;
      entry.status = computeStatusFromEntry(entry, entry.relation, simMin);
      const chance = clamp(0.35 * actMult, 0.05, 0.95);
      if (rng() >= chance) continue;

      aiMoves++;
      const regIdx = pickDeityTargetRegion(entity, d, rng);
      const regName = getLocalizedRegionName(regIdx, (i) => REGION_NAMES[i] ?? `Region ${i}`);
      const graceActive = entry.graceUntilMinutes != null && simMin < entry.graceUntilMinutes;
      const playerShare = p.regionInfluence[regIdx]?.player ?? 0;

      // 1 global strategic move per deity per tick:
      if (!graceActive && (entry.status === 'war' || entry.status === 'hostile') && playerShare >= 2) {
        const pressure = round1(Math.min(playerShare, (1.5 + rng() * 1.5) * hostMult));
        shiftRegionInfluence(entity, regIdx, 'player', -pressure);
        shiftRegionInfluence(entity, regIdx, d.id, pressure);
        pushChronicle(p, {
          day: simDay,
          minutes: simMin,
          category: 'against_me',
          godId: d.id,
          regionIndex: regIdx,
          text: t(
            'apotheosis.pantheon.aiPressure',
            '{name} incites zealous opposition in {region}, eroding your cult (-{pct}%).',
            { name: d.name, region: regName, pct: pressure },
          ),
        });
      } else if (entry.status === 'allied' && rng() < 0.45) {
        const aid = 1.5;
        shiftRegionInfluence(entity, regIdx, 'player', aid);
        pushChronicle(p, {
          day: simDay,
          minutes: simMin,
          category: 'my_cult',
          godId: d.id,
          regionIndex: regIdx,
          text: t(
            'apotheosis.pantheon.aiAid',
            'Your ally {name} blesses joint shrines in {region}, lifting your standing (+{pct}%).',
            { name: d.name, region: regName, pct: aid },
          ),
        });
      } else if (d.enemies.length > 0 && rng() < 0.3) {
        const foeId = d.enemies[Math.floor(rng() * d.enemies.length) % d.enemies.length];
        const foeDef = getPantheonDeity(foeId);
        const k = pairKey(d.id, foeId);
        p.interGodRelations[k] = clamp((p.interGodRelations[k] ?? -50) - 5, -100, 100);
        shiftRegionInfluence(entity, regIdx, d.id, 1.5);
        if (foeDef) {
          pushChronicle(p, {
            day: simDay,
            minutes: simMin,
            category: 'diplomacy',
            godId: d.id,
            regionIndex: regIdx,
            text: t(
              'apotheosis.pantheon.aiClash',
              '{name} and {foe} clash in {region} over mortal devotion.',
              { name: d.name, foe: foeDef.name, region: regName },
            ),
          });
        }
      } else {
        shiftRegionInfluence(entity, regIdx, d.id, 1.8);
        pushChronicle(p, {
          day: simDay,
          minutes: simMin,
          category: 'regions',
          godId: d.id,
          regionIndex: regIdx,
          text: t(
            'apotheosis.pantheon.aiExpand',
            '{name} dispatches emissaries across {region} (+1.8% influence).',
            { name: d.name, region: regName },
          ),
        });
      }
    }
  }

  return { daysProcessed: daysToRun, aiMoves };
}

// ── DIPLOMATIC DECREES & DYNAMIC TRUCE COST ──────────────────────────────────

/** Computes dynamic Faith cost to conclude a Divine Truce from power balance, warscore, and hostility. */
export function computeDivineTruceCost(entity, godId) {
  const deity = getPantheonDeity(godId);
  const p = ensurePantheonState(entity);
  if (!deity || !p) return 500;
  const entry = p.deities[deity.id];
  if (!entry) return 500;
  if ((entry.championsDefeated ?? 0) >= 3) return 0;

  const summary = getGlobalInfluenceSummary(entity);
  const godPower = Math.max(1, summary.avgShares[deity.id] ?? 5);
  const playerPower = Math.max(5, summary.avgShares.player ?? 1);
  const powerRatio = clamp(godPower / playerPower, 0.35, 3.0);
  const hostilityDepth = clamp(Math.abs(Math.min(0, entry.relation)) / 50, 0.6, 2.0);
  const warscoreFactor = clamp(1 - (entry.warscore ?? 0) * 0.12 - (entry.championsDefeated ?? 0) * 0.25, 0.25, 1.4);
  const raw = Math.round(350 * powerRatio * hostilityDepth * warscoreFactor);
  return clamp(raw, 100, 1500);
}

/** Sends a respectful Divine Offering (`100 Faith`) -> `+15` relation (once every 7 days per deity). */
export function sendDivineOffering(entity, godId, { nowMinutes = null } = {}) {
  const deity = getPantheonDeity(godId);
  if (!deity) return { ok: false, error: t('apotheosis.pantheon.errUnknown', 'Unknown deity.') };
  const p = ensurePantheonState(entity, { nowMinutes });
  const entry = p?.deities?.[deity.id];
  if (!entry) return { ok: false, error: 'Pantheon unavailable.' };
  const refMin = nowMinutes ?? entity.apotheosis?.ascendedAtMinutes ?? 0;
  const curDay = dayFromMinutes(refMin);
  if (entry.lastOfferingDay != null && curDay - entry.lastOfferingDay < 7) {
    return {
      ok: false,
      error: t('apotheosis.pantheon.errOfferingCd', 'You already sent an offering to {name} within the last 7 days.', { name: deity.name }),
    };
  }
  const spend = spendApotheosisFaith(entity, PANTHEON_OFFERING_COST, { reason: `pantheon_offer_${deity.id}` });
  if (!spend.ok) return spend;
  entry.lastOfferingDay = curDay;
  const rel = changeDeityRelation(entity, deity.id, 15, {
    nowMinutes: refMin,
    category: 'diplomacy',
    reason: t('apotheosis.pantheon.logOffer', 'Sent a Divine Offering to {name} (+15 relation).', { name: deity.name }),
  });
  return { ok: true, deityId: deity.id, faithSpent: PANTHEON_OFFERING_COST, faith: spend.faith, relation: rel.relation, status: rel.status };
}

/** Proposes a Non-Aggression Pact (`150 Faith`, requires `relation >= 10`). */
export function proposeDivinePact(entity, godId, { nowMinutes = null } = {}) {
  const deity = getPantheonDeity(godId);
  if (!deity) return { ok: false, error: t('apotheosis.pantheon.errUnknown', 'Unknown deity.') };
  const p = ensurePantheonState(entity, { nowMinutes });
  const entry = p?.deities?.[deity.id];
  if (!entry) return { ok: false, error: 'Pantheon unavailable.' };
  if (entry.relation < 10) {
    return {
      ok: false,
      error: t('apotheosis.pantheon.errPactRep', '{name} requires at least +10 relation for a Non-Aggression Pact.', { name: deity.name }),
    };
  }
  const spend = spendApotheosisFaith(entity, PANTHEON_PACT_COST, { reason: `pantheon_pact_${deity.id}` });
  if (!spend.ok) return spend;
  const refMin = nowMinutes ?? entity.apotheosis?.ascendedAtMinutes ?? 0;
  entry.pact = true;
  entry.manualWar = false;
  entry.graceUntilMinutes = null;
  changeDeityRelation(entity, deity.id, 10, {
    nowMinutes: refMin,
    category: 'diplomacy',
    reason: t('apotheosis.pantheon.logPact', 'Signed a Non-Aggression Pact with {name}.', { name: deity.name }),
  });
  return { ok: true, deityId: deity.id, faithSpent: PANTHEON_PACT_COST, faith: spend.faith, relation: entry.relation, status: entry.status };
}

/** Forges a full Divine Alliance (`300 Faith`, requires `relation >= 50`). */
export function forgeDivineAlliance(entity, godId, { nowMinutes = null } = {}) {
  const deity = getPantheonDeity(godId);
  if (!deity) return { ok: false, error: t('apotheosis.pantheon.errUnknown', 'Unknown deity.') };
  const p = ensurePantheonState(entity, { nowMinutes });
  const entry = p?.deities?.[deity.id];
  if (!entry) return { ok: false, error: 'Pantheon unavailable.' };
  if (entry.relation < 50) {
    return {
      ok: false,
      error: t('apotheosis.pantheon.errAllyRep', '{name} requires at least +50 relation for a Divine Alliance.', { name: deity.name }),
    };
  }
  const spend = spendApotheosisFaith(entity, PANTHEON_ALLIANCE_COST, { reason: `pantheon_ally_${deity.id}` });
  if (!spend.ok) return spend;
  const refMin = nowMinutes ?? entity.apotheosis?.ascendedAtMinutes ?? 0;
  entry.pact = true;
  entry.allied = true;
  entry.manualWar = false;
  changeDeityRelation(entity, deity.id, 15, {
    nowMinutes: refMin,
    category: 'diplomacy',
    reason: t('apotheosis.pantheon.logAlly', 'Forged a Divine Alliance with {name}!', { name: deity.name }),
  });
  return { ok: true, deityId: deity.id, faithSpent: PANTHEON_ALLIANCE_COST, faith: spend.faith, relation: entry.relation, status: entry.status };
}

/** Sows Discord between two deities (`200 Faith`), dropping their mutual standing so they spend AI turns fighting each other. */
export function sowDivineDiscord(entity, godIdA, godIdB, { nowMinutes = null } = {}) {
  const defA = getPantheonDeity(godIdA);
  const defB = getPantheonDeity(godIdB);
  if (!defA || !defB || defA.id === defB.id) {
    return { ok: false, error: t('apotheosis.pantheon.errDiscordPair', 'Select two distinct deities to sow discord between.') };
  }
  const p = ensurePantheonState(entity, { nowMinutes });
  const spend = spendApotheosisFaith(entity, PANTHEON_DISCORD_COST, { reason: `pantheon_discord_${defA.id}_${defB.id}` });
  if (!spend.ok) return spend;
  const refMin = nowMinutes ?? entity.apotheosis?.ascendedAtMinutes ?? 0;
  const k = pairKey(defA.id, defB.id);
  p.interGodRelations[k] = clamp((p.interGodRelations[k] ?? 0) - 50, -100, 100);
  pushChronicle(p, {
    day: dayFromMinutes(refMin),
    minutes: refMin,
    category: 'diplomacy',
    godId: defA.id,
    text: t(
      'apotheosis.pantheon.logDiscord',
      'Whispered lies between {a} and {b} (mutual standing {val}).',
      { a: defA.name, b: defB.name, val: p.interGodRelations[k] },
    ),
  });
  return {
    ok: true,
    pair: [defA.id, defB.id],
    interRelation: p.interGodRelations[k],
    faithSpent: PANTHEON_DISCORD_COST,
    faith: spend.faith,
  };
}

/** Declares Holy War (`100 Faith`), dropping standing by -40 (propagated) and unlocking forceful claims. */
export function declareHolyWar(entity, godId, { nowMinutes = null } = {}) {
  const deity = getPantheonDeity(godId);
  if (!deity) return { ok: false, error: t('apotheosis.pantheon.errUnknown', 'Unknown deity.') };
  const p = ensurePantheonState(entity, { nowMinutes });
  const entry = p?.deities?.[deity.id];
  if (!entry) return { ok: false, error: 'Pantheon unavailable.' };
  const spend = spendApotheosisFaith(entity, PANTHEON_WAR_COST, { reason: `pantheon_war_${deity.id}` });
  if (!spend.ok) return spend;
  const refMin = nowMinutes ?? entity.apotheosis?.ascendedAtMinutes ?? 0;
  entry.pact = false;
  entry.allied = false;
  entry.truceUntilMinutes = null;
  entry.manualWar = true;
  entry.graceUntilMinutes = null;
  changeDeityRelation(entity, deity.id, -40, {
    nowMinutes: refMin,
    category: 'against_me',
    reason: t('apotheosis.pantheon.logWar', 'Declared Holy War upon {name}!', { name: deity.name }),
  });
  entry.status = 'war';
  return { ok: true, deityId: deity.id, faithSpent: PANTHEON_WAR_COST, faith: spend.faith, relation: entry.relation, status: entry.status };
}

/** Offers a 30-day Divine Truce (cost calculated dynamically via `computeDivineTruceCost`, or free after defeating 3 Champions). */
export function offerDivineTruce(entity, godId, { nowMinutes = null, byForce = false } = {}) {
  const deity = getPantheonDeity(godId);
  if (!deity) return { ok: false, error: t('apotheosis.pantheon.errUnknown', 'Unknown deity.') };
  const p = ensurePantheonState(entity, { nowMinutes });
  const entry = p?.deities?.[deity.id];
  if (!entry) return { ok: false, error: 'Pantheon unavailable.' };

  const freeByVictory = byForce || (entry.championsDefeated ?? 0) >= 3;
  const cost = freeByVictory ? 0 : computeDivineTruceCost(entity, deity.id);
  const spend = cost > 0
    ? spendApotheosisFaith(entity, cost, { reason: `pantheon_truce_${deity.id}` })
    : { ok: true, spent: 0, faith: entity.apotheosis.faith };
  if (!spend.ok) return spend;

  const refMin = nowMinutes ?? entity.apotheosis?.ascendedAtMinutes ?? 0;
  entry.manualWar = false;
  entry.championsDefeated = 0;
  entry.truceUntilMinutes = refMin + APOTHEOSIS_TRUCE_MINUTES;
  if (entry.relation <= -60) {
    entry.personalHistory = clamp(entry.personalHistory + 25, -140, 140);
    entry.relation = clamp(entry.personalHistory + (deity.portfolioAffinity[entity.apotheosis.portfolio] ?? 0), -100, 100);
  }
  entry.status = computeStatusFromEntry(entry, entry.relation, refMin);

  pushChronicle(p, {
    day: dayFromMinutes(refMin),
    minutes: refMin,
    category: 'diplomacy',
    godId: deity.id,
    text: freeByVictory
      ? t('apotheosis.pantheon.logTruceForce', 'Forced a 30-day Divine Truce upon {name} through martial supremacy!', { name: deity.name })
      : t('apotheosis.pantheon.logTrucePaid', 'Sealed a 30-day Divine Truce with {name} (-{cost} Faith).', { name: deity.name, cost }),
  });

  return {
    ok: true,
    deityId: deity.id,
    faithSpent: cost,
    faith: spend.faith,
    relation: entry.relation,
    status: entry.status,
    truceUntilMinutes: entry.truceUntilMinutes,
  };
}

// ── TARGETED DIVINE GEOPOLITICS (WAR & PEACE BETWEEN TWO REGIONS) ─────────────

function findProvinceFactionId(dict, regionIndex) {
  if (!(dict instanceof Map)) return -1;
  if (isProvinceRegion(regionIndex)) {
    const pid = provinceFactionId('province', regionIndex);
    if (dict.has(pid)) return pid;
  }
  for (const [id, f] of dict) {
    if (f && f.region === regionIndex && f.type === FACTION_TYPES.Province) return id;
  }
  return -1;
}

/**
 * Targeted geopolitical decree: ignites war between `regionA` and `regionB` (`350 Faith`),
 * setting `WarOngoing` in both regions and wiring faction hostility when `factionRep.dict` exists.
 */
export function igniteRegionWar(entity, regionA, regionB, { nowMinutes = null } = {}) {
  const rA = Math.trunc(Number(regionA));
  const rB = Math.trunc(Number(regionB));
  if (
    !Number.isInteger(rA) || !Number.isInteger(rB) ||
    rA < 0 || rA >= TAMRIEL_REGION_COUNT || rB < 0 || rB >= TAMRIEL_REGION_COUNT || rA === rB
  ) {
    return { ok: false, error: t('apotheosis.geo.errRegions', 'Select two distinct Tamriel regions.') };
  }
  const spend = spendApotheosisFaith(entity, GEOPOLITICS_WAR_COST, { reason: `geo_war_${rA}_${rB}` });
  if (!spend.ok) return spend;

  const p = ensurePantheonState(entity, { nowMinutes });
  if (!Array.isArray(entity.regionConditions)) entity.regionConditions = createRegionConditions(TAMRIEL_REGION_COUNT);
  turnOnConditionFlag(entity.regionConditions, rA, REGION_FLAGS.WarOngoing);
  turnOnConditionFlag(entity.regionConditions, rB, REGION_FLAGS.WarOngoing);

  const dict = entity?.factionRep?.dict;
  if (dict instanceof Map) {
    const fA = findProvinceFactionId(dict, rA);
    const fB = findProvinceFactionId(dict, rB);
    if (fA > 0 && fB > 0) startFactionEnemies(dict, fA, 0, fB);
  }

  for (const reg of [rA, rB]) {
    shiftRegionInfluence(entity, reg, 'mehrunes_dagon', 3);
    shiftRegionInfluence(entity, reg, 'boethiah', 2);
    if (entity.apotheosis?.portfolio === 'war' || entity.apotheosis?.portfolio === 'shadows') {
      shiftRegionInfluence(entity, reg, 'player', 4);
    }
  }

  const refMin = nowMinutes ?? entity.apotheosis?.ascendedAtMinutes ?? 0;
  const nameA = getLocalizedRegionName(rA, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const nameB = getLocalizedRegionName(rB, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  pushChronicle(p, {
    day: dayFromMinutes(refMin),
    minutes: refMin,
    category: 'regions',
    regionIndex: rA,
    text: t(
      'apotheosis.geo.logWar',
      'Ignited Divine War between {a} and {b} (-{cost} Faith).',
      { a: nameA, b: nameB, cost: GEOPOLITICS_WAR_COST },
    ),
  });

  return { ok: true, action: 'war', regions: [rA, rB], faithSpent: GEOPOLITICS_WAR_COST, faith: spend.faith };
}

/**
 * Targeted geopolitical decree: enforces peace between `regionA` and `regionB` (`300 Faith`),
 * ending active war flags and faction hostility while boosting Order deities & player cult.
 */
export function enforceRegionPeace(entity, regionA, regionB, { nowMinutes = null } = {}) {
  const rA = Math.trunc(Number(regionA));
  const rB = Math.trunc(Number(regionB));
  if (
    !Number.isInteger(rA) || !Number.isInteger(rB) ||
    rA < 0 || rA >= TAMRIEL_REGION_COUNT || rB < 0 || rB >= TAMRIEL_REGION_COUNT || rA === rB
  ) {
    return { ok: false, error: t('apotheosis.geo.errRegions', 'Select two distinct Tamriel regions.') };
  }
  const spend = spendApotheosisFaith(entity, GEOPOLITICS_PEACE_COST, { reason: `geo_peace_${rA}_${rB}` });
  if (!spend.ok) return spend;

  const p = ensurePantheonState(entity, { nowMinutes });
  if (!Array.isArray(entity.regionConditions)) entity.regionConditions = createRegionConditions(TAMRIEL_REGION_COUNT);
  for (const reg of [rA, rB]) {
    turnOffConditionFlag(entity.regionConditions, reg, REGION_FLAGS.WarBeginning);
    turnOffConditionFlag(entity.regionConditions, reg, REGION_FLAGS.WarOngoing);
    turnOnConditionFlag(entity.regionConditions, reg, REGION_FLAGS.WarWon);
  }

  const dict = entity?.factionRep?.dict;
  if (dict instanceof Map) {
    const fA = findProvinceFactionId(dict, rA);
    const fB = findProvinceFactionId(dict, rB);
    if (fA > 0 && fB > 0) endFactionEnemies(dict, fA, fB);
  }

  for (const reg of [rA, rB]) {
    shiftRegionInfluence(entity, reg, 'akatosh', 2.5);
    shiftRegionInfluence(entity, reg, 'mara', 2.5);
    if (entity.apotheosis?.portfolio === 'order' || entity.apotheosis?.portfolio === 'magic') {
      shiftRegionInfluence(entity, reg, 'player', 4);
    }
  }

  const refMin = nowMinutes ?? entity.apotheosis?.ascendedAtMinutes ?? 0;
  const nameA = getLocalizedRegionName(rA, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const nameB = getLocalizedRegionName(rB, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  pushChronicle(p, {
    day: dayFromMinutes(refMin),
    minutes: refMin,
    category: 'regions',
    regionIndex: rA,
    text: t(
      'apotheosis.geo.logPeace',
      'Enforced Divine Peace between {a} and {b} (-{cost} Faith).',
      { a: nameA, b: nameB, cost: GEOPOLITICS_PEACE_COST },
    ),
  });

  return { ok: true, action: 'peace', regions: [rA, rB], faithSpent: GEOPOLITICS_PEACE_COST, faith: spend.faith };
}

/** Filters & searches the Pantheon Chronicle (`filter`: 'all'|'my_cult'|'against_me'|'diplomacy'|'regions'). */
export function queryPantheonChronicle(entity, { filter = 'all', search = '' } = {}) {
  const p = ensurePantheonState(entity);
  const rows = p?.chronicle ?? [];
  const q = String(search ?? '').trim().toLowerCase();
  return rows.filter((entry) => {
    if (filter && filter !== 'all' && entry.category !== filter) return false;
    if (!q) return true;
    const deityName = entry.godId ? (getPantheonDeity(entry.godId)?.name ?? entry.godId) : '';
    const regName = entry.regionIndex != null ? (REGION_NAMES[entry.regionIndex] ?? '') : '';
    const hay = `${entry.text ?? ''} ${deityName} ${regName}`.toLowerCase();
    return hay.includes(q);
  });
}

// Register daily Pantheon turn callback into Stage 2 Mythic Decay without creating an ESM import cycle.
setPantheonTickHook((entity, nowMinutes, opts) => tickPantheonDay(entity, nowMinutes, opts));
