import test from 'node:test';
import assert from 'node:assert/strict';

import {
  archLichdomSpell,
  lichdomSpell,
  NECRO_SPELL_KEYS,
} from '../../src/systems/necromancy/necromanticSpells.js';
import {
  canAscendToArchLichdom,
  performArchLichdomRitual,
  performLichdomRitual,
  ARCH_LICH_MIN_LEVEL,
  ARCH_LICH_MIN_MYSTICISM,
  ARCH_LICH_MIN_INTELLIGENCE,
  ARCH_LICH_MIN_WILLPOWER,
  createPhylactery,
  PHYLACTERY_STATE,
} from '../../src/systems/necromancy/lichdomRitual.js';
import {
  applyLichdom,
  applyAncientLichdom,
  isLich,
  isAncientLich,
  cureLichdom,
} from '../../src/systems/necromancy/lichdomStatus.js';
import { calculateCastCost } from '../../src/systems/spellcost.js';
import { SKILLS } from '../../src/systems/skills.js';
import { readNecroGrimoire, getAllNecroSpells } from '../../src/systems/necromancy/necroGrimoire.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { shownSpellName } from '../../src/systems/loot/loot.js';
import { applySpell } from '../../src/systems/effects.js';
import { spellTipLines, statusTip } from '../../src/ui/hud/statusTips.js';
import { effectRows } from '../../src/ui/enhanced/enhancedHud.js';
import { liveStat } from '../../src/systems/statMods.js';

test('Arch-Lichdom: spell definition has correct metadata and is not craftable', () => {
  const sp = archLichdomSpell();
  assert.equal(sp.name, 'Arch-Lichdom');
  assert.equal(sp.index, -52);
  assert.equal(sp.rangeType, 0, 'CasterOnly');
  assert.equal(sp.element, 4, 'Magic');
  assert.equal(sp.tag, 'некро');
  assert.ok(sp.tags.includes('некро'));
  assert.equal(sp.craftable, false, 'Must NOT be craftable in Spell Maker');
  assert.equal(sp.effects[0].type, 52);
  assert.equal(sp.effects[0].subType, 255);
  assert.equal(NECRO_SPELL_KEYS.ARCH_LICHDOM, '52,255');
});

test('Arch-Lichdom: spell costs exactly 500 magicka at Mysticism 200', () => {
  const sp = archLichdomSpell();
  const caster = {
    skills: { [SKILLS.Mysticism]: 200 },
    stats: {},
  };
  const cost = calculateCastCost(sp, caster);
  assert.equal(cost.sp, 500, 'Must cost exactly 500 magicka at Mysticism 200');
});

test('Necro spells: Grimoire grants both Lichdom and Arch-Lichdom along with core spells', () => {
  const allSpells = getAllNecroSpells();
  assert.ok(allSpells.some((s) => s.name === 'Lichdom'));
  assert.ok(allSpells.some((s) => s.name === 'Arch-Lichdom'));

  const dummyPlayer = { spells: [] };
  readNecroGrimoire(dummyPlayer);
  assert.ok(dummyPlayer.spells.some((s) => s.name === 'Lichdom'));
  assert.ok(dummyPlayer.spells.some((s) => s.name === 'Arch-Lichdom'));
  assert.equal(dummyPlayer.spells.length, 6, '4 standard necro spells + 1 Lichdom + 1 Arch-Lichdom');
});

test('Arch-Lichdom ritual: mortal casting triggers death', () => {
  const mortal = {
    level: 30,
    health: 150,
    maxHealth: 150,
    skills: { [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 120, willpower: 120 },
  };

  assert.equal(isLich(mortal), false);
  const check = canAscendToArchLichdom(mortal);
  assert.equal(check.eligible, false);
  assert.equal(check.isMortal, true);

  let hurtDamage = 0;
  const sinks = { hurt: (n) => { hurtDamage = n; } };
  const res = performArchLichdomRitual(mortal, { sinks });

  assert.equal(res.success, false);
  assert.ok(hurtDamage > 0, 'Must inflict lethal damage to mortal');
  assert.equal(mortal.health, 0, 'Health must be reduced to 0');
});

test('Arch-Lichdom ritual: Lich with unmet requirements triggers death/reconstitution', () => {
  const lich = {
    level: 25, // Too low (< 30)
    health: 100,
    maxHealth: 100,
    skills: { [SKILLS.Mysticism]: 180 }, // Too low (< 200)
    stats: { intelligence: 70, willpower: 70 }, // 70 + 25 = 95 (< 115)
  };
  applyLichdom(lich);
  assert.equal(isLich(lich), true);

  const phylactery = createPhylactery({ anchorPosition: [10, 20, 30] });
  phylactery.state = PHYLACTERY_STATE.BOUND;
  phylactery.charges = 1;
  lich.phylacteryAnchor = phylactery;

  const check = canAscendToArchLichdom(lich);
  assert.equal(check.eligible, false);
  assert.equal(check.isMortal, false);
  assert.ok(check.reasons.length >= 3);

  let hurtDamage = 0;
  const sinks = { hurt: (n) => { hurtDamage = n; } };
  const res = performArchLichdomRitual(lich, { sinks });

  assert.equal(res.success, false);
  assert.ok(hurtDamage > 0);
  // Reconstitution hook consumed 1 charge and restored half health at phylactery
  assert.equal(phylactery.charges, 0);
  assert.equal(lich.health, 50);
});

test('Arch-Lichdom ritual: Lich with all requirements met ascends to Ancient Lich', () => {
  const lich = {
    level: 30,
    health: 200,
    maxHealth: 200,
    skills: { [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 115, willpower: 115 },
  };
  applyLichdom(lich);
  assert.equal(isLich(lich), true);

  const check = canAscendToArchLichdom(lich);
  assert.equal(check.eligible, true);

  const res = performArchLichdomRitual(lich);
  assert.equal(res.success, true);
  assert.equal(isAncientLich(lich), true);
  assert.equal(lich.racialOverride.racial, 'ancient_lichdom');
  assert.equal(lich.racialOverride.raceNameOverride, 'Ancient Lich');
});

test('Arch-Lichdom: spell effect execution via applySpell succeeds for qualified Lich', () => {
  const lich = {
    level: 30,
    health: 200,
    maxHealth: 200,
    skills: { [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 115, willpower: 115 },
  };
  applyLichdom(lich);

  let saidMessage = '';
  const sinks = { say: (msg) => { saidMessage = msg; }, hurt: () => {} };
  const spell = archLichdomSpell();

  applySpell(spell, 30, lich, sinks, () => 1.0, { entity: lich }, {});

  assert.equal(isAncientLich(lich), true);
  assert.ok(saidMessage.includes('Ancient Lichdom'));
});

test('Console: set_max_magicka command overrides and resets max magicka', () => {
  const setCmd = getConsoleCommand('set_max_magicka');
  assert.ok(setCmd);

  // Set to 500
  const msg1 = setCmd.callback(['500']);
  assert.ok(msg1.includes('500'));
  assert.equal(playerEntity.maxMagicka, 500);
  assert.equal(playerEntity.magicka, 500);

  // Reset
  const msg2 = setCmd.callback(['reset']);
  assert.ok(msg2.includes('reset'));
  assert.equal(playerEntity.maxMagickaOverride, undefined);
});

test('Arch-Lichdom ritual: casting as Ancient Lich deals no harm and displays gentle refusal', () => {
  const ancient = {
    level: 35,
    health: 250,
    maxHealth: 250,
    skills: { [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 150, willpower: 150 },
  };
  applyAncientLichdom(ancient);
  assert.equal(isAncientLich(ancient), true);

  let hurtCalled = false;
  let saidMsg = '';
  const sinks = { say: (m) => { saidMsg = m; }, hurt: () => { hurtCalled = true; } };

  const res = performArchLichdomRitual(ancient, { sinks });
  assert.equal(res.success, false);
  assert.equal(res.alreadyAncient, true);
  assert.equal(hurtCalled, false, 'Must not hurt player who is already Ancient Lich');
  assert.equal(ancient.health, 250, 'Health must remain untouched');

  // Also via applySpell
  const sp = archLichdomSpell();
  applySpell(sp, 35, ancient, sinks, () => 1.0, { entity: ancient }, {});
  assert.equal(hurtCalled, false);
  assert.ok(saidMsg.length > 0);
});

test('Localization: shownSpellName localizes Arch-Lichdom', () => {
  const sp = archLichdomSpell();
  const name = shownSpellName(sp);
  assert.ok(typeof name === 'string' && name.length > 0);
});

test('Lichdom: spell definition has correct metadata and is not craftable', () => {
  const sp = lichdomSpell();
  assert.equal(sp.name, 'Lichdom');
  assert.equal(sp.index, -50);
  assert.equal(sp.rangeType, 0, 'CasterOnly');
  assert.equal(sp.element, 4, 'Magic');
  assert.equal(sp.tag, 'некро');
  assert.ok(sp.tags.includes('некро'));
  assert.equal(sp.craftable, false, 'Must NOT be craftable in Spell Maker');
  assert.equal(sp.effects[0].type, 50);
  assert.equal(sp.effects[0].subType, 255);
  assert.equal(NECRO_SPELL_KEYS.LICHDOM, '50,255');
  assert.ok(shownSpellName(sp).length > 0);
});

test('Lichdom: spell costs exactly 250 magicka at Mysticism 100', () => {
  const sp = lichdomSpell();
  const caster = {
    skills: { [SKILLS.Mysticism]: 100 },
    stats: {},
  };
  const cost = calculateCastCost(sp, caster);
  assert.equal(cost.sp, 250, 'Must cost exactly 250 magicka at Mysticism 100');
});

test('Lichdom ritual: qualified mortal ascends to Lich', () => {
  const mortal = {
    level: 20,
    health: 120,
    maxHealth: 120,
    skills: { [SKILLS.Mysticism]: 100 },
    stats: { intelligence: 70, willpower: 70 },
  };
  let saidMessage = '';
  const sinks = { say: (msg) => { saidMessage = msg; }, hurt: () => {} };
  const sp = lichdomSpell();

  applySpell(sp, 20, mortal, sinks, () => 1.0, { entity: mortal }, {});

  assert.equal(isLich(mortal), true);
  assert.ok(saidMessage.includes('Lich'));
  assert.ok(mortal.phylacteryAnchor);
});

test('Lichdom ritual: unqualified mortal triggers lethal failure', () => {
  const weakMortal = {
    level: 10, // < 20
    health: 80,
    maxHealth: 80,
    skills: { [SKILLS.Mysticism]: 30 }, // < 100
    stats: { intelligence: 50, willpower: 50 },
  };
  let hurtCalled = false;
  const sinks = { hurt: () => { hurtCalled = true; }, say: () => {} };
  const sp = lichdomSpell();

  applySpell(sp, 10, weakMortal, sinks, () => 1.0, { entity: weakMortal }, {});

  assert.equal(isLich(weakMortal), false);
  assert.equal(hurtCalled, true);
  assert.equal(weakMortal.health, 0);
});

test('Lichdom ritual: casting while already a Lich deals no harm and displays gentle refusal', () => {
  const lich = {
    level: 25,
    health: 150,
    maxHealth: 150,
    skills: { [SKILLS.Mysticism]: 120 },
    stats: { intelligence: 80, willpower: 80 },
  };
  applyLichdom(lich);
  assert.equal(isLich(lich), true);

  let hurtCalled = false;
  let saidMsg = '';
  const sinks = { say: (m) => { saidMsg = m; }, hurt: () => { hurtCalled = true; } };

  const res = performLichdomRitual(lich, { sinks });
  assert.equal(res.success, false);
  assert.equal(res.alreadyLich, true);
  assert.equal(hurtCalled, false);
  assert.equal(lich.health, 150);
});

test('Lichdom & Arch-Lichdom buff tiles and status tips: permanent, no blinking, detailed breakdown', () => {
  const lich = {
    level: 20,
    stats: { intelligence: 100, willpower: 100 },
    skills: { [SKILLS.Mysticism]: 100 },
  };
  applyLichdom(lich);

  // Check statMaxMods raised the ceiling to 125
  assert.equal(liveStat(lich, 'intelligence'), 125);
  assert.equal(liveStat(lich, 'willpower'), 125);

  // HUD rows check
  const hudRows = effectRows(lich);
  assert.ok(hudRows.length > 0);
  const lichRow = hudRows.find((r) => r.bundleId === 91001);
  assert.ok(lichRow);
  assert.equal(lichRow.permanent, true);
  assert.equal(lichRow.expiring, false);
  assert.equal(lichRow.rounds, null);

  // Tooltip lines check
  const tipLines = spellTipLines(lich, 91001);
  assert.ok(tipLines.some((l) => l.includes('25') && l.includes('Intelligence')));
  assert.ok(tipLines.some((l) => l.includes('15') && l.includes('Mysticism')));
  assert.ok(tipLines.some((l) => l.includes('Silver+')));
  assert.ok(tipLines.some((l) => l.includes('breathe') || l.includes('пище')));
  assert.ok(tipLines.some((l) => l.includes('burns') || l.includes('Аркея')));
  assert.ok(tipLines.some((l) => l.includes('soul') || l.includes('душа')));

  const tip = statusTip({ key: 'spell0', bundle: 91001, permanent: true }, lich, {});
  assert.ok(tip.foot.length > 0);

  // Now Ancient Lich (ceiling raised to 150)
  applyAncientLichdom(lich);
  assert.equal(liveStat(lich, 'intelligence'), 150);
  const ancientTipLines = spellTipLines(lich, 91002);
  assert.ok(ancientTipLines.some((l) => l.includes('50') && l.includes('Intelligence')));
  assert.ok(ancientTipLines.some((l) => l.includes('30') && l.includes('Mysticism')));
  assert.ok(ancientTipLines.some((l) => l.includes('Mithril') || l.includes('мифрила')));
});
