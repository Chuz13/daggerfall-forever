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
  smeltRecipe,
  smeltXp,
  materialOf,
  FISH_KEY,
  herbKey,
  hideOfFoe,
} from '../../net/professionLaw.js';
import {
  parseNodeKey,
  pixelKey,
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
} from '../../net/nodeLaw.js';
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
          carried: [],
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
      let material = 'metal:iron';
      let tier = 1;
      let profession = 'mining';
      let qty = 1;
      let gem = null;
      let extra = null;
      let extraQty = 1;

      if (n.kind === 'tree') {
        const found = tree({ x: n.x, y: n.y, day: n.day, slot: n.slot, climate, region, confirmed: true, jungle: body.jungle === true });
        material = found ? found.material : 'wood:oak';
        tier = found ? found.tier : 1;
        profession = 'logging';
        const roll = 2 + Math.floor(Math.random() * 3);
        qty = treeYield({ roll }, Math.random());
        const finds = treeFinds({ cuts: 2, confirmed: true }, Math.random);
        gem = finds.heartwood;
        extra = finds.resin;
      } else if (n.kind === 'herb') {
        if (body.kind === 'herbs') {
          const patch = herbPatch({ x: n.x, y: n.y, day: n.day, slot: n.slot, climate, region, confirmed: true });
          material = patch ? herbKey(patch.herb, region) ?? 'herbs:green_leaves' : 'herbs:green_leaves';
          tier = patch ? patch.tier : 1;
          profession = 'herbalism';
          const roll = 1 + Math.floor(Math.random() * 3);
          qty = herbYield({ roll, common: tier === 1 }, Math.random());
        } else {
          material = 'food:apple';
          tier = 1;
          profession = 'herbalism';
          qty = 2;
        }
      } else if (n.kind === 'vein') {
        const found = vein({ x: n.x, y: n.y, day: n.day, slot: n.slot, climate, region, confirmed: true });
        material = found ? found.material : 'metal:iron';
        tier = found ? found.tier : 1;
        profession = 'mining';
        const roll = 2 + Math.floor(Math.random() * 3);
        qty = veinYield({ roll }, Math.random());
        gem = veinGem({ kind: 'vein', climate, glints: 2, confirmed: true }, Math.random);
      } else if (n.kind === 'boulder') {
        const found = boulder({ x: n.x, y: n.y, day: n.day, slot: n.slot, climate, region, confirmed: true });
        const roll = 2 + Math.floor(Math.random() * 3);
        const bRes = boulderYield({ roll }, Math.random());
        material = bRes.material;
        qty = bRes.qty;
        tier = 1;
        profession = 'mining';
      } else if (n.kind === 'dvein') {
        const found = dungeonVein({ dungeon: n.dungeon, day: n.day, slot: n.slot, climate, confirmed: true });
        material = found ? found.material : 'metal:iron';
        tier = found ? found.tier : 2;
        profession = 'mining';
        const roll = 2 + Math.floor(Math.random() * 3);
        qty = veinYield({ roll, deep: true }, Math.random());
        gem = veinGem({ kind: 'dvein', climate, glints: 2, confirmed: true }, Math.random);
      } else if (n.kind === 'body') {
        const h = hideOfFoe(body.foe);
        material = h ? h.key : 'hide:leather';
        tier = h ? h.tier : 1;
        profession = 'hunting';
        qty = hideYield({ clean: body.act?.clean === true }, Math.random());
        const finds = bodyFinds({ hide: h, torn: body.act?.torn === true }, Math.random);
        gem = finds.part;
        extra = finds.meat;
        extraQty = finds.meatQty || 1;
        rec.hunt = rec.hunt ?? { hides: 0, high: 0 };
        rec.hunt.hides = (rec.hunt.hides || 0) + qty;
        if (tier >= 5) rec.hunt.high = (rec.hunt.high || 0) + 1;
      } else if (n.kind === 'haul') {
        material = FISH_KEY;
        tier = 1;
        profession = 'fishing';
        qty = haulYield({ roll: 2 }, Math.random());
        const finds = haulFinds({ sea: true, confirmed: true }, Math.random);
        gem = finds.pearl;
        extra = finds.scales;
        rec.hauls = (rec.hauls || 0) + 1;
      }

      // Apply firmament yield bonus
      const firm = firmamentStats();
      const fYield = yieldPct(firm, profession);
      if (fYield) qty = scaleQty(qty, fYield, Math.random());

      // Update track & XP
      const prof = trackOf(profession);
      const curTrack = ensureTrack(rec, prof);
      const fXp = xpPct(firm, profession);
      const baseXp = harvestXp(tier, curTrack.rank, body.act?.clean === true);
      const xp = fXp ? scaleXp(baseXp, fXp) : baseXp;
      const updatedTrack = addXp(rec, prof, xp);

      // Mark node taken
      rec.harvestedNodes.keys.push(nodeKeyStr);

      const resData = {
        carry: body.carry === true,
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
      };

      if (body.carry === true) {
        resData.carried = { material, own: qty, bought: 0 };
        if (gem) resData.gemCarried = { material: gem, own: 1, bought: 0 };
        if (extra) {
          if (body.butcheryStores) {
            const es = addToStore(rec, extra, extraQty, 'own');
            resData.extraStore = es;
          } else {
            resData.extraCarried = { material: extra, own: extraQty, bought: 0 };
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
      saveRecord(rec);
      saveSoon?.changed?.();
      return {
        ok: true,
        data: {
          material,
          qty,
          store: s,
        },
      };
    },

    async withdraw(character, material, qty, rid, carry = false) {
      const rec = getRecord();
      const cur = rec.stores?.[material];
      const avail = (cur?.own | 0) + (cur?.bought | 0) + (cur?.loose | 0);
      if (avail < qty) return { ok: false, error: 'stores-short' };
      deductFromStore(rec, material, qty);
      saveRecord(rec);
      saveSoon?.changed?.();
      const updatedStore = rec.stores[material] ?? { material, own: 0, bought: 0 };
      return {
        ok: true,
        data: {
          material,
          qty,
          carry: carry === true,
          store: updatedStore,
          carried: { material, own: qty, bought: 0 },
        },
      };
    },

    async smelt(character, recipe, count = 1, rid, clean = false) {
      const rec = getRecord();
      const r = smeltRecipe(recipe);
      if (!r) return { ok: false, error: 'bad-recipe' };
      const countNum = Math.max(1, Math.trunc(count));
      const inputs = r.inputs.map((inp) => ({ key: inp.key, n: inp.n * countNum }));
      spendStores(rec, inputs);
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
      spendStores(rec, inputs);
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
      if (inputs) spendStores(rec, inputs);
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
      if (cost) deductFromStore(rec, cost.key, cost.n);
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
      deductFromStore(rec, 'essence:arcane', 2);
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
      spendStores(rec, inputs);
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
