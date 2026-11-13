// ═══════════════════════════════════════════════════════════════════
// LIVING TAMRIEL & RCF DIAGNOSTIC LOGGER (Daggerfall Forever)
//
// Collects detailed telemetry across Living Tamriel subsystems:
// - Regional crisis pulse and state progression
// - 39 Crisis ChoiceWindow resolutions and RCF consequence validation
// - Discrepancy detection between predicted and actually applied outcomes
// - 3D Adventurer duels, surrender / forfeit outcomes, and loot validity
// - Fort assault crisis contracts (slot 0 guarantees and lifecycle)
//
// Performance-Safe Contract:
// - Fixed-size ring buffer (MAX_LIVING_EVENTS = 150)
// - Non-blocking I/O
// - Exception isolation
// ═══════════════════════════════════════════════════════════════════

import { playerEntity } from '../../characters/playerEntity.js';
import { recordTimelineEvent } from './eventTimeline.js';

const MAX_LIVING_EVENTS = 150;
let _livingSeq = 0;

/** @type {Array<Record<string, any>>} */
const _livingEvents = [];

/** @type {Array<Record<string, any>>} */
const _livingAnomalies = [];

/**
 * Record a crisis choice resolution and validate consequence fidelity.
 * @param {{
 *   regionIndex: number,
 *   crisisType: string,
 *   eventId: string,
 *   choiceIndex: number,
 *   choiceLabel?: string,
 *   predicted?: { gold?: number, rep?: number, hp?: number, fatigue?: number, xp?: number },
 *   applied?: { goldDelta?: number, repDelta?: number, hpDelta?: number, fatigueDelta?: number, xpGained?: number, teleported?: boolean },
 *   notes?: string
 * }} data
 */
export function recordCrisisChoiceResolution(data) {
  try {
    const id = ++_livingSeq;
    const nowIso = new Date().toISOString();
    const discrepancies = [];

    // Discrepancy checks: Validate applied vs predicted consequences
    if (data.predicted && data.applied) {
      if (data.predicted.gold !== undefined && data.applied.goldDelta !== undefined) {
        if (data.applied.goldDelta !== data.predicted.gold) {
          discrepancies.push(`Gold mismatch: predicted ${data.predicted.gold}, applied ${data.applied.goldDelta}`);
        }
      }
      if (data.predicted.rep !== undefined && data.applied.repDelta !== undefined) {
        if (data.applied.repDelta !== data.predicted.rep) {
          discrepancies.push(`Reputation mismatch: predicted ${data.predicted.rep}, applied ${data.applied.repDelta}`);
        }
      }
    }

    const hasAnomaly = discrepancies.length > 0;
    const severity = hasAnomaly ? 'warn' : 'info';

    const record = {
      id,
      timestamp: nowIso,
      type: 'crisis_choice_resolution',
      regionIndex: data.regionIndex,
      crisisType: data.crisisType,
      eventId: data.eventId,
      choiceIndex: data.choiceIndex,
      choiceLabel: data.choiceLabel || null,
      predicted: data.predicted || {},
      applied: data.applied || {},
      discrepancies,
      notes: data.notes || null,
    };

    _livingEvents.push(record);
    if (_livingEvents.length > MAX_LIVING_EVENTS) {
      _livingEvents.shift();
    }

    if (hasAnomaly) {
      _livingAnomalies.push(record);
      if (_livingAnomalies.length > 30) {
        _livingAnomalies.shift();
      }
    }

    // Bridge to unified timeline
    recordTimelineEvent({
      cat: 'living',
      event: 'CRISIS_CHOICE_RESOLVED',
      sev: severity,
      data: {
        eventId: data.eventId,
        choiceIndex: data.choiceIndex,
        discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
        applied: data.applied,
      },
    });

    return record;
  } catch (err) {
    console.warn('[LivingLogger] Failed to record crisis choice resolution:', err);
    return null;
  }
}

/**
 * Record an adventurer duel resolution and loot generation check.
 * @param {{
 *   initiator: string,
 *   opponentName: string,
 *   opponentLevel: number,
 *   outcome: 'kill'|'yield'|'flee'|'draw',
 *   surrenderOffered?: boolean,
 *   surrenderAccepted?: boolean,
 *   lootMode?: string,
 *   lootGenerated?: Array<{ name: string, group?: string, artifact?: boolean }>,
 *   goldTaken?: number
 * }} data
 */
export function recordAdventurerDuelResolution(data) {
  try {
    const id = ++_livingSeq;
    const nowIso = new Date().toISOString();
    const discrepancies = [];

    // Verify STANDARD loot mode guarantee: at least 1 piece of equipment
    if (data.outcome === 'kill' && data.lootMode === 'standard' && Array.isArray(data.lootGenerated)) {
      const hasGear = data.lootGenerated.some((it) => it.group === 'Weapons' || it.group === 'Armor' || it.artifact);
      if (!hasGear) {
        discrepancies.push('STANDARD loot mode failed to guarantee 1 piece of weapon or armor equipment.');
      }
    }

    const hasAnomaly = discrepancies.length > 0;
    const severity = hasAnomaly ? 'warn' : 'info';

    const record = {
      id,
      timestamp: nowIso,
      type: 'adventurer_duel_resolution',
      ...data,
      discrepancies,
    };

    _livingEvents.push(record);
    if (_livingEvents.length > MAX_LIVING_EVENTS) {
      _livingEvents.shift();
    }

    if (hasAnomaly) {
      _livingAnomalies.push(record);
      if (_livingAnomalies.length > 30) {
        _livingAnomalies.shift();
      }
    }

    recordTimelineEvent({
      cat: 'living',
      event: 'ADVENTURER_DUEL_RESOLVED',
      sev: severity,
      data: {
        opponent: data.opponentName,
        level: data.opponentLevel,
        outcome: data.outcome,
        itemsLooted: data.lootGenerated?.length ?? 0,
        discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
      },
    });

    return record;
  } catch (err) {
    console.warn('[LivingLogger] Failed to record adventurer duel resolution:', err);
    return null;
  }
}

/**
 * Record a surrender/yield attempt during combat or encounters.
 * @param {{
 *   actor: string,
 *   target: string,
 *   outcome: string,
 *   accepted: boolean,
 *   healthRemaining?: number,
 *   fatigueRemaining?: number,
 *   goldTaken?: number
 * }} data
 */
export function recordSurrenderResolution(data) {
  try {
    const id = ++_livingSeq;
    const nowIso = new Date().toISOString();

    const record = {
      id,
      timestamp: nowIso,
      type: 'surrender_resolution',
      ...data,
    };

    _livingEvents.push(record);
    if (_livingEvents.length > MAX_LIVING_EVENTS) {
      _livingEvents.shift();
    }

    recordTimelineEvent({
      cat: 'combat',
      event: 'SURRENDER_RESOLVED',
      sev: data.accepted ? 'info' : 'warn',
      data: {
        actor: data.actor,
        target: data.target,
        accepted: data.accepted,
        outcome: data.outcome,
        goldTaken: data.goldTaken ?? 0,
      },
    });

    return record;
  } catch (err) {
    console.warn('[LivingLogger] Failed to record surrender resolution:', err);
    return null;
  }
}

/**
 * Record fort assault crisis contract lifecycle event.
 * @param {{
 *   regionIndex: number,
 *   slot: number,
 *   action: 'spawn'|'accept'|'complete'|'fail',
 *   contractId?: string,
 *   reward?: number
 * }} data
 */
export function recordFortContractEvent(data) {
  try {
    const id = ++_livingSeq;
    const nowIso = new Date().toISOString();
    const isSlot0 = data.slot === 0;

    const discrepancies = [];
    if (!isSlot0 && data.action === 'spawn') {
      discrepancies.push(`Fort contract spawned in slot ${data.slot} instead of canonical guaranteed slot 0.`);
    }

    const hasAnomaly = discrepancies.length > 0;
    const record = {
      id,
      timestamp: nowIso,
      type: 'fort_contract_event',
      ...data,
      discrepancies,
    };

    _livingEvents.push(record);
    if (_livingEvents.length > MAX_LIVING_EVENTS) {
      _livingEvents.shift();
    }

    recordTimelineEvent({
      cat: 'quest',
      event: `FORT_CONTRACT_${data.action.toUpperCase()}`,
      sev: hasAnomaly ? 'warn' : 'info',
      data: {
        region: data.regionIndex,
        slot: data.slot,
        discrepancies: discrepancies.length > 0 ? discrepancies : undefined,
      },
    });

    return record;
  } catch (err) {
    console.warn('[LivingLogger] Failed to record fort contract event:', err);
    return null;
  }
}

/**
 * Returns recent Living Tamriel events.
 * @param {number} [limit=50]
 */
export function getRecentLivingEvents(limit = 50) {
  return _livingEvents.slice(-Math.max(1, limit));
}

/**
 * Returns detected Living Tamriel anomalies.
 */
export function getLivingAnomalies() {
  return [..._livingAnomalies];
}

/**
 * Clear Living Tamriel events buffer (for unit tests).
 */
export function clearLivingEvents() {
  _livingEvents.length = 0;
  _livingAnomalies.length = 0;
}

/**
 * Dumps Living Tamriel diagnostic log to disk.
 * @param {string} [triggerReason='manual']
 * @returns {Record<string, any>}
 */
export function dumpLivingLog(triggerReason = 'manual') {
  const p = playerEntity || {};
  const payload = {
    meta: {
      category: 'living',
      timestamp: new Date().toISOString(),
      triggerReason,
      totalLivingEvents: _livingSeq,
      anomaliesCount: _livingAnomalies.length,
    },
    playerContext: {
      level: p.level ?? 1,
      gold: p.goldPieces ?? 0,
    },
    anomalies: [..._livingAnomalies],
    eventsCount: _livingEvents.length,
    events: [..._livingEvents],
  };

  // Path 1: Electron
  if (globalThis.window?.daggerShell?.writeLivingLog) {
    try {
      globalThis.window.daggerShell.writeLivingLog(payload);
      return payload;
    } catch (e) {
      console.warn('[LivingLogger] Electron dump error:', e);
    }
  }

  // Path 2: Browser
  if (typeof navigator !== 'undefined') {
    const jsonStr = JSON.stringify(payload);
    let sent = false;

    if (typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        sent = navigator.sendBeacon('/api/dev/living-log', blob);
      } catch {
        /* fallback to fetch */
      }
    }

    if (!sent && typeof fetch === 'function') {
      fetch('/api/dev/living-log', {
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

// Global door for debugging and console probes
if (typeof globalThis !== 'undefined') {
  globalThis.__dffRecordCrisisChoiceResolution = recordCrisisChoiceResolution;
  globalThis.__dffDumpLivingLog = dumpLivingLog;
}
