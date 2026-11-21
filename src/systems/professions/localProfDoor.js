// @ts-check
// ═══════════════════════════════════════════════════════════════════
// LOCAL PROFESSIONS DOOR (Daggerfall Forever)
//
// Standalone offline door adapter implementing the accountProf / server
// protocol for professions, gathering, crafting, and materials storage.
// Backed directly by playerEntity save data and local state laws.
// ═══════════════════════════════════════════════════════════════════

import {
  PROFESSIONS,
  trackOf,
  rankOfXp,
  harvestXp,
  herbXpTier,
  haulTier,
  basketStep,
  smeltRecipe,
  smeltXp,
  materialOf,
  FISH_KEY,
  herbKey,
  hideOfFoe,
  HIGH_HIDE_TIER,
  HAUL_YIELD,
  SURVEYOR,
  trophyHunted,
} from '../../net/professionLaw.js';
import {
  parseNodeKey,
  tree,
  herbPatch,
  vein,
  boulder,
  dungeonVein,
  bodyFinds,
  hideYield,
  treeYield,
  herbYield,
  veinYield,
  boulderYield,
  haulYield,
  treeFinds,
  veinGem,
  haulFinds,
  basketFood,
  foodYield,
  FOOD_YIELD,
  TREE_YIELD,
  HERB_YIELD,
  VEIN_YIELD,
  BOULDER_YIELD,
  herbSeasonMult,
  daySeason,
  haulAtSea,
} from '../../net/nodeLaw.js';
import { clampCarried, heldOk } from '../../net/bagLaw.js';
import { firmamentStats } from '../firmamentLive.js';
import { yieldPct, xpPct, scaleQty, scaleXp } from '../../net/firmament/firmamentLaw.js';
import {
  recipeById,
  recipeInputs,
  craftXp,
  qualitySteps,
  FIRST_MAKE_FLOOR,
} from '../../net/recipeLaw.js';
import {
  temperCost,
} from '../../net/temperLaw.js';
import {
  potionById,
  brewSpends,
} from '../../net/alchemyLaw.js';

/** Generate 16-hex-digit provenance ID. */
function mintProvenance() {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ensure track exists for a profession.
 * @param {any} record
 * @param {string} prof
 */
function ensureTrack(record, prof) {
  record.tracks ??= {};
  if (!record.tracks[prof]) {
    record.tracks[prof] = {
      profession: prof,
      xp: 0,
      rank: 0,
      specs: { 50: null, 100: null },
      respec: null,
    };
  }
  return record.tracks[prof];
}

/**
 * Add XP to a profession track.
 * @param {any} record
 * @param {string} profession
 * @param {number} xpGain
 */
function addXp(record, profession, xpGain) {
  const prof = trackOf(profession);
  const t = ensureTrack(record, prof);
  t.xp = Math.max(0, (t.xp | 0) + xpGain);
  t.rank = rankOfXp(t.xp);
  return t;
}

/**
 * Add materials to the Stores.
 * @param {any} record
 * @param {string} material
 * @param {number} qty
 * @param {'own'|'bought'|'loose'} [origin]
 */
function addToStore(record, material, qty, origin = 'own') {
  record.stores ??= {};
  const s = record.stores[material] ?? { material, own: 0, bought: 0 };
  s[origin] = (s[origin] | 0) + qty;
  record.stores[material] = s;
  return s;
}

/**
 * Roll a whole number in [lo, hi].
 * @param {number} lo
 * @param {number} hi
 */
const rollRange = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

/**
 * Clamp a carried material count down to what the player actually holds.
 * @param {any} record
 * @param {string} material
 * @param {number} held
 */
function clampCarriedInRecord(record, material, held) {
  const cur = record.carried?.[material];
  if (!cur) return;
  const clamped = clampCarried(cur, held);
  if (clamped.own + clamped.bought + clamped.gold > 0) {
    record.carried[material] = {
      material,
      own: clamped.own,
      bought: clamped.bought,
      ...(clamped.gold > 0 ? { gold: clamped.gold } : {}),
    };
  } else {
    delete record.carried[material];
  }
}

/**
 * Add carried units of a material to the offline record.
 * @param {any} record
 * @param {string} material
 * @param {number} qty
 * @param {'own'|'bought'|'gold'} [origin]
 */
function addToCarried(record, material, qty, origin = 'own') {
  record.carried ??= {};
  const c = record.carried[material] ?? { material, own: 0, bought: 0 };
  c[origin] = (c[origin] | 0) + qty;
  record.carried[material] = c;
  return { ...c };
}

/**
 * Deduct carried units of a material from the offline record.
 * @param {any} record
 * @param {string} material
 * @param {number} qty
 */
function deductFromCarried(record, material, qty) {
  record.carried ??= {};
  const c = record.carried[material];
  if (!c) return { material, own: 0, bought: 0 };
  let remaining = Math.max(0, qty | 0);
  for (const origin of ['gold', 'bought', 'own']) {
    const avail = c[origin] | 0;
    const take = Math.min(avail, remaining);
    c[origin] = avail - take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if ((c.own | 0) <= 0 && (c.bought | 0) <= 0 && (c.gold | 0) <= 0) {
    delete record.carried[material];
    return { material, own: 0, bought: 0 };
  }
  return { ...c };
}

/**
 * Deduct materials from the Stores.
 * @param {any} record
 * @param {string} material
 * @param {number} qty
 */
function deductFromStore(record, material, qty) {
  record.stores ??= {};
  const s = record.stores[material];
  if (!s) return false;
  let remaining = qty;
  for (const origin of ['loose', 'bought', 'own']) {
    const avail = s[origin] | 0;
    const take = Math.min(avail, remaining);
    s[origin] = avail - take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if ((s.own | 0) <= 0 && (s.bought | 0) <= 0 && (s.loose | 0) <= 0 && (s.gold | 0) <= 0) {
    delete record.stores[material];
  }
  return remaining <= 0;
}

/**
 * Check if the Stores hold enough of a material.
 * @param {any} record
 * @param {string} material
 * @param {number} qty
 */
function storeHas(record, material, qty) {
  const s = record.stores?.[material];
  if (!s) return false;
  const total = (s.own | 0) + (s.bought | 0) + (s.loose | 0);
  return total >= qty;
}

/**
 * Spend an array of input materials from the Stores.
 * @param {any} record
 * @param {Array<{ key: string, n: number }>} inputs
 */
function spendStores(record, inputs) {
  for (const inp of inputs) {
    if (!storeHas(record, inp.key, inp.n)) return false;
  }
  for (const inp of inputs) {
    deductFromStore(record, inp.key, inp.n);
  }
  return true;
}

/**
 * Create a local offline door adapter.
 * @param {any} playerEntity
 * @param {{
 *   getRecord: () => any,
 *   saveRecord: (r: any) => void,
 *   maps?: any,
 *   nowMinutes?: () => number,
 *   saveSoon?: { changed: () => void }
 * }} deps
 */
export function createLocalProfDoor(playerEntity, deps) {
  const { getRecord, saveRecord, maps, nowMinutes = () => 0, saveSoon } = deps;

  const currentDay = () => Math.floor(nowMinutes() / 1440);

  return {
    account: () => 'offline',

    async state(character) {
      const rec = getRecord();
      const day = currentDay();

      rec.harvestedNodes ??= { day, keys: [] };
      if (rec.harvestedNodes.day !== day) {
        rec.harvestedNodes = { day, keys: [] };
        rec.hunt = { hides: 0, high: 0 };
        rec.hauls = 0;
        saveRecord(rec);
      }

      // Ensure tracks exist for all primary professions
      for (const p of PROFESSIONS) {
        ensureTrack(rec, p.id);
      }

      return {
        ok: true,
        data: {
          open: true,
          day,
          character,
          tracks: Object.values(rec.tracks),
          stores: Object.values(rec.stores ?? {}),
          carried: Object.values(rec.carried ?? {}),
          silver: {},
          today: {},
          taken: [...(rec.harvestedNodes.keys ?? [])],
          made: {
            crafts: [...(rec.made?.crafts ?? [])],
            works: [...(rec.made?.works ?? [])],
            brews: [...(rec.made?.brews ?? [])],
          },
          hunt: rec.hunt ?? { hides: 0, high: 0 },
          hauls: rec.hauls ?? 0,
          master: { made: false, last: null },
        },
      };
    },

    async pixels(character, pixelsList = [], dungeonsList = []) {
      const results = [];
      for (const [x, y] of pixelsList ?? []) {
        const climate = maps ? maps.getClimateIndex(x, y) : 0;
        const region = maps ? maps.getRegionIndexAt(x, y) : 0;
        results.push({ x, y, state: 'confirmed', climate, region });
      }
      const dungeonResults = [];
      for (const id of dungeonsList ?? []) {
        dungeonResults.push({ id, state: 'confirmed', climate: null, region: null });
      }
      return {
        ok: true,
        data: {
          pixels: results,
          dungeons: dungeonResults,
        },
      };
    },

    async ground(character, tiles = []) {
      return {
        ok: true,
        data: {
          laid: true,
          day: currentDay(),
          tiles: [],
        },
      };
    },

    async harvest(body) {
      const rec = getRecord();
      const n = parseNodeKey(body?.node);
      if (!n) return { ok: false, error: 'bad-node' };

      const day = currentDay();
      rec.harvestedNodes ??= { day, keys: [] };
      if (rec.harvestedNodes.day !== day) {
        rec.harvestedNodes = { day, keys: [] };
        rec.hunt = { hides: 0, high: 0 };
        rec.hauls = 0;
      }

      const nodeKeyStr = `${body.node}|${body.kind}`;
      if (rec.harvestedNodes.keys.includes(nodeKeyStr)) {
        return { ok: false, error: 'node-taken' };
      }

      const climate = body.climate ?? 0;
      const region = body.region ?? 0;
      const profession =
        n.kind === 'tree'
          ? 'logging'
          : n.kind === 'herb'
            ? 'herbalism'
            : n.kind === 'body'
              ? 'hunting'
              : n.kind === 'haul'
                ? 'fishing'
                : 'mining';
      const prof = trackOf(profession);
      const curTrack = ensureTrack(rec, prof);
      const specs = curTrack.specs ?? { 50: null, 100: null };

      let material = 'metal:iron';
      let tier = 1;
      let qty = 1;
      let gem = /** @type {string|null} */ (null);
      let extra = /** @type {string|null} */ (null);
      let extraQty = 1;
      let clean = false;
      let xpTier = /** @type {number|null} */ (null);
      let trophy = false;

      if (n.kind === 'tree') {
        const found = tree({ x: n.x, y: n.y, day: n.day, slot: n.slot, climate, region, confirmed: true, jungle: body.jungle === true });
        material = found ? found.material : 'log:oak';
        tier = found ? found.tier : 1;
        clean = body.act?.clean === true;
        qty = treeYield({ roll: rollRange(TREE_YIELD[0], TREE_YIELD[1]) }, Math.random());
        const cuts = Number.isSafeInteger(body.act?.cuts) ? Math.max(0, body.act.cuts) : 2;
        const finds = treeFinds({ cuts, confirmed: true, forester: specs[50] === 'forester' }, Math.random);
        gem = finds.heartwood;
        extra = finds.resin;
      } else if (n.kind === 'herb') {
        if (body.kind === 'herbs') {
          const patch = herbPatch({
            x: n.x,
            y: n.y,
            day: n.day,
            slot: n.slot,
            climate,
            region,
            confirmed: true,
            seasonalEye: specs[100] === 'seasonal-eye',
          });
          material = (patch ? herbKey(patch.herb, region) : null) ?? herbKey(9, region) ?? 'p1:9';
          tier = patch ? patch.tier : 1;
          xpTier = herbXpTier(curTrack.rank);
          const common = tier === 1;
          let bruised = !common && body.act?.bruised === true;
          clean = !common && body.act?.clean === true && !bruised;
          if (!common && specs[100] === 'apothecarys-friend') {
            bruised = false;
            clean = true;
          }
          qty = herbYield(
            {
              roll: rollRange(HERB_YIELD[0], HERB_YIELD[1]),
              common,
              gardener: specs[50] === 'gardener',
              seasonMult: patch ? herbSeasonMult(patch.herb, daySeason(n.day)) : 1,
              offSeason: !!patch?.offSeason,
              bruised,
            },
            Math.random(),
          );
        } else {
          tier = 1;
          const food = basketFood(climate, n.day, Math.random());
          material = food?.material ?? 'food:apple';
          const finds = Number.isSafeInteger(body.act?.finds) ? Math.max(0, Math.min(3, body.act.finds)) : 0;
          clean = finds >= 3;
          const [lo, hi] = FOOD_YIELD[food?.block] ?? [1, 2];
          qty = foodYield({ roll: rollRange(lo, hi), step: basketStep(finds) }, Math.random());
        }
      } else if (n.kind === 'vein') {
        const found = vein({ x: n.x, y: n.y, day: n.day, slot: n.slot, climate, region, confirmed: true });
        material = found ? found.material : 'metal:iron';
        tier = found ? found.tier : 1;
        clean = body.act?.clean === true;
        const glints = Number.isSafeInteger(body.act?.glints) ? Math.max(0, body.act.glints) : 2;
        qty = veinYield({ roll: rollRange(VEIN_YIELD[0], VEIN_YIELD[1]) }, Math.random());
        gem = veinGem({ kind: 'vein', climate, glints, confirmed: true, prospector: specs[50] === 'prospector' }, Math.random);
      } else if (n.kind === 'boulder') {
        clean = body.act?.clean === true;
        const bRes = boulderYield(
          { roll: rollRange(BOULDER_YIELD[0], BOULDER_YIELD[1]), cut: clean || specs[100] === SURVEYOR },
          Math.random(),
        );
        material = bRes.material;
        qty = bRes.qty;
        tier = 1;
      } else if (n.kind === 'dvein') {
        const found = dungeonVein({ dungeon: n.dungeon, day: n.day, slot: n.slot, climate, confirmed: true });
        material = found ? found.material : 'metal:iron';
        tier = found ? found.tier : 3;
        clean = body.act?.clean === true;
        const glints = Number.isSafeInteger(body.act?.glints) ? Math.max(0, body.act.glints) : 2;
        qty = veinYield({ roll: rollRange(VEIN_YIELD[0], VEIN_YIELD[1]), deep: true, deepDelver: specs[50] === 'deep-delver' }, Math.random());
        gem = veinGem({ kind: 'dvein', climate, glints, confirmed: true, prospector: specs[50] === 'prospector' }, Math.random);
      } else if (n.kind === 'body') {
        const h = hideOfFoe(body.foe);
        material = h ? h.key : 'hide:wolf';
        tier = h ? h.tier : 1;
        clean = body.act?.clean === true && body.act?.torn !== true;
        qty = hideYield({ clean }, Math.random());
        if (h) {
          const finds = bodyFinds({ hide: h, torn: body.act?.torn === true, butcher: specs[100] === 'butcher' }, Math.random);
          gem = finds.part;
          extra = finds.meat;
          extraQty = finds.meatQty || 1;
        }
        trophy = trophyHunted({ spec100: specs[100], tier, clean });
        rec.hunt = rec.hunt ?? { hides: 0, high: 0 };
        rec.hunt.hides = (rec.hunt.hides || 0) + qty;
        if (tier >= HIGH_HIDE_TIER) rec.hunt.high = (rec.hunt.high || 0) + qty;
      } else if (n.kind === 'haul') {
        material = FISH_KEY;
        tier = haulTier(curTrack.rank);
        clean = body.act?.clean === true;
        const school = body.act?.school === 0 || body.act?.school === 1;
        const finds = haulFinds(
          { sea: haulAtSea(climate, region), confirmed: true, pearlDiver: specs[100] === 'pearl-diver', deepSea: specs[100] === 'deep-sea' },
          Math.random,
        );
        gem = finds.pearl;
        extra = finds.scales;
        trophy = finds.trophy === true;
        qty = haulYield(
          {
            roll: rollRange(HAUL_YIELD[0], HAUL_YIELD[1]),
            clean,
            school,
            netter: specs[50] === 'netter',
            slaughterfish: !!finds.scales,
          },
          Math.random(),
        );
        rec.hauls = (rec.hauls || 0) + 1;
      }

      // Apply firmament yield bonus
      const firm = firmamentStats();
      const fYield = yieldPct(firm, profession);
      if (fYield) qty = scaleQty(qty, fYield, Math.random());

      // Update track & XP
      const fXp = xpPct(firm, profession);
      const baseXp = harvestXp(xpTier ?? tier, curTrack.rank, clean);
      const xp = fXp ? scaleXp(baseXp, fXp) : baseXp;
      const rankBefore = curTrack.rank;
      const updatedTrack = addXp(rec, prof, xp);

      // Mark node taken
      rec.harvestedNodes.keys.push(nodeKeyStr);

      const isCarry = body.carry === true;
      const butcheryStores = n.kind === 'body' && isCarry && body.butcheryStores === true;
      /** @type {any} */
      const resData = {
        node: body.node,
        kind: body.kind,
        material,
        qty,
        xp,
        rose: updatedTrack.rank > rankBefore,
        carry: isCarry,
        carried: null,
        store: null,
        gemCarried: null,
        gemStore: null,
        extraCarried: null,
        extraStore: null,
        track: updatedTrack,
        today: xp,
        hunt: rec.hunt,
        hauls: rec.hauls,
        ...(gem ? { gem } : {}),
        ...(extra ? { extra, extraQty } : {}),
        ...(trophy ? { trophy: true } : {}),
      };

      if (isCarry) {
        if (heldOk(body.held) && body.heldKey === material) clampCarriedInRecord(rec, material, body.held);
        resData.carried = addToCarried(rec, material, qty, 'own');
        if (gem) resData.gemCarried = addToCarried(rec, gem, 1, 'own');
        if (extra) {
          if (butcheryStores) {
            resData.extraStore = addToStore(rec, extra, extraQty, 'own');
          } else {
            resData.extraCarried = addToCarried(rec, extra, extraQty, 'own');
          }
        }
      } else {
        resData.store = addToStore(rec, material, qty, 'own');
        if (gem) resData.gemStore = addToStore(rec, gem, 1, 'own');
        if (extra) resData.extraStore = addToStore(rec, extra, extraQty, 'own');
      }

      saveRecord(rec);
      saveSoon?.changed?.();
      return { ok: true, data: resData };
    },

    async deposit(character, material, qty, held, order, rid, seen = null) {
      const rec = getRecord();
      const origin = order === 'work' ? 'loose' : 'own';
      const s = addToStore(rec, material, qty, origin);
      const updatedCarried = deductFromCarried(rec, material, qty);
      saveRecord(rec);
      saveSoon?.changed?.();
      return {
        ok: true,
        data: {
          material,
          qty,
          store: s,
          carried: updatedCarried,
        },
      };
    },

    /**
     * @param {string} character
     * @param {string} material
     * @param {number} qty
     * @param {string} rid
     * @param {boolean|{ held?: number, seen?: number }|null} [carry]
     */
    async withdraw(character, material, qty, rid, carry = false) {
      const rec = getRecord();
      const cur = rec.stores?.[material];
      const avail = (cur?.own | 0) + (cur?.bought | 0) + (cur?.loose | 0);
      if (avail < qty) return { ok: false, error: 'stores-short' };
      deductFromStore(rec, material, qty);
      const isCarry = carry === true || (carry != null && typeof carry === 'object');
      let updatedCarried = null;
      if (isCarry) {
        if (carry && typeof carry === 'object' && heldOk(carry.held)) {
          clampCarriedInRecord(rec, material, carry.held);
        }
        updatedCarried = addToCarried(rec, material, qty, 'own');
      }
      saveRecord(rec);
      saveSoon?.changed?.();
      const updatedStore = rec.stores[material] ?? { material, own: 0, bought: 0 };
      return {
        ok: true,
        data: {
          material,
          qty,
          carry: isCarry,
          store: updatedStore,
          ...(isCarry ? { carried: updatedCarried } : {}),
        },
      };
    },

    async smelt(character, recipe, count = 1, rid, clean = false) {
      const rec = getRecord();
      const r = smeltRecipe(recipe);
      if (!r) return { ok: false, error: 'bad-recipe' };
      const countNum = Math.max(1, Math.trunc(count));
      const inputs = r.inputs.map((inp) => ({ key: inp.key, n: inp.n * countNum }));
      if (!spendStores(rec, inputs)) return { ok: false, error: 'prof-materials' };
      const outStore = addToStore(rec, r.out, countNum, 'own');
      const prof = trackOf(r.xp ?? r.more?.profession ?? 'smithing');
      const tier = materialOf(r.out, () => null)?.tier ?? 1;
      const firm = firmamentStats();
      const fXp = xpPct(firm, prof);
      const baseXp = smeltXp(tier, countNum, ensureTrack(rec, prof).rank);
      const xp = fXp ? scaleXp(baseXp, fXp) : baseXp;
      const t = addXp(rec, prof, xp);
      saveRecord(rec);
      saveSoon?.changed?.();
      const touchedStores = [outStore, ...inputs.map((inp) => rec.stores[inp.key] ?? { material: inp.key, own: 0, bought: 0 })];
      return {
        ok: true,
        data: {
          recipe,
          count: countNum,
          own: countNum,
          bought: 0,
          xp,
          track: t,
          stores: touchedStores,
        },
      };
    },

    async craft(character, recipe, clean, name, rid, heartwood = false, dye = null, seat = null, cracked = false) {
      const rec = getRecord();
      const r = recipeById(recipe);
      if (!r) return { ok: false, error: 'bad-recipe' };
      const inputs = recipeInputs(r, { heartwood: heartwood === true, cracked: cracked === true });
      if (!spendStores(rec, inputs)) return { ok: false, error: 'prof-materials' };
      const prof = trackOf(r.profession);
      const t = ensureTrack(rec, prof);
      rec.made ??= { crafts: [], works: [], brews: [] };
      rec.made.crafts ??= [];
      const wasMade = rec.made.crafts.includes(recipe);
      let gainedXp = craftXp(r.tier ?? 1, t.rank);
      if (!wasMade) {
        gainedXp += FIRST_MAKE_FLOOR;
        rec.made.crafts.push(recipe);
      }
      const firm = firmamentStats();
      const fXp = xpPct(firm, prof);
      if (fXp) gainedXp = scaleXp(gainedXp, fXp);
      const updatedTrack = addXp(rec, prof, gainedXp);
      const pid = mintProvenance();
      const qSteps = qualitySteps(r, { clean: clean === true, heartwood: heartwood === true });
      const finalQuality = Math.min(5, Math.max(1, 2 + qSteps));
      saveRecord(rec);
      saveSoon?.changed?.();
      const spentStores = inputs.map((inp) => rec.stores[inp.key] ?? { material: inp.key, own: 0, bought: 0 });
      return {
        ok: true,
        data: {
          recipe,
          quality: finalQuality,
          count: 1,
          seed: Math.floor(Math.random() * 1000000),
          maker: name || character,
          marked: !!name,
          xp: gainedXp,
          first: !wasMade,
          firstPaid: !wasMade,
          heartwood: heartwood === true,
          dye: dye ?? null,
          pieces: [{ provenance: pid, record: null }],
          track: updatedTrack,
          stores: spentStores,
        },
      };
    },

    async brew(character, potion, keys, rid, seat = null) {
      const rec = getRecord();
      const p = potionById(potion);
      if (!p) return { ok: false, error: 'bad-recipe' };
      const inputs = brewSpends(p, keys);
      if (inputs && !spendStores(rec, inputs)) return { ok: false, error: 'prof-materials' };
      const prof = 'provisioning';
      const t = ensureTrack(rec, prof);
      rec.made ??= { crafts: [], works: [], brews: [] };
      rec.made.brews ??= [];
      const wasMade = rec.made.brews.includes(potion);
      let gainedXp = (p.rank ?? 1) * 30;
      if (!wasMade) {
        gainedXp += FIRST_MAKE_FLOOR;
        rec.made.brews.push(potion);
      }
      const firm = firmamentStats();
      const fXp = xpPct(firm, prof);
      if (fXp) gainedXp = scaleXp(gainedXp, fXp);
      const updatedTrack = addXp(rec, prof, gainedXp);
      saveRecord(rec);
      saveSoon?.changed?.();
      const touchedStores = (keys ?? []).map((k) => rec.stores[k] ?? { material: k, own: 0, bought: 0 });
      return {
        ok: true,
        data: {
          potion,
          keys: keys ?? [],
          count: 1,
          potent: 0,
          unbruised: 0,
          steps: 0,
          xp: gainedXp,
          first: !wasMade,
          track: updatedTrack,
          stores: touchedStores,
        },
      };
    },

    async temper(character, recipe, quality, provenance = null, rid) {
      const rec = getRecord();
      const r = recipeById(recipe);
      if (!r) return { ok: false, error: 'bad-recipe' };
      const cost = temperCost(r);
      if (cost && !deductFromStore(rec, cost.key, cost.n)) return { ok: false, error: 'prof-materials' };
      const prof = trackOf(r.profession);
      const gainedXp = (r.tier ?? 1) * 25;
      const t = addXp(rec, prof, gainedXp);
      saveRecord(rec);
      saveSoon?.changed?.();
      return {
        ok: true,
        data: {
          recipe,
          quality: quality + 1,
          provenance: provenance ?? null,
          xp: gainedXp,
          track: t,
          stores: cost ? [rec.stores[cost.key] ?? { material: cost.key, own: 0, bought: 0 }] : [],
        },
      };
    },

    async spec(character, profession, rank, spec, from, rid, trial = false) {
      const rec = getRecord();
      const prof = trackOf(profession);
      const t = ensureTrack(rec, prof);
      t.specs ??= { 50: null, 100: null };
      if (rank === 50 || rank === 100) {
        t.specs[rank] = spec;
      }
      saveRecord(rec);
      saveSoon?.changed?.();
      return {
        ok: true,
        data: {
          profession: prof,
          rank,
          spec,
          track: t,
        },
      };
    },

    async disenchant(character, provenance, rid, realm = null) {
      const rec = getRecord();
      const s = addToStore(rec, 'essence:arcane', 1, 'own');
      const t = addXp(rec, 'enchanting', 60);
      saveRecord(rec);
      saveSoon?.changed?.();
      return {
        ok: true,
        data: {
          essence: 1,
          stores: [s],
          track: t,
        },
      };
    },

    async reforge(character, tier, rid, count = 0) {
      const rec = getRecord();
      if (!deductFromStore(rec, 'essence:arcane', 2)) return { ok: false, error: 'prof-materials' };
      const t = addXp(rec, 'enchanting', 40);
      saveRecord(rec);
      saveSoon?.changed?.();
      return {
        ok: true,
        data: {
          tier,
          count,
          seed: Math.floor(Math.random() * 1000000),
          track: t,
          stores: [rec.stores['essence:arcane'] ?? { material: 'essence:arcane', own: 0, bought: 0 }],
        },
      };
    },

    async stock(character, material, qty, rid) {
      const rec = getRecord();
      const s = addToStore(rec, material, qty, 'bought');
      saveRecord(rec);
      saveSoon?.changed?.();
      return {
        ok: true,
        data: {
          material,
          qty,
          stores: [s],
        },
      };
    },

    async master(character, recipe, lines, name, rid, dye = null) {
      const rec = getRecord();
      const r = recipeById(recipe);
      const inputs = r ? recipeInputs(r) : [];
      if (!spendStores(rec, inputs)) return { ok: false, error: 'prof-materials' };
      const t = addXp(rec, r?.profession ?? 'smithing', 300);
      const pid = mintProvenance();
      saveRecord(rec);
      saveSoon?.changed?.();
      return {
        ok: true,
        data: {
          recipe,
          quality: 4,
          count: 1,
          seed: Math.floor(Math.random() * 1000000),
          maker: name || character,
          marked: true,
          xp: 300,
          first: true,
          firstPaid: true,
          dye: dye ?? null,
          pieces: [{ provenance: pid, record: null }],
          track: t,
          stores: inputs.map((inp) => rec.stores[inp.key] ?? { material: inp.key, own: 0, bought: 0 }),
        },
      };
    },

    async writs(character, region) {
      return { ok: true, data: { writs: [] } };
    },

    async deliver(character, id, rid) {
      return { ok: false, error: 'no-writ' };
    },

    async craftWrit(character, id, rid, realm, pieces = null) {
      return { ok: false, error: 'no-writ' };
    },

    async motherlodes(character) {
      return { ok: true, data: { motherlodes: [] } };
    },
  };
}
