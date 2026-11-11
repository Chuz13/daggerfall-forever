import { t } from '../textManager.js';

/**
 * Empty core perks - all perks now reside in modular mods (e.g. heroic-feats, blood-tithe).
 * Keeps core engine 100% vanilla and prevents save-state corruption on mod toggle.
 */
export const CORE_PERKS = [];

/**
 * Dynamic registry for mod-provided perks.
 * @type {Map<string, { id: string, name: string, desc: string, icon?: string, check?: (entity: any) => boolean, modId?: string }>}
 */
const _dynamicPerks = new Map();

/**
 * Register a perk dynamically (called by mods or modPluginApi).
 * @param {{ id: string, name: string, desc: string, icon?: string, check?: (entity: any) => boolean, modId?: string }} def
 */
export function registerPerk(def) {
  if (!def?.id || !def?.name) return;
  _dynamicPerks.set(def.id, {
    id: String(def.id),
    name: String(def.name),
    desc: String(def.desc ?? ''),
    icon: def.icon ? String(def.icon) : undefined,
    check: typeof def.check === 'function' ? def.check : undefined,
    modId: def.modId ? String(def.modId) : undefined,
  });
}

/**
 * Unregister a perk or all perks belonging to a mod.
 * @param {string} idOrModId
 */
export function unregisterPerk(idOrModId) {
  if (_dynamicPerks.has(idOrModId)) {
    _dynamicPerks.delete(idOrModId);
    return;
  }
  for (const [id, def] of _dynamicPerks.entries()) {
    if (def.modId === idOrModId) {
      _dynamicPerks.delete(id);
    }
  }
}

/**
 * Reset all dynamic perks (used during plugin reloads or test suites).
 */
export function clearDynamicPerks() {
  _dynamicPerks.clear();
}

/**
 * Return all currently active perks from registered mods.
 */
export function getAllPerks() {
  return Array.from(_dynamicPerks.values());
}

/**
 * Return unlocked perks for an entity. Safe against missing/unregistered perks.
 * @param {any} entity
 * @returns {string[]}
 */
export function getUnlockedPerks(entity) {
  const unlocked = new Set(Array.isArray(entity?.unlockedPerks) ? entity.unlockedPerks : []);
  if (entity) {
    for (const p of _dynamicPerks.values()) {
      if (typeof p.check === 'function') {
        try {
          if (p.check(entity)) unlocked.add(p.id);
        } catch (_e) {
          // ignore check errors on mock entities
        }
      }
    }
  }
  return Array.from(unlocked);
}

/**
 * Check if a specific perk is currently unlocked and registered.
 * @param {any} entity
 * @param {string} perkId
 * @returns {boolean}
 */
export function hasUnlockedPerk(entity, perkId) {
  if (!entity || !perkId || !_dynamicPerks.has(perkId)) return false;
  const list = getUnlockedPerks(entity);
  return list.includes(perkId);
}

/**
 * Safe perk bonuses (return 0 or 1 if perk is absent or mod disabled).
 */

/** Long blade damage and crit bonus from blade_mastery (+15% damage, +10% crit chance) */
export function getPerkBladeMasteryDamageMultiplier(entity, weapon) {
  if (!hasUnlockedPerk(entity, 'blade_mastery')) return 1.0;
  // If weapon is Long Blade (flags & 0x10 or skill check)
  if (!weapon || (weapon.flags & 0x10) !== 0) return 1.15;
  return 1.0;
}

export function getPerkCritBonus(entity, weapon) {
  if (!hasUnlockedPerk(entity, 'blade_mastery')) return 0;
  if (!weapon || (weapon.flags & 0x10) !== 0) return 0.10;
  return 0;
}

/** Stealth backstab damage bonus from shadow_step (+0.25x backstab damage) */
export function getPerkBackstabBonus(entity) {
  if (!hasUnlockedPerk(entity, 'shadow_step')) return 0;
  return 0.25;
}

/** Max health bonus from iron_constitution (+15 Max HP) */
export function getPerkHealthBonus(entity) {
  if (!hasUnlockedPerk(entity, 'iron_constitution')) return 0;
  return 15;
}

/** Max magicka bonus from arcane_reservoir (+25 Magicka) */
export function getPerkMagickaBonus(entity) {
  if (!hasUnlockedPerk(entity, 'arcane_reservoir')) return 0;
  return 25;
}

/** Saving throw bonus from iron_constitution (+15% resistance against poison/disease) */
export function getPerkSavingThrowBonus(entity, savingType) {
  if (!hasUnlockedPerk(entity, 'iron_constitution')) return 0;
  if (savingType === 'poison' || savingType === 'disease') return 15;
  return 0;
}

/** Gold loot multiplier from treasure_hunter (+20% gold found) */
export function getPerkGoldModifier(entity) {
  if (!hasUnlockedPerk(entity, 'treasure_hunter')) return 1.0;
  return 1.20;
}
