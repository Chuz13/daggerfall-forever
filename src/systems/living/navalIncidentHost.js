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
import { SKILLS } from '../skills.js';
import { resolveLivingRoll } from './livingRolls.js';

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
 * Min/Max ship count ranges per squadron side.
 * Allows asymmetric fleets (e.g. 2 patrol ships vs 3 pirate brigs) and dynamic battle masses.
 */
export const NAVAL_SQUADRON_RANGES = Object.freeze({
  [PRESENCE.LIGHT]: Object.freeze({ min: 1, max: 2, warMax: 2 }),
  [PRESENCE.MID]: Object.freeze({ min: 2, max: 4, warMax: 5 }),
  [PRESENCE.HIGH]: Object.freeze({ min: 3, max: 6, warMax: 6 }),
});

/**
 * Returns the min/max squadron ship range for a presence tier and war status.
 * @param {number} tier
 * @param {boolean} [atWar=false]
 * @returns {{ min: number, max: number }}
 */
export function getSquadronShipRange(tier, atWar = false) {
  if (!Number.isFinite(tier) || tier <= PRESENCE.OFF) return { min: 0, max: 0 };
  const conf = NAVAL_SQUADRON_RANGES[tier] ?? NAVAL_SQUADRON_RANGES[PRESENCE.MID];
  const max = atWar && conf.warMax != null ? conf.warMax : conf.max;
  return { min: conf.min, max };
}

/**
 * Largest squadron per side for a presence tier.
 * @param {number} tier
 * @param {boolean} [atWar=false]
 */
export function maxShipsPerSide(tier, atWar = false) {
  return getSquadronShipRange(tier, atWar).max;
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
  const range = getSquadronShipRange(tier, atWar);
  if (range.max <= 0) return null;

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
  const rollSide = () => range.min + Math.floor(rng() * (range.max - range.min + 1));
  const nLaw = rollSide();
  const nPir = rollSide();
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
 * When `playerEntity` is provided, evaluates a typed roleplay roll (Etiquette for Crown Navy,
 * Streetwise for Pirate Corsairs, Mercantile/Luck for Wreckage Salvage).
 *
 * @param {{law:Array<any>, pirates:Array<any>}} plan
 * @param {string} choice NAVAL_CHOICE
 * @param {any} [playerEntity=null]
 * @param {() => number} [rng=Math.random]
 */
export function resolveSideChoice(plan, choice, playerEntity = null, rng = Math.random) {
  const skillId =
    choice === NAVAL_CHOICE.LAW
      ? SKILLS.Etiquette
      : choice === NAVAL_CHOICE.PIRATES
        ? SKILLS.Streetwise
        : SKILLS.Mercantile;
  const rollResult = playerEntity
    ? resolveLivingRoll({
        formulaId: choice === NAVAL_CHOICE.PIRATES ? 'STREETWISE_LEVERAGE' : 'SOCIAL_DIPLOMACY',
        playerEntity,
        skillId,
        difficulty: 45,
        rng,
      })
    : null;

  const out = {
    lawHostileToPlayer: false,
    piratesHostileToPlayer: false,
    underworldRep: 0,
    regionalBountyIssued: false,
    scavenge: false,
    salvageBonusMult: rollResult?.isTriumph ? 1.5 : rollResult?.cleanSuccess ? 1.2 : 1.0,
    degree: rollResult?.degree ?? 'SUCCESS',
    rollResult,
  };
  if (choice === NAVAL_CHOICE.LAW) {
    for (const s of plan.law) s.isAlly = true;
    out.piratesHostileToPlayer = true;
  } else if (choice === NAVAL_CHOICE.PIRATES) {
    for (const s of plan.pirates) s.isAlly = true;
    out.lawHostileToPlayer = true;
    out.underworldRep = rollResult?.isTriumph ? 8 : 5;
    out.regionalBountyIssued = !rollResult?.isTriumph;
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

