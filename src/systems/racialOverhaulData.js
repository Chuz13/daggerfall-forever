// Leaf data, pure formulas, flag overlays, vital/standing/pace helpers,
// and localized race trait descriptions for the optional, live-toggleable Racial Overhaul.
// Kept as a minimal leaf (uiPrefs, textManager, races, skills only) so BOOT2's static reach stays untouched.

import { getPref } from './uiPrefs.js';
import { t } from './textManager.js';
import { RACES, RACE_TEMPLATES, raceById, raceByKey } from './races.js';
import { SKILLS } from './skills.js';

export const RACIAL_OVERHAUL_PREF = 'racialOverhaul';

// Exact DFCareer.EffectFlags bit values (spellcast.js EFFECT_FLAGS / races.js).
const EF_PARALYSIS = 1;
const EF_MAGIC = 2;
const EF_POISON = 4;
const EF_FIRE = 8;
const EF_FROST = 16;
const EF_SHOCK = 32;
const EF_DISEASE = 64;

let _stateOverride = null;

/** Whether the Racial Overhaul feature is currently active (true by default). */
export function isRacialOverhaulEnabled() {
  if (_stateOverride !== null) return _stateOverride;
  return getPref(RACIAL_OVERHAUL_PREF) !== false;
}

/** Temporarily evaluate `fn()` with the overhaul forced to `enabled` (used by live-toggle rescaling and tests). */
export function withRacialOverhaulState(enabled, fn) {
  const prev = _stateOverride;
  _stateOverride = !!enabled;
  try {
    return fn();
  } finally {
    _stateOverride = prev;
  }
}

/** True when `entity` is a local player (or player snapshot) eligible for Racial Overhaul bonuses. */
export function isOverhaulPlayer(entity) {
  if (!entity || entity.isPlayer === false || entity.isEnemy || entity.isPeer) return false;
  const id = entity.raceId;
  return Number.isInteger(id) && id >= 1 && id <= 8;
}

/** Favored weapon skill IDs per raceId. Breton & HighElf have no favored weapon bonuses. */
export const FAVORED_WEAPON_SKILLS = Object.freeze({
  [RACES.Breton]: Object.freeze([]),
  [RACES.Redguard]: Object.freeze([SKILLS.LongBlade, SKILLS.ShortBlade]),
  [RACES.Nord]: Object.freeze([SKILLS.Axe, SKILLS.BluntWeapon]),
  [RACES.DarkElf]: Object.freeze([SKILLS.LongBlade, SKILLS.ShortBlade]),
  [RACES.HighElf]: Object.freeze([]),
  [RACES.WoodElf]: Object.freeze([SKILLS.Archery, SKILLS.ShortBlade]),
  [RACES.Khajiit]: Object.freeze([SKILLS.HandToHand, SKILLS.ShortBlade]),
  [RACES.Argonian]: Object.freeze([SKILLS.BluntWeapon, SKILLS.Archery]),
});

const ZERO_MODS = Object.freeze({ damageMod: 0, toHitMod: 0 });

/**
 * DPS-homogenized, level-scaled combat bonuses for favored weapons (including unarmed / Hand Wraps).
 * Callers in formulas.js / pcaao.js / combatStats.js pass `skillId` resolved via weaponSkillUsed / isHandWraps.
 */
export function overhaulRacialCombatMods(attacker, weapon, skillId = null) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(attacker)) return ZERO_MODS;
  const favored = FAVORED_WEAPON_SKILLS[attacker.raceId];
  if (!favored || favored.length === 0) return ZERO_MODS;

  const sk = skillId ?? (weapon ? (weapon.skillId ?? weapon.weaponSkill ?? null) : SKILLS.HandToHand);
  if (sk == null || !favored.includes(sk)) return ZERO_MODS;

  const lvl = Math.max(1, Math.trunc(Number(attacker.level) || 1));
  const toHitMod = Math.floor(lvl / 3) + 2;
  let damageMod = 0;
  if (sk === SKILLS.ShortBlade || sk === SKILLS.HandToHand) {
    damageMod = Math.floor(lvl / 6) + 1;
  } else if (sk === SKILLS.LongBlade) {
    damageMod = Math.floor(lvl / 5) + 1;
  } else if (sk === SKILLS.Axe || sk === SKILLS.BluntWeapon) {
    damageMod = Math.floor(lvl / 4) + 1;
  } else if (sk === SKILLS.Archery) {
    damageMod = Math.floor(lvl / 3) + 1;
  }
  return { damageMod, toHitMod };
}

/** Racial resistance/immunity/weakness flag overlays when overhaul is active. */
const OVERHAUL_FLAG_OVERLAYS = Object.freeze({
  [RACES.Breton]: Object.freeze({ resistanceFlags: EF_MAGIC, immunityFlags: 0, lowToleranceFlags: 0 }),
  [RACES.Redguard]: Object.freeze({ resistanceFlags: EF_POISON | EF_DISEASE, immunityFlags: 0, lowToleranceFlags: 0 }),
  [RACES.Nord]: Object.freeze({ resistanceFlags: EF_FROST | EF_SHOCK, immunityFlags: 0, lowToleranceFlags: 0 }),
  [RACES.DarkElf]: Object.freeze({ resistanceFlags: EF_FIRE, immunityFlags: 0, lowToleranceFlags: 0 }),
  [RACES.HighElf]: Object.freeze({ resistanceFlags: 0, immunityFlags: EF_PARALYSIS, lowToleranceFlags: EF_FIRE | EF_FROST | EF_SHOCK }),
  [RACES.WoodElf]: Object.freeze({ resistanceFlags: EF_DISEASE | EF_POISON, immunityFlags: 0, lowToleranceFlags: 0 }),
  [RACES.Khajiit]: Object.freeze({ resistanceFlags: 0, immunityFlags: 0, lowToleranceFlags: 0 }),
  [RACES.Argonian]: Object.freeze({ resistanceFlags: EF_DISEASE, immunityFlags: EF_POISON, lowToleranceFlags: 0 }),
});

const _overhaulTemplates = new Map();
for (const tpl of RACE_TEMPLATES) {
  const ov = OVERHAUL_FLAG_OVERLAYS[tpl.id];
  _overhaulTemplates.set(tpl.id, ov ? Object.freeze({ ...tpl, ...ov }) : tpl);
}

/**
 * Resolve the effective birth RaceTemplate for `entity` (never including vampire/werewolf overrides).
 * Returns vanilla `raceById` / `raceByKey` when Racial Overhaul is OFF or for non-players.
 */
export function effectiveRaceTemplate(entity) {
  if (!entity) return null;
  const base =
    (typeof entity.race === 'string' && RACE_TEMPLATES.find((r) => r.key === entity.race || r.name === entity.race)) ||
    raceById(entity.raceId) ||
    raceByKey(entity.race) ||
    null;
  if (!base) return null;
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer({ ...entity, raceId: base.id })) return base;
  return _overhaulTemplates.get(base.id) ?? base;
}

/** Nord: +10% max HP (on top of own/raw HP). */
export function racialHpBonus(entity, ownHp) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity) || entity.raceId !== RACES.Nord) return 0;
  return Math.trunc(Math.max(0, Number(ownHp) || 0) * 0.10);
}

/** High Elf: +25% max Magicka (on top of base intelligence-derived Magicka). */
export function racialMpBonus(entity, rawMp) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity) || entity.raceId !== RACES.HighElf) return 0;
  return Math.trunc(Math.max(0, Number(rawMp) || 0) * 0.25);
}

/** Redguard: 1.15x max Fatigue. */
export function racialFatigueMult(entity) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity) || entity.raceId !== RACES.Redguard) return 1;
  return 1.15;
}

/** Breton: +10 standing with Scholars (2) & Nobility (3), outside gear standing cap. */
export function racialStandingBonus(entity) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity) || entity.raceId !== RACES.Breton) return null;
  return { 2: 10, 3: 10 };
}

/** Redguard: 0.70x swing fatigue cost (-30%). */
export function racialSwingFatigueMult(entity) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity) || entity.raceId !== RACES.Redguard) return 1;
  return 0.70;
}

/** Argonian: 1.40x swim speed (+40%). */
export function racialSwimSpeedMult(entity) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity) || entity.raceId !== RACES.Argonian) return 1;
  return 1.40;
}

/** High Elf: 1.35x rest Spell Point recovery rate (+35%). */
export function racialRestSpMult(entity) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity) || entity.raceId !== RACES.HighElf) return 1;
  return 1.35;
}

/** Khajiit: soft night-vision ambient lift when sunScale is low. */
export function racialNightVisionBoost(entity) {
  if (!isRacialOverhaulEnabled() || !isOverhaulPlayer(entity) || entity.raceId !== RACES.Khajiit) return 0;
  return 0.18;
}

/** Wood Elf Green Pact: non-quest Animals ignore unprovoked Wood Elf player. */
export function isGreenPactProtected(foe, targetEntity, isAnimal) {
  if (!isAnimal || !isRacialOverhaulEnabled()) return false;
  if (!targetEntity?.isPlayer || targetEntity.raceId !== RACES.WoodElf) return false;
  if (foe?.isQuestFoe || foe?.entity?._provokedByPlayer) return false;
  return true;
}

const FALLBACK_DESC = Object.freeze({
  Breton: '+30% Magic Resistance, 15% Spell Absorption, -15% Restoration/Alteration/Mysticism spell cost, +10 Etiquette & Mysticism, +10 Nobility & Scholars standing.',
  Redguard: 'Favored weapons: Long Blade & Short Blade (level-scaled Hit & Damage). +30% Poison & Disease Resistance, +15% max Fatigue, -25% movement Fatigue drain, -30% attack Fatigue cost, +10° heat tolerance.',
  Nord: 'Favored weapons: Axe & Blunt Weapon (level-scaled Hit & Damage). +50% Frost & +30% Shock Resistance, +10% max Health, +15% carry weight, +15° cold tolerance, +25% melee damage below 35% Health.',
  DarkElf: 'Favored weapons: Long Blade & Short Blade (level-scaled Hit & Damage). +50% Fire Resistance, +5 Destruction & Short Blade. Spellsword Resonance (1H weapon + empty off-hand): -20% Destruction cost, +10% Destruction damage, +10% cast speed.',
  HighElf: 'Paralysis Immunity, -25% Fire/Frost/Shock Resistance (weakness). +25% max Magicka, +35% Magicka rest recovery, +15% spell damage, +12% cast speed.',
  WoodElf: 'Favored weapons: Archery & Short Blade (level-scaled Hit & Damage). +30% Disease & Poison Resistance, +10 Stealth, +10% bow reload speed, +25% damage vs unaware foes. Green Pact: wild animals ignore you unless provoked.',
  Khajiit: 'Favored weapons: Hand-to-Hand & Short Blade (level-scaled Hit & Damage). +5 Speed & Agility, +10 Stealth, Pickpocket & Critical Strike, -50% fall damage, Night Vision in darkness.',
  Argonian: 'Favored weapons: Blunt Weapon & Archery (level-scaled Hit & Damage). Poison Immunity, +50% Disease Resistance, +15 Swimming, +40% swim speed, +5 Armor on all parts, passive Health & Fatigue regen in water or rain.',
});

/**
 * Returns localized `{ header, text }` describing Racial Overhaul traits for a race key or numeric raceId,
 * or `null` when the Racial Overhaul setting is disabled.
 */
export function racialOverhaulInfo(raceKeyOrId) {
  if (!isRacialOverhaulEnabled()) return null;
  let tpl = null;
  if (typeof raceKeyOrId === 'number') tpl = raceById(raceKeyOrId);
  else if (typeof raceKeyOrId === 'string') tpl = raceByKey(raceKeyOrId) ?? RACE_TEMPLATES.find((r) => r.name === raceKeyOrId) ?? null;
  if (!tpl) return null;
  const fallback = FALLBACK_DESC[tpl.key];
  if (!fallback) return null;
  return {
    header: t('race.overhaul.header', 'Racial Traits (Overhaul)'),
    text: t(`race.overhaul.desc.${tpl.key}`, fallback),
  };
}
