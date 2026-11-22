// @ts-check
import { walkTravelPath } from '../travel/travel.js';

/**
 * Finds a safe dry, unblocked pixel near the middle of a fast-travel route.
 * Never returns ocean or Ghostfence-blocked pixels.
 * @param {{ x: number, y: number }} start
 * @param {{ x: number, y: number }} end
 * @param {{ isWater?: (x: number, y: number) => boolean, isBlocked?: ((x: number, y: number) => boolean) | null }} [opts]
 * @returns {{ pixel: { x: number, y: number } | null, pathFraction: number, hasWater: boolean, allWater: boolean }}
 */
export function findSafeLandInterruptSpot(start, end, { isWater = () => false, isBlocked = null } = {}) {
  const path = walkTravelPath(start, end);
  const interior = path.length > 1 ? path.slice(0, path.length - 1) : [];
  if (interior.length === 0) {
    return { pixel: null, pathFraction: 0.5, hasWater: false, allWater: false };
  }

  let oceanCount = 0;
  for (let i = 0; i < interior.length; i++) {
    if (isWater(interior[i].x, interior[i].y)) oceanCount++;
  }

  const isSafe = (p) => !isWater(p.x, p.y) && !(isBlocked && isBlocked(p.x, p.y));
  const mid = Math.floor(interior.length / 2);

  for (let offset = 0; offset < interior.length; offset++) {
    const candidates = offset === 0 ? [mid] : [mid - offset, mid + offset];
    for (const idx of candidates) {
      if (idx < 0 || idx >= interior.length) continue;
      const p = interior[idx];
      if (isSafe(p)) {
        return {
          pixel: { x: p.x, y: p.y },
          pathFraction: (idx + 1) / path.length,
          hasWater: oceanCount > 0,
          allWater: oceanCount === interior.length,
        };
      }
    }
  }

  return {
    pixel: null,
    pathFraction: 0.5,
    hasWater: oceanCount > 0,
    allWater: oceanCount === interior.length,
  };
}

/**
 * Picks the highest-tension (or active-crisis) region along a journey for travel interruption evaluation.
 * @param {number[]} regionIndices
 * @param {(regionIndex: number) => { tension?: number, crisis?: string } | null | undefined} getState
 * @returns {number}
 */
export function selectInterruptRegion(regionIndices, getState) {
  const seen = new Set();
  let bestRegion = 0;
  let bestScore = -Infinity;

  for (const r of regionIndices) {
    if (!Number.isInteger(r) || r < 0 || seen.has(r)) continue;
    seen.add(r);
    const st = typeof getState === 'function' ? getState(r) : null;
    const tension = Number(st?.tension ?? 0);
    const crisisBonus = st?.crisis && st.crisis !== 'PEACE' ? 0.5 : 0;
    const score = tension + crisisBonus;
    if (score > bestScore) {
      bestScore = score;
      bestRegion = r;
    }
  }

  return bestScore === -Infinity ? (regionIndices[0] ?? 0) : bestRegion;
}

/**
 * Resolves where a fast-travel interruption actually lands the player.
 * Maritime/ship WEATHER_HAZARD lands at the destination harbor instead of dropping the player in deep ocean.
 * Non-weather interruptions require a safe dry spot and return null if none exists.
 * @param {{ eventType: string, spot: { pixel: { x: number, y: number } | null, pathFraction?: number } | null, destPixel: { x: number, y: number }, computedMinutes: number, sailingNow?: boolean, travelShip?: boolean }} params
 * @returns {{ x: number, y: number, minutes: number, landedAtDestination: boolean } | null}
 */
export function resolveInterruptLanding({
  eventType,
  spot,
  destPixel,
  computedMinutes,
  sailingNow = false,
  travelShip = false,
}) {
  if (eventType === 'WEATHER_HAZARD' && (sailingNow || travelShip || !spot?.pixel)) {
    return {
      x: destPixel.x,
      y: destPixel.y,
      minutes: computedMinutes,
      landedAtDestination: true,
    };
  }
  if (!spot?.pixel) return null;
  const frac = Math.max(0.2, Math.min(0.85, spot.pathFraction ?? 0.5));
  return {
    x: spot.pixel.x,
    y: spot.pixel.y,
    minutes: Math.max(30, Math.round(computedMinutes * frac)),
    landedAtDestination: false,
  };
}
