export type DivertorRzPoint = readonly [number, number];

type NumericVector = ArrayLike<number>;

export type DivertorRegionCurveInput = {
  rM?: NumericVector;
  zM?: NumericVector;
  rzM?: NumericVector;
  pointsRzM?: NumericVector;
  validPoints?: number;
};

export type DivertorRegionTopologyInput = {
  kind?: string;
  xPoints?: readonly {
    rM: number;
    zM: number;
    role?: string;
    primary?: boolean;
  }[];
  strikePoints?: readonly {
    rM: number;
    zM: number;
    wallSegment?: number;
  }[];
  separatrixLegs?: readonly (DivertorRegionCurveInput & {
    xPointIndex?: number;
    strikePointIndex?: number;
    closed?: boolean;
  })[];
};

export type DivertorRegionGraphInput = {
  nodes?: readonly {
    nodeId?: string;
    kind?: string;
    role?: string;
    activityRole?: string;
    activeBranchEligible?: boolean;
    evidenceOnly?: boolean;
    rM?: number;
    zM?: number;
  }[];
  edges?: readonly (DivertorRegionCurveInput & {
    edgeId?: string;
    kind?: string;
    status?: string;
    fromNodeId?: string;
    toNodeId?: string;
    sourceArmIndex?: number;
    closed?: boolean;
  })[];
  wallArcs?: readonly (DivertorRegionCurveInput & {
    wallArcId?: string;
    fromNodeId?: string;
    toNodeId?: string;
  })[];
  unresolvedArms?: readonly {
    xPointNodeId?: string;
    extrapolated?: boolean;
  }[];
  unresolvedRegions?: readonly {
    kind?: string;
    state?: string;
    edgeIds?: readonly string[];
    wallArcIds?: readonly string[];
    fabricated?: boolean;
  }[];
};

export type DivertorRegionResult = {
  state: 'filled' | 'wireframe' | 'unavailable';
  code:
    | 'closed-reviewed-boundary'
    | 'closed-published-graph-boundary'
    | 'no-divertor-topology'
    | 'partial-topology'
    | 'primary-x-point'
    | 'separatrix-leg-count'
    | 'separatrix-leg-endpoints'
    | 'limiter-contract'
    | 'limiter-intersection'
    | 'ambiguous-limiter-arc'
    | 'invalid-closed-boundary';
  message: string;
  polygon: readonly DivertorRzPoint[];
  limiterArc: readonly DivertorRzPoint[];
  primaryXPointIndex?: number;
  legIndices: readonly number[];
};

type Candidate = {
  polygon: DivertorRzPoint[];
  limiterArc: DivertorRzPoint[];
};

const POINT_TOLERANCE_M = 0.004;
const GEOMETRY_EPSILON = 1e-9;
const MIN_REGION_AREA_M2 = 1e-5;

function distance(left: DivertorRzPoint, right: DivertorRzPoint): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function samePoint(left: DivertorRzPoint, right: DivertorRzPoint, tolerance = GEOMETRY_EPSILON): boolean {
  return distance(left, right) <= tolerance;
}

function finitePoint(r: unknown, z: unknown): DivertorRzPoint | null {
  const finiteR = Number(r);
  const finiteZ = Number(z);
  return Number.isFinite(finiteR) && Number.isFinite(finiteZ) && finiteR >= 0
    ? [finiteR, finiteZ]
    : null;
}

function curvePoints(curve: DivertorRegionCurveInput | undefined): DivertorRzPoint[] | null {
  if (!curve) return null;
  const points: DivertorRzPoint[] = [];
  const flat = curve.pointsRzM ?? curve.rzM;
  if (flat) {
    const declared = curve.validPoints ?? Math.floor(flat.length / 2);
    const count = Math.min(Math.max(0, Math.floor(declared)), Math.floor(flat.length / 2));
    for (let index = 0; index < count; index += 1) {
      const point = finitePoint(flat[index * 2], flat[index * 2 + 1]);
      if (!point) return null;
      points.push(point);
    }
  } else if (curve.rM && curve.zM) {
    const declared = curve.validPoints ?? Math.min(curve.rM.length, curve.zM.length);
    const count = Math.min(Math.max(0, Math.floor(declared)), curve.rM.length, curve.zM.length);
    for (let index = 0; index < count; index += 1) {
      const point = finitePoint(curve.rM[index], curve.zM[index]);
      if (!point) return null;
      points.push(point);
    }
  } else {
    return null;
  }
  return points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1]));
}

function normalizedLimiter(curve: DivertorRegionCurveInput | undefined): DivertorRzPoint[] | null {
  const points = curvePoints(curve);
  if (!points || points.length < 3) return null;
  // Published limiter wallSegment values index the original source order. Only
  // remove repeated closing vertices at the tail, so no segment id is shifted.
  while (points.length > 3 && samePoint(points[0], points.at(-1)!)) points.pop();
  return points.length >= 3 ? points : null;
}

function pointSegmentDistance(point: DivertorRzPoint, start: DivertorRzPoint, end: DivertorRzPoint): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= GEOMETRY_EPSILON) return distance(point, start);
  const parameter = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared));
  return distance(point, [start[0] + parameter * dx, start[1] + parameter * dz]);
}

function segmentParameter(point: DivertorRzPoint, start: DivertorRzPoint, end: DivertorRzPoint): number {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  return lengthSquared <= GEOMETRY_EPSILON
    ? 0
    : ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) / lengthSquared;
}

function forwardLimiterArc(
  wall: readonly DivertorRzPoint[],
  from: DivertorRzPoint,
  fromSegment: number,
  to: DivertorRzPoint,
  toSegment: number,
): DivertorRzPoint[] | null {
  const segmentCount = wall.length;
  if (fromSegment < 0 || fromSegment >= segmentCount || toSegment < 0 || toSegment >= segmentCount) return null;
  const fromParameter = segmentParameter(from, wall[fromSegment], wall[(fromSegment + 1) % segmentCount]);
  const toParameter = segmentParameter(to, wall[toSegment], wall[(toSegment + 1) % segmentCount]);
  const arc: DivertorRzPoint[] = [from];
  let segment = fromSegment;
  let traversed = 0;
  while (traversed <= segmentCount) {
    if (segment === toSegment && (traversed > 0 || toParameter >= fromParameter - GEOMETRY_EPSILON)) {
      arc.push(to);
      return arc.filter((point, index) => index === 0 || !samePoint(point, arc[index - 1]));
    }
    arc.push(wall[(segment + 1) % segmentCount]);
    segment = (segment + 1) % segmentCount;
    traversed += 1;
  }
  return null;
}

function signedArea(polygon: readonly DivertorRzPoint[]): number {
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const next = polygon[(index + 1) % polygon.length];
    sum += polygon[index][0] * next[1] - next[0] * polygon[index][1];
  }
  return sum / 2;
}

function orientation(a: DivertorRzPoint, b: DivertorRzPoint, c: DivertorRzPoint): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(point: DivertorRzPoint, start: DivertorRzPoint, end: DivertorRzPoint): boolean {
  return Math.abs(orientation(start, end, point)) <= GEOMETRY_EPSILON
    && point[0] >= Math.min(start[0], end[0]) - GEOMETRY_EPSILON
    && point[0] <= Math.max(start[0], end[0]) + GEOMETRY_EPSILON
    && point[1] >= Math.min(start[1], end[1]) - GEOMETRY_EPSILON
    && point[1] <= Math.max(start[1], end[1]) + GEOMETRY_EPSILON;
}

function segmentsIntersect(a: DivertorRzPoint, b: DivertorRzPoint, c: DivertorRzPoint, d: DivertorRzPoint): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > GEOMETRY_EPSILON && abD < -GEOMETRY_EPSILON) || (abC < -GEOMETRY_EPSILON && abD > GEOMETRY_EPSILON))
    && ((cdA > GEOMETRY_EPSILON && cdB < -GEOMETRY_EPSILON) || (cdA < -GEOMETRY_EPSILON && cdB > GEOMETRY_EPSILON))) return true;
  return (Math.abs(abC) <= GEOMETRY_EPSILON && onSegment(c, a, b))
    || (Math.abs(abD) <= GEOMETRY_EPSILON && onSegment(d, a, b))
    || (Math.abs(cdA) <= GEOMETRY_EPSILON && onSegment(a, c, d))
    || (Math.abs(cdB) <= GEOMETRY_EPSILON && onSegment(b, c, d));
}

function isSimplePolygon(polygon: readonly DivertorRzPoint[]): boolean {
  if (polygon.length < 3 || Math.abs(signedArea(polygon)) < MIN_REGION_AREA_M2) return false;
  for (let left = 0; left < polygon.length; left += 1) {
    const leftNext = (left + 1) % polygon.length;
    if (samePoint(polygon[left], polygon[leftNext])) return false;
    for (let right = left + 1; right < polygon.length; right += 1) {
      const rightNext = (right + 1) % polygon.length;
      if (left === right || leftNext === right || rightNext === left) continue;
      if (segmentsIntersect(polygon[left], polygon[leftNext], polygon[right], polygon[rightNext])) return false;
    }
  }
  return true;
}

function containsPoint(polygon: readonly DivertorRzPoint[], point: DivertorRzPoint): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const a = polygon[current];
    const b = polygon[previous];
    if (onSegment(point, a, b)) return true;
    const crosses = (a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function joinBoundary(
  firstLeg: readonly DivertorRzPoint[],
  limiterArc: readonly DivertorRzPoint[],
  secondLeg: readonly DivertorRzPoint[],
): DivertorRzPoint[] {
  const raw = [...firstLeg, ...limiterArc.slice(1), ...[...secondLeg].reverse().slice(1)];
  const polygon = raw.filter((point, index) => index === 0 || !samePoint(point, raw[index - 1]));
  if (polygon.length > 2 && samePoint(polygon[0], polygon.at(-1)!)) polygon.pop();
  return polygon;
}

function fallback(
  code: DivertorRegionResult['code'],
  message: string,
  state: DivertorRegionResult['state'] = 'wireframe',
  primaryXPointIndex?: number,
  legIndices: readonly number[] = [],
): DivertorRegionResult {
  return { state, code, message, polygon: [], limiterArc: [], primaryXPointIndex, legIndices };
}

/**
 * Builds a display-only divertor topology region from reviewed, published
 * boundaries. It never bridges strike points with an invented chord and never
 * interprets the region as a temperature, density or SOL field.
 */
export function deriveReviewedDivertorRegion(
  topology: DivertorRegionTopologyInput | null | undefined,
  limiter: DivertorRegionCurveInput | null | undefined,
  magneticAxis?: { rM: number; zM: number } | null,
): DivertorRegionResult {
  if (!topology || topology.kind === 'limited') {
    return fallback('no-divertor-topology', '当前帧没有可闭合的偏滤器拓扑边界。', 'unavailable');
  }
  if (topology.kind === 'partial' || topology.kind === 'unknown') {
    return fallback('partial-topology', '拓扑标记为不完整或待确认，区域填充已关闭，仅显示已发布线框。');
  }

  const xPoints = topology.xPoints ?? [];
  const primaryIndices = xPoints.flatMap((point, index) => {
    const explicitSecondary = point.role === 'secondary' || point.primary === false;
    const explicitPrimary = point.role === 'primary' || point.primary === true;
    return !explicitSecondary && (explicitPrimary || point.role === undefined) ? [index] : [];
  });
  if (primaryIndices.length !== 1) {
    return fallback('primary-x-point', '无法唯一确认主 X 点，区域填充已关闭，仅显示已发布线框。');
  }
  const primaryXPointIndex = primaryIndices[0];
  const primaryPoint = finitePoint(xPoints[primaryXPointIndex]?.rM, xPoints[primaryXPointIndex]?.zM);
  if (!primaryPoint) {
    return fallback('primary-x-point', '主 X 点坐标无效，区域填充已关闭，仅显示已发布线框。', 'wireframe', primaryXPointIndex);
  }

  const indexedLegs = (topology.separatrixLegs ?? [])
    .map((leg, index) => ({ leg, index }))
    .filter(({ leg }) => leg.xPointIndex === primaryXPointIndex);
  if (indexedLegs.length !== 2 || indexedLegs.some(({ leg }) => leg.closed !== false)) {
    return fallback('separatrix-leg-count', '主 X 点未关联恰好两条已审查开放分离支，区域填充已关闭，仅显示线框。', 'wireframe', primaryXPointIndex, indexedLegs.map(({ index }) => index));
  }

  const strikePoints = topology.strikePoints ?? [];
  const legs = indexedLegs.map(({ leg }) => curvePoints(leg));
  const strikeIndices = indexedLegs.map(({ leg }) => leg.strikePointIndex);
  if (legs.some((points) => !points || points.length < 2)
    || strikeIndices.some((index) => !Number.isInteger(index) || Number(index) < 0 || Number(index) >= strikePoints.length)
    || strikeIndices[0] === strikeIndices[1]) {
    return fallback('separatrix-leg-count', '分离支或 limiter 交点关联不完整，区域填充已关闭，仅显示线框。', 'wireframe', primaryXPointIndex, indexedLegs.map(({ index }) => index));
  }

  const reviewedLegs = legs as DivertorRzPoint[][];
  const reviewedStrikes = strikeIndices.map((index) => finitePoint(strikePoints[Number(index)].rM, strikePoints[Number(index)].zM));
  if (reviewedStrikes.some((point) => !point)
    || reviewedLegs.some((points, index) => distance(points[0], primaryPoint) > POINT_TOLERANCE_M
      || distance(points.at(-1)!, reviewedStrikes[index]!) > POINT_TOLERANCE_M)) {
    return fallback('separatrix-leg-endpoints', '分离支端点与主 X 点或 limiter 交点不一致，区域填充已关闭，仅显示线框。', 'wireframe', primaryXPointIndex, indexedLegs.map(({ index }) => index));
  }

  const wall = normalizedLimiter(limiter ?? undefined);
  if (!wall) {
    return fallback('limiter-contract', '缺少可核验的发布 limiter 轮廓，区域填充已关闭，仅显示线框。', 'wireframe', primaryXPointIndex, indexedLegs.map(({ index }) => index));
  }
  const segments = strikeIndices.map((index) => strikePoints[Number(index)].wallSegment);
  if (segments.some((segment) => !Number.isInteger(segment) || Number(segment) < 0 || Number(segment) >= wall.length)) {
    return fallback('limiter-intersection', 'limiter 交点缺少有效 wallSegment，区域填充已关闭，仅显示线框。', 'wireframe', primaryXPointIndex, indexedLegs.map(({ index }) => index));
  }
  if (reviewedStrikes.some((point, index) => pointSegmentDistance(
    point!,
    wall[Number(segments[index])],
    wall[(Number(segments[index]) + 1) % wall.length],
  ) > POINT_TOLERANCE_M)) {
    return fallback('limiter-intersection', '交点不位于其声明的发布 limiter 线段上，区域填充已关闭，仅显示线框。', 'wireframe', primaryXPointIndex, indexedLegs.map(({ index }) => index));
  }

  const firstStrike = reviewedStrikes[0]!;
  const secondStrike = reviewedStrikes[1]!;
  const forward = forwardLimiterArc(wall, firstStrike, Number(segments[0]), secondStrike, Number(segments[1]));
  const reverseFromSecond = forwardLimiterArc(wall, secondStrike, Number(segments[1]), firstStrike, Number(segments[0]));
  const arcs = [forward, reverseFromSecond ? [...reverseFromSecond].reverse() : null]
    .filter((arc): arc is DivertorRzPoint[] => Boolean(arc && arc.length >= 2));
  const axis = magneticAxis ? finitePoint(magneticAxis.rM, magneticAxis.zM) : null;
  const candidates: Candidate[] = arcs.flatMap((limiterArc) => {
    const polygon = joinBoundary(reviewedLegs[0], limiterArc, reviewedLegs[1]);
    return isSimplePolygon(polygon) && (!axis || !containsPoint(polygon, axis))
      ? [{ polygon, limiterArc }]
      : [];
  });
  if (candidates.length !== 1) {
    return fallback(
      candidates.length > 1 ? 'ambiguous-limiter-arc' : 'invalid-closed-boundary',
      candidates.length > 1
        ? '两条 limiter 弧均可闭合，无法唯一判定边界；区域填充已关闭，仅显示线框。'
        : '两条分离支与发布 limiter 弧无法形成简单、有限且不包围磁轴的闭合区域；仅显示线框。',
      'wireframe',
      primaryXPointIndex,
      indexedLegs.map(({ index }) => index),
    );
  }

  return {
    state: 'filled',
    code: 'closed-reviewed-boundary',
    message: '橙色区域由主 X 点、两条已审查分离支及其间发布 limiter 弧闭合构成。',
    polygon: candidates[0].polygon,
    limiterArc: candidates[0].limiterArc,
    primaryXPointIndex,
    legIndices: indexedLegs.map(({ index }) => index),
  };
}

/**
 * Closes a display-only divertor polygon from topology-graph v2 evidence.
 *
 * The graph publisher deliberately keeps the open-field face classification
 * unresolved. The renderer may nevertheless shade the bounded visual region
 * when, and only when, one active primary boundary X point has exactly two
 * published open branches to distinct wall nodes and exactly one published
 * wall arc closes a simple polygon that excludes the magnetic axis. No chord,
 * extrapolated arm, topology label or SOL field is invented here.
 */
export function deriveVerifiedDivertorGraphRegion(
  graph: DivertorRegionGraphInput | null | undefined,
  magneticAxis?: { rM: number; zM: number } | null,
): DivertorRegionResult {
  if (!graph) {
    return fallback('no-divertor-topology', '当前帧没有可核验的拓扑图边界。', 'unavailable');
  }

  const nodes = graph.nodes ?? [];
  const primaryNodes = nodes.filter((node) => node.kind === 'x-point'
    && node.role === 'boundary'
    && node.activityRole === 'primary'
    && node.activeBranchEligible === true
    && node.evidenceOnly === false
    && typeof node.nodeId === 'string');
  if (primaryNodes.length !== 1) {
    return fallback('primary-x-point', '拓扑图无法唯一确认活动主 X 点，区域填充已关闭，仅显示线框。');
  }
  const primary = primaryNodes[0];
  const primaryId = primary.nodeId!;
  const primaryPoint = finitePoint(primary.rM, primary.zM);
  if (!primaryPoint) {
    return fallback('primary-x-point', '拓扑图主 X 点坐标无效，区域填充已关闭，仅显示线框。');
  }
  if ((graph.unresolvedArms ?? []).some((arm) => arm.xPointNodeId === primaryId || arm.extrapolated === true)) {
    return fallback('partial-topology', '活动主 X 点仍有未解析或外推分离臂，区域填充已关闭，仅显示线框。');
  }

  const wallNodes = new Map(nodes.flatMap((node) => (
    node.kind === 'wall-intersection' && typeof node.nodeId === 'string'
      ? [[node.nodeId, node] as const]
      : []
  )));
  const openEdges = (graph.edges ?? []).flatMap((edge) => {
    if (edge.kind !== 'constant-flux-separatrix-branch'
      || edge.status !== 'active-derived'
      || edge.closed !== false
      || typeof edge.edgeId !== 'string') return [];
    const primaryAtStart = edge.fromNodeId === primaryId;
    const primaryAtEnd = edge.toNodeId === primaryId;
    if (primaryAtStart === primaryAtEnd) return [];
    const wallNodeId = primaryAtStart ? edge.toNodeId : edge.fromNodeId;
    if (typeof wallNodeId !== 'string') return [];
    const wallNode = wallNodes.get(wallNodeId);
    const wallPoint = wallNode ? finitePoint(wallNode.rM, wallNode.zM) : null;
    const rawPoints = curvePoints(edge);
    if (!wallPoint || !rawPoints || rawPoints.length < 2) return [];
    const points = primaryAtStart ? rawPoints : [...rawPoints].reverse();
    if (distance(points[0], primaryPoint) > POINT_TOLERANCE_M
      || distance(points.at(-1)!, wallPoint) > POINT_TOLERANCE_M) return [];
    return [{ edge, edgeId: edge.edgeId, wallNodeId, wallPoint, points }];
  });
  if (openEdges.length !== 2
    || openEdges[0].edgeId === openEdges[1].edgeId
    || openEdges[0].wallNodeId === openEdges[1].wallNodeId
    || !Number.isInteger(openEdges[0].edge.sourceArmIndex)
    || !Number.isInteger(openEdges[1].edge.sourceArmIndex)
    || openEdges[0].edge.sourceArmIndex === openEdges[1].edge.sourceArmIndex) {
    return fallback('separatrix-leg-count', '活动主 X 点未关联恰好两条到不同壁面交点的开放分离支，区域填充已关闭，仅显示线框。');
  }

  const evidenceRegions = (graph.unresolvedRegions ?? []).filter((region) => region.kind === 'open-field-separatrix-region'
    && region.state === 'unresolved'
    && region.fabricated === false
    && openEdges.every(({ edgeId }) => region.edgeIds?.includes(edgeId)));
  if (evidenceRegions.length !== 1) {
    return fallback('partial-topology', '拓扑图未发布唯一且与开放分离支一致的非虚构区域证据，区域填充已关闭，仅显示线框。');
  }
  const evidenceRegion = evidenceRegions[0];

  const axis = magneticAxis ? finitePoint(magneticAxis.rM, magneticAxis.zM) : null;
  if (!axis) {
    return fallback('ambiguous-limiter-arc', '缺少磁轴坐标，无法唯一排除包围等离子体的壁面弧；区域填充已关闭，仅显示线框。');
  }

  const fromWall = openEdges[0];
  const toWall = openEdges[1];
  const candidates: Candidate[] = (graph.wallArcs ?? []).flatMap((arc) => {
    if (typeof arc.wallArcId !== 'string' || !evidenceRegion.wallArcIds?.includes(arc.wallArcId)) return [];
    const forward = arc.fromNodeId === fromWall.wallNodeId && arc.toNodeId === toWall.wallNodeId;
    const reverse = arc.fromNodeId === toWall.wallNodeId && arc.toNodeId === fromWall.wallNodeId;
    if (!forward && !reverse) return [];
    const rawArc = curvePoints(arc);
    if (!rawArc || rawArc.length < 2) return [];
    const limiterArc = forward ? rawArc : [...rawArc].reverse();
    if (distance(limiterArc[0], fromWall.wallPoint) > POINT_TOLERANCE_M
      || distance(limiterArc.at(-1)!, toWall.wallPoint) > POINT_TOLERANCE_M) return [];
    const polygon = joinBoundary(fromWall.points, limiterArc, toWall.points);
    return isSimplePolygon(polygon) && !containsPoint(polygon, axis)
      ? [{ polygon, limiterArc }]
      : [];
  });
  if (candidates.length !== 1) {
    return fallback(
      candidates.length > 1 ? 'ambiguous-limiter-arc' : 'invalid-closed-boundary',
      candidates.length > 1
        ? '多条发布壁面弧均可闭合，无法唯一判定显示边界；区域填充已关闭，仅显示线框。'
        : '发布的开放分离支与壁面弧无法形成简单、有限且不包围磁轴的闭合显示边界；仅显示线框。',
    );
  }

  return {
    state: 'filled',
    code: 'closed-published-graph-boundary',
    message: '橙色区域由 v2 活动主 X 点、两条已发布开放分离支和唯一壁面弧通过显示闭合核验构成；不代表 SOL 场量。',
    polygon: candidates[0].polygon,
    limiterArc: candidates[0].limiterArc,
    legIndices: openEdges.map(({ edge }) => Number(edge.sourceArmIndex)).filter(Number.isInteger),
  };
}
