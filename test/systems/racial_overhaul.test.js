import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { RACES, RACE_TEMPLATES } from '../../src/systems/races.js';
import { SKILLS } from '../../src/systems/skills.js';
import { WEAPONS } from '../../src/characters/weapons.js';
import { HAND_WRAPS_TEMPLATE, isHandWraps } from '../../src/characters/handWrapsIds.js';
const WEAPON_TYPE_BOW = 14;
import { EQUIP_SLOTS } from '../../src/characters/paperdoll/paperdoll.js';
import { createEquipTable } from '../../src/characters/equipTable.js';
import { computeEntityMods, weaponBlowMods } from '../../src/systems/entityMods.js';
import { liveStat, maxFatigue, maxFatigueBase } from '../../src/systems/statMods.js';
import { skillValue } from '../../src/systems/skills.js';
import { defineLiveMaxHealth, defineLiveMaxMagicka, applyCharacter } from '../../src/systems/chargen.js';
import { weatherFlags } from '../../src/world/weather.js';
import { Renderer, setNightVisionReader } from '../../src/render/renderer.js';
import { dressStanding, dressStandingBreakdown } from '../../src/systems/clothingStanding.js';
import { savingChance, ELEMENTS, EFFECT_FLAGS } from '../../src/systems/spellcast.js';
import { isEntityImmuneToParalysis, isEntityImmuneToDisease } from '../../src/systems/effects.js';
import { inflictPoison, POISONS } from '../../src/systems/poisons.js';
import { spellPowerMult } from '../../src/systems/spell/spellPower.js';
import { castRate } from '../../src/systems/castSpeed.js';
import { spellPointRecoveryRate } from '../../src/systems/rest/rest.js';
import { tryAbsorption } from '../../src/systems/absorption.js';
import { calculateCastCost } from '../../src/systems/spellcost.js';
import { swingPacePct, bowReloadSeconds } from '../../src/characters/weaponStates.js';
import { passiveSpecialsMagicRound, setPassiveSpecialsHost } from '../../src/systems/passiveSpecials.js';
import { swingFatigueCost } from '../../src/scenes/hostCombat.js';
import { motorStats } from '../../src/scenes/shared.js';
import { racialModifiers, entityMaxEncumbrance } from '../../src/combat/formulas.js';
import { pcaaoRacialModifiers } from '../../src/combat/pcaao.js';
import { snapshotPlayer, restorePlayer, savedVitalsOf, restoresSoFar } from '../../src/systems/save/save.js';
import { carriedWeight } from '../../src/systems/inventory.js';
import { claimMagicRounds, resetMagicRoundMarker, setWorldMinutes, worldMinutes } from '../../src/systems/worldTick.js';
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
import {
  TEST_RACE_LOCATION,
  TEST_RACE_LEVELS,
  parseTestRaceId,
  testRacePresetOf,
  testEntryById,
  testStartsOutdoors,
  testStartLocation,
  testRoomOnlineRefused,
  seedTestRaceQuickStart,
} from '../../src/systems/testRoom.js';
import { auditRacialOverhaulState, verifyRacialSaveRoundTrip, runAllRacesMatrixAudit } from '../../src/systems/diagnostics/racialAudit.js';
import { buildDiagnosticSnapshot } from '../../src/systems/diagnostics/sessionLogger.js';
import { recordAttackResolution, dumpCombatLog } from '../../src/systems/diagnostics/combatLogger.js';
import { getRecentTimelineEvents, clearTimeline } from '../../src/systems/diagnostics/eventTimeline.js';
import { executeConsoleLine } from '../../src/systems/consoleCommands.js';
import { playerEntity } from '../../src/characters/playerEntity.js';

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
    assert.deepEqual(frostOn, { immune: false, chance: 95 }); // 50 + 30 + 20 + 5 = 105 -> clamped to 95 (not hard immune)
    assert.equal(shockOn.chance, 85); // 50 + 30 + 5 (willpower 50/10)

    const highElf = makePlayer(RACES.HighElf, 10);
    assert.equal(isEntityImmuneToParalysis(highElf), true);
    assert.equal(savingChance(ELEMENTS.Fire, EFFECT_FLAGS.Fire, highElf).chance, 30); // 50 - 25 + 5

    const argonian = makePlayer(RACES.Argonian, 10);
    assert.equal(inflictPoison(argonian, POISONS.Arsenic, false), null);
    assert.deepEqual(savingChance(ELEMENTS.DiseaseOrPoison, EFFECT_FLAGS.Disease, argonian), { immune: false, chance: 95 }); // 50 + 30 + 20 + 5 -> 95 (not hard immune)

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
    const breakdown = dressStandingBreakdown(breton);
    assert.equal(breakdown.dressGroups[3], 10); // Dress row excludes racial standing
    assert.equal(breakdown.racialGroups[3], 10); // Race row carries +10 Nobility
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
    darkElf.equip.slots[EQUIP_SLOTS.RightHand] = { group: 'Weapons', templateIndex: HAND_WRAPS_TEMPLATE };
    darkElf.equip.slots[EQUIP_SLOTS.LeftHand] = null;
    assert.equal(isSpellswordStance(darkElf), false);
    darkElf.equip.slots[EQUIP_SLOTS.RightHand] = sword;
    darkElf.lightSource = { group: 'Usable', templateIndex: 247, isEquipped: true }; // lit torch in off-hand
    assert.equal(isSpellswordStance(darkElf), false);
    darkElf.lightSource = null;
    assert.equal(isSpellswordStance(darkElf), true);
    const hybridSpell = {
      rangeType: 0,
      effects: [
        { type: 15, subType: 255, durationBase: 10, durationMod: 0, durationPerLevel: 1 }, // Illusion Light
        { type: 4, subType: 0, magnitudeBaseLow: 10, magnitudeBaseHigh: 10, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 1 }, // Destruction
      ],
    };
    const darkCostOn = calculateCastCost(hybridSpell, darkElf).sp;
    let darkCostOff = 0;
    withRacialOverhaulState(false, () => { darkCostOff = calculateCastCost(hybridSpell, darkElf).sp; });
    assert.ok(darkCostOn < darkCostOff, `expected Dark Elf multi-effect Destruction discount (${darkCostOn} < ${darkCostOff})`);

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
    assert.equal(swingPacePct({ entity: woodElf, weaponType: WEAPON_TYPE_BOW }, null), 10);
    const reloadOn = bowReloadSeconds(50, { entity: woodElf, weaponType: WEAPON_TYPE_BOW });
    let reloadOff = 0;
    withRacialOverhaulState(false, () => {
      reloadOff = bowReloadSeconds(50, { entity: woodElf, weaponType: WEAPON_TYPE_BOW });
    });
    assert.ok(reloadOn < reloadOff, `expected faster bow reload (${reloadOn} < ${reloadOff})`);
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
    assert.equal(weatherFlags('rain').raining, true);
    assert.equal(weatherFlags('thunder').raining, true);
  });

  it('fills new characters to 100% live vitals, avoids brightening bright interiors, and does not stack Breton reactionMods on quickload', () => {
    const career = {
      name: 'Warrior',
      abilityFlagsAndSpellPointsBitfield: 0x1000,
      hitPointsPerLevel: 10,
      primarySkills: [0, 1, 2],
      majorSkills: [3, 4, 5],
      minorSkills: [6, 7, 8, 9, 10, 11],
    };
    const baseStats = { strength: 60, intelligence: 60, willpower: 50, agility: 50, endurance: 60, personality: 50, speed: 50, luck: 50 };
    const skills = new Array(35).fill(35);

    const newNord = applyCharacter({}, career, 0, { race: 'Nord', raceId: RACES.Nord, stats: { ...baseStats }, skills: [...skills] });
    assert.equal(newNord.health, newNord.maxHealth);
    const newHighElf = applyCharacter({}, career, 0, { race: 'HighElf', raceId: RACES.HighElf, stats: { ...baseStats }, skills: [...skills] });
    assert.equal(newHighElf.magicka, newHighElf.maxMagicka);
    const newRedguard = applyCharacter({}, career, 0, { race: 'Redguard', raceId: RACES.Redguard, stats: { ...baseStats }, skills: [...skills] });
    assert.equal(newRedguard.fatigue, maxFatigue(newRedguard));

    // Khajiit night vision lifts dark ambient, leaves bright interior / unlit automap untouched
    setNightVisionReader(() => 0.18);
    const fakeRenderer = { _sunScale: 0, _lane: null, _decA: new Float32Array(3) };
    const darkOut = Renderer.prototype._nvAmb.call(fakeRenderer, new Float32Array([0.05, 0.05, 0.06]));
    assert.ok(darkOut[0] > 0.05 && darkOut[2] > 0.06);
    const brightSrc = new Float32Array([0.65, 0.65, 0.65]);
    const brightInterior = Renderer.prototype._nvAmb.call(fakeRenderer, brightSrc);
    assert.equal(brightInterior, brightSrc);
    const unlitMap = Renderer.prototype._nvAmb.call(fakeRenderer, new Float32Array([1, 1, 1]));
    assert.deepEqual(Array.from(unlitMap), [1, 1, 1]);
    setNightVisionReader(null);

    // Repeated quickloads do not stack Breton reactionMods
    const breton = makePlayer(RACES.Breton, 10);
    const snap = snapshotPlayer(breton, {});
    const target = makePlayer(RACES.Breton, 10);
    restorePlayer(target, snap);
    restorePlayer(target, snap);
    restorePlayer(target, snap);
    assert.equal(target.reactionMods[2], 10);
    assert.equal(target.reactionMods[3], 10);
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

  it('contains all 16 localization keys in all 26 locales and hides info when OFF', () => {
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
      'menu.test.raceTitle',
      'menu.test.raceName',
      'menu.test.raceNote',
      'menu.test.raceLevel',
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

  it('resolves all 8 race quick-start IDs in Gothway Garden and seeds clean level-1 & level-10 characters', () => {
    assert.deepEqual(TEST_RACE_LOCATION, { region: 'Daggerfall', loc: 'Gothway Garden' });
    assert.deepEqual(TEST_RACE_LEVELS, [1, 10]);
    assert.equal(parseTestRaceId('race-NoSuchRace'), null);
    assert.equal(parseTestRaceId('race-DarkElf-0'), null);
    assert.equal(parseTestRaceId('race-DarkElf-36'), null);
    assert.equal(testEntryById('race-NoSuchRace'), null);

    for (const tpl of RACE_TEMPLATES) {
      for (const lvl of TEST_RACE_LEVELS) {
        const id = `race-${tpl.key}-${lvl}`;
        const parsed = parseTestRaceId(id);
        assert.deepEqual({ race: parsed.tpl.key, level: parsed.level }, { race: tpl.key, level: lvl });
        assert.equal(testStartsOutdoors(id), true);
        assert.deepEqual(testStartLocation(id), TEST_RACE_LOCATION);
        assert.equal(testRoomOnlineRefused(new URLSearchParams(`online=1&test=${id}`)), true);
        const entry = testEntryById(id);
        assert.equal(entry.preset.race, tpl.key);
        assert.equal(entry.raceTest.level, lvl);

        const entity = makePlayer(tpl.id, 1, { race: tpl.key, items: [], spells: [] });
        entity.equip.slots[EQUIP_SLOTS.RightHand] = { group: 'Weapons', templateIndex: WEAPONS.Longsword };
        entity.equip.slots[EQUIP_SLOTS.LeftHand] = { group: 'Armor', templateIndex: 100 };
        const seeded = seedTestRaceQuickStart(entity, { level: lvl });
        assert.equal(seeded.level, lvl);
        assert.equal(entity.health, entity.maxHealth);
        assert.equal(entity.magicka, entity.maxMagicka);
        assert.equal(entity.fatigue, maxFatigue(entity));
        assert.equal(entity.equip.slots[EQUIP_SLOTS.LeftHand], null);
        assert.ok(entity.items.some((it) => isHandWraps(it)));
        assert.ok(entity.items.some((it) => it.templateIndex === 247));
        assert.ok(entity.spells.some((sp) => /fireball/i.test(sp.name)));
        assert.ok(entity.spells.some((sp) => /shield/i.test(sp.name)));
        assert.ok(entity.spells.some((sp) => /open/i.test(sp.name)));
        const audit = auditRacialOverhaulState(entity);
        assert.deepEqual(audit.anomalies, [], `${tpl.key} L${lvl} anomalies: ${audit.anomalies.join(',')}`);
      }
    }
    assert.equal(testRacePresetOf('race-Khajiit-10')?.race, 'Khajiit');
  });

  it('passes runAllRacesMatrixAudit(10) and integrates with session, combat, timeline loggers, and raceaudit console command', () => {
    const matrix = runAllRacesMatrixAudit(10);
    assert.equal(matrix.ok, true);
    assert.equal(matrix.passed, 8);
    assert.equal(matrix.total, 8);

    clearTimeline();
    const prevSnapshotRace = { race: playerEntity.race, raceId: playerEntity.raceId, level: playerEntity.level, health: playerEntity.health, maxHealth: playerEntity.maxHealth, magicka: playerEntity.magicka, maxMagicka: playerEntity.maxMagicka, fatigue: playerEntity.fatigue };
    try {
      playerEntity.race = 'Nord';
      playerEntity.raceId = RACES.Nord;
      playerEntity.level = 10;
      defineLiveMaxHealth(playerEntity);
      defineLiveMaxMagicka(playerEntity);
      computeEntityMods(playerEntity);
      playerEntity.health = playerEntity.maxHealth;
      playerEntity.magicka = playerEntity.maxMagicka;
      playerEntity.fatigue = maxFatigue(playerEntity);

      const snap = buildDiagnosticSnapshot('test-racial-audit');
      assert.equal(snap.player.raceId, RACES.Nord);
      assert.ok(snap.systems.racialOverhaul);
      assert.equal(snap.systems.racialOverhaul.race, 'Nord');

      const encBefore = recordAttackResolution({
        attacker: playerEntity,
        target: { isPlayer: false, name: 'Orc', health: 50, maxHealth: 50 },
        weapon: { name: 'Battle Axe', templateIndex: WEAPONS.Battle_Axe, material: 1 },
        damage: 12,
        hit: true,
        diag: { toHitParts: { racialToHit: 5 }, damage: { rawDamage: 12, racialDamageMod: 3, modsApplied: [] } },
      });
      assert.equal(encBefore, undefined);
      const dumped = dumpCombatLog('test-racial-combat');
      assert.equal(dumped.configMatrix.gameplay.racialOverhaul, true);
      assert.equal(dumped.combatants.player.raceId, RACES.Nord);
      assert.equal(dumped.events[0].toHit.racialToHit, 5);
      assert.equal(dumped.events[0].damage.racialDamageMod, 3);

      // Toggle listener emits RACIAL_OVERHAUL_TOGGLED
      setPref(RACIAL_OVERHAUL_PREF, false);
      setPref(RACIAL_OVERHAUL_PREF, true);
      // restorePlayer emits RACIAL_SAVE_RESTORED
      const saveSnap = snapshotPlayer(playerEntity, {});
      restorePlayer(playerEntity, saveSnap);
      const events = getRecentTimelineEvents(20).map((e) => e.event);
      assert.ok(events.includes('RACIAL_OVERHAUL_TOGGLED'));
      assert.ok(events.includes('RACIAL_SAVE_RESTORED'));

      const cmdAll = executeConsoleLine('raceaudit all 10');
      assert.match(cmdAll, /8\/8 PASS/);
    } finally {
      Object.assign(playerEntity, prevSnapshotRace);
    }
  });
});

describe('Racial Overhaul Stage-3 regression fixes', () => {
  beforeEach(() => {
    installRacialOverhaul();
    resetPrefs();
    setPref(RACIAL_OVERHAUL_PREF, true);
  });

  afterEach(() => {
    resetPrefs();
    setPassiveSpecialsHost(null);
  });

  it('seedTestRaceQuickStart gives a lightweight, warm, unencumbered kit across all 8 races at L1 and L10', () => {
    for (const tpl of RACE_TEMPLATES) {
      for (const lvl of [1, 10]) {
        const e = {
          isPlayer: true,
          raceId: tpl.id,
          race: tpl.key,
          gender: tpl.id === RACES.WoodElf ? 'female' : 'male',
          level: 1,
          stats: { strength: 55, intelligence: 55, willpower: 50, agility: 50, endurance: 55, personality: 50, speed: 50, luck: 50 },
          skills: new Array(35).fill(35),
          skillUses: new Array(35).fill(0),
          career: { name: 'Spellsword', abilityFlagsAndSpellPointsBitfield: 0x1000, hitPointsPerLevel: 12 },
          items: [],
          equip: createEquipTable(),
          activeEffects: [],
          reactionMods: new Array(11).fill(0),
          rawMaxHealth: 40,
          maxHealth: 40,
          chargenDone: true,
        };
        const info = seedTestRaceQuickStart(e, { level: lvl });
        const maxEnc = entityMaxEncumbrance(e);
        const load = carriedWeight(e);
        assert.ok(load < maxEnc * 0.75, `${tpl.key} L${lvl} load=${load} should be < 75% of ${maxEnc}`);
        assert.equal(info.weightKg, load);
        assert.ok(e.equip.slots[EQUIP_SLOTS.RightHand], `${tpl.key} RightHand equipped`);
        assert.equal(e.equip.slots[EQUIP_SLOTS.LeftHand], null, `${tpl.key} LeftHand empty`);
        assert.ok(e.equip.slots[EQUIP_SLOTS.Cloak1] || e.equip.slots[EQUIP_SLOTS.Cloak2], `${tpl.key} warm cloak equipped`);
        assert.equal(e.health, e.maxHealth);
        assert.equal(e.magicka, e.maxMagicka);
        assert.equal(e.fatigue, maxFatigue(e));
      }
    }
  });

  it('raceaudit / verifyRacialSaveRoundTrip dryRun does NOT reset magic rounds or increment _restores', () => {
    const prevWorld = worldMinutes();
    try {
      const now = 250000;
      setWorldMinutes(now);
      resetMagicRoundMarker(now);
      const restoresBefore = restoresSoFar();

      const e = {
        isPlayer: true,
        raceId: RACES.DarkElf,
        race: 'DarkElf',
        level: 10,
        stats: { strength: 60, intelligence: 60, willpower: 50, agility: 50, endurance: 60, personality: 50, speed: 50, luck: 50 },
        skills: new Array(35).fill(35),
        skillUses: new Array(35).fill(0),
        career: { name: 'Spellsword', abilityFlagsAndSpellPointsBitfield: 0x1000, hitPointsPerLevel: 12 },
        items: [],
        equip: createEquipTable(),
        activeEffects: [],
        reactionMods: new Array(11).fill(0),
        rawMaxHealth: 112,
        maxHealth: 112,
        health: 112,
        magicka: 90,
        fatigue: 7680,
        chargenDone: true,
      };
      defineLiveMaxHealth(e);
      defineLiveMaxMagicka(e);
      computeEntityMods(e);

      const rt = verifyRacialSaveRoundTrip(e);
      assert.equal(rt.ok, true);
      const matrix = runAllRacesMatrixAudit(10);
      assert.equal(matrix.ok, true);

      assert.equal(restoresSoFar(), restoresBefore, 'dryRun must not increment _restores');
      assert.equal(claimMagicRounds(now, now).rounds, 0, 'dryRun must not trigger catch-up magic rounds');
    } finally {
      setWorldMinutes(prevWorld);
      resetMagicRoundMarker(Math.floor(prevWorld));
    }
  });

  it('Argonian Hist Regen restores +2% maxFatigue every round and +1 HP every 2nd round in water or rain', () => {
    const e = {
      isPlayer: true,
      raceId: RACES.Argonian,
      race: 'Argonian',
      level: 5,
      stats: { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 },
      skills: new Array(35).fill(30),
      career: { name: 'Warrior', abilityFlagsAndSpellPointsBitfield: 0, hitPointsPerLevel: 10 },
      items: [],
      equip: createEquipTable(),
      activeEffects: [],
      rawMaxHealth: 60,
      maxHealth: 60,
      health: 40,
      magicka: 20,
      fatigue: 100,
    };
    defineLiveMaxHealth(e);
    computeEntityMods(e);

    let healed = 0;
    let fatRestored = 0;
    const sinks = {
      heal: (n) => { healed += n; },
      restoreFatigue: (n) => { fatRestored += n; },
    };

    // Dry: no regen
    setPassiveSpecialsHost({ isSwimming: () => false, inWater: () => false, isRaining: () => false });
    passiveSpecialsMagicRound(e, { nowMinutes: 1, clockMinutes: 500, sinks });
    passiveSpecialsMagicRound(e, { nowMinutes: 2, clockMinutes: 500, sinks });
    assert.equal(healed, 0);
    assert.equal(fatRestored, 0);

    // Wading / exterior water (inWater: true, isSwimming: false): fat every round, HP every 2nd round
    setPassiveSpecialsHost({ isSwimming: () => false, inWater: () => true, isRaining: () => false });
    passiveSpecialsMagicRound(e, { nowMinutes: 1, clockMinutes: 500, sinks });
    assert.equal(healed, 0);
    assert.equal(fatRestored, Math.trunc(maxFatigue(e) * 0.02));
    passiveSpecialsMagicRound(e, { nowMinutes: 2, clockMinutes: 500, sinks });
    assert.equal(healed, 1);
    assert.equal(fatRestored, Math.trunc(maxFatigue(e) * 0.02) * 2);

    // Verify worldModes.js checks both player?.isPlayerSwimming and player?.onExteriorWater
    const wmSrc = fs.readFileSync(path.resolve('src/scenes/worldModes.js'), 'utf8');
    assert.match(wmSrc, /player\?\.isPlayerSwimming/);
    assert.match(wmSrc, /player\?\.onExteriorWater && player\.onExteriorWater !== 'None'/);
  });

  it('Live toggle ON/OFF updates maxHealth (Nord), maxMagicka (HighElf), maxFatigue (Redguard) without reload', async () => {
    const { playerEntity } = await import('../../src/characters/playerEntity.js');
    const saved = { ...playerEntity, stats: { ...playerEntity.stats } };
    try {
      clearTimeline();
      playerEntity.isPlayer = true;
      playerEntity.chargenDone = true;
      playerEntity.stats = { strength: 60, intelligence: 60, willpower: 50, agility: 50, endurance: 60, personality: 50, speed: 50, luck: 50 };
      playerEntity.skills = new Array(35).fill(35);
      playerEntity.career = { name: 'Spellsword', abilityFlagsAndSpellPointsBitfield: 0x1000, hitPointsPerLevel: 12 };
      playerEntity.equip = createEquipTable();
      playerEntity.items = [];
      playerEntity.activeEffects = [];
      playerEntity.rawMaxHealth = 100;
      defineLiveMaxHealth(playerEntity);
      defineLiveMaxMagicka(playerEntity);

      // Nord: maxHealth changes live
      playerEntity.raceId = RACES.Nord;
      playerEntity.race = 'Nord';
      computeEntityMods(playerEntity);
      playerEntity.health = playerEntity.maxHealth;
      const nordOnHp = playerEntity.maxHealth;
      setPref(RACIAL_OVERHAUL_PREF, false);
      const nordOffHp = playerEntity.maxHealth;
      assert.ok(nordOnHp > nordOffHp, `Nord maxHealth ${nordOnHp} > ${nordOffHp}`);
      const tl = getRecentTimelineEvents(5).find((ev) => ev.event === 'RACIAL_OVERHAUL_TOGGLED');
      assert.ok(tl && tl.data.maxHpBefore === nordOnHp && tl.data.maxHpAfter === nordOffHp);
      setPref(RACIAL_OVERHAUL_PREF, true);
      assert.equal(playerEntity.maxHealth, nordOnHp);

      // HighElf: maxMagicka changes live
      playerEntity.raceId = RACES.HighElf;
      playerEntity.race = 'HighElf';
      computeEntityMods(playerEntity);
      const heOnMp = playerEntity.maxMagicka;
      setPref(RACIAL_OVERHAUL_PREF, false);
      const heOffMp = playerEntity.maxMagicka;
      assert.ok(heOnMp > heOffMp, `HighElf maxMagicka ${heOnMp} > ${heOffMp}`);
      setPref(RACIAL_OVERHAUL_PREF, true);
      assert.equal(playerEntity.maxMagicka, heOnMp);

      // Redguard: maxFatigue changes live
      playerEntity.raceId = RACES.Redguard;
      playerEntity.race = 'Redguard';
      computeEntityMods(playerEntity);
      const rgOnFat = maxFatigue(playerEntity);
      setPref(RACIAL_OVERHAUL_PREF, false);
      const rgOffFat = maxFatigue(playerEntity);
      assert.ok(rgOnFat > rgOffFat, `Redguard maxFatigue ${rgOnFat} > ${rgOffFat}`);
    } finally {
      Object.assign(playerEntity, saved);
    }
  });

  it('sessionLogger has no duplicate unload listeners and diagnosticsManager guards exit flushes', () => {
    const slSrc = fs.readFileSync(path.resolve('src/systems/diagnostics/sessionLogger.js'), 'utf8');
    const dmSrc = fs.readFileSync(path.resolve('src/systems/diagnostics/diagnosticsManager.js'), 'utf8');
    assert.doesNotMatch(slSrc, /addEventListener\(['"](beforeunload|pagehide)['"]/);
    assert.match(dmSrc, /_exitFlushed/);
    assert.match(dmSrc, /playerEntity\?\.chargenDone/);
  });
});
