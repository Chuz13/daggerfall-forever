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
import {
  resolveLivingRoll,
  computeRoleplayBribeMultiplier,
  readPlayerSkill,
  readPlayerStat,
} from './livingRolls.js';

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
  const idNum = Math.abs(Number(id) || Math.floor(rng() * ADVENTURER_FORENAMES.length));
  const forename = ADVENTURER_FORENAMES[idNum % ADVENTURER_FORENAMES.length];
  const name = `${forename} the ${className}`;

  return {
    id,
    name,
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
  // Prune any dead records from previous days before today's simulation step
  // so the pool never grows unbounded across long campaigns.
  if (Array.isArray(reg.pool) && reg.pool.some((a) => a.status === ADVENTURER_STATUS.DEAD)) {
    reg.pool = reg.pool.filter((a) => a.status !== ADVENTURER_STATUS.DEAD);
  }
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

    if (adv.status === ADVENTURER_STATUS.TRAVELING) {
      adv.status = ADVENTURER_STATUS.IDLE;
      adv.daysRemainingInAction = 0;
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
 * Supports both direct locationId match and deterministic regional dungeon slot matching
 * (`dungeon_<regionIndex>_<mapId % 10>`) for real MAPS.BSA dungeons.
 * @param {string|number} locationId
 * @param {number|null} [regionIndex=null]
 * @returns {boolean}
 */
export function isDungeonInCooldown(locationId, regionIndex = null) {
  const reg = getAdventurerSimRegistry();
  if (typeof reg.dungeonCooldowns?.[locationId] === 'number') return true;
  if (regionIndex != null && Number.isFinite(Number(locationId))) {
    const slotKey = `dungeon_${regionIndex}_${Math.abs(Math.trunc(Number(locationId))) % 10}`;
    if (typeof reg.dungeonCooldowns?.[slotKey] === 'number') return true;
  }
  return false;
}

/**
 * Returns any fallen adventurer remains in a specific dungeon, removing them once claimed.
 * Supports both direct locationId match and deterministic regional dungeon slot matching.
 * @param {string|number} locationId
 * @param {number|null} [regionIndex=null]
 * @returns {Array<any>|null}
 */
export function claimFallenAdventurerRemains(locationId, regionIndex = null) {
  const reg = getAdventurerSimRegistry();
  if (reg.fallenRemains?.[locationId]?.length) {
    const loot = [...reg.fallenRemains[locationId]];
    delete reg.fallenRemains[locationId];
    return loot;
  }
  if (regionIndex != null && Number.isFinite(Number(locationId))) {
    const slotKey = `dungeon_${regionIndex}_${Math.abs(Math.trunc(Number(locationId))) % 10}`;
    if (reg.fallenRemains?.[slotKey]?.length) {
      const loot = [...reg.fallenRemains[slotKey]];
      delete reg.fallenRemains[slotKey];
      return loot;
    }
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
  const playerLuck = readPlayerStat(playerEntity, 'luck', 50);

  if (action === 'DECLINE') {
    return {
      outcome: DUEL_OUTCOME.DECLINED,
      goldDelta: 0,
      messageKey: 'living.adventurer.reclaimFailed',
    };
  }

  if (action === 'ACCEPT_DUEL' || action === 'ACCEPT_DARE') {
    const advCombatScore = adv.level * 4 + Math.floor(rng() * 40);
    const duelRes = resolveLivingRoll({
      formulaId: 'TACTICAL_DUEL_WAGER',
      playerEntity,
      statName: 'strength',
      difficulty: advCombatScore,
      targetLevel: adv.level,
      allowLuckReroll: false,
      rng,
    });
    const margin = duelRes.margin;

    if (margin >= 0) {
      adv.duelsLost = (adv.duelsLost || 0) + 1;
      return {
        outcome: DUEL_OUTCOME.PLAYER_WON,
        degree: duelRes.degree,
        rollResult: duelRes,
        goldDelta: wagerGold,
        messageKey: 'living.adventurer.duelWon',
      };
    }

    // Near defeat: check Luck reroll threshold (margin <= 5)
    if (Math.abs(margin) <= LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck) {
      adv.duelsLost = (adv.duelsLost || 0) + 1;
      return {
        outcome: DUEL_OUTCOME.LUCK_REVERSAL,
        degree: 'PARTIAL',
        rollResult: duelRes,
        goldDelta: wagerGold,
        messageKey: 'living.adventurer.duelWon',
      };
    }

    adv.duelsWon = (adv.duelsWon || 0) + 1;
    return {
      outcome: DUEL_OUTCOME.PLAYER_LOST,
      degree: duelRes.degree,
      rollResult: duelRes,
      goldDelta: -wagerGold,
      messageKey: 'living.adventurer.duelLost',
    };
  }

  if (action === 'INTIMIDATE') {
    const sw = readPlayerSkill(playerEntity, SKILLS.Streetwise, 30);
    const pers = readPlayerStat(playerEntity, 'personality', 50);
    const statMod = Math.trunc((pers - 50) * 0.25);
    const difficulty = Math.min(95, adv.level * 3 + 30);
    const roll = Math.floor(rng() * 100) + 1;
    const effectivePool = sw + statMod;
    const margin = effectivePool - difficulty;

    if (roll <= effectivePool || (margin >= -LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck)) {
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
    const et = readPlayerSkill(playerEntity, SKILLS.Etiquette, 30);
    const pers = readPlayerStat(playerEntity, 'personality', 50);
    const statMod = Math.trunc((pers - 50) * 0.25);
    const bonus = adv.trait === 'HONORABLE' ? 20 : 0;
    const difficulty = Math.min(95, adv.level * 3 + 25 - bonus);
    const roll = Math.floor(rng() * 100) + 1;
    const effectivePool = et + bonus + statMod;
    const margin = effectivePool - difficulty;

    if (roll <= effectivePool || (margin >= -LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck)) {
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
 * Resolves a dungeon locationId or numeric mapId + regionIndex into the matching interceptedQuests record.
 * @param {string|number} locationId
 * @param {number|null} [regionIndex=null]
 * @returns {{ key: string, record: any }|null}
 */
export function findInterceptedQuestAt(locationId, regionIndex = null) {
  const reg = getAdventurerSimRegistry();
  if (!reg.interceptedQuests) return null;
  if (reg.interceptedQuests[locationId] && !reg.interceptedQuests[locationId].recovered) {
    return { key: String(locationId), record: reg.interceptedQuests[locationId] };
  }
  if (regionIndex != null && Number.isFinite(Number(locationId))) {
    const slotKey = `dungeon_${regionIndex}_${Math.abs(Math.trunc(Number(locationId))) % 10}`;
    if (reg.interceptedQuests[slotKey] && !reg.interceptedQuests[slotKey].recovered) {
      return { key: slotKey, record: reg.interceptedQuests[slotKey] };
    }
  }
  return null;
}

/**
 * Returns an active living adventurer delving inside this dungeon (or one who intercepted
 * a quest here) so `dungeonContext.js` can physically spawn them in the dungeon hall.
 *
 * @param {string|number} locationId
 * @param {number|null} [regionIndex=null]
 * @returns {{ adv: any, intercepted: any|null, slotKey: string }|null}
 */
export function getDungeonActiveAdventurer(locationId, regionIndex = null) {
  if (Number(LivingTamrielConfig.adventurers) <= PRESENCE.OFF) return null;
  const reg = getAdventurerSimRegistry();
  const slotKey =
    regionIndex != null && Number.isFinite(Number(locationId))
      ? `dungeon_${regionIndex}_${Math.abs(Math.trunc(Number(locationId))) % 10}`
      : String(locationId);

  const interceptedHit = findInterceptedQuestAt(locationId, regionIndex);
  if (interceptedHit) {
    const rec = interceptedHit.record;
    const poolAdv = (reg.pool || []).find((a) => a.id === rec.adventurerId && a.status !== ADVENTURER_STATUS.DEAD);
    const adv = poolAdv || {
      id: rec.adventurerId ?? 900,
      name: rec.adventurerName || 'Valen the Swift',
      className: rec.adventurerClass || 'Rogue',
      level: rec.adventurerLevel || 8,
      trait: rec.adventurerTrait || 'ARROGANT',
      gearTier: Math.min(9, Math.floor((rec.adventurerLevel || 8) / 5) + 1),
      currentRegion: regionIndex ?? 0,
    };
    return { adv, intercepted: rec, slotKey: interceptedHit.key };
  }

  const delvingAdv = (reg.pool || []).find(
    (a) =>
      a.status === ADVENTURER_STATUS.DELVING &&
      (String(a.targetLocationId) === String(locationId) || String(a.targetLocationId) === slotKey),
  );
  if (delvingAdv) {
    return { adv: delvingAdv, intercepted: null, slotKey };
  }
  return null;
}

/**
 * Confronts an adventurer who intercepted a non-main quest to reclaim the objective.
 *
 * @param {Object} params
 * @param {string|number} params.locationId
 * @param {number|null} [params.regionIndex=null]
 * @param {any} params.playerEntity
 * @param {string} params.method - 'DUEL' | 'BUYOUT' | 'APPEAL' | 'FORFEIT'
 * @param {number} [params.goldOffered=0]
 * @param {() => number} [params.rng=Math.random]
 * @returns {{ outcome: string, recovered: boolean, goldCost?: number, messageKey: string }|null}
 */
export function confrontInterceptingAdventurer({
  locationId,
  regionIndex = null,
  playerEntity,
  method,
  goldOffered = 0,
  rng = Math.random,
}) {
  const hit = findInterceptedQuestAt(locationId, regionIndex);
  const record = hit?.record;
  if (!record || record.recovered) return null;

  const playerLuck = readPlayerStat(playerEntity, 'luck', 50);

  if (method === 'FORFEIT') {
    record.forfeited = true;
    return {
      outcome: RECLAIM_OUTCOME.FORFEITED,
      recovered: false,
      messageKey: 'living.adventurer.reclaimFailed',
    };
  }

  if (method === 'DUEL') {
    const advScore = record.adventurerLevel * 4 + Math.floor(rng() * 35);
    const duelRes = resolveLivingRoll({
      formulaId: 'TACTICAL_DUEL_WAGER',
      playerEntity,
      statName: 'strength',
      difficulty: advScore,
      targetLevel: record.adventurerLevel,
      allowLuckReroll: false,
      rng,
    });
    const margin = duelRes.margin;

    if (margin >= 0 || (Math.abs(margin) <= LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck)) {
      record.recovered = true;
      return {
        outcome: RECLAIM_OUTCOME.DUEL_WON,
        degree: duelRes.degree,
        rollResult: duelRes,
        recovered: true,
        messageKey: 'living.adventurer.reclaimSuccess',
      };
    }

    return {
      outcome: RECLAIM_OUTCOME.DUEL_LOST,
      degree: duelRes.degree,
      rollResult: duelRes,
      recovered: false,
      messageKey: 'living.adventurer.duelLost',
    };
  }

  if (method === 'BUYOUT') {
    const baseDemand = Math.max(100, record.adventurerLevel * 35);
    const mult = computeRoleplayBribeMultiplier(playerEntity, SKILLS.Streetwise);
    const requiredGold = Math.floor(baseDemand * mult);

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
    const et = readPlayerSkill(playerEntity, SKILLS.Etiquette, 30);
    const pers = readPlayerStat(playerEntity, 'personality', 50);
    const statMod = Math.trunc((pers - 50) * 0.25);
    const bonus = record.adventurerTrait === 'HONORABLE' ? 25 : 0;
    const difficulty = Math.min(90, record.adventurerLevel * 3 + 20 - bonus);
    const roll = Math.floor(rng() * 100) + 1;
    const effectivePool = et + bonus + statMod;
    const margin = effectivePool - difficulty;

    if (roll <= effectivePool || (margin >= -LivingTamrielConfig.luckRerollThreshold && rng() * 100 < playerLuck)) {
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

// ═══════════════════════════════════════════════════════════════════════════════
// WANDERING ROAD & WILDERNESS ADVENTURERS (Non-Seeking Encounters)
//
// Adventurers from the regional pool who are NOT hunting the player:
//   - Traveling along highways between settlements and dungeons
//   - Camping by the roadside to rest and mend gear
//   - Clashing with local monsters or highwaymen in real time
//   - Returning from cleared dungeons with chests of spoils
// Controlled by the 4-tier setting `LivingTamrielConfig.roadAdventurers` (0..3).
// ═══════════════════════════════════════════════════════════════════════════════

export const ROAD_ADVENTURER_SITUATION = Object.freeze({
  TRAVELING_ON_ROAD: 'TRAVELING_ON_ROAD',
  ROADSIDE_CAMP: 'ROADSIDE_CAMP',
  SKIRMISH_WITH_MONSTERS: 'SKIRMISH_WITH_MONSTERS',
  RETURNING_WITH_SPOILS: 'RETURNING_WITH_SPOILS',
});

export const WANDERING_OUTCOME = Object.freeze({
  INTEL_SHARED: 'INTEL_SHARED',
  RECRUITED_ALLY: 'RECRUITED_ALLY',
  SPAR_WON: 'SPAR_WON',
  SPAR_LOST: 'SPAR_LOST',
  EXTORTED_SPOILS: 'EXTORTED_SPOILS',
  HOSTILE_DRAW: 'HOSTILE_DRAW',
  PARTED_PEACEFULLY: 'PARTED_PEACEFULLY',
  DECLINED: 'DECLINED',
});

const ADVENTURER_FORENAMES = Object.freeze([
  'Kaelen', 'Valen', 'Barenziah', 'Gothryd', 'Morgiah', 'Aubk-i',
  'Cyrus', 'Lhotun', 'Eadwyre', 'Nulfaga', 'Medora', 'Symmachus',
  'Arctus', 'Dralsi', 'Sorcalin', 'Thulgeg', 'Varnis', 'Elysana',
]);

/**
 * Returns a lore-friendly display name for an adventurer while keeping `adv.name` intact.
 * @param {any} adv
 * @returns {string}
 */
export function getAdventurerDisplayName(adv) {
  if (!adv) return 'Wandering Adventurer';
  const raw = String(adv.name || '');
  if (raw && !/^[A-Za-z]+_\d+$/.test(raw)) {
    if (raw.includes(' the ') || raw.includes('(')) return raw;
    return `${raw} (${adv.className || 'Adventurer'})`;
  }
  const idNum = Math.abs(Number(adv.id) || 0);
  const forename = ADVENTURER_FORENAMES[idNum % ADVENTURER_FORENAMES.length];
  const cls = adv.className || 'Warrior';
  return `${forename} the ${cls}`;
}

/**
 * Returns the 3D site spawn probability for non-seeking wandering adventurers
 * based on the 4-tier `LivingTamrielConfig.roadAdventurers` setting (0..3).
 *
 * @param {number} [tier]
 * @returns {number} Probability in [0, 1]
 */
export function getRoadAdventurerSiteChance(tier = Number(LivingTamrielConfig.roadAdventurers)) {
  if (tier <= PRESENCE.OFF) return 0;
  if (tier === PRESENCE.LIGHT) return 0.12;
  if (tier === PRESENCE.MID) return 0.24;
  return 0.40; // HIGH
}

/**
 * Returns the ambient road/wilderness encounter replacement share for wandering adventurers
 * based on the 4-tier `LivingTamrielConfig.roadAdventurers` setting (0..3).
 *
 * @param {number} [tier]
 * @returns {number} Share in [0, 1]
 */
export function getRoadAdventurerAmbientShare(tier = Number(LivingTamrielConfig.roadAdventurers)) {
  if (tier <= PRESENCE.OFF) return 0;
  if (tier === PRESENCE.LIGHT) return 0.06;
  if (tier === PRESENCE.MID) return 0.14;
  return 0.25; // HIGH
}

/**
 * Picks a non-seeking adventurer from the regional pool and determines what they
 * are currently doing in the wilderness or on the road.
 *
 * @param {Object} params
 * @param {number} [params.regionIndex=0]
 * @param {boolean} [params.onRoad=true]
 * @param {boolean} [params.isDay=true]
 * @param {any} [params.playerEntity=null]
 * @param {() => number} [params.rng=Math.random]
 * @returns {{
 *   adv: any,
 *   displayName: string,
 *   situation: string,
 *   hireCost: number,
 *   tension: { attitude: string, tensionScore: number, challengeType: string, wagerGold: number }
 * } | null}
 */
export function pickWanderingAdventurerEncounter({
  regionIndex = 0,
  onRoad = true,
  isDay = true,
  playerEntity = null,
  rng = Math.random,
} = {}) {
  const tier = Number(LivingTamrielConfig.roadAdventurers);
  if (tier <= PRESENCE.OFF) return null;

  const reg = getAdventurerSimRegistry();
  const pool = Array.isArray(reg.pool) && reg.pool.length > 0 ? reg.pool : ensureAdventurerPool(rng);

  // Prefer adventurers in this region who are TRAVELING or IDLE (not inside a dungeon)
  const candidates = pool.filter(
    (a) =>
      a.status !== ADVENTURER_STATUS.DEAD &&
      a.currentRegion === regionIndex &&
      (a.status === ADVENTURER_STATUS.TRAVELING || a.status === ADVENTURER_STATUS.IDLE),
  );
  const fallbackCandidates = pool.filter(
    (a) => a.status !== ADVENTURER_STATUS.DEAD && a.currentRegion === regionIndex,
  );
  const list = candidates.length > 0 ? candidates : fallbackCandidates;

  const playerLevel = Math.max(1, Number(playerEntity?.level ?? 1));
  const adv =
    list.length > 0
      ? list[Math.floor(rng() * list.length)]
      : {
          id: 950,
          name: 'Kaelen',
          className: 'Ranger',
          trait: 'HONORABLE',
          level: playerLevel,
          gearTier: Math.min(9, Math.floor(playerLevel / 5) + 1),
          currentRegion: regionIndex,
          status: onRoad ? ADVENTURER_STATUS.TRAVELING : ADVENTURER_STATUS.IDLE,
          delveSuccessCount: 1,
        };

  const roll = rng();
  /** @type {string} */
  let situation = ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD;
  if (roll < 0.30) {
    situation = ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS;
  } else if ((adv.delveSuccessCount || 0) > 0 && roll < 0.55) {
    situation = ROAD_ADVENTURER_SITUATION.RETURNING_WITH_SPOILS;
  } else if (!isDay || !onRoad || adv.status === ADVENTURER_STATUS.IDLE) {
    situation = ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP;
  } else {
    situation = ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD;
  }

  const tension = evaluateAdventurerTension(adv, playerEntity);
  const hireCost = Math.max(30, (adv.level || 1) * 15);

  return {
    adv,
    displayName: getAdventurerDisplayName(adv),
    situation,
    hireCost,
    tension,
  };
}

/**
 * Resolves a player's interaction with a non-seeking wandering adventurer on the road or in the wilds.
 *
 * @param {Object} params
 * @param {any} params.adv
 * @param {string} [params.situation='TRAVELING_ON_ROAD']
 * @param {any} params.playerEntity
 * @param {'SHARE_INTEL'|'RECRUIT_ALLY'|'WAGER_SPAR'|'EXTORT_SPOILS'|'LEAVE'} params.action
 * @param {number} [params.regionIndex=0]
 * @param {() => number} [params.rng=Math.random]
 * @returns {{
 *   outcome: string,
 *   goldDelta: number,
 *   repDelta: number,
 *   healed: boolean,
 *   allied: boolean,
 *   hostile: boolean,
 *   spoilsItem: boolean,
 *   messageKey: string
 * }}
 */
export function resolveWanderingAdventurerInteraction({
  adv,
  situation = ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
  playerEntity,
  action,
  regionIndex = 0,
  nowMinutes = 0,
  rng = Math.random,
}) {
  const playerLuck = Number(playerEntity?.stats?.Luck ?? playerEntity?.stats?.luck ?? 50);
  const advLevel = Math.max(1, Number(adv?.level ?? 1));
  const hireCost = Math.max(30, advLevel * 15);
  const wagerGold = Math.max(25, advLevel * 15);

  const applyRep = (delta) => {
    if (delta && playerEntity?.regionalReputations && typeof playerEntity.regionalReputations === 'object') {
      playerEntity.regionalReputations[regionIndex] =
        Number(playerEntity.regionalReputations[regionIndex] || 0) + delta;
    }
  };

  if (action === 'LEAVE') {
    return {
      outcome: WANDERING_OUTCOME.PARTED_PEACEFULLY,
      goldDelta: 0,
      repDelta: 0,
      healed: false,
      allied: false,
      hostile: false,
      spoilsItem: false,
      messageKey: 'living.roadAdv.parted',
    };
  }

  if (action === 'SHARE_INTEL') {
    let goldDelta = 0;
    let repDelta = 1;
    let healed = false;

    if (situation === ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS) {
      // Grateful adventurer shares coin after fighting off roadside beasts/bandits together
      goldDelta = Math.max(25, advLevel * 12);
      repDelta = 2;
      if (playerEntity && typeof playerEntity.goldPieces === 'number') {
        playerEntity.goldPieces += goldDelta;
      }
    } else if (situation === ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP) {
      // Resting by the adventurer's campfire restores player health
      healed = true;
      if (playerEntity && typeof playerEntity.health === 'number') {
        const maxH = Number(playerEntity.maxHealth || playerEntity.health + 15);
        playerEntity.health = Math.min(maxH, playerEntity.health + 15);
      }
    }

    applyRep(repDelta);
    return {
      outcome: WANDERING_OUTCOME.INTEL_SHARED,
      goldDelta,
      repDelta,
      healed,
      allied: situation === ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS,
      hostile: false,
      spoilsItem: false,
      messageKey: 'living.roadAdv.intelShared',
    };
  }

  if (action === 'RECRUIT_ALLY') {
    const hireCost = Math.max(25, advLevel * 20);
    const haveGold = Number(playerEntity?.goldPieces ?? 0);

    if (haveGold < hireCost) {
      return {
        outcome: WANDERING_OUTCOME.DECLINED,
        goldDelta: 0,
        repDelta: 0,
        healed: false,
        allied: false,
        hostile: false,
        spoilsItem: false,
        goldShortage: true,
        hireCost,
        messageKey: 'living.roadAdv.noGold',
      };
    }

    if (playerEntity) {
      playerEntity.goldPieces = Math.max(0, haveGold - hireCost);
    }
    recruitAdventurerCompanion(adv, nowMinutes);
    return {
      outcome: WANDERING_OUTCOME.RECRUITED_ALLY,
      goldDelta: -hireCost,
      hireCost,
      repDelta: 1,
      healed: false,
      allied: true,
      hostile: false,
      spoilsItem: false,
      messageKey: 'living.roadAdv.recruited',
    };
  }

  if (action === 'WAGER_SPAR') {
    const spar = resolveAdventurerEncounter({
      adv,
      playerEntity,
      action: 'ACCEPT_DARE',
      wagerGold,
      rng,
    });
    if (playerEntity && spar.goldDelta) {
      playerEntity.goldPieces = Math.max(0, Number(playerEntity.goldPieces ?? 0) + spar.goldDelta);
    }
    const won = spar.outcome === DUEL_OUTCOME.PLAYER_WON || spar.outcome === DUEL_OUTCOME.LUCK_REVERSAL;
    return {
      outcome: won ? WANDERING_OUTCOME.SPAR_WON : WANDERING_OUTCOME.SPAR_LOST,
      goldDelta: spar.goldDelta,
      repDelta: won ? 1 : 0,
      healed: false,
      allied: false,
      hostile: false,
      spoilsItem: false,
      messageKey: spar.messageKey,
    };
  }

  if (action === 'EXTORT_SPOILS') {
    const sw = readPlayerSkill(playerEntity, SKILLS.Streetwise, 30);
    const traitMod = adv?.trait === 'CAUTIOUS' ? -15 : adv?.trait === 'HONORABLE' || adv?.trait === 'DUELIST' ? 20 : 0;
    const difficulty = Math.min(95, Math.max(15, advLevel * 3 + 30 + traitMod));
    const rollRes = resolveLivingRoll({
      formulaId: 'STREETWISE_LEVERAGE',
      playerEntity,
      skillId: SKILLS.Streetwise,
      statName: 'personality',
      difficulty,
      contextBonus: -traitMod,
      targetLevel: advLevel,
      regionIndex,
      rng,
    });
    const roll = rollRes.roll + 1;

    if (roll <= sw || rollRes.cleanSuccess) {
      const baseGold = Math.max(30, advLevel * 20);
      const extortedGold = rollRes.isTriumph ? Math.round(baseGold * 1.25) : baseGold;
      if (playerEntity && typeof playerEntity.goldPieces === 'number') {
        playerEntity.goldPieces += extortedGold;
      }
      if (Array.isArray(playerEntity?.items)) {
        playerEntity.items.push({
          group: 'Gems',
          templateIndex: 0,
          name: `${getAdventurerDisplayName(adv)}'s Dungeon Spoils`,
          shortName: 'Dungeon Spoils',
          value: extortedGold,
          weight: 1.0,
        });
      }
      applyRep(-2);
      return {
        outcome: WANDERING_OUTCOME.EXTORTED_SPOILS,
        degree: rollRes.degree,
        rollResult: rollRes,
        goldDelta: extortedGold,
        repDelta: -2,
        healed: false,
        allied: false,
        hostile: false,
        spoilsItem: true,
        messageKey: 'living.roadAdv.extorted',
      };
    }

    if (rollRes.isPartial) {
      const partialGold = Math.max(15, advLevel * 10);
      if (playerEntity && typeof playerEntity.goldPieces === 'number') {
        playerEntity.goldPieces += partialGold;
      }
      applyRep(-1);
      return {
        outcome: WANDERING_OUTCOME.EXTORTED_SPOILS,
        degree: rollRes.degree,
        rollResult: rollRes,
        goldDelta: partialGold,
        repDelta: -1,
        healed: false,
        allied: false,
        hostile: false,
        spoilsItem: false,
        messageKey: 'living.roadAdv.extortPartial',
      };
    }

    applyRep(-1);
    return {
      outcome: WANDERING_OUTCOME.HOSTILE_DRAW,
      degree: rollRes.degree,
      rollResult: rollRes,
      goldDelta: 0,
      repDelta: -1,
      healed: false,
      allied: false,
      hostile: true,
      spoilsItem: false,
      messageKey: 'living.adventurer.enviousTaunt',
    };
  }

  return {
    outcome: WANDERING_OUTCOME.PARTED_PEACEFULLY,
    goldDelta: 0,
    repDelta: 0,
    healed: false,
    allied: false,
    hostile: false,
    spoilsItem: false,
    messageKey: 'living.roadAdv.parted',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSISTENT RECRUITED ADVENTURER COMPANION (24 In-Game Hours)
// ═══════════════════════════════════════════════════════════════════════════════

export const COMPANION_DURATION_MINUTES = 1440; // 24 in-game hours

/**
 * Recruits an adventurer as a persistent companion for 24 in-game hours,
 * persisted in the LivingDirector save state across map pixels and into dungeons.
 *
 * @param {any} adv
 * @param {number} [nowMinutes=0]
 * @returns {{ id: number|string, name: string, displayName: string, className: string, level: number, trait: string, recruitedAtMinutes: number, expiresAtMinutes: number }}
 */
export function recruitAdventurerCompanion(adv, nowMinutes = 0) {
  const reg = getAdventurerSimRegistry();
  const fallbackNow = Number(getLivingDirectorState()?.lastWorldTickMinute) || 0;
  const now = Number.isFinite(nowMinutes) && nowMinutes > 0 ? nowMinutes : fallbackNow;
  const companion = {
    id: adv?.id ?? 950,
    name: adv?.name || 'Kaelen',
    displayName: getAdventurerDisplayName(adv),
    className: adv?.className || 'Ranger',
    level: Math.max(1, Number(adv?.level ?? 5)),
    trait: adv?.trait || 'HONORABLE',
    recruitedAtMinutes: now,
    expiresAtMinutes: now + COMPANION_DURATION_MINUTES,
  };
  reg.activeCompanion = companion;
  return companion;
}

/**
 * Returns the currently active recruited adventurer companion if still within
 * their 24-hour contract window, or `null` if none / expired.
 *
 * @param {number} [nowMinutes=0]
 * @returns {{ id: number|string, name: string, displayName: string, className: string, level: number, trait: string, recruitedAtMinutes: number, expiresAtMinutes: number } | null}
 */
export function getActiveAdventurerCompanion(nowMinutes = 0) {
  const reg = getAdventurerSimRegistry();
  const comp = reg?.activeCompanion;
  if (!comp) return null;
  if (
    Number.isFinite(nowMinutes) &&
    nowMinutes > 0 &&
    comp.recruitedAtMinutes === 0 &&
    comp.expiresAtMinutes === COMPANION_DURATION_MINUTES &&
    nowMinutes > COMPANION_DURATION_MINUTES
  ) {
    comp.recruitedAtMinutes = nowMinutes;
    comp.expiresAtMinutes = nowMinutes + COMPANION_DURATION_MINUTES;
  }
  if (
    Number.isFinite(nowMinutes) &&
    nowMinutes > 0 &&
    Number.isFinite(comp.expiresAtMinutes) &&
    comp.expiresAtMinutes > 0 &&
    nowMinutes >= comp.expiresAtMinutes
  ) {
    reg.activeCompanion = null;
    return null;
  }
  return comp;
}

/**
 * Dismisses the active adventurer companion (e.g. upon death or manual release).
 */
export function dismissAdventurerCompanion() {
  const reg = getAdventurerSimRegistry();
  if (reg) {
    reg.activeCompanion = null;
  }
}


