// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// URBAN SKIRMISHES & DOOMFEUD ENGINE (Living Tamriel)
//
// Manages contained town skirmishes during regional crises or civil strife:
//  - Controlled micro-battles dynamically scaled from the 39-event crisis matrix.
//  - Strict prop limits (max 2 objects, slope-filtered < 1.2m delta, min 10m from doorways).
//  - Civilian panic reaction trigger.
//  - Faction neutrality shield (isolated teams so stray hits don't cause false player crimes).
//  - ZERO-LOOT drop guarantee on all skirmish participants to protect game economy.
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { isRegionInSkirmishPhase, getActiveCrises } from './regionState.js';
import {
  matchLivingCrisisEvent,
  calculateLocationProsperity,
  getEnemyProvinceName,
  PROSPERITY_TIER,
} from './crisisRegistry.js';
import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';

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
 * @param {any} [params.playerEntity=null] Player entity for checking condition flags
 * @returns {boolean}
 */
export function shouldSpawnUrbanSkirmish({
  regionIndex,
  isInsideBuilding = false,
  existingActiveSkirmishes = 0,
  playerEntity = null,
}) {
  const tier = Number(LivingTamrielConfig.urban);
  if (tier === PRESENCE.OFF) return false;
  if (isInsideBuilding) return false;
  if (existingActiveSkirmishes >= 1) return false; // Strict limit: max 1 active skirmish per town scene

  if (isRegionInSkirmishPhase(regionIndex)) return true;

  // Also check if region has any other active dynamic crises
  const crises = getActiveCrises(regionIndex);
  if (crises.length > 0) return true;

  // Also check vanilla 29 region condition flags (War, Plague, Famine, WitchBurnings, CrimeWave, etc.)
  const flags = playerEntity?.regionConditions?.[regionIndex]?.flags;
  if (Array.isArray(flags) && flags.some(Boolean)) return true;

  return false;
}

/**
 * Plans a compact, FPS-safe skirmish roster and prop placements based on
 * the 39-event matrix, location prosperity, and density settings.
 *
 * @param {Object} params
 * @param {number} params.centerX World X of the town square/skirmish site
 * @param {number} params.centerZ World Z of the town square/skirmish site
 * @param {Array<{ x: number, z: number }>} [params.doorwayPositions=[]] Known building door locations
 * @param {(x: number, z: number) => number} [params.heightSampler] Terrain height query
 * @param {() => number} [params.rng=Math.random]
 * @param {number} [params.regionIndex=0]
 * @param {number} [params.locationType=0]
 * @param {any} [params.dfLocation=null]
 * @param {any} [params.playerEntity=null]
 * @returns {{ guards: Array<{dx:number, dz:number, team:string, mobileType?:number}>, rebels: Array<{dx:number, dz:number, team:string, mobileType?:number}>, props: Array<{id:string, x:number, z:number, y:number}>, civiliansShouldPanic: boolean, event?: any, faction1Name?: string, faction2Name?: string } | null}
 */
export function planUrbanSkirmish({
  centerX,
  centerZ,
  doorwayPositions = [],
  heightSampler = () => 0,
  rng = Math.random,
  regionIndex = 0,
  locationType = 0,
  dfLocation = null,
  playerEntity = null,
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

  // 3. Resolve matched event and location prosperity
  const event = matchLivingCrisisEvent({
    regionIndex,
    locationType,
    dfLocation,
    playerEntity,
    rng,
  });

  const prosperity = calculateLocationProsperity(dfLocation);
  const tier = Number(LivingTamrielConfig.urban);

  // Density multiplier: LOW = 0.8x, MID (default) = 1.0x (canonical 2 guards / 3 rebels), HIGH = 2.0x
  let densityMult = 1.0;
  if (tier === PRESENCE.LOW) densityMult = 0.8;
  else if (tier === PRESENCE.HIGH) densityMult = 2.0;

  // Prosperity adjustment: High prosperity towns have more guards; Low has fewer
  const prosGuardFactor = prosperity === PROSPERITY_TIER.HIGH ? 1.3 : prosperity === PROSPERITY_TIER.LOW ? 0.8 : 1.0;
  const prosRebelFactor = prosperity === PROSPERITY_TIER.HIGH ? 1.2 : 1.0;

  const baseDef = event ? event.baseDefenders : 2;
  const baseAtk = event ? event.baseAttackers : 3;

  // Hard caps: max 6 defenders and max 7 attackers to ensure stable performance and navmesh
  const guardCount = Math.min(6, Math.max(1, Math.round(baseDef * densityMult * prosGuardFactor)));
  const rebelCount = Math.min(7, Math.max(1, Math.round(baseAtk * densityMult * prosRebelFactor)));

  // Generate guard positions and mobile types
  const defPool = event?.defendersPool?.length ? event.defendersPool : [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior];
  const guards = [];
  for (let i = 0; i < guardCount; i++) {
    const angle = -Math.PI * 0.75 + (i / Math.max(1, guardCount - 1)) * (Math.PI * 0.5);
    const dist = 2.5 + (i % 2) * 1.2;
    guards.push({
      dx: Math.cos(angle) * dist,
      dz: Math.sin(angle) * dist,
      team: SKIRMISH_TEAMS.CITY_WATCH,
      mobileType: defPool[i % defPool.length],
    });
  }

  // Generate rebel/attacker positions and mobile types
  const atkPool = event?.attackersPool?.length ? event.attackersPool : [MOBILE_TYPES.Rogue, MOBILE_TYPES.Nightblade, MOBILE_TYPES.Warrior];
  const rebels = [];
  for (let i = 0; i < rebelCount; i++) {
    const angle = Math.PI * 0.25 + (i / Math.max(1, rebelCount - 1)) * (Math.PI * 0.5);
    const dist = 2.5 + (i % 2) * 1.2;
    rebels.push({
      dx: Math.cos(angle) * dist,
      dz: Math.sin(angle) * dist,
      team: SKIRMISH_TEAMS.INSURGENTS,
      mobileType: atkPool[i % atkPool.length],
    });
  }

  // Faction naming
  const enemyProv = getEnemyProvinceName(regionIndex, rng);
  const factionNames = event ? event.getFactionNames(regionIndex, enemyProv) : { f1: 'City Watch', f2: 'Rebels' };

  // 4. Props strictly capped at max 2
  const propList = [
    { id: 'barricade', x: centerX - 0.5, z: centerZ - 1.5, y: heightSampler(centerX - 0.5, centerZ - 1.5) },
    { id: 'burning_cart', x: centerX + 0.8, z: centerZ + 1.2, y: heightSampler(centerX + 0.8, centerZ + 1.2) },
  ].slice(0, URBAN_PROP_LIMIT);

  return {
    event,
    faction1Name: factionNames.f1,
    faction2Name: factionNames.f2,
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
