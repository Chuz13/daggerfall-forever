import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  setPref,
  getPref,
  isOfflineHousingActive,
} from '../../src/systems/uiPrefs.js';
import {
  createOfflineHomes,
  isOfflineHouseOwned,
  allOfflineHomes,
  inheritOfflineHome,
  _resetForTests as resetOfflineHomes,
} from '../../src/systems/offlineHomes.js';
import {
  foundFamily,
  addChild,
  familyRng,
  MODELS,
  touch,
  recordDeath,
} from '../../src/systems/legacy/family.js';
import {
  syncHouses,
  familyHome,
  homeOf,
  householdOf,
  sameHouse,
  deedsDue,
} from '../../src/systems/legacy/household.js';
import { createLegacyHost } from '../../src/scenes/legacyHost.js';
import { drawHousePage, setFamilyProvider, resetFamilyPages } from '../../src/ui/familyPages.js';
import { _resetModSaveData, modSaveRecords, restoreModSaveRecords } from '../../src/systems/modSaveData.js';
import { _resetModSettings } from '../../src/systems/modSettings.js';
import { t, setLocale, BASE_LOCALE, patchLocaleTable, parseStringTableCsv, clearLocaleTables } from '../../src/systems/textManager.js';
import { readFileSync } from 'node:fs';

const readRows = (code) => parseStringTableCsv(readFileSync(new URL(`../../locales/${code}/Port_Strings.csv`, import.meta.url), 'utf8'));
patchLocaleTable('en', 'Port_Strings', readRows('en'));
patchLocaleTable('ru', 'Port_Strings', readRows('ru'));

const entity = (over = {}) => ({
  name: 'Breton Hero',
  gender: 'male',
  race: 'Breton',
  raceId: 0,
  faceIndex: 1,
  careerIndex: 1,
  career: { name: 'Mage' },
  level: 5,
  characterId: 'c-hero',
  chargenDone: true,
  items: [],
  ...over,
});

test.beforeEach(() => {
  resetOfflineHomes();
  _resetModSaveData();
  _resetModSettings();
  setPref('offlineHousing', true);
  setLocale(BASE_LOCALE);
});

test.afterEach(() => {
  resetOfflineHomes();
  _resetModSaveData();
  _resetModSettings();
  setPref('offlineHousing', true);
  setLocale(BASE_LOCALE);
});

test('LEGACY + OFFLINE HOUSING: claimed offline home syncs into family houses and becomes family home', async () => {
  const f = foundFamily(entity(), { rng: familyRng(1), id: 'fam-off', seat: { region: 'Daggerfall', loc: 'Daggerfall', mapId: 5000 } });
  const child = addChild(f, 1, { rng: familyRng(2) }).person;

  const homes = createOfflineHomes({ player: () => entity() });
  await homes.claim({ mapId: 5000, buildingKey: 101, region: 17, price: 15000 });

  const held = allOfflineHomes().map((h) => ({
    regionIndex: h.region | 0,
    mapId: h.mapId >>> 0,
    buildingKey: h.buildingKey | 0,
    location: 'Daggerfall',
  }));

  assert.equal(held.length, 1);
  assert.equal(syncHouses(f, 1, held), true);
  assert.equal(f.houses.length, 1);
  assert.equal(f.houses[0].buildingKey, 101);
  assert.equal(f.houses[0].by, 1);

  const home = familyHome(f);
  assert.ok(home);
  assert.equal(home.buildingKey, 101);

  // Unplayed child lives in the family home
  const living = homeOf(f, child);
  assert.ok(living);
  assert.equal(living.buildingKey, 101);
  assert.equal(living.lent, false);

  // Household list contains the child with their home
  const members = householdOf(f);
  assert.equal(members.length, 1);
  assert.equal(members[0].person.id, child.id);
  assert.equal(members[0].home.buildingKey, 101);
});

test('LEGACY + OFFLINE HOUSING: host isFamilyHouse recognizes offline home and parks member', async () => {
  let stored = null;
  const storage = {
    getItem: (k) => (stored && stored[k] ? stored[k] : null),
    setItem: (k, v) => { stored = { ...(stored || {}), [k]: String(v) }; },
    removeItem: (k) => { if (stored) delete stored[k]; },
  };

  const e = entity();
  const homes = createOfflineHomes({ player: () => e });
  await homes.claim({ mapId: 5000, buildingKey: 202, region: 17, price: 20000 });

  let houseHere = null;
  const host = createLegacyHost({
    entity: e,
    storage: () => storage,
    tab: () => storage,
    on: () => true,
    online: () => false,
    now: () => 100,
    own: () => 100,
    here: () => ({ pixel: { x: 1, y: 1 }, region: 'Daggerfall', loc: 'Daggerfall', mapId: 5000 }),
    town: () => ({ region: 'Daggerfall', loc: 'Daggerfall', mapId: 5000 }),
    nearestTown: () => ({ region: 'Daggerfall', loc: 'Daggerfall' }),
    gold: () => 500,
    say: () => {},
    boot: () => {},
    search: () => '',
    loadCharacter: () => true,
    saveNow: () => true,
    inFight: () => false,
    heldHouses: () => (isOfflineHousingActive() ? allOfflineHomes().map((h) => ({
      regionIndex: h.region | 0,
      mapId: h.mapId >>> 0,
      buildingKey: h.buildingKey | 0,
      location: 'Daggerfall',
    })) : []),
    houseHere: () => houseHere,
  });

  host.found(MODELS.dynasty);
  assert.ok(host.family);

  // Sync houses
  host.syncHouses();
  assert.equal(host.family.houses.length, 1);
  assert.equal(host.isFamilyHouse({ mapId: 5000, buildingKey: 202 }), true);
  assert.equal(host.isFamilyHouse({ mapId: 5000, buildingKey: 999 }), false);

  // Save while inside the offline house -> character is parked there
  houseHere = { mapId: 5000, buildingKey: 202 };
  modSaveRecords();
  assert.deepEqual(host.current().parked, { mapId: 5000, buildingKey: 202 });
});

test('LEGACY + OFFLINE HOUSING: heir inherits offline home on death', async () => {
  const f = foundFamily(entity(), { rng: familyRng(1), id: 'fam-inherit', seat: { region: 'Daggerfall', loc: 'Daggerfall', mapId: 5000 } });
  const heir = addChild(f, 1, { rng: familyRng(2) }).person;

  // Founder claims offline home
  const homes = createOfflineHomes({ player: () => entity() });
  await homes.claim({ mapId: 5000, buildingKey: 303, region: 17, price: 12000 });

  syncHouses(f, 1, [{ regionIndex: 17, mapId: 5000, buildingKey: 303, location: 'Daggerfall' }]);
  assert.equal(f.houses.length, 1);
  assert.equal(f.houses[0].by, 1);

  // Founder dies
  recordDeath(f, 1, { at: 200, cause: 'slain', by: 'Bandit' });
  touch(f);

  // Heir checks deeds due
  const due = deedsDue(f, heir);
  assert.equal(due.length, 1);
  assert.equal(due[0].buildingKey, 303);

  // Simulate inheriting via inheritOfflineHome
  const ok = inheritOfflineHome({
    mapId: due[0].mapId,
    buildingKey: due[0].buildingKey,
    region: due[0].regionIndex,
    price: 12000,
  });
  assert.equal(ok, true);
  assert.equal(isOfflineHouseOwned(5000, 303), true);

  // Syncing heir's held houses transfers house to heir
  heir.deedsTaken = ['5000:303'];
  const heirHeld = allOfflineHomes().map((h) => ({
    regionIndex: h.region | 0,
    mapId: h.mapId >>> 0,
    buildingKey: h.buildingKey | 0,
    location: 'Daggerfall',
  }));
  syncHouses(f, heir.id, heirHeld, heir.deedsTaken);

  assert.equal(f.houses.length, 1);
  assert.equal(f.houses[0].by, heir.id);
  assert.equal(f.houses[0].from, 1);
});

test('LEGACY + OFFLINE HOUSING: release/sale removes offline home from family houses', async () => {
  const f = foundFamily(entity(), { rng: familyRng(1), id: 'fam-sale', seat: { region: 'Daggerfall', loc: 'Daggerfall', mapId: 5000 } });
  const homes = createOfflineHomes({ player: () => entity() });
  await homes.claim({ mapId: 5000, buildingKey: 404, region: 17, price: 10000 });

  let held = allOfflineHomes().map((h) => ({
    regionIndex: h.region | 0,
    mapId: h.mapId >>> 0,
    buildingKey: h.buildingKey | 0,
    location: 'Daggerfall',
  }));
  syncHouses(f, 1, held);
  assert.equal(f.houses.length, 1);

  // Sell home
  await homes.release(5000, 404);
  held = allOfflineHomes().map((h) => ({
    regionIndex: h.region | 0,
    mapId: h.mapId >>> 0,
    buildingKey: h.buildingKey | 0,
    location: 'Daggerfall',
  }));
  syncHouses(f, 1, held);
  assert.equal(f.houses.length, 0);
  assert.equal(familyHome(f), null);
});

test('LEGACY + OFFLINE HOUSING: localization strings format correctly in English and Russian', () => {
  try {
    // English
    setLocale('en');
    assert.equal(
      t('legacy.home.noHouseDoor', '', { loc: 'Sentinel' }),
      'Your family owns no house, so its members live among the townsfolk of Sentinel. Buy a house at its front door and they will move in.'
    );
    assert.equal(
      t('legacy.home.noHouseBank', '', { loc: 'Sentinel' }),
      'Your family owns no house, so its members live among the townsfolk of Sentinel. Buy a house at a bank and they will move in.'
    );
    assert.equal(
      t('legacy.home.noHouseNoSeat', ''),
      'Your family owns no house and has no seat yet.'
    );
    assert.match(
      t('features.offlineHousing.note', ''),
      /families of Project Legacy live in them too/
    );

    // Russian
    setLocale('ru');
    assert.equal(
      t('legacy.home.noHouseDoor', '', { loc: 'Сентинела' }),
      'У вашей семьи нет дома, поэтому её члены живут среди горожан Сентинела. Купите дом у его входной двери, и они переедут в него.'
    );
    assert.equal(
      t('legacy.home.noHouseBank', '', { loc: 'Сентинела' }),
      'У вашей семьи нет дома, поэтому её члены живут среди горожан Сентинела. Купите дом в банке, и они переедут в него.'
    );
    assert.equal(
      t('legacy.home.noHouseNoSeat', ''),
      'У вашей семьи нет дома и ещё нет родового гнезда.'
    );
    assert.match(
      t('features.offlineHousing.note', ''),
      /семьи мода Legacy также живут в них/
    );
  } finally {
    setLocale('en');
  }
});

test('LEGACY + OFFLINE HOUSING: House page UI reflects door housing vs bank housing', () => {
  resetFamilyPages();
  const f = foundFamily(entity(), { rng: familyRng(1), id: 'fam-ui', seat: { region: 'Daggerfall', loc: 'Daggerfall', mapId: 5000 } });
  f.houses = [];

  const mockEl = (tag, cls, text) => {
    const node = { tag, cls, text: text || '', children: [], append(...args) { for (const a of args) this.children.push(a); }, setAttribute() {} };
    return node;
  };
  const mockDivider = (t) => mockEl('div', 'divider', t);

  // Case 1: offlineHousing is true -> door prompt
  setPref('offlineHousing', true);
  setFamilyProvider({
    on: () => true,
    family: () => f,
    offlineHousing: () => true,
  });

  const detailDoor = mockEl('div', 'detail');
  drawHousePage(detailDoor, () => {}, { el: mockEl, divider: mockDivider });
  const textDoor = JSON.stringify(detailDoor);
  assert.match(textDoor, /Buy a house at its front door and they will move in/);

  // Case 2: offlineHousing is false -> bank prompt
  setPref('offlineHousing', false);
  setFamilyProvider({
    on: () => true,
    family: () => f,
    offlineHousing: () => false,
  });

  const detailBank = mockEl('div', 'detail');
  drawHousePage(detailBank, () => {}, { el: mockEl, divider: mockDivider });
  const textBank = JSON.stringify(detailBank);
  assert.match(textBank, /Buy a house at a bank and they will move in/);

  setFamilyProvider(null);
});
