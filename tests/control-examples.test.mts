import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import path from 'node:path';
import catalog from '../app/simulations/data/control-examples.json';
import { parseControlExample, bindControlExample, type ControlExample, type ControlExampleEntry } from '../app/simulations/control/examples.ts';
import { parseControlResult } from '../app/simulations/control/contracts.ts';
import { loadScientificJson } from '../app/simulations/physics.ts';
import { publishControlExamples } from '../scripts/simulations/publish-control-examples.mts';
const entries = catalog as ControlExampleEntry[];
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
async function load(entry: ControlExampleEntry) { const zipped = await readFile(path.join(process.cwd(), 'public', entry.artifact.path)); return { zipped, raw: gunzipSync(zipped), value: JSON.parse(gunzipSync(zipped).toString('utf8')) }; }
for (const entry of entries) test(`${entry.engineId}: archived example has complete hash and catalog binding`, async () => {
  const { zipped, raw, value } = await load(entry);
  assert.equal(zipped.length, entry.artifact.bytes); assert.equal(raw.length, entry.artifact.rawBytes);
  assert.equal(hash(zipped), entry.artifact.sha256); assert.equal(hash(raw), entry.artifact.rawSha256);
  const r = bindControlExample(value, entry);
  assert.equal(r.source.codeCommit, null); assert.equal(r.scenario.shot, null); assert.equal(r.scenario.initialTimeSeconds, null);
  assert.equal(r.qualification.toraxInput, 'not-qualified'); assert.throws(() => parseControlResult(r));
  assert.doesNotMatch(raw.toString('utf8'), /D:\\|D:\/|127\.0\.0\.1|docker\.sock|Bearer |ssh-rsa|PRIVATE KEY/);
});
test('DINA retains post-step timing, native samples, and absent boundary', async () => {
  const { value } = await load(entries.find(e => e.engineId === 'dina')!); const r = parseControlExample(value);
  assert.equal(r.time.values.length, 16); assert.equal(r.time.values[0], .001); assert.equal(r.time.values.at(-1), .016);
  assert.equal(r.signals.find(s => s.id === 'ip')!.values[0], 490225.625);
  assert.equal(r.boundary.frames.length, 0); assert.equal(r.source.reportedStatus, 'passed');
  assert(r.limitations.some(l => l.code === 'missing-reset-sample')); assert(r.limitations.some(l => l.code === 'perturbation-configuration'));
});
test('FGE uses independent 100 ms evaluation and never relabels current as amperes', async () => {
  const { value } = await load(entries.find(e => e.engineId === 'fge')!); const r = parseControlExample(value);
  assert.equal(r.time.values.length, 101); assert.equal(r.time.values[0], 0); assert.equal(r.time.values.at(-1), .1);
  assert.equal(r.source.reportedStatus, 'max_steps_truncated'); assert.equal(r.signals.find(s => s.id === 'ip')!.unit, 'code-unit');
  assert.equal(r.boundary.frames.length, 101); assert(r.boundary.frames.every(f => f.rz.length === 32));
  assert(r.limitations.some(l => l.code === 'independent-complete-window'));
});
test('example parser rejects invalid dimensions, provenance, coordinate values and qualification', async () => {
  const { value } = await load(entries[1]);
  const mutations: ((r: ControlExample) => void)[] = [r => { r.signals[0].values.pop(); }, r => { r.time.values[1] = r.time.values[0]; }, r => { r.source.files[0].sha256 = 'unknown'; }, r => { r.boundary.frames[0].rz[0][0] = -1; }, r => { Object.assign(r.qualification, { toraxInput: 'qualified' }); }, r => { Object.assign(r.source, { privatePath: '/private' }); }];
  for (const change of mutations) {
    const altered = structuredClone(value); change(altered); assert.throws(() => parseControlExample(altered));
  }
  assert.throws(() => bindControlExample(value, entries[0]));
  assert.throws(() => bindControlExample(value, { ...entries[1], initial: { ...entries[1].initial, ip: 0 } }));
});
test('browser scientific loader verifies the real compressed example bytes', async () => {
  const entry = entries[1], { zipped } = await load(entry), original = globalThis.fetch;
  globalThis.fetch = async input => { assert.equal(input, entry.artifact.path); return new Response(zipped, { status: 200 }); };
  try {
    bindControlExample(await loadScientificJson(entry.artifact, new AbortController().signal), entry);
    await assert.rejects(() => loadScientificJson({ ...entry.artifact, sha256: '0'.repeat(64) }, new AbortController().signal));
  } finally { globalThis.fetch = original; }
});
test('historical publisher is idempotent and rejects changing a published identity', async () => {
  const project = await mkdtemp(path.join(tmpdir(), 'control-example-publication-')), input = path.join(project, 'example.json');
  const { value } = await load(entries[0]); await writeFile(input, JSON.stringify(value));
  const first = await publishControlExamples([input], project); assert.deepEqual(await publishControlExamples([input], project), first);
  value.signals[0].values[0] += 1; await writeFile(input, JSON.stringify(value));
  await assert.rejects(() => publishControlExamples([input], project), /IMMUTABLE_EXAMPLE_CONFLICT/);
});
test('both examples are in the release byte/hash contract without becoming new cloud runs', async () => {
  const contract = JSON.parse(await readFile('deploy/formal-release-contract.json', 'utf8'));
  for (const e of entries) assert(contract.sharedContent.paths.includes(e.artifact.path));
  const cloud: { id: string }[] = JSON.parse(await readFile('app/simulations/data/control-runs.json', 'utf8'));
  assert(!cloud.some(r => entries.some(e => r.id === e.id)));
});
