import type { EfitFrameSummary } from './types';

export type EfitSignalSeriesPoint = [timeMs: number, value: number | null];

/**
 * Keeps the reviewed source-frame order and inserts an explicit empty sample
 * wherever the real EFIT timeline has one or more missing milliseconds.
 * ECharts can then leave the interval blank instead of drawing a misleading
 * straight bridge across data that was never reconstructed.
 */
export function buildGapAwareSignalSeries(
  timeline: readonly EfitFrameSummary[],
  value: (frame: EfitFrameSummary) => number,
): EfitSignalSeriesPoint[] {
  const points: EfitSignalSeriesPoint[] = [];
  let previousTimeMs: number | undefined;

  timeline.forEach((frame) => {
    if (previousTimeMs !== undefined && frame.timeMs > previousTimeMs + 1) {
      points.push([previousTimeMs + 1, null]);
    }
    const sample = value(frame);
    points.push([frame.timeMs, Number.isFinite(sample) ? sample : null]);
    previousTimeMs = frame.timeMs;
  });

  return points;
}
