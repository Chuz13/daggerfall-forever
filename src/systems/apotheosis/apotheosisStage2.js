// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 2: FAITH ECONOMY, PORTFOLIO HOOKS & SCROLL OF AURBIS
//
// Manages:
//   - Dynamic Faith capacity (`getFaithMax`, base 1000 -> scalable by Cult in Stage 3)
//   - Flat daily Mythic Decay (-15 Faith/day when idle) + lawful Order stewardship
//   - Portfolio Faith generation (War, Magic without enchanted weapon kill abuse,
//     Shadows stealth/theft/lockpicking, Order bounties/temples/knightly quests/donations)
//   - Witness alignment reactions (+Faith for portfolio-aligned public miracles,
//     -Faith for portfolio-opposed public miracles)
//   - Scroll of Aurbis whitelist, strict cheat/stat blacklist, item gold pricing,
//     live cost estimation, and command execution.
// ═══════════════════════════════════════════════════════════════════════════════

import { t } from '../textManager.js';
import { MOBILE_TYPES } from '../../characters/mobile/mobileTypes.js';
import {
  GROUP_TEMPLATE_INDICES,
  customTemplateRows,
  itemBaseValue,
  setItemFields,
  templateByIndex,
} from '../item/itemTemplates.js';
import { REGION_FLAGS } from '../region/regionConditions.js';
import { registerSpellLandedListener } from '../spell/spellPower.js';
import {
  APOTHEOSIS_FAITH_BASE_MAX,
  APOTHEOSIS_INITIAL_FAITH,
  APOTHEOSIS_MYTHIC_DECAY_FLAT,
  APOTHEOSIS_PORTFOLIO_SWITCH_COST,
  APOTHEOSIS_REBIRTH_FAITH_COST,
  getAurbisRuntime,
  getFaithMax,
  isAscendedGod,
  registerApotheosisEventHandler,
} from './apotheosisLive.js';

export const MINUTES_PER_DAY = 1440;
export const AURBIS_GOLD_PER_FAITH = 10;
export const AURBIS_PORTAL_FAITH_COST = 120;
export const MAX_WITNESS_BONUS_PER_DAY = 3;
export const WITNESS_ALIGNED_BONUS = 15;
export const WITNESS_OPPOSED_PENALTY = 20;
export const DONATION_MIN_GOLD_FOR_FAITH = 100;
export const DONATION_DAILY_FAITH_CAP = 60;
export const ORDER_DAILY_LAW_FAITH_BONUS = 10;

const CONCEALMENT_EFFECT_KINDS = new Set([
  'invisNormal',
  'invisTrue',
  'chameleonNormal',
  'chameleonTrue',
  'shadeNormal',
  'shadeTrue',
  'invisibility',
  'blending',
  'shadow',
]);

const MACRO_CRISIS_TYPES = new Set(['war', 'plague', 'famine', 'strife', 'civil_strife']);
const REGION_FLAG_LOWER_NAMES = new Set(
  Object.entries(REGION_FLAGS)
    .filter(([, id]) => id <= 25)
    .map(([k]) => k.toLowerCase()),
);

const TEMPLATE_TO_GROUP = new Map();
for (const [groupName, indices] of Object.entries(GROUP_TEMPLATE_INDICES || {})) {
  for (const idx of indices) TEMPLATE_TO_GROUP.set(idx, groupName);
}

const MATERIAL_NAME_TO_INDEX = new Map([
  ['iron', 0],
  ['steel', 1],
  ['silver', 2],
  ['elven', 3],
  ['dwarven', 4],
  ['dwemer', 4],
  ['mithril', 5],
  ['adamant', 6],
  ['adamantium', 6],
  ['ebony', 7],
  ['orcish', 8],
  ['orc', 8],
  ['daedric', 9],
  ['daedra', 9],
  ['leather', 'leather'],
  ['chain', 'chain'],
]);

const MATERIAL_MULT_TABLE = Object.freeze([1, 2, 4, 8, 16, 32, 64, 128, 256, 512]);

const _processedSpellCasts = new WeakSet();
const _foesHitByRealSpell = new WeakSet();

const MOBILE_NAME_TO_ID = new Map();
for (const [name, id] of Object.entries(MOBILE_TYPES)) {
  MOBILE_NAME_TO_ID.set(name.toLowerCase(), id);
  MOBILE_NAME_TO_ID.set(name.toLowerCase().replace(/[\s_-]/g, ''), id);
}

const HIGH_TIER_MOBS = new Set([
  MOBILE_TYPES.DaedraLord,
  MOBILE_TYPES.DaedraSeducer,
  MOBILE_TYPES.FireDaedra,
  MOBILE_TYPES.FrostDaedra,
  MOBILE_TYPES.Daedroth,
  MOBILE_TYPES.Lich,
  MOBILE_TYPES.AncientLich,
  MOBILE_TYPES.VampireAncient,
  MOBILE_TYPES.Dragonling,
  MOBILE_TYPES.Dragonling_Alternate,
  MOBILE_TYPES.IronAtronach,
  MOBILE_TYPES.FleshAtronach,
  MOBILE_TYPES.IceAtronach,
  MOBILE_TYPES.FireAtronach,
]);

const MID_TIER_MOBS = new Set([
  MOBILE_TYPES.Vampire,
  MOBILE_TYPES.Mummy,
  MOBILE_TYPES.Gargoyle,
  MOBILE_TYPES.Wraith,
  MOBILE_TYPES.Ghost,
  MOBILE_TYPES.FrostGolem,
  MOBILE_TYPES.IceGolem,
  MOBILE_TYPES.Lamia,
  MOBILE_TYPES.Centaur,
  MOBILE_TYPES.Werewolf,
  MOBILE_TYPES.Wereboar,
  MOBILE_TYPES.Giant,
  MOBILE_TYPES.Dreugh,
]);

export const FORBIDDEN_AURBIS_COMMANDS = new Set([
  'tgm',
  'tcl',
  'noclip',
  'set_level',
  'setlevel',
  'level',
  'set_skill',
  'setskill',
  'skill',
  'mod_skill',
  'set_attr',
  'set_stat',
  'setstat',
  'setattr',
  'stat',
  'mod_attr',
  'mod_stat',
  'set',
  'set_max_magicka',
  'max_magicka',
  'setmaxmagicka',
  'maxmagicka',
  'set_mana',
  'set_max_mana',
  'max_mana',
  'set_fatigue',
  'setfatigue',
  'fatigue',
  'firmament',
  'firm',
  'perk',
  'perks',
  'open_perks',
  'prof',
  'profession',
  'addmats',
  'addspell',
  'necro',
  'necro_lich',
  'necro_ancient_lich',
  'lich',
  'ancient_lich',
  'ancientlich',
  'necro_spells',
  'necrospells',
  'necro_disguise',
  'necro_menu',
  'necro_lose_control',
  'lose_control',
  'release_control',
  'give_elixir',
  'giveelixir',
  'give_elixir_reagents',
  'give_reagents',
  'givereagents',
  'add_revenant',
  'addrevenant',
  'cheat_companion',
  'revenant_add',
  'finish_errand',
  'finisherrand',
  'complete_errands',
  'rcf',
  'dynasty',
  'housing',
  'house',
  'bank',
  'city247',
  'dumplog',
  'dumpcombat',
  'dumpspawns',
  'dumpall',
  'tdt',
  'suicide',
  'killme',
  'giveboat',
  'placeboat',
  'printboats',
  'identifyboat',
  'purgeboat',
]);

export const AURBIS_COMMAND_CATALOG = Object.freeze([
  {
    category: 'vitals',
    categoryLabel: () => t('apotheosis.aurbis.cat.vitals', 'Restoration'),
    commands: [
      {
        cmd: 'heal',
        aliases: ['player_heal'],
        syntax: 'heal',
        costHint: '40 Faith',
        desc: () => t('apotheosis.aurbis.cmd.heal', 'Restore health, magicka, and fatigue to maximum.'),
      },
    ],
  },
  {
    category: 'portal_map',
    categoryLabel: () => t('apotheosis.aurbis.cat.portalMap', 'Portals & Sight'),
    commands: [
      {
        cmd: 'portal',
        aliases: [],
        syntax: 'portal',
        costHint: '120 Faith (on pick)',
        desc: () => t('apotheosis.aurbis.cmd.portal', 'Open Portal Stone travel map and tear open a gate without spending a stone.'),
      },
      {
        cmd: 'tele2loc',
        aliases: ['teleport', 'tp'],
        syntax: 'tele2loc <locationName>',
        costHint: '180 Faith',
        desc: () => t('apotheosis.aurbis.cmd.tele2loc', 'Instant divine relocation to a named city, dungeon, or region.'),
      },
      {
        cmd: 'map_reveallocation',
        aliases: ['map_reveallocations', 'map_revealall', 'map_hideall', 'map_hidelocations'],
        syntax: 'map_reveallocation [name] | map_revealall',
        costHint: '60-120 Faith',
        desc: () => t('apotheosis.aurbis.cmd.mapReveal', 'Reveal dungeon corridors, regional locations, or all landmarks.'),
      },
    ],
  },
  {
    category: 'items_gold',
    categoryLabel: () => t('apotheosis.aurbis.cat.itemsGold', 'Materialization'),
    commands: [
      {
        cmd: 'additem',
        aliases: ['item'],
        syntax: 'additem <template|name> [count] [material]',
        costHint: 'max(15, ceil(goldValue / 10)) Faith',
        desc: () => t('apotheosis.aurbis.cmd.additem', 'Materialize items priced from their true Tamriel gold value.'),
      },
      {
        cmd: 'addgold',
        aliases: [],
        syntax: 'addgold <amount>',
        costHint: 'max(10, ceil(amount / 10)) Faith',
        desc: () => t('apotheosis.aurbis.cmd.addgold', 'Manifest gold coin pieces into your purse.'),
      },
      {
        cmd: 'give_dragon',
        aliases: ['givedragon', 'dragon_mount', 'dragon', 'dragon_ride', 'give_dagger', 'give_knife', 'give_grimoire'],
        syntax: 'give_dragon [brass|blue] | give_dagger | give_grimoire',
        costHint: '20-500 Faith',
        desc: () => t('apotheosis.aurbis.cmd.presets', 'Preset relic and mount manifestations.'),
      },
    ],
  },
  {
    category: 'world_weather',
    categoryLabel: () => t('apotheosis.aurbis.cat.worldWeather', 'Sky & Time'),
    commands: [
      {
        cmd: 'weather',
        aliases: ['set_weather'],
        syntax: 'weather <sunny|rain|thunder|snow|fog|0..6>',
        costHint: '35-45 Faith',
        desc: () => t('apotheosis.aurbis.cmd.weather', 'Command the skies and climate across the region.'),
      },
      {
        cmd: 'time',
        aliases: ['set_time', 'advance_time', 'pass_time', 'advance_days', 'pass_days'],
        syntax: 'time <hour> [min] | advance_time <hours> | advance_days <days>',
        costHint: '25+ Faith',
        desc: () => t('apotheosis.aurbis.cmd.time', 'Bend the current hour or accelerate the passage of days.'),
      },
    ],
  },
  {
    category: 'crisis_sim',
    categoryLabel: () => t('apotheosis.aurbis.cat.crisisSim', 'Living Tamriel & Crises'),
    commands: [
      {
        cmd: 'crisis',
        aliases: ['telecrisis'],
        syntax: 'crisis <status|start <war|plague|famine|civil_strife|FlagName> [reg]|stop [type|Flag] [reg]|tp|tick>',
        costHint: '0 status / 180 tp / 250-500 start|stop|tick',
        desc: () => t('apotheosis.aurbis.cmd.crisis', 'Ignite or quell regional wars, plagues, famines, civil strife, and condition flags.'),
      },
      {
        cmd: 'living',
        aliases: [],
        syntax: 'living adv <tick <days> | list [region] | kill_in_dungeon [reg] | setlevel <name> <lvl>>',
        costHint: '0 list / 100 + 50*days tick / 120 other',
        desc: () => t('apotheosis.aurbis.cmd.living', 'Drive Living Tamriel adventurer simulation forward.'),
      },
      {
        cmd: 'encounter',
        aliases: [],
        syntax: 'encounter [random|wild|camp|merchant|adv|bandit|plea|naval]',
        costHint: '75 Faith',
        desc: () => t('apotheosis.aurbis.cmd.encounter', 'Summon an immediate wilderness or sea encounter.'),
      },
    ],
  },
  {
    category: 'combat_spawn',
    categoryLabel: () => t('apotheosis.aurbis.cat.combatSpawn', 'Creatures & Judgment'),
    commands: [
      {
        cmd: 'spawnfoe',
        aliases: ['spawn', 'necro_spawn', 'necro_corpse'],
        syntax: 'spawnfoe <id|name> [count]',
        costHint: '50-160 Faith x count',
        desc: () => t('apotheosis.aurbis.cmd.spawnfoe', 'Manifest monsters or NPC classes near you (max 20 per cast).'),
      },
      {
        cmd: 'killall',
        aliases: ['kill'],
        syntax: 'killall | kill [target]',
        costHint: '80-150 Faith',
        desc: () => t('apotheosis.aurbis.cmd.killall', 'Strike down hostile creatures with heavenly wrath.'),
      },
    ],
  },
  {
    category: 'law_info',
    categoryLabel: () => t('apotheosis.aurbis.cat.lawInfo', 'Law & Divination'),
    commands: [
      {
        cmd: 'bounty',
        aliases: [],
        syntax: 'bounty <get [reg] | clear [reg] | set <gold> [reg]>',
        costHint: '0 get / 30+ clear / 60 set',
        desc: () => t('apotheosis.aurbis.cmd.bounty', 'Inspect or absolve your regional criminal bounty.'),
      },
      {
        cmd: 'legalrep',
        aliases: [],
        syntax: 'legalrep <get [reg] | set <val> [reg] | clear [reg]>',
        costHint: '0 get / 50 set|clear',
        desc: () => t('apotheosis.aurbis.cmd.legalrep', 'Inspect or reshape your legal standing in a region.'),
      },
      {
        cmd: 'help',
        aliases: ['date', 'calendar', 'get_time', 'spawnlist', 'list_revenants', 'revenants', 'retinue'],
        syntax: 'date | spawnlist | help | list_revenants',
        costHint: '0 Faith',
        desc: () => t('apotheosis.aurbis.cmd.info', 'Free divine inspection commands.'),
      },
    ],
  },
]);

function normalizeStage2Fields(entity) {
  if (!entity || typeof entity !== 'object') return null;
  if (!entity.apotheosis || typeof entity.apotheosis !== 'object') {
    entity.apotheosis = {};
  }
  const apo = entity.apotheosis;
  const cultBonus = Number(apo.cultFaithBonus);
  apo.cultFaithBonus = Number.isFinite(cultBonus) && cultBonus > 0 ? Math.trunc(cultBonus) : 0;
  const maxFaith = getFaithMax(apo);
  if (apo.faith == null || !Number.isFinite(Number(apo.faith))) {
    apo.faith = isAscendedGod(entity) ? APOTHEOSIS_INITIAL_FAITH : 0;
  } else {
    apo.faith = Math.max(0, Math.min(maxFaith, Math.trunc(Number(apo.faith))));
  }
  if (apo.lastFaithGainDay != null && Number.isFinite(Number(apo.lastFaithGainDay))) {
    apo.lastFaithGainDay = Math.trunc(Number(apo.lastFaithGainDay));
  } else {
    apo.lastFaithGainDay = null;
  }
  if (apo.lastFaithDecayDay != null && Number.isFinite(Number(apo.lastFaithDecayDay))) {
    apo.lastFaithDecayDay = Math.trunc(Number(apo.lastFaithDecayDay));
  } else {
    apo.lastFaithDecayDay = null;
  }
  apo.witnessMiracleDay = apo.witnessMiracleDay != null && Number.isFinite(Number(apo.witnessMiracleDay))
    ? Math.trunc(Number(apo.witnessMiracleDay))
    : null;
  apo.witnessMiracleCount = Number.isFinite(Number(apo.witnessMiracleCount)) && Number(apo.witnessMiracleCount) >= 0
    ? Math.trunc(Number(apo.witnessMiracleCount))
    : 0;
  apo.donationFaithDay = apo.donationFaithDay != null && Number.isFinite(Number(apo.donationFaithDay))
    ? Math.trunc(Number(apo.donationFaithDay))
    : null;
  apo.donationFaithEarned = Number.isFinite(Number(apo.donationFaithEarned)) && Number(apo.donationFaithEarned) >= 0
    ? Math.trunc(Number(apo.donationFaithEarned))
    : 0;
  apo.debugWitnessCount = apo.debugWitnessCount != null
    && Number.isFinite(Number(apo.debugWitnessCount))
    && Number(apo.debugWitnessCount) >= 0
    ? Math.trunc(Number(apo.debugWitnessCount))
    : null;
  return apo;
}

function hasMagicConcealment(entity) {
  if (!entity) return false;
  if (entity.isInvisible || entity.isBlending || entity.isShade) return true;
  if (!Array.isArray(entity.activeEffects)) return false;
  return entity.activeEffects.some((eff) => eff && !eff.ended && CONCEALMENT_EFFECT_KINDS.has(eff.kind));
}

function dayIndexFromMinutes(nowMinutes) {
  const mins = Number(nowMinutes);
  return Number.isFinite(mins) && mins >= 0 ? Math.floor(mins / MINUTES_PER_DAY) : 0;
}

/**
 * Adds Faith to an ascended god, clamped to `[0, getFaithMax(entity)]`.
 * Optionally stamps `lastFaithGainDay` so Mythic Decay pauses for active days.
 */
export function addApotheosisFaith(entity, amount, {
  reason = '',
  markDailyGain = true,
  nowMinutes = null,
  force = false,
} = {}) {
  const apo = normalizeStage2Fields(entity);
  if (!apo || (!force && !isAscendedGod(entity))) {
    return { added: 0, faith: apo?.faith ?? 0, faithMax: getFaithMax(apo), reason };
  }
  const maxFaith = getFaithMax(apo);
  const delta = Math.max(0, Math.trunc(Number(amount) || 0));
  const before = apo.faith;
  apo.faith = Math.min(maxFaith, before + delta);
  if (markDailyGain && delta > 0 && nowMinutes != null && Number.isFinite(Number(nowMinutes))) {
    apo.lastFaithGainDay = dayIndexFromMinutes(nowMinutes);
  }
  return {
    added: apo.faith - before,
    requested: delta,
    faith: apo.faith,
    faithMax: maxFaith,
    reason,
  };
}

/**
 * Deducts `amount` Faith from an ascended god, refusing if current Faith is insufficient.
 */
export function spendApotheosisFaith(entity, amount, { reason = '' } = {}) {
  const apo = normalizeStage2Fields(entity);
  if (!apo || !isAscendedGod(entity)) {
    return { ok: false, error: t('apotheosis.err.notAscendedFaith', 'Ascend to Godhood before wielding Faith.'), faith: apo?.faith ?? 0 };
  }
  const cost = Math.max(0, Math.trunc(Number(amount) || 0));
  if (apo.faith < cost) {
    return {
      ok: false,
      error: t('apotheosis.err.insufficientFaith', 'Insufficient Faith ({cur}/{req}).', { cur: apo.faith, req: cost }),
      faith: apo.faith,
      required: cost,
    };
  }
  apo.faith = Math.max(0, apo.faith - cost);
  return {
    ok: true,
    spent: cost,
    faith: apo.faith,
    faithMax: getFaithMax(apo),
    reason,
  };
}

/**
 * Applies flat daily Mythic Decay (-15 Faith per idle day) when an ascended god goes
 * a game day without earning Faith in their Portfolio, plus passive Order stewardship
 * if lawful in their current region (`bounty === 0 && legalRep >= 15`).
 */
export function tickApotheosisMythicDecay(entity, nowMinutes = 0, { daysOverride = null } = {}) {
  const apo = normalizeStage2Fields(entity);
  if (!apo || !isAscendedGod(entity)) {
    return { decayedDays: 0, faithLost: 0, orderBonus: 0, netDelta: 0, faithBefore: apo?.faith ?? 0, faithAfter: apo?.faith ?? 0 };
  }
  const currentDay = dayIndexFromMinutes(nowMinutes);
  const faithBefore = apo.faith;
  const reg = Number.isInteger(entity?.currentRegionIndex) ? entity.currentRegionIndex : 17;
  const curBounty = Number(entity?.regionalBounties?.[reg] ?? 0) || 0;
  const curLegalRep = Number(entity?.legalRep?.[reg] ?? 0) || 0;
  const orderLawful = apo.portfolio === 'order' && curBounty === 0 && curLegalRep >= 15;

  let startDay;
  let endDay;
  if (daysOverride != null) {
    const count = Math.max(0, Math.min(365, Math.trunc(Number(daysOverride) || 0)));
    startDay = currentDay + 1;
    endDay = currentDay + count;
  } else {
    const prevDay = apo.lastFaithDecayDay != null
      ? apo.lastFaithDecayDay
      : (apo.ascendedAtMinutes != null ? dayIndexFromMinutes(apo.ascendedAtMinutes) : currentDay);
    if (currentDay <= prevDay) {
      apo.lastFaithDecayDay = currentDay;
      return { decayedDays: 0, faithLost: 0, orderBonus: 0, netDelta: 0, faithBefore, faithAfter: apo.faith };
    }
    startDay = prevDay + 1;
    endDay = currentDay;
  }

  let decayedDays = 0;
  let faithLost = 0;
  let orderBonus = 0;
  const maxFaith = getFaithMax(apo);

  for (let d = startDay; d <= endDay; d++) {
    if (apo.lastFaithGainDay == null || apo.lastFaithGainDay < d) {
      decayedDays++;
      const loss = Math.min(apo.faith, APOTHEOSIS_MYTHIC_DECAY_FLAT);
      apo.faith -= loss;
      faithLost += loss;
    }
    if (orderLawful) {
      const beforeBonus = apo.faith;
      apo.faith = Math.min(maxFaith, apo.faith + ORDER_DAILY_LAW_FAITH_BONUS);
      orderBonus += apo.faith - beforeBonus;
    }
  }

  if (daysOverride == null) {
    apo.lastFaithDecayDay = currentDay;
  }

  return {
    decayedDays,
    faithLost,
    orderBonus,
    netDelta: apo.faith - faithBefore,
    faithBefore,
    faithAfter: apo.faith,
  };
}

/** Tracks real player spell casts (strictly excluding `cast == null` weapon enchantment procs). */
function handleSpellLandedForFaith({ caster = null, target = null, foe = null, self = false, reflected = false, cast = null } = {}) {
  if (!caster?.isPlayer || !isAscendedGod(caster) || reflected) return;
  const apo = normalizeStage2Fields(caster);
  if (!apo || apo.portfolio !== 'magic') return;

  // Enchanted weapon "Cast When Strikes" procs arrive with cast == null -> MUST NOT grant Faith.
  if (!cast || !(Number(cast.cost) > 0)) return;

  const actualFoe = foe ?? (target && !target.isPlayer ? target : null);
  if (actualFoe && typeof actualFoe === 'object') {
    _foesHitByRealSpell.add(actualFoe);
  }
  if (target && typeof target === 'object' && !target.isPlayer) {
    _foesHitByRealSpell.add(target);
  }

  if (_processedSpellCasts.has(cast)) return;
  _processedSpellCasts.add(cast);

  // Exclude trivial self-cantrip spam under 5 MP unless legitimate cost.
  const castGain = Math.max(2, Math.min(25, Math.floor(Number(cast.cost) / 15)));
  if (castGain > 0) {
    addApotheosisFaith(caster, castGain, {
      reason: self ? 'magic_self_spell' : 'magic_spell_cast',
      nowMinutes: caster._lastWorldMinutes ?? null,
    });
  }
}

registerSpellLandedListener('apotheosis_magic_faith', handleSpellLandedForFaith);

/**
 * Evaluates Portfolio Faith rewards upon killing a foe.
 * Strictly blocks enchanted melee/ranged weapon kills from awarding `magic` Portfolio Faith.
 */
export function handleApotheosisKillFaith(player, foe = null, info = {}) {
  if (!player || !isAscendedGod(player)) return 0;
  const apo = normalizeStage2Fields(player);
  const nowMinutes = info?.nowMinutes ?? player._lastWorldMinutes ?? null;
  const kind = typeof info?.kind === 'string' ? info.kind : 'melee';
  const targetObj = foe?.entity && typeof foe.entity === 'object' ? foe.entity : foe;
  const isEliteOrBoss = !!(
    foe?.apotheosisAspectBoss ||
    foe?.shadowBoss ||
    targetObj?.apotheosisAspectBoss ||
    targetObj?.shadowBoss ||
    Number(targetObj?.sizeScale) > 1 ||
    Number(targetObj?.level) >= 15 ||
    HIGH_TIER_MOBS.has(foe?.mobileType)
  );

  if (apo.portfolio === 'war') {
    if (kind === 'spell') return 0;
    const gain = isEliteOrBoss ? 15 : 5;
    return addApotheosisFaith(player, gain, { reason: 'war_kill', nowMinutes }).added;
  }

  if (apo.portfolio === 'magic') {
    const killedByRealSpell = kind === 'spell' && (
      info?.realSpell === true ||
      (foe && _foesHitByRealSpell.has(foe)) ||
      (targetObj && _foesHitByRealSpell.has(targetObj))
    );
    if (!killedByRealSpell) return 0;
    const gain = isEliteOrBoss ? 20 : 10;
    return addApotheosisFaith(player, gain, { reason: 'magic_spell_kill', nowMinutes }).added;
  }

  if (apo.portfolio === 'shadows') {
    const isStealth = !!(
      info?.stealth ||
      player.isStealth ||
      hasMagicConcealment(player) ||
      foe?.unaware ||
      targetObj?.unaware
    );
    if (!isStealth) return 0;
    const gain = isEliteOrBoss ? 20 : 12;
    return addApotheosisFaith(player, gain, { reason: 'shadows_stealth_kill', nowMinutes }).added;
  }

  return 0;
}

/** Awards Magic Portfolio Faith for non-combat arcane crafts (spell making, alchemy, enchanting). */
export function recordApotheosisMagicCraft(entity, craftKind = 'spellcraft', { goldSpent = 0, nowMinutes = null } = {}) {
  if (!entity || !isAscendedGod(entity)) return 0;
  const apo = normalizeStage2Fields(entity);
  if (apo.portfolio !== 'magic') return 0;
  const base = craftKind === 'enchant' ? 18 : craftKind === 'spellcraft' ? 14 : 10;
  const bonus = goldSpent > 0 ? Math.min(10, Math.floor(goldSpent / 500)) : 0;
  return addApotheosisFaith(entity, base + bonus, { reason: `magic_${craftKind}`, nowMinutes }).added;
}

/** Awards Shadows Portfolio Faith for covert acts (pickpocketing, lockpicking, larceny). */
export function recordApotheosisShadowAct(entity, actKind = 'stealth', { nowMinutes = null } = {}) {
  if (!entity || !isAscendedGod(entity)) return 0;
  const apo = normalizeStage2Fields(entity);
  if (apo.portfolio !== 'shadows') return 0;
  const gain = actKind === 'lockpick' ? 12 : actKind === 'pickpocket' ? 10 : 8;
  return addApotheosisFaith(entity, gain, { reason: `shadows_${actKind}`, nowMinutes }).added;
}

/** Awards Order (and minor War) Faith when turning in a completed Bounty Board contract. */
export function handleApotheosisBountyPaid(entity, bountyRow = null, { nowMinutes = null } = {}) {
  if (!entity || !isAscendedGod(entity)) return 0;
  const apo = normalizeStage2Fields(entity);
  const tier = Math.max(1, Math.trunc(Number(bountyRow?.tier ?? 1) || 1));
  if (apo.portfolio === 'order') {
    return addApotheosisFaith(entity, 25 * tier, { reason: 'order_bounty_paid', nowMinutes }).added;
  }
  if (apo.portfolio === 'war') {
    return addApotheosisFaith(entity, 15 * tier, { reason: 'war_bounty_paid', nowMinutes }).added;
  }
  return 0;
}

/**
 * Awards Order Faith when donating gold at a Temple (`guildServiceActions.js donate`).
 * Enforces minimum 100g per donation and a daily 60-Faith cap to prevent 1g click farming.
 */
export function handleApotheosisTempleDonation(entity, divineFactionId, amount, { nowMinutes = null } = {}) {
  if (!entity || !isAscendedGod(entity)) return 0;
  const apo = normalizeStage2Fields(entity);
  if (apo.portfolio !== 'order') return 0;
  const gold = Math.trunc(Number(amount) || 0);
  if (gold < DONATION_MIN_GOLD_FOR_FAITH) return 0;

  const day = dayIndexFromMinutes(nowMinutes ?? entity._lastWorldMinutes ?? 0);
  if (apo.donationFaithDay !== day) {
    apo.donationFaithDay = day;
    apo.donationFaithEarned = 0;
  }
  const remainingCap = Math.max(0, DONATION_DAILY_FAITH_CAP - apo.donationFaithEarned);
  if (remainingCap <= 0) return 0;

  const rawGain = Math.min(40, Math.floor(gold / 50));
  const capped = Math.min(remainingCap, rawGain);
  if (capped <= 0) return 0;
  const res = addApotheosisFaith(entity, capped, {
    reason: `order_donation_${divineFactionId ?? 'temple'}`,
    nowMinutes: nowMinutes ?? entity._lastWorldMinutes ?? null,
  });
  apo.donationFaithEarned += res.added;
  return res.added;
}

/** Classifies a completed quest's affiliation to award Portfolio Faith. */
export function handleApotheosisQuestFaith(entity, quest = null) {
  if (!entity || !isAscendedGod(entity) || !quest) return 0;
  if (quest.questSuccess === false) return 0;
  const apo = normalizeStage2Fields(entity);
  const membership = String(quest.factionMembership ?? quest.guildName ?? quest.affiliation ?? '').toLowerCase();
  const qName = String(quest.questName ?? '').toLowerCase();
  const fId = Number(quest.factionId ?? -1);

  // Known classic DFU guild IDs + descriptive prefixes:
  // Fighters Guild = 41, Mages Guild = 40, Thieves Guild = 42, Dark Brotherhood = 108.
  const isTempleOrOrder = membership.startsWith('temple:')
    || membership.startsWith('order:')
    || /temple|knight|order|arkay|akatosh|dibella|julianos|kynareth|mara|stendarr|zenithar/.test(membership)
    || /^[ckm][0-9]|^[0-9]?o[0-9]/.test(qName) && fId >= 368 && fId <= 415;
  const isMages = membership.includes('mage') || fId === 40;
  const isFighters = membership.includes('fighter') || fId === 41;
  const isCrimeGuild = membership.includes('thiev') || membership.includes('brotherhood') || membership.includes('assassin') || fId === 42 || fId === 108;

  if (apo.portfolio === 'order' && isTempleOrOrder) {
    return addApotheosisFaith(entity, 35, { reason: 'order_quest', nowMinutes: entity._lastWorldMinutes ?? null }).added;
  }
  if (apo.portfolio === 'magic' && isMages) {
    return addApotheosisFaith(entity, 30, { reason: 'magic_quest', nowMinutes: entity._lastWorldMinutes ?? null }).added;
  }
  if (apo.portfolio === 'war' && isFighters) {
    return addApotheosisFaith(entity, 30, { reason: 'war_quest', nowMinutes: entity._lastWorldMinutes ?? null }).added;
  }
  if (apo.portfolio === 'shadows' && isCrimeGuild) {
    return addApotheosisFaith(entity, 30, { reason: 'shadows_quest', nowMinutes: entity._lastWorldMinutes ?? null }).added;
  }
  return 0;
}

registerApotheosisEventHandler('mythicDecayTick', ({ entity, nowMinutes }) => tickApotheosisMythicDecay(entity, nowMinutes));
registerApotheosisEventHandler('bountyPaid', ({ entity, bounty, nowMinutes }) => handleApotheosisBountyPaid(entity, bounty, { nowMinutes }));
registerApotheosisEventHandler('templeDonation', ({ entity, divineFactionId, amount, nowMinutes }) => handleApotheosisTempleDonation(entity, divineFactionId, amount, { nowMinutes }));
registerApotheosisEventHandler('magicCraft', ({ entity, craftKind, goldSpent, nowMinutes }) => recordApotheosisMagicCraft(entity, craftKind, { goldSpent, nowMinutes }));
registerApotheosisEventHandler('shadowAct', ({ entity, actKind, nowMinutes }) => recordApotheosisShadowAct(entity, actKind, { nowMinutes }));

/** Lightweight token splitter preserving whitespace splitting consistent with consoleCommands.js. */
export function parseAurbisCommandLine(rawLine) {
  const trimmed = String(rawLine ?? '').trim();
  if (!trimmed) return { empty: true, chained: false, cmd: '', args: [] };
  if (trimmed.includes(';')) return { empty: false, chained: true, cmd: '', args: [] };
  let parts = trimmed.split(/\s+/);
  // Strip optional console wrapper `apo aurbis ...` / `apotheosis aurbis ...` (and leading `/`)
  for (let i = 0; i < 4 && parts.length > 0; i++) {
    const headRaw = parts[0] || '';
    const head = headRaw.startsWith('/') && headRaw !== '/tp' ? headRaw.slice(1).toLowerCase() : headRaw.toLowerCase();
    if ((head === 'apo' || head === 'apotheosis') && String(parts[1] ?? '').toLowerCase() === 'aurbis') {
      parts = parts.slice(2);
      continue;
    }
    break;
  }
  if (!parts.length) return { empty: true, chained: false, cmd: '', args: [] };
  const rawCmd = parts[0] || '';
  const cmd = rawCmd.startsWith('/') && rawCmd !== '/tp' ? rawCmd.slice(1).toLowerCase() : rawCmd.toLowerCase();
  return {
    empty: false,
    chained: false,
    rawCmd,
    cmd,
    args: parts.slice(1),
  };
}

function resolveTemplateFallback(query) {
  if (!query) return null;
  const num = parseInt(query, 10);
  if (!Number.isNaN(num) && String(num) === String(query).trim()) {
    const tpl = templateByIndex(num);
    if (tpl) return { template: tpl, index: num };
  }
  const clean = String(query).toLowerCase().replace(/[\s_-]/g, '');
  if (clean === 'skinningknife' || clean === 'flayingknife') {
    const tpl = templateByIndex(603);
    if (tpl) return { template: tpl, index: 603 };
  }
  if (clean === 'dragon' || clean === 'dwarvendragon' || clean === 'dwemerdragon') {
    const tpl = templateByIndex(560);
    if (tpl) return { template: tpl, index: 560 };
  }
  for (let i = 0; i < 288; i++) {
    const tpl = templateByIndex(i);
    if (!tpl?.name) continue;
    const cleanName = tpl.name.toLowerCase().replace(/[\s_-]/g, '');
    if (cleanName === clean || cleanName.includes(clean)) return { template: tpl, index: i };
  }
  for (const row of customTemplateRows?.() ?? []) {
    if (!row?.name) continue;
    const cleanName = row.name.toLowerCase().replace(/[\s_-]/g, '');
    if (cleanName === clean || cleanName.includes(clean)) return { template: row, index: row.index };
  }
  for (const [alias, matVal] of MATERIAL_NAME_TO_INDEX.entries()) {
    const cleanAlias = alias.replace(/[\s_-]/g, '');
    if (clean.startsWith(cleanAlias) && clean.length > cleanAlias.length) {
      const rem = clean.slice(cleanAlias.length);
      for (let i = 0; i < 288; i++) {
        const tpl = templateByIndex(i);
        if (!tpl?.name) continue;
        const cleanName = tpl.name.toLowerCase().replace(/[\s_-]/g, '');
        if (cleanName === rem || cleanName.includes(rem)) {
          return { template: tpl, index: i, detectedMaterial: matVal };
        }
      }
    }
    if (clean.endsWith(cleanAlias) && clean.length > cleanAlias.length) {
      const rem = clean.slice(0, -cleanAlias.length);
      for (let i = 0; i < 288; i++) {
        const tpl = templateByIndex(i);
        if (!tpl?.name) continue;
        const cleanName = tpl.name.toLowerCase().replace(/[\s_-]/g, '');
        if (cleanName === rem || cleanName.includes(rem)) {
          return { template: tpl, index: i, detectedMaterial: matVal };
        }
      }
    }
  }
  return null;
}

function estimateAddItemPricing(args = []) {
  if (!args.length) {
    return { ok: false, error: t('apotheosis.aurbis.err.additemUsage', 'Usage: additem <templateIndex|name> [count] [material]') };
  }
  const firstClean = String(args[0]).toLowerCase().replace(/[\s_-]/g, '');
  if (firstClean === 'elixirunlife' || firstClean === 'elixirofunlife' || firstClean === 'lichingredients' || firstClean === 'elixirreagents') {
    return {
      ok: false,
      forbidden: true,
      error: t('apotheosis.aurbis.err.forbiddenLich', 'Ascended Lichdom rituals cannot be conjured through the Scroll of Aurbis.'),
    };
  }

  const tokens = [...args];
  let material = null;
  let count = 1;

  if (MATERIAL_NAME_TO_INDEX.has(tokens[0].toLowerCase()) && tokens.length > 1) {
    material = MATERIAL_NAME_TO_INDEX.get(tokens[0].toLowerCase());
    tokens.shift();
  }
  if (material === null && tokens.length > 1) {
    const lastLower = tokens[tokens.length - 1].toLowerCase();
    if (MATERIAL_NAME_TO_INDEX.has(lastLower)) {
      material = MATERIAL_NAME_TO_INDEX.get(lastLower);
      tokens.pop();
    } else if (tokens.length >= 3 && /^[0-9]$/.test(lastLower)) {
      material = parseInt(lastLower, 10);
      tokens.pop();
    }
  }
  if (tokens.length > 1 && /^\d+$/.test(tokens[tokens.length - 1])) {
    count = Math.max(1, Math.min(999, parseInt(tokens[tokens.length - 1], 10) || 1));
    tokens.pop();
  }

  const query = tokens.join(' ');
  const finder = getAurbisRuntime().findItemTemplate ?? resolveTemplateFallback;
  const match = finder(query);
  if (!match || !match.template) {
    return { ok: false, error: t('apotheosis.aurbis.err.itemNotFound', 'Item template "{query}" not found.', { query: query || args[0] }) };
  }

  if (material === null && match.detectedMaterial !== undefined) {
    material = match.detectedMaterial;
  }

  const tpl = match.template;
  const group = TEMPLATE_TO_GROUP.get(match.index) ?? tpl.group ?? 'MiscItems';
  let unitGold = Math.max(0, Number(tpl.basePrice) || 0);

  // Build representative item shape to evaluate true itemBaseValue (weapons/plate/chain/ammunition)
  try {
    let encodedMaterial = typeof material === 'number' ? material : 0;
    if (group === 'Armor') {
      if (material === 'leather') encodedMaterial = 0x0000;
      else if (material === 'chain') encodedMaterial = 0x0100;
      else if (typeof material === 'number' && material >= 0 && material <= 9) encodedMaterial = 0x0200 + material;
      else encodedMaterial = 0x0200; // Iron plate default matching handleAddItemCommand
    }
    const probe = setItemFields({
      group,
      templateIndex: match.index,
      material: encodedMaterial,
      stackCount: 1,
    });
    const computed = itemBaseValue(probe);
    if (Number.isFinite(computed) && computed > 0) unitGold = computed;
  } catch {
    if (typeof material === 'number' && material >= 0 && material <= 9 && (group === 'Weapons' || group === 'Armor')) {
      unitGold = unitGold * 3 * (MATERIAL_MULT_TABLE[material] ?? 1);
    }
  }

  if (match.index === 560) unitGold = Math.max(unitGold, 5000); // Dwarven Dragon Mount floor -> 500 Faith

  const totalGold = Math.max(1, unitGold) * count;
  const faithCost = Math.max(15, Math.ceil(totalGold / AURBIS_GOLD_PER_FAITH));
  return {
    ok: true,
    faithCost,
    itemName: tpl.name ?? query,
    unitGold,
    totalGold,
    count,
  };
}

/** Computes Faith cost for a creature type ID/name in `spawnfoe`/`spawn`. */
export function getSpawnCreatureFaithCost(mobileArg) {
  const clean = String(mobileArg ?? '').trim().toLowerCase();
  if (!clean) return 60;
  let id = MOBILE_NAME_TO_ID.get(clean) ?? MOBILE_NAME_TO_ID.get(clean.replace(/[\s_-]/g, ''));
  if (id === undefined && /^\d+$/.test(clean)) id = parseInt(clean, 10);
  if (id === undefined) return 60;
  if (HIGH_TIER_MOBS.has(id)) return 160;
  if (MID_TIER_MOBS.has(id) || (id >= 128 && id <= 146)) return 100;
  return 50;
}

/**
 * Classifies whether a miracle is aligned (+bonus) or opposed (-penalty) to the god's Portfolio
 * when cast in view of witnesses (`witnessCount > 0`).
 */
export function classifyMiraclePortfolioAlignment(portfolio, cmd, args = []) {
  if (!portfolio || !cmd) return 'neutral';
  const sub = String(args[0] ?? '').toLowerCase();
  const arg1 = String(args[1] ?? '').toLowerCase();

  if (portfolio === 'order') {
    if (cmd === 'heal' || cmd === 'player_heal' || cmd === 'legalrep') return 'aligned';
    if (cmd === 'bounty' && sub === 'clear') return 'aligned';
    if (cmd === 'bounty' && sub === 'set') return 'opposed';
    if (cmd === 'crisis' && sub === 'stop') return 'aligned';
    if ((cmd === 'weather' || cmd === 'set_weather') && (sub === '0' || sub === '1' || sub === 'sunny' || sub === 'cloudy')) return 'aligned';
    if (cmd === 'killall' || cmd === 'kill' || cmd === 'spawn' || cmd === 'spawnfoe' || cmd === 'necro_spawn') return 'opposed';
    if (cmd === 'crisis' && sub === 'start') return 'opposed';
    return 'neutral';
  }

  if (portfolio === 'war') {
    if (cmd === 'killall' || cmd === 'kill' || cmd === 'spawn' || cmd === 'spawnfoe' || cmd === 'encounter' || cmd === 'give_dragon' || cmd === 'givedragon' || cmd === 'dragon_mount' || cmd === 'dragon' || cmd === 'dragon_ride') return 'aligned';
    if (cmd === 'crisis' && sub === 'start' && arg1 === 'war') return 'aligned';
    if (cmd === 'crisis' && sub === 'stop' && (!arg1 || arg1 === 'war')) return 'opposed';
    if (cmd === 'bounty' && sub === 'clear') return 'opposed';
    return 'neutral';
  }

  if (portfolio === 'magic') {
    if (cmd === 'portal' || cmd === 'tele2loc' || cmd === 'teleport' || cmd === 'tp' || cmd === '/tp' || cmd === 'weather' || cmd === 'set_weather' || cmd === 'time' || cmd === 'set_time' || cmd === 'advance_time' || cmd === 'advancetime' || cmd === 'pass_time' || cmd === 'passtime' || cmd === 'advance_days' || cmd === 'advancedays' || cmd === 'pass_days' || cmd === 'map_revealall' || cmd === 'map_reveallocations' || cmd === 'map_reveallocation' || cmd === 'give_grimoire' || cmd === 'givegrimoire') {
      return 'aligned';
    }
    return 'neutral';
  }

  if (portfolio === 'shadows') {
    if ((cmd === 'weather' || cmd === 'set_weather') && (sub === '3' || sub === 'fog')) return 'aligned';
    if ((cmd === 'time' || cmd === 'set_time') && (parseInt(sub, 10) >= 20 || (parseInt(sub, 10) >= 0 && parseInt(sub, 10) <= 5))) return 'aligned';
    if (cmd === 'bounty' && sub === 'clear') return 'aligned';
    if (cmd === 'killall' || cmd === 'spawn' || cmd === 'spawnfoe' || (cmd === 'crisis' && sub === 'start') || cmd === 'give_dragon' || cmd === 'dragon' || cmd === 'dragon_ride') {
      return 'opposed';
    }
    return 'neutral';
  }

  return 'neutral';
}

/** Computes signed Faith delta from nearby NPC witnesses (`> 0` bonus capped daily, `< 0` penalty). */
export function evaluateMiracleWitnessReaction(entity, cmd, args = [], { witnessCount = 0, nowMinutes = null, apply = false } = {}) {
  const apo = normalizeStage2Fields(entity);
  if (!apo || !apo.portfolio) return { delta: 0, alignment: 'neutral', capped: false };
  const witnesses = Math.max(0, Math.trunc(Number(witnessCount) || 0));
  if (witnesses <= 0) return { delta: 0, alignment: 'neutral', capped: false };

  const alignment = classifyMiraclePortfolioAlignment(apo.portfolio, cmd, args);
  if (alignment === 'neutral') return { delta: 0, alignment: 'neutral', capped: false };

  const day = dayIndexFromMinutes(nowMinutes ?? entity?._lastWorldMinutes ?? 0);
  if (alignment === 'aligned') {
    const usedToday = apo.witnessMiracleDay === day ? apo.witnessMiracleCount : 0;
    if (usedToday >= MAX_WITNESS_BONUS_PER_DAY) {
      return { delta: 0, alignment: 'aligned', capped: true };
    }
    if (apply) {
      if (apo.witnessMiracleDay !== day) {
        apo.witnessMiracleDay = day;
        apo.witnessMiracleCount = 0;
      }
      apo.witnessMiracleCount += 1;
      const res = addApotheosisFaith(entity, WITNESS_ALIGNED_BONUS, {
        reason: 'witness_aligned',
        nowMinutes,
      });
      return { delta: res.added, alignment: 'aligned', capped: false };
    }
    return { delta: WITNESS_ALIGNED_BONUS, alignment: 'aligned', capped: false };
  }

  // Opposed miracle in public
  if (apply) {
    const before = apo.faith;
    apo.faith = Math.max(0, before - WITNESS_OPPOSED_PENALTY);
    return { delta: apo.faith - before, alignment: 'opposed', capped: false };
  }
  return { delta: -WITNESS_OPPOSED_PENALTY, alignment: 'opposed', capped: false };
}

/**
 * Evaluates a Scroll of Aurbis command string without executing it:
 * returns allow/forbid status, parsed command+args, exact Faith cost, and witness delta preview.
 */
export function evaluateAurbisCommand(rawLine, entity, { witnessCount = 0 } = {}) {
  const parsed = parseAurbisCommandLine(rawLine);
  if (parsed.empty) {
    return { allowed: false, empty: true, cmd: '', args: [], faithCost: 0, witnessDelta: 0, alignment: 'neutral', reason: '' };
  }
  if (parsed.chained) {
    return {
      allowed: false,
      forbidden: true,
      cmd: parsed.cmd,
      args: parsed.args,
      faithCost: 0,
      witnessDelta: 0,
      alignment: 'neutral',
      reason: t('apotheosis.aurbis.err.chained', 'Only one divine decree may be inscribed at a time.'),
    };
  }

  const { cmd, args } = parsed;
  if (cmd === 'apo' || cmd === 'apotheosis') {
    const sub = String(args[0] ?? '').toLowerCase();
    if (sub === 'status' && args.length <= 1) {
      return {
        allowed: true,
        forbidden: false,
        cmd,
        args,
        faithCost: 0,
        witnessDelta: 0,
        alignment: 'neutral',
        reason: '',
      };
    }
    return {
      allowed: false,
      forbidden: true,
      cmd,
      args,
      faithCost: 0,
      witnessDelta: 0,
      alignment: 'neutral',
      reason: t('apotheosis.aurbis.err.forbidden', '"{cmd}" alters mortal vessel laws or engine cheats and is forbidden in the Scroll of Aurbis.', { cmd: `${cmd}${sub ? ` ${sub}` : ''}` }),
    };
  }
  if (FORBIDDEN_AURBIS_COMMANDS.has(cmd)) {
    return {
      allowed: false,
      forbidden: true,
      cmd,
      args,
      faithCost: 0,
      witnessDelta: 0,
      alignment: 'neutral',
      reason: t('apotheosis.aurbis.err.forbidden', '"{cmd}" alters mortal vessel laws or engine cheats and is forbidden in the Scroll of Aurbis.', { cmd }),
    };
  }

  let faithCost = null;
  let errorReason = '';

  if (cmd === 'heal' || cmd === 'player_heal') {
    faithCost = 40;
  } else if (cmd === 'portal') {
    faithCost = AURBIS_PORTAL_FAITH_COST;
  } else if (cmd === 'additem' || cmd === 'item') {
    const priced = estimateAddItemPricing(args);
    if (!priced.ok) {
      return {
        allowed: false,
        forbidden: !!priced.forbidden,
        cmd,
        args,
        faithCost: 0,
        witnessDelta: 0,
        alignment: 'neutral',
        reason: priced.error,
      };
    }
    faithCost = priced.faithCost;
  } else if (cmd === 'give_dagger' || cmd === 'givedagger') {
    faithCost = 25;
  } else if (cmd === 'give_knife' || cmd === 'giveknife') {
    faithCost = 20;
  } else if (cmd === 'give_grimoire' || cmd === 'givegrimoire') {
    faithCost = 60;
  } else if (cmd === 'give_dragon' || cmd === 'givedragon' || cmd === 'dragon_mount') {
    faithCost = 500;
  } else if (cmd === 'dragon' || cmd === 'dragon_ride') {
    faithCost = 150;
  } else if (cmd === 'addgold') {
    const amt = parseInt(args[0], 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      errorReason = t('apotheosis.aurbis.err.goldAmount', 'Specify a positive gold amount: addgold <amount>');
    } else {
      faithCost = Math.max(10, Math.ceil(amt / AURBIS_GOLD_PER_FAITH));
    }
  } else if (cmd === 'weather' || cmd === 'set_weather') {
    const w = String(args[0] ?? '').toLowerCase();
    if (!w) errorReason = t('apotheosis.aurbis.err.weatherUsage', 'Specify weather type or 0..6.');
    else faithCost = (w === '5' || w === '6' || w === 'thunder' || w === 'storm' || w === 'snow') ? 45 : 35;
  } else if (cmd === 'time' || cmd === 'set_time') {
    const sub = String(args[0] ?? '').toLowerCase();
    if (sub === 'add') {
      const m = String(args[1] ?? '').match(/^(\d+)([mhd]?)$/i);
      const val = m ? Math.max(1, parseInt(m[1], 10) || 1) : 1;
      const unit = (m?.[2] || 'h').toLowerCase();
      const extra = unit === 'd' ? val * 15 : unit === 'h' ? val * 2 : 1;
      faithCost = 25 + Math.min(200, extra);
    } else {
      faithCost = 25;
    }
  } else if (cmd === 'advance_time' || cmd === 'advancetime' || cmd === 'pass_time' || cmd === 'passtime') {
    const hrs = Math.max(1, Math.min(1000, parseInt(args[0] ?? '1', 10) || 1));
    faithCost = 25 + Math.min(100, hrs * 2);
  } else if (cmd === 'advance_days' || cmd === 'advancedays' || cmd === 'pass_days') {
    const days = Math.max(1, Math.min(365, parseInt(args[0] ?? '1', 10) || 1));
    faithCost = 40 + Math.min(200, days * 15);
  } else if (cmd === 'spawn' || cmd === 'spawnfoe') {
    if (!args.length) {
      errorReason = t('apotheosis.aurbis.err.spawnUsage', 'Usage: spawnfoe <id|name> [count]');
    } else {
      const unitCost = getSpawnCreatureFaithCost(args[0]);
      const count = args[1] ? Math.max(1, Math.min(20, parseInt(args[1], 10) || 1)) : 1;
      faithCost = unitCost * count;
    }
  } else if (cmd === 'necro_spawn') {
    faithCost = 60;
  } else if (cmd === 'necro_corpse') {
    faithCost = 30;
  } else if (cmd === 'encounter') {
    faithCost = 75;
  } else if (cmd === 'killall') {
    faithCost = 150;
  } else if (cmd === 'kill') {
    faithCost = 80;
  } else if (cmd === 'tele2loc' || cmd === 'teleport' || cmd === 'tp' || cmd === '/tp') {
    faithCost = 180;
  } else if (cmd === 'telecrisis') {
    faithCost = 180;
  } else if (cmd === 'crisis') {
    const sub = String(args[0] || 'status').toLowerCase();
    if (sub === 'status') {
      faithCost = 0;
    } else if (sub === 'tp' || sub === 'goto' || sub === 'jump') {
      faithCost = 180;
    } else if (sub === 'tick' || sub === 'sim') {
      faithCost = 500;
    } else if (sub === 'start' || sub === 'stop') {
      const target = String(args[1] ?? '').toLowerCase();
      if (sub === 'start' && !MACRO_CRISIS_TYPES.has(target) && !REGION_FLAG_LOWER_NAMES.has(target)) {
        errorReason = t('apotheosis.aurbis.err.crisisTarget', 'Specify war, plague, famine, civil_strife, or a REGION_FLAGS name.');
      } else if (REGION_FLAG_LOWER_NAMES.has(target)) {
        faithCost = 250;
      } else {
        faithCost = sub === 'start' ? 500 : 450;
      }
    } else {
      errorReason = t('apotheosis.aurbis.err.crisisUsage', 'Usage: crisis <status|start|stop|tp|tick>');
    }
  } else if (cmd === 'living') {
    const scope = String(args[0] || '').toLowerCase();
    const sub = String(args[1] || '').toLowerCase();
    if ((scope === 'adv' || scope === 'adventurer') && sub === 'list') {
      faithCost = 0;
    } else if ((scope === 'adv' || scope === 'adventurer') && sub === 'tick') {
      const days = Math.max(1, Math.min(30, parseInt(args[2], 10) || 1));
      faithCost = 100 + days * 50;
    } else if ((scope === 'adv' || scope === 'adventurer') && (sub === 'kill_in_dungeon' || sub === 'setlevel')) {
      faithCost = 120;
    } else {
      errorReason = t('apotheosis.aurbis.err.livingUsage', 'Usage: living adv <tick <days> | list | kill_in_dungeon | setlevel>');
    }
  } else if (cmd === 'bounty') {
    const sub = String(args[0] || 'get').toLowerCase();
    if (sub === 'get') {
      faithCost = 0;
    } else if (sub === 'clear') {
      const curReg = args[1] && !Number.isNaN(parseInt(args[1], 10))
        ? parseInt(args[1], 10)
        : (Number.isInteger(entity?.currentRegionIndex) ? entity.currentRegionIndex : 17);
      const bountyAmt = Number(entity?.regionalBounties?.[curReg] ?? 0) || 0;
      faithCost = Math.max(30, Math.ceil(bountyAmt / 20));
    } else if (sub === 'set') {
      faithCost = 60;
    } else {
      errorReason = t('apotheosis.aurbis.err.bountyUsage', 'Usage: bounty <get|clear|set <gold>> [region]');
    }
  } else if (cmd === 'legalrep') {
    const sub = String(args[0] || 'get').toLowerCase();
    if (sub === 'get') faithCost = 0;
    else if (sub === 'set' || sub === 'clear') faithCost = 50;
    else errorReason = t('apotheosis.aurbis.err.legalrepUsage', 'Usage: legalrep <get|set <val>|clear> [region]');
  } else if (cmd === 'map_revealall') {
    faithCost = 120;
  } else if (cmd === 'map_reveallocations') {
    faithCost = 100;
  } else if (cmd === 'map_reveallocation') {
    faithCost = 80;
  } else if (cmd === 'map_hideall' || cmd === 'map_hidelocations') {
    faithCost = 60;
  } else if (
    cmd === 'help' ||
    cmd === 'date' ||
    cmd === 'calendar' ||
    cmd === 'get_time' ||
    cmd === 'spawnlist' ||
    cmd === 'list_revenants' ||
    cmd === 'revenants' ||
    cmd === 'retinue'
  ) {
    faithCost = 0;
  } else {
    return {
      allowed: false,
      forbidden: false,
      cmd,
      args,
      faithCost: 0,
      witnessDelta: 0,
      alignment: 'neutral',
      reason: t('apotheosis.aurbis.err.unknown', '"{cmd}" is not recognized by the Scroll of Aurbis.', { cmd }),
    };
  }

  if (errorReason) {
    return {
      allowed: false,
      forbidden: false,
      cmd,
      args,
      faithCost: 0,
      witnessDelta: 0,
      alignment: 'neutral',
      reason: errorReason,
    };
  }

  const preview = faithCost > 0
    ? evaluateMiracleWitnessReaction(entity, cmd, args, { witnessCount, apply: false })
    : { delta: 0, alignment: 'neutral', capped: false };

  return {
    allowed: true,
    forbidden: false,
    cmd,
    args,
    faithCost,
    witnessDelta: preview.delta,
    alignment: preview.alignment,
    witnessCapped: preview.capped,
    reason: null,
  };
}

/**
 * Executes a validated Scroll of Aurbis command, spending Faith and applying
 * witness reactions. `portal` defers Faith deduction until a map destination is picked.
 */
export async function executeAurbisCommand(rawLine, entity, {
  executeCommandFn = null,
  openPortalFn = null,
  witnessCount = null,
  nowMinutes = null,
} = {}) {
  const apo = normalizeStage2Fields(entity);
  if (!isAscendedGod(entity)) {
    return { ok: false, error: t('apotheosis.err.notAscendedFaith', 'Ascend to Godhood before wielding the Scroll of Aurbis.') };
  }

  const runtime = getAurbisRuntime();
  const sceneCtx = runtime.getSceneContext?.() ?? null;
  const resolvedWitnesses = witnessCount != null
    ? Math.max(0, Math.trunc(Number(witnessCount) || 0))
    : (apo.debugWitnessCount != null
      ? apo.debugWitnessCount
      : Math.max(0, Math.trunc(Number(sceneCtx?.getNearbyWitnessCount?.() ?? 0))));

  const evaluation = evaluateAurbisCommand(rawLine, entity, { witnessCount: resolvedWitnesses });
  if (!evaluation.allowed) {
    return { ok: false, forbidden: evaluation.forbidden, error: evaluation.reason, evaluation };
  }

  if (apo.faith < evaluation.faithCost) {
    return {
      ok: false,
      insufficientFaith: true,
      error: t('apotheosis.err.insufficientFaith', 'Insufficient Faith ({cur}/{req}).', {
        cur: apo.faith,
        req: evaluation.faithCost,
      }),
      evaluation,
    };
  }

  const exec = executeCommandFn ?? runtime.executeCommand;
  const effectiveNow = nowMinutes ?? entity?._lastWorldMinutes ?? 0;

  // Special portal handling: Portal Stone travel map charges Faith only once player picks a destination!
  if (evaluation.cmd === 'portal') {
    const portalOpener = openPortalFn ?? (sceneCtx?.apotheosisOpenPortal
      ? ({ onPickSpend }) => sceneCtx.apotheosisOpenPortal({ onPickSpend })
      : null);
    if (!portalOpener) {
      return {
        ok: false,
        error: t('apotheosis.aurbis.err.portalUnavailable', 'Divine Portal cannot be opened in this scene.'),
        evaluation,
      };
    }
    let committed = false;
    let portalWitnessDelta = 0;
    const opened = portalOpener({
      cost: evaluation.faithCost,
      onPickSpend: () => {
        const pay = spendApotheosisFaith(entity, evaluation.faithCost, { reason: 'aurbis_portal' });
        if (!pay.ok) return pay;
        committed = true;
        if (resolvedWitnesses > 0) {
          const wRes = evaluateMiracleWitnessReaction(entity, 'portal', [], {
            witnessCount: resolvedWitnesses,
            nowMinutes: effectiveNow,
            apply: true,
          });
          portalWitnessDelta = wRes.delta;
        }
        return { ok: true, faithRemaining: apo.faith, witnessDelta: portalWitnessDelta };
      },
    });
    if (opened === false) {
      return {
        ok: false,
        error: t('apotheosis.aurbis.err.portalRefused', 'The Divine Portal could not be opened right now.'),
        evaluation,
      };
    }
    return {
      ok: true,
      deferred: !committed,
      cmd: evaluation.cmd,
      args: evaluation.args,
      faithSpent: committed ? evaluation.faithCost : 0,
      witnessDelta: portalWitnessDelta,
      newFaith: apo.faith,
      faithMax: getFaithMax(apo),
      output: committed
        ? t('apotheosis.aurbis.portalOpened', 'Gates of Aurbis torn open (-{cost} Faith).', { cost: evaluation.faithCost })
        : t('apotheosis.aurbis.portalMapOpened', 'Opened Divine Portal map ({cost} Faith upon destination selection).', { cost: evaluation.faithCost }),
      evaluation,
    };
  }

  if (typeof exec !== 'function') {
    return { ok: false, error: 'Console command runner unavailable.', evaluation };
  }

  const faithBefore = apo.faith;
  const spend = spendApotheosisFaith(entity, evaluation.faithCost, { reason: `aurbis_${evaluation.cmd}` });
  if (!spend.ok) return { ...spend, evaluation };

  let output = '';
  try {
    const rawOut = await exec(evaluation.cmd, evaluation.args);
    output = rawOut == null ? '' : String(rawOut);
  } catch (err) {
    // Refund Faith if the underlying command failed to run cleanly
    apo.faith = faithBefore;
    return {
      ok: false,
      error: `Miracle misfired: ${err?.message ?? err}`,
      newFaith: apo.faith,
      evaluation,
    };
  }

  if (/^(?:unknown\b|usage:|error:|err:|failed\b|unable to\b|cannot\b|can't\b|invalid\b|not found\b|item not found\b|no active\b|no region\b|unavailable\b|no such\b)/i.test(output.trim())) {
    apo.faith = faithBefore;
    return {
      ok: false,
      error: output.trim() || 'Miracle could not be enacted.',
      newFaith: apo.faith,
      evaluation,
    };
  }

  let witnessDelta = 0;
  let witnessAlignment = 'neutral';
  if (evaluation.faithCost > 0 && resolvedWitnesses > 0) {
    const wRes = evaluateMiracleWitnessReaction(entity, evaluation.cmd, evaluation.args, {
      witnessCount: resolvedWitnesses,
      nowMinutes: effectiveNow,
      apply: true,
    });
    witnessDelta = wRes.delta;
    witnessAlignment = wRes.alignment;
  }

  return {
    ok: true,
    cmd: evaluation.cmd,
    args: evaluation.args,
    output,
    faithSpent: evaluation.faithCost,
    witnessCount: resolvedWitnesses,
    witnessDelta,
    witnessAlignment,
    newFaith: apo.faith,
    faithMax: getFaithMax(apo),
    evaluation,
  };
}

export {
  APOTHEOSIS_FAITH_BASE_MAX,
  APOTHEOSIS_INITIAL_FAITH,
  APOTHEOSIS_MYTHIC_DECAY_FLAT,
  APOTHEOSIS_PORTFOLIO_SWITCH_COST,
  APOTHEOSIS_REBIRTH_FAITH_COST,
  getFaithMax,
};
