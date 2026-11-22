// TEMP-UI (2026-10-12, the owner: "add a tempurature widget to the UI including allowing players to see their personal
// tempurature in their inventory") - THE PACK'S TEMPERATURE (enhanced pack only; the classic window keeps DFU's own
// window untouched - THE NATIVE-WINDOW RULE - and says the number on the Status page, survival/status.js).
//
// Three places, one reading:
//   - THE PLAQUE on the figure, top right of its column where the Armour plaque stands top left (under it where the
//     figure is too narrow for both - AUDIT C&C S1): the felt temperature and its word, in the strip's colours, with
//     what makes it on its title;
//   - THE CARD'S COMPARISON under a wearable's stats: the felt temperature now and as it would be in it - or, for a
//     piece already worn, without it - green where it brings the reading toward the comfortable band, red where away;
//   - THE STATS SIDE's Temperature section (ui/statsCard.js): every part that makes the number, one row each, adding up
//     to it.
//
// THE READING IS LIVE, NOT THE RECORD'S. The record's `felt` is the last game minute's, and the pack is often a paused
// window: a cloak put on under it would wait for the next minute to show. So the pack asks survival/env.js feltNow -
// the minute law's own sum (feltTemperature over needs.js feltCtx) where the body last stood - over the slots as they
// are, or as a wear would leave them (ui/armourCard.js wearComparison's `worn`, its wardrobe through modsForSlots). The
// HUD reads the same live reading - its plate and, AUDIT C&C S9, the strip's chip - each level the live tier's and its
// fire the live air's (survival/status.js temperatureReadout, needs.js warmedByFire), so the pack and the HUD say one thing.
import { survivalOn, survivalRules } from '../systems/survival/switch.js';
import { feltNow, lastSurvivalFeed } from '../systems/survival/env.js';
import { temperatureBreakdown, signedDegrees, temperatureWord } from '../systems/survival/temperature.js';
import { temperatureReadout, HUD_BOON_WORDS, HUD_NEED_WORDS, boonEffect, restedLeft, levelSaid, drinkCategoryLabel, drinkBuffEffect, drunkWord } from '../systems/survival/status.js';
import { activeDrinkBuff, NEED, hungerMinutes, hungerStage, starvingDays, thirstStage, sleepStage, wakingHeld, warmedByFire } from '../systems/survival/needs.js';
import { isStiff, STIFF_PENALTY } from '../systems/survival/rest.js';
import { STAT_KEYS_ORDER, liveStat } from '../systems/statMods.js';
import { liveVampirism } from '../systems/racialLive.js';
import { isAnyLich } from '../systems/necromancy/lichdomStatus.js';
import { DISEASE_NAMES } from '../systems/diseases.js';
import { t } from '../systems/textManager.js';
import { equipTableOf, isEquipped } from '../systems/equip.js';
import { modsForSlots } from './armourCard.js';

const el = (tag, cls = null, text = null) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/** The comfortable band's edges (survival/temperature.js temperatureWord: comfortable from -10 to +10, both kept). */
export const COMFORT = Object.freeze({ low: -10, high: 10 });
/** How far a reading stands outside the comfortable band, in degrees - nought inside it. */
export const discomfort = (felt) => Math.max(0, COMFORT.low - felt, felt - COMFORT.high);
const BAND_TEXT = `comfortable from ${signedDegrees(COMFORT.low)} to ${signedDegrees(COMFORT.high)}`;

/**
 * THE PACK'S READING of `entity`: temperatureReadout's plate over the live felt temperature (the level, the word and the
 * way it runs, as the strip would wear them), its parts (temperature.js temperatureBreakdown) and the env it was read in
 * - or the record's last minute with no parts where the needs have not run in this session yet. Null with Climates &
 * Calories Off, or with no reading at all.
 */
export function packTemperature(entity) {
  if (!survivalOn() || !entity) return null;
  const t = feltNow(entity);
  if (t) {
    const r = temperatureReadout(entity, t.felt, { rules: survivalRules(), env: t.env }); // AUDIT C&C S5/S9: the live tier's level, the live air's fire
    return r ? { ...r, rows: temperatureBreakdown(t.env, t), live: true } : null;
  }
  const r = temperatureReadout(entity, undefined, { rules: survivalRules() });
  return r ? { ...r, rows: [], live: false } : null;
}

/** A breakdown as lines of text - the plaque's title: "Mountains -40", "Clothing +12 (+16 dry)", ... */
export const breakdownLines = (rows) =>
  rows.map((r) => `${r.label} ${signedDegrees(r.value)}${r.note ? ` (${r.note})` : ''}`);

/** THE PLAQUE: "Felt" over the reading, coloured by the way it runs and framed by its level; its title the whole sum.
 *  Null where packTemperature is. */
export function temperaturePlaque(entity) {
  const r = packTemperature(entity);
  if (!r) return null;
  const n = el('div', 'worntemp-total');
  n.dataset.side = r.side;
  n.dataset.level = r.level;
  n.append(el('span', 'k', 'Felt'), el('span', 'v', r.text));
  const sum = breakdownLines(r.rows);
  // AUDIT C&C S14: and whether it costs, in words - its frame's colour said it alone
  n.title = `Felt temperature ${r.text}: ${levelSaid(r.label.toLowerCase(), r.level)} (${BAND_TEXT})${sum.length ? `\n${sum.join('\n')}` : ''}`;
  n.setAttribute('aria-label', `Felt temperature ${r.text}, ${levelSaid(r.label, r.level)}`);
  return n;
}

/**
 * WHAT A WEAR WOULD DO TO THE FELT TEMPERATURE - `{ label, before, after }` (live readings) for `item`: a piece not
 * worn, as wearing it would leave the table (`wear`, the card's one wearComparison - null where no wear is read), and a
 * piece worn, as taking it off would. Null with the arc Off, no feed, or a change under a degree (a ring, a sword).
 */
export function temperatureWear(entity, item, wear = null) {
  if (!survivalOn() || !entity || !item) return null;
  const before = feltNow(entity);
  if (!before) return null;
  let slots, label;
  if (isEquipped(item)) {
    slots = [...equipTableOf(entity)].map((it) => (it === item ? null : it));
    label = 'Without it';
  } else {
    if (!wear?.worn) return null;
    slots = wear.worn;
    label = 'Wearing it';
  }
  const after = feltNow(entity, { worn: slots, mods: modsForSlots(entity, slots) });
  if (!after || Math.round(after.felt) === Math.round(before.felt)) return null;
  return { label, before, after };
}

/** THE CARD'S COMPARISON BLOCK (the AC-COMPARE block's shape, `.cmp`): the reading now and after with their words, and
 *  the change - green toward the comfortable band, red away from it. Null where temperatureWear is. */
export function temperatureCompareBlock(entity, item, wear = null) {
  const w = temperatureWear(entity, item, wear);
  if (!w) return null;
  const a = temperatureReadout(entity, w.before.felt),
    b = temperatureReadout(entity, w.after.felt); // the number and its word (no level is drawn here)
  const box = el('div', 'cmp tcmp');
  box.append(el('p', 'cmp-head', 'Temperature'));
  const dl = el('dl', 'stats cmp-rows');
  const g = el('div', 'pair');
  const dd = el('dd');
  dd.append(el('span', 'cmp-v', `${a.text} ${a.label} → ${b.text} ${b.label}`));
  const change = Math.round(w.after.felt) - Math.round(w.before.felt);
  const better = discomfort(w.after.felt) < discomfort(w.before.felt),
    worse = discomfort(w.after.felt) > discomfort(w.before.felt);
  dd.append(el('span', `cmp-d ${better ? 'up' : worse ? 'down' : 'same'}`, signedDegrees(change)));
  g.append(el('dt', null, w.label), dd);
  dl.append(g);
  box.append(dl);
  box.title = `The temperature you feel here, now and ${w.label === 'Without it' ? 'with it off' : 'wearing it'} (${BAND_TEXT}).`;
  return box;
}

/** THE STATS SIDE'S ROWS: [label, value text, title] - every part of the live sum and the total. Empty where
 *  packTemperature has no parts (Off, or before the needs have run). */
export function temperatureStatRows(entity) {
  const r = packTemperature(entity);
  if (!r || !r.rows.length) return [];
  return [
    ...r.rows.map((x) => [x.label, `${signedDegrees(x.value)}${x.note ? ` (${x.note})` : ''}`, null]),
    [`= Felt (${r.label.toLowerCase()})`, r.text, `The lines above added together (${BAND_TEXT}).`],
  ];
}

/** AUDIT SURV-BOONS C13: THE STATS SIDE'S BOONS - [name, what it gives] for each boon the body has, in Boons (nothing in
 *  any other tier): the attributes a sheet shows raised are explained where the sheet is. */
export function boonStatRows(entity) {
  if (!survivalOn() || !survivalRules()?.boons) return [];
  const s = entity?.survival;
  const ids = Array.isArray(s?.boons) ? s.boons : [];
  const rows = ids
    .filter((id) => HUD_BOON_WORDS[id])
    .map((id) => [
      HUD_BOON_WORDS[id][0],
      `${boonEffect(id)}${id === 'rested' && restedLeft(s) ? ` (${restedLeft(s)} left)` : ''}`,
    ]);
  const db = activeDrinkBuff(s);
  if (db) {
    const leftH = Number.isFinite(db.until) && Number.isFinite(s?.lastMinute)
      ? Math.max(1, Math.ceil((db.until - s.lastMinute) / 60))
      : null;
    rows.push([
      drinkCategoryLabel(db.cat),
      `${drinkBuffEffect(db)}${leftH ? ` (${leftH}h left)` : ''}`,
    ]);
  }
  return rows;
}

const capStat = (k) => `${k[0].toUpperCase()}${k.slice(1)}`;
const fmtNegMods = (map) =>
  STAT_KEYS_ORDER.filter((k) => (map?.[k] ?? 0) < 0)
    .map((k) => `${map[k]} ${capStat(k)}`)
    .join(', ');

/**
 * Character sheet penalties snapshot: `[label, effectText]` for every active survival penalty (attribute drains,
 * stamina drains, stiffness, drunkenness) and non-survival negative attribute effect (diseases, poisons, drains, curses).
 * @param {any} entity
 * @param {number|null} [nowArg]
 * @returns {[string, string][]}
 */
export function penaltyStatRows(entity, nowArg = null) {
  if (!entity) return [];
  const rows = [];
  const vampire = !!liveVampirism(entity);
  const lich = !!isAnyLich(entity);

  const rules = survivalOn() ? survivalRules() : null;
  const s = entity.survival && typeof entity.survival === 'object' ? entity.survival : null;
  if (rules && s) {
    const now = Number.isFinite(nowArg)
      ? nowArg
      : Number.isFinite(s.lastMinute)
        ? s.lastMinute
        : Number.isFinite(entity.lastGameMinutes)
          ? entity.lastGameMinutes
          : null;
    const beast = !!lastSurvivalFeed(entity)?.ctx?.beastForm;
    const endurance = entity.stats ? liveStat(entity, 'endurance') : 50;
    const tires = rules.stamina.floor < 1;
    const takesAttr = !!rules.attributes;
    const scale = rules.attrScale ?? 1;
    const capAttr = rules.attrCap ?? 20;
    const expAt = rules.exposureAt ?? NEED.EXPOSURE_AT;
    const sc = (n) => (n > 0 ? Math.max(1, Math.round(n * scale)) : 0);
    const allAttrText = (n) => t('survival.penalty.allStats', '-{n} all attributes (excl. Luck)', { n });
    const drainStaminaText = () => t('survival.penalty.drainsStamina', 'drains stamina');

    if (now != null && !vampire && !beast && !lich) {
      const hMins = hungerMinutes(s, now);
      if (hungerStage(hMins) === 'starving') {
        const starveN = takesAttr ? Math.min(capAttr, sc(starvingDays(hMins) * 2)) : 0;
        if (starveN > 0) rows.push([HUD_NEED_WORDS.hunger.starving, allAttrText(starveN)]);
        else if (tires) rows.push([HUD_NEED_WORDS.hunger.starving, drainStaminaText()]);
      }
    }

    if (!vampire && !beast && !lich) {
      const thStage = thirstStage(s.thirst ?? 0);
      if (thStage === 'dehydrated') {
        const thN = takesAttr ? Math.min(capAttr, sc(Math.trunc(((s.thirst ?? 0) - 90) / 10))) : 0;
        if (thN > 0) rows.push([HUD_NEED_WORDS.thirst.dehydrated, allAttrText(thN)]);
        else if (tires) rows.push([HUD_NEED_WORDS.thirst.dehydrated, drainStaminaText()]);
      } else if (thStage === 'parched' && tires) {
        rows.push([HUD_NEED_WORDS.thirst.parched, drainStaminaText()]);
      }
    }

    if (!vampire && !lich && !(now != null && wakingHeld(s, now))) {
      const slStage = sleepStage(s.sleepDebt ?? 0);
      if (slStage !== 'rested') {
        const rawSleep = slStage === 'tired' ? 2 : slStage === 'drowsy' ? 5 : 10;
        const slN = takesAttr ? sc(rawSleep) : 0;
        if (slN > 0) rows.push([HUD_NEED_WORDS.sleep[slStage], allAttrText(slN)]);
        else if (tires && slStage === 'exhausted') rows.push([HUD_NEED_WORDS.sleep.exhausted, drainStaminaText()]);
      }
    }

    if (!lich) {
      const liveTemp = feltNow(entity);
      const felt = liveTemp ? liveTemp.felt : s.felt;
      if (Number.isFinite(felt)) {
        const word = temperatureWord(felt);
        const label = HUD_NEED_WORDS.temp[word] ?? null;
        const abs = Math.abs(felt);
        const expN = takesAttr && abs > expAt ? Math.min(capAttr, sc(Math.trunc(Math.min(s.exposure ?? 0, abs - expAt) / 4))) : 0;
        const warmed = liveTemp
          ? warmedByFire(rules, liveTemp.env, felt)
          : !!s.warmed && (word === 'cold' || word === 'freezing' || word === 'deadly cold');
        if (expN > 0) rows.push([label ?? 'Exposure', allAttrText(expN)]);
        else if (tires && !warmed && label && (felt >= rules.stamina.hotFrom || felt <= rules.stamina.coldFrom)) {
          rows.push([label, drainStaminaText()]);
        }
      }
    }

    if (now != null && takesAttr && isStiff(s, now)) {
      const pen = rules.stiffPenalty ?? STIFF_PENALTY;
      const leftH = Math.max(1, Math.ceil((s.stiffUntil - now) / 60));
      rows.push(['Stiff', `-${pen} Agility, -${pen} Speed (${leftH}h left)`]);
    }

    if ((s.drunk ?? 0) > endurance / 2) {
      const d = Math.trunc((s.drunk - endurance / 2) / 10);
      if (d > 0) {
        const p = Math.min(5, d + 1);
        rows.push([
          drunkWord(s.drunk, endurance),
          `-${d} Intelligence, -${d} Willpower, -${d} Agility, -${d} Speed, +${p} Personality`,
        ]);
      }
    }
  }

  const drainMap = new Map();
  for (const a of entity.activeEffects ?? []) {
    if (!a || a.ended) continue;
    if (a.kind === 'disease' && a.statMods) {
      const txt = fmtNegMods(a.statMods);
      if (txt) rows.push([DISEASE_NAMES[a.disease] ?? 'Disease', txt]);
    } else if (a.kind === 'poison' && a.statMods) {
      const txt = fmtNegMods(a.statMods);
      if (txt) rows.push(['Poisoned', txt]);
    } else if ((a.kind === 'drainAttribute' || a.kind === 'transferAttribute') && a.stat && a.magnitude > 0) {
      drainMap.set(a.stat, (drainMap.get(a.stat) ?? 0) + a.magnitude);
    } else if ((a.kind === 'racialOverride' || a.kind === 'lichdom' || a.kind === 'ancient_lichdom') && a.statMods) {
      const txt = fmtNegMods(a.statMods);
      if (txt) {
        const kind = a.racial ?? a.kind;
        const label =
          kind === 'ancient_lichdom'
            ? t('lichdom.badge.archlich', 'Ancient Lich')
            : kind === 'lichdom'
              ? t('lichdom.badge.lich', 'Immortal Lich')
              : vampire
                ? t('lichdom.curse.vampirism', 'Vampirism')
                : 'Curse';
        rows.push([label, txt]);
      }
    }
  }
  if (drainMap.size) {
    const txt = STAT_KEYS_ORDER.filter((k) => (drainMap.get(k) ?? 0) > 0)
      .map((k) => `-${drainMap.get(k)} ${capStat(k)}`)
      .join(', ');
    if (txt) rows.push(['Drain', txt]);
  }
  return rows;
}
