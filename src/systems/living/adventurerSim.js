// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// ADVENTURER SIMULATION ENGINE 2.0 (Living Tamriel)
//
// Background simulation of virtual adventurers exploring Tamriel, clearing
// dungeons, leveling up to level cap (45), upgrading gear tiers (1..9), and
// leaving fallen remains in boss chests upon demise.
//
// Features 2.0:
//  - Immediate newcomer generation on demise (constant regional population).
//  - Personality traits (Honorable, Arrogant, Envious, Cutthroat, Duelist, etc.).
//  - Rivalry, tension, honor duels & dares ("на слабо") with gold wagers.
//  - Quest competition toggle: non-main quests can be intercepted, with
//    duels, buyouts, or etiquette appeals to reclaim the spoils.
//  - Full parity with level 45 and canonical skill/luck checks.
// ═══════════════════════════════════════════════════════════════════════════════

import { BAY_REGION_COUNT, REGION_NAMES } from '../../formats/mapsTables.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getLivingDirectorState } from './livingDirector.js';
import { LEVEL_CAP } from '../levelCap.js';
import { isMainStoryDungeon } from '../../world/dungeon/dungeonTextures.js';
import { SKILLS, skillValue } from '../skills.js';
import { dice100 } from '../../combat/formulas.js';

export const TOTAL_REGION_COUNT = REGION_NAMES.length;

export const ADVENTURER_CLASSES = Object.freeze([
  'Warrior', 'Knight', 'Barbarian', 'Rogue', 'Thief', 'Assassin',
  'Mage', 'Sorcerer', 'Battlemage', 'Spellsword', 'Nightblade', 'Healer',
]);

export const ADVENTURER_TRAITS = Object.freeze([
  'HONORABLE',  // Chivalrous, values fair combat, respects player if rep >= 0
  'ARROGANT',   // Condescending, challenges player to wagers / dares ("на слабо")
  'ENVIOUS',    // Bitter rival, mocks player, easily provoked into hostility
  'CUTTHROAT',  // Ruthless opportunist, demands extortion or ambush
  'DUELIST',    // Seeks constant martial contests of honor
  'MERCENARY',  // Pragmatic, driven by gold, easily bought out
  'CAUTIOUS',   // Prudent survivor, backs down when outmatched
]);

export const ADVENTURER_STATUS = Object.freeze({
  IDLE: 'IDLE',
  TRAVELING: 'TRAVELING',
  DELVING: 'DELVING',
  DEAD: 'DEAD',
});

export const RIVALRY_ATTITUDES = Object.freeze({
  AMICABLE: 'AMICABLE',
  HONORABLE: 'HONORABLE',
  TENSE: 'TENSE',
  RIVAL: 'RIVAL',
  HOSTILE: 'HOSTILE',
});

export const CHALLENGE_TYPE = Object.freeze({
  HONOR_DUEL: 'HONOR_DUEL',
  DARE: 'DARE',
  ENVY_PROVOCATION: 'ENVY_PROVOCATION',
  EXTORTION: 'EXTORTION',
  MUTUAL_RESPECT: 'MUTUAL_RESPECT',
});

export const DUEL_OUTCOME = Object.freeze({
  PLAYER_WON: 'PLAYER_WON',
  PLAYER_LOST: 'PLAYER_LOST',
  LUCK_REVERSAL: 'LUCK_REVERSAL',
  DECLINED: 'DECLINED',
  HOSTILE_DRAW: 'HOSTILE_DRAW',
  DIPLOMACY_PEACE: 'DIPLOMACY_PEACE',
});

export const RECLAIM_OUTCOME = Object.freeze({
  DUEL_WON: 'DUEL_WON',
  DUEL_LOST: 'DUEL_LOST',
  BOUGHT_BACK: 'BOUGHT_BACK',
  INSUFFICIENT_GOLD: 'INSUFFICIENT_GOLD',
  CONVINCED_ETIQUETTE: 'CONVINCED_ETIQUETTE',
  FORFEITED: 'FORFEITED',
});

/**
 * Checks whether a dungeon is immune to adventurer simulation clearing.
 *
 * If allowCompetition is false:
 *   All active quest sites are completely immune.
 * If allowCompetition is true:
 *   Main story quests are strictly immune, but side/guild quests allow competition!
 *
 * @param {number|string} locationId MapId or location identifier
 * @param {Array<{ mapId: number|string, isMainQuest?: boolean, isMainStory?: boolean, type?: string }>} [activeQuestSites]
 * @param {boolean} [allowCompetition]
 * @returns {boolean} True if the location is immune to adventurer clearing
 */
export function isQuestImmuneLocation(
  locationId,
  activeQuestSites = [],
  allowCompetition = LivingTamrielConfig.allowQuestCompetition
) {
  if (!activeQuestSites || !Array.isArray(activeQuestSites) || !locationId) return false;
  const site = activeQuestSites.find((s) => s && String(s.mapId) === String(locationId));
  if (!site) return false;

  // If competition is turned OFF, all active quest locations are strictly shielded
  if (!allowCompetition) return true;

  // When competition is active, main storyline quests REMAIN strictly shielded!
  const isMain = Boolean(
    site.isMainQuest ||
    site.isMainStory ||
    site.type === 'MAIN' ||
    (typeof locationId === 'number' && isMainStoryDungeon(locationId))
  );
  if (isMain) return true;

  // Non-main quest sites allow healthy adventurer competition
  return false;
}

/**
 * Creates a randomized virtual adventurer record.
 * @param {number} id Unique identifier
 * @param {number} regionIndex Region of origin (0..70)
 * @param {() => number} [rng]
 */
export function createVirtualAdventurer(id, regionIndex, rng = Math.random) {
  const classIndex = Math.floor(rng() * ADVENTURER_CLASSES.length);
  const className = ADVENTURER_CLASSES[classIndex];
  const trait = ADVENTURER_TRAITS[Math.floor(rng() * ADVENTURER_TRAITS.length)];
  const level = 1 + Math.floor(rng() * 4); // Initial levels 1..4

  return {
    id,
    name: `${className}_${id}`,
    className,
    trait,
    level,
    gearTier: 1, // Iron / Steel tier (scales 1..9 up to level 45)
    currentRegion: regionIndex,
    targetLocationId: null,
    status: ADVENTURER_STATUS.IDLE,
    daysRemainingInAction: 0,
    delveSuccessCount: 0,
    duelsWon: 0,
    duelsLost: 0,
  };
}

/**
 * Returns the adventurer registry from the director state.
 * @returns {Record<string, any>}
 */
export function getAdventurerSimRegistry() {
  const root = getLivingDirectorState();
  if (!root.subsystems.adventurers || typeof root.subsystems.adventurers !== 'object') {
    root.subsystems.adventurers = {};
  }
  const adv = root.subsystems.adventurers;
  if (!Array.isArray(adv.pool)) {
    adv.pool = [];
  }
  if (!adv.dungeonCooldowns || typeof adv.dungeonCooldowns !== 'object') {
    adv.dungeonCooldowns = {};
  }
  if (!adv.fallenRemains || typeof adv.fallenRemains !== 'object') {
    adv.fallenRemains = {};
  }
  if (!adv.interceptedQuests || typeof adv.interceptedQuests !== 'object') {
    adv.interceptedQuests = {};
  }
  return adv;
}

/**
 * Ensures the virtual adventurer pool is initialized for active regions.
 * Default region count is BAY_REGION_COUNT (62) for backward compatibility;
 * supports full Tamriel (TOTAL_REGION_COUNT = 71).
 *
 * @param {(() => number)|{ rng?: () => number, regionCount?: number }} [rngOrOptions]
 * @param {number} [regionCount]
 */
export function ensureAdventurerPool(rngOrOptions = Math.random, regionCount = BAY_REGION_COUNT) {
  let rng = Math.random;
  let count = regionCount;

  if (typeof rngOrOptions === 'function') {
    rng = rngOrOptions;
  } else if (typeof rngOrOptions === 'object' && rngOrOptions !== null) {
    if (typeof rngOrOptions.rng === 'function') rng = rngOrOptions.rng;
    if (typeof rngOrOptions.regionCount === 'number') count = rngOrOptions.regionCount;
  }

  const reg = getAdventurerSimRegistry();
  if (!Array.isArray(reg.pool)) {
    reg.pool = [];
  }

  const poolPerRegion = LivingTamrielConfig.adventurerPoolPerRegion || 13;
  const targetTotal = poolPerRegion * count;

  if (reg.pool.length < targetTotal) {
    let nextId = (reg.nextId || reg.pool.length) + 1;
    for (let r = 0; r < count; r++) {
      const currentInRegion = reg.pool.filter(
        (a) => a.currentRegion === r && a.status !== ADVENTURER_STATUS.DEAD
      ).length;
      for (let i = currentInRegion; i < poolPerRegion; i++) {
        reg.pool.push(createVirtualAdventurer(nextId++, r, rng));
      }
    }
    reg.nextId = nextId;
  }
  return reg.pool;
}

/**
 * Simulates one daily step for the entire adventurer ecosystem.
 *
 * @param {Object} [params]
 * @param {Array<{ mapId: number|string, isMainQuest?: boolean }>} [params.activeQuestSites] List of active player quest sites
 * @param {() => number} [params.rng]
 */
export function tickAdventurerSimulation({ activeQuestSites = [], rng = Math.random } = {}) {
  const tier = Number(LivingTamrielConfig.adventurers);
  if (tier === PRESENCE.OFF) return;

  const reg = getAdventurerSimRegistry();
  const pool = ensureAdventurerPool(rng);
  const allowComp = Boolean(LivingTamrielConfig.allowQuestCompetition);

  // 1. Tick dungeon cooldowns down
  if (reg.dungeonCooldowns) {
    for (const [locId, days] of Object.entries(reg.dungeonCooldowns)) {
      if (days <= 1) {
        delete reg.dungeonCooldowns[locId];
      } else {
        reg.dungeonCooldowns[locId] = days - 1;
      }
    }
  }

  // 2. Process each adventurer's action
  const initialPoolLength = pool.length;
  for (let i = 0; i < initialPoolLength; i++) {
    const adv = pool[i];
    if (adv.status === ADVENTURER_STATUS.DEAD) {
      continue;
    }

    if (adv.daysRemainingInAction > 1) {
      adv.daysRemainingInAction--;
      continue;
    }

    // Action finishes today
    if (adv.status === ADVENTURER_STATUS.DELVING) {
      const locId = adv.targetLocationId;
      const isImmune = isQuestImmuneLocation(locId, activeQuestSites, allowComp);

      // Roll delve outcome: Success chance based on level
      const baseSuccess = 0.55 + Math.min(0.35, adv.level * 0.02);
      const success = !isImmune && rng() < baseSuccess;

      if (success) {
        adv.status = ADVENTURER_STATUS.IDLE;
        adv.delveSuccessCount++;
        adv.daysRemainingInAction = 0;

        // Level up & gear upgrade up to LEVEL_CAP (45 parity)
        if (adv.delveSuccessCount % 2 === 0 && adv.level < LEVEL_CAP) {
          adv.level++;
          // Gear tiers 1..9 (Iron/Steel to Daedric/Artifact)
          adv.gearTier = Math.min(9, Math.floor(adv.level / 5) + 1);
        }

        // Apply dungeon clear cooldown (3..5 days)
        if (locId) {
          const cooldownDays = 3 + Math.floor(rng() * 3);
          reg.dungeonCooldowns[locId] = cooldownDays;

          // If this dungeon was a non-main quest site and competition is ON, intercept!
          if (allowComp && activeQuestSites?.length) {
            const matchedSite = activeQuestSites.find((s) => s && String(s.mapId) === String(locId));
            if (matchedSite && !matchedSite.isMainQuest) {
              reg.interceptedQuests[locId] = {
                questId: matchedSite.mapId,
                locationId: locId,
                adventurerId: adv.id,
                adventurerName: adv.name,
                adventurerClass: adv.className,
                adventurerLevel: adv.level,
                adventurerTrait: adv.trait,
                recovered: false,
                claimedByAdventurer: true,
              };
            }
          }
        }
      } else {
        // Demise in dungeon: Leave gear as loot in boss chest
        adv.status = ADVENTURER_STATUS.DEAD;
        adv.daysRemainingInAction = 0;

        if (locId) {
          if (!reg.fallenRemains[locId]) {
            reg.fallenRemains[locId] = [];
          }
          reg.fallenRemains[locId].push({
            adventurerName: adv.name,
            className: adv.className,
            trait: adv.trait,
            level: adv.level,
            gearTier: adv.gearTier,
          });
        }

        // IMMEDIATELY RESPAWN A FRESH NEWCOMER INTO THIS REGION!
        // Preserves ecosystem density so Tamriel never feels depopulated
        reg.nextId = (reg.nextId || pool.length) + 1;
        const newcomer = createVirtualAdventurer(reg.nextId, adv.currentRegion, rng);
        pool.push(newcomer);
      }
      adv.targetLocationId = null;
      continue;
    }

    // Currently IDLE: Pick next endeavor (Move or Delve)
    if (rng() < 0.60) {
      // Start a dungeon delve
      const mockDungeonId = `dungeon_${adv.currentRegion}_${Math.floor(rng() * 10)}`;
      if (!isQuestImmuneLocation(mockDungeonId, activeQuestSites, allowComp)) {
        adv.status = ADVENTURER_STATUS.DELVING;
        adv.targetLocationId = mockDungeonId;
        adv.daysRemainingInAction = 2 + Math.floor(rng() * 2);
      }
    } else {
      // Travel to adjacent region
      const neighborRegion = (adv.currentRegion + 1) % BAY_REGION_COUNT;
      adv.status = ADVENTURER_STATUS.TRAVELING;
      adv.currentRegion = neighborRegion;
      adv.daysRemainingInAction = 1 + Math.floor(rng() * 2);
    }
  }
}

/**
 * Checks whether a dungeon is currently in cleared cooldown (monsters suppressed).
 * @param {string|number} locationId
 * @returns {boolean}
 */
export function isDungeonInCooldown(locationId) {
  const reg = getAdventurerSimRegistry();
  return typeof reg.dungeonCooldowns?.[locationId] === 'number';
}

/**
 * Returns any fallen adventurer remains in a specific dungeon, removing them once claimed.
 * @param {string|number} locationId
 * @returns {Array<any>|null}
 */
export function claimFallenAdventurerRemains(locationId) {
  const reg = getAdventurerSimRegistry();
  if (reg.fallenRemains?.[locationId]?.length) {
    const loot = [...reg.fallenRemains[locationId]];
    delete reg.fallenRemains[locationId];
    return loot;
  }
  return null;
}

/**
 * Evaluates tension and challenge dynamics between an adventurer and the player.
 *
 * @param {Object} adv Adventurer record
 * @param {any} playerEntity Player state
 * @returns {{ attitude: string, tensionScore: number, challengeType: string, wagerGold: number }}
 */
export function evaluateAdventurerTension(adv, playerEntity) {
  const playerLevel = Number(playerEntity?.level ?? 1);
  const playerRep = Number(playerEntity?.regionalReputations?.[adv.currentRegion] ?? 0);

  let tensionScore = 20;
  /** @type {string} */
  let attitude = RIVALRY_ATTITUDES.TENSE;
  /** @type {string} */
  let challengeType = CHALLENGE_TYPE.HONOR_DUEL;
  let wagerGold = Math.max(25, adv.level * 15);

  switch (adv.trait) {
    case 'ENVIOUS':
      // Envious of player's superior level or renown
      if (playerLevel >= adv.level) {
        tensionScore += 45;
        attitude = RIVALRY_ATTITUDES.RIVAL;
        challengeType = CHALLENGE_TYPE.ENVY_PROVOCATION;
      } else {
        tensionScore += 25;
        attitude = RIVALRY_ATTITUDES.TENSE;
        challengeType = CHALLENGE_TYPE.DARE;
      }
      break;

    case 'ARROGANT':
      // Dares the player "на слабо" with a bold wager
      attitude = RIVALRY_ATTITUDES.RIVAL;
      challengeType = CHALLENGE_TYPE.DARE;
      wagerGold *= 2;
      tensionScore += 35;
      break;

    case 'DUELIST':
      // Pure martial honor
      attitude = RIVALRY_ATTITUDES.HONORABLE;
      challengeType = CHALLENGE_TYPE.HONOR_DUEL;
      tensionScore += 15;
      break;

    case 'CUTTHROAT':
      attitude = RIVALRY_ATTITUDES.HOSTILE;
      challengeType = CHALLENGE_TYPE.EXTORTION;
      tensionScore += 60;
      break;

    case 'MERCENARY':
      attitude = RIVALRY_ATTITUDES.TENSE;
      challengeType = CHALLENGE_TYPE.DARE;
      tensionScore += 20;
      break;

    case 'HONORABLE':
      if (playerRep >= 0) {
        attitude = RIVALRY_ATTITUDES.HONORABLE;
        challengeType = CHALLENGE_TYPE.MUTUAL_RESPECT;
        tensionScore = 10;
      } else {
        attitude = RIVALRY_ATTITUDES.TENSE;
        challengeType = CHALLENGE_TYPE.HONOR_DUEL;
        tensionScore = 40;
      }
      break;

    case 'CAUTIOUS':
    default:
      if (playerLevel > adv.level) {
        attitude = RIVALRY_ATTITUDES.AMICABLE;
        challengeType = CHALLENGE_TYPE.MUTUAL_RESPECT;
        tensionScore = 5;
      } else {
        attitude = RIVALRY_ATTITUDES.TENSE;
        challengeType = CHALLENGE_TYPE.HONOR_DUEL;
        tensionScore = 20;
      }
      break;
  }

  return {
    attitude,
    tensionScore: Math.min(100, tensionScore),
    challengeType,
    wagerGold,
  };
}

/**
 * Resolves an encounter or duel with an adventurer.
 *
 * @param {Object} params
 * @param {Object} params.adv Adventurer entity
 * @param {any} params.playerEntity
 * @param {string} params.action - 'ACCEPT_DUEL' | 'ACCEPT_DARE' | 'INTIMIDATE' | 'APPEAL_ETIQUETTE' | 'DECLINE'
 * @param {number} [params.wagerGold=50]
 * @param {() => number} [params.rng=Math.random]
 * @returns {{ outcome: string, goldDelta: number, messageKey: string }}
 */
export function resolveAdventurerEncounter({
  adv,
  playerEntity,
  action,
  wagerGold = 50,
  rng = Math.random,
}) {
  const playerLevel = Number(playerEntity?.level ?? 1);
  const playerLuck = Number(playerEntity?.stats?.Luck ?? 50);

  if (action === 'DECLINE') {
    return {
      outcome: DUEL_OUTCOME.DECLINED,
      goldDelta: 0,
      messageKey: 'living.adventurer.reclaimFailed',
    };
  }

  if (action === 'ACCEPT_DUEL' || action === 'ACCEPT_DARE') {
    const playerCombatScore = playerLevel * 4 + Math.floor(rng() * 40);
    const advCombatScore = adv.level * 4 + Math.floor(rng() * 40);
    const margin = playerCombatScore - advCombatScore;

    if (margin >= 0) {
      adv.duelsLost = (adv.duelsLost || 0) + 1;
      return {
        outcome: DUEL_OUTCOME.PLAYER_WON,
        goldDelta: wagerGold,
        messageKey: 'living.adventurer.duelWon',
      };
    }

    // Near defeat: check Luck reroll threshold (margin <= 5)
    if (Math.abs(margin) <= LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck) {
      adv.duelsLost = (adv.duelsLost || 0) + 1;
      return {
        outcome: DUEL_OUTCOME.LUCK_REVERSAL,
        goldDelta: wagerGold,
        messageKey: 'living.adventurer.duelWon',
      };
    }

    adv.duelsWon = (adv.duelsWon || 0) + 1;
    return {
      outcome: DUEL_OUTCOME.PLAYER_LOST,
      goldDelta: -wagerGold,
      messageKey: 'living.adventurer.duelLost',
    };
  }

  if (action === 'INTIMIDATE') {
    const sw = skillValue(playerEntity, SKILLS.Streetwise);
    const difficulty = Math.min(95, adv.level * 3 + 30);
    const roll = dice100(rng);
    const margin = sw - difficulty;

    if (roll <= sw || (margin >= -LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck)) {
      return {
        outcome: DUEL_OUTCOME.DIPLOMACY_PEACE,
        goldDelta: 0,
        messageKey: 'living.adventurer.duelWon',
      };
    }
    return {
      outcome: DUEL_OUTCOME.HOSTILE_DRAW,
      goldDelta: 0,
      messageKey: 'living.adventurer.enviousTaunt',
    };
  }

  if (action === 'APPEAL_ETIQUETTE') {
    const et = skillValue(playerEntity, SKILLS.Etiquette);
    const bonus = adv.trait === 'HONORABLE' ? 20 : 0;
    const difficulty = Math.min(95, adv.level * 3 + 25 - bonus);
    const roll = dice100(rng);
    const margin = (et + bonus) - difficulty;

    if (roll <= et + bonus || (margin >= -LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck)) {
      return {
        outcome: DUEL_OUTCOME.DIPLOMACY_PEACE,
        goldDelta: 0,
        messageKey: 'living.adventurer.duelWon',
      };
    }
    return {
      outcome: DUEL_OUTCOME.HOSTILE_DRAW,
      goldDelta: 0,
      messageKey: 'living.adventurer.enviousTaunt',
    };
  }

  return {
    outcome: DUEL_OUTCOME.DECLINED,
    goldDelta: 0,
    messageKey: 'living.adventurer.reclaimFailed',
  };
}

/**
 * Confronts an adventurer who intercepted a non-main quest to reclaim the objective.
 *
 * @param {Object} params
 * @param {string|number} params.locationId
 * @param {any} params.playerEntity
 * @param {string} params.method - 'DUEL' | 'BUYOUT' | 'APPEAL' | 'FORFEIT'
 * @param {number} [params.goldOffered=0]
 * @param {() => number} [params.rng=Math.random]
 * @returns {{ outcome: string, recovered: boolean, goldCost?: number, messageKey: string }|null}
 */
export function confrontInterceptingAdventurer({
  locationId,
  playerEntity,
  method,
  goldOffered = 0,
  rng = Math.random,
}) {
  const reg = getAdventurerSimRegistry();
  const record = reg.interceptedQuests?.[locationId];
  if (!record || record.recovered) return null;

  const playerLuck = Number(playerEntity?.stats?.Luck ?? 50);

  if (method === 'FORFEIT') {
    record.forfeited = true;
    return {
      outcome: RECLAIM_OUTCOME.FORFEITED,
      recovered: false,
      messageKey: 'living.adventurer.reclaimFailed',
    };
  }

  if (method === 'DUEL') {
    const playerLevel = Number(playerEntity?.level ?? 1);
    const margin = (playerLevel * 4 + Math.floor(rng() * 35)) - (record.adventurerLevel * 4 + Math.floor(rng() * 35));

    if (margin >= 0 || (Math.abs(margin) <= LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck)) {
      record.recovered = true;
      return {
        outcome: RECLAIM_OUTCOME.DUEL_WON,
        recovered: true,
        messageKey: 'living.adventurer.reclaimSuccess',
      };
    }

    return {
      outcome: RECLAIM_OUTCOME.DUEL_LOST,
      recovered: false,
      messageKey: 'living.adventurer.duelLost',
    };
  }

  if (method === 'BUYOUT') {
    const sw = skillValue(playerEntity, SKILLS.Streetwise);
    const baseDemand = Math.max(100, record.adventurerLevel * 35);
    const discount = Math.min(0.40, sw * 0.004); // Up to 40% discount with high streetwise
    const requiredGold = Math.floor(baseDemand * (1 - discount));

    if (goldOffered >= requiredGold) {
      record.recovered = true;
      return {
        outcome: RECLAIM_OUTCOME.BOUGHT_BACK,
        recovered: true,
        goldCost: requiredGold,
        messageKey: 'living.adventurer.reclaimSuccess',
      };
    }

    return {
      outcome: RECLAIM_OUTCOME.INSUFFICIENT_GOLD,
      recovered: false,
      goldCost: requiredGold,
      messageKey: 'living.adventurer.reclaimFailed',
    };
  }

  if (method === 'APPEAL') {
    const et = skillValue(playerEntity, SKILLS.Etiquette);
    const bonus = record.adventurerTrait === 'HONORABLE' ? 25 : 0;
    const difficulty = Math.min(90, record.adventurerLevel * 3 + 20 - bonus);
    const roll = dice100(rng);
    const margin = (et + bonus) - difficulty;

    if (roll <= et + bonus || (margin >= -LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck)) {
      record.recovered = true;
      return {
        outcome: RECLAIM_OUTCOME.CONVINCED_ETIQUETTE,
        recovered: true,
        messageKey: 'living.adventurer.reclaimSuccess',
      };
    }

    return {
      outcome: RECLAIM_OUTCOME.DUEL_LOST,
      recovered: false,
      messageKey: 'living.adventurer.reclaimFailed',
    };
  }

  return null;
}
