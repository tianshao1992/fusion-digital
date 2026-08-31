import { EHL2_DIAGVIEW2_SOURCE } from '../components/device-viewer/ehl2DiagView2';

export type DeviceTone = 'online' | 'controlled' | 'restricted';
export type DeviceViewerMode = 'real-3d' | 'turntable-3d' | 'metadata-only';

export type DevicePhysicsOverlay = {
  id: string;
  kind: 'axisymmetric-equilibrium';
  manifestEndpoint: string;
  defaultShot: number;
  defaultTimeMs?: number;
  coordinateFrame: string;
  authority: 'visualization-derived';
  statement: string;
};

export type Ehl2DeviceDiagnosticWorkspace = {
  kind: 'ehl2-diagview2';
  authority: 'design-reference';
  coordinateFrame: 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1';
  asOf: '2026-08-21';
  sourceLabel: 'DiagView2 geometry-analysis engine and reviewed EHL-2 flange dataset';
  sourceRevision: typeof EHL2_DIAGVIEW2_SOURCE.branchCommit;
  portDatasetEndpoint: '/models/ehl2-preliminary-v1/diagview2-ports.json';
  capabilities: readonly [
    'camera',
    'array',
    'laser',
    'cad-first-hit',
    'render-slicing',
    'geometry-io',
    'design-report',
    'optical-view-capture',
    'virtual-forward-model',
  ];
  statement: string;
};

export type Exl50uDiagnosticWorkspace = {
  kind: 'exl50u-diagview2';
  authority: 'design-reference';
  coordinateFrame: 'EXL50U_WEB_METRES_REVIEWED_DIAGVIEW2_V1';
  asOf: '2026-08-28';
  sourceLabel: 'DiagView2 geometry engine and reviewed EXL50U historical port table';
  sourceRevision: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79';
  portDatasetEndpoint: '/models/exl50u-diagview2-v1/diagview2-ports.json';
  sensorDatasetEndpoint: '/models/exl50u-sensor-points-v1/sensor-points.json';
  sensorManifestEndpoint: '/models/exl50u-sensor-points-v1/manifest.json';
  capabilities: readonly [
    'camera',
    'array',
    'laser',
    'reviewed-port-poses',
    'browser-overlay',
    'host-sensor-points',
    'sensor-point-draft-management',
  ];
  statement: string;
};

export type DeviceDiagnosticWorkspace =
  | Ehl2DeviceDiagnosticWorkspace
  | Exl50uDiagnosticWorkspace;

export type DeviceCatalogEntry = {
  id: string;
  index: string;
  title: string;
  eyebrow: string;
  state: string;
  tone: DeviceTone;
  facts: string[];
  deviceOverview: string;
  fileSummary: string;
  copy: string;
  availability: string;
  delivery: string;
  comparisonFrame: string | null;
  statement: string;
  viewer: {
    mode: DeviceViewerMode;
    manifestEndpoint: string | null;
    turntableManifestEndpoint: string | null;
    overlayEligible: boolean;
  };
  physicsOverlays: DevicePhysicsOverlay[];
  diagnosticWorkspace: DeviceDiagnosticWorkspace | null;
};

export type DeviceCatalog = {
  schemaVersion: string;
  asOf: string;
  securityPolicy: {
    previewOnly: boolean;
    showDownloadActions: boolean;
    sourceCadDelivered: boolean;
    engineeringMeshDelivered: boolean;
    cacheRequestPolicy: 'no-store';
    referrerPolicy: 'no-referrer';
    notice: string;
  };
  devices: DeviceCatalogEntry[];
};

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, path: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a non-empty string`);
  return value;
}

function nullablePublicPath(value: unknown, path: string) {
  if (value === null) return null;
  const result = stringValue(value, path);
  if (!(result.startsWith('/models/') || result.startsWith('/device-assets/exl50u-interactive/')) || result.includes('..') || result.includes('%') || result.includes('//') || /^[a-z]+:/i.test(result)) {
    throw new Error(`${path} must be a safe /models/ or controlled EXL device-asset path, or null`);
  }
  return result;
}

function controlledPhysicsPath(value: unknown, path: string) {
  const result = stringValue(value, path);
  if (!/^\/device-data\/[a-z0-9-]+\/[a-z0-9._-]+$/i.test(result)
    || result.includes('..') || result.includes('%') || result.includes('//') || /^[a-z]+:/i.test(result)) {
    throw new Error(`${path} must be a canonical controlled device-data path`);
  }
  return result;
}

function booleanValue(value: unknown, path: string) {
  if (typeof value !== 'boolean') throw new Error(`${path} must be a boolean`);
  return value;
}

export function parseDeviceCatalog(input: unknown): DeviceCatalog {
  const root = record(input, 'deviceCatalog');
  const policy = record(root.securityPolicy, 'deviceCatalog.securityPolicy');
  if (policy.previewOnly !== true
    || policy.showDownloadActions !== false
    || policy.sourceCadDelivered !== false
    || policy.engineeringMeshDelivered !== false) {
    throw new Error('deviceCatalog security policy must deny source and engineering asset delivery');
  }
  if (!Array.isArray(root.devices) || root.devices.length === 0) throw new Error('deviceCatalog.devices must be a non-empty array');

  const ids = new Set<string>();
  const devices = root.devices.map((candidate, index): DeviceCatalogEntry => {
    const item = record(candidate, `deviceCatalog.devices[${index}]`);
    const viewer = record(item.viewer, `deviceCatalog.devices[${index}].viewer`);
    const id = stringValue(item.id, `deviceCatalog.devices[${index}].id`);
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || ids.has(id)) throw new Error(`invalid or duplicate device id: ${id}`);
    ids.add(id);

    const tone = stringValue(item.tone, `${id}.tone`);
    if (!['online', 'controlled', 'restricted'].includes(tone)) throw new Error(`${id}.tone is unsupported`);
    const mode = stringValue(viewer.mode, `${id}.viewer.mode`);
    if (!['real-3d', 'turntable-3d', 'metadata-only'].includes(mode)) throw new Error(`${id}.viewer.mode is unsupported`);
    if (!Array.isArray(item.facts) || !item.facts.every((fact) => typeof fact === 'string')) throw new Error(`${id}.facts must contain strings`);

    const manifestEndpoint = nullablePublicPath(viewer.manifestEndpoint, `${id}.viewer.manifestEndpoint`);
    const turntableManifestEndpoint = nullablePublicPath(viewer.turntableManifestEndpoint, `${id}.viewer.turntableManifestEndpoint`);
    if (mode === 'real-3d' && manifestEndpoint === null) throw new Error(`${id} real-3d requires a manifest endpoint`);
    if (mode === 'turntable-3d' && turntableManifestEndpoint === null) throw new Error(`${id} turntable-3d requires a turntable manifest endpoint`);
    if (mode === 'metadata-only' && (manifestEndpoint !== null || turntableManifestEndpoint !== null)) throw new Error(`${id} metadata-only cannot deliver visual assets`);
    if (mode === 'real-3d' && item.delivery !== 'public-static') throw new Error(`${id} real-3d must be public-static`);
    if (mode === 'turntable-3d' && item.delivery !== 'public-static-preview') throw new Error(`${id} turntable-3d must be public-static-preview`);
    if (mode === 'metadata-only' && item.delivery !== 'local-only') throw new Error(`${id} metadata-only must fail closed as local-only`);

    const overlayIds = new Set<string>();
    const physicsOverlays = (item.physicsOverlays === undefined ? [] : (() => {
      if (!Array.isArray(item.physicsOverlays)) throw new Error(`${id}.physicsOverlays must be an array`);
      return item.physicsOverlays;
    })()).map((candidate, overlayIndex): DevicePhysicsOverlay => {
      const overlay = record(candidate, `${id}.physicsOverlays[${overlayIndex}]`);
      const overlayId = stringValue(overlay.id, `${id}.physicsOverlays[${overlayIndex}].id`);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(overlayId) || overlayIds.has(overlayId)) {
        throw new Error(`${id} has an invalid or duplicate physics overlay id: ${overlayId}`);
      }
      overlayIds.add(overlayId);
      const kind = stringValue(overlay.kind, `${id}.${overlayId}.kind`);
      if (kind !== 'axisymmetric-equilibrium') throw new Error(`${id}.${overlayId}.kind is unsupported`);
      const authority = stringValue(overlay.authority, `${id}.${overlayId}.authority`);
      if (authority !== 'visualization-derived') throw new Error(`${id}.${overlayId}.authority is unsupported`);
      const defaultShot = finiteInteger(overlay.defaultShot, `${id}.${overlayId}.defaultShot`);
      const defaultTimeMs = overlay.defaultTimeMs === undefined
        ? undefined
        : finiteInteger(overlay.defaultTimeMs, `${id}.${overlayId}.defaultTimeMs`);
      return {
        id: overlayId,
        kind,
        manifestEndpoint: controlledPhysicsPath(overlay.manifestEndpoint, `${id}.${overlayId}.manifestEndpoint`),
        defaultShot,
        defaultTimeMs,
        coordinateFrame: stringValue(overlay.coordinateFrame, `${id}.${overlayId}.coordinateFrame`),
        authority,
        statement: stringValue(overlay.statement, `${id}.${overlayId}.statement`),
      };
    });
    if (physicsOverlays.length > 0 && mode !== 'real-3d') {
      throw new Error(`${id} physics overlays require a real-3d viewer`);
    }

    const diagnosticWorkspace = item.diagnosticWorkspace === null
      ? null
      : (() => {
        const workspace = record(item.diagnosticWorkspace, `${id}.diagnosticWorkspace`);
        const kind = stringValue(workspace.kind, `${id}.diagnosticWorkspace.kind`);
        const authority = stringValue(workspace.authority, `${id}.diagnosticWorkspace.authority`);
        const coordinateFrame = stringValue(workspace.coordinateFrame, `${id}.diagnosticWorkspace.coordinateFrame`);
        const asOf = stringValue(workspace.asOf, `${id}.diagnosticWorkspace.asOf`);
        const sourceLabel = stringValue(workspace.sourceLabel, `${id}.diagnosticWorkspace.sourceLabel`);
        const sourceRevision = stringValue(workspace.sourceRevision, `${id}.diagnosticWorkspace.sourceRevision`);
        const portDatasetEndpoint = stringValue(workspace.portDatasetEndpoint, `${id}.diagnosticWorkspace.portDatasetEndpoint`);
        const sensorDatasetEndpoint = workspace.sensorDatasetEndpoint === undefined
          ? undefined
          : stringValue(workspace.sensorDatasetEndpoint, `${id}.diagnosticWorkspace.sensorDatasetEndpoint`);
        const sensorManifestEndpoint = workspace.sensorManifestEndpoint === undefined
          ? undefined
          : stringValue(workspace.sensorManifestEndpoint, `${id}.diagnosticWorkspace.sensorManifestEndpoint`);
        if (!Array.isArray(workspace.capabilities)
          || !workspace.capabilities.every((capability) => typeof capability === 'string')) {
          throw new Error(`${id}.diagnosticWorkspace.capabilities must be a string array`);
        }
        const capabilities = [...workspace.capabilities];
        const ehl2Capabilities = [
          'camera',
          'array',
          'laser',
          'cad-first-hit',
          'render-slicing',
          'geometry-io',
          'design-report',
          'optical-view-capture',
          'virtual-forward-model',
        ] as const;
        const exl50uCapabilities = [
          'camera',
          'array',
          'laser',
          'reviewed-port-poses',
          'browser-overlay',
          'host-sensor-points',
          'sensor-point-draft-management',
        ] as const;
        const statement = stringValue(workspace.statement, `${id}.diagnosticWorkspace.statement`);
        if (mode !== 'real-3d') {
          throw new Error(`${id} diagnostic workspace requires a real-3d viewer`);
        }
        if (id === 'ehl-2-preliminary') {
          if (kind !== 'ehl2-diagview2'
            || authority !== 'design-reference'
            || coordinateFrame !== 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1'
            || asOf !== '2026-08-21'
            || sourceLabel !== 'DiagView2 geometry-analysis engine and reviewed EHL-2 flange dataset'
            || sourceRevision !== EHL2_DIAGVIEW2_SOURCE.branchCommit
            || portDatasetEndpoint !== '/models/ehl2-preliminary-v1/diagview2-ports.json'
            || sensorDatasetEndpoint !== undefined
            || sensorManifestEndpoint !== undefined
            || capabilities.length !== ehl2Capabilities.length
            || capabilities.some((capability, capabilityIndex) => capability !== ehl2Capabilities[capabilityIndex])) {
            throw new Error(`${id}.diagnosticWorkspace is not a reviewed DiagView2 contract`);
          }
          return {
            kind: 'ehl2-diagview2',
            authority: 'design-reference',
            coordinateFrame: 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1',
            asOf: '2026-08-21',
            sourceLabel: 'DiagView2 geometry-analysis engine and reviewed EHL-2 flange dataset',
            sourceRevision: EHL2_DIAGVIEW2_SOURCE.branchCommit,
            portDatasetEndpoint: '/models/ehl2-preliminary-v1/diagview2-ports.json',
            capabilities: ehl2Capabilities,
            statement,
          } satisfies Ehl2DeviceDiagnosticWorkspace;
        }
        if (id === 'exl-50u-2026-upgrade') {
          if (kind !== 'exl50u-diagview2'
            || authority !== 'design-reference'
            || coordinateFrame !== 'EXL50U_WEB_METRES_REVIEWED_DIAGVIEW2_V1'
            || asOf !== '2026-08-28'
            || sourceLabel !== 'DiagView2 geometry engine and reviewed EXL50U historical port table'
            || sourceRevision !== '868d74d5e0e6c9abaec0eb623bcdd13ead771c79'
            || portDatasetEndpoint !== '/models/exl50u-diagview2-v1/diagview2-ports.json'
            || sensorDatasetEndpoint !== '/models/exl50u-sensor-points-v1/sensor-points.json'
            || sensorManifestEndpoint !== '/models/exl50u-sensor-points-v1/manifest.json'
            || capabilities.length !== exl50uCapabilities.length
            || capabilities.some((capability, capabilityIndex) => capability !== exl50uCapabilities[capabilityIndex])) {
            throw new Error(`${id}.diagnosticWorkspace is not a reviewed DiagView2 contract`);
          }
          return {
            kind: 'exl50u-diagview2',
            authority: 'design-reference',
            coordinateFrame: 'EXL50U_WEB_METRES_REVIEWED_DIAGVIEW2_V1',
            asOf: '2026-08-28',
            sourceLabel: 'DiagView2 geometry engine and reviewed EXL50U historical port table',
            sourceRevision: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79',
            portDatasetEndpoint: '/models/exl50u-diagview2-v1/diagview2-ports.json',
            sensorDatasetEndpoint: '/models/exl50u-sensor-points-v1/sensor-points.json',
            sensorManifestEndpoint: '/models/exl50u-sensor-points-v1/manifest.json',
            capabilities: exl50uCapabilities,
            statement,
          } satisfies Exl50uDiagnosticWorkspace;
        }
        throw new Error(`${id}.diagnosticWorkspace must be null`);
      })();
    if ((id === 'ehl-2-preliminary' || id === 'exl-50u-2026-upgrade') && diagnosticWorkspace === null) {
      throw new Error(`${id} requires its reviewed diagnostic workspace contract`);
    }
    if (id !== 'ehl-2-preliminary' && id !== 'exl-50u-2026-upgrade' && diagnosticWorkspace !== null) {
      throw new Error(`${id} diagnosticWorkspace must be null`);
    }

    return {
      id,
      index: stringValue(item.index, `${id}.index`),
      title: stringValue(item.title, `${id}.title`),
      eyebrow: stringValue(item.eyebrow, `${id}.eyebrow`),
      state: stringValue(item.state, `${id}.state`),
      tone: tone as DeviceTone,
      facts: [...item.facts] as string[],
      deviceOverview: stringValue(item.deviceOverview, `${id}.deviceOverview`),
      fileSummary: stringValue(item.fileSummary, `${id}.fileSummary`),
      copy: stringValue(item.copy, `${id}.copy`),
      availability: stringValue(item.availability, `${id}.availability`),
      delivery: stringValue(item.delivery, `${id}.delivery`),
      comparisonFrame: item.comparisonFrame === null ? null : stringValue(item.comparisonFrame, `${id}.comparisonFrame`),
      statement: stringValue(item.statement, `${id}.statement`),
      viewer: {
        mode: mode as DeviceViewerMode,
        manifestEndpoint,
        turntableManifestEndpoint,
        overlayEligible: booleanValue(viewer.overlayEligible, `${id}.viewer.overlayEligible`),
      },
      physicsOverlays,
      diagnosticWorkspace,
    };
  });

  return {
    schemaVersion: (() => {
      const schemaVersion = stringValue(root.schemaVersion, 'deviceCatalog.schemaVersion');
      if (schemaVersion !== '2.3') throw new Error(`Unsupported device catalog schemaVersion: ${schemaVersion}`);
      return schemaVersion;
    })(),
    asOf: stringValue(root.asOf, 'deviceCatalog.asOf'),
    securityPolicy: {
      previewOnly: booleanValue(policy.previewOnly, 'securityPolicy.previewOnly'),
      showDownloadActions: booleanValue(policy.showDownloadActions, 'securityPolicy.showDownloadActions'),
      sourceCadDelivered: booleanValue(policy.sourceCadDelivered, 'securityPolicy.sourceCadDelivered'),
      engineeringMeshDelivered: booleanValue(policy.engineeringMeshDelivered, 'securityPolicy.engineeringMeshDelivered'),
      cacheRequestPolicy: (() => {
        const value = stringValue(policy.cacheRequestPolicy, 'securityPolicy.cacheRequestPolicy');
        if (value !== 'no-store') throw new Error('securityPolicy.cacheRequestPolicy must be no-store');
        return 'no-store' as const;
      })(),
      referrerPolicy: (() => {
        const value = stringValue(policy.referrerPolicy, 'securityPolicy.referrerPolicy');
        if (value !== 'no-referrer') throw new Error('securityPolicy.referrerPolicy must be no-referrer');
        return 'no-referrer' as const;
      })(),
      notice: stringValue(policy.notice, 'securityPolicy.notice'),
    },
    devices,
  };
}

function finiteInteger(value: unknown, path: string) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe integer`);
  }
  return value;
}
