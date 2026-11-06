// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// ROAD CHECKPOINTS & WARTIME CORDONS (Living Tamriel)
//
// Governs roadside military checkpoints, guard inspections, toll collections,
// and social pass resolutions during WAR and CIVIL_STRIFE across Tamriel.
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getRegionState, CRISIS_TYPE, CRISIS_PHASE } from './regionState.js';
import { GUILD_GROUPS } from '../../formats/factionFile.js';
import { SKILLS, skillValue } from '../skills.js';
import { dice100 } from '../../combat/formulas.js';

export const CHECKPOINT_OUTCOME = Object.freeze({
  PASSED_FREE: 'PASSED_FREE',       // Knightly order or noble standing
  TOLL_PAID: 'TOLL_PAID',           // Paid the wartime transit fee
  PASSED_DIPLOMACY: 'PASSED_DIPLOMACY', // Succeeded on Etiquette or Streetwise check
  LUCK_SAVED: 'LUCK_SAVED',         // Saved by second chance of Luck
  REFUSED: 'REFUSED',               // Access denied; turned back
  HOSTILE: 'HOSTILE',               // Forced entry / attacked guards
});

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
  const isKnight = Boolean(playerEntity?.guildMemberships?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0);
  const rep = Number(playerEntity?.regionalReputations?.[regionIndex] || 0);
  const hasHighReputation = rep >= 15;
  const canPassFree = isKnight || hasHighReputation;

  const baseToll = 50;
  const tollGold = baseToll + Math.floor(rng() * 50);
  const guardCount = 2 + Math.floor(rng() * 3);

  return {
    guardCount,
    tollGold,
    isKnight,
    canPassFree,
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
 * @param {() => number} [params.rng=Math.random]
 * @returns {{ outcome: string, message: string }}
 */
export function resolveCheckpointInteraction({
  playerEntity,
  method,
  tollGoldRequired = 50,
  tollPaid = 0,
  regionIndex = 0,
  rng = Math.random,
}) {
  const isKnight = Boolean(playerEntity?.guildMemberships?.[GUILD_GROUPS.KnightlyOrder]?.rank > 0);
  const rep = Number(playerEntity?.regionalReputations?.[regionIndex] || 0);
  const luck = Number(playerEntity?.stats?.Luck ?? 50);

  if (method === 'knight') {
    if (isKnight) {
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
    if (rep >= 15) {
      return {
        outcome: CHECKPOINT_OUTCOME.PASSED_FREE,
        message: 'The guard captain nods respectfully. "Your good deeds in this province are well known. Pass through, citizen."',
      };
    }
    return {
      outcome: CHECKPOINT_OUTCOME.REFUSED,
      message: 'The guard shakes his head. "We do not know your name. Pay the transit toll or turn back."',
    };
  }

  if (method === 'toll') {
    if (tollPaid >= tollGoldRequired) {
      return {
        outcome: CHECKPOINT_OUTCOME.TOLL_PAID,
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
    const skillId = isEtiquette ? SKILLS.Etiquette : SKILLS.Streetwise;
    const skillVal = Number(skillValue(playerEntity, skillId) || 30);
    const statVal = isEtiquette
      ? Number(playerEntity?.stats?.Personality ?? 50)
      : Number(playerEntity?.stats?.Intelligence ?? 50);

    const difficulty = isEtiquette ? 55 : 50;
    const roll = Math.floor(rng() * 100);
    const score = Math.floor(skillVal * 0.7 + statVal * 0.3);

    if (roll + score >= difficulty + 50) {
      return {
        outcome: CHECKPOINT_OUTCOME.PASSED_DIPLOMACY,
        message: isEtiquette
          ? 'Your authoritative poise and noble diction convince the guard this is urgent official business. "Understood, pass through."'
          : 'With quiet wit and street knowledge, you convince the guards you pose no threat. "Alright, slip through, quietly."',
      };
    }

    // Check narrow failure for Luck reroll
    const delta = (difficulty + 50) - (roll + score);
    const luckThreshold = LivingTamrielConfig.luckRerollThreshold || 5;

    if (delta <= luckThreshold && dice100(Math.trunc(luck / 2), rng())) {
      return {
        outcome: CHECKPOINT_OUTCOME.LUCK_SAVED,
        message: 'By blind fortune, a courier horn sounds in the distance, distracting the guards and waving you through!',
      };
    }

    return {
      outcome: CHECKPOINT_OUTCOME.REFUSED,
      message: 'The guards are unimpressed by your words. "Nice speech, but regulations are regulations. Halt!"',
    };
  }

  // Fallback: forceful defiance
  return {
    outcome: CHECKPOINT_OUTCOME.HOSTILE,
    message: 'The guards draw their halberds. "Intruder! Sound the alarm! To arms!"',
  };
}
