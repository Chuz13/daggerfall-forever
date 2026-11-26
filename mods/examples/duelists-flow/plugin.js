// @ts-check
// Duelist's Flow: Rhythmic Combat Combo System & Feat
// Author: 13

export default function init(api) {
  // 1. Register perk
  api.perks.register({
    id: 'duelists_trance',
    name: 'Duelist\'s Trance',
    desc: 'Combo system is active while this mod is enabled. Unlocks permanently upon reaching a 10-hit combo streak (without missing, within 6s between hits). Grants +5% hit chance and halves combo-break fatigue penalty (5 FP instead of 10 FP).',
  });

  // Ephemeral in-memory combo state (never bloats save files)
  let currentStreak = 0;
  let lastHitTimestamp = 0;
  const COMBO_TIMEOUT_MS = 6000; // 6 seconds between swings to keep momentum

  function syncFlowChip() {
    if (currentStreak < 2) {
      api.ui.clearStatusChip?.('flow');
      return;
    }
    const hasPerk = api.perks.has('duelists_trance');
    api.ui.setStatusChip?.('flow', {
      name: "Duelist's Flow",
      kind: hasPerk ? 'set' : 'buff',
      glyph: 'wild',
      foot: `x${currentStreak}`,
      meta: 'Combat combo',
      lines: [
        `Active streak: ${currentStreak} consecutive hits.`,
        'Milestones restore HP & Fatigue (x3: +12 FP, x5: +5 HP/+25 FP, x7+: +10 HP/+35 FP).',
        hasPerk
          ? "Duelist's Trance active: +5% hit chance, halved miss penalty (-5 FP)."
          : 'Reach x10 streak to unlock Duelist\'s Trance (+5% hit chance).',
      ],
      tipFoot: '6s window',
    });
  }

  // 2. Listen to combat attack resolutions
  api.events.on('combatAttackResolved', (evt) => {
    const { attacker, hit } = evt;
    if (!attacker?.isPlayer) return;

    const now = Date.now();
    if (currentStreak > 0 && now - lastHitTimestamp > COMBO_TIMEOUT_MS) {
      // Combo decayed naturally over time
      currentStreak = 0;
    }

    if (hit) {
      currentStreak++;
      lastHitTimestamp = now;

      // Update career best in persistent mod storage
      const best = api.storage.get('bestStreak', 0);
      if (currentStreak > best) {
        api.storage.set('bestStreak', currentStreak);
      }

      // Visual combo counter via native midScreen HUD
      if (currentStreak >= 2) {
        api.ui.showMidScreen(`⚔ COMBO x${currentStreak}`, 1.2);
      }

      // Tier 1: Flow State (3 hits)
      if (currentStreak === 3) {
        api.player.restoreFatigue(12);
        api.ui.notify(api.ui.t('combo.flow_state', 'Combo x3: Flow State! (+12 FP)'));
      }
      // Tier 2: Deadly Precision (5 hits)
      else if (currentStreak === 5) {
        api.player.heal(5);
        api.player.restoreFatigue(25);
        api.ui.notify(api.ui.t('combo.deadly_precision', 'Combo x5: Deadly Precision! (+5 HP, +25 FP)'));
      }
      // Tier 3: Master Duelist (7+ hits)
      else if (currentStreak >= 7 && currentStreak % 2 === 1) {
        api.player.heal(10);
        api.player.restoreFatigue(35);
        api.ui.notify(api.ui.t('combo.master_duelist', 'Combo x7: Master Duelist! Flow perfected! (+10 HP, +35 FP)'));
      }

      // Unlock feat milestone at 10-hit streak
      if (currentStreak >= 10 && !api.perks.has('duelists_trance')) {
        api.perks.unlock('duelists_trance');
        api.ui.notify(api.ui.t('combo.feat_unlocked', 'FEAT ACCOMPLISHED: Duelist\'s Trance unlocked!'));
      }
      syncFlowChip();
    } else {
      // Missed swing: break flow if combo was active
      if (currentStreak >= 2) {
        const hasPerk = api.perks.has('duelists_trance');
        const drain = hasPerk ? 5 : 10;
        api.player.damageFatigue(drain);
        api.ui.showMidScreen(api.ui.t('combo.broken', 'Flow broken!'), 1.0);
        api.ui.notify(api.ui.t('combo.broken_drain', 'Rhythm lost! (-{drain} FP)', { drain }));
      }
      currentStreak = 0;
      syncFlowChip();
    }
  });

  // 3. Reset combo on scene transitions, rests, or 6s inactivity
  const checkDecay = () => {
    if (currentStreak > 0 && Date.now() - lastHitTimestamp > COMBO_TIMEOUT_MS) {
      currentStreak = 0;
      syncFlowChip();
    }
  };
  api.events.on('worldTick', checkDecay);
  api.events.on('secondTick', checkDecay);
}

