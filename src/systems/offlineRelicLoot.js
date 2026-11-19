// @ts-check
// ═══════════════════════════════════════════════════════════════════
// OFFLINE PRE-APOTHEOSIS RELIC LOOT (Daggerfall Forever)
//
// Brings DFO's online-only items, sets, gilded weapons, Dwarven guns,
// Boss Cards, Deadlands Embers, and Starfall Glass into offline single-
// player drops in thematic locations BEFORE Apotheosis (levels 6..16+,
// well ahead of Level 30 Ascension).
//
// All items are minted exclusively through canonical factories so every
// item passes itemLaw.js (`itemFindings(item).length === 0`) and calls
// run AFTER existing seeded loot rolls (Loot-II-Arc Law #9).
// ═══════════════════════════════════════════════════════════════════

import { DUNGEON_TYPES } from '../formats/mapsFile.js';
import { MOBILE_TYPES } from '../characters/mobile/mobileTypes.js';
import { PASS_CONSTRUCT_MOBILES } from '../net/battlePassLaw.js';
import { AETHERIC_RECORDS, mintAetheric } from './aetheric.js';
import {
  HOURLOCK,
  DRAGONFIRE_OATH,
  SUNKEN_SOVEREIGN,
  VOLENDRUNGS_ECHO,
  KETCHMASTERS_WORD,
  mintGilded,
} from './gilded.js';
import { createThunderlock, createPellets, PELLET_TEMPLATE } from './thunderlock.js';
import { createPistolet } from './pistolet.js';
import { mintResonantMaul } from './pass/resonantMaul.js';
import { EG_LORD_ARMS, egLordArm } from './eliteGates/egLordArms.js';
import { sigilStone, isSigilStone } from './gate/gateSpoils.js';
import { starglass, isStarglass } from './starfall/starglass.js';
import { BOSS_CARDS } from './bossCards.js';
import { mintIliacCard } from './iliac/iliacItems.js';
import { applyRarity, legendaryById, lootRarityOn, stampWonWeapons, corpseSource } from './loot/lootRarity.js';
import { ENEMY_BASICS } from '../characters/enemy/enemyBasics.js';
import { registerLootSupply, titledFoe } from './foeLootCap.js';

let _foundDay = () => null;
let _noteFind = () => false;

/** Registered by lootCodex.js so roll/console paths stay acyclic from worldTick.js. */
export function setRelicCodexBridge({ foundDay, noteFind } = {}) {
  if (typeof foundDay === 'function') _foundDay = foundDay;
  if (typeof noteFind === 'function') _noteFind = noteFind;
}

export const noteRelicFind = (item, opts) => _noteFind(item, opts);

// Ensure rare offline currencies / ammo are never pruned by capFoeLoot's 3-item plain-foe limit.
registerLootSupply(
  'offlineRelicCurrencies',
  (it) => isSigilStone(it) || isStarglass(it) || (it?.group === 'Weapons' && it.templateIndex === PELLET_TEMPLATE),
);

const SET_RECORDS = (() => {
  /** @type {Record<string, any[]>} */
  const map = {};
  for (const r of AETHERIC_RECORDS) {
    (map[r.set] ??= []).push(r);
  }
  for (const k of Object.keys(map)) Object.freeze(map[k]);
  return Object.freeze(map);
})();

/** @type {Set<number>} */
const DAEDRA_MOBILES = new Set([
  MOBILE_TYPES.FrostDaedra,
  MOBILE_TYPES.FireDaedra,
  MOBILE_TYPES.Daedroth,
  MOBILE_TYPES.DaedraSeducer,
  MOBILE_TYPES.DaedraLord,
]);

/** @type {Set<number>} */
const HIGH_UNDEAD_MOBILES = new Set([
  MOBILE_TYPES.Vampire,
  MOBILE_TYPES.VampireAncient,
  MOBILE_TYPES.Lich,
  MOBILE_TYPES.AncientLich,
]);

/** @type {Set<number>} */
const CONSTRUCT_MOBILES = new Set(PASS_CONSTRUCT_MOBILES);
/** @type {Set<number>} */
const SEA_MONSTER_MOBILES = new Set([MOBILE_TYPES.Dreugh, MOBILE_TYPES.Lamia]);
/** @type {Set<number>} */
const ORC_ELITE_MOBILES = new Set([MOBILE_TYPES.OrcSergeant, MOBILE_TYPES.OrcShaman, MOBILE_TYPES.OrcWarlord]);
/** @type {Set<number>} */
const WITCH_FOE_MOBILES = new Set([
  MOBILE_TYPES.DaedraSeducer,
  MOBILE_TYPES.Mage,
  MOBILE_TYPES.Spellsword,
  MOBILE_TYPES.Battlemage,
  MOBILE_TYPES.Sorcerer,
  MOBILE_TYPES.Nightblade,
]);
/** @type {Set<number>} */
const KNIGHT_FOE_MOBILES = new Set([MOBILE_TYPES.Warrior, MOBILE_TYPES.Knight, MOBILE_TYPES.Battlemage]);
/** @type {Set<number>} */
const ROGUE_FOE_MOBILES = new Set([MOBILE_TYPES.Rogue, MOBILE_TYPES.Burglar, MOBILE_TYPES.Thief, MOBILE_TYPES.Assassin]);

/** Pre-Apotheosis thematic Aetheric sets per dungeon type (all unlock at Lv 12+). */
export const DUNGEON_AETHERIC_SETS = Object.freeze({
  [DUNGEON_TYPES.Coven]: Object.freeze(['wyrd', 'starspun']),
  [DUNGEON_TYPES.VolcanicCaves]: Object.freeze(['ruhn', 'panoply']),
  [DUNGEON_TYPES.DesecratedTemple]: Object.freeze(['ruhn', 'panoply']),
  [DUNGEON_TYPES.Laboratory]: Object.freeze(['numidium']),
  [DUNGEON_TYPES.Mine]: Object.freeze(['numidium']),
  [DUNGEON_TYPES.OrcStronghold]: Object.freeze(['orcsbane']),
  [DUNGEON_TYPES.HumanStronghold]: Object.freeze(['oath']),
  [DUNGEON_TYPES.RuinedCastle]: Object.freeze(['oath']),
  [DUNGEON_TYPES.Prison]: Object.freeze(['thieftaker', 'eltheric']),
  [DUNGEON_TYPES.BarbarianStronghold]: Object.freeze(['thieftaker']),
  [DUNGEON_TYPES.NaturalCave]: Object.freeze(['coilscale', 'eltheric']),
});

/** Pre-Apotheosis thematic Battlespire Lord legendaries per dungeon type (Lv 16+). */
export const DUNGEON_LORD_POOLS = Object.freeze({
  [DUNGEON_TYPES.Crypt]: Object.freeze(['cairnkeeper', 'morvayn']),
  [DUNGEON_TYPES.VampireHaunt]: Object.freeze(['cairnkeeper', 'stalker', 'morvayn']),
  [DUNGEON_TYPES.Cemetery]: Object.freeze(['cairnkeeper']),
  [DUNGEON_TYPES.Coven]: Object.freeze(['spellmaster', 'dusk']),
  [DUNGEON_TYPES.Laboratory]: Object.freeze(['spellmaster', 'colossus']),
  [DUNGEON_TYPES.Mine]: Object.freeze(['colossus']),
  [DUNGEON_TYPES.OrcStronghold]: Object.freeze(['garoth', 'ilthys']),
  [DUNGEON_TYPES.GiantStronghold]: Object.freeze(['garoth']),
  [DUNGEON_TYPES.HumanStronghold]: Object.freeze(['armsmaster', 'twins']),
  [DUNGEON_TYPES.RuinedCastle]: Object.freeze(['armsmaster', 'twins']),
  [DUNGEON_TYPES.DragonsDen]: Object.freeze(['wyrm', 'hound']),
  [DUNGEON_TYPES.VolcanicCaves]: Object.freeze(['wyrm', 'hound', 'ilthys']),
  [DUNGEON_TYPES.DesecratedTemple]: Object.freeze(['hound', 'seyth', 'ilthys']),
  [DUNGEON_TYPES.Prison]: Object.freeze(['stalker', 'seyth']),
  [DUNGEON_TYPES.BarbarianStronghold]: Object.freeze(['dusk', 'garoth']),
  [DUNGEON_TYPES.NaturalCave]: Object.freeze(['stalker', 'dusk']),
});

/** Pre-Apotheosis Boss Card keys mapped per dungeon type and mobile type. */
export const DUNGEON_BOSS_CARD_POOLS = Object.freeze({
  [DUNGEON_TYPES.VolcanicCaves]: Object.freeze(['gate', 'hound', 'wyrm']),
  [DUNGEON_TYPES.DesecratedTemple]: Object.freeze(['gate', 'ilthys', 'seyth']),
  [DUNGEON_TYPES.DragonsDen]: Object.freeze(['wyrm', 'gate']),
  [DUNGEON_TYPES.Laboratory]: Object.freeze(['abyss', 'colossus', 'spellmaster']),
  [DUNGEON_TYPES.Mine]: Object.freeze(['abyss', 'colossus']),
  [DUNGEON_TYPES.Coven]: Object.freeze(['spellmaster', 'dusk']),
  [DUNGEON_TYPES.OrcStronghold]: Object.freeze(['garoth', 'ilthys']),
  [DUNGEON_TYPES.GiantStronghold]: Object.freeze(['garoth']),
  [DUNGEON_TYPES.HumanStronghold]: Object.freeze(['armsmaster', 'twins']),
  [DUNGEON_TYPES.RuinedCastle]: Object.freeze(['armsmaster', 'twins']),
  [DUNGEON_TYPES.Crypt]: Object.freeze(['cairnkeeper', 'morvayn']),
  [DUNGEON_TYPES.VampireHaunt]: Object.freeze(['cairnkeeper', 'morvayn', 'stalker']),
  [DUNGEON_TYPES.Prison]: Object.freeze(['stalker', 'seyth']),
  [DUNGEON_TYPES.BarbarianStronghold]: Object.freeze(['dusk', 'garoth']),
  [DUNGEON_TYPES.NaturalCave]: Object.freeze(['serpent', 'stalker']),
});

const pick = (list, rolls) => (list?.length ? list[Math.min(list.length - 1, Math.floor(rolls() * list.length))] : null);

/** Bias 70% toward records not yet in the player's Codex when any unfound remain. */
function pickUnfoundBiased(records, kind, rolls) {
  if (!records?.length) return null;
  if (kind && rolls() < 0.7) {
    const unfound = records.filter((r) => _foundDay(kind, r.id) == null);
    if (unfound.length) return pick(unfound, rolls);
  }
  return pick(records, rolls);
}

/**
 * Mint an offline Dwarven gun (Thunderlock 560, Pistolet 562, or Legendary The Last Lock).
 * Always lawful in `itemLaw.js`; callers must bundle Dwemer Pellets separately.
 * @param {'thunderlock'|'pistolet'|'lastlock'} kind
 * @param {() => number} [rolls]
 */
export function mintOfflineGun(kind = 'thunderlock', rolls = Math.random) {
  const gun = kind === 'pistolet' ? createPistolet() : createThunderlock();
  if (kind === 'lastlock') {
    const lastLock = legendaryById('the-last-lock');
    applyRarity(gun, 'legendary', rolls, lastLock ? [lastLock] : null);
  } else if (rolls() < 0.15) {
    const lastLock = legendaryById('the-last-lock');
    applyRarity(gun, 'legendary', rolls, lastLock ? [lastLock] : null);
  } else {
    applyRarity(gun, 'rare', rolls);
    stampWonWeapons([gun], 1, { rolls });
  }
  gun.isIdentified = true;
  return gun;
}

function resolveAethericSetsForContext({ source, dungeonType, mobileType }) {
  if (source === 'sea') return ['coilscale', 'eltheric'];
  if (CONSTRUCT_MOBILES.has(mobileType)) return ['numidium'];
  if (SEA_MONSTER_MOBILES.has(mobileType)) return ['coilscale', 'eltheric'];
  if (ORC_ELITE_MOBILES.has(mobileType)) return ['orcsbane'];
  if (mobileType === MOBILE_TYPES.DaedraLord || HIGH_UNDEAD_MOBILES.has(mobileType)) return ['ruhn', 'panoply'];
  if (mobileType === MOBILE_TYPES.DaedraSeducer) return ['wyrd', 'starspun'];
  const byDungeon = DUNGEON_AETHERIC_SETS[dungeonType];
  if (byDungeon?.length) return byDungeon;
  if (DAEDRA_MOBILES.has(mobileType)) return ['ruhn', 'panoply'];
  if (KNIGHT_FOE_MOBILES.has(mobileType)) return ['oath'];
  if (ROGUE_FOE_MOBILES.has(mobileType)) return ['thieftaker'];
  if (WITCH_FOE_MOBILES.has(mobileType)) return ['wyrd', 'starspun'];
  return [];
}

function resolveLordPoolForContext({ source, dungeonType, mobileType }) {
  if (CONSTRUCT_MOBILES.has(mobileType)) return ['colossus'];
  if (mobileType === MOBILE_TYPES.DaedraLord) return ['hound', 'ilthys', 'wyrm'];
  if (mobileType === MOBILE_TYPES.AncientLich || mobileType === MOBILE_TYPES.VampireAncient) return ['cairnkeeper', 'morvayn'];
  if (source === 'sea') return ['seyth', 'stalker'];
  return DUNGEON_LORD_POOLS[dungeonType] ?? Object.keys(EG_LORD_ARMS);
}

function resolveBossCardPoolForContext({ source, dungeonType, mobileType }) {
  if (source === 'sea' || SEA_MONSTER_MOBILES.has(mobileType)) return ['serpent', 'seyth'];
  if (CONSTRUCT_MOBILES.has(mobileType)) return ['abyss', 'colossus'];
  if (mobileType === MOBILE_TYPES.DaedraLord) return ['gate', 'hound', 'wyrm'];
  if (mobileType === MOBILE_TYPES.AncientLich || mobileType === MOBILE_TYPES.Lich) return ['cairnkeeper', 'morvayn'];
  if (mobileType === MOBILE_TYPES.DaedraSeducer) return ['spellmaster', 'dusk'];
  return DUNGEON_BOSS_CARD_POOLS[dungeonType] ?? ['gate', 'abyss'];
}

function addGildedForContext({ source, dungeonType, mobileType, out, rolls }) {
  const dwemerPool =
    dungeonType === DUNGEON_TYPES.Laboratory || dungeonType === DUNGEON_TYPES.Mine || CONSTRUCT_MOBILES.has(mobileType);
  const seaPool =
    source === 'sea' ||
    dungeonType === DUNGEON_TYPES.Prison ||
    dungeonType === DUNGEON_TYPES.NaturalCave ||
    SEA_MONSTER_MOBILES.has(mobileType);
  const daedraPool =
    dungeonType === DUNGEON_TYPES.DragonsDen ||
    dungeonType === DUNGEON_TYPES.VolcanicCaves ||
    dungeonType === DUNGEON_TYPES.DesecratedTemple ||
    mobileType === MOBILE_TYPES.DaedraLord;

  /** @type {any[]} */
  const candidates = [];
  if (dwemerPool) candidates.push(HOURLOCK, VOLENDRUNGS_ECHO);
  if (seaPool) candidates.push(SUNKEN_SOVEREIGN, KETCHMASTERS_WORD);
  if (daedraPool) candidates.push(DRAGONFIRE_OATH);
  if (!candidates.length) candidates.push(HOURLOCK, DRAGONFIRE_OATH, SUNKEN_SOVEREIGN);

  const chosen = pickUnfoundBiased(candidates, 'gilded', rolls);
  if (!chosen) return;
  const g = mintGilded(chosen);
  if (g) out.push(g);
  if (chosen === VOLENDRUNGS_ECHO || chosen === KETCHMASTERS_WORD) {
    out.push(createPellets(24));
  }
}

/**
 * Roll offline pre-Apotheosis relics, currencies, guns, gilded weapons, and boss cards.
 * Returns [] if Loot Rarity is disabled or context isn't eligible.
 *
 * @param {{
 *   source: 'foe' | 'pile' | 'sea',
 *   level?: number,
 *   dungeonType?: number | null,
 *   mobileType?: number | null,
 *   entity?: any,
 *   titled?: boolean,
 *   boss?: boolean,
 *   eliteDungeon?: boolean,
 *   tier?: number,
 * }} ctx
 * @param {() => number} [rolls]
 * @returns {any[]}
 */
export function rollOfflinePreApotheosisSpoils(ctx = { source: 'foe' }, rolls = Math.random) {
  if (!lootRarityOn()) return [];

  const source = ctx.source ?? 'foe';
  const level = Math.max(1, Math.trunc(Number(ctx.level) || 1));
  const dungeonType = Number.isInteger(ctx.dungeonType) ? ctx.dungeonType : -1;
  const mobileType = Number.isInteger(ctx.mobileType) ? ctx.mobileType : -1;
  const titled = !!(ctx.titled ?? (ctx.entity ? titledFoe(ctx.entity) : false));
  const computedBoss = source === 'foe' && mobileType >= 0
    ? corpseSource(ENEMY_BASICS[mobileType], ctx.entity?.level ?? level, mobileType).boss
    : false;
  const isBoss = !!(ctx.boss ?? (titled || computedBoss || (source === 'sea' && (ctx.tier ?? 0) >= 8)));
  const eliteMult = ctx.eliteDungeon ? 1.35 : 1;

  /** @type {any[]} */
  const out = [];

  const isDwemerCtx =
    dungeonType === DUNGEON_TYPES.Laboratory || dungeonType === DUNGEON_TYPES.Mine || CONSTRUCT_MOBILES.has(mobileType);
  const isSeaCtx =
    source === 'sea' ||
    dungeonType === DUNGEON_TYPES.Prison ||
    dungeonType === DUNGEON_TYPES.NaturalCave ||
    SEA_MONSTER_MOBILES.has(mobileType);
  const isCovenCtx = dungeonType === DUNGEON_TYPES.Coven || mobileType === MOBILE_TYPES.DaedraSeducer;
  const isInfernalCtx =
    dungeonType === DUNGEON_TYPES.VolcanicCaves ||
    dungeonType === DUNGEON_TYPES.DesecratedTemple ||
    dungeonType === DUNGEON_TYPES.DragonsDen ||
    DAEDRA_MOBILES.has(mobileType) ||
    HIGH_UNDEAD_MOBILES.has(mobileType);

  // ── 1. Lv 6+: Deadlands Embers (570) & Starfall Glass (576) ──────────
  if (level >= 6) {
    if (source === 'foe') {
      const emberChance = titled ? 0.5 : DAEDRA_MOBILES.has(mobileType) || HIGH_UNDEAD_MOBILES.has(mobileType) ? 0.25 : 0;
      if (emberChance > 0 && rolls() < Math.min(0.8, emberChance * eliteMult)) {
        const count = titled ? 1 + (rolls() < 0.45 ? 1 : 0) : 1;
        out.push(Object.assign(sigilStone(), { stackCount: count }));
      }
      const glassChance = isCovenCtx ? (titled ? 0.45 : 0.22) : isInfernalCtx && titled ? 0.28 : 0;
      if (glassChance > 0 && rolls() < Math.min(0.75, glassChance * eliteMult)) {
        const count = titled ? 1 + (rolls() < 0.4 ? 1 : 0) : 1;
        out.push(starglass(count));
      }
    } else if (source === 'pile') {
      if ((isCovenCtx || isInfernalCtx) && rolls() < 0.08 * eliteMult) {
        out.push(Object.assign(sigilStone(), { stackCount: 1 }));
      }
      if (isCovenCtx && rolls() < 0.1 * eliteMult) {
        out.push(starglass(1));
      }
    } else if (source === 'sea' && rolls() < 0.15) {
      out.push(Object.assign(sigilStone(), { stackCount: 1 }));
    }
  }

  // ── 2. Lv 10+: Dwemer Pellets, Guns, and 16 Boss Cards ───────────────
  if (level >= 10) {
    // Dwemer Pellets ammo supply from constructs & sea holds
    if (source === 'foe' && CONSTRUCT_MOBILES.has(mobileType) && rolls() < 0.35) {
      out.push(createPellets(4 + Math.floor(rolls() * 9)));
    } else if (source === 'sea' && rolls() < 0.25) {
      out.push(createPellets(6 + Math.floor(rolls() * 10)));
    }

    // Dwarven Thunderlock / Pistolet + 24 Pellets
    const gunChance =
      source === 'foe'
        ? (isDwemerCtx || isSeaCtx) && (isBoss || CONSTRUCT_MOBILES.has(mobileType))
          ? titled ? 0.05 : 0.02
          : 0
        : source === 'pile' && isDwemerCtx
          ? 0.025
          : source === 'sea'
            ? 0.035
            : 0;
    if (gunChance > 0 && rolls() < gunChance * eliteMult) {
      const gunKind = isSeaCtx && (!isDwemerCtx || rolls() < 0.65) ? 'pistolet' : 'thunderlock';
      out.push(mintOfflineGun(gunKind, rolls), createPellets(24));
    }

    // 16 Boss Cards from titled/boss foes & sea/vault hoards
    const cardChance =
      source === 'foe' && (titled || DAEDRA_MOBILES.has(mobileType) || HIGH_UNDEAD_MOBILES.has(mobileType))
        ? titled ? 0.04 : 0.015
        : source === 'sea'
          ? 0.025
          : 0;
    if (cardChance > 0 && rolls() < cardChance * eliteMult) {
      const cardPool = resolveBossCardPoolForContext({ source, dungeonType, mobileType });
      const key = pick(cardPool, rolls);
      const card = key && BOSS_CARDS[key] ? mintIliacCard(BOSS_CARDS[key]) : null;
      if (card) out.push(card);
    }
  }

  // ── 3. Lv 12+: All 10 Aetheric Sets (90 unique pieces) ───────────────
  if (level >= 12) {
    const sets = resolveAethericSetsForContext({ source, dungeonType, mobileType });
    if (sets.length) {
      const setChance =
        source === 'foe'
          ? titled ? 0.08 : isBoss ? 0.04 : 0.015
          : source === 'pile'
            ? 0.022
            : source === 'sea'
              ? 0.075
              : 0;
      if (setChance > 0 && rolls() < Math.min(0.25, setChance * eliteMult)) {
        const setId = pick(sets, rolls);
        const rec = pickUnfoundBiased(SET_RECORDS[setId], 'aetheric', rolls);
        if (rec) out.push(mintAetheric(rec, { party: 1 }));
      }
    }
  }

  // ── 4. Lv 16+: 5 Gilded Weapons, Resonant Maul, 13 EG Lord Arms ──────
  if (level >= 16) {
    const eliteCapable = source === 'sea' || (source === 'foe' && (titled || isBoss)) || (source === 'pile' && ctx.eliteDungeon);
    if (eliteCapable) {
      const gildedChance = source === 'sea' ? 0.025 : titled ? 0.03 : source === 'pile' ? 0.012 : 0.01;
      if (rolls() < gildedChance * eliteMult) {
        addGildedForContext({ source, dungeonType, mobileType, out, rolls });
      }
      if (isDwemerCtx && rolls() < (titled ? 0.035 : 0.015) * eliteMult) {
        const maul = mintResonantMaul(rolls);
        if (maul) out.push(maul);
      }
      const lordChance = titled ? 0.035 : source === 'foe' ? 0.012 : 0.01;
      if (rolls() < lordChance * eliteMult) {
        const lordPool = resolveLordPoolForContext({ source, dungeonType, mobileType });
        const lordKey = pick(lordPool, rolls);
        const arm = lordKey ? egLordArm(lordKey, level, rolls) : null;
        if (arm) out.push(arm);
      }
    }
  }

  return out;
}
