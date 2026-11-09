import test from 'node:test';
import assert from 'node:assert/strict';
import { getPref, setPref } from '../../src/systems/uiPrefs.js';
import { setModSetting } from '../../src/systems/modSettings.js';
import { eotbCamera } from '../../src/player/eyeOfTheBeholder/eotbCamera.js';
import { eotbBody } from '../../src/player/eyeOfTheBeholder/eotbBody.js';
import { mwCamera } from '../../src/player/mwCamera.js';
import {
  mwViewThirdPerson,
  mwViewTogglePerspective,
  mwViewCanTogglePerspective,
  mwViewWheel,
  mwViewFirstPerson,
  mwViewHoldThird,
  mwViewHoldFirst,
  mwViewSaveCamera,
  mwViewLoadPose,
  setEotbBodyReady,
} from '../../src/player/mwView.js';

test('Save and load camera with mwPlayerBody=false preserves 3rd person', () => {
  const origBody = getPref('mwPlayerBody');
  const origInv = getPref('mwInventoryBody');
  try {
    setModSetting('eye-of-the-beholder', 'Enabled', true);
    setPref('mwPlayerBody', false);
    setPref('mwInventoryBody', '3d');
    setEotbBodyReady(() => true);

    // Put into third person
    eotbCamera.toggleOffset(true);
    mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });

    assert.equal(eotbCamera.thirdPerson(), true);
    assert.equal(mwViewThirdPerson(), true);

    // Save camera
    const saved = mwViewSaveCamera();
    assert.equal(saved.firstPerson, false, 'Saved camera must preserve 3rd-person state when on EOTB lane');

    // Simulate loading the save
    mwViewLoadPose(saved, false);
    assert.equal(eotbCamera.thirdPerson(), true, 'eotbCamera must be in 3rd person after load');
    assert.equal(mwViewThirdPerson(), true, 'mwViewThirdPerson must be true after load');
  } finally {
    setPref('mwPlayerBody', origBody);
    setPref('mwInventoryBody', origInv);
    setEotbBodyReady(null);
    eotbCamera.toggleOffset(false);
  }
});

test('Save and load camera with mwPlayerBody=false preserves 1st person', () => {
  const origBody = getPref('mwPlayerBody');
  try {
    setModSetting('eye-of-the-beholder', 'Enabled', true);
    setPref('mwPlayerBody', false);
    setEotbBodyReady(() => true);

    // Put into 1st person
    eotbCamera.toggleOffset(false);
    mwCamera.restore({ firstPerson: true, baseDistance: mwCamera.baseDistance() });

    assert.equal(eotbCamera.thirdPerson(), false);
    assert.equal(mwViewThirdPerson(), false);

    // Save camera
    const saved = mwViewSaveCamera();
    assert.equal(saved.firstPerson, true, 'Saved camera must preserve 1st-person state');

    // Load
    mwViewLoadPose(saved, false);
    assert.equal(eotbCamera.thirdPerson(), false, 'eotbCamera must be in 1st person after load');
    assert.equal(mwViewThirdPerson(), false, 'mwViewThirdPerson must be false after load');
  } finally {
    setPref('mwPlayerBody', origBody);
    setEotbBodyReady(null);
    eotbCamera.toggleOffset(false);
  }
});

test('mwViewTogglePerspective and wheel work seamlessly when mwPlayerBody=false', () => {
  const origBody = getPref('mwPlayerBody');
  try {
    setModSetting('eye-of-the-beholder', 'Enabled', true);
    setPref('mwPlayerBody', false);
    setEotbBodyReady(() => true);

    eotbCamera.toggleOffset(false);
    assert.equal(mwViewCanTogglePerspective(), true, 'Can toggle perspective even when mwPlayerBody=false');

    // Toggle to 3rd person
    const toggled = mwViewTogglePerspective();
    assert.equal(toggled, true);
    assert.equal(eotbCamera.thirdPerson(), true);
    assert.equal(mwViewThirdPerson(), true);

    // Toggle back to 1st person
    mwViewTogglePerspective();
    assert.equal(eotbCamera.thirdPerson(), false);
    assert.equal(mwViewThirdPerson(), false);

    // Wheel zoom out to 3rd person
    mwViewWheel(100); // deltaY > 0 -> clicks = -1 (zoom out)
    eotbCamera.tick();
    assert.equal(eotbCamera.thirdPerson(), true);
    assert.equal(mwViewThirdPerson(), true);

    // mwViewFirstPerson transitions to 1st person
    const fpMoved = mwViewFirstPerson();
    assert.equal(fpMoved, true);
    assert.equal(eotbCamera.thirdPerson(), false);
  } finally {
    setPref('mwPlayerBody', origBody);
    setEotbBodyReady(null);
    eotbCamera.toggleOffset(false);
  }
});

test('mwViewHoldThird and mwViewHoldFirst work when mwPlayerBody=false', () => {
  const origBody = getPref('mwPlayerBody');
  try {
    setModSetting('eye-of-the-beholder', 'Enabled', true);
    setPref('mwPlayerBody', false);
    setEotbBodyReady(() => true);

    // Start in 1st person
    eotbCamera.toggleOffset(false);

    // Travel view holds 3rd person
    mwViewHoldThird(true);
    assert.equal(mwViewThirdPerson(), true);
    // Release travel view -> back to 1st person
    mwViewHoldThird(false);
    assert.equal(mwViewThirdPerson(), false);

    // Start in 3rd person
    eotbCamera.toggleOffset(true);
    assert.equal(mwViewThirdPerson(), true);

    // Spyglass holds 1st person
    mwViewHoldFirst(true);
    assert.equal(mwViewThirdPerson(), false);
    // Release spyglass -> back to 3rd person
    mwViewHoldFirst(false);
    assert.equal(mwViewThirdPerson(), true);
  } finally {
    setPref('mwPlayerBody', origBody);
    setEotbBodyReady(null);
    eotbCamera.toggleOffset(false);
  }
});
