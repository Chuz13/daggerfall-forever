// @ts-check
// Blood-Tithe: Martial Feat & Life Essence Leech Mod for Daggerfall Forever

export default function init(api) {
  // Register perk metadata
  api.perks.register({
    id: 'blood-tithe',
    name: 'Кровавая дань',
    desc: 'Добивание врагов восстанавливает 15 HP и 30 усталости за счет поглощения их жизненных сил.',
  });

  // Listen for enemy kill events dispatched from core combat
  api.events.on('combat:enemyKill', (event) => {
    // If the warrior has already achieved this feat:
    if (api.perks.has('blood-tithe')) {
      api.player.heal(15);
      api.player.restoreFatigue(30);
      api.ui.notify('Кровь врага насыщает ваши силы (+15 HP, +30 SP)');
      return;
    }

    // Otherwise, increment the combat feat counter
    const currentKills = (api.storage.get('slainCount', 0)) + 1;
    api.storage.set('slainCount', currentKills);

    if (currentKills >= 5) {
      api.perks.unlock('blood-tithe');
      api.ui.notify('ПОДВИГ СОВЕРШЕН: Перк «Кровавая дань» открыт!');
    } else {
      api.ui.notify(`Вкус крови: ${currentKills}/5 добиваний для подвига`);
    }
  });
}

