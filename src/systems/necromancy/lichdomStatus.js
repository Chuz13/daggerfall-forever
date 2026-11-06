// @ts-check
// LICHDOM-STATUS: The immortal pinnacle of dark necromantic transformation.
// Built natively into Daggerfall Forever as a racialOverride entry, mirroring
// the architecture of vampirism.js and lycanthropy.js.
//
// Key principles:
// 1. Permanent racialOverride (racial: 'lichdom').
// 2. High supernatural boons:
//    - Stat bonuses: Intelligence +25, Willpower +25.
//    - Social debuff: Personality -30 (mortal horror and repulsion).
//    - Skill bonuses: Mysticism +30, Destruction +20, Alteration +20.
//    - Full immunities: Paralysis, Disease, Poison, Normal Weapons (requires Silver+ to be hit), Drowning.
// 3. Grave vulnerabilities:
//    - Holy ground burn (holyDamage: true) - Arkay and Temple consecrated ground repels and harms unlife.
// 4. Bound Phylactery: Holds the anchor to life; if the body falls, soul retreats or reconstitutes.

import { SKILLS } from '../skills.js';
import { WEAPON_MATERIALS } from '../../characters/weapons.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';

export const LICHDOM_CURSE_KEY = 'Lichdom';

export const LICH_STAT_MODS = Object.freeze({
  intelligence: 25,
  Intelligence: 25,
  willpower: 25,
  Willpower: 25,
  personality: -30,
  Personality: -30,
});

export const LICH_SKILL_MODS = Object.freeze({
  [SKILLS.Mysticism]: 30,
  [SKILLS.Destruction]: 20,
  [SKILLS.Alteration]: 20,
});

/**
 * Returns true if the entity is currently a Lich with an active racialOverride.
 * @param {object} entity
 * @returns {object|null}
 */
export function liveLichdom(entity) {
  if (!entity || !entity.racialOverride) return null;
  const o = entity.racialOverride;
  if (o.kind === 'racialOverride' && o.racial === 'lichdom' && !o.ended) {
    return o;
  }
  return null;
}

/**
 * Checks if entity has an active Lich status.
 * @param {object} entity
 * @returns {boolean}
 */
export function isLich(entity) {
  return liveLichdom(entity) !== null;
}

/**
 * Deploys the Lichdom transformation onto an entity.
 * Fails if the entity is already a Vampire, Werewolf, or Lich.
 * @param {object} entity
 * @param {object} [params]
 * @param {string} [params.phylacteryId]
 * @param {number} [params.nowMinutes]
 * @returns {object|null} The created racialOverride entry or null if refused
 */
export function applyLichdom(entity, { phylacteryId = 'phylactery_main', nowMinutes = 0 } = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) return null;
  if (!entity) return null;
  if (entity.racialOverride || liveLichdom(entity)) return null;

  const entry = {
    kind: 'racialOverride',
    permanent: true,
    racial: 'lichdom',
    key: LICHDOM_CURSE_KEY,
    raceNameOverride: 'Lich',
    phylacteryId,
    transformationTimestamp: nowMinutes,
    holyDamage: true,
    sunDamage: false,
    immuneParalysis: true,
    immuneDisease: true,
    immunePoison: true,
    immuneDrowning: true,
    immuneNormalWeapons: true,
    minMetalToHit: WEAPON_MATERIALS.Silver,
    statMods: { ...LICH_STAT_MODS },
    skillMods: { ...LICH_SKILL_MODS },
    ended: false,
  };

  entity.activeEffects = entity.activeEffects || [];
  entity.activeEffects.push(entry);
  entity.racialOverride = entry;
  delete entity.racialOverridePending;

  // Set weapon vulnerability threshold
  entity.minMetalToHit = WEAPON_MATERIALS.Silver;

  return entry;
}

/**
 * Constant magic round tick for a Lich.
 * Re-asserts immunities, stat mods, and silver-to-be-hit requirements.
 * @param {object} entity
 * @param {object} [options]
 * @param {number} [options.nowMinutes]
 */
export function lichdomMagicRound(entity, { nowMinutes = 0 } = {}) {
  const entry = liveLichdom(entity);
  if (!entry) return;

  entry.statMods = { ...LICH_STAT_MODS };
  entry.skillMods = { ...LICH_SKILL_MODS };
  entity.minMetalToHit = WEAPON_MATERIALS.Silver;
}

/**
 * Cures/strips Lichdom (e.g. phylactery destroyed or divine cleansing).
 * @param {object} entity
 * @returns {boolean}
 */
export function cureLichdom(entity) {
  const entry = liveLichdom(entity);
  if (!entry) return false;

  entry.ended = true;
  if (entity.racialOverride === entry) {
    entity.racialOverride = null;
  }
  if (Array.isArray(entity.activeEffects)) {
    entity.activeEffects = entity.activeEffects.filter((a) => a !== entry);
  }
  entity.minMetalToHit = 0;
  return true;
}
