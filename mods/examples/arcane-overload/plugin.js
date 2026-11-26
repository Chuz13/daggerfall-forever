// @ts-check
// Arcane Overload: Spellcasting Momentum & Free-Cast Cycle
// Author: 13

export default function init(api) {
  let charges = 0; // 0..4
  let decaySeconds = 0;
  const MAX_CHARGES = 4;
  const DECAY_DURATION = 15;

  function syncChip() {
    if (charges <= 0) {
      api.ui.clearStatusChip('overload');
      return;
    }
    const power = charges * 10;
    const speed = charges * 8;
    const cost = charges * 15;
    const isFree = charges >= MAX_CHARGES;

    api.ui.setStatusChip('overload', {
      name: api.ui.t('ao.chip.name', 'Arcane Overload'),
      kind: isFree ? 'set' : 'buff',
      glyph: 'arcane',
      foot: isFree ? 'FREE' : `${charges}/${MAX_CHARGES}`,
      blink: isFree,
      meta: api.ui.t('ao.chip.meta', 'Arcane state'),
      lines: [
        api.ui.t('ao.chip.line.power', 'Spell Power: +{power}% | Cast Speed: +{speed}%', { power, speed }),
        isFree
          ? api.ui.t('ao.chip.line.free', 'OVERCHARGED: Next spell costs 0 Magicka!')
          : api.ui.t('ao.chip.line.cost', 'Mana Cost: +{cost}% (Next cast builds charge)', { cost }),
        api.ui.t('ao.chip.line.decay', 'Decays in {sec}s without casting.', { sec: decaySeconds }),
      ],
      tipFoot: `${decaySeconds}s`,
    });
  }

  // Register live spellcasting modifiers (auto-removed when mod is disabled)
  api.modifiers.castSpeed('overload', () => charges * 8);
  api.modifiers.spellPower('overload', () => charges * 10);
  api.modifiers.spellCost('overload', (_entity, sp) =>
    charges > 0 && charges < MAX_CHARGES ? Math.round(sp * (1 + charges * 0.15)) : sp,
  );
  api.modifiers.spellFreeCast('overload', () => charges >= MAX_CHARGES);

  // Build charge or discharge on player spell cast
  api.events.on('playerCast', () => {
    if (charges >= MAX_CHARGES) {
      charges = 0;
      decaySeconds = 0;
      syncChip();
      api.ui.showMidScreen(api.ui.t('ao.mid.discharge', '⚡ OVERLOAD DISCHARGED!'), 1.3);
      api.audio.play('CastSpell3', 0.7);
      return;
    }

    charges = Math.min(MAX_CHARGES, charges + 1);
    decaySeconds = DECAY_DURATION;

    if (charges >= MAX_CHARGES) {
      api.ui.showMidScreen(api.ui.t('ao.mid.free', '⚡ ARCANE OVERCHARGE!'), 1.5);
      api.ui.notify(
        api.ui.t('ao.notify.ready', 'Arcane Overload x4: Next spell is FREE (+{power}% power)!', {
          power: charges * 10,
        }),
      );
      api.audio.play('ArenaFanfareLevelUp', 0.5);
    }

    const vitals = api.player.getVitals();
    if (charges >= 2 && vitals.maxMagicka > 0 && vitals.magicka / vitals.maxMagicka < 0.15) {
      const dmg = 3;
      api.player.damageHealth(dmg);
      api.ui.notify(api.ui.t('ao.notify.burn', 'Arcane Overload seared you for {dmg} HP!', { dmg }));
    }

    syncChip();
  });

  // 1-second decay timer during active gameplay
  api.events.on('secondTick', () => {
    if (charges <= 0) return;
    decaySeconds -= 1;
    if (decaySeconds <= 0) {
      charges = 0;
      decaySeconds = 0;
    }
    syncChip();
  });

  // Console commands for fast testing
  api.console.register(
    'overload_set',
    'Set Arcane Overload stacks (0..4): overload_set <n>',
    'overload_set <0..4>',
    (args = []) => {
      const n = Number.parseInt(String(args[0] ?? ''), 10);
      if (!Number.isFinite(n) || n < 0 || n > MAX_CHARGES) {
        return `Usage: overload_set <0..${MAX_CHARGES}>`;
      }
      charges = n;
      decaySeconds = n > 0 ? DECAY_DURATION : 0;
      syncChip();
      return `Arcane Overload set to ${charges}/${MAX_CHARGES} (power +${charges * 10}%, castSpeed +${charges * 8}%, freeCast=${charges >= MAX_CHARGES}).`;
    },
  );

  api.console.register(
    'overload_status',
    'Show current Arcane Overload stacks and modifiers',
    'overload_status',
    () =>
      `Arcane Overload: ${charges}/${MAX_CHARGES}, decay=${decaySeconds}s, power=+${charges * 10}%, speed=+${charges * 8}%, cost=+${charges > 0 && charges < MAX_CHARGES ? charges * 15 : 0}%, freeCast=${charges >= MAX_CHARGES}.`,
  );
}
