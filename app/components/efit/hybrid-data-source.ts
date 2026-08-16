import { createEfitBinaryDataSource } from './data-source';
import { validateEfitTopologyGraphFrame } from './topology-graph-runtime';
import type {
  EfitContour,
  EfitDataRequest,
  EfitDataSource,
  EfitFrame,
  EfitFrameSummary,
  EfitGap,
  EfitGeometry,
  EfitManifest,
  EfitNumericQuantizationContract,
  EfitQuality,
  EfitQualityState,
  EfitShotCatalogMetadata,
  EfitShotId,
  EfitShotManifest,
  EfitTopologyGraphChunkDescriptor,
  EfitTopologyGraphFramePayload,
} from './types';

const DEFAULT_V2_INDEX_URL = '/device-data/exl50u-efit-v2/index.json';
const DEFAULT_LEGACY_INDEX_URL = '/device-data/exl50u-efit/index.json';
const MAX_CHUNK_BYTES = 32 * 1024 * 1024;
const MAX_DECOMPRESSED_CHUNK_BYTES = 32 * 1024 * 1024;
const MAX_SHOTS = 256;
const MAX_FRAMES_PER_SHOT = 20_000;
const MAX_FRAMES_PER_CHUNK = 16;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

export type EfitHybridDataSourceOptions = {
  indexUrl?: string;
  legacyIndexUrl?: string;
  fetch?: FetchLike;
  maxCachedChunks?: number;
  maxCachedLegacyFrames?: number;
};

type NormalizedGraphCatalog = {
  manifest: EfitManifest;
  sourceByShot: ReadonlyMap<EfitShotId, EfitShotManifest>;
};

function abortError(): Error {
  try {
    return new DOMException('The operation was aborted.', 'AbortError');
  } catch {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    return error;
  }
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  checkAborted(signal);
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonRecord;
}

function array(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must be a bounded array.`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite.`);
  return value;
}

function nullableFinite(value: unknown, label: string): number | null {
  return value === null ? null : finite(value, label);
}

function integer(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = finite(value, label);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${label} must be an integer in range.`);
  return parsed;
}

function text(value: unknown, label: string, maximum = 192): string {
  if (typeof value !== 'string' || !value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${label} must be a bounded string.`);
  }
  return value;
}

function optionalText(value: unknown, maximum = 192): string | undefined {
  return value === undefined ? undefined : text(value, 'optional string', maximum);
}

function sha256(value: unknown, label: string): string {
  const digest = text(value, label, 64);
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`${label} must be a SHA-256 digest.`);
  return digest;
}

function geometryId(value: unknown, label: string): string {
  const parsed = text(value, label, 96);
  if (!/^[a-z0-9][a-z0-9._:-]*$/i.test(parsed)) throw new Error(`${label} is invalid.`);
  return parsed;
}

function canonicalIndexUrl(value: string, expectedLeaf: 'index.json' | 'legacy.json' = 'index.json'): string {
  if (!value.startsWith('/device-data/') || value.includes('..') || value.includes('%') || value.includes('//')
    || value.includes('?') || value.includes('#') || !value.endsWith(expectedLeaf === 'index.json' ? '/index.json' : '.json')) {
    throw new Error('EFIT catalog URL must be a canonical same-origin device-data JSON path.');
  }
  return value;
}

function assetUrl(value: unknown, indexUrl: string, extension: '.jsonl.gz' | '.bin'): string {
  const asset = text(value, 'EFIT asset URL', 240);
  const base = indexUrl.slice(0, indexUrl.lastIndexOf('/') + 1);
  const resolved = asset.startsWith('/') ? asset : `${base}${asset}`;
  if (!resolved.startsWith('/device-data/') || !resolved.startsWith(base) || resolved.includes('..')
    || resolved.includes('%') || resolved.includes('//') || resolved.includes('?') || resolved.includes('#')
    || !resolved.endsWith(extension)) {
    throw new Error('EFIT asset URL escaped its controlled catalog directory.');
  }
  return resolved;
}

function parseExtent(value: unknown): readonly [number, number, number, number] {
  if (Array.isArray(value) && value.length === 4) {
    const parsed = value.map((entry, index) => finite(entry, `gridExtentM[${index}]`)) as [number, number, number, number];
    if (parsed[1] <= parsed[0] || parsed[3] <= parsed[2]) throw new Error('EFIT grid extent is invalid.');
    return parsed;
  }
  const item = record(value, 'gridExtentM');
  const r = array(item.r, 'gridExtentM.r', 2);
  const z = array(item.z, 'gridExtentM.z', 2);
  if (r.length !== 2 || z.length !== 2) throw new Error('EFIT grid extent must contain R and Z ranges.');
  return parseExtent([r[0], r[1], z[0], z[1]]);
}

function parseFlatLimiter(value: unknown, label: string): EfitGeometry['limiterRzM'] {
  if (!Array.isArray(value) || value.length < 6 || value.length > 16_384 || value.length % 2 !== 0) {
    throw new Error(`${label} must contain complete bounded R-Z pairs.`);
  }
  const pointCount = value.length / 2;
  const rM = new Array<number>(pointCount);
  const zM = new Array<number>(pointCount);
  for (let index = 0; index < pointCount; index += 1) {
    const r = finite(value[index * 2], `${label}[${index}].R`);
    const z = finite(value[index * 2 + 1], `${label}[${index}].Z`);
    if (r < 0) throw new Error(`${label} contains a negative major radius.`);
    rM[index] = r;
    zM[index] = z;
  }
  return { rM, zM, validPoints: pointCount };
}

function parseGeometry(value: unknown, extent: readonly [number, number, number, number], index: number): EfitGeometry {
  const item = record(value, `geometries[${index}]`);
  const id = geometryId(item.id ?? item.geometryId, `geometries[${index}].id`);
  if (item.kind !== 'axisymmetric-wall-limiter-rz-polyline') throw new Error(`EFIT geometry ${id} has an unsupported kind.`);
  const contractKind = item.contractKind === 'legacy-source-order-v1' || item.contractKind === 'canonical-graph-v2'
    ? item.contractKind
    : (() => { throw new Error(`EFIT geometry ${id} has an unsupported contract kind.`); })();
  const limiterRzM = parseFlatLimiter(item.limiterRzM ?? item.coordinatesRzM, `geometries[${index}].limiterRzM`);
  const closed = item.closed === true;
  const first = [Number(limiterRzM.rM[0]), Number(limiterRzM.zM[0])];
  const last = [Number(limiterRzM.rM[limiterRzM.validPoints - 1]), Number(limiterRzM.zM[limiterRzM.validPoints - 1])];
  const inferredClosed = Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6;
  if (!closed || !inferredClosed) throw new Error(`EFIT geometry ${id} is not explicitly closed.`);
  const segmentCount = integer(item.segmentCount ?? item.canonicalSegmentCount, `geometry ${id} segmentCount`, 2, 8_191);
  if (segmentCount !== limiterRzM.validPoints - 1) throw new Error(`EFIT geometry ${id} segment count disagrees with its limiter.`);
  const publishedPointCount = contractKind === 'canonical-graph-v2' ? item.canonicalPointCount : item.pointCount;
  const canonicalPointCount = integer(publishedPointCount, `geometry ${id} published pointCount`, 3, 8_192);
  if (canonicalPointCount !== limiterRzM.validPoints) throw new Error(`EFIT geometry ${id} canonical point count disagrees with its limiter.`);
  const publishedLimiterHash = contractKind === 'canonical-graph-v2' ? item.canonicalSha256F64LE : item.limiterSha256F64LE;
  const canonicalHash = sha256(publishedLimiterHash, `geometry ${id} canonical hash`);
  const expectedId = `${contractKind === 'canonical-graph-v2' ? 'wall' : 'legacy-wall'}-${canonicalHash.slice(0, 20)}`;
  if (id !== expectedId) throw new Error(`EFIT geometry ${id} is not bound to its canonical coordinate hash.`);
  const sourceHash = contractKind === 'canonical-graph-v2'
    ? sha256(item.sourceLimiterSha256F64LE, `geometry ${id} source hash`)
    : undefined;
  const sourcePointCount = contractKind === 'canonical-graph-v2'
    ? integer(item.sourcePointCount, `geometry ${id} sourcePointCount`, segmentCount, 65_535)
    : undefined;
  const orientation = contractKind === 'canonical-graph-v2'
    ? item.orientation === 'counter-clockwise' || item.orientation === 'clockwise'
      ? item.orientation
      : (() => { throw new Error(`EFIT geometry ${id} has an invalid orientation.`); })()
    : undefined;
  const startPointRule = contractKind === 'canonical-graph-v2'
    ? text(item.startPointRule, `geometry ${id} startPointRule`, 192)
    : undefined;
  return {
    geometryId: id,
    limiterRzM,
    closed,
    canonicalSegmentCount: segmentCount,
    canonicalSha256F64LE: canonicalHash,
    canonicalPointCount,
    sourceLimiterSha256F64LE: sourceHash,
    sourcePointCount,
    orientation,
    startPointRule,
    gridExtentM: extent,
    coordinateSystem: optionalText(item.coordinateSystem),
  };
}

function parseGap(value: unknown, label: string): EfitGap {
  const item = record(value, label);
  const afterMs = integer(item.afterMs, `${label}.afterMs`, Number.MIN_SAFE_INTEGER);
  const beforeMs = integer(item.beforeMs, `${label}.beforeMs`, Number.MIN_SAFE_INTEGER);
  if (beforeMs <= afterMs) throw new Error(`${label} has an invalid interval.`);
  return {
    afterMs,
    beforeMs,
    missingCount: item.missingCount === undefined && item.estimatedMissingFrames === undefined
      ? undefined
      : integer(item.missingCount ?? item.estimatedMissingFrames, `${label}.missingCount`),
    reason: optionalText(item.reason, 320),
  };
}

function parseNumericQuantization(value: unknown): EfitNumericQuantizationContract {
  const item = record(value, 'distributionPolicy.numericQuantization');
  if (integer(item.fractionDigits, 'numericQuantization.fractionDigits', 0, 16) !== 8
    || item.roundingMode !== 'ROUND_HALF_EVEN'
    || item.negativeZeroNormalized !== true
    || finite(item.maxAbsoluteErrorPerValue, 'numericQuantization.maxAbsoluteErrorPerValue') !== 5e-9) {
    throw new Error('EFIT v2 numeric quantization contract is unsupported.');
  }
  return {
    fractionDigits: 8,
    roundingMode: 'ROUND_HALF_EVEN',
    negativeZeroNormalized: true,
    maxAbsoluteErrorPerValue: 5e-9,
  };
}

function sameLimiter(left: EfitGeometry, right: EfitGeometry): boolean {
  const leftLimiter = left.limiterRzM;
  const rightLimiter = right.limiterRzM;
  if (leftLimiter.validPoints !== rightLimiter.validPoints) return false;
  for (let index = 0; index < leftLimiter.validPoints; index += 1) {
    if (Math.hypot(
      Number(leftLimiter.rM[index]) - Number(rightLimiter.rM[index]),
      Number(leftLimiter.zM[index]) - Number(rightLimiter.zM[index]),
    ) > 1e-7) return false;
  }
  return true;
}

function catalogMetadata(
  shot: JsonRecord,
  datasets: ReadonlyMap<string, JsonRecord>,
  sourceKind: 'legacy-contours-v1' | 'topology-graph-v2',
): EfitShotCatalogMetadata {
  const datasetId = shot.datasetId === undefined ? undefined : geometryId(shot.datasetId, 'shot.datasetId');
  const dataset = datasetId ? datasets.get(datasetId) : undefined;
  if (datasetId && !dataset) throw new Error(`Shot dataset ${datasetId} is not present in the reviewed catalog.`);
  const qualitySummary = shot.qualitySummary && typeof shot.qualitySummary === 'object' ? record(shot.qualitySummary, 'qualitySummary') : undefined;
  const validityCounts = qualitySummary?.validityFrameCounts && typeof qualitySummary.validityFrameCounts === 'object'
    ? record(qualitySummary.validityFrameCounts, 'qualitySummary.validityFrameCounts')
    : undefined;
  const unavailable = validityCounts ? Number(validityCounts.unavailable ?? 0) : 0;
  const partial = validityCounts ? Number(validityCounts.partial ?? 0) : 0;
  const qualityState: EfitQualityState | undefined = unavailable > 0 ? 'invalid' : partial > 0 ? 'warning' : qualitySummary ? 'good' : undefined;
  return {
    datasetId,
    datasetLabel: dataset ? optionalText(dataset.displayName ?? dataset.label ?? dataset.id ?? dataset.datasetId) : undefined,
    reconstructionLabel: sourceKind === 'topology-graph-v2'
      ? `拓扑图 v2 · ${sha256(shot.reconstructionDigest, 'shot.reconstructionDigest').slice(0, 12)}`
      : '磁面重建 v1',
    qualityLabel: qualitySummary ? `质量 ${qualityState === 'good' ? '可用' : qualityState === 'warning' ? '部分' : '含不可用帧'}` : undefined,
    qualityState,
  };
}

function parseChunk(
  value: unknown,
  label: string,
  indexUrl: string,
  expectedChunkIndex: number,
  expectedFrameStart: number,
): EfitTopologyGraphChunkDescriptor {
  const item = record(value, label);
  const chunkIndex = integer(item.chunkIndex, `${label}.chunkIndex`);
  const frameStart = integer(item.frameStart, `${label}.frameStart`);
  const frameCount = integer(item.frameCount, `${label}.frameCount`, 1, MAX_FRAMES_PER_CHUNK);
  if (chunkIndex !== expectedChunkIndex || frameStart !== expectedFrameStart) throw new Error(`${label} is not contiguous and canonical.`);
  const timeRange = array(item.timeRangeMs, `${label}.timeRangeMs`, 2);
  const availableTimes = array(item.availableTimesMs, `${label}.availableTimesMs`, MAX_FRAMES_PER_CHUNK)
    .map((time, index) => integer(time, `${label}.availableTimesMs[${index}]`, Number.MIN_SAFE_INTEGER));
  if (timeRange.length !== 2 || availableTimes.length !== frameCount) throw new Error(`${label} has inconsistent timeline metadata.`);
  availableTimes.forEach((time, index) => {
    if (index > 0 && time <= availableTimes[index - 1]) throw new Error(`${label} frame times are not strictly increasing.`);
  });
  const range = [
    integer(timeRange[0], `${label}.timeRangeMs[0]`, Number.MIN_SAFE_INTEGER),
    integer(timeRange[1], `${label}.timeRangeMs[1]`, Number.MIN_SAFE_INTEGER),
  ] as const;
  if (range[0] !== availableTimes[0] || range[1] !== availableTimes.at(-1)) throw new Error(`${label} time range disagrees with its frames.`);
  if (item.contentType !== 'application/gzip'
    || item.uncompressedContentType !== 'application/x-ndjson'
    || item.compression !== 'gzip-mtime-zero'
    || item.httpContentEncoding !== 'identity') {
    throw new Error(`${label} has an unsupported raw-gzip transport contract.`);
  }
  const byteLength = integer(item.byteLength, `${label}.byteLength`, 1, MAX_CHUNK_BYTES);
  return {
    chunkIndex,
    frameStart,
    frameCount,
    timeRangeMs: range,
    availableTimesMs: availableTimes,
    url: assetUrl(item.url ?? item.path, indexUrl, '.jsonl.gz'),
    contentType: 'application/gzip',
    uncompressedContentType: 'application/x-ndjson',
    compression: 'gzip-mtime-zero',
    httpContentEncoding: 'identity',
    byteLength,
    sha256: sha256(item.sha256, `${label}.sha256`),
  };
}

function summaryFromCatalog(
  value: unknown,
  shot: EfitShotId,
  index: number,
  expectedTimeMs: number,
  extent: readonly [number, number, number, number],
): EfitFrameSummary {
  const item = record(value, `shot ${shot} frames[${index}]`);
  const timeMs = integer(item.timeMs, `shot ${shot} frames[${index}].timeMs`, Number.MIN_SAFE_INTEGER);
  if (timeMs !== expectedTimeMs) throw new Error(`Shot ${shot} lightweight frame summary is misaligned.`);
  const currentA = finite(item.currentA, `shot ${shot} frames[${index}].currentA`);
  const rAxisM = finite(item.rAxisM, `shot ${shot} frames[${index}].rAxisM`);
  const zAxisM = finite(item.zAxisM, `shot ${shot} frames[${index}].zAxisM`);
  const bcentrT = finite(item.bcentrT, `shot ${shot} frames[${index}].bcentrT`);
  const lcfsRMinM = nullableFinite(item.lcfsRMinM, `shot ${shot} frames[${index}].lcfsRMinM`);
  const lcfsRMaxM = nullableFinite(item.lcfsRMaxM, `shot ${shot} frames[${index}].lcfsRMaxM`);
  if (rAxisM < extent[0] || rAxisM > extent[1] || zAxisM < extent[2] || zAxisM > extent[3]) {
    throw new Error(`Shot ${shot} lightweight magnetic axis is outside the reviewed grid.`);
  }
  if ((lcfsRMinM === null) !== (lcfsRMaxM === null)
    || (lcfsRMinM !== null && lcfsRMaxM !== null
      && (lcfsRMinM < extent[0] || lcfsRMaxM > extent[1] || lcfsRMinM > rAxisM || lcfsRMaxM < rAxisM))) {
    throw new Error(`Shot ${shot} lightweight LCFS radial extrema are invalid.`);
  }
  const validity = item.qualityValidity === 'usable' || item.qualityValidity === 'partial' || item.qualityValidity === 'unavailable'
    ? item.qualityValidity
    : (() => { throw new Error(`Shot ${shot} frame ${index} has invalid qualityValidity.`); })();
  const qualityFlags = array(item.qualityFlags, `shot ${shot} frames[${index}].qualityFlags`, 256)
    .map((flag, flagIndex) => text(flag, `shot ${shot} frames[${index}].qualityFlags[${flagIndex}]`, 160));
  const quality: EfitQuality = {
    flags: 0,
    state: validity === 'usable' ? 'good' : validity === 'partial' ? 'warning' : 'invalid',
    messages: qualityFlags.length > 0
      ? qualityFlags.map((flag) => `EFIT v2 · ${flag}`)
      : ['EFIT v2 帧级质量门通过。'],
  };
  const q95 = item.q95 === null ? undefined : finite(item.q95, `shot ${shot} frames[${index}].q95`);
  return {
    shot,
    index,
    timeMs,
    quality,
    qualityValidity: validity,
    qualityFlags,
    currentA,
    rAxisM,
    zAxisM,
    bcentrT,
    lcfsRMinM,
    lcfsRMaxM,
    psiAxisWbPerRad: Number.NaN,
    psiBoundaryWbPerRad: Number.NaN,
    q95,
    surfaceMask: 0,
    lcfsValidPoints: 0,
    offsetBytes: 0,
  };
}

export function normalizeEfitHybridCatalog(
  value: unknown,
  legacyManifest: EfitManifest,
  indexUrl = DEFAULT_V2_INDEX_URL,
  legacyIndexUrl = DEFAULT_LEGACY_INDEX_URL,
): NormalizedGraphCatalog {
  const raw = record(value, 'EFIT v2 catalog');
  if (raw.schemaVersion !== 'fusion.efit.catalog.v2') throw new Error('EFIT v2 catalog schema is unsupported.');
  const device = record(raw.device, 'EFIT v2 catalog device');
  const distributionPolicy = record(raw.distributionPolicy, 'EFIT v2 distributionPolicy');
  const numericQuantization = parseNumericQuantization(distributionPolicy.numericQuantization);
  const extent = parseExtent(raw.gridExtentM);
  const geometries = array(raw.geometries, 'EFIT v2 geometries', 64).map((entry, index) => parseGeometry(entry, extent, index));
  if (geometries.length === 0) throw new Error('EFIT v2 catalog has no geometry contracts.');
  const geometryById = new Map<string, EfitGeometry>();
  geometries.forEach((geometry) => {
    if (!geometry.geometryId || geometryById.has(geometry.geometryId)) throw new Error('EFIT v2 catalog has duplicate geometry ids.');
    geometryById.set(geometry.geometryId, geometry);
  });
  const defaultGeometryId = geometryId(device.defaultGeometryId, 'device.defaultGeometryId');
  const defaultGeometry = geometryById.get(defaultGeometryId);
  if (!defaultGeometry) throw new Error('EFIT v2 default geometry is unknown.');
  const datasetEntries = array(raw.datasets ?? [], 'EFIT v2 datasets', 64).map((entry, index) => record(entry, `datasets[${index}]`));
  const datasets = new Map<string, JsonRecord>();
  datasetEntries.forEach((dataset, index) => {
    const id = geometryId(dataset.id ?? dataset.datasetId, `datasets[${index}].id`);
    if (datasets.has(id)) throw new Error('EFIT v2 catalog has duplicate dataset ids.');
    datasets.set(id, dataset);
  });
  const legacyByShot = new Map(legacyManifest.shots.map((shot) => [shot.shot, shot]));
  const sourceByShot = new Map<EfitShotId, EfitShotManifest>();
  const shots = array(raw.shots, 'EFIT v2 shots', MAX_SHOTS).map((entry, shotIndex): EfitShotManifest => {
    const shot = record(entry, `shots[${shotIndex}]`);
    const shotNumber = integer(shot.shot, `shots[${shotIndex}].shot`, 1);
    if (sourceByShot.has(shotNumber)) throw new Error('EFIT v2 catalog has duplicate shot numbers.');
    const sourceKind = shot.sourceKind === 'legacy-contours-v1' || shot.sourceKind === 'topology-graph-v2'
      ? shot.sourceKind
      : (() => { throw new Error(`Shot ${shotNumber} has an unsupported sourceKind.`); })();
    const shotGeometryId = geometryId(shot.geometryId, `shot ${shotNumber} geometryId`);
    if (!geometryById.has(shotGeometryId)) throw new Error(`Shot ${shotNumber} references an unknown geometry.`);
    const frameCount = integer(shot.frameCount, `shot ${shotNumber} frameCount`, 1, MAX_FRAMES_PER_SHOT);
    const range = array(shot.timeRangeMs, `shot ${shotNumber} timeRangeMs`, 2);
    if (range.length !== 2) throw new Error(`Shot ${shotNumber} has an invalid time range.`);
    const minTimeMs = integer(range[0], `shot ${shotNumber} min time`, Number.MIN_SAFE_INTEGER);
    const maxTimeMs = integer(range[1], `shot ${shotNumber} max time`, Number.MIN_SAFE_INTEGER);
    const metadata = catalogMetadata(shot, datasets, sourceKind);
    if (sourceKind === 'legacy-contours-v1') {
      const manifestUrl = canonicalIndexUrl(text(shot.manifestUrl, `shot ${shotNumber} manifestUrl`), 'legacy.json');
      if (manifestUrl !== legacyIndexUrl) throw new Error(`Shot ${shotNumber} references an unexpected legacy manifest.`);
      const manifestShot = integer(shot.manifestShot, `shot ${shotNumber} manifestShot`, 1);
      const legacy = legacyByShot.get(manifestShot);
      if (!legacy || manifestShot !== shotNumber || legacy.frameCount !== frameCount
        || legacy.minTimeMs !== minTimeMs || legacy.maxTimeMs !== maxTimeMs) {
        throw new Error(`Shot ${shotNumber} legacy descriptor disagrees with the reviewed v1 manifest.`);
      }
      const catalogGeometry = geometryById.get(shotGeometryId);
      if (!catalogGeometry || !sameLimiter(catalogGeometry, legacyManifest.geometry)) {
        throw new Error(`Shot ${shotNumber} legacy limiter geometry disagrees with the reviewed v1 manifest.`);
      }
      if (legacy.geometryId && legacy.geometryId !== shotGeometryId) throw new Error(`Shot ${shotNumber} legacy geometry mismatch.`);
      if (shot.baseBinaryUrl !== undefined && legacy.binary?.url !== assetUrl(shot.baseBinaryUrl, legacyIndexUrl, '.bin')) {
        throw new Error(`Shot ${shotNumber} legacy binary URL mismatch.`);
      }
      if (shot.baseBinarySha256 !== undefined
        && legacy.binary?.sha256?.toLowerCase() !== sha256(shot.baseBinarySha256, `shot ${shotNumber} baseBinarySha256`)) {
        throw new Error(`Shot ${shotNumber} legacy binary hash mismatch.`);
      }
      if (shot.topologyBinaryUrl !== undefined && shot.topologyBinaryUrl !== null
        && legacy.topologyBinary?.url !== assetUrl(shot.topologyBinaryUrl, legacyIndexUrl, '.bin')) {
        throw new Error(`Shot ${shotNumber} legacy topology URL mismatch.`);
      }
      const normalized = { ...legacy, sourceKind, geometryId: shotGeometryId, catalog: metadata } as EfitShotManifest;
      sourceByShot.set(shotNumber, normalized);
      return normalized;
    }

    const shotId = text(shot.shotId, `shot ${shotNumber} shotId`, 160);
    const reconstructionId = text(shot.reconstructionId, `shot ${shotNumber} reconstructionId`, 192);
    const reconstructionDigest = sha256(shot.reconstructionDigest, `shot ${shotNumber} reconstructionDigest`);
    const expectedReconstructionId = `exl-50u:efit:${String(shotNumber).padStart(6, '0')}:${reconstructionDigest.slice(0, 20)}`;
    if (reconstructionId !== expectedReconstructionId) {
      throw new Error(`Shot ${shotNumber} reconstruction id is not bound to its published digest.`);
    }
    const assets = array(shot.frameAssets, `shot ${shotNumber} frameAssets`, Math.ceil(MAX_FRAMES_PER_SHOT / MAX_FRAMES_PER_CHUNK));
    let frameStart = 0;
    const chunks = assets.map((asset, chunkIndex) => {
      const chunk = parseChunk(asset, `shot ${shotNumber} frameAssets[${chunkIndex}]`, indexUrl, chunkIndex, frameStart);
      frameStart += chunk.frameCount;
      return chunk;
    });
    if (frameStart !== frameCount) throw new Error(`Shot ${shotNumber} chunk frame count is inconsistent.`);
    const times = chunks.flatMap((chunk) => [...chunk.availableTimesMs]);
    const declaredTimes = array(shot.availableTimesMs, `shot ${shotNumber} availableTimesMs`, MAX_FRAMES_PER_SHOT)
      .map((time, index) => integer(time, `shot ${shotNumber} availableTimesMs[${index}]`, Number.MIN_SAFE_INTEGER));
    if (declaredTimes.length !== frameCount || times.some((time, index) => time !== declaredTimes[index])) {
      throw new Error(`Shot ${shotNumber} catalog and chunk timelines disagree.`);
    }
    declaredTimes.forEach((time, index) => {
      if (index > 0 && time <= declaredTimes[index - 1]) throw new Error(`Shot ${shotNumber} times must be strictly increasing.`);
    });
    if (declaredTimes[0] !== minTimeMs || declaredTimes.at(-1) !== maxTimeMs) throw new Error(`Shot ${shotNumber} time range is inconsistent.`);
    const rawFrames = array(shot.frames, `shot ${shotNumber} frames`, MAX_FRAMES_PER_SHOT);
    if (rawFrames.length !== frameCount) throw new Error(`Shot ${shotNumber} lightweight frame summaries are incomplete.`);
    const frames = rawFrames.map((frame, index) => summaryFromCatalog(frame, shotNumber, index, declaredTimes[index], extent));
    const gaps = array(shot.gaps ?? [], `shot ${shotNumber} gaps`, frameCount).map((gap, index) => parseGap(gap, `shot ${shotNumber} gaps[${index}]`));
    const normalized: EfitShotManifest = {
      shot: shotNumber,
      sourceKind,
      geometryId: shotGeometryId,
      catalog: metadata,
      frameCount,
      minTimeMs,
      maxTimeMs,
      gaps,
      frames,
      topologyGraph: { shotId, reconstructionId, chunks },
    };
    sourceByShot.set(shotNumber, normalized);
    return normalized;
  }).sort((left, right) => left.shot - right.shot);
  if (shots.length === 0) throw new Error('EFIT v2 catalog has no shots.');
  if (new Set(shots.map((shot) => shot.shot)).size !== shots.length) throw new Error('EFIT v2 catalog has duplicate shot numbers.');
  const manifest: EfitManifest = {
    schema: 'fusion.efit.catalog.v2',
    device: text(device.displayName ?? device.id, 'device.displayName', 160),
    generatedAt: optionalText(raw.generatedAt),
    psiNLevels: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    geometry: defaultGeometry,
    geometries: geometries.filter((geometry) => geometry.geometryId !== defaultGeometryId),
    numericQuantization,
    shots,
  };
  return { manifest, sourceByShot };
}

async function digestHex(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify EFIT SHA-256 assets.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyGeometryCoordinateHash(geometry: EfitGeometry): Promise<void> {
  if (!geometry.canonicalSha256F64LE) return;
  const count = geometry.limiterRzM.validPoints;
  const bytes = new ArrayBuffer(count * 16);
  const view = new DataView(bytes);
  for (let index = 0; index < count; index += 1) {
    view.setFloat64(index * 16, Number(geometry.limiterRzM.rM[index]), true);
    view.setFloat64(index * 16 + 8, Number(geometry.limiterRzM.zM[index]), true);
  }
  if (await digestHex(bytes) !== geometry.canonicalSha256F64LE.toLowerCase()) {
    throw new Error(`EFIT geometry ${geometry.geometryId ?? '(unknown)'} canonical coordinate hash mismatch.`);
  }
}

async function decompressGzipText(bytes: ArrayBuffer, signal?: AbortSignal): Promise<string> {
  checkAborted(signal);
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decode EFIT gzip chunks.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let decodedBytes = 0;
  let result = '';
  try {
    while (true) {
      checkAborted(signal);
      const next = await reader.read();
      if (next.done) break;
      decodedBytes += next.value.byteLength;
      if (decodedBytes > MAX_DECOMPRESSED_CHUNK_BYTES) throw new Error('EFIT topology chunk exceeds its decompressed capacity.');
      result += decoder.decode(next.value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}

function qualityFromPayload(payload: EfitTopologyGraphFramePayload): EfitQuality {
  const state: EfitQualityState = payload.quality.validity === 'usable'
    ? 'good'
    : payload.quality.validity === 'partial' ? 'warning' : 'invalid';
  return {
    flags: 0,
    state,
    messages: payload.quality.flags.length > 0
      ? payload.quality.flags.map((flag) => `EFIT v2 · ${flag}`)
      : ['EFIT v2 拓扑图通过帧级边界检查。'],
  };
}

function contourFromSurface(surface: EfitTopologyGraphFramePayload['closedFluxSurfaces'][number]): EfitContour {
  const pointCount = surface.pointsRzM.length / 2;
  const rM = new Float32Array(pointCount);
  const zM = new Float32Array(pointCount);
  for (let index = 0; index < pointCount; index += 1) {
    rM[index] = Number(surface.pointsRzM[index * 2]);
    zM[index] = Number(surface.pointsRzM[index * 2 + 1]);
  }
  return {
    rM,
    zM,
    validPoints: pointCount,
    psiN: surface.psiN,
    kind: surface.source === 'g-eqdsk-boundary-polyline' ? 'lcfs' : 'surface',
    closed: true,
  };
}

function frameFromPayload(payload: EfitTopologyGraphFramePayload, shot: EfitShotId, index: number): EfitFrame {
  const contours = payload.closedFluxSurfaces.map(contourFromSurface);
  const lcfs = contours.find((contour) => contour.kind === 'lcfs');
  const sourceLcfs = payload.closedFluxSurfaces.find((surface) => surface.source === 'g-eqdsk-boundary-polyline');
  const lcfsRValues = sourceLcfs
    ? Array.from({ length: sourceLcfs.pointsRzM.length / 2 }, (_, pointIndex) => Number(sourceLcfs.pointsRzM[pointIndex * 2]))
      .filter(Number.isFinite)
    : [];
  const quality = qualityFromPayload(payload);
  return {
    shot,
    index,
    timeMs: payload.timeMs,
    quality,
    currentA: payload.scalars.currentA,
    rAxisM: payload.scalars.rAxisM,
    zAxisM: payload.scalars.zAxisM,
    bcentrT: payload.scalars.bcentrT,
    psiAxisWbPerRad: payload.scalars.psiAxisWbPerRad,
    psiBoundaryWbPerRad: payload.scalars.psiBoundaryWbPerRad,
    q95: payload.scalars.q95 ?? undefined,
    efitError: payload.scalars.efitError ?? undefined,
    iconvr: payload.scalars.iconvr ?? undefined,
    lcfsRMinM: lcfsRValues.length > 1 ? Math.min(...lcfsRValues) : null,
    lcfsRMaxM: lcfsRValues.length > 1 ? Math.max(...lcfsRValues) : null,
    surfaceMask: contours.reduce((mask, _contour, contourIndex) => contourIndex < 31 ? mask | (1 << contourIndex) : mask, 0) >>> 0,
    lcfsValidPoints: lcfs?.validPoints ?? 0,
    offsetBytes: 0,
    contours,
    topologyGraphPayload: payload,
  };
}

function assertPayloadMatchesSummary(payload: EfitTopologyGraphFramePayload, summary: EfitFrameSummary): void {
  const scalarPairs: readonly [string, number, number][] = [
    ['currentA', payload.scalars.currentA, summary.currentA],
    ['rAxisM', payload.scalars.rAxisM, summary.rAxisM],
    ['zAxisM', payload.scalars.zAxisM, summary.zAxisM],
    ['bcentrT', payload.scalars.bcentrT, summary.bcentrT],
  ];
  scalarPairs.forEach(([label, payloadValue, summaryValue]) => {
    if (payloadValue !== summaryValue) throw new Error(`EFIT topology chunk ${label} disagrees with its catalog timeline summary.`);
  });
  const payloadQ95 = payload.scalars.q95 ?? undefined;
  if (payloadQ95 !== summary.q95) throw new Error('EFIT topology chunk q95 disagrees with its catalog timeline summary.');
  const sourceLcfs = payload.closedFluxSurfaces.find((surface) => surface.source === 'g-eqdsk-boundary-polyline');
  const radialValues = sourceLcfs
    ? Array.from({ length: sourceLcfs.pointsRzM.length / 2 }, (_, index) => Number(sourceLcfs.pointsRzM[index * 2])).filter(Number.isFinite)
    : [];
  const lcfsRMinM = radialValues.length > 1 ? Math.min(...radialValues) : null;
  const lcfsRMaxM = radialValues.length > 1 ? Math.max(...radialValues) : null;
  if (lcfsRMinM !== summary.lcfsRMinM || lcfsRMaxM !== summary.lcfsRMaxM) {
    throw new Error('EFIT topology chunk LCFS extrema disagree with its catalog timeline summary.');
  }
  if (payload.quality.validity !== summary.qualityValidity
    || payload.quality.flags.length !== summary.qualityFlags?.length
    || payload.quality.flags.some((flag, index) => flag !== summary.qualityFlags?.[index])) {
    throw new Error('EFIT topology chunk quality evidence disagrees with its catalog timeline summary.');
  }
}

export function createEfitHybridDataSource(options: EfitHybridDataSourceOptions = {}): EfitDataSource {
  const indexUrl = canonicalIndexUrl(options.indexUrl ?? DEFAULT_V2_INDEX_URL);
  const legacyIndexUrl = canonicalIndexUrl(options.legacyIndexUrl ?? DEFAULT_LEGACY_INDEX_URL, 'legacy.json');
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const legacySource = createEfitBinaryDataSource({
    indexUrl: legacyIndexUrl,
    fetch: fetcher,
    maxCachedFrames: options.maxCachedLegacyFrames,
  });
  const configuredCacheSize = options.maxCachedChunks;
  const maxCachedChunks = Number.isInteger(configuredCacheSize)
    ? Math.min(64, Math.max(1, configuredCacheSize as number))
    : 8;
  let catalogPromise: Promise<NormalizedGraphCatalog> | null = null;
  let legacyFallback = false;
  const chunkCache = new Map<string, readonly EfitTopologyGraphFramePayload[]>();
  const pendingChunks = new Map<string, Promise<readonly EfitTopologyGraphFramePayload[]>>();

  async function loadCatalog(request: EfitDataRequest = {}): Promise<NormalizedGraphCatalog> {
    checkAborted(request.signal);
    if (!catalogPromise) {
      catalogPromise = (async () => {
        const response = await fetcher(indexUrl, { signal: request.signal });
        if (response.status === 404) {
          legacyFallback = true;
          const manifest = await legacySource.loadManifest(request);
          return { manifest, sourceByShot: new Map(manifest.shots.map((shot) => [shot.shot, shot])) };
        }
        if (!response.ok) throw new Error(`EFIT v2 catalog request failed (${response.status}).`);
        const raw = await response.json();
        const legacyManifest = await legacySource.loadManifest(request);
        const normalized = normalizeEfitHybridCatalog(raw, legacyManifest, indexUrl, legacyIndexUrl);
        await Promise.all([
          verifyGeometryCoordinateHash(normalized.manifest.geometry),
          ...(normalized.manifest.geometries ?? []).map(verifyGeometryCoordinateHash),
        ]);
        return normalized;
      })().catch((error) => {
        catalogPromise = null;
        throw error;
      });
    }
    const result = await catalogPromise;
    checkAborted(request.signal);
    return result;
  }

  function rememberChunk(key: string, frames: readonly EfitTopologyGraphFramePayload[]): void {
    chunkCache.delete(key);
    chunkCache.set(key, frames);
    while (chunkCache.size > maxCachedChunks) {
      const oldest = chunkCache.keys().next().value as string | undefined;
      if (!oldest) break;
      chunkCache.delete(oldest);
    }
  }

  async function loadChunk(
    chunk: EfitTopologyGraphChunkDescriptor,
    shot: EfitShotManifest,
    geometry: EfitGeometry,
    numericQuantization: EfitNumericQuantizationContract,
    signal?: AbortSignal,
  ): Promise<readonly EfitTopologyGraphFramePayload[]> {
    const key = `${chunk.url}:${chunk.sha256}`;
    const cached = chunkCache.get(key);
    if (cached) {
      checkAborted(signal);
      rememberChunk(key, cached);
      return cached;
    }
    checkAborted(signal);
    const existing = pendingChunks.get(key);
    if (existing) return raceWithAbort(existing, signal);
    // Chunk fetch/decode is shared by playback, lookahead and scrubbing. A
    // caller abort only stops waiting; it must not cancel work another caller
    // is already relying on or cause duplicate network/decompression work.
    const pending = (async () => {
      const response = await fetcher(chunk.url);
      if (!response.ok) throw new Error(`EFIT topology chunk request failed (${response.status}).`);
      if (response.headers.get('content-encoding')) {
        throw new Error('EFIT topology proxy must expose raw gzip bytes for hash verification.');
      }
      const responseType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
      if (responseType !== chunk.contentType) throw new Error('EFIT topology chunk content type mismatch.');
      const responseLength = response.headers.get('content-length');
      if (responseLength !== null && Number(responseLength) !== chunk.byteLength) throw new Error('EFIT topology chunk Content-Length mismatch.');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== chunk.byteLength) throw new Error('EFIT topology chunk byte length mismatch.');
      const gzipHeader = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 10));
      if (gzipHeader.length < 10 || gzipHeader[0] !== 0x1f || gzipHeader[1] !== 0x8b || gzipHeader[2] !== 8
        || gzipHeader[4] !== 0 || gzipHeader[5] !== 0 || gzipHeader[6] !== 0 || gzipHeader[7] !== 0) {
        throw new Error('EFIT topology chunk is not the reviewed deterministic raw-gzip format.');
      }
      if (await digestHex(bytes) !== chunk.sha256) throw new Error('EFIT topology chunk SHA-256 mismatch.');
      const decoded = await decompressGzipText(bytes);
      const lines = decoded.split(/\r?\n/).filter((line) => line.length > 0);
      if (lines.length !== chunk.frameCount) throw new Error('EFIT topology chunk frame count mismatch.');
      const descriptor = shot.topologyGraph;
      if (!descriptor) throw new Error(`Shot ${shot.shot} has no topology graph descriptor.`);
      const frames = lines.map((line, localIndex) => {
        if (new TextEncoder().encode(line).byteLength > 4 * 1024 * 1024) {
          throw new Error(`EFIT topology chunk frame ${localIndex} exceeds its line budget.`);
        }
        let value: unknown;
        try {
          value = JSON.parse(line) as unknown;
        } catch {
          throw new Error(`EFIT topology chunk contains invalid NDJSON at frame ${localIndex}.`);
        }
        return validateEfitTopologyGraphFrame(value, {
          geometry,
          numericQuantization,
          expectedShotId: descriptor.shotId,
          expectedReconstructionId: descriptor.reconstructionId,
          expectedTimeMs: chunk.availableTimesMs[localIndex],
        });
      });
      rememberChunk(key, frames);
      return frames;
    })().finally(() => pendingChunks.delete(key));
    pendingChunks.set(key, pending);
    return raceWithAbort(pending, signal);
  }

  async function loadFrame(shotId: EfitShotId, frameIndex: number, request: EfitDataRequest = {}): Promise<EfitFrame> {
    const catalog = await loadCatalog(request);
    const shot = catalog.sourceByShot.get(shotId);
    if (!shot) throw new Error(`EFIT shot ${shotId} is not present in the v2 catalog.`);
    if (legacyFallback || shot.sourceKind !== 'topology-graph-v2') return legacySource.loadFrame(shotId, frameIndex, request);
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= shot.frameCount) throw new Error(`EFIT shot ${shotId} has no frame ${frameIndex}.`);
    const geometry = shot.geometryId === catalog.manifest.geometry.geometryId
      ? catalog.manifest.geometry
      : catalog.manifest.geometries?.find((candidate) => candidate.geometryId === shot.geometryId);
    if (!geometry) throw new Error(`EFIT shot ${shotId} references an unavailable geometry.`);
    const numericQuantization = catalog.manifest.numericQuantization;
    if (!numericQuantization) throw new Error('EFIT v2 catalog is missing its numeric quantization contract.');
    const chunk = shot.topologyGraph?.chunks.find((candidate) => frameIndex >= candidate.frameStart
      && frameIndex < candidate.frameStart + candidate.frameCount);
    if (!chunk) throw new Error(`EFIT shot ${shotId} frame ${frameIndex} has no chunk descriptor.`);
    const payloads = await loadChunk(chunk, shot, geometry, numericQuantization, request.signal);
    const payload = payloads[frameIndex - chunk.frameStart];
    if (!payload) throw new Error(`EFIT shot ${shotId} frame ${frameIndex} is missing from its chunk.`);
    const summary = shot.frames[frameIndex];
    if (!summary) throw new Error(`EFIT shot ${shotId} frame ${frameIndex} has no timeline summary.`);
    assertPayloadMatchesSummary(payload, summary);
    return frameFromPayload(payload, shotId, frameIndex);
  }

  return {
    async loadManifest(request = {}) {
      return (await loadCatalog(request)).manifest;
    },
    async loadTimeline(shotId, request = {}) {
      const catalog = await loadCatalog(request);
      const shot = catalog.sourceByShot.get(shotId);
      if (!shot) throw new Error(`EFIT shot ${shotId} is not present in the v2 catalog.`);
      return legacyFallback || shot.sourceKind !== 'topology-graph-v2'
        ? legacySource.loadTimeline(shotId, request)
        : shot.frames;
    },
    loadFrame,
    prefetchFrame(shotId, frameIndex) {
      void loadFrame(shotId, frameIndex).catch(() => undefined);
    },
  };
}
