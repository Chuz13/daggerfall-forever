// ═══════════════════════════════════════════════════════════════════════════════
// LIVING TAMRIEL TYPED ROLEPLAY ROLLS & FORMULA ENGINE
//
// Centralized, editable formula registry for all Living Tamriel roleplay checks:
//  - 39 Crisis & Exploration Encounters (Diplomacy, Medical, Lore, Magic, Stealth)
//  - Roadside Military Checkpoints (Knightly standing, Etiquette, Streetwise, Tolls)
//  - Nemesis 2.0 Confrontations (Honor appeal, Underworld buyout, 1v1 Taunt)
//  - Rival & Wandering Adventurers (Duels, Dares, Quest Reclaims, Spoils Extortion)
//  - Ambient NPC Pleas & Quarantine Cordons (Polite refusal, Medical pass)
//  - Travel Ambush Evasion & Naval Parley
//
// Every check resolves through a typed formula into a 5-tier degree of outcome:
//  TRIUMPH -> SUCCESS -> PARTIAL (Success at a cost / Luck save) -> FAILURE -> CRITICAL_FAILURE
// ═══════════════════════════════════════════════════════════════════════════════

import { SKILLS, SKILL_KEYS, skillValue } from '../skills.js';
import { liveStat } from '../statMods.js';
import { dice100 } from '../../combat/formulas.js';
import { LivingTamrielConfig } from './livingConfig.js';

/**
 * Degrees of success for Living Tamriel roleplay checks.
 */
export const LIVING_ROLL_DEGREE = Object.freeze({
  TRIUMPH: 'TRIUMPH',                   // Critical triumph (margin >= triumphMargin or nat 96..100 with margin >= -5)
  SUCCESS: 'SUCCESS',                   // Clean success (0 <= margin < triumphMargin)
  PARTIAL: 'PARTIAL',                   // Compromise / Success at a cost / Rescued by Luck
  FAILURE: 'FAILURE',                   // Standard failure (non-lethal escalation where applicable)
  CRITICAL_FAILURE: 'CRITICAL_FAILURE', // Catastrophic blunder (margin < catastropheMargin or nat 1..5 on failure)
});

/**
 * Canonical governing attribute for each Daggerfall skill used in Living Tamriel.
 * @type {Readonly<Record<number, string>>}
 */
export const SKILL_GOVERNING_STAT = Object.freeze({
  [SKILLS.Medical]: 'intelligence',
  [SKILLS.Etiquette]: 'personality',
  [SKILLS.Streetwise]: 'personality',
  [SKILLS.Jumping]: 'strength',
  [SKILLS.Orcish]: 'intelligence',
  [SKILLS.Harpy]: 'intelligence',
  [SKILLS.Giantish]: 'intelligence',
  [SKILLS.Dragonish]: 'intelligence',
  [SKILLS.Nymph]: 'intelligence',
  [SKILLS.Daedric]: 'intelligence',
  [SKILLS.Spriggan]: 'intelligence',
  [SKILLS.Centaurian]: 'intelligence',
  [SKILLS.Impish]: 'intelligence',
  [SKILLS.Lockpicking]: 'intelligence',
  [SKILLS.Mercantile]: 'personality',
  [SKILLS.Pickpocket]: 'agility',
  [SKILLS.Stealth]: 'agility',
  [SKILLS.Swimming]: 'endurance',
  [SKILLS.Climbing]: 'strength',
  [SKILLS.Backstabbing]: 'agility',
  [SKILLS.Dodging]: 'speed',
  [SKILLS.Running]: 'speed',
  [SKILLS.Destruction]: 'willpower',
  [SKILLS.Restoration]: 'willpower',
  [SKILLS.Illusion]: 'willpower',
  [SKILLS.Alteration]: 'willpower',
  [SKILLS.Thaumaturgy]: 'willpower',
  [SKILLS.Mysticism]: 'intelligence',
  [SKILLS.ShortBlade]: 'agility',
  [SKILLS.LongBlade]: 'agility',
  [SKILLS.HandToHand]: 'agility',
  [SKILLS.Axe]: 'strength',
  [SKILLS.BluntWeapon]: 'strength',
  [SKILLS.Archery]: 'agility',
  [SKILLS.CriticalStrike]: 'agility',
});

/**
 * @typedef {Object} LivingRollInput
 * @property {number} skill - Governing skill value (0..100+)
 * @property {number} stat - Governing primary stat value (0..100+, baseline 50)
 * @property {number} luck - Player Luck attribute (0..100+, baseline 50)
 * @property {number} playerLevel - Player character level (1..45)
 * @property {number} targetLevel - Opponent or encounter threat level (1..45)
 * @property {number} reputation - Regional reputation in current province (-100..+100)
 * @property {number} difficulty - Base target difficulty (DC)
 * @property {number} contextBonus - Situational modifier (trait synergy, knight rank, disguise taint, etc.)
 * @property {number} roll - Random roll in [0..100]
 */

/**
 * @typedef {Object} LivingRollEvaluation
 * @property {number} playerScore - Computed deterministic score from skills, stats, luck, and context
 * @property {number} rollScore - Random roll contribution
 * @property {number} totalScore - Combined roll + playerScore
 * @property {number} targetScore - Final threshold to beat
 * @property {number} margin - Difference (totalScore - targetScore)
 */

/**
 * @typedef {Object} LivingFormulaSpec
 * @property {string} id - Unique formula identifier
 * @property {string} label - Human-readable description of the formula
 * @property {string} defaultStat - Default governing stat name ('personality'|'intelligence'|'willpower'|'agility'|'strength')
 * @property {number} skillWeight - Multiplier applied to `input.skill`
 * @property {number} statWeight - Multiplier applied to `input.stat`
 * @property {number} luckWeight - Multiplier applied to `(input.luck - 50)`
 * @property {number} repWeight - Multiplier applied to clamped regional reputation
 * @property {number} rollWeight - Multiplier applied to the random 0..100 roll
 * @property {number} targetOffset - Flat offset added to `input.difficulty`
 * @property {number} triumphMargin - Margin required for TRIUMPH (default +25)
 * @property {number} partialMargin - Minimum margin for PARTIAL compromise (default -15)
 * @property {number} catastropheMargin - Margin below which failure becomes CRITICAL_FAILURE (default -30)
 * @property {(input: LivingRollInput, spec: LivingFormulaSpec) => LivingRollEvaluation} evaluate - Editable calculation function
 */

/**
 * @typedef {Object} LivingRollResult
 * @property {string} formulaId - Formula used
 * @property {string} degree - One of LIVING_ROLL_DEGREE ('TRIUMPH'|'SUCCESS'|'PARTIAL'|'FAILURE'|'CRITICAL_FAILURE')
 * @property {boolean} passed - True if degree is TRIUMPH, SUCCESS, or PARTIAL (when luckSaved/compromise)
 * @property {boolean} cleanSuccess - True if degree is TRIUMPH or SUCCESS
 * @property {boolean} isTriumph - True if degree is TRIUMPH
 * @property {boolean} isPartial - True if degree is PARTIAL
 * @property {boolean} isCatastrophe - True if degree is CRITICAL_FAILURE
 * @property {boolean} luckSaved - True if narrow failure was rescued by a Luck save roll
 * @property {number} roll - Raw d100 roll (0..100)
 * @property {number} playerScore - Player's stat + skill + bonus pool
 * @property {number} totalScore - Combined rollScore + playerScore
 * @property {number} targetScore - Difficulty threshold
 * @property {number} margin - Signed margin (totalScore - targetScore)
 * @property {number} skill - Skill value used
 * @property {number} stat - Stat value used
 * @property {number} luck - Luck value used
 */

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

/**
 * Default formula definitions.
 * Developers can edit weights or `evaluate` bodies directly here, or override them
 * at runtime via `configureLivingFormula(id, patch)`.
 *
 * @type {Record<string, LivingFormulaSpec>}
 */
const DEFAULT_FORMULAS = {
  /**
   * 1. SOCIAL_DIPLOMACY:
   * Used for Etiquette appeals, Checkpoint persuasion, Nemesis honor parleys,
   * Adventurer fellowship appeals, and Polite Plea refusals.
   */
  SOCIAL_DIPLOMACY: {
    id: 'SOCIAL_DIPLOMACY',
    label: 'Social Diplomacy & Etiquette Parley',
    defaultStat: 'personality',
    skillWeight: 1.0,
    statWeight: 1 / 3,
    luckWeight: 0.2,
    repWeight: 0.25,
    rollWeight: 1.0,
    targetOffset: 50,
    triumphMargin: 25,
    partialMargin: -15,
    catastropheMargin: -35,
    evaluate(input, spec) {
      const repMod = clamp(input.reputation, -20, 30) * spec.repWeight;
      const luckMod = (input.luck - 50) * spec.luckWeight;
      const playerScore = Math.trunc(
        input.skill * spec.skillWeight +
          input.stat * spec.statWeight +
          luckMod +
          repMod +
          input.contextBonus,
      );
      const rollScore = Math.trunc(input.roll * spec.rollWeight);
      const totalScore = rollScore + playerScore;
      const targetScore = Math.trunc(input.difficulty + spec.targetOffset);
      return {
        playerScore,
        rollScore,
        totalScore,
        targetScore,
        margin: totalScore - targetScore,
      };
    },
  },

  /**
   * 2. CHECKPOINT_INSPECTION:
   * Weighted 70% Skill + 30% Stat + Luck/Reputation + d100 roll against wartime checkpoint DC.
   */
  CHECKPOINT_INSPECTION: {
    id: 'CHECKPOINT_INSPECTION',
    label: 'Military Checkpoint Diplomacy & Credentials',
    defaultStat: 'personality',
    skillWeight: 0.7,
    statWeight: 0.3,
    luckWeight: 0.2,
    repWeight: 0.3,
    rollWeight: 1.0,
    targetOffset: 50,
    triumphMargin: 25,
    partialMargin: -12,
    catastropheMargin: -30,
    evaluate(input, spec) {
      const repMod = clamp(input.reputation, -20, 30) * spec.repWeight;
      const luckMod = (input.luck - 50) * spec.luckWeight;
      const playerScore = Math.floor(
        input.skill * spec.skillWeight +
          input.stat * spec.statWeight +
          luckMod +
          repMod +
          input.contextBonus,
      );
      const rollScore = Math.floor(input.roll * spec.rollWeight);
      const totalScore = rollScore + playerScore;
      const targetScore = Math.floor(input.difficulty + spec.targetOffset);
      return {
        playerScore,
        rollScore,
        totalScore,
        targetScore,
        margin: totalScore - targetScore,
      };
    },
  },

  /**
   * 3. STREETWISE_LEVERAGE:
   * Used for Underworld buyouts, Intimidation, Extorting adventurer spoils,
   * and Naval / Marauder negotiations.
   */
  STREETWISE_LEVERAGE: {
    id: 'STREETWISE_LEVERAGE',
    label: 'Streetwise Intimidation & Underworld Leverage',
    defaultStat: 'personality',
    skillWeight: 1.0,
    statWeight: 1 / 3,
    luckWeight: 0.2,
    repWeight: 0.15,
    rollWeight: 1.0,
    targetOffset: 50,
    triumphMargin: 25,
    partialMargin: -15,
    catastropheMargin: -35,
    evaluate(input, spec) {
      const luckMod = (input.luck - 50) * spec.luckWeight;
      const playerScore = Math.trunc(
        input.skill * spec.skillWeight +
          input.stat * spec.statWeight +
          luckMod +
          input.contextBonus,
      );
      const rollScore = Math.trunc(input.roll * spec.rollWeight);
      const totalScore = rollScore + playerScore;
      const targetScore = Math.trunc(input.difficulty + spec.targetOffset);
      return {
        playerScore,
        rollScore,
        totalScore,
        targetScore,
        margin: totalScore - targetScore,
      };
    },
  },

  /**
   * 4. CRISIS_SPECIALIST:
   * Used across the 39 Crisis Encounters Matrix (Etiquette, Streetwise, Mercantile,
   * Medical, Restoration, Thaumaturgy, Orcish, Daedric, Stealth).
   * Combines Skill + Governing Stat + Luck + d100 roll so random rolls always matter!
   */
  CRISIS_SPECIALIST: {
    id: 'CRISIS_SPECIALIST',
    label: 'Crisis Encounter Skill & Stat Check',
    defaultStat: 'intelligence',
    skillWeight: 0.85,
    statWeight: 0.30,
    luckWeight: 0.25,
    repWeight: 0.25,
    rollWeight: 0.55,
    targetOffset: 25,
    triumphMargin: 22,
    partialMargin: -12,
    catastropheMargin: -28,
    evaluate(input, spec) {
      const repMod = clamp(input.reputation, -15, 25) * spec.repWeight;
      const luckMod = (input.luck - 50) * spec.luckWeight;
      const playerScore = Math.round(
        input.skill * spec.skillWeight +
          input.stat * spec.statWeight +
          luckMod +
          repMod +
          input.contextBonus,
      );
      const rollScore = Math.round(input.roll * spec.rollWeight);
      const totalScore = playerScore + rollScore;
      const targetScore = Math.round(input.difficulty + spec.targetOffset);
      return {
        playerScore,
        rollScore,
        totalScore,
        targetScore,
        margin: totalScore - targetScore,
      };
    },
  },

  /**
   * 5. TACTICAL_DUEL_WAGER:
   * Used for Adventurer duels, dares, and intercepted quest combat reclaims.
   */
  TACTICAL_DUEL_WAGER: {
    id: 'TACTICAL_DUEL_WAGER',
    label: 'Tactical Duel & Wager Contest',
    defaultStat: 'strength',
    skillWeight: 0.2,
    statWeight: 0.15,
    luckWeight: 0.2,
    repWeight: 0,
    rollWeight: 0.4,
    targetOffset: 0,
    triumphMargin: 20,
    partialMargin: -8,
    catastropheMargin: -25,
    evaluate(input, spec) {
      const statBonus = Math.trunc((input.stat - 50) * spec.statWeight);
      const luckBonus = Math.trunc((input.luck - 50) * spec.luckWeight);
      const playerScore =
        input.playerLevel * 4 + statBonus + luckBonus + input.contextBonus;
      const rollScore = Math.floor(input.roll * spec.rollWeight);
      const totalScore = playerScore + rollScore;
      const targetScore = input.difficulty;
      return {
        playerScore,
        rollScore,
        totalScore,
        targetScore,
        margin: totalScore - targetScore,
      };
    },
  },

  /**
   * 6. STEALTH_INFILTRATION:
   * Used for Road Ambush detection/evasion and Quarantine cordon sneaking.
   */
  STEALTH_INFILTRATION: {
    id: 'STEALTH_INFILTRATION',
    label: 'Stealth Detection & Infiltration',
    defaultStat: 'agility',
    skillWeight: 0.5,
    statWeight: 0.2,
    luckWeight: 0.2,
    repWeight: 0,
    rollWeight: 1.0,
    targetOffset: 0,
    triumphMargin: 25,
    partialMargin: -10,
    catastropheMargin: -30,
    evaluate(input, spec) {
      const statMod = Math.trunc((input.stat - 50) * spec.statWeight);
      const evadeChance =
        Math.trunc(input.skill * spec.skillWeight) +
        Math.trunc(input.luck * spec.luckWeight) +
        statMod +
        input.contextBonus;
      const rollScore = Math.trunc(100 - input.roll * spec.rollWeight);
      const totalScore = evadeChance + rollScore;
      const targetScore = 100 + Math.trunc(input.difficulty + spec.targetOffset);
      return {
        playerScore: evadeChance,
        rollScore,
        totalScore,
        targetScore,
        margin: totalScore - targetScore,
      };
    },
  },
};

/**
 * Live formula registry (starts as a shallow clone of DEFAULT_FORMULAS).
 * @type {Record<string, LivingFormulaSpec>}
 */
export const LIVING_FORMULAS = {
  SOCIAL_DIPLOMACY: { ...DEFAULT_FORMULAS.SOCIAL_DIPLOMACY },
  CHECKPOINT_INSPECTION: { ...DEFAULT_FORMULAS.CHECKPOINT_INSPECTION },
  STREETWISE_LEVERAGE: { ...DEFAULT_FORMULAS.STREETWISE_LEVERAGE },
  CRISIS_SPECIALIST: { ...DEFAULT_FORMULAS.CRISIS_SPECIALIST },
  TACTICAL_DUEL_WAGER: { ...DEFAULT_FORMULAS.TACTICAL_DUEL_WAGER },
  STEALTH_INFILTRATION: { ...DEFAULT_FORMULAS.STEALTH_INFILTRATION },
};

/**
 * Updates or customizes an existing Living Tamriel formula (or registers a new one).
 * Allows tweaking weights, thresholds, or the `evaluate` function at runtime.
 *
 * @param {string} formulaId
 * @param {Partial<LivingFormulaSpec>} patch
 * @returns {LivingFormulaSpec}
 */
export function configureLivingFormula(formulaId, patch) {
  const base = LIVING_FORMULAS[formulaId] || DEFAULT_FORMULAS.CRISIS_SPECIALIST;
  LIVING_FORMULAS[formulaId] = {
    ...base,
    ...patch,
    id: formulaId,
  };
  return LIVING_FORMULAS[formulaId];
}

/**
 * Resets all Living Tamriel formulas back to their canonical defaults.
 */
export function resetLivingFormulas() {
  for (const [id, spec] of Object.entries(DEFAULT_FORMULAS)) {
    LIVING_FORMULAS[id] = { ...spec };
  }
}

/**
 * Safely extracts a player's skill value by numeric `SKILLS` ID or string key.
 *
 * @param {any} playerEntity
 * @param {number|string|null} [skillId]
 * @param {number} [fallback=30]
 * @returns {number}
 */
export function readPlayerSkill(playerEntity, skillId, fallback = 30) {
  if (!playerEntity || skillId == null) return fallback;

  if (typeof skillId === 'number') {
    const liveVal = skillValue(playerEntity, skillId);
    if (typeof liveVal === 'number' && liveVal > 0) return liveVal;
    const direct = playerEntity?.skills?.[skillId];
    if (typeof direct === 'number') return direct;
    const keyName = SKILL_KEYS[skillId];
    if (keyName) {
      const byName =
        playerEntity?.skills?.[keyName] ??
        playerEntity?.skills?.[keyName.toLowerCase()];
      if (typeof byName === 'number') return byName;
    }
    return fallback;
  }

  if (typeof skillId === 'string') {
    const enumIdx = SKILLS[/** @type {keyof typeof SKILLS} */ (skillId)];
    if (typeof enumIdx === 'number') {
      return readPlayerSkill(playerEntity, enumIdx, fallback);
    }
    const byStr =
      playerEntity?.skills?.[skillId] ??
      playerEntity?.skills?.[skillId.toLowerCase()];
    if (typeof byStr === 'number') return byStr;
  }

  return fallback;
}

/**
 * Safely extracts a player's primary stat value (Personality, Intelligence, Willpower, Strength, Agility, Luck).
 *
 * @param {any} playerEntity
 * @param {string} [statName='personality']
 * @param {number} [fallback=50]
 * @returns {number}
 */
export function readPlayerStat(playerEntity, statName = 'personality', fallback = 50) {
  if (!playerEntity || !statName) return fallback;
  const lower = statName.toLowerCase();
  const cap = lower.charAt(0).toUpperCase() + lower.slice(1);

  const live = liveStat(playerEntity, lower);
  if (typeof live === 'number' && live > 0) return live;

  const raw =
    playerEntity?.stats?.[cap] ??
    playerEntity?.stats?.[lower] ??
    playerEntity?.[lower];
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;

  return fallback;
}

/**
 * Computes a context modifier for undead/lich taint when interacting with lawful/holy NPCs.
 * If the player is an undisguised Lich, social checks suffer a penalty; if disguised, a minor tension modifier applies.
 *
 * @param {any} playerEntity
 * @returns {number}
 */
export function getPlayerRoleplayContextMod(playerEntity) {
  if (!playerEntity) return 0;
  const isLich = Boolean(
    playerEntity.isLich ||
      playerEntity.lichStage ||
      playerEntity.necromancy?.isLich ||
      playerEntity.necromancy?.lichStage,
  );
  if (!isLich) return 0;
  const disguised = Boolean(
    playerEntity.mortalDisguise || playerEntity.necromancy?.mortalDisguise,
  );
  return disguised ? -2 : -15;
}

/**
 * Executes a typed Living Tamriel roleplay roll using a registered formula.
 *
 * @param {Object} params
 * @param {string} [params.formulaId='CRISIS_SPECIALIST'] - Formula key in `LIVING_FORMULAS`
 * @param {any} [params.playerEntity=null] - Player state object
 * @param {number|string|null} [params.skillId=null] - Skill ID from `SKILLS` or skill name
 * @param {string|null} [params.statName=null] - Primary stat override (auto-detected from skillId if omitted)
 * @param {number} [params.difficulty=50] - Target difficulty (DC)
 * @param {number} [params.contextBonus=0] - Situational modifier
 * @param {number} [params.targetLevel=1] - Opponent or encounter level
 * @param {number|null} [params.regionIndex=null] - Region index for reputation lookup
 * @param {number} [params.fallbackSkill=30] - Default skill when missing on entity
 * @param {number} [params.fallbackStat=50] - Default stat when missing on entity
 * @param {boolean} [params.allowLuckReroll=true] - Whether narrow failures trigger a second-chance Luck roll
 * @param {() => number} [params.rng=Math.random] - RNG function returning [0, 1)
 * @returns {LivingRollResult}
 */
export function resolveLivingRoll({
  formulaId = 'CRISIS_SPECIALIST',
  playerEntity = null,
  skillId = null,
  statName = null,
  difficulty = 50,
  contextBonus = 0,
  targetLevel = 1,
  regionIndex = null,
  fallbackSkill = 30,
  fallbackStat = 50,
  allowLuckReroll = true,
  rng = Math.random,
} = {}) {
  const spec = LIVING_FORMULAS[formulaId] || LIVING_FORMULAS.CRISIS_SPECIALIST;
  const resolvedStatName =
    statName ||
    (typeof skillId === 'number' ? SKILL_GOVERNING_STAT[skillId] : null) ||
    spec.defaultStat ||
    'personality';

  const skill = readPlayerSkill(playerEntity, skillId, fallbackSkill);
  const stat = readPlayerStat(playerEntity, resolvedStatName, fallbackStat);
  const luck = readPlayerStat(playerEntity, 'luck', 50);
  const playerLevel = Math.max(1, Number(playerEntity?.level ?? 1));
  const reputation =
    regionIndex != null
      ? Number(
          playerEntity?.legalRep?.[regionIndex] ??
            playerEntity?.regionalReputations?.[regionIndex] ??
            0,
        )
      : 0;

  const rawRng = clamp(Number(rng()), 0, 0.999999);
  const roll = rawRng * 100;

  /** @type {LivingRollInput} */
  const input = {
    skill,
    stat,
    luck,
    playerLevel,
    targetLevel: Math.max(1, Number(targetLevel || 1)),
    reputation,
    difficulty: Number(difficulty ?? 50),
    contextBonus: Number(contextBonus ?? 0),
    roll,
  };

  const evalRes = spec.evaluate(input, spec);
  const { playerScore, totalScore, targetScore, margin } = evalRes;

  const luckThreshold = Number(LivingTamrielConfig.luckRerollThreshold ?? 5);
  let luckSaved = false;

  if (
    margin < 0 &&
    allowLuckReroll &&
    Math.abs(margin) <= luckThreshold &&
    dice100(Math.trunc(luck / 2), rng())
  ) {
    luckSaved = true;
  }

  let degree = LIVING_ROLL_DEGREE.FAILURE;
  if (margin >= spec.triumphMargin || (roll >= 96 && margin >= -5)) {
    degree = LIVING_ROLL_DEGREE.TRIUMPH;
  } else if (margin >= 0) {
    degree = LIVING_ROLL_DEGREE.SUCCESS;
  } else if (luckSaved || margin >= spec.partialMargin) {
    degree = LIVING_ROLL_DEGREE.PARTIAL;
  } else if (margin < spec.catastropheMargin || roll < 5) {
    degree = LIVING_ROLL_DEGREE.CRITICAL_FAILURE;
  } else {
    degree = LIVING_ROLL_DEGREE.FAILURE;
  }

  const cleanSuccess =
    degree === LIVING_ROLL_DEGREE.TRIUMPH ||
    degree === LIVING_ROLL_DEGREE.SUCCESS;
  const passed = cleanSuccess || luckSaved;

  return {
    formulaId: spec.id,
    degree,
    passed,
    cleanSuccess,
    isTriumph: degree === LIVING_ROLL_DEGREE.TRIUMPH,
    isPartial: degree === LIVING_ROLL_DEGREE.PARTIAL,
    isCatastrophe: degree === LIVING_ROLL_DEGREE.CRITICAL_FAILURE,
    luckSaved,
    roll: Math.floor(roll),
    playerScore,
    totalScore: Math.round(totalScore),
    targetScore: Math.round(targetScore),
    margin: Math.round(margin),
    skill,
    stat,
    luck,
  };
}

/**
 * Computes a dynamic buyout/bribe multiplier based on Streetwise/Mercantile, Personality, and Luck.
 * Returns a multiplier in [0.50, 1.15] (up to 50% discount for high skill/stat).
 *
 * @param {any} playerEntity
 * @param {number} [skillId=SKILLS.Streetwise]
 * @returns {number}
 */
export function computeRoleplayBribeMultiplier(playerEntity, skillId = SKILLS.Streetwise) {
  const sw = readPlayerSkill(playerEntity, skillId, 30);
  const pers = readPlayerStat(playerEntity, 'personality', 50);
  const luck = readPlayerStat(playerEntity, 'luck', 50);
  const discount =
    sw * 0.004 + Math.max(0, pers - 50) * 0.002 + Math.max(0, luck - 50) * 0.001;
  return clamp(1 - discount, 0.50, 1.0);
}

/**
 * Outcomes for Living Tamriel surrender, yield, and forfeit interactions.
 */
export const SURRENDER_OUTCOME = Object.freeze({
  ROBBED: 'ROBBED',                     // Bandits/highwaymen took gold purse and departed
  BEATEN_PAUPER: 'BEATEN_PAUPER',       // Player had insufficient gold; beaten to 10% HP/fatigue
  CONCEDED: 'CONCEDED',                 // Claim or duel conceded without violence
  SUBMITTED_GUARD: 'SUBMITTED_GUARD',   // Submitted to provincial guards (paid fine or caution)
});

/**
 * Calculates dynamic ransom demanded by bandits/raiders when the player yields.
 *
 * @param {any} playerEntity
 * @param {number} [threatLevel=1]
 * @returns {{ currentGold: number, ransomGold: number, minDemand: number, canAfford: boolean }}
 */
export function calculateSurrenderRansom(playerEntity, threatLevel = 1) {
  const currentGold = Math.max(0, Number(playerEntity?.goldPieces ?? 0));
  const level = Math.max(1, Number(threatLevel || 1));
  const minDemand = Math.max(25, level * 15);
  const maxDemand = Math.max(minDemand, level * 80);
  const rawRansom = Math.trunc(currentGold * 0.25);
  const discount = computeRoleplayBribeMultiplier(playerEntity, SKILLS.Mercantile);
  const ransomGold = Math.max(minDemand, Math.min(maxDemand, Math.trunc(rawRansom * discount)));
  return {
    currentGold,
    ransomGold,
    minDemand,
    canAfford: currentGold >= minDemand,
  };
}

/**
 * Resolves surrender consequences against playerEntity:
 * Deducts gold, drops health & fatigue if pauper, and returns execution metrics.
 *
 * @param {Object} params
 * @param {any} params.playerEntity
 * @param {number} [params.threatLevel=1]
 * @param {number|null} [params.customRansom=null]
 * @returns {{ outcome: string, goldTaken: number, healthRemaining: number, isPauper: boolean }}
 */
export function resolveLivingSurrender({ playerEntity, threatLevel = 1, customRansom = null }) {
  if (!playerEntity) {
    return { outcome: SURRENDER_OUTCOME.ROBBED, goldTaken: 0, healthRemaining: 50, isPauper: false };
  }
  const currentGold = Math.max(0, Number(playerEntity.goldPieces ?? 0));
  const ransomCalc = calculateSurrenderRansom(playerEntity, threatLevel);
  const requiredRansom = customRansom != null ? Math.max(0, Number(customRansom)) : ransomCalc.ransomGold;
  const isPauper = currentGold < (customRansom != null ? requiredRansom : ransomCalc.minDemand);

  if (isPauper) {
    const taken = currentGold;
    playerEntity.goldPieces = 0;
    const maxHp = Math.max(10, Number(playerEntity.maxHealth ?? 50));
    playerEntity.health = Math.max(1, Math.trunc(maxHp * 0.1));
    if (typeof playerEntity.fatigue === 'number') {
      playerEntity.fatigue = Math.max(1, Math.trunc(playerEntity.fatigue * 0.1));
    }
    return {
      outcome: SURRENDER_OUTCOME.BEATEN_PAUPER,
      goldTaken: taken,
      healthRemaining: playerEntity.health,
      isPauper: true,
    };
  }

  const actualTaken = Math.min(currentGold, requiredRansom);
  playerEntity.goldPieces = Math.max(0, currentGold - actualTaken);
  if (typeof playerEntity.fatigue === 'number') {
    playerEntity.fatigue = Math.max(1, Math.trunc(playerEntity.fatigue * 0.5));
  }
  return {
    outcome: SURRENDER_OUTCOME.ROBBED,
    goldTaken: actualTaken,
    healthRemaining: Number(playerEntity.health ?? 50),
    isPauper: false,
  };
}
