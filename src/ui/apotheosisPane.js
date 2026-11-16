// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS PANE (Pause › Apotheosis tab + Interactive Artifact Sacrifice Picker)
//
// Renders inside the standard Pause journal window (.px-journal / .px-qrail / .px-qdetail).
// Sub-sections:
//   - Overview (Ascension status, questline notification, active Portfolio, Fate Weight bar, Artifact Sacrifice launch)
//   - Fate Weight categories: CHIM & Mind / Blood & Crucible / Dominion & World (toggled by `apotheosisShowTracker`)
//   - Divine Portfolio (4 domains + free domain switching once Ascended)
// ═══════════════════════════════════════════════════════════════════════════════

import { playerEntity } from '../characters/playerEntity.js';
import { MOBILE_TYPES } from '../characters/mobile/mobileTypes.js';
import { t } from '../systems/textManager.js';
import { getPref } from '../systems/uiPrefs.js';
import { worldMinutes } from '../systems/worldTick.js';
import {
  APOTHEOSIS_PORTFOLIOS,
  APOTHEOSIS_PORTFOLIO_SWITCH_COST,
  APOTHEOSIS_MYTHIC_DECAY_FLAT,
  APOTHEOSIS_QUEST_STEPS,
  APOTHEOSIS_STAGES,
  AURBIS_COMMAND_CATALOG,
  REQUIRED_ARTIFACTS_COUNT,
  REQUIRED_FATE_WEIGHT,
  TOTAL_FATE_TRIGGERS,
  canStartApotheosisViaArtifacts,
  ensureApotheosisState,
  evaluateAurbisCommand,
  evaluateFateWeight,
  executeAurbisCommand,
  getAurbisRuntime,
  getFaithMax,
  getPortfolioSwitchCooldownInfo,
  getSpawnCreatureFaithCost,
  scanInventoryArtifactsForApotheosis,
  selectApotheosisPortfolio,
  startApotheosisFromArtifacts,
} from '../systems/apotheosis/apotheosisCore.js';

export const APOTHEOSIS_STYLE_ID = 'df-apotheosis-css';

const APOTHEOSIS_CSS = `
.apo-pane { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.apo-pane > .px-journal { flex: 1; min-height: 0; }
.apo-pane .px-qdetail { min-height: 0; overflow-y: auto; }
.apo-hero { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 2px solid rgba(190,165,98,0.45); background: rgba(12,15,22,0.65); margin-bottom: 14px; }
.apo-hero-title { font-size: 20px; color: rgb(243,239,44); text-shadow: 2px 2px 0 rgba(0,0,0,0.85); }
.apo-badge { display: inline-block; padding: 4px 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid rgba(190,165,98,0.65); background: rgba(24,28,38,0.85); color: #efe3bc; }
.apo-badge.ascended { border-color: rgb(243,239,44); color: rgb(243,239,44); background: rgba(52,44,14,0.8); }
.apo-badge.awaiting { border-color: #7cd4ff; color: #b9eaff; background: rgba(16,42,58,0.85); }
.apo-banner { padding: 12px 14px; margin-bottom: 14px; border: 2px solid rgba(124,212,255,0.6); background: rgba(14,34,48,0.75); color: #e2f5ff; font-size: 14px; line-height: 1.45; }
.apo-notice { padding: 10px 12px; margin-bottom: 12px; border: 1px solid rgba(243,239,44,0.5); background: rgba(34,29,12,0.72); color: #f6eec6; font-size: 14px; }
.apo-notice.err { border-color: rgba(235,96,96,0.7); background: rgba(54,16,18,0.78); color: #ffd4d4; }
.apo-box { padding: 12px 14px; margin-bottom: 14px; border: 1px solid rgba(125,116,96,0.5); background: rgba(11,14,20,0.55); }
.apo-box h4 { margin: 0 0 8px; font-size: 16px; color: #efe3bc; letter-spacing: 0.04em; text-transform: uppercase; }
.apo-bar-wrap { height: 14px; background: rgba(0,0,0,0.65); border: 1px solid rgba(125,116,96,0.55); margin: 8px 0; overflow: hidden; }
.apo-bar-fill { height: 100%; background: linear-gradient(90deg, #9f7d2a, #f3ef2c); transition: width 0.2s ease; }
.apo-meta-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; color: #c7bfa7; }
.apo-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.apo-btn { font: inherit; font-size: 14px; padding: 8px 14px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; color: #efe3bc; background: rgba(30,35,46,0.9); border: 2px solid rgba(190,165,98,0.65); text-shadow: 1px 1px 0 #000; }
.apo-btn:hover:not(:disabled) { color: rgb(243,239,44); border-color: rgb(243,239,44); background: rgba(45,42,20,0.9); }
.apo-btn:disabled { opacity: 0.48; cursor: not-allowed; border-color: rgba(125,116,96,0.4); color: #9c9482; }
.apo-btn.primary { border-color: rgb(243,239,44); color: rgb(243,239,44); background: rgba(48,40,12,0.88); }
.apo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.apo-card { padding: 10px 12px; border: 1px solid rgba(125,116,96,0.45); background: rgba(14,17,24,0.72); display: flex; flex-direction: column; gap: 6px; }
.apo-card.done { border-color: rgba(154,214,116,0.65); background: rgba(18,32,20,0.66); }
.apo-card.active { border-color: rgb(243,239,44); background: rgba(44,38,14,0.72); }
.apo-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.apo-card-title { font-size: 15px; color: #f1e6c1; font-weight: bold; }
.apo-pill { font-size: 12px; padding: 2px 7px; border: 1px solid rgba(125,116,96,0.5); color: #b7af9b; white-space: nowrap; }
.apo-pill.ok { border-color: #82d46e; color: #b7f5a3; background: rgba(20,48,22,0.8); }
.apo-card-desc { font-size: 13px; line-height: 1.4; color: #c7bfa7; }
.apo-card-prog { font-size: 12px; color: #dfd4b0; margin-top: auto; }
.apo-picker-backdrop { position: fixed; inset: 0; z-index: 95; background: rgba(5,7,11,0.82); display: flex; align-items: center; justify-content: center; padding: 20px; }
.apo-picker-modal { width: min(820px, 95vw); max-height: 84vh; display: flex; flex-direction: column; border: 2px solid rgba(190,165,98,0.8); background: #12151e; box-shadow: 0 18px 46px rgba(0,0,0,0.88); }
.apo-picker-head { padding: 14px 18px; border-bottom: 1px solid rgba(125,116,96,0.45); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.apo-picker-title { font-size: 18px; color: rgb(243,239,44); text-transform: uppercase; letter-spacing: 0.05em; }
.apo-picker-sub { padding: 10px 18px 0; font-size: 13px; color: #c7bfa7; }
.apo-picker-scroll { flex: 1; min-height: 180px; overflow-y: auto; padding: 14px 18px; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; align-content: start; }
.apo-art-card { text-align: left; font: inherit; padding: 10px 12px; border: 2px solid rgba(125,116,96,0.5); background: rgba(18,22,30,0.85); color: #dfd4b0; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
.apo-art-card:hover:not(:disabled) { border-color: rgba(243,239,44,0.7); }
.apo-art-card.sel { border-color: rgb(243,239,44); background: rgba(54,44,12,0.85); color: #fff8cf; }
.apo-art-card.eq, .apo-art-card:disabled { opacity: 0.52; cursor: not-allowed; }
.apo-art-name { font-size: 14px; font-weight: bold; }
.apo-art-meta { font-size: 12px; color: #b9b09a; }
.apo-picker-foot { padding: 12px 18px; border-top: 1px solid rgba(125,116,96,0.45); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; }
.apo-bar-fill.faith { background: linear-gradient(90deg, #3c7ea8, #7cd4ff); }
.apo-aurbis-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.apo-aurbis-miracle { text-align: left; display: flex; flex-direction: column; gap: 4px; padding: 9px 11px; border: 1px solid rgba(190,165,98,0.5); background: rgba(16,20,29,0.85); color: #efe3bc; cursor: pointer; font: inherit; }
.apo-aurbis-miracle:hover:not(:disabled) { border-color: #7cd4ff; background: rgba(20,34,48,0.88); }
.apo-aurbis-miracle:disabled { opacity: 0.45; cursor: not-allowed; }
.apo-aurbis-card { padding: 9px 11px; border: 1px solid rgba(190,165,98,0.5); background: rgba(16,20,29,0.85); display: flex; flex-direction: column; gap: 6px; }
.apo-aurbis-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.apo-input { flex: 1; min-width: 220px; font: inherit; font-size: 14px; padding: 8px 10px; color: #f6eec6; background: rgba(6,8,14,0.9); border: 1px solid rgba(190,165,98,0.65); outline: none; }
.apo-input:focus { border-color: #7cd4ff; }
.apo-select { width: 100%; font: inherit; font-size: 13px; padding: 6px 8px; color: #f6eec6; background: rgba(6,8,14,0.92); border: 1px solid rgba(190,165,98,0.6); }
.apo-aurbis-preview { font-size: 13px; margin-top: 8px; color: #b9eaff; }
.apo-aurbis-preview.err { color: #ff9c9c; }
.apo-aurbis-preview.aligned { color: #9cf29e; }
.apo-aurbis-preview.opposed { color: #ffbe80; }
.apo-aurbis-log { max-height: 150px; overflow-y: auto; padding: 8px 10px; background: rgba(5,7,11,0.85); border: 1px solid rgba(125,116,96,0.45); font-family: monospace; font-size: 12px; color: #dfd4b0; white-space: pre-wrap; display: flex; flex-direction: column; gap: 6px; }
.apo-aurbis-ref { max-height: 250px; overflow-y: auto; margin-top: 10px; padding: 10px; background: rgba(8,10,16,0.9); border: 1px solid rgba(125,116,96,0.55); display: flex; flex-direction: column; gap: 10px; }
.apo-ref-cat { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: rgb(243,239,44); margin-bottom: 4px; }
.apo-ref-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 1px solid rgba(125,116,96,0.3); background: rgba(16,20,28,0.65); cursor: pointer; text-align: left; font: inherit; color: #efe3bc; width: 100%; }
.apo-ref-row:hover { border-color: #7cd4ff; background: rgba(18,32,44,0.8); }
`;

const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(APOTHEOSIS_STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = APOTHEOSIS_STYLE_ID;
  st.textContent = APOTHEOSIS_CSS;
  (document.head ?? document.body).append(st);
}

let activeSec = 'overview';
let pickerOpen = false;
let selectedItems = [];
let statusMessage = null;
let statusIsError = false;
let aurbisInputText = '';
let aurbisSelectedMob = 'Rat';
let aurbisShowCatalog = false;
let aurbisHistory = [];
let aurbisHistoryIdx = -1;
let aurbisLog = [];

const SPAWNABLE_MOBILES = Object.entries(MOBILE_TYPES)
  .filter(([name, id]) => name !== 'None' && name !== 'Horse_Invalid' && id < 65535)
  .sort((a, b) => a[1] - b[1]);

/** Pre-selects a specific sub-section (`overview`, `meta`, `blood`, `power`, `portfolio`, `aurbis`) before opening the pane. */
export function selectApotheosisSection(sec) {
  const valid = new Set(['overview', 'meta', 'blood', 'power', 'portfolio', 'aurbis']);
  if (valid.has(sec)) {
    activeSec = sec;
  }
}

/** Releases Apotheosis UI state when the Pause menu closes or unmounts. */
export function releaseApotheosisPane() {
  activeSec = 'overview';
  pickerOpen = false;
  selectedItems = [];
  statusMessage = null;
  statusIsError = false;
  aurbisInputText = '';
  aurbisShowCatalog = false;
  aurbisHistoryIdx = -1;
}

function setFeedback(msg, isError = false) {
  statusMessage = msg;
  statusIsError = !!isError;
}

function currentSections(trackerShown) {
  const secs = [['overview', t('apotheosis.sec.overview', 'Ascension Overview')]];
  if (trackerShown) {
    secs.push(['meta', t('apotheosis.sec.meta', 'CHIM & Mind')]);
    secs.push(['blood', t('apotheosis.sec.blood', 'Blood & Crucible')]);
    secs.push(['power', t('apotheosis.sec.power', 'Dominion & World')]);
  }
  secs.push(['portfolio', t('apotheosis.sec.portfolio', 'Divine Portfolio')]);
  secs.push(['aurbis', t('apotheosis.nav.aurbis', 'Scroll of Aurbis')]);
  return secs;
}

function stageBadgeText(state) {
  if (state.ascended || state.stage === APOTHEOSIS_STAGES.ASCENDED) {
    return t('apotheosis.stage.ascended', 'Ascended Divinity');
  }
  if (state.stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE) {
    return t('apotheosis.stage.questline', 'Walking the Path of CHIM');
  }
  if (state.stage === APOTHEOSIS_STAGES.AWAITING_PORTFOLIO) {
    return t('apotheosis.stage.awaiting', 'Awakened Vessel');
  }
  return t('apotheosis.stage.mortal', 'Mortal Aspirant');
}

function stageBadgeClass(state) {
  if (state.ascended || state.stage === APOTHEOSIS_STAGES.ASCENDED) return 'apo-badge ascended';
  if (state.stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE) return 'apo-badge awaiting';
  if (state.stage === APOTHEOSIS_STAGES.AWAITING_PORTFOLIO) return 'apo-badge awaiting';
  return 'apo-badge';
}

function autoPickDistinctArtifacts(entries) {
  const picked = [];
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.subType)) continue;
    seen.add(e.subType);
    picked.push(e.item);
    if (picked.length >= REQUIRED_ARTIFACTS_COUNT) break;
  }
  return picked;
}

function renderPickerModal(root, repaint, entity) {
  const scan = scanInventoryArtifactsForApotheosis(entity);
  // Drop any item references no longer in pack
  const liveSet = new Set(scan.unequippedEntries.map((e) => e.item));
  selectedItems = selectedItems.filter((it) => liveSet.has(it));
  const selectedSet = new Set(selectedItems);
  const selectedSubTypes = new Set(
    scan.unequippedEntries.filter((e) => selectedSet.has(e.item)).map((e) => e.subType),
  );

  const backdrop = el('div', 'apo-picker-backdrop');
  const modal = el('div', 'apo-picker-modal');

  const head = el('div', 'apo-picker-head');
  head.append(
    el('div', 'apo-picker-title', t('apotheosis.picker.title', 'Select Artifacts to Shatter')),
    el('div', 'apo-pill' + (selectedItems.length === REQUIRED_ARTIFACTS_COUNT ? ' ok' : ''),
      t('apotheosis.picker.counter', '{cur}/{req} selected', { cur: selectedItems.length, req: REQUIRED_ARTIFACTS_COUNT })),
  );
  modal.append(head);

  modal.append(el('div', 'apo-picker-sub',
    t('apotheosis.picker.help', 'Choose {req} distinct unequipped Daedric artifacts from your pack. Equipped artifacts remain protected.', {
      req: REQUIRED_ARTIFACTS_COUNT,
    })));

  const scroll = el('div', 'apo-picker-scroll');
  for (const entry of scan.unequippedEntries) {
    const isSel = selectedSet.has(entry.item);
    const sameSubAlreadyPicked = !isSel && selectedSubTypes.has(entry.subType);
    const limitReached = !isSel && selectedItems.length >= REQUIRED_ARTIFACTS_COUNT;
    const card = el('button', `apo-art-card${isSel ? ' sel' : ''}`);
    card.disabled = sameSubAlreadyPicked || limitReached;
    card.append(
      el('div', 'apo-art-name', entry.name),
      el('div', 'apo-art-meta', isSel
        ? t('apotheosis.picker.cardSelected', 'Selected for sacrifice')
        : sameSubAlreadyPicked
          ? t('apotheosis.picker.cardDuplicate', 'Duplicate subtype selected')
          : t('apotheosis.picker.cardPack', 'In Pack · Unequipped')),
    );
    card.onclick = () => {
      if (isSel) {
        selectedItems = selectedItems.filter((it) => it !== entry.item);
      } else if (selectedItems.length < REQUIRED_ARTIFACTS_COUNT && !selectedSubTypes.has(entry.subType)) {
        selectedItems = [...selectedItems, entry.item];
      }
      repaint();
    };
    scroll.append(card);
  }
  for (const entry of scan.equippedEntries) {
    const card = el('button', 'apo-art-card eq');
    card.disabled = true;
    card.append(
      el('div', 'apo-art-name', entry.name),
      el('div', 'apo-art-meta', t('apotheosis.picker.cardEquipped', 'Equipped · Unequip first')),
    );
    scroll.append(card);
  }
  modal.append(scroll);

  const foot = el('div', 'apo-picker-foot');
  const leftActs = el('div', 'apo-acts');
  const autoBtn = el('button', 'apo-btn', t('apotheosis.picker.autoSelect', 'Auto-Select 13'));
  autoBtn.disabled = scan.distinctUnequippedCount < REQUIRED_ARTIFACTS_COUNT;
  autoBtn.onclick = () => {
    selectedItems = autoPickDistinctArtifacts(scan.unequippedEntries);
    repaint();
  };
  const clearBtn = el('button', 'apo-btn', t('apotheosis.picker.clear', 'Clear'));
  clearBtn.disabled = selectedItems.length === 0;
  clearBtn.onclick = () => {
    selectedItems = [];
    repaint();
  };
  leftActs.append(autoBtn, clearBtn);

  const rightActs = el('div', 'apo-acts');
  const cancelBtn = el('button', 'apo-btn', t('apotheosis.picker.cancel', 'Cancel'));
  cancelBtn.onclick = () => {
    pickerOpen = false;
    repaint();
  };
  const confirmBtn = el('button', 'apo-btn primary',
    t('apotheosis.picker.confirm', 'Shatter {cur}/{req}', { cur: selectedItems.length, req: REQUIRED_ARTIFACTS_COUNT }));
  confirmBtn.disabled = selectedItems.length !== REQUIRED_ARTIFACTS_COUNT;
  confirmBtn.onclick = () => {
    const res = startApotheosisFromArtifacts(entity, selectedItems);
    if (res.ok) {
      pickerOpen = false;
      selectedItems = [];
      setFeedback(res.notice, false);
    } else {
      setFeedback(res.error, true);
    }
    repaint();
  };
  rightActs.append(cancelBtn, confirmBtn);
  foot.append(leftActs, rightActs);
  modal.append(foot);

  backdrop.append(modal);
  root.append(backdrop);
}

function liveWitnessCount(entity, state) {
  if (state.debugWitnessCount != null) return state.debugWitnessCount;
  try {
    return Math.max(0, Math.trunc(Number(getAurbisRuntime().getSceneContext?.()?.getNearbyWitnessCount?.() ?? 0)));
  } catch {
    return 0;
  }
}

function renderFaithBox(container, state, entity) {
  const faith = Math.max(0, Math.trunc(Number(state?.faith) || 0));
  const faithMax = getFaithMax(state);
  const pct = faithMax > 0 ? Math.min(100, Math.round((faith / faithMax) * 100)) : 0;
  const box = el('div', 'apo-box');
  box.append(el('h4', null, t('apotheosis.faith.title', 'Divine Faith Reservoir')));
  const barWrap = el('div', 'apo-bar-wrap');
  const fill = el('div', 'apo-bar-fill faith');
  fill.style.width = `${pct}%`;
  barWrap.append(fill);
  box.append(barWrap);
  const cultNote = (state.cultFaithBonus || 0) > 0
    ? t('apotheosis.faith.cultBonus', ' (Base 1000 + {bonus} Cult)', { bonus: state.cultFaithBonus })
    : '';
  box.append(
    el('div', 'apo-meta-row',
      t('apotheosis.faith.meter', 'Faith: {cur} / {max}{cultNote} · Mythic Decay: -{decay}/idle day · Rebirth Cost: 150', {
        cur: faith,
        max: faithMax,
        cultNote,
        decay: APOTHEOSIS_MYTHIC_DECAY_FLAT,
      })),
  );
  container.append(box);
}

function renderPortfolioCards(container, state, entity, repaint) {
  const grid = el('div', 'apo-grid');
  const canChoose = state.stage === APOTHEOSIS_STAGES.AWAITING_PORTFOLIO || state.stage === APOTHEOSIS_STAGES.ASCENDED || state.ascended;
  let nowMin = null;
  try { nowMin = worldMinutes(); } catch { nowMin = null; }
  const switchCd = getPortfolioSwitchCooldownInfo(entity, nowMin);

  for (const p of APOTHEOSIS_PORTFOLIOS) {
    const isCurrent = state.portfolio === p.id;
    const card = el('div', `apo-card${isCurrent ? ' active' : ''}`);
    const head = el('div', 'apo-card-head');
    head.append(el('div', 'apo-card-title', p.name()));
    if (isCurrent) {
      head.append(el('span', 'apo-pill ok', t('apotheosis.portfolio.activeBadge', 'Active')));
    }
    card.append(
      head,
      el('div', 'apo-card-prog', p.epithet()),
      el('div', 'apo-card-desc', p.passivesSummary ? p.passivesSummary() : p.summary()),
      el('div', 'apo-card-desc', p.summary()),
    );
    const acts = el('div', 'apo-acts');
    const needsSwitchFee = Boolean(state.ascended && state.portfolio && !isCurrent);
    const onCooldown = needsSwitchFee && switchCd.onCooldown;
    const lacksSwitchFaith = needsSwitchFee && (state.faith || 0) < APOTHEOSIS_PORTFOLIO_SWITCH_COST;
    const label = isCurrent
      ? t('apotheosis.portfolio.btnCurrent', 'Active Portfolio')
      : onCooldown
        ? t('apotheosis.portfolio.btnCooldown', 'Cooldown ({days}d left)', { days: switchCd.remainingDays })
        : state.ascended
          ? t('apotheosis.portfolio.btnSwitchCost', 'Switch Portfolio ({cost} Faith)', { cost: APOTHEOSIS_PORTFOLIO_SWITCH_COST })
          : t('apotheosis.portfolio.btnChoose', 'Claim Portfolio');
    const btn = el('button', `apo-btn${isCurrent || onCooldown ? '' : ' primary'}`, label);
    btn.disabled = !canChoose || isCurrent || onCooldown || lacksSwitchFaith;
    btn.onclick = () => {
      let clickNowMin = null;
      try { clickNowMin = worldMinutes(); } catch { clickNowMin = null; }
      const res = selectApotheosisPortfolio(entity, p.id, { nowMinutes: clickNowMin });
      if (res.ok) {
        const msg = res.switching
          ? t('apotheosis.portfolio.switchedMsg', 'Divine Portfolio attuned to: {name}.', { name: res.portfolioName })
          : t('apotheosis.portfolio.claimedMsg', 'You have ascended as {name}!', { name: res.portfolioName });
        setFeedback(msg, false);
        activeSec = 'overview';
      } else {
        setFeedback(res.error, true);
      }
      repaint();
    };
    acts.append(btn);
    card.append(acts);
    grid.append(card);
  }
  container.append(grid);
}

function renderOverview(detail, entity, trackerShown, repaint) {
  const check = canStartApotheosisViaArtifacts(entity);
  const { eligible, reason, fate, artifacts, state } = check;
  const activeDef = APOTHEOSIS_PORTFOLIOS.find((p) => p.id === state.portfolio);

  const hero = el('div', 'apo-hero');
  const heroLeft = el('div');
  heroLeft.append(
    el('div', 'apo-hero-title', t('apotheosis.overview.heading', 'Apotheosis: Path of CHIM')),
    el('div', 'apo-meta-row', activeDef
      ? t('apotheosis.overview.activeGod', '{name} · {epithet}', { name: activeDef.name(), epithet: activeDef.epithet() })
      : t('apotheosis.overview.sub', 'Shape your Fate Weight and gather the spark of Ascension.')),
  );
  hero.append(heroLeft, el('span', stageBadgeClass(state), stageBadgeText(state)));
  detail.append(hero);

  if (statusMessage) {
    detail.append(el('div', `apo-notice${statusIsError ? ' err' : ''}`, statusMessage));
  }

  if (state.stage === APOTHEOSIS_STAGES.QUESTLINE_ACTIVE) {
    const stepText = state.questStep === APOTHEOSIS_QUEST_STEPS.TOWER_SIEGE
      ? t('apotheosis.quest.stepTowerSiege', 'Repel the 13-wave Siege outside Direnni Tower and shatter the Aspect of the Tower (Current Wave: {wave}/13).', {
        wave: Math.max(1, state.siegeWave || 1),
      })
      : state.questStep === APOTHEOSIS_QUEST_STEPS.TOWER_INTERIOR
        ? t('apotheosis.quest.stepTowerInterior', 'Direnni Tower is unsealed and swarming with empowered guardians. Fight through the interior and touch the Zero Stone.')
        : state.questStep === APOTHEOSIS_QUEST_STEPS.SHADOW_DUEL
          ? t('apotheosis.quest.stepShadowDuel', 'Defeat the Shadow of the Agent inside the Clockwork Orrery and step through the Ascension Conduit.')
          : t('apotheosis.quest.stepDragonBreak', 'A Dragon Break storm rages across the Iliac Bay. Travel to Direnni Tower on the Isle of Balfiera and challenge its sealed gates.');
    const qBox = el('div', 'apo-banner');
    qBox.append(
      el('div', 'apo-card-title', t('apotheosis.quest.boxTitle', 'Active Ascension Trial')),
      el('div', 'apo-card-desc', stepText),
    );
    detail.append(qBox);
  }

  if (state.questlineCompletedNotice && state.stage === APOTHEOSIS_STAGES.AWAITING_PORTFOLIO) {
    detail.append(el('div', 'apo-banner',
      t('apotheosis.overview.questDoneBanner', 'The Apotheosis quests have started and concluded — you have become a God. Select your initial Divine Portfolio below:')));
    renderPortfolioCards(detail, state, entity, repaint);
    return;
  }

  if (state.ascended && activeDef) {
    renderFaithBox(detail, state, entity);
    const godBox = el('div', 'apo-box');
    godBox.append(
      el('h4', null, t('apotheosis.overview.divinityTitle', 'Divine Mantle')),
      el('div', 'apo-card-desc', activeDef.passivesSummary ? activeDef.passivesSummary() : activeDef.summary()),
      el('div', 'apo-meta-row', t('apotheosis.overview.baseBoons', 'Divine Vessel Boons: +500 Max Health · +500 Max Magicka · +500 Max Fatigue · Immortal Rebirth (+1 Day)')),
      el('div', 'apo-meta-row', t('apotheosis.overview.divinityMeta', 'Source: {source} · Sacrificed Artifacts: {count}', {
        source: state.source === 'mantella'
          ? t('apotheosis.source.mantella', 'Mantella')
          : t('apotheosis.source.artifacts', '13 Daedric Artifacts'),
        count: state.sacrificedArtifacts.length,
      })),
    );
    const acts = el('div', 'apo-acts');
    const manageBtn = el('button', 'apo-btn primary',
      t('apotheosis.overview.changePortfolioCostBtn', 'Change Portfolio ({cost} Faith)', { cost: APOTHEOSIS_PORTFOLIO_SWITCH_COST }));
    manageBtn.onclick = () => {
      activeSec = 'portfolio';
      repaint();
    };
    const aurbisBtn = el('button', 'apo-btn', t('apotheosis.overview.openAurbisBtn', 'Open Scroll of Aurbis'));
    aurbisBtn.onclick = () => {
      activeSec = 'aurbis';
      repaint();
    };
    acts.append(manageBtn, aurbisBtn);
    godBox.append(acts);
    detail.append(godBox);
  }

  if (trackerShown) {
    const fwBox = el('div', 'apo-box');
    fwBox.append(el('h4', null, t('apotheosis.overview.fwTitle', 'Fate Weight Progress')));
    const pct = Math.min(100, Math.round((fate.count / fate.total) * 100));
    const barWrap = el('div', 'apo-bar-wrap');
    const fill = el('div', 'apo-bar-fill');
    fill.style.width = `${pct}%`;
    barWrap.append(fill);
    fwBox.append(barWrap);
    fwBox.append(el('div', 'apo-meta-row',
      t('apotheosis.overview.fwStatus', 'Fulfilled: {cur}/{total} (Ascension requires {req}){debugNote}', {
        cur: fate.count,
        total: fate.total,
        req: fate.required,
        debugNote: fate.debugBoosted ? t('apotheosis.overview.debugTag', ' · Debug Override') : '',
      })));
    detail.append(fwBox);
  } else {
    detail.append(el('div', 'apo-box',
      t('apotheosis.overview.trackerHidden', 'Fate Weight tracker display is currently disabled in Settings › DFF › Apotheosis.')));
  }

  const artBox = el('div', 'apo-box');
  artBox.append(
    el('h4', null, t('apotheosis.overview.sacTitle', 'Direct Ascension via Daedric Artifacts')),
    el('div', 'apo-card-desc',
      t('apotheosis.overview.sacDesc', 'Gather Fate Weight ({req}/{total}) and shatter {arts} distinct unequipped Daedric artifacts from your pack — or alternatively, seek out a source of great power. Perhaps it is somehow tied to the mission the Emperor gave you?', {
        req: fate.required,
        total: fate.total,
        arts: REQUIRED_ARTIFACTS_COUNT,
      })),
    el('div', 'apo-meta-row',
      t('apotheosis.overview.sacCounts', 'Distinct unequipped in pack: {cur}/{req} · Equipped (protected): {eq}', {
        cur: artifacts.distinctUnequippedCount,
        req: REQUIRED_ARTIFACTS_COUNT,
        eq: artifacts.equippedCount,
      })),
  );
  if (reason) {
    artBox.append(el('div', 'apo-meta-row', reason));
  }
  if (state.mantellaVanillaChosen && !state.ascended && state.stage === APOTHEOSIS_STAGES.MORTAL) {
    artBox.append(el('div', 'apo-meta-row',
      t('apotheosis.overview.mantellaMortalChosen', 'The Mantella was yielded to its mortal fate; Ascension now rests solely upon shattering 13 Daedric Artifacts.')));
  }
  const acts = el('div', 'apo-acts');
  const startBtn = el('button', `apo-btn${eligible ? ' primary' : ''}`,
    t('apotheosis.overview.shatterBtn', 'Select & Shatter 13 Artifacts'));
  startBtn.disabled = !eligible;
  startBtn.onclick = () => {
    selectedItems = autoPickDistinctArtifacts(artifacts.unequippedEntries);
    pickerOpen = true;
    repaint();
  };
  acts.append(startBtn);
  artBox.append(acts);
  detail.append(artBox);
}

function renderCategory(detail, category) {
  const box = el('div', 'apo-hero');
  const left = el('div');
  left.append(
    el('div', 'apo-hero-title', category.label),
    el('div', 'apo-meta-row', category.subtitle),
  );
  box.append(left, el('span', 'apo-pill' + (category.fulfilled > 0 ? ' ok' : ''),
    t('apotheosis.cat.counter', '{cur}/{total} fulfilled', { cur: category.fulfilled, total: category.total })));
  detail.append(box);

  const grid = el('div', 'apo-grid');
  for (const tr of category.triggers) {
    const card = el('div', `apo-card${tr.fulfilled ? ' done' : ''}`);
    const head = el('div', 'apo-card-head');
    head.append(
      el('div', 'apo-card-title', tr.name),
      el('span', `apo-pill${tr.fulfilled ? ' ok' : ''}`, tr.fulfilled
        ? (tr.debugGranted ? t('apotheosis.tr.badgeDebug', 'Debug') : t('apotheosis.tr.badgeDone', 'Fulfilled'))
        : t('apotheosis.tr.badgePending', 'Unfulfilled')),
    );
    card.append(head, el('div', 'apo-card-desc', tr.desc), el('div', 'apo-card-prog', tr.progressText));
    grid.append(card);
  }
  detail.append(grid);
}

function renderPortfolioPage(detail, entity, repaint) {
  const state = ensureApotheosisState(entity);
  const hero = el('div', 'apo-hero');
  const left = el('div');
  let nowMin = null;
  try { nowMin = worldMinutes(); } catch { nowMin = null; }
  const switchCd = getPortfolioSwitchCooldownInfo(entity, nowMin);
  left.append(
    el('div', 'apo-hero-title', t('apotheosis.portfolio.pageTitle', 'Divine Portfolio')),
    el('div', 'apo-meta-row',
      t('apotheosis.portfolio.pageSubStage2', 'Choose the domain that defines your godhood. Switching Portfolios after Ascension costs {cost} Faith.', {
        cost: APOTHEOSIS_PORTFOLIO_SWITCH_COST,
      })),
    ...(state.ascended && state.portfolio && switchCd.onCooldown
      ? [el('div', 'apo-meta-row',
        t('apotheosis.err.switch_cooldown', 'Portfolio realignment is on cooldown ({days} days remaining).', {
          days: switchCd.remainingDays,
        }))]
      : []),
  );
  hero.append(left, el('span', stageBadgeClass(state), stageBadgeText(state)));
  detail.append(hero);

  if (statusMessage) {
    detail.append(el('div', `apo-notice${statusIsError ? ' err' : ''}`, statusMessage));
  }

  if (state.ascended) {
    renderFaithBox(detail, state, entity);
  }

  if (state.stage === APOTHEOSIS_STAGES.MORTAL && !state.ascended) {
    detail.append(el('div', 'apo-box',
      t('apotheosis.portfolio.lockedDesc', 'Reach Fate Weight {req}/{total} and shatter {arts} distinct unequipped Daedric artifacts from your pack — or alternatively, seek out a source of great power. Perhaps it is somehow tied to the mission the Emperor gave you?', {
        req: REQUIRED_FATE_WEIGHT,
        total: TOTAL_FATE_TRIGGERS,
        arts: REQUIRED_ARTIFACTS_COUNT,
      })));
  }

  renderPortfolioCards(detail, state, entity, repaint);
}

async function runAurbisLine(cmdLine, entity, repaint) {
  const clean = String(cmdLine ?? '').trim();
  if (!clean) return;
  let nowMin = 0;
  try { nowMin = worldMinutes() || 0; } catch { nowMin = 0; }
  const res = await executeAurbisCommand(clean, entity, { nowMinutes: nowMin });
  if (!res.ok) {
    const errText = res.error ?? 'Miracle refused.';
    setFeedback(errText, true);
    aurbisLog = [`> ${clean}\nERR: ${errText}`, ...aurbisLog].slice(0, 12);
    repaint();
    return;
  }
  if (aurbisHistory[0] !== clean) aurbisHistory = [clean, ...aurbisHistory].slice(0, 20);
  aurbisHistoryIdx = -1;
  const witnessNote = res.witnessDelta
    ? ` | Witnesses: ${res.witnessDelta > 0 ? `+${res.witnessDelta}` : res.witnessDelta} Faith`
    : '';
  const orderNote = res.orderBonus
    ? ` | Order: +${res.orderBonus} Faith`
    : '';
  const summary = res.deferred
    ? res.output
    : `-${res.faithSpent} Faith${witnessNote}${orderNote} (Faith ${res.newFaith}/${res.faithMax})${res.output ? `\n${res.output}` : ''}`;
  setFeedback(res.deferred ? res.output : t('apotheosis.aurbis.invoked', 'Decree enacted: {cmd} (-{cost} Faith{wNote}).', {
    cmd: clean,
    cost: res.faithSpent,
    wNote: `${witnessNote}${orderNote}`,
  }), false);
  aurbisLog = [`> ${clean}\n${summary}`, ...aurbisLog].slice(0, 12);
  repaint();
}

function renderAurbisPage(detail, entity, repaint) {
  const state = ensureApotheosisState(entity);
  const witnesses = liveWitnessCount(entity, state);
  const hero = el('div', 'apo-hero');
  const left = el('div');
  left.append(
    el('div', 'apo-hero-title', t('apotheosis.aurbis.title', 'Scroll of Aurbis')),
    el('div', 'apo-meta-row',
      t('apotheosis.aurbis.subtitle', 'Inscribe Reality-shaping decrees fueled by Faith. Witnesses nearby: {w} (Aligned +15 / Opposed -20).', { w: witnesses })),
  );
  hero.append(left, el('span', stageBadgeClass(state), stageBadgeText(state)));
  detail.append(hero);

  if (statusMessage) {
    detail.append(el('div', `apo-notice${statusIsError ? ' err' : ''}`, statusMessage));
  }

  if (!state.ascended && state.stage !== APOTHEOSIS_STAGES.ASCENDED) {
    detail.append(el('div', 'apo-box',
      t('apotheosis.aurbis.locked', 'Ascend to Godhood and claim a Divine Portfolio to unlock the Scroll of Aurbis and weave Reality with Faith.')));
    return;
  }

  renderFaithBox(detail, state, entity);

  // Quick Miracles
  const quickBox = el('div', 'apo-box');
  quickBox.append(el('h4', null, t('apotheosis.aurbis.quickTitle', 'Quick Miracles (13)')));
  const quickGrid = el('div', 'apo-aurbis-grid');

  const fixedMiracles = [
    { label: t('apotheosis.aurbis.q.portal', 'Divine Portal'), desc: t('apotheosis.aurbis.q.portalDesc', 'Open Portal Stone map'), cmd: 'portal' },
    { label: t('apotheosis.aurbis.q.heal', 'Divine Restoration'), desc: t('apotheosis.aurbis.q.healDesc', 'Restore Health, Magicka & Fatigue'), cmd: 'heal' },
    { label: t('apotheosis.aurbis.q.pacifyall', 'Pacify All Foes'), desc: t('apotheosis.aurbis.q.pacifyallDesc', 'Calm all hostiles on the map (+Order Faith)'), cmd: 'pacifyall' },
    { label: t('apotheosis.aurbis.q.killall', 'Smite Hostiles'), desc: t('apotheosis.aurbis.q.killallDesc', 'Strike down nearby foes'), cmd: 'killall' },
    { label: t('apotheosis.aurbis.q.champion', 'Summon Champion (24h)'), desc: t('apotheosis.aurbis.q.championDesc', 'Summon 1 Faith-scaled Portfolio Champion'), cmd: 'summon_champion' },
    { label: t('apotheosis.aurbis.q.champions', 'Champion Party x4 (24h)'), desc: t('apotheosis.aurbis.q.championsDesc', 'Summon 4 Faith-scaled Portfolio Champions'), cmd: 'summon_champions' },
    { label: t('apotheosis.aurbis.q.sun', 'Clear Skies'), desc: t('apotheosis.aurbis.q.sunDesc', 'Part stormclouds across the land'), cmd: 'weather 0' },
    { label: t('apotheosis.aurbis.q.storm', 'Call Storm'), desc: t('apotheosis.aurbis.q.stormDesc', 'Summon thunder & tempest'), cmd: 'weather 5' },
    { label: t('apotheosis.aurbis.q.time', 'Turn Day (+12h)'), desc: t('apotheosis.aurbis.q.timeDesc', 'Advance Tamrielic clock by 12h'), cmd: 'advance_time 12' },
    { label: t('apotheosis.aurbis.q.gold', 'Manifest Gold (+1000)'), desc: t('apotheosis.aurbis.q.goldDesc', 'Conjure coin into your purse'), cmd: 'addgold 1000' },
    { label: t('apotheosis.aurbis.q.absolve', 'Absolve Bounty'), desc: t('apotheosis.aurbis.q.absolveDesc', 'Clear bounty in current region'), cmd: 'bounty clear' },
    { label: t('apotheosis.aurbis.q.crisisTp', 'Step to Crisis'), desc: t('apotheosis.aurbis.q.crisisTpDesc', 'Teleport to an active regional crisis'), cmd: 'crisis tp' },
  ];

  for (const m of fixedMiracles) {
    const ev = evaluateAurbisCommand(m.cmd, entity, { witnessCount: witnesses });
    const cost = ev.allowed ? ev.faithCost : 0;
    const alignTag = ev.alignment === 'aligned' ? ' (+15)' : ev.alignment === 'opposed' ? ' (-20)' : '';
    const btn = el('button', 'apo-aurbis-miracle');
    btn.disabled = !ev.allowed || (state.faith || 0) < cost;
    btn.append(
      el('div', 'apo-card-title', m.label),
      el('div', 'apo-card-desc', m.desc),
      el('div', 'apo-card-prog', `${cost} Faith${alignTag}`),
    );
    btn.onclick = () => runAurbisLine(m.cmd, entity, repaint);
    quickGrid.append(btn);
  }

  // 10th Quick Miracle: Summon Creature (`spawnfoe`) with MOBILE_TYPES selector
  const spawnCard = el('div', 'apo-aurbis-card');
  spawnCard.append(el('div', 'apo-card-title', t('apotheosis.aurbis.q.spawn', 'Summon Creature')));
  const mobSelect = el('select', 'apo-select');
  for (const [mobName, mobId] of SPAWNABLE_MOBILES) {
    const opt = el('option');
    opt.value = mobName;
    opt.textContent = `${mobName} (#${mobId} · ${getSpawnCreatureFaithCost(mobName)} Faith)`;
    if (mobName === aurbisSelectedMob) opt.selected = true;
    mobSelect.append(opt);
  }
  const spawnBtn = el('button', 'apo-btn primary');
  const syncSpawnBtn = () => {
    const cost = getSpawnCreatureFaithCost(aurbisSelectedMob);
    spawnBtn.textContent = t('apotheosis.aurbis.q.spawnBtn', 'Summon ({cost} Faith)', { cost });
    spawnBtn.disabled = (state.faith || 0) < cost;
  };
  syncSpawnBtn();
  mobSelect.onchange = () => {
    aurbisSelectedMob = mobSelect.value;
    syncSpawnBtn();
  };
  spawnBtn.onclick = () => runAurbisLine(`spawnfoe ${aurbisSelectedMob}`, entity, repaint);
  spawnCard.append(mobSelect, spawnBtn);
  quickGrid.append(spawnCard);

  quickBox.append(quickGrid);
  detail.append(quickBox);

  // 2. Manual Decree Input + Live Cost Preview + Allowed Command List Toggle
  const cmdBox = el('div', 'apo-box');
  cmdBox.append(el('h4', null, t('apotheosis.aurbis.manualTitle', 'Inscribe Aurbis Decree')));
  const form = el('div', 'apo-aurbis-form');
  const input = el('input', 'apo-input');
  input.type = 'text';
  input.value = aurbisInputText;
  input.placeholder = t('apotheosis.aurbis.placeholder', 'e.g. additem daedric_claymore, weather storm, crisis start war, living adv tick 3');
  const invokeBtn = el('button', 'apo-btn primary', t('apotheosis.aurbis.invokeBtn', 'Invoke'));
  const catalogBtn = el('button', 'apo-btn',
    aurbisShowCatalog
      ? t('apotheosis.aurbis.hideCatalog', 'Hide Allowed Commands')
      : t('apotheosis.aurbis.showCatalog', 'Allowed Commands List'));
  form.append(input, invokeBtn, catalogBtn);

  const previewEl = el('div', 'apo-aurbis-preview');
  const updatePreview = (text) => {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) {
      previewEl.className = 'apo-aurbis-preview';
      previewEl.textContent = t('apotheosis.aurbis.previewIdle', 'Type any allowed Tamrielic command to inspect its Faith cost and witness reaction.');
      invokeBtn.disabled = true;
      return;
    }
    const ev = evaluateAurbisCommand(trimmed, entity, { witnessCount: witnesses });
    if (!ev.allowed) {
      previewEl.className = 'apo-aurbis-preview err';
      previewEl.textContent = ev.reason;
      invokeBtn.disabled = true;
      return;
    }
    const lacks = (state.faith || 0) < ev.faithCost;
    const alignStr = ev.witnessDelta > 0
      ? ` · Witnesses aligned (+${ev.witnessDelta} Faith)`
      : ev.witnessDelta < 0
        ? ` · Witnesses opposed (${ev.witnessDelta} Faith)`
        : '';
    previewEl.className = lacks
      ? 'apo-aurbis-preview err'
      : `apo-aurbis-preview${ev.alignment !== 'neutral' ? ` ${ev.alignment}` : ''}`;
    previewEl.textContent = lacks
      ? t('apotheosis.aurbis.previewLacks', 'Cost: {cost} Faith (Need more Faith — you have {cur}){align}', {
        cost: ev.faithCost, cur: state.faith || 0, align: alignStr,
      })
      : t('apotheosis.aurbis.previewOk', 'Allowed · Cost: {cost} Faith{align}', {
        cost: ev.faithCost, align: alignStr,
      });
    invokeBtn.disabled = lacks;
  };
  updatePreview(aurbisInputText);

  input.oninput = () => {
    aurbisInputText = input.value;
    updatePreview(aurbisInputText);
  };
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !invokeBtn.disabled) {
      e.preventDefault();
      const line = input.value;
      aurbisInputText = '';
      runAurbisLine(line, entity, repaint);
    } else if (e.key === 'ArrowUp' && aurbisHistory.length > 0) {
      e.preventDefault();
      aurbisHistoryIdx = Math.min(aurbisHistory.length - 1, aurbisHistoryIdx + 1);
      input.value = aurbisHistory[aurbisHistoryIdx] ?? '';
      aurbisInputText = input.value;
      updatePreview(aurbisInputText);
    } else if (e.key === 'ArrowDown' && aurbisHistoryIdx >= 0) {
      e.preventDefault();
      aurbisHistoryIdx = Math.max(-1, aurbisHistoryIdx - 1);
      input.value = aurbisHistoryIdx >= 0 ? (aurbisHistory[aurbisHistoryIdx] ?? '') : '';
      aurbisInputText = input.value;
      updatePreview(aurbisInputText);
    }
  };
  invokeBtn.onclick = () => {
    const line = input.value;
    aurbisInputText = '';
    runAurbisLine(line, entity, repaint);
  };
  catalogBtn.onclick = () => {
    aurbisShowCatalog = !aurbisShowCatalog;
    repaint();
  };

  cmdBox.append(form, previewEl);

  if (aurbisShowCatalog) {
    const refBox = el('div', 'apo-aurbis-ref');
    for (const cat of AURBIS_COMMAND_CATALOG) {
      const catEl = el('div');
      catEl.append(el('div', 'apo-ref-cat', cat.categoryLabel()));
      for (const entry of cat.commands) {
        const row = el('button', 'apo-ref-row');
        row.append(
          el('span', 'apo-card-title', entry.syntax),
          el('span', 'apo-pill', entry.costHint),
          el('div', 'apo-card-desc', `${entry.desc()}${entry.aliases?.length ? ` (Aliases: ${entry.aliases.join(', ')})` : ''}`),
        );
        row.onclick = () => {
          aurbisInputText = entry.cmd;
          input.value = entry.cmd;
          updatePreview(aurbisInputText);
          input.focus();
        };
        catEl.append(row);
      }
      refBox.append(catEl);
    }
    cmdBox.append(refBox);
  }

  detail.append(cmdBox);

  if (aurbisLog.length > 0) {
    const logBox = el('div', 'apo-box');
    logBox.append(el('h4', null, t('apotheosis.aurbis.logTitle', 'Chronicle of Decrees')));
    const logScroll = el('div', 'apo-aurbis-log');
    for (const entry of aurbisLog) {
      logScroll.append(el('div', null, entry));
    }
    logBox.append(logScroll);
    detail.append(logBox);
  }
}

function paint(root) {
  const entity = playerEntity;
  const trackerShown = !!getPref('apotheosisShowTracker');
  const secs = currentSections(trackerShown);
  if (!secs.some(([id]) => id === activeSec)) activeSec = 'overview';

  root.replaceChildren();
  const wrap = el('div', 'px-journal');
  const rail = el('div', 'px-qrail');

  const repaint = () => paint(root);
  for (const [id, label] of secs) {
    const b = el('button', `px-qrow${id === activeSec ? ' on' : ''}`);
    b.append(el('span', 'px-c', '\u25c6'), document.createTextNode(label));
    b.onclick = () => {
      activeSec = id;
      repaint();
    };
    rail.append(b);
  }
  wrap.append(rail);

  const detail = el('div', 'px-qdetail px-sys');
  if (activeSec === 'overview') {
    renderOverview(detail, entity, trackerShown, repaint);
  } else if (activeSec === 'portfolio') {
    renderPortfolioPage(detail, entity, repaint);
  } else if (activeSec === 'aurbis') {
    renderAurbisPage(detail, entity, repaint);
  } else {
    const fate = evaluateFateWeight(entity);
    const cat = fate.categories.find((c) => c.id === activeSec);
    if (cat) renderCategory(detail, cat);
  }
  wrap.append(detail);
  root.append(wrap);

  if (pickerOpen) {
    renderPickerModal(root, repaint, entity);
  }
}

/** Draws the Apotheosis Pause tab body. */
export function drawApotheosisPane(body) {
  ensureStyle();
  const root = el('div', 'apo-pane');
  body.append(root);
  paint(root);
}
