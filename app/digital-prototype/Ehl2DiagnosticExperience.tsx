'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import TokamakCadViewer, {
  parseEhl2DiagnosticViewerState,
  type Ehl2DiagnosticViewerSettings,
  type Ehl2DiagnosticViewerState,
} from '../components/TokamakCadViewer';
import {
  buildDiagView2MathProfile,
  buildDiagView2PreviewRays,
  buildDiagView2Report,
  buildDiagView2TraceRays,
  createDefaultDiagView2Design,
  createDiagView2RayResult,
  parseDiagView2DesignFile,
  parseDiagView2Geqdsk,
  projectReportsToHtml,
  reportToCsv,
  reportToHtml,
  reportToJson,
  resolveDiagView2Pose,
  resolveDiagView2RotatedFrame,
  serializeDiagView2DesignFile,
  type DiagView2DiagnosticDesign,
  type DiagView2DiagnosticRay,
  type DiagView2DiagnosticType,
  type DiagView2MathProfileModel,
  type DiagView2ProjectReportEntry,
  type DiagView2RayResult,
  type DiagView2Vec3,
  type DiagView2VirtualForwardProgress,
} from '../components/device-viewer/ehl2DiagView2Core';
import {
  EHL2_DIAGVIEW2_PORT_DATASET_URL,
  parseEhl2DiagView2PortDataset,
  type Ehl2DiagView2Port,
  type Ehl2DiagView2PortDataset,
  type Ehl2DiagView2PortSection,
} from '../components/device-viewer/ehl2DiagView2Ports';
import {
  DIAGVIEW2_PHYSICS_CAPABILITIES,
  DIAGVIEW2_PHYSICS_ELEMENTS,
  DIAGVIEW2_SPECTRAL_LINE_PRESETS,
  applyDiagView2SpectralLinePreset,
  buildDiagView2SpectralRelativeWeights,
  createDefaultDiagView2PhysicsSettings,
  diagView2DisplayToPecCm3S,
  parseDiagView2PhysicsSettings,
  pecCm3SToDiagView2Display,
  resolveDiagView2PhysicsExecutionPlan,
  serializeDiagView2PhysicsSettings,
  type DiagView2PhysicsProfileModel,
  type DiagView2PhysicsSettings,
} from '../components/device-viewer/ehl2DiagView2Physics';
import {
  buildDiagView2ForwardFigureData,
  diagView2ForwardFigureToJson,
  diagView2ForwardFigureToMatlab,
  diagView2ForwardFigureToSvg,
  type DiagView2ForwardFigureData,
} from '../components/device-viewer/ehl2DiagView2ForwardPresentation';
import {
  DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS,
  EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT,
  EHL2_DIAGNOSTIC_SCENARIOS,
  EHL2_DIAGVIEW2_SOURCE,
  diagView2PointToEhl2Web,
  type Vec3Tuple,
} from '../components/device-viewer/ehl2DiagView2';
import {
  buildEhl2GeqdskFluxSurfaceContours,
  type Ehl2DiagnosticOverlayOptions,
  type Ehl2DiagnosticPlasmaContext,
  type Ehl2DiagnosticPortMarkers,
} from '../components/device-viewer/Ehl2DiagnosticThreeOverlay';
import type { Ehl2DiagnosticPlane, Ehl2DiagnosticRuntime, Ehl2DiagnosticRuntimeProvenance, Ehl2DiagnosticSliceSpec } from '../components/device-viewer/ehl2DiagnosticRuntime';
import { useI18n } from '../i18n';
import type { DeviceCatalogEntry } from './deviceCatalog';
import styles from './Ehl2DiagnosticExperience.module.css';

type Props = { device: DeviceCatalogEntry };
type Tab = 'placement' | 'geometry' | 'analysis' | 'files' | 'forward' | 'source';
type SliceKind = 'none' | 'source-xy' | 'rotated-xz' | 'array-plane' | 'camera-frustum';
type AnalysisState = 'idle' | 'building' | 'tracing' | 'ready' | 'error';
type TraceMode = 'source-cad' | 'render-state';
type StoredAnalysis = {
  designId: string;
  geometryKey: string;
  traceMode: TraceMode;
  authority: 'render-cad-bvh-derived';
  cad: Ehl2DiagnosticRuntimeProvenance;
  results: readonly DiagView2RayResult[];
  /**
   * Runtime-only trust state. It is deliberately omitted from workspace JSON:
   * an imported file cannot self-assert that its CAD hits were observed in the
   * current browser session.
   */
  verifiedInSession: boolean;
  renderContext?: {
    viewerState: Ehl2DiagnosticViewerState;
    slice: WorkspaceSettings['slice'];
  };
};
type WorkspaceSettings = {
  tab: Tab;
  depthMode: 'xray' | 'physical';
  showLabels: boolean;
  showHits: boolean;
  traceMode: TraceMode;
  slice: {
    kind: SliceKind;
    offsetM: number;
    rotationDeg: number;
    side: 'positive' | 'negative';
    /** Explicit source-camera binding for a finite-frustum slice. */
    cameraDesignId: string | null;
  };
  forward: ForwardPanelSnapshot;
  portDisplay: PortDisplaySettings;
  viewerAppearance: ViewerAppearanceSettings;
  viewerState: Ehl2DiagnosticViewerState;
};
type PortDisplaySettings = {
  visible: boolean;
  opacity: number;
  showInfoPanel: boolean;
  scope: 'selected' | 'all';
};
type ViewerAppearanceSettings = Required<Omit<Ehl2DiagnosticViewerSettings, 'partOpacities'>>;
type PlasmaPanelSettings = {
  parametricVisible: boolean;
  parametricOpacity: number;
  geqdskVisible: boolean;
  geqdskOpacity: number;
  r0M: number;
  aM: number;
  kappa: number;
  delta: number;
};
type ForwardPanelSnapshot = {
  physics: DiagView2PhysicsSettings;
  plasma: PlasmaPanelSettings;
  geqdskDescriptor: null | {
    caseName: string;
    grid: string;
    restoration: 'file-reselection-required';
  };
};
type ForwardOutput = {
  authority: 'virtual-software';
  model: 'axisymmetric-rz-ray-marching';
  stepM: number;
  maxLengthM: number;
  rays: readonly DiagView2DiagnosticRay[];
  signals: Float64Array;
  normalizedSignals: Float64Array;
  normalizationReferenceSignal: number;
  signalUnit: 'relative-emissivity·m' | 'relative-line-weight·m';
  warnings: readonly string[];
};
type ForwardRunOutput = ForwardOutput & {
  figureData: DiagView2ForwardFigureData;
  runInput: {
    caseName: string;
    grid: string;
    profile: DiagView2MathProfileModel;
    core: number;
    edge: number;
    diagnosticId: string;
    physicsSettings: DiagView2PhysicsSettings;
    executionKernel: 'broadband-mathematical' | 'spectral-relative-manual';
  };
};
type ForwardWorkerMessage =
  | { type: 'progress'; requestId: string; progress: DiagView2VirtualForwardProgress }
  | { type: 'result'; requestId: string; result: ForwardOutput }
  | { type: 'error'; requestId: string; error: string };
const COLORS = { CAMERA: [0x61d6a7, '#61d6a7'], ARRAY: [0xf2c45c, '#f2c45c'], LASER: [0xff735d, '#ff735d'] } as const;
const STORAGE_KEY = 'fusiondigital:ehl2:diagview2-project:v4';
const LEGACY_STORAGE_KEY = 'fusiondigital:ehl2:diagview2-project:v3';
const DEFAULT_PLASMA_PANEL_SETTINGS: PlasmaPanelSettings = {
  parametricVisible: false,
  parametricOpacity: .85,
  geqdskVisible: false,
  geqdskOpacity: .2,
  r0M: .95,
  aM: .4,
  kappa: 1.8,
  delta: .4,
};
const EHL2_VIEWER_PARTS = [
  // The desktop DiagView2 source used per-model transparency to expose the
  // centre of the machine. The public web workspace intentionally starts from
  // the same opaque industrial render used by EXL-50U; transparency remains an
  // explicit user control below.
  { id: 'EHL2-WEB-01', zh: '真空室', en: 'Vacuum vessel', opacity: 1 },
  { id: 'EHL2-WEB-02', zh: '固定限制器', en: 'Fixed limiter', opacity: 1 },
  { id: 'EHL2-WEB-03', zh: '中心管组件', en: 'Centre-post assembly', opacity: 1 },
  { id: 'EHL2-WEB-04', zh: '偏滤器', en: 'Divertor', opacity: 1 },
  { id: 'EHL2-WEB-05', zh: '波纹管组件', en: 'Bellows assembly', opacity: 1 },
  { id: 'EHL2-WEB-06', zh: '杜瓦总装', en: 'Dewar assembly', opacity: 1 },
] as const;
const DEFAULT_PART_OPACITIES = Object.freeze(Object.fromEntries(EHL2_VIEWER_PARTS.map((part) => [part.id, part.opacity])));
const DEFAULT_PORT_DISPLAY: PortDisplaySettings = { visible: false, opacity: .95, showInfoPanel: true, scope: 'selected' };
const DEFAULT_SLICE: WorkspaceSettings['slice'] = Object.freeze({ kind: 'none', offsetM: 0, rotationDeg: 0, side: 'positive', cameraDesignId: null });
const DEFAULT_VIEWER_APPEARANCE: ViewerAppearanceSettings = {
  environmentPreset: 'room-platform-substitute',
  environmentIntensity: 1.08,
  backgroundEnabled: false,
  backgroundIntensity: 1,
  backgroundBlurriness: .2,
  defaultLightsEnabled: true,
  castShadow: false,
};
const defaultViewerState = (): Ehl2DiagnosticViewerState => ({
  activeView: 'iso',
  autoRotate: false,
  wireframe: false,
  clipping: false,
  clipAxis: 'x',
  clipOffset: 0,
  globalOpacity: 1,
  selectedOpacity: 1,
  analyticPlasmaVisible: false,
  selectedPartIds: [],
  hiddenPartIds: [],
  isolatedPartIds: [],
  partOpacities: { ...DEFAULT_PART_OPACITIES },
  cameraView: null,
});
const defaultForwardPanelSnapshot = (): ForwardPanelSnapshot => ({
  physics: createDefaultDiagView2PhysicsSettings(),
  plasma: { ...DEFAULT_PLASMA_PANEL_SETTINGS },
  geqdskDescriptor: null,
});

const finite = (value: string, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const colorNumber = (value: string) => Number.parseInt(value.replace(/^#/, ''), 16);
const tupleAt = (tuple: DiagView2Vec3, index: number, value: number): DiagView2Vec3 => tuple.map((item, itemIndex) => itemIndex === index ? value : item) as [number, number, number];
const webToDiag = (point: readonly [number, number, number]): DiagView2Vec3 => [point[0], -point[2], point[1]];
const cross = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3Tuple, b: Vec3Tuple) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a: Vec3Tuple, amount: number): Vec3Tuple => [a[0] * amount, a[1] * amount, a[2] * amount];
const normalise = (a: Vec3Tuple): Vec3Tuple => { const length = Math.hypot(...a); return length > 1e-10 ? scale(a, 1 / length) : [0, 1, 0]; };
const orient = (normal: Vec3Tuple, interior: Vec3Tuple) => dot(normal, interior) >= 0 ? normalise(normal) : scale(normalise(normal), -1);

function portPlacement(port: Ehl2DiagView2Port): DiagView2DiagnosticDesign['placement'] {
  if (port.flangeType === 'side_flange') return { mode: 'flange', flange: { kind: 'side_flange', section: port.section, angleDeg: port.azimuthDeg, radiusMm: port.sourceMm.r, zMm: port.sourceMm.z, thetaDeg: port.poloidalNormalDeg } };
  return { mode: 'flange', flange: { kind: 'mid_flange', section: port.section, angleDeg: port.azimuthDeg, xMm: port.sourceMm.x, yMm: port.sourceMm.y, zMm: port.sourceMm.z, thetaDeg: port.poloidalNormalDeg } };
}

function applyFlangeAbsoluteOpticalCentreMm(
  design: DiagView2DiagnosticDesign,
  targetMm: DiagView2Vec3,
): DiagView2DiagnosticDesign {
  if (design.placement.mode !== 'flange') return design;
  const baseWithLocal = resolveDiagView2Pose({ ...design, worldOffsetMm: [0, 0, 0] });
  const worldOffsetMm: DiagView2Vec3 = [
    targetMm[0] - baseWithLocal.positionM[0] * 1_000,
    targetMm[1] - baseWithLocal.positionM[1] * 1_000,
    targetMm[2] - baseWithLocal.positionM[2] * 1_000,
  ];
  return { ...design, worldOffsetMm };
}

function downloadBlob(filename: string, blob: Blob) {
  const href = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = href; link.download = filename; link.rel = 'noopener'; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
const downloadText = (filename: string, text: string, type: string) => downloadBlob(filename, new Blob([text], { type }));
const splitNumbers = (value: string) => value.trim() ? value.trim().split(/[\s,，;；]+/u).filter(Boolean).map((item) => { const number = Number(item); if (!Number.isFinite(number)) throw new Error('Path coordinates must be finite numbers.'); return number; }) : [];
const laserTextFromDesign = (design: DiagView2DiagnosticDesign) => {
  const points = design.laser?.customPathPointsMm ?? [];
  return {
    x: points.map((point) => point[0]).join(', '),
    y: points.map((point) => point[1]).join(', '),
    z: points.map((point) => point[2]).join(', '),
  };
};
const diagnosticGeometryKey = (design: DiagView2DiagnosticDesign) => JSON.stringify({
  id: design.id,
  diagnosticType: design.diagnosticType,
  placement: design.placement,
  localOffsetMm: design.localOffsetMm,
  worldOffsetMm: design.worldOffsetMm,
  rotationDeg: design.rotationDeg,
  camera: design.camera,
  array: design.array,
  laser: design.laser,
});
const RESULT_KEYS = [
  'channelIndex', 'defaultEndpointM', 'defaultLengthM', 'diagnosticType', 'direction',
  'effectiveEndpointM', 'hAngleDeg', 'hasIntersection', 'hitDistanceM', 'hitFaceNormal',
  'hitModel', 'hitPointM', 'incidenceAngleDeg', 'originM', 'rayId', 'role',
  'triangleIndex', 'vAngleDeg',
].sort().join('|');
const EHL2_PUBLIC_PART_IDS = new Set<string>(EHL2_VIEWER_PARTS.map((part) => part.id));
const vecFromUnknown = (value: unknown, path: string): DiagView2Vec3 => {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) throw new Error(`${path} must be a finite 3-vector.`);
  return [value[0] as number, value[1] as number, value[2] as number];
};
const vectorClose = (left: readonly number[], right: readonly number[], tolerance = 1e-8) => left.length === right.length && left.every((item, index) => Math.abs(item - right[index]) <= tolerance);
const scalarClose = (left: unknown, right: number | null, tolerance = 1e-8) => right === null ? left === null : typeof left === 'number' && Number.isFinite(left) && Math.abs(left - right) <= tolerance;

function parseStoredRayResults(value: unknown, design: DiagView2DiagnosticDesign): DiagView2RayResult[] {
  if (design.diagnosticType === 'LASER') throw new Error('LASER CAD analysis snapshots are not valid.');
  if (!Array.isArray(value) || value.length > 512) throw new Error('Stored CAD results must be a bounded array.');
  const expected = buildDiagView2TraceRays(design);
  if (value.length !== expected.length) throw new Error(`Stored CAD result count ${value.length} does not match ${expected.length} canonical rays.`);
  return expected.map((ray, index) => {
    const raw = value[index];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Stored CAD result ${index} must be an object.`);
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).sort().join('|') !== RESULT_KEYS) throw new Error(`Stored CAD result ${index} has an unexpected shape.`);
    if (item.rayId !== ray.rayId || item.diagnosticType !== ray.diagnosticType || item.role !== ray.role || item.channelIndex !== ray.channelIndex
      || !scalarClose(item.hAngleDeg, ray.hAngleDeg) || !scalarClose(item.vAngleDeg, ray.vAngleDeg)
      || typeof item.defaultLengthM !== 'number' || Math.abs(item.defaultLengthM - ray.defaultLengthM) > 1e-8
      || !vectorClose(vecFromUnknown(item.originM, `results[${index}].originM`), ray.originM)
      || !vectorClose(vecFromUnknown(item.direction, `results[${index}].direction`), ray.direction)
      || !vectorClose(vecFromUnknown(item.defaultEndpointM, `results[${index}].defaultEndpointM`), ray.defaultEndpointM)) {
      throw new Error(`Stored CAD result ${index} does not match canonical ray ${ray.rayId}.`);
    }
    if (typeof item.hasIntersection !== 'boolean') throw new Error(`results[${index}].hasIntersection must be boolean.`);
    const effectiveEndpoint = vecFromUnknown(item.effectiveEndpointM, `results[${index}].effectiveEndpointM`);
    if (!item.hasIntersection) {
      if (item.hitModel !== null || item.hitDistanceM !== null || item.hitPointM !== null || item.triangleIndex !== null || item.hitFaceNormal !== null || item.incidenceAngleDeg !== null
        || !vectorClose(effectiveEndpoint, ray.defaultEndpointM, 1e-7)) throw new Error(`Stored miss ${ray.rayId} has inconsistent hit fields.`);
      return createDiagView2RayResult(ray);
    }
    if (typeof item.hitModel !== 'string' || !EHL2_PUBLIC_PART_IDS.has(item.hitModel)
      || typeof item.hitDistanceM !== 'number' || !Number.isFinite(item.hitDistanceM) || item.hitDistanceM <= 0 || item.hitDistanceM > ray.defaultLengthM + 1e-7
      || typeof item.triangleIndex !== 'number' || !Number.isInteger(item.triangleIndex) || item.triangleIndex < 0
      || typeof item.incidenceAngleDeg !== 'number' || !Number.isFinite(item.incidenceAngleDeg) || item.incidenceAngleDeg < 0 || item.incidenceAngleDeg > 90) {
      throw new Error(`Stored hit ${ray.rayId} has invalid CAD metadata.`);
    }
    const hitPoint = vecFromUnknown(item.hitPointM, `results[${index}].hitPointM`);
    const hitNormal = vecFromUnknown(item.hitFaceNormal, `results[${index}].hitFaceNormal`);
    const projected: DiagView2Vec3 = [
      ray.originM[0] + ray.direction[0] * item.hitDistanceM,
      ray.originM[1] + ray.direction[1] * item.hitDistanceM,
      ray.originM[2] + ray.direction[2] * item.hitDistanceM,
    ];
    const normalMagnitude = Math.hypot(...hitNormal);
    const expectedIncidence = Math.acos(Math.min(1, Math.max(0, Math.abs(
      (-ray.direction[0] * hitNormal[0] - ray.direction[1] * hitNormal[1] - ray.direction[2] * hitNormal[2]) / normalMagnitude,
    )))) * 180 / Math.PI;
    if (!vectorClose(hitPoint, projected, 1e-5) || !vectorClose(effectiveEndpoint, hitPoint, 1e-7) || Math.abs(normalMagnitude - 1) > 1e-4
      || Math.abs(item.incidenceAngleDeg - expectedIncidence) > 1e-4) throw new Error(`Stored hit ${ray.rayId} is geometrically inconsistent.`);
    return createDiagView2RayResult(ray, {
      hitModel: item.hitModel,
      hitPointM: hitPoint,
      hitDistanceM: item.hitDistanceM,
      triangleIndex: item.triangleIndex,
      hitFaceNormal: hitNormal,
      incidenceAngleDeg: item.incidenceAngleDeg,
    });
  });
}

function parseRuntimeProvenance(value: unknown): Ehl2DiagnosticRuntimeProvenance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('|') !== ['assetId', 'coordinateFrame', 'deviceId', 'engine', 'modelPath', 'modelSha256', 'schema'].sort().join('|')
    || item.schema !== 'fusiondigital.ehl2-public-cad-v1' || item.coordinateFrame !== 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1' || item.engine !== 'three-mesh-bvh-v1'
    || typeof item.deviceId !== 'string' || typeof item.assetId !== 'string' || typeof item.modelPath !== 'string' || typeof item.modelSha256 !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(item.deviceId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(item.assetId)
    || !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]{1,511}$/.test(item.modelPath) || !/^[A-Fa-f0-9]{64}$/.test(item.modelSha256)) return null;
  return { schema: item.schema, deviceId: item.deviceId, assetId: item.assetId, modelPath: item.modelPath, modelSha256: item.modelSha256.toUpperCase(), coordinateFrame: item.coordinateFrame, engine: item.engine };
}

function parseStoredSlice(value: unknown): WorkspaceSettings['slice'] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort().join('|');
  const legacyKeys = ['kind', 'offsetM', 'rotationDeg', 'side'].sort().join('|');
  const boundKeys = ['cameraDesignId', 'kind', 'offsetM', 'rotationDeg', 'side'].sort().join('|');
  if ((keys !== legacyKeys && keys !== boundKeys) || !isOneOf(item.kind, SLICE_KINDS) || !isOneOf(item.side, ['positive', 'negative'] as const)) return null;
  const offsetM = finiteRange(item.offsetM, -5, 5); const rotationDeg = finiteRange(item.rotationDeg, -360, 360);
  const cameraDesignId = keys === legacyKeys ? null : item.cameraDesignId;
  if (offsetM === null || rotationDeg === null
    || (cameraDesignId !== null && (typeof cameraDesignId !== 'string' || cameraDesignId.length === 0
      || cameraDesignId.length > 160 || cameraDesignId.trim() !== cameraDesignId))
    || (item.kind !== 'camera-frustum' && cameraDesignId !== null)) return null;
  return { kind: item.kind, offsetM, rotationDeg, side: item.side, cameraDesignId };
}

function parseStoredAnalyses(value: unknown, designs: readonly DiagView2DiagnosticDesign[]): Record<string, StoredAnalysis> {
  if (!Array.isArray(value) || value.length > 64) throw new Error('Workspace analyses must be a bounded array.');
  const designById = new Map(designs.map((item) => [item.id, item]));
  const result: Record<string, StoredAnalysis> = {};
  value.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Workspace analysis ${index} must be an object.`);
    const item = raw as Record<string, unknown>;
    const sourceKeys = ['authority', 'cad', 'designId', 'geometryKey', 'results', 'traceMode'].sort().join('|');
    const renderKeys = ['authority', 'cad', 'designId', 'geometryKey', 'renderContext', 'results', 'traceMode'].sort().join('|');
    const keys = Object.keys(item).sort().join('|');
    if (keys !== sourceKeys && keys !== renderKeys || item.authority !== 'render-cad-bvh-derived' || typeof item.designId !== 'string' || typeof item.geometryKey !== 'string' || !isOneOf(item.traceMode, TRACE_MODES)) throw new Error(`Workspace analysis ${index} has an invalid contract.`);
    const design = designById.get(item.designId);
    if (!design || result[item.designId] || item.geometryKey !== diagnosticGeometryKey(design)) throw new Error(`Workspace analysis ${index} does not match a unique diagnostic geometry.`);
    const cad = parseRuntimeProvenance(item.cad);
    if (!cad) throw new Error(`Workspace analysis ${index} has invalid CAD provenance.`);
    let renderContext: StoredAnalysis['renderContext'];
    if (item.traceMode === 'render-state') {
      if (keys !== renderKeys || !item.renderContext || typeof item.renderContext !== 'object' || Array.isArray(item.renderContext)) throw new Error(`Workspace analysis ${index} is missing its render context.`);
      const context = item.renderContext as Record<string, unknown>;
      if (Object.keys(context).sort().join('|') !== ['slice', 'viewerState'].sort().join('|')) throw new Error(`Workspace analysis ${index} has an invalid render context.`);
      const parsedViewerState = parseEhl2DiagnosticViewerState(context.viewerState);
      const slice = parseStoredSlice(context.slice);
      if (!parsedViewerState || !slice) throw new Error(`Workspace analysis ${index} has an invalid render context.`);
      renderContext = { viewerState: parsedViewerState, slice };
    } else if (keys !== sourceKeys) throw new Error(`Source-CAD analysis ${index} must not contain a render context.`);
    result[item.designId] = { designId: item.designId, geometryKey: item.geometryKey, traceMode: item.traceMode, authority: item.authority, cad, results: parseStoredRayResults(item.results, design), verifiedInSession: false, ...(renderContext ? { renderContext } : {}) };
  });
  return result;
}

function sameRuntimeProvenance(left: Ehl2DiagnosticRuntimeProvenance, right: Ehl2DiagnosticRuntimeProvenance) {
  return left.schema === right.schema && left.deviceId === right.deviceId && left.assetId === right.assetId && left.modelPath === right.modelPath
    && left.modelSha256.toUpperCase() === right.modelSha256.toUpperCase() && left.coordinateFrame === right.coordinateFrame && left.engine === right.engine;
}

function createStoredAnalysis(
  diagnostic: DiagView2DiagnosticDesign,
  mode: TraceMode,
  rayResults: readonly DiagView2RayResult[],
  diagnosticRuntime: Ehl2DiagnosticRuntime,
  currentViewerState: Ehl2DiagnosticViewerState,
  currentSlice: WorkspaceSettings['slice'],
): StoredAnalysis {
  return {
    designId: diagnostic.id,
    geometryKey: diagnosticGeometryKey(diagnostic),
    traceMode: mode,
    authority: 'render-cad-bvh-derived',
    cad: { ...diagnosticRuntime.provenance },
    results: [...rayResults],
    verifiedInSession: true,
    ...(mode === 'render-state' ? { renderContext: { viewerState: currentViewerState, slice: { ...currentSlice } } } : {}),
  };
}

function storedAnalysisMatchesContext(
  stored: StoredAnalysis | undefined,
  diagnostic: DiagView2DiagnosticDesign,
  diagnosticRuntime: Ehl2DiagnosticRuntime | null,
  currentViewerState: Ehl2DiagnosticViewerState,
  currentSlice: WorkspaceSettings['slice'],
) {
  if (!stored || !stored.verifiedInSession || !diagnosticRuntime || stored.designId !== diagnostic.id || stored.geometryKey !== diagnosticGeometryKey(diagnostic)
    || !sameRuntimeProvenance(stored.cad, diagnosticRuntime.provenance)) return false;
  if (stored.traceMode === 'source-cad') return true;
  return Boolean(stored.renderContext
    && JSON.stringify(stored.renderContext.viewerState) === JSON.stringify(currentViewerState)
    && JSON.stringify(stored.renderContext.slice) === JSON.stringify(currentSlice));
}
const forwardDesignKey = diagnosticGeometryKey;
const WORKSPACE_SCHEMA = 'fusiondigital.ehl2.diagview2-workspace';
const TABS = ['placement', 'geometry', 'analysis', 'files', 'forward', 'source'] as const satisfies readonly Tab[];
const SLICE_KINDS = ['none', 'source-xy', 'rotated-xz', 'array-plane', 'camera-frustum'] as const satisfies readonly SliceKind[];
const TRACE_MODES = ['source-cad', 'render-state'] as const satisfies readonly TraceMode[];
const isOneOf = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && values.includes(value as T);
const finiteRange = (value: unknown, minimum: number, maximum: number) => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
const parsePlasmaPanelSettings = (value: unknown): PlasmaPanelSettings | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('|') !== ['aM', 'delta', 'geqdskOpacity', 'geqdskVisible', 'kappa', 'parametricOpacity', 'parametricVisible', 'r0M'].sort().join('|')) return null;
  if (typeof item.parametricVisible !== 'boolean' || typeof item.geqdskVisible !== 'boolean') return null;
  const parametricOpacity = finiteRange(item.parametricOpacity, 0, 1);
  const geqdskOpacity = finiteRange(item.geqdskOpacity, 0, 1);
  const r0M = finiteRange(item.r0M, .1, 5);
  const aM = finiteRange(item.aM, .01, 5);
  const kappa = finiteRange(item.kappa, .1, 5);
  const delta = finiteRange(item.delta, -1.5, 1.5);
  if (parametricOpacity === null || geqdskOpacity === null || r0M === null || aM === null || aM >= r0M || kappa === null || delta === null) return null;
  return { parametricVisible: item.parametricVisible, parametricOpacity, geqdskVisible: item.geqdskVisible, geqdskOpacity, r0M, aM, kappa, delta };
};
const parseForwardPanelSnapshot = (value: unknown): ForwardPanelSnapshot | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('|') !== ['geqdskDescriptor', 'physics', 'plasma'].sort().join('|')) return null;
  let physics: DiagView2PhysicsSettings;
  try { physics = parseDiagView2PhysicsSettings(item.physics); } catch { return null; }
  const plasma = parsePlasmaPanelSettings(item.plasma);
  if (!plasma) return null;
  let geqdskDescriptor: ForwardPanelSnapshot['geqdskDescriptor'] = null;
  if (item.geqdskDescriptor !== null) {
    if (!item.geqdskDescriptor || typeof item.geqdskDescriptor !== 'object' || Array.isArray(item.geqdskDescriptor)) return null;
    const descriptor = item.geqdskDescriptor as Record<string, unknown>;
    if (Object.keys(descriptor).sort().join('|') !== ['caseName', 'grid', 'restoration'].sort().join('|') || typeof descriptor.caseName !== 'string' || descriptor.caseName.length > 256 || typeof descriptor.grid !== 'string' || descriptor.grid.length > 64 || descriptor.restoration !== 'file-reselection-required') return null;
    geqdskDescriptor = { caseName: descriptor.caseName, grid: descriptor.grid, restoration: 'file-reselection-required' };
  }
  return { physics, plasma, geqdskDescriptor };
};
const parsePortDisplaySettings = (value: unknown): PortDisplaySettings | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort().join('|');
  const legacyKeys = ['opacity', 'showInfoPanel', 'visible'].sort().join('|');
  const currentKeys = ['opacity', 'scope', 'showInfoPanel', 'visible'].sort().join('|');
  if ((keys !== legacyKeys && keys !== currentKeys)
    || typeof item.visible !== 'boolean'
    || typeof item.showInfoPanel !== 'boolean'
    || (item.scope !== undefined && !isOneOf(item.scope, ['selected', 'all'] as const))) return null;
  const opacity = finiteRange(item.opacity, 0, 1);
  return opacity === null ? null : {
    visible: item.visible,
    opacity,
    showInfoPanel: item.showInfoPanel,
    scope: item.scope === 'all' ? 'all' : 'selected',
  };
};
const parseViewerAppearanceSettings = (value: unknown): ViewerAppearanceSettings | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort().join('|');
  const legacyKeys = ['backgroundBlurriness', 'backgroundEnabled', 'backgroundIntensity', 'defaultLightsEnabled', 'environmentIntensity'].sort().join('|');
  const currentKeys = ['backgroundBlurriness', 'backgroundEnabled', 'backgroundIntensity', 'castShadow', 'defaultLightsEnabled', 'environmentIntensity', 'environmentPreset'].sort().join('|');
  if ((keys !== legacyKeys && keys !== currentKeys)
    || typeof item.backgroundEnabled !== 'boolean' || typeof item.defaultLightsEnabled !== 'boolean'
    || (item.environmentPreset !== undefined && item.environmentPreset !== 'room-platform-substitute' && item.environmentPreset !== 'none')
    || (item.castShadow !== undefined && typeof item.castShadow !== 'boolean')) return null;
  const environmentIntensity = finiteRange(item.environmentIntensity, 0, 5);
  const backgroundIntensity = finiteRange(item.backgroundIntensity, 0, 5);
  const backgroundBlurriness = finiteRange(item.backgroundBlurriness, 0, 1);
  if (environmentIntensity === null || backgroundIntensity === null || backgroundBlurriness === null) return null;
  return { environmentPreset: item.environmentPreset === 'none' ? 'none' : 'room-platform-substitute', environmentIntensity, backgroundEnabled: item.backgroundEnabled, backgroundIntensity, backgroundBlurriness, defaultLightsEnabled: item.defaultLightsEnabled, castShadow: item.castShadow === true };
};
const parseWorkspaceSettings = (value: unknown): WorkspaceSettings | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const keys = Object.keys(item).sort();
  const legacyKeys = ['depthMode', 'showHits', 'showLabels', 'tab'].sort().join('|');
  if (keys.join('|') === legacyKeys) {
    if (!isOneOf(item.tab, TABS) || !isOneOf(item.depthMode, ['xray', 'physical'] as const) || typeof item.showLabels !== 'boolean' || typeof item.showHits !== 'boolean') return null;
    return { tab: item.tab, depthMode: item.depthMode, showLabels: item.showLabels, showHits: item.showHits, traceMode: 'source-cad', slice: { ...DEFAULT_SLICE }, forward: defaultForwardPanelSnapshot(), portDisplay: { ...DEFAULT_PORT_DISPLAY }, viewerAppearance: { ...DEFAULT_VIEWER_APPEARANCE }, viewerState: defaultViewerState() };
  }
  const v2Keys = ['depthMode', 'forward', 'showHits', 'showLabels', 'slice', 'tab', 'traceMode'].sort().join('|');
  const v3Keys = ['depthMode', 'forward', 'portDisplay', 'showHits', 'showLabels', 'slice', 'tab', 'traceMode', 'viewerAppearance', 'viewerState'].sort().join('|');
  if (keys.join('|') !== v2Keys && keys.join('|') !== v3Keys) return null;
  if (!isOneOf(item.tab, TABS) || !isOneOf(item.depthMode, ['xray', 'physical'] as const) || typeof item.showLabels !== 'boolean' || typeof item.showHits !== 'boolean' || !isOneOf(item.traceMode, TRACE_MODES)) return null;
  const slice = parseStoredSlice(item.slice);
  const forward = parseForwardPanelSnapshot(item.forward);
  if (!slice || !forward) return null;
  if (keys.join('|') === v2Keys) return { tab: item.tab, depthMode: item.depthMode, showLabels: item.showLabels, showHits: item.showHits, traceMode: 'source-cad', slice, forward, portDisplay: { ...DEFAULT_PORT_DISPLAY }, viewerAppearance: { ...DEFAULT_VIEWER_APPEARANCE }, viewerState: defaultViewerState() };
  const portDisplay = parsePortDisplaySettings(item.portDisplay);
  const viewerAppearance = parseViewerAppearanceSettings(item.viewerAppearance);
  const viewerState = parseEhl2DiagnosticViewerState(item.viewerState);
  if (!portDisplay || !viewerAppearance || !viewerState) return null;
  const allowedPartIds = new Set(EHL2_VIEWER_PARTS.map((part) => part.id));
  if ([...viewerState.selectedPartIds, ...viewerState.hiddenPartIds, ...viewerState.isolatedPartIds, ...Object.keys(viewerState.partOpacities)].some((id) => !allowedPartIds.has(id as (typeof EHL2_VIEWER_PARTS)[number]['id']))) return null;
  return { tab: item.tab, depthMode: item.depthMode, showLabels: item.showLabels, showHits: item.showHits, traceMode: item.traceMode, slice, forward, portDisplay, viewerAppearance, viewerState };
};
const resolveSafeGeometry = (design: DiagView2DiagnosticDesign) => {
  try {
    const pose = resolveDiagView2Pose(design);
    const preview = buildDiagView2PreviewRays(design);
    const traceCount = design.diagnosticType === 'LASER' ? null : buildDiagView2TraceRays(design).length;
    return { pose, preview, traceCount, error: '' };
  } catch (error) {
    return {
      pose: null,
      preview: [] as readonly DiagView2DiagnosticRay[],
      traceCount: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

function legacyV2(designs: readonly DiagView2DiagnosticDesign[]) {
  return JSON.stringify({ version: 2, diagnostics: designs.map((design) => {
    const pose = resolveDiagView2Pose(design); const common = { position: pose.positionM, normal: pose.normal, rotation: design.rotationDeg };
    if (design.camera) return { name_suffix: design.nameSuffix, diagnostic_type: 'CAMERA', params: { ...common, h_start: design.camera.hStartDeg, h_end: design.camera.hEndDeg, v_start: design.camera.vStartDeg, v_end: design.camera.vEndDeg, length: design.camera.lengthM } };
    if (design.array) return { name_suffix: design.nameSuffix, diagnostic_type: 'ARRAY', params: { ...common, array_v_start: design.array.vStartDeg, array_v_end: design.array.vEndDeg, array_ray_count: design.array.rayCount, length: design.array.lengthM } };
    return { name_suffix: design.nameSuffix, diagnostic_type: 'LASER', params: { ...common, laser_diameter_mm: design.laser!.diameterMm, laser_length: design.laser!.lengthM, ...(design.laser!.customPathPointsMm ? { laser_points: design.laser!.customPathPointsMm.map((point) => point.map((item) => item / 1000)) } : {}) } };
  }) }, null, 2);
}

function cameraPlanes(design: DiagView2DiagnosticDesign): readonly Ehl2DiagnosticPlane[] {
  const rays = buildDiagView2PreviewRays(design); const byId = (id: string) => rays.find((ray) => ray.rayId === id);
  const axis = byId('optical_axis'); const tl = byId('top_edge_00'); const tr = byId('top_edge_09'); const bl = byId('bottom_edge_00'); const br = byId('bottom_edge_09');
  if (!axis || !tl || !tr || !bl || !br) throw new Error('Camera boundary rays are incomplete.');
  const origin = diagView2PointToEhl2Web(axis.originM); const direction = diagView2PointToEhl2Web(axis.direction); const directions = [tl, tr, bl, br].map((ray) => diagView2PointToEhl2Web(ray.direction));
  const far: Vec3Tuple = [origin[0] + direction[0] * axis.defaultLengthM, origin[1] + direction[1] * axis.defaultLengthM, origin[2] + direction[2] * axis.defaultLengthM]; const [topLeft, topRight, bottomLeft, bottomRight] = directions;
  return [{ pointWebMetres: origin, normalWeb: direction }, { pointWebMetres: far, normalWeb: scale(direction, -1) }, { pointWebMetres: origin, normalWeb: orient(cross(bottomLeft, topLeft), direction) }, { pointWebMetres: origin, normalWeb: orient(cross(topRight, bottomRight), direction) }, { pointWebMetres: origin, normalWeb: orient(cross(topLeft, topRight), direction) }, { pointWebMetres: origin, normalWeb: orient(cross(bottomRight, bottomLeft), direction) }];
}

function cameraCaptureFrame(design: DiagView2DiagnosticDesign) {
  if (!design.camera) throw new Error('Diagnostic-view capture is available only for CAMERA.');
  const frame = resolveDiagView2RotatedFrame(design);
  return {
    designId: design.id,
    originWebMetres: diagView2PointToEhl2Web(frame.positionM),
    directionWeb: diagView2PointToEhl2Web(frame.n),
    upWeb: diagView2PointToEhl2Web(frame.v),
  };
}

function resolveDiagnosticSlice(
  activeDesign: DiagView2DiagnosticDesign,
  slice: WorkspaceSettings['slice'],
  designs: readonly DiagView2DiagnosticDesign[],
): { slice: WorkspaceSettings['slice']; spec: Ehl2DiagnosticSliceSpec | null; planes: readonly Ehl2DiagnosticPlane[] } {
  if (slice.kind === 'none') return { slice: { ...DEFAULT_SLICE }, spec: null, planes: [] };
  if (slice.kind === 'source-xy') {
    const canonical = { ...slice, cameraDesignId: null };
    const plane: Ehl2DiagnosticPlane = { pointWebMetres: [0, slice.offsetM, 0], normalWeb: [0, 1, 0], keepSide: slice.side };
    return { slice: canonical, spec: { kind: 'xz', offsetWebMetres: slice.offsetM, keepSide: slice.side }, planes: [plane] };
  }

  if (slice.kind === 'camera-frustum') {
    const boundCamera = slice.cameraDesignId
      ? designs.find((candidate) => candidate.id === slice.cameraDesignId)
      : activeDesign.camera
        ? activeDesign
        : [...designs].reverse().find((candidate) => candidate.camera);
    if (!boundCamera?.camera) {
      throw new Error(slice.cameraDesignId
        ? `Camera-frustum slice binding ${slice.cameraDesignId} is missing or is not a CAMERA diagnostic.`
        : 'A camera-frustum slice requires the active or a frozen CAMERA diagnostic.');
    }
    const planes = cameraPlanes(boundCamera);
    return {
      slice: { ...slice, cameraDesignId: boundCamera.id },
      spec: { kind: 'camera-six-plane', planes },
      planes,
    };
  }

  const pose = resolveDiagView2Pose(activeDesign);
  const angle = slice.rotationDeg * Math.PI / 180;
  const normalDiag: DiagView2Vec3 = slice.kind === 'rotated-xz'
    ? [-Math.sin(angle), Math.cos(angle), 0]
    : resolveDiagView2RotatedFrame(activeDesign).u;
  const normal = diagView2PointToEhl2Web(normalDiag);
  const base: Vec3Tuple = slice.kind === 'rotated-xz' ? [0, 0, 0] : diagView2PointToEhl2Web(pose.positionM);
  const plane: Ehl2DiagnosticPlane = {
    pointWebMetres: [base[0] + normal[0] * slice.offsetM, base[1] + normal[1] * slice.offsetM, base[2] + normal[2] * slice.offsetM],
    normalWeb: normal,
    keepSide: slice.side,
  };
  const canonical = { ...slice, cameraDesignId: null };
  return { slice: canonical, spec: { kind: 'array-plane', plane }, planes: [plane] };
}

function applyStoredDiagnosticSlice(
  runtime: Ehl2DiagnosticRuntime,
  design: DiagView2DiagnosticDesign,
  slice: WorkspaceSettings['slice'],
  designs: readonly DiagView2DiagnosticDesign[] = [design],
) {
  const resolved = resolveDiagnosticSlice(design, slice, designs);
  if (resolved.spec) runtime.applyDiagnosticSlice(resolved.spec);
  else runtime.clearDiagnosticSlice();
  return resolved.slice;
}

function upsertDesign(
  designs: readonly DiagView2DiagnosticDesign[],
  design: DiagView2DiagnosticDesign,
) {
  const index = designs.findIndex((item) => item.id === design.id);
  if (index < 0) return [...designs, design];
  const next = [...designs];
  next[index] = design;
  return next;
}

function forwardResultToCsv(output: ForwardOutput) {
  const rows = [['Ray_ID', 'Role', 'Channel', 'Raw_signal', 'Normalized_signal', 'Unit']];
  output.rays.forEach((ray, index) => rows.push([
    ray.rayId,
    ray.role,
    ray.channelIndex === null ? '' : String(ray.channelIndex),
    String(output.signals[index]),
    String(output.normalizedSignals[index]),
    output.signalUnit,
  ]));
  return `${rows.map((row) => row.map((value) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value).join(',')).join('\r\n')}\r\n`;
}

function forwardResultToJson(output: ForwardRunOutput) {
  return JSON.stringify({
    authority: output.authority,
    model: output.model,
    runInput: output.runInput,
    stepM: output.stepM,
    maxLengthM: output.maxLengthM,
    signalUnit: output.signalUnit,
    normalizationReferenceSignal: output.normalizationReferenceSignal,
    warnings: output.warnings,
    figureData: output.figureData,
    channels: output.rays.map((ray, index) => ({
      rayId: ray.rayId,
      role: ray.role,
      channelIndex: ray.channelIndex,
      rawSignal: output.signals[index],
      normalizedSignal: output.normalizedSignals[index],
    })),
  }, null, 2);
}

export default function Ehl2DiagnosticExperience({ device }: Props) {
  const { locale } = useI18n(); const english = locale === 'en'; const ui = useCallback((zh: string, en: string) => english ? en : zh, [english]); const contract = device.diagnosticWorkspace;
  const [dataset, setDataset] = useState<Ehl2DiagView2PortDataset | null>(null); const [datasetError, setDatasetError] = useState('');
  const [design, setDesignState] = useState(() => createDefaultDiagView2Design('CAMERA', 'EHL2-CAMERA-01')); const [project, setProject] = useState<DiagView2DiagnosticDesign[]>([]); const [projectResults, setProjectResults] = useState<Record<string, StoredAnalysis>>({}); const [tab, setTab] = useState<Tab>('placement');
  const [runtime, setRuntime] = useState<Ehl2DiagnosticRuntime | null>(null); const [analysisState, setAnalysisState] = useState<AnalysisState>('idle'); const [completedTraceMode, setCompletedTraceMode] = useState<TraceMode | null>(null); const [message, setMessage] = useState(''); const [results, setResults] = useState<DiagView2RayResult[]>([]);
  const [depthMode, setDepthMode] = useState<'xray' | 'physical'>('physical'); const [showLabels, setShowLabels] = useState(true); const [showHits, setShowHits] = useState(true); const [showPptComposite, setShowPptComposite] = useState(false); const [physicsResetRevision, setPhysicsResetRevision] = useState(0);
  const [plasmaContexts, setPlasmaContexts] = useState<readonly Ehl2DiagnosticPlasmaContext[]>([]);
  const [forwardSnapshot, setForwardSnapshot] = useState<ForwardPanelSnapshot>(() => defaultForwardPanelSnapshot());
  const [portDisplay, setPortDisplay] = useState<PortDisplaySettings>(() => ({ ...DEFAULT_PORT_DISPLAY }));
  const [viewerAppearance, setViewerAppearance] = useState<ViewerAppearanceSettings>(() => ({ ...DEFAULT_VIEWER_APPEARANCE }));
  const [viewerState, setViewerState] = useState<Ehl2DiagnosticViewerState>(() => defaultViewerState());
  const [traceMode, setTraceMode] = useState<TraceMode>('source-cad'); const [sliceKind, setSliceKind] = useState<SliceKind>('none'); const [sliceOffset, setSliceOffset] = useState(0); const [sliceRotationDeg, setSliceRotationDeg] = useState(0); const [sliceSide, setSliceSide] = useState<'positive' | 'negative'>('positive'); const [appliedSlice, setAppliedSlice] = useState<WorkspaceSettings['slice']>(() => ({ ...DEFAULT_SLICE })); const [laserText, setLaserText] = useState({ x: '', y: '', z: '' });
  const allDesigns = useMemo(() => upsertDesign(project, design), [design, project]);
  const importRef = useRef<HTMLInputElement | null>(null); const traceAbort = useRef<AbortController | null>(null); const inFlightTraceMode = useRef<TraceMode | null>(null); const revision = useRef(0); const initialPort = useRef(false); const tabRefs = useRef<Array<HTMLButtonElement | null>>([]); const viewerStateKeyRef = useRef(JSON.stringify(viewerState));
  const englishRef = useRef(english);
  useEffect(() => { englishRef.current = english; }, [english]);
  const runtimeUi = useCallback((zh: string, en: string) => englishRef.current ? en : zh, []);
  const pendingRestoredSlice = useRef<{ design: DiagView2DiagnosticDesign; slice: WorkspaceSettings['slice'] } | null>(null);
  const runtimeRef = useRef<Ehl2DiagnosticRuntime | null>(null);
  const designRef = useRef(design);
  const allDesignsRef = useRef<readonly DiagView2DiagnosticDesign[]>(allDesigns);
  const appliedSliceRef = useRef<WorkspaceSettings['slice']>({ ...DEFAULT_SLICE });
  useEffect(() => {
    designRef.current = design;
    allDesignsRef.current = allDesigns;
  }, [allDesigns, design]);
  const commitAppliedSlice = useCallback((next: WorkspaceSettings['slice']) => {
    const canonical = { ...next };
    appliedSliceRef.current = canonical;
    setAppliedSlice(canonical);
  }, []);
  const runSafeUiAction = useCallback((action: () => void, successMessage?: string) => {
    try {
      action();
      if (successMessage) setMessage(successMessage);
    } catch (error) {
      setAnalysisState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => { const controller = new AbortController(); fetch(contract?.portDatasetEndpoint ?? EHL2_DIAGVIEW2_PORT_DATASET_URL, { cache: 'no-store', signal: controller.signal }).then(async (response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return parseEhl2DiagView2PortDataset(await response.json()); }).then(setDataset).catch((error: unknown) => { if (!controller.signal.aborted) setDatasetError(error instanceof Error ? error.message : String(error)); }); return () => controller.abort(); }, [contract?.portDatasetEndpoint]);
  useEffect(() => { if (!dataset || initialPort.current) return; initialPort.current = true; const port = dataset.records.find((item) => item.id === 'S2@270') ?? dataset.records[0]; setDesignState((current) => ({ ...current, placement: portPlacement(port) })); }, [dataset]);
  useEffect(() => () => traceAbort.current?.abort(), []);
  const handleDiagnosticRuntimeReady = useCallback((nextRuntime: Ehl2DiagnosticRuntime | null) => {
    const previousRuntime = runtimeRef.current;
    runtimeRef.current = nextRuntime;
    setRuntime(nextRuntime);
    if (!nextRuntime) {
      traceAbort.current?.abort();
      traceAbort.current = null;
      inFlightTraceMode.current = null;
      revision.current += 1;
      setResults([]);
      setCompletedTraceMode(null);
      setAnalysisState('idle');
      if (previousRuntime) setMessage(runtimeUi(
        '三维 CAD 运行时已卸载；分析快照仍保留，但在同一公开 CAD 指纹重新就绪前不会显示或导出。',
        'The 3D CAD runtime was unloaded. Analysis snapshots remain stored, but cannot be displayed or exported until the same published-CAD fingerprint is ready again.',
      ));
      return;
    }
    const pending = pendingRestoredSlice.current;
    pendingRestoredSlice.current = null;
    const targetDesign = pending?.design ?? designRef.current;
    const targetSlice = pending?.slice ?? appliedSliceRef.current;
    try {
      const resolvedSlice = applyStoredDiagnosticSlice(nextRuntime, targetDesign, targetSlice, allDesignsRef.current);
      commitAppliedSlice(resolvedSlice);
    } catch (error) {
      nextRuntime.clearDiagnosticSlice();
      commitAppliedSlice(DEFAULT_SLICE);
      setTraceMode('source-cad');
      setSliceKind('none');
      setSliceOffset(0);
      setSliceRotationDeg(0);
      setSliceSide('positive');
      setAnalysisState('error');
      setMessage(runtimeUi(
        `保存的显示剖切无法恢复，已安全回到源 CAD：${error instanceof Error ? error.message : String(error)}`,
        `The stored render slice could not be restored; source-CAD mode was restored safely: ${error instanceof Error ? error.message : String(error)}`,
      ));
    }
  }, [commitAppliedSlice, runtimeUi]);
  useEffect(() => {
    if (!runtime || appliedSlice.kind === 'none' || pendingRestoredSlice.current) return;
    let cancelled = false;
    try {
      applyStoredDiagnosticSlice(runtime, design, appliedSlice, allDesigns);
    } catch (error) {
      runtime.clearDiagnosticSlice();
      const detail = error instanceof Error ? error.message : String(error);
      queueMicrotask(() => {
        if (cancelled) return;
        commitAppliedSlice(DEFAULT_SLICE);
        setSliceKind('none');
        setSliceOffset(0);
        setSliceRotationDeg(0);
        setSliceSide('positive');
        setTraceMode('source-cad');
        setAnalysisState('error');
        setMessage(ui(
          `当前诊断变化后，已应用剖切不再有效，已安全清除：${detail}`,
          `The applied slice became invalid after the diagnostic changed and was safely cleared: ${detail}`,
        ));
      });
    }
    return () => { cancelled = true; };
  }, [allDesigns, appliedSlice, commitAppliedSlice, design, runtime, ui]);
  const setDesign = useCallback((next: DiagView2DiagnosticDesign) => { traceAbort.current?.abort(); traceAbort.current = null; inFlightTraceMode.current = null; revision.current += 1; setShowPptComposite(false); setProjectResults((current) => { const stored = current[next.id]; if (!stored || stored.geometryKey === diagnosticGeometryKey(next)) return current; const copy = { ...current }; delete copy[next.id]; return copy; }); setDesignState(next); setResults([]); setCompletedTraceMode(null); setAnalysisState('idle'); setMessage(''); }, []);
  const update = useCallback((apply: (current: DiagView2DiagnosticDesign) => DiagView2DiagnosticDesign) => setDesign(apply(design)), [design, setDesign]);
  const updateDisplay = useCallback((next: Partial<NonNullable<DiagView2DiagnosticDesign['display']>>) => setDesignState((current) => ({ ...current, display: { colorHex: COLORS[current.diagnosticType][1], opacity: current.diagnosticType === 'LASER' ? .25 : current.diagnosticType === 'CAMERA' ? .6 : 1, visible: true, ...current.display, ...next } })), []);
  const invalidateRenderTrace = useCallback((statusMessage?: string) => {
    const affected = traceMode === 'render-state' || completedTraceMode === 'render-state' || inFlightTraceMode.current === 'render-state';
    if (!affected) return false;
    traceAbort.current?.abort();
    traceAbort.current = null;
    inFlightTraceMode.current = null;
    revision.current += 1;
    setResults([]);
    setCompletedTraceMode(null);
    setAnalysisState('idle');
    setProjectResults((current) => { const copy = { ...current }; delete copy[design.id]; return copy; });
    if (statusMessage) setMessage(statusMessage);
    return true;
  }, [completedTraceMode, design.id, traceMode]);
  const acceptViewerState = useCallback((next: Ehl2DiagnosticViewerState) => {
    const key = JSON.stringify(next);
    if (key === viewerStateKeyRef.current) return;
    const hadState = viewerStateKeyRef.current.length > 0;
    viewerStateKeyRef.current = key;
    setViewerState(next);
    if (hadState) invalidateRenderTrace(ui('装置显示状态已改变；正在运行或已完成的探索性求交已失效。', 'Device render state changed; any running or completed exploratory trace was invalidated.'));
  }, [invalidateRenderTrace, ui]);
  const changeViewerState = useCallback((apply: (current: Ehl2DiagnosticViewerState) => Ehl2DiagnosticViewerState) => acceptViewerState(apply(viewerState)), [acceptViewerState, viewerState]);
  const geometry = useMemo(() => resolveSafeGeometry(design), [design]); const pose = geometry.pose; const preview = geometry.preview;
  const flangeAbsoluteCentreMm: DiagView2Vec3 | null = design.placement.mode === 'flange' && pose
    ? [pose.positionM[0] * 1_000, pose.positionM[1] * 1_000, pose.positionM[2] * 1_000]
    : null;
  const flangeAbsoluteCentreRanges = flangeAbsoluteCentreMm?.map((coordinate, axis) => {
    const baseWithLocalMm = coordinate - design.worldOffsetMm[axis];
    return [baseWithLocalMm - 5_000, baseWithLocalMm + 5_000] as const;
  });
  const portId = design.placement.mode === 'flange' ? `${design.placement.flange.section}@${design.placement.flange.angleDeg}` : 'explicit'; const port = dataset?.records.find((item) => item.id === portId) ?? null; const section = port?.section ?? 'S2'; const sectionPorts = dataset?.records.filter((item) => item.section === section) ?? [];
  const defaultColor = COLORS[design.diagnosticType]; const display = { colorHex: defaultColor[1], opacity: design.diagnosticType === 'LASER' ? .25 : design.diagnosticType === 'CAMERA' ? .6 : 1, visible: true, ...design.display }; const colorCss = display.colorHex; const color = colorNumber(colorCss);
  const backgroundLayers = useMemo(() => project.filter((item) => item.id !== design.id && item.display?.visible !== false).map((item) => ({
    designId: item.id,
    designName: item.nameSuffix,
    diagnosticType: item.diagnosticType,
    previewRays: resolveSafeGeometry(item).preview,
    laserDiameterMm: item.laser?.diameterMm ?? 0,
    opacity: item.display?.opacity ?? (item.diagnosticType === 'LASER' ? .25 : item.diagnosticType === 'CAMERA' ? .6 : 1),
    color: colorNumber(item.display?.colorHex ?? COLORS[item.diagnosticType][1]),
    colorCss: item.display?.colorHex ?? COLORS[item.diagnosticType][1],
  })), [design.id, project]);
  const portMarkers = useMemo<Ehl2DiagnosticPortMarkers | undefined>(() => {
    if (!portDisplay.visible || !dataset) return undefined;
    const markerPorts = portDisplay.scope === 'all' ? dataset.records : port ? [port] : [];
    if (markerPorts.length === 0) return undefined;
    return {
      pointsWebMetres: markerPorts.map((item) => ({
        id: item.id,
        label: `${item.id} · θ=${item.poloidalNormalDeg}°`,
        positionWebMetres: item.webMetres,
        normalWeb: item.webNormal,
      })),
      opacity: portDisplay.opacity,
      visible: true,
      selectedId: port?.id,
      color: 0xffc800,
      selectedColor: 0xffdf5d,
      showSelectedLabel: portDisplay.showInfoPanel,
    };
  }, [dataset, port, portDisplay]);
  const plasmaClippingPlanesWebMetres = useMemo(() => {
    try {
      return resolveDiagnosticSlice(design, appliedSlice, allDesigns).planes;
    } catch {
      return [];
    }
  }, [allDesigns, appliedSlice, design]);
  const overlay = useMemo<Ehl2DiagnosticOverlayOptions | undefined>(() => {
    if (showPptComposite) return { ...DEFAULT_EHL2_DIAGNOSTIC_OVERLAY_OPTIONS, labelLocale: english ? 'en' : 'zh-CN', mode: 'coverage', plasmaContexts, plasmaClippingPlanesWebMetres, portMarkers };
    if (!display.visible && backgroundLayers.length === 0 && plasmaContexts.length === 0 && !portMarkers) return undefined;
    return { kind: 'diagview2-workbench', labelLocale: english ? 'en' : 'zh-CN', designId: design.id, designName: design.nameSuffix, diagnosticType: design.diagnosticType, previewRays: display.visible ? preview : [], rayResults: display.visible ? results : [], depthMode, showRays: display.visible && !geometry.error, showLabels: display.visible && showLabels, showHitMarkers: display.visible && showHits, laserDiameterMm: design.laser?.diameterMm ?? 0, opacity: display.opacity, color, colorCss, backgroundLayers, plasmaContexts, plasmaClippingPlanesWebMetres, portMarkers };
  }, [backgroundLayers, color, colorCss, depthMode, design, display.opacity, display.visible, english, geometry.error, plasmaClippingPlanesWebMetres, plasmaContexts, portMarkers, preview, results, showHits, showLabels, showPptComposite]);

  useEffect(() => {
    const stored = projectResults[design.id];
    if (!runtime || !stored) return;
    let cancelled = false;
    if (!storedAnalysisMatchesContext(stored, design, runtime, viewerState, appliedSlice)) {
      if (completedTraceMode !== null || results.length > 0) {
        queueMicrotask(() => {
          if (cancelled) return;
          setResults([]);
          setCompletedTraceMode(null);
          setAnalysisState('idle');
          setMessage(ui('已保存的分析与当前公开 CAD 指纹或渲染上下文不匹配，已停止使用。', 'The saved analysis does not match the current published-CAD fingerprint or render context and was disabled.'));
        });
      }
      return () => { cancelled = true; };
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setResults([...stored.results]);
      setCompletedTraceMode(stored.traceMode);
      setAnalysisState(stored.results.length > 0 ? 'ready' : 'idle');
    });
    return () => { cancelled = true; };
  }, [appliedSlice, completedTraceMode, design, projectResults, results.length, runtime, ui, viewerState]);

  async function runTrace() {
    if (geometry.error) { setAnalysisState('error'); setMessage(geometry.error); return; }
    if (!runtime || design.diagnosticType === 'LASER') { setAnalysisState('error'); setMessage(design.diagnosticType === 'LASER' ? ui('原始 DiagView2 不对 LASER 执行 CAD 求交。', 'The source DiagView2 does not run CAD intersections for LASER.') : ui('三维运行时尚未就绪。', 'The 3D runtime is not ready.')); return; }
    traceAbort.current?.abort(); const controller = new AbortController(); traceAbort.current = controller; const requestRevision = ++revision.current; const requestTraceMode = traceMode; inFlightTraceMode.current = requestTraceMode;
    setProjectResults((current) => { const copy = { ...current }; delete copy[design.id]; return copy; });
    try { setResults([]); setCompletedTraceMode(null); setAnalysisState(runtime.status === 'ready' ? 'tracing' : 'building'); setMessage(runtime.status === 'ready' ? ui('正在计算最近交点…', 'Calculating nearest hits…') : ui('首次建立 CAD BVH；后续复用…', 'Building CAD BVHs once for reuse…'));
      const rays = buildDiagView2TraceRays(design); const traced = await runtime.traceRays({ requestId: `diagview2-${requestRevision}`, revision: requestRevision, respectClipping: requestTraceMode === 'render-state', respectVisibility: requestTraceMode === 'render-state', rays: rays.map((ray) => ({ rayId: ray.rayId, originWebMetres: diagView2PointToEhl2Web(ray.originM), directionWeb: diagView2PointToEhl2Web(ray.direction), defaultLengthMetres: ray.defaultLengthM })) }, controller.signal); if (controller.signal.aborted || traced.status === 'aborted' || requestRevision !== revision.current) return;
      if (traced.status === 'failed') throw new Error(traced.error ?? 'CAD BVH trace failed.');
      const invalid = traced.results.find((item) => item.state === 'invalid' || item.state === 'error');
      if (invalid) throw new Error(invalid.error ?? `CAD trace failed for ${invalid.rayId}.`);
      const byId = new Map(traced.results.map((item) => [item.rayId, item])); const converted = rays.map((ray) => { const item = byId.get(ray.rayId); if (!item || (item.state !== 'hit' && item.state !== 'miss')) throw new Error(`CAD trace did not return a completed state for ${ray.rayId}.`); return item.state === 'hit' && item.hitPointWebMetres && item.faceNormalWeb && item.triangleIndex !== null ? createDiagView2RayResult(ray, { hitModel: item.partId ?? item.model ?? 'unlabelled-part', hitPointM: webToDiag(item.hitPointWebMetres), hitDistanceM: item.distanceMetres ?? undefined, triangleIndex: item.triangleIndex, hitFaceNormal: webToDiag(item.faceNormalWeb), incidenceAngleDeg: item.incidenceAngleDeg ?? undefined }) : createDiagView2RayResult(ray); });
      const stored = createStoredAnalysis(design, requestTraceMode, converted, runtime, viewerState, appliedSliceRef.current);
      setResults(converted); setCompletedTraceMode(requestTraceMode); setProjectResults((current) => ({ ...current, [design.id]: stored })); setAnalysisState('ready'); setMessage(ui(`完成 ${converted.length} 条射线，${converted.filter((item) => item.hasIntersection).length} 条命中；${traced.elapsedMs.toFixed(0)} ms。`, `${converted.length} rays completed, ${converted.filter((item) => item.hasIntersection).length} hits in ${traced.elapsedMs.toFixed(0)} ms.`));
    } catch (error) { if (!controller.signal.aborted) { setCompletedTraceMode(null); setAnalysisState('error'); setMessage(error instanceof Error ? error.message : String(error)); } } finally { if (traceAbort.current === controller) { traceAbort.current = null; inFlightTraceMode.current = null; } }
  }

  function applySlice() {
    if (!runtime) return; try { if (geometry.error || !pose) throw new Error(geometry.error || 'Diagnostic pose is invalid.'); const nextSlice = { kind: sliceKind, offsetM: sliceOffset, rotationDeg: sliceRotationDeg, side: sliceSide, cameraDesignId: null } satisfies WorkspaceSettings['slice']; invalidateRenderTrace(); const resolvedSlice = applyStoredDiagnosticSlice(runtime, design, nextSlice, allDesigns); commitAppliedSlice(resolvedSlice); setMessage(ui('已应用仅用于显示的剖切；正在运行或已完成的渲染态求交均已失效。', 'Render-only slicing applied; any running or completed render-state trace was invalidated.')); } catch (error) { setAnalysisState('error'); setMessage(error instanceof Error ? error.message : String(error)); }
  }
  function clearDiagnosticSlice() {
    invalidateRenderTrace();
    runtime?.clearDiagnosticSlice();
    setSliceKind('none');
    setSliceOffset(0);
    setSliceRotationDeg(0);
    setSliceSide('positive');
    commitAppliedSlice(DEFAULT_SLICE);
    setMessage(ui('显示剖切已清除；正在运行或已完成的渲染态求交均已失效。', 'Render slicing cleared; any running or completed render-state trace was invalidated.'));
  }

  const activeStoredAnalysis = projectResults[design.id];
  const activeAnalysisContextValid = Boolean(runtime
    && completedTraceMode
    && activeStoredAnalysis?.traceMode === completedTraceMode
    && activeStoredAnalysis.results.length === results.length
    && storedAnalysisMatchesContext(activeStoredAnalysis, design, runtime, viewerState, appliedSlice));
  const analysisAvailable = analysisState === 'ready' && results.length > 0 && completedTraceMode !== null && activeAnalysisContextValid;
  const reportReady = analysisAvailable && completedTraceMode === 'source-cad'; const laserReportReady = design.diagnosticType === 'LASER' && !geometry.error; const reportExportReady = reportReady || laserReportReady; const report = () => { if (laserReportReady) return buildDiagView2Report(design, [], { deviceName: 'EHL-2', poloidalReferenceMajorRadiusM: forwardSnapshot.plasma.r0M }); if (!reportReady) throw new Error('A source-CAD analysis has not completed for the current diagnostic.'); return buildDiagView2Report(design, results, { deviceName: 'EHL-2', intersectionMode: 'source-cad', poloidalReferenceMajorRadiusM: forwardSnapshot.plasma.r0M }); };
  function cancelTrace() {
    traceAbort.current?.abort();
    traceAbort.current = null;
    inFlightTraceMode.current = null;
    revision.current += 1;
    setProjectResults((current) => { const copy = { ...current }; delete copy[design.id]; return copy; });
    setCompletedTraceMode(null);
    setResults([]);
    setAnalysisState('idle');
    setMessage(ui('已取消；旧分析快照不会自动恢复为当前结果。', 'Cancelled. The previous analysis snapshot will not be restored as the current result.'));
  }
  function snapshotCurrent() { setProject((current) => upsertDesign(current, design)); setProjectResults((current) => { const next = { ...current }; if (analysisAvailable && completedTraceMode && runtime) next[design.id] = createStoredAnalysis(design, completedTraceMode, results, runtime, viewerState, appliedSliceRef.current); else delete next[design.id]; return next; }); }
  function selectProjectDesign(next: DiagView2DiagnosticDesign) { traceAbort.current?.abort(); traceAbort.current = null; inFlightTraceMode.current = null; revision.current += 1; setShowPptComposite(false); setLaserText(laserTextFromDesign(next)); setDesignState(next); const stored = projectResults[next.id]; const saved = storedAnalysisMatchesContext(stored, next, runtime, viewerState, appliedSliceRef.current) ? stored : null; setResults(saved ? [...saved.results] : []); setCompletedTraceMode(saved?.traceMode ?? null); setAnalysisState(saved?.results.length ? 'ready' : 'idle'); setMessage(saved?.results.length ? ui('已按几何与公开 CAD 指纹恢复该快照的分析结果。', 'The snapshot analysis was restored against its geometry and published-CAD fingerprint.') : stored ? ui('已保存的分析与当前 CAD 或渲染上下文不匹配，未恢复为有效结果。', 'The saved analysis does not match the current CAD or render context and was not restored as a valid result.') : ''); }
  function projectAnalysis(now: string) {
    return allDesigns.map((item) => {
      const currentAnalysis = item.id === design.id && analysisAvailable && completedTraceMode && runtime
        ? createStoredAnalysis(design, completedTraceMode, results, runtime, viewerState, appliedSliceRef.current)
        : null;
      const stored = item.id === design.id ? currentAnalysis : projectResults[item.id];
      const saved = storedAnalysisMatchesContext(stored ?? undefined, item, runtime, viewerState, appliedSliceRef.current) ? stored : null;
      const sourceCad = saved?.traceMode === 'source-cad';
      const laserGeometryReport = item.diagnosticType === 'LASER'
        ? buildDiagView2Report(item, [], { deviceName: 'EHL-2', createdAt: now, poloidalReferenceMajorRadiusM: forwardSnapshot.plasma.r0M })
        : null;
      const analysisStatus: DiagView2ProjectReportEntry['analysisStatus'] = item.diagnosticType === 'LASER'
        ? 'not-applicable'
        : saved?.results.length
          ? (sourceCad ? 'completed' : 'exploratory-completed')
          : 'not-run';
      return {
        design: item,
        analysisStatus,
        intersectionMode: item.diagnosticType === 'LASER' ? 'not-applicable' as const : saved?.traceMode ?? null,
        report: laserGeometryReport ?? (saved?.results.length && sourceCad
          ? buildDiagView2Report(item, saved.results, { deviceName: 'EHL-2', createdAt: now, intersectionMode: 'source-cad', poloidalReferenceMajorRadiusM: forwardSnapshot.plasma.r0M })
          : null),
        exploratoryResults: saved?.results.length && !sourceCad ? saved.results : null,
      };
    });
  }
  function analysisBundle() { const now = new Date().toISOString(); return JSON.stringify({ schema: 'fusiondigital.diagview2-analysis-bundle', version: 1, source: EHL2_DIAGVIEW2_SOURCE, deviceId: 'ehl-2-preliminary', createdAt: now, diagnostics: projectAnalysis(now) }, null, 2); }
  function combinedProjectReport() { const now = new Date().toISOString(); const entries = projectAnalysis(now).map(({ design: item, analysisStatus, report: itemReport }) => ({ design: item, analysisStatus, report: itemReport })); return projectReportsToHtml(entries, { deviceName: 'EHL-2', createdAt: now }); }
  function workspaceSettings(): WorkspaceSettings {
    return {
      tab,
      depthMode,
      showLabels,
      showHits,
      traceMode,
      slice: appliedSlice,
      forward: forwardSnapshot,
      portDisplay,
      viewerAppearance,
      viewerState,
    };
  }
  function workspaceAnalyses() {
    const collected: Record<string, StoredAnalysis> = { ...projectResults };
    if (analysisAvailable && completedTraceMode && runtime) collected[design.id] = createStoredAnalysis(design, completedTraceMode, results, runtime, viewerState, appliedSliceRef.current);
    return allDesigns.flatMap((item) => {
      const stored = collected[item.id];
      if (!stored || stored.geometryKey !== diagnosticGeometryKey(item)) return [];
      return [{
        designId: stored.designId,
        geometryKey: stored.geometryKey,
        traceMode: stored.traceMode,
        authority: stored.authority,
        cad: stored.cad,
        results: stored.results,
        ...(stored.renderContext ? { renderContext: stored.renderContext } : {}),
      }];
    });
  }
  function serializeWorkspace() { return JSON.stringify({ schema: WORKSPACE_SCHEMA, version: 4, activeDesignId: design.id, geometry: JSON.parse(serializeDiagView2DesignFile(allDesigns, { deviceId: 'ehl-2-preliminary' })) as unknown, settings: workspaceSettings(), analyses: workspaceAnalyses() }, null, 2); }
  function loadProject(text: string) {
    if (text.length > 16 * 1024 * 1024) throw new Error('DiagView2 workspace exceeds the 16 MiB browser import limit.');
    pendingRestoredSlice.current = null;
    let geometryText = text;
    let restoredSettings: WorkspaceSettings | null = null;
    let rawAnalyses: unknown = [];
    let workspaceVersion = 0;
    let sliceRestoreFailure = '';
    let activeDesignId = '';
    let raw: unknown = null;
    try { raw = JSON.parse(text) as unknown; } catch { /* Geometry parser below returns the canonical validation error. */ }
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).schema === WORKSPACE_SCHEMA) {
      const envelope = raw as Record<string, unknown>;
      workspaceVersion = typeof envelope.version === 'number' ? envelope.version : 0;
      if ((workspaceVersion !== 1 && workspaceVersion !== 2 && workspaceVersion !== 3 && workspaceVersion !== 4) || !envelope.geometry) throw new Error('Unsupported or incomplete DiagView2 workspace snapshot.');
      const expectedKeys = workspaceVersion === 4
        ? ['activeDesignId', 'analyses', 'geometry', 'schema', 'settings', 'version'].sort().join('|')
        : ['activeDesignId', 'geometry', 'schema', 'settings', 'version'].sort().join('|');
      if (Object.keys(envelope).sort().join('|') !== expectedKeys) throw new Error('DiagView2 workspace snapshot contains unexpected fields.');
      restoredSettings = parseWorkspaceSettings(envelope.settings);
      if (!restoredSettings) throw new Error('Invalid DiagView2 workspace settings.');
      if (typeof envelope.activeDesignId !== 'string' || envelope.activeDesignId.length === 0) throw new Error('DiagView2 workspace activeDesignId is invalid.');
      activeDesignId = envelope.activeDesignId;
      geometryText = JSON.stringify(envelope.geometry);
      rawAnalyses = workspaceVersion === 4 ? envelope.analyses : [];
    }
    const store = parseDiagView2DesignFile(geometryText);
    const first = workspaceVersion > 0
      ? store.diagnostics.find((item) => item.id === activeDesignId)
      : store.diagnostics[0];
    if (!first) throw new Error('DiagView2 workspace activeDesignId does not match a unique diagnostic.');
    if (restoredSettings) {
      try {
        restoredSettings = { ...restoredSettings, slice: resolveDiagnosticSlice(first, restoredSettings.slice, store.diagnostics).slice };
      } catch (error) {
        sliceRestoreFailure = error instanceof Error ? error.message : String(error);
        restoredSettings = { ...restoredSettings, traceMode: 'source-cad', slice: { ...DEFAULT_SLICE } };
      }
    }
    const restoredAnalyses = workspaceVersion === 4 ? parseStoredAnalyses(rawAnalyses, store.diagnostics) : {};
    runtime?.clearDiagnosticSlice();
    commitAppliedSlice(DEFAULT_SLICE);
    setProject([...store.diagnostics]);
    setProjectResults(restoredAnalyses);
    setLaserText(laserTextFromDesign(first));
    setPlasmaContexts([]);
    if (restoredSettings) {
      setTab(restoredSettings.tab);
      setDepthMode(restoredSettings.depthMode);
      setShowLabels(restoredSettings.showLabels);
      setShowHits(restoredSettings.showHits);
      setTraceMode(restoredSettings.traceMode);
      setSliceKind(restoredSettings.slice.kind);
      setSliceOffset(restoredSettings.slice.offsetM);
      setSliceRotationDeg(restoredSettings.slice.rotationDeg);
      setSliceSide(restoredSettings.slice.side);
      commitAppliedSlice(restoredSettings.slice);
      setForwardSnapshot(restoredSettings.forward);
      setPortDisplay(restoredSettings.portDisplay);
      setViewerAppearance(restoredSettings.viewerAppearance);
      viewerStateKeyRef.current = JSON.stringify(restoredSettings.viewerState);
      setViewerState(restoredSettings.viewerState);
      if (runtime) {
        try {
          const resolvedSlice = applyStoredDiagnosticSlice(runtime, first, restoredSettings.slice, store.diagnostics);
          commitAppliedSlice(resolvedSlice);
        } catch (error) {
          runtime.clearDiagnosticSlice();
          commitAppliedSlice(DEFAULT_SLICE);
          setTraceMode('source-cad');
          setSliceKind('none');
          setSliceOffset(0);
          setSliceRotationDeg(0);
          setSliceSide('positive');
          sliceRestoreFailure = error instanceof Error ? error.message : String(error);
        }
      } else {
        pendingRestoredSlice.current = { design: first, slice: restoredSettings.slice };
      }
    } else {
      const nextViewerState = defaultViewerState();
      setTraceMode('source-cad');
      setSliceKind('none');
      setSliceOffset(0);
      setSliceRotationDeg(0);
      setSliceSide('positive');
      commitAppliedSlice(DEFAULT_SLICE);
      setForwardSnapshot(defaultForwardPanelSnapshot());
      setPortDisplay({ ...DEFAULT_PORT_DISPLAY });
      setViewerAppearance({ ...DEFAULT_VIEWER_APPEARANCE });
      viewerStateKeyRef.current = JSON.stringify(nextViewerState);
      setViewerState(nextViewerState);
    }
    setPhysicsResetRevision((current) => current + 1);
    setDesign(first);
    const restoredViewerContext = restoredSettings?.viewerState ?? defaultViewerState();
    const restoredSliceContext = restoredSettings?.slice ?? DEFAULT_SLICE;
    const storedActiveAnalysis = restoredAnalyses[first.id];
    const restoredActiveAnalysis = storedAnalysisMatchesContext(storedActiveAnalysis, first, runtime, restoredViewerContext, restoredSliceContext) ? storedActiveAnalysis : null;
    setResults(restoredActiveAnalysis ? [...restoredActiveAnalysis.results] : []);
    setCompletedTraceMode(restoredActiveAnalysis?.traceMode ?? null);
    setAnalysisState(restoredActiveAnalysis?.results.length ? 'ready' : 'idle');
    setMessage(sliceRestoreFailure
      ? ui(`保存的显示剖切不适用于当前诊断，已安全回到源 CAD：${sliceRestoreFailure}`, `The stored render slice does not apply to the current diagnostic; source-CAD mode was restored safely: ${sliceRestoreFailure}`)
      : restoredSettings
      ? restoredSettings.forward.geqdskDescriptor
        ? ui(`几何、端口显示、装置场景、剖切与物理设置已恢复；浏览器不能恢复 GEQDSK 文件句柄，请重新选择该文件。${storedActiveAnalysis ? (restoredActiveAnalysis ? '本会话内已验证的分析结果已恢复。' : '分析快照已作为未验证记录载入；请在当前公开 CAD 上重新计算求交后再生成正式报告。') : '文件中没有 CAD 分析快照。'}`, `Geometry, port display, device scene, slicing and physics settings were restored. Browser security cannot restore the GEQDSK file handle; reselect it. ${storedActiveAnalysis ? (restoredActiveAnalysis ? 'The analysis verified in this browser session was restored.' : 'The analysis snapshot was imported as an unverified record. Re-run the trace against the current published CAD before generating a formal report.') : 'The file contains no CAD analysis snapshot.'}`)
        : ui(`几何、端口显示、装置场景、剖切与物理设置已恢复；${storedActiveAnalysis ? (restoredActiveAnalysis ? '本会话内已验证的分析结果已恢复。' : '分析快照已作为未验证记录载入；请在当前公开 CAD 上重新计算求交后再生成正式报告。') : '文件中没有 CAD 分析快照。'}`, `Geometry, port display, device scene, slicing and physics settings were restored. ${storedActiveAnalysis ? (restoredActiveAnalysis ? 'The analysis verified in this browser session was restored.' : 'The analysis snapshot was imported as an unverified record. Re-run the trace against the current published CAD before generating a formal report.') : 'The file contains no CAD analysis snapshot.'}`)
      : store.migratedFromVersion === 2
        ? ui('v2 几何已校验并迁移为增强 v3。', 'v2 geometry validated and migrated to enhanced v3.')
        : ui('增强 v3 项目已导入；分析结果需重新计算。', 'Enhanced v3 project imported; analysis results must be recomputed.'));
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (!file) return; try { loadProject(await file.text()); } catch (error) { setAnalysisState('error'); setMessage(error instanceof Error ? error.message : String(error)); } }
  function changeType(type: DiagView2DiagnosticType) { const defaults = createDefaultDiagView2Design(type, design.id); setLaserText({ x: '', y: '', z: '' }); setDesign({ ...defaults, nameSuffix: design.nameSuffix.replace(/CAMERA|ARRAY|LASER/gi, type), placement: design.placement, localOffsetMm: design.localOffsetMm, worldOffsetMm: design.worldOffsetMm, rotationDeg: design.rotationDeg }); }
  function startNewDiagnostic() { snapshotCurrent(); runtime?.clearDiagnosticSlice(); commitAppliedSlice(DEFAULT_SLICE); setTraceMode('source-cad'); setSliceKind('none'); setSliceOffset(0); setSliceRotationDeg(0); setSliceSide('positive'); const id = `EHL2-${design.diagnosticType}-${crypto.randomUUID().slice(0, 8)}`; const next = createDefaultDiagView2Design(design.diagnosticType, id); setLaserText({ x: '', y: '', z: '' }); setDesign({ ...next, nameSuffix: id, placement: design.placement }); setMessage(ui('当前诊断已冻结为背景；显示剖切已清除，并创建了新的独立诊断。', 'The current diagnostic was frozen as background; render slicing was cleared and a new independent diagnostic was created.')); }
  function resetDiagnosticWorkspace() {
    traceAbort.current?.abort();
    traceAbort.current = null;
    pendingRestoredSlice.current = null;
    revision.current += 1;
    runtime?.clearDiagnosticSlice();
    commitAppliedSlice(DEFAULT_SLICE);
    const defaultPort = dataset?.records.find((item) => item.id === 'S2@270') ?? dataset?.records[0];
    const defaultDesign = createDefaultDiagView2Design('CAMERA', 'EHL2-CAMERA-01');
    setDesignState(defaultPort ? { ...defaultDesign, placement: portPlacement(defaultPort) } : defaultDesign);
    setProject([]);
    setProjectResults({});
    setResults([]);
    setCompletedTraceMode(null);
    setAnalysisState('idle');
    setMessage('');
    setLaserText({ x: '', y: '', z: '' });
    setDepthMode('physical');
    setShowLabels(true);
    setShowHits(true);
    setShowPptComposite(false);
    setPlasmaContexts([]);
    setForwardSnapshot(defaultForwardPanelSnapshot());
    setPortDisplay({ ...DEFAULT_PORT_DISPLAY });
    setViewerAppearance({ ...DEFAULT_VIEWER_APPEARANCE });
    const nextViewerState = defaultViewerState();
    viewerStateKeyRef.current = JSON.stringify(nextViewerState);
    setViewerState(nextViewerState);
    setTraceMode('source-cad');
    setSliceKind('none');
    setSliceOffset(0);
    setSliceRotationDeg(0);
    setSliceSide('positive');
    setPhysicsResetRevision((current) => current + 1);
    setTab('placement');
  }
  function loadPptScenario(scenario: (typeof EHL2_DIAGNOSTIC_SCENARIOS)[number]) { const phi = scenario.azimuthDeg * Math.PI / 180; const loaded = createDefaultDiagView2Design('CAMERA', `ppt-${scenario.id}`); setDesign({ ...loaded, nameSuffix: `${scenario.diagnosticId}-${scenario.azimuthDeg}-PPT-PLAN`, placement: { mode: 'explicit', positionM: [2.55 * Math.cos(phi), 2.55 * Math.sin(phi), 0], normal: [-Math.cos(phi), -Math.sin(phi), 0] }, camera: { hStartDeg: -50, hEndDeg: 50, vStartDeg: 0, vEndDeg: 0, lengthM: 3.2 } }); setTab('geometry'); setMessage(ui('已载入 PPT 平面参考；垂直视场仍为 0°，需由用户明确设置。', 'PPT planar reference loaded. Vertical FOV remains 0° until explicitly set by the user.')); }
  function applyLaserPath() { if (!design.laser) return; try { const x = splitNumbers(laserText.x), y = splitNumbers(laserText.y), z = splitNumbers(laserText.z); if (x.length !== y.length || x.length !== z.length) throw new Error(ui('X / Y / Z 列表长度必须一致。', 'X, Y and Z lists must have equal lengths.')); update((current) => ({ ...current, laser: { ...current.laser!, customPathPointsMm: x.length ? x.map((value, index) => [value, y[index], z[index]] as const) : null } })); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } }
  function activateTab(next: Tab) { setTab(next); if (next !== 'source') setShowPptComposite(false); }
  function moveTabFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    else return;
    event.preventDefault();
    const next = TABS[nextIndex];
    activateTab(next);
    tabRefs.current[nextIndex]?.focus();
  }
  if (!contract) return <div className={styles.contractError} role="alert">{ui('EHL‑2 诊断合同缺失，已停止加载。', 'The EHL-2 diagnostic contract is missing, so loading stopped.')}</div>;

  const hitResults = results.filter((item) => item.hasIntersection); const hitParts = [...new Set(hitResults.map((item) => item.hitModel).filter(Boolean))];
  return <div className={styles.root} data-diagnostic-type={design.diagnosticType.toLowerCase()}>
    <div className={`deviceViewport ${styles.viewport}`}>
      <TokamakCadViewer
        manifestUrl={device.viewer.manifestEndpoint ?? undefined}
        viewerId={device.id}
        sectionId={`${device.id}-workspace`}
        workspace
        showDownloadActions={false}
        showFootnotes={false}
        securityNotice={device.statement}
        appearancePreset="industrial-silver-v1"
        defaultClipping={false}
        diagnosticOverlayOptions={overlay}
        diagnosticViewerSettings={{ ...viewerAppearance, partOpacities: viewerState.partOpacities }}
        diagnosticViewerState={viewerState}
        onDiagnosticViewerStateChange={acceptViewerState}
        onDiagnosticRuntimeReady={handleDiagnosticRuntimeReady}
        viewportOverlay={portDisplay.showInfoPanel && pose ? <section className={styles.viewerInfoPanel} aria-label={ui('三维诊断信息面板', '3D diagnostic information panel')}>
          <b>EHL-2 · {portId === 'explicit' ? ui('显式位姿', 'EXPLICIT POSE') : portId}</b>
          <span>{ui('诊断类型', 'Diagnostic')}: {design.diagnosticType}</span>
          <span>{ui('光心 / mm', 'Centre / mm')}: {pose.positionM.map((item) => (item * 1000).toFixed(1)).join(' / ')}</span>
          <span>{ui('状态', 'Status')}: {analysisState === 'ready' ? ui('分析完成', 'ANALYSIS READY') : analysisState === 'error' ? ui('需要检查', 'CHECK REQUIRED') : ui('预览就绪', 'PREVIEW READY')}</span>
        </section> : null}
      />
    </div>
    <aside className={styles.workbench} aria-labelledby="ehl2-diagview-title">
      <header className={styles.header}><div><p>DIAGVIEW2 / EHL-2</p><h2 id="ehl2-diagview-title">{ui('完整诊断视角分析', 'Full diagnostic-view analysis')}</h2></div><label className={styles.visibilityToggle}><input type="checkbox" checked={display.visible} onChange={(event) => updateDisplay({ visible: event.currentTarget.checked })} /><span>{ui('三维光路', '3D paths')}</span></label></header>
      <div className={styles.boundaryBanner} role="note"><b>{ui('源算法复现 · 公开简化 CAD 上的虚拟输出', 'SOURCE RECONSTRUCTION · VIRTUAL OUTPUT ON PUBLIC SIMPLIFIED CAD')}</b><span>{ui('法兰、坐标、直线 LOS、首交与报告合同来自 digView2；结果不是实装测量、标定光学、净孔或工程可制造性结论。', 'Flanges, coordinates, straight LOS, first-hit and report contracts follow digView2. Results are not as-built survey, calibrated optics, clear-aperture or manufacturability conclusions.')}</span></div>
      <div className={styles.levelTabs} role="tablist" aria-label={ui('诊断工作台功能', 'Diagnostic workbench functions')}>{([['placement', ui('1 端口位姿', '1 Port & pose')], ['geometry', ui('2 诊断几何', '2 Geometry')], ['analysis', ui('3 CAD 分析', '3 CAD analysis')], ['files', ui('4 文件报告', '4 Files')], ['forward', ui('5 虚拟正向', '5 Forward')], ['source', ui('6 来源边界', '6 Source')]] as const).map(([id, label], index) => <button key={id} ref={(node) => { tabRefs.current[index] = node; }} id={`ehl2-diagview-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`ehl2-diagview-panel-${id}`} tabIndex={tab === id ? 0 : -1} className={tab === id ? styles.activeTab : ''} onKeyDown={(event) => moveTabFocus(event, index)} onClick={() => activateTab(id)}>{label}</button>)}</div>
      {(geometry.error || message) && <p className={styles.statusLine} data-state={geometry.error ? 'error' : analysisState} role={geometry.error || analysisState === 'error' ? 'alert' : 'status'} aria-live="polite">{geometry.error || message}</p>}
      <section className={styles.panel} role="tabpanel" id={`ehl2-diagview-panel-${tab}`} aria-labelledby={`ehl2-diagview-tab-${tab}`} tabIndex={0}><div className={styles.designHeader}><label><span>{ui('几何名称', 'Geometry name')}</span><input value={design.nameSuffix} maxLength={80} onChange={(event) => update((current) => ({ ...current, nameSuffix: event.currentTarget.value || current.nameSuffix }))} /></label><span className={styles.typeBadge} style={{ '--diag-color': colorCss } as CSSProperties}>{typeLabel(design.diagnosticType, english)}</span></div>

        {tab === 'placement' && <><SectionTitle index="01" title={ui('端口与光心位姿', 'Port and optical-centre pose')} detail={ui('41 条经审阅 EHL‑2_position 数值记录；公开资产不包含工作簿图片。', '41 reviewed EHL-2_position numeric rows; the public asset excludes the workbook image.')} />{datasetError && <p className={styles.errorText} role="alert">{datasetError}</p>}
          <div className={styles.controlGrid}><Select label={ui('法兰分区', 'Flange section')} value={section} disabled={!dataset} options={(['S1', 'S2', 'S3'] as Ehl2DiagView2PortSection[]).map((item) => ({ value: item, label: `${item} · ${dataset?.sectionCounts[item] ?? '—'}` }))} onChange={(value) => { const next = dataset?.records.find((item) => item.section === value); if (next) setDesign({ ...design, placement: portPlacement(next) }); }} /><Select label={ui('法兰 / 方位', 'Flange / azimuth')} value={portId} disabled={!dataset} options={[...(portId === 'explicit' ? [{ value: 'explicit', label: ui('显式位姿（请选择法兰以切回）', 'Explicit pose (choose a flange to return)') }] : []), ...sectionPorts.map((item) => ({ value: item.id, label: `${item.id} · θ=${item.poloidalNormalDeg}°` }))]} onChange={(value) => { const next = dataset?.records.find((item) => item.id === value); if (next) setDesign({ ...design, placement: portPlacement(next) }); }} /></div>
          {pose ? <Pose pose={pose} port={port} english={english} /> : <p className={styles.errorText} role="alert">{geometry.error}</p>}<Details title={ui('局部微调（源兼容）', 'Local fine tuning (source compatible)')} open><p className={styles.warning}>{ui('历史实现实际使用 −dR·n；此处仅为兼容保留反号。', 'The historical implementation applies −dR·n; the sign is retained only for compatibility.')}</p><Vector labels={['dR', 'dY', 'dZ']} unit="mm" value={design.localOffsetMm} ranges={[[-5000, 5000], [-5000, 5000], [-5000, 5000]]} step={1} onChange={(value) => update((current) => ({ ...current, localOffsetMm: value }))} /></Details>
          <Details title={ui('世界微调与绝对位姿', 'World offsets and explicit pose')} open={design.placement.mode === 'flange'}><Vector labels={['dX', 'dY', 'dZ']} unit="mm" value={design.worldOffsetMm} ranges={[[-5000, 5000], [-5000, 5000], [-5000, 5000]]} step={1} onChange={(value) => update((current) => ({ ...current, worldOffsetMm: value }))} />{flangeAbsoluteCentreMm && flangeAbsoluteCentreRanges && <><p className={styles.hint}>{ui('绝对光心 XYZ（mm）：编辑后仅反解世界偏移，法兰编号与角度来源保持不变。', 'Absolute optical-centre XYZ (mm): edits only solve the world offset; flange identity and angular provenance remain unchanged.')}</p><Vector labels={['X', 'Y', 'Z']} unit="mm" value={flangeAbsoluteCentreMm} ranges={flangeAbsoluteCentreRanges} step={1} onChange={(value) => update((current) => applyFlangeAbsoluteOpticalCentreMm(current, value))} /></>}<button className={styles.secondaryButton} type="button" disabled={!pose} onClick={() => { if (pose) setDesign({ ...design, placement: { mode: 'explicit', positionM: pose.positionM, normal: pose.normal }, localOffsetMm: [0, 0, 0], worldOffsetMm: [0, 0, 0] }); }}>{ui('固定为绝对位姿', 'Freeze as explicit pose')}</button>{design.placement.mode === 'explicit' && <><Vector labels={['X', 'Y', 'Z']} unit="m" value={design.placement.positionM} ranges={[[-20, 20], [-20, 20], [-20, 20]]} step={.001} onChange={(value) => update((current) => ({ ...current, placement: { mode: 'explicit', positionM: value, normal: current.placement.mode === 'explicit' ? current.placement.normal : [1, 0, 0] } }))} /><Vector labels={['nX', 'nY', 'nZ']} unit="unit" value={design.placement.normal} ranges={[[-1, 1], [-1, 1], [-1, 1]]} step={.001} onChange={(value) => update((current) => ({ ...current, placement: { mode: 'explicit', positionM: current.placement.mode === 'explicit' ? current.placement.positionM : [0, 0, 0], normal: value } }))} /></>}</Details>
          <Details title={ui('局部姿态', 'Local orientation')} open><Vector labels={[ui('俯仰 / u', 'Pitch / u'), ui('偏航 / v', 'Yaw / v'), ui('滚转 / n', 'Roll / n')]} unit="°" value={design.rotationDeg} ranges={[[-45, 45], [-45, 45], [-180, 180]]} step={.5} onChange={(value) => update((current) => ({ ...current, rotationDeg: value }))} /><p className={styles.hint}>R = R<sub>n</sub>(roll) · R<sub>u</sub>(pitch) · R<sub>v</sub>(yaw)</p></Details></>}

        {tab === 'geometry' && <><SectionTitle index="02" title={ui('诊断几何与显示', 'Diagnostic geometry and display')} detail={ui('参数变化只更新预览，不自动运行 247 万三角面 CAD 求交。', 'Parameter changes update only the preview and never auto-run the 2.47M-triangle CAD trace.')} /><div className={styles.typeSelector} role="group" aria-label={ui('诊断类型', 'Diagnostic type')}>{(['CAMERA', 'ARRAY', 'LASER'] as DiagView2DiagnosticType[]).map((type) => <button key={type} type="button" aria-pressed={design.diagnosticType === type} onClick={() => changeType(type)}>{typeLabel(type, english)}</button>)}</div>
          {design.camera && <div className={styles.parameterGrid}><NumberField label={ui('水平起始角', 'Horizontal start')} value={design.camera.hStartDeg} min={-180} max={180} step={.5} unit="°" onChange={(value) => update((current) => ({ ...current, camera: { ...current.camera!, hStartDeg: value } }))} /><NumberField label={ui('水平结束角', 'Horizontal end')} value={design.camera.hEndDeg} min={-180} max={180} step={.5} unit="°" onChange={(value) => update((current) => ({ ...current, camera: { ...current.camera!, hEndDeg: value } }))} /><NumberField label={ui('垂直起始角', 'Vertical start')} value={design.camera.vStartDeg} min={-89} max={89} step={.5} unit="°" onChange={(value) => update((current) => ({ ...current, camera: { ...current.camera!, vStartDeg: value } }))} /><NumberField label={ui('垂直结束角', 'Vertical end')} value={design.camera.vEndDeg} min={-89} max={89} step={.5} unit="°" onChange={(value) => update((current) => ({ ...current, camera: { ...current.camera!, vEndDeg: value } }))} /><NumberField label={ui('射线长度', 'Ray length')} value={design.camera.lengthM} min={.1} max={100} step={.5} unit="m" onChange={(value) => update((current) => ({ ...current, camera: { ...current.camera!, lengthM: value } }))} /></div>}
          {design.array && <div className={styles.parameterGrid}><NumberField label={ui('阵列起始角', 'Array start')} value={design.array.vStartDeg} min={-89} max={89} step={.5} unit="°" onChange={(value) => update((current) => ({ ...current, array: { ...current.array!, vStartDeg: value } }))} /><NumberField label={ui('阵列结束角', 'Array end')} value={design.array.vEndDeg} min={-89} max={89} step={.5} unit="°" onChange={(value) => update((current) => ({ ...current, array: { ...current.array!, vEndDeg: value } }))} /><NumberField label={ui('通道数', 'Channels')} value={design.array.rayCount} min={2} max={201} step={1} unit="" onChange={(value) => update((current) => ({ ...current, array: { ...current.array!, rayCount: Math.round(value) } }))} /><NumberField label={ui('射线长度', 'Ray length')} value={design.array.lengthM} min={.1} max={100} step={.5} unit="m" onChange={(value) => update((current) => ({ ...current, array: { ...current.array!, lengthM: value } }))} /></div>}
          {design.laser && <><div className={styles.parameterGrid}><NumberField label={ui('束径', 'Beam diameter')} value={design.laser.diameterMm} min={0} max={5000} step={10} unit="mm" onChange={(value) => update((current) => ({ ...current, laser: { ...current.laser!, diameterMm: value } }))} /><NumberField label={ui('默认长度', 'Default length')} value={design.laser.lengthM} min={.1} max={100} step={.5} unit="m" onChange={(value) => update((current) => ({ ...current, laser: { ...current.laser!, lengthM: value } }))} /></div><fieldset className={styles.pathEditor}><legend>{ui('绝对世界坐标折线路径（mm）', 'Absolute world polyline (mm)')}</legend>{(['x', 'y', 'z'] as const).map((axis) => <label key={axis}><span>{axis.toUpperCase()}</span><textarea rows={2} value={laserText[axis]} onChange={(event) => setLaserText((current) => ({ ...current, [axis]: event.currentTarget.value }))} /></label>)}<button className={styles.secondaryButton} type="button" onClick={applyLaserPath}>{ui('应用折线路径', 'Apply polyline')}</button><small>{ui('绝对点不随局部旋转；原代码不对 LASER 做 CAD 求交或线积分。', 'Absolute points do not follow local rotation; the source does not CAD-trace or line-integrate LASER.')}</small></fieldset></>}
          <fieldset className={styles.displayControls}><legend>{ui('叠加显示', 'Overlay display')}</legend><label><input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.currentTarget.checked)} />{ui('名称标签', 'Name label')}</label><label><input type="checkbox" checked={showHits} onChange={(event) => setShowHits(event.currentTarget.checked)} />{ui('交点标记', 'Hit markers')}</label><label className={styles.colorControl}><input type="color" value={colorCss} onChange={(event) => updateDisplay({ colorHex: event.currentTarget.value })} /><span>{ui('射线颜色', 'Ray colour')}</span><button type="button" onClick={() => updateDisplay({ colorHex: defaultColor[1] })}>{ui('默认', 'Default')}</button></label><NumberField label={ui('不透明度', 'Opacity')} value={display.opacity} min={.1} max={1} step={.05} unit="" onChange={(value) => updateDisplay({ opacity: value })} /><Metrics items={[[ui('预览射线', 'Preview rays'), preview.length || '—'], [ui('分析射线', 'Analysis rays'), geometry.traceCount ?? ui('不适用', 'N/A')]]} /><small>{ui('颜色、不透明度与可见性随增强 v3 的每个诊断保存。', 'Colour, opacity and visibility are saved per diagnostic in enhanced v3.')}</small></fieldset>
          <Details title={ui('源前端显示与场景光照', 'Source display and scene lighting')}>
            <fieldset className={styles.displayControls}>
              <legend>{ui('视场线与信息面板', 'View-line and information panel')}</legend>
              <label><input type="checkbox" checked={portDisplay.visible} onChange={(event) => setPortDisplay((current) => ({ ...current, visible: event.currentTarget.checked }))} />{ui('显示当前法兰中心与法线', 'Show current flange centre and normal')}</label>
              <Select label={ui('法兰标记范围', 'Flange-marker scope')} value={portDisplay.scope} disabled={!portDisplay.visible} options={[{ value: 'selected', label: ui('当前选中（源代码默认）', 'Selected only (source default)') }, { value: 'all', label: ui('全部 41 个设计法兰', 'All 41 design flanges') }]} onChange={(value) => setPortDisplay((current) => ({ ...current, scope: value as PortDisplaySettings['scope'] }))} />
              <label><input type="checkbox" checked={portDisplay.showInfoPanel} onChange={(event) => setPortDisplay((current) => ({ ...current, showInfoPanel: event.currentTarget.checked }))} />{ui('Info 面板', 'Information panel')}</label>
              <NumberField label={ui('法兰中心透明度', 'Flange-centre opacity')} value={portDisplay.opacity} min={0} max={1} step={.05} unit="α" disabled={!portDisplay.visible} onChange={(value) => setPortDisplay((current) => ({ ...current, opacity: value }))} />
              <small>{ui('“当前选中”精确复现原始 show_view_lines：显示当前法兰中心、0.2 m 法线指示和诊断光路。“全部 41 个”是为网页总览增加的显式扩展。', '“Selected only” reproduces the source show_view_lines control: the selected flange centre, its 0.2 m normal indicator and the diagnostic path. “All 41” is an explicit browser overview extension.')}</small>
            </fieldset>
            <fieldset className={styles.displayControls}>
              <legend>{ui('场景光照', 'Scene lighting')}</legend>
              <Select label={ui('环境映射', 'Environment map')} value={viewerAppearance.environmentPreset} options={[{ value: 'room-platform-substitute', label: ui('RoomEnvironment（city HDRI 平台替代）', 'RoomEnvironment (platform substitute for city HDRI)') }, { value: 'none', label: ui('关闭环境映射', 'No environment map') }]} onChange={(value) => setViewerAppearance((current) => ({ ...current, environmentPreset: value as ViewerAppearanceSettings['environmentPreset'] }))} />
              <NumberField label={ui('环境光强度', 'Environment intensity')} value={viewerAppearance.environmentIntensity} min={0} max={5} step={.1} unit="×" disabled={viewerAppearance.environmentPreset === 'none'} onChange={(value) => setViewerAppearance((current) => ({ ...current, environmentIntensity: value }))} />
              <label><input type="checkbox" checked={viewerAppearance.defaultLightsEnabled} onChange={(event) => setViewerAppearance((current) => ({ ...current, defaultLightsEnabled: event.currentTarget.checked }))} />{ui('启用默认灯光', 'Enable default lights')}</label>
              <label><input type="checkbox" checked={viewerAppearance.backgroundEnabled} onChange={(event) => setViewerAppearance((current) => ({ ...current, backgroundEnabled: event.currentTarget.checked }))} />{ui('显示环境背景', 'Show environment background')}</label>
              <NumberField label={ui('背景亮度', 'Background intensity')} value={viewerAppearance.backgroundIntensity} min={0} max={5} step={.1} unit="×" disabled={!viewerAppearance.backgroundEnabled} onChange={(value) => setViewerAppearance((current) => ({ ...current, backgroundIntensity: value }))} />
              <NumberField label={ui('背景模糊', 'Background blurriness')} value={viewerAppearance.backgroundBlurriness} min={0} max={1} step={.05} unit="ratio" disabled={!viewerAppearance.backgroundEnabled} onChange={(value) => setViewerAppearance((current) => ({ ...current, backgroundBlurriness: value }))} />
              <label><input type="checkbox" checked={viewerAppearance.castShadow} onChange={(event) => setViewerAppearance((current) => ({ ...current, castShadow: event.currentTarget.checked }))} />{ui('启用实时阴影', 'Cast real-time shadows')}</label>
              <small>{ui('源端 city HDRI 不随仓发布；此处使用 Three.js RoomEnvironment 作为明确标注的平台替代，不宣称 HDRI 像素等价。', 'The source city HDRI is not published with the repository. Three.js RoomEnvironment is an explicitly labelled platform substitute, not pixel-equivalent HDRI reconstruction.')}</small>
              <button className={styles.secondaryButton} type="button" onClick={() => setViewerAppearance({ ...DEFAULT_VIEWER_APPEARANCE })}>{ui('恢复装置渲染默认值', 'Restore device-render defaults')}</button>
            </fieldset>
            <fieldset className={styles.partControls}>
              <legend>{ui('公开 CAD 部件显隐与透明度', 'Published CAD part visibility and opacity')}</legend>
              {EHL2_VIEWER_PARTS.map((part) => {
                const hidden = viewerState.hiddenPartIds.includes(part.id);
                return <div className={styles.partControlRow} key={part.id}>
                  <label><input type="checkbox" checked={!hidden} onChange={(event) => changeViewerState((current) => ({ ...current, hiddenPartIds: event.currentTarget.checked ? current.hiddenPartIds.filter((id) => id !== part.id) : [...current.hiddenPartIds.filter((id) => id !== part.id), part.id].sort(), isolatedPartIds: [] }))} /><span>{english ? part.en : part.zh}</span></label>
                  <NumberField label="α" value={viewerState.partOpacities[part.id] ?? part.opacity} min={0} max={1} step={.05} unit="" disabled={hidden} onChange={(value) => changeViewerState((current) => ({ ...current, partOpacities: { ...current.partOpacities, [part.id]: value } }))} />
                </div>;
              })}
              <small>{ui('公开简化 CAD 与源仓库历史模型不是同一资产集合；透明度按可对应语义迁移，固定限制器使用 1.0。', 'The public simplified CAD is not the same asset set as the historical source models. Opacity defaults are mapped by matching semantics; the fixed limiter uses 1.0.')}</small>
              <button className={styles.secondaryButton} type="button" onClick={() => changeViewerState((current) => ({ ...current, hiddenPartIds: [], isolatedPartIds: [], partOpacities: { ...DEFAULT_PART_OPACITIES } }))}>{ui('恢复部件显示默认值', 'Restore part display defaults')}</button>
            </fieldset>
          </Details></>}

        {tab === 'analysis' && <><SectionTitle index="03" title={ui('CAD 首交与显示剖切', 'CAD first-hit and render slicing')} detail={ui('点击后才计算；BVH 首次建立后复用，并保留部件、三角面、法向和入射角。', 'Calculation runs only on request. BVHs are reused and results retain part, triangle, normal and incidence angle.')} /><Select label={ui('求交对象', 'Intersection target')} value={traceMode} options={[{ value: 'source-cad', label: ui('全部源 CAD（与显示无关）', 'All source CAD (display independent)') }, { value: 'render-state', label: ui('当前可见 / 剖切状态', 'Current visible / clipped state') }]} onChange={(value) => { const next = value as TraceMode; if (next !== traceMode) { traceAbort.current?.abort(); traceAbort.current = null; inFlightTraceMode.current = null; revision.current += 1; setTraceMode(next); setResults([]); setCompletedTraceMode(null); setAnalysisState('idle'); setProjectResults((current) => { const copy = { ...current }; delete copy[design.id]; return copy; }); setMessage(ui('求交对象已改变；正在运行或已完成的旧结果已失效，请重新计算。', 'Intersection target changed; any running or completed prior trace was invalidated. Recalculate the trace.')); } }} /><p className={styles.hint}>{traceMode === 'source-cad' ? ui('默认复现原始 DiagView2：隐藏部件与显示剖切不会改变科学求交。', 'Source-compatible default: hidden parts and render clipping do not alter scientific intersections.') : ui('探索模式会使用当前可见部件和渲染剖切；结果不等同源代码默认。', 'Exploration mode uses current visibility and render clipping; it is not the source default.')}</p>{completedTraceMode && <p className={styles.hint}><b>{ui('当前结果上下文', 'Current result context')}:</b> {completedTraceMode === 'source-cad' ? ui('全部源 CAD', 'all source CAD') : ui('探索性当前渲染状态', 'exploratory current render state')}</p>}<div className={styles.analysisActions}><button className={styles.primaryButton} type="button" disabled={!runtime || Boolean(geometry.error) || design.diagnosticType === 'LASER' || analysisState === 'building' || analysisState === 'tracing'} onClick={runTrace}>{analysisState === 'building' ? ui('建立 BVH…', 'Building BVH…') : analysisState === 'tracing' ? ui('计算交点…', 'Tracing…') : ui('计算射线最近交点', 'Calculate nearest ray hits')}</button><button className={styles.secondaryButton} type="button" onClick={cancelTrace}>{ui('取消', 'Cancel')}</button></div>{!message && !geometry.error && <p className={styles.hint}>{ui('滑块只更新预览，不自动求交。', 'Sliders update only the preview and never auto-trace.')}</p>}
          <div className={styles.depthMode} role="group" aria-label={ui('射线深度显示', 'Ray depth display')}><button type="button" aria-pressed={depthMode === 'physical'} onClick={() => setDepthMode('physical')}>{ui('截断到 CAD 首交', 'Stop at first hit')}</button><button type="button" aria-pressed={depthMode === 'xray'} onClick={() => setDepthMode('xray')}>{ui('显示完整射线', 'Show full rays')}</button></div><Metrics items={[[ui('分析射线', 'Analysed rays'), results.length || '—'], [ui('命中', 'Hits'), results.length ? hitResults.length : '—'], [ui('部件', 'Parts'), hitParts.length || '—']]} />{hitParts.length > 0 && <div className={styles.hitSummary}>{hitParts.map((part) => <span key={part!}>{part} <b>{hitResults.filter((item) => item.hitModel === part).length}</b></span>)}</div>}{results.length > 0 && <ResultTable results={results} english={english} />}
          <fieldset className={styles.sliceControls}><legend>{ui('显示剖切（不生成封口）', 'Render slicing (no caps)')}</legend><Select label={ui('剖切类型', 'Slice type')} value={sliceKind} options={[{ value: 'none', label: ui('无', 'None') }, { value: 'source-xy', label: ui('DiagView2 XY 水平面', 'DiagView2 XY plane') }, { value: 'rotated-xz', label: ui('旋转 XZ 平面', 'Rotated XZ plane') }, { value: 'array-plane', label: ui('旋转后的阵列射线平面', 'Rotated array-ray plane') }, { value: 'camera-frustum', label: ui('相机有限六平面视锥', 'Finite six-plane camera frustum') }]} onChange={(value) => setSliceKind(value as SliceKind)} /><NumberField label={ui('平面偏移', 'Plane offset')} value={sliceOffset} min={-5} max={5} step={.01} unit="m" onChange={setSliceOffset} />{sliceKind === 'rotated-xz' && <NumberField label={ui('XZ 旋转角', 'XZ rotation')} value={sliceRotationDeg} min={-360} max={360} step={1} unit="°" onChange={setSliceRotationDeg} />}<Select label={ui('保留半空间', 'Retained half-space')} value={sliceSide} options={[{ value: 'positive', label: ui('正侧', 'Positive') }, { value: 'negative', label: ui('负侧', 'Negative') }]} onChange={(value) => setSliceSide(value as 'positive' | 'negative')} /><div className={styles.analysisActions}><button className={styles.secondaryButton} type="button" disabled={!runtime} onClick={applySlice}>{ui('应用剖切', 'Apply slice')}</button><button className={styles.secondaryButton} type="button" disabled={!runtime} onClick={clearDiagnosticSlice}>{ui('清除', 'Clear')}</button></div><small>{ui('阵列平面使用 pitch / yaw / roll 后的 r_u；旋转 XZ 使用源公式 [−sinθ, cosθ, 0]。仅改变显示表面。', 'The array plane uses r_u after pitch/yaw/roll; rotated XZ uses the source formula [-sinθ, cosθ, 0]. Rendered surfaces only.')}</small></fieldset></>}

        {tab === 'files' && <><SectionTitle index="04" title={ui('几何项目、快照与报告', 'Geometry project, snapshot and report')} detail={ui('兼容原 v2 / 增强 v3；工作区 v4 保存绑定公开 CAD 指纹的分析快照，但导入后必须重新求交才能生成正式报告。', 'Supports source v2 and enhanced v3. Workspace v4 preserves analysis snapshots bound to the published-CAD fingerprint, but imported hits must be re-traced before formal reporting.')} /><div className={styles.fileActions}><button className={styles.primaryButton} type="button" disabled={Boolean(geometry.error)} onClick={() => { snapshotCurrent(); setMessage(ui('已更新项目快照。', 'Project snapshot updated.')); }}>{ui('加入 / 更新快照', 'Add / update snapshot')}</button><button className={styles.primaryButton} type="button" disabled={Boolean(geometry.error)} onClick={startNewDiagnostic}>{ui('冻结并新建诊断', 'Freeze and create diagnostic')}</button><button className={styles.secondaryButton} type="button" disabled={Boolean(geometry.error)} onClick={() => runSafeUiAction(() => downloadText('EHL2_DiagView2_v3.json', serializeDiagView2DesignFile(allDesigns, { deviceId: 'ehl-2-preliminary' }), 'application/json;charset=utf-8'))}>{ui('下载 v3 JSON', 'Download v3 JSON')}</button><button className={styles.secondaryButton} type="button" disabled={Boolean(geometry.error)} onClick={() => runSafeUiAction(() => downloadText('EHL2_DiagView2_v2.json', legacyV2(allDesigns), 'application/json;charset=utf-8'))}>{ui('下载 v2 JSON', 'Download v2 JSON')}</button><button className={styles.secondaryButton} type="button" disabled={Boolean(geometry.error)} onClick={() => runSafeUiAction(() => downloadText('EHL2_DiagView2_workspace_v4.json', serializeWorkspace(), 'application/json;charset=utf-8'))}>{ui('下载工作区 v4', 'Download workspace v4')}</button><button className={styles.secondaryButton} type="button" disabled={Boolean(geometry.error)} onClick={() => runSafeUiAction(() => downloadText('EHL2_DiagView2_analysis.json', analysisBundle(), 'application/json;charset=utf-8'))}>{ui('下载项目分析包', 'Download project analysis bundle')}</button><button className={styles.secondaryButton} type="button" disabled={Boolean(geometry.error)} onClick={() => runSafeUiAction(() => downloadText('EHL2_DiagView2_project-report.html', combinedProjectReport(), 'text/html;charset=utf-8'))}>{ui('下载多诊断 HTML', 'Download multi-diagnostic HTML')}</button><button className={styles.secondaryButton} type="button" onClick={() => importRef.current?.click()}>{ui('导入 v2 / v3 / 工作区', 'Import v2 / v3 / workspace')}</button><input ref={importRef} className={styles.hiddenInput} type="file" accept="application/json,.json" onChange={importFile} /></div><ProjectList designs={project} currentId={design.id} english={english} onSelect={selectProjectDesign} onRemove={(id) => { setProject((current) => current.filter((item) => item.id !== id)); setProjectResults((current) => { const next = { ...current }; delete next[id]; return next; }); }} />
          <Details title={ui('当前诊断分析报告', 'Current diagnostic analysis report')} open><p className={styles.hint}>{reportReady ? ui('报告使用本次已完成的源 CAD 求交，不会把“未计算”写成“未命中”。', 'The report uses the completed source-CAD trace and never serializes “not run” as “miss”.') : laserReportReady ? ui('LASER 导出光心、束径与绝对路径段；交点状态明确为“不适用”，不会伪装成未命中。', 'The LASER report exports optical centre, diameter and absolute path segments. Intersection status is explicitly “not applicable”, never a fabricated miss.') : analysisAvailable && completedTraceMode === 'render-state' ? ui('当前结果基于未冻结的渲染状态，仅供探索；请切换“全部源 CAD”并重新计算后导出正式报告。', 'The current result uses an unfrozen render state and is exploratory only. Re-run against all source CAD before exporting a formal report.') : ui('请先在“CAD 分析”以“全部源 CAD”模式完成求交，再导出正式报告。', 'Complete CAD analysis in “all source CAD” mode before exporting a formal report.')}</p><div className={styles.fileActions}><button className={styles.secondaryButton} type="button" disabled={!reportExportReady} onClick={() => runSafeUiAction(() => downloadText(`${design.nameSuffix}.json`, reportToJson(report()), 'application/json;charset=utf-8'))}>JSON</button><button className={styles.secondaryButton} type="button" disabled={!reportExportReady} onClick={() => runSafeUiAction(() => downloadText(`${design.nameSuffix}.csv`, reportToCsv(report()), 'text/csv;charset=utf-8'))}>CSV</button><button className={styles.secondaryButton} type="button" disabled={!reportExportReady} onClick={() => runSafeUiAction(() => downloadText(`${design.nameSuffix}.html`, reportToHtml(report()), 'text/html;charset=utf-8'))}>HTML</button><button className={styles.secondaryButton} type="button" disabled={!runtime} onClick={async () => { if (!runtime) return; try { const image = await runtime.capturePng(); downloadBlob(`${design.nameSuffix}-viewer.png`, image.blob); } catch (error) { setAnalysisState('error'); setMessage(error instanceof Error ? error.message : String(error)); } }}>{ui('当前三维视图 PNG', 'Current 3D view PNG')}</button><button className={styles.secondaryButton} type="button" disabled={!runtime || !design.camera || design.camera.hStartDeg >= design.camera.hEndDeg || design.camera.vStartDeg >= design.camera.vEndDeg} onClick={async () => { if (!runtime || !design.camera) return; try { const image = await runtime.captureDiagnosticViewPng({ ...cameraCaptureFrame(design), hStartDeg: design.camera.hStartDeg, hEndDeg: design.camera.hEndDeg, vStartDeg: design.camera.vStartDeg, vEndDeg: design.camera.vEndDeg, farMetres: design.camera.lengthM }); downloadBlob(`${design.nameSuffix}-uncalibrated-optical-view.png`, image.blob); setMessage(ui('已导出未标定的离轴透视光心视图。', 'Uncalibrated off-axis optical-centre view exported.')); } catch (error) { setAnalysisState('error'); setMessage(error instanceof Error ? error.message : String(error)); } }}>{ui('相机光心视图 PNG', 'Camera optical-centre PNG')}</button></div><p className={styles.hint}>{ui('光心 PNG 复现非对称视场投影，但不是探测器标定图像。', 'The optical-centre PNG preserves asymmetric FOV projection but is not a calibrated detector image.')}</p></Details>
          <Details title={ui('显式浏览器保存', 'Explicit browser save')}><p className={styles.hint}>{ui('仅点击后把几何、经 CAD 指纹绑定的分析快照、端口标记、部件状态、自由相机视角、已应用剖切和虚拟物理设置写入 localStorage；不上传服务器。GEQDSK 文件句柄仍需重新选择。', 'Only an explicit click writes geometry, CAD-fingerprint-bound analysis snapshots, port markers, part state, free-orbit camera view, the applied slice and virtual-physics settings to localStorage. Nothing is uploaded. The GEQDSK file handle must still be reselected.')}</p><div className={styles.analysisActions}><button className={styles.secondaryButton} type="button" disabled={Boolean(geometry.error)} onClick={() => runSafeUiAction(() => localStorage.setItem(STORAGE_KEY, serializeWorkspace()), ui('工作区 v4 已保存到本浏览器。', 'Workspace v4 was saved in this browser.'))}>{ui('保存工作区', 'Save workspace')}</button><button className={styles.secondaryButton} type="button" onClick={() => runSafeUiAction(() => { const text = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY); if (!text) throw new Error(ui('无已保存工作区。', 'No saved workspace.')); loadProject(text); })}>{ui('恢复工作区', 'Restore workspace')}</button></div></Details><Details title={ui('复位诊断工作区', 'Reset diagnostic workspace')}><p className={styles.warning}>{ui('清除本页的诊断快照、CAD 结果、剖切和虚拟正向状态，并返回默认 Camera / S2@270；不会改动设备级安全、授权配置或已显式保存的浏览器副本。', 'Clears this page\'s diagnostic snapshots, CAD results, slicing and virtual-forward state, then returns to the default Camera / S2@270. Device-level safety, authorization settings and explicitly saved browser copies are unchanged.')}</p><button className={styles.secondaryButton} type="button" onClick={resetDiagnosticWorkspace}>{ui('复位诊断工作区', 'Reset diagnostic workspace')}</button></Details></>}

        <div hidden={tab !== 'forward'}><ForwardPanel key={`${physicsResetRevision}:${design.id}`} design={design} english={english} initialSnapshot={forwardSnapshot} onSnapshotChange={setForwardSnapshot} onPlasmaContextsChange={setPlasmaContexts} /></div>
        {tab === 'source' && <><SectionTitle index="06" title={ui('来源、PPT 预设与能力边界', 'Source, PPT presets and capability boundary')} detail={ui('PPT 五方案保留为可载入的平面参考；主工作台来自 digView2 源代码和 41 个法兰记录。', 'The five PPT scenarios remain loadable planar references; the main workbench follows digView2 source and 41 flange records.')} /><div className={styles.analysisActions}><button className={styles.secondaryButton} type="button" aria-pressed={showPptComposite} onClick={() => setShowPptComposite((current) => !current)}>{showPptComposite ? ui('返回当前诊断几何', 'Return to current geometry') : ui('查看 PPT 四方案复合', 'View four-scenario PPT composite')}</button></div><SourceTable english={english} onLoadScenario={loadPptScenario} /><section className={styles.provenance}><h3>{ui('复现矩阵与非目标', 'Reconstruction matrix and non-goals')}</h3><ul><li><b>{ui('代码', 'Code')}</b><span>{EHL2_DIAGVIEW2_SOURCE.branch} @ {contract.sourceRevision}</span></li><li><b>{ui('端口', 'Ports')}</b><span>{ui('41 条历史设计记录；不是实测。', '41 historical design rows; not surveyed.')}</span></li><li><b>{ui('已复现', 'Reproduced')}</b><span>Camera 41/141 · Array 2–201 · Laser path · R<sub>n</sub>R<sub>u</sub>R<sub>v</sub> · BVH first hit · render slicing · v2/v3 · JSON/CSV/HTML · broadband / spectral settings · manual relative line weight · virtual R–Z forward</span></li><li><b>{ui('保留但阻断', 'Reproduced but blocked')}</b><span>{ui('Te / ne、元素、杂质比例、PEC、离子丰度和谱线预设均可编辑/导入/导出；CHERAB / OpenADAS 与绝对辐射率因缺少经审核的 Python 运行时和原子数据而不执行。', 'Te/ne, element, impurity fraction, PEC, ion fraction and line presets are editable/importable/exportable; CHERAB/OpenADAS and absolute emissivity are not executed without a reviewed Python runtime and atomic data.')}</span></li><li><b>{ui('不包含', 'Not included')}</b><span>{ui('窗口/孔径、反射折射、PSF/MTF、étendue、标定、误差预算、探测器响应、工程净孔和 LASER 遮挡。', 'Windows/apertures, reflection/refraction, PSF/MTF, étendue, calibration, error budgets, detector response, engineering clear aperture and LASER occlusion.')}</span></li></ul><p className={styles.contractStatement}>{english ? contract.statement : '在公开简化 CAD 上复现 DiagView2 几何与虚拟分析；不构成实装、标定光学、净孔、工程遮挡或实验测量的权威结论。'}</p></section></>}
        {tab === 'source' && <SourceParitySummary english={english} />}
      </section>
    </aside>
  </div>;
}

export function Ehl2DiagnosticNoScriptSummary() { const { locale } = useI18n(); const english = locale === 'en'; return <section className={styles.noScriptSummary}><h2>{english ? 'EHL-2 DiagView2 diagnostic-analysis contract' : 'EHL‑2 DiagView2 诊断分析合同'}</h2><p>{english ? 'JavaScript is unavailable. Interactive geometry, CAD BVH and the virtual forward model remain off. Reviewed scope: 41 flange rows, CAMERA, ARRAY, LASER and five PPT source scenarios.' : '当前未启用 JavaScript，交互几何、CAD BVH 与虚拟正向模型保持关闭。经审阅范围：41 条法兰记录、CAMERA、ARRAY、LASER 与 PPT 五个来源方案。'}</p><SourceTable english={english} /></section>; }

function SourceParitySummary({ english }: { english: boolean }) {
  const ui = (zh: string, en: string) => english ? en : zh;
  return <section className={styles.provenance} aria-labelledby="diagview2-parity-title">
    <h3 id="diagview2-parity-title">{ui('完整前端复现说明', 'Full front-end reconstruction notes')}</h3>
    <ul>
      <li><b>{ui('几何与 CAD', 'Geometry and CAD')}</b><span>Camera 41 / 141 · Array 2–201 · Laser polyline · R<sub>n</sub>R<sub>u</sub>R<sub>v</sub> · BVH first hit · finite frustum · render slicing · asymmetric optical-centre PNG</span></li>
      <li><b>{ui('项目与报告', 'Project and reports')}</b><span>{ui('v2 / 增强 v3、多诊断叠加、源 CAD 分析包、单诊断 JSON / CSV / HTML、多诊断 HTML。', 'v2 / enhanced v3, multi-diagnostic overlays, source-CAD analysis bundles, per-diagnostic JSON / CSV / HTML and combined HTML.')}</span></li>
      <li><b>{ui('物理与前端', 'Physics and front end')}</b><span>{ui('宽带 / 谱线设置、Te / ne / PEC / 离子丰度、参数化 R0 / a / κ / δ 与约 10 层 GEQDSK 磁通面三维上下文、5 mm 虚拟 R–Z 线积分、径向与二维场图、全通道表、JSON / MATLAB / SVG 导出。', 'Broadband/spectral settings, Te/ne/PEC/ion fraction, parametric R0/a/κ/δ and an approximately ten-layer GEQDSK flux-surface 3D context, 5 mm virtual R-Z line integration, radial and 2D field plots, all-channel tables, and JSON/MATLAB/SVG exports.')}</span></li>
      <li><b>{ui('平台等价设置', 'Platform-equivalent settings')}</b><span>{ui('当前/41 端口标记、Info 面板、部件检索/显隐/隔离/透明度、XYZ 剖切、自由相机视角、自动旋转、全屏、环境映射/强度/背景模糊与实时阴影均可操作并恢复。装置默认采用与 EXL‑50U 一致的全不透明工业渲染，不继承源程序的逐部件透明度；源 city HDRI 像素未随仓发布，Three RoomEnvironment 明确标为平台替代。', 'Selected/all-41 port markers, the information panel, part search/visibility/isolation/opacity, XYZ clipping, free-orbit camera view, auto-rotation, fullscreen, environment map/intensity/background blur and real-time shadows are controllable and restorable. The device starts with the same fully opaque industrial rendering as EXL-50U instead of inheriting the source app\'s per-part transparency. The source city HDRI pixels are not published; Three RoomEnvironment is explicitly labelled as a platform substitute.')}</span></li>
    </ul>
  </section>;
}

function typeLabel(type: DiagView2DiagnosticType, english: boolean) { return type === 'CAMERA' ? (english ? 'Camera / finite FOV' : '相机 / 有限视场') : type === 'ARRAY' ? (english ? 'Ray array' : '射线阵列') : (english ? 'Laser path' : '激光路径'); }
function SectionTitle({ index, title, detail }: { index: string; title: string; detail: string }) { return <header className={styles.sectionTitle}><span>{index}</span><div><h3>{title}</h3><p>{detail}</p></div></header>; }
function Details({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) { return <details className={styles.group} open={open}><summary>{title}</summary>{children}</details>; }
function NumberField({ label, value, min, max, step, unit, disabled, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; disabled?: boolean; onChange: (value: number) => void }) { return <label className={styles.numberControl}><span>{label}</span><span><input type="number" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Math.min(max, Math.max(min, finite(event.currentTarget.value, value))))} /><i>{unit}</i></span></label>; }
function Select({ label, value, options, disabled, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; disabled?: boolean; onChange: (value: string) => void }) { return <label className={styles.selectControl}><span>{label}</span><select value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function Vector({ labels, unit, value, ranges, step, onChange }: { labels: readonly string[]; unit: string; value: DiagView2Vec3; ranges: readonly (readonly [number, number])[]; step: number; onChange: (value: DiagView2Vec3) => void }) { return <div className={styles.vectorEditor}>{labels.map((label, index) => <NumberField key={label} label={label} value={value[index]} min={ranges[index][0]} max={ranges[index][1]} step={step} unit={unit} onChange={(next) => onChange(tupleAt(value, index, next))} />)}</div>; }
function Pose({ pose, port, english }: { pose: ReturnType<typeof resolveDiagView2Pose>; port: Ehl2DiagView2Port | null; english: boolean }) { const ui = (zh: string, en: string) => english ? en : zh; return <dl className={styles.poseReadout}><div><dt>{ui('来源', 'Source')}</dt><dd>{port ? `${port.id} · ${port.sourceCellRange}` : ui('显式位姿', 'Explicit pose')}</dd></div><div><dt>{ui('光心 / m', 'Centre / m')}</dt><dd>{pose.positionM.map((item) => item.toFixed(4)).join(' / ')}</dd></div><div><dt>{ui('法线 n', 'Normal n')}</dt><dd>{pose.normal.map((item) => item.toFixed(5)).join(' / ')}</dd></div><div><dt>{ui('网页坐标 / m', 'Web frame / m')}</dt><dd>{diagView2PointToEhl2Web(pose.positionM).map((item) => item.toFixed(4)).join(' / ')}</dd></div></dl>; }
function Metrics({ items }: { items: readonly (readonly [string, string | number])[] }) { return <div className={styles.metricStrip}>{items.map(([label, value]) => <span key={label}>{label}<b>{value}</b></span>)}</div>; }
function channelPolyline(values: ArrayLike<number>, left: number, top: number, width: number, height: number) {
  const samples = Array.from(values, (value) => Number.isFinite(value) && value > 0 ? value : 0);
  const maximum = Math.max(0, ...samples);
  return samples.map((value, index) => {
    const x = left + (samples.length <= 1 ? width / 2 : index * width / (samples.length - 1));
    const y = top + height - (maximum > 0 ? value / maximum : 0) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}
function ChannelSignalChart({ output, english }: { output: ForwardRunOutput; english: boolean }) {
  const ui = (zh: string, en: string) => english ? en : zh;
  const raw = channelPolyline(output.signals, 52, 28, 282, 112);
  const normalized = channelPolyline(output.normalizedSignals, 386, 28, 282, 112);
  return <figure className={styles.channelFigure}>
    <svg viewBox="0 0 720 190" role="img" aria-label={ui('全部通道的原始与归一化虚拟信号折线图', 'Raw and normalized virtual-signal curves for every channel')}>
      <g className={styles.channelAxes}><path d="M52 28V140H334M386 28V140H668" /><path d="M52 84H334M386 84H668" /></g>
      <polyline className={styles.channelRaw} points={raw} />
      <polyline className={styles.channelNormalized} points={normalized} />
      <g className={styles.channelLabels}>
        <text x="193" y="18" textAnchor="middle">{ui('原始信号', 'Raw signal')}</text>
        <text x="527" y="18" textAnchor="middle">{ui('归一化信号', 'Normalized signal')}</text>
        <text x="193" y="169" textAnchor="middle">{ui(`通道 1–${output.rays.length}`, `Channels 1–${output.rays.length}`)}</text>
        <text x="527" y="169" textAnchor="middle">I / Imax</text>
      </g>
    </svg>
    <figcaption>{ui('与原始 DiagView2 的 raw / normalized 双图一致；完整数值保留在下表和导出文件中。', 'Matches the source DiagView2 raw/normalized dual plot; complete values remain in the table and exports below.')}</figcaption>
  </figure>;
}
function ResultTable({ results, english }: { results: readonly DiagView2RayResult[]; english: boolean }) { const ui = (zh: string, en: string) => english ? en : zh; return <div className={styles.resultTable} role="region" tabIndex={0} aria-label={ui('CAD 射线交点结果', 'CAD ray-hit results')}><table><caption>{ui(`前 ${Math.min(80, results.length)} / ${results.length} 条`, `First ${Math.min(80, results.length)} of ${results.length}`)}</caption><thead><tr><th scope="col">{ui('射线', 'Ray')}</th><th scope="col">{ui('角色', 'Role')}</th><th scope="col">{ui('部件', 'Part')}</th><th scope="col">{ui('距离 / m', 'Distance / m')}</th><th scope="col">{ui('三角面', 'Triangle')}</th><th scope="col">{ui('入射角', 'Incidence')}</th></tr></thead><tbody>{results.slice(0, 80).map((item) => <tr key={item.rayId}><th scope="row">{item.rayId}</th><td>{item.role}</td><td>{item.hitModel ?? '—'}</td><td>{item.hitDistanceM?.toFixed(4) ?? '—'}</td><td>{item.triangleIndex ?? '—'}</td><td>{item.incidenceAngleDeg === null ? '—' : `${item.incidenceAngleDeg.toFixed(2)}°`}</td></tr>)}</tbody></table></div>; }
function ProjectList({ designs, currentId, english, onSelect, onRemove }: { designs: readonly DiagView2DiagnosticDesign[]; currentId: string; english: boolean; onSelect: (design: DiagView2DiagnosticDesign) => void; onRemove: (id: string) => void }) { if (!designs.length) return <p className={styles.emptyState}>{english ? 'No project snapshots yet; exports still include the current geometry.' : '尚无项目快照；导出仍会包含当前几何。'}</p>; return <ul className={styles.projectList}>{designs.map((item) => <li key={item.id} data-active={item.id === currentId}><button type="button" onClick={() => onSelect(item)}><b>{item.nameSuffix}</b><span>{item.diagnosticType}</span></button><button type="button" aria-label={`${english ? 'Remove' : '删除'} ${item.nameSuffix}`} onClick={() => onRemove(item.id)}>×</button></li>)}</ul>; }

function ForwardPanel({ design, english, initialSnapshot, onSnapshotChange, onPlasmaContextsChange }: { design: DiagView2DiagnosticDesign; english: boolean; initialSnapshot: ForwardPanelSnapshot; onSnapshotChange: (snapshot: ForwardPanelSnapshot) => void; onPlasmaContextsChange: (contexts: readonly Ehl2DiagnosticPlasmaContext[]) => void }) {
  const ui = (zh: string, en: string) => english ? en : zh;
  const gfileInput = useRef<HTMLInputElement | null>(null);
  const settingsInput = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef('');
  const geometryKey = forwardDesignKey(design);
  const previousGeometryKey = useRef(geometryKey);
  const restoredGeqdskDescriptor = useRef(initialSnapshot.geqdskDescriptor);
  const [gfile, setGfile] = useState<ReturnType<typeof parseDiagView2Geqdsk> | null>(null);
  const [settings, setSettings] = useState<DiagView2PhysicsSettings>(() => parseDiagView2PhysicsSettings(initialSnapshot.physics));
  const [plasmaSettings, setPlasmaSettings] = useState<PlasmaPanelSettings>(() => ({ ...initialSnapshot.plasma, geqdskVisible: false }));
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<ForwardRunOutput | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const executionPlan = useMemo(() => resolveDiagView2PhysicsExecutionPlan(settings), [settings]);
  const figureDataUrl = useMemo(() => output
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(diagView2ForwardFigureToSvg(output.figureData))}`
    : '', [output]);
  const profileOptions = [
    { value: 'linear', label: 'Linear' },
    { value: 'parabolic', label: 'Parabolic' },
    { value: 'square-parabolic', label: 'SquareParabolic' },
    { value: 'flat-center', label: 'FlatCenter' },
  ] as const;
  const updateSettings = (apply: (current: DiagView2PhysicsSettings) => DiagView2PhysicsSettings) => {
    if (running) return;
    setSettings((current) => parseDiagView2PhysicsSettings(apply(current)));
    setOutput(null);
    setError('');
  };
  const stop = useCallback((cancelled = false) => {
    workerRef.current?.terminate();
    workerRef.current = null;
    requestRef.current = '';
    setRunning(false);
    if (cancelled) setError(english ? 'Calculation aborted.' : '计算已中止。');
  }, [english]);
  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    requestRef.current = '';
  }, []);
  useEffect(() => {
    const contexts: Ehl2DiagnosticPlasmaContext[] = [];
    if (plasmaSettings.parametricVisible) {
      const boundary = Array.from({ length: 120 }, (_, index) => {
        const theta = index * 2 * Math.PI / 120;
        return [
          plasmaSettings.r0M + plasmaSettings.aM * Math.cos(theta + plasmaSettings.delta * Math.sin(theta)),
          plasmaSettings.kappa * plasmaSettings.aM * Math.sin(theta),
        ] as const;
      });
      contexts.push({ id: 'parametric-plasma', label: 'Parametric R0/a/kappa/delta', sourceKind: 'parametric', color: 0xff50c8, lcfsBoundaryRZMetres: boundary, magneticAxisRZMetres: [plasmaSettings.r0M, 0], opacity: plasmaSettings.parametricOpacity, visible: true });
    }
    if (plasmaSettings.geqdskVisible && gfile) {
      const fluxSurfacesRZMetres = buildEhl2GeqdskFluxSurfaceContours(gfile);
      contexts.push({ id: 'geqdsk-lcfs', label: gfile.caseName, sourceKind: 'geqdsk', color: 0x54d9ff, lcfsBoundaryRZMetres: Array.from({ length: gfile.boundaryRM.length }, (_, index) => [gfile.boundaryRM[index], gfile.boundaryZM[index]] as const), magneticAxisRZMetres: [gfile.rmaxisM, gfile.zmaxisM], fluxSurfacesRZMetres, opacity: plasmaSettings.geqdskOpacity, visible: true });
    }
    onPlasmaContextsChange(contexts);
    return () => onPlasmaContextsChange([]);
  }, [gfile, onPlasmaContextsChange, plasmaSettings]);
  useEffect(() => {
    onSnapshotChange({
      physics: settings,
      plasma: plasmaSettings,
      geqdskDescriptor: gfile ? { caseName: gfile.caseName, grid: `${gfile.nw} × ${gfile.nh}`, restoration: 'file-reselection-required' } : restoredGeqdskDescriptor.current,
    });
  }, [gfile, onSnapshotChange, plasmaSettings, settings]);
  useEffect(() => {
    if (previousGeometryKey.current === geometryKey) return;
    previousGeometryKey.current = geometryKey;
    workerRef.current?.terminate();
    workerRef.current = null;
    requestRef.current = '';
    setRunning(false);
    setProgress(0);
    setOutput(null);
    setError('');
  }, [geometryKey]);

  async function loadGfile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      setGfile(parseDiagView2Geqdsk(await file.text()));
      setPlasmaSettings((current) => ({ ...current, geqdskVisible: true }));
      setOutput(null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function loadSettings(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      setSettings(parseDiagView2PhysicsSettings(await file.text()));
      setOutput(null);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function run() {
    if (!gfile || design.laser || !executionPlan.runnable) return;
    try {
      stop();
      const checkedSettings = parseDiagView2PhysicsSettings(settings);
      let profile: ReturnType<typeof buildDiagView2MathProfile>;
      if (executionPlan.kernel === 'broadband-mathematical') {
        profile = buildDiagView2MathProfile(gfile, checkedSettings.broadband.model, checkedSettings.broadband.coreValue, checkedSettings.broadband.edgeValue);
      } else {
        // PlasmaProfile.get_profile_2d applies the main-LCFS polygon mask in
        // addition to psi_norm. Reuse the reviewed broadband geometry kernel
        // here so parasitic closed contours outside the LCFS cannot emit.
        const neProfile = buildDiagView2MathProfile(gfile, checkedSettings.plasma.ne.model, checkedSettings.plasma.ne.coreValue, checkedSettings.plasma.ne.edgeValue);
        const neM3 = Float64Array.from(neProfile.values, (value) => value * 1e19);
        const spectral = buildDiagView2SpectralRelativeWeights(neM3, checkedSettings.spectral.pecCm3S, checkedSettings.spectral.ionFraction);
        profile = {
          model: checkedSettings.plasma.ne.model,
          coreValue: checkedSettings.plasma.ne.coreValue,
          edgeValue: checkedSettings.plasma.ne.edgeValue,
          unit: 'relative-line-weight',
          authority: 'virtual-software',
          values: spectral.values,
          rho: neProfile.rho,
        };
      }
      const figureData = buildDiagView2ForwardFigureData(gfile, checkedSettings, profile);
      const requestId = crypto.randomUUID();
      const profileSpec = executionPlan.kernel === 'broadband-mathematical' ? checkedSettings.broadband : checkedSettings.plasma.ne;
      const runInput = {
        caseName: gfile.caseName,
        grid: `${gfile.nw} × ${gfile.nh}`,
        profile: profileSpec.model,
        core: profileSpec.coreValue,
        edge: profileSpec.edgeValue,
        diagnosticId: design.id,
        physicsSettings: checkedSettings,
        executionKernel: executionPlan.kernel,
      };
      const worker = new Worker(new URL('../components/device-viewer/ehl2DiagView2Forward.worker.ts', import.meta.url), { type: 'module', name: 'ehl2-diagview2-forward' });
      workerRef.current = worker;
      requestRef.current = requestId;
      setProgress(0);
      setOutput(null);
      setError('');
      setRunning(true);
      worker.onmessage = (event: MessageEvent<ForwardWorkerMessage>) => {
        const message = event.data;
        if (!message || message.requestId !== requestRef.current) return;
        if (message.type === 'progress') { setProgress(message.progress.fraction); return; }
        if (message.type === 'result') { setOutput({ ...message.result, runInput, figureData }); setProgress(1); stop(); return; }
        setError(message.error); stop();
      };
      worker.onerror = (event) => {
        if (requestRef.current !== requestId) return;
        setError(event.message || ui('虚拟正向 Worker 失败。', 'The virtual-forward worker failed.'));
        stop();
      };
      worker.postMessage({ type: 'run', requestId, design, gfile, profile });
    } catch (reason) {
      stop();
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  const capability = executionPlan.runnable
    ? executionPlan.status
    : {
      titleZh: '受控原子数据路径未运行', titleEn: 'Controlled atomic-data path is not running',
      detailZh: executionPlan.statusZh, detailEn: executionPlan.statusEn,
    };

  return <>
    <SectionTitle index="05" title={ui('物理诊断与虚拟正向', 'Virtual forward model')} detail={ui('复现原始宽带 / 谱线设置；浏览器只运行数学剖面和手动相对谱线权重。', 'Reconstructs source broadband/spectral physics settings; the browser runs only mathematical profiles and manual relative spectral weights.')} />
    <div className={styles.forwardBoundary}>
      <b>{ui('软件模型 · 非实验测量', 'SOFTWARE MODEL · NOT AN EXPERIMENTAL MEASUREMENT')}</b>
      <p>{ui('中心柱仅按解析圆柱遮挡；不使用 CAD 首交。CHERAB / OpenADAS、绝对辐射率、光学、标定、噪声和探测器响应保持关闭。', 'The centre post is an analytic cylinder only and CAD first hits are not used. CHERAB/OpenADAS, absolute emissivity, optics, calibration, noise and detector response remain disabled.')}</p>
      <div className={styles.fileActions}>
        <button className={styles.primaryButton} type="button" disabled={running} onClick={() => gfileInput.current?.click()}>{ui('载入 GEQDSK', 'Load GEQDSK')}</button>
        <input ref={gfileInput} className={styles.hiddenInput} type="file" accept=".g,.geqdsk,.eqdsk,text/plain" onChange={loadGfile} />
        <button className={styles.secondaryButton} type="button" disabled={running} onClick={() => settingsInput.current?.click()}>{ui('导入物理设置', 'Import physics settings')}</button>
        <input ref={settingsInput} className={styles.hiddenInput} type="file" accept="application/json,.json" onChange={loadSettings} />
        <button className={styles.secondaryButton} type="button" onClick={() => downloadText('EHL2_DiagView2_physics-settings.json', serializeDiagView2PhysicsSettings(settings), 'application/json;charset=utf-8')}>{ui('导出物理设置', 'Export physics settings')}</button>
      </div>
      {gfile && <dl className={styles.poseReadout}><div><dt>CASE</dt><dd>{gfile.caseName}</dd></div><div><dt>GRID</dt><dd>{gfile.nw} × {gfile.nh}</dd></div><div><dt>Ip / A</dt><dd>{gfile.currentA.toPrecision(6)}</dd></div></dl>}
      <fieldset className={styles.displayControls}>
        <legend>{ui('三维等离子体上下文', '3D plasma context')}</legend>
        <label><input type="checkbox" checked={plasmaSettings.parametricVisible} onChange={(event) => setPlasmaSettings((current) => ({ ...current, parametricVisible: event.currentTarget.checked }))} /><span>{ui('参数化 R0 / a / κ / δ 曲面', 'Parametric R0 / a / κ / δ surface')}</span></label>
        <label><input type="checkbox" checked={plasmaSettings.geqdskVisible} disabled={!gfile} onChange={(event) => setPlasmaSettings((current) => ({ ...current, geqdskVisible: event.currentTarget.checked }))} /><span>{ui('已载入 GEQDSK 的约 10 层磁通面与磁轴', 'Loaded GEQDSK ~10 flux surfaces and magnetic axis')}</span></label>
        <NumberField label="R0" value={plasmaSettings.r0M} min={.1} max={5} step={.05} unit="m" onChange={(value) => setPlasmaSettings((current) => ({ ...current, r0M: value, aM: Math.min(current.aM, Math.max(.01, value - .01)) }))} />
        <NumberField label="a" value={plasmaSettings.aM} min={.01} max={Math.max(.01, plasmaSettings.r0M - .01)} step={.05} unit="m" onChange={(value) => setPlasmaSettings((current) => ({ ...current, aM: value }))} />
        <NumberField label="κ" value={plasmaSettings.kappa} min={.1} max={5} step={.05} unit="ratio" onChange={(value) => setPlasmaSettings((current) => ({ ...current, kappa: value }))} />
        <NumberField label="δ" value={plasmaSettings.delta} min={-1.5} max={1.5} step={.05} unit="shape" onChange={(value) => setPlasmaSettings((current) => ({ ...current, delta: value }))} />
        <NumberField label={ui('参数化 Plasma α', 'Parametric plasma α')} value={plasmaSettings.parametricOpacity} min={0} max={1} step={.05} unit="α" onChange={(value) => setPlasmaSettings((current) => ({ ...current, parametricOpacity: value }))} />
        <NumberField label={ui('GEQDSK / EFIT α', 'GEQDSK / EFIT α')} value={plasmaSettings.geqdskOpacity} min={0} max={1} step={.05} unit="α" onChange={(value) => setPlasmaSettings((current) => ({ ...current, geqdskOpacity: value }))} />
        <small>{ui('两类上下文可独立或同时显示；GEQDSK 采用有界降采样提取 ψN=0.1…0.9，并以显式 LCFS 作为第 10 层。这些仅为虚拟显示上下文：所有等离子体曲面跟随显示剖切，但不参与源 CAD 求交，也不是标定图像。', 'Both contexts can be shown independently or together. GEQDSK uses bounded, decimated ψN=0.1…0.9 contours plus the explicit LCFS as layer 10. These are virtual display contexts only: every plasma surface follows render slicing but never changes source-CAD intersections and is not calibrated imagery.')}</small>
      </fieldset>
      <div className={styles.parameterGrid}>
        <Select label={ui('诊断物理模型', 'Diagnostic physics model')} value={settings.diagnosticMode} disabled={running} options={[{ value: 'broadband-radiation', label: ui('宽带辐射', 'Broadband radiation') }, { value: 'spectral-line', label: ui('谱线光谱', 'Spectral line') }]} onChange={(value) => updateSettings((current) => ({ ...current, diagnosticMode: value as DiagView2PhysicsSettings['diagnosticMode'] }))} />
        <Select label={ui('分布来源', 'Profile source')} value={settings.profileSource} disabled={running} options={[{ value: 'mathematical', label: ui('数学模型（浏览器可运行）', 'Mathematical (browser runnable)') }, { value: 'cherab-adas', label: ui('CHERAB / ADAS（需外部运行时）', 'CHERAB / ADAS (external runtime)') }]} onChange={(value) => updateSettings((current) => ({ ...current, profileSource: value as DiagView2PhysicsSettings['profileSource'] }))} />
      </div>
      {settings.diagnosticMode === 'broadband-radiation' && <Details title={ui('宽带数学模型参数', 'Broadband mathematical parameters')} open>
        <div className={styles.parameterGrid}><Select label={ui('分布模型', 'Profile model')} value={settings.broadband.model} disabled={running} options={profileOptions} onChange={(value) => updateSettings((current) => ({ ...current, broadband: { ...current.broadband, model: value as DiagView2PhysicsProfileModel } }))} /><NumberField label={ui('中心值', 'Core value')} value={settings.broadband.coreValue} min={0} max={1e100} step={.1} unit="rel." disabled={running} onChange={(value) => updateSettings((current) => ({ ...current, broadband: { ...current.broadband, coreValue: value } }))} /><NumberField label={ui('边缘值', 'Edge value')} value={settings.broadband.edgeValue} min={0} max={1e100} step={.1} unit="rel." disabled={running} onChange={(value) => updateSettings((current) => ({ ...current, broadband: { ...current.broadband, edgeValue: value } }))} /></div>
      </Details>}
      <Details title={ui('公共 Te / ne 与 ADAS 参数', 'Shared Te/ne and ADAS parameters')} open={settings.diagnosticMode === 'spectral-line' || settings.profileSource === 'cherab-adas'}>
        <div className={styles.parameterGrid}>
          <Select label={ui('元素种类', 'Element')} value={settings.plasma.element} disabled={running} options={DIAGVIEW2_PHYSICS_ELEMENTS.map((value) => ({ value, label: value }))} onChange={(value) => updateSettings((current) => ({ ...current, plasma: { ...current.plasma, element: value as DiagView2PhysicsSettings['plasma']['element'] } }))} />
          <Select label={ui('Te 剖面', 'Te profile')} value={settings.plasma.te.model} disabled={running} options={profileOptions} onChange={(value) => updateSettings((current) => ({ ...current, plasma: { ...current.plasma, te: { ...current.plasma.te, model: value as DiagView2PhysicsProfileModel } } }))} />
          <NumberField label={ui('Te 中心', 'Te core')} value={settings.plasma.te.coreValue} min={0} max={1e7} step={100} unit="eV" disabled={running} onChange={(value) => updateSettings((current) => ({ ...current, plasma: { ...current.plasma, te: { ...current.plasma.te, coreValue: value } } }))} />
          <NumberField label={ui('Te 边缘', 'Te edge')} value={settings.plasma.te.edgeValue} min={0} max={1e7} step={10} unit="eV" disabled={running} onChange={(value) => updateSettings((current) => ({ ...current, plasma: { ...current.plasma, te: { ...current.plasma.te, edgeValue: value } } }))} />
          <Select label={ui('ne 剖面', 'ne profile')} value={settings.plasma.ne.model} disabled={running} options={profileOptions} onChange={(value) => updateSettings((current) => ({ ...current, plasma: { ...current.plasma, ne: { ...current.plasma.ne, model: value as DiagView2PhysicsProfileModel } } }))} />
          <NumberField label={ui('ne 中心', 'ne core')} value={settings.plasma.ne.coreValue} min={0} max={1e6} step={.5} unit="1e19 m⁻³" disabled={running} onChange={(value) => updateSettings((current) => ({ ...current, plasma: { ...current.plasma, ne: { ...current.plasma.ne, coreValue: value } } }))} />
          <NumberField label={ui('ne 边缘', 'ne edge')} value={settings.plasma.ne.edgeValue} min={0} max={1e6} step={.1} unit="1e19 m⁻³" disabled={running} onChange={(value) => updateSettings((current) => ({ ...current, plasma: { ...current.plasma, ne: { ...current.plasma.ne, edgeValue: value } } }))} />
          <NumberField label={ui('杂质比例', 'Impurity fraction')} value={settings.plasma.impurityPercent} min={0} max={100} step={.1} unit="%" disabled={running} onChange={(value) => updateSettings((current) => ({ ...current, plasma: { ...current.plasma, impurityPercent: value } }))} />
        </div>
        <p className={styles.hint}>{ui('杂质比例作为源前端设置保留，但浏览器相对谱线权重不使用该值；绝对辐射率必须由受控 CHERAB / ADAS 后端计算。', 'Impurity fraction is preserved as a source front-end setting but is not used by the browser relative line weight. Absolute emissivity requires a controlled CHERAB/ADAS backend.')}</p>
      </Details>
      {settings.diagnosticMode === 'spectral-line' && <Details title={ui('谱线光谱参数', 'Spectral-line parameters')} open>
        <div className={styles.parameterGrid}>
          <Select label={ui('杂质谱线', 'Impurity line')} value={settings.spectral.lineLabel} disabled={running} options={DIAGVIEW2_SPECTRAL_LINE_PRESETS.map((preset) => ({ value: preset.label, label: preset.label }))} onChange={(value) => updateSettings((current) => applyDiagView2SpectralLinePreset(current, value))} />
          <NumberField label="PEC" value={pecCm3SToDiagView2Display(settings.spectral.pecCm3S)} min={0} max={1e13} step={.1} unit="×1e-13 cm³/s" disabled={running} onChange={(value) => updateSettings((current) => ({ ...current, spectral: { ...current.spectral, pecCm3S: diagView2DisplayToPecCm3S(value), pecSource: 'user-manual' } }))} />
          <NumberField label={ui('离子丰度', 'Ion fraction')} value={settings.spectral.ionFraction} min={0} max={1} step={.05} unit="fraction" disabled={running} onChange={(value) => updateSettings((current) => ({ ...current, spectral: { ...current.spectral, ionFraction: value } }))} />
        </div>
        <p className={styles.hint}>relative line weight = ne<sub>cm⁻³</sub> × PEC<sub>cm³/s</sub> × ion fraction</p>
      </Details>}
      <div className={styles.capabilityNotice} data-available={executionPlan.runnable}><b>{english ? capability.titleEn : capability.titleZh}</b><p>{english ? capability.detailEn : capability.detailZh}</p></div>
      <div className={styles.analysisActions}><button className={styles.primaryButton} type="button" disabled={!gfile || Boolean(design.laser) || running || !executionPlan.runnable} onClick={run}>{running ? ui('计算中…', 'Running…') : ui('运行虚拟线积分', 'Run virtual line integration')}</button><button className={styles.secondaryButton} type="button" disabled={!running} onClick={() => stop(true)}>{ui('中止', 'Abort')}</button></div>
      <progress max={1} value={progress} aria-label={ui('线积分进度', 'Line-integration progress')} />
      {error && <p className={styles.errorText} role="alert">{error}</p>}
      {output && <>
        <Metrics items={[[ui('射线', 'Rays'), output.rays.length], [ui('非零信号', 'Non-zero'), [...output.signals].filter((value) => value > 0).length], [ui('归一化参考', 'Normalization ref.'), output.normalizationReferenceSignal.toExponential(4)]]} />
        <dl className={styles.poseReadout}><div><dt>CASE / GRID</dt><dd>{output.runInput.caseName} · {output.runInput.grid}</dd></div><div><dt>KERNEL</dt><dd>{output.runInput.executionKernel}</dd></div><div><dt>PROFILE</dt><dd>{output.runInput.profile} · core {output.runInput.core} · edge {output.runInput.edge}</dd></div><div><dt>DIAGNOSTIC</dt><dd>{output.runInput.diagnosticId}</dd></div><div><dt>UNIT</dt><dd>{output.signalUnit}</dd></div></dl>
        <figure className={styles.forwardFigure}><img src={figureDataUrl} width={1440} height={900} alt={ui('虚拟 Te、ne、发射分布、R-Z 场、LCFS 与磁轴图', 'Virtual Te, ne, emission, R-Z field, LCFS and magnetic-axis plots')} /><figcaption>{ui('虚拟软件结果：径向剖面与 R-Z 场采用同一主 LCFS 掩膜；不是实验测量或绝对标定。', 'Virtual-software result: radial profiles and the R-Z field use the same main-LCFS mask; this is not an experimental measurement or absolute calibration.')}</figcaption></figure>
        <ChannelSignalChart output={output} english={english} />
        <div className={styles.signalBars} role="img" aria-label={ui(`全部 ${output.rays.length} 通道的归一化虚拟信号`, `Normalized virtual signals for all ${output.rays.length} channels`)}>{[...output.normalizedSignals].map((value, index) => <i key={output.rays[index].rayId} title={`${output.rays[index].rayId}: ${value.toFixed(5)}`} style={{ height: `${Math.max(2, value * 100)}%` }} />)}</div>
        <Details title={ui(`全通道数值表（${output.rays.length}）`, `All-channel value table (${output.rays.length})`)}><div className={styles.tableWrap} tabIndex={0} role="region" aria-label={ui('虚拟正向全通道结果', 'All-channel virtual-forward results')}><table><thead><tr><th scope="col">Ray</th><th scope="col">Role</th><th scope="col">Raw</th><th scope="col">Normalized</th></tr></thead><tbody>{output.rays.map((ray, index) => <tr key={ray.rayId}><th scope="row">{ray.rayId}</th><td>{ray.role}</td><td>{output.signals[index].toExponential(6)}</td><td>{output.normalizedSignals[index].toFixed(8)}</td></tr>)}</tbody></table></div></Details>
        <div className={styles.fileActions}><button className={styles.secondaryButton} type="button" onClick={() => downloadText(`${design.nameSuffix}-virtual-forward.csv`, forwardResultToCsv(output), 'text/csv;charset=utf-8')}>{ui('下载全通道 CSV', 'Download all-channel CSV')}</button><button className={styles.secondaryButton} type="button" onClick={() => downloadText(`${design.nameSuffix}-virtual-forward.json`, forwardResultToJson(output), 'application/json;charset=utf-8')}>{ui('下载完整结果 JSON', 'Download full-result JSON')}</button><button className={styles.secondaryButton} type="button" onClick={() => downloadText(`${design.nameSuffix}-field-data.json`, diagView2ForwardFigureToJson(output.figureData), 'application/json;charset=utf-8')}>{ui('下载场数据 JSON', 'Download field-data JSON')}</button><button className={styles.secondaryButton} type="button" onClick={() => downloadText(`${design.nameSuffix}-virtual-forward.m`, diagView2ForwardFigureToMatlab(output.figureData), 'text/plain;charset=utf-8')}>{ui('下载 MATLAB 脚本', 'Download MATLAB script')}</button><button className={styles.secondaryButton} type="button" onClick={() => downloadText(`${design.nameSuffix}-virtual-forward.svg`, diagView2ForwardFigureToSvg(output.figureData), 'image/svg+xml;charset=utf-8')}>{ui('下载科学 SVG', 'Download scientific SVG')}</button></div>
        <ul className={styles.warningList}>{output.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
      </>}
      <div className={styles.capabilityMatrix}><article><b>{english ? DIAGVIEW2_PHYSICS_CAPABILITIES.adasAtomicData.titleEn : DIAGVIEW2_PHYSICS_CAPABILITIES.adasAtomicData.titleZh}</b><span>{english ? DIAGVIEW2_PHYSICS_CAPABILITIES.adasAtomicData.detailEn : DIAGVIEW2_PHYSICS_CAPABILITIES.adasAtomicData.detailZh}</span></article><article><b>{english ? DIAGVIEW2_PHYSICS_CAPABILITIES.cherabRadiation.titleEn : DIAGVIEW2_PHYSICS_CAPABILITIES.cherabRadiation.titleZh}</b><span>{english ? DIAGVIEW2_PHYSICS_CAPABILITIES.cherabRadiation.detailEn : DIAGVIEW2_PHYSICS_CAPABILITIES.cherabRadiation.detailZh}</span></article><article><b>{english ? DIAGVIEW2_PHYSICS_CAPABILITIES.spectralAbsolute.titleEn : DIAGVIEW2_PHYSICS_CAPABILITIES.spectralAbsolute.titleZh}</b><span>{english ? DIAGVIEW2_PHYSICS_CAPABILITIES.spectralAbsolute.detailEn : DIAGVIEW2_PHYSICS_CAPABILITIES.spectralAbsolute.detailZh}</span></article></div>
    </div>
  </>;
}

function SourceTable({ english, onLoadScenario }: { english: boolean; onLoadScenario?: (scenario: (typeof EHL2_DIAGNOSTIC_SCENARIOS)[number]) => void }) { const ui = (zh: string, en: string) => english ? en : zh; return <div className={styles.tableWrap} role="region" aria-label={ui('诊断方案来源表', 'Diagnostic-scenario source table')} tabIndex={0}><table><caption>{ui('PPT 五方案来源参考（不替代完整工作台）', 'Five PPT source references (not a replacement for the full workbench)')}</caption><thead><tr><th scope="col">{ui('方案', 'Scenario')}</th><th scope="col">{ui('方位', 'Azimuth')}</th><th scope="col">{ui('PPT 标记', 'PPT mark')}</th><th scope="col">{ui('谱段', 'Bands')}</th><th scope="col">{ui('复合', 'Composite')}</th><th scope="col">{ui('完整度', 'Completeness')}</th>{onLoadScenario && <th scope="col">{ui('操作', 'Action')}</th>}</tr></thead><tbody>{EHL2_DIAGNOSTIC_SCENARIOS.map((item) => <tr key={item.id}><th scope="row">{item.diagnosticId}</th><td>{item.azimuthDeg}°</td><td>{item.sourceFovLabel}°</td><td>{item.spectralBands.join(' / ') || '—'}</td><td>{item.includedInCompositeAssessment ? ui('是', 'Yes') : ui('否', 'No')}</td><td>{item.elevationReferenceAvailable ? ui(`第 ${item.sourceSlides.join('/')} 页：平面 + 立面`, `Slides ${item.sourceSlides.join('/')}: plan + elevation`) : ui(`第 ${item.sourceSlides.join('/')} 页：仅平面`, `Slide ${item.sourceSlides.join('/')}: plan only`)}</td>{onLoadScenario && <td><button className={styles.tableAction} type="button" onClick={() => onLoadScenario(item)}>{ui('载入平面参考', 'Load planar reference')}</button></td>}</tr>)}</tbody></table><p className={styles.tableNote}>{ui(`PPT 复合结论：上偏滤器在 ${EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.upperDivertor.nearAzimuthDeg}° 附近局部未覆盖；仅为平面来源结论。`, `PPT composite result: the upper divertor is partially uncovered near ${EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.upperDivertor.nearAzimuthDeg}°; plan-view source only.`)}</p></div>; }
