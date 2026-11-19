import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

/** Absolute path to the repository root. */
export const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const DEFAULT_IGNORED_CONSOLE_ERRORS = [/CURSOR\.IMG|status of 404/i];

/** Verify that ARENA2_PATH points to an existing local ARENA2 directory. */
export function requireArena2Path() {
  const arena2Path = process.env.ARENA2_PATH?.trim() ?? '';
  if (!arena2Path || !existsSync(arena2Path) || !statSync(arena2Path).isDirectory()) {
    throw new Error(
      'ARENA2_PATH must point to an existing local Daggerfall ARENA2 directory before running live-world E2E probes.',
    );
  }
  return arena2Path;
}

/** Create a lightweight assertion ledger for probe scripts. */
export function createCheckLedger() {
  const results = [];
  const check = (label, ok, detail = '') => {
    const pass = Boolean(ok);
    const entry = { label, ok: pass, detail: String(detail) };
    results.push(entry);
    console.log(`${pass ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
    return pass;
  };
  const summary = () => {
    const failed = results.filter((r) => !r.ok);
    return {
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      failures: failed,
    };
  };
  return { check, results, summary };
}

/** Parse a `health / maxHealth` UI string into numbers. */
export function parseHealthPair(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const match = text.match(/(-?\d+)\s*\/\s*(-?\d+)/);
  if (!match) return { text, health: null, maxHealth: null };
  return { text, health: Number(match[1]), maxHealth: Number(match[2]) };
}

/** Capture a screenshot only when an output directory is configured. */
export async function maybeShot(page, shotsDir, filename) {
  if (!shotsDir) return null;
  mkdirSync(shotsDir, { recursive: true });
  const targetPath = join(shotsDir, filename);
  await page.screenshot({ path: targetPath });
  return targetPath;
}

async function launchBrowserWithWebGL() {
  const swiftArgs = [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ];
  const attempts = [
    { name: 'Chrome (native GPU)', opts: { channel: 'chrome', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] } },
    { name: 'Chrome (SwiftShader)', opts: { channel: 'chrome', headless: true, args: swiftArgs } },
    { name: 'Edge (SwiftShader)', opts: { channel: 'msedge', headless: true, args: swiftArgs } },
    { name: 'Chromium (SwiftShader)', opts: { headless: true, args: swiftArgs } },
  ];
  for (const attempt of attempts) {
    let browser;
    try {
      browser = await chromium.launch(attempt.opts);
      const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
      const probePage = await ctx.newPage();
      const glOk = await probePage.evaluate(() => Boolean(document.createElement('canvas').getContext('webgl2')));
      await ctx.close();
      if (glOk) {
        console.log(`Launched browser: ${attempt.name}`);
        return browser;
      }
      await browser.close();
    } catch (err) {
      if (browser) await browser.close().catch(() => {});
      console.log(`Browser probe "${attempt.name}" failed: ${err?.message ?? err}`);
    }
  }
  throw new Error('Failed to launch Chrome, Edge, or Chromium with WebGL2 support.');
}

/** Start Vite dev server and a WebGL2-capable Playwright browser session. */
export async function startLiveSession({
  port = 5225,
  requireArena2 = true,
  shotsDir = process.env.SHOTS?.trim() || null,
  ignoredConsoleErrors = DEFAULT_IGNORED_CONSOLE_ERRORS,
} = {}) {
  const arena2Path = requireArena2 ? requireArena2Path() : (process.env.ARENA2_PATH?.trim() || null);
  const server = await createServer({
    root: REPO_ROOT,
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null },
    logLevel: 'warn',
  });
  await server.listen();
  const actualPort = server.httpServer?.address()?.port ?? port;
  const baseUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`Vite dev server listening on ${baseUrl}`);

  let browser;
  const contexts = new Set();
  const pageErrors = [];
  const consoleErrors = [];

  try {
    browser = await launchBrowserWithWebGL();
  } catch (err) {
    await server.close().catch(() => {});
    throw err;
  }

  const attachListeners = (page) => {
    page.on('pageerror', (err) => {
      const msg = String(err?.message ?? err);
      pageErrors.push(msg);
      console.log(`[pageerror] ${msg}`);
    });
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const txt = msg.text();
      if (ignoredConsoleErrors.some((pattern) => pattern.test(txt))) return;
      consoleErrors.push(txt);
      console.log(`[console.error] ${txt}`);
    });
  };

  const openPage = async ({ viewport = { width: 1280, height: 800 } } = {}) => {
    const context = await browser.newContext({ viewport });
    contexts.add(context);
    const page = await context.newPage();
    attachListeners(page);
    return { context, page };
  };

  const close = async () => {
    for (const context of contexts) {
      await context.close().catch(() => {});
    }
    contexts.clear();
    if (browser) await browser.close().catch(() => {});
    await server.close().catch(() => {});
  };

  return {
    arena2Path,
    baseUrl,
    shotsDir,
    server,
    browser,
    pageErrors,
    consoleErrors,
    openPage,
    close,
  };
}

/** Advance N animation frames in the active page. */
export async function waitFrames(page, count = 3) {
  await page.evaluate(
    (n) =>
      new Promise((resolveFrame) => {
        let left = n;
        const step = () => {
          if (--left <= 0) resolveFrame();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}

/** Wait until the 3D world scene finishes booting and hides the main menu. */
export async function waitWorldReady(page, { label = 'world', timeoutMs = 150000 } = {}) {
  const start = Date.now();
  let lastLog = 0;
  for (;;) {
    const st = await page.evaluate(() => ({
      title: document.title,
      isShot: new URLSearchParams(location.search).has('shot'),
      shotReady: window.__shotReady === true,
      frame: window.__frame ?? null,
      hasConsole: typeof window.__console === 'function',
      menuUp: Boolean(document.getElementById('enhanced-menu')),
      bodyErr: document.body?.textContent?.includes('boot failed') ? document.body.textContent.slice(0, 200) : null,
    }));
    if (st.bodyErr) throw new Error(`Game boot failed (${label}): ${st.bodyErr}`);
    const shotOk = !st.isShot || st.shotReady || (st.frame ?? 0) > 10;
    const ready = !st.menuUp && st.hasConsole && st.title === 'Daggerfall Forever' && shotOk;
    if (ready) {
      console.log(`[${label}] Ready in ${((Date.now() - start) / 1000).toFixed(1)}s: ${JSON.stringify(st)}`);
      return st;
    }
    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      console.log(`[${label}] waiting (${((Date.now() - start) / 1000).toFixed(0)}s): ${JSON.stringify(st)}`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timeout (${timeoutMs}ms) waiting for ${label}: ${JSON.stringify(st)}`);
    }
    await page.waitForTimeout(500);
  }
}

/** Clear startup tutorial banners and uncovered modal encounter dialogs. */
export async function dismissNoticesAndDialogs(page, { label = 'notices', maxSteps = 16 } = {}) {
  let dismissed = 0;
  for (let i = 0; i < maxSteps; i++) {
    const state = await page.evaluate(() => {
      const modalNotice = [...document.querySelectorAll('#enhanced-notice .notice:not(.notice-toast):not(.notice-out)')].find((el) => {
        const style = getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && (el.textContent ?? '').trim().length > 0;
      });
      const dlg = [...document.querySelectorAll('.dlg-shell:not(.dlg-covered)')].find(
        (el) => getComputedStyle(el).display !== 'none',
      );
      const pauseUp = Boolean(document.getElementById('enhanced-pause'));
      return {
        hasNotice: Boolean(modalNotice),
        hasDlg: Boolean(dlg),
        dlgText: dlg ? (dlg.textContent ?? '').trim().slice(0, 80) : '',
        pauseUp,
      };
    });
    if (state.pauseUp || (!state.hasNotice && !state.hasDlg)) break;
    if (state.hasNotice) {
      await page.keyboard.press('Space');
      dismissed += 1;
      await page.waitForTimeout(300);
    } else if (state.hasDlg) {
      console.log(`[${label}] Dismissing modal dialog: ${state.dlgText}`);
      const btn = page.locator('.dlg-shell:not(.dlg-covered) button.dlg-btn').last();
      if ((await btn.count()) > 0) {
        await btn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      dismissed += 1;
      await page.waitForTimeout(300);
    }
  }
  if (dismissed > 0) {
    await page.waitForTimeout(450);
    console.log(`[${label}] Dismissed ${dismissed} tutorial/dialog step(s)`);
  }
  return dismissed;
}

/** Navigate to a live world URL, wait for readiness, settle frames, and clear overlays. */
export async function bootWorldPage(page, url, { label = 'world', timeoutMs = 150000, settleFrames = 5 } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitWorldReady(page, { label, timeoutMs });
  await waitFrames(page, settleFrames);
  await dismissNoticesAndDialogs(page, { label });
}

/** Read live playerEntity vitals and progression fields from the game page. */
export async function getLiveVitals(page) {
  return page.evaluate(async () => {
    const { playerEntity } = await import('/src/characters/playerEntity.js');
    return {
      name: playerEntity.name ?? null,
      characterId: playerEntity.characterId ?? null,
      level: playerEntity.level ?? null,
      health: playerEntity.health ?? null,
      maxHealth: playerEntity.maxHealth ?? null,
      rawMaxHealth: playerEntity.rawMaxHealth ?? null,
      magicka: playerEntity.magicka ?? null,
      maxMagicka: playerEntity.maxMagicka ?? null,
      ascended: Boolean(playerEntity.apotheosis?.ascended),
      portfolio: playerEntity.apotheosis?.portfolio ?? null,
      lich: playerEntity.racialOverride?.racial ?? playerEntity.racialOverride?.kind ?? null,
      activeEffectsCount: Array.isArray(playerEntity.activeEffects) ? playerEntity.activeEffects.length : 0,
    };
  });
}

/** Open the debug console via Backquote and execute one command string. */
export async function runDebugConsoleCommand(page, cmd) {
  await page.waitForFunction(() => typeof window.__console === 'function', null, { timeout: 60000 });
  const isVisible = () =>
    page.evaluate(() => {
      const el = document.getElementById('df-debug-console');
      return Boolean(el && getComputedStyle(el).display !== 'none');
    });

  let openedUi = await isVisible();
  for (let attempt = 0; attempt < 2 && !openedUi; attempt++) {
    if (attempt > 0) await waitFrames(page, 2);
    await page.keyboard.press('Backquote');
    try {
      await page.waitForSelector('#df-debug-input', { state: 'visible', timeout: 2500 });
      openedUi = true;
    } catch {
      openedUi = false;
    }
  }

  if (openedUi) {
    const beforeCount = await page.locator('#df-debug-log .df-console-line').count();
    await page.locator('#df-debug-input').fill(cmd);
    await page.locator('#df-debug-input').press('Enter');
    await page
      .waitForFunction(
        (prev) => document.querySelectorAll('#df-debug-log .df-console-line').length > prev,
        beforeCount,
        { timeout: 10000 },
      )
      .catch(() => {});
    await page.waitForTimeout(150);
    const lines = await page.evaluate((prev) => {
      const all = [...document.querySelectorAll('#df-debug-log .df-console-line')];
      return all.slice(prev).map((el) => el.textContent);
    }, beforeCount);
    const closeBtn = page.locator('#df-debug-console button[title="Close Console"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Backquote');
    }
    await page.waitForSelector('#df-debug-console', { state: 'hidden', timeout: 3000 }).catch(() => {});
    return { via: 'ui', output: lines.join('\n') };
  }

  const out = await page.evaluate((c) => window.__console(c), cmd);
  return { via: 'hook', output: String(out ?? '') };
}

async function collectBodyDiagnostics(page) {
  return page.evaluate(async () => {
    let enhanced = null;
    let doorReady = null;
    try {
      enhanced = (await import('/src/systems/uiSkin.js')).isEnhanced();
      doorReady = (await import('/src/ui/pauseDoor.js')).pauseDoorReady();
    } catch (err) {
      enhanced = String(err);
    }
    const ae = document.activeElement;
    const children = [...document.body.children]
      .filter((el) => el.tagName !== 'CANVAS')
      .map((el) => ({
        tag: el.tagName,
        id: el.id || null,
        cls: el.className || null,
        display: getComputedStyle(el).display,
        text: (el.textContent ?? '').trim().slice(0, 120),
      }));
    return {
      enhanced,
      doorReady,
      activeEl: ae ? { tag: ae.tagName, id: ae.id || null, cls: ae.className || null } : null,
      pauseOuter: document.getElementById('enhanced-pause')?.outerHTML?.slice(0, 400) ?? null,
      children,
    };
  });
}

/** Open the enhanced pause menu safely after clearing tutorials or dialogs. */
export async function openPause(page, { shotsDir = null, maxAttempts = 4 } = {}) {
  const already = await page.locator('#enhanced-pause .px-win').isVisible().catch(() => false);
  if (already) return;
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await dismissNoticesAndDialogs(page, { label: `openPause-${attempt}` });
    await page.evaluate(() => {
      document.activeElement?.blur?.();
    });
    await waitFrames(page, 1);
    await page.keyboard.press('Escape');
    try {
      await page.waitForSelector('#enhanced-pause .px-win', {
        state: 'visible',
        timeout: attempt < maxAttempts ? 2500 : 8000,
      });
      return;
    } catch (err) {
      lastErr = err;
      const diag = await collectBodyDiagnostics(page);
      console.log(`[openPause] Attempt ${attempt}/${maxAttempts} did not open pause menu. Diag:`, JSON.stringify(diag));
      await maybeShot(page, shotsDir, `debug_openPause_try${attempt}.png`).catch(() => {});
    }
  }
  const finalDiag = await collectBodyDiagnostics(page);
  throw new Error(`openPause failed after ${maxAttempts} attempts: ${lastErr?.message ?? lastErr}; diag=${JSON.stringify(finalDiag)}`);
}

/** Close the enhanced pause menu if open. */
export async function closePause(page) {
  const visible = await page.locator('#enhanced-pause').isVisible().catch(() => false);
  if (!visible) return;
  await page.keyboard.press('Escape');
  try {
    await page.waitForSelector('#enhanced-pause', { state: 'detached', timeout: 5000 });
  } catch {
    await page.keyboard.press('Escape');
    await page.waitForSelector('#enhanced-pause', { state: 'detached', timeout: 5000 });
  }
}

/** Click a top-level tab inside the pause menu. */
export async function clickPauseTab(page, label) {
  const btn = page.locator('#enhanced-pause .px-tabs button').filter({ hasText: label }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
}

/** Click a rail item inside the pause System panel. */
export async function clickSystemRail(page, label) {
  const btn = page.locator('#enhanced-pause .px-qrail button').filter({ hasText: label }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
}

/** Attach synchronous save/load event counters to window for reliable Playwright waits. */
export async function installSaveSlotCounters(page) {
  await page.evaluate(async () => {
    if (window.__slotCountersInstalled) return;
    window.__slotCountersInstalled = true;
    window.__slotSaveCount = 0;
    window.__slotLoadCount = 0;
    const { onSlotSaved, onSlotLoaded } = await import('/src/systems/save/saveSlots.js');
    onSlotSaved(() => {
      window.__slotSaveCount = (window.__slotSaveCount ?? 0) + 1;
    });
    onSlotLoaded(() => {
      window.__slotLoadCount = (window.__slotLoadCount ?? 0) + 1;
    });
  });
}

/** Save the current game under the named slot via Pause -> System -> Save Game. */
export async function saveViaUi(page, slotName, { shotsDir = null } = {}) {
  await installSaveSlotCounters(page);
  const beforeSaves = await page.evaluate(() => window.__slotSaveCount ?? 0);
  await openPause(page, { shotsDir });
  await clickPauseTab(page, 'System');
  await clickSystemRail(page, 'Save Game');
  const input = page.locator('#enhanced-pause .px-qdetail input[type="text"]').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.fill(slotName);
  const saveBtn = page.locator('#enhanced-pause .px-qdetail button.act.primary').filter({ hasText: /^Save$/i }).first();
  await saveBtn.click();
  await page.waitForSelector('#enhanced-pause', { state: 'detached', timeout: 15000 });
  await page.waitForFunction((prev) => (window.__slotSaveCount ?? 0) > prev, beforeSaves, { timeout: 15000 });
  await waitFrames(page, 3);
}

/** Click the Load button on a named save tile inside a menu root. */
export async function clickTileLoadButton(page, slotName, rootSelector = '#enhanced-pause') {
  const clicked = await page.evaluate(
    ({ targetSlot, rootSel }) => {
      const root = document.querySelector(rootSel) ?? document;
      for (const tile of root.querySelectorAll('.svtile')) {
        const slotEl = tile.querySelector('.svslot');
        if ((slotEl?.textContent ?? '').trim() !== targetSlot) continue;
        const btn = [...tile.querySelectorAll('button')].find((b) => /^Load$/i.test((b.textContent ?? '').trim()));
        if (btn && !btn.disabled) {
          btn.click();
          return true;
        }
      }
      return false;
    },
    { targetSlot: slotName, rootSel: rootSelector },
  );
  if (!clicked) throw new Error(`Could not find clickable Load button for tile "${slotName}" in ${rootSelector}`);
}

/** Load a saved slot via Pause -> System -> Load Game and wait for full world restore. */
export async function loadSlotViaUi(
  page,
  slotName,
  { inspectShot = null, shotsDir = null, timeoutMs = 120000, settleFrames = 4 } = {},
) {
  await installSaveSlotCounters(page);
  const beforeLoads = await page.evaluate(() => window.__slotLoadCount ?? 0);
  await openPause(page, { shotsDir });
  await clickPauseTab(page, 'System');
  await clickSystemRail(page, 'Load Game');
  await page.locator('#enhanced-pause .svtile').first().waitFor({ state: 'visible', timeout: 10000 });
  const tile = await readTileHealth(page, slotName);
  if (inspectShot) await maybeShot(page, shotsDir, inspectShot);
  await clickTileLoadButton(page, slotName);
  await page.waitForSelector('#enhanced-pause', { state: 'detached', timeout: 15000 });

  const start = Date.now();
  let lastLog = 0;
  let lastState = null;
  for (;;) {
    lastState = await page.evaluate(async () => {
      const { playerEntity } = await import('/src/characters/playerEntity.js');
      return {
        loadCount: window.__slotLoadCount ?? 0,
        frame: window.__frame ?? null,
        streamIdle: typeof window.__streamIdle === 'function' ? window.__streamIdle() : null,
        title: document.title,
        health: playerEntity.health ?? null,
        maxHealth: playerEntity.maxHealth ?? null,
        rawMaxHealth: playerEntity.rawMaxHealth ?? null,
      };
    });
    if (lastState.loadCount > beforeLoads) {
      console.log(`[load:${slotName}] Completed in ${((Date.now() - start) / 1000).toFixed(1)}s: ${JSON.stringify(lastState)}`);
      break;
    }
    if (Date.now() - lastLog > 5000) {
      lastLog = Date.now();
      console.log(`[load:${slotName}] waiting (${((Date.now() - start) / 1000).toFixed(0)}s): ${JSON.stringify(lastState)}`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`loadSlotViaUi("${slotName}") timed out after ${timeoutMs}ms; lastState=${JSON.stringify(lastState)}`);
    }
    await page.waitForTimeout(500);
  }
  await waitFrames(page, settleFrames);
  return tile;
}

async function readStatsHealthInCard(page, cardSelector) {
  const raw = await page.evaluate((sel) => {
    const card = document.querySelector(sel);
    if (!card) return null;
    for (const dt of card.querySelectorAll('dl.stats dt')) {
      if (/health/i.test(dt.textContent ?? '')) {
        return dt.nextElementSibling ? dt.nextElementSibling.textContent : null;
      }
    }
    return null;
  }, cardSelector);
  return parseHealthPair(raw);
}

/** Read displayed Health from the "Overwrites..." preview card on Pause -> Save Game. */
export async function readOverwritePreviewHealth(page) {
  return readStatsHealthInCard(page, '#enhanced-pause .px-qdetail .card');
}

/** Read displayed Health from a named save tile inside Pause or Main Menu. */
export async function readTileHealth(page, slotName, rootSelector = '#enhanced-pause') {
  const raw = await page.evaluate(
    ({ targetSlot, rootSel }) => {
      const root = document.querySelector(rootSel) ?? document;
      for (const tile of root.querySelectorAll('.svtile')) {
        const slotEl = tile.querySelector('.svslot');
        if ((slotEl?.textContent ?? '').trim() !== targetSlot) continue;
        for (const dt of tile.querySelectorAll('dl.stats dt')) {
          if (/health/i.test(dt.textContent ?? '')) {
            return dt.nextElementSibling ? dt.nextElementSibling.textContent : null;
          }
        }
      }
      return null;
    },
    { targetSlot: slotName, rootSel: rootSelector },
  );
  return parseHealthPair(raw);
}

/** Read the player Health meter value on Pause -> Stats -> Character. */
export async function readPauseCharacterHealth(page) {
  const raw = await page.evaluate(() => {
    for (const row of document.querySelectorAll('#enhanced-pause .px-qdetail .px-mrow')) {
      const key = row.querySelector('.px-mtop .k')?.textContent ?? '';
      if (/health/i.test(key)) {
        return row.querySelector('.px-mtop .v')?.textContent ?? null;
      }
    }
    return null;
  });
  return parseHealthPair(raw);
}

/** Read displayed Health from the Main Menu Continue preview card. */
export async function readContinueHealth(page) {
  return readStatsHealthInCard(page, '#enhanced-menu .card');
}
