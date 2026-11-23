// @ts-check
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getRegionState, CRISIS_TYPE, CRISIS_PHASE } from './regionState.js';
import { canonicalCapitalMapId } from '../../world/capitalLane.js';

export const SETTLEMENT_PROSPERITY_MIN = -5;
export const SETTLEMENT_PROSPERITY_MAX = 5;
export const SETTLEMENT_PROSPERITY_DECAY_DAYS = 7;

/** @type {Map<string, { delta: number, lastDay: number }>} */
export const settlementProsperityMap = new Map();

function normalizeMapKey(mapId) {
  if (mapId == null || mapId === '' || mapId === 0) return null;
  const canonical = canonicalCapitalMapId(mapId);
  const n = Number(canonical);
  if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
  return String(canonical);
}

/**
 * Returns the saved local prosperity modifier (`-5..+5`) for a settlement.
 * @param {number|string|null|undefined} mapId
 * @returns {number}
 */
export function getSettlementProsperityDelta(mapId) {
  const key = normalizeMapKey(mapId);
  if (!key) return 0;
  return settlementProsperityMap.get(key)?.delta ?? 0;
}

/**
 * Shifts a settlement's local prosperity modifier and returns the clamped result.
 * @param {number|string|null|undefined} mapId
 * @param {number} shift
 * @param {number} [currentDay=0]
 * @returns {{ previousDelta: number, newDelta: number, applied: number }}
 */
export function shiftSettlementProsperity(mapId, shift, currentDay = 0) {
  const key = normalizeMapKey(mapId);
  if (!key || !Number.isFinite(shift) || shift === 0) {
    return { previousDelta: 0, newDelta: 0, applied: 0 };
  }
  const prev = settlementProsperityMap.get(key)?.delta ?? 0;
  const next = Math.max(SETTLEMENT_PROSPERITY_MIN, Math.min(SETTLEMENT_PROSPERITY_MAX, prev + Math.trunc(shift)));
  const day = Number.isFinite(currentDay) ? Math.max(0, Math.floor(currentDay)) : 0;
  if (next === 0) {
    settlementProsperityMap.delete(key);
  } else {
    settlementProsperityMap.set(key, { delta: next, lastDay: day });
  }
  return { previousDelta: prev, newDelta: next, applied: next - prev };
}

/**
 * Explicitly sets a settlement's local prosperity modifier (`-5..+5`).
 * @param {number|string|null|undefined} mapId
 * @param {number} value
 * @param {number} [currentDay=0]
 * @returns {number}
 */
export function setSettlementProsperity(mapId, value, currentDay = 0) {
  const key = normalizeMapKey(mapId);
  if (!key || !Number.isFinite(value)) return 0;
  const clamped = Math.max(SETTLEMENT_PROSPERITY_MIN, Math.min(SETTLEMENT_PROSPERITY_MAX, Math.trunc(value)));
  const day = Number.isFinite(currentDay) ? Math.max(0, Math.floor(currentDay)) : 0;
  if (clamped === 0) {
    settlementProsperityMap.delete(key);
  } else {
    settlementProsperityMap.set(key, { delta: clamped, lastDay: day });
  }
  return clamped;
}

/** Clears all dynamic settlement prosperity overrides. */
export function clearSettlementProsperity() {
  settlementProsperityMap.clear();
}

/**
 * Decays stale settlement prosperity modifiers 1 step toward 0 every 7 game days.
 * @param {number} currentDay
 */
export function tickSettlementProsperityDecay(currentDay) {
  if (!Number.isFinite(currentDay)) return;
  const day = Math.floor(currentDay);
  for (const [key, rec] of settlementProsperityMap.entries()) {
    if (!rec || rec.delta === 0) {
      settlementProsperityMap.delete(key);
      continue;
    }
    if (day - rec.lastDay >= SETTLEMENT_PROSPERITY_DECAY_DAYS) {
      const nextDelta = rec.delta > 0 ? rec.delta - 1 : rec.delta + 1;
      if (nextDelta === 0) {
        settlementProsperityMap.delete(key);
      } else {
        settlementProsperityMap.set(key, { delta: nextDelta, lastDay: day });
      }
    }
  }
}

/** Returns a compact plain-object snapshot for save persistence. */
export function getSettlementProsperitySnapshot() {
  /** @type {Record<string, { delta: number, lastDay: number }>} */
  const out = {};
  for (const [key, rec] of settlementProsperityMap.entries()) {
    if (rec && rec.delta !== 0) {
      out[key] = { delta: rec.delta, lastDay: rec.lastDay };
    }
  }
  return out;
}

/** Restores dynamic settlement prosperity modifiers from save data. */
export function restoreSettlementProsperitySnapshot(snapshot) {
  settlementProsperityMap.clear();
  if (!snapshot || typeof snapshot !== 'object') return;
  for (const [key, raw] of Object.entries(snapshot)) {
    const delta = Number(raw?.delta);
    const lastDay = Number(raw?.lastDay) || 0;
    if (Number.isFinite(delta) && delta !== 0) {
      const clamped = Math.max(SETTLEMENT_PROSPERITY_MIN, Math.min(SETTLEMENT_PROSPERITY_MAX, Math.trunc(delta)));
      if (clamped !== 0) {
        settlementProsperityMap.set(String(key), { delta: clamped, lastDay: Math.max(0, Math.floor(lastDay)) });
      }
    }
  }
}

/**
 * Computes background quality penalty from active regional crises.
 * @param {number|null|undefined} regionIndex
 * @returns {number}
 */
export function getRegionProsperityShift(regionIndex) {
  if (Number(LivingTamrielConfig.political) === PRESENCE.OFF && Number(LivingTamrielConfig.urban) === PRESENCE.OFF) {
    return 0;
  }
  if (regionIndex == null || !Number.isInteger(regionIndex) || regionIndex < 0) return 0;
  const st = getRegionState(regionIndex);
  if (!st || st.crisis === CRISIS_TYPE.PEACE || st.phase === CRISIS_PHASE.NONE) return 0;
  if (st.crisis === CRISIS_TYPE.PLAGUE || st.crisis === CRISIS_TYPE.FAMINE) {
    return st.phase === CRISIS_PHASE.MID ? -2 : -1;
  }
  if (st.crisis === CRISIS_TYPE.WAR || st.crisis === CRISIS_TYPE.CIVIL_STRIFE) {
    return st.phase === CRISIS_PHASE.MID ? -1 : 0;
  }
  return 0;
}

/**
 * Returns combined regional crisis + local settlement prosperity quality shift.
 * @param {number|string|null|undefined} mapId
 * @param {number|null|undefined} regionIndex
 * @returns {number}
 */
export function getTotalSettlementProsperityShift(mapId, regionIndex) {
  if (Number(LivingTamrielConfig.political) === PRESENCE.OFF && Number(LivingTamrielConfig.urban) === PRESENCE.OFF) {
    return 0;
  }
  return getRegionProsperityShift(regionIndex) + getSettlementProsperityDelta(mapId);
}

/**
 * Computes effective shop quality (`1..20`) without mutating base building records.
 * Skips non-shops, player/guild buildings, and fixed-index merchant yards.
 * @param {number} baseQuality
 * @param {{ mapId?: number|string|null, regionIndex?: number|null, isShop?: boolean, priceIndex?: number|null }} [opts]
 * @returns {number}
 */
export function getEffectiveBuildingQuality(
  baseQuality,
  { mapId = null, regionIndex = null, isShop = true, priceIndex = null } = {},
) {
  const q = Number(baseQuality) || 0;
  if (q <= 0 || !isShop || Number.isFinite(priceIndex)) return q;
  const shift = getTotalSettlementProsperityShift(mapId, regionIndex);
  if (shift === 0) return q;
  return Math.max(1, Math.min(20, Math.round(q + shift)));
}
