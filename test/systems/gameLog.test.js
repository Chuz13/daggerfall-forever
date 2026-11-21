import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearGameLog,
  GAME_LOG_MAX_ENTRIES,
  getGameLogEncounters,
  getGameLogEntries,
  getLatestEncounter,
  recordAmbientText,
  recordDiseaseEvent,
  recordHudMessage,
  recordItemBroken,
  recordLootPickup,
  recordPlayerDeath,
  recordPoisonEvent,
  recordSkillAdvance,
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
  const sword = { name: 'Steel Longsword', templateIndex: 112, material: 1, quality: 2, condition: 1000, flags: 0x10 };

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
