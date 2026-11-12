// ═══════════════════════════════════════════════════════════════════
// DFF DIAGNOSTICS & LOGGER VITE PLUGIN
//
// Middleware endpoint receiving diagnostic dumps from the browser
// via navigator.sendBeacon or fetch POST to:
// - /api/dev/session-log
// - /api/dev/combat-log
// - /api/dev/encounter-log
// ═══════════════════════════════════════════════════════════════════

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  writeSessionLogToDisk,
  writeCombatLogToDisk,
  writeEncounterLogToDisk,
  writeLivingLogToDisk,
  writeTimelineLogToDisk,
} = require('./sessionLogStorage.cjs');

export function dffSessionLoggerPlugin() {
  return {
    name: 'dff-session-logger',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        const isSession = url === '/api/dev/session-log' || url.startsWith('/api/dev/session-log');
        const isCombat = url === '/api/dev/combat-log' || url.startsWith('/api/dev/combat-log');
        const isEncounter = url === '/api/dev/encounter-log' || url.startsWith('/api/dev/encounter-log');
        const isLiving = url === '/api/dev/living-log' || url.startsWith('/api/dev/living-log');
        const isTimeline = url === '/api/dev/timeline-log' || url.startsWith('/api/dev/timeline-log');

        if (req.method === 'POST' && (isSession || isCombat || isEncounter || isLiving || isTimeline)) {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const result = isCombat
                ? writeCombatLogToDisk(payload)
                : isEncounter
                  ? writeEncounterLogToDisk(payload)
                  : isLiving
                    ? writeLivingLogToDisk(payload)
                    : isTimeline
                      ? writeTimelineLogToDisk(payload)
                      : writeSessionLogToDisk(payload);

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = result.ok ? 200 : 500;
              res.end(JSON.stringify(result));
            } catch (err) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: err?.message || 'Invalid JSON' }));
            }
          });
          return;
        }
        next();
      });
    },
  };
}
