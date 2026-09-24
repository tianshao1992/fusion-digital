import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { DynamicDrawUsage, Group, Plane, type InterleavedBufferAttribute, type WebGLRenderer, type Mesh } from 'three';
import { createFieldlineSource, parseFieldlineCatalog, parseFieldlineFrame, fieldlineTimeSelection,
  antennaFluxAtRadius, FIELDLINE_PREPARE_LIMITS, fieldlineViewAtFrame,
  type FieldlineFrame, type FieldlineShot, type FieldlineSummary } from '../app/components/efit/fieldlines.ts';
import { createEfitFieldLineOverlay, fieldlineWebPoints } from '../app/components/device-viewer/EfitFieldLineOverlay.ts';
import { createEfitThreeOverlay, type EfitRenderableFrame } from '../app/components/device-viewer/EfitThreeOverlay.ts';
import { fieldlineEfitFrame, fieldlineEfitSummary, withFieldlineEquilibria } from '../app/components/efit/fieldline-data-source.ts';
import type { EfitDataSource, EfitManifest } from '../app/components/efit/types.ts';
import { createEfitStore } from '../app/components/efit/store.ts';

const sha = 'a'.repeat(64);
const scalars = { currentA: 500000, rAxisM: .8, zAxisM: 0, bcentrT: .8, psiAxisWb: -1, psiBoundaryWb: 1, q95: 9 };
function fixtureFrame(): FieldlineFrame {
  return { shot: 21066, index: 0, sourceIndex: 0, timeMs: 100, state: 'valid', boundaryRz: [1, 0, 1.1, 0, 1, .1], axisRz: [.8, 0],
    efitScalars: { ...scalars }, efitContours: [{ psiN: 1, pointsRzM: [1, 0, 1.1, 0, 1, .1, 1, 0], closed: true }],
    antennaMidplaneFlux: { rStartM: 1.1, rStepM: .001, zM: 0, phiDegrees: 300,
      psiWb: Array.from({ length: 501 }, (_, i) => i / 1000 + .5), psiAxisWb: -1, psiBoundaryWb: 1,
      lcfsIntervalsRM: [[.3, 1.35]], method: 'cubic-source-grid-sampled-linear-display' },
    lines: [.25, .5, .75, .9, .97].map((psiN) => ({ psiN, points: [1, 0, 0, 1, 1, 0, 1, 2, 0], maxPsiNDrift: 1e-6,
      termination: ['poloidal-coverage-complete', 'poloidal-coverage-complete'], arcLengthM: [6, 6],
      poloidalSpanRad: [Math.PI, Math.PI], toroidalSpanRad: [Math.PI, Math.PI], sourceQ: 1, qTrace: 1,
      qRelativeDifference: 0, poloidalClosureErrorM: 0 })) };
}
function fixtureShot(): FieldlineShot {
  return { shot: 21066, sourceSha256: sha, sourceFrameCount: 1,
    frames: [{ index: 0, sourceIndex: 0, timeMs: 100, state: 'valid', lineCount: 5, maxPsiNDrift: 1e-6, efitScalars: { ...scalars } }],
    chunks: [{ file: 'shot-21066-part-000.jsonl.gz', firstIndex: 0, frameCount: 1, byteLength: 100, sha256: sha }] };
}
function fixtureCatalog() {
  const first = fixtureShot(); const second = fixtureShot(); second.shot = 21138; second.chunks[0].file = 'shot-21138-part-000.jsonl.gz';
  return { schemaVersion: 'fusion.efit.fieldlines.v2', model: 'axisymmetric-equilibrium', coordinates: 'R-phi-Z:m-rad-m', algorithmVersion: 'axisymmetric-core-full-poloid-rk45-v2', phiDegrees: 300, seedPsiN: [.25, .5, .75, .9, .97], shots: [first, second] };
}

function preparedFixture(id = 21066, count = 8) {
  const shot = fixtureShot(); shot.shot = id; shot.frames = []; shot.chunks = []; shot.sourceFrameCount = count;
  const payloads = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    const f = fixtureFrame(); f.shot = id; f.index = i; f.sourceIndex = i; f.timeMs = 100 + i;
    shot.frames.push({ ...fixtureShot().frames[0], index: i, sourceIndex: i, timeMs: f.timeMs });
    const bytes = gzipSync(JSON.stringify(f) + '\n'); const file = `shot-${id}-part-${String(i).padStart(3, '0')}.jsonl.gz`;
    shot.chunks.push({ file, firstIndex: i, frameCount: 1, byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    payloads.set(file, bytes);
  }
  return { shot, payloads };
}

test('whole-shot preparation bounds concurrency, then random seek and replay make no downloads', async () => {
  const { shot, payloads } = preparedFixture();
  let calls = 0; let active = 0; let peak = 0; const progress: number[] = [];
  const source = createFieldlineSource(async (url) => {
    calls++; active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 2)); active--;
    return new Response(new Uint8Array(payloads.get(new URL(String(url), 'http://test').pathname.split('/').at(-1)!)!));
  });
  const signal = new AbortController().signal;
  await source.prepareShot(shot, signal, (p) => { progress.push(p.completed); assert.equal(p.total, 8); });
  assert.ok(peak > 1 && peak <= FIELDLINE_PREPARE_LIMITS.concurrency);
  assert.deepEqual(progress, [0, 1, 2, 3, 4, 5, 6, 7, 8]); assert.equal(calls, 8);
  const first = await source.frame(shot, 0, signal);
  for (const i of [7, 0, 4, 2, 6, 1, 5, 3, 0, 7, 0]) {
    source.retain(shot, i); assert.equal((await source.frame(shot, i, signal)).timeMs, 100 + i);
  }
  await source.prepareShot(shot, signal);
  assert.equal(await source.frame(shot, 0, signal), first); assert.equal(calls, 8);
  source.clear(); await source.frame(shot, 0, signal); assert.equal(calls, 9);
});

test('failed preparation never admits a partial shot; corruption and size budget fail closed and retry works', async () => {
  const { shot, payloads } = preparedFixture(); let corrupt = true; let calls = 0;
  const source = createFieldlineSource(async (url) => {
    calls++; const file = new URL(String(url), 'http://test').pathname.split('/').at(-1)!;
    const bytes = Buffer.from(payloads.get(file)!);
    if (corrupt && file === shot.chunks[3].file) bytes[20] ^= 1;
    return new Response(bytes);
  });
  const signal = new AbortController().signal;
  await assert.rejects(source.prepareShot(shot, signal), /hash mismatch/);
  const before = calls; await source.frame(shot, 0, signal);
  assert.equal(calls, before + 1, 'partially prepared frames must not escape into the live cache');
  const tooBig = structuredClone(shot); tooBig.chunks[0].byteLength = FIELDLINE_PREPARE_LIMITS.compressedBytes + 1;
  const prior = calls; await assert.rejects(source.prepareShot(tooBig, signal), /download budget/); assert.equal(calls, prior);
  corrupt = false; await source.prepareShot(shot, signal);
  const ready = calls; await source.frame(shot, 7, signal); assert.equal(calls, ready); source.clear();
});

test('A to B to A and clear cancel stale preparation even when fetch ignores abort', async () => {
  const a = preparedFixture(); const b = preparedFixture(21138);
  const payloads = new Map([...a.payloads, ...b.payloads]);
  let calls = 0; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const source = createFieldlineSource(async (url) => {
    calls++; await gate;
    return new Response(new Uint8Array(payloads.get(new URL(String(url), 'http://test').pathname.split('/').at(-1)!)!));
  });
  const signal = new AbortController().signal; let staleProgress = 0;
  const first = source.prepareShot(a.shot, signal, (p) => { if (p.completed) staleProgress++; }).catch((e) => e.name);
  const second = source.prepareShot(b.shot, signal).catch((e) => e.name);
  const current = source.prepareShot(a.shot, signal);
  release(); await current;
  assert.equal(await first, 'AbortError'); assert.equal(await second, 'AbortError'); assert.equal(staleProgress, 0);
  const ready = calls; assert.equal((await source.frame(a.shot, 7, signal)).shot, 21066); assert.equal(calls, ready);
  source.clear();
  const abandoned = source.prepareShot(b.shot, signal).catch((e) => e.name); source.clear();
  assert.equal(await abandoned, 'AbortError');
});

test('decoded and retained preparation budgets fail closed and cancel sibling workers', async () => {
  const { shot, payloads } = preparedFixture();
  for (const budget of [{ decodedBytes: 64 }, { retainedBytes: 32 }]) {
    let calls = 0; let admitted = 0;
    const source = createFieldlineSource(async (url) => {
      calls++; return new Response(new Uint8Array(payloads.get(new URL(String(url), 'http://test').pathname.split('/').at(-1)!)!));
    }, budget);
    await assert.rejects(source.prepareShot(shot, new AbortController().signal, p => { admitted += p.completed; }), /memory budget/);
    assert.equal(admitted, 0); assert.ok(calls <= FIELDLINE_PREPARE_LIMITS.concurrency);
    const before = calls; await source.frame(shot, 0, new AbortController().signal); assert.equal(calls, before + 1);
    source.clear();
  }
});

test('external preparation abort releases consumers and never publishes late progress', async () => {
  const { shot, payloads } = preparedFixture(); const controller = new AbortController(); let ready = 0; let aborted = 0;
  const source = createFieldlineSource(async (url, init) => {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1000);
      init!.signal!.addEventListener('abort', () => { clearTimeout(timer); aborted++; reject(init!.signal!.reason); }, { once: true });
    });
    return new Response(new Uint8Array(payloads.get(new URL(String(url), 'http://test').pathname.split('/').at(-1)!)!));
  });
  const task = source.prepareShot(shot, controller.signal, p => { ready += p.completed; });
  controller.abort(); await assert.rejects(task, { name: 'AbortError' });
  assert.equal(aborted, FIELDLINE_PREPARE_LIMITS.concurrency); assert.equal(ready, 0); source.clear();
});

test('shared store waits for magnetic preparation; playback and flux keep the exact source frame offline', async () => {
  const a = preparedFixture(); const b = preparedFixture(21138); const catalog = fixtureCatalog(); catalog.shots = [a.shot, b.shot];
  const payloads = new Map([...a.payloads, ...b.payloads]); let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; }); let calls = 0; let basePrepares = 0;
  const original = { schema: 'test', device: 'EXL-50U', psiNLevels: [.5, 1], geometry: { limiterRzM: { rM: [], zM: [], validPoints: 0 } }, shots: [] } as unknown as EfitManifest;
  const base: EfitDataSource = { loadManifest: async () => original, loadTimeline: async () => [], loadFrame: async () => { throw new Error('unexpected base frame'); }, prepareShot: async () => { basePrepares++; } };
  const source = withFieldlineEquilibria(base, async (url) => {
    if (String(url).endsWith('index.json')) return new Response(JSON.stringify(catalog));
    calls++; await gate; return new Response(new Uint8Array(payloads.get(new URL(String(url), 'http://test').pathname.split('/').at(-1)!)!));
  });
  let scheduled: ((time: number) => void) | undefined;
  const store = createEfitStore(source, { now: () => 0, schedule: (callback) => { scheduled = callback; return 1; }, cancel: () => { scheduled = undefined; } });
  const init = store.actions.initialize(21066);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(store.getSnapshot().status, 'loading-shot'); assert.equal(store.getSnapshot().timeline.length, 0);
  assert.deepEqual(store.getSnapshot().preparationProgress, { completed: 0, total: 8 });
  store.actions.play(); assert.equal(store.getSnapshot().isPlaying, false);
  release(); await init;
  assert.equal(store.getSnapshot().status, 'ready'); assert.equal(store.getSnapshot().preparationProgress, null);
  assert.equal(basePrepares, 0); const ready = calls;
  store.actions.play(); scheduled!(50);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(store.currentFrame!.timeMs, 105); assert.equal(store.currentFrame!.fieldlineFrame!.timeMs, 105);
  assert.ok(antennaFluxAtRadius(store.currentFrame!.fieldlineFrame, 1350)); assert.equal(calls, ready);
  store.destroy();
});

test('catalog binds two source shots, exact frames, sorted time and controlled chunk paths', () => {
  assert.equal(parseFieldlineCatalog(fixtureCatalog()).shots.length, 2);
  for (const mutate of [
    (c: ReturnType<typeof fixtureCatalog>) => { c.shots[0].chunks[0].file = '../private.h5'; },
    (c: ReturnType<typeof fixtureCatalog>) => { c.shots[0].frames[0].sourceIndex = 1; },
    (c: ReturnType<typeof fixtureCatalog>) => { c.shots[0].sourceFrameCount = 2; },
    (c: ReturnType<typeof fixtureCatalog>) => { c.shots[0].chunks[0].sha256 = 'missing'; },
    (c: ReturnType<typeof fixtureCatalog>) => { c.shots[1].shot = 21066; },
    (c: ReturnType<typeof fixtureCatalog>) => { c.coordinates = 'millimetres'; },
  ]) { const candidate = fixtureCatalog(); mutate(candidate); assert.throws(() => parseFieldlineCatalog(candidate)); }
});

test('frames fail closed on shot/time mismatch, nonfinite coordinates, excess drift and budget', () => {
  const shot = fixtureShot(); assert.equal(parseFieldlineFrame(fixtureFrame(), shot, shot.frames[0]).lines.length, 5);
  for (const mutate of [
    (f: FieldlineFrame) => { f.shot = 21138; }, (f: FieldlineFrame) => { f.timeMs = 101; },
    (f: FieldlineFrame) => { f.lines[0].points[1] = NaN; },
    (f: FieldlineFrame) => { f.lines[0].maxPsiNDrift = .1; },
    (f: FieldlineFrame) => { f.lines[0].poloidalSpanRad = [1, 1]; },
    (f: FieldlineFrame) => { f.lines[0].sourceQ = 20; f.lines[0].qTrace = .05; },
    (f: FieldlineFrame) => { f.lines[0].points = new Array(100_000).fill(1); },
  ]) { const f = fixtureFrame(); mutate(f); assert.throws(() => parseFieldlineFrame(f, shot, shot.frames[0])); }
});

test('real-time lookup exposes absent 1ms samples, never interpolates or changes shot identity', () => {
  const frames = [100, 101, 110, 111].map((timeMs, index) => ({ timeMs, index } as FieldlineSummary));
  assert.deepEqual(fieldlineTimeSelection(frames, 101.5), { index: 1, gap: false, afterMs: 101, beforeMs: 110 });
  assert.equal(fieldlineTimeSelection(frames, 102).gap, true);
  assert.equal(fieldlineTimeSelection(frames, 109.999).gap, true);
  assert.equal(fieldlineTimeSelection(frames, 110).index, 2);
  assert.equal(fieldlineTimeSelection(frames, 110).gap, false);
});

test('metre coordinates match the antenna at 300 degrees and remain right handed', () => {
  const [x, y, z] = fieldlineWebPoints([1.35, 5 * Math.PI / 3, 0]);
  assert.ok(Math.abs(x - .675) < 1e-12); assert.equal(y, 0); assert.ok(Math.abs(z - 1.1691342951089922) < 1e-12);
  assert.deepEqual(fieldlineWebPoints([1, 0, .1]), [1, .1, -0]);
});

test('overlay reuses fixed buffers; hide, clipping and dispose do not duplicate the CAD', () => {
  const root = new Group(); const renderer = { domElement: { clientWidth: 800, clientHeight: 600 } } as WebGLRenderer;
  const overlay = createEfitFieldLineOverlay(root, renderer, new Plane());
  overlay.setView({ frame: fixtureFrame(), xray: true, clip: false });
  const layer = root.children[0].children[0] as Mesh;
  const original = layer.geometry.getAttribute('instanceStart');
  const f = fixtureFrame(); f.index = 1; f.sourceIndex = 1; f.timeMs = 101;
  overlay.setView({ frame: f, xray: false, clip: true });
  assert.equal(layer.geometry.getAttribute('instanceStart'), original);
  assert.equal(root.children.length, 1); assert.equal(root.children[0].children.length, 10);
  overlay.setView({ frame: f, xray: false, clip: true, copies: 8 });
  assert.equal((layer.geometry as unknown as { instanceCount: number }).instanceCount, 16);
  assert.equal(layer.geometry.getAttribute('instanceStart'), original);
  const buffer = (original as InterleavedBufferAttribute).data;
  assert.equal(buffer.usage, DynamicDrawUsage); assert.deepEqual(buffer.updateRanges, [{ start: 0, count: 96 }]);
  overlay.setView({ frame: f, xray: false, clip: true, copies: 1 });
  assert.equal((layer.geometry as unknown as { instanceCount: number }).instanceCount, 2);
  assert.deepEqual(buffer.updateRanges, [{ start: 0, count: 12 }]);
  overlay.setView({ frame: null, xray: true, clip: false }); assert.equal(root.children[0].visible, false);
  overlay.dispose(); overlay.dispose(); assert.equal(root.children.length, 0);
});

test('antenna flux updates at the reference radius and labels outside LCFS without extrapolation', () => {
  const f = fixtureFrame();
  const a = antennaFluxAtRadius(f, 1350)!;
  assert.ok(Math.abs(a.psiWb - .75) < 1e-12); assert.ok(a.insideLcfs);
  assert.ok(Math.abs(a.psiN - .875) < 1e-12);
  assert.equal(antennaFluxAtRadius(f, 1500)!.insideLcfs, false);
  assert.ok(Math.abs(antennaFluxAtRadius(f, 1350.5)!.psiWb - .7505) < 1e-12);
  for (const r of [1099, 1601, NaN]) assert.equal(antennaFluxAtRadius(f, r), null);
  f.state = 'unavailable'; f.lines = [];
  assert.ok(antennaFluxAtRadius(f, 1350), 'line rejection does not invalidate source flux');
  f.antennaMidplaneFlux!.psiWb[250] = null;
  assert.equal(antennaFluxAtRadius(f, 1350), null);
});

test('one EFIT adapter preserves exact source identity and converts total Wb to Wb/rad', () => {
  const raw = fixtureFrame(); const shot = fixtureShot();
  const frame = fieldlineEfitFrame(shot, raw);
  assert.equal(frame.fieldlineFrame, raw); assert.equal(frame.timeMs, 100);
  assert.equal(frame.psiAxisWbPerRad, -1 / (2 * Math.PI));
  assert.equal(frame.psiBoundaryWbPerRad, 1 / (2 * Math.PI));
  assert.equal(frame.contours[0].kind, 'lcfs');
  const rejected = { ...shot.frames[0], state: 'unavailable' as const, lineCount: 0 };
  assert.equal(fieldlineEfitSummary(21066, rejected).quality.state, 'good');
});

test('direct store-to-overlay binding is same-frame and clears on hide, rejected frame or shot change', () => {
  const raw = fixtureFrame(); const current = fieldlineEfitFrame(fixtureShot(), raw);
  const settings = { enabled: true, frame: null, xray: true, clip: false, copies: 8 };
  assert.equal(fieldlineViewAtFrame(settings, current).frame, raw);
  assert.equal(fieldlineViewAtFrame({ ...settings, enabled: false }, current).frame, null);
  assert.equal(fieldlineViewAtFrame(undefined, current).frame, null);
  assert.equal(fieldlineViewAtFrame(settings, null).frame, null);
  for (const patch of [{ shot: 21138 }, { index: 1 }, { timeMs: 101 }]) {
    assert.equal(fieldlineViewAtFrame(settings, { ...current, ...patch }).frame, null);
  }
  assert.equal(fieldlineViewAtFrame(settings, { ...current, fieldlineFrame: { ...raw, state: 'unavailable', lines: [] } }).frame, null);
});

test('abort of one seek cannot poison another consumer of the same chunk', async () => {
  const shot = fixtureShot(); const bytes = gzipSync(JSON.stringify(fixtureFrame()) + '\n');
  shot.chunks[0].byteLength = bytes.length; shot.chunks[0].sha256 = createHash('sha256').update(bytes).digest('hex');
  let complete!: () => void; let calls = 0;
  const source = createFieldlineSource(async () => { calls++; await new Promise<void>((r) => { complete = r; }); return new Response(bytes); });
  const first = new AbortController(); const second = new AbortController();
  const abandoned = source.frame(shot, 0, first.signal).catch((e) => e.name);
  first.abort();
  const retained = source.frame(shot, 0, second.signal);
  complete();
  assert.equal(await abandoned, 'AbortError'); assert.equal((await retained).timeMs, 100);
  assert.equal(calls, 1); source.clear();
});

test('composed catalogue keeps old shots and independent raw geometry, with one same-frame load', async () => {
  const original = { schema: 'test', device: 'EXL-50U', psiNLevels: [.5, 1],
    geometry: { geometryId: 'old-wall', limiterRzM: { rM: [], zM: [], validPoints: 0 } },
    shots: [{ shot: 18301, frames: [] }] } as unknown as EfitManifest;
  let baseLoads = 0; let baseDisposed = false;
  const base: EfitDataSource = { loadManifest: async () => original, loadTimeline: async () => [],
    loadFrame: async () => { baseLoads++; return {} as never; }, dispose: () => { baseDisposed = true; } };
  const source = withFieldlineEquilibria(base, async () => new Response(JSON.stringify(fixtureCatalog())));
  const manifest = await source.loadManifest();
  assert.deepEqual(manifest.shots.map((s) => s.shot), [18301, 21066, 21138]);
  assert.notEqual(manifest.shots[1].geometryId, 'old-wall');
  assert.equal((await source.loadTimeline(21066))[0].timeMs, 100);
  await source.loadFrame(18301, 0); assert.equal(baseLoads, 1);
  source.dispose?.(); assert.ok(baseDisposed);
});

test('hidden legacy EFIT does not rebuild geometry while field lines play; showing restores its latest frame', () => {
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ getContext: () => null }) } });
  const root = new Group(); let reads = 0;
  const frame: EfitRenderableFrame = { timeMs: 400, get surfaces() { reads++; return []; }, lcfs: [1, 0, 1.1, .1, 1, .2, .9, .1, 1, 0] };
  try {
    const overlay = createEfitThreeOverlay({ physicalWebMetresRoot: root, renderer: { domElement: { clientWidth: 800, clientHeight: 600 } } as WebGLRenderer, clippingPlane: new Plane() }, undefined, { visible: false });
    for (let i = 0; i < 60; i++) overlay.setFrame(frame);
    assert.equal(reads, 0); assert.equal(root.children[0].visible, false);
    overlay.setOptions({ visible: true }); assert.ok(reads > 0); assert.equal(root.children[0].visible, true);
    overlay.dispose();
  } finally { if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document'); }
});

test('download checks compressed size/hash and decoded frame identity; abort does not deliver a frame', async () => {
  const shot = fixtureShot(); const bytes = gzipSync(JSON.stringify(fixtureFrame()) + '\n');
  shot.chunks[0].byteLength = bytes.length; shot.chunks[0].sha256 = createHash('sha256').update(bytes).digest('hex');
  let requests = 0;
  const source = createFieldlineSource(async () => { requests++; return new Response(bytes); });
  const controller = new AbortController();
  assert.equal((await source.frame(shot, 0, controller.signal)).shot, 21066);
  await source.frame(shot, 0, controller.signal); assert.equal(requests, 1);
  controller.abort(); await assert.rejects(source.frame(shot, 0, controller.signal));
  const bad = createFieldlineSource(async () => new Response(gzipSync('{}')));
  await assert.rejects(bad.frame(shot, 0, new AbortController().signal));
});

test('rapid seek cancels obsolete downloads and keeps at most current plus next; hiding aborts all', async () => {
  const catalog = parseFieldlineCatalog(JSON.parse(readFileSync(new URL('../public/data/exl50u-fieldlines-v1/index.json', import.meta.url), 'utf8')));
  const shot = catalog.shots[0]; let active = 0; let maximum = 0;
  const source = createFieldlineSource(async (_url, init) => new Promise<Response>((_resolve, reject) => {
    active++; maximum = Math.max(active, maximum);
    init!.signal!.addEventListener('abort', () => { active--; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  }));
  const controller = new AbortController(); const requests: Promise<unknown>[] = [];
  for (let i = 0; i < shot.chunks.length; i += 3) {
    const index = shot.chunks[i].firstIndex; source.retain(shot, index);
    requests.push(source.frame(shot, index, controller.signal).catch(() => undefined));
    if (shot.chunks[i + 1]) requests.push(source.frame(shot, shot.chunks[i + 1].firstIndex, controller.signal).catch(() => undefined));
  }
  assert.ok(maximum <= 2); source.retain(); await Promise.all(requests); assert.equal(active, 0);
});

test('every published chunk is hash-bound, line-only, covers both complete source timelines and quality budgets', () => {
  const folder = new URL('../public/data/exl50u-fieldlines-v1/', import.meta.url);
  const catalog = parseFieldlineCatalog(JSON.parse(readFileSync(new URL('index.json', folder), 'utf8')));
  assert.deepEqual(catalog.shots.map((s) => [s.shot, s.sourceFrameCount]), [[21066, 777], [21138, 810]]);
  const expectedFiles = ['index.json']; let count = 0;
  for (const shot of catalog.shots) for (const chunk of shot.chunks) {
    expectedFiles.push(chunk.file); const bytes = readFileSync(new URL(chunk.file, folder));
    assert.equal(bytes.length, chunk.byteLength); assert.equal(createHash('sha256').update(bytes).digest('hex'), chunk.sha256);
    const decoded = gunzipSync(bytes).toString('utf8');
    assert.ok(!/192\.168\.|private-|profiles_2d|b_field_r|psirz|D:\\|\.h5"\s*:/.test(decoded));
    const frames = decoded.trim().split('\n').map((row) => JSON.parse(row)); assert.equal(frames.length, chunk.frameCount);
    frames.forEach((f, i) => { parseFieldlineFrame(f, shot, shot.frames[chunk.firstIndex + i]); count++; });
  }
  assert.equal(count, 1587); assert.deepEqual(readdirSync(folder).sort(), expectedFiles.sort());
});
