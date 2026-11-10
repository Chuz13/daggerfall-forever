// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MORTAR_AND_PESTLE_TEMPLATE,
  MORTAR_AND_PESTLE_NAME,
  createMortarAndPestle,
  isMortarAndPestle,
} from '../../src/systems/mortarAndPestle.js';
import { templateByIndex } from '../../src/systems/item/itemTemplates.js';
import { useItem, USE_PENDING } from '../../src/systems/useItem.js';
import { useResultAction } from '../../src/ui/enhanced/enhancedInventory.js';
import { shopBuysItem, stockShopShelf } from '../../src/systems/shopStock.js';
import { BUILDING_TYPES } from '../../src/world/buildingNames.js';
import { potionMakerHooks, openPortablePotionMaker } from '../../src/scenes/potionMakerHost.js';
import { PotionMakerWindow } from '../../src/ui/potionMakerWindow.js';
import { shownItemName } from '../../src/systems/item/itemInfo.js';
import { t, setLocale, patchLocaleTable, loadStringTableCsv } from '../../src/systems/textManager.js';
import { readFileSync } from 'node:fs';

test('Mortar and Pestle: item definition and minting', () => {
  assert.equal(MORTAR_AND_PESTLE_TEMPLATE, 586);
  assert.equal(MORTAR_AND_PESTLE_NAME, 'Mortar and Pestle');

  const tmpl = templateByIndex(MORTAR_AND_PESTLE_TEMPLATE);
  assert.ok(tmpl, 'template 586 registered in item templates');
  assert.equal(tmpl.name, 'Mortar and Pestle');
  assert.equal(tmpl.baseWeight, 1.5);
  assert.equal(tmpl.basePrice, 120);
  assert.equal(tmpl.worldTextureArchive, 0, 'no texture archive - renders letters in enhanced inventory');
  assert.equal(tmpl.worldTextureRecord, 0);

  const item = createMortarAndPestle();
  assert.ok(isMortarAndPestle(item));
  assert.equal(item.group, 'MiscItems');
  assert.equal(item.templateIndex, MORTAR_AND_PESTLE_TEMPLATE);
  assert.equal(item.value, 120);
});

test('Mortar and Pestle: useItem returns kind potionMaker', () => {
  const item = createMortarAndPestle();
  const res = useItem(item, [item], {});
  assert.deepEqual(res, { kind: 'potionMaker', item });
});

test('Mortar and Pestle: enhanced inventory useResultAction handles potionMaker', () => {
  const item = createMortarAndPestle();
  let opened = false;
  const actWithHook = useResultAction(
    { kind: 'potionMaker', item },
    { openPotionMaker: () => { opened = true; } },
  );
  assert.equal(actWithHook.kind, 'openPotionMaker');
  assert.equal(actWithHook.closeFirst, true);

  const actWithoutHook = useResultAction({ kind: 'potionMaker', item });
  assert.equal(actWithoutHook.kind, 'message');
  assert.equal(actWithoutHook.text, USE_PENDING.potionMaker);
  assert.equal(USE_PENDING.potionMaker, 'You cannot brew potions here.');
});

test('Mortar and Pestle: shops buy and stock rules', () => {
  const item = createMortarAndPestle();

  // General Store, Alchemist, and Pawn Shop buy it
  assert.equal(shopBuysItem(BUILDING_TYPES.GeneralStore, item), true, 'General Store buys it');
  assert.equal(shopBuysItem(BUILDING_TYPES.Alchemist, item), true, 'Alchemist buys it');
  assert.equal(shopBuysItem(BUILDING_TYPES.PawnShop, item), true, 'Pawn Shop buys it');

  // Other shops do not buy it
  assert.equal(shopBuysItem(BUILDING_TYPES.WeaponSmith, item), false, 'Weapon Smith does not buy it');
  assert.equal(shopBuysItem(BUILDING_TYPES.Armorer, item), false, 'Armorer does not buy it');
  assert.equal(shopBuysItem(BUILDING_TYPES.Bookseller, item), false, 'Bookseller does not buy it');

  // Stocking: Alchemist and General Store counter shelf (shelfIndex: 0) stock it
  const alchemistShelf0 = stockShopShelf({ buildingType: BUILDING_TYPES.Alchemist, quality: 10 }, {}, { shelfIndex: 0 });
  assert.ok(alchemistShelf0.some(isMortarAndPestle), 'Alchemist shelf 0 stocks Mortar and Pestle');

  const alchemistShelf1 = stockShopShelf({ buildingType: BUILDING_TYPES.Alchemist, quality: 10 }, {}, { shelfIndex: 1 });
  assert.equal(alchemistShelf1.some(isMortarAndPestle), false, 'Alchemist shelf 1 does not duplicate it');

  const generalShelf0 = stockShopShelf({ buildingType: BUILDING_TYPES.GeneralStore, quality: 10 }, {}, { shelfIndex: 0 });
  assert.ok(generalShelf0.some(isMortarAndPestle), 'General Store shelf 0 stocks Mortar and Pestle');

  const generalShelf1 = stockShopShelf({ buildingType: BUILDING_TYPES.GeneralStore, quality: 10 }, {}, { shelfIndex: 1 });
  assert.equal(generalShelf1.some(isMortarAndPestle), false, 'General Store shelf 1 does not duplicate it');
});

test('Mortar and Pestle: portable alchemy screen has free crafting and no rank checks', () => {
  const player = { items: [], goldPieces: 0 };
  let mounted = null;
  const icons = {};

  openPortablePotionMaker({
    player,
    icons,
    mount: (win) => { mounted = win; return win; },
    PotionMakerWindow,
  });

  assert.ok(mounted instanceof PotionMakerWindow);
  // With door: () => null, hooks.brew returns null -> classic mix, no station fee, no rank check
  const brewRes = mounted.hooks.brew({ kind: 'mixed', recipe: { name: 'Healing', key: 1 } }, []);
  assert.equal(brewRes, null, 'brew returns null: 0 gold cost, 0 rank checks required');
});

test('Mortar and Pestle: localization across languages', () => {
  const item = createMortarAndPestle();

  patchLocaleTable('ru', 'Port_Strings', loadStringTableCsv(readFileSync('locales/ru/Port_Strings.csv', 'utf8')));
  patchLocaleTable('de', 'Port_Strings', loadStringTableCsv(readFileSync('locales/de/Port_Strings.csv', 'utf8')));
  patchLocaleTable('fr', 'Port_Strings', loadStringTableCsv(readFileSync('locales/fr/Port_Strings.csv', 'utf8')));

  setLocale('en');
  assert.equal(shownItemName(item), 'Mortar and Pestle');

  setLocale('ru');
  assert.equal(shownItemName(item), 'Ступка и пестик');

  setLocale('de');
  assert.equal(shownItemName(item), 'Mörser und Stößel');

  setLocale('fr');
  assert.equal(shownItemName(item), 'Mortier et pilon');

  setLocale('en');
});
