// AUDIT INSTALL (lane 5 #15, 2026-09-29): THE MAC BUILD IS SIGNED - AD HOC.
//
// electron-builder signs a Mac app only with an identity from a keychain,
// and the release has none (CSC_IDENTITY_AUTO_DISCOVERY: 'false'), so it
// skipped signing (app-builder-lib 25.1.8 macPackager.sign: no identity,
// return) - and the bundle it had renamed and given its own Info.plist kept
// Electron's signature, which those changes BROKE. A downloaded app whose
// signature is broken is "damaged and can't be opened", with no Open Anyway
// to press. An ad-hoc signature is whole, if nobody's: the first launch is
// then the ordinary "cannot be verified" warning that System Settings >
// Privacy & Security answers, which is what the landing page tells a Mac
// player to do. Runs after packing, before the dmg is made from the app;
// every other platform passes straight through.
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

async function patchWinExecutableIcon(context) {
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  if (!fs.existsSync(exePath)) return;
  const iconPath = typeof context.packager.getIconPath === 'function' ? await context.packager.getIconPath() : null;
  if (!iconPath || !fs.existsSync(iconPath)) return;
  const { NtExecutable, NtExecutableResource, Data, Resource } = require('resedit');
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);
  const iconFile = Data.IconFile.from(fs.readFileSync(iconPath));
  const groups = Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups[0]?.id ?? 1;
  const lang = groups[0]?.lang ?? 1033;
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    groupId,
    lang,
    iconFile.icons.map((i) => i.data),
  );
  res.outputResource(exe);
  const tmpPath = `${exePath}.tmp`;
  fs.writeFileSync(tmpPath, Buffer.from(exe.generate()));
  fs.renameSync(tmpPath, exePath);
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName === 'win32') {
    await patchWinExecutableIcon(context);
    return;
  }
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
