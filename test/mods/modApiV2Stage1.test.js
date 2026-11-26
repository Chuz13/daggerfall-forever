import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  createModApi,
  _resetModPluginApi,
  setModApiContext,
  getModStatusChips,
  setModMovementState,
  cleanupModResources,
} from '../../src/systems/mods/modPluginApi.js';
import { emitModEvent, _resetModEventBus } from '../../src/systems/mods/modEventBus.js';
import {
  registerVirtualMod,
  _resetModRegistry,
} from '../../src/systems/mods/modRegistry.js';
import { syncModData, _resetModDataSync } from '../../src/systems/mods/modDataSync.js';
import { loadActiveModPlugins, unloadModPlugins, _resetModPluginLoader } from '../../src/systems/mods/modPluginLoader.js';
import { computeEntityMods } from '../../src/systems/entityMods.js';
import { weaponBlowMods } from '../../src/systems/entityMods.js';
import { blowTakenScale } from '../../src/systems/blowTaken.js';
import { castRate } from '../../src/systems/castSpeed.js';
import { spellPowerMult, spellPierce, tellSpellLanded } from '../../src/systems/spell/spellPower.js';
import { calculateCastCost } from '../../src/systems/spellcost.js';
import { tellPlayerCast } from '../../src/systems/playerCasts.js';
import { reportPlayerKill } from '../../src/systems/playerKills.js';
import { tellTaken } from '../../src/systems/inventory.js';
import {
  registerPreventRestCondition,
  clearPreventRestConditions,
  getPreventedRestMessage,
} from '../../src/systems/rest/restSession.js';
import { setInteractionMode, getInteractionMode } from '../../src/player/interactionMode.js';
import { statusTiles } from '../../src/ui/hud/hudStatus.js';
import { statusTip } from '../../src/ui/hud/statusTips.js';
import { setLocale, t, currentLocale } from '../../src/systems/textManager.js';
import { executeConsoleCommand } from '../../src/systems/consoleCommands.js';
import { runMagicRoundsFor } from '../../src/systems/worldTick.js';

import initArcaneOverload from '../../mods/examples/arcane-overload/plugin.js';
import initStealthAutoSteal from '../../mods/examples/stealth-auto-steal/plugin.js';
import initDuelistsFlow from '../../mods/examples/duelists-flow/plugin.js';

const ALL_26_LOCALES = [
  'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'fi', 'fr', 'hu', 'id', 'it', 'ja',
  'ko', 'nb', 'nl', 'pl', 'pt-BR', 'ro', 'ru', 'sv', 'tr', 'uk', 'vi', 'zh-Hans', 'zh-Hant',
];

function resetAllModState() {
  _resetModPluginLoader();
  _resetModPluginApi();
  _resetModEventBus();
  _resetModDataSync();
  _resetModRegistry();
  clearPreventRestConditions();
  setInteractionMode('grab');
}

test('Mod API v2: modifiers, events, rest gate, console gating, and clean unload', () => {
  resetAllModState();

  const player = {
    isPlayer: true,
    health: 80,
    maxHealth: 100,
    fatigue: 6400,
    magicka: 50,
    maxMagicka: 100,
    goldPieces: 10,
    items: [],
    stats: { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 },
    skills: {},
    equip: { slots: {} },
  };
  setModApiContext({ player });

  const api = createModApi('stage1-core-test');

  // 1. Modifiers: entityFold, weaponBlow, blowTaken, castSpeed, spellPower, spellPierce, preventRest
  api.modifiers.entityFold('buff', () => ({ stats: { strength: 15 }, weightMult: 0.25 }));
  assert.equal(player._mods.stats.strength, 15);
  assert.equal(player._mods.weightMult, 0.25);

  api.modifiers.weaponBlow('fury', (_w, dmg) => dmg + 7);
  assert.equal(weaponBlowMods(null, 10, player, {}), 17);

  api.modifiers.blowTaken('ward', () => 0.75);
  assert.equal(blowTakenScale({}, player), 0.75);

  api.modifiers.castSpeed('haste', () => 20);
  assert.ok(castRate(player) > 1.15);

  api.modifiers.spellPower('amp', () => 25);
  const foe = { isPlayer: false };
  assert.ok(spellPowerMult(player, foe) >= 1.24);

  api.modifiers.spellPierce('pierce', () => 12);
  assert.equal(spellPierce(player, foe), 12);

  // preventRest survives scene clearPreventRestConditions()
  api.modifiers.preventRest('storm', () => true, 'Too stormy to camp!');
  clearPreventRestConditions();
  assert.equal(getPreventedRestMessage(), 'Too stormy to camp!');

  // 2. Player helpers & events
  assert.equal(api.player.addGold(25), 35);
  assert.equal(api.player.getGold(), 35);
  assert.equal(api.player.getStat('strength'), 65);

  const seen = [];
  api.events.on('playerCast', (e) => seen.push(['cast', e.cost]));
  api.events.on('spellLanded', (e) => seen.push(['landed', e.took]));
  api.events.on('playerKill', (e) => seen.push(['kill', e.kind]));
  api.events.on('itemTaken', (e) => seen.push(['taken', e.item?.name]));
  api.events.on('player:crouchChanged', (e) => seen.push(['crouch', e.crouching]));

  tellPlayerCast(player, { name: 'Spark' }, 9);
  tellSpellLanded({ caster: player, took: 14 });
  reportPlayerKill({ name: 'Rat' }, { kind: 'melee' });
  tellTaken({ name: 'Ruby' });
  setModMovementState({ crouching: true, sneaking: true });

  assert.deepEqual(seen, [
    ['cast', 9],
    ['landed', 14],
    ['kill', 'melee'],
    ['taken', 'Ruby'],
    ['crouch', true],
  ]);

  // 3. Console command registration + gating on unload
  api.console.register('stage1_ping', 'Ping test', 'stage1_ping', () => 'pong-v2');
  assert.equal(executeConsoleCommand('stage1_ping', []), 'pong-v2');

  // 4. Unload removes ALL modifiers, rest gates, and disables console command
  cleanupModResources('stage1-core-test');
  computeEntityMods(player);
  assert.equal(player._mods.stats.strength ?? 0, 0);
  assert.equal(weaponBlowMods(null, 10, player, {}), 10);
  assert.equal(blowTakenScale({}, player), 1);
  assert.equal(castRate(player), 1);
  assert.equal(spellPowerMult(player, foe), 1);
  assert.equal(spellPierce(player, foe), 0);
  assert.equal(getPreventedRestMessage(), null);
  assert.match(executeConsoleCommand('stage1_ping', []), /not found/i);

  resetAllModState();
});

test('Mod API v2: HUD status chips render into statusTiles & statusTip and clear on unload', () => {
  resetAllModState();
  const api = createModApi('hud-chip-mod');

  api.ui.setStatusChip('test_chip', {
    name: 'Test Aura',
    kind: 'buff',
    glyph: 'arcane',
    foot: '2/4',
    meta: 'Mod aura',
    lines: ['Line one: +20% Spell Power', 'Line two: Decays in 10s'],
    tipFoot: '10s',
  });

  const chips = getModStatusChips();
  assert.equal(chips.length, 1);
  const tiles = statusTiles({ modChips: chips });
  assert.equal(tiles.length, 1);
  assert.equal(tiles[0].key, 'mod:hud-chip-mod:test_chip');
  assert.equal(tiles[0].glyph, 'arcane');

  const tip = statusTip(tiles[0], {});
  assert.equal(tip.title, 'Test Aura');
  assert.equal(tip.meta, 'Mod aura');
  assert.deepEqual(tip.lines, ['Line one: +20% Spell Power', 'Line two: Decays in 10s']);
  assert.equal(tip.foot, '10s');

  cleanupModResources('hud-chip-mod');
  assert.equal(getModStatusChips().length, 0);
  resetAllModState();
});

test('Mod API v2: Autonomous 26-language locales load cleanly and roll back on disable', () => {
  resetAllModState();
  const prevLocale = currentLocale();

  for (const modName of ['arcane-overload', 'stealth-auto-steal', 'duelists-flow']) {
    const raw = fs.readFileSync(path.join(process.cwd(), `mods/examples/${modName}/locales.json`), 'utf8');
    const parsed = JSON.parse(raw);
    for (const code of ALL_26_LOCALES) {
      assert.ok(parsed[code] && typeof parsed[code] === 'object', `${modName} must include locale '${code}'`);
    }
  }

  const aoLocales = fs.readFileSync(path.join(process.cwd(), 'mods/examples/arcane-overload/locales.json'), 'utf8');
  registerVirtualMod(
    {
      id: 'arcane-overload',
      name: 'Arcane Overload',
      enabled: true,
      locales: 'locales.json',
    },
    { 'locales.json': aoLocales },
  );
  syncModData();

  setLocale('ru');
  assert.equal(t('ao.chip.name', 'Arcane Overload'), 'Магический перегруз');
  setLocale('de');
  assert.equal(t('ao.chip.name', 'Arcane Overload'), 'Arkane Überladung');
  setLocale('ja');
  assert.equal(t('ao.chip.name', 'Arcane Overload'), 'アルケイン過負荷');

  // Disabling/resetting mod data rolls back mod translations cleanly
  _resetModDataSync();
  setLocale('ru');
  assert.equal(t('ao.chip.name', 'Arcane Overload'), 'Arcane Overload');

  setLocale(prevLocale);
  resetAllModState();
});

test('Arcane Overload mod: 0->4 stacks, cast speed/power/cost, free cast, discharge, burn & HUD chip', () => {
  resetAllModState();
  const prevLocale = currentLocale();
  setLocale('en');

  const player = {
    isPlayer: true,
    health: 50,
    maxHealth: 50,
    fatigue: 6400,
    magicka: 40,
    maxMagicka: 100,
    stats: { strength: 50, intelligence: 50, willpower: 50, agility: 50, endurance: 50, personality: 50, speed: 50, luck: 50 },
    skills: {},
  };
  setModApiContext({ player });

  const api = createModApi('arcane-overload');
  const logs = [];
  api.ui.notify = (m) => logs.push(m);
  api.ui.showMidScreen = (m) => logs.push(m);
  initArcaneOverload(api);

  const foe = { isPlayer: false };
  const dummySpell = { effects: [{ type: 1, subType: 0, magnitudeBaseLow: 10, magnitudeBaseHigh: 10, magnitudeLevelBase: 0, magnitudeLevelHigh: 0, magnitudePerLevel: 0, durationBase: 0, durationMod: 0, durationPerLevel: 0, chanceBase: 0, chanceMod: 0, chancePerLevel: 0 }] };

  const baseCost = calculateCastCost(dummySpell, player).sp;
  assert.equal(castRate(player), 1);
  assert.equal(spellPowerMult(player, foe), 1);

  // Cast 1..3: build charges, increase power/speed/cost
  tellPlayerCast(player, dummySpell, 10);
  tellPlayerCast(player, dummySpell, 10);
  assert.equal(getModStatusChips()[0].foot, '2/4');
  assert.ok(castRate(player) > 1.15);
  assert.ok(spellPowerMult(player, foe) > 1.19);
  assert.ok(calculateCastCost(dummySpell, player).sp >= baseCost);

  // Cast 3
  tellPlayerCast(player, dummySpell, 10);
  assert.equal(getModStatusChips()[0].foot, '3/4');

  // Cast 4 with low magicka (<15%) -> free cast armed + burn damage
  player.magicka = 5;
  tellPlayerCast(player, dummySpell, 10);
  assert.equal(player.health, 47);
  assert.equal(getModStatusChips()[0].foot, 'FREE');
  assert.equal(calculateCastCost(dummySpell, player).sp, 0);

  // Cast 5: discharges back to 0 and clears HUD chip
  tellPlayerCast(player, dummySpell, 0);
  assert.equal(getModStatusChips().length, 0);
  assert.equal(castRate(player), 1);
  assert.equal(spellPowerMult(player, foe), 1);

  // Console command test
  const cmdOut = executeConsoleCommand('overload_set', ['3']);
  assert.match(cmdOut, /3\/4/);
  assert.equal(getModStatusChips()[0].foot, '3/4');

  setLocale(prevLocale);
  resetAllModState();
});

test('Stealth Auto-Steal mod: crouch -> steal + chip, stand -> restore, manual F-key override respected', () => {
  resetAllModState();

  const player = { isPlayer: true, health: 50, maxHealth: 50, fatigue: 6400 };
  setModApiContext({ player });
  setInteractionMode('info');

  const api = createModApi('stealth-auto-steal');
  initStealthAutoSteal(api);

  // Initially standing in 'info' mode -> no chip
  assert.equal(getInteractionMode(), 'info');
  assert.equal(getModStatusChips().length, 0);

  // Crouch -> auto-switches to 'steal' and shows HUD chip
  setModMovementState({ crouching: true, sneaking: true });
  assert.equal(getInteractionMode(), 'steal');
  assert.equal(getModStatusChips().length, 1);
  assert.equal(getModStatusChips()[0].glyph, 'stealth');

  // Stand back up -> restores 'info' mode and clears chip
  setModMovementState({ crouching: false, sneaking: false });
  assert.equal(getInteractionMode(), 'info');
  assert.equal(getModStatusChips().length, 0);

  // Crouch again, then manually switch to 'dialogue' (player F4) -> respected on stand
  setModMovementState({ crouching: true, sneaking: true });
  assert.equal(getInteractionMode(), 'steal');
  setInteractionMode('dialogue', { source: 'player' });
  assert.equal(getModStatusChips().length, 0);
  setModMovementState({ crouching: false, sneaking: false });
  assert.equal(getInteractionMode(), 'dialogue');

  resetAllModState();
});

test('Mod API v2: worldTick & consoleCommands boot-order cycle safety and magicRound emission', () => {
  resetAllModState();
  const api = createModApi('magic-round-boot-test');
  let roundsHeard = 0;
  api.events.on('magicRound', ({ entity }) => {
    if (entity?.isPlayer) roundsHeard++;
  });

  const player = { isPlayer: true, health: 50, maxHealth: 50, fatigue: 6400, stats: { strength: 50, endurance: 50 } };
  runMagicRoundsFor(player, 0, 1, {});
  assert.equal(roundsHeard, 1);

  resetAllModState();
});

test("Duelist's Flow HUD chip: shows at x1, updates via flow_set, and persists passive +5% chip after Trance unlock", () => {
  resetAllModState();
  const prevLocale = currentLocale();
  setLocale('ru');

  const dfLocales = fs.readFileSync(path.join(process.cwd(), 'mods/examples/duelists-flow/locales.json'), 'utf8');
  registerVirtualMod(
    { id: 'duelists-flow', name: "Duelist's Flow", enabled: true, locales: 'locales.json' },
    { 'locales.json': dfLocales },
  );
  syncModData();

  const player = { isPlayer: true, health: 50, maxHealth: 50, fatigue: 6400, stats: { strength: 50, endurance: 50 }, unlockedPerks: [] };
  setModApiContext({ player });
  const api = createModApi('duelists-flow');
  initDuelistsFlow(api);

  // Initially no chip
  assert.equal(getModStatusChips().length, 0);

  // Hit 1 -> chip appears at x1 in Russian
  emitModEvent('combatAttackResolved', { attacker: player, hit: true });
  assert.equal(getModStatusChips().length, 1);
  assert.equal(getModStatusChips()[0].foot, 'x1');
  assert.equal(getModStatusChips()[0].name, 'Поток дуэлянта');

  // flow_set 10 unlocks Trance -> miss drops streak to 0 -> passive +5% chip remains
  executeConsoleCommand('flow_set', ['10']);
  assert.equal(getModStatusChips()[0].foot, 'x10');
  emitModEvent('combatAttackResolved', { attacker: player, hit: false });
  assert.equal(getModStatusChips().length, 1);
  assert.equal(getModStatusChips()[0].foot, '+5%');
  assert.equal(getModStatusChips()[0].name, 'Транс дуэлянта');

  setLocale(prevLocale);
  resetAllModState();
});
