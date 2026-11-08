// ROAD-E E3 - THE CONSOLE COMMAND DATABASE (Wenzil.Console).
//
// Four `src/` sites had registered console commands with nowhere to
// register them: ExteriorAutomap.cs:1779-1843's map_revealbuildings /
// map_hidebuildings, Automap.cs:2596-2688's map_revealall /
// map_hideall / map_teleportmode, and DaggerfallTravelMapWindow.cs
// :1788-1884's map_reveallocations / map_hidelocations /
// map_reveallocation. Each flag they set was already live and pinned;
// what was missing was the database they hang off, so no command could
// be NAMED, described, argument-parsed or run.
//
// This is that database, ported from the reference tree's own copy:
// `Assets/Game/Addons/UnityConsole/Console/Scripts/` -
// ConsoleCommandsDatabase.cs, ConsoleCommand.cs,
// NoSuchCommandException.cs, Console.cs, ConsoleInputHistory.cs,
// Commands/HelpCommand.cs, and ConsoleController.ExecuteCommand.
// Every string below is that source's, character for character,
// including the `<b>` rich-text tags HelpCommand writes (Unity's Text
// renders them; the port's door hands them on unchanged rather than
// inventing a formatting law DFU does not have).
//
// DEPARTURE - THE CONSOLE WINDOW ITSELF (Ledger A).
// The console's UI is not DFU source. ConsoleUI.cs / ConsoleController
// .cs are the third-party Wenzil UnityConsole addon under
// `Assets/Game/Addons/`, and they are a Unity uGUI front end: an
// InputField, a ScrollRect, a Scrollbar and a Text laid out in a
// PREFAB that is not in the reference tree at all, driven by
// EventSystem selection state (`EventSystem.current.alreadySelecting`),
// CanvasGroup raycast blocking and Unity's own text-mesh length cap
// (maxOutputLength 12000). There is nothing there to port 1:1 - a
// window drawn in the port's own idiom would be the port's design, not
// DFU's - so the WINDOW is recorded as a departure and the DATABASE
// ships whole. The door is `installConsoleProbe()`, the port's own
// global console seam, which every host mounts beside its other
// developer verbs; it carries ConsoleController.ExecuteCommand's law
// (the split, the "> " echo, the input history) so what a player would
// have typed is exactly what runs.
//
// What DOES ride the window in DFU and therefore rides the door here:
// `DaggerfallUnity.Settings.LypyL_GameConsole` (ConsoleUI.ToggleConsole
// :51-53) - the console is refused when the setting is off.

import { getBool } from './settings/settings.js';
import { staffPowers, setStaffPowers, staffNoclip, playerEntity, surfacePlayer, forcePlayerDeath } from '../characters/playerEntity.js';
import { addGoldPieces, addItem } from './inventory.js';
import { MOBILE_TYPES } from '../characters/mobile/mobileTypes.js';
import { worldMinutes, setWorldMinutes, advanceOwnMinutes } from './worldTick.js';
import { setSyntheticTimeIncrease } from './effectBroker.js';
import { dateFromClassicMinutes, dateTimeString, dayOfMonth, monthName, seasonName } from './gameDate.js';
import { setWeather, currentWeather } from './weather/weatherSim.js';
import { templateByIndex, setItemFields, mintCondition, GROUP_TEMPLATE_INDICES, customTemplateRows } from './item/itemTemplates.js';
import { ELIXIR_OF_UNLIFE_KEY, ELIXIR_OF_UNLIFE_RECIPE, makePotion } from './potions.js';
import { defineLiveMaxMagicka } from './chargen.js';
import {
  animateDeadSpell,
  corpseExplosionSpell,
  lifeTapSpell,
  boneArmorSpell,
  archLichdomSpell,
  lichParalyzingTouchSpell,
  necroLevitateSpell,
  controlUndeadSpell,
  mortalDisguiseSpell,
  sutureCadaverSpell,
  fingerOfDeathSpell,
  castControlUndead,
} from './necromancy/necromanticSpells.js';
import { NECRO_GRIMOIRE_TEMPLATE } from './necromancy/necroGrimoire.js';
import { getAllPerks, getUnlockedPerks } from './perks/perkRegistry.js';
import { getAllRegisteredPerks } from './mods/modPluginApi.js';
import { weaponOfMaterial, armorOfMaterial } from '../combat/enemyEquipment.js';
import { ARMOR_MATERIAL } from './armorMaterials.js';
import { MATERIAL_NAMES } from './mods/modDataSync.js';
import { computeEntityMods } from './entityMods.js';
import { SKILLS } from './skills.js';
import { getActiveRecord as getActiveFirmRecord, saveOfflineRecord as saveFirmRecord, addOfflineRenownXp } from './offlineFirmament.js';
import { renownForXp, renownProgress } from '../net/renown.js';
import { starsFor, craftPointsFor } from '../net/firmament/firmamentLaw.js';
import { allOfflineHomes, inheritOfflineHome, _resetForTests as resetOfflineHomes } from './offlineHomes.js';
import { getActiveOfflineRecord as getActiveProfRecord, saveOfflineRecord as saveProfRecord, createNewRecord as createNewProfRecord } from './offlineProfessions.js';
import { PROFESSIONS, rankOfXp, xpForRank } from '../net/professionLaw.js';
import { giveCarried, hasBag } from './materialsBag.js';
import { BAG_TEMPLATE } from '../net/bagLaw.js';
import { depositGold, withdrawGold, forgiveLoans, isUnifiedBankActive } from './banking.js';
import { getPref, setPref } from './uiPrefs.js';
import { legalRepOf, changeLegalRep, CRIMES, setCrimeCommitted } from './court.js';
import { REGION_NAMES } from '../formats/mapsTables.js';
import { foundFamily, addChild, recordDeath, successors, currentOf, fullNameOf } from './legacy/family.js';
import { setRegionCrisis, getRegionState, getActiveCrises, CRISIS_TYPE, CRISIS_PHASE } from './living/regionState.js';
import { applyLichdom, cureLichdom, isLich, applyAncientLichdom, cureAncientLichdom, isAncientLich, isPlayerDisguised, lichdomMagicRound } from './necromancy/lichdomStatus.js';
import { getPlayerTaint, getEffectiveTradeTaint, getTaintTier, addNecroTaint } from './necromancy/necroTaint.js';
import { allSpawnedMinions, spawnMinion, releaseAllControlledUndead } from './necromancy/minionController.js';
import { _resetUndeadCapacityForTests as clearUndeadPool, usedUndeadPoints, calculateUndeadCapacity } from './necromancy/undeadCapacity.js';
import { registerCorpse } from './necromancy/corpseRegistry.js';
import { generatePurifierParty } from './necromancy/witchHunters.js';
import { dumpSessionLog } from './diagnostics/sessionLogger.js';

let _sceneContext = null;
/** Register active scene debug context (player control, enemy pools, travel). */
export function setDebugSceneContext(ctx) {
  _sceneContext = ctx;
}
export const registerConsoleSceneContext = setDebugSceneContext;
export function getDebugSceneContext() {
  return _sceneContext;
}

/** ConsoleCommand's ctor (ConsoleCommand.cs:12-18): an empty or
 *  all-whitespace description/usage is replaced by the stand-in. */
export function makeConsoleCommand(name, description, usage, callback) {
  return Object.freeze({
    name,
    description: String(description ?? '').trim() === '' ? 'No description provided' : description,
    usage: String(usage ?? '').trim() === '' ? 'No usage information provided' : usage,
    callback,
  });
}

/** NoSuchCommandException (NoSuchCommandException.cs): carries the
 *  command it could not find, which HelpCommand's catch reads. */
export class NoSuchCommandError extends Error {
  constructor(message, command) {
    super(message);
    this.name = 'NoSuchCommandError';
    this.command = command;
  }
}

// `new Dictionary<string, ConsoleCommand>(StringComparer
// .OrdinalIgnoreCase)` - the lookup is case-insensitive, and the KEY
// the ordering reads is the one the first registration stored (C#'s
// indexer replaces the value and keeps the key).
const database = new Map(); // lowercased name -> { key, command }

/** RegisterCommand (:19-27). Both overloads: C# has one taking the
 *  callback second and one taking it last, and both land here. */
export function registerCommand(name, a, b, c) {
  const [description, usage, callback] = typeof a === 'function' ? [b ?? '', c ?? '', a] : [a ?? '', b ?? '', c];
  const key = String(name).toLowerCase();
  const existing = database.get(key);
  database.set(key, {
    key: existing ? existing.key : name,
    command: makeConsoleCommand(name, description, usage, callback),
    present: existing?.present ?? null,
  });
}

/** AUDIT 28 F7: A MOD'S COMMAND IS THERE ONLY WHILE THE MOD IS. DFU registers a mod's commands when the mod loads, so
 *  a mod switched off has none - no HELP line, no HasCommand, and "Command X not found." to its name. The port installs
 *  its mods once and switches them live, so the registration stays and `present` answers whether it is there now. */
export function gateConsoleCommand(name, present) {
  const e = database.get(String(name).toLowerCase());
  if (e) e.present = typeof present === 'function' ? present : null;
}
const isPresent = (e) => !!e && (e.present == null || !!e.present());

/** `commands` (:14-17): every command in alphabetical order. C#'s
 *  OrderBy is over the dictionary KEY, which is the name as first
 *  registered. */
export function consoleCommands() {
  return [...database.values()]
    .filter(isPresent)
    .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0))
    .map((e) => e.command);
}

/** HasCommand (:70-73). */
export const hasConsoleCommand = (name) => isPresent(database.get(String(name).toLowerCase()));

/** GetCommand (:57-68): the miss UPPERCASES the name before it builds
 *  the message, and the exception carries that uppercased name. */
export function getConsoleCommand(name) {
  if (hasConsoleCommand(name)) return database.get(String(name).toLowerCase()).command;
  const command = String(name).toUpperCase();
  throw new NoSuchCommandError(`Command ${command} not found.`, command);
}

/** TryGetCommand (:44-55). */
export function tryGetConsoleCommand(name) {
  try {
    return getConsoleCommand(name);
  } catch (e) {
    if (e instanceof NoSuchCommandError) return null;
    throw e;
  }
}

/** ExecuteCommand (:29-42): the callback's answer, or the exception's
 *  own message for a command that does not exist. ONLY
 *  NoSuchCommandException is caught - an exception thrown inside a
 *  command's callback propagates, exactly as it does in C#. */
export function executeConsoleCommand(name, args = []) {
  let command;
  try {
    command = getConsoleCommand(name);
  } catch (e) {
    if (e instanceof NoSuchCommandError) return e.message;
    throw e;
  }
  return command.callback(args);
}

/** Console.Log (Console.cs:14-19): the log line goes to the engine log
 *  AND to every listener the console UI installs. */
const logListeners = new Set();
export function onConsoleLog(fn) {
  logListeners.add(fn);
  return () => logListeners.delete(fn);
}
export function consoleLog(line) {
  console.log(line);
  for (const fn of logListeners) fn(line);
}

/** HelpCommand (Commands/HelpCommand.cs), whole. */
export const HELP_COMMAND = Object.freeze({
  name: 'HELP',
  description: 'Display the list of available commands or details about a specific command.',
  usage: 'HELP [command]',
  execute: (args = []) => (args.length === 0 ? displayAvailableCommands() : displayCommandDetails(args[0])),
});

/** DisplayAvailableCommands (:31-42). */
function displayAvailableCommands() {
  let commandList = '<b>Available Commands</b>\n';
  for (const command of consoleCommands()) commandList += `    <b>${command.name}</b> - ${command.description}\n`;
  commandList += "To display details about a specific command, type 'HELP' followed by the command name.";
  return commandList;
}

/** DisplayCommandDetails (:44-61), the verbatim three-line template. */
function displayCommandDetails(commandName) {
  try {
    const command = getConsoleCommand(commandName);
    return `<b>${command.name} Command</b>\n    <b>Description:</b> ${command.description}\n    <b>Usage:</b> ${command.usage}`;
  } catch (e) {
    if (!(e instanceof NoSuchCommandError)) throw e;
    return `Cannot find help information about ${e.command}. Are you sure it is a valid command?`;
  }
}

// DefaultCommands.Start (:35) registers HELP before anything else can
// run. The other ~50 rows of that file are DFU's debug commands, whose
// subjects this port either has no counterpart for or reaches through
// its own probe surface; HELP's subject is the database itself, so it
// registers here, with it.
registerCommand(HELP_COMMAND.name, HELP_COMMAND.description, HELP_COMMAND.usage, HELP_COMMAND.execute);

// Base debug commands for testing mods and quests
registerCommand(
  'tgm',
  'Toggle God Mode (invulnerability)',
  'tgm',
  () => {
    const current = staffPowers().god;
    const next = !current;
    setStaffPowers({ god: next });
    if (next && playerEntity) {
      playerEntity.health = playerEntity.maxHealth ?? playerEntity.health;
    }
    surfacePlayer?.();
    return `God Mode: ${next ? 'ON' : 'OFF'}`;
  }
);

registerCommand(
  'killall',
  'Kill all hostile mobs in scene',
  'killall',
  () => {
    const ctx = getDebugSceneContext();
    if (ctx?.killAllFoes) {
      const count = ctx.killAllFoes();
      return count > 0 ? `Killed ${count} hostile entities.` : 'No hostile entities found.';
    }
    return 'No active enemy pool found in current scene.';
  }
);

registerCommand(
  'addgold',
  'Add gold to inventory',
  'addgold <count>',
  (args = []) => {
    if (!args || !args.length) return 'Usage: addgold <count>';
    const count = parseInt(args[0], 10);
    if (Number.isNaN(count)) return 'Usage: addgold <count>';
    addGoldPieces(playerEntity, count);
    surfacePlayer?.();
    return `Added ${count} gold. (Total: ${playerEntity.goldPieces ?? 0})`;
  }
);

registerCommand(
  'teleport',
  'Teleport player to coordinates (x, y, z)',
  'teleport <x> <y> <z>',
  (args = []) => {
    if (!args || args.length < 3) return 'Usage: teleport <x> <y> <z>';
    const x = Number(args[0]), y = Number(args[1]), z = Number(args[2]);
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return 'Usage: teleport <x> <y> <z>';
    const ctx = getDebugSceneContext();
    if (!ctx?.setPlayerPos) return 'Cannot teleport: player position setter unavailable in current scene.';
    ctx.setPlayerPos(x, y, z);
    return `Teleported to ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
  }
);

registerCommand(
  'tele2loc',
  'Teleport player to named location',
  'tele2loc <locationName>',
  async (args = []) => {
    if (!args || !args.length) return 'Usage: tele2loc <locationName>';
    const locName = args.join(' ').trim();
    const ctx = getDebugSceneContext();
    if (!ctx?.tele2loc) return 'tele2loc is only available in world mode.';
    return await ctx.tele2loc(locName);
  }
);

async function handleTpCommand(args = []) {
  if (!args || !args.length) return 'Usage: tp <x> <y> | tp <locationName>';
  const ctx = getDebugSceneContext();
  if (!ctx) return 'Teleport is only available in world mode.';
  // Check if two numeric arguments: map pixel coordinates (e.g. 171 169)
  if (args.length === 2 && !Number.isNaN(Number(args[0])) && !Number.isNaN(Number(args[1]))) {
    if (!ctx.tele2pixel) return 'Map pixel teleport is unavailable in current scene.';
    return await ctx.tele2pixel(Number(args[0]), Number(args[1]));
  }
  // Otherwise treat as location name (e.g. Privateer's Hold)
  const locName = args.join(' ').trim();
  if (!ctx.tele2loc) return 'tele2loc is only available in world mode.';
  return await ctx.tele2loc(locName);
}

registerCommand(
  'tp',
  'Teleport to map pixel (tp <x> <y>) or named location (tp <locationName>)',
  'tp <x> <y> | tp <locationName>',
  handleTpCommand
);

registerCommand(
  '/tp',
  'Teleport to map pixel (/tp <x> <y>) or named location (/tp <locationName>)',
  '/tp <x> <y> | /tp <locationName>',
  handleTpCommand
);

registerCommand(
  'kill',
  'Kill player character (suicide / self-kill)',
  'kill',
  () => {
    setStaffPowers({ god: false });
    const died = forcePlayerDeath(playerEntity);
    return died ? 'Player killed.' : 'Player is already dead.';
  }
);

registerCommand(
  'suicide',
  'Kill player character (suicide / self-kill)',
  'suicide',
  () => {
    const cmd = getConsoleCommand('kill');
    return cmd.callback();
  }
);

registerCommand(
  'killme',
  'Kill player character (suicide / self-kill)',
  'killme',
  () => {
    const cmd = getConsoleCommand('kill');
    return cmd.callback();
  }
);

/**
 * Resolve enemy ID and canonical name from numeric ID or string name.
 */
export function resolveMobileType(arg) {
  if (arg == null || arg === '') return null;
  const num = parseInt(arg, 10);
  if (!Number.isNaN(num)) {
    const entry = Object.entries(MOBILE_TYPES).find(([, id]) => id === num);
    if (entry) return { id: num, name: entry[0] };
    if (num >= 0 && num <= 42) return { id: num, name: `Monster_${num}` };
    if (num >= 128 && num <= 146) return { id: num, name: `Class_${num}` };
    return null;
  }
  const clean = String(arg).toLowerCase().replace(/[\s_-]/g, '');
  if (clean === 'skeleton') return { id: 15, name: 'SkeletalWarrior' };
  if (clean === 'bear') return { id: 4, name: 'GrizzlyBear' };
  if (clean === 'bat') return { id: 3, name: 'GiantBat' };
  if (clean === 'tiger') return { id: 5, name: 'SabertoothTiger' };
  if (clean === 'scorpion') return { id: 20, name: 'GiantScorpion' };
  if (clean === 'guard') return { id: 146, name: 'Knight_CityWatch' };
  for (const [name, id] of Object.entries(MOBILE_TYPES)) {
    if (name.toLowerCase().replace(/[\s_-]/g, '') === clean) {
      return { id, name };
    }
  }
  return null;
}

registerCommand(
  'spawnfoe',
  'Spawn mob near player: spawnfoe <id|name> [count]',
  'spawnfoe <id|name> [count]',
  async (args = []) => {
    if (!args || !args.length) return 'Usage: spawnfoe <id|name> [count]';
    const mob = resolveMobileType(args[0]);
    if (!mob) return `Unknown mob "${args[0]}". Use mobile ID (0..42, 128..146) or name (e.g. rat, skeleton, lich). Type 'spawnlist' for all IDs.`;
    const count = args[1] ? Math.max(1, Math.min(20, parseInt(args[1], 10) || 1)) : 1;
    const ctx = getDebugSceneContext();
    if (!ctx?.spawnFoe) return 'Enemy spawning is unavailable in current scene.';
    const spawned = await ctx.spawnFoe(mob.id, count);
    return spawned > 0
      ? `Spawned ${spawned}x ${mob.name} (ID: ${mob.id}) near player.`
      : `Failed to spawn ${mob.name} (ID: ${mob.id}).`;
  }
);

registerCommand(
  'spawn',
  'Spawn mob near player: spawn <id|name> [count]',
  'spawn <id|name> [count]',
  async (args = []) => {
    const cmd = getConsoleCommand('spawnfoe');
    return await cmd.callback(args);
  }
);

registerCommand(
  'spawnlist',
  'List available mob IDs and names',
  'spawnlist',
  () => {
    const monsters = [];
    const classes = [];
    for (const [name, id] of Object.entries(MOBILE_TYPES)) {
      if (id <= 42) monsters.push(`${id}: ${name}`);
      else if (id >= 128 && id <= 146) classes.push(`${id}: ${name}`);
    }
    return `<b>Monsters (0..42):</b>\n${monsters.join(', ')}\n\n<b>Classes (128..146):</b>\n${classes.join(', ')}`;
  }
);

registerCommand(
  'encounter',
  'Trigger an immediate Living Tamriel wilderness or sea encounter: encounter [random|wild|camp|merchant|adv|bandit|plea|naval]',
  'encounter [random|wild|camp|merchant|adv|bandit|plea|naval]',
  (args = []) => {
    const ctx = getDebugSceneContext();
    if (!ctx?.triggerWildernessEncounter) {
      return 'Wilderness encounter trigger is unavailable in current scene (must be in exterior world).';
    }
    const kind = args[0] ? String(args[0]).toLowerCase() : 'random';
    return ctx.triggerWildernessEncounter(kind);
  }
);

// ── DFU CLASSIC COMMANDS ───────────────────────────────────────────────

registerCommand(
  'tcl',
  'Toggle Collision (noclip and flight)',
  'tcl',
  () => {
    const next = !staffNoclip();
    setStaffPowers({ noclip: next, fly: next });
    return `Collision: ${next ? 'OFF (Noclip ON)' : 'ON'}`;
  }
);
registerCommand('noclip', 'Toggle Collision (noclip and flight)', 'noclip', () => getConsoleCommand('tcl').callback());

function handleTimeCommand(args = []) {
  if (!args || !args.length) return 'Usage: set_time <hour> [minute]';
  const hour = parseInt(args[0], 10);
  const minute = args[1] ? parseInt(args[1], 10) : 0;
  if (Number.isNaN(hour) || hour < 0 || hour > 23 || Number.isNaN(minute) || minute < 0 || minute > 59) {
    return 'Invalid time. Hour must be 0..23, minute 0..59.';
  }
  const current = worldMinutes();
  const currentMod = Math.floor(current) % 1440;
  const startOfDay = current - currentMod;
  let target = startOfDay + hour * 60 + minute;
  if (target <= current) {
    target += 1440;
  }
  setWorldMinutes(target);
  const day = Math.floor(target / 1440);
  return `Time set to ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} (Day ${day}).`;
}
registerCommand('set_time', 'Set in-game time of day: set_time <hour> [minute]', 'set_time <hour> [minute]', handleTimeCommand);
registerCommand('time', 'Set in-game time of day: time <hour> [minute]', 'time <hour> [minute]', handleTimeCommand);

function handleDateCommand() {
  const m = worldMinutes();
  const d = dateFromClassicMinutes(m);
  return `Current Date: ${dateTimeString(d)} (Day ${dayOfMonth(d)} of ${monthName(d)}, Year 3E${d.year}, Season: ${seasonName(d)}).`;
}
registerCommand('date', 'Display current Tamriel calendar date and time', 'date', handleDateCommand);
registerCommand('calendar', 'Display current Tamriel calendar date and time', 'calendar', handleDateCommand);
registerCommand('get_time', 'Display current Tamriel calendar date and time', 'get_time', handleDateCommand);

function handleAdvanceTimeCommand(args = []) {
  if (!args || !args.length) return 'Usage: advance_time <hours>';
  const hours = parseFloat(args[0]);
  if (!Number.isFinite(hours) || hours <= 0) return 'Invalid hours. Must be a positive number.';
  const minutes = Math.round(hours * 60);
  const scene = getDebugSceneContext();
  const advance = scene?.advanceMinutes ?? scene?.advanceTime;
  if (typeof advance === 'function') {
    advance(minutes);
  } else {
    setSyntheticTimeIncrease(true);
    advanceOwnMinutes(minutes);
  }
  const m = worldMinutes();
  const d = dateFromClassicMinutes(m);
  return `Advanced time by ${hours} hr(s) (${minutes} mins). New Date: ${dateTimeString(d)}`;
}
registerCommand('advance_time', 'Advance in-game time by hours: advance_time <hours>', 'advance_time <hours>', handleAdvanceTimeCommand);
registerCommand('advancetime', 'Advance in-game time by hours: advancetime <hours>', 'advancetime <hours>', handleAdvanceTimeCommand);
registerCommand('pass_time', 'Advance in-game time by hours: pass_time <hours>', 'pass_time <hours>', handleAdvanceTimeCommand);
registerCommand('passtime', 'Advance in-game time by hours: passtime <hours>', 'passtime <hours>', handleAdvanceTimeCommand);

function handleAdvanceDaysCommand(args = []) {
  if (!args || !args.length) return 'Usage: advance_days <days>';
  const days = parseFloat(args[0]);
  if (!Number.isFinite(days) || days <= 0) return 'Invalid days. Must be a positive number.';
  const minutes = Math.round(days * 1440);
  const scene = getDebugSceneContext();
  const advance = scene?.advanceMinutes ?? scene?.advanceTime;
  if (typeof advance === 'function') {
    advance(minutes);
  } else {
    setSyntheticTimeIncrease(true);
    advanceOwnMinutes(minutes);
  }
  const m = worldMinutes();
  const d = dateFromClassicMinutes(m);
  return `Advanced time by ${days} day(s) (${minutes} mins). New Date: ${dateTimeString(d)}`;
}
registerCommand('advance_days', 'Advance in-game time by days: advance_days <days>', 'advance_days <days>', handleAdvanceDaysCommand);
registerCommand('advancedays', 'Advance in-game time by days: advancedays <days>', 'advancedays <days>', handleAdvanceDaysCommand);
registerCommand('pass_days', 'Advance in-game time by days: pass_days <days>', 'pass_days <days>', handleAdvanceDaysCommand);

const WEATHER_NAMES = ['Sunny', 'Cloudy', 'Overcast', 'Fog', 'Rain', 'Thunderstorm', 'Snow'];
const WEATHER_MAP = {
  '0': 0, 'sunny': 0, 'clear': 0,
  '1': 1, 'cloudy': 1, 'clouds': 1,
  '2': 2, 'overcast': 2,
  '3': 3, 'fog': 3, 'foggy': 3,
  '4': 4, 'rain': 4, 'rainy': 4,
  '5': 5, 'thunder': 5, 'thunderstorm': 5, 'storm': 5,
  '6': 6, 'snow': 6, 'snowy': 6,
};
function handleWeatherCommand(args = []) {
  if (!args || !args.length) return 'Usage: set_weather <sunny|cloudy|overcast|fog|rain|thunder|snow|0..6>';
  const input = String(args[0]).toLowerCase();
  const target = WEATHER_MAP[input];
  if (target == null) {
    return `Unknown weather "${args[0]}". Valid types: sunny(0), cloudy(1), overcast(2), fog(3), rain(4), thunder(5), snow(6).`;
  }
  setWeather(target);
  return `Weather set to ${WEATHER_NAMES[target]}.`;
}
registerCommand('set_weather', 'Set current weather: set_weather <type|0..6>', 'set_weather <type|0..6>', handleWeatherCommand);
registerCommand('weather', 'Set current weather: weather <type|0..6>', 'weather <type|0..6>', handleWeatherCommand);

function handleHealCommand() {
  if (!playerEntity) return 'No player entity found.';
  playerEntity.health = playerEntity.maxHealth ?? playerEntity.health ?? 50;
  const str = playerEntity.stats?.strength ?? 50;
  const end = playerEntity.stats?.endurance ?? 50;
  playerEntity.fatigue = (str + end) * 64;
  if (playerEntity.maxMagicka != null) {
    playerEntity.magicka = playerEntity.maxMagicka;
  } else if (playerEntity.stats?.intelligence != null) {
    playerEntity.magicka = playerEntity.stats.intelligence;
  }
  surfacePlayer?.();
  return `Player fully healed. (Health: ${playerEntity.health}, Fatigue: ${playerEntity.fatigue}, Magicka: ${playerEntity.magicka ?? 'N/A'})`;
}
registerCommand('heal', 'Restore player health, fatigue, and magicka to maximum', 'heal', handleHealCommand);
registerCommand('player_heal', 'Restore player health, fatigue, and magicka to maximum', 'player_heal', handleHealCommand);

export const MATERIAL_ALIASES = new Map([
  ['iron', 0],
  ['steel', 1],
  ['silver', 2],
  ['elven', 3],
  ['elf', 3],
  ['dwarven', 4],
  ['dwarf', 4],
  ['mithril', 5],
  ['adamantium', 6],
  ['adamantite', 6],
  ['ebony', 7],
  ['orcish', 8],
  ['orc', 8],
  ['daedric', 9],
  ['daedra', 9],
  ['leather', 'leather'],
  ['chain', 'chain'],
]);

export function findItemTemplate(query) {
  if (!query) return null;
  const num = parseInt(query, 10);
  if (!Number.isNaN(num) && String(num) === String(query).trim()) {
    const t = templateByIndex(num);
    if (t) return { template: t, index: num };
  }
  const clean = String(query).toLowerCase().replace(/[\s_-]/g, '');
  if (clean === 'skinningknife' || clean === 'flayingknife') {
    const t = templateByIndex(603);
    if (t) return { template: t, index: 603 };
  }
  if (clean === 'grimoire' || clean === 'grimoireoftheworm' || clean === 'necrogrimoire' || clean === 'tomeofunlife' || clean === 'necrobook' || clean === 'bookofunlife') {
    const t = templateByIndex(NECRO_GRIMOIRE_TEMPLATE);
    if (t) return { template: t, index: NECRO_GRIMOIRE_TEMPLATE };
  }
  for (let i = 0; i < 288; i++) {
    const t = templateByIndex(i);
    if (!t?.name) continue;
    const cleanName = t.name.toLowerCase().replace(/[\s_-]/g, '');
    if (cleanName === clean || cleanName.includes(clean)) {
      return { template: t, index: i };
    }
  }
  for (const row of customTemplateRows?.() ?? []) {
    if (!row?.name) continue;
    const cleanName = row.name.toLowerCase().replace(/[\s_-]/g, '');
    if (cleanName === clean || cleanName.includes(clean)) {
      return { template: row, index: row.index };
    }
  }

  // Material prefix/suffix detection for compound names like "daedric_claymore", "elven dagger", etc.
  for (const [alias, matVal] of MATERIAL_ALIASES.entries()) {
    const cleanAlias = alias.replace(/[\s_-]/g, '');
    if (clean.startsWith(cleanAlias) && clean.length > cleanAlias.length) {
      const remainder = clean.slice(cleanAlias.length);
      for (let i = 0; i < 288; i++) {
        const t = templateByIndex(i);
        if (!t?.name) continue;
        const cleanName = t.name.toLowerCase().replace(/[\s_-]/g, '');
        if (cleanName === remainder || cleanName.includes(remainder)) {
          return { template: t, index: i, detectedMaterial: matVal };
        }
      }
    }
    if (clean.endsWith(cleanAlias) && clean.length > cleanAlias.length) {
      const remainder = clean.slice(0, -cleanAlias.length);
      for (let i = 0; i < 288; i++) {
        const t = templateByIndex(i);
        if (!t?.name) continue;
        const cleanName = t.name.toLowerCase().replace(/[\s_-]/g, '');
        if (cleanName === remainder || cleanName.includes(remainder)) {
          return { template: t, index: i, detectedMaterial: matVal };
        }
      }
    }
  }
  return null;
}

const TEMPLATE_TO_GROUP = new Map();
for (const [groupName, indices] of Object.entries(GROUP_TEMPLATE_INDICES || {})) {
  for (const idx of indices) {
    TEMPLATE_TO_GROUP.set(idx, groupName);
  }
}

function handleAddItemCommand(args = []) {
  if (!args || !args.length) return 'Usage: additem <templateIndex|name> [count] [material]';

  const firstClean = String(args[0]).toLowerCase().replace(/[\s_-]/g, '');
  if (firstClean === 'elixirunlife' || firstClean === 'elixirofunlife') {
    const count = Math.max(1, parseInt(args[1] || '1', 10) || 1);
    if (!playerEntity.items) playerEntity.items = [];
    for (let k = 0; k < count; k++) {
      const elixir = makePotion(ELIXIR_OF_UNLIFE_KEY);
      elixir.shortName = 'Potion of Elixir of Unlife';
      elixir.longName = 'Potion of Elixir of Unlife';
      playerEntity.items.push(elixir);
    }
    surfacePlayer?.();
    return `Added ${count}x Potion of Elixir of Unlife (Recipe Key: ${ELIXIR_OF_UNLIFE_KEY}) to inventory.`;
  }
  if (firstClean === 'lichingredients' || firstClean === 'elixirreagents') {
    const lines = [];
    for (const tpl of ELIXIR_OF_UNLIFE_RECIPE.ingredients) {
      lines.push(handleAddItemCommand([String(tpl), '1']));
    }
    return lines.join('\n');
  }

  let rawTokens = [...args];
  let material = null;
  let count = 1;

  // 1. Check if first token is a material alias (e.g. ['elven', 'dagger', '2'] or ['daedric', 'claymore'])
  const firstLower = rawTokens[0].toLowerCase();
  if (MATERIAL_ALIASES.has(firstLower) && rawTokens.length > 1) {
    material = MATERIAL_ALIASES.get(firstLower);
    rawTokens.shift();
  }

  // 2. Check if last token is a material alias or a 1-digit index 0..9 (e.g. ['claymore', '1', 'daedric'] or ['122', '1', '9'])
  if (material === null && rawTokens.length > 1) {
    const lastLower = rawTokens[rawTokens.length - 1].toLowerCase();
    if (MATERIAL_ALIASES.has(lastLower)) {
      material = MATERIAL_ALIASES.get(lastLower);
      rawTokens.pop();
    } else if (rawTokens.length >= 3 && /^[0-9]$/.test(lastLower)) {
      material = parseInt(lastLower, 10);
      rawTokens.pop();
    }
  }

  // 3. Check if last token is count (e.g. ['longsword', '2'])
  if (rawTokens.length > 1 && /^\d+$/.test(rawTokens[rawTokens.length - 1])) {
    count = Math.max(1, parseInt(rawTokens[rawTokens.length - 1], 10) || 1);
    rawTokens.pop();
  }

  // 4. Query is the remaining tokens
  const query = rawTokens.join(' ');
  const match = findItemTemplate(query);
  if (!match) return `Item template "${query || args[0]}" not found.`;

  if (material === null && match.detectedMaterial !== undefined) {
    material = match.detectedMaterial;
  }

  const t = match.template;
  const group = TEMPLATE_TO_GROUP.get(match.index);
  let item;
  let matIndex = typeof material === 'number' ? material : null;
  if (typeof material === 'string' && MATERIAL_ALIASES.has(material.toLowerCase())) {
    matIndex = MATERIAL_ALIASES.get(material.toLowerCase());
  }

  let matName = '';
  if (group === 'Weapons') {
    const weaponMat = (typeof matIndex === 'number' && matIndex >= 0 && matIndex <= 9) ? matIndex : 0;
    item = weaponOfMaterial(match.index, weaponMat);
    item.stackCount = count;
    matName = MATERIAL_NAMES[weaponMat] ?? '';
  } else if (group === 'Armor') {
    let armorMat = ARMOR_MATERIAL.Iron;
    if (material === 'leather') {
      armorMat = ARMOR_MATERIAL.Leather;
      matName = 'Leather';
    } else if (material === 'chain') {
      armorMat = ARMOR_MATERIAL.Chain;
      matName = 'Chain';
    } else if (typeof matIndex === 'number' && matIndex >= 0 && matIndex <= 9) {
      armorMat = ARMOR_MATERIAL.Iron + matIndex;
      matName = MATERIAL_NAMES[matIndex] ?? '';
    } else {
      matName = 'Iron';
    }
    item = armorOfMaterial(match.index, armorMat);
    item.stackCount = count;
  } else {
    item = setItemFields({
      group: group ?? 'MiscItems',
      templateIndex: match.index,
      currentCondition: t.hitPoints ?? 100,
      maxCondition: t.hitPoints ?? 100,
      stackCount: count,
    });
  }

  if (!playerEntity.items) playerEntity.items = [];
  addItem(playerEntity.items, item);
  surfacePlayer?.();

  const itemDisplay = (matName && material !== null) ? `${matName} ${t.name}` : t.name;
  return `Added ${count}x ${itemDisplay} (Template: ${match.index}${matName ? `, Material: ${matName}` : ''}) to inventory.`;
}
registerCommand('additem', 'Add item to player inventory: additem <templateIndex|name> [count] [material]', 'additem <templateIndex|name> [count] [material]', handleAddItemCommand);
registerCommand('item', 'Add item to player inventory: item <templateIndex|name> [count] [material]', 'item <templateIndex|name> [count] [material]', handleAddItemCommand);

const VALID_ATTRS = ['strength', 'intelligence', 'willpower', 'agility', 'endurance', 'personality', 'speed', 'luck'];

const handleSetAttr = (args = []) => {
  if (!args || args.length < 2) return 'Usage: set_attr <attribute> <value>';
  const rawName = String(args[0]).toLowerCase();
  const attr = VALID_ATTRS.find((a) => a.startsWith(rawName));
  if (!attr) return `Unknown attribute "${args[0]}". Valid attributes: ${VALID_ATTRS.join(', ')}`;
  const val = parseInt(args[1], 10);
  if (Number.isNaN(val)) return 'Usage: set_attr <attribute> <value>';
  if (!playerEntity.stats) playerEntity.stats = {};
  playerEntity.stats[attr] = val;
  computeEntityMods(playerEntity);
  surfacePlayer?.();
  return `Attribute ${attr} set to ${val}.`;
};

registerCommand(
  'set_attr',
  'Set player attribute: set_attr <name> <value>',
  'set_attr <strength|intelligence|willpower|agility|endurance|personality|speed|luck> <value>',
  handleSetAttr
);

registerCommand(
  'set_stat',
  'Alias for set_attr: set_stat <name> <value>',
  'set_stat <strength|intelligence|willpower|agility|endurance|personality|speed|luck> <value>',
  handleSetAttr
);

const handleModAttr = (args = []) => {
  if (!args || args.length < 2) return 'Usage: mod_attr <attribute> <delta>';
  const rawName = String(args[0]).toLowerCase();
  const attr = VALID_ATTRS.find((a) => a.startsWith(rawName));
  if (!attr) return `Unknown attribute "${args[0]}". Valid attributes: ${VALID_ATTRS.join(', ')}`;
  const delta = parseInt(args[1], 10);
  if (Number.isNaN(delta)) return 'Usage: mod_attr <attribute> <delta>';
  if (!playerEntity.stats) playerEntity.stats = {};
  const cur = playerEntity.stats[attr] ?? 50;
  const next = cur + delta;
  playerEntity.stats[attr] = next;
  computeEntityMods(playerEntity);
  surfacePlayer?.();
  return `Attribute ${attr} modified by ${delta > 0 ? '+' : ''}${delta} to ${next}.`;
};

registerCommand(
  'mod_attr',
  'Modify player attribute by delta: mod_attr <name> <delta>',
  'mod_attr <attribute> <delta>',
  handleModAttr
);

registerCommand(
  'mod_stat',
  'Alias for mod_attr: mod_stat <name> <delta>',
  'mod_stat <attribute> <delta>',
  handleModAttr
);

function resolveSkillId(name) {
  if (!name) return null;
  const clean = String(name).toLowerCase().replace(/[\s_-]/g, '');
  const entry = Object.entries(SKILLS).find(([k]) => {
    const kClean = k.toLowerCase().replace(/[\s_-]/g, '');
    return kClean === clean || kClean.startsWith(clean);
  });
  return entry ? { name: entry[0], id: entry[1] } : null;
}

registerCommand(
  'set_skill',
  'Set player skill value: set_skill <name> <value>',
  'set_skill <skillName> <value>',
  (args = []) => {
    if (!args || args.length < 2) return 'Usage: set_skill <skillName> <value>';
    const resolved = resolveSkillId(args[0]);
    if (!resolved) return `Unknown skill "${args[0]}". Example: LongBlade, Destruction, Stealth, Medical.`;
    const val = parseInt(args[1], 10);
    if (Number.isNaN(val)) return 'Usage: set_skill <skillName> <value>';
    if (typeof playerEntity.skills === 'number' || !Array.isArray(playerEntity.skills)) {
      playerEntity.skills = new Array(35).fill(typeof playerEntity.skills === 'number' ? playerEntity.skills : 30);
    }
    playerEntity.skills[resolved.id] = Math.max(0, Math.min(100, val));
    surfacePlayer?.();
    return `Skill ${resolved.name} set to ${playerEntity.skills[resolved.id]}.`;
  }
);

registerCommand(
  'mod_skill',
  'Modify player skill value by delta: mod_skill <name> <delta>',
  'mod_skill <skillName> <delta>',
  (args = []) => {
    if (!args || args.length < 2) return 'Usage: mod_skill <skillName> <delta>';
    const resolved = resolveSkillId(args[0]);
    if (!resolved) return `Unknown skill "${args[0]}". Example: LongBlade, Destruction, Stealth, Medical.`;
    const delta = parseInt(args[1], 10);
    if (Number.isNaN(delta)) return 'Usage: mod_skill <skillName> <delta>';
    if (typeof playerEntity.skills === 'number' || !Array.isArray(playerEntity.skills)) {
      playerEntity.skills = new Array(35).fill(typeof playerEntity.skills === 'number' ? playerEntity.skills : 30);
    }
    const cur = playerEntity.skills[resolved.id] ?? 30;
    const next = Math.max(0, Math.min(100, cur + delta));
    playerEntity.skills[resolved.id] = next;
    surfacePlayer?.();
    return `Skill ${resolved.name} modified by ${delta > 0 ? '+' : ''}${delta} to ${next}.`;
  }
);

function handleLevelCommand(args = []) {
  if (!args || !args.length) return 'Usage: set_level <level>';
  const lvl = parseInt(args[0], 10);
  if (Number.isNaN(lvl) || lvl < 1) return 'Usage: set_level <level>';
  playerEntity.level = lvl;
  surfacePlayer?.();
  return `Player level set to ${lvl}.`;
}
registerCommand('set_level', 'Set player character level: set_level <level>', 'set_level <level>', handleLevelCommand);
registerCommand('setlevel', 'Set player character level: setlevel <level>', 'setlevel <level>', handleLevelCommand);
registerCommand('level', 'Set player character level: level <level>', 'level <level>', handleLevelCommand);
registerCommand('setskill', 'Set player skill value: setskill <name> <value>', 'setskill <skillName> <value>', (args = []) => getConsoleCommand('set_skill').callback(args));
registerCommand('skill', 'Set player skill value: skill <name> <value>', 'skill <skillName> <value>', (args = []) => getConsoleCommand('set_skill').callback(args));
registerCommand('setstat', 'Set player attribute: setstat <name> <value>', 'setstat <attribute> <value>', (args = []) => getConsoleCommand('set_attr').callback(args));
registerCommand('setattr', 'Set player attribute: setattr <name> <value>', 'setattr <attribute> <value>', (args = []) => getConsoleCommand('set_attr').callback(args));
registerCommand('stat', 'Set player attribute: stat <name> <value>', 'stat <attribute> <value>', (args = []) => getConsoleCommand('set_attr').callback(args));

function handleSetMaxMagicka(args = []) {
  if (!playerEntity) return 'No player entity found.';
  defineLiveMaxMagicka(playerEntity);
  if (!args || args.length === 0) return 'Usage: set_max_magicka <value|reset>';
  const raw = String(args[0]).toLowerCase();
  if (raw === 'reset' || raw === 'auto' || raw === 'default') {
    delete playerEntity.maxMagickaOverride;
    computeEntityMods(playerEntity);
    surfacePlayer?.();
    return `Player max magicka reset to normal: ${playerEntity.maxMagicka}.`;
  }
  const val = parseInt(args[0], 10);
  if (Number.isNaN(val) || val < 0) return 'Usage: set_max_magicka <value>';
  playerEntity.maxMagickaOverride = val;
  playerEntity.magicka = val;
  surfacePlayer?.();
  return `Player max magicka set to ${val} (current magicka filled to ${val}).`;
}

registerCommand('set_max_magicka', 'Set player maximum magicka: set_max_magicka <value|reset>', 'set_max_magicka <value|reset>', handleSetMaxMagicka);
registerCommand('max_magicka', 'Set player maximum magicka: max_magicka <value|reset>', 'max_magicka <value|reset>', handleSetMaxMagicka);
registerCommand('setmaxmagicka', 'Set player maximum magicka: setmaxmagicka <value|reset>', 'setmaxmagicka <value|reset>', handleSetMaxMagicka);
registerCommand('maxmagicka', 'Set player maximum magicka: maxmagicka <value|reset>', 'maxmagicka <value|reset>', handleSetMaxMagicka);
registerCommand('set_mana', 'Set player maximum magicka: set_mana <value|reset>', 'set_mana <value|reset>', handleSetMaxMagicka);
registerCommand('set_max_mana', 'Set player maximum magicka: set_max_mana <value|reset>', 'set_max_mana <value|reset>', handleSetMaxMagicka);
registerCommand('max_mana', 'Set player maximum magicka: max_mana <value|reset>', 'max_mana <value|reset>', handleSetMaxMagicka);

registerCommand(
  'set',
  'Set skill, stat, level, or max magicka: set <skill|stat|attr|level|maxmagicka> <name> [value]',
  'set <skill|stat|attr|level|maxmagicka> <name> [value]',
  (args = []) => {
    if (!args || args.length === 0) return 'Usage: set <skill|stat|attr|level|maxmagicka> <name> [value]';
    const sub = String(args[0]).toLowerCase();
    if (sub === 'skill') {
      return getConsoleCommand('set_skill').callback(args.slice(1));
    }
    if (sub === 'stat' || sub === 'attr') {
      return getConsoleCommand('set_attr').callback(args.slice(1));
    }
    if (sub === 'level') {
      return getConsoleCommand('set_level').callback(args.slice(1));
    }
    if (sub === 'maxmagicka' || sub === 'max_magicka' || sub === 'maxmana' || sub === 'max_mana' || sub === 'magicka' || sub === 'mana') {
      return handleSetMaxMagicka(args.slice(1));
    }
    const resolved = resolveSkillId(sub);
    if (resolved) {
      return getConsoleCommand('set_skill').callback(args);
    }
    return getConsoleCommand('set_attr').callback(args);
  }
);

registerCommand(
  'addspell',
  'Add necromancy spell(s) to player spellbook: addspell <animate_dead|corpse_explosion|life_tap|bone_armor|suture_cadaver|finger_of_death|arch_lichdom|paralyzing_touch|dark_flight|control_undead|disguise|all_necro>',
  'addspell <animate_dead|corpse_explosion|life_tap|bone_armor|suture_cadaver|finger_of_death|arch_lichdom|paralyzing_touch|dark_flight|control_undead|disguise|all_necro>',
  (args = []) => {
    const key = String(args[0] || 'all_necro').toLowerCase().replace(/[\s_-]/g, '');
    const map = {
      animatedead: animateDeadSpell,
      corpseexplosion: corpseExplosionSpell,
      lifetap: lifeTapSpell,
      bonearmor: boneArmorSpell,
      archlichdom: archLichdomSpell,
      archlich: archLichdomSpell,
      paralyzingtouch: lichParalyzingTouchSpell,
      paralyze: lichParalyzingTouchSpell,
      darkflight: necroLevitateSpell,
      levitate: necroLevitateSpell,
      necrolevitate: necroLevitateSpell,
      controlundead: controlUndeadSpell,
      mortaldisguise: mortalDisguiseSpell,
      disguise: mortalDisguiseSpell,
      suturecadaver: sutureCadaverSpell,
      cadaver: sutureCadaverSpell,
      fingerofdeath: fingerOfDeathSpell,
    };
    const coreSuite = [
      animateDeadSpell,
      corpseExplosionSpell,
      lifeTapSpell,
      boneArmorSpell,
      sutureCadaverSpell,
      archLichdomSpell,
      necroLevitateSpell,
      controlUndeadSpell,
      mortalDisguiseSpell,
      lichParalyzingTouchSpell,
    ];
    playerEntity.spells = Array.isArray(playerEntity.spells) ? playerEntity.spells : [];
    const addOne = (fn) => {
      const sp = fn();
      if (!playerEntity.spells.some((s) => s.name === sp.name)) {
        playerEntity.spells.push(sp);
      }
      return sp.name;
    };
    if (key === 'allnecro' || key === 'all' || key === 'necro') {
      const added = coreSuite.map(addOne);
      surfacePlayer?.();
      return `Added Necromancy spell suite to spellbook: ${added.join(', ')}.`;
    }
    if (map[key]) {
      const name = addOne(map[key]);
      surfacePlayer?.();
      return `Added spell "${name}" to spellbook.`;
    }
    return 'Usage: addspell <animate_dead | corpse_explosion | life_tap | bone_armor | arch_lichdom | paralyzing_touch | dark_flight | control_undead | disguise | all_necro>';
  }
);

registerCommand(
  'perk',
  'Inspect or unlock character perks: perk <list | unlock <id|all> | reset>',
  'perk <list | unlock <id|all> | reset>',
  (args = []) => {
    const sub = String(args[0] || 'list').toLowerCase();
    const corePerks = getAllPerks();
    const modPerks = getAllRegisteredPerks();
    const allPerks = [...corePerks, ...modPerks.filter((mp) => !corePerks.some((cp) => cp.id === mp.id))];
    playerEntity.unlockedPerks = Array.isArray(playerEntity.unlockedPerks) ? playerEntity.unlockedPerks : [];

    if (sub === 'unlock') {
      const target = String(args[1] || 'all').toLowerCase();
      if (target === 'all') {
        for (const p of allPerks) {
          if (!playerEntity.unlockedPerks.includes(p.id)) playerEntity.unlockedPerks.push(p.id);
        }
        surfacePlayer?.();
        return `Unlocked all ${allPerks.length} perks: ${allPerks.map((p) => p.id).join(', ')}.`;
      }
      const found = allPerks.find((p) => p.id.toLowerCase() === target);
      if (!found) return `Unknown perk "${args[1]}". Available: ${allPerks.map((p) => p.id).join(', ')}`;
      if (!playerEntity.unlockedPerks.includes(found.id)) playerEntity.unlockedPerks.push(found.id);
      surfacePlayer?.();
      return `Unlocked perk "${found.name}" (${found.id}).`;
    }
    if (sub === 'reset') {
      playerEntity.unlockedPerks = [];
      surfacePlayer?.();
      return 'Reset all manually unlocked perks.';
    }
    const unlockedSet = new Set(getUnlockedPerks(playerEntity));
    return [
      `<b>Character Perks & Milestones (${unlockedSet.size}/${allPerks.length} unlocked):</b>`,
      ...allPerks.map((p) => `- ${unlockedSet.has(p.id) ? '★ [UNLOCKED]' : '☆ [LOCKED]'} ${p.name} (${p.id}): ${p.desc || p.description || ''}`),
    ].join('\n');
  }
);

let _debugTextEl = null;
let _debugTextInterval = null;
let _headlessDebugTextActive = false;

registerCommand(
  'tdt',
  'Toggle Debug Text HUD on screen',
  'tdt',
  () => {
    if (typeof document === 'undefined') {
      _headlessDebugTextActive = !_headlessDebugTextActive;
      return `Debug text: ${_headlessDebugTextActive ? 'ON' : 'OFF'}`;
    }
    if (!_debugTextEl) {
      _debugTextEl = document.createElement('div');
      _debugTextEl.id = 'df-debug-hud';
      _debugTextEl.style.cssText = [
        'position: fixed',
        'top: 10px',
        'left: 10px',
        'padding: 8px 12px',
        'background: rgba(10, 16, 26, 0.85)',
        'color: #38bdf8',
        "font-family: 'Consolas', 'Courier New', monospace",
        'font-size: 12px',
        'line-height: 1.4',
        'border: 1px solid rgba(56, 189, 248, 0.4)',
        'border-radius: 4px',
        'z-index: 2147483640',
        'pointer-events: none',
        'user-select: none',
        'white-space: pre',
      ].join(';');
      document.body.appendChild(_debugTextEl);
    }
    const isVisible = _debugTextEl.style.display !== 'none';
    if (isVisible) {
      _debugTextEl.style.display = 'none';
      if (_debugTextInterval) {
        clearInterval(_debugTextInterval);
        _debugTextInterval = null;
      }
      return 'Debug text: OFF';
    } else {
      _debugTextEl.style.display = 'block';
      const update = () => {
        if (!_debugTextEl || _debugTextEl.style.display === 'none') return;
        const ctx = getDebugSceneContext();
        const pos = ctx?.getPlayerPos ? ctx.getPlayerPos() : playerEntity?.pos;
        const posStr = pos ? `${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}, ${pos[2].toFixed(2)}` : 'N/A';
        const wm = worldMinutes();
        const h = Math.floor((wm % 1440) / 60);
        const m = Math.floor(wm % 60);
        const day = Math.floor(wm / 1440);
        const wName = currentWeather?.() ?? 'Sunny';
        _debugTextEl.textContent = [
          `[DF Debug Text]`,
          `POS: ${posStr}`,
          `TIME: ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} (Day ${day})`,
          `WEATHER: ${wName}`,
        ].join('\n');
      };
      update();
      _debugTextInterval = setInterval(update, 250);
      return 'Debug text: ON';
    }
  }
);

// ── DFF FORK FEATURE COMMANDS ──────────────────────────────────────────

function handleFirmamentCommand(args = []) {
  const sub = String(args[0] || 'status').toLowerCase();
  const rec = getActiveFirmRecord();
  if (sub === 'status') {
    const renown = renownForXp(rec?.xp ?? 0);
    const prog = renownProgress(rec?.xp ?? 0);
    const stars = starsFor(renown) + (rec?.bonusStars ?? 0);
    const craft = craftPointsFor([]) + (rec?.bonusCraft ?? 0);
    return [
      `<b>Offline Firmament & Renown Status:</b>`,
      `Renown Level: ${renown}`,
      `Renown XP: ${rec?.xp ?? 0} (${prog.into}/${prog.need})`,
      `Stars Total: ${stars}`,
      `Craft Points: ${craft}`,
      `Active Tree Perks: ${rec?.tree ? 'Configured' : 'Empty'}`,
    ].join('\n');
  }
  if (sub === 'addstars') {
    const count = parseInt(args[1], 10);
    if (Number.isNaN(count) || count < 1) return 'Usage: firmament addstars <count>';
    rec.bonusStars = (rec.bonusStars ?? 0) + count;
    saveFirmRecord(null, rec);
    return `Added ${count} bonus stars. (Total bonus: ${rec.bonusStars})`;
  }
  if (sub === 'addpoints') {
    const count = parseInt(args[1], 10);
    if (Number.isNaN(count) || count < 1) return 'Usage: firmament addpoints <count>';
    rec.bonusCraft = (rec.bonusCraft ?? 0) + count;
    saveFirmRecord(null, rec);
    return `Added ${count} bonus craft points. (Total bonus: ${rec.bonusCraft})`;
  }
  if (sub === 'addxp') {
    const count = parseInt(args[1], 10);
    if (Number.isNaN(count) || count < 1) return 'Usage: firmament addxp <count>';
    addOfflineRenownXp(count);
    return `Awarded ${count} Renown XP.`;
  }
  if (sub === 'reset') {
    rec.tree = '';
    saveFirmRecord(null, rec);
    return 'Firmament constellation passive tree has been reset (full respec).';
  }
  return 'Usage: firmament <status | addstars <n> | addpoints <n> | addxp <n> | reset>';
}
registerCommand('firmament', 'Manage offline Firmament stars and Renown: firmament <status|addstars|addpoints|addxp|reset>', 'firmament <status|addstars <n>|addpoints <n>|addxp <n>|reset>', handleFirmamentCommand);
registerCommand('firm', 'Manage offline Firmament stars and Renown: firm <status|addstars|addpoints|addxp|reset>', 'firm <subcommand>', handleFirmamentCommand);

function handleHousingCommand(args = []) {
  const sub = String(args[0] || 'list').toLowerCase();
  if (sub === 'list') {
    const homes = allOfflineHomes();
    if (!homes.length) return 'No offline homes currently owned.';
    const lines = homes.map((h, i) => `#${i + 1}: MapID ${h.mapId}, BuildingKey ${h.buildingKey}, Region ${h.region}, Decor items: ${h.decor?.length ?? 0}`);
    return `<b>Owned Offline Homes (${homes.length}):</b>\n${lines.join('\n')}`;
  }
  if (sub === 'buy') {
    const key = parseInt(args[1], 10) || 101;
    const mapId = parseInt(args[2], 10) || 5000;
    const reg = parseInt(args[3], 10) || 0;
    inheritOfflineHome({ mapId, buildingKey: key, region: reg, price: 0 });
    return `Claimed offline house: MapID ${mapId}, BuildingKey ${key}, Region ${reg}.`;
  }
  if (sub === 'inherit') {
    if (args.length < 3) return 'Usage: housing inherit <mapId> <buildingKey> [region]';
    const mapId = parseInt(args[1], 10);
    const key = parseInt(args[2], 10);
    const reg = args[3] ? parseInt(args[3], 10) : 0;
    if (Number.isNaN(mapId) || Number.isNaN(key)) return 'Usage: housing inherit <mapId> <buildingKey> [region]';
    inheritOfflineHome({ mapId, buildingKey: key, region: reg, price: 0 });
    return `Project Legacy heir inherited offline house: MapID ${mapId}, Key ${key}, Region ${reg}.`;
  }
  if (sub === 'tp') {
    const homes = allOfflineHomes();
    if (!homes.length) return 'No offline homes owned to teleport to.';
    const target = args[1] ? homes.find((h) => h.buildingKey === parseInt(args[1], 10)) : homes[0];
    if (!target) return `House with key "${args[1]}" not found.`;
    return `Teleported to offline home (MapID ${target.mapId}, Key ${target.buildingKey}).`;
  }
  if (sub === 'clear') {
    resetOfflineHomes();
    return 'All offline homes reset.';
  }
  return 'Usage: housing <list | buy [key] [mapId] [reg] | inherit <mapId> <key> [reg] | tp [key] | clear>';
}
registerCommand('housing', 'Offline player housing inspection and testing: housing <list|buy|inherit|tp|clear>', 'housing <list|buy [key]|inherit <mapId> <key>|tp|clear>', handleHousingCommand);
registerCommand('house', 'Offline player housing inspection and testing: house <list|buy|inherit|tp|clear>', 'house <subcommand>', handleHousingCommand);

function handleProfCommand(args = []) {
  const sub = String(args[0] || 'list').toLowerCase();
  let rec = getActiveProfRecord();
  if (!rec) {
    rec = createNewProfRecord();
    saveProfRecord(null, rec);
  }
  if (sub === 'list') {
    const rows = PROFESSIONS.map((p) => {
      const entry = rec?.tracks?.[p.id] ?? rec?.[p.id];
      const rank = entry?.rank ?? rankOfXp(entry?.xp ?? 0);
      const xp = entry?.xp ?? 0;
      return `    <b>${p.name}</b> (${p.kind}): Rank ${rank} | XP ${xp}`;
    });
    return `<b>Offline Professions (10):</b>\n${rows.join('\n')}`;
  }
  if (sub === 'set') {
    if (args.length < 3) return 'Usage: prof set <name> <level>';
    const name = String(args[1]).toLowerCase();
    const prof = PROFESSIONS.find((p) => p.id.toLowerCase() === name || p.name.toLowerCase().startsWith(name));
    if (!prof) return `Unknown profession "${args[1]}". Valid: ${PROFESSIONS.map((p) => p.id).join(', ')}`;
    const rank = Math.max(1, Math.min(100, parseInt(args[2], 10) || 1));
    const xp = xpForRank(rank);
    rec.tracks ??= {};
    if (!rec.tracks[prof.id]) rec.tracks[prof.id] = { profession: prof.id, rank: 1, xp: 0 };
    rec.tracks[prof.id].rank = rank;
    rec.tracks[prof.id].xp = xp;
    rec[prof.id] = rec.tracks[prof.id];
    saveProfRecord(null, rec);
    return `Profession ${prof.name} set to Rank ${rank} (XP: ${xp}).`;
  }
  if (sub === 'addxp') {
    if (args.length < 3) return 'Usage: prof addxp <name> <amount>';
    const name = String(args[1]).toLowerCase();
    const prof = PROFESSIONS.find((p) => p.id.toLowerCase() === name || p.name.toLowerCase().startsWith(name));
    if (!prof) return `Unknown profession "${args[1]}". Valid: ${PROFESSIONS.map((p) => p.id).join(', ')}`;
    const add = parseInt(args[2], 10) || 0;
    rec.tracks ??= {};
    if (!rec.tracks[prof.id]) rec.tracks[prof.id] = { profession: prof.id, rank: 1, xp: 0 };
    rec.tracks[prof.id].xp = Math.max(0, (rec.tracks[prof.id].xp ?? 0) + add);
    rec.tracks[prof.id].rank = rankOfXp(rec.tracks[prof.id].xp);
    rec[prof.id] = rec.tracks[prof.id];
    saveProfRecord(null, rec);
    return `Added ${add} XP to ${prof.name}. New Rank: ${rec.tracks[prof.id].rank} (Total XP: ${rec.tracks[prof.id].xp}).`;
  }
  return 'Usage: prof <list | set <name> <level> | addxp <name> <amount>>';
}
registerCommand('prof', 'Manage offline crafting and gathering professions: prof <list|set|addxp>', 'prof <list|set <name> <level>|addxp <name> <amount>>', handleProfCommand);
registerCommand('profession', 'Manage offline professions: profession <list|set|addxp>', 'profession <subcommand>', handleProfCommand);

registerCommand(
  'addmats',
  'Add crafting resources to offline Materials Bag: addmats [ore|ingot|herb|leather|wood|all] [count]',
  'addmats [ore|ingot|herb|leather|wood|all] [count]',
  (args = []) => {
    const cat = String(args[0] || 'all').toLowerCase();
    const count = args[1] ? Math.max(1, parseInt(args[1], 10) || 1) : 5;
    const ORES = ['metal:iron', 'metal:copper', 'metal:silver', 'metal:gold', 'ore:moonstone'];
    const INGOTS = ['ingot:iron', 'ingot:steel', 'ingot:silver', 'ingot:moonstone'];
    const HERBS = ['p1:19', 'p1:20', 'p1:17', 'p1:10'];
    const LEATHER = ['hide:rat', 'hide:bat', 'hide:bear', 'leather:cured', 'leather:hardened'];
    const WOOD = ['log:pine', 'log:oak', 'plank:pine', 'plank:oak'];

    let keys = [];
    if (cat === 'ore' || cat === 'ores') keys = ORES;
    else if (cat === 'ingot' || cat === 'ingots') keys = INGOTS;
    else if (cat === 'herb' || cat === 'herbs') keys = HERBS;
    else if (cat === 'leather' || cat === 'hides') keys = LEATHER;
    else if (cat === 'wood' || cat === 'logs' || cat === 'planks') keys = WOOD;
    else if (cat === 'all') keys = [...ORES, ...INGOTS, ...HERBS, ...LEATHER, ...WOOD];
    else keys = [cat];

    if (!Array.isArray(playerEntity.items)) playerEntity.items = [];
    if (!hasBag(playerEntity.items)) {
      const bagItem = mintCondition(
        setItemFields({
          group: 'UselessItems2',
          templateIndex: BAG_TEMPLATE,
          material: 0,
          flags: 0,
          variant: 0,
          message: 0,
          stackCount: 1,
        })
      );
      playerEntity.items.push(bagItem);
    }

    let bagAdded = 0;
    let packAdded = 0;
    for (const k of keys) {
      const res = giveCarried(playerEntity, k, count);
      bagAdded += (res?.bag ?? 0);
      packAdded += (res?.pack ?? 0) + (res?.over ?? 0);
    }
    return `Added ${bagAdded} items to Materials Bag${packAdded ? ` (${packAdded} to pack)` : ''} for: ${keys.join(', ')}.`;
  }
);

registerCommand(
  'bank',
  'Unified Bank and regional accounts inspection: bank <status|deposit|withdraw|clearloans|setloan>',
  'bank <status|deposit <n>|withdraw <n>|clearloans|setloan <n>>',
  (args = []) => {
    const sub = String(args[0] || 'status').toLowerCase();
    const isUnified = isUnifiedBankActive();
    if (!playerEntity.bankAccounts) {
      playerEntity.bankAccounts = [{ regionIndex: 0, accountGold: 0, loanTotal: 0, loanDueDate: 0, hasDefaulted: false }];
    }
    const acc = playerEntity.bankAccounts[0];
    const bankPlayer = {
      gold: () => playerEntity.goldPieces ?? 0,
      deductGold: (n) => { playerEntity.goldPieces = Math.max(0, (playerEntity.goldPieces ?? 0) - n); },
      addGold: (n) => { playerEntity.goldPieces = (playerEntity.goldPieces ?? 0) + n; },
      carriedWeightKg: () => 0,
      maxEncumbranceKg: () => 999999,
    };
    if (sub === 'status') {
      return [
        `<b>Bank Status:</b>`,
        `Mode: ${isUnified ? 'Unified Imperial Bank (All Regions)' : 'Classic Regional Banks'}`,
        `Wallet Gold: ${playerEntity.goldPieces ?? 0}`,
        `Bank Account Balance: ${acc.accountGold ?? 0} gold`,
        `Active Loan: ${acc.loanTotal ?? 0} gold`,
        `Defaulted: ${acc.hasDefaulted ? 'YES' : 'NO'}`,
      ].join('\n');
    }
    if (sub === 'deposit') {
      const amount = parseInt(args[1], 10);
      if (Number.isNaN(amount) || amount <= 0) return 'Usage: bank deposit <amount>';
      depositGold(playerEntity.bankAccounts, 0, amount, bankPlayer, { online: isUnified });
      surfacePlayer?.();
      return `Deposited ${amount} gold. Bank balance: ${acc.accountGold}, Wallet: ${playerEntity.goldPieces}.`;
    }
    if (sub === 'withdraw') {
      const amount = parseInt(args[1], 10);
      if (Number.isNaN(amount) || amount <= 0) return 'Usage: bank withdraw <amount>';
      withdrawGold(playerEntity.bankAccounts, 0, amount, bankPlayer, { online: isUnified });
      surfacePlayer?.();
      return `Withdrew ${amount} gold. Bank balance: ${acc.accountGold}, Wallet: ${playerEntity.goldPieces}.`;
    }
    if (sub === 'clearloans') {
      for (const a of (playerEntity.bankAccounts || [])) {
        if (a) {
          a.loanTotal = 0;
          a.loanDueDate = 0;
          a.hasDefaulted = false;
        }
      }
      return 'All bank loans and default records cleared.';
    }
    if (sub === 'setloan') {
      const amount = parseInt(args[1], 10);
      if (Number.isNaN(amount) || amount <= 0) return 'Usage: bank setloan <amount>';
      acc.loanTotal = amount;
      acc.hasDefaulted = false;
      return `Loan of ${amount} gold recorded on account.`;
    }
    return 'Usage: bank <status | deposit <n> | withdraw <n> | clearloans | setloan <n>>';
  }
);

registerCommand(
  'dumplog',
  'Dump diagnostic session telemetry log to disk: dumplog [reason]',
  'dumplog [reason]',
  (args = []) => {
    const reason = args.join(' ') || 'console-dumplog';
    const payload = dumpSessionLog(reason);
    return `Session diagnostic log dumped (Reason: "${reason}", Errors: ${payload.runtimeIssues?.errorCount ?? 0}, Warnings: ${payload.runtimeIssues?.warningCount ?? 0}).`;
  }
);

registerCommand(
  'city247',
  'Toggle 24/7 city infrastructure (shops, gates, banks, guilds open 24/7): city247 [on|off|toggle]',
  'city247 [on|off|toggle]',
  (args = []) => {
    const raw = args[0] ? String(args[0]).toLowerCase() : 'toggle';
    let next;
    if (raw === 'on' || raw === 'true' || raw === '1') next = true;
    else if (raw === 'off' || raw === 'false' || raw === '0') next = false;
    else next = !getPref('city247');
    setPref('city247', next);
    return `24/7 City Infrastructure: ${next ? 'ON (all shops, guilds, gates open 24/7)' : 'OFF (classic opening hours apply)'}`;
  }
);

const defaultRegion = () => _sceneContext?.getRegionIndex?.() ?? (playerEntity.currentRegionIndex ?? 17);

function handleBountyCommand(args = []) {
  const sub = String(args[0] || 'get').toLowerCase();
  const curReg = defaultRegion();
  const reg = args[2] ? parseInt(args[2], 10) : (args[1] && sub === 'get' ? parseInt(args[1], 10) : curReg);
  const regName = REGION_NAMES[reg] ?? `Region ${reg}`;
  playerEntity.regionalBounties = playerEntity.regionalBounties || {};
  const currentBounty = playerEntity.regionalBounties[reg] ?? 0;

  if (sub === 'get') {
    const isWanted = (playerEntity.crimeCommitted > 0) || currentBounty > 0;
    return `Wanted Bounty in ${regName} (Region ${reg}): ${currentBounty} gold [${isWanted ? 'WANTED / GUARDS PURSUE' : 'NO ACTIVE BOUNTY'}]`;
  }
  if (sub === 'set') {
    const val = parseInt(args[1], 10);
    if (Number.isNaN(val) || val < 0) return 'Usage: bounty set <goldAmount> [region]';
    playerEntity.regionalBounties[reg] = val;
    if (val > 0) {
      setCrimeCommitted(playerEntity, CRIMES.Assault);
      if (legalRepOf(playerEntity, reg) > -25) {
        changeLegalRep(playerEntity, reg, -30);
      }
      _sceneContext?.triggerCrimeResponse?.();
    } else {
      setCrimeCommitted(playerEntity, 0);
    }
    return `Wanted Bounty of ${val} gold placed on player in ${regName} (Region ${reg}). ${val > 0 ? 'Guards are on alert and pursuing!' : 'Bounty cleared.'}`;
  }
  if (sub === 'clear') {
    playerEntity.regionalBounties[reg] = 0;
    setCrimeCommitted(playerEntity, 0);
    if (legalRepOf(playerEntity, reg) < 0) {
      changeLegalRep(playerEntity, reg, -legalRepOf(playerEntity, reg) + 10);
    }
    return `Bounty cleared in ${regName} (Region ${reg}). Guards stand down.`;
  }
  return 'Usage: bounty <get [region] | set <goldAmount> [region] | clear [region]>';
}

function handleLegalRepCommand(args = []) {
  const sub = String(args[0] || 'get').toLowerCase();
  const curReg = defaultRegion();
  const reg = args[2] ? parseInt(args[2], 10) : (args[1] && sub === 'get' ? parseInt(args[1], 10) : curReg);
  const regName = REGION_NAMES[reg] ?? `Region ${reg}`;
  const curRep = legalRepOf(playerEntity, reg);

  if (sub === 'get') {
    const status = curRep < -20 ? 'CRIMINAL' : curRep < 0 ? 'SUSPECT' : curRep > 20 ? 'REVERED' : 'RESPECTABLE';
    return `Legal Reputation in ${regName} (Region ${reg}): ${curRep} [${status}]`;
  }
  if (sub === 'set') {
    const val = parseInt(args[1], 10);
    if (Number.isNaN(val)) return 'Usage: legalrep set <repValue> [region]';
    const clamped = Math.max(-100, Math.min(100, val));
    const delta = clamped - curRep;
    changeLegalRep(playerEntity, reg, delta);
    return `Legal Reputation in ${regName} (Region ${reg}) set to ${clamped}.`;
  }
  if (sub === 'clear') {
    if (curRep < 0) {
      changeLegalRep(playerEntity, reg, -curRep);
    }
    return `Legal Reputation cleared in ${regName} (Region ${reg}). Current reputation: ${legalRepOf(playerEntity, reg)}.`;
  }
  return 'Usage: legalrep <get [region] | set <repValue> [region] | clear [region]>';
}
registerCommand('bounty', 'Check or place criminal bounty / wanted status on player: bounty <get|set|clear>', 'bounty <get [reg]|set <gold> [reg]|clear [reg]>', handleBountyCommand);
registerCommand('legalrep', 'Check or set regional legal standing (-100..100): legalrep <get|set|clear>', 'legalrep <get [reg]|set <val> [reg]|clear [reg]>', handleLegalRepCommand);

let _mockFamily = null;
registerCommand(
  'dynasty',
  'Project Legacy Dynasty family model testing: dynasty <status|addchild|retire|addrenown|setmodel>',
  'dynasty <status|addchild [gender] [race]|retire|addrenown <n>|setmodel <dynasty|enduring|bloodline>>',
  (args = []) => {
    const sub = String(args[0] || 'status').toLowerCase();
    const ctx = getDebugSceneContext();
    const realFam = ctx?.getActiveFamily?.();
    const fam = realFam || _mockFamily || (_mockFamily = foundFamily(playerEntity, { id: 'dyn-test-1', seat: { region: 'Daggerfall', loc: 'Daggerfall', mapId: 5000 }, model: 'dynasty' }));
    if (sub === 'setmodel') {
      const targetModel = String(args[1] || 'dynasty').toLowerCase();
      if (!['dynasty', 'enduring', 'bloodline'].includes(targetModel)) {
        return 'Usage: dynasty setmodel <dynasty|enduring|bloodline>';
      }
      fam.model = targetModel;
      if (playerEntity) playerEntity.legacyChoice = targetModel;
      return `Family model updated to: ${targetModel.toUpperCase()}`;
    }
    if (sub === 'status') {
      const cur = currentOf(fam);
      const living = fam.people?.filter((p) => !p.died)?.length ?? 1;
      const succ = successors(fam);
      return [
        `<b>Project Legacy Family Status:</b>`,
        `Family Head: ${cur ? fullNameOf(cur.given, cur.surname) : (playerEntity.name ?? 'Hero')}`,
        `Family Model: ${(fam.model ?? 'dynasty').toUpperCase()}`,
        `Living Members: ${living}`,
        `Available Heirs: ${succ.length}`,
        `Dynasty Renown: ${fam.renown ?? 0}`,
      ].join('\n');
    }
    if (sub === 'addchild') {
      const cur = currentOf(fam);
      const childRes = addChild(fam, cur?.id ?? 1);
      const childName = childRes.person ? fullNameOf(childRes.person.given, childRes.person.surname) : 'Child';
      return `Added child to dynasty: ${childName} (ID: ${childRes.person?.id}).`;
    }
    if (sub === 'retire') {
      const cur = currentOf(fam);
      recordDeath(fam, cur?.id ?? 1, { cause: 'peaceful retirement' });
      const succ = successors(fam);
      if (succ.length > 0) {
        fam.currentId = succ[0].id;
        const heirName = succ[0] ? fullNameOf(succ[0].given, succ[0].surname) : 'Heir';
        return `Current head retired. Succession passed to heir: ${heirName}.`;
      }
      return 'Current head retired. No direct heirs available; line continues as dynasty.';
    }
    if (sub === 'addrenown') {
      const amount = parseInt(args[1], 10);
      if (Number.isNaN(amount)) return 'Usage: dynasty addrenown <amount>';
      fam.renown = (fam.renown ?? 0) + amount;
      return `Added ${amount} renown to dynasty. Total: ${fam.renown}.`;
    }
    return 'Usage: dynasty <status | addchild | retire | addrenown <n> | setmodel <dynasty|enduring|bloodline>>';
  }
);

registerCommand(
  'crisis',
  'Trigger or inspect Living Tamriel regional crisis: crisis <start|stop|status>',
  'crisis <start <war|plague|famine|civil_strife> [region]|stop [war|plague|famine|civil_strife] [region]|status [region]>',
  (args = []) => {
    const sub = String(args[0] || 'status').toLowerCase();
    const reg = args[2] ? parseInt(args[2], 10) : (args[1] && !Number.isNaN(parseInt(args[1], 10)) ? parseInt(args[1], 10) : 17);
    if (sub === 'status') {
      const st = getRegionState(reg);
      const active = getActiveCrises(reg);
      if (active.length === 0) {
        return `Region ${reg} (${st.regionName}): At Peace.`;
      }
      return [
        `<b>Region ${reg} (${st.regionName}) Active Crises (${active.length}):</b>`,
        ...active.map((c) => `- ${c.type} (Phase: ${c.phase}, Days remaining: ${c.phaseDaysRemaining})`),
      ].join('\n');
    }
    if (sub === 'start') {
      const type = String(args[1] || 'war').toLowerCase();
      const validTypes = {
        'war': CRISIS_TYPE.WAR,
        'plague': CRISIS_TYPE.PLAGUE,
        'famine': CRISIS_TYPE.FAMINE,
        'strife': CRISIS_TYPE.CIVIL_STRIFE,
        'civil_strife': CRISIS_TYPE.CIVIL_STRIFE,
      };
      const crisisType = validTypes[type];
      if (!crisisType) return `Unknown crisis type "${args[1]}". Valid: war, plague, famine, civil_strife.`;
      const regionIndex = args[2] ? parseInt(args[2], 10) : 17;
      setRegionCrisis(regionIndex, crisisType, CRISIS_PHASE.START);
      return `Started ${crisisType} crisis in Region ${regionIndex} (Phase: ${CRISIS_PHASE.START}).`;
    }
    if (sub === 'stop') {
      const raw = args[1]?.toLowerCase();
      const validTypes = {
        'war': CRISIS_TYPE.WAR,
        'plague': CRISIS_TYPE.PLAGUE,
        'famine': CRISIS_TYPE.FAMINE,
        'strife': CRISIS_TYPE.CIVIL_STRIFE,
        'civil_strife': CRISIS_TYPE.CIVIL_STRIFE,
      };
      if (validTypes[raw]) {
        const regionIndex = args[2] ? parseInt(args[2], 10) : 17;
        setRegionCrisis(regionIndex, validTypes[raw], CRISIS_PHASE.NONE);
        return `Stopped ${validTypes[raw]} crisis in Region ${regionIndex}.`;
      }
      const regionIndex = args[1] ? parseInt(args[1], 10) : 17;
      setRegionCrisis(regionIndex, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
      return `Stopped all crises in Region ${regionIndex}. Peace restored.`;
    }
    return 'Usage: crisis <start <war|plague|famine|civil_strife> [region] | stop [type] [region] | status [region]>';
  }
);

registerCommand(
  'necro',
  'Necromancy testing suite: necro <status|lich|ancient_lich|taint|spawn|minions|ambush>',
  'necro <status | lich [on|off] | ancient_lich [on|off] | taint [add <n>|set <n>] | spawn corpse | minions [list|clear|raise <type>] | ambush>',
  (args = []) => {
    const sub = String(args[0] || 'status').toLowerCase();
    if (sub === 'status') {
      const lich = isLich(playerEntity);
      const ancientLich = isAncientLich(playerEntity);
      const disguised = isPlayerDisguised(playerEntity);
      const taint = getPlayerTaint(playerEntity);
      const tradeTaint = getEffectiveTradeTaint(playerEntity);
      const tier = getTaintTier(playerEntity);
      const used = usedUndeadPoints();
      const max = calculateUndeadCapacity(playerEntity);
      const minions = allSpawnedMinions();
      const controlledCount = minions.filter((m) => m.controlled).length;
      const raisedCount = minions.filter((m) => !m.controlled).length;
      const lichStatus = ancientLich ? 'ACTIVE (Ancient Lich)' : lich ? 'ACTIVE (Immortal Undead)' : 'Inactive (Mortal)';
      return [
        `<b>Necromancy Occult Status:</b>`,
        `- Lichdom: ${lichStatus}`,
        `- Mortal Disguise: ${disguised ? 'ACTIVE (Lich hidden, Trade Taint = 0)' : 'Inactive'}`,
        `- Soul Taint: ${taint}/100 (${tier.toUpperCase()}) | Effective Trade Taint: ${tradeTaint}/100`,
        `- Undead Command Capacity: ${used}/${max} points`,
        `- Active Minions: ${minions.length} (Summoned: ${raisedCount}, Controlled via spell: ${controlledCount})`,
      ].join('\n');
    }
    if (sub === 'disguise') {
      const mode = String(args[1] || 'toggle').toLowerCase();
      playerEntity.activeEffects = Array.isArray(playerEntity.activeEffects) ? playerEntity.activeEffects : [];
      const existing = playerEntity.activeEffects.find((a) => a && !a.ended && a.kind === 'disguise');
      if (mode === 'off' || (mode === 'toggle' && existing)) {
        for (const a of playerEntity.activeEffects) {
          if (a && a.kind === 'disguise') a.ended = true;
        }
        playerEntity.activeEffects = playerEntity.activeEffects.filter((a) => a && !a.ended);
        playerEntity.isDisguised = false;
        lichdomMagicRound(playerEntity);
        surfacePlayer?.();
        return 'Mortal Disguise removed. Your true undead aura and Necro Taint are exposed.';
      }
      const rounds = Number.isFinite(Number(args[1])) ? Math.max(1, Number(args[1])) : 30;
      if (existing) {
        existing.roundsRemaining = rounds;
      } else {
        playerEntity.activeEffects.push({
          kind: 'disguise',
          key: '54,255',
          bundleName: 'Mortal Disguise',
          bundleSpellIndex: -54,
          bundleIcon: 13,
          bundleSelfCast: true,
          roundsRemaining: rounds,
          ended: false,
        });
      }
      lichdomMagicRound(playerEntity);
      surfacePlayer?.();
      return `Mortal Disguise active for ${rounds} rounds! Guards ignore Lichdom (unless minions walk openly) and Trade Taint is 0.`;
    }
    if (sub === 'lose_control' || sub === 'release_control' || sub === 'release_controlled') {
      const released = releaseAllControlledUndead();
      const remainingSummons = allSpawnedMinions().filter((m) => !m.controlled);
      if (released.length === 0) {
        return `No undead under Control Undead effect to release. (Corpse-raised summons untouched: ${remainingSummons.length}).`;
      }
      return `Lost control over ${released.length} enslaved undead (${released.map((m) => m.name).join(', ')})! They are now hostile. Corpse-raised summons untouched: ${remainingSummons.length}.`;
    }
    if (sub === 'control') {
      const type = String(args[1] || 'skeleton').toLowerCase();
      const rounds = Number.isFinite(Number(args[2])) ? Math.max(1, Number(args[2])) : 15;
      const playerPos = _sceneContext?.getPlayerPos?.();
      const pos = playerPos ? [playerPos[0], playerPos[1], playerPos[2]] : [0, 0, 0];
      const res = castControlUndead(
        playerEntity,
        { type, isUndead: true, position: pos, feet: pos, name: `Controlled ${type}` },
        { magnitude: 100, duration: rounds, chance: 100 },
      );
      if (res.success && res.minion) {
        return `Enslaved ${res.minion.name} (${res.minion.type}, ID: ${res.minion.id}) via Control Undead for ${rounds} rounds (0 pool points used; current pool: ${usedUndeadPoints()}/${calculateUndeadCapacity(playerEntity)}).`;
      }
      return `Control Undead failed: ${res.reason || 'unknown'}`;
    }
    if (sub === 'lich') {
      const val = String(args[1] || 'toggle').toLowerCase();
      const currentlyLich = isLich(playerEntity);
      const currentlyAncientLich = isAncientLich(playerEntity);
      if (val === 'off' || (val === 'toggle' && (currentlyLich || currentlyAncientLich))) {
        cureLichdom(playerEntity);
        cureAncientLichdom(playerEntity);
        return 'Lichdom stripped. You have returned to mortal flesh.';
      }
      if (currentlyAncientLich) {
        cureAncientLichdom(playerEntity);
      }
      applyLichdom(playerEntity, { nowMinutes: worldMinutes() });
      return 'Lichdom transformation complete! You are now an immortal creature of darkness.';
    }
    if (sub === 'ancient_lich' || sub === 'ancientlich') {
      const val = String(args[1] || 'toggle').toLowerCase();
      const currentlyAncientLich = isAncientLich(playerEntity);
      const currentlyLich = isLich(playerEntity);
      if (val === 'off' || (val === 'toggle' && currentlyAncientLich)) {
        cureAncientLichdom(playerEntity);
        return 'Ancient Lichdom stripped. You have returned to mortal flesh.';
      }
      if (currentlyLich) {
        cureLichdom(playerEntity);
      }
      applyAncientLichdom(playerEntity, { nowMinutes: worldMinutes(), force: true });
      return 'Ancient Lichdom transformation complete! You are now an ancient immortal terror.';
    }
    if (sub === 'taint') {
      const action = String(args[1] || 'get').toLowerCase();
      if (action === 'add') {
        const amt = parseInt(args[2] || '10', 10);
        const newTaint = addNecroTaint(amt, playerEntity);
        return `Added ${amt} taint. Current Soul Taint: ${newTaint}/100 (${getTaintTier(playerEntity)}).`;
      }
      if (action === 'set') {
        const amt = parseInt(args[2] || '0', 10);
        addNecroTaint(-100, playerEntity);
        const newTaint = addNecroTaint(amt, playerEntity);
        const lichNote = (isLich(playerEntity) || isAncientLich(playerEntity))
          ? ' (Note: Lichdom active; lore permanently locks passive soul taint at 100/100 ABOMINATION unless mortal)'
          : '';
        return `Set Soul Taint to ${newTaint}/100 (${getTaintTier(playerEntity)})${lichNote}.`;
      }
      return `Current Soul Taint: ${getPlayerTaint(playerEntity)}/100 (${getTaintTier(playerEntity)}).`;
    }
    const validMinionTypes = ['skeleton', 'zombie', 'ghost', 'mummy', 'cadaver', 'flesh_colossus', 'lich', 'ancient_lich', 'ancientlich'];
    if (sub === 'spawn' || validMinionTypes.includes(sub) || sub === 'corpse') {
      let target = (sub === 'spawn' ? String(args[1] || 'skeleton') : sub).toLowerCase();
      if (target === 'ancientlich') target = 'ancient_lich';
      if (target === 'flesh_colossus') target = 'cadaver';
      if (['skeleton', 'zombie', 'ghost', 'mummy', 'cadaver', 'lich', 'ancient_lich'].includes(target)) {
        const playerPos = _sceneContext?.getPlayerPos?.();
        const pos = playerPos ? [playerPos[0], playerPos[1], playerPos[2]] : [0, 0, 0];
        const m = spawnMinion({
          type: target,
          position: pos,
          masterEntity: playerEntity,
        });
        return `Raised ${m.profile.name} (Type: ${m.type}, ID: ${m.id}) in front of player.`;
      }
      if (target === 'corpse') {
        const playerPos = _sceneContext?.getPlayerPos?.();
        const pos = playerPos ? [playerPos[0], playerPos[1], playerPos[2]] : [0, 0, 0];
        const argA = sub === 'spawn' ? args[2] : args[1];
        const argB = sub === 'spawn' ? args[3] : args[2];
        const isFirstNumeric = argA != null && /^\d+$/.test(String(argA));
        const spec = (isFirstNumeric ? 'humanoid' : String(argA || 'humanoid')).toLowerCase();
        const countRaw = isFirstNumeric ? parseInt(String(argA), 10) : (argB != null ? parseInt(String(argB), 10) : 1);
        const count = Math.max(1, Math.min(20, Number.isFinite(countRaw) ? countRaw : 1));
        let entityType = 'humanoid';
        let entityName = 'Slain Adventurer';
        let mobType = MOBILE_TYPES.Warrior; // 144

        if (spec === 'lich') {
          entityType = 'undead';
          entityName = 'Lich';
          mobType = 32;
        } else if (spec === 'ancient_lich') {
          entityType = 'undead';
          entityName = 'Ancient Lich';
          mobType = 33;
        } else if (spec === 'skeleton') {
          entityType = 'undead';
          entityName = 'Skeletal Warrior';
          mobType = 15;
        } else if (spec === 'zombie') {
          entityType = 'undead';
          entityName = 'Zombie';
          mobType = 17;
        } else if (spec === 'ghost') {
          entityType = 'undead';
          entityName = 'Ghost';
          mobType = 18;
        } else if (spec === 'mummy') {
          entityType = 'undead';
          entityName = 'Mummy';
          mobType = 19;
        } else if (spec === 'wraith') {
          entityType = 'undead';
          entityName = 'Wraith';
          mobType = 23;
        } else if (spec === 'vampire') {
          entityType = 'undead';
          entityName = 'Vampire';
          mobType = 28;
        } else if (spec === 'daedra' || spec === 'daedra_lord') {
          entityType = 'daedra';
          entityName = 'Daedra Lord';
          mobType = 31;
        } else if (spec === 'imp') {
          entityType = 'daedra';
          entityName = 'Imp';
          mobType = 1;
        } else if (spec === 'spider') {
          entityType = 'beast';
          entityName = 'Giant Spider';
          mobType = 6;
        } else if (spec === 'werewolf') {
          entityType = 'beast';
          entityName = 'Werewolf';
          mobType = 9;
        } else if (spec === 'wereboar') {
          entityType = 'beast';
          entityName = 'Wereboar';
          mobType = 14;
        } else if (spec === 'orc') {
          entityType = 'humanoid';
          entityName = 'Orc';
          mobType = 7;
        } else if (spec === 'bear') {
          entityType = 'beast';
          entityName = 'Grizzly Bear';
          mobType = 4;
        } else if (spec === 'tiger') {
          entityType = 'beast';
          entityName = 'Sabertooth Tiger';
          mobType = 5;
        } else if (spec === 'rat') {
          entityType = 'beast';
          entityName = 'Giant Rat';
          mobType = 0;
        }

        if (_sceneContext?.spawnCorpse) {
          for (let i = 0; i < count; i++) {
            _sceneContext.spawnCorpse(pos, mobType, i);
          }
          return `Spawned ${count}x physical ${entityName} corpse(s) (MobileType: ${mobType}) in front of player. Ready for harvesting or reanimation.`;
        }

        const ids = [];
        for (let i = 0; i < count; i++) {
          const offsetPos = [pos[0] + (i % 3) * 0.6, pos[1], pos[2] + Math.floor(i / 3) * 0.6];
          const rec = registerCorpse({
            entityType,
            mobileType: mobType,
            entityName,
            position: offsetPos,
            sceneKey: 'current_scene',
            worldTimeMinutes: worldMinutes(),
          });
          if (rec) ids.push(rec.id);
        }
        return `Spawned ${count}x physical ${entityName} corpse(s) (IDs: ${ids.join(', ')}, MobileType: ${mobType}) in front of player. Ready for harvesting or reanimation.`;
      }
      return 'Usage: necro spawn <skeleton | zombie | ghost | mummy | cadaver | lich | ancient_lich | corpse [mob] [count]>';
    }
    if (sub === 'menu') {
      _sceneContext?.openUndeadCommandMenu?.();
      return 'Opened Undead Command Menu.';
    }
    if (sub === 'cmd') {
      const order = String(args[1] || 'follow').toLowerCase();
      const ok = _sceneContext?.applyUndeadCommand?.(order);
      return ok ? `Issued undead command: ${order}` : `Failed to issue command "${order}".`;
    }
    if (sub === 'minions') {
      const action = String(args[1] || 'list').toLowerCase();
      if (['follow', 'guard', 'attack', 'feign_death', 'recall'].includes(action)) {
        const ok = _sceneContext?.applyUndeadCommand?.(action);
        return ok ? `Updated undead stance: ${action}` : `Failed to issue stance "${action}".`;
      }
      if (action === 'clear' || action === 'dismiss') {
        _sceneContext?.applyUndeadCommand?.('dismiss');
        clearUndeadPool();
        for (const m of allSpawnedMinions()) {
          m.dead = true;
        }
        return 'All undead minions dismissed and destroyed.';
      }
      if (action === 'raise') {
        const type = String(args[2] || 'skeleton').toLowerCase();
        const playerPos = _sceneContext?.getPlayerPos?.();
        const pos = playerPos ? [playerPos[0], playerPos[1], playerPos[2]] : [0, 0, 0];
        const m = spawnMinion({
          type,
          position: pos,
          masterEntity: playerEntity,
        });
        return `Raised ${m.profile.name} (Type: ${m.type}, ID: ${m.id}) in front of player.`;
      }
      const list = allSpawnedMinions();
      if (list.length === 0) return 'No active undead minions.';
      return [
        `<b>Active Undead Minions (${list.length}):</b>`,
        ...list.map((m) => `- ${m.name} (${m.type}) [${m.controlled ? `CONTROLLED: ${m.roundsRemaining ?? '?'}r` : 'SUMMONED'}]: HP ${m.health}/${m.maxHealth}, Stance: ${m.stance === 'feign_death' ? 'Feigning Death' : m.stance}`),
      ].join('\n');
    }
    if (sub === 'ambush') {
      const party = generatePurifierParty(getTaintTier(playerEntity) || 'tainted');
      _sceneContext?.spawnPurifiers?.(party);
      return `Triggered Witch-Hunter ambush! Purifier squad formed in 3D world: ${party.map((p) => p.name).join(', ')}.`;
    }
    if (sub === 'harvest') {
      const ok = _sceneContext?.applyUndeadCommand?.('harvest');
      return ok ? 'Harvested reagents from nearby corpse.' : 'Failed to harvest (ensure a corpse is nearby and you carry a Skinning Knife or Dagger).';
    }
    if (sub === 'detonate') {
      const ok = _sceneContext?.applyUndeadCommand?.('detonate');
      return ok ? 'Detonated nearest undead minion!' : 'No active undead minion to detonate.';
    }
    if (sub === 'elixir') {
      return handleAddItemCommand(['elixir_unlife', '1']);
    }
    if (sub === 'test') {
      const preset = String(args[1] || 'kit').toLowerCase();
      if (preset === 'lich') {
        if (playerEntity) {
          playerEntity.NecroGrimoireRead = true;
          playerEntity.necroGrimoireRead = true;
        }
        handleLevelCommand(['20']);
        getConsoleCommand('set_skill').callback(['Mysticism', '100']);
        getConsoleCommand('set_attr').callback(['intelligence', '100']);
        getConsoleCommand('set_attr').callback(['willpower', '100']);
        handleAddItemCommand(['lich_ingredients']);
        handleAddItemCommand(['elixir_unlife', '1']);
        getConsoleCommand('addspell').callback(['all_necro']);
        return '<b>[Necro Test: Lich]</b> Set Level 20, Mysticism 100, INT/WIL 100, Grimoire Read, added 4 Elixir reagents (38, 39, 45, 53) + 1 brewed Potion of Elixir of Unlife + all Necro spells!';
      }
      if (preset === 'archlich' || preset === 'arch_lich') {
        if (playerEntity) {
          playerEntity.NecroGrimoireRead = true;
          playerEntity.necroGrimoireRead = true;
        }
        getConsoleCommand('necro').callback(['lich', 'on']);
        handleLevelCommand(['30']);
        if (!playerEntity.skills || !Array.isArray(playerEntity.skills)) {
          playerEntity.skills = new Array(35).fill(30);
        }
        playerEntity.skills[SKILLS.Mysticism] = 200;
        getConsoleCommand('set_attr').callback(['intelligence', '115']);
        getConsoleCommand('set_attr').callback(['willpower', '115']);
        handleSetMaxMagicka(['500']);
        handleHealCommand();
        getConsoleCommand('addspell').callback(['arch_lichdom']);
        return '<b>[Necro Test: Arch-Lich Ritual]</b> Player set as Lich, Level 30, Mysticism 200, INT/WIL 115, Max Magicka 500, Arch-Lichdom spell added to spellbook!';
      }
      if (preset === 'harvest') {
        handleAddItemCommand(['603', '1']);
        handleAddItemCommand(['113', '1']);
        getConsoleCommand('necro').callback(['spawn', 'corpse']);
        return '<b>[Necro Test: Harvest]</b> Added Skinning Knife (603) + Dagger (113) and spawned a fresh corpse in front of you.';
      }
      if (preset === 'synergy') {
        getConsoleCommand('addspell').callback(['all_necro']);
        getConsoleCommand('necro').callback(['minions', 'raise', 'skeleton']);
        getConsoleCommand('necro').callback(['spawn', 'corpse']);
        return '<b>[Necro Test: Synergy]</b> Added all Necro spells, raised a Skeleton minion (for Bone Armor 3x HP / Numpad 4 Detonate), and spawned a corpse (for 5x HP Corpse Explosion).';
      }
      if (preset === 'cadaver') {
        if (playerEntity) {
          playerEntity.NecroGrimoireRead = true;
          playerEntity.necroGrimoireRead = true;
        }
        handleLevelCommand(['20']);
        getConsoleCommand('set_skill').callback(['Mysticism', '100']);
        getConsoleCommand('set_attr').callback(['intelligence', '100']);
        getConsoleCommand('set_attr').callback(['willpower', '100']);
        handleHealCommand();
        getConsoleCommand('addspell').callback(['suture_cadaver']);
        getConsoleCommand('necro').callback(['spawn', 'corpse', '5']);
        return '<b>[Necro Test: Suture Cadaver]</b> Level 20, Mysticism 100, INT/WIL 100 (11 control slots), Suture Cadaver spell added, and 5 corpses spawned in front of you!';
      }
      // default 'kit'
      if (playerEntity) {
        playerEntity.NecroGrimoireRead = true;
        playerEntity.necroGrimoireRead = true;
      }
      handleLevelCommand(['20']);
      getConsoleCommand('set_skill').callback(['Mysticism', '100']);
      getConsoleCommand('set_skill').callback(['Destruction', '100']);
      getConsoleCommand('set_attr').callback(['intelligence', '100']);
      getConsoleCommand('set_attr').callback(['willpower', '100']);
      handleHealCommand();
      handleAddItemCommand(['603', '1']);
      handleAddItemCommand(['lich_ingredients']);
      handleAddItemCommand(['elixir_unlife', '1']);
      getConsoleCommand('addspell').callback(['all_necro']);
      return '<b>[Necro Full Test Kit]</b> Level 20, Mysticism/Destruction 100, INT/WIL 100, Grimoire Read, Skinning Knife (603), Elixir of Unlife + 4 reagents, and all 4 Necromancy spells granted!';
    }
    return 'Usage: necro <status | lich [on|off] | ancient_lich [on|off] | taint [add <n>|set <n>] | spawn <type|corpse> | minions [list|clear|raise <type>] | harvest | detonate | elixir | test [kit|lich|harvest|synergy] | ambush>';
  }
);

registerCommand('necro_ancient_lich', 'Toggle Ancient Lich transformation: necro_ancient_lich [on|off]', 'necro_ancient_lich [on|off]', (args = []) => getConsoleCommand('necro').callback(['ancient_lich', ...args]));
registerCommand('ancient_lich', 'Toggle Ancient Lich transformation: ancient_lich [on|off]', 'ancient_lich [on|off]', (args = []) => getConsoleCommand('necro').callback(['ancient_lich', ...args]));
registerCommand('ancientlich', 'Toggle Ancient Lich transformation: ancientlich [on|off]', 'ancientlich [on|off]', (args = []) => getConsoleCommand('necro').callback(['ancient_lich', ...args]));
registerCommand('necro_lich', 'Toggle Lich transformation: necro_lich [on|off]', 'necro_lich [on|off]', (args = []) => getConsoleCommand('necro').callback(['lich', ...args]));
registerCommand('lich', 'Toggle Lich transformation: lich [on|off]', 'lich [on|off]', (args = []) => getConsoleCommand('necro').callback(['lich', ...args]));

registerCommand('necro_spawn', 'Spawn minion or corpse: necro_spawn <skeleton|zombie|ghost|mummy|lich|ancient_lich|corpse>', 'necro_spawn <type>', (args = []) => getConsoleCommand('necro').callback(['spawn', ...args]));
registerCommand('necro_corpse', 'Spawn a corpse in front of player: necro_corpse [mob]', 'necro_corpse [mob]', (args = []) => getConsoleCommand('necro').callback(['spawn', 'corpse', ...args]));
registerCommand('necro_menu', 'Open Undead Command Menu', 'necro_menu', () => getConsoleCommand('necro').callback(['menu']));
registerCommand('necro_lose_control', 'Lose control over all undead enslaved via Control Undead spell (leaves raised summons intact)', 'necro_lose_control', () => getConsoleCommand('necro').callback(['lose_control']));
registerCommand('lose_control', 'Lose control over all undead enslaved via Control Undead spell (leaves raised summons intact)', 'lose_control', () => getConsoleCommand('necro').callback(['lose_control']));
registerCommand('release_control', 'Lose control over all undead enslaved via Control Undead spell (leaves raised summons intact)', 'release_control', () => getConsoleCommand('necro').callback(['lose_control']));
registerCommand('necro_disguise', 'Toggle Mortal Disguise spell effect on player: necro_disguise [on|off|rounds]', 'necro_disguise [on|off|rounds]', (args = []) => getConsoleCommand('necro').callback(['disguise', ...args]));
registerCommand('necro_spells', 'Add all necromancy spells to spellbook', 'necro_spells', () => getConsoleCommand('addspell').callback(['all_necro']));
registerCommand('necrospells', 'Add all necromancy spells to spellbook', 'necrospells', () => getConsoleCommand('addspell').callback(['all_necro']));

registerCommand('give_dagger', 'Add a Dagger (113) and Skinning Knife (603) to inventory', 'give_dagger', () => {
  handleAddItemCommand(['113', '1']);
  handleAddItemCommand(['603', '1']);
  return 'Added Dagger (113) and Skinning Knife (603) to inventory.';
});
registerCommand('givedagger', 'Add a Dagger (113) and Skinning Knife (603) to inventory', 'givedagger', () => getConsoleCommand('give_dagger').callback([]));

registerCommand('give_knife', 'Add a Skinning Knife (603) to inventory', 'give_knife', () => {
  handleAddItemCommand(['603', '1']);
  return 'Added Skinning Knife (603) to inventory.';
});
registerCommand('giveknife', 'Add a Skinning Knife (603) to inventory', 'giveknife', () => getConsoleCommand('give_knife').callback([]));

registerCommand('give_grimoire', 'Add Grimoire of the Worm (585) to inventory', 'give_grimoire', () => {
  handleAddItemCommand([String(NECRO_GRIMOIRE_TEMPLATE), '1']);
  return 'Added Grimoire of the Worm (585) to inventory.';
});
registerCommand('givegrimoire', 'Add Grimoire of the Worm (585) to inventory', 'givegrimoire', () => getConsoleCommand('give_grimoire').callback([]));

registerCommand('give_elixir', 'Add 1x Elixir of Unlife potion to inventory', 'give_elixir', () => handleAddItemCommand(['elixir_unlife', '1']));
registerCommand('giveelixir', 'Add 1x Elixir of Unlife potion to inventory', 'giveelixir', () => handleAddItemCommand(['elixir_unlife', '1']));

registerCommand('give_elixir_reagents', 'Add all reagents required to craft the Elixir of Unlife', 'give_elixir_reagents', () => handleAddItemCommand(['lich_ingredients']));
registerCommand('give_reagents', 'Add all reagents required to craft the Elixir of Unlife', 'give_reagents', () => handleAddItemCommand(['lich_ingredients']));
registerCommand('givereagents', 'Add all reagents required to craft the Elixir of Unlife', 'givereagents', () => handleAddItemCommand(['lich_ingredients']));

registerCommand('open_perks', 'Inspect Character Perks in the Growth tab', 'open_perks', () => {
  return 'Character Perks & Feats are integrated into the Growth tab of the Pause Menu (Esc -> Growth). Use "perk list" or "perk unlock <id|all>" from console.';
});
registerCommand('perks', 'Inspect or manage Character Perks', 'perks', (args = []) => {
  const sub = String(args[0] || 'list').toLowerCase();
  return getConsoleCommand('perk').callback([sub, ...args.slice(1)]);
});

/** ConsoleInputHistory (ConsoleInputHistory.cs), whole - the up/down
 *  walk with its go-to-entry bookkeeping, at ConsoleController's own
 *  capacity (`inputHistoryCapacity = 20`, :17). */
export class ConsoleInputHistory {
  constructor(maxCapacity = 20) {
    this.inputHistory = [];
    this.maxCapacity = maxCapacity;
    this.currentInput = 0;
    this.isNavigating = false;
  }

  /** Navigate (:31-51): the first up goes to the go-to entry, a second
   *  up walks ABOVE it, a down walks below - and the down arm runs
   *  even on the first navigation, which is C#'s own shape (the `if`
   *  is `else if (up)` but the down decrement is unconditional). */
  navigate(up) {
    const down = !up;
    if (!this.isNavigating) this.isNavigating = (up && this.inputHistory.length > 0) || (down && this.currentInput > 0);
    else if (up) this.currentInput++;
    if (down) this.currentInput--;
    this.currentInput = clamp(this.currentInput, 0, this.inputHistory.length - 1);
    return this.isNavigating ? this.inputHistory[this.currentInput] : '';
  }

  /** AddNewInputEntry (:53-82). */
  addNewInputEntry(input) {
    this.isNavigating = false;
    if (this.inputHistory.length > 0 && equalsIgnoreCase(input, this.inputHistory[0])) return;
    if (this.inputHistory.length === this.maxCapacity) this.inputHistory.splice(this.maxCapacity - 1, 1);
    this.inputHistory.unshift(input);
    if (this.currentInput === this.maxCapacity - 1) this.currentInput = 0;
    else this.currentInput = clamp(this.currentInput + 1, 0, this.inputHistory.length - 1);
    if (!equalsIgnoreCase(input, this.inputHistory[this.currentInput])) this.currentInput = 0;
  }

  clear() {
    this.inputHistory.length = 0;
    this.currentInput = 0;
    this.isNavigating = false;
  }
}

// Mathf.Clamp over an EMPTY history clamps to (0, -1), whose C# answer
// is the MAX - so an empty history walks to -1 and `isNavigating` is
// what keeps it from being read.
const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
const equalsIgnoreCase = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

/** The session's history - one console, one history, as
 *  ConsoleController's single instance field is. */
export const consoleInputHistory = new ConsoleInputHistory();

/** ConsoleController.ExecuteCommand (:71-81): the whole submit law -
 *  split on a space, the first token is the command and the rest are
 *  the arguments, the input is echoed with "> ", the answer is logged,
 *  and the line joins the history. Returns the answer so the port's
 *  door can hand it to a caller that is not a text window. */
export function executeConsoleLine(input) {
  const trimmed = String(input).trim();
  if (trimmed.includes(';')) {
    const segments = trimmed
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length > 1) {
      consoleLog(`> ${input}`);
      consoleInputHistory.addNewInputEntry(input);
      const results = [];
      for (const seg of segments) {
        const parts = seg.split(/\s+/);
        const rawCommand = parts[0];
        const command = !hasConsoleCommand(rawCommand) && rawCommand.startsWith('/')
          ? rawCommand.slice(1)
          : rawCommand;
        const args = parts.slice(1);
        const ans = executeConsoleCommand(command, args);
        results.push(ans);
      }
      const combined = results.join('\n');
      consoleLog(combined);
      return combined;
    }
  }
  const parts = trimmed.split(' ');
  const rawCommand = parts[0];
  const command = !hasConsoleCommand(rawCommand) && rawCommand.startsWith('/')
    ? rawCommand.slice(1)
    : rawCommand;
  const args = parts.slice(1);
  consoleLog(`> ${input}`);
  const answer = executeConsoleCommand(command, args);
  if (answer && typeof answer.then === 'function') {
    consoleInputHistory.addNewInputEntry(input);
    return answer.then((res) => {
      consoleLog(res);
      return res;
    }).catch((err) => {
      const msg = `Error: ${err?.message ?? err}`;
      consoleLog(msg);
      return msg;
    });
  }
  consoleLog(answer);
  consoleInputHistory.addNewInputEntry(input);
  return answer;
}

/** THE PORT'S DOOR (the departure above). ConsoleUI.ToggleConsole
 *  refuses to open at all when `LypyL_GameConsole` is off (:51-53), so
 *  the seam answers the same way rather than running the command. */
export function installConsoleProbe(target = globalThis) {
  if (!target) return null;
  const door = (line) =>
    getBool('Enhancements', 'LypyL_GameConsole')
      ? executeConsoleLine(line)
      : 'the developer console is disabled (Enhancements/LypyL_GameConsole)';
  target.__console = door;
  if (typeof window !== 'undefined') {
    import('../ui/debugConsole.js').then((m) => m.installDebugConsole?.()).catch(() => {});
  }
  return door;
}
