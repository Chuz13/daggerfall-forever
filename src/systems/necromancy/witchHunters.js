// @ts-check
// WITCH-HUNTERS: Holy zealots, Templars of Arkay, and purifiers of unlife.
//
// Key principles:
// 1. Holy factions hunt players with high Necromantic Taint.
// 2. Ambushes can interrupt wilderness resting or fast-travel.
// 3. Purifiers carry silver weapons, holy water, and dispel magic.

import { getPlayerTaint, TAINT_TIERS, getTaintTier } from './necroTaint.js';
import { WEAPON_MATERIALS } from '../../characters/weapons.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';

export const HUNTER_TYPES = Object.freeze({
  TEMPLAR: 'arkay_templar',
  ARCHER: 'witch_hunter_archer',
  INQUISITOR: 'holy_inquisitor',
});

/**
 * Creates an encounter party of purifiers.
 * @param {'tainted'|'defiler'|'abomination'} tier
 * @returns {Array<object>}
 */
export function generatePurifierParty(tier) {
  const party = [];

  // Leader: Templar or Inquisitor
  party.push({
    type: tier === TAINT_TIERS.ABOMINATION ? HUNTER_TYPES.INQUISITOR : HUNTER_TYPES.TEMPLAR,
    name: tier === TAINT_TIERS.ABOMINATION ? 'High Inquisitor of Arkay' : 'Templar of the Circle',
    health: tier === TAINT_TIERS.ABOMINATION ? 240 : 150,
    minMetalToHit: 0,
    weaponMaterial: WEAPON_MATERIALS.Silver,
    spells: ['Dispel Undead', 'Holy Light'],
  });

  // Escort: Witch-hunter archer
  party.push({
    type: HUNTER_TYPES.ARCHER,
    name: 'Witch-Hunter Marksman',
    health: 90,
    weaponMaterial: WEAPON_MATERIALS.Silver,
    spells: ['Cure Poison'],
  });

  // Abomination gets an extra holy knight
  if (tier === TAINT_TIERS.ABOMINATION) {
    party.push({
      type: HUNTER_TYPES.TEMPLAR,
      name: 'Knight of Arkay',
      health: 160,
      weaponMaterial: WEAPON_MATERIALS.Silver,
      spells: [],
    });
  }

  return party;
}

/**
 * Evaluates whether resting or travel is interrupted by an Arkay ambush.
 * @param {object} playerEntity
 * @param {object} [options]
 * @param {boolean} [options.isResting=true]
 * @param {() => number} [options.rolls=Math.random]
 * @returns {{ ambush: boolean, party: Array<object>, message?: string }}
 */
export function checkWitchHunterAmbush(playerEntity, { isResting = true, rolls = Math.random } = {}) {
  if (!FORK_FLAGS.ENABLE_NECROMANCY) return { ambush: false, party: [] };

  const taint = getPlayerTaint(playerEntity);
  if (taint < 40) return { ambush: false, party: [] };

  const tier = getTaintTier(playerEntity);
  // Base chance scales with taint: 40 taint = 5%, 80 taint = 25%, 100 taint = 35%
  let chance = (taint - 30) * 0.005;
  if (isResting) chance *= 1.5;

  if (rolls() < chance) {
    const party = generatePurifierParty(tier);
    return {
      ambush: true,
      party,
      message: 'Your rest is shattered! "In the name of Arkay, unholy defiler, face righteous judgment!"',
    };
  }

  return { ambush: false, party: [] };
}
