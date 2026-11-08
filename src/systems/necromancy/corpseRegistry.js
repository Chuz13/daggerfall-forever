// @ts-check
// CORPSE-REGISTRY: Lifecycle, decay, proximity search, and harvesting of
// corpses across dungeons and exterior cells.
// Designed natively for Daggerfall Forever (DFF).
//
// Key principles:
// 1. Ephemeral per-scene tracking: Prevents memory leaks by scoping
//    corpses to scene keys and cleaning up on cell unloads.
// 2. State progression by world clock (in minutes):
//    - FRESH: 0..360 min (0..6h) - optimal for zombie raising and flesh harvest.
//    - DECAYING: 360..1440 min (6..24h) - degraded zombie stats, rancid.
//    - SKELETAL: >1440 min (>24h) - bones only, usable for skeleton warriors.
//    - DESECRATED: Stripped of usable material or consumed by dark rites.

import { FORK_FLAGS } from '../../config/forkFlags.js';
import { setItemFields, templateByIndex } from '../item/itemTemplates.js';
import { addItem } from '../inventory.js';
import { t } from '../textManager.js';

export const HARVEST_BLADE_TEMPLATES = Object.freeze(new Set([
  603, // Skinning Knife
  113, 114, 116, 117, // Dagger, Tanto, Shortsword, Wakazashi
  118, 119, 120, 121, 122, 123, // Broadsword, Saber, Longsword, Katana, Claymore, Dai-Katana
  127, 128, // Battle Axe, War Axe
]));

/**
 * Checks whether an entity carries a Skinning Knife (603), dagger, sword, or axe in inventory or equipped slots.
 * @param {object} playerEntity
 * @returns {boolean}
 */
export function canHarvestCorpseWithInventory(playerEntity) {
  if (!playerEntity) return false;
  const isBlade = (it) => {
    if (!it) return false;
    const tpl = Number(it.templateIndex ?? it.itemTemplateIndex);
    if (HARVEST_BLADE_TEMPLATES.has(tpl)) return true;
    const name = String(it.name || '').toLowerCase();
    return name.includes('dagger') || name.includes('tanto') || name.includes('skinning')
      || name.includes('knife') || name.includes('sword') || name.includes('saber')
      || name.includes('katana') || name.includes('blade') || name.includes('axe');
  };

  const items = Array.isArray(playerEntity.items) ? playerEntity.items : [];
  for (const it of items) {
    if (isBlade(it)) return true;
  }
  const slots = playerEntity.equip?.slots || playerEntity.equipSlots || null;
  if (slots && typeof slots === 'object') {
    for (const it of Object.values(slots)) {
      if (isBlade(it)) return true;
    }
  }
  if (isBlade(playerEntity.weapon)) return true;
  return false;
}

export const CORPSE_STATE = Object.freeze({
  FRESH: 'fresh',
  DECAYING: 'decaying',
  SKELETAL: 'skeletal',
  DESECRATED: 'desecrated',
});

export const DECAY_THRESHOLDS = Object.freeze({
  FRESH_MINUTES: 360,      // 6 hours
  DECAYING_MINUTES: 1440,  // 24 hours
});

/** @type {Map<string, object>} */
const _corpses = new Map();

let _nextId = 1;

/**
 * Generates a unique corpse id.
 * @returns {string}
 */
function generateCorpseId() {
  return `corpse_${Date.now().toString(36)}_${_nextId++}`;
}

/**
 * Registers a newly created corpse from a slain entity.
 * @param {object} params
 * @param {string} [params.id]
 * @param {string} [params.sourceEntityId]
 * @param {string} [params.entityType] 'humanoid' | 'beast' | 'undead' | 'daedra' | 'monstrous'
 * @param {string} [params.entityName]
 * @param {[number, number, number]} params.position [x, y, z]
 * @param {string} [params.sceneKey] cell / dungeon block ID
 * @param {number} params.deathTimestamp in game minutes
 * @param {Array<object>} [params.lootItems]
 * @returns {object|null}
 */
export function registerCorpse({
  id = generateCorpseId(),
  sourceEntityId = null,
  entityType = 'humanoid',
  entityName = 'Fallen Foe',
  preferredType = null,
  corpseState = CORPSE_STATE.FRESH,
  level = 1,
  maxHealth = 0,
  position = [0, 0, 0],
  sceneKey = 'world',
  deathTimestamp = 0,
  lootItems = [],
} = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) return null;

  const resolvedLevel = Number(level) || 1;
  const resolvedMaxHealth = Number(maxHealth) > 0 ? Number(maxHealth) : Math.max(25, resolvedLevel * 20 + 15);

  const record = {
    id,
    sourceEntityId,
    entityType,
    entityName,
    preferredType,
    level: resolvedLevel,
    maxHealth: resolvedMaxHealth,
    position: [Number(position[0]) || 0, Number(position[1]) || 0, Number(position[2]) || 0],
    sceneKey,
    deathTimestamp: Number(deathTimestamp) || 0,
    corpseState,
    harvested: {
      bones: false,
      flesh: false,
      skull: false,
      organs: false,
      ectoplasm: false,
    },
    lootItems: Array.isArray(lootItems) ? lootItems : [],
    consumed: false,
  };

  _corpses.set(id, record);
  return record;
}

/**
 * Fetches a corpse by its unique ID.
 * @param {string} id
 * @returns {object|null}
 */
export function getCorpse(id) {
  if (!id) return null;
  const c = _corpses.get(id);
  if (!c || c.consumed) return null;
  return c;
}

/**
 * Calculates current corpse state based on game time elapsed.
 * @param {object} corpse
 * @param {number} currentMinutes
 * @returns {string}
 */
export function evaluateCorpseState(corpse, currentMinutes) {
  if (!corpse || corpse.consumed) return CORPSE_STATE.DESECRATED;
  if (corpse.corpseState === CORPSE_STATE.DESECRATED) return CORPSE_STATE.DESECRATED;

  const elapsed = Math.max(0, currentMinutes - (corpse.deathTimestamp ?? 0));
  if (elapsed < DECAY_THRESHOLDS.FRESH_MINUTES) {
    return CORPSE_STATE.FRESH;
  }
  if (elapsed < DECAY_THRESHOLDS.DECAYING_MINUTES) {
    return CORPSE_STATE.DECAYING;
  }
  return CORPSE_STATE.SKELETAL;
}

/**
 * Advances decay of all tracked corpses.
 * @param {number} currentMinutes
 */
export function tickCorpseDecay(currentMinutes) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) return;
  for (const corpse of _corpses.values()) {
    if (!corpse.consumed && corpse.corpseState !== CORPSE_STATE.DESECRATED) {
      corpse.corpseState = evaluateCorpseState(corpse, currentMinutes);
    }
  }
}

/**
 * Finds all active, unconsumed corpses within radius of a 3D position.
 * @param {[number, number, number]} center
 * @param {number} maxRadius
 * @param {object} [options]
 * @param {string} [options.sceneKey]
 * @param {string} [options.requiredState]
 * @returns {Array<object>}
 */
export function corpsesNear(center, maxRadius, { sceneKey = null, requiredState = null } = {}) {
  if (!center || maxRadius <= 0) return [];

  const [cx, cy, cz] = center;
  const radiusSq = maxRadius * maxRadius;
  const results = [];

  for (const c of _corpses.values()) {
    if (c.consumed) continue;
    if (sceneKey && c.sceneKey !== sceneKey) continue;
    if (requiredState && c.corpseState !== requiredState) continue;

    const [x, y, z] = c.position;
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq <= radiusSq) {
      results.push({
        corpse: c,
        distance: Math.sqrt(distSq),
      });
    }
  }

  return results.sort((a, b) => a.distance - b.distance).map((r) => r.corpse);
}

/**
 * Harvests a specific material component from a corpse.
 * @param {string|object} corpseOrId
 * @param {'bones'|'flesh'|'skull'|'organs'|'ectoplasm'} harvestPart
 * @param {object} [options]
 * @param {string} [options.tool] e.g. 'dagger'
 * @returns {{ success: boolean, itemYield: string|null, reason?: string }}
 */
export function harvestCorpse(corpseOrId, harvestPart, { tool = 'dagger' } = {}) {
  const corpse = typeof corpseOrId === 'string' ? getCorpse(corpseOrId) : (corpseOrId || getCorpse(corpseOrId?.id));
  if (!corpse) return { success: false, itemYield: null, reason: 'No corpse found' };
  if (corpse.consumed) return { success: false, itemYield: null, reason: 'Corpse already consumed' };

  if (!corpse.harvested || typeof corpse.harvested !== 'object') {
    corpse.harvested = {};
  }
  if (!corpse.corpseState) {
    corpse.corpseState = CORPSE_STATE.FRESH;
  }

  if (corpse.harvested[harvestPart]) {
    return { success: false, itemYield: null, reason: `Already harvested ${harvestPart}` };
  }

  // State checks for specific components
  if (harvestPart === 'flesh' || harvestPart === 'organs') {
    if (corpse.corpseState === CORPSE_STATE.SKELETAL) {
      return { success: false, itemYield: null, reason: 'Only bones remain' };
    }
  }

  let yieldedItem = null;
  switch (harvestPart) {
    case 'bones':
      yieldedItem = 'Bones';
      corpse.harvested.bones = true;
      break;
    case 'skull':
      yieldedItem = 'Skull';
      corpse.harvested.skull = true;
      break;
    case 'flesh':
      yieldedItem = corpse.corpseState === CORPSE_STATE.FRESH ? 'Flesh' : 'Rotten Flesh';
      corpse.harvested.flesh = true;
      break;
    case 'organs':
      yieldedItem = 'Preserved Organs';
      corpse.harvested.organs = true;
      break;
    case 'ectoplasm':
      if (corpse.entityType === 'undead' || corpse.entityType === 'daedra') {
        yieldedItem = 'Ectoplasm';
        corpse.harvested.ectoplasm = true;
      } else {
        return { success: false, itemYield: null, reason: 'Entity holds no ectoplasm' };
      }
      break;
    default:
      return { success: false, itemYield: null, reason: 'Unknown harvest part' };
  }

  // If bones, skull, and flesh are harvested, the body is completely desecrated
  if (corpse.harvested.bones && corpse.harvested.skull && corpse.harvested.flesh) {
    corpse.corpseState = CORPSE_STATE.DESECRATED;
  }

  return {
    success: true,
    itemYield: yieldedItem,
  };
}

/**
 * Harvests all available necromantic remains from a corpse into the player's inventory.
 * Requires Skinning Knife (ID 603) or any dagger/short blade in inventory.
 * @param {string|object} corpseOrId
 * @param {object} playerEntity
 * @returns {{ success: boolean, yields: string[], itemsAdded: object[], reason?: string }}
 */
export function harvestAllFromCorpse(corpseOrId, playerEntity) {
  if (!canHarvestCorpseWithInventory(playerEntity)) {
    return {
      success: false,
      yields: [],
      itemsAdded: [],
      reason: t('necro.harvest.needBlade', 'Requires a Skinning Knife or dagger in inventory.'),
    };
  }
  const corpse = typeof corpseOrId === 'string' ? getCorpse(corpseOrId) : corpseOrId;
  if (!corpse || corpse.consumed) {
    return {
      success: false,
      yields: [],
      itemsAdded: [],
      reason: t('necro.harvest.noCorpse', 'No viable corpse nearby to harvest.'),
    };
  }

  if (!corpse.harvested || typeof corpse.harvested !== 'object') {
    corpse.harvested = {};
  }
  if (!corpse.corpseState) {
    corpse.corpseState = CORPSE_STATE.FRESH;
  }

  const yields = [];
  const itemsAdded = [];
  const parts = ['bones', 'skull', 'flesh', 'ectoplasm'];
  for (const part of parts) {
    const res = harvestCorpse(corpse, /** @type {any} */ (part), { tool: 'dagger' });
    if (res.success && res.itemYield) {
      yields.push(res.itemYield);
    }
  }

  if (yields.length === 0) {
    return {
      success: false,
      yields: [],
      itemsAdded: [],
      reason: t('necro.harvest.alreadyStripped', 'This corpse has already been stripped of remains.'),
    };
  }

  playerEntity.items = playerEntity.items || [];
  const reagentTemplates = [49, 40, 39]; // Mummy Wrappings (49), Ghoul's Tongue (40), Ectoplasm (39)
  if ((corpse.level ?? 1) >= 8 || corpse.entityType === 'undead') {
    reagentTemplates.push(45, 38); // Lich Dust (45), Wraith Essence (38)
  }
  for (const tmplIdx of reagentTemplates.slice(0, Math.min(3, yields.length))) {
    const tmpl = templateByIndex(tmplIdx);
    const item = setItemFields({
      group: 'CreatureIngredients1',
      templateIndex: tmplIdx,
      currentCondition: tmpl?.hitPoints ?? 1,
      maxCondition: tmpl?.hitPoints ?? 1,
      stackCount: 1,
    });
    if (item) {
      addItem(playerEntity.items, item);
      itemsAdded.push(item);
    }
  }

  return {
    success: true,
    yields,
    harvested: yields,
    itemsAdded,
  };
}

/**
 * Consumes a corpse completely (e.g. animated into minion or detonated).
 * @param {string} corpseId
 * @returns {boolean}
 */
export function consumeCorpse(corpseId) {
  const corpse = getCorpse(corpseId);
  if (!corpse) return false;
  corpse.consumed = true;
  corpse.corpseState = CORPSE_STATE.DESECRATED;
  return true;
}

/**
 * Clears all corpses belonging to a scene key (e.g. on cell transition/dungeon exit).
 * @param {string} sceneKey
 */
export function clearSceneCorpses(sceneKey) {
  if (!sceneKey) return;
  for (const [id, c] of _corpses.entries()) {
    if (c.sceneKey === sceneKey) {
      _corpses.delete(id);
    }
  }
}

/**
 * Test helper to clear entire registry.
 */
export function _resetCorpseRegistryForTests() {
  _corpses.clear();
  _nextId = 1;
}

