function init(api) {
  api.events.on('worldTick', (evt) => {
    const isNight = api.world.isNight();
    const isInterior = api.world.isInterior();
    const biome = api.world.getCurrentBiome();

    if (isNight && !isInterior && (biome === 'desert' || biome === 'mountain')) {
      if (!api.player.hasEffect('resistFrost')) {
        const drain = Number(api.settings?.get?.('frostFatigueDrain')) || 5;
        api.player.damageFatigue(drain);
        const coldCount = (api.storage.get('freezeTicks', 0)) + 1;
        api.storage.set('freezeTicks', coldCount);

        if (api.settings?.get?.('enableAlerts') !== false && coldCount % 6 === 1) {
          api.ui.notify('The freezing night wind bites at your skin! Seek shelter or warmth.');
        }
      }
    }
  });
}

