// @ts-check
// ═══════════════════════════════════════════════════════════════════
// ENCOUNTER & SPAWNER DIAGNOSTIC LOGGER (Daggerfall Forever)
//
// Intercepts entity creation (minting), progression scaling, and world
// placement. Tracks:
// - "Why / Who triggered the spawn" (origin via call site & stack trace)
// - "What entity was assembled" (mobileType, level, base stats, health)
// - "How it was modified" (progression scaling, champion traits, elite status)
// - "Where & with whom" (coordinates, teams, quest/world flags)
//
// Stores an in-memory ring buffer of recent spawns and automatically
// persists dumps to logs/encounters/ (retaining last 5 logs).
// ═══════════════════════════════════════════════════════════════════

import { playerEntity } from '../../characters/playerEntity.js';

const MAX_ENCOUNTER_BUFFER = 200;
let _spawnCounter = 0;

/** @type {Array<Record<string, any>>} */
const _recentSpawns = [];

/** @type {WeakMap<object, Record<string, any>>} */
const _entityRecordMap = new WeakMap();

/**
 * Inspect call stack to determine which subsystem requested the entity creation.
 * @param {object} [explicitContext]
 * @returns {{ system: string, reason: string, callSite: string }}
 */
export function detectSpawningOrigin(explicitContext = null) {
  if (explicitContext && explicitContext.system) {
    return {
      system: explicitContext.system,
      reason: explicitContext.reason || 'Explicit context',
      callSite: explicitContext.callSite || 'explicit',
    };
  }

  const err = new Error();
  const stack = err.stack || '';
  const lines = stack.split('\n').map((l) => l.trim()).filter((l) => !l.includes('encounterLogger.js') && !l.includes('detectSpawningOrigin') && l.includes('at '));
  const topCaller = lines[1] || lines[0] || 'unknown';

  let system = 'EncounterEngine';
  let reason = 'Ambient / Unknown trigger';

  if (stack.includes('campEncounters')) {
    system = 'CampEncounters';
    reason = 'Wilderness camp spawn / ambush';
  } else if (stack.includes('roadEncounters')) {
    system = 'RoadEncounters';
    reason = 'Road travel encounter / danger check';
  } else if (stack.includes('cityGuards')) {
    system = 'CityGuards';
    reason = 'City watch response / Curfew patrol / Crime alert';
  } else if (stack.includes('dungeonRespawn')) {
    system = 'DungeonRespawn';
    reason = 'Dungeon room repopulation tick';
  } else if (stack.includes('deepWaters')) {
    system = 'DeepWaters';
    reason = 'Ocean / deep water predator spawn';
  } else if (stack.includes('consoleCommands')) {
    system = 'Console';
    reason = 'Developer console spawn command';
  } else if (stack.includes('witchHunters') || stack.includes('necro')) {
    system = 'NecromancyPurifiers';
    reason = 'Witch hunter / purifier party spawn';
  } else if (stack.includes('gateBoss') || stack.includes('eliteGates')) {
    system = 'EliteGates';
    reason = 'Burning Gate boss encounter';
  } else if (stack.includes('superDungeon')) {
    system = 'SuperDungeon';
    reason = 'Super dungeon encounter generation';
  } else if (stack.includes('arenaBouts')) {
    system = 'Arena';
    reason = 'Arena bout fighter generation';
  } else if (stack.includes('dungeonContext')) {
    system = 'DungeonContext';
    reason = 'Dungeon block layout foe placement';
  } else if (stack.includes('exteriorFoes')) {
    system = 'ExteriorFoes';
    reason = 'Exterior wilderness / location wandering foe';
  }

  return { system, reason, callSite: topCaller };
}

/**
 * Record the minting / creation of a new enemy entity.
 * Called directly from makeEnemyEntity().
 * @param {object} entity
 * @param {object} basics
 * @param {object|null} career
 * @param {number} builtLevel
 * @param {object} [opts]
 */
export function recordEntityMint(entity, basics, career, builtLevel, opts = {}) {
  if (!entity || typeof entity !== 'object') return;

  try {
    const origin = detectSpawningOrigin(opts.originContext);
    const spawnId = ++_spawnCounter;

    const record = {
      spawnId,
      mintedAt: new Date().toISOString(),
      origin,
      entityInfo: {
        mobileType: entity.mobileType,
        name: basics?.name || `Mobile_${entity.mobileType}`,
        isClass: Boolean(entity.isClass),
        careerIndex: entity.careerIndex ?? null,
        builtLevel,
        finalLevel: entity.level,
        maxHealth: entity.maxHealth,
        armorValue: entity.armor,
        armorValues: Array.isArray(entity.armorValues) ? [...entity.armorValues] : null,
        liveSpeed: entity.liveSpeed,
        minMetalToHit: entity.basics?.minMetalToHit ?? -1,
      },
      scaling: null,
      placement: null,
    };

    _entityRecordMap.set(entity, record);
    _recentSpawns.push(record);
    if (_recentSpawns.length > MAX_ENCOUNTER_BUFFER) {
      _recentSpawns.shift();
    }
  } catch (err) {
    console.warn('[EncounterLogger] Failed to record entity mint:', err);
  }
}

/**
 * Record progression scaling (Softcap2 / Tougher Enemies / Balance threat) applied to an entity.
 * Called directly from applyProgressionScaling().
 * @param {object} entity
 * @param {object} scaling
 */
export function recordEntityScaling(entity, scaling) {
  if (!entity || !scaling) return;

  try {
    const record = _entityRecordMap.get(entity);
    const scalingData = {
      challengeLevels: scaling.challengeLevels ?? 0,
      challengeLevelFinal: entity.challengeLevel ?? entity.level,
      skillGain: scaling.skillGain ?? 0,
      healthMult: scaling.healthMult ?? 1,
      damageMult: scaling.damageMult ?? 1,
      damageScaleFinal: entity.damageScale ?? 1,
      heroHealth: scaling.heroHealth ?? 1,
      heroDamage: scaling.heroDamage ?? 1,
      veteran: scaling.veteran ?? 0,
    };

    if (record) {
      record.scaling = scalingData;
      record.entityInfo.finalHealth = entity.maxHealth;
      record.entityInfo.finalDamageScale = entity.damageScale;
      record.entityInfo.challengeLevel = entity.challengeLevel;
    }
  } catch (err) {
    console.warn('[EncounterLogger] Failed to record scaling:', err);
  }
}

/**
 * Record entity placement into the game world scene.
 * Called from spawnFoe() or buildFoeAt().
 * @param {object} entity
 * @param {object} placementInfo
 */
export function recordEntityPlacement(entity, placementInfo = {}) {
  if (!entity || typeof entity !== 'object') return;

  try {
    const record = _entityRecordMap.get(entity);
    const placementData = {
      pos: placementInfo.pos ? [Math.round(placementInfo.pos[0] * 100) / 100, Math.round(placementInfo.pos[1] * 100) / 100, Math.round(placementInfo.pos[2] * 100) / 100] : null,
      team: placementInfo.team || entity.team || 'Hostile',
      allied: Boolean(placementInfo.allied),
      quest: Boolean(placementInfo.questBehaviour || placementInfo.questMarker),
      site: placementInfo.site || null,
      placed: Boolean(placementInfo.placed),
      loose: Boolean(placementInfo.loose),
      eliteFoe: Boolean(placementInfo.eliteFoe ?? entity.eliteFoe),
      champion: placementInfo.champion ?? (entity.championTrait || null),
      revenant: placementInfo.revenant ? { name: placementInfo.revenant.name, rank: placementInfo.revenant.rank } : null,
      zoneGiant: placementInfo.zoneGiant || null,
      puppet: Boolean(placementInfo.puppet),
    };

    if (record) {
      record.placement = placementData;
    }
  } catch (err) {
    console.warn('[EncounterLogger] Failed to record placement:', err);
  }
}

/**
 * Retrieve recorded encounter metadata for an entity.
 * Useful for the combat logger to attach spawning telemetry to combatants.
 * @param {object} entity
 * @returns {Record<string, any>|null}
 */
export function getEncounterInfo(entity) {
  if (!entity || typeof entity !== 'object') return null;
  return _entityRecordMap.get(entity) || null;
}

/**
 * Get all recent spawn records from the ring buffer.
 * @param {number} [limit=50]
 * @returns {Array<Record<string, any>>}
 */
export function getRecentSpawns(limit = 50) {
  return _recentSpawns.slice(-Math.max(1, limit));
}

/**
 * Dumps spawner & encounter telemetry log to disk.
 * Retains only the last 5 encounter logs.
 * @param {string} [triggerReason='manual']
 * @returns {Record<string, any>} Snapshot payload
 */
export function dumpEncounterLog(triggerReason = 'manual') {
  const p = playerEntity || {};
  const payload = {
    meta: {
      category: 'encounters',
      timestamp: new Date().toISOString(),
      triggerReason,
      totalRecordedSpawns: _spawnCounter,
    },
    playerContext: {
      level: p.level ?? 1,
      race: p.race,
      gender: p.gender,
    },
    recentSpawnsCount: _recentSpawns.length,
    recentSpawns: [..._recentSpawns],
  };

  // Path 1: Electron Desktop App
  if (globalThis.window?.daggerShell?.writeEncounterLog) {
    try {
      globalThis.window.daggerShell.writeEncounterLog(payload);
      return payload;
    } catch (e) {
      console.warn('[EncounterLogger] Electron dump error:', e);
    }
  }

  // Path 2: Browser / Vite dev server middleware
  if (typeof navigator !== 'undefined') {
    const jsonStr = JSON.stringify(payload);
    let sent = false;

    if (typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        sent = navigator.sendBeacon('/api/dev/encounter-log', blob);
      } catch {
        /* fallback to fetch */
      }
    }

    if (!sent && typeof fetch === 'function') {
      fetch('/api/dev/encounter-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
        keepalive: true,
      }).catch(() => {
        /* best effort */
      });
    }
  }

  return payload;
}

// Global door for debugging and probes
if (typeof globalThis !== 'undefined') {
  globalThis.__dffDumpEncounterLog = dumpEncounterLog;
  globalThis.__dffGetRecentSpawns = getRecentSpawns;
}

