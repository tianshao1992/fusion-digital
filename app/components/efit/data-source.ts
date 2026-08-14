import type {
  EfitBinaryDescriptor,
  EfitContour,
  EfitDataRequest,
  EfitDataSource,
  EfitFrame,
  EfitFrameSummary,
  EfitGap,
  EfitManifest,
  EfitQuality,
  EfitRzPolyline,
  EfitShotId,
  EfitShotManifest,
} from './types';

const DEFAULT_INDEX_URL = '/device-data/exl50u-efit/index.json';
const EXPECTED_MAGIC = 'EXL50EF1';
const DEFAULT_FILE_HEADER_BYTES = 64;
const DEFAULT_FRAME_HEADER_BYTES = 64;
const DEFAULT_FRAME_STRIDE_BYTES = 10_304;
const DEFAULT_SURFACE_COUNT = 9;
const DEFAULT_POINTS_PER_CONTOUR = 128;
const PSI_N_LEVELS = Object.freeze([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
const SOURCE_VALID_FLAG = 1 << 0;
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
  const parsed = finiteNumber(value, fallback);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function optionalFinite(value: unknown): number | undefined {
  const parsed = finiteNumber(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
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
  const flat = Array.isArray(value) ? value : [];
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
  };
}

function normalizeShot(raw: unknown, layout: JsonRecord, indexUrl: string): EfitShotManifest {
  if (!isRecord(raw)) throw new Error('EFIT index contains an invalid shot record.');
  const shot = integer(raw.shot, Number.NaN);
  if (!Number.isFinite(shot)) throw new Error('EFIT shot number is missing.');
  const binary = normalizeBinary(raw, layout, indexUrl, shot);
  const rawFrames = Array.isArray(raw.frames) ? raw.frames : [];
  const rawTimes = Array.isArray(raw.availableTimesMs) ? raw.availableTimesMs : [];
  const expectedCount = integer(raw.frameCount, 0);
  if (expectedCount <= 0 || expectedCount > 20_000
    || rawFrames.length !== expectedCount
    || (rawTimes.length > 0 && rawTimes.length !== expectedCount)) {
    throw new Error(`EFIT shot ${shot} has an invalid or inconsistent frame count.`);
  }
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
    frameCount: frames.length,
    minTimeMs,
    maxTimeMs,
    gaps,
    frames,
    binary,
  };
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

  return {
    schema: stringValue(raw.schemaVersion ?? raw.schema ?? raw.version, 'exl50u-efit/v1'),
    device: stringValue(deviceRecord.displayName ?? deviceRecord.id ?? raw.device, 'EXL-50U'),
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : undefined,
    psiNLevels,
    geometry: {
      limiterRzM: parseFlatRz(geometry.limiterRzM),
      gridExtentM: extent,
      coordinateSystem: typeof coordinateSystem.source === 'string'
        ? coordinateSystem.source
        : typeof geometry.coordinateSystem === 'string' ? geometry.coordinateSystem : undefined,
      cadRegistration,
    },
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
    if (bytes.byteLength < length) throw new Error('EFIT Range response is shorter than requested.');
    return bytes.byteLength === length ? bytes : bytes.slice(0, length);
  }
  if (bytes.byteLength >= start + length) return bytes.slice(start, start + length);
  if (bytes.byteLength === length) return bytes;
  throw new Error('Server did not honor the EFIT byte range request.');
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
  const lcfsValidPoints = Math.min(view.getUint16(44, true), binary.pointsPerContour);
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

export function createEfitBinaryDataSource(options: EfitBinaryDataSourceOptions = {}): EfitDataSource {
  const indexUrl = canonicalIndexUrl(options.indexUrl ?? DEFAULT_INDEX_URL);
  const fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  const maxCachedFrames = Math.max(4, options.maxCachedFrames ?? 48);
  let manifestPromise: Promise<EfitManifest> | null = null;
  const verifiedFiles = new Map<EfitShotId, Promise<void>>();
  const frameCache = new Map<string, EfitFrame>();
  const pendingFrames = new Map<string, Promise<EfitFrame>>();

  async function loadManifest(request: EfitDataRequest = {}): Promise<EfitManifest> {
    checkAborted(request.signal);
    if (!manifestPromise) {
      manifestPromise = fetcher(indexUrl, { signal: request.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`EFIT index request failed (${response.status}).`);
          return normalizeManifest(await response.json(), indexUrl);
        })
        .catch((error) => {
          manifestPromise = null;
          throw error;
        });
    }
    const manifest = await manifestPromise;
    checkAborted(request.signal);
    return manifest;
  }

  async function findShot(shot: EfitShotId, request: EfitDataRequest = {}): Promise<EfitShotManifest> {
    const manifest = await loadManifest(request);
    const found = manifest.shots.find((candidate) => candidate.shot === shot);
    if (!found) throw new Error(`EFIT shot ${shot} is not present in the index.`);
    return found;
  }

  async function verifyFile(shot: EfitShotManifest, signal?: AbortSignal): Promise<void> {
    let pending = verifiedFiles.get(shot.shot);
    if (!pending) {
      pending = fetchBytes(fetcher, shot.binary.url, 0, shot.binary.fileHeaderBytes, signal)
        .then((header) => {
          const view = new DataView(header);
          if (readMagic(header) !== EXPECTED_MAGIC) throw new Error(`Shot ${shot.shot} has an unknown EFIT binary format.`);
          const fileShot = view.getUint32(12, true);
          const stride = view.getUint32(20, true);
          const frameHeader = view.getUint32(24, true);
          const surfaceCount = view.getUint32(28, true);
          const points = view.getUint32(32, true);
          if (fileShot !== shot.shot || stride !== shot.binary.frameStrideBytes || frameHeader !== shot.binary.frameHeaderBytes
            || surfaceCount !== shot.binary.surfaceCount || points !== shot.binary.pointsPerContour) {
            throw new Error(`Shot ${shot.shot} binary header does not match its index metadata.`);
          }
        })
        .catch((error) => {
          verifiedFiles.delete(shot.shot);
          throw error;
        });
      verifiedFiles.set(shot.shot, pending);
    }
    await pending;
    checkAborted(signal);
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
      remember(key, cached);
      return cached;
    }
    const existing = pendingFrames.get(key);
    if (existing) return existing;

    const pending = (async () => {
      const manifest = await loadManifest(request);
      const shot = manifest.shots.find((candidate) => candidate.shot === shotId);
      if (!shot) throw new Error(`EFIT shot ${shotId} is not present in the index.`);
      const summary = shot.frames[frameIndex];
      if (!summary) throw new Error(`EFIT shot ${shotId} has no frame ${frameIndex}.`);
      await verifyFile(shot, request.signal);
      const bytes = await fetchBytes(
        fetcher,
        shot.binary.url,
        summary.offsetBytes,
        shot.binary.frameStrideBytes,
        request.signal,
      );
      const frame = parseFrame(bytes, summary, shot.binary, manifest.psiNLevels);
      remember(key, frame);
      return frame;
    })().finally(() => pendingFrames.delete(key));
    pendingFrames.set(key, pending);
    return pending;
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
