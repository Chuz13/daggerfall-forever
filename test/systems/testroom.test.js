// TSR1-TSR3: THE TEST ROOM - a prebuilt character and a packed armory,
// behind a front-door rail entry. The pins here walk the ONE home
// (systems/testRoom.js) and the three doors that read it (the pane,
// the route, the boot), plus TSR2's opts home in weaponRig - where the
// `!!gender` bug lived (the string 'male' is truthy, so every arms
// build asked for the FEMALE skeleton and body columns).
//
// AUDIT 39 RENUMBERED THESE. They shipped as TR1-TR3 on the same day
// the TRANSPORT arc closed TR1-TR5 (Systems-Arc.md), so one id named
// two slices in two arcs and the ledger could not be grepped. The test
// room is TSR; the transport arc keeps TR. Source comments in
// ui/enhanced/enhancedMenu.js and combat/weapon/weaponRig.js still carry the old
// spelling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TEST_PRESETS, TEST_RIDE, TEST_GOD, TEST_ASCENSION, testPresetById, testEntryById, testGearRows, testItemOf, applyTestCharacter, seedTestMount, seedTestGod, seedTestAscensionSpellsword, testStartsOutdoors, testStartLocation, TEST_BOOKS,
} from '../../src/systems/testRoom.js';
import { carriedWeight } from '../../src/systems/inventory.js';
import { entityMaxEncumbrance, baseDamageMin, baseDamageMax } from '../../src/combat/formulas.js';   // TSR-GUN: AUDIT 18 F1's law - damage is the TEMPLATE's, never a baked field
import { PANOPLY_SET_PIECES } from '../../src/systems/aetheric.js';
import { SKILLS } from '../../src/systems/skills.js';
import { SPELLBOOK_TEMPLATE_INDEX } from '../../src/systems/spell/spellMaker.js';
import { evaluateFateWeight } from '../../src/systems/apotheosis/apotheosisCore.js';
import { getActiveRecord as getActiveFirmRecord } from '../../src/systems/offlineFirmament.js';
import { characterIdOf } from '../../src/systems/characterId.js';
import { starsFor } from '../../src/net/firmament/firmamentLaw.js';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { executeConsoleCommand } from '../../src/systems/consoleCommands.js';
import { playerEntity } from '../../src/characters/playerEntity.js';
import { ENCHANTMENT_TYPES } from '../../src/formats/magicDef.js';
import { isImmuneToParalysis, isEntityImmuneToParalysis } from '../../src/systems/effects.js';
import { isAscendedGod, apotheosisHpOf } from '../../src/systems/apotheosis/apotheosisLive.js';
import { hasHorse, TRANSPORT_HORSE_TEMPLATE } from '../../src/systems/inventorySession.js';
import { positionPlayerToLocation, EXTRA_DISTANCE } from '../../src/world/locationEntrance.js';
import { RMB_SIDE } from '../../src/world/locationLayout.js';
import { TERRAIN_SIZE } from '../../src/world/terrain/terrainSampler.js';
import { armBuildOptsOf } from '../../src/combat/weapon/weaponRig.js';
import { RACES } from '../../src/systems/races.js';
import { CLASS_CAREERS } from '../../src/systems/chargen.js';
import { ITEM_TEMPLATES, templateByIndex } from '../../src/systems/item/itemTemplates.js';
import { WEAPONS_ENUM, ARMOR_ENUM, ARROW_TEMPLATE } from '../../src/combat/enemyEquipment.js';
import { ARMOR_MATERIAL } from '../../src/systems/armorMaterials.js';
import { EQUIP_SLOTS, equipTableOf } from '../../src/systems/equip.js';
import { THUNDERLOCK_TEMPLATE, PELLET_TEMPLATE, isThunderlock, isPellet, pelletCount } from '../../src/systems/thunderlock.js';
import { hostText } from '../hostText.mjs';   // PIN MOVED (HOST-SPLIT TEST-PRESET): the world host whole

const read = (p) => readFileSync(p, 'utf8');

test('TSR1: the presets cover the identity axes the body pipelines branch on', () => {
  assert.equal(TEST_PRESETS.length, 6);
  assert.equal(new Set(TEST_PRESETS.map((p) => p.id)).size, 6, 'ids are unique');
  for (const p of TEST_PRESETS) {
    assert.ok(RACES[p.race], `${p.id}: "${p.race}" is a real RACES key`);
    assert.ok(p.gender === 'male' || p.gender === 'female', `${p.id}: gender is the string convention`);
    assert.ok(p.faceIndex >= 0 && p.faceIndex <= 9, `${p.id}: faceIndex is a portrait-strip index`);
    assert.ok(p.classIndex >= 0 && p.classIndex < CLASS_CAREERS.length, `${p.id}: a real class`);
    assert.ok(p.label && p.blurb, `${p.id}: the card has words`);
  }
  // Both sexes (rule 6's skeleton column and the female body records)
  // and BOTH beast races (base_animkna, the tail row) are reachable.
  assert.ok(TEST_PRESETS.some((p) => p.gender === 'male') && TEST_PRESETS.some((p) => p.gender === 'female'));
  for (const beast of ['Khajiit', 'Argonian']) {
    assert.ok(TEST_PRESETS.some((p) => p.race === beast), `${beast} must be pickable`);
  }
  assert.equal(testPresetById('nord-warrior')?.race, 'Nord');
  assert.equal(testPresetById('no-such'), null, 'an unknown id answers null, never a guess');
});

test('TSR1: the armory is total where it claims to be, and every row is a real template', () => {
  for (const gender of ['male', 'female']) {
    const rows = testGearRows(gender);
    for (const r of rows) {
      // TSR-GUN: `templateByIndex`, not the frozen DFU array. The
      // armory carries the port's OWN weapon now, and a custom row
      // lives above 288 in the custom map - `ITEM_TEMPLATES[560]` is
      // undefined for a template the game resolves fine. This asks
      // the question every reader in the game asks.
      assert.ok(templateByIndex(r.templateIndex), `${gender}/${r.label}: template ${r.templateIndex} exists`);
    }
    // ONE OF EVERY WEAPON TYPE - each maps to its own Morrowind
    // animation class and attach bone, so a missing type is a lane
    // the room cannot exercise.
    for (const [name, t] of Object.entries(WEAPONS_ENUM)) {
      assert.ok(rows.some((r) => r.kind === 'weapon' && r.templateIndex === t && r.material === 1),
        `${gender}: steel ${name} in the pack`);
    }
    // EVERY armor slot, all four shield sizes included.
    for (const [name, t] of Object.entries(ARMOR_ENUM)) {
      assert.ok(rows.some((r) => r.kind === 'armor' && r.templateIndex === t),
        `${gender}: ${name} in the pack`);
    }
    // The material spread that changes the Morrowind record.
    for (const m of [ARMOR_MATERIAL.Leather, ARMOR_MATERIAL.Chain, ARMOR_MATERIAL.Ebony, ARMOR_MATERIAL.Daedric]) {
      assert.ok(rows.some((r) => r.kind === 'armor' && r.material === m), `${gender}: armor material ${m}`);
    }
    // A REAL quiver, so the bow draws loaded (hasAmmo reads the stack).
    const arrows = rows.find((r) => r.kind === 'arrows');
    assert.equal(arrows?.templateIndex, ARROW_TEMPLATE);
    assert.equal(arrows?.stackCount, 60);
    // TSR-GUN: the Dwarven Thunderlock and its pellets. This is the
    // one weapon the loop above cannot reach - it is not in
    // WEAPONS_ENUM (DFU's table; this weapon is the port's own), it
    // is off every shop shelf, and its find is the rarest roll in the
    // game - so the test character is the only way to hold one on
    // purpose. Loaded, for the same reason the bow is.
    const gun = rows.find((r) => r.kind === 'thunderlock');
    assert.equal(gun?.templateIndex, THUNDERLOCK_TEMPLATE, `${gender}: the Thunderlock is in the pack`);
    const pellets = rows.find((r) => r.kind === 'pellets');
    assert.equal(pellets?.templateIndex, PELLET_TEMPLATE, `${gender}: and its ammunition`);
    assert.ok(pellets.stackCount >= 1, `${gender}: a real stack, not an empty row`);
    // The clothes are the SEX'S OWN templates - mens rows are 141-181,
    // womens 182-216 (itemTemplates' own split).
    for (const r of rows.filter((x) => x.kind === 'clothing')) {
      if (gender === 'female') assert.ok(r.templateIndex >= 182 && r.templateIndex <= 216, `${r.label} is a womens template`);
      else assert.ok(r.templateIndex >= 141 && r.templateIndex <= 181, `${r.label} is a mens template`);
      assert.equal(r.group, gender === 'female' ? 'WomensClothing' : 'MensClothing');
    }
  }
});

test('TSR1: rows mint through the game\'s own constructors, not a second copy', () => {
  const rows = testGearRows('male');
  const sword = testItemOf(rows.find((r) => r.label === 'Steel Longsword'));
  assert.equal(sword.group, 'Weapons');
  assert.ok(sword.minDamage > 0 && sword.maxDamage > sword.minDamage, 'createWeapon minted the damage');
  assert.ok(sword.maxCondition > 0, 'and the condition');
  const arrows = testItemOf(rows.find((r) => r.kind === 'arrows'));
  assert.equal(arrows.stackCount, 60);
  assert.equal(arrows.currentCondition, 0, 'the arrow arm\'s classic zero rides through');
  const cuirass = testItemOf(rows.find((r) => r.label === 'Steel Cuirass'));
  assert.equal(cuirass.group, 'Armor');
  assert.equal(cuirass.material, ARMOR_MATERIAL.Steel);
  assert.ok(cuirass.maxCondition > 0, 'mintCondition ran');
  const robe = testItemOf(rows.find((r) => r.label === 'Plain Robes'));
  assert.equal(robe.group, 'MensClothing');
  assert.equal(robe.name, 'Plain Robes', 'the template names the item');
  // TSR-GUN: the gun and its ammunition mint through the weapon's own
  // two constructors, so the test character's Thunderlock is the same
  // item the rarest find in the game hands over - damage off its own
  // table, and a stack the ammunition door can spend.
  const thunder = testItemOf(rows.find((r) => r.kind === 'thunderlock'));
  assert.ok(isThunderlock(thunder), 'the row mints the real weapon');
  assert.equal(thunder.group, 'Weapons', 'so equip, the paperdoll and the rig all see a weapon');
  assert.ok(thunder.maxCondition > 0, 'mintCondition ran');
  // AUDIT 18 F1's law, and the reason this asks formulas.js rather
  // than the item: DFU never stores a weapon's damage ON the item, it
  // resolves the template on every swing. A `thunder.maxDamage` here
  // would pass only for the one constructor that bakes the field and
  // would say nothing about what the gun actually hits for.
  assert.ok(baseDamageMax(thunder) > baseDamageMin(thunder) && baseDamageMin(thunder) > 0,
    'the template answers its own span for the minted item');
  const shot = testItemOf(rows.find((r) => r.kind === 'pellets'));
  assert.ok(isPellet(shot), 'and the row mints real pellets');
  assert.equal(shot.stackCount, 30);
  assert.equal(pelletCount([thunder, shot]), 30, 'the pack answers the ammunition question with them in it');
});

test('TSR2: armBuildOptsOf reads the STRING gender - the !! that built the female skeleton for everyone is dead', () => {
  const entity = (gender) => ({
    race: 'DarkElf', gender, faceIndex: 3,
    items: [{ group: 'Weapons', templateIndex: ARROW_TEMPLATE, stackCount: 5 }],
    equip: { slots: { [EQUIP_SLOTS.RightHand]: { group: 'Weapons', templateIndex: WEAPONS_ENUM.Longsword } } },
  });
  const male = armBuildOptsOf(entity('male'));
  assert.equal(male.female, false, 'the string "male" is TRUTHY - a !! here dies');
  assert.equal(armBuildOptsOf(entity('female')).female, true);
  assert.equal(male.race, 'dark elf', 'race rides mwRaceId\'s one spelling');
  assert.equal(male.faceIndex, 3);
  assert.equal(male.weapon.templateIndex, WEAPONS_ENUM.Longsword, 'the right hand reaches the build');
  assert.equal(male.hasAmmo, true, 'the quiver reaches the build');
  assert.equal(armBuildOptsOf({ ...entity('male'), items: [] }).hasAmmo, false);
});

test('TSR3: the three doors all read the one home', () => {
  // The pane shows TEST_PRESETS and fires test:<id>.
  const menu = read('src/ui/enhanced/enhancedMenu.js');
  assert.match(menu, /for \(const p of TEST_PRESETS\)/, 'the pane iterates the home, not a copy');
  assert.match(menu, /onAction\(`test:\$\{p\.id\}`\)/, 'a card press is the boot');
  assert.match(menu, /test: paneTest,/, 'the rail entry has a pane');
  // The route: set on this choice, DELETED on every other (F12's law).
  const main = read('src/main.js');
  assert.match(main, /if \(typeof choice === 'string' && choice\.startsWith\('test:'\)\) params\.set\('test', choice\.slice\(5\)\);/);
  assert.match(main, /else params\.delete\('test'\);/, 'New Game must not re-enter the room');
  // The boot: preset resolved BEFORE the branch (an unknown id falls
  // through to the wizard), the same headless seam, the armory, and
  // the arms built only when the data is attached.
  const world = hostText('src/scenes/world.js');
  assert.match(world, /const testEntry = !playerEntity\.chargenDone && params\.has\('test'\) \? testEntryById\(params\.get\('test'\)\) : null;\s*\n\s*const testPreset = testEntry\?\.preset \?\? null;/,
    'TSR4: the entry resolves first, the preset off it - an unknown id is still null before the branch');
  assert.match(world, /await applyTestCharacter\(playerEntity, preset, \{ fetchBytes, spellsByIndex: sbi \}\)/);
  assert.match(world, /if \(morrowindDataCount\(\) > 0\)/, 'no data, no build - the classic sprite stands');
  assert.match(world, /await buildArmsFor\(playerEntity\)/, 'with data, the rigs come up without the pause-card trip');
});

// The full character - identity honored through the REAL headless
// chargen, the armory in the pack, the baseline dressed. Needs
// CLASS*.CFG, so it rides the ARENA2 gate like every chargen pin.
const ARENA2 = process.env.ARENA2_PATH;
const skipReal = !ARENA2 ? 'ARENA2_PATH not set - real-data validation skipped' : false;

test('TSR1: a preset becomes a live character - identity, armory, dressed baseline', { skip: skipReal }, async () => {
  const fetchBytes = async (name) => new Uint8Array(readFileSync(join(ARENA2, name)));
  const entity = { gender: 'male', race: 'Breton', raceId: 1, faceIndex: 0 };
  const preset = testPresetById('argonian-barbarian');
  const { added } = await applyTestCharacter(entity, preset, { fetchBytes });
  // The identity survives applyCharacter's Breton-male defaults.
  assert.equal(entity.race, 'Argonian');
  assert.equal(entity.raceId, RACES.Argonian);
  assert.equal(entity.gender, 'female');
  assert.equal(entity.faceIndex, 5);
  assert.equal(entity.chargenDone, true);
  assert.ok(added >= 40, `the armory landed (${added} items)`);
  // The baseline is DRESSED through the real equip door.
  const slots = entity.equip?.slots ?? {};
  const worn = Object.values(slots).filter(Boolean);
  assert.ok(worn.some((it) => it.templateIndex === ARMOR_ENUM.Cuirass), 'the steel cuirass is on');
  assert.ok(worn.some((it) => it.templateIndex === WEAPONS_ENUM.Longsword), 'the longsword is in hand');
  // And the female pack carries the female clothes.
  assert.ok(entity.items.some((it) => it.templateIndex === 200), 'womens Plain Robes (200) in the pack');
});

// TSR4 (2026-09-03, Mac: "an option that spawns you into the outside
// world with a mount to test"). The ride is a SPAWN on top of a preset,
// resolved through the one entry door, with the horse minted the way
// the general store mints one and the landing/mount owed to the host.

test('TSR4: the ride entry rides the baseline preset through the one door, and an unknown id is still null', () => {
  assert.equal(TEST_RIDE.id, 'ride');
  assert.ok(testPresetById(TEST_RIDE.preset), 'the ride names a real preset');
  const ride = testEntryById('ride');
  assert.equal(ride.ride, true);
  assert.equal(ride.preset.id, TEST_RIDE.preset);
  const plain = testEntryById('khajiit-monk');
  assert.equal(plain.ride, false, 'a preset entry is not a ride');
  assert.equal(plain.preset.id, 'khajiit-monk');
  assert.equal(testEntryById('no-such'), null, 'never a guess');
  assert.ok(TEST_RIDE.label && TEST_RIDE.blurb, 'the card has words');
});

test('TSR4: the mount is the store\'s own horse, once, and the pack answers hasHorse for it', () => {
  const entity = { items: [] };
  assert.equal(hasHorse(entity.items), false);
  assert.equal(seedTestMount(entity), true);
  assert.equal(hasHorse(entity.items), true, 'the T window\'s own question');
  const horse = entity.items.find((it) => it.templateIndex === TRANSPORT_HORSE_TEMPLATE);
  assert.equal(horse.group, 'Transportation');
  assert.equal(horse.name, ITEM_TEMPLATES[TRANSPORT_HORSE_TEMPLATE].name, 'the template names it, as the shelf does');
  assert.ok(horse.maxCondition > 0, 'mintCondition ran');
  assert.ok(horse.value > 0, 'and the shelf\'s base value rides along');
  assert.equal(seedTestMount(entity), false, 'a pack with a horse is left alone');
  assert.equal(entity.items.filter((it) => it.templateIndex === TRANSPORT_HORSE_TEMPLATE).length, 1);
});

test('TSR4: the pane, the boot and the frame gate - the edge landing, the ONE transport door, never before the first stand', () => {
  const menu = read('src/ui/enhanced/enhancedMenu.js');
  assert.match(menu, /onAction\(`test:\$\{TEST_RIDE\.id\}`\)/, 'the ride card fires the same choice family');
  // TSR4b: the ride NEVER takes the classic start - that is Privateer's
  // Hold with StartInDungeon, and an exterior landing racing a dungeon
  // entry is "either in the dungeon or in the ground". It keeps the
  // named start (the city's exterior); every other door keeps classic.
  const main = read('src/main.js');
  // FIELD BUGS 2026-09-29 (the sea) #5: the sea battle is a spawn outdoors too - the one home's list, which the
  // route reads (test/systems/fbsea_testroom.test.js pins the list itself)
  assert.match(main, /const \{ testStartsOutdoors \} = await import\('\.\/systems\/testRoom\.js'\);\s*\n\s*if \(testStartsOutdoors\(params\.get\('test'\)\)\) params\.delete\('classic'\);\s*\n\s*else params\.set\('classic', '1'\);/,
    'the ride drops the classic start through the one home\'s list; every other choice still sets it');
  assert.ok(main.indexOf("params.delete('classic')") > main.indexOf("else params.delete('test');"), 'decided after the test param is settled');
  const world = hostText('src/scenes/world.js');
  // the horse lands with the armory; the mount is DEFERRED to the frame
  // loop's spawn gate, so it can never run before the player has a floor
  assert.match(world, /if \(testEntry\.ride\) \{ seedTestMount\(playerEntity\); boot\.rideOutWanted = true; \}/);
  assert.match(world, /if \(rideOutWanted && playerSpawned\) rideOut\(\);/, 'the frame gate');
  const rideAt = world.indexOf('const rideOut = () => {');
  const gateAt = world.indexOf('if (rideOutWanted && playerSpawned) rideOut();');
  assert.ok(rideAt > 0 && gateAt > rideAt, 'defined at the boot, fired from the loop');
  const body = world.slice(rideAt, world.indexOf('\n  };', rideAt));
  // the landing is the fast-travel arrival's own edge law (no start
  // markers = outside the walls, facing in), floored the arrival's way
  assert.ok(body.includes("locationLandingFor(startPixel.x, startPixel.y, { noMarkers: true })"), 'the edge landing');
  assert.ok(body.includes('floorLanding(collider, edge.pos, ARRIVAL_REACH, ARRIVAL_LIFT)'), 'floored like an arrival');
  assert.ok(body.includes('cam.yaw = edge.yaw;'), 'facing the location, as PositionPlayerToLocation sets it');
  // TSR4a: the edge can stand in the NEXT pixel (an 8x8 city fills its
  // own), so the landing WAITS for terrain under the point - heightAt
  // is -Infinity until that pixel is built - and never floors before it
  assert.match(body, /if \(rideOutEdge === null\) rideOutEdge = locationLandingFor\(/, 'the edge is resolved once, off the built start pixel');
  assert.ok(body.includes('const groundThere = !!edge && Number.isFinite(heightAt(edge.pos[0], edge.pos[2]));'), 'terrain under the landing point is the gate');
  assert.ok(body.includes('if (edge && !groundThere && (building || queue.length || inFlight.size)) return;'), 'waits while the ring is still building');
  assert.ok(body.indexOf('return;') < body.indexOf('rideOutWanted = false;'), 'the wait keeps the want armed; only a landing (or the dead-man) clears it');
  assert.ok(body.indexOf('const groundThere') < body.indexOf('floorLanding('), 'the floor ray runs only once the ground is there');
  assert.ok(body.includes("'[testroom] ride out: no terrain under the edge landing after the ring built - mounting where you stand'"), 'the dead-man release says so');
  // the mount goes through U53's ONE door - tr5 pins that the door is
  // the only motor call, so this cannot be a second one
  assert.ok(body.includes('setTransportModeHere(TRANSPORT_MODES.Horse);'), 'the one transport door');
  assert.ok(!body.includes('player.setTransportMode('), 'never the motor directly');
});

test('TSR4a: an 8x8 city fills its pixel, so its edge landing stands in the NEXT pixel - the reason the ride waits for ground', () => {
  // getLocationTerrainTileOrigin (world.js; World-Arc: 8x8 -> (0,0))
  // puts an eight-block location at the pixel's own origin, and the
  // arrival's outside point is EXTRA_DISTANCE past the wall - which
  // is past the pixel too. Every side, deterministically.
  const origin = [0, 2.0 * 0.025, 0];
  for (const roll of [0, 0.25, 0.5, 0.75]) {
    const at = positionPlayerToLocation({ mapWidth: 8, mapHeight: 8, origin, roll: () => roll });
    const [x, , z] = at.pos;
    const outside = x < 0 || z < 0 || x >= TERRAIN_SIZE || z >= TERRAIN_SIZE;
    assert.ok(outside, `${at.side}: (${x.toFixed(1)}, ${z.toFixed(1)}) lies outside the 0..${TERRAIN_SIZE} pixel`);
    assert.ok(Math.abs(x - TERRAIN_SIZE / 2) <= 4 * RMB_SIDE + EXTRA_DISTANCE + 1e-9
      && Math.abs(z - TERRAIN_SIZE / 2) <= 4 * RMB_SIDE + EXTRA_DISTANCE + 1e-9, 'and only just - one EXTRA_DISTANCE past the wall');
  }
  // a small village stays inside its pixel - the wait costs it nothing
  const villageOrigin = [Math.trunc((128 - 16) / 2) * (TERRAIN_SIZE / 128), 0, Math.trunc((128 - 16) / 2) * (TERRAIN_SIZE / 128)];
  const v = positionPlayerToLocation({ mapWidth: 1, mapHeight: 1, origin: villageOrigin, roll: () => 0 });
  assert.ok(v.pos[0] >= 0 && v.pos[0] < TERRAIN_SIZE && v.pos[2] >= 0 && v.pos[2] < TERRAIN_SIZE);
});

test('EB3: every test pack carries books - real ids of the classic mapping, minted through CreateBook, titled by the mapping', () => {
  assert.ok(TEST_BOOKS.length >= 3, 'a shelf\'s worth');
  for (const gender of ['male', 'female']) {
    const rows = testGearRows(gender).filter((r) => r.kind === 'book');
    assert.equal(rows.length, TEST_BOOKS.length, `${gender}: every book is a row`);
    for (const r of rows) {
      assert.equal(r.templateIndex, 277, 'the Books template');
      assert.ok(r.label && r.label.length > 3, `${r.message}: the mapping names it`);
      const item = testItemOf(r);
      assert.equal(item.group, 'Books');
      assert.equal(item.message, r.message, 'the item carries the book id the reader opens');
      assert.equal(item.templateIndex, 277);
      assert.ok(item.maxCondition > 0, 'minted through mintCondition, like the loot path');
    }
  }
  assert.ok(TEST_BOOKS.includes(28), 'Brief History of the Empire I - a long book, for the leaves');
});

test('TEST_GOD: newly ascended Level 35 Nord Warrior (War) starting outdoors in Chesterwark', () => {
  assert.equal(TEST_GOD.id, 'god');
  assert.equal(TEST_GOD.preset, 'nord-warrior');
  assert.equal(TEST_GOD.level, 35);
  assert.equal(TEST_GOD.portfolio, 'war');
  assert.deepEqual(testEntryById('god'), { preset: testPresetById('nord-warrior'), ride: false, god: true });
  assert.equal(testStartsOutdoors('god'), true);
  assert.deepEqual(testStartLocation('god'), { region: 'Daggerfall', loc: 'Chesterwark' });
  assert.equal(testStartLocation('nord-warrior'), null);

  const career = {
    name: CLASS_CAREERS[testPresetById('nord-warrior').classIndex],
    hitPointsPerLevel: 12,
    primarySkills: [28, 30, 31],
    majorSkills: [29, 32, 33],
    minorSkills: [12, 13, 14, 15, 16, 17],
  };
  const entity = {
    level: 1,
    career,
    stats: { strength: 60, intelligence: 40, willpower: 45, agility: 50, endurance: 60, personality: 45, speed: 50, luck: 50 },
    skills: new Array(36).fill(10),
    maxHealth: 40,
    rawMaxHealth: 40,
    health: 40,
    maxMagicka: 20,
    magicka: 20,
    maxFatigue: 110,
    fatigue: 110,
    spells: [],
  };
  const res = seedTestGod(entity, { nowMinutes: 1000 });
  assert.equal(res.ok, true);
  assert.equal(entity.level, 35);
  assert.equal(isAscendedGod(entity), true);
  assert.equal(entity.apotheosis.portfolio, 'war');
  assert.equal(entity.apotheosis.faith, 500);
  assert.ok(entity.rawMaxHealth > 40, 'fair HP gained across 34 levels');
  assert.ok(apotheosisHpOf(entity) >= 500, 'godhood vitals bonus active');
  assert.equal(entity.health, entity.maxHealth);
  assert.equal(entity.stats.strength, 100, 'base mortal stat capped at 100 before portfolio mods');
});

test('TEST_ASCENSION: Level 35 Spellsword test room outdoors at Direnni Tower without mod perks or encumbrance overflow', () => {
  assert.equal(TEST_ASCENSION.id, 'ascension');
  assert.equal(TEST_ASCENSION.preset, 'breton-sorceress');
  assert.equal(TEST_ASCENSION.region, 'Isle of Balfiera');
  assert.equal(TEST_ASCENSION.loc, 'Direnni Tower');
  assert.equal(TEST_ASCENSION.level, 35);
  assert.deepEqual(testEntryById('ascension'), { preset: testPresetById('breton-sorceress'), ride: false, ascension: true });
  assert.equal(testStartsOutdoors('ascension'), true);
  assert.deepEqual(testStartLocation('ascension'), { region: 'Isle of Balfiera', loc: 'Direnni Tower' });

  const prevLootRarity = getPref('lootRarity');
  setPref('lootRarity', true);
  try {
    const entity = {
      isPlayer: true,
      name: 'Test Spellsword',
      level: 1,
      skills: new Array(36).fill(10),
      items: [],
      spells: [],
    };
    const res = seedTestAscensionSpellsword(entity);
    assert.equal(res.level, 35);
    assert.equal(entity.level, 35);
    assert.equal(entity.career?.name, 'Spellsword');
    assert.equal(entity.career?.hitPointsPerLevel, 20);
    assert.equal(entity.career?.abilityFlagsAndSpellPointsBitfield, 0);
    assert.equal(entity.career?.weaponArmorShieldsBitfield, 0);
    assert.equal(entity.stats.speed, 100);
    assert.equal(entity.stats.personality, 75);
    assert.equal(entity.stats.luck, 90);
    assert.equal(entity.unlockedPerks, undefined, 'no mod perks granted');
    assert.equal(entity.skills[SKILLS.LongBlade], 200);
    assert.equal(entity.skills[SKILLS.Destruction], 150);
    assert.equal(entity.skills[SKILLS.Alteration], 140);
    assert.equal(entity.skills[SKILLS.Restoration], 100);
    assert.equal(entity.skills[SKILLS.Axe], 100);
    assert.equal(entity.skills[SKILLS.Mysticism], 100);
    assert.equal(entity.arcanePath, 'battlemage');
    assert.equal(entity.martialPath, 'warblade');

    const slots = equipTableOf(entity);
    const equippedIds = new Set(
      slots.filter(Boolean).map((it) => it.aetheric ?? it.legendary),
    );
    for (const rec of PANOPLY_SET_PIECES) {
      if (rec.id === 'panoply-saber') continue;
      assert.ok(equippedIds.has(rec.id), `Panoply piece equipped: ${rec.id}`);
    }
    assert.ok(!equippedIds.has('panoply-saber'), 'Panoply Saber omitted in favor of Shalidor\'s Brand');
    assert.equal(slots[EQUIP_SLOTS.RightHand]?.legendary, 'shalidors-brand');
    assert.equal(slots[EQUIP_SLOTS.LeftHand]?.aetheric, 'panoply-shield');
    assert.ok(equippedIds.has('wrothgar-mantle'));
    assert.ok(equippedIds.has('stendarr-vestments'));
    for (const id of ['eye-of-magnus', 'amulet-of-the-nine', 'ring-of-artaeum', 'archmages-loop', 'duelists-vambrace', 'mark-of-the-hist']) {
      assert.ok(equippedIds.has(id), `Legendary jewelry equipped: ${id}`);
    }
    const freeActionBracelet = slots[EQUIP_SLOTS.Bracelet0];
    assert.equal(freeActionBracelet?.name, 'Bracelet of Free Action');
    assert.ok(
      freeActionBracelet?.enchantments?.some((e) => e.type === ENCHANTMENT_TYPES.CastWhenHeld && e.param === 10),
      'Bracelet of Free Action carries CastWhenHeld Free Action (#10)',
    );
    assert.equal(isImmuneToParalysis(entity), true, 'held Free Action grants permanent paralysis immunity');
    assert.equal(isEntityImmuneToParalysis(entity), true, 'entity paralysis immunity gate active');
    const packGatecleaver = entity.items.find((it) => it.aetheric === 'ruhn-gatecleaver');
    assert.ok(packGatecleaver, "Ruhn's Gatecleaver is in pack");
    assert.ok(!equippedIds.has('ruhn-gatecleaver'), "Ruhn's Gatecleaver left unequipped so shield + longsword stay active");
    assert.ok(entity.items.some((it) => it.templateIndex === SPELLBOOK_TEMPLATE_INDEX), 'Spellbook present in pack');

    const wt = carriedWeight(entity);
    const cap = entityMaxEncumbrance(entity);
    assert.ok(wt < cap, `carriedWeight (${wt}) must stay under maxEncumbrance (${cap})`);
    assert.equal(res.stars, 98);
    assert.equal(starsFor(50), 98);
    assert.equal(res.craftPoints, 50);
    const firmRec = getActiveFirmRecord(characterIdOf(entity));
    assert.equal(firmRec.renown, 50);
    assert.equal(firmRec.tree, '');
    assert.equal(evaluateFateWeight(entity).ready, true);
    assert.ok(res.fateCount >= 16);
  } finally {
    setPref('lootRarity', prevLootRarity);
  }
});

test('console commands apo spellsword / spellsword / apo_ready seed Ascension Spellsword on playerEntity', async () => {
  const prevLootRarity = getPref('lootRarity');
  const prevState = {
    level: playerEntity.level,
    career: playerEntity.career,
    stats: playerEntity.stats ? { ...playerEntity.stats } : undefined,
    skills: Array.isArray(playerEntity.skills) ? [...playerEntity.skills] : undefined,
    items: Array.isArray(playerEntity.items) ? [...playerEntity.items] : undefined,
    equip: playerEntity.equip,
    spells: Array.isArray(playerEntity.spells) ? [...playerEntity.spells] : undefined,
    activeEffects: Array.isArray(playerEntity.activeEffects) ? [...playerEntity.activeEffects] : undefined,
    goldPieces: playerEntity.goldPieces,
    maxHealth: playerEntity.maxHealth,
    rawMaxHealth: playerEntity.rawMaxHealth,
    health: playerEntity.health,
    maxMagicka: playerEntity.maxMagicka,
    magicka: playerEntity.magicka,
    maxFatigue: playerEntity.maxFatigue,
    fatigue: playerEntity.fatigue,
    arcanePath: playerEntity.arcanePath,
    martialPath: playerEntity.martialPath,
  };
  setPref('lootRarity', true);
  try {
    const out1 = await executeConsoleCommand('apo', ['spellsword']);
    assert.match(String(out1), /Spellsword L35 seeded/);
    assert.match(String(out1), /98 unspent Stars/);
    assert.equal(playerEntity.level, 35);
    assert.equal(playerEntity.career?.name, 'Spellsword');
    assert.ok(carriedWeight(playerEntity) < entityMaxEncumbrance(playerEntity));
    assert.equal(isImmuneToParalysis(playerEntity), true);

    const out2 = await executeConsoleCommand('spellsword', []);
    assert.match(String(out2), /Spellsword L35 seeded/);
    const out3 = await executeConsoleCommand('apo_ready', []);
    assert.match(String(out3), /Spellsword L35 seeded/);
  } finally {
    Object.assign(playerEntity, prevState);
    setPref('lootRarity', prevLootRarity);
  }
});
