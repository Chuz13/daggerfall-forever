// @ts-check
// NWN-inspired Combat & Event Log pane (Pause > Log & Death Modal).
// Localized across all 26 locales via t() / localizedText(); Ambient Text stays English.

import {
  clearGameLog,
  getGameLogEncounters,
  getGameLogEntries,
  getLatestEncounter,
  onGameLogChange,
} from '../systems/gameLog.js';
import { t, getLocalizedEnemyName } from '../systems/textManager.js';
import { getPref, setPref } from '../systems/uiPrefs.js';
import { SKILL_NAMES } from '../systems/skills.js';
import { DISEASE_NAMES } from '../systems/diseases.js';
import { enemyDisplayName } from '../characters/enemy/enemyBasics.js';
import { shownItemName, itemNameParts } from '../systems/item/itemInfo.js';
import { shownSpellName } from '../systems/loot/loot.js';
import { dateFromClassicMinutes, dateString } from '../systems/gameDate.js';
import { repaintKeepingScroll } from './domRepaint.js';

export const GAME_LOG_STYLE_ID = 'df-gamelog-css';

const GAME_LOG_CSS = `
.px-body:has(> .glog-pane) { overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.glog-pane { flex: 1; display: flex; flex-direction: column; height: 100%; min-height: 0; }
.glog-pane > .px-journal { flex: 1; height: 100%; min-height: 0; overflow: hidden; }
.glog-pane .px-qrail { min-height: 0; overflow-y: auto; }
.glog-rail-hdr { padding: 8px 12px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #c8a858; opacity: 0.85; border-bottom: 1px solid rgba(200,168,88,0.22); margin-bottom: 2px; user-select: none; }
.glog-rail-hdr:not(:first-child) { margin-top: 10px; }
.glog-rail-cnt { margin-left: auto; font-size: 11px; color: #9c937d; font-variant-numeric: tabular-nums; }
.glog-enc-btn { flex-direction: column; align-items: flex-start !important; gap: 2px !important; min-height: 40px !important; padding: 6px 8px !important; }
.glog-enc-top { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 6px; font-size: 13px; text-transform: none; letter-spacing: 0.03em; }
.glog-enc-sub { display: flex; align-items: center; justify-content: space-between; width: 100%; font-size: 11px; color: #9c937d; text-transform: none; letter-spacing: 0.02em; }
.glog-enc-pill { font-size: 10px; padding: 1px 5px; border: 1px solid rgba(125,116,96,0.5); text-transform: uppercase; letter-spacing: 0.06em; }
.glog-enc-pill.victory { border-color: rgba(126,232,190,0.6); color: #7ee8be; }
.glog-enc-pill.death { border-color: rgba(255,122,122,0.7); color: #ff7a7a; }
.glog-enc-pill.active { border-color: rgba(243,239,44,0.65); color: #f3ef2c; }

.glog-main-col { flex: 1 1 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; padding-left: 14px; }
.glog-sticky-head { flex-shrink: 0; display: flex; flex-direction: column; gap: 8px; padding: 2px 6px 10px 0; border-bottom: 1px solid rgba(190,165,98,0.32); margin-bottom: 8px; }
.glog-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.glog-search { flex: 1 1 180px; min-width: 140px; font: inherit; font-size: 13px; padding: 5px 9px; color: #efe3bc; background: rgba(8,10,15,0.85); border: 1px solid rgba(125,116,96,0.6); }
.glog-search:focus { outline: none; border-color: #c8a858; }
.glog-chip { font: inherit; font-size: 12px; padding: 4px 8px; cursor: pointer; color: #c7bfa7; background: rgba(18,22,30,0.85); border: 1px solid rgba(125,116,96,0.5); text-transform: uppercase; letter-spacing: 0.05em; }
.glog-chip:hover { color: #efe3bc; border-color: #c8a858; }
.glog-chip.on { color: #f3ef2c; border-color: rgba(243,239,44,0.7); background: rgba(42,36,16,0.78); }
.glog-act { font: inherit; font-size: 12px; padding: 4px 9px; cursor: pointer; color: #efe3bc; background: rgba(30,35,46,0.9); border: 1px solid rgba(190,165,98,0.65); text-transform: uppercase; letter-spacing: 0.05em; }
.glog-act:hover { border-color: #f3ef2c; color: #f3ef2c; }
.glog-notice { font-size: 12px; color: #7ee8be; margin-left: 4px; }

.glog-enc-banner { padding: 8px 12px; border: 1px solid rgba(190,165,98,0.45); background: rgba(14,17,24,0.82); display: flex; flex-direction: column; gap: 5px; }
.glog-enc-banner-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; font-size: 13px; color: #efe3bc; }
.glog-enc-stats { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: #c7bfa7; font-variant-numeric: tabular-nums; }
.glog-enc-stats strong { color: #efe3bc; font-weight: 600; }

.glog-feed { flex: 1 1 0; min-height: 0; overflow-y: auto; padding-right: 6px; display: flex; flex-direction: column; gap: 5px; }
.glog-day-sep { margin: 8px 0 2px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #9c937d; border-bottom: 1px solid rgba(125,116,96,0.28); padding-bottom: 2px; }

.glog-row { border: 1px solid rgba(125,116,96,0.32); border-left-width: 3px; background: rgba(12,15,21,0.76); padding: 6px 10px; display: flex; flex-direction: column; gap: 4px; text-shadow: 1px 1px 0 rgba(0,0,0,0.85); }
.glog-row.clickable { cursor: pointer; }
.glog-row.clickable:hover { background: rgba(20,25,35,0.88); border-color: rgba(190,165,98,0.55); }
.glog-row.tone-player-hit { border-left-color: #9ecbff; }
.glog-row.tone-player-crit { border-left-color: #f3ef2c; }
.glog-row.tone-enemy-hit { border-left-color: #ff7a7a; }
.glog-row.tone-miss { border-left-color: #7c8492; opacity: 0.88; }
.glog-row.tone-magic { border-left-color: #c29dff; }
.glog-row.tone-heal { border-left-color: #7ee8be; }
.glog-row.tone-danger { border-left-color: #ffb86c; }
.glog-row.tone-world { border-left-color: #c8a858; }

.glog-row-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; font-size: 14px; line-height: 1.38; color: #e2dac4; }
.glog-time { font-size: 11px; color: #8c8470; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.glog-glyph { font-size: 13px; flex-shrink: 0; }
.glog-text { flex: 1 1 200px; min-width: 0; }
.glog-dmg { font-weight: 700; color: #ffffff; font-variant-numeric: tabular-nums; }
.glog-row.tone-player-crit .glog-dmg { color: #f3ef2c; }
.glog-row.tone-enemy-hit .glog-dmg { color: #ff9494; }
.glog-row.tone-heal .glog-dmg { color: #7ee8be; }
.glog-badges { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.glog-badge { font-size: 10px; padding: 1px 5px; border: 1px solid rgba(125,116,96,0.55); color: #d8cfae; text-transform: uppercase; letter-spacing: 0.05em; }
.glog-badge.crit { border-color: rgba(243,239,44,0.75); color: #f3ef2c; background: rgba(54,48,14,0.7); }
.glog-badge.shield { border-color: rgba(158,203,255,0.65); color: #9ecbff; background: rgba(16,32,52,0.7); }
.glog-badge.magic { border-color: rgba(194,157,255,0.65); color: #d7beff; background: rgba(36,22,58,0.7); }
.glog-badge.danger { border-color: rgba(255,122,122,0.75); color: #ffbaba; background: rgba(54,16,18,0.75); }
.glog-inline-roll { font-size: 11px; color: #9c937d; font-variant-numeric: tabular-nums; }
.glog-caret { font-size: 11px; color: #9c937d; margin-left: auto; }
.glog-flavor { font-size: 12px; color: #b5ad96; font-style: italic; padding-left: 18px; }

.glog-detail { margin-top: 4px; padding: 8px 10px; border: 1px solid rgba(125,116,96,0.4); background: rgba(7,9,13,0.88); display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: #c7bfa7; }
.glog-det-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
.glog-det-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #9c937d; min-width: 78px; }
.glog-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.glog-dchip { padding: 1px 6px; border: 1px solid rgba(125,116,96,0.42); background: rgba(18,22,30,0.82); color: #e2dac4; font-variant-numeric: tabular-nums; }
.glog-prob-bar { position: relative; width: 110px; height: 8px; background: rgba(255,255,255,0.08); border: 1px solid rgba(125,116,96,0.55); }
.glog-prob-fill { height: 100%; background: linear-gradient(90deg, #5e8fc4, #9ecbff); }
.glog-prob-mark { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #f3ef2c; }
.glog-empty { text-align: center; padding: 32px 16px; color: #9c937d; font-size: 15px; }
@media (max-width: 480px) { .glog-main-col { padding-left: 0; } }
`;

let _filter = 'all'; // 'all' | 'combat' | 'magic' | 'character' | 'world'
let _selectedEncounterId = null;
let _search = '';
let _onlyPlayer = false;
let _onlyEnemies = false;
let _hideMisses = false;
const _expanded = new Set();
let _copyNotice = false;
let _copyTimer = null;
let _unsubLog = null;
let _mountedHost = null;

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string|null} [cls] @param {string|null} [text] @returns {HTMLElementTagNameMap[K]} */
function el(tag, cls = null, text = null) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById?.(GAME_LOG_STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = GAME_LOG_STYLE_ID;
  s.textContent = GAME_LOG_CSS;
  (document.head ?? document.body).append(s);
}

const prefBool = (k, def) => {
  try {
    const v = getPref(k);
    return v === undefined ? def : Boolean(v);
  } catch {
    return def;
  }
};

function partName(part) {
  switch (part) {
    case 0: return t('log.part.head', 'Head');
    case 1: return t('log.part.rightArm', 'Right Arm');
    case 2: return t('log.part.leftArm', 'Left Arm');
    case 3: return t('log.part.chest', 'Chest');
    case 4: return t('log.part.hands', 'Hands');
    case 5: return t('log.part.legs', 'Legs');
    case 6: return t('log.part.feet', 'Feet');
    default: return null;
  }
}

function actorName(snap) {
  if (!snap) return t('log.actor.unknown', 'Unknown');
  if (snap.isPlayer) return t('log.actor.you', 'You');
  if (Number.isInteger(snap.mobileType)) {
    const canon = enemyDisplayName(snap.mobileType);
    const localized = getLocalizedEnemyName(snap.mobileType, canon || snap.name || '');
    if (localized) return localized;
  }
  return snap.name || t('log.actor.foe', 'Enemy');
}

function weaponLabel(w) {
  if (!w) return t('log.weapon.unarmed', 'Unarmed');
  if (w.unarmed) return w.isMonster ? t('log.weapon.natural', 'Natural attack') : t('log.weapon.unarmed', 'Unarmed');
  try {
    const parts = itemNameParts(w);
    if (parts?.name) {
      const m = parts.material;
      if (m && !parts.name.toLowerCase().startsWith(`${m.toLowerCase()} `) && !w.artifact && !w.legendary && !w.aetheric && !w.gilded && !w.qlNamed) {
        return `${m} ${parts.name}`;
      }
      return parts.name;
    }
  } catch {
    /* fallback */
  }
  return shownItemName(w) || w.name || t('log.weapon.weapon', 'Weapon');
}

function spellLabel(s) {
  if (!s) return t('log.spell.unknown', 'Spell');
  return shownSpellName({ name: s.name || 'Spell', index: s.index }) || s.name || t('log.spell.unknown', 'Spell');
}

function skillLabel(skillId) {
  return SKILL_NAMES[skillId] || t('log.skill.unknown', 'Skill');
}

function diseaseLabel(diseaseType) {
  const raw = DISEASE_NAMES[diseaseType];
  if (!raw) return t('log.disease.unknown', 'Disease');
  return raw;
}

function formatWallClock(ms) {
  try {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  } catch {
    return '00:00:00';
  }
}

function formatGameClock(minutes) {
  if (!Number.isFinite(minutes)) return null;
  try {
    const d = dateFromClassicMinutes(minutes);
    return `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function formatGameDay(minutes) {
  if (!Number.isFinite(minutes)) return null;
  try {
    return dateString(dateFromClassicMinutes(minutes));
  } catch {
    return null;
  }
}

function outcomeLabel(outcome) {
  switch (outcome) {
    case 'victory': return t('log.enc.victory', 'Victory');
    case 'death': return t('log.enc.defeat', 'Defeat');
    case 'active': return t('log.enc.active', 'Active');
    default: return t('log.enc.ended', 'Ended');
  }
}

function flavorForEntry(entry) {
  const d = entry.data || {};
  if (entry.kind === 'attack') {
    if (d.ineffective) return d.attacker?.isPlayer ? t('log.flavor.ineffective', 'Your weapon cannot harm this foe.') : null;
    const dmgDiag = d.diag?.damage || {};
    if (dmgDiag.shieldBlocked && d.damage === 0) return t('log.flavor.shieldFull', 'The shield turns the blow aside completely.');
    if (dmgDiag.shieldBlocked) return t('log.flavor.shieldBlock', 'The shield catches part of the blow.');
    if (!d.hit) {
      const m = d.diag?.toHit?.modifiers || {};
      const armorPen = Math.abs(Math.min(0, m.armorMod ?? 0));
      const dodgePen = Math.abs(Math.min(0, m.skillMod ?? 0));
      return dodgePen > armorPen
        ? t('log.flavor.missDodge', 'The target slips out of the strike path.')
        : t('log.flavor.missArmor', 'The blow glances harmlessly off armor.');
    }
    if (d.backstab) return t('log.flavor.backstab', 'A deadly strike from the shadows!');
    if (d.critical) return t('log.flavor.crit', 'A precise strike finds a vital opening!');
    if ((dmgDiag.mitigated ?? 0) > d.damage && d.damage > 0) return t('log.flavor.heavyArmor', 'Armor absorbs the brunt of the impact.');
    if (d.hpBefore > 0 && d.damage / d.hpBefore >= 0.35) return t('log.flavor.crushing', 'A crushing blow!');
  } else if (entry.kind === 'spell') {
    const out = d.out || {};
    if ((out.reflected ?? 0) > 0) return t('log.flavor.reflected', 'The spell rebounds back upon its caster!');
    if ((out.absorbed ?? 0) > 0) return t('log.flavor.absorbed', 'Arcane energy dissolves, replenishing magicka.');
    if ((out.resisted ?? 0) > 0) return t('log.flavor.resisted', 'The target shrugs off the magic completely.');
    if ((out.saved ?? 0) > 0) return t('log.flavor.saved', 'A saving throw blunts the spell.');
  }
  return null;
}

/**
 * Pure summary formatter for an entry (used by both UI rendering, search, clipboard export, and tests).
 * @param {Record<string, any>} entry
 * @param {{ formulas?: boolean, flavor?: boolean }} [opts]
 */
export function formatEntrySummary(entry, opts = {}) {
  const formulas = Boolean(opts.formulas);
  const flavor = Boolean(opts.flavor);
  const d = entry?.data || {};
  const badges = [];
  let text = '';
  let inlineRoll = '';
  let glyph = '•';

  if (entry.kind === 'attack') {
    const atk = actorName(d.attacker);
    const tgt = actorName(d.target);
    const wep = weaponLabel(d.weapon);
    const part = partName(d.diag?.struckPart);
    const partStr = part ? ` (${part})` : '';
    glyph = d.diag?.damage?.shieldBlocked ? '🛡' : '⚔';

    if (d.ineffective) {
      text = t('log.attack.ineffective', '{attacker} → {target}{part} · {weapon} - Ineffective', { attacker: atk, target: tgt, part: partStr, weapon: wep });
      badges.push({ cls: 'danger', label: t('log.badge.ineff', 'INEFF') });
    } else if (!d.hit) {
      text = t('log.attack.miss', '{attacker} → {target}{part} · {weapon} - Miss', { attacker: atk, target: tgt, part: partStr, weapon: wep });
      badges.push({ cls: '', label: t('log.badge.miss', 'MISS') });
    } else {
      text = t('log.attack.hit', '{attacker} → {target}{part} · {weapon} - {damage} dmg', { attacker: atk, target: tgt, part: partStr, weapon: wep, damage: d.damage });
      if (d.critical) badges.push({ cls: 'crit', label: t('log.badge.crit', 'CRIT') });
      if (d.backstab) badges.push({ cls: 'crit', label: t('log.badge.backstab', 'BACKSTAB') });
      if (d.diag?.damage?.shieldBlocked) badges.push({ cls: 'shield', label: t('log.badge.shield', 'SHIELD') });
      if (d.shadowResisted) badges.push({ cls: 'magic', label: t('log.badge.shadow', 'SHADOW') });
    }
    if (formulas && d.diag?.toHit) {
      const th = d.diag.toHit;
      inlineRoll = `[d100: ${th.hitRoll}/${th.finalChance}%${(d.diag?.damage?.mitigated ?? 0) > 0 ? ` · -${d.diag.damage.mitigated}` : ''}]`;
    }
  } else if (entry.kind === 'spell') {
    const caster = actorName(d.caster);
    const tgt = actorName(d.target);
    const sp = spellLabel(d.spell);
    const out = d.out || {};
    glyph = '✦';

    if ((out.damage ?? 0) > 0) {
      text = t('log.spell.damage', '{caster} → {target} · {spell} - {damage} dmg', { caster, target: tgt, spell: sp, damage: out.damage });
    } else if ((out.healed ?? 0) > 0) {
      text = t('log.spell.heal', '{caster} → {target} · {spell} - +{healed} HP', { caster, target: tgt, spell: sp, healed: out.healed });
    } else {
      text = t('log.spell.cast', '{caster} → {target} · {spell}', { caster, target: tgt, spell: sp });
    }
    if ((out.absorbed ?? 0) > 0) badges.push({ cls: 'magic', label: t('log.badge.absorb', 'ABSORB +{n}', { n: out.absorbed }) });
    if ((out.reflected ?? 0) > 0) badges.push({ cls: 'magic', label: t('log.badge.reflect', 'REFLECT') });
    if ((out.resisted ?? 0) > 0) badges.push({ cls: 'magic', label: t('log.badge.resist', 'RESIST') });
    if ((out.saved ?? 0) > 0) badges.push({ cls: 'magic', label: t('log.badge.saved', 'SAVE') });
    if ((out.paralyzed ?? 0) > 0) badges.push({ cls: 'danger', label: t('log.badge.paralyzed', 'PARALYZED') });
    if ((out.cured ?? 0) > 0) badges.push({ cls: '', label: t('log.badge.cured', 'CURED') });
    if ((out.chanceFailed ?? 0) > 0 && !badges.length && !(out.damage > 0) && !(out.healed > 0)) {
      badges.push({ cls: '', label: t('log.badge.miss', 'MISS') });
    }
  } else if (entry.kind === 'kill') {
    glyph = '☠';
    text = t('log.kill', '{target} slain!', { target: actorName(d.target) });
    badges.push({ cls: 'crit', label: t('log.badge.kill', 'KILL') });
  } else if (entry.kind === 'death') {
    glyph = '☠';
    text = d.goldLoss > 0
      ? t('log.death.loss', 'You have fallen! ({gold} gold lost)', { gold: d.goldLoss })
      : t('log.death.plain', 'You have fallen!');
    badges.push({ cls: 'danger', label: t('log.badge.death', 'DEATH') });
  } else if (entry.kind === 'skill') {
    glyph = '★';
    text = t('log.skill.up', 'Skill improved: {skill} ({value})', { skill: skillLabel(d.skillId), value: d.newValue });
  } else if (entry.kind === 'levelUp') {
    glyph = '▲';
    text = t('log.level.up', 'Level reached: {level}', { level: d.level });
  } else if (entry.kind === 'itemBreak') {
    glyph = '⚠';
    text = t('log.item.broken', '{item} has broken!', { item: d.itemName });
    badges.push({ cls: 'danger', label: t('log.badge.broken', 'BROKEN') });
  } else if (entry.kind === 'disease') {
    glyph = '☣';
    text = d.resisted
      ? t('log.disease.resisted', 'Resisted a disease.')
      : t('log.disease.contracted', 'Contracted {disease}!', { disease: diseaseLabel(d.diseaseType) });
  } else if (entry.kind === 'poison') {
    glyph = '☣';
    text = d.resisted
      ? t('log.poison.resisted', 'Resisted poison.')
      : t('log.poison.inflicted', 'Poisoned!');
  } else if (entry.kind === 'loot') {
    glyph = '◈';
    const parts = (d.items || []).map((it) => (it.gold
      ? t('log.loot.gold', '+{n} Gold', { n: it.count })
      : it.count > 1 ? `${it.name} ×${it.count}` : it.name));
    text = t('log.loot.line', 'Looted: {items}', { items: parts.join(', ') });
  } else {
    glyph = entry.kind === 'worldEvent' ? '⚑' : '•';
    text = String(d.rawText || '');
  }

  if ((entry.repeatCount ?? 1) > 1) {
    badges.push({ cls: '', label: `×${entry.repeatCount}` });
  }

  const flavorText = flavor ? flavorForEntry(entry) : null;
  return { glyph, text, badges, inlineRoll, flavorText };
}

function buildAttackBreakdown(entry) {
  const d = entry.data || {};
  const diag = d.diag;
  if (!diag) return null;
  const box = el('div', 'glog-detail');
  const coreLabel = diag.core === 'pcaao' ? 'PCAAO' : t('log.core.classic', 'Classic');

  if (diag.toHit) {
    const th = diag.toHit;
    const row = el('div', 'glog-det-row');
    row.append(el('span', 'glog-det-lbl', t('log.det.toHit', 'To Hit')));
    const bar = el('div', 'glog-prob-bar');
    const fill = el('div', 'glog-prob-fill');
    fill.style.width = `${Math.max(0, Math.min(100, th.finalChance))}%`;
    const mark = el('div', 'glog-prob-mark');
    mark.style.left = `${Math.max(0, Math.min(99, th.hitRoll))}%`;
    bar.append(fill, mark);
    row.append(bar);
    const chips = el('div', 'glog-chips');
    chips.append(el('span', 'glog-dchip', `${coreLabel}`));
    chips.append(el('span', 'glog-dchip', `d100: ${th.hitRoll} / ${th.finalChance}%`));
    const m = th.modifiers || {};
    const addMod = (lbl, val) => {
      if (Number.isFinite(val) && val !== 0) chips.append(el('span', 'glog-dchip', `${lbl} ${val > 0 ? `+${val}` : val}`));
    };
    if (th.parts && Number.isFinite(th.parts.baseSkill) && th.parts.baseSkill !== 0) {
      addMod(t('log.mod.skill', 'Base Skill'), th.parts.baseSkill);
    } else {
      addMod(t('log.mod.skill', 'Base Skill'), th.chanceToHitMod);
    }
    addMod(t('log.mod.armor', 'Armor'), m.armorMod);
    addMod(t('log.mod.dodging', 'Dodge/Crit'), m.skillMod);
    addMod(t('log.mod.stats', 'Stats'), m.statMod);
    addMod(t('log.mod.adren', 'Adrenaline'), m.adrenMod);
    addMod(t('log.mod.enchant', 'Enchant'), m.enchMod);
    addMod(t('log.mod.perk', 'Perk'), m.perkMod);
    addMod(t('log.mod.adj', 'Adjust'), m.adjMod);
    if (th.parts) {
      addMod(t('log.mod.swing', 'Swing'), th.parts.swingToHit);
      addMod(t('log.mod.prof', 'Proficiency'), th.parts.profToHit);
      addMod(t('log.mod.racial', 'Racial'), th.parts.racialToHit);
      addMod(t('log.badge.backstab', 'BACKSTAB'), th.parts.backstabToHit);
      addMod(t('log.badge.crit', 'CRIT'), th.parts.critHitAddi);
      addMod(t('log.mod.wepMat', 'Material'), th.parts.weaponMatToHit);
    }
    row.append(chips);
    box.append(row);
  }

  if (d.hit && !d.ineffective) {
    const dmg = diag.damage || {};
    const dmgRow = el('div', 'glog-det-row');
    dmgRow.append(el('span', 'glog-det-lbl', t('log.det.damage', 'Damage')));
    const dChips = el('div', 'glog-chips');
    if (Number.isFinite(dmg.rawDamage)) dChips.append(el('span', 'glog-dchip', t('log.dmg.raw', 'Raw {n}', { n: Math.round(dmg.rawDamage) })));
    if (dmg.strMod) dChips.append(el('span', 'glog-dchip', t('log.dmg.str', 'STR {n}', { n: dmg.strMod > 0 ? `+${dmg.strMod}` : dmg.strMod })));
    if (dmg.matDamageMod) dChips.append(el('span', 'glog-dchip', t('log.dmg.mat', 'Mat {n}', { n: dmg.matDamageMod > 0 ? `+${dmg.matDamageMod}` : dmg.matDamageMod })));
    if (dmg.qualityDamageMod) dChips.append(el('span', 'glog-dchip', t('log.dmg.qual', 'Qual {n}', { n: dmg.qualityDamageMod > 0 ? `+${dmg.qualityDamageMod}` : dmg.qualityDamageMod })));
    if (dmg.critDamMulti && dmg.critDamMulti > 1) dChips.append(el('span', 'glog-dchip', `${t('log.badge.crit', 'CRIT')} ×${dmg.critDamMulti.toFixed(2)}`));
    if (dmg.backstabApplied) dChips.append(el('span', 'glog-dchip', `${t('log.badge.backstab', 'BACKSTAB')} ×3`));
    if (dmg.shieldBlocked) dChips.append(el('span', 'glog-dchip', t('log.dmg.shield', 'Shield Blocked')));
    if ((dmg.mitigated ?? 0) > 0) dChips.append(el('span', 'glog-dchip', t('log.dmg.mitigated', 'Mitigated -{n}', { n: Math.round(dmg.mitigated) })));
    if (dmg.eliteScale && dmg.eliteScale !== 1) dChips.append(el('span', 'glog-dchip', `×${dmg.eliteScale}`));
    if (dmg.staggered) dChips.append(el('span', 'glog-dchip', t('log.dmg.stagger', 'Stagger ×1.25')));
    if (d.hpBefore != null && d.hpAfter != null) {
      dChips.append(el('span', 'glog-dchip', `HP ${Math.round(d.hpBefore)} → ${Math.round(d.hpAfter)}`));
    }
    dmgRow.append(dChips);
    box.append(dmgRow);
  }
  return box.children.length ? box : null;
}

function buildSpellBreakdown(entry) {
  const d = entry.data || {};
  const out = d.out || {};
  const box = el('div', 'glog-detail');
  const row = el('div', 'glog-det-row');
  row.append(el('span', 'glog-det-lbl', t('log.det.spell', 'Spell')));
  const chips = el('div', 'glog-chips');
  chips.append(el('span', 'glog-dchip', t('log.spell.casterLvl', 'Caster Lv {n}', { n: d.casterLevel ?? 1 })));
  if ((out.damage ?? 0) > 0) chips.append(el('span', 'glog-dchip', t('log.spell.dmgOut', 'Damage {n}', { n: out.damage })));
  if ((out.healed ?? 0) > 0) chips.append(el('span', 'glog-dchip', t('log.spell.healOut', 'Healed +{n}', { n: out.healed })));
  if ((out.magickaHealed ?? 0) > 0) chips.append(el('span', 'glog-dchip', `+${out.magickaHealed} SP`));
  if ((out.magickaDrained ?? 0) > 0) chips.append(el('span', 'glog-dchip', `-${out.magickaDrained} SP`));
  if ((out.fatigueDrained ?? 0) > 0) chips.append(el('span', 'glog-dchip', `-${out.fatigueDrained} FAT`));
  if ((out.absorbed ?? 0) > 0) chips.append(el('span', 'glog-dchip', t('log.spell.absOut', 'Absorbed {n} SP', { n: out.absorbed })));
  if ((out.reflected ?? 0) > 0) chips.append(el('span', 'glog-dchip', t('log.spell.refOut', 'Reflected')));
  if ((out.resisted ?? 0) > 0) chips.append(el('span', 'glog-dchip', t('log.spell.resOut', 'Resisted')));
  if ((out.saved ?? 0) > 0) chips.append(el('span', 'glog-dchip', t('log.spell.savOut', 'Save Made')));
  if ((out.chanceFailed ?? 0) > 0) chips.append(el('span', 'glog-dchip', t('log.badge.miss', 'MISS')));
  if (d.hpBefore != null && d.hpAfter != null && d.hpBefore !== d.hpAfter) {
    chips.append(el('span', 'glog-dchip', `HP ${Math.round(d.hpBefore)} → ${Math.round(d.hpAfter)}`));
  }
  row.append(chips);
  box.append(row);
  return box;
}

function filterEntries(entries, { flavorOn }) {
  const q = _search.trim().toLowerCase();
  return entries.filter((e) => {
    if (!flavorOn && e.kind === 'ambient') return false;
    if (_selectedEncounterId != null) {
      if (e.encounterId !== _selectedEncounterId) return false;
    } else if (_filter !== 'all' && e.cat !== _filter) {
      return false;
    }
    if (_onlyPlayer) {
      const isPlayerActor = Boolean(
        e.data?.attacker?.isPlayer
        || e.data?.caster?.isPlayer
        || e.kind === 'kill'
        || e.kind === 'skill'
        || e.kind === 'levelUp'
        || e.kind === 'loot'
        || e.kind === 'death'
        || (e.kind === 'itemBreak' && e.data?.isPlayerOwner)
        || e.kind === 'disease'
        || e.kind === 'poison',
      );
      if (!isPlayerActor) return false;
    }
    if (_onlyEnemies) {
      const isEnemyActor = Boolean(
        (e.data?.attacker && !e.data.attacker.isPlayer)
        || (e.data?.caster && !e.data.caster.isPlayer)
        || (e.kind === 'itemBreak' && e.data && !e.data.isPlayerOwner),
      );
      if (!isEnemyActor) return false;
    }
    if (_hideMisses && e.kind === 'attack' && (!e.data?.hit || e.data?.ineffective)) return false;
    if (q) {
      const sum = formatEntrySummary(e, { formulas: true, flavor: flavorOn });
      const badgeText = sum.badges.map((b) => b.label).join(' ');
      const hay = `${sum.text} ${badgeText} ${sum.flavorText || ''} ${e.location || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderEncounterBanner(enc) {
  const s = enc.summary;
  const box = el('div', 'glog-enc-banner');
  const head = el('div', 'glog-enc-banner-head');
  const foeNames = enc.foes.slice(0, 3).map((f) => actorName(f)).join(', ') || t('log.enc.skirmish', 'Skirmish');
  const time = formatGameClock(enc.startGameMinutes) || formatWallClock(enc.startWallTime);
  head.append(el('strong', null, `${foeNames}${enc.location ? ` · ${enc.location}` : ''} · ${time}`));
  head.append(el('span', `glog-enc-pill ${enc.outcome}`, outcomeLabel(enc.outcome)));
  box.append(head);

  const stats = el('div', 'glog-enc-stats');
  const acc = s.playerAttacks > 0 ? `${s.playerHits}/${s.playerAttacks} (${Math.round((s.playerHits / s.playerAttacks) * 100)}%)` : '-';
  const statItem = (label, val) => {
    const sp = el('span');
    sp.append(document.createTextNode(`${label}: `), el('strong', null, String(val)));
    return sp;
  };
  stats.append(
    statItem(t('log.enc.dealt', 'Dealt'), Math.round(s.playerDamageDealt)),
    statItem(t('log.enc.taken', 'Taken'), Math.round(s.playerDamageTaken)),
    statItem(t('log.enc.acc', 'Accuracy'), acc),
    statItem(t('log.enc.crits', 'Crits'), s.playerSpecialHits ?? (s.playerCrits + s.playerBackstabs)),
    statItem(t('log.enc.blocked', 'Shield Blocks'), s.shieldBlocks),
    statItem(t('log.enc.mitigated', 'Mitigated'), Math.round(s.armorMitigated)),
  );
  box.append(stats);
  return box;
}

function repaintPreservingUi(host) {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const wasSearch = Boolean(active && active.classList?.contains('glog-search') && host.contains?.(active));
  const pos = wasSearch ? (/** @type {HTMLInputElement} */ (active).selectionStart ?? _search.length) : null;
  repaintKeepingScroll(host, () => paintPane(host));
  if (wasSearch) {
    const nextSearch = /** @type {HTMLInputElement|null} */ (host.querySelector?.('.glog-search'));
    if (nextSearch) {
      nextSearch.focus();
      if (pos != null) nextSearch.setSelectionRange?.(pos, pos);
    }
  }
}

function paintPane(host) {
  host.innerHTML = '';
  const all = getGameLogEntries();
  const encounters = getGameLogEncounters();
  if (_selectedEncounterId != null && !encounters.some((x) => x.id === _selectedEncounterId)) {
    _selectedEncounterId = null;
  }
  const formulasOn = prefBool('gameLogFormulas', false);
  const flavorOn = prefBool('gameLogFlavor', true);
  const newestFirst = prefBool('gameLogNewestFirst', true);

  const pane = el('div', 'glog-pane');
  const wrap = el('div', 'px-journal');
  const rail = el('div', 'px-qrail');

  rail.append(el('div', 'glog-rail-hdr', t('log.rail.filters', 'Filters')));
  const counts = {
    all: all.filter((e) => flavorOn || e.kind !== 'ambient').length,
    combat: all.filter((e) => e.cat === 'combat').length,
    magic: all.filter((e) => e.cat === 'magic').length,
    character: all.filter((e) => e.cat === 'character').length,
    world: all.filter((e) => e.cat === 'world' && (flavorOn || e.kind !== 'ambient')).length,
  };
  const filters = [
    ['all', t('log.filter.all', 'All')],
    ['combat', t('log.filter.combat', 'Combat')],
    ['magic', t('log.filter.magic', 'Magic & Effects')],
    ['character', t('log.filter.character', 'Character')],
    ['world', t('log.filter.world', 'World')],
  ];
  for (const [id, label] of filters) {
    const b = el('button', `px-qrow${_selectedEncounterId == null && _filter === id ? ' on' : ''}`);
    b.type = 'button';
    b.append(el('span', 'px-c', '◆'), document.createTextNode(label), el('span', 'glog-rail-cnt', String(counts[id])));
    b.onclick = () => {
      _selectedEncounterId = null;
      _filter = id;
      repaintKeepingScroll(host, () => paintPane(host));
    };
    rail.append(b);
  }

  rail.append(el('div', 'glog-rail-hdr', t('log.rail.encounters', 'Recent Encounters')));
  if (!encounters.length) {
    rail.append(el('p', 'px-note', t('log.enc.none', 'No encounters yet.')));
  } else {
    for (const enc of [...encounters].reverse()) {
      const b = el('button', `px-qrow glog-enc-btn${_selectedEncounterId === enc.id ? ' on' : ''}`);
      b.type = 'button';
      const top = el('div', 'glog-enc-top');
      const foeTitle = enc.foes.slice(0, 2).map((f) => actorName(f)).join(', ') || t('log.enc.skirmish', 'Skirmish');
      top.append(el('span', null, foeTitle));
      top.append(el('span', `glog-enc-pill ${enc.outcome}`, outcomeLabel(enc.outcome)));
      const sub = el('div', 'glog-enc-sub');
      const clk = formatGameClock(enc.startGameMinutes) || formatWallClock(enc.startWallTime);
      sub.append(el('span', null, clk), el('span', null, `${Math.round(enc.summary.playerDamageDealt)} / -${Math.round(enc.summary.playerDamageTaken)}`));
      b.append(top, sub);
      b.onclick = () => {
        _selectedEncounterId = _selectedEncounterId === enc.id ? null : enc.id;
        repaintKeepingScroll(host, () => paintPane(host));
      };
      rail.append(b);
    }
  }
  wrap.append(rail);

  const main = el('div', 'glog-main-col');
  const sticky = el('div', 'glog-sticky-head');
  const bar1 = el('div', 'glog-bar');
  const search = el('input', 'glog-search');
  search.type = 'search';
  search.placeholder = t('log.search.placeholder', 'Search log...');
  search.value = _search;
  search.oninput = () => {
    const pos = search.selectionStart ?? search.value.length;
    _search = search.value;
    repaintKeepingScroll(host, () => paintPane(host));
    const nextSearch = host.querySelector?.('.glog-search');
    if (nextSearch) {
      nextSearch.focus();
      nextSearch.setSelectionRange?.(pos, pos);
    }
  };
  search.onkeydown = (e) => {
    if (e.key === 'Escape') {
      if (_search) {
        e.preventDefault();
        e.stopPropagation();
        _search = '';
        repaintPreservingUi(host);
      } else {
        search.blur();
      }
    }
  };
  bar1.append(search);

  const chip = (label, active, onClick) => {
    const b = el('button', `glog-chip${active ? ' on' : ''}`, label);
    b.type = 'button';
    b.onclick = onClick;
    return b;
  };
  const redraw = () => repaintKeepingScroll(host, () => paintPane(host));
  bar1.append(
    chip(t('log.chip.player', 'Player'), _onlyPlayer, () => { _onlyPlayer = !_onlyPlayer; if (_onlyPlayer) _onlyEnemies = false; redraw(); }),
    chip(t('log.chip.enemies', 'Enemies'), _onlyEnemies, () => { _onlyEnemies = !_onlyEnemies; if (_onlyEnemies) _onlyPlayer = false; redraw(); }),
    chip(t('log.chip.hideMisses', 'Hide misses'), _hideMisses, () => { _hideMisses = !_hideMisses; redraw(); }),
  );
  sticky.append(bar1);

  const bar2 = el('div', 'glog-bar');
  bar2.append(
    chip(formulasOn ? t('log.mode.formulas', 'Formulas') : t('log.mode.compact', 'Compact'), formulasOn, () => {
      setPref('gameLogFormulas', !formulasOn);
      redraw();
    }),
    chip(t('log.mode.flavor', 'Flavor'), flavorOn, () => {
      setPref('gameLogFlavor', !flavorOn);
      redraw();
    }),
    chip(newestFirst ? t('log.order.newest', 'Newest first') : t('log.order.oldest', 'Oldest first'), newestFirst, () => {
      setPref('gameLogNewestFirst', !newestFirst);
      redraw();
    }),
  );

  const visible = filterEntries(all, { flavorOn });
  const ordered = newestFirst ? [...visible].reverse() : visible;

  const copyBtn = el('button', 'glog-act', t('log.act.copy', 'Copy'));
  copyBtn.type = 'button';
  copyBtn.onclick = () => {
    const lines = ordered.map((e) => {
      const s = formatEntrySummary(e, { formulas: formulasOn, flavor: flavorOn });
      const ts = formatGameClock(e.gameMinutes) || formatWallClock(e.wallTime);
      return `[${ts}] ${s.text}${s.inlineRoll ? ` ${s.inlineRoll}` : ''}`;
    }).join('\n');
    const write = globalThis.navigator?.clipboard?.writeText;
    if (typeof write !== 'function') return;
    Promise.resolve(write.call(globalThis.navigator.clipboard, lines)).then(() => {
      _copyNotice = true;
      if (_copyTimer) clearTimeout(_copyTimer);
      _copyTimer = setTimeout(() => {
        _copyNotice = false;
        if (_mountedHost && _mountedHost.isConnected !== false) repaintPreservingUi(_mountedHost);
      }, 1500);
      if (_mountedHost && _mountedHost.isConnected !== false) repaintPreservingUi(_mountedHost);
    }).catch(() => {
      /* clipboard unavailable or denied */
    });
  };
  const clearBtn = el('button', 'glog-act', t('log.act.clear', 'Clear'));
  clearBtn.type = 'button';
  clearBtn.onclick = () => {
    _selectedEncounterId = null;
    _expanded.clear();
    clearGameLog();
  };
  bar2.append(copyBtn, clearBtn);
  if (_copyNotice) bar2.append(el('span', 'glog-notice', t('log.act.copied', 'Copied')));
  sticky.append(bar2);

  const activeEnc = _selectedEncounterId != null ? encounters.find((x) => x.id === _selectedEncounterId) : null;
  if (activeEnc) sticky.append(renderEncounterBanner(activeEnc));
  main.append(sticky);

  const feed = el('div', 'glog-feed');
  feed.setAttribute('data-scroll-key', `glog:${_filter}:${_selectedEncounterId ?? 'all'}`);
  if (!ordered.length) {
    feed.append(el('div', 'glog-empty', t('log.empty', 'No events recorded yet.')));
  } else {
    let lastDay = null;
    for (const entry of ordered) {
      const day = formatGameDay(entry.gameMinutes);
      if (day && day !== lastDay) {
        lastDay = day;
        feed.append(el('div', 'glog-day-sep', entry.location ? `${day} · ${entry.location}` : day));
      }
      const sum = formatEntrySummary(entry, { formulas: formulasOn, flavor: flavorOn });
      const expandable = (entry.kind === 'attack' && Boolean(entry.data?.diag?.toHit || (entry.data?.hit && !entry.data?.ineffective && entry.data?.diag?.damage))) || entry.kind === 'spell';
      const isOpen = expandable && _expanded.has(entry.id);
      const row = el('div', `glog-row tone-${entry.tone}${expandable ? ' clickable' : ''}`);
      const top = el('div', 'glog-row-main');
      const ts = formatGameClock(entry.gameMinutes) || formatWallClock(entry.wallTime);
      top.append(el('span', 'glog-time', `[${ts}]`), el('span', 'glog-glyph', sum.glyph));
      const txtSpan = el('span', 'glog-text', sum.text);
      top.append(txtSpan);
      if (sum.badges.length) {
        const bWrap = el('span', 'glog-badges');
        for (const bd of sum.badges) bWrap.append(el('span', `glog-badge${bd.cls ? ` ${bd.cls}` : ''}`, bd.label));
        top.append(bWrap);
      }
      if (sum.inlineRoll) top.append(el('span', 'glog-inline-roll', sum.inlineRoll));
      if (expandable) top.append(el('span', 'glog-caret', isOpen ? '▾' : '▸'));
      row.append(top);
      if (sum.flavorText) row.append(el('div', 'glog-flavor', sum.flavorText));
      if (isOpen) {
        const det = entry.kind === 'attack' ? buildAttackBreakdown(entry) : buildSpellBreakdown(entry);
        if (det) row.append(det);
      }
      if (expandable) {
        row.onclick = () => {
          if (_expanded.has(entry.id)) _expanded.delete(entry.id);
          else _expanded.add(entry.id);
          redraw();
        };
      }
      feed.append(row);
    }
  }
  main.append(feed);
  wrap.append(main);
  pane.append(wrap);
  host.append(pane);
}

/**
 * Mounts the Combat & Event Log pane inside `container`.
 * @param {HTMLElement} container
 * @param {{ selectLatestEncounter?: boolean }} [opts]
 */
export function drawGameLogPane(container, opts = {}) {
  if (!container) return;
  ensureStyle();
  if (opts.selectLatestEncounter) {
    const latest = getLatestEncounter();
    _selectedEncounterId = latest ? latest.id : null;
  }
  _mountedHost = container;
  _unsubLog?.();
  _unsubLog = onGameLogChange(() => {
    if (!_mountedHost) return;
    if (_mountedHost.isConnected === false) {
      releaseGameLogPane();
      return;
    }
    repaintPreservingUi(_mountedHost);
  });
  paintPane(container);
}

/** Clears transient UI state on unmount without clearing session log data. */
export function releaseGameLogPane() {
  _unsubLog?.();
  _unsubLog = null;
  _mountedHost = null;
  _selectedEncounterId = null;
  _search = '';
  _expanded.clear();
  _copyNotice = false;
  if (_copyTimer) {
    clearTimeout(_copyTimer);
    _copyTimer = null;
  }
}
