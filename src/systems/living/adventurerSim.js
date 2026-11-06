// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// ADVENTURER SIMULATION ENGINE (Living Tamriel)
//
// Background simulation of virtual adventurers exploring Tamriel, clearing
// dungeons (placing temporary respawn cooldowns), leveling up, upgrading gear,
// and leaving fallen remains in boss chests upon demise.
// ═══════════════════════════════════════════════════════════════════════════════

import { BAY_REGION_COUNT, REGION_NAMES } from '../../formats/mapsTables.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getLivingDirectorState } from './livingDirector.js';

export const ADVENTURER_CLASSES = Object.freeze([
  'Warrior', 'Knight', 'Barbarian', 'Rogue', 'Thief', 'Assassin',
  'Mage', 'Sorcerer', 'Battlemage', 'Spellsword', 'Nightblade', 'Healer',
]);

export const ADVENTURER_STATUS = Object.freeze({
  IDLE: 'IDLE',
  TRAVELING: 'TRAVELING',
  DELVING: 'DELVING',
  DEAD: 'DEAD',
});

/**
 * Checks whether a dungeon is locked by an active player quest.
 * Guard: Quest locations are strictly immune to adventurer simulation clearing!
 *
 * @param {number|string} locationId MapId or location identifier
 * @param {Array<{ mapId: number|string }>} [activeQuestSites] List of active quest sites
 * @returns {boolean} True if the location is currently occupied by an active quest
 */
export function isQuestImmuneLocation(locationId, activeQuestSites = []) {
  if (!activeQuestSites || !Array.isArray(activeQuestSites) || !locationId) return false;
  return activeQuestSites.some((site) => site && String(site.mapId) === String(locationId));
}

/**
 * Creates a randomized virtual adventurer record.
 * @param {number} id Unique identifier
 * @param {number} regionIndex Region of origin (0..61)
 * @param {() => number} [rng]
 */
export function createVirtualAdventurer(id, regionIndex, rng = Math.random) {
  const classIndex = Math.floor(rng() * ADVENTURER_CLASSES.length);
  const className = ADVENTURER_CLASSES[classIndex];
  const level = 1 + Math.floor(rng() * 4); // Initial levels 1..4

  return {
    id,
    name: `${className}_${id}`,
    className,
    level,
    gearTier: 1, // Iron / Steel tier
    currentRegion: regionIndex,
    targetLocationId: null,
    status: ADVENTURER_STATUS.IDLE,
    daysRemainingInAction: 0,
    delveSuccessCount: 0,
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
  return adv;
}

/**
 * Ensures the virtual adventurer pool is initialized for active regions.
 * @param {() => number} [rng]
 */
export function ensureAdventurerPool(rng = Math.random) {
  const reg = getAdventurerSimRegistry();
  if (!Array.isArray(reg.pool)) {
    reg.pool = [];
  }

  const poolPerRegion = LivingTamrielConfig.adventurerPoolPerRegion || 13;
  const targetTotal = poolPerRegion * BAY_REGION_COUNT;

  if (reg.pool.length < targetTotal) {
    let nextId = reg.pool.length + 1;
    for (let r = 0; r < BAY_REGION_COUNT; r++) {
      const currentInRegion = reg.pool.filter((a) => a.currentRegion === r && a.status !== ADVENTURER_STATUS.DEAD).length;
      for (let i = currentInRegion; i < poolPerRegion; i++) {
        reg.pool.push(createVirtualAdventurer(nextId++, r, rng));
      }
    }
  }
  return reg.pool;
}

/**
 * Simulates one daily step for the entire adventurer ecosystem.
 *
 * @param {Object} [params]
 * @param {Array<{ mapId: number|string }>} [params.activeQuestSites] List of active player quest sites (protected!)
 * @param {() => number} [params.rng]
 */
export function tickAdventurerSimulation({ activeQuestSites = [], rng = Math.random } = {}) {
  const tier = Number(LivingTamrielConfig.adventurers);
  if (tier === PRESENCE.OFF) return;

  const reg = getAdventurerSimRegistry();
  const pool = ensureAdventurerPool(rng);

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
  for (let i = pool.length - 1; i >= 0; i--) {
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
      const isImmune = isQuestImmuneLocation(locId, activeQuestSites);

      // Roll delve outcome: Success chance based on level
      const baseSuccess = 0.55 + (adv.level * 0.05);
      const success = !isImmune && rng() < baseSuccess;

      if (success) {
        adv.status = ADVENTURER_STATUS.IDLE;
        adv.delveSuccessCount++;
        adv.daysRemainingInAction = 0;

        // Level up & gear upgrade
        if (adv.delveSuccessCount % 2 === 0 && adv.level < 20) {
          adv.level++;
          adv.gearTier = Math.min(6, Math.floor(adv.level / 3) + 1);
        }

        // Apply dungeon clear cooldown (3..5 days)
        if (locId) {
          const cooldownDays = 3 + Math.floor(rng() * 3);
          reg.dungeonCooldowns[locId] = cooldownDays;
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
            level: adv.level,
            gearTier: adv.gearTier,
          });
        }
      }
      adv.targetLocationId = null;
      continue;
    }

    // Currently IDLE: Pick next endeavor (Move or Delve)
    if (rng() < 0.60) {
      // Start a dungeon delve
      const mockDungeonId = `dungeon_${adv.currentRegion}_${Math.floor(rng() * 10)}`;
      if (!isQuestImmuneLocation(mockDungeonId, activeQuestSites)) {
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
