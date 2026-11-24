import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeConsoleLine, setDebugSceneContext } from '../../src/systems/consoleCommands.js';
import { playerEntity, staffPowers, setStaffPowers } from '../../src/characters/playerEntity.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import {
  REVENANT_MAX,
  huntingRevenants,
  mintHostileRevenant,
  _resetRevenantForTests,
} from '../../src/systems/revenant/revenant.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';

test('mintHostileRevenant creates canonical hunting record and respects REVENANT_MAX cap', () => {
  _resetRevenantForTests();
  try {
    for (let i = 0; i < REVENANT_MAX; i++) {
      const res = mintHostileRevenant(playerEntity, { mobileType: MOBILE_TYPES.Knight, rank: 1 });
      assert.equal(res.ok, true);
      assert.equal(res.revenant.out, false);
      assert.equal(res.revenant.sworn, false);
      assert.equal(res.revenant.defeated, false);
      assert.equal(res.revenant.companion, null);
      assert.equal(res.revenant.rank, 1);
    }
    assert.equal(huntingRevenants().length, REVENANT_MAX);

    const capped = mintHostileRevenant(playerEntity, { mobileType: MOBILE_TYPES.Knight });
    assert.equal(capped.ok, false);
    assert.equal(capped.reason, 'cap');
    assert.equal(huntingRevenants().length, REVENANT_MAX);

    const forced = mintHostileRevenant(playerEntity, { mobileType: MOBILE_TYPES.Warrior, rank: 2, force: true });
    assert.equal(forced.ok, true);
    assert.equal(forced.revenant.rank, 2);
  } finally {
    _resetRevenantForTests();
  }
});

test('spawn_revenant / spawnrev spawns via debug context and handles missing ctx & cap', async () => {
  _resetRevenantForTests();
  setDebugSceneContext(null);
  try {
    const noCtx = await executeConsoleLine('spawn_revenant');
    assert.match(noCtx, /world or dungeon mode/i);

    let spawnedArg = null;
    setDebugSceneContext({
      spawnRevenant: async (r, { hp }) => {
        spawnedArg = { r, hp };
        return { entity: { health: hp ?? 100, maxHealth: 100 } };
      },
    });
    const out = await executeConsoleLine('spawnrev knight 1 10');
    assert.match(out, /Spawned hostile revenant/i);
    assert.equal(spawnedArg.r.mobileType, MOBILE_TYPES.Knight);
    assert.equal(spawnedArg.r.rank, 1);
    assert.equal(spawnedArg.hp, 10);
  } finally {
    setDebugSceneContext(null);
    _resetRevenantForTests();
  }
});

test('spawn_spar / spar_spawn spawns via debug context and parses wager/level/hp', async () => {
  setDebugSceneContext(null);
  try {
    const noCtx = await executeConsoleLine('spawn_spar');
    assert.match(noCtx, /unavailable/i);

    let got = null;
    setDebugSceneContext({
      spawnSparDuelist: async (opts) => {
        got = opts;
        return { entity: { name: 'Test Duelist', health: opts.hp ?? 80, maxHealth: 80 } };
      },
    });
    const out = await executeConsoleLine('spar_spawn 75 4 20');
    assert.match(out, /Wager: 75g/);
    assert.equal(got.wager, 75);
    assert.equal(got.level, 4);
    assert.equal(got.hp, 20);
  } finally {
    setDebugSceneContext(null);
  }
});

test('foe_bodies / fview / mwfoes switches mwFoeBodies preference', async () => {
  const orig = getPref('mwFoeBodies');
  try {
    const r3d = await executeConsoleLine('foe_bodies 3d');
    assert.match(r3d, /mwFoeBodies=near/);
    assert.equal(getPref('mwFoeBodies'), 'near');

    const r2d = await executeConsoleLine('fview 2d');
    assert.match(r2d, /mwFoeBodies=off/);
    assert.equal(getPref('mwFoeBodies'), 'off');

    const rTog = await executeConsoleLine('mwfoes toggle');
    assert.match(rTog, /mwFoeBodies=near/);
    assert.equal(getPref('mwFoeBodies'), 'near');

    const rAll = await executeConsoleLine('foe_bodies all');
    assert.match(rAll, /mwFoeBodies=all/);
    assert.equal(getPref('mwFoeBodies'), 'all');
  } finally {
    setPref('mwFoeBodies', orig ?? 'off');
  }
});

test('sethp / player_hp sets absolute and percentage HP, clamps to [1, maxHealth], warns on tgm', async () => {
  const origHp = playerEntity.health;
  const origMax = playerEntity.maxHealth;
  const origGod = staffPowers().god;
  try {
    playerEntity.maxHealth = 100;
    playerEntity.health = 100;
    setStaffPowers({ god: false });

    const rPct = await executeConsoleLine('sethp 18%');
    assert.match(rPct, /18\/100/);
    assert.equal(playerEntity.health, 18);

    const rClampLo = await executeConsoleLine('player_hp 0');
    assert.match(rClampLo, /1\/100/);
    assert.equal(playerEntity.health, 1);

    const rClampHi = await executeConsoleLine('sethp 999');
    assert.match(rClampHi, /100\/100/);
    assert.equal(playerEntity.health, 100);

    setStaffPowers({ god: true });
    const rGod = await executeConsoleLine('sethp 25');
    assert.match(rGod, /God Mode is ON/);
    assert.equal(playerEntity.health, 25);

    const rBad = await executeConsoleLine('sethp nope');
    assert.match(rBad, /Usage: sethp/);
  } finally {
    playerEntity.health = origHp;
    playerEntity.maxHealth = origMax;
    setStaffPowers({ god: origGod });
  }
});

test('spar_debug / foe_state reports state and applies canonical dot and poison', async () => {
  const foe = {
    seq: 1,
    mobileType: MOBILE_TYPES.Knight,
    dead: false,
    _isSparring: true,
    _surrenderedSpar: false,
    _sparGraceLeft: 0,
    _sparKneeling: false,
    entity: {
      name: 'Sparring Duelist',
      health: 50,
      maxHealth: 50,
      level: 3,
      team: 'PlayerEnemy',
      activeEffects: [],
      stats: { willpower: 10, luck: 10 },
    },
    ai: { feet: [0, 0, 0], yaw: 0, moving: false, giveUpTimer: 0, isHostile: true },
  };
  setDebugSceneContext({ getNearestFoe: () => foe });
  try {
    const rDot = await executeConsoleLine('spar_debug dot');
    assert.match(rDot, /Applied canonical continuousDamage DoT/);
    assert.match(rDot, /effects=\[continuousDamage\]/);
    assert.equal(foe.entity.activeEffects[0].kind, 'continuousDamage');
    assert.ok(foe.entity.activeEffects[0].effect, 'canonical effect object attached');

    const rPoison = await executeConsoleLine('foe_state poison');
    assert.match(rPoison, /Sparring Duelist/);
  } finally {
    setDebugSceneContext(null);
  }
});
