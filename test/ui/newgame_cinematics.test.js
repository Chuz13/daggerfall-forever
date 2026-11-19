import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VidFile, VID_BLOCK_TYPES as T } from '../../src/formats/vidFile.js';
import { playVideo } from '../../src/ui/videoPlayer.js';
import { makeVideoQueue } from '../../src/systems/quest/videoQueue.js';
import {
  NEW_GAME_CINEMATICS,
  runAfterNewGameCinematics,
  frameHeld,
} from '../../src/scenes/shared.js';

const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];

function buildMinimalVid({ includeEof = true } = {}) {
  const palette = [];
  for (let i = 0; i < 256; i++) palette.push(i, i, i);
  const blocks = [
    [T.Audio_StartFrame, ...u16(0), 166, ...u16(4), 128, 128, 128, 128],
    [T.Video_StartFrame, ...u16(1), 0x80 + 8, 9],
  ];
  if (includeEof) blocks.push([T.EndOfFile]);
  const out = [];
  for (const c of 'VID') out.push(c.charCodeAt(0));
  out.push(...u16(512), ...u16(1), ...u16(4), ...u16(2), ...u16(4), ...u16(14));
  out.push(T.Palette, ...palette);
  for (const b of blocks) out.push(...b);
  return new Uint8Array(out);
}

test('NEW_GAME_CINEMATICS matches DFU new-game wizard sequence', () => {
  assert.deepEqual(NEW_GAME_CINEMATICS, ['ANIM0000.VID', 'ANIM0011.VID', 'DAG2.VID']);
  assert.equal(Object.isFrozen(NEW_GAME_CINEMATICS), true);
  // Sanity: VidFile header constants remain intact
  assert.equal(typeof VidFile, 'function');
});

test('runAfterNewGameCinematics plays all three in order, holds frame, and invokes onDone after release', async () => {
  const events = [];
  const heldDuringPlay = [];
  const optsSeen = [];
  let doneCalled = 0;

  assert.equal(frameHeld(), false);

  await runAfterNewGameCinematics(
    { canvas: { width: 640, height: 400 } },
    new URLSearchParams(),
    () => {
      doneCalled++;
      events.push(`done:held=${frameHeld()}`);
    },
    {
      load: async (name) => ({
        bytes: name,
        playVideo: async (_canvas, _renderer, bytes, opts) => {
          events.push(`play:${bytes}`);
          heldDuringPlay.push(frameHeld());
          optsSeen.push(opts);
          return true;
        },
      }),
    },
  );

  assert.equal(doneCalled, 1);
  assert.equal(frameHeld(), false, 'frame hold is released before completion');
  assert.deepEqual(heldDuringPlay, [true, true, true], 'host frame stays held for all 3 cinematics');
  assert.deepEqual(optsSeen, [{ endOnAnyKey: true }, { endOnAnyKey: true }, { endOnAnyKey: true }]);
  assert.deepEqual(events, [
    'play:ANIM0000.VID',
    'play:ANIM0011.VID',
    'play:DAG2.VID',
    'done:held=false',
  ]);
});

test('runAfterNewGameCinematics never traps when a cinematic fails to load or play', async () => {
  const played = [];
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    let doneCalled = 0;
    await runAfterNewGameCinematics(
      { canvas: { width: 640, height: 400 } },
      new URLSearchParams(),
      () => {
        doneCalled++;
      },
      {
        load: async (name) => {
          if (name === 'ANIM0011.VID') throw new Error('missing file');
          return {
            bytes: name,
            playVideo: async () => {
              played.push(name);
              if (name === 'ANIM0000.VID') throw new Error('decode boom');
              return true;
            },
          };
        },
      },
    );
    assert.equal(doneCalled, 1, 'onDone still fires after failures');
    assert.equal(frameHeld(), false, 'frame hold is always released in finally');
    assert.deepEqual(played, ['ANIM0000.VID', 'DAG2.VID'], 'later cinematics still run after an earlier failure');
    assert.equal(warnings.length, 2);
  } finally {
    console.warn = origWarn;
  }
});

test('runAfterNewGameCinematics skips immediately for ?novideo and ?shot', async () => {
  for (const query of ['novideo=1', 'shot=1']) {
    let loads = 0;
    let doneCalled = 0;
    await runAfterNewGameCinematics(
      { canvas: { width: 640, height: 400 } },
      new URLSearchParams(query),
      () => {
        doneCalled++;
      },
      {
        load: async () => {
          loads++;
          return { playVideo: async () => true, bytes: null };
        },
      },
    );
    assert.equal(loads, 0, `${query}: skips loading cinematics`);
    assert.equal(doneCalled, 1, `${query}: calls onDone synchronously`);
    assert.equal(frameHeld(), false);
  }
});

test('makeVideoQueue with hold acquires synchronously and releases every hold even on failure', async () => {
  let held = 0;
  let holdsRequested = 0;
  let holdsReleased = 0;
  const hold = () => {
    held++;
    holdsRequested++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      held--;
      holdsReleased++;
    };
  };

  let releaseFirst;
  const queue = makeVideoQueue(
    (name) => new Promise((resolve, reject) => {
      assert.ok(held > 0, `host frame must be held while ${name} runs`);
      if (name === 'bad') {
        reject(new Error('missing'));
        return;
      }
      if (name === 'first') {
        releaseFirst = resolve;
        return;
      }
      resolve(true);
    }),
    { hold },
  );

  const p1 = queue('first');
  const p2 = queue('bad');
  const p3 = queue('third');
  assert.equal(held, 3, 'every queued video acquires a hold synchronously');
  assert.equal(queue.pending(), 3);

  await Promise.resolve();
  releaseFirst();
  await Promise.all([p1, p2, p3]);

  assert.equal(held, 0);
  assert.equal(holdsRequested, 3);
  assert.equal(holdsReleased, 3);
  assert.equal(queue.pending(), 0);
});

test('playVideo toggles body.vid-playing while playing and clears it on close and error', async () => {
  const prevDoc = globalThis.document;
  const classes = new Set();
  const appended = [];
  const byId = new Map();
  globalThis.document = {
    body: {
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
    },
    head: {
      appendChild: (node) => {
        appended.push(node);
        if (node.id) byId.set(node.id, node);
      },
    },
    getElementById: (id) => byId.get(id) ?? null,
    createElement: (tag) => ({ tagName: tag, id: '', textContent: '' }),
  };

  try {
    const renderer = {
      beginFrame: () => {},
      drawScreenQuad: () => {},
      uploadTexture: () => 'TEX',
      releaseTexture: () => true,
      screenOffset: [0, 0],
    };
    const canvas = { width: 640, height: 400 };

    // 1. Failed open does not leave vid-playing active
    assert.equal(await playVideo(canvas, renderer, new Uint8Array(0), { audioContext: () => null }), false);
    assert.equal(classes.has('vid-playing'), false);

    // 2. Normal playback sets vid-playing during frames and removes it at finish
    let sawClassDuringFrame = false;
    let clock = 0;
    const okBytes = buildMinimalVid({ includeEof: true });
    await playVideo(canvas, renderer, okBytes, {
      audioContext: () => null,
      now: () => {
        clock += 0.2;
        return clock;
      },
      raf: (fn) => {
        sawClassDuringFrame = sawClassDuringFrame || classes.has('vid-playing');
        queueMicrotask(fn);
      },
      listen: () => () => {},
    });
    assert.equal(sawClassDuringFrame, true, 'body.vid-playing is set while video renders');
    assert.equal(classes.has('vid-playing'), false, 'body.vid-playing is removed when video finishes');
    assert.equal(appended.length, 1, 'style element injected once');
    assert.match(appended[0].textContent, /body\.vid-playing > :not\(#c\):not\(#crash\)/);

    // 3. Error boundary path also clears body.vid-playing
    const brokenRenderer = {
      ...renderer,
      beginFrame: () => {
        throw new Error('GL lost');
      },
    };
    const errPlayed = await playVideo(canvas, brokenRenderer, okBytes, {
      audioContext: () => null,
      raf: (fn) => queueMicrotask(fn),
      listen: () => () => {},
    });
    assert.equal(errPlayed, false);
    assert.equal(classes.has('vid-playing'), false, 'body.vid-playing is removed on playback error');
    assert.equal(appended.length, 1, 'style element is reused without duplicate injection');
  } finally {
    if (prevDoc === undefined) delete globalThis.document;
    else globalThis.document = prevDoc;
  }
});
