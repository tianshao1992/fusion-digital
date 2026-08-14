import type { EfitGeometry, EfitTopologyGraphFramePayload } from './types';

const RUNTIME_LIMITS = Object.freeze({
  nodes: 512,
  edges: 1_024,
  wallArcs: 1_024,
  unresolvedArms: 512,
  unresolvedRegions: 128,
  regions: 128,
  closedFluxSurfaces: 128,
  pointsPerCurve: 4_096,
  totalCurvePoints: 262_144,
  idCharacters: 96,
});

type JsonRecord = Record<string, unknown>;

export type EfitTopologyGraphValidationContext = {
  geometry: EfitGeometry;
  expectedShotId?: string;
  expectedReconstructionId?: string;
  expectedTimeMs?: number;
};

function fail(message: string): never {
  throw new Error(`EFIT topology graph: ${message}`);
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  return value as JsonRecord;
}

function array(value: unknown, label: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} must be a bounded array.`);
  return value;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} must be finite.`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = finite(value, label);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) fail(`${label} must be an integer in range.`);
  return parsed;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') fail(`${label} must be boolean.`);
  return value;
}

function string(value: unknown, label: string, maximum: number = RUNTIME_LIMITS.idCharacters): string {
  if (typeof value !== 'string' || !value || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    fail(`${label} must be a bounded non-control string.`);
  }
  return value;
}

function literal<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
  const parsed = string(value, label);
  if (!allowed.includes(parsed as T)) fail(`${label} has an unsupported value.`);
  return parsed as T;
}

function nullableFinite(value: unknown, label: string): number | null {
  return value === null ? null : finite(value, label);
}

function stringList(value: unknown, label: string, maximum = 256): readonly string[] {
  return array(value, label, maximum).map((entry, index) => string(entry, `${label}[${index}]`, 160));
}

function evidence(value: unknown, label: string): void {
  const item = record(value, label);
  string(item.source, `${label}.source`, 160);
  string(item.state, `${label}.state`, 80);
  string(item.confidence, `${label}.confidence`, 80);
  stringList(item.flags, `${label}.flags`, 128);
  if (item.reason !== undefined) string(item.reason, `${label}.reason`, 320);
}

function pointBounds(context: EfitTopologyGraphValidationContext): readonly [number, number, number, number] {
  const extent = context.geometry.gridExtentM;
  if (!extent || extent.length !== 4 || extent.some((value) => !Number.isFinite(value))
    || extent[1] <= extent[0] || extent[3] <= extent[2]) {
    fail('the selected geometry has no finite source-grid extent.');
  }
  return extent;
}

function validateRz(r: unknown, z: unknown, label: string, bounds: readonly [number, number, number, number]): void {
  const parsedR = finite(r, `${label}.rM`);
  const parsedZ = finite(z, `${label}.zM`);
  const epsilon = 1e-6;
  if (parsedR < 0 || parsedR < bounds[0] - epsilon || parsedR > bounds[1] + epsilon
    || parsedZ < bounds[2] - epsilon || parsedZ > bounds[3] + epsilon) {
    fail(`${label} is outside the reviewed source grid.`);
  }
}

function flatRz(
  value: unknown,
  label: string,
  bounds: readonly [number, number, number, number],
  minimumPoints: number,
  total: { points: number },
): readonly number[] {
  if (!Array.isArray(value) || value.length % 2 !== 0) fail(`${label} must contain complete R-Z pairs.`);
  const pointCount = value.length / 2;
  if (pointCount < minimumPoints || pointCount > RUNTIME_LIMITS.pointsPerCurve) {
    fail(`${label} has an invalid point count.`);
  }
  total.points += pointCount;
  if (total.points > RUNTIME_LIMITS.totalCurvePoints) fail('frame curve capacity was exceeded.');
  for (let index = 0; index < value.length; index += 2) {
    validateRz(value[index], value[index + 1], `${label}[${index / 2}]`, bounds);
  }
  return value as readonly number[];
}

function requireClosed(points: readonly number[], label: string): void {
  if (Math.hypot(points[0] - points.at(-2)!, points[1] - points.at(-1)!) > 1e-5) {
    fail(`${label} is declared closed but its endpoints do not close.`);
  }
}

function validateFeatures(
  value: unknown,
  nodeById: Map<string, JsonRecord>,
  edgeIds: Set<string>,
  counts: { nodes: readonly JsonRecord[]; edges: readonly JsonRecord[]; unresolvedArms: readonly JsonRecord[] },
): void {
  const item = record(value, 'topologyGraph.features');
  const xNodes = counts.nodes.filter((node) => node.kind === 'x-point');
  const wallNodes = counts.nodes.filter((node) => node.kind === 'wall-intersection');
  const expected: Record<string, number> = {
    xPointCount: xNodes.length,
    activeXPointCount: xNodes.filter((node) => node.role === 'boundary' && node.activeBranchEligible === true).length,
    candidateXPointCount: xNodes.filter((node) => node.role === 'near-boundary').length,
    boundaryXPointCount: xNodes.filter((node) => node.role === 'boundary').length,
    nearBoundaryXPointCount: xNodes.filter((node) => node.role === 'near-boundary').length,
    wallIntersectionCount: wallNodes.length,
    resolvedBranchCount: counts.edges.length,
    unresolvedArmCount: counts.unresolvedArms.length,
  };
  Object.entries(expected).forEach(([key, count]) => {
    if (integer(item[key], `topologyGraph.features.${key}`) !== count) fail(`features.${key} disagrees with graph records.`);
  });
  array(item.nullClusters, 'topologyGraph.features.nullClusters', RUNTIME_LIMITS.nodes)
    .forEach((entry, index) => {
      const cluster = record(entry, `features.nullClusters[${index}]`);
      const nodeIds = array(cluster.nodeIds, `features.nullClusters[${index}].nodeIds`, 2);
      if (nodeIds.length !== 2) fail('null cluster must reference exactly two nodes.');
      nodeIds.forEach((nodeId, nodeIndex) => {
        const id = string(nodeId, `features.nullClusters[${index}].nodeIds[${nodeIndex}]`);
        if (nodeById.get(id)?.kind !== 'x-point') fail('null cluster references an unknown non-X node.');
      });
      finite(cluster.distanceM, `features.nullClusters[${index}].distanceM`);
      finite(cluster.deltaPsiN, `features.nullClusters[${index}].deltaPsiN`);
      literal(cluster.interpretation, `features.nullClusters[${index}].interpretation`, ['multi-null-cluster-candidate']);
    });
  stringList(item.extendedLegCandidateEdgeIds, 'features.extendedLegCandidateEdgeIds', RUNTIME_LIMITS.edges)
    .forEach((edgeId) => {
      if (!edgeIds.has(edgeId)) fail('extended-leg candidate references an unknown edge.');
    });
}

/**
 * Validates an untrusted NDJSON frame against the selected per-shot geometry.
 * It returns the original JSON object only after every variable-length array,
 * coordinate, identifier and graph reference has passed fail-closed checks.
 */
export function validateEfitTopologyGraphFrame(
  value: unknown,
  context: EfitTopologyGraphValidationContext,
): EfitTopologyGraphFramePayload {
  const frame = record(value, 'frame');
  const geometryId = string(frame.geometryId, 'frame.geometryId');
  if (!context.geometry.geometryId || geometryId !== context.geometry.geometryId) fail('frame geometryId does not match the selected shot geometry.');
  const frameId = string(frame.frameId, 'frame.frameId', 192);
  const shotId = string(frame.shotId, 'frame.shotId', 160);
  const reconstructionId = string(frame.reconstructionId, 'frame.reconstructionId', 192);
  const timeMs = integer(frame.timeMs, 'frame.timeMs', Number.MIN_SAFE_INTEGER);
  if (context.expectedShotId !== undefined && shotId !== context.expectedShotId) fail('frame shotId does not match its catalog record.');
  if (context.expectedReconstructionId !== undefined && reconstructionId !== context.expectedReconstructionId) fail('frame reconstructionId does not match its catalog record.');
  if (context.expectedTimeMs !== undefined && timeMs !== context.expectedTimeMs) fail('frame time does not match its catalog timeline.');
  void frameId;

  const bounds = pointBounds(context);
  const total = { points: 0 };
  const quality = record(frame.quality, 'frame.quality');
  const qualityValidity = literal(quality.validity, 'frame.quality.validity', ['usable', 'partial', 'unavailable']);
  stringList(quality.flags, 'frame.quality.flags', 256);
  if (finite(quality.positionUncertaintyFloorM, 'frame.quality.positionUncertaintyFloorM') < 0) {
    fail('frame position uncertainty must be nonnegative.');
  }
  string(quality.algorithmVersion, 'frame.quality.algorithmVersion', 96);
  const sourceGrid = record(quality.sourceGrid, 'frame.quality.sourceGrid');
  integer(sourceGrid.nr, 'frame.quality.sourceGrid.nr', 2, 8_192);
  integer(sourceGrid.nz, 'frame.quality.sourceGrid.nz', 2, 8_192);
  const sourceBounds = [
    finite(sourceGrid.rMinM, 'frame.quality.sourceGrid.rMinM'),
    finite(sourceGrid.rMaxM, 'frame.quality.sourceGrid.rMaxM'),
    finite(sourceGrid.zMinM, 'frame.quality.sourceGrid.zMinM'),
    finite(sourceGrid.zMaxM, 'frame.quality.sourceGrid.zMaxM'),
  ] as const;
  if (sourceBounds[1] <= sourceBounds[0] || sourceBounds[3] <= sourceBounds[2]
    || sourceBounds.some((bound, index) => Math.abs(bound - bounds[index]) > 2e-5)) {
    fail('frame source-grid bounds disagree with the selected geometry contract.');
  }

  const scalars = record(frame.scalars, 'frame.scalars');
  ['currentA', 'rAxisM', 'zAxisM', 'bcentrT', 'psiAxisWbPerRad', 'psiBoundaryWbPerRad']
    .forEach((key) => finite(scalars[key], `frame.scalars.${key}`));
  validateRz(scalars.rAxisM, scalars.zAxisM, 'frame.scalars.magneticAxis', bounds);
  ['q95', 'efitError', 'iconvr'].forEach((key) => nullableFinite(scalars[key], `frame.scalars.${key}`));

  const surfaceIds = new Set<string>();
  const surfaces = array(frame.closedFluxSurfaces, 'frame.closedFluxSurfaces', RUNTIME_LIMITS.closedFluxSurfaces);
  surfaces.forEach((entry, index) => {
    const surface = record(entry, `closedFluxSurfaces[${index}]`);
    const id = string(surface.surfaceId, `closedFluxSurfaces[${index}].surfaceId`);
    if (surfaceIds.has(id)) fail('closedFluxSurfaces contains a duplicate surfaceId.');
    surfaceIds.add(id);
    literal(surface.source, `closedFluxSurfaces[${index}].source`, ['derived-contour', 'g-eqdsk-boundary-polyline']);
    finite(surface.psiN, `closedFluxSurfaces[${index}].psiN`);
    if (!boolean(surface.closed, `closedFluxSurfaces[${index}].closed`)) fail('published closed surface must be closed.');
    boolean(surface.containsMagneticAxis, `closedFluxSurfaces[${index}].containsMagneticAxis`);
    if (finite(surface.areaM2, `closedFluxSurfaces[${index}].areaM2`) <= 0) fail('closed surface area must be positive.');
    // Published surface samples are a bounded unique ring; `closed:true`
    // supplies the implicit final segment back to the first point. Requiring
    // the first point to be serialized twice would reject the reviewed
    // equal-arc 128-point contract.
    flatRz(surface.pointsRzM, `closedFluxSurfaces[${index}].pointsRzM`, bounds, 4, total);
    evidence(surface.evidence, `closedFluxSurfaces[${index}].evidence`);
  });

  const graph = record(frame.topologyGraph, 'frame.topologyGraph');
  const canonical = record(graph.canonicalRepresentation, 'topologyGraph.canonicalRepresentation');
  literal(canonical.kind, 'topologyGraph.canonicalRepresentation.kind', ['node-edge-region-topology-graph']);
  literal(canonical.schemaVersion, 'topologyGraph.canonicalRepresentation.schemaVersion', ['fusion.efit.topology-graph.v2']);
  string(canonical.coordinateSpace, 'topologyGraph.canonicalRepresentation.coordinateSpace', 192);
  if (string(canonical.geometryId, 'topologyGraph.canonicalRepresentation.geometryId') !== geometryId) fail('graph canonical geometryId mismatch.');

  const nodeEntries = array(graph.nodes, 'topologyGraph.nodes', RUNTIME_LIMITS.nodes);
  const nodes = nodeEntries.map((entry, index) => record(entry, `topologyGraph.nodes[${index}]`));
  if (nodes.length === 0 && qualityValidity !== 'unavailable') {
    fail('usable or partial frames must publish at least one topology node.');
  }
  const nodeById = new Map<string, JsonRecord>();
  nodes.forEach((node, index) => {
    const label = `topologyGraph.nodes[${index}]`;
    const id = string(node.nodeId, `${label}.nodeId`, 192);
    if (nodeById.has(id)) fail('topologyGraph contains a duplicate nodeId.');
    nodeById.set(id, node);
    const kind = literal(node.kind, `${label}.kind`, ['magnetic-axis', 'x-point', 'wall-intersection']);
    validateRz(node.rM, node.zM, label, bounds);
    if (kind === 'x-point') {
      const role = literal(node.role, `${label}.role`, ['boundary', 'near-boundary']);
      literal(node.activityRole, `${label}.activityRole`, ['primary', 'secondary']);
      const eligible = boolean(node.activeBranchEligible, `${label}.activeBranchEligible`);
      const evidenceOnly = boolean(node.evidenceOnly, `${label}.evidenceOnly`);
      if (eligible !== (role === 'boundary') || evidenceOnly !== (role !== 'boundary')) fail('X-point activity flags disagree with its role.');
      evidence(node.evidence, `${label}.evidence`);
      const psiN = finite(node.psiN, `${label}.psiN`);
      const psiDistance = finite(node.absPsiNMinusOne, `${label}.absPsiNMinusOne`);
      if (Math.abs(psiDistance - Math.abs(psiN - 1)) > 1e-9
        || psiDistance < 0
        || psiDistance > (role === 'boundary' ? 0.002 : 0.02) + 1e-12) {
        fail('X-point psiN evidence is inconsistent with its role.');
      }
      const gradientResidual = finite(node.gradientResidual, `${label}.gradientResidual`);
      const fitRms = finite(node.fitRms, `${label}.fitRms`);
      const lcfsDistanceM = finite(node.lcfsDistanceM, `${label}.lcfsDistanceM`);
      const positionUncertaintyM = finite(node.positionUncertaintyM, `${label}.positionUncertaintyM`);
      if (gradientResidual < 0 || fitRms < 0 || fitRms > 0.01 + 1e-12 || lcfsDistanceM < 0 || positionUncertaintyM < 0) {
        fail('X-point fit evidence is outside its reviewed bounds.');
      }
      const eigenvalues = array(node.hessianEigenvaluesPerM2, `${label}.hessianEigenvaluesPerM2`, 2);
      if (eigenvalues.length !== 2) fail('X-point Hessian must contain two eigenvalues.');
      const eigen0 = finite(eigenvalues[0], `${label}.hessianEigenvaluesPerM2[0]`);
      const eigen1 = finite(eigenvalues[1], `${label}.hessianEigenvaluesPerM2[1]`);
      if (!(eigen0 < 0 && eigen1 > 0)) fail('X-point Hessian must have one negative and one positive eigenvalue.');
    } else if (kind === 'wall-intersection') {
      if (string(node.geometryId, `${label}.geometryId`) !== geometryId) fail('wall node geometryId mismatch.');
      const segmentCount = context.geometry.canonicalSegmentCount ?? context.geometry.limiterRzM.validPoints - 1;
      const segment = integer(node.wallSegment, `${label}.wallSegment`, 0, segmentCount - 1);
      const fraction = finite(node.wallSegmentFraction, `${label}.wallSegmentFraction`);
      const wallS = finite(node.wallSNormalized, `${label}.wallSNormalized`);
      if (fraction < 0 || fraction > 1 || wallS < 0 || wallS > 1) fail('wall node uses an invalid canonical segment coordinate.');
      finite(node.positionUncertaintyM, `${label}.positionUncertaintyM`);
      const limiter = context.geometry.limiterRzM;
      const expectedR = Number(limiter.rM[segment]) + fraction * (Number(limiter.rM[segment + 1]) - Number(limiter.rM[segment]));
      const expectedZ = Number(limiter.zM[segment]) + fraction * (Number(limiter.zM[segment + 1]) - Number(limiter.zM[segment]));
      if (Math.hypot(expectedR - Number(node.rM), expectedZ - Number(node.zM)) > 1e-5) fail('wall node does not lie on its canonical limiter segment.');
      let perimeterM = 0;
      let positionM = 0;
      for (let limiterIndex = 0; limiterIndex + 1 < limiter.validPoints; limiterIndex += 1) {
        const segmentLength = Math.hypot(
          Number(limiter.rM[limiterIndex + 1]) - Number(limiter.rM[limiterIndex]),
          Number(limiter.zM[limiterIndex + 1]) - Number(limiter.zM[limiterIndex]),
        );
        if (limiterIndex < segment) positionM += segmentLength;
        if (limiterIndex === segment) positionM += fraction * segmentLength;
        perimeterM += segmentLength;
      }
      if (perimeterM <= 0 || Math.abs(wallS - positionM / perimeterM) > 2e-5) fail('wall node normalized arc coordinate is inconsistent.');
    }
  });

  const edgeEntries = array(graph.edges, 'topologyGraph.edges', RUNTIME_LIMITS.edges);
  const edges = edgeEntries.map((entry, index) => record(entry, `topologyGraph.edges[${index}]`));
  const edgeIds = new Set<string>();
  edges.forEach((edge, index) => {
    const label = `topologyGraph.edges[${index}]`;
    const id = string(edge.edgeId, `${label}.edgeId`, 192);
    if (edgeIds.has(id)) fail('topologyGraph contains a duplicate edgeId.');
    edgeIds.add(id);
    literal(edge.kind, `${label}.kind`, ['constant-flux-separatrix-branch']);
    literal(edge.status, `${label}.status`, ['active-derived']);
    integer(edge.sourceArmIndex, `${label}.sourceArmIndex`, 0, 255);
    const fromId = string(edge.fromNodeId, `${label}.fromNodeId`, 192);
    const toId = string(edge.toNodeId, `${label}.toNodeId`, 192);
    const source = nodeById.get(fromId);
    const target = nodeById.get(toId);
    if (!source || !target) fail('edge references an unknown node.');
    if (source.kind !== 'x-point' || source.role !== 'boundary') fail('active edge must originate at a boundary X-point.');
    const psiN = finite(edge.psiN, `${label}.psiN`);
    const arcLengthM = finite(edge.arcLengthM, `${label}.arcLengthM`);
    const directDistanceM = finite(edge.directDistanceM, `${label}.directDistanceM`);
    const maxPsiNResidual = finite(edge.maxPsiNResidual, `${label}.maxPsiNResidual`);
    const extensionRatio = nullableFinite(edge.extensionRatio, `${label}.extensionRatio`);
    if (arcLengthM < 0 || directDistanceM < 0 || maxPsiNResidual < 0 || maxPsiNResidual > 0.002 + 1e-12
      || Math.abs(psiN - Number(source.psiN)) > 1e-9
      || (extensionRatio !== null && extensionRatio < 1 - 1e-6)) {
      fail('edge metrics are outside their reviewed bounds.');
    }
    const closed = boolean(edge.closed, `${label}.closed`);
    const points = flatRz(edge.pointsRzM, `${label}.pointsRzM`, bounds, 2, total);
    if (Math.hypot(points[0] - Number(source.rM), points[1] - Number(source.zM)) > 2e-4
      || Math.hypot(points.at(-2)! - Number(target.rM), points.at(-1)! - Number(target.zM)) > 2e-4) {
      fail('edge endpoints do not match their graph nodes.');
    }
    if (closed) requireClosed(points, label);
  });

  const wallArcEntries = array(graph.wallArcs, 'topologyGraph.wallArcs', RUNTIME_LIMITS.wallArcs);
  const wallArcs = wallArcEntries.map((entry, index) => record(entry, `topologyGraph.wallArcs[${index}]`));
  const wallArcIds = new Set<string>();
  wallArcs.forEach((arc, index) => {
    const label = `topologyGraph.wallArcs[${index}]`;
    const id = string(arc.wallArcId, `${label}.wallArcId`, 192);
    if (wallArcIds.has(id)) fail('topologyGraph contains a duplicate wallArcId.');
    wallArcIds.add(id);
    if (string(arc.geometryId, `${label}.geometryId`) !== geometryId) fail('wall arc geometryId mismatch.');
    literal(arc.direction, `${label}.direction`, ['canonical-forward']);
    boolean(arc.wrapsCanonicalStart, `${label}.wrapsCanonicalStart`);
    const startS = finite(arc.startSNormalized, `${label}.startSNormalized`);
    const endS = finite(arc.endSNormalized, `${label}.endSNormalized`);
    if (startS < 0 || startS > 1 || endS < 0 || endS > 1) fail('wall arc normalized coordinates are invalid.');
    finite(arc.arcLengthM, `${label}.arcLengthM`);
    const source = nodeById.get(string(arc.fromNodeId, `${label}.fromNodeId`, 192));
    const target = nodeById.get(string(arc.toNodeId, `${label}.toNodeId`, 192));
    if (source?.kind !== 'wall-intersection' || target?.kind !== 'wall-intersection') fail('wall arc endpoints must be wall nodes.');
    const points = flatRz(arc.pointsRzM, `${label}.pointsRzM`, bounds, 2, total);
    if (Math.hypot(points[0] - Number(source.rM), points[1] - Number(source.zM)) > 1e-5
      || Math.hypot(points.at(-2)! - Number(target.rM), points.at(-1)! - Number(target.zM)) > 1e-5) fail('wall arc endpoints do not match their nodes.');
  });

  const regionEntries = array(graph.regions, 'topologyGraph.regions', RUNTIME_LIMITS.regions);
  const regionIds = new Set<string>();
  regionEntries.forEach((entry, index) => {
    const region = record(entry, `topologyGraph.regions[${index}]`);
    const id = string(region.regionId, `topologyGraph.regions[${index}].regionId`);
    if (regionIds.has(id)) fail('topologyGraph contains a duplicate regionId.');
    regionIds.add(id);
    literal(region.kind, `topologyGraph.regions[${index}].kind`, ['closed-flux-region']);
    literal(region.state, `topologyGraph.regions[${index}].state`, ['derived']);
    finite(region.psiN, `topologyGraph.regions[${index}].psiN`);
    boolean(region.containsMagneticAxis, `topologyGraph.regions[${index}].containsMagneticAxis`);
    if (finite(region.areaM2, `topologyGraph.regions[${index}].areaM2`) <= 0) fail('closed region area must be positive.');
    evidence(region.evidence, `topologyGraph.regions[${index}].evidence`);
    const boundaries = array(region.boundary, `topologyGraph.regions[${index}].boundary`, RUNTIME_LIMITS.closedFluxSurfaces);
    if (boundaries.length === 0) fail('closed region must have a published boundary.');
    boundaries.forEach((boundaryValue, boundaryIndex) => {
      const boundary = record(boundaryValue, `topologyGraph.regions[${index}].boundary[${boundaryIndex}]`);
      if (integer(boundary.order, `region boundary order`) !== boundaryIndex) fail('region boundary order is not canonical.');
      literal(boundary.referenceKind, 'region boundary referenceKind', ['closed-surface']);
      const referenceId = string(boundary.referenceId, 'region boundary referenceId');
      if (!surfaceIds.has(referenceId)) fail('region boundary references an unknown closed surface.');
      literal(boundary.direction, 'region boundary direction', ['counter-clockwise']);
    });
  });

  const unresolvedArmEntries = array(graph.unresolvedArms, 'topologyGraph.unresolvedArms', RUNTIME_LIMITS.unresolvedArms);
  const unresolvedArms = unresolvedArmEntries.map((entry, index) => record(entry, `topologyGraph.unresolvedArms[${index}]`));
  const unresolvedArmIds = new Set<string>();
  unresolvedArms.forEach((arm, index) => {
    const label = `topologyGraph.unresolvedArms[${index}]`;
    const id = string(arm.unresolvedArmId, `${label}.unresolvedArmId`, 192);
    if (unresolvedArmIds.has(id)) fail('topologyGraph contains a duplicate unresolvedArmId.');
    unresolvedArmIds.add(id);
    const node = nodeById.get(string(arm.xPointNodeId, `${label}.xPointNodeId`, 192));
    if (node?.kind !== 'x-point') fail('unresolved arm references an unknown X-point.');
    integer(arm.armIndex, `${label}.armIndex`, 0, 255);
    literal(arm.state, `${label}.state`, ['unresolved']);
    string(arm.reason, `${label}.reason`, 320);
    if (boolean(arm.extrapolated, `${label}.extrapolated`)) fail('unresolved arm must never be extrapolated.');
  });

  const unresolvedRegionEntries = array(graph.unresolvedRegions, 'topologyGraph.unresolvedRegions', RUNTIME_LIMITS.unresolvedRegions);
  const unresolvedRegionIds = new Set<string>();
  unresolvedRegionEntries.forEach((entry, index) => {
    const region = record(entry, `topologyGraph.unresolvedRegions[${index}]`);
    const id = string(region.unresolvedRegionId, `unresolvedRegions[${index}].unresolvedRegionId`, 192);
    if (unresolvedRegionIds.has(id)) fail('topologyGraph contains a duplicate unresolvedRegionId.');
    unresolvedRegionIds.add(id);
    literal(region.kind, `unresolvedRegions[${index}].kind`, ['open-field-separatrix-region']);
    literal(region.state, `unresolvedRegions[${index}].state`, ['unresolved']);
    string(region.reason, `unresolvedRegions[${index}].reason`, 320);
    if (boolean(region.fabricated, `unresolvedRegions[${index}].fabricated`)) fail('unresolved region must not be fabricated.');
    stringList(region.edgeIds, `unresolvedRegions[${index}].edgeIds`, RUNTIME_LIMITS.edges)
      .forEach((edgeId) => { if (!edgeIds.has(edgeId)) fail('unresolved region references an unknown edge.'); });
    stringList(region.wallArcIds, `unresolvedRegions[${index}].wallArcIds`, RUNTIME_LIMITS.wallArcs)
      .forEach((arcId) => { if (!wallArcIds.has(arcId)) fail('unresolved region references an unknown wall arc.'); });
  });

  validateFeatures(graph.features, nodeById, edgeIds, { nodes, edges, unresolvedArms });
  return frame as unknown as EfitTopologyGraphFramePayload;
}
