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

const addedPulses = [21066, 21067, 21068, 21069, 21070, 21071, 21074, 21075, 21076, 21077, 21078, 21079, 21080, 21081, 21082, 21083, 21084, 21085, 21093, 21094, 21095, 21096, 21097, 21098, 21099, 21100, 21101, 21102, 21103];

test('public manifest retains four legacy shots and adds 29 unique captured shots', () => {
  assert.equal(manifest.schemaVersion, SNAPSHOT_SCHEMA);
  assert.equal(manifest.snapshotId, 'exl50u-imas-20260908-r1');
  assert.equal(manifest.facility, 'EXL-50U');
  assert.equal(manifest.state, 'versioned-public-snapshot');
  assert.equal(manifest.live, false);
  assert.equal(manifest.source.authority, 'IMAS H5');
  assert.equal(manifest.source.projection, 'mixed MDSplus projection and offline IMAS H5 extraction');
  assert.equal(manifest.source.browserConnection, 'none');
  assert.equal(manifest.publication.interpolation, 'none');
  assert.equal(manifest.publication.missingValuePolicy, 'preserve-null');
  assert.equal(manifest.publication.qualityBasis, 'per-signal-disclosure');
  assert.equal(manifest.publication.peakClaims, 'not-published');
  assert.deepEqual(manifest.shots.map(({ pulse }) => pulse), [20831, 20833, 20835, 20836, ...addedPulses]);
  assert.equal(new Set(manifest.shots.map(({ pulse }) => pulse)).size, manifest.shots.length);
  assert.equal(manifest.shots.length, 33);
  assert.equal(manifest.shots.filter(({ campaignDate }) => campaignDate === '2026-09-07').length, 18);
  assert.equal(manifest.shots.filter(({ campaignDate }) => campaignDate === '2026-09-08').length, 11);
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
    assert.equal(shot.snapshotId, entry.snapshotId ?? manifest.snapshotId);
    assert.equal(shot.facility, 'EXL-50U');
    assert.equal(shot.pulse, entry.pulse);
    assert.equal(shot.source.transport, 'reviewed public snapshot');
    const offline = addedPulses.includes(shot.pulse);
    assert.equal(shot.signals.length, offline && shot.pulse !== 21096 ? 7 : 4);
    assert.deepEqual(shot.signals.slice(0, 4).map(({ id }) => id), expectedSignals.map(([id]) => id));

    for (const [index, signal] of shot.signals.entries()) {
      if (index < 4) {
        const [id, ids, path, unit, sourcePoints] = expectedSignals[index];
        assert.equal(signal.id, id);
        assert.equal(signal.dataItem, ids);
        assert.equal(signal.path, path);
        assert.equal(signal.unit, unit);
        assert.equal(signal.sampling.sourcePoints, sourcePoints);
      } else {
        assert.equal(signal.dataItem, 'equilibrium');
        assert.equal(signal.id, ['equilibrium-ip', 'magnetic-axis-r', 'magnetic-axis-z'][index - 4]);
        assert.equal(signal.unit, index === 4 ? 'A' : 'm');
      }
      assert.equal(signal.sampling.publishedPoints, signal.samples.length);
      assert.ok(signal.samples.length > 2 && signal.samples.length <= 800);
      assert.equal(signal.sampling.requestedMaxPoints, 800);
      assert.equal(signal.sampling.method, offline ? 'offline-index-subsample' : 'gateway-downsample');
      assert.equal(signal.sampling.samplePolicy, 'nearest');
      assert.equal(signal.sampling.noInterpolation, true);
      assert.equal(signal.sampling.connectAcrossGaps, false);
      assert.equal(signal.quality.state, 'unknown');
      assert.equal(signal.quality.basis, offline ? 'not-exported' : 'not-provided-by-source');
      assert.equal(signal.dataset.id, `${shot.pulse}/${signal.dataItem}/${signal.dataset.occurrence}/r${signal.dataset.run}`);
      assert.equal(signal.dataset.idsName, signal.dataItem);
      if (offline) {
        assert.match(signal.origin!.h5Sha256, /^[a-f0-9]{64}$/);
        assert.equal(signal.origin!.timeUnit, 's');
      } else assert.equal(signal.dataset.run, shot.pulse === 20836 ? 1 : 0);
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

test('missing equilibrium is explicit and no uncertain log entry becomes a measurement', () => {
  const missing = manifest.shots.find(({ pulse }) => pulse === 21096)!;
  assert.deepEqual(missing.missingDataItems, ['equilibrium']);
  assert.equal(readShot(missing).shot.signals.some(({ dataItem }) => dataItem === 'equilibrium'), false);
  assert.equal(manifest.shots.some(({ pulse }) => pulse === 21104), false);
  for (const entry of manifest.shots.filter(({ campaignDate }) => campaignDate)) {
    assert.doesNotMatch(JSON.stringify(readShot(entry).shot.signals.map((signal) => ({ id: signal.id, path: signal.path, label: signal.label }))), /Rmax|rmax|rmin|kappa|PID|takeover|20440_|NBI/);
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
  const mismatchedUnit = { ...right, signals: right.signals.map((signal) => ({ ...signal, unit: 'incompatible' })) };
  assert.deepEqual(commonSignalIds(left, mismatchedUnit), []);
  assert.equal(nearestSample(left.signals[0], -100), null);
  assert.equal(nearestSample(left.signals[0], 100), null);
  assert.equal(nearestSample(left.signals[0], NaN), null);
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
  // Exercise the browser's fail-closed contract against EVERY shipped shot.
  for (const { pulse, signalCount } of loadedManifest.shots) {
    assert.equal((await loadSnapshotShot(loadedManifest, pulse, fetcher)).signals.length, signalCount);
  }

  const transparentEncoding: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url === SNAPSHOT_MANIFEST_URL) return new Response(JSON.stringify(manifest));
    const entry = manifest.shots.find(({ path }) => url.endsWith(path))!;
    return new Response(readFileSync(new URL(entry.path, DATA_ROOT)), { headers: { 'Content-Encoding': 'gzip' } });
  };
  await assert.rejects(() => loadSnapshotShot(manifest, 20831, transparentEncoding), /raw gzip bytes/);
  const broken = structuredClone(manifest);
  broken.shots[0].compressedSha256 = '0'.repeat(64);
  await assert.rejects(() => loadSnapshotShot(broken, 20831, fetcher), /integrity failed/);
  const invalidPath = structuredClone(manifest);
  invalidPath.shots[0].path = '../shot-20831.jsonl.gz';
  await assert.rejects(() => loadSnapshotManifest(async () => new Response(JSON.stringify(invalidPath))), /path is invalid/);
});

test('production workspace uses real snapshots and removes every synthetic derived view', () => {
  assert.match(workspaceSource, /loadSnapshotManifest/);
  assert.match(workspaceSource, /loadSnapshotShot/);
  assert.doesNotMatch(workspaceSource, /Promise\.all\(nextManifest\.shots/);
  assert.match(workspaceSource, /cache\.size > 8/);
  assert.match(workspaceSource, /result\?\.pulse === pulse/);
  assert.match(workspaceSource, /fusionCampaignFilter/);
  assert.match(workspaceSource, /fusionSignalGroups/);
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
