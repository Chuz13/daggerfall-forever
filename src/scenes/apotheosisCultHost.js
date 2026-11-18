// @ts-check
// ═══════════════════════════════════════════════════════════════════════════════
// APOTHEOSIS STAGE 3 (MILESTONE 3.2): CULT HOST — STREET HATCHES, GATEKEEPERS,
// TEMPLE PLAQUES, SUBTERRANEAN GUARDIANS & ALTAR CONSECRATION
// ═══════════════════════════════════════════════════════════════════════════════

import { t } from '../systems/textManager.js';
import { BUILDING_TYPES } from '../world/buildingNames.js';
import { DOOR_TYPE } from '../world/meshReader.js';
import { MOBILE_TYPES } from '../characters/mobile/mobileTypes.js';
import { RAY_DISTANCE, STATIC_NPC_ACTIVATION_DISTANCE, DOOR_ACTIVATION_DISTANCE, worldAabb } from '../player/activate.js';
import { RMB_TILE_SIDE } from '../world/locationEntrance.js';
import { TERRAIN_TILE_DIM } from '../world/terrain/terrainSurface.js';
import { onPathTile } from '../player/exteriorSurface.js';
import { billboardSize } from '../world/rmbFlats.js';
import { doorWorldPosition, doorWorldNormal } from '../player/enterExit.js';
import { ChoiceWindow } from '../ui/talkWindow.js';
import { exteriorOpenSpellFor, consumeDoorSpell } from './shared.js';
import { playerEntity } from '../characters/playerEntity.js';
import { freeLodgedFeet } from '../characters/foeSpacing.js';
import {
  APOTHEOSIS_PORTFOLIOS,
  getFaithMax,
  spendApotheosisFaith,
  ensureCultPetition,
  getActiveCultPetition,
  dismissCultPetition,
  notifyCultPetitionProgress,
  syncEdictPetitionIfActive,
  getActiveCultSieges,
  resolveCultSiegeOutcome,
} from '../systems/apotheosis/apotheosisCore.js';
import { getPantheonDeity, ensurePantheonState } from '../systems/apotheosis/apotheosisStage3.js';
import { LivingTamrielConfig, LIVING_URBAN_LOOT } from '../systems/living/livingConfig.js';
import { goldStack } from '../systems/inventory.js';
import { makePotion, potionRecipeKey, POTION_RECIPES } from '../systems/potions.js';
import {
  CULT_BRANCHES,
  CULT_BRANCH_SWITCH_COST,
  CULT_CONSECRATE_FORCE_FAITH_COST,
  CULT_CONSECRATE_PEACEFUL_FAITH_COST,
  CULT_TELEPORT_SANCTUARY_FAITH_COST,
  CULT_GUARDIAN_RESPAWN_COOLDOWN_MINUTES,
  CULT_UPGRADE_TIERS,
  CULT_ALTAR_STYLES,
  DEITY_DEFAULT_ALTAR_FLAT,
  DEITY_DEFAULT_ALTAR_BY_GOD,
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
  getCultBranchCooldownInfo,
  getCultAltarStyle,
  setCultAltarStyle,
  discoverCultSite,
  applySanctumTrespassPenalty,
  consecrateSiteByForce,
  initiateForceConsecrationAssault,
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

function playerPortfolioLabel(entity) {
  const pid = entity?.apotheosis?.portfolio;
  const spec = pid ? APOTHEOSIS_PORTFOLIOS.find((p) => p.id === pid) : null;
  if (spec?.name) return spec.name();
  return t('apotheosis.cult.defaultDomain', 'Divinity');
}

function isVec3(v) {
  return v != null && typeof v.length === 'number' && v.length >= 3
    && Number.isFinite(v[0]) && Number.isFinite(v[2]);
}

function buildHatchColliderCpu() {
  const hw = 0.9;
  const hh = 0.42;
  const positions = new Float32Array([
    -hw, 0, -hw, hw, 0, -hw, hw, hh, -hw, -hw, hh, -hw,
    -hw, 0, hw, hw, 0, hw, hw, hh, hw, -hw, hh, hw,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    3, 2, 6, 3, 6, 7,
    0, 3, 7, 0, 7, 4,
    1, 5, 6, 1, 6, 2,
    0, 4, 5, 0, 5, 1,
  ]);
  return { positions, indices };
}

const HATCH_COLLIDER_CPU = buildHatchColliderCpu();

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
    const ownerName = entity.name || t('apotheosis.cult.defaultAscendedName', 'Ascended');
    const domain = playerPortfolioLabel(entity);
    return t('apotheosis.cult.doorPlayerTempleNamed', 'Cult of {player} ({portfolio} • Tier {tier})', {
      player: ownerName,
      portfolio: domain,
      tier: tierSpec.tier,
    });
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
    doorIndex: 0,
    buildingKey: site.buildingKey,
    centre: { x: 0, y: 0, z: 0 },
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
 * Enforces a 3-day respawn cooldown (`CULT_GUARDIAN_RESPAWN_COOLDOWN_MINUTES`) and applies
 * a small once-per-day trespass relation penalty (`-5`) inside hostile/war sanctuaries.
 */
export function spawnCultInteriorGuardians(entity, building, mapId, interiorFoes, ctx, { say = () => {}, nowMinutes = 0, forceSpawn = false } = {}) {
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
  if (!site || site.ownerId === 'player') return [];

  if (!forceSpawn) {
    const trespass = applySanctumTrespassPenalty(entity, site, nowMinutes);
    if (trespass.penalized) {
      say?.(t('apotheosis.cult.trespassPenaltyHud', 'Trespassing in {god}\'s sanctum ({delta} Relation).', {
        god: trespass.deityName,
        delta: trespass.relationDelta,
      }));
    }
  }

  const isFoeAlive = (f) => Boolean(f && !f.dead && !(f.entity ? f.entity.health <= 0 : (f.health ?? 1) <= 0));
  if (site.guardiansCleared) return [];
  if (interiorFoes.foes?.some((f) => isFoeAlive(f) && f._cultSiteKey === site.siteKey)) return [];

  const curMin = Math.max(0, Math.trunc(Number(nowMinutes) || 0));
  if (!forceSpawn && !site.consecrationPending && !site.alarmTriggered && site.lastGuardianSpawnMinutes != null
    && (curMin - site.lastGuardianSpawnMinutes) < CULT_GUARDIAN_RESPAWN_COOLDOWN_MINUTES) {
    return [];
  }

  const p = ensurePantheonState(entity);
  const ownerEntry = p?.deities?.[site.ownerId];
  const isHostileOwner = ownerEntry?.status === 'war' || ownerEntry?.status === 'hostile';
  if (site.kind === 'temple' && !forceSpawn && !site.consecrationPending && !isHostileOwner && !site.alarmTriggered) return [];

  const count = getSanctuaryGuardianCount(site);
  if (count <= 0) return [];
  site.lastGuardianSpawnMinutes = curMin;
  site.alarmTriggered = false;

  const anchorPos = (forceSpawn || site.consecrationPending) ? ctx.cultAltarAnchors?.[0]?.pos : null;
  const altarOffsets = [[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]];
  const spawns = ctx.spawnPoints?.length ? ctx.spawnPoints : [ctx.landing ?? [0, 0, 0]];

  const resolvedFoes = [];
  const pendingPromises = [];
  const trackFoe = (f) => {
    if (!f) return;
    f._cultSiteKey = site.siteKey;
    resolvedFoes.push(f);
  };

  for (let i = 0; i < count; i++) {
    let pos;
    if (anchorPos) {
      const [ox, oz] = altarOffsets[i % altarOffsets.length];
      pos = [anchorPos[0] + ox, anchorPos[1] + 0.1, anchorPos[2] + oz];
    } else {
      const sp = spawns[i % spawns.length];
      const jitter = (i - (count - 1) * 0.5) * 1.1;
      pos = [sp[0] + jitter, sp[1], sp[2] + jitter];
    }
    const mob = pickGuardianMobType(site, i);
    const spawned = interiorFoes.spawnFoe(mob, pos, { yaw: 0, loose: true, hostile: true });
    if (spawned && typeof spawned.then === 'function') {
      pendingPromises.push(
        Promise.resolve(spawned).then((f) => {
          trackFoe(f);
          return f;
        }).catch(() => null),
      );
    } else if (spawned) {
      trackFoe(spawned);
    }
  }

  let pendingRemaining = pendingPromises.length;
  if (pendingRemaining > 0) {
    Promise.allSettled(pendingPromises).then(() => {
      pendingRemaining = 0;
    });
  }

  if ((resolvedFoes.length > 0 || pendingRemaining > 0) && interiorFoes.onRemovedOrDead == null) {
    const checkDone = () => {
      if (pendingRemaining > 0) return false;
      if (resolvedFoes.length === 0) {
        if (site.consecrationPending && site.ownerId !== 'player') {
          clearSiteGuardians(entity, site.siteKey);
          const cRes = consecrateSiteByForce(entity, site.siteKey, { nowMinutes: curMin, alreadyPaid: true });
          if (cRes.ok) {
            say?.(t('apotheosis.cult.consecrateVictoryHud', 'All defenders of {god} have fallen! {site} is now consecrated to your Cult (+10% Regional Influence)!', {
              god: getPantheonDeity(cRes.site?.formerOwnerId ?? site.ownerId)?.name ?? site.ownerId,
              site: site.name,
            }));
          }
        }
        return true;
      }
      if (resolvedFoes.every((f) => !isFoeAlive(f))) {
        clearSiteGuardians(entity, site.siteKey);
        if (site.consecrationPending && site.ownerId !== 'player') {
          const cRes = consecrateSiteByForce(entity, site.siteKey, { nowMinutes: curMin, alreadyPaid: true });
          if (cRes.ok) {
            say?.(t('apotheosis.cult.consecrateVictoryHud', 'All defenders of {god} have fallen! {site} is now consecrated to your Cult (+10% Regional Influence)!', {
              god: getPantheonDeity(cRes.site?.formerOwnerId ?? site.ownerId)?.name ?? site.ownerId,
              site: site.name,
            }));
            return true;
          }
        }
        say?.(t('apotheosis.cult.guardiansSlainHud', 'All Sanctuary Guardians defeated! Activate the Altar or Cult Menu to consecrate.'));
        return true;
      }
      if (Array.isArray(interiorFoes.foes) && !resolvedFoes.some((f) => interiorFoes.foes.includes(f))) {
        // Player exited the interior before defeating all Guardians; stop polling without falsely conquering
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

  return resolvedFoes;
}

/**
 * Interactive 4-method Hatch Unlock & Gatekeeper modal when activating a locked Daedric hatch in 3D.
 * Forced intrusion provokes Holy War (-35 Relation); alarms spawn Guardians in the street and stay outside.
 */
export function openSanctuaryHatchModal(entity, site, {
  showOverlay,
  say = () => {},
  onEnterSanctuary = () => {},
  onAlarmTriggered = null,
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
  const breakInWarn = !site.unlocked && site.ownerId !== 'player'
    ? t('apotheosis.cult.hatchBreakInWarn', 'Warning: Breaking in without Seal Key or Pact/Alliance triggers Holy War (-35 Rel)!')
    : '';

  const lines = [header, lockState, alarmNote, ...(breakInWarn ? [breakInWarn] : [])];
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
        label: `1 - ${t('apotheosis.cult.unlockBtnLockpickWar', 'Pick Lock (Fail -> Alarm; No Pact -> War)')}`,
        action: () => {
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'lockpick', { nowMinutes: worldMinutes });
          say(r.ok ? r.message : r.reason);
          if (r.alarm) {
            onAlarmTriggered?.(site);
            return;
          }
          if (r.ok) onEnterSanctuary(site);
        },
      },
      {
        code: 'Digit2',
        label: `2 - ${t('apotheosis.cult.unlockBtnBashStr', 'Bash Open (STR Check · 1h CD · Alarm & War!)')}`,
        action: () => {
          const r = attemptUnlockSanctuaryHatch(entity, site.siteKey, 'bash', { nowMinutes: worldMinutes });
          say(r.message ?? r.reason);
          if (r.alarm) {
            onAlarmTriggered?.(site);
            return; // Stay on the street to face outdoor alarm guardians; click open hatch again to enter
          }
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
        label: `4 - ${t('apotheosis.cult.unlockBtnKey', 'Unlock with Seal Key / Pact (Safe)')}`,
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
          const r = obtainSanctuaryKeyFromGatekeeper(entity, site.siteKey, 'pickpocket', { nowMinutes: worldMinutes });
          say(r.ok ? r.message : r.reason);
          if (r.alarm) onAlarmTriggered?.(site);
        },
      },
    );
  }
  options.push({ code: 'Escape', label: `Esc - ${t('apotheosis.close', 'Close')}`, action: () => {} });
  showOverlay(new ChoiceWindow({ lines, options }));
  return true;
}

function computeInquisitorSpawnPositions(interiorCtx, count = 3) {
  const anchor = interiorCtx?.cultAltarAnchors?.[0]?.pos ?? interiorCtx?.landing ?? [0, 0, 0];
  const land = interiorCtx?.landing ?? [anchor[0], anchor[1], anchor[2] - 2.0];
  const col = interiorCtx?.collider;
  const baseY = Number.isFinite(land[1]) ? land[1] : (Number.isFinite(anchor[1]) ? anchor[1] : 0);

  const dx = land[0] - anchor[0];
  const dz = land[2] - anchor[2];
  const dLen = Math.hypot(dx, dz);
  const ux = dLen > 0.2 ? dx / dLen : 0;
  const uz = dLen > 0.2 ? dz / dLen : -1;
  const px = -uz;
  const pz = ux;

  const specs = [
    [anchor[0] + ux * 1.45 - px * 0.65, anchor[2] + uz * 1.45 - pz * 0.65],
    [anchor[0] + ux * 1.45 + px * 0.65, anchor[2] + uz * 1.45 + pz * 0.65],
    [anchor[0] + ux * 1.95, anchor[2] + uz * 1.95],
    [anchor[0] + ux * 1.25, anchor[2] + uz * 1.25],
    [anchor[0] + ux * 1.85 - px * 0.65, anchor[2] + uz * 1.85 - pz * 0.65],
    [anchor[0] + ux * 1.85 + px * 0.65, anchor[2] + uz * 1.85 + pz * 0.65],
    [anchor[0] + ux * 2.35 - px * 0.45, anchor[2] + uz * 2.35 - pz * 0.45],
    [anchor[0] + ux * 2.35 + px * 0.45, anchor[2] + uz * 2.35 + pz * 0.45],
    [land[0] - px * 0.5, land[2] - pz * 0.5],
    [land[0] + px * 0.5, land[2] + pz * 0.5],
    [land[0], land[2]],
  ];

  const isValidSpot = (cx, cz) => {
    let fy = baseY;
    if (typeof col?.heightAt === 'function') {
      const h = col.heightAt(cx, cz);
      if (!Number.isFinite(h) || Math.abs(h - baseY) > 1.2) return null;
      fy = h;
    }
    if (typeof col?.raycast === 'function') {
      const from = [land[0], baseY + 1.0, land[2]];
      const rx = cx - from[0];
      const rz = cz - from[2];
      const len = Math.hypot(rx, rz);
      if (len > 0.25) {
        const hit = col.raycast(from, [rx / len, 0, rz / len], len);
        if (Number.isFinite(hit) && hit < len - 0.15) return null;
      }
    }
    return [cx, fy, cz];
  };

  const picked = [];
  for (const [cx, cz] of specs) {
    if (picked.length >= count) break;
    const okPos = isValidSpot(cx, cz);
    if (!okPos) continue;
    const tooClose = picked.some((q) => Math.hypot(q[0] - okPos[0], q[2] - okPos[2]) < 0.55);
    if (!tooClose) picked.push(okPos);
  }
  while (picked.length < count) {
    const i = picked.length;
    const ox = (i - 1) * 0.3;
    const cx = land[0] + px * ox;
    const cz = land[2] + pz * ox;
    const fy = typeof col?.heightAt === 'function' ? col.heightAt(cx, cz) : baseY;
    picked.push([cx, Number.isFinite(fy) && Math.abs(fy - baseY) <= 1.2 ? fy : baseY, cz]);
  }
  return picked;
}

/**
 * Interactive Cult Altar modal inside an Aedra Temple or Underground Sanctuary (`cultAltar:<siteKey>`).
 * Every Faith-spending action displays cost & confirms via ChoiceWindow before execution.
 */
export function openCultAltarModal(entity, site, modalOpts = {}) {
  const {
    showOverlay,
    say = () => {},
    worldMinutes = 0,
    onAltarStyleChanged = null,
    interiorBuilding = null,
    mapId = 0,
    interiorFoes = null,
    interiorCtx = null,
  } = modalOpts;
  if (!entity || !site || typeof showOverlay !== 'function') return false;
  const patron = getPantheonDeity(site.ownerId);
  const owned = site.ownerId === 'player';
  const faithCur = Math.trunc(Number(entity?.apotheosis?.faith) || 0);
  const faithMax = getFaithMax(entity?.apotheosis);

  const openConfirm = (promptLines, confirmLabel, onConfirm, cancelLabel = null) => {
    const opts = [
      { code: 'Digit1', label: `1 - ${confirmLabel}`, action: onConfirm },
    ];
    if (cancelLabel) {
      opts.push({
        code: 'Digit2',
        label: `2 - ${cancelLabel}`,
        action: () => openCultAltarModal(entity, site, modalOpts),
      });
    }
    opts.push({
      code: 'Escape',
      label: `Esc - ${t('apotheosis.cult.btnBack', 'Back')}`,
      action: () => openCultAltarModal(entity, site, modalOpts),
    });
    showOverlay(new ChoiceWindow({
      lines: promptLines,
      options: opts,
    }));
  };

  const openStatuePickerPage = (offset = 0) => {
    const curStyle = getCultAltarStyle(entity);
    const pageSize = 8;
    const slice = CULT_ALTAR_STYLES.slice(offset, offset + pageSize);
    const statueOpts = slice.map((st, idx) => {
      const n = idx + 1;
      const activeTag = st.id === curStyle.id ? ` [${t('apotheosis.cult.activeBadge', 'Active')}]` : '';
      return {
        code: `Digit${n}`,
        label: `${n} - ${t(st.nameKey, st.fallbackName)}${activeTag}`,
        action: () => {
          const r = setCultAltarStyle(entity, st.id);
          say(r.ok ? t('apotheosis.cult.altarStyleSet', 'Cult Altar Statue changed to {name}.', { name: t(st.nameKey, st.fallbackName) }) : r.reason);
          onAltarStyleChanged?.(st);
        },
      };
    });
    if (offset + pageSize < CULT_ALTAR_STYLES.length) {
      statueOpts.push({
        code: 'Digit9',
        label: `9 - ${t('apotheosis.cult.btnMoreStatues', 'Next Page...')}`,
        action: () => openStatuePickerPage(offset + pageSize),
      });
    } else if (offset > 0) {
      statueOpts.push({
        code: 'Digit9',
        label: `9 - ${t('apotheosis.cult.btnPrevStatues', 'Previous Page...')}`,
        action: () => openStatuePickerPage(0),
      });
    }
    statueOpts.push({
      code: 'Escape',
      label: `Esc - ${t('apotheosis.cult.btnBack', 'Back')}`,
      action: () => openCultAltarModal(entity, site, modalOpts),
    });
    showOverlay(new ChoiceWindow({
      lines: [
        t('apotheosis.cult.altarStylePickTitle', 'Choose Cult Altar Statue (2D / 3D)'),
        t('apotheosis.cult.altarStyleCurrentLine', 'Current: {name}', { name: t(curStyle.nameKey, curStyle.fallbackName) }),
      ],
      options: statueOpts,
    }));
  };

  const lines = owned
    ? [
        t('apotheosis.cult.altarOwnedTitle', 'Your Cult Altar — Tier {tier}', { tier: site.tier || 1 }),
        site.branch
          ? t('apotheosis.cult.branchLabel', 'Branch: {branch}', { branch: t(CULT_BRANCHES[site.branch].nameKey, CULT_BRANCHES[site.branch].fallbackName) })
          : t('apotheosis.cult.branchNone', 'Branch: Unspecialized'),
        t('apotheosis.cult.altarFaithLine', 'Divine Faith: {cur} / {max}', { cur: faithCur, max: faithMax }),
      ]
    : [
        t('apotheosis.cult.altarPatronTitle', 'Altar of {god}', { god: patron?.name ?? site.ownerId }),
        site.guardiansCleared
          ? t('apotheosis.cult.guardiansClear', 'Guardians: Defeated')
          : t('apotheosis.cult.guardiansPresent', 'Guardians: Active ({count})', { count: getSanctuaryGuardianCount(site) || 2 }),
        t('apotheosis.cult.altarFaithLine', 'Divine Faith: {cur} / {max}', { cur: faithCur, max: faithMax }),
      ];

  const options = [];
  if (!owned) {
    const pState = ensurePantheonState(entity);
    const ownerEntry = pState?.deities?.[site.ownerId];
    const godName = patron?.name ?? site.ownerId;
    const forceCost = site.consecrationPaid ? 0 : CULT_CONSECRATE_FORCE_FAITH_COST;
    const peacefulCost = CULT_CONSECRATE_PEACEFUL_FAITH_COST;
    const peacefulReady = ownerEntry?.status === 'allied' && Number(ownerEntry?.relation ?? 0) === 100 && faithCur >= peacefulCost;

    options.push(
      {
        code: 'Digit1',
        label: `1 - ${t('apotheosis.cult.btnForceConsecrate', 'Consecrate by Force ({cost} Faith)', { cost: forceCost })}`,
        action: () => {
          const warnMsg = site.guardiansCleared
            ? t('apotheosis.cult.confirmForceWarn', 'Seizes {site} from {god} (+10% Influence, -35 Relation).', { site: site.name, god: godName })
            : t('apotheosis.cult.confirmForceAssaultWarn', 'WARNING: Provokes Holy War with {god} (-35 Relation) and summons defending Guardians! Once the last Guardian falls, {site} is consecrated to your Cult (+10% Influence).', { site: site.name, god: godName });
          openConfirm(
            [
              t('apotheosis.cult.confirmForceTitle', 'Confirm Force Consecration'),
              t('apotheosis.cult.confirmCostLine', 'Cost: {cost} Faith (You have {have})', { cost: forceCost, have: faithCur }),
              warnMsg,
            ],
            t('apotheosis.cult.btnConfirmYesConsecrate', 'Yes, Declare War & Consecrate ({cost} Faith)', { cost: forceCost }),
            () => {
              const r = initiateForceConsecrationAssault(entity, site.siteKey, { nowMinutes: worldMinutes });
              if (!r.ok) {
                say(r.reason);
                return;
              }
              if (r.completedImmediately) {
                say(t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!'));
                return;
              }
              const isFoeAliveNow = (f) => Boolean(f && !f.dead && !(f.entity ? f.entity.health <= 0 : (f.health ?? 1) <= 0));
              const hasLiveGuards = (interiorFoes?.foes ?? []).some((f) => isFoeAliveNow(f) && f._cultSiteKey === site.siteKey);
              if (!hasLiveGuards) {
                spawnCultInteriorGuardians(entity, interiorBuilding, mapId || site.mapId, interiorFoes, interiorCtx, {
                  say,
                  nowMinutes: worldMinutes,
                  forceSpawn: true,
                });
                if (!interiorFoes?.spawnFoe || !site._guardianCheckTimer) {
                  clearSiteGuardians(entity, site.siteKey);
                  const fallbackDone = consecrateSiteByForce(entity, site.siteKey, { nowMinutes: worldMinutes, alreadyPaid: true });
                  say(fallbackDone.ok ? t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!') : fallbackDone.reason);
                  return;
                }
              }
              say(t('apotheosis.cult.assaultStartedHud', 'Holy War declared against {god}! Defeat the defending Guardians to claim {site}!', {
                god: godName,
                site: site.name,
              }));
            },
            t('apotheosis.cult.btnConfirmNoStepBack', 'No, Step Back'),
          );
        },
      },
      {
        code: 'Digit2',
        label: `2 - ${peacefulReady ? '' : `[${t('apotheosis.locked', 'Locked')}] `}${t('apotheosis.cult.btnPeacefulDedicate', 'Peaceful Dedication ({cost} Faith — Allied 100)', { cost: peacefulCost })}`,
        action: () => {
          if (!peacefulReady) {
            const r = dedicateSitePeacefully(entity, site.siteKey, { nowMinutes: worldMinutes });
            say(r.ok ? t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!') : r.reason);
            return;
          }
          openConfirm(
            [
              t('apotheosis.cult.confirmPeacefulTitle', 'Confirm Peaceful Dedication'),
              t('apotheosis.cult.confirmCostLine', 'Cost: {cost} Faith (You have {have})', { cost: peacefulCost, have: faithCur }),
              t('apotheosis.cult.confirmPeacefulInfo', '{god} yields stewardship peacefully (+8% Influence, -10 Relation).', { god: godName }),
            ],
            t('apotheosis.cult.confirmBtnSpend', 'Confirm ({cost} Faith)', { cost: peacefulCost }),
            () => {
              const r = dedicateSitePeacefully(entity, site.siteKey, { nowMinutes: worldMinutes });
              say(r.ok ? t('apotheosis.cult.consecrateDone', 'Altar consecrated to your Cult!') : r.reason);
            },
          );
        },
      },
    );
  } else {
    const curTier = Math.max(1, Math.min(3, Math.trunc(Number(site.tier) || 1)));
    const nextSpec = curTier < 3 ? CULT_UPGRADE_TIERS[curTier + 1] : null;
    const goldCur = Math.max(0, Math.trunc(Number(entity.goldPieces) || 0));
    const fmtNum = (n) => Math.trunc(Number(n) || 0).toLocaleString('en-US');
    const upgLabel = nextSpec
      ? t('apotheosis.cult.btnUpgradeCostGold', 'Upgrade to Tier {tier} ({faith} Faith · {gold}g)', {
          tier: nextSpec.tier,
          faith: nextSpec.upgradeCost,
          gold: fmtNum(nextSpec.upgradeGoldCost ?? 0),
        })
      : t('apotheosis.cult.btnMaxTierReached', 'Grand Sanctum (Tier III · Max)');

    options.push({
      code: 'Digit1',
      label: `1 - ${upgLabel}`,
      action: () => {
        if (!nextSpec) {
          say(t('apotheosis.cult.err.maxTier', 'This sanctuary is already at Grand Sanctum (Tier III).'));
          return;
        }
        const nextGold = nextSpec.upgradeGoldCost ?? 0;
        openConfirm(
          [
            t('apotheosis.cult.confirmUpgradeTitle', 'Confirm Sanctum Upgrade to Tier {tier}', { tier: nextSpec.tier }),
            t('apotheosis.cult.confirmCostLineGold', 'Cost: {faith} Faith · {gold}g (You have {haveFaith} Faith · {haveGold}g)', {
              faith: nextSpec.upgradeCost,
              gold: fmtNum(nextGold),
              haveFaith: faithCur,
              haveGold: fmtNum(goldCur),
            }),
            t('apotheosis.cult.confirmUpgradeInfo', 'New output: +{f}/day Faith, +{m} Max Faith reservoir.', {
              f: nextSpec.faithPerDay,
              m: nextSpec.maxFaithBonus,
            }),
          ],
          t('apotheosis.cult.confirmBtnSpendGold', 'Confirm ({faith} Faith · {gold}g)', {
            faith: nextSpec.upgradeCost,
            gold: fmtNum(nextGold),
          }),
          () => {
            const r = upgradeCultSite(entity, site.siteKey, { nowMinutes: worldMinutes });
            say(r.ok ? t('apotheosis.cult.upgradedHud', 'Sanctum elevated to Tier {tier}.', { tier: r.tier }) : r.reason);
          },
        );
      },
    });

    const branchList = ['missionary', 'militant', 'oracle'];
    const cd = getCultBranchCooldownInfo(site, worldMinutes);
    branchList.forEach((bId, idx) => {
      const bSpec = CULT_BRANCHES[bId];
      const bName = t(bSpec.nameKey, bSpec.fallbackName);
      const isCur = site.branch === bId;
      const isSwitch = Boolean(site.branch) && !isCur;
      const cost = isSwitch ? CULT_BRANCH_SWITCH_COST : 0;
      const suffix = isCur
        ? ` [${t('apotheosis.cult.activeBadge', 'Active')}]`
        : isSwitch
          ? (cd.onCooldown ? ` (${cost}F · ${cd.remainingDays}d CD)` : ` (${cost} Faith · 7d CD)`)
          : ` (${t('apotheosis.cult.freeLabel', 'Free')})`;
      options.push({
        code: `Digit${idx + 2}`,
        label: `${idx + 2} - ${bName}${suffix}`,
        action: () => {
          if (isCur || (isSwitch && cd.onCooldown) || faithCur < cost) {
            const r = selectCultSiteBranch(entity, site.siteKey, bId, { nowMinutes: worldMinutes });
            say(r.ok ? t('apotheosis.cult.branchSetHud', 'Selected specialization branch.') : r.reason);
            return;
          }
          openConfirm(
            [
              t('apotheosis.cult.confirmBranchTitle', 'Confirm Specialization: {branch}', { branch: bName }),
              t('apotheosis.cult.confirmCostLine', 'Cost: {cost} Faith (You have {have})', { cost, have: faithCur }),
              t(bSpec.descKey, bSpec.fallbackDesc),
            ],
            cost > 0
              ? t('apotheosis.cult.confirmBtnSpend', 'Confirm ({cost} Faith)', { cost })
              : t('apotheosis.cult.confirmBtnFree', 'Confirm (Free)'),
            () => {
              const r = selectCultSiteBranch(entity, site.siteKey, bId, { nowMinutes: worldMinutes });
              say(r.ok ? t('apotheosis.cult.branchSetHud', 'Selected specialization branch.') : r.reason);
            },
          );
        },
      });
    });

    const curStyle = getCultAltarStyle(entity);
    options.push({
      code: 'Digit5',
      label: `5 - ${t('apotheosis.cult.btnChooseAltarStatue', 'Altar Statue: {name}', { name: t(curStyle.nameKey, curStyle.fallbackName) })}`,
      action: () => openStatuePickerPage(0),
    });

    const petition = ensureCultPetition(entity, { regionIndex: site.regionIndex, nowMinutes: worldMinutes })
      ?? getActiveCultPetition(entity, worldMinutes);
    if (petition) {
      options.push({
        code: 'Digit6',
        label: `6 - ${t('apotheosis.petition.btnAltarMenu', 'Pilgrim Petition ({god})', { god: petition.godName })}`,
        action: () => {
          const synced = syncEdictPetitionIfActive(entity, worldMinutes);
          if (synced?.completed) {
            say(t('apotheosis.petition.completedHud', 'Cult Petition Completed: +{faith} Faith, +{gold}g, +{inf}% Influence!', {
              faith: synced.faithGained,
              gold: synced.goldGained,
              inf: synced.influenceGained,
            }));
            return;
          }
          const isFoeAlive = (f) => Boolean(f && !f.dead && (f.entity ? f.entity.health > 0 : (f.health ?? 1) > 0));
          if (petition.type === 'inquisition' && petition.inquisitionSpawned) {
            const roomInq = (interiorFoes?.foes ?? []).filter((f) => f?._cultInquisitionFoe);
            if (roomInq.length > 0 && roomInq.every((f) => !isFoeAlive(f))) {
              const done = notifyCultPetitionProgress(entity, 'inquisition_cleared', {
                siteKey: site.siteKey,
                nowMinutes: worldMinutes,
              });
              if (done?.completed) {
                say(t('apotheosis.petition.completedHud', 'Cult Petition Completed: +{faith} Faith, +{gold}g, +{inf}% Influence!', {
                  faith: done.faithGained,
                  gold: done.goldGained,
                  inf: done.influenceGained,
                }));
              }
              return;
            }
            if (roomInq.length === 0) {
              petition.inquisitionSpawned = false;
            }
          }
          const petDesc = petition.type === 'inquisition'
            ? t('apotheosis.petition.descInquisition', 'Defeat {god}\'s Inquisitors threatening your sanctum.', { god: petition.godName })
            : petition.type === 'desecrate_shrine'
              ? t('apotheosis.petition.descDesecrate', 'Desecrate a roadside shrine of {god} in this region (3x reward on wild roads!).', { god: petition.godName })
              : t('apotheosis.petition.descEdict', 'Proclaim any Regional Edict in this region to guide the faithful.');
          const petOpts = [];
          if (petition.type === 'inquisition' && !petition.inquisitionSpawned && interiorFoes?.spawnFoe) {
            petOpts.push({
              code: 'Digit1',
              label: `1 - ${t('apotheosis.petition.btnConfrontInq', 'Confront Inquisitors ({count})', { count: petition.goal || 3 })}`,
              action: () => {
                petition.inquisitionSpawned = true;
                const spawned = [];
                const total = Math.max(3, petition.goal || 3);
                const mobPool = [MOBILE_TYPES.Knight, MOBILE_TYPES.Battlemage, MOBILE_TYPES.Spellsword];
                const positions = computeInquisitorSpawnPositions(interiorCtx, total);
                const land = interiorCtx?.landing ?? positions[0] ?? [0, 0, 0];
                Promise.all(positions.map((pos, idx) => {
                  const lookYaw = Math.atan2(land[0] - pos[0], land[2] - pos[2]);
                  return Promise.resolve(interiorFoes.spawnFoe(mobPool[idx % mobPool.length], pos, {
                    yaw: lookYaw,
                    loose: true,
                    hostile: true,
                    feetGiven: true,
                  })).then((f) => {
                    if (f) {
                      f._cultInquisitionFoe = true;
                      spawned.push(f);
                    }
                  }).catch(() => {});
                })).then(() => {
                  if (!spawned.length) {
                    petition.inquisitionSpawned = false;
                    return;
                  }
                  const timer = setInterval(() => {
                    if (!getActiveCultPetition(entity)) {
                      clearInterval(timer);
                      return;
                    }
                    if (Array.isArray(interiorFoes?.foes) && !spawned.some((f) => interiorFoes.foes.includes(f))) {
                      const curPet = getActiveCultPetition(entity);
                      if (curPet && curPet.id === petition.id) curPet.inquisitionSpawned = false;
                      clearInterval(timer);
                      return;
                    }
                    const alive = spawned.some((f) => isFoeAlive(f));
                    if (alive) return;
                    clearInterval(timer);
                    const done = notifyCultPetitionProgress(entity, 'inquisition_cleared', {
                      siteKey: site.siteKey,
                      nowMinutes: worldMinutes,
                    });
                    if (done?.completed) {
                      say(t('apotheosis.petition.completedHud', 'Cult Petition Completed: +{faith} Faith, +{gold}g, +{inf}% Influence!', {
                        faith: done.faithGained,
                        gold: done.goldGained,
                        inf: done.influenceGained,
                      }));
                    }
                  }, 500);
                });
                say(t('apotheosis.petition.inqSpawnedHud', '{god}\'s Inquisitors storm the sanctum!', { god: petition.godName }));
              },
            });
          }
          petOpts.push({
            code: 'Digit2',
            label: `2 - ${t('apotheosis.petition.btnDismiss', 'Dismiss Petition')}`,
            action: () => {
              dismissCultPetition(entity);
              say(t('apotheosis.petition.dismissedHud', 'Pilgrim Petition dismissed.'));
            },
          });
          petOpts.push({
            code: 'Escape',
            label: `Esc - ${t('apotheosis.cult.btnBack', 'Back')}`,
            action: () => openCultAltarModal(entity, site, modalOpts),
          });
          showOverlay(new ChoiceWindow({
            lines: [
              t('apotheosis.petition.modalTitle', 'Pilgrim Petition'),
              petDesc,
              t('apotheosis.petition.rewardLine', 'Reward: +{faith} Faith · +{gold}g · +{inf}% Influence', {
                faith: petition.rewardFaith,
                gold: petition.rewardGold,
                inf: petition.rewardInfluence,
              }),
            ],
            options: petOpts,
          }));
        },
      });
    }
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
  const {
    built,
    renderer,
    pipeline,
    state,
    townTalk,
    modes,
    groundAt,
    worldMinutes,
    placeFeet,
    playerPos,
    playerFeet,
    collider,
    spawnExteriorFoe,
    exteriorFoes,
    teleToSiteCity,
    buildingDoors,
    currentLoc,
  } = deps;
  const _hatches = new Map(); // siteKey -> { site, pixel, localPose, locOrigin, mapTitle, worldPos, yaw, matrix, aabb, keeperPos, keeperAabb, remap }
  const _hatchBuckets = new Map(); // siteKey -> { bucket, sig }
  const _meshCache = new Map();
  const _activeSiegeBattles = new Map(); // siteKey -> { siteKey, attackers: [], defenders: [], pending: number, resolved: false }
  let _fallbackGpu = null;

  function hatchTitleFor(site) {
    if (!site) return '';
    const patron = getPantheonDeity(site.ownerId);
    const ownerName = playerEntity.name || t('apotheosis.cult.defaultAscendedName', 'Ascended');
    const domain = playerPortfolioLabel(playerEntity);
    return site.ownerId === 'player'
      ? t('apotheosis.cult.hatchPlayerTitleNamed', 'Undercroft of {player} ({portfolio})', { player: ownerName, portfolio: domain })
      : t('apotheosis.cult.hatchTitle', 'Subterranean Hatch ({god})', { god: patron?.name ?? site.ownerId });
  }

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

  function syncHatchColliders() {
    const col = typeof collider === 'function' ? collider() : collider;
    if (!col?.addMesh) return;
    for (const [sk, rec] of _hatchBuckets) {
      if (!_hatches.has(sk)) {
        col.removeBucket?.(rec.bucket);
        _hatchBuckets.delete(sk);
      }
    }
    const feet = typeof playerFeet === 'function' ? playerFeet() : (typeof playerPos === 'function' ? playerPos() : null);
    for (const [sk, h] of _hatches) {
      const sig = `${h.worldPos[0].toFixed(2)}:${h.worldPos[1].toFixed(2)}:${h.worldPos[2].toFixed(2)}`;
      const cur = _hatchBuckets.get(sk);
      if (cur && cur.sig === sig) continue;
      if (feet && isVec3(feet) && Math.abs(feet[0] - h.worldPos[0]) < 1.25 && Math.abs(feet[2] - h.worldPos[2]) < 1.25) {
        continue; // Do not trap player inside hatch collider while standing right on spawn spot
      }
      const bucket = `cultHatch:${sk}`;
      if (cur) col.removeBucket?.(bucket);
      col.addMesh(bucket, HATCH_COLLIDER_CPU.positions, HATCH_COLLIDER_CPU.indices, h.matrix);
      _hatchBuckets.set(sk, { bucket, sig });
    }
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
        buildingCount: p.homeFrames.size,
        factionDict: townTalk?.factionDict ?? null,
      });

      const isRoadLocal = (lx, lz) => {
        if (!p.tilemapBytes && !p.paths) return false;
        const tx = Math.floor(lx / RMB_TILE_SIDE);
        const tz = Math.floor(lz / RMB_TILE_SIDE);
        if (tx < 0 || tx >= TERRAIN_TILE_DIM || tz < 0 || tz >= TERRAIN_TILE_DIM) return false;
        const idx = tz * TERRAIN_TILE_DIM + tx;
        return (p.tilemapBytes ? onPathTile(p.tilemapBytes[idx] >> 2) : false) || !!p.paths?.[idx];
      };

      const pxT = state.pixelTranslation?.(p.px, p.py, tVec) ?? [0, 0, 0];
      for (const site of getCityCultSites(playerEntity, p.homeTown)) {
        if (site.kind !== 'sanctuary') continue;
        const localPose = pickSanctuaryHatchPosition(
          p.homeFrames,
          p.locationRect,
          null,
          site.siteKey,
          site.isPlayerFounded ? 1 : 0,
          isRoadLocal,
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
          localPose,
          locOrigin: p.locOrigin ?? [0, 0, 0],
          mapTitle: hatchTitleFor(site),
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
    syncHatchColliders();
    tickActiveSiegeBattles();
  }

  function applySiegeLootPolicy(rec) {
    if (!rec) return;
    const urbanLoot = LivingTamrielConfig.urbanLootMode;
    if (urbanLoot === LIVING_URBAN_LOOT.ZERO) {
      rec.lootDropped = true;
      rec._suppressLoot = true;
      if (rec.entity?.items) rec.entity.items = [];
    } else if (urbanLoot === LIVING_URBAN_LOOT.SUPPLIES) {
      rec.lootDropped = true;
      rec._suppressLoot = false;
      if (rec.entity) {
        const supplies = [goldStack(15 + Math.floor(Math.random() * 25))];
        if (Math.random() > 0.35) {
          const healRec = POTION_RECIPES.find((r) => r.name === 'healing');
          if (healRec) supplies.push(makePotion(potionRecipeKey(healRec.ingredients)));
        }
        rec.entity.items = supplies;
      }
    } else {
      rec.lootDropped = false;
      rec._suppressLoot = false;
    }
  }

  function resolveSiegeAnchor(site) {
    if (site.kind === 'sanctuary') {
      const h = _hatches.get(site.siteKey);
      if (h?.worldPos) {
        const yaw = Number(h.yaw) || 0;
        return {
          pos: [...h.worldPos],
          normal: [Math.cos(yaw), Math.sin(yaw)],
        };
      }
    }
    const pixels = built?.();
    if (pixels?.size) {
      let activePixel = null;
      for (const p of pixels.values()) {
        if (p?.homeTown && (Number(p.homeTown) >>> 0) === (Number(site.mapId) >>> 0)) {
          activePixel = p;
          break;
        }
      }
      if (activePixel) {
        const doors = typeof buildingDoors === 'function' ? buildingDoors() : [];
        const doorRec = (Array.isArray(doors) ? doors : []).find(
          (d) => d.pixelKey === activePixel.key && (d.buildingKey === site.buildingKey || d.door?.buildingKey === site.buildingKey),
        );
        if (doorRec?.door) {
          const dp = doorWorldPosition(doorRec.door);
          const dn = doorWorldNormal(doorRec.door);
          const len = Math.hypot(dn[0], dn[2]) || 1;
          const nx = dn[0] / len;
          const nz = dn[2] / len;
          const wx = dp[0] + nx * 2.5;
          const wz = dp[2] + nz * 2.5;
          const wy = typeof groundAt === 'function' ? groundAt(wx, wz) : dp[1];
          return {
            pos: [wx, Number.isFinite(wy) ? wy : dp[1], wz],
            normal: [nx, nz],
          };
        }
        const tFr = activePixel.homeFrames?.get(site.buildingKey);
        if (tFr?.box && tFr.box.length >= 6) {
          const tVec = [0, 0, 0];
          const pxT = state?.pixelTranslation?.(activePixel.px, activePixel.py, tVec) ?? [0, 0, 0];
          const wx = pxT[0] + (tFr.box[0] + tFr.box[3]) * 0.5;
          const wz = pxT[2] + tFr.box[5] + 3.0;
          const wy = typeof groundAt === 'function' ? groundAt(wx, wz) : pxT[1];
          return {
            pos: [wx, Number.isFinite(wy) ? wy : 0, wz],
            normal: [0, 1],
          };
        }
      }
    }
    const pPos = typeof playerPos === 'function' ? playerPos() : [0, 0, 0];
    return { pos: [pPos[0], pPos[1] || 0, pPos[2]], normal: [0, 1] };
  }

  function pickSiegeAttackerMob(godId, idx) {
    const deity = getPantheonDeity(godId);
    if (deity?.kind === 'daedra') {
      const pool = [MOBILE_TYPES.Daedroth, MOBILE_TYPES.DaedraSeducer, MOBILE_TYPES.FireDaedra, MOBILE_TYPES.FrostDaedra];
      return pool[idx % pool.length];
    }
    const pool = [MOBILE_TYPES.Knight, MOBILE_TYPES.Battlemage, MOBILE_TYPES.Spellsword, MOBILE_TYPES.Archer];
    return pool[idx % pool.length];
  }

  function pickSiegeDefenderMob(idx) {
    const pool = [MOBILE_TYPES.Knight, MOBILE_TYPES.Battlemage, MOBILE_TYPES.Healer];
    return pool[idx % pool.length];
  }

  function spawnSiegePoint([ax, ay, az], [nx, nz], dist, spreadRad) {
    const baseAng = Math.atan2(nx, nz) + spreadRad;
    const fx = ax + Math.sin(baseAng) * dist;
    const fz = az + Math.cos(baseAng) * dist;
    const fy = typeof groundAt === 'function' ? groundAt(fx, fz) : ay;
    const pt = [fx, Number.isFinite(fy) ? fy : ay, fz];
    const col = typeof collider === 'function' ? collider() : collider;
    if (col) freeLodgedFeet(col, pt);
    return pt;
  }

  function spawnCultSiegeBattle(siteKey) {
    if (typeof spawnExteriorFoe !== 'function') return false;
    if ((modes?.()?.mode ?? 'exterior') !== 'exterior') return false;
    const site = getCultSite(playerEntity, siteKey);
    if (!site || !site.siege) return false;
    if (_activeSiegeBattles.has(site.siteKey)) {
      const existing = _activeSiegeBattles.get(site.siteKey);
      if (!existing.resolved) return true;
    }

    const siege = site.siege;
    const anchorInfo = resolveSiegeAnchor(site);
    const [ax, ay, az] = anchorInfo.pos;
    const [nx, nz] = anchorInfo.normal;
    if (siege.remainingAttackers == null) {
      siege.remainingAttackers = Math.max(2, Number(siege.attackerCount) || 3);
    }
    const atkCount = Math.max(1, Number(siege.remainingAttackers) || 0);
    const defCount = Math.max(1, Number(siege.defenderCount) || 2);
    const rec = {
      siteKey: site.siteKey,
      attackers: [],
      defenders: [],
      countedDead: new Set(),
      pending: atkCount,
      resolved: false,
      dismissed: false,
    };
    _activeSiegeBattles.set(site.siteKey, rec);
    siege.spawned = true;

    const pLevel = Math.max(5, Number(playerEntity?.level ?? 5));
    const ownerName = playerEntity?.name || t('apotheosis.cult.defaultAscendedName', 'Ascended');

    for (let i = 0; i < atkCount; i++) {
      const tNorm = atkCount === 1 ? 0 : (i / (atkCount - 1)) - 0.5;
      const spread = tNorm * Math.PI * 0.72;
      const dist = 6.5 + (i % 2) * 2.0;
      const pos = spawnSiegePoint([ax, ay, az], [nx, nz], dist, spread);
      const mob = pickSiegeAttackerMob(siege.attackerGodId, i);
      Promise.resolve(spawnExteriorFoe(mob, pos, {
        yaw: Math.atan2(ax - pos[0], az - pos[2]),
        level: pLevel + 2,
        allied: false,
        team: 'PlayerEnemy',
        loose: true,
        transient: true,
        managed: true,
        feetGiven: true,
      })).then((foe) => {
        rec.pending = Math.max(0, rec.pending - 1);
        if (!foe) return;
        const ext = typeof exteriorFoes === 'function' ? exteriorFoes() : exteriorFoes;
        if (rec.dismissed) {
          ext?.removeFoe?.(foe);
          return;
        }
        foe.livingRole = 'cult_siege_attacker';
        foe._siegeSiteKey = site.siteKey;
        if (foe.entity) {
          foe.entity.name = `${siege.attackerGodName ?? siege.attackerGodId} Besieger`;
          foe.entity.team = 'PlayerEnemy';
          foe.entity.mobileTeam = 'PlayerEnemy';
          foe.entity.skirmishForceInfighting = true;
        }
        if (foe.ai) {
          foe.ai.isHostile = true;
          foe.ai.detected = true;
          foe.ai.target = playerEntity;
        }
        applySiegeLootPolicy(foe);
        rec.attackers.push(foe);
      }).catch(() => {
        rec.pending = Math.max(0, rec.pending - 1);
      });
    }

    for (let i = 0; i < defCount; i++) {
      const tNorm = defCount === 1 ? 0 : (i / (defCount - 1)) - 0.5;
      const spread = tNorm * Math.PI * 0.6;
      const dist = 2.6 + (i % 2) * 0.9;
      const pos = spawnSiegePoint([ax, ay, az], [nx, nz], dist, spread);
      const mob = pickSiegeDefenderMob(i);
      Promise.resolve(spawnExteriorFoe(mob, pos, {
        yaw: Math.atan2(nx, nz),
        level: pLevel + (site.branch === 'militant' ? 2 : 0),
        allied: true,
        team: 'PlayerAlly',
        loose: true,
        transient: true,
        managed: true,
        feetGiven: true,
      })).then((ally) => {
        if (!ally) return;
        const ext = typeof exteriorFoes === 'function' ? exteriorFoes() : exteriorFoes;
        if (rec.dismissed) {
          ext?.removeFoe?.(ally);
          return;
        }
        ally.livingRole = 'cult_siege_defender';
        ally.allied = true;
        ally.shipmate = true;
        ally._siegeSiteKey = site.siteKey;
        if (ally.entity) {
          ally.entity.name = `${ownerName}'s Temple Garrison`;
          ally.entity.team = 'PlayerAlly';
          ally.entity.mobileTeam = 'PlayerAlly';
          ally.entity.skirmishNeutralToPlayer = true;
          ally.entity.skirmishForceInfighting = true;
          if (site.branch === 'militant' && Number.isFinite(ally.entity.maxHealth)) {
            const boosted = Math.round(ally.entity.maxHealth * 1.35);
            ally.entity.maxHealth = boosted;
            ally.entity.health = boosted;
            ally.entity.currentHealth = boosted;
          }
        }
        if (ally.ai) {
          ally.ai.isHostile = true;
          ally.ai.detected = true;
          ally.ai.target = null;
        }
        applySiegeLootPolicy(ally);
        rec.defenders.push(ally);
      }).catch(() => {});
    }
    return true;
  }

  function dismissCultSiegeBattle(siteKey = null) {
    const ext = typeof exteriorFoes === 'function' ? exteriorFoes() : exteriorFoes;
    const extList = ext?.foes ?? [];
    const targetKeys = siteKey ? [siteKey] : [..._activeSiegeBattles.keys()];
    const dismissedFoes = new Set();
    let count = 0;

    const retireFoe = (f) => {
      if (!f || dismissedFoes.has(f)) return;
      dismissedFoes.add(f);
      count++;
      if (f.ai) {
        f.ai.isHostile = false;
        f.ai.detected = false;
        f.ai.target = null;
        f.ai.secondaryTarget = null;
        f.ai.targetSenses = null;
      }
      if (f.dead) {
        ext?.removeFoe?.(f);
        return;
      }
      const removeNow = () => {
        if (typeof ext?.removeFoe === 'function') ext.removeFoe(f);
        else if (Array.isArray(extList)) {
          const idx = extList.indexOf(f);
          if (idx >= 0) extList.splice(idx, 1);
        }
      };
      if (typeof ext?.companionFx?.leave === 'function' && f.ai) {
        ext.companionFx.leave(f, removeNow);
      } else {
        removeNow();
      }
    };

    for (const sk of targetKeys) {
      const battle = _activeSiegeBattles.get(sk);
      if (battle) {
        battle.resolved = true;
        battle.dismissed = true;
        for (const a of battle.attackers) retireFoe(a);
        for (const d of battle.defenders) retireFoe(d);
        _activeSiegeBattles.delete(sk);
      }
      if (Array.isArray(extList)) {
        for (const f of [...extList]) {
          if (f && f._siegeSiteKey === sk) retireFoe(f);
        }
      }
    }
    return count;
  }

  function tickActiveSiegeBattles() {
    if ((modes?.()?.mode ?? 'exterior') !== 'exterior') return;
    const pixels = built?.();
    const extList = typeof exteriorFoes === 'function' ? exteriorFoes()?.foes : exteriorFoes?.foes;

    // Auto-spawn siege force if player walks into a besieged city in exterior
    if (pixels?.size) {
      for (const p of pixels.values()) {
        if (!p?.homeTown) continue;
        for (const s of getActiveCultSieges(playerEntity)) {
          if ((Number(s.mapId) >>> 0) === (Number(p.homeTown) >>> 0) && !s.siege?.spawned && !_activeSiegeBattles.has(s.siteKey)) {
            spawnCultSiegeBattle(s.siteKey);
          }
        }
      }
    }

    for (const [sk, battle] of _activeSiegeBattles) {
      if (battle.resolved) continue;
      const site = getCultSite(playerEntity, sk);
      if (!site || !site.siege) {
        dismissCultSiegeBattle(sk);
        continue;
      }

      // Count genuine attacker deaths only; leaving town / distance culling must NEVER grant a win!
      for (const a of battle.attackers) {
        if (a?.dead && !battle.countedDead.has(a)) {
          battle.countedDead.add(a);
          const total = Math.max(1, Number(site.siege.attackerCount) || battle.attackers.length);
          site.siege.remainingAttackers = Math.max(0, Number(site.siege.remainingAttackers ?? total) - 1);
          const left = site.siege.remainingAttackers;
          if (left > 0) {
            const slain = Math.max(1, total - left);
            townTalk?.say?.(t(
              'apotheosis.siege.killProgress',
              'Siege of {site}: {slain}/{total} besiegers slain ({left} left)!',
              { site: site.name, slain, total, left },
            ), 4);
          }
        }
      }

      const liveAtk = battle.attackers.filter((f) => f && !f.dead && (!extList || extList.includes(f)));
      const liveDef = battle.defenders.filter((f) => f && !f.dead && (!extList || extList.includes(f)));

      for (const d of liveDef) {
        d.allied = true;
        d.shipmate = true;
        if (d.entity) {
          d.entity.team = 'PlayerAlly';
          d.entity.mobileTeam = 'PlayerAlly';
          d.entity.skirmishNeutralToPlayer = true;
          d.entity.skirmishForceInfighting = liveAtk.length > 0;
        }
        if (d.ai) {
          d.ai.isHostile = liveAtk.length > 0;
          if (!d.ai.target || d.ai.target.dead || d.ai.target === playerEntity || d.ai.target.isPlayer) {
            d.ai.target = liveAtk[0] ?? null;
            d.ai.targetSenses = d.ai.target;
          }
        }
      }
      for (const a of liveAtk) {
        if (a.ai && (!a.ai.target || a.ai.target.dead)) {
          a.ai.target = liveDef[0] ?? playerEntity;
          a.ai.targetSenses = a.ai.target;
        }
      }

      if (site.siege.remainingAttackers <= 0) {
        battle.resolved = true;
        _activeSiegeBattles.delete(sk);
        for (const d of battle.defenders) {
          if (!d || d.dead) continue;
          d.allied = true;
          d.shipmate = true;
          if (d.entity) {
            d.entity.team = 'PlayerAlly';
            d.entity.mobileTeam = 'PlayerAlly';
            d.entity.skirmishNeutralToPlayer = true;
            d.entity.skirmishForceInfighting = false;
          }
          if (d.ai) {
            d.ai.isHostile = false;
            d.ai.detected = false;
            d.ai.target = null;
            d.ai.secondaryTarget = null;
            d.ai.targetSenses = null;
          }
        }
        const nowMin = Math.floor(worldMinutes?.() ?? 0);
        const res = resolveCultSiegeOutcome(playerEntity, sk, 'victory', { nowMinutes: nowMin });
        if (res.ok) townTalk?.say?.(res.message, 6);
      } else if (battle.pending <= 0 && battle.attackers.length > 0 && liveAtk.length === 0) {
        // Attackers were culled when player left the settlement — allow respawning remaining attackers on return
        _activeSiegeBattles.delete(sk);
        site.siege.spawned = false;
      }
    }
  }

  async function defendCultSiege(siteKey = null, { force = false } = {}) {
    const site = siteKey
      ? getCultSite(playerEntity, siteKey)
      : (getActiveCultSieges(playerEntity)[0] ?? null);
    if (!site || !site.siege) {
      return { ok: false, reason: t('apotheosis.siege.errNoActiveSiege', 'That sanctum is not currently under siege.') };
    }
    const curLoc = typeof currentLoc === 'function' ? currentLoc() : null;
    const sameTownExterior = (Number(curLoc?.mapTableData?.mapId ?? 0) >>> 0) === (Number(site.mapId) >>> 0)
      && (modes?.()?.mode ?? 'exterior') === 'exterior';

    if (!sameTownExterior && !force) {
      const spend = spendApotheosisFaith(playerEntity, CULT_TELEPORT_SANCTUARY_FAITH_COST, { reason: 'defend_siege' });
      if (!spend.ok) return { ok: false, reason: spend.error };
    }
    if ((modes?.()?.mode ?? 'exterior') !== 'exterior') {
      modes?.()?.forceExitToExterior?.();
    }
    const afterLoc = typeof currentLoc === 'function' ? currentLoc() : null;
    if ((Number(afterLoc?.mapTableData?.mapId ?? 0) >>> 0) !== (Number(site.mapId) >>> 0) && typeof teleToSiteCity === 'function') {
      await teleToSiteCity(site);
    }
    frame();
    if (typeof placeFeet === 'function') {
      const anchor = resolveSiegeAnchor(site);
      const lookYaw = Math.atan2(anchor.normal[0], anchor.normal[1]);
      const playerSpawnPt = spawnSiegePoint(anchor.pos, anchor.normal, 1.0, 0);
      placeFeet([playerSpawnPt[0], playerSpawnPt[1] + 0.15, playerSpawnPt[2]], lookYaw);
    } else {
      const tpKind = site.kind === 'temple' ? 'temple' : (site.isPlayerFounded ? 'player' : 'daedra');
      teleportNearCultTarget(tpKind);
    }
    if (_activeSiegeBattles.get(site.siteKey)?.resolved === false) {
      _activeSiegeBattles.delete(site.siteKey);
    }
    site.siege.spawned = false;
    spawnCultSiegeBattle(site.siteKey);
    return { ok: true, site, message: t('apotheosis.siege.deployedHud', 'Arrived at {site} to break the siege!', { site: site.name }) };
  }

  function spawnAlarmOutside(siteKey) {
    if (typeof spawnExteriorFoe !== 'function') return false;
    if ((modes?.()?.mode ?? 'exterior') !== 'exterior') return false;
    if (!_hatches.has(siteKey)) frame();
    const h = _hatches.get(siteKey);
    const site = h?.site ?? getCultSite(playerEntity, siteKey);
    if (!h?.worldPos || !site || site.ownerId === 'player') return false;
    const nowMin = Math.floor(worldMinutes?.() ?? 0);
    if (site._lastOutdoorAlarmMin != null && (nowMin - site._lastOutdoorAlarmMin) < 15) return false;
    site._lastOutdoorAlarmMin = nowMin;

    const count = 3;
    const [hx, hy, hz] = h.worldPos;
    for (let i = 0; i < count; i++) {
      const ang = (i * Math.PI * 2) / count + 0.4;
      const gx = hx + Math.cos(ang) * 2.1;
      const gz = hz + Math.sin(ang) * 2.1;
      const gy = typeof groundAt === 'function' ? groundAt(gx, gz) : hy;
      const mob = pickGuardianMobType(site, i);
      const pos = [gx, Number.isFinite(gy) ? gy : hy, gz];
      Promise.resolve(spawnExteriorFoe(mob, pos, {
        yaw: Math.atan2(hx - gx, hz - gz),
        loose: true,
        hostile: true,
        feetGiven: true,
      })).catch(() => {});
    }
    return true;
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
        reach: DOOR_ACTIVATION_DISTANCE,
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
      const siteKey = key.slice('cultHatch:'.length);
      const site = getCultSite(playerEntity, siteKey);
      if (!site) return null;
      discoverCultSite(playerEntity, siteKey);
      const title = hatchTitleFor(site);
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
    const nowMin = Math.floor(worldMinutes?.() ?? 0);
    if (key.startsWith('cultKeeper:')) {
      const siteKey = key.slice('cultKeeper:'.length);
      const site = getCultSite(playerEntity, siteKey);
      if (!site) return false;
      const actMode = interactionMode === 'steal' ? 'pickpocket' : 'loot';
      const r = obtainSanctuaryKeyFromGatekeeper(playerEntity, siteKey, actMode, { nowMinutes: nowMin });
      townTalk?.say?.(r.ok ? r.message : r.reason);
      if (r.alarm) spawnAlarmOutside(siteKey);
      return true;
    }
    if (key.startsWith('cultHatch:')) {
      const siteKey = key.slice('cultHatch:'.length);
      const h = _hatches.get(siteKey);
      const site = h?.site ?? getCultSite(playerEntity, siteKey);
      if (!site) return false;
      discoverCultSite(playerEntity, siteKey);
      const enterNow = (s) => modes?.()?.enterCultSanctuary?.(s, h ? { worldPos: h.worldPos, yaw: h.yaw, pixel: h.pixel } : {});
      if (site.unlocked || site.ownerId === 'player') {
        enterNow(site);
        return true;
      }
      if (interactionMode === 'steal') {
        const r = attemptUnlockSanctuaryHatch(playerEntity, siteKey, 'lockpick', { nowMinutes: nowMin });
        townTalk?.say?.(r.ok ? r.message : r.reason);
        if (r.alarm) {
          spawnAlarmOutside(siteKey);
          return true;
        }
        if (r.ok) enterNow(site);
        return true;
      }
      return openSanctuaryHatchModal(playerEntity, site, {
        showOverlay: (w) => townTalk?.showOverlay?.(w),
        say: (l) => townTalk?.say?.(l),
        onEnterSanctuary: enterNow,
        onAlarmTriggered: (s) => spawnAlarmOutside(s.siteKey),
        worldMinutes: nowMin,
      });
    }
    return false;
  }

  function locateSite(siteKey) {
    if (!_hatches.has(siteKey)) frame();
    return _hatches.get(siteKey) ?? null;
  }

  function isNearSiteHatch(siteKey, maxDist = 4.5) {
    if ((modes?.()?.mode ?? 'exterior') !== 'exterior') return false;
    if (!_hatches.has(siteKey)) frame();
    const h = _hatches.get(siteKey);
    if (!h?.worldPos) return false;
    const candidates = [
      typeof playerPos === 'function' ? playerPos() : null,
      typeof playerFeet === 'function' ? playerFeet() : null,
    ];
    for (const p of candidates) {
      if (isVec3(p) && Math.hypot(p[0] - h.worldPos[0], p[2] - h.worldPos[2]) <= maxDist) {
        return true;
      }
    }
    return false;
  }

  function townMapHatches(mapId) {
    if (!_hatches.size) frame();
    const mid = Number(mapId) >>> 0;
    const out = [];
    for (const h of _hatches.values()) {
      if ((Number(h.site?.mapId) >>> 0) !== mid) continue;
      const lx = h.localPose?.[0] ?? 0;
      const lz = h.localPose?.[2] ?? 0;
      const ox = h.locOrigin?.[0] ?? 0;
      const oz = h.locOrigin?.[2] ?? 0;
      out.push({
        siteKey: h.site.siteKey,
        x: lx - ox,
        z: lz - oz,
        name: hatchTitleFor(h.site),
        discovered: !!(h.site.discovered || h.site.unlocked || h.site.ownerId === 'player'),
        ownerId: h.site.ownerId,
      });
    }
    return out;
  }

  function teleportNearCultTarget(targetKind = 'daedra') {
    const k = String(targetKind ?? 'daedra').toLowerCase().trim();
    if (typeof placeFeet !== 'function') {
      return { ok: false, message: 'Teleport runtime is not ready here.' };
    }
    if (k === 'altar') {
      const m = modes?.();
      if ((m?.mode ?? 'exterior') !== 'interior' || !m?.interiorCtx) {
        return { ok: false, message: 'Enter a Temple or Underground Sanctuary first to teleport to its Altar.' };
      }
      const ic = m.interiorCtx;
      const anchor = ic.cultAltarAnchors?.[0];
      const stateAabb = ic._cultAltarState?.aabb;
      let ax, ay, az;
      if (anchor?.pos) {
        [ax, ay, az] = anchor.pos;
      } else if (stateAabb) {
        ax = (stateAabb.min[0] + stateAabb.max[0]) * 0.5;
        ay = stateAabb.min[1];
        az = (stateAabb.min[2] + stateAabb.max[2]) * 0.5;
      } else if (ic.landing) {
        ax = ic.landing[0];
        ay = ic.landing[1];
        az = ic.landing[2] + 2.2;
      } else {
        return { ok: false, message: 'Could not locate an Altar anchor inside this interior.' };
      }
      const land = ic.landing ?? [ax, ay, az - 2.0];
      const dirX = land[0] - ax;
      const dirZ = land[2] - az;
      const dirLen = Math.hypot(dirX, dirZ);
      const baseUx = dirLen > 0.05 ? dirX / dirLen : 0;
      const baseUz = dirLen > 0.05 ? dirZ / dirLen : -1;
      const candidates = [
        [ax + baseUx * 1.45, az + baseUz * 1.45],
        [ax, az - 1.45],
        [ax, az + 1.45],
        [ax - 1.45, az],
        [ax + 1.45, az],
      ];
      let chosen = candidates[0];
      let chosenY = ay;
      for (const [cx, cz] of candidates) {
        const fy = ic.collider?.heightAt?.(cx, cz);
        if (Number.isFinite(fy) && Math.abs(fy - ay) <= 1.2) {
          chosen = [cx, cz];
          chosenY = fy;
          break;
        }
      }
      const [wx, wz] = chosen;
      const lookYaw = Math.atan2(ax - wx, az - wz);
      placeFeet([wx, chosenY + 0.1, wz], lookYaw);
      return { ok: true, message: 'Teleported in front of the interior Altar.' };
    }
    if ((modes?.()?.mode ?? 'exterior') !== 'exterior') {
      return { ok: false, message: 'Exit the interior to the street before teleporting within the settlement.' };
    }
    const pixels = built?.();
    if (!pixels || !pixels.size) {
      return { ok: false, message: 'No built town blocks are loaded here.' };
    }
    const loc = typeof currentLoc === 'function' ? currentLoc() : null;
    const curMapId = Number(loc?.mapTableData?.mapId ?? 0) >>> 0;
    let activePixel = null;
    for (const p of pixels.values()) {
      if (!p?.homeTown) continue;
      if (curMapId && (Number(p.homeTown) >>> 0) === curMapId) {
        activePixel = p;
        break;
      }
      if (!activePixel) activePixel = p;
    }
    if (!activePixel) {
      return { ok: false, message: 'You are not currently inside a settlement.' };
    }
    const townLabel = activePixel.homeName || loc?.name || `Town #${activePixel.homeTown}`;

    if (k === 'temple' || k === 'aedra') {
      const frames = activePixel.homeFrames;
      let templeBk = null;
      let templeFr = null;
      if (frames?.size) {
        for (const [bk, fr] of frames) {
          if (fr?.type === BUILDING_TYPES.Temple) {
            templeBk = bk;
            templeFr = fr;
            break;
          }
        }
      }
      if (!templeFr) {
        return { ok: false, message: `No Aedra Temple exists in ${townLabel}.` };
      }
      const doors = typeof buildingDoors === 'function' ? buildingDoors() : [];
      const doorRec = (Array.isArray(doors) ? doors : []).find(
        (d) => d.pixelKey === activePixel.key && (d.buildingKey === templeBk || d.door?.buildingKey === templeBk),
      );
      if (doorRec?.door) {
        const dp = doorWorldPosition(doorRec.door);
        const dn = doorWorldNormal(doorRec.door);
        const wx = dp[0] + dn[0] * 2.2;
        const wz = dp[2] + dn[2] * 2.2;
        const wy = typeof groundAt === 'function' ? groundAt(wx, wz) : dp[1];
        const lookYaw = Math.atan2(-dn[0], -dn[2]);
        placeFeet([wx, (Number.isFinite(wy) ? wy : dp[1]) + 0.15, wz], lookYaw);
        return { ok: true, message: `Teleported to Temple entrance in ${townLabel}.` };
      }
      const b = templeFr.box;
      if (Array.isArray(b) && b.length >= 6) {
        const tVec = [0, 0, 0];
        const pxT = state?.pixelTranslation?.(activePixel.px, activePixel.py, tVec) ?? [0, 0, 0];
        const wx = pxT[0] + (b[0] + b[3]) * 0.5;
        const wz = pxT[2] + b[5] + 2.5;
        const wy = typeof groundAt === 'function' ? groundAt(wx, wz) : pxT[1];
        placeFeet([wx, (Number.isFinite(wy) ? wy : 0) + 0.15, wz], Math.PI);
        return { ok: true, message: `Teleported beside Temple in ${townLabel}.` };
      }
      return { ok: false, message: `Could not resolve Temple coordinates in ${townLabel}.` };
    }

    const wantPlayer = k === 'player' || k === 'own' || k === 'undercroft';
    let chosenHatch = null;
    for (const h of _hatches.values()) {
      if ((Number(h.site?.mapId) >>> 0) !== (Number(activePixel.homeTown) >>> 0)) continue;
      if (wantPlayer ? h.site.isPlayerFounded : !h.site.isPlayerFounded) {
        chosenHatch = h;
        break;
      }
    }
    if (!chosenHatch) {
      return {
        ok: false,
        message: wantPlayer
          ? `No Player Undercroft hatch exists in ${townLabel}. Found one in Cult & Sanctuaries first.`
          : `No Daedric subterranean hatch found in ${townLabel}.`,
      };
    }
    const [hx, hy, hz] = chosenHatch.worldPos;
    const wx = hx - 1.8;
    const wz = hz;
    const wy = typeof groundAt === 'function' ? groundAt(wx, wz) : hy;
    const lookYaw = Math.atan2(hx - wx, hz - wz);
    placeFeet([wx, (Number.isFinite(wy) ? wy : hy) + 0.15, wz], lookYaw);
    return { ok: true, message: `Teleported to ${chosenHatch.site.name} hatch in ${townLabel}.` };
  }

  return {
    frame,
    draw,
    targets,
    hoverName,
    activate,
    locateSite,
    isNearSiteHatch,
    teleportNearCultTarget,
    spawnAlarmOutside,
    townMapHatches,
    spawnCultSiegeBattle,
    dismissCultSiegeBattle,
    defendCultSiege,
  };
}

const ALTAR_PRIMARY_PEDESTAL_IDS = new Set([74091, 74082, 74086, 74237]);
const ALTAR_MODEL_CANDIDATES = new Set([74091, 74082, 74086, 74237, 41020, 41016, 41017]);

function clearCustomAltarVisual(ctx, renderer) {
  const prev = ctx?._cultAltarState;
  if (!prev) return;
  if (prev.batch && Array.isArray(ctx.billboardBatches)) {
    const idx = ctx.billboardBatches.indexOf(prev.batch);
    if (idx >= 0) ctx.billboardBatches.splice(idx, 1);
    try { renderer?.destroyBatch?.(prev.batch); } catch { /* noop */ }
  }
  if (prev.drawEntry && Array.isArray(ctx.drawList)) {
    const idx = ctx.drawList.indexOf(prev.drawEntry);
    if (idx >= 0) ctx.drawList.splice(idx, 1);
  }
  ctx._cultAltarState = null;
}

/**
 * Collects an interactive Altar ray target (`cultAltar:<siteKey>`) inside Temples &
 * Underground Sanctuaries, mounting a 2D deity statue billboard for non-player sites or
 * the player's chosen 2D/3D Altar Statue when owned — always with ZERO physical collision.
 */
export function interiorCultAltarTargets(ctx, entity, building, mapId, renderer = null, pipeline = null) {
  if (!ctx || !entity || !building) return [];
  const mid = (Number(mapId ?? building.townMapId ?? 0) >>> 0);
  const bk = Math.trunc(Number(building.buildingKey) || 0);
  const site = building.cultSiteKey ? getCultSite(entity, building.cultSiteKey) : getCultSiteByBuilding(entity, mid, bk);
  if (!site) return [];

  const owned = site.ownerId === 'player';
  const anchor = Array.isArray(ctx.cultAltarAnchors) && ctx.cultAltarAnchors.length ? ctx.cultAltarAnchors[0] : null;
  const vanillaDraws = (ctx.drawList ?? []).filter((s) => s && !s._cultAltarCustom && ALTAR_MODEL_CANDIDATES.has(Number(s.modelIdNum)));
  let vanillaDraw = null;
  if (anchor && vanillaDraws.length) {
    vanillaDraw = vanillaDraws.find((d) =>
      Number(d.modelIdNum) === Number(anchor.modelIdNum)
      && d.aabb
      && Math.hypot(
        (d.aabb.min[0] + d.aabb.max[0]) * 0.5 - anchor.pos[0],
        d.aabb.min[1] - anchor.pos[1],
        (d.aabb.min[2] + d.aabb.max[2]) * 0.5 - anchor.pos[2],
      ) < 0.6,
    ) ?? null;
  }
  if (!vanillaDraw && vanillaDraws.length) {
    vanillaDraw = vanillaDraws.find((d) => ALTAR_PRIMARY_PEDESTAL_IDS.has(Number(d.modelIdNum))) ?? vanillaDraws[0];
  }

  let altarPos = null;
  let fallbackAabb = null;
  if (anchor?.pos) {
    altarPos = [...anchor.pos];
    fallbackAabb = anchor.aabb ?? null;
  } else if (vanillaDraw?.aabb) {
    altarPos = [
      (vanillaDraw.aabb.min[0] + vanillaDraw.aabb.max[0]) * 0.5,
      vanillaDraw.aabb.min[1],
      (vanillaDraw.aabb.min[2] + vanillaDraw.aabb.max[2]) * 0.5,
    ];
    fallbackAabb = vanillaDraw.aabb;
  } else {
    const center = ctx.landing ?? [0, 0, 0];
    altarPos = [center[0], center[1], center[2] + 2.2];
    fallbackAabb = {
      min: [altarPos[0] - 0.75, altarPos[1], altarPos[2] - 0.75],
      max: [altarPos[0] + 0.75, altarPos[1] + 1.9, altarPos[2] + 0.75],
    };
  }

  const isPrimaryPedestal = Boolean(vanillaDraw && ALTAR_PRIMARY_PEDESTAL_IDS.has(Number(vanillaDraw.modelIdNum)));
  const playerStyle = owned ? getCultAltarStyle(entity) : null;
  const useModelStyle = Boolean(owned && playerStyle?.kind === 'model');

  // Keep original Temple marble/stone pedestal visible when mounting a 2D deity/player statue on top of it;
  // hide 41020 lecterns or hide the pedestal when replacing it with a full 3D statue model.
  if (vanillaDraw) {
    vanillaDraw._batched = isPrimaryPedestal ? useModelStyle : true;
  }

  const pedestalTopY = isPrimaryPedestal && !useModelStyle && vanillaDraw?.aabb
    ? vanillaDraw.aabb.max[1]
    : altarPos[1];

  if (renderer && pipeline) {
    const deityFlat = (!owned && DEITY_DEFAULT_ALTAR_BY_GOD[site.ownerId]) || DEITY_DEFAULT_ALTAR_FLAT;
    const mountTag = isPrimaryPedestal && !useModelStyle ? `ped:${Math.round(pedestalTopY * 100)}` : `flr:${Math.round(altarPos[1] * 100)}`;
    const wantKey = playerStyle
      ? `player:${playerStyle.id}:${mountTag}`
      : `deity:${deityFlat.archive}:${deityFlat.record}:${mountTag}`;

    if (ctx._cultAltarState?.key !== wantKey) {
      clearCustomAltarVisual(ctx, renderer);
      const stateRec = { key: wantKey, batch: null, drawEntry: null, aabb: null };
      ctx._cultAltarState = stateRec;

      if (!useModelStyle) {
        const archive = playerStyle ? playerStyle.archive : deityFlat.archive;
        const record = playerStyle ? playerStyle.record : deityFlat.record;
        if (pipeline.getTexture && renderer.createBillboardBatch) {
          Promise.resolve(pipeline.getTexture(archive)).then((tex) => {
            if (ctx._cultAltarState !== stateRec || !tex || tex.recordCount <= 0) return;
            const useRec = record < tex.recordCount ? record : 0;
            pipeline.uploadRecord?.(archive, useRec);
            const rawSz = billboardSize(tex, useRec);
            const rawH = Number(rawSz?.h) || 1.8;
            const rawW = Number(rawSz?.w) || 1.0;
            const maxH = isPrimaryPedestal ? 1.85 : 2.05;
            const minH = isPrimaryPedestal ? 1.25 : 1.45;
            const targetH = Math.max(minH, Math.min(maxH, rawH));
            const scale = rawH > 0 ? (targetH / rawH) : 1;
            const sz = { w: rawW * scale, h: targetH };
            const basePos = [altarPos[0], pedestalTopY, altarPos[2]];
            const batch = renderer.createBillboardBatch(archive, useRec, sz, [basePos]);
            if (batch && Array.isArray(ctx.billboardBatches)) {
              ctx.billboardBatches.push(batch);
              stateRec.batch = batch;
              const hw = Math.max(0.55, sz.w * 0.5);
              stateRec.aabb = {
                min: [altarPos[0] - hw, Math.min(altarPos[1], pedestalTopY) - 0.1, altarPos[2] - hw],
                max: [altarPos[0] + hw, pedestalTopY + targetH, altarPos[2] + hw],
              };
            }
          }).catch(() => {});
        }
      } else if (playerStyle?.kind === 'model' && pipeline.getGpuMesh) {
        Promise.resolve(pipeline.getGpuMesh(playerStyle.modelId)).then((gpu) => {
          if (ctx._cultAltarState !== stateRec || !gpu) return;
          const cpu = pipeline.cpuModels?.get(playerStyle.modelId);
          let mat = yRotationMatrix(altarPos, 0);
          let aabb = {
            min: [altarPos[0] - 0.75, altarPos[1] - 0.1, altarPos[2] - 0.75],
            max: [altarPos[0] + 0.75, altarPos[1] + 2.0, altarPos[2] + 0.75],
          };
          if (cpu?.positions) {
            const rawBox = worldAabb(cpu.positions, yRotationMatrix([0, 0, 0], 0));
            const rawH = Math.max(0.25, rawBox.max[1] - rawBox.min[1]);
            const targetH = Math.max(1.45, Math.min(2.1, rawH));
            const s = targetH / rawH;
            const baseY = altarPos[1] - rawBox.min[1] * s;
            mat = new Float32Array([
              s, 0, 0, 0,
              0, s, 0, 0,
              0, 0, s, 0,
              altarPos[0], baseY, altarPos[2], 1,
            ]);
            aabb = {
              min: [altarPos[0] + rawBox.min[0] * s, altarPos[1], altarPos[2] + rawBox.min[2] * s],
              max: [altarPos[0] + rawBox.max[0] * s, altarPos[1] + targetH, altarPos[2] + rawBox.max[2] * s],
            };
          }
          const drawEntry = {
            mesh: gpu,
            matrix: mat,
            key: `cultAltarCustom:${site.siteKey}`,
            aabb,
            modelIdNum: playerStyle.modelId,
            _batched: false,
            _cultAltarCustom: true,
          };
          ctx.drawList?.push(drawEntry);
          stateRec.drawEntry = drawEntry;
          stateRec.aabb = aabb;
        }).catch(() => {});
      }
    }
  }

  const sBox = ctx._cultAltarState?.aabb;
  const box = sBox && fallbackAabb
    ? {
        min: [
          Math.min(sBox.min[0], fallbackAabb.min[0]),
          Math.min(sBox.min[1], fallbackAabb.min[1]),
          Math.min(sBox.min[2], fallbackAabb.min[2]),
        ],
        max: [
          Math.max(sBox.max[0], fallbackAabb.max[0]),
          Math.max(sBox.max[1], fallbackAabb.max[1]),
          Math.max(sBox.max[2], fallbackAabb.max[2]),
        ],
      }
    : (sBox ?? fallbackAabb);
  return [{
    key: `cultAltar:${site.siteKey}`,
    aabb: {
      min: [box.min[0] - 0.25, box.min[1] - 0.2, box.min[2] - 0.25],
      max: [box.max[0] + 0.25, box.max[1] + 0.35, box.max[2] + 0.25],
    },
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
  const ownerName = entity?.name || t('apotheosis.cult.defaultAscendedName', 'Ascended');
  const domain = playerPortfolioLabel(entity);
  const title = site.ownerId === 'player'
    ? t('apotheosis.cult.altarOwnedTitleNamed', 'Altar of {player} ({portfolio} • Tier {tier})', {
        player: ownerName,
        portfolio: domain,
        tier: site.tier || 1,
      })
    : t('apotheosis.cult.altarPatronTitle', 'Altar of {god}', { god: patron?.name ?? site.ownerId });
  return { title, subs: [t('apotheosis.cult.altarClickHint', 'Consecrate / Manage Cult Sanctum')] };
}

/** Handles clicking an interior Cult Altar (`cultAltar:<siteKey>`). */
export function activateInteriorCultAltar(entity, key, opts = {}) {
  if (typeof key !== 'string' || !key.startsWith('cultAltar:')) return false;
  const site = getCultSite(entity, key.slice('cultAltar:'.length));
  if (!site) return false;
  return openCultAltarModal(entity, site, opts);
}
