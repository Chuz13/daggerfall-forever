// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 3 (MILESTONE 3.2): CULT, TEMPLES & 71-REGION EDICTS UI PANEL
// ═══════════════════════════════════════════════════════════════════════════════

import { REGION_NAMES, isProvinceRegion } from '../formats/mapsTables.js';
import { t, getLocalizedRegionName } from '../systems/textManager.js';
import { getAurbisRuntime } from '../systems/apotheosis/apotheosisLive.js';
import {
  TAMRIEL_REGION_COUNT,
  getPantheonDeity,
  ensurePantheonState,
  getRegionInfluence,
} from '../systems/apotheosis/apotheosisStage3.js';
import {
  CULT_FOUND_FAITH_COST,
  CULT_FOUND_GOLD_COST,
  CULT_CONSECRATE_FORCE_FAITH_COST,
  CULT_CONSECRATE_PEACEFUL_FAITH_COST,
  CULT_BRANCH_SWITCH_COST,
  CULT_BRANCH_COOLDOWN_DAYS,
  CULT_TELEPORT_SANCTUARY_FAITH_COST,
  CULT_UPGRADE_TIERS,
  CULT_BRANCHES,
  CULT_ALTAR_STYLES,
  REGIONAL_EDICTS,
  REGIONAL_EDICT_IDS,
  REGIONAL_EDICT_COST,
  ensureCultState,
  ensureCityCultSites,
  getCityCultSites,
  getAllCultSites,
  getCultBranchCooldownInfo,
  getCultAltarStyle,
  setCultAltarStyle,
  attemptUnlockSanctuaryHatch,
  obtainSanctuaryKeyFromGatekeeper,
  consecrateSiteByForce,
  initiateForceConsecrationAssault,
  dedicateSitePeacefully,
  foundPlayerUndergroundSanctuary,
  upgradeCultSite,
  selectCultSiteBranch,
  teleportToCultSanctuary,
  canIssueRegionalEdict,
  getActiveRegionalEdict,
  proclaimRegionalEdict,
  getCultPassiveFaithPerDay,
  hasSanctuaryKey,
} from '../systems/apotheosis/apotheosisCult.js';
import {
  getRoadBlessingInfo,
  ensureCultPetition,
  getActiveCultPetition,
  dismissCultPetition,
  syncEdictPetitionIfActive,
} from '../systems/apotheosis/apotheosisStage33.js';
import {
  getActiveCultSieges,
  getCultSiegePreview,
  resolveCultSiegeOutcome,
} from '../systems/apotheosis/apotheosisStage34.js';
import { exteriorOpenSpellFor, consumeDoorSpell } from '../scenes/shared.js';

let cultScopeFilter = 'city';
let cultEdictRegion = null;
let cultEdictSearch = '';
let branchModalState = null; // { mode: 'found'|'branch', siteKey?: string, mapId, regionIndex, locationName, currentBranch, selectedBranch }
let statueModalOpen = false;
const statueIconCache = new Map();

function uiEl(tag, cls = '', text = null) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function resolveLiveRegionIndex(entity) {
  const sceneCtx = getAurbisRuntime().getSceneContext?.();
  const raw = sceneCtx?.getCultCity?.()?.regionIndex
    ?? sceneCtx?.getRegionIndex?.()
    ?? (Number.isInteger(entity?.currentRegionIndex) ? entity.currentRegionIndex : 17);
  return Math.max(0, Math.min(TAMRIEL_REGION_COUNT - 1, Math.trunc(Number(raw) || 0)));
}

export function resetCultSectionUiState() {
  cultScopeFilter = 'city';
  cultEdictRegion = null;
  cultEdictSearch = '';
  branchModalState = null;
  statueModalOpen = false;
}

function attachStatuePreview(wrap, style) {
  const thumb = uiEl('div', 'apo-statue-thumb');
  if (style.kind === 'flat') {
    const key = `${style.archive}:${style.record}`;
    const cached = statueIconCache.get(key);
    const addImg = (url) => {
      if (!url) {
        thumb.textContent = '2D';
        return;
      }
      const img = document.createElement('img');
      img.alt = '';
      img.src = url;
      thumb.replaceChildren(img);
    };
    if (cached !== undefined) {
      addImg(cached);
    } else {
      thumb.textContent = '2D';
      const urlFn = getAurbisRuntime().getSceneContext?.()?.getTextureIconUrl;
      if (typeof urlFn === 'function') {
        Promise.resolve(urlFn(style.archive, style.record)).then((url) => {
          statueIconCache.set(key, url || null);
          if (url) addImg(url);
        }, () => {});
      }
    }
  } else {
    thumb.textContent = `3D #${style.modelId}`;
  }
  wrap.append(thumb);
}

/** Compact Cult Altar Statue selector box usable in both Cult Sanctums & Divine Portfolio / Ascension UI. */
export function renderAltarStatueBox(container, entity, repaint, setFeedback) {
  const curStyle = getCultAltarStyle(entity);
  const box = uiEl('div', 'apo-box');
  box.append(uiEl('h4', null, t('apotheosis.cult.altarStyleBoxTitle', 'Cult Altar Statue Appearance')));
  const row = uiEl('div', 'apo-row-inline');
  attachStatuePreview(row, curStyle);
  const infoCol = uiEl('div');
  infoCol.style.flex = '1';
  infoCol.append(
    uiEl('div', 'apo-card-title', t(curStyle.nameKey, curStyle.fallbackName)),
    uiEl('div', 'apo-card-desc', t('apotheosis.cult.altarStyleDesc', 'Choose the 2D Statue Flat or 3D Statue Model manifested at altars inside all consecrated Temples and Sanctuaries.')),
  );
  const pickBtn = uiEl('button', 'apo-btn primary', t('apotheosis.cult.btnOpenStatuePicker', 'Choose Altar Statue'));
  pickBtn.onclick = () => {
    statueModalOpen = true;
    repaint();
  };
  row.append(infoCol, pickBtn);
  box.append(row);
  container.append(box);
}

/** Full modal picker over `CULT_ALTAR_STYLES` (both 2D flats & 3D statue models). */
export function renderAltarStatueModal(modalRoot, entity, repaint, setFeedback) {
  if (!statueModalOpen || !modalRoot) return;
  const curStyle = getCultAltarStyle(entity);
  const backdrop = uiEl('div', 'apo-picker-backdrop');
  const modal = uiEl('div', 'apo-picker-modal');

  const head = uiEl('div', 'apo-picker-head');
  head.append(
    uiEl('div', 'apo-picker-title', t('apotheosis.cult.altarStyleModalTitle', 'Choose Your Cult Altar Statue')),
    uiEl('span', 'apo-pill ok', t('apotheosis.cult.altarStyleCurrentBadge', 'Current: {name}', {
      name: t(curStyle.nameKey, curStyle.fallbackName),
    })),
  );
  modal.append(head);
  modal.append(uiEl('div', 'apo-picker-sub', t('apotheosis.cult.altarStyleModalSub', 'Select either a classic 2D Statue Billboard (with live sprite preview) or a 3D Statue Model. Your choice applies across all player Sanctuaries and consecrated Temples with zero collision.')));

  const scroll = uiEl('div', 'apo-picker-scroll');
  for (const st of CULT_ALTAR_STYLES) {
    const isSel = st.id === curStyle.id;
    const card = uiEl('button', `apo-art-card${isSel ? ' sel' : ''}`);
    const top = uiEl('div', 'apo-row-inline');
    attachStatuePreview(top, st);
    const meta = uiEl('div');
    meta.append(
      uiEl('div', 'apo-art-name', t(st.nameKey, st.fallbackName)),
      uiEl('div', 'apo-art-meta', st.kind === 'flat'
        ? t('apotheosis.cult.altarKindFlat', '2D Statue Flat · Archive {a} #{r}', { a: st.archive, r: st.record })
        : t('apotheosis.cult.altarKindModel', '3D Statue Model · ARCH3D #{m}', { m: st.modelId })),
    );
    top.append(meta);
    card.append(top);
    card.onclick = () => {
      const r = setCultAltarStyle(entity, st.id);
      if (r.ok) {
        statueModalOpen = false;
        setFeedback(t('apotheosis.cult.altarStyleSet', 'Cult Altar Statue changed to {name}.', { name: t(st.nameKey, st.fallbackName) }), false);
      } else {
        setFeedback(r.reason, true);
      }
      repaint();
    };
    scroll.append(card);
  }
  modal.append(scroll);

  const foot = uiEl('div', 'apo-picker-foot');
  const closeBtn = uiEl('button', 'apo-btn', t('apotheosis.close', 'Close'));
  closeBtn.onclick = () => {
    statueModalOpen = false;
    repaint();
  };
  foot.append(uiEl('span', 'apo-card-desc', t('apotheosis.cult.altarStyleFootNote', 'Click any statue to apply immediately.')), closeBtn);
  modal.append(foot);
  backdrop.append(modal);
  modalRoot.append(backdrop);
}

export function getCultScrollKey() {
  return `cult:${cultScopeFilter}`;
}

function makeActionBtn(label, { tone = 'default', blockedReason = null, onRun, setFeedback }) {
  const cls = blockedReason
    ? 'apo-btn is-disabled'
    : (tone === 'primary' ? 'apo-btn primary' : tone === 'danger' ? 'apo-btn danger' : 'apo-btn');
  const btn = uiEl('button', cls, label);
  if (blockedReason) btn.title = blockedReason;
  btn.onclick = () => {
    if (blockedReason) {
      setFeedback(blockedReason, true);
      return;
    }
    onRun();
  };
  return btn;
}

function renderSpecializationModal(modalRoot, entity, nowMin, repaint, setFeedback) {
  if (!branchModalState || !modalRoot) return;
  const st = branchModalState;
  const isFound = st.mode === 'found';
  const curBranch = st.currentBranch || null;
  const site = st.siteKey ? getAllCultSites(entity).find((s) => s.siteKey === st.siteKey) : null;
  const cd = site && !isFound ? getCultBranchCooldownInfo(site, nowMin) : { onCooldown: false, remainingDays: 0 };
  const faithCur = Math.trunc(Number(entity?.apotheosis?.faith) || 0);
  const goldCur = Math.max(0, Math.trunc(Number(entity?.goldPieces) || 0));
  const selectedCost = isFound
    ? CULT_FOUND_FAITH_COST
    : (!curBranch ? 0 : CULT_BRANCH_SWITCH_COST);
  const selectedGoldCost = isFound ? CULT_FOUND_GOLD_COST : 0;
  const fmtNum = (n) => Math.trunc(Number(n) || 0).toLocaleString('en-US');

  const backdrop = uiEl('div', 'apo-picker-backdrop');
  const modal = uiEl('div', 'apo-picker-modal');

  const head = uiEl('div', 'apo-picker-head');
  const titleText = isFound
    ? t('apotheosis.cult.modalFoundTitle', 'Found Underground Sanctuary — {city}', { city: st.locationName })
    : t('apotheosis.cult.modalBranchTitle', 'Sanctuary Specialization — {site}', { site: site?.name ?? '' });
  head.append(
    uiEl('div', 'apo-picker-title', titleText),
    uiEl('span', 'apo-pill info', isFound
      ? t('apotheosis.cult.modalFoundBadgeGold', 'Cost: {faith} Faith · {gold}g', {
          faith: CULT_FOUND_FAITH_COST,
          gold: fmtNum(CULT_FOUND_GOLD_COST),
        })
      : (!curBranch
        ? t('apotheosis.cult.modalFirstPickFree', 'Initial Specialization: Free')
        : t('apotheosis.cult.modalSwitchMeta', 'Switch Cost: {cost} Faith · Cooldown: {days}d', {
            cost: CULT_BRANCH_SWITCH_COST,
            days: CULT_BRANCH_COOLDOWN_DAYS,
          }))),
  );
  modal.append(head);

  const subText = isFound
    ? t('apotheosis.cult.modalFoundSub', 'A concealed subterranean hatch will appear in this settlement (+15% Regional Influence & +100 Max Faith). Choose your Sanctum order:')
    : (!curBranch
      ? t('apotheosis.cult.modalBranchFirstSub', 'Select the permanent focus for pilgrims and guardians stationed at this Sanctum (switching later costs {cost} Faith and has a {days}-day cooldown).', {
          cost: CULT_BRANCH_SWITCH_COST,
          days: CULT_BRANCH_COOLDOWN_DAYS,
        })
      : (cd.onCooldown
        ? t('apotheosis.cult.err.branchCooldown', 'Specialization switch is on cooldown ({days}d remaining).', { days: cd.remainingDays })
        : t('apotheosis.cult.modalBranchSwitchSub', 'Reassigning this Sanctum costs {cost} Faith and places a {days}-day cooldown before another switch.', {
            cost: CULT_BRANCH_SWITCH_COST,
            days: CULT_BRANCH_COOLDOWN_DAYS,
          })));
  modal.append(uiEl('div', 'apo-picker-sub', subText));

  const scroll = uiEl('div', 'apo-picker-scroll');
  for (const br of Object.values(CULT_BRANCHES)) {
    const isSel = st.selectedBranch === br.id;
    const isCur = curBranch === br.id;
    const card = uiEl('button', `apo-art-card${isSel ? ' sel' : ''}`);
    card.disabled = !isFound && isCur;
    const bonusLine = br.maxFaithBonus > 0
      ? t('apotheosis.cult.branchMetaMaxFaith', '+{day} Faith/day · +{cap} Max Faith', {
          day: br.bonusFaithPerDay,
          cap: br.maxFaithBonus,
        })
      : (br.extraGuards > 0
        ? t('apotheosis.cult.branchMetaGuards', '+{g} Cult Guardians inside', { g: br.extraGuards })
        : t('apotheosis.cult.branchMetaMissionary', '×1.5 Regional Influence/day'));
    card.append(
      uiEl('div', 'apo-art-name', isCur
        ? t('apotheosis.cult.branchActiveOption', '{name} (Current)', { name: t(br.nameKey, br.fallbackName) })
        : t(br.nameKey, br.fallbackName)),
      uiEl('div', 'apo-art-meta', bonusLine),
      uiEl('div', 'apo-card-desc', t(br.descKey, br.fallbackDesc)),
    );
    card.onclick = () => {
      st.selectedBranch = br.id;
      repaint();
    };
    scroll.append(card);
  }
  modal.append(scroll);

  const foot = uiEl('div', 'apo-picker-foot');
  const cancelBtn = uiEl('button', 'apo-btn', t('apotheosis.picker.cancel', 'Cancel'));
  cancelBtn.onclick = () => {
    branchModalState = null;
    repaint();
  };

  let confirmBlocked = null;
  if (!st.selectedBranch || (!isFound && st.selectedBranch === curBranch)) {
    confirmBlocked = t('apotheosis.cult.err.chooseBranch', 'Choose a different specialization branch first.');
  } else if (!isFound && curBranch && cd.onCooldown) {
    confirmBlocked = t('apotheosis.cult.err.branchCooldown', 'Specialization switch is on cooldown ({days}d remaining).', { days: cd.remainingDays });
  } else if (faithCur < selectedCost) {
    confirmBlocked = t('apotheosis.cult.err.needFaith', 'Not enough Faith (need {need}, have {have}).', {
      need: selectedCost,
      have: faithCur,
    });
  } else if (goldCur < selectedGoldCost) {
    confirmBlocked = t('apotheosis.roadShrine.err.notEnoughGold', 'Not enough gold ({have}g / {need}g).', {
      have: fmtNum(goldCur),
      need: fmtNum(selectedGoldCost),
    });
  }

  const confirmLabel = isFound
    ? t('apotheosis.cult.btnConfirmFoundGold', 'Found Sanctuary ({faith} Faith · {gold}g)', {
        faith: selectedCost,
        gold: fmtNum(selectedGoldCost),
      })
    : (selectedCost > 0
      ? t('apotheosis.cult.btnConfirmSwitch', 'Switch Specialization ({cost} Faith)', { cost: selectedCost })
      : t('apotheosis.cult.btnConfirmSelect', 'Confirm Specialization (Free)'));

  const confirmBtn = makeActionBtn(confirmLabel, {
    tone: 'primary',
    blockedReason: confirmBlocked,
    setFeedback,
    onRun: () => {
      if (isFound) {
        const r = foundPlayerUndergroundSanctuary(entity, {
          mapId: st.mapId,
          regionIndex: st.regionIndex,
          locationName: st.locationName,
          branch: st.selectedBranch,
          nowMinutes: nowMin,
        });
        if (r.ok) branchModalState = null;
        setFeedback(r.ok ? t('apotheosis.cult.foundedHud', 'Secret Cult Undercroft founded beneath the city!') : r.reason, !r.ok);
      } else {
        const r = selectCultSiteBranch(entity, st.siteKey, st.selectedBranch, { nowMinutes: nowMin });
        if (r.ok) branchModalState = null;
        setFeedback(r.ok ? t('apotheosis.cult.branchSetHud', 'Selected specialization branch.') : r.reason, !r.ok);
      }
      repaint();
    },
  });
  const confirmWrap = uiEl('div', 'apo-row-inline');
  if (isFound) {
    const pickStatueBtn = uiEl('button', 'apo-btn', t('apotheosis.cult.btnChooseAltarInModal', 'Altar Statue: {name}', {
      name: t(getCultAltarStyle(entity).nameKey, getCultAltarStyle(entity).fallbackName),
    }));
    pickStatueBtn.onclick = () => {
      statueModalOpen = true;
      repaint();
    };
    confirmWrap.append(pickStatueBtn);
  }
  confirmWrap.append(cancelBtn, confirmBtn);
  if (confirmBlocked) {
    foot.append(uiEl('span', 'apo-pill bad', confirmBlocked), confirmWrap);
  } else {
    foot.append(uiEl('span', 'apo-card-desc', t('apotheosis.cult.modalReady', 'Ready to enact decree.')), confirmWrap);
  }

  modal.append(foot);
  backdrop.append(modal);
  modalRoot.append(backdrop);
}

function runSacrificeSiegeSite(entity, siteKey, nowMin, setFeedback, repaint) {
  const r = resolveCultSiegeOutcome(entity, siteKey, 'failed', { nowMinutes: nowMin });
  if (r.ok) {
    getAurbisRuntime().getSceneContext?.()?.dismissCultSiegeBattle?.(siteKey);
  }
  setFeedback(r.ok ? r.message : r.reason, !r.ok);
  repaint();
}

function renderSiteCard(container, entity, pantheon, site, nowMin, repaint, setFeedback, closePause = null) {
  const regName = getLocalizedRegionName(site.regionIndex, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const owned = site.ownerId === 'player';
  const ownerGod = owned ? null : getPantheonDeity(site.ownerId);
  const ownerEntry = ownerGod ? pantheon?.deities?.[ownerGod.id] : null;
  const faithCur = Math.trunc(Number(entity?.apotheosis?.faith) || 0);
  const goldCur = Math.max(0, Math.trunc(Number(entity?.goldPieces) || 0));
  const fmtNum = (n) => Math.trunc(Number(n) || 0).toLocaleString('en-US');
  const sceneCtx = getAurbisRuntime().getSceneContext?.() ?? null;
  const isNearHatch = site.kind === 'sanctuary' ? Boolean(sceneCtx?.isNearCultHatch?.(site.siteKey)) : false;

  const card = uiEl('div', `apo-card${owned ? ' done' : ''}`);
  const head = uiEl('div', 'apo-card-head');
  const titleWrap = uiEl('div');
  titleWrap.append(
    uiEl('div', 'apo-card-title', site.name),
    uiEl('div', 'apo-meta-row', `${site.kind === 'temple' ? t('apotheosis.cult.kindTemple', 'Aedra Temple') : t('apotheosis.cult.kindSanctuary', 'Underground Sanctuary')} · ${regName}`),
  );
  head.append(titleWrap);
  head.append(owned
    ? uiEl('span', 'apo-pill ok', t('apotheosis.cult.ownedBadge', 'Your Cult • Tier {tier}', { tier: site.tier || 1 }))
    : uiEl('span', `apo-pill ${ownerEntry?.status === 'war' || ownerEntry?.status === 'hostile' ? 'bad' : ownerEntry?.status === 'allied' ? 'ok' : ''}`, t('apotheosis.cult.ownerPatron', 'Owner: {god} ({rel})', {
        god: ownerGod?.name ?? site.ownerId,
        rel: ownerEntry?.relation ?? 0,
      })));
  card.append(head);

  const metaRow = uiEl('div', 'apo-row-inline');
  if (owned) {
    const tierSpec = CULT_UPGRADE_TIERS[Math.max(1, Math.min(3, site.tier || 1))] ?? CULT_UPGRADE_TIERS[1];
    const bSpec = site.branch ? CULT_BRANCHES[site.branch] : null;
    const totalFaithDay = tierSpec.faithPerDay + (bSpec?.bonusFaithPerDay ?? 0);
    const totalMaxBonus = (tierSpec.maxFaithBonus ?? 0) + (bSpec?.maxFaithBonus ?? 0);
    metaRow.append(uiEl('span', 'apo-pill info', bSpec ? t(bSpec.nameKey, bSpec.fallbackName) : t('apotheosis.cult.branchNoneShort', 'No Branch')));
    metaRow.append(uiEl('span', 'apo-pill ok', `+${totalFaithDay} Faith/d · +${totalMaxBonus} Max`));
    if (site.siege) {
      const hrsLeft = Math.max(1, Math.ceil((Number(site.siege.expiresAtMinutes ?? nowMin) - nowMin) / 60));
      metaRow.append(uiEl('span', 'apo-pill bad', t('apotheosis.siege.cardBadge', 'UNDER SIEGE ({hrs}h)', { hrs: hrsLeft })));
    }
  } else {
    if (site.kind === 'sanctuary') {
      metaRow.append(uiEl('span', `apo-pill ${site.unlocked ? 'ok' : 'warn'}`, site.unlocked
        ? t('apotheosis.cult.openBadge', 'Open')
        : t('apotheosis.cult.lockedBadge', 'Locked')));
      if (site.alarmTriggered) metaRow.append(uiEl('span', 'apo-pill bad', t('apotheosis.cult.alarmBadge', 'Alarm Triggered')));
      if (hasSanctuaryKey(entity, site.siteKey)) metaRow.append(uiEl('span', 'apo-pill ok', t('apotheosis.cult.hasKeyBadge', 'Has Seal Key')));
    }
    metaRow.append(uiEl('span', `apo-pill ${site.guardiansCleared ? 'ok' : ''}`, site.guardiansCleared
      ? t('apotheosis.cult.guardiansClear', 'Guardians: Defeated')
      : t('apotheosis.cult.guardiansActive', 'Guardians: Active')));
  }
  card.append(metaRow);

  if (!owned) {
    const relOkHostile = ownerEntry?.status === 'war' || ownerEntry?.status === 'hostile';
    const relOkAlly = ownerEntry?.status === 'allied' && Number(ownerEntry?.relation ?? 0) === 100;
    const reqText = t('apotheosis.cult.reqsSummary', 'Force ({fCost}F): {r1} Hostile/War, {r2} Guardians Slain · Peaceful ({pCost}F): {r3} Allied 100', {
      fCost: CULT_CONSECRATE_FORCE_FAITH_COST,
      r1: relOkHostile ? '✓' : '✗',
      r2: site.guardiansCleared ? '✓' : '✗',
      pCost: CULT_CONSECRATE_PEACEFUL_FAITH_COST,
      r3: relOkAlly ? '✓' : '✗',
    });
    card.append(uiEl('div', 'apo-card-desc', reqText));
  }

  const acts = uiEl('div', 'apo-acts');
  if (owned && site.siege) {
    const hrsLeft = Math.max(1, Math.ceil((Number(site.siege.expiresAtMinutes ?? nowMin) - nowMin) / 60));
    const prev = getCultSiegePreview(entity, site);
    card.append(uiEl('div', 'apo-card-desc', t(
      'apotheosis.siege.cardDescDetailed',
      'Besieged by {god} ({hrs}h remaining · {left}/{atk} Attackers left vs {def} Garrison)!',
      {
        god: prev?.attackerName ?? site.siege.attackerGodId,
        hrs: hrsLeft,
        left: prev?.remainingAttackers ?? site.siege.attackerCount ?? 3,
        atk: prev?.attackerCount ?? site.siege.attackerCount ?? 3,
        def: prev?.defenderCount ?? site.siege.defenderCount ?? 2,
      },
    )));
    if (prev) {
      card.append(uiEl('div', 'apo-card-prog', t(
        'apotheosis.siege.stakesLine',
        'Victory: +{faith} Faith · +{gold}g · +{inf}% Inf | Fall/Sacrifice: Reverts to {god} Tier 1 (-{loss}% Inf)',
        {
          faith: prev.victoryFaith,
          gold: prev.victoryGold,
          inf: prev.victoryInfluence,
          god: prev.attackerName,
          loss: prev.lossInfluence,
        },
      )));
    }
    const curCity = sceneCtx?.getCultCity?.() ?? null;
    const inSameCity = curCity && (Number(curCity.mapId) >>> 0) === (Number(site.mapId) >>> 0);
    const tpDefCost = inSameCity ? 0 : CULT_TELEPORT_SANCTUARY_FAITH_COST;
    const defBlocked = !sceneCtx?.defendCultSiege
      ? t('apotheosis.siege.errNoRuntime', 'Siege battle runtime unavailable.')
      : faithCur < tpDefCost
        ? t('apotheosis.cult.err.needFaith', 'Not enough Faith (need {need}, have {have}).', { need: tpDefCost, have: faithCur })
        : null;
    const defLabel = tpDefCost > 0
      ? t('apotheosis.siege.btnDefendCost', 'Teleport to Defend Siege ({cost} Faith)', { cost: tpDefCost })
      : t('apotheosis.siege.btnDefendFree', 'Defend Siege Here (Free)');
    acts.append(makeActionBtn(defLabel, {
      tone: 'primary',
      blockedReason: defBlocked,
      setFeedback,
      onRun: () => {
        Promise.resolve(sceneCtx.defendCultSiege(site.siteKey)).then((r) => {
          if (r && !r.ok) {
            setFeedback(r.reason, true);
            repaint();
          } else {
            setFeedback(r?.message || t('apotheosis.siege.deployedHud', 'Arrived at {site} to break the siege!', { site: site.name }), false);
            if (closePause) closePause();
            else repaint();
          }
        });
      },
    }));
    acts.append(makeActionBtn(
      t('apotheosis.siege.btnSacrifice', 'Sacrifice Sanctum (-{loss}% Inf)', { loss: prev?.lossInfluence ?? 3 }),
      {
        tone: 'danger',
        setFeedback,
        onRun: () => runSacrificeSiegeSite(entity, site.siteKey, nowMin, setFeedback, repaint),
      },
    ));
  }
  if (site.kind === 'sanctuary' && !site.unlocked && !owned) {
    card.append(uiEl('div', 'apo-card-desc', t('apotheosis.cult.hatchBreakInWarn', 'Warning: Breaking in without Seal Key or Pact/Alliance triggers Holy War (-35 Rel)!')));
    const needProximityReason = sceneCtx && !isNearHatch
      ? t('apotheosis.cult.err.needNearHatch', 'Stand beside the subterranean hatch in {city} to unlock or infiltrate it (console: apo cult tp daedra).', {
          city: site.locationName || regName,
        })
      : null;

    acts.append(
      makeActionBtn(t('apotheosis.cult.unlockBtnLockpickWar', 'Pick Lock (Fail -> Alarm; No Pact -> War)'), {
        blockedReason: needProximityReason,
        setFeedback,
        onRun: () => {
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'lockpick', { nowMinutes: nowMin });
          if (r.alarm && isNearHatch) sceneCtx?.spawnCultHatchAlarm?.(site.siteKey);
          setFeedback(r.ok ? r.message : r.reason, !r.ok);
          repaint();
        },
      }),
      makeActionBtn(t('apotheosis.cult.unlockBtnBashStr', 'Bash Open (STR Check · 1h CD · Alarm & War!)'), {
        tone: 'danger',
        blockedReason: needProximityReason,
        setFeedback,
        onRun: () => {
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'bash', { nowMinutes: nowMin });
          if (r.alarm && isNearHatch) sceneCtx?.spawnCultHatchAlarm?.(site.siteKey);
          setFeedback(r.message ?? r.reason, !r.ok);
          repaint();
        },
      }),
      makeActionBtn(t('apotheosis.cult.unlockBtnMagic', 'Arcane Unlock (Open / Magic / Edict)'), {
        blockedReason: needProximityReason,
        setFeedback,
        onRun: () => {
          const spell = exteriorOpenSpellFor(entity);
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'magic', {
            hasOpenSpell: !!spell,
            onConsumeOpenSpell: () => consumeDoorSpell(entity, 'open'),
            nowMinutes: nowMin,
          });
          setFeedback(r.ok ? r.message : r.reason, !r.ok);
          repaint();
        },
      }),
      makeActionBtn(t('apotheosis.cult.unlockBtnKey', 'Unlock with Seal Key / Pact (Safe)'), {
        blockedReason: needProximityReason,
        setFeedback,
        onRun: () => {
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'key', { nowMinutes: nowMin });
          setFeedback(r.ok ? r.message : r.reason, !r.ok);
          repaint();
        },
      }),
      makeActionBtn(t('apotheosis.cult.btnStealKey', 'Pickpocket Gatekeeper Key'), {
        blockedReason: needProximityReason,
        setFeedback,
        onRun: () => {
          const r = obtainSanctuaryKeyFromGatekeeper(entity, site.siteKey, 'pickpocket', { nowMinutes: nowMin });
          if (r.alarm && isNearHatch) sceneCtx?.spawnCultHatchAlarm?.(site.siteKey);
          setFeedback(r.ok ? r.message : r.reason, !r.ok);
          repaint();
        },
      }),
    );
  }

  if (site.kind === 'sanctuary' && (site.unlocked || owned) && sceneCtx?.enterCultSanctuary) {
    if (owned) {
      const tpCost = isNearHatch ? 0 : CULT_TELEPORT_SANCTUARY_FAITH_COST;
      const tpBlocked = faithCur < tpCost
        ? t('apotheosis.cult.err.needFaith', 'Not enough Faith (need {need}, have {have}).', { need: tpCost, have: faithCur })
        : null;
      const tpLabel = tpCost > 0
        ? t('apotheosis.cult.btnTeleportEnterCost', 'Teleport & Enter ({cost} Faith)', { cost: tpCost })
        : t('apotheosis.cult.btnEnterFreeHatch', 'Enter Sanctuary (At Hatch · Free)');
      acts.append(makeActionBtn(tpLabel, {
        tone: 'primary',
        blockedReason: tpBlocked,
        setFeedback,
        onRun: () => {
          const res = teleportToCultSanctuary(entity, site.siteKey, { isNearHatch });
          if (!res.ok) {
            setFeedback(res.reason, true);
            repaint();
            return;
          }
          if (res.faithSpent > 0) {
            setFeedback(t('apotheosis.cult.teleportedHud', 'Stepped through Faith into {site} (-{cost} Faith).', {
              site: site.name,
              cost: res.faithSpent,
            }), false);
          }
          sceneCtx.enterCultSanctuary(site);
          if (closePause) closePause();
        },
      }));
    } else {
      const enterBlocked = !isNearHatch
        ? t('apotheosis.cult.err.teleportOwnedOnly', 'Remote teleportation only works for your own Cult Sanctuaries. Stand near the hatch on the street to enter.')
        : null;
      acts.append(makeActionBtn(
        isNearHatch
          ? t('apotheosis.cult.btnEnterFreeHatch', 'Enter Sanctuary (At Hatch · Free)')
          : t('apotheosis.cult.btnEnterNeedHatch', 'Enter Sanctuary (Stand at Street Hatch)'),
        {
          tone: 'primary',
          blockedReason: enterBlocked,
          setFeedback,
          onRun: () => {
            sceneCtx.enterCultSanctuary(site);
          if (closePause) closePause();
          },
        },
      ));
    }
  }

  if (!owned) {
    let forceBlocked = null;
    if (!site.guardiansCleared) {
      forceBlocked = site.consecrationPending
        ? t('apotheosis.cult.err.finishAssaultGuardians', 'Holy War assault in progress — enter inside and slay the remaining Cult Guardians to claim the sanctum!')
        : t('apotheosis.cult.err.clearGuardiansFirst', 'Enter inside and activate the Altar to declare Holy War and defeat the defending Cult Guardians.');
    } else if (faithCur < CULT_CONSECRATE_FORCE_FAITH_COST && !site.consecrationPaid) {
      forceBlocked = t('apotheosis.cult.err.needFaith', 'Not enough Faith (need {need}, have {have}).', {
        need: CULT_CONSECRATE_FORCE_FAITH_COST,
        have: faithCur,
      });
    }

    let peaceBlocked = null;
    if (ownerEntry?.status !== 'allied' || Number(ownerEntry?.relation ?? 0) !== 100) {
      peaceBlocked = t('apotheosis.cult.err.needMaxAlly', 'Peaceful dedication requires Allied status at exactly 100 relation with {god}.', {
        god: ownerGod?.name ?? site.ownerId,
      });
    } else if (faithCur < CULT_CONSECRATE_PEACEFUL_FAITH_COST) {
      peaceBlocked = t('apotheosis.cult.err.needFaith', 'Not enough Faith (need {need}, have {have}).', {
        need: CULT_CONSECRATE_PEACEFUL_FAITH_COST,
        have: faithCur,
      });
    }

    const cardForceCost = site.consecrationPaid ? 0 : CULT_CONSECRATE_FORCE_FAITH_COST;
    acts.append(
      makeActionBtn(t('apotheosis.cult.btnForceConsecrate', 'Consecrate by Force ({cost} Faith)', { cost: cardForceCost }), {
        tone: 'danger',
        blockedReason: forceBlocked,
        setFeedback,
        onRun: () => {
          const r = initiateForceConsecrationAssault(entity, site.siteKey, { nowMinutes: nowMin });
          setFeedback(r.ok ? t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!') : ('reason' in r ? r.reason : ''), !r.ok);
          repaint();
        },
      }),
      makeActionBtn(t('apotheosis.cult.btnPeacefulDedicate', 'Peaceful Dedication ({cost} Faith • Allied 100)', { cost: CULT_CONSECRATE_PEACEFUL_FAITH_COST }), {
        tone: 'primary',
        blockedReason: peaceBlocked,
        setFeedback,
        onRun: () => {
          const r = dedicateSitePeacefully(entity, site.siteKey, { nowMinutes: nowMin });
          setFeedback(r.ok ? t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!') : r.reason, !r.ok);
          repaint();
        },
      }),
    );
  } else {
    const curTier = Math.max(1, Math.min(3, site.tier || 1));
    if (curTier < 3) {
      const nextSpec = CULT_UPGRADE_TIERS[curTier + 1];
      const nextCost = nextSpec.upgradeCost;
      const nextGoldCost = nextSpec.upgradeGoldCost ?? 0;
      const upgBlocked = faithCur < nextCost
        ? t('apotheosis.cult.err.needFaith', 'Not enough Faith (need {need}, have {have}).', { need: nextCost, have: faithCur })
        : goldCur < nextGoldCost
          ? t('apotheosis.roadShrine.err.notEnoughGold', 'Not enough gold ({have}g / {need}g).', { have: fmtNum(goldCur), need: fmtNum(nextGoldCost) })
          : null;
      acts.append(makeActionBtn(
        t('apotheosis.cult.btnUpgradeCostGold', 'Upgrade to Tier {tier} ({faith} Faith · {gold}g)', {
          tier: curTier + 1,
          faith: nextCost,
          gold: fmtNum(nextGoldCost),
        }),
        {
          tone: 'primary',
          blockedReason: upgBlocked,
          setFeedback,
          onRun: () => {
            const r = upgradeCultSite(entity, site.siteKey, { nowMinutes: nowMin });
            setFeedback(r.ok ? t('apotheosis.cult.upgradedHud', 'Sanctum elevated to Tier {tier}.', { tier: r.tier }) : r.reason, !r.ok);
            repaint();
          },
        },
      ));
    }

    const cd = getCultBranchCooldownInfo(site, nowMin);
    const branchLabel = !site.branch
      ? t('apotheosis.cult.btnChooseBranch', 'Choose Specialization (Free)')
      : (cd.onCooldown
        ? t('apotheosis.cult.btnSwitchBranchCd', 'Switch Specialization ({days}d CD)', { days: cd.remainingDays })
        : t('apotheosis.cult.btnSwitchBranch', 'Switch Specialization ({cost} Faith)', { cost: CULT_BRANCH_SWITCH_COST }));
    acts.append(makeActionBtn(branchLabel, {
      tone: !site.branch ? 'primary' : 'default',
      blockedReason: site.branch && cd.onCooldown
        ? t('apotheosis.cult.err.branchCooldown', 'Specialization switch is on cooldown ({days}d remaining).', { days: cd.remainingDays })
        : null,
      setFeedback,
      onRun: () => {
        const defPick = site.branch ? Object.keys(CULT_BRANCHES).find((b) => b !== site.branch) : 'missionary';
        branchModalState = {
          mode: 'branch',
          siteKey: site.siteKey,
          mapId: site.mapId,
          regionIndex: site.regionIndex,
          locationName: site.locationName,
          currentBranch: site.branch,
          selectedBranch: defPick,
        };
        repaint();
      },
    }));
  }

  if (acts.childNodes.length) card.append(acts);
  container.append(card);
}

function renderSanctuariesView(detail, modalRoot, entity, pantheon, nowMin, repaint, setFeedback, closePause = null) {
  const cityInfo = getAurbisRuntime().getSceneContext?.()?.getCultCity?.() ?? null;
  const reg = resolveLiveRegionIndex(entity);
  const cityMapId = cityInfo?.mapId || (reg + 1000);
  const cityReg = Number.isInteger(cityInfo?.regionIndex) ? cityInfo.regionIndex : reg;
  const cityName = cityInfo?.locationName || getLocalizedRegionName(cityReg, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const faithCur = Math.trunc(Number(entity?.apotheosis?.faith) || 0);
  const goldCur = Math.max(0, Math.trunc(Number(entity?.goldPieces) || 0));
  const fmtNum = (n) => Math.trunc(Number(n) || 0).toLocaleString('en-US');

  ensureCityCultSites(entity, {
    mapId: cityMapId,
    regionIndex: cityReg,
    locationName: cityName,
    temples: [],
  });

  const ownedSites = getAllCultSites(entity, { ownedOnly: true });
  const allSites = getAllCultSites(entity);
  const passiveFaith = getCultPassiveFaithPerDay(entity);

  const hero = uiEl('div', 'apo-hero');
  const left = uiEl('div');
  left.append(
    uiEl('div', 'apo-hero-title', t('apotheosis.cult.heroTitle', 'Cult Sanctums & Underground Shrines')),
    uiEl('div', 'apo-meta-row', t('apotheosis.cult.heroSub', 'Infiltrate secret Daedric hatches, consecrate Aedra Temples, or found your own Cult Undercroft across explored settlements.')),
  );
  hero.append(left, uiEl('span', 'apo-badge ascended', t('apotheosis.cult.statOwned', 'Owned Sanctums: {n}', { n: ownedSites.length })));
  detail.append(hero);

  const activeSieges = getActiveCultSieges(entity);
  if (activeSieges.length > 0) {
    const siegeBox = uiEl('div', 'apo-box');
    siegeBox.append(uiEl('h4', null, t('apotheosis.siege.alertBoxTitle', 'Active Sanctuary Sieges ({n})', { n: activeSieges.length })));
    const sceneCtx = getAurbisRuntime().getSceneContext?.() ?? null;
    const curCity = sceneCtx?.getCultCity?.() ?? null;
    for (const s of activeSieges) {
      const hrs = Math.max(1, Math.ceil((Number(s.siege?.expiresAtMinutes ?? nowMin) - nowMin) / 60));
      const row = uiEl('div', 'apo-row-inline');
      row.append(
        uiEl('span', 'apo-pill bad', `${s.name} · ${s.siege?.attackerGodName ?? s.siege?.attackerGodId} (${hrs}h)`),
      );
      const inSame = curCity && (Number(curCity.mapId) >>> 0) === (Number(s.mapId) >>> 0);
      const cost = inSame ? 0 : CULT_TELEPORT_SANCTUARY_FAITH_COST;
      const blocked = !sceneCtx?.defendCultSiege
        ? t('apotheosis.siege.errNoRuntime', 'Siege battle runtime unavailable.')
        : faithCur < cost
          ? t('apotheosis.cult.err.needFaith', 'Not enough Faith (need {need}, have {have}).', { need: cost, have: faithCur })
          : null;
      row.append(makeActionBtn(
        cost > 0
          ? t('apotheosis.siege.btnDefendCost', 'Teleport to Defend Siege ({cost} Faith)', { cost })
          : t('apotheosis.siege.btnDefendFree', 'Defend Siege Here (Free)'),
        {
          tone: 'primary',
          blockedReason: blocked,
          setFeedback,
          onRun: () => {
            Promise.resolve(sceneCtx.defendCultSiege(s.siteKey)).then((r) => {
              setFeedback(r?.ok ? r.message : r?.reason, r && !r.ok);
              if (r?.ok && closePause) closePause();
              else repaint();
            });
          },
        },
      ));
      const pRow = getCultSiegePreview(entity, s);
      row.append(makeActionBtn(
        t('apotheosis.siege.btnSacrifice', 'Sacrifice Sanctum (-{loss}% Inf)', { loss: pRow?.lossInfluence ?? 3 }),
        {
          tone: 'danger',
          setFeedback,
          onRun: () => runSacrificeSiegeSite(entity, s.siteKey, nowMin, setFeedback, repaint),
        },
      ));
      siegeBox.append(row);
    }
    detail.append(siegeBox);
  }

  const ctrlBox = uiEl('div', 'apo-box');
  ctrlBox.append(uiEl('h4', null, t('apotheosis.cult.ctrlTitle', 'Settlement Command — {city}', { city: cityName })));
  const pillRow = uiEl('div', 'apo-row-inline');
  pillRow.append(
    uiEl('span', 'apo-pill ok', t('apotheosis.cult.statFaithDay', 'Passive Faith: +{n}/day', { n: passiveFaith })),
    uiEl('span', 'apo-pill info', t('apotheosis.cult.statMaxFaithBonus', 'Max Faith Bonus: +{n}', { n: entity?.apotheosis?.cultFaithBonus ?? 0 })),
    uiEl('span', 'apo-pill warn', t('apotheosis.cult.statGold', 'Purse: {gold}g', { gold: fmtNum(goldCur) })),
    uiEl('span', 'apo-pill', t('apotheosis.cult.statExplored', 'Explored Sites: {n}', { n: allSites.length })),
  );
  ctrlBox.append(pillRow);

  const citySites = getCityCultSites(entity, cityMapId);
  const hasCitySanctum = citySites.some((s) => s.ownerId === 'player');
  const acts = uiEl('div', 'apo-acts');

  if (!hasCitySanctum) {
    const foundBlocked = faithCur < CULT_FOUND_FAITH_COST
      ? t('apotheosis.cult.err.needFaith', 'Not enough Faith (need {need}, have {have}).', { need: CULT_FOUND_FAITH_COST, have: faithCur })
      : goldCur < CULT_FOUND_GOLD_COST
        ? t('apotheosis.roadShrine.err.notEnoughGold', 'Not enough gold ({have}g / {need}g).', { have: fmtNum(goldCur), need: fmtNum(CULT_FOUND_GOLD_COST) })
        : null;
    acts.append(makeActionBtn(
      t('apotheosis.cult.btnFoundSanctuaryGold', 'Found Underground Sanctuary ({faith} Faith · {gold}g)', {
        faith: CULT_FOUND_FAITH_COST,
        gold: fmtNum(CULT_FOUND_GOLD_COST),
      }),
      {
        tone: 'primary',
        blockedReason: foundBlocked,
        setFeedback,
        onRun: () => {
          branchModalState = {
            mode: 'found',
            mapId: cityMapId,
            regionIndex: cityReg,
            locationName: cityName,
            currentBranch: null,
            selectedBranch: 'missionary',
          };
          repaint();
        },
      },
    ));
  } else {
    acts.append(uiEl('span', 'apo-pill ok', t('apotheosis.cult.cityAlreadyHas', 'Your Cult already holds a consecrated sanctum in this city.')));
  }

  for (const [fid, fLabel] of [
    ['city', t('apotheosis.cult.filterCity', 'Current City')],
    ['owned', t('apotheosis.cult.filterOwned', 'Owned ({n})', { n: ownedSites.length })],
    ['all', t('apotheosis.cult.filterAllCount', 'Explored Tamriel ({n})', { n: allSites.length })],
  ]) {
    const b = uiEl('button', `apo-btn${cultScopeFilter === fid ? ' primary' : ''}`, fLabel);
    b.onclick = () => {
      cultScopeFilter = fid;
      repaint({ resetDetailScroll: true });
    };
    acts.append(b);
  }
  ctrlBox.append(acts);
  detail.append(ctrlBox);
  renderAltarStatueBox(detail, entity, repaint, setFeedback);

  const list = cultScopeFilter === 'owned'
    ? ownedSites
    : cultScopeFilter === 'all'
      ? allSites
      : citySites;
  if (!list.length) {
    detail.append(uiEl('div', 'apo-box apo-card-desc', t('apotheosis.cult.emptySites', 'No shrines discovered in this filter yet.')));
  } else {
    const grid = uiEl('div', 'apo-grid');
    for (const site of list) {
      renderSiteCard(grid, entity, pantheon, site, nowMin, repaint, setFeedback, closePause);
    }
    detail.append(grid);
  }

  renderSpecializationModal(modalRoot, entity, nowMin, repaint, setFeedback);
}

function renderEdictsView(detail, entity, nowMin, repaint, setFeedback, onOpenSection = null) {
  const curReg = resolveLiveRegionIndex(entity);
  if (cultEdictRegion == null || cultEdictRegion < 0 || cultEdictRegion >= TAMRIEL_REGION_COUNT) {
    cultEdictRegion = curReg;
  }
  const faithCur = Math.trunc(Number(entity?.apotheosis?.faith) || 0);
  const regLabel = (idx) => {
    const name = getLocalizedRegionName(idx, (i) => REGION_NAMES[i] ?? `Region ${i}`);
    const provTag = isProvinceRegion(idx) ? ` [${t('apotheosis.lens.province', 'Tamriel Province')}]` : '';
    return `#${idx} ${name}${provTag}`;
  };

  const hero = uiEl('div', 'apo-hero');
  const left = uiEl('div');
  left.append(
    uiEl('div', 'apo-hero-title', t('apotheosis.edict.heroTitle', 'Regional Edicts')),
    uiEl('div', 'apo-meta-row', t('apotheosis.edict.heroSub', 'Proclaim 30-day divine decrees across provinces and Iliac Bay kingdoms where your Cult holds >=25% Influence or >=1 Sanctum.')),
  );
  hero.append(left, uiEl('span', 'apo-badge', t('apotheosis.edict.costBadge', 'Decree Cost: {cost} Faith', { cost: REGIONAL_EDICT_COST })));
  detail.append(hero);

  const curBox = uiEl('div', 'apo-box');
  const curInf = Number(getRegionInfluence(entity, curReg)?.playerShare ?? 0);
  const curOwned = getAllCultSites(entity, { regionIndex: curReg, ownedOnly: true }).length;
  curBox.append(uiEl('h4', null, t('apotheosis.edict.currentBoxTitle', 'Your Current Location')) );
  const curRow = uiEl('div', 'apo-row-inline');
  curRow.append(
    uiEl('span', 'apo-pill info', regLabel(curReg)),
    uiEl('span', 'apo-pill', t('apotheosis.edict.curLocationStats', 'Influence: {inf}% · Owned Sanctums: {sites}', {
      inf: curInf.toFixed(1),
      sites: curOwned,
    })),
  );
  if (cultEdictRegion !== curReg) {
    const snapBtn = uiEl('button', 'apo-btn', t('apotheosis.edict.btnFocusCurrent', 'Select Current Region'));
    snapBtn.onclick = () => {
      cultEdictRegion = curReg;
      repaint();
    };
    curRow.append(snapBtn);
  }
  curBox.append(curRow);
  detail.append(curBox);

  const selBox = uiEl('div', 'apo-box');
  selBox.append(uiEl('h4', null, t('apotheosis.edict.selectRegion', 'Target Region')));
  const filterRow = uiEl('div', 'apo-aurbis-form');
  filterRow.style.marginBottom = '8px';
  const searchIn = uiEl('input', 'apo-input');
  searchIn.type = 'text';
  searchIn.placeholder = t('apotheosis.edict.searchPh', 'Filter by region name or #ID...');
  searchIn.value = cultEdictSearch;
  filterRow.append(searchIn);

  const sel = uiEl('select', 'apo-select');
  const rebuildOptions = () => {
    sel.replaceChildren();
    const q = cultEdictSearch.trim().toLowerCase();
    for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
      const rName = regLabel(r);
      if (q && r !== cultEdictRegion && !rName.toLowerCase().includes(q)) continue;
      const inf = Number(getRegionInfluence(entity, r)?.playerShare ?? 0);
      const act = getActiveRegionalEdict(entity, r);
      const actTag = act && REGIONAL_EDICTS[act.edictId]
        ? ` • ${t(REGIONAL_EDICTS[act.edictId].nameKey, REGIONAL_EDICTS[act.edictId].fallbackName)} (${act.daysRemaining}d)`
        : '';
      const opt = document.createElement('option');
      opt.value = String(r);
      opt.textContent = `${rName} — ${inf.toFixed(1)}%${actTag}`;
      if (r === cultEdictRegion) opt.selected = true;
      sel.append(opt);
    }
  };
  rebuildOptions();
  searchIn.oninput = () => {
    cultEdictSearch = searchIn.value;
    rebuildOptions();
  };
  sel.onchange = () => {
    cultEdictRegion = Math.max(0, Math.min(TAMRIEL_REGION_COUNT - 1, parseInt(sel.value, 10) || 0));
    repaint();
  };

  const elig = canIssueRegionalEdict(entity, cultEdictRegion);
  const active = getActiveRegionalEdict(entity, cultEdictRegion);
  const statRow = uiEl('div', 'apo-row-inline');
  statRow.style.marginTop = '8px';
  statRow.append(uiEl('span', `apo-pill ${elig.ok ? 'ok' : 'bad'}`, elig.ok
    ? t('apotheosis.edict.eligible', 'Eligible ({inf}% Inf • {sites} Sanctums)', { inf: elig.influence.toFixed(1), sites: elig.ownedCount })
    : t('apotheosis.edict.notEligible', 'Needs >=25% Influence or 1 Sanctum ({inf}%)', { inf: elig.influence.toFixed(1) })));
  if (!elig.ok && typeof onOpenSection === 'function') {
    const goCult = uiEl('button', 'apo-btn primary', t('apotheosis.onboarding.btnGoSanctums', 'Go to Temples & Sanctuaries'));
    goCult.onclick = () => onOpenSection('cult');
    statRow.append(goCult);
  }
  if (active && REGIONAL_EDICTS[active.edictId]) {
    const sp = REGIONAL_EDICTS[active.edictId];
    statRow.append(uiEl('span', 'apo-pill ok', t('apotheosis.edict.activeBadge', 'Active: {name} ({days}d left)', {
      name: t(sp.nameKey, sp.fallbackName),
      days: active.daysRemaining,
    })));
    const clr = uiEl('button', 'apo-btn danger', t('apotheosis.edict.btnRepeal', 'Repeal Edict'));
    clr.onclick = () => {
      proclaimRegionalEdict(entity, cultEdictRegion, 'clear', { nowMinutes: nowMin, force: true });
      setFeedback(t('apotheosis.edict.repealedHud', 'Regional Edict repealed.'), false);
      repaint();
    };
    statRow.append(clr);
  }
  selBox.append(filterRow, sel, statRow);
  detail.append(selBox);

  const grid = uiEl('div', 'apo-grid');
  for (const eid of REGIONAL_EDICT_IDS) {
    const spec = REGIONAL_EDICTS[eid];
    const isAct = active?.edictId === eid;
    const card = uiEl('div', `apo-card${isAct ? ' active' : ''}`);
    const row = uiEl('div', 'apo-card-head');
    row.append(uiEl('div', 'apo-card-title', t(spec.nameKey, spec.fallbackName)));
    if (isAct) row.append(uiEl('span', 'apo-pill ok', t('apotheosis.edict.currentlyActive', 'Active Here')));
    card.append(row);

    card.append(uiEl('div', 'apo-card-desc', t('apotheosis.edict.whatHappensLine', 'What will happen: {desc}', {
      desc: t(spec.whatKey, spec.fallbackWhat),
    })));

    let blocked = null;
    if (!elig.ok) blocked = elig.reason;
    else if (faithCur < REGIONAL_EDICT_COST) {
      blocked = t('apotheosis.cult.err.needFaith', 'Not enough Faith (need {need}, have {have}).', {
        need: REGIONAL_EDICT_COST,
        have: faithCur,
      });
    }
    const acts = uiEl('div', 'apo-acts');
    acts.append(makeActionBtn(t('apotheosis.edict.btnProclaim', 'Proclaim Edict ({cost} Faith • 30d)', { cost: REGIONAL_EDICT_COST }), {
      tone: 'primary',
      blockedReason: blocked,
      setFeedback,
      onRun: () => {
        const r = proclaimRegionalEdict(entity, cultEdictRegion, eid, { nowMinutes: nowMin });
        let msg = r.ok ? t('apotheosis.edict.proclaimedHud', 'Edict proclaimed across the region for 30 days!') : r.reason;
        if (r.ok && r.petitionCompleted?.completed) {
          msg += ' ' + t('apotheosis.petition.completedHud', 'Cult Petition Completed: +{faith} Faith, +{gold}g, +{inf}% Influence!', {
            faith: r.petitionCompleted.faithGained,
            gold: r.petitionCompleted.goldGained,
            inf: r.petitionCompleted.influenceGained,
          });
        }
        setFeedback(msg, !r.ok);
        repaint();
      },
    }));
    card.append(acts);
    grid.append(card);
  }
  detail.append(grid);
}

/** Renders Milestone 3.2 Cult & Sanctuaries OR 71-Region Edicts view inside Apotheosis Pause UI. */
export function renderCultPage(detail, entity, repaint, { mode = 'sanctuaries', rootModalParent = null, setFeedback, closePause = null, onOpenSection = null }) {
  let nowMin = 0;
  try {
    nowMin = Number(getAurbisRuntime().getWorldMinutes?.() ?? 0) || 0;
  } catch {
    nowMin = 0;
  }
  const st = entity?.apotheosis ?? {};
  if (!st.ascended && st.stage !== 'ascended') {
    const hero = uiEl('div', 'apo-hero');
    hero.append(
      uiEl('div', 'apo-hero-title', mode === 'edicts'
        ? t('apotheosis.edict.heroTitle', 'Regional Edicts')
        : t('apotheosis.cult.heroTitle', 'Cult Sanctums & Underground Shrines')),
      uiEl('span', 'apo-badge', t('apotheosis.stage.mortal', 'Mortal Aspirant')),
    );
    detail.append(hero);
    detail.append(uiEl('div', 'apo-box', t('apotheosis.cult.locked', 'Ascend to Godhood and claim a Divine Portfolio to command Cult Sanctums and issue Regional Edicts.')));
    return;
  }

  const pantheon = ensurePantheonState(entity, { nowMinutes: nowMin });
  ensureCultState(entity);

  if (mode === 'edicts') {
    renderEdictsView(detail, entity, nowMin, repaint, setFeedback, onOpenSection);
  } else {
    if (getAllCultSites(entity, { ownedOnly: true }).length === 0) {
      const onbBox = uiEl('div', 'apo-banner');
      onbBox.append(
        uiEl('div', 'apo-card-title', t('apotheosis.onboarding.cultHeaderTitle', 'How to Claim Your First Sanctum')),
        uiEl('div', 'apo-card-desc', t('apotheosis.onboarding.cultHeaderDesc', 'Enter any city Temple and activate its altar to consecrate it, OR click "Found Underground Undercroft" below (350 Faith + 50,000g) to raise your Faith cap and unlock Regional Edicts. Tip: Wild highway Roadside Shrines pay 3× Desecration rewards!')),
      );
      detail.append(onbBox);
    }
    const rb = getRoadBlessingInfo(entity, nowMin);
    if (rb) {
      const box = uiEl('div', 'apo-box');
      box.append(
        uiEl('div', 'apo-card-title', t('apotheosis.roadShrine.uiTitle', 'Active Road Blessing: {god}', { god: rb.godName })),
        uiEl('div', 'apo-card-desc', t('apotheosis.roadShrine.hudTip', 'Blessing of {god}: +{fat}/min Fatigue, +{deg}° Weather Resist, +10% Elemental Resist ({left} left)', {
          god: rb.godName,
          fat: rb.fatiguePerMin,
          deg: rb.warmthDegrees,
          left: rb.minutesLeft >= 60 ? `${Math.ceil(rb.minutesLeft / 60)}h` : `${rb.minutesLeft}m`,
        })),
      );
      detail.append(box);
    }

    const petReg = resolveLiveRegionIndex(entity);
    const pet = ensureCultPetition(entity, { regionIndex: petReg, nowMinutes: nowMin })
      ?? getActiveCultPetition(entity, nowMin);
    if (pet) {
      const petBox = uiEl('div', 'apo-box');
      const regName = getLocalizedRegionName(pet.targetRegion, (i) => REGION_NAMES[i] ?? `Region ${i}`);
      const desc = pet.type === 'inquisition'
        ? t('apotheosis.petition.descInquisition', 'Defeat {god}\'s Inquisitors threatening your sanctum.', { god: pet.godName })
        : pet.type === 'desecrate_shrine'
          ? t('apotheosis.petition.descDesecrate', 'Desecrate a roadside shrine of {god} in this region (3x reward on wild roads!).', { god: pet.godName })
          : t('apotheosis.petition.descEdict', 'Proclaim any Regional Edict in this region to guide the faithful.');
      petBox.append(
        uiEl('div', 'apo-card-title', `${t('apotheosis.petition.modalTitle', 'Pilgrim Petition')} · ${regName} (#${pet.targetRegion})`),
        uiEl('div', 'apo-card-desc', desc),
        uiEl('div', 'apo-meta-row', t('apotheosis.petition.rewardLine', 'Reward: +{faith} Faith · +{gold}g · +{inf}% Influence', {
          faith: pet.rewardFaith,
          gold: pet.rewardGold,
          inf: pet.rewardInfluence,
        })),
      );
      const actRow = uiEl('div', 'apo-row-inline');
      if (pet.type === 'edict') {
        const claimBtn = uiEl('button', 'apo-btn primary', t('apotheosis.petition.btnVerifyEdict', 'Verify Edict'));
        claimBtn.onclick = () => {
          const synced = syncEdictPetitionIfActive(entity, nowMin);
          if (synced?.completed) {
            setFeedback(t('apotheosis.petition.completedHud', 'Cult Petition Completed: +{faith} Faith, +{gold}g, +{inf}% Influence!', {
              faith: synced.faithGained,
              gold: synced.goldGained,
              inf: synced.influenceGained,
            }), false);
          } else {
            setFeedback(t('apotheosis.petition.edictNotYet', 'No active Regional Edict found in {region} yet.', { region: regName }), true);
          }
          repaint();
        };
        actRow.append(claimBtn);
      }
      const disBtn = uiEl('button', 'apo-btn', t('apotheosis.petition.btnDismiss', 'Dismiss Petition'));
      disBtn.onclick = () => {
        dismissCultPetition(entity);
        setFeedback(t('apotheosis.petition.dismissedHud', 'Pilgrim Petition dismissed.'), false);
        repaint();
      };
      actRow.append(disBtn);
      petBox.append(actRow);
      detail.append(petBox);
    }

    renderSanctuariesView(detail, rootModalParent ?? detail, entity, pantheon, nowMin, repaint, setFeedback, closePause);
  }
}
