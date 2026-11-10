import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statTooltip,
  statName,
  skillTooltip,
  skillDescription,
  SKILL_GOVERNING_STAT,
  advDisCost,
  advDisCostRange,
  advDisTooltip,
} from '../../src/systems/chargenTooltips.js';
import { SKILLS, SKILL_COUNT } from '../../src/systems/skills.js';
import { STAT_KEYS_ORDER } from '../../src/systems/statMods.js';
import { ADVANTAGE_KEYS, DISADVANTAGE_KEYS, secondaryListFor } from '../../src/systems/specialAdvantages.js';

test('chargenTooltips: all 8 attributes generate complete tooltips with formulas', () => {
  assert.equal(STAT_KEYS_ORDER.length, 8);
  for (const k of STAT_KEYS_ORDER) {
    const name = statName(k);
    assert.ok(name.length > 0, `statName for ${k}`);
    const tip = statTooltip(k, 60, { spellMultiplier: 1.5 });
    assert.ok(tip.length > 10, `statTooltip for ${k}`);
  }

  // Check specific formulas in Strength tooltip
  const strTip = statTooltip('strength', 60);
  assert.ok(strTip.includes('+2'), 'STR 60 should have +2 damage mod');
  assert.ok(strTip.includes('90 kg'), 'STR 60 should have 90 kg max carry');
  assert.ok(strTip.includes('65'), 'STR 60 next threshold should be 65');

  // Intelligence
  const intTip = statTooltip('intelligence', 60, { spellMultiplier: 2.0 });
  assert.ok(intTip.includes('120'), 'INT 60 at mult 2.0 should have 120 SP');

  // Willpower
  const wilTip = statTooltip('willpower', 70);
  assert.ok(wilTip.includes('+7%'), 'WIL 70 should have +7% magic resist');

  // Agility
  const agiTip = statTooltip('agility', 60);
  assert.ok(agiTip.includes('+1%'), 'AGI 60 should have +1% to hit');

  // Endurance
  const endTip = statTooltip('endurance', 60);
  assert.ok(endTip.includes('+1 HP'), 'END 60 should have +1 HP per level');
  assert.ok(endTip.includes('+1%'), 'END 60 should have +1% heal rate');
});

test('chargenTooltips: all 35 skills have governing stats, descriptions, and tooltips', () => {
  assert.equal(SKILL_COUNT, 35);
  for (let id = 0; id < SKILL_COUNT; id++) {
    const gov = SKILL_GOVERNING_STAT[id];
    assert.ok(gov, `Skill ${id} has governing stat`);
    assert.ok(STAT_KEYS_ORDER.includes(gov), `Governing stat ${gov} is valid attribute`);

    const desc = skillDescription(id);
    assert.ok(desc.length > 5, `Skill ${id} has description`);

    const tip = skillTooltip(id, 50, { group: 'primary' });
    assert.ok(tip.includes(desc), `Skill ${id} tooltip contains description`);
    assert.ok(tip.includes(statName(gov)), `Skill ${id} tooltip contains governing stat name`);
    assert.ok(tip.includes('Primary'), `Skill ${id} tooltip contains group role`);
  }

  // Formula checks: Hand to Hand
  const h2h = skillTooltip(SKILLS.HandToHand, 50);
  assert.ok(h2h.includes('6–11'), 'H2H at 50% should show 6-11 damage');

  // Formula checks: Critical Strike
  const crit = skillTooltip(SKILLS.CriticalStrike, 45);
  assert.ok(crit.includes('45%'), 'Crit strike should show 45%');
  assert.ok(crit.includes('+4%'), 'Crit strike at 45% should show +4% to hit');

  // Formula checks: Backstabbing
  const bs = skillTooltip(SKILLS.Backstabbing, 30);
  assert.ok(bs.includes('3x'), 'Backstabbing should mention 3x');

  // Formula checks: Magic school
  const dest = skillTooltip(SKILLS.Destruction, 50);
  assert.ok(dest.includes('-40% SP'), 'Destruction at 50% should show spell discount');
});

test('chargenTooltips: special advantages and disadvantages costs and tooltips', () => {
  // Fixed costs
  assert.equal(advDisCost('immunity', 'toMagic'), '+10 pts');
  assert.equal(advDisCost('acuteHearing'), '+1 pt');
  assert.equal(advDisCost('criticalWeakness', 'toFrost'), '-14 pts');
  assert.equal(advDisCost('inabilityToRegen'), '-14 pts');

  // Cost ranges
  assert.equal(advDisCostRange('increasedMagery'), '+2..+10 pts');
  assert.equal(advDisCostRange('forbiddenMaterial'), '-10..-1 pts');
  assert.equal(advDisCostRange('acuteHearing'), '+1 pt');

  // Tooltips for every advantage & disadvantage
  for (const adv of ADVANTAGE_KEYS) {
    const tip = advDisTooltip(adv);
    assert.ok(tip.length > 10, `Advantage tooltip for ${adv}`);
    const secList = secondaryListFor(adv);
    if (secList?.length) {
      const secTip = advDisTooltip(adv, secList[0]);
      assert.ok(secTip.length > 10, `Advantage secondary tooltip for ${adv}.${secList[0]}`);
      assert.ok(secTip.includes('Difficulty Dagger:'), `Secondary tooltip includes dagger impact`);
    }
  }

  for (const dis of DISADVANTAGE_KEYS) {
    const tip = advDisTooltip(dis);
    assert.ok(tip.length > 10, `Disadvantage tooltip for ${dis}`);
    const secList = secondaryListFor(dis);
    if (secList?.length) {
      const secTip = advDisTooltip(dis, secList[0]);
      assert.ok(secTip.length > 10, `Disadvantage secondary tooltip for ${dis}.${secList[0]}`);
      assert.ok(secTip.includes('Difficulty Dagger:'), `Secondary tooltip includes dagger impact`);
    }
  }
});
