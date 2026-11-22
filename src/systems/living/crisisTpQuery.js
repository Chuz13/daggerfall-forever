// @ts-check
import { BAY_REGION_COUNT } from '../../formats/mapsTables.js';

const KNOWN_CRISIS_FILTERS = new Set([
  'war',
  'plague',
  'famine',
  'crime',
  'strife',
  'civil_strife',
  'witch',
  'ruler',
  'holiday',
  'prices',
  'tax',
  'any',
  'all',
]);

const BEYOND_ALIASES = new Set([
  'beyond',
  'tamriel',
  'provinces',
  'outer',
  'outside',
  'pastbay',
  'past-bay',
  'past_bay',
]);

const BAY_ALIASES = new Set([
  'bay',
  'ib',
  'iliac',
  'iliacbay',
  'iliac-bay',
  'iliac_bay',
]);

const REGION_NAME_ALIASES = Object.freeze({
  summerset: 'sumurset isle',
  'summerset isle': 'sumurset isle',
  sumurset: 'sumurset isle',
  imperial: 'cyrodiil',
  'imperial province': 'cyrodiil',
  argonia: 'black marsh',
});

/**
 * Checks whether a token names a crisis category, 'any'/'all', or a vanilla REGION_FLAGS key.
 * @param {string} token
 * @param {Record<string, number>} [regionFlags]
 */
export function isKnownCrisisFilter(token, regionFlags = {}) {
  const clean = String(token || '').toLowerCase().trim();
  if (!clean) return false;
  if (KNOWN_CRISIS_FILTERS.has(clean)) return true;
  return Object.keys(regionFlags || {}).some((k) => k.toLowerCase() === clean);
}

/**
 * Resolves a target region index, province/region name, or scope ('beyond'/'bay') for `crisis tp`.
 * @param {string} rawToken
 * @param {readonly string[]} regionNames
 */
export function resolveCrisisTpTarget(rawToken, regionNames) {
  const clean = String(rawToken || '').toLowerCase().trim();
  if (!clean) return null;

  if (BEYOND_ALIASES.has(clean)) {
    return {
      kind: 'beyond',
      label: 'beyond the Iliac Bay',
      sampleRegion: BAY_REGION_COUNT + 3,
      matches: (r) => r >= BAY_REGION_COUNT,
    };
  }
  if (BAY_ALIASES.has(clean)) {
    return {
      kind: 'bay',
      label: 'Iliac Bay',
      sampleRegion: 17,
      matches: (r) => r >= 0 && r < BAY_REGION_COUNT,
    };
  }

  if (/^\d+$/.test(clean)) {
    const idx = Number.parseInt(clean, 10);
    if (idx >= 0 && idx < regionNames.length) {
      return {
        kind: 'region',
        regionIndex: idx,
        label: `${idx} (${regionNames[idx]})`,
        sampleRegion: idx,
        matches: (r) => r === idx,
      };
    }
    return null;
  }

  const normalized = REGION_NAME_ALIASES[clean] ?? clean;
  let exact = -1;
  let prefixProvince = -1;
  let prefixAny = -1;
  let subProvince = -1;
  let subAny = -1;

  for (let r = 0; r < regionNames.length; r++) {
    const name = String(regionNames[r] ?? '').toLowerCase();
    if (!name) continue;
    if (name === normalized) {
      exact = r;
      break;
    }
    if (name.startsWith(normalized)) {
      if (r >= BAY_REGION_COUNT && prefixProvince < 0) prefixProvince = r;
      if (prefixAny < 0) prefixAny = r;
    } else if (name.includes(normalized)) {
      if (r >= BAY_REGION_COUNT && subProvince < 0) subProvince = r;
      if (subAny < 0) subAny = r;
    }
  }

  const matched =
    exact >= 0 ? exact : prefixProvince >= 0 ? prefixProvince : prefixAny >= 0 ? prefixAny : subProvince >= 0 ? subProvince : subAny;
  if (matched < 0) return null;

  return {
    kind: 'region',
    regionIndex: matched,
    label: `${matched} (${regionNames[matched]})`,
    sampleRegion: matched,
    matches: (r) => r === matched,
  };
}

/**
 * Parses `crisis tp` / `telecrisis` arguments into optional crisis filter + optional target region/scope.
 * Supports:
 * - `crisis tp`
 * - `crisis tp <type>`
 * - `crisis tp <type> <region|province|beyond|bay>`
 * - `crisis tp <region|province|beyond|bay>`
 * @param {string|string[]|null|undefined} rawInput
 * @param {readonly string[]} regionNames
 * @param {Record<string, number>} [regionFlags]
 */
export function parseCrisisTpQuery(rawInput, regionNames, regionFlags = {}) {
  const tokens = Array.isArray(rawInput)
    ? rawInput.map((v) => String(v ?? '').trim()).filter(Boolean)
    : typeof rawInput === 'string'
      ? rawInput.trim().split(/\s+/).filter(Boolean)
      : [];

  if (tokens.length === 0) {
    return { filterType: null, target: null, unknownTarget: null };
  }

  const first = tokens[0].toLowerCase();
  if (isKnownCrisisFilter(first, regionFlags)) {
    const filterType = first === 'any' || first === 'all' ? null : first;
    if (tokens.length === 1) {
      return { filterType, target: null, unknownTarget: null };
    }
    const rest = tokens.slice(1).join(' ');
    const target = resolveCrisisTpTarget(rest, regionNames);
    if (!target) {
      return { filterType, target: null, unknownTarget: rest };
    }
    return { filterType, target, unknownTarget: null };
  }

  const target = resolveCrisisTpTarget(tokens.join(' '), regionNames);
  if (target) {
    return { filterType: null, target, unknownTarget: null };
  }

  return { filterType: first, target: null, unknownTarget: null };
}
