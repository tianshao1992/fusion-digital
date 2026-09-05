export type DevicePartCategory = 'plasma' | 'tf' | 'pf' | 'layer' | 'structure';

export const MAX_COMPONENT_BUNDLE_DECODED_BYTES = 512 * 1024 * 1024;
export const MAX_COMPONENT_SHARD_MESH_INSTANCES = 300;
export const MAX_COMPONENT_BUNDLE_MESH_INSTANCES = 1_000;
export const ITER_COMPONENT_BUNDLE_FORMAT = 'glTF 2.0 binary + EXT_meshopt_compression + KHR_mesh_quantization; POSITION normalized Int16 per mesh; NORMAL normalized Int8 (8-bit)';
const ITER_COMPONENT_ASSET_PATH = /^\/device-assets\/iter-high-detail\/v1\/([a-z0-9-]+)\.([a-f0-9]{64})\.high\.meshopt\.glb$/;
export const EXL50U_GA_MANIFEST_ID = 'exl50u-general-assembly-v1';
export const EXL50U_GA_VISUALIZATION_ROOT = 'EXL50U_GA_VISUALIZATION';
export const EXL50U_ANONYMOUS_SHARD_COUNT = 20;
export const MAX_ANONYMOUS_PREVIEW_BYTES = 12 * 1024 * 1024;
export const MAX_ANONYMOUS_PREVIEW_DECODED_BYTES = 192 * 1024 * 1024;
export const MAX_ANONYMOUS_SHARD_BYTES = 24 * 1024 * 1024;
export const MAX_ANONYMOUS_DELIVERY_BYTES = 300 * 1024 * 1024;
export const MAX_ANONYMOUS_SHARD_DECODED_BYTES = 96 * 1024 * 1024;
export const MAX_ANONYMOUS_BUNDLE_DECODED_BYTES = 1_536 * 1024 * 1024;
export const MAX_ANONYMOUS_SHARD_PLACEMENT_INSTANCES = 250_000;
export const MAX_ANONYMOUS_BUNDLE_PLACEMENT_INSTANCES = (
  EXL50U_ANONYMOUS_SHARD_COUNT * MAX_ANONYMOUS_SHARD_PLACEMENT_INSTANCES
);
export const MAX_ANONYMOUS_SCENE_TRIANGLES = 30_000_000;
export const MAX_ANONYMOUS_DRAW_CALLS = 800;
export const ANONYMOUS_SHARD_BUNDLE_FORMAT = 'glTF 2.0 binary + EXT_meshopt_compression + EXT_mesh_gpu_instancing; POSITION Float32; NORMAL normalized Int8 (8-bit); indices Uint16/Uint32';
export const ANONYMOUS_SHARD_REQUIRED_EXTENSIONS = ['EXT_mesh_gpu_instancing', 'EXT_meshopt_compression'] as const;
const EXL50U_ANONYMOUS_SHARD_PATH = /^\/device-assets\/exl50u-general-assembly\/v1\/anonymous-shard-(\d{2})\.([a-f0-9]{64})\.high\.meshopt\.glb$/;
const EXL50U_PREVIEW_ASSET_PATH = /^\/device-assets\/exl50u-general-assembly\/v1\/device\.preview\.([a-f0-9]{64})\.meshopt\.glb$/;

export type DeviceManifestPart = {
  id: string;
  title: string;
  nodeName: string;
  description: string;
  engineeringTag: string;
};

export type DeviceManifestSystem = {
  id: string;
  title: string;
  shortTitle: string;
  category: DevicePartCategory;
  color: string;
  description: string;
  parts: DeviceManifestPart[];
};

export type DeviceWebModel = {
  path: string;
  format: string;
  sha256: string;
  bytes: number;
  triangles?: number;
  vertices?: number;
  decodedGpuBytes?: number;
  boundsMetres?: {
    min: [number, number, number];
    max: [number, number, number];
  };
};

export type DeviceWebModelVariant = DeviceWebModel & {
  id: string;
  label: string;
  quality: 'preview' | 'high';
  default?: boolean;
};

export type DeviceComponentModel = DeviceWebModel & {
  partId: string;
  nodeName: string;
  sceneDrawTriangles: number;
  sceneDrawVertices: number;
  meshInstances: number;
};

export type DeviceComponentBundle = {
  id: string;
  label: string;
  quality: 'high';
  delivery: 'components';
  format: string;
  bytes: number;
  triangles: number;
  vertices: number;
  sceneDrawTriangles: number;
  sceneDrawVertices: number;
  meshInstances: number;
  decodedGpuBytes: number;
  boundsMetres: NonNullable<DeviceWebModel['boundsMetres']>;
  components: DeviceComponentModel[];
};

export type DeviceAnonymousShardModel = {
  id: string;
  index: number;
  path: string;
  sha256: string;
  bytes: number;
  uniqueGeometryMeshes: number;
  uniqueGeometryTriangles: number;
  uniqueGeometryVertices: number;
  placementInstances: number;
  drawCalls: number;
  sceneDrawTriangles: number;
  decodedGpuBytes: number;
  boundsMetres: NonNullable<DeviceWebModel['boundsMetres']>;
};

export type DeviceAnonymousShardBundle = {
  id: string;
  label: string;
  quality: 'high';
  delivery: 'shards';
  format: typeof ANONYMOUS_SHARD_BUNDLE_FORMAT;
  rootNodeName: typeof EXL50U_GA_VISUALIZATION_ROOT;
  extensionsRequired: [...typeof ANONYMOUS_SHARD_REQUIRED_EXTENSIONS];
  grouping: {
    kind: 'anonymous-transport';
    engineeringSemantic: false;
    engineeringUseAllowed: false;
    representsBom: false;
    representsEngineeringSystems: false;
    representsAssemblyTree: false;
  };
  bytes: number;
  uniqueGeometryMeshes: number;
  uniqueGeometryTriangles: number;
  uniqueGeometryVertices: number;
  placementInstances: number;
  drawCalls: number;
  sceneDrawTriangles: number;
  decodedGpuBytes: number;
  boundsMetres: NonNullable<DeviceWebModel['boundsMetres']>;
  shards: DeviceAnonymousShardModel[];
};

type DeviceAnonymousOutputCleaning = {
  policy: 'stable-repeated-zero-duplicate-edge-incidence-clean-v1';
  selectedTrianglesBeforeCleaning: number;
  finalTriangles: number;
  removedRepeatedIndexTriangles: number;
  removedZeroAreaTriangles: number;
  removedDuplicateTriangles: number;
  removedNonmanifoldTriangles: number;
  repairedDefinitions: number;
  finalRepeatedIndexTriangles: 0;
  finalZeroAreaTriangles: 0;
  finalDuplicateTriangles: 0;
  finalNonmanifoldEdgeCount: 0;
};

type DeviceAnonymousLodEvidence = {
  selectedTargetTriangleRatio: number;
  simplifierNormalizedErrorLimit: number;
  maxAcceptedSimplifierReportedNormalizedError: number;
  minimumTrianglesPerDefinition: number;
  definitionsUsingMinimum: number;
  minimumCoverage: 'stable-source-order-minimum-plus-six-axis-extrema-v1';
  extremaCoverage: 'six-axis-first-valid-nondegenerate-incident-triangle-v1';
  retainedSourcePositionValuesUnchanged: true;
  allDefinitionsNonempty: true;
  boundsMissCount: 0;
  receiptCount: number;
  receiptSha256: string;
  outputCleaning: DeviceAnonymousOutputCleaning;
};

export type DeviceAnonymousDerivationEvidence = {
  kind: 'anonymous-public-derivative';
  selectedAttempt: 1 | 2;
  sourceInputCleaning: {
    policy: 'repeated-index-and-exact-zero-area-drop-stable-vertex-remap-v1';
    definitionInputs: number;
    sourceFaces: number;
    sourceTriangles: number;
    sanitizedTriangles: number;
    removedTriangles: number;
    affectedDefinitions: number;
    removedUnreferencedVertices: number;
    allDefinitionsAccounted: true;
    allSourceFacesAccounted: true;
  };
  previewVisualLod: DeviceAnonymousLodEvidence & {
    algorithm: 'meshoptimizer-simplify-sloppy';
    visualQa: {
      status?: 'USER_VISUAL_REVIEW_REQUIRED';
      policy: 'canonical-10-view-silhouette-depth-1024-v1';
      viewCount: 10;
      silhouetteIouFloor: 0.97;
      minimumObservedSilhouetteIou: number;
      normalizedDepthP99Ceiling: 0.02;
      maximumObservedNormalizedDepthP99: number;
      receiptSha256: string;
    };
  };
  highQem: DeviceAnonymousLodEvidence & {
    algorithm: 'meshoptimizer-simplify-qem';
    targetMissCount: number;
    retainedIrreducibleCount: number;
  };
  highPartition: {
    policy: 'stable-definition-triangle-chunks-v1';
    geometryChunkCount: number;
    splitDefinitionCount: number;
    finalTrianglesBeforePartition: number;
    partitionedTriangles: number;
    missingTriangles: 0;
    duplicateTriangles: 0;
    missingOccurrences: 0;
    receiptSha256: string;
  };
  coverage: {
    renderableDefinitions: number;
    renderableOccurrences: number;
    skippedDefinitions: number;
    skippedOccurrences: number;
    sourceDefinitions: number;
    sourceOccurrences: number;
    previewMissingDefinitions: 0;
    previewMissingOccurrences: 0;
    highMissingDefinitions: 0;
    highMissingOccurrences: 0;
  };
};

export type AnalyticPlasmaVisualization = {
  kind: 'analytic-design-proxy';
  label: string;
  sourceLabel: string;
  sourceUrl: string;
  majorRadiusMetres: number;
  minorRadiusMetres: number;
  kappa95: number;
  delta95: number;
  kappaSeparatrixReference: number;
  deltaSeparatrixReference: number;
  nominalPlasmaCurrentMA: number;
  toroidalFieldAtMajorRadiusT: number;
  q95: number;
  nominalVolumeCubicMetres: number;
  topologyReference: 'single-null';
  geometryOnly: true;
  hasPsiGrid: false;
  hasXPoint: false;
  hasDiagnostics: false;
  isEfit: false;
};

export type DeviceManifest = {
  $schema?: string;
  schemaVersion: string;
  id: string;
  title: string;
  asOf: string;
  devicePackage: {
    kind: 'public-demonstrator' | 'public-simplified-derivative' | 'controlled-engineering';
    deviceClass: string;
    authority: 'illustrative' | 'engineering-reference' | 'authoritative';
    replacementContract: string[];
  };
  access: {
    classification: 'PUBLIC' | 'INTERNAL' | 'CONTROLLED' | 'RESTRICTED';
    redistributionAllowed: boolean;
    engineeringUseAllowed: boolean;
    statement: string;
  };
  coordinateSystem: {
    linearUnit: string;
    upAxis: 'X' | 'Y' | 'Z';
    handedness: 'right' | 'left';
    sourceToWebScale: number;
  };
  assets: {
    webModel?: DeviceWebModel;
    webModels?: DeviceWebModelVariant[];
    componentBundles?: DeviceComponentBundle[];
    shardBundles?: DeviceAnonymousShardBundle[];
    sourceCad?: { path: string; format: string; sha256: string; bytes: number };
    poster?: { path: string; sha256: string; bytes: number };
  };
  visualizations?: {
    analyticPlasma?: AnalyticPlasmaVisualization;
  };
  derivationEvidence?: DeviceAnonymousDerivationEvidence;
  reviewCandidate?: {
    status: 'USER_VISUAL_REVIEW_REQUIRED';
    productionEligible: false;
  };
  systems: DeviceManifestSystem[];
  generator: {
    name: string;
    version: string;
    repository: string;
    license: string;
    licenseUrl: string;
    paper?: string;
    script?: { path: string; sha256: string };
    environment?: { python: string; cadquery: string; cadqueryOcp: string };
    conversion?: {
      pipeline: string;
      converter: string;
      converterVersion: string;
      linearToleranceSourceUnits?: number;
      angularToleranceRadians?: number;
      highLodAbsoluteDeflectionMillimetres?: number;
      highLodAngularDeflectionRadians?: number;
      highLodSharpEdgeNormals?: boolean;
      normalFeatureAngleDegrees?: number;
      decimation?: string;
      compression?: string;
    };
  };
  disclaimer: string;
};

function isFiniteVector3(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));
}

function isBoundsMetres(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const bounds = value as Record<string, unknown>;
  const minimum = bounds.min;
  const maximum = bounds.max;
  if (!isFiniteVector3(minimum) || !isFiniteVector3(maximum)) return false;
  return minimum.every((coordinate, axis) => coordinate < maximum[axis]);
}

function isSafePublicAssetPath(value: unknown): value is string {
  return typeof value === 'string'
    && (value.startsWith('/models/')
      || value.startsWith('/device-assets/exl50u-interactive/')
      || value.startsWith('/device-assets/exl50u-general-assembly/')
      || value.startsWith('/device-assets/iter-high-detail/'))
    && !value.includes('..')
    && !value.includes('%')
    && !value.includes('//')
    && !/^[a-z]+:/i.test(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const expected = new Set(keys);
  return Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
}

function hasExactRequiredExtensions(value: unknown): value is [...typeof ANONYMOUS_SHARD_REQUIRED_EXTENSIONS] {
  return Array.isArray(value)
    && value.length === ANONYMOUS_SHARD_REQUIRED_EXTENSIONS.length
    && value.every((extension, index) => extension === ANONYMOUS_SHARD_REQUIRED_EXTENSIONS[index]);
}

function validateAnonymousDerivationEvidence(value: unknown, reviewCandidate = false): asserts value is DeviceAnonymousDerivationEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('EXL-50U 总装缺少匿名派生证据。');
  const evidence = value as Record<string, unknown>;
  const sourceInputCleaning = evidence.sourceInputCleaning as Record<string, unknown> | undefined;
  const preview = evidence.previewVisualLod as Record<string, unknown> | undefined;
  const high = evidence.highQem as Record<string, unknown> | undefined;
  const highPartition = evidence.highPartition as Record<string, unknown> | undefined;
  const coverage = evidence.coverage as Record<string, unknown> | undefined;
  const integer = (candidate: unknown, positive = false) => Number.isSafeInteger(candidate)
    && Number(candidate) >= (positive ? 1 : 0);
  const finiteUnit = (candidate: unknown, allowZero = false) => typeof candidate === 'number'
    && Number.isFinite(candidate)
    && candidate >= (allowZero ? 0 : Number.EPSILON)
    && candidate <= 1;
  const digest = (candidate: unknown) => typeof candidate === 'string' && /^[a-f0-9]{64}$/.test(candidate);
  const sourceInputCleaningKeys = [
    'policy', 'definitionInputs', 'sourceFaces', 'sourceTriangles', 'sanitizedTriangles', 'removedTriangles',
    'affectedDefinitions', 'removedUnreferencedVertices', 'allDefinitionsAccounted', 'allSourceFacesAccounted',
  ];
  const lodKeys = [
    'algorithm', 'selectedTargetTriangleRatio', 'simplifierNormalizedErrorLimit',
    'maxAcceptedSimplifierReportedNormalizedError', 'minimumTrianglesPerDefinition',
    'definitionsUsingMinimum', 'minimumCoverage', 'extremaCoverage',
    'retainedSourcePositionValuesUnchanged', 'allDefinitionsNonempty', 'boundsMissCount',
    'receiptCount', 'receiptSha256', 'outputCleaning',
  ];
  const outputCleaningKeys = [
    'policy', 'selectedTrianglesBeforeCleaning', 'finalTriangles', 'removedRepeatedIndexTriangles',
    'removedZeroAreaTriangles', 'removedDuplicateTriangles', 'removedNonmanifoldTriangles',
    'repairedDefinitions', 'finalRepeatedIndexTriangles', 'finalZeroAreaTriangles',
    'finalDuplicateTriangles', 'finalNonmanifoldEdgeCount',
  ];
  const validOutputCleaning = (candidate: unknown) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    const cleaning = candidate as Record<string, unknown>;
    const removed = [
      'removedRepeatedIndexTriangles', 'removedZeroAreaTriangles',
      'removedDuplicateTriangles', 'removedNonmanifoldTriangles',
    ];
    return hasExactKeys(cleaning, outputCleaningKeys)
      && cleaning.policy === 'stable-repeated-zero-duplicate-edge-incidence-clean-v1'
      && integer(cleaning.selectedTrianglesBeforeCleaning, true)
      && integer(cleaning.finalTriangles, true)
      && [...removed, 'repairedDefinitions'].every((key) => integer(cleaning[key]))
      && Number(cleaning.selectedTrianglesBeforeCleaning)
        === Number(cleaning.finalTriangles) + removed.reduce((sum, key) => sum + Number(cleaning[key]), 0)
      && cleaning.finalRepeatedIndexTriangles === 0
      && cleaning.finalZeroAreaTriangles === 0
      && cleaning.finalDuplicateTriangles === 0
      && cleaning.finalNonmanifoldEdgeCount === 0;
  };
  const validLod = (candidate: Record<string, unknown> | undefined) => Boolean(candidate)
    && finiteUnit(candidate?.selectedTargetTriangleRatio)
    && finiteUnit(candidate?.simplifierNormalizedErrorLimit)
    && finiteUnit(candidate?.maxAcceptedSimplifierReportedNormalizedError, true)
    && Number(candidate?.maxAcceptedSimplifierReportedNormalizedError)
      <= Number(candidate?.simplifierNormalizedErrorLimit)
    && integer(candidate?.minimumTrianglesPerDefinition, true)
    && integer(candidate?.definitionsUsingMinimum)
    && candidate?.minimumCoverage === 'stable-source-order-minimum-plus-six-axis-extrema-v1'
    && candidate?.extremaCoverage === 'six-axis-first-valid-nondegenerate-incident-triangle-v1'
    && candidate?.retainedSourcePositionValuesUnchanged === true
    && candidate?.allDefinitionsNonempty === true
    && candidate?.boundsMissCount === 0
    && integer(candidate?.receiptCount, true)
    && digest(candidate?.receiptSha256)
    && validOutputCleaning(candidate?.outputCleaning);
  const previewCleaning = preview?.outputCleaning as Record<string, unknown> | undefined;
  const highCleaning = high?.outputCleaning as Record<string, unknown> | undefined;
  const visualQa = preview?.visualQa as Record<string, unknown> | undefined;
  if (!hasExactKeys(evidence, [
    'kind', 'selectedAttempt', 'sourceInputCleaning', 'previewVisualLod', 'highQem', 'highPartition', 'coverage',
  ])
    || evidence.kind !== 'anonymous-public-derivative'
    || (evidence.selectedAttempt !== 1 && evidence.selectedAttempt !== 2)
    || !sourceInputCleaning || Array.isArray(sourceInputCleaning)
    || !hasExactKeys(sourceInputCleaning, sourceInputCleaningKeys)
    || sourceInputCleaning.policy !== 'repeated-index-and-exact-zero-area-drop-stable-vertex-remap-v1'
    || sourceInputCleaningKeys
      .filter((key) => !['policy', 'allDefinitionsAccounted', 'allSourceFacesAccounted'].includes(key))
      .some((key) => !integer(sourceInputCleaning[key]))
    || ['definitionInputs', 'sourceFaces', 'sourceTriangles', 'sanitizedTriangles']
      .some((key) => !integer(sourceInputCleaning[key], true))
    || sourceInputCleaning.allDefinitionsAccounted !== true
    || sourceInputCleaning.allSourceFacesAccounted !== true
    || Number(sourceInputCleaning.sourceTriangles)
      !== Number(sourceInputCleaning.sanitizedTriangles) + Number(sourceInputCleaning.removedTriangles)
    || !preview || Array.isArray(preview)
    || !hasExactKeys(preview, [...lodKeys, 'visualQa'])
    || preview.algorithm !== 'meshoptimizer-simplify-sloppy'
    || !validLod(preview)
    || preview.selectedTargetTriangleRatio !== 0.05
    || preview.simplifierNormalizedErrorLimit !== 0.02
    || preview.minimumTrianglesPerDefinition !== 12
    || !visualQa || Array.isArray(visualQa)
    || !hasExactKeys(visualQa, [
      'policy', 'viewCount', 'silhouetteIouFloor', 'minimumObservedSilhouetteIou',
      'normalizedDepthP99Ceiling', 'maximumObservedNormalizedDepthP99', 'receiptSha256',
      ...(reviewCandidate ? ['status'] : []),
    ])
    || (reviewCandidate && visualQa.status !== 'USER_VISUAL_REVIEW_REQUIRED')
    || visualQa.policy !== 'canonical-10-view-silhouette-depth-1024-v1'
    || visualQa.viewCount !== 10
    || visualQa.silhouetteIouFloor !== 0.97
    || !finiteUnit(visualQa.minimumObservedSilhouetteIou, true)
    || (!reviewCandidate && Number(visualQa.minimumObservedSilhouetteIou) < Number(visualQa.silhouetteIouFloor))
    || visualQa.normalizedDepthP99Ceiling !== 0.02
    || !finiteUnit(visualQa.maximumObservedNormalizedDepthP99, true)
    || (!reviewCandidate && Number(visualQa.maximumObservedNormalizedDepthP99) > Number(visualQa.normalizedDepthP99Ceiling))
    || (reviewCandidate
      && Number(visualQa.minimumObservedSilhouetteIou) >= Number(visualQa.silhouetteIouFloor)
      && Number(visualQa.maximumObservedNormalizedDepthP99) <= Number(visualQa.normalizedDepthP99Ceiling))
    || !digest(visualQa.receiptSha256)
    || !high || Array.isArray(high)
    || !hasExactKeys(high, [...lodKeys, 'targetMissCount', 'retainedIrreducibleCount'])
    || high.algorithm !== 'meshoptimizer-simplify-qem'
    || !validLod(high)
    || high.selectedTargetTriangleRatio !== (evidence.selectedAttempt === 1 ? 0.6 : 0.55)
    || high.simplifierNormalizedErrorLimit !== 0.0005
    || high.minimumTrianglesPerDefinition !== 12
    || !integer(high.targetMissCount) || !integer(high.retainedIrreducibleCount)
    || high.targetMissCount !== high.retainedIrreducibleCount
    || Number(high.targetMissCount) > Number(high.receiptCount)
    || !highPartition || Array.isArray(highPartition)
    || !hasExactKeys(highPartition, [
      'policy', 'geometryChunkCount', 'splitDefinitionCount', 'finalTrianglesBeforePartition',
      'partitionedTriangles', 'missingTriangles', 'duplicateTriangles', 'missingOccurrences', 'receiptSha256',
    ])
    || highPartition.policy !== 'stable-definition-triangle-chunks-v1'
    || !integer(highPartition.geometryChunkCount, true)
    || !integer(highPartition.splitDefinitionCount)
    || !integer(highPartition.finalTrianglesBeforePartition, true)
    || !integer(highPartition.partitionedTriangles, true)
    || highPartition.missingTriangles !== 0
    || highPartition.duplicateTriangles !== 0
    || highPartition.missingOccurrences !== 0
    || !digest(highPartition.receiptSha256)
    || !coverage || Array.isArray(coverage)
    || !hasExactKeys(coverage, [
      'renderableDefinitions', 'renderableOccurrences', 'skippedDefinitions', 'skippedOccurrences',
      'sourceDefinitions', 'sourceOccurrences', 'previewMissingDefinitions',
      'previewMissingOccurrences', 'highMissingDefinitions', 'highMissingOccurrences',
    ])
    || !integer(coverage.renderableDefinitions, true) || !integer(coverage.renderableOccurrences, true)
    || !integer(coverage.skippedDefinitions) || !integer(coverage.skippedOccurrences)
    || !integer(coverage.sourceDefinitions, true) || !integer(coverage.sourceOccurrences, true)
    || Number(coverage.sourceDefinitions) !== Number(coverage.renderableDefinitions) + Number(coverage.skippedDefinitions)
    || Number(coverage.sourceOccurrences) !== Number(coverage.renderableOccurrences) + Number(coverage.skippedOccurrences)
    || Number(sourceInputCleaning.definitionInputs) !== Number(coverage.renderableDefinitions)
    || Number(sourceInputCleaning.affectedDefinitions) > Number(coverage.renderableDefinitions)
    || Number(preview.receiptCount) !== Number(coverage.renderableDefinitions)
    || Number(high.receiptCount) !== Number(coverage.renderableDefinitions)
    || Number(preview.definitionsUsingMinimum) > Number(coverage.renderableDefinitions)
    || Number(high.definitionsUsingMinimum) > Number(coverage.renderableDefinitions)
    || Number(previewCleaning?.repairedDefinitions) > Number(coverage.renderableDefinitions)
    || Number(highCleaning?.repairedDefinitions) > Number(coverage.renderableDefinitions)
    || Number(previewCleaning?.selectedTrianglesBeforeCleaning) > Number(sourceInputCleaning.sanitizedTriangles)
    || Number(highCleaning?.selectedTrianglesBeforeCleaning) > Number(sourceInputCleaning.sanitizedTriangles)
    || Number(highPartition.splitDefinitionCount) > Number(coverage.renderableDefinitions)
    || Number(highPartition.finalTrianglesBeforePartition) !== Number(highCleaning?.finalTriangles)
    || Number(highPartition.partitionedTriangles) !== Number(highCleaning?.finalTriangles)
    || coverage.previewMissingDefinitions !== 0 || coverage.previewMissingOccurrences !== 0
    || coverage.highMissingDefinitions !== 0 || coverage.highMissingOccurrences !== 0) {
    throw new Error('EXL-50U 总装匿名派生证据的清理、视觉、QEM 或几何覆盖对账无效。');
  }
}

function validateAnonymousShardBundles(
  value: unknown,
  preview: DeviceWebModel,
  reservedViewerChoiceIds: Set<string>,
) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error('EXL-50U 总装匿名分片清单必须且只能声明一个 shardBundles 项。');
  }
  const bundle = value[0] as Record<string, unknown>;
  const bundleKeys = [
    'id', 'label', 'quality', 'delivery', 'format', 'rootNodeName', 'extensionsRequired',
    'grouping', 'bytes', 'uniqueGeometryMeshes', 'uniqueGeometryTriangles',
    'uniqueGeometryVertices', 'placementInstances', 'drawCalls', 'sceneDrawTriangles',
    'decodedGpuBytes', 'boundsMetres', 'shards',
  ] as const;
  const groupingKeys = [
    'kind', 'engineeringSemantic', 'engineeringUseAllowed', 'representsBom',
    'representsEngineeringSystems', 'representsAssemblyTree',
  ] as const;
  const shardKeys = [
    'id', 'index', 'path', 'sha256', 'bytes', 'uniqueGeometryMeshes',
    'uniqueGeometryTriangles', 'uniqueGeometryVertices', 'placementInstances',
    'drawCalls', 'sceneDrawTriangles', 'decodedGpuBytes', 'boundsMetres',
  ] as const;
  const grouping = bundle?.grouping as Record<string, unknown> | undefined;
  const positiveBundleMetrics = [
    'uniqueGeometryMeshes', 'uniqueGeometryTriangles', 'uniqueGeometryVertices',
    'placementInstances', 'drawCalls', 'sceneDrawTriangles', 'decodedGpuBytes',
  ] as const;
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)
    || !hasExactKeys(bundle, bundleKeys)
    || typeof bundle.id !== 'string'
    || !/^[a-z0-9][a-z0-9-]*$/.test(bundle.id)
    || reservedViewerChoiceIds.has(bundle.id)
    || typeof bundle.label !== 'string' || bundle.label.trim() === ''
    || bundle.quality !== 'high'
    || bundle.delivery !== 'shards'
    || bundle.format !== ANONYMOUS_SHARD_BUNDLE_FORMAT
    || bundle.rootNodeName !== EXL50U_GA_VISUALIZATION_ROOT
    || !hasExactRequiredExtensions(bundle.extensionsRequired)
    || !grouping || Array.isArray(grouping) || !hasExactKeys(grouping, groupingKeys)
    || grouping.kind !== 'anonymous-transport'
    || grouping.engineeringSemantic !== false
    || grouping.engineeringUseAllowed !== false
    || grouping.representsBom !== false
    || grouping.representsEngineeringSystems !== false
    || grouping.representsAssemblyTree !== false
    || !Number.isSafeInteger(bundle.bytes) || Number(bundle.bytes) <= 0
    || Number(bundle.bytes) + preview.bytes > MAX_ANONYMOUS_DELIVERY_BYTES
    || positiveBundleMetrics.some((field) => !Number.isSafeInteger(bundle[field]) || Number(bundle[field]) <= 0)
    || Number(bundle.decodedGpuBytes) > MAX_ANONYMOUS_BUNDLE_DECODED_BYTES
    || Number(bundle.placementInstances) > MAX_ANONYMOUS_BUNDLE_PLACEMENT_INSTANCES
    || Number(bundle.sceneDrawTriangles) > MAX_ANONYMOUS_SCENE_TRIANGLES
    || Number(bundle.drawCalls) > MAX_ANONYMOUS_DRAW_CALLS
    || Number(bundle.placementInstances) < Number(bundle.uniqueGeometryMeshes)
    || Number(bundle.drawCalls) < Number(bundle.uniqueGeometryMeshes)
    || Number(bundle.drawCalls) > Number(bundle.placementInstances)
    || Number(bundle.sceneDrawTriangles) < Number(bundle.uniqueGeometryTriangles)
    || !isBoundsMetres(bundle.boundsMetres)
    || !Array.isArray(bundle.shards)
    || bundle.shards.length !== EXL50U_ANONYMOUS_SHARD_COUNT) {
    throw new Error('EXL-50U 总装匿名分片包身份、预算或非工程语义声明无效。');
  }

  const seenIds = new Set<string>();
  const seenPaths = new Set<string>();
  const seenDigests = new Set<string>();
  const totals = Object.fromEntries(positiveBundleMetrics.map((field) => [field, 0])) as Record<typeof positiveBundleMetrics[number], number>;
  let byteTotal = 0;
  const unionMin: [number, number, number] = [Infinity, Infinity, Infinity];
  const unionMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < bundle.shards.length; offset += 1) {
    const shard = bundle.shards[offset] as Record<string, unknown>;
    const expectedIndex = offset + 1;
    const expectedId = `anonymous-shard-${String(expectedIndex).padStart(2, '0')}`;
    const path = typeof shard?.path === 'string' ? shard.path : '';
    const pathMatch = path.match(EXL50U_ANONYMOUS_SHARD_PATH);
    const digest = typeof shard?.sha256 === 'string' ? shard.sha256.toLowerCase() : '';
    if (!shard || typeof shard !== 'object' || Array.isArray(shard)
      || !hasExactKeys(shard, shardKeys)
      || shard.id !== expectedId
      || shard.index !== expectedIndex
      || seenIds.has(expectedId)
      || !pathMatch
      || Number(pathMatch[1]) !== expectedIndex
      || pathMatch[2] !== digest
      || seenPaths.has(path)
      || seenDigests.has(digest)
      || !Number.isSafeInteger(shard.bytes) || Number(shard.bytes) <= 0
      || Number(shard.bytes) >= MAX_ANONYMOUS_SHARD_BYTES
      || positiveBundleMetrics.some((field) => !Number.isSafeInteger(shard[field]) || Number(shard[field]) <= 0)
      || Number(shard.decodedGpuBytes) > MAX_ANONYMOUS_SHARD_DECODED_BYTES
      || Number(shard.placementInstances) > MAX_ANONYMOUS_SHARD_PLACEMENT_INSTANCES
      || Number(shard.sceneDrawTriangles) > MAX_ANONYMOUS_SCENE_TRIANGLES
      || Number(shard.drawCalls) > MAX_ANONYMOUS_DRAW_CALLS
      || Number(shard.placementInstances) < Number(shard.uniqueGeometryMeshes)
      || Number(shard.drawCalls) < Number(shard.uniqueGeometryMeshes)
      || Number(shard.drawCalls) > Number(shard.placementInstances)
      || Number(shard.sceneDrawTriangles) < Number(shard.uniqueGeometryTriangles)
      || !isBoundsMetres(shard.boundsMetres)) {
      throw new Error(`EXL-50U 总装匿名分片 ${expectedId} 的顺序、路径、摘要或预算无效。`);
    }
    seenIds.add(expectedId);
    seenPaths.add(path);
    seenDigests.add(digest);
    byteTotal += Number(shard.bytes);
    for (const field of positiveBundleMetrics) totals[field] += Number(shard[field]);
    const bounds = shard.boundsMetres as NonNullable<DeviceWebModel['boundsMetres']>;
    for (let axis = 0; axis < 3; axis += 1) {
      unionMin[axis] = Math.min(unionMin[axis], bounds.min[axis]);
      unionMax[axis] = Math.max(unionMax[axis], bounds.max[axis]);
    }
  }
  const bundleBounds = bundle.boundsMetres as NonNullable<DeviceWebModel['boundsMetres']>;
  if (byteTotal !== bundle.bytes
    || positiveBundleMetrics.some((field) => totals[field] !== bundle[field])
    || unionMin.some((coordinate, axis) => coordinate !== bundleBounds.min[axis])
    || unionMax.some((coordinate, axis) => coordinate !== bundleBounds.max[axis])) {
    throw new Error('EXL-50U 总装匿名分片包的逐片汇总预算或包围盒不一致。');
  }
}

function validateComponentBundles(
  value: unknown,
  manifestParts: Map<string, string>,
  reservedViewerChoiceIds: Set<string>,
) {
  const manifestPartIds = new Set(manifestParts.keys());
  const manifestNodeNames = new Set(manifestParts.values());
  const bundleKeys = new Set([
    'id', 'label', 'quality', 'delivery', 'format', 'bytes',
    'triangles', 'vertices', 'sceneDrawTriangles', 'sceneDrawVertices', 'meshInstances',
    'decodedGpuBytes', 'boundsMetres', 'components',
  ]);
  const componentKeys = new Set([
    'partId', 'nodeName', 'path', 'format', 'sha256', 'bytes', 'triangles',
    'vertices', 'sceneDrawTriangles', 'sceneDrawVertices', 'meshInstances',
    'decodedGpuBytes', 'boundsMetres',
  ]);
  if (!Array.isArray(value) || value.length === 0) throw new Error('装置清单的 componentBundles 必须是非空数组。');
  const bundleIds = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('装置清单包含无效的分片高清资产。');
    const bundle = candidate as Record<string, unknown>;
    if (Object.keys(bundle).some((key) => !bundleKeys.has(key))
      || typeof bundle.id !== 'string'
      || !/^[a-z0-9][a-z0-9-]*$/.test(bundle.id)
      || bundleIds.has(bundle.id)
      || reservedViewerChoiceIds.has(bundle.id)
      || typeof bundle.label !== 'string'
      || bundle.label.trim() === ''
      || bundle.quality !== 'high'
      || bundle.delivery !== 'components'
      || bundle.format !== ITER_COMPONENT_BUNDLE_FORMAT
      || !Number.isSafeInteger(bundle.bytes) || Number(bundle.bytes) <= 0
      || Number(bundle.bytes) < 80_000_000 || Number(bundle.bytes) > 110_000_000
      || !Number.isSafeInteger(bundle.triangles) || Number(bundle.triangles) <= 0
      || !Number.isSafeInteger(bundle.vertices) || Number(bundle.vertices) <= 0
      || !Number.isSafeInteger(bundle.sceneDrawTriangles) || Number(bundle.sceneDrawTriangles) <= 0
      || !Number.isSafeInteger(bundle.sceneDrawVertices) || Number(bundle.sceneDrawVertices) <= 0
      || !Number.isSafeInteger(bundle.meshInstances) || Number(bundle.meshInstances) <= 0
      || Number(bundle.meshInstances) > MAX_COMPONENT_BUNDLE_MESH_INSTANCES
      || Number(bundle.sceneDrawTriangles) < Number(bundle.triangles)
      || Number(bundle.sceneDrawVertices) < Number(bundle.vertices)
      || !Number.isSafeInteger(bundle.decodedGpuBytes) || Number(bundle.decodedGpuBytes) <= 0
      || Number(bundle.decodedGpuBytes) > MAX_COMPONENT_BUNDLE_DECODED_BYTES
      || !isBoundsMetres(bundle.boundsMetres)
      || !Array.isArray(bundle.components)
      || bundle.components.length !== manifestPartIds.size) {
      throw new Error(`装置清单包含无效或重复的分片高清资产：${String(bundle.id ?? 'unknown')}。`);
    }
    const seenParts = new Set<string>();
    const seenNodes = new Set<string>();
    const seenPaths = new Set<string>();
    const seenDigests = new Set<string>();
    let byteTotal = 0;
    let triangleTotal = 0;
    let vertexTotal = 0;
    let sceneDrawTriangleTotal = 0;
    let sceneDrawVertexTotal = 0;
    let meshInstanceTotal = 0;
    let decodedTotal = 0;
    const unionMin: [number, number, number] = [Infinity, Infinity, Infinity];
    const unionMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const component of bundle.components as unknown[]) {
      if (!component || typeof component !== 'object' || Array.isArray(component) || !isAsset(component)) {
        throw new Error(`分片高清资产 ${bundle.id} 包含无效部件。`);
      }
      const asset = component as Record<string, unknown>;
      const assetPath = typeof asset.path === 'string' ? asset.path : '';
      const pathMatch = assetPath.match(ITER_COMPONENT_ASSET_PATH);
      const assetDigest = typeof asset.sha256 === 'string' ? asset.sha256.toLowerCase() : '';
      const stableSlug = typeof asset.nodeName === 'string' && asset.nodeName.startsWith('ITER_PART__')
        ? asset.nodeName.slice('ITER_PART__'.length)
        : '';
      if (Object.keys(asset).some((key) => !componentKeys.has(key))
        || typeof asset.partId !== 'string'
        || !manifestPartIds.has(asset.partId)
        || seenParts.has(asset.partId)
        || typeof asset.nodeName !== 'string'
        || !manifestNodeNames.has(asset.nodeName)
        || manifestParts.get(asset.partId) !== asset.nodeName
        || seenNodes.has(asset.nodeName)
        || !pathMatch
        || pathMatch[1] !== stableSlug
        || pathMatch[2] !== assetDigest
        || seenDigests.has(assetDigest)
        || seenPaths.has(assetPath)
        || asset.format !== bundle.format
        || typeof asset.format !== 'string'
        || asset.format.trim() === ''
        || Number(asset.bytes) >= 24 * 1024 * 1024
        || !Number.isSafeInteger(asset.triangles)
        || !Number.isSafeInteger(asset.vertices)
        || !Number.isSafeInteger(asset.sceneDrawTriangles)
        || !Number.isSafeInteger(asset.sceneDrawVertices)
        || !Number.isSafeInteger(asset.meshInstances)
        || Number(asset.meshInstances) <= 0
        || Number(asset.meshInstances) > MAX_COMPONENT_SHARD_MESH_INSTANCES
        || Number(asset.sceneDrawTriangles) < Number(asset.triangles)
        || Number(asset.sceneDrawVertices) < Number(asset.vertices)
        || !Number.isSafeInteger(asset.decodedGpuBytes)
        || !isBoundsMetres(asset.boundsMetres)) {
        throw new Error(`分片高清资产 ${bundle.id} 的部件身份、路径或几何预算无效。`);
      }
      seenParts.add(asset.partId);
      seenNodes.add(asset.nodeName);
      seenPaths.add(assetPath);
      seenDigests.add(assetDigest);
      byteTotal += Number(asset.bytes);
      triangleTotal += Number(asset.triangles);
      vertexTotal += Number(asset.vertices);
      sceneDrawTriangleTotal += Number(asset.sceneDrawTriangles);
      sceneDrawVertexTotal += Number(asset.sceneDrawVertices);
      meshInstanceTotal += Number(asset.meshInstances);
      decodedTotal += Number(asset.decodedGpuBytes);
      const bounds = asset.boundsMetres as NonNullable<DeviceWebModel['boundsMetres']>;
      for (let axis = 0; axis < 3; axis += 1) {
        unionMin[axis] = Math.min(unionMin[axis], bounds.min[axis]);
        unionMax[axis] = Math.max(unionMax[axis], bounds.max[axis]);
      }
    }
    const bundleBounds = bundle.boundsMetres as NonNullable<DeviceWebModel['boundsMetres']>;
    if (seenParts.size !== manifestPartIds.size
      || seenNodes.size !== manifestNodeNames.size
      || byteTotal !== bundle.bytes
      || triangleTotal !== bundle.triangles
      || vertexTotal !== bundle.vertices
      || sceneDrawTriangleTotal !== bundle.sceneDrawTriangles
      || sceneDrawVertexTotal !== bundle.sceneDrawVertices
      || meshInstanceTotal !== bundle.meshInstances
      || decodedTotal !== bundle.decodedGpuBytes
      || unionMin.some((coordinate, axis) => coordinate !== bundleBounds.min[axis])
      || unionMax.some((coordinate, axis) => coordinate !== bundleBounds.max[axis])) {
      throw new Error(`分片高清资产 ${bundle.id} 的部件覆盖或汇总预算不一致。`);
    }
    bundleIds.add(bundle.id);
  }
}

function validateAnalyticPlasma(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('解析等离子体位形合同无效。');
  const plasma = value as Record<string, unknown>;
  const positiveFields = [
    'majorRadiusMetres', 'minorRadiusMetres', 'kappa95', 'kappaSeparatrixReference',
    'nominalPlasmaCurrentMA', 'toroidalFieldAtMajorRadiusT', 'q95', 'nominalVolumeCubicMetres',
  ];
  if (plasma.kind !== 'analytic-design-proxy'
    || typeof plasma.label !== 'string' || plasma.label.trim() === ''
    || typeof plasma.sourceLabel !== 'string' || plasma.sourceLabel.trim() === ''
    || typeof plasma.sourceUrl !== 'string' || !plasma.sourceUrl.startsWith('https://')
    || positiveFields.some((field) => typeof plasma[field] !== 'number' || !Number.isFinite(plasma[field]) || Number(plasma[field]) <= 0)
    || typeof plasma.delta95 !== 'number' || Math.abs(plasma.delta95) >= 1
    || typeof plasma.deltaSeparatrixReference !== 'number' || Math.abs(plasma.deltaSeparatrixReference) >= 1
    || plasma.topologyReference !== 'single-null'
    || plasma.geometryOnly !== true
    || plasma.hasPsiGrid !== false
    || plasma.hasXPoint !== false
    || plasma.hasDiagnostics !== false
    || plasma.isEfit !== false) {
    throw new Error('解析等离子体位形缺少科学参数或 fail-closed 声明。');
  }
}

function hasValidOptionalModelMetadata(asset: Record<string, unknown>): boolean {
  return (asset.triangles === undefined || (Number.isSafeInteger(asset.triangles) && Number(asset.triangles) > 0))
    && (asset.vertices === undefined || (Number.isSafeInteger(asset.vertices) && Number(asset.vertices) > 0))
    && (asset.decodedGpuBytes === undefined || (Number.isSafeInteger(asset.decodedGpuBytes) && Number(asset.decodedGpuBytes) > 0))
    && (asset.boundsMetres === undefined || isBoundsMetres(asset.boundsMetres));
}

function isAsset(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Record<string, unknown>;
  return isSafePublicAssetPath(asset.path)
    && typeof asset.format === 'string'
    && typeof asset.sha256 === 'string'
    && /^[a-f0-9]{64}$/i.test(asset.sha256)
    && Number.isInteger(asset.bytes)
    && Number(asset.bytes) > 0
    && hasValidOptionalModelMetadata(asset);
}

function isAssetWithoutFormat(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const asset = value as Record<string, unknown>;
  return isSafePublicAssetPath(asset.path)
    && typeof asset.sha256 === 'string'
    && /^[a-f0-9]{64}$/i.test(asset.sha256)
    && Number.isInteger(asset.bytes)
    && Number(asset.bytes) > 0;
}

function sameAsset(left: DeviceWebModel, right: DeviceWebModel) {
  return left.path === right.path
    && left.format === right.format
    && left.bytes === right.bytes
    && left.sha256.toLowerCase() === right.sha256.toLowerCase();
}

function validateWebModels(value: unknown, compatibilityAsset: DeviceWebModel) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('装置清单的 webModels 必须是非空数组。');
  const ids = new Set<string>();
  let defaultCount = 0;
  const previewAssets: DeviceWebModelVariant[] = [];
  const allowedKeys = new Set([
    'id', 'label', 'quality', 'path', 'format', 'sha256', 'bytes',
    'triangles', 'vertices', 'decodedGpuBytes', 'boundsMetres', 'default',
  ]);

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('装置清单包含无效的 LOD 资产。');
    const record = candidate as Record<string, unknown>;
    if (Object.keys(record).some((key) => !allowedKeys.has(key))
      || !isAsset(record)
      || typeof record.id !== 'string'
      || !/^[a-z0-9][a-z0-9-]*$/.test(record.id)
      || ids.has(record.id)
      || typeof record.label !== 'string'
      || record.label.trim() === ''
      || !['preview', 'high'].includes(String(record.quality))
      || (record.default !== undefined && typeof record.default !== 'boolean')
      || (record.triangles !== undefined && (!Number.isInteger(record.triangles) || Number(record.triangles) <= 0))
      || (record.vertices !== undefined && (!Number.isInteger(record.vertices) || Number(record.vertices) <= 0))
      || (record.decodedGpuBytes !== undefined && (!Number.isSafeInteger(record.decodedGpuBytes) || Number(record.decodedGpuBytes) <= 0))
      || (record.boundsMetres !== undefined && !isBoundsMetres(record.boundsMetres))) {
      throw new Error(`装置清单包含无效或重复的 LOD 资产：${String(record.id ?? 'unknown')}。`);
    }
    const asset = record as unknown as DeviceWebModelVariant;
    ids.add(asset.id);
    if (asset.default === true) defaultCount += 1;
    if (asset.quality === 'preview') previewAssets.push(asset as unknown as DeviceWebModelVariant);
  }

  if (defaultCount > 1) throw new Error('装置清单最多只能指定一个默认 LOD。');
  if (previewAssets.length !== 1) throw new Error('双 LOD 装置清单必须且只能包含一个 preview 资产。');
  if (!sameAsset(compatibilityAsset, previewAssets[0])) throw new Error('兼容 webModel 必须与 preview LOD 完全一致。');
}

function localManifestAssetPaths(manifest: DeviceManifest) {
  const externalAnonymousPreview = manifest.schemaVersion === '1.4'
    && manifest.id === EXL50U_GA_MANIFEST_ID
    && (manifest.assets.shardBundles?.length ?? 0) > 0;
  return [
    ...(!externalAnonymousPreview && manifest.assets.webModel ? [manifest.assets.webModel.path] : []),
    ...(!externalAnonymousPreview ? (manifest.assets.webModels?.map((asset) => asset.path) ?? []) : []),
    ...(manifest.assets.poster ? [manifest.assets.poster.path] : []),
    ...(manifest.assets.sourceCad ? [manifest.assets.sourceCad.path] : []),
  ];
}

function validateManifestAssetNamespace(manifest: DeviceManifest, manifestUrl: string) {
  if (!isSafePublicAssetPath(manifestUrl) || !manifestUrl.endsWith('/model-manifest.json')) {
    throw new Error('装置清单 URL 必须是规范的公开 model-manifest.json 路径。');
  }
  const packagePrefix = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
  // Only component shards may live in the separately controlled large-asset
  // namespace. Compatibility GLBs, posters and source assets must remain in
  // this manifest's exact package so a high-detail prefix cannot bypass the
  // package boundary.
  for (const assetPath of localManifestAssetPaths(manifest)) {
    const filename = assetPath.slice(packagePrefix.length);
    if (!assetPath.startsWith(packagePrefix) || filename === '' || filename.includes('/')) {
      throw new Error(`装置资产必须与清单位于同一精确包目录：${assetPath}`);
    }
  }
}

export type ParseDeviceManifestOptions = {
  /** Enforces that every declared browser asset belongs to this manifest's exact package directory. */
  manifestUrl?: string;
};

/**
 * Runtime validation intentionally checks the fields that cross the public trust boundary.
 * Full authoring validation is performed against the published JSON Schema in CI/data tooling.
 */
export function parseDeviceManifest(value: unknown, options: ParseDeviceManifestOptions = {}): DeviceManifest {
  if (!value || typeof value !== 'object') throw new Error('装置清单不是有效的 JSON 对象。');
  const manifest = value as Partial<DeviceManifest>;
  if (!manifest.id || !manifest.title || !manifest.schemaVersion) throw new Error('装置清单缺少 id、title 或 schemaVersion。');
  if (!['1.1', '1.2', '1.3', '1.4'].includes(manifest.schemaVersion)) throw new Error(`不支持的装置清单版本：${manifest.schemaVersion}。`);
  if (manifest.schemaVersion === '1.1'
    && (manifest.assets?.componentBundles !== undefined
      || manifest.assets?.shardBundles !== undefined
      || manifest.visualizations !== undefined)) {
    throw new Error('装置清单 1.1 不支持分片资产或解析可视化扩展。');
  }
  if (!manifest.devicePackage
    || !['public-demonstrator', 'public-simplified-derivative', 'controlled-engineering'].includes(manifest.devicePackage.kind)
    || !['illustrative', 'engineering-reference', 'authoritative'].includes(manifest.devicePackage.authority)
    || !Array.isArray(manifest.devicePackage.replacementContract)
    || manifest.devicePackage.replacementContract.length === 0) {
    throw new Error('装置清单缺少有效的装置包身份与替换合同。');
  }
  if (!manifest.access || !['PUBLIC', 'INTERNAL', 'CONTROLLED', 'RESTRICTED'].includes(manifest.access.classification)) {
    throw new Error('装置清单缺少有效的数据分级。');
  }
  if (typeof manifest.access.redistributionAllowed !== 'boolean'
    || typeof manifest.access.engineeringUseAllowed !== 'boolean'
    || typeof manifest.access.statement !== 'string'
    || manifest.access.statement.trim().length < 20) {
    throw new Error('装置清单缺少完整的授权与工程用途声明。');
  }
  if (!manifest.coordinateSystem
    || !manifest.coordinateSystem.linearUnit
    || !['X', 'Y', 'Z'].includes(manifest.coordinateSystem.upAxis)
    || !['right', 'left'].includes(manifest.coordinateSystem.handedness)
    || !(manifest.coordinateSystem.sourceToWebScale > 0)) {
    throw new Error('装置清单缺少有效的单位或坐标系。');
  }
  if (!manifest.assets) throw new Error('装置清单缺少可加载的浏览器资产。');
  const assets = manifest.assets;
  const hasWebModel = isAsset(assets.webModel);
  const hasComponentBundles = Array.isArray(assets.componentBundles) && assets.componentBundles.length > 0;
  const hasShardBundles = Array.isArray(assets.shardBundles) && assets.shardBundles.length > 0;
  if (!hasWebModel && !hasComponentBundles && !hasShardBundles) {
    throw new Error('装置清单至少需要 webModel、componentBundles 或 shardBundles。');
  }
  if (!hasWebModel && hasComponentBundles && manifest.schemaVersion !== '1.3') {
    throw new Error('仅分片的高精度装置清单必须使用 1.3 版本。');
  }
  if (assets.shardBundles !== undefined
    && (manifest.schemaVersion !== '1.4'
      || manifest.id !== EXL50U_GA_MANIFEST_ID
      || !hasWebModel
      || assets.componentBundles !== undefined
      || assets.sourceCad !== undefined
      || manifest.access.classification !== 'PUBLIC'
      || manifest.access.redistributionAllowed !== true
      || manifest.access.engineeringUseAllowed !== false)) {
    throw new Error('匿名 shardBundles 仅允许 EXL-50U 总装 1.4 公开非工程预览合同。');
  }
  if (manifest.schemaVersion === '1.4' && assets.shardBundles === undefined) {
    throw new Error('装置清单 1.4 仅用于受控的 EXL-50U 总装匿名分片合同。');
  }
  if (assets.webModels !== undefined) {
    if (!hasWebModel) throw new Error('webModels 需要兼容 webModel 资产。');
    validateWebModels(assets.webModels, assets.webModel as DeviceWebModel);
    if (assets.shardBundles !== undefined
      && assets.webModels.some((asset) => asset.quality !== 'preview')) {
      throw new Error('匿名分片合同只能把兼容 preview 声明为单体 webModels 资产。');
    }
  }
  if (assets.sourceCad !== undefined && !isAsset(assets.sourceCad)) throw new Error('装置清单包含无效的 sourceCad 资产。');
  if (assets.poster !== undefined && !isAssetWithoutFormat(assets.poster)) throw new Error('装置清单包含无效的 poster 资产。');
  if (!Array.isArray(manifest.systems) || manifest.systems.length === 0) throw new Error('装置清单没有系统/部件映射。');
  const partIds = new Set<string>();
  const nodeNames = new Set<string>();
  const manifestParts = new Map<string, string>();
  for (const system of manifest.systems) {
    if (!system.id || !system.title || !system.shortTitle || !system.description
      || !['plasma', 'tf', 'pf', 'layer', 'structure'].includes(system.category)
      || !/^#[a-f0-9]{6}$/i.test(system.color)
      || !Array.isArray(system.parts)
      || system.parts.length === 0) throw new Error('装置系统定义不完整。');
    for (const part of system.parts) {
      if (!part.id || !part.title || !part.nodeName || !part.description || !part.engineeringTag || partIds.has(part.id)) {
        throw new Error(`部件标识无效或重复：${part.id ?? 'unknown'}`);
      }
      if (nodeNames.has(part.nodeName)) throw new Error(`GLB 节点映射重复：${part.nodeName}`);
      partIds.add(part.id);
      nodeNames.add(part.nodeName);
      manifestParts.set(part.id, part.nodeName);
    }
  }
  if (assets.componentBundles !== undefined) {
    validateComponentBundles(
      assets.componentBundles,
      manifestParts,
      new Set(assets.webModels?.map((asset) => asset.id) ?? (hasWebModel ? ['standard'] : [])),
    );
    if (hasWebModel && assets.componentBundles.some((bundle) => bundle.triangles <= Number(assets.webModel?.triangles ?? 0))) {
      throw new Error('分片高清资产必须提供高于兼容预览的几何细节。');
    }
  }
  if (assets.shardBundles !== undefined) {
    const preview = assets.webModel as DeviceWebModel;
    const reviewCandidate = manifest.reviewCandidate?.status === 'USER_VISUAL_REVIEW_REQUIRED'
      && manifest.reviewCandidate.productionEligible === false;
    if (manifest.reviewCandidate !== undefined && !reviewCandidate) {
      throw new Error('EXL-50U 总装 review candidate 状态无效。');
    }
    validateAnonymousDerivationEvidence(manifest.derivationEvidence, reviewCandidate);
    const previewPathMatch = preview.path.match(EXL50U_PREVIEW_ASSET_PATH);
    if (!previewPathMatch
      || previewPathMatch[1] !== preview.sha256.toLowerCase()
      || preview.bytes > MAX_ANONYMOUS_PREVIEW_BYTES
      || !Number.isSafeInteger(preview.triangles) || Number(preview.triangles) <= 0
      || !Number.isSafeInteger(preview.vertices) || Number(preview.vertices) <= 0
      || !Number.isSafeInteger(preview.decodedGpuBytes) || Number(preview.decodedGpuBytes) <= 0
      || Number(preview.decodedGpuBytes) > MAX_ANONYMOUS_PREVIEW_DECODED_BYTES
      || Number(preview.triangles) > MAX_ANONYMOUS_SCENE_TRIANGLES
      || !isBoundsMetres(preview.boundsMetres)) {
      throw new Error('EXL-50U 总装 preview 必须使用摘要锁定路径并满足压缩、解码与几何预算。');
    }
    validateAnonymousShardBundles(
      assets.shardBundles,
      preview,
      new Set(assets.webModels?.map((asset) => asset.id) ?? ['standard']),
    );
    const anonymousBundle = assets.shardBundles[0];
    const derivationEvidence = manifest.derivationEvidence;
    if (Number(anonymousBundle?.sceneDrawTriangles) <= Number(preview.triangles ?? 0)) {
      throw new Error('EXL-50U 总装匿名高精度分片必须提供高于兼容 preview 的场景几何细节。');
    }
    if (!derivationEvidence
      || Number(derivationEvidence.previewVisualLod.outputCleaning.finalTriangles) > Number(preview.triangles)
      || Number(derivationEvidence.highQem.outputCleaning.finalTriangles)
        !== Number(anonymousBundle?.uniqueGeometryTriangles)
      || Number(derivationEvidence.highPartition.finalTrianglesBeforePartition)
        !== Number(anonymousBundle?.uniqueGeometryTriangles)
      || Number(derivationEvidence.highPartition.partitionedTriangles)
        !== Number(anonymousBundle?.uniqueGeometryTriangles)
      || Number(derivationEvidence.highPartition.geometryChunkCount)
        !== Number(anonymousBundle?.uniqueGeometryMeshes)) {
      throw new Error('EXL-50U 总装公开派生证据与清单几何统计不一致。');
    }
  }
  if (manifest.visualizations?.analyticPlasma !== undefined) validateAnalyticPlasma(manifest.visualizations.analyticPlasma);
  if (!manifest.generator?.name || !manifest.generator.version || !manifest.generator.license || !manifest.generator.licenseUrl) {
    throw new Error('装置清单缺少生成器与许可来源。');
  }
  if (manifest.generator.script && (!manifest.generator.script.path
    || !/^[a-f0-9]{64}$/i.test(manifest.generator.script.sha256))) {
    throw new Error('装置清单的生成脚本血缘无效。');
  }
  const conversion = manifest.generator.conversion;
  if (assets.webModels?.some((asset) => asset.quality === 'high')
    && (!conversion
      || !(Number(conversion.highLodAbsoluteDeflectionMillimetres) > 0)
      || !(Number(conversion.highLodAngularDeflectionRadians) > 0)
      || conversion.highLodSharpEdgeNormals !== true)) {
    throw new Error('高清 LOD 缺少离散化精度或锐边法线声明。');
  }
  if ((assets.componentBundles?.length || assets.shardBundles?.length)
    && (!conversion?.pipeline || !conversion.converter || !conversion.converterVersion)) {
    throw new Error('分片高清 LOD 缺少可复现的转换流水线声明。');
  }
  if (!manifest.disclaimer || manifest.disclaimer.trim().length < 30) throw new Error('装置清单缺少适用性边界声明。');
  const parsedManifest = manifest as DeviceManifest;
  if (options.manifestUrl) validateManifestAssetNamespace(parsedManifest, options.manifestUrl);
  return parsedManifest;
}
