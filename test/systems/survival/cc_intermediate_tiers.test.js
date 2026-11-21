import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SURVIVAL_TIER_IDS,
  SURVIVAL_DEFAULT,
  SURVIVAL_RULES,
  SURVIVAL_STORED,
} from '../../../src/systems/survival/difficulty.js';
import {
  survivalMinute,
  survivalStatMods,
  heartyMeal,
  alignInnTravel,
  DRINK_CATEGORIES,
  drinkCategoryFor,
  activeDrinkBuff,
} from '../../../src/systems/survival/needs.js';
import { tavernDrink } from '../../../src/systems/survival/tavernMenu.js';
import { restBlock, REST_TEXT_SURVIVAL, restHour, REST_KIND, installSurvivalRestGate } from '../../../src/systems/survival/rest.js';
import { maxFatigue } from '../../../src/systems/statMods.js';
import { hurtPlayer } from '../../../src/characters/playerEntity.js';
import { drinkBuffEffect } from '../../../src/systems/survival/status.js';
import { statusTip } from '../../../src/ui/hud/statusTips.js';
import { isSurvivalItem } from '../../../src/systems/survival/items.js';
import { executeConsoleLine, getConsoleCommand } from '../../../src/systems/consoleCommands.js';
import { evaluateTravelInterruption, TRAVEL_EVENT_TYPE } from '../../../src/systems/living/travelDirector.js';
import { LivingTamrielConfig, PRESENCE } from '../../../src/systems/living/livingConfig.js';
import { RACES } from '../../../src/systems/races.js';

const STATS = Object.freeze({
  strength: 50, intelligence: 50, willpower: 50, agility: 50,
  endurance: 50, personality: 50, speed: 50, luck: 50,
});
const makeEntity = (extra = {}) => ({
  stats: { ...STATS },
  raceId: RACES.Breton,
  items: [],
  activeEffects: [],
  health: 40,
  maxHealth: 40,
  fatigue: 6400,
  ...extra,
});

test('CC intermediate tiers: Standard and Veteran exist and Veteran is default', () => {
  assert.deepEqual(SURVIVAL_TIER_IDS, ['off', 'boons', 'casual', 'standard', 'veteran', 'hard']);
  assert.equal(SURVIVAL_DEFAULT, 'veteran');
  assert.equal(SURVIVAL_STORED.standard, 'standard');
  assert.equal(SURVIVAL_STORED.veteran, 'veteran');
  assert.equal(SURVIVAL_RULES.standard.needPace, 0.65);
  assert.equal(SURVIVAL_RULES.veteran.needPace, 0.85);
  assert.equal(SURVIVAL_RULES.standard.stamina.floor, 0.25);
  assert.equal(SURVIVAL_RULES.veteran.stamina.floor, 0.1);
  assert.equal(SURVIVAL_RULES.standard.stamina.repaid, true);
  assert.equal(SURVIVAL_RULES.veteran.stamina.repaid, false);
});

test('CC intermediate tiers: Veteran health harm is non-fatal (stops at HEALTH_FLOOR)', () => {
  const e = makeEntity({ health: 6, maxHealth: 40 });
  e.survival = { lastAte: 0, thirst: 140, wet: 0, sleepDebt: 0, awakeSince: 0, exposure: 0, fed: 0, drunk: 0, rotMinutes: 0, rotDays: 0, stiffUntil: 0, notes: {} };
  survivalMinute(e, 100, {}, {
    rules: SURVIVAL_RULES.veteran,
    sinks: { hurt: (n) => { e.health -= n; } },
  });
  assert.equal(e.health, 5);
});

test('CC intermediate tiers: Drink categories grant category buffs and Tea/Coffee reduces sleepDebt', () => {
  assert.equal(drinkCategoryFor('Goats Milk', 0), 'milk_juice');
  assert.equal(drinkCategoryFor('Herbal Tea', 0), 'tea_coffee');
  assert.equal(drinkCategoryFor('Ale', 10), 'light_alcohol');
  assert.equal(drinkCategoryFor('Mulled Wine', 15), 'wine');
  assert.equal(drinkCategoryFor('Cyrodiil Brandy', 40), 'spirits');

  const s = { thirst: 80, drunk: 0, sleepDebt: 5 };
  const r = tavernDrink(s, 0, { endurance: 50, rules: SURVIVAL_RULES.veteran, now: 100, name: 'Coffee' });
  assert.equal(r.blackout, false);
  assert.equal(s.drinkBuff.cat, 'tea_coffee');
  assert.equal(s.sleepDebt, 3.5);
  assert.ok(activeDrinkBuff(s, 150));

  const mods = survivalStatMods(s, { abs: 0 }, 150, { endurance: 50, rules: SURVIVAL_RULES.veteran });
  assert.equal(mods.intelligence, DRINK_CATEGORIES.tea_coffee.stats.intelligence);
  assert.equal(mods.willpower, DRINK_CATEGORIES.tea_coffee.stats.willpower);
});

test('CC intermediate tiers: Hearty Meal boosts maxFatigue and restHour HP recovery', () => {
  const e = makeEntity({ health: 20, maxHealth: 40 });
  const baseMax = maxFatigue(e);
  e.survival = { lastAte: 90, thirst: 0, wet: 0, sleepDebt: 0, awakeSince: 0, exposure: 0, fed: 0, drunk: 0, rotMinutes: 0, rotDays: 0, stiffUntil: 0, notes: {}, lastMinute: 100 };
  heartyMeal(e.survival, 100);
  survivalMinute(e, 101, {}, { rules: SURVIVAL_RULES.standard });
  assert.ok(maxFatigue(e) > baseMax);

  restHour(e, REST_KIND.Bed, () => true, { health: 0, fatigue: 0, magicka: 0 }, SURVIVAL_RULES.standard);
  assert.equal(e.health, 22);
});

test('CC intermediate tiers: noWildSleep blocks wilderness sleep without camp but allows dungeon/town/fire', () => {
  assert.equal(restBlock({ noWildSleep: true }), REST_TEXT_SURVIVAL.noWildSleep);
  assert.equal(restBlock({ noWildSleep: true, byFire: true }), null);
  assert.equal(restBlock({ noWildSleep: true, insideDungeon: true }), null);
  assert.equal(restBlock({ noWildSleep: true, inTown: true }), null);
  assert.equal(restBlock({ noWildSleep: true, insideBuilding: true }), null);
});

test('CC intermediate tiers: alignInnTravel resets travel survival degradation', () => {
  const e = makeEntity();
  e.survival = { lastAte: 0, thirst: 120, wet: 200, sleepDebt: 10, awakeSince: 0, exposure: 50, borrowed: { hunger: 100 }, notes: {} };
  alignInnTravel(e, 5000);
  assert.equal(e.survival.thirst, 0);
  assert.equal(e.survival.sleepDebt, 0);
  assert.equal(e.survival.wet, 0);
  assert.equal(e.survival.lastAte, 4990);
  assert.equal(e.survival.borrowed, undefined);
});

test('CC intermediate tiers: travel interruption scales with duration and handles sea', () => {
  const prev = LivingTamrielConfig.travelInterruption;
  LivingTamrielConfig.travelInterruption = PRESENCE.MID;
  try {
    const seaRes = evaluateTravelInterruption({
      regionIndex: 0,
      nowMinutes: 10000,
      tripMinutes: 4320,
      sailing: true,
      maxInterrupts: 3,
      rng: () => 0.01,
    });
    assert.equal(seaRes.shouldInterrupt, true);
    assert.equal(seaRes.eventType, TRAVEL_EVENT_TYPE.WEATHER_HAZARD);
  } finally {
    LivingTamrielConfig.travelInterruption = prev;
  }
});

test('CC QA fixes: Veteran thirst/temp harm bypasses Shield pool and stops at HEALTH_FLOOR', () => {
  const e = makeEntity({
    health: 10,
    maxHealth: 40,
    activeEffects: [{ kind: 'shield', shieldRemaining: 500, ended: false }],
  });
  e.survival = { lastAte: 0, thirst: 140, wet: 0, sleepDebt: 0, awakeSince: 0, exposure: 0, fed: 0, drunk: 0, rotMinutes: 0, rotDays: 0, stiffUntil: 0, notes: {} };
  survivalMinute(e, 100, {}, {
    rules: SURVIVAL_RULES.veteran,
    sinks: { hurt: (n, a) => hurtPlayer(e, n, a?.bypassShield ? { bypassShield: true } : undefined) },
  });
  assert.equal(e.health, 6);
  assert.equal(e.activeEffects[0].shieldRemaining, 500);
});

test('CC QA fixes: Drink buff effect text and statusTip descriptions for drink & meal', () => {
  const e = makeEntity();
  e.survival = { lastAte: 90, thirst: 0, wet: 0, sleepDebt: 0, awakeSince: 0, exposure: 0, fed: 0, drunk: 0, rotMinutes: 0, rotDays: 0, stiffUntil: 0, notes: {}, lastMinute: 100, _heartyBonus: 0.1 };
  tavernDrink(e.survival, 0, { endurance: 50, rules: SURVIVAL_RULES.veteran, now: 100, name: 'Coffee' });
  const desc = drinkBuffEffect(e.survival.drinkBuff);
  assert.match(desc, /\+4 Intelligence/);
  assert.match(desc, /sleep debt/);

  const drinkTip = statusTip({ key: 'need:boon:drink', name: 'Invigorating', kind: 'boon', foot: '3h' }, e);
  assert.ok(drinkTip.lines.some((l) => l.includes('+4 Intelligence')));

  const mealTip = statusTip({ key: 'need:boon:meal', name: 'Well Fed', kind: 'boon', foot: '6h' }, e);
  assert.ok(mealTip.lines.some((l) => l.includes('+10%')));
});

test('CC QA fixes: Soft rust damages equipped metal weapon and shield, skips bows', () => {
  const e = makeEntity();
  e.survival = { lastAte: 100, thirst: 0, wet: 120, sleepDebt: 0, awakeSince: 100, exposure: 0, fed: 0, drunk: 0, rotMinutes: 0, rotDays: 0, stiffUntil: 0, notes: {} };
  const sword = { group: 'Weapons', templateIndex: 116, name: 'Longsword', currentCondition: 100, maxCondition: 100 };
  const bow = { group: 'Weapons', templateIndex: 130, name: 'Short Bow', currentCondition: 100, maxCondition: 100 };
  const worn = [];
  worn[19] = sword;
  worn[21] = bow;
  survivalMinute(e, 101, {}, { rules: SURVIVAL_RULES.standard, worn, rolls: () => 0 });
  assert.equal(sword.currentCondition, 99);
  assert.equal(bow.currentCondition, 100);
});

test('CC QA fixes: installSurvivalRestGate never registers noWildSleep on open gate', () => {
  const handlers = [];
  installSurvivalRestGate(
    () => ({ tempWord: 'comfortable', noWildSleep: true }),
    (fn, msg) => handlers.push({ fn, msg }),
    { enabled: () => true },
  );
  assert.equal(handlers.length, 2);
  assert.equal(handlers.some((h) => h.fn()), false);
});

test('CC QA fixes: Camping Equipment is usable from MiscItems and additem 530 mints UselessItems2', () => {
  assert.equal(isSurvivalItem({ templateIndex: 530, group: 'MiscItems' }), true);
  assert.equal(isSurvivalItem({ templateIndex: 530, group: 'UselessItems2' }), true);
  const cmd = getConsoleCommand('additem');
  const msg = cmd.callback(['530']);
  assert.match(msg, /Camping Equipment/);
});

test('CC QA fixes: alignInnTravel clears stiffUntil, drunk, thirst, sleepDebt and refreshes boons', () => {
  const e = makeEntity();
  e.survival = { lastAte: 0, thirst: 120, wet: 200, sleepDebt: 10, awakeSince: 0, exposure: 50, stiffUntil: 9999, drunk: 20, notes: {} };
  alignInnTravel(e, 5000, SURVIVAL_RULES.veteran);
  assert.equal(e.survival.stiffUntil, 0);
  assert.equal(e.survival.drunk, 0);
  assert.equal(e.survival.thirst, 0);
  assert.ok(e.survival.boons.includes('fed'));
  assert.ok(e.survival.boons.includes('quenched'));
});
