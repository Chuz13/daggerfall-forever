import { SKILLS, skillValue } from '../skills.js';
import { t } from '../textManager.js';

export const CORE_PERKS = [
  {
    id: 'blade_mastery',
    get name() { return t('perks.blade_mastery.name', 'Blade Mastery'); },
    get desc() { return t('perks.blade_mastery.desc', '+15% damage and +10% crit chance with Long Blades (Requires 50 Long Blade).'); },
    check: (e) => skillValue(e, SKILLS.LongBlade) >= 50,
  },
  {
    id: 'arcane_reservoir',
    get name() { return t('perks.arcane_reservoir.name', 'Arcane Reservoir'); },
    get desc() { return t('perks.arcane_reservoir.desc', 'Increases maximum Magicka by +25 and halves spell interruption (Requires 50 Destruction or Mysticism).'); },
    check: (e) => skillValue(e, SKILLS.Mysticism) >= 50,
  },
  {
    id: 'shadow_step',
    get name() { return t('perks.shadow_step.name', 'Shadow Step'); },
    get desc() { return t('perks.shadow_step.desc', 'Movement in stealth makes 40% less noise and backstabs deal +25% bonus damage (Requires 50 Stealth).'); },
    check: (e) => skillValue(e, SKILLS.Stealth) >= 50,
  },
  {
    id: 'iron_constitution',
    get name() { return t('perks.iron_constitution.name', 'Iron Constitution'); },
    get desc() { return t('perks.iron_constitution.desc', 'Reduces disease and poison susceptibility by 30% and grants +15 Max HP (Requires Level 5).'); },
    check: (e) => (Number(e?.level) || 1) >= 5,
  },
  {
    id: 'treasure_hunter',
    get name() { return t('perks.treasure_hunter.name', 'Treasure Hunter'); },
    get desc() { return t('perks.treasure_hunter.desc', 'Increases gold found in dungeon chests and corpses by 20% (Requires 40 Mercantile).'); },
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
