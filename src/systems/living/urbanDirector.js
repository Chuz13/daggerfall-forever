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

import { LivingTamrielConfig, PRESENCE, getLivingEncounterScale, rollEncounterRange, LIVING_ENCOUNTER_SCALE } from './livingConfig.js';
import { isRegionInSkirmishPhase, getActiveCrises } from './regionState.js';
import {
  matchLivingCrisisEvent,
  calculateLocationProsperity,
  getEnemyProvinceName,
  resolveEventAttackersPool,
  PROSPERITY_TIER,
  SKIRMISH_PROP_THEME,
} from './crisisRegistry.js';
import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import { snapPropToGround } from './campInjector.js';
import { enrichHumanoidSkirmishPool } from './tacticalPacks.js';

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
 * Plans a compact, FPS-safe skirmish roster and prop placements from the event matrix.
 * @param {{ centerX: number, centerZ: number, doorwayPositions?: Array<{x:number,z:number}>, heightSampler?: (x:number,z:number)=>number, rng?: ()=>number, regionIndex?: number, locationType?: number, dfLocation?: any, playerEntity?: any, climateIndex?: number|null, allowMundaneOnly?: boolean, forcedEventId?: string|null }} params
 * @returns {{ guards: Array<{dx:number, dz:number, team:string, mobileType?:number}>, rebels: Array<{dx:number, dz:number, team:string, mobileType?:number}>, props: Array<{id:string, x:number, z:number, y:number}>, propTheme: string, civiliansShouldPanic: boolean, event?: any, faction1Name?: string, faction2Name?: string } | null}
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
  climateIndex = null,
  allowMundaneOnly = false,
  forcedEventId = null,
}) {
  // 1. Verify slope of the skirmish center (must be relatively flat and valid to avoid floating props)
  const yCenter = heightSampler(centerX, centerZ);
  const yCheck1 = heightSampler(centerX + 4, centerZ + 4);
  const yCheck2 = heightSampler(centerX - 4, centerZ - 4);
  if (!Number.isFinite(yCenter) || !Number.isFinite(yCheck1) || !Number.isFinite(yCheck2)) {
    return null; // Terrain not yet streamed/built at this location, defer spawn
  }
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
    allowMundaneOnly,
    forcedEventId,
  });

  const prosperity = calculateLocationProsperity(dfLocation);
  const scale = getLivingEncounterScale();
  const isSingleDefender = Boolean(event && event.baseDefenders === 1);
  const isSingleAttacker = Boolean(event && event.baseAttackers === 1);
  const isSwarmAttackers = Boolean(event && event.swarmAttackers);

  // Scaled ranges for defenders and attackers based on encounter scale
  let defMin = 1;
  let defMax = 2;
  let atkMin = 2;
  let atkMax = 3;

  if (scale === LIVING_ENCOUNTER_SCALE.LOW) {
    defMin = 1;
    defMax = isSingleDefender ? 1 : 2;
    atkMin = isSingleAttacker ? 1 : (isSwarmAttackers ? 5 : 2);
    atkMax = isSingleAttacker ? 1 : (isSwarmAttackers ? 7 : 3);
  } else if (scale === LIVING_ENCOUNTER_SCALE.MID) {
    defMin = isSingleDefender ? 1 : 3;
    defMax = isSingleDefender ? 1 : 5;
    atkMin = isSingleAttacker ? 1 : (isSwarmAttackers ? 8 : 4);
    atkMax = isSingleAttacker ? 1 : (isSwarmAttackers ? 12 : 7);
  } else if (scale === LIVING_ENCOUNTER_SCALE.HIGH) {
    defMin = isSingleDefender ? 1 : 6;
    defMax = isSingleDefender ? 1 : 9;
    atkMin = isSingleAttacker ? 1 : (isSwarmAttackers ? 13 : 8);
    atkMax = isSingleAttacker ? 1 : (isSwarmAttackers ? 18 : 14);
  }

  let guardCount = rollEncounterRange(defMin, defMax, rng);
  let rebelCount = rollEncounterRange(atkMin, atkMax, rng);

  // Prosperity adjustment (affects symmetric town guards only)
  if (!isSingleDefender) {
    if (prosperity === PROSPERITY_TIER.HIGH) guardCount = Math.min(defMax + 1, guardCount + 1);
    else if (prosperity === PROSPERITY_TIER.LOW) guardCount = Math.max(defMin, guardCount - 1);
  }

  const playerLevel = Number(playerEntity?.level ?? 1);
  // Generate guard positions and mobile types in compact multi-rank formations
  const defPool = event?.defendersPool?.length ? event.defendersPool : [MOBILE_TYPES.Knight, MOBILE_TYPES.Warrior];
  const defRoster = isSingleDefender
    ? [defPool[0]]
    : enrichHumanoidSkirmishPool(defPool, guardCount, { side: 'guards', playerLevel });
  const guards = [];
  const baseDefAngle = -Math.PI * 0.75;
  for (let i = 0; i < guardCount; i++) {
    const rank = Math.floor(i / 5);
    const inRankIdx = i % 5;
    const rankTotal = Math.min(5, guardCount - rank * 5);
    const spread = Math.PI * 0.45;
    const angle = baseDefAngle + (rankTotal > 1 ? (inRankIdx / (rankTotal - 1) - 0.5) * spread : 0);
    const dist = 2.4 + rank * 1.4 + (i % 2 === 0 ? 0.2 : -0.2);
    let gx = Math.cos(angle) * dist;
    let gz = Math.sin(angle) * dist;
    const yAt = heightSampler(centerX + gx, centerZ + gz);
    if (!Number.isFinite(yAt) || Math.abs(yAt - yCenter) > MAX_URBAN_SLOPE_DELTA_M) {
      gx *= 0.7;
      gz *= 0.7;
    }
    guards.push({
      dx: gx,
      dz: gz,
      team: SKIRMISH_TEAMS.CITY_WATCH,
      mobileType: defRoster[i],
    });
  }

  // Generate rebel/attacker positions in compact multi-rank or tight swarm formations
  const resolvedPool = event
    ? resolveEventAttackersPool(event, {
      regionIndex,
      climateIndex,
      playerLevel,
    })
    : [];
  const atkPool = resolvedPool.length ? resolvedPool : [MOBILE_TYPES.Rogue, MOBILE_TYPES.Nightblade, MOBILE_TYPES.Warrior];
  const atkRoster = (isSingleAttacker || isSwarmAttackers)
    ? Array.from({ length: rebelCount }, (_, i) => atkPool[i % atkPool.length])
    : enrichHumanoidSkirmishPool(atkPool, rebelCount, { side: 'rebels', playerLevel });
  const rebels = [];
  const baseAtkAngle = Math.PI * 0.25;
  for (let i = 0; i < rebelCount; i++) {
    let angle;
    let dist;
    if (isSwarmAttackers) {
      const spread = Math.PI * 0.85;
      angle = baseAtkAngle + (rebelCount > 1 ? (i / (rebelCount - 1) - 0.5) * spread : 0);
      dist = 1.6 + (i % 3) * 0.9;
    } else {
      const rank = Math.floor(i / 5);
      const inRankIdx = i % 5;
      const rankTotal = Math.min(5, rebelCount - rank * 5);
      const spread = Math.PI * 0.45;
      angle = baseAtkAngle + (rankTotal > 1 ? (inRankIdx / (rankTotal - 1) - 0.5) * spread : 0);
      dist = 2.4 + rank * 1.4 + (i % 2 === 0 ? -0.2 : 0.2);
    }
    let rx = Math.cos(angle) * dist;
    let rz = Math.sin(angle) * dist;
    const yAt = heightSampler(centerX + rx, centerZ + rz);
    if (!Number.isFinite(yAt) || Math.abs(yAt - yCenter) > MAX_URBAN_SLOPE_DELTA_M) {
      rx *= 0.7;
      rz *= 0.7;
    }
    rebels.push({
      dx: rx,
      dz: rz,
      team: SKIRMISH_TEAMS.INSURGENTS,
      mobileType: atkRoster[i],
    });
  }

  // Faction naming
  const enemyProv = getEnemyProvinceName(regionIndex, rng);
  const factionNames = event ? event.getFactionNames(regionIndex, enemyProv) : { f1: 'City Watch', f2: 'Rebels' };

  // 4. Props strictly capped at max 2, placed along the perpendicular axis clear of guard/rebel lines
  const p0x = centerX - 1.8;
  const p0z = centerZ + 1.6;
  const p1x = centerX + 1.8;
  const p1z = centerZ - 1.6;
  const propList = [
    { id: 'barricade', x: p0x, z: p0z, y: snapPropToGround(heightSampler, p0x, p0z, 0.02, yCenter) },
    { id: 'burning_cart', x: p1x, z: p1z, y: snapPropToGround(heightSampler, p1x, p1z, 0.02, yCenter) },
  ].slice(0, URBAN_PROP_LIMIT);

  return {
    event,
    faction1Name: factionNames.f1,
    faction2Name: factionNames.f2,
    guards,
    rebels,
    props: propList,
    propTheme: event?.propTheme ?? SKIRMISH_PROP_THEME.MILITARY_BARRICADE,
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
