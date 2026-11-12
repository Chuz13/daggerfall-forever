// @ts-check
// ═══════════════════════════════════════════════════════════════════
// UNIFIED DIAGNOSTICS & TELEMETRY MANAGER (Daggerfall Forever)
//
// Central orchestrator that manages all game diagnostic subsystems:
// - Session & Systems Snapshot (sessionLogger)
// - Combat & Dice Telemetry (combatLogger)
// - Spawner & Progression Scaling (encounterLogger)
// - Living Tamriel & RCF Consequences (livingLogger)
// - Chronological Event Stream (eventTimeline)
//
// Guarantees atomic flushes on game exit (beforeunload/pagehide)
// and handles the unified `/dumpall` console command.
// ═══════════════════════════════════════════════════════════════════

import { dumpSessionLog } from './sessionLogger.js';
import { dumpCombatLog, isInCombat } from './combatLogger.js';
import { dumpEncounterLog } from './encounterLogger.js';
import { dumpLivingLog, getLivingAnomalies } from './livingLogger.js';
import { dumpTimelineLog, getTimelineAnomalies, recordTimelineEvent } from './eventTimeline.js';

let _isExitHooked = false;

/**
 * Perform a complete, atomic flush of all diagnostic subsystems.
 * @param {string} [triggerReason='manual']
 * @returns {{
 *   ok: boolean,
 *   triggerReason: string,
 *   timestamp: string,
 *   dumps: { session: any, combat: any, encounters: any, living: any, timeline: any },
 *   summary: { totalAnomalies: number }
 * }}
 */
export function dumpAllDiagnostics(triggerReason = 'manual') {
  recordTimelineEvent({
    cat: 'system',
    event: 'DUMP_ALL_REQUESTED',
    sev: 'info',
    data: { triggerReason },
  });

  let sessionDump = null;
  let combatDump = null;
  let encounterDump = null;
  let livingDump = null;
  let timelineDump = null;

  try {
    sessionDump = dumpSessionLog(triggerReason);
  } catch (err) {
    console.warn('[DiagnosticsManager] Failed to dump session log:', err);
  }

  try {
    combatDump = dumpCombatLog(triggerReason);
  } catch (err) {
    console.warn('[DiagnosticsManager] Failed to dump combat log:', err);
  }

  try {
    encounterDump = dumpEncounterLog(triggerReason);
  } catch (err) {
    console.warn('[DiagnosticsManager] Failed to dump encounter log:', err);
  }

  try {
    livingDump = dumpLivingLog(triggerReason);
  } catch (err) {
    console.warn('[DiagnosticsManager] Failed to dump living log:', err);
  }

  try {
    timelineDump = dumpTimelineLog(triggerReason);
  } catch (err) {
    console.warn('[DiagnosticsManager] Failed to dump timeline log:', err);
  }

  const livingAnomalies = getLivingAnomalies();
  const timelineAnomalies = getTimelineAnomalies();
  const totalAnomalies = livingAnomalies.length + timelineAnomalies.length;

  return {
    ok: true,
    triggerReason,
    timestamp: new Date().toISOString(),
    dumps: {
      session: sessionDump,
      combat: combatDump,
      encounters: encounterDump,
      living: livingDump,
      timeline: timelineDump,
    },
    summary: {
      totalAnomalies,
    },
  };
}

/**
 * Initializes automatic exit listeners for graceful telemetry persistence.
 */
export function initUnifiedExitHooks() {
  if (_isExitHooked) return;
  _isExitHooked = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      dumpAllDiagnostics('beforeunload');
    });

    window.addEventListener('pagehide', () => {
      dumpAllDiagnostics('pagehide');
    });
  }
}

// Auto-register hooks on module evaluation
if (typeof window !== 'undefined') {
  initUnifiedExitHooks();
}

if (typeof globalThis !== 'undefined') {
  globalThis.__dffDumpAllDiagnostics = dumpAllDiagnostics;
}
