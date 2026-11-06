import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  writeSessionLogToDisk,
  rotateSessionLogs,
  DEFAULT_KEEP_COUNT,
} = require('../../scripts/sessionLogStorage.cjs');

import { buildDiagnosticSnapshot, dumpSessionLog } from '../../src/systems/diagnostics/sessionLogger.js';
import { executeConsoleLine } from '../../src/systems/consoleCommands.js';

test('Session Logging: buildDiagnosticSnapshot collects complete telemetry across all 7 offline systems', () => {
  const snap = buildDiagnosticSnapshot('unit-test');

  assert.ok(snap.meta, 'Metadata must exist');
  assert.equal(snap.meta.triggerReason, 'unit-test');
  assert.ok(snap.player, 'Player block must exist');

  // Verify 7 offline systems presence
  assert.ok(snap.systems.firmament, 'Firmament diagnostics must exist');
  assert.ok(snap.systems.banking, 'Banking diagnostics must exist');
  assert.ok(snap.systems.housing, 'Housing diagnostics must exist');
  assert.ok(snap.systems.professions, 'Professions diagnostics must exist');
  assert.ok(snap.systems.livingTamriel, 'Living Tamriel diagnostics must exist');
  assert.equal(snap.systems.livingTamriel.totalRegions, 71, '71 regions registered');
  assert.ok(snap.systems.dynasty, 'Dynasty diagnostics must exist');
  assert.ok(snap.systems.bounty, 'Bounty diagnostics must exist');

  // Runtime issues block
  assert.ok(snap.runtimeIssues, 'Runtime issues block must exist');
  assert.equal(typeof snap.runtimeIssues.errorCount, 'number');
});

test('Session Logging: writeSessionLogToDisk and rotation maintains only 5 newest session files', () => {
  const tempLogsDir = path.join(tmpdir(), `dff-test-logs-${Date.now()}`);
  fs.mkdirSync(tempLogsDir, { recursive: true });

  try {
    // Generate 7 mock session files with staggered timestamps
    for (let i = 1; i <= 7; i++) {
      const payload = { sessionIndex: i, time: Date.now() + i * 1000 };
      const res = writeSessionLogToDisk(payload, { logsDir: tempLogsDir, keepCount: 5 });
      assert.equal(res.ok, true, `Write ${i} should succeed`);
    }

    const files = fs.readdirSync(tempLogsDir);
    const sessionFiles = files.filter((f) => f.startsWith('session-') && f.endsWith('.json') && f !== 'session-latest.json');
    assert.equal(sessionFiles.length, 5, 'Rotation should cap files at exactly 5');
    assert.ok(files.includes('session-latest.json'), 'session-latest.json must always exist');

    const latestContent = JSON.parse(fs.readFileSync(path.join(tempLogsDir, 'session-latest.json'), 'utf8'));
    assert.equal(latestContent.sessionIndex, 7, 'Latest session should be the most recently written');
  } finally {
    try {
      fs.rmSync(tempLogsDir, { recursive: true, force: true });
    } catch {
      /* cleanup */
    }
  }
});

test('Session Logging: console dumplog command triggers session telemetry dump', () => {
  const res = executeConsoleLine('dumplog test-trigger');
  assert.ok(res.includes('Session diagnostic log dumped'));
  assert.ok(res.includes('test-trigger'));
});

