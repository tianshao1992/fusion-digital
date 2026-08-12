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

export type DeviceManifest = {
  $schema?: string;
  schemaVersion: string;
  id: string;
  title: string;
  asOf: string;
  devicePackage: {
    kind: 'public-demonstrator' | 'controlled-engineering';
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
    webModel: { path: string; format: string; sha256: string; bytes: number };
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
      linearToleranceSourceUnits: number;
      angularToleranceRadians: number;
    };
  };
  disclaimer: string;
};

function isAsset(value: unknown): value is DeviceManifest['assets']['webModel'] {
  if (!value || typeof value !== 'object') return false;
  const asset = value as Record<string, unknown>;
  return typeof asset.path === 'string'
    && asset.path.startsWith('/')
    && !asset.path.startsWith('//')
    && typeof asset.format === 'string'
    && typeof asset.sha256 === 'string'
    && /^[a-f0-9]{64}$/i.test(asset.sha256)
    && Number.isInteger(asset.bytes)
    && Number(asset.bytes) > 0;
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
    || !['public-demonstrator', 'controlled-engineering'].includes(manifest.devicePackage.kind)
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
  if (!manifest.disclaimer || manifest.disclaimer.trim().length < 30) throw new Error('装置清单缺少适用性边界声明。');
  return manifest as DeviceManifest;
}
