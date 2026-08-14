import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createEfitBinaryDataSource, createInMemoryEfitDataSource } from '../app/components/efit/data-source.ts';
import { buildGapAwareSignalSeries } from '../app/components/efit/signal-series.ts';
import { createEfitStore } from '../app/components/efit/store.ts';

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
