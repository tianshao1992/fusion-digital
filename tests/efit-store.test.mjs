import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createEfitBinaryDataSource, createInMemoryEfitDataSource } from '../app/components/efit/data-source.ts';
import { buildGapAwareSignalSeries } from '../app/components/efit/signal-series.ts';
import { createEfitStore } from '../app/components/efit/store.ts';

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
