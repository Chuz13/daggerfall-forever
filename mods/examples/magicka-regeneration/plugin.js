// @ts-check
// Magicka Regeneration v2.0.0 (Mod API v2)
// Author: Osmicnosap (upgraded for DFF Mod API v2)

export default function init(api) {
  let regenRemainder = 0;

  const getMultiplier = () => Math.max(0.1, Number(api.settings?.get?.('multiplier')) || 1);
  const isChipVisible = () => api.settings?.get?.('showChip') !== false;

  function calcRate() {
    const willpower = Math.max(0, Number(api.player.getStat('willpower')) || 0);
    const mult = getMultiplier();
    const perSec = (Math.pow(1.019, willpower) - 1) * mult;
    return { willpower, mult, perSec };
  }

  function syncChip() {
    const vitals = api.player.getVitals();
    if (!isChipVisible() || vitals.maxMagicka <= 0 || vitals.magicka >= vitals.maxMagicka) {
      api.ui.clearStatusChip?.('magicka_regen');
      return;
    }
    const { willpower, mult, perSec } = calcRate();
    api.ui.setStatusChip?.('magicka_regen', {
      name: api.ui.t('mr.chip.name', 'Magicka Regen'),
      kind: 'buff',
      glyph: 'arcane',
      foot: `+${perSec.toFixed(1)}/s`,
      meta: api.ui.t('mr.chip.meta', 'Passive regen'),
      lines: [
        api.ui.t('mr.chip.line.rate', 'Restoring +{rate} Magicka/sec (Willpower {wp}, x{mult}).', {
          rate: perSec.toFixed(2),
          wp: willpower,
          mult,
        }),
        api.ui.t('mr.chip.line.pool', 'Magicka: {cur}/{max}', {
          cur: Math.floor(vitals.magicka),
          max: Math.floor(vitals.maxMagicka),
        }),
      ],
    });
  }

  api.events.on('secondTick', ({ dt = 1 } = {}) => {
    const vitals = api.player.getVitals();
    if (vitals.maxMagicka <= 0 || vitals.magicka >= vitals.maxMagicka) {
      regenRemainder = 0;
      api.ui.clearStatusChip?.('magicka_regen');
      return;
    }
    const { perSec } = calcRate();
    regenRemainder += perSec * dt;
    const wholePoints = Math.floor(regenRemainder);
    if (wholePoints > 0) {
      regenRemainder -= wholePoints;
      api.player.restoreMagicka(wholePoints);
    }
    syncChip();
  });

  api.settings?.onChange?.(() => syncChip());

  api.console?.register?.(
    'mregen_status',
    'Show Magicka Regeneration rate and current Willpower/Magicka',
    'mregen_status',
    () => {
      const vitals = api.player.getVitals();
      const { willpower, mult, perSec } = calcRate();
      return `Magicka Regen: ${perSec.toFixed(2)} MP/s (Willpower=${willpower}, mult=x${mult}), MP=${Math.floor(vitals.magicka)}/${Math.floor(vitals.maxMagicka)}.`;
    },
  );

  api.console?.register?.(
    'mregen_drain',
    'Drain player Magicka for testing regeneration: mregen_drain [amount]',
    'mregen_drain [30]',
    (args = []) => {
      const amt = Math.max(1, Number.parseInt(String(args[0] ?? '30'), 10) || 30);
      api.player.damageMagicka(amt);
      syncChip();
      const vitals = api.player.getVitals();
      return `Drained ${amt} MP -> ${Math.floor(vitals.magicka)}/${Math.floor(vitals.maxMagicka)} MP.`;
    },
  );
}
