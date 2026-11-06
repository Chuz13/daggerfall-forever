function init(api) {
  api.events.on('combatAttackResolved', (evt) => {
    const { attacker, target, weapon, damage, hit } = evt;
    if (!attacker?.isPlayer) return;
    if (!weapon) return;

    // 9 = Daedric material
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

    // 2 = Silver material
    if (weapon.material === 2 && hit && damage > 0) {
      const isUndead =
        target?.careerIndex !== undefined &&
        (target.affinity === 'Undead' || target.isUndead || target.careerIndex >= 19);
      if (isUndead) {
        api.ui.notify('Silver purges the creature!');
      }
    }
  });

  api.events.on('weaponWallClank', () => {
    api.ui.notify('Your weapon struck the stone wall! Watch your swings in narrow corridors.');
  });
}
