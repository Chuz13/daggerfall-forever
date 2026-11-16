// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 3 (MILESTONE 3.2): CULT HOST — STREET HATCHES, GATEKEEPERS,
// TEMPLE PLAQUES, SUBTERRANEAN GUARDIANS & ALTAR CONSECRATION
// ═══════════════════════════════════════════════════════════════════════════════

import { t } from '../systems/textManager.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { DOOR_TYPE } from '../world/meshReader.js';
import { MOBILE_TYPES } from '../characters/mobile/mobileTypes.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE } from '../player/activate.js';
import { ChoiceWindow } from '../ui/talkWindow.js';
import { exteriorOpenSpellFor, consumeDoorSpell } from './shared.js';
import { playerEntity } from '../characters/playerEntity.js';
import { getPantheonDeity, ensurePantheonState } from '../systems/apotheosis/apotheosisStage3.js';
import {
  CULT_BRANCHES,
  CULT_UPGRADE_TIERS,
  ensureCityCultSites,
  getCityCultSites,
  getCultSite,
  getCultSiteByBuilding,
  isPlayerCultSiteOwned,
  hasSanctuaryKey,
  attemptUnlockSanctuaryHatch,
  obtainSanctuaryKeyFromGatekeeper,
  clearSiteGuardians,
  getSanctuaryGuardianCount,
  consecrateSiteByForce,
  dedicateSitePeacefully,
  upgradeCultSite,
  selectCultSiteBranch,
  resolveTemplePatronGodId,
  templeSiteKey,
} from '../systems/apotheosis/apotheosisCult.js';
import {
  SANCTUARY_HATCH_MODELS,
  buildSanctuaryBlock,
  pickSanctuaryHatchPosition,
} from '../world/apotheosisSanctuaryInterior.js';

export { isPlayerCultSiteOwned };

function yRotationMatrix(pos, yaw = 0) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    pos[0], pos[1], pos[2], 1,
  ]);
}

function makeHatchAabb(pos, halfW = 1.15, halfH = 0.8) {
  return {
    min: [pos[0] - halfW, pos[1] - 0.25, pos[2] - halfW],
    max: [pos[0] + halfW, pos[1] + halfH, pos[2] + halfW],
  };
}

function makeKeeperAabb(pos) {
  return {
    min: [pos[0] - 0.55, pos[1], pos[2] - 0.55],
    max: [pos[0] + 0.55, pos[1] + 1.85, pos[2] + 0.55],
  };
}

function buildFallbackHatchCpu() {
  // Simple iron/stone subterranean cellar slab if ARCH3D hatch model is unavailable
  const positions = new Float32Array([
    -0.8, 0.0, -0.8, 0.8, 0.0, -0.8, 0.8, 0.22, -0.8, -0.8, 0.22, -0.8,
    -0.8, 0.0, 0.8, 0.8, 0.0, 0.8, 0.8, 0.22, 0.8, -0.8, 0.22, 0.8,
  ]);
  const normals = new Float32Array([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ]);
  const uvs = new Float32Array([
    0, 0, 1, 0, 1, 1, 0, 1,
    0, 0, 1, 0, 1, 1, 0, 1,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    3, 2, 6, 3, 6, 7,
    0, 3, 7, 0, 7, 4,
    1, 5, 6, 1, 6, 2,
  ]);
  return {
    positions,
    normals,
    uvs,
    indices,
    subMeshes: [{ start: 0, count: indices.length, textureArchive: 74, textureRecord: 0 }],
  };
}

function pickGuardianMobType(site, idx = 0) {
  const patron = getPantheonDeity(site?.ownerId);
  if (patron?.kind === 'daedra') {
    return idx % 2 === 0 ? MOBILE_TYPES.DaedraSeducer : MOBILE_TYPES.Daedroth;
  }
  return idx % 2 === 0 ? MOBILE_TYPES.Battlemage : MOBILE_TYPES.Knight;
}

/** Formats the exterior door subtitle on `BUILDING_TYPES.Temple` and auto-seeds town cult sites. */
export function getTempleCultDoorSubtitle(entity, bd, mapId, factionDict = null) {
  if (!entity || !bd || bd.buildingType !== BUILDING_TYPES.Temple) return null;
  const mid = (Number(mapId ?? bd.townMapId ?? 0) >>> 0);
  const bk = Math.trunc(Number(bd.buildingKey) || 0);
  const reg = Number.isInteger(bd.regionIndex) ? bd.regionIndex : (entity.currentRegionIndex ?? 0);

  let site = getCultSiteByBuilding(entity, mid, bk);
  if (!site) {
    ensureCityCultSites(entity, {
      mapId: mid,
      regionIndex: reg,
      locationName: bd.townName ?? '',
      temples: [{ buildingKey: bk, factionId: bd.factionId ?? 0, name: bd.name }],
      factionDict,
    });
    site = getCultSiteByBuilding(entity, mid, bk)
      ?? getCultSite(entity, templeSiteKey(mid, bk));
  }
  if (!site) return null;

  if (site.ownerId === 'player') {
    const tierSpec = CULT_UPGRADE_TIERS[site.tier || 1] ?? CULT_UPGRADE_TIERS[1];
    return t('apotheosis.cult.doorPlayerTemple', 'Your Cult Sanctum (Tier {tier})', { tier: tierSpec.tier });
  }
  const patron = getPantheonDeity(site.ownerId);
  return t('apotheosis.cult.doorPatronTemple', 'Patron: {god}', { god: patron?.name ?? resolveTemplePatronGodId(bd.factionId ?? 0) });
}

/**
 * Builds a synthetic `enterInteriorCore` entry descriptor `{ hit, entries, building }`
 * for a windowless Underground Sanctuary (`buildSanctuaryBlock`).
 */
export function createSanctuaryInteriorEntry(site, {
  mapId = 0,
  regionIndex = 0,
  climateBase = 230,
  season = 0,
  hatchWorldPos = [0, 0, 0],
  hatchYaw = 0,
} = {}) {
  if (!site) return null;
  const dfBlock = buildSanctuaryBlock(site);
  const mid = Number(mapId || site.mapId || 0) >>> 0;
  const reg = Number.isInteger(regionIndex) ? regionIndex : (site.regionIndex ?? 0);
  const matrix = yRotationMatrix(hatchWorldPos, hatchYaw);
  const door = {
    doorType: DOOR_TYPE.BUILDING,
    blockIndex: -1,
    recordIndex: 0,
    buildingKey: site.buildingKey,
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
    size: { x: 2, y: 2.5, z: 1 },
    matrix,
  };
  const building = {
    buildingType: BUILDING_TYPES.Temple,
    buildingKey: site.buildingKey,
    regionIndex: reg,
    townMapId: mid,
    name: site.name,
    factionId: 0,
    quality: 50,
    cultSiteKey: site.siteKey,
  };
  const hit = {
    door,
    pixelKey: `cult:${mid}`,
    dfBlock,
    dfLocation: {
      name: site.locationName || '',
      regionIndex: reg,
      climate: { worldClimate: climateBase },
      mapTableData: { mapId: mid },
    },
    blockX: 0,
    blockY: 0,
    recordIndex: 0,
    climateBase,
    season,
    cultSanctuarySite: site,
  };
  return { hit, entries: [hit], building };
}

/**
 * Spawns Cult Guardians inside a Temple (if owner is War/Hostile) or Daedric Sanctuary
 * (`2` normal, `4` if Hatch Alarm was triggered) and marks `clearSiteGuardians` once slain.
 */
export function spawnCultInteriorGuardians(entity, building, mapId, interiorFoes, ctx, { say = () => {} } = {}) {
  if (!entity || !building || !interiorFoes?.spawnFoe || !ctx) return [];
  const mid = (Number(mapId ?? building.townMapId ?? 0) >>> 0);
  const bk = Math.trunc(Number(building.buildingKey) || 0);
  let site = building.cultSiteKey ? getCultSite(entity, building.cultSiteKey) : getCultSiteByBuilding(entity, mid, bk);

  if (!site && building.buildingType === BUILDING_TYPES.Temple) {
    ensureCityCultSites(entity, {
      mapId: mid,
      regionIndex: building.regionIndex ?? entity.currentRegionIndex ?? 0,
      locationName: building.name ?? '',
      temples: [{ buildingKey: bk, factionId: building.factionId ?? 0, name: building.name }],
    });
    site = getCultSiteByBuilding(entity, mid, bk);
  }
  if (!site || site.ownerId === 'player' || site.guardiansCleared) return [];

  const p = ensurePantheonState(entity);
  const ownerEntry = p?.deities?.[site.ownerId];
  const isHostileOwner = ownerEntry?.status === 'war' || ownerEntry?.status === 'hostile';
  if (site.kind === 'temple' && !isHostileOwner && !site.alarmTriggered) return [];

  const count = getSanctuaryGuardianCount(site);
  if (count <= 0) return [];

  const spawns = ctx.spawnPoints?.length ? ctx.spawnPoints : [ctx.landing ?? [0, 0, 0]];
  const alive = [];
  for (let i = 0; i < count; i++) {
    const sp = spawns[i % spawns.length];
    const jitter = (i - (count - 1) * 0.5) * 1.1;
    const pos = [sp[0] + jitter, sp[1], sp[2] + jitter];
    const mob = pickGuardianMobType(site, i);
    const foe = interiorFoes.spawnFoe(mob, pos, { yaw: 0, loose: true, hostile: true });
    if (foe) {
      foe._cultSiteKey = site.siteKey;
      alive.push(foe);
    }
  }

  if (alive.length > 0 && interiorFoes.onRemovedOrDead == null) {
    // Poll guardian completion asynchronously only when room runs without spamming hooks
    const checkDone = () => {
      if (alive.every((f) => f.dead || (f.health ?? 1) <= 0)) {
        clearSiteGuardians(entity, site.siteKey);
        say?.(t('apotheosis.cult.guardiansSlainHud', 'All Sanctuary Guardians defeated! Activate the Altar or Cult Menu to consecrate.'));
        return true;
      }
      return false;
    };
    const origClear = site._guardianCheckTimer;
    if (origClear) clearInterval(origClear);
    const timer = setInterval(() => {
      if (checkDone()) {
        clearInterval(timer);
        site._guardianCheckTimer = null;
      }
    }, 600);
    site._guardianCheckTimer = timer;
  }

  return alive;
}

/**
 * Interactive 4-method Hatch Unlock & Gatekeeper modal when activating a locked Daedric hatch in 3D.
 */
export function openSanctuaryHatchModal(entity, site, {
  showOverlay,
  say = () => {},
  onEnterSanctuary = () => {},
  worldMinutes = 0,
} = {}) {
  if (!entity || !site || typeof showOverlay !== 'function') return false;
  const patron = getPantheonDeity(site.ownerId);
  const header = site.isPlayerFounded
    ? t('apotheosis.cult.hatchPlayerHeader', 'Cult Undercroft Hatch')
    : t('apotheosis.cult.hatchDaedraHeader', 'Subterranean Hatch ({god})', { god: patron?.name ?? site.ownerId });

  const lockState = site.unlocked
    ? t('apotheosis.cult.hatchStateOpen', 'Status: Unlocked')
    : t('apotheosis.cult.hatchStateLocked', 'Status: Locked');
  const alarmNote = site.alarmTriggered
    ? t('apotheosis.cult.hatchAlarmOn', 'Alarm: SOUNDED (4 Guardians inside)')
    : t('apotheosis.cult.hatchAlarmQuiet', 'Alarm: Silent');

  const options = [];
  if (site.unlocked || site.ownerId === 'player') {
    options.push({
      code: 'Digit1',
      label: `1 - ${t('apotheosis.cult.btnEnter', 'Enter Sanctuary')}`,
      action: () => onEnterSanctuary(site),
    });
  } else {
    options.push(
      {
        code: 'Digit1',
        label: `1 - ${t('apotheosis.cult.unlockBtnLockpick', 'Pick Lock')}`,
        action: () => {
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'lockpick', { nowMinutes: worldMinutes });
          say(r.ok ? r.message : r.reason);
          if (r.ok) onEnterSanctuary(site);
        },
      },
      {
        code: 'Digit2',
        label: `2 - ${t('apotheosis.cult.unlockBtnBash', 'Bash Open (Triggers Alarm!)')}`,
        action: () => {
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'bash', { nowMinutes: worldMinutes });
          say(r.message ?? r.reason);
          if (r.ok) onEnterSanctuary(site);
        },
      },
      {
        code: 'Digit3',
        label: `3 - ${t('apotheosis.cult.unlockBtnMagic', 'Arcane Unlock (Open / Magic / Edict)')}`,
        action: () => {
          const spell = exteriorOpenSpellFor(entity);
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'magic', {
            hasOpenSpell: !!spell,
            onConsumeOpenSpell: () => consumeDoorSpell(entity, 'open'),
            nowMinutes: worldMinutes,
          });
          say(r.ok ? r.message : r.reason);
          if (r.ok) onEnterSanctuary(site);
        },
      },
      {
        code: 'Digit4',
        label: `4 - ${t('apotheosis.cult.unlockBtnKey', 'Unlock with Seal Key / Pact')}`,
        action: () => {
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'key', { nowMinutes: worldMinutes });
          say(r.ok ? r.message : r.reason);
          if (r.ok) onEnterSanctuary(site);
        },
      },
      {
        code: 'Digit5',
        label: `5 - ${t('apotheosis.cult.btnStealKey', 'Pickpocket Gatekeeper Key')}`,
        action: () => {
          const r = obtainSanctuaryKeyFromGatekeeper(entity, site.siteKey, 'pickpocket');
          say(r.ok ? r.message : r.reason);
        },
      },
    );
  }
  options.push({ code: 'Escape', label: `Esc - ${t('apotheosis.close', 'Close')}`, action: () => {} });
  showOverlay(new ChoiceWindow({ lines: [header, lockState, alarmNote], options }));
  return true;
}

/**
 * Interactive Cult Altar modal inside an Aedra Temple or Underground Sanctuary (`cultAltar:<siteKey>`).
 */
export function openCultAltarModal(entity, site, { showOverlay, say = () => {}, worldMinutes = 0 } = {}) {
  if (!entity || !site || typeof showOverlay !== 'function') return false;
  const patron = getPantheonDeity(site.ownerId);
  const owned = site.ownerId === 'player';
  const lines = owned
    ? [
        t('apotheosis.cult.altarOwnedTitle', 'Your Cult Altar — Tier {tier}', { tier: site.tier || 1 }),
        site.branch
          ? t('apotheosis.cult.branchLabel', 'Branch: {branch}', { branch: t(CULT_BRANCHES[site.branch].nameKey, CULT_BRANCHES[site.branch].fallbackName) })
          : t('apotheosis.cult.branchNone', 'Branch: Unspecialized'),
      ]
    : [
        t('apotheosis.cult.altarPatronTitle', 'Altar of {god}', { god: patron?.name ?? site.ownerId }),
        site.guardiansCleared
          ? t('apotheosis.cult.guardiansClear', 'Guardians: Defeated')
          : t('apotheosis.cult.guardiansPresent', 'Guardians: Active ({count})', { count: getSanctuaryGuardianCount(site) || 2 }),
      ];

  const options = [];
  if (!owned) {
    options.push(
      {
        code: 'Digit1',
        label: `1 - ${t('apotheosis.cult.btnForceConsecrate', 'Consecrate by Force (200 Faith)')}`,
        action: () => {
          const r = consecrateSiteByForce(entity, site.siteKey, { nowMinutes: worldMinutes });
          say(r.ok ? t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!') : r.reason);
        },
      },
      {
        code: 'Digit2',
        label: `2 - ${t('apotheosis.cult.btnPeacefulDedicate', 'Peaceful Dedication (450 Faith — Allied 100)')}`,
        action: () => {
          const r = dedicateSitePeacefully(entity, site.siteKey, { nowMinutes: worldMinutes });
          say(r.ok ? t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!') : r.reason);
        },
      },
    );
  } else {
    options.push(
      {
        code: 'Digit1',
        label: `1 - ${t('apotheosis.cult.btnUpgradeTier', 'Upgrade Sanctum Tier')}`,
        action: () => {
          const r = upgradeCultSite(entity, site.siteKey, { nowMinutes: worldMinutes });
          say(r.ok ? t('apotheosis.cult.upgradedHud', 'Sanctum elevated to Tier {tier}.', { tier: r.tier }) : r.reason);
        },
      },
      {
        code: 'Digit2',
        label: `2 - ${t('apotheosis.cult.branch.missionary', 'Missionary Choir')}`,
        action: () => {
          const r = selectCultSiteBranch(entity, site.siteKey, 'missionary');
          say(r.ok ? t('apotheosis.cult.branchSetHud', 'Selected specialization branch.') : r.reason);
        },
      },
      {
        code: 'Digit3',
        label: `3 - ${t('apotheosis.cult.branch.militant', 'Militant Chapter')}`,
        action: () => {
          const r = selectCultSiteBranch(entity, site.siteKey, 'militant');
          say(r.ok ? t('apotheosis.cult.branchSetHud', 'Selected specialization branch.') : r.reason);
        },
      },
      {
        code: 'Digit4',
        label: `4 - ${t('apotheosis.cult.branch.oracle', 'Oracle Reliquary')}`,
        action: () => {
          const r = selectCultSiteBranch(entity, site.siteKey, 'oracle');
          say(r.ok ? t('apotheosis.cult.branchSetHud', 'Selected specialization branch.') : r.reason);
        },
      },
    );
  }
  options.push({ code: 'Escape', label: `Esc - ${t('apotheosis.close', 'Close')}`, action: () => {} });
  showOverlay(new ChoiceWindow({ lines, options }));
  return true;
}

/**
 * Exterior + Interior world host managing 3D subterranean street hatches (`43600`/`43603`),
 * Gatekeepers, ray targets, hover tooltips, and Sanctuary entry.
 */
export function createApotheosisCultHost(deps = {}) {
  const { built, renderer, pipeline, state, townTalk, modes, groundAt, worldMinutes } = deps;
  const _hatches = new Map(); // siteKey -> { site, worldPos, yaw, matrix, aabb, keeperPos, keeperAabb, remap }
  const _meshCache = new Map();
  let _fallbackGpu = null;

  function loadHatchGpu(modelId) {
    const id = Number(modelId) || SANCTUARY_HATCH_MODELS[0];
    if (_meshCache.has(id)) return _meshCache.get(id);
    _meshCache.set(id, null);
    pipeline?.getGpuMesh?.(id)?.then((gpu) => {
      if (gpu) _meshCache.set(id, gpu);
    }, () => {});
    if (!_fallbackGpu && renderer?.createMesh) {
      try {
        _fallbackGpu = renderer.createMesh(buildFallbackHatchCpu());
      } catch {
        _fallbackGpu = null;
      }
    }
    return _fallbackGpu;
  }

  function frame() {
    _hatches.clear();
    const pixels = built?.();
    if (!pixels || !state) return;
    const tVec = [0, 0, 0];

    for (const p of pixels.values()) {
      if (!p?.homeTown || !p.homeFrames?.size) continue;
      const temples = [];
      for (const [bk, fr] of p.homeFrames) {
        if (fr?.type === BUILDING_TYPES.Temple) {
          temples.push({ buildingKey: bk, factionId: fr.faction ?? 0 });
        }
      }
      ensureCityCultSites(playerEntity, {
        mapId: p.homeTown,
        regionIndex: p.homeRegion ?? 0,
        locationName: p.homeName ?? '',
        temples,
        factionDict: townTalk?.factionDict ?? null,
      });

      const pxT = state.pixelTranslation?.(p.px, p.py, tVec) ?? [0, 0, 0];
      for (const site of getCityCultSites(playerEntity, p.homeTown)) {
        if (site.kind !== 'sanctuary') continue;
        const localPose = pickSanctuaryHatchPosition(
          p.homeFrames,
          p.locationRect,
          null,
          site.siteKey,
          site.isPlayerFounded ? 1 : 0,
        );
        const wx = pxT[0] + localPose[0];
        const wz = pxT[2] + localPose[2];
        const wy = typeof groundAt === 'function' ? groundAt(wx, wz) : localPose[1];
        const worldPos = [wx, Number.isFinite(wy) ? wy : 0, wz];
        const yaw = localPose[3] || 0;
        const keeperPos = [wx + Math.cos(yaw) * 1.8, worldPos[1], wz + Math.sin(yaw) * 1.8];
        _hatches.set(site.siteKey, {
          site,
          pixel: p,
          worldPos,
          yaw,
          matrix: yRotationMatrix(worldPos, yaw),
          aabb: makeHatchAabb(worldPos),
          keeperPos,
          keeperAabb: makeKeeperAabb(keeperPos),
          remap: p.texRemap ?? null,
        });
      }
    }
  }

  function draw(r = renderer) {
    if (!r?.drawMesh) return;
    for (const h of _hatches.values()) {
      const gpu = loadHatchGpu(h.site.hatchModelId) ?? _fallbackGpu;
      if (gpu) r.drawMesh(gpu, h.matrix, h.remap);
    }
  }

  function targets() {
    const out = [];
    for (const [siteKey, h] of _hatches) {
      out.push({
        key: `cultHatch:${siteKey}`,
        aabb: h.aabb,
        distance: RAY_DISTANCE,
        reach: STATIC_NPC_ACTIVATION_DISTANCE,
      });
      if (h.site.ownerId !== 'player' && !h.site.isPlayerFounded) {
        out.push({
          key: `cultKeeper:${siteKey}`,
          aabb: h.keeperAabb,
          distance: RAY_DISTANCE,
          reach: STATIC_NPC_ACTIVATION_DISTANCE,
        });
      }
    }
    return out;
  }

  function hoverName(key) {
    if (typeof key !== 'string') return null;
    if (key.startsWith('cultHatch:')) {
      const site = getCultSite(playerEntity, key.slice('cultHatch:'.length));
      if (!site) return null;
      const patron = getPantheonDeity(site.ownerId);
      const title = site.ownerId === 'player'
        ? t('apotheosis.cult.hatchPlayerTitle', 'Cult Undercroft Hatch')
        : t('apotheosis.cult.hatchTitle', 'Subterranean Hatch ({god})', { god: patron?.name ?? site.ownerId });
      const lockStr = site.unlocked
        ? t('apotheosis.cult.openBadge', 'Open')
        : t('apotheosis.cult.lockedBadge', 'Locked');
      const subs = [lockStr];
      if (site.alarmTriggered) subs.push(t('apotheosis.cult.alarmBadge', 'Alarm Triggered'));
      return { title, subs };
    }
    if (key.startsWith('cultKeeper:')) {
      const site = getCultSite(playerEntity, key.slice('cultKeeper:'.length));
      if (!site) return null;
      const patron = getPantheonDeity(site.ownerId);
      return {
        title: t('apotheosis.cult.keeperName', '{god} Cult Gatekeeper', { god: patron?.name ?? site.ownerId }),
        subs: [
          hasSanctuaryKey(playerEntity, site.siteKey)
            ? t('apotheosis.cult.keeperNoKey', 'Key Already Taken')
            : t('apotheosis.cult.keeperHint', 'Holds Sanctuary Seal Key'),
        ],
      };
    }
    return null;
  }

  function activate(key, interactionMode = 'activate') {
    if (typeof key !== 'string') return false;
    if (key.startsWith('cultKeeper:')) {
      const siteKey = key.slice('cultKeeper:'.length);
      const site = getCultSite(playerEntity, siteKey);
      if (!site) return false;
      const actMode = interactionMode === 'steal' ? 'pickpocket' : 'loot';
      const r = obtainSanctuaryKeyFromGatekeeper(playerEntity, siteKey, actMode);
      townTalk?.say?.(r.ok ? r.message : r.reason);
      return true;
    }
    if (key.startsWith('cultHatch:')) {
      const siteKey = key.slice('cultHatch:'.length);
      const h = _hatches.get(siteKey);
      const site = h?.site ?? getCultSite(playerEntity, siteKey);
      if (!site) return false;
      const enterNow = (s) => modes?.()?.enterCultSanctuary?.(s, h ? { worldPos: h.worldPos, yaw: h.yaw, pixel: h.pixel } : {});
      if (site.unlocked || site.ownerId === 'player') {
        enterNow(site);
        return true;
      }
      if (interactionMode === 'steal') {
        const r = attemptUnlockSanctuaryHatch(playerEntity, siteKey, 'lockpick', { nowMinutes: worldMinutes?.() ?? 0 });
        townTalk?.say?.(r.ok ? r.message : r.reason);
        if (r.ok) enterNow(site);
        return true;
      }
      return openSanctuaryHatchModal(playerEntity, site, {
        showOverlay: (w) => townTalk?.showOverlay?.(w),
        say: (l) => townTalk?.say?.(l),
        onEnterSanctuary: enterNow,
        worldMinutes: worldMinutes?.() ?? 0,
      });
    }
    return false;
  }

  function locateSite(siteKey) {
    return _hatches.get(siteKey) ?? null;
  }

  return { frame, draw, targets, hoverName, activate, locateSite };
}

/** Collects an interactive Altar ray target (`cultAltar:<siteKey>`) inside Temples & Underground Sanctuaries. */
export function interiorCultAltarTargets(ctx, entity, building, mapId) {
  if (!ctx || !entity || !building) return [];
  const mid = (Number(mapId ?? building.townMapId ?? 0) >>> 0);
  const bk = Math.trunc(Number(building.buildingKey) || 0);
  const site = building.cultSiteKey ? getCultSite(entity, building.cultSiteKey) : getCultSiteByBuilding(entity, mid, bk);
  if (!site) return [];
  const center = ctx.landing ?? [0, 0, 0];
  // Check interior staticList for a shrine/pedestal model (41020) or fall back near enter/landing back wall
  let altarPt = null;
  for (const s of ctx.drawList ?? []) {
    if (Number(s?.modelIdNum) === 41020 && s?.matrix) {
      altarPt = [s.matrix[12], s.matrix[13], s.matrix[14]];
      break;
    }
  }
  const p = altarPt ?? [center[0], center[1], center[2] + 3.0];
  return [{
    key: `cultAltar:${site.siteKey}`,
    aabb: { min: [p[0] - 1.1, p[1] - 0.5, p[2] - 1.1], max: [p[0] + 1.1, p[1] + 2.0, p[2] + 1.1] },
    distance: RAY_DISTANCE,
    reach: STATIC_NPC_ACTIVATION_DISTANCE,
  }];
}

/** Hover nameplate for an interior Cult Altar (`cultAltar:<siteKey>`). */
export function interiorCultAltarHoverName(entity, key) {
  if (typeof key !== 'string' || !key.startsWith('cultAltar:')) return null;
  const site = getCultSite(entity, key.slice('cultAltar:'.length));
  if (!site) return null;
  const patron = getPantheonDeity(site.ownerId);
  const title = site.ownerId === 'player'
    ? t('apotheosis.cult.altarOwnedTitle', 'Your Cult Altar — Tier {tier}', { tier: site.tier || 1 })
    : t('apotheosis.cult.altarPatronTitle', 'Altar of {god}', { god: patron?.name ?? site.ownerId });
  return { title, subs: [t('apotheosis.cult.altarClickHint', 'Consecrate / Manage Cult Sanctum')] };
}

/** Handles clicking an interior Cult Altar (`cultAltar:<siteKey>`). */
export function activateInteriorCultAltar(entity, key, { showOverlay, say, worldMinutes = 0 } = {}) {
  if (typeof key !== 'string' || !key.startsWith('cultAltar:')) return false;
  const site = getCultSite(entity, key.slice('cultAltar:'.length));
  if (!site) return false;
  return openCultAltarModal(entity, site, { showOverlay, say, worldMinutes });
}
