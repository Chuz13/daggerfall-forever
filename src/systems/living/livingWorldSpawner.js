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
import { t } from '../textManager.js';
import { adoptLight } from '../../render/lightId.js';
import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import { SEASONS, seasonValue, dateFromClassicMinutes } from '../gameDate.js';
import { encounterTable } from '../../characters/encounterTableDoor.js';
import { trs } from '../../world/mat4.js';
import { sphereAabb } from '../../render/frustum.js';
import { drawSeen } from '../../scenes/decor/decorRoom.js';
import { GLOBAL_SCALE } from '../../player/activate.js';
import { equipAdventurerEntity } from './adventurerGear.js';
import { getActiveRoadIntelBuff } from './travelDirector.js';
import { rollBossTraits } from '../bossTraits.js';
import { capitalIndexOfId } from '../../world/capitalLane.js';
import {
  LivingTamrielConfig,
  PRESENCE,
  getLivingEncounterScale,
  getLivingLocationCooldownMinutes,
  rollEncounterRange,
  LIVING_ENCOUNTER_SCALE,
  LIVING_URBAN_LOOT,
  LIVING_WILDERNESS_LOOT,
} from './livingConfig.js';
import {
  getRegionState,
  isRegionInQuarantine,
  getActiveCrises,
  setRegionCrisis,
  applyPlayerCrisisImpact,
  CRISIS_TYPE,
  CRISIS_PHASE,
} from './regionState.js';
import {
  getSettlementProsperityDelta,
  getRegionProsperityShift,
  getTotalSettlementProsperityShift,
  shiftSettlementProsperity,
  setSettlementProsperity,
  clearSettlementProsperity,
} from './settlementProsperity.js';
import { getQuarantineReliefPostInfo } from './quarantineGate.js';
import { checkCampFootprintSlope, snapPropToGround } from './campInjector.js';
import { lodgedIn, freeLodgedFeet } from '../../characters/foeSpacing.js';
import {
  shouldSpawnRoadCheckpoint,
  evaluateCheckpointEncounter,
  resolveCheckpointInteraction,
  hasRegionalCheckpointPass,
  grantRegionalCheckpointPass,
  clearRegionalCheckpointPass,
  CHECKPOINT_OUTCOME,
} from './roadCheckpointHost.js';
import { evaluateCheckpointInspection } from './reputationConsequences.js';
import {
  shouldSpawnUrbanSkirmish,
  planUrbanSkirmish,
  isSkirmishBlowCriminal,
  SKIRMISH_TEAMS,
} from './urbanDirector.js';
import { resolveCrisisChoiceCheck, getEventDisplayName, SKIRMISH_PROP_THEME } from './crisisRegistry.js';
import { applySkirmishReputationOutcome } from './skirmishReputation.js';
import {
  LIVING_ROLL_DEGREE,
  LIVING_FORMULAS,
  resolveLivingRoll,
  SURRENDER_OUTCOME,
  calculateSurrenderRansom,
  resolveLivingSurrender,
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
import { recordCrisisChoiceResolution, recordSurrenderResolution } from '../diagnostics/livingLogger.js';
import {
  offerRegionalCrisisContract,
  acceptRegionalCrisisContract,
  getActiveCrisisContract,
  completeRegionalCrisisContract,
} from './crisisPresenter.js';
import { goldStack, isGoldPieces, addItem } from '../inventory.js';
import { setItemFields } from '../item/itemTemplates.js';
import { makePotion, potionRecipeKey, POTION_RECIPES } from '../potions.js';
import {
  shouldDispatchNemesis,
  determineNemesisArchetype,
  selectNemesisAssignment,
  createNemesisHunter,
  resolveNemesisConfrontation,
  getNemesisMemory,
  recordAdventurerGrudge,
  clearNemesisGrudge,
  NEMESIS_ARCHETYPES,
  NEMESIS_RESOLUTION,
} from './nemesisHost.js';
import { recordNemesisDefeated, getPantheonDeity } from '../apotheosis/apotheosisCore.js';
import {
  DIVINE_SKIRMISH_PACIFY_FAITH_COST,
  WAR_SKIRMISH_PACIFY_GOAL,
  getApotheosisSiegeConfig,
  getActiveWarForRegion,
  setWarPlayerStance,
  canSpawnWarSkirmish,
  markWarSkirmishSpawned,
  resolveWarSkirmishPacify,
} from '../apotheosis/apotheosisStage34.js';
import { addApotheosisFaith } from '../apotheosis/apotheosisStage2.js';
import { shiftRegionInfluence } from '../apotheosis/apotheosisStage3.js';
import { isAscendedGod } from '../apotheosis/apotheosisLive.js';
import { evaluatePleaEncounter, resolvePleaResponse, PLEA_OUTCOME, PLEA_TYPE } from './pleaHost.js';
import { SKILLS, tallySkill } from '../skills.js';
import { dailyStockRolls } from '../shopStock.js';
import {
  ADVENTURER_TRAITS,
  ADVENTURER_STATUS,
  COMPANION_CONTRACT_OPTIONS_DAYS,
  MAX_COMPANION_CONTRACT_DAYS,
  ROAD_ADVENTURER_SITUATION,
  WANDERING_OUTCOME,
  DUEL_OUTCOME,
  RECLAIM_OUTCOME,
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
  calculateAdventurerHireQuote,
  extendAdventurerCompanion,
  getActiveAdventurerCompanion,
  getCompanionRemainingMinutes,
  dismissAdventurerCompanion,
  tickAdventurerSimulation,
  killAdventurerInDungeon,
  setAdventurerLevel,
  setAdventurerTrait,
} from './adventurerSim.js';
import { LIVING_WORDS } from './livingWords.js';
import { mobTraitChance } from '../bossTraits.js';
import {
  composeBanditCampSubordinates,
  composeCheckpointGuards,
  composeNemesisMinions,
  composeWarSquadRoles,
} from './tacticalPacks.js';

export { LIVING_WORDS };

/**
 * Adjusts regional legal reputation on both the canonical `player.legalRep` map and
 * the Living Tamriel alias `player.regionalReputations`, clamped to [-100, 100].
 * @param {any} player
 * @param {number} regIdx
 * @param {number} delta
 */
export function adjustPlayerRegionalRep(player, regIdx, delta) {
  if (!player || typeof player !== 'object' || !Number.isFinite(delta) || delta === 0) return;
  const current = Number(player.legalRep?.[regIdx] ?? player.regionalReputations?.[regIdx] ?? 0);
  const next = Math.max(-100, Math.min(100, current + delta));
  if (!player.legalRep || typeof player.legalRep !== 'object') {
    player.legalRep = {};
  }
  player.legalRep[regIdx] = next;
  if (!player.regionalReputations || typeof player.regionalReputations !== 'object') {
    player.regionalReputations = {};
  }
  player.regionalReputations[regIdx] = next;
}

/** Existing ARCH3D.BSA 3D model IDs used for Living Tamriel props. */
export const LIVING_MODELS = Object.freeze({
  TENT: 41606,          // Standard wilderness camp tent
  PAVILION: 41607,      // Command / Quarantine relief pavilion tent
  CANOPY: 41610,        // Large open merchant canopy
  WAGON: 41214,         // Wooden merchant/supply wagon
  CRATES: 41834,        // Supply crate stack / barricade
  BOXES: 41832,         // Medical / provision boxes
  BANNER: 42560,        // Military checkpoint standard / banner
  CHEST: 41811,         // Strongbox / merchant treasury chest
  STATUE: 62323,        // Heroic sovereign statue monument
  OBELISK: 62328,       // Dark stone obelisk
  CAGE: 74229,          // Iron prisoner / inquisitor cage
  COFFIN: 74071,        // Open wooden/stone coffin
  CASKET: 74069,        // Stone cemetery casket
  WELL_PEDESTAL: 74086, // Carved stone wellhead pedestal
  ALTAR: 74091,         // Grand temple altar pedestal
  ARCH: 62317,          // Marble monument arch
});

/** Existing TEXTURE.xxx billboard flats used for Living Tamriel props. */
export const LIVING_FLATS = Object.freeze({
  CAMPFIRE: Object.freeze({ archive: 210, record: 1, lightRadius: 14 }),
  SKULL_CANDLE: Object.freeze({ archive: 210, record: 2, lightRadius: 6 }),
  CANDELABRA: Object.freeze({ archive: 210, record: 5, lightRadius: 8 }),
  SKULL_TORCH: Object.freeze({ archive: 210, record: 6, lightRadius: 10 }),
  BRAZIER: Object.freeze({ archive: 210, record: 17, lightRadius: 12 }),
  BRAZIER_TALL: Object.freeze({ archive: 210, record: 20, lightRadius: 12 }),
  LANTERN: Object.freeze({ archive: 210, record: 22, lightRadius: 10 }),
  HORSE: Object.freeze({ archive: 201, record: 0, lightRadius: 0 }),
  COW: Object.freeze({ archive: 201, record: 3, lightRadius: 0 }),
  CALF: Object.freeze({ archive: 201, record: 4, lightRadius: 0 }),
  DOG: Object.freeze({ archive: 201, record: 9, lightRadius: 0 }),
  SACKS: Object.freeze({ archive: 205, record: 0, lightRadius: 0 }),
  GRAIN_SACK: Object.freeze({ archive: 205, record: 17, lightRadius: 0 }),
  BASKET: Object.freeze({ archive: 205, record: 22, lightRadius: 0 }),
  BARREL: Object.freeze({ archive: 205, record: 24, lightRadius: 0 }),
  BUCKET: Object.freeze({ archive: 205, record: 30, lightRadius: 0 }),
  WEAPON_RACK: Object.freeze({ archive: 207, record: 14, lightRadius: 0 }),
  CAULDRON: Object.freeze({ archive: 218, record: 0, lightRadius: 0 }),
  TREASURE_PILE: Object.freeze({ archive: 216, record: 0, lightRadius: 0 }),
  REMAINS_BODY: Object.freeze({ archive: 254, record: 56, lightRadius: 0 }),
  REMAINS_SKULL: Object.freeze({ archive: 100, record: 9, lightRadius: 0 }),
  REMAINS_BONES: Object.freeze({ archive: 100, record: 10, lightRadius: 0 }),
  RITUAL_BRAZIER: Object.freeze({ archive: 98, record: 0, lightRadius: 10 }),
  DAEDRIC_IDOL: Object.freeze({ archive: 202, record: 1, lightRadius: 0 }),
  KNIGHT_STATUE_FLAT: Object.freeze({ archive: 202, record: 5, lightRadius: 0 }),
  DIVINE_STATUE: Object.freeze({ archive: 97, record: 3, lightRadius: 0 }),
  CAPTIVE_FLAT: Object.freeze({ archive: 357, record: 6, lightRadius: 0 }),
  PRISONER_FLAT: Object.freeze({ archive: 184, record: 31, lightRadius: 0 }),
  MERCHANT_FLAT: Object.freeze({ archive: 182, record: 0, lightRadius: 0 }),
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
  WAR_SKIRMISH: 'WAR_SKIRMISH',
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
  const scale = getLivingEncounterScale();
  let extraCount = 0;
  if (scale === LIVING_ENCOUNTER_SCALE.LOW) {
    extraCount = crisisDriven && rolls() < 0.5 ? 1 : 0;
  } else if (scale === LIVING_ENCOUNTER_SCALE.MID) {
    extraCount = rollEncounterRange(1, 2, rolls);
  } else if (scale === LIVING_ENCOUNTER_SCALE.HIGH) {
    extraCount = rollEncounterRange(3, 5, rolls);
  }

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

  const scale = getLivingEncounterScale();
  let count = 2;
  if (scale === LIVING_ENCOUNTER_SCALE.LOW) {
    count = rollEncounterRange(2, 3, rolls);
  } else if (scale === LIVING_ENCOUNTER_SCALE.MID) {
    count = rollEncounterRange(4, 6, rolls);
  } else if (scale === LIVING_ENCOUNTER_SCALE.HIGH) {
    count = rollEncounterRange(8, 12, rolls);
  }
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
 * Finds a safe, open ground location for a living site (clear of obstacles).
 * @param {any} deps
 * @param {number[]} originFeet
 * @param {number} [preferredDist=16]
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

const PLEA_SCENE_TABLE = Object.freeze({
  [PLEA_TYPE.DRUNKEN_BRAWLER]: {
    mobileType: MOBILE_TYPES.Barbarian,
    name: 'Rowdy Drunkard',
    backupPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Barbarian],
    meshes: [],
    flats: [[LIVING_FLATS.BARREL, -1.0, -0.5], [LIVING_FLATS.CAMPFIRE, 1.1, 0.4]],
  },
  [PLEA_TYPE.BROKEN_CART_MERCHANT]: {
    mobileType: MOBILE_TYPES.Bard,
    name: 'Stranded Merchant',
    backupPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Archer],
    meshes: [[LIVING_MODELS.WAGON, -2.0, -1.2, -30], [LIVING_MODELS.CRATES, 1.6, -1.0, 20]],
    flats: [[LIVING_FLATS.HORSE, -3.2, 0.5], [LIVING_FLATS.GRAIN_SACK, 0.9, 0.8]],
  },
  [PLEA_TYPE.STRAY_HOUND_HANDLER]: {
    mobileType: MOBILE_TYPES.Ranger,
    name: 'Huntsman',
    backupPool: [MOBILE_TYPES.GrizzlyBear, MOBILE_TYPES.Ranger],
    meshes: [],
    flats: [[LIVING_FLATS.DOG, 1.0, -0.4], [LIVING_FLATS.SACKS, -1.0, -0.5], [LIVING_FLATS.WEAPON_RACK, 1.4, 0.8]],
  },
  [PLEA_TYPE.STREET_PREACHER]: {
    mobileType: MOBILE_TYPES.Monk,
    name: 'Street Preacher',
    backupPool: [MOBILE_TYPES.Spellsword, MOBILE_TYPES.Monk],
    meshes: [],
    flats: [[LIVING_FLATS.KNIGHT_STATUE_FLAT, -1.2, -0.6], [LIVING_FLATS.BRAZIER_TALL, 1.1, -0.5]],
  },
  [PLEA_TYPE.ACCUSED_URCHIN]: {
    mobileType: MOBILE_TYPES.Thief,
    name: 'Cornered Pickpocket',
    backupPool: [MOBILE_TYPES.Thief, MOBILE_TYPES.Burglar, MOBILE_TYPES.Rogue],
    meshes: [[LIVING_MODELS.BOXES, -1.5, -0.8, 15]],
    flats: [[LIVING_FLATS.GRAIN_SACK, 1.0, -0.4], [LIVING_FLATS.LANTERN, -0.8, 0.8]],
  },
  [PLEA_TYPE.BOASTFUL_DUELIST]: {
    mobileType: MOBILE_TYPES.Knight,
    name: 'Boastful Duelist',
    backupPool: [MOBILE_TYPES.Warrior, MOBILE_TYPES.Knight],
    meshes: [[LIVING_MODELS.BANNER, -1.6, -1.0, 0]],
    flats: [[LIVING_FLATS.WEAPON_RACK, 1.2, -0.5]],
  },
  [PLEA_TYPE.PLAGUE_CURE]: {
    mobileType: MOBILE_TYPES.Healer,
    name: 'Plague-Stricken Citizen',
    backupPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    meshes: [],
    flats: [[LIVING_FLATS.SACKS, -1.0, -0.5]],
  },
  [PLEA_TYPE.FAMINE_BREAD]: {
    mobileType: MOBILE_TYPES.Monk,
    name: 'Starving Townsfolk',
    backupPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    meshes: [],
    flats: [[LIVING_FLATS.SACKS, -1.0, -0.5]],
  },
  [PLEA_TYPE.WAR_REFUGEE]: {
    mobileType: MOBILE_TYPES.Bard,
    name: 'Displaced Refugee',
    backupPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    meshes: [],
    flats: [[LIVING_FLATS.SACKS, -1.0, -0.5]],
  },
  [PLEA_TYPE.ESCORT_REQUEST]: {
    mobileType: MOBILE_TYPES.Ranger,
    name: 'Anxious Wayfarer',
    backupPool: [MOBILE_TYPES.Rogue, MOBILE_TYPES.Warrior],
    meshes: [],
    flats: [[LIVING_FLATS.SACKS, -1.0, -0.5]],
  },
});

function buildPleaSceneConfig(pleaType, centerX, centerZ, snapY) {
  const cfg = PLEA_SCENE_TABLE[pleaType] ?? PLEA_SCENE_TABLE[PLEA_TYPE.ESCORT_REQUEST];
  const meshes = cfg.meshes.map(([modelId, dx, dz, yawDeg]) => ({
    modelId,
    feet: [centerX + dx, snapY(centerX + dx, centerZ + dz, 0), centerZ + dz],
    yawDeg,
  }));
  const flats = cfg.flats.map(([flatDef, dx, dz]) => ({
    ...flatDef,
    feet: [centerX + dx, snapY(centerX + dx, centerZ + dz), centerZ + dz],
  }));
  return { mobileType: cfg.mobileType, name: cfg.name, backupPool: cfg.backupPool, meshes, flats };
}

function buildSkirmishThemeProps(theme, eventId, planProps, centerX, centerZ, y0, snapY) {
  const pt = (dx, dz) => ({ x: centerX + dx, z: centerZ + dz, y: snapY(centerX + dx, centerZ + dz) });
  const p0 = planProps?.[0] ?? pt(-1.8, 1.6);
  const p1 = planProps?.[1] ?? pt(1.8, -1.6);
  const m = (modelId, p, yawDeg, destructible = false) => ({
    modelId,
    feet: [p.x, p.y, p.z],
    yawDeg,
    ...(destructible ? { destructible: true } : {}),
  });
  const f = (flatDef, dx, dz, destructible = false) => ({
    ...flatDef,
    feet: [centerX + dx, snapY(centerX + dx, centerZ + dz), centerZ + dz],
    ...(destructible ? { destructible: true } : {}),
  });

  if (eventId === 'EVT_PLAGUE_RAT_SWARM') {
    return {
      meshes: [m(LIVING_MODELS.CRATES, pt(-0.6, 0.6), 20)],
      flats: [f(LIVING_FLATS.CAMPFIRE, 1.4, -1.0), f(LIVING_FLATS.REMAINS_BODY, -1.6, -0.4), f(LIVING_FLATS.REMAINS_BONES, 0.4, 1.3)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.PRISONER_CAGE) {
    return {
      meshes: [m(LIVING_MODELS.CAGE, p0, 0), m(LIVING_MODELS.BANNER, p1, 30)],
      flats: [f(LIVING_FLATS.CAPTIVE_FLAT, -0.5, 1.0), f(LIVING_FLATS.PRISONER_FLAT, -0.5, -0.8), f(LIVING_FLATS.WEAPON_RACK, 0.8, -0.6)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.GRANARY_MARKET) {
    return {
      meshes: [m(LIVING_MODELS.CANOPY, pt(-2.0, 1.8), 10), m(LIVING_MODELS.WAGON, pt(2.0, -1.8), -45)],
      flats: [f(LIVING_FLATS.GRAIN_SACK, -0.8, 0.9), f(LIVING_FLATS.SACKS, 0.6, -0.9), f(LIVING_FLATS.BARREL, 0.9, -0.2), f(LIVING_FLATS.MERCHANT_FLAT, 0, 0.2)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.CAULDRON_STATION) {
    return {
      meshes: [m(LIVING_MODELS.CANOPY, p0, 0), m(LIVING_MODELS.BOXES, p1, 25)],
      flats: [f(LIVING_FLATS.CAULDRON, 0, 0.1), f(LIVING_FLATS.CAMPFIRE, 0.8, -0.4), f(LIVING_FLATS.BASKET, -0.8, 0.5)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.PLAGUE_PYRE) {
    return {
      meshes: [m(LIVING_MODELS.COFFIN, p0, 20), m(LIVING_MODELS.CRATES, p1, -30)],
      flats: [f(LIVING_FLATS.CAMPFIRE, 0, 0), f(LIVING_FLATS.REMAINS_BODY, -0.7, 0.5), f(LIVING_FLATS.REMAINS_BONES, 0.8, -0.5)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.WATER_WELL_SITE) {
    const canSmashWell = eventId === 'EVT_PLAGUE_WATER_WELL_SCARE';
    return {
      meshes: [m(LIVING_MODELS.WELL_PEDESTAL, pt(0, 0), 0, canSmashWell), m(LIVING_MODELS.CRATES, p1, 40)],
      flats: [f(LIVING_FLATS.BUCKET, -1.1, 0.4, canSmashWell), f(LIVING_FLATS.BUCKET, 0.9, 0.8, canSmashWell), f(LIVING_FLATS.BARREL, 0.8, -0.9), f(LIVING_FLATS.BRAZIER, -1.1, -0.6)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.MONUMENT_STATUE) {
    const canToppleStatue = eventId === 'EVT_NEW_RULER_STATUE_UNVEILING';
    return {
      meshes: [m(LIVING_MODELS.STATUE, pt(0, 0), 0, canToppleStatue), m(LIVING_MODELS.BANNER, p1, -20)],
      flats: [f(LIVING_FLATS.BRAZIER_TALL, -1.3, 0.9), f(LIVING_FLATS.BRAZIER_TALL, 1.1, 1.0)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.OCCULT_RITUAL) {
    return {
      meshes: [m(LIVING_MODELS.OBELISK, p0, 0), m(LIVING_MODELS.CAGE, pt(1.8, -1.4), 25)],
      flats: [f(LIVING_FLATS.RITUAL_BRAZIER, 0, 0), f(LIVING_FLATS.SKULL_TORCH, -1.1, 0.5), f(LIVING_FLATS.SKULL_TORCH, 1.1, -0.1), f(LIVING_FLATS.DAEDRIC_IDOL, -0.3, -1.4)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.CRIME_HEIST) {
    return {
      meshes: [m(LIVING_MODELS.CHEST, p0, 15), m(LIVING_MODELS.BOXES, p1, -30)],
      flats: [f(LIVING_FLATS.TREASURE_PILE, -0.6, 0.8), f(LIVING_FLATS.SACKS, 0.7, -0.7), f(LIVING_FLATS.LANTERN, 0, 0)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.FARM_HOMESTEAD) {
    return {
      meshes: [m(LIVING_MODELS.WAGON, pt(-2.0, 1.8), -35), m(LIVING_MODELS.CRATES, p1, 20)],
      flats: [f(LIVING_FLATS.COW, 0.2, -1.2), f(LIVING_FLATS.CALF, -0.8, -0.7), f(LIVING_FLATS.DOG, 0.9, 0.3), f(LIVING_FLATS.GRAIN_SACK, -0.5, 0.8)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.GRAVEYARD_CRYPT) {
    return {
      meshes: [m(LIVING_MODELS.CASKET, p0, 10), m(LIVING_MODELS.COFFIN, p1, -25)],
      flats: [f(LIVING_FLATS.REMAINS_BODY, 0, 0.2), f(LIVING_FLATS.REMAINS_SKULL, -0.8, -0.5), f(LIVING_FLATS.SKULL_CANDLE, 0.7, -0.4)],
    };
  }
  if (theme === SKIRMISH_PROP_THEME.TEMPLE_SANCTUARY) {
    return {
      meshes: [m(LIVING_MODELS.ALTAR, p0, 0), m(LIVING_MODELS.ARCH, p1, 0)],
      flats: [f(LIVING_FLATS.DIVINE_STATUE, 0, 0), f(LIVING_FLATS.CANDELABRA, -0.9, 0.4), f(LIVING_FLATS.CANDELABRA, 0.9, -0.4)],
    };
  }
  return {
    meshes: [m(LIVING_MODELS.BANNER, p0, 15), m(LIVING_MODELS.CRATES, p1, -35)],
    flats: [f(LIVING_FLATS.WEAPON_RACK, 0.8, -0.6), f(LIVING_FLATS.BRAZIER, 0, 0)],
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
  warDesc = null,
  climateIndex = null,
  allowMundaneOnly = false,
  forcedEventId = null,
  plea: passedPlea = null,
  forcedPleaType = null,
  forcedSituation = null,
}) {
  const playerLevel = Math.max(1, Number(playerEntity?.level ?? 1));
  const h0 = typeof heightAt === 'function' ? heightAt(centerX, centerZ) : 0;
  if (typeof heightAt === 'function' && !Number.isFinite(h0)) {
    return null;
  }
  const y0 = snapPropToGround(heightAt, centerX, centerZ, 0, h0);
  const snapY = (x, z, off = 0.02) => snapPropToGround(heightAt, x, z, off, y0);
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

    const scale = getLivingEncounterScale();
    let subGuardCount = 2;
    if (scale === LIVING_ENCOUNTER_SCALE.LOW) {
      subGuardCount = rollEncounterRange(1, 2, rng);
    } else if (scale === LIVING_ENCOUNTER_SCALE.MID) {
      subGuardCount = rollEncounterRange(3, 5, rng);
    } else if (scale === LIVING_ENCOUNTER_SCALE.HIGH) {
      subGuardCount = rollEncounterRange(6, 10, rng);
    }
    const guardCount = 1 + subGuardCount;
    const guardRoster = composeCheckpointGuards(guardCount, playerLevel);
    for (let i = 0; i < guardRoster.length; i++) {
      const rank = Math.floor(i / 4);
      const inRank = i % 4;
      const gx = centerX + (inRank - 1.5) * 2.0;
      const gz = centerZ + (rank === 0 ? (i % 2 === 0 ? 1.5 : -1.0) : (rank * 1.8));
      const g = guardRoster[i];
      actors.push({
        mobileType: g.mobileType,
        name: g.name,
        level: Math.max(3, playerLevel),
        feet: [gx, snapPropToGround(heightAt, gx, gz), gz],
        yaw: Math.PI,
        allied: false,
        hostile: false,
        role: 'checkpoint_guard',
        team: SKIRMISH_TEAMS.CITY_WATCH,
        suppressInfighting: true,
        skirmishLeader: i === 0,
        allowThreatScaling: true,
        allowEliteRoll: true,
        allowChampionRoll: true,
        eliteChance: i === 0 ? 0.2 : 0.1,
        ...(i === 0 && playerLevel >= 6 ? { eliteFoe: true } : {}),
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

    // 1. Leader (always 1)
    actors.push({
      mobileType: MOBILE_TYPES.Rogue,
      name: leaderName,
      level: Math.max(2, playerLevel + 1),
      feet: [centerX + 1.8, snapPropToGround(heightAt, centerX + 1.8, centerZ + 1.0), centerZ + 1.0],
      yaw: Math.PI * 0.75,
      allied: false,
      hostile: !ambushDetectedByStealth,
      role: 'bandit_camp',
      team: 'Criminals',
      suppressInfighting: true,
      skirmishLeader: true,
      allowThreatScaling: true,
      allowEliteRoll: true,
      allowChampionRoll: true,
      eliteChance: 0.25,
      ...(playerLevel >= 5 ? { eliteFoe: true } : {}),
    });

    // 2. Subordinates scaled by encounter scale ranges
    const scale = getLivingEncounterScale();
    let subBanditCount = 2;
    if (scale === LIVING_ENCOUNTER_SCALE.LOW) {
      subBanditCount = rollEncounterRange(2, 3, rng);
    } else if (scale === LIVING_ENCOUNTER_SCALE.MID) {
      subBanditCount = rollEncounterRange(4, 7, rng);
    } else if (scale === LIVING_ENCOUNTER_SCALE.HIGH) {
      subBanditCount = rollEncounterRange(8, 14, rng);
    }

    const subRoster = composeBanditCampSubordinates(subBanditCount, playerLevel);
    for (let i = 0; i < subRoster.length; i++) {
      const sub = subRoster[i];
      const rank = Math.floor(i / 5);
      const inRank = i % 5;
      const rankTotal = Math.min(5, subRoster.length - rank * 5);
      const angle = (inRank / Math.max(1, rankTotal)) * Math.PI * 2;
      const dist = 2.5 + rank * 1.8 + (i % 2 === 0 ? 0.3 : -0.3);
      const bx = centerX + Math.cos(angle) * dist;
      const bz = centerZ + Math.sin(angle) * dist;
      actors.push({
        mobileType: sub.mobileType,
        name: sub.name,
        level: Math.max(1, playerLevel),
        feet: [bx, snapPropToGround(heightAt, bx, bz), bz],
        yaw: Math.atan2(centerX - bx, centerZ - bz),
        allied: false,
        hostile: !ambushDetectedByStealth,
        role: 'bandit_camp',
        team: 'Criminals',
        suppressInfighting: true,
        allowThreatScaling: true,
        allowEliteRoll: true,
        allowChampionRoll: true,
        eliteChance: 0.1,
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

    actors.push({
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
    });

    const scale = getLivingEncounterScale();
    let outriderCount = 1;
    if (scale === LIVING_ENCOUNTER_SCALE.LOW) outriderCount = 1;
    else if (scale === LIVING_ENCOUNTER_SCALE.MID) outriderCount = rollEncounterRange(2, 3, rng);
    else if (scale === LIVING_ENCOUNTER_SCALE.HIGH) outriderCount = rollEncounterRange(4, 6, rng);

    for (let i = 0; i < outriderCount; i++) {
      const angle = (i / Math.max(1, outriderCount)) * Math.PI + Math.PI * 0.4;
      const dist = 2.2 + (i % 2) * 1.0;
      const gx = centerX + Math.cos(angle) * dist;
      const gz = centerZ + Math.sin(angle) * dist;
      actors.push({
        mobileType: i % 2 === 0 ? MOBILE_TYPES.Ranger : MOBILE_TYPES.Warrior,
        name: i === 0 ? 'Caravan Outrider' : 'Hired Caravan Guard',
        level: Math.max(2, playerLevel),
        feet: [gx, snapPropToGround(heightAt, gx, gz), gz],
        yaw: 0,
        allied: false,
        hostile: false,
        role: 'traveler_guard',
        team: 'Traveler',
        suppressInfighting: true,
      });
    }
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
    const plea =
      passedPlea ??
      evaluatePleaEncounter({
        regionIndex,
        nowMinutes,
        playerEntity,
        rng,
        force: true,
        forcedPleaType,
      }).plea ?? {
        type: PLEA_TYPE.ESCORT_REQUEST,
        requiredGold: 25,
        messageKey: 'living.plea.escort',
      };
    const sceneCfg = buildPleaSceneConfig(plea.type, centerX, centerZ, snapY);
    meta = { ...meta, plea, pleaBackupPool: sceneCfg.backupPool };
    meshes.push(...sceneCfg.meshes);
    flats.push(...sceneCfg.flats);

    actors.push({
      mobileType: sceneCfg.mobileType,
      name: sceneCfg.name,
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
      climateIndex,
      allowMundaneOnly,
      forcedEventId,
    });
    if (!plan) return null;
    meta.event = plan.event;
    meta.faction1Name = plan.faction1Name;
    meta.faction2Name = plan.faction2Name;
    meta.enemyRegionIndex = plan.enemyRegionIndex ?? null;
    meta.propTheme = plan.propTheme;
    const themedProps = buildSkirmishThemeProps(
      plan.propTheme,
      plan.event?.id,
      plan.props,
      centerX,
      centerZ,
      y0,
      snapY,
    );
    meshes.push(...themedProps.meshes);
    flats.push(...themedProps.flats);

    for (let i = 0; i < plan.guards.length; i++) {
      const g = plan.guards[i];
      const gx = centerX + g.dx;
      const gz = centerZ + g.dz;
      actors.push({
        mobileType: g.mobileType ?? MOBILE_TYPES.Knight,
        name: `${plan.faction1Name ?? 'Guard'} Defender`,
        level: Math.max(4, playerLevel),
        feet: [gx, snapY(gx, gz), gz],
        yaw: 0,
        allied: false,
        hostile: true,
        role: 'skirmish_guard',
        team: SKIRMISH_TEAMS.CITY_WATCH,
        campId: 'skirmish_guards',
        factionSide: 'guards',
        skirmishLeader: i === 0,
        allowThreatScaling: true,
        allowEliteRoll: true,
        allowChampionRoll: true,
        eliteChance: i === 0 ? 0.2 : 0.1,
        ...(i === 0 && playerLevel >= 6 ? { eliteFoe: true } : {}),
      });
    }
    const isSwarm = Boolean(plan.event?.swarmAttackers);
    const attackerLevel = isSwarm
      ? Math.max(1, Math.floor(playerLevel * 0.5))
      : Math.max(3, playerLevel);
    for (let i = 0; i < plan.rebels.length; i++) {
      const rb = plan.rebels[i];
      const rx = centerX + rb.dx;
      const rz = centerZ + rb.dz;
      actors.push({
        mobileType: rb.mobileType ?? MOBILE_TYPES.Rogue,
        name: `${plan.faction2Name ?? 'Rebel'} Fighter`,
        level: attackerLevel,
        feet: [rx, snapY(rx, rz), rz],
        yaw: Math.PI,
        allied: false,
        hostile: true,
        role: 'skirmish_rebel',
        team: SKIRMISH_TEAMS.INSURGENTS,
        campId: 'skirmish_rebels',
        factionSide: 'rebels',
        ...(isSwarm ? {} : {
          skirmishLeader: i === 0,
          allowThreatScaling: true,
          allowEliteRoll: true,
          allowChampionRoll: true,
          eliteChance: i === 0 ? 0.2 : 0.1,
          ...(i === 0 && playerLevel >= 6 ? { eliteFoe: true } : {}),
        }),
      });
    }
  } else if (kind === LIVING_SITE_KINDS.WAR_SKIRMISH) {
    const war = warDesc ?? getActiveWarForRegion(playerEntity, regionIndex) ?? {
      warKind: 'mundane',
      warId: `mundane_war_${regionIndex}`,
      regIdx: regionIndex,
      regionName: `Region ${regionIndex}`,
      godA: null,
      godB: null,
      sideAId: 'vanguard',
      sideBId: 'invaders',
      sideAName: t('apotheosis.skirmish.vanguardGeneric', 'Regional Vanguard'),
      sideBName: t('apotheosis.skirmish.invaders', 'Invading Warband'),
      playerStance: null,
      pacifiedCount: 0,
    };
    meta.warDesc = war;
    meta.skirmishStance = war.playerStance === 'sideA'
      ? 'watch'
      : war.playerStance === 'sideB'
        ? 'rebels'
        : 'neutral_watch';

    const cfg = getApotheosisSiegeConfig();
    const squadCount = Math.max(2, cfg.enabled ? cfg.skirmishSize : 3);
    meshes.push(
      { modelId: LIVING_MODELS.BANNER, feet: [centerX - 3.2, snapY(centerX - 3.2, centerZ), centerZ], yawDeg: 20 },
      { modelId: LIVING_MODELS.CRATES, feet: [centerX + 3.2, snapY(centerX + 3.2, centerZ + 0.8), centerZ + 0.8], yawDeg: -30 },
    );
    flats.push({ ...LIVING_FLATS.BRAZIER, feet: [centerX, y0, centerZ] });

    const sideARoles = composeWarSquadRoles(squadCount, {
      warKind: war.warKind,
      godKind: war.godA ? getPantheonDeity(war.godA)?.kind ?? null : null,
      isSideB: false,
      playerLevel,
    });
    const sideBRoles = composeWarSquadRoles(squadCount, {
      warKind: war.warKind,
      godKind: war.godB ? getPantheonDeity(war.godB)?.kind ?? null : null,
      isSideB: true,
      playerLevel,
    });

    for (let i = 0; i < squadCount; i++) {
      const gx = centerX - 4.5 - (i % 2) * 1.4;
      const gz = centerZ + (i - (squadCount - 1) * 0.5) * 1.8;
      actors.push({
        mobileType: sideARoles[i].mobileType,
        name: war.sideAName,
        level: Math.max(4, playerLevel),
        feet: [gx, snapY(gx, gz), gz],
        yaw: Math.PI * 0.5,
        allied: war.playerStance === 'sideA',
        hostile: true,
        role: 'skirmish_guard',
        team: war.playerStance === 'sideA' ? 'PlayerAlly' : 'WarSideA',
        campId: 'war_side_a',
        factionSide: 'guards',
        skirmishLeader: i === 0,
        allowThreatScaling: true,
        allowEliteRoll: true,
        allowChampionRoll: true,
        eliteChance: i === 0 ? 0.2 : 0.1,
        ...(i === 0 && playerLevel >= 6 ? { eliteFoe: true } : {}),
      });
    }
    for (let i = 0; i < squadCount; i++) {
      const rx = centerX + 4.5 + (i % 2) * 1.4;
      const rz = centerZ + (i - (squadCount - 1) * 0.5) * 1.8;
      actors.push({
        mobileType: sideBRoles[i].mobileType,
        name: war.sideBName,
        level: Math.max(4, playerLevel),
        feet: [rx, snapY(rx, rz), rz],
        yaw: -Math.PI * 0.5,
        allied: war.playerStance === 'sideB',
        hostile: true,
        role: 'skirmish_rebel',
        team: war.playerStance === 'sideB' ? 'PlayerAlly' : 'WarSideB',
        campId: 'war_side_b',
        factionSide: 'rebels',
        skirmishLeader: i === 0,
        allowThreatScaling: true,
        allowEliteRoll: true,
        allowChampionRoll: true,
        eliteChance: i === 0 ? 0.2 : 0.1,
        ...(i === 0 && playerLevel >= 6 ? { eliteFoe: true } : {}),
      });
    }
  } else if (kind === LIVING_SITE_KINDS.NEMESIS_AMBUSH) {
    const rep = Number(playerEntity?.legalRep?.[regionIndex] ?? playerEntity?.regionalReputations?.[regionIndex] ?? 0);
    const regState = getRegionState(regionIndex);
    const isCrisis = regState?.crisis !== CRISIS_TYPE.PEACE;
    const nemMem = getNemesisMemory();
    const hasGrudge = Boolean(nemMem?.hasGrudge);
    const assignment = selectNemesisAssignment(playerEntity, {
      legalReputation: rep,
      playerLevel,
      isCrisis,
      hasGrudge,
      playerGold: Number(playerEntity?.goldPieces ?? 0),
      rng,
    });
    const nemesis = createNemesisHunter(playerLevel, {
      name: assignment.customName,
      archetype: assignment.archetype,
      factionKey: assignment.factionKey,
      factionId: assignment.factionId,
      factionName: assignment.factionName,
      rng,
    });
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
      skirmishLeader: true,
      allowThreatScaling: true,
      eliteFoe: true,
      forcedBossTraits: rollBossTraits(nemesis.bossTraitCount ?? 1, rng),
      hpMult: nemesis.hpMult ?? 1.8,
      damageMult: nemesis.damageMult ?? 1.35,
      nemesis,
    });

    const minionRoles = composeNemesisMinions(nemesis.minions.length, playerLevel, leaderType);
    for (let i = 0; i < nemesis.minions.length; i++) {
      const m = nemesis.minions[i];
      const angle = ((i + 1) / (nemesis.minions.length + 1)) * Math.PI - Math.PI / 2;
      const mx = centerX + Math.sin(angle) * 3.0;
      const mz = centerZ + Math.cos(angle) * 2.5;
      actors.push({
        mobileType: minionRoles[i].mobileType,
        name: m.name,
        level: m.level,
        feet: [mx, snapPropToGround(heightAt, mx, mz), mz],
        yaw: Math.PI,
        allied: false,
        hostile: false,
        role: 'nemesis_minion',
        team: 'NemesisGang',
        suppressInfighting: true,
        allowThreatScaling: true,
        allowEliteRoll: true,
        allowChampionRoll: true,
        eliteChance: 0.15,
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
      adv,
    });
  } else if (kind === LIVING_SITE_KINDS.WANDERING_ADVENTURER) {
    const wandering = pickWanderingAdventurerEncounter({
      regionIndex,
      onRoad: Boolean(onRoad),
      isDay,
      playerEntity,
      nowMinutes,
      rng,
    });
    const adv = passedAdv ?? wandering.adv;
    const validForcedSit =
      forcedSituation && Object.values(ROAD_ADVENTURER_SITUATION).includes(forcedSituation)
        ? forcedSituation
        : null;
    const situation = validForcedSit ?? (passedAdv ? ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP : wandering.situation);
    const displayName = getAdventurerDisplayName(adv);
    adv.name = displayName;
    meta = { ...meta, ...wandering, adv, displayName, situation };

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
      const scale = getLivingEncounterScale();
      let monsterCount = 2;
      if (scale === LIVING_ENCOUNTER_SCALE.LOW) monsterCount = 2;
      else if (scale === LIVING_ENCOUNTER_SCALE.MID) monsterCount = rollEncounterRange(3, 5, rng);
      else if (scale === LIVING_ENCOUNTER_SCALE.HIGH) monsterCount = rollEncounterRange(6, 10, rng);

      for (let i = 0; i < monsterCount; i++) {
        const mob = pool[Math.floor(rng() * pool.length)] ?? (i % 2 === 0 ? MOBILE_TYPES.Orc : MOBILE_TYPES.GrizzlyBear);
        const angle = (i / Math.max(1, monsterCount)) * Math.PI * 2;
        const dist = 3.0 + (i % 2) * 1.2;
        const mx = centerX + Math.cos(angle) * dist;
        const mz = centerZ + Math.sin(angle) * dist;
        actors.push({
          mobileType: mob,
          name: i % 2 === 0 ? 'Roadside Marauder' : 'Wilderness Stalker',
          level: Math.max(1, playerLevel),
          feet: [mx, snapPropToGround(heightAt, mx, mz), mz],
          yaw: Math.atan2(centerX - mx, centerZ - mz),
          allied: false,
          hostile: true,
          role: 'skirmish_monster',
          team: 'SkirmishMonsters',
          factionSide: 'monsters',
          suppressInfighting: true,
        });
      }
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
      adv,
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
import {
  LOCATION_EVENT_COOLDOWN_MINUTES,
  SKIRMISH_LOCATION_COOLDOWN_MINUTES,
  locationEventCooldowns,
  locationSkirmishCooldowns,
  getLocationEventCooldownsSnapshot,
  restoreLocationEventCooldownsSnapshot,
} from './locationCooldowns.js';

export {
  LOCATION_EVENT_COOLDOWN_MINUTES,
  SKIRMISH_LOCATION_COOLDOWN_MINUTES,
  locationEventCooldowns,
  locationSkirmishCooldowns,
  getLocationEventCooldownsSnapshot,
  restoreLocationEventCooldownsSnapshot,
};

function applyTownProsperityDelta(mapId, townName, shift, nowMin, say) {
  if (mapId == null || !shift) return;
  const day = Math.floor((Number(nowMin) || 0) / 1440);
  const res = shiftSettlementProsperity(mapId, shift, day);
  if (!res.applied) return;
  if (res.applied > 0) {
    say?.(townName ? LIVING_WORDS.prosperityImproved(townName, res.applied) : LIVING_WORDS.prosperityGenericImproved(res.applied), 5);
  } else {
    say?.(townName ? LIVING_WORDS.prosperityDeclined(townName, res.applied) : LIVING_WORDS.prosperityGenericDeclined(res.applied), 5);
  }
}

/**
 * Deterministically equips and stamps a spawned mobile as a hired companion.
 * @param {any} foe
 * @param {any} comp
 * @param {(() => number[]) | null} [followFeetFn=null]
 * @returns {any}
 */
export function applyCompanionEntityStamp(foe, comp, followFeetFn = null) {
  if (!foe || !comp) return foe;
  if (foe.entity) {
    const level = Math.max(1, Number(comp.level ?? 1));
    const gearTier = Number.isFinite(comp.gearTier)
      ? comp.gearTier
      : Math.max(1, Math.min(9, Math.floor(level / 5) + 1));
    try {
      equipAdventurerEntity(
        foe.entity,
        {
          id: comp.id,
          name: comp.name,
          className: comp.className || 'Warrior',
          level,
          gearTier,
          trait: comp.trait || 'HONORABLE',
        },
        level,
        dailyStockRolls(Math.max(1, Math.trunc(Number(comp.id) || 1))),
      );
    } catch (_e) {}
    foe.entity.name = comp.displayName || comp.name;
    foe.entity.team = 'PlayerAlly';
    foe.entity.mobileTeam = 'PlayerAlly';
    if (Number.isFinite(foe.entity.maxHealth) && foe.entity.maxHealth > 0) {
      foe.entity.health = foe.entity.maxHealth;
      if ('currentHealth' in foe.entity) foe.entity.currentHealth = foe.entity.maxHealth;
    }
  }
  foe._isSparring = false;
  foe._surrenderedSpar = false;
  foe._sparGraceLeft = 0;
  foe._sparKneeling = false;
  foe._duelWager = 0;
  if (foe.ai) {
    foe.ai.isHostile = false;
    foe.ai.target = null;
    foe.ai.secondaryTarget = null;
    if (typeof followFeetFn === 'function') {
      foe.ai.follow = {
        feet: () => followFeetFn() ?? [foe.ai.feet?.[0] ?? 0, foe.ai.feet?.[1] ?? 0, foe.ai.feet?.[2] ?? 0],
        stop: 2.5,
      };
    }
    foe.ai.moving = true;
    foe.ai.canAct = true;
    if (typeof foe.ai.resumeLive === 'function') foe.ai.resumeLive();
  }
  foe.companion = `adv:${comp.name}`;
  foe.allied = true;
  foe.shipmate = true;
  foe.livingRole = 'recruited_companion';
  foe._advRecord = comp;
  foe.lootDropped = true;
  foe._suppressLoot = true;
  return foe;
}

/**
 * Ensures a persistent per-actor dialog state on `foeRecord._advDialog` (or creates a standalone state).
 * @param {any} foeRecord
 * @param {any} defaults
 */
export function ensureAdventurerDialogState(foeRecord, defaults = {}) {
  const existing = foeRecord?._advDialog;
  if (existing) {
    if (foeRecord?._surrenderedSpar) {
      existing.used = existing.used ?? {};
      existing.used.wager = true;
      existing.talkedOnce = true;
      if (!existing.sparOutcome) {
        existing.sparOutcome = foeRecord._lastSparOutcome ?? 'PLAYER_WON';
      }
    }
    return existing;
  }
  const surrendered = Boolean(foeRecord?._surrenderedSpar);
  const state = {
    kind: defaults.kind ?? 'ADVENTURER_MEETING',
    adv: defaults.adv ?? foeRecord?._advRecord ?? null,
    situation: defaults.situation ?? ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
    tension: defaults.tension ?? null,
    wager: defaults.wager ?? 50,
    intercepted: defaults.intercepted ?? null,
    locationId: defaults.locationId ?? null,
    regionIndex: defaults.regionIndex ?? 0,
    used: {
      wager: surrendered,
      intel: false,
      extort: false,
      etiquette: false,
      intimidate: false,
      ...(defaults.used ?? {}),
    },
    sparOutcome: surrendered ? (foeRecord?._lastSparOutcome ?? 'PLAYER_WON') : (defaults.sparOutcome ?? null),
    extorted: Boolean(defaults.extorted),
    talkedOnce: Boolean(defaults.talkedOnce ?? surrendered),
  };
  if (foeRecord) foeRecord._advDialog = state;
  return state;
}

function numberChoiceOptions(rawOptions) {
  return rawOptions.map((opt, idx) => ({
    code: `Digit${idx + 1}`,
    label: `${idx + 1}. ${opt.labelText}`,
    action: opt.action,
  }));
}

function adventurerDialogHeader(adv, state, initialLines) {
  if (!state.talkedOnce) {
    state.talkedOnce = true;
    return initialLines;
  }
  const tag = `${adv.name} (${adv.className || 'Warrior'}, Lv.${adv.level || 1})`;
  if (state.sparOutcome === 'PLAYER_WON') {
    return [`${tag}: "${LIVING_WORDS.adventurerReTalkAfterWin()}"`];
  }
  if (state.sparOutcome === 'PLAYER_LOST') {
    return [`${tag}: "${LIVING_WORDS.adventurerReTalkAfterLoss()}"`];
  }
  return [`${tag}: "${LIVING_WORDS.adventurerReTalkPeaceful()}"`];
}

/**
 * Builds the 1 / 3 / 7-day adventurer hire submenu (and replacement confirmation
 * submenu when another active companion is already under contract).
 */
export function buildAdventurerHireSubmenuSpec({
  adv,
  playerEntity,
  regionIndex = 0,
  nowMinutes = 0,
  situation = ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
  openChoice = null,
  say = () => {},
  playSound = null,
  onHired = null,
  rng = Math.random,
}) {
  const q1 = calculateAdventurerHireQuote(adv, playerEntity, { days: 1, regionIndex, nowMinutes });
  const existing = getActiveAdventurerCompanion(nowMinutes);
  const isSameCompanion = Boolean(existing && adv?.id != null && String(existing.id) === String(adv.id));
  const isReplacing = Boolean(existing && !isSameCompanion);
  const remainingHours = isReplacing
    ? Math.max(1, Math.ceil(getCompanionRemainingMinutes(existing, nowMinutes) / 60))
    : 0;

  const lines = [
    LIVING_WORDS.roadAdvHireTitle(
      adv.name,
      adv.className || 'Warrior',
      adv.level || 1,
      q1.dailyCost,
      q1.baseDaily,
    ),
  ];
  if (q1.isMerchantsFestival) lines.push(LIVING_WORDS.roadAdvHireTagFestival());
  if (q1.isWartime) lines.push(LIVING_WORDS.roadAdvHireTagWartime());
  if (isReplacing) lines.push(LIVING_WORDS.roadAdvReplaceWarn(existing.displayName || existing.name, remainingHours));

  const executeHire = (days, quote) => {
    const res = resolveWanderingAdventurerInteraction({
      adv,
      situation,
      playerEntity,
      action: 'RECRUIT_ALLY',
      days,
      regionIndex,
      nowMinutes,
      rng,
    });
    if (res.allied) {
      const comp = res.companion || getActiveAdventurerCompanion(nowMinutes);
      playSound?.(LIVING_SOUNDS.GOLD_COINS);
      onHired?.(comp, res);
      if (isSameCompanion) {
        say(LIVING_WORDS.roadAdvCompExtended(comp?.name || adv.name, days, res.hireCost || quote.totalCost), 5);
      } else {
        say(LIVING_WORDS.roadAdvRecruited(adv.name), 5);
      }
    } else if (res.maxDuration) {
      say(LIVING_WORDS.roadAdvCompMaxDays(res.maxDays || MAX_COMPANION_CONTRACT_DAYS), 5);
    } else if (res.goldShortage) {
      say(LIVING_WORDS.roadAdvNoGold(res.hireCost || quote.totalCost), 5);
    } else {
      say(LIVING_WORDS.roadAdvDeclined(), 5);
    }
  };

  const options = COMPANION_CONTRACT_OPTIONS_DAYS.map((days, idx) => {
    const quote = calculateAdventurerHireQuote(adv, playerEntity, { days, regionIndex, nowMinutes });
    return {
      code: `Digit${idx + 1}`,
      label: `${idx + 1}. ${LIVING_WORDS.roadAdvHireDays(days, quote.totalCost)}`,
      action: () => {
        if (isReplacing && typeof openChoice === 'function') {
          // ChoiceWindow wraps opt.action() in captureHudText — never call say() before openChoice().
          openChoice({
            lines: [
              LIVING_WORDS.roadAdvReplaceWarn(existing.displayName || existing.name, remainingHours),
              ...(q1.isMerchantsFestival ? [LIVING_WORDS.roadAdvHireTagFestival()] : []),
              ...(q1.isWartime ? [LIVING_WORDS.roadAdvHireTagWartime()] : []),
            ],
            options: [
              {
                code: 'Digit1',
                label: `1. ${LIVING_WORDS.roadAdvReplaceConfirm(existing.displayName || existing.name, adv.name, days, quote.totalCost)}`,
                action: () => executeHire(days, quote),
              },
              {
                code: 'Digit2',
                label: `2. ${LIVING_WORDS.roadAdvOptCancel()}`,
                action: () => {},
              },
            ],
          });
          return;
        }
        executeHire(days, quote);
      },
    };
  });

  options.push({
    code: `Digit${COMPANION_CONTRACT_OPTIONS_DAYS.length + 1}`,
    label: `${COMPANION_CONTRACT_OPTIONS_DAYS.length + 1}. ${LIVING_WORDS.roadAdvOptCancel()}`,
    action: () => {},
  });

  return { lines, options };
}

/**
 * Builds the interactive status / extension (+1d/+3d) / dismissal dialog
 * when activating a currently recruited adventurer companion.
 */
export function buildRecruitedCompanionChoiceSpec({
  comp,
  playerEntity,
  regionIndex = 0,
  nowMinutes = 0,
  say = () => {},
  playSound = null,
  onExtended = null,
  onDismissed = null,
}) {
  const q1 = calculateAdventurerHireQuote(comp, playerEntity, { days: 1, regionIndex, nowMinutes });
  const q3 = calculateAdventurerHireQuote(comp, playerEntity, { days: 3, regionIndex, nowMinutes });
  const remMin = getCompanionRemainingMinutes(comp, nowMinutes);
  const remainingHours = Math.max(1, Math.ceil(remMin / 60));
  const lines = [
    LIVING_WORDS.roadAdvCompStatus(
      comp.displayName || comp.name,
      comp.className || 'Warrior',
      comp.level || 1,
      remainingHours,
      q1.dailyCost,
    ),
  ];
  if (q1.isMerchantsFestival) lines.push(LIVING_WORDS.roadAdvHireTagFestival());
  if (q1.isWartime) lines.push(LIVING_WORDS.roadAdvHireTagWartime());

  const tryExtend = (days, quote) => {
    const res = extendAdventurerCompanion({ playerEntity, days, regionIndex, nowMinutes });
    if (res.ok) {
      playSound?.(LIVING_SOUNDS.GOLD_COINS);
      onExtended?.(res.companion, res);
      say(LIVING_WORDS.roadAdvCompExtended(comp.name, days, res.hireCost || quote.totalCost), 5);
    } else if (res.reason === 'max_duration') {
      say(LIVING_WORDS.roadAdvCompMaxDays(res.maxDays || MAX_COMPANION_CONTRACT_DAYS), 5);
    } else if (res.reason === 'gold_shortage') {
      say(LIVING_WORDS.roadAdvNoGold(res.hireCost || quote.totalCost), 5);
    }
  };

  return {
    lines,
    options: [
      {
        code: 'Digit1',
        label: `1. ${LIVING_WORDS.roadAdvCompExtend(1, q1.totalCost)}`,
        action: () => tryExtend(1, q1),
      },
      {
        code: 'Digit2',
        label: `2. ${LIVING_WORDS.roadAdvCompExtend(3, q3.totalCost)}`,
        action: () => tryExtend(3, q3),
      },
      {
        code: 'Digit3',
        label: `3. ${LIVING_WORDS.roadAdvCompDismiss()}`,
        action: () => {
          dismissAdventurerCompanion();
          onDismissed?.(comp);
          say(LIVING_WORDS.roadAdvCompDismissed(comp.name), 5);
        },
      },
      {
        code: 'Digit4',
        label: `4. ${LIVING_WORDS.roadAdvOptCancel()}`,
        action: () => {},
      },
    ],
  };
}

/**
 * Resolves a stable cooldown key for a settlement. Multi-slice capitals share one `cap_<k>` key
 * across all slices so urban events don't re-trigger on every district crossing.
 */
export function resolveLocationEventKey(loc, regIdx, pPixel = null, feet = null) {
  if (loc?.capital && Number.isInteger(loc.capital.k)) {
    return `cap_${loc.capital.k}`;
  }
  if (loc?.mapTableData?.mapId != null) {
    const capK = capitalIndexOfId(loc.mapTableData.mapId);
    if (capK >= 0) return `cap_${capK}`;
    return `map_${loc.mapTableData.mapId}`;
  }
  if (loc?.name) return `${regIdx}:${loc.name}`;
  if (pPixel) return `${regIdx}:${pPixel.x},${pPixel.y}`;
  const fx = feet ? Math.round(feet[0] / 100) : 0;
  const fz = feet ? Math.round(feet[2] / 100) : 0;
  return `${regIdx}:${fx}:${fz}`;
}

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
  let lastQuarantineRegion = -1;
  let companionFoe = /** @type {any} */ (null);
  let companionId = /** @type {number|string|null} */ (null);
  let companionDisplayName = 'Adventurer';
  let companionSpawning = false;

  function dismissCompanionBody() {
    const old = companionFoe;
    const wasActive = Boolean(old || companionId !== null);
    companionFoe = null;
    companionId = null;
    companionDisplayName = 'Adventurer';
    if (old && deps.inPool(old)) {
      try {
        deps.remove(old);
      } catch (_e) {}
    }
    if (wasActive) deps.onCompanionChanged?.(null);
  }

  function adoptSiteCompanion(site, role, comp, candidateFoe = null) {
    if (!comp) return;
    const candidate =
      candidateFoe ||
      site?.foes?.find?.((f) => f?.livingRole === role || f?.livingRole === 'recruited_companion') ||
      null;
    if (companionFoe && companionFoe !== candidate) {
      const old = companionFoe;
      companionFoe = null;
      if (deps.inPool(old)) {
        try {
          deps.remove(old);
        } catch (_e) {}
      }
    }
    if (candidate) {
      if (Array.isArray(site?.foes)) {
        site.foes = site.foes.filter((x) => x !== candidate);
      }
      applyCompanionEntityStamp(
        candidate,
        comp,
        () => deps.feet?.() ?? [candidate.ai?.feet?.[0] ?? 0, candidate.ai?.feet?.[1] ?? 0, candidate.ai?.feet?.[2] ?? 0],
      );
      companionFoe = candidate;
    }
    companionId = comp.id;
    companionDisplayName = comp.displayName || comp.name || 'Adventurer';
    deps.onCompanionChanged?.(comp);
  }

  function syncCompanion(feet, nowMin) {
    const comp = getActiveAdventurerCompanion(nowMin);
    if (!comp) {
      if (companionFoe && deps.inPool(companionFoe)) {
        const old = companionFoe;
        companionFoe = null;
        try {
          deps.remove(old);
        } catch (_e) {}
      }
      if (companionFoe || companionId !== null) {
        const expiredName = companionDisplayName || 'Adventurer';
        companionFoe = null;
        companionId = null;
        companionDisplayName = 'Adventurer';
        deps.onCompanionChanged?.(null);
        deps.say?.(
          LIVING_WORDS.roadAdvExpired
            ? LIVING_WORDS.roadAdvExpired(expiredName)
            : `${expiredName}'s contract has expired. They bid you farewell and return to the road.`,
          6,
        );
      }
      return;
    }

    if (companionFoe?.dead) {
      const fallenName = companionFoe.entity?.name || companionDisplayName || 'Adventurer';
      companionFoe = null;
      companionId = null;
      companionDisplayName = 'Adventurer';
      dismissAdventurerCompanion();
      deps.onCompanionChanged?.(null);
      deps.say?.(
        LIVING_WORDS.roadAdvCompFallen
          ? LIVING_WORDS.roadAdvCompFallen(fallenName)
          : `${fallenName} has fallen in battle.`,
        5,
      );
      return;
    }

    if (companionId !== comp.id) {
      if (companionFoe && deps.inPool(companionFoe) && String(companionFoe._advRecord?.id ?? companionId) !== String(comp.id)) {
        const old = companionFoe;
        companionFoe = null;
        try {
          deps.remove(old);
        } catch (_e) {}
      }
      companionId = comp.id;
      companionDisplayName = comp.displayName || comp.name || 'Adventurer';
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
          const latest = getActiveAdventurerCompanion(nowMin);
          if (!latest || String(latest.id) !== String(comp.id)) {
            try {
              if (deps.inPool(rec)) deps.remove(rec);
            } catch (_e) {}
            return;
          }
          applyCompanionEntityStamp(
            rec,
            comp,
            () => deps.feet?.() ?? [rec.ai?.feet?.[0] ?? 0, rec.ai?.feet?.[1] ?? 0, rec.ai?.feet?.[2] ?? 0],
          );
          companionFoe = rec;
          companionId = comp.id;
          companionDisplayName = comp.displayName || comp.name || 'Adventurer';
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

  /** @type {Map<number, number>} modelId -> cached minY in local mesh space */
  const modelMinYCache = new Map();

  function getCpuModel(modelId) {
    return deps.meshes?.cpuModels?.get?.(modelId) ?? gpuModels.get(modelId)?.cpu ?? null;
  }

  function meshGroundOffsetY(modelId) {
    if (modelMinYCache.has(modelId)) {
      const cached = modelMinYCache.get(modelId);
      return Number.isFinite(cached) && cached < 0 ? -cached : 0;
    }
    const entry = gpuModels.get(modelId);
    const gpuMinY = entry?.gpu?.bounds?.min?.[1];
    if (Number.isFinite(gpuMinY)) {
      modelMinYCache.set(modelId, gpuMinY);
      return gpuMinY < 0 ? -gpuMinY : 0;
    }
    const cpu = getCpuModel(modelId);
    if (cpu?.positions?.length >= 3) {
      let minY = Infinity;
      for (let i = 1; i < cpu.positions.length; i += 3) {
        if (cpu.positions[i] < minY) minY = cpu.positions[i];
      }
      if (Number.isFinite(minY)) {
        modelMinYCache.set(modelId, minY);
        return minY < 0 ? -minY : 0;
      }
    }
    return 0;
  }

  function clearSiteColliders(site) {
    if (!site || !deps.collider?.removeBucket) return;
    const count = Math.max(site._colliderCount || 0, site.blueprint?.meshes?.length || 0);
    for (let i = 0; i < count; i++) {
      try {
        deps.collider.removeBucket(`${site.campId}_mesh_${i}`);
      } catch (_e) {}
    }
    site._colliderCount = 0;
  }

  function syncSiteColliders(site) {
    if (!site?.blueprint?.meshes || !deps.collider?.addMesh) return;
    clearSiteColliders(site);
    for (let i = 0; i < site.blueprint.meshes.length; i++) {
      const m = site.blueprint.meshes[i];
      const cpu = getCpuModel(m.modelId);
      if (cpu?.positions && cpu.indices) {
        const bKey = `${site.campId}_mesh_${i}`;
        const yLift = meshGroundOffsetY(m.modelId);
        try {
          const mat = trs(m.feet[0], m.feet[1] + yLift, m.feet[2], 0, m.yawDeg, 0);
          deps.collider.addMesh(bKey, cpu.positions, cpu.indices, mat);
        } catch (_e) {}
      }
    }
    site._colliderCount = site.blueprint.meshes.length;
  }

  function destroySiteDestructibles(site) {
    if (!site?.blueprint) return false;
    const prevMeshes = site.blueprint.meshes?.length ?? 0;
    const prevFlats = site.blueprint.flats?.length ?? 0;
    clearSiteColliders(site);
    if (Array.isArray(site.blueprint.meshes)) {
      site.blueprint.meshes = site.blueprint.meshes.filter((m) => !m.destructible);
    }
    if (Array.isArray(site.blueprint.flats)) {
      site.blueprint.flats = site.blueprint.flats.filter((fl) => !fl.destructible);
    }
    if (site.batches?.length && deps.renderer?.destroyBillboardBatch) {
      for (const b of site.batches) {
        try {
          deps.renderer.destroyBillboardBatch(b);
        } catch (_e) {}
      }
    }
    site.batches = [];
    site._batchesDirty = true;
    syncSiteColliders(site);
    return (
      (site.blueprint.meshes?.length ?? 0) < prevMeshes ||
      (site.blueprint.flats?.length ?? 0) < prevFlats
    );
  }

  function ensureModel(modelId) {
    if (gpuModels.has(modelId)) {
      const entry = gpuModels.get(modelId);
      if (entry && !entry.cpu) {
        entry.cpu = deps.meshes?.cpuModels?.get?.(modelId) ?? null;
      }
      return;
    }
    if (loadingModels.has(modelId) || !deps.meshes?.getGpuMesh) return;
    loadingModels.add(modelId);
    Promise.resolve(deps.meshes.getGpuMesh(modelId))
      .then((gpu) => {
        const cpu = deps.meshes?.cpuModels?.get?.(modelId) ?? null;
        if (gpu) {
          gpuModels.set(modelId, { gpu, cpu });
          if (stood) syncSiteColliders(stood);
        }
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
        if (stood) stood._batchesDirty = true;
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
    clearSiteColliders(s);
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

  function closestLiveTarget(fromFeet, candidates) {
    if (!candidates || candidates.length === 0 || !fromFeet) return null;
    let best = null, bestDist = Infinity;
    for (const c of candidates) {
      if (!c || c.dead || !deps.inPool(c)) continue;
      const pos = c.ai?.feet ?? c.feet;
      if (!pos) continue;
      const d = Math.hypot(pos[0] - fromFeet[0], pos[2] - fromFeet[2]);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  function retargetSkirmishFoes(site) {
    if (!site || (site.kind !== LIVING_SITE_KINDS.URBAN_SKIRMISH && site.kind !== LIVING_SITE_KINDS.WAR_SKIRMISH)) return;
    const player = deps.playerEntity?.();
    const guards = site.foes.filter((f) => f?.livingRole === 'skirmish_guard' && !f.dead && deps.inPool(f));
    const rebels = site.foes.filter((f) => f?.livingRole === 'skirmish_rebel' && !f.dead && deps.inPool(f));

    if (site.skirmishStance === 'both_hostile') {
      for (const f of [...guards, ...rebels]) {
        if (f.entity) {
          f.entity.team = 'PlayerEnemy';
          f.entity.mobileTeam = 'PlayerEnemy';
          f.entity.skirmishNeutralToPlayer = false;
          f.entity.skirmishForceInfighting = true;
        }
        f.allied = false;
        f.shipmate = false;
        if (f.ai) {
          f.ai.isHostile = true;
          f.ai.detected = true;
          f.ai.target = player;
          f.ai.targetSenses = player;
        }
      }
      return;
    }

    if (site.skirmishStance === 'watch' || site.skirmishStance === 'defenders' || site.skirmishStance === 'bodyguard') {
      for (const g of guards) {
        if (g.entity) {
          g.entity.team = 'PlayerAlly';
          g.entity.mobileTeam = 'PlayerAlly';
          g.entity.skirmishNeutralToPlayer = true;
          g.entity.skirmishForceInfighting = true;
        }
        g.allied = true;
        g.shipmate = true;
        if (g.ai) {
          const cur = g.ai.target;
          const tgt = (!cur || cur.dead || !deps.inPool(cur) || cur === player)
            ? closestLiveTarget(g.ai.feet ?? g.feet, rebels)
            : cur;
          g.ai.target = tgt;
          g.ai.targetSenses = tgt;
          g.ai.isHostile = Boolean(tgt);
          g.ai.detected = Boolean(tgt);
        }
      }
      for (const r of rebels) {
        if (r.entity) {
          r.entity.team = 'PlayerEnemy';
          r.entity.mobileTeam = 'PlayerEnemy';
          r.entity.skirmishNeutralToPlayer = false;
          r.entity.skirmishForceInfighting = true;
        }
        r.allied = false;
        r.shipmate = false;
        if (r.ai) {
          r.ai.isHostile = true;
          r.ai.detected = true;
          const cur = r.ai.target;
          if (!cur || cur.dead || !deps.inPool(cur)) {
            const nearGuard = closestLiveTarget(r.ai.feet ?? r.feet, guards);
            const tgt = nearGuard || player;
            r.ai.target = tgt;
            r.ai.targetSenses = tgt;
          }
        }
      }
    } else if (site.skirmishStance === 'rebels') {
      for (const r of rebels) {
        if (r.entity) {
          r.entity.team = 'PlayerAlly';
          r.entity.mobileTeam = 'PlayerAlly';
          r.entity.skirmishNeutralToPlayer = true;
          r.entity.skirmishForceInfighting = true;
        }
        r.allied = true;
        r.shipmate = true;
        if (r.ai) {
          const cur = r.ai.target;
          const tgt = (!cur || cur.dead || !deps.inPool(cur) || cur === player)
            ? closestLiveTarget(r.ai.feet ?? r.feet, guards)
            : cur;
          r.ai.target = tgt;
          r.ai.targetSenses = tgt;
          r.ai.isHostile = Boolean(tgt);
          r.ai.detected = Boolean(tgt);
        }
      }
      for (const g of guards) {
        if (g.entity) {
          g.entity.team = 'PlayerEnemy';
          g.entity.mobileTeam = 'PlayerEnemy';
          g.entity.skirmishNeutralToPlayer = false;
          g.entity.skirmishForceInfighting = true;
        }
        g.allied = false;
        g.shipmate = false;
        if (g.ai) {
          g.ai.isHostile = true;
          g.ai.detected = true;
          const cur = g.ai.target;
          if (!cur || cur.dead || !deps.inPool(cur)) {
            const nearRebel = closestLiveTarget(g.ai.feet ?? g.feet, rebels);
            const tgt = nearRebel || player;
            g.ai.target = tgt;
            g.ai.targetSenses = tgt;
          }
        }
      }
    } else if (site.skirmishStance === 'peace') {
      site.orderRestored = true;
      for (const f of site.foes) {
        f.allied = false;
        f.shipmate = false;
        if (f.entity) {
          f.entity.team = 'SkirmishPeace';
          f.entity.mobileTeam = 'SkirmishPeace';
          f.entity.suppressInfighting = true;
          f.entity.skirmishNeutralToPlayer = true;
          f.entity.skirmishForceInfighting = false;
          f.entity.campId = site.campId ?? 'skirmish_peace';
        }
        f.campId = site.campId ?? 'skirmish_peace';
        if (f.ai) {
          f.ai.isHostile = false;
          f.ai.detected = false;
          f.ai.target = null;
          f.ai.secondaryTarget = null;
          f.ai.targetSenses = null;
          f.ai.giveUpTimer = 0;
          f.ai.idle = true;
        }
      }
    } else {
      for (const g of guards) {
        g.allied = false;
        g.shipmate = false;
        if (g.entity) {
          g.entity.team = site.kind === LIVING_SITE_KINDS.WAR_SKIRMISH ? 'WarSideA' : 'CityWatch';
          g.entity.mobileTeam = g.entity.team;
          g.entity.skirmishNeutralToPlayer = true;
          g.entity.skirmishForceInfighting = true;
        }
        if (g.ai) {
          const tgt = closestLiveTarget(g.ai.feet ?? g.feet, rebels);
          g.ai.isHostile = Boolean(tgt);
          g.ai.detected = Boolean(tgt);
          const cur = g.ai.target;
          if (!cur || cur.dead || !deps.inPool(cur) || cur === player) {
            g.ai.target = tgt;
            g.ai.targetSenses = tgt;
          }
        }
      }
      for (const r of rebels) {
        r.allied = false;
        r.shipmate = false;
        if (r.entity) {
          r.entity.team = site.kind === LIVING_SITE_KINDS.WAR_SKIRMISH ? 'WarSideB' : 'PlayerEnemy';
          r.entity.mobileTeam = r.entity.team;
          r.entity.skirmishNeutralToPlayer = true;
          r.entity.skirmishForceInfighting = true;
        }
        if (r.ai) {
          const tgt = closestLiveTarget(r.ai.feet ?? r.feet, guards);
          r.ai.isHostile = Boolean(tgt);
          r.ai.detected = Boolean(tgt);
          const cur = r.ai.target;
          if (!cur || cur.dead || !deps.inPool(cur) || cur === player) {
            r.ai.target = tgt;
            r.ai.targetSenses = tgt;
          }
        }
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
      const isKnight = Boolean(
        player?.guildMemberships?.[10]?.rank > 0 ||
        player?.guilds?.[10]?.rank > 0 ||
        player?.guilds?.KnightlyOrder?.rank > 0
      );
      const insp = evaluateCheckpointInspection(player, isKnight);
      if (hasRegionalCheckpointPass(regIdx, nowMin) && !contractOffer && !insp.demandInspection) {
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
        {
          code: 'Digit5',
          label: `5. ${LIVING_WORDS.surrenderOptionSubmitGuard(Math.max(50, Math.floor(tollGold * 1.5)))}`,
          action: () => {
            const res = resolveCheckpointInteraction({
              playerEntity: player,
              method: 'surrender',
              tollGoldRequired: tollGold,
              regionIndex: regIdx,
              nowMinutes: nowMin,
              rng,
            });
            deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
            deps.say(res.message, 5);
          },
        },
      ];
      if (contractOffer) {
        options.push({
          code: 'Digit6',
          label: `6. ${LIVING_WORDS.crisisContractOptionAccept(contractOffer.title, contractOffer.rewardGold)}`,
          action: () => {
            const accepted = acceptRegionalCrisisContract(regIdx, Number(player?.level ?? 1), nowMin);
            if (accepted) {
              deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
              deps.say(LIVING_WORDS.crisisContractAccepted(accepted.title), 6);
            }
          },
        });
      }
      if (insp.demandInspection) {
        const idx = options.length + 1;
        options.push({
          code: `Digit${idx}`,
          label: `${idx}. Submit pack to contraband inspection`,
          action: () => {
            const res = resolveCheckpointInteraction({
              playerEntity: player,
              method: 'submit_inspection',
              tollGoldRequired: tollGold,
              regionIndex: regIdx,
              nowMinutes: nowMin,
              rng,
            });
            if (res.finePaid > 0) deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
            if (res.outcome === CHECKPOINT_OUTCOME.HOSTILE || res.outcome === CHECKPOINT_OUTCOME.REFUSED) {
              setSiteHostile(s, true);
            }
            deps.say(res.message, 6);
          },
        });
      }
      const promptLines = [
        `${LIVING_WORDS.checkpointSpeaker()}: "${LIVING_WORDS.checkpointHalt()}"`,
        `${LIVING_WORDS.checkpointTollLabel()}: ${LIVING_WORDS.checkpointTollDemand(tollGold)}`,
      ];
      if (insp.demandInspection) {
        promptLines.push('The guard captain eyes your Underworld associates and demands a contraband baggage inspection.');
      }
      deps.openChoice({
        lines: promptLines,
        options,
      });
    } else if (s.kind === LIVING_SITE_KINDS.NEMESIS_AMBUSH) {
      deps.playSound?.(LIVING_SOUNDS.DRAW_WEAPON);
      const nemesis = s.blueprint.meta?.nemesis;
      if (!nemesis) return;
      deps.openChoice({
        lines: [
          `${nemesis.name} (${nemesis.factionName ? `${nemesis.factionName} — ` : ''}${nemesis.archetype || LIVING_WORDS.nemesisBountyHunter()}): "${LIVING_WORDS.nemesisMotive(nemesis.archetype)}"`,
          LIVING_WORDS.nemesisDemands(),
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
                if (res.resolution === NEMESIS_RESOLUTION.PACIFIED && player) recordNemesisDefeated(player);
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
                if (res.resolution === NEMESIS_RESOLUTION.INTIMIDATED && player) recordNemesisDefeated(player);
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
          {
            code: 'Digit5',
            label: `5. [Yield] Buy out contract in full (${Math.max(150, Number(nemesis.contractBounty || 250))}g)`,
            action: () => {
              const bounty = Math.max(150, Number(nemesis.contractBounty || 250));
              const haveGold = Number(player?.goldPieces ?? 0);
              if (haveGold >= bounty && player) {
                player.goldPieces = Math.max(0, haveGold - bounty);
                clearNemesisGrudge();
                deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
                deps.say(`${nemesis.name} accepts your gold: "Your debt is settled. Pray our paths do not cross again."`, 6);
                releaseSite();
              } else {
                setSiteHostile(s, true);
                deps.say(`${nemesis.name} sneers at your empty purse: "You cannot afford your own life! Die, cur!"`, 5);
              }
            },
          },
        ],
      });
    } else if (s.kind === LIVING_SITE_KINDS.ADVENTURER_MEETING) {
      const adv = s.blueprint.meta?.adv;
      const tension = s.blueprint.meta?.tension;
      if (!adv) return;
      const foe = s.foes.find((f) => f?.livingRole === 'rival_adventurer' || f?.livingRole === 'wandering_adventurer') ?? null;
      const spec = buildAdventurerMeetingChoiceSpec({
        adv,
        tension,
        playerEntity: player,
        foeRecord: foe,
        regionIndex: regIdx,
        nowMinutes: nowMin,
        openChoice: deps.openChoice,
        playSound: deps.playSound,
        say: deps.say,
        onHostile: () => setSiteHostile(s, true),
        onPeaceful: () => setSiteHostile(s, false),
        onForfeit: () => releaseSite(),
        onHired: (comp) => adoptSiteCompanion(s, 'rival_adventurer', comp, foe),
        rng,
      });
      if (spec) {
        deps.openChoice(spec);
      } else {
        deps.say(LIVING_WORDS.adventurerSettledCold(adv.name), 5);
      }
    } else if (s.kind === LIVING_SITE_KINDS.TRAVELER_REST) {
      const merchantActor = s.foes.find((f) => f?.livingRole === 'traveler');
      const lines = [
        LIVING_WORDS.travelerRestTitle(),
        LIVING_WORDS.travelerRestDesc(),
        LIVING_WORDS.travelerRestWelcome(),
      ];
      const options = [
        {
          code: 'Digit1',
          label: LIVING_WORDS.travelerRestOptBuy(),
          action: () => {
            deps.say?.(LIVING_WORDS.travelerRestBuySay(), 4);
            if (merchantActor && deps.openLivingActor) {
              deps.openLivingActor(merchantActor, 'Buy');
            }
          },
        },
        {
          code: 'Digit2',
          label: LIVING_WORDS.travelerRestOptSell(),
          action: () => {
            deps.say?.(LIVING_WORDS.travelerRestSellSay(), 4);
            if (merchantActor && deps.openLivingActor) {
              deps.openLivingActor(merchantActor, 'Sell');
            }
          },
        },
        {
          code: 'Digit3',
          label: LIVING_WORDS.travelerRestOptRest(),
          action: () => {
            if (player) {
              player.health = Math.min(Number(player.maxHealth ?? player.health), Number(player.health) + 35);
              player.fatigue = Math.min(Number(player.maxFatigue ?? player.fatigue), Number(player.fatigue) + 100);
            }
            deps.say?.(LIVING_WORDS.travelerRestRestSay(), 6);
          },
        },
        {
          code: 'Digit4',
          label: LIVING_WORDS.travelerRestOptDepart(),
          action: () => {
            deps.say?.(LIVING_WORDS.travelerRestDepartSay(), 4);
          },
        },
        {
          code: 'Digit5',
          label: LIVING_WORDS.travelerRestOptRob(),
          action: () => {
            setSiteHostile(s, true);
            deps.say?.(LIVING_WORDS.travelerRestRobSay(), 5);
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
      const markPleaHostile = (rec) => {
        if (!rec) return;
        rec.allied = false;
        rec.shipmate = false;
        if (rec.entity) {
          rec.entity.team = 'PlayerEnemy';
          rec.entity.mobileTeam = 'PlayerEnemy';
          rec.entity.suppressInfighting = true;
          rec.entity.skirmishNeutralToPlayer = false;
          rec.entity.skirmishForceInfighting = false;
        }
        if (rec.ai) {
          rec.ai.isHostile = true;
          rec.ai.detected = true;
          rec.ai.idle = false;
          const targetPlayer = deps.playerEntity();
          rec.ai.target = targetPlayer;
          rec.ai.targetSenses = targetPlayer;
        }
      };

      const pleaOptions = [
        {
          code: 'Digit1',
          label: `1. ${s.kind === LIVING_SITE_KINDS.PLEA_ENCOUNTER ? LIVING_WORDS.pleaOptionHelpFor(plea.type, reqGold) : LIVING_WORDS.pleaOptionHelp(reqGold)}`,
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
              if (res.grantHealingPotion && Array.isArray(player.items)) {
                const healRec = POTION_RECIPES.find((r) => r.name === 'healing');
                if (healRec) {
                  addItem(player.items, makePotion(potionRecipeKey(healRec.ingredients)));
                }
              }
              if (res.bonusXp > 0) {
                tallySkill(
                  player,
                  plea.type === PLEA_TYPE.ACCUSED_URCHIN ? SKILLS.Streetwise : SKILLS.Etiquette,
                  2,
                );
              }
              if (plea.type === PLEA_TYPE.BROKEN_CART_MERCHANT || plea.type === PLEA_TYPE.ACCUSED_URCHIN) {
                const loc = deps.locationRecord?.() ?? null;
                applyTownProsperityDelta(loc?.mapTableData?.mapId, loc?.name, 1, nowMin, deps.say);
              }
            }
            if (res.grantHealingPotion && res.outcome === PLEA_OUTCOME.HELPED) {
              deps.say(LIVING_WORDS.pleaMerchantPotionSay(), 5);
            } else if (res.fullRestore && res.outcome === PLEA_OUTCOME.HELPED) {
              deps.say(LIVING_WORDS.pleaPreacherBlessSay(), 5);
            } else {
              deps.say(LIVING_WORDS.pleaOutcome(res.outcome), 5);
            }
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
          label: `3. ${s.kind === LIVING_SITE_KINDS.PLEA_ENCOUNTER ? LIVING_WORDS.pleaOptionProvokeFor(plea.type) : LIVING_WORDS.pleaOptionRude()}`,
          action: () => {
            const res = resolvePleaResponse({
              plea,
              playerEntity: player,
              regionIndex: regIdx,
              response: 'REFUSE_RUDE',
              nowMinutes: nowMin,
              rng,
            });
            const scale = getLivingEncounterScale();
            if (s.kind === LIVING_SITE_KINDS.PLEA_ENCOUNTER && res.provoked) {
              s.hostile = true;
              for (const existingFoe of s.foes) {
                markPleaHostile(existingFoe);
              }
              if (res.spawnBackup) {
                const backupPool = s.blueprint.meta?.pleaBackupPool ?? [MOBILE_TYPES.Warrior];
                const backupCount =
                  scale === LIVING_ENCOUNTER_SCALE.LOW
                    ? 1
                    : scale === LIVING_ENCOUNTER_SCALE.MID
                      ? rollEncounterRange(1, 2, rng)
                      : rollEncounterRange(2, 3, rng);
                for (let m = 0; m < backupCount; m++) {
                  const angle = (m / Math.max(1, backupCount)) * Math.PI * 2;
                  const dist = 2.0 + (m % 2) * 1.1;
                  const mx = s.blueprint.center[0] + Math.cos(angle) * dist;
                  const mz = s.blueprint.center[2] + Math.sin(angle) * dist;
                  const my = snapPropToGround(deps.heightAt, mx, mz);
                  const mobType = backupPool[m % backupPool.length];
                  Promise.resolve(
                    deps.spawn(mobType, [mx, my, mz], {
                      yaw: Math.atan2(s.blueprint.center[0] - mx, s.blueprint.center[2] - mz),
                      level: Math.max(1, Number(player?.level ?? 1)),
                      allied: false,
                      loose: true,
                      transient: true,
                      managed: true,
                    }),
                  )
                    .then((rec) => {
                      if (!rec) return;
                      if (stood !== s) {
                        if (deps.inPool(rec)) deps.remove(rec);
                        return;
                      }
                      rec.livingSiteKind = LIVING_SITE_KINDS.PLEA_ENCOUNTER;
                      if (rec.entity) {
                        rec.entity.name = 'Street Companion';
                      }
                      markPleaHostile(rec);
                      s.foes.push(rec);
                    })
                    .catch(() => {});
                }
              }
              deps.playSound?.(LIVING_SOUNDS.DRAW_WEAPON);
              deps.say(LIVING_WORDS.pleaProvokedSay(), 5);
            } else if (res.spawnMugger) {
              let muggerCount = 1;
              if (scale === LIVING_ENCOUNTER_SCALE.LOW) muggerCount = 1;
              else if (scale === LIVING_ENCOUNTER_SCALE.MID) muggerCount = rollEncounterRange(2, 3, rng);
              else if (scale === LIVING_ENCOUNTER_SCALE.HIGH) muggerCount = rollEncounterRange(4, 6, rng);

              for (let m = 0; m < muggerCount; m++) {
                const angle = (m / muggerCount) * Math.PI * 2;
                const dist = 2.0 + (m % 2) * 1.2;
                const mx = s.blueprint.center[0] + Math.cos(angle) * dist;
                const mz = s.blueprint.center[2] + Math.sin(angle) * dist;
                const my = snapPropToGround(deps.heightAt, mx, mz);
                Promise.resolve(
                  deps.spawn(MOBILE_TYPES.Rogue, [mx, my, mz], {
                    yaw: Math.atan2(s.blueprint.center[0] - mx, s.blueprint.center[2] - mz),
                    level: Math.max(1, Number(player?.level ?? 1)),
                    allied: false,
                    loose: true,
                    transient: true,
                    managed: true,
                  }),
                )
                  .then((rec) => {
                    if (!rec) return;
                    if (rec.entity) {
                      rec.entity.name = m === 0 ? 'Desperate Cutpurse' : 'Ambush Cutthroat';
                      rec.entity.team = 'Criminals';
                    }
                    if (rec.ai) {
                      rec.ai.isHostile = true;
                      rec.ai.target = deps.playerEntity();
                    }
                    s.foes.push(rec);
                  })
                  .catch(() => {});
              }
              deps.say(LIVING_WORDS.pleaOutcome(res.outcome), 5);
            } else {
              deps.say(LIVING_WORDS.pleaOutcome(res.outcome), 5);
            }
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
      const speakerTitle = LIVING_WORDS.speakerTitle(
        s.kind === LIVING_SITE_KINDS.QUARANTINE_TENT ? 'HEALER' : plea.type,
      );
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
      const foe = s.foes.find((f) => f?.livingRole === 'wandering_adventurer' || f?.livingRole === 'rival_adventurer') ?? null;
      const spec = buildWanderingAdventurerChoiceSpec({
        adv,
        situation,
        playerEntity: player,
        foeRecord: foe,
        regionIndex: regIdx,
        nowMinutes: nowMin,
        openChoice: deps.openChoice,
        playSound: deps.playSound,
        say: deps.say,
        resolveRegionDungeon: deps.resolveRegionDungeon,
        discoverDungeon: deps.discoverDungeon,
        addNote: deps.addNote,
        surfacePlayer: deps.surfacePlayer,
        onHostile: () => {
          for (const f of s.foes) {
            if (f?.livingRole === 'wandering_adventurer' && f.ai) {
              f.ai.isHostile = true;
              f.ai.detected = true;
            }
          }
        },
        onHired: (comp) => adoptSiteCompanion(s, 'wandering_adventurer', comp, foe),
        rng,
      });
      if (spec) {
        deps.openChoice(spec);
      } else if (foe?._advDialog?.extorted) {
        deps.say(LIVING_WORDS.roadAdvExtortedCold(adv.name), 5);
      } else {
        deps.say(LIVING_WORDS.adventurerSettledCold(adv.name), 5);
      }
    } else if (s.kind === LIVING_SITE_KINDS.BANDIT_CAMP && s.blueprint.meta?.ambushDetectedByStealth) {
      const ransomCalc = calculateSurrenderRansom(player, Number(player?.level ?? 1));
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
          {
            code: 'Digit3',
            label: `3. ${LIVING_WORDS.surrenderOptionPurse(ransomCalc.ransomGold)}`,
            action: () => {
              const res = resolveLivingSurrender({ playerEntity: player, threatLevel: Number(player?.level ?? 1) });
              recordSurrenderResolution({
                actor: 'player',
                target: 'wandering_foes',
                outcome: res.outcome,
                accepted: true,
                healthRemaining: res.healthRemaining,
                fatigueRemaining: res.fatigueRemaining,
                goldTaken: res.goldTaken ?? 0,
              });
              if (res.outcome === SURRENDER_OUTCOME.BEATEN_PAUPER) {
                deps.say(LIVING_WORDS.surrenderOutcomeBeaten(), 5);
                const lostHp = Math.max(0, (player?.maxHealth ?? 50) - res.healthRemaining);
                const lostFatigue = Math.max(0, (player?.maxFatigue ?? 100) - (res.fatigueRemaining ?? 0));
                deps.say(LIVING_WORDS.surrenderBeatenDetails(lostHp, lostFatigue), 5);
              } else {
                deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
                deps.say(LIVING_WORDS.surrenderOutcomeRobbed(), 5);
                deps.say(LIVING_WORDS.surrenderRobbedDetails(res.goldTaken), 5);
              }
              releaseSite();
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

            if (checkRes.goldShortage) {
              deps.say(LIVING_WORDS.roadAdvNoGold(checkRes.goldCost), 5);
              s.skirmishStance = 'chaos';
              retargetSkirmishFoes(s);
              return;
            }

            if (checkRes.hasSkillCheck) {
              const score = checkRes.rollResult?.totalScore ?? 50;
              const dc = checkRes.rollResult?.targetScore ?? c.skillCheck?.target ?? 50;
              if (!checkRes.passed) {
                if (checkRes.hostileToPlayer) {
                  s.skirmishStance = 'both_hostile';
                  retargetSkirmishFoes(s);
                  deps.say(LIVING_WORDS.rollCriticalFailure(score, dc), 5);
                } else {
                  s.skirmishStance = 'chaos';
                  retargetSkirmishFoes(s);
                  deps.say(LIVING_WORDS.rollFailure(score, dc), 5);
                }
                return;
              }

              if (checkRes.degree === LIVING_ROLL_DEGREE.TRIUMPH) {
                deps.say(LIVING_WORDS.rollTriumph(score, dc), 5);
              } else if (checkRes.degree === LIVING_ROLL_DEGREE.PARTIAL) {
                if (player && typeof player.fatigue === 'number') {
                  player.fatigue = Math.max(1, player.fatigue - checkRes.fatigueCost);
                }
                deps.say(LIVING_WORDS.rollPartial(score, dc), 5);
                if (checkRes.fatigueCost > 0) {
                  deps.say(LIVING_WORDS.notifyFatigueLost(checkRes.fatigueCost), 4);
                }
              } else {
                deps.say(LIVING_WORDS.rollSuccess(score, dc), 5);
              }
            }

            if (checkRes.goldCost > 0 && player) {
              player.goldPieces = Math.max(0, (player.goldPieces ?? 0) - checkRes.goldCost);
              deps.say(LIVING_WORDS.notifyGoldSpent(checkRes.goldCost), 4);
            }
            if (checkRes.goldReward > 0 && player) {
              player.goldPieces = (player.goldPieces ?? 0) + checkRes.goldReward;
              deps.say(LIVING_WORDS.notifyGoldGained(checkRes.goldReward), 4);
            }

            const repOutcome = player
              ? applySkirmishReputationOutcome(player, {
                eventId: evt?.id,
                regionIndex: regIdx,
                enemyRegionIndex: s.blueprint?.meta?.enemyRegionIndex ?? null,
                repF1Delta: checkRes.repF1Delta || 0,
                repF2Delta: checkRes.repF2Delta || 0,
              })
              : { applied: [], netLocalLegalDelta: 0 };
            for (const entry of repOutcome.applied) {
              if (entry.delta > 0) {
                deps.say(LIVING_WORDS.notifyRepGained(entry.label, entry.delta), 4);
              } else if (entry.delta < 0) {
                deps.say(LIVING_WORDS.notifyRepLost(entry.label, entry.delta), 4);
              }
            }

            const totalAppliedRep = repOutcome.applied.reduce((sum, entry) => sum + entry.delta, 0);
            recordCrisisChoiceResolution({
              regionIndex: regIdx,
              crisisType: s.blueprint?.meta?.crisisType || 'SKIRMISH',
              eventId: evt?.id || 'URBAN_SKIRMISH',
              choiceIndex: idx,
              choiceLabel: c.text,
              predicted: {
                gold: (c.goldReward ?? 0) - (c.goldCost ?? 0),
                rep: totalAppliedRep,
                fatigue: c.fatigueCost ?? 0,
                xp: 0,
              },
              applied: {
                goldDelta: (checkRes.goldReward || 0) - (checkRes.goldCost || 0),
                repDelta: totalAppliedRep,
                fatigueDelta: -(checkRes.fatigueCost || 0),
                xpGained: 0,
              },
            });

            if (c.stance === 'defenders' || c.stance === 'bodyguard') {
              s.skirmishStance = 'watch';
              retargetSkirmishFoes(s);
              applyPlayerCrisisImpact(regIdx, {
                stance: 'defenders',
                degree: checkRes.degree || 'SUCCESS',
                category: evt?.category || 'WAR',
                playerEntity: player,
                rolls: rng,
              });
              deps.say(LIVING_WORDS.eventJoinedF1(f1Name), 5);
              const loc = deps.locationRecord?.() ?? null;
              applyTownProsperityDelta(loc?.mapTableData?.mapId, loc?.name, checkRes.degree === 'TRIUMPH' ? 2 : 1, nowMin, deps.say);
            } else if (c.stance === 'attackers') {
              s.skirmishStance = 'rebels';
              retargetSkirmishFoes(s);
              applyPlayerCrisisImpact(regIdx, {
                stance: 'attackers',
                degree: checkRes.degree || 'SUCCESS',
                category: evt?.category || 'WAR',
                playerEntity: player,
                rolls: rng,
              });
              if (evt?.id === 'EVT_NEW_RULER_STATUE_UNVEILING') {
                destroySiteDestructibles(s);
                deps.playSound?.(LIVING_SOUNDS.DRAW_WEAPON);
                deps.say(LIVING_WORDS.skirmishStatueToppled(), 5);
              } else if (evt?.id === 'EVT_PLAGUE_WATER_WELL_SCARE') {
                destroySiteDestructibles(s);
                deps.playSound?.(LIVING_SOUNDS.DRAW_WEAPON);
                deps.say(LIVING_WORDS.skirmishWellSmashed(), 5);
              } else {
                deps.say(LIVING_WORDS.eventJoinedF2(f2Name), 5);
              }
              const loc = deps.locationRecord?.() ?? null;
              const ecoHurts =
                evt?.id === 'EVT_FAMINE_BARN_RAID' ||
                evt?.id === 'EVT_CRIME_DAYLIGHT_HEIST' ||
                evt?.id === 'EVT_WAR_DESERTERS_SHAKEDOWN' ||
                evt?.id === 'EVT_PLAGUE_WATER_WELL_SCARE' ||
                evt?.id === 'EVT_NEW_RULER_STATUE_UNVEILING';
              applyTownProsperityDelta(loc?.mapTableData?.mapId, loc?.name, ecoHurts ? -2 : -1, nowMin, deps.say);
            } else if (
              c.stance === 'peace' ||
              c.stance === 'bribe' ||
              c.stance === 'ransom' ||
              c.stance === 'purify' ||
              c.stance === 'cure' ||
              c.stance === 'consecrate' ||
              c.stance === 'tame' ||
              c.stance === 'chess_move' ||
              c.stance === 'pay_release' ||
              c.stance === 'buy_grain' ||
              c.stance === 'donate_rations' ||
              c.stance === 'feed_beasts'
            ) {
              s.skirmishStance = 'peace';
              retargetSkirmishFoes(s);
              applyPlayerCrisisImpact(regIdx, {
                stance: 'peace',
                degree: checkRes.degree || 'SUCCESS',
                category: evt?.category || 'WAR',
                playerEntity: player,
                rolls: rng,
              });
              onContractCompleted(regIdx);
              deps.say(LIVING_WORDS.eventPeaceResolved(f1Name, f2Name), 5);
              const loc = deps.locationRecord?.() ?? null;
              applyTownProsperityDelta(loc?.mapTableData?.mapId, loc?.name, checkRes.degree === 'TRIUMPH' ? 2 : 1, nowMin, deps.say);
            } else {
              s.skirmishStance = 'chaos';
              retargetSkirmishFoes(s);
              deps.say(LIVING_WORDS.eventNeutral(), 5);
            }
          },
        }));

        deps.openChoice({
          lines: [
            LIVING_WORDS.eventChoiceTitle(getEventDisplayName(evt)),
            LIVING_WORDS.eventChoiceSides(f1Name, f2Name),
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
                retargetSkirmishFoes(s);
                adjustPlayerRegionalRep(player, regIdx, 5);
                deps.say(LIVING_WORDS.eventJoinedWatch(), 5);
              },
            },
            {
              code: 'Digit2',
              label: `2. ${LIVING_WORDS.urbanSkirmishOptionRebels()}`,
              action: () => {
                s.skirmishStance = 'rebels';
                retargetSkirmishFoes(s);
                adjustPlayerRegionalRep(player, regIdx, -15);
                if (player?.guildMemberships?.[9]) {
                  player.guildMemberships[9].reputation = (player.guildMemberships[9].reputation ?? 0) + 10;
                }
                deps.say(LIVING_WORDS.eventJoinedRebels(), 5);
              },
            },
            {
              code: 'Digit3',
              label: `3. ${LIVING_WORDS.urbanSkirmishOptionChaos()}`,
              action: () => {
                s.skirmishStance = 'chaos';
                retargetSkirmishFoes(s);
                deps.say(LIVING_WORDS.eventChosenChaos(), 5);
              },
            },
          ],
        });
      }
    } else if (s.kind === LIVING_SITE_KINDS.NAVAL_SQUADRON) {
      const squad = s.blueprint.meta?.squadron;
      if (!squad) return;
      deps.playSound?.(LIVING_SOUNDS.SWORD_CLINK);
      deps.openChoice({
        lines: [
          LIVING_WORDS.navalBattleNotice(),
        ],
        options: [
          {
            code: 'Digit1',
            label: `1. ${LIVING_WORDS.navalChoiceLaw()}`,
            action: () => {
              resolveSideChoice(squad, NAVAL_CHOICE.LAW, player, rng);
              for (const f of s.foes) {
                if (f?.livingRole === 'naval_law') {
                  f.allied = true;
                  f.shipmate = true;
                  if (f.entity) {
                    f.entity.team = 'PlayerAlly';
                    f.entity.mobileTeam = 'PlayerAlly';
                  }
                  if (f.ai) f.ai.isHostile = false;
                } else if (f?.livingRole === 'naval_pirate') {
                  f.allied = false;
                  f.shipmate = false;
                  if (f.ai) {
                    f.ai.isHostile = true;
                    f.ai.detected = true;
                  }
                }
              }
              if (s.navalSquadron?.pirateShips) {
                const pId = deps.myId?.() ?? 'player';
                for (const p of s.navalSquadron.pirateShips) {
                  if (p?.ship) { p.ship.target = pId; p.ship.mode = 'engage'; }
                }
              }
              adjustPlayerRegionalRep(player, regIdx, 5);
              onContractCompleted(regIdx);
              deps.say(LIVING_WORDS.navalChoiceLaw(), 5);
            },
          },
          {
            code: 'Digit2',
            label: `2. ${LIVING_WORDS.navalChoicePirates()}`,
            action: () => {
              const res = resolveSideChoice(squad, NAVAL_CHOICE.PIRATES, player, rng);
              for (const f of s.foes) {
                if (f?.livingRole === 'naval_pirate') {
                  f.allied = true;
                  f.shipmate = true;
                  if (f.entity) {
                    f.entity.team = 'PlayerAlly';
                    f.entity.mobileTeam = 'PlayerAlly';
                  }
                  if (f.ai) f.ai.isHostile = false;
                } else if (f?.livingRole === 'naval_law') {
                  f.allied = false;
                  f.shipmate = false;
                  if (f.ai) {
                    f.ai.isHostile = true;
                    f.ai.detected = true;
                  }
                }
              }
              if (s.navalSquadron?.lawShips) {
                const pId = deps.myId?.() ?? 'player';
                for (const l of s.navalSquadron.lawShips) {
                  if (l?.ship) { l.ship.target = pId; l.ship.mode = 'engage'; }
                }
              }
              adjustPlayerRegionalRep(player, regIdx, -(res.underworldRep || 5));
              deps.say(LIVING_WORDS.navalChoicePirates(), 5);
            },
          },
            {
              code: 'Digit3',
              label: `3. ${LIVING_WORDS.navalChoiceNeutral()}`,
              action: () => {
                const res = resolveSideChoice(squad, NAVAL_CHOICE.NEUTRAL, player, rng);
                for (const f of s.foes) {
                  if (f?.livingRole === 'naval_law' || f?.livingRole === 'naval_pirate') {
                    f.allied = false;
                    f.shipmate = false;
                  }
                }
                if (res.scavenge && player) {
                  const salvageGold = Math.round(
                    (50 + Math.max(1, Number(player?.level ?? 1)) * 15) * (res.salvageBonusMult || 1)
                  );
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
      } else if (s.kind === LIVING_SITE_KINDS.WAR_SKIRMISH) {
        const liveWar = getActiveWarForRegion(player, regIdx, {
          preferKind: s.blueprint.meta?.warDesc?.warKind ?? null,
        }) ?? s.blueprint.meta?.warDesc;
        if (s.blueprint.meta && liveWar) s.blueprint.meta.warDesc = liveWar;
        const warDesc = liveWar ?? s.blueprint.meta?.warDesc;
        s._lastSyncedPlayerStance = warDesc?.playerStance ?? null;
        const sideAName = warDesc?.sideAName ?? 'Vanguard';
        const sideBName = warDesc?.sideBName ?? 'Warband';
        const runPacify = () => {
          const res = resolveWarSkirmishPacify(player, warDesc, { nowMinutes: nowMin, rng });
          if (res.faithShortage) {
            deps.say(res.reason, 5);
            s.skirmishStance = 'neutral_watch';
            retargetSkirmishFoes(s);
            return;
          }
          s.skirmishStance = res.skirmishStance;
          s._lastSyncedPlayerStance = res.pacified ? 'peace' : (warDesc?.playerStance ?? null);
          retargetSkirmishFoes(s);
          const score = res.rollResult?.totalScore ?? 50;
          const dc = res.rollResult?.targetScore ?? 85;
          if (!res.pacified) {
            if (res.skirmishStance === 'both_hostile') {
              deps.say(t('apotheosis.skirmish.pacifyCritFail', 'Parley failed fatally ({score}/{dc}) — both sides attack you!', { score, dc }), 6);
            } else {
              deps.say(t('apotheosis.skirmish.pacifyFail', 'Parley failed ({score}/{dc}) — the battle rages on around you.', { score, dc }), 5);
            }
            return;
          }
          deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
          const progStr = `${Math.min(WAR_SKIRMISH_PACIFY_GOAL, res.pacifiedCount)}/${WAR_SKIRMISH_PACIFY_GOAL}`;
          if (res.degree === LIVING_ROLL_DEGREE.PARTIAL) {
            deps.say(
              t('apotheosis.skirmish.pacifyPartial', 'Compromise truce ({score}/{dc}, {prog}) — extra fatigue & resources spent! +{faith} Faith +{inf}% Inf.', {
                score,
                dc,
                prog: progStr,
                faith: res.faithReward,
                inf: res.infReward,
              }),
              6,
            );
          } else {
            deps.say(
              t('apotheosis.skirmish.pacifyOk', 'Skirmish pacified ({deg} {score}/{dc}, {prog})! +{faith} Faith +{inf}% Inf.', {
                deg: res.degree,
                score,
                dc,
                prog: progStr,
                faith: res.faithReward,
                inf: res.infReward,
              }),
              6,
            );
          }
        };

        // Never re-open ChoiceWindow once the player has chosen a stance for this war!
        if (warDesc?.playerStance === 'sideA') {
          s.skirmishStance = 'watch';
          retargetSkirmishFoes(s);
          deps.say(t('apotheosis.skirmish.savedSideA', 'Your banner rallies {side} against {foe}.', { side: sideAName, foe: sideBName }), 5);
          return;
        }
        if (warDesc?.playerStance === 'sideB') {
          s.skirmishStance = 'rebels';
          retargetSkirmishFoes(s);
          deps.say(t('apotheosis.skirmish.savedSideB', 'Your banner rallies {side} against {foe}.', { side: sideBName, foe: sideAName }), 5);
          return;
        }
        if (warDesc?.playerStance === 'watch') {
          s.skirmishStance = 'neutral_watch';
          retargetSkirmishFoes(s);
          deps.say(t('apotheosis.skirmish.savedWatch', 'Observing the clash between {a} and {b} from the sidelines.', { a: sideAName, b: sideBName }), 4);
          return;
        }
        if (warDesc?.playerStance === 'peace') {
          runPacify();
          return;
        }

        const isDivineWar = warDesc?.warKind === 'divine';
        const rewardTag = isDivineWar
          ? t('apotheosis.skirmish.winPreviewDivine', '+35 Faith · +1% Inf')
          : t('apotheosis.skirmish.winPreviewMundane', '+150g · Rep');
        const curPac = Number(warDesc?.pacifiedCount ?? 0);
        const pacifyLabel = isDivineWar
          ? t('apotheosis.skirmish.optPacifyDivineProgress', 'Reconcile & Pacify ({cost} Faith · DC 85 · {cur}/3)', { cost: DIVINE_SKIRMISH_PACIFY_FAITH_COST, cur: curPac })
          : t('apotheosis.skirmish.optPacifyMundaneProgress', 'Reconcile & Pacify (Hard Diplomacy DC 85 · {cur}/3)', { cur: curPac });

        deps.playSound?.(LIVING_SOUNDS.SWORD_CLINK);
        deps.openChoice({
          lines: [
            isDivineWar
              ? t('apotheosis.skirmish.titleDivine', 'Divine War Skirmish: {a} vs {b}', { a: sideAName, b: sideBName })
              : t('apotheosis.skirmish.titleMundane', 'War Skirmish in {region}: {a} vs {b}', { region: warDesc?.regionName ?? 'Tamriel', a: sideAName, b: sideBName }),
            t('apotheosis.skirmish.choiceNote', 'Your stance will hold for this entire war (pacify 3 clashes to end regional war).'),
          ],
          options: [
            {
              code: 'Digit1',
              label: `1. ${t('apotheosis.skirmish.optSideReward', 'Join {side} ({reward})', { side: sideAName, reward: rewardTag })}`,
              action: () => {
                setWarPlayerStance(player, warDesc, 'sideA');
                s._lastSyncedPlayerStance = 'sideA';
                s.skirmishStance = 'watch';
                retargetSkirmishFoes(s);
                deps.say(t('apotheosis.skirmish.savedSideA', 'Your banner rallies {side} against {foe}.', { side: sideAName, foe: sideBName }), 5);
              },
            },
            {
              code: 'Digit2',
              label: `2. ${t('apotheosis.skirmish.optSideReward', 'Join {side} ({reward})', { side: sideBName, reward: rewardTag })}`,
              action: () => {
                setWarPlayerStance(player, warDesc, 'sideB');
                s._lastSyncedPlayerStance = 'sideB';
                s.skirmishStance = 'rebels';
                retargetSkirmishFoes(s);
                deps.say(t('apotheosis.skirmish.savedSideB', 'Your banner rallies {side} against {foe}.', { side: sideBName, foe: sideAName }), 5);
              },
            },
            {
              code: 'Digit3',
              label: `3. ${pacifyLabel}`,
              action: runPacify,
            },
            {
              code: 'Digit4',
              label: `4. ${t('apotheosis.skirmish.optWatch', 'Observe from afar (stay neutral)')}`,
              action: () => {
                setWarPlayerStance(player, warDesc, 'watch');
                s._lastSyncedPlayerStance = 'watch';
                s.skirmishStance = 'neutral_watch';
                retargetSkirmishFoes(s);
                deps.say(t('apotheosis.skirmish.savedWatch', 'Observing the clash between {a} and {b} from the sidelines.', { a: sideAName, b: sideBName }), 4);
              },
            },
          ],
        });
      }
    }

  function standSite(blueprint) {
    if (!blueprint) return null;
    releaseSite();
    for (const m of blueprint.meshes) ensureModel(m.modelId);
    for (const fl of blueprint.flats) ensureFlat(fl.archive, fl.record);

    const site = {
      kind: blueprint.kind,
      blueprint,
      foes: /** @type {any[]} */ ([]),
      batches: /** @type {any[]} */ ([]),
      _batchesDirty: true,
      _colliderCount: 0,
      navalSquadron: null,
      skirmishStance: blueprint.meta?.skirmishStance ?? null,
      _lastSyncedPlayerStance: blueprint.meta?.warDesc?.playerStance ?? null,
      interacted: false,
    };
    stood = site;

    const siteCampId = `lt_${blueprint.kind}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    site.campId = siteCampId;

    syncSiteColliders(site);

    if (blueprint.kind === LIVING_SITE_KINDS.NAVAL_SQUADRON && deps.spawnNavalSquadron) {
      site.navalSquadron = deps.spawnNavalSquadron(blueprint.meta?.squadron);
    }

    for (const a of blueprint.actors) {
      const actorCampId = a.factionSide ? `${siteCampId}_${a.factionSide}` : siteCampId;
      a.campId = actorCampId;

      const actorFeet = [...a.feet];

      // Geometry & Anti-Roof Safety Pipeline
      let isRoofOrBlocked = false;
      if (deps.raycastHit) {
        // Probe downwards from 15m above feet to verify surface is ground, not building roof
        const topHit = deps.raycastHit([actorFeet[0], actorFeet[1] + 15, actorFeet[2]], [0, -1, 0], 25);
        if (topHit && Number.isFinite(topHit.dist)) {
          const surfaceY = actorFeet[1] + 15 - topHit.dist;
          if (surfaceY - actorFeet[1] > 0.85) {
            isRoofOrBlocked = true; // Landed on a roof, parapet or awning
          }
        }
        // Probe upwards to check if under a ceiling/balcony/interior room
        if (!isRoofOrBlocked) {
          const skyHit = deps.raycastHit([actorFeet[0], actorFeet[1] + 1.8, actorFeet[2]], [0, 1, 0], 2.5);
          if (skyHit && Number.isFinite(skyHit.dist) && skyHit.back !== true) {
            isRoofOrBlocked = true; // Blocked overhead
          }
        }
      }
      if (isRoofOrBlocked) {
        // Recover closer to site center on clear terrain
        const fallbackDist = 1.2 + (Math.random() - 0.5) * 1.8;
        const fallbackAngle = Math.random() * Math.PI * 2;
        actorFeet[0] = blueprint.center[0] + Math.cos(fallbackAngle) * fallbackDist;
        actorFeet[2] = blueprint.center[2] + Math.sin(fallbackAngle) * fallbackDist;
        actorFeet[1] = snapPropToGround(deps.heightAt, actorFeet[0], actorFeet[2]);
      }

      if (deps.lodgedIn?.(actorFeet) || (deps.collider && lodgedIn(deps.collider, actorFeet))) {
        if (deps.freeLodgedFeet) {
          deps.freeLodgedFeet(actorFeet);
        } else if (deps.collider) {
          freeLodgedFeet(deps.collider, actorFeet);
        }
      }

      // If still lodged in solid geometry (wall, rock, tree trunk), skip this extra mob to prevent clipping
      if (deps.lodgedIn?.(actorFeet) || (deps.collider && lodgedIn(deps.collider, actorFeet))) {
        continue;
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
          allowThreatScaling: Boolean(a.allowThreatScaling),
          allowEliteRoll: Boolean(a.allowEliteRoll),
          allowChampionRoll: Boolean(a.allowChampionRoll),
          ...(a.eliteFoe !== undefined ? { eliteFoe: a.eliteFoe } : {}),
          ...(a.eliteChance != null ? { eliteChance: a.eliteChance } : {}),
          ...(a.forcedBossTraits ? { forcedBossTraits: a.forcedBossTraits } : {}),
          ...(a.hpMult > 1 ? { hpMult: a.hpMult } : {}),
          ...(a.damageMult > 1 ? { damageMult: a.damageMult } : {}),
        }),
      )
        .then((rec) => {
          if (!rec) return;
          if (stood !== site) {
            if (deps.inPool(rec)) deps.remove(rec);
            return;
          }
          rec.campId = a.campId;
          rec.livingSiteKind = blueprint.kind;
          rec.allied = Boolean(a.allied);
          rec.shipmate = Boolean(a.allied);
          if (rec.entity) {
            rec.entity.name = a.name;
            rec.entity.campId = a.campId;
            if (a.skirmishLeader) rec.entity.skirmishLeader = true;
            if (a.team) {
              rec.entity.team = a.team;
              rec.entity.mobileTeam = a.team;
            }
            if (a.suppressInfighting || a.role === 'bandit_camp') {
              rec.entity.suppressInfighting = true;
            }
            if (blueprint.kind === LIVING_SITE_KINDS.WAR_SKIRMISH || blueprint.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH) {
              rec.entity.skirmishNeutralToPlayer = true;
              rec.entity.skirmishForceInfighting = true;
            }
          }
          if (blueprint.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH || (a.role?.startsWith('skirmish_') && blueprint.kind !== LIVING_SITE_KINDS.WAR_SKIRMISH)) {
            const urbanLoot = LivingTamrielConfig.urbanLootMode;
            if (urbanLoot === LIVING_URBAN_LOOT.ZERO) {
              rec.lootDropped = true; // suppresses corpse loot generation to protect economy
              rec._suppressLoot = true;
              if (rec.entity?.items) {
                rec.entity.items = [];
              }
            } else if (urbanLoot === LIVING_URBAN_LOOT.SUPPLIES) {
              rec.lootDropped = true;
              rec._suppressLoot = false;
              if (rec.entity) {
                const supplyRng = rng();
                const supplies = [
                  goldStack(10 + Math.floor(supplyRng * 25)),
                ];
                if (supplyRng > 0.4) {
                  const healRec = POTION_RECIPES.find((r) => r.name === 'healing');
                  if (healRec) {
                    supplies.push(makePotion(potionRecipeKey(healRec.ingredients)));
                  }
                }
                rec.entity.items = supplies;
              }
            } else {
              // FULL loot: do not suppress
              rec.lootDropped = false;
              rec._suppressLoot = false;
            }
          } else {
            // Wilderness / Camps / Checkpoints
            const wildLoot = LivingTamrielConfig.wildernessLootMode;
            if (wildLoot === LIVING_WILDERNESS_LOOT.SUPPLIES && rec.entity?.items?.length) {
              if (a.role !== 'wandering_adventurer' && a.role !== 'rival_adventurer' && a.role !== 'nemesis_leader') {
                rec.entity.items = rec.entity.items.filter((it) => isGoldPieces(it) || it.isGold || it.isPotion || it.isArrow || it.category === 'Consumables');
              }
            }
          }
          if (blueprint.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH || a.role?.startsWith('skirmish_')) {
            if (rec.ai) {
              rec.ai.isHostile = true;
              rec.ai.detected = true;
              rec.ai.target = null;
            }
          } else if (site.hostile || a.hostile) {
            if (rec.ai) {
              rec.ai.isHostile = true;
              rec.ai.detected = true;
              rec.ai.target = deps.playerEntity();
            }
          } else if (rec.ai && !a.allied) {
            rec.ai.isHostile = false;
          }
          rec.livingRole = a.role;
          if (a.role === 'wandering_adventurer' || a.role === 'rival_adventurer') {
            rec.lootDropped = false;
            rec._suppressLoot = false;
            if (rec.entity) {
              delete rec.entity.lootCap;
            }
            const adv = a.adv ?? blueprint.meta?.adv;
            if (adv && rec.entity) {
              rec._advRecord = adv;
              equipAdventurerEntity(rec.entity, adv, deps.playerEntity()?.level || 1, rng);
            }
          } else if (a.role === 'nemesis_leader') {
            rec.lootDropped = false;
            rec._suppressLoot = false;
            if (rec.entity) {
              delete rec.entity.lootCap;
            }
            const nem = a.nemesis ?? blueprint.meta?.nemesis;
            if (nem && rec.entity) {
              rec._nemesisRecord = nem;
              equipAdventurerEntity(rec.entity, nem, deps.playerEntity()?.level || 1, rng, { replace: true });
            }
          }
          site.foes.push(rec);
          if (blueprint.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH || blueprint.kind === LIVING_SITE_KINDS.WAR_SKIRMISH) {
            retargetSkirmishFoes(site);
          }
        })
        .catch(() => {});
    }

    return site;
  }

  function tryStandUrbanSkirmish({ dist, angle, nowMin, locKey, regIdx, loc, feet, player, allowMundaneOnly = false }) {
    const safe = findSafeSiteCenter(deps, feet, dist, angle, 4.0);
    if (!safe.suitable) return false;
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
      climateIndex: deps.climateIndex?.() ?? null,
      allowMundaneOnly,
      rng,
    });
    if (!bp || bp.actors.length === 0) return false;
    lastSkirmishRegion = regIdx;
    locationEventCooldowns.set(locKey, nowMin);
    lastSpawnMinute = nowMin;
    standSite(bp);
    const alertText = bp.meta?.event
      ? LIVING_WORDS.skirmishAlert(
        getEventDisplayName(bp.meta.event),
        bp.meta.faction1Name ?? LIVING_WORDS.factionDefendersGeneric(),
        bp.meta.faction2Name ?? LIVING_WORDS.factionAttackersGeneric(),
      )
      : LIVING_WORDS.urbanSkirmishAlert();
    deps.say(alertText, 5);
    return true;
  }

  function pickAndStandNextSite(feet, nowMin) {
    const regIdx = deps.regionIndex();
    const inTown = deps.inLocationRect();
    const onRoad = deps.onRoad();
    const player = deps.playerEntity();
    const regState = getRegionState(regIdx);

    const loc = deps.locationRecord?.() ?? null;
    const pPixel = deps.playerTravelPixel?.() ?? null;
    const locKey = resolveLocationEventKey(loc, regIdx, pPixel, feet);
    if (inTown) {
      const lastEventTime = locationEventCooldowns.get(locKey) ?? -999999;
      const canEventHere = (nowMin - lastEventTime) >= getLivingLocationCooldownMinutes();
      if (!canEventHere) return;

      // 1. Priority 1: Plague Quarantine Relief Tent (40% when gated, 100% in open settlements without physical gates)
      const hasPhysicalGates = typeof deps.hasCityGates === 'function' ? Boolean(deps.hasCityGates()) : true;
      const quarantineTentChance = hasPhysicalGates ? 0.40 : 1.0;
      if (isRegionInQuarantine(regIdx) && rng() < quarantineTentChance) {
        const qAngle = rng() * Math.PI * 2;
        const safe = findSafeSiteCenter(deps, feet, 16, qAngle, 4.0);
        if (safe.suitable) {
          lastQuarantineRegion = regIdx;
          locationEventCooldowns.set(locKey, nowMin);
          lastSpawnMinute = nowMin;
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
      }

      // 2. Priority 2: Urban Skirmish during regional crisis or civil strife (80% crisis / 20% mundane)
      if (shouldSpawnUrbanSkirmish({ regionIndex: regIdx, isInsideBuilding: false, existingActiveSkirmishes: 0, playerEntity: player })) {
        const allowMundaneOnly = rng() >= 0.80;
        if (tryStandUrbanSkirmish({ dist: 28, angle: rng() * Math.PI * 2, nowMin, locKey, regIdx, loc, feet, player, allowMundaneOnly })) {
          return;
        }
      }

      // 3. Priority 3: Nemesis & Retinue Ambush inside town
      const rep = Number(player?.legalRep?.[regIdx] ?? player?.regionalReputations?.[regIdx] ?? 0);
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
        const safe = findSafeSiteCenter(deps, feet, 11, angle, 3.0);
        if (safe.suitable) {
          locationEventCooldowns.set(locKey, nowMin);
          lastSpawnMinute = nowMin;
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
      }

      // 4. Priority 4: Peace-time town roulette (65% Grounded Plea / 35% Mundane Skirmish)
      if (Number(LivingTamrielConfig.urban) > PRESENCE.OFF) {
        if (rng() < 0.65) {
          const pleaEval = evaluatePleaEncounter({
            regionIndex: regIdx,
            nowMinutes: nowMin,
            playerEntity: player,
            rng,
          });
          if (pleaEval.shouldPlea && pleaEval.plea) {
            const safe = findSafeSiteCenter(deps, feet, 10, angle, 3.0);
            if (safe.suitable) {
              locationEventCooldowns.set(locKey, nowMin);
              lastSpawnMinute = nowMin;
              standSite(
                buildLivingSiteBlueprint({
                  kind: LIVING_SITE_KINDS.PLEA_ENCOUNTER,
                  centerX: safe.x,
                  centerZ: safe.z,
                  heightAt: deps.heightAt,
                  regionIndex: regIdx,
                  playerEntity: player,
                  nowMinutes: nowMin,
                  plea: pleaEval.plea,
                  rng,
                }),
              );
            }
          }
        } else {
          tryStandUrbanSkirmish({ dist: 24, angle, nowMin, locKey, regIdx, loc, feet, player, allowMundaneOnly: true });
        }
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
    const rep = Number(player?.legalRep?.[regIdx] ?? player?.regionalReputations?.[regIdx] ?? 0);
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

    // 4.5 Unified Wilderness War Skirmish (Divine & Mundane Wars — strictly land-only, never at sea!)
    const isOceanWild = Boolean(deps.afloat?.()) || (typeof deps.climateIndex === 'function' && deps.climateIndex() === CLIMATES.Ocean);
    if (!isOceanWild && canSpawnWarSkirmish(player, regIdx, nowMin, { isOcean: isOceanWild, isAfloat: Boolean(deps.afloat?.()) }) && rng() < 0.70) {
      const warDesc = getActiveWarForRegion(player, regIdx);
      if (warDesc) {
        const warDist = 16 + rng() * 5;
        const warAngle = deps.facingYaw?.() ?? angle;
        const warSafe = findSafeSiteCenter(deps, feet, warDist, warAngle, 5.0);
        const wcx = warSafe.suitable ? warSafe.x : cx;
        const wcz = warSafe.suitable ? warSafe.z : cz;
        lastSpawnMinute = nowMin;
        markWarSkirmishSpawned(player, nowMin);
        const warSite = standSite(
          buildLivingSiteBlueprint({
            kind: LIVING_SITE_KINDS.WAR_SKIRMISH,
            centerX: wcx,
            centerZ: wcz,
            heightAt: deps.heightAt,
            regionIndex: regIdx,
            playerEntity: player,
            nowMinutes: nowMin,
            onRoad,
            rng,
            warDesc,
          }),
        );
        if (warSite && !deps.isAutopiloting?.() && warDesc.playerStance !== 'peace') {
          triggerSiteInteraction(warSite);
        } else if (warSite) {
          deps.say(
            t('apotheosis.skirmish.spottedHud', 'Clashing banners ahead: {a} vs {b}!', {
              a: warDesc.sideAName,
              b: warDesc.sideBName,
            }),
            5,
          );
        }
        return;
      }
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
          (stood.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH || stood.kind === LIVING_SITE_KINDS.WAR_SKIRMISH) &&
          !stood.orderRestored &&
          stood.foes.length > 0
        ) {
          if (stood.kind === LIVING_SITE_KINDS.WAR_SKIRMISH) {
            const liveWar = getActiveWarForRegion(deps.playerEntity(), deps.regionIndex(), {
              preferKind: stood.blueprint.meta?.warDesc?.warKind ?? null,
            }) ?? stood.blueprint.meta?.warDesc;
            if (liveWar) {
              if (stood.blueprint.meta) stood.blueprint.meta.warDesc = liveWar;
              const nextPlayerStance = liveWar.playerStance ?? null;
              if (nextPlayerStance !== stood._lastSyncedPlayerStance) {
                stood._lastSyncedPlayerStance = nextPlayerStance;
                if (nextPlayerStance === 'sideA') stood.skirmishStance = 'watch';
                else if (nextPlayerStance === 'sideB') stood.skirmishStance = 'rebels';
                else if (nextPlayerStance === 'watch') stood.skirmishStance = 'neutral_watch';
                else if (nextPlayerStance === 'peace') {
                  stood.interacted = false;
                } else if (nextPlayerStance == null) {
                  stood.skirmishStance = 'neutral_watch';
                  stood.interacted = false;
                }
              }
            }
          }
          retargetSkirmishFoes(stood);
          if (stood.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH) {
            const guards = stood.foes.filter((f) => f?.livingRole === 'skirmish_guard');
            const rebels = stood.foes.filter((f) => f?.livingRole === 'skirmish_rebel');
            const guardsDead = guards.length > 0 && guards.every((g) => g.dead || !deps.inPool(g));
            const rebelsDead = rebels.length > 0 && rebels.every((r) => r.dead || !deps.inPool(r));
            const calmUrbanSurvivors = (list) => {
              for (const u of list) {
                if (!u || u.dead) continue;
                if (u.entity) {
                  u.entity.skirmishNeutralToPlayer = true;
                  u.entity.skirmishForceInfighting = false;
                }
                if (u.ai) {
                  u.ai.isHostile = false;
                  u.ai.detected = false;
                  u.ai.target = null;
                  u.ai.secondaryTarget = null;
                  u.ai.targetSenses = null;
                  u.ai.idle = true;
                }
              }
            };
            if (rebelsDead) {
              stood.orderRestored = true;
              calmUrbanSurvivors(guards);
              if (stood.skirmishStance !== 'rebels' && stood.skirmishStance !== 'chaos') {
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
            } else if (guardsDead) {
              stood.orderRestored = true;
              calmUrbanSurvivors(rebels);
            }
          } else {
            const warDesc = stood.blueprint.meta?.warDesc;
            const guards = stood.foes.filter((f) => f?.livingRole === 'skirmish_guard');
            const rebels = stood.foes.filter((f) => f?.livingRole === 'skirmish_rebel');
            const guardsDead = guards.length > 0 && guards.every((g) => Boolean(g.dead));
            const rebelsDead = rebels.length > 0 && rebels.every((r) => Boolean(r.dead));
            const activeSideA = warDesc?.playerStance === 'sideA' || stood.skirmishStance === 'watch';
            const activeSideB = warDesc?.playerStance === 'sideB' || stood.skirmishStance === 'rebels';
            const calmAllies = (list) => {
              for (const ally of list) {
                if (!ally || ally.dead) continue;
                ally.allied = true;
                ally.shipmate = true;
                if (ally.entity) {
                  ally.entity.team = 'PlayerAlly';
                  ally.entity.mobileTeam = 'PlayerAlly';
                  ally.entity.skirmishNeutralToPlayer = true;
                  ally.entity.skirmishForceInfighting = false;
                }
                if (ally.ai) {
                  ally.ai.isHostile = false;
                  ally.ai.detected = false;
                  ally.ai.target = null;
                  ally.ai.secondaryTarget = null;
                  ally.ai.targetSenses = null;
                  ally.ai.idle = true;
                }
              }
            };
            if (activeSideA && rebelsDead) {
              stood.orderRestored = true;
              calmAllies(guards);
              const pl = deps.playerEntity();
              if (warDesc.warKind === 'divine' && isAscendedGod(pl)) {
                addApotheosisFaith(pl, 35, { source: 'war_skirmish_win', nowMinutes: nowMin });
                shiftRegionInfluence(pl, warDesc.regIdx, 'player', 1.0);
                deps.say(t('apotheosis.skirmish.winDivine', 'Enemy zealots routed! +35 Faith · +1.0% Influence.'), 5);
              } else if (pl) {
                pl.goldPieces = (Number(pl.goldPieces) || 0) + 150;
                adjustPlayerRegionalRep(pl, warDesc.regIdx, 3);
                deps.say(t('apotheosis.skirmish.winMundane', 'Enemy warband routed! +150g · +3 Reputation.'), 5);
              }
              deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
            } else if (activeSideB && guardsDead) {
              stood.orderRestored = true;
              calmAllies(rebels);
              const pl = deps.playerEntity();
              if (warDesc.warKind === 'divine' && isAscendedGod(pl)) {
                addApotheosisFaith(pl, 35, { source: 'war_skirmish_win', nowMinutes: nowMin });
                shiftRegionInfluence(pl, warDesc.regIdx, 'player', 1.0);
                deps.say(t('apotheosis.skirmish.winDivine', 'Enemy zealots routed! +35 Faith · +1.0% Influence.'), 5);
              } else if (pl) {
                pl.goldPieces = (Number(pl.goldPieces) || 0) + 150;
                adjustPlayerRegionalRep(pl, warDesc.regIdx, -3);
                deps.say(t('apotheosis.skirmish.winMundaneSideB', 'Opposing vanguard routed! +150g.'), 5);
              }
              deps.playSound?.(LIVING_SOUNDS.GOLD_COINS);
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
              recordNemesisDefeated(player);
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
        const isNaval = stood.kind === LIVING_SITE_KINDS.NAVAL_SQUADRON;
        const interactDistance = isNaval
          ? 350
          : stood.kind === LIVING_SITE_KINDS.WAR_SKIRMISH
            ? 24
            : SITE_INTERACT_DISTANCE_M;
        if (
          !stood.interacted &&
          d <= interactDistance &&
          !(stood.kind === LIVING_SITE_KINDS.WAR_SKIRMISH && deps.isAutopiloting?.()) &&
          (isNaval ||
            stood.kind === LIVING_SITE_KINDS.CHECKPOINT ||
            stood.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH ||
            stood.kind === LIVING_SITE_KINDS.WAR_SKIRMISH ||
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
            if (squad) {
              lastSpawnMinute = nowMin;
              const site = standSite(bp);
              triggerSiteInteraction(site);
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
      if (stood?.kind === LIVING_SITE_KINDS.WAR_SKIRMISH) {
        return false;
      }
      if (stood?.kind === LIVING_SITE_KINDS.PLEA_ENCOUNTER && stood.hostile) {
        return false;
      }
      if (stood?.kind === LIVING_SITE_KINDS.URBAN_SKIRMISH) {
        if (stood.skirmishStance === 'chaos' || stood.skirmishStance === 'rebels' || stood.skirmishStance === 'both_hostile') {
          return false;
        }
      }
      const team = foe.livingRole === 'skirmish_guard' ? SKIRMISH_TEAMS.CITY_WATCH : (foe.entity?.team ?? null);
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
        const yLift = meshGroundOffsetY(m.modelId);
        const mat = trs(m.feet[0], m.feet[1] + yLift, m.feet[2], 0, m.yawDeg, 0);
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
      if (stood._batchesDirty || (!stood.batches.length && stood.blueprint.flats.length)) {
        if (stood.batches.length && deps.renderer?.destroyBillboardBatch) {
          for (const b of stood.batches) {
            try {
              deps.renderer.destroyBillboardBatch(b);
            } catch (_e) {}
          }
          stood.batches = [];
        }
        for (const fl of stood.blueprint.flats) {
          const sz = flatSizes.get(`${fl.archive}:${fl.record}`);
          if (!sz) continue;
          const b = deps.renderer.createBillboardBatch(fl.archive, fl.record, sz, [fl.feet]);
          if (b) {
            if (fl.archive === 210 && fl.record === 1) b.frame = 0;
            stood.batches.push(b);
          }
        }
        stood._batchesDirty = false;
      }
      return stood.batches;
    },

    /**
     * Returns dynamic point lights `{ x, y, z, range }` for campfires and braziers at the active site.
     */
    lights() {
      if (!stood) return [];
      /** @type {any[]} */
      const out = [];
      for (const fl of stood.blueprint.flats) {
        if (fl.lightRadius > 0) {
          const fx = Number.isFinite(fl.feet?.[0]) ? fl.feet[0] : 0;
          const fy = Number.isFinite(fl.feet?.[1]) ? fl.feet[1] + 1.0 : 1.0;
          const fz = Number.isFinite(fl.feet?.[2]) ? fl.feet[2] : 0;
          const r = Number.isFinite(fl.lightRadius) && fl.lightRadius > 0 ? fl.lightRadius : 12;
          out.push(
            adoptLight(
              {
                x: fx,
                y: fy,
                z: fz,
                range: r,
              },
              fl,
            ),
          );
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
      syncSiteColliders(stood);
      if (stood.batches.length && deps.renderer?.destroyBillboardBatch) {
        for (const b of stood.batches) {
          try {
            deps.renderer.destroyBillboardBatch(b);
          } catch (_e) {}
        }
        stood.batches = [];
        stood._batchesDirty = true;
      }
    },

    /** Removes destructible props and colliders from the active site. */
    destroyDestructibles() {
      return stood ? destroySiteDestructibles(stood) : false;
    },

    /**
     * Explicitly stands a site blueprint (used by tests, console commands, or travel interrupts).
     * @param {any} blueprint
     */
    standBlueprint(blueprint) {
      const site = standSite(blueprint);
      if (site && !site.interacted && site.kind === LIVING_SITE_KINDS.NAVAL_SQUADRON) {
        triggerSiteInteraction(site);
      }
      return site;
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

    /**
     * Immediately stands a Wilderness War Skirmish ahead of the player (strictly land-only, never at sea!).
     */
    spawnWarSkirmishNow({ warDesc = null, force = false, preferKind = null, angle = null } = {}) {
      const isAfloatNow = Boolean(deps.afloat?.());
      const isOceanNow = isAfloatNow || (typeof deps.climateIndex === 'function' && deps.climateIndex() === CLIMATES.Ocean);
      if (isOceanNow) {
        return { ok: false, reason: 'War skirmishes never spawn at sea / ocean.' };
      }
      const feet = deps.feet?.();
      if (!feet) return { ok: false, reason: 'Player position unavailable.' };
      const regIdx = deps.regionIndex();
      const player = deps.playerEntity();
      const nowMin = deps.clock();
      const chosenWar = warDesc ?? getActiveWarForRegion(player, regIdx, { preferKind });
      if (!chosenWar && !force) {
        return { ok: false, reason: 'No active Religious or Regional War in this region.' };
      }
      const spawnAngle = Number.isFinite(angle) ? angle : (deps.facingYaw?.() ?? rng() * Math.PI * 2);
      const safe = findSafeSiteCenter(deps, feet, 15, spawnAngle, 5.0);
      const cx = safe?.suitable ? safe.x : feet[0] + Math.sin(spawnAngle) * 14;
      const cz = safe?.suitable ? safe.z : feet[2] + Math.cos(spawnAngle) * 14;
      const site = standSite(
        buildLivingSiteBlueprint({
          kind: LIVING_SITE_KINDS.WAR_SKIRMISH,
          centerX: cx,
          centerZ: cz,
          heightAt: deps.heightAt,
          regionIndex: regIdx,
          playerEntity: player,
          nowMinutes: nowMin,
          onRoad: deps.onRoad?.() ?? false,
          rng,
          warDesc: chosenWar,
        }),
      );
      if (!site) return { ok: false, reason: 'Could not build war skirmish at this location.' };
      markWarSkirmishSpawned(player, nowMin);
      triggerSiteInteraction(site);
      return { ok: true, site, warDesc: site.blueprint?.meta?.warDesc ?? chosenWar };
    },

    interactCurrentSiteIfWarSkirmish() {
      if (!stood || stood.kind !== LIVING_SITE_KINDS.WAR_SKIRMISH) return false;
      stood.interacted = false;
      triggerSiteInteraction(stood);
      return true;
    },

    getCompanionFoe: () => companionFoe,
    dismissCompanionBody,
    openAdventurerDialog(rec) {
      if (!rec || rec.dead || rec.ai?.isHostile || rec._isSparring || rec.livingRole === 'recruited_companion') {
        return false;
      }
      if (!deps.openChoice) return false;
      const player = deps.playerEntity();
      const regIdx = deps.regionIndex();
      const nowMin = deps.clock();
      const rng = deps.rng ?? Math.random;
      const onStoodSite = Boolean(stood && stood.foes?.includes?.(rec));
      const siteMeta = onStoodSite ? stood.blueprint?.meta : null;

      let state = rec._advDialog ?? null;
      if (!state) {
        const isWandering =
          rec.livingRole === 'wandering_adventurer' ||
          (onStoodSite && stood.kind === LIVING_SITE_KINDS.WANDERING_ADVENTURER);
        const adv = siteMeta?.adv ?? rec._advRecord ?? {
          id: 9990,
          name: rec.entity?.name || 'Sparring Duelist',
          className: 'Knight',
          level: rec.entity?.level || Number(player?.level ?? 5),
          trait: 'DUELIST',
          currentRegion: regIdx,
        };
        const tension = siteMeta?.tension ?? evaluateAdventurerTension(adv, player);
        state = ensureAdventurerDialogState(rec, {
          kind: isWandering ? 'WANDERING_ADVENTURER' : 'ADVENTURER_MEETING',
          adv,
          situation: siteMeta?.situation ?? ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
          tension,
          wager: tension?.wagerGold ?? Math.max(25, (adv.level || 3) * 15),
          regionIndex: regIdx,
        });
      }

      const adv = state.adv;
      if (!adv) return false;
      if (state.extorted) {
        deps.say(LIVING_WORDS.roadAdvExtortedCold(adv.name), 5);
        return true;
      }

      const spec =
        state.kind === 'WANDERING_ADVENTURER'
          ? buildWanderingAdventurerChoiceSpec({
              adv,
              situation: state.situation,
              playerEntity: player,
              foeRecord: rec,
              regionIndex: state.regionIndex ?? regIdx,
              nowMinutes: nowMin,
              state,
              openChoice: deps.openChoice,
              playSound: deps.playSound,
              say: deps.say,
              resolveRegionDungeon: deps.resolveRegionDungeon,
              discoverDungeon: deps.discoverDungeon,
              addNote: deps.addNote,
              surfacePlayer: deps.surfacePlayer,
              onHostile: () => {
                if (onStoodSite) {
                  setSiteHostile(stood, true);
                } else if (rec.ai) {
                  rec.ai.isHostile = true;
                  rec.ai.detected = true;
                  rec.ai.target = player;
                }
              },
              onHired: (comp) => adoptSiteCompanion(onStoodSite ? stood : null, rec.livingRole, comp, rec),
              rng,
            })
          : buildAdventurerMeetingChoiceSpec({
              adv,
              tension: state.tension,
              playerEntity: player,
              foeRecord: rec,
              regionIndex: state.regionIndex ?? regIdx,
              nowMinutes: nowMin,
              state,
              openChoice: deps.openChoice,
              playSound: deps.playSound,
              say: deps.say,
              resolveRegionDungeon: deps.resolveRegionDungeon,
              discoverDungeon: deps.discoverDungeon,
              addNote: deps.addNote,
              surfacePlayer: deps.surfacePlayer,
              onHostile: () => {
                if (onStoodSite) {
                  setSiteHostile(stood, true);
                } else if (rec.ai) {
                  rec.ai.isHostile = true;
                  rec.ai.detected = true;
                  rec.ai.target = player;
                }
              },
              onPeaceful: () => {
                if (onStoodSite) setSiteHostile(stood, false);
              },
              onForfeit: () => {
                if (onStoodSite) releaseSite();
              },
              onHired: (comp) => adoptSiteCompanion(onStoodSite ? stood : null, rec.livingRole, comp, rec),
              rng,
            });

      if (!spec) {
        deps.say(LIVING_WORDS.adventurerSettledCold(adv.name), 5);
        return true;
      }
      deps.openChoice(spec);
      return true;
    },

    /** Clears any active site and releases all spawned actors and batches. */
    clear() {
      releaseSite();
      checkTimer = 0;
    },
  };
}

/**
 * Builds an interactive ChoiceWindow spec for an ADVENTURER_MEETING rival camp encounter.
 * Returns `null` when no actionable options remain (caller should show a cold closing line).
 * @param {any} params
 */
export function buildAdventurerMeetingChoiceSpec({
  adv,
  tension = null,
  playerEntity,
  foeRecord = null,
  regionIndex = 0,
  nowMinutes = 0,
  state = null,
  openChoice = null,
  playSound = null,
  onHostile = null,
  onPeaceful = null,
  onForfeit = null,
  onHired = null,
  say = () => {},
  rng = Math.random,
}) {
  if (!adv) return null;
  const resolvedTension = tension ?? evaluateAdventurerTension(adv, playerEntity);
  const wager = resolvedTension?.wagerGold ?? 50;
  const safeRegion = Number.isFinite(regionIndex) ? regionIndex : 0;
  const dlg =
    state ??
    ensureAdventurerDialogState(foeRecord, {
      kind: 'ADVENTURER_MEETING',
      adv,
      tension: resolvedTension,
      wager,
      regionIndex: safeRegion,
    });

  const rawOptions = [];
  const wagerDone = Boolean(dlg.used.wager || foeRecord?._surrenderedSpar);

  if (!wagerDone) {
    rawOptions.push({
      labelText: LIVING_WORDS.adventurerOptionDuel(wager),
      action: () => {
        dlg.used.wager = true;
        playSound?.(LIVING_SOUNDS.SWORD_CLINK);
        if (foeRecord && (foeRecord.motor || (foeRecord.entity && foeRecord.ai))) {
          foeRecord._isSparring = true;
          foeRecord._duelWager = wager;
          foeRecord._advRecord = adv;
          foeRecord._advDialog = dlg;
          foeRecord._surrenderedSpar = false;
          foeRecord._sparGraceLeft = 0;
          foeRecord._sparKneeling = false;
          if (foeRecord.ai) {
            foeRecord.ai.isHostile = true;
            foeRecord.ai.detected = true;
            foeRecord.ai.target = playerEntity;
            foeRecord.ai.secondaryTarget = null;
            foeRecord.ai.makeHostileToPlayer?.(undefined, foeRecord.ai.feet);
            if (typeof foeRecord.ai.resumeLive === 'function') foeRecord.ai.resumeLive();
          }
          say(LIVING_WORDS.adventurerDuelChallenge(), 5);
        } else {
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
          const won = res.outcome === DUEL_OUTCOME.PLAYER_WON || res.outcome === DUEL_OUTCOME.LUCK_REVERSAL;
          dlg.sparOutcome = won ? 'PLAYER_WON' : 'PLAYER_LOST';
          if (res.outcome === DUEL_OUTCOME.PLAYER_WON) {
            playSound?.(LIVING_SOUNDS.GOLD_COINS);
            recordAdventurerGrudge(adv.name);
          }
          say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, Math.abs(res.goldDelta)), 5);
        }
      },
    });
  }

  if (!dlg.used.etiquette) {
    rawOptions.push({
      labelText: LIVING_WORDS.adventurerOptionEtiquette(),
      action: () => {
        dlg.used.etiquette = true;
        const res = resolveAdventurerEncounter({
          adv,
          playerEntity,
          action: 'APPEAL_ETIQUETTE',
          wagerGold: wager,
          rng,
        });
        if (res.outcome === DUEL_OUTCOME.HOSTILE_DRAW) {
          onHostile?.();
          say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, 0), 5);
        } else if (res.outcome === DUEL_OUTCOME.DIPLOMACY_PEACE) {
          adjustPlayerRegionalRep(playerEntity, safeRegion, 1);
          onPeaceful?.();
          say(LIVING_WORDS.adventurerPeaceParted(adv.name), 5);
        } else {
          say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, 0), 5);
        }
      },
    });
  }

  if (!dlg.used.intimidate) {
    rawOptions.push({
      labelText: LIVING_WORDS.adventurerOptionIntimidate(),
      action: () => {
        dlg.used.intimidate = true;
        const res = resolveAdventurerEncounter({
          adv,
          playerEntity,
          action: 'INTIMIDATE',
          wagerGold: wager,
          rng,
        });
        if (res.outcome === DUEL_OUTCOME.HOSTILE_DRAW) onHostile?.();
        say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, 0), 5);
      },
    });
  }

  if (adv.trait !== 'CUTTHROAT') {
    const dailyQuote = calculateAdventurerHireQuote(adv, playerEntity, {
      days: 1,
      regionIndex: safeRegion,
      nowMinutes,
    });
    rawOptions.push({
      labelText: LIVING_WORDS.roadAdvOptionRecruit(dailyQuote.dailyCost),
      action: () => {
        const subSpec = buildAdventurerHireSubmenuSpec({
          adv,
          playerEntity,
          regionIndex: safeRegion,
          nowMinutes,
          situation: ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
          openChoice,
          say,
          playSound,
          onHired: (comp, res) => onHired?.(comp, foeRecord, res),
          rng,
        });
        if (typeof openChoice === 'function') {
          openChoice(subSpec);
        } else {
          subSpec.options[0]?.action?.();
        }
      },
    });
  }

  if (rawOptions.length === 0) {
    return null;
  }

  rawOptions.push({
    labelText: LIVING_WORDS.adventurerOptionDecline(),
    action: () => {
      say(LIVING_WORDS.adventurerOutcome(DUEL_OUTCOME.DECLINED, adv.name, 0), 4);
    },
  });

  if (!wagerDone && !dlg.used.etiquette && !dlg.used.intimidate) {
    rawOptions.push({
      labelText: LIVING_WORDS.surrenderOptionForfeitDuel(wager),
      action: () => {
        if (playerEntity) {
          const currentGold = Number(playerEntity.goldPieces ?? 0);
          const forfeitPaid = Math.min(currentGold, wager);
          playerEntity.goldPieces = Math.max(0, currentGold - forfeitPaid);
        }
        say(LIVING_WORDS.surrenderOutcomeConceded(), 5);
        onForfeit?.();
      },
    });
  }

  const lines = adventurerDialogHeader(adv, dlg, [
    `${adv.name} (${adv.className}, Lv.${adv.level}): "${LIVING_WORDS.adventurerGreeting(adv.trait, wager)}"`,
  ]);
  return { lines, options: numberChoiceOptions(rawOptions) };
}

/**
 * Builds an interactive ChoiceWindow spec for a WANDERING_ADVENTURER road/wilderness encounter.
 * Returns `null` when extorted or when no actionable options remain.
 * @param {any} params
 */
export function buildWanderingAdventurerChoiceSpec({
  adv,
  situation = ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
  playerEntity,
  foeRecord = null,
  regionIndex = 0,
  nowMinutes = 0,
  state = null,
  openChoice = null,
  playSound = null,
  onHostile = null,
  onHired = null,
  resolveRegionDungeon = null,
  discoverDungeon = null,
  addNote = null,
  surfacePlayer = null,
  say = () => {},
  rng = Math.random,
}) {
  if (!adv) return null;
  const safeRegion = Number.isFinite(regionIndex) ? regionIndex : 0;
  const wager = Math.max(25, (adv.level || 3) * 15);
  const dlg =
    state ??
    ensureAdventurerDialogState(foeRecord, {
      kind: 'WANDERING_ADVENTURER',
      adv,
      situation,
      wager,
      regionIndex: safeRegion,
    });

  if (dlg.extorted) return null;

  const rawOptions = [];

  if (!dlg.used.intel) {
    rawOptions.push({
      labelText: LIVING_WORDS.roadAdvOptionIntelFor(situation),
      action: () => {
        dlg.used.intel = true;
        const res = resolveWanderingAdventurerInteraction({
          adv,
          situation,
          playerEntity,
          action: 'SHARE_INTEL',
          regionIndex: safeRegion,
          nowMinutes,
          resolveRegionDungeon,
          discoverDungeon,
          rng,
        });
        if (res.healthRestored > 0 || res.fatigueRestored > 0) {
          surfacePlayer?.();
        }
        const flavorLine =
          res.traitTone === 'GUARDED' && !res.dungeonIntel && !res.roadNews
            ? LIVING_WORDS.roadAdvIntelGuarded(adv.name)
            : situation === ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP
              ? LIVING_WORDS.roadAdvIntelCamp(adv.name)
              : situation === ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS
                ? LIVING_WORDS.roadAdvIntelSkirmish(adv.name)
                : situation === ROAD_ADVENTURER_SITUATION.RETURNING_WITH_SPOILS
                  ? LIVING_WORDS.roadAdvIntelSpoils(adv.name)
                  : LIVING_WORDS.roadAdvIntelRoad(adv.name);
        say(flavorLine, 6);
        if (res.roadNews?.rumor) {
          say(LIVING_WORDS.roadAdvNewsLine(res.roadNews.rumor), 6);
        }
        if (res.dungeonIntel) {
          const di = res.dungeonIntel;
          let intelLine = '';
          if (di.type === 'FALLEN_REMAINS') {
            intelLine = LIVING_WORDS.roadAdvIntelFallen(di.fallenName, di.fallenLevel, di.dungeonName);
          } else if (di.type === 'CLEARED_COOLDOWN') {
            intelLine = LIVING_WORDS.roadAdvIntelCleared(di.dungeonName, di.daysLeft);
          } else if (di.type === 'INTERCEPTED_QUEST') {
            intelLine = LIVING_WORDS.roadAdvIntelIntercepted(di.rivalName, di.dungeonName);
          } else {
            intelLine = LIVING_WORDS.roadAdvIntelDiscovered(di.dungeonName);
          }
          if (intelLine) {
            say(intelLine, 6);
            addNote?.(`${adv.name}: ${intelLine}`);
          }
          if (di.newlyDiscovered && di.dungeonName) {
            say(LIVING_WORDS.roadAdvNotifyMapUpdated(di.dungeonName), 5);
          }
        }
        if (res.goldDelta > 0) {
          playSound?.(LIVING_SOUNDS.GOLD_COINS);
          say(LIVING_WORDS.notifyGoldGained(res.goldDelta), 5);
        }
        if (res.healthRestored > 0) {
          say(LIVING_WORDS.notifyHealthGained(res.healthRestored), 5);
        }
        if (res.fatigueRestored > 0) {
          say(LIVING_WORDS.notifyFatigueGained(res.fatigueRestored), 5);
        }
        if (res.repDelta > 0) {
          say(LIVING_WORDS.notifyRepGained(res.regionName || 'Region', res.repDelta), 5);
        }
        if (res.roadWarningGranted) {
          say(LIVING_WORDS.roadAdvNotifySafeRoad(res.roadIntelHours || 24), 5);
        }
        if (res.practicedSkill) {
          say(LIVING_WORDS.roadAdvNotifySkill(res.practicedSkill), 4);
        }
      },
    });
  }

  const dailyQuote = calculateAdventurerHireQuote(adv, playerEntity, {
    days: 1,
    regionIndex: safeRegion,
    nowMinutes,
  });
  rawOptions.push({
    labelText: LIVING_WORDS.roadAdvOptionRecruit(dailyQuote.dailyCost),
    action: () => {
      const subSpec = buildAdventurerHireSubmenuSpec({
        adv,
        playerEntity,
        regionIndex: safeRegion,
        nowMinutes,
        situation,
        openChoice,
        say,
        playSound,
        onHired: (comp, res) => onHired?.(comp, foeRecord, res),
        rng,
      });
      if (typeof openChoice === 'function') {
        openChoice(subSpec);
      } else {
        subSpec.options[0]?.action?.();
      }
    },
  });

  if (!dlg.used.wager && !foeRecord?._surrenderedSpar) {
    rawOptions.push({
      labelText: LIVING_WORDS.roadAdvOptionSpar(wager),
      action: () => {
        dlg.used.wager = true;
        playSound?.(LIVING_SOUNDS.SWORD_CLINK);
        if (foeRecord && (foeRecord.motor || (foeRecord.entity && foeRecord.ai))) {
          foeRecord._isSparring = true;
          foeRecord._duelWager = wager;
          foeRecord._advRecord = adv;
          foeRecord._advDialog = dlg;
          foeRecord._surrenderedSpar = false;
          foeRecord._sparGraceLeft = 0;
          foeRecord._sparKneeling = false;
          if (foeRecord.ai) {
            foeRecord.ai.isHostile = true;
            foeRecord.ai.detected = true;
            foeRecord.ai.target = playerEntity;
            foeRecord.ai.secondaryTarget = null;
            foeRecord.ai.makeHostileToPlayer?.(undefined, foeRecord.ai.feet);
            if (typeof foeRecord.ai.resumeLive === 'function') foeRecord.ai.resumeLive();
          }
          say(LIVING_WORDS.adventurerDuelChallenge(), 5);
        } else {
          const res = resolveWanderingAdventurerInteraction({
            adv,
            situation,
            playerEntity,
            action: 'WAGER_SPAR',
            regionIndex: safeRegion,
            rng,
          });
          dlg.sparOutcome = res.outcome === WANDERING_OUTCOME.SPAR_WON ? 'PLAYER_WON' : 'PLAYER_LOST';
          if (res.outcome === WANDERING_OUTCOME.SPAR_WON) {
            playSound?.(LIVING_SOUNDS.GOLD_COINS);
            recordAdventurerGrudge(adv.name);
          }
          say(
            LIVING_WORDS.adventurerOutcome(
              res.outcome === WANDERING_OUTCOME.SPAR_WON ? DUEL_OUTCOME.PLAYER_WON : DUEL_OUTCOME.PLAYER_LOST,
              adv.name,
              Math.abs(res.goldDelta),
            ),
            5,
          );
        }
      },
    });
  }

  if (!dlg.used.extort) {
    rawOptions.push({
      labelText: LIVING_WORDS.roadAdvOptionExtort(),
      action: () => {
        dlg.used.extort = true;
        const res = resolveWanderingAdventurerInteraction({
          adv,
          situation,
          playerEntity,
          action: 'EXTORT_SPOILS',
          regionIndex: safeRegion,
          rng,
        });
        if (res.outcome === WANDERING_OUTCOME.EXTORTED_SPOILS) {
          dlg.extorted = true;
          playSound?.(LIVING_SOUNDS.GOLD_COINS);
          recordAdventurerGrudge(adv.name);
          say(
            res.messageKey === 'living.roadAdv.extortPartial'
              ? LIVING_WORDS.roadAdvExtortPartial(adv.name)
              : LIVING_WORDS.roadAdvExtorted(adv.name),
            5,
          );
        } else if (res.hostile) {
          onHostile?.();
          say(LIVING_WORDS.adventurerDuelChallenge(), 5);
        }
      },
    });
  }

  if (rawOptions.length === 0) return null;

  rawOptions.push({
    labelText: LIVING_WORDS.adventurerOptionDecline(),
    action: () => {
      say(LIVING_WORDS.roadAdvParted(), 4);
    },
  });

  const introLine =
    situation === ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP
      ? LIVING_WORDS.roadAdvCamp(adv.name)
      : situation === ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS
        ? LIVING_WORDS.roadAdvSkirmish(adv.name)
        : situation === ROAD_ADVENTURER_SITUATION.RETURNING_WITH_SPOILS
          ? LIVING_WORDS.roadAdvSpoils(adv.name)
          : LIVING_WORDS.roadAdvTraveling(adv.name);

  const lines = adventurerDialogHeader(adv, dlg, [
    introLine,
    `${adv.name} (${adv.className}, Lv.${adv.level})`,
  ]);
  return { lines, options: numberChoiceOptions(rawOptions) };
}

/**
 * Builds an interactive ChoiceWindow spec for a dungeon rival adventurer.
 * @param {any} params
 */
export function buildDungeonAdventurerChoiceSpec({
  adv,
  intercepted = null,
  locationId,
  regionIndex = null,
  playerEntity,
  foeRecord = null,
  nowMinutes = 0,
  state = null,
  openChoice = null,
  playSound = null,
  onHired = null,
  say = () => {},
  rng = Math.random,
}) {
  if (intercepted) {
    if (intercepted.recovered || intercepted.forfeited) {
      return null;
    }
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
              addItem(foeRecord.entity.items, setItemFields({
                group: 'QuestItems',
                templateIndex: 283,
                name: `${adv.name}'s Claimed Quest Trophy`,
                shortName: `${adv.name}'s Claimed Quest Trophy`,
                value: buyoutGold,
                weightInKg: 0.25,
              }));
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
              addItem(playerEntity.items, setItemFields({
                group: 'QuestItems',
                templateIndex: 283,
                name: `Reclaimed Quest Trophy`,
                shortName: `Reclaimed Quest Trophy`,
                value: buyoutGold,
                weightInKg: 0.25,
              }));
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
              addItem(playerEntity.items, setItemFields({
                group: 'QuestItems',
                templateIndex: 283,
                name: `Reclaimed Quest Trophy`,
                shortName: `Reclaimed Quest Trophy`,
                value: buyoutGold,
                weightInKg: 0.25,
              }));
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
          label: `4. ${LIVING_WORDS.surrenderOptionConcedeClaim()}`,
          action: () => {
            confrontInterceptingAdventurer({
              locationId,
              regionIndex,
              playerEntity,
              method: 'FORFEIT',
              rng,
            });
            say(LIVING_WORDS.surrenderOutcomeConceded());
          },
        },
      ],
    };
  }

  const tension = evaluateAdventurerTension(adv, playerEntity);
  const wager = tension.wagerGold ?? 50;
  const safeRegion = Number.isFinite(regionIndex) ? regionIndex : 0;
  const dlg =
    state ??
    ensureAdventurerDialogState(foeRecord, {
      kind: 'DUNGEON_ADVENTURER',
      adv,
      tension,
      wager,
      locationId,
      regionIndex: safeRegion,
    });

  const rawOptions = [];
  const wagerDone = Boolean(dlg.used.wager || foeRecord?._surrenderedSpar);

  if (!wagerDone) {
    rawOptions.push({
      labelText: LIVING_WORDS.adventurerOptionDuel(wager),
      action: () => {
        dlg.used.wager = true;
        if (foeRecord) {
          foeRecord._isSparring = true;
          foeRecord._duelWager = wager;
          foeRecord._advRecord = adv;
          foeRecord._advDialog = dlg;
          foeRecord._surrenderedSpar = false;
          foeRecord._sparGraceLeft = 0;
          foeRecord._sparKneeling = false;
          if (foeRecord.ai) {
            foeRecord.ai.isHostile = true;
            foeRecord.ai.detected = true;
            foeRecord.ai.target = playerEntity;
            foeRecord.ai.secondaryTarget = null;
          }
        }
        say(LIVING_WORDS.adventurerDuelChallenge());
      },
    });
  }

  if (!dlg.used.etiquette) {
    rawOptions.push({
      labelText: LIVING_WORDS.adventurerOptionEtiquette(),
      action: () => {
        dlg.used.etiquette = true;
        const res = resolveAdventurerEncounter({
          adv,
          playerEntity,
          action: 'APPEAL_ETIQUETTE',
          wagerGold: wager,
          rng,
        });
        if (res.outcome === DUEL_OUTCOME.DIPLOMACY_PEACE) {
          if (foeRecord?.ai) {
            foeRecord.ai.isHostile = false;
          }
          say(LIVING_WORDS.adventurerPeaceParted(adv.name));
          return;
        }
        if (res.outcome === DUEL_OUTCOME.HOSTILE_DRAW && foeRecord?.ai) {
          foeRecord.ai.isHostile = true;
          foeRecord.ai.detected = true;
        }
        say(LIVING_WORDS.adventurerOutcome(res.outcome, adv.name, 0));
      },
    });
  }

  if (!dlg.used.intimidate) {
    rawOptions.push({
      labelText: LIVING_WORDS.adventurerOptionIntimidate(),
      action: () => {
        dlg.used.intimidate = true;
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
    });
  }

  if (adv.trait !== 'CUTTHROAT') {
    const dailyQuote = calculateAdventurerHireQuote(adv, playerEntity, {
      days: 1,
      regionIndex: safeRegion,
      nowMinutes,
    });
    rawOptions.push({
      labelText: LIVING_WORDS.roadAdvOptionRecruit(dailyQuote.dailyCost),
      action: () => {
        const subSpec = buildAdventurerHireSubmenuSpec({
          adv,
          playerEntity,
          regionIndex: safeRegion,
          nowMinutes,
          situation: ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
          openChoice,
          say,
          playSound,
          onHired: (comp) => {
            if (foeRecord && comp) {
              applyCompanionEntityStamp(foeRecord, comp);
              if (foeRecord.ai) foeRecord.ai.detected = true;
            }
            onHired?.(comp, foeRecord);
          },
          rng,
        });
        if (typeof openChoice === 'function') {
          openChoice(subSpec);
        } else {
          subSpec.options[0]?.action?.();
        }
      },
    });
  }

  if (rawOptions.length === 0) {
    return null;
  }

  rawOptions.push({
    labelText: LIVING_WORDS.adventurerOptionDecline(),
    action: () => {
      say(LIVING_WORDS.adventurerOutcome(DUEL_OUTCOME.DECLINED, adv.name, 0));
    },
  });

  const lines = adventurerDialogHeader(adv, dlg, [
    `${adv.name} (${adv.className}, Lv.${adv.level}): "${LIVING_WORDS.adventurerGreeting(adv.trait, wager)}"`,
  ]);
  return { lines, options: numberChoiceOptions(rawOptions) };
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
    const roadIntel = getActiveRoadIntelBuff(ctx?.nowMinutes ?? 0);
    const roadIntelStr = roadIntel.active
      ? `, roadIntel=${Math.max(1, Math.ceil(roadIntel.remainingMinutes / 60))}h`
      : '';
    return (
      `[Living Tamriel] Region ${regIdx} (${regState.regionName}): crises=[${crisisStr}], ` +
      `tension=${regState.tension.toFixed(1)}, ` +
      `companion=${comp ? comp.displayName : 'none'}, contract=${contract ? contract.questType : 'none'}, cooldown=${getLivingLocationCooldownMinutes()}m, prosperity=${getSettlementProsperityDelta(ctx?.mapId)}${roadIntelStr}`
    );
  }

  if (sub === 'prosperity') {
    const val = cleanArgs[1]?.toLowerCase();
    const mapId = ctx?.mapId ?? null;
    if (val === 'clear' || val === 'reset') {
      clearSettlementProsperity();
      return '[Living Tamriel] Cleared all local settlement prosperity modifiers.';
    }
    if (val !== undefined && val !== 'status') {
      if (mapId == null) {
        return '[Living Tamriel] Stand inside a settlement to set its local prosperity modifier.';
      }
      const parsed = Number(val);
      if (!Number.isFinite(parsed)) {
        return 'Usage: /living prosperity [<-5..+5>|clear|status]';
      }
      const applied = setSettlementProsperity(mapId, parsed, Math.floor((ctx?.nowMinutes ?? 0) / 1440));
      const total = getTotalSettlementProsperityShift(mapId, regIdx);
      return `[Living Tamriel] Settlement ${mapId} local prosperity set to ${applied >= 0 ? `+${applied}` : applied} (total shop quality shift: ${total >= 0 ? `+${total}` : total}).`;
    }
    const local = getSettlementProsperityDelta(mapId);
    const crisis = getRegionProsperityShift(regIdx);
    const total = getTotalSettlementProsperityShift(mapId, regIdx);
    return `[Living Tamriel] Prosperity shift (map=${mapId ?? 'none'}): local=${local >= 0 ? `+${local}` : local}, crisis=${crisis >= 0 ? `+${crisis}` : crisis}, total=${total >= 0 ? `+${total}` : total}.`;
  }

  if (sub === 'scale' || sub === 'density') {
    const val = cleanArgs[1]?.toLowerCase();
    if (val) {
      if (val === 'low' || val === '1') LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.LOW;
      else if (val === 'high' || val === '4' || val === '3') LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.HIGH;
      else if (val === 'mid' || val === '2') LivingTamrielConfig.encounterScale = LIVING_ENCOUNTER_SCALE.MID;
    }
    const cur = getLivingEncounterScale();
    const name = cur === LIVING_ENCOUNTER_SCALE.LOW ? 'LOW (x1)' : (cur === LIVING_ENCOUNTER_SCALE.HIGH ? 'HIGH (x4)' : 'MID (x2)');
    return `[Living Tamriel] Encounter mass scale: ${name} (multiplier: ${cur}x).`;
  }

  if (sub === 'cooldown') {
    const val = cleanArgs[1]?.toLowerCase();
    if (val === 'clear' || val === 'reset') {
      locationEventCooldowns.clear();
      return `[Living Tamriel] Cleared all settlement event cooldown timers (setting: ${getLivingLocationCooldownMinutes()}m).`;
    }
    if (val) {
      LivingTamrielConfig.locationCooldownMinutes = cleanArgs[1];
    }
    return `[Living Tamriel] Settlement event cooldown: ${getLivingLocationCooldownMinutes()}m (active location timers: ${locationEventCooldowns.size}).`;
  }

  if (sub === 'loot') {
    const val = cleanArgs[1]?.toLowerCase();
    if (val) {
      if (val === 'full') LivingTamrielConfig.urbanLootMode = LIVING_URBAN_LOOT.FULL;
      else if (val === 'supplies' || val === 'gold') LivingTamrielConfig.urbanLootMode = LIVING_URBAN_LOOT.SUPPLIES;
      else if (val === 'zero' || val === 'none') LivingTamrielConfig.urbanLootMode = LIVING_URBAN_LOOT.ZERO;
    }
    return `[Living Tamriel] Loot policies:\n- Urban Skirmishes: ${LivingTamrielConfig.urbanLootMode.toUpperCase()}\n- Wilderness & Camps: ${LivingTamrielConfig.wildernessLootMode.toUpperCase()}`;
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
        ...list.map((a, idx) => {
          const name = getAdventurerDisplayName(a);
          const coordStr = a.targetPixel ? ` (${a.targetPixel.x},${a.targetPixel.y})` : '';
          return `- [#${idx} ID:${a.id}] ${name} | Lvl ${a.level} ${a.className} | Gear T${a.gearTier} | Trait: ${a.trait} | Status: ${a.status}${a.targetLocationName ? ` -> ${a.targetLocationName}${coordStr}` : ''} | Duels: ${a.duelsWon ?? 0}W/${a.duelsLost ?? 0}L`;
        }),
      ].join('\n');
    }
    if (act === 'setlevel') {
      const idOrName = cleanArgs[2];
      const newLvl = parseInt(cleanArgs[3], 10);
      if (idOrName == null || !Number.isFinite(newLvl)) return 'Usage: /living adv setlevel <name|id|index> <level (1..45)>';
      const adv = setAdventurerLevel(idOrName, newLvl);
      if (!adv) return `[Living Tamriel] Adventurer "${idOrName}" not found.`;
      return `[Living Tamriel] Updated ${adv.name} to Level ${adv.level} (Gear Tier T${adv.gearTier}).`;
    }
    if (act === 'settrait') {
      const idOrName = cleanArgs[2];
      const newTrait = cleanArgs[3];
      if (idOrName == null || !newTrait) {
        return `Usage: /living adv settrait <name|id|index> <${ADVENTURER_TRAITS.join('|')}>`;
      }
      const adv = setAdventurerTrait(idOrName, newTrait);
      if (!adv) {
        return `[Living Tamriel] Adventurer "${idOrName}" not found or invalid trait (valid: ${ADVENTURER_TRAITS.join(', ')}).`;
      }
      return `[Living Tamriel] Updated ${adv.name} trait to ${adv.trait}.`;
    }
    if (act === 'quote') {
      const query = cleanArgs[2];
      const daysArg = parseInt(cleanArgs[3], 10);
      const days = Number.isFinite(daysArg) ? Math.max(1, Math.min(MAX_COMPANION_CONTRACT_DAYS, daysArg)) : 1;
      let adv = null;
      if (query == null) {
        adv = getActiveAdventurerCompanion(ctx?.nowMinutes ?? 0)
          || pool.find((a) => a.currentRegion === regIdx && a.status !== ADVENTURER_STATUS.DEAD)
          || pool[0];
      } else if (Number.isFinite(Number(query))) {
        const num = Number(query);
        adv = pool.find((a) => a.id === num) || pool[num];
      } else {
        adv = pool.find((a) => (a.name || '').toLowerCase().includes(String(query).toLowerCase()));
      }
      if (!adv) return '[Living Tamriel] No matching adventurer found for quote.';
      const q = calculateAdventurerHireQuote(adv, ctx?.playerEntity ?? null, {
        days,
        regionIndex: regIdx,
        nowMinutes: ctx?.nowMinutes ?? 0,
      });
      const repBit = q.repBuyMult !== 1 ? ` | RepRate=x${q.repBuyMult.toFixed(2)}` : '';
      const disgBit = q.disguised ? ' | Disguised=YES' : '';
      return [
        `[Living Tamriel] Hire Quote: ${getAdventurerDisplayName(adv)} (Lv.${q.advLevel} ${adv.className || 'Warrior'}, Trait: ${adv.trait}, Haggle Quality: ${q.quality})`,
        `  Base: ${q.baseDaily}g/day | Quoted: ${q.dailyCost}g/day | ${q.days}d Total: ${q.totalCost}g (Discount: ${q.discountPct}%)`,
        `  Player Inputs: Mercantile=${q.mercantile}, Personality=${q.personality}, EffPers=${q.effectivePersonality}, Taint=${q.tradeTaint}${disgBit}${repBit} | MerchantsFestival=${q.isMerchantsFestival ? 'YES (-50%)' : 'no'} | WartimeRate=${q.isWartime ? `x${q.warFactor.toFixed(2)}` : '1.00'}`,
      ].join('\n');
    }
    if (act === 'companion') {
      const subAct = String(cleanArgs[2] ?? 'status').toLowerCase();
      const nowMin = ctx?.nowMinutes ?? 0;
      const comp = getActiveAdventurerCompanion(nowMin);
      if (subAct === 'dismiss') {
        if (!comp) return '[Living Tamriel] No active adventurer companion to dismiss.';
        dismissAdventurerCompanion();
        ctx?.sceneHost?.dismissCompanionBody?.();
        ctx?.dungeonCtx?.dismissLivingCompanion?.();
        return `[Living Tamriel] Dismissed companion ${comp.displayName || comp.name} (no refund).`;
      }
      if (subAct === 'kill') {
        const foe = ctx?.sceneHost?.getCompanionFoe?.() || ctx?.dungeonCtx?.getLivingCompanionFoe?.();
        if (foe?.entity) {
          foe.lootDropped = true;
          foe._suppressLoot = true;
          foe.entity.items = [];
          foe.entity.goldPieces = 0;
          foe.entity.health = 0;
          return `[Living Tamriel] Struck down active companion ${comp?.displayName || foe.entity.name || 'Companion'} (HP set to 0; zero-loot death).`;
        }
        if (comp) {
          dismissAdventurerCompanion();
          ctx?.sceneHost?.dismissCompanionBody?.();
          ctx?.dungeonCtx?.dismissLivingCompanion?.();
          return `[Living Tamriel] Companion ${comp.displayName || comp.name} had no live body in scene and was dismissed.`;
        }
        return '[Living Tamriel] No active adventurer companion.';
      }
      if (!comp) return 'No active adventurer companion.';
      const remMin = getCompanionRemainingMinutes(comp, nowMin);
      const remHours = Math.max(0, Math.ceil(remMin / 60));
      const q = calculateAdventurerHireQuote(comp, ctx?.playerEntity ?? null, {
        days: 1,
        regionIndex: regIdx,
        nowMinutes: nowMin,
      });
      return `[Living Tamriel] Active Companion: ${comp.displayName || comp.name} (${comp.className}, Lv.${comp.level}, T${comp.gearTier}, Trait: ${comp.trait}) | ${remHours}h (${Math.round(remMin)}m) remaining | Rate: ${q.dailyCost}g/day`;
    }
    if (act === 'tick') {
      const days = Math.max(1, Math.min(365, parseInt(cleanArgs[2], 10) || 1));
      const dailyLogs = [];
      for (let d = 0; d < days; d++) {
        const res = tickAdventurerSimulation({ playerEntity: ctx?.playerEntity, rng: Math.random });
        if (res?.events?.length) {
          dailyLogs.push(`Day ${d + 1}: ${res.events.slice(0, 3).join('; ')}` + (res.events.length > 3 ? ` (+${res.events.length - 3} more)` : ''));
        }
      }
      const summary = `[Living Tamriel] Simulated ${days} day(s) of adventurer ecosystem activity.`;
      if (dailyLogs.length === 0) {
        return summary + ' (All adventurers currently resting or in transit)';
      }
      return summary + '\n' + dailyLogs.slice(0, 6).join('\n') + (dailyLogs.length > 6 ? `\n...and ${dailyLogs.length - 6} more days.` : '');
    }
    if (act === 'kill_in_dungeon') {
      const targetReg = cleanArgs[2] != null ? parseInt(cleanArgs[2], 10) : regIdx;
      const res = killAdventurerInDungeon(Number.isFinite(targetReg) ? targetReg : null);
      if (!res) return '[Living Tamriel] No active delving adventurer found to kill.';
      return `[Living Tamriel] Adventurer ${res.adventurer.name} (${res.adventurer.className}, Lv.${res.adventurer.level}) fell in ${res.dungeonName} (${res.dungeonId})! Fallen remains recorded in boss chest.`;
    }
    if (act === 'summon') {
      const query = String(cleanArgs[2] ?? 'random').toLowerCase();
      let match = null;
      if (query === 'random') {
        const live = pool.filter((a) => a.status !== ADVENTURER_STATUS.DEAD);
        match = live[Math.floor(Math.random() * live.length)] || pool[0];
      } else if (query === 'nearest') {
        match = pool.find((a) => a.currentRegion === regIdx && a.status !== ADVENTURER_STATUS.DEAD) || pool[0];
      } else if (Number.isFinite(Number(query))) {
        const num = Number(query);
        match = pool.find((a) => a.id === num) || pool[num];
      } else {
        match = pool.find((a) => (a.name || '').toLowerCase().includes(query));
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
    return 'Usage: /living adv <list [region] | summon [nearest|random|<name>] | setlevel <name|id|index> <level> | settrait <name|id|index> <trait> | quote [name|id|index] [days] | companion [status|dismiss|kill] | tick <days> | kill_in_dungeon [region]>';
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
      urban: LIVING_SITE_KINDS.URBAN_SKIRMISH,
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
    const pleaAliasMap = {
      drunk: PLEA_TYPE.DRUNKEN_BRAWLER,
      cart: PLEA_TYPE.BROKEN_CART_MERCHANT,
      hound: PLEA_TYPE.STRAY_HOUND_HANDLER,
      preacher: PLEA_TYPE.STREET_PREACHER,
      urchin: PLEA_TYPE.ACCUSED_URCHIN,
      duelist: PLEA_TYPE.BOASTFUL_DUELIST,
      plague: PLEA_TYPE.PLAGUE_CURE,
      famine: PLEA_TYPE.FAMINE_BREAD,
      refugee: PLEA_TYPE.WAR_REFUGEE,
      escort: PLEA_TYPE.ESCORT_REQUEST,
    };
    const rawKind = String(cleanArgs[1] ?? 'checkpoint').toLowerCase();
    const mapped = aliasMap[rawKind] || rawKind.toUpperCase();
    const validKind = Object.values(LIVING_SITE_KINDS).includes(/** @type {any} */ (mapped))
      ? mapped
      : LIVING_SITE_KINDS.CHECKPOINT;
    if (validKind === LIVING_SITE_KINDS.CHECKPOINT) {
      clearRegionalCheckpointPass(regIdx);
    }
    const feet = ctx?.playerFeet ?? [0, 0, 0];
    const heightAt = ctx?.heightAt ?? (() => feet[1] || 0);
    const spawnDist = validKind === LIVING_SITE_KINDS.PLEA_ENCOUNTER ? 8 : 14;
    const safe = findSafeSiteCenter(ctx, feet, spawnDist, Math.PI * 0.25, 4.0);
    const advSitAliasMap = {
      camp: ROAD_ADVENTURER_SITUATION.ROADSIDE_CAMP,
      road: ROAD_ADVENTURER_SITUATION.TRAVELING_ON_ROAD,
      skirmish: ROAD_ADVENTURER_SITUATION.SKIRMISH_WITH_MONSTERS,
      spoils: ROAD_ADVENTURER_SITUATION.RETURNING_WITH_SPOILS,
    };
    const rawDetail = cleanArgs[2] ? String(cleanArgs[2]).trim() : null;
    const resolvedPlea = rawDetail
      ? (pleaAliasMap[rawDetail.toLowerCase()] ?? rawDetail.toUpperCase())
      : null;
    const resolvedAdvSituation =
      validKind === LIVING_SITE_KINDS.WANDERING_ADVENTURER && rawDetail
        ? (advSitAliasMap[rawDetail.toLowerCase()] ?? rawDetail.toUpperCase())
        : null;
    const bp = buildLivingSiteBlueprint({
      kind: validKind,
      centerX: safe.x,
      centerZ: safe.z,
      heightAt,
      regionIndex: regIdx,
      playerEntity: ctx?.playerEntity ?? null,
      nowMinutes: ctx?.nowMinutes ?? 0,
      onRoad: true,
      climateIndex: ctx?.climateIndex ?? null,
      forcedEventId: validKind === LIVING_SITE_KINDS.URBAN_SKIRMISH && rawDetail ? rawDetail.toUpperCase() : null,
      forcedPleaType: validKind === LIVING_SITE_KINDS.PLEA_ENCOUNTER ? resolvedPlea : null,
      forcedSituation: resolvedAdvSituation,
    });
    if (!bp) {
      return `[Living Tamriel] Could not spawn ${validKind} at current spot (terrain steep or not streamed).`;
    }
    ctx?.sceneHost?.standBlueprint?.(bp);
    let detailTag = '';
    if (validKind === LIVING_SITE_KINDS.URBAN_SKIRMISH) {
      detailTag = ` [${bp.meta?.event?.id ?? 'default'} / ${bp.meta?.propTheme ?? 'default'}]`;
    } else if (validKind === LIVING_SITE_KINDS.PLEA_ENCOUNTER) {
      detailTag = ` [${bp.meta?.plea?.type ?? 'default'}]`;
    } else if (validKind === LIVING_SITE_KINDS.WANDERING_ADVENTURER) {
      detailTag = ` [${bp.meta?.situation ?? 'default'}]`;
    }
    return `[Living Tamriel] Spawned ${validKind}${detailTag} (${bp.meshes.length} meshes, ${bp.flats.length} flats, ${bp.actors.length} actors).`;
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

  return 'Usage: /living <status | prosperity [<-5..+5>|clear|status] | cooldown [2h|8h|24h|3d|clear] | scale [low|mid|high] | loot [zero|supplies|full] | traits [0..3|off|light|mid|high] | crisis <TYPE> [PHASE] | [site] spawn <KIND> [DETAIL] | encounter [random|wild|camp|merchant|adv|bandit|plea] | adv <list|summon> | roll [Skill] [DC] [Formula] | formulas | quest>';
}

