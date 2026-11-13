// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// ROAD CHECKPOINTS & WARTIME CORDONS (Living Tamriel)
//
// Governs roadside military checkpoints, guard inspections, toll collections,
// and social pass resolutions during WAR and CIVIL_STRIFE across Tamriel.
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getRegionState, CRISIS_TYPE, CRISIS_PHASE } from './regionState.js';
import { getLivingDirectorState } from './livingDirector.js';
import { GUILD_GROUPS } from '../../formats/factionFile.js';
import { SKILLS } from '../skills.js';
import {
  LIVING_ROLL_DEGREE,
  resolveLivingRoll,
  computeRoleplayBribeMultiplier,
  getPlayerRoleplayContextMod,
} from './livingRolls.js';
import { evaluateCheckpointInspection, inspectPlayerContraband } from './reputationConsequences.js';
import { confiscateStolen } from '../court.js';

export const CHECKPOINT_OUTCOME = Object.freeze({
  PASSED_FREE: 'PASSED_FREE',           // Knightly order or noble standing
  TOLL_PAID: 'TOLL_PAID',               // Paid the wartime transit fee
  PASSED_DIPLOMACY: 'PASSED_DIPLOMACY', // Succeeded on Etiquette or Streetwise check
  LUCK_SAVED: 'LUCK_SAVED',             // Saved by second chance of Luck or narrow compromise
  REFUSED: 'REFUSED',                   // Access denied; turned back without bloodshed
  HOSTILE: 'HOSTILE',                   // Forced entry / critical blunder / attacked guards
  SURRENDERED_PAID: 'SURRENDERED_PAID', // Surrendered peacefully; paid fine and received pass
  SURRENDERED_PAUPER: 'SURRENDERED_PAUPER', // Surrendered with empty pockets; cautioned and passed
});

export const CHECKPOINT_PASS_DURATION_MINUTES = 1440; // 24 in-game hours

/**
 * Grants a 24-hour wartime transit pass for a specific region.
 * @param {number} regionIndex
 * @param {number} [nowMinutes=0]
 */
export function grantRegionalCheckpointPass(regionIndex, nowMinutes = 0) {
  if (!(nowMinutes > 0)) return;
  const root = getLivingDirectorState();
  if (!root.subsystems.checkpoints) {
    root.subsystems.checkpoints = { passesByRegion: {} };
  }
  if (!root.subsystems.checkpoints.passesByRegion) {
    root.subsystems.checkpoints.passesByRegion = {};
  }
  root.subsystems.checkpoints.passesByRegion[regionIndex] = nowMinutes + CHECKPOINT_PASS_DURATION_MINUTES;
}

/**
 * Checks whether the player currently holds a valid transit pass in `regionIndex`.
 * @param {number} regionIndex
 * @param {number} [nowMinutes=0]
 * @returns {boolean}
 */
export function hasRegionalCheckpointPass(regionIndex, nowMinutes = 0) {
  if (!(nowMinutes > 0)) return false;
  const root = getLivingDirectorState();
  const until = Number(root?.subsystems?.checkpoints?.passesByRegion?.[regionIndex] ?? -1);
  return until > 0 && nowMinutes <= until;
}

/**
 * Checks whether a roadside checkpoint should spawn along this route.
 *
 * @param {Object} params
 * @param {number} params.regionIndex
 * @param {boolean} [params.isHighway=true]
 * @returns {boolean}
 */
export function shouldSpawnRoadCheckpoint({ regionIndex, isHighway = true }) {
  const tier = Number(LivingTamrielConfig.camps);
  if (tier === PRESENCE.OFF || !isHighway) return false;

  const state = getRegionState(regionIndex);
  if (!state) return false;

  const isConflict = state.crisis === CRISIS_TYPE.WAR || state.crisis === CRISIS_TYPE.CIVIL_STRIFE;
  if (!isConflict) return false;

  return state.phase === CRISIS_PHASE.MID || state.phase === CRISIS_PHASE.START;
}

/**
 * Evaluates the checkpoint encounter properties for the player.
 *
 * @param {Object} params
 * @param {any} params.playerEntity
 * @param {number} params.regionIndex
 * @param {() => number} [params.rng=Math.random]
 * @returns {{ guardCount: number, tollGold: number, isKnight: boolean, canPassFree: boolean }}
 */
export function evaluateCheckpointEncounter({
  playerEntity,
  regionIndex,
  rng = Math.random,
}) {
  const isKnight = Boolean(
    playerEntity?.guildMemberships?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0 ||
    playerEntity?.guilds?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0 ||
    playerEntity?.guilds?.KnightlyOrder?.rank > 0
  );
  const rep = Number(playerEntity?.legalRep?.[regionIndex] ?? playerEntity?.regionalReputations?.[regionIndex] ?? 0);
  const insp = evaluateCheckpointInspection(playerEntity, isKnight);
  const hasHighReputation = rep >= 15;
  const canPassFree = isKnight || hasHighReputation || insp.saluted;

  const baseToll = 50;
  const tollGold = baseToll + Math.floor(rng() * 50);
  const guardCount = 2 + Math.floor(rng() * 3);

  return {
    guardCount,
    tollGold,
    isKnight,
    canPassFree,
    inspectionDemanded: insp.demandInspection,
    saluted: insp.saluted,
  };
}

/**
 * Resolves a player interaction at a road checkpoint.
 *
 * @param {Object} params
 * @param {any} params.playerEntity
 * @param {string} params.method - 'knight' | 'reputation' | 'toll' | 'etiquette' | 'streetwise' | 'force'
 * @param {number} [params.tollGoldRequired=50]
 * @param {number} [params.tollPaid=0]
 * @param {number} [params.regionIndex=0]
 * @param {number} [params.nowMinutes=0]
 * @param {() => number} [params.rng=Math.random]
 * @returns {{ outcome: string, message: string }}
 */
export function resolveCheckpointInteraction({
  playerEntity,
  method,
  tollGoldRequired = 50,
  tollPaid = 0,
  regionIndex = 0,
  nowMinutes = 0,
  rng = Math.random,
}) {
  if (hasRegionalCheckpointPass(regionIndex, nowMinutes)) {
    return {
      outcome: CHECKPOINT_OUTCOME.PASSED_FREE,
      message: 'The guard inspects your stamped provincial transit pass and waves you through.',
    };
  }

  const isKnight = Boolean(
    playerEntity?.guildMemberships?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0 ||
    playerEntity?.guilds?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0 ||
    playerEntity?.guilds?.KnightlyOrder?.rank > 0
  );
  const rep = Number(playerEntity?.legalRep?.[regionIndex] ?? playerEntity?.regionalReputations?.[regionIndex] ?? 0);
  const insp = evaluateCheckpointInspection(playerEntity, isKnight);

  if (method === 'submit_inspection') {
    const contraband = inspectPlayerContraband(playerEntity);
    if (contraband.stolenCount === 0) {
      grantRegionalCheckpointPass(regionIndex, nowMinutes);
      return {
        outcome: CHECKPOINT_OUTCOME.PASSED_FREE,
        finePaid: 0,
        stolenConfiscated: 0,
        message: 'The guard finishes inspecting your sacks and rolls. "Baggage is clean. Move along, citizen."',
      };
    }
    const taken = confiscateStolen(playerEntity);
    const haveGold = Math.max(0, Number(playerEntity?.goldPieces ?? 0));
    const finePaid = Math.min(haveGold, contraband.fineGold);
    if (playerEntity && finePaid > 0) {
      playerEntity.goldPieces = haveGold - finePaid;
    }
    grantRegionalCheckpointPass(regionIndex, nowMinutes);
    return {
      outcome: CHECKPOINT_OUTCOME.TOLL_PAID,
      tollCost: finePaid,
      finePaid,
      stolenConfiscated: taken.length || contraband.stolenCount,
      message: `Guard: "Contraband detected! ${taken.length || contraband.stolenCount} illicit item(s) confiscated and a ${finePaid}-gold penalty levied. Move along."`,
    };
  }

  if (method === 'refuse_inspection') {
    return {
      outcome: CHECKPOINT_OUTCOME.HOSTILE,
      message: 'Guard Captain: "Resistance to lawful inspection! Draw steel and take this scoundrel down!"',
    };
  }

  if (method === 'knight') {
    if (isKnight) {
      grantRegionalCheckpointPass(regionIndex, nowMinutes);
      return {
        outcome: CHECKPOINT_OUTCOME.PASSED_FREE,
        message: 'The watchmen present arms and step aside. "Hail, noble Knight! The road is yours; pass freely."',
      };
    }
    return {
      outcome: CHECKPOINT_OUTCOME.REFUSED,
      message: 'The guard sneers. "You wear no standard of a recognised Knightly Order. Halt!"',
    };
  }

  if (method === 'reputation') {
    if (rep >= 15 || insp.saluted) {
      grantRegionalCheckpointPass(regionIndex, nowMinutes);
      return {
        outcome: CHECKPOINT_OUTCOME.PASSED_FREE,
        message: insp.saluted && !(rep >= 15)
          ? 'The guard captain snaps to attention and salutes your standing. "Pass through cleanly, traveler."'
          : 'The guard captain nods respectfully. "Your good deeds in this province are well known. Pass through, citizen."',
      };
    }
    return {
      outcome: CHECKPOINT_OUTCOME.REFUSED,
      message: 'The guard shakes his head. "We do not know your name. Pay the transit toll or turn back."',
    };
  }

  if (method === 'toll') {
    const discountMult = computeRoleplayBribeMultiplier(playerEntity, SKILLS.Mercantile);
    const effectiveRequired = tollPaid >= tollGoldRequired
      ? tollGoldRequired
      : Math.max(15, Math.floor(tollGoldRequired * discountMult));
    if (tollPaid >= tollGoldRequired || (tollPaid >= effectiveRequired && discountMult < 0.85)) {
      grantRegionalCheckpointPass(regionIndex, nowMinutes);
      return {
        outcome: CHECKPOINT_OUTCOME.TOLL_PAID,
        tollCost: Math.min(tollGoldRequired, tollPaid),
        message: 'The guard stamps your pass and pockets the gold. "Your papers are in order. Move along, traveller."',
      };
    }
    return {
      outcome: CHECKPOINT_OUTCOME.REFUSED,
      message: 'The guard frowns. "That is not enough gold to cover wartime transit inspection. Halt!"',
    };
  }

  if (method === 'etiquette' || method === 'streetwise') {
    const isEtiquette = method === 'etiquette';
    const rollRes = resolveLivingRoll({
      formulaId: 'CHECKPOINT_INSPECTION',
      playerEntity,
      skillId: isEtiquette ? SKILLS.Etiquette : SKILLS.Streetwise,
      statName: isEtiquette ? 'personality' : 'intelligence',
      difficulty: isEtiquette ? 55 : 50,
      regionIndex,
      contextBonus: getPlayerRoleplayContextMod(playerEntity) + (isKnight ? 15 : 0),
      rng,
    });

    if (rollRes.cleanSuccess) {
      grantRegionalCheckpointPass(regionIndex, nowMinutes);
      return {
        outcome: CHECKPOINT_OUTCOME.PASSED_DIPLOMACY,
        degree: rollRes.degree,
        rollResult: rollRes,
        message: isEtiquette
          ? 'Your authoritative poise and noble diction convince the guard this is urgent official business. "Understood, pass through."'
          : 'With quiet wit and street knowledge, you convince the guards you pose no threat. "Alright, slip through, quietly."',
      };
    }

    if (rollRes.luckSaved) {
      grantRegionalCheckpointPass(regionIndex, nowMinutes);
      return {
        outcome: CHECKPOINT_OUTCOME.LUCK_SAVED,
        degree: rollRes.degree,
        rollResult: rollRes,
        message: 'By blind fortune, a courier horn sounds in the distance, distracting the guards and waving you through!',
      };
    }

    const compromiseToll = Math.max(10, Math.floor(tollGoldRequired * 0.5));
    return {
      outcome: CHECKPOINT_OUTCOME.REFUSED,
      degree: rollRes.degree,
      compromiseToll: rollRes.degree === LIVING_ROLL_DEGREE.PARTIAL ? compromiseToll : 0,
      rollResult: rollRes,
      message: 'The guards are unimpressed by your words. "Nice speech, but regulations are regulations. Halt!"',
    };
  }

  if (method === 'surrender') {
    const fineGold = Math.max(50, Math.floor(tollGoldRequired * 1.5));
    const currentGold = Number(playerEntity?.goldPieces ?? 0);
    if (currentGold >= fineGold) {
      if (playerEntity) {
        playerEntity.goldPieces = Math.max(0, currentGold - fineGold);
      }
      grantRegionalCheckpointPass(regionIndex, nowMinutes);
      return {
        outcome: CHECKPOINT_OUTCOME.SURRENDERED_PAID,
        tollCost: fineGold,
        message: 'You surrender your weapons and pay the transit penalty. The guard issues a stamped caution pass.',
      };
    }
    // Pauper surrender: pass safely without blood, but stripped of coins and winded
    if (playerEntity) {
      playerEntity.goldPieces = 0;
      if (typeof playerEntity.fatigue === 'number') {
        playerEntity.fatigue = Math.max(1, Math.trunc(playerEntity.fatigue * 0.2));
      }
    }
    grantRegionalCheckpointPass(regionIndex, nowMinutes);
    return {
      outcome: CHECKPOINT_OUTCOME.SURRENDERED_PAUPER,
      tollCost: currentGold,
      message: 'Emptying your pockets, the guards confiscate what little copper you have and wave you on with a stern warning.',
    };
  }

  // Fallback: forceful defiance
  return {
    outcome: CHECKPOINT_OUTCOME.HOSTILE,
    message: 'The guards draw their halberds. "Intruder! Sound the alarm! To arms!"',
  };
}
