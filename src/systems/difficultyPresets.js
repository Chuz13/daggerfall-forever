// @ts-check
import { FEATURES, resolveControl } from './features.js';

export const DIFFICULTY_PRESET_ROWS = Object.freeze([
  'combat-lethality',
  'regional-risk-zones',
  'hero-threat-scaling',
  'tactical-stagger',
  'tactical-packs',
  'living-mob-traits',
  'living-dungeon-mob-traits',
]);

export const DIFFICULTY_PRESETS = Object.freeze([
  Object.freeze({
    id: 'classic',
    label: 'Classic DFU',
    values: Object.freeze({
      'combat-lethality': 'classic',
      'regional-risk-zones': 'off',
      'hero-threat-scaling': 'classic',
      'tactical-stagger': 'classic',
      'tactical-packs': false,
      'living-mob-traits': 0,
      'living-dungeon-mob-traits': 0,
    }),
  }),
  Object.freeze({
    id: 'balanced',
    label: 'Balanced DFF',
    values: Object.freeze({
      'combat-lethality': 'classic',
      'regional-risk-zones': 'standard',
      'hero-threat-scaling': 'early',
      'tactical-stagger': 'tactical',
      'tactical-packs': true,
      'living-mob-traits': 2,
      'living-dungeon-mob-traits': 2,
    }),
  }),
  Object.freeze({
    id: 'veteran',
    label: 'Veteran',
    values: Object.freeze({
      'combat-lethality': 'sharp',
      'regional-risk-zones': 'standard',
      'hero-threat-scaling': 'early',
      'tactical-stagger': 'tactical',
      'tactical-packs': true,
      'living-mob-traits': 2,
      'living-dungeon-mob-traits': 2,
    }),
  }),
  Object.freeze({
    id: 'hardcore',
    label: 'Hardcore',
    values: Object.freeze({
      'combat-lethality': 'lethal',
      'regional-risk-zones': 'harsh',
      'hero-threat-scaling': 'early',
      'tactical-stagger': 'tactical',
      'tactical-packs': true,
      'living-mob-traits': 3,
      'living-dungeon-mob-traits': 3,
    }),
  }),
]);

/**
 * Reads a row's normalized value for preset matching.
 * @param {string} id
 * @param {(id: string) => any} valueOf
 */
function readPresetValue(id, valueOf) {
  const raw = valueOf(id);
  const f = FEATURES.find((x) => x.id === id);
  const c = resolveControl(f);
  if (typeof c?.readOf === 'function') return c.readOf(raw);
  return raw;
}

/**
 * Returns the active difficulty preset matching all 7 modular rows, or `null` (`Custom`).
 * @param {(id: string) => any} valueOf
 */
export function difficultyPresetNow(valueOf) {
  return (
    DIFFICULTY_PRESETS.find((p) =>
      DIFFICULTY_PRESET_ROWS.every((id) => String(readPresetValue(id, valueOf)) === String(p.values[id])),
    ) ?? null
  );
}

