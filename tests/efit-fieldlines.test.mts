import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Group, Plane, type WebGLRenderer, type Mesh } from 'three';
import { createFieldlineSource, parseFieldlineCatalog, parseFieldlineFrame, fieldlineTimeSelection,
  type FieldlineFrame, type FieldlineShot, type FieldlineSummary } from '../app/components/efit/fieldlines.ts';
import { createEfitFieldLineOverlay, fieldlineWebPoints } from '../app/components/device-viewer/EfitFieldLineOverlay.ts';
import { createEfitThreeOverlay, type EfitRenderableFrame } from '../app/components/device-viewer/EfitThreeOverlay.ts';

const sha = 'a'.repeat(64);
function fixtureFrame(): FieldlineFrame {
  return { shot: 21066, index: 0, sourceIndex: 0, timeMs: 100, state: 'valid', boundaryRz: [1, 0, 1.1, 0, 1, .1], axisRz: [.8, 0],
    lines: [.25, .5, .75, .9, .97].map((psiN) => ({ psiN, points: [1, 0, 0, 1, 1, 0, 1, 2, 0], maxPsiNDrift: 1e-6, termination: ['toroidal-turn-limit', 'toroidal-turn-limit'], arcLengthM: [6, 6] })) };
}
function fixtureShot(): FieldlineShot {
  return { shot: 21066, sourceSha256: sha, sourceFrameCount: 1,
    frames: [{ index: 0, sourceIndex: 0, timeMs: 100, state: 'valid', lineCount: 5, maxPsiNDrift: 1e-6 }],
    chunks: [{ file: 'shot-21066-part-000.jsonl.gz', firstIndex: 0, frameCount: 1, byteLength: 100, sha256: sha }] };
}
function fixtureCatalog() {
  const first = fixtureShot(); const second = fixtureShot(); second.shot = 21138; second.chunks[0].file = 'shot-21138-part-000.jsonl.gz';
  return { schemaVersion: 'fusion.efit.fieldlines.v1', model: 'axisymmetric-equilibrium', coordinates: 'R-phi-Z:m-rad-m', algorithmVersion: 'test-v1', phiDegrees: 300, seedPsiN: [.25, .5, .75, .9, .97], shots: [first, second] };
}

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
  overlay.setView({ frame: null, xray: true, clip: false }); assert.equal(root.children[0].visible, false);
  overlay.dispose(); overlay.dispose(); assert.equal(root.children.length, 0);
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
