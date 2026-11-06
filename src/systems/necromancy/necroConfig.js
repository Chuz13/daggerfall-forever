// @ts-check
// NECRO-CONFIG: In-game configuration, preferences, and modular tunables
// for the Dark Arts, Necromancy, and Lichdom systems in DFF.
//
// Connected to uiPrefs / settings store so players can calibrate
// immersion vs convenience.

import { getPref, setPref } from '../uiPrefs.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';

export const CORPSE_REQ_MODES = Object.freeze({
  PHYSICAL: 'physical',
  ABSTRACT: 'abstract',
});

export const SOCIAL_LAW_MODES = Object.freeze({
  HARDCORE: 'hardcore', // Guards attack, alarm sounds, severe bounties
  MILD: 'mild',         // Fines, refusal to talk, mild suspicion
  OFF: 'off',           // No reaction (Cheb's style)
});

export const WITCH_HUNTER_MODES = Object.freeze({
  FREQUENT: 'frequent',
  RARE: 'rare',
  OFF: 'off',
});

export const CAP_MODES = Object.freeze({
  STAT_SCALED: 'stat_scaled',
  FIXED: 'fixed',
});

export const PREF_KEYS = Object.freeze({
  ENABLED: 'necro.enabled',
  CORPSE_REQ: 'necro.corpseRequirement',
  SOCIAL_LAW: 'necro.socialLaw',
  UPKEEP: 'necro.minionUpkeep',
  REBELLION: 'necro.minionRebellion',
  WITCH_HUNTER: 'necro.witchHunters',
  CAP_MODE: 'necro.capMode',
  FIXED_CAP: 'necro.fixedCap',
});

export const NecroConfig = Object.freeze({
  get enabled() {
    if (!FORK_FLAGS.ENABLE_NECROMANCY) return false;
    return getPref(PREF_KEYS.ENABLED, true) !== false;
  },
  set enabled(v) {
    setPref(PREF_KEYS.ENABLED, !!v);
  },

  get corpseRequirement() {
    return getPref(PREF_KEYS.CORPSE_REQ, CORPSE_REQ_MODES.PHYSICAL);
  },
  set corpseRequirement(v) {
    if (Object.values(CORPSE_REQ_MODES).includes(v)) {
      setPref(PREF_KEYS.CORPSE_REQ, v);
    }
  },

  get socialLaw() {
    return getPref(PREF_KEYS.SOCIAL_LAW, SOCIAL_LAW_MODES.HARDCORE);
  },
  set socialLaw(v) {
    if (Object.values(SOCIAL_LAW_MODES).includes(v)) {
      setPref(PREF_KEYS.SOCIAL_LAW, v);
    }
  },

  get minionUpkeep() {
    return getPref(PREF_KEYS.UPKEEP, true) !== false;
  },
  set minionUpkeep(v) {
    setPref(PREF_KEYS.UPKEEP, !!v);
  },

  get minionRebellion() {
    return getPref(PREF_KEYS.REBELLION, true) !== false;
  },
  set minionRebellion(v) {
    setPref(PREF_KEYS.REBELLION, !!v);
  },

  get witchHunterFrequency() {
    return getPref(PREF_KEYS.WITCH_HUNTER, WITCH_HUNTER_MODES.FREQUENT);
  },
  set witchHunterFrequency(v) {
    if (Object.values(WITCH_HUNTER_MODES).includes(v)) {
      setPref(PREF_KEYS.WITCH_HUNTER, v);
    }
  },

  get capMode() {
    return getPref(PREF_KEYS.CAP_MODE, CAP_MODES.STAT_SCALED);
  },
  set capMode(v) {
    if (Object.values(CAP_MODES).includes(v)) {
      setPref(PREF_KEYS.CAP_MODE, v);
    }
  },

  get fixedCap() {
    const val = Number(getPref(PREF_KEYS.FIXED_CAP, 4));
    return Number.isFinite(val) && val > 0 ? Math.floor(val) : 4;
  },
  set fixedCap(v) {
    const num = Math.max(1, Math.min(10, Math.floor(Number(v) || 4)));
    setPref(PREF_KEYS.FIXED_CAP, num);
  },
});

/**
 * Resets all necromancy configuration preferences to default.
 */
export function resetNecroConfig() {
  setPref(PREF_KEYS.ENABLED, true);
  setPref(PREF_KEYS.CORPSE_REQ, CORPSE_REQ_MODES.PHYSICAL);
  setPref(PREF_KEYS.SOCIAL_LAW, SOCIAL_LAW_MODES.HARDCORE);
  setPref(PREF_KEYS.UPKEEP, true);
  setPref(PREF_KEYS.REBELLION, true);
  setPref(PREF_KEYS.WITCH_HUNTER, WITCH_HUNTER_MODES.FREQUENT);
  setPref(PREF_KEYS.CAP_MODE, CAP_MODES.STAT_SCALED);
  setPref(PREF_KEYS.FIXED_CAP, 4);
}
