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
import { REGION_NAMES, isProvinceRegion } from '../formats/mapsTables.js';
import { REGION_FLAGS, conditionFlag } from '../systems/region/regionConditions.js';
import { t, getLocalizedRegionName } from '../systems/textManager.js';
import { getPref } from '../systems/uiPrefs.js';
import { worldMinutes } from '../systems/worldTick.js';
import { repaintKeepingScroll } from './domRepaint.js';
import {
  APOTHEOSIS_PORTFOLIOS,
  APOTHEOSIS_PORTFOLIO_SWITCH_COST,
  APOTHEOSIS_MYTHIC_DECAY_FLAT,
  APOTHEOSIS_QUEST_STEPS,
  APOTHEOSIS_STAGES,
  AURBIS_COMMAND_CATALOG,
  GEOPOLITICS_PEACE_COST,
  GEOPOLITICS_WAR_COST,
  PANTHEON_ALLIANCE_COST,
  PANTHEON_DEITIES,
  PANTHEON_DISCORD_COST,
  PANTHEON_OFFERING_COST,
  PANTHEON_PACT_COST,
  PANTHEON_WAR_COST,
  REQUIRED_ARTIFACTS_COUNT,
  REQUIRED_FATE_WEIGHT,
  TAMRIEL_REGION_COUNT,
  TOTAL_FATE_TRIGGERS,
  areRegionsAtWar,
  canStartApotheosisViaArtifacts,
  computeDivineTruceCost,
  declareHolyWar,
  enforceRegionPeace,
  ensureApotheosisState,
  ensureCultState,
  ensurePantheonState,
  evaluateAurbisCommand,
  evaluateFateWeight,
  executeAurbisCommand,
  forgeDivineAlliance,
  getAurbisRuntime,
  getDeityGraceInfo,
  getFaithMax,
  getGlobalInfluenceSummary,
  getPantheonDeity,
  getPortfolioSwitchCooldownInfo,
  getRegionInfluence,
  getSpawnCreatureFaithCost,
  igniteRegionWar,
  offerDivineTruce,
  proposeDivinePact,
  queryPantheonChronicle,
  scanInventoryArtifactsForApotheosis,
  selectApotheosisPortfolio,
  sendDivineOffering,
  sowDivineDiscord,
  startApotheosisFromArtifacts,
  DIVINE_WAR_SUPPORT_COST,
  DIVINE_WAR_TRUCE_COST,
  getActiveGodWars,
  supportGodWarSide,
  enforceGodWarTruce,
} from '../systems/apotheosis/apotheosisCore.js';
import {
  renderCultPage,
  resetCultSectionUiState,
  getCultScrollKey,
  renderAltarStatueBox,
  renderAltarStatueModal,
} from './apotheosisCultSection.js';

export const APOTHEOSIS_STYLE_ID = 'df-apotheosis-css';

const APOTHEOSIS_CSS = `
.px-body:has(> .apo-pane) { overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.apo-pane { flex: 1; display: flex; flex-direction: column; height: 100%; min-height: 0; }
.apo-pane > .px-journal { flex: 1; height: 100%; min-height: 0; overflow: hidden; }
.apo-pane .px-qrail { min-height: 0; overflow-y: auto; }
.apo-qrail-group-hdr { padding: 8px 14px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #c8a858; opacity: 0.85; border-bottom: 1px solid rgba(200,168,88,0.22); margin-bottom: 2px; user-select: none; }
.apo-qrail-group-hdr:not(:first-child) { margin-top: 8px; }
.apo-main-col { flex: 1 1 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.apo-sticky-head { flex-shrink: 0; padding: 0 8px 8px 0; border-bottom: 1px solid rgba(190,165,98,0.35); margin-bottom: 10px; }
.apo-sticky-head .apo-box { margin-bottom: 8px; padding: 9px 12px; }
.apo-sticky-head .apo-notice { margin-bottom: 0; }
.apo-pane .px-qdetail { flex: 1 1 0; min-height: 0; overflow-y: auto; padding-right: 8px; }
.apo-btn.danger { border-color: rgba(226,100,100,0.75); color: #ffbaba; background: rgba(48,16,18,0.88); }
.apo-btn.danger:hover:not(:disabled):not(.is-disabled) { border-color: #ff7a7a; color: #ffe5e5; background: rgba(74,20,22,0.92); }
.apo-btn.is-disabled { opacity: 0.45; cursor: not-allowed; border-color: rgba(125,116,96,0.4); color: #9c9482; background: rgba(20,23,30,0.75); text-shadow: none; }
.apo-btn.is-disabled:hover { border-color: rgba(125,116,96,0.45); color: #9c9482; background: rgba(20,23,30,0.75); }
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
.apo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 10px; }
.apo-card { padding: 10px 12px; border: 1px solid rgba(125,116,96,0.45); background: rgba(14,17,24,0.72); display: flex; flex-direction: column; gap: 6px; }
.apo-card.done { border-color: rgba(154,214,116,0.65); background: rgba(18,32,20,0.66); }
.apo-card.active { border-color: rgb(243,239,44); background: rgba(44,38,14,0.72); }
.apo-card-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px; }
.apo-card-title { font-size: 15px; color: #f1e6c1; font-weight: bold; }
.apo-pill { font-size: 12px; padding: 2px 7px; border: 1px solid rgba(125,116,96,0.5); color: #b7af9b; white-space: nowrap; }
.apo-pill.ok { border-color: #82d46e; color: #b7f5a3; background: rgba(20,48,22,0.8); }
.apo-card-desc { font-size: 13px; line-height: 1.4; color: #c7bfa7; }
.apo-card-prog { font-size: 12px; color: #dfd4b0; margin-top: auto; }
.apo-statue-thumb { width: 44px; height: 44px; flex: 0 0 44px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(190,165,98,0.55); background: rgba(8,10,16,0.9); font-size: 10px; text-align: center; color: #f1e6c1; overflow: hidden; }
.apo-statue-thumb img { max-width: 100%; max-height: 100%; image-rendering: pixelated; object-fit: contain; }
.apo-picker-backdrop { position: fixed; inset: 0; z-index: 95; background: rgba(5,7,11,0.82); display: flex; align-items: center; justify-content: center; padding: 20px; }
.apo-picker-modal { width: min(1060px, 95vw); max-height: 88vh; display: flex; flex-direction: column; border: 2px solid rgba(190,165,98,0.8); background: #12151e; box-shadow: 0 18px 46px rgba(0,0,0,0.88); }
.apo-picker-head { padding: 14px 18px; border-bottom: 1px solid rgba(125,116,96,0.45); display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.apo-picker-title { font-size: 18px; color: rgb(243,239,44); text-transform: uppercase; letter-spacing: 0.05em; }
.apo-picker-sub { padding: 10px 18px 0; font-size: 13px; color: #c7bfa7; }
.apo-picker-scroll { flex: 1; min-height: 180px; overflow-y: auto; padding: 14px 18px; display: grid; grid-template-columns: repeat(auto-fill, minmax(235px, 1fr)); gap: 10px; align-content: start; }
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
.apo-aurbis-log { max-height: 260px; overflow-y: auto; padding: 8px 10px; background: rgba(5,7,11,0.85); border: 1px solid rgba(125,116,96,0.45); font-family: monospace; font-size: 12px; color: #dfd4b0; white-space: pre-wrap; display: flex; flex-direction: column; gap: 6px; }
.apo-aurbis-ref { max-height: 360px; overflow-y: auto; margin-top: 10px; padding: 10px; background: rgba(8,10,16,0.9); border: 1px solid rgba(125,116,96,0.55); display: flex; flex-direction: column; gap: 10px; }
.apo-ref-cat { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: rgb(243,239,44); margin-bottom: 4px; }
.apo-ref-row { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 1px solid rgba(125,116,96,0.3); background: rgba(16,20,28,0.65); cursor: pointer; text-align: left; font: inherit; color: #efe3bc; width: 100%; }
.apo-ref-row:hover { border-color: #7cd4ff; background: rgba(18,32,44,0.8); }
.apo-subtabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.apo-rel-bar { height: 8px; background: rgba(0,0,0,0.65); border: 1px solid rgba(125,116,96,0.45); overflow: hidden; margin: 4px 0; position: relative; }
.apo-rel-fill { height: 100%; transition: width 0.2s ease; }
.apo-lens-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(185px, 1fr)); gap: 7px; max-height: 460px; overflow-y: auto; padding-right: 4px; }
.apo-lens-cell { text-align: left; font: inherit; padding: 7px 9px; border: 1px solid rgba(125,116,96,0.45); background: rgba(14,18,26,0.85); color: #efe3bc; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
.apo-lens-cell:hover { border-color: #7cd4ff; }
.apo-lens-cell.sel { border-color: rgb(243,239,44); background: rgba(44,38,14,0.8); }
.apo-lens-cell.war { box-shadow: inset 3px 0 0 #d9483b; }
.apo-row-inline { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.apo-pill.warn { border-color: #e69d45; color: #ffd49c; background: rgba(54,36,12,0.8); }
.apo-pill.bad { border-color: #e26464; color: #ffbaba; background: rgba(56,16,18,0.85); }
.apo-pill.info { border-color: #7cd4ff; color: #cbefff; background: rgba(14,36,52,0.85); }
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
let pantheonSubTab = 'deities';
let pantheonSelectedRegion = null;
let pantheonTheatreFilter = 'all';
let pantheonLensMode = 'all';
let pantheonRegionQuery = '';
let pantheonDiscordA = 'akatosh';
let pantheonDiscordB = 'mehrunes_dagon';
let pantheonGeoA = 17;
let pantheonGeoB = 23;
let pantheonLogFilter = 'all';
let pantheonLogSearch = '';

const SPAWNABLE_MOBILES = Object.entries(MOBILE_TYPES)
  .filter(([name, id]) => name !== 'None' && name !== 'Horse_Invalid' && id < 65535)
  .sort((a, b) => a[1] - b[1]);

/** Pre-selects a specific sub-section (`overview`, `meta`, `blood`, `power`, `portfolio`, `aurbis`, `pantheon_deities`, `pantheon_regions`, `pantheon_chronicle`, `cult`, `edicts`) before opening the pane. */
export function selectApotheosisSection(sec) {
  const mapped = sec === 'pantheon' ? 'pantheon_deities' : sec;
  const valid = new Set(['overview', 'meta', 'blood', 'power', 'portfolio', 'aurbis', 'pantheon_deities', 'pantheon_regions', 'pantheon_chronicle', 'cult', 'edicts']);
  if (valid.has(mapped)) {
    activeSec = mapped;
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
  pantheonSubTab = 'deities';
  pantheonRegionQuery = '';
  pantheonLogSearch = '';
  resetCultSectionUiState();
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
  secs.push(['pantheon_deities', t('apotheosis.pantheon.tabDeities', 'Deities & Diplomacy')]);
  secs.push(['pantheon_regions', t('apotheosis.pantheon.tabRegions', 'Divine Lens & Geopolitics')]);
  secs.push(['pantheon_chronicle', t('apotheosis.pantheon.tabChronicle', 'Pantheon Chronicle')]);
  secs.push(['cult', t('apotheosis.cult.subTabSites', 'Temples & Underground Sanctuaries')]);
  secs.push(['edicts', t('apotheosis.cult.subTabEdicts', 'Regional Edicts')]);
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
      t('apotheosis.overview.questDoneBanner', 'The Apotheosis quests have started and concluded — you have become a God. Select your initial Divine Portfolio and Cult Altar Statue below:')));
    renderAltarStatueBox(detail, entity, repaint, setFeedback);
    renderPortfolioCards(detail, state, entity, repaint);
    return;
  }

  if (state.ascended && activeDef) {
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

  if (state.stage === APOTHEOSIS_STAGES.MORTAL && !state.ascended) {
    detail.append(el('div', 'apo-box',
      t('apotheosis.portfolio.lockedDesc', 'Reach Fate Weight {req}/{total} and shatter {arts} distinct unequipped Daedric artifacts from your pack — or alternatively, seek out a source of great power. Perhaps it is somehow tied to the mission the Emperor gave you?', {
        req: REQUIRED_FATE_WEIGHT,
        total: TOTAL_FATE_TRIGGERS,
        arts: REQUIRED_ARTIFACTS_COUNT,
      })));
  }

  if (state.stage === APOTHEOSIS_STAGES.AWAITING_PORTFOLIO || state.stage === APOTHEOSIS_STAGES.ASCENDED || state.ascended) {
    renderAltarStatueBox(detail, entity, repaint, setFeedback);
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
    const errText = res.error ?? t('apotheosis.aurbis.err.refused', 'Miracle refused.');
    setFeedback(errText, true);
    aurbisLog = [`> ${clean}\nERR: ${errText}`, ...aurbisLog].slice(0, 12);
    repaint();
    return;
  }
  if (aurbisHistory[0] !== clean) aurbisHistory = [clean, ...aurbisHistory].slice(0, 20);
  aurbisHistoryIdx = -1;
  const witnessNote = res.witnessDelta
    ? t('apotheosis.aurbis.witnessNote', ' | Witnesses: {delta} Faith', {
      delta: res.witnessDelta > 0 ? `+${res.witnessDelta}` : res.witnessDelta,
    })
    : '';
  const orderNote = res.orderBonus
    ? t('apotheosis.aurbis.orderNote', ' | Order: +{bonus} Faith', { bonus: res.orderBonus })
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

  if (!state.ascended && state.stage !== APOTHEOSIS_STAGES.ASCENDED) {
    detail.append(el('div', 'apo-box',
      t('apotheosis.aurbis.locked', 'Ascend to Godhood and claim a Divine Portfolio to unlock the Scroll of Aurbis and weave Reality with Faith.')));
    return;
  }

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
      el('div', 'apo-card-prog', t('apotheosis.aurbis.cardCost', '{cost} Faith{align}', { cost, align: alignTag })),
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
      ? t('apotheosis.aurbis.witnessAligned', ' · Witnesses aligned (+{delta} Faith)', { delta: ev.witnessDelta })
      : ev.witnessDelta < 0
        ? t('apotheosis.aurbis.witnessOpposed', ' · Witnesses opposed ({delta} Faith)', { delta: ev.witnessDelta })
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
          el('div', 'apo-card-desc', `${entry.desc()}${entry.aliases?.length ? t('apotheosis.aurbis.aliases', ' (Aliases: {list})', { list: entry.aliases.join(', ') }) : ''}`),
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

function renderActiveReligiousWarsBox(detail, entity, nowMin, repaint) {
  const wars = getActiveGodWars(entity);
  if (!wars.length) return;
  const state = ensureApotheosisState(entity);
  const faith = Math.trunc(Number(state?.faith) || 0);
  const box = el('div', 'apo-box');
  box.append(el('h4', null, t('apotheosis.war.panelTitle', 'Active Inter-Deity Religious Wars ({n})', { n: wars.length })));

  for (const war of wars) {
    const defA = getPantheonDeity(war.godA);
    const defB = getPantheonDeity(war.godB);
    const nameA = defA?.name ?? war.godAName ?? war.godA;
    const nameB = defB?.name ?? war.godBName ?? war.godB;
    const regNames = (war.regions ?? [])
      .map((r) => getLocalizedRegionName(r, (i) => REGION_NAMES[i] ?? `Region ${i}`))
      .join(', ');

    const card = el('div', 'apo-card');
    const head = el('div', 'apo-card-head');
    head.append(
      el('div', 'apo-card-title', `${nameA} vs ${nameB}`),
      el('span', 'apo-pill bad', t('apotheosis.war.daysBadge', '{days}d left · {n} Regions', {
        days: war.daysRemaining ?? 0,
        n: war.regions?.length ?? 0,
      })),
    );
    card.append(head);
    card.append(el('div', 'apo-card-desc', t('apotheosis.war.regionsList', 'Contested Regions: {regions}', { regions: regNames })));

    const stanceRow = el('div', 'apo-row-inline');
    const stanceLabel = war.playerStance === 'sideA'
      ? nameA
      : war.playerStance === 'sideB'
        ? nameB
        : war.playerStance === 'peace'
          ? t('apotheosis.war.stancePeace', 'Peacemaker')
          : war.playerStance === 'watch'
            ? t('apotheosis.war.stanceWatch', 'Observer')
            : t('apotheosis.war.stanceNone', 'Undeclared');
    stanceRow.append(el('span', `apo-pill ${war.playerStance ? 'ok' : 'warn'}`, t('apotheosis.war.stanceBadge', 'Your Stance: {stance}', { stance: stanceLabel })));
    card.append(stanceRow);

    const acts = el('div', 'apo-acts');
    const supABtn = el('button', 'apo-btn primary', t('apotheosis.war.btnSupport', 'Support {god} ({cost} Faith)', { god: nameA, cost: DIVINE_WAR_SUPPORT_COST }));
    supABtn.disabled = faith < DIVINE_WAR_SUPPORT_COST || war.playerStance === 'sideA';
    supABtn.onclick = () => {
      const res = supportGodWarSide(entity, war.id, war.godA, { nowMinutes: nowMin });
      setFeedback(res.ok ? res.message : res.reason, !res.ok);
      repaint();
    };
    const supBBtn = el('button', 'apo-btn primary', t('apotheosis.war.btnSupport', 'Support {god} ({cost} Faith)', { god: nameB, cost: DIVINE_WAR_SUPPORT_COST }));
    supBBtn.disabled = faith < DIVINE_WAR_SUPPORT_COST || war.playerStance === 'sideB';
    supBBtn.onclick = () => {
      const res = supportGodWarSide(entity, war.id, war.godB, { nowMinutes: nowMin });
      setFeedback(res.ok ? res.message : res.reason, !res.ok);
      repaint();
    };
    const truceBtn = el('button', 'apo-btn', t('apotheosis.war.btnTruce', 'Enforce Divine Truce ({cost} Faith)', { cost: DIVINE_WAR_TRUCE_COST }));
    truceBtn.disabled = faith < DIVINE_WAR_TRUCE_COST;
    truceBtn.onclick = () => {
      const res = enforceGodWarTruce(entity, war.id, { nowMinutes: nowMin });
      setFeedback(res.ok ? res.message : res.reason, !res.ok);
      repaint();
    };
    acts.append(supABtn, supBBtn, truceBtn);
    card.append(acts);
    box.append(card);
  }
  detail.append(box);
}

function renderPantheonDeitiesView(detail, entity, pantheon, nowMin, repaint) {
  renderActiveReligiousWarsBox(detail, entity, nowMin, repaint);
  const summary = getGlobalInfluenceSummary(entity);
  const state = ensureApotheosisState(entity);

  const statBox = el('div', 'apo-box');
  statBox.append(
    el('h4', null, t('apotheosis.pantheon.sumTitle', 'Tamrielic Standing & Discord')),
    el('div', 'apo-meta-row',
      t('apotheosis.pantheon.sumMeta', 'Your Global Influence: {avg}% avg · Regions Dominated: {dom}/{total}', {
        avg: summary.avgShares.player ?? 0,
        dom: summary.dominatedCounts.player ?? 0,
        total: TAMRIEL_REGION_COUNT,
      })),
  );

  // Sow Discord box
  const discRow = el('div', 'apo-row-inline');
  discRow.style.marginTop = '10px';
  const selA = el('select', 'apo-select');
  const selB = el('select', 'apo-select');
  selA.style.maxWidth = '200px';
  selB.style.maxWidth = '200px';
  for (const d of PANTHEON_DEITIES) {
    const optA = el('option', null, d.name);
    optA.value = d.id;
    if (d.id === pantheonDiscordA) optA.selected = true;
    const optB = el('option', null, d.name);
    optB.value = d.id;
    if (d.id === pantheonDiscordB) optB.selected = true;
    selA.append(optA);
    selB.append(optB);
  }
  const discBtn = el('button', 'apo-btn', t('apotheosis.pantheon.btnDiscord', 'Sow Discord ({cost} Faith)', { cost: PANTHEON_DISCORD_COST }));
  const syncDisc = () => {
    discBtn.disabled = pantheonDiscordA === pantheonDiscordB || (state.faith || 0) < PANTHEON_DISCORD_COST;
  };
  syncDisc();
  selA.onchange = () => { pantheonDiscordA = selA.value; syncDisc(); };
  selB.onchange = () => { pantheonDiscordB = selB.value; syncDisc(); };
  discBtn.onclick = () => {
    const res = sowDivineDiscord(entity, pantheonDiscordA, pantheonDiscordB, { nowMinutes: nowMin });
    setFeedback(
      res.ok
        ? t('apotheosis.pantheon.fbDiscord', 'Discord sown between {a} and {b} (mutual standing {val}).', {
          a: getPantheonDeity(res.pair[0])?.name ?? res.pair[0],
          b: getPantheonDeity(res.pair[1])?.name ?? res.pair[1],
          val: res.interRelation,
        })
        : res.error,
      !res.ok,
    );
    repaint();
  };
  discRow.append(selA, el('span', 'apo-pill', t('apotheosis.pantheon.vs', 'vs')), selB, discBtn);
  statBox.append(discRow);
  detail.append(statBox);

  const renderGroup = (titleText, deities) => {
    const groupBox = el('div', 'apo-box');
    groupBox.append(el('h4', null, titleText));
    const grid = el('div', 'apo-grid');
    for (const d of deities) {
      const entry = pantheon.deities[d.id];
      const grace = getDeityGraceInfo(entity, d.id, nowMin);
      const truceCost = computeDivineTruceCost(entity, d.id);
      const card = el('div', `apo-card${entry.status === 'allied' ? ' done' : entry.status === 'war' ? '' : ''}`);
      card.style.borderLeft = `3px solid ${d.color}`;

      const badgeCls = entry.status === 'allied' || entry.status === 'pact'
        ? 'apo-pill ok'
        : entry.status === 'war' || entry.status === 'hostile'
          ? 'apo-pill bad'
          : grace.active
            ? 'apo-pill info'
            : 'apo-pill warn';
      const statusText = entry.status === 'allied'
        ? t('apotheosis.pantheon.stAllied', 'Allied ({rel})', { rel: entry.relation })
        : entry.status === 'pact'
          ? t('apotheosis.pantheon.stPact', 'Pact ({rel})', { rel: entry.relation })
          : entry.status === 'war'
            ? t('apotheosis.pantheon.stWar', 'Holy War ({rel})', { rel: entry.relation })
            : entry.status === 'hostile'
              ? t('apotheosis.pantheon.stHostile', 'Hostile ({rel})', { rel: entry.relation })
              : grace.active
                ? t('apotheosis.pantheon.stGrace', 'Grace {d}d ({rel})', { d: grace.remainingDays, rel: entry.relation })
                : t('apotheosis.pantheon.stWary', 'Wary ({rel})', { rel: entry.relation });

      const head = el('div', 'apo-card-head');
      head.append(el('div', 'apo-card-title', d.name), el('span', badgeCls, statusText));

      const relPct = Math.round(((entry.relation + 100) / 200) * 100);
      const barWrap = el('div', 'apo-rel-bar');
      const barFill = el('div', 'apo-rel-fill');
      barFill.style.width = `${relPct}%`;
      barFill.style.background = entry.relation >= 20 ? '#6ad672' : entry.relation <= -40 ? '#e05858' : '#d6b34c';
      barWrap.append(barFill);

      const domCount = summary.dominatedCounts[d.id] ?? 0;
      const avgPct = summary.avgShares[d.id] ?? 0;
      card.append(
        head,
        el('div', 'apo-card-desc', `${d.title} · ${t('apotheosis.pantheon.avgShare', 'Tamriel {pct}% ({dom} reg)', { pct: avgPct, dom: domCount })}`),
        barWrap,
      );

      const acts = el('div', 'apo-acts');
      const addAction = (label, disabled, onClick) => {
        const b = el('button', 'apo-btn', label);
        b.style.padding = '4px 8px';
        b.style.fontSize = '12px';
        b.disabled = disabled;
        b.onclick = onClick;
        acts.append(b);
      };

      addAction(
        t('apotheosis.pantheon.actOffer', 'Offer ({cost})', { cost: PANTHEON_OFFERING_COST }),
        (state.faith || 0) < PANTHEON_OFFERING_COST,
        () => {
          const r = sendDivineOffering(entity, d.id, { nowMinutes: nowMin });
          setFeedback(r.ok ? t('apotheosis.pantheon.fbOk', '{name}: standing {rel} ({st}).', { name: d.name, rel: r.relation, st: r.status }) : r.error, !r.ok);
          repaint();
        },
      );
      if (!entry.pact && entry.status !== 'war') {
        addAction(
          t('apotheosis.pantheon.actPact', 'Pact ({cost})', { cost: PANTHEON_PACT_COST }),
          entry.relation < 10 || (state.faith || 0) < PANTHEON_PACT_COST,
          () => {
            const r = proposeDivinePact(entity, d.id, { nowMinutes: nowMin });
            setFeedback(r.ok ? t('apotheosis.pantheon.fbOk', '{name}: standing {rel} ({st}).', { name: d.name, rel: r.relation, st: r.status }) : r.error, !r.ok);
            repaint();
          },
        );
      }
      if (!entry.allied && entry.status !== 'war') {
        addAction(
          t('apotheosis.pantheon.actAlly', 'Ally ({cost})', { cost: PANTHEON_ALLIANCE_COST }),
          entry.relation < 50 || (state.faith || 0) < PANTHEON_ALLIANCE_COST,
          () => {
            const r = forgeDivineAlliance(entity, d.id, { nowMinutes: nowMin });
            setFeedback(r.ok ? t('apotheosis.pantheon.fbOk', '{name}: standing {rel} ({st}).', { name: d.name, rel: r.relation, st: r.status }) : r.error, !r.ok);
            repaint();
          },
        );
      }
      if (entry.status === 'war' || entry.relation <= -40) {
        addAction(
          t('apotheosis.pantheon.actTruce', 'Truce ({cost})', { cost: truceCost }),
          (state.faith || 0) < truceCost,
          () => {
            const r = offerDivineTruce(entity, d.id, { nowMinutes: nowMin });
            setFeedback(r.ok ? t('apotheosis.pantheon.fbTruce', '30-day Truce sealed with {name}.', { name: d.name }) : r.error, !r.ok);
            repaint();
          },
        );
      } else {
        addAction(
          t('apotheosis.pantheon.actWar', 'War ({cost})', { cost: PANTHEON_WAR_COST }),
          (state.faith || 0) < PANTHEON_WAR_COST,
          () => {
            const r = declareHolyWar(entity, d.id, { nowMinutes: nowMin });
            setFeedback(r.ok ? t('apotheosis.pantheon.fbWar', 'Holy War declared on {name}!', { name: d.name }) : r.error, !r.ok);
            repaint();
          },
        );
      }
      card.append(acts);
      grid.append(card);
    }
    groupBox.append(grid);
    detail.append(groupBox);
  };

  renderGroup(t('apotheosis.pantheon.aedraGroup', 'The Eight Divines (Aedra)'), PANTHEON_DEITIES.filter((d) => d.kind === 'aedra'));
  renderGroup(t('apotheosis.pantheon.daedraGroup', 'The Eight Daedric Princes'), PANTHEON_DEITIES.filter((d) => d.kind === 'daedra'));
}

function renderPantheonRegionsView(detail, entity, nowMin, repaint) {
  renderActiveReligiousWarsBox(detail, entity, nowMin, repaint);
  const state = ensureApotheosisState(entity);
  if (pantheonSelectedRegion == null) {
    pantheonSelectedRegion = Number.isInteger(entity?.currentRegionIndex) ? entity.currentRegionIndex : 17;
  }

  // 1. Divine Geopolitics (War & Peace between two targeted regions)
  const geoBox = el('div', 'apo-box');
  geoBox.append(el('h4', null, t('apotheosis.geo.title', 'Divine Geopolitics (Targeted War & Peace)')));
  const geoRow = el('div', 'apo-row-inline');
  const selA = el('select', 'apo-select');
  const selB = el('select', 'apo-select');
  selA.style.maxWidth = '220px';
  selB.style.maxWidth = '220px';
  for (let i = 0; i < TAMRIEL_REGION_COUNT; i++) {
    const label = `#${i} ${getLocalizedRegionName(i, (idx) => REGION_NAMES[idx] ?? `Region ${idx}`)}${isProvinceRegion(i) ? ' *' : ''}`;
    const oA = el('option', null, label);
    oA.value = String(i);
    if (i === pantheonGeoA) oA.selected = true;
    const oB = el('option', null, label);
    oB.value = String(i);
    if (i === pantheonGeoB) oB.selected = true;
    selA.append(oA);
    selB.append(oB);
  }
  const warBtn = el('button', 'apo-btn', t('apotheosis.geo.btnWar', 'Ignite War ({cost})', { cost: GEOPOLITICS_WAR_COST }));
  const peaceBtn = el('button', 'apo-btn', t('apotheosis.geo.btnPeace', 'Enforce Peace ({cost})', { cost: GEOPOLITICS_PEACE_COST }));
  const geoStatusRow = el('div', 'apo-row-inline');
  geoStatusRow.style.marginTop = '8px';
  const statusBadge = el('span', 'apo-pill');
  geoStatusRow.append(statusBadge);
  const regName = (idx) => getLocalizedRegionName(idx, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const syncGeo = () => {
    for (const opt of selA.options) opt.disabled = Number(opt.value) === pantheonGeoB;
    for (const opt of selB.options) opt.disabled = Number(opt.value) === pantheonGeoA;
    const same = pantheonGeoA === pantheonGeoB;
    const atWar = !same && areRegionsAtWar(entity, pantheonGeoA, pantheonGeoB);
    warBtn.disabled = same || atWar || (state.faith || 0) < GEOPOLITICS_WAR_COST;
    peaceBtn.disabled = same || !atWar || (state.faith || 0) < GEOPOLITICS_PEACE_COST;
    if (same) {
      statusBadge.className = 'apo-pill warn';
      statusBadge.textContent = t('apotheosis.geo.errRegions', 'Select two distinct Tamriel regions.');
    } else if (atWar) {
      statusBadge.className = 'apo-pill bad';
      statusBadge.textContent = t('apotheosis.geo.statusWar', 'Current Status: {a} and {b} are AT WAR', {
        a: regName(pantheonGeoA), b: regName(pantheonGeoB),
      });
    } else {
      statusBadge.className = 'apo-pill ok';
      statusBadge.textContent = t('apotheosis.geo.statusPeace', 'Current Status: {a} and {b} are AT PEACE', {
        a: regName(pantheonGeoA), b: regName(pantheonGeoB),
      });
    }
  };
  syncGeo();
  selA.onchange = () => { pantheonGeoA = parseInt(selA.value, 10); syncGeo(); };
  selB.onchange = () => { pantheonGeoB = parseInt(selB.value, 10); syncGeo(); };
  warBtn.onclick = () => {
    const r = igniteRegionWar(entity, pantheonGeoA, pantheonGeoB, { nowMinutes: nowMin });
    setFeedback(r.ok ? t('apotheosis.geo.fbWar', 'War ignited between selected realms!') : r.error, !r.ok);
    repaint();
  };
  peaceBtn.onclick = () => {
    const r = enforceRegionPeace(entity, pantheonGeoA, pantheonGeoB, { nowMinutes: nowMin });
    setFeedback(r.ok ? t('apotheosis.geo.fbPeace', 'Divine Peace enforced between selected realms!') : r.error, !r.ok);
    repaint();
  };
  geoRow.append(selA, el('span', 'apo-pill', t('apotheosis.pantheon.vs', 'vs')), selB, warBtn, peaceBtn);
  geoBox.append(geoRow, geoStatusRow);
  detail.append(geoBox);

  // 2. 71-Region Tamriel Divine Lens
  const lensBox = el('div', 'apo-box');
  lensBox.append(el('h4', null, t('apotheosis.lens.title', 'Tamriel Divine Lens')));
  const ctrlRow = el('div', 'apo-row-inline');
  ctrlRow.style.marginBottom = '10px';
  for (const [tid, tLabel] of [
    ['all', t('apotheosis.lens.all', 'All (71)')],
    ['bay', t('apotheosis.lens.bay', 'Iliac Bay (62)')],
    ['provinces', t('apotheosis.lens.prov', 'Provinces (9)')],
  ]) {
    const b = el('button', `apo-btn${pantheonTheatreFilter === tid ? ' primary' : ''}`, tLabel);
    b.style.padding = '4px 10px';
    b.style.fontSize = '12px';
    b.onclick = () => { pantheonTheatreFilter = tid; repaint(); };
    ctrlRow.append(b);
  }
  const warsBtn = el('button', `apo-btn${pantheonLensMode === 'wars' ? ' primary' : ''}`, t('apotheosis.lens.modeWars', 'Wars & Crises'));
  warsBtn.style.padding = '4px 10px';
  warsBtn.style.fontSize = '12px';
  warsBtn.onclick = () => {
    pantheonLensMode = pantheonLensMode === 'wars' ? 'all' : 'wars';
    repaint();
  };
  ctrlRow.append(warsBtn);
  const searchIn = el('input', 'apo-input');
  searchIn.type = 'text';
  searchIn.placeholder = t('apotheosis.lens.searchPh', 'Filter region or deity...');
  searchIn.value = pantheonRegionQuery;
  ctrlRow.append(searchIn);
  lensBox.append(ctrlRow);

  const gridEl = el('div', 'apo-lens-grid');
  const inspectorEl = el('div', 'apo-box');
  inspectorEl.style.marginTop = '12px';

  const paintRegionInspector = () => {
    inspectorEl.replaceChildren();
    const info = getRegionInfluence(entity, pantheonSelectedRegion);
    inspectorEl.append(el('h4', null, `${info.regionName} (#${info.regionIndex}${info.isProvince ? ` · ${t('apotheosis.lens.province', 'Tamriel Province')}` : ''})`));
    const sharesText = info.sorted.map(([k, v]) => {
      const label = k === 'player' ? t('apotheosis.map.you', 'Your Cult') : (getPantheonDeity(k)?.name ?? k);
      return `${label}: ${v}%`;
    }).join(' | ');
    inspectorEl.append(el('div', 'apo-card-desc', sharesText));
    const flagNames = Object.entries(REGION_FLAGS)
      .filter(([, fid]) => fid < 26 && conditionFlag(entity?.regionConditions, info.regionIndex, fid))
      .map(([fn]) => fn);
    if (flagNames.length > 0) {
      inspectorEl.append(el('div', 'apo-card-prog', t('apotheosis.lens.flags', 'Active Conditions: {list}', { list: flagNames.join(', ') })));
    }
    const geoSetRow = el('div', 'apo-acts');
    const bA = el('button', 'apo-btn', t('apotheosis.geo.setA', 'Set Geopolitics A'));
    const bB = el('button', 'apo-btn', t('apotheosis.geo.setB', 'Set Geopolitics B'));
    bA.style.padding = '4px 8px'; bA.style.fontSize = '12px';
    bB.style.padding = '4px 8px'; bB.style.fontSize = '12px';
    bA.onclick = () => { pantheonGeoA = info.regionIndex; repaint(); };
    bB.onclick = () => { pantheonGeoB = info.regionIndex; repaint(); };
    geoSetRow.append(bA, bB);
    inspectorEl.append(geoSetRow);
  };

  const CRISIS_FLAG_LIST = [
    REGION_FLAGS.WarBeginning,
    REGION_FLAGS.WarOngoing,
    REGION_FLAGS.PlagueBeginning,
    REGION_FLAGS.PlagueOngoing,
    REGION_FLAGS.FamineBeginning,
    REGION_FLAGS.FamineOngoing,
    REGION_FLAGS.WitchBurnings,
    REGION_FLAGS.CrimeWave,
    REGION_FLAGS.BadHarvest,
    REGION_FLAGS.PersecutedTemple,
    REGION_FLAGS.MadWizardNearby,
  ];

  const paintRegionGrid = () => {
    gridEl.replaceChildren();
    const q = pantheonRegionQuery.trim().toLowerCase();
    for (let i = 0; i < TAMRIEL_REGION_COUNT; i++) {
      if (pantheonTheatreFilter === 'bay' && isProvinceRegion(i)) continue;
      if (pantheonTheatreFilter === 'provinces' && !isProvinceRegion(i)) continue;
      const info = getRegionInfluence(entity, i);
      const leadDef = info.leaderId === 'player' ? null : getPantheonDeity(info.leaderId);
      const leadName = info.leaderId === 'player' ? t('apotheosis.map.you', 'Your Cult') : (leadDef?.name ?? info.leaderId);
      const hasWar = conditionFlag(entity?.regionConditions, i, REGION_FLAGS.WarOngoing) || conditionFlag(entity?.regionConditions, i, REGION_FLAGS.WarBeginning);
      const hasCrisis = CRISIS_FLAG_LIST.some((fid) => conditionFlag(entity?.regionConditions, i, fid));
      if (pantheonLensMode === 'wars' && !hasCrisis) continue;
      if (q && !`${info.regionName} ${leadName} ${i}`.toLowerCase().includes(q)) continue;

      const cell = el('button', `apo-lens-cell${i === pantheonSelectedRegion ? ' sel' : ''}${hasWar ? ' war' : ''}`);
      cell.style.borderLeft = `4px solid ${info.leaderId === 'player' ? 'rgb(243,239,44)' : (leadDef?.color ?? '#8b8370')}`;
      const metric = info.leaderId === 'player'
        ? t('apotheosis.lens.cellYouLead', 'Your Cult: {you}% (Leader)', { you: info.playerShare })
        : t('apotheosis.lens.cellBoth', 'Your Cult: {you}% · {lead}: {leadShare}%', {
            you: info.playerShare,
            lead: leadName,
            leadShare: info.leaderShare,
          });
      cell.append(
        el('div', 'apo-card-title', `${info.regionName}`),
        el('div', 'apo-card-desc', metric),
      );
      cell.onclick = () => {
        pantheonSelectedRegion = i;
        paintRegionGrid();
        paintRegionInspector();
      };
      gridEl.append(cell);
    }
  };

  searchIn.oninput = () => {
    pantheonRegionQuery = searchIn.value;
    paintRegionGrid();
  };
  paintRegionGrid();
  paintRegionInspector();
  lensBox.append(gridEl, inspectorEl);
  detail.append(lensBox);
}

function renderPantheonChronicleView(detail, entity) {
  const box = el('div', 'apo-box');
  box.append(el('h4', null, t('apotheosis.chronicle.title', 'Pantheon Chronicle (Searchable Log)')));
  const ctrlRow = el('div', 'apo-row-inline');
  ctrlRow.style.marginBottom = '10px';
  const filters = [
    ['all', t('apotheosis.chronicle.fAll', 'All')],
    ['my_cult', t('apotheosis.chronicle.fCult', 'My Cult')],
    ['against_me', t('apotheosis.chronicle.fAgainst', 'Against Me')],
    ['diplomacy', t('apotheosis.chronicle.fDip', 'Diplomacy & Wars')],
    ['regions', t('apotheosis.chronicle.fReg', 'Regional Shifts')],
  ];
  const filterBtns = [];
  const searchIn = el('input', 'apo-input');
  searchIn.type = 'text';
  searchIn.placeholder = t('apotheosis.chronicle.searchPh', 'Search by deity, region, or event...');
  searchIn.value = pantheonLogSearch;

  const listEl = el('div', 'apo-aurbis-log');
  listEl.style.maxHeight = '520px';

  const paintRows = () => {
    listEl.replaceChildren();
    const rows = queryPantheonChronicle(entity, { filter: pantheonLogFilter, search: pantheonLogSearch });
    if (!rows.length) {
      listEl.append(el('div', 'apo-card-desc', t('apotheosis.chronicle.empty', 'No matching Chronicle records.')));
      return;
    }
    for (const r of rows) {
      listEl.append(el('div', null, `[Day ${r.day}] ${r.text}`));
    }
  };

  for (const [fid, fLabel] of filters) {
    const b = el('button', `apo-btn${pantheonLogFilter === fid ? ' primary' : ''}`, fLabel);
    b.style.padding = '4px 10px';
    b.style.fontSize = '12px';
    b.onclick = () => {
      pantheonLogFilter = fid;
      for (const [otherId, otherBtn] of filterBtns) {
        otherBtn.className = `apo-btn${pantheonLogFilter === otherId ? ' primary' : ''}`;
      }
      paintRows();
    };
    filterBtns.push([fid, b]);
    ctrlRow.append(b);
  }
  ctrlRow.append(searchIn);
  searchIn.oninput = () => {
    pantheonLogSearch = searchIn.value;
    paintRows();
  };
  paintRows();
  box.append(ctrlRow, listEl);
  detail.append(box);
}

function renderPantheonSection(detail, entity, repaint, tabId) {
  const state = ensureApotheosisState(entity);
  const headingMap = {
    pantheon_deities: t('apotheosis.pantheon.tabDeities', 'Deities & Diplomacy'),
    pantheon_regions: t('apotheosis.pantheon.tabRegions', 'Divine Lens & Geopolitics'),
    pantheon_chronicle: t('apotheosis.pantheon.tabChronicle', 'Pantheon Chronicle'),
  };
  const hero = el('div', 'apo-hero');
  const left = el('div');
  left.append(
    el('div', 'apo-hero-title', headingMap[tabId] ?? t('apotheosis.pantheon.heading', 'Pantheon & 4X Dominion')),
    el('div', 'apo-meta-row',
      t('apotheosis.pantheon.sub', 'Manage relations with 8 Aedra & 8 Daedra, track influence across 71 Tamriel regions, and issue Geopolitical decrees.')),
  );
  hero.append(left, el('span', stageBadgeClass(state), stageBadgeText(state)));
  detail.append(hero);

  if (!state.ascended && state.stage !== APOTHEOSIS_STAGES.ASCENDED) {
    detail.append(el('div', 'apo-box',
      t('apotheosis.pantheon.locked', 'Ascend to Godhood and claim a Divine Portfolio to enter the Pantheon of Aurbis.')));
    return;
  }

  let nowMin = 0;
  try { nowMin = worldMinutes() || 0; } catch { nowMin = 0; }
  const pantheon = ensurePantheonState(entity, { nowMinutes: nowMin });

  if (tabId === 'pantheon_regions') {
    renderPantheonRegionsView(detail, entity, nowMin, repaint);
  } else if (tabId === 'pantheon_chronicle') {
    renderPantheonChronicleView(detail, entity);
  } else {
    renderPantheonDeitiesView(detail, entity, pantheon, nowMin, repaint);
  }
}

function paint(root, { resetDetailScroll = false } = {}) {
  const entity = playerEntity;
  const trackerShown = !!getPref('apotheosisShowTracker');
  const secs = currentSections(trackerShown);
  if (!secs.some(([id]) => id === activeSec)) activeSec = 'overview';

  const bodyEl = root.parentElement;
  const bodyScrollTop = bodyEl?.scrollTop ?? 0;
  const railScrollTop = root.querySelector?.('.px-qrail')?.scrollTop ?? 0;
  const detailScrollTop = resetDetailScroll ? 0 : (root.querySelector?.('.px-qdetail')?.scrollTop ?? 0);
  const lensScrollTop = resetDetailScroll ? 0 : (root.querySelector?.('.apo-lens-grid')?.scrollTop ?? 0);
  const logScrollTop = resetDetailScroll ? 0 : (root.querySelector?.('.apo-aurbis-log')?.scrollTop ?? 0);
  const refScrollTop = resetDetailScroll ? 0 : (root.querySelector?.('.apo-aurbis-ref')?.scrollTop ?? 0);
  const pickerScrollTop = root.querySelector?.('.apo-picker-scroll')?.scrollTop ?? 0;

  repaintKeepingScroll(root, () => {
    root.replaceChildren();
    const wrap = el('div', 'px-journal');
    const rail = el('div', 'px-qrail');

    const repaint = (opts = {}) => paint(root, opts);
    for (const [id, label] of secs) {
      if (id === 'overview') {
        rail.append(el('div', 'apo-qrail-group-hdr', t('apotheosis.group.ascension', 'Ascension')));
      } else if (id === 'portfolio') {
        rail.append(el('div', 'apo-qrail-group-hdr', t('apotheosis.group.godhood', 'Godhood')));
      }
      const b = el('button', `px-qrow${id === activeSec ? ' on' : ''}`);
      b.append(el('span', 'px-c', '\u25c6'), document.createTextNode(label));
      b.onclick = () => {
        activeSec = id;
        repaint({ resetDetailScroll: true });
      };
      rail.append(b);
    }
    wrap.append(rail);

    const mainCol = el('div', 'apo-main-col');
    const st = ensureApotheosisState(entity);
    const hasStickyFaith = Boolean(st?.ascended || st?.stage === APOTHEOSIS_STAGES.ASCENDED);
    if (hasStickyFaith) ensureCultState(entity);
    if (hasStickyFaith || statusMessage) {
      const stickyHead = el('div', 'apo-sticky-head');
      if (hasStickyFaith) renderFaithBox(stickyHead, st, entity);
      if (statusMessage) stickyHead.append(el('div', `apo-notice${statusIsError ? ' err' : ''}`, statusMessage));
      mainCol.append(stickyHead);
    }

    const detail = el('div', 'px-qdetail px-sys');
    detail.setAttribute?.('data-scroll-key', `${activeSec}:${activeSec === 'cult' ? getCultScrollKey() : ''}`);
    if (activeSec === 'overview') {
      renderOverview(detail, entity, trackerShown, repaint);
    } else if (activeSec === 'portfolio') {
      renderPortfolioPage(detail, entity, repaint);
    } else if (activeSec === 'aurbis') {
      renderAurbisPage(detail, entity, repaint);
    } else if (activeSec === 'pantheon_deities' || activeSec === 'pantheon_regions' || activeSec === 'pantheon_chronicle') {
      renderPantheonSection(detail, entity, repaint, activeSec);
    } else if (activeSec === 'cult' || activeSec === 'edicts') {
      renderCultPage(detail, entity, repaint, {
        mode: activeSec === 'edicts' ? 'edicts' : 'sanctuaries',
        rootModalParent: root,
        setFeedback,
      });
    } else {
      const fate = evaluateFateWeight(entity);
      const cat = fate.categories.find((c) => c.id === activeSec);
      if (cat) renderCategory(detail, cat);
    }
    mainCol.append(detail);
    wrap.append(mainCol);
    root.append(wrap);

    if (pickerOpen) {
      renderPickerModal(root, repaint, entity);
    }
    renderAltarStatueModal(root, entity, repaint, setFeedback);
  }, { focus: true });

  const newRail = root.querySelector?.('.px-qrail');
  const newDetail = root.querySelector?.('.px-qdetail');
  const newLens = root.querySelector?.('.apo-lens-grid');
  const newLog = root.querySelector?.('.apo-aurbis-log');
  const newRef = root.querySelector?.('.apo-aurbis-ref');
  const newPicker = root.querySelector?.('.apo-picker-scroll');
  if (newRail && railScrollTop) newRail.scrollTop = railScrollTop;
  if (newDetail && !resetDetailScroll && detailScrollTop) newDetail.scrollTop = detailScrollTop;
  if (newLens && !resetDetailScroll && lensScrollTop) newLens.scrollTop = lensScrollTop;
  if (newLog && !resetDetailScroll && logScrollTop) newLog.scrollTop = logScrollTop;
  if (newRef && !resetDetailScroll && refScrollTop) newRef.scrollTop = refScrollTop;
  if (newPicker && pickerScrollTop) newPicker.scrollTop = pickerScrollTop;
  if (bodyEl && !resetDetailScroll && bodyScrollTop) bodyEl.scrollTop = bodyScrollTop;
}

/** Draws the Apotheosis Pause tab body. */
export function drawApotheosisPane(body) {
  ensureStyle();
  const root = el('div', 'apo-pane');
  body.append(root);
  paint(root);
}
