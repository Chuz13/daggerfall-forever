// DFF ENHANCED MODS PANE
//
// Native in-game Mod Manager pane for Daggerfall Forever.
// Provides:
// - Discovery list with live status toggles (Enabled / Disabled)
// - Load Order reordering (Move Up / Down)
// - Direct door to open the local Mods directory
// - Full localization through textManager `t()`

import {
  discoverMods,
  getDiscoveredMods,
  setModEnabled,
  getModLoadOrder,
  setModLoadOrder,
} from '../../systems/mods/modRegistry.js';
import { syncModData } from '../../systems/mods/modDataSync.js';
import { unloadModPlugins, loadActiveModPlugins } from '../../systems/mods/modPluginLoader.js';
import { getModPerks, getAllRegisteredPerks } from '../../systems/mods/modPluginApi.js';
import { getAllPerks, getUnlockedPerks } from '../../systems/perks/perkRegistry.js';
import { playerEntity } from '../../characters/playerEntity.js';
import { t } from '../../systems/textManager.js';

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/**
 * Render the Native Mods Manager into the enhanced menu body.
 * @param {HTMLElement} body
 * @param {Function} rerender
 */
export function drawModsPane(body, rerender) {
  body.classList.add('wide');
  discoverMods();
  syncModData();

  // 1. Header Card with actions
  const topCard = el('div', 'card');
  topCard.append(el('h3', null, t('menu.mods.title', 'Mod Manager')));
  topCard.append(
    el(
      'p',
      'meta',
      t('menu.mods.blurb', 'Manage native mods and execution load order. Changes take effect safely.')
    )
  );

  const topActs = el('div', 'acts');
  const openFolderBtn = el('button', 'act', t('menu.mods.openFolder', 'Open Mods Folder'));
  openFolderBtn.type = 'button';
  openFolderBtn.onclick = () => {
    if (typeof window !== 'undefined' && window.daggerShell?.mods?.openFolder) {
      window.daggerShell.mods.openFolder();
    } else {
      alert(t('menu.mods.webFolderNotice', 'Mods folder is located in your application data directory.'));
    }
  };
  const rescanBtn = el('button', 'act', t('menu.mods.rescan', 'Rescan'));
  rescanBtn.type = 'button';
  rescanBtn.onclick = () => {
    discoverMods();
    syncModData();
    unloadModPlugins();
    void loadActiveModPlugins();
    if (typeof rerender === 'function') rerender();
  };
  topActs.append(openFolderBtn, rescanBtn);
  topCard.append(topActs);
  body.append(topCard);

  // 2. Mod List
  const mods = getDiscoveredMods();

  if (mods.length === 0) {
    const emptyCard = el('div', 'card');
    emptyCard.append(
      el('p', 'meta', t('menu.mods.empty', 'No mods found. Place mod folders into the Mods directory.'))
    );
    body.append(emptyCard);
    return;
  }

  const listContainer = el('div', 'mods-list');

  mods.forEach((mod, index) => {
    const card = el('div', 'card mod-card');

    // Header row: Checkbox + Title + Version + Author
    const headerRow = el('div', 'mod-header-row');
    headerRow.style.display = 'flex';
    headerRow.style.alignItems = 'center';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.gap = '12px';

    const titleArea = el('div', 'mod-title-area');
    titleArea.style.display = 'flex';
    titleArea.style.alignItems = 'center';
    titleArea.style.gap = '10px';

    // Toggle Checkbox
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = !!mod.enabled;
    toggle.title = mod.enabled ? t('menu.mods.enabled', 'Enabled') : t('menu.mods.disabled', 'Disabled');
    toggle.onchange = () => {
      setModEnabled(mod.id, toggle.checked);
      syncModData();
      unloadModPlugins();
      void loadActiveModPlugins();
      if (typeof rerender === 'function') rerender();
    };

    const titleText = `${mod.manifest?.name || mod.id}${mod.manifest?.version ? ` v${mod.manifest.version}` : ''}`;
    const h3 = el('h3', null, titleText);
    h3.style.margin = '0';
    h3.style.display = 'inline-block';

    titleArea.append(toggle, h3);

    // Tags (Data / Script)
    const tags = el('div', 'mod-tags');
    tags.style.display = 'flex';
    tags.style.gap = '6px';

    if (mod.manifest?.data && Object.keys(mod.manifest.data).length > 0) {
      const dataTag = el('span', 'tag-data', 'Data');
      dataTag.style.fontSize = '0.75rem';
      dataTag.style.padding = '2px 6px';
      dataTag.style.borderRadius = '4px';
      dataTag.style.background = 'rgba(70, 130, 180, 0.3)';
      dataTag.style.border = '1px solid rgba(70, 130, 180, 0.6)';
      tags.append(dataTag);
    }

    if (mod.manifest?.entry) {
      const scriptTag = el('span', 'tag-script', 'Script');
      scriptTag.style.fontSize = '0.75rem';
      scriptTag.style.padding = '2px 6px';
      scriptTag.style.borderRadius = '4px';
      scriptTag.style.background = 'rgba(180, 130, 70, 0.3)';
      scriptTag.style.border = '1px solid rgba(180, 130, 70, 0.6)';
      tags.append(scriptTag);
    }

    headerRow.append(titleArea, tags);
    card.append(headerRow);

    // Author & Description
    if (mod.manifest?.author) {
      card.append(el('p', 'meta', `${t('menu.mods.byAuthor', 'By')} ${mod.manifest.author}`));
    }
    if (mod.manifest?.description) {
      card.append(el('p', null, mod.manifest.description));
    }
    if (mod.error) {
      const errLine = el('p', 'meta', `${t('menu.mods.error', 'Error')}: ${mod.error}`);
      errLine.style.color = '#ff6b6b';
      card.append(errLine);
    }

    // Perks / Milestones registered by mod
    const perks = getModPerks(mod.id);
    if (perks && perks.length > 0) {
      const perksBox = el('div', 'mod-perks-box');
      perksBox.style.marginTop = '8px';
      perksBox.style.padding = '6px 10px';
      perksBox.style.background = 'rgba(0,0,0,0.3)';
      perksBox.style.borderRadius = '4px';
      perksBox.style.border = '1px solid rgba(255,255,255,0.08)';

      const title = el('div', 'meta', t('menu.mods.perks', 'Perks:'));
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '4px';
      title.style.color = '#e0c068';
      perksBox.append(title);

      perks.forEach((p) => {
        const item = el('div', 'mod-perk-item');
        item.style.fontSize = '12px';
        item.style.color = '#ccc';
        const isUnlocked = playerEntity ? getUnlockedPerks(playerEntity).includes(p.id) : false;
        item.textContent = `${isUnlocked ? '★ [UNLOCKED]' : '☆ [LOCKED]'} ${p.name}: ${p.desc}`;
        perksBox.append(item);
      });
      card.append(perksBox);
    }

    // Load Order controls (Move Up / Down)
    const actRow = el('div', 'acts');
    actRow.style.marginTop = '10px';

    if (index > 0) {
      const upBtn = el('button', 'act', t('menu.mods.up', '▲ Move Up'));
      upBtn.type = 'button';
      upBtn.onclick = () => {
        const order = mods.map((m) => m.id);
        const temp = order[index - 1];
        order[index - 1] = order[index];
        order[index] = temp;
        setModLoadOrder(order);
        syncModData();
        unloadModPlugins();
        void loadActiveModPlugins();
        if (typeof rerender === 'function') rerender();
      };
      actRow.append(upBtn);
    }

    if (index < mods.length - 1) {
      const downBtn = el('button', 'act', t('menu.mods.down', '▼ Move Down'));
      downBtn.type = 'button';
      downBtn.onclick = () => {
        const order = mods.map((m) => m.id);
        const temp = order[index + 1];
        order[index + 1] = order[index];
        order[index] = temp;
        setModLoadOrder(order);
        syncModData();
        unloadModPlugins();
        void loadActiveModPlugins();
        if (typeof rerender === 'function') rerender();
      };
      actRow.append(downBtn);
    }

    card.append(actRow);
    listContainer.append(card);
  });

  body.append(listContainer);

  // All Perks provided by installed mods summary card
  const perksCard = el('div', 'card');
  perksCard.style.marginTop = '12px';
  perksCard.append(el('h3', null, t('menu.mods.allPerksTitle', 'All Perks Added by Mods')));
  perksCard.append(el('p', 'meta', t('menu.mods.allPerksDesc', 'List of all milestone feats provided by discovered mods and their current activation status.')));

  const installedMods = getDiscoveredMods();
  let totalPerksFound = 0;

  installedMods.forEach((m) => {
    const perks = getModPerks(m.id);
    if (!perks || perks.length === 0) return;
    const isModActive = !!m.enabled;

    perks.forEach((p) => {
      totalPerksFound++;
      const row = el('div', 'mod-perk-item');
      row.style.fontSize = '13px';
      row.style.marginTop = '6px';
      row.style.padding = '4px 8px';
      row.style.borderRadius = '4px';
      row.style.background = isModActive ? 'rgba(224, 195, 106, 0.08)' : 'rgba(255, 255, 255, 0.03)';
      row.style.border = isModActive ? '1px solid rgba(224, 195, 106, 0.25)' : '1px solid rgba(255, 255, 255, 0.06)';

      const head = el('div', null);
      const nameSpan = el('strong', null, p.name);
      nameSpan.style.color = isModActive ? '#e0c36a' : '#888';

      const modBadge = el('span', 'meta', ` (${m.manifest?.name || m.id}) `);
      modBadge.style.fontSize = '11px';

      const statusBadge = el('span', null, isModActive ? '[ENABLED]' : '[DISABLED]');
      statusBadge.style.fontWeight = 'bold';
      statusBadge.style.fontSize = '11px';
      statusBadge.style.color = isModActive ? '#78c278' : '#e06868';
      statusBadge.style.float = 'right';

      head.append(nameSpan, modBadge, statusBadge);

      const desc = el('div', 'meta', p.desc || (/** @type {any} */ (p)).description || '');
      desc.style.fontSize = '12px';
      desc.style.marginTop = '2px';
      desc.style.color = isModActive ? '#ccc' : '#666';

      row.append(head, desc);
      perksCard.append(row);
    });
  });

  if (totalPerksFound === 0) {
    const empty = el('p', 'meta', t('menu.mods.noPerksFound', 'No mods with perks are currently installed.'));
    empty.style.fontStyle = 'italic';
    perksCard.append(empty);
  }

  body.append(perksCard);
}

