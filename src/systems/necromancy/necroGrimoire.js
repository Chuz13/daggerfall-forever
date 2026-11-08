// @ts-check
// NECRO-GRIMOIRE: The Grimoire of the Worm (Necronomicon equivalent in TES lore).
// A forbidden tome inscribed by the Order of the Black Worm.
// Reading unlocks the dark arts in the Spell Maker and grants all 4 necromantic spells.
// Drops from Liches (25%) and Ancient Liches (50%).

import { registerCustomTemplates, mintCondition, setItemFields, registerItemUseHandler } from '../item/itemTemplates.js';
import { registerEnemyLootExtra } from '../loot/loot.js';
import { enemyLootSpawned } from '../../characters/enemy/enemyEntity.js';
import { ENEMY_BASICS } from '../../characters/enemy/enemyBasics.js';
import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import { playerEntity, surfacePlayer } from '../../characters/playerEntity.js';
import { animateDeadSpell, corpseExplosionSpell, lifeTapSpell, boneArmorSpell } from './necromanticSpells.js';

export const NECRO_GRIMOIRE_TEMPLATE = 585;
export const NECRO_GRIMOIRE_NAME = 'Grimoire of the Worm';

export const NECRO_GRIMOIRE_ROW = Object.freeze({
  index: NECRO_GRIMOIRE_TEMPLATE,
  name: NECRO_GRIMOIRE_NAME,
  baseWeight: 2.0,
  hitPoints: 100,
  basePrice: 5000,
  rarity: 10,
  worldTextureArchive: 209,
  worldTextureRecord: 0,
  playerTextureArchive: 209,
  playerTextureRecord: 0,
  bound: false,
  stackable: false,
});
registerCustomTemplates([NECRO_GRIMOIRE_ROW]);

/**
 * Mints a new Grimoire of the Worm item record.
 * @returns {object}
 */
export function mintNecroGrimoire() {
  return mintCondition(
    setItemFields({
      group: 'MiscItems',
      templateIndex: NECRO_GRIMOIRE_TEMPLATE,
      shortName: NECRO_GRIMOIRE_NAME,
      longName: NECRO_GRIMOIRE_NAME,
      value: 5000,
    }),
  );
}

export const isNecroGrimoire = (item) => item?.templateIndex === NECRO_GRIMOIRE_TEMPLATE;

/**
 * Returns all ready-made necromancy spell records with the 'некро' tag.
 * @returns {Array<object>}
 */
export function getAllNecroSpells() {
  return [
    animateDeadSpell(),
    corpseExplosionSpell(),
    lifeTapSpell(),
    boneArmorSpell(),
  ];
}

/**
 * Reads the Grimoire of the Worm.
 * - Sets the persistent NecroGrimoireRead flag on playerEntity.
 * - Grants all 4 necromantic spells to the player's spellbook.
 * - Unlocks necromancy spell effects in the Spell Maker.
 * @param {object} [entity]
 * @returns {{ kind: string, text: string, grimoireRead: boolean, addedSpells: number }}
 */
export function readNecroGrimoire(entity = null) {
  const target = entity ?? playerEntity;
  if (!target) return { kind: 'text', text: 'You cannot comprehend the dark script.', grimoireRead: false, addedSpells: 0 };

  const wasRead = !!(target.NecroGrimoireRead || target.necroGrimoireRead);
  target.NecroGrimoireRead = true;
  target.necroGrimoireRead = true;

  if (!Array.isArray(target.spells)) {
    target.spells = [];
  }

  const spellsToGrant = getAllNecroSpells();
  let addedCount = 0;
  for (const sp of spellsToGrant) {
    const alreadyHas = target.spells.some(
      (s) => s?.name === sp.name || (s?.index != null && sp?.index != null && s.index === sp.index),
    );
    if (!alreadyHas) {
      target.spells.push(sp);
      addedCount++;
    }
  }

  surfacePlayer?.();

  const text = wasRead
    ? (addedCount > 0
        ? `You review the forbidden runes of the Grimoire of the Worm, inscribing ${addedCount} missing necromantic spell(s) into your spellbook.`
        : 'You have already deciphered the eldritch rites within the Grimoire of the Worm. Its dark secrets remain etched upon your mind.')
    : 'You break the black wax seal and study the Grimoire of the Worm. Forbidden rites of undeath flood your consciousness! All necromantic spells have been inscribed into your spellbook, and their creation is now unlocked at the Spell Maker.';

  return {
    kind: 'text',
    text,
    grimoireRead: true,
    addedSpells: addedCount,
  };
}

// Register as a usable item handler
registerItemUseHandler(NECRO_GRIMOIRE_TEMPLATE, (_item, _collection, { entity } = {}) => {
  return readNecroGrimoire(entity);
});

// Loot table drop rates
export const LICH_GRIMOIRE_DROP_CHANCE = 0.25;
export const ANCIENT_LICH_GRIMOIRE_DROP_CHANCE = 0.50;

/**
 * Rolls for a Grimoire of the Worm drop for Liches and Ancient Liches.
 * @param {Array<object>} items
 * @param {number} mobileType
 * @param {() => number} [rolls]
 * @returns {boolean}
 */
export function rollLichGrimoire(items, mobileType, rolls = Math.random) {
  if (!Array.isArray(items)) return false;
  if (mobileType !== MOBILE_TYPES.Lich && mobileType !== MOBILE_TYPES.AncientLich) return false;
  const chance = mobileType === MOBILE_TYPES.AncientLich ? ANCIENT_LICH_GRIMOIRE_DROP_CHANCE : LICH_GRIMOIRE_DROP_CHANCE;
  if (rolls() < chance) {
    if (!items.some(isNecroGrimoire)) {
      items.push(mintNecroGrimoire());
      return true;
    }
  }
  return false;
}

// 1. Hook via enemy loot extra
registerEnemyLootExtra('necro-grimoire', ({ items, basics, rolls = Math.random }) => {
  if (!items || !basics) return;
  const isLich = basics === ENEMY_BASICS[MOBILE_TYPES.Lich] || basics.mobileType === MOBILE_TYPES.Lich || basics.maleTexture === 287;
  const isAncient = basics === ENEMY_BASICS[MOBILE_TYPES.AncientLich] || basics.mobileType === MOBILE_TYPES.AncientLich || basics.maleTexture === 288;
  if (!isLich && !isAncient) return;
  const mobType = isAncient ? MOBILE_TYPES.AncientLich : MOBILE_TYPES.Lich;
  rollLichGrimoire(items, mobType, rolls);
});

// 2. Hook via enemyLootSpawned event
enemyLootSpawned.add(({ mobileType, items, rolls = Math.random }) => {
  if (mobileType === MOBILE_TYPES.Lich || mobileType === MOBILE_TYPES.AncientLich) {
    rollLichGrimoire(items, mobileType, rolls);
  }
});
