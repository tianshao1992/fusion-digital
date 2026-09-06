'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Plane,
  Scene,
  Texture,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
  EfitAlignmentContract,
  EfitRenderableFrame,
  EfitStoreLike,
  EfitThreeOverlay,
  EfitThreeOverlayOptions,
} from './device-viewer/EfitThreeOverlay';
import type {
  Ehl2DiagnosticOverlayOptions,
  Ehl2DiagnosticThreeOverlay,
} from './device-viewer/Ehl2DiagnosticThreeOverlay';
import type { Ehl2DiagnosticRuntime } from './device-viewer/ehl2DiagnosticRuntime';
import {
  INDUSTRIAL_STUDIO,
  INDUSTRIAL_MATERIAL_SPECS,
  resolveAnonymousAssemblyMaterialPreset,
  resolveIndustrialMaterialPreset,
  resolveIndustrialMaterialSpec,
  type TokamakAppearancePreset,
} from './device-viewer/industrialAppearance';
import { resolveCadSceneTheme, scaleCadFogDensity } from './device-viewer/cadSceneTheme';
import { createExl50uPresentationIdentity } from './device-viewer/exl50uPresentationIdentity';
import {
  ANALYTIC_PLASMA_RUNTIME_SEMANTICS,
  ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT,
  buildAnalyticPlasmaGeometry,
} from './device-viewer/analyticPlasma';
import {
  createSerialTaskGate,
  loadAnonymousDeviceModelWithFallback,
  loadVerifiedAnonymousShardBundle,
  loadVerifiedComponentBundle,
  loadVerifiedMonolithicModel,
  type AnonymousShardLoadProgress,
} from './device-viewer/componentModelLoader';
import {
  initialViewerModelChoice,
  isAnonymousShardChoice,
  isAnonymousVisualizationManifest,
  requestedAnonymousQuality,
  viewerModelChoices,
  type ViewerModelChoice,
} from './device-viewer/viewerModelChoices';
import {
  evaluateEhl2RuntimePolicy,
  isEhl2ViewerSession,
  type Ehl2RuntimePolicy,
} from './device-viewer/ehl2RuntimePolicy';
import { resolveShotGeometry, type EfitFrame, type EfitStore } from './efit';
import { useI18n } from '../i18n';
import { useTheme, type ResolvedTheme } from './theme';
import {
  parseDeviceManifest,
  type DeviceManifest,
} from './deviceManifest';
import './tokamak-cad-viewer.css';

const DEFAULT_MANIFEST_URL = '/models/paramak-tokamak-demo/model-manifest.json';
// GLTFLoader parsing cannot be cancelled. Keep one client-module decode lane so
// keyed viewer remounts, route transitions and multiple viewers cannot stack
// stale large parses and multiply peak memory.
const globalModelDecodeGate = createSerialTaskGate();
const ANALYTIC_FLUX_LIGHT_COLORS = [
  0xc95038, 0xdc7137, 0xd79a28, 0x9ba83e, 0x3f9d79,
  0x248ba8, 0x466fb2, 0x6859ad, 0x8c4e91,
];
const ANALYTIC_FLUX_DARK_COLORS = [
  0xff7054, 0xff9b45, 0xf4ca54, 0xb6d75d, 0x62d2a8,
  0x49c5de, 0x6095ed, 0x8977e8, 0xb767bd,
];

export type TokamakCadViewerProps = {
  manifestUrl?: string;
  viewerId?: string;
  sectionId?: string;
  workspace?: boolean;
  showDownloadActions?: boolean;
  showFootnotes?: boolean;
  securityNotice?: string;
  defaultClipping?: boolean;
  defaultClipAxis?: 'x' | 'y' | 'z';
  defaultClipOffset?: number;
  appearancePreset?: TokamakAppearancePreset;
  cameraProfile?: 'default' | 'close-inspection';
  efitFrame?: EfitFrame | EfitRenderableFrame | null;
  efitStore?: EfitStore | EfitStoreLike | null;
  efitAlignment?: EfitAlignmentContract;
  efitOptions?: EfitThreeOverlayOptions;
  /**
   * Stable device-level capability gate for the existing DiagView2 Three
   * overlay. EHL-2 enables the overlay implicitly; other devices must opt in.
   * Changing overlay options remains a live update and never reloads CAD.
   */
  diagnosticOverlayEnabled?: boolean;
  diagnosticOverlayOptions?: Ehl2DiagnosticOverlayOptions;
  /** Stable id emitted when an explicitly interactive overlay marker is picked. */
  onDiagnosticMarkerSelect?: (markerId: string) => void;
  /** Device-web-metres point to centre without reloading or replacing the CAD. */
  diagnosticFocusPoint?: readonly [number, number, number] | null;
  onDiagnosticRuntimeReady?: (runtime: Ehl2DiagnosticRuntime | null) => void;
  /**
   * EHL-2 diagnostic-view appearance overrides. These are deliberately a
   * small, portable subset of the desktop Viser controls: this viewer uses a
   * generated Three.js RoomEnvironment rather than shipping desktop HDRIs.
   * Omitted fields preserve the current theme-derived value.
   */
  diagnosticViewerSettings?: Ehl2DiagnosticViewerSettings;
  /**
   * Optional controlled restore of the safe, serialisable EHL-2 viewer state.
   * This is applied incrementally and never participates in the CAD loading
   * effect, so restoring a workspace does not decode the model again.
   */
  diagnosticViewerState?: Ehl2DiagnosticViewerState;
  /** Safe, serialisable viewer state for an explicit parent-side save. */
  onDiagnosticViewerStateChange?: (state: Ehl2DiagnosticViewerState) => void;
  /** Content rendered inside the actual Three viewport, including fullscreen. */
  viewportOverlay?: ReactNode;
  efitControls?: {
    mode: 'physical' | 'xray';
    showSection: boolean;
    showSurface: boolean;
    showMagneticAxis: boolean;
    onModeChange: (mode: 'physical' | 'xray') => void;
    onShowSectionChange: (visible: boolean) => void;
    onShowSurfaceChange: (visible: boolean) => void;
    onShowMagneticAxisChange: (visible: boolean) => void;
  };
};

export type Ehl2DiagnosticViewerSettings = Readonly<{
  environmentPreset?: 'room-platform-substitute' | 'none';
  environmentIntensity?: number;
  backgroundEnabled?: boolean;
  backgroundIntensity?: number;
  backgroundBlurriness?: number;
  defaultLightsEnabled?: boolean;
  castShadow?: boolean;
  /** Per published CAD part opacity, independent of the global/selection controls. */
  partOpacities?: Readonly<Record<string, number>>;
}>;

export type Ehl2DiagnosticViewerState = Readonly<{
  activeView: 'iso' | 'front' | 'top';
  autoRotate: boolean;
  wireframe: boolean;
  clipping: boolean;
  clipAxis: 'x' | 'y' | 'z';
  clipOffset: number;
  globalOpacity: number;
  selectedOpacity: number;
  analyticPlasmaVisible: boolean;
  selectedPartIds: readonly string[];
  hiddenPartIds: readonly string[];
  isolatedPartIds: readonly string[];
  partOpacities: Readonly<Record<string, number>>;
  /** Null means the named preset; otherwise this is a user-orbited camera pose. */
  cameraView: Ehl2DiagnosticCameraView | null;
}>;

type ViewerStatus = 'idle' | 'loading' | 'ready' | 'error';
type ViewPreset = 'iso' | 'front' | 'top';
type ClipAxis = 'x' | 'y' | 'z';
type ViewerInteraction = {
  activeView: ViewPreset;
  autoRotate: boolean;
  wireframe: boolean;
  clipping: boolean;
  clipAxis: ClipAxis;
  clipOffset: number;
};
type ViewerStats = { meshes: number; triangles: number; renderer: string; parts: number };
export type Ehl2DiagnosticCameraView = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
};
type ViewSnapshot = Ehl2DiagnosticCameraView;
type ViewerApi = {
  controls: OrbitControls;
  renderer: WebGLRenderer;
  model: Object3D;
  clippingPlane: Plane;
  originalMaterials: Map<Mesh, Material | Material[]>;
  nodeByPartId: Map<string, Object3D>;
  partIdByNode: WeakMap<Object3D, string>;
  materials: Set<Material>;
  disposableMaterials: Set<Material>;
  setView: (preset: ViewPreset) => void;
  reset: () => void;
  setWireframe: (enabled: boolean) => void;
  setClipping: (enabled: boolean, axis: ClipAxis, offset: number) => void;
  setOpacity: (globalOpacity: number, selectedOpacity: number) => void;
  setPartOpacities: (partOpacities: Readonly<Record<string, number>>) => Readonly<Record<string, number>>;
  setDiagnosticViewerSettings: (settings: Ehl2DiagnosticViewerSettings) => void;
  setVisualTheme: (theme: ResolvedTheme) => void;
  setAnalyticPlasmaVisible: (visible: boolean) => void;
  applyVisibility: (hidden: Set<string>, isolated: Set<string>) => void;
  selectParts: (partIds: Set<string>) => void;
  pickPart: (event: PointerEvent) => string | null;
  focusWebPoint: (pointWebMetres: readonly [number, number, number]) => void;
  captureView: () => ViewSnapshot;
  applyView: (snapshot: ViewSnapshot) => void;
  resize: (refit: boolean) => void;
  efitOverlay: EfitThreeOverlay | null;
  diagnosticOverlay: Ehl2DiagnosticThreeOverlay | null;
  diagnosticRuntime: Ehl2DiagnosticRuntime | null;
};

function formatCount(value: number, locale = 'zh-CN') {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function supportsWebGL2() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

function materialList(material: Material | Material[]) {
  return Array.isArray(material) ? material : [material];
}

function currentEfitFrame(store: EfitStoreLike | null | undefined): EfitRenderableFrame | null {
  const snapshot = store?.getSnapshot();
  if (!snapshot) return null;
  if ('currentFrame' in snapshot) {
    const frame = snapshot.currentFrame;
    if (!frame) return null;
    const shotId = snapshot.activeShot ?? (typeof frame.shot === 'number' ? frame.shot : null);
    const limiterRzM = resolveShotGeometry(snapshot.manifest, shotId)?.limiterRzM;
    // The 3D renderer needs the exact published limiter arc to close a
    // divertor region. Add it as render-only frame context without mutating
    // the EFIT frame, store or public binary contract.
    return limiterRzM ? { ...frame, limiterRzM } : frame;
  }
  return 'timeMs' in snapshot ? snapshot : null;
}

function efitFrameIdentity(frame: EfitRenderableFrame | null): string {
  if (!frame) return 'empty';
  return `${String(frame.shot ?? 'unknown')}:${String(frame.index ?? 'unknown')}:${frame.timeMs}`;
}

function disposeObject(root: Object3D) {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    materialList(mesh.material).forEach((material) => material?.dispose());
  });
}

function allMeshes(root: Object3D) {
  const meshes: Mesh[] = [];
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  return meshes;
}

function megabytes(bytes: number) {
  return Math.max(0.1, bytes / 1_000_000).toFixed(1);
}

function viewerModelTriangleCount(model: ViewerModelChoice | null | undefined): number | undefined {
  if (!model) return undefined;
  return 'sceneDrawTriangles' in model ? model.sceneDrawTriangles : model.triangles;
}

function shouldPreferPreview() {
  const hintedNavigator = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return window.matchMedia('(max-width: 650px)').matches
    || hintedNavigator.connection?.saveData === true
    || (typeof hintedNavigator.deviceMemory === 'number' && hintedNavigator.deviceMemory < 4);
}

function currentEhl2RuntimePolicy(): Ehl2RuntimePolicy {
  const hintedNavigator = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
  };
  return evaluateEhl2RuntimePolicy({
    viewportWidth: window.innerWidth,
    saveData: hintedNavigator.connection?.saveData === true,
    deviceMemoryGiB: hintedNavigator.deviceMemory,
    userAgent: hintedNavigator.userAgent,
    userAgentDataMobile: hintedNavigator.userAgentData?.mobile,
    maxTouchPoints: hintedNavigator.maxTouchPoints,
  });
}

function defaultInteractionFor(clipping: boolean, clipAxis: ClipAxis, clipOffset: number): ViewerInteraction {
  const boundedClipOffset = Number.isFinite(clipOffset)
    ? Math.min(0.9, Math.max(-0.9, clipOffset))
    : 0;
  return {
    activeView: 'iso',
    autoRotate: false,
    wireframe: false,
    clipping,
    clipAxis,
    clipOffset: boundedClipOffset,
  };
}

function finiteClamped(value: unknown, minimum: number, maximum: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.min(maximum, Math.max(minimum, value));
}

function safePartOpacityMap(value: unknown): Readonly<Record<string, number>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const next: Record<string, number> = {};
  for (const [partId, opacity] of Object.entries(value as Record<string, unknown>)) {
    // Part identifiers are public manifest ids, never arbitrary display text.
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(partId)) continue;
    const bounded = finiteClamped(opacity, 0, 1);
    if (bounded !== undefined) next[partId] = bounded;
  }
  return next;
}

/**
 * Accept only finite, bounded appearance values. Invalid input is omitted
 * rather than coercing a renderer into an unknown state.
 */
export function normalizeEhl2DiagnosticViewerSettings(value: unknown): Ehl2DiagnosticViewerSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const environmentIntensity = finiteClamped(input.environmentIntensity, 0, 5);
  const backgroundIntensity = finiteClamped(input.backgroundIntensity, 0, 5);
  const backgroundBlurriness = finiteClamped(input.backgroundBlurriness, 0, 1);
  const partOpacities = safePartOpacityMap(input.partOpacities);
  return {
    ...(input.environmentPreset !== 'room-platform-substitute' && input.environmentPreset !== 'none' ? {} : { environmentPreset: input.environmentPreset }),
    ...(environmentIntensity === undefined ? {} : { environmentIntensity }),
    ...(typeof input.backgroundEnabled !== 'boolean' ? {} : { backgroundEnabled: input.backgroundEnabled }),
    ...(backgroundIntensity === undefined ? {} : { backgroundIntensity }),
    ...(backgroundBlurriness === undefined ? {} : { backgroundBlurriness }),
    ...(typeof input.defaultLightsEnabled !== 'boolean' ? {} : { defaultLightsEnabled: input.defaultLightsEnabled }),
    ...(typeof input.castShadow !== 'boolean' ? {} : { castShadow: input.castShadow }),
    ...(partOpacities === undefined ? {} : { partOpacities }),
  };
}

function safePartIdList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > 512) return null;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(item) || seen.has(item)) return null;
    seen.add(item);
  }
  return [...seen].sort((left, right) => left.localeCompare(right));
}

function safeViewTuple(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const tuple = value.map((item) => finiteClamped(item, -1_000, 1_000));
  return tuple.some((item) => item === undefined) ? null : tuple as [number, number, number];
}

function safeViewSnapshot(value: unknown): ViewSnapshot | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join('|') !== ['position', 'target', 'up'].sort().join('|')) return undefined;
  const position = safeViewTuple(item.position);
  const target = safeViewTuple(item.target);
  const up = safeViewTuple(item.up);
  if (!position || !target || !up || Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]) < 1e-6 || Math.hypot(...up) < 1e-6) return undefined;
  return { position, target, up };
}

/** Strict parser used by workspace restore; malformed state fails closed. */
export function parseEhl2DiagnosticViewerState(value: unknown): Ehl2DiagnosticViewerState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const legacyKeys = [
    'activeView', 'analyticPlasmaVisible', 'autoRotate', 'clipAxis', 'clipOffset',
    'clipping', 'globalOpacity', 'hiddenPartIds', 'isolatedPartIds', 'partOpacities',
    'selectedOpacity', 'selectedPartIds', 'wireframe',
  ].sort().join('|');
  const currentKeys = [...legacyKeys.split('|'), 'cameraView'].sort().join('|');
  const inputKeys = Object.keys(input).sort().join('|');
  if (inputKeys !== legacyKeys && inputKeys !== currentKeys) return null;
  if (input.activeView !== 'iso' && input.activeView !== 'front' && input.activeView !== 'top') return null;
  if (input.clipAxis !== 'x' && input.clipAxis !== 'y' && input.clipAxis !== 'z') return null;
  if (typeof input.autoRotate !== 'boolean' || typeof input.wireframe !== 'boolean'
    || typeof input.clipping !== 'boolean' || typeof input.analyticPlasmaVisible !== 'boolean') return null;
  const clipOffset = finiteClamped(input.clipOffset, -0.9, 0.9);
  const globalOpacity = finiteClamped(input.globalOpacity, 0.15, 1);
  const selectedOpacity = finiteClamped(input.selectedOpacity, 0.15, 1);
  const selectedPartIds = safePartIdList(input.selectedPartIds);
  const hiddenPartIds = safePartIdList(input.hiddenPartIds);
  const isolatedPartIds = safePartIdList(input.isolatedPartIds);
  const partOpacities = safePartOpacityMap(input.partOpacities);
  const cameraView = inputKeys === legacyKeys ? null : safeViewSnapshot(input.cameraView);
  if (clipOffset === undefined || globalOpacity === undefined || selectedOpacity === undefined
    || !selectedPartIds || !hiddenPartIds || !isolatedPartIds || !partOpacities || cameraView === undefined) return null;
  return {
    activeView: input.activeView,
    autoRotate: input.autoRotate,
    wireframe: input.wireframe,
    clipping: input.clipping,
    clipAxis: input.clipAxis,
    clipOffset,
    globalOpacity,
    selectedOpacity,
    analyticPlasmaVisible: input.analyticPlasmaVisible,
    selectedPartIds,
    hiddenPartIds,
    isolatedPartIds,
    partOpacities,
    cameraView,
  };
}

function stablePartIds(ids: Iterable<string>) {
  return [...ids].sort((left, right) => left.localeCompare(right));
}

export default function TokamakCadViewer(props: TokamakCadViewerProps = {}) {
  const sessionViewerId = props.viewerId ?? 'paramak-tokamak-demo';
  const sessionManifestUrl = props.manifestUrl ?? DEFAULT_MANIFEST_URL;
  const sessionAppearancePreset = props.appearancePreset ?? 'semantic';
  const sessionCameraProfile = props.cameraProfile ?? 'default';
  return <TokamakCadViewerSession
    key={`${sessionViewerId}:${sessionManifestUrl}:${sessionAppearancePreset}:${sessionCameraProfile}`}
    {...props}
  />;
}

function TokamakCadViewerSession({
  manifestUrl = DEFAULT_MANIFEST_URL,
  viewerId = 'paramak-tokamak-demo',
  sectionId,
  workspace = false,
  showDownloadActions = true,
  showFootnotes = false,
  securityNotice,
  defaultClipping = false,
  defaultClipAxis = 'x',
  defaultClipOffset = 0,
  appearancePreset = 'semantic',
  cameraProfile = 'default',
  efitFrame = null,
  efitStore = null,
  efitAlignment,
  efitOptions,
  diagnosticOverlayEnabled = false,
  diagnosticOverlayOptions,
  onDiagnosticMarkerSelect,
  diagnosticFocusPoint = null,
  onDiagnosticRuntimeReady,
  diagnosticViewerSettings,
  diagnosticViewerState,
  onDiagnosticViewerStateChange,
  viewportOverlay,
  efitControls,
}: TokamakCadViewerProps = {}) {
  const { content, locale, t } = useI18n();
  const { resolvedTheme } = useTheme();
  const ehl2Session = isEhl2ViewerSession(viewerId, manifestUrl);
  const diagnosticOverlaySession = ehl2Session || diagnosticOverlayEnabled;
  const wireframeAllowed = !ehl2Session;
  const i18nRef = useRef({ content, t });
  const visualThemeRef = useRef(resolvedTheme);
  useEffect(() => {
    i18nRef.current = { content, t };
  }, [content, t]);
  const defaultInteraction = defaultInteractionFor(defaultClipping, defaultClipAxis, defaultClipOffset);
  const mountRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerApi | null>(null);
  useEffect(() => {
    visualThemeRef.current = resolvedTheme;
    viewerRef.current?.setVisualTheme(resolvedTheme);
  }, [resolvedTheme]);
  const efitStateRef = useRef({
    frame: efitFrame,
    store: efitStore,
    alignment: efitAlignment,
    options: efitOptions,
  });
  const diagnosticOverlayOptionsRef = useRef(diagnosticOverlayOptions);
  const diagnosticMarkerSelectRef = useRef(onDiagnosticMarkerSelect);
  const diagnosticFocusPointRef = useRef(diagnosticFocusPoint);
  const diagnosticRuntimeReadyRef = useRef(onDiagnosticRuntimeReady);
  const diagnosticRuntimeRef = useRef<Ehl2DiagnosticRuntime | null>(null);
  const initialDiagnosticViewerSettings = normalizeEhl2DiagnosticViewerSettings(diagnosticViewerSettings);
  const diagnosticViewerSettingsRef = useRef<Ehl2DiagnosticViewerSettings>(initialDiagnosticViewerSettings);
  const initialDiagnosticViewerState = parseEhl2DiagnosticViewerState(diagnosticViewerState);
  const diagnosticViewerStateCallbackRef = useRef(onDiagnosticViewerStateChange);
  const lastDiagnosticViewerStateRef = useRef('');
  const lastAppliedDiagnosticViewerStateRef = useRef('');
  const pendingControlledViewerStateRef = useRef('');
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const selectedPartIdsRef = useRef<Set<string>>(new Set(initialDiagnosticViewerState?.selectedPartIds));
  const hiddenPartIdsRef = useRef<Set<string>>(new Set(initialDiagnosticViewerState?.hiddenPartIds));
  const isolatedPartIdsRef = useRef<Set<string>>(new Set(initialDiagnosticViewerState?.isolatedPartIds));
  const opacityRef = useRef({
    global: initialDiagnosticViewerState?.globalOpacity ?? 1,
    selected: initialDiagnosticViewerState?.selectedOpacity ?? 1,
  });
  const analyticPlasmaVisibleRef = useRef(initialDiagnosticViewerState?.analyticPlasmaVisible ?? ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT);
  const viewSnapshotRef = useRef<ViewSnapshot | null>(null);
  const cameraViewRef = useRef<ViewSnapshot | null>(initialDiagnosticViewerState?.cameraView ?? null);
  const anonymousHighDetailIntentRef = useRef(false);
  const interactionRef = useRef<ViewerInteraction>({
    activeView: initialDiagnosticViewerState?.activeView ?? defaultInteraction.activeView,
    autoRotate: initialDiagnosticViewerState?.autoRotate ?? defaultInteraction.autoRotate,
    wireframe: initialDiagnosticViewerState?.wireframe ?? defaultInteraction.wireframe,
    clipping: initialDiagnosticViewerState?.clipping ?? defaultInteraction.clipping,
    clipAxis: initialDiagnosticViewerState?.clipAxis ?? defaultInteraction.clipAxis,
    clipOffset: initialDiagnosticViewerState?.clipOffset ?? defaultInteraction.clipOffset,
  });
  const [activated, setActivated] = useState(false);
  const [manifestAttempt, setManifestAttempt] = useState(0);
  const [modelAttempt, setModelAttempt] = useState(0);
  const [status, setStatus] = useState<ViewerStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [anonymousShardProgress, setAnonymousShardProgress] = useState<AnonymousShardLoadProgress | null>(null);
  const [loadedQuality, setLoadedQuality] = useState<'preview' | 'high' | null>(null);
  const [manifest, setManifest] = useState<DeviceManifest | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [lodNotice, setLodNotice] = useState('');
  const [ehl2RuntimePolicy, setEhl2RuntimePolicy] = useState<Ehl2RuntimePolicy | null>(null);
  const [autoRotate, setAutoRotate] = useState(initialDiagnosticViewerState?.autoRotate ?? false);
  const [wireframe, setWireframe] = useState(initialDiagnosticViewerState?.wireframe ?? false);
  const [clipping, setClipping] = useState(initialDiagnosticViewerState?.clipping ?? defaultInteraction.clipping);
  const [clipAxis, setClipAxis] = useState<ClipAxis>(initialDiagnosticViewerState?.clipAxis ?? defaultInteraction.clipAxis);
  const [clipOffset, setClipOffset] = useState(initialDiagnosticViewerState?.clipOffset ?? defaultInteraction.clipOffset);
  const [globalOpacity, setGlobalOpacity] = useState(initialDiagnosticViewerState?.globalOpacity ?? 1);
  const [selectedOpacity, setSelectedOpacity] = useState(initialDiagnosticViewerState?.selectedOpacity ?? 1);
  const [partOpacities, setPartOpacityMap] = useState<Readonly<Record<string, number>>>(() => initialDiagnosticViewerState?.partOpacities ?? initialDiagnosticViewerSettings.partOpacities ?? {});
  const [analyticPlasmaVisible, setAnalyticPlasmaVisible] = useState(
    initialDiagnosticViewerState?.analyticPlasmaVisible ?? ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT,
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [activeView, setActiveView] = useState<ViewPreset>(initialDiagnosticViewerState?.activeView ?? 'iso');
  const [cameraView, setCameraView] = useState<ViewSnapshot | null>(initialDiagnosticViewerState?.cameraView ?? null);
  const [stats, setStats] = useState<ViewerStats>({ meshes: 0, triangles: 0, renderer: 'WEBGL 2', parts: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedPartIds, setSelectedPartIds] = useState<Set<string>>(() => new Set(initialDiagnosticViewerState?.selectedPartIds));
  const [hiddenPartIds, setHiddenPartIds] = useState<Set<string>>(() => new Set(initialDiagnosticViewerState?.hiddenPartIds));
  const [isolatedPartIds, setIsolatedPartIds] = useState<Set<string>>(() => new Set(initialDiagnosticViewerState?.isolatedPartIds));
  const [openSystems, setOpenSystems] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    diagnosticViewerStateCallbackRef.current = onDiagnosticViewerStateChange;
  }, [onDiagnosticViewerStateChange]);

  useEffect(() => {
    const incoming = normalizeEhl2DiagnosticViewerSettings(diagnosticViewerSettings);
    const current = diagnosticViewerSettingsRef.current;
    // A partial prop is intentionally incremental. Passing partOpacities: {}
    // explicitly clears that map; omitting it leaves the existing map intact.
    const next: Ehl2DiagnosticViewerSettings = {
      ...current,
      ...incoming,
      ...(incoming.partOpacities === undefined ? {} : { partOpacities: incoming.partOpacities }),
    };
    diagnosticViewerSettingsRef.current = next;
    viewerRef.current?.setDiagnosticViewerSettings(next);
    const accepted = viewerRef.current?.setPartOpacities(next.partOpacities ?? {});
    if (accepted) setPartOpacityMap(accepted);
    else if (incoming.partOpacities !== undefined) setPartOpacityMap(incoming.partOpacities);
  }, [diagnosticViewerSettings]);

  useEffect(() => {
    const parsed = parseEhl2DiagnosticViewerState(diagnosticViewerState);
    if (!parsed) return;
    const next = { ...parsed, wireframe: wireframeAllowed && parsed.wireframe };
    const key = JSON.stringify(next);
    if (key === lastAppliedDiagnosticViewerStateRef.current) return;
    lastAppliedDiagnosticViewerStateRef.current = key;
    pendingControlledViewerStateRef.current = key;

    const selected = new Set(next.selectedPartIds);
    const hidden = new Set(next.hiddenPartIds);
    const isolated = new Set(next.isolatedPartIds);
    selectedPartIdsRef.current = selected;
    hiddenPartIdsRef.current = hidden;
    isolatedPartIdsRef.current = isolated;
    opacityRef.current = { global: next.globalOpacity, selected: next.selectedOpacity };
    analyticPlasmaVisibleRef.current = next.analyticPlasmaVisible;
    interactionRef.current = {
      activeView: next.activeView,
      autoRotate: next.autoRotate,
      wireframe: next.wireframe,
      clipping: next.clipping,
      clipAxis: next.clipAxis,
      clipOffset: next.clipOffset,
    };

    setActiveView(next.activeView);
    setAutoRotate(next.autoRotate);
    setWireframe(next.wireframe);
    setClipping(next.clipping);
    setClipAxis(next.clipAxis);
    setClipOffset(next.clipOffset);
    setGlobalOpacity(next.globalOpacity);
    setSelectedOpacity(next.selectedOpacity);
    setAnalyticPlasmaVisible(next.analyticPlasmaVisible);
    setSelectedPartIds(selected);
    setSelectedPartId(next.selectedPartIds[0] ?? null);
    setHiddenPartIds(hidden);
    setIsolatedPartIds(isolated);
    setPartOpacityMap(next.partOpacities);
    cameraViewRef.current = next.cameraView;
    setCameraView(next.cameraView);

    const viewer = viewerRef.current;
    if (!viewer) return;
    if (next.cameraView) viewer.applyView(next.cameraView);
    else viewer.setView(next.activeView);
    viewer.controls.autoRotate = next.autoRotate;
    viewer.setWireframe(next.wireframe);
    viewer.setClipping(next.clipping, next.clipAxis, next.clipOffset);
    viewer.setOpacity(next.globalOpacity, next.selectedOpacity);
    viewer.setAnalyticPlasmaVisible(next.analyticPlasmaVisible);
    viewer.selectParts(selected);
    viewer.applyVisibility(hidden, isolated);
    const accepted = viewer.setPartOpacities(next.partOpacities);
    setPartOpacityMap(accepted);
  }, [diagnosticViewerState, wireframeAllowed]);

  useEffect(() => {
    const snapshot: Ehl2DiagnosticViewerState = {
      activeView,
      autoRotate,
      wireframe,
      clipping,
      clipAxis,
      clipOffset,
      globalOpacity,
      selectedOpacity,
      analyticPlasmaVisible,
      selectedPartIds: stablePartIds(selectedPartIds),
      hiddenPartIds: stablePartIds(hiddenPartIds),
      isolatedPartIds: stablePartIds(isolatedPartIds),
      partOpacities: Object.fromEntries(Object.entries(partOpacities).sort(([left], [right]) => left.localeCompare(right))),
      cameraView,
    };
    const key = JSON.stringify(snapshot);
    if (pendingControlledViewerStateRef.current) {
      if (key === pendingControlledViewerStateRef.current) {
        lastDiagnosticViewerStateRef.current = key;
        pendingControlledViewerStateRef.current = '';
      }
      return;
    }
    if (key === lastDiagnosticViewerStateRef.current) return;
    lastDiagnosticViewerStateRef.current = key;
    diagnosticViewerStateCallbackRef.current?.(snapshot);
  }, [activeView, analyticPlasmaVisible, autoRotate, cameraView, clipAxis, clipOffset, clipping, globalOpacity, hiddenPartIds, isolatedPartIds, partOpacities, selectedOpacity, selectedPartIds, wireframe]);

  useEffect(() => {
    if (!ehl2Session) return;
    const hintedNavigator = navigator as Navigator & {
      connection?: {
        addEventListener?: (type: 'change', listener: () => void) => void;
        removeEventListener?: (type: 'change', listener: () => void) => void;
      };
    };
    const updatePolicy = () => {
      const policy = currentEhl2RuntimePolicy();
      setEhl2RuntimePolicy(policy);
      if (!policy.allowed) {
        interactionRef.current.wireframe = false;
        viewerRef.current?.setWireframe(false);
        setWireframe(false);
        setProgress(0);
        setStatus('idle');
        setActivated(false);
      }
    };
    updatePolicy();
    window.addEventListener('resize', updatePolicy);
    hintedNavigator.connection?.addEventListener?.('change', updatePolicy);
    return () => {
      window.removeEventListener('resize', updatePolicy);
      hintedNavigator.connection?.removeEventListener?.('change', updatePolicy);
    };
  }, [ehl2Session]);

  const ehl2LoadBlocked = ehl2Session && ehl2RuntimePolicy?.allowed !== true;

  useEffect(() => {
    const nextState = { frame: efitFrame, store: efitStore, alignment: efitAlignment, options: efitOptions };
    efitStateRef.current = nextState;
    const overlay = viewerRef.current?.efitOverlay;
    if (!overlay) return;
    overlay.setAlignment(nextState.alignment);
    overlay.setOptions(nextState.options);
    overlay.setFrame(nextState.frame ?? currentEfitFrame(nextState.store));
  }, [efitAlignment, efitFrame, efitOptions, efitStore]);

  useEffect(() => {
    diagnosticOverlayOptionsRef.current = diagnosticOverlayOptions;
    viewerRef.current?.diagnosticOverlay?.setOptions(diagnosticOverlayOptions);
  }, [diagnosticOverlayOptions]);

  useEffect(() => {
    diagnosticMarkerSelectRef.current = onDiagnosticMarkerSelect;
  }, [onDiagnosticMarkerSelect]);

  useEffect(() => {
    diagnosticFocusPointRef.current = diagnosticFocusPoint;
    if (diagnosticFocusPoint) viewerRef.current?.focusWebPoint(diagnosticFocusPoint);
  }, [diagnosticFocusPoint]);

  useEffect(() => {
    const previous = diagnosticRuntimeReadyRef.current;
    if (previous && previous !== onDiagnosticRuntimeReady) previous(null);
    diagnosticRuntimeReadyRef.current = onDiagnosticRuntimeReady;
    onDiagnosticRuntimeReady?.(diagnosticRuntimeRef.current);
  }, [onDiagnosticRuntimeReady]);

  const availableModels = useMemo(() => viewerModelChoices(manifest), [manifest]);
  const selectedModel = availableModels.find((asset) => asset.id === selectedModelId)
    ?? availableModels[0]
    ?? null;
  const anonymousVisualization = isAnonymousVisualizationManifest(manifest);
  const previewModel = availableModels.find((asset) => asset.quality === 'preview') ?? null;
  const displayedModel = loadedQuality === 'preview' && previewModel
    ? previewModel
    : selectedModel;

  const parts = useMemo(() => manifest?.systems.flatMap((system) => system.parts.map((part) => ({
    ...part,
    systemId: system.id,
    systemTitle: system.title,
    color: system.color,
  }))) ?? [], [manifest]);
  const partById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts]);
  const selectedPart = selectedPartId ? partById.get(selectedPartId) ?? null : null;
  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const filteredPartIds = useMemo(() => new Set(parts.filter((part) => !normalizedQuery
    || `${content(part.title)} ${part.title} ${part.id} ${part.engineeringTag}`.toLocaleLowerCase(locale).includes(normalizedQuery)).map((part) => part.id)), [content, locale, normalizedQuery, parts]);

  const activate = useCallback(() => {
    if (ehl2Session) {
      const policy = currentEhl2RuntimePolicy();
      setEhl2RuntimePolicy(policy);
      if (!policy.allowed) {
        setErrorMessage('');
        setProgress(0);
        setStatus('idle');
        return;
      }
    }
    setErrorMessage('');
    setProgress(0);
    setAnonymousShardProgress(null);
    setLoadedQuality(null);
    setStatus('loading');
    if (!activated) setActivated(true);
    if (activated || status === 'error') {
      if (manifest && isAnonymousVisualizationManifest(manifest)) {
        setModelAttempt((value) => value + 1);
      } else {
        setManifestAttempt((value) => value + 1);
      }
    }
  }, [activated, ehl2Session, manifest, status]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(manifestUrl, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(i18nRef.current.t('viewer.errorManifestHttp', { status: response.status }));
        const loadedManifest = parseDeviceManifest(await response.json(), { manifestUrl });
        if (loadedManifest.access.classification !== 'PUBLIC') throw new Error(i18nRef.current.t('viewer.errorPublicOnly'));
        if (!loadedManifest.access.redistributionAllowed) throw new Error(i18nRef.current.t('viewer.errorRedistribution'));
        if (controller.signal.aborted) return;
        const variants = viewerModelChoices(loadedManifest);
        const preferPreview = shouldPreferPreview();
        const initialChoice = initialViewerModelChoice(variants, preferPreview);
        if (!initialChoice.model) throw new Error(i18nRef.current.t('viewer.errorManifest'));
        const autoLoadAnonymousModel = initialChoice.anonymousHighOnly && !preferPreview;
        if (initialChoice.anonymousHighOnly && autoLoadAnonymousModel) {
          anonymousHighDetailIntentRef.current = true;
        }
        setManifest(loadedManifest);
        setAnonymousShardProgress(null);
        setLoadedQuality(null);
        setOpenSystems(initialChoice.anonymousHighDetailRequiresExplicitAction
          ? new Set()
          : new Set(loadedManifest.systems.map((system) => system.id)));
        if (initialChoice.anonymousHighDetailRequiresExplicitAction && !anonymousHighDetailIntentRef.current) {
          setSelectedModelId(initialChoice.model.id);
        } else {
          setSelectedModelId((current) => variants.some((asset) => asset.id === current)
            ? current
            : initialChoice.model?.id ?? null);
        }
        if (autoLoadAnonymousModel) {
          setErrorMessage('');
          setProgress(0);
          setActivated(true);
          setStatus('loading');
        }
        setLodNotice(initialChoice.autoPreviewApplied
          ? i18nRef.current.t('viewer.autoPreview')
          : '');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? i18nRef.current.content(error.message) : i18nRef.current.t('viewer.errorManifest'));
      });
    return () => controller.abort();
  }, [manifestAttempt, manifestUrl]);

  useEffect(() => {
    if (!activated || !mountRef.current || !manifest || !selectedModel) return;

    let disposed = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | undefined;
    let intersectionObserver: IntersectionObserver | undefined;
    let resizeFallback: (() => void) | undefined;
    let visibilityHandler: (() => void) | undefined;
    let pointerDownHandler: ((event: PointerEvent) => void) | undefined;
    let pointerUpHandler: ((event: PointerEvent) => void) | undefined;
    let pageVisible = !document.hidden;
    let inViewport = true;
    let localRenderer: WebGLRenderer | null = null;
    let localControls: OrbitControls | null = null;
    let localScene: Scene | null = null;
    let localModel: Object3D | null = null;
    let localEfitOverlay: EfitThreeOverlay | null = null;
    let localDiagnosticOverlay: Ehl2DiagnosticThreeOverlay | null = null;
    let localDiagnosticRuntime: Ehl2DiagnosticRuntime | null = null;
    let localDisposableMaterials: Set<Material> | null = null;
    let localDisposableTextures: Set<Texture> | null = null;
    let localEnvironmentTarget: WebGLRenderTarget | null = null;
    const modelLoadController = new AbortController();
    let resourcesReleased = false;

    const releaseResources = () => {
      if (resourcesReleased) return;
      resourcesReleased = true;
      modelLoadController.abort();
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (resizeFallback) window.removeEventListener('resize', resizeFallback);
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      if (pointerDownHandler) localRenderer?.domElement.removeEventListener('pointerdown', pointerDownHandler);
      if (pointerUpHandler) localRenderer?.domElement.removeEventListener('pointerup', pointerUpHandler);
      if (localDiagnosticRuntime) {
        localDiagnosticRuntime.dispose();
        if (diagnosticRuntimeRef.current === localDiagnosticRuntime) {
          diagnosticRuntimeRef.current = null;
          diagnosticRuntimeReadyRef.current?.(null);
        }
        localDiagnosticRuntime = null;
      }
      localControls?.dispose();
      localDiagnosticOverlay?.dispose();
      localDiagnosticOverlay = null;
      localEfitOverlay?.dispose();
      localEfitOverlay = null;
      if (localScene) localScene.environment = null;
      localEnvironmentTarget?.dispose();
      localEnvironmentTarget = null;
      if (localModel && localModel.parent !== localScene) disposeObject(localModel);
      localScene?.traverse((node) => {
        const renderable = node as Object3D & { geometry?: { dispose: () => void } };
        renderable.geometry?.dispose();
      });
      localDisposableMaterials?.forEach((material) => material.dispose());
      localDisposableTextures?.forEach((texture) => texture.dispose());
      if (localRenderer) {
        localRenderer.renderLists.dispose();
        localRenderer.dispose();
        localRenderer.forceContextLoss();
        localRenderer.domElement.remove();
      }
      localScene?.clear();
      localControls = null;
      localRenderer = null;
      localScene = null;
      localModel = null;
      localDisposableMaterials = null;
      localDisposableTextures = null;
    };

    async function initialise() {
      // React effects never run during SSR. Keep the browser-only Three.js loader graph out of
      // the server bundle as well, otherwise vinext emits a second, unreachable copy of every
      // viewer/runtime chunk into dist/server/ssr.
      if ((import.meta as ImportMeta & { env: { SSR: boolean } }).env.SSR) return;
      if (!supportsWebGL2()) throw new Error(i18nRef.current.t('viewer.errorWebgl2'));

      const environmentModulePromise = (appearancePreset === 'industrial-silver-v1'
        || appearancePreset === 'assembly-color-v1')
        ? import('three/examples/jsm/environments/RoomEnvironment.js')
        : Promise.resolve(null);
      const diagnosticOverlayModulePromise = diagnosticOverlaySession
        ? import('./device-viewer/Ehl2DiagnosticThreeOverlay')
        : Promise.resolve(null);
      const diagnosticRuntimeModulePromise = ehl2Session
        ? import('./device-viewer/ehl2DiagnosticRuntime')
        : Promise.resolve(null);
      const [THREE, controlsModule, loaderModule, meshoptModule, efitOverlayModule, diagnosticOverlayModule, diagnosticRuntimeModule, environmentModule] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
        import('./device-viewer/EfitThreeOverlay'),
        diagnosticOverlayModulePromise,
        diagnosticRuntimeModulePromise,
        environmentModulePromise,
      ]);
      if (disposed || !mountRef.current) return;
      if (!manifest || !selectedModel) throw new Error(i18nRef.current.t('viewer.errorModelNotReady'));
      const loadedManifest = manifest;
      const loadedModel = selectedModel;

      const mount = mountRef.current;
      const industrialAppearance = appearancePreset === 'industrial-silver-v1'
        || appearancePreset === 'assembly-color-v1';
      const closeInspection = cameraProfile === 'close-inspection';
      const initialSceneTheme = resolveCadSceneTheme(visualThemeRef.current, appearancePreset);
      const scene = new THREE.Scene();
      localScene = scene;
      scene.fog = new THREE.FogExp2(
        initialSceneTheme.fogColor,
        initialSceneTheme.fogDensity,
      );
      const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 120);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      localRenderer = renderer;
      const pixelRatioLimit = loadedModel.quality === 'high' && window.innerWidth >= 1200 ? 2 : 1.5;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioLimit));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = initialSceneTheme.exposure;
      renderer.setClearColor(initialSceneTheme.clearColor, initialSceneTheme.clearAlpha);
      renderer.localClippingEnabled = true;
      renderer.domElement.setAttribute('aria-label', i18nRef.current.t(
        isAnonymousVisualizationManifest(loadedManifest) ? 'viewer.threeAriaAnonymous' : 'viewer.threeAria', {
        title: i18nRef.current.content(loadedManifest.title),
        },
      ));
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.tabIndex = 0;
      mount.replaceChildren(renderer.domElement);

      const controls = new controlsModule.OrbitControls(camera, renderer.domElement);
      localControls = controls;
      controls.enableDamping = true;
      controls.dampingFactor = 0.075;
      controls.rotateSpeed = 0.62;
      controls.zoomSpeed = closeInspection ? 1.08 : 0.72;
      controls.panSpeed = closeInspection ? 0.82 : 0.55;
      controls.zoomToCursor = closeInspection;
      controls.screenSpacePanning = closeInspection;
      controls.minDistance = 4.2;
      controls.maxDistance = 15;
      controls.autoRotateSpeed = 0.72;
      controls.addEventListener('end', () => {
        if (disposed) return;
        const snapshot = {
          position: camera.position.toArray() as [number, number, number],
          target: controls.target.toArray() as [number, number, number],
          up: camera.up.toArray() as [number, number, number],
        };
        cameraViewRef.current = snapshot;
        setCameraView(snapshot);
      });

      let applyLightTheme: (theme: ResolvedTheme) => void;
      let defaultSceneLights: Object3D[] = [];
      if (industrialAppearance) {
        if (!environmentModule) throw new Error(i18nRef.current.t('viewer.errorEnvironment'));
        const roomEnvironment = new environmentModule.RoomEnvironment();
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        try {
          pmremGenerator.compileEquirectangularShader();
          localEnvironmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
          scene.environment = localEnvironmentTarget.texture;
          scene.environmentIntensity = initialSceneTheme.environmentIntensity;
        } finally {
          roomEnvironment.dispose();
          pmremGenerator.dispose();
        }
        const rig = initialSceneTheme.lights;
        if (rig.kind !== 'industrial') throw new Error(i18nRef.current.t('viewer.errorEnvironment'));
        const hemisphere = new THREE.HemisphereLight(rig.hemisphere.sky, rig.hemisphere.ground, rig.hemisphere.intensity);
        const key = new THREE.DirectionalLight(rig.key.color, rig.key.intensity);
        key.position.set(...rig.key.position);
        const fill = new THREE.DirectionalLight(rig.fill.color, rig.fill.intensity);
        fill.position.set(...rig.fill.position);
        const rim = new THREE.DirectionalLight(rig.rim.color, rig.rim.intensity);
        rim.position.set(...rig.rim.position);
        scene.add(hemisphere, key, fill, rim);
        defaultSceneLights = [hemisphere, key, fill, rim];
        applyLightTheme = (theme) => {
          const next = resolveCadSceneTheme(theme, appearancePreset).lights;
          if (next.kind !== 'industrial') return;
          hemisphere.color.setHex(next.hemisphere.sky);
          hemisphere.groundColor.setHex(next.hemisphere.ground);
          hemisphere.intensity = next.hemisphere.intensity;
          key.color.setHex(next.key.color); key.intensity = next.key.intensity;
          fill.color.setHex(next.fill.color); fill.intensity = next.fill.intensity;
          rim.color.setHex(next.rim.color); rim.intensity = next.rim.intensity;
        };
      } else {
        const rig = initialSceneTheme.lights;
        if (rig.kind !== 'semantic') throw new Error(i18nRef.current.t('viewer.errorEnvironment'));
        const hemisphere = new THREE.HemisphereLight(rig.hemisphere.sky, rig.hemisphere.ground, rig.hemisphere.intensity);
        const key = new THREE.DirectionalLight(rig.key.color, rig.key.intensity);
        key.position.set(...rig.key.position);
        const warm = new THREE.PointLight(rig.warm.color, rig.warm.intensity, 20, 1.7);
        warm.position.set(...rig.warm.position);
        const violet = new THREE.PointLight(rig.violet.color, rig.violet.intensity, 16, 1.8);
        violet.position.set(...rig.violet.position);
        scene.add(hemisphere, key, warm, violet);
        defaultSceneLights = [hemisphere, key, warm, violet];
        applyLightTheme = (theme) => {
          const next = resolveCadSceneTheme(theme, appearancePreset).lights;
          if (next.kind !== 'semantic') return;
          hemisphere.color.setHex(next.hemisphere.sky);
          hemisphere.groundColor.setHex(next.hemisphere.ground);
          hemisphere.intensity = next.hemisphere.intensity;
          key.color.setHex(next.key.color); key.intensity = next.key.intensity;
          warm.color.setHex(next.warm.color); warm.intensity = next.warm.intensity;
          violet.color.setHex(next.violet.color); violet.intensity = next.violet.intensity;
        };
      }

      const viewerMaterials = new Set<Material>();
      const disposableMaterials = new Set<Material>();
      const disposableTextures = new Set<Texture>();
      const materialByAppearanceKey = new Map<string, MeshStandardMaterial>();
      const plasmaMaterials = new Set<MeshStandardMaterial>();
      let analyticPlasmaSurfaceMaterial: MeshStandardMaterial | null = null;
      let analyticPlasmaPulseBase = 3.15;
      let analyticPlasmaPulseAmplitude = 0.35;
      let applyAnalyticPlasmaTheme: (theme: ResolvedTheme) => void = () => undefined;
      const createSemanticMaterial = (category: DeviceManifest['systems'][number]['category']) => {
        switch (category) {
          case 'plasma': return new THREE.MeshPhysicalMaterial({ color: 0xff6a1e, emissive: 0xff3d09, emissiveIntensity: 3.4, roughness: 0.18, metalness: 0.08, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
          case 'tf': return new THREE.MeshStandardMaterial({ color: 0x42d9c8, emissive: 0x0a665f, emissiveIntensity: 0.48, roughness: 0.3, metalness: 0.72 });
          case 'pf': return new THREE.MeshStandardMaterial({ color: 0x9476ff, emissive: 0x37216e, emissiveIntensity: 0.42, roughness: 0.32, metalness: 0.7 });
          case 'layer': return new THREE.MeshStandardMaterial({ color: 0x8d775f, emissive: 0x170c05, emissiveIntensity: 0.06, roughness: 0.56, metalness: 0.68, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
          default: return new THREE.MeshStandardMaterial({ color: 0x7f958d, emissive: 0x10231d, emissiveIntensity: 0.18, roughness: 0.46, metalness: 0.78 });
        }
      };
      const materialForSystem = (
        system: DeviceManifest['systems'][number] | undefined,
        anonymousAssemblyPreset?: keyof typeof INDUSTRIAL_MATERIAL_SPECS,
      ) => {
        const category = system?.category ?? 'structure';
        const appearanceKey = industrialAppearance
          ? `industrial:${anonymousAssemblyPreset ?? resolveIndustrialMaterialPreset(system?.id ?? '', category)}`
          : `semantic:${category}`;
        const existing = materialByAppearanceKey.get(appearanceKey);
        if (existing) return existing;
        let material: MeshStandardMaterial;
        if (industrialAppearance) {
          const spec = anonymousAssemblyPreset
            ? INDUSTRIAL_MATERIAL_SPECS[anonymousAssemblyPreset]
            : resolveIndustrialMaterialSpec(system?.id ?? '', category);
          const common = {
            color: spec.color,
            emissive: spec.emissive ?? 0x000000,
            emissiveIntensity: spec.emissiveIntensity ?? 0,
            metalness: spec.metalness,
            roughness: spec.roughness,
            envMapIntensity: spec.envMapIntensity,
            transparent: spec.transparent ?? false,
            opacity: spec.opacity ?? 1,
            depthWrite: !(spec.transparent ?? false),
            side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
          };
          material = spec.kind === 'physical'
            ? new THREE.MeshPhysicalMaterial({ ...common, clearcoat: spec.clearcoat ?? 0, clearcoatRoughness: spec.clearcoatRoughness ?? 0 })
            : new THREE.MeshStandardMaterial(common);
        } else {
          material = createSemanticMaterial(category);
        }
        material.name = `FusionDigital:${appearanceKey}`;
        materialByAppearanceKey.set(appearanceKey, material);
        viewerMaterials.add(material);
        disposableMaterials.add(material);
        if (category === 'plasma') plasmaMaterials.add(material);
        return material;
      };
      localDisposableMaterials = disposableMaterials;
      localDisposableTextures = disposableTextures;

      const meshoptDecoder = meshoptModule.MeshoptDecoder;
      const loader = new loaderModule.GLTFLoader();
      loader.setMeshoptDecoder(meshoptDecoder);
      let resolvedLoadQuality: 'preview' | 'high' = loadedModel.quality;
      let anonymousFallbackReason: Error | null = null;
      const model: Object3D = await globalModelDecodeGate.run(async () => {
        let ehl2MeshoptWorkerEnabled = false;
        if (ehl2Session
          && typeof Worker === 'function'
          && typeof Blob === 'function'
          && typeof URL.createObjectURL === 'function'
          && typeof URL.revokeObjectURL === 'function'
          && typeof meshoptDecoder.useWorkers === 'function') {
          try {
            // One worker removes the synchronous 2.47M-triangle decode from the
            // UI thread without multiplying decoded-buffer concurrency.
            meshoptDecoder.useWorkers(1);
            ehl2MeshoptWorkerEnabled = true;
          } catch {
            // Worker creation can be unavailable under a restrictive CSP. Keep
            // the existing decoder path, and do not affect other device loads.
            try { meshoptDecoder.useWorkers(0); } catch { /* best-effort reset */ }
          }
        }
        try {
          const anonymousBundle = loadedManifest.assets.shardBundles?.[0];
          if (anonymousBundle) {
            const preview = loadedManifest.assets.webModel;
            const reportAnonymousProgress = (nextProgress: AnonymousShardLoadProgress) => {
              if (disposed || nextProgress.totalBytes <= 0) return;
              setAnonymousShardProgress(nextProgress);
              setProgress(Math.min(99, Math.round((nextProgress.loadedBytes / nextProgress.totalBytes) * 100)));
            };
            if (!preview) {
              if (!isAnonymousShardChoice(loadedModel) || loadedModel.id !== anonymousBundle.id) {
                throw new Error(i18nRef.current.t('viewer.errorModelNotReady'));
              }
              resolvedLoadQuality = 'high';
              return loadVerifiedAnonymousShardBundle(anonymousBundle, {
                loader,
                createGroup: () => new THREE.Group(),
                signal: modelLoadController.signal,
                onProgress: reportAnonymousProgress,
              });
            }
            const userInitiatedHighDetail = isAnonymousShardChoice(loadedModel)
              && anonymousHighDetailIntentRef.current;
            const result = await loadAnonymousDeviceModelWithFallback(preview, anonymousBundle, {
              loader,
              createGroup: () => new THREE.Group(),
              signal: modelLoadController.signal,
              requestedQuality: isAnonymousShardChoice(loadedModel)
                ? requestedAnonymousQuality(loadedModel, userInitiatedHighDetail)
                : 'preview',
              userInitiatedHighDetail,
              onProgress: reportAnonymousProgress,
              onFallback: (error) => {
                anonymousFallbackReason = error;
              },
            });
            resolvedLoadQuality = result.quality;
            anonymousFallbackReason = result.fallbackReason ?? anonymousFallbackReason;
            if (result.fallbackUsed) anonymousHighDetailIntentRef.current = false;
            return result.model;
          }
          if (loadedModel.delivery === 'components') {
            const hintedNavigator = navigator as Navigator & { deviceMemory?: number };
            const concurrency = typeof hintedNavigator.deviceMemory === 'number' && hintedNavigator.deviceMemory < 8 ? 1 : 2;
            return loadVerifiedComponentBundle(loadedModel, {
              loader,
              createGroup: () => new THREE.Group(),
              signal: modelLoadController.signal,
              concurrency,
              onProgress: (loadedBytes, totalBytes) => {
                if (!disposed && totalBytes > 0) setProgress(Math.min(99, Math.round((loadedBytes / totalBytes) * 100)));
              },
            });
          }
          if (isAnonymousShardChoice(loadedModel)) {
            throw new Error(i18nRef.current.t('viewer.errorModelNotReady'));
          }
          return loadVerifiedMonolithicModel(loadedModel, {
            loader,
            signal: modelLoadController.signal,
            onProgress: (loadedBytes, totalBytes) => {
              if (!disposed && totalBytes > 0) setProgress(Math.min(99, Math.round((loadedBytes / totalBytes) * 100)));
            },
          });
        } finally {
          if (ehl2MeshoptWorkerEnabled) meshoptDecoder.useWorkers(0);
        }
      });
      if (disposed) {
        disposeObject(model);
        return;
      }

      localModel = model;
      const sourceMaterials = new Set<Material>();
      const originalMaterials = new Map<Mesh, Material | Material[]>();
      const nodeByPartId = new Map<string, Object3D>();
      const partIdByNode = new WeakMap<Object3D, string>();
      const systemByNodeName = new Map<string, { partId: string }>();
      const systemByPartId = new Map<string, DeviceManifest['systems'][number]>();
      const anonymousTransport = isAnonymousShardChoice(loadedModel)
        || isAnonymousVisualizationManifest(loadedManifest);
      const exl50uAssemblyPresentation = viewerId === 'exl50u-general-assembly-20260630'
        && appearancePreset === 'assembly-color-v1'
        && anonymousTransport;
      if (!anonymousTransport) {
        loadedManifest.systems.forEach((system) => system.parts.forEach((part) => systemByNodeName.set(part.nodeName, { partId: part.id })));
        loadedManifest.systems.forEach((system) => system.parts.forEach((part) => systemByPartId.set(part.id, system)));
      }
      let meshes = 0;
      let triangles = 0;
      let drawVertices = 0;
      model.updateWorldMatrix(true, true);
      const sourceBox = new THREE.Box3().setFromObject(model, true);
      const sourceSize = sourceBox.getSize(new THREE.Vector3());
      const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
      const sourceOriginCentre = new THREE.Vector3(0, sourceCenter.y, 0);
      const presentationCentre = exl50uAssemblyPresentation && sourceBox.containsPoint(sourceOriginCentre)
        ? sourceOriginCentre
        : sourceCenter;
      const sourceModelRadius = Math.max(
        sourceBox.getBoundingSphere(new THREE.Sphere()).radius,
        0.1,
      );

      model.traverse((node) => {
        const mapped = systemByNodeName.get(node.name);
        if (mapped) {
          if (nodeByPartId.has(mapped.partId)) throw new Error(i18nRef.current.t('viewer.errorDuplicateNode', { node: node.name }));
          nodeByPartId.set(mapped.partId, node);
          node.traverse((descendant) => partIdByNode.set(descendant, mapped.partId));
        }
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;
        meshes += 1;
        materialList(mesh.material).forEach((material) => {
          sourceMaterials.add(material);
          // If a later integrity/metric gate throws after the material has
          // been detached from the scene, releaseResources still owns it.
          disposableMaterials.add(material);
        });
        const inheritedPartId = partIdByNode.get(mesh);
        const system = inheritedPartId ? systemByPartId.get(inheritedPartId) : undefined;
        let anonymousAssemblyPreset: keyof typeof INDUSTRIAL_MATERIAL_SPECS | undefined;
        if (appearancePreset === 'assembly-color-v1' && anonymousTransport) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          const localDefinitionBox = mesh.geometry.boundingBox?.clone();
          const meshSize = localDefinitionBox
            ?.clone()
            ?.applyMatrix4(mesh.matrixWorld)
            .getSize(new THREE.Vector3()) ?? new THREE.Vector3();
          const meshCentre = new THREE.Vector3();
          if (mesh instanceof THREE.InstancedMesh && mesh.count > 0 && localDefinitionBox) {
            const definitionCentre = localDefinitionBox.getCenter(new THREE.Vector3());
            const instanceMatrix = new THREE.Matrix4();
            const instanceWorldMatrix = new THREE.Matrix4();
            const instanceCentre = new THREE.Vector3();
            for (let instanceIndex = 0; instanceIndex < mesh.count; instanceIndex += 1) {
              mesh.getMatrixAt(instanceIndex, instanceMatrix);
              instanceWorldMatrix.multiplyMatrices(mesh.matrixWorld, instanceMatrix);
              instanceCentre.copy(definitionCentre).applyMatrix4(instanceWorldMatrix);
              meshCentre.add(instanceCentre);
            }
            meshCentre.multiplyScalar(1 / mesh.count);
          } else {
            new THREE.Box3().setFromObject(mesh, true).getCenter(meshCentre);
          }
          anonymousAssemblyPreset = resolveAnonymousAssemblyMaterialPreset({
            size: meshSize.toArray() as [number, number, number],
            centre: meshCentre.toArray() as [number, number, number],
            assemblySize: sourceSize.toArray() as [number, number, number],
            assemblyCentre: presentationCentre.toArray() as [number, number, number],
            ordinal: meshes,
          });
        }
        const replacement = materialForSystem(system, anonymousAssemblyPreset);
        mesh.material = replacement;
        originalMaterials.set(mesh, replacement);
        const positionCount = mesh.geometry.attributes.position?.count ?? 0;
        const placementCount = 'isInstancedMesh' in mesh && mesh.isInstancedMesh === true
          && 'count' in mesh && typeof mesh.count === 'number'
          ? mesh.count
          : 1;
        drawVertices += positionCount * placementCount;
        triangles += (mesh.geometry.index ? mesh.geometry.index.count / 3 : positionCount / 3) * placementCount;
      });
      if (loadedModel.delivery === 'components'
        && (Math.round(triangles) !== loadedModel.sceneDrawTriangles
          || drawVertices !== loadedModel.sceneDrawVertices
          || meshes !== loadedModel.meshInstances)) {
        throw new Error(i18nRef.current.t('viewer.errorModelNotReady'));
      }
      if (isAnonymousShardChoice(loadedModel) && resolvedLoadQuality === 'high'
        && (Math.round(triangles) !== loadedModel.sceneDrawTriangles
          || meshes !== loadedModel.drawCalls)) {
        throw new Error(i18nRef.current.t('viewer.errorModelNotReady'));
      }
      if (!anonymousTransport) {
        const expectedParts = loadedManifest.systems.flatMap((system) => system.parts);
        const missingParts = expectedParts.filter((part) => !nodeByPartId.has(part.id));
        if (missingParts.length > 0) throw new Error(i18nRef.current.t('viewer.errorMissingNodes', {
          nodes: missingParts.map((part) => part.nodeName).join(', '),
        }));
        const unmappedMeshes = allMeshes(model).filter((mesh) => !partIdByNode.has(mesh));
        if (unmappedMeshes.length > 0) throw new Error(i18nRef.current.t('viewer.errorUnmappedMeshes', {
          count: unmappedMeshes.length,
        }));
      }
      sourceMaterials.forEach((material) => {
        material.dispose();
        disposableMaterials.delete(material);
      });

      const longestSide = Math.max(sourceSize.x, sourceSize.y, sourceSize.z) || 1;
      const displayScale = 6.1 / longestSide;
      model.scale.setScalar(displayScale);
      model.position.copy(sourceCenter).multiplyScalar(-displayScale);
      scene.add(model);

      // The long hall envelope pulls the geometric midpoint far away from the
      // EXL-50U host machine. Keep the full assembly in the fitted bounds, but
      // orbit and zoom around the stable source origin used by the device so a
      // close inspection does not converge into the empty aisle between them.
      const exl50uPresentationTarget = presentationCentre.clone()
        .sub(sourceCenter)
        .multiplyScalar(displayScale);

      const fittedBox = new THREE.Box3().setFromObject(model);
      const fittedSphere = fittedBox.getBoundingSphere(new THREE.Sphere());
      const presentationTarget = exl50uAssemblyPresentation
        ? exl50uPresentationTarget
        : fittedSphere.center.clone();
      const fittedSize = fittedBox.getSize(new THREE.Vector3());
      const floorY = fittedBox.min.y - 0.42;
      if (exl50uAssemblyPresentation) {
        const identity = createExl50uPresentationIdentity(
          THREE,
          renderer.capabilities.getMaxAnisotropy(),
        );
        identity.materials.forEach((material) => disposableMaterials.add(material));
        identity.textures.forEach((texture) => disposableTextures.add(texture));
        // Mount in the CAD's metre frame; inherit its centring and display
        // scale instead of anchoring a sibling above the full hall envelope.
        model.add(identity.root);
      }
      let groundMaterial: MeshStandardMaterial | null = null;
      if (appearancePreset === 'assembly-color-v1') {
        const groundWidth = Math.max(18, fittedSize.x + fittedSphere.radius * 2.8);
        const groundDepth = Math.max(18, fittedSize.z + fittedSphere.radius * 2.8);
        const groundGeometry = new THREE.PlaneGeometry(groundWidth, groundDepth);
        groundMaterial = new THREE.MeshStandardMaterial({
          color: initialSceneTheme.ground.color,
          metalness: initialSceneTheme.ground.metalness,
          roughness: initialSceneTheme.ground.roughness,
          side: THREE.DoubleSide,
        });
        groundMaterial.name = 'FusionDigital:assembly-presentation-ground';
        disposableMaterials.add(groundMaterial);
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.name = 'FUSIONDIGITAL_ASSEMBLY_PRESENTATION_GROUND';
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(presentationTarget.x, floorY - 0.025, presentationTarget.z);
        ground.receiveShadow = true;
        scene.add(ground);
      }
      const grid = new THREE.GridHelper(
        18,
        36,
        initialSceneTheme.grid.center,
        initialSceneTheme.grid.line,
      );
      grid.position.set(presentationTarget.x, floorY, presentationTarget.z);
      materialList(grid.material).forEach((material) => {
        material.transparent = true;
        material.opacity = initialSceneTheme.grid.opacity;
        disposableMaterials.add(material);
      });
      scene.add(grid);
      const orbitMaterial = new THREE.MeshBasicMaterial({
        color: initialSceneTheme.orbit.color,
        transparent: true,
        opacity: initialSceneTheme.orbit.opacity,
        side: THREE.DoubleSide,
      });
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(3.72, 0.008, 6, 180), orbitMaterial);
      disposableMaterials.add(orbitMaterial);
      orbit.rotation.x = Math.PI / 2;
      orbit.position.set(presentationTarget.x, floorY + 0.03, presentationTarget.z);
      scene.add(orbit);

      const applyDiagnosticViewerSettings = (settings: Ehl2DiagnosticViewerSettings) => {
        const normalized = normalizeEhl2DiagnosticViewerSettings(settings);
        // An omitted preset preserves the viewer's industrial RoomEnvironment
        // default. The explicit `none` state is authoritative for both image-
        // based lighting and the optional scene background. Settings are
        // applied to the live scene, so switching/restoring never reloads CAD.
        const roomEnvironmentTexture = normalized.environmentPreset !== 'none'
          ? localEnvironmentTarget?.texture ?? null
          : null;
        scene.environment = roomEnvironmentTexture;
        if (normalized.environmentIntensity !== undefined) scene.environmentIntensity = normalized.environmentIntensity;
        // The generated RoomEnvironment is a portable Three.js substitute,
        // not an assertion of source-HDRI parity. A requested background fails
        // closed when the preset is `none` or the industrial target is absent.
        scene.background = normalized.backgroundEnabled === true ? roomEnvironmentTexture : null;
        if (normalized.backgroundIntensity !== undefined) scene.backgroundIntensity = normalized.backgroundIntensity;
        if (normalized.backgroundBlurriness !== undefined) scene.backgroundBlurriness = normalized.backgroundBlurriness;
        if (normalized.defaultLightsEnabled !== undefined) {
          const visible = normalized.defaultLightsEnabled;
          defaultSceneLights.forEach((light) => { light.visible = visible; });
        }
        if (normalized.castShadow !== undefined) {
          renderer.shadowMap.enabled = normalized.castShadow;
          defaultSceneLights.forEach((light) => {
            if ('castShadow' in light) (light as Object3D & { castShadow: boolean }).castShadow = normalized.castShadow ?? false;
          });
          model.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            node.castShadow = normalized.castShadow ?? false;
            node.receiveShadow = normalized.castShadow ?? false;
          });
        }
      };

      const setVisualTheme = (theme: ResolvedTheme) => {
        const next = resolveCadSceneTheme(theme, appearancePreset);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.setHex(next.fogColor);
          scene.fog.density = scaleCadFogDensity(
            next.fogDensity,
            appearancePreset,
            sourceModelRadius,
          );
        }
        renderer.toneMappingExposure = next.exposure;
        renderer.setClearColor(next.clearColor, next.clearAlpha);
        scene.environmentIntensity = diagnosticViewerSettingsRef.current.environmentIntensity ?? next.environmentIntensity;
        if (groundMaterial) {
          groundMaterial.color.setHex(next.ground.color);
          groundMaterial.metalness = next.ground.metalness;
          groundMaterial.roughness = next.ground.roughness;
          groundMaterial.needsUpdate = true;
        }
        applyLightTheme(theme);

        const positions = grid.geometry.getAttribute('position');
        const colors = grid.geometry.getAttribute('color');
        const center = new THREE.Color(next.grid.center);
        const line = new THREE.Color(next.grid.line);
        if (positions && colors) {
          for (let index = 0; index < positions.count; index += 1) {
            const isCenterLine = Math.abs(positions.getX(index)) < 0.0001
              || Math.abs(positions.getZ(index)) < 0.0001;
            const color = isCenterLine ? center : line;
            colors.setXYZ(index, color.r, color.g, color.b);
          }
          colors.needsUpdate = true;
        }
        materialList(grid.material).forEach((material) => {
          material.opacity = next.grid.opacity;
          material.needsUpdate = true;
        });
        orbitMaterial.color.setHex(next.orbit.color);
        orbitMaterial.opacity = next.orbit.opacity;
        orbitMaterial.needsUpdate = true;
        applyAnalyticPlasmaTheme(theme);
        applyDiagnosticViewerSettings(diagnosticViewerSettingsRef.current);
      };

      const target = presentationTarget.clone();
      const modelRadius = Math.max(fittedSphere.radius, 0.1);
      let currentPreset: ViewPreset = interactionRef.current.activeView;
      const setView = (preset: ViewPreset) => {
        currentPreset = preset;
        const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(camera.aspect, 0.1));
        const limitingHalfFov = Math.max(0.08, Math.min(verticalHalfFov, horizontalHalfFov));
        const distance = (modelRadius / Math.sin(limitingHalfFov)) * 1.45;
        camera.near = closeInspection
          ? Math.max(0.0005, modelRadius * 0.00035)
          : Math.max(0.01, modelRadius * 0.005);
        camera.far = Math.max(distance * 4.5 + modelRadius * 2, modelRadius * 24);
        controls.minDistance = modelRadius * (closeInspection ? 0.025 : 1.2);
        controls.maxDistance = distance * 3.8;
        camera.up.set(0, 1, 0);
        const direction = new THREE.Vector3(0.92, 0.58, 1).normalize();
        if (preset === 'front') direction.set(0, 0.025, 1).normalize();
        if (preset === 'top') { camera.up.set(0, 0, -1); direction.set(0, 1, 0.001).normalize(); }
        camera.position.copy(target).addScaledVector(direction, distance);
        controls.target.copy(target);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        controls.update();
      };

      const clippingPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
      const analyticPlasmaDefinition = loadedManifest.visualizations?.analyticPlasma;
      let analyticPlasmaRoot: Object3D | null = null;
      let analyticFluxBandRoot: Object3D | null = null;
      if (analyticPlasmaDefinition) {
        const geometryData = buildAnalyticPlasmaGeometry(analyticPlasmaDefinition);
        const plasmaRoot = new THREE.Group();
        plasmaRoot.name = 'ITER_ANALYTIC_PLASMA_PROXY';
        plasmaRoot.visible = analyticPlasmaVisibleRef.current;
        plasmaRoot.userData = {
          kind: analyticPlasmaDefinition.kind,
          ...ANALYTIC_PLASMA_RUNTIME_SEMANTICS,
          sourceUrl: analyticPlasmaDefinition.sourceUrl,
        };

        const surfaceGeometry = new THREE.BufferGeometry();
        surfaceGeometry.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(geometryData.surface95.positions, 3),
        );
        surfaceGeometry.setIndex(new THREE.Uint32BufferAttribute(geometryData.surface95.indices, 1));
        surfaceGeometry.computeVertexNormals();
        surfaceGeometry.computeBoundingSphere();
        const surfaceMaterial = new THREE.MeshPhysicalMaterial({
          color: 0xff7a35,
          emissive: 0xff4f16,
          emissiveIntensity: 3.15,
          roughness: 0.2,
          metalness: 0.04,
          clearcoat: 0.28,
          clearcoatRoughness: 0.2,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        surfaceMaterial.name = 'FusionDigital:analytic-plasma-proxy:surface95';
        const surface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
        surface.name = 'ITER_ANALYTIC_PLASMA_SURFACE_95';
        // The proxy is contextual geometry, never a selectable CAD component.
        // Explicitly suppress raycasting so clicks pass through to reviewed
        // assembly nodes without relying on the absence of a part mapping.
        surface.raycast = () => undefined;
        surface.userData = { ...ANALYTIC_PLASMA_RUNTIME_SEMANTICS };
        surface.renderOrder = 8;
        plasmaRoot.add(surface);
        viewerMaterials.add(surfaceMaterial);
        disposableMaterials.add(surfaceMaterial);
        plasmaMaterials.add(surfaceMaterial);

        const contourMaterial = new THREE.LineBasicMaterial({
          color: 0xffb06d,
          transparent: true,
          opacity: 0.96,
          depthTest: false,
          depthWrite: false,
        });
        contourMaterial.name = 'FusionDigital:analytic-plasma-proxy:separatrix-reference';
        const fluxBandRoot = new THREE.Group();
        fluxBandRoot.name = 'ITER_ANALYTIC_FLUX_COORDINATE_SECTION';
        fluxBandRoot.userData = { ...ANALYTIC_PLASMA_RUNTIME_SEMANTICS };
        plasmaRoot.add(fluxBandRoot);
        const fluxBandMaterials = geometryData.fluxCoordinateBands.map((band, bandIndex) => {
          const bandGeometry = new THREE.BufferGeometry();
          bandGeometry.setAttribute('position', new THREE.Float32BufferAttribute(band.positions, 3));
          bandGeometry.setIndex(new THREE.Uint32BufferAttribute(band.indices, 1));
          bandGeometry.computeBoundingSphere();
          const bandMaterial = new THREE.MeshBasicMaterial({
            color: ANALYTIC_FLUX_DARK_COLORS[bandIndex],
            transparent: true,
            opacity: 0.88,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          bandMaterial.name = `FusionDigital:analytic-flux-coordinate:${bandIndex + 1}`;
          const bandMesh = new THREE.Mesh(bandGeometry, bandMaterial);
          bandMesh.name = `ITER_ANALYTIC_FLUX_COORDINATE_BAND_${bandIndex + 1}`;
          bandMesh.raycast = () => undefined;
          bandMesh.userData = {
            ...ANALYTIC_PLASMA_RUNTIME_SEMANTICS,
            normalizedRadiusMin: band.normalizedRadiusMin,
            normalizedRadiusMax: band.normalizedRadiusMax,
          };
          bandMesh.renderOrder = 10 + bandIndex;
          fluxBandRoot.add(bandMesh);
          viewerMaterials.add(bandMaterial);
          disposableMaterials.add(bandMaterial);
          return bandMaterial;
        });
        analyticPlasmaSurfaceMaterial = surfaceMaterial;
        applyAnalyticPlasmaTheme = (theme) => {
          const light = theme === 'light';
          surfaceMaterial.color.setHex(light ? 0xc86236 : 0xff7a35);
          surfaceMaterial.emissive.setHex(light ? 0x7c2815 : 0xff4f16);
          contourMaterial.color.setHex(light ? 0x99482f : 0xffb06d);
          fluxBandMaterials.forEach((material, index) => {
            material.color.setHex((light ? ANALYTIC_FLUX_LIGHT_COLORS : ANALYTIC_FLUX_DARK_COLORS)[index]);
            material.opacity = light ? 0.84 : 0.9;
            material.needsUpdate = true;
          });
          analyticPlasmaPulseBase = light ? 1.05 : 3.15;
          analyticPlasmaPulseAmplitude = light ? 0.12 : 0.35;
          surfaceMaterial.needsUpdate = true;
          contourMaterial.needsUpdate = true;
        };
        applyAnalyticPlasmaTheme(visualThemeRef.current);
        viewerMaterials.add(contourMaterial);
        disposableMaterials.add(contourMaterial);
        geometryData.separatrixReferenceContours.forEach((positions, contourIndex) => {
          const contourGeometry = new THREE.BufferGeometry();
          contourGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          contourGeometry.computeBoundingSphere();
          const contour = new THREE.Line(contourGeometry, contourMaterial);
          contour.name = `ITER_ANALYTIC_PLASMA_REFERENCE_CONTOUR_${contourIndex + 1}`;
          contour.raycast = () => undefined;
          contour.userData = { ...ANALYTIC_PLASMA_RUNTIME_SEMANTICS };
          contour.renderOrder = 9;
          plasmaRoot.add(contour);
        });

        model.add(plasmaRoot);
        analyticPlasmaRoot = plasmaRoot;
        analyticFluxBandRoot = fluxBandRoot;
      }
      const initialEfitState = efitStateRef.current;
      // `model` began as the identity glTF scene wrapper and now owns only the
      // viewer fit. Its CAD child owns the source mm -> web-metre transform,
      // while EFIT points are already web metres. Adding the overlay to the
      // wrapper makes both inherit the same displayScale/sourceCenter fit
      // without applying the CAD conversion twice.
      localEfitOverlay = efitOverlayModule.createEfitThreeOverlay(
        { physicalWebMetresRoot: model, renderer, clippingPlane },
        initialEfitState.alignment,
        initialEfitState.options,
      );
      localEfitOverlay.setFrame(initialEfitState.frame ?? currentEfitFrame(initialEfitState.store));
      if (diagnosticOverlayModule) {
        localDiagnosticOverlay = diagnosticOverlayModule.createEhl2DiagnosticThreeOverlay(
          { physicalWebMetresRoot: model },
          diagnosticOverlayOptionsRef.current,
        );
      }
      const semanticHighlightMaterial = industrialAppearance ? null : new THREE.MeshPhysicalMaterial({ color: 0xffd06b, emissive: 0xff6a1e, emissiveIntensity: 1.8, roughness: 0.22, metalness: 0.56, transparent: false, opacity: 1, side: THREE.DoubleSide });
      if (semanticHighlightMaterial) disposableMaterials.add(semanticHighlightMaterial);
      const selectionMaterials = new Set<Material>();
      const selectionMaterialByBase = new Map<Material, Material>();
      const baseOpacity = new Map<Material, number>();
      viewerMaterials.forEach((material) => baseOpacity.set(material, material.opacity));
      const baseMaterialByMesh = new Map<Mesh, Material | Material[]>(originalMaterials);
      const partOpacityMaterials = new Set<Material>();
      let currentPartOpacities: Readonly<Record<string, number>> = {};
      const applyVisibility = (hidden: Set<string>, isolated: Set<string>) => {
        nodeByPartId.forEach((node, partId) => { node.visible = isolated.size > 0 ? isolated.has(partId) : !hidden.has(partId); });
      };
      const applyMaterialOpacity = (material: Material, opacity: number) => {
        material.opacity = Math.max(0, Math.min(1, opacity));
        material.transparent = material.opacity < 0.999;
        material.depthWrite = material.opacity >= 0.999;
        material.needsUpdate = true;
      };
      const disposeMaterialSet = (materials: Set<Material>) => {
        materials.forEach((material) => {
          material.dispose();
          disposableMaterials.delete(material);
        });
        materials.clear();
      };
      let currentSelectedOpacity = opacityRef.current.selected;
      const industrialSelectionMaterial = (baseMaterial: Material) => {
        const existing = selectionMaterialByBase.get(baseMaterial);
        if (existing) return existing;
        const selectedMaterial = baseMaterial.clone();
        selectedMaterial.name = `${baseMaterial.name}:selected`;
        selectedMaterial.clippingPlanes = baseMaterial.clippingPlanes ? [...baseMaterial.clippingPlanes] : null;
        if (selectedMaterial instanceof THREE.MeshStandardMaterial) {
          selectedMaterial.color.lerp(new THREE.Color(INDUSTRIAL_STUDIO.selection.tint), INDUSTRIAL_STUDIO.selection.mix);
          selectedMaterial.emissive.setHex(INDUSTRIAL_STUDIO.selection.emissive);
          selectedMaterial.emissiveIntensity = INDUSTRIAL_STUDIO.selection.emissiveIntensity;
          selectedMaterial.roughness = Math.max(0.12, selectedMaterial.roughness + INDUSTRIAL_STUDIO.selection.roughnessDelta);
        }
        applyMaterialOpacity(selectedMaterial, currentSelectedOpacity);
        selectionMaterialByBase.set(baseMaterial, selectedMaterial);
        selectionMaterials.add(selectedMaterial);
        disposableMaterials.add(selectedMaterial);
        return selectedMaterial;
      };
      const selectedMaterialFor = (material: Material | Material[]) => {
        if (semanticHighlightMaterial) return semanticHighlightMaterial;
        return Array.isArray(material)
          ? material.map((candidate) => industrialSelectionMaterial(candidate))
          : industrialSelectionMaterial(material);
      };
      const interactiveMaterials = () => new Set<Material>([
        ...viewerMaterials,
        ...partOpacityMaterials,
        ...selectionMaterials,
        ...(semanticHighlightMaterial ? [semanticHighlightMaterial] : []),
      ]);
      let cadClippingEnabled = false;
      let diagnosticClippingPlanes: Plane[] = [];
      const activeCadClippingPlanes = () => [
        ...(cadClippingEnabled ? [clippingPlane] : []),
        ...diagnosticClippingPlanes,
      ];
      const applyCadClippingPlanes = () => {
        const planes = activeCadClippingPlanes();
        interactiveMaterials().forEach((material) => {
          material.clippingPlanes = planes.length > 0 ? [...planes] : null;
          material.clipIntersection = false;
          material.needsUpdate = true;
        });
      };
      if (diagnosticRuntimeModule) {
        if (selectedModel.delivery !== 'monolithic') throw new Error('The EHL-2 diagnostic runtime requires one manifest-pinned monolithic analysis asset.');
        localDiagnosticRuntime = diagnosticRuntimeModule.createEhl2DiagnosticRuntime({
          provenance: {
            schema: 'fusiondigital.ehl2-public-cad-v1',
            deviceId: viewerId,
            assetId: selectedModel.id,
            modelPath: selectedModel.path,
            modelSha256: selectedModel.sha256.toUpperCase(),
            coordinateFrame: 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1',
            engine: 'three-mesh-bvh-v1',
          },
          physicalWebMetresRoot: model,
          meshes: [...originalMaterials.keys()].map((mesh) => {
            const partId = partIdByNode.get(mesh);
            if (!partId) throw new Error(i18nRef.current.t('viewer.errorUnmappedMeshes', { count: 1 }));
            return { mesh, partId, model: nodeByPartId.get(partId)?.name || mesh.name || partId };
          }),
          renderer,
          scene,
          camera,
          getActiveClippingPlanes: activeCadClippingPlanes,
          setDiagnosticClippingPlanes: (planes) => {
            diagnosticClippingPlanes = [...planes];
            applyCadClippingPlanes();
          },
        });
        diagnosticRuntimeRef.current = localDiagnosticRuntime;
        diagnosticRuntimeReadyRef.current?.(localDiagnosticRuntime);
      }
      let highlightedPartIds = new Set<string>();
      const selectParts = (partIds: Set<string>) => {
        highlightedPartIds = new Set(partIds);
        originalMaterials.forEach((material, mesh) => { mesh.material = baseMaterialByMesh.get(mesh) ?? material; });
        partIds.forEach((partId) => {
          const node = nodeByPartId.get(partId);
          if (node) allMeshes(node).forEach((mesh) => {
            const baseMaterial = baseMaterialByMesh.get(mesh) ?? originalMaterials.get(mesh);
            if (baseMaterial) mesh.material = selectedMaterialFor(baseMaterial);
          });
        });
      };
      const setOpacity = (overall: number, selected: number) => {
        currentSelectedOpacity = selected;
        originalMaterials.forEach((sourceMaterial, mesh) => {
          const partId = partIdByNode.get(mesh);
          const partOpacity = partId ? currentPartOpacities[partId] ?? 1 : 1;
          const currentMaterial = baseMaterialByMesh.get(mesh) ?? sourceMaterial;
          const sourceList = materialList(sourceMaterial);
          materialList(currentMaterial).forEach((material, index) => {
            applyMaterialOpacity(material, (baseOpacity.get(sourceList[index]) ?? 1) * overall * partOpacity);
          });
        });
        selectionMaterials.forEach((material) => applyMaterialOpacity(material, selected));
        if (semanticHighlightMaterial) applyMaterialOpacity(semanticHighlightMaterial, selected);
        selectParts(highlightedPartIds);
      };
      const setPartOpacities = (next: Readonly<Record<string, number>>) => {
        const checked = safePartOpacityMap(next) ?? {};
        const accepted: Record<string, number> = {};
        Object.entries(checked).forEach(([partId, opacity]) => {
          if (nodeByPartId.has(partId)) accepted[partId] = opacity;
        });
        // A material may be shared by multiple CAD nodes. Clone only affected
        // mesh materials so a per-part setting cannot bleed into neighbours.
        disposeMaterialSet(selectionMaterials);
        selectionMaterialByBase.clear();
        disposeMaterialSet(partOpacityMaterials);
        baseMaterialByMesh.clear();
        originalMaterials.forEach((sourceMaterial, mesh) => {
          const partId = partIdByNode.get(mesh);
          const opacity = partId ? accepted[partId] : undefined;
          if (opacity === undefined || opacity === 1) {
            baseMaterialByMesh.set(mesh, sourceMaterial);
            return;
          }
          const cloned = Array.isArray(sourceMaterial)
            ? sourceMaterial.map((material) => material.clone())
            : sourceMaterial.clone();
          materialList(cloned).forEach((material) => {
            material.name = `${material.name}:part-opacity:${partId}`;
            partOpacityMaterials.add(material);
            disposableMaterials.add(material);
          });
          baseMaterialByMesh.set(mesh, cloned);
        });
        currentPartOpacities = accepted;
        setOpacity(opacityRef.current.global, currentSelectedOpacity);
        return accepted;
      };
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const setRaycasterFromPointer = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
      };
      const pickPointMarker = (event: PointerEvent) => {
        setRaycasterFromPointer(event);
        return localDiagnosticOverlay?.pickPointMarker(raycaster) ?? null;
      };
      const pickPart = (event: PointerEvent) => {
        setRaycasterFromPointer(event);
        for (const hit of raycaster.intersectObject(model, true)) {
          let node: Object3D | null = hit.object;
          let visible = true;
          while (node && node !== model) {
            if (!node.visible) { visible = false; break; }
            node = node.parent;
          }
          if (!visible) continue;
          node = hit.object;
          while (node && node !== model) {
            const partId = partIdByNode.get(node);
            if (partId) return partId;
            node = node.parent;
          }
        }
        return null;
      };
      const focusWebPoint = (pointWebMetres: readonly [number, number, number]) => {
        if (pointWebMetres.length !== 3 || pointWebMetres.some((value) => !Number.isFinite(value))) return;
        model.updateWorldMatrix(true, false);
        const targetWorld = model.localToWorld(new THREE.Vector3(
          pointWebMetres[0],
          pointWebMetres[1],
          pointWebMetres[2],
        ));
        const viewOffset = camera.position.clone().sub(controls.target);
        if (viewOffset.lengthSq() <= 1e-12) viewOffset.set(0.92, 0.58, 1);
        const focusDistance = Math.min(
          viewOffset.length(),
          Math.max(controls.minDistance, modelRadius * 1.25),
        );
        viewOffset.normalize().multiplyScalar(focusDistance);
        controls.target.copy(targetWorld);
        camera.position.copy(targetWorld).add(viewOffset);
        camera.lookAt(targetWorld);
        camera.updateProjectionMatrix();
        controls.update();
      };

      const resize = (refit: boolean) => {
        if (!mountRef.current) return;
        const width = Math.max(1, mountRef.current.clientWidth);
        const height = Math.max(1, mountRef.current.clientHeight);
        camera.aspect = width / height;
        renderer.setSize(width, height, false);
        localEfitOverlay?.resize(width, height);
        if (refit) {
          setView(currentPreset);
        } else {
          camera.updateProjectionMatrix();
          controls.update();
        }
      };
      // Only the first measured layout is allowed to fit the whole model. Every
      // observer/fullscreen resize preserves the live camera, including wheel
      // zooms for which OrbitControls does not reliably emit a durable `end`.
      resize(true);
      const restoredView = cameraViewRef.current ?? viewSnapshotRef.current;
      if (restoredView) {
        camera.position.fromArray(restoredView.position);
        controls.target.fromArray(restoredView.target);
        camera.up.fromArray(restoredView.up);
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
        controls.update();
      }
      if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(() => resize(false)); resizeObserver.observe(mount); }
      else { resizeFallback = () => resize(false); window.addEventListener('resize', resizeFallback); }
      if (typeof IntersectionObserver !== 'undefined') {
        intersectionObserver = new IntersectionObserver(([entry]) => { inViewport = entry.isIntersecting; }, { rootMargin: '120px' });
        intersectionObserver.observe(mount);
      }
      visibilityHandler = () => { pageVisible = !document.hidden; };
      document.addEventListener('visibilitychange', visibilityHandler);
      pointerDownHandler = (event) => { pointerDownRef.current = { x: event.clientX, y: event.clientY }; };
      pointerUpHandler = (event) => {
        const start = pointerDownRef.current;
        pointerDownRef.current = null;
        if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
        const markerId = pickPointMarker(event);
        if (markerId) {
          diagnosticMarkerSelectRef.current?.(markerId);
          return;
        }
        const partId = pickPart(event);
        const additive = event.ctrlKey || event.metaKey || event.shiftKey;
        const next = additive ? new Set(selectedPartIdsRef.current) : new Set<string>();
        if (partId) {
          if (next.has(partId) && additive) next.delete(partId);
          else next.add(partId);
        }
        selectedPartIdsRef.current = next;
        setSelectedPartIds(next);
        setSelectedPartId(partId && next.has(partId) ? partId : next.values().next().value ?? null);
        selectParts(next);
      };
      renderer.domElement.addEventListener('pointerdown', pointerDownHandler);
      renderer.domElement.addEventListener('pointerup', pointerUpHandler);

      const startedAt = performance.now();
      const render = (now: number) => {
        if (disposed) return;
        if (pageVisible && inViewport) {
          plasmaMaterials.forEach((material) => {
            const isAnalyticProxy = material === analyticPlasmaSurfaceMaterial;
            material.emissiveIntensity = (isAnalyticProxy ? analyticPlasmaPulseBase : 3.15)
              + Math.sin((now - startedAt) * 0.0022)
                * (isAnalyticProxy ? analyticPlasmaPulseAmplitude : 0.35);
          });
          controls.update();
          renderer.render(scene, camera);
        }
        frame = window.requestAnimationFrame(render);
      };
      frame = window.requestAnimationFrame(render);

      viewerRef.current = {
        controls,
        renderer,
        model,
        clippingPlane,
        originalMaterials,
        nodeByPartId,
        partIdByNode,
        materials: viewerMaterials,
        disposableMaterials,
        setView,
        reset: () => setView('iso'),
        setWireframe: (enabled) => {
          // Three.js expands indexed triangles into a second line-index buffer
          // for wireframe rendering. Never permit that allocation for EHL-2.
          if (ehl2Session && enabled) return;
          interactiveMaterials().forEach((material) => {
            if ('wireframe' in material) { (material as Material & { wireframe: boolean }).wireframe = enabled; material.needsUpdate = true; }
          });
        },
        setClipping: (enabled, axis, offset) => {
          clippingPlane.normal.set(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0);
          clippingPlane.constant = offset * modelRadius;
          cadClippingEnabled = enabled;
          applyCadClippingPlanes();
          localEfitOverlay?.setClippingEnabled(enabled);
          if (analyticFluxBandRoot) analyticFluxBandRoot.visible = enabled && axis === 'z';
        },
        setOpacity,
        setPartOpacities,
        setDiagnosticViewerSettings: (settings) => {
          applyDiagnosticViewerSettings(settings);
        },
        setVisualTheme,
        setAnalyticPlasmaVisible: (visible) => {
          if (analyticPlasmaRoot) analyticPlasmaRoot.visible = visible;
        },
        applyVisibility,
        selectParts,
        pickPart,
        focusWebPoint,
        captureView: () => ({
          position: camera.position.toArray() as [number, number, number],
          target: controls.target.toArray() as [number, number, number],
          up: camera.up.toArray() as [number, number, number],
        }),
        applyView: (snapshot) => {
          camera.position.fromArray(snapshot.position);
          controls.target.fromArray(snapshot.target);
          camera.up.fromArray(snapshot.up);
          camera.lookAt(controls.target);
          camera.updateProjectionMatrix();
          controls.update();
        },
        resize,
        efitOverlay: localEfitOverlay,
        diagnosticOverlay: localDiagnosticOverlay,
        diagnosticRuntime: localDiagnosticRuntime,
      };
      setVisualTheme(visualThemeRef.current);
      selectParts(selectedPartIdsRef.current);
      applyVisibility(hiddenPartIdsRef.current, isolatedPartIdsRef.current);
      const acceptedPartOpacities = setPartOpacities(diagnosticViewerSettingsRef.current.partOpacities ?? {});
      setPartOpacityMap(acceptedPartOpacities);
      setOpacity(opacityRef.current.global, opacityRef.current.selected);
      viewerRef.current.setWireframe(wireframeAllowed && interactionRef.current.wireframe);
      viewerRef.current.setClipping(
        interactionRef.current.clipping,
        interactionRef.current.clipAxis,
        interactionRef.current.clipOffset,
      );
      viewerRef.current.setAnalyticPlasmaVisible(analyticPlasmaVisibleRef.current);
      if (diagnosticFocusPointRef.current) viewerRef.current.focusWebPoint(diagnosticFocusPointRef.current);
      controls.autoRotate = interactionRef.current.autoRotate;
      setStats({ meshes, triangles: Math.round(triangles), renderer: renderer.capabilities.isWebGL2 ? 'WEBGL 2' : 'WEBGL', parts: nodeByPartId.size });
      setProgress(100);
      setLoadedQuality(resolvedLoadQuality);
      setStatus('ready');
      const settledAnonymousFallbackReason = anonymousFallbackReason as Error | null;
      setLodNotice(settledAnonymousFallbackReason
        ? i18nRef.current.t('viewer.highFallback', {
          reason: i18nRef.current.content(settledAnonymousFallbackReason.message),
        })
        : '');
    }

    initialise().catch((error: unknown) => {
      if (disposed) return;
      releaseResources();
      const preview = availableModels.find((asset) => asset.quality === 'preview');
      if (selectedModel.quality === 'high' && preview && preview.id !== selectedModel.id) {
        const reason = error instanceof Error ? i18nRef.current.content(error.message) : i18nRef.current.t('viewer.errorUnknown');
        setLodNotice(i18nRef.current.t('viewer.highFallback', { reason }));
        setProgress(0);
        setAnonymousShardProgress(null);
        setLoadedQuality(null);
        setStatus('loading');
        anonymousHighDetailIntentRef.current = false;
        setSelectedModelId(preview.id);
        return;
      }
      setStatus('error');
      setErrorMessage(error instanceof Error ? i18nRef.current.content(error.message) : i18nRef.current.t('viewer.errorModel'));
    });

    return () => { disposed = true; releaseResources(); viewerRef.current = null; };
  }, [activated, appearancePreset, availableModels, cameraProfile, diagnosticOverlaySession, ehl2Session, manifest, modelAttempt, selectedModel, viewerId, wireframeAllowed]);

  useEffect(() => {
    const overlay = viewerRef.current?.efitOverlay;
    if (!overlay || !efitStore) return;
    let renderedIdentity: string | null = null;
    const sync = () => {
      const frame = efitStateRef.current.frame ?? currentEfitFrame(efitStore);
      const identity = efitFrameIdentity(frame);
      if (identity === renderedIdentity) return;
      renderedIdentity = identity;
      overlay.setFrame(frame);
    };
    sync();
    return efitStore.subscribe(sync);
  }, [efitStore, selectedModelId, status]);

  useEffect(() => {
    const title = manifest?.title;
    if (title && viewerRef.current?.renderer.domElement) {
      viewerRef.current.renderer.domElement.setAttribute('aria-label', t(
        anonymousVisualization ? 'viewer.threeAriaAnonymous' : 'viewer.threeAria',
        { title: content(title) },
      ));
    }
  }, [anonymousVisualization, content, manifest?.title, status, t]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === fullscreenRef.current);
      // Fullscreen changes the viewport, not the user's inspection target.
      requestAnimationFrame(() => requestAnimationFrame(() => viewerRef.current?.resize(false)));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const selectView = (preset: ViewPreset) => {
    viewSnapshotRef.current = null;
    cameraViewRef.current = null;
    interactionRef.current.activeView = preset;
    viewerRef.current?.setView(preset);
    setActiveView(preset);
    setCameraView(null);
  };
  const toggleAutoRotate = () => {
    const next = !autoRotate;
    interactionRef.current.autoRotate = next;
    if (viewerRef.current) viewerRef.current.controls.autoRotate = next;
    setAutoRotate(next);
  };
  const toggleWireframe = () => {
    if (!wireframeAllowed) return;
    const next = !wireframe;
    interactionRef.current.wireframe = next;
    viewerRef.current?.setWireframe(next);
    setWireframe(next);
  };
  const toggleClipping = () => {
    const next = !clipping;
    interactionRef.current.clipping = next;
    viewerRef.current?.setClipping(next, clipAxis, clipOffset);
    setClipping(next);
  };
  const toggleAnalyticPlasma = () => {
    const next = !analyticPlasmaVisible;
    analyticPlasmaVisibleRef.current = next;
    viewerRef.current?.setAnalyticPlasmaVisible(next);
    setAnalyticPlasmaVisible(next);
  };
  const updateClipAxis = (axis: ClipAxis) => {
    interactionRef.current.clipAxis = axis;
    setClipAxis(axis);
    viewerRef.current?.setClipping(clipping, axis, clipOffset);
  };
  const updateClipOffset = (value: number) => {
    interactionRef.current.clipOffset = value;
    setClipOffset(value);
    viewerRef.current?.setClipping(clipping, clipAxis, value);
  };
  const updateGlobalOpacity = (value: number) => {
    opacityRef.current.global = value;
    setGlobalOpacity(value);
    viewerRef.current?.setOpacity(value, opacityRef.current.selected);
  };
  const updateSelectedOpacity = (value: number) => {
    opacityRef.current.selected = value;
    setSelectedOpacity(value);
    viewerRef.current?.setOpacity(opacityRef.current.global, value);
  };
  const resetView = () => {
    viewerRef.current?.reset();
    if (viewerRef.current) { viewerRef.current.controls.autoRotate = false; viewerRef.current.setWireframe(false); }
    selectedPartIdsRef.current = new Set();
    hiddenPartIdsRef.current = new Set();
    isolatedPartIdsRef.current = new Set();
    viewSnapshotRef.current = null;
    cameraViewRef.current = null;
    setCameraView(null);
    interactionRef.current = { ...defaultInteraction };
    setActiveView('iso'); setAutoRotate(false); setWireframe(false); setSelectedPartId(null); setSelectedPartIds(new Set()); setIsolatedPartIds(new Set()); setHiddenPartIds(new Set());
    opacityRef.current = { global: 1, selected: 1 };
    setClipAxis(defaultInteraction.clipAxis); setClipOffset(defaultInteraction.clipOffset); setClipping(defaultInteraction.clipping); setGlobalOpacity(1); setSelectedOpacity(1);
    viewerRef.current?.selectParts(new Set()); viewerRef.current?.applyVisibility(new Set(), new Set());
    viewerRef.current?.setClipping(defaultInteraction.clipping, defaultInteraction.clipAxis, defaultInteraction.clipOffset); viewerRef.current?.setOpacity(1, 1);
    if (manifest?.visualizations?.analyticPlasma) {
      analyticPlasmaVisibleRef.current = ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT;
      setAnalyticPlasmaVisible(ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT);
      viewerRef.current?.setAnalyticPlasmaVisible(ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT);
    }
  };
  const selectPart = (partId: string, additive = false) => {
    const next = additive ? new Set(selectedPartIds) : new Set<string>();
    if (additive && next.has(partId)) next.delete(partId); else next.add(partId);
    selectedPartIdsRef.current = next;
    setSelectedPartIds(next); setSelectedPartId(next.has(partId) ? partId : next.values().next().value ?? null);
    isolatedPartIdsRef.current = new Set();
    setIsolatedPartIds(new Set()); viewerRef.current?.selectParts(next); viewerRef.current?.applyVisibility(hiddenPartIdsRef.current, new Set());
  };
  const selectFilteredParts = () => {
    const next = new Set(filteredPartIds);
    selectedPartIdsRef.current = next;
    isolatedPartIdsRef.current = new Set();
    setSelectedPartIds(next); setSelectedPartId(next.values().next().value ?? null); setIsolatedPartIds(new Set());
    viewerRef.current?.selectParts(next); viewerRef.current?.applyVisibility(hiddenPartIdsRef.current, new Set());
  };
  const clearSelection = () => {
    selectedPartIdsRef.current = new Set();
    isolatedPartIdsRef.current = new Set();
    setSelectedPartIds(new Set()); setSelectedPartId(null); setIsolatedPartIds(new Set());
    viewerRef.current?.selectParts(new Set()); viewerRef.current?.applyVisibility(hiddenPartIdsRef.current, new Set());
  };
  const setPartIdsVisibility = (partIds: Set<string>, visible: boolean) => {
    const next = new Set(hiddenPartIds);
    partIds.forEach((partId) => visible ? next.delete(partId) : next.add(partId));
    hiddenPartIdsRef.current = next;
    isolatedPartIdsRef.current = new Set();
    setHiddenPartIds(next); setIsolatedPartIds(new Set()); viewerRef.current?.applyVisibility(next, new Set());
  };
  const togglePartVisibility = (partId: string) => {
    const next = new Set(hiddenPartIds);
    if (next.has(partId)) next.delete(partId); else next.add(partId);
    hiddenPartIdsRef.current = next;
    isolatedPartIdsRef.current = new Set();
    setHiddenPartIds(next); setIsolatedPartIds(new Set()); viewerRef.current?.applyVisibility(next, new Set());
  };
  const isolateSelection = () => {
    const next = isolatedPartIds.size > 0 ? new Set<string>() : new Set(selectedPartIds);
    isolatedPartIdsRef.current = next;
    setIsolatedPartIds(next); viewerRef.current?.applyVisibility(hiddenPartIdsRef.current, next);
  };
  const toggleSystem = (systemId: string) => {
    const next = new Set(openSystems);
    if (next.has(systemId)) next.delete(systemId); else next.add(systemId);
    setOpenSystems(next);
  };
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await fullscreenRef.current?.requestFullscreen(); }
    catch { setFullscreen(false); }
  };
  const selectModel = (modelId: string) => {
    const next = availableModels.find((asset) => asset.id === modelId);
    const retryAnonymousHigh = isAnonymousShardChoice(next)
      && next.id === selectedModel?.id
      && loadedQuality === 'preview';
    if (!next
      || (next.id === selectedModel?.id && !retryAnonymousHigh)
      || (next.id === presentationModel?.id && !retryAnonymousHigh)) return;
    anonymousHighDetailIntentRef.current = isAnonymousShardChoice(next);
    viewSnapshotRef.current = viewerRef.current?.captureView() ?? viewSnapshotRef.current;
    setLodNotice(t('viewer.switching', { model: content(next.label), size: megabytes(next.bytes) }));
    setProgress(0);
    setAnonymousShardProgress(null);
    setLoadedQuality(null);
    if (activated) setStatus('loading');
    if (retryAnonymousHigh) setModelAttempt((value) => value + 1);
    else setSelectedModelId(next.id);
  };
  const ready = status === 'ready';
  const ehl2ConstraintMessage = ehl2RuntimePolicy === null
    ? t('viewer.ehlChecking')
    : ehl2RuntimePolicy.reasons.map((reason) => {
      switch (reason) {
        case 'mobile': return t('viewer.ehlBlockedMobile');
        case 'narrow-viewport': return t('viewer.ehlBlockedNarrow');
        case 'save-data': return t('viewer.ehlBlockedSaveData');
        case 'low-memory': return t('viewer.ehlBlockedMemory');
        default: return '';
      }
    }).filter(Boolean).join(' · ');
  const packageBase = manifestUrl.slice(0, manifestUrl.lastIndexOf('/'));
  const sourceCadPath = manifest?.assets.sourceCad?.path ?? `${packageBase}/${viewerId}.step`;
  const presentationModel = status === 'ready' ? displayedModel : selectedModel;
  const webModelPath = presentationModel?.delivery === 'monolithic'
    ? presentationModel.path
    : manifest?.assets.webModel?.path ?? `${packageBase}/${viewerId}.glb`;
  const posterPath = manifest?.assets.poster?.path ?? (workspace ? null : '/models/paramak-tokamak-demo/paramak-tokamak-demo-poster.png');
  const isParamakPackage = manifest?.devicePackage.kind === 'public-demonstrator' || viewerId.includes('paramak');
  const estimatedMegabytes = presentationModel?.bytes ? megabytes(presentationModel.bytes) : manifest?.assets.webModel?.bytes ? megabytes(manifest.assets.webModel.bytes) : workspace ? '2.2' : '1.1';
  const applicabilityStatement = manifest?.disclaimer ? content(manifest.disclaimer) : t('viewer.defaultDisclaimer');
  const shardProgressLabel = anonymousShardProgress?.shardIndex && anonymousShardProgress.shardCount > 0
    ? t('viewer.shardProgress', {
      current: anonymousShardProgress.shardIndex,
      total: anonymousShardProgress.shardCount,
      phase: t(anonymousShardProgress.phase === 'decode' ? 'viewer.shardDecode' : 'viewer.shardDownload'),
    })
    : '';

  return (
    <section id={sectionId ?? (workspace ? 'prototype-workspace' : 'device-3d')} className={`tokamakCadSection${workspace ? ' tokamakCadSection--workspace' : ''} appearance-${appearancePreset}`} data-three-viewer={viewerId} data-cad-theme={resolvedTheme} aria-labelledby={`${viewerId}-title`}>
      <div className="tokamakCadIntro">
        <p className="tokamakCadIndex">{workspace ? 'WORKSPACE / FULL-DEVICE DIGITAL MOCK-UP' : '03D / DEVICE PACKAGE VIEWER'}</p>
        <div>
          <h2 id={`${viewerId}-title`}>{anonymousVisualization
            ? t('viewer.introAnonymous')
            : workspace ? t('viewer.introWorkspace') : t('viewer.introStandalone')}</h2>
          <p>{manifest
            ? t(anonymousVisualization ? 'viewer.manifestReadyAnonymous' : 'viewer.manifestReady', { title: content(manifest.title) })
            : t('viewer.onDemand')}</p>
        </div>
      </div>

      <div className={`tokamakCadShell status-${status}${anonymousVisualization ? ' tokamakCadShell--anonymous' : ''}`} ref={fullscreenRef}>
        <div className="tokamakCadTopbar">
          <div className="tokamakCadIdentity"><span className="tokamakCadPulse" aria-hidden="true" /><div><b>{manifest?.title.toUpperCase() ?? 'MANIFEST-DRIVEN TOKAMAK PACKAGE'}</b><small>{t(anonymousVisualization ? 'viewer.anonymousPackageSummary' : 'viewer.packageSummary')}</small></div></div>
          <div className="tokamakCadTopbarActions">
            {availableModels.length > 1 && <fieldset className="tokamakCadLodSelector" aria-label={t('viewer.modelPrecision')}>
              <legend className="srOnly">{t('viewer.modelPrecision')}</legend>
              {availableModels.map((asset) => <button
                type="button"
                key={asset.id}
                className={`${presentationModel?.id === asset.id ? 'active ' : ''}${isAnonymousShardChoice(asset) ? 'tokamakCadLodHighAction' : ''}`.trim()}
                aria-pressed={presentationModel?.id === asset.id}
                disabled={status === 'loading' && selectedModel?.id === asset.id}
                onClick={() => selectModel(asset.id)}
                title={`${content(asset.label)} · ${megabytes(asset.bytes)} MB${asset.decodedGpuBytes ? ` · ${t('viewer.decodedMemory', { size: megabytes(asset.decodedGpuBytes) })}` : ''}${viewerModelTriangleCount(asset) ? ` · ${formatCount(viewerModelTriangleCount(asset) ?? 0, locale)} triangles` : ''}`}
              >{asset.quality === 'high' ? t('viewer.high') : t('viewer.standard')} <small>{isAnonymousShardChoice(asset) ? `${t('viewer.explicitLoad')} · ` : ''}{megabytes(asset.bytes)} MB{asset.decodedGpuBytes ? ` · ${megabytes(asset.decodedGpuBytes)} MB RAM` : ''}</small></button>)}
            </fieldset>}
            <div className="tokamakCadStatus" aria-live="polite"><span>{ready ? `${content(presentationModel?.label ?? 'STANDARD')} · MODEL ONLINE` : status === 'loading' ? `STREAMING ${progress}%${shardProgressLabel ? ` · ${shardProgressLabel}` : ''}` : status === 'error' ? 'FALLBACK MODE' : 'STANDBY'}</span><i aria-hidden="true" /></div>
          </div>
        </div>

        <div className="tokamakCadWorkspace">
          {!anonymousVisualization && <aside className="tokamakCadTree" aria-label={t('viewer.assemblyTree')}>
            <div className="tokamakCadPanelHead"><span>ASSEMBLY TREE</span><b>{ready ? `${stats.parts} PARTS` : 'MANIFEST'}</b></div>
            <label className="tokamakCadSearch"><span className="srOnly">{t('viewer.search')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('viewer.searchPlaceholder')} disabled={!ready} /></label>
            <div className="tokamakCadTreeActions" aria-label={t('viewer.bulkActions')}>
              <button type="button" disabled={!ready || filteredPartIds.size === 0} onClick={selectFilteredParts}>{t('viewer.selectFiltered')}</button>
              <button type="button" disabled={!ready || selectedPartIds.size === 0} onClick={clearSelection}>{t('viewer.clearSelection')}</button>
              <button type="button" disabled={!ready || filteredPartIds.size === 0} onClick={() => setPartIdsVisibility(filteredPartIds, false)}>{t('viewer.hideFiltered')}</button>
              <button type="button" disabled={!ready || hiddenPartIds.size === 0} onClick={() => setPartIdsVisibility(new Set(hiddenPartIds), true)}>{t('viewer.showAll')}</button>
              <button type="button" className={isolatedPartIds.size > 0 ? 'active' : ''} disabled={!ready || selectedPartIds.size === 0} onClick={isolateSelection}>{isolatedPartIds.size > 0 ? t('viewer.exitIsolation') : t('viewer.isolateSelected')}</button>
            </div>
            <div className="tokamakCadTreeScroll">
              {manifest?.systems.map((system) => {
                const visibleParts = system.parts.filter((part) => !normalizedQuery || `${content(part.title)} ${part.title} ${part.id} ${part.engineeringTag}`.toLocaleLowerCase(locale).includes(normalizedQuery));
                if (normalizedQuery && visibleParts.length === 0) return null;
                const expanded = normalizedQuery ? true : openSystems.has(system.id);
                return <div className="tokamakCadSystem" key={system.id}>
                  <button type="button" className="tokamakCadSystemButton" aria-expanded={expanded} onClick={() => toggleSystem(system.id)}><i style={{ background: system.color }} /><span>{content(system.title)}<small>{system.shortTitle} · {system.parts.length}</small></span><b>{expanded ? '−' : '+'}</b></button>
                  {expanded && <div className="tokamakCadParts">{visibleParts.map((part) => <div className={`tokamakCadPart${selectedPartIds.has(part.id) ? ' active' : ''}${hiddenPartIds.has(part.id) ? ' hidden' : ''}`} key={part.id}>
                    <button type="button" className="tokamakCadPartToggle" onClick={() => selectPart(part.id, true)} aria-label={t(selectedPartIds.has(part.id) ? 'viewer.removeSelection' : 'viewer.addSelection', { part: content(part.title) })} aria-pressed={selectedPartIds.has(part.id)}>{selectedPartIds.has(part.id) ? '✓' : ''}</button>
                    <button type="button" className="tokamakCadPartSelect" onClick={(event) => selectPart(part.id, event.ctrlKey || event.metaKey || event.shiftKey)} aria-pressed={selectedPartIds.has(part.id)}><span>{content(part.title)}</span><small>{part.id}</small></button>
                    <button type="button" className="tokamakCadIconButton" onClick={() => togglePartVisibility(part.id)} aria-label={t(hiddenPartIds.has(part.id) ? 'viewer.showPart' : 'viewer.hidePart', { part: content(part.title) })} aria-pressed={hiddenPartIds.has(part.id)}>{hiddenPartIds.has(part.id) ? '○' : '●'}</button>
                  </div>)}</div>}
                </div>;
              })}
              {ready && normalizedQuery && filteredPartIds.size === 0 && <p className="tokamakCadEmpty">{t('viewer.noMatches')}</p>}
            </div>
          </aside>}

          <div className="tokamakCadViewportShell">
            {posterPath && <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="tokamakCadPoster" src={posterPath} alt={t('viewer.posterAlt', { title: content(manifest?.title ?? 'Tokamak') })} loading="lazy" decoding="async" />
            </>}
            <div className="tokamakCadViewport" ref={mountRef} />
            {viewportOverlay}
            <div className="tokamakCadScan" aria-hidden="true" /><div className="tokamakCadReticle" aria-hidden="true"><i /><i /></div>
            {status === 'idle' && ehl2LoadBlocked && <div className="tokamakCadLaunch tokamakCadLaunch--blocked" role="status"><div className="tokamakCadLaunchGlyph" aria-hidden="true"><span /><i /><b /></div><p>EHL-2 DESKTOP LOAD GATE</p><h3>{t('viewer.ehlBlockedTitle')}</h3><span>{t('viewer.ehlRequirements')}</span><em className="tokamakCadLodNotice">{ehl2ConstraintMessage}</em></div>}
            {status === 'idle' && !ehl2LoadBlocked && <div className="tokamakCadLaunch"><div className="tokamakCadLaunchGlyph" aria-hidden="true"><span /><i /><b /></div><p>MANIFEST-DRIVEN DIGITAL ASSET / 01</p><h3>{t('viewer.launchTitle')}</h3><span>{ehl2Session
              ? t('viewer.ehlLaunchCopy', { size: estimatedMegabytes })
              : anonymousVisualization
                ? t('viewer.anonymousLaunchCopy', { model: content(selectedModel?.label ?? t('viewer.standard')), size: estimatedMegabytes })
                : t('viewer.launchCopy', { model: content(selectedModel?.label ?? t('viewer.standard')), size: estimatedMegabytes })}</span>{lodNotice && <em className="tokamakCadLodNotice">{lodNotice}</em>}<button type="button" onClick={activate} disabled={!manifest || !selectedModel}>{t('viewer.launch')} <i>→</i></button></div>}
            {status === 'loading' && <div className="tokamakCadLoading" role="status" aria-live="polite"><span>MANIFEST → {selectedModel?.quality === 'high' ? 'HIGH LOD' : 'PREVIEW LOD'} → GPU</span><div><i style={{ width: `${Math.max(6, progress)}%` }} /></div><b>{progress > 0 ? `${progress}% · ${content(selectedModel?.label ?? 'MODEL')} ${estimatedMegabytes} MB${selectedModel?.decodedGpuBytes ? ` · ${t('viewer.decodedMemory', { size: megabytes(selectedModel.decodedGpuBytes) })}` : ''}` : t('viewer.loadingModel', { model: content(selectedModel?.label ?? t('viewer.standard')) })}</b>{shardProgressLabel && <strong className="tokamakCadShardProgress">{shardProgressLabel}</strong>}{lodNotice && <em className="tokamakCadLodNotice">{lodNotice}</em>}</div>}
            {status === 'error' && <div className="tokamakCadFallback"><div className="tokamakFallbackTorus" aria-hidden="true"><span /><i /><b /></div><p>WEBGL FALLBACK</p><h3>{t('viewer.unavailable')}</h3><span>{errorMessage}</span><div><button type="button" onClick={activate}>{t('viewer.reload')}</button>{showDownloadActions && <a href={sourceCadPath} download>{t('viewer.downloadStep')}</a>}</div></div>}
            {!anonymousVisualization && <div className="tokamakCadLegend" aria-label={t('viewer.legendAria')}><span title={manifest?.visualizations?.analyticPlasma ? t('viewer.analyticPlasmaHelp') : undefined}><i className="plasma" />{manifest?.visualizations?.analyticPlasma ? t('viewer.analyticPlasma') : 'PLASMA'}</span><span><i className="tf" />TF COILS</span><span><i className="pf" />PF COILS / CASES</span><span><i className="structure" />STRUCTURE</span></div>}
            <div className="tokamakCadReadout" aria-label={t('viewer.statsAria')}><span><small>QUALITY</small><b>{content(presentationModel?.label ?? 'STANDARD')} · {estimatedMegabytes} MB</b></span><span><small>MESHES</small><b>{ready ? formatCount(stats.meshes, locale) : '—'}</b></span><span><small>TRIANGLES</small><b>{ready ? formatCount(stats.triangles, locale) : viewerModelTriangleCount(presentationModel) ? formatCount(viewerModelTriangleCount(presentationModel) ?? 0, locale) : '—'}</b></span><span><small>RENDER</small><b>{ready ? stats.renderer : 'ON DEMAND'}</b></span></div>
          </div>

          {!anonymousVisualization && <aside className="tokamakCadProperties" aria-label={t('viewer.properties')}>
            <div className="tokamakCadPanelHead"><span>PROPERTIES</span><b>{selectedPartIds.size > 1 ? `${selectedPartIds.size} SELECTED` : selectedPart ? selectedPart.id : 'NO SELECTION'}</b></div>
            {selectedPart ? <div className="tokamakCadPropertyBody">
              <p className="tokamakCadPropertyKicker" style={{ color: selectedPart.color }}>{content(selectedPart.systemTitle)}</p><h3>{content(selectedPart.title)}</h3><p>{content(selectedPart.description)}</p>
              <dl><div><dt>{t('viewer.stableId')}</dt><dd>{selectedPart.id}</dd></div><div><dt>{t('viewer.engineeringTag')}</dt><dd>{selectedPart.engineeringTag}</dd></div><div><dt>{t('viewer.glbNode')}</dt><dd>{selectedPart.nodeName}</dd></div><div><dt>{t('viewer.classification')}</dt><dd>{manifest?.access.classification}</dd></div></dl>
              {selectedPartIds.size > 1 && <p className="tokamakCadSelectionSummary">{t('viewer.multiSelected', { count: selectedPartIds.size })}</p>}
              <div className="tokamakCadPropertyActions"><button type="button" onClick={() => togglePartVisibility(selectedPart.id)}>{hiddenPartIds.has(selectedPart.id) ? t('viewer.showCurrent') : t('viewer.hideCurrent')}</button><button type="button" className={isolatedPartIds.size > 0 ? 'active' : ''} onClick={isolateSelection}>{isolatedPartIds.size > 0 ? t('viewer.exitIsolation') : t('viewer.isolateCount', { count: selectedPartIds.size })}</button></div>
            </div> : <div className="tokamakCadPropertyEmpty"><span>◎</span><p>{t('viewer.selectHint')}</p></div>}
          </aside>}
        </div>

        <div className="tokamakCadControls" aria-label={t('viewer.controlsAria')}>
          <div className="tokamakCadPresets"><span>VIEW</span>{(['iso', 'front', 'top'] as const).map((preset) => <button type="button" key={preset} disabled={!ready} className={activeView === preset ? 'active' : ''} aria-pressed={activeView === preset} onClick={() => selectView(preset)}>{preset === 'iso' ? '3/4' : preset === 'front' ? t('viewer.front') : t('viewer.top')}</button>)}</div>
          <div className="tokamakCadPrecisionControls">
            <div className="tokamakCadClipAxes" aria-label={t('viewer.clipAxes')}>{(['x', 'y', 'z'] as const).map((axis) => <button type="button" key={axis} disabled={!ready} className={clipAxis === axis ? 'active' : ''} aria-pressed={clipAxis === axis} onClick={() => updateClipAxis(axis)}>{axis.toUpperCase()}</button>)}</div>
            <div className="tokamakCadClipControl"><label><span>{t('viewer.clipPlane', { axis: clipAxis.toUpperCase() })}</span><b>{Math.round(clipOffset * 100)}%</b><input type="range" min="-0.9" max="0.9" step="0.02" value={clipOffset} disabled={!ready || !clipping} onChange={(event) => updateClipOffset(Number(event.target.value))} /></label></div>
            <div className="tokamakCadOpacityControl global"><label><span>{t('viewer.globalOpacity')}</span><b>{Math.round(globalOpacity * 100)}%</b><input type="range" min="0.1" max="1" step="0.05" value={globalOpacity} disabled={!ready} onChange={(event) => updateGlobalOpacity(Number(event.target.value))} /></label></div>
            {!anonymousVisualization && <div className="tokamakCadOpacityControl global"><label><span>{t('viewer.selectedOpacity')}</span><b>{Math.round(selectedOpacity * 100)}%</b><input type="range" min="0.1" max="1" step="0.05" value={selectedOpacity} disabled={!ready || selectedPartIds.size === 0} onChange={(event) => updateSelectedOpacity(Number(event.target.value))} /></label></div>}
          </div>
          <div className="tokamakCadTools"><button type="button" disabled={!ready} onClick={resetView}>{t('viewer.reset')}</button><button type="button" disabled={!ready} className={autoRotate ? 'active' : ''} aria-pressed={autoRotate} onClick={toggleAutoRotate}>{t('viewer.rotate')}</button>{wireframeAllowed && <button type="button" disabled={!ready} className={wireframe ? 'active' : ''} aria-pressed={wireframe} onClick={toggleWireframe}>{t('viewer.wireframe')}</button>}<button type="button" disabled={!ready} className={clipping ? 'active' : ''} aria-pressed={clipping} onClick={toggleClipping}>{t('viewer.clip')}</button>{manifest?.visualizations?.analyticPlasma && <button type="button" disabled={!ready} className={analyticPlasmaVisible ? 'active' : ''} aria-pressed={analyticPlasmaVisible} title={`${content(manifest.visualizations.analyticPlasma.label)} · ${t('viewer.analyticPlasmaHelp')}`} onClick={toggleAnalyticPlasma}>{t('viewer.analyticPlasma')}</button>}<button type="button" disabled={!ready} className={fullscreen ? 'active' : ''} aria-pressed={fullscreen} onClick={toggleFullscreen}>{t('viewer.fullscreen')}</button></div>
        </div>
        {efitControls && <div className="tokamakCadEfitControls" aria-label={t('viewer.efitControls')}>
          <span>EFIT OVERLAY</span>
          <button type="button" className={efitControls.mode === 'xray' ? 'active' : ''} aria-pressed={efitControls.mode === 'xray'} onClick={() => efitControls.onModeChange(efitControls.mode === 'xray' ? 'physical' : 'xray')}>{efitControls.mode === 'xray' ? t('viewer.xray') : t('viewer.physical')}</button>
          <label><input type="checkbox" checked={efitControls.showSection} onChange={(event) => efitControls.onShowSectionChange(event.currentTarget.checked)} />{t('viewer.psiSection')}</label>
          <label><input type="checkbox" checked={efitControls.showSurface} onChange={(event) => efitControls.onShowSurfaceChange(event.currentTarget.checked)} />{t('viewer.lcfsSurface')}</label>
          <label><input type="checkbox" checked={efitControls.showMagneticAxis} onChange={(event) => efitControls.onShowMagneticAxisChange(event.currentTarget.checked)} />{t('viewer.magneticAxis')}</label>
        </div>}
      </div>

      {showFootnotes && <div className="tokamakCadFootnotes">
        <p><b>{t('viewer.footnoteScience')}</b>{applicabilityStatement}{appearancePreset !== 'semantic' && ` ${t('viewer.appearanceDisclaimer')}`}</p>
        <p><b>{t('viewer.footnoteDelivery')}</b>{securityNotice ? content(securityNotice) : t('viewer.deliveryDisclaimer')}<a href={manifestUrl}>{t('viewer.viewManifest')}</a><a href="/models/device-manifest.schema.json">{t('viewer.viewSchema')}</a>{isParamakPackage && <a href="https://github.com/fusion-energy/paramak/tree/0.9.11" target="_blank" rel="noreferrer">Paramak 0.9.11</a>}<a href="/licenses/THREE-LICENSE.txt">{t('viewer.threeLicense')}</a>{showDownloadActions && <><a href={sourceCadPath} download>{t('viewer.downloadStep')}</a><a href={webModelPath} download>{t('viewer.downloadGlb')}</a></>}</p>
      </div>}
    </section>
  );
}
