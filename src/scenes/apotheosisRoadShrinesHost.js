// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 3.3: ROADSIDE SHRINES HOST
// Ephemeral shrines at settlement road exits & along wilderness highways.
// ═══════════════════════════════════════════════════════════════════════════════

import { t } from '../systems/textManager.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE, worldAabb } from '../player/activate.js';
import { RMB_TILE_SIDE } from '../world/locationEntrance.js';
import { TERRAIN_TILE_DIM } from '../world/terrain/terrainSurface.js';
import { onPathTile } from '../player/exteriorSurface.js';
import { billboardSize } from '../world/rmbFlats.js';
import { MOBILE_TYPES } from '../characters/mobile/mobileTypes.js';
import { ChoiceWindow } from '../ui/talkWindow.js';
import { playerEntity } from '../characters/playerEntity.js';
import { feltNow } from '../systems/survival/env.js';
import {
  DEITY_DEFAULT_ALTAR_BY_GOD,
  DEITY_DEFAULT_ALTAR_FLAT,
  getPantheonDeity,
  getActiveCultPetition,
  pickRoadsideShrineGod,
  isRoadsideShrineDesecrated,
  isRoadsideShrineDonated,
  prayAtRoadsideShrine,
  desecrateRoadsideShrine,
  ROADSIDE_DESECRATE_FAITH_BASE,
  ROADSIDE_WILD_REWARD_MULT,
} from '../systems/apotheosis/apotheosisCore.js';

const SHRINE_PEDESTAL_MODEL_ID = 74082;
const SHRINE_KEY_PREFIX = 'roadShrine:';

function yRotationMatrix(pos, yaw = 0, scale = 1) {
  const c = Math.cos(yaw) * scale;
  const s = Math.sin(yaw) * scale;
  return new Float32Array([
    c, 0, -s, 0,
    0, scale, 0, 0,
    s, 0, c, 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

function isRoadTileAt(p, tx, tz) {
  if (tx < 0 || tx >= TERRAIN_TILE_DIM || tz < 0 || tz >= TERRAIN_TILE_DIM) return false;
  const idx = tz * TERRAIN_TILE_DIM + tx;
  return (p.tilemapBytes ? onPathTile(p.tilemapBytes[idx] >> 2) : false) || !!p.paths?.[idx];
}

function tileWorldCenter(tx, tz) {
  return [(tx + 0.5) * RMB_TILE_SIDE, (tz + 0.5) * RMB_TILE_SIDE];
}

function pickRoadsideDeityFoe(godId, idx = 0) {
  const deity = getPantheonDeity(godId);
  if (deity?.kind === 'daedra') {
    const pool = [MOBILE_TYPES.DaedraLord, MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.Daedroth, MOBILE_TYPES.FireAtronach];
    return pool[idx % pool.length];
  }
  const pool = [MOBILE_TYPES.Knight, MOBILE_TYPES.Battlemage, MOBILE_TYPES.Spellsword];
  return pool[idx % pool.length];
}

function pickRoadShoulderOffset(p, tx, tz, seed = 0, fallbackDx = 1, fallbackDz = 0) {
  const dirs = [];
  if (p?.tilemapBytes || p?.paths) {
    const cardinals = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of cardinals) {
      const nx = tx + dx;
      const nz = tz + dz;
      if (nx >= 0 && nx < TERRAIN_TILE_DIM && nz >= 0 && nz < TERRAIN_TILE_DIM && !isRoadTileAt(p, nx, nz)) {
        dirs.push([dx, dz]);
      }
    }
    if (dirs.length === 0) {
      const diags = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
      for (const [dx, dz] of diags) {
        const nx = tx + dx;
        const nz = tz + dz;
        if (nx >= 0 && nx < TERRAIN_TILE_DIM && nz >= 0 && nz < TERRAIN_TILE_DIM && !isRoadTileAt(p, nx, nz)) {
          dirs.push([dx, dz]);
        }
      }
    }
  }
  const chosen = dirs.length ? dirs[Math.abs(seed) % dirs.length] : [fallbackDx, fallbackDz];
  const len = Math.hypot(chosen[0], chosen[1]) || 1;
  // Center of road tile to its outer curb is RMB_TILE_SIDE * 0.5 (~3.2m); step +1.2..1.9m onto grass shoulder
  const dist = (RMB_TILE_SIDE * 0.5) + 1.2 + (Math.abs(seed) % 7) * 0.11;
  return [(chosen[0] / len) * dist, (chosen[1] / len) * dist];
}

/**
 * Creates the exterior Roadside Shrines host.
 * @param {Record<string, any>} [deps]
 */
export function createApotheosisRoadShrinesHost({
  built,
  renderer,
  pipeline,
  state,
  groundAt,
  worldMinutes,
  spawnExteriorFoe,
  townTalk,
  placeFeet,
  playerPos,
} = {}) {
  const _shrines = new Map();
  let _pedestalGpu = null;
  let _pedestalHeight = 0.42;
  let _pedestalScale = 0.42;
  let _pedestalMinY = 0;
  let _pedestalLoading = false;
  const _statueBatches = new Map(); // shrineId -> { key, batch }

  function ensurePedestalMesh() {
    if (_pedestalGpu || _pedestalLoading || !pipeline?.getGpuMesh) return;
    _pedestalLoading = true;
    Promise.resolve(pipeline.getGpuMesh(SHRINE_PEDESTAL_MODEL_ID)).then((gpu) => {
      if (gpu) {
        _pedestalGpu = gpu;
        const cpu = pipeline.cpuModels?.get(SHRINE_PEDESTAL_MODEL_ID);
        if (cpu?.positions) {
          const box = worldAabb(cpu.positions, yRotationMatrix([0, 0, 0], 0, 1));
          const rawH = Math.max(0.25, box.max[1] - box.min[1]);
          _pedestalHeight = 0.42;
          _pedestalScale = _pedestalHeight / rawH;
          _pedestalMinY = box.min[1];
          _statueBatches.clear();
        }
      }
      _pedestalLoading = false;
    }).catch(() => { _pedestalLoading = false; });
  }

  function ensureStatueBatch(shrine) {
    if (!renderer?.createBillboardBatch || !pipeline?.getTexture) return null;
    const flat = DEITY_DEFAULT_ALTAR_BY_GOD[shrine.godId] ?? DEITY_DEFAULT_ALTAR_FLAT;
    const wantKey = `${flat.archive}:${flat.record}:${Math.round(_pedestalHeight * 100)}:${Math.round(shrine.worldPos[0] * 10)}:${Math.round(shrine.worldPos[2] * 10)}`;
    const cached = _statueBatches.get(shrine.shrineId);
    if (cached?.key === wantKey) return cached.batch ?? null;

    const slot = { key: wantKey, batch: null };
    _statueBatches.set(shrine.shrineId, slot);
    Promise.resolve(pipeline.getTexture(flat.archive)).then((tex) => {
      if (_statueBatches.get(shrine.shrineId) !== slot || !tex || tex.recordCount <= 0) return;
      const rec = flat.record < tex.recordCount ? flat.record : 0;
      pipeline.uploadRecord?.(flat.archive, rec);
      const raw = billboardSize(tex, rec);
      const rawH = Number(raw?.h) || 1.6;
      const rawW = Number(raw?.w) || 0.9;
      const targetH = Math.max(1.15, Math.min(1.65, rawH));
      const sc = rawH > 0 ? (targetH / rawH) : 1;
      const basePos = [shrine.worldPos[0], shrine.worldPos[1] + _pedestalHeight - 0.04, shrine.worldPos[2]];
      slot.batch = renderer.createBillboardBatch(flat.archive, rec, { w: rawW * sc, h: targetH }, [basePos]);
    }).catch(() => {});
    return null;
  }

  function addShrineFromTile(p, pxT, { shrineId, tx, tz, offsetX = 4.2, offsetZ = 4.2, regionIndex, exitIndex = 0, isWild = false, isSettlementWithoutTemple = false, overrideGodId = null }) {
    const [cx, cz] = tileWorldCenter(tx, tz);
    const wx = pxT[0] + cx + offsetX;
    const wz = pxT[2] + cz + offsetZ;
    const wy = typeof groundAt === 'function' ? groundAt(wx, wz) : 0;
    const worldPos = [wx, Number.isFinite(wy) ? wy : 0, wz];
    const godId = overrideGodId || pickRoadsideShrineGod(playerEntity, {
      shrineId,
      regionIndex,
      exitIndex,
      isSettlementWithoutTemple,
    });
    const god = getPantheonDeity(godId);
    const title = isWild
      ? t('apotheosis.roadShrine.wildTitle', 'Wayside Shrine of {god}', { god: god?.name ?? godId })
      : t('apotheosis.roadShrine.townTitle', 'Roadside Shrine of {god}', { god: god?.name ?? godId });

    _shrines.set(shrineId, {
      shrineId,
      godId,
      godName: god?.name ?? godId,
      regionIndex,
      isWild,
      title,
      worldPos,
      matrix: yRotationMatrix(worldPos, 0, _pedestalScale),
      aabb: {
        min: [worldPos[0] - 0.85, worldPos[1] - 0.1, worldPos[2] - 0.85],
        max: [worldPos[0] + 0.85, worldPos[1] + 2.4, worldPos[2] + 0.85],
      },
    });
  }

  function frame() {
    _shrines.clear();
    const pixels = built?.();
    if (!pixels || !state) return;
    ensurePedestalMesh();
    const tVec = [0, 0, 0];
    const activePet = getActiveCultPetition(playerEntity);
    const wantPetGod = activePet?.type === 'desecrate_shrine' ? activePet.godId : null;

    for (const p of pixels.values()) {
      if (!p) continue;
      const hasRoadData = Boolean(p.tilemapBytes || p.paths);
      if (!p.homeTown && !hasRoadData) continue;
      const pxT = state.pixelTranslation?.(p.px, p.py, tVec) ?? [0, 0, 0];
      const reg = Number.isInteger(p.homeRegion) ? p.homeRegion : (Number.isInteger(p.regionIndex) ? p.regionIndex : (playerEntity?.currentRegionIndex ?? 0));

      if (p.homeTown) {
        const hasTemple = Array.from(p.homeFrames?.values?.() ?? []).some((fr) => fr?.type === BUILDING_TYPES.Temple);
        const r = p.locationRect;
        const exits = [];
        if (hasRoadData && r) {
          const xMin = Math.max(1, Math.trunc(r.xMin ?? 0));
          const xMax = Math.min(TERRAIN_TILE_DIM - 2, Math.trunc(r.xMax ?? TERRAIN_TILE_DIM - 1));
          const zMin = Math.max(1, Math.trunc(r.yMin ?? 0));
          const zMax = Math.min(TERRAIN_TILE_DIM - 2, Math.trunc(r.yMax ?? TERRAIN_TILE_DIM - 1));

          const probes = [
            { fb: [1, 0], list: Array.from({ length: xMax - xMin + 1 }, (_, i) => [xMin + i, Math.max(1, zMin - 1)]) },
            { fb: [-1, 0], list: Array.from({ length: xMax - xMin + 1 }, (_, i) => [xMin + i, Math.min(TERRAIN_TILE_DIM - 2, zMax + 1)]) },
            { fb: [0, 1], list: Array.from({ length: zMax - zMin + 1 }, (_, i) => [Math.max(1, xMin - 1), zMin + i]) },
            { fb: [0, -1], list: Array.from({ length: zMax - zMin + 1 }, (_, i) => [Math.min(TERRAIN_TILE_DIM - 2, xMax + 1), zMin + i]) },
          ];
          for (const pr of probes) {
            const hit = pr.list.find(([tx, tz]) => isRoadTileAt(p, tx, tz));
            if (hit) {
              const [ox, oz] = pickRoadShoulderOffset(p, hit[0], hit[1], hit[0] * 31 + hit[1] * 17, pr.fb[0], pr.fb[1]);
              exits.push({ tx: hit[0], tz: hit[1], ox, oz });
            }
          }
        }
        if (exits.length === 0 && hasRoadData) {
          outer: for (let d = 2; d < 16; d++) {
            for (let tx = 4; tx < TERRAIN_TILE_DIM - 4; tx += 3) {
              if (isRoadTileAt(p, tx, d)) {
                const [ox, oz] = pickRoadShoulderOffset(p, tx, d, tx + d, 1, 0);
                exits.push({ tx, tz: d, ox, oz });
                break outer;
              }
              if (isRoadTileAt(p, tx, TERRAIN_TILE_DIM - 1 - d)) {
                const tz = TERRAIN_TILE_DIM - 1 - d;
                const [ox, oz] = pickRoadShoulderOffset(p, tx, tz, tx + tz, -1, 0);
                exits.push({ tx, tz, ox, oz });
                break outer;
              }
            }
          }
        }
        if (exits.length === 0) {
          // Guarantee suburban shrines outside N/S perimeter for settlements lacking a road grid tag
          const cx = r ? Math.trunc(((r.xMin ?? 20) + (r.xMax ?? 44)) * 0.5) : 32;
          const zN = r ? Math.max(2, Math.trunc(r.yMin ?? 18) - 2) : 10;
          const zS = r ? Math.min(TERRAIN_TILE_DIM - 3, Math.trunc(r.yMax ?? 46) + 2) : 54;
          exits.push({ tx: cx, tz: zN, ox: 2.2, oz: -1.5 });
          exits.push({ tx: cx, tz: zS, ox: -2.2, oz: 1.5 });
        }
        let petGodPlacedInTown = false;
        exits.forEach((ex, idx) => {
          const shrineId = `${SHRINE_KEY_PREFIX}town:${p.homeTown}:${idx}`;
          const pickedGod = pickRoadsideShrineGod(playerEntity, {
            shrineId,
            regionIndex: reg,
            exitIndex: idx,
            isSettlementWithoutTemple: !hasTemple,
          });
          let overrideGodId = null;
          if (wantPetGod && pickedGod === wantPetGod) {
            petGodPlacedInTown = true;
          } else if (wantPetGod && idx === 1 && !petGodPlacedInTown) {
            overrideGodId = wantPetGod;
            petGodPlacedInTown = true;
          }
          addShrineFromTile(p, pxT, {
            shrineId,
            tx: ex.tx,
            tz: ex.tz,
            offsetX: ex.ox,
            offsetZ: ex.oz,
            regionIndex: reg,
            exitIndex: idx,
            isWild: false,
            isSettlementWithoutTemple: !hasTemple,
            overrideGodId,
          });
        });
      } else {
        // Ephemeral wilderness road shrines (~1 every ~4 km along road pixels)
        const wildHash = ((Math.imul(p.px, 73856093) ^ Math.imul(p.py, 19349663)) >>> 0);
        if (wildHash % 5 !== 0) continue;
        let bestTile = null;
        let bestDist = Infinity;
        const mid = Math.floor(TERRAIN_TILE_DIM / 2);
        for (let tz = 6; tz < TERRAIN_TILE_DIM - 6; tz += 2) {
          for (let tx = 6; tx < TERRAIN_TILE_DIM - 6; tx += 2) {
            if (!isRoadTileAt(p, tx, tz)) continue;
            const d2 = (tx - mid) * (tx - mid) + (tz - mid) * (tz - mid);
            if (d2 < bestDist) {
              bestDist = d2;
              bestTile = [tx, tz];
            }
          }
        }
        if (bestTile) {
          const [ox, oz] = pickRoadShoulderOffset(p, bestTile[0], bestTile[1], wildHash, 1, 0);
          addShrineFromTile(p, pxT, {
            shrineId: `${SHRINE_KEY_PREFIX}wild:${p.px}:${p.py}`,
            tx: bestTile[0],
            tz: bestTile[1],
            offsetX: ox,
            offsetZ: oz,
            regionIndex: reg,
            exitIndex: 0,
            isWild: true,
            isSettlementWithoutTemple: false,
          });
        }
      }
    }
  }

  function draw(r = renderer) {
    if (!r?.drawMesh || !_pedestalGpu) return;
    for (const s of _shrines.values()) {
      s.matrix = yRotationMatrix([s.worldPos[0], s.worldPos[1] - _pedestalMinY * _pedestalScale, s.worldPos[2]], 0, _pedestalScale);
      r.drawMesh(_pedestalGpu, s.matrix, null);
    }
  }

  function billboardBatches() {
    const out = [];
    for (const s of _shrines.values()) {
      const b = ensureStatueBatch(s);
      if (b) out.push(b);
    }
    return out;
  }

  function targets() {
    const out = [];
    for (const s of _shrines.values()) {
      out.push({
        key: s.shrineId,
        aabb: s.aabb,
        distance: RAY_DISTANCE,
        reach: STATIC_NPC_ACTIVATION_DISTANCE,
      });
    }
    return out;
  }

  function hoverName(key) {
    if (typeof key !== 'string' || !key.startsWith(SHRINE_KEY_PREFIX)) return null;
    const s = _shrines.get(key);
    if (!s) return null;
    return {
      title: s.title,
      subs: [t('apotheosis.roadShrine.hoverSub', 'Pray / Donate or Desecrate')],
    };
  }

  function nearbyShrines(pos, radiusMeters = 10) {
    if (!pos) return [];
    const r2 = radiusMeters * radiusMeters;
    const hits = [];
    for (const s of _shrines.values()) {
      const dx = s.worldPos[0] - pos[0];
      const dz = s.worldPos[2] - pos[2];
      const d2 = dx * dx + dz * dz;
      if (d2 <= r2) hits.push({ key: s.shrineId, title: s.title, pos: s.worldPos, distSq: d2 });
    }
    hits.sort((a, b) => a.distSq - b.distSq);
    return hits;
  }

  function spawnDesecrationGuardians(shrine, count) {
    if (typeof spawnExteriorFoe !== 'function' || count <= 0) return;
    const [sx, sy, sz] = shrine.worldPos;
    for (let i = 0; i < count; i++) {
      const ang = (i * Math.PI * 1.1) + 0.7;
      const gx = sx + Math.cos(ang) * 3.0;
      const gz = sz + Math.sin(ang) * 3.0;
      const gy = typeof groundAt === 'function' ? groundAt(gx, gz) : sy;
      const mob = pickRoadsideDeityFoe(shrine.godId, i);
      Promise.resolve(spawnExteriorFoe(mob, [gx, Number.isFinite(gy) ? gy : sy, gz], {
        yaw: Math.atan2(sx - gx, sz - gz),
        loose: true,
        hostile: true,
        feetGiven: true,
      })).catch(() => {});
    }
  }

  function activate(key, modeOrOpts = {}) {
    if (typeof key !== 'string' || !key.startsWith(SHRINE_KEY_PREFIX)) return false;
    const shrine = _shrines.get(key);
    const showOverlay = typeof modeOrOpts?.showOverlay === 'function' ? modeOrOpts.showOverlay : (w) => townTalk?.showOverlay?.(w);
    const say = typeof modeOrOpts?.say === 'function' ? modeOrOpts.say : (m) => townTalk?.say?.(m);
    if (!shrine || typeof townTalk?.showOverlay !== 'function' && typeof modeOrOpts?.showOverlay !== 'function') return false;
    const nowMin = Math.floor(worldMinutes?.() ?? 0);
    const desecrated = isRoadsideShrineDesecrated(playerEntity, shrine.shrineId, nowMin);
    const donated = isRoadsideShrineDonated(playerEntity, shrine.shrineId, nowMin);
    const wildTag = shrine.isWild
      ? t('apotheosis.roadShrine.wildBonusNote', 'Wild Highway Shrine: 3x Desecration Rewards ({faith} Faith)', {
          faith: ROADSIDE_DESECRATE_FAITH_BASE * ROADSIDE_WILD_REWARD_MULT,
        })
      : t('apotheosis.roadShrine.townNote', 'Settlement Roadside Shrine');

    const doDonate = (goldAmt) => {
      const res = prayAtRoadsideShrine(playerEntity, {
        shrineId: shrine.shrineId,
        godId: shrine.godId,
        regionIndex: shrine.regionIndex,
        goldAmount: goldAmt,
        nowMinutes: nowMin,
      });
      if (!res.ok) {
        say(res.reason);
        return;
      }
      if (playerEntity?.survival && typeof playerEntity.survival === 'object') {
        const live = feltNow(playerEntity);
        if (live) playerEntity.survival.felt = live.felt;
      }
      say(t('apotheosis.roadShrine.prayedMsg', 'Donated {gold}g to {god}. Road Blessing active for 12h (+{fat}/min Fatigue, +{deg}° Weather Resist).', {
        gold: res.goldSpent,
        god: res.godName,
        fat: res.blessing?.fatiguePerMin ?? 2,
        deg: res.blessing?.warmthDegrees ?? 5,
      }));
    };

    const opts = [];
    if (!donated && !desecrated) {
      opts.push(
        { code: 'Digit1', label: `1 - ${t('apotheosis.roadShrine.donate50', 'Donate 50g (Road Blessing Tier I)')}`, action: () => doDonate(50) },
        { code: 'Digit2', label: `2 - ${t('apotheosis.roadShrine.donate200', 'Donate 200g (Road Blessing Tier II)')}`, action: () => doDonate(200) },
        { code: 'Digit3', label: `3 - ${t('apotheosis.roadShrine.donate500', 'Donate 500g (Road Blessing Tier III)')}`, action: () => doDonate(500) },
      );
    }
    if (!desecrated) {
      opts.push({
        code: 'Digit4',
        label: `4 - ${t('apotheosis.roadShrine.desecrate', 'Desecrate Shrine (Risk of Guardians)')}`,
        action: () => {
          const res = desecrateRoadsideShrine(playerEntity, {
            shrineId: shrine.shrineId,
            godId: shrine.godId,
            regionIndex: shrine.regionIndex,
            isWild: shrine.isWild,
            nowMinutes: nowMin,
          });
          if (!res.ok) {
            say(res.reason);
            return;
          }
          if (res.guardiansTriggered) {
            spawnDesecrationGuardians(shrine, res.guardianCount);
            say(t('apotheosis.roadShrine.desecratedWarn', 'Desecrated {god}\'s shrine (+{faith} Faith)! {god}\'s champions emerge to defend it!', {
              god: res.godName,
              faith: res.faithGained,
            }));
          } else {
            say(t('apotheosis.roadShrine.desecratedOk', 'Desecrated {god}\'s shrine (+{faith} Faith, -{inf}% {god} share).', {
              god: res.godName,
              faith: res.faithGained,
              inf: res.influenceShift,
            }));
          }
          if (res.petitionCompleted?.completed) {
            say(t('apotheosis.petition.completedHud', 'Cult Petition Completed: +{faith} Faith, +{gold}g, +{inf}% Influence!', {
              faith: res.petitionCompleted.faithGained,
              gold: res.petitionCompleted.goldGained,
              inf: res.petitionCompleted.influenceGained,
            }));
          }
        },
      });
    }
    opts.push({ code: 'Escape', label: `Esc - ${t('apotheosis.cult.btnClose', 'Close')}`, action: () => {} });

    const statusLine = desecrated
      ? t('apotheosis.roadShrine.alreadyDesecratedNote', 'Already desecrated today.')
      : donated
        ? t('apotheosis.roadShrine.alreadyDonatedLine', 'Offering already made here today (resets in 24h).')
        : t('apotheosis.roadShrine.blessDesc', 'Donations restore Fatigue and grant a 12h Weather & Fatigue Road Blessing.');

    showOverlay(new ChoiceWindow({
      lines: [
        shrine.title,
        wildTag,
        statusLine,
      ],
      options: opts,
    }));
    return true;
  }

  function teleportNearRoadShrine() {
    if (typeof placeFeet !== 'function') return { ok: false, message: 'Teleport runtime unavailable.' };
    if (_shrines.size === 0) frame();
    if (_shrines.size === 0) {
      return { ok: false, message: 'No roadside shrines spawned in currently loaded pixels yet.' };
    }
    const p = playerPos?.() ?? [0, 0, 0];
    let best = null;
    let bestD2 = Infinity;
    for (const s of _shrines.values()) {
      const dx = s.worldPos[0] - p[0];
      const dz = s.worldPos[2] - p[2];
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = s;
      }
    }
    if (!best) return { ok: false, message: 'No roadside shrines found.' };
    const sx = best.worldPos[0];
    const sz = best.worldPos[2];
    const wx = sx;
    const wz = sz - 2.3;
    const gy = typeof groundAt === 'function' ? groundAt(wx, wz) : best.worldPos[1];
    const wy = Number.isFinite(gy) ? gy : best.worldPos[1];
    const lookYaw = Math.atan2(sx - wx, sz - wz);
    placeFeet([wx, wy + 0.15, wz], lookYaw);
    return {
      ok: true,
      message: `Teleported to ${best.title} (${best.isWild ? 'wild road' : 'town perimeter'}, total loaded: ${_shrines.size}).`,
    };
  }

  function destroyAll() {
    _shrines.clear();
    _statueBatches.clear();
  }

  return {
    frame,
    draw,
    billboardBatches,
    targets,
    hoverName,
    activate,
    nearbyShrines,
    teleportNearRoadShrine,
    destroyAll,
  };
}
