// ═══════════════════════════════════════════════════════════════════
// DFF SESSION LOGGER VITE PLUGIN
//
// Middleware endpoint receiving diagnostic dumps from the browser
// via navigator.sendBeacon or fetch POST to /api/dev/session-log
// ═══════════════════════════════════════════════════════════════════

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { writeSessionLogToDisk } = require('./sessionLogStorage.cjs');

export function dffSessionLoggerPlugin() {
  return {
    name: 'dff-session-logger',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method === 'POST' && req.url && (req.url === '/api/dev/session-log' || req.url.startsWith('/api/dev/session-log'))) {
          let body = '';
          req.on('data', (chunk) => { body += chunk; });
          req.on('end', () => {
            try {
              const payload = body ? JSON.parse(body) : {};
              const result = writeSessionLogToDisk(payload);
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
