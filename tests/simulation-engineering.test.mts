import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseEngineering, loadEngineering, type EngineeringBundle } from '../app/simulations/engineering.ts';
const bundles: EngineeringBundle[] = JSON.parse(readFileSync(new URL('../app/simulations/data/engineering-bundles.json', import.meta.url), 'utf8'));
const hash = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const records = JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json', import.meta.url), 'utf8'));
test('engineering projection binds a distinct derived run to its exact physics parent', () => {
  assert.equal(bundles.length, 1);
  for (const b of bundles) {
    const bytes = readFileSync(new URL(`../public${b.path}`, import.meta.url)), raw = gunzipSync(bytes), p = parseEngineering(JSON.parse(raw.toString()));
    assert.equal(bytes.length, b.bytes); assert.equal(raw.length, b.rawBytes); assert.equal(hash(bytes), b.sha256); assert.equal(hash(raw), b.rawSha256);
    assert.equal(p.runId, b.runId); assert.equal(p.parentRunId, b.parentRunId); assert.equal(p.parentRecordSha256, b.parentRecordSha256); assert.notEqual(p.runId, p.parentRunId);
    assert.ok(records.some((r: { id: string; source: { recordSha256: string } }) => r.id === p.parentRunId && r.source.recordSha256 === p.parentRecordSha256));
    assert.equal(p.allowableStressAssessed, false); assert.equal(p.deviceValidated, false); assert.equal(p.geometryUnchanged, true);
    assert.deepEqual(p.branches.map(b => b.samplingPoints), [101, 201, 401]);
    assert.doesNotMatch(raw.toString(), /D:\\\\|C:\\\\|Stacktrace|access_token|privateKey/);
  }
});
test('engineering parser rejects wrong units, nonfinite stresses, fabricated qualification and malformed grids', () => {
  const b = bundles[0], raw = gunzipSync(readFileSync(new URL(`../public${b.path}`, import.meta.url))), p = parseEngineering(JSON.parse(raw.toString()));
  for (const change of [(c: typeof p) => { c.metrics.oh_field.unit = 'Pa'; }, (c: typeof p) => { c.branches[0].parts[0].hoopPa.pop(); }, (c: typeof p) => { c.branches[0].parts[0].radialPa[0] = Infinity; }, (c: typeof p) => { c.branches[0].parts[0].r[1] = c.branches[0].parts[0].r[0]; }, (c: typeof p) => { c.deviceValidated = true as false; }]) { const c = structuredClone(p); change(c); assert.throws(() => parseEngineering(c)); }
  const missing = structuredClone(p); missing.metrics.flattop_duration = { value: null, unit: 's', status: 'missing' }; assert.equal(parseEngineering(missing).metrics.flattop_duration.value, null);
  const negative = structuredClone(p); negative.metrics.flattop_duration = { value: -5, unit: 's', status: 'finite' }; assert.equal(parseEngineering(negative).metrics.flattop_duration.value, -5);
  const extra = { ...p, privateExtra: 'sentinel' }; assert.throws(() => parseEngineering(extra));
});
test('engineering browser loader rejects altered bytes and mismatched parent identity', async () => {
  const previous = globalThis.fetch, b = bundles[0];
  try {
    globalThis.fetch = async () => new Response(readFileSync(new URL(`../public${b.path}`, import.meta.url)));
    assert.equal((await loadEngineering(b, new AbortController().signal)).runId, b.runId);
    await assert.rejects(loadEngineering({ ...b, parentRecordSha256: '0'.repeat(64) }, new AbortController().signal), /IDENTITY/);
    await assert.rejects(loadEngineering({ ...b, rawSha256: '0'.repeat(64) }, new AbortController().signal), /INTEGRITY/);
  } finally { globalThis.fetch = previous; }
});
