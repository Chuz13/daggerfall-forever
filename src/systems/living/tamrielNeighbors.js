// @ts-check
import { REGION_NAMES, BAY_REGION_COUNT } from '../../formats/mapsTables.js';
import { BORDER_REGIONS, BORDERS_PER_REGION, PROVINCE_BORDERS } from '../faction/factionRelations.js';

const SUMURSET_MARITIME_LINKS = Object.freeze([
  [66, 67], // Sumurset Isle <-> Valenwood
  [66, 63], // Sumurset Isle <-> Hammerfell
  [66, 70], // Sumurset Isle <-> Cyrodiil
]);

let _tamrielNeighbors = null;

function buildTamrielNeighbors() {
  const count = REGION_NAMES.length;
  const adj = Array.from({ length: count }, () => new Set());
  for (let r = 0; r < BAY_REGION_COUNT; r++) {
    const offset = r * BORDERS_PER_REGION;
    for (let i = 0; i < BORDERS_PER_REGION; i++) {
      const neighbor = BORDER_REGIONS[offset + i];
      if (neighbor > 0 && neighbor !== r && neighbor < BAY_REGION_COUNT) {
        adj[r].add(neighbor);
        adj[neighbor].add(r);
      }
    }
  }
  for (const [a, b] of PROVINCE_BORDERS) {
    if (a >= 0 && a < count && b >= 0 && b < count && a !== b) {
      adj[a].add(b);
      adj[b].add(a);
    }
  }
  for (const [a, b] of SUMURSET_MARITIME_LINKS) {
    if (a >= 0 && a < count && b >= 0 && b < count && a !== b) {
      adj[a].add(b);
      adj[b].add(a);
    }
  }
  return Object.freeze(adj.map((s) => Object.freeze([...s].sort((x, y) => x - y))));
}

/**
 * Returns sorted neighboring region/province indices (0..70) for any Tamriel region,
 * combining symmetric Bay borders, continental province borders, and Sumurset maritime links.
 * @param {number} regionIndex
 * @returns {readonly number[]}
 */
export function getRegionNeighbors(regionIndex) {
  if (!Number.isInteger(regionIndex) || regionIndex < 0 || regionIndex >= REGION_NAMES.length) {
    return Object.freeze([]);
  }
  _tamrielNeighbors ??= buildTamrielNeighbors();
  return _tamrielNeighbors[regionIndex] ?? Object.freeze([]);
}
