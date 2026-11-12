import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeConsoleLine, getConsoleCommand } from '../../src/systems/consoleCommands.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { DRAGON_MOUNT_TEMPLATE, isDragonMount, dragonMountWellFormed, hasDragon } from '../../src/systems/dragon/dragonMount.js';
import { itemFindings } from '../../src/systems/item/itemLaw.js';

test('console command give_dragon adds well-formed dragon mount to inventory', () => {
  playerEntity.items = [];
  const res = getConsoleCommand('give_dragon').callback([]);
  assert.ok(res.includes('Brass Dwarven Dragon'));
  assert.equal(hasDragon(playerEntity.items), true);
  const dragon = playerEntity.items.find(isDragonMount);
  assert.ok(dragon);
  assert.equal(dragon.templateIndex, DRAGON_MOUNT_TEMPLATE);
  assert.equal(dragon.group, 'Transportation');
  assert.equal(dragonMountWellFormed(dragon), true);
  assert.deepEqual(itemFindings(dragon), []);
});

test('console command give_dragon blue/aether adds Aetherbright variant', () => {
  playerEntity.items = [];
  const res = getConsoleCommand('givedragon').callback(['blue']);
  assert.ok(res.includes('Aetherbright'));
  const dragon = playerEntity.items.find(isDragonMount);
  assert.ok(dragon);
  assert.equal(dragon.dragonLook, 1);
  assert.equal(dragonMountWellFormed(dragon), true);
  assert.deepEqual(itemFindings(dragon), []);
});

test('additem 1820 and additem dragon add well-formed dragon mount', () => {
  playerEntity.items = [];
  const res1 = executeConsoleLine('additem dragon');
  assert.ok(res1.includes('Dwarven Dragon'));
  assert.equal(hasDragon(playerEntity.items), true);
  const d1 = playerEntity.items[0];
  assert.equal(dragonMountWellFormed(d1), true);

  playerEntity.items = [];
  const res2 = executeConsoleLine('additem 1820');
  assert.ok(res2.includes('Dwarven Dragon'));
  assert.equal(hasDragon(playerEntity.items), true);
  const d2 = playerEntity.items[0];
  assert.equal(dragonMountWellFormed(d2), true);
});

test('dragon cannons: mayRideDragon allows offline riders', async () => {
  const { mayRideDragon } = await import('../../src/systems/staffDragon.js');
  assert.equal(mayRideDragon([], false), true, 'offline allows ride without admin glyphs');
  assert.equal(mayRideDragon([], true), false, 'online requires admin glyphs');
});

test('console command dragon mounts and dismounts with cannons armed', async () => {
  const { ridingDragon, dragonCannonsActive, dragonFire, dragonFiring, _resetDragonRide } = await import('../../src/systems/staffDragon.js');
  _resetDragonRide();
  assert.equal(ridingDragon(), false);
  assert.equal(dragonCannonsActive(), false);

  const res1 = executeConsoleLine('dragon');
  assert.ok(res1.includes('Mounted'));
  assert.equal(ridingDragon(), true);
  assert.equal(dragonCannonsActive(), true);

  assert.equal(dragonFire(1000), true);
  assert.equal(dragonFiring(1050), true);

  const res2 = executeConsoleLine('dragon off');
  assert.ok(res2.includes('Dismounted'));
  assert.equal(ridingDragon(), false);
  assert.equal(dragonCannonsActive(), false);
  _resetDragonRide();
});

