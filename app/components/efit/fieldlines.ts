/** Reviewed public derivatives; source H5 and full field grids stay private. */
export const FIELDLINE_INDEX_URL = '/device-data/exl50u-fieldlines-v1/index.json';
export const FIELDLINE_COLORS = ['#ffdf00', '#ff5266', '#42a5ff', '#92ff53', '#ff75d8'] as const;
export const FIELDLINE_COPIES = [1, 2, 4, 8] as const;
export type EfitSourceScalars = {
  currentA: number; rAxisM: number; zAxisM: number; bcentrT: number;
  psiAxisWb: number; psiBoundaryWb: number; q95: number | null;
};
export type AntennaMidplaneFlux = {
  rStartM: number; rStepM: number; zM: 0; phiDegrees: 300;
  psiWb: (number | null)[]; psiAxisWb: number; psiBoundaryWb: number;
  lcfsIntervalsRM: [number, number][]; method: 'cubic-source-grid-sampled-linear-display';
};
export type FieldlineSummary = {
  index: number; sourceIndex: number; timeMs: number; state: 'valid' | 'unavailable';
  reason?: string; lineCount: number; maxPsiNDrift: number;
  efitScalars: EfitSourceScalars | null;
};
export type FieldlineChunk = { file: string; firstIndex: number; frameCount: number; byteLength: number; sha256: string };
export type FieldlineShot = {
  shot: number; sourceSha256: string; sourceFrameCount: number;
  frames: FieldlineSummary[]; chunks: FieldlineChunk[];
};
export type FieldlineCatalog = {
  schemaVersion: 'fusion.efit.fieldlines.v2'; model: 'axisymmetric-equilibrium';
  coordinates: 'R-phi-Z:m-rad-m'; algorithmVersion: string; seedPsiN: number[]; phiDegrees: number;
  shots: FieldlineShot[];
};
export type Fieldline = {
  psiN: number; points: number[]; maxPsiNDrift: number;
  termination: [string, string]; arcLengthM: [number, number];
  poloidalSpanRad: [number, number]; toroidalSpanRad: [number, number];
  sourceQ: number; qTrace: number; qRelativeDifference: number; poloidalClosureErrorM: number;
};
export type FieldlineFrame = {
  shot: number; index: number; sourceIndex: number; timeMs: number;
  state: 'valid' | 'unavailable'; reason?: string; lines: Fieldline[];
  boundaryRz: number[]; axisRz: number[];
  efitScalars: EfitSourceScalars | null;
  efitContours: { psiN: number; pointsRzM: number[]; closed: true }[];
  antennaMidplaneFlux: AntennaMidplaneFlux | null;
};
export type FieldlineView = { frame: FieldlineFrame | null; xray: boolean; clip: boolean; copies?: number; enabled?: boolean };

/** Resolve geometry directly on a store commit, without lifting each frame into React. */
export function fieldlineViewAtFrame(view: FieldlineView | undefined,
  current: { shot?: number | string; index?: number; timeMs: number; fieldlineFrame?: FieldlineFrame } | null): FieldlineView {
  const options = view ?? { frame: null, xray: true, clip: false };
  const candidate = options.enabled ? current?.fieldlineFrame : options.frame;
  const matching = options.enabled !== false && candidate?.state === 'valid'
    && candidate.shot === current?.shot && candidate.sourceIndex === current?.index && candidate.timeMs === current?.timeMs;
  return { ...options, frame: matching ? candidate : null };
}

/** Flux function at the outer-limiter midplane reference, NOT flux through the antenna. */
export function antennaFluxAtRadius(frame: FieldlineFrame | null | undefined, radiusMm: number) {
  const data = frame?.antennaMidplaneFlux;
  if (!data || !Number.isFinite(radiusMm)) return null;
  const r = radiusMm / 1000;
  const x = (r - data.rStartM) / data.rStepM;
  if (x < -1e-9 || x > data.psiWb.length - 1 + 1e-9) return null;
  const bounded = Math.max(0, Math.min(data.psiWb.length - 1, x));
  const i = Math.floor(bounded); const j = Math.min(i + 1, data.psiWb.length - 1);
  const a = data.psiWb[i]; const b = data.psiWb[j];
  if (a === null || b === null) return null;
  const psiWb = a + (b - a) * (bounded - i);
  const span = data.psiBoundaryWb - data.psiAxisWb;
  if (!Number.isFinite(psiWb) || Math.abs(span) < 1e-12) return null;
  return { psiWb, psiN: (psiWb - data.psiAxisWb) / span,
    insideLcfs: data.lcfsIntervalsRM.some(([lo, hi]) => r >= lo && r <= hi) };
}

function insist(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function finite(n: unknown): n is number { return typeof n === 'number' && Number.isFinite(n); }
function integer(n: unknown, min: number, max: number) { return finite(n) && Number.isInteger(n) && n >= min && n <= max; }
function digest(s: unknown) { return typeof s === 'string' && /^[a-f0-9]{64}$/.test(s); }
function obj(value: unknown): Record<string, unknown> {
  insist(value && typeof value === 'object' && !Array.isArray(value), 'Invalid field-line record.');
  return value as Record<string, unknown>;
}

export function parseFieldlineCatalog(value: unknown): FieldlineCatalog {
  const data = obj(value);
  insist(data.schemaVersion === 'fusion.efit.fieldlines.v2' && data.model === 'axisymmetric-equilibrium'
    && data.coordinates === 'R-phi-Z:m-rad-m' && data.phiDegrees === 300, 'Unsupported field-line convention.');
  insist(data.algorithmVersion === 'axisymmetric-core-full-poloid-rk45-v2', 'Unreviewed algorithm version.');
  insist(Array.isArray(data.seedPsiN) && JSON.stringify(data.seedPsiN) === '[0.25,0.5,0.75,0.9,0.97]', 'Unreviewed seeds.');
  insist(Array.isArray(data.shots) && data.shots.length === 2, 'Expected the two reviewed shots.');
  const seen = new Set<number>();
  for (const entry of data.shots) {
    const shot = obj(entry);
    insist((shot.shot === 21066 || shot.shot === 21138) && !seen.has(shot.shot), 'Unreviewed or duplicated shot.');
    seen.add(shot.shot);
    insist(digest(shot.sourceSha256) && integer(shot.sourceFrameCount, 1, 2_000), 'Invalid source provenance.');
    insist(Array.isArray(shot.frames) && shot.frames.length === shot.sourceFrameCount, 'Incomplete source timeline.');
    let previous = -Infinity;
    for (const [i, raw] of shot.frames.entries()) {
      const frame = obj(raw);
      insist(frame.index === i && frame.sourceIndex === i && finite(frame.timeMs) && frame.timeMs > previous, 'Invalid frame identity or time order.');
      insist(frame.state === 'valid' || frame.state === 'unavailable', 'Invalid frame state.');
      insist(integer(frame.lineCount, 0, 5) && finite(frame.maxPsiNDrift) && frame.maxPsiNDrift >= 0 && frame.maxPsiNDrift <= 0.0001, 'Field-line quality exceeds budget.');
      insist(frame.state === 'valid' ? frame.lineCount === 5 : frame.lineCount === 0, 'Incomplete field-line set.');
      validateScalars(frame.efitScalars);
      previous = frame.timeMs;
    }
    insist(Array.isArray(shot.chunks) && shot.chunks.length <= 128, 'Invalid chunk count.');
    let count = 0;
    for (const [i, raw] of shot.chunks.entries()) {
      const chunk = obj(raw);
      insist(chunk.file === `shot-${shot.shot}-part-${String(i).padStart(3, '0')}.jsonl.gz`, 'Unsafe asset path.');
      insist(chunk.firstIndex === count && integer(chunk.frameCount, 1, 16)
        && integer(chunk.byteLength, 1, 8 * 1024 * 1024) && digest(chunk.sha256), 'Invalid chunk identity or budget.');
      count += chunk.frameCount as number;
    }
    insist(count === shot.frames.length, 'Chunk coverage differs from timeline.');
  }
  return data as FieldlineCatalog;
}

export function parseFieldlineFrame(value: unknown, shot: FieldlineShot, expected: FieldlineSummary): FieldlineFrame {
  const data = obj(value);
  insist(data.shot === shot.shot && data.index === expected.index && data.sourceIndex === expected.sourceIndex
    && data.timeMs === expected.timeMs && data.state === expected.state, 'Stale or mismatched field-line frame.');
  insist(Array.isArray(data.lines) && data.lines.length === expected.lineCount, 'Unexpected line count.');
  for (const [i, raw] of data.lines.entries()) {
    const line = obj(raw);
    insist(line.psiN === [0.25, 0.5, 0.75, 0.9, 0.97][i], 'Unexpected seed.');
    insist(finite(line.maxPsiNDrift) && line.maxPsiNDrift >= 0 && line.maxPsiNDrift <= 0.0001, 'Excessive flux drift.');
    insist(Array.isArray(line.points) && line.points.length >= 6 && line.points.length <= 3 * 4095
      && line.points.length % 3 === 0, 'Invalid line point budget.');
    for (let p = 0; p < line.points.length; p += 3) {
      const r = line.points[p]; const phi = line.points[p + 1]; const z = line.points[p + 2];
      insist(finite(r) && r >= 0.2 && r <= 2.2 && finite(phi) && Math.abs(phi) <= 207
        && finite(z) && Math.abs(z) <= 1.901, 'Field-line point escaped the source domain.');
    }
    insist(Array.isArray(line.arcLengthM) && line.arcLengthM.length === 2
      && line.arcLengthM.every((n) => finite(n) && n >= 0 && n <= 300.001), 'Invalid traced length.');
    insist(Array.isArray(line.termination) && line.termination.length === 2
      && line.termination.every((s) => s === 'poloidal-coverage-complete'), 'Incomplete poloidal coverage.');
    insist(Array.isArray(line.poloidalSpanRad) && line.poloidalSpanRad.length === 2
      && line.poloidalSpanRad.every((n) => finite(n) && Math.abs(n - Math.PI) <= 1e-6), 'Incomplete poloidal sweep.');
    insist(Array.isArray(line.toroidalSpanRad) && line.toroidalSpanRad.length === 2
      && line.toroidalSpanRad.every((n) => finite(n) && n > 0 && n <= 32 * 2 * Math.PI + 1e-6), 'Invalid toroidal span.');
    insist(finite(line.sourceQ) && finite(line.qTrace) && line.qTrace > 0
      && Math.abs(line.qTrace - Math.abs(line.sourceQ)) <= Math.max(.05, .05 * Math.abs(line.sourceQ)) + 1e-8
      && finite(line.qRelativeDifference) && line.qRelativeDifference >= 0
      && finite(line.poloidalClosureErrorM) && line.poloidalClosureErrorM >= 0 && line.poloidalClosureErrorM <= .0001,
    'Field-line/source-q consistency failed.');
  }
  insist(Array.isArray(data.boundaryRz) && data.boundaryRz.length <= 4096 && data.boundaryRz.length % 2 === 0
    && data.boundaryRz.every((n) => finite(n) && Math.abs(n) <= 3), 'Invalid boundary.');
  insist(Array.isArray(data.axisRz) && (data.axisRz.length === 2 || data.state === 'unavailable' && data.axisRz.length === 0)
    && data.axisRz.every((n) => finite(n) && Math.abs(n) <= 3), 'Invalid magnetic axis.');
  validateScalars(data.efitScalars);
  insist(JSON.stringify(data.efitScalars) === JSON.stringify(expected.efitScalars), 'Scalar/index mismatch.');
  insist(Array.isArray(data.efitContours) && data.efitContours.length <= 6, 'Invalid EFIT contours.');
  for (const raw of data.efitContours) {
    const c = obj(raw);
    insist(finite(c.psiN) && c.psiN > 0 && c.psiN <= 1 && c.closed === true
      && Array.isArray(c.pointsRzM) && c.pointsRzM.length >= 6 && c.pointsRzM.length <= 512
      && c.pointsRzM.length % 2 === 0 && c.pointsRzM.every((n) => finite(n) && Math.abs(n) <= 3), 'Invalid contour points.');
    const p = c.pointsRzM as number[];
    insist(Math.hypot(p[0] - p.at(-2)!, p[1] - p.at(-1)!) <= 1e-6, 'Open contour mislabeled closed.');
  }
  if (data.antennaMidplaneFlux !== null) {
    const flux = obj(data.antennaMidplaneFlux);
    insist(flux.rStartM === 1.1 && flux.rStepM === .001 && flux.zM === 0 && flux.phiDegrees === 300
      && flux.method === 'cubic-source-grid-sampled-linear-display', 'Unreviewed flux reference.');
    insist(Array.isArray(flux.psiWb) && flux.psiWb.length === 501
      && flux.psiWb.every((n) => n === null || finite(n)), 'Invalid radial flux samples.');
    insist(finite(flux.psiAxisWb) && finite(flux.psiBoundaryWb)
      && Math.abs(flux.psiBoundaryWb - flux.psiAxisWb) > 1e-12, 'Degenerate flux normalization.');
    const scalars = data.efitScalars as EfitSourceScalars | null;
    insist(scalars && Math.abs(flux.psiAxisWb - scalars.psiAxisWb) <= 2e-15
      && Math.abs(flux.psiBoundaryWb - scalars.psiBoundaryWb) <= 2e-15,
      'Flux reference differs from EFIT source.');
    insist(Array.isArray(flux.lcfsIntervalsRM) && flux.lcfsIntervalsRM.length <= 32
      && flux.lcfsIntervalsRM.every((p) => Array.isArray(p) && p.length === 2 && p.every(finite) && p[0] < p[1]), 'Invalid LCFS intervals.');
  }
  return data as FieldlineFrame;
}

function validateScalars(value: unknown) {
  if (value === null) return;
  const s = obj(value);
  insist(['currentA', 'rAxisM', 'zAxisM', 'bcentrT', 'psiAxisWb', 'psiBoundaryWb'].every((key) => finite(s[key]))
    && (s.q95 === null || finite(s.q95)), 'Invalid source scalars.');
}

/** Floor in actual source time, with explicit holes. Never blend equilibria. */
export function fieldlineTimeSelection(frames: FieldlineSummary[], timeMs: number) {
  let lo = 0; let hi = frames.length - 1;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (frames[mid].timeMs <= timeMs) lo = mid; else hi = mid - 1; }
  const next = frames[lo + 1];
  const gap = Boolean(next && next.timeMs - frames[lo].timeMs > 1.5 && timeMs >= frames[lo].timeMs + 1);
  return { index: lo, gap, afterMs: frames[lo].timeMs, beforeMs: next?.timeMs };
}

async function limitedBytes(response: Response, maximum: number): Promise<Uint8Array> {
  insist(response.ok && response.body, 'Field-line download failed.');
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let length = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength;
      insist(length <= maximum, 'Field-line download exceeds budget.'); parts.push(value); }
  } catch (error) { await reader.cancel(); throw error; } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

export const FIELDLINE_PREPARE_LIMITS = Object.freeze({
  concurrency: 3, compressedBytes: 48 * 1024 * 1024,
  decodedBytes: 128 * 1024 * 1024, retainedBytes: 96 * 1024 * 1024,
});
type PreparationProgress = { completed: number; total: number };

// Logical retained payload budget (double precision arrays + conservative record
// allowance), not a promise about a browser's implementation-dependent JS heap.
function framePayloadBytes(frame: FieldlineFrame): number {
  const coordinates = frame.lines.reduce((n, line) => n + line.points.length, 0)
    + frame.boundaryRz.length + frame.axisRz.length
    + frame.efitContours.reduce((n, contour) => n + contour.pointsRzM.length, 0)
    + (frame.antennaMidplaneFlux?.psiWb.length ?? 0);
  return coordinates * 8 + 2048 + frame.lines.length * 512;
}

export function createFieldlineSource(fetcher: typeof fetch = fetch,
  budgets: Partial<Pick<typeof FIELDLINE_PREPARE_LIMITS, 'compressedBytes' | 'decodedBytes' | 'retainedBytes'>> = {}) {
  // Embedders/tests may tighten, never enlarge the reviewed ceilings.
  const limits = { ...FIELDLINE_PREPARE_LIMITS };
  for (const name of ['compressedBytes', 'decodedBytes', 'retainedBytes'] as const) {
    const value = budgets[name];
    if (value !== undefined) {
      insist(Number.isSafeInteger(value) && value > 0, 'Invalid preparation budget.');
      limits[name] = Math.min(value, limits[name]);
    }
  }
  // Keep four decoded chunks; rapid seeks retain only current + next downloads.
  const cache = new Map<string, FieldlineFrame[]>();
  const pending = new Map<string, { task: Promise<FieldlineFrame[]>; controller: AbortController }>();
  let prepared: { key: string; frames: FieldlineFrame[] } | null = null;
  let preparing: AbortController | null = null;
  let generation = 0;
  const shotKeys = new WeakMap<FieldlineShot, string>();
  const shotKey = (shot: FieldlineShot) => {
    let key = shotKeys.get(shot);
    if (!key) { key = `${shot.sourceSha256}:${shot.chunks.map((c) => c.sha256).join(':')}`; shotKeys.set(shot, key); }
    return key;
  };
  const keyFor = (shot: FieldlineShot, chunk: FieldlineChunk) => `${shot.sourceSha256}:${chunk.sha256}`;
  function retain(shot?: FieldlineShot, index?: number) {
    if (!shot) { generation++; preparing?.abort(); preparing = null; prepared = null; cache.clear(); }
    const part = shot?.chunks.findIndex((c) => index !== undefined && index >= c.firstIndex && index < c.firstIndex + c.frameCount) ?? -1;
    const wanted = new Set(shot && part >= 0 ? shot.chunks.slice(part, part + 2).map((c) => keyFor(shot, c)) : []);
    for (const [key, entry] of pending) if (!wanted.has(key)) { entry.controller.abort(); pending.delete(key); }
  }
  async function decodeChunk(shot: FieldlineShot, chunk: FieldlineChunk, signal: AbortSignal,
    account?: (decoded: number, retained: number) => void) {
    signal.throwIfAborted();
    const response = await fetcher(`${FIELDLINE_INDEX_URL.slice(0, -10)}${chunk.file}?sha256=${chunk.sha256}`, { signal });
    const bytes = await limitedBytes(response, chunk.byteLength);
    insist(bytes.byteLength === chunk.byteLength, 'Truncated field-line chunk.');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), (b) => b.toString(16).padStart(2, '0')).join('');
    signal.throwIfAborted();
    insist(hash === chunk.sha256 && bytes[0] === 31 && bytes[1] === 139, 'Field-line hash mismatch.');
    const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
    const decoded = await limitedBytes(new Response(stream), 24 * 1024 * 1024);
    signal.throwIfAborted(); account?.(decoded.byteLength, 0);
    const rows = new TextDecoder().decode(decoded).trim().split('\n');
    insist(rows.length === chunk.frameCount, 'Field-line chunk frame count mismatch.');
    const frames: FieldlineFrame[] = [];
    for (let i = 0; i < rows.length; i++) {
      signal.throwIfAborted();
      const frame = parseFieldlineFrame(JSON.parse(rows[i]), shot, shot.frames[chunk.firstIndex + i]);
      account?.(0, framePayloadBytes(frame)); frames.push(frame);
      // Preparation happens before playback. Yield to paint progress and accept
      // a shot switch instead of parsing an entire shot in one main-thread task.
      if (account) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    signal.throwIfAborted(); return frames;
  }
  async function prepareShot(shot: FieldlineShot, signal: AbortSignal, onProgress?: (progress: PreparationProgress) => void) {
    signal.throwIfAborted();
    const key = shotKey(shot);
    if (prepared?.key === key) return;
    retain();
    const ownGeneration = generation;
    const controller = new AbortController(); preparing = controller;
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const frames: FieldlineFrame[] = new Array(shot.frames.length);
    let next = 0; let completed = 0; let decodedBytes = 0; let retainedBytes = 0;
    const account = (decoded: number, retained: number) => {
      decodedBytes += decoded; retainedBytes += retained;
      insist(decodedBytes <= limits.decodedBytes
        && retainedBytes <= limits.retainedBytes, 'Field-line preparation exceeds memory budget.');
    };
    try {
      insist(shot.chunks.reduce((n, c) => n + c.byteLength, 0) <= limits.compressedBytes,
        'Field-line preparation exceeds download budget.');
      onProgress?.({ completed: 0, total: shot.chunks.length });
      const workers = Array.from({ length: Math.min(FIELDLINE_PREPARE_LIMITS.concurrency, shot.chunks.length) }, async () => {
        try {
          while (next < shot.chunks.length) {
            controller.signal.throwIfAborted();
            const chunk = shot.chunks[next++];
            const loaded = await decodeChunk(shot, chunk, controller.signal, account);
            controller.signal.throwIfAborted();
            loaded.forEach((frame, i) => { frames[chunk.firstIndex + i] = frame; });
            completed++;
            onProgress?.({ completed, total: shot.chunks.length });
          }
        } catch (error) { controller.abort(error); throw error; }
      });
      // Drain cancelled siblings before returning: none can publish late progress
      // or keep a half-prepared shot alive after a retry / A -> B -> A switch.
      await Promise.allSettled(workers);
      controller.signal.throwIfAborted(); signal.throwIfAborted();
      insist(completed === shot.chunks.length && frames.filter(Boolean).length === shot.frames.length,
        'Incomplete prepared field-line shot.');
      if (ownGeneration !== generation) throw new DOMException('Superseded', 'AbortError');
      prepared = { key, frames }; // Atomic admission, one reviewed shot only.
    } finally {
      signal.removeEventListener('abort', abort);
      if (preparing === controller) preparing = null;
    }
  }
  async function loadChunk(shot: FieldlineShot, chunk: FieldlineChunk) {
    const key = `${shot.sourceSha256}:${chunk.sha256}`;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    const inflight = pending.get(key); if (inflight && !inflight.controller.signal.aborted) return inflight.task;
    // A seek aborts one consumer, not a verified chunk still needed by the next seek.
    // retain()/clear() own download lifetime; individual callers race their own signal.
    const controller = new AbortController(); const signal = controller.signal;
    const task = (async () => {
      const frames = await decodeChunk(shot, chunk, signal);
      signal.throwIfAborted(); cache.set(key, frames);
      while (cache.size > 4) cache.delete(cache.keys().next().value!);
      return frames;
    })().finally(() => { if (pending.get(key)?.controller === controller) pending.delete(key); });
    pending.set(key, { task, controller }); return task;
  }
  return {
    async catalog(signal: AbortSignal) {
      const bytes = await limitedBytes(await fetcher(FIELDLINE_INDEX_URL, { signal, cache: 'no-cache' }), 2 * 1024 * 1024);
      return parseFieldlineCatalog(JSON.parse(new TextDecoder().decode(bytes)));
    },
    async frame(shot: FieldlineShot, index: number, signal: AbortSignal) {
      signal.throwIfAborted();
      if (prepared?.key === shotKey(shot)) {
        insist(prepared.frames[index], 'Missing prepared field-line frame.');
        return prepared.frames[index];
      }
      const chunk = shot.chunks.find((c) => index >= c.firstIndex && index < c.firstIndex + c.frameCount);
      insist(chunk, 'Missing field-line chunk.');
      const frames = await abortableFrame(loadChunk(shot, chunk), signal); signal.throwIfAborted();
      return frames[index - chunk.firstIndex];
    },
    retain, prepareShot,
    clear() { retain(); cache.clear(); },
  };
}

function abortableFrame<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    task.then((value) => { signal.removeEventListener('abort', abort); resolve(value); },
      (error) => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
