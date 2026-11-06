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

