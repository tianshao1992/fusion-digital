import type { PhysicsData } from './physics';
import type { FluxCoordinateMap } from './flux-coordinate-map';
import { normalizedPoloidalFlux, sampleSpatialFieldAtPsiNorm, spatialFieldUnavailableReason, type SpatialFieldChannel } from './equilibrium-field';

export const FIELD_DISPLAY_MAX_EDGE = 1024;
export type FieldDisplayRaster = {
  width: number;
  height: number;
  bounds: [rMin: number, rMax: number, zMin: number, zMax: number];
  values: Float32Array;
};

function interval(axis: number[], value: number): number {
  if (value < axis[0] || value > axis.at(-1)!) return -1;
  let low = 0, high = axis.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (axis[mid] <= value) low = mid; else high = mid;
  }
  return low;
}

/** Bounded native-grid interpolation for presentation only. No missing-value filling. */
export function interpolateDisplayGrid(r: number[], z: number[], grid: (number | null)[][], rM: number, zM: number): number | null {
  if (!Number.isFinite(rM) || !Number.isFinite(zM)) return null;
  const i = interval(r, rM), j = interval(z, zM);
  if (i < 0 || j < 0) return null;
  const corners = [grid[j]?.[i], grid[j]?.[i + 1], grid[j + 1]?.[i], grid[j + 1]?.[i + 1]];
  if (corners.some(v => typeof v !== 'number' || !Number.isFinite(v))) return null;
  const [a, b, c, d] = corners as number[];
  const u = (rM - r[i]) / (r[i + 1] - r[i]), v = (zM - z[j]) / (z[j + 1] - z[j]);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Supersampled display, clipped by the original LCFS mesh in the viewer.
 * Native arrays, the quantitative 2-D view and exported results remain unchanged.
 * Interpolate psi before mapping profiles, preserving flux-surface semantics.
 */
export function buildFieldDisplayRaster(data: PhysicsData, channel: SpatialFieldChannel, coordinateMap?: FluxCoordinateMap, longestEdge = 768): FieldDisplayRaster {
  if (!Number.isInteger(longestEdge) || longestEdge < 16 || longestEdge > FIELD_DISPLAY_MAX_EDGE) throw new Error('FIELD_DISPLAY_BUDGET');
  const unavailable = spatialFieldUnavailableReason(data, channel, coordinateMap);
  if (unavailable) throw new Error(unavailable);
  const { r, z, psi, boundary } = data.equilibrium;
  if ([r, z].some(axis => axis.length < 2 || axis.some((v, i) => !Number.isFinite(v) || (i > 0 && v <= axis[i - 1]))) ||
      psi.length !== z.length || psi.some(row => row.length !== r.length) ||
      boundary.length < 3 || boundary.some(p => p.length !== 2 || !p.every(Number.isFinite))) throw new Error('FIELD_DISPLAY_GRID');
  const bounds: FieldDisplayRaster['bounds'] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const [br, bz] of boundary) {
    bounds[0] = Math.min(bounds[0], br); bounds[1] = Math.max(bounds[1], br);
    bounds[2] = Math.min(bounds[2], bz); bounds[3] = Math.max(bounds[3], bz);
  }
  const rSpan = bounds[1] - bounds[0], zSpan = bounds[3] - bounds[2];
  if (!(rSpan > 0 && zSpan > 0)) throw new Error('FIELD_DISPLAY_BOUNDS');
  const span = Math.max(rSpan, zSpan);
  const width = Math.max(2, Math.round(longestEdge * rSpan / span));
  const height = Math.max(2, Math.round(longestEdge * zSpan / span));
  const values = new Float32Array(width * height).fill(NaN);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const psiWb = interpolateDisplayGrid(r, z, psi, bounds[0] + (x + 0.5) / width * rSpan, bounds[2] + (y + 0.5) / height * zSpan);
    if (psiWb === null) continue;
    const psiN = normalizedPoloidalFlux(psiWb, data.equilibrium.psiAxis, data.equilibrium.psiBoundary);
    const field = sampleSpatialFieldAtPsiNorm(data, channel, psiN, coordinateMap, psiWb);
    if (field) values[y * width + x] = field.value;
  }
  return { width, height, bounds, values };
}
