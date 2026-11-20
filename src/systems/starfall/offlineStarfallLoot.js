// @ts-check
// Offline Starfall loot table, synced with offlineRelicLoot and lootCodex.
import { seededRng } from '../wind/wind.js';
import { spoilsBase, magicOrBetter } from '../gate/gateSpoils.js';
import { applyRarity, lastPass, techniquePass, stampWonWeapons } from '../loot/lootRarity.js';
import { STARSPUN_SET_PIECES, STARSPUN_SET_CHANCE, mintAetheric } from '../aetheric.js';
import { RAID_SPOILS_SOURCE } from '../raidSpoils.js';
import { starglass } from './starglass.js';
import { STAR_SPOILS_GOLD_PER_LEVEL } from './starSpoils.js';
import { foundDay } from '../loot/lootCodex.js';
import { t } from '../textManager.js';

/** Single-point configuration for offline Starfall rewards (easy to tune later). */
export const OFFLINE_STARFALL_LOOT_CONFIG = Object.freeze({
  goldPerLevel: STAR_SPOILS_GOLD_PER_LEVEL, // 60 * lv * (0.8..1.2), x2 for Heart-Star
  starglassMinLevel: 6, // matches offlineRelicLoot.js Lv 6+ currency threshold
  starglassMidMax: 2, // Lv 6..11: 1..2 Starfall Glass
  starglassHighMax: 3, // Lv 12+: 1..3 Starfall Glass
  starspunMinLevel: 12, // matches offlineRelicLoot.js Lv 12+ Aetheric Set threshold
  starspunChance: STARSPUN_SET_CHANCE, // normal star chance; Heart-Star is 100%
  unfoundBias: 0.7, // 70% bias toward unfound Codex pieces (matches offlineRelicLoot.js)
  heartMult: 2,
});

export const OFFLINE_STARFALL_LOOT_TEXT = Object.freeze({
  heldGold: (gold) => t('starfall.offline.spoilsGold', 'The fallen star yields {gold} gold and its spoils.', { gold }),
});

/**
 * Pick a Starspun Weave piece, favouring pieces not yet recorded in the Loot Codex.
 * @param {() => number} rolls
 * @param {boolean} always
 * @param {(id: string) => number | null} [isFound]
 */
export function rollOfflineStarspunPiece(rolls = Math.random, always = false, isFound = (id) => foundDay('aetheric', id)) {
  if (!always && !(rolls() < OFFLINE_STARFALL_LOOT_CONFIG.starspunChance)) return null;
  const pool = STARSPUN_SET_PIECES;
  if (!pool.length) return null;
  let pickFrom = pool;
  if (rolls() < OFFLINE_STARFALL_LOOT_CONFIG.unfoundBias || always) {
    const unfound = pool.filter((r) => isFound(r.id) == null);
    if (unfound.length) pickFrom = unfound;
  }
  const rec = pickFrom[Math.min(pickFrom.length - 1, Math.floor(rolls() * pickFrom.length))];
  return rec ? mintAetheric(rec, { party: 1 }) : null;
}

/**
 * Roll offline spoils for holding a fallen star.
 * @param {{ seed: number, level: number, heart?: boolean, isFound?: (id: string) => number | null }} o
 * @returns {{ gold: number, starglass: any | null, pieces: Array<{ item: any, tier: string }> }}
 */
export function rollOfflineStarSpoils({ seed, level, heart = false, isFound = (id) => foundDay('aetheric', id) }) {
  const cfg = OFFLINE_STARFALL_LOOT_CONFIG;
  const rolls = seededRng((seed >>> 0) || 1);
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  const mult = heart ? cfg.heartMult : 1;

  const gold = Math.round(cfg.goldPerLevel * lv * (0.8 + 0.4 * rolls())) * mult;

  let glass = null;
  if (lv >= cfg.starglassMinLevel) {
    const maxGlass = lv >= cfg.starspunMinLevel ? cfg.starglassHighMax : cfg.starglassMidMax;
    const count = (1 + Math.min(maxGlass - 1, Math.floor(rolls() * maxGlass))) * mult;
    glass = starglass(count);
  }

  const item = spoilsBase(lv, rolls);
  const tier = magicOrBetter(rolls, RAID_SPOILS_SOURCE);
  applyRarity(item, tier, rolls);
  item.isIdentified = true;
  const pieces = [{ item, tier: item.rarity ?? tier }];

  if (lv >= cfg.starspunMinLevel) {
    const setPiece = rollOfflineStarspunPiece(rolls, heart, isFound);
    if (setPiece) pieces.push({ item: setPiece, tier: setPiece.rarity ?? 'aetheric' });
  }

  lastPass([item], rolls);
  techniquePass([item], rolls);
  stampWonWeapons([item], 1, { rolls });

  return { gold, starglass: glass, pieces };
}

/**
 * Flatten rolled offline Starfall spoils into takeSpoil entries (pieces, starglass, gold).
 * @param {{ seed: number, level: number, heart?: boolean, isFound?: (id: string) => number | null }} o
 */
export function offlineStarSpoilsList(o) {
  const s = rollOfflineStarSpoils(o);
  /** @type {Array<{ kind: string, item?: any, gold?: number, tier: string }>} */
  const out = s.pieces.map((p) => ({ kind: 'item', item: p.item, tier: p.tier }));
  if (s.starglass) out.push({ kind: 'item', item: s.starglass, tier: 'common' });
  if (s.gold > 0) out.push({ kind: 'gold', gold: s.gold, tier: 'common' });
  return out;
}
