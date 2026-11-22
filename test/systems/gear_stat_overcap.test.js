import { test } from 'node:test';
import assert from 'node:assert/strict';

import { executeConsoleLine } from '../../src/systems/consoleCommands.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { createEquipTable } from '../../src/characters/equipTable.js';
import { armorOfMaterial, weaponOfMaterial } from '../../src/combat/enemyEquipment.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { setItemFields, mintCondition } from '../../src/systems/item/itemTemplates.js';
import { equipItem, unequipItem } from '../../src/systems/equip.js';
import { computeEntityMods, registerEntityFold } from '../../src/systems/entityMods.js';
import { liveStat, MAX_STAT_VALUE, STAT_KEYS_ORDER } from '../../src/systems/statMods.js';
import { applyRarity, legendaryById, setGem } from '../../src/systems/loot/lootRarity.js';
import { AETHERIC_RECORDS, mintAetheric } from '../../src/systems/aetheric.js';
import { setPref, resetPrefs } from '../../src/systems/uiPrefs.js';
import { applySpell } from '../../src/systems/effects.js';
import { installRacialOverhaul } from '../../src/systems/racialOverhaul.js';
import { RACES } from '../../src/systems/races.js';
import { martialFold } from '../../src/systems/martialPowers.js';
import { choosePath, PATH_BY_ID } from '../../src/systems/arcanePaths.js';
import { pathFold } from '../../src/systems/arcanePowers.js';
import { chooseMartialPath } from '../../src/systems/martialPaths.js';
import { setSigilOnline, setSigilRenown, _resetSigilForTests } from '../../src/systems/sigil/sigil.js';
import { festiveMods } from '../../src/systems/seatEdicts.js';
import { setFold } from '../../src/systems/sigil/sigilSetPowers.js';
import { swingTempo, swingHeft } from '../../src/characters/weaponStates.js';
import { speedCastRate } from '../../src/systems/castSpeed.js';
import { pcaaoCriticalStrike } from '../../src/combat/pcaao.js';
import { criticalModel } from '../../src/combat/combatStats.js';
import { pvpSpellCrit } from '../../src/combat/pvpSpellCrit.js';
import { SKILLS } from '../../src/systems/skills.js';

function makeHero(statsOverrides = {}, extra = {}) {
  const stats = Object.fromEntries(STAT_KEYS_ORDER.map((k) => [k, 100]));
  Object.assign(stats, statsOverrides);
  const e = {
    isPlayer: true,
    raceId: RACES.Breton,
    level: 20,
    stats,
    skills: new Array(35).fill(100),
    items: [],
    equip: createEquipTable(),
    activeEffects: [],
    ...extra,
  };
  computeEntityMods(e);
  return e;
}

const makeRing = () =>
  mintCondition(setItemFields({ group: 'Jewellery', templateIndex: 135, material: 0, flags: 0, variant: 0, message: 0, stackCount: 1 }));

test('Gear stat affixes (Legendary, Aetheric, socketed Gem) lift liveStat past 100 and stack over console base > 100', () => {
  resetPrefs();
  setPref('lootRarity', true);
  try {
    const hero = makeHero({ strength: 100, agility: 100, speed: 120 });

    const titanheart = applyRarity(armorOfMaterial(102, ARMOR_MATERIAL.Daedric), 'legendary', Math.random, [legendaryById('titanheart')]);
    titanheart.isIdentified = true; // +15 strength

    const pauldron = mintAetheric(AETHERIC_RECORDS.find((r) => r.id === 'ruhn-left-pauldron'), { party: 1 });
    pauldron.isIdentified = true; // +15 agility

    const ring = makeRing();
    ring.rarity = 'rare';
    ring.isIdentified = true;
    ring.affixes = [{ id: 'stat', param: 'speed', value: 10 }];

    const sword = weaponOfMaterial(122, 9); // Claymore
    sword.rarity = 'magic';
    sword.isIdentified = true;
    sword.affixes = [];
    sword.sockets = ['empty'];
    setGem(sword, 'perfect-malachite'); // +8 strength from perfect malachite

    hero.items.push(titanheart, pauldron, ring, sword);
    equipItem(hero, titanheart);
    equipItem(hero, pauldron);
    equipItem(hero, ring);
    equipItem(hero, sword);

    assert.equal(liveStat(hero, 'strength'), 123, '100 base + 15 Titanheart + 8 Malachite');
    assert.equal(liveStat(hero, 'agility'), 115, '100 base + 15 Aetheric Pauldron');
    assert.equal(liveStat(hero, 'speed'), 130, '120 console base + 10 Ring');

    unequipItem(hero, titanheart);
    assert.equal(liveStat(hero, 'strength'), 108, 'unequipping Titanheart drops back to 108');
  } finally {
    resetPrefs();
  }
});

test('2-piece Sigil Set fold lifts statMax past 100 when awake', () => {
  resetPrefs();
  _resetSigilForTests();
  setSigilOnline(true);
  setSigilRenown(1);
  try {
    const hero = makeHero({ endurance: 100 });
    const mkSetPiece = (tpl) => {
      const it = mintCondition(setItemFields({ group: 'Armor', templateIndex: tpl, material: ARMOR_MATERIAL.Daedric, flags: 0, variant: 0, message: 0, stackCount: 1 }));
      it.rarity = 'legendary';
      it.isIdentified = true;
      it.sigil = { power: 10, party: 1, xp: 0, set: 'malacath' };
      return it;
    };
    const p1 = mkSetPiece(102);
    const p2 = mkSetPiece(104);
    hero.items.push(p1, p2);
    equipItem(hero, p1);
    equipItem(hero, p2);

    const m = setFold(hero);
    assert.ok((m.stats?.endurance ?? 0) > 0, 'Malacath 2pc grants endurance');
    assert.equal(m.statMax?.endurance, m.stats.endurance, 'setFold lifts statMax by the same amount');
    assert.equal(liveStat(hero, 'endurance'), 100 + m.stats.endurance);
  } finally {
    _resetSigilForTests();
    resetPrefs();
  }
});

test('Passives (Khajiit, Martial, Arcane, Festive) lift statMax past 100', () => {
  resetPrefs();
  installRacialOverhaul();
  setPref('racialOverhaul', true);
  try {
    const khajiit = makeHero({ speed: 100, agility: 100 }, { raceId: RACES.Khajiit });
    assert.equal(liveStat(khajiit, 'speed'), 105);
    assert.equal(liveStat(khajiit, 'agility'), 105);

    const shadowdancer = makeHero(
      { agility: 100 },
      {
        _online: true,
        masterSkills: true,
        masteredSkills: [SKILLS.ShortBlade, SKILLS.HandToHand],
      },
    );
    shadowdancer.skills[SKILLS.ShortBlade] = 150;
    shadowdancer.skills[SKILLS.HandToHand] = 150;
    assert.equal(chooseMartialPath(shadowdancer, 'shadowdancer').ok, true);
    computeEntityMods(shadowdancer);
    const mf = martialFold(shadowdancer);
    assert.equal(mf.statMax.agility, mf.stats.agility);
    assert.equal(liveStat(shadowdancer, 'agility'), 100 + mf.stats.agility);

    const enchanterSchools = PATH_BY_ID.enchanter.schools;
    const enchanter = makeHero(
      { personality: 100 },
      {
        _online: true,
        masterSkills: true,
        masteredSkills: [...enchanterSchools],
      },
    );
    for (const s of enchanterSchools) enchanter.skills[s] = 150;
    assert.equal(choosePath(enchanter, 'enchanter').ok, true);
    computeEntityMods(enchanter);
    const af = pathFold(enchanter);
    assert.equal(af.statMax.personality, af.stats.personality);
    assert.equal(liveStat(enchanter, 'personality'), 100 + af.stats.personality);

    const fest = festiveMods(STAT_KEYS_ORDER);
    assert.equal(fest.statMax.luck, fest.stats.luck);
    registerEntityFold('test-festive', () => fest);
    const festHero = makeHero({ luck: 100 });
    assert.equal(liveStat(festHero, 'luck'), 100 + fest.stats.luck);
    registerEntityFold('test-festive', null);
  } finally {
    resetPrefs();
  }
});

test('Classic Fortify Attribute (spell & Cast-When-Held item) stays capped at 100', () => {
  const hero = makeHero({ strength: 100 });
  const spell = {
    effects: [{
      type: 9,
      subType: 0, // strength
      durationBase: 10,
      durationMod: 0,
      durationPerLevel: 1,
      magnitudeBaseLow: 15,
      magnitudeBaseHigh: 15,
      magnitudeLevelBase: 0,
      magnitudeLevelHigh: 0,
      magnitudePerLevel: 1,
    }],
  };
  applySpell(spell, 10, hero, {}, () => 0.5, { entity: hero }, { bypassSavingThrows: true, heldItem: makeRing() });
  assert.equal(hero.activeEffects.length, 1);
  assert.equal(liveStat(hero, 'strength'), MAX_STAT_VALUE);
});

test('Hidden 100 clamps remain preserved in swingTempo, swingHeft, and speedCastRate', () => {
  assert.equal(swingTempo(150), swingTempo(100));
  assert.equal(swingHeft(5, 150), swingHeft(5, 100));
  assert.equal(speedCastRate(150), speedCastRate(100));
});

test('Luck >= 150 crit formulas never divide by zero or collapse to negative', () => {
  for (const luck of [100, 150, 175, 200]) {
    const hero = makeHero({ luck });
    const cm = criticalModel(hero, { overhaul: true, modules: { criticalStrikesIncreaseDamage: true } });
    assert.ok(Number.isFinite(cm.chance) && cm.chance > 0 && cm.chance <= 1, `criticalModel luck=${luck}: ${cm.chance}`);

    const pvp = pvpSpellCrit(hero);
    assert.ok(Number.isFinite(pvp.chance) && pvp.chance > 0 && pvp.chance <= 1, `pvpSpellCrit luck=${luck}: ${pvp.chance}`);

    assert.equal(pcaaoCriticalStrike(hero, () => 0), true, `pcaaoCriticalStrike should hit at roll 0 for luck=${luck}`);
  }
});

test('Console command give_stat_gear spawns identified stat gear that lifts liveStat > 100', () => {
  resetPrefs();
  setPref('lootRarity', true);
  try {
    playerEntity.items = [];
    playerEntity.equip = createEquipTable();
    playerEntity.stats = Object.fromEntries(STAT_KEYS_ORDER.map((k) => [k, 100]));
    computeEntityMods(playerEntity);

    const singleMsg = executeConsoleLine('give_stat_gear luck 15');
    assert.ok(singleMsg.includes('Added Ring of Luck (+15)'), singleMsg);
    assert.equal(playerEntity.items.length, 1);
    const ring = playerEntity.items[0];
    assert.equal(ring.isIdentified, true);
    equipItem(playerEntity, ring);
    assert.equal(liveStat(playerEntity, 'luck'), 115);

    playerEntity.items = [];
    playerEntity.equip = createEquipTable();
    const kitMsg = executeConsoleLine('give_stat_gear');
    assert.ok(kitMsg.includes('Added 10-piece Stat Overcap QA Kit'), kitMsg);
    assert.equal(playerEntity.items.length, 10);
    for (const it of [...playerEntity.items]) equipItem(playerEntity, it);
    assert.deepEqual(
      {
        strength: liveStat(playerEntity, 'strength'),
        intelligence: liveStat(playerEntity, 'intelligence'),
        willpower: liveStat(playerEntity, 'willpower'),
        agility: liveStat(playerEntity, 'agility'),
        endurance: liveStat(playerEntity, 'endurance'),
        personality: liveStat(playerEntity, 'personality'),
        speed: liveStat(playerEntity, 'speed'),
        luck: liveStat(playerEntity, 'luck'),
      },
      {
        strength: 142,
        intelligence: 115,
        willpower: 127,
        agility: 115,
        endurance: 112,
        personality: 115,
        speed: 125,
        luck: 115,
      },
    );
  } finally {
    resetPrefs();
  }
});
