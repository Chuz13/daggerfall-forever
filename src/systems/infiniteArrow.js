// @ts-check
/**
 * Starflight — the legendary infinite magic arrow (template 564).
 *
 * While carried in the player's inventory, Short Bows and Long Bows fire
 * without consuming arrows. Dwarven firearms (Thunderlock, Pistolet) are
 * unaffected and still spend Dwemer Pellets.
 */

import {
  registerCustomTemplates,
  mintCondition,
  setItemFields,
  registerAmmunition,
  registerTemplateLore,
} from './item/itemTemplates.js';
import { registerLegendary, applyRarity } from './loot/lootRarity.js';
import { ENCHANTMENT_TYPES as T } from '../formats/magicDef.js';
import { t } from './textManager.js';
import {
  INFINITE_ARROW_TEMPLATE,
  INFINITE_ARROW_ID,
  isInfiniteArrow,
  hasInfiniteArrow,
} from '../characters/infiniteArrowIds.js';

export { INFINITE_ARROW_TEMPLATE, INFINITE_ARROW_ID, isInfiniteArrow, hasInfiniteArrow };

export const INFINITE_ARROW_ROW = Object.freeze({
  index: INFINITE_ARROW_TEMPLATE,
  name: 'Starflight',
  baseWeight: 0.25,
  hitPoints: 1,
  basePrice: 2500,
  enchantmentPoints: 150,
  rarity: 20,
  drawOrderOrEffect: 0,
  isBluntWeapon: false,
  isOneHanded: false,
  isNotRepairable: true,
  hasNoEncumbrance: true,
  stackable: false,
  worldTextureArchive: 207,
  worldTextureRecord: 16,
  playerTextureArchive: 0,
  playerTextureRecord: 0,
});

registerCustomTemplates([INFINITE_ARROW_ROW]);
registerAmmunition(INFINITE_ARROW_TEMPLATE);
registerTemplateLore(
  INFINITE_ARROW_TEMPLATE,
  'Fletched with aetherial light. While carried in your pack, your bows fire endlessly without spending a single arrow.',
);

export const STARFLIGHT = Object.freeze({
  id: INFINITE_ARROW_ID,
  name: 'Starflight',
  group: 'Weapons',
  templates: Object.freeze([INFINITE_ARROW_TEMPLATE]),
  exclusive: true,
  unrolled: true,
  affixes: Object.freeze([]),
  enchantment: Object.freeze({ type: T.ImprovesTalents, param: 1 }),
  get lore() {
    return t(
      'item.starflight.lore',
      'Fletched with aetherial light. While carried in your pack, your bows fire endlessly without spending a single arrow.',
    );
  },
  power: Object.freeze({
    kind: 'infiniteArrow',
    get name() {
      return t('item.starflight.powerName', 'Endless Quiver');
    },
    get brief() {
      return t('item.starflight.powerBrief', 'Bows spend no arrows (in pack)');
    },
    get text() {
      return t(
        'item.starflight.powerText',
        'While carried in your inventory, Short Bows and Long Bows fire without consuming arrows. Has no effect on Dwarven firearms.',
      );
    },
  }),
  get hint() {
    return t(
      'codex.legendary.starflightOffline',
      'Rare trophy from bosses, archers, and dungeon hoards (Lv 10+).',
    );
  },
});

registerLegendary(STARFLIGHT);

/**
 * Mint a canonical Starflight legendary infinite arrow.
 * @param {{ identified?: boolean, rolls?: () => number }} [opts]
 */
export function createInfiniteArrow({ identified = true, rolls = Math.random } = {}) {
  const item = mintCondition(
    setItemFields({
      group: 'Weapons',
      templateIndex: INFINITE_ARROW_TEMPLATE,
      material: 0,
      flags: 0,
      variant: 0,
      message: 0,
      stackCount: 1,
    }),
  );
  applyRarity(item, 'legendary', rolls, [STARFLIGHT]);
  item.isIdentified = !!identified;
  return item;
}
