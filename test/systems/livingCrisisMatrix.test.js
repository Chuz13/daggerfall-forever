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
import {
  setRegionCrisis,
  getRegionState,
  bindLivingRegionConditions,
  applyPlayerCrisisImpact,
  CRISIS_TYPE,
  CRISIS_PHASE,
} from '../../src/systems/living/regionState.js';
import {
  REGION_FLAGS,
  createRegionConditions,
  turnOnConditionFlag,
} from '../../src/systems/region/regionConditions.js';
import { completeExtendedRegionConditions } from '../../src/systems/region/regionPower.js';
import { FACTION_TYPES } from '../../src/formats/factionFile.js';
import { THE_THIEVES_GUILD } from '../../src/systems/faction/factionRep.js';
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

test('LT-Stability: Heightmap streaming guard, prop snap fallback and canonical gold', async () => {
  const { buildLivingSiteBlueprint, LIVING_SITE_KINDS } = await import('../../src/systems/living/livingWorldSpawner.js');
  const { snapPropToGround } = await import('../../src/systems/living/campInjector.js');
  const { isGoldPieces, goldStack } = await import('../../src/systems/inventory.js');

  // 1. Terrain streaming delay (-Infinity) must reject blueprint creation to avoid floating props
  const unstreamedHeight = () => -Infinity;
  const bpUnstreamed = buildLivingSiteBlueprint({
    kind: LIVING_SITE_KINDS.URBAN_SKIRMISH,
    centerX: 100,
    centerZ: 200,
    heightAt: unstreamedHeight,
    regionIndex: 17,
  });
  assert.equal(bpUnstreamed, null, 'Blueprint must return null when terrain height is non-finite');

  // 2. snapPropToGround uses fallbackY when heightSampler is non-finite
  const snappedFallback = snapPropToGround(() => -Infinity, 50, 50, 0.02, -65.5);
  assert.equal(snappedFallback, -65.48, 'Should snap to fallbackY + offset rather than 0');

  // 3. Canonical gold stack validation
  const gold = goldStack(25);
  assert.equal(isGoldPieces(gold), true, 'Gold piece item must be recognized as valid currency');
  assert.equal(gold.group, 'Currency');
  assert.equal(gold.templateIndex, 276);
  assert.equal(gold.stackCount, 25);
});

test('LT-Vanilla-Bridge: All 26 vanilla REGION_FLAGS (0..25) have >= 2 events in CRISIS_EVENTS', () => {
  for (const [flagName, flagId] of Object.entries(REGION_FLAGS)) {
    if (flagId > 25) continue; // 26..29 are DFU's unused Condition26..29 slots
    const matching = CRISIS_EVENTS.filter(
      (evt) => Array.isArray(evt.regionFlags) && evt.regionFlags.includes(flagId),
    );
    assert.ok(
      matching.length >= 2,
      `Expected >= 2 events mapped to REGION_FLAGS.${flagName} (${flagId}), found ${matching.length}`,
    );
  }
});

test('LT-Vanilla-Bridge: RegionState derives WAR/PLAGUE/FAMINE/CIVIL_STRIFE & phases from vanilla regionConditions and nudges endurance counters + faction power', () => {
  const rc = createRegionConditions();
  const mockStore = {
    dict: new Map([
      [1018, { id: 1018, type: FACTION_TYPES.Province, region: 17, power: 50, enemy1: 1020, ruler: 1, rulerPowerBonus: 10 }],
      [1020, { id: 1020, type: FACTION_TYPES.Province, region: 19, power: 50, enemy1: 1018, ruler: 2, rulerPowerBonus: 10 }],
    ]),
  };
  try {
    bindLivingRegionConditions(rc, mockStore);

    // 1. Activate WarBeginning in region 17 (Daggerfall) with counter 2
    turnOnConditionFlag(rc, 17, REGION_FLAGS.WarBeginning);
    rc[17].values[REGION_FLAGS.WarBeginning] = 2;

    let st = getRegionState(17);
    assert.equal(st.crisis, CRISIS_TYPE.WAR);
    assert.equal(st.phase, CRISIS_PHASE.START);
    assert.equal(st.phaseDaysRemaining, 2);

    // 2. First player victory on defenders side decrements counter from 2 -> 1 (does NOT skip stage yet!)
    const hit1 = applyPlayerCrisisImpact(17, {
      stance: 'defenders',
      degree: 'SUCCESS',
      category: 'WAR',
    });
    assert.equal(hit1.flagId, REGION_FLAGS.WarBeginning);
    assert.equal(hit1.newValue, 1);
    assert.equal(hit1.transitionedTo, null);
    assert.equal(rc[17].flags[REGION_FLAGS.WarBeginning], true);
    assert.equal(mockStore.dict.get(1018).power, 51, 'Province faction power must nudge +1');

    // 3. Second player victory decrements counter from 1 -> 0 and transitions WarBeginning -> WarOngoing!
    const hit2 = applyPlayerCrisisImpact(17, {
      stance: 'peace',
      degree: 'SUCCESS',
      category: 'WAR',
    });
    assert.equal(hit2.transitionedTo, REGION_FLAGS.WarOngoing);
    assert.equal(rc[17].flags[REGION_FLAGS.WarBeginning], false);
    assert.equal(rc[17].flags[REGION_FLAGS.WarOngoing], true);
    st = getRegionState(17);
    assert.equal(st.crisis, CRISIS_TYPE.WAR);
    assert.equal(st.phase, CRISIS_PHASE.MID);

    // 4. Attacker victory prolongs counter (+1) and reduces province power (-1) while boosting enemy (+1)
    const beforeVal = rc[17].values[REGION_FLAGS.WarOngoing];
    const hit3 = applyPlayerCrisisImpact(17, {
      stance: 'attackers',
      degree: 'SUCCESS',
      category: 'WAR',
    });
    assert.equal(hit3.newValue, beforeVal + 1);
    assert.equal(mockStore.dict.get(1018).power, 51, 'Province power nudged -1 from 52 to 51');
    assert.equal(mockStore.dict.get(1020).power, 51, 'Enemy province power nudged +1');
  } finally {
    bindLivingRegionConditions(null, null);
  }
});

test('LT-Vanilla-Bridge: Extended vanilla simulation handles BadHarvest ruler gate, WitchBurnings decay, TGM lifecycle, and MadWizard lifecycle', () => {
  const rc = createRegionConditions();
  const store = {
    dict: new Map([
      // Region 0 (Alik'r): weak ruler (rulerBonus 5 + power/5 = 11 < roll 40) -> BadHarvest escalates to FamineBeginning
      [1001, { id: 1001, type: FACTION_TYPES.Province, region: 0, power: 30, ruler: 1, rulerPowerBonus: 5 }],
      // Region 1 (Dragontail): strong ruler (rulerBonus 60 + power/5 = 76 >= roll 40) -> BadHarvest resolves without Famine!
      [1002, { id: 1002, type: FACTION_TYPES.Province, region: 1, power: 80, ruler: 2, rulerPowerBonus: 60 }],
      // Region 2: TGMInJail -> TGMSetFree
      [1003, { id: 1003, type: FACTION_TYPES.Province, region: 2, power: 30, ruler: 3, rulerPowerBonus: 20 }],
      // Region 3: MadWizardNearby -> MadWizardDies
      [1004, { id: 1004, type: FACTION_TYPES.Province, region: 3, power: 70, ruler: 4, rulerPowerBonus: 40 }],
      // Region 62 (Morrowind): WitchBurnings decay
      [1062, { id: 1062, type: FACTION_TYPES.Province, region: 62, power: 65, ruler: 5, rulerPowerBonus: 40 }],
      [THE_THIEVES_GUILD, { id: THE_THIEVES_GUILD, type: FACTION_TYPES.Group, region: -1, power: 80 }],
    ]),
  };

  // Seed BadHarvest in Region 0 and Region 1
  turnOnConditionFlag(rc, 0, REGION_FLAGS.BadHarvest);
  turnOnConditionFlag(rc, 1, REGION_FLAGS.BadHarvest);

  // Seed WitchBurnings in Beyond-the-Bay Region 62 (Morrowind)
  turnOnConditionFlag(rc, 62, REGION_FLAGS.WitchBurnings);

  // Seed TGMInJail in Region 2, and MadWizardNearby in Region 3
  turnOnConditionFlag(rc, 2, REGION_FLAGS.TGMInJail);
  turnOnConditionFlag(rc, 3, REGION_FLAGS.MadWizardNearby);

  completeExtendedRegionConditions(store, rc, { rolls: () => 0.35 });

  // Weak ruler in Region 0 -> BadHarvest turned into FamineBeginning!
  assert.equal(rc[0].flags[REGION_FLAGS.BadHarvest], false);
  assert.equal(rc[0].flags[REGION_FLAGS.FamineBeginning], true);

  // Strong ruler in Region 1 -> BadHarvest cleared without FamineBeginning!
  assert.equal(rc[1].flags[REGION_FLAGS.BadHarvest], false);
  assert.equal(rc[1].flags[REGION_FLAGS.FamineBeginning], false);

  // WitchBurnings in Region 62 decayed and turned off!
  assert.equal(rc[62].flags[REGION_FLAGS.WitchBurnings], false);

  // TGMInJail in Region 2 transitioned to TGMSetFree (since Thieves Guild power 80 > roll 36)!
  assert.equal(rc[2].flags[REGION_FLAGS.TGMInJail], false);
  assert.equal(rc[2].flags[REGION_FLAGS.TGMSetFree], true);

  // MadWizardNearby in Region 3 transitioned to MadWizardDies!
  assert.equal(rc[3].flags[REGION_FLAGS.MadWizardNearby], false);
  assert.equal(rc[3].flags[REGION_FLAGS.MadWizardDies], true);
});
