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
import { registerBlowTakenMod } from '../blowTaken.js';
import { lockLichTaint } from './necroTaint.js';
import { lichParalyzingTouchSpell, mortalDisguiseSpell, fingerOfDeathSpell } from './necromanticSpells.js';

export const LICHDOM_CURSE_KEY = 'Lichdom';
export const ANCIENT_LICHDOM_CURSE_KEY = 'AncientLichdom';

export const LICH_HP_BONUS = 100;
export const LICH_MANA_BONUS = 250;
export const LICH_MANA_REGEN = 5;

export const ANCIENT_LICH_HP_BONUS = 250; // relative to mortal (+150 over Lich)
export const ANCIENT_LICH_MANA_BONUS = 500; // relative to mortal (+250 over Lich)
export const ANCIENT_LICH_MANA_REGEN = 15; // flat per round (+10 over Lich)

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

export const ANCIENT_LICH_STAT_MODS = Object.freeze({
  intelligence: 50,
  Intelligence: 50,
  willpower: 50,
  Willpower: 50,
  personality: -60,
  Personality: -60,
});

export const ANCIENT_LICH_SKILL_MODS = Object.freeze({
  [SKILLS.Mysticism]: 60,
  [SKILLS.Destruction]: 40,
  [SKILLS.Alteration]: 40,
});

// Arrow damage mitigation: 50% for Lich, 80% for Ancient Lich (incoming player damage)
registerBlowTakenMod('lichArrowMitigation', (_attacker, target, _weapon, info) => {
  if (!target?.isPlayer) return 1;
  if (info?.kind !== 'arrow') return 1;
  if (isAncientLich(target)) return 0.2; // 80% mitigation (takes 20%)
  if (isLich(target)) return 0.5;        // 50% mitigation (takes 50%)
  return 1;
});

/**
 * Returns true if the entity is currently a Lich with an active racialOverride.
 * @param {object} entity
 * @returns {object|null}
 */
export function liveLichdom(entity) {
  if (!entity || !entity.racialOverride) return null;
  const o = entity.racialOverride;
  if (o === 'lichdom') return { kind: 'racialOverride', racial: 'lichdom', ended: false };
  if (o.kind === 'racialOverride' && o.racial === 'lichdom' && !o.ended) {
    return o;
  }
  return null;
}

/**
 * Returns true if the entity is currently an Ancient Lich with an active racialOverride.
 * @param {object} entity
 * @returns {object|null}
 */
export function liveAncientLichdom(entity) {
  if (!entity || !entity.racialOverride) return null;
  const o = entity.racialOverride;
  if (o === 'ancient_lichdom') return { kind: 'racialOverride', racial: 'ancient_lichdom', ended: false };
  if (o.kind === 'racialOverride' && o.racial === 'ancient_lichdom' && !o.ended) {
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
 * Checks if entity has an active Ancient Lich status.
 * @param {object} entity
 * @returns {boolean}
 */
export function isAncientLich(entity) {
  return liveAncientLichdom(entity) !== null;
}

/**
 * Checks if entity has an active Lich OR Ancient Lich status.
 * @param {object} entity
 * @returns {boolean}
 */
export function isAnyLich(entity) {
  return isLich(entity) || isAncientLich(entity);
}

/**
 * Checks whether the entity is currently disguised as a mortal (via Mortal Disguise spell effect 54,255,
 * an equipped item enchanted with Disguise param -54, or a drawn hood).
 * @param {object} entity
 * @returns {boolean}
 */
export function isPlayerDisguised(entity) {
  if (!entity) return false;
  if (entity.isHooded || entity.isDisguised) return true;
  if (Array.isArray(entity.activeEffects)) {
    if (entity.activeEffects.some((a) => a && !a.ended && (a.kind === 'disguise' || a.key === '54,255'))) {
      return true;
    }
  }
  if (Array.isArray(entity.items)) {
    if (
      entity.items.some(
        (it) =>
          it &&
          it.equipSlot != null &&
          (it.disguiseEnchant ||
            (Array.isArray(it.enchantments) && it.enchantments.some((e) => e && Number(e.param) === -54)))
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Grants the Lich-exclusive innate spells (Paralyzing Touch and Mortal Disguise) to an entity's spellbook.
 * @param {object} entity
 */
export function grantLichInnateSpells(entity) {
  if (!entity) return;
  if (!Array.isArray(entity.spells)) {
    entity.spells = [];
  }
  for (const sp of [lichParalyzingTouchSpell(), mortalDisguiseSpell()]) {
    const exists = entity.spells.some(
      (s) => s && (s.name === sp.name || (s.index != null && s.index === sp.index)),
    );
    if (!exists) {
      entity.spells.push(sp);
    }
  }
}

/**
 * Grants the Ancient Lich exclusive innate spell (Finger of Death) to an entity's spellbook.
 * @param {object} entity
 */
export function grantAncientLichInnateSpells(entity) {
  if (!entity) return;
  if (!Array.isArray(entity.spells)) {
    entity.spells = [];
  }
  const sp = fingerOfDeathSpell();
  const exists = entity.spells.some(
    (s) => s && (s.name === sp.name || (s.index != null && s.index === sp.index)),
  );
  if (!exists) {
    entity.spells.push(sp);
  }
}

/**
 * Returns HP bonus granted by Lichdom or Ancient Lichdom.
 * Lich: +100 HP.
 * Ancient Lich: +250 HP (+150 over Lich).
 * @param {object} entity
 * @returns {number}
 */
export function lichHpOf(entity) {
  if (!entity) return 0;
  if (isAncientLich(entity)) return entity.racialOverride?.hpBonus ?? ANCIENT_LICH_HP_BONUS;
  if (isLich(entity)) return entity.racialOverride?.hpBonus ?? LICH_HP_BONUS;
  return 0;
}

/**
 * Returns Max Magicka (Mana) bonus granted by Lichdom or Ancient Lichdom.
 * Lich: +250 Mana.
 * Ancient Lich: +500 Mana (+250 over Lich).
 * @param {object} entity
 * @returns {number}
 */
export function lichMpOf(entity) {
  if (!entity) return 0;
  if (isAncientLich(entity)) return entity.racialOverride?.manaBonus ?? ANCIENT_LICH_MANA_BONUS;
  if (isLich(entity)) return entity.racialOverride?.manaBonus ?? LICH_MANA_BONUS;
  return 0;
}

/**
 * Returns flat Mana regeneration per magic round granted by Lichdom or Ancient Lichdom.
 * Lich: 5 mana/round.
 * Ancient Lich: 15 mana/round (+10 over Lich).
 * @param {object} entity
 * @returns {number}
 */
export function lichManaRegenOf(entity) {
  if (!entity) return 0;
  if (isAncientLich(entity)) return entity.racialOverride?.manaRegen ?? ANCIENT_LICH_MANA_REGEN;
  if (isLich(entity)) return entity.racialOverride?.manaRegen ?? LICH_MANA_REGEN;
  return 0;
}

/**
 * Deploys the Lichdom transformation onto an entity.
 * Fails if the entity is already a Vampire, Werewolf, Lich, or Ancient Lich.
 * @param {object} entity
 * @param {object} [params]
 * @param {string} [params.phylacteryId]
 * @param {number} [params.nowMinutes]
 * @returns {object|null} The created racialOverride entry or null if refused
 */
export function applyLichdom(entity, { phylacteryId = 'phylactery_main', nowMinutes = 0 } = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) return null;
  if (!entity) return null;
  if (entity.racialOverride || liveLichdom(entity) || liveAncientLichdom(entity)) return null;

  const entry = {
    kind: 'racialOverride',
    permanent: true,
    racial: 'lichdom',
    key: LICHDOM_CURSE_KEY,
    raceNameOverride: 'Lich',
    bundleId: 91001,
    bundleName: 'Lichdom',
    bundleSpellIndex: -50,
    bundleIcon: 25,
    bundleSelfCast: true,
    showIcon: true,
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
    statMaxMods: { intelligence: 25, willpower: 25 },
    skillMods: { ...LICH_SKILL_MODS },
    hpBonus: LICH_HP_BONUS,
    manaBonus: LICH_MANA_BONUS,
    manaRegen: LICH_MANA_REGEN,
    ended: false,
  };

  entity.activeEffects = entity.activeEffects || [];
  entity.activeEffects.push(entry);
  entity.racialOverride = entry;
  delete entity.racialOverridePending;

  // Clear accumulated mortal needs and climate exposure
  if (entity.survival && typeof entity.survival === 'object') {
    entity.survival.lastAte = nowMinutes;
    entity.survival.awakeSince = nowMinutes;
    entity.survival.thirst = 0;
    entity.survival.sleepDebt = 0;
    entity.survival.exposure = 0;
    delete entity.survival.borrowed;
    delete entity.survival.warmed;
  }

  // Set weapon vulnerability threshold
  entity.minMetalToHit = WEAPON_MATERIALS.Silver;
  entity.necroTaint = 100;
  lockLichTaint();
  grantLichInnateSpells(entity);

  return entry;
}

/**
 * Deploys the Ancient Lichdom transformation onto an entity.
 * Fails if the entity is already a Vampire, Werewolf, Lich, or Ancient Lich.
 * @param {object} entity
 * @param {object} [params]
 * @param {string} [params.phylacteryId]
 * @param {number} [params.nowMinutes]
 * @returns {object|null} The created racialOverride entry or null if refused
 */
export function applyAncientLichdom(entity, { phylacteryId = 'phylactery_ancient', nowMinutes = 0 } = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) return null;
  if (!entity) return null;
  if (liveAncientLichdom(entity) || entity.racialOverride?.racial === 'ancient_lichdom') return null;
  if (entity.racialOverride && !liveLichdom(entity) && entity.racialOverride?.racial !== 'lichdom') {
    return null;
  }
  if (liveLichdom(entity) || entity.racialOverride?.racial === 'lichdom') {
    cureLichdom(entity);
  }

  const entry = {
    kind: 'racialOverride',
    permanent: true,
    racial: 'ancient_lichdom',
    key: ANCIENT_LICHDOM_CURSE_KEY,
    raceNameOverride: 'Ancient Lich',
    bundleId: 91002,
    bundleName: 'Arch-Lichdom',
    bundleSpellIndex: -52,
    bundleIcon: 25,
    bundleSelfCast: true,
    showIcon: true,
    phylacteryId,
    transformationTimestamp: nowMinutes,
    holyDamage: true,
    sunDamage: false,
    immuneParalysis: true,
    immuneDisease: true,
    immunePoison: true,
    immuneDrowning: true,
    immuneNormalWeapons: true,
    minMetalToHit: WEAPON_MATERIALS.Mithril,
    statMods: { ...ANCIENT_LICH_STAT_MODS },
    statMaxMods: { intelligence: 50, willpower: 50 },
    skillMods: { ...ANCIENT_LICH_SKILL_MODS },
    hpBonus: ANCIENT_LICH_HP_BONUS,
    manaBonus: ANCIENT_LICH_MANA_BONUS,
    manaRegen: ANCIENT_LICH_MANA_REGEN,
    ended: false,
  };

  entity.activeEffects = entity.activeEffects || [];
  entity.activeEffects.push(entry);
  entity.racialOverride = entry;
  delete entity.racialOverridePending;

  // Clear accumulated mortal needs and climate exposure
  if (entity.survival && typeof entity.survival === 'object') {
    entity.survival.lastAte = nowMinutes;
    entity.survival.awakeSince = nowMinutes;
    entity.survival.thirst = 0;
    entity.survival.sleepDebt = 0;
    entity.survival.exposure = 0;
    delete entity.survival.borrowed;
    delete entity.survival.warmed;
  }

  entity.minMetalToHit = WEAPON_MATERIALS.Mithril;
  entity.necroTaint = 100;
  lockLichTaint();
  grantLichInnateSpells(entity);
  grantAncientLichInnateSpells(entity);

  return entry;
}

/**
 * Constant magic round tick for a Lich or Ancient Lich.
 * Re-asserts immunities, stat mods, and weapon metal requirements,
 * and regenerates flat magicka (5 for Lich, 15 for Ancient Lich) per magic round.
 * @param {object} entity
 * @param {object} [options]
 * @param {number} [options.nowMinutes]
 * @param {object} [options.sinks]
 */
export function lichdomMagicRound(entity, { nowMinutes = 0, sinks = null } = {}) {
  const entry = liveLichdom(entity) || liveAncientLichdom(entity);
  if (!entry) return;

  const disguised = isPlayerDisguised(entity);
  if (entry.racial === 'ancient_lichdom') {
    entry.statMods = disguised
      ? { ...ANCIENT_LICH_STAT_MODS, personality: 0, Personality: 0 }
      : { ...ANCIENT_LICH_STAT_MODS };
    entry.skillMods = { ...ANCIENT_LICH_SKILL_MODS };
    entity.minMetalToHit = WEAPON_MATERIALS.Mithril;
  } else {
    entry.statMods = disguised
      ? { ...LICH_STAT_MODS, personality: 0, Personality: 0 }
      : { ...LICH_STAT_MODS };
    entry.skillMods = { ...LICH_SKILL_MODS };
    entity.minMetalToHit = WEAPON_MATERIALS.Silver;
  }

  // Flat mana regen: 5/round for Lich, 15/round for Ancient Lich (+10 over Lich)
  const regenAmount = entry.racial === 'ancient_lichdom'
    ? (entry.manaRegen ?? ANCIENT_LICH_MANA_REGEN)
    : (entry.manaRegen ?? LICH_MANA_REGEN);

  if (regenAmount > 0 && Number.isFinite(entity.magicka) && (entity.health == null || entity.health > 0)) {
    const maxMp = Number.isFinite(entity.maxMagicka) ? entity.maxMagicka : Infinity;
    if (entity.magicka < maxMp) {
      if (sinks && typeof sinks.restoreMagicka === 'function') {
        sinks.restoreMagicka(regenAmount);
      } else {
        entity.magicka = Math.min(maxMp, entity.magicka + regenAmount);
      }
    }
  }
}

/**
 * Cures/strips Ancient Lichdom.
 * @param {object} entity
 * @returns {boolean}
 */
export function cureAncientLichdom(entity) {
  const entry = liveAncientLichdom(entity);
  if (!entry && entity?.racialOverride !== 'ancient_lichdom' && entity?.racialOverride?.racial !== 'ancient_lichdom') return false;

  if (entry) entry.ended = true;
  if (entity.racialOverride === entry || entity.racialOverride === 'ancient_lichdom' || entity.racialOverride?.racial === 'ancient_lichdom') {
    entity.racialOverride = null;
  }
  if (Array.isArray(entity.activeEffects)) {
    entity.activeEffects = entity.activeEffects.filter((a) => a !== entry && a.racial !== 'ancient_lichdom');
  }
  if (entity?.phylacteryAnchor) {
    entity.phylacteryAnchor.state = 'unbound';
    delete entity.phylacteryAnchor;
  }
  entity.minMetalToHit = 0;
  return true;
}

/**
 * Cures/strips Lichdom or Ancient Lichdom (e.g. phylactery destroyed or divine cleansing).
 * @param {object} entity
 * @returns {boolean}
 */
export function cureLichdom(entity) {
  const entry = liveLichdom(entity) || liveAncientLichdom(entity);
  if (!entry && entity?.racialOverride !== 'lichdom' && entity?.racialOverride?.racial !== 'lichdom' && entity?.racialOverride !== 'ancient_lichdom' && entity?.racialOverride?.racial !== 'ancient_lichdom') return false;

  if (entry) entry.ended = true;
  if (entity.racialOverride === entry || entity.racialOverride === 'lichdom' || entity.racialOverride?.racial === 'lichdom' || entity.racialOverride === 'ancient_lichdom' || entity.racialOverride?.racial === 'ancient_lichdom') {
    entity.racialOverride = null;
  }
  if (Array.isArray(entity.activeEffects)) {
    entity.activeEffects = entity.activeEffects.filter((a) => a !== entry && a.racial !== 'lichdom' && a.racial !== 'ancient_lichdom');
  }
  if (entity?.phylacteryAnchor) {
    entity.phylacteryAnchor.state = 'unbound';
    delete entity.phylacteryAnchor;
  }
  entity.minMetalToHit = 0;
  return true;
}
