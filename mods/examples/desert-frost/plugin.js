function init(api) {
  api.events.on('worldTick', (evt) => {
    const isNight = api.world.isNight();
    const isInterior = api.world.isInterior();
    const biome = api.world.getCurrentBiome();

    if (isNight && !isInterior && (biome === 'desert' || biome === 'mountain')) {
      if (!api.player.hasEffect('resistFrost')) {
        api.player.damageFatigue(5);
        const coldCount = (api.storage.get('freezeTicks', 0)) + 1;
        api.storage.set('freezeTicks', coldCount);

        if (coldCount % 6 === 1) {
          api.ui.notify('The freezing night wind bites at your skin! Seek shelter or warmth.');
        }
      }
    }
  });
}

