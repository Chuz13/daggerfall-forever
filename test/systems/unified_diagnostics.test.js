import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  writeLivingLogToDisk,
  writeTimelineLogToDisk,
  DEFAULT_KEEP_COUNT,
} = require('../../scripts/sessionLogStorage.cjs');

import {
  recordTimelineEvent,
  getRecentTimelineEvents,
  getTimelineAnomalies,
  clearTimeline,
  dumpTimelineLog,
} from '../../src/systems/diagnostics/eventTimeline.js';

import {
  recordCrisisChoiceResolution,
  recordAdventurerDuelResolution,
  recordSurrenderResolution,
  getRecentLivingEvents,
  getLivingAnomalies,
  clearLivingEvents,
  dumpLivingLog,
} from '../../src/systems/diagnostics/livingLogger.js';

import { dumpAllDiagnostics } from '../../src/systems/diagnostics/diagnosticsManager.js';
import { executeConsoleLine } from '../../src/systems/consoleCommands.js';

test('Event Timeline: records chronological events and filters anomalies', () => {
  clearTimeline();

  recordTimelineEvent({ cat: 'quest', event: 'QUEST_STARTED', sev: 'info', data: { questId: 'Q001' } });
  recordTimelineEvent({ cat: 'save', event: 'SAVE_FAILED', sev: 'error', data: { slot: 1 } });
  recordTimelineEvent({ cat: 'economy', event: 'SHOP_TRANSACTION', sev: 'warn', data: { gold: -999 } });

  const recent = getRecentTimelineEvents(10);
  assert.equal(recent.length, 3);
  assert.equal(recent[0].event, 'QUEST_STARTED');
  assert.equal(recent[1].sev, 'error');

  const anomalies = getTimelineAnomalies();
  assert.equal(anomalies.length, 2);
  assert.equal(anomalies[0].event, 'SAVE_FAILED');
  assert.equal(anomalies[1].event, 'SHOP_TRANSACTION');
});

test('Living Logger: catches consequence discrepancies in crisis choices', () => {
  clearLivingEvents();

  // 1. Clean choice without discrepancy
  const cleanRes = recordCrisisChoiceResolution({
    regionIndex: 17,
    crisisType: 'WAR',
    eventId: 'WAR_AID',
    choiceIndex: 1,
    predicted: { gold: -100, rep: 5 },
    applied: { goldDelta: -100, repDelta: 5 },
  });
  assert.equal(cleanRes.discrepancies.length, 0);

  // 2. Choice with gold & reputation discrepancy
  const buggedRes = recordCrisisChoiceResolution({
    regionIndex: 17,
    crisisType: 'WAR',
    eventId: 'WAR_BRIBE',
    choiceIndex: 2,
    predicted: { gold: -500, rep: 10 },
    applied: { goldDelta: 0, repDelta: -5 }, // Bug: gold not deducted, rep lost instead of gained!
  });
  assert.equal(buggedRes.discrepancies.length, 2);
  assert.ok(buggedRes.discrepancies[0].includes('Gold mismatch'));
  assert.ok(buggedRes.discrepancies[1].includes('Reputation mismatch'));

  const anomalies = getLivingAnomalies();
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0].eventId, 'WAR_BRIBE');
});

test('Living Logger: verifies adventurer STANDARD loot mode guarantees', () => {
  clearLivingEvents();

  // Valid loot with weapon
  const valid = recordAdventurerDuelResolution({
    initiator: 'player',
    opponentName: 'Doran',
    opponentLevel: 25,
    outcome: 'kill',
    lootMode: 'standard',
    lootGenerated: [{ name: 'Ebony Longsword', group: 'Weapons' }],
  });
  assert.equal(valid.discrepancies.length, 0);

  // Invalid loot without any equipment
  const invalid = recordAdventurerDuelResolution({
    initiator: 'player',
    opponentName: 'Gael',
    opponentLevel: 30,
    outcome: 'kill',
    lootMode: 'standard',
    lootGenerated: [{ name: 'Healing Potion', group: 'Consumables' }],
  });
  assert.equal(invalid.discrepancies.length, 1);
  assert.ok(invalid.discrepancies[0].includes('guarantee 1 piece'));
});

test('Rotation: writeLivingLogToDisk and writeTimelineLogToDisk maintain exactly 5 newest files', () => {
  const tempLogsDir = path.join(tmpdir(), `dff-test-living-${Date.now()}`);
  fs.mkdirSync(tempLogsDir, { recursive: true });

  try {
    for (let i = 1; i <= 7; i++) {
      const payload = { testRun: i, time: Date.now() + i * 100 };
      writeLivingLogToDisk(payload, { logsDir: tempLogsDir, keepCount: 5 });
      writeTimelineLogToDisk(payload, { logsDir: tempLogsDir, keepCount: 5 });
    }

    const files = fs.readdirSync(tempLogsDir);
    const livingFiles = files.filter((f) => f.startsWith('living-') && f.endsWith('.json') && f !== 'living-latest.json');
    const timelineFiles = files.filter((f) => f.startsWith('timeline-') && f.endsWith('.json') && f !== 'timeline-latest.json');

    assert.equal(livingFiles.length, 5, 'Living files capped at 5');
    assert.equal(timelineFiles.length, 5, 'Timeline files capped at 5');
    assert.ok(files.includes('living-latest.json'));
    assert.ok(files.includes('timeline-latest.json'));
  } finally {
    try {
      fs.rmSync(tempLogsDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

test('Diagnostics Manager: dumpAllDiagnostics collects all 5 categories atomically', () => {
  const result = dumpAllDiagnostics('unit-test-all');
  assert.equal(result.ok, true);
  assert.equal(result.triggerReason, 'unit-test-all');
  assert.ok(result.dumps.session);
  assert.ok(result.dumps.encounters);
  assert.ok(result.dumps.living);
  assert.ok(result.dumps.timeline);
  assert.equal(typeof result.summary.totalAnomalies, 'number');
});

test('Console command: dumpall triggers unified dump', () => {
  const out = executeConsoleLine('dumpall test-run');
  assert.ok(out.includes('All diagnostics dumped to disk'));
  assert.ok(out.includes('test-run'));
});
