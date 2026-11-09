import test from 'node:test';
import assert from 'node:assert/strict';
import { playerBodyOn, inventoryBodyOn, itemIconsOn } from '../../src/characters/npcBodies.js';
import { setPref, getPref } from '../../src/systems/uiPrefs.js';
import { modelIconUrl } from '../../src/ui/item/itemIconUrl.js';
import { mwCanThirdPerson, eotbLane } from '../../src/player/mwView.js';

test('mwPlayerBody toggle: player 3D body switches on and off live', () => {
  const origBody = getPref('mwPlayerBody');
  try {
    setPref('mwPlayerBody', true);
    assert.equal(getPref('mwPlayerBody'), true);

    setPref('mwPlayerBody', false);
    assert.equal(getPref('mwPlayerBody'), false);
    assert.equal(playerBodyOn(), false, 'playerBodyOn is false when mwPlayerBody pref is false');
    assert.equal(mwCanThirdPerson(), false, 'mwCanThirdPerson is false when playerBodyOn is false');

    setPref('mwPlayerBody', true);
    assert.equal(getPref('mwPlayerBody'), true);
  } finally {
    setPref('mwPlayerBody', origBody);
  }
});

test('mwInventoryBody setting: follow, 3d, and paperdoll modes work with and without Morrowind data', async () => {
  const { fpArm } = await import('../../src/combat/fpArm.js');
  const origBody = getPref('mwPlayerBody');
  const origInv = getPref('mwInventoryBody');
  const savedReady = fpArm.ready;
  try {
    // 1. Without Morrowind data (morrowindDataCount() === 0 and fpArm.ready() === false)
    fpArm.ready = () => false;
    for (const mode of ['follow', '3d', 'paperdoll']) {
      setPref('mwInventoryBody', mode);
      setPref('mwPlayerBody', true);
      assert.equal(inventoryBodyOn(), false, `without Morrowind data, mode=${mode} safely returns false`);
    }

    // 2. With Morrowind data (fpArm.ready() === true)
    fpArm.ready = () => true;

    // Mode: 'follow' (follows mwPlayerBody)
    setPref('mwInventoryBody', 'follow');
    setPref('mwPlayerBody', true);
    assert.equal(inventoryBodyOn(), true, 'follow + mwPlayerBody=true -> true');
    setPref('mwPlayerBody', false);
    assert.equal(inventoryBodyOn(), false, 'follow + mwPlayerBody=false -> false');

    // Mode: '3d' (always 3D when Morrowind data is available, even if mwPlayerBody is false)
    setPref('mwInventoryBody', '3d');
    setPref('mwPlayerBody', false);
    assert.equal(inventoryBodyOn(), true, '3d + mwPlayerBody=false -> true');
    setPref('mwPlayerBody', true);
    assert.equal(inventoryBodyOn(), true, '3d + mwPlayerBody=true -> true');

    // Mode: 'paperdoll' (always 2D paperdoll, even if mwPlayerBody is true)
    setPref('mwInventoryBody', 'paperdoll');
    setPref('mwPlayerBody', true);
    assert.equal(inventoryBodyOn(), false, 'paperdoll + mwPlayerBody=true -> false');
    setPref('mwPlayerBody', false);
    assert.equal(inventoryBodyOn(), false, 'paperdoll + mwPlayerBody=false -> false');
  } finally {
    setPref('mwPlayerBody', origBody);
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

test('mwPlayerBody=false: classic first-person weapon draws when Morrowind arm is built', async () => {
  const { createWeaponRig } = await import('../../src/combat/weapon/weaponRig.js');
  const { fpArm } = await import('../../src/combat/fpArm.js');
  const { EQUIP_SLOTS } = await import('../../src/systems/equip.js');

  const origBody = getPref('mwPlayerBody');
  const savedReady = fpArm.ready;
  const savedActive = fpArm.active;
  const savedThirdActive = fpArm.thirdActive;
  const savedCanThirdPerson = fpArm.canThirdPerson;

  try {
    setPref('mwPlayerBody', false);

    // fpArm has ready=true when built with Morrowind data
    fpArm.ready = () => true;

    // Because mwPlayerBody is false, player fpArm methods must return false:
    assert.equal(fpArm.active(), false);
    assert.equal(fpArm.thirdActive(), false);
    assert.equal(fpArm.canThirdPerson(), false);

    const MELEE = createMockCif(Array.from({ length: 7 }, () => ({ w: 120, h: 100, frames: 5 })));
    const quads = [];
    const renderer = { uploadTexture: (_k, n) => n, drawScreenQuad: (t, r, u) => quads.push({ t, r, u }) };
    const canvas = { width: 320, height: 200, clientWidth: 320, clientHeight: 200 };

    const r = createWeaponRig({
      renderer, canvas, audio: { playOneShot() {} }, palette: { get: () => ({ r: 0, g: 0, b: 0 }) },
      fetchBytes: async () => MELEE,
      entity: { items: [], equip: { slots: { [EQUIP_SLOTS.RightHand]: { templateIndex: 120 } } } }
    });

    r.toggleSheath();
    for (let i = 0; i < 20; i++) {
      r.frame(1 / 60);
      r.draw();
      await new Promise((res) => setTimeout(res, 0));
    }

    assert.ok(quads.length > 0, 'classic weapon quad was drawn despite fpArm being built and thirdActive');
  } finally {
    setPref('mwPlayerBody', origBody);
    fpArm.ready = savedReady;
    fpArm.active = savedActive;
    fpArm.thirdActive = savedThirdActive;
    fpArm.canThirdPerson = savedCanThirdPerson;
  }
});

test('all combinations of mwPlayerBody + mwInventoryBody keep 3rd-person body and inventory figure working across live toggles', async () => {
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

  const origBody = getPref('mwPlayerBody');
  const origInv = getPref('mwInventoryBody');
  const origEotb = modSetting('eye-of-the-beholder', 'Enabled');
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
    fpArm.canThirdPerson = () => mwBodyBuilt && !fpArm.standingIn();
    fpArm.upperBodyReady = () => true;
    fpArm.setViewMode = () => mwBodyBuilt && !fpArm.standingIn();
    fpArm.drawThird = () => { mwDraws += 1; return true; };

    const stepFrame = () => {
      const out = mwViewFrame({
        fpEye: [0, 1.7, 0],
        feet: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        dt: 1 / 60,
      });
      // Simulate weaponRig.frame() running at the end of the host frame after mwViewFrame()
      const beastStand = false;
      fpArm.setStandIn(beastStand);
      fpArm.setBodyOff(!playerBodyOn());
      const drew = mwViewDrawBody({}, { proj: [], view: [], eye: out.eye, feet: [0, 0, 0], yaw: 0 });
      return { out, drew };
    };

    // Boot/load scenario: StartInThirdPerson=true (eotbCamera.thirdPerson()=true) while EOTB's first sprite PNG is still decoding
    // (eotbBodyReady=false on Frame 1, true on Frame 2) and mwPlayerBody=false + mwInventoryBody='3d' (Screenshot 1):
    setPref('mwPlayerBody', false);
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

    // Start in 1st person with Morrowind body on, then toggle to 3rd person
    setPref('mwPlayerBody', true);
    setPref('mwInventoryBody', 'follow');
    fpArm.setStandIn(false);
    eotbCamera.toggleOffset(false);
    mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });
    stepFrame();
    assert.equal(mwViewThirdPerson(), false);

    assert.equal(mwViewTogglePerspective(), true, 'toggle into 3rd person succeeds');
    stepFrame();
    assert.equal(mwViewThirdPerson(), true, 'in 3rd person with Morrowind body');

    // Check all 6 combinations of (mwPlayerBody x mwInventoryBody) with Morrowind data present while in 3rd person,
    // including Screenshot 1: mwPlayerBody=false + mwInventoryBody='3d'
    const combos = [
      { body: true, inv: 'follow', expectInv3d: true, expectLane: 'mw' },
      { body: false, inv: '3d', expectInv3d: true, expectLane: 'eotb' },     // Screenshot 1 exact combo
      { body: false, inv: 'follow', expectInv3d: false, expectLane: 'eotb' },
      { body: false, inv: 'paperdoll', expectInv3d: false, expectLane: 'eotb' },
      { body: true, inv: '3d', expectInv3d: true, expectLane: 'mw' },
      { body: true, inv: 'paperdoll', expectInv3d: false, expectLane: 'mw' },
      { body: false, inv: '3d', expectInv3d: true, expectLane: 'eotb' },     // Switch back to Screenshot 1 combo again
    ];

    for (const c of combos) {
      mwDraws = 0;
      eotbDraws = 0;
      setPref('mwPlayerBody', c.body);
      setPref('mwInventoryBody', c.inv);

      // Run multiple frames (Frame 1 + Frame 2 + Frame 3) to catch any multi-frame standInEdge desync
      const f1 = stepFrame();
      const f2 = stepFrame();
      const f3 = stepFrame();

      const tag = `mwPlayerBody=${c.body}, mwInventoryBody=${c.inv}`;
      assert.equal(inventoryBodyOn(), c.expectInv3d, `${tag}: inventoryBodyOn()`);
      assert.equal(mwViewThirdPerson(), true, `${tag}: 3rd person remains active across frames`);
      assert.equal(f1.out.thirdPerson, true, `${tag}: frame 1 eye is 3rd person`);
      assert.equal(f2.out.thirdPerson, true, `${tag}: frame 2 eye is 3rd person`);
      assert.equal(f3.out.thirdPerson, true, `${tag}: frame 3 eye is 3rd person`);
      assert.equal(f3.drew, true, `${tag}: 3rd-person body draws on frame 3`);

      if (c.expectLane === 'mw') {
        assert.equal(eotbLane(), false, `${tag}: on Morrowind 3D lane`);
        assert.ok(mwDraws >= 3 && eotbDraws === 0, `${tag}: drew Morrowind 3D body`);
      } else {
        assert.equal(eotbLane(), true, `${tag}: on EOTB sprite 3rd-person lane`);
        assert.ok(eotbDraws >= 3 && mwDraws === 0, `${tag}: drew EOTB 3rd-person body`);
      }
    }

    // Without Morrowind data (mwBodyBuilt = false): 3rd person still works via EOTB and inventoryBodyOn() safely returns false
    mwBodyBuilt = false;
    for (const body of [true, false]) {
      for (const inv of ['follow', '3d', 'paperdoll']) {
        eotbDraws = 0;
        setPref('mwPlayerBody', body);
        setPref('mwInventoryBody', inv);
        const f = stepFrame();
        const tag = `no-MW-data, mwPlayerBody=${body}, mwInventoryBody=${inv}`;
        assert.equal(inventoryBodyOn(), false, `${tag}: inventoryBodyOn() is false without MW data`);
        assert.equal(mwViewThirdPerson(), true, `${tag}: EOTB 3rd person stays active`);
        assert.equal(f.drew, true, `${tag}: EOTB 3rd-person body draws`);
        assert.ok(eotbDraws > 0, `${tag}: EOTB draw callback invoked`);
      }
    }
  } finally {
    setPref('mwPlayerBody', origBody);
    setPref('mwInventoryBody', origInv);
    setModSetting('eye-of-the-beholder', 'Enabled', origEotb);
    fpArm.setStandIn(false);
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


