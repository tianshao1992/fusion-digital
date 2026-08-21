import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createEfitBinaryDataSource, createInMemoryEfitDataSource } from '../app/components/efit/data-source.ts';
import { buildGapAwareSignalSeries } from '../app/components/efit/signal-series.ts';
import {
  createEfitStore,
  EFIT_DEFAULT_PLAYBACK_RATE,
  EFIT_PLAYBACK_PREFETCH_STEPS,
  EFIT_PLAYBACK_PRESENTATION_INTERVAL_MS,
  EFIT_PLAYBACK_RATES,
} from '../app/components/efit/store.ts';

async function localEfitFetch(input, init = {}) {
  const pathname = new URL(String(input), 'http://localhost').pathname;
  const filename = pathname.replace('/device-data/exl50u-efit/', '');
  const approved = new Set([
    'index.json',
    'shot-18301.bin',
    'shot-18303.bin',
    'shot-18303-topology.bin',
    'shot-18304.bin',
    'shot-18308.bin',
  ]);
  if (!approved.has(filename)) return new Response('Not found', { status: 404 });
  const payload = await readFile(new URL(`../public/data/exl50u-efit/${filename}`, import.meta.url));
  const range = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init.headers).get('range') ?? '');
  if (!range) return new Response(payload, { status: 200 });
  const start = Number(range[1]);
  const end = Math.min(payload.length - 1, Number(range[2]));
  return new Response(payload.subarray(start, end + 1), {
    status: 206,
    headers: { 'Content-Range': `bytes ${start}-${end}/${payload.length}` },
  });
}

function frame(shot, index, timeMs) {
  return {
    shot,
    index,
    timeMs,
    quality: { flags: 1, state: 'good', messages: [] },
    currentA: 300_000 + index,
    rAxisM: 0.7,
    zAxisM: 0,
    bcentrT: 0.86,
    psiAxisWbPerRad: -0.1,
    psiBoundaryWbPerRad: 0,
    surfaceMask: 1,
    lcfsValidPoints: 3,
    offsetBytes: 64 + index * 10_304,
    contours: [],
  };
}

function shotManifest(shot, times) {
  return {
    shot,
    frameCount: times.length,
    minTimeMs: times[0],
    maxTimeMs: times.at(-1),
    gaps: [],
    frames: times.map((timeMs, index) => frame(shot, index, timeMs)),
    binary: {
      url: `/device-data/exl50u-efit/shot-${shot}.bin`,
      fileHeaderBytes: 64,
      frameHeaderBytes: 64,
      frameStrideBytes: 10_304,
      surfaceCount: 9,
      pointsPerContour: 128,
    },
  };
}

test('shared EFIT store switches shots and seeks the nearest real source frame', async () => {
  const shotA = shotManifest(101, [100, 103, 110]);
  const shotB = shotManifest(202, [200, 208]);
  const manifest = {
    schema: 'test',
    device: 'EXL-50U',
    psiNLevels: [0.1],
    geometry: { limiterRzM: { rM: [], zM: [], validPoints: 0 } },
    shots: [shotA, shotB],
  };
  const store = createEfitStore(createInMemoryEfitDataSource(manifest, [...shotA.frames, ...shotB.frames]));

  await store.actions.initialize(202);
  assert.equal(store.getSnapshot().activeShot, 202);
  assert.equal(store.getSnapshot().currentTimeMs, 200);
  await store.actions.seekTimeMs(207);
  assert.equal(store.getSnapshot().currentTimeMs, 208);
  await store.actions.selectShot(101);
  await store.actions.seekTimeMs(106);
  assert.equal(store.getSnapshot().currentTimeMs, 103, 'ties resolve to the earlier real frame');
  await store.actions.step(1);
  assert.equal(store.getSnapshot().currentTimeMs, 110);
  store.actions.togglePlayback();
  assert.equal(store.getSnapshot().isPlaying, true);
  store.actions.pause();
  assert.equal(store.getSnapshot().isPlaying, false);
  store.destroy();
});

test('EFIT playback samples wall-clock time at a fixed cadence, prefetches a bounded window and holds gaps', async () => {
  const shot = shotManifest(404, [0, 20, 40, 100, 120]);
  shot.gaps = [{ afterMs: 40, beforeMs: 100, missingFrames: 59 }];
  const manifest = {
    schema: 'test',
    device: 'EXL-50U',
    psiNLevels: [0.1],
    geometry: { limiterRzM: { rM: [], zM: [], validPoints: 0 } },
    shots: [shot],
  };
  const memorySource = createInMemoryEfitDataSource(manifest, shot.frames);
  const prefetched = [];
  const source = {
    ...memorySource,
    prefetchFrame(shotId, frameIndex) {
      prefetched.push([shotId, frameIndex]);
      memorySource.prefetchFrame?.(shotId, frameIndex);
    },
  };
  const pending = [];
  let now = 0;
  const runtime = {
    now: () => now,
    schedule(callback) {
      const handle = { callback, cancelled: false };
      pending.push(handle);
      return handle;
    },
    cancel(handle) {
      handle.cancelled = true;
    },
  };
  const store = createEfitStore(source, runtime);
  await store.actions.initialize(404);
  assert.equal(store.getSnapshot().playbackRate, EFIT_DEFAULT_PLAYBACK_RATE);
  assert.equal(EFIT_DEFAULT_PLAYBACK_RATE, 0.1, 'the observation-first default should play a one-second discharge over ten seconds');
  assert.deepEqual(EFIT_PLAYBACK_RATES, [0.05, 0.1, 0.2, 0.5, 1]);
  store.actions.setPlaybackRate(0.01);
  assert.equal(store.getSnapshot().playbackRate, 0.05, 'the slowest reviewed rate must remain selectable');
  store.actions.setPlaybackRate(2);
  assert.equal(store.getSnapshot().playbackRate, 1, 'the transport must not exceed the fastest reviewed rate');
  store.actions.setPlaybackRate(1);
  prefetched.length = 0;
  store.actions.play();
  assert.ok(prefetched.length <= EFIT_PLAYBACK_PREFETCH_STEPS);
  assert.ok(new Set(prefetched.map(([, index]) => index)).size <= EFIT_PLAYBACK_PREFETCH_STEPS);

  const runNext = async (timestamp) => {
    now = timestamp;
    const handle = pending.shift();
    assert.ok(handle && !handle.cancelled, 'playback should have exactly one live scheduled callback');
    handle.callback(timestamp);
    await new Promise((resolve) => setTimeout(resolve, 0));
  };

  await runNext(EFIT_PLAYBACK_PRESENTATION_INTERVAL_MS - 1);
  assert.equal(store.getSnapshot().currentTimeMs, 0, 'no frame is presented before the fixed display interval');
  await runNext(40);
  assert.equal(store.getSnapshot().currentTimeMs, 40);
  assert.equal(pending.length, 1, 'the next callback is scheduled only after the frame commit settles');

  // The 70 ms tick is below the next presentation interval. At 80 ms the
  // source target lies in the declared 40–100 ms gap and must still hold 40.
  await runNext(70);
  assert.equal(store.getSnapshot().currentTimeMs, 40);
  await runNext(80);
  assert.equal(store.getSnapshot().currentTimeMs, 40);
  await runNext(120);
  assert.equal(store.getSnapshot().currentTimeMs, 120);

  store.actions.pause();
  store.destroy();
});

test('EFIT playback preserves a 60 fps phase on a 90 Hz display without duplicate loading renders', async () => {
  const times = Array.from({ length: 201 }, (_, index) => index);
  const shot = shotManifest(405, times);
  const manifest = {
    schema: 'test',
    device: 'EXL-50U',
    psiNLevels: [0.1],
    geometry: { limiterRzM: { rM: [], zM: [], validPoints: 0 } },
    shots: [shot],
  };
  const pending = [];
  let now = 0;
  const runtime = {
    now: () => now,
    schedule(callback) {
      const handle = { callback, cancelled: false };
      pending.push(handle);
      return handle;
    },
    cancel(handle) {
      handle.cancelled = true;
    },
  };
  const store = createEfitStore(createInMemoryEfitDataSource(manifest, shot.frames), runtime);
  await store.actions.initialize(405);
  const presented = [];
  const statuses = [];
  let lastIndex = store.getSnapshot().currentFrameIndex;
  const unsubscribe = store.subscribe(() => {
    const next = store.getSnapshot();
    statuses.push(next.status);
    if (next.currentFrameIndex !== lastIndex) {
      lastIndex = next.currentFrameIndex;
      presented.push(next.currentFrameIndex);
    }
  });

  store.actions.play();
  statuses.length = 0;
  for (let displayFrame = 1; displayFrame <= 90; displayFrame += 1) {
    now = displayFrame * (1000 / 90);
    const handle = pending.shift();
    assert.ok(handle && !handle.cancelled, 'playback should retain one live rAF chain');
    handle.callback(now);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  assert.ok(presented.length >= 58 && presented.length <= 61,
    `a 90 Hz display should average 60 EFIT presentations, received ${presented.length}`);
  assert.ok(store.getSnapshot().currentTimeMs >= 99 && store.getSnapshot().currentTimeMs <= 100,
    '0.1x playback should advance about 100 ms of source time per wall-clock second');
  assert.ok(!statuses.includes('loading-frame'), 'playback should notify React only when the next frame is ready');
  unsubscribe();
  store.actions.pause();
  store.destroy();
});

test('EFIT index rejects cross-origin assets and inconsistent frame offsets', async () => {
  const original = JSON.parse(await readFile(new URL('../public/data/exl50u-efit/index.json', import.meta.url), 'utf8'));
  const fetchIndex = (payload) => async () => new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const crossOrigin = structuredClone(original);
  crossOrigin.shots[0].binary.url = 'https://example.invalid/shot.bin';
  const crossOriginSource = createEfitBinaryDataSource({ fetch: fetchIndex(crossOrigin) });
  await assert.rejects(crossOriginSource.loadManifest(), /controlled device-data directory/);

  const badOffset = structuredClone(original);
  badOffset.shots[0].frames[0].offsetBytes += 1;
  const badOffsetSource = createEfitBinaryDataSource({ fetch: fetchIndex(badOffset) });
  await assert.rejects(badOffsetSource.loadManifest(), /invalid byte offset/);

  const mismatchedTimes = structuredClone(original);
  mismatchedTimes.shots[0].availableTimesMs[1] += 1;
  const mismatchedTimesSource = createEfitBinaryDataSource({ fetch: fetchIndex(mismatchedTimes) });
  await assert.rejects(mismatchedTimesSource.loadManifest(), /availableTimesMs does not match frame 1/);
});

test('EFIT signal series preserves time order and leaves real frame gaps unconnected', () => {
  const timeline = shotManifest(303, [100, 101, 105]).frames;
  const series = buildGapAwareSignalSeries(timeline, (item) => item.currentA / 1000);

  assert.deepEqual(series, [
    [100, 300],
    [101, 300.001],
    [102, null],
    [105, 300.002],
  ]);
  assert.ok(series.every((point, index) => index === 0 || point[0] > series[index - 1][0]));
});

test('EFIT optional topology sidecar is frame-bound and remains backward compatible', async () => {
  const source = createEfitBinaryDataSource({ fetch: localEfitFetch });
  const manifest = await source.loadManifest();
  const topologyShot = manifest.shots.find((candidate) => candidate.shot === 18303);
  assert.ok(topologyShot?.topologyBinary);

  const loadTime = async (timeMs) => {
    const index = topologyShot.frames.findIndex((frame) => frame.timeMs === timeMs);
    assert.ok(index >= 0, `missing reviewed frame ${timeMs} ms`);
    return source.loadFrame(18303, index);
  };

  const upper = await loadTime(350);
  assert.equal(upper.topology?.kind, 'upper-single-null');
  assert.equal(upper.topology?.xPoints[0]?.role, 'primary');
  assert.ok(Math.abs(upper.topology.xPoints[0].rM - 0.56865) < 0.004);
  assert.ok(Math.abs(upper.topology.xPoints[0].zM - 0.90667) < 0.004);
  assert.equal(upper.topology.separatrixLegs.length, 2);
  assert.equal(upper.topology.strikePoints.length, 2);

  const nearDouble = await loadTime(400);
  assert.equal(nearDouble.topology?.kind, 'near-double-null');
  assert.deepEqual(nearDouble.topology?.xPoints.map((point) => point.role), ['primary', 'secondary']);
  assert.equal(nearDouble.topology?.separatrixLegs.length, 2, 'secondary X point must not fabricate another separatrix');

  const lower = await loadTime(500);
  assert.equal(lower.topology?.kind, 'lower-single-null');
  assert.ok(lower.topology.xPoints[0].zM < 0);

  const legacyShot = manifest.shots.find((candidate) => candidate.shot === 18301);
  assert.ok(legacyShot && !legacyShot.topologyBinary);
  const legacy = await source.loadFrame(18301, 0);
  assert.equal(legacy.topology, undefined);
});

test('EFIT loader rejects a base frame substituted under a valid topology Range', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/data/exl50u-efit/index.json', import.meta.url), 'utf8'));
  const shot = manifest.shots.find((candidate) => candidate.shot === 18303);
  const frameIndex = shot.frames.findIndex((candidate) => candidate.timeMs === 400);
  const targetStart = shot.frames[frameIndex].offsetBytes;
  const stride = shot.binary.frameStrideBytes;

  const substitutedFetch = async (input, init = {}) => {
    const pathname = new URL(String(input), 'http://localhost').pathname;
    const rangeHeader = new Headers(init.headers).get('range') ?? '';
    const range = /^bytes=(\d+)-(\d+)$/.exec(rangeHeader);
    if (pathname.endsWith('/shot-18303.bin') && range && Number(range[1]) === targetStart) {
      const shiftedStart = targetStart + stride;
      const shifted = await localEfitFetch(input, {
        ...init,
        headers: { Range: `bytes=${shiftedStart}-${shiftedStart + stride - 1}` },
      });
      return new Response(await shifted.arrayBuffer(), {
        status: 206,
        headers: { 'Content-Range': `bytes ${targetStart}-${targetStart + stride - 1}/${shot.binary.byteLength}` },
      });
    }
    return localEfitFetch(input, init);
  };

  const source = createEfitBinaryDataSource({ fetch: substitutedFetch });
  await assert.rejects(source.loadFrame(18303, frameIndex), /base frame .* disagrees with its index summary/);
});

test('EFIT loader validates Content-Range and honors AbortSignal for cached frames', async () => {
  const missingContentRangeFetch = async (input, init = {}) => {
    const response = await localEfitFetch(input, init);
    if (response.status !== 206) return response;
    return new Response(await response.arrayBuffer(), { status: 206 });
  };
  const malformedSource = createEfitBinaryDataSource({ fetch: missingContentRangeFetch });
  await assert.rejects(malformedSource.loadFrame(18301, 0), /Range response does not match/);

  const source = createEfitBinaryDataSource({ fetch: localEfitFetch });
  await source.loadFrame(18301, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(source.loadFrame(18301, 0, { signal: controller.signal }), { name: 'AbortError' });
});

test('EFIT loader retains a full 200 response when a static host ignores byte ranges', async () => {
  const requestCounts = new Map();
  const fullBodyFetch = async (input) => {
    const pathname = new URL(String(input), 'http://localhost').pathname;
    const filename = pathname.replace('/device-data/exl50u-efit/', '');
    requestCounts.set(filename, (requestCounts.get(filename) ?? 0) + 1);
    if (filename === 'index.json') {
      const payload = await readFile(new URL('../public/data/exl50u-efit/index.json', import.meta.url));
      return new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (!['shot-18303.bin', 'shot-18303-topology.bin'].includes(filename)) return new Response('Not found', { status: 404 });
    const payload = await readFile(new URL(`../public/data/exl50u-efit/${filename}`, import.meta.url));
    return new Response(payload, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(payload.byteLength) },
    });
  };
  const source = createEfitBinaryDataSource({ fetch: fullBodyFetch });
  await source.loadFrame(18303, 0);
  await source.loadFrame(18303, 1);
  assert.equal(requestCounts.get('shot-18303.bin'), 1, 'the complete contour binary should be downloaded once');
  assert.equal(requestCounts.get('shot-18303-topology.bin'), 1, 'the complete topology binary should be downloaded once');
});

test('EFIT explicit shot preparation makes a Range-capable origin network-independent during playback', async () => {
  const requestCounts = new Map();
  let rangeRequests = 0;
  const countingFetch = async (input, init = {}) => {
    const pathname = new URL(String(input), 'http://localhost').pathname;
    const filename = pathname.replace('/device-data/exl50u-efit/', '');
    requestCounts.set(filename, (requestCounts.get(filename) ?? 0) + 1);
    if (new Headers(init.headers).has('range')) rangeRequests += 1;
    return localEfitFetch(input, init);
  };
  const source = createEfitBinaryDataSource({ fetch: countingFetch });
  assert.equal(typeof source.prepareShot, 'function');
  await source.prepareShot(18303);
  const manifest = await source.loadManifest();
  const shot = manifest.shots.find((candidate) => candidate.shot === 18303);
  assert.ok(shot);

  await source.loadFrame(18303, 0);
  await source.loadFrame(18303, Math.floor(shot.frameCount / 2));
  await source.loadFrame(18303, shot.frameCount - 1);
  source.prefetchFrame(18303, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(requestCounts.get('shot-18303.bin'), 1, 'the reviewed contour object must be fetched once without Range');
  assert.equal(requestCounts.get('shot-18303-topology.bin'), 1, 'the reviewed topology object must be fetched once without Range');
  assert.equal(rangeRequests, 0, 'prepared playback must slice verified in-memory objects without per-frame Range traffic');
});

test('a stale whole-shot completion cannot overwrite the latest atomically prepared shot', async () => {
  let releaseOldShot;
  const oldShotGate = new Promise((resolve) => { releaseOldShot = resolve; });
  let oldShotRequests = 0;
  let rangeRequests = 0;
  const outOfOrderFetch = async (input, init = {}) => {
    const pathname = new URL(String(input), 'http://localhost').pathname;
    const range = new Headers(init.headers).get('range');
    if (range) rangeRequests += 1;
    if (!range && /shot-18303(?:-topology)?\.bin$/.test(pathname)) {
      oldShotRequests += 1;
      // Intentionally ignore AbortSignal to model an injected FetchLike whose
      // older response can arrive after a newer selection has completed.
      await oldShotGate;
    }
    return localEfitFetch(input, init);
  };
  const source = createEfitBinaryDataSource({ fetch: outOfOrderFetch });
  const oldPreparation = source.prepareShot(18303);
  while (oldShotRequests < 2) await new Promise((resolve) => setTimeout(resolve, 0));
  await source.prepareShot(18301);
  releaseOldShot();
  await oldPreparation;

  await source.loadFrame(18301, 1);
  assert.equal(rangeRequests, 0, 'the stale completion must not replace the latest shot raw cache');
});

test('EFIT whole-shot preparation is bounded and rejects corrupt objects before atomic cache admission', async () => {
  let fullBinaryRequests = 0;
  let rangeRequests = 0;
  const corruptFullFetch = async (input, init = {}) => {
    const pathname = new URL(String(input), 'http://localhost').pathname;
    const range = new Headers(init.headers).get('range');
    if (range) rangeRequests += 1;
    const response = await localEfitFetch(input, init);
    if (!range && pathname.endsWith('/shot-18303.bin')) {
      fullBinaryRequests += 1;
      const bytes = new Uint8Array(await response.arrayBuffer());
      bytes[bytes.length - 1] ^= 0xff;
      return new Response(bytes, { status: 200, headers: { 'Content-Length': String(bytes.byteLength) } });
    }
    return response;
  };
  const corruptSource = createEfitBinaryDataSource({ fetch: corruptFullFetch });
  await assert.rejects(corruptSource.prepareShot(18303), /SHA-256 mismatch/);
  assert.equal(fullBinaryRequests, 1);
  await corruptSource.loadFrame(18303, 0);
  assert.ok(rangeRequests >= 2, 'a rejected package must not leave either full object admitted to the cache');

  let truncatedRangeRequests = 0;
  const truncatedFullFetch = async (input, init = {}) => {
    const pathname = new URL(String(input), 'http://localhost').pathname;
    const range = new Headers(init.headers).get('range');
    if (range) truncatedRangeRequests += 1;
    const response = await localEfitFetch(input, init);
    if (!range && pathname.endsWith('/shot-18303.bin')) {
      const bytes = new Uint8Array(await response.arrayBuffer()).slice(0, -1);
      return new Response(bytes, { status: 200, headers: { 'Content-Length': String(bytes.byteLength) } });
    }
    return response;
  };
  const truncatedSource = createEfitBinaryDataSource({ fetch: truncatedFullFetch });
  await assert.rejects(truncatedSource.prepareShot(18303), /Content-Length mismatch|byte length mismatch/);
  await truncatedSource.loadFrame(18303, 0);
  assert.ok(truncatedRangeRequests >= 2, 'a length failure must leave the single-shot cache unchanged');

  let boundedFullRequests = 0;
  let boundedRangeRequests = 0;
  const boundedFetch = async (input, init = {}) => {
    const filename = new URL(String(input), 'http://localhost').pathname.split('/').at(-1);
    const range = new Headers(init.headers).get('range');
    if (range) boundedRangeRequests += 1;
    else if (filename?.endsWith('.bin')) boundedFullRequests += 1;
    return localEfitFetch(input, init);
  };
  const boundedSource = createEfitBinaryDataSource({ fetch: boundedFetch, maxPreparedShotBytes: 1 });
  await boundedSource.prepareShot(18303);
  assert.equal(boundedFullRequests, 0, 'an over-budget shot must retain the reviewed Range fallback');
  await boundedSource.loadFrame(18303, 0);
  assert.ok(boundedRangeRequests >= 2);
});

test('EFIT store awaits shot preparation before publishing its first frame', async () => {
  const shot = shotManifest(404, [100, 101]);
  const manifest = {
    schema: 'test',
    device: 'EXL-50U',
    psiNLevels: [0.1],
    geometry: { limiterRzM: { rM: [], zM: [], validPoints: 0 } },
    shots: [shot],
  };
  const memory = createInMemoryEfitDataSource(manifest, shot.frames);
  const events = [];
  let releasePreparation;
  const preparation = new Promise((resolve) => { releasePreparation = resolve; });
  const source = {
    ...memory,
    async prepareShot() {
      events.push('prepare-start');
      await preparation;
      events.push('prepare-end');
    },
    async loadFrame(...args) {
      events.push('load-frame');
      return memory.loadFrame(...args);
    },
  };
  const store = createEfitStore(source);
  const initializing = store.actions.initialize(404);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, ['prepare-start']);
  assert.equal(store.getSnapshot().timeline.length, 0, 'timeline controls must remain disabled during preparation');
  assert.equal(store.getSnapshot().status, 'loading-shot');
  assert.equal(store.getSnapshot().currentFrame, null);
  await store.actions.seekTimeMs(101);
  await store.actions.step(1);
  store.actions.play();
  assert.deepEqual(events, ['prepare-start'], 'timeline actions must not interrupt or bypass preparation');
  releasePreparation();
  await initializing;
  assert.deepEqual(events, ['prepare-start', 'prepare-end', 'load-frame']);
  assert.equal(store.getSnapshot().currentFrameIndex, 0);
  store.destroy();
});

test('EFIT store completes the final selection after a rapid A to B to A preparation sequence', async () => {
  const shotA = shotManifest(501, [100, 101]);
  const shotB = shotManifest(502, [200, 201]);
  const manifest = {
    schema: 'test',
    device: 'EXL-50U',
    psiNLevels: [0.1],
    geometry: { limiterRzM: { rM: [], zM: [], validPoints: 0 } },
    shots: [shotA, shotB],
  };
  const memory = createInMemoryEfitDataSource(manifest, [...shotA.frames, ...shotB.frames]);
  const prepareCalls = [];
  const source = {
    ...memory,
    async prepareShot(shot, request = {}) {
      prepareCalls.push(shot);
      if (prepareCalls.length >= 3) return;
      await new Promise((_, reject) => {
        const abort = () => reject(new DOMException('aborted', 'AbortError'));
        if (request.signal?.aborted) return abort();
        request.signal?.addEventListener('abort', abort, { once: true });
      });
    },
  };
  const store = createEfitStore(source);
  const firstA = store.actions.initialize(501);
  while (prepareCalls.length < 1) await new Promise((resolve) => setTimeout(resolve, 0));
  const selectB = store.actions.selectShot(502);
  while (prepareCalls.length < 2) await new Promise((resolve) => setTimeout(resolve, 0));
  const finalA = store.actions.selectShot(501);
  await Promise.all([firstA, selectB, finalA]);

  assert.deepEqual(prepareCalls, [501, 502, 501]);
  assert.equal(store.getSnapshot().activeShot, 501);
  assert.equal(store.getSnapshot().currentFrame?.shot, 501);
  assert.equal(store.getSnapshot().status, 'ready');
  store.destroy();
});
