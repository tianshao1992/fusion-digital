import type { PhysicsData, RZ } from './physics';
import type { FluxCoordinateMap } from './flux-coordinate-map';

export type SpatialFieldChannel = 'psi_norm' | 'psi' | 'te' | 'ti' | 'ne' | 'q' | 'pressure';
export type EquilibriumFieldChannel = SpatialFieldChannel;

export type SpatialFieldSpec = {
  id: SpatialFieldChannel;
  profileId: string | null;
  labelZh: string;
  labelEn: string;
  sourceUnit: string;
  displayUnit: string;
  displayScale: number;
  sourceAxis: 'rz-grid' | 'psi_norm' | 'rho_tor_norm';
  authority: 'native-grid' | 'normalized-grid' | 'profile-mapped';
};

export const SPATIAL_FIELD_SPECS: readonly SpatialFieldSpec[] = [
  { id: 'psi_norm', profileId: null, labelZh: '归一化极向磁通', labelEn: 'Normalized poloidal flux', sourceUnit: '1', displayUnit: '1', displayScale: 1, sourceAxis: 'rz-grid', authority: 'normalized-grid' },
  { id: 'psi', profileId: null, labelZh: '极向磁通', labelEn: 'Poloidal flux', sourceUnit: 'Wb', displayUnit: 'Wb', displayScale: 1, sourceAxis: 'rz-grid', authority: 'native-grid' },
  { id: 'te', profileId: 'te', labelZh: '电子温度', labelEn: 'Electron temperature', sourceUnit: 'eV', displayUnit: 'keV', displayScale: 1e-3, sourceAxis: 'rho_tor_norm', authority: 'profile-mapped' },
  { id: 'ti', profileId: 'ti', labelZh: '平均离子温度', labelEn: 'Average ion temperature', sourceUnit: 'eV', displayUnit: 'keV', displayScale: 1e-3, sourceAxis: 'rho_tor_norm', authority: 'profile-mapped' },
  { id: 'ne', profileId: 'ne', labelZh: '电子密度', labelEn: 'Electron density', sourceUnit: 'm^-3', displayUnit: '10²⁰ m⁻³', displayScale: 1e-20, sourceAxis: 'rho_tor_norm', authority: 'profile-mapped' },
  { id: 'q', profileId: 'q', labelZh: '安全因子', labelEn: 'Safety factor', sourceUnit: '1', displayUnit: '1', displayScale: 1, sourceAxis: 'psi_norm', authority: 'profile-mapped' },
  { id: 'pressure', profileId: 'pressure', labelZh: '平衡压强', labelEn: 'Equilibrium pressure', sourceUnit: 'Pa', displayUnit: 'kPa', displayScale: 1e-3, sourceAxis: 'psi_norm', authority: 'profile-mapped' },
] as const;

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
  rhoTorNorm: number | null,
];

export type EquilibriumFieldProjection = {
  channel: EquilibriumFieldChannel;
  samples: EquilibriumFieldSample[];
  minimum: number;
  maximum: number;
  reversePalette: boolean;
  unit: string;
  sourceUnit: string;
  sourceAxis: SpatialFieldSpec['sourceAxis'];
  authority: SpatialFieldSpec['authority'];
};

export type SpatialFieldValue = {
  value: number;
  rawValue: number;
  unit: string;
  sourceUnit: string;
  psiNorm: number;
  rhoTorNorm: number | null;
  authority: SpatialFieldSpec['authority'];
};

export function spatialFieldSpec(channel: SpatialFieldChannel): SpatialFieldSpec {
  const spec = SPATIAL_FIELD_SPECS.find((item) => item.id === channel);
  if (!spec) throw new Error('UNKNOWN_SPATIAL_FIELD');
  return spec;
}

/** Bounded piecewise-linear interpolation. Missing neighbours stay missing and values are never extrapolated. */
export function interpolateBounded(x: number[], y: (number | null)[], target: number): number | null {
  if (!Number.isFinite(target) || x.length !== y.length || x.length < 2 || target < x[0] || target > x.at(-1)!) return null;
  let low = 0; let high = x.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (x[middle] < target) low = middle; else high = middle;
  }
  if (target === x[low]) return y[low];
  if (target === x[high]) return y[high];
  if (y[low] === null || y[high] === null) return null;
  const fraction = (target - x[low]) / (x[high] - x[low]);
  return y[low]! + (y[high]! - y[low]!) * fraction;
}

export function spatialFieldUnavailableReason(data: PhysicsData, channel: SpatialFieldChannel, coordinateMap?: FluxCoordinateMap): string | null {
  const spec = spatialFieldSpec(channel);
  if (!spec.profileId) return null;
  const profile = data.profiles.find((item) => item.id === spec.profileId);
  if (!profile || profile.unit !== spec.sourceUnit || profile.axis !== spec.sourceAxis) return 'profile-unavailable';
  if (profile.axis === 'rho_tor_norm') {
    if (!coordinateMap) return 'flux-coordinate-map-unavailable';
    if (coordinateMap.runId !== data.runId || coordinateMap.source.equilibriumTimeSeconds !== data.timeSeconds || coordinateMap.source.coreTimeSeconds !== data.coreTimeSeconds || data.timeSeconds !== data.coreTimeSeconds) return 'profile-state-mismatch';
  }
  return null;
}

export function sampleSpatialFieldAtPsiNorm(
  data: PhysicsData,
  channel: SpatialFieldChannel,
  psiNorm: number,
  coordinateMap?: FluxCoordinateMap,
  psiWb = data.equilibrium.psiAxis + psiNorm * (data.equilibrium.psiBoundary - data.equilibrium.psiAxis),
): SpatialFieldValue | null {
  if (spatialFieldUnavailableReason(data, channel, coordinateMap)) return null;
  const spec = spatialFieldSpec(channel);
  let rawValue = channel === 'psi_norm' ? psiNorm : channel === 'psi' ? psiWb : null;
  const rhoTorNorm: number | null = coordinateMap ? interpolateBounded(coordinateMap.psiNorm, coordinateMap.rhoTorNorm, psiNorm) : null;
  if (spec.profileId) {
    const profile = data.profiles.find((item) => item.id === spec.profileId)!;
    const coordinate = profile.axis === 'psi_norm' ? psiNorm : rhoTorNorm;
    if (coordinate === null) return null;
    rawValue = interpolateBounded(profile.x, profile.y, coordinate);
  }
  if (rawValue === null || !Number.isFinite(rawValue)) return null;
  return {
    value: rawValue * spec.displayScale,
    rawValue,
    unit: spec.displayUnit,
    sourceUnit: spec.sourceUnit,
    psiNorm,
    rhoTorNorm,
    authority: spec.authority,
  };
}

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
  coordinateMap?: FluxCoordinateMap,
): EquilibriumFieldProjection {
  const unavailable = spatialFieldUnavailableReason(data, channel, coordinateMap);
  if (unavailable) throw new Error(unavailable);
  const spec = spatialFieldSpec(channel);
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
      const field = sampleSpatialFieldAtPsiNorm(data, channel, psiNorm, coordinateMap, psiWb);
      if (!field) continue;
      const [rLowerM, rUpperM] = gridCellBounds(equilibrium.r, rIndex);
      const [zLowerM, zUpperM] = gridCellBounds(equilibrium.z, zIndex);
      samples.push([
        rM,
        zM,
        field.value,
        psiNorm,
        psiWb,
        rLowerM,
        rUpperM,
        zLowerM,
        zUpperM,
        field.rhoTorNorm,
      ]);
    }
  }

  if (!samples.length) throw new Error('SPATIAL_FIELD_HAS_NO_VALID_SAMPLES');
  const values = samples.map((sample) => sample[2]);
  const minimum = channel === 'psi_norm' ? 0 : channel === 'psi'
    ? Math.min(equilibrium.psiAxis, equilibrium.psiBoundary) : Math.min(...values);
  let maximum = channel === 'psi_norm' ? 1 : channel === 'psi'
    ? Math.max(equilibrium.psiAxis, equilibrium.psiBoundary) : Math.max(...values);
  if (maximum === minimum) maximum += Math.max(Math.abs(minimum) * 1e-9, 1e-12);

  return {
    channel,
    samples,
    minimum,
    maximum,
    reversePalette: channel === 'psi' && equilibrium.psiBoundary < equilibrium.psiAxis,
    unit: spec.displayUnit,
    sourceUnit: spec.sourceUnit,
    sourceAxis: spec.sourceAxis,
    authority: spec.authority,
  };
}
