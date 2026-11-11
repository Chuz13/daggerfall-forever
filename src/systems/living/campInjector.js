// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// CAMP INJECTOR & TERRAIN SLOPE SNAPPING (Living Tamriel)
//
// Implements safe terrain slope validation and individual ground-snapping
// for spawned campsites, barricades, and outposts.
// ═══════════════════════════════════════════════════════════════════════════════

/** Maximum slope elevation delta in meters allowed across a compound camp footprint. */
export const MAX_CAMP_SLOPE_DELTA_METERS = 1.2;

/**
 * Validates whether a rectangular campsite footprint is flat enough for compound prop placement.
 * Samples the center and 4 corner points of the proposed bounding box.
 *
 * @param {(x: number, z: number) => number} heightSampler Function returning world height at (x, z)
 * @param {number} centerX World center X coordinate
 * @param {number} centerZ World center Z coordinate
 * @param {number} radius Half-width/depth of the camp footprint
 * @param {number} [maxDelta] Max allowable elevation delta (default 1.2m)
 * @returns {{ suitable: boolean, centerHeight: number, maxSlopeDelta: number, heights: number[] }}
 */
export function checkCampFootprintSlope(
  heightSampler,
  centerX,
  centerZ,
  radius = 6.0,
  maxDelta = MAX_CAMP_SLOPE_DELTA_METERS,
) {
  if (typeof heightSampler !== 'function') {
    return { suitable: true, centerHeight: 0, maxSlopeDelta: 0, heights: [0, 0, 0, 0, 0] };
  }

  const cY = heightSampler(centerX, centerZ);
  const p1 = heightSampler(centerX - radius, centerZ - radius);
  const p2 = heightSampler(centerX + radius, centerZ - radius);
  const p3 = heightSampler(centerX - radius, centerZ + radius);
  const p4 = heightSampler(centerX + radius, centerZ + radius);

  const heights = [cY, p1, p2, p3, p4];

  // If any sampled point returns non-finite (e.g. unloaded pixel or deep void), reject
  if (heights.some((h) => !Number.isFinite(h))) {
    return { suitable: false, centerHeight: cY, maxSlopeDelta: Infinity, heights };
  }

  const minH = Math.min(...heights);
  const maxH = Math.max(...heights);
  const slopeDelta = maxH - minH;

  return {
    suitable: slopeDelta <= maxDelta,
    centerHeight: cY,
    maxSlopeDelta: slopeDelta,
    heights,
  };
}

/**
 * Snaps an individual prop (tent, bedroll, campfire) to the exact terrain surface height.
 *
 * @param {(x: number, z: number) => number} heightSampler
 * @param {number} propX World X of the prop
 * @param {number} propZ World Z of the prop
 * @param {number} [verticalOffset=0] Small fine-tuning offset (e.g. +0.02 to avoid z-fighting)
 * @param {number} [fallbackY=0] Fallback Y coordinate if terrain height is non-finite / not streamed
 * @returns {number} Snapped world Y coordinate
 */
export function snapPropToGround(heightSampler, propX, propZ, verticalOffset = 0.02, fallbackY = 0) {
  if (typeof heightSampler !== 'function') return (Number.isFinite(fallbackY) ? fallbackY : 0) + verticalOffset;
  const h = heightSampler(propX, propZ);
  const base = Number.isFinite(h) ? h : (Number.isFinite(fallbackY) ? fallbackY : 0);
  return base + verticalOffset;
}

/**
 * Preset definitions for lightweight roadside camps.
 * All spawned entities and props are strictly marked ephemeral/transient: true.
 */
export const CAMP_PRESETS = Object.freeze({
  BANDIT_CAMP: {
    name: 'Bandit Camp',
    radius: 7.0,
    props: [
      { id: 'tent', dx: -2.5, dz: -1.5, rotY: 45 },
      { id: 'campfire', dx: 0, dz: 0, rotY: 0 },
      { id: 'bedroll', dx: 2.0, dz: 1.0, rotY: -30 },
      { id: 'crate', dx: -1.0, dz: 2.5, rotY: 15 },
    ],
    actors: [
      { career: 'Rogue', levelDelta: 0, dx: 1.5, dz: 0 },
      { career: 'Archer', levelDelta: -1, dx: -1.5, dz: 1.0 },
    ],
  },
  TRAVELER_REST: {
    name: 'Traveler Resting Camp',
    radius: 5.5,
    props: [
      { id: 'tent', dx: -2.0, dz: -1.0, rotY: 0 },
      { id: 'campfire', dx: 0, dz: 0, rotY: 0 },
      { id: 'bedroll', dx: 1.5, dz: 0.5, rotY: 90 },
    ],
    actors: [
      { career: 'Merchant', levelDelta: 0, dx: 0.8, dz: -0.8 },
    ],
  },
});

