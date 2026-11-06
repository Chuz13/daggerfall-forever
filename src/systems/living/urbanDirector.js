// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// URBAN SKIRMISHES & DOOMFEUD ENGINE (Living Tamriel)
//
// Manages contained town skirmishes during WAR.MID or CIVIL_STRIFE.MID:
//  - Controlled micro-battles (2-3 guards vs 3 rebels/raiders).
//  - Strict prop limits (max 2 objects, slope-filtered < 1.2m delta, min 10m from doorways).
//  - Civilian panic reaction trigger.
//  - Faction neutrality shield (isolated teams so stray hits don't cause false player crimes).
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { isRegionInSkirmishPhase } from './regionState.js';

export const URBAN_PROP_LIMIT = 2;
export const MIN_DOORWAY_CLEARANCE_M = 10.0;
export const MAX_URBAN_SLOPE_DELTA_M = 1.2;

export const SKIRMISH_TEAMS = Object.freeze({
  CITY_WATCH: 'SkirmishLaw',
  INSURGENTS: 'SkirmishRebels',
});

/**
 * Evaluates whether an urban skirmish should spawn in the current settlement.
 *
 * @param {Object} params
 * @param {number} params.regionIndex Current region index (0..61)
 * @param {boolean} [params.isInsideBuilding=false] True if player is indoors
 * @param {number} [params.existingActiveSkirmishes=0] Current active skirmish count
 * @returns {boolean}
 */
export function shouldSpawnUrbanSkirmish({
  regionIndex,
  isInsideBuilding = false,
  existingActiveSkirmishes = 0,
}) {
  const tier = Number(LivingTamrielConfig.urban);
  if (tier === PRESENCE.OFF) return false;
  if (isInsideBuilding) return false;
  if (existingActiveSkirmishes >= 1) return false; // Strict limit: max 1 active skirmish per town scene

  return isRegionInSkirmishPhase(regionIndex);
}

/**
 * Plans a compact, FPS-safe skirmish roster and prop placements.
 *
 * @param {Object} params
 * @param {number} params.centerX World X of the town square/skirmish site
 * @param {number} params.centerZ World Z of the town square/skirmish site
 * @param {Array<{ x: number, z: number }>} [params.doorwayPositions=[]] Known building door locations
 * @param {(x: number, z: number) => number} [params.heightSampler] Terrain height query
 * @param {() => number} [params.rng=Math.random]
 * @returns {{ guards: Array<{dx:number, dz:number, team:string}>, rebels: Array<{dx:number, dz:number, team:string}>, props: Array<{id:string, x:number, z:number, y:number}>, civiliansShouldPanic: boolean } | null}
 */
export function planUrbanSkirmish({
  centerX,
  centerZ,
  doorwayPositions = [],
  heightSampler = () => 0,
  rng = Math.random,
}) {
  // 1. Verify slope of the skirmish center (must be relatively flat to avoid floating props)
  const yCenter = heightSampler(centerX, centerZ);
  const yCheck1 = heightSampler(centerX + 4, centerZ + 4);
  const yCheck2 = heightSampler(centerX - 4, centerZ - 4);
  const slopeDelta = Math.max(Math.abs(yCenter - yCheck1), Math.abs(yCenter - yCheck2));
  if (slopeDelta > MAX_URBAN_SLOPE_DELTA_M) {
    return null; // Ground too steep for street props
  }

  // 2. Doorway clearance check
  const isNearAnyDoor = doorwayPositions.some((door) => {
    return Math.hypot(door.x - centerX, door.z - centerZ) < MIN_DOORWAY_CLEARANCE_M;
  });
  if (isNearAnyDoor) {
    return null; // Too close to building entrances, avoid softlocking player
  }

  // 3. Compact roster: 2 city guards vs 3 rebels/insurgents
  const guards = [
    { dx: -2.5, dz: -1.0, team: SKIRMISH_TEAMS.CITY_WATCH },
    { dx: -3.0, dz: 1.5, team: SKIRMISH_TEAMS.CITY_WATCH },
  ];

  const rebels = [
    { dx: 2.5, dz: -0.5, team: SKIRMISH_TEAMS.INSURGENTS },
    { dx: 3.0, dz: 1.0, team: SKIRMISH_TEAMS.INSURGENTS },
    { dx: 2.0, dz: 2.5, team: SKIRMISH_TEAMS.INSURGENTS },
  ];

  // 4. Props strictly capped at max 2
  const propList = [
    { id: 'barricade', x: centerX - 0.5, z: centerZ - 1.5, y: heightSampler(centerX - 0.5, centerZ - 1.5) },
    { id: 'burning_cart', x: centerX + 0.8, z: centerZ + 1.2, y: heightSampler(centerX + 0.8, centerZ + 1.2) },
  ].slice(0, URBAN_PROP_LIMIT);

  return {
    guards,
    rebels,
    props: propList,
    civiliansShouldPanic: true,
  };
}

/**
 * Checks whether an attack during an urban skirmish should produce a legal crime.
 * Faction Neutrality Shield: Stray crossfire between skirmishers does not indict the player
 * unless the player deliberately attacks lawful guards unprovoked.
 *
 * @param {string} attackerTeam
 * @param {string} victimTeam
 * @param {boolean} [isAttackerPlayer=false]
 * @returns {boolean} True if crime should be recorded
 */
export function isSkirmishBlowCriminal(attackerTeam, victimTeam, isAttackerPlayer = false) {
  if (!isAttackerPlayer) return false; // NPC vs NPC skirmish strikes are never crimes for player
  if (victimTeam === SKIRMISH_TEAMS.CITY_WATCH) return true; // Attacking lawful watch is assault
  return false; // Striking rebels/insurgents is not a crime
}

