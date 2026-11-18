// @ts-check
// LICHDOM PANE (Pause > Lichdom tab): shows Lich & Archlich prerequisites,
// transformation methods, advantages, live vessel status, and safe ritual actions.
// Visibility follows canonical Grimoire/Lich state with zero extra save schema keys.

import { playerEntity, surfacePlayer } from '../characters/playerEntity.js';
import { FORK_FLAGS } from '../config/forkFlags.js';
import { NECRO_GRIMOIRE_BOOK_ID } from '../systems/apotheosis/apotheosisCore.js';
import { addItem } from '../systems/inventory.js';
import { templateByIndex, setItemFields, mintCondition } from '../systems/item/itemTemplates.js';
import { shownSpellName } from '../systems/loot/loot.js';
import { ELIXIR_OF_UNLIFE_KEY, ELIXIR_OF_UNLIFE_RECIPE, makePotion } from '../systems/potions.js';
import { SKILLS, skillValue, displaySkillValue, realSkillValue } from '../systems/skills.js';
import { calculateCastCost } from '../systems/spellcost.js';
import { liveStat } from '../systems/statMods.js';
import { t, getLocalizedItemName } from '../systems/textManager.js';
import { isPotion, isPotionRecipe } from '../systems/useItem.js';
import { worldMinutes } from '../systems/worldTick.js';
import { repaintKeepingScroll } from './domRepaint.js';
import {
  ARCH_LICH_MIN_LEVEL,
  ARCH_LICH_MIN_MYSTICISM,
  ARCH_LICH_MIN_INTELLIGENCE,
  ARCH_LICH_MIN_WILLPOWER,
  ELIXIR_LICHDOM_LEVEL,
  ELIXIR_LICHDOM_MYSTICISM,
  ELIXIR_LICHDOM_MIN_STAT,
  canAscendToArchLichdom,
  canDrinkElixirOfUnlife,
  drinkElixirOfUnlife,
  hasReadGrimoire,
  performArchLichdomRitual,
} from '../systems/necromancy/lichdomRitual.js';
import { isAncientLich, isAnyLich, isLich, isPlayerDisguised } from '../systems/necromancy/lichdomStatus.js';
import { readNecroGrimoire } from '../systems/necromancy/necroGrimoire.js';
import {
  archLichdomSpell,
  fingerOfDeathSpell,
  lichParalyzingTouchSpell,
  mortalDisguiseSpell,
} from '../systems/necromancy/necromanticSpells.js';
import { getPlayerTaint, getTaintTier, TAINT_TIERS } from '../systems/necromancy/necroTaint.js';
import { activeUndeadCount, calculateUndeadCapacity, usedUndeadPoints } from '../systems/necromancy/undeadCapacity.js';

export const LICHDOM_STYLE_ID = 'df-lichdom-css';

const LICHDOM_CSS = `
.px-body:has(> .lich-pane) { overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.lich-pane { flex: 1; display: flex; flex-direction: column; height: 100%; min-height: 0; }
.lich-pane > .px-journal { flex: 1; height: 100%; min-height: 0; overflow: hidden; }
.lich-pane .px-qrail { min-height: 0; overflow-y: auto; }
.lich-qrail-group-hdr { padding: 8px 14px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #9cd4be; opacity: 0.9; border-bottom: 1px solid rgba(114,196,164,0.28); margin-bottom: 2px; user-select: none; }
.lich-main-col { flex: 1 1 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.lich-sticky-head { flex-shrink: 0; padding: 0 8px 8px 0; border-bottom: 1px solid rgba(114,196,164,0.32); margin-bottom: 10px; }
.lich-sticky-head .lich-box { margin-bottom: 8px; padding: 9px 12px; }
.lich-sticky-head .lich-notice { margin-bottom: 0; }
.lich-pane .px-qdetail { flex: 1 1 0; min-height: 0; overflow-y: auto; padding-right: 8px; }
.lich-hero { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 2px solid rgba(114,196,164,0.48); background: rgba(10,16,20,0.72); margin-bottom: 14px; }
.lich-hero-title { font-size: 20px; color: #b9f5d8; text-shadow: 2px 2px 0 rgba(0,0,0,0.85); }
.lich-badge { display: inline-block; padding: 4px 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid rgba(190,165,98,0.6); background: rgba(24,28,38,0.85); color: #efe3bc; }
.lich-badge.ascended { border-color: #7ee8be; color: #c7ffea; background: rgba(16,52,44,0.85); }
.lich-badge.ready { border-color: #c29dff; color: #e8dbff; background: rgba(38,24,62,0.85); }
.lich-badge.blocked { border-color: rgba(226,100,100,0.75); color: #ffbaba; background: rgba(54,16,18,0.85); }
.lich-banner { padding: 11px 14px; margin-bottom: 14px; border: 2px solid rgba(226,100,100,0.65); background: rgba(54,16,18,0.72); color: #ffd9d9; font-size: 14px; line-height: 1.45; }
.lich-notice { padding: 10px 12px; margin-bottom: 12px; border: 1px solid rgba(126,232,190,0.6); background: rgba(14,40,34,0.82); color: #d5ffef; font-size: 14px; }
.lich-notice.err { border-color: rgba(235,96,96,0.7); background: rgba(54,16,18,0.82); color: #ffd4d4; }
.lich-box { padding: 12px 14px; margin-bottom: 14px; border: 1px solid rgba(125,116,96,0.5); background: rgba(11,14,20,0.58); }
.lich-box h4 { margin: 0 0 8px; font-size: 16px; color: #efe3bc; letter-spacing: 0.04em; text-transform: uppercase; }
.lich-stat-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.lich-stat-cell { padding: 5px 8px; border: 1px solid rgba(114,196,164,0.28); background: rgba(8,12,16,0.68); display: flex; flex-direction: column; gap: 2px; }
.lich-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #9eb3aa; }
.lich-stat-val { font-size: 14px; color: #eef7f2; font-weight: bold; }
.lich-bar-wrap { height: 14px; background: rgba(0,0,0,0.65); border: 1px solid rgba(125,116,96,0.55); margin: 8px 0; overflow: hidden; }
.lich-bar-fill { height: 100%; background: linear-gradient(90deg, #2d876a, #7ee8be); transition: width 0.2s ease; }
.lich-bar-fill.stage2 { background: linear-gradient(90deg, #6440a8, #c29dff); }
.lich-meta-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; font-size: 13px; color: #c7bfa7; margin-top: 4px; }
.lich-warn-row { margin-top: 8px; padding: 7px 10px; border: 1px solid rgba(230,157,69,0.55); background: rgba(54,34,12,0.58); font-size: 13px; color: #ffdba8; line-height: 1.38; }
.lich-acts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.lich-btn { font: inherit; font-size: 14px; padding: 8px 14px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; color: #efe3bc; background: rgba(30,35,46,0.9); border: 2px solid rgba(190,165,98,0.65); text-shadow: 1px 1px 0 #000; }
.lich-btn:hover:not(:disabled) { color: #b9f5d8; border-color: #7ee8be; background: rgba(20,44,38,0.92); }
.lich-btn:disabled { opacity: 0.45; cursor: not-allowed; border-color: rgba(125,116,96,0.4); color: #9c9482; }
.lich-btn.primary { border-color: #7ee8be; color: #c7ffea; background: rgba(16,52,44,0.9); }
.lich-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.lich-reagent-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; margin-top: 10px; }
.lich-reagent-card { padding: 8px 10px; border: 1px solid rgba(125,116,96,0.45); background: rgba(14,17,24,0.75); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.lich-reagent-card.ok { border-color: rgba(130,212,110,0.65); background: rgba(18,32,20,0.65); }
.lich-card { padding: 10px 12px; border: 1px solid rgba(125,116,96,0.45); background: rgba(14,17,24,0.74); display: flex; flex-direction: column; gap: 6px; }
.lich-card.done { border-color: rgba(130,212,110,0.65); background: rgba(18,32,20,0.66); }
.lich-card.active { border-color: #c29dff; background: rgba(36,24,54,0.72); }
.lich-card.blocked { border-color: rgba(226,100,100,0.7); background: rgba(48,16,18,0.65); }
.lich-card-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px; }
.lich-card-title { font-size: 15px; color: #f1e6c1; font-weight: bold; }
.lich-pill { font-size: 12px; padding: 2px 7px; border: 1px solid rgba(125,116,96,0.5); color: #b7af9b; white-space: nowrap; }
.lich-pill.ok { border-color: #82d46e; color: #b7f5a3; background: rgba(20,48,22,0.82); }
.lich-pill.warn { border-color: #e69d45; color: #ffd49c; background: rgba(54,36,12,0.82); }
.lich-pill.bad { border-color: #e26464; color: #ffbaba; background: rgba(56,16,18,0.85); }
.lich-pill.info { border-color: #c29dff; color: #e8dbff; background: rgba(36,24,54,0.85); }
.lich-card-desc { font-size: 13px; line-height: 1.4; color: #c7bfa7; }
.lich-card-prog { font-size: 12px; color: #dfd4b0; margin-top: auto; }
`;

let activeSec = 'overview';
let statusMessage = null;
let statusIsError = false;

/** @template {keyof HTMLElementTagNameMap} K @param {K} tag @param {string|null} [cls] @param {string|number|null} [txt] @returns {HTMLElementTagNameMap[K]} */
function makeEl(tag, cls = null, txt = null) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (txt != null) node.textContent = String(txt);
  return node;
}

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(LICHDOM_STYLE_ID)) return;
  const styleEl = document.createElement('style');
  styleEl.id = LICHDOM_STYLE_ID;
  styleEl.textContent = LICHDOM_CSS;
  (document.head ?? document.body).append(styleEl);
}

function setFeedback(msg, isError = false) {
  statusMessage = msg;
  statusIsError = Boolean(isError);
}

function safeWorldMinutes() {
  try {
    return worldMinutes() || 0;
  } catch {
    return 0;
  }
}

function reagentDisplayName(templateIndex) {
  const rawFallback = templateByIndex(templateIndex)?.name ?? '';
  if (templateIndex === 38) return getLocalizedItemName(38, t('lichdom.reagent.38', 'Wraith Essence'));
  if (templateIndex === 39) return getLocalizedItemName(39, t('lichdom.reagent.39', 'Ectoplasm'));
  if (templateIndex === 45) return getLocalizedItemName(45, t('lichdom.reagent.45', 'Lich Dust'));
  if (templateIndex === 53) return getLocalizedItemName(53, t('lichdom.reagent.53', "Daedra's Heart"));
  return getLocalizedItemName(templateIndex, rawFallback);
}

function detectConflictingCurse(entity) {
  if (!entity || isAnyLich(entity)) return null;
  const override = entity.racialOverride;
  if (override && !override.ended) {
    const racialName = typeof override === 'string' ? override : String(override.racial || override.kind || '');
    if (racialName === 'vampirism') return 'vampirism';
    if (racialName === 'lycanthropy') return 'lycanthropy';
    return 'curse';
  }
  if (entity.racialOverridePending) {
    const pending = entity.racialOverridePending;
    const pendingName = typeof pending === 'string' ? pending : String(pending.racial || pending.kind || '');
    if (pendingName === 'vampirism') return 'vampirism';
    if (pendingName === 'lycanthropy') return 'lycanthropy';
    return 'curse';
  }
  return null;
}

function curseLabel(curseKind) {
  if (curseKind === 'vampirism') return t('lichdom.curse.vampirism', 'Vampirism');
  if (curseKind === 'lycanthropy') return t('lichdom.curse.lycanthropy', 'Lycanthropy');
  return t('lichdom.curse.other', 'Racial Curse');
}

function taintTierLabel(tier) {
  if (tier === TAINT_TIERS.ABOMINATION) return t('lichdom.taint.abomination', 'Abomination');
  if (tier === TAINT_TIERS.DEFILER) return t('lichdom.taint.defiler', 'Defiler');
  if (tier === TAINT_TIERS.TAINTED) return t('lichdom.taint.tainted', 'Tainted');
  return t('lichdom.taint.pristine', 'Pristine');
}

function findMatchingItem(items, predicate) {
  for (const item of items) {
    if (item && predicate(item) && (item.stackCount ?? 1) > 0) return item;
  }
  return null;
}

function consumeOneItem(list, item) {
  const idx = list.indexOf(item);
  if (idx < 0) return false;
  if ((item.stackCount ?? 1) > 1) item.stackCount -= 1;
  else list.splice(idx, 1);
  return true;
}

const isElixirOfUnlifeItem = (item) => isPotion(item) && item.potionRecipeKey === ELIXIR_OF_UNLIFE_KEY;

const hasArchLichdomSpellRecord = (spells) =>
  spells.some(
    (spell) =>
      spell &&
      (spell.index === -52 ||
        spell.name === 'Arch-Lichdom' ||
        spell.effects?.some((eff) => eff && eff.type === 52 && eff.subType === 255)),
  );

/** Returns true when the Lichdom Pause tab should be visible for this entity. */
export function lichdomTabShown(entity = playerEntity) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY || !entity) return false;
  return Boolean(
    hasReadGrimoire(entity) ||
      isAnyLich(entity) ||
      (Array.isArray(entity.booksRead) && entity.booksRead.includes(NECRO_GRIMOIRE_BOOK_ID)),
  );
}

/** Pre-selects a Lichdom sub-section (`overview`, `lich`, or `archlich`). */
export function selectLichdomSection(sec) {
  if (sec === 'overview' || sec === 'lich' || sec === 'archlich') {
    activeSec = sec;
  }
}

/** Resets Lichdom UI state when the Pause menu unmounts. */
export function releaseLichdomPane() {
  activeSec = 'overview';
  statusMessage = null;
  statusIsError = false;
}

/** Computes live readiness, requirements, reagents, and stage status for Lich & Archlich. */
export function evaluateLichdomProgress(entity = playerEntity) {
  const items = Array.isArray(entity?.items) ? entity.items : [];
  const spells = Array.isArray(entity?.spells) ? entity.spells : [];
  const grimoireRead = Boolean(
    entity &&
      (hasReadGrimoire(entity) ||
        isAnyLich(entity) ||
        (Array.isArray(entity.booksRead) && entity.booksRead.includes(NECRO_GRIMOIRE_BOOK_ID))),
  );
  const stage = entity ? (isAncientLich(entity) ? 'ancient_lich' : isLich(entity) ? 'lich' : 'mortal') : 'mortal';
  const conflictingCurse = detectConflictingCurse(entity);
  const disguised = Boolean(entity && isPlayerDisguised(entity));
  const taint = getPlayerTaint(entity);
  const taintTier = getTaintTier(entity);
  const controlUsed = usedUndeadPoints();
  const controlMax = calculateUndeadCapacity(entity);
  const activeMinions = activeUndeadCount();

  const level = Math.max(1, Math.trunc(Number(entity?.level) || 1));
  const mysticism = entity
    ? Math.max(
        displaySkillValue(entity, SKILLS.Mysticism) || 0,
        realSkillValue(entity, SKILLS.Mysticism) || 0,
        skillValue(entity, SKILLS.Mysticism) || 0,
        entity.skills?.[SKILLS.Mysticism] ?? 0,
      )
    : 0;
  const intelligence = entity ? Math.max(liveStat(entity, 'intelligence') || 0, entity.stats?.intelligence ?? 0) : 0;
  const willpower = entity ? Math.max(liveStat(entity, 'willpower') || 0, entity.stats?.willpower ?? 0) : 0;
  const magicka = Math.max(0, Math.trunc(Number(entity?.magicka) || 0));
  const maxMagicka = Math.max(0, Math.trunc(Number(entity?.maxMagicka) || 0));
  const archLichCastCost = calculateCastCost(archLichdomSpell(), entity)?.sp ?? 500;

  let elixirCount = 0;
  let hasElixirRecipe = false;
  for (const item of items) {
    if (!item) continue;
    if (isElixirOfUnlifeItem(item) && (item.stackCount ?? 1) > 0) {
      elixirCount += Math.max(1, Math.trunc(Number(item.stackCount) || 1));
    }
    if (isPotionRecipe(item) && item.potionRecipeKey === ELIXIR_OF_UNLIFE_KEY) {
      hasElixirRecipe = true;
    }
  }

  const reagents = ELIXIR_OF_UNLIFE_RECIPE.ingredients.map((tplId) => {
    let count = 0;
    for (const item of items) {
      if (!item) continue;
      if (Number(item.templateIndex ?? item.itemTemplateIndex) === tplId && (item.stackCount ?? 1) > 0) {
        count += Math.max(1, Math.trunc(Number(item.stackCount) || 1));
      }
    }
    return {
      templateIndex: tplId,
      name: reagentDisplayName(tplId),
      count,
      met: count >= 1,
    };
  });
  const canBrewElixir = reagents.every((entry) => entry.met);
  const hasArchLichdomSpell = hasArchLichdomSpellRecord(spells);

  const lichReqs = [
    { id: 'grimoire', fulfilled: grimoireRead, current: grimoireRead ? 1 : 0, required: 1 },
    { id: 'noCurse', fulfilled: !conflictingCurse, current: conflictingCurse ? 0 : 1, required: 1 },
    { id: 'level', fulfilled: level >= ELIXIR_LICHDOM_LEVEL, current: level, required: ELIXIR_LICHDOM_LEVEL },
    {
      id: 'mysticism',
      fulfilled: mysticism >= ELIXIR_LICHDOM_MYSTICISM,
      current: mysticism,
      required: ELIXIR_LICHDOM_MYSTICISM,
    },
    {
      id: 'intelligence',
      fulfilled: intelligence >= ELIXIR_LICHDOM_MIN_STAT,
      current: intelligence,
      required: ELIXIR_LICHDOM_MIN_STAT,
    },
    {
      id: 'willpower',
      fulfilled: willpower >= ELIXIR_LICHDOM_MIN_STAT,
      current: willpower,
      required: ELIXIR_LICHDOM_MIN_STAT,
    },
  ];
  const lichCompleted = stage === 'lich' || stage === 'ancient_lich';
  const lichFulfilled = lichReqs.filter((req) => req.fulfilled).length;
  const lichEligible = !lichCompleted && lichFulfilled === lichReqs.length && Boolean(FORK_FLAGS.ENABLE_NECROMANCY);

  const archReqs = [
    { id: 'isLich', fulfilled: stage === 'lich' || stage === 'ancient_lich', current: lichCompleted ? 1 : 0, required: 1 },
    { id: 'level', fulfilled: level >= ARCH_LICH_MIN_LEVEL, current: level, required: ARCH_LICH_MIN_LEVEL },
    {
      id: 'mysticism',
      fulfilled: mysticism >= ARCH_LICH_MIN_MYSTICISM,
      current: mysticism,
      required: ARCH_LICH_MIN_MYSTICISM,
    },
    {
      id: 'intelligence',
      fulfilled: intelligence >= ARCH_LICH_MIN_INTELLIGENCE,
      current: intelligence,
      required: ARCH_LICH_MIN_INTELLIGENCE,
    },
    {
      id: 'willpower',
      fulfilled: willpower >= ARCH_LICH_MIN_WILLPOWER,
      current: willpower,
      required: ARCH_LICH_MIN_WILLPOWER,
    },
  ];
  const archCompleted = stage === 'ancient_lich';
  const archFulfilled = archReqs.filter((req) => req.fulfilled).length;
  const archEligible =
    !archCompleted && stage === 'lich' && archFulfilled === archReqs.length && Boolean(FORK_FLAGS.ENABLE_NECROMANCY);

  return {
    grimoireRead,
    stage,
    conflictingCurse,
    disguised,
    taint,
    taintTier,
    controlUsed,
    controlMax,
    activeMinions,
    level,
    mysticism,
    intelligence,
    willpower,
    magicka,
    maxMagicka,
    archLichCastCost,
    elixirCount,
    hasElixirRecipe,
    reagents,
    canBrewElixir,
    hasArchLichdomSpell,
    lich: {
      completed: lichCompleted,
      requirements: lichReqs,
      fulfilledCount: lichFulfilled,
      totalCount: lichReqs.length,
      eligible: lichEligible,
      canTransformNow: lichEligible && elixirCount > 0,
    },
    archlich: {
      completed: archCompleted,
      requirements: archReqs,
      fulfilledCount: archFulfilled,
      totalCount: archReqs.length,
      eligible: archEligible,
      canTransformNow: archEligible && hasArchLichdomSpell,
    },
  };
}

/** Consumes 1 of each Elixir reagent from pack and mints Potion of Elixir of Unlife. */
export function brewElixirOfUnlifeFromPack(entity = playerEntity) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { ok: false, error: t('lichdom.err.disabled', 'Necromancy is disabled in settings.') };
  }
  if (!entity || !Array.isArray(entity.items)) {
    return { ok: false, error: t('lichdom.err.missingReagents', 'Missing required reagents in your pack.') };
  }
  const progress = evaluateLichdomProgress(entity);
  if (!progress.canBrewElixir) {
    return { ok: false, error: t('lichdom.err.missingReagents', 'Missing required reagents in your pack.') };
  }
  const picked = ELIXIR_OF_UNLIFE_RECIPE.ingredients.map((tplId) =>
    findMatchingItem(entity.items, (item) => Number(item.templateIndex ?? item.itemTemplateIndex) === tplId),
  );
  if (picked.some((entry) => !entry)) {
    return { ok: false, error: t('lichdom.err.missingReagents', 'Missing required reagents in your pack.') };
  }
  for (const ing of picked) {
    consumeOneItem(entity.items, ing);
  }
  const elixirName = t('lichdom.elixir.itemName', 'Potion of Elixir of Unlife');
  const elixir = mintCondition(
    setItemFields({
      ...makePotion(ELIXIR_OF_UNLIFE_KEY),
      shortName: elixirName,
      longName: elixirName,
    }),
  );
  addItem(entity.items, elixir);
  surfacePlayer?.();
  return {
    ok: true,
    item: elixir,
    notice: t('lichdom.brew.success', 'You distil a Potion of Elixir of Unlife from the four reagents.'),
  };
}

/** Safely drinks Elixir of Unlife to ascend to Lichdom without lethal misfire if ineligible. */
export function transformToLichFromPane(entity = playerEntity, { nowMinutes = 0 } = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { ok: false, error: t('lichdom.err.disabled', 'Necromancy is disabled in settings.') };
  }
  const progress = evaluateLichdomProgress(entity);
  if (progress.stage === 'ancient_lich') {
    return {
      ok: false,
      error: t('necro.elixir.alreadyAncient', 'The Elixir of Unlife has no effect on you, you are already an Ancient Lich.'),
    };
  }
  if (progress.stage === 'lich') {
    return {
      ok: false,
      error: t(
        'necro.elixir.alreadyLich',
        'You have already ascended to Lichdom. The Elixir of Unlife has no further effect on your undead vessel.',
      ),
    };
  }
  if (!progress.grimoireRead) {
    return { ok: false, error: t('lichdom.err.noGrimoire', 'Read the Grimoire of the Worm first.') };
  }
  if (progress.conflictingCurse || (entity?.racialOverride && !isAnyLich(entity))) {
    return { ok: false, error: t('lichdom.err.conflictingCurse', 'A conflicting curse prevents Lichdom. Cure it first.') };
  }
  if (!progress.lich.eligible || !canDrinkElixirOfUnlife(entity).eligible) {
    return { ok: false, error: t('lichdom.err.lichReqs', 'Lichdom prerequisites are not yet met.') };
  }
  if (!Array.isArray(entity?.items) || progress.elixirCount <= 0) {
    return { ok: false, error: t('lichdom.err.noElixir', 'You need an Elixir of Unlife in your pack.') };
  }
  const elixirItem = findMatchingItem(entity.items, isElixirOfUnlifeItem);
  if (!elixirItem) {
    return { ok: false, error: t('lichdom.err.noElixir', 'You need an Elixir of Unlife in your pack.') };
  }
  consumeOneItem(entity.items, elixirItem);
  const res = drinkElixirOfUnlife(entity, { nowMinutes });
  if (!res?.success && !res?.lichdom) {
    addItem(
      entity.items,
      mintCondition(
        setItemFields({
          ...elixirItem,
          stackCount: 1,
        }),
      ),
    );
    return { ok: false, error: res?.reason || t('lichdom.err.ritualFailed', 'The transformation ritual could not be completed.') };
  }
  surfacePlayer?.();
  return {
    ok: true,
    notice: res.message || t('necro.lich.success', 'The mortal spark is snuffed. You rise as an immortal Lich of the Iliac Bay.'),
    res,
  };
}

/** Safely executes the Arch-Lichdom ritual without lethal backfire when ineligible. */
export function transformToArchLichFromPane(entity = playerEntity, { nowMinutes = 0 } = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) {
    return { ok: false, error: t('lichdom.err.disabled', 'Necromancy is disabled in settings.') };
  }
  const progress = evaluateLichdomProgress(entity);
  if (progress.stage === 'ancient_lich') {
    return {
      ok: false,
      error: t('spell.necro.alreadyAncientLich', 'You have already achieved Ancient Lichdom. The ritual is no longer needed.'),
    };
  }
  if (progress.stage !== 'lich') {
    return { ok: false, error: t('lichdom.err.notLich', 'You must already be a Lich to ascend to Archlich.') };
  }
  if (!progress.archlich.eligible || !canAscendToArchLichdom(entity).eligible) {
    return { ok: false, error: t('lichdom.err.archReqs', 'Archlich prerequisites are not yet met.') };
  }
  if (!progress.hasArchLichdomSpell) {
    return { ok: false, error: t('lichdom.err.noSpell', 'The Arch-Lichdom spell is not in your spellbook.') };
  }
  const res = performArchLichdomRitual(entity, { nowMinutes });
  surfacePlayer?.();
  if (!res?.success) {
    return { ok: false, error: res?.reason || t('lichdom.err.ritualFailed', 'The transformation ritual could not be completed.') };
  }
  return {
    ok: true,
    notice: t('lichdom.arch.successNotice', 'The veil of eternity tears apart. You rise as an Ancient Lich!'),
    res,
  };
}

function stageBadgeInfo(progress) {
  if (progress.stage === 'ancient_lich') {
    return { cls: 'lich-badge ascended', label: t('lichdom.badge.archlich', 'Ancient Lich') };
  }
  if (progress.stage === 'lich') {
    return {
      cls: progress.archlich.canTransformNow ? 'lich-badge ready' : 'lich-badge ascended',
      label: t('lichdom.badge.lich', 'Immortal Lich'),
    };
  }
  if (progress.conflictingCurse) {
    return { cls: 'lich-badge blocked', label: t('lichdom.badge.conflict', 'Curse Conflict') };
  }
  return {
    cls: progress.lich.canTransformNow ? 'lich-badge ready' : 'lich-badge',
    label: t('lichdom.badge.mortal', 'Initiate of the Worm'),
  };
}

function renderStatusHeader(stickyHead, progress) {
  const box = makeEl('div', 'lich-box');
  const strip = makeEl('div', 'lich-stat-strip');
  const badge = stageBadgeInfo(progress);

  const vesselCell = makeEl('div', 'lich-stat-cell');
  vesselCell.append(
    makeEl('span', 'lich-stat-label', t('lichdom.bar.vessel', 'Vessel')),
    makeEl('span', 'lich-stat-val', badge.label),
  );

  const taintCell = makeEl('div', 'lich-stat-cell');
  taintCell.append(
    makeEl('span', 'lich-stat-label', t('lichdom.bar.taint', 'Taint')),
    makeEl(
      'span',
      'lich-stat-val',
      t('lichdom.bar.taintVal', '{cur}/100 ({tier})', {
        cur: progress.taint,
        tier: taintTierLabel(progress.taintTier),
      }),
    ),
  );

  const poolCell = makeEl('div', 'lich-stat-cell');
  poolCell.append(
    makeEl('span', 'lich-stat-label', t('lichdom.bar.control', 'Control Pool')),
    makeEl(
      'span',
      'lich-stat-val',
      t('lichdom.bar.controlVal', '{used}/{max} ({count} active)', {
        used: progress.controlUsed,
        max: progress.controlMax,
        count: progress.activeMinions,
      }),
    ),
  );

  strip.append(vesselCell, taintCell, poolCell);

  if (progress.stage !== 'mortal') {
    const disguiseCell = makeEl('div', 'lich-stat-cell');
    disguiseCell.append(
      makeEl('span', 'lich-stat-label', t('lichdom.bar.disguise', 'Disguise')),
      makeEl(
        'span',
        'lich-stat-val',
        progress.disguised ? t('lichdom.bar.disguiseOn', 'Masked') : t('lichdom.bar.disguiseOff', 'Exposed'),
      ),
    );
    strip.append(disguiseCell);
  }

  box.append(strip);
  stickyHead.append(box);
}

function renderHero(detail, title, subtitle, progress) {
  const badge = stageBadgeInfo(progress);
  const hero = makeEl('div', 'lich-hero');
  const left = makeEl('div');
  left.append(makeEl('div', 'lich-hero-title', title), makeEl('div', 'lich-meta-row', subtitle));
  hero.append(left, makeEl('span', badge.cls, badge.label));
  detail.append(hero);
}

function renderBenefitCards(container, title, cards) {
  const box = makeEl('div', 'lich-box');
  box.append(makeEl('h4', null, title));
  const grid = makeEl('div', 'lich-grid');
  for (const item of cards) {
    const card = makeEl('div', `lich-card${item.active ? ' done' : ''}`);
    const head = makeEl('div', 'lich-card-head');
    head.append(makeEl('div', 'lich-card-title', item.title));
    if (item.pill) head.append(makeEl('span', `lich-pill${item.active ? ' ok' : ''}`, item.pill));
    card.append(head, makeEl('div', 'lich-card-desc', item.desc));
    grid.append(card);
  }
  box.append(grid);
  container.append(box);
}

function lichBenefitCards(isActive) {
  const touchName = shownSpellName(lichParalyzingTouchSpell());
  const disguiseName = shownSpellName(mortalDisguiseSpell());
  return [
    {
      title: t('lichdom.lich.benStatsTitle', 'Attributes & Magic'),
      desc: t(
        'lichdom.lich.benStatsDesc',
        '+25 Intelligence, +25 Willpower, -30 Personality (0 while disguised). +30 Mysticism, +20 Destruction, +20 Alteration.',
      ),
      active: isActive,
    },
    {
      title: t('lichdom.lich.benVitalsTitle', 'Vitals & Immunities'),
      desc: t(
        'lichdom.lich.benVitalsDesc',
        '+100 Max HP, +250 Max Magicka, +5 Magicka/round. Immune to Paralysis, Disease, Poison, Drowning, and survival needs.',
      ),
      active: isActive,
    },
    {
      title: t('lichdom.lich.benDefenseTitle', 'Defenses & Rebirth'),
      desc: t(
        'lichdom.lich.benDefenseDesc',
        'Immune to weapons below Silver. Arrow damage reduced by 50%. Death reconstitutes at a cemetery (+30 days).',
      ),
      active: isActive,
    },
    {
      title: t('lichdom.lich.benSpellsTitle', 'Innate Spells & Risks'),
      desc: t('lichdom.lich.benSpellsDesc', 'Grants {touch} and {disguise}. Holy ground burns, Taint locks at 100, and towns treat exposure as Treason.', {
        touch: touchName,
        disguise: disguiseName,
      }),
      active: isActive,
    },
  ];
}

function archLichBenefitCards(isActive) {
  const fingerName = shownSpellName(fingerOfDeathSpell());
  const touchName = shownSpellName(lichParalyzingTouchSpell());
  const disguiseName = shownSpellName(mortalDisguiseSpell());
  return [
    {
      title: t('lichdom.arch.benStatsTitle', 'Attributes & Magic'),
      desc: t(
        'lichdom.arch.benStatsDesc',
        '+50 INT & WIL (+25 over Lich), -60 PER (0 disguised). +60 Mysticism, +40 Destruction & Alteration.',
      ),
      active: isActive,
    },
    {
      title: t('lichdom.arch.benVitalsTitle', 'Vitals & Regen'),
      desc: t(
        'lichdom.arch.benVitalsDesc',
        '+250 Max HP (+150 over Lich), +500 Max Magicka (+250 over Lich), +15 Magicka regen/round (+10 over Lich).',
      ),
      active: isActive,
    },
    {
      title: t('lichdom.arch.benDefenseTitle', 'Upgraded Defenses'),
      desc: t(
        'lichdom.arch.benDefenseDesc',
        'Immune to weapons below Mithril. Arrow damage reduced by 80%. Retains all Lich immunities and 30-day cemetery rebirth.',
      ),
      active: isActive,
    },
    {
      title: t('lichdom.arch.benSpellsTitle', 'Innate Spells & Risks'),
      desc: t(
        'lichdom.arch.benSpellsDesc',
        'Gains {finger} (50 base SP). Keeps {touch}, {disguise}, holy ground burn, and 100 Taint.',
        {
          finger: fingerName,
          touch: touchName,
          disguise: disguiseName,
        },
      ),
      active: isActive,
    },
  ];
}

function renderOverview(detail, progress, repaint) {
  const subText =
    progress.stage === 'ancient_lich'
      ? t('lichdom.overview.subArchlich', 'You stand at the pinnacle of dark necromancy as an Ancient Lich.')
      : progress.stage === 'lich'
        ? t('lichdom.overview.subLich', 'Your soul is bound beyond death. Only Ancient Lichdom remains above you.')
        : t('lichdom.overview.subMortal', 'Transcend mortality through forbidden alchemy and ancient mysticism.');
  renderHero(detail, t('lichdom.overview.title', 'Path of Unlife'), subText, progress);

  if (progress.conflictingCurse) {
    detail.append(
      makeEl(
        'div',
        'lich-banner',
        t('lichdom.overview.conflictBanner', 'Conflicting curse active ({curse}). Cure it before attempting the Elixir of Unlife.', {
          curse: curseLabel(progress.conflictingCurse),
        }),
      ),
    );
  }

  if (progress.stage === 'ancient_lich') {
    renderBenefitCards(detail, t('lichdom.overview.activeTitle', 'Active Undead Mantle'), archLichBenefitCards(true));
  } else if (progress.stage === 'lich') {
    renderBenefitCards(detail, t('lichdom.overview.activeTitle', 'Active Undead Mantle'), lichBenefitCards(true));
  } else {
    const mortalBox = makeEl('div', 'lich-box');
    mortalBox.append(
      makeEl('h4', null, t('lichdom.overview.mortalBoxTitle', 'Initiate of the Black Worm')),
      makeEl(
        'div',
        'lich-card-desc',
        t(
          'lichdom.overview.mortalBoxDesc',
          'Reading the Grimoire of the Worm unlocked 8 dark spells, the Elixir of Unlife formula, and necromantic Spell Maker effects.',
        ),
      ),
      makeEl(
        'div',
        'lich-meta-row',
        t('lichdom.overview.mortalCapacity', 'Undead Control Pool: {used}/{max} slots (INT/20 + WIL/30 + Mysticism/25).', {
          used: progress.controlUsed,
          max: progress.controlMax,
        }),
      ),
    );
    detail.append(mortalBox);
  }

  const grid = makeEl('div', 'lich-grid');

  // Stage I card
  const s1Card = makeEl(
    'div',
    `lich-card${progress.lich.completed ? ' done' : progress.lich.canTransformNow ? ' active' : progress.conflictingCurse ? ' blocked' : ''}`,
  );
  const s1Pill = progress.lich.completed
    ? t('lichdom.pill.ascended', 'Ascended')
    : progress.lich.canTransformNow
      ? t('lichdom.pill.ready', 'Ready')
      : progress.conflictingCurse
        ? t('lichdom.pill.blocked', 'Blocked')
        : `${progress.lich.fulfilledCount}/${progress.lich.totalCount}`;
  const s1PillCls = progress.lich.completed
    ? 'lich-pill ok'
    : progress.lich.canTransformNow
      ? 'lich-pill info'
      : progress.conflictingCurse
        ? 'lich-pill bad'
        : 'lich-pill';
  const s1Head = makeEl('div', 'lich-card-head');
  s1Head.append(makeEl('div', 'lich-card-title', t('lichdom.overview.stage1Title', 'Stage I: Lichdom')), makeEl('span', s1PillCls, s1Pill));
  const s1Bar = makeEl('div', 'lich-bar-wrap');
  const s1Fill = makeEl('div', 'lich-bar-fill');
  s1Fill.style.width = `${Math.round((progress.lich.fulfilledCount / progress.lich.totalCount) * 100)}%`;
  s1Bar.append(s1Fill);
  const s1Acts = makeEl('div', 'lich-acts');
  const s1Btn = makeEl('button', `lich-btn${!progress.lich.completed ? ' primary' : ''}`, t('lichdom.overview.stage1Btn', 'Open Lichdom Path'));
  s1Btn.onclick = () => {
    activeSec = 'lich';
    repaint({ resetDetailScroll: true });
  };
  s1Acts.append(s1Btn);
  s1Card.append(
    s1Head,
    makeEl(
      'div',
      'lich-card-desc',
      t('lichdom.overview.stage1Method', 'Method: Brew and drink the Elixir of Unlife once all 6 prerequisites are met.'),
    ),
    s1Bar,
    makeEl(
      'div',
      'lich-card-prog',
      t('lichdom.overview.stage1Prog', 'Prerequisites met: {cur}/{total} · Elixirs in pack: {elixirs}', {
        cur: progress.lich.fulfilledCount,
        total: progress.lich.totalCount,
        elixirs: progress.elixirCount,
      }),
    ),
    s1Acts,
  );
  grid.append(s1Card);

  // Stage II card
  const s2Card = makeEl(
    'div',
    `lich-card${progress.archlich.completed ? ' done' : progress.archlich.canTransformNow ? ' active' : ''}`,
  );
  const s2Pill = progress.archlich.completed
    ? t('lichdom.pill.ascended', 'Ascended')
    : progress.archlich.canTransformNow
      ? t('lichdom.pill.ready', 'Ready')
      : progress.stage === 'mortal'
        ? t('lichdom.pill.locked', 'Requires Lich')
        : `${progress.archlich.fulfilledCount}/${progress.archlich.totalCount}`;
  const s2PillCls = progress.archlich.completed
    ? 'lich-pill ok'
    : progress.archlich.canTransformNow
      ? 'lich-pill info'
      : 'lich-pill';
  const s2Head = makeEl('div', 'lich-card-head');
  s2Head.append(makeEl('div', 'lich-card-title', t('lichdom.overview.stage2Title', 'Stage II: Archlich')), makeEl('span', s2PillCls, s2Pill));
  const s2Bar = makeEl('div', 'lich-bar-wrap');
  const s2Fill = makeEl('div', 'lich-bar-fill stage2');
  s2Fill.style.width = `${Math.round((progress.archlich.fulfilledCount / progress.archlich.totalCount) * 100)}%`;
  s2Bar.append(s2Fill);
  const s2Acts = makeEl('div', 'lich-acts');
  const s2Btn = makeEl(
    'button',
    `lich-btn${progress.stage === 'lich' ? ' primary' : ''}`,
    t('lichdom.overview.stage2Btn', 'Open Archlich Path'),
  );
  s2Btn.onclick = () => {
    activeSec = 'archlich';
    repaint({ resetDetailScroll: true });
  };
  s2Acts.append(s2Btn);
  s2Card.append(
    s2Head,
    makeEl(
      'div',
      'lich-card-desc',
      t('lichdom.overview.stage2Method', 'Method: Cast the Arch-Lichdom ritual spell as an active Lich.'),
    ),
    s2Bar,
    makeEl(
      'div',
      'lich-card-prog',
      t('lichdom.overview.stage2Prog', 'Prerequisites met: {cur}/{total} · Spell known: {spell}', {
        cur: progress.archlich.fulfilledCount,
        total: progress.archlich.totalCount,
        spell: progress.hasArchLichdomSpell ? t('lichdom.common.yes', 'Yes') : t('lichdom.common.no', 'No'),
      }),
    ),
    s2Acts,
  );
  grid.append(s2Card);

  detail.append(grid);
}

function requirementDisplay(req, progress, isArchStage) {
  const numProg = () => t('lichdom.req.numProg', 'Current: {cur} / Required: {req}', { cur: req.current, req: req.required });
  if (req.id === 'grimoire') {
    return {
      name: t('lichdom.req.grimoire.name', 'Grimoire of the Worm'),
      desc: t('lichdom.req.grimoire.desc', 'Read the forbidden tome dropped by Liches (25%) or Ancient Liches (50%).'),
      prog: t('lichdom.req.grimoire.prog', 'Status: {state}', {
        state: req.fulfilled ? t('lichdom.state.read', 'Read') : t('lichdom.state.unread', 'Unread'),
      }),
    };
  }
  if (req.id === 'noCurse') {
    return {
      name: t('lichdom.req.noCurse.name', 'Pure Mortal Vessel'),
      desc: t('lichdom.req.noCurse.desc', 'Must not carry Vampirism or Lycanthropy when binding your soul.'),
      prog: t('lichdom.req.grimoire.prog', 'Status: {state}', {
        state: req.fulfilled ? t('lichdom.state.clear', 'Clear') : curseLabel(progress.conflictingCurse),
      }),
      blocked: !req.fulfilled,
    };
  }
  if (req.id === 'isLich') {
    return {
      name: t('lichdom.req.isLich.name', 'Active Lich Vessel'),
      desc: t('lichdom.req.isLich.desc', 'Only an undead Lich can survive channeling the Arch-Lichdom ritual.'),
      prog: t('lichdom.req.grimoire.prog', 'Status: {state}', {
        state: req.fulfilled ? t('lichdom.state.active', 'Active') : t('lichdom.state.mortal', 'Mortal'),
      }),
    };
  }
  if (req.id === 'level') {
    return {
      name: t('lichdom.req.level.name', 'Character Level'),
      desc: isArchStage
        ? t('lichdom.req.archLevel.desc', 'Demands vast mortal and unliving experience (Level 30+).')
        : t('lichdom.req.level.desc', 'Mortal body must withstand the alchemy of undeath.'),
      prog: numProg(),
    };
  }
  if (req.id === 'mysticism') {
    return {
      name: t('lichdom.req.mysticism.name', 'Mysticism Skill'),
      desc: isArchStage
        ? t('lichdom.req.archMyst.desc', 'Requires transcendent Mysticism (200+ including Lichdom bonus).')
        : t('lichdom.req.mysticism.desc', 'Soul binding demands deep mastery over Mysticism.'),
      prog: numProg(),
    };
  }
  if (req.id === 'intelligence') {
    return {
      name: t('lichdom.req.intelligence.name', 'Intelligence'),
      desc: isArchStage
        ? t('lichdom.req.archInt.desc', 'Mind forged beyond mortal bounds (115+ including Lichdom bonus).')
        : t('lichdom.req.intelligence.desc', 'Preserves mind and memory across the threshold of death.'),
      prog: numProg(),
    };
  }
  return {
    name: t('lichdom.req.willpower.name', 'Willpower'),
    desc: isArchStage
      ? t('lichdom.req.archWil.desc', 'Indomitable spirit to hold ancient power (115+ including Lichdom bonus).')
      : t('lichdom.req.willpower.desc', 'Anchors your will against dissolution into oblivion.'),
    prog: numProg(),
  };
}

function renderRequirementsSection(detail, reqs, fulfilledCount, totalCount, progress, isArchStage) {
  const box = makeEl('div', 'lich-box');
  box.append(
    makeEl('h4', null, isArchStage ? t('lichdom.arch.reqsTitle', 'Archlich Requirements') : t('lichdom.lich.reqsTitle', 'Transformation Requirements')),
  );
  const barWrap = makeEl('div', 'lich-bar-wrap');
  const fill = makeEl('div', isArchStage ? 'lich-bar-fill stage2' : 'lich-bar-fill');
  fill.style.width = `${Math.round((fulfilledCount / totalCount) * 100)}%`;
  barWrap.append(fill);
  box.append(
    barWrap,
    makeEl(
      'div',
      'lich-meta-row',
      t('lichdom.lich.progressMeta', 'Prerequisites: {cur}/{total} fulfilled', { cur: fulfilledCount, total: totalCount }),
    ),
  );
  detail.append(box);

  const grid = makeEl('div', 'lich-grid');
  for (const req of reqs) {
    const info = requirementDisplay(req, progress, isArchStage);
    const cardCls = req.fulfilled ? 'lich-card done' : info.blocked ? 'lich-card blocked' : 'lich-card';
    const pillCls = req.fulfilled ? 'lich-pill ok' : info.blocked ? 'lich-pill bad' : 'lich-pill warn';
    const pillText = req.fulfilled
      ? t('lichdom.pill.fulfilled', 'Fulfilled')
      : info.blocked
        ? t('lichdom.pill.blocked', 'Blocked')
        : t('lichdom.pill.unfulfilled', 'Pending');
    const card = makeEl('div', cardCls);
    const head = makeEl('div', 'lich-card-head');
    head.append(makeEl('div', 'lich-card-title', info.name), makeEl('span', pillCls, pillText));
    card.append(head, makeEl('div', 'lich-card-desc', info.desc), makeEl('div', 'lich-card-prog', info.prog));
    grid.append(card);
  }
  const wrapBox = makeEl('div', 'lich-box');
  wrapBox.append(grid);
  detail.append(wrapBox);
}

function renderLichPage(detail, entity, progress, repaint) {
  renderHero(
    detail,
    t('lichdom.lich.title', 'Stage I: Ascension to Lichdom'),
    t('lichdom.lich.sub', 'Sever your mortal tether using the Elixir of Unlife.'),
    progress,
  );

  renderRequirementsSection(
    detail,
    progress.lich.requirements,
    progress.lich.fulfilledCount,
    progress.lich.totalCount,
    progress,
    false,
  );

  const methodBox = makeEl('div', 'lich-box');
  methodBox.append(
    makeEl('h4', null, t('lichdom.lich.methodTitle', 'Transformation Method: Elixir of Unlife')),
    makeEl(
      'div',
      'lich-card-desc',
      t('lichdom.lich.methodDesc', 'Distil the Elixir from 4 reagents at a Potion Maker, by using Lich Dust in your pack, or below.'),
    ),
  );

  const reagentGrid = makeEl('div', 'lich-reagent-grid');
  for (const reg of progress.reagents) {
    const rCard = makeEl('div', `lich-reagent-card${reg.met ? ' ok' : ''}`);
    const left = makeEl('div');
    left.append(
      makeEl('div', 'lich-card-title', reg.name),
      makeEl('div', 'lich-card-prog', t('lichdom.reagent.count', 'Owned: {cur} / 1', { cur: reg.count })),
    );
    const pill = makeEl(
      'span',
      reg.met ? 'lich-pill ok' : 'lich-pill warn',
      reg.met ? t('lichdom.pill.inPack', 'In Pack') : t('lichdom.pill.missing', 'Missing'),
    );
    rCard.append(left, pill);
    reagentGrid.append(rCard);
  }
  methodBox.append(reagentGrid);

  methodBox.append(
    makeEl(
      'div',
      'lich-meta-row',
      t('lichdom.lich.elixirMeta', 'Elixir of Unlife in pack: {count} · Formula known: {recipe}', {
        count: progress.elixirCount,
        recipe: progress.hasElixirRecipe ? t('lichdom.common.yes', 'Yes') : t('lichdom.common.no', 'No'),
      }),
    ),
    makeEl(
      'div',
      'lich-warn-row',
      t('lichdom.lich.warning', 'Danger: Drinking the Elixir from inventory before meeting all 6 prerequisites causes instant lethal failure.'),
    ),
  );

  const acts = makeEl('div', 'lich-acts');
  const brewBtn = makeEl('button', 'lich-btn', t('lichdom.lich.btnBrew', 'Distil Elixir of Unlife'));
  brewBtn.disabled = !progress.canBrewElixir || !FORK_FLAGS.ENABLE_NECROMANCY;
  brewBtn.onclick = () => {
    const res = brewElixirOfUnlifeFromPack(entity);
    setFeedback(res.ok ? res.notice : res.error, !res.ok);
    repaint();
  };
  acts.append(brewBtn);

  const ascBtn = makeEl(
    'button',
    `lich-btn${progress.lich.canTransformNow ? ' primary' : ''}`,
    progress.lich.completed
      ? t('lichdom.lich.btnTransformDone', 'Already Ascended')
      : t('lichdom.lich.btnTransform', 'Drink Elixir & Become Lich'),
  );
  ascBtn.disabled = progress.lich.completed || !progress.lich.canTransformNow;
  ascBtn.onclick = () => {
    const res = transformToLichFromPane(entity, { nowMinutes: safeWorldMinutes() });
    setFeedback(res.ok ? res.notice : res.error, !res.ok);
    repaint();
  };
  acts.append(ascBtn);

  if (!progress.hasElixirRecipe && progress.grimoireRead) {
    const recBtn = makeEl('button', 'lich-btn', t('lichdom.lich.btnRecoverRecipe', 'Recover Formula from Grimoire'));
    recBtn.onclick = () => {
      readNecroGrimoire(entity);
      setFeedback(t('lichdom.grimoire.recovered', 'Reviewed the Grimoire of the Worm and restored missing secrets.'), false);
      repaint();
    };
    acts.append(recBtn);
  }

  methodBox.append(acts);
  detail.append(methodBox);

  renderBenefitCards(detail, t('lichdom.lich.benefitsTitle', 'Lichdom Advantages & Weaknesses'), lichBenefitCards(progress.lich.completed));
}

function renderArchLichPage(detail, entity, progress, repaint) {
  renderHero(
    detail,
    t('lichdom.arch.title', 'Stage II: Ascension to Archlich'),
    t('lichdom.arch.sub', 'Ascend from Lich to Ancient Lich via the Arch-Lichdom ritual.'),
    progress,
  );

  renderRequirementsSection(
    detail,
    progress.archlich.requirements,
    progress.archlich.fulfilledCount,
    progress.archlich.totalCount,
    progress,
    true,
  );

  const methodBox = makeEl('div', 'lich-box');
  methodBox.append(
    makeEl('h4', null, t('lichdom.arch.methodTitle', 'Transformation Method: Arch-Lichdom Ritual')),
    makeEl(
      'div',
      'lich-card-desc',
      t(
        'lichdom.arch.methodDesc',
        'Cast the Arch-Lichdom spell (500 Magicka at 200 Mysticism) from your spellbook or perform the ritual below.',
      ),
    ),
    makeEl(
      'div',
      'lich-meta-row',
      t('lichdom.arch.spellMeta', 'Spell in book: {hasSpell} · Current Magicka: {mp}/{maxMp} · Cast Cost: {cost} SP', {
        hasSpell: progress.hasArchLichdomSpell ? t('lichdom.common.yes', 'Yes') : t('lichdom.common.no', 'No'),
        mp: progress.magicka,
        maxMp: progress.maxMagicka,
        cost: progress.archLichCastCost,
      }),
    ),
    makeEl(
      'div',
      'lich-warn-row',
      t(
        'lichdom.arch.warning',
        'Danger: Casting Arch-Lichdom prematurely kills mortals instantly and triggers cemetery reconstitution for unprepared Liches.',
      ),
    ),
  );

  const acts = makeEl('div', 'lich-acts');
  const ascBtn = makeEl(
    'button',
    `lich-btn${progress.archlich.canTransformNow ? ' primary' : ''}`,
    progress.archlich.completed
      ? t('lichdom.arch.btnTransformDone', 'Already Ancient Lich')
      : t('lichdom.arch.btnTransform', 'Perform Arch-Lichdom Ritual'),
  );
  ascBtn.disabled = progress.archlich.completed || !progress.archlich.canTransformNow;
  ascBtn.onclick = () => {
    const res = transformToArchLichFromPane(entity, { nowMinutes: safeWorldMinutes() });
    setFeedback(res.ok ? res.notice : res.error, !res.ok);
    repaint();
  };
  acts.append(ascBtn);

  if (!progress.hasArchLichdomSpell && progress.grimoireRead) {
    const inscBtn = makeEl('button', 'lich-btn', t('lichdom.arch.btnInscribe', 'Inscribe Grimoire Spells'));
    inscBtn.onclick = () => {
      readNecroGrimoire(entity);
      setFeedback(t('lichdom.grimoire.recovered', 'Reviewed the Grimoire of the Worm and restored missing secrets.'), false);
      repaint();
    };
    acts.append(inscBtn);
  }

  methodBox.append(acts);
  detail.append(methodBox);

  renderBenefitCards(
    detail,
    t('lichdom.arch.benefitsTitle', 'Archlich Advantages & Upgraded Powers'),
    archLichBenefitCards(progress.archlich.completed),
  );
}

function paint(root, { resetDetailScroll = false, entity = playerEntity } = {}) {
  const progress = evaluateLichdomProgress(entity);
  const lichRailLabel = progress.lich.completed
    ? t('lichdom.sec.lichDone', 'Stage I: Lichdom [Done]')
    : progress.lich.canTransformNow
      ? t('lichdom.sec.lichReady', 'Stage I: Lichdom [Ready]')
      : t('lichdom.sec.lich', 'Stage I: Lichdom');
  const archRailLabel = progress.archlich.completed
    ? t('lichdom.sec.archlichDone', 'Stage II: Archlich [Done]')
    : progress.archlich.canTransformNow
      ? t('lichdom.sec.archlichReady', 'Stage II: Archlich [Ready]')
      : t('lichdom.sec.archlich', 'Stage II: Archlich');
  const secs = [
    ['overview', t('lichdom.sec.overview', 'Overview')],
    ['lich', lichRailLabel],
    ['archlich', archRailLabel],
  ];
  if (!secs.some(([secId]) => secId === activeSec)) activeSec = 'overview';

  const bodyEl = root.parentElement;
  const bodyScrollTop = bodyEl?.scrollTop ?? 0;
  const railScrollTop = root.querySelector?.('.px-qrail')?.scrollTop ?? 0;
  const detailScrollTop = resetDetailScroll ? 0 : (root.querySelector?.('.px-qdetail')?.scrollTop ?? 0);

  repaintKeepingScroll(
    root,
    () => {
      root.replaceChildren();
      const wrap = makeEl('div', 'px-journal');
      const rail = makeEl('div', 'px-qrail');
      const repaint = (opts = {}) => paint(root, { ...opts, entity });

      rail.append(makeEl('div', 'lich-qrail-group-hdr', t('lichdom.group.necromancy', 'Dark Arts')));
      for (const [secId, label] of secs) {
        const btn = makeEl('button', `px-qrow${secId === activeSec ? ' on' : ''}`);
        btn.append(makeEl('span', 'px-c', '\u25c6'), document.createTextNode(label));
        btn.onclick = () => {
          activeSec = secId;
          repaint({ resetDetailScroll: true });
        };
        rail.append(btn);
      }
      wrap.append(rail);

      const mainCol = makeEl('div', 'lich-main-col');
      const stickyHead = makeEl('div', 'lich-sticky-head');
      renderStatusHeader(stickyHead, progress);
      if (statusMessage) {
        stickyHead.append(makeEl('div', `lich-notice${statusIsError ? ' err' : ''}`, statusMessage));
      }
      mainCol.append(stickyHead);

      const detail = makeEl('div', 'px-qdetail px-sys');
      detail.setAttribute?.('data-scroll-key', activeSec);
      if (activeSec === 'lich') {
        renderLichPage(detail, entity, progress, repaint);
      } else if (activeSec === 'archlich') {
        renderArchLichPage(detail, entity, progress, repaint);
      } else {
        renderOverview(detail, progress, repaint);
      }
      mainCol.append(detail);
      wrap.append(mainCol);
      root.append(wrap);
    },
    { focus: true },
  );

  const newRail = root.querySelector?.('.px-qrail');
  const newDetail = root.querySelector?.('.px-qdetail');
  if (newRail && railScrollTop) newRail.scrollTop = railScrollTop;
  if (newDetail && !resetDetailScroll && detailScrollTop) newDetail.scrollTop = detailScrollTop;
  if (bodyEl && !resetDetailScroll && bodyScrollTop) bodyEl.scrollTop = bodyScrollTop;
}

/** Draws the Lichdom Pause tab body. */
export function drawLichdomPane(body, { entity = playerEntity } = {}) {
  ensureStyle();
  const root = makeEl('div', 'lich-pane');
  body.append(root);
  paint(root, { entity });
}
