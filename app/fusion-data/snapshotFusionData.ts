// Pin the catalog to this UI release: an hour-old browser/CDN catalog must not
// silently replace the new shot list. Shot extensions also use immutable URLs.
export const SNAPSHOT_RELEASE_ID = 'exl50u-imas-20260908-r2';
export const SNAPSHOT_MANIFEST_URL = `/data/exl50u-mdsplus-snapshot-v1/manifest.${SNAPSHOT_RELEASE_ID}.json`;
export const SNAPSHOT_SCHEMA = 'fusiondigital.exl50u.public-snapshot.v1';
type SourceProjection = 'read-only MDSplus time-series projection' | 'offline IMAS H5 time-series extraction';
const SOURCE_PROJECTIONS: string[] = ['read-only MDSplus time-series projection', 'offline IMAS H5 time-series extraction'];

export type SnapshotManifestShot = {
  pulse: number;
  path: string;
  signalCount: number;
  compressedBytes: number;
  compressedSha256: string;
  contentBytes: number;
  contentSha256: string;
  datasetIds: string[];
  snapshotId?: string;
  campaignDate?: string;
  missingDataItems?: string[];
};

export type SnapshotManifest = {
  schemaVersion: typeof SNAPSHOT_SCHEMA;
  snapshotId: string;
  generatedAt: string;
  facility: 'EXL-50U';
  state: 'versioned-public-snapshot';
  live: false;
  source: {
    authority: 'IMAS H5';
    projection: SourceProjection | 'mixed MDSplus projection and offline IMAS H5 extraction';
    browserConnection: 'none';
  };
  publication: {
    scope: string;
    missingValuePolicy: 'preserve-null';
    interpolation: 'none';
    qualityBasis: 'not-provided-by-source' | 'per-signal-disclosure';
    peakClaims: 'not-published';
  };
  shots: SnapshotManifestShot[];
};

export type SnapshotSample = [time: number, value: number | null];

export type SnapshotSignal = {
  id: string;
  label: string;
  labelEn: string;
  color: string;
  observationKind: 'facility-record';
  processingLevel: 'unclassified' | 'boundary-derived';
  derivation?: { method: 'boundary-extents-v1'; formula: string; fields: string[]; notControllerTelemetry: true; invalidOutlinePolicy: 'whole-frame-null' };
  projection: 'mdsplus-readonly-snapshot' | 'imas-h5-offline';
  origin?: { h5Sha256: string; field: string; timeField: string; channelIndex: number | null; timeUnit: 's' };
  dataItem: string;
  path: string;
  unit: string;
  kind: '1d';
  dataset: {
    id: string;
    idsName: string;
    occurrence: number;
    run: number;
    recommended: true;
    catalogueStatus: 'valid';
    publishState: 'published';
    hasAuthoritativeImasH5: true;
  };
  sampling: {
    sourcePoints: number;
    publishedPoints: number;
    requestedMaxPoints: number;
    method: 'gateway-downsample' | 'offline-index-subsample';
    timeRange: [number, number];
    samplePolicy: 'nearest';
    noInterpolation: true;
    connectAcrossGaps: false;
    missingValues: number;
    sourceMissingValues?: number;
  };
  quality: {
    state: 'unknown';
    basis: 'not-provided-by-source' | 'not-exported';
  };
  sampleSha256: string;
  samples: SnapshotSample[];
};

export type SnapshotShot = {
  schemaVersion: typeof SNAPSHOT_SCHEMA;
  snapshotId: string;
  facility: 'EXL-50U';
  pulse: number;
  source: {
    authority: 'IMAS H5';
    projection: SourceProjection;
    transport: 'reviewed public snapshot';
  };
  signals: SnapshotSignal[];
};

type FetchLike = typeof fetch;

const SHA256 = /^[a-f0-9]{64}$/u;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSafePositiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${label} must be a positive safe integer`);
}

function assertSha256(value: unknown, label: string) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256`);
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertManifest(value: unknown): asserts value is SnapshotManifest {
  if (!isObject(value)
    || value.schemaVersion !== SNAPSHOT_SCHEMA
    || typeof value.snapshotId !== 'string'
    || value.facility !== 'EXL-50U'
    || value.state !== 'versioned-public-snapshot'
    || value.live !== false
    || typeof value.generatedAt !== 'string'
    || !Array.isArray(value.shots)
    || value.shots.length < 1
    || value.shots.length > 100) {
    throw new Error('FusionData snapshot manifest identity is invalid');
  }
  if (new Date(value.generatedAt).toISOString() !== value.generatedAt) throw new Error('Snapshot generatedAt is not canonical UTC');
  if (!isObject(value.source)
    || value.source.authority !== 'IMAS H5'
    || ![...SOURCE_PROJECTIONS, 'mixed MDSplus projection and offline IMAS H5 extraction'].includes(String(value.source.projection))
    || value.source.browserConnection !== 'none') {
    throw new Error('Snapshot source boundary is invalid');
  }
  if (!isObject(value.publication)
    || value.publication.missingValuePolicy !== 'preserve-null'
    || value.publication.interpolation !== 'none'
    || !['not-provided-by-source', 'per-signal-disclosure'].includes(String(value.publication.qualityBasis))
    || value.publication.peakClaims !== 'not-published') {
    throw new Error('Snapshot publication policy is invalid');
  }
  const pulses = new Set<number>();
  for (const shot of value.shots) {
    if (!isObject(shot)) throw new Error('Snapshot shot entry is invalid');
    assertSafePositiveInteger(shot.pulse, 'shot pulse');
    if (pulses.has(Number(shot.pulse))) throw new Error('Snapshot pulse numbers must be unique');
    pulses.add(Number(shot.pulse));
    if (shot.path !== `shot-${shot.pulse}.jsonl.gz`
      && !(typeof shot.snapshotId === 'string' && /^exl50u-imas-\d{8}-r\d+$/.test(shot.snapshotId) && shot.path === `shot-${shot.pulse}.${shot.snapshotId}.jsonl.gz`)) {
      throw new Error('Snapshot shot path is invalid');
    }
    assertSafePositiveInteger(shot.signalCount, 'signalCount');
    assertSafePositiveInteger(shot.compressedBytes, 'compressedBytes');
    assertSafePositiveInteger(shot.contentBytes, 'contentBytes');
    if (Number(shot.signalCount) > 32 || Number(shot.contentBytes) > 4_000_000 || Number(shot.compressedBytes) > 2_000_000) throw new Error('Snapshot exceeds per-shot size budget');
    if (shot.snapshotId !== undefined && (typeof shot.snapshotId !== 'string' || !shot.snapshotId.length)) throw new Error('Invalid shot snapshot version');
    if (shot.campaignDate !== undefined && (typeof shot.campaignDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(shot.campaignDate))) throw new Error('Invalid campaign date');
    if (shot.missingDataItems !== undefined && (!Array.isArray(shot.missingDataItems) || !shot.missingDataItems.every((item) => typeof item === 'string'))) throw new Error('Invalid missing IDS list');
    assertSha256(shot.compressedSha256, 'compressedSha256');
    assertSha256(shot.contentSha256, 'contentSha256');
    if (!Array.isArray(shot.datasetIds) || shot.datasetIds.length !== shot.signalCount) {
      throw new Error('Snapshot dataset id list does not match signal count');
    }
  }
}

async function sha256Hex(bytes: ArrayBuffer | Uint8Array) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', source as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function decompressGzip(bytes: ArrayBuffer) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decode the reviewed FusionData snapshot');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function validateSignal(signal: unknown, pulse: number): Promise<SnapshotSignal> {
  if (!isObject(signal)
    || typeof signal.id !== 'string'
    || typeof signal.label !== 'string'
    || typeof signal.labelEn !== 'string'
    || typeof signal.color !== 'string'
    || signal.observationKind !== 'facility-record'
    || !['unclassified', 'boundary-derived'].includes(String(signal.processingLevel))
    || !['mdsplus-readonly-snapshot', 'imas-h5-offline'].includes(String(signal.projection))
    || typeof signal.dataItem !== 'string'
    || typeof signal.path !== 'string'
    || typeof signal.unit !== 'string'
    || signal.unit.length === 0
    || signal.kind !== '1d'
    || !isObject(signal.dataset)
    || !isObject(signal.sampling)
    || !isObject(signal.quality)
    || !Array.isArray(signal.samples)) {
    throw new Error(`Snapshot signal structure is invalid for shot ${pulse}`);
  }
  const dataset = signal.dataset;
  if (dataset.id !== `${pulse}/${signal.dataItem}/${dataset.occurrence}/r${dataset.run}`
    || dataset.idsName !== signal.dataItem
    || !Number.isSafeInteger(dataset.occurrence)
    || !Number.isSafeInteger(dataset.run)
    || Number(dataset.occurrence) < 0 || Number(dataset.run) < 0
    || dataset.recommended !== true
    || dataset.catalogueStatus !== 'valid'
    || dataset.publishState !== 'published'
    || dataset.hasAuthoritativeImasH5 !== true) {
    throw new Error(`Snapshot dataset identity is invalid for shot ${pulse}/${signal.id}`);
  }
  const sampling = signal.sampling;
  assertSafePositiveInteger(sampling.sourcePoints, 'sourcePoints');
  assertSafePositiveInteger(sampling.publishedPoints, 'publishedPoints');
  assertSafePositiveInteger(sampling.requestedMaxPoints, 'requestedMaxPoints');
  const offline = signal.projection === 'imas-h5-offline';
  if (sampling.publishedPoints !== signal.samples.length
    || signal.samples.length < 2 || signal.samples.length > 800
    || Number(sampling.publishedPoints) > Number(sampling.sourcePoints)
    || Number(sampling.requestedMaxPoints) > 800 || signal.samples.length > Number(sampling.requestedMaxPoints)
    || sampling.method !== (offline ? 'offline-index-subsample' : 'gateway-downsample')
    || sampling.samplePolicy !== 'nearest'
    || sampling.noInterpolation !== true
    || sampling.connectAcrossGaps !== false
    || !Array.isArray(sampling.timeRange)
    || sampling.timeRange.length !== 2
    || signal.quality.state !== 'unknown'
    || signal.quality.basis !== (offline ? 'not-exported' : 'not-provided-by-source')) {
    throw new Error(`Snapshot sampling contract is invalid for shot ${pulse}/${signal.id}`);
  }
  if (offline) {
    if (!isObject(signal.origin) || typeof signal.origin.field !== 'string' || typeof signal.origin.timeField !== 'string' || signal.origin.timeUnit !== 's'
      || (signal.origin.channelIndex !== null && (!Number.isSafeInteger(signal.origin.channelIndex) || Number(signal.origin.channelIndex) < 0))) throw new Error('Missing offline H5 provenance');
    assertSha256(signal.origin.h5Sha256, 'source H5 SHA-256');
  }
  if (signal.processingLevel === 'boundary-derived') {
    const expected = {
      'boundary-rmax': ['m', 'max(R)', 'DERIVED.BOUNDARY.RMAX'],
      'boundary-rmin': ['m', 'min(R)', 'DERIVED.BOUNDARY.RMIN'],
      'boundary-kappa': ['1', '(max(Z)-min(Z))/(max(R)-min(R))', 'DERIVED.BOUNDARY.KAPPA'],
    }[signal.id];
    const r = 'time_slice[]&boundary&outline&r';
    const z = 'time_slice[]&boundary&outline&z';
    if (!expected || !offline || signal.dataItem !== 'equilibrium' || signal.unit !== expected[0] || signal.path !== expected[2]
      || !isObject(signal.origin) || signal.origin.field !== r || signal.origin.timeField !== 'time' || signal.origin.channelIndex !== null
      || !isObject(signal.derivation) || signal.derivation.method !== 'boundary-extents-v1'
      || signal.derivation.formula !== expected[1] || signal.derivation.notControllerTelemetry !== true
      || signal.derivation.invalidOutlinePolicy !== 'whole-frame-null'
      || JSON.stringify(signal.derivation.fields) !== JSON.stringify([r, z, `${r}_SHAPE`, `${z}_SHAPE`])) {
      throw new Error('Invalid boundary-derived signal provenance');
    }
  } else if (signal.derivation !== undefined || signal.id.startsWith('boundary-')) {
    throw new Error('Boundary-derived signals must disclose their processing level');
  }
  let previous = -Infinity;
  for (const [index, sample] of signal.samples.entries()) {
    if (!Array.isArray(sample) || sample.length !== 2) throw new Error('Snapshot sample is not a time/value pair');
    assertFiniteNumber(sample[0], `sample ${index} time`);
    if (!(sample[0] > previous)) throw new Error('Snapshot time axis must be strictly increasing');
    previous = sample[0];
    if (sample[1] !== null) assertFiniteNumber(sample[1], `sample ${index} value`);
  }
  if (signal.samples[0][0] !== sampling.timeRange[0] || signal.samples.at(-1)?.[0] !== sampling.timeRange[1]) {
    throw new Error(`Snapshot time range does not match samples for shot ${pulse}/${signal.id}`);
  }
  if (sampling.missingValues !== signal.samples.filter((sample) => sample[1] === null).length) throw new Error('Snapshot missing-value count mismatch');
  assertSha256(signal.sampleSha256, 'sampleSha256');
  if (await sha256Hex(new TextEncoder().encode(JSON.stringify(signal.samples))) !== signal.sampleSha256) {
    throw new Error(`Snapshot sample hash mismatch for shot ${pulse}/${signal.id}`);
  }
  return signal as SnapshotSignal;
}

async function assertShot(value: unknown, manifest: SnapshotManifest, entry: SnapshotManifestShot): Promise<SnapshotShot> {
  if (!isObject(value)
    || value.schemaVersion !== SNAPSHOT_SCHEMA
    || value.snapshotId !== (entry.snapshotId ?? manifest.snapshotId)
    || value.facility !== 'EXL-50U'
    || value.pulse !== entry.pulse
    || !isObject(value.source)
    || value.source.authority !== 'IMAS H5'
    || !SOURCE_PROJECTIONS.includes(String(value.source.projection))
    || value.source.transport !== 'reviewed public snapshot'
    || !Array.isArray(value.signals)
    || value.signals.length !== entry.signalCount) {
    throw new Error(`Snapshot shot identity is invalid for ${entry.pulse}`);
  }
  const ids = new Set<string>();
  const signals: SnapshotSignal[] = [];
  for (const candidate of value.signals) {
    const signal = await validateSignal(candidate, entry.pulse);
    if ((signal.projection === 'imas-h5-offline') !== (value.source.projection === 'offline IMAS H5 time-series extraction')) throw new Error('Signal and shot source disagree');
    if (ids.has(signal.id)) throw new Error(`Duplicate signal id in shot ${entry.pulse}: ${signal.id}`);
    ids.add(signal.id);
    signals.push(signal);
  }
  const datasetIds = signals.map((signal) => signal.dataset.id);
  if (JSON.stringify(datasetIds) !== JSON.stringify(entry.datasetIds)) {
    throw new Error(`Snapshot dataset list mismatch for shot ${entry.pulse}`);
  }
  return { ...value, signals } as SnapshotShot;
}

export async function loadSnapshotManifest(fetcher: FetchLike = fetch) {
  const response = await fetcher(SNAPSHOT_MANIFEST_URL, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`FusionData snapshot manifest failed with HTTP ${response.status}`);
  const value: unknown = await response.json();
  assertManifest(value);
  if (value.snapshotId !== SNAPSHOT_RELEASE_ID) throw new Error('FusionData catalog version does not match this release');
  return value;
}

export async function loadSnapshotShot(
  manifest: SnapshotManifest,
  pulse: number,
  fetcher: FetchLike = fetch,
) {
  const entry = manifest.shots.find((shot) => shot.pulse === pulse);
  if (!entry) throw new Error(`Shot ${pulse} is not part of snapshot ${manifest.snapshotId}`);
  const response = await fetcher(`/data/exl50u-mdsplus-snapshot-v1/${entry.path}`, {
    headers: { Accept: 'application/gzip', 'Accept-Encoding': 'identity' },
  });
  if (!response.ok) throw new Error(`FusionData shot ${pulse} failed with HTTP ${response.status}`);
  if (response.headers.get('content-encoding')) {
    throw new Error('FusionData shot must expose reviewed raw gzip bytes without HTTP content decoding');
  }
  const compressed = await response.arrayBuffer();
  const header = new Uint8Array(compressed, 0, Math.min(10, compressed.byteLength));
  if (header.length < 10 || header[0] !== 0x1f || header[1] !== 0x8b || header[2] !== 8
    || header[4] !== 0 || header[5] !== 0 || header[6] !== 0 || header[7] !== 0) {
    throw new Error('FusionData shot is not a deterministic raw-gzip snapshot');
  }
  if (compressed.byteLength !== entry.compressedBytes || await sha256Hex(compressed) !== entry.compressedSha256) {
    throw new Error(`FusionData compressed snapshot integrity failed for shot ${pulse}`);
  }
  const content = await decompressGzip(compressed);
  if (content.byteLength !== entry.contentBytes || await sha256Hex(content) !== entry.contentSha256) {
    throw new Error(`FusionData content integrity failed for shot ${pulse}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(content));
  } catch {
    throw new Error(`FusionData shot ${pulse} contains invalid JSON`);
  }
  return assertShot(value, manifest, entry);
}

export function nearestSample(signal: SnapshotSignal, targetTime: number) {
  if (!signal.samples.length || !Number.isFinite(targetTime) || targetTime < signal.samples[0][0] || targetTime > signal.samples[signal.samples.length - 1][0]) return null;
  let low = 0;
  let high = signal.samples.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (signal.samples[middle][0] < targetTime) low = middle + 1;
    else high = middle;
  }
  const right = signal.samples[low];
  const left = signal.samples[Math.max(0, low - 1)];
  return Math.abs(left[0] - targetTime) <= Math.abs(right[0] - targetTime) ? left : right;
}

export function commonSignalIds(left: SnapshotShot, right: SnapshotShot | null) {
  if (!right) return left.signals.map((signal) => signal.id);
  return left.signals.filter((signal) => right.signals.some((other) => other.id === signal.id && other.unit === signal.unit)).map(({ id }) => id);
}
