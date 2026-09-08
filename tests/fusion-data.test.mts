import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';
import { init, use as registerEChartsModules } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, DataZoomComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { DEFAULT_TIME_WINDOW_SECONDS, defaultTimeZoom, fullTimeExtent } from '../app/fusion-data/timeViewport';
import { fusionDataPreview } from '../build/fusion-data-preview';

import {
  commonSignalIds,
  loadSnapshotManifest,
  loadSnapshotShot,
  nearestSample,
  SNAPSHOT_MANIFEST_URL,
  SNAPSHOT_RELEASE_ID,
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

test('all shot groups and comparisons default to -0.2 through 1.1 seconds without cropping data', () => {
  assert.deepEqual(DEFAULT_TIME_WINDOW_SECONDS, [-0.2, 1.1]);
  assert.deepEqual(fullTimeExtent([]), [-0.2, 1.1]);
  assert.deepEqual(fullTimeExtent([[0.1, 0.5]]), [-0.2, 1.1]);
  assert.deepEqual(fullTimeExtent([[-10, 10], [-20, 20]]), [-20, 20]);
  for (const entry of manifest.shots) {
    const { shot } = readShot(entry);
    const original = JSON.stringify(shot.signals);
    for (const equilibrium of [false, true]) {
      const signals = shot.signals.filter((signal) => (signal.dataItem === 'equilibrium') === equilibrium);
      const extent = fullTimeExtent(signals.map(({ sampling }) => sampling.timeRange));
      assert.ok(extent[0] <= -0.2 && extent[1] >= 1.1);
      for (const signal of signals) {
        assert.ok(extent[0] <= signal.sampling.timeRange[0]);
        assert.ok(extent[1] >= signal.sampling.timeRange[1]);
      }
      const zoom = defaultTimeZoom(signals.map((_, index) => index));
      assert.equal(zoom.startValue, -0.2);
      assert.equal(zoom.endValue, 1.1);
      assert.deepEqual(zoom.rangeMode, ['value', 'value']);
      assert.equal(zoom.filterMode, 'none');
    }
    assert.equal(JSON.stringify(shot.signals), original);
  }
  assert.match(workspaceSource, /fullTimeExtent\(all\.map/);
  assert.match(workspaceSource, /const timeZoom = defaultTimeZoom/);
  assert.equal(workspaceSource.match(/\.\.\.timeZoom, type:/g)?.length, 2);
});

test('ECharts starts every linked time axis at the requested window and can expand to the full record', () => {
  registerEChartsModules([LineChart, GridComponent, DataZoomComponent, SVGRenderer]);
  const chart = init(null, undefined, { renderer: 'svg', ssr: true, width: 800, height: 400 });
  try {
    const extent = fullTimeExtent([[-10, 10], [-20, 20]]);
    const zoom = defaultTimeZoom([0, 1]);
    chart.setOption({
      animation: false,
      grid: [{ top: 20, height: 120 }, { top: 200, height: 120 }],
      xAxis: [0, 1].map(gridIndex => ({ type: 'value', gridIndex, min: extent[0], max: extent[1] })),
      yAxis: [0, 1].map(gridIndex => ({ type: 'value', gridIndex })),
      dataZoom: [{ ...zoom, type: 'inside' }, { ...zoom, type: 'slider' }],
      series: [0, 1].map(index => ({ type: 'line', xAxisIndex: index, yAxisIndex: index, data: [[-20, 0], [-0.2, 1], [0.5, 2], [1.1, 1], [20, 0]] })),
    });
    const readExtent = (index: number) => (chart as unknown as { getModel(): { getComponent(name: string, index: number): { axis: { scale: { getExtent(): number[] } } } } }).getModel().getComponent('xAxis', index).axis.scale.getExtent();
    for (const index of [0, 1]) assert.deepEqual(readExtent(index), [-0.2, 1.1]);
    chart.dispatchAction({ type: 'dataZoom', startValue: -20, endValue: 20 });
    for (const index of [0, 1]) assert.deepEqual(readExtent(index), [-20, 20]);
  } finally {
    chart.dispose();
  }
});

test('public manifest retains four legacy shots and adds 29 unique captured shots', () => {
  assert.equal(manifest.schemaVersion, SNAPSHOT_SCHEMA);
  assert.equal(manifest.snapshotId, SNAPSHOT_RELEASE_ID);
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
  const expected = [...new Set(['manifest.json', `manifest.${SNAPSHOT_RELEASE_ID}.json`, ...manifest.shots.map(({ path }) => path), ...manifest.shots.map(({ pulse }) => `shot-${pulse}.jsonl.gz`)])].sort();
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
    assert.equal(shot.signals.length, offline && shot.pulse !== 21096 ? 10 : 4);
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
        assert.equal(signal.id, ['equilibrium-ip', 'magnetic-axis-r', 'magnetic-axis-z', 'boundary-rmax', 'boundary-rmin', 'boundary-kappa'][index - 4]);
        assert.equal(signal.unit, index === 4 ? 'A' : index === 9 ? '1' : 'm');
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
    assert.doesNotMatch(JSON.stringify(readShot(entry).shot.signals.map((signal) => ({ id: signal.id, path: signal.path, label: signal.label }))), /target|reference|PID|takeover|20440_|NBI/);
  }
});

test('28 shape extensions retain prior signals and disclose derived quantities, not PCS feedback', () => {
  let added = 0;
  for (const entry of manifest.shots) {
    const { shot } = readShot(entry);
    const original = JSON.parse(gunzipSync(readFileSync(new URL(`shot-${entry.pulse}.jsonl.gz`, DATA_ROOT))).toString()) as SnapshotShot;
    assert.deepEqual(shot.signals.slice(0, original.signals.length), original.signals);
    const derived = shot.signals.filter(({ derivation }) => derivation);
    if (!derived.length) continue;
    added++;
    assert.equal(entry.path, `shot-${entry.pulse}.${SNAPSHOT_RELEASE_ID}.jsonl.gz`);
    assert.deepEqual(derived.map(({ id }) => id), ['boundary-rmax', 'boundary-rmin', 'boundary-kappa']);
    for (const signal of derived) {
      assert.equal(signal.processingLevel, 'boundary-derived');
      assert.equal(signal.derivation!.method, 'boundary-extents-v1');
      assert.equal(signal.derivation!.notControllerTelemetry, true);
      assert.equal(signal.derivation!.invalidOutlinePolicy, 'whole-frame-null');
      assert.equal(signal.origin!.h5Sha256, shot.signals[4].origin!.h5Sha256);
      assert.deepEqual(signal.samples.map(([t]) => t), shot.signals[4].samples.map(([t]) => t));
      assert.ok(signal.samples.every(([, v]) => v === null || v > 0));
    }
    for (let i = 0; i < derived[0].samples.length; i++) {
      const max = derived[0].samples[i][1], min = derived[1].samples[i][1];
      assert.ok(max === null || min === null || max > min);
    }
  }
  assert.equal(added, 28);
  assert.equal(manifest.shots.reduce((n, s) => n + s.signalCount, 0), 300);
  const sparse = readShot(manifest.shots.find(({ pulse }) => pulse === 21084)!).shot;
  assert.equal(sparse.signals.find(({ id }) => id === 'boundary-kappa')!.samples.length, 4);
  const late = readShot(manifest.shots.find(({ pulse }) => pulse === 21103)!).shot;
  const kappa = late.signals.find(({ id }) => id === 'boundary-kappa')!;
  assert.equal(kappa.samples.length, 34);
  assert.equal(nearestSample(kappa, .3), null);
  assert.equal(kappa.samples.some(([t]) => t >= .3 && t <= .65), false);
  assert.match(workspaceSource, /位形与平衡 · Rmax \/ Rmin \/ κ/);
  assert.match(workspaceSource, /非控制器遥测/);
  assert.match(workspaceSource, /selectSignal\(signal.id\)/);
});

test('catalog is release-pinned so cached legacy manifests cannot hide the added shots', async () => {
  assert.equal(SNAPSHOT_MANIFEST_URL, `/data/exl50u-mdsplus-snapshot-v1/manifest.${SNAPSHOT_RELEASE_ID}.json`);
  assert.deepEqual(JSON.parse(readFileSync(new URL(`manifest.${SNAPSHOT_RELEASE_ID}.json`, DATA_ROOT), 'utf8')), manifest);
  await loadSnapshotManifest(async (input, init) => {
    assert.equal(input, SNAPSHOT_MANIFEST_URL);
    assert.equal(init?.cache, 'no-store');
    return new Response(JSON.stringify(manifest));
  });
  await assert.rejects(() => loadSnapshotManifest(async () => new Response(JSON.stringify({ ...manifest, snapshotId: 'exl50u-mdsplus-20260901-r1' }))), /catalog version/);
});

test('local preview serves original gzip bytes through an exact GET/HEAD allowlist', async () => {
  type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
  let middleware!: Middleware;
  const plugin = fusionDataPreview();
  assert.equal(plugin.apply, 'serve');
  const configure = plugin.configureServer as (server: unknown) => void;
  configure({ config: { root: fileURLToPath(new URL('../', import.meta.url)) }, middlewares: { use: (handler: Middleware) => { middleware = handler; } } });
  const server = createServer((req, res) => middleware(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}/data/exl50u-mdsplus-snapshot-v1/`;
    for (const pulse of [20831, 21066]) {
      const entry = manifest.shots.find((entry) => entry.pulse === pulse)!;
      const response = await fetch(origin + entry.path);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'application/gzip');
      assert.equal(response.headers.get('content-encoding'), null);
      assert.equal(sha256(Buffer.from(await response.arrayBuffer())), entry.compressedSha256);
      const head = await fetch(origin + entry.path, { method: 'HEAD' });
      assert.equal(head.status, 200);
      assert.equal(Number(head.headers.get('content-length')), entry.compressedBytes);
      assert.equal((await head.arrayBuffer()).byteLength, 0);
      assert.equal((await fetch(origin + entry.path, { method: 'POST' })).status, 404);
    }
    assert.equal((await fetch(origin + 'shot-99999.jsonl.gz')).status, 404);
    assert.equal((await fetch(origin + '..%2F..%2F.env')).status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('loader rejects altered shape semantics even when the payload hashes are valid', async () => {
  const entry = manifest.shots.find(({ pulse }) => pulse === 21066)!;
  for (const alteration of ['formula', 'unit', 'level', 'source', 'telemetry']) {
    const { shot } = readShot(entry);
    const signal = shot.signals.find(({ id }) => id === 'boundary-kappa')!;
    if (alteration === 'formula') signal.derivation!.formula = '1.9';
    if (alteration === 'unit') signal.unit = 'm';
    if (alteration === 'level') signal.processingLevel = 'unclassified';
    if (alteration === 'source') signal.origin!.field = 'controller.target';
    if (alteration === 'telemetry') Object.assign(signal.derivation!, { notControllerTelemetry: false });
    const content = Buffer.from(JSON.stringify(shot));
    const compressed = gzipSync(content);
    const forged = structuredClone(manifest);
    Object.assign(forged.shots.find(({ pulse }) => pulse === entry.pulse)!, {
      compressedBytes: compressed.length, compressedSha256: sha256(compressed),
      contentBytes: content.length, contentSha256: sha256(content),
    });
    await assert.rejects(() => loadSnapshotShot(forged, entry.pulse, async () => new Response(compressed)), /boundary-derived/i);
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
