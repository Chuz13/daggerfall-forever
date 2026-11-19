// @ts-check
// ═══════════════════════════════════════════════════════════════════
// OFFLINE SIGIL BROKER & COVEN EXCHANGE (Daggerfall Forever)
//
// Powers the Sigil Broker inside Witches' Covens for single-player /
// offline progression before Apotheosis:
//   - Local save-backed purchase tracking for The Battlemage's Panoply
//     (20 Deadlands Embers per piece of player's choice, no weekly wait)
//   - Coven Exchange:
//       * 1 Starfall Glass (576) -> 2 Deadlands Embers (570)
//       * 5 Starfall Glass (576) -> 1 unfound Wyrd/Starspun Aetheric piece
//       * 1 Duplicate Aetheric piece -> 4 Deadlands Embers
//       * 1 Deadlands Ember -> 25 Dwemer Pellets (561)
// ═══════════════════════════════════════════════════════════════════

import {
  PANOPLY_SET_PIECES,
  WYRD_SET_PIECES,
  STARSPUN_SET_PIECES,
  mintAetheric,
  panoplyPieceById,
} from '../aetheric.js';
import { EG_SINK_EMBERS, EG_PANOPLY_IDS } from '../../net/eliteGates/egPay.js';
import { sigilStone } from '../gate/gateSpoils.js';
import { isStarglass } from '../starfall/starglass.js';
import { createPellets } from '../thunderlock.js';
import { spendableStonesIn, stoneCount, spendStones } from './sigilBroker.js';
import { registerModSaveData } from '../modSaveData.js';
import { addItem } from '../inventory.js';
import { isLocked } from '../item/itemLock.js';
import { isRealmLocked } from '../item/itemBound.js';
import { isEquipped } from '../equip.js';
import { foundDay, noteFind } from '../loot/lootCodex.js';
import { t } from '../textManager.js';

export const OFFLINE_PANOPLY_SAVE_VENDOR = 'OfflinePanoplyBroker';

export const STARGLASS_FOR_EMBERS_COST = 1;
export const STARGLASS_FOR_EMBERS_GAIN = 2;
export const STARGLASS_FOR_WITCH_SET_COST = 5;
export const DUPLICATE_AETHERIC_EMBERS = 4;
export const EMBER_FOR_PELLETS_COST = 1;
export const EMBER_FOR_PELLETS_GAIN = 25;

const PANOPLY_SLOT_LABELS = Object.freeze({
  'panoply-warhelm': 'Helm',
  'panoply-right-pauldron': 'Pauldron',
  'panoply-left-pauldron': 'Pauldron',
  'panoply-cuirass': 'Cuirass',
  'panoply-gauntlets': 'Gauntlets',
  'panoply-greaves': 'Greaves',
  'panoply-boots': 'Boots',
  'panoply-shield': 'Kite Shield',
  'panoply-saber': 'Saber',
});

const NO_PANOPLY_RECORD = () => ({ day: -1, ids: [] });
let _offlinePanoply = NO_PANOPLY_RECORD();

function validOfflinePanoplyRecord(r) {
  if (!r || typeof r !== 'object' || !Number.isSafeInteger(r.day) || !Array.isArray(r.ids)) return NO_PANOPLY_RECORD();
  return {
    day: r.day,
    ids: [...new Set(r.ids.filter((id) => typeof id === 'string' && EG_PANOPLY_IDS.includes(id)))],
  };
}

registerModSaveData(OFFLINE_PANOPLY_SAVE_VENDOR, {
  newSaveData: NO_PANOPLY_RECORD,
  getSaveData: () => ({ day: _offlinePanoply.day, ids: [..._offlinePanoply.ids] }),
  restoreSaveData: (r) => {
    _offlinePanoply = validOfflinePanoplyRecord(r);
  },
  newGame: () => {
    _offlinePanoply = NO_PANOPLY_RECORD();
  },
});

export function offlinePanoplyBoughtIds(day) {
  const d = Math.trunc(Number(day) || 0);
  return _offlinePanoply.day === d ? _offlinePanoply.ids : [];
}

function markOfflinePanoplyBought(id, day) {
  const d = Math.trunc(Number(day) || 0);
  if (_offlinePanoply.day !== d) _offlinePanoply = { day: d, ids: [] };
  if (!_offlinePanoply.ids.includes(id)) _offlinePanoply.ids.push(id);
}

/**
 * Rows for The Battlemage's Panoply in offline mode (compatible with brokerWindow's panoply section).
 * @param {number} day
 */
export function offlinePanoplyRows(day) {
  const bought = new Set(offlinePanoplyBoughtIds(day));
  return EG_PANOPLY_IDS.map((id) => {
    const rec = PANOPLY_SET_PIECES.find((p) => p.id === id);
    return {
      id,
      name: rec?.name ?? id,
      kind: PANOPLY_SLOT_LABELS[id] ?? rec?.group ?? '',
      bought: bought.has(id),
      spent: false,
    };
  });
}

/** Take `countNeeded` matching stackable items after verifying `canCarry(give, rest)`. */
function restAfterStackSpend(items, pred, countNeeded) {
  let left = countNeeded;
  const take = [];
  const rest = [];
  for (const it of items) {
    if (left > 0 && pred(it)) {
      const have = Math.max(1, it.stackCount ?? 1);
      const n = Math.min(left, have);
      take.push({ item: it, count: n });
      left -= n;
      if (n < have) rest.push({ ...it, stackCount: have - n });
    } else {
      rest.push(it);
    }
  }
  return left > 0 ? null : { take, rest };
}

function applyStackTake(items, take) {
  for (const { item, count } of take) {
    const have = Math.max(1, item.stackCount ?? 1);
    const idx = items.indexOf(item);
    if (idx < 0) continue;
    if (count >= have) items.splice(idx, 1);
    else item.stackCount = have - count;
  }
}

/**
 * Offline Panoply purchase: spends EG_SINK_EMBERS (20) Deadlands Embers from `items`,
 * mints `panoplyPieceById(id)` cleanly, and records it for `day`.
 * @param {string} id
 * @param {{ items: any[], day: number, canCarry?: (item: any, rest: any[]) => boolean }} ctx
 */
export function buyOfflinePanoply(id, { items, day, canCarry = () => true }) {
  if (!Array.isArray(items) || !EG_PANOPLY_IDS.includes(id)) return { ok: false, reason: 'piece' };
  const d = Math.trunc(Number(day) || 0);
  if (offlinePanoplyBoughtIds(d).includes(id)) return { ok: false, reason: 'bought' };
  const plan = restAfterStackSpend(items, (it) => isLocked(it) === false && spendableStonesIn([it]).length > 0, EG_SINK_EMBERS);
  if (!plan) return { ok: false, reason: 'stones' };
  const item = panoplyPieceById(id);
  if (!item) return { ok: false, reason: 'piece' };
  if (!canCarry(item, plan.rest)) return { ok: false, reason: 'heavy' };
  if (!spendStones(items, EG_SINK_EMBERS)) return { ok: false, reason: 'stones' };
  addItem(items, item);
  noteFind(item);
  markOfflinePanoplyBought(id, d);
  return { ok: true, item };
}

export const starglassIn = (items) => (Array.isArray(items) ? items.filter((it) => isStarglass(it)) : []);
export const spendableStarglassIn = (items) => starglassIn(items).filter((it) => !isLocked(it));
export const starglassCount = (items) =>
  starglassIn(items).reduce((n, it) => n + Math.max(1, it.stackCount ?? 1), 0);

/** Unlocked, unequipped, non-broker Aetheric relics eligible for trade-in at Coven Brokers. */
export function tradeableAethericsIn(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (it) =>
      it &&
      it.rarity === 'aetheric' &&
      !it.stonesPaid &&
      !isEquipped(it) &&
      !isLocked(it) &&
      !isRealmLocked(it),
  );
}

/**
 * Exchange 1 Starfall Glass (576) for 2 Deadlands Embers (570).
 * @param {{ items: any[], canCarry?: (item: any, rest: any[]) => boolean }} ctx
 */
export function exchangeStarglassForEmbers({ items, canCarry = () => true }) {
  if (!Array.isArray(items)) return { ok: false, reason: 'missing' };
  const plan = restAfterStackSpend(items, (it) => isStarglass(it) && !isLocked(it), STARGLASS_FOR_EMBERS_COST);
  if (!plan) return { ok: false, reason: 'starglass' };
  const reward = Object.assign(sigilStone(), { stackCount: STARGLASS_FOR_EMBERS_GAIN });
  if (!canCarry(reward, plan.rest)) return { ok: false, reason: 'heavy' };
  applyStackTake(items, plan.take);
  addItem(items, reward);
  return {
    ok: true,
    stones: STARGLASS_FOR_EMBERS_GAIN,
    item: reward,
    text: t('broker.coven.gotEmbers', 'The coven claims your Starfall Glass and gives you {n} Deadlands Embers.', {
      n: STARGLASS_FOR_EMBERS_GAIN,
    }),
  };
}

/**
 * Exchange 5 Starfall Glass (576) for 1 unfound Wyrd's Raiment or Starspun Weave Aetheric piece.
 * @param {{ items: any[], canCarry?: (item: any, rest: any[]) => boolean, rolls?: () => number, isFound?: (id: string) => boolean }} ctx
 */
export function exchangeStarglassForWitchPiece({
  items,
  canCarry = () => true,
  rolls = Math.random,
  isFound = (id) => foundDay('aetheric', id) != null,
}) {
  if (!Array.isArray(items)) return { ok: false, reason: 'missing' };
  const plan = restAfterStackSpend(items, (it) => isStarglass(it) && !isLocked(it), STARGLASS_FOR_WITCH_SET_COST);
  if (!plan) return { ok: false, reason: 'starglass' };
  const pool = [...WYRD_SET_PIECES, ...STARSPUN_SET_PIECES];
  const unfound = pool.filter((r) => !isFound(r.id));
  const pickFrom = unfound.length ? unfound : pool;
  const rec = pickFrom[Math.min(pickFrom.length - 1, Math.floor(rolls() * pickFrom.length))];
  const item = mintAetheric(rec, { party: 1 });
  if (!canCarry(item, plan.rest)) return { ok: false, reason: 'heavy' };
  applyStackTake(items, plan.take);
  addItem(items, item);
  noteFind(item);
  return {
    ok: true,
    item,
    text: t('broker.coven.gotWitchPiece', 'The coven weaves the starlight into {name}.', { name: item.name }),
  };
}

/**
 * Trade in a dropped Aetheric piece (e.g., duplicate) for 4 Deadlands Embers.
 * Never touches Broker-bought wares (`stonesPaid > 0`), worn pieces, or locked items.
 * @param {any} item
 * @param {{ items: any[] }} ctx
 */
export function exchangeAethericForEmbers(item, { items }) {
  if (!Array.isArray(items) || !item || !items.includes(item)) return { ok: false, reason: 'gone' };
  if (item.rarity !== 'aetheric' || item.stonesPaid) return { ok: false, reason: 'not' };
  if (isEquipped(item)) return { ok: false, reason: 'worn' };
  if (isLocked(item) || isRealmLocked(item)) return { ok: false, reason: 'locked' };
  const idx = items.indexOf(item);
  items.splice(idx, 1);
  const reward = Object.assign(sigilStone(), { stackCount: DUPLICATE_AETHERIC_EMBERS });
  addItem(items, reward);
  return {
    ok: true,
    stones: DUPLICATE_AETHERIC_EMBERS,
    item: reward,
    text: t('broker.coven.tradedAetheric', 'Traded {name} for {n} Deadlands Embers.', {
      name: item.name,
      n: DUPLICATE_AETHERIC_EMBERS,
    }),
  };
}

/**
 * Exchange 1 Deadlands Ember (570) for 25 Dwemer Pellets (561).
 * @param {{ items: any[], canCarry?: (item: any, rest: any[]) => boolean }} ctx
 */
export function exchangeEmberForPellets({ items, canCarry = () => true }) {
  if (!Array.isArray(items)) return { ok: false, reason: 'missing' };
  const spendable = spendableStonesIn(items);
  if (stoneCount(spendable) < EMBER_FOR_PELLETS_COST) return { ok: false, reason: 'stones' };
  const rest = [];
  let left = EMBER_FOR_PELLETS_COST;
  for (const it of items) {
    if (left > 0 && spendable.includes(it)) {
      const have = Math.max(1, it.stackCount ?? 1);
      const n = Math.min(left, have);
      left -= n;
      if (n < have) rest.push({ ...it, stackCount: have - n });
    } else {
      rest.push(it);
    }
  }
  const pellets = createPellets(EMBER_FOR_PELLETS_GAIN);
  if (!canCarry(pellets, rest)) return { ok: false, reason: 'heavy' };
  if (!spendStones(items, EMBER_FOR_PELLETS_COST)) return { ok: false, reason: 'stones' };
  addItem(items, pellets);
  return {
    ok: true,
    item: pellets,
    text: t('broker.coven.gotPellets', 'Bought {n} Dwemer Pellets for 1 Deadlands Ember.', {
      n: EMBER_FOR_PELLETS_GAIN,
    }),
  };
}

export function _resetOfflineBrokerForTests() {
  _offlinePanoply = NO_PANOPLY_RECORD();
}
