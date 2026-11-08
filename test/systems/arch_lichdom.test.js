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
  canDrinkElixirOfUnlife,
  drinkElixirOfUnlife,
  ARCH_LICH_MIN_LEVEL,
  ARCH_LICH_MIN_MYSTICISM,
  ARCH_LICH_MIN_INTELLIGENCE,
  ARCH_LICH_MIN_WILLPOWER,
  createPhylactery,
  PHYLACTERY_STATE,
  setLichCemeteryRespawnHook,
  LICH_RESPAWN_MONTH_MINUTES,
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
import { playerEntity, hurtPlayer, setDeathPresenter, setDeathListener } from '../../src/characters/playerEntity.js';
import { ownMinutes, advanceOwnMinutes } from '../../src/systems/worldTick.js';
import { shownSpellName } from '../../src/systems/loot/loot.js';
import { applySpell } from '../../src/systems/effects.js';
import { spellTipLines, statusTip } from '../../src/ui/hud/statusTips.js';
import { effectRows } from '../../src/ui/enhanced/enhancedHud.js';
import { liveStat } from '../../src/systems/statMods.js';
import { useItem } from '../../src/systems/useItem.js';
import { ELIXIR_OF_UNLIFE_KEY, makePotion } from '../../src/systems/potions.js';

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

test('Necro spells: Grimoire grants Arch-Lichdom along with core spells, but excludes Lichdom spell', () => {
  const allSpells = getAllNecroSpells();
  assert.ok(!allSpells.some((s) => s.name === 'Lichdom'), 'Lichdom spell must not be in grimoire');
  assert.ok(allSpells.some((s) => s.name === 'Arch-Lichdom'));

  const dummyPlayer = { spells: [] };
  readNecroGrimoire(dummyPlayer);
  assert.ok(!dummyPlayer.spells.some((s) => s.name === 'Lichdom'));
  assert.ok(dummyPlayer.spells.some((s) => s.name === 'Arch-Lichdom'));
  assert.ok(dummyPlayer.spells.some((s) => s.name === 'Dark Flight'));
  assert.ok(dummyPlayer.spells.some((s) => s.name === 'Control Undead'));
  assert.ok(dummyPlayer.spells.some((s) => s.name === 'Suture Cadaver'));
  assert.ok(!dummyPlayer.spells.some((s) => s.name === 'Paralyzing Touch'));
  assert.ok(!dummyPlayer.spells.some((s) => s.name === 'Mortal Disguise'));
  assert.ok(!dummyPlayer.spells.some((s) => s.name === 'Finger of Death'));
  assert.equal(dummyPlayer.spells.length, 8, '4 standard necro spells + Arch-Lichdom + Dark Flight + Control Undead + Suture Cadaver');
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
  // Reconstitution hook restores full health and bypasses death
  assert.equal(lich.health, 100);
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
  applyLichdom(ancient);
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
    stats: { intelligence: 100, willpower: 100 },
    NecroGrimoireRead: true,
  };
  let saidMessage = '';
  const sinks = { say: (msg) => { saidMessage = msg; }, hurt: () => {} };
  const sp = lichdomSpell();

  applySpell(sp, 20, mortal, sinks, () => 1.0, { entity: mortal }, {});

  assert.equal(isLich(mortal), true);
  assert.ok(saidMessage.includes('Lich'));
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
  assert.ok(tipLines.some((l) => l.includes('100') && (l.includes('Health') || l.includes('здоров'))));
  assert.ok(tipLines.some((l) => l.includes('250') && (l.includes('Spell Points') || l.includes('ман'))));
  assert.ok(tipLines.some((l) => l.includes('5')));
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
  assert.ok(ancientTipLines.some((l) => l.includes('250') && (l.includes('Health') || l.includes('здоров'))));
  assert.ok(ancientTipLines.some((l) => l.includes('500') && (l.includes('Spell Points') || l.includes('ман'))));
  assert.ok(ancientTipLines.some((l) => l.includes('15')));
  assert.ok(ancientTipLines.some((l) => l.includes('50') && l.includes('Intelligence')));
  assert.ok(ancientTipLines.some((l) => l.includes('30') && l.includes('Mysticism')));
  assert.ok(ancientTipLines.some((l) => l.includes('Mithril') || l.includes('мифрила')));
});

test('Lich & Ancient Lich cemetery death interception: full vitals, 30 days time skip, no penalties', () => {
  let cemeteryHookCalled = false;
  let hookEntity = null;
  setLichCemeteryRespawnHook((entity) => {
    cemeteryHookCalled = true;
    hookEntity = entity;
    advanceOwnMinutes(LICH_RESPAWN_MONTH_MINUTES);
    return { x: 100, y: 200, name: 'The Tombs of Daggerfall' };
  });

  let deathHeard = false;
  setDeathListener('test_legacy_listener', () => {
    deathHeard = true;
  });

  let presenterCalled = false;
  setDeathPresenter(() => {
    presenterCalled = true;
  });

  // Test 1: Mortal dies normally
  const mortal = {
    isPlayer: true,
    health: 50,
    maxHealth: 100,
    magicka: 10,
    maxMagicka: 100,
    fatigue: 50,
  };
  const mortalDied = hurtPlayer(mortal, 100);
  assert.equal(mortalDied, true, 'Mortal must die');
  assert.equal(deathHeard, true, 'Death listener must be notified for mortal');
  assert.equal(presenterCalled, true, 'Death presenter must be invoked for mortal');
  assert.equal(cemeteryHookCalled, false, 'Cemetery hook must not be called for mortal');

  // Reset flags
  deathHeard = false;
  presenterCalled = false;
  cemeteryHookCalled = false;

  // Test 2: Lich intercepts death
  const startMinutes = ownMinutes();
  const lich = {
    isPlayer: true,
    health: 50,
    maxHealth: 150,
    magicka: 20,
    maxMagicka: 200,
    fatigue: 100,
  };
  applyLichdom(lich);
  assert.equal(isLich(lich), true);

  const lichDied = hurtPlayer(lich, 100);
  assert.equal(lichDied, false, 'Lich death must be intercepted (returns false)');
  assert.equal(deathHeard, false, 'Death listener (Project Legacy) must NOT be notified');
  assert.equal(presenterCalled, false, 'Death presenter (DeathScreen/gold loss) must NOT be invoked');
  assert.equal(cemeteryHookCalled, true, 'Cemetery respawn hook must be invoked');
  assert.equal(hookEntity, lich);

  // Full vitals verification
  assert.equal(lich.health, 150, 'Health must be fully restored');
  assert.equal(lich.magicka, 200, 'Magicka must be fully restored');
  assert.ok(lich.fatigue > 0, 'Fatigue must be restored');

  // 1 Month (30 days / 43,200 minutes) advanced verification
  const elapsed = ownMinutes() - startMinutes;
  assert.equal(elapsed, LICH_RESPAWN_MONTH_MINUTES, 'Must advance exactly 43,200 minutes (1 calendar month)');

  // Clean up hooks
  setLichCemeteryRespawnHook(null);
  setDeathListener('test_legacy_listener', null);
  setDeathPresenter(null);
});

test('Safeguards: Lich drinking Elixir of Unlife displays refusal without damage or death', () => {
  const lich = {
    level: 25,
    health: 200,
    maxHealth: 200,
    skills: { [SKILLS.Mysticism]: 100 },
    stats: { intelligence: 100, willpower: 100 },
  };
  applyLichdom(lich);
  assert.equal(isLich(lich), true);

  let hurtCount = 0;
  let forceDeathCalled = false;
  const res = drinkElixirOfUnlife(lich, {
    hurtPlayer: () => { hurtCount++; },
    forceDeath: () => { forceDeathCalled = true; },
  });

  assert.equal(res.success, false);
  assert.equal(res.lichdom, false);
  assert.equal(res.alreadyLich, true);
  assert.equal(res.alreadyAncient, false);
  assert.equal(hurtCount, 0, 'Must NOT inflict poison damage on existing Lich');
  assert.equal(forceDeathCalled, false, 'Must NOT trigger death on existing Lich');
  assert.equal(lich.health, 200, 'Health must remain intact');
  assert.ok(typeof res.reason === 'string' && res.reason.length > 0);
});

test('Safeguards: Ancient Lich drinking Elixir of Unlife displays refusal without damage or death', () => {
  const ancient = {
    level: 35,
    health: 300,
    maxHealth: 300,
    skills: { [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 150, willpower: 150 },
  };
  applyLichdom(ancient);
  applyAncientLichdom(ancient);
  assert.equal(isAncientLich(ancient), true);

  let hurtCount = 0;
  let forceDeathCalled = false;
  const res = drinkElixirOfUnlife(ancient, {
    hurtPlayer: () => { hurtCount++; },
    forceDeath: () => { forceDeathCalled = true; },
  });

  assert.equal(res.success, false);
  assert.equal(res.lichdom, false);
  assert.equal(res.alreadyLich, true);
  assert.equal(res.alreadyAncient, true);
  assert.equal(hurtCount, 0, 'Must NOT inflict poison damage on Ancient Lich');
  assert.equal(forceDeathCalled, false, 'Must NOT trigger death on Ancient Lich');
  assert.equal(ancient.health, 300, 'Health must remain intact');
  assert.ok(typeof res.reason === 'string' && res.reason.length > 0);
});

test('Safeguards: Ancient Lich casting Arch-Lichdom returns peaceful refusal', () => {
  const ancient = {
    level: 35,
    health: 300,
    maxHealth: 300,
    skills: { [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 150, willpower: 150 },
  };
  applyLichdom(ancient);
  applyAncientLichdom(ancient);
  assert.equal(isAncientLich(ancient), true);

  let hurtCalled = false;
  let messageSaid = '';
  const sinks = {
    hurt: () => { hurtCalled = true; },
    say: (msg) => { messageSaid = msg; },
  };

  const res = performArchLichdomRitual(ancient, { sinks });
  assert.equal(res.success, false);
  assert.equal(res.alreadyAncient, true);
  assert.equal(hurtCalled, false, 'Must NOT hurt Ancient Lich');
  assert.equal(ancient.health, 300);
  assert.ok(messageSaid.length > 0 || (res.message && res.message.length > 0));
});

test('Safeguards: useItem drinking Elixir of Unlife as Lich or Ancient Lich gives peaceful message without lethal failure', () => {
  // 1. As Lich
  const lich = {
    level: 25,
    health: 200,
    maxHealth: 200,
    skills: { [SKILLS.Mysticism]: 100 },
    stats: { intelligence: 100, willpower: 100 },
    items: [],
  };
  applyLichdom(lich);
  const elixirItem1 = makePotion(ELIXIR_OF_UNLIFE_KEY);
  lich.items.push(elixirItem1);

  const outLich = useItem(elixirItem1, lich.items, { entity: lich });
  assert.equal(outLich.kind, 'potion');
  assert.equal(outLich.lichdom, false);
  assert.equal(lich.health, 200, 'Lich health must remain 200 (no poison damage)');
  assert.ok(!outLich.text.includes('rejects the Elixir'), 'Must NOT say body rejects or lethal poison');
  assert.ok(outLich.text.length > 0);

  // 2. As Ancient Lich
  const ancient = {
    level: 35,
    health: 300,
    maxHealth: 300,
    skills: { [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 150, willpower: 150 },
    items: [],
  };
  applyLichdom(ancient);
  applyAncientLichdom(ancient);
  const elixirItem2 = makePotion(ELIXIR_OF_UNLIFE_KEY);
  ancient.items.push(elixirItem2);

  const outAncient = useItem(elixirItem2, ancient.items, { entity: ancient });
  assert.equal(outAncient.kind, 'potion');
  assert.equal(outAncient.lichdom, false);
  assert.equal(ancient.health, 300, 'Ancient Lich health must remain 300 (no poison damage)');
  assert.ok(!outAncient.text.includes('rejects the Elixir'), 'Must NOT say body rejects or lethal poison');
  assert.ok(outAncient.text.length > 0);
});

test('Safeguards: Ancient Lich casting Lichdom spell returns peaceful refusal without reapplication', () => {
  const ancient = {
    level: 35,
    health: 300,
    maxHealth: 300,
    skills: { [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 150, willpower: 150 },
  };
  applyLichdom(ancient);
  applyAncientLichdom(ancient);

  let hurtCount = 0;
  const res = performLichdomRitual(ancient, { hurtPlayer: () => { hurtCount++; } });
  assert.equal(res.success, false);
  assert.equal(res.alreadyAncient, true);
  assert.equal(hurtCount, 0, 'Must NOT hurt Ancient Lich');
  assert.equal(isAncientLich(ancient), true, 'Must remain Ancient Lich');
  assert.equal(ancient.racialOverride.racial, 'ancient_lichdom');
});

test('Time Skip: Numpad 5 Status readout date advances by 1 calendar month upon Lich respawn', async () => {
  const { QuestMachine } = await import('../../src/systems/quest/machine.js');
  const { statusReadoutRows } = await import('../../src/ui/statusBox.js');

  let curMinutes = 0;
  const machine = new QuestMachine({
    nowSeconds: () => curMinutes * 60,
    skySeconds: () => 0, // Even if server sky is static/shared in online mode
  });

  const lines = (id) => (id === 22 ? ['It is %tim on %dat.'] : []);
  const beforeRows = statusReadoutRows({ lines, macroContext: machine.macroContext(), entity: { activeEffects: [] } });
  assert.ok(beforeRows[0].includes('Morning Star'), `Expected Morning Star before death, got: ${beforeRows[0]}`);

  // 1 month passes (43,200 minutes)
  curMinutes += LICH_RESPAWN_MONTH_MINUTES;

  const afterRows = statusReadoutRows({ lines, macroContext: machine.macroContext(), entity: { activeEffects: [] } });
  assert.ok(afterRows[0].includes("Sun's Dawn"), `Expected Sun's Dawn (1 month later) after death, got: ${afterRows[0]}`);
});

test('Console: date and advance_time / advance_days commands report and advance Tamriel calendar correctly', async () => {
  const { getConsoleCommand } = await import('../../src/systems/consoleCommands.js');
  const dateCmd = getConsoleCommand('date');
  const advDaysCmd = getConsoleCommand('advance_days');

  const beforeDate = dateCmd.callback();
  assert.match(beforeDate, /Current Date:/);

  const advRes = advDaysCmd.callback(['30']);
  assert.match(advRes, /Advanced time by 30 day\(s\)/);

  const afterDate = dateCmd.callback();
  assert.match(afterDate, /Current Date:/);
  assert.notEqual(beforeDate, afterDate);
});

test('Console: date and advance_time / advance_days commands advance Tamriel calendar', async () => {
  const { getConsoleCommand, registerConsoleSceneContext } = await import('../../src/systems/consoleCommands.js');
  const { worldMinutes, setWorldMinutes } = await import('../../src/systems/worldTick.js');

  setWorldMinutes(523530); // Start date: 13:30 4th Morning Star 3E405
  const dateCmd = getConsoleCommand('date');
  assert.ok(dateCmd, 'date command must be registered');
  const initialDateStr = dateCmd.callback();
  assert.ok(initialDateStr.includes('Morning Star'), 'Initial date must include Morning Star');

  // Register mock scene context
  let advancedBy = 0;
  registerConsoleSceneContext({
    advanceMinutes: (n) => {
      advancedBy += n;
      setWorldMinutes(worldMinutes() + n);
    },
  });

  const advanceTimeCmd = getConsoleCommand('advance_time');
  const advanceTimeRes = advanceTimeCmd.callback(['24']); // 24 hours
  assert.equal(advancedBy, 1440);
  assert.ok(advanceTimeRes.includes('1440 mins'));

  const advanceDaysCmd = getConsoleCommand('advance_days');
  const advanceDaysRes = advanceDaysCmd.callback(['29']); // 29 more days -> now in Sun's Dawn!
  assert.equal(advancedBy, 1440 + 29 * 1440);
  assert.ok(advanceDaysRes.includes("Sun's Dawn"));
});

test('Lich Innate Spells & Grimoire Spells: Paralyzing Touch, Dark Flight, Control Undead, Mortal Disguise', async () => {
  const {
    lichParalyzingTouchSpell,
    necroLevitateSpell,
    controlUndeadSpell,
    mortalDisguiseSpell,
    castControlUndead,
  } = await import('../../src/systems/necromancy/necromanticSpells.js');
  const { isPlayerDisguised, lichdomMagicRound } = await import('../../src/systems/necromancy/lichdomStatus.js');
  const { getPlayerTaint, getEffectiveTradeTaint, _resetTaintForTests } = await import('../../src/systems/necromancy/necroTaint.js');
  const { checkSettlementInfraction, CRIME_TYPE } = await import('../../src/systems/necromancy/cityLaw.js');
  const {
    usedUndeadPoints,
  } = await import('../../src/systems/necromancy/undeadCapacity.js');
  const {
    spawnMinion,
    allSpawnedMinions,
    dismissAllMinions,
    releaseAllControlledUndead,
    tickControlledUndeadRound,
  } = await import('../../src/systems/necromancy/minionController.js');
  const { spellMakerGroups } = await import('../../src/systems/spell/spellEffects.js');
  const { allowedTargetsOf, TARGET_FLAGS, TARGET_FLAGS_OTHER, TARGET_FLAGS_SELF } = await import('../../src/systems/spell/spellMaker.js');

  // 1. Paralyzing Touch & Dark Flight cost 5 SP (minimumCastingCost) and have max duration (60 + 20 per 1 level)
  const para = lichParalyzingTouchSpell();
  const darkFlight = necroLevitateSpell();
  assert.equal(para.minimumCastingCost, true);
  assert.equal(para.rangeType, 1, 'ByTouch');
  assert.equal(para.effects[0].type, 0);
  assert.equal(para.effects[0].subType, 255);
  assert.equal(para.effects[0].durationBase, 60);
  assert.equal(calculateCastCost(para, { skills: {}, stats: {} }).sp, 5);

  assert.equal(darkFlight.minimumCastingCost, true);
  assert.equal(darkFlight.rangeType, 0, 'CasterOnly');
  assert.equal(darkFlight.effects[0].type, 14);
  assert.equal(darkFlight.effects[0].subType, 255);
  assert.equal(darkFlight.effects[0].durationBase, 60);
  assert.equal(calculateCastCost(darkFlight, { skills: {}, stats: {} }).sp, 5);

  // 2. Lichdom grants Paralyzing Touch & Mortal Disguise, locks taint at 100, and Arch-Lichdom keeps taint at 100
  _resetTaintForTests();
  const lichPlayer = {
    level: 30,
    health: 200,
    maxHealth: 200,
    skills: { [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 120, willpower: 120, personality: 50 },
    spells: [],
    activeEffects: [],
  };
  applyLichdom(lichPlayer);
  assert.ok(lichPlayer.spells.some((s) => s.index === -55 && s.name === 'Paralyzing Touch'));
  assert.ok(lichPlayer.spells.some((s) => s.index === -54 && s.name === 'Mortal Disguise'));
  assert.equal(lichPlayer.necroTaint, 100);
  assert.equal(getPlayerTaint(lichPlayer), 100);

  // Ascend to Arch-Lich: taint must remain 100
  applyAncientLichdom(lichPlayer);
  assert.equal(lichPlayer.necroTaint, 100, 'Taint must stay 100 on Arch-Lich ascension');
  assert.equal(getPlayerTaint(lichPlayer), 100, 'Global taint must stay 100 on Arch-Lich ascension');

  // 3. Spell Maker: Control Undead (53,255) and Mortal Disguise (54,255) locked before Grimoire, unlocked after
  const uninitiated = { NecroGrimoireRead: false };
  const initiated = { NecroGrimoireRead: true };
  assert.ok(!spellMakerGroups(uninitiated).includes('Control Undead'));
  assert.ok(!spellMakerGroups(uninitiated).includes('Mortal Disguise'));
  assert.ok(spellMakerGroups(initiated).includes('Control Undead'));
  assert.ok(spellMakerGroups(initiated).includes('Mortal Disguise'));

  // Control Undead allows all target forms EXCEPT CasterOnly
  const controlTargets = allowedTargetsOf(53, 255);
  assert.equal(controlTargets, TARGET_FLAGS_OTHER);
  assert.equal(controlTargets & TARGET_FLAGS.CasterOnly, 0, 'Control Undead must NOT allow CasterOnly');
  assert.ok(controlTargets & TARGET_FLAGS.ByTouch);
  assert.ok(controlTargets & TARGET_FLAGS.SingleTargetAtRange);

  // Mortal Disguise allows CasterOnly
  const disguiseTargets = allowedTargetsOf(54, 255);
  assert.equal(disguiseTargets, TARGET_FLAGS_SELF);

  // 4. Mortal Disguise: hides Lich/Arch-Lich from guards (unless visible minions present) and zeroes trade taint
  dismissAllMinions();
  const guardBefore = checkSettlementInfraction(lichPlayer, { isInsideSettlement: true });
  assert.equal(guardBefore.infraction, true);
  assert.equal(getEffectiveTradeTaint(lichPlayer), 100);

  // Cast Mortal Disguise
  applySpell(mortalDisguiseSpell(), 30, lichPlayer, {});
  assert.equal(isPlayerDisguised(lichPlayer), true);
  assert.equal(getEffectiveTradeTaint(lichPlayer), 0, 'Disguised Lich must have 0 effective trade taint');
  lichdomMagicRound(lichPlayer);
  assert.equal(lichPlayer.racialOverride?.statMods?.personality, 0, 'Disguised Lich must have 0 personality penalty');

  const guardDisguisedAlone = checkSettlementInfraction(lichPlayer, { isInsideSettlement: true });
  assert.equal(guardDisguisedAlone.infraction, false, 'Guards must not detect disguised Lich without minions');

  spawnMinion({ type: 'skeleton', position: [0, 0, 0] });
  const guardDisguisedWithMinions = checkSettlementInfraction(lichPlayer, { isInsideSettlement: true });
  assert.equal(guardDisguisedWithMinions.infraction, true, 'Guards must still react to visible minions even when disguised');

  // 5. Control Undead: does not consume pool, and lose_control releases ONLY controlled undead
  dismissAllMinions();
  // Raise 1 regular skeleton summon (consumes 2 points)
  const regularSummon = spawnMinion({ type: 'skeleton', position: [0, 0, 0] });
  assert.equal(usedUndeadPoints(), 2);

  // Mind-control a Vampire Ancient (does NOT consume pool)
  const foeMobile = { mobileType: 29, name: 'Vampire Ancient', health: 120, maxHealth: 120, entity: { team: 'PlayerEnemy' } };
  const ctrlRes = castControlUndead(lichPlayer, foeMobile, {
    magnitude: 90,
    chance: 100,
    duration: 2,
    rolls: () => 0.01,
  });
  assert.equal(ctrlRes.success, true);
  assert.equal(usedUndeadPoints(), 2, 'Controlled undead must NOT consume undead capacity pool');
  assert.equal(allSpawnedMinions().length, 2);
  assert.equal(foeMobile.entity.team, 'PlayerAlly');

  // Release all controlled undead -> regular summon stays, controlled vampire is released and turns hostile
  const released = releaseAllControlledUndead();
  assert.equal(released.length, 1);
  assert.equal(released[0].controlled, true);
  assert.equal(allSpawnedMinions().length, 1, 'Corpse-raised summon must remain under control');
  assert.equal(allSpawnedMinions()[0].id, regularSummon.id);

  // Test duration expiration via tickControlledUndeadRound
  const foeMobile2 = { mobileType: 9, name: 'Skeleton', health: 40, maxHealth: 40, entity: { team: 'PlayerEnemy' } };
  castControlUndead(lichPlayer, foeMobile2, {
    magnitude: 50,
    chance: 100,
    duration: 1,
    rolls: () => 0.01,
  });
  assert.equal(allSpawnedMinions().length, 2);
  const expired = tickControlledUndeadRound();
  assert.equal(expired.length, 1);
  assert.equal(allSpawnedMinions().length, 1, 'Expired controlled undead removed while summon stays');

  dismissAllMinions();
});

test('Suture Cadaver & Finger of Death: corpse consumption (3-5 corpses), sunder armor, and Ancient Lich 50 SP Finger of Death', async () => {
  const {
    sutureCadaverSpell,
    fingerOfDeathSpell,
    castSutureCadaver,
  } = await import('../../src/systems/necromancy/necromanticSpells.js');
  const {
    registerCorpse,
    corpsesNear,
    _resetCorpseRegistryForTests,
  } = await import('../../src/systems/necromancy/corpseRegistry.js');
  const {
    MINION_PROFILES,
    dismissAllMinions,
  } = await import('../../src/systems/necromancy/minionController.js');
  const { usedUndeadPoints, _resetUndeadCapacityForTests } = await import('../../src/systems/necromancy/undeadCapacity.js');
  const { spellMakerGroups } = await import('../../src/systems/spell/spellEffects.js');
  const { eliteSize } = await import('../../src/systems/eliteFoes.js');
  const { calculateAttackDamage } = await import('../../src/combat/formulas.js');

  // 1. Finger of Death: granted ONLY on Ancient Lich ascension, costs 50 SP even at Destruction 200
  const fod = fingerOfDeathSpell();
  assert.equal(fod.index, -58);
  assert.equal(fod.name, 'Finger of Death');
  assert.equal(fod.rangeType, 2, 'SingleTargetAtRange');
  assert.equal(fod.element, 4, 'Magic');
  assert.equal(fod.baseCastingCost, 50);
  assert.equal(fod.effects[0].type, 5, 'Disintegrate');
  assert.equal(fod.effects[0].subType, 255);
  assert.ok(shownSpellName(fod).length > 0);

  const lich = {
    level: 30,
    skills: { [SKILLS.Destruction]: 200, [SKILLS.Mysticism]: 200 },
    stats: { intelligence: 150, willpower: 150 },
    spells: [],
  };
  applyLichdom(lich);
  assert.ok(!lich.spells.some((s) => s.index === -58), 'Regular Lich must NOT receive Finger of Death');

  applyAncientLichdom(lich);
  assert.ok(lich.spells.some((s) => s.index === -58 && s.name === 'Finger of Death'), 'Ancient Lich must receive Finger of Death');
  assert.ok(!spellMakerGroups({ NecroGrimoireRead: true }).includes('Finger of Death'), 'Finger of Death must NOT be in Spell Maker');

  const fodCost = calculateCastCost(fod, lich);
  assert.equal(fodCost.sp, 50, 'Finger of Death must cost 50 SP in base and never drop to 5 SP floor');

  // 2. Suture Cadaver: Spell Maker & Grimoire check
  const cadaverSpell = sutureCadaverSpell();
  assert.equal(cadaverSpell.index, -57);
  assert.equal(cadaverSpell.name, 'Suture Cadaver');
  assert.equal(cadaverSpell.effects[0].type, 55);
  assert.equal(cadaverSpell.effects[0].subType, 255);
  assert.ok(shownSpellName(cadaverSpell).length > 0);
  assert.ok(!spellMakerGroups({ NecroGrimoireRead: false }).includes('Suture Cadaver'));
  assert.ok(spellMakerGroups({ NecroGrimoireRead: true }).includes('Suture Cadaver'));

  // 3. Suture Cadaver fail when < 3 corpses within 8m (0 corpses consumed)
  _resetCorpseRegistryForTests();
  _resetUndeadCapacityForTests();
  dismissAllMinions();
  registerCorpse({ id: 'c1', entityName: 'Bandit 1', maxHealth: 100, position: [1, 0, 1] });
  registerCorpse({ id: 'c2', entityName: 'Bandit 2', maxHealth: 100, position: [2, 0, 1] });

  let destroyedCount = 0;
  let hudMsg = '';
  const failRes = applySpell(
    cadaverSpell,
    30,
    lich,
    {
      say: (m) => { hudMsg = m; },
      destroyCorpse: () => { destroyedCount++; },
    },
    () => 0.5,
    { entity: lich },
    { position: [0, 0, 0] },
  );
  assert.equal(failRes.sutureCadaverFailed, true);
  assert.equal(destroyedCount, 0, 'Must NOT destroy any corpses when < 3 available');
  assert.equal(corpsesNear([0, 0, 0], 8).length, 2, 'Both corpses must remain unconsumed');
  assert.ok(hudMsg.length > 0, 'Must emit localized failure notification');

  // 4. Suture Cadaver with 6 corpses within 8m consumes STRICTLY 5 corpses (leaving the 6th intact)
  for (let i = 3; i <= 6; i++) {
    registerCorpse({ id: `c${i}`, entityName: `Bandit ${i}`, maxHealth: 100, position: [i * 0.5, 0, 1] });
  }
  assert.equal(corpsesNear([0, 0, 0], 8).length, 6);

  destroyedCount = 0;
  hudMsg = '';
  const okRes = castSutureCadaver(lich, [0, 0, 0], {
    sinks: {
      say: (m) => { hudMsg = m; },
      destroyCorpse: () => { destroyedCount++; },
    },
  });
  assert.equal(okRes.success, true);
  assert.equal(okRes.consumedCount, 5, 'Must consume at most 5 corpses');
  assert.equal(destroyedCount, 5, 'Must call destroyCorpse strictly 5 times');
  assert.equal(corpsesNear([0, 0, 0], 8).length, 1, 'The 6th corpse must remain untouched');
  assert.equal(usedUndeadPoints(), 6, 'Cadaver must consume 6 undead capacity slots');
  assert.equal(okRes.minion.maxHealth, 400, '80% of 5 * 100 HP = 400 HP');
  assert.equal(okRes.minion.upkeep, 4, 'Cadaver upkeep must be 4 SP/min');
  assert.equal(eliteSize({ profile: MINION_PROFILES.cadaver }), 1.35, 'Cadaver visual scale must be 1.35');

  // 5. Sunder Armor on hit (+2 to target.armorValue and target.armorValues per hit)
  const cadaverAttacker = {
    level: 12,
    isClass: false,
    skills: { [SKILLS.HandToHand]: 100 },
    stats: { luck: 50, agility: 50 },
    profile: MINION_PROFILES.cadaver,
  };
  const targetEnemy = {
    isClass: false,
    stats: { luck: 50, agility: 50 },
    armorValue: 50,
    armorValues: [50, 50, 50, 50, 50, 50, 50],
  };
  const dmg = calculateAttackDamage(cadaverAttacker, targetEnemy, { rolls: () => 0.01, dfRand: () => 0 });
  assert.ok(dmg >= 25 && dmg <= 45, `Expected damage in [25, 45], got ${dmg}`);
  assert.equal(targetEnemy.armorValue, 52, 'Sunder Armor must worsen target armorValue by +2 on hit');
  assert.equal(targetEnemy.armorValues[0], 52, 'Sunder Armor must worsen target armorValues by +2 on hit');

  dismissAllMinions();
  _resetCorpseRegistryForTests();
});
