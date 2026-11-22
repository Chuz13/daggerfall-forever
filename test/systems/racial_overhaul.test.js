import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { RACES } from '../../src/systems/races.js';
import { SKILLS } from '../../src/systems/skills.js';
import { WEAPONS } from '../../src/characters/weapons.js';
import { EQUIP_SLOTS } from '../../src/characters/paperdoll/paperdoll.js';
import { createEquipTable } from '../../src/characters/equipTable.js';
import { computeEntityMods, weaponBlowMods } from '../../src/systems/entityMods.js';
import { liveStat, maxFatigue, maxFatigueBase } from '../../src/systems/statMods.js';
import { skillValue } from '../../src/systems/skills.js';
import { defineLiveMaxHealth, defineLiveMaxMagicka } from '../../src/systems/chargen.js';
import { dressStanding } from '../../src/systems/clothingStanding.js';
import { savingChance, ELEMENTS, EFFECT_FLAGS } from '../../src/systems/spellcast.js';
import { isEntityImmuneToParalysis, isEntityImmuneToDisease } from '../../src/systems/effects.js';
import { inflictPoison, POISONS } from '../../src/systems/poisons.js';
import { spellPowerMult } from '../../src/systems/spell/spellPower.js';
import { castRate } from '../../src/systems/castSpeed.js';
import { spellPointRecoveryRate } from '../../src/systems/rest/rest.js';
import { tryAbsorption } from '../../src/systems/absorption.js';
import { calculateCastCost } from '../../src/systems/spellcost.js';
import { swingPacePct } from '../../src/characters/weaponStates.js';
import { passiveSpecialsMagicRound, setPassiveSpecialsHost } from '../../src/systems/passiveSpecials.js';
import { swingFatigueCost } from '../../src/scenes/hostCombat.js';
import { motorStats } from '../../src/scenes/shared.js';
import { racialModifiers } from '../../src/combat/formulas.js';
import { pcaaoRacialModifiers } from '../../src/combat/pcaao.js';
import { snapshotPlayer, restorePlayer, savedVitalsOf } from '../../src/systems/save/save.js';
import {
  RACIAL_OVERHAUL_PREF,
  isRacialOverhaulEnabled,
  withRacialOverhaulState,
  overhaulRacialCombatMods,
  effectiveRaceTemplate,
  racialNightVisionBoost,
  isGreenPactProtected,
  racialOverhaulInfo,
} from '../../src/systems/racialOverhaulData.js';
import {
  installRacialOverhaul,
  recalcEntityForRacialToggle,
  isSpellswordStance,
} from '../../src/systems/racialOverhaul.js';
import { setPref, resetPrefs } from '../../src/systems/uiPrefs.js';

function makePlayer(raceId, level = 10, extra = {}) {
  const e = {
    isPlayer: true,
    raceId,
    level,
    stats: {
      strength: 60,
      intelligence: 60,
      willpower: 50,
      agility: 50,
      endurance: 60,
      personality: 50,
      speed: 50,
      luck: 50,
    },
    skills: new Array(35).fill(35),
    skillUses: new Array(35).fill(0),
    career: { abilityFlagsAndSpellPointsBitfield: 0x1000, hitPointsPerLevel: 10 },
    reactionMods: [0, 0, 0, 0, 0],
    activeEffects: [],
    items: [],
    equip: createEquipTable(),
    maxHealth: 100,
    health: 100,
    magicka: 60,
    fatigue: 60 * 2 * 64,
    ...extra,
  };
  defineLiveMaxHealth(e);
  defineLiveMaxMagicka(e);
  e.health = e.maxHealth;
  e.magicka = e.maxMagicka;
  e.fatigue = maxFatigue(e);
  computeEntityMods(e);
  return e;
}

describe('Racial Overhaul', () => {
  beforeEach(() => {
    installRacialOverhaul();
    resetPrefs();
  });

  afterEach(() => {
    resetPrefs();
    setPassiveSpecialsHost(null);
  });

  it('defaults to enabled and toggles cleanly via prefs', () => {
    assert.equal(isRacialOverhaulEnabled(), true);
    setPref(RACIAL_OVERHAUL_PREF, false);
    assert.equal(isRacialOverhaulEnabled(), false);
    setPref(RACIAL_OVERHAUL_PREF, true);
    assert.equal(isRacialOverhaulEnabled(), true);
  });

  it('gives DPS-homogenized level-scaled weapon bonuses and reverts to 0/vanilla when OFF', () => {
    const redguard = makePlayer(RACES.Redguard, 10);
    assert.deepEqual(overhaulRacialCombatMods(redguard, {}, SKILLS.LongBlade), { damageMod: 3, toHitMod: 5 });
    assert.deepEqual(overhaulRacialCombatMods(redguard, {}, SKILLS.ShortBlade), { damageMod: 2, toHitMod: 5 });
    assert.deepEqual(overhaulRacialCombatMods(redguard, {}, SKILLS.Axe), { damageMod: 0, toHitMod: 0 });

    const nord = makePlayer(RACES.Nord, 12);
    assert.deepEqual(overhaulRacialCombatMods(nord, {}, SKILLS.Axe), { damageMod: 4, toHitMod: 6 });
    assert.deepEqual(overhaulRacialCombatMods(nord, {}, SKILLS.BluntWeapon), { damageMod: 4, toHitMod: 6 });

    const woodElf = makePlayer(RACES.WoodElf, 12);
    assert.deepEqual(overhaulRacialCombatMods(woodElf, {}, SKILLS.Archery), { damageMod: 5, toHitMod: 6 });
    assert.deepEqual(overhaulRacialCombatMods(woodElf, {}, SKILLS.ShortBlade), { damageMod: 3, toHitMod: 6 });

    const khajiit = makePlayer(RACES.Khajiit, 12);
    assert.deepEqual(overhaulRacialCombatMods(khajiit, null, SKILLS.HandToHand), { damageMod: 3, toHitMod: 6 });
    assert.deepEqual(overhaulRacialCombatMods(khajiit, {}, SKILLS.ShortBlade), { damageMod: 3, toHitMod: 6 });

    const breton = makePlayer(RACES.Breton, 20);
    assert.deepEqual(overhaulRacialCombatMods(breton, {}, SKILLS.LongBlade), { damageMod: 0, toHitMod: 0 });

    withRacialOverhaulState(false, () => {
      assert.deepEqual(overhaulRacialCombatMods(redguard, {}, SKILLS.LongBlade), { damageMod: 0, toHitMod: 0 });
      assert.deepEqual(overhaulRacialCombatMods(khajiit, null, SKILLS.HandToHand), { damageMod: 0, toHitMod: 0 });
    });

    // Pure vanilla & PCAAO functions remain untouched
    assert.deepEqual(racialModifiers(makePlayer(RACES.Nord, 12), { templateIndex: WEAPONS.Battle_Axe }), { damageMod: 0, toHitMod: 0 });
    assert.deepEqual(pcaaoRacialModifiers(makePlayer(RACES.Nord, 12), { templateIndex: WEAPONS.Battle_Axe }, makePlayer(RACES.Nord, 12)), { damageMod: 4, toHitMod: 3 });
  });

  it('applies racial resistances, immunities, and weaknesses, and reverts on OFF', () => {
    const nord = makePlayer(RACES.Nord, 10);
    const frostOn = savingChance(ELEMENTS.Frost, EFFECT_FLAGS.Frost, nord);
    const shockOn = savingChance(ELEMENTS.Shock, EFFECT_FLAGS.Shock, nord);
    assert.equal(frostOn.immune, true);
    assert.equal(shockOn.chance, 85); // 50 + 30 + 5 (willpower 50/10)

    const highElf = makePlayer(RACES.HighElf, 10);
    assert.equal(isEntityImmuneToParalysis(highElf), true);
    assert.equal(savingChance(ELEMENTS.Fire, EFFECT_FLAGS.Fire, highElf).chance, 30); // 50 - 25 + 5

    const argonian = makePlayer(RACES.Argonian, 10);
    assert.equal(inflictPoison(argonian, POISONS.Arsenic, false), null);
    assert.equal(savingChance(ELEMENTS.DiseaseOrPoison, EFFECT_FLAGS.Disease, argonian).immune, true); // 50 + 30 + 20 = 100

    withRacialOverhaulState(false, () => {
      computeEntityMods(nord);
      assert.equal(savingChance(ELEMENTS.Frost, EFFECT_FLAGS.Frost, nord).immune, false);
      assert.equal(savingChance(ELEMENTS.Frost, EFFECT_FLAGS.Frost, nord).chance, 85);
      assert.equal(savingChance(ELEMENTS.Fire, EFFECT_FLAGS.Fire, highElf).chance, 55);
      assert.equal(effectiveRaceTemplate(argonian).immunityFlags, 0);
      assert.equal(isEntityImmuneToDisease(argonian), false);
    });
  });

  it('applies Breton, Dark Elf, High Elf, Redguard, Nord, Wood Elf, Khajiit, and Argonian passives', () => {
    // Breton: absorption, spell cost, skills, standing stacking over gear cap
    const breton = makePlayer(RACES.Breton, 10);
    breton._mods.standing[3] = 10; // simulate +10 gear Nobility standing
    const standing = dressStanding(breton);
    assert.equal(standing.groups[3], 20); // +10 gear + +10 Breton
    assert.equal(standing.groups[2], 10); // +10 Scholars
    assert.equal(skillValue(breton, SKILLS.Etiquette), 45);
    assert.equal(skillValue(breton, SKILLS.Mysticism), 45);
    const healSpell = { rangeType: 0, effects: [{ type: 10, subType: 8, magnitudeBaseLow: 10, magnitudeBaseHigh: 10, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1 }] };
    const costOn = calculateCastCost(healSpell, breton).sp;
    let costOff = 0;
    withRacialOverhaulState(false, () => {
      computeEntityMods(breton);
      costOff = calculateCastCost(healSpell, breton).sp;
    });
    computeEntityMods(breton);
    assert.ok(costOn < costOff, `expected Breton Restoration discount (${costOn} < ${costOff})`);
    const absorbed = tryAbsorption(
      { type: 4, subType: 0, magnitudeBaseLow: 5, magnitudeBaseHigh: 5, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1 },
      0,
      { ...breton, magicka: 0, maxMagicka: 100 },
      { rolls: () => 0.10 }, // 10 < 15
    );
    assert.ok(absorbed > 0);

    // Dark Elf: Spellsword Resonance
    const darkElf = makePlayer(RACES.DarkElf, 10);
    const sword = { group: 'Weapons', templateIndex: WEAPONS.Longsword };
    darkElf.equip.slots[EQUIP_SLOTS.RightHand] = sword;
    darkElf.equip.slots[EQUIP_SLOTS.LeftHand] = null;
    assert.equal(isSpellswordStance(darkElf), true);
    const destrPower = spellPowerMult(darkElf, { isPlayer: false }, { school: SKILLS.Destruction });
    assert.ok(Math.abs(destrPower - 1.10) < 1e-6);
    assert.ok(castRate(darkElf) > 1.09);
    darkElf.equip.slots[EQUIP_SLOTS.LeftHand] = { group: 'Armor', templateIndex: 100 }; // offhand occupied
    assert.equal(isSpellswordStance(darkElf), false);

    // High Elf: +25% MP, +35% rest SP, +15% spell power, +12% cast speed
    const highElf = makePlayer(RACES.HighElf, 10);
    assert.equal(highElf.maxMagicka, 75); // 60 + 15
    assert.ok(Math.abs(spellPowerMult(highElf, { isPlayer: false }, { school: SKILLS.Destruction }) - 1.15) < 1e-6);
    assert.ok(spellPointRecoveryRate(highElf) > Math.floor(highElf.maxMagicka / 8));
    assert.ok(castRate(highElf) > 1.11);

    // Redguard: +15% maxFatigue, -30% swing fatigue
    const redguard = makePlayer(RACES.Redguard, 10);
    assert.ok(maxFatigue(redguard) > maxFatigueBase(redguard));
    assert.ok(swingFatigueCost(null, redguard) < swingFatigueCost(null, breton));

    // Nord: +10% HP, +25% melee blow below 35% HP (not bow)
    const nord = makePlayer(RACES.Nord, 10);
    assert.equal(nord.maxHealth, 110);
    nord.health = 30;
    assert.equal(weaponBlowMods({ templateIndex: WEAPONS.Battle_Axe }, 20, nord, { isPlayer: false }, { unaware: false }), 25);
    assert.equal(weaponBlowMods({ templateIndex: WEAPONS.Long_Bow }, 20, nord, { isPlayer: false }, { unaware: false }), 20);

    // Wood Elf: +25% unaware blow, +10% bow pace, Green Pact
    const woodElf = makePlayer(RACES.WoodElf, 10);
    assert.equal(weaponBlowMods({ templateIndex: WEAPONS.Long_Bow }, 20, woodElf, { isPlayer: false }, { unaware: true }), 25);
    assert.equal(swingPacePct({ entity: woodElf, weaponType: 17 }, null), 10);
    const wolf = { isQuestFoe: false, entity: { _provokedByPlayer: false } };
    assert.equal(isGreenPactProtected(wolf, woodElf, true), true);
    wolf.entity._provokedByPlayer = true;
    assert.equal(isGreenPactProtected(wolf, woodElf, true), false);

    // Khajiit: +5 Speed & Agility, night vision finite
    const khajiit = makePlayer(RACES.Khajiit, 10);
    assert.equal(liveStat(khajiit, 'speed'), 55);
    assert.equal(liveStat(khajiit, 'agility'), 55);
    assert.ok(Number.isFinite(racialNightVisionBoost(khajiit)) && racialNightVisionBoost(khajiit) > 0);

    // Argonian: +40% swim speed, +5 armor all parts, Hist regen in water/rain
    const argonian = makePlayer(RACES.Argonian, 10);
    assert.equal(motorStats(argonian).swimSpeedMult, 1.40);
    assert.deepEqual(argonian._mods.armorParts, [5, 5, 5, 5, 5, 5, 5]);
    let healed = 0;
    let fatRestored = 0;
    setPassiveSpecialsHost({ now: () => 0, isInside: () => false, inDungeon: () => false, inPrison: () => false, isHolyPlace: () => false, isSwimming: () => true, isRaining: () => false });
    passiveSpecialsMagicRound(argonian, { nowMinutes: 2, clockMinutes: 2, sinks: { heal: (n) => { healed += n; }, restoreFatigue: (n) => { fatRestored += n; } } });
    assert.equal(healed, 1);
    assert.ok(fatRestored > 0);
  });

  it('live toggle ON <-> OFF rescales vitals proportionally and updates mods immediately', () => {
    const nord = makePlayer(RACES.Nord, 10);
    assert.equal(nord.maxHealth, 110);
    nord.health = 55; // exactly 50%
    setPref(RACIAL_OVERHAUL_PREF, false);
    recalcEntityForRacialToggle(nord, true, false);
    assert.equal(nord.maxHealth, 100);
    assert.equal(nord.health, 50); // still 50%

    setPref(RACIAL_OVERHAUL_PREF, true);
    recalcEntityForRacialToggle(nord, false, true);
    assert.equal(nord.maxHealth, 110);
    assert.equal(nord.health, 55);
  });

  it('save/load preserves vitals cleanly across ON->OFF, OFF->ON, and savedVitalsOf', () => {
    const nord = makePlayer(RACES.Nord, 1);
    nord.health = 55; // 50% of 110
    const snap = snapshotPlayer(nord, {});
    assert.equal(snap.maxHealth, 100); // base stored
    assert.equal(snap.health, 50); // normalized to base 50%
    assert.equal(savedVitalsOf(snap).maxHealth, 110);
    assert.equal(savedVitalsOf(snap).health, 55);

    // Load with overhaul OFF -> stays 50/100
    setPref(RACIAL_OVERHAUL_PREF, false);
    const loadedOff = makePlayer(RACES.Breton, 1);
    restorePlayer(loadedOff, snap);
    assert.equal(loadedOff.maxHealth, 100);
    assert.equal(loadedOff.health, 50);

    // Load with overhaul ON -> expands back to 55/110
    setPref(RACIAL_OVERHAUL_PREF, true);
    const loadedOn = makePlayer(RACES.Breton, 1);
    restorePlayer(loadedOn, snap);
    assert.equal(loadedOn.maxHealth, 110);
    assert.equal(loadedOn.health, 55);
  });

  it('contains all 12 localization keys in all 26 locales and hides info when OFF', () => {
    const expectedKeys = [
      'settings.sec.races',
      'features.racialOverhaul.title',
      'features.racialOverhaul.note',
      'race.overhaul.header',
      'race.overhaul.desc.Breton',
      'race.overhaul.desc.Redguard',
      'race.overhaul.desc.Nord',
      'race.overhaul.desc.DarkElf',
      'race.overhaul.desc.HighElf',
      'race.overhaul.desc.WoodElf',
      'race.overhaul.desc.Khajiit',
      'race.overhaul.desc.Argonian',
    ];
    const localesDir = path.join(process.cwd(), 'locales');
    const langs = fs.readdirSync(localesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    assert.equal(langs.length, 26);
    for (const lang of langs) {
      const raw = fs.readFileSync(path.join(localesDir, lang, 'Port_Strings.csv'), 'utf8');
      const keys = new Set(raw.split(/\r?\n/).map((l) => l.slice(0, Math.max(0, l.indexOf(',')))).filter(Boolean));
      for (const k of expectedKeys) {
        assert.equal(keys.has(k), true, `${lang} missing key ${k}`);
      }
    }
    assert.ok(racialOverhaulInfo('Khajiit')?.text);
    withRacialOverhaulState(false, () => {
      assert.equal(racialOverhaulInfo('Khajiit'), null);
    });
  });
});
