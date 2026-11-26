// @ts-check
// Stealth Auto-Steal: Auto-switch to Steal interaction mode while crouching/sneaking
// Author: 13

export default function init(api) {
  let savedMode = null;
  let autoActive = false;

  function showChip() {
    if (api.settings?.get?.('showChip') === false) {
      api.ui.clearStatusChip('autosteal');
      return;
    }
    api.ui.setStatusChip('autosteal', {
      name: api.ui.t('sas.chip.name', 'Auto-Steal'),
      kind: 'buff',
      glyph: 'stealth',
      foot: api.ui.t('sas.chip.foot', 'STEAL'),
      meta: api.ui.t('sas.chip.meta', 'Stealth mod'),
      lines: [
        api.ui.t('sas.chip.line.active', 'Interaction mode switched to Steal while crouching/sneaking.'),
        api.ui.t('sas.chip.line.restore', 'Standing up will restore {mode} mode.', { mode: savedMode ?? 'grab' }),
      ],
    });
  }

  function syncStealth(stealthy) {
    if (stealthy) {
      if (api.settings?.get?.('enabledOnCrouch') === false) return;
      if (!autoActive) {
        const cur = api.player.getInteractionMode();
        if (cur !== 'steal') {
          savedMode = cur;
          autoActive = true;
          api.player.setInteractionMode('steal', { notify: false });
          showChip();
        }
      }
      return;
    }

    if (autoActive) {
      if (api.settings?.get?.('restoreMode') !== false && savedMode && api.player.getInteractionMode() === 'steal') {
        api.player.setInteractionMode(savedMode, { notify: false });
      }
      savedMode = null;
      autoActive = false;
      api.ui.clearStatusChip('autosteal');
    }
  }

  api.settings?.onChange?.(() => {
    if (autoActive) {
      if (api.settings?.get?.('enabledOnCrouch') === false) {
        syncStealth(false);
      } else {
        showChip();
      }
    } else {
      syncStealth(api.player.isCrouching() || api.player.isSneaking());
    }
  });

  api.events.on('player:crouchChanged', ({ crouching }) => {
    syncStealth(Boolean(crouching || api.player.isSneaking()));
  });

  api.events.on('player:sneakChanged', ({ sneaking }) => {
    syncStealth(Boolean(sneaking || api.player.isCrouching()));
  });

  // Respect manual F1-F4 mode selection by the player while crouched
  api.events.on('player:interactionModeChanged', ({ source }) => {
    if (source === 'player' && autoActive) {
      savedMode = null;
      autoActive = false;
      api.ui.clearStatusChip('autosteal');
    }
  });

  // Sync immediately if mod is toggled on while already crouched
  syncStealth(api.player.isCrouching() || api.player.isSneaking());

  api.console.register(
    'autosteal_status',
    'Show Stealth Auto-Steal state and current interaction mode',
    'autosteal_status',
    () =>
      `Auto-Steal: autoActive=${autoActive}, savedMode=${savedMode ?? 'none'}, currentMode=${api.player.getInteractionMode()}, crouching=${api.player.isCrouching()}, sneaking=${api.player.isSneaking()}.`,
  );
}
