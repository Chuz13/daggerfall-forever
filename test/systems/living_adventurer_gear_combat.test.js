import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  rollTierWithVariance,
  getWeaponMaterialForTier,
  getArmorMaterialForTier,
  areArtifactsSlotCompatible,
  equipAdventurerEntity,
  applyAdventurerCorpseLoot,
  LIVING_ADVENTURER_LOOT,
} from '../../src/systems/living/adventurerGear.js';
import {
  getRegionalDungeonDescriptor,
  calculateDelveOutcome,
  setAdventurerLevel,
  killAdventurerInDungeon,
  tickAdventurerSimulation,
  getAdventurerSimRegistry,
  resolveWanderingAdventurerInteraction,
  ADVENTURER_STATUS,
} from '../../src/systems/living/adventurerSim.js';
import { equipTableOf } from '../../src/systems/equip.js';
import { executeLivingConsoleCommand } from '../../src/systems/living/livingWorldSpawner.js';

describe('Living Tamriel Adventurer Gear & Combat Systems', () => {
  it('rollTierWithVariance bounds tiers between 1 and 9', () => {
    for (let t = 1; t <= 9; t++) {
      for (let i = 0; i < 20; i++) {
        const rolled = rollTierWithVariance(t, () => Math.random());
        assert.ok(rolled >= 1 && rolled <= 9, `Rolled tier ${rolled} out of bounds for base ${t}`);
      }
    }
  });

  it('materials map to valid DFU constants across tiers', () => {
    assert.equal(getWeaponMaterialForTier(1), 0); // Iron
    assert.equal(getWeaponMaterialForTier(2), 1); // Steel
    assert.equal(getWeaponMaterialForTier(3), 2); // Silver
    assert.equal(getWeaponMaterialForTier(9), 9); // Daedric

    assert.equal(getArmorMaterialForTier(1, () => 0.1), 0); // Leather
    assert.equal(getArmorMaterialForTier(1, () => 0.9), 0x0200); // Iron Plate
    assert.equal(getArmorMaterialForTier(9), 0x0200 + 9); // Daedric Plate
  });

  it('areArtifactsSlotCompatible prevents impossible loadouts', () => {
    // Identical artifacts are disallowed
    assert.equal(areArtifactsSlotCompatible(14, 14), false);
    // Two-handed weapon (Chrysamere 14) cannot equip alongside shield (Auriel's Shield 19)
    assert.equal(areArtifactsSlotCompatible(14, 19), false);
    // Two-handed weapon (Volendrung 10) cannot equip alongside 1H weapon (Mehrunes Razor 1)
    assert.equal(areArtifactsSlotCompatible(10, 1), false);
    // Two cuirasses (Lord's Mail 15 and Ebony Mail 18) collide
    assert.equal(areArtifactsSlotCompatible(15, 18), false);
    // Two shields collide
    assert.equal(areArtifactsSlotCompatible(19, 20), false);
    // Two rings are compatible
    assert.equal(areArtifactsSlotCompatible(3, 8), true);
    // 1H weapon and Shield are compatible
    assert.equal(areArtifactsSlotCompatible(1, 19), true);
    // Cuirass and Ring are compatible
    assert.equal(areArtifactsSlotCompatible(15, 3), true);
  });

  it('equipAdventurerEntity populates items, equipTableOf and gold', () => {
    const entity = { items: [], maxHealth: 100, health: 100 };
    const adv = {
      id: 101,
      name: 'Ragnor Iron-Heart',
      className: 'Warrior',
      level: 15,
      gearTier: 3,
      gender: 'male',
    };

    equipAdventurerEntity(entity, adv, 10, () => 0.5);

    assert.ok(Array.isArray(entity.items));
    assert.ok(entity.items.length >= 7, 'Expected full set of humanoid gear');
    assert.ok(typeof entity.goldPieces === 'number' && entity.goldPieces > 0);

    const slots = equipTableOf(entity);
    assert.ok(slots, 'equipTableOf exists for 3D body renderer');
    assert.ok(slots.some((it) => it !== null), 'At least one slot is equipped');
  });

  it('applyAdventurerCorpseLoot enforces ZERO, SUPPLIES, STANDARD and FULL modes', () => {
    const baseItems = [
      { group: 'Weapons', templateIndex: 120, name: 'Longsword' },
      { group: 'Armor', templateIndex: 102, name: 'Cuirass' },
      { group: 'Consumables', isPotion: true, name: 'Healing Potion' },
      { group: 'Artifacts', artifact: true, name: 'Chrysamere' },
    ];

    // ZERO: empty corpse
    const eZero = { items: [...baseItems], goldPieces: 250 };
    applyAdventurerCorpseLoot(eZero, LIVING_ADVENTURER_LOOT.ZERO);
    assert.equal(eZero.items.length, 0);
    assert.ok(eZero.goldPieces <= 5);

    // SUPPLIES: consumables and gold stack
    const eSupplies = { items: [...baseItems], goldPieces: 250 };
    applyAdventurerCorpseLoot(eSupplies, LIVING_ADVENTURER_LOOT.SUPPLIES);
    assert.ok(eSupplies.items.some((it) => it.name === 'Healing Potion'));
    assert.ok(eSupplies.items.some((it) => it.isGold || it.stackCount != null));
    assert.ok(eSupplies.goldPieces <= 40);

    // STANDARD: humanoid loot guarantees 1 gear piece + artifacts + potion supplies + gold
    const eStandard = { items: [...baseItems], goldPieces: 250 };
    applyAdventurerCorpseLoot(eStandard, LIVING_ADVENTURER_LOOT.STANDARD, () => 0.10);
    assert.ok(eStandard.items.some((it) => it.artifact), 'Artifact dropped');
    assert.ok(eStandard.items.some((it) => it.group === 'Weapons' || it.group === 'Armor'), '1 piece of gear dropped');
    assert.ok(eStandard.items.some((it) => it.name === 'Healing Potion' || it.potionRecipeKey != null), 'Supplies potion dropped');
    assert.ok(eStandard.items.some((it) => it.isGold || it.stackCount != null), 'Gold stack dropped');
    assert.ok(eStandard.goldPieces >= 50 && eStandard.goldPieces <= 75, 'Modest gold bounded');

    // FULL: 100% droppable
    const eFull = { items: [...baseItems], goldPieces: 250 };
    applyAdventurerCorpseLoot(eFull, LIVING_ADVENTURER_LOOT.FULL);
    assert.ok(eFull.items.length >= baseItems.length);
    assert.ok(eFull.items.some((it) => it.isGold || it.stackCount != null));
    assert.equal(eFull.goldPieces, 250);
  });

  it('getRegionalDungeonDescriptor provides canonical and procedural descriptors', () => {
    const dagg0 = getRegionalDungeonDescriptor(17, 0);
    assert.equal(dagg0.name, "Privateer's Hold [Keep]");
    assert.equal(dagg0.type, "Keep");

    const wayrest0 = getRegionalDungeonDescriptor(23, 0);
    assert.equal(wayrest0.name, "Wayrest Sewers [Labyrinth]");

    const other = getRegionalDungeonDescriptor(5, 3);
    assert.ok(other.name.includes("Ruins"));
    assert.equal(other.type, "Ruin");
  });

  it('calculateDelveOutcome factors in traits and crises', () => {
    const advCautious = { level: 20, trait: 'CAUTIOUS' };
    const resCautious = calculateDelveOutcome(advCautious, 'Crypt', 'PEACE', 10, () => 0.99);
    // On failure, CAUTIOUS has only 5% demise chance
    assert.equal(resCautious.demiseChanceOnFail, 0.05);

    const advArrogant = { level: 20, trait: 'ARROGANT' };
    const resArrogant = calculateDelveOutcome(advArrogant, 'Crypt', 'PEACE', 10, () => 0.99);
    // On failure, ARROGANT has 50% demise chance
    assert.equal(resArrogant.demiseChanceOnFail, 0.50);

    const advCutthroat = { level: 20, trait: 'CUTTHROAT' };
    const resCutthroat = calculateDelveOutcome(advCutthroat, 'Ruin', 'PEACE', 10, () => 0.50);
    assert.ok(resCutthroat.baseSuccess > 0.90);
  });

  it('setAdventurerLevel updates level and gearTier', () => {
    const reg = getAdventurerSimRegistry();
    reg.pool = [
      { id: 42, name: 'Sven the Bold', level: 5, gearTier: 2, currentRegion: 17, status: ADVENTURER_STATUS.IDLE },
    ];

    const updated = setAdventurerLevel('Sven', 42);
    assert.ok(updated);
    assert.equal(updated.level, 42);
    assert.equal(updated.gearTier, 9);
  });

  it('killAdventurerInDungeon creates fallen remains and respawns newcomer', () => {
    const reg = getAdventurerSimRegistry();
    reg.pool = [
      { id: 99, name: 'Morgath', level: 12, gearTier: 3, currentRegion: 17, status: ADVENTURER_STATUS.DELVING, targetLocationId: 'dungeon_17_0' },
    ];
    const initialPoolLen = reg.pool.length;

    const killed = killAdventurerInDungeon(17);
    assert.ok(killed);
    assert.equal(killed.adventurer.name, 'Morgath');
    assert.ok(reg.fallenRemains['dungeon_17_0']);
    assert.equal(reg.fallenRemains['dungeon_17_0'][0].adventurerName, 'Morgath');

    // Ecosystem density preserved: new adventurer respawned!
    assert.equal(reg.pool.length, initialPoolLen + 1);
  });

  it('EXTORT_SPOILS generates canonical gem and gold without raw objects', () => {
    const player = { goldPieces: 50, items: [] };
    const adv = { id: 7, name: 'Toralf', level: 10, trait: 'CAUTIOUS' };

    const res = resolveWanderingAdventurerInteraction({
      adv,
      situation: 'TRAVELING_ON_ROAD',
      playerEntity: player,
      action: 'EXTORT_SPOILS',
      regionIndex: 17,
      rng: () => 0.05, // triggers success
    });

    assert.ok(res.outcome === 'EXTORTED_SPOILS');
    assert.ok(player.goldPieces > 50);
    assert.equal(player.items.length, 1);
    const gem = player.items[0];
    assert.equal(gem.group, 'Gems');
    assert.ok(typeof gem.value === 'number');
    assert.ok(Number.isFinite(gem.weightInKg));
  });

  it('executeLivingConsoleCommand supports setlevel, tick, kill_in_dungeon and list in game console', () => {
    const outSetLevel = executeLivingConsoleCommand(['adv', 'setlevel', '0', '45'], { regionIndex: 17 });
    assert.match(outSetLevel, /Updated .* to Level 45/);

    const outList = executeLivingConsoleCommand(['adv', 'list', '17'], { regionIndex: 17 });
    assert.match(outList, /Active Adventurers in Region 17/);
    assert.match(outList, /Lvl 45/);

    const outTick = executeLivingConsoleCommand(['adv', 'tick', '2'], { regionIndex: 17 });
    assert.match(outTick, /Simulated 2 day\(s\)/);

    const outSummon = executeLivingConsoleCommand(['adv', 'summon', '0'], { regionIndex: 17, sceneHost: { standBlueprint: () => {} } });
    assert.match(outSummon, /Summoned adventurer .* in front of you/);

    const outSummonByName = executeLivingConsoleCommand(['adv', 'summon', 'kaelen'], { regionIndex: 17, sceneHost: { standBlueprint: () => {} } });
    assert.match(outSummonByName, /Summoned adventurer/);
  });
});
