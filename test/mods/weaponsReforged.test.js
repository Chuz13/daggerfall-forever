// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerVirtualMod,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import {
  syncModData,
  getMaterialDamageMultiplier,
  getMaterialArmorPenetration,
  getMaterialSwingSpeedMultiplier,
  getMaterialConditionLossMultiplier,
  getMaterialFatigueCostMultiplier,
  getMaterialSunderArmorChance,
  getMaterialStaminaDrain,
  _resetModDataSync,
} from '../../src/systems/mods/modDataSync.js';
import { emitModEvent, _resetModEventBus } from '../../src/systems/mods/modEventBus.js';
import { setModApiContext, _resetModPluginApi } from '../../src/systems/mods/modPluginApi.js';
import { loadActiveModPlugins, _resetModPluginLoader } from '../../src/systems/mods/modPluginLoader.js';
import { WEAPON_MATERIALS } from '../../src/characters/weapons.js';

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
    staminaDrainOnHit: 10,
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
  const activeBurns = [];

  api.events.on('worldTick', () => {
    for (let i = activeBurns.length - 1; i >= 0; i--) {
      const burn = activeBurns[i];
      if (!burn.target || burn.target.dead || (burn.target.health ?? 0) <= 0) {
        activeBurns.splice(i, 1);
        continue;
      }
      burn.target.health = Math.max(0, (burn.target.health ?? 0) - 3);
      burn.ticks--;
      api.ui.notify('Holy flame purges the abomination! (-3 HP)');
      if (burn.ticks <= 0) activeBurns.splice(i, 1);
    }
  });

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

    if (weapon.material === 2 && hit && damage > 0 && target) { // Silver
      if (target.isUndead) {
        api.ui.notify('Silver purges the creature with holy fire!');
        activeBurns.push({ target, ticks: 3 });
      }
    }

    if (weapon.material === 6 && hit && damage > 0 && target) { // Adamantium
      const slots = target.equip?.slots ?? {};
      const armors = Object.values(slots).filter((it) => it && it.group === 'Armor');
      if (armors.length > 0) {
        armors[0].condition = Math.max(0, (armors[0].condition ?? 100) - 25);
        api.ui.notify('Adamantium crushed enemy armor!');
      }
    }

    if (weapon.material === 7 && hit && damage > 0 && target) { // Ebony
      if (target.fatigue !== undefined && target.fatigue > 0) {
        target.fatigue = Math.max(0, target.fatigue - 10);
      }
      api.player.restoreFatigue(10);
      api.ui.notify('Ebony siphons stamina!');
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
  assert.equal(getMaterialConditionLossMultiplier(WEAPON_MATERIALS.Silver), 1.0);
  assert.equal(getMaterialFatigueCostMultiplier(WEAPON_MATERIALS.Elven), 1.0);
  assert.equal(getMaterialSunderArmorChance(WEAPON_MATERIALS.Adamantium), 0.0);
  assert.equal(getMaterialStaminaDrain(WEAPON_MATERIALS.Ebony), 0);

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

  // 3. Elven swing speed multiplier (+20%) and fatigue cost (0.8x)
  assert.equal(getMaterialSwingSpeedMultiplier(WEAPON_MATERIALS.Elven, 50), 1.2);
  assert.equal(getMaterialFatigueCostMultiplier(WEAPON_MATERIALS.Elven), 0.8);

  // 4. Condition loss multipliers (Silver breaks faster, Dwarven is durable)
  assert.equal(getMaterialConditionLossMultiplier(WEAPON_MATERIALS.Silver), 1.5);
  assert.equal(getMaterialConditionLossMultiplier(WEAPON_MATERIALS.Dwarven), 0.3);

  // 5. Ebony strength threshold scaling and stamina drain
  assert.equal(getMaterialSwingSpeedMultiplier(WEAPON_MATERIALS.Ebony, 50), 0.75);
  assert.equal(getMaterialSwingSpeedMultiplier(WEAPON_MATERIALS.Ebony, 75), 1.0);
  assert.equal(getMaterialStaminaDrain(WEAPON_MATERIALS.Ebony), 10);

  // 6. Adamantium sunder armor chance
  assert.equal(getMaterialSunderArmorChance(WEAPON_MATERIALS.Adamantium), 0.2);

  // Cleanup
  _resetModRegistry();
  _resetModDataSync();
});

test('weapons-reforged: plugin lifecycle, curses, holy burn and stamina siphon', async () => {
  _resetModRegistry();
  _resetModDataSync();
  _resetModEventBus();
  _resetModPluginApi();
  _resetModPluginLoader();

  const mockPlayer = {
    isPlayer: true,
    health: 100,
    maxHealth: 100,
    fatigue: 50,
    maxFatigue: 100,
  };

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

  // A. Simulate Daedric weapon swing MISS -> -15 Fatigue
  const daedricWeapon = { material: WEAPON_MATERIALS.Daedric };
  emitModEvent('combatAttackResolved', {
    attacker: mockPlayer,
    target: { health: 50 },
    weapon: daedricWeapon,
    damage: 0,
    hit: false,
  });
  assert.equal(mockPlayer.fatigue, 35);

  // B. Simulate Daedric weapon HIT at critically low health (HP < 25%) -> -5 HP
  mockPlayer.health = 20; // 20 / 100 = 0.20 (< 0.25)
  emitModEvent('combatAttackResolved', {
    attacker: mockPlayer,
    target: { health: 50 },
    weapon: daedricWeapon,
    damage: 30,
    hit: true,
  });
  assert.equal(mockPlayer.health, 15);

  // C. Simulate Ebony weapon HIT -> siphons 10 stamina from target to player
  const ebonyWeapon = { material: WEAPON_MATERIALS.Ebony };
  const targetFoe = { health: 80, fatigue: 40 };
  emitModEvent('combatAttackResolved', {
    attacker: mockPlayer,
    target: targetFoe,
    weapon: ebonyWeapon,
    damage: 25,
    hit: true,
  });
  assert.equal(targetFoe.fatigue, 30); // 40 - 10 = 30
  assert.equal(mockPlayer.fatigue, 45); // 35 + 10 = 45

  // D. Simulate Adamantium weapon HIT -> sunders enemy armor
  const adamantiumWeapon = { material: WEAPON_MATERIALS.Adamantium };
  const armoredTarget = {
    health: 60,
    equip: {
      slots: {
        chest: { group: 'Armor', condition: 100 },
      },
    },
  };
  emitModEvent('combatAttackResolved', {
    attacker: mockPlayer,
    target: armoredTarget,
    weapon: adamantiumWeapon,
    damage: 20,
    hit: true,
  });
  assert.equal(armoredTarget.equip.slots.chest.condition, 75); // 100 - 25 = 75

  // E. Simulate Silver weapon HIT on undead -> applies Holy Burn DoT
  const silverWeapon = { material: WEAPON_MATERIALS.Silver };
  const undeadFoe = { health: 30, isUndead: true };
  emitModEvent('combatAttackResolved', {
    attacker: mockPlayer,
    target: undeadFoe,
    weapon: silverWeapon,
    damage: 15,
    hit: true,
  });

  // Advance 1 world tick -> 3 HP burn damage
  emitModEvent('worldTick', {});
  assert.equal(undeadFoe.health, 27);

  // Advance 2nd world tick -> 3 HP burn damage
  emitModEvent('worldTick', {});
  assert.equal(undeadFoe.health, 24);

  // Cleanup
  _resetModRegistry();
  _resetModDataSync();
  _resetModEventBus();
  _resetModPluginApi();
  _resetModPluginLoader();
});
