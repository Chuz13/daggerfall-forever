// @ts-check
// Stamina Regeneration v2.0.0 (Mod API v2)
// Author: Osmicnosap (upgraded for DFF Mod API v2)

export default function init(api) {
  let regenRemainder = 0;

  const getRate = () => Math.max(0.1, Number(api.settings?.get?.('regenPerSecond')) || 1);
  const shouldPauseRunning = () => Boolean(api.settings?.get?.('pauseWhileRunning'));
  const isChipVisible = () => api.settings?.get?.('showChip') !== false;

  function syncChip(paused = false) {
    const vitals = api.player.getVitals();
    if (!isChipVisible() || paused || vitals.maxFatigue <= 0 || vitals.fatigue >= vitals.maxFatigue) {
      api.ui.clearStatusChip?.('stamina_regen');
      return;
    }
    const rate = getRate();
    api.ui.setStatusChip?.('stamina_regen', {
      name: api.ui.t('sr.chip.name', 'Stamina Regen'),
      kind: 'buff',
      glyph: 'wild',
      foot: `+${rate.toFixed(1)}/s`,
      meta: api.ui.t('sr.chip.meta', 'Passive regen'),
      lines: [
        api.ui.t('sr.chip.line.rate', 'Restoring +{rate} Fatigue/sec.', { rate: rate.toFixed(1) }),
        api.ui.t('sr.chip.line.pool', 'Fatigue: {cur}/{max}', {
          cur: Math.floor(vitals.fatigue),
          max: Math.floor(vitals.maxFatigue),
        }),
      ],
    });
  }

  api.events.on('secondTick', ({ dt = 1 } = {}) => {
    const vitals = api.player.getVitals();
    if (vitals.maxFatigue <= 0 || vitals.fatigue >= vitals.maxFatigue) {
      regenRemainder = 0;
      api.ui.clearStatusChip?.('stamina_regen');
      return;
    }
    if (shouldPauseRunning() && api.player.isRunning?.()) {
      syncChip(true);
      return;
    }
    const rate = getRate();
    regenRemainder += rate * dt;
    const wholePoints = Math.floor(regenRemainder);
    if (wholePoints > 0) {
      regenRemainder -= wholePoints;
      api.player.restoreFatigue(wholePoints);
    }
    syncChip(false);
  });

  api.settings?.onChange?.(() => syncChip(shouldPauseRunning() && Boolean(api.player.isRunning?.())));

  api.console?.register?.(
    'sregen_status',
    'Show Stamina Regeneration rate and current Fatigue',
    'sregen_status',
    () => {
      const vitals = api.player.getVitals();
      return `Stamina Regen: +${getRate().toFixed(1)} FP/s, pauseWhileRunning=${shouldPauseRunning()}, FP=${Math.floor(vitals.fatigue)}/${Math.floor(vitals.maxFatigue)}.`;
    },
  );

  api.console?.register?.(
    'sregen_drain',
    'Drain player Fatigue for testing regeneration: sregen_drain [amount]',
    'sregen_drain [30]',
    (args = []) => {
      const amt = Math.max(1, Number.parseInt(String(args[0] ?? '30'), 10) || 30);
      api.player.damageFatigue(amt);
      syncChip(false);
      const vitals = api.player.getVitals();
      return `Drained ${amt} FP -> ${Math.floor(vitals.fatigue)}/${Math.floor(vitals.maxFatigue)} FP.`;
    },
  );
}
