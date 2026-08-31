import { createHash } from 'node:crypto';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { resolve } from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';

const SNAPSHOT_SCHEMA = 'fusiondigital.exl50u.public-snapshot.v1';
const DEFAULT_OUTPUT = 'public/data/exl50u-mdsplus-snapshot-v1';
const MIN_SHOTS = 3;
const MAX_SHOTS = 5;
const MAX_PUBLISHED_POINTS = 800;
const MAX_RESPONSE_BYTES = 128 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;
const REQUEST_RETRIES = 5;

const SIGNAL_ALLOWLIST = [
  {
    id: 'plasma-current',
    dataItem: 'magnetics',
    path: 'IP',
    label: '等离子体电流 IP',
    labelEn: 'Plasma current IP',
    color: '#e18766',
  },
  {
    id: 'pf-c12-current',
    dataItem: 'pf_active',
    path: 'COIL.C12.CURRENT',
    label: 'PF 线圈 C12 电流',
    labelEn: 'PF coil C12 current',
    color: '#7bc6b2',
  },
  {
    id: 'tf-c00-current',
    dataItem: 'tf',
    path: 'COIL.C00.CURRENT',
    label: 'TF 线圈电流',
    labelEn: 'TF coil current',
    color: '#8ca9dc',
  },
  {
    id: 'langmuir-emb000-jsat',
    dataItem: 'langmuir_probes',
    path: 'EMBEDDED.EMB000.J_SAT',
    label: '朗缪尔探针 EMB000 离子饱和电流密度',
    labelEn: 'Langmuir probe EMB000 ion saturation current density',
    color: '#c39adf',
  },
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const equals = token.indexOf('=');
    const key = equals >= 0 ? token.slice(0, equals) : token;
    const value = equals >= 0 ? token.slice(equals + 1) : argv[index + 1];
    if (!['--shots', '--snapshot-id', '--output', '--generated-at'].includes(key)) {
      throw new Error(`Unknown option: ${token}`);
    }
    if (!value || (equals < 0 && value.startsWith('--'))) throw new Error(`${key} requires a value`);
    options[key.slice(2).replace(/-([a-z])/g, (_match, character) => character.toUpperCase())] = value;
    if (equals < 0) index += 1;
  }
  return options;
}

function parseShots(value) {
  if (!value) throw new Error('--shots is required');
  const shots = value.split(',').map((shot) => Number(shot.trim()));
  if (shots.length < MIN_SHOTS || shots.length > MAX_SHOTS) {
    throw new Error(`--shots must contain ${MIN_SHOTS}-${MAX_SHOTS} comma-separated shot numbers`);
  }
  if (shots.some((shot) => !Number.isSafeInteger(shot) || shot <= 0)) {
    throw new Error('--shots contains an invalid shot number');
  }
  if (new Set(shots).size !== shots.length) throw new Error('--shots must not contain duplicates');
  return shots;
}

function normalizeBaseUrl(raw) {
  if (!raw) throw new Error('FUSIONDATA_INTERNAL_API_BASE is required for the offline export');
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Internal API base must use HTTP or HTTPS');
  url.pathname = url.pathname.replace(/\/$/u, '');
  url.search = '';
  url.hash = '';
  return url;
}

function requestOnce(url, localAddress) {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolvePromise, reject) => {
    const request = transport.request(url, {
      method: 'GET',
      localAddress: localAddress || undefined,
      headers: { Accept: 'application/json', 'User-Agent': 'FusionDigital-offline-snapshot-exporter/1.0' },
      timeout: REQUEST_TIMEOUT_MS,
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          response.destroy(new Error(`Response exceeded ${MAX_RESPONSE_BYTES} bytes`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const body = Buffer.concat(chunks);
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Internal API returned HTTP ${response.statusCode ?? 'unknown'}`));
          return;
        }
        try {
          resolvePromise(JSON.parse(body.toString('utf8')));
        } catch {
          reject(new Error('Internal API returned invalid JSON'));
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Internal API request timed out')));
    request.on('error', reject);
    request.end();
  });
}

async function requestJson(baseUrl, pathname, searchParams) {
  const prefix = baseUrl.pathname === '/' ? '' : baseUrl.pathname;
  const url = new URL(`${prefix}${pathname}`, baseUrl);
  for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, String(value));
  let lastError;
  for (let attempt = 1; attempt <= REQUEST_RETRIES; attempt += 1) {
    try {
      return await requestOnce(url, process.env.FUSIONDATA_LOCAL_ADDRESS);
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_RETRIES) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 800));
    }
  }
  throw new Error(`Internal API request failed after ${REQUEST_RETRIES} attempts: ${lastError?.message ?? 'unknown error'}`);
}

function assertDataset(dataset, shot, dataItem) {
  if (!dataset || dataset.shot !== shot || dataset.ids_name !== dataItem) {
    throw new Error(`Dataset identity mismatch for shot ${shot}/${dataItem}`);
  }
  if (dataset.status !== 'valid' || dataset.is_recommended !== 1 || dataset.publish_state !== 'published') {
    throw new Error(`Dataset is not valid, recommended, and published: ${dataset.id}`);
  }
  if (typeof dataset.h5_path !== 'string' || dataset.h5_path.length === 0) {
    throw new Error(`Dataset has no authoritative IMAS H5 source: ${dataset.id}`);
  }
  if (dataset.id !== `${shot}/${dataItem}/${dataset.occurrence}/r${dataset.run}`) {
    throw new Error(`Dataset id does not match shot/IDS/occurrence/run: ${dataset.id}`);
  }
}

function assertStrictlyIncreasing(times, label) {
  for (let index = 1; index < times.length; index += 1) {
    if (!(times[index] > times[index - 1])) throw new Error(`${label} time axis is not strictly increasing`);
  }
}

function validateSeriesPayload(payload, dataset, signal, shot) {
  if (payload.shot !== shot || payload.data_item !== signal.dataItem || payload.signal !== signal.path) {
    throw new Error(`Signal response identity mismatch for shot ${shot}/${signal.id}`);
  }
  if (payload.run !== dataset.run || payload.occurrence !== dataset.occurrence) {
    throw new Error(`Signal response run/occurrence mismatch for ${dataset.id}`);
  }
  if (payload.kind !== '1d' || typeof payload.unit !== 'string' || payload.unit.length === 0) {
    throw new Error(`Signal is not a unit-bearing 1D series: ${dataset.id}/${signal.path}`);
  }
  if (!Number.isSafeInteger(payload.points) || payload.points <= 0) throw new Error('Signal source point count is invalid');
  if (!Array.isArray(payload.time) || !Array.isArray(payload.value) || payload.time.length !== payload.value.length) {
    throw new Error('Signal time/value arrays are missing or unequal');
  }
  if (payload.time.length < 2 || payload.time.length > MAX_PUBLISHED_POINTS) {
    throw new Error(`Published point count is outside 2-${MAX_PUBLISHED_POINTS}`);
  }
  if (payload.time.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('Signal time axis contains a non-finite value');
  }
  if (payload.value.some((value) => value !== null && (typeof value !== 'number' || !Number.isFinite(value)))) {
    throw new Error('Signal values contain an unsupported value');
  }
  assertStrictlyIncreasing(payload.time, `${dataset.id}/${signal.path}`);
  if (payload.downsampled_to !== payload.time.length) throw new Error('Gateway downsample count does not match the response');
}

async function exportShot(baseUrl, shot, snapshotId) {
  const catalogue = await requestJson(baseUrl, '/api/datasets', { shot, is_recommended: 1 });
  if (!Array.isArray(catalogue)) throw new Error(`Dataset catalogue is not an array for shot ${shot}`);
  const signals = [];

  for (const signal of SIGNAL_ALLOWLIST) {
    const candidates = catalogue.filter((dataset) => dataset.ids_name === signal.dataItem);
    if (candidates.length !== 1) throw new Error(`Expected exactly one recommended ${signal.dataItem} dataset for shot ${shot}`);
    const dataset = candidates[0];
    assertDataset(dataset, shot, signal.dataItem);

    const signalCatalogue = await requestJson(baseUrl, `/api/shots/${shot}/signals`, { data_item: signal.dataItem });
    if (signalCatalogue.dataset_id !== dataset.id
      || signalCatalogue.run !== dataset.run
      || signalCatalogue.occurrence !== dataset.occurrence) {
      throw new Error(`Signal catalogue resolved a different dataset for ${dataset.id}`);
    }
    const descriptor = signalCatalogue.signals?.find((item) => item.path === signal.path);
    if (!descriptor || descriptor.kind !== '1d' || typeof descriptor.unit !== 'string' || descriptor.unit.length === 0) {
      throw new Error(`Allowlisted signal is absent from ${dataset.id}: ${signal.path}`);
    }

    const payload = await requestJson(baseUrl, `/api/shots/${shot}/signals/data`, {
      data_item: signal.dataItem,
      signal: signal.path,
      downsample: MAX_PUBLISHED_POINTS,
    });
    validateSeriesPayload(payload, dataset, signal, shot);
    if (payload.unit !== descriptor.unit) throw new Error(`Unit drift for ${dataset.id}/${signal.path}`);

    const samples = payload.time.map((time, index) => [time, payload.value[index]]);
    signals.push({
      id: signal.id,
      label: signal.label,
      labelEn: signal.labelEn,
      color: signal.color,
      observationKind: 'facility-record',
      processingLevel: 'unclassified',
      projection: 'mdsplus-readonly-snapshot',
      dataItem: signal.dataItem,
      path: signal.path,
      unit: payload.unit,
      kind: '1d',
      dataset: {
        id: dataset.id,
        idsName: dataset.ids_name,
        occurrence: dataset.occurrence,
        run: dataset.run,
        recommended: true,
        catalogueStatus: 'valid',
        publishState: 'published',
        hasAuthoritativeImasH5: true,
      },
      sampling: {
        sourcePoints: payload.points,
        publishedPoints: samples.length,
        requestedMaxPoints: MAX_PUBLISHED_POINTS,
        method: 'gateway-downsample',
        timeRange: [samples[0][0], samples.at(-1)[0]],
        samplePolicy: 'nearest',
        noInterpolation: true,
        connectAcrossGaps: false,
        missingValues: samples.reduce((count, sample) => count + (sample[1] === null ? 1 : 0), 0),
      },
      quality: { state: 'unknown', basis: 'not-provided-by-source' },
      sampleSha256: sha256(JSON.stringify(samples)),
      samples,
    });
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA,
    snapshotId,
    facility: 'EXL-50U',
    pulse: shot,
    source: {
      authority: 'IMAS H5',
      projection: 'read-only MDSplus time-series projection',
      transport: 'reviewed public snapshot',
    },
    signals,
  };
}

function assertNoPrivateMetadata(value, label) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  const forbidden = [
    /(?:^|[^\d])10\.\d+\.\d+\.\d+(?:[^\d]|$)/u,
    /(?:^|[^\d])172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+(?:[^\d]|$)/u,
    /(?:^|[^\d])192\.168\.\d+\.\d+(?:[^\d]|$)/u,
    /(?:h5_path|extra_path|task_id|smb:\/\/|ftp:\/\/|mdsplus:\/\/|\/mnt\/)/iu,
    /(?:password|secret|token|credential)/iu,
  ];
  if (forbidden.some((pattern) => pattern.test(serialized))) {
    throw new Error(`${label} contains private endpoint, storage, task, or credential metadata`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const shots = parseShots(options.shots);
  if (!options.snapshotId || !/^exl50u-mdsplus-\d{8}-r\d+$/u.test(options.snapshotId)) {
    throw new Error('--snapshot-id must match exl50u-mdsplus-YYYYMMDD-rN');
  }
  const generatedAt = new Date(options.generatedAt ?? Date.now()).toISOString();
  const baseUrl = normalizeBaseUrl(process.env.FUSIONDATA_INTERNAL_API_BASE);
  const output = resolve(options.output ?? DEFAULT_OUTPUT);
  await mkdir(output, { recursive: true });
  const expectedShotFiles = new Set(shots.map((shot) => `shot-${shot}.jsonl.gz`));
  for (const entry of await readdir(output, { withFileTypes: true })) {
    if (entry.isFile()
      && /^shot-\d+\.json(?:l)?\.gz$/u.test(entry.name)
      && !expectedShotFiles.has(entry.name)) {
      await unlink(resolve(output, entry.name));
    }
  }

  const shotEntries = [];
  for (const shot of shots) {
    process.stdout.write(`Exporting EXL-50U shot ${shot}...\n`);
    const record = await exportShot(baseUrl, shot, options.snapshotId);
    assertNoPrivateMetadata(record, `shot ${shot}`);
    const json = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    const compressed = gzipSync(json, { level: 9, mtime: 0 });
    const filename = `shot-${shot}.jsonl.gz`;
    await writeFile(resolve(output, filename), compressed);
    shotEntries.push({
      pulse: shot,
      path: filename,
      signalCount: record.signals.length,
      compressedBytes: compressed.byteLength,
      compressedSha256: sha256(compressed),
      contentBytes: json.byteLength,
      contentSha256: sha256(json),
      datasetIds: record.signals.map((series) => series.dataset.id),
    });
  }

  const manifest = {
    schemaVersion: SNAPSHOT_SCHEMA,
    snapshotId: options.snapshotId,
    generatedAt,
    facility: 'EXL-50U',
    state: 'versioned-public-snapshot',
    live: false,
    source: {
      authority: 'IMAS H5',
      projection: 'read-only MDSplus time-series projection',
      browserConnection: 'none',
    },
    publication: {
      scope: `${shots.length} reviewed shots and ${SIGNAL_ALLOWLIST.length} allowlisted 1D signals per shot`,
      missingValuePolicy: 'preserve-null',
      interpolation: 'none',
      qualityBasis: 'not-provided-by-source',
      peakClaims: 'not-published',
    },
    shots: shotEntries,
  };
  assertNoPrivateMetadata(manifest, 'manifest');
  await writeFile(resolve(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`Wrote ${shots.length} shots to ${output}\n`);
}

main().catch((error) => {
  console.error(`fusion-data export: ${error.message}`);
  process.exitCode = 1;
});
