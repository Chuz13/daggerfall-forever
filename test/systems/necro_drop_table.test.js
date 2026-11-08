// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NECRO_REAGENT_IDX,
  CREATURE_REAGENT_DROPS,
  HUMAN_MAGE_DROPS,
  HUMAN_WARRIOR_DROPS,
  HUMAN_ROGUE_DROPS,
  groupForTemplateIndex,
  getMysticismHarvestMultiplier,
  getCreatureDropPool,
  rollHarvestReagents,
} from '../../src/systems/necromancy/necroDropTable.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import { SKILLS } from '../../src/systems/skills.js';

test('NecroDropTable: getMysticismHarvestMultiplier scales smoothly from 1.0x to 2.0x', () => {
  const player0 = { skills: { [SKILLS.Mysticism]: 0 } };
  assert.equal(getMysticismHarvestMultiplier(player0), 1.0);

  const player50 = { skills: { [SKILLS.Mysticism]: 50 } };
  assert.equal(getMysticismHarvestMultiplier(player50), 1.5);

  const player100 = { skills: { [SKILLS.Mysticism]: 100 } };
  assert.equal(getMysticismHarvestMultiplier(player100), 2.0);

  const emptyPlayer = {};
  assert.equal(getMysticismHarvestMultiplier(emptyPlayer), 1.0);
});

test('NecroDropTable: groupForTemplateIndex maps all alchemical groups accurately', () => {
  assert.equal(groupForTemplateIndex(NECRO_REAGENT_IDX.LichDust), 'CreatureIngredients1');
  assert.equal(groupForTemplateIndex(NECRO_REAGENT_IDX.MummyWrappings), 'CreatureIngredients2');
  assert.equal(groupForTemplateIndex(NECRO_REAGENT_IDX.WereboarsTusk), 'CreatureIngredients3');
  assert.equal(groupForTemplateIndex(NECRO_REAGENT_IDX.SmallTooth), 'MiscellaneousIngredients1');
  assert.equal(groupForTemplateIndex(NECRO_REAGENT_IDX.Sulphur), 'MetalIngredients');
  assert.equal(groupForTemplateIndex(NECRO_REAGENT_IDX.Pearl), 'MiscellaneousIngredients2');
  assert.equal(groupForTemplateIndex(NECRO_REAGENT_IDX.Finger), 'QuestItems');
});

test('NecroDropTable: getCreatureDropPool resolves specific monsters and human classes', () => {
  // 1. Undead
  const lichPool = getCreatureDropPool({ mobileType: MOBILE_TYPES.Lich });
  assert.ok(lichPool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.LichDust));
  assert.ok(lichPool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.WraithEssence));

  const ancientLichPool = getCreatureDropPool({ mobileType: MOBILE_TYPES.AncientLich });
  assert.ok(ancientLichPool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.LichDust && e.chance === 1.0));

  const skelPool = getCreatureDropPool({ mobileType: MOBILE_TYPES.SkeletalWarrior });
  assert.ok(skelPool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.SmallTooth));

  // 2. Daedra
  const daedraLordPool = getCreatureDropPool({ mobileType: MOBILE_TYPES.DaedraLord });
  assert.ok(daedraLordPool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.DaedrasHeart && e.chance === 1.0));

  // 3. Human classes
  const magePool = getCreatureDropPool({ mobileType: MOBILE_TYPES.Mage });
  assert.equal(magePool, HUMAN_MAGE_DROPS);
  assert.ok(magePool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.Ectoplasm));

  const warriorPool = getCreatureDropPool({ mobileType: MOBILE_TYPES.Warrior });
  assert.equal(warriorPool, HUMAN_WARRIOR_DROPS);
  assert.ok(warriorPool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.MediumTooth));

  const roguePool = getCreatureDropPool({ mobileType: MOBILE_TYPES.Rogue });
  assert.equal(roguePool, HUMAN_ROGUE_DROPS);
  assert.ok(roguePool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.SnakeVenom));

  // 4. Animals & Beasts
  const spiderPool = getCreatureDropPool({ mobileType: MOBILE_TYPES.Spider });
  assert.ok(spiderPool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.SpidersVenom));

  const werewolfPool = getCreatureDropPool({ mobileType: MOBILE_TYPES.Werewolf });
  assert.ok(werewolfPool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.WerewolfsBlood && e.chance === 1.0));

  // 5. DEX Enemies
  const trollPool = getCreatureDropPool({ mobileType: 270 });
  assert.ok(trollPool.some((e) => e.templateIndex === NECRO_REAGENT_IDX.TrollsBlood && e.chance === 1.0));
});

test('NecroDropTable: rollHarvestReagents mints valid inventory items with Mysticism bonuses', () => {
  const masterNecro = {
    skills: { [SKILLS.Mysticism]: 100 },
  };

  const corpse = {
    mobileType: MOBILE_TYPES.AncientLich,
    entityType: 'undead',
  };

  const roll = rollHarvestReagents(corpse, masterNecro);
  assert.equal(roll.multiplier, 2.0, 'Multiplier at Mysticism 100 must be 2.0x');
  assert.ok(roll.items.length >= 2, 'Ancient Lich must yield at least Lich Dust and Wraith Essence');

  for (const it of roll.items) {
    assert.ok(it.templateIndex > 0);
    assert.ok(it.name);
    assert.ok(it.group);
    assert.ok(it.stackCount >= 1);
  }

  assert.ok(roll.yields.length === roll.items.length);
});
