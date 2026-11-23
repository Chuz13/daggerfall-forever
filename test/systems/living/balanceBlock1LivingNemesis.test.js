// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { heroThreatOf } from '../../../src/systems/heroThreat.js';
import { setPref, _resetForTests } from '../../../src/systems/uiPrefs.js';
import { equipAdventurerEntity } from '../../../src/systems/living/adventurerGear.js';
import { equipItem, equipTableOf, EQUIP_SLOTS } from '../../../src/systems/equip.js';
import { ARMOR_ENUM, armorOfMaterial } from '../../../src/combat/enemyEquipment.js';
import { createNemesisHunter, NEMESIS_ARCHETYPES } from '../../../src/systems/living/nemesisHost.js';
import { buildLivingSiteBlueprint, LIVING_SITE_KINDS } from '../../../src/systems/living/livingWorldSpawner.js';
import { resetLivingConfig } from '../../../src/systems/living/livingConfig.js';
import { restoreLivingSaveData } from '../../../src/systems/living/livingDirector.js';

test('Block 1: heroThreatOf respects ignoreLootRarity bypass for LT/Nemesis scaling', () => {
  _resetForTests();
  setPref('lootRarity', false);
  const player = { level: 15, renown: 25 };
  assert.equal(heroThreatOf(player), null, 'vanilla gate off when LootRarity is false');
  const forced = heroThreatOf(player, { ignoreLootRarity: true });
  assert.ok(forced && forced.damage > 1 && forced.health > 1, 'LT/Nemesis bypasses LootRarity off');
  _resetForTests();
});

test('Block 1: equipAdventurerEntity replace mode clears prior gear and syncs entity.weapon', () => {
  const oldSword = { name: 'Old Iron Dagger', group: 'Weapons', templateIndex: 118 };
  const oldHelm = armorOfMaterial(ARMOR_ENUM.Helm, 0);
  const entity = {
    items: [oldSword, oldHelm],
    armorValues: new Array(7).fill(0),
    weapon: oldSword,
    maxHealth: 100,
    health: 100,
  };
  equipItem(entity, oldSword, EQUIP_SLOTS.RightHand);
  equipItem(entity, oldHelm);

  equipAdventurerEntity(
    entity,
    { name: 'Valen', className: 'Warrior', level: 14, gearTier: 4, gender: 'male' },
    12,
    () => 0.4,
    { replace: true },
  );

  assert.ok(!entity.items.includes(oldSword), 'old weapon removed');
  assert.ok(!entity.items.includes(oldHelm), 'old armor removed');
  const table = equipTableOf(entity);
  const mainHand = table[EQUIP_SLOTS.RightHand] ?? table[EQUIP_SLOTS.LeftHand];
  assert.ok(mainHand, 'new weapon equipped in equipTable');
  assert.equal(entity.weapon, mainHand, 'entity.weapon synced to equipped main-hand weapon');
});

test('Block 1: createNemesisHunter scales level, tier, hpMult, damageMult, and bossTraitCount', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const t1 = createNemesisHunter(4, { archetype: NEMESIS_ARCHETYPES.BOUNTY_HUNTER });
  assert.equal(t1.level, 6);
  assert.equal(t1.tier, 1);
  assert.equal(t1.hpMult, 1.8);
  assert.equal(t1.damageMult, 1.35);
  assert.equal(t1.bossTraitCount, 1);

  const t2 = createNemesisHunter(12, { archetype: NEMESIS_ARCHETYPES.GLORY_CHALLENGER });
  assert.equal(t2.level, 14);
  assert.equal(t2.tier, 2);
  assert.equal(t2.hpMult, 2.3);
  assert.equal(t2.damageMult, 1.55);
  assert.equal(t2.bossTraitCount, 2);

  const t3 = createNemesisHunter(20, { archetype: NEMESIS_ARCHETYPES.ARCANE_RIVAL });
  assert.equal(t3.level, 22);
  assert.equal(t3.tier, 3);
  assert.equal(t3.hpMult, 2.8);
  assert.equal(t3.damageMult, 1.75);
  assert.equal(t3.bossTraitCount, 2);
});

test('Block 1: buildLivingSiteBlueprint emits elite, champion, threat, and Nemesis flags across LT sites', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();
  const baseArgs = {
    centerX: 0,
    centerZ: 0,
    heightAt: () => 0,
    regionIndex: 17,
    playerEntity: { level: 12, goldPieces: 5000, skills: {} },
    nowMinutes: 1000,
    rng: () => 0.4,
  };

  const nemBp = buildLivingSiteBlueprint({ ...baseArgs, kind: LIVING_SITE_KINDS.NEMESIS_AMBUSH });
  const nemLeader = nemBp.actors.find((a) => a.role === 'nemesis_leader');
  assert.ok(nemLeader, 'nemesis leader present');
  assert.equal(nemLeader.eliteFoe, true);
  assert.equal(nemLeader.allowThreatScaling, true);
  assert.ok(Array.isArray(nemLeader.forcedBossTraits) && nemLeader.forcedBossTraits.length === 2);
  assert.equal(nemLeader.hpMult, 2.3);
  assert.equal(nemLeader.damageMult, 1.55);

  const campBp = buildLivingSiteBlueprint({ ...baseArgs, kind: LIVING_SITE_KINDS.BANDIT_CAMP });
  const campLeader = campBp.actors.find((a) => a.skirmishLeader);
  assert.ok(campLeader?.eliteFoe && campLeader?.allowThreatScaling && campLeader?.allowChampionRoll);

  const cpBp = buildLivingSiteBlueprint({ ...baseArgs, kind: LIVING_SITE_KINDS.CHECKPOINT });
  const cpCap = cpBp.actors.find((a) => a.skirmishLeader);
  assert.ok(cpCap?.eliteFoe && cpCap?.allowThreatScaling);

  const urbBp = buildLivingSiteBlueprint({ ...baseArgs, kind: LIVING_SITE_KINDS.URBAN_SKIRMISH });
  if (urbBp && urbBp.actors.length > 0) {
    assert.ok(urbBp.actors.some((a) => a.skirmishLeader && a.allowThreatScaling));
  }
});

test('Block 1: exteriorFoes.js and world.js wire Nemesis corpse loot, skirmish leader HP floor, and encounter commands', () => {
  const src = readFileSync(new URL('../../../src/scenes/exteriorFoes.js', import.meta.url), 'utf8');
  assert.match(src, /f\._nemesisRecord \|\| f\.livingRole === 'wandering_adventurer'.*nemesis_leader/);
  assert.match(src, /f\.entity\?\.skirmishNeutralToPlayer.*skirmishLeader/);
  assert.match(src, /allowThreatScaling = false, allowEliteRoll = false, allowChampionRoll = false/);

  const worldSrc = readFileSync(new URL('../../../src/scenes/world.js', import.meta.url), 'utf8');
  assert.match(worldSrc, /targetKind === 'nemesis'/);
  assert.match(worldSrc, /targetKind === 'skirmish'/);
  assert.match(worldSrc, /targetKind === 'checkpoint'/);
});
