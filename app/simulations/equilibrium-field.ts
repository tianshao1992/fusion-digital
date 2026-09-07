import type { PhysicsData, RZ } from './physics';

export type EquilibriumFieldChannel = 'psi_norm' | 'psi';

export type EquilibriumFieldSample = [
  rM: number,
  zM: number,
  value: number,
  psiNorm: number,
  psiWb: number,
  rLowerM: number,
  rUpperM: number,
  zLowerM: number,
  zUpperM: number,
];

export type EquilibriumFieldProjection = {
  channel: EquilibriumFieldChannel;
  samples: EquilibriumFieldSample[];
  minimum: number;
  maximum: number;
  reversePalette: boolean;
};

export function normalizedPoloidalFlux(psiWb: number, psiAxisWb: number, psiBoundaryWb: number): number {
  const normalized = (psiWb - psiAxisWb) / (psiBoundaryWb - psiAxisWb);
  return Object.is(normalized, -0) ? 0 : normalized;
}

/** Midpoint cell bounds retain the actual geometry of non-uniform native axes. */
export function gridCellBounds(values: number[], index: number): [number, number] {
  if (values.length < 2) return [values[index], values[index]];
  const lower = index === 0
    ? values[0] - (values[1] - values[0]) / 2
    : (values[index - 1] + values[index]) / 2;
  const upper = index === values.length - 1
    ? values[index] + (values[index] - values[index - 1]) / 2
    : (values[index] + values[index + 1]) / 2;
  return [lower, upper];
}

function pointOnSegment(r: number, z: number, a: [number, number], b: [number, number]): boolean {
  const cross = (r - a[0]) * (b[1] - a[1]) - (z - a[1]) * (b[0] - a[0]);
  const tolerance = 1e-10 * Math.max(1, Math.abs(r), Math.abs(z), Math.abs(a[0]), Math.abs(a[1]), Math.abs(b[0]), Math.abs(b[1]));
  if (Math.abs(cross) > tolerance) return false;
  return r >= Math.min(a[0], b[0]) - tolerance
    && r <= Math.max(a[0], b[0]) + tolerance
    && z >= Math.min(a[1], b[1]) - tolerance
    && z <= Math.max(a[1], b[1]) + tolerance;
}

/** LCFS polygon test used to keep private-flux/external cells out of the plasma cloud. */
export function pointInClosedPolygon(r: number, z: number, polygon: RZ): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous];
    const b = polygon[index];
    if (pointOnSegment(r, z, a, b)) return true;
    if ((a[1] > z) !== (b[1] > z)) {
      const crossingR = ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0];
      if (r < crossingR) inside = !inside;
    }
  }
  return inside;
}

export function buildEquilibriumFieldProjection(
  data: PhysicsData,
  channel: EquilibriumFieldChannel,
): EquilibriumFieldProjection {
  const { equilibrium } = data;
  const samples: EquilibriumFieldSample[] = [];
  const boundaryR = equilibrium.boundary.map(([r]) => r);
  const boundaryZ = equilibrium.boundary.map(([, z]) => z);
  const rMinimum = Math.min(...boundaryR);
  const rMaximum = Math.max(...boundaryR);
  const zMinimum = Math.min(...boundaryZ);
  const zMaximum = Math.max(...boundaryZ);

  for (let zIndex = 0; zIndex < equilibrium.z.length; zIndex += 1) {
    const zM = equilibrium.z[zIndex];
    if (zM < zMinimum || zM > zMaximum) continue;
    for (let rIndex = 0; rIndex < equilibrium.r.length; rIndex += 1) {
      const rM = equilibrium.r[rIndex];
      if (rM < rMinimum || rM > rMaximum || !pointInClosedPolygon(rM, zM, equilibrium.boundary)) continue;
      const psiWb = equilibrium.psi[zIndex][rIndex];
      const psiNorm = normalizedPoloidalFlux(psiWb, equilibrium.psiAxis, equilibrium.psiBoundary);
      if (!Number.isFinite(psiNorm)) continue;
      const [rLowerM, rUpperM] = gridCellBounds(equilibrium.r, rIndex);
      const [zLowerM, zUpperM] = gridCellBounds(equilibrium.z, zIndex);
      samples.push([
        rM,
        zM,
        channel === 'psi_norm' ? psiNorm : psiWb,
        psiNorm,
        psiWb,
        rLowerM,
        rUpperM,
        zLowerM,
        zUpperM,
      ]);
    }
  }

  return {
    channel,
    samples,
    minimum: channel === 'psi_norm' ? 0 : Math.min(equilibrium.psiAxis, equilibrium.psiBoundary),
    maximum: channel === 'psi_norm' ? 1 : Math.max(equilibrium.psiAxis, equilibrium.psiBoundary),
    reversePalette: channel === 'psi' && equilibrium.psiBoundary < equilibrium.psiAxis,
  };
}
