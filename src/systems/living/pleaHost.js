// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// PLEA & EMERGENCE ENCOUNTER HOST (Living Tamriel)
//
// Governs dynamic NPC requests for aid, situational dilemmas, and reactive
// roleplay encounters in towns and along highways based on:
//  - Regional crisis states (Plague fever, Famine starvation, Wartime refugees).
//  - Social interaction checks (Etiquette, Streetwise, Luck).
//  - Local provincial reputation gains on charitable actions.
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getRegionState, CRISIS_TYPE } from './regionState.js';
import { getLivingDirectorState } from './livingDirector.js';
import { SKILLS } from '../skills.js';
import { resolveLivingRoll } from './livingRolls.js';

export const PLEA_TYPE = Object.freeze({
  PLAGUE_CURE: 'PLAGUE_CURE',         // Asking for a cure or remedy in plague outbreak
  FAMINE_BREAD: 'FAMINE_BREAD',       // Begging for grain/bread or coins during famine
  WAR_REFUGEE: 'WAR_REFUGEE',         // Displaced refugees asking for transit fare
  ESCORT_REQUEST: 'ESCORT_REQUEST',   // Traveler requesting protection along dangerous road
});

export const PLEA_OUTCOME = Object.freeze({
  HELPED: 'HELPED',                   // Player aided NPC -> Reputation gain + blessing
  PARTED_PEACEFULLY: 'PARTED_PEACEFULLY', // Polite decline with Etiquette/Luck
  REBUFFED: 'REBUFFED',               // Rude refusal -> Curse/resentment
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS', // Attempted to help without required gold
});

export const PLEA_COOLDOWN_MINUTES = 720; // 12 in-game hours between ambient pleas

/**
 * Checks whether an ambient NPC plea should emerge for the player.
 *
 * @param {Object} params
 * @param {number} params.regionIndex Current region index (0..70)
 * @param {number} params.nowMinutes Current game clock minute
 * @param {any} [params.playerEntity]
 * @param {() => number} [params.rng]
 * @returns {{ shouldPlea: boolean, plea: { type: string, requiredGold: number, messageKey: string }|null }}
 */
export function evaluatePleaEncounter({
  regionIndex,
  nowMinutes,
  playerEntity = null,
  rng = Math.random,
}) {
  const tier = Number(LivingTamrielConfig.urban ?? LivingTamrielConfig.wilderness);
  if (tier === PRESENCE.OFF) {
    return { shouldPlea: false, plea: null };
  }

  const root = getLivingDirectorState();
  if (!root.subsystems.pleas) {
    root.subsystems.pleas = { lastPleaMinute: -999999 };
  }

  // 1. Cooldown check (12 game hours)
  const lastMinute = Number(root.subsystems.pleas.lastPleaMinute) || -999999;
  if (nowMinutes - lastMinute < PLEA_COOLDOWN_MINUTES) {
    return { shouldPlea: false, plea: null };
  }

  // 2. Base chance by presence tier (LIGHT: 10%, MID: 25%, HIGH: 40%)
  const baseChance = tier === PRESENCE.LIGHT ? 10 : tier === PRESENCE.HIGH ? 40 : 25;
  if (rng() * 100 > baseChance) {
    return { shouldPlea: false, plea: null };
  }

  // 3. Determine plea type based on regional crisis
  const regState = getRegionState(regionIndex);
  /** @type {string} */
  let type = PLEA_TYPE.ESCORT_REQUEST;
  let requiredGold = 25;
  let messageKey = 'living.plea.escort';

  if (regState?.crisis === CRISIS_TYPE.PLAGUE) {
    type = PLEA_TYPE.PLAGUE_CURE;
    requiredGold = 35;
    messageKey = 'living.plea.plague';
  } else if (regState?.crisis === CRISIS_TYPE.FAMINE) {
    type = PLEA_TYPE.FAMINE_BREAD;
    requiredGold = 15;
    messageKey = 'living.plea.famine';
  } else if (regState?.crisis === CRISIS_TYPE.WAR || regState?.crisis === CRISIS_TYPE.CIVIL_STRIFE) {
    type = PLEA_TYPE.WAR_REFUGEE;
    requiredGold = 50;
    messageKey = 'living.plea.war';
  }

  return {
    shouldPlea: true,
    plea: {
      type,
      requiredGold,
      messageKey,
    },
  };
}

/**
 * Resolves the player's response to an ambient NPC plea.
 *
 * @param {Object} params
 * @param {Object} params.plea The active plea record
 * @param {any} params.playerEntity
 * @param {number} params.regionIndex
 * @param {'HELP'|'REFUSE_POLITE'|'REFUSE_RUDE'} params.response
 * @param {number} [params.goldOffered=0]
 * @param {number} [params.nowMinutes=0]
 * @param {() => number} [params.rng=Math.random]
 * @returns {{ outcome: string, messageKey: string, repDelta: number, goldSpent: number, potionUsed?: boolean, blessed?: boolean, spawnMugger?: boolean }}
 */
export function resolvePleaResponse({
  plea,
  playerEntity,
  regionIndex,
  response,
  goldOffered = 0,
  nowMinutes = 0,
  rng = Math.random,
}) {
  const root = getLivingDirectorState();
  if (!root.subsystems.pleas) {
    root.subsystems.pleas = { lastPleaMinute: -999999 };
  }

  if (response === 'HELP') {
    let potionUsed = false;
    if (plea.type === PLEA_TYPE.PLAGUE_CURE && Array.isArray(playerEntity?.items)) {
      const pIdx = playerEntity.items.findIndex(
        (it) => it && (it.group === 'Potions' || /potion|cure|heal|remedy|elixir/i.test(String(it.shortName || it.name || ''))),
      );
      if (pIdx >= 0) {
        playerEntity.items.splice(pIdx, 1);
        potionUsed = true;
      }
    }

    if (!potionUsed && goldOffered < plea.requiredGold) {
      return {
        outcome: PLEA_OUTCOME.INSUFFICIENT_FUNDS,
        messageKey: plea.messageKey,
        repDelta: 0,
        goldSpent: 0,
        potionUsed: false,
        blessed: false,
        spawnMugger: false,
      };
    }

    // Award regional reputation, lower regional tension, and bless player vitals
    root.subsystems.pleas.lastPleaMinute = nowMinutes;
    if (playerEntity && typeof playerEntity === 'object') {
      const currentRep = Number(
        playerEntity.legalRep?.[regionIndex] ?? playerEntity.regionalReputations?.[regionIndex] ?? 0,
      );
      const nextRep = Math.max(-100, Math.min(100, currentRep + 3));
      if (!playerEntity.legalRep || typeof playerEntity.legalRep !== 'object') {
        playerEntity.legalRep = {};
      }
      playerEntity.legalRep[regionIndex] = nextRep;
      if (!playerEntity.regionalReputations || typeof playerEntity.regionalReputations !== 'object') {
        playerEntity.regionalReputations = {};
      }
      playerEntity.regionalReputations[regionIndex] = nextRep;
      if (typeof playerEntity.health === 'number' && typeof playerEntity.maxHealth === 'number') {
        playerEntity.health = Math.min(playerEntity.maxHealth, playerEntity.health + 15);
      }
      if (typeof playerEntity.currentHealth === 'number' && typeof playerEntity.maxHealth === 'number') {
        playerEntity.currentHealth = Math.min(playerEntity.maxHealth, playerEntity.currentHealth + 15);
      }
    }
    const regState = getRegionState(regionIndex);
    if (regState && typeof regState.tension === 'number') {
      regState.tension = Math.max(0, regState.tension - 4);
    }

    return {
      outcome: PLEA_OUTCOME.HELPED,
      messageKey: 'living.plea.helped',
      repDelta: 3,
      goldSpent: potionUsed ? 0 : plea.requiredGold,
      potionUsed,
      blessed: true,
      spawnMugger: false,
    };
  }

  if (response === 'REFUSE_POLITE') {
    root.subsystems.pleas.lastPleaMinute = nowMinutes;
    const rollRes = resolveLivingRoll({
      formulaId: 'SOCIAL_DIPLOMACY',
      playerEntity,
      skillId: SKILLS.Etiquette,
      statName: 'personality',
      difficulty: 25, // targetOffset 50 -> targetScore 75
      regionIndex,
      rng,
    });

    if (rollRes.passed) {
      return {
        outcome: PLEA_OUTCOME.PARTED_PEACEFULLY,
        degree: rollRes.degree,
        rollResult: rollRes,
        messageKey: 'living.plea.parted',
        repDelta: 0,
        goldSpent: 0,
        potionUsed: false,
        blessed: false,
        spawnMugger: false,
      };
    }

    return {
      outcome: PLEA_OUTCOME.REBUFFED,
      degree: rollRes.degree,
      rollResult: rollRes,
      messageKey: 'living.plea.rebuffed',
      repDelta: 0,
      goldSpent: 0,
      potionUsed: false,
      blessed: false,
      spawnMugger: false,
    };
  }

  // REFUSE_RUDE:
  root.subsystems.pleas.lastPleaMinute = nowMinutes;
  if (playerEntity && typeof playerEntity === 'object') {
    const currentRep = Number(
      playerEntity.legalRep?.[regionIndex] ?? playerEntity.regionalReputations?.[regionIndex] ?? 0,
    );
    const nextRep = Math.max(-100, Math.min(100, currentRep - 2));
    if (!playerEntity.legalRep || typeof playerEntity.legalRep !== 'object') {
      playerEntity.legalRep = {};
    }
    playerEntity.legalRep[regionIndex] = nextRep;
    if (!playerEntity.regionalReputations || typeof playerEntity.regionalReputations !== 'object') {
      playerEntity.regionalReputations = {};
    }
    playerEntity.regionalReputations[regionIndex] = nextRep;
  }
  const spawnMugger = rng() < 0.40;
  return {
    outcome: PLEA_OUTCOME.REBUFFED,
    messageKey: 'living.plea.rebuffed',
    repDelta: -2,
    goldSpent: 0,
    potionUsed: false,
    blessed: false,
    spawnMugger,
  };
}
