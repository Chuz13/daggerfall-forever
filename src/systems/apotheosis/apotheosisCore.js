// @ts-check
// Apotheosis Stage 0: Fate Weight evaluation, progression counters, Artifact
// Sacrifice validation, shared questline seam, Ascension state, and Portfolios.

import { t } from '../textManager.js';
import { setSkyMinutesOverride } from '../worldTick.js';
import { EQUIP_SLOTS, equipTableOf } from '../equip.js';
import {
  ARTIFACT_SUB_TYPE_NAMES,
  ITEM_GROUP_NAME_BY_CLASS,
  artifactTextureIndices,
  createArtifact,
  getMagicItemTemplates,
  legacyArtifactIndexBitfieldCheck,
  legacyGetArtifactSubType,
} from '../loot/loot.js';
import { ARTIFACT_RECORDS } from '../item/itemLaw.js';
import { GROUP_TEMPLATE_INDICES } from '../item/itemTemplates.js';
import { SKILLS, SKILL_COUNT, realSkillValue } from '../skills.js';
import { pathOf } from '../arcanePaths.js';
import { martialPathOf } from '../martialPaths.js';
import { liveStat, STAT_KEYS_ORDER } from '../statMods.js';
import { isAnyLich } from '../necromancy/lichdomStatus.js';
import { liveVampirism } from '../racialLive.js';
import { liveLycanthropy } from '../lycanthropy.js';
import { registerPlayerKillListener } from '../playerKills.js';
import { PROFESSIONS, PROF_RANK_MAX } from '../../net/professionLaw.js';
import { activeMemberships, isMember } from '../guild/guilds.js';
import { snapshotDiscovery } from '../discovery.js';
import { snapshotAutomap } from '../automap/automap.js';
import { firmamentTree } from '../firmamentLive.js';
import { renownForXp } from '../../net/renown.js';
import { getActiveRecord, offlineProfRanks } from '../offlineFirmament.js';
import { allOfflineHomes } from '../offlineHomes.js';
import { deedsOfHouses } from '../../net/homeLaw.js';
import { SHIP_TYPES } from '../banking.js';
import { getNemesisMemory } from '../living/nemesisHost.js';

import { registerEntityFold, registerWeaponDamageMod, computeEntityMods } from '../entityMods.js';
import {
  isAscendedGod,
  apotheosisHpOf,
  apotheosisMpOf,
  apotheosisFatigueOf,
  computeApotheosisPortfolioMods,
  apotheosisWeaponDamageMod,
  computeShadowResistProfile,
  isShadowResistedSkill,
  mitigateShadowDamage,
  setActiveApotheosisPlayer,
  setApotheosisRebirthHook,
  triggerApotheosisScreenFlash,
  tickApotheosisScreenFlash,
  getApotheosisFlashState,
  reconstituteAscendedGod,
  APOTHEOSIS_REBIRTH_MINUTES,
  APOTHEOSIS_FLASH_RGB,
  APOTHEOSIS_FAITH_BASE_MAX,
  APOTHEOSIS_INITIAL_FAITH,
  APOTHEOSIS_REBIRTH_FAITH_COST,
  APOTHEOSIS_PORTFOLIO_SWITCH_COST,
  APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_DAYS,
  APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_MINUTES,
  APOTHEOSIS_CHAMPION_DURATION_MINUTES,
  APOTHEOSIS_MYTHIC_DECAY_FLAT,
  getActiveApotheosisPlayer,
  getFaithMax,
  setApotheosisRebirthFailedHook,
  registerApotheosisEventHandler,
  notifyApotheosisEvent,
  registerAurbisRuntime,
  getAurbisRuntime,
} from './apotheosisLive.js';
import {
  AURBIS_PORTAL_FAITH_COST,
  AURBIS_DIVINE_SHIELD_COST,
  APOTHEOSIS_DIVINE_SHIELD_ROUNDS,
  APOTHEOSIS_DIVINE_SHIELD_PER_LEVEL,
  FORBIDDEN_AURBIS_COMMANDS,
  AURBIS_COMMAND_CATALOG,
  addApotheosisFaith,
  spendApotheosisFaith,
  tickApotheosisMythicDecay,
  handleApotheosisKillFaith,
  recordApotheosisMagicCraft,
  recordApotheosisShadowAct,
  handleApotheosisBountyPaid,
  handleApotheosisTempleDonation,
  handleApotheosisQuestFaith,
  classifyMiraclePortfolioAlignment,
  evaluateMiracleWitnessReaction,
  getSpawnCreatureFaithCost,
  parseAurbisCommandLine,
  evaluateAurbisCommand,
  executeAurbisCommand,
  computeDivineShieldStrength,
  applyApotheosisDivineShield,
  APOTHEOSIS_CHAMPION_TEMPLATES,
  setAlliedChampionBonusHook,
  computeChampionFaithScaling,
  applyApotheosisChampionStrength,
  summonApotheosisChampions,
  getActiveApotheosisChampions,
  clearApotheosisChampions,
  setApotheosisChampionExpiredHook,
  tickApotheosisChampions,
  apotheosisChampionParty,
  getApotheosisWorldHostilityMultiplier,
  getApotheosisFaithGainMultiplier,
  getApotheosisFaithDecayMultiplier,
  getApotheosisPantheonActivityMultiplier,
} from './apotheosisStage2.js';
import {
  TAMRIEL_REGION_COUNT,
  APOTHEOSIS_GRACE_PERIOD_DAYS,
  APOTHEOSIS_GRACE_PERIOD_MINUTES,
  APOTHEOSIS_TRUCE_DAYS,
  APOTHEOSIS_TRUCE_MINUTES,
  PANTHEON_OFFERING_COST,
  PANTHEON_PACT_COST,
  PANTHEON_ALLIANCE_COST,
  PANTHEON_DISCORD_COST,
  PANTHEON_WAR_COST,
  GEOPOLITICS_WAR_COST,
  GEOPOLITICS_PEACE_COST,
  PANTHEON_DEITIES,
  ALLIED_DEITY_CHAMPIONS,
  registerPantheonDeity,
  getPantheonDeities,
  getPantheonDeity,
  resolveRegionPatronDeityId,
  ensurePantheonState,
  applyPantheonPortfolioSwitch,
  getDeityGraceInfo,
  changeDeityRelation,
  getRegionInfluence,
  shiftRegionInfluence,
  setRegionInfluenceShare,
  getGlobalInfluenceSummary,
  applyRegionConditionInfluenceShifts,
  tickPantheonDay,
  computeDivineTruceCost,
  sendDivineOffering,
  proposeDivinePact,
  forgeDivineAlliance,
  sowDivineDiscord,
  declareHolyWar,
  offerDivineTruce,
  areRegionsAtWar,
  igniteRegionWar,
  enforceRegionPeace,
  queryPantheonChronicle,
  getAlliedGodChampionBonus,
} from './apotheosisStage3.js';
import { isApotheosisQuestName } from './apotheosisQuestIds.js';
import { notifyApotheosisQuestSync } from './apotheosisQuest.js';

export {
  CULT_FOUND_FAITH_COST,
  CULT_FOUND_GOLD_COST,
  CULT_CONSECRATE_FORCE_FAITH_COST,
  CULT_CONSECRATE_PEACEFUL_FAITH_COST,
  CULT_BRANCH_SWITCH_COST,
  CULT_BRANCH_COOLDOWN_DAYS,
  CULT_BRANCH_COOLDOWN_MINUTES,
  CULT_TELEPORT_SANCTUARY_FAITH_COST,
  CULT_BASH_COOLDOWN_MINUTES,
  CULT_GUARDIAN_RESPAWN_COOLDOWN_MINUTES,
  CULT_BREAKIN_RELATION_PENALTY,
  CULT_TRESPASS_RELATION_PENALTY,
  DEITY_DEFAULT_ALTAR_FLAT,
  DEITY_DEFAULT_ALTAR_BY_GOD,
  CULT_ALTAR_STYLES,
  REGIONAL_EDICT_COST,
  REGIONAL_EDICT_DURATION_DAYS,
  REGIONAL_EDICT_DURATION_MINUTES,
  EDICT_INFLUENCE_REQUIREMENT,
  AEDRA_IDS,
  DAEDRA_IDS,
  AEDRA_FACTION_TO_GOD,
  CULT_UPGRADE_TIERS,
  CULT_BRANCHES,
  REGIONAL_EDICTS,
  REGIONAL_EDICT_IDS,
  sanctuaryBuildingKeyFor,
  templeSiteKey,
  daedraHatchSiteKey,
  playerHatchSiteKey,
  resolveTemplePatronGodId,
  pickDaedricPatronForCity,
  recomputeCultFaithBonus,
  ensureCultState,
  getCultAltarStyle,
  setCultAltarStyle,
  discoverCultSite,
  applySanctumTrespassPenalty,
  registerCultSiteAsOfflineHome,
  ensureCityCultSites,
  getCityCultSites,
  getAllCultSites,
  getCultSite,
  getCultSiteByBuilding,
  isPlayerCultSiteOwned,
  isPlayerCultTempleOwned,
  hasSanctuaryKey,
  obtainSanctuaryKeyFromGatekeeper,
  attemptUnlockSanctuaryHatch,
  clearSiteGuardians,
  getSanctuaryGuardianCount,
  consecrateSiteByForce,
  initiateForceConsecrationAssault,
  dedicateSitePeacefully,
  foundPlayerUndergroundSanctuary,
  upgradeCultSite,
  getCultBranchCooldownInfo,
  selectCultSiteBranch,
  teleportToCultSanctuary,
  canIssueRegionalEdict,
  getActiveRegionalEdict,
  proclaimRegionalEdict,
  getCultPassiveFaithPerDay,
  getRegionalEdictAurbisCostMultiplier,
  getRegionalEdictChampionDamageMultiplier,
  getRegionalEdictBountyMultiplier,
  tickCultAndEdictsDay,
} from './apotheosisCult.js';

export {
  ROAD_BLESSING_DURATION_MINUTES,
  ROAD_BLESSING_MIN_GOLD,
  ROAD_BLESSING_WARMTH_DEGREES,
  ROADSIDE_DESECRATE_FAITH_BASE,
  ROADSIDE_DESECRATE_INF_BASE,
  ROADSIDE_WILD_REWARD_MULT,
  ROADSIDE_DESECRATE_RELATION_PENALTY,
  ROADSIDE_DESECRATE_COOLDOWN_MINUTES,
  ROADSIDE_DONATE_COOLDOWN_MINUTES,
  BASTION_DEFENSE_PER_SITE,
  BASTION_DEFENSE_MAX,
  CULT_PETITION_COOLDOWN_MINUTES,
  CULT_PETITION_DURATION_MINUTES,
  grantRoadBlessing,
  getRoadBlessingInfo,
  computeRoadBlessingMods,
  tickRoadBlessingFatigue,
  pickRoadsideShrineGod,
  isRoadsideShrineDesecrated,
  isRoadsideShrineDonated,
  prayAtRoadsideShrine,
  desecrateRoadsideShrine,
  getDeityRegionBastionDefense,
  getActiveCultPetition,
  ensureCultPetition,
  dismissCultPetition,
  notifyCultPetitionProgress,
  syncEdictPetitionIfActive,
} from './apotheosisStage33.js';

export {
  APOTHEOSIS_SIEGE_TIERS,
  DIVINE_WAR_SUPPORT_COST,
  DIVINE_WAR_TRUCE_COST,
  DIVINE_SKIRMISH_PACIFY_FAITH_COST,
  MUNDANE_WAR_PACIFY_EXTRA_GOLD,
  DIVINE_WAR_DURATION_DAYS,
  WAR_SKIRMISH_PACIFY_GOAL,
  MAX_CONCURRENT_GOD_WARS,
  getApotheosisSiegeConfig,
  getCultSiegePreview,
  getActiveCultSieges,
  startCultSiteSiege,
  resolveCultSiegeOutcome,
  getActiveGodWars,
  startInterDeityWar,
  supportGodWarSide,
  enforceGodWarTruce,
  tickStage34Daily,
  getActiveWarForRegion,
  setWarPlayerStance,
  resetMundaneWarProgress,
  canSpawnWarSkirmish,
  markWarSkirmishSpawned,
  resolveWarSkirmishPacify,
  shouldInterruptFastTravelForWar,
} from './apotheosisStage34.js';

export {
  isAscendedGod,
  apotheosisHpOf,
  apotheosisMpOf,
  apotheosisFatigueOf,
  computeApotheosisPortfolioMods,
  apotheosisWeaponDamageMod,
  computeShadowResistProfile,
  isShadowResistedSkill,
  mitigateShadowDamage,
  setActiveApotheosisPlayer,
  setApotheosisRebirthHook,
  triggerApotheosisScreenFlash,
  tickApotheosisScreenFlash,
  getApotheosisFlashState,
  reconstituteAscendedGod,
  APOTHEOSIS_REBIRTH_MINUTES,
  APOTHEOSIS_FLASH_RGB,
  APOTHEOSIS_FAITH_BASE_MAX,
  APOTHEOSIS_INITIAL_FAITH,
  APOTHEOSIS_REBIRTH_FAITH_COST,
  APOTHEOSIS_PORTFOLIO_SWITCH_COST,
  APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_DAYS,
  APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_MINUTES,
  APOTHEOSIS_CHAMPION_DURATION_MINUTES,
  APOTHEOSIS_MYTHIC_DECAY_FLAT,
  getActiveApotheosisPlayer,
  getFaithMax,
  setApotheosisRebirthFailedHook,
  registerApotheosisEventHandler,
  notifyApotheosisEvent,
  registerAurbisRuntime,
  getAurbisRuntime,
  AURBIS_PORTAL_FAITH_COST,
  AURBIS_DIVINE_SHIELD_COST,
  APOTHEOSIS_DIVINE_SHIELD_ROUNDS,
  APOTHEOSIS_DIVINE_SHIELD_PER_LEVEL,
  FORBIDDEN_AURBIS_COMMANDS,
  AURBIS_COMMAND_CATALOG,
  addApotheosisFaith,
  spendApotheosisFaith,
  tickApotheosisMythicDecay,
  handleApotheosisKillFaith,
  recordApotheosisMagicCraft,
  recordApotheosisShadowAct,
  handleApotheosisBountyPaid,
  handleApotheosisTempleDonation,
  handleApotheosisQuestFaith,
  classifyMiraclePortfolioAlignment,
  evaluateMiracleWitnessReaction,
  getSpawnCreatureFaithCost,
  parseAurbisCommandLine,
  evaluateAurbisCommand,
  executeAurbisCommand,
  computeDivineShieldStrength,
  applyApotheosisDivineShield,
  APOTHEOSIS_CHAMPION_TEMPLATES,
  setAlliedChampionBonusHook,
  computeChampionFaithScaling,
  applyApotheosisChampionStrength,
  summonApotheosisChampions,
  getActiveApotheosisChampions,
  clearApotheosisChampions,
  setApotheosisChampionExpiredHook,
  tickApotheosisChampions,
  apotheosisChampionParty,
  getApotheosisWorldHostilityMultiplier,
  getApotheosisFaithGainMultiplier,
  getApotheosisFaithDecayMultiplier,
  getApotheosisPantheonActivityMultiplier,
  TAMRIEL_REGION_COUNT,
  APOTHEOSIS_GRACE_PERIOD_DAYS,
  APOTHEOSIS_GRACE_PERIOD_MINUTES,
  APOTHEOSIS_TRUCE_DAYS,
  APOTHEOSIS_TRUCE_MINUTES,
  PANTHEON_OFFERING_COST,
  PANTHEON_PACT_COST,
  PANTHEON_ALLIANCE_COST,
  PANTHEON_DISCORD_COST,
  PANTHEON_WAR_COST,
  GEOPOLITICS_WAR_COST,
  GEOPOLITICS_PEACE_COST,
  PANTHEON_DEITIES,
  ALLIED_DEITY_CHAMPIONS,
  registerPantheonDeity,
  getPantheonDeities,
  getPantheonDeity,
  resolveRegionPatronDeityId,
  ensurePantheonState,
  applyPantheonPortfolioSwitch,
  getDeityGraceInfo,
  changeDeityRelation,
  getRegionInfluence,
  shiftRegionInfluence,
  setRegionInfluenceShare,
  getGlobalInfluenceSummary,
  applyRegionConditionInfluenceShifts,
  tickPantheonDay,
  computeDivineTruceCost,
  sendDivineOffering,
  proposeDivinePact,
  forgeDivineAlliance,
  sowDivineDiscord,
  declareHolyWar,
  offerDivineTruce,
  areRegionsAtWar,
  igniteRegionWar,
  enforceRegionPeace,
  queryPantheonChronicle,
  getAlliedGodChampionBonus,
};

export const TOTAL_FATE_TRIGGERS = 24;
export const REQUIRED_FATE_WEIGHT = Math.ceil((TOTAL_FATE_TRIGGERS * 2) / 3);
export const REQUIRED_ARTIFACTS_COUNT = 13;
export const TOTAL_CANONICAL_ARTIFACTS = 23;
export const NECRO_GRIMOIRE_BOOK_ID = 99001;

export const APOTHEOSIS_STAGES = Object.freeze({
  MORTAL: 'mortal',
  QUESTLINE_ACTIVE: 'questline_active',
  AWAITING_PORTFOLIO: 'awaiting_portfolio',
  ASCENDED: 'ascended',
});

export const APOTHEOSIS_QUEST_STEPS = Object.freeze({
  NONE: 'none',
  DRAGON_BREAK: 'dragon_break',
  TOWER_SIEGE: 'tower_siege',
  TOWER_INTERIOR: 'tower_interior',
  SHADOW_DUEL: 'shadow_duel',
  COMPLETED: 'completed',
});

export const APOTHEOSIS_SOURCES = Object.freeze({
  ARTIFACTS: 'artifacts',
  MANTELLA: 'mantella',
});

export const APOTHEOSIS_PORTFOLIOS = Object.freeze([
  {
    id: 'war',
    name: () => t('apotheosis.portfolio.war.name', 'Portfolio of War'),
    epithet: () => t('apotheosis.portfolio.war.epithet', 'Lord of Conflict & Conquest'),
    summary: () => t('apotheosis.portfolio.war.summary', 'Dominion of martial supremacy, unyielding vitality, and battlefield command. Combat avatars and divine warfare trials unlock in later stages.'),
    passivesSummary: () => t('apotheosis.portfolio.war.passives', '+15 Strength & Endurance (cap raised) · +15% Weapon Damage · +15 Armor · -25% Fatigue Cost'),
  },
  {
    id: 'magic',
    name: () => t('apotheosis.portfolio.magic.name', 'Portfolio of Magic'),
    epithet: () => t('apotheosis.portfolio.magic.epithet', 'Architect of Aetherius'),
    summary: () => t('apotheosis.portfolio.magic.summary', 'Dominion of limitless magicka, planar weaving, and reality rewriting. Cosmic spellcraft and arcane decree mechanics unlock in later stages.'),
    passivesSummary: () => t('apotheosis.portfolio.magic.passives', '+20 Intelligence & Willpower (cap raised) · +250 Magicka · +25 Magic Skills · +25% Magic Resistance'),
  },
  {
    id: 'shadows',
    name: () => t('apotheosis.portfolio.shadows.name', 'Portfolio of Shadows'),
    epithet: () => t('apotheosis.portfolio.shadows.epithet', 'Sovereign of Paths Unseen'),
    summary: () => t('apotheosis.portfolio.shadows.summary', 'Dominion of twilight guile, unseen strikes, and whispered pacts across Oblivion. Shadow step and covenant manipulation unlock in later stages.'),
    passivesSummary: () => t('apotheosis.portfolio.shadows.passives', '+20 Agility & Speed (cap raised) · +25 Stealth, Backstab, Crit, Dodging, Pickpocket & Lockpicking · -50% Fall Damage'),
  },
  {
    id: 'order',
    name: () => t('apotheosis.portfolio.order.name', 'Portfolio of Order'),
    epithet: () => t('apotheosis.portfolio.order.epithet', 'Anchor of Mundus'),
    summary: () => t('apotheosis.portfolio.order.summary', 'Dominion of sovereign law, eternal wards, and stewardship of realms. Mortal followers, decrees, and shrines unlock in later stages.'),
    passivesSummary: () => t('apotheosis.portfolio.order.passives', '+20 Personality & Luck (cap raised) · +25% Magic & Elemental Resistances · +25 Social Skills & Standing'),
  },
]);

const PORTFOLIO_IDS = new Set(APOTHEOSIS_PORTFOLIOS.map((p) => p.id));

const FATE_CATEGORY_DEFS = Object.freeze([
  {
    id: 'meta',
    label: () => t('apotheosis.cat.meta.label', 'CHIM & Mind'),
    subtitle: () => t('apotheosis.cat.meta.subtitle', 'Metaphysical mastery, arcane scholarship, and awareness beyond mortal bounds.'),
  },
  {
    id: 'blood',
    label: () => t('apotheosis.cat.blood.label', 'Blood & Crucible'),
    subtitle: () => t('apotheosis.cat.blood.subtitle', 'Battles survived, rival hunters broken, curses embraced, and relics claimed.'),
  },
  {
    id: 'power',
    label: () => t('apotheosis.cat.power.label', 'Dominion & World'),
    subtitle: () => t('apotheosis.cat.power.subtitle', 'Temporal authority across guilds, professions, wealth, holdings, and horizons.'),
  },
]);

/** Localized canonical artifact names (indices 0..22 matching ARTIFACT_SUB_TYPE_NAMES). */
export function canonicalArtifactName(subType) {
  switch (Number(subType)) {
    case 0: return t('apotheosis.artifact.0', 'Masque of Clavicus Vile');
    case 1: return t('apotheosis.artifact.1', "Mehrunes' Razor");
    case 2: return t('apotheosis.artifact.2', 'Mace of Molag Bal');
    case 3: return t('apotheosis.artifact.3', "Hircine's Ring");
    case 4: return t('apotheosis.artifact.4', "Sanguine's Rose");
    case 5: return t('apotheosis.artifact.5', 'Oghma Infinium');
    case 6: return t('apotheosis.artifact.6', 'Wabbajack');
    case 7: return t('apotheosis.artifact.7', 'Ring of Namira');
    case 8: return t('apotheosis.artifact.8', 'Skull of Corruption');
    case 9: return t('apotheosis.artifact.9', "Azura's Star");
    case 10: return t('apotheosis.artifact.10', 'Volendrung');
    case 11: return t('apotheosis.artifact.11', "Warlock's Ring");
    case 12: return t('apotheosis.artifact.12', "Auriel's Bow");
    case 13: return t('apotheosis.artifact.13', "Necromancer's Amulet");
    case 14: return t('apotheosis.artifact.14', 'Chrysamere');
    case 15: return t('apotheosis.artifact.15', "Lord's Mail");
    case 16: return t('apotheosis.artifact.16', 'Staff of Magnus');
    case 17: return t('apotheosis.artifact.17', 'Ring of Khajiit');
    case 18: return t('apotheosis.artifact.18', 'Ebony Mail');
    case 19: return t('apotheosis.artifact.19', "Auriel's Shield");
    case 20: return t('apotheosis.artifact.20', 'Spell Breaker');
    case 21: return t('apotheosis.artifact.21', "Skeleton's Key");
    case 22: return t('apotheosis.artifact.22', 'Ebony Blade');
    default: return t('apotheosis.artifact.unknown', 'Unknown Artifact');
  }
}

export function defaultApotheosisState() {
  return {
    ascended: false,
    stage: APOTHEOSIS_STAGES.MORTAL,
    source: null,
    portfolio: null,
    questlineStarted: false,
    questlineCompletedNotice: false,
    questStep: APOTHEOSIS_QUEST_STEPS.NONE,
    stormActive: false,
    towerSiegeWave: 0,
    towerSiegeCleared: false,
    shadowDefeated: false,
    rebirthCount: 0,
    sacrificedArtifacts: [],
    debugFateCount: 0,
    mantellaCompleted: false,
    stormStartMinutes: null,
    mantellaVanillaChosen: false,
    ascendedAtMinutes: null,
    faith: 0,
    cultFaithBonus: 0,
    lastFaithGainDay: null,
    lastFaithDecayDay: null,
    witnessMiracleDay: null,
    witnessMiracleCount: 0,
    donationFaithDay: null,
    donationFaithEarned: 0,
    debugWitnessCount: null,
    lastPortfolioSwitchMinutes: null,
    pantheon: null,
    cult: null,
    journalAscendedSynced: false,
  };
}

const VALID_QUEST_STEPS = new Set(Object.values(APOTHEOSIS_QUEST_STEPS));

/**
 * Ensures the Apotheosis state and the 4 progression hooks exist cleanly on `entity`.
 * Safe to invoke on fresh characters, legacy saves, and test mocks.
 */
export function ensureApotheosisState(entity) {
  if (!entity || typeof entity !== 'object') return defaultApotheosisState();

  const kills = Number(entity.totalKills);
  entity.totalKills = Number.isFinite(kills) && kills >= 0 ? Math.trunc(kills) : 0;

  if (!Array.isArray(entity.booksRead)) {
    entity.booksRead = [];
  } else {
    const clean = [];
    const seen = new Set();
    for (const id of entity.booksRead) {
      const n = Number(id);
      if (Number.isInteger(n) && n >= 0 && !seen.has(n)) {
        seen.add(n);
        clean.push(n);
      }
    }
    entity.booksRead = clean;
  }

  const nemeses = Number(entity.nemesesDefeated);
  entity.nemesesDefeated = Number.isFinite(nemeses) && nemeses >= 0 ? Math.trunc(nemeses) : 0;

  const quests = Number(entity.questsCompleted);
  entity.questsCompleted = Number.isFinite(quests) && quests >= 0 ? Math.trunc(quests) : 0;

  const prev = entity.apotheosis && typeof entity.apotheosis === 'object' ? entity.apotheosis : {};
  const stage = Object.values(APOTHEOSIS_STAGES).includes(prev.stage)
    ? prev.stage
    : (prev.ascended ? APOTHEOSIS_STAGES.ASCENDED : APOTHEOSIS_STAGES.MORTAL);
  const portfolio = typeof prev.portfolio === 'string' && PORTFOLIO_IDS.has(prev.portfolio) ? prev.portfolio : null;
  const source = typeof prev.source === 'string' ? prev.source : null;
  const sacrificedArtifacts = Array.isArray(prev.sacrificedArtifacts)
    ? [...new Set(prev.sacrificedArtifacts.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < TOTAL_CANONICAL_ARTIFACTS))]
    : [];
  const debugFateCount = Number.isFinite(Number(prev.debugFateCount))
    ? Math.max(0, Math.min(TOTAL_FATE_TRIGGERS, Math.trunc(Number(prev.debugFateCount))))
    : 0;
  const legacyPostTrial = stage === APOTHEOSIS_STAGES.AWAITING_PORTFOLIO || stage === APOTHEOSIS_STAGES.ASCENDED;
  const questStep = typeof prev.questStep === 'string' && VALID_QUEST_STEPS.has(prev.questStep)
    ? prev.questStep
    : (legacyPostTrial ? APOTHEOSIS_QUEST_STEPS.COMPLETED : (stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE ? APOTHEOSIS_QUEST_STEPS.DRAGON_BREAK : APOTHEOSIS_QUEST_STEPS.NONE));
  const shadowDefeated = prev.shadowDefeated != null ? !!prev.shadowDefeated : legacyPostTrial;
  const towerSiegeCleared = prev.towerSiegeCleared != null
    ? !!prev.towerSiegeCleared
    : (legacyPostTrial || questStep === APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR || questStep === APOTHEOSIS_QUEST_STEPS.SHADOW_DUEL);
  const stormActive = stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE && !shadowDefeated
    ? (prev.stormActive != null ? !!prev.stormActive : true)
    : false;
  const towerSiegeWave = Number.isFinite(Number(prev.towerSiegeWave))
    ? Math.max(0, Math.min(13, Math.trunc(Number(prev.towerSiegeWave))))
    : 0;
  const rebirthCount = Number.isFinite(Number(prev.rebirthCount)) && Number(prev.rebirthCount) >= 0
    ? Math.trunc(Number(prev.rebirthCount))
    : 0;

  const ascended = !!prev.ascended || (stage === APOTHEOSIS_STAGES.ASCENDED && !!portfolio);
  const cultFaithBonus = Number.isFinite(Number(prev.cultFaithBonus)) && Number(prev.cultFaithBonus) > 0
    ? Math.trunc(Number(prev.cultFaithBonus))
    : 0;
  const maxFaith = APOTHEOSIS_FAITH_BASE_MAX + cultFaithBonus;
  const faith = prev.faith != null && Number.isFinite(Number(prev.faith))
    ? Math.max(0, Math.min(maxFaith, Math.trunc(Number(prev.faith))))
    : (ascended ? APOTHEOSIS_INITIAL_FAITH : 0);

  entity.apotheosis = {
    ascended,
    stage,
    source,
    portfolio,
    questlineStarted: !!prev.questlineStarted,
    questlineCompletedNotice: !!prev.questlineCompletedNotice,
    questStep,
    stormActive,
    towerSiegeWave,
    towerSiegeCleared,
    shadowDefeated,
    rebirthCount,
    sacrificedArtifacts,
    debugFateCount,
    mantellaCompleted: !!prev.mantellaCompleted,
    stormStartMinutes: prev.stormStartMinutes != null && Number.isFinite(Number(prev.stormStartMinutes))
      ? Math.trunc(Number(prev.stormStartMinutes))
      : null,
    mantellaVanillaChosen: !!prev.mantellaVanillaChosen,
    ascendedAtMinutes: prev.ascendedAtMinutes != null && Number.isFinite(Number(prev.ascendedAtMinutes))
      ? Math.trunc(Number(prev.ascendedAtMinutes))
      : null,
    faith,
    cultFaithBonus,
    lastFaithGainDay: prev.lastFaithGainDay != null && Number.isFinite(Number(prev.lastFaithGainDay))
      ? Math.trunc(Number(prev.lastFaithGainDay))
      : null,
    lastFaithDecayDay: prev.lastFaithDecayDay != null && Number.isFinite(Number(prev.lastFaithDecayDay))
      ? Math.trunc(Number(prev.lastFaithDecayDay))
      : null,
    witnessMiracleDay: prev.witnessMiracleDay != null && Number.isFinite(Number(prev.witnessMiracleDay))
      ? Math.trunc(Number(prev.witnessMiracleDay))
      : null,
    witnessMiracleCount: Number.isFinite(Number(prev.witnessMiracleCount)) && Number(prev.witnessMiracleCount) >= 0
      ? Math.trunc(Number(prev.witnessMiracleCount))
      : 0,
    donationFaithDay: prev.donationFaithDay != null && Number.isFinite(Number(prev.donationFaithDay))
      ? Math.trunc(Number(prev.donationFaithDay))
      : null,
    donationFaithEarned: Number.isFinite(Number(prev.donationFaithEarned)) && Number(prev.donationFaithEarned) >= 0
      ? Math.trunc(Number(prev.donationFaithEarned))
      : 0,
    debugWitnessCount: prev.debugWitnessCount != null && Number.isFinite(Number(prev.debugWitnessCount)) && Number(prev.debugWitnessCount) >= 0
      ? Math.trunc(Number(prev.debugWitnessCount))
      : null,
    lastPortfolioSwitchMinutes: prev.lastPortfolioSwitchMinutes != null && Number.isFinite(Number(prev.lastPortfolioSwitchMinutes))
      ? Math.trunc(Number(prev.lastPortfolioSwitchMinutes))
      : null,
    pantheon: prev.pantheon && typeof prev.pantheon === 'object' ? prev.pantheon : null,
    cult: prev.cult && typeof prev.cult === 'object' ? prev.cult : null,
    journalAscendedSynced: !!prev.journalAscendedSynced,
  };
  return entity.apotheosis;
}

/** Increments playerEntity.totalKills whenever a foe dies to the player or their summons/party. */
export function recordApotheosisKill(entity, count = 1) {
  if (!entity || typeof entity !== 'object') return 0;
  ensureApotheosisState(entity);
  const delta = Number.isFinite(Number(count)) && Number(count) > 0 ? Math.trunc(Number(count)) : 0;
  entity.totalKills += delta;
  return entity.totalKills;
}

/** Records a distinct book ID in playerEntity.booksRead (canonicalizing legacy book id 10000 -> 5). */
export function recordBookRead(entity, rawBookId) {
  if (!entity || typeof entity !== 'object') return false;
  const parsed = Number(rawBookId);
  if (!Number.isInteger(parsed) || parsed < 0) return false;
  const id = parsed === 10000 ? 5 : parsed;
  ensureApotheosisState(entity);
  if (entity.booksRead.includes(id)) return false;
  entity.booksRead.push(id);
  return true;
}

/** Increments playerEntity.nemesesDefeated when a Living Tamriel Nemesis is beaten or driven off. */
export function recordNemesisDefeated(entity, count = 1) {
  if (!entity || typeof entity !== 'object') return 0;
  ensureApotheosisState(entity);
  const delta = Number.isFinite(Number(count)) && Number(count) > 0 ? Math.trunc(Number(count)) : 0;
  entity.nemesesDefeated += delta;
  return entity.nemesesDefeated;
}

/** Increments playerEntity.questsCompleted when a quest completes successfully. */
export function recordQuestCompleted(entity, quest = null) {
  if (!entity || typeof entity !== 'object') return 0;
  if (quest && isApotheosisQuestName(quest.questName)) return entity.questsCompleted ?? 0;
  if (quest && quest.questSuccess !== true) return entity.questsCompleted ?? 0;
  ensureApotheosisState(entity);
  entity.questsCompleted += 1;
  handleApotheosisQuestFaith(entity, quest);
  return entity.questsCompleted;
}

// Register global player kill hook once on module load.
registerPlayerKillListener('apotheosis_kills', (entityOrFoe, info) => {
  const activePlayer = getActiveApotheosisPlayer();
  const isDirectPlayerArg = Boolean(
    entityOrFoe && (
      entityOrFoe === activePlayer ||
      entityOrFoe.isPlayer ||
      entityOrFoe.characterId ||
      !activePlayer
    ),
  );
  const player = isDirectPlayerArg ? entityOrFoe : activePlayer;
  const foe = isDirectPlayerArg ? (info?.foe ?? null) : entityOrFoe;
  if (!player || typeof player !== 'object') return;
  try {
    recordApotheosisKill(player, 1);
    handleApotheosisKillFaith(player, foe, info || {});
  } catch (e) {
    console.warn('[apotheosis] kill listener failed:', e);
  }
});

/**
 * Resolves canonical artifact subType index (`0..22`), or `-1` if the item is not a canonical artifact.
 * Covers all 23 DFU artifacts including Chrysamere (14), Lord's Mail (15), etc.
 */
export function artifactSubTypeOf(item) {
  if (!item || typeof item !== 'object' || item.artifact !== true) return -1;
  if (Number.isInteger(item.artifactSubType) && item.artifactSubType >= 0 && item.artifactSubType < TOTAL_CANONICAL_ARTIFACTS) {
    return item.artifactSubType;
  }
  const bitfield = item.artifactIndexBitfield;
  if (Number.isInteger(bitfield) && (bitfield & 1) === 1) {
    const idx = bitfield >> 1;
    if (idx >= 0 && idx < TOTAL_CANONICAL_ARTIFACTS) return idx;
  }
  const legacy = legacyGetArtifactSubType(item.shortName ?? item.name);
  const legacyNum = typeof legacy === 'number' ? legacy : Number(legacy);
  if (Number.isInteger(legacyNum) && legacyNum >= 0 && legacyNum < TOTAL_CANONICAL_ARTIFACTS) return legacyNum;
  const fallback = Number(item.enchantments?.[0]?.enchantParam);
  if (Number.isInteger(fallback) && fallback >= 0 && fallback < TOTAL_CANONICAL_ARTIFACTS) return fallback;
  return -1;
}

/** Returns true if the exact item object reference is currently equipped in any slot of entity. */
export function isEquippedOnEntity(entity, item) {
  if (!entity || !item) return false;
  const table = equipTableOf(entity);
  if (!Array.isArray(table)) return false;
  if (item.equipSlot != null && item.equipSlot !== EQUIP_SLOTS.None && table[item.equipSlot] === item) {
    return true;
  }
  for (let slot = 0; slot < table.length; slot++) {
    if (table[slot] === item) return true;
  }
  return false;
}

/** Returns localized display name for an artifact item in pack/picker. */
export function artifactDisplayName(item) {
  if (!item) return t('apotheosis.artifact.unknown', 'Unknown Artifact');
  const subType = artifactSubTypeOf(item);
  if (typeof item.shortName === 'string' && item.shortName.trim()) return item.shortName;
  if (typeof item.name === 'string' && item.name.trim() && subType < 0) return item.name;
  if (subType >= 0) return canonicalArtifactName(subType);
  return String(item.name || t('apotheosis.artifact.unknown', 'Unknown Artifact'));
}

/**
 * Scans `entity.items` for canonical Daedric / unique artifacts.
 * Only unequipped artifacts (`!isEquippedOnEntity(entity, item)`) are eligible for sacrifice.
 * Returns both total and distinct-by-subType lists so UI cards and validation stay synchronized.
 */
export function scanInventoryArtifactsForApotheosis(entity) {
  const items = Array.isArray(entity?.items) ? entity.items : [];
  const unequippedEntries = [];
  const equippedEntries = [];
  const distinctUnequippedMap = new Map();
  const distinctOwnedSet = new Set();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const subType = artifactSubTypeOf(item);
    if (subType < 0) continue;
    distinctOwnedSet.add(subType);
    const equipped = isEquippedOnEntity(entity, item);
    const entry = {
      item,
      index: i,
      subType,
      name: artifactDisplayName(item),
      canonicalName: canonicalArtifactName(subType),
      equipped,
    };
    if (equipped) {
      equippedEntries.push(entry);
    } else {
      unequippedEntries.push(entry);
      if (!distinctUnequippedMap.has(subType)) {
        distinctUnequippedMap.set(subType, entry);
      }
    }
  }

  return {
    unequippedEntries,
    equippedEntries,
    distinctUnequippedSubTypes: [...distinctUnequippedMap.keys()],
    distinctUnequippedCount: distinctUnequippedMap.size,
    distinctOwnedCount: distinctOwnedSet.size,
    equippedCount: equippedEntries.length,
    unequippedCount: unequippedEntries.length,
  };
}

/**
 * Mints a canonical Daggerfall artifact (uses loaded MAGIC.DEF templates when available,
 * otherwise builds a canonical record matching `itemLaw.js` artifact validation).
 */
export function mintCanonicalArtifact(subType, { gender = 'male' } = {}) {
  const idx = Math.trunc(Number(subType));
  if (!Number.isInteger(idx) || idx < 0 || idx >= TOTAL_CANONICAL_ARTIFACTS) {
    throw new RangeError(`Invalid artifact subtype: ${subType}`);
  }
  const templates = getMagicItemTemplates();
  if (Array.isArray(templates) && templates.length > 0) {
    try {
      const created = createArtifact(templates, idx, { gender });
      created.artifactSubType = idx;
      if (!created.name) created.name = canonicalArtifactName(idx);
      legacyArtifactIndexBitfieldCheck(created);
      return created;
    } catch {
      // Fallback below if template list is partial in test environments
    }
  }

  const rec = ARTIFACT_RECORDS[idx];
  const groupName = ITEM_GROUP_NAME_BY_CLASS[rec.group] ?? 'MagicItems';
  const templateIndex = GROUP_TEMPLATE_INDICES[groupName]?.[rec.index] ?? 0;
  const tex = artifactTextureIndices(idx, gender);
  const nameEntry = [...ARTIFACT_SUB_TYPE_NAMES].find(([, v]) => v === idx)?.[0] ?? `Artifact_${idx}`;
  const cleanName = canonicalArtifactName(idx) || String(nameEntry).replaceAll('_', ' ');
  return {
    group: groupName,
    templateIndex,
    name: cleanName,
    shortName: cleanName,
    magic: true,
    artifact: true,
    artifactSubType: idx,
    isIdentified: true,
    artifactIndexBitfield: (idx << 1) | 1,
    material: groupName === 'Armor' ? 0x209 : groupName === 'Weapons' ? 9 : 0,
    enchantments: rec.types.map((type) => ({ type, enchantParam: idx })),
    maxCondition: 5000,
    currentCondition: 5000,
    weightInKg: 3,
    playerTextureArchive: tex.archive,
    playerTextureRecord: tex.record,
    worldTextureArchive: tex.archive,
    worldTextureRecord: tex.record,
    value: 100000,
  };
}

/** Grants up to `count` distinct unequipped canonical artifacts missing from `entity.items`. */
export function grantArtifactPack(entity, count = 15) {
  if (!entity || typeof entity !== 'object') return { added: 0, totalDistinctUnequipped: 0, names: [] };
  if (!Array.isArray(entity.items)) entity.items = [];
  const gender = entity.gender === 'female' ? 'female' : 'male';
  const want = Math.max(1, Math.min(TOTAL_CANONICAL_ARTIFACTS, Math.trunc(Number(count) || 15)));
  const scanBefore = scanInventoryArtifactsForApotheosis(entity);
  const existing = new Set(scanBefore.distinctUnequippedSubTypes);
  const addedNames = [];

  for (let sub = 0; sub < TOTAL_CANONICAL_ARTIFACTS && addedNames.length < want; sub++) {
    if (existing.has(sub)) continue;
    const item = mintCanonicalArtifact(sub, { gender });
    entity.items.push(item);
    existing.add(sub);
    addedNames.push(item.name);
  }
  const scanAfter = scanInventoryArtifactsForApotheosis(entity);
  return {
    added: addedNames.length,
    totalDistinctUnequipped: scanAfter.distinctUnequippedCount,
    names: addedNames,
  };
}

// ── FATE WEIGHT RETRO-ESTIMATION & LIVE SNAPSHOT HELPERS ───────────────────────

function collectAllBookItemsCount(entity) {
  const seenIds = new Set();
  const lists = [entity?.items, entity?.wagonItems, entity?.bagItems];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item?.group === 'Books' && Number.isInteger(item.message)) {
        seenIds.add(item.message === 10000 ? 5 : item.message);
      }
    }
  }
  try {
    for (const h of allOfflineHomes()) {
      for (const list of [/** @type {any} */ (h)?.chests, h?.decor]) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
          if (entry?.group === 'Books' && Number.isInteger(entry.message)) {
            seenIds.add(entry.message === 10000 ? 5 : entry.message);
          }
          if (Array.isArray(entry?.items)) {
            for (const sub of entry.items) {
              if (sub?.group === 'Books' && Number.isInteger(sub.message)) {
                seenIds.add(sub.message === 10000 ? 5 : sub.message);
              }
            }
          }
        }
      }
    }
  } catch {
    // Headless or unloaded offline homes store
  }
  return seenIds.size;
}

function countStatsAtOrAbove(entity, minVal = 100) {
  let count = 0;
  for (const key of STAT_KEYS_ORDER) {
    const val = Number(liveStat(entity, key) ?? entity?.stats?.[key] ?? 0);
    if (val >= minVal) count += 1;
  }
  return count;
}

function highestSkillInList(entity, skillIds) {
  let best = 0;
  for (const id of skillIds) {
    const val = Number(realSkillValue(entity, id) ?? entity?.skills?.[id] ?? 0);
    if (val > best) best = val;
  }
  return best;
}

function maxGuildRank(entity) {
  try {
    const memberships = activeMemberships(entity);
    if (!memberships || typeof memberships !== 'object') return -1;
    let best = -1;
    for (const m of Object.values(memberships)) {
      if (isMember(m) && Number(m?.rank) > best) best = Number(m.rank);
    }
    return best;
  } catch {
    return -1;
  }
}

function maxProfessionRank(entity) {
  try {
    const ranks = offlineProfRanks(entity?.characterId ?? null) ?? {};
    let best = 0;
    for (const p of PROFESSIONS) {
      const r = Number(ranks[p.id] ?? 0);
      if (r > best) best = r;
    }
    return best;
  } catch {
    return 0;
  }
}

function countDiscoveryPlaces() {
  let total = 0;
  try {
    const disc = snapshotDiscovery();
    const locCount = Object.keys(disc?.locations ?? {}).length;
    let bldgCount = 0;
    for (const town of Object.values(disc?.buildings ?? {})) {
      bldgCount += Object.keys(town ?? {}).length;
    }
    total += locCount + Math.floor(bldgCount / 5);
  } catch {
    // Ignore when discovery store uninitialized
  }
  try {
    const auto = snapshotAutomap();
    if (Array.isArray(auto)) total += auto.length;
    else if (auto && typeof auto === 'object') total += Object.keys(auto).length;
  } catch {
    // Ignore when automap store uninitialized
  }
  return total;
}

function totalPlayerWealth(entity) {
  let sum = Math.max(0, Number(entity?.goldPieces ?? 0));
  if (Array.isArray(entity?.bankAccounts)) {
    for (const acc of entity.bankAccounts) {
      const g = Number(acc?.accountGold ?? 0);
      if (Number.isFinite(g) && g > 0) sum += g;
    }
  }
  return Math.trunc(sum);
}

function countPropertiesAndShips(entity) {
  let homes = 0;
  try {
    homes += deedsOfHouses(entity?.houses).length;
  } catch {
    // Ignore malformed house list
  }
  try {
    homes += allOfflineHomes().length;
  } catch {
    // Ignore offline homes in isolated tests
  }
  const hasShip = Number.isInteger(entity?.ownedShip) && entity.ownedShip > SHIP_TYPES.None;
  return { homes, hasShip };
}

function maxFactionReputation(entity) {
  let best = 0;
  const dict = entity?.factionRep?.dict;
  if (dict instanceof Map) {
    for (const row of dict.values()) {
      const r = Number(row?.rep ?? 0);
      if (r > best) best = r;
    }
  } else if (entity?.savedFactionRep && typeof entity.savedFactionRep === 'object') {
    for (const row of Object.values(entity.savedFactionRep)) {
      const r = Number(row?.rep ?? row ?? 0);
      if (r > best) best = r;
    }
  }
  return best;
}

function readFirmamentProgress(entity) {
  let stars = 0;
  try {
    const tree = firmamentTree();
    if (Array.isArray(tree?.keys)) stars = Math.max(stars, tree.keys.length);
  } catch {
    // Ignore
  }
  let xp = 0;
  let renown = 1;
  try {
    const rec = getActiveRecord(entity?.characterId ?? null);
    xp = Math.max(0, Number(rec?.xp ?? 0));
    renown = Math.max(1, Number(rec?.renown ?? renownForXp(xp)));
  } catch {
    // Ignore
  }
  return { stars, xp, renown };
}

function effectiveKills(entity, firmXp) {
  const tracked = Number(entity?.totalKills ?? 0);
  // Retro-estimate kills conservatively from Firmament XP (~35 XP per foe) on legacy saves.
  const retro = tracked === 0 && firmXp > 0 ? Math.floor(firmXp / 35) : 0;
  return Math.max(tracked, retro);
}

function effectiveNemesesDefeated(entity) {
  const tracked = Number(entity?.nemesesDefeated ?? 0);
  let retro = 0;
  try {
    const mem = getNemesisMemory();
    retro = Math.max(0, Number(mem?.encounters ?? 0));
  } catch {
    // Ignore
  }
  return Math.max(tracked, retro);
}

/** Evaluates all 22 Fate Weight triggers live against `entity` and active subsystems. */
export function evaluateFateWeight(entity) {
  const state = ensureApotheosisState(entity);
  const firm = readFirmamentProgress(entity);
  const kills = effectiveKills(entity, firm.xp);
  const booksCount = Math.max((entity?.booksRead ?? []).length, collectAllBookItemsCount(entity));
  const nemeses = effectiveNemesesDefeated(entity);
  const quests = Math.max(0, Number(entity?.questsCompleted ?? 0));
  const level = Math.max(1, Number(entity?.level ?? 1));
  const statsAt100 = countStatsAtOrAbove(entity, 100);
  const daedricSkill = Number(realSkillValue(entity, SKILLS.Daedric) ?? entity?.skills?.[SKILLS.Daedric] ?? 0);
  const topMagic = highestSkillInList(entity, [
    SKILLS.Destruction, SKILLS.Restoration, SKILLS.Illusion,
    SKILLS.Alteration, SKILLS.Thaumaturgy, SKILLS.Mysticism,
  ]);
  const topMartial = highestSkillInList(entity, [
    SKILLS.ShortBlade, SKILLS.LongBlade, SKILLS.HandToHand,
    SKILLS.Axe, SKILLS.BluntWeapon, SKILLS.Archery, SKILLS.CriticalStrike,
  ]);
  const topShadow = highestSkillInList(entity, [
    SKILLS.Backstabbing, SKILLS.Stealth, SKILLS.Pickpocket,
    SKILLS.Lockpicking, SKILLS.Dodging, SKILLS.CriticalStrike,
  ]);
  const allSkillIds = Array.from({ length: SKILL_COUNT }, (_, id) => id);
  const topAnySkill = highestSkillInList(entity, allSkillIds);
  const activeSpec = pathOf(entity) ?? martialPathOf(entity) ?? null;
  const maxHp = Math.max(0, Number(entity?.maxHealth ?? entity?.rawMaxHealth ?? 0));
  const lich = isAnyLich(entity);
  const vampire = !!liveVampirism(entity);
  const werebeast = !!liveLycanthropy(entity);
  const transcendent = lich || vampire || werebeast;

  const scan = scanInventoryArtifactsForApotheosis(entity);
  const topGuild = maxGuildRank(entity);
  const topProf = maxProfessionRank(entity);
  const discovered = countDiscoveryPlaces();
  const wealth = totalPlayerWealth(entity);
  const { homes, hasShip } = countPropertiesAndShips(entity);
  const topRep = maxFactionReputation(entity);

  const rawTriggers = [
    // META (8)
    {
      id: 'tr01_awakened_mind',
      category: 'meta',
      name: t('apotheosis.tr.tr01.name', 'Awakened Mind'),
      desc: t('apotheosis.tr.tr01.desc', 'Raise at least 3 attributes to 100 or above.'),
      progressText: t('apotheosis.tr.tr01.prog', '{count}/3 attributes at 100', { count: statsAt100 }),
      natural: statsAt100 >= 3,
    },
    {
      id: 'tr19_mortal_apex',
      category: 'meta',
      name: t('apotheosis.tr.tr19.name', 'Pinnacle of Mortality'),
      desc: t('apotheosis.tr.tr19.desc', 'Reach character level 30.'),
      progressText: t('apotheosis.tr.tr19.prog', 'Level {lvl}/30', { lvl: level }),
      natural: level >= 30,
    },
    {
      id: 'tr02_tower_scholar',
      category: 'meta',
      name: t('apotheosis.tr.tr02.name', 'Tower Scholar'),
      desc: t('apotheosis.tr.tr02.desc', 'Read at least 25 distinct volumes of Tamrielic lore.'),
      progressText: t('apotheosis.tr.tr02.prog', '{cur}/25 volumes', { cur: booksCount }),
      natural: booksCount >= 25,
    },
    {
      id: 'tr03_speaker_oblivion',
      category: 'meta',
      name: t('apotheosis.tr.tr03.name', 'Speaker in Oblivion'),
      desc: t('apotheosis.tr.tr03.desc', 'Raise the Daedric language skill to 100.'),
      progressText: t('apotheosis.tr.tr03.prog', 'Daedric {cur}/100', { cur: Math.trunc(daedricSkill) }),
      natural: daedricSkill >= 100,
    },
    {
      id: 'tr04_mystic_weave',
      category: 'meta',
      name: t('apotheosis.tr.tr04.name', 'Weave of the Mystics'),
      desc: t('apotheosis.tr.tr04.desc', 'Master an arcane school of magic to skill level 100.'),
      progressText: t('apotheosis.tr.tr04.prog', 'Magic {cur}/100', { cur: Math.trunc(topMagic) }),
      natural: topMagic >= 100,
    },
    {
      id: 'tr05_firmament_child',
      category: 'meta',
      name: t('apotheosis.tr.tr05.name', 'Child of the Firmament'),
      desc: t('apotheosis.tr.tr05.desc', 'Attune 50 stars in the Firmament.'),
      progressText: t('apotheosis.tr.tr05.prog', 'Stars {stars}/50', { stars: firm.stars }),
      natural: firm.stars >= 50,
    },
    {
      id: 'tr20_renowned_legend',
      category: 'meta',
      name: t('apotheosis.tr.tr20.name', 'Herald of Renown'),
      desc: t('apotheosis.tr.tr20.desc', 'Reach Renown level 25.'),
      progressText: t('apotheosis.tr.tr20.prog', 'Renown {ren}/25', { ren: firm.renown }),
      natural: firm.renown >= 25,
    },
    {
      id: 'tr24_specialization',
      category: 'meta',
      name: t('apotheosis.tr.tr24.name', 'Twin-Art Specialization'),
      desc: t('apotheosis.tr.tr24.desc', 'Claim a dual-skill arcane or martial specialization path.'),
      progressText: activeSpec
        ? t('apotheosis.tr.tr24.active', 'Path: {name}', { name: activeSpec.name })
        : t('apotheosis.tr.tr24.none', 'No specialization'),
      natural: Boolean(activeSpec),
    },

    // BLOOD & CRUCIBLE (8)
    {
      id: 'tr07_harbinger_ash',
      category: 'blood',
      name: t('apotheosis.tr.tr07.name', 'Harbinger of Ash'),
      desc: t('apotheosis.tr.tr07.desc', 'Slay 5000 enemies.'),
      progressText: t('apotheosis.tr.tr07.prog', '{cur}/5000 slain', { cur: kills }),
      natural: kills >= 5000,
    },
    {
      id: 'tr08_mortal_flesh',
      category: 'blood',
      name: t('apotheosis.tr.tr08.name', 'Transcending Mortal Flesh'),
      desc: t('apotheosis.tr.tr08.desc', 'Bear an immortal curse upon your vessel (Lichdom, Vampirism, or Lycanthropy).'),
      progressText: transcendent
        ? t('apotheosis.tr.tr08.active', 'Transformed')
        : t('apotheosis.tr.tr08.mortal', 'Mortal vessel'),
      natural: transcendent,
    },
    {
      id: 'tr09_scourge_rivals',
      category: 'blood',
      name: t('apotheosis.tr.tr09.name', 'Scourge of Rivals'),
      desc: t('apotheosis.tr.tr09.desc', 'Defeat 10 Nemesis hunters sent after your name.'),
      progressText: t('apotheosis.tr.tr09.prog', '{cur}/10 rivals', { cur: nemeses }),
      natural: nemeses >= 10,
    },
    {
      id: 'tr10_peerless_warrior',
      category: 'blood',
      name: t('apotheosis.tr.tr10.name', 'Peerless Warrior'),
      desc: t('apotheosis.tr.tr10.desc', 'Master a combat skill to level 100.'),
      progressText: t('apotheosis.tr.tr10.prog', 'Combat {cur}/100', { cur: Math.trunc(topMartial) }),
      natural: topMartial >= 100,
    },
    {
      id: 'tr11_relic_bearer',
      category: 'blood',
      name: t('apotheosis.tr.tr11.name', 'Bearer of Daedric Power'),
      desc: t('apotheosis.tr.tr11.desc', 'Hold at least 3 distinct Daedric artifacts in your possession.'),
      progressText: t('apotheosis.tr.tr11.prog', '{cur}/3 distinct artifacts', { cur: scan.distinctOwnedCount }),
      natural: scan.distinctOwnedCount >= 3,
    },
    {
      id: 'tr12_unbroken',
      category: 'blood',
      name: t('apotheosis.tr.tr12.name', 'Walker in Shadows'),
      desc: t('apotheosis.tr.tr12.desc', 'Master a stealth skill to level 100.'),
      progressText: t('apotheosis.tr.tr12.prog', 'Stealth {sk}/100', { sk: Math.trunc(topShadow) }),
      natural: topShadow >= 100,
    },
    {
      id: 'tr21_titan_vitality',
      category: 'blood',
      name: t('apotheosis.tr.tr21.name', 'Unbroken Vessel'),
      desc: t('apotheosis.tr.tr21.desc', 'Harden maximum Health to 500.'),
      progressText: t('apotheosis.tr.tr21.prog', 'HP {hp}/500', { hp: Math.trunc(maxHp) }),
      natural: maxHp >= 500,
    },
    {
      id: 'tr23_skill_200',
      category: 'blood',
      name: t('apotheosis.tr.tr23.name', 'Apex Mastery'),
      desc: t('apotheosis.tr.tr23.desc', 'Push any skill to level 200 or above.'),
      progressText: t('apotheosis.tr.tr23.prog', 'Peak skill {cur}/200', { cur: Math.trunc(topAnySkill) }),
      natural: topAnySkill >= 200,
    },

    // DOMINION & WORLD (8)
    {
      id: 'tr13_guildmaster',
      category: 'power',
      name: t('apotheosis.tr.tr13.name', 'Pillar of the Guilds'),
      desc: t('apotheosis.tr.tr13.desc', 'Ascend to the highest rank (Rank 9) in a guild.'),
      progressText: topGuild >= 0
        ? t('apotheosis.tr.tr13.prog', 'Top rank {cur}/9', { cur: topGuild })
        : t('apotheosis.tr.tr13.none', 'No guild rank'),
      natural: topGuild >= 9,
    },
    {
      id: 'tr14_grand_artisan',
      category: 'power',
      name: t('apotheosis.tr.tr14.name', 'Grand Artisan'),
      desc: t('apotheosis.tr.tr14.desc', 'Achieve Master rank (100) in a crafting profession.'),
      progressText: t('apotheosis.tr.tr14.prog', 'Rank {cur}/{max}', { cur: Math.trunc(topProf), max: PROF_RANK_MAX }),
      natural: topProf >= PROF_RANK_MAX,
    },
    {
      id: 'tr15_cartographer',
      category: 'power',
      name: t('apotheosis.tr.tr15.name', 'Cartographer of Tamriel'),
      desc: t('apotheosis.tr.tr15.desc', 'Chart at least 75 discovered locations.'),
      progressText: t('apotheosis.tr.tr15.prog', '{cur}/75 charted', { cur: discovered }),
      natural: discovered >= 75,
    },
    {
      id: 'tr16_magnate',
      category: 'power',
      name: t('apotheosis.tr.tr16.name', 'Merchant Sovereign'),
      desc: t('apotheosis.tr.tr16.desc', 'Amass 500,000 gold pieces across your purse and regional bank vaults.'),
      progressText: t('apotheosis.tr.tr16.prog', '{cur}/500,000 gold', { cur: wealth }),
      natural: wealth >= 500000,
    },
    {
      id: 'tr17_landed_sovereign',
      category: 'power',
      name: t('apotheosis.tr.tr17.name', 'Landed Sovereign'),
      desc: t('apotheosis.tr.tr17.desc', 'Own a freehold residence in Tamriel.'),
      progressText: t('apotheosis.tr.tr17.prog', 'Holdings {homes}/1', { homes }),
      natural: homes >= 1,
    },
    {
      id: 'tr22_sea_captain',
      category: 'power',
      name: t('apotheosis.tr.tr22.name', 'Captain of the Seas'),
      desc: t('apotheosis.tr.tr22.desc', 'Command your own sea vessel.'),
      progressText: t('apotheosis.tr.tr22.prog', 'Vessel {ship}/1', { ship: hasShip ? 1 : 0 }),
      natural: hasShip,
    },
    {
      id: 'tr18_living_legend',
      category: 'power',
      name: t('apotheosis.tr.tr18.name', 'Living Legend of Tamriel'),
      desc: t('apotheosis.tr.tr18.desc', 'Earn revered standing (+50 reputation) with a faction.'),
      progressText: t('apotheosis.tr.tr18.prog', 'Peak reputation {cur}/50', { cur: Math.trunc(topRep) }),
      natural: topRep >= 50,
    },
    {
      id: 'tr06_hero_iliac',
      category: 'power',
      name: t('apotheosis.tr.tr06.name', 'Shaper of History'),
      desc: t('apotheosis.tr.tr06.desc', 'Complete 50 quests across Tamriel.'),
      progressText: t('apotheosis.tr.tr06.prog', '{cur}/50 quests', { cur: quests }),
      natural: quests >= 50,
    },
  ];

  // Apply non-destructive debug boost if active (`apo fate ready` -> 16, `apo fate full` -> 24)
  const debugQuota = state.debugFateCount || 0;
  const naturalCount = rawTriggers.filter((tr) => tr.natural).length;
  let remainingDebugGrants = Math.max(0, debugQuota - naturalCount);

  const triggers = rawTriggers.map((tr) => {
    let debugGranted = false;
    let fulfilled = tr.natural;
    if (!fulfilled && remainingDebugGrants > 0) {
      fulfilled = true;
      debugGranted = true;
      remainingDebugGrants--;
    }
    return {
      ...tr,
      fulfilled,
      debugGranted,
    };
  });

  const count = triggers.filter((tr) => tr.fulfilled).length;
  const categories = FATE_CATEGORY_DEFS.map((cat) => {
    const list = triggers.filter((tr) => tr.category === cat.id);
    return {
      id: cat.id,
      label: cat.label(),
      subtitle: cat.subtitle(),
      fulfilled: list.filter((tr) => tr.fulfilled).length,
      total: list.length,
      triggers: list,
    };
  });

  return {
    count,
    naturalCount,
    required: REQUIRED_FATE_WEIGHT,
    total: TOTAL_FATE_TRIGGERS,
    ready: count >= REQUIRED_FATE_WEIGHT,
    debugBoosted: debugQuota > naturalCount,
    triggers,
    categories,
  };
}

let _isInsideMantellanCrux = null;

/** Registers a host predicate returning whether the player is currently inside the Mantellan Crux. */
export function setMantellanCruxPresenceChecker(fn) {
  _isInsideMantellanCrux = typeof fn === 'function' ? fn : null;
}

/** Checks whether the player can initiate Ascension via the 13-artifact sacrifice route. */
export function canStartApotheosisViaArtifacts(entity) {
  const state = ensureApotheosisState(entity);
  const fate = evaluateFateWeight(entity);
  const artifacts = scanInventoryArtifactsForApotheosis(entity);

  let reason = null;
  if (state.ascended || state.stage === APOTHEOSIS_STAGES.ASCENDED) {
    reason = t('apotheosis.lock.alreadyAscended', 'You have already ascended to godhood.');
  } else if (state.stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE) {
    reason = t('apotheosis.lock.questlineActive', 'The trial of Ascension is already underway.');
  } else if (state.stage === APOTHEOSIS_STAGES.AWAITING_PORTFOLIO) {
    reason = t('apotheosis.lock.awaitingPortfolio', 'Choose your Divine Portfolio to complete Ascension.');
  } else if (state.source === APOTHEOSIS_SOURCES.MANTELLA) {
    reason = t('apotheosis.lock.mantellaChosen', 'Ascension was already claimed through the Mantella.');
  } else if (Boolean(entity?._inMantellanCrux) || Boolean(_isInsideMantellanCrux?.(entity))) {
    reason = t('apotheosis.lock.inMantellanCrux', 'Cannot shatter 13 Daedric Artifacts inside the Mantellan Crux — decide the Mantella\'s fate first.');
  } else if (!fate.ready) {
    reason = t('apotheosis.lock.fateShort', 'Insufficient Fate Weight ({cur}/{req}).', { cur: fate.count, req: fate.required });
  } else if (artifacts.distinctUnequippedCount < REQUIRED_ARTIFACTS_COUNT) {
    reason = t('apotheosis.lock.artifactsShort', 'Need {req} distinct unequipped Daedric artifacts ({cur}/{req} ready).', {
      cur: artifacts.distinctUnequippedCount,
      req: REQUIRED_ARTIFACTS_COUNT,
    });
  }

  return {
    eligible: reason === null,
    reason,
    fate,
    artifacts,
    state,
  };
}

/** Returns true while the global Dragon Break storm should rage outdoors across the world. */
export function isApotheosisStormActive(entity) {
  const state = entity?.apotheosis;
  return Boolean(
    state
      && state.stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE
      && !state.shadowDefeated
      && state.stormActive !== false,
  );
}

/**
 * Evaluates what happens when the player touches the Mantella (globalVar 36 / FinishedMantellanCrux).
 * Enforces mutual exclusion against the 13-Artifact path and checks Fate Weight >= 16/24.
 */
export function evaluateMantellaFork(entity) {
  const state = ensureApotheosisState(entity);
  const fate = evaluateFateWeight(entity);

  if (state.source === APOTHEOSIS_SOURCES.ARTIFACTS && (state.ascended || state.questlineStarted || state.stage !== APOTHEOSIS_STAGES.MORTAL)) {
    return {
      eligible: false,
      mode: 'blocked_exclusive',
      reason: 'exclusive',
      fate,
      state,
      message: t('apotheosis.mantella.blockedArtifacts', 'You already ignited the path of Ascension through 13 Daedric Artifacts. The Mantella slips beyond your grasp.'),
    };
  }
  if (state.ascended || state.stage === APOTHEOSIS_STAGES.ASCENDED) {
    return {
      eligible: false,
      mode: 'blocked_ascended',
      reason: 'ascended',
      fate,
      state,
      message: t('apotheosis.mantella.blockedAscended', 'You already walk Mundus as a god. The Mantella merely answers its sovereign.'),
    };
  }
  if (state.stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE || state.stage === APOTHEOSIS_STAGES.AWAITING_PORTFOLIO) {
    return {
      eligible: false,
      mode: 'blocked_active',
      reason: 'active',
      fate,
      state,
      message: t('apotheosis.mantella.blockedActive', 'Your Ascension trial is already underway.'),
    };
  }
  if (!fate.ready) {
    return {
      eligible: false,
      mode: 'insufficient_fate',
      reason: 'fate_weight',
      fate,
      state,
      message: t('apotheosis.mantella.insufficientFate', 'Your Fate Weight ({cur}/{req}) cannot bear the Mantella\'s apotheosis. Mortality reclaims the Numidium\'s heart.', {
        cur: fate.count,
        req: fate.required,
      }),
    };
  }
  return {
    eligible: true,
    mode: 'choice',
    reason: null,
    fate,
    state,
    message: null,
  };
}

/**
 * Shared entry point for the Apotheosis Ascension questline (`artifacts` or `mantella` route).
 * Stage 1 opens the Dragon Break storm worldwide and directs the player to Direnni Tower.
 * @param {any} entity
 * @param {{ source?: string | null, sacrificedSubTypes?: number[] }} [opts]
 */
export function startApotheosisQuestline(entity, { source, sacrificedSubTypes = [] } = {}) {
  const state = ensureApotheosisState(entity);
  if (state.source && state.source !== source && (state.ascended || state.questlineStarted)) {
    return {
      ok: false,
      error: t('apotheosis.err.exclusive', 'Another path of Ascension is already underway.'),
      state,
    };
  }
  state.source = source ?? APOTHEOSIS_SOURCES.ARTIFACTS;
  if (Array.isArray(sacrificedSubTypes) && sacrificedSubTypes.length) {
    state.sacrificedArtifacts = [...sacrificedSubTypes];
  }
  state.questlineStarted = true;
  state.questlineCompletedNotice = false;
  state.stage = APOTHEOSIS_STAGES.QUESTLINE_ACTIVE;
  state.questStep = APOTHEOSIS_QUEST_STEPS.DRAGON_BREAK;
  state.stormActive = true;
  state.stormStartMinutes = null;
  state.towerSiegeWave = 0;
  state.towerSiegeCleared = false;
  state.shadowDefeated = false;
  computeEntityMods(entity);
  notifyApotheosisQuestSync(entity);
  return {
    ok: true,
    stage: state.stage,
    questStep: state.questStep,
    source: state.source,
    notice: t('apotheosis.quest.startedNotice', 'A Dragon Break tears open the skies of the Iliac Bay! Reach Direnni Tower amidst the tempest.'),
    state,
  };
}

/** Advances the active Apotheosis Stage 1 questline state machine cleanly. */
export function advanceApotheosisQuestStep(entity, nextStep, { siegeWave = null } = {}) {
  const state = ensureApotheosisState(entity);
  if (!VALID_QUEST_STEPS.has(nextStep)) {
    return { ok: false, error: 'Unknown quest step', state };
  }
  if (state.stage === APOTHEOSIS_STAGES.MORTAL && !state.questlineStarted) {
    startApotheosisQuestline(entity, { source: state.source ?? APOTHEOSIS_SOURCES.ARTIFACTS });
  }
  state.questStep = nextStep;
  if (siegeWave != null && Number.isFinite(Number(siegeWave))) {
    state.towerSiegeWave = Math.max(0, Math.min(13, Math.trunc(Number(siegeWave))));
  }
  if (nextStep === APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR || nextStep === APOTHEOSIS_QUEST_STEPS.SHADOW_DUEL) {
    state.towerSiegeCleared = true;
    state.towerSiegeWave = 13;
  }
  if (nextStep === APOTHEOSIS_QUEST_STEPS.COMPLETED) {
    return completeApotheosisQuestline(entity);
  }
  if (state.stage !== APOTHEOSIS_STAGES.ASCENDED) {
    state.stage = APOTHEOSIS_STAGES.QUESTLINE_ACTIVE;
    state.stormActive = !state.shadowDefeated;
  }
  notifyApotheosisQuestSync(entity);
  return { ok: true, questStep: state.questStep, stage: state.stage, state };
}

/** Marks the Shadow of the Agent defeated, dispels the global Dragon Break storm, and unlocks Portfolio selection. */
export function completeApotheosisQuestline(entity) {
  const state = ensureApotheosisState(entity);
  state.questlineStarted = true;
  state.questlineCompletedNotice = true;
  state.towerSiegeCleared = true;
  state.towerSiegeWave = 13;
  state.shadowDefeated = true;
  state.stormActive = false;
  state.stormStartMinutes = null;
  setSkyMinutesOverride(null);
  state.questStep = APOTHEOSIS_QUEST_STEPS.COMPLETED;
  if (!state.ascended && state.stage !== APOTHEOSIS_STAGES.ASCENDED) {
    state.stage = APOTHEOSIS_STAGES.AWAITING_PORTFOLIO;
  }
  computeEntityMods(entity);
  notifyApotheosisQuestSync(entity);
  return {
    ok: true,
    stage: state.stage,
    questStep: state.questStep,
    source: state.source,
    notice: t('apotheosis.quest.completedNotice', 'The Shadow of the Agent is shattered and the storm subsides. You stand upon the threshold of Divinity — choose your Divine Portfolio!'),
    state,
  };
}

/** Mantella ("claim the power for yourself") entrypoint, sharing the same questline seam. */
export function startApotheosisFromMantella(entity) {
  const state = ensureApotheosisState(entity);
  if (state.ascended || state.source === APOTHEOSIS_SOURCES.ARTIFACTS) {
    return {
      ok: false,
      error: t('apotheosis.lock.exclusiveArtifacts', 'The 13-Artifact Ascension path already claimed your Fate.'),
      state,
    };
  }
  state.mantellaCompleted = true;
  return startApotheosisQuestline(entity, { source: APOTHEOSIS_SOURCES.MANTELLA });
}

/**
 * Consumes exactly 13 distinct unequipped artifacts from `entity.items`,
 * verifies all conditions (Fate Weight >= 16, unequipped, distinct subtypes),
 * removes those exact items, and starts the shared Apotheosis Questline.
 */
export function startApotheosisFromArtifacts(entity, selectedItems) {
  const check = canStartApotheosisViaArtifacts(entity);
  if (!check.eligible) {
    return { ok: false, error: check.reason, state: check.state };
  }
  if (!Array.isArray(selectedItems) || selectedItems.length !== REQUIRED_ARTIFACTS_COUNT) {
    return {
      ok: false,
      error: t('apotheosis.err.pickCount', 'Select exactly {req} distinct unequipped artifacts.', { req: REQUIRED_ARTIFACTS_COUNT }),
      state: check.state,
    };
  }

  const inv = Array.isArray(entity.items) ? entity.items : [];
  const seenRefs = new Set();
  const seenSubTypes = new Set();
  const sacrificedSubTypes = [];

  for (const item of selectedItems) {
    if (!item || seenRefs.has(item)) {
      return { ok: false, error: t('apotheosis.err.duplicateSelection', 'Duplicate item selection.'), state: check.state };
    }
    if (!inv.includes(item)) {
      return { ok: false, error: t('apotheosis.err.notInPack', 'All sacrificed artifacts must be in your pack.'), state: check.state };
    }
    if (isEquippedOnEntity(entity, item)) {
      return { ok: false, error: t('apotheosis.err.mustUnequip', 'Equipped artifacts cannot be shattered; unequip them first.'), state: check.state };
    }
    const subType = artifactSubTypeOf(item);
    if (subType < 0) {
      return { ok: false, error: t('apotheosis.err.notArtifact', 'Only canonical Daedric artifacts can fuel the Ascension.'), state: check.state };
    }
    if (seenSubTypes.has(subType)) {
      return { ok: false, error: t('apotheosis.err.duplicateSubtype', 'Each of the 13 sacrificed artifacts must be unique.'), state: check.state };
    }
    seenRefs.add(item);
    seenSubTypes.add(subType);
    sacrificedSubTypes.push(subType);
  }

  // Remove the exact 13 selected items from pack in reverse index order.
  for (let i = inv.length - 1; i >= 0; i--) {
    if (seenRefs.has(inv[i])) inv.splice(i, 1);
  }

  const qRes = startApotheosisQuestline(entity, {
    source: APOTHEOSIS_SOURCES.ARTIFACTS,
    sacrificedSubTypes,
  });
  return {
    ...qRes,
    sacrificedSubTypes,
  };
}

function resolveApotheosisNowMinutes(entity, nowMinutes = null) {
  if (nowMinutes != null && Number.isFinite(Number(nowMinutes))) {
    return Math.trunc(Number(nowMinutes));
  }
  if (entity?._lastWorldMinutes != null && Number.isFinite(Number(entity._lastWorldMinutes))) {
    return Math.trunc(Number(entity._lastWorldMinutes));
  }
  try {
    const rtMin = getAurbisRuntime()?.getWorldMinutes?.();
    if (rtMin != null && Number.isFinite(Number(rtMin))) {
      return Math.trunc(Number(rtMin));
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Returns remaining 1-month (30-day) cooldown info for switching Divine Portfolio. */
export function getPortfolioSwitchCooldownInfo(entity, nowMinutes = null) {
  const rawLast = entity?.apotheosis?.lastPortfolioSwitchMinutes;
  const lastSwitchMinutes = rawLast != null && Number.isFinite(Number(rawLast))
    ? Math.trunc(Number(rawLast))
    : null;
  const resolvedMinutes = resolveApotheosisNowMinutes(entity, nowMinutes);
  if (lastSwitchMinutes == null || resolvedMinutes == null) {
    return {
      onCooldown: false,
      remainingMinutes: 0,
      remainingDays: 0,
      remainingHours: 0,
      lastSwitchMinutes,
    };
  }
  const elapsed = resolvedMinutes - lastSwitchMinutes;
  if (elapsed < 0 || elapsed >= APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_MINUTES) {
    return {
      onCooldown: false,
      remainingMinutes: 0,
      remainingDays: 0,
      remainingHours: 0,
      lastSwitchMinutes,
    };
  }
  const remainingMinutes = APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_MINUTES - elapsed;
  const remainingDays = Math.max(1, Math.ceil(remainingMinutes / 1440));
  const remainingHours = Math.max(1, Math.ceil(remainingMinutes / 60));
  return {
    onCooldown: true,
    remainingMinutes,
    remainingDays,
    remainingHours,
    lastSwitchMinutes,
  };
}

/**
 * Selects or switches the player's Divine Portfolio.
 * First Ascension is free and grants APOTHEOSIS_INITIAL_FAITH (500).
 * Switching Portfolios while already Ascended costs 250 Faith and incurs a 30-day cooldown (unless `{ free: true }`).
 */
export function selectApotheosisPortfolio(entity, portfolioId, { nowMinutes = null, free = false } = {}) {
  const state = ensureApotheosisState(entity);
  if (!PORTFOLIO_IDS.has(portfolioId)) {
    return { ok: false, error: t('apotheosis.err.unknownPortfolio', 'Unknown Divine Portfolio.'), state };
  }
  if (state.stage === APOTHEOSIS_STAGES.MORTAL && !state.ascended) {
    return { ok: false, error: t('apotheosis.err.notYetAscended', 'Begin the Ascension ritual before choosing a Portfolio.'), state };
  }
  if (state.stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE && !state.ascended) {
    return { ok: false, error: t('apotheosis.err.trialIncomplete', 'Complete the Ascension trial before choosing a Portfolio.'), state };
  }
  const resolvedMinutes = resolveApotheosisNowMinutes(entity, nowMinutes);
  const wasAscended = isAscendedGod(entity);
  const switching = Boolean(state.ascended && state.portfolio && state.portfolio !== portfolioId);
  if (switching && !free) {
    const cd = getPortfolioSwitchCooldownInfo(entity, resolvedMinutes);
    if (cd.onCooldown) {
      return {
        ok: false,
        cooldown: true,
        remainingMinutes: cd.remainingMinutes,
        remainingDays: cd.remainingDays,
        remainingHours: cd.remainingHours,
        error: t(
          'apotheosis.err.switch_cooldown',
          'Portfolio realignment is on cooldown ({days} days remaining).',
          { days: cd.remainingDays },
        ),
        state,
      };
    }
    if ((state.faith || 0) < APOTHEOSIS_PORTFOLIO_SWITCH_COST) {
      return {
        ok: false,
        error: t('apotheosis.err.switch_faith', 'Not enough Faith to switch Portfolio (requires 250 Faith).'),
        requiredFaith: APOTHEOSIS_PORTFOLIO_SWITCH_COST,
        faith: state.faith || 0,
        state,
      };
    }
    state.faith = Math.max(0, (state.faith || 0) - APOTHEOSIS_PORTFOLIO_SWITCH_COST);
  }
  if (!switching && (!state.ascended || !state.portfolio)) {
    if ((state.faith || 0) <= 0) {
      state.faith = Math.min(getFaithMax(state), APOTHEOSIS_INITIAL_FAITH);
    }
  }
  const prevPortfolio = state.portfolio;
  state.portfolio = portfolioId;
  state.ascended = true;
  state.stage = APOTHEOSIS_STAGES.ASCENDED;
  state.questStep = APOTHEOSIS_QUEST_STEPS.COMPLETED;
  state.shadowDefeated = true;
  state.stormActive = false;
  state.towerSiegeCleared = true;
  if (state.ascendedAtMinutes == null && resolvedMinutes != null) {
    state.ascendedAtMinutes = resolvedMinutes;
  }
  if (!free && resolvedMinutes != null) {
    state.lastPortfolioSwitchMinutes = resolvedMinutes;
  }
  ensurePantheonState(entity, { nowMinutes: resolvedMinutes });
  if (switching) {
    applyPantheonPortfolioSwitch(entity, prevPortfolio, portfolioId, { free, nowMinutes: resolvedMinutes });
  }
  computeEntityMods(entity);
  if (!wasAscended) {
    notifyApotheosisQuestSync(entity);
    if (Object.getOwnPropertyDescriptor(entity, 'maxHealth')?.get && Number.isFinite(entity.health)) {
      entity.health = entity.maxHealth;
    }
    if (Object.getOwnPropertyDescriptor(entity, 'maxMagicka')?.get && Number.isFinite(entity.magicka)) {
      entity.magicka = entity.maxMagicka;
    }
    if (Number.isFinite(entity.maxFatigue) && entity.maxFatigue > 0 && Number.isFinite(entity.fatigue)) {
      entity.fatigue = entity.maxFatigue;
    }
  }
  const def = APOTHEOSIS_PORTFOLIOS.find((p) => p.id === portfolioId);
  return {
    ok: true,
    switching,
    portfolio: portfolioId,
    portfolioName: def ? def.name() : portfolioId,
    faith: state.faith,
    faithMax: getFaithMax(state),
    state,
  };
}

/** Sets debug Fate Weight override (`16` ready or `24` full) cleanly on `entity.apotheosis`. */
export function setDebugFateWeight(entity, targetCount) {
  const state = ensureApotheosisState(entity);
  const clean = Math.max(0, Math.min(TOTAL_FATE_TRIGGERS, Math.trunc(Number(targetCount) || 0)));
  state.debugFateCount = clean;
  return evaluateFateWeight(entity);
}

/** Resets Apotheosis progression back to mortal state (for debug/testing). */
export function resetApotheosisForDebug(entity) {
  setSkyMinutesOverride(null);
  if (!entity || typeof entity !== 'object') return defaultApotheosisState();
  entity._inMantellanCrux = false;
  entity.apotheosis = defaultApotheosisState();
  computeEntityMods(entity);
  notifyApotheosisQuestSync(entity);
  return entity.apotheosis;
}

registerEntityFold('apotheosis', computeApotheosisPortfolioMods);
registerWeaponDamageMod('apotheosis', apotheosisWeaponDamageMod);
