// @ts-check
// ═══════════════════════════════════════════════════════════════════
// GAME DIAGNOSTICS & SESSION LOGGER (Daggerfall Forever)
//
// Collects runtime errors, warnings, performance metrics, and a
// comprehensive snapshot of all 7 offline systems.
// Dumps structured telemetry on exit, beforeunload, or via /dumplog.
// Supports both Browser (Vite dev) and Electron (Desktop / npm start).
// ═══════════════════════════════════════════════════════════════════

import { playerEntity } from '../../characters/playerEntity.js';
import { getActiveRecord as getActiveFirmRecord } from '../offlineFirmament.js';
import { allOfflineHomes } from '../offlineHomes.js';
import { getActiveOfflineRecord as getActiveProfRecord } from '../offlineProfessions.js';
import { bankedGold, isUnifiedBankActive } from '../banking.js';
import { currentOf, readFamily } from '../legacy/family.js';
import { getRegionState, CRISIS_TYPE } from '../living/regionState.js';
import { getPref } from '../uiPrefs.js';

const MAX_ERROR_ENTRIES = 50;
const sessionStartTime = Date.now();

/** @type {Array<{ time: number, type: 'error'|'warn'|'unhandledrejection', message: string, stack?: string }>} */
const runtimeLogs = [];

let isInitialized = false;

/**
 * Capture error entry into ring buffer.
 * @param {'error'|'warn'|'unhandledrejection'} type
 * @param {string} message
 * @param {string} [stack]
 */
function recordDiagnosticLog(type, message, stack) {
  runtimeLogs.push({
    time: Date.now() - sessionStartTime,
    type,
    message: String(message ?? ''),
    stack: stack ? String(stack) : undefined,
  });
  if (runtimeLogs.length > MAX_ERROR_ENTRIES) {
    runtimeLogs.shift();
  }
}

/**
 * Hook into window error events and console warnings/errors.
 */
export function initSessionDiagnostics() {
  if (isInitialized) return;
  isInitialized = true;

  if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
      recordDiagnosticLog('error', event.message, event.error?.stack);
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      recordDiagnosticLog('unhandledrejection', reason?.message || String(reason), reason?.stack);
    });

    // Auto dump on tab/window close
    window.addEventListener('beforeunload', () => {
      dumpSessionLog('beforeunload');
    });

    window.addEventListener('pagehide', () => {
      dumpSessionLog('pagehide');
    });

    // Expose global door for console and probes
    globalThis.__dffDumpSessionLog = dumpSessionLog;
  }
}

/**
 * Collects a complete health snapshot across the game and all 7 offline systems.
 * @param {string} [triggerReason]
 * @returns {Record<string, any>}
 */
export function buildDiagnosticSnapshot(triggerReason = 'manual') {
  const p = playerEntity || {};
  const stats = p.stats || {};
  const sessionDurationSec = Math.round((Date.now() - sessionStartTime) / 1000);

  // 1. Firmament & Renown
  const firm = getActiveFirmRecord() || { xp: 0, renown: 1, tree: '' };

  // 2. Bank & 24/7
  const bankAccounts = p.bankAccounts || [];
  const totalBankGold = bankedGold(bankAccounts);
  const activeLoans = bankAccounts.filter((a) => (a?.loanTotal ?? 0) > 0).map((a) => ({ region: a.regionIndex, loan: a.loanTotal }));
  const is247 = Boolean(getPref('city247'));

  // 3. Housing
  const homes = allOfflineHomes() || [];
  let totalChestsCount = 0;
  let totalChestItemsCount = 0;
  for (const h of homes) {
    if (h.chests && typeof h.chests === 'object') {
      const chestKeys = Object.keys(h.chests);
      totalChestsCount += chestKeys.length;
      for (const k of chestKeys) {
        if (Array.isArray(h.chests[k])) {
          totalChestItemsCount += h.chests[k].length;
        }
      }
    }
  }

  // 4. Professions & Materials Bag
  const prof = getActiveProfRecord() || { tracks: {} };
  const bagItems = Array.isArray(p.bagItems) ? p.bagItems : [];
  const packItems = Array.isArray(p.items) ? p.items : [];
  // Detect if any materials accidentally leaked into pack
  const leakedMaterials = packItems.filter((i) => i?.templateIndex >= 601 && i?.templateIndex <= 690 && i?.group !== 'UselessItems2');

  // 5. Living Tamriel 71 regions
  const activeCrises = [];
  for (let r = 0; r < 71; r++) {
    const s = getRegionState(r);
    if (s && s.crisis && s.crisis !== CRISIS_TYPE.PEACE) {
      activeCrises.push({
        region: r,
        crisis: s.crisis,
        phase: s.phase,
        daysRemaining: s.phaseDaysRemaining,
        tension: s.tension,
      });
    }
  }

  // 6. Dynasty
  let dynastyHead = null;
  let dynastyRenown = 0;
  try {
    const fam = readFamily();
    if (fam) {
      dynastyHead = currentOf(fam)?.name || null;
      dynastyRenown = fam.renown || 0;
    }
  } catch {
    /* fallback if family not founded */
  }

  // 7. Bounty / Crime
  const legalRep = p.legalRep || {};

  return {
    meta: {
      gameVersion: '0.2.0',
      timestamp: new Date().toISOString(),
      sessionDurationSeconds: sessionDurationSec,
      triggerReason,
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
      isElectron: Boolean(globalThis.window?.daggerShell),
    },
    player: {
      name: p.name || 'Unknown',
      gender: p.gender || 'Unknown',
      race: p.race || 'Unknown',
      career: p.career?.name || 'Unknown',
      level: p.level || 1,
      health: p.health || 0,
      maxHealth: p.maxHealth || 0,
      fatigue: p.fatigue || 0,
      magicka: p.magicka || 0,
      goldPurse: p.goldPieces || 0,
      stats: { ...stats },
    },
    systems: {
      firmament: {
        renown: firm.renown,
        xp: firm.xp,
        hasTreeAllocated: Boolean(firm.tree),
      },
      banking: {
        unifiedBank: isUnifiedBankActive(),
        city247: is247,
        totalBankedGold: totalBankGold,
        activeLoans,
      },
      housing: {
        ownedHomesCount: homes.length,
        totalChests: totalChestsCount,
        totalChestItems: totalChestItemsCount,
        homes: homes.map((h) => ({ mapId: h.mapId, key: h.buildingKey, region: h.region })),
      },
      professions: {
        tracks: prof.tracks || {},
        materialsBagCount: bagItems.length,
        leakedMaterialsCount: leakedMaterials.length,
      },
      livingTamriel: {
        totalRegions: 71,
        activeCrisesCount: activeCrises.length,
        crises: activeCrises,
      },
      dynasty: {
        head: dynastyHead,
        renown: dynastyRenown,
      },
      bounty: {
        records: { ...legalRep },
      },
    },
    runtimeIssues: {
      errorCount: runtimeLogs.filter((l) => l.type === 'error' || l.type === 'unhandledrejection').length,
      warningCount: runtimeLogs.filter((l) => l.type === 'warn').length,
      recentLogs: [...runtimeLogs],
    },
  };
}

/**
 * Dumps session log to disk.
 * Uses Electron IPC if running in desktop app, or Vite dev endpoint via fetch/sendBeacon.
 * @param {string} [triggerReason]
 * @returns {Record<string, any>} Snapshot payload
 */
export function dumpSessionLog(triggerReason = 'manual') {
  const payload = buildDiagnosticSnapshot(triggerReason);

  // Path 1: Electron / Installed App (`window.daggerShell`)
  if (globalThis.window?.daggerShell?.writeSessionLog) {
    try {
      globalThis.window.daggerShell.writeSessionLog(payload);
      return payload;
    } catch (e) {
      console.warn('[SessionLogger] Electron dump error:', e);
    }
  }

  // Path 2: Browser (Vite dev server middleware /api/dev/session-log)
  if (typeof navigator !== 'undefined') {
    const jsonStr = JSON.stringify(payload);
    let sent = false;

    if (typeof navigator.sendBeacon === 'function') {
      try {
        const blob = new Blob([jsonStr], { type: 'application/json' });
        sent = navigator.sendBeacon('/api/dev/session-log', blob);
      } catch {
        /* fallback to fetch */
      }
    }

    if (!sent && typeof fetch === 'function') {
      fetch('/api/dev/session-log', {
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

// Auto-start diagnostics on module load if in browser
if (typeof window !== 'undefined') {
  initSessionDiagnostics();
}

