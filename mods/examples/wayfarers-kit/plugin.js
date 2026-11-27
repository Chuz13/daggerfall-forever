// @ts-check
// Wayfarer's Kit: Showcase content mod (custom item, spell, legendary + MCM + HUD chip)
// Author: 13

export const WAYFARER_TONIC_TEMPLATE = 9101;
export const WAYFARER_STRIDE_SPELL = 9101;
export const WAYFARER_SIGNET_ID = 'wayfarers-signet';

export default function init(api) {
  let remainingSec = 0;

  const getFatigue = () => Math.max(1, Number(api.settings?.get?.('tonicFatigue')) || 35);
  const getHeal = () => Math.max(1, Number(api.settings?.get?.('tonicHeal')) || 15);
  const getDuration = () => Math.max(5, Number(api.settings?.get?.('buffDuration')) || 45);
  const isChipVisible = () => api.settings?.get?.('showChip') !== false;

  function syncChip() {
    if (remainingSec <= 0 || !isChipVisible()) {
      api.ui.clearStatusChip?.('wayfarer');
      return;
    }
    api.ui.setStatusChip?.('wayfarer', {
      name: api.ui.t('wk.chip.name', "Wayfarer's Pace"),
      kind: 'buff',
      glyph: 'wild',
      foot: '+15%',
      meta: api.ui.t('wk.chip.meta', 'Tonic buff'),
      lines: [
        api.ui.t('wk.chip.line.pace', 'Weapon swing pace +15% from Wayfarer\'s Tonic.'),
        api.ui.t('wk.chip.line.timer', 'Expires in {sec}s.', { sec: remainingSec }),
      ],
      tipFoot: `${remainingSec}s`,
    });
  }

  api.modifiers.swingPace('wayfarer_tonic', () => (remainingSec > 0 ? 15 : 0));

  api.items.onUse(WAYFARER_TONIC_TEMPLATE, (_item, _list, ctx) => {
    const hp = getHeal();
    const fp = getFatigue();
    const dur = getDuration();

    ctx.consume();
    api.player.heal(hp);
    api.player.restoreFatigue(fp);
    remainingSec = dur;
    syncChip();

    try {
      api.audio.play('PotionDrink', 0.7);
    } catch {}

    const msg = api.ui.t('wk.use.drank', "You drink the Wayfarer's Tonic (+{hp} HP, +{fp} FP, +15% pace for {sec}s).", {
      hp,
      fp,
      sec: dur,
    });
    return msg;
  });

  api.events.on('secondTick', () => {
    if (remainingSec <= 0) return;
    remainingSec = Math.max(0, remainingSec - 1);
    syncChip();
  });

  api.settings?.onChange?.(() => syncChip());

  api.console?.register?.(
    'wayfarer_give',
    "Grant Wayfarer's Tonic (x3), Wayfarer's Stride spell, and Wayfarer's Signet ring",
    'wayfarer_give',
    () => {
      const tonic = api.items.give(WAYFARER_TONIC_TEMPLATE, { count: 3 });
      const spellGranted = api.spells.grant(WAYFARER_STRIDE_SPELL);
      const ring = api.items.giveLegendary(WAYFARER_SIGNET_ID);
      return `Wayfarer's Kit granted: tonic=${tonic ? 'x3' : 'no-player'}, spell=${spellGranted ? 'added' : 'already/none'}, signet=${ring ? ring.name : 'none'}.`;
    },
  );

  api.console?.register?.(
    'wayfarer_status',
    "Show Wayfarer's Kit buff timer and spell ownership",
    'wayfarer_status',
    () =>
      `Wayfarer's Kit: buff=${remainingSec}s, hasStride=${api.spells.has(WAYFARER_STRIDE_SPELL)}, heal=${getHeal()}, fatigue=${getFatigue()}, dur=${getDuration()}s.`,
  );
}
