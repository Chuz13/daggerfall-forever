import test from 'node:test';
import assert from 'node:assert/strict';
import { playerFp3dOn, playerTp3dOn, playerBodyOn, inventoryBodyOn, itemIconsOn } from '../../src/characters/npcBodies.js';
import { setPref, getPref, PREF_DEFAULTS, loadPrefs, _resetForTests } from '../../src/systems/uiPrefs.js';
import { modelIconUrl } from '../../src/ui/item/itemIconUrl.js';
import { mwCanThirdPerson, eotbLane } from '../../src/player/mwView.js';

test('mwPlayerFp and mwPlayerTp toggles: independent 2d/3d switching live', async () => {
  const { fpArm } = await import('../../src/combat/fpArm.js');
  const origFp = getPref('mwPlayerFp');
  const origTp = getPref('mwPlayerTp');
  const savedReady = fpArm.ready;
  const savedCanThird = fpArm.canThirdPerson;
  try {
    assert.equal(PREF_DEFAULTS.mwPlayerFp, '2d');
    assert.equal(PREF_DEFAULTS.mwPlayerTp, '2d');

    fpArm.ready = () => true;
    fpArm.canThirdPerson = () => !fpArm.standingIn() && !fpArm.tpOff();

    setPref('mwPlayerFp', '2d');
    setPref('mwPlayerTp', '2d');
    assert.equal(playerFp3dOn(), false);
    assert.equal(playerTp3dOn(), false);
    assert.equal(playerBodyOn(), false);
    assert.equal(mwCanThirdPerson(), false);
    assert.equal(fpArm.tpOff(), true);

    setPref('mwPlayerFp', '3d');
    setPref('mwPlayerTp', '2d');
    assert.equal(playerFp3dOn(), true);
    assert.equal(playerTp3dOn(), false);
    assert.equal(playerBodyOn(), true, 'compat playerBodyOn true when FP is 3D');
    assert.equal(mwCanThirdPerson(), false, 'TP remains 2D when only FP is 3D');
    assert.equal(fpArm.tpOff(), true);

    setPref('mwPlayerFp', '2d');
    setPref('mwPlayerTp', '3d');
    assert.equal(playerFp3dOn(), false);
    assert.equal(playerTp3dOn(), true);
    assert.equal(playerBodyOn(), true, 'compat playerBodyOn true when TP is 3D');
    assert.equal(mwCanThirdPerson(), true, 'TP 3D active even when FP is 2D');
    assert.equal(fpArm.tpOff(), false);

    setPref('mwPlayerFp', '3d');
    setPref('mwPlayerTp', '3d');
    assert.equal(playerFp3dOn(), true);
    assert.equal(playerTp3dOn(), true);
    assert.equal(mwCanThirdPerson(), true);
  } finally {
    setPref('mwPlayerFp', origFp);
    setPref('mwPlayerTp', origTp);
    fpArm.ready = savedReady;
    fpArm.canThirdPerson = savedCanThird;
    fpArm.setTpOff(false);
  }
});

test('mwInventoryBody setting: follow tracks TP (not FP), 3d and paperdoll stay independent with and without MW data', async () => {
  const { fpArm } = await import('../../src/combat/fpArm.js');
  const origFp = getPref('mwPlayerFp');
  const origTp = getPref('mwPlayerTp');
  const origInv = getPref('mwInventoryBody');
  const savedReady = fpArm.ready;
  try {
    // 1. Without Morrowind data (morrowindDataCount() === 0 and fpArm.ready() === false)
    fpArm.ready = () => false;
    for (const mode of ['follow', '3d', 'paperdoll']) {
      setPref('mwInventoryBody', mode);
      setPref('mwPlayerFp', '3d');
      setPref('mwPlayerTp', '3d');
      assert.equal(inventoryBodyOn(), false, `without Morrowind data, mode=${mode} safely returns false`);
    }

    // 2. With Morrowind data (fpArm.ready() === true)
    fpArm.ready = () => true;

    // Mode: 'follow' tracks mwPlayerTp ONLY (never mwPlayerFp)
    setPref('mwInventoryBody', 'follow');
    for (const [fp, tp, expect] of [
      ['2d', '2d', false],
      ['3d', '2d', false],
      ['2d', '3d', true],
      ['3d', '3d', true],
    ]) {
      setPref('mwPlayerFp', fp);
      setPref('mwPlayerTp', tp);
      assert.equal(inventoryBodyOn(), expect, `follow + FP=${fp}, TP=${tp} -> ${expect}`);
    }

    // Mode: '3d' is always 3D when MW data is available
    setPref('mwInventoryBody', '3d');
    for (const [fp, tp] of [['2d', '2d'], ['3d', '2d'], ['2d', '3d'], ['3d', '3d']]) {
      setPref('mwPlayerFp', fp);
      setPref('mwPlayerTp', tp);
      assert.equal(inventoryBodyOn(), true, `3d + FP=${fp}, TP=${tp} -> true`);
    }

    // Mode: 'paperdoll' is always 2D paperdoll
    setPref('mwInventoryBody', 'paperdoll');
    for (const [fp, tp] of [['2d', '2d'], ['3d', '2d'], ['2d', '3d'], ['3d', '3d']]) {
      setPref('mwPlayerFp', fp);
      setPref('mwPlayerTp', tp);
      assert.equal(inventoryBodyOn(), false, `paperdoll + FP=${fp}, TP=${tp} -> false`);
    }
  } finally {
    setPref('mwPlayerFp', origFp);
    setPref('mwPlayerTp', origTp);
    setPref('mwInventoryBody', origInv);
    fpArm.ready = savedReady;
  }
});

test('mwItemIcons toggle: 3D item icons switch on and off live', () => {
  const origIcons = getPref('mwItemIcons');
  try {
    setPref('mwItemIcons', true);
    assert.equal(getPref('mwItemIcons'), true);

    setPref('mwItemIcons', false);
    assert.equal(getPref('mwItemIcons'), false);
    assert.equal(itemIconsOn(), false, 'itemIconsOn is false when mwItemIcons pref is false');

    // modelIconUrl must immediately return null when toggle is off
    const fakeArm = { itemIcon: () => ({ width: 32, height: 32, data: new Uint8ClampedArray(32 * 32 * 4) }) };
    const fakeItem = { templateIndex: 1, group: 'Weapons' };
    assert.equal(modelIconUrl(fakeItem, 32, fakeArm), null, 'modelIconUrl returns null when mwItemIcons is off');

    setPref('mwItemIcons', true);
    assert.equal(getPref('mwItemIcons'), true);
  } finally {
    setPref('mwItemIcons', origIcons);
  }
});

function createMockCif(recs) {
  const parts = recs.map(({ w, h, frames }) => {
    const head = 12 + 31 * 2 + 2, runs = Math.ceil((w * h) / 127) + 1;
    const b = new Uint8Array(head + runs * 2); const v = new DataView(b.buffer);
    v.setUint16(0, w, true); v.setUint16(2, h, true);
    for (let f = 0; f < frames; f++) v.setUint16(12 + f * 2, head, true);
    for (let k = 0; k < runs; k++) b[head + k * 2] = 255;
    v.setUint16(12 + 62, b.length, true);
    return b;
  });
  const wield = new Uint8Array(12 + 40 * 30); const wv = new DataView(wield.buffer);
  wv.setUint16(4, 40, true); wv.setUint16(6, 30, true); wv.setUint16(10, 40 * 30, true); wield.fill(1, 12);
  const all = [wield, ...parts];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0)); let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

test('FP=2D, TP=3D: classic first-person weapon draws while 3rd-person MW body remains eligible', async () => {
  const { createWeaponRig } = await import('../../src/combat/weapon/weaponRig.js');
  const { fpArm } = await import('../../src/combat/fpArm.js');
  const { EQUIP_SLOTS } = await import('../../src/systems/equip.js');

  const origFp = getPref('mwPlayerFp');
  const origTp = getPref('mwPlayerTp');
  const savedReady = fpArm.ready;
  const savedActive = fpArm.active;
  const savedThirdActive = fpArm.thirdActive;
  const savedCanThirdPerson = fpArm.canThirdPerson;

  try {
    setPref('mwPlayerFp', '2d');
    setPref('mwPlayerTp', '3d');

    fpArm.ready = () => true;
    fpArm.active = () => !fpArm.standingIn() && !fpArm.fpOff();
    fpArm.thirdActive = () => !fpArm.standingIn() && !fpArm.tpOff() && fpArm.viewMode() === 'third';
    fpArm.canThirdPerson = () => !fpArm.standingIn() && !fpArm.tpOff();

    const MELEE = createMockCif(Array.from({ length: 7 }, () => ({ w: 120, h: 100, frames: 5 })));
    const quads = [];
    const renderer = { uploadTexture: (_k, n) => n, drawScreenQuad: (t, r, u) => quads.push({ t, r, u }) };
    const canvas = { width: 320, height: 200, clientWidth: 320, clientHeight: 200 };

    const r = createWeaponRig({
      renderer, canvas, audio: { playOneShot() {} }, palette: { get: () => ({ r: 0, g: 0, b: 0 }) },
      fetchBytes: async () => MELEE,
      entity: { items: [], equip: { slots: { [EQUIP_SLOTS.RightHand]: { templateIndex: 120 } } } },
    });

    r.toggleSheath();
    for (let i = 0; i < 20; i++) {
      r.frame(1 / 60);
      r.draw();
      await new Promise((res) => setTimeout(res, 0));
    }

    assert.equal(fpArm.fpOff(), true, 'FP=2D disables FP 3D arm');
    assert.equal(fpArm.tpOff(), false, 'TP=3D keeps TP 3D body enabled');
    assert.equal(fpArm.active(), false, 'fpArm.active is false in FP=2D');
    assert.equal(fpArm.canThirdPerson(), true, '3rd-person MW body remains available when FP=2D, TP=3D');
    assert.ok(quads.length > 0, 'classic weapon quad draws in FP=2D even with TP=3D MW body ready');
  } finally {
    setPref('mwPlayerFp', origFp);
    setPref('mwPlayerTp', origTp);
    fpArm.setFpOff(false);
    fpArm.setTpOff(false);
    fpArm.setStandIn(false);
    fpArm.ready = savedReady;
    fpArm.active = savedActive;
    fpArm.thirdActive = savedThirdActive;
    fpArm.canThirdPerson = savedCanThirdPerson;
  }
});

test('FP=3D, TP=2D: 3D arms draw in 1st person, suppress in EOTB 3rd person, and restore immediately on mwViewFirstPerson', async () => {
  const { createWeaponRig } = await import('../../src/combat/weapon/weaponRig.js');
  const { fpArm } = await import('../../src/combat/fpArm.js');
  const { EQUIP_SLOTS } = await import('../../src/systems/equip.js');
  const { eotbCamera } = await import('../../src/player/eyeOfTheBeholder/eotbCamera.js');
  const { eotbBody } = await import('../../src/player/eyeOfTheBeholder/eotbBody.js');
  const { mwCamera } = await import('../../src/player/mwCamera.js');
  const {
    mwViewFrame,
    mwViewTogglePerspective,
    mwViewFirstPerson,
    setEotbBodyReady,
    setEotbDrawBody,
  } = await import('../../src/player/mwView.js');
  const { setModSetting, modSetting } = await import('../../src/systems/modSettings.js');

  const origFp = getPref('mwPlayerFp');
  const origTp = getPref('mwPlayerTp');
  const origEotb = modSetting('eye-of-the-beholder', 'Enabled');
  const savedReady = fpArm.ready;
  const savedActive = fpArm.active;
  const savedThirdActive = fpArm.thirdActive;
  const savedCanThirdPerson = fpArm.canThirdPerson;
  const savedDraw = fpArm.draw;

  try {
    setModSetting('eye-of-the-beholder', 'Enabled', true);
    setPref('mwPlayerFp', '3d');
    setPref('mwPlayerTp', '2d');

    let mwFpDraws = 0;
    fpArm.ready = () => true;
    fpArm.active = () => !fpArm.standingIn() && !fpArm.fpOff();
    fpArm.thirdActive = () => false;
    fpArm.canThirdPerson = () => !fpArm.standingIn() && !fpArm.tpOff();
    fpArm.draw = () => { mwFpDraws += 1; };

    eotbCamera.toggleOffset(false);
    mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });

    const MELEE = createMockCif(Array.from({ length: 7 }, () => ({ w: 120, h: 100, frames: 5 })));
    const quads = [];
    const renderer = { uploadTexture: (_k, n) => n, drawScreenQuad: (t, r, u) => quads.push({ t, r, u }) };
    const canvas = { width: 320, height: 200, clientWidth: 320, clientHeight: 200 };

    const r = createWeaponRig({
      renderer, canvas, audio: { playOneShot() {} }, palette: { get: () => ({ r: 0, g: 0, b: 0 }) },
      fetchBytes: async () => MELEE,
      entity: { items: [], equip: { slots: { [EQUIP_SLOTS.RightHand]: { templateIndex: 120 } } } },
    });
    setEotbBodyReady(() => true);
    setEotbDrawBody(() => true);

    r.toggleSheath();
    for (let i = 0; i < 5; i++) {
      mwViewFrame({ fpEye: [0, 1.7, 0], feet: [0, 0, 0], yaw: 0, pitch: 0, dt: 1 / 60 });
      r.frame(1 / 60);
      r.draw();
      await new Promise((res) => setTimeout(res, 0));
    }

    assert.equal(fpArm.tpOff(), true);
    assert.equal(fpArm.fpOff(), false);
    assert.equal(fpArm.active(), true, '3D FP arm active in 1st person');
    assert.equal(fpArm.canThirdPerson(), false, 'MW TP disabled when TP=2D');
    assert.ok(mwFpDraws > 0, '3D FP arm drew in 1st person');
    assert.equal(quads.length, 0, 'classic FP weapon quad suppressed while 3D FP arm draws');

    // Toggle into EOTB 3rd person: FP 3D arm must stand aside completely
    assert.equal(mwViewTogglePerspective(), true);
    assert.equal(eotbLane(), true);
    assert.equal(eotbCamera.thirdPerson(), true);
    mwViewFrame({ fpEye: [0, 1.7, 0], feet: [0, 0, 0], yaw: 0, pitch: 0, dt: 1 / 60 });
    r.frame(1 / 60);
    assert.equal(fpArm.fpOff(), true, 'FP 3D arm disabled while in EOTB 3rd person');
    assert.equal(fpArm.active(), false, 'fpArm.active is false in EOTB 3rd person (ranged/cast never wait on FP arm)');

    // Open travel map door (mwViewFirstPerson): returns to 1st person with FP 3D arm immediately active
    assert.equal(mwViewFirstPerson(), true);
    assert.equal(eotbCamera.thirdPerson(), false);
    assert.equal(fpArm.fpOff(), false, 'mwViewFirstPerson immediately restores FP 3D arm');
    assert.equal(fpArm.active(), true);
  } finally {
    setPref('mwPlayerFp', origFp);
    setPref('mwPlayerTp', origTp);
    setModSetting('eye-of-the-beholder', 'Enabled', origEotb);
    setEotbBodyReady(null);
    setEotbDrawBody(null);
    eotbBody.attach(null, null);
    eotbCamera.toggleOffset(false);
    fpArm.setFpOff(false);
    fpArm.setTpOff(false);
    fpArm.setStandIn(false);
    fpArm.ready = savedReady;
    fpArm.active = savedActive;
    fpArm.thirdActive = savedThirdActive;
    fpArm.canThirdPerson = savedCanThirdPerson;
    fpArm.draw = savedDraw;
  }
});

test('all combinations of mwPlayerFp x mwPlayerTp x mwInventoryBody work across live toggles and preserve Graphics.Paperdoll', async () => {
  const { fpArm } = await import('../../src/combat/fpArm.js');
  const { mwCamera } = await import('../../src/player/mwCamera.js');
  const { eotbCamera } = await import('../../src/player/eyeOfTheBeholder/eotbCamera.js');
  const {
    mwViewFrame,
    mwViewDrawBody,
    mwViewThirdPerson,
    mwViewTogglePerspective,
    setEotbBodyReady,
    setEotbDrawBody,
  } = await import('../../src/player/mwView.js');
  const { setModSetting, modSetting } = await import('../../src/systems/modSettings.js');

  const origFp = getPref('mwPlayerFp');
  const origTp = getPref('mwPlayerTp');
  const origInv = getPref('mwInventoryBody');
  const origEotb = modSetting('eye-of-the-beholder', 'Enabled');
  const origPaperdoll = modSetting('eye-of-the-beholder', 'Graphics.Paperdoll');
  const savedCanThird = fpArm.canThirdPerson;
  const savedSetViewMode = fpArm.setViewMode;
  const savedDrawThird = fpArm.drawThird;
  const savedReady = fpArm.ready;
  const savedUpperReady = fpArm.upperBodyReady;

  let mwBodyBuilt = true;
  let mwDraws = 0;
  let eotbDraws = 0;

  try {
    setModSetting('eye-of-the-beholder', 'Enabled', true);
    setEotbBodyReady(() => true);
    setEotbDrawBody(() => { eotbDraws += 1; return true; });

    fpArm.ready = () => mwBodyBuilt;
    fpArm.canThirdPerson = () => mwBodyBuilt && !fpArm.standingIn() && !fpArm.tpOff();
    fpArm.upperBodyReady = () => true;
    fpArm.setViewMode = () => mwBodyBuilt && !fpArm.standingIn() && !fpArm.tpOff();
    fpArm.drawThird = () => { mwDraws += 1; return true; };

    const stepFrame = () => {
      fpArm.setStandIn(false);
      playerTp3dOn();
      const out = mwViewFrame({
        fpEye: [0, 1.7, 0],
        feet: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        dt: 1 / 60,
      });
      const drew = mwViewDrawBody({}, { proj: [], view: [], eye: out.eye, feet: [0, 0, 0], yaw: 0 });
      return { out, drew };
    };

    // Boot/load scenario: StartInThirdPerson=true (eotbCamera.thirdPerson()=true) while EOTB's first sprite PNG is still decoding
    setPref('mwPlayerFp', '2d');
    setPref('mwPlayerTp', '2d');
    setPref('mwInventoryBody', '3d');
    mwBodyBuilt = true;
    setEotbBodyReady(() => false); // Frame 1: PNG decode still in flight
    eotbCamera.toggleOffset(true);
    mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });
    stepFrame();
    assert.equal(eotbCamera.thirdPerson(), true, 'boot Frame 1 before EOTB PNG decode finishes must not wipe eotbCamera.thirdPerson()');
    setEotbBodyReady(() => true); // Frame 2: PNG decode finished
    eotbDraws = 0;
    const bootF2 = stepFrame();
    assert.equal(mwViewThirdPerson(), true, 'boot Frame 2 is in 3rd person once EOTB sprite is ready');
    assert.equal(bootF2.drew, true, 'boot Frame 2 draws EOTB 3rd-person body');
    assert.ok(eotbDraws > 0, 'boot Frame 2 invoked EOTB draw');

    // Start in 1st person with MW TP=3d, toggle to 3rd person
    setPref('mwPlayerFp', '3d');
    setPref('mwPlayerTp', '3d');
    setPref('mwInventoryBody', 'follow');
    playerTp3dOn();
    eotbCamera.toggleOffset(false);
    mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });
    stepFrame();
    assert.equal(mwViewThirdPerson(), false);

    assert.equal(mwViewTogglePerspective(), true, 'toggle into 3rd person succeeds');
    stepFrame();
    assert.equal(mwViewThirdPerson(), true, 'in 3rd person with Morrowind body');

    // Preserve Graphics.Paperdoll while toggling mwPlayerTp 2d <-> 3d (Option A)
    setModSetting('eye-of-the-beholder', 'Graphics.Paperdoll', true);

    // Check all 12 combinations of (mwPlayerFp x mwPlayerTp x mwInventoryBody) with MW data in 3rd person
    for (const fp of ['2d', '3d']) {
      for (const tp of ['2d', '3d']) {
        for (const inv of ['follow', '3d', 'paperdoll']) {
          mwDraws = 0;
          eotbDraws = 0;
          setPref('mwPlayerFp', fp);
          setPref('mwPlayerTp', tp);
          setPref('mwInventoryBody', inv);

          const f1 = stepFrame();
          const f2 = stepFrame();
          const f3 = stepFrame();

          const expectInv3d = inv === '3d' || (inv === 'follow' && tp === '3d');
          const tag = `FP=${fp}, TP=${tp}, inv=${inv}`;
          assert.equal(modSetting('eye-of-the-beholder', 'Graphics.Paperdoll'), true, `${tag}: Graphics.Paperdoll stays untouched`);
          assert.equal(inventoryBodyOn(), expectInv3d, `${tag}: inventoryBodyOn()`);
          assert.equal(mwViewThirdPerson(), true, `${tag}: 3rd person remains active across frames`);
          assert.equal(f1.out.thirdPerson, true, `${tag}: frame 1 eye is 3rd person`);
          assert.equal(f2.out.thirdPerson, true, `${tag}: frame 2 eye is 3rd person`);
          assert.equal(f3.out.thirdPerson, true, `${tag}: frame 3 eye is 3rd person`);
          assert.equal(f3.drew, true, `${tag}: 3rd-person body draws on frame 3`);

          if (tp === '3d') {
            assert.equal(eotbLane(), false, `${tag}: on Morrowind 3D lane`);
            assert.ok(mwDraws >= 3 && eotbDraws === 0, `${tag}: drew Morrowind 3D body`);
            assert.equal(fpArm.fpOff(), fp !== '3d', `${tag}: fpOff matches FP setting on MW lane`);
          } else {
            assert.equal(eotbLane(), true, `${tag}: on EOTB 2D 3rd-person lane`);
            assert.ok(eotbDraws >= 3 && mwDraws === 0, `${tag}: drew EOTB 3rd-person body`);
            assert.equal(fpArm.fpOff(), true, `${tag}: fpOff forced true while standing in EOTB 3rd person`);
          }
        }
      }
    }

    // Without Morrowind data (mwBodyBuilt = false): TP=3D falls back to EOTB 2D look cleanly
    mwBodyBuilt = false;
    for (const fp of ['2d', '3d']) {
      for (const tp of ['2d', '3d']) {
        for (const inv of ['follow', '3d', 'paperdoll']) {
          eotbDraws = 0;
          setPref('mwPlayerFp', fp);
          setPref('mwPlayerTp', tp);
          setPref('mwInventoryBody', inv);
          const f = stepFrame();
          const tag = `no-MW-data, FP=${fp}, TP=${tp}, inv=${inv}`;
          assert.equal(inventoryBodyOn(), false, `${tag}: inventoryBodyOn() is false without MW data`);
          assert.equal(eotbLane(), true, `${tag}: fallback lands on EOTB 2D lane`);
          assert.equal(mwViewThirdPerson(), true, `${tag}: EOTB 3rd person stays active`);
          assert.equal(f.drew, true, `${tag}: EOTB 3rd-person body draws`);
          assert.ok(eotbDraws > 0, `${tag}: EOTB draw callback invoked`);
        }
      }
    }
  } finally {
    setPref('mwPlayerFp', origFp);
    setPref('mwPlayerTp', origTp);
    setPref('mwInventoryBody', origInv);
    setModSetting('eye-of-the-beholder', 'Enabled', origEotb);
    setModSetting('eye-of-the-beholder', 'Graphics.Paperdoll', origPaperdoll);
    fpArm.setStandIn(false);
    fpArm.setFpOff(false);
    fpArm.setTpOff(false);
    fpArm.canThirdPerson = savedCanThird;
    fpArm.setViewMode = savedSetViewMode;
    fpArm.drawThird = savedDrawThird;
    fpArm.ready = savedReady;
    fpArm.upperBodyReady = savedUpperReady;
    setEotbBodyReady(null);
    setEotbDrawBody(null);
    eotbCamera.toggleOffset(false);
    mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });
  }
});

test('eotbBody and eotbCamera: setBillboard synchronizes active state and mount/dismount transitions cleanly', async () => {
  const { eotbBody, bodyState } = await import('../../src/player/eyeOfTheBeholder/eotbBody.js');
  const { eotbCamera } = await import('../../src/player/eyeOfTheBeholder/eotbCamera.js');
  const { setModSetting } = await import('../../src/systems/modSettings.js');

  setModSetting('eye-of-the-beholder', 'Enabled', true);
  eotbCamera.loadSettings((m, k) => true);

  // 1. Verify bodyState boolean riding resolution
  assert.equal(bodyState({ riding: false, motion: { riding: true } }).riding, false, 'explicit riding: false wins over motion.riding');
  assert.equal(bodyState({ riding: true, motion: { riding: false } }).riding, true, 'explicit riding: true wins over motion.riding');
  assert.equal(bodyState({ motion: { riding: true } }).riding, true, 'fallback to motion.riding when s.riding is undefined');

  // 2. Camera offset is toggled BEFORE billboard attach (e.g. save load or test:nord-warrior)
  eotbCamera.setBillboard(null);
  eotbCamera.toggleOffset(true);
  assert.equal(eotbCamera.thirdPerson(), true);

  const dummyRenderer = {
    createBillboardBatch: () => ({ origin: [0, 0, 0] }),
    destroyBillboardBatch: () => {},
    uploadTexture: () => {},
    drawBillboards: () => {},
  };

  let state = {
    motion: { riding: true, forward: 0, standing: true },
    riding: true,
    horseLook: 1,
    sheathed: true,
  };

  // Attach billboard while camera is already offset
  eotbBody.attach(dummyRenderer, () => state);
  assert.equal(eotbBody.state().active, true, 'setBillboard immediately synchronizes active state with offset=true');

  // Tick while mounted
  for (let i = 0; i < 5; i++) {
    eotbBody.tick(1 / 60, { ...state, feet: [0, 0, 0], yaw: 0, cameraPos: [0, 1.7, -2] });
  }
  assert.equal(eotbBody.state().table, 'IdleHorse', 'mounted state table is IdleHorse');

  // Dismount to foot (test:ride T dismount)
  state = {
    motion: { riding: false, forward: 0, standing: true },
    riding: false,
    horseLook: 1, // horse item still in pack
    sheathed: true,
  };

  for (let i = 0; i < 5; i++) {
    eotbBody.tick(1 / 60, { ...state, feet: [0, 0, 0], yaw: 0, cameraPos: [0, 1.7, -2] });
  }
  assert.equal(eotbBody.state().table, 'Idle', 'dismounted state on foot is Idle, never stuck on IdleHorse');

  // Cleanup
  eotbCamera.toggleOffset(false);
  eotbBody.attach(null, null);
});

test('uiPrefs loadPrefs migrates legacy mwPlayerBody boolean cleanly once and validates mwPlayerFp/mwPlayerTp', () => {
  const prevDesc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const backing = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k) => (backing.has(k) ? backing.get(k) : null),
      setItem: (k, v) => backing.set(k, String(v)),
      removeItem: (k) => backing.delete(k),
    },
  });
  try {
    const load = (blob) => {
      backing.set('dagger.ui.v1', JSON.stringify(blob));
      _resetForTests();
      loadPrefs();
    };

    load({ mwPlayerBody: true });
    assert.equal(getPref('mwPlayerFp'), '3d');
    assert.equal(getPref('mwPlayerTp'), '3d');

    load({ mwPlayerBody: true, mwPlayerFp: '2d' });
    assert.equal(getPref('mwPlayerFp'), '2d', 'explicit mwPlayerFp is not overwritten by legacy mwPlayerBody');
    assert.equal(getPref('mwPlayerTp'), '3d', 'missing mwPlayerTp migrates from legacy mwPlayerBody');

    load({ mwPlayerBody: false });
    assert.equal(getPref('mwPlayerFp'), '2d');
    assert.equal(getPref('mwPlayerTp'), '2d');

    load({ mwPlayerFp: 'bogus', mwPlayerTp: 123 });
    assert.equal(getPref('mwPlayerFp'), '2d');
    assert.equal(getPref('mwPlayerTp'), '2d');
  } finally {
    if (prevDesc) Object.defineProperty(globalThis, 'localStorage', prevDesc);
    else delete globalThis.localStorage;
    _resetForTests();
    loadPrefs();
  }
});

test('console commands player_view/pview and lycan/werewolf/wereboar manipulate rendering prefs and forms', async () => {
  const { executeConsoleLine } = await import('../../src/systems/consoleCommands.js');
  const { modSetting, setModSetting } = await import('../../src/systems/modSettings.js');
  const { LAYERED_OWN } = await import('../../src/player/eyeOfTheBeholder/layeredArmor.js');
  const { playerEntity } = await import('../../src/characters/playerEntity.js');
  const { cureLycanthropy, liveLycanthropy, isTransformedLycanthrope } = await import('../../src/systems/lycanthropy.js');
  const { fpArm } = await import('../../src/combat/fpArm.js');

  const origFp = getPref('mwPlayerFp');
  const origTp = getPref('mwPlayerTp');
  const origInv = getPref('mwInventoryBody');
  const origPaperdoll = modSetting('eye-of-the-beholder', 'Graphics.Paperdoll');
  const origLayered = modSetting('eye-of-the-beholder', 'Graphics.LayeredGear');
  const origInfections = playerEntity.infections;
  try {
    const rCombo = await executeConsoleLine('player_view 3d 2d');
    assert.match(rCombo, /FP=3d, TP=2d/);
    assert.equal(getPref('mwPlayerFp'), '3d');
    assert.equal(getPref('mwPlayerTp'), '2d');

    await executeConsoleLine('player_view fp 2d');
    assert.equal(getPref('mwPlayerFp'), '2d');
    await executeConsoleLine('player_view tp 3d');
    assert.equal(getPref('mwPlayerTp'), '3d');

    await executeConsoleLine('player_view inv paperdoll');
    assert.equal(getPref('mwInventoryBody'), 'paperdoll');

    await executeConsoleLine('player_view look paperdoll');
    assert.equal(modSetting('eye-of-the-beholder', 'Graphics.Paperdoll'), true);
    await executeConsoleLine('player_view look layered');
    assert.equal(modSetting('eye-of-the-beholder', 'Graphics.Paperdoll'), false);
    assert.equal(modSetting('eye-of-the-beholder', 'Graphics.LayeredGear'), LAYERED_OWN);
    await executeConsoleLine('player_view look skins');
    assert.equal(modSetting('eye-of-the-beholder', 'Graphics.LayeredGear'), 0);

    const status = await executeConsoleLine('pview status');
    assert.match(status, /Prefs: FP=2d.*TP=3d.*Inv=paperdoll.*Look2D=skins/);

    const rWolf = await executeConsoleLine('werewolf');
    assert.match(rWolf, /werewolf \(transformed=true\)/);
    assert.ok(liveLycanthropy(playerEntity));
    assert.equal(isTransformedLycanthrope(playerEntity), true);

    const rBoar = await executeConsoleLine('wereboar');
    assert.match(rBoar, /wereboar \(transformed=true\)/);
    assert.equal(isTransformedLycanthrope(playerEntity), true);

    const rUnmorph = await executeConsoleLine('lycan unmorph');
    assert.match(rUnmorph, /Reverted to mortal form/);
    assert.equal(isTransformedLycanthrope(playerEntity), false);

    const rStatus = await executeConsoleLine('lycan status');
    assert.match(rStatus, /Lycanthropy: Wereboar \| transformed=false/);

    const rCure = await executeConsoleLine('lycan cure');
    assert.match(rCure, /Lycanthropy cured/);
    assert.equal(liveLycanthropy(playerEntity), null);
  } finally {
    cureLycanthropy(playerEntity, { nowMinutes: 0 });
    playerEntity.infections = origInfections;
    setPref('mwPlayerFp', origFp);
    setPref('mwPlayerTp', origTp);
    setPref('mwInventoryBody', origInv);
    setModSetting('eye-of-the-beholder', 'Graphics.Paperdoll', origPaperdoll);
    setModSetting('eye-of-the-beholder', 'Graphics.LayeredGear', origLayered);
    fpArm.setFpOff(false);
    fpArm.setTpOff(false);
  }
});
