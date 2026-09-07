import type { RZ } from './physics';
import type { EquilibriumFieldSample } from './equilibrium-field';

export const SURFACE_VERTEX_BUDGET = 250_000;
export const SURFACE_PATH_LIMIT = 4096;
export const FIELD_SLICE_CELL_BUDGET = 50_000;
export type RevolvedSurface = {
  positions: Float32Array;
  indices: Uint32Array;
  triangles: number;
  sourcePoints: number;
  closedPaths: number;
};
export type PoloidalFieldSlice = {
  positions: Float32Array;
  values: Float32Array;
  indices: Uint32Array;
  cells: number;
};

/** Display-only R-Z field slice at one toroidal angle; values remain cell-centred. */
export function buildPoloidalFieldSlice(samples: EquilibriumFieldSample[], angleDegrees = 0): PoloidalFieldSlice {
  if (!Number.isFinite(angleDegrees) || angleDegrees < 0 || angleDegrees > 360 || samples.length > FIELD_SLICE_CELL_BUDGET) throw new Error('FIELD_SLICE_PARAMETERS');
  if (samples.some((sample) => sample.length !== 10 || !sample.slice(0, 9).every(Number.isFinite))) throw new Error('FIELD_SLICE_SAMPLES');
  const positions = new Float32Array(samples.length * 12);
  const values = new Float32Array(samples.length * 4);
  const indices = new Uint32Array(samples.length * 6);
  const phi = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(phi); const sine = Math.sin(phi);
  samples.forEach((sample, cell) => {
    const value = sample[2];
    const corners: [number, number][] = [
      [sample[5], sample[7]], [sample[6], sample[7]], [sample[6], sample[8]], [sample[5], sample[8]],
    ];
    corners.forEach(([r, z], corner) => {
      const vertex = cell * 4 + corner;
      positions[vertex * 3] = r * cosine;
      positions[vertex * 3 + 1] = z;
      positions[vertex * 3 + 2] = -r * sine;
      values[vertex] = value;
    });
    const vertex = cell * 4;
    indices.set([vertex, vertex + 1, vertex + 2, vertex, vertex + 2, vertex + 3], cell * 6);
  });
  return { positions, values, indices, cells: samples.length };
}

/** Display-only revolution. Metres are unchanged; scientific (x,y,z) -> Three (x,z,-y). */
export function revolveContours(paths: RZ[], degrees = 270, segments = 72): RevolvedSurface {
  if (!Number.isFinite(degrees) || degrees < 30 || degrees > 360 ||
      !Number.isInteger(segments) || segments < 8 || segments > 128 ||
      !paths.length || paths.length > 32) throw new Error('SURFACE_PARAMETERS');
  let sourcePoints = 0;
  let edges = 0;
  let closedPaths = 0;
  for (const path of paths) {
    if (path.length < 2 || path.length > SURFACE_PATH_LIMIT ||
        path.some(p => p.length !== 2 || !p.every(Number.isFinite) || p[0] < 0 || Math.abs(p[1]) > 1e6 || p[0] > 1e6)) {
      throw new Error('SURFACE_COORDINATES');
    }
    sourcePoints += path.length;
    edges += path.length - 1;
    const first = path[0], last = path[path.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) closedPaths++;
  }
  if (sourcePoints * (segments + 1) > SURFACE_VERTEX_BUDGET) throw new Error('SURFACE_BUDGET');
  const positions = new Float32Array(sourcePoints * (segments + 1) * 3);
  const indices = new Uint32Array(edges * segments * 6);
  let offset = 0, index = 0;
  for (const path of paths) {
    let area = 0;
    for (let i = 0; i < path.length - 1; i++) area += path[i][0] * path[i + 1][1] - path[i + 1][0] * path[i][1];
    for (let j = 0; j <= segments; j++) {
      const phi = j / segments * degrees * Math.PI / 180;
      for (let i = 0; i < path.length; i++) {
        const [r, z] = path[i], k = (offset + j * path.length + i) * 3;
        positions[k] = r * Math.cos(phi);
        positions[k + 1] = z;
        positions[k + 2] = -r * Math.sin(phi);
        if (j === segments || i === path.length - 1) continue;
        const a = offset + j * path.length + i, b = a + path.length, c = a + 1, d = b + 1;
        indices.set(area >= 0 ? [a, b, c, b, d, c] : [a, c, b, b, c, d], index);
        index += 6;
      }
    }
    offset += path.length * (segments + 1);
  }
  // Open poloidal paths stay open. Cutaway edges are deliberately not capped.
  return { positions, indices, triangles: indices.length / 3, sourcePoints, closedPaths };
}
