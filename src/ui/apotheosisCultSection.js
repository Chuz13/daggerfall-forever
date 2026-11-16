// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 3 (MILESTONE 3.2): CULT, TEMPLES & 71-REGION EDICTS UI PANEL
// ═══════════════════════════════════════════════════════════════════════════════

import { REGION_NAMES } from '../formats/mapsTables.js';
import { t, getLocalizedRegionName } from '../systems/textManager.js';
import {
  TAMRIEL_REGION_COUNT,
  PANTHEON_DEITIES,
  getPantheonDeity,
  ensurePantheonState,
  getRegionInfluence,
} from '../systems/apotheosis/apotheosisStage3.js';
import { getAurbisRuntime } from '../systems/apotheosis/apotheosisLive.js';
import {
  CULT_FOUND_FAITH_COST,
  CULT_CONSECRATE_FORCE_FAITH_COST,
  CULT_CONSECRATE_PEACEFUL_FAITH_COST,
  CULT_UPGRADE_TIERS,
  CULT_BRANCHES,
  REGIONAL_EDICTS,
  REGIONAL_EDICT_IDS,
  REGIONAL_EDICT_COST,
  ensureCultState,
  ensureCityCultSites,
  getCityCultSites,
  getAllCultSites,
  attemptUnlockSanctuaryHatch,
  obtainSanctuaryKeyFromGatekeeper,
  consecrateSiteByForce,
  dedicateSitePeacefully,
  foundPlayerUndergroundSanctuary,
  upgradeCultSite,
  selectCultSiteBranch,
  canIssueRegionalEdict,
  getActiveRegionalEdict,
  proclaimRegionalEdict,
  getCultPassiveFaithPerDay,
  hasSanctuaryKey,
} from '../systems/apotheosis/apotheosisCult.js';
import { exteriorOpenSpellFor, consumeDoorSpell } from '../scenes/shared.js';

let cultSubTab = 'sanctuaries';
let cultScopeFilter = 'city';
let cultEdictRegion = null;

function uiEl(tag, cls = '', text = null) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function resetCultSectionUiState() {
  cultSubTab = 'sanctuaries';
  cultScopeFilter = 'city';
  cultEdictRegion = null;
}

export function getCultScrollKey() {
  return `cult:${cultSubTab}`;
}

function renderSiteCard(container, entity, pantheon, site, nowMin, repaint, setFeedback) {
  const card = uiEl('div', 'apo-card');
  const regName = getLocalizedRegionName(site.regionIndex, (i) => REGION_NAMES[i] ?? `Region ${i}`);
  const owned = site.ownerId === 'player';
  const ownerGod = owned ? null : getPantheonDeity(site.ownerId);
  const ownerEntry = ownerGod ? pantheon?.deities?.[ownerGod.id] : null;
  const kindLabel = site.kind === 'temple'
    ? t('apotheosis.cult.kindTemple', 'Aedra Temple')
    : t('apotheosis.cult.kindSanctuary', 'Underground Sanctuary');

  const hdr = uiEl('div', 'apo-row');
  hdr.append(uiEl('div', 'apo-hdr', site.name));
  hdr.append(uiEl('span', 'apo-pill', kindLabel));
  hdr.append(uiEl('span', 'apo-pill', regName));
  card.append(hdr);

  const metaRow = uiEl('div', 'apo-row');
  if (owned) {
    const tierSpec = CULT_UPGRADE_TIERS[site.tier || 1] ?? CULT_UPGRADE_TIERS[1];
    metaRow.append(uiEl('span', 'apo-pill ok', t('apotheosis.cult.ownedBadge', 'Your Cult • Tier {tier}', { tier: tierSpec.tier })));
    const bSpec = site.branch ? CULT_BRANCHES[site.branch] : null;
    metaRow.append(uiEl('span', 'apo-pill', bSpec
      ? t(bSpec.nameKey, bSpec.fallbackName)
      : t('apotheosis.cult.branchNoneShort', 'No Branch')));
  } else {
    metaRow.append(uiEl('span', 'apo-pill', t('apotheosis.cult.ownerPatron', 'Owner: {god} ({rel})', {
      god: ownerGod?.name ?? site.ownerId,
      rel: ownerEntry?.relation ?? 0,
    })));
    if (site.kind === 'sanctuary') {
      metaRow.append(uiEl('span', `apo-pill ${site.unlocked ? 'ok' : ''}`, site.unlocked
        ? t('apotheosis.cult.openBadge', 'Open')
        : t('apotheosis.cult.lockedBadge', 'Locked')));
      if (site.alarmTriggered) {
        metaRow.append(uiEl('span', 'apo-pill err', t('apotheosis.cult.alarmBadge', 'Alarm Triggered')));
      }
      if (hasSanctuaryKey(entity, site.siteKey)) {
        metaRow.append(uiEl('span', 'apo-pill ok', t('apotheosis.cult.hasKeyBadge', 'Has Seal Key')));
      }
    }
    metaRow.append(uiEl('span', `apo-pill ${site.guardiansCleared ? 'ok' : ''}`, site.guardiansCleared
      ? t('apotheosis.cult.guardiansClear', 'Guardians: Defeated')
      : t('apotheosis.cult.guardiansActive', 'Guardians: Active')));
  }
  card.append(metaRow);

  const btnRow = uiEl('div', 'apo-row');
  if (site.kind === 'sanctuary' && !site.unlocked && !owned) {
    const pickBtn = uiEl('button', 'apo-btn', t('apotheosis.cult.unlockBtnLockpick', 'Pick Lock'));
    pickBtn.onclick = () => {
      const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'lockpick', { nowMinutes: nowMin });
      setFeedback(r.ok ? r.message : r.reason, !r.ok);
      repaint();
    };
    const bashBtn = uiEl('button', 'apo-btn danger', t('apotheosis.cult.unlockBtnBash', 'Bash Open (Alarm!)'));
    bashBtn.onclick = () => {
      const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'bash', { nowMinutes: nowMin });
      setFeedback(r.message ?? r.reason, !r.ok);
      repaint();
    };
    const magBtn = uiEl('button', 'apo-btn', t('apotheosis.cult.unlockBtnMagic', 'Arcane Unlock (Open / Magic / Edict)'));
    magBtn.onclick = () => {
      const spell = exteriorOpenSpellFor(entity);
      const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'magic', {
        hasOpenSpell: !!spell,
        onConsumeOpenSpell: () => consumeDoorSpell(entity, 'open'),
        nowMinutes: nowMin,
      });
      setFeedback(r.ok ? r.message : r.reason, !r.ok);
      repaint();
    };
    const keyBtn = uiEl('button', 'apo-btn', t('apotheosis.cult.unlockBtnKey', 'Seal Key / Pact Unlock'));
    keyBtn.onclick = () => {
      const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'key', { nowMinutes: nowMin });
      setFeedback(r.ok ? r.message : r.reason, !r.ok);
      repaint();
    };
    const stealBtn = uiEl('button', 'apo-btn', t('apotheosis.cult.btnStealKey', 'Pickpocket Gatekeeper Key'));
    stealBtn.onclick = () => {
      const r = obtainSanctuaryKeyFromGatekeeper(entity, site.siteKey, 'pickpocket');
      setFeedback(r.ok ? r.message : r.reason, !r.ok);
      repaint();
    };
    btnRow.append(pickBtn, bashBtn, magBtn, keyBtn, stealBtn);
  }

  const sceneCtx = getAurbisRuntime().getSceneContext?.();
  if (site.kind === 'sanctuary' && (site.unlocked || owned) && sceneCtx?.enterCultSanctuary) {
    const enterBtn = uiEl('button', 'apo-btn primary', t('apotheosis.cult.btnEnter', 'Enter Sanctuary'));
    enterBtn.onclick = () => {
      sceneCtx.enterCultSanctuary(site);
    };
    btnRow.append(enterBtn);
  }

  if (!owned) {
    const forceBtn = uiEl('button', 'apo-btn danger', t('apotheosis.cult.btnForceConsecrate', 'Consecrate by Force ({cost} Faith)', { cost: CULT_CONSECRATE_FORCE_FAITH_COST }));
    forceBtn.onclick = () => {
      const r = consecrateSiteByForce(entity, site.siteKey, { nowMinutes: nowMin });
      setFeedback(r.ok ? t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!') : r.reason, !r.ok);
      repaint();
    };
    const peaceBtn = uiEl('button', 'apo-btn primary', t('apotheosis.cult.btnPeacefulDedicate', 'Peaceful Dedication ({cost} Faith • Allied 100)', { cost: CULT_CONSECRATE_PEACEFUL_FAITH_COST }));
    peaceBtn.onclick = () => {
      const r = dedicateSitePeacefully(entity, site.siteKey, { nowMinutes: nowMin });
      setFeedback(r.ok ? t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!') : r.reason, !r.ok);
      repaint();
    };
    btnRow.append(forceBtn, peaceBtn);
  } else {
    const curTier = Math.max(1, Math.min(3, site.tier || 1));
    if (curTier < 3) {
      const nextCost = CULT_UPGRADE_TIERS[curTier + 1].upgradeCost;
      const upgBtn = uiEl('button', 'apo-btn primary', t('apotheosis.cult.btnUpgradeCost', 'Upgrade to Tier {tier} ({cost} Faith)', {
        tier: curTier + 1,
        cost: nextCost,
      }));
      upgBtn.onclick = () => {
        const r = upgradeCultSite(entity, site.siteKey, { nowMinutes: nowMin });
        setFeedback(r.ok ? t('apotheosis.cult.upgradedHud', 'Sanctum elevated to Tier {tier}.', { tier: r.tier }) : r.reason, !r.ok);
        repaint();
      };
      btnRow.append(upgBtn);
    }
    for (const br of Object.values(CULT_BRANCHES)) {
      const bBtn = uiEl('button', `apo-btn${site.branch === br.id ? ' primary' : ''}`, t(br.nameKey, br.fallbackName));
      bBtn.onclick = () => {
        const r = selectCultSiteBranch(entity, site.siteKey, br.id);
        setFeedback(r.ok ? t('apotheosis.cult.branchSetHud', 'Selected specialization branch.') : r.reason, !r.ok);
        repaint();
      };
      btnRow.append(bBtn);
    }
  }

  if (btnRow.childNodes.length) card.append(btnRow);
  container.append(card);
}

function renderSanctuariesView(detail, entity, pantheon, nowMin, repaint, setFeedback) {
  const cityInfo = getAurbisRuntime().getSceneContext?.()?.getCultCity?.() ?? null;
  const reg = Number.isInteger(entity?.currentRegionIndex) ? entity.currentRegionIndex : 17;
  const cityMapId = cityInfo?.mapId || (reg + 1000);
  const cityReg = Number.isInteger(cityInfo?.regionIndex) ? cityInfo.regionIndex : reg;
  const cityName = cityInfo?.locationName || getLocalizedRegionName(cityReg, (i) => REGION_NAMES[i] ?? `Region ${i}`);

  ensureCityCultSites(entity, {
    mapId: cityMapId,
    regionIndex: cityReg,
    locationName: cityName,
    temples: [],
  });

  const ownedSites = getAllCultSites(entity, { ownedOnly: true });
  const passiveFaith = getCultPassiveFaithPerDay(entity);

  const sumCard = uiEl('div', 'apo-card');
  const sumRow = uiEl('div', 'apo-row');
  sumRow.append(uiEl('span', 'apo-pill ok', t('apotheosis.cult.statOwned', 'Owned Sanctums: {n}', { n: ownedSites.length })));
  sumRow.append(uiEl('span', 'apo-pill', t('apotheosis.cult.statFaithDay', 'Passive Faith: +{n}/day', { n: passiveFaith })));
  sumRow.append(uiEl('span', 'apo-pill', t('apotheosis.cult.statCity', 'Current Location: {city}', { city: cityName })));
  sumCard.append(sumRow);

  const citySites = getCityCultSites(entity, cityMapId);
  const hasCitySanctum = citySites.some((s) => s.ownerId === 'player');
  const actionRow = uiEl('div', 'apo-row');
  if (!hasCitySanctum) {
    const foundBtn = uiEl('button', 'apo-btn primary', t('apotheosis.cult.btnFoundSanctuary', 'Found Underground Sanctuary ({cost} Faith)', { cost: CULT_FOUND_FAITH_COST }));
    foundBtn.onclick = () => {
      const r = foundPlayerUndergroundSanctuary(entity, {
        mapId: cityMapId,
        regionIndex: cityReg,
        locationName: cityName,
        nowMinutes: nowMin,
      });
      setFeedback(r.ok ? t('apotheosis.cult.foundedHud', 'Secret Cult Undercroft founded beneath the city!') : r.reason, !r.ok);
      repaint();
    };
    actionRow.append(foundBtn);
  } else {
    actionRow.append(uiEl('span', 'apo-sub', t('apotheosis.cult.cityAlreadyHas', 'Your Cult already holds a consecrated sanctum in this city.')));
  }

  const cityTabBtn = uiEl('button', `apo-btn${cultScopeFilter === 'city' ? ' primary' : ''}`, t('apotheosis.cult.filterCity', 'Current City'));
  cityTabBtn.onclick = () => { cultScopeFilter = 'city'; repaint(); };
  const allTabBtn = uiEl('button', `apo-btn${cultScopeFilter === 'all' ? ' primary' : ''}`, t('apotheosis.cult.filterAll', 'All Tamriel Sites'));
  allTabBtn.onclick = () => { cultScopeFilter = 'all'; repaint(); };
  actionRow.append(cityTabBtn, allTabBtn);
  sumCard.append(actionRow);
  detail.append(sumCard);

  const list = cultScopeFilter === 'all' ? getAllCultSites(entity) : citySites;
  if (!list.length) {
    detail.append(uiEl('div', 'apo-card apo-sub', t('apotheosis.cult.emptySites', 'No shrines discovered in this filter yet.')));
    return;
  }
  for (const site of list) {
    renderSiteCard(detail, entity, pantheon, site, nowMin, repaint, setFeedback);
  }
}

function renderEdictsView(detail, entity, nowMin, repaint, setFeedback) {
  if (cultEdictRegion == null || cultEdictRegion < 0 || cultEdictRegion >= TAMRIEL_REGION_COUNT) {
    cultEdictRegion = Number.isInteger(entity?.currentRegionIndex) ? entity.currentRegionIndex : 17;
  }

  const topCard = uiEl('div', 'apo-card');
  const selRow = uiEl('div', 'apo-row');
  selRow.append(uiEl('span', 'apo-field-lbl', t('apotheosis.edict.selectRegion', 'Target Region (71):')));
  const sel = uiEl('select', 'apo-select');
  for (let r = 0; r < TAMRIEL_REGION_COUNT; r++) {
    const rName = getLocalizedRegionName(r, (i) => REGION_NAMES[i] ?? `Region ${i}`);
    const opt = document.createElement('option');
    opt.value = String(r);
    opt.textContent = t('apotheosis.edict.regionOption', '{region} ({inf}%)', {
      region: rName,
      inf: Number(getRegionInfluence(entity, r)?.playerShare ?? 0).toFixed(1),
    });
    if (r === cultEdictRegion) opt.selected = true;
    sel.append(opt);
  }
  sel.onchange = () => {
    cultEdictRegion = Math.max(0, Math.min(TAMRIEL_REGION_COUNT - 1, parseInt(sel.value, 10) || 0));
    repaint();
  };
  selRow.append(sel);
  topCard.append(selRow);

  const elig = canIssueRegionalEdict(entity, cultEdictRegion);
  const active = getActiveRegionalEdict(entity, cultEdictRegion);
  const statRow = uiEl('div', 'apo-row');
  statRow.append(uiEl('span', `apo-pill ${elig.ok ? 'ok' : 'err'}`, elig.ok
    ? t('apotheosis.edict.eligible', 'Eligible ({inf}% Inf • {sites} Sanctums)', { inf: elig.influence.toFixed(1), sites: elig.ownedCount })
    : t('apotheosis.edict.notEligible', 'Needs >=25% Influence or 1 Sanctum ({inf}%)', { inf: elig.influence.toFixed(1) })));
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
  topCard.append(statRow);
  detail.append(topCard);

  for (const eid of REGIONAL_EDICT_IDS) {
    const spec = REGIONAL_EDICTS[eid];
    const card = uiEl('div', 'apo-card');
    const row = uiEl('div', 'apo-row');
    row.append(uiEl('div', 'apo-hdr', t(spec.nameKey, spec.fallbackName)));
    if (active?.edictId === eid) {
      row.append(uiEl('span', 'apo-pill ok', t('apotheosis.edict.currentlyActive', 'Active Here')));
    }
    card.append(row);

    const whatLbl = uiEl('div', 'apo-sub');
    whatLbl.textContent = t('apotheosis.edict.whatHappensLine', 'What will happen: {desc}', {
      desc: t(spec.whatKey, spec.fallbackWhat),
    });
    card.append(whatLbl);

    const actRow = uiEl('div', 'apo-row');
    const btn = uiEl('button', `apo-btn${elig.ok ? ' primary' : ''}`, t('apotheosis.edict.btnProclaim', 'Proclaim Edict ({cost} Faith • 30d)', { cost: REGIONAL_EDICT_COST }));
    btn.onclick = () => {
      const r = proclaimRegionalEdict(entity, cultEdictRegion, eid, { nowMinutes: nowMin });
      setFeedback(r.ok ? t('apotheosis.edict.proclaimedHud', 'Edict proclaimed across the region for 30 days!') : r.reason, !r.ok);
      repaint();
    };
    actRow.append(btn);
    card.append(actRow);
    detail.append(card);
  }
}

/** Renders the Milestone 3.2 Cult, Temples & Regional Edicts section inside Apotheosis Pause UI. */
export function renderCultPage(detail, entity, repaint, { renderFaithBox, setFeedback, statusMessage = null, statusIsError = false }) {
  let nowMin = 0;
  try {
    nowMin = Number(getAurbisRuntime().getWorldMinutes?.() ?? 0) || 0;
  } catch {
    nowMin = 0;
  }
  const pantheon = ensurePantheonState(entity, { nowMinutes: nowMin });
  ensureCultState(entity);
  renderFaithBox(detail, entity.apotheosis ?? {}, entity);
  if (statusMessage) {
    detail.append(uiEl('div', `apo-notice${statusIsError ? ' err' : ''}`, statusMessage));
  }

  const tabs = uiEl('div', 'apo-subtabs');
  for (const [tid, label] of [
    ['sanctuaries', t('apotheosis.cult.subTabSites', 'Temples & Underground Sanctuaries')],
    ['edicts', t('apotheosis.cult.subTabEdicts', 'Regional Edicts (71 Regions)')],
  ]) {
    const b = uiEl('button', `apo-btn${cultSubTab === tid ? ' primary' : ''}`, label);
    b.onclick = () => {
      cultSubTab = tid;
      repaint({ resetDetailScroll: true });
    };
    tabs.append(b);
  }
  detail.append(tabs);

  if (cultSubTab === 'edicts') {
    renderEdictsView(detail, entity, nowMin, repaint, setFeedback);
  } else {
    renderSanctuariesView(detail, entity, pantheon, nowMin, repaint, setFeedback);
  }
}
