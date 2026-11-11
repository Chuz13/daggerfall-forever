// @ts-check
// Heroic Feats: 5 Character Milestones & Feats
// Author: 13

function init(api) {
  // 1. Blade Mastery
  api.perks.register({
    id: 'blade_mastery',
    name: 'Blade Mastery',
    desc: '+15% damage and +10% crit chance with Long Blades (Requires 50 Long Blade skill).',
    check: (e) => (e?.skills?.[22] ?? 0) >= 50 || (e?.skillValues?.[22] ?? 0) >= 50,
  });

  // 2. Arcane Reservoir
  api.perks.register({
    id: 'arcane_reservoir',
    name: 'Arcane Reservoir',
    desc: 'Increases maximum Magicka by +25 (Requires 50 Mysticism).',
    check: (e) => (e?.skills?.[25] ?? 0) >= 50 || (e?.skillValues?.[25] ?? 0) >= 50,
  });

  // 3. Shadow Step
  api.perks.register({
    id: 'shadow_step',
    name: 'Shadow Step',
    desc: 'Movement in stealth makes 40% less noise and backstabs deal +25% bonus damage (Requires 50 Stealth).',
    check: (e) => (e?.skills?.[20] ?? 0) >= 50 || (e?.skillValues?.[20] ?? 0) >= 50,
  });

  // 4. Iron Constitution
  api.perks.register({
    id: 'iron_constitution',
    name: 'Iron Constitution',
    desc: 'Reduces disease and poison susceptibility by 30% and grants +15 Max HP (Requires Level 5).',
    check: (e) => (Number(e?.level) || 1) >= 5,
  });

  // 5. Treasure Hunter
  api.perks.register({
    id: 'treasure_hunter',
    name: 'Treasure Hunter',
    desc: 'Increases gold found in dungeon chests and corpses by 20% (Requires 40 Mercantile).',
    check: (e) => (e?.skills?.[27] ?? 0) >= 40 || (e?.skillValues?.[27] ?? 0) >= 40,
  });
}
