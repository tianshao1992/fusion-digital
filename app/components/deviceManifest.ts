export type DevicePartCategory = 'plasma' | 'tf' | 'pf' | 'layer' | 'structure';

export const MAX_COMPONENT_BUNDLE_DECODED_BYTES = 512 * 1024 * 1024;
export const MAX_COMPONENT_SHARD_MESH_INSTANCES = 300;
export const MAX_COMPONENT_BUNDLE_MESH_INSTANCES = 1_000;
export const ITER_COMPONENT_BUNDLE_FORMAT = 'glTF 2.0 binary + EXT_meshopt_compression + KHR_mesh_quantization; POSITION normalized Int16 per mesh; NORMAL normalized Int8 (8-bit)';
const ITER_COMPONENT_ASSET_PATH = /^\/device-assets\/iter-high-detail\/v1\/([a-z0-9-]+)\.([a-f0-9]{64})\.high\.meshopt\.glb$/;

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
    sourceCad?: { path: string; format: string; sha256: string; bytes: number };
    poster?: { path: string; sha256: string; bytes: number };
  };
  visualizations?: {
    analyticPlasma?: AnalyticPlasmaVisualization;
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
      || value.startsWith('/device-assets/iter-high-detail/'))
    && !value.includes('..')
    && !value.includes('%')
    && !value.includes('//')
    && !/^[a-z]+:/i.test(value);
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
  return [
    ...(manifest.assets.webModel ? [manifest.assets.webModel.path] : []),
    ...(manifest.assets.webModels?.map((asset) => asset.path) ?? []),
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
  if (!['1.1', '1.2', '1.3'].includes(manifest.schemaVersion)) throw new Error(`不支持的装置清单版本：${manifest.schemaVersion}。`);
  if (manifest.schemaVersion === '1.1'
    && (manifest.assets?.componentBundles !== undefined || manifest.visualizations !== undefined)) {
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
  if (!hasWebModel && !hasComponentBundles) throw new Error('装置清单至少需要 webModel 或 componentBundles。');
  if (!hasWebModel && manifest.schemaVersion !== '1.3') throw new Error('仅分片的高精度装置清单必须使用 1.3 版本。');
  if (assets.webModels !== undefined) {
    if (!hasWebModel) throw new Error('webModels 需要兼容 webModel 资产。');
    validateWebModels(assets.webModels, assets.webModel as DeviceWebModel);
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
  if (assets.componentBundles?.length
    && (!conversion?.pipeline || !conversion.converter || !conversion.converterVersion)) {
    throw new Error('分片高清 LOD 缺少可复现的转换流水线声明。');
  }
  if (!manifest.disclaimer || manifest.disclaimer.trim().length < 30) throw new Error('装置清单缺少适用性边界声明。');
  const parsedManifest = manifest as DeviceManifest;
  if (options.manifestUrl) validateManifestAssetNamespace(parsedManifest, options.manifestUrl);
  return parsedManifest;
}
