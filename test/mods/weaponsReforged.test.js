// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerVirtualMod,
  setModEnabled,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import {
  syncModData,
  getMaterialConfig,
  getMaterialDamageMultiplier,
  getMaterialArmorPenetration,
  getMaterialSwingSpeedMultiplier,
  _resetModDataSync,
} from '../../src/systems/mods/modDataSync.js';
import { emitModEvent, _resetModEventBus } from '../../src/systems/mods/modEventBus.js';
import { createModApi, setModApiContext, _resetModPluginApi } from '../../src/systems/mods/modPluginApi.js';
import { loadActiveModPlugins, _resetModPluginLoader } from '../../src/systems/mods/modPluginLoader.js';
import { WEAPON_MATERIALS } from '../../src/characters/weapons.js';
import { ENEMY_GROUPS } from '../../src/combat/enemyGroups.js';

const SAMPLE_MATERIALS_JSON = JSON.stringify({
  Silver: {
    vsUndeadMultiplier: 2.0,
    vsWerecreatureMultiplier: 2.0,
    conditionLossMultiplier: 1.5,
    holyBurn: true,
  },
  Elven: {
    swingSpeedMultiplier: 1.2,
    fatigueCostMultiplier: 0.8,
    armorPenetration: -0.1,
  },
  Dwarven: {
    vsConstructMultiplier: 1.35,
    conditionLossMultiplier: 0.3,
  },
  Adamantium: {
    armorPenetration: 0.35,
    sunderArmorChance: 0.2,
  },
  Ebony: {
    minStrength: 70,
    lowStrengthSpeedPenalty: 0.75,
  },
  Daedric: {
    damageMultiplier: 1.15,
    curseOnMissFatigue: 15,
    curseBackfireHealth: 5,
    backfireHealthThreshold: 0.25,
  },
});

const SAMPLE_PLUGIN_JS = `
function init(api) {
  api.events.on('combatAttackResolved', (evt) => {
    const { attacker, target, weapon, damage, hit } = evt;
    if (!attacker?.isPlayer) return;
    if (!weapon) return;

    if (weapon.material === 9) { // Daedric
      if (!hit) {
        api.player.damageFatigue(15);
        api.ui.notify('The Daedric blade hungers! (-15 Fatigue)');
      } else {
        const hp = attacker.health ?? 100;
        const maxHp = attacker.maxHealth ?? 100;
        if (maxHp > 0 && hp / maxHp < 0.25) {
          api.player.damageHealth(5);
          api.ui.notify('The Daedric entity turns on its wounded bearer! (-5 HP)');
        }
      }
    }
  });

  api.events.on('weaponWallClank', () => {
    api.ui.notify('Your weapon struck the stone wall!');
  });
}
`;

test('weapons-reforged: materials data sync and multipliers calculation', () => {
  _resetModRegistry();
  _resetModDataSync();

  // Vanilla baseline check
  assert.equal(getMaterialDamageMultiplier(WEAPON_MATERIALS.Silver, { isUndead: true }), 1.0);
  assert.equal(getMaterialArmorPenetration(WEAPON_MATERIALS.Adamantium), 0.0);
  assert.equal(getMaterialSwingSpeedMultiplier(WEAPON_MATERIALS.Elven, 50), 1.0);

  // Reset before registering virtual mod so discoverMods picks it up
  _resetModRegistry();
  _resetModDataSync();

  // Register weapons-reforged virtual mod
  registerVirtualMod(
    {
      id: 'weapons-reforged',
      name: 'Weapons Reforged',
      enabled: true,
      data: { materials: 'materials.json' },
    },
    {
      'materials.json': SAMPLE_MATERIALS_JSON,
    }
  );

  syncModData();

  // 1. Silver vs Undead multiplier
  const undeadTarget = { careerIndex: 20, isUndead: true };
  assert.equal(getMaterialDamageMultiplier(WEAPON_MATERIALS.Silver, undeadTarget), 2.0);

  // Silver vs standard human target (no bonus)
  const humanTarget = { careerIndex: 0 };
  assert.equal(getMaterialDamageMultiplier(WEAPON_MATERIALS.Silver, humanTarget), 1.0);

  // 2. Adamantium armor penetration
  assert.equal(getMaterialArmorPenetration(WEAPON_MATERIALS.Adamantium), 0.35);

  // 3. Elven swing speed multiplier (+20%)
  assert.equal(getMaterialSwingSpeedMultiplier(WEAPON_MATERIALS.Elven, 50), 1.2);

  // 4. Ebony strength threshold scaling
  // Low strength wielder (< 70) suffers penalty (0.75x speed)
  assert.equal(getMaterialSwingSpeedMultiplier(WEAPON_MATERIALS.Ebony, 50), 0.75);
  // High strength wielder (>= 70) swings at full normal speed (1.0x)
  assert.equal(getMaterialSwingSpeedMultiplier(WEAPON_MATERIALS.Ebony, 75), 1.0);

  // Cleanup
  _resetModRegistry();
  _resetModDataSync();
});

test('weapons-reforged: plugin lifecycle and daedric curse mechanics', async () => {
  _resetModRegistry();
  _resetModDataSync();
  _resetModEventBus();
  _resetModPluginApi();
  _resetModPluginLoader();

  const mockPlayer = {
    isPlayer: true,
    health: 100,
    maxHealth: 100,
    fatigue: 100,
  };

  const logs = [];
  setModApiContext({ player: mockPlayer });

  // Register virtual mod with plugin.js
  registerVirtualMod(
    {
      id: 'weapons-reforged',
      name: 'Weapons Reforged',
      enabled: true,
      entry: 'plugin.js',
    },
    {
      'plugin.js': SAMPLE_PLUGIN_JS,
    }
  );

  // Load and execute plugins
  await loadActiveModPlugins();

  // Simulate Daedric weapon swing MISS
  const daedricWeapon = { material: WEAPON_MATERIALS.Daedric };
  emitModEvent('combatAttackResolved', {
    attacker: mockPlayer,
    target: { health: 50 },
    weapon: daedricWeapon,
    damage: 0,
    hit: false,
  });

  // Fatigue must be reduced by 15
  assert.equal(mockPlayer.fatigue, 85);

  // Simulate Daedric weapon HIT at critically low health (HP < 25%)
  mockPlayer.health = 20; // 20 / 100 = 0.20 (< 0.25)
  emitModEvent('combatAttackResolved', {
    attacker: mockPlayer,
    target: { health: 50 },
    weapon: daedricWeapon,
    damage: 30,
    hit: true,
  });

  // Health backfires and takes 5 HP damage
  assert.equal(mockPlayer.health, 15);

  // Cleanup
  _resetModRegistry();
  _resetModDataSync();
  _resetModEventBus();
  _resetModPluginApi();
  _resetModPluginLoader();
});
