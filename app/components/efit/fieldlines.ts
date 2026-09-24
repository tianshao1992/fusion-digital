/** Public, line-only derivative. Source H5 and magnetic-field grids stay private. */
export const FIELDLINE_INDEX_URL = '/device-data/exl50u-fieldlines-v1/index.json';
export const FIELDLINE_COLORS = ['#ffdf00', '#ff5266', '#42a5ff', '#92ff53', '#ff75d8'] as const;
export type FieldlineSummary = {
  index: number; sourceIndex: number; timeMs: number; state: 'valid' | 'unavailable';
  reason?: string; lineCount: number; maxPsiNDrift: number;
};
export type FieldlineChunk = { file: string; firstIndex: number; frameCount: number; byteLength: number; sha256: string };
export type FieldlineShot = {
  shot: number; sourceSha256: string; sourceFrameCount: number;
  frames: FieldlineSummary[]; chunks: FieldlineChunk[];
};
export type FieldlineCatalog = {
  schemaVersion: 'fusion.efit.fieldlines.v1'; model: 'axisymmetric-equilibrium';
  coordinates: 'R-phi-Z:m-rad-m'; algorithmVersion: string; seedPsiN: number[]; phiDegrees: number;
  shots: FieldlineShot[];
};
export type Fieldline = {
  psiN: number; points: number[]; maxPsiNDrift: number;
  termination: [string, string]; arcLengthM: [number, number];
};
export type FieldlineFrame = {
  shot: number; index: number; sourceIndex: number; timeMs: number;
  state: 'valid' | 'unavailable'; reason?: string; lines: Fieldline[];
  boundaryRz: number[]; axisRz: number[];
};
export type FieldlineView = { frame: FieldlineFrame | null; xray: boolean; clip: boolean };

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
  insist(data.schemaVersion === 'fusion.efit.fieldlines.v1' && data.model === 'axisymmetric-equilibrium'
    && data.coordinates === 'R-phi-Z:m-rad-m' && data.phiDegrees === 300, 'Unsupported field-line convention.');
  insist(typeof data.algorithmVersion === 'string' && data.algorithmVersion.length < 128, 'Missing algorithm version.');
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
      previous = frame.timeMs;
    }
    insist(Array.isArray(shot.chunks) && shot.chunks.length <= 128, 'Invalid chunk count.');
    let count = 0;
    for (const [i, raw] of shot.chunks.entries()) {
      const chunk = obj(raw);
      insist(chunk.file === `shot-${shot.shot}-part-${String(i).padStart(3, '0')}.jsonl.gz`, 'Unsafe asset path.');
      insist(chunk.firstIndex === count && integer(chunk.frameCount, 1, 16)
        && integer(chunk.byteLength, 1, 4 * 1024 * 1024) && digest(chunk.sha256), 'Invalid chunk identity or budget.');
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
    insist(Array.isArray(line.points) && line.points.length >= 6 && line.points.length <= 3 * 1024
      && line.points.length % 3 === 0, 'Invalid line point budget.');
    for (let p = 0; p < line.points.length; p += 3) {
      const [r, phi, z] = line.points.slice(p, p + 3);
      insist(finite(r) && r >= 0.2 && r <= 2.2 && finite(phi) && Math.abs(phi) <= 20
        && finite(z) && Math.abs(z) <= 1.901, 'Field-line point escaped the source domain.');
    }
    insist(Array.isArray(line.arcLengthM) && line.arcLengthM.length === 2
      && line.arcLengthM.every((n) => finite(n) && n >= 0 && n <= 10.001), 'Invalid traced length.');
    insist(Array.isArray(line.termination) && line.termination.length === 2
      && line.termination.every((s) => typeof s === 'string' && s.length <= 80), 'Missing termination evidence.');
  }
  insist(Array.isArray(data.boundaryRz) && data.boundaryRz.length <= 4096 && data.boundaryRz.length % 2 === 0
    && data.boundaryRz.every((n) => finite(n) && Math.abs(n) <= 3), 'Invalid boundary.');
  insist(Array.isArray(data.axisRz) && (data.axisRz.length === 2 || data.state === 'unavailable' && data.axisRz.length === 0)
    && data.axisRz.every((n) => finite(n) && Math.abs(n) <= 3), 'Invalid magnetic axis.');
  return data as FieldlineFrame;
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

export function createFieldlineSource(fetcher: typeof fetch = fetch) {
  // Keep four decoded chunks; rapid seeks retain only current + next downloads.
  const cache = new Map<string, FieldlineFrame[]>();
  const pending = new Map<string, { task: Promise<FieldlineFrame[]>; controller: AbortController }>();
  const keyFor = (shot: FieldlineShot, chunk: FieldlineChunk) => `${shot.sourceSha256}:${chunk.sha256}`;
  function retain(shot?: FieldlineShot, index?: number) {
    const part = shot?.chunks.findIndex((c) => index !== undefined && index >= c.firstIndex && index < c.firstIndex + c.frameCount) ?? -1;
    const wanted = new Set(shot && part >= 0 ? shot.chunks.slice(part, part + 2).map((c) => keyFor(shot, c)) : []);
    for (const [key, entry] of pending) if (!wanted.has(key)) { entry.controller.abort(); pending.delete(key); }
  }
  async function loadChunk(shot: FieldlineShot, chunk: FieldlineChunk, sessionSignal: AbortSignal) {
    const key = `${shot.sourceSha256}:${chunk.sha256}`;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    const inflight = pending.get(key); if (inflight && !inflight.controller.signal.aborted) return inflight.task;
    const controller = new AbortController(); const signal = AbortSignal.any([sessionSignal, controller.signal]);
    const task = (async () => {
      const response = await fetcher(`${FIELDLINE_INDEX_URL.slice(0, -10)}${chunk.file}`, { signal });
      const bytes = await limitedBytes(response, chunk.byteLength);
      insist(bytes.byteLength === chunk.byteLength, 'Truncated field-line chunk.');
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), (b) => b.toString(16).padStart(2, '0')).join('');
      signal.throwIfAborted();
      insist(hash === chunk.sha256 && bytes[0] === 31 && bytes[1] === 139, 'Field-line hash mismatch.');
      const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
      const decoded = await limitedBytes(new Response(stream), 8 * 1024 * 1024);
      signal.throwIfAborted();
      const rows = new TextDecoder().decode(decoded).trim().split('\n');
      insist(rows.length === chunk.frameCount, 'Field-line chunk frame count mismatch.');
      const frames = rows.map((row, i) => parseFieldlineFrame(JSON.parse(row), shot, shot.frames[chunk.firstIndex + i]));
      signal.throwIfAborted(); cache.set(key, frames);
      while (cache.size > 4) cache.delete(cache.keys().next().value!);
      return frames;
    })().finally(() => { if (pending.get(key)?.controller === controller) pending.delete(key); });
    pending.set(key, { task, controller }); return task;
  }
  return {
    async catalog(signal: AbortSignal) {
      const bytes = await limitedBytes(await fetcher(FIELDLINE_INDEX_URL, { signal, cache: 'no-cache' }), 1024 * 1024);
      return parseFieldlineCatalog(JSON.parse(new TextDecoder().decode(bytes)));
    },
    async frame(shot: FieldlineShot, index: number, signal: AbortSignal) {
      signal.throwIfAborted();
      const chunk = shot.chunks.find((c) => index >= c.firstIndex && index < c.firstIndex + c.frameCount);
      insist(chunk, 'Missing field-line chunk.');
      const frames = await loadChunk(shot, chunk, signal); signal.throwIfAborted();
      return frames[index - chunk.firstIndex];
    },
    retain,
    clear() { retain(); cache.clear(); },
  };
}
