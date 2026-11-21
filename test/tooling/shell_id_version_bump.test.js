import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { normalizedAppPackageDigest, shellId, shellChangedSince } from '../../scripts/desktopRelease.mjs';

const hasGitTag = (tag) => {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

test('normalizedAppPackageDigest ignores version bumps but detects real package.json edits', () => {
  const base = { name: 'daggerfall-js-app', version: '0.6.0', dependencies: { 'electron-updater': '^6.8.9' } };
  const bumped = { ...base, version: '0.6.5' };
  const depChanged = { ...base, version: '0.6.5', dependencies: { 'electron-updater': '^6.9.0' } };
  const buildChanged = { ...base, build: { appId: 'dev.chuz13.daggerfallforever' } };

  assert.equal(normalizedAppPackageDigest(JSON.stringify(base)), normalizedAppPackageDigest(JSON.stringify(bumped)));
  assert.notEqual(normalizedAppPackageDigest(JSON.stringify(base)), normalizedAppPackageDigest(JSON.stringify(depChanged)));
  assert.notEqual(normalizedAppPackageDigest(JSON.stringify(base)), normalizedAppPackageDigest(JSON.stringify(buildChanged)));
});

test('shellId ignores app/package.json version bumps while detecting real shell changes', () => {
  const makeStub = ({
    pkgVersion = '0.6.0',
    depVersion = '^6.8.9',
    mainBlob = 'aaaa1111',
    menuPadBlob = 'bbbb2222',
  } = {}) => {
    const pkgJson = JSON.stringify({
      name: 'daggerfall-js-app',
      version: pkgVersion,
      dependencies: { 'electron-updater': depVersion },
    });
    return (args) => {
      const [cmd, target] = args;
      if (cmd === 'ls-tree') return `100644 blob ${mainBlob}\tmain.cjs\n100644 blob deadbeef\tpackage.json\n`;
      if (cmd === 'show' && target.endsWith(':app/package.json')) return pkgJson;
      if (cmd === 'rev-parse' && target.endsWith(':src/ui/menu/menuPad.js')) return menuPadBlob;
      return 'cccc3333';
    };
  };

  const inputs = ['app', 'src/ui/menu/menuPad.js'];
  const id060 = shellId(makeStub({ pkgVersion: '0.6.0' }), 'HEAD', inputs);
  const id065 = shellId(makeStub({ pkgVersion: '0.6.5' }), 'HEAD', inputs);
  const idDep = shellId(makeStub({ pkgVersion: '0.6.5', depVersion: '^6.9.0' }), 'HEAD', inputs);
  const idMain = shellId(makeStub({ pkgVersion: '0.6.5', mainBlob: '9999ffff' }), 'HEAD', inputs);
  const idPad = shellId(makeStub({ pkgVersion: '0.6.5', menuPadBlob: '8888eeee' }), 'HEAD', inputs);

  assert.match(id060, /^[0-9a-f]{64}$/);
  assert.equal(id060, id065);
  assert.notEqual(id060, idDep);
  assert.notEqual(id060, idMain);
  assert.notEqual(id060, idPad);

  // Minimal rev-parse-only stub compatibility (ls-tree returns undefined)
  const minimalStub = (args) => (args[0] === 'rev-parse' ? `obj:${args[1]}` : undefined);
  assert.match(shellId(minimalStub, 'HEAD', inputs), /^[0-9a-f]{64}$/);
});

test('real repo tags: 0.6.0 -> 0.6.5 keeps identical shellId while 0.5.3 -> 0.6.0 changes it', (t) => {
  if (!hasGitTag('app-v0.5.3') || !hasGitTag('app-v0.6.0') || !hasGitTag('app-v0.6.5')) {
    t.skip('release tags not present in shallow checkout');
    return;
  }
  assert.equal(shellId(undefined, 'app-v0.6.0'), shellId(undefined, 'app-v0.6.5'));
  assert.notEqual(shellId(undefined, 'app-v0.5.3'), shellId(undefined, 'app-v0.6.0'));
  assert.equal(shellChangedSince('app-v0.6.0', undefined, 'app-v0.6.5'), false);
  assert.equal(shellChangedSince('app-v0.5.3', undefined, 'app-v0.6.0'), true);
});
