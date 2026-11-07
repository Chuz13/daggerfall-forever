// @ts-check
import { wrapAngle } from '../../world/mat4.js';

/**
 * Materializes and launches actual Come Sail Away 3D ships for a Living Tamriel naval squadron encounter.
 *
 * @param {Object} params
 * @param {any} params.naval The navalHost instance
 * @param {any} params.squadron The squadron plan from navalIncidentHost
 * @param {number} [params.playerLevel=1]
 * @param {number} [params.regionIndex=0]
 * @returns {{ lawShips: any[], pirateShips: any[] }}
 */
export function spawnNavalSquadronShips({
  naval,
  squadron,
  playerLevel = 1,
  regionIndex = 0,
}) {
  if (!naval?.launchShip || !squadron) {
    return { lawShips: [], pirateShips: [] };
  }

  // Scale warship classes with player level
  const lawClassId = playerLevel >= 8 ? 'navyFlagship' : (playerLevel >= 4 ? 'warGalley' : 'navyCutter');
  const pirateClassId = playerLevel >= 8 ? 'pirateFlagship' : (playerLevel >= 4 ? 'pirateBrigantine' : 'pirateSloop');

  const lawShips = [];
  const pirateShips = [];

  // Launch Law (Crown Navy) warships
  for (let i = 0; i < (squadron.law?.length ?? 0); i++) {
    const s = squadron.law[i];
    const entry = naval.launchShip({
      classId: lawClassId,
      seed: Math.floor(Math.random() * 0x7fffffff),
      pos: [s.x, 0, s.z],
      yaw: squadron.bearing ?? 0,
      hunter: true,
      encounter: 'squadron',
      region: regionIndex,
    });
    if (entry) lawShips.push(entry);
  }

  // Launch Pirate corsairs facing the navy line
  for (let i = 0; i < (squadron.pirates?.length ?? 0); i++) {
    const s = squadron.pirates[i];
    const entry = naval.launchShip({
      classId: pirateClassId,
      seed: Math.floor(Math.random() * 0x7fffffff),
      pos: [s.x, 0, s.z],
      yaw: wrapAngle((squadron.bearing ?? 0) + Math.PI),
      hunter: true,
      encounter: 'squadron',
      region: regionIndex,
    });
    if (entry) pirateShips.push(entry);
  }

  // Set mutual ship-to-ship target lock and engage orders
  for (let i = 0; i < lawShips.length; i++) {
    const target = pirateShips[i % pirateShips.length];
    if (target && lawShips[i].ship) {
      lawShips[i].ship.target = target.id;
      lawShips[i].ship.mode = 'engage';
    }
  }
  for (let i = 0; i < pirateShips.length; i++) {
    const target = lawShips[i % lawShips.length];
    if (target && pirateShips[i].ship) {
      pirateShips[i].ship.target = target.id;
      pirateShips[i].ship.mode = 'engage';
    }
  }

  return { lawShips, pirateShips };
}
