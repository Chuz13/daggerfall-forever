// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRISIS_EVENTS,
  calculateLocationProsperity,
  getEnemyProvinceName,
  matchLivingCrisisEvent,
  resolveCrisisChoiceCheck,
  PROSPERITY_TIER,
} from '../../src/systems/living/crisisRegistry.js';
import {
  LIVING_ROLL_DEGREE,
  LIVING_FORMULAS,
  resolveLivingRoll,
  configureLivingFormula,
  resetLivingFormulas,
} from '../../src/systems/living/livingRolls.js';
import { SKILLS } from '../../src/systems/skills.js';
import { MOBILE_TYPES } from '../../src/characters/mobile/mobileTypes.js';
import {
  planUrbanSkirmish,
  shouldSpawnUrbanSkirmish,
  isSkirmishBlowCriminal,
  SKIRMISH_TEAMS,
} from '../../src/systems/living/urbanDirector.js';
import { setRegionCrisis, CRISIS_TYPE, CRISIS_PHASE } from '../../src/systems/living/regionState.js';
import { REGION_FLAGS } from '../../src/systems/region/regionConditions.js';
import { LivingTamrielConfig, PRESENCE } from '../../src/systems/living/livingConfig.js';
import { executeConsoleCommand } from '../../src/systems/consoleCommands.js';

test('LT-39-Matrix: Exactly 39 crisis and exploration encounters defined with valid pools', () => {
  assert.equal(CRISIS_EVENTS.length, 39, 'Must define exactly 39 core events');

  const validMobileIds = new Set(Object.values(MOBILE_TYPES));

  for (const evt of CRISIS_EVENTS) {
    assert.ok(evt.id, 'Event must have an ID');
    assert.ok(evt.name, `Event ${evt.id} must have a name`);
    assert.ok(Array.isArray(evt.defendersPool) && evt.defendersPool.length > 0, `Event ${evt.id} defenders pool`);
    assert.ok(Array.isArray(evt.attackersPool) && evt.attackersPool.length > 0, `Event ${evt.id} attackers pool`);

    for (const mob of evt.defendersPool) {
      assert.ok(validMobileIds.has(mob), `Invalid defender mobile ID ${mob} in ${evt.id}`);
    }
    for (const mob of evt.attackersPool) {
      assert.ok(validMobileIds.has(mob), `Invalid attacker mobile ID ${mob} in ${evt.id}`);
    }

    const factions = evt.getFactionNames(17, 'Sentinel');
    assert.ok(factions.f1 && factions.f2, `Event ${evt.id} must generate named factions`);

    const choices = evt.getChoices(factions.f1, factions.f2);
    assert.equal(choices.length, 4, `Event ${evt.id} must offer exactly 4 roleplay choices`);
    assert.deepEqual(
      choices.map((c) => c.stance),
      ['defenders', 'attackers', 'neutral', 'peace'],
      `Event ${evt.id} choices must follow standard order [defenders, attackers, neutral, peace]`,
    );
  }
});

test('LT-39-Matrix: Location prosperity calculation matches building quality (1..20)', () => {
  const lowLoc = {
    exterior: {
      buildings: [{ quality: 3 }, { quality: 5 }, { quality: 4 }],
    },
  };
  assert.equal(calculateLocationProsperity(lowLoc), PROSPERITY_TIER.LOW);

  const midLoc = {
    exterior: {
      buildings: [{ quality: 8 }, { quality: 10 }, { quality: 12 }],
    },
  };
  assert.equal(calculateLocationProsperity(midLoc), PROSPERITY_TIER.MID);

  const highLoc = {
    exterior: {
      buildings: [{ quality: 15 }, { quality: 18 }, { quality: 16 }],
    },
  };
  assert.equal(calculateLocationProsperity(highLoc), PROSPERITY_TIER.HIGH);

  assert.equal(calculateLocationProsperity(null), PROSPERITY_TIER.MID);
});

test('LT-39-Matrix: Event matching respects active crisis and regional conditions', () => {
  setRegionCrisis(20, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);

  const warEvt = matchLivingCrisisEvent({
    regionIndex: 20,
    locationType: 0, // TownCity
    rng: () => 0.1,
  });
  assert.ok(warEvt, 'Must match a war event');
  assert.equal(warEvt.category, 'WAR');

  // Test regional condition flag (e.g. WitchBurnings)
  const condFlags = [];
  condFlags[REGION_FLAGS.WitchBurnings] = true;
  const mockPlayer = {
    regionConditions: [
      null,
      { flags: condFlags },
    ],
  };

  const witchEvt = matchLivingCrisisEvent({
    regionIndex: 1,
    locationType: 13, // Coven
    playerEntity: mockPlayer,
    rng: () => 0.05,
  });
  assert.ok(witchEvt);
  assert.equal(witchEvt.category, 'OCCULT');
});

test('LT-39-Matrix: planUrbanSkirmish dynamically scales with prosperity and density', () => {
  const orig = LivingTamrielConfig.urban;
  const origScale = LivingTamrielConfig.encounterScale;
  try {
    LivingTamrielConfig.urban = PRESENCE.HIGH;
    LivingTamrielConfig.encounterScale = 'mid';
    setRegionCrisis(17, CRISIS_TYPE.WAR, CRISIS_PHASE.MID);

    const highLoc = {
      exterior: {
        buildings: [{ quality: 18 }, { quality: 20 }],
      },
    };

    const plan = planUrbanSkirmish({
      centerX: 100,
      centerZ: 100,
      heightSampler: () => 0,
      regionIndex: 17,
      locationType: 0,
      dfLocation: highLoc,
    });

    assert.ok(plan);
    assert.ok(plan.event);
    assert.ok(plan.faction1Name);
    assert.ok(plan.faction2Name);
    assert.ok(plan.guards.length >= 3, 'High density/prosperity must spawn more guards');
    assert.ok(plan.rebels.length >= 3, 'High density must spawn attackers');

    // Verify Faction Neutrality Shield
    assert.equal(isSkirmishBlowCriminal('PLAYER', SKIRMISH_TEAMS.CITY_WATCH, true), true);
    assert.equal(isSkirmishBlowCriminal('PLAYER', SKIRMISH_TEAMS.INSURGENTS, true), false);
    assert.equal(isSkirmishBlowCriminal('SkirmishLaw', 'SkirmishRebels', false), false);
  } finally {
    LivingTamrielConfig.urban = orig;
    LivingTamrielConfig.encounterScale = origScale;
  }
});

test('LT-39-Matrix: console commands "crisis tp" and "telecrisis" are registered and functional', async () => {
  // Test command syntax and help
  const out = await executeConsoleCommand('crisis');
  assert.ok(out.includes('Region 17'));

  // Test telecrisis without world mode (returns friendly error or teleports)
  const tpOut = await executeConsoleCommand('telecrisis', ['war']);
  assert.ok(tpOut.includes('only available in world mode') || tpOut.includes('Crisis TP'));

  const tpSub = await executeConsoleCommand('crisis', ['tp', 'plague']);
  assert.ok(tpSub.includes('only available in world mode') || tpSub.includes('Crisis TP'));
});

test('LT-Typed-Rolls: Editable formula registry resolves graded outcomes (TRIUMPH, SUCCESS, PARTIAL, FAILURE, CRITICAL_FAILURE)', () => {
  resetLivingFormulas();
  assert.ok(LIVING_FORMULAS.SOCIAL_DIPLOMACY);
  assert.ok(LIVING_FORMULAS.CRISIS_SPECIALIST);
  assert.ok(LIVING_FORMULAS.STREETWISE_LEVERAGE);

  const player = {
    level: 8,
    skills: { [SKILLS.Medical]: 50, [SKILLS.Etiquette]: 55 },
    stats: { Intelligence: 60, Personality: 60, Luck: 55 },
    regionalReputations: { 17: 10 },
  };

  const medicalChoice = {
    text: 'Check water for poison (Medical)',
    stance: 'test_water',
    skillCheck: { skill: SKILLS.Medical, target: 45 },
    repF1: 8,
    xp: 100,
  };

  // 1. High roll -> TRIUMPH (bonus XP 1.5x and bonus gold/rep)
  const triumphRes = resolveCrisisChoiceCheck(player, medicalChoice, {
    regionIndex: 17,
    rng: () => 0.98,
  });
  assert.equal(triumphRes.degree, LIVING_ROLL_DEGREE.TRIUMPH);
  assert.equal(triumphRes.passed, true);
  assert.equal(triumphRes.xpAwarded, 150);
  assert.ok(triumphRes.goldReward >= 50);

  // 2. Moderate roll -> SUCCESS
  const successRes = resolveCrisisChoiceCheck(player, medicalChoice, {
    regionIndex: 17,
    rng: () => 0.35,
  });
  assert.equal(successRes.degree, LIVING_ROLL_DEGREE.SUCCESS);
  assert.equal(successRes.passed, true);
  assert.equal(successRes.xpAwarded, 100);

  // 3. Narrow miss on weaker character -> PARTIAL (compromise, no hostility!)
  const novicePlayer = {
    level: 2,
    skills: { [SKILLS.Medical]: 30 },
    stats: { Intelligence: 45, Luck: 50 },
  };
  const partialRes = resolveCrisisChoiceCheck(novicePlayer, medicalChoice, {
    regionIndex: 17,
    rng: () => 0.45,
  });
  assert.equal(partialRes.degree, LIVING_ROLL_DEGREE.PARTIAL);
  assert.equal(partialRes.passed, true);
  assert.equal(partialRes.hostileToPlayer, false);
  assert.ok(partialRes.fatigueCost > 0);

  // 4. Catastrophic roll (nat 1) -> CRITICAL_FAILURE (hostile escalation)
  const critFailRes = resolveCrisisChoiceCheck(novicePlayer, medicalChoice, {
    regionIndex: 17,
    rng: () => 0.01,
  });
  assert.equal(critFailRes.degree, LIVING_ROLL_DEGREE.CRITICAL_FAILURE);
  assert.equal(critFailRes.passed, false);
  assert.equal(critFailRes.hostileToPlayer, true);

  // 5. Formula customization via configureLivingFormula
  configureLivingFormula('CRISIS_SPECIALIST', { skillWeight: 2.0 });
  const boosted = resolveLivingRoll({
    formulaId: 'CRISIS_SPECIALIST',
    playerEntity: novicePlayer,
    skillId: SKILLS.Medical,
    difficulty: 45,
    rng: () => 0.1,
  });
  assert.equal(boosted.cleanSuccess, true, 'Boosted skillWeight turns low roll into clean success');
  resetLivingFormulas();

  // 6. Gold Shortage validation: impoverished player cannot execute paid choices
  const paidChoice = {
    text: 'Bribe the officer (200 gold)',
    stance: 'bribe',
    goldCost: 200,
    xp: 50,
  };
  const brokePlayer = { goldPieces: 0 };
  const brokeRes = resolveCrisisChoiceCheck(brokePlayer, paidChoice, { regionIndex: 17 });
  assert.equal(brokeRes.passed, false, 'Choice must fail if player lacks gold');
  assert.equal(brokeRes.goldShortage, true, 'Choice must report goldShortage');
  assert.equal(brokeRes.xpAwarded, 0, 'No XP awarded on gold shortage');

  const wealthyPlayer = { goldPieces: 500 };
  const wealthyRes = resolveCrisisChoiceCheck(wealthyPlayer, paidChoice, { regionIndex: 17 });
  assert.equal(wealthyRes.passed, true, 'Choice must succeed if player has sufficient gold');
  assert.equal(wealthyRes.goldCost > 0, true);
});
