// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CRISIS_EVENTS,
  calculateLocationProsperity,
  getEnemyProvinceName,
  matchLivingCrisisEvent,
  PROSPERITY_TIER,
} from '../../src/systems/living/crisisRegistry.js';
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
    assert.ok(choices.length >= 3, `Event ${evt.id} must offer at least 3 roleplay choices`);
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
  try {
    LivingTamrielConfig.urban = PRESENCE.HIGH;
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
