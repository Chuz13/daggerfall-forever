// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// NAVAL INCIDENT HOST (Living Tamriel)
//
// PURE planner for squadron skirmishes at sea (navy/coast guard vs pirates, up to 3v3)
// and the player's side-choice. It does NOT launch ships itself: the host hands the plan
// to the existing naval layer (systems/naval/navalDirector.js + navalAI.js), which owns
// hulls, gunnery and AI. Everything here is ephemeral - nothing is written to the save.
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';

/** Spawn ring bounds around the player, metres (spec: 200-300 m). */
export const NAVAL_SPAWN_MIN_M = 200;
export const NAVAL_SPAWN_MAX_M = 300;
/** The interaction prompt opens when the player closes within this range, metres. */
export const NAVAL_INTERACT_M = 40;
/** A squadron beyond this range from the player is released (culled). */
export const NAVAL_CULL_M = 450;
/** Hard cap on live shells across the whole scene. */
export const NAVAL_PROJECTILE_CAP = 12;
/** Spacing between ships of one side, metres. */
export const NAVAL_SHIP_SPACING_M = 60;

export const NAVAL_CHOICE = Object.freeze({
  LAW: 'LAW',
  PIRATES: 'PIRATES',
  NEUTRAL: 'NEUTRAL',
});

/**
 * Largest squadron per side for a presence tier. MID keeps the frame rate safe (up to 2v1/2v2);
 * 3v3 is HIGH, or a region at war (`atWar`) on MID.
 * @param {number} tier
 * @param {boolean} [atWar]
 */
export function maxShipsPerSide(tier, atWar = false) {
  if (tier <= PRESENCE.OFF) return 0;
  if (tier === PRESENCE.LIGHT) return 1;
  if (tier === PRESENCE.HIGH) return 3;
  return atWar ? 3 : 2;
}

/**
 * Plans one squadron encounter around the player.
 * @param {Object} p
 * @param {number} p.playerX
 * @param {number} p.playerZ
 * @param {boolean} [p.atWar] region in WAR.MID / CIVIL_STRIFE.MID
 * @param {() => number} [p.rng]
 * @returns {null | { law: Array<{x:number,z:number,isAlly:boolean}>, pirates: Array<{x:number,z:number,isAlly:boolean}>, bearing:number, distance:number }}
 */
export function planSquadronEncounter({ playerX, playerZ, atWar = false, rng = Math.random }) {
  const tier = Number(LivingTamrielConfig.naval);
  const max = maxShipsPerSide(tier, atWar);
  if (max <= 0) return null;

  const distance = Math.min(
    NAVAL_SPAWN_MAX_M,
    Math.max(
      NAVAL_SPAWN_MIN_M,
      (LivingTamrielConfig.navalSpawnDistanceMeters || 250) + (rng() - 0.5) * 2 * 40,
    ),
  );
  const bearing = rng() * Math.PI * 2;
  const cx = playerX + Math.cos(bearing) * distance;
  const cz = playerZ + Math.sin(bearing) * distance;

  // the two lines face each other, perpendicular to the bearing from the player
  const px = -Math.sin(bearing);
  const pz = Math.cos(bearing);
  const sideLen = (n) => 1 + Math.floor(rng() * n);
  const nLaw = sideLen(max);
  const nPir = sideLen(max);
  const lineUp = (n, offsetAlong) =>
    Array.from({ length: n }, (_, i) => {
      const k = (i - (n - 1) / 2) * NAVAL_SHIP_SPACING_M;
      return {
        x: cx + px * k + Math.cos(bearing) * offsetAlong,
        z: cz + pz * k + Math.sin(bearing) * offsetAlong,
        isAlly: false,
      };
    });
  return { law: lineUp(nLaw, -25), pirates: lineUp(nPir, 25), bearing, distance };
}

/** Whether the side-choice prompt should open. */
export const shouldPromptSideChoice = (distanceToNearestShip) =>
  Number.isFinite(distanceToNearestShip) && distanceToNearestShip <= NAVAL_INTERACT_M;

/**
 * Applies the player's choice to a plan. Returns the consequences for the host to apply.
 * @param {{law:Array<any>, pirates:Array<any>}} plan
 * @param {string} choice NAVAL_CHOICE
 */
export function resolveSideChoice(plan, choice) {
  const out = {
    lawHostileToPlayer: false,
    piratesHostileToPlayer: false,
    underworldRep: 0,
    regionalBountyIssued: false,
    scavenge: false,
  };
  if (choice === NAVAL_CHOICE.LAW) {
    for (const s of plan.law) s.isAlly = true;
    out.piratesHostileToPlayer = true;
  } else if (choice === NAVAL_CHOICE.PIRATES) {
    for (const s of plan.pirates) s.isAlly = true;
    out.lawHostileToPlayer = true;
    out.underworldRep = 5;
    out.regionalBountyIssued = true;
  } else {
    out.scavenge = true; // watch the battle, scavenge wreckage and cargo
  }
  return out;
}

/** Ships beyond the cull range of the player are released. */
export const shouldCullSquadron = (distanceToPlayer) =>
  !Number.isFinite(distanceToPlayer) || distanceToPlayer > NAVAL_CULL_M;

/** Whether another shell may fly. */
export const canFireProjectile = (liveProjectiles) => liveProjectiles < NAVAL_PROJECTILE_CAP;

