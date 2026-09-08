import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const [input, snapshotId, generatedAt] = process.argv.slice(2);
assert.ok(input && /^exl50u-imas-\d{8}-r\d+$/.test(snapshotId), 'Provide staging JSON, snapshot ID and canonical UTC timestamp');
assert.equal(new Date(generatedAt).toISOString(), generatedAt);
const root = new URL('../../public/data/exl50u-mdsplus-snapshot-v1/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const previousId = manifest.snapshotId;
const sourceProjection = 'offline IMAS H5 time-series extraction';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const incoming = JSON.parse(readFileSync(input, 'utf8'));
assert.ok(Array.isArray(incoming) && incoming.length > 0 && incoming.length <= 100);
assert.equal(new Set(incoming.map(({ pulse }) => pulse)).size, incoming.length);

// Verify existing bytes BEFORE merging. Never rewrite an existing shot payload.
for (const entry of manifest.shots) {
  const compressed = readFileSync(new URL(entry.path, root));
  assert.equal(hash(compressed), entry.compressedSha256);
  const content = gunzipSync(compressed);
  assert.equal(hash(content), entry.contentSha256);
  entry.snapshotId ??= JSON.parse(content).snapshotId ?? previousId;
}
const staged = [];
for (const record of incoming) {
  assert.ok(Number.isSafeInteger(record.pulse) && record.pulse > 0);
  assert.ok(record.signals.length >= 4 && record.signals.length <= 10);
  for (const signal of record.signals) {
    assert.equal(signal.projection, 'imas-h5-offline');
    assert.equal(signal.dataset.id, `${record.pulse}/${signal.dataItem}/${signal.dataset.occurrence}/r${signal.dataset.run}`);
    assert.ok(/^[a-f0-9]{64}$/.test(signal.origin.h5Sha256));
    signal.sampleSha256 = hash(JSON.stringify(signal.samples));
  }
  const shot = { schemaVersion: manifest.schemaVersion, snapshotId, facility: 'EXL-50U', pulse: record.pulse, source: { authority: 'IMAS H5', projection: sourceProjection, transport: 'reviewed public snapshot' }, signals: record.signals };
  const content = Buffer.from(`${JSON.stringify(shot)}\n`);
  // No arbitrary source metadata is copied. These guards are defense in depth.
  assert.doesNotMatch(content.toString(), /(?:192\.168\.\d+\.\d+|h5_path|extra_path|task_id|\/mnt\/|smb:\/\/|password|secret|credential|submitter_name|owner)/i);
  const compressed = gzipSync(content, { level: 9 });
  const existing = manifest.shots.find(({ pulse }) => pulse === record.pulse);
  if (existing) {
    const previous = JSON.parse(gunzipSync(readFileSync(new URL(existing.path, root))));
    if (JSON.stringify(previous.signals) === JSON.stringify(shot.signals)) continue;
    // A reviewed extension gets a new immutable URL. Prior measurements MUST
    // remain byte-equivalent; this is not permission to correct old payloads.
    for (const signal of previous.signals) {
      assert.deepEqual(shot.signals.find(({ id }) => id === signal.id), signal, `Refusing to alter published signal ${record.pulse}/${signal.id}`);
    }
    const added = shot.signals.filter(({ id }) => !previous.signals.some((signal) => signal.id === id));
    assert.deepEqual(added.map(({ id }) => id), ['boundary-rmax', 'boundary-rmin', 'boundary-kappa']);
    assert.ok(added.every(({ processingLevel, derivation }) => processingLevel === 'boundary-derived' && derivation?.method === 'boundary-extents-v1' && derivation?.notControllerTelemetry === true));
    assert.notEqual(snapshotId, existing.snapshotId, 'Signal extensions require a new snapshot version');
  }
  const entry = { pulse: record.pulse, path: existing ? `shot-${record.pulse}.${snapshotId}.jsonl.gz` : `shot-${record.pulse}.jsonl.gz`, snapshotId, campaignDate: record.campaignDate, signalCount: shot.signals.length, compressedBytes: compressed.length, compressedSha256: hash(compressed), contentBytes: content.length, contentSha256: hash(content), datasetIds: shot.signals.map(({ dataset }) => dataset.id), missingDataItems: record.missingDataItems };
  const target = new URL(entry.path, root);
  if (existsSync(target)) assert.equal(hash(readFileSync(target)), entry.compressedSha256, 'Untracked shot collision');
  staged.push({ target, compressed });
  if (existing) manifest.shots[manifest.shots.indexOf(existing)] = entry;
  else manifest.shots.push(entry);
}
manifest.snapshotId = snapshotId;
manifest.generatedAt = generatedAt;
manifest.source.projection = 'mixed MDSplus projection and offline IMAS H5 extraction';
manifest.publication.scope = 'Allowlisted EXL-50U time series and explicitly labelled boundary-derived Rmax/Rmin/kappa; independent clocks; no controller targets, actions or inferred performance claims';
manifest.publication.qualityBasis = 'per-signal-disclosure';
manifest.shots.sort((a, b) => a.pulse - b.pulse);
const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
const versionedManifest = new URL(`manifest.${snapshotId}.json`, root);
if (existsSync(versionedManifest)) assert.equal(readFileSync(versionedManifest, 'utf8'), manifestBytes, 'Immutable manifest collision');
for (const { target, compressed } of staged) writeFileSync(target, compressed);
writeFileSync(versionedManifest, manifestBytes);
writeFileSync(new URL('manifest.json', root), manifestBytes);
console.log(JSON.stringify({ added: staged.length, total: manifest.shots.length, newCompressedBytes: staged.reduce((sum, item) => sum + item.compressed.length, 0), directory: fileURLToPath(root) }));
