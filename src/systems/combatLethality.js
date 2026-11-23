// @ts-check
import { getPref } from './uiPrefs.js';

export const COMBAT_LETHALITY_PREF = 'combatLethality';
export const COMBAT_LETHALITY_ORDER = Object.freeze(['classic', 'sharp', 'lethal', 'brutal']);

export const COMBAT_LETHALITY_PRESETS = Object.freeze({
  classic: Object.freeze({ id: 'classic', damage: 1.0, health: 1.0 }),
  sharp: Object.freeze({ id: 'sharp', damage: 1.25, health: 1.05 }),
  lethal: Object.freeze({ id: 'lethal', damage: 1.45, health: 1.1 }),
  brutal: Object.freeze({ id: 'brutal', damage: 1.75, health: 1.2 }),
});

/** Current offline Combat Lethality preset id (`classic` | `sharp` | `lethal` | `brutal`). */
export function combatLethalityMode() {
  const raw = String(getPref(COMBAT_LETHALITY_PREF) ?? 'classic').toLowerCase();
  return raw in COMBAT_LETHALITY_PRESETS ? raw : 'classic';
}

/** Multiplier tuple `{ id, damage, health }` for spawned foes (always `classic` online). */
export function combatLethalityScale({ online = false } = {}) {
  if (online) return COMBAT_LETHALITY_PRESETS.classic;
  return COMBAT_LETHALITY_PRESETS[combatLethalityMode()];
}

/** Applies the offline Combat Lethality preset onto a newly spawned foe entity. */
export function applyCombatLethality(entity, { online = false } = {}) {
  if (!entity || online) return COMBAT_LETHALITY_PRESETS.classic;
  const s = combatLethalityScale({ online });
  if (s.health > 1) {
    entity.maxHealth = Math.max(1, Math.round((entity.maxHealth || 1) * s.health));
    entity.health = entity.maxHealth;
    entity.healthMult = (entity.healthMult ?? 1) * s.health;
  }
  if (s.damage > 1) {
    entity.damageScale =
      (Number.isFinite(entity.damageScale) && entity.damageScale > 0 ? entity.damageScale : 1) * s.damage;
  }
  entity.combatLethality = s.id;
  return s;
}

/**
 * Attenuates Direnni Hard-Mode's extra damage multiplier when Combat Lethality is already
 * raised, keeping Direnni Tower challenging without turning Lethal/Brutal into unfair one-shots.
 */
export function direnniDamageScaleForLethality(baseMult = 1.3, { online = false } = {}) {
  const d = combatLethalityScale({ online }).damage;
  return d > 1 ? Math.max(1, baseMult / Math.sqrt(d)) : baseMult;
}
