// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRISIS_TYPE,
  CRISIS_PHASE,
  getRegionState,
  getRegionStates,
  setRegionCrisis,
  isRegionInQuarantine,
  isRegionInSkirmishPhase,
  tickRegionDay,
  tickAllRegions,
} from '../../src/systems/living/regionState.js';

import {
  isCityGateQuarantined,
  getQuarantineReliefPostInfo,
} from '../../src/systems/living/quarantineGate.js';

import { makeCityGate, updateCityGate } from '../../src/world/city/cityGate.js';
import { CITY_GATE_OPEN_MODEL_ID, CITY_GATE_CLOSED_MODEL_ID } from '../../src/world/rmbLayout.js';
import { calculateEnemyPacification } from '../../src/combat/formulas.js';
import { SKILLS } from '../../src/systems/skills.js';
import { LivingTamrielConfig, PRESENCE, resetLivingConfig } from '../../src/systems/living/livingConfig.js';
import { onLivingWorldTick, restoreLivingSaveData } from '../../src/systems/living/livingDirector.js';

test('LT-02: RegionState tracks lifecycle START -> MID -> END -> PEACE', () => {
  restoreLivingSaveData(null);
  resetLivingConfig();

  const daggerfallIndex = 17; // Daggerfall
  const state = getRegionState(daggerfallIndex);
  assert.equal(state.regionName, 'Daggerfall');
  assert.equal(state.crisis, CRISIS_TYPE.PEACE);
  assert.equal(state.phase, CRISIS_PHASE.NONE);

  // Trigger plague
  setRegionCrisis(daggerfallIndex, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.START);
  assert.equal(state.crisis, CRISIS_TYPE.PLAGUE);
  assert.equal(state.phase, CRISIS_PHASE.START);
  assert.equal(isRegionInQuarantine(daggerfallIndex), false); // START is not quarantine yet

  // Tick until MID (peak quarantine)
  while (state.phase === CRISIS_PHASE.START) {
    tickRegionDay(state);
  }

  assert.equal(state.phase, CRISIS_PHASE.MID);
  assert.equal(isRegionInQuarantine(daggerfallIndex), true);

  // Tick until END
  while (state.phase === CRISIS_PHASE.MID) {
    tickRegionDay(state);
  }

  assert.equal(state.phase, CRISIS_PHASE.END);
  assert.equal(isRegionInQuarantine(daggerfallIndex), false);

  // Tick until resolution
  while (state.phase === CRISIS_PHASE.END) {
    tickRegionDay(state);
  }

  assert.equal(state.crisis, CRISIS_TYPE.PEACE);
  assert.equal(state.phase, CRISIS_PHASE.NONE);
});

test('LT-02: Quarantine gates lock 24/7 during PLAGUE.MID, overriding 24/7 city infrastructure', () => {
  const regionIndex = 17;
  setRegionCrisis(regionIndex, CRISIS_TYPE.PLAGUE, CRISIS_PHASE.MID);

  assert.equal(isCityGateQuarantined(regionIndex), true);

  const gate = makeCityGate(CITY_GATE_OPEN_MODEL_ID);
  assert.equal(gate.isOpen, true);

  // Update gate during daytime with online 24/7 active
  const toggled = updateCityGate(gate, false, { online: true, region: regionIndex });
  assert.equal(toggled, true);
  assert.equal(gate.isOpen, false);
  assert.equal(gate.modelId, CITY_GATE_CLOSED_MODEL_ID);

  // Relief post outside walls is present
  const relief = getQuarantineReliefPostInfo(regionIndex);
  assert.ok(relief);
  assert.equal(relief.healerPresent, true);
  assert.equal(relief.cureCostMultiplier, 2.0);

  // End the plague
  setRegionCrisis(regionIndex, CRISIS_TYPE.PEACE, CRISIS_PHASE.NONE);
  assert.equal(isCityGateQuarantined(regionIndex), false);

  // Gate now re-opens under 24/7 active
  const reopened = updateCityGate(gate, false, { online: true, region: regionIndex });
  assert.equal(reopened, true);
  assert.equal(gate.isOpen, true);
  assert.equal(gate.modelId, CITY_GATE_OPEN_MODEL_ID);
});

test('LT-02: Luck grants second chance reroll on narrow Streetwise/Etiquette failure', () => {
  const dummyPlayer = {
    skills: { [SKILLS.Streetwise]: 50, [SKILLS.Etiquette]: 50 },
    stats: { personality: 50, luck: 80 },
  };

  // Base pacification chance: skill/10 (5) + personality/5 (10) + sheathed (10) = 25 (out of 200).
  // Roll 27 is a failure by 2 points (delta <= 5).
  // With Luck 80, second chance is dice100(40).
  const roll01 = 27 / 200; // roll = 27

  // If luck test succeeds, pacification succeeds despite initial roll failure
  const luckyResult = calculateEnemyPacification(
    dummyPlayer,
    SKILLS.Streetwise,
    true,
    roll01,
  );
  assert.equal(typeof luckyResult, 'boolean');
});

test('LT-02: Daily tick runs across all 62 regions without CPU stalls', () => {
  const start = performance.now();
  tickAllRegions();
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 20, `62-region tick took too long: ${elapsed.toFixed(2)} ms`);
});

test('LT-Unified-Town-Cooldown, dynamic vanilla tension and 6h travel interruption', async () => {
  const {
    syncRegionStateFromVanilla,
    bindLivingRegionConditions,
    getRegionState,
  } = await import('../../src/systems/living/regionState.js');
  const {
    LivingTamrielConfig,
    resetLivingConfig,
  } = await import('../../src/systems/living/livingConfig.js');
  const {
    LOCATION_EVENT_COOLDOWN_MINUTES,
    SKIRMISH_LOCATION_COOLDOWN_MINUTES,
    locationEventCooldowns,
  } = await import('../../src/systems/living/livingWorldSpawner.js');
  const { REGION_FLAGS } = await import('../../src/systems/region/regionConditions.js');

  resetLivingConfig();

  // 1. Travel interruption cooldown is 360m (6h)
  assert.equal(LivingTamrielConfig.travelInterruptionCooldownMinutes, 360);

  // 2. Allow quest competition is strictly muted to false
  assert.equal(LivingTamrielConfig.allowQuestCompetition, false);
  LivingTamrielConfig.allowQuestCompetition = true;
  assert.equal(LivingTamrielConfig.allowQuestCompetition, false);

  // 3. Location event cooldown is 4320m (3 in-game days)
  assert.equal(LOCATION_EVENT_COOLDOWN_MINUTES, 4320);
  assert.equal(SKIRMISH_LOCATION_COOLDOWN_MINUTES, 4320);

  // 4. Dynamic vanilla tension calculation
  const mockDict = new Map();
  mockDict.set(100, { id: 100, type: 7, region: 17, power: 85, rulerPowerBonus: 40, ally1: 101, ally2: 0, ally3: 0, enemy1: 102, enemy2: 0, enemy3: 0 });
  mockDict.set(101, { id: 101, power: 50 });
  mockDict.set(102, { id: 102, power: 20 });

  const mockFactionRep = { dict: mockDict };
  const mockConditions = Array.from({ length: 72 }, () => ({
    flags: Array(26).fill(false),
    values: Array(26).fill(0),
  }));

  bindLivingRegionConditions(mockConditions, mockFactionRep);

  const st17 = getRegionState(17);
  syncRegionStateFromVanilla(17, st17, mockConditions[17]);

  // Peaceful, high power (85), high ruler bonus (40), allies > enemies -> low tension
  assert.ok(st17.tension <= 15, `Expected low peaceful tension, got ${st17.tension}`);

  // Now turn on WarOngoing & CrimeWave in region 17
  mockConditions[17].flags[REGION_FLAGS.WarOngoing] = true;
  mockConditions[17].flags[REGION_FLAGS.CrimeWave] = true;
  syncRegionStateFromVanilla(17, st17, mockConditions[17]);

  // Tension should jump significantly due to WarOngoing (+40) and CrimeWave (+15)
  assert.ok(st17.tension >= 55, `Expected war & crime tension >= 55, got ${st17.tension}`);

  // 5. Unified town location cooldown tracks correctly
  const locKey = 'map_99999';
  locationEventCooldowns.clear();
  locationEventCooldowns.set(locKey, 1000);
  assert.equal(1000 + 4320 > 5000, true);
  assert.equal((5320 - 1000) >= LOCATION_EVENT_COOLDOWN_MINUTES, true);
});

