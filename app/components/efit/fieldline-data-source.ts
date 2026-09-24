import { createFieldlineSource, type FieldlineFrame, type FieldlineShot, type FieldlineSummary } from './fieldlines';
import type { EfitDataSource, EfitFrame, EfitFrameSummary, EfitManifest, EfitShotManifest } from './types';

const GEOMETRY_ID = 'imas-source-grid-no-verified-wall';
export function fieldlineEfitSummary(shot: number, frame: FieldlineSummary): EfitFrameSummary {
  const s = frame.efitScalars;
  return { shot, index: frame.sourceIndex, timeMs: frame.timeMs,
    quality: { flags: 0, state: s ? 'good' : 'invalid', messages: [] },
    currentA: s?.currentA ?? NaN, rAxisM: s?.rAxisM ?? NaN, zAxisM: s?.zAxisM ?? NaN,
    bcentrT: s?.bcentrT ?? NaN, psiAxisWbPerRad: s ? s.psiAxisWb / (2 * Math.PI) : NaN,
    psiBoundaryWbPerRad: s ? s.psiBoundaryWb / (2 * Math.PI) : NaN,
    q95: s?.q95 ?? undefined, surfaceMask: 0, lcfsValidPoints: 0, offsetBytes: 0 };
}

export function fieldlineEfitFrame(shot: FieldlineShot, frame: FieldlineFrame): EfitFrame {
  const contours = frame.efitContours.map((c) => ({
    psiN: c.psiN, kind: c.psiN === 1 ? 'lcfs' as const : 'surface' as const, closed: c.closed,
    rM: c.pointsRzM.filter((_, i) => i % 2 === 0), zM: c.pointsRzM.filter((_, i) => i % 2 === 1),
    validPoints: c.pointsRzM.length / 2,
  }));
  const lcfs = contours.find((c) => c.kind === 'lcfs');
  return { ...fieldlineEfitSummary(shot.shot, shot.frames[frame.sourceIndex]), contours,
    ...(frame.efitScalars && (frame.state !== 'valid' || contours.length < 6) ? {
      quality: { flags: 0, state: 'warning' as const, messages: ['Source consistency or contour checks are incomplete.'] },
    } : {}),
    surfaceMask: 31, lcfsValidPoints: lcfs?.validPoints ?? 0,
    lcfsRMinM: lcfs ? Math.min(...lcfs.rM) : null, lcfsRMaxM: lcfs ? Math.max(...lcfs.rM) : null,
    fieldlineFrame: frame };
}

/** Extend the original ten shots without changing their data path or playback logic. */
export function withFieldlineEquilibria(base: EfitDataSource, fetcher: typeof fetch = fetch): EfitDataSource {
  const source = createFieldlineSource(fetcher);
  let manifest: EfitManifest | null = null;
  let rawShots: FieldlineShot[] = [];
  let currentRaw: { shot: number; part: number } | null = null;
  const controller = new AbortController();
  const converted = new WeakMap<FieldlineFrame, EfitFrame>();
  async function loadManifest(request?: { signal?: AbortSignal }) {
    if (manifest) return manifest;
    const signal = request?.signal ?? controller.signal;
    const [original, catalog] = await Promise.all([base.loadManifest(request), source.catalog(signal)]);
    rawShots = catalog.shots;
    const added: EfitShotManifest[] = rawShots.map((shot) => ({
      shot: shot.shot, geometryId: GEOMETRY_ID,
      catalog: { datasetId: shot.sourceSha256, reconstructionLabel: 'IMAS H5 · EFIT + field lines' },
      frameCount: shot.frames.length, minTimeMs: shot.frames[0].timeMs, maxTimeMs: shot.frames.at(-1)!.timeMs,
      gaps: shot.frames.flatMap((f, i) => i && f.timeMs - shot.frames[i - 1].timeMs > 1.5
        ? [{ afterMs: shot.frames[i - 1].timeMs, beforeMs: f.timeMs, missingCount: Math.round(f.timeMs - shot.frames[i - 1].timeMs) - 1 }] : []),
      frames: shot.frames.map((f) => fieldlineEfitSummary(shot.shot, f)),
    }));
    if (added.some((shot) => original.shots.some((old) => old.shot === shot.shot))) throw new Error('Duplicate EFIT source shot.');
    manifest = { ...original, shots: [...original.shots, ...added], geometries: [...(original.geometries ?? []), {
      geometryId: GEOMETRY_ID, limiterRzM: { rM: [], zM: [], validPoints: 0 },
      gridExtentM: [.2, 2.2, -1.9, 1.9], coordinateSystem: 'R-Z metres; wall geometry not verified',
    }] };
    return manifest;
  }
  return {
    dispose() { controller.abort(); source.clear(); base.dispose?.(); },
    loadManifest,
    async loadTimeline(shotId, request) {
      await loadManifest(request);
      return rawShots.some((s) => s.shot === shotId)
        ? manifest!.shots.find((s) => s.shot === shotId)!.frames : base.loadTimeline(shotId, request);
    },
    async prepareShot(shotId, request) {
      currentRaw = null;
      const shot = rawShots.find((s) => s.shot === shotId);
      if (shot) await source.prepareShot(shot, request?.signal ?? controller.signal, request?.onProgress);
      else { source.retain(); await base.prepareShot?.(shotId, request); }
    },
    async loadFrame(shotId, index, request) {
      const shot = rawShots.find((s) => s.shot === shotId);
      if (!shot) return base.loadFrame(shotId, index, request);
      currentRaw = { shot: shotId, part: shot.chunks.findIndex((c) => index >= c.firstIndex && index < c.firstIndex + c.frameCount) };
      source.retain(shot, index);
      const frame = await source.frame(shot, index, request?.signal ?? controller.signal);
      let result = converted.get(frame);
      if (!result) { result = fieldlineEfitFrame(shot, frame); converted.set(frame, result); }
      return result;
    },
    prefetchFrame(shotId, index) {
      const shot = rawShots.find((s) => s.shot === shotId);
      if (!shot) { base.prefetchFrame?.(shotId, index); return; }
      if (currentRaw?.shot !== shotId) return;
      const part = shot.chunks.findIndex((c) => index >= c.firstIndex && index < c.firstIndex + c.frameCount);
      if (part < currentRaw.part || part > currentRaw.part + 1) return;
      // Only adjacent chunk; no second whole-shot cache or independent playback clock.
      void source.frame(shot, index, controller.signal).catch(() => undefined);
    },
  };
}
