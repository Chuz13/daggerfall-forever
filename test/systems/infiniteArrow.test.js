import '../modsOff.js';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  createInfiniteArrow,
  INFINITE_ARROW_TEMPLATE,
  INFINITE_ARROW_ID,
  isInfiniteArrow,
  hasInfiniteArrow,
  STARFLIGHT,
} from '../../src/systems/infiniteArrow.js';
import {
  spendAmmoFor,
  ammoCountFor,
  isStackable,
  stacksWith,
  ARROW_TEMPLATE,
} from '../../src/systems/inventory.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { createThunderlock, createPellets, PELLET_TEMPLATE } from '../../src/systems/thunderlock.js';
import { createPistolet } from '../../src/systems/pistolet.js';
import { itemFindings, lawfulItem } from '../../src/systems/item/itemLaw.js';
import { inventoryItemImage, templateByIndex } from '../../src/systems/item/itemTemplates.js';
import { equipItem, EQUIP_SLOTS } from '../../src/systems/equip.js';
import { kitMends } from '../../src/systems/smithItems.js';
import { powerFits, powerOf } from '../../src/systems/loot/lootRarity.js';
import { imprintChoices, noteFind, _resetCodexForTests } from '../../src/systems/loot/lootCodex.js';
import { setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import { arrowCountLabel, INFINITE_ARROWS_COLOR } from '../../src/ui/hud/hud.js';
import { itemCategory, worldHeight, PI_DEFAULT_HEIGHT } from '../../src/systems/physicalItems.js';
import { rollOfflinePreApotheosisSpoils } from '../../src/systems/offlineRelicLoot.js';
import { capFoeLoot } from '../../src/systems/foeLootCap.js';
import { executeConsoleCommand } from '../../src/systems/consoleCommands.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { DUNGEON_TYPES } from '../../src/formats/mapsFile.js';
import { parseStringTableCsv } from '../../src/systems/textManager.js';
import { resetToDefaults } from '../../src/systems/settings/settings.js';

let savedSnapshot = null;

beforeEach(() => {
  resetPrefs();
  resetToDefaults();
  setPref('lootRarity', true);
  _resetCodexForTests();
  if (playerEntity) {
    savedSnapshot = {
      items: [...(playerEntity.items ?? [])],
      hasEquip: 'equip' in playerEntity,
      equip: playerEntity.equip,
      level: playerEntity.level,
    };
    playerEntity.items = [];
    delete playerEntity.equip;
    playerEntity.level = 16;
  }
});

afterEach(() => {
  if (playerEntity && savedSnapshot) {
    playerEntity.items = savedSnapshot.items;
    if (savedSnapshot.hasEquip) playerEntity.equip = savedSnapshot.equip;
    else delete playerEntity.equip;
    playerEntity.level = savedSnapshot.level;
    savedSnapshot = null;
  }
  resetPrefs();
  resetToDefaults();
});

test('1. createInfiniteArrow mints a lawful Legendary arrow with classic sprite 207/16', () => {
  const arrow = createInfiniteArrow();
  assert.equal(isInfiniteArrow(arrow), true);
  assert.equal(arrow.templateIndex, INFINITE_ARROW_TEMPLATE);
  assert.equal(arrow.group, 'Weapons');
  assert.equal(arrow.rarity, 'legendary');
  assert.equal(arrow.legendary, INFINITE_ARROW_ID);
  assert.equal(arrow.name, 'Starflight');
  assert.equal(arrow.isIdentified, true);
  assert.equal(templateByIndex(INFINITE_ARROW_TEMPLATE)?.worldTextureArchive, 207);
  assert.equal(templateByIndex(INFINITE_ARROW_TEMPLATE)?.worldTextureRecord, 16);
  assert.deepEqual(inventoryItemImage(arrow)?.archive, 207);
  assert.deepEqual(inventoryItemImage(arrow)?.record, 16);
  assert.deepEqual(itemFindings(arrow), []);
  assert.equal(lawfulItem(arrow), true);

  const unid = createInfiniteArrow({ identified: false });
  assert.equal(unid.isIdentified, false);
  assert.deepEqual(itemFindings(unid), []);
});

test('2. Bows fire infinitely with Starflight without spending regular arrows; shots are marked summoned', () => {
  const shortBow = createWeapon(129, 0);
  const longBow = createWeapon(130, 0);
  const starflight = createInfiniteArrow();

  // With 0 regular arrows
  const pack0 = [starflight];
  assert.equal(hasInfiniteArrow(pack0), true);
  assert.ok(ammoCountFor(pack0, shortBow) >= 12);
  assert.ok(ammoCountFor(pack0, longBow) >= 12);

  const shot1 = {};
  assert.equal(spendAmmoFor(pack0, shortBow, shot1), true);
  assert.equal(shot1.summoned, true);
  assert.equal(pack0.length, 1);

  const shot2 = {};
  assert.equal(spendAmmoFor(pack0, longBow, shot2), true);
  assert.equal(shot2.summoned, true);
  assert.equal(pack0.length, 1);

  // With regular arrows also in pack: regular arrows are NOT consumed
  const regular = { ...createWeapon(ARROW_TEMPLATE, 0), stackCount: 15 };
  const packWithRegular = [regular, starflight];
  const shot3 = {};
  assert.equal(spendAmmoFor(packWithRegular, longBow, shot3), true);
  assert.equal(shot3.summoned, true);
  assert.equal(regular.stackCount, 15);
  assert.equal(packWithRegular.length, 2);
});

test('3. Dwarven firearms ignore Starflight and still consume Dwemer Pellets', () => {
  const thunderlock = createThunderlock();
  const pistolet = createPistolet();
  const starflight = createInfiniteArrow();

  // 0 pellets: cannot fire even with Starflight
  const packNoPellets = [starflight];
  assert.equal(ammoCountFor(packNoPellets, thunderlock), 0);
  assert.equal(ammoCountFor(packNoPellets, pistolet), 0);
  assert.equal(spendAmmoFor(packNoPellets, thunderlock, {}), false);
  assert.equal(spendAmmoFor(packNoPellets, pistolet, {}), false);

  // With pellets: pellets decrement normally and shot.summoned is false
  const pellets = createPellets(5);
  const packWithPellets = [starflight, pellets];
  const shotGun = {};
  assert.equal(ammoCountFor(packWithPellets, thunderlock), 5);
  assert.equal(spendAmmoFor(packWithPellets, thunderlock, shotGun), true);
  assert.equal(shotGun.summoned, false);
  assert.equal(pellets.stackCount, 4);

  const shotPistol = {};
  assert.equal(spendAmmoFor(packWithPellets, pistolet, shotPistol), true);
  assert.equal(shotPistol.summoned, false);
  assert.equal(pellets.stackCount, 3);
});

test('4. HUD arrowCountLabel displays INF in Legendary orange when holding a bow with Starflight', () => {
  const shortBow = createWeapon(129, 0);
  const entity = {
    equip: { slots: { [EQUIP_SLOTS.RightHand]: shortBow } },
    items: [createInfiniteArrow()],
  };
  const label = arrowCountLabel(entity, false);
  assert.equal(label?.text, 'INF');
  assert.deepEqual([...label.color], [...INFINITE_ARROWS_COLOR]);
  assert.equal(arrowCountLabel(entity, true), null);
});

test('5. Guards: cannot equip, stack, mend, or imprint; Physical Items classifies as Arrows', () => {
  const starflight = createInfiniteArrow();
  const regular = { ...createWeapon(ARROW_TEMPLATE, 0), stackCount: 10 };
  const entity = { items: [starflight] };

  assert.equal(equipItem(entity, starflight), null);
  assert.equal(isStackable(starflight), false);
  assert.equal(stacksWith(starflight, regular), false);
  assert.equal(kitMends(0, starflight), false);
  assert.equal(kitMends(99, starflight), false);

  const rareSword = { group: 'Weapons', templateIndex: 120, rarity: 'rare', isIdentified: true };
  assert.equal(powerFits(rareSword, powerOf(STARFLIGHT.id)), false);
  noteFind(starflight, { quiet: true });
  assert.equal(imprintChoices(rareSword).some((r) => r.id === INFINITE_ARROW_ID), false);

  assert.equal(itemCategory(starflight), 'Arrows');
  assert.equal(worldHeight(starflight), PI_DEFAULT_HEIGHT.arrow);
});

test('6. Offline loot drops at Lv 10+, respects Codex deduplication, and survives capFoeLoot', () => {
  const lv6 = rollOfflinePreApotheosisSpoils(
    { source: 'foe', level: 6, mobileType: MOBILE_TYPES.Archer, titled: true },
    () => 0.0001,
  );
  assert.equal(lv6.some(isInfiniteArrow), false);

  const archer10 = rollOfflinePreApotheosisSpoils(
    { source: 'foe', level: 10, mobileType: MOBILE_TYPES.Archer },
    () => 0.0001,
  );
  const dropped = archer10.find(isInfiniteArrow);
  assert.ok(dropped, 'Lv 10 Archer drops Starflight on low roll');
  assert.equal(dropped.isIdentified, false);
  assert.deepEqual(itemFindings(dropped), []);

  const pile12 = rollOfflinePreApotheosisSpoils(
    { source: 'pile', level: 12, dungeonType: DUNGEON_TYPES.RuinedCastle },
    () => 0.0001,
  );
  assert.equal(pile12.some(isInfiniteArrow), true);

  // capFoeLoot never prunes Starflight
  const foeEntity = {
    lootCap: 2,
    items: [
      createWeapon(113, 0),
      createWeapon(114, 0),
      createWeapon(115, 0),
      createWeapon(116, 0),
      dropped,
    ],
  };
  capFoeLoot(foeEntity);
  assert.equal(foeEntity.items.some(isInfiniteArrow), true);

  // Once recorded in Codex, no duplicate drops
  noteFind(dropped, { quiet: true });
  const afterCodex = rollOfflinePreApotheosisSpoils(
    { source: 'foe', level: 16, mobileType: MOBILE_TYPES.Archer, titled: true },
    () => 0.0001,
  );
  assert.equal(afterCodex.some(isInfiniteArrow), false);
});

test('7. Console commands grant Starflight and record it in Codex', async () => {
  const r1 = await executeConsoleCommand('give_infinite_arrow', []);
  assert.match(r1, /Starflight.*564/i);
  assert.equal(playerEntity.items.filter(isInfiniteArrow).length, 1);

  playerEntity.items = [];
  const r2 = await executeConsoleCommand('relic', ['arrow']);
  assert.match(r2, /Starflight.*564/i);
  assert.equal(playerEntity.items.filter(isInfiniteArrow).length, 1);

  playerEntity.items = [];
  const r3 = await executeConsoleCommand('additem', ['564']);
  assert.match(r3, /Starflight.*564/i);
  assert.equal(playerEntity.items.filter(isInfiniteArrow).length, 1);

  playerEntity.items = [];
  const r4 = await executeConsoleCommand('additem', ['starflight']);
  assert.match(r4, /Starflight.*564/i);
  assert.equal(playerEntity.items.filter(isInfiniteArrow).length, 1);
});

test('8. All 26 locales have Port_Strings.csv entries for Starflight', () => {
  const keys = [
    'item.starflight.name',
    'item.starflight.powerName',
    'item.starflight.powerBrief',
    'item.starflight.powerText',
    'item.starflight.lore',
    'codex.legendary.starflightOffline',
  ];
  const localesDir = join(process.cwd(), 'locales');
  const dirs = readdirSync(localesDir).sort();
  assert.equal(dirs.length, 26);
  for (const lang of dirs) {
    const raw = readFileSync(join(localesDir, lang, 'Port_Strings.csv'), 'utf8');
    const map = new Map(parseStringTableCsv(raw));
    for (const k of keys) {
      assert.ok(map.get(k)?.length > 0, `${lang} missing ${k}`);
    }
  }
});
