import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearGameLog,
  GAME_LOG_MAX_ENTRIES,
  getGameLogEncounters,
  getGameLogEntries,
  getLatestEncounter,
  recordAmbientText,
  recordCombatAttack,
  recordDiseaseEvent,
  recordHudMessage,
  recordItemBroken,
  recordLootPickup,
  recordPlayerDeath,
  recordPoisonEvent,
  recordSkillAdvance,
  recordSpellEvent,
  recordWorldEvent,
  suppressHudTextOnce,
} from '../../src/systems/gameLog.js';
import { calculateAttackDamage } from '../../src/combat/formulas.js';
import { pcaaoAttackDamage, pcaaoModules, uninstallPcaao } from '../../src/combat/pcaao.js';
import { applySpell } from '../../src/systems/effects.js';
import { formatEntrySummary } from '../../src/ui/gameLogPane.js';
import { restorePlayer, SAVE_VERSION } from '../../src/systems/save/save.js';
import { SKILLS } from '../../src/systems/skills.js';

function makeActor({ isPlayer = false, name = 'Foe', health = 40, level = 5, skills = null } = {}) {
  return {
    isPlayer,
    isClass: !isPlayer,
    name,
    level,
    health,
    maxHealth: health,
    magicka: 50,
    maxMagicka: 50,
    stats: { strength: 60, intelligence: 50, willpower: 50, agility: 60, endurance: 50, personality: 50, speed: 55, luck: 50 },
    skills: skills || new Array(35).fill(50),
    armorValues: new Array(7).fill(100),
    career: { abilityFlagsAndSpellPointsBitfield: 0, weaponArmorShieldsBitfield: 0 },
    activeEffects: [],
  };
}

test('gameLog records classic & PCAAO attacks, spells, encounter stats, and death', () => {
  clearGameLog();
  uninstallPcaao();
  const player = makeActor({ isPlayer: true, name: 'Hero', health: 50 });
  const foe = makeActor({ isPlayer: false, name: 'Skeleton', health: 30 });
  const sword = { name: 'Steel Longsword', templateIndex: 120, material: 1, quality: 2, condition: 1000, flags: 0x10 };

  // Classic attack hit (low roll -> hit)
  const dmg = calculateAttackDamage(player, foe, { weapon: sword, rolls: () => 0.1 });
  assert.ok(dmg >= 0);

  // Classic ineffective material
  const ghost = { ...makeActor({ isPlayer: false, name: 'Ghost', health: 30 }), minMetalToHit: 5 };
  const ineffDmg = calculateAttackDamage(player, ghost, { weapon: sword, rolls: () => 0.1 });
  assert.equal(ineffDmg, 0);

  // PCAAO attack diagnostic coverage
  const mods = pcaaoModules((k) => k === 'Enabled' || k === 'armorHitFormulaRedone' || k === 'criticalStrikesIncreaseDamage');
  const notes = { critical: false, backstab: false, hit: false, ineffective: false, diag: { toHit: null, damage: {} } };
  pcaaoAttackDamage(player, foe, { weapon: sword, rolls: () => 0.1, notes, modules: mods });
  assert.equal(notes.diag.core, 'pcaao');
  assert.ok(notes.diag.toHit && Number.isFinite(notes.diag.toHit.finalChance));

  // Spell event (damage)
  const fireSpell = { name: 'Fireball', index: 1, element: 0, rangeType: 2, effects: [{ type: 4, subType: 0, magnitudeBaseLow: 10, magnitudeBaseHigh: 10, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1, durationBase: 0, durationMod: 0, durationPerLevel: 1, chanceBase: 100, chanceMod: 0, chancePerLevel: 1 }] };
  applySpell(fireSpell, 3, foe, { hurt: () => {} }, () => 0.5, { entity: player, sinks: {} });

  const entries = getGameLogEntries();
  assert.ok(entries.some((e) => e.kind === 'attack' && e.cat === 'combat'));
  assert.ok(entries.some((e) => e.kind === 'attack' && e.data.ineffective === true));
  assert.ok(entries.some((e) => e.kind === 'spell' && e.cat === 'magic'));

  const sumCompact = formatEntrySummary(entries[0], { formulas: false, flavor: false });
  assert.ok(sumCompact.text.length > 0);
  const sumVerbose = formatEntrySummary(entries[0], { formulas: true, flavor: true });
  assert.ok(sumVerbose.inlineRoll.includes('d100:'));

  // Player death closes encounter as 'death'
  recordPlayerDeath({ goldLoss: 25 });
  const enc = getLatestEncounter();
  assert.equal(enc.outcome, 'death');
  assert.ok(enc.summary.fatalEntryId != null);
  clearGameLog();
});

test('gameLog records character/world events, deduplicates HUD lines, collapses repeats, caps ring buffer, and clears on load', () => {
  clearGameLog();
  recordSkillAdvance(SKILLS.LongBlade, 55);
  recordItemBroken('Iron Shield', true);
  recordDiseaseEvent({ diseaseType: 1, contracted: true, resisted: false });
  recordPoisonEvent({ poisonType: 128, inflicted: false, resisted: true });
  recordLootPickup([{ name: 'Gold', gold: true, count: 42 }]);
  recordAmbientText('A cold draft stirs the dust.');
  recordWorldEvent('raid', 'Bandits spotted near Wayrest!');

  // Suppressed HUD message should be skipped
  suppressHudTextOnce('A cold draft stirs the dust.');
  assert.equal(recordHudMessage('A cold draft stirs the dust.'), null);

  // Consecutive identical HUD messages collapse into repeatCount
  recordHudMessage('You are feeling hungry.');
  recordHudMessage('You are feeling hungry.');
  const hudEntries = getGameLogEntries().filter((e) => e.kind === 'hud');
  assert.equal(hudEntries.length, 1);
  assert.equal(hudEntries[0].repeatCount, 2);

  // Ambient stays original English
  const amb = getGameLogEntries().find((e) => e.kind === 'ambient');
  assert.equal(amb.data.rawText, 'A cold draft stirs the dust.');

  // Ring buffer cap
  for (let i = 0; i < GAME_LOG_MAX_ENTRIES + 25; i++) {
    recordHudMessage(`Line ${i}`);
  }
  assert.equal(getGameLogEntries().length, GAME_LOG_MAX_ENTRIES);

  // restorePlayer clears session log
  const ent = makeActor({ isPlayer: true, name: 'Hero' });
  restorePlayer(ent, { v: SAVE_VERSION, name: 'Hero', classicMinutes: 100, arcanePath: null, martialPath: null, items: [], stats: ent.stats, skills: ent.skills, skillUses: new Array(35).fill(0), armorValues: new Array(7).fill(100), career: ent.career });
  assert.equal(getGameLogEntries().length, 0);
  assert.equal(getGameLogEncounters().length, 0);
});

test('gameLog audit fixes: mobileType names, toHitParts, friendly heal vs lethal spell, pre-grammar suppression, duel stub skip', () => {
  clearGameLog();
  uninstallPcaao();
  const player = makeActor({ isPlayer: true, name: 'Hero', health: 50 });
  const skeleton = { ...makeActor({ isPlayer: false, name: null, health: 30 }), mobileType: 15, isClass: false, basics: { minDamage: 2, maxDamage: 4, minDamage2: 5, maxDamage2: 8 } };
  const sword = { name: 'Steel Longsword', templateIndex: 120, material: 1, quality: 2, condition: 1000, flags: 0x10 };

  // 1. Enemy with mobileType and no .name formats as Skeleton
  calculateAttackDamage(player, skeleton, { weapon: sword, rolls: () => 0.1 });
  const atkEntry = getGameLogEntries().find((e) => e.kind === 'attack');
  assert.ok(atkEntry.data.diag.toHit.parts.baseSkill > 0);
  const sum = formatEntrySummary(atkEntry, { formulas: false, flavor: false });
  assert.ok(sum.text.includes('Skeletal Warrior'), `expected Skeletal Warrior in "${sum.text}"`);
  assert.ok(!sum.text.includes('Enemy'), `did not expect generic Enemy in "${sum.text}"`);

  // 2. Monster multi-attack preserves first winning toHit roll when second span misses
  clearGameLog();
  let seqIdx = 0;
  const seq = [0.5, 0.1, 0.2, 0.5, 0.99]; // part, span1 hit (0.1, 0.2), dmg, span2 miss (0.99)
  const nextRoll = () => seq[seqIdx++] ?? 0.5;
  calculateAttackDamage(skeleton, player, { rolls: nextRoll, dfRand: () => 0 });
  const monAtk = getGameLogEntries().find((e) => e.kind === 'attack');
  assert.equal(monAtk.data.hit, true);
  assert.equal(monAtk.data.diag.toHit.isHit, true);

  // 3. PCAAO populates toHitParts
  clearGameLog();
  const mods = pcaaoModules((k) => k === 'Enabled' || k === 'armorHitFormulaRedone' || k === 'criticalStrikesIncreaseDamage');
  const notes = { critical: false, backstab: false, hit: false, ineffective: false, diag: { toHit: null, damage: {} } };
  pcaaoAttackDamage(player, skeleton, { weapon: sword, rolls: () => 0.1, notes, modules: mods });
  assert.ok(notes.diag.toHitParts.baseSkill > 0);
  assert.ok(notes.diag.toHitParts.weaponMatToHit > 0);

  // 4. Friendly heal on ally does not open encounter; lethal spell logs kill + _pendingVictory
  clearGameLog();
  const ally = makeActor({ isPlayer: false, name: 'Companion', health: 95 });
  ally.maxHealth = 100;
  const healEntry = recordSpellEvent({
    spell: { name: 'Heal', index: 2, element: 0, rangeType: 1 },
    casterLevel: 3,
    caster: { entity: player },
    target: ally,
    out: { healed: 30 },
    diag: { targetHpBefore: 95 },
  });
  assert.equal(healEntry.encounterId, null);
  assert.equal(healEntry.data.hpAfter, 100);
  assert.equal(getGameLogEncounters().length, 0);

  const foe = { ...makeActor({ isPlayer: false, name: 'Imp', health: 0 }), mobileType: 1, isClass: false };
  recordSpellEvent({
    spell: { name: 'Fireball', index: 1, element: 0, rangeType: 2 },
    casterLevel: 5,
    caster: { entity: player },
    target: foe,
    out: { damage: 25 },
    diag: { targetHpBefore: 20, targetHpAfter: 0 },
  });
  const enc = getLatestEncounter();
  assert.ok(enc && enc._pendingVictory === true);
  assert.ok(getGameLogEntries().some((e) => e.kind === 'kill'));

  // 5. Pre-grammar HUD suppression & duel stub skip
  suppressHudTextOnce('Raw notice');
  assert.equal(recordHudMessage('Processed notice', 'Raw notice'), null);
  assert.equal(recordCombatAttack({ attacker: { isPlayer: true, peer: true, name: 'Peer' }, target: player, damage: 5, hit: true }), null);
  clearGameLog();
});
