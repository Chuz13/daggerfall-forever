// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// SKIRMISH & EVENT REPUTATION MATRIX (Living Tamriel)
//
// Routes every CRISIS_EVENTS side (f1 / f2) to canonical DFF reputation stores:
//  - player.legalRep[regionIndex] (+ regionalReputations mirror)
//  - player.sGroupReputations[0..10] (SOCIAL_GROUPS)
//  - player.factionRep (FACTION.TXT store via changeReputation)
//  - [] (none) for beasts, rats, undead, unbound daedra, and rampaging monsters
// ═══════════════════════════════════════════════════════════════════════════════

import { SOCIAL_GROUPS, SOCIAL_GROUP_COUNT } from '../../formats/factionFile.js';
import { REGION_NAMES } from '../../formats/mapsTables.js';
import { getLocalizedRegionName, t } from '../textManager.js';
import {
  changeReputation,
  THE_THIEVES_GUILD,
  THE_DARK_BROTHERHOOD,
  GENERIC_TEMPLE,
  GENERIC_KNIGHTLY_ORDER,
} from '../faction/factionRep.js';
import { MAGES_GUILD_FACTION_ID, FIGHTERS_GUILD_FACTION_ID } from './reputationConsequences.js';
import { ORSINIUM_REGION_INDEX } from './crisisRegistry.js';

/**
 * @typedef {{ kind: 'legal', scope: 'local' | 'enemy' | 'orsinium', scale?: number }} LegalTargetSpec
 * @typedef {{ kind: 'sgroup', group: number, scale?: number }} SocialGroupTargetSpec
 * @typedef {{ kind: 'faction', factionId: number, scale?: number }} FactionTargetSpec
 * @typedef {LegalTargetSpec | SocialGroupTargetSpec | FactionTargetSpec} ReputationTargetSpec
 * @typedef {{ f1: readonly ReputationTargetSpec[], f2: readonly ReputationTargetSpec[] }} EventReputationSpec
 * @typedef {{ kind: 'legal' | 'sgroup' | 'faction', targetKey: string, label: string, delta: number, regionIndex?: number, group?: number, factionId?: number }} AppliedReputationEntry
 */

/** @type {LegalTargetSpec} */
const LOCAL_LAW = Object.freeze({ kind: 'legal', scope: 'local', scale: 1 });
/** @type {LegalTargetSpec} */
const LOCAL_LAW_HALF = Object.freeze({ kind: 'legal', scope: 'local', scale: 0.5 });
/** @type {LegalTargetSpec} */
const ENEMY_LAW = Object.freeze({ kind: 'legal', scope: 'enemy', scale: 1 });
/** @type {LegalTargetSpec} */
const ORSINIUM_LAW = Object.freeze({ kind: 'legal', scope: 'orsinium', scale: 1 });

/**
 * @param {number} group
 * @param {number} [scale=1]
 * @returns {SocialGroupTargetSpec}
 */
const SG = (group, scale = 1) => Object.freeze({ kind: 'sgroup', group, scale });

/**
 * @param {number} factionId
 * @param {number} [scale=1]
 * @returns {FactionTargetSpec}
 */
const FAC = (factionId, scale = 1) => Object.freeze({ kind: 'faction', factionId, scale });

/** @type {readonly ReputationTargetSpec[]} */
const NONE = Object.freeze([]);

/**
 * Canonical reputation routing matrix for all 41 CRISIS_EVENTS.
 * @type {Readonly<Record<string, EventReputationSpec>>}
 */
export const SKIRMISH_REP_MATRIX = Object.freeze({
  // ── 1. WAR & MARTIAL CONFLICTS (5) ──────────────────────────────────────────
  EVT_WAR_INTERPROVINCIAL: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Nobility, 0.5)]),
    f2: Object.freeze([ENEMY_LAW]),
  }),
  EVT_WAR_ORSINIUM_RAID: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Commoners, 0.5)]),
    f2: Object.freeze([ORSINIUM_LAW]),
  }),
  EVT_WAR_PRISONER_EXECUTION: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, FAC(GENERIC_KNIGHTLY_ORDER, 0.5)]),
    f2: Object.freeze([ENEMY_LAW]),
  }),
  EVT_WAR_DESERTERS_SHAKEDOWN: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Commoners), LOCAL_LAW_HALF]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld)]),
  }),
  EVT_WAR_RECRUITMENT_PRESSGANG: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Nobility, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
  }),

  // ── 2. FAMINE & SCARCITY (5) ────────────────────────────────────────────────
  EVT_FAMINE_BARN_RAID: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Nobility, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
  }),
  EVT_FAMINE_PREDATOR_INVASION: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
    f2: NONE,
  }),
  EVT_FAMINE_RELIEF_CARAVAN: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Merchants, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld)]),
  }),
  EVT_FAMINE_SOUP_KITCHEN_SPOILAGE: Object.freeze({
    f1: Object.freeze([FAC(GENERIC_TEMPLE)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
  }),
  EVT_FAMINE_RATION_SCAM: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Merchants)]),
  }),

  // ── 3. PLAGUE & CONTAGION (5) ───────────────────────────────────────────────
  EVT_PLAGUE_QUARANTINE_CLASH: Object.freeze({
    f1: Object.freeze([LOCAL_LAW]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
  }),
  EVT_PLAGUE_PYRE_DESECRATION: Object.freeze({
    f1: Object.freeze([FAC(GENERIC_TEMPLE), SG(SOCIAL_GROUPS.Commoners, 0.5)]),
    f2: NONE,
  }),
  EVT_PLAGUE_WATER_WELL_SCARE: Object.freeze({
    f1: Object.freeze([LOCAL_LAW]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
  }),
  EVT_PLAGUE_QUACK_MIRACLE_CURE: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld)]),
  }),
  EVT_PLAGUE_RAT_SWARM: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Commoners, 0.5)]),
    f2: NONE,
  }),

  // ── 4. WITCH HUNTS & OCCULT (5) ────────────────────────────────────────────
  EVT_WITCH_HUNT_SIEGE: Object.freeze({
    f1: Object.freeze([FAC(GENERIC_TEMPLE), LOCAL_LAW_HALF]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.SupernaturalBeings)]),
  }),
  EVT_WITCH_ENTHRALLED_AMBUSH: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
    f2: NONE,
  }),
  EVT_WITCH_HERBALIST_SHAKEDOWN: Object.freeze({
    f1: Object.freeze([FAC(GENERIC_TEMPLE)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Commoners), SG(SOCIAL_GROUPS.Scholars, 0.5)]),
  }),
  EVT_WITCH_DAEDRA_PACT_SIGHTING: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.SupernaturalBeings)]),
    f2: NONE,
  }),
  EVT_WITCH_COVEN_ASSAULT: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, FAC(GENERIC_TEMPLE, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.SupernaturalBeings)]),
  }),

  // ── 5. CRIME WAVE & UNDERWORLD (4) ──────────────────────────────────────────
  EVT_CRIME_DAYLIGHT_HEIST: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Merchants, 0.5)]),
    f2: Object.freeze([FAC(THE_THIEVES_GUILD), SG(SOCIAL_GROUPS.Underworld, 0.5)]),
  }),
  EVT_CRIME_BROTHERHOOD_CONTRACT: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Nobility), LOCAL_LAW_HALF]),
    f2: Object.freeze([FAC(THE_DARK_BROTHERHOOD), SG(SOCIAL_GROUPS.Underworld, 0.5)]),
  }),
  EVT_CRIME_PICKPOCKET_CHASE: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Merchants)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld), FAC(THE_THIEVES_GUILD, 0.5)]),
  }),
  EVT_CRIME_GAMBLING_DEN_BUST: Object.freeze({
    f1: Object.freeze([LOCAL_LAW]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld)]),
  }),

  // ── 6. TEMPLE PERSECUTION & FAITH (4) ───────────────────────────────────────
  EVT_TEMPLE_PURGE_SIEGE: Object.freeze({
    f1: Object.freeze([FAC(GENERIC_TEMPLE)]),
    f2: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Nobility, 0.5)]),
  }),
  EVT_TEMPLE_CLERGY_STANDOFF: Object.freeze({
    f1: Object.freeze([FAC(GENERIC_TEMPLE)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Scholars)]),
  }),
  EVT_TEMPLE_HERETIC_GRAFFITI: Object.freeze({
    f1: Object.freeze([FAC(GENERIC_TEMPLE), LOCAL_LAW_HALF]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld)]),
  }),
  EVT_TEMPLE_ALMS_DISPUTE: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld)]),
  }),

  // ── 7. NEW RULER & SUCCESSION (3) ──────────────────────────────────────────
  EVT_NEW_RULER_CORONATION: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Nobility, 0.5)]),
    f2: Object.freeze([FAC(GENERIC_KNIGHTLY_ORDER)]),
  }),
  EVT_NEW_RULER_STATUE_UNVEILING: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Nobility, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
  }),
  EVT_NEW_RULER_OATH_CEREMONY: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, FAC(GENERIC_KNIGHTLY_ORDER, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Nobility)]),
  }),

  // ── 8. COMMERCE & TAXATION (2) ──────────────────────────────────────────────
  EVT_PRICES_TAX_REVOLT: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Nobility, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Merchants)]),
  }),
  EVT_PRICES_PRICE_GOUGING_INSPECTION: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Commoners, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Merchants)]),
  }),

  // ── 9. HOLIDAYS & FESTIVITIES (4) ───────────────────────────────────────────
  EVT_HOLIDAY_TOWN_BRAWL: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Merchants)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
  }),
  EVT_HOLIDAY_CARNIVAL_MASQUERADE: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld)]),
  }),
  EVT_SCARY_NIGHT_HORROR: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, SG(SOCIAL_GROUPS.Commoners, 0.5)]),
    f2: NONE,
  }),
  EVT_HOLY_DAY_FANATICS: Object.freeze({
    f1: Object.freeze([FAC(GENERIC_TEMPLE)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld)]),
  }),

  // ── 10. ARCANE ANOMALY (1) ──────────────────────────────────────────────────
  EVT_MAD_WIZARD_RAMPAGE: Object.freeze({
    f1: Object.freeze([FAC(MAGES_GUILD_FACTION_ID), SG(SOCIAL_GROUPS.Scholars, 0.5)]),
    f2: NONE,
  }),

  // ── 11. MUNDANE & EXPLORATION (3) ───────────────────────────────────────────
  EVT_FARM_RUNAWAY_CATTLE: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Commoners)]),
    f2: NONE,
  }),
  EVT_GRAVEYARD_WEEPING_MOURNER: Object.freeze({
    f1: Object.freeze([SG(SOCIAL_GROUPS.Commoners), FAC(GENERIC_TEMPLE, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Underworld)]),
  }),
  EVT_TAVERN_CHESS_WAGER: Object.freeze({
    f1: Object.freeze([FAC(FIGHTERS_GUILD_FACTION_ID)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.Scholars)]),
  }),

  // ── 12. CRISIS-INDEPENDENT WORLD INVASIONS (1) ─────────────────────────────
  EVT_UNDEAD_HORDE_INVASION: Object.freeze({
    f1: Object.freeze([LOCAL_LAW, FAC(GENERIC_TEMPLE, 0.8), SG(SOCIAL_GROUPS.Commoners, 0.5)]),
    f2: Object.freeze([SG(SOCIAL_GROUPS.SupernaturalBeings)]),
  }),
});

/**
 * Adjusts regional legal reputation (`player.legalRep[regIdx]` + `regionalReputations`), clamped to [-100, 100].
 * @param {any} player
 * @param {number} regIdx
 * @param {number} delta
 * @returns {number}
 */
export function adjustRegionalLegalRep(player, regIdx, delta) {
  if (!player || typeof player !== 'object' || !Number.isInteger(regIdx) || !Number.isFinite(delta) || delta === 0) {
    return 0;
  }
  const current = Number(player.legalRep?.[regIdx] ?? player.regionalReputations?.[regIdx] ?? 0);
  const next = Math.max(-100, Math.min(100, current + delta));
  if (!player.legalRep || typeof player.legalRep !== 'object') {
    player.legalRep = {};
  }
  player.legalRep[regIdx] = next;
  if (!player.regionalReputations || typeof player.regionalReputations !== 'object') {
    player.regionalReputations = {};
  }
  player.regionalReputations[regIdx] = next;
  return next - current;
}

/**
 * Adjusts a canonical social group reputation (`player.sGroupReputations[sgroup]`), clamped to [-100, 100].
 * @param {any} player
 * @param {number} sgroup
 * @param {number} delta
 * @returns {number}
 */
export function adjustSocialGroupRep(player, sgroup, delta) {
  if (
    !player ||
    typeof player !== 'object' ||
    !Number.isInteger(sgroup) ||
    sgroup < 0 ||
    sgroup >= SOCIAL_GROUP_COUNT ||
    !Number.isFinite(delta) ||
    delta === 0
  ) {
    return 0;
  }
  if (!Array.isArray(player.sGroupReputations)) {
    player.sGroupReputations = new Array(SOCIAL_GROUP_COUNT).fill(0);
  }
  const current = Number(player.sGroupReputations[sgroup] ?? 0);
  const next = Math.max(-100, Math.min(100, current + delta));
  player.sGroupReputations[sgroup] = next;
  return next - current;
}

/**
 * Scales a base reputation delta cleanly without losing sign on small non-zero values.
 * @param {number} delta
 * @param {number} [scale=1]
 * @returns {number}
 */
export function scaleRepDelta(delta, scale = 1) {
  if (!Number.isFinite(delta) || delta === 0) return 0;
  if (scale === 1) return Math.trunc(delta);
  const scaled = Math.round(delta * scale);
  if (scaled !== 0) return scaled;
  return delta > 0 ? 1 : -1;
}

/**
 * Resolves the target region index for a legal reputation spec, avoiding same-region collisions.
 * @param {LegalTargetSpec} spec
 * @param {number} regionIndex
 * @param {number|null} enemyRegionIndex
 * @returns {number|null}
 */
function resolveLegalTargetRegion(spec, regionIndex, enemyRegionIndex) {
  if (spec.scope === 'local') return Number.isInteger(regionIndex) ? regionIndex : null;
  if (spec.scope === 'enemy') {
    return Number.isInteger(enemyRegionIndex) && enemyRegionIndex !== regionIndex
      ? /** @type {number} */ (enemyRegionIndex)
      : null;
  }
  if (spec.scope === 'orsinium') {
    return regionIndex !== ORSINIUM_REGION_INDEX ? ORSINIUM_REGION_INDEX : null;
  }
  return null;
}

/**
 * Formats a localized human-readable label for a canonical reputation target.
 * @param {ReputationTargetSpec} spec
 * @param {{ regionIndex: number, enemyRegionIndex?: number|null }} ctx
 * @returns {string}
 */
export function formatReputationTargetLabel(spec, { regionIndex, enemyRegionIndex = null }) {
  if (spec.kind === 'legal') {
    const targetRegIdx = resolveLegalTargetRegion(spec, regionIndex, enemyRegionIndex) ?? regionIndex;
    const region = getLocalizedRegionName(targetRegIdx, () => REGION_NAMES[targetRegIdx] ?? 'Local');
    return t('living.repTarget.regionLaw', '{region} Law', { region });
  }
  if (spec.kind === 'sgroup') {
    if (spec.group === SOCIAL_GROUPS.Commoners) return t('living.repTarget.commoners', 'Commoners');
    if (spec.group === SOCIAL_GROUPS.Merchants) return t('living.repTarget.merchants', 'Merchants');
    if (spec.group === SOCIAL_GROUPS.Scholars) return t('living.repTarget.scholars', 'Scholars');
    if (spec.group === SOCIAL_GROUPS.Nobility) return t('living.repTarget.nobility', 'Nobility');
    if (spec.group === SOCIAL_GROUPS.Underworld) return t('living.repTarget.underworld', 'Underworld');
    if (spec.group === SOCIAL_GROUPS.SupernaturalBeings) return t('living.repTarget.supernatural', 'Supernatural');
    if (spec.group === SOCIAL_GROUPS.GuildMembers) return t('living.repTarget.guildMembers', 'Guild Members');
    return t('living.repTarget.commoners', 'Commoners');
  }
  if (spec.factionId === MAGES_GUILD_FACTION_ID) return t('living.repTarget.magesGuild', 'Mages Guild');
  if (spec.factionId === THE_THIEVES_GUILD) return t('living.repTarget.thievesGuild', 'Thieves Guild');
  if (spec.factionId === FIGHTERS_GUILD_FACTION_ID) return t('living.repTarget.fightersGuild', 'Fighters Guild');
  if (spec.factionId === THE_DARK_BROTHERHOOD) return t('living.repTarget.darkBrotherhood', 'Dark Brotherhood');
  if (spec.factionId === GENERIC_TEMPLE) return t('living.repTarget.temples', 'Temples');
  if (spec.factionId === GENERIC_KNIGHTLY_ORDER) return t('living.repTarget.knightlyOrders', 'Knightly Orders');
  return t('living.repTarget.guildMembers', 'Guild Members');
}

/**
 * Returns the canonical reputation routing spec for an event ID.
 * @param {string|null|undefined} eventId
 * @returns {EventReputationSpec}
 */
export function getEventReputationSpec(eventId) {
  if (eventId && Object.prototype.hasOwnProperty.call(SKIRMISH_REP_MATRIX, eventId)) {
    return SKIRMISH_REP_MATRIX[eventId];
  }
  return Object.freeze({ f1: Object.freeze([LOCAL_LAW]), f2: NONE });
}

/**
 * Applies skirmish choice reputation deltas to real canonical channels (legalRep, sGroupReputations, factionRep).
 * Never sums opposing sides into the same region's legalRep and emits no entries for `NONE` monster/beast sides.
 *
 * @param {any} player
 * @param {{ eventId?: string|null, regionIndex: number, enemyRegionIndex?: number|null, repF1Delta?: number, repF2Delta?: number }} params
 * @returns {{ applied: AppliedReputationEntry[], netLocalLegalDelta: number }}
 */
export function applySkirmishReputationOutcome(
  player,
  { eventId = null, regionIndex, enemyRegionIndex = null, repF1Delta = 0, repF2Delta = 0 },
) {
  /** @type {AppliedReputationEntry[]} */
  const applied = [];
  let netLocalLegalDelta = 0;
  if (!player || typeof player !== 'object') {
    return { applied, netLocalLegalDelta };
  }

  const spec = getEventReputationSpec(eventId);

  /**
   * @param {readonly ReputationTargetSpec[]} targets
   * @param {number} baseDelta
   */
  const applyTargets = (targets, baseDelta) => {
    if (!Number.isFinite(baseDelta) || baseDelta === 0 || !Array.isArray(targets) || targets.length === 0) return;
    for (const target of targets) {
      const delta = scaleRepDelta(baseDelta, target.scale ?? 1);
      if (delta === 0) continue;

      if (target.kind === 'legal') {
        const targetReg = resolveLegalTargetRegion(target, regionIndex, enemyRegionIndex);
        if (targetReg === null) continue;
        adjustRegionalLegalRep(player, targetReg, delta);
        if (targetReg === regionIndex) {
          netLocalLegalDelta += delta;
        }
        applied.push({
          kind: 'legal',
          targetKey: `legal:${targetReg}`,
          regionIndex: targetReg,
          label: formatReputationTargetLabel(target, { regionIndex, enemyRegionIndex }),
          delta,
        });
      } else if (target.kind === 'sgroup') {
        adjustSocialGroupRep(player, target.group, delta);
        applied.push({
          kind: 'sgroup',
          targetKey: `sgroup:${target.group}`,
          group: target.group,
          label: formatReputationTargetLabel(target, { regionIndex, enemyRegionIndex }),
          delta,
        });
      } else if (target.kind === 'faction') {
        if (!player.factionRep?.dict) continue;
        let ok = false;
        try {
          ok = Boolean(changeReputation(player.factionRep, target.factionId, delta, true));
        } catch {
          ok = false;
        }
        if (!ok) continue;
        applied.push({
          kind: 'faction',
          targetKey: `faction:${target.factionId}`,
          factionId: target.factionId,
          label: formatReputationTargetLabel(target, { regionIndex, enemyRegionIndex }),
          delta,
        });
      }
    }
  };

  applyTargets(spec.f1, repF1Delta);
  applyTargets(spec.f2, repF2Delta);

  return { applied, netLocalLegalDelta };
}
