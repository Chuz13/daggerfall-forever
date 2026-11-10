function init(api) {
  /** @type {Array<{ target: any, ticks: number }>} */
  const activeBurns = [];
  const UNDEAD_CAREERS = new Set([15, 17, 18, 19, 23, 28, 30, 32, 33, 266, 274, 277, 283]);
  const CONSTRUCT_CAREERS = new Set([22, 35, 36, 37, 38, 284, 286, 289, 290]);

  // 1. Process active holy burns on each world tick
  api.events.on('worldTick', () => {
    for (let i = activeBurns.length - 1; i >= 0; i--) {
      const burn = activeBurns[i];
      if (!burn.target || burn.target.dead || (burn.target.health ?? 0) <= 0) {
        activeBurns.splice(i, 1);
        continue;
      }

      if (typeof burn.target.hurt === 'function') {
        burn.target.hurt(3);
      } else {
        // Safe DoT: leave at least 1 HP so main combat engine resolves death, corpse and quest kills cleanly
        const currentHp = burn.target.health ?? 0;
        if (currentHp > 1) {
          burn.target.health = Math.max(1, currentHp - 3);
        }
      }
      burn.ticks--;
      api.ui.notify('Holy flame purges the abomination! (-3 HP)');

      if (burn.ticks <= 0 || burn.target.dead || (burn.target.health ?? 0) <= 1) {
        activeBurns.splice(i, 1);
      }
    }
  });

  // 2. Process attack resolutions
  api.events.on('combatAttackResolved', (evt) => {
    const { attacker, target, weapon, damage, hit } = evt;
    if (!attacker?.isPlayer) return;
    if (!weapon) return;

    // 9 = Daedric material (Curse)
    if (weapon.material === 9) {
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

    // 2 = Silver material (Holy Burn DoT)
    if (weapon.material === 2 && hit && damage > 0 && target) {
      const isUndead =
        Boolean(target.isUndead) ||
        target.affinity === 'Undead' ||
        (!target.isClass && target.careerIndex !== undefined && UNDEAD_CAREERS.has(target.careerIndex));
      if (isUndead) {
        api.ui.notify('Silver purges the creature with holy fire!');
        activeBurns.push({ target, ticks: 3 });
      }
    }

    // 6 = Adamantium material (Sunder Armor chance: 20%)
    if (weapon.material === 6 && hit && damage > 0 && target) {
      if (Math.random() < 0.2) {
        const slots = target.equip?.slots ?? {};
        const armors = Object.values(slots).filter((it) => it && it.group === 'Armor');
        if (armors.length > 0) {
          const piece = armors[Math.floor(Math.random() * armors.length)];
          if (piece) {
            if (piece.currentCondition !== undefined) {
              piece.currentCondition = Math.max(0, piece.currentCondition - 25);
            }
            if (piece.condition !== undefined) {
              piece.condition = Math.max(0, piece.condition - 25);
            }
            api.ui.notify('Adamantium crushed enemy armor!');
          }
        } else if (Array.isArray(target.armorValues) && target.armorValues.length > 0) {
          const idx = Math.floor(Math.random() * target.armorValues.length);
          target.armorValues[idx] = Math.min(100, (target.armorValues[idx] ?? 0) + 2);
          api.ui.notify('Adamantium crushed enemy armor!');
        }
      }
    }

    // 7 = Ebony material (Stamina siphon: drain 10 fatigue and restore to player)
    if (weapon.material === 7 && hit && damage > 0 && target) {
      if (target.fatigue !== undefined && target.fatigue > 0) {
        target.fatigue = Math.max(0, target.fatigue - 10);
      }
      api.player.restoreFatigue(10);
      api.ui.notify('Ebony siphons stamina!');
    }
  });

  // 3. Process wall clank
  api.events.on('weaponWallClank', () => {
    api.ui.notify('Your weapon struck the stone wall! Watch your swings in narrow corridors.');
  });
}
