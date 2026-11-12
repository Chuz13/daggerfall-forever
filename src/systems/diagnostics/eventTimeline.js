// @ts-check
// ═══════════════════════════════════════════════════════════════════
// CHRONOLOGICAL EVENT TIMELINE LOGGER (Daggerfall Forever)
//
// High-level diagnostic event bus and ring buffer. Stitches together
// gameplay actions (crises, duels, surrender, loot, alchemy, save/load)
// into an unbroken chronological narrative for effortless bug triage.
//
// Performance-Safe Contract:
// - Fixed-capacity ring buffer (MAX_EVENTS = 250) prevents memory growth
// - Lightweight telemetry payload avoids GC pressure
// - Zero render-frame blocking (non-blocking I/O)
// ═══════════════════════════════════════════════════════════════════

import { playerEntity } from '../../characters/playerEntity.js';

const MAX_EVENTS = 250;
const sessionStartTime = Date.now();
let _seq = 0;

/**
 * @typedef {{
 *   id: number,
 *   t: number,
 *   timeIso: string,
 *   cat: 'living'|'combat'|'loot'|'economy'|'quest'|'save'|'system',
 *   event: string,
 *   sev: 'info'|'warn'|'error',
 *   data: Record<string, any>
 * }} TimelineEvent
 */

/** @type {TimelineEvent[]} */
const _eventBuffer = [];

/** @type {TimelineEvent[]} */
const _anomaliesBuffer = [];

/**
 * Record a gameplay or system event into the chronological timeline.
 * @param {{
 *   cat: 'living'|'combat'|'loot'|'economy'|'quest'|'save'|'system',
 *   event: string,
 *   sev?: 'info'|'warn'|'error',
 *   data?: Record<string, any>
 * }} param0
 * @returns {TimelineEvent|null}
 */
export function recordTimelineEvent({ cat, event, sev = 'info', data = {} }) {
  try {
    const now = Date.now();
    const elapsedSec = Math.round(((now - sessionStartTime) / 1000) * 100) / 100;
    const eventRecord = {
      id: ++_seq,
      t: elapsedSec,
      timeIso: new Date(now).toISOString(),
      cat: cat || 'system',
      event: String(event || 'UNKNOWN_EVENT'),
      sev: sev === 'error' || sev === 'warn' ? sev : 'info',
      data: data && typeof data === 'object' ? { ...data } : { value: data },
    };

    _eventBuffer.push(eventRecord);
    if (_eventBuffer.length > MAX_EVENTS) {
      _eventBuffer.shift();
    }

    if (eventRecord.sev !== 'info') {
      _anomaliesBuffer.push(eventRecord);
      if (_anomaliesBuffer.length > 50) {
        _anomaliesBuffer.shift();
      }
    }

    return eventRecord;
  } catch (err) {
    console.warn('[EventTimeline] Failed to record event:', err);
    return null;
  }
}

/**
 * Returns the most recent timeline events.
 * @param {number} [limit=50]
 * @returns {TimelineEvent[]}
 */
export function getRecentTimelineEvents(limit = 50) {
  return _eventBuffer.slice(-Math.max(1, limit));
}

/**
 * Returns all detected timeline anomalies (warnings or errors).
 * @returns {TimelineEvent[]}
 */
export function getTimelineAnomalies() {
  return [..._anomaliesBuffer];
}

/**
 * Clears the timeline buffer (useful for unit tests).
 */
export function clearTimeline() {
  _eventBuffer.length = 0;
  _anomaliesBuffer.length = 0;
}

/**
 * Dumps chronological timeline telemetry to disk.
 * Uses Electron IPC or Vite dev endpoint.
 * @param {string} [triggerReason='manual']
 * @returns {Record<string, any>}
 */
export function dumpTimelineLog(triggerReason = 'manual') {
  const p = playerEntity || {};
  const payload = {
    meta: {
      category: 'timeline',
      gameVersion: '0.2.0',
      timestamp: new Date().toISOString(),
      sessionDurationSeconds: Math.round((Date.now() - sessionStartTime) / 1000),
      triggerReason,
      totalEventsRecorded: _seq,
      anomaliesCount: _anomaliesBuffer.length,
    },
    playerContext: {
      name: p.name || 'Unknown',
      level: p.level ?? 1,
      gold: p.goldPieces ?? 0,
      health: p.health ?? 0,
    },
    anomalies: [..._anomaliesBuffer],
    eventsCount: _eventBuffer.length,
    events: [..._eventBuffer],
  };

  // Path 1: Electron Shell
  if (globalThis.window?.daggerShell?.writeTimelineLog) {
    try {
      globalThis.window.daggerShell.writeTimelineLog(payload);
      return payload;
    } catch (e) {
      console.warn('[EventTimeline] Electron dump error:', e);
    }
  }

  // Path 2: Browser / Vite Dev Server
  if (typeof navigator !== 'undefined') {
    const jsonStr = JSON.stringify(payload);
    let sent = false;

    if (typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        sent = navigator.sendBeacon('/api/dev/timeline-log', blob);
      } catch {
        /* fallback to fetch */
      }
    }

    if (!sent && typeof fetch === 'function') {
      fetch('/api/dev/timeline-log', {
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
  globalThis.__dffRecordTimelineEvent = recordTimelineEvent;
  globalThis.__dffDumpTimelineLog = dumpTimelineLog;
}
