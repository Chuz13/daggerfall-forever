import { SKILLS, skillValue } from '../skills.js';
import { t } from '../textManager.js';

export const CORE_PERKS = [
  {
    id: 'blade_mastery',
    get name() { return t('perks.blade_mastery.name', 'Blade Mastery'); },
    get desc() { return t('perks.blade_mastery.desc', 'Long Blade >= 50: +10% melee crit & parry precision.'); },
    check: (e) => skillValue(e, SKILLS.LongBlade) >= 50,
  },
  {
    id: 'arcane_reservoir',
    get name() { return t('perks.arcane_reservoir.name', 'Arcane Reservoir'); },
    get desc() { return t('perks.arcane_reservoir.desc', 'Mysticism >= 50: +25 max Magicka & undead control affinity.'); },
    check: (e) => skillValue(e, SKILLS.Mysticism) >= 50,
  },
  {
    id: 'shadow_step',
    get name() { return t('perks.shadow_step.name', 'Shadow Step'); },
    get desc() { return t('perks.shadow_step.desc', 'Stealth >= 50: Backstab multiplier increased by +0.5x.'); },
    check: (e) => skillValue(e, SKILLS.Stealth) >= 50,
  },
  {
    id: 'iron_constitution',
    get name() { return t('perks.iron_constitution.name', 'Iron Constitution'); },
    get desc() { return t('perks.iron_constitution.desc', 'Level >= 5: +15% poison & disease resistance.'); },
    check: (e) => (Number(e?.level) || 1) >= 5,
  },
  {
    id: 'treasure_hunter',
    get name() { return t('perks.treasure_hunter.name', 'Treasure Hunter'); },
    get desc() { return t('perks.treasure_hunter.desc', 'Mercantile >= 50: +15% gold found & better merchant prices.'); },
    check: (e) => skillValue(e, SKILLS.Mercantile) >= 50,
  },
];

export function getAllPerks() {
  return CORE_PERKS;
}

export function getUnlockedPerks(entity) {
  const unlocked = new Set(Array.isArray(entity?.unlockedPerks) ? entity.unlockedPerks : []);
  if (entity) {
    for (const p of CORE_PERKS) {
      try {
        if (p.check(entity)) unlocked.add(p.id);
      } catch (_e) {
        // ignore check errors on mock entities
      }
    }
  }
  return Array.from(unlocked);
}
