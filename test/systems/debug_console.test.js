import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  executeConsoleLine,
  executeConsoleCommand,
  hasConsoleCommand,
  getConsoleCommand,
  setDebugSceneContext,
  getDebugSceneContext,
} from '../../src/systems/consoleCommands.js';
import { staffPowers, setStaffPowers, playerEntity, playerDamageWithheld } from '../../src/characters/playerEntity.js';
import { goldPiecesOf } from '../../src/systems/inventory.js';

test('Debug Console: tgm toggles god mode and invulnerability', () => {
  setStaffPowers({ god: false });
  assert.equal(staffPowers().god, false);
  assert.equal(playerDamageWithheld(), false);

  const res1 = executeConsoleLine('tgm');
  assert.equal(res1, 'God Mode: ON');
  assert.equal(staffPowers().god, true);
  assert.equal(playerDamageWithheld(), true);

  const res2 = executeConsoleLine('tgm');
  assert.equal(res2, 'God Mode: OFF');
  assert.equal(staffPowers().god, false);
  assert.equal(playerDamageWithheld(), false);
});

test('Debug Console: addgold increases player gold', () => {
  const initialGold = goldPiecesOf(playerEntity);
  const res = executeConsoleLine('addgold 250');
  assert.ok(res.includes('Added 250 gold'));
  assert.equal(goldPiecesOf(playerEntity), initialGold + 250);

  const resInvalid = executeConsoleLine('addgold');
  assert.equal(resInvalid, 'Usage: addgold <count>');

  const resNan = executeConsoleLine('addgold notanumber');
  assert.equal(resNan, 'Usage: addgold <count>');
});

test('Debug Console: teleport moves player coordinates', () => {
  let placed = null;
  setDebugSceneContext({
    setPlayerPos: (x, y, z) => { placed = [x, y, z]; },
  });

  const res = executeConsoleLine('teleport 12.5 34.0 -56.7');
  assert.deepEqual(placed, [12.5, 34.0, -56.7]);
  assert.ok(res.includes('Teleported to 12.50, 34.00, -56.70'));

  const resMissing = executeConsoleLine('teleport 10 20');
  assert.equal(resMissing, 'Usage: teleport <x> <y> <z>');

  const resInvalid = executeConsoleLine('teleport 10 abc 30');
  assert.equal(resInvalid, 'Usage: teleport <x> <y> <z>');
});

test('Debug Console: tele2loc teleports to named location', async () => {
  let targetLoc = null;
  setDebugSceneContext({
    tele2loc: async (name) => {
      targetLoc = name;
      return `Teleported to ${name} (100, 200)`;
    },
  });

  const res = await executeConsoleLine('tele2loc Daggerfall City');
  assert.equal(targetLoc, 'Daggerfall City');
  assert.equal(res, 'Teleported to Daggerfall City (100, 200)');

  const resMissing = await executeConsoleLine('tele2loc');
  assert.equal(resMissing, 'Usage: tele2loc <locationName>');
});

test('Debug Console: /tp and tp support pixel coordinates and location names', async () => {
  let targetPixel = null;
  let targetLoc = null;
  setDebugSceneContext({
    tele2pixel: async (x, y) => {
      targetPixel = [x, y];
      return `Teleported to 171, 169 (${x}, ${y})`;
    },
    tele2loc: async (name) => {
      targetLoc = name;
      return `Teleported to ${name} (100, 200)`;
    },
  });

  // Numeric pixel teleport with /tp
  const res1 = await executeConsoleLine('/tp 171 169');
  assert.deepEqual(targetPixel, [171, 169]);
  assert.equal(res1, 'Teleported to 171, 169 (171, 169)');

  // Numeric pixel teleport without slash
  targetPixel = null;
  const res2 = await executeConsoleLine('tp 100 195');
  assert.deepEqual(targetPixel, [100, 195]);
  assert.equal(res2, 'Teleported to 171, 169 (100, 195)');

  // Named location teleport with /tp
  const res3 = await executeConsoleLine('/tp Privateer\'s Hold');
  assert.equal(targetLoc, 'Privateer\'s Hold');
  assert.equal(res3, 'Teleported to Privateer\'s Hold (100, 200)');

  // Empty usage
  const resEmpty = await executeConsoleLine('/tp');
  assert.equal(resEmpty, 'Usage: tp <x> <y> | tp <locationName>');
});

test('Debug Console: killall destroys hostile mobs', () => {
  let killed = false;
  setDebugSceneContext({
    killAllFoes: () => {
      killed = true;
      return 5;
    },
  });

  const res = executeConsoleLine('killall');
  assert.equal(killed, true);
  assert.equal(res, 'Killed 5 hostile entities.');

  setDebugSceneContext({
    killAllFoes: () => 0,
  });
  const resEmpty = executeConsoleLine('killall');
  assert.equal(resEmpty, 'No hostile entities found.');
});

test('Debug Console: help lists all basic debug commands', () => {
  assert.equal(hasConsoleCommand('tgm'), true);
  assert.equal(hasConsoleCommand('killall'), true);
  assert.equal(hasConsoleCommand('addgold'), true);
  assert.equal(hasConsoleCommand('teleport'), true);
  assert.equal(hasConsoleCommand('tele2loc'), true);
  assert.equal(hasConsoleCommand('help'), true);

  const helpList = executeConsoleLine('help');
  assert.ok(helpList.includes('tgm'));
  assert.ok(helpList.includes('killall'));
  assert.ok(helpList.includes('addgold'));
  assert.ok(helpList.includes('teleport'));
  assert.ok(helpList.includes('tele2loc'));
  assert.ok(helpList.includes('HELP'));

  const tgmDetail = executeConsoleLine('help tgm');
  assert.ok(tgmDetail.includes('Toggle God Mode'));
});

test('Debug Console: suicide/kill forces player death', () => {
  playerEntity.health = 50;
  setStaffPowers({ god: true });

  const res = executeConsoleLine('kill');
  assert.equal(res, 'Player killed.');
  assert.equal(playerEntity.health, 0);
  assert.equal(staffPowers().god, false);

  const resSuicide = executeConsoleLine('suicide');
  assert.equal(resSuicide, 'Player is already dead.');

  playerEntity.health = 50;
  const resKillme = executeConsoleLine('killme');
  assert.equal(resKillme, 'Player killed.');
  assert.equal(playerEntity.health, 0);
});

test('Debug Console: spawnfoe / spawn creates mobs by ID or name', async () => {
  let spawnedMob = null;
  let spawnedCount = 0;
  setDebugSceneContext({
    spawnFoe: async (mobileType, count) => {
      spawnedMob = mobileType;
      spawnedCount = count;
      return count;
    },
  });

  // By ID
  const resId = await executeConsoleLine('spawnfoe 15');
  assert.equal(spawnedMob, 15);
  assert.equal(spawnedCount, 1);
  assert.ok(resId.includes('SkeletalWarrior (ID: 15)'));

  // By name
  const resName = await executeConsoleLine('spawn rat 3');
  assert.equal(spawnedMob, 0);
  assert.equal(spawnedCount, 3);
  assert.ok(resName.includes('3x Rat (ID: 0)'));

  // By alias
  const resAlias = await executeConsoleLine('spawn skeleton');
  assert.equal(spawnedMob, 15);
  assert.ok(resAlias.includes('SkeletalWarrior'));

  // Invalid mob
  const resInvalid = await executeConsoleLine('spawn unknown_creature');
  assert.ok(resInvalid.includes('Unknown mob'));

  // Missing args
  const resMissing = await executeConsoleLine('spawnfoe');
  assert.equal(resMissing, 'Usage: spawnfoe <id|name> [count]');

  // spawnlist
  const resList = executeConsoleLine('spawnlist');
  assert.ok(resList.includes('Monsters (0..42):'));
  assert.ok(resList.includes('SkeletalWarrior'));
  assert.ok(resList.includes('Classes (128..146):'));
});

test('Debug Console UI: toggle and state API', async () => {
  const { isDebugConsoleOpen, toggleDebugConsole, openDebugConsole, closeDebugConsole, submitConsoleInput } = await import('../../src/ui/debugConsole.js');
  assert.equal(typeof isDebugConsoleOpen, 'function');
  assert.equal(typeof toggleDebugConsole, 'function');
  assert.equal(typeof openDebugConsole, 'function');
  assert.equal(typeof closeDebugConsole, 'function');
  assert.equal(typeof submitConsoleInput, 'function');
  assert.equal(isDebugConsoleOpen(), false);
});

test('Debug Console: tcl / noclip toggles collision and flight', () => {
  const { staffNoclip } = playerEntity;
  setStaffPowers({ noclip: false, fly: false });
  assert.equal(staffPowers().noclip, false);

  const res1 = executeConsoleLine('tcl');
  assert.equal(res1, 'Collision: OFF (Noclip ON)');
  assert.equal(staffPowers().noclip, true);
  assert.equal(staffPowers().fly, true);

  const res2 = executeConsoleLine('noclip');
  assert.equal(res2, 'Collision: ON');
  assert.equal(staffPowers().noclip, false);
});

test('Debug Console: set_time / time modifies in-game clock', async () => {
  const { worldMinutes } = await import('../../src/systems/worldTick.js');
  const res = executeConsoleLine('set_time 14 30');
  assert.ok(res.includes('Time set to 14:30'));
  const current = worldMinutes();
  assert.equal(Math.floor(current % 1440), 14 * 60 + 30);

  const resAlias = executeConsoleLine('time 8 15');
  assert.ok(resAlias.includes('Time set to 08:15'));

  const resInvalid = executeConsoleLine('time 99 99');
  assert.ok(resInvalid.includes('Invalid time'));
});

test('Debug Console: set_weather / weather changes current weather', async () => {
  const { currentWeather } = await import('../../src/systems/weather/weatherSim.js');
  const resRain = executeConsoleLine('set_weather rain');
  assert.equal(resRain, 'Weather set to Rain.');
  assert.equal(currentWeather().toLowerCase(), 'rain');

  const resSnow = executeConsoleLine('weather 6');
  assert.equal(resSnow, 'Weather set to Snow.');
  assert.equal(currentWeather().toLowerCase(), 'snow');

  const resInvalid = executeConsoleLine('weather alien_storm');
  assert.ok(resInvalid.includes('Unknown weather'));
});

test('Debug Console: heal / player_heal restores player vitals', () => {
  playerEntity.maxHealth = 100;
  playerEntity.health = 20;
  playerEntity.stats = { strength: 60, endurance: 60, intelligence: 50 };
  playerEntity.fatigue = 500;

  const res = executeConsoleLine('heal');
  assert.ok(res.includes('Player fully healed'));
  assert.equal(playerEntity.health, 100);
  assert.equal(playerEntity.fatigue, (60 + 60) * 64);

  playerEntity.health = 10;
  const resAlias = executeConsoleLine('player_heal');
  assert.ok(resAlias.includes('Player fully healed'));
  assert.equal(playerEntity.health, 100);
});

test('Debug Console: additem / item spawns items into player inventory', () => {
  playerEntity.items = [];
  const resSword = executeConsoleLine('additem longsword 2');
  assert.ok(resSword.includes('Added 2x Longsword'));
  assert.equal(playerEntity.items.length, 1);
  assert.equal(playerEntity.items[0].stackCount, 2);

  const resById = executeConsoleLine('item 102 1'); // Cuirass
  assert.ok(resById.includes('Added 1x Cuirass'));
  assert.equal(playerEntity.items.length, 2);

  const resUnknown = executeConsoleLine('additem imaginary_widget_xyz');
  assert.ok(resUnknown.includes('Item template "imaginary_widget_xyz" not found.'));
});

test('Debug Console: set_attr and mod_attr alter player attributes', () => {
  playerEntity.stats = { strength: 50, agility: 50 };
  const resSet = executeConsoleLine('set_attr strength 85');
  assert.equal(resSet, 'Attribute strength set to 85.');
  assert.equal(playerEntity.stats.strength, 85);

  const resMod = executeConsoleLine('mod_attr strength -15');
  assert.equal(resMod, 'Attribute strength modified by -15 to 70.');
  assert.equal(playerEntity.stats.strength, 70);

  const resInvalid = executeConsoleLine('set_attr charisma 50');
  assert.ok(resInvalid.includes('Unknown attribute'));
});

test('Debug Console: set_skill and mod_skill alter skills', () => {
  playerEntity.skills = new Array(35).fill(30);
  const resSet = executeConsoleLine('set_skill LongBlade 95');
  assert.equal(resSet, 'Skill LongBlade set to 95.');
  assert.equal(playerEntity.skills[29], 95);

  const resMod = executeConsoleLine('mod_skill LongBlade -10');
  assert.equal(resMod, 'Skill LongBlade modified by -10 to 85.');
  assert.equal(playerEntity.skills[29], 85);

  const resUnknown = executeConsoleLine('set_skill BasketWeaving 100');
  assert.ok(resUnknown.includes('Unknown skill'));
});

test('Debug Console: set_level / level changes character level', () => {
  playerEntity.level = 1;
  const res = executeConsoleLine('set_level 12');
  assert.equal(res, 'Player level set to 12.');
  assert.equal(playerEntity.level, 12);

  const resAlias = executeConsoleLine('level 25');
  assert.equal(resAlias, 'Player level set to 25.');
  assert.equal(playerEntity.level, 25);
});

test('Debug Console: tdt toggles debug text HUD', () => {
  const res1 = executeConsoleLine('tdt');
  assert.ok(res1.includes('Debug text:'));
});

test('Debug Console: firmament / firm manages offline stars and renown', () => {
  const resStatus = executeConsoleLine('firmament status');
  assert.ok(resStatus.includes('Offline Firmament & Renown Status:'));

  const resStars = executeConsoleLine('firm addstars 5');
  assert.ok(resStars.includes('Added 5 bonus stars'));

  const resPoints = executeConsoleLine('firmament addpoints 3');
  assert.ok(resPoints.includes('Added 3 bonus craft points'));

  const resXp = executeConsoleLine('firm addxp 500');
  assert.ok(resXp.includes('Awarded 500 Renown XP'));

  const resReset = executeConsoleLine('firmament reset');
  assert.ok(resReset.includes('passive tree has been reset'));
});

test('Debug Console: housing / house manages offline player homes including Project Legacy inheritance', () => {
  executeConsoleLine('housing clear');
  const resListEmpty = executeConsoleLine('housing list');
  assert.equal(resListEmpty, 'No offline homes currently owned.');

  // Buy/claim house
  const resBuy = executeConsoleLine('housing buy 404 1234 17');
  assert.ok(resBuy.includes('Claimed offline house: MapID 1234, BuildingKey 404, Region 17'));

  // Project Legacy heir inheritance
  const resInherit = executeConsoleLine('housing inherit 9999 505 17');
  assert.ok(resInherit.includes('Project Legacy heir inherited offline house: MapID 9999, Key 505, Region 17'));

  const resList = executeConsoleLine('housing list');
  assert.ok(resList.includes('Owned Offline Homes (2)'));
  assert.ok(resList.includes('BuildingKey 404'));
  assert.ok(resList.includes('BuildingKey 505'));

  const resTp = executeConsoleLine('housing tp 404');
  assert.ok(resTp.includes('Teleported to offline home'));

  executeConsoleLine('housing clear');
});

test('Debug Console: prof / profession inspects and modifies crafting disciplines', () => {
  const resList = executeConsoleLine('prof list');
  assert.ok(resList.includes('Offline Professions (10):'));
  assert.ok(resList.includes('Mining'));
  assert.ok(resList.includes('Smithing'));

  const resSet = executeConsoleLine('prof set Mining 40');
  assert.ok(resSet.includes('Profession Mining set to Rank 40'));

  const resXp = executeConsoleLine('profession addxp Smithing 200');
  assert.ok(resXp.includes('Added 200 XP to Smithing'));
});

test('Debug Console: addmats gives materials into bag', () => {
  playerEntity.bagItems = [];
  const resOre = executeConsoleLine('addmats ore 10');
  assert.ok(resOre.includes('Added 50 material items'));

  const resAll = executeConsoleLine('addmats all 2');
  assert.ok(resAll.includes('material items'));
});

test('Debug Console: bank inspects and controls banking transactions', () => {
  playerEntity.goldPieces = 1000;
  playerEntity.bankAccounts = [{ regionIndex: 0, accountGold: 500, loanTotal: 0, loanDueDate: 0, hasDefaulted: false }];

  const resStatus = executeConsoleLine('bank status');
  assert.ok(resStatus.includes('Bank Status:'));
  assert.ok(resStatus.includes('Bank Account Balance: 500 gold'));

  const resDep = executeConsoleLine('bank deposit 300');
  assert.ok(resDep.includes('Deposited 300 gold'));
  assert.equal(playerEntity.bankAccounts[0].accountGold, 800);
  assert.equal(playerEntity.goldPieces, 700);

  const resWith = executeConsoleLine('bank withdraw 200');
  assert.ok(resWith.includes('Withdrew 200 gold'));
  assert.equal(playerEntity.bankAccounts[0].accountGold, 600);
  assert.equal(playerEntity.goldPieces, 900);

  const resLoan = executeConsoleLine('bank setloan 5000');
  assert.ok(resLoan.includes('Loan of 5000 gold'));
  assert.equal(playerEntity.bankAccounts[0].loanTotal, 5000);

  const resClear = executeConsoleLine('bank clearloans');
  assert.ok(resClear.includes('cleared'));
  assert.equal(playerEntity.bankAccounts[0].loanTotal, 0);
});

test('Debug Console: city247 toggles 24/7 city infrastructure', () => {
  const resOn = executeConsoleLine('city247 on');
  assert.ok(resOn.includes('24/7 City Infrastructure: ON'));

  const resOff = executeConsoleLine('city247 off');
  assert.ok(resOff.includes('24/7 City Infrastructure: OFF'));

  const resToggle = executeConsoleLine('city247');
  assert.ok(resToggle.includes('24/7 City Infrastructure: ON'));
});

test('Debug Console: bounty / legalrep inspects and modifies legal status', () => {
  playerEntity.legalRep = { 17: 0 };
  const resGet1 = executeConsoleLine('bounty get 17');
  assert.ok(resGet1.includes('IN GOOD STANDING'));

  const resSet = executeConsoleLine('bounty set -50 17');
  assert.ok(resSet.includes('Legal Reputation in Region 17 set to -50'));

  const resGet2 = executeConsoleLine('bounty get 17');
  assert.ok(resGet2.includes('CRIMINAL (Guards pursue)'));

  const resClear = executeConsoleLine('bounty clear 17');
  assert.ok(resClear.includes('Bounty cleared'));
});

test('Debug Console: dynasty family model commands', () => {
  playerEntity.name = 'Tiber Septim';
  const resStatus = executeConsoleLine('dynasty status');
  assert.ok(resStatus.includes('Project Legacy Dynasty Status:'));

  const resChild = executeConsoleLine('dynasty addchild');
  assert.ok(resChild.includes('Added child to dynasty:'));

  const resRenown = executeConsoleLine('dynasty addrenown 150');
  assert.ok(resRenown.includes('Added 150 renown'));

  const resRetire = executeConsoleLine('dynasty retire');
  assert.ok(resRetire.includes('Current head retired. Succession passed to heir:'));
});

test('Debug Console: crisis commands control regional crises', () => {
  const resStart = executeConsoleLine('crisis start plague 17');
  assert.ok(resStart.toUpperCase().includes('STARTED PLAGUE CRISIS IN REGION 17'));

  const resStatus = executeConsoleLine('crisis status 17');
  assert.ok(resStatus.toUpperCase().includes('REGION 17 CRISIS: PLAGUE'));

  const resStop = executeConsoleLine('crisis stop 17');
  assert.ok(resStop.includes('Stopped crisis in Region 17. Peace restored.'));
});

