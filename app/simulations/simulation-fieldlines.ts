import type { PhysicsData, RZ } from './physics';
import type { TransportResult } from './platform/contracts';
import type { TransportGeometry } from './platform/geometry';

/** These are display seeds, not additional solved flux surfaces. */
export const SIMULATION_FIELDLINE_LEVELS = [0.2, 0.4, 0.6, 0.8, 0.9] as const;
const MAX_SOURCE_POINTS = 2048;
const MAX_OUTPUT_POINTS = 4095;
const MAX_ABS_Q = 32;
const MAX_WORLD_CHORD_M = 0.3;
const MAX_TOROIDAL_STEP_RAD = 0.12;

export type SimulationFieldLine = {
  /** Renderer colour-order compatibility. For TORAX this is rho_tor_norm, NOT psi_norm. */
  psiNorm: number;
  coordinateValue: number;
  q: number;
  /** Flat [R(m), unwrapped phi(rad), Z(m)] points; the 3D ends are never joined. */
  pointsRphiZ: number[];
};

export type SimulationFieldLineSet = {
  authority: 'derived-display';
  method: 'q-constrained-geometric-helix';
  engineId: 'fuse' | 'torax';
  runId: string;
  timeSeconds: number;
  coordinate: 'psi_norm' | 'rho_tor_norm';
  geometryTimeReference: 'equilibrium-snapshot' | 'fixed-input-geometry';
  lines: SimulationFieldLine[];
};

type Point = readonly [number, number];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const near = (a: number, b: number, tolerance = 1e-8) => Math.abs(a - b) <= tolerance;

function sampledQ(x: readonly number[], values: readonly (number | null)[], coordinate: number): number | null {
  if (!Array.isArray(x) || !Array.isArray(values) || x.length < 2 || x.length !== values.length
    || !x.every((value, index) => finite(value) && (index === 0 || value > x[index - 1]))
    || coordinate < x[0] || coordinate > x[x.length - 1]) return null;
  const upper = x.findIndex(value => value >= coordinate);
  if (upper < 0) return null;
  const lower = Math.max(upper - 1, 0);
  const a = values[lower], b = values[upper];
  // Missing samples must not be interpolated through or replaced by zero.
  if (!finite(b)) return null;
  if (upper === lower || x[upper] === coordinate) return boundedQ(b);
  if (!finite(a)) return null;
  if (Math.sign(a!) !== Math.sign(b)) return null;
  return boundedQ(a! + (b - a!) * (coordinate - x[lower]) / (x[upper] - x[lower]));
}

function boundedQ(value: number): number | null {
  return finite(value) && Math.abs(value) >= 1e-6 && Math.abs(value) <= MAX_ABS_Q ? value : null;
}

function insidePolygon(axis: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > axis[1]) !== (yj > axis[1])
      && axis[0] < (xj - xi) * (axis[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function intersectNonAdjacent(a: Point, b: Point, c: Point, d: Point): boolean {
  // Reject both proper crossings and non-adjacent touching/overlapping edges.
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0])
    || Math.max(c[0], d[0]) < Math.min(a[0], b[0])
    || Math.max(a[1], b[1]) < Math.min(c[1], d[1])
    || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
  const orientation = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1])
    - (q[1] - p[1]) * (r[0] - p[0]);
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  const opposite = (x: number, y: number) => (x > 0 && y < 0) || (x < 0 && y > 0);
  const onSegment = (p: Point, q: Point, r: Point) => r[0] >= Math.min(p[0], q[0])
    && r[0] <= Math.max(p[0], q[0]) && r[1] >= Math.min(p[1], q[1])
    && r[1] <= Math.max(p[1], q[1]);
  return (opposite(abC, abD) && opposite(cdA, cdB))
    || (abC === 0 && onSegment(a, b, c)) || (abD === 0 && onSegment(a, b, d))
    || (cdA === 0 && onSegment(c, d, a)) || (cdB === 0 && onSegment(c, d, b));
}

/** Build a closed, CCW source contour starting at its outboard-most sample. */
function preparedContour(path: readonly Point[], axis: Point): Point[] | null {
  if (!Array.isArray(path) || path.length < 17 || path.length > MAX_SOURCE_POINTS
    || !path.every(point => Array.isArray(point) && point.length === 2
      && finite(point[0]) && point[0] > 0 && point[0] < 10000
      && finite(point[1]) && Math.abs(point[1]) < 10000)
    || Math.hypot(path[0][0] - path[path.length - 1][0], path[0][1] - path[path.length - 1][1]) > 1e-6) return null;
  let points = path.slice(0, -1);
  if (points.length < 16 || !insidePolygon(axis, points)) return null;
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i], next = points[(i + 1) % points.length];
    if (Math.hypot(next[0] - current[0], next[1] - current[1]) < 1e-10) return null;
    area2 += current[0] * next[1] - next[0] * current[1];
  }
  if (Math.abs(area2) < 1e-10) return null;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 2; j < points.length; j++) {
      if (i === 0 && j === points.length - 1) continue; // Adjacent around the closure.
      if (intersectNonAdjacent(points[i], points[(i + 1) % points.length],
        points[j], points[(j + 1) % points.length])) return null;
    }
  }
  if (area2 < 0) points = points.toReversed();
  const start = points.reduce((best, point, index) => point[0] > points[best][0] + 1e-10
    || (near(point[0], points[best][0], 1e-10) && Math.abs(point[1] - axis[1]) < Math.abs(points[best][1] - axis[1]))
    ? index : best, 0);
  const rotated = [...points.slice(start), ...points.slice(0, start)];
  return [...rotated, rotated[0]];
}

/**
 * A q-constrained *geometric illustration*. Equal contour-arc-length fractions
 * advance phi by 2*pi*q; this does not integrate Br/Bphi/Bz and is not an EFIT
 * field-line result. q controls only net winding and signed handedness.
 */
function illustrate(path: readonly Point[], axis: Point, q: number, level: number): SimulationFieldLine | null {
  const contour = preparedContour(path, axis);
  if (!contour) return null;
  const cumulative = [0];
  for (let i = 1; i < contour.length; i++) cumulative.push(cumulative[i - 1]
    + Math.hypot(contour[i][0] - contour[i - 1][0], contour[i][1] - contour[i - 1][1]));
  const perimeter = cumulative.at(-1)!;
  if (!finite(perimeter) || perimeter <= 1e-8) return null;
  const maxRadius = Math.max(...contour.map(point => point[0]));
  const toroidalSpan = 2 * Math.PI * Math.abs(q);
  const segments = Math.max(256, contour.length * 2,
    Math.ceil(toroidalSpan / MAX_TOROIDAL_STEP_RAD),
    Math.ceil(toroidalSpan * maxRadius / MAX_WORLD_CHORD_M));
  if (segments + 1 > MAX_OUTPUT_POINTS) return null;
  const pointsRphiZ: number[] = [];
  let edge = 1;
  for (let i = 0; i <= segments; i++) {
    const fraction = i / segments, distance = fraction * perimeter;
    while (edge < cumulative.length - 1 && cumulative[edge] < distance) edge++;
    const span = cumulative[edge] - cumulative[edge - 1];
    if (span <= 0) return null;
    const weight = Math.max(0, Math.min(1, (distance - cumulative[edge - 1]) / span));
    const r = contour[edge - 1][0] + weight * (contour[edge][0] - contour[edge - 1][0]);
    const z = contour[edge - 1][1] + weight * (contour[edge][1] - contour[edge - 1][1]);
    pointsRphiZ.push(r, fraction * 2 * Math.PI * q, z);
  }
  if (!pointsRphiZ.every(finite)) return null;
  return { psiNorm: level, coordinateValue: level, q, pointsRphiZ };
}

export function buildFuseQFieldLines(data: PhysicsData): SimulationFieldLineSet | null {
  if (!data || !['fuse-physics.v1', 'fuse-physics.v2'].includes(data.schema)
    || data.authority !== 'simulated' || data.cocos !== 11
    || !/^[a-zA-Z0-9._-]{1,100}$/.test(data.runId) || !finite(data.timeSeconds)
    || !data.equilibrium || !Array.isArray(data.equilibrium.contours)
    || data.equilibrium.arrayOrder !== 'z,r' || data.equilibrium.psiUnit !== 'Wb'
    || !Array.isArray(data.equilibrium.axis) || data.equilibrium.axis.length !== 2
    || !data.equilibrium.axis.every(finite) || !Array.isArray(data.profiles)) return null;
  const qProfiles = data.profiles.filter(profile => profile.id === 'q');
  if (qProfiles.length !== 1 || qProfiles[0].axis !== 'psi_norm' || qProfiles[0].unit !== '1'
    || qProfiles[0].source !== 'equilibrium.time_slice.profiles_1d.q') return null;
  const lines: SimulationFieldLine[] = [];
  for (const level of SIMULATION_FIELDLINE_LEVELS) {
    const contours = data.equilibrium.contours.filter(contour => near(contour.psiNorm, level));
    if (contours.length !== 1 || contours[0].paths.length !== 1) return null;
    const q = sampledQ(qProfiles[0].x, qProfiles[0].y, level);
    if (q === null) return null;
    const line = illustrate(contours[0].paths[0] as RZ, data.equilibrium.axis, q, level);
    if (!line) return null;
    lines.push(line);
  }
  return { authority: 'derived-display', method: 'q-constrained-geometric-helix',
    engineId: 'fuse', runId: data.runId, timeSeconds: data.timeSeconds,
    coordinate: 'psi_norm', geometryTimeReference: 'equilibrium-snapshot', lines };
}

export function buildToraxQFieldLines(result: TransportResult, geometry: TransportGeometry | null,
  timeIndex: number): SimulationFieldLineSet | null {
  if (!result || result.schema !== 'transport-timeseries.v1' || result.authority !== 'simulated'
    || result.recordKind !== 'simulation-run' || result.engine?.id !== 'torax'
    || !Number.isInteger(timeIndex) || !Array.isArray(result.time?.values)
    || timeIndex < 0 || timeIndex >= result.time.values.length || !finite(result.time.values[timeIndex])
    || !geometry || geometry.schema !== 'transport-geometry.v1' || geometry.authority !== 'derived-display'
    || geometry.kind !== 'shape-reconstruction' || geometry.grid !== null
    || geometry.timeReference !== 'fixed-input-geometry' || geometry.cocos !== null
    || geometry.coordinate !== 'R-Z' || geometry.unit !== 'm'
    || geometry.runId !== result.id || geometry.sourceNativeSha256 !== result.provenance?.nativeSha256
    || !Array.isArray(geometry.axis) || geometry.axis.length !== 2 || !geometry.axis.every(finite)
    || !Array.isArray(geometry.rings) || geometry.rings.length < 3 || geometry.rings.length > 1025
    || geometry.rings[0].rho !== 0 || geometry.rings.at(-1)?.rho !== 1
    || geometry.rings.some((ring, index) => !finite(ring?.rho)
      || (index > 0 && ring.rho <= geometry.rings[index - 1].rho))
    || !Array.isArray(geometry.assumptions)
    || !geometry.assumptions.includes('not-a-2D-equilibrium-solve')
    || !geometry.assumptions.includes('profiles-constant-on-reconstructed-surfaces')
    || !Array.isArray(result.profiles) || !Array.isArray(result.axes)) return null;
  const qProfiles = result.profiles.filter(profile => profile.id === 'q');
  if (qProfiles.length !== 1 || qProfiles[0].unit !== '1') return null;
  const qProfile = qProfiles[0], axis = result.axes.find(value => value.id === qProfile.axisId);
  if (!axis || axis.coordinate !== 'rho_tor_norm' || !Array.isArray(qProfile.values)
    || !Array.isArray(qProfile.values[timeIndex])) return null;
  const lines: SimulationFieldLine[] = [];
  const used = new Set<number>();
  for (const target of SIMULATION_FIELDLINE_LEVELS) {
    let best = -1;
    for (let i = 0; i < geometry.rings.length; i++) {
      const ring = geometry.rings[i];
      if (!finite(ring?.rho) || !Array.isArray(ring.points)) return null;
      if (best < 0 || Math.abs(ring.rho - target) < Math.abs(geometry.rings[best].rho - target)) best = i;
    }
    const ring = geometry.rings[best];
    if (used.has(best) || Math.abs(ring.rho - target) > 0.025) return null;
    used.add(best);
    const q = sampledQ(axis.values, qProfile.values[timeIndex], ring.rho);
    if (q === null) return null;
    const line = illustrate(ring.points, geometry.axis, q, ring.rho);
    if (!line) return null;
    lines.push(line);
  }
  return { authority: 'derived-display', method: 'q-constrained-geometric-helix',
    engineId: 'torax', runId: result.id, timeSeconds: result.time.values[timeIndex],
    coordinate: 'rho_tor_norm', geometryTimeReference: 'fixed-input-geometry', lines };
}
