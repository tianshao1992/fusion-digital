import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';

import {
  commonSignalIds,
  loadSnapshotManifest,
  loadSnapshotShot,
  nearestSample,
  SNAPSHOT_MANIFEST_URL,
  SNAPSHOT_SCHEMA,
  type SnapshotManifest,
  type SnapshotShot,
} from '../app/fusion-data/snapshotFusionData';

const DATA_ROOT = new URL('../public/data/exl50u-mdsplus-snapshot-v1/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', DATA_ROOT), 'utf8')) as SnapshotManifest;
const workspaceSource = readFileSync(new URL('../app/fusion-data/FusionDataWorkspace.tsx', import.meta.url), 'utf8');
const loaderSource = readFileSync(new URL('../app/fusion-data/snapshotFusionData.ts', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../app/fusion-data/page.tsx', import.meta.url), 'utf8');
const exporterSource = readFileSync(new URL('../scripts/fusion-data/export-exl50u-public-snapshot.mjs', import.meta.url), 'utf8');
const foundationSource = readFileSync(new URL('../app/data-foundation/page.tsx', import.meta.url), 'utf8');

function sha256(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function readShot(entry: SnapshotManifest['shots'][number]) {
  const compressed = readFileSync(new URL(entry.path, DATA_ROOT));
  const content = gunzipSync(compressed);
  return { compressed, content, shot: JSON.parse(content.toString('utf8')) as SnapshotShot };
}

test('public manifest exposes four unique EXL-50U shots and an explicit non-live boundary', () => {
  assert.equal(manifest.schemaVersion, SNAPSHOT_SCHEMA);
  assert.equal(manifest.snapshotId, 'exl50u-mdsplus-20260901-r1');
  assert.equal(manifest.facility, 'EXL-50U');
  assert.equal(manifest.state, 'versioned-public-snapshot');
  assert.equal(manifest.live, false);
  assert.equal(manifest.source.authority, 'IMAS H5');
  assert.equal(manifest.source.projection, 'read-only MDSplus time-series projection');
  assert.equal(manifest.source.browserConnection, 'none');
  assert.equal(manifest.publication.interpolation, 'none');
  assert.equal(manifest.publication.missingValuePolicy, 'preserve-null');
  assert.equal(manifest.publication.qualityBasis, 'not-provided-by-source');
  assert.equal(manifest.publication.peakClaims, 'not-published');
  assert.deepEqual(manifest.shots.map(({ pulse }) => pulse), [20831, 20833, 20835, 20836]);
  assert.equal(new Set(manifest.shots.map(({ pulse }) => pulse)).size, manifest.shots.length);
  assert.ok(manifest.shots.length >= 3 && manifest.shots.length <= 5);
  assert.equal(new Date(manifest.generatedAt).toISOString(), manifest.generatedAt);
});

test('manifest is a complete allowlist for deterministic raw-gzip shot assets', () => {
  const expected = ['manifest.json', ...manifest.shots.map(({ path }) => path)].sort();
  const actual = readdirSync(DATA_ROOT, { withFileTypes: true }).filter((entry) => entry.isFile()).map(({ name }) => name).sort();
  assert.deepEqual(actual, expected);
  for (const entry of manifest.shots) {
    const { compressed, content } = readShot(entry);
    assert.deepEqual([...compressed.subarray(0, 3)], [0x1f, 0x8b, 8]);
    assert.deepEqual([...compressed.subarray(4, 8)], [0, 0, 0, 0], 'gzip mtime must be deterministic zero');
    assert.equal(compressed.byteLength, entry.compressedBytes);
    assert.equal(content.byteLength, entry.contentBytes);
    assert.equal(sha256(compressed), entry.compressedSha256);
    assert.equal(sha256(content), entry.contentSha256);
  }
});

test('every published signal is traceable, finite, independently timed and non-synthetic', () => {
  const expectedSignals = [
    ['plasma-current', 'magnetics', 'IP', 'A', 8000],
    ['pf-c12-current', 'pf_active', 'COIL.C12.CURRENT', 'A', 8000],
    ['tf-c00-current', 'tf', 'COIL.C00.CURRENT', 'A', 8000],
    ['langmuir-emb000-jsat', 'langmuir_probes', 'EMBEDDED.EMB000.J_SAT', 'A/m^2', 2000],
  ] as const;

  for (const entry of manifest.shots) {
    const { shot } = readShot(entry);
    assert.equal(shot.schemaVersion, SNAPSHOT_SCHEMA);
    assert.equal(shot.snapshotId, manifest.snapshotId);
    assert.equal(shot.facility, 'EXL-50U');
    assert.equal(shot.pulse, entry.pulse);
    assert.equal(shot.source.transport, 'reviewed public snapshot');
    assert.equal(shot.signals.length, expectedSignals.length);
    assert.deepEqual(shot.signals.map(({ id }) => id), expectedSignals.map(([id]) => id));

    for (const [index, signal] of shot.signals.entries()) {
      const [id, ids, path, unit, sourcePoints] = expectedSignals[index];
      assert.equal(signal.id, id);
      assert.equal(signal.dataItem, ids);
      assert.equal(signal.path, path);
      assert.equal(signal.unit, unit);
      assert.equal(signal.sampling.sourcePoints, sourcePoints);
      assert.equal(signal.sampling.publishedPoints, signal.samples.length);
      assert.ok(signal.samples.length > 2 && signal.samples.length <= 800);
      assert.equal(signal.sampling.requestedMaxPoints, 800);
      assert.equal(signal.sampling.method, 'gateway-downsample');
      assert.equal(signal.sampling.samplePolicy, 'nearest');
      assert.equal(signal.sampling.noInterpolation, true);
      assert.equal(signal.sampling.connectAcrossGaps, false);
      assert.equal(signal.quality.state, 'unknown');
      assert.equal(signal.quality.basis, 'not-provided-by-source');
      assert.equal(signal.dataset.id, `${shot.pulse}/${ids}/0/r${shot.pulse === 20836 ? 1 : 0}`);
      assert.equal(signal.dataset.idsName, ids);
      assert.equal(signal.dataset.hasAuthoritativeImasH5, true);
      assert.equal(signal.dataset.catalogueStatus, 'valid');
      assert.equal(signal.dataset.publishState, 'published');
      assert.equal(signal.dataset.recommended, true);
      assert.equal(signal.sampleSha256, sha256(JSON.stringify(signal.samples)));
      assert.equal(signal.samples[0][0], signal.sampling.timeRange[0]);
      assert.equal(signal.samples.at(-1)?.[0], signal.sampling.timeRange[1]);
      assert.ok(signal.samples.every(([time, value], sampleIndex) => Number.isFinite(time)
        && (value === null || Number.isFinite(value))
        && (sampleIndex === 0 || time > signal.samples[sampleIndex - 1][0])));
    }

    assert.doesNotMatch(JSON.stringify(shot), /synthetic|mock|mapping-preview/i);
  }
});

test('public files contain no private network, storage, task, user or credential metadata', () => {
  const publicText = [JSON.stringify(manifest), ...manifest.shots.map((entry) => readShot(entry).content.toString('utf8'))].join('\n');
  assert.doesNotMatch(publicText, /(?:^|[^\d])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?:[^\d]|$)/u);
  assert.doesNotMatch(publicText, /(?:h5_path|extra_path|task_id|smb:\/\/|ftp:\/\/|mdsplus:\/\/|\/mnt\/)/iu);
  assert.doesNotMatch(publicText, /(?:password|secret|token|credential|submitter_name|owner)/iu);
});

test('nearest-sample lookup respects each signal time base and comparison aligns by id', () => {
  const left = readShot(manifest.shots[0]).shot;
  const right = readShot(manifest.shots[1]).shot;
  const target = 0.1234;
  const samples = left.signals.map((signal) => nearestSample(signal, target));
  assert.ok(samples.every(Boolean));
  for (const [index, sample] of samples.entries()) {
    const signal = left.signals[index];
    const bruteForce = signal.samples.reduce((best, candidate) => Math.abs(candidate[0] - target) < Math.abs(best[0] - target) ? candidate : best);
    assert.deepEqual(sample, bruteForce);
  }
  const reversed = { ...right, signals: [...right.signals].reverse() };
  assert.deepEqual(commonSignalIds(left, reversed), left.signals.map(({ id }) => id));
  const reduced = { ...right, signals: right.signals.slice(1) };
  assert.deepEqual(commonSignalIds(left, reduced), right.signals.slice(1).map(({ id }) => id));
});

test('browser loader verifies both compressed and decoded hashes before accepting a shot', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === SNAPSHOT_MANIFEST_URL) {
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const entry = manifest.shots.find(({ path }) => url.endsWith(path));
    if (!entry) return new Response('not found', { status: 404 });
    return new Response(readFileSync(new URL(entry.path, DATA_ROOT)), { status: 200, headers: { 'Content-Type': 'application/gzip' } });
  };
  const loadedManifest = await loadSnapshotManifest(fetcher);
  const loadedShot = await loadSnapshotShot(loadedManifest, loadedManifest.shots[0].pulse, fetcher);
  assert.equal(loadedShot.pulse, 20831);
  assert.equal(loadedShot.signals.length, 4);

  const transparentEncoding: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === SNAPSHOT_MANIFEST_URL) return new Response(JSON.stringify(manifest));
    const entry = manifest.shots.find(({ path }) => url.endsWith(path))!;
    return new Response(readFileSync(new URL(entry.path, DATA_ROOT)), { headers: { 'Content-Encoding': 'gzip' } });
  };
  await assert.rejects(() => loadSnapshotShot(manifest, 20831, transparentEncoding), /raw gzip bytes/);
});

test('production workspace uses real snapshots and removes every synthetic derived view', () => {
  assert.match(workspaceSource, /loadSnapshotManifest/);
  assert.match(workspaceSource, /loadSnapshotShot/);
  assert.match(workspaceSource, /nearestSample/);
  assert.match(workspaceSource, /SNAPSHOT · NOT LIVE/);
  assert.match(workspaceSource, /connectNulls:\s*false/);
  assert.match(workspaceSource, /no synthetic fallback/);
  assert.match(pageSource, /EXL-50U SNAPSHOT/);
  assert.doesNotMatch(pageSource, />MOCK</);
  assert.doesNotMatch(workspaceSource, /mockFusionData|MockFusionDataProvider|buildEquilibriumFrame|buildRadialProfiles|buildDiagnosticQuality|buildCaeFieldFrame|ParaViewEmbed/);
  assert.match(loaderSource, /crypto\.subtle\.digest/);
  assert.match(loaderSource, /DecompressionStream\('gzip'\)/);
  assert.match(exporterSource, /FUSIONDATA_INTERNAL_API_BASE/);
  assert.match(exporterSource, /assertNoPrivateMetadata/);
  assert.match(foundationSource, /href="\/fusion-data"/);
});
