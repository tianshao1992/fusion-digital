import { isDigest, isIdentifier, interpolateProfile, type TransportResult, type ResultArtifact } from './contracts.ts';
import { gridCellBounds } from '../equilibrium-field.ts';
export type Point = [number, number];
export type TransportGeometry = {
  schema: 'transport-geometry.v1'; runId: string; sourceNativeSha256: string;
  authority: 'derived-display'; coordinate: 'R-Z'; unit: 'm'; timeReference: 'fixed-input-geometry'; cocos: null;
  kind: 'input-equilibrium-grid' | 'shape-reconstruction'; source: { name: string; sha256: string }; projectorSha256: string;
  boundary: Point[]; axis: Point; assumptions: string[];
  rings: { rho: number; points: Point[] }[];
  grid: { r: number[]; z: number[]; psi: (number | null)[][]; rho: (number | null)[][]; psiAxis: number; psiBoundary: number } | null;
};
export type GeometryEntry = Pick<TransportGeometry, 'runId' | 'kind' | 'sourceNativeSha256'> & { artifact: ResultArtifact };
export type VerifiedTransportGeometry = { geometry: TransportGeometry; geometrySha256: string };
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const keys = (v: unknown, list: string) => !!v && typeof v === 'object' && Object.keys(v).sort().join(' ') === list.split(' ').sort().join(' ');
const point = (v: unknown): v is Point => Array.isArray(v) && v.length === 2 && v.every(finite) && v[0] > 0 && v[0] < 10000 && Math.abs(v[1]) < 10000;
const vector = (v: unknown): v is number[] => Array.isArray(v) && v.length >= 2 && v.length <= 1025 && v.every(finite) && v.every((x, i) => !i || x > v[i - 1]);
function check(ok: unknown): asserts ok { if (!ok) throw new Error('INVALID_TRANSPORT_GEOMETRY'); }
export function parseTransportGeometry(value: unknown): TransportGeometry {
  check(keys(value, 'schema runId sourceNativeSha256 authority coordinate unit timeReference cocos grid rings source assumptions projectorSha256 kind boundary axis'));
  const g = value as TransportGeometry;
  check(g.schema === 'transport-geometry.v1' && isIdentifier(g.runId) && isDigest(g.sourceNativeSha256) && g.authority === 'derived-display' && g.coordinate === 'R-Z' && g.unit === 'm' && g.timeReference === 'fixed-input-geometry' && g.cocos === null);
  check(keys(g.source, 'name sha256') && isIdentifier(g.source.name) && isDigest(g.source.sha256) && isDigest(g.projectorSha256));
  check(Array.isArray(g.boundary) && g.boundary.length >= 4 && g.boundary.length <= 2048 && g.boundary.every(point) && point(g.axis));
  check(Array.isArray(g.assumptions) && g.assumptions.length > 0 && g.assumptions.length <= 20 && g.assumptions.every(isIdentifier));
  check(Array.isArray(g.rings));
  if (g.kind === 'input-equilibrium-grid') {
    const p = g.grid;
    check(g.rings.length === 0 && keys(p, 'r z psi rho psiAxis psiBoundary') && p && vector(p.r) && vector(p.z) && p.r.length*p.z.length <= 100000 && finite(p.psiAxis) && finite(p.psiBoundary) && p.psiAxis !== p.psiBoundary);
    for (const matrix of [p.rho, p.psi]) check(Array.isArray(matrix) && matrix.length === p.z.length && matrix.every(row => Array.isArray(row) && row.length === p.r.length && row.every(v => v === null || finite(v))));
    check(p.rho.every(row => row.every(v => v === null || (v >= 0 && v <= 1))) && p.rho.some(row => row.some(v => v !== null)));
  } else {
    check(g.kind === 'shape-reconstruction' && g.grid === null && g.rings.length >= 3 && g.rings.length <= 1025);
    const count = g.rings[0].points.length;
    check(count >= 17 && count <= 257 && count*g.rings.length <= 50000 && g.rings[0].rho === 0 && g.rings.at(-1)!.rho === 1);
    g.rings.forEach((ring, i) => check(keys(ring, 'rho points') && finite(ring.rho) && (!i || ring.rho > g.rings[i-1].rho) && Array.isArray(ring.points) && ring.points.length === count && ring.points.every(point)));
  }
  return structuredClone(g);
}
export function parseVerifiedTransportGeometry(value: unknown, runId: string, nativeSha256: string): VerifiedTransportGeometry {
  check(keys(value, 'schema geometry verification'));
  const envelope = value as { schema: unknown; geometry: unknown; verification: unknown };
  check(envelope.schema === 'transport-geometry-result.v1' && keys(envelope.verification, 'authority geometrySha256'));
  const verification = envelope.verification as { authority: unknown; geometrySha256: unknown };
  check(verification.authority === 'local-gateway-verified' && isDigest(verification.geometrySha256));
  const geometry = parseTransportGeometry(envelope.geometry);
  check(geometry.runId === runId && geometry.sourceNativeSha256 === nativeSha256);
  return { geometry, geometrySha256: verification.geometrySha256 as string };
}
export type FieldCell = { x: number; y: number; value: number; rho: number | null; polygon: Point[] };
export function spaceTimeCells(result: TransportResult, variable: string): FieldCell[] {
  const p = result.profiles.find(p => p.id === variable);
  if (!p) return [];
  const rho = result.axes.find(a => a.id === p.axisId)!.values;
  return result.time.values.flatMap((t, it) => {
    const [l, u] = gridCellBounds(result.time.values, it), t0 = Math.max(l, result.time.values[0]), t1 = Math.min(u, result.time.values.at(-1)!);
    return rho.flatMap((r, ir) => {
      const v = p.values[it][ir]; if (v === null) return [];
      const [l, u] = gridCellBounds(rho, ir), r0 = Math.max(0, l), r1 = Math.min(1, u);
      return [{ x: t, y: r, value: v, rho: r, polygon: [[t0, r0], [t1, r0], [t1, r1], [t0, r1]] as Point[] }];
    });
  });
}
export function crossSectionCells(g: TransportGeometry, result: TransportResult, variable: string, timeIndex: number): FieldCell[] {
  if (g.runId !== result.id || g.sourceNativeSha256 !== result.provenance.nativeSha256) throw new Error('GEOMETRY_RESULT_MISMATCH');
  const p = result.profiles.find(p => p.id === variable), axis = result.axes.find(a => a.id === p?.axisId);
  const valueAt = (rho: number | null) => p && axis && rho !== null ? interpolateProfile(axis.values, p.values[timeIndex], rho) : null;
  if (g.grid) {
    const grid = g.grid;
    return grid.z.flatMap((z, iz) => grid.r.flatMap((r, ir) => {
      const rho = grid.rho[iz][ir], psi = grid.psi[iz][ir];
      const value = variable === 'input_psi_norm' ? psi === null ? null : (psi-grid.psiAxis)/(grid.psiBoundary-grid.psiAxis) : variable === 'input_psi' ? psi : valueAt(rho);
      if (value === null) return [];
      const [r0, r1] = gridCellBounds(grid.r, ir), [z0, z1] = gridCellBounds(grid.z, iz);
      return [{ x: r, y: z, value, rho, polygon: [[r0,z0], [r1,z0], [r1,z1], [r0,z1]] as Point[] }];
    }));
  }
  return g.rings.slice(1).flatMap((outer, i) => {
    const inner = g.rings[i], rho = (inner.rho+outer.rho)/2, value = valueAt(rho);
    if (value === null) return [];
    return outer.points.slice(1).map((b, j) => {
      const a = outer.points[j], c = inner.points[j+1], d = inner.points[j];
      return { x: (a[0]+b[0]+c[0]+d[0])/4, y: (a[1]+b[1]+c[1]+d[1])/4, value, rho, polygon: [a,b,c,d] };
    });
  });
}
export function inputContourSegments(g: TransportGeometry, level: number): Point[][] {
  if (!g.grid) return [];
  const grid = g.grid, segments: Point[][] = [];
  for (let j = 0; j < grid.z.length-1; j++) for (let i = 0; i < grid.r.length-1; i++) {
    const samples = [grid.psi[j][i], grid.psi[j][i+1], grid.psi[j+1][i+1], grid.psi[j+1][i]];
    if (samples.some(v => v === null)) continue;
    const values = samples.map(v => (v!-grid.psiAxis)/(grid.psiBoundary-grid.psiAxis));
    const points: Point[] = [[grid.r[i],grid.z[j]],[grid.r[i+1],grid.z[j]],[grid.r[i+1],grid.z[j+1]],[grid.r[i],grid.z[j+1]]];
    const crossings: Point[] = [];
    for (let k = 0; k < 4; k++) {
      const next = (k+1)%4;
      if ((values[k] > level) === (values[next] > level)) continue;
      const fraction = (level-values[k])/(values[next]-values[k]);
      crossings.push([points[k][0]+fraction*(points[next][0]-points[k][0]),points[k][1]+fraction*(points[next][1]-points[k][1])]);
    }
    if (crossings.length === 2) segments.push(crossings);
    if (crossings.length === 4) {
      const same = (values[0] > level) === (values.reduce((s,v)=>s+v,0)/4 > level);
      segments.push([crossings[0],crossings[same?1:3]], [crossings[2],crossings[same?3:1]]);
    }
  }
  return segments;
}
