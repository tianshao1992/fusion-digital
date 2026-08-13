export type DevicePartCategory = 'plasma' | 'tf' | 'pf' | 'layer' | 'structure';

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
};

export type DeviceWebModelVariant = DeviceWebModel & {
  id: string;
  label: string;
  quality: 'preview' | 'high';
  triangles?: number;
  vertices?: number;
  default?: boolean;
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
    webModel: DeviceWebModel;
    webModels?: DeviceWebModelVariant[];
    sourceCad?: { path: string; format: string; sha256: string; bytes: number };
    poster?: { path: string; sha256: string; bytes: number };
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

function isAsset(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Record<string, unknown>;
  return typeof asset.path === 'string'
    && (asset.path.startsWith('/models/') || asset.path.startsWith('/device-assets/exl50u-interactive/'))
    && !asset.path.includes('..')
    && !asset.path.includes('%')
    && !asset.path.includes('//')
    && typeof asset.format === 'string'
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
  const allowedKeys = new Set(['id', 'label', 'quality', 'path', 'format', 'sha256', 'bytes', 'triangles', 'vertices', 'default']);

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
      || (record.vertices !== undefined && (!Number.isInteger(record.vertices) || Number(record.vertices) <= 0))) {
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

/**
 * Runtime validation intentionally checks the fields that cross the public trust boundary.
 * Full authoring validation is performed against the published JSON Schema in CI/data tooling.
 */
export function parseDeviceManifest(value: unknown): DeviceManifest {
  if (!value || typeof value !== 'object') throw new Error('装置清单不是有效的 JSON 对象。');
  const manifest = value as Partial<DeviceManifest>;
  if (!manifest.id || !manifest.title || !manifest.schemaVersion) throw new Error('装置清单缺少 id、title 或 schemaVersion。');
  if (manifest.schemaVersion !== '1.1') throw new Error(`不支持的装置清单版本：${manifest.schemaVersion}。`);
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
  if (!manifest.assets || !isAsset(manifest.assets.webModel)) throw new Error('装置清单缺少可加载的 webModel 资产。');
  if (manifest.assets.webModels !== undefined) validateWebModels(manifest.assets.webModels, manifest.assets.webModel);
  if (!Array.isArray(manifest.systems) || manifest.systems.length === 0) throw new Error('装置清单没有系统/部件映射。');
  const partIds = new Set<string>();
  const nodeNames = new Set<string>();
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
    }
  }
  if (!manifest.generator?.name || !manifest.generator.version || !manifest.generator.license || !manifest.generator.licenseUrl) {
    throw new Error('装置清单缺少生成器与许可来源。');
  }
  if (manifest.generator.script && (!manifest.generator.script.path
    || !/^[a-f0-9]{64}$/i.test(manifest.generator.script.sha256))) {
    throw new Error('装置清单的生成脚本血缘无效。');
  }
  const conversion = manifest.generator.conversion;
  if (manifest.assets.webModels?.some((asset) => asset.quality === 'high')
    && (!conversion
      || !(Number(conversion.highLodAbsoluteDeflectionMillimetres) > 0)
      || !(Number(conversion.highLodAngularDeflectionRadians) > 0)
      || conversion.highLodSharpEdgeNormals !== true)) {
    throw new Error('高清 LOD 缺少离散化精度或锐边法线声明。');
  }
  if (!manifest.disclaimer || manifest.disclaimer.trim().length < 30) throw new Error('装置清单缺少适用性边界声明。');
  return manifest as DeviceManifest;
}
