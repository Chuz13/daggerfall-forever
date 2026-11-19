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
  DRUNKEN_BRAWLER: 'DRUNKEN_BRAWLER', // Tavern/street drunk looking for coin or a fight
  BROKEN_CART_MERCHANT: 'BROKEN_CART_MERCHANT', // Merchant with broken cart axle
  STRAY_HOUND_HANDLER: 'STRAY_HOUND_HANDLER',   // Ranger tending an injured hound
  STREET_PREACHER: 'STREET_PREACHER',           // Alms-seeking street monk
  ACCUSED_URCHIN: 'ACCUSED_URCHIN',             // Cornered pickpocket fleeing debt
  BOASTFUL_DUELIST: 'BOASTFUL_DUELIST',         // Proud knight seeking duelists
});

export const PEACE_PLEA_TYPES = Object.freeze([
  PLEA_TYPE.DRUNKEN_BRAWLER,
  PLEA_TYPE.BROKEN_CART_MERCHANT,
  PLEA_TYPE.STRAY_HOUND_HANDLER,
  PLEA_TYPE.STREET_PREACHER,
  PLEA_TYPE.ACCUSED_URCHIN,
  PLEA_TYPE.BOASTFUL_DUELIST,
  PLEA_TYPE.ESCORT_REQUEST,
]);

export const PLEA_GOLD_COSTS = Object.freeze({
  [PLEA_TYPE.PLAGUE_CURE]: 35,
  [PLEA_TYPE.FAMINE_BREAD]: 15,
  [PLEA_TYPE.WAR_REFUGEE]: 50,
  [PLEA_TYPE.ESCORT_REQUEST]: 25,
  [PLEA_TYPE.DRUNKEN_BRAWLER]: 15,
  [PLEA_TYPE.BROKEN_CART_MERCHANT]: 30,
  [PLEA_TYPE.STRAY_HOUND_HANDLER]: 20,
  [PLEA_TYPE.STREET_PREACHER]: 20,
  [PLEA_TYPE.ACCUSED_URCHIN]: 25,
  [PLEA_TYPE.BOASTFUL_DUELIST]: 25,
});

export const PLEA_OUTCOME = Object.freeze({
  HELPED: 'HELPED',                   // Player aided NPC -> Reputation gain + blessing
  PARTED_PEACEFULLY: 'PARTED_PEACEFULLY', // Polite decline with Etiquette/Luck
  REBUFFED: 'REBUFFED',               // Rude refusal -> Curse/resentment
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS', // Attempted to help without required gold
});

export const PLEA_COOLDOWN_MINUTES = 90; // 1.5 in-game hours between ambient pleas

function messageKeyForPlea(type) {
  if (type === PLEA_TYPE.PLAGUE_CURE) return 'living.plea.plague';
  if (type === PLEA_TYPE.FAMINE_BREAD) return 'living.plea.famine';
  if (type === PLEA_TYPE.WAR_REFUGEE) return 'living.plea.war';
  if (type === PLEA_TYPE.DRUNKEN_BRAWLER) return 'living.plea.drunk';
  if (type === PLEA_TYPE.BROKEN_CART_MERCHANT) return 'living.plea.cart';
  if (type === PLEA_TYPE.STRAY_HOUND_HANDLER) return 'living.plea.hound';
  if (type === PLEA_TYPE.STREET_PREACHER) return 'living.plea.preacher';
  if (type === PLEA_TYPE.ACCUSED_URCHIN) return 'living.plea.urchin';
  if (type === PLEA_TYPE.BOASTFUL_DUELIST) return 'living.plea.duelist';
  return 'living.plea.escort';
}

/**
 * Checks whether an ambient NPC plea should emerge for the player.
 * @param {{ regionIndex: number, nowMinutes: number, playerEntity?: any, rng?: () => number, force?: boolean, forcedPleaType?: string|null }} params
 * @returns {{ shouldPlea: boolean, plea: { type: string, requiredGold: number, messageKey: string }|null }}
 */
export function evaluatePleaEncounter({
  regionIndex,
  nowMinutes,
  playerEntity = null,
  rng = Math.random,
  force = false,
  forcedPleaType = null,
}) {
  const tier = Number(LivingTamrielConfig.urban ?? LivingTamrielConfig.wilderness);
  if (!force && tier === PRESENCE.OFF) {
    return { shouldPlea: false, plea: null };
  }

  const root = getLivingDirectorState();
  if (!root.subsystems.pleas) {
    root.subsystems.pleas = { lastPleaMinute: -999999 };
  }

  // 1. Cooldown check (90 game minutes)
  const lastMinute = Number(root.subsystems.pleas.lastPleaMinute) || -999999;
  if (!force && nowMinutes - lastMinute < PLEA_COOLDOWN_MINUTES) {
    return { shouldPlea: false, plea: null };
  }

  // 2. Base chance by presence tier (LIGHT: 10%, MID: 25%, HIGH: 40%)
  const baseChance = tier === PRESENCE.LIGHT ? 10 : tier === PRESENCE.HIGH ? 40 : 25;
  if (!force && rng() * 100 > baseChance) {
    return { shouldPlea: false, plea: null };
  }

  // 3. Determine plea type based on explicit override, crisis, or grounded peace pool
  const regState = getRegionState(regionIndex);
  /** @type {string} */
  let type = PLEA_TYPE.ESCORT_REQUEST;

  if (forcedPleaType && Object.values(PLEA_TYPE).includes(/** @type {any} */ (forcedPleaType))) {
    type = forcedPleaType;
  } else if (regState?.crisis === CRISIS_TYPE.PLAGUE) {
    type = PLEA_TYPE.PLAGUE_CURE;
  } else if (regState?.crisis === CRISIS_TYPE.FAMINE) {
    type = PLEA_TYPE.FAMINE_BREAD;
  } else if (regState?.crisis === CRISIS_TYPE.WAR || regState?.crisis === CRISIS_TYPE.CIVIL_STRIFE) {
    type = PLEA_TYPE.WAR_REFUGEE;
  } else {
    const idx = Math.floor(rng() * PEACE_PLEA_TYPES.length) % PEACE_PLEA_TYPES.length;
    type = PEACE_PLEA_TYPES[idx];
  }

  return {
    shouldPlea: true,
    plea: {
      type,
      requiredGold: PLEA_GOLD_COSTS[type] ?? 25,
      messageKey: messageKeyForPlea(type),
    },
  };
}

/**
 * Resolves the player's response to an ambient NPC plea.
 * @param {{ plea: any, playerEntity: any, regionIndex: number, response: 'HELP'|'REFUSE_POLITE'|'REFUSE_RUDE', goldOffered?: number, nowMinutes?: number, rng?: () => number }} params
 * @returns {{ outcome: string, messageKey: string, repDelta: number, goldSpent: number, potionUsed?: boolean, blessed?: boolean, spawnMugger?: boolean, provoked?: boolean, spawnBackup?: boolean, grantHealingPotion?: boolean, fullRestore?: boolean, bonusXp?: number, degree?: string, rollResult?: any }}
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
  const isGroundedPeaceScene =
    PEACE_PLEA_TYPES.includes(/** @type {any} */ (plea?.type)) &&
    plea?.type !== PLEA_TYPE.ESCORT_REQUEST;

  if (response === 'HELP') {
    let potionUsed = false;
    if (
      (plea.type === PLEA_TYPE.PLAGUE_CURE || plea.type === PLEA_TYPE.STRAY_HOUND_HANDLER) &&
      Array.isArray(playerEntity?.items)
    ) {
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
        provoked: false,
        spawnBackup: false,
      };
    }

    const repGain =
      plea.type === PLEA_TYPE.BROKEN_CART_MERCHANT ||
      plea.type === PLEA_TYPE.STRAY_HOUND_HANDLER ||
      plea.type === PLEA_TYPE.BOASTFUL_DUELIST
        ? 4
        : 3;
    const fullRestore = plea.type === PLEA_TYPE.STREET_PREACHER;
    const grantHealingPotion = plea.type === PLEA_TYPE.BROKEN_CART_MERCHANT;
    const bonusXp =
      plea.type === PLEA_TYPE.ACCUSED_URCHIN || plea.type === PLEA_TYPE.BOASTFUL_DUELIST ? 60 : 0;

    // Award regional reputation, lower regional tension, and bless player vitals
    root.subsystems.pleas.lastPleaMinute = nowMinutes;
    if (playerEntity && typeof playerEntity === 'object') {
      const currentRep = Number(
        playerEntity.legalRep?.[regionIndex] ?? playerEntity.regionalReputations?.[regionIndex] ?? 0,
      );
      const nextRep = Math.max(-100, Math.min(100, currentRep + repGain));
      if (!playerEntity.legalRep || typeof playerEntity.legalRep !== 'object') {
        playerEntity.legalRep = {};
      }
      playerEntity.legalRep[regionIndex] = nextRep;
      if (!playerEntity.regionalReputations || typeof playerEntity.regionalReputations !== 'object') {
        playerEntity.regionalReputations = {};
      }
      playerEntity.regionalReputations[regionIndex] = nextRep;
      if (fullRestore) {
        if (typeof playerEntity.maxHealth === 'number') {
          playerEntity.health = playerEntity.maxHealth;
          if (typeof playerEntity.currentHealth === 'number') {
            playerEntity.currentHealth = playerEntity.maxHealth;
          }
        }
        if (typeof playerEntity.maxFatigue === 'number') {
          playerEntity.fatigue = playerEntity.maxFatigue;
        }
      } else {
        if (typeof playerEntity.health === 'number' && typeof playerEntity.maxHealth === 'number') {
          playerEntity.health = Math.min(playerEntity.maxHealth, playerEntity.health + 15);
        }
        if (typeof playerEntity.currentHealth === 'number' && typeof playerEntity.maxHealth === 'number') {
          playerEntity.currentHealth = Math.min(playerEntity.maxHealth, playerEntity.currentHealth + 15);
        }
        if (plea.type === PLEA_TYPE.STRAY_HOUND_HANDLER && typeof playerEntity.maxFatigue === 'number') {
          playerEntity.fatigue = Math.min(playerEntity.maxFatigue, Number(playerEntity.fatigue ?? 0) + 50);
        }
      }
    }
    const regState = getRegionState(regionIndex);
    if (regState && typeof regState.tension === 'number') {
      regState.tension = Math.max(0, regState.tension - 4);
    }

    return {
      outcome: PLEA_OUTCOME.HELPED,
      messageKey: 'living.plea.helped',
      repDelta: repGain,
      goldSpent: potionUsed ? 0 : plea.requiredGold,
      potionUsed,
      blessed: true,
      spawnMugger: false,
      provoked: false,
      spawnBackup: false,
      grantHealingPotion,
      fullRestore,
      bonusXp,
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
        provoked: false,
        spawnBackup: false,
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
      provoked: false,
      spawnBackup: false,
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
  const spawnMugger = !isGroundedPeaceScene && rng() < 0.40;
  return {
    outcome: PLEA_OUTCOME.REBUFFED,
    messageKey: 'living.plea.rebuffed',
    repDelta: -2,
    goldSpent: 0,
    potionUsed: false,
    blessed: false,
    spawnMugger,
    provoked: true,
    spawnBackup: isGroundedPeaceScene,
  };
}
