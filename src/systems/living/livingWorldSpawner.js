// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// LIVING TAMRIEL 3D ACTOR, GEOMETRY & ECOLOGICAL WILDERNESS SPAWNER
//
// Bridges the Living Tamriel simulation engines to the live 3D streaming world:
//  1. Context-Aware Wilderness & Road Spawner (`rollLivingWildernessEncounter`,
//     `rollLivingChunkCamp`) that complements or replaces vanilla DFO spawns based
//     on Climate, Biome/Fauna Band, Season, Time of Day, Road vs. Off-Road, and
//     Regional Political Crisis (WAR, PLAGUE, FAMINE, CIVIL_STRIFE).
//  2. Real 3D Scene & Actor Host (`createLivingSceneHost`) that stands 3D meshes
//     (ARCH3D.BSA tents, pavilions, wagons, crates, military banners), animated
//     billboard flats (campfires, braziers, horses, weapon racks, sacks), dynamic
//     point lights, and live NPC/mob actors (`exteriorFoes.spawnFoe`) with
//     interactive ChoiceWindow roleplay resolutions.
// ═══════════════════════════════════════════════════════════════════════════════

import { CLIMATES } from '../../formats/mapsFile.js';
import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import { SEASONS, seasonValue, dateFromClassicMinutes } from '../gameDate.js';
import { encounterTable } from '../../characters/encounterTableDoor.js';
import { trs } from '../../world/mat4.js';
import { sphereAabb } from '../../render/frustum.js';
import { drawSeen } from '../../scenes/decor/decorRoom.js';
import { GLOBAL_SCALE } from '../../player/activate.js';
import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { getRegionState, isRegionInQuarantine, getActiveCrises, setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE } from './regionState.js';
import { getQuarantineReliefPostInfo } from './quarantineGate.js';
import { checkCampFootprintSlope, snapPropToGround } from './campInjector.js';
import { lodgedIn, freeLodgedFeet } from '../../characters/foeSpacing.js';
import {
  shouldSpawnRoadCheckpoint,
  evaluateCheckpointEncounter,
  resolveCheckpointInteraction,
  hasRegionalCheckpointPass,
  grantRegionalCheckpointPass,
  CHECKPOINT_OUTCOME,
} from './roadCheckpointHost.js';
import {
  shouldSpawnUrbanSkirmish,
  planUrbanSkirmish,
  isSkirmishBlowCriminal,
  SKIRMISH_TEAMS,
} from './urbanDirector.js';
import { resolveCrisisChoiceCheck } from './crisisRegistry.js';
import {
  LIVING_ROLL_DEGREE,
  LIVING_FORMULAS,
  resolveLivingRoll,
} from './livingRolls.js';
import {
  planSquadronEncounter,
  shouldPromptSideChoice,
  resolveSideChoice,
  shouldCullSquadron,
  canFireProjectile,
  NAVAL_CHOICE,
} from './navalIncidentHost.js';
import { onContractCompleted } from './bountySync.js';
import {
  offerRegionalCrisisContract,
  acceptRegionalCrisisContract,
  getActiveCrisisContract,
  completeRegionalCrisisContract,
} from './crisisPresenter.js';
import {
  shouldDispatchNemesis,
  determineNemesisArchetype,
  createNemesisHunter,
  resolveNemesisConfrontation,
  getNemesisMemory,
  recordAdventurerGrudge,
  clearNemesisGrudge,
  NEMESIS_ARCHETYPES,
  NEMESIS_RESOLUTION,
} from './nemesisHost.js';
import { evaluatePleaEncounter, resolvePleaResponse, PLEA_OUTCOME } from './pleaHost.js';
import {
  ensureAdventurerPool,
  getAdventurerSimRegistry,
  evaluateAdventurerTension,
  resolveAdventurerEncounter,
  confrontInterceptingAdventurer,
  getDungeonActiveAdventurer,
  getRoadAdventurerSiteChance,
  getRoadAdventurerAmbientShare,
  pickWanderingAdventurerEncounter,
  resolveWanderingAdventurerInteraction,
  getAdventurerDisplayName,
  recruitAdventurerCompanion,
  getActiveAdventurerCompanion,
  dismissAdventurerCompanion,
  ROAD_ADVENTURER_SITUATION,
  WANDERING_OUTCOME,
  DUEL_OUTCOME,
  RECLAIM_OUTCOME,
  ADVENTURER_STATUS,
} from './adventurerSim.js';
import { LIVING_WORDS } from './livingWords.js';
import { mobTraitChance } from '../bossTraits.js';

/** Existing ARCH3D.BSA 3D model IDs used for Living Tamriel props. */
export const LIVING_MODELS = Object.freeze({
  TENT: 41606,      // Standard wilderness camp tent
  PAVILION: 41607,  // Command / Quarantine relief pavilion tent
  CANOPY: 41610,    // Large open merchant canopy
  WAGON: 41214,     // Wooden merchant/supply wagon
  CRATES: 41834,    // Supply crate stack / barricade
  BOXES: 41832,     // Medical / provision boxes
  BANNER: 42560,    // Military checkpoint standard / banner
});

/** Existing TEXTURE.xxx billboard flats used for Living Tamriel props. */
export const LIVING_FLATS = Object.freeze({
  CAMPFIRE: Object.freeze({ archive: 210, record: 1, lightRadius: 14 }),
  BRAZIER: Object.freeze({ archive: 210, record: 17, lightRadius: 12 }),
  HORSE: Object.freeze({ archive: 201, record: 0, lightRadius: 0 }),
  SACKS: Object.freeze({ archive: 205, record: 0, lightRadius: 0 }),
  WEAPON_RACK: Object.freeze({ archive: 207, record: 14, lightRadius: 0 }),
});

/** Maps class names used in Living Tamriel records to canonical MOBILE_TYPES IDs. */
export const CLASS_TO_MOBILE_TYPE = Object.freeze({
  Mage: MOBILE_TYPES.Mage,
  Spellsword: MOBILE_TYPES.Spellsword,
  Battlemage: MOBILE_TYPES.Battlemage,
  Sorcerer: MOBILE_TYPES.Sorcerer,
  Healer: MOBILE_TYPES.Healer,
  Nightblade: MOBILE_TYPES.Nightblade,
  Bard: MOBILE_TYPES.Bard,
  Burglar: MOBILE_TYPES.Burglar,
  Rogue: MOBILE_TYPES.Rogue,
  Acrobat: MOBILE_TYPES.Acrobat,
  Thief: MOBILE_TYPES.Thief,
  Assassin: MOBILE_TYPES.Assassin,
  Monk: MOBILE_TYPES.Monk,
  Archer: MOBILE_TYPES.Archer,
  Ranger: MOBILE_TYPES.Ranger,
  Barbarian: MOBILE_TYPES.Barbarian,
  Warrior: MOBILE_TYPES.Warrior,
  Knight: MOBILE_TYPES.Knight,
  Merchant: MOBILE_TYPES.Bard,
  CityWatch: MOBILE_TYPES.Knight_CityWatch,
});

export const LIVING_SITE_KINDS = Object.freeze({
  CHECKPOINT: 'CHECKPOINT',
  BANDIT_CAMP: 'BANDIT_CAMP',
  TRAVELER_REST: 'TRAVELER_REST',
  QUARANTINE_TENT: 'QUARANTINE_TENT',
  PLEA_ENCOUNTER: 'PLEA_ENCOUNTER',
  URBAN_SKIRMISH: 'URBAN_SKIRMISH',
  NEMESIS_AMBUSH: 'NEMESIS_AMBUSH',
  ADVENTURER_MEETING: 'ADVENTURER_MEETING',
  WANDERING_ADVENTURER: 'WANDERING_ADVENTURER',
  NAVAL_SQUADRON: 'NAVAL_SQUADRON',
});

/** Classic DAGGER.SND sound clip indices used for Living Tamriel audio accents. */
export const LIVING_SOUNDS = Object.freeze({
  HALT: 363,
  DRAW_WEAPON: 106,
  SWORD_CLINK: 108,
  GOLD_COINS: 408,
});

/** Distance (m) at which a spawned site is kept before cleanup. */
export const SITE_KEEP_DISTANCE_M = 220;
/** Distance (m) at which an interactive site opens its roleplay ChoiceWindow. */
export const SITE_INTERACT_DISTANCE_M = 14;

/**
 * Returns the replacement probability (0..1) for Living Tamriel's wilderness
 * spawner over vanilla DFO spawns based on the `wilderness` presence tier.
 *  - OFF (0): 0% (pure vanilla DFO)
 *  - LIGHT (1): 30% (gentle ecological & crisis flavor)
 *  - MID (2): 65% (balanced Living Tamriel ecology + vanilla)
 *  - HIGH (3): 100% (full Living Tamriel ecological & crisis spawner replacement)
 *
 * @param {number} [tier]
 * @returns {number}
 */
export function getWildernessReplacementShare(tier = LivingTamrielConfig.wilderness) {
  const t = Number(tier);
  if (t <= PRESENCE.OFF) return 0;
  if (t === PRESENCE.LIGHT) return 0.30;
  if (t === PRESENCE.MID) return 0.65;
  return 1.0;
}

/**
 * Builds a candidate pool of mobileTypes tailored to:
 *  - Climate (Desert, Subtropical, Rainforest, Swamp, Woodlands, HauntedWoodlands, Mountain)
 *  - Biome / Fauna band (`fauna` past the Iliac Bay)
 *  - Calendar Season (Spring, Summer, Fall, Winter)
 *  - Time of Day (Day vs. Night)
 *  - Road vs. Deep Wilderness (`onRoad`)
 *  - Regional Political Crisis (WAR, PLAGUE, FAMINE, CIVIL_STRIFE)
 *  - Player Level (1..45)
 *
 * @param {Object} ctx
 * @param {number} [ctx.climateIndex=231]
 * @param {number[]|null} [ctx.fauna=null]
 * @param {number} [ctx.season=SEASONS.Summer]
 * @param {boolean} [ctx.isDay=true]
 * @param {boolean} [ctx.onRoad=false]
 * @param {boolean} [ctx.inLocationRect=false]
 * @param {number} [ctx.regionIndex=0]
 * @param {number} [ctx.playerLevel=1]
 * @param {() => number} [rolls=Math.random]
 * @returns {{ pool: number[], crisisDriven: boolean, ecologicalTag: string }}
 */
export function buildEcologicalCandidatePool(ctx, rolls = Math.random) {
  const {
    climateIndex = CLIMATES.Woodlands,
    fauna = null,
    season = SEASONS.Summer,
    isDay = true,
    onRoad = false,
    inLocationRect = false,
    regionIndex = 0,
    playerLevel = 1,
  } = ctx;

  const regState = getRegionState(regionIndex);
  const crisis = regState?.crisis ?? CRISIS_TYPE.PEACE;
  const phase = regState?.phase ?? CRISIS_PHASE.NONE;
  const hasActiveCrisis = crisis !== CRISIS_TYPE.PEACE && phase !== CRISIS_PHASE.NONE;

  // 1. Regional Crisis Overlay (45% chance when region is in an active crisis, or 65% on roads)
  const crisisChance = onRoad ? 0.65 : 0.45;
  if (hasActiveCrisis && rolls() < crisisChance) {
    if (crisis === CRISIS_TYPE.WAR) {
      /** @type {number[]} */
      const warPool = onRoad
        ? [MOBILE_TYPES.Warrior, MOBILE_TYPES.Archer, MOBILE_TYPES.Rogue, MOBILE_TYPES.Knight, MOBILE_TYPES.OrcSergeant]
        : [MOBILE_TYPES.Orc, MOBILE_TYPES.OrcSergeant, MOBILE_TYPES.OrcShaman, MOBILE_TYPES.Warrior, MOBILE_TYPES.Archer, MOBILE_TYPES.Barbarian];
      if (playerLevel >= 12) warPool.push(MOBILE_TYPES.OrcWarlord, MOBILE_TYPES.Battlemage);
      return { pool: warPool, crisisDriven: true, ecologicalTag: 'crisis:war' };
    }
    if (crisis === CRISIS_TYPE.PLAGUE) {
      /** @type {number[]} */
      const plaguePool = isDay
        ? [MOBILE_TYPES.Rat, MOBILE_TYPES.Zombie, MOBILE_TYPES.GiantBat, MOBILE_TYPES.Rogue]
        : [MOBILE_TYPES.Zombie, MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Ghost, MOBILE_TYPES.Mummy, MOBILE_TYPES.Rat];
      if (playerLevel >= 10 && !isDay) plaguePool.push(MOBILE_TYPES.Wraith, MOBILE_TYPES.Vampire);
      return { pool: plaguePool, crisisDriven: true, ecologicalTag: 'crisis:plague' };
    }
    if (crisis === CRISIS_TYPE.FAMINE) {
      const faminePool = onRoad
        ? [MOBILE_TYPES.Rogue, MOBILE_TYPES.Burglar, MOBILE_TYPES.Thief, MOBILE_TYPES.Archer, MOBILE_TYPES.Barbarian]
        : [MOBILE_TYPES.GrizzlyBear, MOBILE_TYPES.SabertoothTiger, MOBILE_TYPES.Archer, MOBILE_TYPES.Rogue];
      return { pool: faminePool, crisisDriven: true, ecologicalTag: 'crisis:famine' };
    }
    if (crisis === CRISIS_TYPE.CIVIL_STRIFE) {
      const strifePool = [
        MOBILE_TYPES.Nightblade,
        MOBILE_TYPES.Rogue,
        MOBILE_TYPES.Assassin,
        MOBILE_TYPES.Bard,
        MOBILE_TYPES.Warrior,
        MOBILE_TYPES.Spellsword,
      ];
      return { pool: strifePool, crisisDriven: true, ecologicalTag: 'crisis:strife' };
    }
  }

  // 2. If a custom Tamriel Fauna Band (`fauna`) is present for provinces beyond the Iliac Bay,
  //    draw from that biome's table first and blend with seasonal/road modifiers.
  if (Array.isArray(fauna) && fauna.length >= 3) {
    const tableIdx = inLocationRect ? fauna[0] : (isDay ? fauna[1] : fauna[2]);
    const biomeTable = encounterTable(tableIdx, { ...ctx, local: true }, rolls);
    if (Array.isArray(biomeTable) && biomeTable.length > 0) {
      const maxSlot = Math.min(biomeTable.length - 1, Math.max(3, playerLevel + 3));
      const minSlot = Math.max(0, Math.min(maxSlot - 3, playerLevel - 4));
      const slice = biomeTable.slice(minSlot, maxSlot + 1).filter((id) => Number.isInteger(id) && id >= 0);
      if (slice.length > 0) {
        if (onRoad && isDay) {
          slice.push(MOBILE_TYPES.Rogue, MOBILE_TYPES.Archer, MOBILE_TYPES.Ranger);
        }
        return { pool: slice, crisisDriven: false, ecologicalTag: `biome:${tableIdx}` };
      }
    }
  }

  // 3. Road Ecology (when travelling along highways/roads outside crisis)
  if (onRoad && rolls() < 0.55) {
    /** @type {number[]} */
    const roadPool = isDay
      ? [MOBILE_TYPES.Rogue, MOBILE_TYPES.Archer, MOBILE_TYPES.Warrior, MOBILE_TYPES.Barbarian, MOBILE_TYPES.Ranger, MOBILE_TYPES.Spellsword]
      : [MOBILE_TYPES.Thief, MOBILE_TYPES.Assassin, MOBILE_TYPES.Nightblade, MOBILE_TYPES.Rogue, MOBILE_TYPES.SkeletalWarrior];
    if (playerLevel >= 8) roadPool.push(MOBILE_TYPES.Knight, MOBILE_TYPES.Battlemage, MOBILE_TYPES.Sorcerer);
    return { pool: roadPool, crisisDriven: false, ecologicalTag: isDay ? 'road:day' : 'road:night' };
  }

  // 4. Climate + Season + Time-of-Day Ecological Pool
  /** @type {number[]} */
  const pool = [];
  let tag = 'wild:temperate';

  switch (climateIndex) {
    case CLIMATES.Desert:
    case CLIMATES.Desert2:
      tag = 'wild:desert';
      if (isDay) {
        pool.push(MOBILE_TYPES.GiantScorpion, MOBILE_TYPES.SabertoothTiger, MOBILE_TYPES.Centaur, MOBILE_TYPES.Archer, MOBILE_TYPES.Barbarian);
        if (season === SEASONS.Summer && playerLevel >= 7) pool.push(MOBILE_TYPES.FireDaedra, MOBILE_TYPES.FireAtronach, MOBILE_TYPES.Dragonling);
      } else {
        pool.push(MOBILE_TYPES.GiantScorpion, MOBILE_TYPES.Mummy, MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Ghost, MOBILE_TYPES.Assassin);
        if (playerLevel >= 9) pool.push(MOBILE_TYPES.Vampire, MOBILE_TYPES.Wraith, MOBILE_TYPES.Daedroth);
      }
      break;

    case CLIMATES.Subtropical:
    case CLIMATES.Rainforest:
      tag = 'wild:tropical';
      if (isDay) {
        pool.push(MOBILE_TYPES.SabertoothTiger, MOBILE_TYPES.Spider, MOBILE_TYPES.Spriggan, MOBILE_TYPES.Nymph, MOBILE_TYPES.Centaur, MOBILE_TYPES.Ranger);
        if (playerLevel >= 6) pool.push(MOBILE_TYPES.Harpy, MOBILE_TYPES.GiantScorpion);
      } else {
        pool.push(MOBILE_TYPES.Spider, MOBILE_TYPES.GiantBat, MOBILE_TYPES.Wereboar, MOBILE_TYPES.Nightblade, MOBILE_TYPES.Zombie);
        if (playerLevel >= 8) pool.push(MOBILE_TYPES.Vampire, MOBILE_TYPES.DaedraSeducer);
      }
      break;

    case CLIMATES.Swamp:
      tag = 'wild:swamp';
      if (isDay) {
        pool.push(MOBILE_TYPES.Spider, MOBILE_TYPES.Rat, MOBILE_TYPES.Spriggan, MOBILE_TYPES.Zombie, MOBILE_TYPES.Orc, MOBILE_TYPES.Rogue);
        if (playerLevel >= 7) pool.push(MOBILE_TYPES.FleshAtronach, MOBILE_TYPES.Gargoyle);
      } else {
        pool.push(MOBILE_TYPES.Zombie, MOBILE_TYPES.Ghost, MOBILE_TYPES.Wraith, MOBILE_TYPES.GiantBat, MOBILE_TYPES.Wereboar, MOBILE_TYPES.SkeletalWarrior);
        if (playerLevel >= 10) pool.push(MOBILE_TYPES.Vampire, MOBILE_TYPES.Lich);
      }
      break;

    case CLIMATES.Mountain:
      tag = 'wild:mountain';
      if (isDay) {
        pool.push(MOBILE_TYPES.GrizzlyBear, MOBILE_TYPES.Harpy, MOBILE_TYPES.Orc, MOBILE_TYPES.OrcSergeant, MOBILE_TYPES.Barbarian);
        if (playerLevel >= 6) pool.push(MOBILE_TYPES.Giant, MOBILE_TYPES.Gargoyle, MOBILE_TYPES.OrcWarlord);
        if (season === SEASONS.Winter && playerLevel >= 7) pool.push(MOBILE_TYPES.IceAtronach, MOBILE_TYPES.FrostDaedra);
      } else {
        pool.push(MOBILE_TYPES.Harpy, MOBILE_TYPES.Werewolf, MOBILE_TYPES.OrcShaman, MOBILE_TYPES.Ghost, MOBILE_TYPES.SkeletalWarrior);
        if (season === SEASONS.Winter && playerLevel >= 6) pool.push(MOBILE_TYPES.FrostDaedra, MOBILE_TYPES.IceAtronach);
        if (playerLevel >= 9) pool.push(MOBILE_TYPES.Vampire, MOBILE_TYPES.Dragonling);
      }
      break;

    case CLIMATES.HauntedWoodlands:
      tag = 'wild:haunted';
      if (isDay) {
        pool.push(MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Zombie, MOBILE_TYPES.Spriggan, MOBILE_TYPES.Wereboar, MOBILE_TYPES.Spider);
        if (playerLevel >= 7) pool.push(MOBILE_TYPES.Gargoyle, MOBILE_TYPES.Mummy);
      } else {
        pool.push(MOBILE_TYPES.Ghost, MOBILE_TYPES.Wraith, MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Zombie, MOBILE_TYPES.Werewolf, MOBILE_TYPES.Vampire);
        if (playerLevel >= 11) pool.push(MOBILE_TYPES.VampireAncient, MOBILE_TYPES.Lich);
      }
      break;

    case CLIMATES.Woodlands:
    case CLIMATES.MountainWoods:
    default:
      tag = 'wild:woodland';
      if (isDay) {
        pool.push(MOBILE_TYPES.GrizzlyBear, MOBILE_TYPES.Spriggan, MOBILE_TYPES.Centaur, MOBILE_TYPES.Orc, MOBILE_TYPES.Archer, MOBILE_TYPES.Ranger);
        if (season === SEASONS.Spring || season === SEASONS.Summer) {
          pool.push(MOBILE_TYPES.Nymph, MOBILE_TYPES.SabertoothTiger);
        } else if (season === SEASONS.Winter) {
          pool.push(MOBILE_TYPES.Barbarian, MOBILE_TYPES.OrcSergeant);
          if (playerLevel >= 7) pool.push(MOBILE_TYPES.IceAtronach, MOBILE_TYPES.FrostDaedra);
        }
        if (playerLevel >= 7) pool.push(MOBILE_TYPES.Giant, MOBILE_TYPES.OrcSergeant);
      } else {
        pool.push(MOBILE_TYPES.Werewolf, MOBILE_TYPES.Wereboar, MOBILE_TYPES.GiantBat, MOBILE_TYPES.Spider, MOBILE_TYPES.SkeletalWarrior, MOBILE_TYPES.Rogue);
        if (season === SEASONS.Fall || season === SEASONS.Winter) {
          pool.push(MOBILE_TYPES.Ghost, MOBILE_TYPES.Wraith);
        }
        if (playerLevel >= 8) pool.push(MOBILE_TYPES.Vampire, MOBILE_TYPES.OrcShaman);
      }
      break;
  }

  // Filter low-level players from facing instant-death high-tier monsters unless lucky/high-roll
  const filtered = pool.filter((id) => {
    if (playerLevel < 4 && (id === MOBILE_TYPES.Wraith || id === MOBILE_TYPES.Vampire || id === MOBILE_TYPES.Ghost || id === MOBILE_TYPES.Giant)) {
      return false;
    }
    return true;
  });

  const finalPool = filtered.length > 0 ? filtered : [MOBILE_TYPES.Rat, MOBILE_TYPES.Imp, MOBILE_TYPES.GrizzlyBear, MOBILE_TYPES.Rogue];
  return { pool: finalPool, crisisDriven: false, ecologicalTag: `${tag}:s${season}:${isDay ? 'day' : 'night'}` };
}

/**
 * Rolls a Living Tamriel wilderness/road encounter that complements or replaces
 * DFO's default `intermittentEnemySpawn` decision.
 *
 * Returns `null` when Living Tamriel defers to vanilla DFO (or when no spawn fires),
 * or `{ mobileType, minDistance, maxDistance, lineOfSightCheck, ecologicalTag, crisisDriven, extraCount }`.
 *
 * @param {Object} ctx
 * @param {number} ctx.gameMinutes
 * @param {number|null} [ctx.skyMinutes]
 * @param {boolean} [ctx.inside=false]
 * @param {boolean} [ctx.inDungeon=false]
 * @param {boolean} [ctx.inLocationRect=false]
 * @param {boolean} [ctx.onRoad=false]
 * @param {number} [ctx.climateIndex=231]
 * @param {number[]|null} [ctx.fauna=null]
 * @param {number} [ctx.regionIndex=0]
 * @param {number} [ctx.playerLevel=1]
 * @param {boolean} [ctx.preventEnemySpawns=false]
 * @param {() => number} [rolls=Math.random]
 */
export function rollLivingWildernessEncounter(ctx, rolls = Math.random) {
  if (!ctx || ctx.inside || ctx.inDungeon || ctx.preventEnemySpawns) return null;

  const share = getWildernessReplacementShare(LivingTamrielConfig.wilderness);
  if (share <= 0) return null;

  // Classic 12-minute cadence window
  if (Math.trunc(ctx.gameMinutes / 12) % 12 !== 0) return null;

  // Check if Living Tamriel claims this spawn window vs vanilla DFO
  if (rolls() >= share) return null;

  const skyMin = Number.isFinite(ctx.skyMinutes) ? Number(ctx.skyMinutes) : ctx.gameMinutes;
  const timeOfDay = ((skyMin % 1440) + 1440) % 1440;
  const isDay = timeOfDay >= 360 && timeOfDay <= 1080;

  // Town rect by day does not spawn random monsters (urban skirmishes are handled by livingSceneHost)
  if (ctx.inLocationRect && isDay) return null;

  const regState = getRegionState(ctx.regionIndex ?? 0);
  const tensionBonus = Math.min(12, Math.floor((regState?.tension ?? 10) / 8));

  // Spawn roll: higher tension in a region increases wilderness/road danger
  const baseRollMax = ctx.inLocationRect ? 24 : (isDay ? 36 : 24);
  const adjustedRollMax = Math.max(10, baseRollMax - tensionBonus);
  if (Math.floor(rolls() * adjustedRollMax) !== 0) return null;

  // Check if a non-seeking wandering adventurer appears on the road instead of a monster during peacetime
  const roadAdvShare = getRoadAdventurerAmbientShare(LivingTamrielConfig.roadAdventurers);
  if (
    !ctx.inLocationRect &&
    ctx.onRoad &&
    (!regState || regState.crisis === CRISIS_TYPE.PEACE) &&
    roadAdvShare > 0 &&
    rolls() < roadAdvShare
  ) {
    const wandering = pickWanderingAdventurerEncounter({
      regionIndex: ctx.regionIndex ?? 0,
      onRoad: Boolean(ctx.onRoad),
      isDay,
      rng: rolls,
    });
    if (wandering) {
      const advType = CLASS_TO_MOBILE_TYPE[wandering.adv.className] ?? MOBILE_TYPES.Ranger;
      return {
        mobileType: advType,
        minDistance: 10,
        maxDistance: 20,
        lineOfSightCheck: true,
        ecologicalTag: `wandering_adventurer_${wandering.situation.toLowerCase()}`,
        crisisDriven: false,
        extraCount: 0,
        isWanderingAdventurer: true,
        adventurerName: wandering.displayName,
        adventurerRecord: wandering.adv,
        situation: wandering.situation,
        nonHostile: wandering.adv.trait !== 'CUTTHROAT',
      };
    }
  }

  const season = seasonValue(dateFromClassicMinutes(skyMin));
  const { pool, crisisDriven, ecologicalTag } = buildEcologicalCandidatePool(
    {
      climateIndex: ctx.climateIndex ?? CLIMATES.Woodlands,
      fauna: ctx.fauna ?? null,
      season,
      isDay,
      onRoad: Boolean(ctx.onRoad),
      inLocationRect: Boolean(ctx.inLocationRect),
      regionIndex: ctx.regionIndex ?? 0,
      playerLevel: ctx.playerLevel ?? 1,
    },
    rolls,
  );

  const mobileType = pool[Math.floor(rolls() * pool.length)];
  const extraCount = crisisDriven && rolls() < 0.5 ? 1 : 0;

  return {
    mobileType,
    minDistance: 10,
    maxDistance: 20,
    lineOfSightCheck: true,
    ecologicalTag,
    crisisDriven,
    extraCount,
  };
}

/**
 * Generates an ecological/crisis pack roster for chunk-load camp encounters when
 * Living Tamriel claims a chunk-load camp roll.
 *
 * @param {Object} ctx
 * @param {number} [ctx.climateIndex=231]
 * @param {number[]|null} [ctx.fauna=null]
 * @param {number} [ctx.skyMinutes=720]
 * @param {number} [ctx.regionIndex=0]
 * @param {number} [ctx.playerLevel=1]
 * @param {() => number} [rolls=Math.random]
 * @returns {{ mobileTypes: number[], ecologicalTag: string, crisisDriven: boolean }|null}
 */
export function rollLivingChunkCampRoster(ctx, rolls = Math.random) {
  const share = getWildernessReplacementShare(LivingTamrielConfig.wilderness);
  if (share <= 0 || rolls() >= share) return null;

  const skyMin = Number.isFinite(ctx.skyMinutes) ? Number(ctx.skyMinutes) : 720;
  const timeOfDay = ((skyMin % 1440) + 1440) % 1440;
  const isDay = timeOfDay >= 360 && timeOfDay <= 1080;
  const season = seasonValue(dateFromClassicMinutes(skyMin));

  const { pool, crisisDriven, ecologicalTag } = buildEcologicalCandidatePool(
    {
      climateIndex: ctx.climateIndex ?? CLIMATES.Woodlands,
      fauna: ctx.fauna ?? null,
      season,
      isDay,
      onRoad: false,
      inLocationRect: false,
      regionIndex: ctx.regionIndex ?? 0,
      playerLevel: ctx.playerLevel ?? 1,
    },
    rolls,
  );

  const count = 2 + Math.floor(rolls() * 2); // 2..3 members
  const mobileTypes = [];
  for (let i = 0; i < count; i++) {
    mobileTypes.push(pool[Math.floor(rolls() * pool.length)]);
  }

  return {
    mobileTypes,
    ecologicalTag,
    crisisDriven,
  };
}

/**
 * Finds a safe, open ground location for a living site (clear of building boxes, walls, and excessive slope).
 * @param {any} deps
 * @param {number[]} originFeet
 * @param {number} [preferredDist=16]
 * @param {number} [preferredAngle=0]
 * @param {number} [radius=4.0]
 * @returns {{ x: number, z: number, suitable: boolean }}
 */
export function findSafeSiteCenter(deps, originFeet, preferredDist = 16, preferredAngle = 0, radius = 4.0) {
  const p = originFeet || [0, 0, 0];
  const angles = [
    preferredAngle,
    preferredAngle + Math.PI * 0.25,
    preferredAngle - Math.PI * 0.25,
    preferredAngle + Math.PI * 0.5,
    preferredAngle - Math.PI * 0.5,
    preferredAngle + Math.PI * 0.75,
    preferredAngle - Math.PI * 0.75,
    preferredAngle + Math.PI,
  ];
  for (const ang of angles) {
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    let dist = preferredDist;

    if (deps?.raycastHit) {
      const eyeY = p[1] + 1.2;
      const hit = deps.raycastHit([p[0], eyeY, p[2]], [dx, 0, dz], dist + radius);
      if (hit && Number.isFinite(hit.dist) && hit.back !== true && hit.dist < dist + radius) {
        if (hit.dist >= radius * 2.0) {
          dist = Math.max(radius * 1.5, hit.dist - radius);
        } else {
          continue; // Blocked by wall/building in this direction
        }
      }
    }

    const cx = p[0] + dx * dist;
    const cz = p[2] + dz * dist;
    const slope = checkCampFootprintSlope(deps?.heightAt, cx, cz, radius);
    if (!slope.suitable) continue;
    const cy = slope.centerHeight;
    const centerSpot = [cx, cy, cz];
    if (deps?.lodgedIn?.(centerSpot) || (deps?.collider && lodgedIn(deps.collider, centerSpot))) {
      continue; // Inside a building box
    }
    return { x: cx, z: cz, suitable: true };
  }

  // Fallback
  return {
    x: p[0] + Math.sin(preferredAngle) * preferredDist,
    z: p[2] + Math.cos(preferredAngle) * preferredDist,
    suitable: false,
  };
}

/**
 * Creates a site blueprint (3D meshes, billboard flats, point lights, and actor spawns)
 * snapped to the terrain at `(centerX, centerZ)`.
 *
 * @param {Object} params
 * @param {string} params.kind One of LIVING_SITE_KINDS
 * @param {number} params.centerX
 * @param {number} params.centerZ
 * @param {(x: number, z: number) => number} params.heightAt
 * @param {number} [params.regionIndex=0]
 * @param {any} [params.playerEntity=null]
 * @param {number} [params.nowMinutes=0]
 * @param {boolean} [params.onRoad=false]
 * @param {boolean} [params.ambushDetectedByStealth=false]
 * @param {() => number} [params.rng=Math.random]
 */
export function buildLivingSiteBlueprint({
  kind,
  centerX,
  centerZ,
  heightAt,
  regionIndex = 0,
  playerEntity = null,
  nowMinutes = 0,
  onRoad = false,
  ambushDetectedByStealth = false,
  rng = Math.random,
  adv: passedAdv = null,
  dfLocation = null,
  locationType = 0,
}) {
  const playerLevel = Math.max(1, Number(playerEntity?.level ?? 1));
  const y0 = snapPropToGround(heightAt, centerX, centerZ, 0);
  const skyMin = Number.isFinite(nowMinutes) ? Number(nowMinutes) : 720;
  const timeOfDay = ((skyMin % 1440) + 1440) % 1440;
  const isDay = timeOfDay >= 360 && timeOfDay <= 1080;
  const season = seasonValue(dateFromClassicMinutes(skyMin));

  /** @type {Array<{ modelId: number, feet: number[], yawDeg: number }>} */
  const meshes = [];
  /** @type {Array<{ archive: number, record: number, feet: number[], lightRadius: number }>} */
  const flats = [];
  /** @type {Array<{ mobileType: number, name: string, level: number, feet: number[], yaw: number, allied: boolean, hostile: boolean, role: string, team?: string }>} */
  const actors = [];
  /** @type {any} */
  let meta = { kind, regionIndex };

  if (kind === LIVING_SITE_KINDS.CHECKPOINT) {
    const info = evaluateCheckpointEncounter({ playerEntity, regionIndex, rng });
    meta = { ...meta, ...info };

    meshes.push(
      { modelId: LIVING_MODELS.BANNER, feet: [centerX - 2.5, snapPropToGround(heightAt, centerX - 2.5, centerZ), centerZ], yawDeg: 0 },
      { modelId: LIVING_MODELS.CRATES, feet: [centerX + 2.5, snapPropToGround(heightAt, centerX + 2.5, centerZ - 1.0), centerZ - 1.0], yawDeg: 25 },
      { modelId: LIVING_MODELS.BOXES, feet: [centerX - 2.2, snapPropToGround(heightAt, centerX - 2.2, centerZ + 1.5), centerZ + 1.5], yawDeg: -15 },
    );
    flats.push(
      { ...LIVING_FLATS.BRAZIER, feet: [centerX - 1.5, snapPropToGround(heightAt, centerX - 1.5, centerZ - 1.2), centerZ - 1.2] },
      { ...LIVING_FLATS.WEAPON_RACK, feet: [centerX + 2.0, snapPropToGround(heightAt, centerX + 2.0, centerZ + 1.2), centerZ + 1.2] },
    );

    const guardCount = Math.min(3, Math.max(2, info.guardCount));
    for (let i = 0; i < guardCount; i++) {
      const gx = centerX + (i - 1) * 2.2;
      const gz = centerZ + (i % 2 === 0 ? 1.5 : -1.0);
      actors.push({
        mobileType: i === 0 ? MOBILE_TYPES.Knight : MOBILE_TYPES.Warrior,
        name: i === 0 ? 'Checkpoint Captain' : 'Provincial Watchman',
        level: Math.max(3, playerLevel),
        feet: [gx, snapPropToGround(heightAt, gx, gz), gz],
        yaw: Math.PI,
        allied: false,
        hostile: false,
        role: 'checkpoint_guard',
        team: SKIRMISH_TEAMS.CITY_WATCH,
        suppressInfighting: true,
      });
    }
  } else if (kind === LIVING_SITE_KINDS.BANDIT_CAMP) {
    meta = { ...meta, ambushDetectedByStealth: Boolean(ambushDetectedByStealth) };
    meshes.push(
      { modelId: LIVING_MODELS.TENT, feet: [centerX - 4.0, snapPropToGround(heightAt, centerX - 4.0, centerZ - 2.0), centerZ - 2.0], yawDeg: 45 },
      { modelId: LIVING_MODELS.TENT, feet: [centerX + 4.0, snapPropToGround(heightAt, centerX + 4.0, centerZ - 2.0), centerZ - 2.0], yawDeg: -45 },
      { modelId: LIVING_MODELS.CRATES, feet: [centerX - 1.5, snapPropToGround(heightAt, centerX - 1.5, centerZ + 3.0), centerZ + 3.0], yawDeg: 15 },
    );
    flats.push(
      { ...LIVING_FLATS.CAMPFIRE, feet: [centerX, y0, centerZ] },
      { ...LIVING_FLATS.SACKS, feet: [centerX + 1.8, snapPropToGround(heightAt, centerX + 1.8, centerZ + 2.2), centerZ + 2.2] },
    );

    const crisisContract = getActiveCrisisContract(regionIndex);
    const leaderName = crisisContract?.targetName
      ? `[CRISIS TARGET] ${crisisContract.targetName}`
      : 'Highway Brigand';
    const banditRoles = [
      { mobileType: MOBILE_TYPES.Rogue, name: leaderName, dx: 2.2, dz: 1.0 },
      { mobileType: MOBILE_TYPES.Archer, name: 'Outlaw Marksman', dx: -2.2, dz: 1.2 },
      { mobileType: MOBILE_TYPES.Warrior, name: 'Deserter Cutthroat', dx: 0, dz: -2.5 },
    ];
    for (const b of banditRoles) {
      const bx = centerX + b.dx;
      const bz = centerZ + b.dz;
      actors.push({
        mobileType: b.mobileType,
        name: b.name,
        level: Math.max(1, playerLevel),
        feet: [bx, snapPropToGround(heightAt, bx, bz), bz],
        yaw: Math.atan2(-b.dx, -b.dz),
        allied: false,
        hostile: !ambushDetectedByStealth,
        role: 'bandit_camp',
        team: 'Criminals',
        suppressInfighting: true,
      });
    }
  } else if (kind === LIVING_SITE_KINDS.TRAVELER_REST) {
    const pleaCheck = evaluatePleaEncounter({ regionIndex, nowMinutes, playerEntity, rng: () => 0.05 });
    meta = { ...meta, plea: pleaCheck.plea };

    meshes.push(
      { modelId: LIVING_MODELS.WAGON, feet: [centerX - 3.8, snapPropToGround(heightAt, centerX - 3.8, centerZ + 1.0), centerZ + 1.0], yawDeg: 30 },
      { modelId: LIVING_MODELS.TENT, feet: [centerX + 3.5, snapPropToGround(heightAt, centerX + 3.5, centerZ - 1.5), centerZ - 1.5], yawDeg: -60 },
      { modelId: LIVING_MODELS.BOXES, feet: [centerX - 1.8, snapPropToGround(heightAt, centerX - 1.8, centerZ - 2.0), centerZ - 2.0], yawDeg: 10 },
    );
    flats.push(
      { ...LIVING_FLATS.CAMPFIRE, feet: [centerX, y0, centerZ] },
      { ...LIVING_FLATS.HORSE, feet: [centerX - 5.2, snapPropToGround(heightAt, centerX - 5.2, centerZ + 2.5), centerZ + 2.5] },
    );

    actors.push(
      {
        mobileType: MOBILE_TYPES.Bard,
        name: 'Wayfaring Merchant',
        level: Math.max(2, playerLevel),
        feet: [centerX + 1.6, snapPropToGround(heightAt, centerX + 1.6, centerZ + 1.2), centerZ + 1.2],
        yaw: Math.PI,
        allied: false,
        hostile: false,
        role: 'traveler',
        team: 'Traveler',
        suppressInfighting: true,
      },
      {
        mobileType: MOBILE_TYPES.Ranger,
        name: 'Caravan Outrider',
        level: Math.max(2, playerLevel),
        feet: [centerX - 1.6, snapPropToGround(heightAt, centerX - 1.6, centerZ + 1.6), centerZ + 1.6],
        yaw: 0,
        allied: false,
        hostile: false,
        role: 'traveler_guard',
        team: 'Traveler',
        suppressInfighting: true,
      },
    );
  } else if (kind === LIVING_SITE_KINDS.QUARANTINE_TENT) {
    const pleaCheck = evaluatePleaEncounter({ regionIndex, nowMinutes, playerEntity, rng: () => 0.05 });
    const reliefInfo = getQuarantineReliefPostInfo(regionIndex) ?? {
      healerPresent: true,
      cureCostMultiplier: 2.0,
      dialogue: LIVING_WORDS.quarantineReliefTent(),
    };
    meta = {
      ...meta,
      plea: pleaCheck.plea ?? { type: 'PLAGUE_CURE', requiredGold: 35, messageKey: 'living.plea.plague' },
      reliefInfo,
    };

    meshes.push(
      { modelId: LIVING_MODELS.PAVILION, feet: [centerX, y0, centerZ], yawDeg: 0 },
      { modelId: LIVING_MODELS.BOXES, feet: [centerX + 3.0, snapPropToGround(heightAt, centerX + 3.0, centerZ + 1.5), centerZ + 1.5], yawDeg: 20 },
      { modelId: LIVING_MODELS.CRATES, feet: [centerX - 3.0, snapPropToGround(heightAt, centerX - 3.0, centerZ + 1.5), centerZ + 1.5], yawDeg: -25 },
    );
    flats.push(
      { ...LIVING_FLATS.BRAZIER, feet: [centerX + 2.2, snapPropToGround(heightAt, centerX + 2.2, centerZ + 2.8), centerZ + 2.8] },
      { ...LIVING_FLATS.SACKS, feet: [centerX - 2.0, snapPropToGround(heightAt, centerX - 2.0, centerZ + 2.5), centerZ + 2.5] },
    );

    actors.push(
      {
        mobileType: MOBILE_TYPES.Healer,
        name: 'Quarantine Physician',
        level: Math.max(4, playerLevel),
        feet: [centerX + 1.2, snapPropToGround(heightAt, centerX + 1.2, centerZ + 3.2), centerZ + 3.2],
        yaw: 0,
        allied: false,
        hostile: false,
        role: 'quarantine_healer',
        team: 'Civilian',
        suppressInfighting: true,
      },
      {
        mobileType: MOBILE_TYPES.Monk,
        name: 'Temple Almoner',
        level: Math.max(3, playerLevel),
        feet: [centerX - 1.4, snapPropToGround(heightAt, centerX - 1.4, centerZ + 3.0), centerZ + 3.0],
        yaw: 0,
        allied: false,
        hostile: false,
        role: 'quarantine_healer',
        team: 'Civilian',
        suppressInfighting: true,
      },
    );
  } else if (kind === LIVING_SITE_KINDS.PLEA_ENCOUNTER) {
    const pleaCheck = evaluatePleaEncounter({ regionIndex, nowMinutes, playerEntity, rng: () => 0.05 });
    const plea = pleaCheck.plea ?? {
      type: 'ESCORT_REQUEST',
      requiredGold: 25,
      messageKey: 'living.plea.escort',
    };
    meta = { ...meta, plea };

    flats.push({
      ...LIVING_FLATS.SACKS,
      feet: [centerX - 1.0, snapPropToGround(heightAt, centerX - 1.0, centerZ - 0.5), centerZ - 0.5],
    });

    const supplicantType =
      plea.type === 'PLAGUE_CURE'
        ? MOBILE_TYPES.Healer
        : plea.type === 'FAMINE_BREAD'
          ? MOBILE_TYPES.Monk
          : plea.type === 'WAR_REFUGEE'
            ? MOBILE_TYPES.Bard
            : MOBILE_TYPES.Ranger;
    const supplicantName =
      plea.type === 'PLAGUE_CURE'
        ? 'Plague-Stricken Citizen'
        : plea.type === 'FAMINE_BREAD'
          ? 'Starving Townsfolk'
          : plea.type === 'WAR_REFUGEE'
            ? 'Displaced Refugee'
            : 'Anxious Wayfarer';

    actors.push({
      mobileType: supplicantType,
      name: supplicantName,
      level: Math.max(1, playerLevel - 1),
      feet: [centerX, y0, centerZ],
      yaw: Math.PI,
      allied: false,
      hostile: false,
      role: 'plea_supplicant',
      team: 'Civilian',
      suppressInfighting: true,
    });
  } else if (kind === LIVING_SITE_KINDS.URBAN_SKIRMISH) {
    const plan = planUrbanSkirmish({
      centerX,
      centerZ,
      doorwayPositions: [],
      heightSampler: heightAt,
      rng,
      regionIndex,
      locationType,
      dfLocation,
      playerEntity,
    });
    if (plan) {
      meta.event = plan.event;
      meta.faction1Name = plan.faction1Name;
      meta.faction2Name = plan.faction2Name;
      meshes.push(
        { modelId: LIVING_MODELS.CRATES, feet: [plan.props[0].x, plan.props[0].y, plan.props[0].z], yawDeg: 35 },
      );
      if (plan.props[1]) {
        meshes.push(
          { modelId: LIVING_MODELS.WAGON, feet: [plan.props[1].x, plan.props[1].y, plan.props[1].z], yawDeg: -50 },
        );
      }
      flats.push({ ...LIVING_FLATS.BRAZIER, feet: [centerX, y0, centerZ] });

      for (let i = 0; i < plan.guards.length; i++) {
        const g = plan.guards[i];
        const gx = centerX + g.dx;
        const gz = centerZ + g.dz;
        actors.push({
          mobileType: g.mobileType ?? MOBILE_TYPES.Knight,
          name: `${plan.faction1Name ?? 'Guard'} Defender`,
          level: Math.max(4, playerLevel),
          feet: [gx, snapPropToGround(heightAt, gx, gz), gz],
          yaw: 0,
          allied: true,
          hostile: false,
          role: 'skirmish_guard',
          team: SKIRMISH_TEAMS.CITY_WATCH,
          factionSide: 'guards',
          suppressInfighting: true,
        });
      }
      for (let i = 0; i < plan.rebels.length; i++) {
        const rb = plan.rebels[i];
        const rx = centerX + rb.dx;
        const rz = centerZ + rb.dz;
        actors.push({
          mobileType: rb.mobileType ?? MOBILE_TYPES.Rogue,
          name: `${plan.faction2Name ?? 'Rebel'} Fighter`,
          level: Math.max(3, playerLevel),
          feet: [rx, snapPropToGround(heightAt, rx, rz), rz],
          yaw: Math.PI,
          allied: false,
          hostile: true,
          role: 'skirmish_rebel',
          team: SKIRMISH_TEAMS.INSURGENTS,
          factionSide: 'rebels',
          suppressInfighting: true,
        });
      }
    }
  } else if (kind === LIVING_SITE_KINDS.NEMESIS_AMBUSH) {
    const rep = Number(playerEntity?.regionalReputations?.[regionIndex] ?? 0);
    const regState = getRegionState(regionIndex);
    const isCrisis = regState?.crisis !== CRISIS_TYPE.PEACE;
    const nemMem = getNemesisMemory();
    const hasGrudge = Boolean(nemMem?.hasGrudge);
    const archetype = determineNemesisArchetype(playerEntity, {
      legalReputation: rep,
      playerLevel,
      isCrisis,
      hasGrudge,
      playerGold: Number(playerEntity?.goldPieces ?? 0),
      rng,
    });
    const customName =
      archetype === NEMESIS_ARCHETYPES.GRUDGE_AVENGER && nemMem?.lastNemesisName
        ? nemMem.lastNemesisName
        : undefined;
    const nemesis = createNemesisHunter(playerLevel, { name: customName, archetype, rng });
    meta = { ...meta, nemesis };

    const leaderType = CLASS_TO_MOBILE_TYPE[nemesis.className] ?? MOBILE_TYPES.Assassin;
    actors.push({
      mobileType: leaderType,
      name: nemesis.name,
      level: nemesis.level,
      feet: [centerX, y0, centerZ],
      yaw: Math.PI,
      allied: false,
      hostile: false, // Held until ChoiceWindow resolves!
      role: 'nemesis_leader',
      team: 'NemesisGang',
      suppressInfighting: true,
    });

    const minionTypes = [MOBILE_TYPES.Rogue, MOBILE_TYPES.Archer, MOBILE_TYPES.Warrior];
    for (let i = 0; i < nemesis.minions.length; i++) {
      const m = nemesis.minions[i];
      const angle = ((i + 1) / (nemesis.minions.length + 1)) * Math.PI - Math.PI / 2;
      const mx = centerX + Math.sin(angle) * 3.0;
      const mz = centerZ + Math.cos(angle) * 2.5;
      actors.push({
        mobileType: minionTypes[i % minionTypes.length],
        name: m.name,
        level: m.level,
        feet: [mx, snapPropToGround(heightAt, mx, mz), mz],
        yaw: Math.PI,
        allied: false,
        hostile: false,
        role: 'nemesis_minion',
        team: 'NemesisGang',
        suppressInfighting: true,
      });
    }
  } else if (kind === LIVING_SITE_KINDS.ADVENTURER_MEETING) {
    const reg = getAdventurerSimRegistry();
    const regionalPool = (reg.pool || []).filter(
      (a) => a.status !== ADVENTURER_STATUS.DEAD && a.currentRegion === regionIndex,
    );
    const adv = regionalPool[0] || {
      id: 999,
      name: 'Sir Kaelen the Bold',
      className: 'Knight',
      trait: 'ARROGANT',
      level: playerLevel,
      gearTier: Math.min(9, Math.floor(playerLevel / 5) + 1),
      currentRegion: regionIndex,
    };
    const tension = evaluateAdventurerTension(adv, playerEntity);
    meta = { ...meta, adv, tension };

    flats.push({ ...LIVING_FLATS.CAMPFIRE, feet: [centerX, y0, centerZ] });
    meshes.push({
      modelId: LIVING_MODELS.TENT,
      feet: [centerX - 3.0, snapPropToGround(heightAt, centerX - 3.0, centerZ - 2.0), centerZ - 2.0],
      yawDeg: 35,
    });

    const advType = CLASS_TO_MOBILE_TYPE[adv.className] ?? MOBILE_TYPES.Warrior;
    actors.push({
      mobileType: advType,
      name: `${adv.name} (${adv.className})`,
      level: adv.level,
      feet: [centerX + 1.5, snapPropToGround(heightAt, centerX + 1.5, centerZ + 1.0), centerZ + 1.0],
      yaw: Math.PI,
      allied: false,
      hostile: false,
      role: 'rival_adventurer',
      team: 'Adventurer',
      suppressInfighting: true,
    });
  } else if (kind === LIVING_SITE_KINDS.WANDERING_ADVENTURER) {
    const wandering = pickWanderingAdventurerEncounter({
      regionIndex,
      onRoad: Boolean(onRoad),
      isDay,
      playerEntity,
      rng,
    });
    const adv = passedAdv ?? wandering.adv;
    const situation = wandering.situation;
    const displayName = getAdventurerDisplayName(adv);
    adv.name = displayName;
    meta = { ...meta, ...wandering, adv, displayName };

    const advType = CLASS_TO_MOBILE_TYPE[adv.className] ?? MOBILE_TYPES.Warrior;

    if (situation === ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP) {
      flats.push({ ...LIVING_FLATS.CAMPFIRE, feet: [centerX, y0, centerZ] });
      meshes.push({
        modelId: LIVING_MODELS.TENT,
        feet: [centerX - 3.0, snapPropToGround(heightAt, centerX - 3.0, centerZ - 1.8), centerZ - 1.8],
        yawDeg: 30,
      });
    } else if (situation === ROAD_ADVENTURER_SITUATION.RETURNING_WITH_SPOILS) {
      meshes.push({
        modelId: LIVING_MODELS.BOXES,
        feet: [centerX - 1.6, snapPropToGround(heightAt, centerX - 1.6, centerZ - 1.0), centerZ - 1.0],
        yawDeg: 15,
      });
      flats.push(
        { ...LIVING_FLATS.SACKS, feet: [centerX + 1.4, snapPropToGround(heightAt, centerX + 1.4, centerZ - 0.8), centerZ - 0.8] },
        { ...LIVING_FLATS.HORSE, feet: [centerX - 2.6, snapPropToGround(heightAt, centerX - 2.6, centerZ + 1.2), centerZ + 1.2] },
      );
    } else if (situation === ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD) {
      flats.push(
        { ...LIVING_FLATS.HORSE, feet: [centerX - 2.2, snapPropToGround(heightAt, centerX - 2.2, centerZ + 0.8), centerZ + 0.8] },
        { ...LIVING_FLATS.SACKS, feet: [centerX - 1.2, snapPropToGround(heightAt, centerX - 1.2, centerZ - 0.6), centerZ - 0.6] },
      );
    } else if (situation === ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS) {
      const { pool } = buildEcologicalCandidatePool(
        {
          climateIndex: 231,
          season,
          isDay,
          onRoad: false,
          inLocationRect: false,
          regionIndex,
          playerLevel,
        },
        rng,
      );
      const m1 = pool[Math.floor(rng() * pool.length)] ?? MOBILE_TYPES.Orc;
      const m2 = pool[Math.floor(rng() * pool.length)] ?? MOBILE_TYPES.GrizzlyBear;
      actors.push(
        {
          mobileType: m1,
          name: 'Roadside Marauder',
          level: Math.max(1, playerLevel),
          feet: [centerX - 2.5, snapPropToGround(heightAt, centerX - 2.5, centerZ - 2.0), centerZ - 2.0],
          yaw: 0,
          allied: false,
          hostile: true,
          role: 'skirmish_monster',
          team: 'SkirmishMonsters',
          factionSide: 'monsters',
          suppressInfighting: true,
        },
        {
          mobileType: m2,
          name: 'Wilderness Stalker',
          level: Math.max(1, playerLevel),
          feet: [centerX + 2.5, snapPropToGround(heightAt, centerX + 2.5, centerZ - 2.0), centerZ - 2.0],
          yaw: 0,
          allied: false,
          hostile: true,
          role: 'skirmish_monster',
          team: 'SkirmishMonsters',
          factionSide: 'monsters',
          suppressInfighting: true,
        },
      );
    }

    const isFightingMonsters = situation === ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS;
    actors.push({
      mobileType: advType,
      name: displayName,
      level: adv.level,
      feet: [centerX + 1.2, snapPropToGround(heightAt, centerX + 1.2, centerZ + 1.0), centerZ + 1.0],
      yaw: Math.PI,
      allied: isFightingMonsters,
      hostile: false,
      role: 'wandering_adventurer',
      team: isFightingMonsters ? 'PlayerAlly' : 'Adventurer',
      suppressInfighting: true,
    });
  } else if (kind === LIVING_SITE_KINDS.NAVAL_SQUADRON) {
    const regState = getRegionState(regionIndex);
    const atWar =
      regState?.crisis === CRISIS_TYPE.WAR || regState?.crisis === CRISIS_TYPE.CIVIL_STRIFE;
    const squad = planSquadronEncounter({
      playerX: centerX,
      playerZ: centerZ,
      atWar,
      rng,
    }) ?? {
      law: [{ x: centerX - 18, z: centerZ + 24, isAlly: false }],
      pirates: [{ x: centerX + 18, z: centerZ + 24, isAlly: false }],
      bearing: 0,
      distance: 220,
    };
    meta.squadron = squad;
    meta.activeProjectiles = 0;

    for (let i = 0; i < squad.law.length; i++) {
      const s = squad.law[i];
      const sy = snapPropToGround(heightAt, s.x, s.z);
      meshes.push({ modelId: LIVING_MODELS.CRATES, feet: [s.x, sy, s.z], yawDeg: i * 45 });
      flats.push({ ...LIVING_FLATS.BRAZIER, feet: [s.x + 1.2, sy, s.z] });
      actors.push({
        mobileType: MOBILE_TYPES.Knight,
        name: 'Crown Marine',
        level: Math.max(2, playerLevel),
        feet: [s.x, sy, s.z],
        yaw: 0,
        allied: Boolean(s.isAlly),
        hostile: false,
        role: 'naval_law',
        team: s.isAlly ? 'PlayerAlly' : 'NavalLaw',
        factionSide: 'law',
        suppressInfighting: true,
      });
    }

    for (let i = 0; i < squad.pirates.length; i++) {
      const s = squad.pirates[i];
      const sy = snapPropToGround(heightAt, s.x, s.z);
      meshes.push({ modelId: LIVING_MODELS.BOXES, feet: [s.x, sy, s.z], yawDeg: i * 60 });
      flats.push({ ...LIVING_FLATS.SACKS, feet: [s.x - 1.2, sy, s.z] });
      actors.push({
        mobileType: MOBILE_TYPES.Rogue,
        name: 'Bay Pirate',
        level: Math.max(2, playerLevel),
        feet: [s.x, sy, s.z],
        yaw: Math.PI,
        allied: Boolean(s.isAlly),
        hostile: false,
        role: 'naval_pirate',
        team: s.isAlly ? 'PlayerAlly' : 'NavalPirate',
        factionSide: 'pirates',
        suppressInfighting: true,
      });
    }
  }

  return {
    kind,
    center: [centerX, y0, centerZ],
    meshes,
    flats,
    actors,
    meta,
    rng,
  };
}

/**
 * Creates the live 3D scene host for Living Tamriel props, camps, checkpoints,
 * quarantine relief tents, urban skirmishes, Nemesis ambushes, and Rival Adventurers.
 *
 * @param {{
 *   feet: () => (number[] | null),
 *   ready: () => boolean,
 *   clock: () => number,
 *   regionIndex: () => number,
 *   inLocationRect: () => boolean,
 *   onRoad: () => boolean,
 *   afloat?: () => boolean,
 *   heightAt: (x: number, z: number) => number,
 *   playerEntity: () => any,
 *   spawn: (type: number, feet: number[], opts: any) => Promise<any>,
 *   remove: (rec: any) => void,
 *   inPool: (rec: any) => boolean,
 *   say: (text: string, sec?: number) => void,
 *   openChoice?: (spec: { lines: string[], options: Array<{ code: string, label: string, action: () => void }> }) => void,
 *   playSound?: (soundId: number) => void,
 *   onCompanionChanged?: (companion: any | null) => void,
 *   renderer?: any,
 *   meshes?: { getGpuMesh?: (id: number) => Promise<any> },
 *   getTexture?: (archive: number) => Promise<any>,
 *   uploadRecordFrame?: (archive: number, record: number, frame: number) => void,
 *   rng?: () => number,
 * }} deps
 */
export function createLivingSceneHost(deps) {
  const rng = deps.rng ?? Math.random;
  /** @type {Map<number, any>} modelId -> { gpu } */
  const gpuModels = new Map();
  /** @type {Set<number>} */
  const loadingModels = new Set();
  /** @type {Map<string, { w: number, h: number }>} `${archive}:${record}` -> size */
  const flatSizes = new Map();
  /** @type {Set<string>} */
  const loadingFlats = new Set();

  /** Active stood site in the scene, or null. */
  let stood = /** @type {any} */ (null);
  let checkTimer = 0;
  let lastSpawnMinute = -999999;
  let lastSkirmishRegion = -1;
  const locationSkirmishCooldowns = new Map();
  const SKIRMISH_LOCATION_COOLDOWN_MINUTES = 4320; // 3 in-game days
  let lastQuarantineRegion = -1;
  let companionFoe = /** @type {any} */ (null);
  let companionId = /** @type {number|string|null} */ (null);
  let companionSpawning = false;

  function syncCompanion(feet, nowMin) {
    const comp = getActiveAdventurerCompanion(nowMin);
    if (!comp) {
      if (companionFoe && deps.inPool(companionFoe)) {
        try {
          deps.remove(companionFoe);
        } catch (_e) {}
      }
      if (companionFoe || companionId !== null) {
        deps.say?.(LIVING_WORDS.roadAdvExpired ? LIVING_WORDS.roadAdvExpired('Adventurer') : "Your contracted companion's 24-hour service has expired. They bid you farewell and return to the road.", 6);
        companionFoe = null;
        companionId = null;
        deps.onCompanionChanged?.(null);
      }
      return;
    }

    if (companionFoe?.dead) {
      dismissAdventurerCompanion();
      companionFoe = null;
      companionId = null;
      deps.onCompanionChanged?.(null);
      return;
    }

    if (companionId !== comp.id) {
      companionId = comp.id;
      deps.onCompanionChanged?.(comp);
    }

    if ((!companionFoe || !deps.inPool(companionFoe)) && !companionSpawning && feet) {
      companionSpawning = true;
      const mobileType = CLASS_TO_MOBILE_TYPE[comp.className] ?? MOBILE_TYPES.Knight;
      const cx = feet[0] + 2.4;
      const cz = feet[2] + 2.4;
      const cy = snapPropToGround(deps.heightAt, cx, cz);
      Promise.resolve(
        deps.spawn(mobileType, [cx, cy, cz], {
          yaw: 0,
          level: comp.level || 5,
          allied: true,
          team: 'PlayerAlly',
          loose: true,
          transient: true,
          managed: true,
        }),
      )
        .then((rec) => {
          companionSpawning = false;
          if (!rec) return;
          if (rec.entity) {
            rec.entity.name = comp.displayName || comp.name;
            rec.entity.team = 'PlayerAlly';
            rec.entity.mobileTeam = 'PlayerAlly';
          }
          if (rec.ai) {
            rec.ai.isHostile = false;
            rec.ai.target = null;
            rec.ai.secondaryTarget = null;
            rec.ai.follow = { feet: () => deps.feet?.() ?? [rec.ai.feet[0], rec.ai.feet[1], rec.ai.feet[2]], stop: 2.5 };
            rec.ai.moving = true;
            rec.ai.canAct = true;
            if (typeof rec.ai.resumeLive === 'function') rec.ai.resumeLive();
          }
          rec.companion = `adv:${comp.name}`;
          rec.shipmate = true;
          rec.livingRole = 'recruited_companion';
          companionFoe = rec;
        })
        .catch(() => {
          companionSpawning = false;
        });
    } else if (companionFoe && !companionFoe.dead && companionFoe.ai && feet) {
      if (!companionFoe.ai.follow) {
        companionFoe.ai.follow = { feet: () => deps.feet?.() ?? [companionFoe.ai.feet[0], companionFoe.ai.feet[1], companionFoe.ai.feet[2]], stop: 2.5 };
      }
      companionFoe.ai.moving = true;
      companionFoe.ai.canAct = true;
      companionFoe.ai.isHostile = false;
      const ff = companionFoe.ai.feet ?? companionFoe.pos;
      if (ff) {
        const dist = Math.hypot(ff[0] - feet[0], ff[2] - feet[2]);
        if (dist > 35) {
          const rx = feet[0] - 2.0;
          const rz = feet[2] - 2.0;
          const ry = snapPropToGround(deps.heightAt, rx, rz);
          if (companionFoe.pos) { companionFoe.pos[0] = rx; companionFoe.pos[1] = ry; companionFoe.pos[2] = rz; }
          if (companionFoe.feet) { companionFoe.feet[0] = rx; companionFoe.feet[1] = ry; companionFoe.feet[2] = rz; }
          if (companionFoe.ai.feet) { companionFoe.ai.feet[0] = rx; companionFoe.ai.feet[1] = ry; companionFoe.ai.feet[2] = rz; }
        }
      }
    }
  }

  function ensureModel(modelId) {
    if (gpuModels.has(modelId) || loadingModels.has(modelId) || !deps.meshes?.getGpuMesh) return;
    loadingModels.add(modelId);
    Promise.resolve(deps.meshes.getGpuMesh(modelId))
      .then((gpu) => {
        if (gpu) gpuModels.set(modelId, { gpu });
      })
      .catch(() => {})
      .finally(() => {
        loadingModels.delete(modelId);
      });
  }

  function ensureFlat(archive, record) {
    const key = `${archive}:${record}`;
    if (flatSizes.has(key) || loadingFlats.has(key) || !deps.getTexture) return;
    loadingFlats.add(key);
    Promise.resolve(deps.getTexture(archive))
      .then((tex) => {
        if (!tex) return;
        const count = tex.getFrameCount?.(record) ?? 1;
        for (let i = 0; i < count; i++) deps.uploadRecordFrame?.(archive, record, i);
        const sz = tex.getSize?.(record) ?? { width: 1.2, height: 1.2 };
        flatSizes.set(key, { w: sz.width * GLOBAL_SCALE, h: sz.height * GLOBAL_SCALE });
      })
      .catch(() => {})
      .finally(() => {
        loadingFlats.delete(key);
      });
  }

  function releaseSite() {
    const s = stood;
    if (!s) return;
    stood = null;
    for (const f of s.foes) {
      if (!f?.dead && deps.inPool(f)) {
        try {
          deps.remove(f);
        } catch (_e) {}
      }
    }
    if (s.batches?.length && deps.renderer?.destroyBillboardBatch) {
      for (const b of s.batches) {
        try {
          deps.renderer.destroyBillboardBatch(b);
        } catch (_e) {}
      }
    }
  }

  function setSiteHostile(s, hostile = true) {
    if (!s) return;
    s.hostile = hostile;
    for (const f of s.foes) {
      if (f && !f.dead && f.ai) {
        f.ai.isHostile = hostile;
        f.ai.detected = hostile;
        f.ai.target = hostile ? deps.playerEntity() : null;
      }
    }
  }

  function triggerSiteInteraction(s) {
    if (!s || s.interacted || !deps.openChoice) return;
    s.interacted = true;
    const player = deps.playerEntity();
    const regIdx = s.blueprint.meta?.regionIndex ?? deps.regionIndex();
    const nowMin = deps.clock();
    const rng = s.blueprint?.rng ?? s.blueprint?.meta?.rng ?? (deps.rng ?? Math.random);

    if (s.kind === LIVING_SITE_KINDS.CHECKPOINT) {
      const contractOffer = !getActiveCrisisContract(regIdx)
        ? offerRegionalCrisisContract(regIdx, Number(player?.level ?? 1))
        : null;
      if (hasRegionalCheckpointPass(regIdx, nowMin) && !contractOffer) {
        deps.say(LIVING_WORDS.checkpointPassed(), 5);
        return;
      }
      deps.playSound?.(LIVING_SOUNDS.HALT);
      const tollGold = s.blueprint.meta?.tollGold ?? 50;
      const options = [
        {
          code: 'Digit1',
          label: `1. ${LIVING_WORDS.checkpointOptionKnight()}`,
          action: () => {
            const res = resolveCheckpointInteraction({
              playerEntity: player,
              method: player?.guildMemberships?.[10]?.rank > 0 ? 'knight' : 'reputation',
              tollGoldRequired: tollGold,
              regionIndex: regIdx,
              nowMinutes: nowMin,
              rng,
            });
            deps.say(res.message, 5);
            if (res.outcome === CHECKPOINT_OUTCOME.REFUSED) {
              setSiteHostile(s, true);
            }
          },
        },
        {
          code: 'Digit2',
          label: `2. ${LIVING_WORDS.checkpointOptionToll(tollGold)}`,
          action: () => {
            const haveGold = Number(player?.goldPieces ?? 0);
            const res = resolveCheckpointInteraction({
              playerEntity: player,
              method: 'toll',
              tollGoldRequired: tollGold,
              tollPaid: haveGold,
              regionIndex: regIdx,
              nowMinutes: nowMin,
              rng,
            });
            if (res.outcome === CHECKPOINT_OUTCOME.TOLL_PAID && player) {
              player.goldPieces = Math.max(0, haveGold - tollGold);
            } else if (res.outcome === CHECKPOINT_OUTCOME.REFUSED) {
              setSiteHostile(s, true);
            }
            deps.say(res.message, 5);
          },
        },
        {
          code: 'Digit3',
          label: `3. ${LIVING_WORDS.checkpointOptionDiplomacy()}`,
          action: () => {
            const res = resolveCheckpointInteraction({
              playerEntity: player,
              method: 'etiquette',
              tollGoldRequired: tollGold,
              regionIndex: regIdx,
              nowMinutes: nowMin,
              rng,
            });
            if (res.outcome === CHECKPOINT_OUTCOME.REFUSED) {
              const haveGold = Number(player?.goldPieces ?? 0);
              if (res.compromiseToll && res.compromiseToll > 0 && haveGold >= res.compromiseToll && player) {
                player.goldPieces = Math.max(0, haveGold - res.compromiseToll);
                grantRegionalCheckpointPass(regIdx, nowMin);
                deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
                deps.say(LIVING_WORDS.checkpointCompromise(res.compromiseToll), 5);
                return;
              }
              if (res.rollResult?.isCatastrophe) {
                setSiteHostile(s, true);
              }
            }
            deps.say(res.message, 5);
          },
        },
        {
          code: 'Digit4',
          label: `4. ${LIVING_WORDS.checkpointOptionForce()}`,
          action: () => {
            const res = resolveCheckpointInteraction({
              playerEntity: player,
              method: 'force',
              tollGoldRequired: tollGold,
              regionIndex: regIdx,
              nowMinutes: nowMin,
              rng,
            });
            setSiteHostile(s, true);
            deps.say(res.message, 5);
          },
        },
      ];
      if (contractOffer) {
        options.push({
          code: 'Digit5',
          label: `5. ${LIVING_WORDS.crisisContractOptionAccept(contractOffer.title, contractOffer.rewardGold)}`,
          action: () => {
            const accepted = acceptRegionalCrisisContract(regIdx, Number(player?.level ?? 1), nowMin);
            if (accepted) {
              deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
              deps.say(LIVING_WORDS.crisisContractAccepted(accepted.title), 6);
            }
          },
        });
      }
      deps.openChoice({
        lines: [
          `Checkpoint Guard: "${LIVING_WORDS.checkpointHalt()}"`,
          `Inspection Toll: ${LIVING_WORDS.checkpointTollDemand(tollGold)}`,
        ],
        options,
      });
    } else if (s.kind === LIVING_SITE_KINDS.NEMESIS_AMBUSH) {
      deps.playSound?.(LIVING_SOUNDS.DRAW_WEAPON);
      const nemesis = s.blueprint.meta?.nemesis;
      if (!nemesis) return;
      deps.openChoice({
        lines: [
          `${nemesis.name} (${nemesis.archetype || 'Bounty Hunter'}): "${LIVING_WORDS.nemesisMotive(nemesis.archetype)}"`,
          `Demands: Settle the contract or draw steel!`,
        ],
        options: [
          {
            code: 'Digit1',
            label: `1. ${LIVING_WORDS.nemesisOptionTaunt()}`,
            action: () => {
              const res = resolveNemesisConfrontation(player, nemesis, 'taunt', rng);
              deps.say(res.message, 5);
              if (res.resolution === NEMESIS_RESOLUTION.SOLO_DUEL_ACCEPTED) {
                // Remove minions so only the Nemesis fights 1v1!
                for (const f of s.foes) {
                  if (f?.livingRole === 'nemesis_minion' && deps.inPool(f)) {
                    deps.remove(f);
                  } else if (f?.ai) {
                    f.ai.isHostile = true;
                  }
                }
              } else {
                setSiteHostile(s, true);
              }
            },
          },
          {
            code: 'Digit2',
            label: `2. ${LIVING_WORDS.nemesisOptionEtiquette()}`,
            action: () => {
              const res = resolveNemesisConfrontation(player, nemesis, 'etiquette', rng);
              deps.say(res.message, 5);
              if (
                res.resolution === NEMESIS_RESOLUTION.PACIFIED ||
                res.resolution === NEMESIS_RESOLUTION.LUCK_SAVED
              ) {
                setSiteHostile(s, false);
              } else {
                setSiteHostile(s, true);
              }
            },
          },
          {
            code: 'Digit3',
            label: `3. ${LIVING_WORDS.nemesisOptionStreetwise()}`,
            action: () => {
              const res = resolveNemesisConfrontation(player, nemesis, 'streetwise', rng);
              deps.say(res.message, 5);
              if (res.resolution === NEMESIS_RESOLUTION.BRIBED && player) {
                const bribeCost = Number(res.bribeGold || Math.max(50, (nemesis.level || 1) * 40));
                player.goldPieces = Math.max(0, Number(player.goldPieces ?? 0) - bribeCost);
                setSiteHostile(s, false);
              } else if (
                res.resolution === NEMESIS_RESOLUTION.INTIMIDATED ||
                res.resolution === NEMESIS_RESOLUTION.LUCK_SAVED
              ) {
                setSiteHostile(s, false);
              } else {
                setSiteHostile(s, true);
              }
            },
          },
          {
            code: 'Digit4',
            label: `4. ${LIVING_WORDS.nemesisOptionFight()}`,
            action: () => {
              const res = resolveNemesisConfrontation(player, nemesis, 'duel', rng);
              setSiteHostile(s, true);
              deps.say(res.message, 5);
            },
          },
        ],
      });
    } else if (s.kind === LIVING_SITE_KINDS.ADVENTURER_MEETING) {
      const adv = s.blueprint.meta?.adv;
      const tension = s.blueprint.meta?.tension;
      if (!adv) return;
      const wager = tension?.wagerGold ?? 50;
      deps.openChoice({
        lines: [
          `${adv.name} (${adv.className}, Lv.${adv.level}): "${LIVING_WORDS.adventurerGreeting(adv.trait, wager)}"`,
        ],
        options: [
          {
            code: 'Digit1',
            label: `1. ${LIVING_WORDS.adventurerOptionDuel(wager)}`,
            action: () => {
              deps.playSound?.(LIVING_SOUNDS.SWORD_CLINK);
              const res = resolveAdventurerEncounter({
                adv,
                playerEntity: player,
                action: 'ACCEPT_DARE',
                wagerGold: wager,
                rng,
              });
              if (player && res.goldDelta) {
                player.goldPieces = Math.max(0, Number(player.goldPieces ?? 0) + res.goldDelta);
              }
              if (res.outcome === DUEL_OUTCOME.PLAYER_WON) {
                deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
                recordAdventurerGrudge(adv.name);
              }
              deps.say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, Math.abs(res.goldDelta)), 5);
            },
          },
          {
            code: 'Digit2',
            label: `2. ${LIVING_WORDS.adventurerOptionEtiquette()}`,
            action: () => {
              const res = resolveAdventurerEncounter({
                adv,
                playerEntity: player,
                action: 'APPEAL_ETIQUETTE',
                wagerGold: wager,
                rng,
              });
              if (res.outcome === DUEL_OUTCOME.HOSTILE_DRAW) {
                setSiteHostile(s, true);
              } else if (res.outcome === DUEL_OUTCOME.DIPLOMACY_PEACE) {
                const comp = recruitAdventurerCompanion(adv, nowMin);
                companionId = comp.id;
                deps.onCompanionChanged?.(comp);
                for (const f of s.foes) {
                  if (f?.livingRole === 'rival_adventurer') {
                    if (f.entity) {
                      f.entity.team = 'PlayerAlly';
                      f.entity.mobileTeam = 'PlayerAlly';
                    }
                    if (f.ai) f.ai.isHostile = false;
                    companionFoe = f;
                  }
                }
              }
              deps.say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, 0), 5);
            },
          },
          {
            code: 'Digit3',
            label: `3. ${LIVING_WORDS.adventurerOptionIntimidate()}`,
            action: () => {
              const res = resolveAdventurerEncounter({
                adv,
                playerEntity: player,
                action: 'INTIMIDATE',
                wagerGold: wager,
                rng,
              });
              if (res.outcome === DUEL_OUTCOME.HOSTILE_DRAW) setSiteHostile(s, true);
              deps.say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, 0), 5);
            },
          },
          {
            code: 'Digit4',
            label: `4. ${LIVING_WORDS.adventurerOptionDecline()}`,
            action: () => {
              deps.say(LIVING_WORDS.adventurerOutcome(DUEL_OUTCOME.DECLINED, adv.name, 0), 4);
            },
          },
        ],
      });
    } else if (s.kind === LIVING_SITE_KINDS.TRAVELER_REST) {
      const merchantActor = s.foes.find((f) => f?.livingRole === 'traveler');
      const lines = [
        '=== TRAVELER\'S REST ===',
        'You come upon a traveling merchant and their armed outrider resting beside a warm campfire along the road.',
        '"Welcome to our camp, traveler. Rest your feet, or inspect the goods I have brought from across the province."',
      ];
      const options = [
        {
          code: 'Digit1',
          label: '1. [Buy] Inspect traveling merchant wares',
          action: () => {
            deps.say?.('The merchant opens their traveling trunk for barter.', 4);
            if (merchantActor && deps.openLivingActor) {
              deps.openLivingActor(merchantActor, 'Buy');
            }
          },
        },
        {
          code: 'Digit2',
          label: '2. [Sell] Sell spoils and equipment to merchant',
          action: () => {
            deps.say?.('The merchant weighs your goods and prepares coin.', 4);
            if (merchantActor && deps.openLivingActor) {
              deps.openLivingActor(merchantActor, 'Sell');
            }
          },
        },
        {
          code: 'Digit3',
          label: '3. [Rest] Rest by the campfire to recover fatigue and health',
          action: () => {
            if (player) {
              player.health = Math.min(Number(player.maxHealth ?? player.health), Number(player.health) + 35);
              player.fatigue = Math.min(Number(player.maxFatigue ?? player.fatigue), Number(player.fatigue) + 100);
            }
            deps.say?.('You warm your hands by the fire and share a cup of tea with the travelers, feeling refreshed.', 6);
          },
        },
        {
          code: 'Digit4',
          label: '4. [Depart] Nod politely and continue on your way',
          action: () => {
            deps.say?.('"Safe travels under the stars, friend."', 4);
          },
        },
        {
          code: 'Digit5',
          label: '5. [Rob] Threaten the caravan and demand their gold!',
          action: () => {
            setSiteHostile(s, true);
            deps.say?.('"Guards, to arms! A brigand attacks our camp!"', 5);
          },
        },
      ];
      deps.openChoice({ lines, options });
    } else if (
      s.kind === LIVING_SITE_KINDS.QUARANTINE_TENT ||
      s.kind === LIVING_SITE_KINDS.PLEA_ENCOUNTER
    ) {
      const plea = s.blueprint.meta?.plea ?? {
        type: 'PLAGUE_CURE',
        requiredGold: 35,
        messageKey: 'living.plea.plague',
      };
      const reqGold = plea.requiredGold ?? 25;
      const reliefInfo =
        s.kind === LIVING_SITE_KINDS.QUARANTINE_TENT
          ? s.blueprint.meta?.reliefInfo ?? getQuarantineReliefPostInfo(regIdx)
          : null;
      const contractOffer = !getActiveCrisisContract(regIdx)
        ? offerRegionalCrisisContract(regIdx, Number(player?.level ?? 1))
        : null;
      const pleaOptions = [
        {
          code: 'Digit1',
          label: `1. ${LIVING_WORDS.pleaOptionHelp(reqGold)}`,
          action: () => {
            const haveGold = Number(player?.goldPieces ?? 0);
            const res = resolvePleaResponse({
              plea,
              playerEntity: player,
              regionIndex: regIdx,
              response: 'HELP',
              goldOffered: haveGold,
              nowMinutes: nowMin,
              rng,
            });
            if (res.outcome === PLEA_OUTCOME.HELPED && player) {
              player.goldPieces = Math.max(0, haveGold - res.goldSpent);
              deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
            }
            deps.say(LIVING_WORDS.pleaOutcome(res.outcome), 5);
          },
        },
        {
          code: 'Digit2',
          label: `2. ${LIVING_WORDS.pleaOptionPolite()}`,
          action: () => {
            const res = resolvePleaResponse({
              plea,
              playerEntity: player,
              regionIndex: regIdx,
              response: 'REFUSE_POLITE',
              nowMinutes: nowMin,
              rng,
            });
            deps.say(LIVING_WORDS.pleaOutcome(res.outcome), 5);
          },
        },
        {
          code: 'Digit3',
          label: `3. ${LIVING_WORDS.pleaOptionRude()}`,
          action: () => {
            const res = resolvePleaResponse({
              plea,
              playerEntity: player,
              regionIndex: regIdx,
              response: 'REFUSE_RUDE',
              nowMinutes: nowMin,
              rng,
            });
            if (res.spawnMugger) {
              Promise.resolve(
                deps.spawn(MOBILE_TYPES.Rogue, [...s.blueprint.center], {
                  yaw: 0,
                  level: Math.max(1, Number(player?.level ?? 1)),
                  allied: false,
                  loose: true,
                  transient: true,
                  managed: true,
                }),
              )
                .then((rec) => {
                  if (!rec) return;
                  if (rec.entity) rec.entity.name = 'Desperate Cutpurse';
                  if (rec.ai) rec.ai.isHostile = true;
                  s.foes.push(rec);
                })
                .catch(() => {});
            }
            deps.say(LIVING_WORDS.pleaOutcome(res.outcome), 5);
          },
        },
      ];
      if (reliefInfo) {
        const nextIdx = pleaOptions.length + 1;
        const cureGold = Number(reliefInfo.cureCostGold ?? 100);
        pleaOptions.push({
          code: `Digit${nextIdx}`,
          label: `${nextIdx}. ${LIVING_WORDS.quarantineReliefTent()} (${cureGold}g)`,
          action: () => {
            const haveGold = Number(player?.goldPieces ?? 0);
            if (haveGold >= cureGold && player) {
              player.goldPieces = haveGold - cureGold;
              player.isDiseased = false;
              player.isPoisoned = false;
              if (Array.isArray(player.activeEffects)) {
                player.activeEffects = player.activeEffects.filter(
                  (e) => e?.kind !== 'disease' && e?.kind !== 'poison',
                );
              }
              if (Number.isFinite(player.maxHealth)) {
                player.health = player.maxHealth;
                player.currentHealth = player.maxHealth;
              }
              deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
              deps.say(LIVING_WORDS.pleaOutcome(PLEA_OUTCOME.HELPED), 5);
            } else {
              deps.say(LIVING_WORDS.checkpointRefused(), 4);
            }
          },
        });
      }
      if (contractOffer) {
        const nextIdx = pleaOptions.length + 1;
        pleaOptions.push({
          code: `Digit${nextIdx}`,
          label: `${nextIdx}. ${LIVING_WORDS.crisisContractOptionAccept(contractOffer.title, contractOffer.rewardGold)}`,
          action: () => {
            const accepted = acceptRegionalCrisisContract(regIdx, Number(player?.level ?? 1), nowMin);
            if (accepted) {
              deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
              deps.say(LIVING_WORDS.crisisContractAccepted(accepted.title), 6);
            }
          },
        });
      }
      let speakerTitle = 'Traveller';
      if (s.kind === LIVING_SITE_KINDS.QUARANTINE_TENT) {
        speakerTitle = 'Plague Relief Healer';
      } else if (plea.type === 'PLAGUE_CURE') {
        speakerTitle = 'Afflicted Villager';
      } else if (plea.type === 'FAMINE_BREAD') {
        speakerTitle = 'Starving Refugee';
      } else if (plea.type === 'WAR_REFUGEE') {
        speakerTitle = 'Displaced Citizen';
      } else if (plea.type === 'ESCORT') {
        speakerTitle = 'Stranded Traveller';
      }
      const promptLines = [`${speakerTitle}: "${LIVING_WORDS.pleaPrompt(plea.type, reqGold)}"`];
      if (reliefInfo) {
        promptLines.unshift(LIVING_WORDS.quarantineReliefTent());
      }
      deps.openChoice({
        lines: promptLines,
        options: pleaOptions,
      });
    } else if (s.kind === LIVING_SITE_KINDS.WANDERING_ADVENTURER) {
      const adv = s.blueprint.meta?.adv;
      const situation = s.blueprint.meta?.situation ?? ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD;
      if (!adv) return;
      const wager = Math.max(25, (adv.level || 3) * 15);
      const introLine =
        situation === ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP
          ? LIVING_WORDS.roadAdvCamp(adv.name)
          : situation === ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS
            ? LIVING_WORDS.roadAdvSkirmish(adv.name)
            : situation === ROAD_ADVENTURER_SITUATION.RETURNING_WITH_SPOILS
              ? LIVING_WORDS.roadAdvSpoils(adv.name)
              : LIVING_WORDS.roadAdvTraveling(adv.name);

      deps.openChoice({
        lines: [
          introLine,
          `${adv.name} (${adv.className}, Lv.${adv.level})`,
        ],
        options: [
          {
            code: 'Digit1',
            label: `1. ${LIVING_WORDS.roadAdvOptionIntel()}`,
            action: () => {
              resolveWanderingAdventurerInteraction({
                adv,
                situation,
                playerEntity: player,
                action: 'SHARE_INTEL',
                regionIndex: regIdx,
                rng,
              });
              deps.say(LIVING_WORDS.roadAdvIntelShared(), 6);
            },
          },
          {
            code: 'Digit2',
            label: `2. ${LIVING_WORDS.roadAdvOptionRecruit(wager)}`,
            action: () => {
              const res = resolveWanderingAdventurerInteraction({
                adv,
                situation,
                playerEntity: player,
                action: 'RECRUIT_ALLY',
                regionIndex: regIdx,
                rng,
              });
              if (res.allied) {
                const comp = recruitAdventurerCompanion(adv, nowMin);
                companionId = comp.id;
                deps.onCompanionChanged?.(comp);
                deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
                for (const f of s.foes) {
                  if (f?.livingRole === 'wandering_adventurer') {
                    if (f.entity) {
                      f.entity.name = comp.displayName || comp.name;
                      f.entity.team = 'PlayerAlly';
                      f.entity.mobileTeam = 'PlayerAlly';
                    }
                    if (f.ai) {
                      f.ai.isHostile = false;
                      f.ai.target = null;
                      f.ai.secondaryTarget = null;
                      f.ai.follow = { feet: () => deps.feet?.() ?? [f.ai.feet[0], f.ai.feet[1], f.ai.feet[2]], stop: 2.5 };
                      f.ai.moving = true;
                      f.ai.canAct = true;
                      if (typeof f.ai.resumeLive === 'function') f.ai.resumeLive();
                    }
                    f.companion = `adv:${comp.name}`;
                    f.shipmate = true;
                    f.livingRole = 'recruited_companion';
                    companionFoe = f;
                  }
                }
                deps.say(LIVING_WORDS.roadAdvRecruited(adv.name), 5);
              } else if (res.goldShortage) {
                deps.say(LIVING_WORDS.roadAdvNoGold(res.hireCost || wager), 5);
              } else {
                deps.say(LIVING_WORDS.roadAdvDeclined(), 5);
              }
            },
          },
          {
            code: 'Digit3',
            label: `3. ${LIVING_WORDS.roadAdvOptionSpar(wager)}`,
            action: () => {
              deps.playSound?.(LIVING_SOUNDS.SWORD_CLINK);
              const res = resolveWanderingAdventurerInteraction({
                adv,
                situation,
                playerEntity: player,
                action: 'WAGER_SPAR',
                regionIndex: regIdx,
                rng,
              });
              if (res.outcome === WANDERING_OUTCOME.SPAR_WON) {
                deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
                recordAdventurerGrudge(adv.name);
              }
              deps.say(
                LIVING_WORDS.adventurerOutcome(
                  res.outcome === WANDERING_OUTCOME.SPAR_WON ? DUEL_OUTCOME.PLAYER_WON : DUEL_OUTCOME.PLAYER_LOST,
                  adv.name,
                  Math.abs(res.goldDelta),
                ),
                5,
              );
            },
          },
          {
            code: 'Digit4',
            label: `4. ${LIVING_WORDS.roadAdvOptionExtort()}`,
            action: () => {
              const res = resolveWanderingAdventurerInteraction({
                adv,
                situation,
                playerEntity: player,
                action: 'EXTORT_SPOILS',
                regionIndex: regIdx,
                rng,
              });
              if (res.outcome === WANDERING_OUTCOME.EXTORTED_SPOILS) {
                deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
                recordAdventurerGrudge(adv.name);
                deps.say(
                  res.messageKey === 'living.roadAdv.extortPartial'
                    ? LIVING_WORDS.roadAdvExtortPartial(adv.name)
                    : LIVING_WORDS.roadAdvExtorted(adv.name),
                  5,
                );
              } else if (res.hostile) {
                for (const f of s.foes) {
                  if (f?.livingRole === 'wandering_adventurer' && f.ai) {
                    f.ai.isHostile = true;
                    f.ai.detected = true;
                  }
                }
                deps.say(LIVING_WORDS.adventurerDuelChallenge(), 5);
              }
            },
          },
          {
            code: 'Digit5',
            label: `5. ${LIVING_WORDS.adventurerOptionDecline()}`,
            action: () => {
              deps.say(LIVING_WORDS.roadAdvParted(), 4);
            },
          },
        ],
      });
    } else if (s.kind === LIVING_SITE_KINDS.BANDIT_CAMP && s.blueprint.meta?.ambushDetectedByStealth) {
      deps.openChoice({
        lines: [
          LIVING_WORDS.travelStealthSpotted(),
        ],
        options: [
          {
            code: 'Digit1',
            label: `1. ${LIVING_WORDS.travelStealthEvadeOption()}`,
            action: () => {
              setSiteHostile(s, false);
              deps.say(LIVING_WORDS.travelStealthEvaded(), 5);
            },
          },
          {
            code: 'Digit2',
            label: `2. ${LIVING_WORDS.travelStealthSurpriseOption()}`,
            action: () => {
              for (const f of s.foes) {
                if (f?.entity) {
                  if (Number.isFinite(f.entity.currentHealth)) {
                    f.entity.currentHealth = Math.max(1, Math.floor(f.entity.currentHealth * 0.75));
                  }
                  if (Number.isFinite(f.entity.health)) {
                    f.entity.health = Math.max(1, Math.floor(f.entity.health * 0.75));
                  }
                }
              }
              setSiteHostile(s, true);
              deps.say(LIVING_WORDS.travelAmbush(), 4);
            },
          },
        ],
      });
    } else if (s.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH) {
      deps.playSound?.(LIVING_SOUNDS.DRAW_WEAPON);
      const evt = s.blueprint.meta?.event;
      const f1Name = s.blueprint.meta?.faction1Name ?? 'Guard';
      const f2Name = s.blueprint.meta?.faction2Name ?? 'Rebel';

      if (evt && typeof evt.getChoices === 'function') {
        const rawChoices = evt.getChoices(f1Name, f2Name);
        const options = rawChoices.map((c, idx) => ({
          code: `Digit${idx + 1}`,
          label: c.text,
          action: () => {
            const checkRes = resolveCrisisChoiceCheck(player, c, {
              regionIndex: regIdx,
              rng,
            });

            if (checkRes.hasSkillCheck) {
              const score = checkRes.rollResult?.totalScore ?? 50;
              const dc = checkRes.rollResult?.targetScore ?? c.skillCheck?.target ?? 50;
              if (!checkRes.passed) {
                s.skirmishStance = 'chaos';
                if (checkRes.hostileToPlayer) {
                  for (const f of s.foes) {
                    if (f?.ai) {
                      f.ai.isHostile = true;
                      f.ai.detected = true;
                      f.ai.target = deps.playerEntity();
                    }
                  }
                  deps.say(LIVING_WORDS.rollCriticalFailure(score, dc), 5);
                } else {
                  for (const f of s.foes) {
                    f.allied = false;
                    if (f?.ai) f.ai.isHostile = false;
                  }
                  deps.say(LIVING_WORDS.rollFailure(score, dc), 5);
                }
                return;
              }

              if (checkRes.degree === LIVING_ROLL_DEGREE.TRIUMPH) {
                deps.say(LIVING_WORDS.rollTriumph(score, dc, checkRes.xpAwarded), 5);
              } else if (checkRes.degree === LIVING_ROLL_DEGREE.PARTIAL) {
                if (player && typeof player.fatigue === 'number') {
                  player.fatigue = Math.max(1, player.fatigue - checkRes.fatigueCost);
                }
                deps.say(LIVING_WORDS.rollPartial(score, dc, checkRes.xpAwarded), 5);
              } else {
                deps.say(LIVING_WORDS.rollSuccess(score, dc, checkRes.xpAwarded), 5);
              }
            }

            if (checkRes.goldCost > 0 && player) {
              player.goldPieces = Math.max(0, (player.goldPieces ?? 0) - checkRes.goldCost);
            }
            if (checkRes.goldReward > 0 && player) {
              player.goldPieces = (player.goldPieces ?? 0) + checkRes.goldReward;
            }

            if (player?.regionalReputations) {
              if (checkRes.repF1Delta) {
                player.regionalReputations[regIdx] =
                  (player.regionalReputations[regIdx] ?? 0) + checkRes.repF1Delta;
              }
            }

            if (c.stance === 'defenders' || c.stance === 'bodyguard') {
              s.skirmishStance = 'watch';
              for (const f of s.foes) {
                if (f?.livingRole === 'skirmish_guard') {
                  f.allied = true;
                  if (f.ai) f.ai.isHostile = false;
                } else if (f?.livingRole === 'skirmish_rebel') {
                  f.allied = false;
                  if (f.ai) { f.ai.isHostile = true; f.ai.detected = true; f.ai.target = deps.playerEntity(); }
                }
              }
              deps.say(`Вы встали на сторону [${f1Name}]! Защитите порядок!`, 5);
            } else if (c.stance === 'attackers') {
              s.skirmishStance = 'rebels';
              for (const f of s.foes) {
                if (f?.livingRole === 'skirmish_rebel') {
                  f.allied = true;
                  if (f.ai) f.ai.isHostile = false;
                } else if (f?.livingRole === 'skirmish_guard') {
                  f.allied = false;
                  if (f.ai) { f.ai.isHostile = true; f.ai.detected = true; f.ai.target = deps.playerEntity(); }
                }
              }
              deps.say(`Вы встали на сторону [${f2Name}]! Сокрушите стражу!`, 5);
            } else if (c.stance === 'peace' || c.stance === 'bribe' || c.stance === 'ransom' || c.stance === 'purify' || c.stance === 'cure' || c.stance === 'consecrate' || c.stance === 'tame' || c.stance === 'chess_move') {
              s.skirmishStance = 'peace';
              for (const f of s.foes) {
                f.allied = false;
                if (f?.ai) { f.ai.isHostile = false; f.ai.idle = true; }
              }
              if (c.goldReward) deps.say(`Получена награда: ${c.goldReward} золотых монет!`, 5);
            } else {
              s.skirmishStance = 'chaos';
              for (const f of s.foes) {
                f.allied = false;
                if (f?.ai) f.ai.isHostile = false;
              }
              deps.say('Вы решили не вмешиваться. Схватка идет своим чередом.', 5);
            }
          },
        }));

        deps.openChoice({
          lines: [
            `[СОБЫТИЕ: ${evt.name}]`,
            `Стороны конфликта: [${f1Name}] против [${f2Name}]. Сделайте выбор:`,
          ],
          options,
        });
      } else {
        deps.openChoice({
          lines: [
            LIVING_WORDS.urbanSkirmishPrompt(),
          ],
          options: [
            {
              code: 'Digit1',
              label: `1. ${LIVING_WORDS.urbanSkirmishOptionWatch()}`,
              action: () => {
                s.skirmishStance = 'watch';
                for (const f of s.foes) {
                  if (f?.livingRole === 'skirmish_guard') {
                    f.allied = true;
                    if (f.ai) f.ai.isHostile = false;
                  } else if (f?.livingRole === 'skirmish_rebel') {
                    f.allied = false;
                    if (f.ai) {
                      f.ai.isHostile = true;
                      f.ai.detected = true;
                      f.ai.target = deps.playerEntity();
                    }
                  }
                }
                if (player?.regionalReputations) {
                  player.regionalReputations[regIdx] = (player.regionalReputations[regIdx] ?? 0) + 5;
                }
                deps.say('You joined the City Watch! Defend the town against the rebels! (+5 Regional Rep)', 5);
              },
            },
            {
              code: 'Digit2',
              label: `2. ${LIVING_WORDS.urbanSkirmishOptionRebels()}`,
              action: () => {
                s.skirmishStance = 'rebels';
                for (const f of s.foes) {
                  if (f?.livingRole === 'skirmish_rebel') {
                    f.allied = true;
                    if (f.ai) f.ai.isHostile = false;
                  } else if (f?.livingRole === 'skirmish_guard') {
                    f.allied = false;
                    if (f.ai) {
                      f.ai.isHostile = true;
                      f.ai.detected = true;
                      f.ai.target = deps.playerEntity();
                    }
                  }
                }
                if (player?.regionalReputations) {
                  player.regionalReputations[regIdx] = (player.regionalReputations[regIdx] ?? 0) - 15;
                }
                if (player?.guildMemberships?.[9]) {
                  player.guildMemberships[9].reputation = (player.guildMemberships[9].reputation ?? 0) + 10;
                }
                deps.say('You joined the Insurgents! Overthrow the guards! (-15 Regional Rep, +10 Underworld)', 5);
              },
            },
            {
              code: 'Digit3',
              label: `3. ${LIVING_WORDS.urbanSkirmishOptionChaos()}`,
              action: () => {
                s.skirmishStance = 'chaos';
                for (const f of s.foes) {
                  f.allied = false;
                  if (f?.ai) {
                    f.ai.isHostile = false;
                  }
                }
                deps.say('You choose Chaos! Both sides remain neutral to you unless struck, and crossfire is not a crime.', 5);
              },
            },
          ],
        });
      }
    }
  }

  function standSite(blueprint) {
    releaseSite();
    for (const m of blueprint.meshes) ensureModel(m.modelId);
    for (const fl of blueprint.flats) ensureFlat(fl.archive, fl.record);

    const site = {
      kind: blueprint.kind,
      blueprint,
      foes: /** @type {any[]} */ ([]),
      batches: /** @type {any[]} */ ([]),
      navalSquadron: null,
      interacted: false,
    };
    stood = site;

    const siteCampId = `lt_${blueprint.kind}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    site.campId = siteCampId;

    if (blueprint.kind === LIVING_SITE_KINDS.NAVAL_SQUADRON && deps.spawnNavalSquadron) {
      site.navalSquadron = deps.spawnNavalSquadron(blueprint.meta?.squadron);
    }

    for (const a of blueprint.actors) {
      const actorCampId = a.factionSide ? `${siteCampId}_${a.factionSide}` : siteCampId;
      a.campId = actorCampId;

      const actorFeet = [...a.feet];
      if (deps.lodgedIn?.(actorFeet) || (deps.collider && lodgedIn(deps.collider, actorFeet))) {
        if (deps.freeLodgedFeet) {
          deps.freeLodgedFeet(actorFeet);
        } else if (deps.collider) {
          freeLodgedFeet(deps.collider, actorFeet);
        }
      }

      Promise.resolve(
        deps.spawn(a.mobileType, actorFeet, {
          yaw: a.yaw,
          level: a.level,
          allied: a.allied,
          team: a.team,
          feetGiven: true,
          loose: true,
          transient: true,
          managed: true,
        }),
      )
        .then((rec) => {
          if (!rec) return;
          if (stood !== site) {
            if (deps.inPool(rec)) deps.remove(rec);
            return;
          }
          rec.campId = a.campId;
          if (rec.entity) {
            rec.entity.name = a.name;
            rec.entity.campId = a.campId;
            if (a.team) {
              rec.entity.team = a.team;
              rec.entity.mobileTeam = a.team;
            }
            if (a.suppressInfighting || a.role === 'bandit_camp') {
              rec.entity.suppressInfighting = true;
            }
          }
          if (blueprint.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH || a.role?.startsWith('skirmish_')) {
            rec.lootDropped = true; // suppresses corpse loot generation to protect economy
            rec._suppressLoot = true;
            if (rec.entity?.items) {
              rec.entity.items = [];
            }
          }
          if (site.hostile || a.hostile) {
            if (rec.ai) {
              rec.ai.isHostile = true;
              rec.ai.detected = true;
              rec.ai.target = deps.playerEntity();
            }
          } else if (rec.ai && !a.allied) {
            rec.ai.isHostile = false;
          }
          rec.livingRole = a.role;
          site.foes.push(rec);
        })
        .catch(() => {});
    }

    return site;
  }

  function pickAndStandNextSite(feet, nowMin) {
    const regIdx = deps.regionIndex();
    const inTown = deps.inLocationRect();
    const onRoad = deps.onRoad();
    const player = deps.playerEntity();
    const regState = getRegionState(regIdx);

    const loc = deps.locationRecord?.() ?? null;
    const locKey = loc?.mapTableData?.mapId != null
      ? String(loc.mapTableData.mapId)
      : `${regIdx}:${Math.round(feet[0] / 100)}:${Math.round(feet[2] / 100)}`;
    const lastSkirmishTime = locationSkirmishCooldowns.get(locKey) ?? -999999;
    const canSkirmishHere = (nowMin - lastSkirmishTime) >= SKIRMISH_LOCATION_COOLDOWN_MINUTES;

    // 1. Inside a Settlement during a crisis or regional condition -> Urban Skirmish
    if (
      inTown &&
      canSkirmishHere &&
      shouldSpawnUrbanSkirmish({ regionIndex: regIdx, isInsideBuilding: false, existingActiveSkirmishes: 0, playerEntity: player })
    ) {
      const angle = rng() * Math.PI * 2;
      const safe = findSafeSiteCenter(deps, feet, 28, angle, 4.0);
      if (safe.suitable) {
        lastSkirmishRegion = regIdx;
        locationSkirmishCooldowns.set(locKey, nowMin);
        lastSpawnMinute = nowMin;
        const bp = buildLivingSiteBlueprint({
          kind: LIVING_SITE_KINDS.URBAN_SKIRMISH,
          centerX: safe.x,
          centerZ: safe.z,
          heightAt: deps.heightAt,
          regionIndex: regIdx,
          playerEntity: player,
          nowMinutes: nowMin,
          dfLocation: loc,
          locationType: loc?.mapTableData?.locationType ?? 0,
          rng,
        });
        if (bp.actors.length > 0) {
          standSite(bp);
          const alertText = bp.meta?.event?.name
            ? `[Living Tamriel] ${bp.meta.event.name}: ${bp.meta.faction1Name ?? 'Защитники'} против ${bp.meta.faction2Name ?? 'Нападающие'}!`
            : LIVING_WORDS.urbanSkirmishAlert();
          deps.say(alertText, 5);
          return;
        }
      }
    }

    if (inTown) {
      if (lastQuarantineRegion !== regIdx && isRegionInQuarantine(regIdx)) {
        lastQuarantineRegion = regIdx;
        lastSpawnMinute = nowMin;
        const qAngle = rng() * Math.PI * 2;
        const safe = findSafeSiteCenter(deps, feet, 16, qAngle, 4.0);
        standSite(
          buildLivingSiteBlueprint({
            kind: LIVING_SITE_KINDS.QUARANTINE_TENT,
            centerX: safe.x,
            centerZ: safe.z,
            heightAt: deps.heightAt,
            regionIndex: regIdx,
            playerEntity: player,
            nowMinutes: nowMin,
            rng,
          }),
        );
        deps.say(`${LIVING_WORDS.quarantineGateClosed()} ${LIVING_WORDS.quarantineReliefTent()}`, 6);
        return;
      }

      if (nowMin - lastSpawnMinute < 30) return;
      const rep = Number(player?.regionalReputations?.[regIdx] ?? 0);
      const nemMem = getNemesisMemory();
      const angle = rng() * Math.PI * 2;
      if (
        shouldDispatchNemesis(player, {
          legalReputation: rep,
          playerLevel: Number(player?.level ?? 1),
          isCrisis: regState?.crisis !== CRISIS_TYPE.PEACE,
          hasGrudge: Boolean(nemMem?.hasGrudge),
          playerGold: Number(player?.goldPieces ?? 0),
        }) &&
        rng() < 0.20
      ) {
        lastSpawnMinute = nowMin;
        const safe = findSafeSiteCenter(deps, feet, 11, angle, 3.0);
        const site = standSite(
          buildLivingSiteBlueprint({
            kind: LIVING_SITE_KINDS.NEMESIS_AMBUSH,
            centerX: safe.x,
            centerZ: safe.z,
            heightAt: deps.heightAt,
            regionIndex: regIdx,
            playerEntity: player,
            nowMinutes: nowMin,
            rng,
          }),
        );
        triggerSiteInteraction(site);
        return;
      }

      const pleaEval = evaluatePleaEncounter({
        regionIndex: regIdx,
        nowMinutes: nowMin,
        playerEntity: player,
        rng,
      });
      if (pleaEval.shouldPlea) {
        lastSpawnMinute = nowMin;
        const safe = findSafeSiteCenter(deps, feet, 10, angle, 3.0);
        standSite(
          buildLivingSiteBlueprint({
            kind: LIVING_SITE_KINDS.PLEA_ENCOUNTER,
            centerX: safe.x,
            centerZ: safe.z,
            heightAt: deps.heightAt,
            regionIndex: regIdx,
            playerEntity: player,
            nowMinutes: nowMin,
            rng,
          }),
        );
      }
      return;
    }

    // Cooldown between outdoor 3D site spawns (at least 30 game minutes)
    if (nowMin - lastSpawnMinute < 30) return;

    const angle = rng() * Math.PI * 2;
    const dist = 32 + rng() * 18; // 32..50m ahead/around player
    const safe = findSafeSiteCenter(deps, feet, dist, angle, 6.0);
    if (!safe.suitable) return;
    const cx = safe.x;
    const cz = safe.z;

    // 2. Quarantine Tent outside Plague regions
    if (
      regState?.crisis === CRISIS_TYPE.PLAGUE &&
      Number(LivingTamrielConfig.quarantine) > PRESENCE.OFF &&
      rng() < 0.35
    ) {
      lastSpawnMinute = nowMin;
      standSite(
        buildLivingSiteBlueprint({
          kind: LIVING_SITE_KINDS.QUARANTINE_TENT,
          centerX: cx,
          centerZ: cz,
          heightAt: deps.heightAt,
          regionIndex: regIdx,
          playerEntity: player,
          nowMinutes: nowMin,
          rng,
        }),
      );
      return;
    }

    // 3. Roadside Military Checkpoint during WAR or CIVIL_STRIFE
    if (shouldSpawnRoadCheckpoint({ regionIndex: regIdx, isHighway: onRoad || rng() < 0.4 }) && rng() < 0.45) {
      lastSpawnMinute = nowMin;
      standSite(
        buildLivingSiteBlueprint({
          kind: LIVING_SITE_KINDS.CHECKPOINT,
          centerX: cx,
          centerZ: cz,
          heightAt: deps.heightAt,
          regionIndex: regIdx,
          playerEntity: player,
          nowMinutes: nowMin,
          rng,
        }),
      );
      return;
    }

    // 4. Nemesis & Retinue Ambush
    const rep = Number(player?.regionalReputations?.[regIdx] ?? 0);
    const wildNemMem = getNemesisMemory();
    if (
      shouldDispatchNemesis(player, {
        legalReputation: rep,
        playerLevel: Number(player?.level ?? 1),
        isCrisis: regState?.crisis !== CRISIS_TYPE.PEACE,
        hasGrudge: Boolean(wildNemMem?.hasGrudge),
        playerGold: Number(player?.goldPieces ?? 0),
      }) &&
      rng() < 0.20
    ) {
      lastSpawnMinute = nowMin;
      const site = standSite(
        buildLivingSiteBlueprint({
          kind: LIVING_SITE_KINDS.NEMESIS_AMBUSH,
          centerX: feet[0] + Math.sin(angle) * 12,
          centerZ: feet[2] + Math.cos(angle) * 12,
          heightAt: deps.heightAt,
          regionIndex: regIdx,
          playerEntity: player,
          nowMinutes: nowMin,
          rng,
        }),
      );
      triggerSiteInteraction(site);
      return;
    }

    // 5. Non-seeking Wandering Road/Wilderness Adventurer
    const roadAdvSiteChance = getRoadAdventurerSiteChance(LivingTamrielConfig.roadAdventurers);
    if (roadAdvSiteChance > 0 && rng() < (onRoad ? roadAdvSiteChance * 1.35 : roadAdvSiteChance)) {
      lastSpawnMinute = nowMin;
      standSite(
        buildLivingSiteBlueprint({
          kind: LIVING_SITE_KINDS.WANDERING_ADVENTURER,
          centerX: cx,
          centerZ: cz,
          heightAt: deps.heightAt,
          regionIndex: regIdx,
          playerEntity: player,
          nowMinutes: nowMin,
          onRoad,
          rng,
        }),
      );
      return;
    }

    // 6. Rival Adventurer Camp Meeting
    if (Number(LivingTamrielConfig.adventurers) > PRESENCE.OFF && rng() < 0.22) {
      lastSpawnMinute = nowMin;
      standSite(
        buildLivingSiteBlueprint({
          kind: LIVING_SITE_KINDS.ADVENTURER_MEETING,
          centerX: cx,
          centerZ: cz,
          heightAt: deps.heightAt,
          regionIndex: regIdx,
          playerEntity: player,
          nowMinutes: nowMin,
          onRoad,
          rng,
        }),
      );
      return;
    }

    // 7. Roadside Bandit Camp or Peaceful Traveler Rest Camp
    if (Number(LivingTamrielConfig.camps) > PRESENCE.OFF && rng() < 0.35) {
      lastSpawnMinute = nowMin;
      const campKind = rng() < 0.5 ? LIVING_SITE_KINDS.BANDIT_CAMP : LIVING_SITE_KINDS.TRAVELER_REST;
      standSite(
        buildLivingSiteBlueprint({
          kind: campKind,
          centerX: cx,
          centerZ: cz,
          heightAt: deps.heightAt,
          regionIndex: regIdx,
          playerEntity: player,
          nowMinutes: nowMin,
          onRoad,
          rng,
        }),
      );
    }
  }

  return {
    /**
     * Per-frame update: checks distance to active site, triggers interactive ChoiceWindows
     * when player approaches within SITE_INTERACT_DISTANCE_M, or rolls a new site.
     * @param {number} dt
     */
    frame(dt) {
      if (dt <= 0) return;
      if ((checkTimer -= dt) > 0) return;
      checkTimer = 1.0;

      const feet = deps.feet();
      const isAfloat = Boolean(deps.afloat?.());
      if (!feet || (!deps.ready() && !isAfloat)) {
        releaseSite();
        return;
      }

      const nowMin = deps.clock();
      if (!isAfloat) {
        syncCompanion(feet, nowMin);
      }

      if (stood) {
        const c = stood.blueprint.center;
        const d = Math.hypot(feet[0] - c[0], feet[2] - c[2]);
        const shouldCull =
          stood.kind === LIVING_SITE_KINDS.NAVAL_SQUADRON
            ? shouldCullSquadron(d)
            : d > SITE_KEEP_DISTANCE_M;
        if (shouldCull) {
          releaseSite();
          return;
        }
        if (stood.kind === LIVING_SITE_KINDS.NAVAL_SQUADRON && stood.blueprint.meta) {
          const curProj = Number(stood.blueprint.meta.activeProjectiles || 0);
          if (canFireProjectile(curProj)) {
            stood.blueprint.meta.activeProjectiles = curProj + 1;
          }
        }
        if (
          stood.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH &&
          !stood.orderRestored &&
          stood.foes.length > 0
        ) {
          const rebels = stood.foes.filter((f) => f?.livingRole === 'skirmish_rebel');
          if (rebels.length > 0 && rebels.every((r) => r.dead || !deps.inPool(r))) {
            stood.orderRestored = true;
            const regIdx = deps.regionIndex();
            const contractRes = completeRegionalCrisisContract(regIdx, deps.playerEntity());
            if (contractRes) {
              deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
              deps.say(contractRes.message, 6);
            } else {
              onContractCompleted(regIdx);
              deps.say(LIVING_WORDS.urbanOrderRestored(), 5);
            }
          }
        }
        if (
          stood.kind === LIVING_SITE_KINDS.BANDIT_CAMP &&
          !stood.campCleared &&
          stood.foes.length > 0
        ) {
          const bandits = stood.foes.filter(
            (f) => f?.livingRole === 'bandit_camp' || f?.livingRole === 'camp_bandit',
          );
          if (bandits.length > 0 && bandits.every((b) => b.dead || !deps.inPool(b))) {
            stood.campCleared = true;
            const regIdx = deps.regionIndex();
            const contractRes = completeRegionalCrisisContract(regIdx, deps.playerEntity());
            if (contractRes) {
              deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
              deps.say(contractRes.message, 6);
            } else {
              onContractCompleted(regIdx);
            }
          }
        }
        if (
          stood.kind === LIVING_SITE_KINDS.NEMESIS_AMBUSH &&
          !stood.nemesisDefeated &&
          stood.foes.length > 0
        ) {
          const leaders = stood.foes.filter((f) => f?.livingRole === 'nemesis_leader');
          if (leaders.length > 0 && leaders.every((l) => l.dead || !deps.inPool(l))) {
            stood.nemesisDefeated = true;
            const nemesis = stood.blueprint.meta?.nemesis;
            const bounty = Number(nemesis?.contractBounty ?? 250);
            const player = deps.playerEntity();
            if (player) {
              player.goldPieces = Number(player.goldPieces ?? 0) + bounty;
            }
            clearNemesisGrudge();
            deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
            deps.say(
              LIVING_WORDS.adventurerOutcome(
                DUEL_OUTCOME.PLAYER_WON,
                nemesis?.name ?? 'Nemesis',
                bounty,
              ),
              6,
            );
          }
        }
        if (
          !stood.interacted &&
          d <= SITE_INTERACT_DISTANCE_M &&
          (stood.kind === LIVING_SITE_KINDS.CHECKPOINT ||
            stood.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH ||
            stood.kind === LIVING_SITE_KINDS.NEMESIS_AMBUSH ||
            stood.kind === LIVING_SITE_KINDS.ADVENTURER_MEETING ||
            stood.kind === LIVING_SITE_KINDS.WANDERING_ADVENTURER ||
            stood.kind === LIVING_SITE_KINDS.TRAVELER_REST ||
            stood.kind === LIVING_SITE_KINDS.QUARANTINE_TENT ||
            stood.kind === LIVING_SITE_KINDS.PLEA_ENCOUNTER ||
            (stood.kind === LIVING_SITE_KINDS.BANDIT_CAMP && stood.blueprint.meta?.ambushDetectedByStealth))
        ) {
          triggerSiteInteraction(stood);
        }
        return;
      }

      // Naval squadron encounters while afloat at sea (never within settlement/location borders)
      if (isAfloat && !deps.inLocationRect()) {
        if (Number(LivingTamrielConfig.naval) > PRESENCE.OFF) {
          if (nowMin - lastSpawnMinute >= 45) {
            const regIdx = deps.regionIndex();
            const player = deps.playerEntity();
            const bp = buildLivingSiteBlueprint({
              kind: LIVING_SITE_KINDS.NAVAL_SQUADRON,
              centerX: feet[0],
              centerZ: feet[2],
              heightAt: deps.heightAt,
              regionIndex: regIdx,
              playerEntity: player,
              nowMinutes: nowMin,
              rng,
            });
            const squad = bp.meta?.squadron;
            if (squad && shouldPromptSideChoice(35)) {
              lastSpawnMinute = nowMin;
              const site = standSite(bp);
              deps.playSound?.(LIVING_SOUNDS.SWORD_CLINK);
              if (deps.openChoice) {
                deps.openChoice({
                  lines: [
                    LIVING_WORDS.navalBattleNotice(),
                  ],
                  options: [
                    {
                      code: 'Digit1',
                      label: `1. ${LIVING_WORDS.navalChoiceLaw()}`,
                      action: () => {
                        resolveSideChoice(squad, NAVAL_CHOICE.LAW);
                        for (const f of site.foes) {
                          if (f?.livingRole === 'naval_law') {
                            if (f.entity) {
                              f.entity.team = 'PlayerAlly';
                              f.entity.mobileTeam = 'PlayerAlly';
                            }
                            if (f.ai) f.ai.isHostile = false;
                          } else if (f?.livingRole === 'naval_pirate' && f.ai) {
                            f.ai.isHostile = true;
                            f.ai.detected = true;
                          }
                        }
                        if (site.navalSquadron?.pirateShips) {
                          const pId = deps.myId?.() ?? 'player';
                          for (const p of site.navalSquadron.pirateShips) {
                            if (p?.ship) { p.ship.target = pId; p.ship.mode = 'engage'; }
                          }
                        }
                        if (player) {
                          player.regionalReputations = player.regionalReputations || {};
                          player.regionalReputations[regIdx] =
                            Number(player.regionalReputations[regIdx] ?? 0) + 5;
                        }
                        onContractCompleted(regIdx);
                        deps.say(LIVING_WORDS.navalChoiceLaw(), 5);
                      },
                    },
                    {
                      code: 'Digit2',
                      label: `2. ${LIVING_WORDS.navalChoicePirates()}`,
                      action: () => {
                        const res = resolveSideChoice(squad, NAVAL_CHOICE.PIRATES);
                        for (const f of site.foes) {
                          if (f?.livingRole === 'naval_pirate') {
                            if (f.entity) {
                              f.entity.team = 'PlayerAlly';
                              f.entity.mobileTeam = 'PlayerAlly';
                            }
                            if (f.ai) f.ai.isHostile = false;
                          } else if (f?.livingRole === 'naval_law' && f.ai) {
                            f.ai.isHostile = true;
                            f.ai.detected = true;
                          }
                        }
                        if (site.navalSquadron?.lawShips) {
                          const pId = deps.myId?.() ?? 'player';
                          for (const l of site.navalSquadron.lawShips) {
                            if (l?.ship) { l.ship.target = pId; l.ship.mode = 'engage'; }
                          }
                        }
                        if (player) {
                          player.regionalReputations = player.regionalReputations || {};
                          player.regionalReputations[regIdx] =
                            Number(player.regionalReputations[regIdx] ?? 0) - (res.underworldRep || 5);
                        }
                        deps.say(LIVING_WORDS.navalChoicePirates(), 5);
                      },
                    },
                    {
                      code: 'Digit3',
                      label: `3. ${LIVING_WORDS.navalChoiceNeutral()}`,
                      action: () => {
                        const res = resolveSideChoice(squad, NAVAL_CHOICE.NEUTRAL);
                        if (res.scavenge && player) {
                          const salvageGold = 50 + Math.max(1, Number(player.level ?? 1)) * 15;
                          player.goldPieces = Number(player.goldPieces ?? 0) + salvageGold;
                          deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
                          deps.say(LIVING_WORDS.navalScavenged(salvageGold), 5);
                        } else {
                          deps.say(LIVING_WORDS.navalChoiceNeutral(), 4);
                        }
                      },
                    },
                  ],
                });
              }
            }
          }
        }
        return;
      }

      pickAndStandNextSite(feet, nowMin);
    },

    /**
     * Checks whether hitting `foe` during an active urban skirmish is a criminal offense
     * (true if attacking City Watch; false if attacking Rebel Insurgents).
     * @param {any} foe
     */
    isCriminalTarget(foe) {
      if (!foe) return false;
      if (stood?.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH) {
        if (stood.skirmishStance === 'chaos' || stood.skirmishStance === 'rebels') {
          return false;
        }
      }
      const team = foe.entity?.team ?? (foe.livingRole === 'skirmish_guard' ? SKIRMISH_TEAMS.CITY_WATCH : null);
      if (!team) return false;
      return isSkirmishBlowCriminal('PLAYER', team, true);
    },

    /**
     * Draws 3D GPU meshes (tents, pavilions, wagons, crates, military banners) for the active site.
     * @param {any} renderer
     * @param {any} [texRemap=null]
     * @param {any} [cull=null]
     */
    draw(renderer, texRemap = null, cull = null) {
      if (!stood || !renderer?.drawMesh) return 0;
      let drawn = 0;
      for (const m of stood.blueprint.meshes) {
        const entry = gpuModels.get(m.modelId);
        if (!entry?.gpu) continue;
        const mat = trs(m.feet[0], m.feet[1], m.feet[2], 0, m.yawDeg, 0);
        if (drawSeen(renderer, cull, cull ? sphereAabb(entry.gpu.bounds, mat) : null, entry.gpu, mat, texRemap)) {
          drawn++;
        }
      }
      return drawn;
    },

    /**
     * Returns billboard batches (campfires, braziers, horses, weapon racks, sacks) for the exterior pass.
     */
    batches() {
      if (!stood || !deps.renderer?.createBillboardBatch) return [];
      if (!stood.batches.length && stood.blueprint.flats.length) {
        for (const fl of stood.blueprint.flats) {
          const sz = flatSizes.get(`${fl.archive}:${fl.record}`);
          if (!sz) continue;
          const b = deps.renderer.createBillboardBatch(fl.archive, fl.record, sz, [fl.feet]);
          if (b) {
            if (fl.archive === 210 && fl.record === 1) b.frame = 0;
            stood.batches.push(b);
          }
        }
      }
      return stood.batches;
    },

    /**
     * Returns dynamic point lights `[x, y, z, radius]` for campfires and braziers at the active site.
     */
    lights() {
      if (!stood) return [];
      /** @type {number[][]} */
      const out = [];
      for (const fl of stood.blueprint.flats) {
        if (fl.lightRadius > 0) {
          out.push([fl.feet[0], fl.feet[1] + 1.0, fl.feet[2], fl.lightRadius]);
        }
      }
      return out;
    },

    /**
     * Shifts all world coordinates when the floating origin recenters across a map pixel.
     * @param {number[]} offset
     */
    offsetAll(offset) {
      if (!stood || !offset) return;
      const move = (/** @type {number[]} */ p) => {
        p[0] += offset[0];
        p[1] += offset[1];
        p[2] += offset[2];
      };
      move(stood.blueprint.center);
      for (const m of stood.blueprint.meshes) move(m.feet);
      for (const fl of stood.blueprint.flats) move(fl.feet);
      if (stood.batches.length && deps.renderer?.destroyBillboardBatch) {
        for (const b of stood.batches) {
          try {
            deps.renderer.destroyBillboardBatch(b);
          } catch (_e) {}
        }
        stood.batches = [];
      }
    },

    /**
     * Explicitly stands a site blueprint (used by tests, console commands, or travel interrupts).
     * @param {any} blueprint
     */
    standBlueprint(blueprint) {
      return standSite(blueprint);
    },

    /** Returns a summary of the currently stood site for inspection/testing. */
    shown() {
      if (!stood) return null;
      return {
        kind: stood.kind,
        center: [...stood.blueprint.center],
        meshCount: stood.blueprint.meshes.length,
        flatCount: stood.blueprint.flats.length,
        actorCount: stood.foes.length,
        interacted: stood.interacted,
      };
    },

    /** Clears any active site and releases all spawned actors and batches. */
    clear() {
      releaseSite();
      checkTimer = 0;
    },
  };
}

/**
 * Builds an interactive ChoiceWindow specification for a rival adventurer encountered
 * inside a dungeon (either reclaiming an intercepted non-main quest objective or
 * parleying/duelling/allying with a delving rival).
 *
 * @param {{
 *   adv: any,
 *   intercepted?: any|null,
 *   locationId: string|number,
 *   regionIndex?: number|null,
 *   playerEntity: any,
 *   foeRecord?: any,
 *   say?: (msg: string) => void,
 *   rng?: () => number,
 * }} params
 */
export function buildDungeonAdventurerChoiceSpec({
  adv,
  intercepted = null,
  locationId,
  regionIndex = null,
  playerEntity,
  foeRecord = null,
  say = () => {},
  rng = Math.random,
}) {
  if (intercepted) {
    const buyoutGold = Math.max(100, (adv.level || 5) * 35);
    return {
      lines: [
        LIVING_WORDS.adventurerQuestIntercepted(),
        `${adv.name} (${adv.className}, Lv.${adv.level}): "${LIVING_WORDS.adventurerGreeting(adv.trait, buyoutGold)}"`,
      ],
      options: [
        {
          code: 'Digit1',
          label: `1. ${LIVING_WORDS.adventurerDuelChallenge()}`,
          action: () => {
            confrontInterceptingAdventurer({
              locationId,
              regionIndex,
              playerEntity,
              method: 'DUEL',
              rng,
            });
            if (foeRecord?.ai) {
              foeRecord.ai.isHostile = true;
              foeRecord.ai.detected = true;
            }
            if (foeRecord?.entity) {
              foeRecord.entity.items = foeRecord.entity.items || [];
              foeRecord.entity.items.push({
                group: 'QuestItems',
                templateIndex: 0,
                shortName: `${adv.name}'s Claimed Quest Trophy`,
                value: buyoutGold,
                weight: 0.25,
              });
            }
            say(LIVING_WORDS.adventurerDuelChallenge());
          },
        },
        {
          code: 'Digit2',
          label: `2. ${LIVING_WORDS.nemesisOptionStreetwise()} (${buyoutGold}g)`,
          action: () => {
            const haveGold = Number(playerEntity?.goldPieces ?? 0);
            const res = confrontInterceptingAdventurer({
              locationId,
              regionIndex,
              playerEntity,
              method: 'BUYOUT',
              goldOffered: haveGold,
              rng,
            });
            if (res?.outcome === RECLAIM_OUTCOME.BOUGHT_BACK && playerEntity) {
              playerEntity.goldPieces = Math.max(0, haveGold - (res.goldCost ?? buyoutGold));
              playerEntity.items = playerEntity.items || [];
              playerEntity.items.push({
                group: 'QuestItems',
                templateIndex: 0,
                shortName: `Reclaimed Quest Trophy`,
                value: buyoutGold,
                weight: 0.25,
              });
              if (foeRecord?.ai) foeRecord.ai.isHostile = false;
              say(LIVING_WORDS.adventurerReclaimSuccess());
            } else {
              say(LIVING_WORDS.adventurerReclaimFailed());
            }
          },
        },
        {
          code: 'Digit3',
          label: `3. ${LIVING_WORDS.adventurerOptionEtiquette()}`,
          action: () => {
            const res = confrontInterceptingAdventurer({
              locationId,
              regionIndex,
              playerEntity,
              method: 'APPEAL',
              rng,
            });
            if (res?.recovered && playerEntity) {
              playerEntity.items = playerEntity.items || [];
              playerEntity.items.push({
                group: 'QuestItems',
                templateIndex: 0,
                shortName: `Reclaimed Quest Trophy`,
                value: buyoutGold,
                weight: 0.25,
              });
              if (foeRecord?.ai) foeRecord.ai.isHostile = false;
              say(LIVING_WORDS.adventurerReclaimSuccess());
            } else {
              if (foeRecord?.ai) {
                foeRecord.ai.isHostile = true;
                foeRecord.ai.detected = true;
              }
              say(LIVING_WORDS.adventurerReclaimFailed());
            }
          },
        },
        {
          code: 'Digit4',
          label: `4. ${LIVING_WORDS.adventurerOptionDecline()}`,
          action: () => {
            confrontInterceptingAdventurer({
              locationId,
              regionIndex,
              playerEntity,
              method: 'FORFEIT',
              rng,
            });
            say(LIVING_WORDS.adventurerReclaimFailed());
          },
        },
      ],
    };
  }

  const tension = evaluateAdventurerTension(adv, playerEntity);
  const wager = tension.wagerGold ?? 50;
  return {
    lines: [
      `${adv.name} (${adv.className}, Lv.${adv.level}): "${LIVING_WORDS.adventurerGreeting(adv.trait, wager)}"`,
    ],
    options: [
      {
        code: 'Digit1',
        label: `1. ${LIVING_WORDS.adventurerOptionDuel(wager)}`,
        action: () => {
          const res = resolveAdventurerEncounter({
            adv,
            playerEntity,
            action: 'ACCEPT_DARE',
            wagerGold: wager,
            rng,
          });
          if (playerEntity && res.goldDelta) {
            playerEntity.goldPieces = Math.max(0, Number(playerEntity.goldPieces ?? 0) + res.goldDelta);
          }
          say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, Math.abs(res.goldDelta)));
        },
      },
      {
        code: 'Digit2',
        label: `2. ${LIVING_WORDS.adventurerOptionEtiquette()}`,
        action: () => {
          const res = resolveAdventurerEncounter({
            adv,
            playerEntity,
            action: 'APPEAL_ETIQUETTE',
            wagerGold: wager,
            rng,
          });
          if (res.outcome === DUEL_OUTCOME.DIPLOMACY_PEACE) {
            recruitAdventurerCompanion(adv);
            if (foeRecord?.entity) {
              foeRecord.entity.team = 'PlayerAlly';
              foeRecord.entity.mobileTeam = 'PlayerAlly';
            }
            if (foeRecord?.ai) {
              foeRecord.ai.isHostile = false;
            }
          } else if (res.outcome === DUEL_OUTCOME.HOSTILE_DRAW && foeRecord?.ai) {
            foeRecord.ai.isHostile = true;
            foeRecord.ai.detected = true;
          }
          say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, 0));
        },
      },
      {
        code: 'Digit3',
        label: `3. ${LIVING_WORDS.adventurerOptionIntimidate()}`,
        action: () => {
          const res = resolveAdventurerEncounter({
            adv,
            playerEntity,
            action: 'INTIMIDATE',
            wagerGold: wager,
            rng,
          });
          if (res.outcome === DUEL_OUTCOME.HOSTILE_DRAW && foeRecord?.ai) {
            foeRecord.ai.isHostile = true;
            foeRecord.ai.detected = true;
          }
          say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, 0));
        },
      },
      {
        code: 'Digit4',
        label: `4. ${LIVING_WORDS.adventurerOptionDecline()}`,
        action: () => {
          say(LIVING_WORDS.adventurerOutcome(DUEL_OUTCOME.DECLINED, adv.name, 0));
        },
      },
    ],
  };
}

/**
 * Executes the `/living` developer & tester console command.
 *
 * Supported subcommands:
 *   - `/living status`
 *   - `/living crisis <PEACE|WAR|PLAGUE|FAMINE|CIVIL_STRIFE> [START|MID|END]`
 *   - `/living spawn <checkpoint|bandit_camp|traveler_rest|quarantine_tent|urban_skirmish|nemesis_ambush|adventurer_meeting|wandering_adventurer|naval_squadron>`
 *   - `/living quest`
 *
 * @param {string[]} args
 * @param {{
 *   regionIndex: number,
 *   playerFeet?: number[] | null,
 *   heightAt?: (x: number, z: number) => number,
 *   playerEntity?: any,
 *   nowMinutes?: number,
 *   sceneHost?: any,
 * }} ctx
 * @returns {string}
 */
export function executeLivingConsoleCommand(args, ctx) {
  let cleanArgs = [...(args ?? [])];
  if (cleanArgs[0]?.toLowerCase() === 'site') {
    cleanArgs.shift();
    if (cleanArgs[0]?.toLowerCase() !== 'spawn' && cleanArgs.length > 0) {
      cleanArgs.unshift('spawn');
    }
  }
  const sub = String(cleanArgs[0] ?? 'status').toLowerCase();
  const regIdx = Number.isInteger(ctx?.regionIndex) ? ctx.regionIndex : 0;
  const regState = getRegionState(regIdx);

  if (sub === 'status') {
    const comp = getActiveAdventurerCompanion(ctx?.nowMinutes ?? 0);
    const contract = getActiveCrisisContract(regIdx);
    const activeCrises = getActiveCrises(regIdx);
    const crisisStr =
      activeCrises.length > 0
        ? activeCrises.map((c) => `${c.type} (${c.phase}, ${c.phaseDaysRemaining}d)`).join(', ')
        : 'PEACE';
    return (
      `[Living Tamriel] Region ${regIdx} (${regState.regionName}): crises=[${crisisStr}], ` +
      `tension=${regState.tension.toFixed(1)}, ` +
      `companion=${comp ? comp.displayName : 'none'}, contract=${contract ? contract.questType : 'none'}`
    );
  }

  if (sub === 'traits' || sub === 'mobtraits') {
    const isDungeon = cleanArgs[1]?.toLowerCase() === 'dungeon' || cleanArgs[1]?.toLowerCase() === 'dungeons';
    const val = isDungeon ? cleanArgs[2] : cleanArgs[1];
    if (val !== undefined && val.toLowerCase() !== 'dungeon' && val.toLowerCase() !== 'dungeons') {
      let targetTier = PRESENCE.MID;
      const s = String(val).toLowerCase();
      if (s === 'off' || s === '0') targetTier = PRESENCE.OFF;
      else if (s === 'light' || s === '1') targetTier = PRESENCE.LIGHT;
      else if (s === 'mid' || s === '2') targetTier = PRESENCE.MID;
      else if (s === 'high' || s === '3') targetTier = PRESENCE.HIGH;
      if (isDungeon) {
        LivingTamrielConfig.dungeonMobTraits = targetTier;
      } else {
        LivingTamrielConfig.mobTraits = targetTier;
      }
    }
    const currentWildTier = LivingTamrielConfig.mobTraits;
    const currentDungTier = LivingTamrielConfig.dungeonMobTraits;
    const tierNames = ['OFF', 'LIGHT', 'MID', 'HIGH'];
    const pLvl = Number(ctx?.playerEntity?.level ?? 1);
    const wildChance = mobTraitChance(currentWildTier, pLvl);
    const dungChance = mobTraitChance(currentDungTier, pLvl);
    return (
      `[Living Tamriel] Mob traits presence (Lvl ${pLvl}):\n` +
      `- Wilderness: ${tierNames[currentWildTier] ?? currentWildTier} (${currentWildTier}) -> ${(wildChance * 100).toFixed(1)}%\n` +
      `- Dungeons: ${tierNames[currentDungTier] ?? currentDungTier} (${currentDungTier}) -> ${(dungChance * 100).toFixed(1)}%`
    );
  }

  if (sub === 'crisis') {
    const rawType = String(cleanArgs[1] ?? 'WAR').toUpperCase();
    const rawPhase = String(cleanArgs[2] ?? 'MID').toUpperCase();
    const validType = Object.values(CRISIS_TYPE).includes(/** @type {any} */ (rawType))
      ? rawType
      : CRISIS_TYPE.WAR;
    const validPhase =
      validType === CRISIS_TYPE.PEACE
        ? CRISIS_PHASE.NONE
        : Object.values(CRISIS_PHASE).includes(/** @type {any} */ (rawPhase))
          ? rawPhase
          : CRISIS_PHASE.MID;
    setRegionCrisis(regIdx, validType, validPhase);
    return `[Living Tamriel] Region ${regIdx} (${regState.regionName}) crisis updated: ${validType} (${validPhase}).`;
  }

  if (sub === 'adv') {
    const act = String(cleanArgs[1] ?? 'list').toLowerCase();
    ensureAdventurerPool();
    const reg = getAdventurerSimRegistry();
    const pool = reg?.pool ?? [];
    if (act === 'list') {
      const targetReg = cleanArgs[2] ? parseInt(cleanArgs[2], 10) : regIdx;
      const list = pool.filter((a) => !targetReg || a.currentRegion === targetReg || pool.length <= 15).slice(0, 15);
      if (list.length === 0) return `[Living Tamriel] No active adventurers found in Region ${targetReg}.`;
      return [
        `<b>Active Adventurers in Region ${targetReg} (${list.length}):</b>`,
        ...list.map((a) => {
          const name = getAdventurerDisplayName(a);
          return `- ${name} | Lvl ${a.level} ${a.className} | Gear T${a.gearTier} | Trait: ${a.trait} | Status: ${a.status} | Duels: ${a.duelsWon ?? 0}W/${a.duelsLost ?? 0}L`;
        }),
      ].join('\n');
    }
    if (act === 'summon') {
      const query = String(cleanArgs[2] ?? 'random').toLowerCase();
      let match = null;
      if (query === 'random') {
        const live = pool.filter((a) => a.status !== ADVENTURER_STATUS.DEAD);
        match = live[Math.floor(Math.random() * live.length)] || pool[0];
      } else if (query === 'nearest') {
        match = pool.find((a) => a.currentRegion === regIdx && a.status !== ADVENTURER_STATUS.DEAD) || pool[0];
      } else {
        match = pool.find((a) => (a.name || '').toLowerCase().includes(query) || (a.id || '').toLowerCase().includes(query));
      }
      if (!match) return `[Living Tamriel] Adventurer "${query}" not found in world pool.`;

      const feet = ctx?.playerFeet ?? [0, 0, 0];
      const heightAt = ctx?.heightAt ?? (() => feet[1] || 0);
      const safe = findSafeSiteCenter(ctx, feet, 4, 0, 2.0);
      const bp = buildLivingSiteBlueprint({
        kind: LIVING_SITE_KINDS.WANDERING_ADVENTURER,
        centerX: safe.x,
        centerZ: safe.z,
        heightAt,
        regionIndex: regIdx,
        playerEntity: ctx?.playerEntity ?? null,
        nowMinutes: ctx?.nowMinutes ?? 0,
        onRoad: true,
        adv: match,
      });
      bp.meta = { ...bp.meta, adv: match };
      ctx?.sceneHost?.standBlueprint?.(bp);
      return `[Living Tamriel] Summoned adventurer ${getAdventurerDisplayName(match)} (Lvl ${match.level} ${match.className}) in front of you. Step closer to interact.`;
    }
    return 'Usage: /living adv <list [region] | summon [nearest|random|<name>]>';
  }

  if (sub === 'spawn') {
    const aliasMap = {
      roadside_plea: LIVING_SITE_KINDS.PLEA_ENCOUNTER,
      plea: LIVING_SITE_KINDS.PLEA_ENCOUNTER,
      plea_encounter: LIVING_SITE_KINDS.PLEA_ENCOUNTER,
      checkpoint: LIVING_SITE_KINDS.CHECKPOINT,
      bandit_camp: LIVING_SITE_KINDS.BANDIT_CAMP,
      bandit: LIVING_SITE_KINDS.BANDIT_CAMP,
      camp: LIVING_SITE_KINDS.BANDIT_CAMP,
      traveler_rest: LIVING_SITE_KINDS.TRAVELER_REST,
      rest: LIVING_SITE_KINDS.TRAVELER_REST,
      traveler: LIVING_SITE_KINDS.TRAVELER_REST,
      merchant: LIVING_SITE_KINDS.TRAVELER_REST,
      trader: LIVING_SITE_KINDS.TRAVELER_REST,
      caravan: LIVING_SITE_KINDS.TRAVELER_REST,
      quarantine: LIVING_SITE_KINDS.QUARANTINE_TENT,
      quarantine_tent: LIVING_SITE_KINDS.QUARANTINE_TENT,
      urban_skirmish: LIVING_SITE_KINDS.URBAN_SKIRMISH,
      skirmish: LIVING_SITE_KINDS.URBAN_SKIRMISH,
      nemesis_ambush: LIVING_SITE_KINDS.NEMESIS_AMBUSH,
      nemesis: LIVING_SITE_KINDS.NEMESIS_AMBUSH,
      ambush: LIVING_SITE_KINDS.NEMESIS_AMBUSH,
      adventurer_meeting: LIVING_SITE_KINDS.ADVENTURER_MEETING,
      meeting: LIVING_SITE_KINDS.ADVENTURER_MEETING,
      wandering_adventurer: LIVING_SITE_KINDS.WANDERING_ADVENTURER,
      adventurer: LIVING_SITE_KINDS.WANDERING_ADVENTURER,
      adv: LIVING_SITE_KINDS.WANDERING_ADVENTURER,
      naval_squadron: LIVING_SITE_KINDS.NAVAL_SQUADRON,
      naval: LIVING_SITE_KINDS.NAVAL_SQUADRON,
    };
    const rawKind = String(cleanArgs[1] ?? 'checkpoint').toLowerCase();
    const mapped = aliasMap[rawKind] || rawKind.toUpperCase();
    const validKind = Object.values(LIVING_SITE_KINDS).includes(/** @type {any} */ (mapped))
      ? mapped
      : LIVING_SITE_KINDS.CHECKPOINT;
    const feet = ctx?.playerFeet ?? [0, 0, 0];
    const heightAt = ctx?.heightAt ?? (() => feet[1] || 0);
    const safe = findSafeSiteCenter(ctx, feet, 14, Math.PI * 0.25, 4.0);
    const bp = buildLivingSiteBlueprint({
      kind: validKind,
      centerX: safe.x,
      centerZ: safe.z,
      heightAt,
      regionIndex: regIdx,
      playerEntity: ctx?.playerEntity ?? null,
      nowMinutes: ctx?.nowMinutes ?? 0,
      onRoad: true,
    });
    ctx?.sceneHost?.standBlueprint?.(bp);
    return `[Living Tamriel] Spawned ${validKind} (${bp.meshes.length} meshes, ${bp.flats.length} flats, ${bp.actors.length} actors).`;
  }

  if (sub === 'encounter') {
    const kind = String(cleanArgs[1] ?? 'random').toLowerCase();
    if (ctx?.triggerEncounter) {
      return ctx.triggerEncounter(kind);
    }
    return '[Living Tamriel] Wilderness encounter trigger unavailable in current scene.';
  }

  if (sub === 'quest') {
    const existing = getActiveCrisisContract(regIdx);
    if (existing) {
      const done = completeRegionalCrisisContract(regIdx, ctx?.playerEntity ?? null);
      return `[Living Tamriel] Completed contract ${existing.questType} (+${done?.rewardGold ?? 0}g).`;
    }
    const accepted = acceptRegionalCrisisContract(
      regIdx,
      Number(ctx?.playerEntity?.level ?? 1),
      ctx?.nowMinutes ?? 0,
    );
    if (!accepted) {
      return `[Living Tamriel] Region ${regIdx} is at PEACE; set a crisis first (/living crisis WAR MID).`;
    }
    return `[Living Tamriel] Accepted crisis contract: ${accepted.title} (${accepted.rewardGold}g).`;
  }

  if (sub === 'formulas' || sub === 'formula') {
    return Object.values(LIVING_FORMULAS)
      .map(
        (f) =>
          `- ${f.id} (${f.label}): skill*${f.skillWeight.toFixed(2)} + ${f.defaultStat}*${f.statWeight.toFixed(2)} + luck*${f.luckWeight.toFixed(2)} + roll*${f.rollWeight.toFixed(2)} vs DC+${f.targetOffset}`,
      )
      .join('\n');
  }

  if (sub === 'roll' || sub === 'check') {
    const rawSkill = String(cleanArgs[1] ?? 'Etiquette');
    const dc = Number(cleanArgs[2] ?? 50);
    const formulaId = String(cleanArgs[3] ?? 'SOCIAL_DIPLOMACY').toUpperCase();
    const res = resolveLivingRoll({
      formulaId,
      playerEntity: ctx?.playerEntity ?? null,
      skillId: rawSkill,
      difficulty: Number.isFinite(dc) ? dc : 50,
      regionIndex: regIdx,
    });
    return `[Living Roll: ${res.formulaId}] Skill=${res.skill}, Stat=${res.stat}, Luck=${res.luck}, d100=${res.roll} -> Total=${res.totalScore} vs Target=${res.targetScore} (Margin=${res.margin >= 0 ? '+' : ''}${res.margin}) => ${res.degree}`;
  }

  return 'Usage: /living <status | traits [0..3|off|light|mid|high] | crisis <TYPE> [PHASE] | [site] spawn <KIND> | encounter [random|wild|camp|merchant|adv|bandit|plea] | adv <list|summon> | roll [Skill] [DC] [Formula] | formulas | quest>';
}

