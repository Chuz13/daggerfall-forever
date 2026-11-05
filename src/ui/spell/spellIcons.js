// U42-i: THE SPELL ICON COLLECTION - SpellIconCollection.cs (MIT,
// Daggerfall Workshop), the classic half. Three sheets of ARENA2 art
// nothing in the port has drawn yet:
//
// - ICON00I0.IMG is "a 320x64 atlas of 69 textures" (the C# file's
//   own header): 20 icons per row, so each is atlas.width / 20 = 16
//   square. A spell record's `icon` byte indexes it (:394-437).
// - MASK04I0.IMG is a 40x80 sheet carrying BOTH the five target
//   icons (24x16, stacked down the left) and the five element icons
//   (16x16, stacked down the right at x=24) (:439-476).
//
// The order is DFU's own enum order in both cases: target is
// CasterOnly, ByTouch, SingleTargetAtRange, AreaAroundCaster,
// AreaAtRange (:162-190) and element is Fire, Cold, Poison, Shock,
// Magic (:192-220) - which is also the classic rangeType and element
// byte order the SPELLS.STD record stores, so a record indexes both
// sheets directly.
//
// NOT PORTED: the icon PACKS. DFU scans Resources/SpellIcons for
// mod-supplied atlases and falls back to the classic one when a
// pack key is missing or unknown (:120-146); the port has no mod
// system (Ledger C, Not planned), so every icon is the classic one
// and a record's pack key would have nowhere to resolve.
//
// The sheets are cut at DRAW time rather than sliced into 79
// textures: drawImgCrop maps a source rect straight onto a
// destination rect, so one upload serves every icon.

import { loadImg, drawImgCrop } from '../native/nativePanel.js';
// ONE HOME: SpellIconCollection.SpellIconCount is already declared in
// systems/spell/spellMaker.js, where S1's SetIcon wrap reads it. This is
// the same DFU member, so it is imported and re-exported rather than
// written a second time.
import {
  CLASSIC_SPELL_ICON_COUNT,
  EXTRA_SPELL_ICON_COUNT,
  SPELL_ICON_COUNT,
} from '../../systems/spell/spellMaker.js';
import { localizedStrings } from '../../systems/textManager.js'; // L10N3d: DFU's Internal_Strings, read in the player's language
import { APP_ROOT } from '../../systems/appRoot.js';

/** classicSpellIconsRowCount / classicSpellIconsCount (:36-37). */
export const SPELL_ICON_ROW_COUNT = 20;
export const EXTRA_SPELL_ICON_ROW_COUNT = 20;
export { CLASSIC_SPELL_ICON_COUNT, EXTRA_SPELL_ICON_COUNT, SPELL_ICON_COUNT };
/** spellTargetIconsCount / spellElementIconsCount (:38-39) and the
 *  three sizes LoadClassicSpellTargetAndElementIcons reads with
 *  (:443-445) over the 40x80 sheet (:40). */
export const TARGET_ICON_COUNT = 5;
export const ELEMENT_ICON_COUNT = 5;
export const TARGET_ICON_W = 24;
export const ELEMENT_ICON_W = 16;
export const ICON_H = 16;
export const MASK_SHEET = Object.freeze({ w: 40, h: 80 });

let _art = null;

export async function loadExtraSpellIcons(deps) {
  if (!deps?.renderer || typeof fetch === 'undefined') return null;
  try {
    const root = APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/';
    const url = new URL('art/spell-icons-eleazzaar.png', root).href;
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const [{ toScreenOrder }, { decodePng }] = await Promise.all([
      import('../../formats/color32Order.js'),
      import('../../systems/textureReplacement.js'),
    ]);
    const decoded = await decodePng(bytes);
    const px = toScreenOrder(decoded);
    const tex = deps.renderer.uploadTexture('img', 'spell-icons-eleazzaar', px, { alpha: true });
    return { tex, w: decoded.width, h: decoded.height };
  } catch (e) {
    console.warn('[spellbook] extra spell icons unavailable:', e?.message ?? e);
    return null;
  }
}

/** Both classic sheets, plus extra atlas, uploaded once. Missing art leaves the collection
 *  empty rather than throwing - a window without icons still draws
 *  its list, which is how the HUD's own art gate behaves. */
export async function preloadSpellIcons(deps) {
  if (_art) return _art;
  const [icons, mask, extra] = await Promise.all([
    loadImg(deps, 'ICON00I0.IMG'),
    loadImg(deps, 'MASK04I0.IMG'),
    loadExtraSpellIcons(deps).catch(() => null),
  ]);
  _art = { icons, mask, extra };
  return _art;
}
export const spellIconsLoaded = () => !!_art;
export function _setSpellIconsForTests(art) {
  _art = art;
}

/** The square dimension of one icon, derived from the atlas width
 *  exactly as LoadClassicSpellIcons does (:408-409) rather than
 *  assumed - a replacement atlas is allowed to be bigger. */
export const spellIconDim = () => (_art ? Math.trunc(_art.icons.w / SPELL_ICON_ROW_COUNT) : ICON_H);

export function extraSpellIconRect(extraIndex) {
  const i = extraIndex | 0;
  if (i < 0 || i >= EXTRA_SPELL_ICON_COUNT) return null;
  const dim = _art?.extra ? Math.trunc(_art.extra.w / EXTRA_SPELL_ICON_ROW_COUNT) : ICON_H;
  return [(i % EXTRA_SPELL_ICON_ROW_COUNT) * dim, Math.trunc(i / EXTRA_SPELL_ICON_ROW_COUNT) * dim, dim, dim];
}

/** The source rect of spell icon `index` on ICON00I0 (or the extra atlas), TOP-DOWN, or
 *  NULL when the index is off the sheet. */
export function spellIconRect(index) {
  const i = index | 0;
  if (i < 0 || i >= SPELL_ICON_COUNT) return null;
  if (i < CLASSIC_SPELL_ICON_COUNT) {
    const dim = spellIconDim();
    return [(i % SPELL_ICON_ROW_COUNT) * dim, Math.trunc(i / SPELL_ICON_ROW_COUNT) * dim, dim, dim];
  }
  return extraSpellIconRect(i - CLASSIC_SPELL_ICON_COUNT);
}

/** The five target icons stack down the LEFT of MASK04I0 (:459-465). */
export function targetIconRect(targetType) {
  const i = Math.max(0, Math.min(TARGET_ICON_COUNT - 1, targetType | 0));
  return [0, i * ICON_H, TARGET_ICON_W, ICON_H];
}

/** The five element icons stack down the RIGHT, past the target
 *  column (:467-474). */
export function elementIconRect(elementType) {
  const i = Math.max(0, Math.min(ELEMENT_ICON_COUNT - 1, elementType | 0));
  return [TARGET_ICON_W, i * ICON_H, ELEMENT_ICON_W, ICON_H];
}

/** Draw one spell icon into a virtual rect. The window stretches it
 *  to the panel it owns (BackgroundLayout.StretchToFill), so the
 *  destination size is the caller's. */
export function drawSpellIcon(renderer, m, index, dst) {
  const i = index | 0;
  if (!_art) return false;
  if (i >= 0 && i < CLASSIC_SPELL_ICON_COUNT) {
    const src = spellIconRect(i);
    if (!src) return false;
    drawImgCrop(renderer, _art.icons, m, src, dst);
    return true;
  }
  if (i >= CLASSIC_SPELL_ICON_COUNT && i < SPELL_ICON_COUNT) {
    const sheet = _art.extra ?? _art.icons;
    const src = extraSpellIconRect(i - CLASSIC_SPELL_ICON_COUNT);
    if (!src) return false;
    drawImgCrop(renderer, sheet, m, src, dst);
    return true;
  }
  return false;
}

export function drawTargetIcon(renderer, m, targetType, dst) {
  if (!_art) return false;
  drawImgCrop(renderer, _art.mask, m, targetIconRect(targetType), dst);
  return true;
}

export function drawElementIcon(renderer, m, elementType, dst) {
  if (!_art) return false;
  drawImgCrop(renderer, _art.mask, m, elementIconRect(elementType), dst);
  return true;
}

/** DaggerfallSpellBookWindow's GetTargetTypeDescription (:578-595)
 *  and GetElementDescription (:597-614) - the tooltip strings, in
 *  enum order, VERBATIM from DFU's own en table (StreamingAssets/
 *  Text/Master Localization CSV Files/Internal_Strings.csv :940-949).
 *  U42 first shipped these Title-Cased with a hyphen in the elements;
 *  DFU's are neither. L10N3d: DFU's keys, in enum order, each entry
 *  read in the player's language when the tooltip reads it. */
const TARGET_TEXT = localizedStrings({
  casterOnly: 'Caster only',
  byTouch: 'By touch',
  singleTargetAtRange: 'Single target at range',
  areaAroundCaster: 'Area around caster',
  areaAtRange: 'Area at range',
});
const ELEMENT_TEXT = localizedStrings({
  fireBased: 'Fire based',
  coldBased: 'Cold based',
  poisonBased: 'Poison based',
  shockBased: 'Shock based',
  magicBased: 'Magic based',
});
/** A DFU-keyed table as a frozen list in its key order, each entry read when it is read. */
const inEnumOrder = (table) =>
  Object.freeze(
    Object.keys(table).reduce(
      (list, key, i) => Object.defineProperty(list, i, { enumerable: true, get: () => table[key] }),
      [],
    ),
  );
export const TARGET_DESCRIPTIONS = inEnumOrder(TARGET_TEXT);
export const ELEMENT_DESCRIPTIONS = inEnumOrder(ELEMENT_TEXT);
