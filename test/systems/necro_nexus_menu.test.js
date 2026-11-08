// @ts-check
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  addUndeadMinion,
  clearAllUndeadMinions,
  usedUndeadPoints,
  calculateUndeadCapacity,
  activeUndeadUpkeep,
} from '../../src/systems/necromancy/undeadCapacity.js';
import { NecroConfig } from '../../src/systems/necromancy/necroConfig.js';
import { t, setLocale, patchLocaleTable } from '../../src/systems/textManager.js';

beforeEach(() => {
  clearAllUndeadMinions();
});

test('NexusMenu: activeUndeadUpkeep sums only active raised minions and excludes controlled undead', () => {
  assert.equal(activeUndeadUpkeep(), 0);

  // Raised skeleton (tier 1, slotCost 1, default upkeep 1)
  addUndeadMinion({ id: 'skel1', type: 'skeleton', slotCost: 1, upkeep: 1 });
  // Raised zombie (tier 2, slotCost 2, default upkeep 2)
  addUndeadMinion({ id: 'zomb1', type: 'zombie', slotCost: 2, upkeep: 2 });
  // Controlled mummy (enslaved via Control Undead - 0 upkeep drain)
  addUndeadMinion({ id: 'mum1', type: 'mummy', slotCost: 4, upkeep: 4, controlled: true });

  assert.equal(activeUndeadUpkeep(), 3); // 1 + 2 (controlled excluded)
  assert.equal(usedUndeadPoints(), 3);   // controlled excluded from used capacity points
});

test('NexusMenu: control pool and mana upkeep format correctly in English and Russian', () => {
  // Load Russian entries directly from the actual CSV
  const ruCsv = readFileSync(new URL('../../locales/ru/Port_Strings.csv', import.meta.url), 'utf8');
  const poolMatch = /^necro\.menu\.pool,"?(.*?)"?$/m.exec(ruCsv);
  const upkeepMatch = /^necro\.menu\.upkeep,"?(.*?)"?$/m.exec(ruCsv);

  assert.ok(poolMatch, 'necro.menu.pool must exist in ru CSV');
  assert.ok(upkeepMatch, 'necro.menu.upkeep must exist in ru CSV');

  patchLocaleTable('ru', 'Port_Strings', [
    ['necro.menu.pool', poolMatch[1]],
    ['necro.menu.upkeep', upkeepMatch[1]],
  ]);

  const player = {
    stats: { intelligence: 60, willpower: 60 },
    skills: { Mysticism: 50 },
  };

  addUndeadMinion({ id: 'skel1', type: 'skeleton', slotCost: 1, upkeep: 1 });
  addUndeadMinion({ id: 'zomb1', type: 'zombie', slotCost: 2, upkeep: 2 });

  const used = usedUndeadPoints();
  const max = calculateUndeadCapacity(player);
  const upkeep = activeUndeadUpkeep();

  setLocale('en');
  const enPoolLine = t('necro.menu.pool', 'Control Pool: {0}/{1}', used, max);
  const enUpkeepLine = t('necro.menu.upkeep', 'Mana Upkeep: {0} / round', upkeep);

  assert.equal(enPoolLine, `Control Pool: 3/${max}`);
  assert.equal(enUpkeepLine, 'Mana Upkeep: 3 / round');

  setLocale('ru');
  const ruPoolLine = t('necro.menu.pool', 'Control Pool: {0}/{1}', used, max);
  const ruUpkeepLine = t('necro.menu.upkeep', 'Mana Upkeep: {0} / round', upkeep);

  assert.equal(ruPoolLine, `Пул контроля: 3/${max}`);
  assert.equal(ruUpkeepLine, 'Расход маны: 3 в раунд');

  setLocale('en');
});
