import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import catalog from '../app/simulations/data/control-equilibria.json';
import examples from '../app/simulations/data/control-examples.json';
import { bindControlEquilibrium, parseControlEquilibrium, fieldContours, fieldRange, type ControlEquilibrium, type ControlEquilibriumEntry } from '../app/simulations/control/equilibrium.ts';
import { parseControlExample } from '../app/simulations/control/examples.ts';
import { parseControlResult } from '../app/simulations/control/contracts.ts';
import { loadScientificJson } from '../app/simulations/physics.ts';
import { PSI_N_COLORS } from '../app/components/efit/psi-n-palette.ts';
import { publishControlEquilibrium } from '../scripts/simulations/publish-control-equilibrium.mts';
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const entry = (catalog as ControlEquilibriumEntry[]).find(v => v.engineId === 'fge')!;
const zipped = await readFile(path.join(process.cwd(), 'public', entry.artifact.path));
const raw = gunzipSync(zipped), value = JSON.parse(raw.toString());
const exampleEntry = examples.find(e => e.id === entry.exampleId)!;
const exampleBytes = await readFile(path.join(process.cwd(), 'public', exampleEntry.artifact.path));
const example = parseControlExample(JSON.parse(gunzipSync(exampleBytes).toString()));

test('full native field retains dual hashes and same-run time/LCFS binding', () => {
  assert.equal(zipped.length, entry.artifact.bytes); assert.equal(hash(zipped), entry.artifact.sha256);
  assert.equal(raw.length, entry.artifact.rawBytes); assert.equal(hash(raw), entry.artifact.rawSha256);
  const e = bindControlEquilibrium(value, entry, example);
  assert.equal(e.flux.frames.length, 101); assert.equal(e.grid.r.length, 66); assert.equal(e.grid.z.length, 65);
  assert.equal(e.flux.frames.flat().length, 433290);
  assert.deepEqual(fieldRange(e), [-0.7635694413157668, 0.24346125149092557]);
  assert.equal(e.flux.frames[0][0], 0.008955741525797655);
  assert.equal(e.flux.frames[0][1], 0.01148808788438159);
  assert.equal(e.flux.unit, 'code-unit'); assert.equal(e.flux.normalization, 'none'); assert.equal(e.flux.cocos, null);
  assert.throws(() => parseControlResult(e));
  assert.doesNotMatch(raw.toString(), /D:\\|D:\/|127\.0\.0\.1|docker\.sock|Bearer |PRIVATE KEY/);
});

test('field rejects transpose/dimensions, fabricated qualification, and identity mismatch', () => {
  const changes: ((e: ControlEquilibrium) => void)[] = [e => e.flux.frames[0].pop(), e => { e.grid.r.reverse(); }, e => { e.flux.frames[0][0] = NaN; }, e => { Object.assign(e.flux, { normalization: 'psi-n' }); }, e => { Object.assign(e.grid, { layout: 'r-major' }); }, e => { e.time.values[1] = 0; }];
  for (const change of changes) { const e = structuredClone(value); change(e); assert.throws(() => parseControlEquilibrium(e)); }
  assert.throws(() => bindControlEquilibrium(value, entry, null));
  for (const change of [(e: typeof example) => { e.time.values[1] += .0001; }, (e: typeof example) => { e.source.runId = 'another-run'; }, (e: typeof example) => { e.boundary.frames[0].rz[0][0] += .1; }, (e: typeof example) => { e.source.files[0].sha256 = '0'.repeat(64); }]) {
    const altered = structuredClone(example); change(altered); assert.throws(() => bindControlEquilibrium(value, entry, altered));
  }
});

test('native isolines respect z-major order and do not join disconnected segments', () => {
  const e = structuredClone(value) as ControlEquilibrium;
  e.grid = { unit: 'm', layout: 'z-major-r-fast', r: [1, 2, 4], z: [-1, 1, 2] };
  e.flux.frames = [[0, 1, 3, 0, 1, 3, 0, 1, 3]];
  assert.deepEqual(fieldContours(e, 0, 2), [[[3,-1],[3,1]], [[3,1],[3,2]]]);
  assert.deepEqual(fieldContours(e, 1, 2), []);
  assert.deepEqual(fieldContours(e, 0, 4), []);
});

test('DINA has no fake field; shared palette and Canvas equal-scale are used', async () => {
  assert(!catalog.some(e => e.engineId === 'dina'));
  assert.equal(PSI_N_COLORS[0], '#ff313d'); assert.equal(PSI_N_COLORS.at(-1), '#ad45c7');
  const view = await readFile('app/simulations/control/ControlEquilibriumView.tsx', 'utf8');
  assert.match(view, /PSI_N_COLORS/); assert.match(view, /EfitCanvasChart/); assert.match(view, /dataAspectRatio=/);
  assert.match(view, /not ψN/); assert.doesNotMatch(view, /normalizedPoloidalFlux/);
  const control = await readFile('app/simulations/control/ControlExampleView.tsx', 'utf8');
  assert.match(control, /没有 LCFS 或二维 ψ 网格/);
});

test('real field fits existing loader limits and detects corrupt bytes', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(zipped, { status: 200 });
  try {
    bindControlEquilibrium(await loadScientificJson(entry.artifact, new AbortController().signal), entry, example);
    await assert.rejects(() => loadScientificJson({ ...entry.artifact, sha256: '0'.repeat(64) }, new AbortController().signal));
  } finally { globalThis.fetch = original; }
});

test('native field publisher is immutable, source-bound and part of release gate', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'control-field-publish-'));
  await mkdir(path.join(project, 'app/simulations/data'), { recursive: true });
  await mkdir(path.dirname(path.join(project, 'public', exampleEntry.artifact.path)), { recursive: true });
  await writeFile(path.join(project, 'app/simulations/data/control-examples.json'), JSON.stringify([exampleEntry]));
  await writeFile(path.join(project, 'public', exampleEntry.artifact.path), exampleBytes);
  const input = path.join(project, 'field.json'); await writeFile(input, raw);
  const labels = { zh: entry.labelZh, en: entry.labelEn };
  const first = await publishControlEquilibrium(input, project, labels);
  assert.deepEqual(await publishControlEquilibrium(input, project, labels), first);
  const altered = structuredClone(value); altered.flux.frames[0][0] += 1; await writeFile(input, JSON.stringify(altered));
  await assert.rejects(() => publishControlEquilibrium(input, project, labels), /IMMUTABLE_EQUILIBRIUM_CONFLICT/);
  const contract = JSON.parse(await readFile('deploy/formal-release-contract.json', 'utf8'));
  assert(contract.sharedContent.paths.includes(entry.artifact.path));
});
