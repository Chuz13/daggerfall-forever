import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => readFileSync(join(root, p));
const rdText = (p) => readFileSync(join(root, p), 'utf8');

test('app icons exist as valid PNGs with expected dimensions', () => {
  const expected = [
    ['public/icons/icon-512.png', 512, 512],
    ['public/icons/icon-192.png', 192, 192],
    ['public/icons/icon-512-maskable.png', 512, 512],
  ];
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const [rel, w, h] of expected) {
    assert.ok(existsSync(join(root, rel)), `${rel} exists`);
    const buf = rd(rel);
    assert.ok(buf.subarray(0, 8).equals(pngMagic), `${rel} has PNG magic bytes`);
    assert.equal(buf.readUInt32BE(16), w, `${rel} width is ${w}`);
    assert.equal(buf.readUInt32BE(20), h, `${rel} height is ${h}`);
  }
});

test('app/main.cjs sets window icon via nativeImage in both createWindow and openLauncherWindow', () => {
  const main = rdText('app/main.cjs');
  assert.match(main, /\bnativeImage\b/);
  assert.match(main, /function getAppIcon\(\)/);
  const createWin = main.slice(main.indexOf('async function createWindow('), main.indexOf('// ---- the launcher'));
  const launcherWin = main.slice(
    main.indexOf('function openLauncherWindow()'),
    main.indexOf('function renderLauncher()'),
  );
  assert.match(createWin, /icon:\s*getAppIcon\(\)/);
  assert.match(launcherWin, /icon:\s*getAppIcon\(\)/);
});

test('app/afterPack.cjs embeds Windows exe icon with resedit while preserving macOS codesign', () => {
  const hook = rdText('app/afterPack.cjs');
  assert.match(hook, /context\.electronPlatformName === 'win32'/);
  assert.match(hook, /require\('resedit'\)/);
  assert.match(hook, /IconGroupEntry\.replaceIconsForResource/);
  assert.match(hook, /if \(context\.electronPlatformName !== 'darwin'\) return;/);
  assert.match(hook, /execFileSync\('codesign'/);
  const pkg = JSON.parse(rdText('app/package.json'));
  assert.equal(pkg.build?.win?.signAndEditExecutable, false);
});
