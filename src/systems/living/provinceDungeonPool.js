// @ts-check
import { DUNGEON_TYPES, LOCATION_TYPES } from '../../formats/mapsFile.js';
import { isMainStoryDungeon } from '../../world/dungeon/dungeonTextures.js';
import { LAIR_TYPES } from '../../world/tamrielDungeons.js';

const LAIR_TYPE_SET = new Set(LAIR_TYPES);

/**
 * Maps DFU dungeonType / locationType to Living Tamriel's dungeon category label.
 * @param {number|undefined|null} dungeonType
 * @param {number|undefined|null} locationType
 * @returns {'Crypt'|'Mine'|'Coven'|'Den'|'Keep'|'Ruin'|'Labyrinth'}
 */
export function dungeonTypeLabel(dungeonType, locationType = null) {
  switch (dungeonType) {
    case DUNGEON_TYPES.Crypt:
    case DUNGEON_TYPES.Cemetery:
    case DUNGEON_TYPES.VampireHaunt:
      return 'Crypt';
    case DUNGEON_TYPES.Mine:
      return 'Mine';
    case DUNGEON_TYPES.Coven:
      return 'Coven';
    case DUNGEON_TYPES.NaturalCave:
    case DUNGEON_TYPES.SpiderNest:
    case DUNGEON_TYPES.HarpyNest:
    case DUNGEON_TYPES.DragonsDen:
    case DUNGEON_TYPES.ScorpionNest:
    case DUNGEON_TYPES.VolcanicCaves:
      return 'Den';
    case DUNGEON_TYPES.OrcStronghold:
    case DUNGEON_TYPES.HumanStronghold:
    case DUNGEON_TYPES.Prison:
    case DUNGEON_TYPES.GiantStronghold:
    case DUNGEON_TYPES.BarbarianStronghold:
      return 'Keep';
    case DUNGEON_TYPES.RuinedCastle:
    case DUNGEON_TYPES.DesecratedTemple:
      return 'Ruin';
    case DUNGEON_TYPES.Laboratory:
      return 'Labyrinth';
    default:
      break;
  }
  if (locationType === LOCATION_TYPES.DungeonKeep) return 'Keep';
  if (locationType === LOCATION_TYPES.DungeonRuin) return 'Ruin';
  if (locationType === LOCATION_TYPES.Graveyard) return 'Crypt';
  return 'Labyrinth';
}

/**
 * Collects real on-map province dungeons (TESA8 lairs registered in `worldPlaces`) around
 * the province's settlements so adventurers delve actual map dungeons with real mapIds & coords.
 * @param {number} regionIndex
 * @param {{
 *   settlements?: ReadonlyArray<{ px?: number, py?: number, region?: number }>,
 *   placeAt: (px: number, py: number) => any,
 *   lairCellOf: (px: number, py: number) => number,
 *   lairSite: (cell: number) => { px: number, py: number },
 *   cellSize?: number,
 *   maxCount?: number,
 *   ringRadius?: number,
 * }} deps
 * @returns {Array<{ id: number, mapId: number, name: string, type: string, px: number, py: number }>}
 */
export function collectProvinceDungeons(
  regionIndex,
  {
    settlements = [],
    placeAt,
    lairCellOf,
    lairSite,
    cellSize = 8,
    maxCount = 24,
    ringRadius = 3,
  },
) {
  if (typeof placeAt !== 'function' || typeof lairCellOf !== 'function' || typeof lairSite !== 'function') {
    return [];
  }

  const regionalSettlements = settlements.filter(
    (p) => p && p.region === regionIndex && Number.isInteger(p.px) && Number.isInteger(p.py),
  );
  if (regionalSettlements.length === 0) return [];

  // Sample evenly across the province's settlements so dungeons aren't clustered in one corner
  const sampleLimit = Math.min(regionalSettlements.length, 16);
  const step = regionalSettlements.length / sampleLimit;
  const checkedCells = new Set();
  const seenIds = new Set();
  /** @type {Array<{ id: number, mapId: number, name: string, type: string, px: number, py: number }>} */
  const out = [];

  for (let i = 0; i < sampleLimit && out.length < maxCount; i++) {
    const s = regionalSettlements[Math.floor(i * step)];
    const px0 = /** @type {number} */ (s.px);
    const py0 = /** @type {number} */ (s.py);
    for (let dy = -ringRadius; dy <= ringRadius && out.length < maxCount; dy++) {
      for (let dx = -ringRadius; dx <= ringRadius && out.length < maxCount; dx++) {
        const c = lairCellOf(px0 + dx * cellSize, py0 + dy * cellSize);
        if (c < 0 || checkedCells.has(c)) continue;
        checkedCells.add(c);
        const site = lairSite(c);
        const place = placeAt(site.px, site.py);
        if (
          !place ||
          !place.hasDungeon ||
          !place.name ||
          place.region !== regionIndex ||
          !LAIR_TYPE_SET.has(place.type)
        ) {
          continue;
        }
        const mapId = place.mapId;
        if (mapId == null || seenIds.has(mapId) || isMainStoryDungeon(mapId)) continue;
        seenIds.add(mapId);
        out.push({
          id: mapId,
          mapId,
          name: place.name,
          type: dungeonTypeLabel(place.dungeonType, place.type),
          px: place.px,
          py: place.py,
        });
      }
    }
  }

  return out;
}
