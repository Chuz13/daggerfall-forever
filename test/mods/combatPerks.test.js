// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createModApi,
  setModApiContext,
  getModPerks,
  getAllRegisteredPerks,
  _resetModPluginApi,
} from '../../src/systems/mods/modPluginApi.js';
import { _resetModEventBus, emitModEvent } from '../../src/systems/mods/modEventBus.js';
import { playerWeaponHitEntity, playerWeaponKillReported } from '../../src/systems/worldTick.js';
import initBloodTithe from '../../mods/examples/blood-tithe/plugin.js';

test('Combat Events & Perks: playerWeaponHitEntity dispatches events cleanly', () => {
  _resetModEventBus();
  _resetModPluginApi();

  let hitCount = 0;
  let killCount = 0;
  let lastHitEvent = null;

  const api = createModApi('test-combat-listener');
  api.events.on('combat:playerHit', (evt) => {
    hitCount++;
    lastHitEvent = evt;
  });
  api.events.on('combat:enemyKill', (evt) => {
    killCount++;
  });

  const dummyPlayer = { health: 50, maxHealth: 50 };
  const dummyFoe = { health: 20, maxHealth: 20 };

  // 1. Non-lethal blow
  playerWeaponHitEntity(dummyPlayer, dummyFoe, { mobileType: 5 });
  assert.equal(hitCount, 1);
  assert.equal(killCount, 0);
  assert.equal(lastHitEvent?.isKill, false);
  assert.equal(lastHitEvent?.mobileType, 5);

  // 2. Lethal blow (health <= 0)
  dummyFoe.health = 0;
  playerWeaponHitEntity(dummyPlayer, dummyFoe, { mobileType: 5 });
  assert.equal(hitCount, 2);
  assert.equal(killCount, 1);
  assert.equal(lastHitEvent?.isKill, true);

  // 3. Explicit kill report
  playerWeaponKillReported(dummyPlayer, { mobileType: 12 });
  assert.equal(killCount, 2);

  _resetModEventBus();
  _resetModPluginApi();
});

test('Combat Events & Perks: Blood-Tithe unlocks milestone after 5 kills and heals player', () => {
  _resetModEventBus();
  _resetModPluginApi();

  const notifications = [];
  const dummyPlayer = {
    health: 30,
    maxHealth: 100,
    fatigue: 40,
    maxFatigue: 100,
  };

  setModApiContext({
    player: dummyPlayer,
  });

  const bloodTitheApi = createModApi('blood-tithe');
  // Capture notifications
  bloodTitheApi.ui.notify = (msg) => notifications.push(msg);

  // Initialize Blood-Tithe mod
  initBloodTithe(bloodTitheApi);

  // Verify perk is registered
  const perks = getModPerks('blood-tithe');
  assert.equal(perks.length, 1);
  assert.equal(perks[0].id, 'blood-tithe');
  assert.equal(perks[0].name, 'Кровавая дань');
  assert.equal(bloodTitheApi.perks.has('blood-tithe'), false);

  // Slay 4 foes (not unlocked yet)
  for (let i = 1; i <= 4; i++) {
    playerWeaponKillReported(dummyPlayer, { mobileType: 1 });
    assert.equal(bloodTitheApi.perks.has('blood-tithe'), false);
    assert.equal(dummyPlayer.health, 30); // No heal yet
  }
  assert.equal(bloodTitheApi.storage.get('slainCount'), 4);

  // 5th kill: achieves the feat!
  playerWeaponKillReported(dummyPlayer, { mobileType: 1 });
  assert.equal(bloodTitheApi.perks.has('blood-tithe'), true);
  assert.ok(notifications.some((n) => n.includes('ПОДВИГ СОВЕРШЕН')));

  // Next kill: triggers life leech effect!
  const prevHealth = dummyPlayer.health;
  const prevFatigue = dummyPlayer.fatigue;
  playerWeaponKillReported(dummyPlayer, { mobileType: 1 });

  assert.equal(dummyPlayer.health, prevHealth + 15);
  assert.equal(dummyPlayer.fatigue, prevFatigue + 30);
  assert.ok(notifications.some((n) => n.includes('Кровь врага насыщает ваши силы')));

  // Verify perk list status
  const allPerks = bloodTitheApi.perks.getAll();
  assert.equal(allPerks[0].unlocked, true);

  _resetModEventBus();
  _resetModPluginApi();
});
