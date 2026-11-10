// @ts-check
// Blood-Tithe: Martial Feat & Life Essence Leech Mod for Daggerfall Forever
// Author: 13

export default function init(api) {
  // Register perk metadata
  api.perks.register({
    id: 'blood-tithe',
    name: 'Blood-Tithe',
    desc: 'Slaying enemies restores 15 HP and 30 Stamina by siphoning their life essence.',
  });

  // Listen for enemy kill events dispatched from core combat
  api.events.on('combat:enemyKill', (event) => {
    // If the warrior has already achieved this feat:
    if (api.perks.has('blood-tithe')) {
      api.player.heal(15);
      api.player.restoreFatigue(30);
      api.ui.notify('The enemy blood invigorates you! (+15 HP, +30 SP)');
      return;
    }

    // Otherwise, increment the combat feat counter
    const currentKills = (api.storage.get('slainCount', 0)) + 1;
    api.storage.set('slainCount', currentKills);

    if (currentKills >= 5) {
      api.perks.unlock('blood-tithe');
      api.ui.notify('FEAT ACCOMPLISHED: Blood-Tithe perk unlocked!');
    } else {
      api.ui.notify(`Taste of blood: ${currentKills}/5 kills towards feat`);
    }
  });
}
