import '../modsOff.js';
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { itemFindings } from '../../src/systems/item/itemLaw.js';
import { AETHERIC_RECORDS, mintAetheric } from '../../src/systems/aetheric.js';
import { GILDED_RECORDS, mintGilded } from '../../src/systems/gilded.js';
import { mintResonantMaul, RESONANT_MAUL } from '../../src/systems/pass/resonantMaul.js';
import { EG_LORD_ARMS, egLordArm } from '../../src/systems/eliteGates/egLordArms.js';
import { BOSS_CARDS, BOSS_CARD_IDS } from '../../src/systems/bossCards.js';
import { mintIliacCard } from '../../src/systems/iliac/iliacItems.js';
import { sigilStone, isSigilStone } from '../../src/systems/gate/gateSpoils.js';
import { starglass, isStarglass } from '../../src/systems/starfall/starglass.js';
import { createPellets, PELLET_TEMPLATE } from '../../src/systems/thunderlock.js';
import { setPref, _resetForTests as resetPrefs } from '../../src/systems/uiPrefs.js';
import {
  sigilOnline,
  sigilActive,
  sigilOfflineAwake,
  sigilRenown,
  setSigilOnline,
  setSigilOfflineAwake,
  setSigilOfflineRenown,
  renownOpens,
  sigilBlow,
  _resetSigilForTests,
} from '../../src/systems/sigil/sigil.js';
import {
  setsAwake,
  drinkWorn,
  _resetSigilSetsForTests,
} from '../../src/systems/sigil/sigilSets.js';
import { awakeTiersOf, _resetSetPowersForTests } from '../../src/systems/sigil/sigilSetPowers.js';
import { renownLootQuarters } from '../../src/systems/renownLoot.js';
import { stampWonWeapons } from '../../src/systems/loot/lootRarity.js';
import { createWeapon } from '../../src/combat/enemyEquipment.js';
import { mintCondition, setItemFields } from '../../src/systems/item/itemTemplates.js';
import { applyRarity } from '../../src/systems/loot/lootRarity.js';
import { equipItem } from '../../src/systems/equip.js';
import {
  offlinePanoplyRows,
  buyOfflinePanoply,
  exchangeStarglassForEmbers,
  exchangeStarglassForWitchPiece,
  exchangeAethericForEmbers,
  exchangeEmberForPellets,
  _resetOfflineBrokerForTests,
} from '../../src/systems/sigil/offlineBroker.js';
import { capFoeLoot } from '../../src/systems/foeLootCap.js';
import { breachBookFor, breachBookGiven, _resetBreachBookForTests } from '../../src/systems/breachBook.js';
import {
  rollOfflinePreApotheosisSpoils,
  mintOfflineGun,
  DUNGEON_AETHERIC_SETS,
} from '../../src/systems/offlineRelicLoot.js';
import { DUNGEON_TYPES } from '../../src/formats/mapsFile.js';
import {
  codexRows,
  codexSets,
  codexGilded,
  foundDay,
  GILDED_HINT,
  _resetCodexForTests,
} from '../../src/systems/loot/lootCodex.js';
import { parseStringTableCsv } from '../../src/systems/textManager.js';
import {
  initOfflineRenown,
  setOfflineRenownLevel,
  onOfflineFoeKilled,
  onOfflineQuestEnded,
  _resetOfflineFirmamentForTests,
} from '../../src/systems/offlineFirmament.js';
import { executeConsoleCommand } from '../../src/systems/consoleCommands.js';
import { playerEntity } from '../../src/characters/playerEntity.js';

const lcg = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed >>> 8) / 0x800000;
};

let savedPlayerSnapshot = null;

function makeTestPlayer() {
  return {
    isPlayer: true,
    name: 'TestHero',
    level: 16,
    gender: 0,
    stats: { strength: 60, intelligence: 60, willpower: 60, agility: 60, endurance: 60, personality: 50, speed: 60, luck: 55 },
    items: [],
    health: 150,
    maxHealth: 150,
    characterId: 'test_offline_relic_hero',
  };
}

beforeEach(() => {
  resetPrefs();
  setPref('lootRarity', true);
  _resetSigilForTests();
  _resetSigilSetsForTests();
  _resetSetPowersForTests();
  _resetOfflineBrokerForTests();
  _resetBreachBookForTests();
  _resetCodexForTests();
  _resetOfflineFirmamentForTests();
  if (playerEntity) {
    savedPlayerSnapshot = {
      items: [...(playerEntity.items ?? [])],
      hasEquip: 'equip' in playerEntity,
      equip: playerEntity.equip,
      level: playerEntity.level,
      characterId: playerEntity.characterId,
    };
    playerEntity.items = [];
    delete playerEntity.equip;
    playerEntity.level = 16;
  }
});

afterEach(() => {
  _resetSigilForTests();
  _resetSigilSetsForTests();
  _resetSetPowersForTests();
  _resetOfflineBrokerForTests();
  _resetBreachBookForTests();
  _resetCodexForTests();
  _resetOfflineFirmamentForTests();
  resetPrefs();
  if (playerEntity && savedPlayerSnapshot) {
    playerEntity.items = savedPlayerSnapshot.items;
    if (savedPlayerSnapshot.hasEquip) playerEntity.equip = savedPlayerSnapshot.equip;
    else delete playerEntity.equip;
    playerEntity.level = savedPlayerSnapshot.level;
    playerEntity.characterId = savedPlayerSnapshot.characterId;
    savedPlayerSnapshot = null;
  }
});

test('1. itemLaw compliance: all 90 Aetheric pieces, 5 Gilded, 2 Guns, Last Lock, Resonant Maul, 13 EG Lord Arms, currencies & 16 Boss Cards pass itemFindings === []', () => {
  for (const r of AETHERIC_RECORDS) {
    const it = mintAetheric(r, { party: 1 });
    assert.deepEqual(itemFindings(it), [], `Aetheric ${r.id} lawful`);
  }
  assert.equal(AETHERIC_RECORDS.length, 90);

  for (const g of GILDED_RECORDS) {
    const it = mintGilded(g);
    assert.deepEqual(itemFindings(it), [], `Gilded ${g.id} lawful`);
  }
  assert.equal(GILDED_RECORDS.length, 5);

  for (const kind of ['thunderlock', 'pistolet', 'lastlock']) {
    const gun = mintOfflineGun(kind, lcg(42));
    assert.deepEqual(itemFindings(gun), [], `Gun ${kind} lawful`);
  }

  const maul = mintResonantMaul(lcg(7));
  assert.deepEqual(itemFindings(maul), [], 'Resonant Maul lawful');

  for (const lordKey of Object.keys(EG_LORD_ARMS)) {
    const arm = egLordArm(lordKey, 16, lcg(99));
    assert.deepEqual(itemFindings(arm), [], `EG Lord Arm ${lordKey} lawful`);
  }
  assert.equal(Object.keys(EG_LORD_ARMS).length, 13);

  assert.deepEqual(itemFindings(Object.assign(sigilStone(), { stackCount: 5 })), [], 'Deadlands Embers lawful');
  assert.deepEqual(itemFindings(starglass(3)), [], 'Starfall Glass lawful');
  assert.deepEqual(itemFindings(createPellets(25)), [], 'Dwemer Pellets lawful');

  for (const id of BOSS_CARD_IDS) {
    const card = mintIliacCard(id);
    assert.deepEqual(itemFindings(card), [], `Boss Card ${id} lawful`);
  }
  assert.equal(Object.keys(BOSS_CARDS).length, 16);
});

test('2. Offline Sigils & Sets wake via Firmament Renown while keeping online renown multipliers unchanged', () => {
  assert.equal(sigilOnline(), false);
  assert.equal(sigilActive(), false);
  assert.equal(setsAwake(), false);

  const me = makeTestPlayer();
  initOfflineRenown(me);
  setOfflineRenownLevel(20, me);

  assert.equal(sigilOnline(), false, 'sigilOnline stays false offline');
  assert.equal(sigilActive(), true, 'sigilActive wakes offline');
  assert.equal(sigilOfflineAwake(), true);
  assert.equal(sigilRenown(), 20);
  assert.equal(renownLootQuarters(), 4, 'offline renownLootQuarters remains 4');
  assert.equal(renownOpens(40), true, 'offline renownOpens remains true');
  assert.equal(setsAwake(), true, 'sets wake offline');

  // Stamp weapon offline and test sigilBlow damage boost + drinkWorn XP growth
  const wpn = mintCondition(setItemFields({ group: 'Weapons', ...createWeapon(121, 5, lcg(11)) }));
  applyRarity(wpn, 'magic', () => 0.1);
  // Deterministic guarantee: stamp with small rolls so rollSigil triggers
  const stampedCount = stampWonWeapons([wpn], 1, { rolls: () => 0.0001 });
  assert.equal(stampedCount, 1);
  assert.ok(wpn.sigil, 'magic weapon stamped offline');

  const baseDmg = sigilBlow(wpn, 1000, me, { isPlayer: false });
  assert.ok(baseDmg > 1000, 'sigilBlow increases damage offline');

  // Wear 2 pieces of Wyrd set -> check awakeTiersOf and drinkWorn rank progression
  const wyrdPieces = AETHERIC_RECORDS.filter((r) => r.set === 'wyrd').slice(0, 3).map((r) => mintAetheric(r, { party: 1 }));
  for (const p of wyrdPieces) {
    me.items.push(p);
    equipItem(me, p);
  }
  const awake = awakeTiersOf(me);
  assert.ok(awake.has('wyrd'), 'wyrd tier awake offline');

  // Drink 6000 XP -> rank progression (0 -> 1 requires 5000 XP)
  const drank = drinkWorn(me, wpn, 6000);
  assert.equal(drank.rose, true);
  assert.ok(drank.lines.length >= 1, 'drinkWorn emits rise line offline');
  assert.ok(wyrdPieces[0].sigil.xp >= 5000, 'worn set piece gained XP');
  assert.ok(wpn.sigil.xp >= 5000, 'held sigil weapon gained XP');

  // Offline foe kill & quest XP helpers return positive XP
  const killXp = onOfflineFoeKilled({ level: 12 });
  const questXp = onOfflineQuestEnded(me);
  assert.ok(killXp > 0 && questXp > 0);
});

test('3. Offline Coven Sigil Broker: Panoply purchase, Starfall Glass & duplicate Aetheric & Ember->Pellets exchanges', () => {
  const items = [Object.assign(sigilStone(), { stackCount: 25 }), starglass(6)];
  const rowsDay1 = offlinePanoplyRows(1);
  assert.equal(rowsDay1.length, 9);
  assert.ok(rowsDay1.every((r) => !r.bought));

  const buy1 = buyOfflinePanoply('panoply-warhelm', { items, day: 1 });
  assert.equal(buy1.ok, true);
  assert.equal(buy1.item.stonesPaid, undefined, 'offline Panoply is not realm-broker-tagged');
  assert.notEqual(foundDay('aetheric', 'panoply-warhelm'), null, 'Codex immediately records purchase');
  assert.equal(buyOfflinePanoply('panoply-warhelm', { items, day: 1 }).reason, 'bought', 'same day repeat refused');
  assert.equal(buyOfflinePanoply('panoply-warhelm', { items, day: 2 }).reason, 'stones', 'next day resets daily lock (20 spent of 25)');

  // Trade 1 Starfall Glass -> 2 Embers
  const g1 = exchangeStarglassForEmbers({ items });
  assert.equal(g1.ok, true);
  assert.equal(g1.stones, 2);

  // Trade 5 Starfall Glass -> unfound Wyrd/Starspun piece
  const g2 = exchangeStarglassForWitchPiece({ items, rolls: () => 0.25 });
  assert.equal(g2.ok, true);
  assert.ok(g2.item.sigil?.set === 'wyrd' || g2.item.sigil?.set === 'starspun');
  assert.notEqual(foundDay('aetheric', g2.item.aetheric), null, 'Codex records woven witch piece');

  // Trade 1 Ember -> 25 Dwemer Pellets
  const g3 = exchangeEmberForPellets({ items });
  assert.equal(g3.ok, true);
  assert.equal(g3.item.templateIndex, PELLET_TEMPLATE);
  assert.equal(g3.item.stackCount, 25);

  // Trade dropped Aetheric duplicate -> 4 Embers; refuses stonesPaid, locked, equipped
  const droppedAe = mintAetheric(AETHERIC_RECORDS[0], { party: 1 });
  items.push(droppedAe);
  const tr1 = exchangeAethericForEmbers(droppedAe, { items });
  assert.equal(tr1.ok, true);
  assert.equal(tr1.stones, 4);
  assert.equal(items.includes(droppedAe), false);

  const paidAe = Object.assign(mintAetheric(AETHERIC_RECORDS[1], { party: 1 }), { stonesPaid: 12 });
  items.push(paidAe);
  assert.equal(exchangeAethericForEmbers(paidAe, { items }).reason, 'not', 'refuses stonesPaid Broker gear');

  const me = makeTestPlayer();
  const wornAe = mintAetheric(AETHERIC_RECORDS[2], { party: 1 });
  me.items.push(wornAe);
  equipItem(me, wornAe);
  assert.equal(exchangeAethericForEmbers(wornAe, { items: me.items }).reason, 'worn', 'refuses equipped piece');
});

test('4. capFoeLoot retains Embers (570), Starfall Glass (576), and Pellets (561) & breachBookFor grants once', () => {
  const plainFoe = {
    level: 10,
    items: [
      mintCondition(setItemFields({ group: 'Weapons', ...createWeapon(114, 1) })),
      mintCondition(setItemFields({ group: 'Weapons', ...createWeapon(115, 1) })),
      mintCondition(setItemFields({ group: 'Weapons', ...createWeapon(116, 1) })),
      mintCondition(setItemFields({ group: 'Weapons', ...createWeapon(117, 1) })),
      Object.assign(sigilStone(), { stackCount: 2 }),
      starglass(1),
      createPellets(8),
    ],
  };
  capFoeLoot(plainFoe);
  assert.ok(plainFoe.items.some(isSigilStone), 'Deadlands Ember never capped out');
  assert.ok(plainFoe.items.some(isStarglass), 'Starfall Glass never capped out');
  assert.ok(plainFoe.items.some((it) => it.templateIndex === PELLET_TEMPLATE), 'Dwemer Pellets never capped out');

  assert.equal(breachBookGiven(), false);
  const b1 = breachBookFor(sigilStone());
  assert.ok(b1 && b1.group === 'Books', 'First Ember grants On the Burning Doors');
  assert.equal(breachBookGiven(), true);
  assert.equal(breachBookFor(sigilStone()), null, 'Second Ember grants nothing');
});

test('5. rollOfflinePreApotheosisSpoils enforces Loot Rarity switch, level gates, and thematic pools', () => {
  setPref('lootRarity', false);
  assert.deepEqual(
    rollOfflinePreApotheosisSpoils({ source: 'foe', level: 20, dungeonType: DUNGEON_TYPES.Coven, titled: true }, () => 0.001),
    [],
    'Returns [] when Loot Rarity is disabled',
  );
  setPref('lootRarity', true);

  // Level 6: Embers & Glass drop, but not Lv 12 Aetheric sets or Lv 16 Gilded
  const lv6 = rollOfflinePreApotheosisSpoils(
    { source: 'foe', level: 6, dungeonType: DUNGEON_TYPES.Coven, titled: true, eliteDungeon: true },
    () => 0.001,
  );
  assert.ok(lv6.some(isSigilStone), 'Lv 6 drops Embers');
  assert.ok(lv6.some(isStarglass), 'Lv 6 Coven drops Starfall Glass');
  assert.equal(lv6.some((it) => it.rarity === 'aetheric' || it.rarity === 'gilded'), false, 'Lv 6 drops no Lv 12/16 tiers');

  // Level 12 HumanStronghold / RuinedCastle -> Oath; OrcStronghold -> Orcsbane; Prison -> Thieftaker/Eltheric
  for (const [dt, expectedSet] of [
    [DUNGEON_TYPES.HumanStronghold, 'oath'],
    [DUNGEON_TYPES.OrcStronghold, 'orcsbane'],
    [DUNGEON_TYPES.Laboratory, 'numidium'],
  ]) {
    const out = rollOfflinePreApotheosisSpoils(
      { source: 'foe', level: 12, dungeonType: dt, titled: true },
      () => 0.001,
    );
    const ae = out.find((it) => it.rarity === 'aetheric');
    assert.ok(ae, `Dungeon ${dt} drops an Aetheric set piece at Lv 12`);
    assert.equal(ae.sigil.set, expectedSet);
    assert.ok(DUNGEON_AETHERIC_SETS[dt].includes(ae.sigil.set));
  }

  // Level 16 Laboratory + Sea Holds drop full top-end ladder (Gilded / Lord Arm / Resonant Maul / Boss Card / Gun)
  const lab16 = rollOfflinePreApotheosisSpoils(
    { source: 'foe', level: 16, dungeonType: DUNGEON_TYPES.Laboratory, titled: true, eliteDungeon: true },
    () => 0.0001,
  );
  assert.ok(lab16.some((it) => it.rarity === 'gilded'), 'Lv 16 Lab drops Gilded');
  assert.ok(lab16.some((it) => it.legendary === RESONANT_MAUL.id), 'Lv 16 Lab drops Resonant Maul');
  assert.ok(lab16.some((it) => typeof it.card === 'string'), 'Lv 16 Lab drops Boss Card');

  const sea16 = rollOfflinePreApotheosisSpoils({ source: 'sea', level: 16, tier: 10 }, () => 0.0001);
  assert.ok(sea16.some((it) => it.rarity === 'aetheric'), 'Lv 16 Sea drops Aetheric set');
  assert.ok(sea16.some((it) => it.rarity === 'gilded'), 'Lv 16 Sea drops Gilded');
});

test('6. lootCodex offline hints appear when offline Firmament wakes and leave online/idle defaults untouched', () => {
  assert.equal(codexRows().find((r) => r.id === 'the-last-lock').hint, 'No longer found');
  assert.equal(codexGilded()[0].hint, GILDED_HINT);
  assert.equal(codexSets().every((s) => s.hint === ''), true);

  setSigilOnline(false);
  setSigilOfflineAwake(true);
  setSigilOfflineRenown(15);

  const lastLockRow = codexRows().find((r) => r.id === 'the-last-lock');
  const maulRow = codexRows().find((r) => r.id === RESONANT_MAUL.id);
  assert.match(lastLockRow.hint, /Laboratories|Sea Holds/i);
  assert.match(maulRow.hint, /Laboratories|Dwemer/i);

  const gilded = codexGilded();
  assert.equal(gilded.length, 5);
  for (const g of gilded) assert.notEqual(g.hint, GILDED_HINT);

  const sets = codexSets();
  assert.equal(sets.length, 10);
  for (const s of sets) assert.ok(s.hint.length > 10, `Set ${s.set} has offline Codex hint`);
});

test('7. All 26 locales have valid Port_Strings.csv entries for all 42 new keys', () => {
  const requiredKeys = [
    'broker.npc.name',
    'broker.needMore',
    'broker.panoply.offlineSub',
    'broker.panoply.offlineCard',
    'broker.panoply.boughtToday',
    'broker.coven.head',
    'broker.coven.sub',
    'broker.coven.glassEmbers',
    'broker.coven.glassWitch',
    'broker.coven.emberPellets',
    'broker.coven.aethericSub',
    'coven.sigilBroker',
    'coven.sigilBrokerClassic',
    'codex.setHint.wyrd',
    'codex.setHint.starspun',
    'codex.setHint.panoply',
    'codex.setHint.numidium',
    'codex.gilded.the-hourlock',
    'codex.gilded.the-ketchmasters-word',
    'codex.legendary.lastLockOffline',
    'codex.legendary.resonantMaulOffline',
  ];
  const localesDir = join(process.cwd(), 'locales');
  const dirs = readdirSync(localesDir).sort();
  assert.equal(dirs.length, 26);
  for (const lang of dirs) {
    const raw = readFileSync(join(localesDir, lang, 'Port_Strings.csv'), 'utf8');
    const map = new Map(parseStringTableCsv(raw));
    for (const k of requiredKeys) {
      assert.ok(map.get(k)?.length > 0, `${lang} missing ${k}`);
    }
  }
});

test('8. QA Console Commands: firmament setrenown + relic subcommands operate cleanly', async () => {
  assert.match(await executeConsoleCommand('firmament', ['setrenown', '22']), /Renown set to 22.*Sigils active: true/i);
  assert.equal(sigilRenown(), 22);
  assert.equal(sigilActive(), true);

  assert.match(await executeConsoleCommand('relic', ['status']), /Sigils Active: true.*Renown: 22/i);
  assert.match(await executeConsoleCommand('relic', ['embers', '12']), /Added 12 Deadlands Embers/i);
  assert.equal(breachBookGiven(), true, 'relic embers also tests first-Ember book trigger');
  assert.match(await executeConsoleCommand('relic', ['starglass', '5']), /Added 5 Starfall Glass/i);
  assert.match(await executeConsoleCommand('relic', ['pellets', '30']), /Added 30 Dwemer Pellets/i);
  assert.match(await executeConsoleCommand('relic', ['set', 'wyrd', '4']), /Added 4\/9 pieces of "wyrd"/i);
  assert.match(await executeConsoleCommand('relic', ['gilded', 'hourlock']), /Added 1 Gilded weapon/i);
  assert.match(await executeConsoleCommand('relic', ['gun', 'pistolet']), /Added .*Pistolet .* \+ 48 Dwemer Pellets/i);
  assert.match(await executeConsoleCommand('relic', ['lord', 'colossus']), /Added The Engine's Heart/i);
  assert.match(await executeConsoleCommand('relic', ['card', 'gate']), /Added Boss Card "gate"/i);

  // Equip a wyrd piece and test relic drink
  const wyrdPiece = playerEntity.items.find((it) => it.sigil?.set === 'wyrd');
  assert.ok(wyrdPiece);
  equipItem(playerEntity, wyrdPiece);
  assert.match(await executeConsoleCommand('relic', ['drink', '6000']), /drank 6000 XP/i);
  assert.ok(wyrdPiece.sigil.xp >= 6000);

  // Test drop simulation
  const rollRes = await executeConsoleCommand('relic', ['roll', 'coven', '16', '30']);
  assert.match(rollRes, /Rolled 30x in "coven" at Lv 16:/i);
});
