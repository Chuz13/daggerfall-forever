// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS: PATH OF CHIM (Cycle-Free Live Combat, Vitals & Rebirth Primitives)
//
// Intentionally imports ONLY pure leaf modules (skills.js, statMods.js) so that
// chargen.js, combat/formulas.js, systems/effects.js, and playerEntity.js can
// all consume ascended-god vitals, portfolio buffs, shadow boss damage
// mitigation, and divine rebirth without introducing circular ESM dependencies.
// ═══════════════════════════════════════════════════════════════════════════════

import { SKILLS, realSkillValue } from '../skills.js';
import { FATIGUE_MULTIPLIER } from '../statMods.js';

export const APOTHEOSIS_BASE_HP_BONUS = 500;
export const APOTHEOSIS_BASE_MP_BONUS = 500;
export const APOTHEOSIS_BASE_FATIGUE_POINTS = 500;
export const APOTHEOSIS_REBIRTH_MINUTES = 1440; // 1 full in-game day
export const SHADOW_DAMAGE_RESIST_MULT = 0.3;   // 70% mitigation on resisted skills/schools

export const APOTHEOSIS_FAITH_BASE_MAX = 1000;
export const APOTHEOSIS_INITIAL_FAITH = 500;
export const APOTHEOSIS_REBIRTH_FAITH_COST = 150;
export const APOTHEOSIS_PORTFOLIO_SWITCH_COST = 250;
export const APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_DAYS = 30;
export const APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_MINUTES = APOTHEOSIS_PORTFOLIO_SWITCH_COOLDOWN_DAYS * 1440;
export const APOTHEOSIS_CHAMPION_DURATION_MINUTES = 1440;
export const APOTHEOSIS_MYTHIC_DECAY_FLAT = 15;
export const CHAMPION_HEALTH = 2;
export const CHAMPION_DAMAGE = 1.25;
export const SWORN_HEALTH_PER_RANK = 0.25;
export const SWORN_DAMAGE_PER_RANK = 0.1;

export const APOTHEOSIS_FLASH_HOLD_S = 0.45;
export const APOTHEOSIS_FLASH_FADE_S = 1.6;
export const APOTHEOSIS_FLASH_RGB = Object.freeze([1.0, 0.94, 0.72]);

export const APOTHEOSIS_MARTIAL_SKILLS = Object.freeze([
  SKILLS.ShortBlade,
  SKILLS.LongBlade,
  SKILLS.HandToHand,
  SKILLS.Axe,
  SKILLS.BluntWeapon,
  SKILLS.Archery,
]);

export const APOTHEOSIS_MAGIC_SKILLS = Object.freeze([
  SKILLS.Destruction,
  SKILLS.Restoration,
  SKILLS.Illusion,
  SKILLS.Alteration,
  SKILLS.Thaumaturgy,
  SKILLS.Mysticism,
]);

const PORTFOLIO_WAR = 'war';
const PORTFOLIO_MAGIC = 'magic';
const PORTFOLIO_SHADOWS = 'shadows';
const PORTFOLIO_ORDER = 'order';

const NEGATIVE_REBIRTH_EFFECT_KINDS = new Set([
  'poison',
  'disease',
  'drainAttribute',
  'drainSkill',
  'paralyze',
  'silence',
  'continuousDamage',
  'continuousDamageSpellPoints',
  'continuousDamageFatigue',
]);

let _activePlayerRef = null;
let _rebirthHook = null;
let _rebirthFailedHook = null;

const _eventHandlers = new Map();
const _aurbisRuntime = {
  executeCommand: null,
  findItemTemplate: null,
  getSceneContext: null,
  getWorldMinutes: null,
};

const _screenFlash = {
  active: false,
  elapsed: 0,
  alpha: 0,
};

/** Registers the runtime player entity reference for zero-arg weaponDamageMods lookups. */
export function setActiveApotheosisPlayer(entity) {
  _activePlayerRef = entity ?? null;
}

/** Returns the currently active player entity registered with Apotheosis. */
export function getActiveApotheosisPlayer() {
  return _activePlayerRef;
}

/**
 * Returns the dynamic maximum Faith capacity for a god.
 * Starts at APOTHEOSIS_FAITH_BASE_MAX (1000) in Stage 2 and scales via `cultFaithBonus` in Stage 3.
 */
export function getFaithMax(entityOrState) {
  const st = entityOrState?.apotheosis && typeof entityOrState.apotheosis === 'object'
    ? entityOrState.apotheosis
    : entityOrState;
  const cultBonus = Number(st?.cultFaithBonus);
  const safeBonus = Number.isFinite(cultBonus) && cultBonus > 0 ? Math.trunc(cultBonus) : 0;
  return APOTHEOSIS_FAITH_BASE_MAX + safeBonus;
}

/** Registers a cycle-free leaf event handler for Apotheosis Stage 2 subsystems. */
export function registerApotheosisEventHandler(eventName, fn) {
  if (!eventName) return;
  if (typeof fn === 'function') _eventHandlers.set(String(eventName), fn);
  else _eventHandlers.delete(String(eventName));
}

/** Emits a leaf-safe runtime event to Stage 2 handlers if registered. */
export function notifyApotheosisEvent(eventName, payload = {}) {
  const fn = _eventHandlers.get(String(eventName));
  if (typeof fn !== 'function') return null;
  try {
    return fn(payload);
  } catch {
    return null;
  }
}

/** Registers runtime bridges from consoleCommands/scenes without introducing ESM import cycles. */
export function registerAurbisRuntime(patch = {}) {
  if (!patch || typeof patch !== 'object') return;
  if (typeof patch.executeCommand === 'function') _aurbisRuntime.executeCommand = patch.executeCommand;
  if (typeof patch.findItemTemplate === 'function') _aurbisRuntime.findItemTemplate = patch.findItemTemplate;
  if (typeof patch.getSceneContext === 'function') _aurbisRuntime.getSceneContext = patch.getSceneContext;
  if (typeof patch.getWorldMinutes === 'function') _aurbisRuntime.getWorldMinutes = patch.getWorldMinutes;
}

/** Returns the current Scroll of Aurbis runtime bridges. */
export function getAurbisRuntime() {
  return _aurbisRuntime;
}

/** Returns true if entity has completed Apotheosis and ascended as a god. */
export function isAscendedGod(entity) {
  const apo = entity?.apotheosis;
  return Boolean(apo && (apo.ascended === true || apo.stage === 'ascended'));
}

/** Base god max-health gift (+500 HP), mirroring Lichdom's live getter seam. */
export function apotheosisHpOf(entity) {
  return isAscendedGod(entity) ? APOTHEOSIS_BASE_HP_BONUS : 0;
}

/** Base god max-magicka gift (+500 MP), mirroring Lichdom's live getter seam. */
export function apotheosisMpOf(entity) {
  return isAscendedGod(entity) ? APOTHEOSIS_BASE_MP_BONUS : 0;
}

/** Base god max-fatigue gift (+500 displayed stamina * 64 = +32000 raw fatigue). */
export function apotheosisFatigueOf(entity) {
  return isAscendedGod(entity) ? APOTHEOSIS_BASE_FATIGUE_POINTS * FATIGUE_MULTIPLIER : 0;
}

/**
 * Computes real entityMods channels for an ascended god's currently selected Portfolio.
 * Returns null when the entity is not ascended or has no portfolio yet.
 */
export function computeApotheosisPortfolioMods(entity) {
  if (!isAscendedGod(entity)) return null;
  if (entity?.isPlayer) _activePlayerRef = entity;
  const portfolio = entity?.apotheosis?.portfolio;
  if (!portfolio) return null;

  if (portfolio === PORTFOLIO_WAR) {
    return {
      stats: { strength: 15, endurance: 15 },
      statMax: { strength: 15, endurance: 15 },
      armorParts: [15, 15, 15, 15, 15, 15, 15],
      fatigueLess: 0.25,
    };
  }

  if (portfolio === PORTFOLIO_MAGIC) {
    const skills = {};
    for (const id of APOTHEOSIS_MAGIC_SKILLS) skills[id] = 25;
    return {
      stats: { intelligence: 20, willpower: 20 },
      statMax: { intelligence: 20, willpower: 20 },
      magicka: 250,
      skills,
      resist: { magic: 25 },
    };
  }

  if (portfolio === PORTFOLIO_SHADOWS) {
    return {
      stats: { agility: 20, speed: 20 },
      statMax: { agility: 20, speed: 20 },
      skills: {
        [SKILLS.Lockpicking]: 25,
        [SKILLS.Pickpocket]: 25,
        [SKILLS.Stealth]: 25,
        [SKILLS.Backstabbing]: 25,
        [SKILLS.Dodging]: 25,
        [SKILLS.CriticalStrike]: 25,
      },
      fallLess: 0.5,
    };
  }

  if (portfolio === PORTFOLIO_ORDER) {
    return {
      stats: { personality: 20, luck: 20 },
      statMax: { personality: 20, luck: 20 },
      skills: {
        [SKILLS.Etiquette]: 25,
        [SKILLS.Streetwise]: 25,
        [SKILLS.Mercantile]: 25,
      },
      resist: { magic: 25, fire: 25, frost: 25, shock: 25, poison: 25 },
      standing: [25, 25, 25, 25, 25],
    };
  }

  return null;
}

/**
 * Portfolio of War weapon damage bonus (+15%) for registerWeaponDamageMod.
 * Falls back cleanly to unchanged damage when the active player is not War-ascended.
 */
export function apotheosisWeaponDamageMod(weapon, damage, entityOverride = undefined) {
  const actor = entityOverride !== undefined ? entityOverride : _activePlayerRef;
  if (!(damage > 0) || !isAscendedGod(actor) || actor?.apotheosis?.portfolio !== PORTFOLIO_WAR) {
    return damage;
  }
  return Math.max(1, Math.round(damage * 1.15));
}

function topSkillsOver100OrMax(entity, candidates) {
  const over100 = [];
  let bestId = candidates[0] ?? null;
  let bestVal = -Infinity;
  for (const id of candidates) {
    const val = realSkillValue(entity, id);
    if (val > 100) over100.push(id);
    if (val > bestVal) {
      bestVal = val;
      bestId = id;
    }
  }
  if (over100.length > 0) return over100;
  return bestId != null ? [bestId] : [];
}

/**
 * Anti-abuse resistance snapshot for Shadow of the Agent:
 * takes ALL martial skills > 100 AND ALL magic schools > 100;
 * if none exceed 100 in a category, falls back to the highest skill in that category.
 */
export function computeShadowResistProfile(entity) {
  const martialSkills = topSkillsOver100OrMax(entity, APOTHEOSIS_MARTIAL_SKILLS);
  const magicSchools = topSkillsOver100OrMax(entity, APOTHEOSIS_MAGIC_SKILLS);
  const allSkills = [...new Set([...martialSkills, ...magicSchools])];
  return {
    martialSkills,
    magicSchools,
    allSkills,
    multiplier: SHADOW_DAMAGE_RESIST_MULT,
  };
}

/**
 * Checks whether a given skill ID or school ID is resisted by a target's Shadow profile.
 * Supports dual-school signature arrays returned by castSchool/pathCastSchool.
 */
export function isShadowResistedSkill(target, skillOrSchool) {
  const profile = target?.shadowResist;
  const list = profile?.allSkills;
  if (!target?.shadowBoss || !Array.isArray(list) || !list.length || skillOrSchool == null) {
    return false;
  }
  if (Array.isArray(skillOrSchool)) {
    return skillOrSchool.some((s) => Number.isInteger(s) && list.includes(s));
  }
  return Number.isInteger(skillOrSchool) && list.includes(skillOrSchool);
}

/**
 * Applies Shadow of the Agent damage mitigation (70% reduction) for martial attacks
 * and spell schools covered by target.shadowResist.
 */
export function mitigateShadowDamage(damage, { target = null, skillId = null, schoolId = null } = {}) {
  if (!(damage > 0) || !target?.shadowBoss || !target?.shadowResist) return damage;
  if (isShadowResistedSkill(target, skillId) || isShadowResistedSkill(target, schoolId)) {
    return Math.max(1, Math.round(damage * SHADOW_DAMAGE_RESIST_MULT));
  }
  return damage;
}

/** Registers the scene-host handler that advances world time (+1 day) and clears nearby threats on god rebirth. */
export function setApotheosisRebirthHook(fn) {
  _rebirthHook = typeof fn === 'function' ? fn : null;
}

/** Registers a callback invoked when divine rebirth is skipped due to insufficient Faith. */
export function setApotheosisRebirthFailedHook(fn) {
  _rebirthFailedHook = typeof fn === 'function' ? fn : null;
}

/** Triggers the golden-white full-screen flash overlay on divine rebirth. */
export function triggerApotheosisScreenFlash() {
  _screenFlash.active = true;
  _screenFlash.elapsed = 0;
  _screenFlash.alpha = 1;
}

/** Advances and returns the current golden-white flash overlay alpha in [0, 1]. */
export function tickApotheosisScreenFlash(dt) {
  if (!_screenFlash.active) return 0;
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
  _screenFlash.elapsed += step;
  if (_screenFlash.elapsed <= APOTHEOSIS_FLASH_HOLD_S) {
    _screenFlash.alpha = 1;
    return 1;
  }
  const fadeElapsed = _screenFlash.elapsed - APOTHEOSIS_FLASH_HOLD_S;
  if (fadeElapsed >= APOTHEOSIS_FLASH_FADE_S) {
    _screenFlash.active = false;
    _screenFlash.elapsed = 0;
    _screenFlash.alpha = 0;
    return 0;
  }
  _screenFlash.alpha = Math.max(0, 1 - fadeElapsed / APOTHEOSIS_FLASH_FADE_S);
  return _screenFlash.alpha;
}

export function getApotheosisFlashState() {
  return {
    active: _screenFlash.active,
    alpha: _screenFlash.alpha,
    elapsed: _screenFlash.elapsed,
    rgb: APOTHEOSIS_FLASH_RGB,
  };
}

/**
 * Intercepts physical death of an ascended god (unconditionally, even when online
 * respawn prefs are disabled). Manifests right on the spot after 1 in-game day:
 * - Restores health, magicka, fatigue to maximum
 * - Ends negative active effects cleanly
 * - Triggers the golden-white rebirth flash
 * - Invokes the host rebirth hook to advance +1440m and despawn live foes without kill credit.
 */
export function reconstituteAscendedGod(entity, options = {}) {
  if (!isAscendedGod(entity)) {
    return { reconstituted: false, reason: 'Not an ascended god' };
  }

  if (!entity.apotheosis || typeof entity.apotheosis !== 'object') {
    entity.apotheosis = { ascended: true, stage: 'ascended', rebirthCount: 0, faith: APOTHEOSIS_INITIAL_FAITH };
  }
  if (entity.apotheosis.faith == null || !Number.isFinite(Number(entity.apotheosis.faith))) {
    entity.apotheosis.faith = APOTHEOSIS_INITIAL_FAITH;
  }

  const free = options?.free === true;
  const curFaith = Math.max(0, Math.trunc(Number(entity.apotheosis.faith) || 0));
  if (!free && curFaith < APOTHEOSIS_REBIRTH_FAITH_COST) {
    try {
      _rebirthFailedHook?.(entity, {
        faith: curFaith,
        required: APOTHEOSIS_REBIRTH_FAITH_COST,
        ...options,
      });
    } catch {
      /* rebirth notification failure never blocks fallback death flow */
    }
    return {
      reconstituted: false,
      insufficientFaith: true,
      faith: curFaith,
      required: APOTHEOSIS_REBIRTH_FAITH_COST,
      reason: 'Insufficient Faith for Divine Rebirth',
    };
  }

  const faithSpent = free ? 0 : APOTHEOSIS_REBIRTH_FAITH_COST;
  entity.apotheosis.faith = Math.max(0, curFaith - faithSpent);

  const maxHp = Math.max(1, Number(entity.maxHealth ?? 100));
  entity.health = maxHp;
  if (typeof entity.currentHealth === 'number') entity.currentHealth = maxHp;
  entity.magicka = Math.max(0, Number(entity.maxMagicka ?? 100));
  const rawMaxFatigue = Number(entity.maxFatigue);
  const fullFatigue = Number.isFinite(rawMaxFatigue) && rawMaxFatigue > 0 ? rawMaxFatigue : 1000;
  entity.fatigue = fullFatigue;
  if (typeof entity.bleeding === 'number') entity.bleeding = 0;

  if (Array.isArray(entity.activeEffects)) {
    for (const eff of entity.activeEffects) {
      if (eff && NEGATIVE_REBIRTH_EFFECT_KINDS.has(eff.kind)) {
        eff.ended = true;
      }
    }
  }

  entity.apotheosis.rebirthCount = (entity.apotheosis.rebirthCount ?? 0) + 1;

  triggerApotheosisScreenFlash();

  let hostResult = null;
  const hook = typeof options?.onRebirth === 'function' ? options.onRebirth : _rebirthHook;
  if (typeof hook === 'function') {
    try {
      hostResult = hook(entity, { ...options, minutesAdvanced: APOTHEOSIS_REBIRTH_MINUTES });
    } catch (e) {
      console.error('[apotheosis] divine rebirth hook failed:', e);
    }
  }

  return {
    reconstituted: true,
    minutesAdvanced: APOTHEOSIS_REBIRTH_MINUTES,
    daysAdvanced: 1,
    rebirthCount: entity.apotheosis.rebirthCount,
    faithSpent,
    faithRemaining: entity.apotheosis.faith,
    hostResult,
  };
}
