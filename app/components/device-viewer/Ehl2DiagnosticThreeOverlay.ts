import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Plane,
  CylinderGeometry,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Texture,
} from 'three';
import {
  EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT,
  buildEhl2DiagnosticScenarioGeometry,
  diagView2PointToEhl2Web,
  normalizeEhl2DiagnosticOverlayOptions,
  scenarioForId,
  scenarioIdsForMode,
  type Ehl2DiagnosticScenarioGeometry,
  type Vec3Tuple,
} from './ehl2DiagView2';
import type {
  DiagView2DiagnosticRay,
  DiagView2DiagnosticType,
  DiagView2RayResult,
} from './ehl2DiagView2Core';
import type { Ehl2DiagnosticPlane } from './ehl2DiagnosticRuntime';

type Ehl2PptDiagnosticOverlayOptions = import('./ehl2DiagView2').Ehl2DiagnosticOverlayOptions;

/**
 * Caller-provided plasma-boundary context for orientation only. R and Z are
 * DiagView2 scientific-frame metres; this is not experimental, calibrated or
 * as-built geometry authority.
 */
export type Ehl2DiagnosticPlasmaContext = {
  lcfsBoundaryRZMetres: readonly (readonly [number, number])[];
  magneticAxisRZMetres: readonly [number, number];
  /**
   * Virtual equal-normalized-flux contours derived from the loaded GEQDSK
   * grid. The explicit LCFS above remains the outer layer.
   */
  fluxSurfacesRZMetres?: readonly Ehl2DiagnosticFluxSurfaceRZ[];
  id?: string;
  label?: string;
  sourceKind?: 'parametric' | 'geqdsk';
  color?: number;
  opacity?: number;
  visible?: boolean;
};

export type Ehl2DiagnosticFluxSurfaceRZ = {
  normalizedFlux: number;
  boundaryRZMetres: readonly (readonly [number, number])[];
};

export type Ehl2DiagnosticPortMarkerPoint = {
  id: string;
  positionWebMetres: readonly [number, number, number];
  /** Reviewed flange normal in the same Web Y-up frame. */
  normalWeb?: readonly [number, number, number];
  label?: string;
};

export type Ehl2DiagnosticPortMarkers = {
  pointsWebMetres: readonly Ehl2DiagnosticPortMarkerPoint[];
  opacity?: number;
  visible?: boolean;
  selectedId?: string;
  color?: number;
  selectedColor?: number;
  /** Only the selected port may receive a label, preventing a 41-label occlusion wall. */
  showSelectedLabel?: boolean;
};

export type Ehl2DiagnosticWorkbenchOverlayOptions = {
  kind: 'diagview2-workbench';
  labelLocale: 'zh-CN' | 'en';
  designId: string;
  designName: string;
  diagnosticType: DiagView2DiagnosticType;
  previewRays: readonly DiagView2DiagnosticRay[];
  rayResults: readonly DiagView2RayResult[];
  depthMode: 'xray' | 'physical';
  showRays: boolean;
  showLabels: boolean;
  showHitMarkers: boolean;
  laserDiameterMm: number;
  opacity: number;
  color: number;
  colorCss: string;
  /** Frozen project geometries shown as subdued context behind the active design. */
  backgroundLayers?: readonly {
    designId: string;
    designName: string;
    diagnosticType: DiagView2DiagnosticType;
    previewRays: readonly DiagView2DiagnosticRay[];
    laserDiameterMm: number;
    opacity: number;
    color: number;
    colorCss: string;
  }[];
};

export type Ehl2DiagnosticOverlayOptions =
  | (Ehl2PptDiagnosticOverlayOptions & {
    plasmaContext?: Ehl2DiagnosticPlasmaContext;
    plasmaContexts?: readonly Ehl2DiagnosticPlasmaContext[];
    plasmaClippingPlanesWebMetres?: readonly Ehl2DiagnosticPlane[];
    portMarkers?: Ehl2DiagnosticPortMarkers;
  })
  | (Ehl2DiagnosticWorkbenchOverlayOptions & {
    plasmaContext?: Ehl2DiagnosticPlasmaContext;
    plasmaContexts?: readonly Ehl2DiagnosticPlasmaContext[];
    plasmaClippingPlanesWebMetres?: readonly Ehl2DiagnosticPlane[];
    portMarkers?: Ehl2DiagnosticPortMarkers;
  });

export type Ehl2DiagnosticThreeOverlayContext = {
  /**
   * Identity model wrapper whose children are expressed in EHL-2 web metres.
   * The wrapper owns only the viewer fit, matching the EFIT overlay contract.
   */
  physicalWebMetresRoot: Object3D;
};

export type Ehl2DiagnosticThreeOverlay = {
  /** Undefined is an explicit disabled state; it does not select defaults. */
  setOptions: (options?: Ehl2DiagnosticOverlayOptions) => void;
  dispose: () => void;
};

type OverlayMaterial = Material & { map?: Texture | null };
type Segment = readonly [Vec3Tuple, Vec3Tuple];

const ROOT_NAME = 'EHL2_DIAGNOSTIC_FOV_OVERLAY';
const PLASMA_CONTEXT_NAME = 'EHL2_DIAGVIEW2_GEQDSK_PLASMA_CONTEXT';
const PORT_MARKERS_NAME = 'EHL2_DIAGVIEW2_REVIEWED_PORT_MARKERS';
const PLASMA_BOUNDARY_TARGET_POINTS = 92;
const PLASMA_BOUNDARY_MAX_POINTS = 96;
const PLASMA_TOROIDAL_SEGMENTS = 64;
const PLASMA_MAX_FLUX_SURFACES = 16;
const GEQDSK_CONTOUR_MAX_AXIS_SAMPLES = 256;
const GEQDSK_CONTOUR_MAX_CELLS = 1_000_000;
const NOMINAL_BLIND_ZONE_MARKER_RADIUS_METRES = 2.48;
const NO_RAYCAST = () => undefined;

function vector(tuple: Vec3Tuple) {
  return new Vector3(tuple[0], tuple[1], tuple[2]);
}

function flattenPoints(points: readonly Vec3Tuple[]) {
  return new Float32Array(points.flatMap((point) => [point[0], point[1], point[2]]));
}

function suppressRaycast<T extends Object3D>(object: T): T {
  object.raycast = NO_RAYCAST;
  return object;
}

type NormalizedPlasmaContext = {
  boundaryRZMetres: readonly (readonly [number, number])[];
  fluxSurfacesRZMetres: readonly Ehl2DiagnosticFluxSurfaceRZ[];
  magneticAxisRZMetres: readonly [number, number];
  id: string;
  label: string;
  sourceKind: 'parametric' | 'geqdsk';
  color: number;
  opacity: number;
  inputBoundaryPointCount: number;
};

type NormalizedPortMarkers = {
  points: readonly {
    id: string;
    positionWebMetres: Vec3Tuple;
    normalWeb: Vec3Tuple | null;
    label: string;
  }[];
  opacity: number;
  selectedId: string | null;
  color: number;
  selectedColor: number;
  showSelectedLabel: boolean;
};

function safeIdentifier(value: unknown, fallback: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : null;
}

function safeLabel(value: unknown, fallback: string) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 160 ? trimmed : null;
}

function safeColor(value: unknown, fallback: number) {
  if (value === undefined) return fallback;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff
    ? value
    : null;
}

function objectNameToken(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 80) || 'LAYER';
}

function sameRZ(a: readonly [number, number], b: readonly [number, number]) {
  return Math.abs(a[0] - b[0]) <= 1e-9 && Math.abs(a[1] - b[1]) <= 1e-9;
}

function decimateClosedRZBoundary(
  points: readonly (readonly [number, number])[],
): readonly (readonly [number, number])[] {
  if (points.length <= PLASMA_BOUNDARY_MAX_POINTS) return points;
  const selected = new Set<number>();
  for (let index = 0; index < PLASMA_BOUNDARY_TARGET_POINTS; index += 1) {
    selected.add(Math.floor(index * points.length / PLASMA_BOUNDARY_TARGET_POINTS));
  }
  const extrema = [
    points.reduce((best, point, index) => point[0] < points[best][0] ? index : best, 0),
    points.reduce((best, point, index) => point[0] > points[best][0] ? index : best, 0),
    points.reduce((best, point, index) => point[1] < points[best][1] ? index : best, 0),
    points.reduce((best, point, index) => point[1] > points[best][1] ? index : best, 0),
  ];
  extrema.forEach((index) => selected.add(index));
  return [...selected].sort((a, b) => a - b).slice(0, PLASMA_BOUNDARY_MAX_POINTS).map((index) => points[index]);
}

function normalizeRZBoundary(input: unknown) {
  if (!Array.isArray(input) || input.length < 3) return null;
  const rawBoundary: [number, number][] = [];
  for (const point of input) {
    if (!Array.isArray(point) || point.length !== 2
      || typeof point[0] !== 'number' || !Number.isFinite(point[0]) || point[0] <= 0
      || typeof point[1] !== 'number' || !Number.isFinite(point[1])) return null;
    const next: [number, number] = [point[0], point[1]];
    if (!rawBoundary.length || !sameRZ(rawBoundary[rawBoundary.length - 1], next)) rawBoundary.push(next);
  }
  if (rawBoundary.length > 1 && sameRZ(rawBoundary[0], rawBoundary[rawBoundary.length - 1])) rawBoundary.pop();
  if (rawBoundary.length < 3) return null;
  const twiceArea = rawBoundary.reduce((sum, point, index) => {
    const next = rawBoundary[(index + 1) % rawBoundary.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0);
  if (!Number.isFinite(twiceArea) || Math.abs(twiceArea) <= 1e-10) return null;
  return {
    rawBoundary,
    renderedBoundary: decimateClosedRZBoundary(rawBoundary),
  };
}

type FluxGridPoint = readonly [r: number, z: number, value: number];
type FluxSegment = readonly [start: readonly [number, number], end: readonly [number, number]];

function triangleFluxSegment(
  triangle: readonly [FluxGridPoint, FluxGridPoint, FluxGridPoint],
  level: number,
): FluxSegment | null {
  const points: [number, number][] = [];
  const epsilon = 1e-12;
  ([[0, 1], [1, 2], [2, 0]] as const).forEach(([startIndex, endIndex]) => {
    const start = triangle[startIndex];
    const end = triangle[endIndex];
    const startDelta = start[2] - level;
    const endDelta = end[2] - level;
    if (Math.abs(startDelta) <= epsilon && Math.abs(endDelta) <= epsilon) return;
    let point: [number, number] | null = null;
    if (Math.abs(startDelta) <= epsilon) point = [start[0], start[1]];
    else if (Math.abs(endDelta) <= epsilon) point = [end[0], end[1]];
    else if ((startDelta < 0) !== (endDelta < 0)) {
      const fraction = (level - start[2]) / (end[2] - start[2]);
      point = [
        start[0] + fraction * (end[0] - start[0]),
        start[1] + fraction * (end[1] - start[1]),
      ];
    }
    if (point && !points.some((candidate) => sameRZ(candidate, point!))) points.push(point);
  });
  return points.length === 2 && !sameRZ(points[0], points[1]) ? [points[0], points[1]] : null;
}

function longestFluxContour(segments: readonly FluxSegment[], tolerance: number) {
  const keyFor = ([r, z]: readonly [number, number]) => `${Math.round(r / tolerance)}:${Math.round(z / tolerance)}`;
  const points = new Map<string, readonly [number, number]>();
  const adjacency = new Map<string, Set<string>>();
  const uniqueEdges = new Set<string>();
  segments.forEach(([start, end]) => {
    const startKey = keyFor(start);
    const endKey = keyFor(end);
    if (startKey === endKey) return;
    const edgeKey = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
    if (uniqueEdges.has(edgeKey)) return;
    uniqueEdges.add(edgeKey);
    points.set(startKey, start);
    points.set(endKey, end);
    const startNeighbours = adjacency.get(startKey) ?? new Set<string>();
    const endNeighbours = adjacency.get(endKey) ?? new Set<string>();
    startNeighbours.add(endKey);
    endNeighbours.add(startKey);
    adjacency.set(startKey, startNeighbours);
    adjacency.set(endKey, endNeighbours);
  });

  const visitedComponents = new Set<string>();
  let best: readonly (readonly [number, number])[] = [];
  adjacency.forEach((_, seed) => {
    if (visitedComponents.has(seed)) return;
    const component: string[] = [];
    const stack = [seed];
    visitedComponents.add(seed);
    while (stack.length) {
      const key = stack.pop()!;
      component.push(key);
      adjacency.get(key)?.forEach((next) => {
        if (!visitedComponents.has(next)) {
          visitedComponents.add(next);
          stack.push(next);
        }
      });
    }
    const componentSet = new Set(component);
    const start = component.find((key) => (adjacency.get(key)?.size ?? 0) === 1) ?? component[0];
    const ordered: (readonly [number, number])[] = [];
    const usedEdges = new Set<string>();
    let previous = '';
    let current = start;
    for (let guard = 0; guard <= component.length * 3; guard += 1) {
      const point = points.get(current);
      if (!point) break;
      ordered.push(point);
      const candidates = [...(adjacency.get(current) ?? [])].filter((candidate) => componentSet.has(candidate));
      const next = candidates.find((candidate) => {
        const edge = current < candidate ? `${current}|${candidate}` : `${candidate}|${current}`;
        return candidate !== previous && !usedEdges.has(edge);
      }) ?? candidates.find((candidate) => {
        const edge = current < candidate ? `${current}|${candidate}` : `${candidate}|${current}`;
        return !usedEdges.has(edge);
      });
      if (!next) break;
      const edge = current < next ? `${current}|${next}` : `${next}|${current}`;
      usedEdges.add(edge);
      previous = current;
      current = next;
      if (current === start) break;
    }
    if (ordered.length > best.length) best = ordered;
  });
  return best.length >= 3 ? decimateClosedRZBoundary(best) : [];
}

/**
 * Bounded browser equivalent of DiagView2's skimage longest-contour workflow.
 * The explicit GEQDSK LCFS is rendered separately, so the default levels are
 * the nine interior surfaces 0.1...0.9 (ten visible layers including LCFS).
 */
export function buildEhl2GeqdskFluxSurfaceContours(
  grid: {
    nw: number;
    nh: number;
    rM: ArrayLike<number>;
    zM: ArrayLike<number>;
    psiNorm: ArrayLike<number>;
  },
  levels: readonly number[] = Array.from({ length: 9 }, (_, index) => (index + 1) / 10),
): readonly Ehl2DiagnosticFluxSurfaceRZ[] {
  if (!Number.isInteger(grid.nw) || !Number.isInteger(grid.nh) || grid.nw < 2 || grid.nh < 2
    || grid.nw * grid.nh > GEQDSK_CONTOUR_MAX_CELLS || grid.rM.length !== grid.nw
    || grid.zM.length !== grid.nh || grid.psiNorm.length !== grid.nw * grid.nh
    || levels.length > PLASMA_MAX_FLUX_SURFACES) return [];
  const rValues = Array.from(grid.rM);
  const zValues = Array.from(grid.zM);
  if (rValues.some((value, index) => !Number.isFinite(value) || value <= 0 || (index > 0 && value <= rValues[index - 1]))
    || zValues.some((value, index) => !Number.isFinite(value) || (index > 0 && value <= zValues[index - 1]))) return [];
  const canonicalLevels = [...levels];
  if (canonicalLevels.some((level, index) => !Number.isFinite(level) || level <= 0 || level >= 1
    || (index > 0 && level <= canonicalLevels[index - 1]))) return [];
  const sampleIndices = (length: number) => {
    const stride = Math.max(1, Math.ceil((length - 1) / (GEQDSK_CONTOUR_MAX_AXIS_SAMPLES - 1)));
    const indices = Array.from({ length: Math.floor((length - 1) / stride) + 1 }, (_, index) => index * stride);
    if (indices[indices.length - 1] !== length - 1) indices.push(length - 1);
    return indices;
  };
  const rIndices = sampleIndices(grid.nw);
  const zIndices = sampleIndices(grid.nh);
  const valueAt = (rIndex: number, zIndex: number) => Number(grid.psiNorm[rIndex * grid.nh + zIndex]);
  const tolerance = Math.max(rValues[rValues.length - 1] - rValues[0], zValues[zValues.length - 1] - zValues[0], 1) * 1e-8;
  return canonicalLevels.flatMap((level) => {
    const segments: FluxSegment[] = [];
    for (let rSample = 0; rSample < rIndices.length - 1; rSample += 1) {
      const r0 = rIndices[rSample];
      const r1 = rIndices[rSample + 1];
      for (let zSample = 0; zSample < zIndices.length - 1; zSample += 1) {
        const z0 = zIndices[zSample];
        const z1 = zIndices[zSample + 1];
        const points = [
          [rValues[r0], zValues[z0], valueAt(r0, z0)],
          [rValues[r1], zValues[z0], valueAt(r1, z0)],
          [rValues[r1], zValues[z1], valueAt(r1, z1)],
          [rValues[r0], zValues[z1], valueAt(r0, z1)],
        ] as const;
        if (points.some((point) => !Number.isFinite(point[2]))) return [];
        const first = triangleFluxSegment([points[0], points[1], points[2]], level);
        const second = triangleFluxSegment([points[0], points[2], points[3]], level);
        if (first) segments.push(first);
        if (second) segments.push(second);
      }
    }
    const boundaryRZMetres = longestFluxContour(segments, tolerance);
    return boundaryRZMetres.length >= 3 ? [{ normalizedFlux: level, boundaryRZMetres }] : [];
  });
}

function normalizePlasmaContext(input: unknown, fallbackId: string): NormalizedPlasmaContext | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (record.visible !== undefined && typeof record.visible !== 'boolean') return null;
  if (record.visible === false) return null;
  const opacity = record.opacity === undefined ? 0.14 : record.opacity;
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity <= 0 || opacity > 1) return null;
  const lcfs = normalizeRZBoundary(record.lcfsBoundaryRZMetres);
  if (!lcfs) return null;
  const fluxSurfaces: Ehl2DiagnosticFluxSurfaceRZ[] = [];
  if (record.fluxSurfacesRZMetres !== undefined) {
    if (!Array.isArray(record.fluxSurfacesRZMetres) || record.fluxSurfacesRZMetres.length > PLASMA_MAX_FLUX_SURFACES) return null;
    let previousLevel = 0;
    for (const rawSurface of record.fluxSurfacesRZMetres) {
      if (!rawSurface || typeof rawSurface !== 'object' || Array.isArray(rawSurface)) return null;
      const surface = rawSurface as Record<string, unknown>;
      if (Object.keys(surface).sort().join('|') !== ['boundaryRZMetres', 'normalizedFlux'].sort().join('|')
        || typeof surface.normalizedFlux !== 'number' || !Number.isFinite(surface.normalizedFlux)
        || surface.normalizedFlux <= previousLevel || surface.normalizedFlux >= 1) return null;
      const boundary = normalizeRZBoundary(surface.boundaryRZMetres);
      if (!boundary) return null;
      previousLevel = surface.normalizedFlux;
      fluxSurfaces.push({ normalizedFlux: surface.normalizedFlux, boundaryRZMetres: boundary.renderedBoundary });
    }
  }
  const axis = record.magneticAxisRZMetres;
  if (!Array.isArray(axis) || axis.length !== 2
    || typeof axis[0] !== 'number' || !Number.isFinite(axis[0]) || axis[0] <= 0
    || typeof axis[1] !== 'number' || !Number.isFinite(axis[1])) return null;
  const id = safeIdentifier(record.id, fallbackId);
  if (!id) return null;
  const label = safeLabel(record.label, id);
  if (!label) return null;
  const sourceKind = record.sourceKind === undefined ? 'geqdsk' : record.sourceKind;
  if (sourceKind !== 'parametric' && sourceKind !== 'geqdsk') return null;
  const color = safeColor(record.color, 0x55d8bd);
  if (color === null) return null;
  return {
    boundaryRZMetres: lcfs.renderedBoundary,
    fluxSurfacesRZMetres: fluxSurfaces,
    magneticAxisRZMetres: [axis[0], axis[1]],
    id,
    label,
    sourceKind,
    color,
    opacity,
    inputBoundaryPointCount: lcfs.rawBoundary.length,
  };
}

function normalizePlasmaClippingPlanes(input: unknown, physicalWebMetresRoot: Object3D) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || (input.length !== 0 && input.length !== 1 && input.length !== 6)) return null;
  physicalWebMetresRoot.updateWorldMatrix(true, false);
  const worldMatrix = physicalWebMetresRoot.matrixWorld;
  const planes: Plane[] = [];
  for (const rawPlane of input) {
    if (!rawPlane || typeof rawPlane !== 'object' || Array.isArray(rawPlane)) return null;
    const plane = rawPlane as Record<string, unknown>;
    const point = plane.pointWebMetres;
    const normal = plane.normalWeb;
    if (!Array.isArray(point) || point.length !== 3 || point.some((value) => typeof value !== 'number' || !Number.isFinite(value))
      || !Array.isArray(normal) || normal.length !== 3 || normal.some((value) => typeof value !== 'number' || !Number.isFinite(value))
      || (plane.keepSide !== undefined && plane.keepSide !== 'positive' && plane.keepSide !== 'negative')) return null;
    const normalVector = new Vector3(normal[0], normal[1], normal[2]);
    if (normalVector.lengthSq() <= 1e-18) return null;
    normalVector.normalize();
    if (plane.keepSide === 'negative') normalVector.multiplyScalar(-1);
    planes.push(new Plane().setFromNormalAndCoplanarPoint(
      normalVector,
      new Vector3(point[0], point[1], point[2]),
    ).applyMatrix4(worldMatrix));
  }
  return planes;
}

function normalizePortMarkers(input: unknown): NormalizedPortMarkers | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  if (record.visible !== undefined && typeof record.visible !== 'boolean') return null;
  if (record.visible === false) return null;
  const opacity = record.opacity === undefined ? 0.82 : record.opacity;
  if (typeof opacity !== 'number' || !Number.isFinite(opacity) || opacity <= 0 || opacity > 1) return null;
  const color = safeColor(record.color, 0x70dfca);
  const selectedColor = safeColor(record.selectedColor, 0xffa568);
  if (color === null || selectedColor === null) return null;
  if (record.showSelectedLabel !== undefined && typeof record.showSelectedLabel !== 'boolean') return null;
  if (!Array.isArray(record.pointsWebMetres) || record.pointsWebMetres.length === 0 || record.pointsWebMetres.length > 256) return null;
  const seen = new Set<string>();
  const points: NormalizedPortMarkers['points'][number][] = [];
  for (const item of record.pointsWebMetres) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const pointRecord = item as Record<string, unknown>;
    const id = safeIdentifier(pointRecord.id, '');
    const label = safeLabel(pointRecord.label, id ?? '');
    const position = pointRecord.positionWebMetres;
    const normal = pointRecord.normalWeb;
    if (!id || !label || seen.has(id) || !Array.isArray(position) || position.length !== 3
      || position.some((coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate) || Math.abs(coordinate) > 100)) return null;
    let normalWeb: Vec3Tuple | null = null;
    if (normal !== undefined) {
      if (!Array.isArray(normal) || normal.length !== 3
        || normal.some((coordinate) => typeof coordinate !== 'number' || !Number.isFinite(coordinate))) return null;
      const length = Math.hypot(normal[0], normal[1], normal[2]);
      if (!Number.isFinite(length) || length <= 1e-9) return null;
      normalWeb = [normal[0] / length, normal[1] / length, normal[2] / length];
    }
    seen.add(id);
    points.push({ id, label, positionWebMetres: [position[0], position[1], position[2]], normalWeb });
  }
  const selectedId = record.selectedId === undefined ? null : safeIdentifier(record.selectedId, '');
  if (record.selectedId !== undefined && !selectedId) return null;
  return {
    points,
    opacity,
    selectedId: selectedId && seen.has(selectedId) ? selectedId : null,
    color,
    selectedColor,
    showSelectedLabel: record.showSelectedLabel === true,
  };
}

function disposeRenderTree(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<OverlayMaterial>();
  const textures = new Set<Texture>();

  root.traverse((node) => {
    const renderable = node as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (!renderable.material) return;
    const candidates = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    candidates.forEach((material) => {
      const overlayMaterial = material as OverlayMaterial;
      materials.add(overlayMaterial);
      if (overlayMaterial.map) textures.add(overlayMaterial.map);
    });
  });

  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function createLineSegments(
  name: string,
  segments: readonly Segment[],
  color: number,
  opacity: number,
  depthTest: boolean,
  renderOrder: number,
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      flattenPoints(segments.flatMap((segment) => [segment[0], segment[1]])),
      3,
    ),
  );
  geometry.computeBoundingSphere();
  const material = new LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = suppressRaycast(new LineSegments(geometry, material));
  lines.name = name;
  lines.frustumCulled = false;
  lines.renderOrder = renderOrder;
  return lines;
}

function createSurface(
  name: string,
  points: readonly Vec3Tuple[],
  indices: readonly number[],
  color: number,
  opacity: number,
  depthTest: boolean,
  renderOrder: number,
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(flattenPoints(points), 3));
  geometry.setIndex([...indices]);
  geometry.computeBoundingSphere();
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const surface = suppressRaycast(new Mesh(geometry, material));
  surface.name = name;
  surface.frustumCulled = false;
  surface.renderOrder = renderOrder;
  return surface;
}

function createAxisymmetricPlasmaSurface(
  name: string,
  boundaryRZMetres: readonly (readonly [number, number])[],
  color: number,
  opacity: number,
  depthTest: boolean,
  renderOrder: number,
) {
  const surfacePoints: Vec3Tuple[] = [];
  boundaryRZMetres.forEach(([radius, z]) => {
    for (let toroidalIndex = 0; toroidalIndex < PLASMA_TOROIDAL_SEGMENTS; toroidalIndex += 1) {
      const phi = toroidalIndex * Math.PI * 2 / PLASMA_TOROIDAL_SEGMENTS;
      surfacePoints.push(diagView2PointToEhl2Web([
        radius * Math.cos(phi),
        radius * Math.sin(phi),
        z,
      ]));
    }
  });
  const surfaceIndices: number[] = [];
  boundaryRZMetres.forEach((_, boundaryIndex) => {
    const nextBoundary = (boundaryIndex + 1) % boundaryRZMetres.length;
    for (let toroidalIndex = 0; toroidalIndex < PLASMA_TOROIDAL_SEGMENTS; toroidalIndex += 1) {
      const nextToroidal = (toroidalIndex + 1) % PLASMA_TOROIDAL_SEGMENTS;
      const a = boundaryIndex * PLASMA_TOROIDAL_SEGMENTS + toroidalIndex;
      const b = boundaryIndex * PLASMA_TOROIDAL_SEGMENTS + nextToroidal;
      const c = nextBoundary * PLASMA_TOROIDAL_SEGMENTS + toroidalIndex;
      const d = nextBoundary * PLASMA_TOROIDAL_SEGMENTS + nextToroidal;
      surfaceIndices.push(a, c, b, b, c, d);
    }
  });
  return createSurface(name, surfacePoints, surfaceIndices, color, opacity, depthTest, renderOrder);
}

function createPlasmaContextGroup(
  input: unknown,
  depthTest: boolean,
  fallbackId: string,
  groupName: string,
  clippingPlanes: readonly Plane[],
) {
  const plasma = normalizePlasmaContext(input, fallbackId);
  if (!plasma) return null;
  const group = suppressRaycast(new Group());
  group.name = groupName;
  const authority = plasma.sourceKind === 'parametric'
    ? 'virtual-parametric-plasma-context-not-experimental-or-calibrated'
    : 'virtual-geqdsk-context-not-experimental-or-calibrated';
  group.userData = {
    kind: 'ehl2-diagview2-plasma-context',
    virtual: true,
    authority,
    coordinateFrame: 'DiagView2 cylindrical R/Z metres revolved about +Z, mapped to EHL2 web Y-up',
    layerId: plasma.id,
    label: plasma.label,
    sourceKind: plasma.sourceKind,
    color: plasma.color,
    inputBoundaryPointCount: plasma.inputBoundaryPointCount,
    renderedBoundaryPointCount: plasma.boundaryRZMetres.length,
    fluxSurfaceCount: plasma.fluxSurfacesRZMetres.length + 1,
    normalizedFluxLevels: [...plasma.fluxSurfacesRZMetres.map((surface) => surface.normalizedFlux), 1],
    toroidalSegments: PLASMA_TOROIDAL_SEGMENTS,
    magneticAxisRZMetres: [...plasma.magneticAxisRZMetres],
    raycast: false,
  };

  const allFluxSurfaces = [
    ...plasma.fluxSurfacesRZMetres,
    { normalizedFlux: 1, boundaryRZMetres: plasma.boundaryRZMetres },
  ];
  allFluxSurfaces.forEach((fluxSurface, index) => {
    const isLcfs = index === allFluxSurfaces.length - 1;
    const ratio = allFluxSurfaces.length <= 1 ? 0 : index / (allFluxSurfaces.length - 1);
    const surface = createAxisymmetricPlasmaSurface(
      isLcfs ? `${groupName}_LCFS_SURFACE` : `${groupName}_FLUX_SURFACE_${index + 1}`,
      fluxSurface.boundaryRZMetres,
      plasma.color,
      allFluxSurfaces.length <= 1 ? plasma.opacity : plasma.opacity * (1 - 0.8 * ratio),
      depthTest,
      22 + ratio,
    );
    surface.userData = {
      kind: isLcfs ? 'axisymmetric-lcfs-surface' : 'axisymmetric-flux-surface',
      authority: group.userData.authority,
      sourceUnits: 'R/Z metres',
      normalizedFlux: fluxSurface.normalizedFlux,
      virtual: true,
    };
    group.add(surface);
  });
  /* Keep the historical LCFS name stable for downstream tests and capture tooling. */
  const surface = group.getObjectByName(
    `${groupName}_LCFS_SURFACE`,
  );
  if (!surface) return null;

  const [axisRadius, axisZ] = plasma.magneticAxisRZMetres;
  const axisRingPoints = Array.from({ length: PLASMA_TOROIDAL_SEGMENTS }, (_, index) => {
    const phi = index * Math.PI * 2 / PLASMA_TOROIDAL_SEGMENTS;
    return diagView2PointToEhl2Web([
      axisRadius * Math.cos(phi),
      axisRadius * Math.sin(phi),
      axisZ,
    ]);
  });
  const axisRingSegments = axisRingPoints.map((point, index) => (
    [point, axisRingPoints[(index + 1) % axisRingPoints.length]] as const
  ));
  const axisRing = createLineSegments(
    `${groupName}_MAGNETIC_AXIS_RING`,
    axisRingSegments,
    plasma.color,
    Math.min(1, Math.max(0.36, plasma.opacity * 3)),
    depthTest,
    23,
  );
  axisRing.userData = {
    kind: 'axisymmetric-magnetic-axis-ring',
    authority: group.userData.authority,
    sourceRZMetres: [...plasma.magneticAxisRZMetres],
  };
  group.add(axisRing);
  group.traverse((node) => {
    const candidate = node as Object3D & { material?: Material | Material[] };
    const materials = candidate.material
      ? (Array.isArray(candidate.material) ? candidate.material : [candidate.material])
      : [];
    materials.forEach((material) => {
      material.clippingPlanes = clippingPlanes.length ? clippingPlanes.map((plane) => plane.clone()) : null;
      material.clipIntersection = false;
      material.needsUpdate = true;
    });
  });
  return group;
}

function createMarker(
  name: string,
  position: Vec3Tuple,
  color: number,
  radius: number,
  opacity: number,
  depthTest: boolean,
  renderOrder: number,
) {
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
    toneMapped: false,
  });
  const marker = suppressRaycast(new Mesh(new SphereGeometry(radius, 12, 8), material));
  marker.name = name;
  marker.position.copy(vector(position));
  marker.frustumCulled = false;
  marker.renderOrder = renderOrder;
  return marker;
}

function createCylinderSegment(
  name: string,
  start: Vec3Tuple,
  end: Vec3Tuple,
  color: number,
  radius: number,
  opacity: number,
  depthTest: boolean,
  renderOrder: number,
) {
  const from = vector(start);
  const to = vector(end);
  const delta = to.clone().sub(from);
  const length = delta.length();
  if (length <= 1e-9) return null;
  const geometry = new CylinderGeometry(Math.max(radius, 0.0005), Math.max(radius, 0.0005), length, 12, 1, true);
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const cylinder = suppressRaycast(new Mesh(geometry, material));
  cylinder.name = name;
  cylinder.position.copy(from).add(to).multiplyScalar(0.5);
  cylinder.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()));
  cylinder.frustumCulled = false;
  cylinder.renderOrder = renderOrder;
  return cylinder;
}

function createLabelTexture(title: string, detail: string, accent: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create EHL-2 diagnostic label canvas');

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(6, 18, 20, 0.88)';
  context.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.strokeRect(6.5, 6.5, canvas.width - 13, canvas.height - 13);
  const fontFamily = '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", ui-monospace, SFMono-Regular, Menlo, monospace';
  const drawFittedText = (
    text: string,
    y: number,
    weight: number,
    preferredSize: number,
    minimumSize: number,
  ) => {
    let size = preferredSize;
    context.font = `${weight} ${size}px ${fontFamily}`;
    while (size > minimumSize && context.measureText(text).width > canvas.width - 52) {
      size -= 1;
      context.font = `${weight} ${size}px ${fontFamily}`;
    }
    context.fillText(text, 26, y);
  };
  context.fillStyle = accent;
  drawFittedText(title, 52, 700, 38, 22);
  context.fillStyle = 'rgba(236, 246, 242, 0.94)';
  drawFittedText(detail, 94, 500, 25, 16);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createLabel(
  name: string,
  position: Vec3Tuple,
  title: string,
  detail: string,
  accent: string,
  depthTest: boolean,
  renderOrder: number,
) {
  const texture = createLabelTexture(title, detail, accent);
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.98,
    depthTest,
    depthWrite: false,
    toneMapped: false,
  });
  const label = suppressRaycast(new Sprite(material));
  label.name = name;
  label.position.copy(vector(position)).add(new Vector3(0, 0.16, 0));
  label.scale.set(0.88, 0.22, 1);
  label.center.set(0.08, 0);
  label.frustumCulled = false;
  label.renderOrder = renderOrder;
  return label;
}

function createPortMarkersGroup(
  input: unknown,
  depthTest: boolean,
  labelLocale: 'zh-CN' | 'en',
) {
  const ports = normalizePortMarkers(input);
  if (!ports) return null;
  const group = suppressRaycast(new Group());
  group.name = PORT_MARKERS_NAME;
  group.userData = {
    kind: 'ehl2-diagview2-reviewed-port-centres',
    authority: 'reviewed-design-port-context-not-as-built-survey',
    coordinateFrame: 'EHL2 web Y-up metres',
    pointCount: ports.points.length,
    selectedId: ports.selectedId,
    raycast: false,
  };
  ports.points.forEach((port) => {
    const selected = port.id === ports.selectedId;
    const color = selected ? ports.selectedColor : ports.color;
    const marker = createMarker(
      `${PORT_MARKERS_NAME}_${objectNameToken(port.id)}`,
      port.positionWebMetres,
      color,
      selected ? 0.052 : 0.025,
      selected ? Math.max(0.92, ports.opacity) : ports.opacity,
      depthTest,
      selected ? 29 : 27,
    );
    marker.userData = {
      kind: 'reviewed-port-centre-marker',
      portId: port.id,
      label: port.label,
      selected,
      authority: group.userData.authority,
      positionWebMetres: [...port.positionWebMetres],
    };
    group.add(marker);
    if (port.normalWeb) {
      const end: Vec3Tuple = [
        port.positionWebMetres[0] + port.normalWeb[0] * 0.2,
        port.positionWebMetres[1] + port.normalWeb[1] * 0.2,
        port.positionWebMetres[2] + port.normalWeb[2] * 0.2,
      ];
      const normalIndicator = createLineSegments(
        `${marker.name}_NORMAL`,
        [[port.positionWebMetres, end]],
        color,
        ports.opacity,
        depthTest,
        selected ? 29 : 27,
      );
      normalIndicator.userData = {
        kind: 'reviewed-port-normal-indicator',
        portId: port.id,
        lengthMetres: 0.2,
        authority: group.userData.authority,
      };
      group.add(normalIndicator);
    }
    if (selected && ports.showSelectedLabel) {
      const accent = `#${color.toString(16).padStart(6, '0')}`;
      group.add(createLabel(
        `${marker.name}_LABEL`,
        port.positionWebMetres,
        port.label,
        labelLocale === 'zh-CN' ? '经审阅设计端口 · 非实装测量' : 'REVIEWED DESIGN PORT · NOT AS-BUILT SURVEY',
        accent,
        depthTest,
        30,
      ));
    }
  });
  return group;
}

function createScenarioGroup(
  geometry: Ehl2DiagnosticScenarioGeometry,
  options: Ehl2PptDiagnosticOverlayOptions,
  depthTest: boolean,
) {
  const { scenario } = geometry;
  const group = new Group();
  group.name = `EHL2_DIAGNOSTIC_${scenario.id.toUpperCase()}`;
  group.userData = {
    kind: 'ehl2-diagnostic-fov',
    scenarioId: scenario.id,
    diagnosticId: scenario.diagnosticId,
    authority: geometry.authority,
    azimuthDeg: scenario.azimuthDeg,
  };

  const active = scenario.id === options.activeScenarioId;
  const emphasis = options.mode === 'inspect' || active ? 1 : 0.72;
  const origin = geometry.originWebMetres;
  const [planarLeft, planarRight] = geometry.planarBoundaryEndsWebMetres;
  group.add(createSurface(
    `${group.name}_PLANAR_COVERAGE`,
    [origin, planarLeft, planarRight],
    [0, 1, 2],
    scenario.color,
    0.14 * emphasis,
    depthTest,
    30,
  ));

  if (geometry.frustumCornersWebMetres) {
    const corners = geometry.frustumCornersWebMetres;
    group.add(createSurface(
      `${group.name}_THREE_DIMENSIONAL_FRUSTUM`,
      [origin, ...corners],
      [
        0, 1, 2,
        0, 2, 3,
        0, 3, 4,
        0, 4, 1,
        1, 4, 3,
        1, 3, 2,
      ],
      scenario.color,
      0.1 * emphasis,
      depthTest,
      31,
    ));
  }

  group.add(createLineSegments(
    `${group.name}_OPTICAL_AXIS`,
    [[origin, geometry.opticalAxisEndWebMetres]],
    scenario.color,
    0.98 * emphasis,
    depthTest,
    34,
  ));

  if (options.showBoundaryRays) {
    const boundarySegments: Segment[] = geometry.frustumCornersWebMetres
      ? [
        ...geometry.frustumCornersWebMetres.map((corner) => [origin, corner] as const),
        ...geometry.frustumCornersWebMetres.map((corner, index, corners) => (
          [corner, corners[(index + 1) % corners.length]] as const
        )),
      ]
      : [
        [origin, planarLeft],
        [origin, planarRight],
        [planarLeft, planarRight],
      ];
    group.add(createLineSegments(
      `${group.name}_BOUNDARY_RAYS`,
      boundarySegments,
      scenario.color,
      0.82 * emphasis,
      depthTest,
      33,
    ));
  }

  group.add(createMarker(
    `${group.name}_OPTICAL_CENTRE`,
    origin,
    scenario.color,
    active ? 0.045 : 0.035,
    0.98 * emphasis,
    depthTest,
    35,
  ));

  if (options.showLabels) {
    const isChinese = options.labelLocale === 'zh-CN';
    const editableInspection = options.mode === 'inspect' && active;
    const horizontalHalfAngleDeg = editableInspection ? options.horizontalHalfAngleDeg : 50;
    const verticalHalfAngleDeg = editableInspection ? options.verticalHalfAngleDeg : 0;
    const fovLabel = verticalHalfAngleDeg > 0
      ? isChinese
        ? `水平半视场 ±${horizontalHalfAngleDeg}° · 垂直半视场 ±${verticalHalfAngleDeg}°`
        : `H HALF-FOV ±${horizontalHalfAngleDeg}° · V HALF-FOV ±${verticalHalfAngleDeg}°`
      : isChinese
        ? `平面半视场 ±${horizontalHalfAngleDeg}°`
        : `PLANAR HALF-FOV ±${horizontalHalfAngleDeg}°`;
    const authorityLabel = geometry.authority === 'user-assumption'
      ? isChinese ? '用户三维假设' : 'USER 3D ASSUMPTION'
      : isChinese ? 'PPT平面参考' : 'PPT PLANAR REFERENCE';
    group.add(createLabel(
      `${group.name}_LABEL`,
      origin,
      isChinese
        ? `${scenario.diagnosticId} · 环向角 ${scenario.azimuthDeg}°`
        : `${scenario.diagnosticId} · TOROIDAL ${scenario.azimuthDeg}°`,
      `${fovLabel} · ${authorityLabel}`,
      scenario.colorCss,
      depthTest,
      36,
    ));
  }
  return group;
}

function toWeb(point: readonly [number, number, number]): Vec3Tuple {
  return diagView2PointToEhl2Web(point);
}

function createWorkbenchGroup(
  options: Ehl2DiagnosticWorkbenchOverlayOptions,
  captureRole: 'active' | 'frozen' = 'active',
) {
  const group = new Group();
  group.name = `EHL2_DIAGVIEW2_WORKBENCH_${options.designId.toUpperCase().replace(/[^A-Z0-9_-]/g, '_')}`;
  group.userData = {
    kind: 'ehl2-diagview2-workbench-overlay',
    designId: options.designId,
    diagnosticType: options.diagnosticType,
    captureRole,
    authority: 'virtual-browser-output',
  };
  const depthTest = options.depthMode === 'physical';
  const resultByRayId = new Map(options.rayResults.map((result) => [result.rayId, result]));
  const visibleRays = options.previewRays.filter((ray) => ray.role !== 'fill');
  const segments: Segment[] = [];
  visibleRays.forEach((ray) => {
    const result = resultByRayId.get(ray.rayId);
    const endpoint = result?.hasIntersection && options.depthMode === 'physical'
      ? result.effectiveEndpointM
      : ray.defaultEndpointM;
    const segment = [toWeb(ray.originM), toWeb(endpoint)] as const;
    segments.push(segment);
    if (options.diagnosticType === 'LASER') {
      const cylinder = createCylinderSegment(
        `${group.name}_${ray.rayId}_BEAM`,
        segment[0],
        segment[1],
        options.color,
        options.laserDiameterMm / 2_000,
        0.24 * options.opacity,
        depthTest,
        44,
      );
      if (cylinder) group.add(cylinder);
    }
  });
  if (options.showRays && segments.length > 0) {
    group.add(createLineSegments(
      `${group.name}_RAYS`,
      segments,
      options.color,
      0.94 * options.opacity,
      depthTest,
      45,
    ));
  }
  if (options.diagnosticType === 'CAMERA') {
    const endpointFor = (rayId: string) => {
      const ray = visibleRays.find((candidate) => candidate.rayId === rayId);
      return ray ? toWeb(ray.defaultEndpointM) : null;
    };
    const first = visibleRays[0];
    const topLeft = endpointFor('top_edge_00');
    const topRight = endpointFor('top_edge_09');
    const bottomRight = endpointFor('bottom_edge_09');
    const bottomLeft = endpointFor('bottom_edge_00');
    if (first && topLeft && topRight && bottomRight && bottomLeft) {
      group.add(createSurface(
        `${group.name}_FINITE_FRUSTUM`,
        [toWeb(first.originM), topLeft, topRight, bottomRight, bottomLeft],
        [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1],
        options.color,
        0.11 * options.opacity,
        depthTest,
        43,
      ));
    }
  }
  const firstRay = visibleRays[0] ?? options.previewRays[0];
  if (firstRay) {
    const origin = toWeb(firstRay.originM);
    group.add(createMarker(`${group.name}_OPTICAL_CENTRE`, origin, options.color, 0.05, 0.98 * options.opacity, depthTest, 47));
    if (options.showLabels) {
      const isChinese = options.labelLocale === 'zh-CN';
      const typeLabel = options.diagnosticType === 'CAMERA'
        ? (isChinese ? '相机视锥' : 'CAMERA FOV')
        : options.diagnosticType === 'ARRAY'
          ? (isChinese ? '通道阵列' : 'RAY ARRAY')
          : (isChinese ? '激光路径' : 'LASER PATH');
      group.add(createLabel(
        `${group.name}_LABEL`,
        origin,
        options.designName,
        `${typeLabel} · ${visibleRays.length} ${isChinese ? '条可见射线' : 'VISIBLE RAYS'}`,
        options.colorCss,
        depthTest,
        48,
      ));
    }
  }
  if (options.showHitMarkers) {
    options.rayResults.filter((result) => result.hasIntersection && result.hitPointM).forEach((result) => {
      group.add(createMarker(
        `${group.name}_${result.rayId}_HIT`,
        toWeb(result.hitPointM!),
        0xff5d55,
        0.025,
        0.96 * options.opacity,
        depthTest,
        49,
      ));
    });
  }
  return group;
}

function blindZonePosition(azimuthDeg: number, heightMetres = 0): Vec3Tuple {
  const phi = azimuthDeg * Math.PI / 180;
  return diagView2PointToEhl2Web([
    NOMINAL_BLIND_ZONE_MARKER_RADIUS_METRES * Math.cos(phi),
    NOMINAL_BLIND_ZONE_MARKER_RADIUS_METRES * Math.sin(phi),
    heightMetres,
  ]);
}

function createBlindZoneGroup(options: Ehl2PptDiagnosticOverlayOptions, depthTest: boolean) {
  const group = new Group();
  const isChinese = options.labelLocale === 'zh-CN';
  group.name = 'EHL2_DIAGNOSTIC_BLIND_ZONE_MARKERS';
  group.userData = {
    kind: 'ehl2-diagnostic-blind-zone-assessment',
    sourceSlides: EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.sourceSlides,
    coordinateAuthority: 'assessment-marker-not-calibrated-geometry',
  };

  EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.diagnosticWindowAzimuthsDeg.forEach((azimuthDeg) => {
    const position = blindZonePosition(azimuthDeg);
    group.add(createMarker(
      `EHL2_BLIND_ZONE_WINDOW_${String(azimuthDeg).replace('.', '_')}`,
      position,
      0xffbd59,
      0.052,
      0.94,
      depthTest,
      38,
    ));
    if (options.showLabels) {
      group.add(createLabel(
        `EHL2_BLIND_ZONE_WINDOW_${String(azimuthDeg).replace('.', '_')}_LABEL`,
        position,
        isChinese
          ? `评估窗口 · 环向角 ${azimuthDeg}°`
          : `ASSESSMENT WINDOW · TOROIDAL ${azimuthDeg}°`,
        isChinese ? '盲区评估位置' : 'BLIND-ZONE ASSESSMENT LOCATION',
        '#ffbd59',
        depthTest,
        39,
      ));
    }
  });

  const upperDivertorAzimuth = EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.upperDivertor.nearAzimuthDeg;
  const upperDivertorPosition = blindZonePosition(upperDivertorAzimuth, 1.35);
  group.add(createMarker(
    'EHL2_UPPER_DIVERTOR_PARTIAL_BLIND_ZONE',
    upperDivertorPosition,
    0xff6f5d,
    0.065,
    0.96,
    depthTest,
    38,
  ));
  if (options.showLabels) {
    group.add(createLabel(
      'EHL2_UPPER_DIVERTOR_PARTIAL_BLIND_ZONE_LABEL',
      upperDivertorPosition,
      isChinese ? '上偏滤器局部盲区' : 'UPPER DIVERTOR LOCAL BLIND ZONE',
      isChinese
        ? `近环向角 ${upperDivertorAzimuth}° · 仅作评估标记`
        : `NEAR TOROIDAL ${upperDivertorAzimuth}° · ASSESSMENT ONLY`,
      '#ff6f5d',
      depthTest,
      39,
    ));
  }
  return group;
}

export function createEhl2DiagnosticThreeOverlay(
  context: Ehl2DiagnosticThreeOverlayContext,
  initialOptions?: Ehl2DiagnosticOverlayOptions,
): Ehl2DiagnosticThreeOverlay {
  const root = new Group();
  root.name = ROOT_NAME;
  root.renderOrder = 30;
  root.visible = false;
  root.userData = {
    kind: 'ehl2-diagnostic-overlay',
    coordinateFrame: 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1',
    raycast: false,
  };
  context.physicalWebMetresRoot.add(root);

  let disposed = false;
  let content: Group | null = null;

  const clearContent = () => {
    if (!content) return;
    content.removeFromParent();
    disposeRenderTree(content);
    content.clear();
    content = null;
  };

  const setOptions = (nextOptions?: Ehl2DiagnosticOverlayOptions) => {
    if (disposed) return;
    clearContent();
    if (!nextOptions) {
      root.visible = false;
      return;
    }

    const nextContent = new Group();
    nextContent.name = `${ROOT_NAME}_CONTENT`;
    const contextOptions = nextOptions as {
      depthMode?: unknown;
      labelLocale?: unknown;
      plasmaContext?: unknown;
      plasmaContexts?: unknown;
      plasmaClippingPlanesWebMetres?: unknown;
      portMarkers?: unknown;
    };
    const requestedDepthTest = contextOptions.depthMode === 'physical';
    const plasmaClippingPlanes = normalizePlasmaClippingPlanes(
      contextOptions.plasmaClippingPlanesWebMetres,
      context.physicalWebMetresRoot,
    );
    const legacyPlasmaGroup = plasmaClippingPlanes && createPlasmaContextGroup(
      contextOptions.plasmaContext,
      requestedDepthTest,
      'geqdsk-context',
      PLASMA_CONTEXT_NAME,
      plasmaClippingPlanes,
    );
    if (legacyPlasmaGroup) nextContent.add(legacyPlasmaGroup);
    if (plasmaClippingPlanes && Array.isArray(contextOptions.plasmaContexts)) {
      contextOptions.plasmaContexts.forEach((plasmaContext, index) => {
        const rawId = plasmaContext && typeof plasmaContext === 'object' && !Array.isArray(plasmaContext)
          ? (plasmaContext as Record<string, unknown>).id
          : undefined;
        const fallbackId = `plasma-layer-${index + 1}`;
        const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : fallbackId;
        const groupName = `${PLASMA_CONTEXT_NAME}_LAYER_${index + 1}_${objectNameToken(id)}`;
        const plasmaGroup = createPlasmaContextGroup(
          plasmaContext,
          requestedDepthTest,
          fallbackId,
          groupName,
          plasmaClippingPlanes,
        );
        if (plasmaGroup) nextContent.add(plasmaGroup);
      });
    }
    const portMarkersGroup = createPortMarkersGroup(
      contextOptions.portMarkers,
      requestedDepthTest,
      contextOptions.labelLocale === 'zh-CN' ? 'zh-CN' : 'en',
    );
    if (portMarkersGroup) nextContent.add(portMarkersGroup);
    if ((nextOptions as { kind?: unknown }).kind === 'diagview2-workbench') {
      const workbench = nextOptions as Ehl2DiagnosticWorkbenchOverlayOptions;
      workbench.backgroundLayers?.forEach((background) => {
        nextContent.add(createWorkbenchGroup({
          ...workbench,
          ...background,
          rayResults: [],
          opacity: background.opacity,
          showLabels: false,
          showHitMarkers: false,
          backgroundLayers: undefined,
        }, 'frozen'));
      });
      nextContent.add(createWorkbenchGroup(workbench));
      root.add(nextContent);
      root.visible = true;
      content = nextContent;
      return;
    }
    const options = normalizeEhl2DiagnosticOverlayOptions(nextOptions as Ehl2PptDiagnosticOverlayOptions);
    const depthTest = options.depthMode === 'physical';
    scenarioIdsForMode(options).forEach((scenarioId) => {
      const scenario = scenarioForId(scenarioId);
      const geometry = buildEhl2DiagnosticScenarioGeometry(scenario, options);
      nextContent.add(createScenarioGroup(geometry, options, depthTest));
    });
    if (options.showBlindZones) nextContent.add(createBlindZoneGroup(options, depthTest));
    root.add(nextContent);
    root.visible = true;
    content = nextContent;
  };

  setOptions(initialOptions);

  return {
    setOptions,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearContent();
      root.removeFromParent();
      root.clear();
    },
  };
}
