import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyLichdom,
  applyAncientLichdom,
  cureLichdom,
  cureAncientLichdom,
  isLich,
  isAncientLich,
  lichHpOf,
  lichMpOf,
  lichManaRegenOf,
  lichdomMagicRound,
  LICH_HP_BONUS,
  LICH_MANA_BONUS,
  LICH_MANA_REGEN,
  ANCIENT_LICH_HP_BONUS,
  ANCIENT_LICH_MANA_BONUS,
  ANCIENT_LICH_MANA_REGEN,
} from '../../src/systems/necromancy/lichdomStatus.js';
import { defineLiveMaxHealth, defineLiveMaxMagicka } from '../../src/systems/chargen.js';
import { spellTipLines, statusTip } from '../../src/ui/hud/statusTips.js';
import { setLocale, patchLocaleTable, loadStringTableCsv } from '../../src/systems/textManager.js';
import { runMagicRoundsFor } from '../../src/systems/worldTick.js';
import { readFileSync } from 'node:fs';

const ruCsv = readFileSync('locales/ru/Port_Strings.csv', 'utf8');
patchLocaleTable('ru', 'Port_Strings', loadStringTableCsv(ruCsv));

test('Lichdom & Arch-Lichdom: bonus constants match exact specifications', () => {
  assert.equal(LICH_HP_BONUS, 100);
  assert.equal(LICH_MANA_BONUS, 250);
  assert.equal(LICH_MANA_REGEN, 5);

  assert.equal(ANCIENT_LICH_HP_BONUS, 250); // +150 relative to Lich
  assert.equal(ANCIENT_LICH_MANA_BONUS, 500); // +250 relative to Lich
  assert.equal(ANCIENT_LICH_MANA_REGEN, 15); // +10 relative to Lich
});

test('Lich vitals readers: lichHpOf, lichMpOf, lichManaRegenOf', () => {
  const mortal = { activeEffects: [] };
  assert.equal(lichHpOf(mortal), 0);
  assert.equal(lichMpOf(mortal), 0);
  assert.equal(lichManaRegenOf(mortal), 0);

  // Lich
  applyLichdom(mortal);
  assert.equal(isLich(mortal), true);
  assert.equal(lichHpOf(mortal), 100);
  assert.equal(lichMpOf(mortal), 250);
  assert.equal(lichManaRegenOf(mortal), 5);

  // Ancient Lich
  applyAncientLichdom(mortal);
  assert.equal(isAncientLich(mortal), true);
  assert.equal(lichHpOf(mortal), 250);
  assert.equal(lichMpOf(mortal), 500);
  assert.equal(lichManaRegenOf(mortal), 15);

  // Cured
  cureLichdom(mortal);
  assert.equal(lichHpOf(mortal), 0);
  assert.equal(lichMpOf(mortal), 0);
  assert.equal(lichManaRegenOf(mortal), 0);
});

test('Live entity integration: defineLiveMaxHealth and defineLiveMaxMagicka scale properly with Lichdom and Arch-Lichdom', () => {
  const entity = {
    isPlayer: true,
    level: 20,
    health: 120,
    maxHealth: 120,
    magicka: 80,
    maxMagicka: 80,
    stats: { intelligence: 50, willpower: 50 },
    activeEffects: [],
  };
  defineLiveMaxHealth(entity);
  defineLiveMaxMagicka(entity);

  const mortalMaxHp = entity.maxHealth;
  const mortalMaxMp = entity.maxMagicka;
  assert.equal(mortalMaxHp, 120);

  // 1. Ascend to Lichdom
  applyLichdom(entity);
  assert.equal(isLich(entity), true);
  assert.equal(entity.maxHealth, mortalMaxHp + 100, 'Lichdom must grant +100 Max HP');
  // Live intelligence increases by 25 from Lich statMods (50 -> 75), plus flat +250 mana
  assert.ok(entity.maxMagicka >= mortalMaxMp + 250, 'Lichdom must grant +250 Max Magicka on top of stat scaling');

  const lichMaxHp = entity.maxHealth;
  const lichMaxMp = entity.maxMagicka;

  // 2. Ascend to Arch-Lichdom
  applyAncientLichdom(entity);
  assert.equal(isAncientLich(entity), true);
  assert.equal(entity.maxHealth, mortalMaxHp + 250, 'Arch-Lichdom must grant +250 Max HP relative to mortal');
  assert.equal(entity.maxHealth, lichMaxHp + 150, 'Arch-Lichdom must grant +150 Max HP relative to Lich');
  assert.ok(entity.maxMagicka >= mortalMaxMp + 500, 'Arch-Lichdom must grant +500 Max Magicka relative to mortal');
  assert.ok(entity.maxMagicka >= lichMaxMp + 250, 'Arch-Lichdom must grant +250 Max Magicka relative to Lich');

  // 3. Cure restores mortal maximums
  cureLichdom(entity);
  assert.equal(isLich(entity), false);
  assert.equal(isAncientLich(entity), false);
  assert.equal(entity.maxHealth, mortalMaxHp, 'Curing Lichdom restores base Max HP');
  assert.equal(entity.maxMagicka, mortalMaxMp, 'Curing Lichdom restores base Max Magicka');
});

test('Mana regen logic: flat regen adds each round without breaking caps or other regen mechanics', () => {
  const lich = {
    isPlayer: true,
    health: 200,
    maxHealth: 200,
    magicka: 50,
    maxMagicka: 350,
    activeEffects: [],
  };
  applyLichdom(lich);

  // Round 1: regenerates 5 mana
  lichdomMagicRound(lich, { nowMinutes: 1 });
  assert.equal(lich.magicka, 55, 'Lich must regenerate 5 flat mana per round');

  // Round 2: with sinks.restoreMagicka
  let restored = 0;
  const sinks = {
    restoreMagicka: (n) => {
      restored += n;
      lich.magicka = Math.min(lich.maxMagicka, lich.magicka + n);
    },
  };
  lichdomMagicRound(lich, { nowMinutes: 2, sinks });
  assert.equal(restored, 5);
  assert.equal(lich.magicka, 60);

  // Does not exceed maxMagicka
  lich.magicka = 348;
  lichdomMagicRound(lich, { nowMinutes: 3 });
  assert.equal(lich.magicka, 350, 'Mana must cap at maxMagicka');

  // Does not regenerate if dead
  lich.health = 0;
  lich.magicka = 10;
  lichdomMagicRound(lich, { nowMinutes: 4 });
  assert.equal(lich.magicka, 10, 'Dead Lich must not regenerate mana');

  // Arch-Lich regenerates 15 mana per round
  lich.health = 200;
  applyAncientLichdom(lich);
  lich.magicka = 100;
  lichdomMagicRound(lich, { nowMinutes: 5 });
  assert.equal(lich.magicka, 115, 'Arch-Lich must regenerate 15 flat mana per round');
});

test('World tick integration: runMagicRoundsFor triggers lichdomMagicRound across rounds', () => {
  const lich = {
    isPlayer: true,
    health: 200,
    maxHealth: 200,
    magicka: 100,
    maxMagicka: 500,
    activeEffects: [],
  };
  applyLichdom(lich);

  let restoredTotal = 0;
  const sinks = {
    restoreMagicka: (n) => {
      restoredTotal += n;
      lich.magicka = Math.min(lich.maxMagicka, lich.magicka + n);
    },
  };

  // Run 3 magic rounds (from minute 10 to minute 13)
  const roundsRun = runMagicRoundsFor(lich, 10, 13, { sinks });
  assert.equal(roundsRun, 3);
  assert.equal(restoredTotal, 15, '3 rounds * 5 mana/round = 15 mana restored');
  assert.equal(lich.magicka, 115);
});

test('Buff cards: status tips for Lichdom (91001) and Arch-Lichdom (91002) display vitals and mana regen', () => {
  setLocale('en');
  const entity = {
    activeEffects: [],
    stats: { intelligence: 100, willpower: 100 },
    skills: {},
  };

  // 1. Lichdom card check
  applyLichdom(entity);
  const lichLines = spellTipLines(entity, 91001);
  assert.ok(
    lichLines.some((l) => l.includes('100') && l.includes('Health') && l.includes('250') && l.includes('Spell Points')),
    'Lich card must display +100 Health and +250 Spell Points',
  );
  assert.ok(
    lichLines.some((l) => l.includes('5') && l.includes('Magicka regen')),
    'Lich card must display +5 Magicka regen per round',
  );

  // 2. Arch-Lichdom card check
  applyAncientLichdom(entity);
  const ancientLines = spellTipLines(entity, 91002);
  assert.ok(
    ancientLines.some((l) => l.includes('250') && l.includes('Health') && l.includes('500') && l.includes('Spell Points')),
    'Arch-Lich card must display +250 Health and +500 Spell Points',
  );
  assert.ok(
    ancientLines.some((l) => l.includes('15') && l.includes('Magicka regen')),
    'Arch-Lich card must display +15 Magicka regen per round',
  );

  // 3. Russian locale verification
  setLocale('ru');
  const ruLich = { activeEffects: [] };
  applyLichdom(ruLich);
  const ruLichLines = spellTipLines(ruLich, 91001);
  assert.ok(
    ruLichLines.some((l) => l.includes('100') && l.includes('здоров') && l.includes('250') && l.includes('ман')),
    'Russian Lich card must display +100 к здоровью и +250 к мане',
  );
  assert.ok(
    ruLichLines.some((l) => l.includes('5') && l.includes('регенерац')),
    'Russian Lich card must display +5 к регенерации маны',
  );

  const ruAncient = { activeEffects: [] };
  applyAncientLichdom(ruAncient);
  const ruAncientLines = spellTipLines(ruAncient, 91002);
  assert.ok(
    ruAncientLines.some((l) => l.includes('250') && l.includes('здоров') && l.includes('500') && l.includes('ман')),
    'Russian Arch-Lich card must display +250 к здоровью и +500 к мане',
  );
  assert.ok(
    ruAncientLines.some((l) => l.includes('15') && l.includes('регенерац')),
    'Russian Arch-Lich card must display +15 к регенерации маны',
  );

  // Restore locale
  setLocale('en');
});
