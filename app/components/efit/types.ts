export type EfitShotId = number;

export type EfitQualityState = 'good' | 'warning' | 'invalid' | 'missing';

export type EfitNumericVector = Float32Array | readonly number[];

export type EfitQuality = {
  flags: number;
  state: EfitQualityState;
  messages: readonly string[];
};

export type EfitRzPolyline = {
  rM: EfitNumericVector;
  zM: EfitNumericVector;
  validPoints: number;
};

export type EfitContour = EfitRzPolyline & {
  psiN: number;
  kind: 'surface' | 'lcfs';
  closed: boolean;
};

export type EfitTopologyKind =
  | 'limited'
  | 'upper-single-null'
  | 'lower-single-null'
  | 'double-null'
  | 'near-double-null'
  | 'partial'
  | 'unknown';

export type EfitXPoint = {
  rM: number;
  zM: number;
  psiN: number;
  gradientResidual: number;
  role?: 'primary' | 'secondary';
  /** Backward-compatible alias for early topology derivatives. */
  primary?: boolean;
};

export type EfitStrikePoint = {
  rM: number;
  zM: number;
  wallSegment: number;
};

export type EfitSeparatrixLeg = EfitRzPolyline & {
  xPointIndex: number;
  strikePointIndex: number;
  closed: false;
};

export type EfitTopology = {
  kind: EfitTopologyKind;
  flags: number;
  xPoints: readonly EfitXPoint[];
  strikePoints: readonly EfitStrikePoint[];
  separatrixLegs: readonly EfitSeparatrixLeg[];
};

/** Hard safety ceilings for the variable-length v2 topology graph runtime. */
export const EFIT_TOPOLOGY_GRAPH_LIMITS = Object.freeze({
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

export type EfitGraphEvidence = {
  source: string;
  state: string;
  confidence: string;
  flags: readonly string[];
  reason?: string;
};

export type EfitTopologyGraphMagneticAxisNode = {
  nodeId: string;
  kind: 'magnetic-axis';
  rM: number;
  zM: number;
  evidence?: EfitGraphEvidence;
};

export type EfitTopologyGraphXPointNode = {
  nodeId: string;
  kind: 'x-point';
  role: 'boundary' | 'near-boundary';
  activityRole: 'primary' | 'secondary';
  activeBranchEligible: boolean;
  evidenceOnly: boolean;
  evidence: EfitGraphEvidence;
  rM: number;
  zM: number;
  psiN: number;
  absPsiNMinusOne: number;
  gradientResidual: number;
  fitRms: number;
  lcfsDistanceM: number;
  hessianEigenvaluesPerM2: readonly [number, number];
  positionUncertaintyM: number;
};

export type EfitTopologyGraphWallNode = {
  nodeId: string;
  kind: 'wall-intersection';
  geometryId: string;
  wallSegment: number;
  wallSegmentFraction: number;
  wallSNormalized: number;
  rM: number;
  zM: number;
  positionUncertaintyM: number;
  evidence?: EfitGraphEvidence;
};

export type EfitTopologyGraphNode = EfitTopologyGraphMagneticAxisNode
  | EfitTopologyGraphXPointNode
  | EfitTopologyGraphWallNode;

export type EfitTopologyGraphEdge = {
  edgeId: string;
  kind: 'constant-flux-separatrix-branch';
  status: 'active-derived';
  sourceArmIndex: number;
  fromNodeId: string;
  toNodeId: string;
  psiN: number;
  closed: boolean;
  arcLengthM: number;
  directDistanceM: number;
  extensionRatio: number | null;
  maxPsiNResidual: number;
  pointsRzM: EfitNumericVector;
};

export type EfitTopologyGraphWallArc = {
  wallArcId: string;
  geometryId: string;
  fromNodeId: string;
  toNodeId: string;
  direction: 'canonical-forward';
  wrapsCanonicalStart: boolean;
  startSNormalized: number;
  endSNormalized: number;
  arcLengthM: number;
  pointsRzM: EfitNumericVector;
};

export type EfitTopologyGraphUnresolvedArm = {
  unresolvedArmId: string;
  xPointNodeId: string;
  armIndex: number;
  state: 'unresolved';
  reason: string;
  extrapolated: false;
};

export type EfitTopologyGraphRegion = {
  regionId: string;
  kind: 'closed-flux-region';
  state: 'derived';
  psiN: number;
  containsMagneticAxis: boolean;
  areaM2: number;
  boundary: readonly {
    order: number;
    referenceKind: 'closed-surface';
    referenceId: string;
    direction: 'counter-clockwise';
  }[];
  evidence: EfitGraphEvidence;
};

export type EfitTopologyGraphUnresolvedRegion = {
  unresolvedRegionId: string;
  kind: 'open-field-separatrix-region';
  state: 'unresolved';
  reason: string;
  edgeIds: readonly string[];
  wallArcIds: readonly string[];
  fabricated: false;
};

export type EfitTopologyGraphFeatures = {
  xPointCount: number;
  activeXPointCount: number;
  candidateXPointCount: number;
  boundaryXPointCount: number;
  nearBoundaryXPointCount: number;
  wallIntersectionCount: number;
  resolvedBranchCount: number;
  unresolvedArmCount: number;
  nullClusters: readonly {
    nodeIds: readonly [string, string];
    distanceM: number;
    deltaPsiN: number;
    interpretation: 'multi-null-cluster-candidate';
  }[];
  extendedLegCandidateEdgeIds: readonly string[];
};

export type EfitTopologyGraph = {
  canonicalRepresentation: {
    kind: 'node-edge-region-topology-graph';
    schemaVersion: 'fusion.efit.topology-graph.v2';
    coordinateSpace: string;
    geometryId: string;
  };
  nodes: readonly EfitTopologyGraphNode[];
  edges: readonly EfitTopologyGraphEdge[];
  wallArcs: readonly EfitTopologyGraphWallArc[];
  regions: readonly EfitTopologyGraphRegion[];
  unresolvedArms: readonly EfitTopologyGraphUnresolvedArm[];
  unresolvedRegions: readonly EfitTopologyGraphUnresolvedRegion[];
  features: EfitTopologyGraphFeatures;
};

export type EfitClosedFluxSurface = {
  surfaceId: string;
  source: 'derived-contour' | 'g-eqdsk-boundary-polyline';
  psiN: number;
  closed: true;
  containsMagneticAxis: boolean;
  areaM2: number;
  pointsRzM: EfitNumericVector;
  evidence: EfitGraphEvidence;
};

export type EfitFrameSummary = {
  shot: EfitShotId;
  index: number;
  timeMs: number;
  quality: EfitQuality;
  /** Exact v2 publisher evidence retained for chunk-versus-index binding. */
  qualityValidity?: 'unavailable' | 'partial' | 'usable';
  qualityFlags?: readonly string[];
  currentA: number;
  rAxisM: number;
  zAxisM: number;
  bcentrT: number;
  psiAxisWbPerRad: number;
  psiBoundaryWbPerRad: number;
  q95?: number;
  efitError?: number;
  iconvr?: number;
  /** Extrema of the published, resampled LCFS polyline; null when no LCFS is published. */
  lcfsRMinM?: number | null;
  lcfsRMaxM?: number | null;
  surfaceMask: number;
  lcfsValidPoints: number;
  offsetBytes: number;
  topologyKind?: EfitTopologyKind;
  topologyFlags?: number;
  xPointCount?: number;
  strikePointCount?: number;
  separatrixLegCount?: number;
};

export type EfitFrame = EfitFrameSummary & {
  contours: readonly EfitContour[];
  /** Optional reviewed divertor-topology derivative; absent in the v1 contour package. */
  topology?: EfitTopology;
  /** Exact reviewed v2 graph payload used by variable-topology 2D/3D renderers. */
  topologyGraphPayload?: EfitTopologyGraphFramePayload;
};

export type EfitTopologyGraphFramePayload = {
  frameId: string;
  shotId: string;
  reconstructionId: string;
  timeMs: number;
  geometryId: string;
  quality: {
    validity: 'unavailable' | 'partial' | 'usable';
    flags: readonly string[];
    positionUncertaintyFloorM: number;
    sourceGrid: {
      nr: number;
      nz: number;
      rMinM: number;
      rMaxM: number;
      zMinM: number;
      zMaxM: number;
    };
    algorithmVersion: string;
  };
  scalars: {
    currentA: number;
    rAxisM: number;
    zAxisM: number;
    bcentrT: number;
    psiAxisWbPerRad: number;
    psiBoundaryWbPerRad: number;
    q95: number | null;
    efitError: number | null;
    iconvr: number | null;
  };
  closedFluxSurfaces: readonly EfitClosedFluxSurface[];
  topologyGraph: EfitTopologyGraph;
};

export type EfitGap = {
  afterMs: number;
  beforeMs: number;
  missingCount?: number;
  reason?: string;
};

export type EfitBinaryDescriptor = {
  url: string;
  byteLength?: number;
  sha256?: string;
  fileHeaderBytes: number;
  frameHeaderBytes: number;
  frameStrideBytes: number;
  surfaceCount: number;
  pointsPerContour: number;
};

export type EfitTopologyBinaryDescriptor = {
  url: string;
  byteLength: number;
  sha256: string;
  baseBinarySha256: string;
  baseSha256PrefixHex: string;
  fileHeaderBytes: 64;
  frameHeaderBytes: 160;
  frameStrideBytes: 2208;
  maxSeparatrixLegs: 4;
  pointsPerLeg: 64;
  maxXPoints: 2;
  maxStrikePoints: 4;
};

export type EfitTopologyGraphChunkDescriptor = {
  chunkIndex: number;
  frameStart: number;
  frameCount: number;
  timeRangeMs: readonly [number, number];
  availableTimesMs: readonly number[];
  url: string;
  contentType: 'application/gzip';
  uncompressedContentType: 'application/x-ndjson';
  compression: 'gzip-mtime-zero';
  httpContentEncoding: 'identity';
  byteLength: number;
  sha256: string;
};

export type EfitTopologyGraphShotDescriptor = {
  shotId: string;
  reconstructionId: string;
  chunks: readonly EfitTopologyGraphChunkDescriptor[];
};

export type EfitShotManifest = {
  shot: EfitShotId;
  sourceKind?: 'legacy-contours-v1' | 'topology-graph-v2';
  geometryId?: string;
  catalog?: EfitShotCatalogMetadata;
  frameCount: number;
  minTimeMs: number;
  maxTimeMs: number;
  gaps: readonly EfitGap[];
  frames: readonly EfitFrameSummary[];
  binary?: EfitBinaryDescriptor;
  topologyBinary?: EfitTopologyBinaryDescriptor;
  topologyGraph?: EfitTopologyGraphShotDescriptor;
};

export type EfitCadRegistration = {
  description?: string;
  coordinateSystem?: string;
  [key: string]: unknown;
};

export type EfitShotCatalogMetadata = {
  datasetId?: string;
  datasetLabel?: string;
  reconstructionLabel?: string;
  qualityLabel?: string;
  qualityState?: EfitQualityState;
};

export type EfitGeometry = {
  geometryId?: string;
  limiterRzM: EfitRzPolyline;
  closed?: boolean;
  canonicalSegmentCount?: number;
  canonicalSha256F64LE?: string;
  canonicalPointCount?: number;
  sourceLimiterSha256F64LE?: string;
  sourcePointCount?: number;
  orientation?: 'counter-clockwise' | 'clockwise';
  startPointRule?: string;
  gridExtentM?: readonly [number, number, number, number];
  coordinateSystem?: string;
  cadRegistration?: EfitCadRegistration;
};

export type EfitNumericQuantizationContract = {
  fractionDigits: 8;
  roundingMode: 'ROUND_HALF_EVEN';
  negativeZeroNormalized: true;
  maxAbsoluteErrorPerValue: 5e-9;
};

export type EfitManifest = {
  schema: string;
  device: string;
  generatedAt?: string;
  psiNLevels: readonly number[];
  /** Legacy/default geometry. Per-shot geometryId takes precedence when set. */
  geometry: EfitGeometry;
  geometries?: readonly EfitGeometry[];
  /** Present only on graph-v2 catalogs; legacy geometry identity is explicitly excluded. */
  numericQuantization?: EfitNumericQuantizationContract;
  shots: readonly EfitShotManifest[];
};

export type EfitDataRequest = {
  signal?: AbortSignal;
};

/**
 * The UI and Three.js overlay depend on this interface, never on the binary
 * representation. Alternative MDSplus, WebSocket or object-storage adapters
 * can therefore be injected without changing playback or rendering code.
 */
export interface EfitDataSource {
  loadManifest(request?: EfitDataRequest): Promise<EfitManifest>;
  loadTimeline(shot: EfitShotId, request?: EfitDataRequest): Promise<readonly EfitFrameSummary[]>;
  loadFrame(shot: EfitShotId, frameIndex: number, request?: EfitDataRequest): Promise<EfitFrame>;
  prefetchFrame?(shot: EfitShotId, frameIndex: number): void;
}
