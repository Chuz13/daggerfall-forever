import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NECRO_GRIMOIRE_TEMPLATE,
  NECRO_GRIMOIRE_NAME,
  NECRO_GRIMOIRE_ROW,
  mintNecroGrimoire,
  isNecroGrimoire,
  readNecroGrimoire,
  getAllNecroSpells,
  rollLichGrimoire,
  LICH_GRIMOIRE_DROP_CHANCE,
  ANCIENT_LICH_GRIMOIRE_DROP_CHANCE,
} from '../../src/systems/necromancy/necroGrimoire.js';
import {
  animateDeadSpell,
  corpseExplosionSpell,
  lifeTapSpell,
  boneArmorSpell,
} from '../../src/systems/necromancy/necromanticSpells.js';
import { templateByIndex } from '../../src/systems/item/itemTemplates.js';
import { usableItem, useItem } from '../../src/systems/useItem.js';
import { snapshotPlayer, restorePlayer } from '../../src/systems/save/save.js';
import {
  spellMakerGroups,
  spellMakerSubgroups,
  isNecroEffect,
} from '../../src/systems/spell/spellEffects.js';
import { validateSpellPurchase } from '../../src/systems/spell/spellMaker.js';
import { getConsoleCommand } from '../../src/systems/consoleCommands.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { ENEMY_BASICS } from '../../src/characters/enemy/enemyBasics.js';
import { addEnemyLootExtras } from '../../src/systems/loot/loot.js';

test('NecroGrimoire 1 & 5: Item exists, has book art, lore-accurate name, and is usable (not classic readable book)', () => {
  assert.equal(NECRO_GRIMOIRE_TEMPLATE, 585);
  assert.equal(NECRO_GRIMOIRE_NAME, 'Grimoire of the Worm');
  assert.equal(NECRO_GRIMOIRE_ROW.worldTextureArchive, 209);
  assert.equal(NECRO_GRIMOIRE_ROW.worldTextureRecord, 0);

  const tpl = templateByIndex(585);
  assert.ok(tpl, 'Template 585 registered');
  assert.equal(tpl.name, 'Grimoire of the Worm');

  const item = mintNecroGrimoire();
  assert.equal(item.templateIndex, 585);
  assert.equal(item.group, 'MiscItems', 'Must not be in Books group so it does not trigger plain reader');
  assert.equal(isNecroGrimoire(item), true);
  assert.equal(usableItem(item), true, 'Must be usable in inventory');
});

test('NecroGrimoire 2 & 4: Drops from Lich and Ancient Lich loot tables, but not from other enemies', () => {
  // Test Lich drop roll
  const lichItems = [];
  const rolledLich = rollLichGrimoire(lichItems, MOBILE_TYPES.Lich, () => 0.1); // < 0.25
  assert.equal(rolledLich, true);
  assert.equal(lichItems.length, 1);
  assert.equal(isNecroGrimoire(lichItems[0]), true);

  // Test Ancient Lich drop roll
  const ancientItems = [];
  const rolledAncient = rollLichGrimoire(ancientItems, MOBILE_TYPES.AncientLich, () => 0.4); // < 0.50
  assert.equal(rolledAncient, true);
  assert.equal(ancientItems.length, 1);
  assert.equal(isNecroGrimoire(ancientItems[0]), true);

  // Test non-lich (Skeleton / Zombie / Rat) should NEVER drop it
  const otherItems = [];
  const rolledOther = rollLichGrimoire(otherItems, MOBILE_TYPES.SkeletalWarrior, () => 0.0);
  assert.equal(rolledOther, false);
  assert.equal(otherItems.length, 0);

  // Test addEnemyLootExtras with Lich basics
  const lichLoot = [];
  addEnemyLootExtras(lichLoot, ENEMY_BASICS[MOBILE_TYPES.Lich], () => 0.01);
  assert.ok(lichLoot.some(isNecroGrimoire), 'Lich must have Grimoire in extras on low roll');

  // Test addEnemyLootExtras with Ancient Lich basics
  const ancientLoot = [];
  addEnemyLootExtras(ancientLoot, ENEMY_BASICS[MOBILE_TYPES.AncientLich], () => 0.01);
  assert.ok(ancientLoot.some(isNecroGrimoire), 'Ancient Lich must have Grimoire in extras on low roll');

  // Test addEnemyLootExtras with Orc or Rat should NOT receive Grimoire
  const orcLoot = [];
  addEnemyLootExtras(orcLoot, ENEMY_BASICS[MOBILE_TYPES.Orc], () => 0.001);
  assert.ok(!orcLoot.some(isNecroGrimoire), 'Orc must never drop Grimoire');
});

test('NecroGrimoire 7: All 4 necromancy spells have tag "некро"', () => {
  const spells = [
    animateDeadSpell(),
    corpseExplosionSpell(),
    lifeTapSpell(),
    boneArmorSpell(),
  ];

  for (const sp of spells) {
    assert.equal(sp.tag, 'некро', `${sp.name} must have tag "некро"`);
    assert.ok(Array.isArray(sp.tags) && sp.tags.includes('некро'), `${sp.name} tags array must include "некро"`);
    assert.equal(sp.necro, true, `${sp.name} must have necro flag true`);
    assert.equal(sp.custom, true, `${sp.name} must have custom flag true`);
  }
});

test('NecroGrimoire 6 & 8: Reading grimoire sets NecroGrimoireRead and grants all necro spells', () => {
  const dummyPlayer = {
    name: 'NecromancerTest',
    NecroGrimoireRead: false,
    spells: [],
  };

  const item = mintNecroGrimoire();
  const res = useItem(item, [item], { entity: dummyPlayer });

  assert.equal(res.kind, 'text');
  assert.equal(dummyPlayer.NecroGrimoireRead, true, 'NecroGrimoireRead flag must be true');
  assert.equal(dummyPlayer.necroGrimoireRead, true, 'necroGrimoireRead flag must be true');
  assert.equal(dummyPlayer.spells.length, 4, 'Must have granted all 4 necro spells');

  const names = dummyPlayer.spells.map((s) => s.name);
  assert.ok(names.includes('Animate Dead'));
  assert.ok(names.includes('Corpse Explosion'));
  assert.ok(names.includes('Life Tap'));
  assert.ok(names.includes('Bone Armor'));

  for (const sp of dummyPlayer.spells) {
    assert.equal(sp.tag, 'некро');
  }

  // Reading again should not duplicate spells
  const res2 = useItem(item, [item], { entity: dummyPlayer });
  assert.equal(dummyPlayer.spells.length, 4);
  assert.ok(res2.text.includes('already deciphered'));
});

test('NecroGrimoire 6: Flag NecroGrimoireRead persists across save snapshot & restore', () => {
  const entity = {
    name: 'ArchNecromancer',
    characterId: 'necro-char-1',
    level: 10,
    health: 100,
    maxHealth: 100,
    magicka: 150,
    maxMagicka: 150,
    fatigue: 100,
    NecroGrimoireRead: true,
    necroGrimoireRead: true,
    spells: [animateDeadSpell()],
    items: [],
  };

  const snap = snapshotPlayer(entity);
  assert.equal(snap.NecroGrimoireRead, true, 'Snapshot must store NecroGrimoireRead');

  const loadedEntity = {};
  restorePlayer(loadedEntity, snap);
  assert.equal(loadedEntity.NecroGrimoireRead, true, 'Restored entity must have NecroGrimoireRead');
  assert.equal(loadedEntity.necroGrimoireRead, true, 'Restored entity must have necroGrimoireRead');
  assert.equal(loadedEntity.spells.length, 1);
  assert.equal(loadedEntity.spells[0].name, 'Animate Dead');
  assert.equal(loadedEntity.spells[0].tag, 'некро');
});

test('NecroGrimoire 9: Spell Maker blocks necro effects without NecroGrimoireRead and unblocks with it', () => {
  const uninitiated = {
    NecroGrimoireRead: false,
    necroGrimoireRead: false,
    items: [{ group: 'MiscItems', templateIndex: 132 }], // has spellbook
    goldPieces: 10000,
  };

  // 1. Groups check without grimoire
  const groupsLocked = spellMakerGroups(uninitiated);
  assert.ok(!groupsLocked.includes('Animate Dead'), 'Animate Dead must be hidden');
  assert.ok(!groupsLocked.includes('Corpse Explosion'), 'Corpse Explosion must be hidden');
  assert.ok(!groupsLocked.includes('Life Tap'), 'Life Tap must be hidden');
  assert.ok(!groupsLocked.includes('Bone Armor'), 'Bone Armor must be hidden');

  // 2. Validate purchase check without grimoire
  const necroSlot = { type: 47, subType: 255 }; // Animate Dead
  const buyResLocked = validateSpellPurchase({
    entity: uninitiated,
    slots: [necroSlot],
    goldCost: 100,
    name: 'Forbidden Summon',
  });
  assert.equal(buyResLocked.ok, false, 'Must fail purchase validation');
  assert.ok(buyResLocked.text.includes('Grimoire'), 'Must mention Grimoire in error');

  // 3. Initiate player with Grimoire
  const initiated = {
    NecroGrimoireRead: true,
    necroGrimoireRead: true,
    items: [{ group: 'MiscItems', templateIndex: 132 }],
    goldPieces: 10000,
  };

  // Groups check with grimoire
  const groupsUnlocked = spellMakerGroups(initiated);
  assert.ok(groupsUnlocked.includes('Animate Dead'), 'Animate Dead must appear');
  assert.ok(groupsUnlocked.includes('Corpse Explosion'), 'Corpse Explosion must appear');
  assert.ok(groupsUnlocked.includes('Life Tap'), 'Life Tap must appear');
  assert.ok(groupsUnlocked.includes('Bone Armor'), 'Bone Armor must appear');

  // Subgroups check with grimoire
  const subs = spellMakerSubgroups('Animate Dead', initiated);
  assert.equal(subs.length, 1);
  assert.equal(subs[0].key, '47,255');

  // Validate purchase check with grimoire
  const buyResUnlocked = validateSpellPurchase({
    entity: initiated,
    slots: [necroSlot],
    goldCost: 100,
    name: 'Forbidden Summon',
  });
  assert.equal(buyResUnlocked.ok, true, 'Purchase validation must pass when grimoire read');
});

test('NecroGrimoire 10: Console commands can spawn Grimoire of the Worm', () => {
  const additemCmd = getConsoleCommand('additem');
  assert.ok(additemCmd);

  // Spawn via template index 585
  const res1 = additemCmd.callback(['585', '1']);
  assert.ok(res1.includes('Grimoire of the Worm'), 'additem 585 must add Grimoire');

  // Spawn via alias 'grimoire'
  const res2 = additemCmd.callback(['grimoire', '1']);
  assert.ok(res2.includes('Grimoire of the Worm'), 'additem grimoire must add Grimoire');

  // Spawn via direct command give_grimoire
  const giveCmd = getConsoleCommand('give_grimoire');
  assert.ok(giveCmd);
  const res3 = giveCmd.callback([]);
  assert.ok(res3.includes('Grimoire of the Worm'), 'give_grimoire must add Grimoire');
});
