import type {
  EfitBinaryDescriptor,
  EfitContour,
  EfitDataRequest,
  EfitDataSource,
  EfitFrame,
  EfitFrameSummary,
  EfitGap,
  EfitGeometry,
  EfitManifest,
  EfitQuality,
  EfitRzPolyline,
  EfitShotCatalogMetadata,
  EfitShotId,
  EfitShotManifest,
  EfitTopology,
  EfitTopologyBinaryDescriptor,
  EfitTopologyKind,
} from './types';

const DEFAULT_INDEX_URL = '/device-data/exl50u-efit/index.json';
const EXPECTED_MAGIC = 'EXL50EF1';
const DEFAULT_FILE_HEADER_BYTES = 64;
const DEFAULT_FRAME_HEADER_BYTES = 64;
const DEFAULT_FRAME_STRIDE_BYTES = 10_304;
const DEFAULT_SURFACE_COUNT = 9;
const DEFAULT_POINTS_PER_CONTOUR = 128;
const TOPOLOGY_MAGIC = 'EXL50TP1';
const TOPOLOGY_FILE_HEADER_BYTES = 64;
const TOPOLOGY_FRAME_HEADER_BYTES = 160;
const TOPOLOGY_FRAME_STRIDE_BYTES = 2_208;
const TOPOLOGY_MAX_LEGS = 4;
const TOPOLOGY_POINTS_PER_LEG = 64;
const TOPOLOGY_MAX_X_POINTS = 2;
const TOPOLOGY_MAX_STRIKE_POINTS = 4;
const TOPOLOGY_KNOWN_FLAGS_MASK = (1 << 11) - 1;
const TOPOLOGY_KNOWN_STRIKE_FLAGS_MASK = (1 << 2) - 1;
const PSI_N_LEVELS = Object.freeze([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
const SOURCE_VALID_FLAG = 1 << 0;
const TOPOLOGY_KINDS: Readonly<Record<number, EfitTopologyKind>> = Object.freeze({
  0: 'unknown',
  1: 'limited',
  2: 'upper-single-null',
  3: 'lower-single-null',
  4: 'double-null',
  5: 'near-double-null',
  6: 'partial',
});
const QUALITY_FLAGS = Object.freeze([
  [1 << 1, '前一帧存在真实时间间隙。'],
  [1 << 2, '等离子体电流绝对值低于 50 kA。'],
  [1 << 3, '等离子体电流为负值。'],
  [1 << 4, '重建结果含负压力区域。'],
  [1 << 5, '安全因子超出常用显示范围。'],
  [1 << 6, '本帧缺少 LCFS。'],
  [1 << 7, '本帧归一化磁面不完整。'],
  [1 << 8, '本帧缺少 q95。'],
  [1 << 9, 'EFIT 未报告收敛。'],
  [1 << 10, 'EFIT 元数据不完整。'],
] as const);

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type JsonRecord = Record<string, unknown>;
type LegacyShotManifest = EfitShotManifest & { binary: EfitBinaryDescriptor };

function resolvedShotGeometry(
  manifest: Pick<EfitManifest, 'geometry' | 'geometries'>,
  shot: Pick<EfitShotManifest, 'geometryId'>,
): EfitGeometry | null {
  if (!shot.geometryId) return manifest.geometry;
  if (manifest.geometry.geometryId === shot.geometryId) return manifest.geometry;
  return manifest.geometries?.find((geometry) => geometry.geometryId === shot.geometryId) ?? null;
}

export type EfitBinaryDataSourceOptions = {
  indexUrl?: string;
  fetch?: FetchLike;
  maxCachedFrames?: number;
};

export type EfitBinaryContractSummary = {
  manifest: EfitManifest;
  header: {
    magic: string;
    shot: number;
    frameCount: number;
    frameStrideBytes: number;
    frameHeaderBytes: number;
    surfaceCount: number;
    pointsPerContour: number;
    fileHeaderBytes: number;
  };
  frame: EfitFrame;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = Number.NaN): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function integer(value: unknown, fallback = 0): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(value)) return value;
  throw new Error('EFIT integer field is malformed.');
}

function optionalFinite(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalUnsignedInteger(value: unknown, maximum = 0xffff_ffff): number | undefined {
  return typeof value === 'number'
    && Number.isFinite(value)
    && Number.isInteger(value)
    && value >= 0
    && value <= maximum
    ? value
    : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function optionalBoundedString(value: unknown, maximum = 120): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : undefined;
}

function geometryId(value: unknown): string | undefined {
  const id = optionalBoundedString(value, 64);
  return id && /^[a-z0-9][a-z0-9._-]*$/i.test(id) ? id : undefined;
}

function normalizeShotCatalog(raw: JsonRecord): EfitShotCatalogMetadata {
  const nested = isRecord(raw.catalog) ? raw.catalog : {};
  const qualityState = optionalBoundedString(nested.qualityState ?? raw.qualityState, 16);
  return {
    datasetId: geometryId(nested.datasetId ?? raw.datasetId),
    datasetLabel: optionalBoundedString(nested.datasetLabel ?? raw.datasetLabel),
    reconstructionLabel: optionalBoundedString(nested.reconstructionLabel ?? raw.reconstructionLabel),
    qualityLabel: optionalBoundedString(nested.qualityLabel ?? raw.qualityLabel),
    qualityState: qualityState === 'good' || qualityState === 'warning' || qualityState === 'invalid' || qualityState === 'missing'
      ? qualityState
      : undefined,
  };
}

function canonicalIndexUrl(value: string): string {
  if (!/^\/device-data\/[a-z0-9-]+\/[a-z0-9._-]+\.json$/i.test(value)
    || value.includes('..') || value.includes('%') || value.includes('//') || value.includes('?') || value.includes('#')) {
    throw new Error('EFIT index URL must be a canonical same-origin controlled device-data path.');
  }
  return value;
}

function qualityFrom(flags: number, surfaceMask: number, lcfsValidPoints: number): EfitQuality {
  const messages: string[] = [];
  let state: EfitQuality['state'] = (flags & SOURCE_VALID_FLAG) !== 0 ? 'good' : 'invalid';

  if ((flags & SOURCE_VALID_FLAG) === 0) messages.push('源 G-EQDSK 帧未通过有效性检查。');

  if (surfaceMask === 0 && lcfsValidPoints === 0) {
    state = 'invalid';
    messages.push('本帧没有可用磁面或 LCFS。');
  } else if (lcfsValidPoints === 0) {
    state = 'warning';
    messages.push('本帧未提供有效 LCFS。');
  }

  for (const [bit, message] of QUALITY_FLAGS) {
    if ((flags & bit) === 0) continue;
    if (state === 'good') state = 'warning';
    messages.push(message);
  }

  return { flags, state, messages };
}

function parseFlatRz(value: unknown): EfitRzPolyline {
  if (!Array.isArray(value) || value.length % 2 !== 0) {
    throw new Error('EFIT geometry must contain complete R-Z coordinate pairs.');
  }
  const flat = value;
  const count = Math.floor(flat.length / 2);
  const rM = new Float32Array(count);
  const zM = new Float32Array(count);
  let validPoints = 0;

  for (let index = 0; index < count; index += 1) {
    const r = finiteNumber(flat[index * 2]);
    const z = finiteNumber(flat[index * 2 + 1]);
    rM[index] = r;
    zM[index] = z;
    if (Number.isFinite(r) && Number.isFinite(z)) validPoints = index + 1;
  }

  return { rM, zM, validPoints };
}

function normalizeGap(value: unknown): EfitGap | null {
  if (!isRecord(value)) return null;
  const afterMs = finiteNumber(value.afterMs);
  const beforeMs = finiteNumber(value.beforeMs);
  if (!Number.isFinite(afterMs) || !Number.isFinite(beforeMs) || beforeMs <= afterMs) return null;
  return {
    afterMs,
    beforeMs,
    missingCount: optionalFinite(value.missingCount),
    reason: typeof value.reason === 'string' ? value.reason : undefined,
  };
}

function normalizeBinary(
  raw: JsonRecord,
  layout: JsonRecord,
  indexUrl: string,
  shot: EfitShotId,
): EfitBinaryDescriptor {
  const nested = isRecord(raw.binary) ? raw.binary : {};
  const asset = stringValue(
    nested.url ?? nested.path ?? raw.binaryUrl,
    `shot-${shot}.bin`,
  );
  const descriptor: EfitBinaryDescriptor = {
    url: resolveAssetUrl(indexUrl, asset),
    byteLength: optionalFinite(nested.byteLength),
    sha256: typeof nested.sha256 === 'string' ? nested.sha256 : undefined,
    fileHeaderBytes: integer(nested.fileHeaderBytes ?? nested.headerBytes ?? layout.fileHeaderBytes, DEFAULT_FILE_HEADER_BYTES),
    frameHeaderBytes: integer(nested.frameHeaderBytes ?? layout.frameHeaderBytes, DEFAULT_FRAME_HEADER_BYTES),
    frameStrideBytes: integer(nested.frameStrideBytes ?? layout.frameStrideBytes, DEFAULT_FRAME_STRIDE_BYTES),
    surfaceCount: integer(nested.surfaceCount ?? layout.surfaceCount ?? (Array.isArray(layout.surfacePsiN) ? layout.surfacePsiN.length : undefined), DEFAULT_SURFACE_COUNT),
    pointsPerContour: integer(nested.pointsPerContour ?? nested.points ?? layout.contourPoints, DEFAULT_POINTS_PER_CONTOUR),
  };
  if (descriptor.fileHeaderBytes !== DEFAULT_FILE_HEADER_BYTES
    || descriptor.frameHeaderBytes !== DEFAULT_FRAME_HEADER_BYTES
    || descriptor.frameStrideBytes !== DEFAULT_FRAME_STRIDE_BYTES
    || descriptor.surfaceCount !== DEFAULT_SURFACE_COUNT
    || descriptor.pointsPerContour !== DEFAULT_POINTS_PER_CONTOUR) {
    throw new Error(`EFIT shot ${shot} does not match the reviewed EXL50EF1 binary layout.`);
  }
  if (descriptor.sha256 !== undefined && !/^[a-f0-9]{64}$/i.test(descriptor.sha256)) {
    throw new Error(`EFIT shot ${shot} has an invalid SHA-256.`);
  }
  return descriptor;
}

function normalizeTopologyBinary(
  raw: JsonRecord,
  indexUrl: string,
  shot: EfitShotId,
  frameCount: number,
  baseBinary: EfitBinaryDescriptor,
): EfitTopologyBinaryDescriptor | undefined {
  if (!isRecord(raw.topologyBinary)) return undefined;
  const nested = raw.topologyBinary;
  const descriptor: EfitTopologyBinaryDescriptor = {
    url: resolveAssetUrl(indexUrl, stringValue(nested.url ?? nested.path, `shot-${shot}-topology.bin`)),
    byteLength: integer(nested.byteLength),
    sha256: stringValue(nested.sha256, ''),
    baseBinarySha256: stringValue(nested.baseBinarySha256, ''),
    baseSha256PrefixHex: stringValue(nested.baseSha256PrefixHex, ''),
    fileHeaderBytes: integer(nested.fileHeaderBytes, TOPOLOGY_FILE_HEADER_BYTES) as 64,
    frameHeaderBytes: integer(nested.frameHeaderBytes, TOPOLOGY_FRAME_HEADER_BYTES) as 160,
    frameStrideBytes: integer(nested.frameStrideBytes, TOPOLOGY_FRAME_STRIDE_BYTES) as 2208,
    maxSeparatrixLegs: TOPOLOGY_MAX_LEGS,
    pointsPerLeg: TOPOLOGY_POINTS_PER_LEG,
    maxXPoints: TOPOLOGY_MAX_X_POINTS,
    maxStrikePoints: TOPOLOGY_MAX_STRIKE_POINTS,
  };
  if (descriptor.fileHeaderBytes !== TOPOLOGY_FILE_HEADER_BYTES
    || descriptor.frameHeaderBytes !== TOPOLOGY_FRAME_HEADER_BYTES
    || descriptor.frameStrideBytes !== TOPOLOGY_FRAME_STRIDE_BYTES) {
    throw new Error(`EFIT shot ${shot} topology sidecar does not match the reviewed EXL50TP1 layout.`);
  }
  const expectedBytes = TOPOLOGY_FILE_HEADER_BYTES + frameCount * TOPOLOGY_FRAME_STRIDE_BYTES;
  if (descriptor.byteLength !== expectedBytes) throw new Error(`EFIT shot ${shot} topology byte length is inconsistent.`);
  if (!/^[a-f0-9]{64}$/i.test(descriptor.sha256)
    || !/^[a-f0-9]{64}$/i.test(descriptor.baseBinarySha256)
    || !/^[a-f0-9]{32}$/i.test(descriptor.baseSha256PrefixHex)) {
    throw new Error(`EFIT shot ${shot} topology sidecar has an invalid hash binding.`);
  }
  if (!baseBinary.sha256 || descriptor.baseBinarySha256.toLowerCase() !== baseBinary.sha256.toLowerCase()
    || descriptor.baseSha256PrefixHex.toLowerCase() !== descriptor.baseBinarySha256.slice(0, 32).toLowerCase()) {
    throw new Error(`EFIT shot ${shot} topology sidecar is not bound to its reviewed base binary.`);
  }
  return descriptor;
}

function topologyKind(value: unknown): EfitTopologyKind | undefined {
  if (typeof value !== 'string') return undefined;
  return Object.values(TOPOLOGY_KINDS).includes(value as EfitTopologyKind)
    ? value as EfitTopologyKind
    : undefined;
}

function normalizeSummary(raw: unknown, shot: EfitShotId, index: number, binary: EfitBinaryDescriptor): EfitFrameSummary {
  const record = isRecord(raw) ? raw : {};
  const flags = integer(record.qualityFlags ?? record.flags, 0) >>> 0;
  const surfaceMask = integer(record.surfaceMask, (1 << binary.surfaceCount) - 1) >>> 0;
  const lcfsValidPoints = integer(record.lcfsValidPoints ?? record.lcfsValid, binary.pointsPerContour);
  return {
    shot,
    index,
    timeMs: integer(record.timeMs, index),
    quality: qualityFrom(flags, surfaceMask, lcfsValidPoints),
    currentA: finiteNumber(record.currentA),
    rAxisM: finiteNumber(record.rAxisM),
    zAxisM: finiteNumber(record.zAxisM),
    bcentrT: finiteNumber(record.bcentrT),
    psiAxisWbPerRad: finiteNumber(record.psiAxisWbPerRad ?? record.psiAxis),
    psiBoundaryWbPerRad: finiteNumber(record.psiBoundaryWbPerRad ?? record.psiBoundary),
    q95: optionalFinite(record.q95),
    efitError: optionalFinite(record.efitError),
    iconvr: optionalFinite(record.iconvr),
    surfaceMask,
    lcfsValidPoints,
    offsetBytes: integer(
      record.offsetBytes,
      binary.fileHeaderBytes + index * binary.frameStrideBytes,
    ),
    topologyKind: topologyKind(record.topologyKind),
    topologyFlags: optionalUnsignedInteger(record.topologyFlags),
    xPointCount: optionalUnsignedInteger(record.xPointCount, TOPOLOGY_MAX_X_POINTS),
    strikePointCount: optionalUnsignedInteger(record.strikePointCount, TOPOLOGY_MAX_STRIKE_POINTS),
    separatrixLegCount: optionalUnsignedInteger(record.separatrixLegCount, TOPOLOGY_MAX_LEGS),
  };
}

function normalizeShot(raw: unknown, layout: JsonRecord, indexUrl: string): LegacyShotManifest {
  if (!isRecord(raw)) throw new Error('EFIT index contains an invalid shot record.');
  const shot = integer(raw.shot, Number.NaN);
  if (!Number.isFinite(shot)) throw new Error('EFIT shot number is missing.');
  const shotGeometryId = geometryId(raw.geometryId);
  if (raw.geometryId !== undefined && !shotGeometryId) {
    throw new Error(`EFIT shot ${shot} has an invalid geometry id.`);
  }
  const binary = normalizeBinary(raw, layout, indexUrl, shot);
  const rawFrames = Array.isArray(raw.frames) ? raw.frames : [];
  const rawTimes = Array.isArray(raw.availableTimesMs) ? raw.availableTimesMs : [];
  const expectedCount = integer(raw.frameCount, 0);
  if (expectedCount <= 0 || expectedCount > 20_000
    || rawFrames.length !== expectedCount
    || (rawTimes.length > 0 && rawTimes.length !== expectedCount)) {
    throw new Error(`EFIT shot ${shot} has an invalid or inconsistent frame count.`);
  }
  const topologyBinary = normalizeTopologyBinary(raw, indexUrl, shot, expectedCount, binary);
  const frames = Array.from({ length: expectedCount }, (_, frameIndex) => {
    const frame = isRecord(rawFrames[frameIndex])
      ? rawFrames[frameIndex]
      : { timeMs: rawTimes[frameIndex] };
    return normalizeSummary(frame, shot, frameIndex, binary);
  });
  frames.forEach((frame, frameIndex) => {
    const expectedOffset = binary.fileHeaderBytes + frameIndex * binary.frameStrideBytes;
    if (frame.offsetBytes !== expectedOffset) throw new Error(`EFIT shot ${shot} frame ${frameIndex} has an invalid byte offset.`);
    if (rawTimes.length > 0 && integer(rawTimes[frameIndex], Number.NaN) !== frame.timeMs) {
      throw new Error(`EFIT shot ${shot} availableTimesMs does not match frame ${frameIndex}.`);
    }
    if (frameIndex > 0 && frame.timeMs <= frames[frameIndex - 1].timeMs) {
      throw new Error(`EFIT shot ${shot} frame times must be strictly increasing.`);
    }
    if (topologyBinary && (frame.topologyKind === undefined
      || frame.topologyFlags === undefined
      || frame.xPointCount === undefined
      || frame.strikePointCount === undefined
      || frame.separatrixLegCount === undefined
      || (frame.topologyFlags & ~TOPOLOGY_KNOWN_FLAGS_MASK) !== 0)) {
      throw new Error(`EFIT shot ${shot} topology summary is incomplete or invalid for frame ${frameIndex}.`);
    }
  });
  const expectedBytes = binary.fileHeaderBytes + expectedCount * binary.frameStrideBytes;
  if (binary.byteLength !== undefined && binary.byteLength !== expectedBytes) {
    throw new Error(`EFIT shot ${shot} binary byte length does not match its frame contract.`);
  }

  const range = Array.isArray(raw.timeRangeMs) ? raw.timeRangeMs : [];
  const minTimeMs = frames[0]?.timeMs ?? finiteNumber(range[0], finiteNumber(raw.minTimeMs, 0));
  const maxTimeMs = frames.at(-1)?.timeMs ?? finiteNumber(range[1], finiteNumber(raw.maxTimeMs, minTimeMs));
  const gaps = (Array.isArray(raw.gaps) ? raw.gaps : [])
    .map(normalizeGap)
    .filter((gap): gap is EfitGap => gap !== null);

  return {
    shot,
    sourceKind: 'legacy-contours-v1',
    geometryId: shotGeometryId,
    catalog: normalizeShotCatalog(raw),
    frameCount: frames.length,
    minTimeMs,
    maxTimeMs,
    gaps,
    frames,
    binary,
    topologyBinary,
  };
}

function normalizeGeometry(
  raw: JsonRecord,
  fallback: {
    geometryId?: string;
    extent?: readonly [number, number, number, number];
    coordinateSystem?: string;
    cadRegistration?: EfitGeometry['cadRegistration'];
  } = {},
): EfitGeometry {
  const limiterRzM = parseFlatRz(raw.coordinatesRzM ?? raw.limiterRzM);
  const flatExtent = Array.isArray(raw.gridExtentM) ? raw.gridExtentM : [];
  const extent = flatExtent.length >= 4
    ? [finiteNumber(flatExtent[0]), finiteNumber(flatExtent[1]), finiteNumber(flatExtent[2]), finiteNumber(flatExtent[3])] as const
    : fallback.extent;
  const first: readonly [number, number] | undefined = limiterRzM.validPoints > 0
    ? [Number(limiterRzM.rM[0]), Number(limiterRzM.zM[0])]
    : undefined;
  const lastIndex = limiterRzM.validPoints - 1;
  const last: readonly [number, number] | undefined = lastIndex >= 0
    ? [Number(limiterRzM.rM[lastIndex]), Number(limiterRzM.zM[lastIndex])]
    : undefined;
  const inferredClosed = Boolean(first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-7);
  const declaredClosed = typeof raw.closed === 'boolean'
    ? raw.closed
    : typeof raw.limiterClosed === 'boolean' ? raw.limiterClosed : undefined;
  const limiterClosed = declaredClosed ?? inferredClosed;
  const declaredSegments = optionalUnsignedInteger(raw.canonicalSegmentCount ?? raw.segmentCount ?? raw.limiterSegmentCount, 65_535);
  const canonicalSegmentCount = declaredSegments ?? Math.max(0, limiterRzM.validPoints - 1);
  const canonicalSha256F64LE = optionalBoundedString(raw.canonicalSha256F64LE ?? raw.canonicalSha256 ?? raw.sha256, 64);
  const canonicalPointCount = optionalUnsignedInteger(raw.canonicalPointCount ?? raw.pointCount, 8_192);
  const sourceLimiterSha256F64LE = optionalBoundedString(raw.sourceLimiterSha256F64LE, 64);
  const sourcePointCount = optionalUnsignedInteger(raw.sourcePointCount, 65_535);
  const orientation = raw.orientation === 'counter-clockwise' || raw.orientation === 'clockwise' ? raw.orientation : undefined;
  const startPointRule = optionalBoundedString(raw.startPointRule ?? raw.startRule);
  const cadRegistration = typeof raw.cadRegistration === 'string'
    ? { description: raw.cadRegistration }
    : isRecord(raw.cadRegistration) ? raw.cadRegistration : fallback.cadRegistration;
  const normalized: EfitGeometry = {
    geometryId: geometryId(raw.geometryId ?? raw.id) ?? fallback.geometryId,
    limiterRzM,
    closed: limiterClosed,
    canonicalSegmentCount,
    canonicalSha256F64LE,
    canonicalPointCount,
    sourceLimiterSha256F64LE,
    sourcePointCount,
    orientation,
    startPointRule,
    gridExtentM: extent,
    coordinateSystem: optionalBoundedString(raw.coordinateSystem) ?? fallback.coordinateSystem,
    cadRegistration,
  };
  if (limiterRzM.validPoints < 2 || limiterRzM.validPoints > 8_192
    || Array.from(limiterRzM.rM).some((value) => !Number.isFinite(value) || value < 0)
    || Array.from(limiterRzM.zM).some((value) => !Number.isFinite(value))) {
    throw new Error(`EFIT geometry ${normalized.geometryId ?? '(default)'} has an invalid limiter polyline.`);
  }
  if (declaredClosed !== undefined && declaredClosed !== inferredClosed) {
    throw new Error(`EFIT geometry ${normalized.geometryId ?? '(default)'} limiter closure disagrees with its published coordinate order.`);
  }
  if (!Number.isInteger(canonicalSegmentCount) || canonicalSegmentCount !== limiterRzM.validPoints - 1) {
    throw new Error(`EFIT geometry ${normalized.geometryId ?? '(default)'} has an invalid limiter segment count.`);
  }
  if (canonicalPointCount !== undefined && canonicalPointCount !== limiterRzM.validPoints) {
    throw new Error(`EFIT geometry ${normalized.geometryId ?? '(default)'} canonical point count disagrees with its coordinates.`);
  }
  if ([canonicalSha256F64LE, sourceLimiterSha256F64LE].some((hash) => hash !== undefined && !/^[a-f0-9]{64}$/i.test(hash))) {
    throw new Error(`EFIT geometry ${normalized.geometryId ?? '(default)'} has an invalid limiter SHA-256.`);
  }
  if (sourcePointCount !== undefined && sourcePointCount < limiterRzM.validPoints - 1) {
    throw new Error(`EFIT geometry ${normalized.geometryId ?? '(default)'} has an invalid source point count.`);
  }
  if (extent && (extent.some((value) => !Number.isFinite(value)) || extent[1] <= extent[0] || extent[3] <= extent[2])) {
    throw new Error(`EFIT geometry ${normalized.geometryId ?? '(default)'} has invalid grid bounds.`);
  }
  return normalized;
}

function normalizeManifest(raw: unknown, indexUrl: string): EfitManifest {
  if (!isRecord(raw)) throw new Error('EFIT index is not a JSON object.');
  const geometry = isRecord(raw.geometry) ? raw.geometry : {};
  const layout = isRecord(raw.binaryLayout) ? raw.binaryLayout : {};
  const coordinateSystem = isRecord(raw.coordinateSystem) ? raw.coordinateSystem : {};
  const deviceRecord = isRecord(raw.device) ? raw.device : {};
  const shots = (Array.isArray(raw.shots) ? raw.shots : []).map((shot) => normalizeShot(shot, layout, indexUrl));
  if (shots.length === 0 || shots.length > 256) throw new Error('EFIT index contains an invalid number of shots.');
  if (new Set(shots.map((shot) => shot.shot)).size !== shots.length) throw new Error('EFIT index contains duplicate shot numbers.');

  const flatExtent = Array.isArray(geometry.gridExtentM) ? geometry.gridExtentM : [];
  const extentRecord = isRecord(raw.gridExtentM) ? raw.gridExtentM : {};
  const rExtent = Array.isArray(extentRecord.r) ? extentRecord.r : [];
  const zExtent = Array.isArray(extentRecord.z) ? extentRecord.z : [];
  const extent = flatExtent.length >= 4
    ? [finiteNumber(flatExtent[0]), finiteNumber(flatExtent[1]), finiteNumber(flatExtent[2]), finiteNumber(flatExtent[3])] as const
    : rExtent.length >= 2 && zExtent.length >= 2
      ? [finiteNumber(rExtent[0]), finiteNumber(rExtent[1]), finiteNumber(zExtent[0]), finiteNumber(zExtent[1])] as const
      : undefined;
  const psiNLevels = Array.isArray(layout.surfacePsiN)
    ? layout.surfacePsiN.map((value) => finiteNumber(value)).filter(Number.isFinite)
    : Array.isArray(raw.psiNLevels)
      ? raw.psiNLevels.map((value) => finiteNumber(value)).filter(Number.isFinite)
      : PSI_N_LEVELS;
  const cadRegistration = typeof coordinateSystem.cadRegistration === 'string'
    ? { description: coordinateSystem.cadRegistration }
    : isRecord(coordinateSystem.cadRegistration)
      ? coordinateSystem.cadRegistration
      : isRecord(geometry.cadRegistration)
      ? geometry.cadRegistration
      : undefined;

  const defaultGeometry = normalizeGeometry(geometry, {
    geometryId: geometryId(geometry.geometryId ?? geometry.id) ?? 'default',
    extent,
    coordinateSystem: typeof coordinateSystem.source === 'string'
      ? coordinateSystem.source
      : typeof geometry.coordinateSystem === 'string' ? geometry.coordinateSystem : undefined,
    cadRegistration,
  });
  const rawGeometryCatalog = raw.geometryCatalog ?? raw.geometries;
  const rawGeometries = Array.isArray(rawGeometryCatalog)
    ? rawGeometryCatalog
    : isRecord(rawGeometryCatalog)
      ? Object.entries(rawGeometryCatalog).map(([id, candidate]) => isRecord(candidate)
        ? { ...candidate, geometryId: candidate.geometryId ?? candidate.id ?? id }
        : candidate)
      : [];
  if (rawGeometries.length > 64) throw new Error('EFIT index contains too many geometry contracts.');
  const geometries = rawGeometries.map((candidate, index) => {
    if (!isRecord(candidate) || !geometryId(candidate.geometryId ?? candidate.id)) {
      throw new Error(`EFIT geometry ${index} is missing a valid id.`);
    }
    const normalized = normalizeGeometry(candidate, {
      extent,
      coordinateSystem: defaultGeometry.coordinateSystem,
      cadRegistration,
    });
    if (!normalized.closed
      || !normalized.canonicalSha256F64LE
      || normalized.canonicalPointCount === undefined
      || !normalized.sourceLimiterSha256F64LE
      || normalized.sourcePointCount === undefined
      || !normalized.orientation
      || !normalized.startPointRule) {
      throw new Error(`EFIT geometry ${normalized.geometryId} is missing its canonical limiter identity contract.`);
    }
    return normalized;
  });
  const geometryIds = [defaultGeometry.geometryId, ...geometries.map((candidate) => candidate.geometryId)];
  if (geometryIds.some((id) => !id) || new Set(geometryIds).size !== geometryIds.length) {
    throw new Error('EFIT index contains duplicate or missing geometry ids.');
  }
  const geometryCatalog = { geometry: defaultGeometry, geometries, shots };
  shots.forEach((shot) => {
    const shotGeometry = resolvedShotGeometry(geometryCatalog, shot);
    if (!shotGeometry) throw new Error(`EFIT shot ${shot.shot} references an unknown geometry id.`);
    if (shot.topologyBinary && !shotGeometry.gridExtentM) {
      throw new Error(`EFIT shot ${shot.shot} topology delivery requires finite grid bounds and a reviewed limiter polyline.`);
    }
  });

  return {
    schema: stringValue(raw.schemaVersion ?? raw.schema ?? raw.version, 'exl50u-efit/v1'),
    device: stringValue(deviceRecord.displayName ?? deviceRecord.id ?? raw.device, 'EXL-50U'),
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
    psiNLevels,
    geometry: defaultGeometry,
    geometries: geometries.length > 0 ? geometries : undefined,
    shots,
  };
}

function resolveAssetUrl(indexUrl: string, asset: string): string {
  const cleanIndex = canonicalIndexUrl(indexUrl);
  const base = cleanIndex.slice(0, cleanIndex.lastIndexOf('/') + 1);
  const resolved = asset.startsWith('/') ? asset : `${base}${asset}`;
  if (!resolved.startsWith(base)
    || !/^\/device-data\/[a-z0-9-]+\/[a-z0-9._-]+\.bin$/i.test(resolved)
    || resolved.includes('..') || resolved.includes('%') || resolved.includes('//') || resolved.includes('?') || resolved.includes('#')) {
    throw new Error('EFIT binary URL must remain in the index controlled device-data directory.');
  }
  return resolved;
}

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

async function fetchBytes(
  fetcher: FetchLike,
  url: string,
  start: number,
  length: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  checkAborted(signal);
  const response = await fetcher(url, {
    headers: { Range: `bytes=${start}-${start + length - 1}` },
    signal,
  });
  if (!response.ok) throw new Error(`EFIT binary request failed (${response.status}).`);
  const bytes = await response.arrayBuffer();
  checkAborted(signal);

  if (response.status === 206) {
    const contentRange = response.headers.get('content-range');
    const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(contentRange ?? '');
    if (!match
      || Number(match[1]) !== start
      || Number(match[2]) !== start + length - 1
      || bytes.byteLength !== length
      || (match[3] !== '*' && Number(match[3]) < start + length)) {
      throw new Error('EFIT Range response does not match the requested byte interval.');
    }
    return bytes;
  }
  if (bytes.byteLength >= start + length) return bytes.slice(start, start + length);
  if (bytes.byteLength === length) return bytes;
  throw new Error('Server did not honor the EFIT byte range request.');
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

function readMagic(buffer: ArrayBuffer): string {
  return new TextDecoder('ascii').decode(new Uint8Array(buffer, 0, 8));
}

function parsePolyline(view: DataView, byteOffset: number, pointCount: number): EfitRzPolyline {
  const rM = new Float32Array(pointCount);
  const zM = new Float32Array(pointCount);
  let validPoints = 0;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const offset = byteOffset + pointIndex * 8;
    const r = view.getFloat32(offset, true);
    const z = view.getFloat32(offset + 4, true);
    rM[pointIndex] = r;
    zM[pointIndex] = z;
    if (Number.isFinite(r) && Number.isFinite(z)) validPoints = pointIndex + 1;
  }
  return { rM, zM, validPoints };
}

function parseFrame(
  buffer: ArrayBuffer,
  summary: EfitFrameSummary,
  binary: EfitBinaryDescriptor,
  psiNLevels: readonly number[],
): EfitFrame {
  if (buffer.byteLength < binary.frameStrideBytes) throw new Error('EFIT frame payload is incomplete.');
  const view = new DataView(buffer);
  const timeMs = view.getInt32(0, true);
  const flags = view.getUint32(4, true);
  const surfaceMask = view.getUint16(46, true);
  const lcfsValidPoints = view.getUint16(44, true);
  if (timeMs !== summary.timeMs
    || flags !== summary.quality.flags
    || surfaceMask !== summary.surfaceMask
    || lcfsValidPoints !== summary.lcfsValidPoints
    || lcfsValidPoints > binary.pointsPerContour
    || (surfaceMask & ~((1 << binary.surfaceCount) - 1)) !== 0) {
    throw new Error(`EFIT base frame ${summary.index} disagrees with its index summary.`);
  }
  const contours: EfitContour[] = [];
  let curveOffset = binary.frameHeaderBytes;

  for (let surfaceIndex = 0; surfaceIndex < binary.surfaceCount; surfaceIndex += 1) {
    const polyline = parsePolyline(view, curveOffset, binary.pointsPerContour);
    curveOffset += binary.pointsPerContour * 8;
    if ((surfaceMask & (1 << surfaceIndex)) === 0) continue;
    contours.push({
      ...polyline,
      validPoints: Math.min(polyline.validPoints, binary.pointsPerContour),
      psiN: psiNLevels[surfaceIndex] ?? (surfaceIndex + 1) / (binary.surfaceCount + 1),
      kind: 'surface',
      closed: true,
    });
  }

  const lcfs = parsePolyline(view, curveOffset, binary.pointsPerContour);
  if (lcfsValidPoints > 1) {
    contours.push({
      ...lcfs,
      validPoints: Math.min(lcfs.validPoints, lcfsValidPoints),
      psiN: 1,
      kind: 'lcfs',
      closed: true,
    });
  }

  const q95 = view.getFloat32(32, true);
  const efitError = view.getFloat32(36, true);
  const iconvr = view.getFloat32(40, true);
  const scalarPairs = [
    [summary.currentA, view.getFloat32(8, true)],
    [summary.rAxisM, view.getFloat32(12, true)],
    [summary.zAxisM, view.getFloat32(16, true)],
    [summary.bcentrT, view.getFloat32(20, true)],
    [summary.psiAxisWbPerRad, view.getFloat32(24, true)],
    [summary.psiBoundaryWbPerRad, view.getFloat32(28, true)],
  ] as const;
  if (scalarPairs.some(([expected, actual]) => !Number.isFinite(actual) || Math.fround(expected) !== actual)
    || (summary.q95 !== undefined && Math.fround(summary.q95) !== q95)
    || (summary.efitError !== undefined && Math.fround(summary.efitError) !== efitError)
    || (summary.iconvr !== undefined && Math.fround(summary.iconvr) !== iconvr)) {
    throw new Error(`EFIT base frame ${summary.index} scalar payload disagrees with its index summary.`);
  }
  return {
    ...summary,
    timeMs,
    quality: qualityFrom(flags, surfaceMask, lcfsValidPoints),
    currentA: view.getFloat32(8, true),
    rAxisM: view.getFloat32(12, true),
    zAxisM: view.getFloat32(16, true),
    bcentrT: view.getFloat32(20, true),
    psiAxisWbPerRad: view.getFloat32(24, true),
    psiBoundaryWbPerRad: view.getFloat32(28, true),
    q95: Number.isFinite(q95) ? q95 : undefined,
    efitError: Number.isFinite(efitError) ? efitError : undefined,
    iconvr: Number.isFinite(iconvr) ? iconvr : undefined,
    surfaceMask,
    lcfsValidPoints,
    contours,
  };
}

function parseTopologyFrame(
  buffer: ArrayBuffer,
  summary: EfitFrameSummary,
  binary: EfitTopologyBinaryDescriptor,
  limiterSegmentCount: number,
  gridExtentM: readonly [number, number, number, number],
): EfitTopology {
  if (buffer.byteLength < binary.frameStrideBytes) throw new Error('EFIT topology frame payload is incomplete.');
  const view = new DataView(buffer);
  const timeMs = view.getInt32(0, true);
  const flags = view.getUint32(4, true);
  const kind = TOPOLOGY_KINDS[view.getUint8(8)];
  const xCount = view.getUint8(9);
  const strikeCount = view.getUint8(10);
  const legCount = view.getUint8(11);
  if (timeMs !== summary.timeMs || !kind
    || (flags & ~TOPOLOGY_KNOWN_FLAGS_MASK) !== 0
    || xCount > binary.maxXPoints
    || strikeCount > binary.maxStrikePoints
    || legCount > binary.maxSeparatrixLegs) {
    throw new Error(`EFIT topology frame ${summary.index} has invalid identity or record counts.`);
  }
  if (summary.topologyKind !== kind
    || summary.topologyFlags !== flags
    || summary.xPointCount !== xCount
    || summary.strikePointCount !== strikeCount
    || summary.separatrixLegCount !== legCount) {
    throw new Error(`EFIT topology frame ${summary.index} disagrees with its index summary.`);
  }

  const xPoints: EfitTopology['xPoints'][number][] = [];
  for (let index = 0; index < binary.maxXPoints; index += 1) {
    const roleCode = view.getUint8(24 + index);
    const offset = 32 + index * 16;
    const rM = view.getFloat32(offset, true);
    const zM = view.getFloat32(offset + 4, true);
    const psiN = view.getFloat32(offset + 8, true);
    const gradientResidual = view.getFloat32(offset + 12, true);
    if (![rM, zM, psiN, gradientResidual].every(Number.isFinite)) {
      throw new Error(`EFIT topology frame ${summary.index} contains a non-finite X-point record.`);
    }
    if (index >= xCount) {
      if (roleCode !== 0 || rM !== 0 || zM !== 0 || psiN !== 0 || gradientResidual !== 0) {
        throw new Error(`EFIT topology frame ${summary.index} has a nonzero unused X-point slot.`);
      }
      continue;
    }
    const role = roleCode === 1 ? 'primary' : roleCode === 2 ? 'secondary' : undefined;
    if (!role || rM < gridExtentM[0] || rM > gridExtentM[1]
      || zM < gridExtentM[2] || zM > gridExtentM[3]
      || Math.abs(psiN - 1) > 0.011 || gradientResidual < 0) {
      throw new Error(`EFIT topology frame ${summary.index} has an invalid X-point record.`);
    }
    xPoints.push({ rM, zM, psiN, gradientResidual, role, primary: role === 'primary' });
  }

  const strikePoints: EfitTopology['strikePoints'][number][] = [];
  for (let index = 0; index < binary.maxStrikePoints; index += 1) {
    const offset = 64 + index * 12;
    const rM = view.getFloat32(offset, true);
    const zM = view.getFloat32(offset + 4, true);
    const wallSegment = view.getUint16(offset + 8, true);
    const strikeFlags = view.getUint16(offset + 10, true);
    if (![rM, zM].every(Number.isFinite)) {
      throw new Error(`EFIT topology frame ${summary.index} contains a non-finite limiter intersection.`);
    }
    if (index >= strikeCount) {
      if (rM !== 0 || zM !== 0 || wallSegment !== 0 || strikeFlags !== 0) {
        throw new Error(`EFIT topology frame ${summary.index} has a nonzero unused limiter-intersection slot.`);
      }
      continue;
    }
    if (rM < gridExtentM[0] || rM > gridExtentM[1]
      || zM < gridExtentM[2] || zM > gridExtentM[3]
      || wallSegment >= limiterSegmentCount
      || strikeFlags !== TOPOLOGY_KNOWN_STRIKE_FLAGS_MASK) {
      throw new Error(`EFIT topology frame ${summary.index} has an invalid limiter-intersection record.`);
    }
    strikePoints.push({ rM, zM, wallSegment });
  }

  const separatrixLegs: EfitTopology['separatrixLegs'][number][] = [];
  let payloadOffset = binary.frameHeaderBytes;
  for (let index = 0; index < binary.maxSeparatrixLegs; index += 1) {
    const validPoints = view.getUint8(12 + index);
    const xPointIndex = view.getUint8(16 + index);
    const strikePointIndex = view.getUint8(20 + index);
    if (validPoints > binary.pointsPerLeg) {
      throw new Error(`EFIT topology frame ${summary.index} has an invalid separatrix-leg length.`);
    }
    const polyline = parsePolyline(view, payloadOffset, binary.pointsPerLeg);
    payloadOffset += binary.pointsPerLeg * 8;
    if (index >= legCount) {
      if (validPoints !== 0 || xPointIndex !== 0 || strikePointIndex !== 0
        || Array.from(polyline.rM).some((value) => value !== 0)
        || Array.from(polyline.zM).some((value) => value !== 0)) {
        throw new Error(`EFIT topology frame ${summary.index} has a nonzero unused separatrix-leg slot.`);
      }
      continue;
    }
    if (validPoints < 2 || xPointIndex >= xCount || strikePointIndex >= strikeCount) {
      throw new Error(`EFIT topology frame ${summary.index} has invalid separatrix-leg associations.`);
    }
    const rM = (polyline.rM as Float32Array).slice(0, validPoints);
    const zM = (polyline.zM as Float32Array).slice(0, validPoints);
    if (Array.from(rM).some((value) => !Number.isFinite(value) || value < 0)
      || Array.from(zM).some((value) => !Number.isFinite(value))) {
      throw new Error(`EFIT topology frame ${summary.index} contains invalid separatrix coordinates.`);
    }
    for (let pointIndex = validPoints; pointIndex < binary.pointsPerLeg; pointIndex += 1) {
      if (polyline.rM[pointIndex] !== 0 || polyline.zM[pointIndex] !== 0) {
        throw new Error(`EFIT topology frame ${summary.index} has a nonzero separatrix tail.`);
      }
    }
    if (Array.from(rM).some((value) => value < gridExtentM[0] || value > gridExtentM[1])
      || Array.from(zM).some((value) => value < gridExtentM[2] || value > gridExtentM[3])) {
      throw new Error(`EFIT topology frame ${summary.index} has separatrix coordinates outside the reviewed grid.`);
    }
    separatrixLegs.push({ rM, zM, validPoints, xPointIndex, strikePointIndex, closed: false });
  }

  return { kind, flags, xPoints, strikePoints, separatrixLegs };
}

export function createEfitBinaryDataSource(options: EfitBinaryDataSourceOptions = {}): EfitDataSource {
  const indexUrl = canonicalIndexUrl(options.indexUrl ?? DEFAULT_INDEX_URL);
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const configuredCacheSize = options.maxCachedFrames;
  const maxCachedFrames = Number.isFinite(configuredCacheSize) && Number.isInteger(configuredCacheSize)
    ? Math.min(512, Math.max(4, configuredCacheSize as number))
    : 48;
  let manifestPromise: Promise<EfitManifest> | null = null;
  const verifiedFiles = new Map<EfitShotId, Promise<void>>();
  const verifiedTopologyFiles = new Map<EfitShotId, Promise<void>>();
  const frameCache = new Map<string, EfitFrame>();
  const pendingFrames = new Map<string, Promise<EfitFrame>>();

  async function loadManifest(request: EfitDataRequest = {}): Promise<EfitManifest> {
    checkAborted(request.signal);
    if (!manifestPromise) {
      manifestPromise = fetcher(indexUrl)
        .then(async (response) => {
          if (!response.ok) throw new Error(`EFIT index request failed (${response.status}).`);
          return normalizeManifest(await response.json(), indexUrl);
        })
        .catch((error) => {
          manifestPromise = null;
          throw error;
        });
    }
    const manifest = await raceWithAbort(manifestPromise, request.signal);
    checkAborted(request.signal);
    return manifest;
  }

  async function findShot(shot: EfitShotId, request: EfitDataRequest = {}): Promise<LegacyShotManifest> {
    const manifest = await loadManifest(request);
    const found = manifest.shots.find((candidate) => candidate.shot === shot);
    if (!found) throw new Error(`EFIT shot ${shot} is not present in the index.`);
    if (!found.binary) throw new Error(`EFIT shot ${shot} is not a legacy contour-binary delivery.`);
    return found as LegacyShotManifest;
  }

  async function verifyFile(shot: LegacyShotManifest, signal?: AbortSignal): Promise<void> {
    let pending = verifiedFiles.get(shot.shot);
    if (!pending) {
      pending = fetchBytes(fetcher, shot.binary.url, 0, shot.binary.fileHeaderBytes)
        .then((header) => {
          const view = new DataView(header);
          if (readMagic(header) !== EXPECTED_MAGIC) throw new Error(`Shot ${shot.shot} has an unknown EFIT binary format.`);
          const version = view.getUint32(8, true);
          const fileShot = view.getUint32(12, true);
          const frameCount = view.getUint32(16, true);
          const stride = view.getUint32(20, true);
          const frameHeader = view.getUint32(24, true);
          const surfaceCount = view.getUint32(28, true);
          const points = view.getUint32(32, true);
          const fileHeader = view.getUint32(36, true);
          const levels = Array.from(new Uint8Array(header, 40, DEFAULT_SURFACE_COUNT));
          if (version !== 1 || fileShot !== shot.shot || frameCount !== shot.frameCount
            || stride !== shot.binary.frameStrideBytes || frameHeader !== shot.binary.frameHeaderBytes
            || surfaceCount !== shot.binary.surfaceCount || points !== shot.binary.pointsPerContour) {
            throw new Error(`Shot ${shot.shot} binary header does not match its index metadata.`);
          }
          if (fileHeader !== shot.binary.fileHeaderBytes
            || levels.some((value, index) => value !== (index + 1) * 10)) {
            throw new Error(`Shot ${shot.shot} binary header has an invalid file header or psiN levels.`);
          }
        })
        .catch((error) => {
          verifiedFiles.delete(shot.shot);
          throw error;
        });
      verifiedFiles.set(shot.shot, pending);
    }
    await raceWithAbort(pending, signal);
  }

  async function verifyTopologyFile(shot: LegacyShotManifest, signal?: AbortSignal): Promise<void> {
    const binary = shot.topologyBinary;
    if (!binary) return;
    let pending = verifiedTopologyFiles.get(shot.shot);
    if (!pending) {
      pending = fetchBytes(fetcher, binary.url, 0, binary.fileHeaderBytes)
        .then((header) => {
          const view = new DataView(header);
          const hashPrefix = Array.from(new Uint8Array(header, 48, 16))
            .map((value) => value.toString(16).padStart(2, '0'))
            .join('');
          if (readMagic(header) !== TOPOLOGY_MAGIC
            || view.getUint32(8, true) !== 1
            || view.getUint32(12, true) !== shot.shot
            || view.getUint32(16, true) !== shot.frameCount
            || view.getUint32(20, true) !== binary.frameStrideBytes
            || view.getUint32(24, true) !== binary.frameHeaderBytes
            || view.getUint32(28, true) !== binary.maxSeparatrixLegs
            || view.getUint32(32, true) !== binary.pointsPerLeg
            || view.getUint32(36, true) !== binary.maxXPoints
            || view.getUint32(40, true) !== binary.maxStrikePoints
            || hashPrefix !== binary.baseSha256PrefixHex.toLowerCase()) {
            throw new Error(`Shot ${shot.shot} topology header does not match its index or base binary binding.`);
          }
        })
        .catch((error) => {
          verifiedTopologyFiles.delete(shot.shot);
          throw error;
        });
      verifiedTopologyFiles.set(shot.shot, pending);
    }
    await raceWithAbort(pending, signal);
  }

  function remember(key: string, frame: EfitFrame): void {
    frameCache.delete(key);
    frameCache.set(key, frame);
    while (frameCache.size > maxCachedFrames) {
      const oldest = frameCache.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      frameCache.delete(oldest);
    }
  }

  async function loadFrame(shotId: EfitShotId, frameIndex: number, request: EfitDataRequest = {}): Promise<EfitFrame> {
    const key = `${shotId}:${frameIndex}`;
    const cached = frameCache.get(key);
    if (cached) {
      checkAborted(request.signal);
      remember(key, cached);
      return cached;
    }
    const existing = pendingFrames.get(key);
    if (existing) return raceWithAbort(existing, request.signal);

    const pending = (async () => {
      const manifest = await loadManifest();
      const candidate = manifest.shots.find((item) => item.shot === shotId);
      if (!candidate) throw new Error(`EFIT shot ${shotId} is not present in the index.`);
      if (!candidate.binary) throw new Error(`EFIT shot ${shotId} is not a legacy contour-binary delivery.`);
      const shot = candidate as LegacyShotManifest;
      const summary = shot.frames[frameIndex];
      if (!summary) throw new Error(`EFIT shot ${shotId} has no frame ${frameIndex}.`);
      await Promise.all([verifyFile(shot), verifyTopologyFile(shot)]);
      const topologyOffset = shot.topologyBinary
        ? shot.topologyBinary.fileHeaderBytes + frameIndex * shot.topologyBinary.frameStrideBytes
        : undefined;
      const [bytes, topologyBytes] = await Promise.all([
        fetchBytes(
          fetcher,
          shot.binary.url,
          summary.offsetBytes,
          shot.binary.frameStrideBytes,
        ),
        shot.topologyBinary && topologyOffset !== undefined
          ? fetchBytes(
            fetcher,
            shot.topologyBinary.url,
            topologyOffset,
            shot.topologyBinary.frameStrideBytes,
          )
          : Promise.resolve<ArrayBuffer | undefined>(undefined),
      ]);
      const frame = parseFrame(bytes, summary, shot.binary, manifest.psiNLevels);
      if (topologyBytes && shot.topologyBinary) {
        const shotGeometry = resolvedShotGeometry(manifest, shot);
        if (!shotGeometry?.gridExtentM) {
          throw new Error(`Shot ${shot.shot} topology has no resolved geometry contract.`);
        }
        frame.topology = parseTopologyFrame(
          topologyBytes,
          summary,
          shot.topologyBinary,
          shotGeometry.canonicalSegmentCount ?? shotGeometry.limiterRzM.validPoints - 1,
          shotGeometry.gridExtentM,
        );
      }
      remember(key, frame);
      return frame;
    })().finally(() => pendingFrames.delete(key));
    pendingFrames.set(key, pending);
    return raceWithAbort(pending, request.signal);
  }

  return {
    loadManifest,
    async loadTimeline(shot, request = {}) {
      return (await findShot(shot, request)).frames;
    },
    loadFrame,
    prefetchFrame(shot, frameIndex) {
      void loadFrame(shot, frameIndex).catch(() => undefined);
    },
  };
}

export function createInMemoryEfitDataSource(manifest: EfitManifest, frames: readonly EfitFrame[]): EfitDataSource {
  const byKey = new Map(frames.map((frame) => [`${frame.shot}:${frame.index}`, frame]));
  return {
    async loadManifest(request = {}) {
      checkAborted(request.signal);
      return manifest;
    },
    async loadTimeline(shot, request = {}) {
      checkAborted(request.signal);
      const found = manifest.shots.find((candidate) => candidate.shot === shot);
      if (!found) throw new Error(`EFIT shot ${shot} is not present in the in-memory source.`);
      return found.frames;
    },
    async loadFrame(shot, frameIndex, request = {}) {
      checkAborted(request.signal);
      const frame = byKey.get(`${shot}:${frameIndex}`);
      if (!frame) throw new Error(`EFIT frame ${shot}:${frameIndex} is not present in memory.`);
      return frame;
    },
  };
}

/** Pure contract probe used by conversion checks and local QA; no network or UI required. */
export function inspectEfitBinaryContract(index: unknown, shotFile: ArrayBuffer): EfitBinaryContractSummary {
  const manifest = normalizeManifest(index, DEFAULT_INDEX_URL);
  const shot = manifest.shots[0];
  if (!shot) throw new Error('EFIT index has no shot to inspect.');
  if (!shot.binary) throw new Error('EFIT inspection index does not describe a legacy binary shot.');
  if (shotFile.byteLength < shot.binary.fileHeaderBytes + shot.binary.frameStrideBytes) {
    throw new Error('EFIT inspection payload does not include a complete first frame.');
  }
  const headerView = new DataView(shotFile, 0, shot.binary.fileHeaderBytes);
  const header = {
    magic: readMagic(shotFile),
    shot: headerView.getUint32(12, true),
    frameCount: headerView.getUint32(16, true),
    frameStrideBytes: headerView.getUint32(20, true),
    frameHeaderBytes: headerView.getUint32(24, true),
    surfaceCount: headerView.getUint32(28, true),
    pointsPerContour: headerView.getUint32(32, true),
    fileHeaderBytes: headerView.getUint32(36, true),
  };
  if (header.magic !== EXPECTED_MAGIC || header.shot !== shot.shot
    || header.frameStrideBytes !== shot.binary.frameStrideBytes
    || header.frameHeaderBytes !== shot.binary.frameHeaderBytes
    || header.surfaceCount !== shot.binary.surfaceCount
    || header.pointsPerContour !== shot.binary.pointsPerContour) {
    throw new Error('EFIT binary header does not match the normalized index contract.');
  }
  const summary = shot.frames[0];
  if (!summary) throw new Error('EFIT index has no first frame summary.');
  const frameBytes = shotFile.slice(summary.offsetBytes, summary.offsetBytes + shot.binary.frameStrideBytes);
  const frame = parseFrame(frameBytes, summary, shot.binary, manifest.psiNLevels);
  return { manifest, header, frame };
}
