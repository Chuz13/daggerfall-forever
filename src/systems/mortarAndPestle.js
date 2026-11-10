// @ts-check
import {
  registerCustomTemplates,
  registerCustomItemGroup,
  setItemFields,
  mintCondition,
  registerItemUseHandler,
} from './item/itemTemplates.js';
import { t } from './textManager.js';

export const MORTAR_AND_PESTLE_TEMPLATE = 586;
export const MORTAR_AND_PESTLE_NAME = 'Mortar and Pestle';
export const mortarAndPestleName = () => t('item.mortarAndPestle', 'Mortar and Pestle');


export const MORTAR_AND_PESTLE_ROW = Object.freeze({
  index: MORTAR_AND_PESTLE_TEMPLATE,
  name: MORTAR_AND_PESTLE_NAME,
  baseWeight: 1.5,
  hitPoints: 100,
  basePrice: 120,
  rarity: 5,
  worldTextureArchive: 0,
  worldTextureRecord: 0,
  playerTextureArchive: 0,
  playerTextureRecord: 0,
  stackable: false,
});
registerCustomTemplates([MORTAR_AND_PESTLE_ROW]);
registerCustomItemGroup(MORTAR_AND_PESTLE_TEMPLATE, 'MiscItems');

/**
 * Mints a new Mortar and Pestle item record.
 * @returns {object}
 */
export function createMortarAndPestle() {
  return mintCondition(
    setItemFields({
      group: 'MiscItems',
      templateIndex: MORTAR_AND_PESTLE_TEMPLATE,
      shortName: MORTAR_AND_PESTLE_NAME,
      longName: MORTAR_AND_PESTLE_NAME,
      value: 120,
    }),
  );
}

export const isMortarAndPestle = (item) => item?.templateIndex === MORTAR_AND_PESTLE_TEMPLATE;

// Register as a usable item handler
registerItemUseHandler(MORTAR_AND_PESTLE_TEMPLATE, (item) => {
  return { kind: 'potionMaker', item };
});
