import '../modsOff.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createWorldQuickSave } from '../../src/scenes/worldQuickSave.js';
import { createSanctuaryInteriorEntry } from '../../src/scenes/apotheosisCultHost.js';
import { ensureCityCultSites, foundPlayerUndergroundSanctuary, getCityCultSites } from '../../src/systems/apotheosis/apotheosisCult.js';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('worldQuickSave refuses during active Direnni siege and private visits while keeping ohAbyss.entering first', () => {
  const src = read('src/scenes/worldQuickSave.js');
  const body = src.slice(src.indexOf('function worldQuickSave'));
  assert.match(body, /^function worldQuickSave[\s\S]*?\{\s*(?:\/\/[^\n]*\n\s*)*if \(host\.ohAbyss\?\.entering\)/);

  const said = [];
  const baseHost = (over = {}) => ({
    HCC_VENDOR: 'hcc',
    _spawnLedger: null,
    cam: { pos: [0, 1.7, 0], yaw: 0, pitch: 0 },
    campToRecord: () => ({}),
    camps: { snapshot: () => [] },
    cityGuards: { snapshotWorld: () => [] },
    droppedLoot: { snapshotWorld: () => [] },
    droppedTorches: { snapshot: () => [] },
    exteriorFoes: { snapshotWorld: () => [] },
    groundFrameHeight: (y) => y,
    groundFrameNative: (_x, _z, y) => y,
    hccRuntime: { getSaveData: () => ({}) },
    player: { crouching: false, transportMode: 0, fallSnapshot: () => null, pos: [0, 0, 0] },
    playerTicker: { ownMinutes: 0 },
    playerTravelPixel: () => ({ x: 1, y: 1 }),
    state: { worldCoords: (p) => ({ x: p[0], z: p[2] }), compensation: [0, 0, 0] },
    townTalk: { say: (m) => said.push(m) },
    walkMode: false,
    weaponRig: { playerWeapon: {} },
    magic: { readiedIndex: () => null },
    questBridge: null,
    rumorMill: null,
    topicTree: null,
    npcSession: null,
    playerSpawned: false,
    ...over,
  });

  const siegeSave = createWorldQuickSave(baseHost({ direnniSiege: { active: true } })).worldQuickSave;
  assert.equal(siegeSave('QuickSave', { quiet: true }), false);
  assert.equal(said.length, 0, 'quiet siege refusal is silent');
  assert.equal(siegeSave('QuickSave'), false);
  assert.equal(said.length, 1, 'non-quiet siege refusal notifies player');

  said.length = 0;
  const visitSave = createWorldQuickSave(baseHost({ modes: { isPrivateVisit: () => true } })).worldQuickSave;
  assert.equal(visitSave('QuickSave', { quiet: true }), false);
  assert.equal(said.length, 0, 'quiet private visit refusal is silent');
  assert.equal(visitSave('QuickSave'), false);
  assert.equal(said.length, 1, 'non-quiet private visit refusal notifies player');
});

test('Orrery forbids save, automap, mark, and recall', () => {
  const dc = read('src/scenes/dungeonContext.js');
  assert.match(dc, /let automapRec = madeLevelRule\(_made, 'automap'\) === 'off' \|\| isArenaFloor\(dfLocation\) \|\| _apoOrrery \? detachedAutomapRecord\(\)/);
  assert.match(dc, /savingPrevented: \(\) => madeLevelRule\(_made, 'save'\) === 'refused' \|\| isArenaFloor\(dfLocation\) \|\| _apoOrrery,/);
  assert.match(dc, /if \(_apoOrrery\) \{ hudText\.add\(t\('apotheosis\.orrery\.noMap', 'You cannot map the Orrery\.'\)\); return; \}/);
  assert.match(dc, /if \(_apoOrrery\) \{ if \(!quiet\) hudText\.add\(t\('apotheosis\.orrery\.noSave', 'You cannot save in the Orrery\.'\)\); return false; \}/);

  const w = read('src/scenes/world.js');
  assert.match(w, /if \(modes\?\.isApotheosisOrrery\?\.\(\)\) \{ townTalk\.say\(t\('apotheosis\.orrery\.noMark', 'You cannot set a Mark in the Orrery\.'\)\); return; \}/);
  assert.match(w, /if \(modes\?\.isApotheosisOrrery\?\.\(\)\) \{ townTalk\.say\(t\('apotheosis\.orrery\.noRecall', 'Nothing answers a Recall in the Orrery\.'\)\); return; \}/);
});

test('Underground Sanctuary (Daedra & player-founded) identity & restore wiring', () => {
  const entity = { name: 'Tester', apotheosis: {} };
  ensureCityCultSites(entity, { mapId: 12345, regionIndex: 17, locationName: 'Daggerfall', temples: [] });
  const daedraSite = getCityCultSites(entity, 12345).find((s) => s.kind === 'sanctuary' && !s.isPlayerFounded);
  assert.ok(daedraSite, 'daedra sanctuary seeded');

  const founded = foundPlayerUndergroundSanctuary(entity, { mapId: 12345, regionIndex: 17, locationName: 'Daggerfall', force: true });
  assert.ok(founded.ok && founded.site?.isPlayerFounded, 'player sanctuary founded');

  for (const site of [daedraSite, founded.site]) {
    const entry = createSanctuaryInteriorEntry(site, {
      mapId: 12345,
      regionIndex: 17,
      hatchWorldPos: [10, 2, -20],
      hatchYaw: 1.25,
    });
    assert.ok(entry?.hit?.cultSanctuarySite === site);
    assert.equal(entry.hit.cultSanctuaryYaw, 1.25);
    assert.equal(entry.building.cultSiteKey, site.siteKey);
  }

  const wm = read('src/scenes/worldModes.js');
  assert.match(wm, /savingPrevented:\s*host\.savingPrevented/);
  assert.match(wm, /cultSanctuary:\s*\{[\s\S]*?siteKey:\s*interiorCultSanctuary\.siteKey/);
  assert.match(wm, /if \(saved\?\.cultSanctuary\) \{[\s\S]*?createSanctuaryInteriorEntry\(site,/);
  assert.match(wm, /if \(!_enemyRestoreInProgress\)\s*\{\s*spawnCultInteriorGuardians\(/);
  assert.match(wm, /reattachCultInteriorGuardians\(/);
});

test('Enemy Cult Sanctuary guardian timer never breaks structuredClone(cult) and reattach completes on death', async () => {
  const { spawnCultInteriorGuardians, reattachCultInteriorGuardians } = await import('../../src/scenes/apotheosisCultHost.js');

  const entity = {
    apotheosis: { ascended: true, stage: 'ascended', portfolio: 'war', faith: 500 },
  };
  ensureCityCultSites(entity, { mapId: 7777, regionIndex: 17, locationName: 'TestCity', temples: [] });
  const site = getCityCultSites(entity, 7777).find((s) => s.kind === 'sanctuary' && !s.isPlayerFounded);
  assert.ok(site, 'enemy sanctuary seeded');
  site.unlocked = true;

  const foes = [];
  const interiorFoes = {
    foes,
    onRemovedOrDead: null,
    spawnFoe: () => {
      const f = { dead: false, entity: { health: 100 } };
      foes.push(f);
      return f;
    },
  };
  const building = { buildingKey: site.buildingKey, buildingType: 0, cultSiteKey: site.siteKey };
  const ctx = { landing: [0, 0, 0], spawnPoints: [[1, 0, 1]] };

  const spawned = spawnCultInteriorGuardians(entity, building, 7777, interiorFoes, ctx, { nowMinutes: 100 });
  assert.ok(spawned.length > 0);
  assert.doesNotThrow(() => structuredClone(entity.apotheosis.cult), 'cult state must remain structuredClone-safe');
  assert.equal(site._guardianCheckTimer, undefined);

  // Simulate save/load restore: foes come back without _cultSiteKey
  for (const f of foes) delete f._cultSiteKey;
  const messages = [];
  const attached = reattachCultInteriorGuardians(entity, building, 7777, interiorFoes, {
    say: (m) => messages.push(m),
    nowMinutes: 105,
  });
  assert.equal(attached, true);
  assert.equal(foes[0]._cultSiteKey, site.siteKey);

  // Kill all restored foes and wait one poll tick
  for (const f of foes) {
    f.dead = true;
    f.entity.health = 0;
  }
  await new Promise((r) => setTimeout(r, 700));
  assert.equal(site.guardiansCleared, true);
  assert.ok(messages.length > 0);
});

test('All 26 locales contain the new Orrery and Direnni Siege strings', () => {
  const keys = ['apotheosis.orrery.noSave', 'apotheosis.orrery.noMap', 'apotheosis.orrery.noMark', 'apotheosis.orrery.noRecall', 'apotheosis.siege.noSave'];
  const dirs = readdirSync(new URL('../../locales', import.meta.url), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  assert.equal(dirs.length, 26);
  for (const lang of dirs) {
    const raw = read(`locales/${lang}/Port_Strings.csv`);
    for (const k of keys) {
      assert.ok(raw.includes(`${k},`), `${lang} missing ${k}`);
    }
  }
});
