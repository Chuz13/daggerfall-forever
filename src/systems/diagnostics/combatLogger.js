// @ts-check
// ═══════════════════════════════════════════════════════════════════
// COMBAT ENCOUNTER & RESOLUTION DIAGNOSTIC LOGGER (Daggerfall Forever)
//
// Automatically collects and structures deep combat telemetry:
// - Encounter lifecycle (start on first blow, auto-save on end via timeout/victory/death)
// - Dice rolls: toHit probability stacks, raw d100 rolls, critical strikes
// - Damage breakdown: base dice rolls, strength bonuses, material multipliers,
//   resistances/weaknesses, elite/mentor scaling, tell/poise multipliers
// - Damage absorption: shield deflection, armor mitigation, spell absorption
// - Hooks and mods triggered: PCAAO, Roleplay & Realism, Weapons Reforged,
//   Ring of Namira, special on-hit status effects (sunder, fatigue drain, diseases)
// - Spawner context: connects engaged enemies to their encounter creation origins
// - Automatically rotates to retain the last 5 combat logs in logs/combat/
// ═══════════════════════════════════════════════════════════════════

import { playerEntity } from '../../characters/playerEntity.js';
import { getPref } from '../uiPrefs.js';
import { FORK_FLAGS } from '../../config/forkFlags.js';
import { formulaOverride } from '../../combat/formulas.js';
import { pcaaoModules } from '../../combat/pcaao.js';
import { getEncounterInfo } from './encounterLogger.js';
import { onModEvent } from '../mods/modEventBus.js';

const INACTIVITY_TIMEOUT_MS = 6000;
let _combatSeq = 0;
let _inCombat = false;
let _activeEncounter = null;
let _inactivityTimer = null;

/**
 * Returns string name or identifier for a combatant.
 * @param {any} entity
 * @returns {string}
 */
function getCombatantId(entity) {
  if (!entity) return 'unknown';
  if (entity.isPlayer) return 'player';
  if (entity.name) return String(entity.name);
  if (entity.basics?.name) return `${entity.basics.name}_${entity.mobileType ?? 'npc'}`;
  return `entity_${entity.mobileType ?? 'unknown'}`;
}

/**
 * Snapshots combatant profile (stats, skills, equipment, resistances, spawn origin).
 * @param {any} entity
 * @returns {Record<string, any>}
 */
function snapshotCombatant(entity) {
  if (!entity || typeof entity !== 'object') return {};

  if (entity.isPlayer) {
    const stats = entity.stats || {};
    const skills = entity.skills || {};
    return {
      type: 'player',
      level: entity.level ?? 1,
      race: entity.race,
      gender: entity.gender,
      health: { current: entity.health, max: entity.maxHealth },
      fatigue: { current: entity.fatigue, max: entity.maxFatigue },
      stats: {
        str: stats.strength,
        int: stats.intelligence,
        wil: stats.willpower,
        agi: stats.agility,
        end: stats.endurance,
        spd: stats.speed,
        luc: stats.luck,
      },
      relevantSkills: {
        Dodging: skills.Dodging,
        CriticalStrike: skills.CriticalStrike,
        Backstabbing: skills.Backstabbing,
        HandToHand: skills.HandToHand,
        ShortBlade: skills.ShortBlade,
        LongBlade: skills.LongBlade,
        Axe: skills.Axe,
        BluntWeapon: skills.BluntWeapon,
        Archery: skills.Archery,
      },
      reflexes: entity.reflexes ?? 2,
    };
  }

  // Enemy / NPC entity
  const encInfo = getEncounterInfo(entity);
  return {
    type: entity.isClass ? 'class_enemy' : 'monster',
    mobileType: entity.mobileType,
    name: entity.basics?.name || entity.name || `Mobile_${entity.mobileType}`,
    level: entity.level,
    health: { current: entity.health, max: entity.maxHealth },
    fatigue: entity.fatigue,
    armorValues: Array.isArray(entity.armorValues) ? [...entity.armorValues] : entity.armor,
    damageScale: entity.damageScale ?? 1,
    minMetalToHit: entity.basics?.minMetalToHit ?? entity.minMetalToHit ?? -1,
    team: entity.team || 'Hostile',
    elite: Boolean(entity.eliteFoe),
    champion: entity.championTrait || null,
    // Spawner origin linking!
    spawnOrigin: encInfo ? {
      system: encInfo.origin?.system,
      reason: encInfo.origin?.reason,
      callSite: encInfo.origin?.callSite,
      scaling: encInfo.scaling,
      placement: encInfo.placement,
    } : null,
  };
}

/**
 * Builds the gameplay and mods configuration matrix.
 * Essential for resolving bug reports on intersecting settings.
 * @returns {Record<string, any>}
 */
function buildConfigMatrix() {
  const pcaaoInstalled = Boolean(formulaOverride('calculateAttackDamage'));
  let pcaaoActiveModules = null;
  if (pcaaoInstalled) {
    try {
      pcaaoActiveModules = pcaaoModules();
    } catch {
      /* ignore */
    }
  }

  return {
    gameplay: {
      difficulty: getPref('difficulty') ?? 'normal',
      enhancedAI: Boolean(getPref('enhancedAI')),
      retroMode: Boolean(getPref('retroMode')),
      city247: Boolean(getPref('city247')),
    },
    mods: {
      pcaao: {
        installed: pcaaoInstalled,
        modules: pcaaoActiveModules,
      },
      roleplayRealism: {
        active: Boolean(formulaOverride('calculateWeaponToHit')),
      },
      unleveledLoot: Boolean(formulaOverride('randomMaterial')),
      forkFlags: {
        ENABLE_ARMORY: FORK_FLAGS.ENABLE_ARMORY,
        ENABLE_SHOP: FORK_FLAGS.ENABLE_SHOP,
        ENABLE_ONLINE_PLAY: FORK_FLAGS.ENABLE_ONLINE_PLAY,
      },
    },
  };
}

/**
 * Starts a new combat encounter log.
 * @param {string} [initialReason='combat_start']
 */
export function startCombatEncounter(initialReason = 'combat_start') {
  if (_inCombat && _activeEncounter) return;

  _inCombat = true;
  const now = new Date();
  const encounterId = `enc-${now.toISOString().replace(/[:.]/g, '-')}-${String(++_combatSeq).padStart(4, '0')}`;

  _activeEncounter = {
    encounterId,
    startTime: Date.now(),
    startTimeIso: now.toISOString(),
    startReason: initialReason,
    configMatrix: buildConfigMatrix(),
    environment: {
      isPlayerNight: false,
    },
    combatants: {
      player: snapshotCombatant(playerEntity),
    },
    events: [],
    summary: null,
  };

  resetInactivityTimer();
}

/**
 * Reset inactivity timer for automatic encounter finalization.
 */
function resetInactivityTimer() {
  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = null;
  }
  _inactivityTimer = setTimeout(() => {
    if (_inCombat) {
      endCombatEncounter('inactivity_timeout');
    }
  }, INACTIVITY_TIMEOUT_MS);
}

/**
 * Ensure combatant exists in the encounter registry.
 * @param {any} entity
 */
function ensureCombatantRegistered(entity) {
  if (!_activeEncounter || !entity) return;
  const id = getCombatantId(entity);
  if (!_activeEncounter.combatants[id]) {
    _activeEncounter.combatants[id] = snapshotCombatant(entity);
  }
}

/**
 * Record a physical / weapon / unarmed attack resolution.
 * Called from formulas.js or resolution listeners.
 * @param {object} resolution
 */
export function recordAttackResolution(resolution) {
  if (!resolution) return;

  try {
    if (!_inCombat) {
      startCombatEncounter('attack_action');
    }

    const { attacker, target, weapon, damage = 0, hit, critical, backstab, ineffective, diag } = resolution;
    const attackerId = getCombatantId(attacker);
    const targetId = getCombatantId(target);

    ensureCombatantRegistered(attacker);
    ensureCombatantRegistered(target);

    const eventRecord = {
      t: Date.now() - (_activeEncounter?.startTime ?? Date.now()),
      type: 'physical_attack',
      attacker: attackerId,
      target: targetId,
      weapon: weapon ? {
        name: weapon.name || 'Weapon',
        material: weapon.material,
        condition: weapon.condition,
        templateIndex: weapon.templateIndex,
      } : (attacker?.isPlayer ? 'HandToHand' : 'NaturalAttack'),

      // Dice and ToHit mechanics
      toHit: diag?.toHit ? {
        chanceToHitMod: diag.toHit.chanceToHitMod,
        struckPart: diag.toHit.struckPart,
        modifiers: diag.toHit.modifiers,
        finalChance: diag.toHit.finalChance,
        hitRoll: diag.toHit.hitRoll,
        isHit: diag.toHit.isHit ?? hit,
      } : {
        isHit: Boolean(hit),
        ineffective: Boolean(ineffective),
      },

      // Damage calculation and mitigation
      damage: {
        rawDamage: diag?.damage?.rawDamage ?? damage,
        finalDamageDealt: damage,
        damageAbsorbed: diag?.damage?.mitigated ?? 0,
        critical: Boolean(critical),
        backstab: Boolean(backstab),
        modifiersApplied: diag?.damage?.modsApplied || [],
      },

      // Side effects & hooks
      hooksTriggered: diag?.hooks || [],
      sideEffects: {
        equipmentWear: diag?.sideEffects?.equipmentWear || null,
        targetHealthAfter: target?.health,
        isKill: (target?.health ?? 1) <= 0,
      },
    };

    _activeEncounter?.events.push(eventRecord);
    resetInactivityTimer();

    // Check if target was killed and if all engaged non-player combatants are dead
    if (eventRecord.sideEffects.isKill && target && !target.isPlayer) {
      checkAllFoesDefeated();
    }
  } catch (err) {
    console.warn('[CombatLogger] Failed to record attack resolution:', err);
  }
}

/**
 * Record a magic spell cast or effect application.
 * Called from effects.js applySpell().
 * @param {object} spellData
 */
export function recordSpellApplication(spellData) {
  if (!spellData) return;

  try {
    if (!_inCombat) {
      startCombatEncounter('spell_cast');
    }

    const { spell, caster, target, damage = 0, healed = 0, absorbed = 0, reflected = false, savingThrow } = spellData;
    const casterId = getCombatantId(caster?.entity || caster);
    const targetId = getCombatantId(target);

    ensureCombatantRegistered(caster?.entity || caster);
    ensureCombatantRegistered(target);

    const eventRecord = {
      t: Date.now() - (_activeEncounter?.startTime ?? Date.now()),
      type: 'spell_application',
      caster: casterId,
      target: targetId,
      spell: {
        name: spell?.name || 'Spell',
        element: spell?.element,
        rangeType: spell?.rangeType,
      },
      savingThrow: savingThrow || null,
      absorption: absorbed > 0 ? { absorbedPoints: absorbed } : null,
      reflection: Boolean(reflected),
      outcome: {
        damage,
        healed,
        targetHealthAfter: target?.health,
        isKill: (target?.health ?? 1) <= 0,
      },
    };

    _activeEncounter?.events.push(eventRecord);
    resetInactivityTimer();

    if (eventRecord.outcome.isKill && target && !target.isPlayer) {
      checkAllFoesDefeated();
    }
  } catch (err) {
    console.warn('[CombatLogger] Failed to record spell application:', err);
  }
}

/**
 * Checks if all registered enemies in the encounter have zero health.
 */
function checkAllFoesDefeated() {
  if (!_activeEncounter) return;
  const foes = Object.entries(_activeEncounter.combatants).filter(([id]) => id !== 'player');
  if (foes.length > 0 && foes.every(([_, f]) => (f.health?.current ?? 1) <= 0)) {
    // End combat with victory after a short delay
    setTimeout(() => {
      if (_inCombat) {
        endCombatEncounter('victory');
      }
    }, 1000);
  }
}

/**
 * Computes statistical summary of the encounter.
 * @param {object} encounter
 * @param {string} outcome
 * @returns {Record<string, any>}
 */
function computeEncounterSummary(encounter, outcome) {
  const durationMs = Date.now() - encounter.startTime;
  const events = encounter.events || [];

  let playerAttacks = 0;
  let playerHits = 0;
  let playerCrits = 0;
  let playerBackstabs = 0;
  let playerDamageDealt = 0;
  let playerDamageTaken = 0;
  let enemyAttacks = 0;
  let enemyHits = 0;
  const defeated = [];

  for (const ev of events) {
    if (ev.type === 'physical_attack') {
      if (ev.attacker === 'player') {
        playerAttacks++;
        if (ev.toHit?.isHit) playerHits++;
        if (ev.damage?.critical) playerCrits++;
        if (ev.damage?.backstab) playerBackstabs++;
        playerDamageDealt += ev.damage?.finalDamageDealt || 0;
      } else if (ev.target === 'player') {
        enemyAttacks++;
        if (ev.toHit?.isHit) enemyHits++;
        playerDamageTaken += ev.damage?.finalDamageDealt || 0;
      }
      if (ev.sideEffects?.isKill && ev.target !== 'player' && !defeated.includes(ev.target)) {
        defeated.push(ev.target);
      }
    } else if (ev.type === 'spell_application') {
      if (ev.caster === 'player') {
        playerDamageDealt += ev.outcome?.damage || 0;
      } else if (ev.target === 'player') {
        playerDamageTaken += ev.outcome?.damage || 0;
      }
      if (ev.outcome?.isKill && ev.target !== 'player' && !defeated.includes(ev.target)) {
        defeated.push(ev.target);
      }
    }
  }

  const playerAccuracy = playerAttacks > 0 ? `${Math.round((playerHits / playerAttacks) * 1000) / 10}%` : 'N/A';
  const enemyAccuracy = enemyAttacks > 0 ? `${Math.round((enemyHits / enemyAttacks) * 1000) / 10}%` : 'N/A';

  return {
    outcome,
    durationMs,
    durationSec: Math.round(durationMs / 100) / 10,
    totalEvents: events.length,
    playerCombatStats: {
      attacksTotal: playerAttacks,
      hits: playerHits,
      accuracy: playerAccuracy,
      criticalStrikes: playerCrits,
      backstabs: playerBackstabs,
      totalDamageDealt: playerDamageDealt,
      totalDamageTaken: playerDamageTaken,
    },
    enemyCombatStats: {
      attacksTotal: enemyAttacks,
      hits: enemyHits,
      accuracy: enemyAccuracy,
    },
    enemiesDefeated: defeated,
  };
}

/**
 * End the active combat encounter, generate summary, and automatically save log to disk.
 * Retains only the last 5 combat logs.
 * @param {string} [outcome='timeout']
 * @returns {Record<string, any>|null}
 */
export function endCombatEncounter(outcome = 'timeout') {
  if (!_inCombat || !_activeEncounter) return null;

  if (_inactivityTimer) {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = null;
  }

  const encounter = _activeEncounter;
  _inCombat = false;
  _activeEncounter = null;

  encounter.summary = computeEncounterSummary(encounter, outcome);
  encounter.endTimeIso = new Date().toISOString();

  // Persist to disk (Electron or Vite dev server)
  // Path 1: Electron Desktop
  if (globalThis.window?.daggerShell?.writeCombatLog) {
    try {
      globalThis.window.daggerShell.writeCombatLog(encounter);
      return encounter;
    } catch (e) {
      console.warn('[CombatLogger] Electron dump error:', e);
    }
  }

  // Path 2: Browser / Vite Dev Server
  if (typeof navigator !== 'undefined') {
    const jsonStr = JSON.stringify(encounter);
    let sent = false;

    if (typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        sent = navigator.sendBeacon('/api/dev/combat-log', blob);
      } catch {
        /* fallback to fetch */
      }
    }

    if (!sent && typeof fetch === 'function') {
      fetch('/api/dev/combat-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: jsonStr,
        keepalive: true,
      }).catch(() => {
        /* best effort */
      });
    }
  }

  return encounter;
}

/**
 * Manual dump of the current combat encounter (e.g. for /combatdump command).
 * @param {string} [reason='manual']
 * @returns {Record<string, any>|null}
 */
export function dumpCombatLog(reason = 'manual') {
  if (_activeEncounter) {
    return endCombatEncounter(reason);
  }
  return null;
}

/**
 * Check whether an encounter is currently ongoing.
 */
export function isInCombat() {
  return _inCombat;
}

// Subscribe to combat events on the Mod Event Bus
onModEvent('combatAttackResolved', (resolution) => {
  recordAttackResolution(resolution);
}, 'dff_combat_logger');

onModEvent('combatSpellResolved', (payload) => {
  recordSpellApplication({
    spell: payload.spell,
    caster: payload.caster,
    target: payload.target,
    damage: payload.out?.damage ?? 0,
    healed: payload.out?.healed ?? 0,
    absorbed: payload.out?.absorbed ?? 0,
    reflected: (payload.out?.reflected ?? 0) > 0,
  });
}, 'dff_combat_logger');

onModEvent('combat:enemyKill', () => {
  checkAllFoesDefeated();
}, 'dff_combat_logger');

// Global doors for console and probes
if (typeof globalThis !== 'undefined') {
  globalThis.__dffDumpCombatLog = dumpCombatLog;
  globalThis.__dffIsInCombat = isInCombat;
}
