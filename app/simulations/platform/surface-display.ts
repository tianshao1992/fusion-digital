import { FIELD_SLICE_CELL_BUDGET } from '../flux-surface-geometry.ts';
import { interpolateProfile, type TransportResult } from './contracts.ts';
import { displayUnit } from './display.ts';
import type { FieldCell, TransportGeometry } from './geometry.ts';

export type TransportColorScale = {
  scale: number;
  unit: string;
  minimum: number;
  maximum: number;
};

const topologyEpsilon = 1e-10;
const turn = (a: [number, number], b: [number, number], c: [number, number]) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Reject folded quads; only the rho=0 axis band may collapse to a triangle. */
function cellWinding(points: [number, number][]): -1 | 0 | 1 {
  if (points.length !== 4) return 0;
  const collapsedAxis = Math.hypot(points[2][0] - points[3][0], points[2][1] - points[3][1]) < topologyEpsilon;
  const turns = (collapsedAxis ? [0, 3] : [0, 1, 2, 3])
    .map(index => turn(points[index], points[(index + 1) % 4], points[(index + 2) % 4]));
  if (turns.some(value => Math.abs(value) <= topologyEpsilon)) return 0;
  const sign = Math.sign(turns[0]);
  return turns.every(value => Math.sign(value) === sign) ? sign as -1 | 1 : 0;
}

function intersects(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const cross = (p: [number, number], q: [number, number], r: [number, number]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = cross(a, b, c), abD = cross(a, b, d);
  const cdA = cross(c, d, a), cdB = cross(c, d, b);
  const epsilon = 1e-10;
  if ((abC > epsilon && abD < -epsilon || abC < -epsilon && abD > epsilon) &&
      (cdA > epsilon && cdB < -epsilon || cdA < -epsilon && cdB > epsilon)) return true;
  const on = (p: [number, number], q: [number, number], r: [number, number]) =>
    Math.abs(cross(p, q, r)) <= epsilon &&
    r[0] >= Math.min(p[0], q[0]) - epsilon && r[0] <= Math.max(p[0], q[0]) + epsilon &&
    r[1] >= Math.min(p[1], q[1]) - epsilon && r[1] <= Math.max(p[1], q[1]) + epsilon;
  return on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

function simpleClosedRing(points: [number, number][]): boolean {
  const count = points.length - 1;
  for (let i = 0; i < count; i++) for (let j = i + 2; j < count; j++) {
    if (i === 0 && j === count - 1) continue; // First and last edges share the seam.
    if (intersects(points[i], points[i + 1], points[j], points[j + 1])) return false;
  }
  return true;
}

function insideRing(point: [number, number], points: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length - 1; j = i++) {
    const a = points[j], b = points[i];
    const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
    if (Math.abs(cross) < 1e-10 && point[0] >= Math.min(a[0], b[0]) - 1e-10 &&
        point[0] <= Math.max(a[0], b[0]) + 1e-10 && point[1] >= Math.min(a[1], b[1]) - 1e-10 &&
        point[1] <= Math.max(a[1], b[1]) + 1e-10) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
        point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** One numerical scale for a TORAX quantity in both the 2-D and 3-D views. */
export function transportColorScale(result: TransportResult, variable: string, cells: FieldCell[], fixedScale: boolean, surfaceTimeIndex?: number): TransportColorScale {
  const profile = result.profiles.find(item => item.id === variable);
  const nativeUnit = variable === 'input_psi' ? 'Wb' : variable === 'input_psi_norm' ? '1' : profile?.unit ?? '1';
  const [scale, unit] = displayUnit(nativeUnit);
  // A selectable 3-D ring can lie outside the sampled 2-D cell-centre extrema.
  // Include its same-time native source row in the common R-Z/3-D scale.
  const values = fixedScale && profile ? profile.values.flat() : [
    ...cells.map(cell => cell.value),
    ...(surfaceTimeIndex !== undefined ? profile?.values[surfaceTimeIndex] ?? [] : []),
  ];
  let minimum = Infinity, maximum = -Infinity;
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) continue;
    minimum = Math.min(minimum, value * scale);
    maximum = Math.max(maximum, value * scale);
  }
  if (!Number.isFinite(minimum)) { minimum = 0; maximum = 1; }
  if (minimum === maximum) maximum += Math.max(1, Math.abs(minimum) * .01);
  return { scale, unit, minimum, maximum };
}

/** Fixed reconstructed rho rings are display geometry, never a solved psi contour. */
export function selectableTransportRings(geometry: TransportGeometry | null, result: TransportResult): TransportGeometry['rings'] {
  if (!result || result.schema !== 'transport-timeseries.v1' || result.authority !== 'simulated' ||
      result.recordKind !== 'simulation-run' || result.engine?.id !== 'torax' ||
      !geometry || geometry.schema !== 'transport-geometry.v1' || geometry.authority !== 'derived-display' ||
      geometry.kind !== 'shape-reconstruction' || geometry.grid !== null || geometry.cocos !== null ||
      geometry.timeReference !== 'fixed-input-geometry' || geometry.coordinate !== 'R-Z' || geometry.unit !== 'm' ||
      geometry.runId !== result.id || geometry.sourceNativeSha256 !== result.provenance.nativeSha256 ||
      !Array.isArray(geometry.assumptions) ||
      !geometry.assumptions.includes('not-a-2D-equilibrium-solve') ||
      !geometry.assumptions.includes('profiles-constant-on-reconstructed-surfaces') ||
      !Array.isArray(geometry.axis) || geometry.axis.length !== 2 || !geometry.axis.every(Number.isFinite) ||
      !Array.isArray(geometry.rings) || geometry.rings.length < 3 || geometry.rings.length > 1025 ||
      geometry.rings[0].rho !== 0 || geometry.rings.at(-1)?.rho !== 1) return [];
  const candidates = geometry.rings.filter(ring => {
    if (!(ring.rho > 0 && ring.rho <= 1) || !Array.isArray(ring.points) || ring.points.length < 4 ||
        ring.points.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) return false;
    const first = ring.points[0], last = ring.points.at(-1)!;
    const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-8;
    const r = ring.points.map(point => point[0]), z = ring.points.map(point => point[1]);
    let area = 0;
    for (let i = 0; i < ring.points.length - 1; i++) {
      const a = ring.points[i], b = ring.points[i + 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-10) return false;
      area += a[0] * b[1] - b[0] * a[1];
    }
    return closed && Math.max(...r) - Math.min(...r) > 1e-8 && Math.max(...z) - Math.min(...z) > 1e-8 &&
      Math.abs(area) > 1e-8 && simpleClosedRing(ring.points) && insideRing(geometry.axis, ring.points);
  });
  // The R-Z cut plane consumes the full source ring set. A partially accepted
  // geometry must not produce a qualified 3-D surface beside unreviewed cells.
  if (candidates.length !== geometry.rings.length - 1) return [];
  const nested: typeof candidates = [];
  for (const ring of candidates) {
    const previous = nested.at(-1);
    if (previous && (ring.rho <= previous.rho || !previous.points.slice(0, -1).every(point => insideRing(point, ring.points)))) return [];
    nested.push(ring);
  }
  const axisRing = geometry.rings[0];
  if (axisRing.points.length !== candidates[0].points.length ||
      axisRing.points.some(point => Math.hypot(point[0] - geometry.axis[0], point[1] - geometry.axis[1]) > 1e-8)) return [];
  const signedArea = candidates[0].points.slice(0, -1).reduce((sum, point, index) =>
    sum + turn([0, 0], point, candidates[0].points[index + 1]), 0);
  const winding = Math.sign(signedArea);
  for (let i = 1; i < geometry.rings.length; i++) {
    const inner = geometry.rings[i - 1].points, outer = geometry.rings[i].points;
    if (inner.length !== outer.length) return [];
    for (let j = 0; j < outer.length - 1; j++) {
      if (cellWinding([outer[j], outer[j + 1], inner[j + 1], inner[j]]) !== winding) return [];
    }
  }
  return nested;
}

export function transportSurfaceValue(result: TransportResult, variable: string, timeIndex: number, rho: number): number | null {
  const profile = result.profiles.find(item => item.id === variable);
  const axis = result.axes.find(item => item.id === profile?.axisId);
  if (!profile || !axis || !Number.isInteger(timeIndex) || timeIndex < 0 || timeIndex >= profile.values.length) return null;
  return interpolateProfile(axis.values, profile.values[timeIndex], rho);
}

export type TransportCutPlane = { positions: Float32Array; values: Float32Array; indices: Uint32Array; cells: number };

/** The same bounded, non-interpolated section cells used by the quantitative 2-D view. */
export function transportCutPlane(cells: FieldCell[]): TransportCutPlane {
  if (cells.length > FIELD_SLICE_CELL_BUDGET || cells.some(cell => cell.polygon.length !== 4 ||
      !Number.isFinite(cell.value) || cell.polygon.some(point => point.length !== 2 || !point.every(Number.isFinite)) ||
      cellWinding(cell.polygon) === 0)) {
    throw new Error('TRANSPORT_CUT_PLANE_BUDGET_OR_COORDINATES');
  }
  const positions = new Float32Array(cells.length * 12);
  const values = new Float32Array(cells.length * 4);
  const indices = new Uint32Array(cells.length * 6);
  cells.forEach((cell, index) => {
    cell.polygon.forEach(([r, z], corner) => {
      const vertex = index * 4 + corner;
      positions.set([r, z, 0], vertex * 3);
      values[vertex] = cell.value;
    });
    const vertex = index * 4;
    indices.set([vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3], index * 6);
  });
  return { positions, values, indices, cells: cells.length };
}
