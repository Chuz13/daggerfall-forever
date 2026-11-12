// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// REPUTATION CONSEQUENCES FRAMEWORK (Living Tamriel)
//
// Translates canonical DFF/DFU reputation channels into concrete, observable
// gameplay consequences across Tamriel:
//  1. Trade & Commerce: merchant discounts/surcharges, black market fencing.
//  2. Real Estate & Shipyards: municipal bans on house sales and ship building.
//  3. Guild & Temple Services: excommunication, refusal of cures, soul gem tiers.
//  4. Law & Checkpoints: baggage searches, contraband confiscation, court bias.
//  5. Faction Retribution & Encounters: nemesis hit squads and allied escorts.
//  6. Word of Mouth: emergent town rumors reflecting heroic or infamous deeds.
//
// ZERO SHADOW STATE: Operates purely over canonical entity stores:
//  - playerEntity.factionRep.dict (FACTION.TXT)
//  - playerEntity.sGroupReputations[11] (SOCIAL_GROUPS)
//  - playerEntity.legalRep[region] (Regional court law)
// ═══════════════════════════════════════════════════════════════════════════════

import { LivingTamrielConfig, PRESENCE } from './livingConfig.js';
import { SOCIAL_GROUPS, FACTION_TYPES, GUILD_GROUPS } from '../../formats/factionFile.js';
import { THE_THIEVES_GUILD, THE_DARK_BROTHERHOOD, GENERIC_TEMPLE, GENERIC_KNIGHTLY_ORDER, getReputation } from '../faction/factionRep.js';
import { MERCHANTS_FACTION_ID } from '../guild/guilds.js';
import { legalRepOf } from '../court.js';
import { isStolen, clearStolen } from '../stolenGoods.js';
import { t } from '../textManager.js';

/** SoulPts threshold separating ordinary soul vessels from high-tier / Daedric entities. */
export const RARE_SOUL_PTS_THRESHOLD = 250;

/** Faction IDs for major guild networks. */
export const MAGES_GUILD_FACTION_ID = 40;
export const FIGHTERS_GUILD_FACTION_ID = 107;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Returns the effective tier multiplier for reputation scaling (0..1.5).
 * Tier 0 (OFF) -> 0
 * Tier 1 (LIGHT) -> 0.5
 * Tier 2 (MID) -> 1.0
 * Tier 3 (HIGH) -> 1.5
 * @returns {number}
 */
function getTierScale() {
  const tier = Number(LivingTamrielConfig.reputationConsequences);
  if (tier <= PRESENCE.OFF) return 0;
  if (tier === PRESENCE.LIGHT) return 0.5;
  if (tier === PRESENCE.MID) return 1.0;
  return 1.5;
}

/**
 * Reads a player's social group reputation by index (0..10), defaulting to 0.
 * @param {any} playerEntity
 * @param {number} sgroup
 * @returns {number}
 */
export function getSocialRep(playerEntity, sgroup) {
  if (!playerEntity || !Array.isArray(playerEntity.sGroupReputations)) return 0;
  const val = playerEntity.sGroupReputations[sgroup];
  return Number.isFinite(val) ? val : 0;
}

/**
 * Reads a player's faction reputation by faction ID, defaulting to 0.
 * @param {any} playerEntity
 * @param {number} factionId
 * @returns {number}
 */
export function getFactionStanding(playerEntity, factionId) {
  if (!playerEntity?.factionRep) return 0;
  try {
    return getReputation(playerEntity.factionRep, factionId) || 0;
  } catch {
    return 0;
  }
}

/**
 * Resolves buy and sell price modifiers based on merchant and underworld social standings.
 * @param {any} playerEntity
 * @param {number} [shopQuality=10]
 * @returns {{ buyMult: number, sellMult: number, fenceBonus: number }}
 */
export function getReputationPriceModifier(playerEntity, shopQuality = 10) {
  const neutral = { buyMult: 1.0, sellMult: 1.0, fenceBonus: 0 };
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return neutral;

  const mercRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Merchants);
  const underworldRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Underworld);

  // Buy price: -0.2% per positive point, +0.2% per negative point, scaled by tier
  // At +50 (MID tier): -10% buy price. At -50: +10% buy price.
  const buyShift = clamp(-mercRep * 0.002 * scale, -0.25, 0.25);
  const buyMult = Number.isFinite(buyShift) ? clamp(1.0 + buyShift, 0.75, 1.25) : 1.0;

  // Sell price: +0.15% per positive point, -0.15% per negative point
  const sellShift = clamp(mercRep * 0.0015 * scale, -0.20, 0.20);
  const sellMult = Number.isFinite(sellShift) ? clamp(1.0 + sellShift, 0.80, 1.20) : 1.0;

  // Underworld fence bonus for stolen goods (+0.6% per point up to +30% at +50)
  const fenceBonus = underworldRep > 0 ? clamp(underworldRep * 0.006 * scale, 0, 0.40) : 0;

  return { buyMult, sellMult, fenceBonus };
}

/**
 * Evaluates whether local authorities and nobility refuse to sell property to the player.
 * @param {any} playerEntity
 * @returns {{ refused: boolean, reasonKey: string|null, discountMult: number }}
 */
export function evaluateHousePurchaseReputation(playerEntity) {
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return { refused: false, reasonKey: null, discountMult: 1.0 };

  const nobleRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Nobility);
  if (nobleRep <= -20) {
    return {
      refused: true,
      reasonKey: 'rcfHouseRefusal',
      discountMult: 1.0,
    };
  }

  // High noble standing awards a 15% cadastral discount
  const discountMult = nobleRep >= 30 ? 0.85 : 1.0;
  return { refused: false, reasonKey: null, discountMult };
}

/**
 * Evaluates whether port shipyards refuse to sell ships or offer shipwright services.
 * @param {any} playerEntity
 * @returns {{ refused: boolean, reasonKey: string|null, discountMult: number }}
 */
export function evaluateShipyardReputation(playerEntity) {
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return { refused: false, reasonKey: null, discountMult: 1.0 };

  const mercRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Merchants);
  if (mercRep <= -30) {
    return {
      refused: true,
      reasonKey: 'rcfShipyardRefusal',
      discountMult: 1.0,
    };
  }

  const discountMult = mercRep >= 40 ? 0.88 : 1.0;
  return { refused: false, reasonKey: null, discountMult };
}

/**
 * Evaluates accessibility and price modifier for Temple services (healing, cures, donations).
 * @param {any} playerEntity
 * @param {number} [templeFactionId=GENERIC_TEMPLE]
 * @returns {{ accessible: boolean, priceMult: number, reasonKey: string|null }}
 */
export function getTempleServiceAccessibility(playerEntity, templeFactionId = GENERIC_TEMPLE) {
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return { accessible: true, priceMult: 1.0, reasonKey: null };

  const rep = getFactionStanding(playerEntity, templeFactionId);
  const genericRep = getFactionStanding(playerEntity, GENERIC_TEMPLE);
  const effectiveRep = Math.min(rep, genericRep);

  if (effectiveRep <= -20) {
    return { accessible: false, priceMult: 1.0, reasonKey: 'rcfTempleRefusal' };
  }

  const priceMult = effectiveRep >= 40 ? 0.80 : 1.0;
  return { accessible: true, priceMult, reasonKey: null };
}

/**
 * Checks whether the Mages Guild mystic allows the player to purchase high-tier soul gems.
 * @param {any} playerEntity
 * @param {number|null} [trappedSoulPts=null]
 * @returns {{ allowed: boolean, reasonKey: string|null }}
 */
export function isSoulGemPurchaseAllowed(playerEntity, trappedSoulPts = null) {
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return { allowed: true, reasonKey: null };

  const magesRep = getFactionStanding(playerEntity, MAGES_GUILD_FACTION_ID);

  // Negative standing: complete lock out
  if (magesRep < 0) {
    return { allowed: false, reasonKey: 'rcfMagesGemsRefusal' };
  }

  // Low standing: rare/daedric souls restricted
  if (magesRep < 25 && trappedSoulPts != null && trappedSoulPts >= RARE_SOUL_PTS_THRESHOLD) {
    return { allowed: false, reasonKey: 'rcfMagesGemsRefusal' };
  }

  return { allowed: true, reasonKey: null };
}

/**
 * Evaluates tavern lodging and menu adjustments based on Commoners social standing.
 * @param {any} playerEntity
 * @returns {{ refused: boolean, priceMult: number, reasonKey: string|null }}
 */
export function getTavernReputationAdjustment(playerEntity) {
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return { refused: false, priceMult: 1.0, reasonKey: null };

  const commonersRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Commoners);

  if (commonersRep <= -30) {
    return { refused: true, priceMult: 1.0, reasonKey: 'rcfTavernRefusal' };
  }

  if (commonersRep <= -10) {
    return { refused: false, priceMult: 1.5, reasonKey: null };
  }

  if (commonersRep >= 30) {
    return { refused: false, priceMult: 0.75, reasonKey: null };
  }

  return { refused: false, priceMult: 1.0, reasonKey: null };
}

/**
 * Determines whether a road checkpoint demands baggage inspection for contraband.
 * @param {any} playerEntity
 * @param {boolean} [isKnight=false]
 * @returns {{ demandInspection: boolean, saluted: boolean, reasonKey: string|null }}
 */
export function evaluateCheckpointInspection(playerEntity, isKnight = false) {
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return { demandInspection: false, saluted: false, reasonKey: null };

  const nobleRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Nobility);
  if (isKnight || nobleRep >= 20) {
    return { demandInspection: false, saluted: true, reasonKey: 'rcfCheckpointSalute' };
  }

  const underworldRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Underworld);
  const commonersRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Commoners);

  if (underworldRep >= 25 || commonersRep <= -20) {
    return { demandInspection: true, saluted: false, reasonKey: 'rcfCheckpointDemand' };
  }

  return { demandInspection: false, saluted: false, reasonKey: null };
}

/**
 * Scans player inventory for stolen items during checkpoint baggage inspection.
 * @param {any} playerEntity
 * @returns {{ stolenCount: number, stolenItems: any[], fineGold: number }}
 */
export function inspectPlayerContraband(playerEntity) {
  const stolenItems = [];
  if (!playerEntity || !Array.isArray(playerEntity.items)) {
    return { stolenCount: 0, stolenItems, fineGold: 0 };
  }

  for (const it of playerEntity.items) {
    if (isStolen(it)) {
      stolenItems.push(it);
    }
  }

  const fineGold = stolenItems.length * 50;
  return { stolenCount: stolenItems.length, stolenItems, fineGold };
}

/**
 * Calculates jury and judge bias for court trials from Nobility and regional Court factions.
 * @param {any} playerEntity
 * @param {number} regionIndex
 * @returns {number} Integer bias added to Not Guilty plea chance (-20..+20)
 */
export function getCourtReputationBias(playerEntity, regionIndex) {
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return 0;

  const nobleRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Nobility);
  let courtRep = 0;

  if (playerEntity.factionRep?.dict instanceof Map) {
    for (const f of playerEntity.factionRep.dict.values()) {
      if (f?.type === FACTION_TYPES.Courts && f.region === regionIndex) {
        courtRep = Number(f.rep) || 0;
        break;
      }
    }
  }

  const bias = Math.trunc(courtRep / 4) + Math.trunc(nobleRep / 5);
  return clamp(Math.round(bias * scale), -25, 25);
}

/**
 * Generates an emergent rumor describing the player's reputation extremes.
 * @param {any} playerEntity
 * @param {number} regionIndex
 * @returns {string|null}
 */
export function getReputationRumor(playerEntity, regionIndex) {
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return null;

  const knightRep = getFactionStanding(playerEntity, GENERIC_KNIGHTLY_ORDER);
  const mercRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Merchants);
  const magesRep = getFactionStanding(playerEntity, MAGES_GUILD_FACTION_ID);
  const templeRep = getFactionStanding(playerEntity, GENERIC_TEMPLE);
  const underworldRep = getSocialRep(playerEntity, SOCIAL_GROUPS.Underworld);
  const superRep = getSocialRep(playerEntity, SOCIAL_GROUPS.SupernaturalBeings);

  const name = playerEntity.name || 'the traveler';

  if (knightRep >= 40) {
    return t('rcfRumorKnightHero', 'Travelers speak highly of %pcf, naming %pcf a noble champion of the realm.').replaceAll('%pcf', name);
  }
  if (mercRep <= -35) {
    return t('rcfRumorMerchantBane', 'Merchants whisper bitter warnings against %pcf, blaming %pcf for losses on the roads.').replaceAll('%pcf', name);
  }
  if (magesRep >= 45) {
    return t('rcfRumorMagePraise', 'Mages across the province admire the arcane prowess demonstrated by %pcf.').replaceAll('%pcf', name);
  }
  if (templeRep <= -35) {
    return t('rcfRumorHeretic', 'Preachers warn townspeople to shun the heretic %pcf, cursed by the Divines.').replaceAll('%pcf', name);
  }
  if (underworldRep >= 40) {
    return t('rcfRumorUnderworldKingpin', 'Shadow brokers whisper that %pcf commands respect in every den of the province.').replaceAll('%pcf', name);
  }
  if (superRep <= -30 && (playerEntity.isVampire || playerEntity.isWerebeast || playerEntity.timeToBecomeVampireOrWerebeast > 0)) {
    return t('rcfRumorMonsterHunt', 'The Vigil warns of a blood-drinking monster roaming the wild known as %pcf.').replaceAll('%pcf', name);
  }

  return null;
}

/**
 * Evaluates whether severe faction hostilities merit dispatching specialized retribution squads.
 * @param {any} playerEntity
 * @returns {string|null} Archetype name or null
 */
export function evaluateFactionNemesisArchetype(playerEntity) {
  const scale = getTierScale();
  if (scale === 0 || !playerEntity) return null;

  // 1. Dark Brotherhood retribution
  const dbRep = getFactionStanding(playerEntity, THE_DARK_BROTHERHOOD);
  if (dbRep <= -30) return 'SHADOW_ASSASSIN';

  // 2. Thieves Guild retribution
  const tgRep = getFactionStanding(playerEntity, THE_THIEVES_GUILD);
  if (tgRep <= -40) return 'GRUDGE_AVENGER'; // Uses standard humanoid enforcers / thugs

  // 3. Knightly Order inquisitor
  const knightRep = getFactionStanding(playerEntity, GENERIC_KNIGHTLY_ORDER);
  if (knightRep <= -35) return 'BOUNTY_HUNTER';

  // 4. Arcane Rival (Mages Guild renegade)
  const magesRep = getFactionStanding(playerEntity, MAGES_GUILD_FACTION_ID);
  if (magesRep <= -40) return 'ARCANE_RIVAL';

  // 5. Dawn Vigilant (Monster Hunter)
  const superRep = getSocialRep(playerEntity, SOCIAL_GROUPS.SupernaturalBeings);
  if (superRep <= -20 && (playerEntity.isVampire || playerEntity.isWerebeast)) {
    return 'GLORY_CHALLENGER';
  }

  return null;
}
