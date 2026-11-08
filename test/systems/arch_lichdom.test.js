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
  assert.equal(dummyPlayer.spells.length, 5, '4 standard necro spells + 1 Arch-Lichdom');
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
