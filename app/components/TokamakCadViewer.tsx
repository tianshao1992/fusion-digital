'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Plane,
  Scene,
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
import {
  INDUSTRIAL_STUDIO,
  resolveIndustrialMaterialPreset,
  resolveIndustrialMaterialSpec,
  type TokamakAppearancePreset,
} from './device-viewer/industrialAppearance';
import { resolveCadSceneTheme } from './device-viewer/cadSceneTheme';
import {
  ANALYTIC_PLASMA_RUNTIME_SEMANTICS,
  ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT,
  buildAnalyticPlasmaGeometry,
} from './device-viewer/analyticPlasma';
import { createSerialTaskGate, loadVerifiedComponentBundle, loadVerifiedMonolithicModel } from './device-viewer/componentModelLoader';
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
  type DeviceComponentBundle,
  type DeviceManifest,
  type DeviceWebModelVariant,
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
  efitFrame?: EfitFrame | EfitRenderableFrame | null;
  efitStore?: EfitStore | EfitStoreLike | null;
  efitAlignment?: EfitAlignmentContract;
  efitOptions?: EfitThreeOverlayOptions;
  diagnosticOverlayOptions?: Ehl2DiagnosticOverlayOptions;
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
type MonolithicViewerModel = DeviceWebModelVariant & { delivery: 'monolithic' };
type ViewerModelChoice = MonolithicViewerModel | DeviceComponentBundle;
type ViewSnapshot = {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
};
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
  setVisualTheme: (theme: ResolvedTheme) => void;
  setAnalyticPlasmaVisible: (visible: boolean) => void;
  applyVisibility: (hidden: Set<string>, isolated: Set<string>) => void;
  selectParts: (partIds: Set<string>) => void;
  pickPart: (event: PointerEvent) => string | null;
  captureView: () => ViewSnapshot;
  applyView: (snapshot: ViewSnapshot) => void;
  resize: (refit?: boolean) => void;
  efitOverlay: EfitThreeOverlay | null;
  diagnosticOverlay: Ehl2DiagnosticThreeOverlay | null;
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

function webModelVariants(manifest: DeviceManifest | null): ViewerModelChoice[] {
  if (!manifest) return [];
  const compatibilityModels = manifest.assets.webModel ? [{
    ...manifest.assets.webModel,
    id: 'standard',
    label: '标准',
    quality: 'preview' as const,
    default: true,
  }] : [];
  const monolithic = (manifest.assets.webModels ?? compatibilityModels)
    .map((asset) => ({ ...asset, delivery: 'monolithic' as const }));
  return [...monolithic, ...(manifest.assets.componentBundles ?? [])];
}

function megabytes(bytes: number) {
  return Math.max(0.1, bytes / 1_000_000).toFixed(1);
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

export default function TokamakCadViewer(props: TokamakCadViewerProps = {}) {
  const sessionViewerId = props.viewerId ?? 'paramak-tokamak-demo';
  const sessionManifestUrl = props.manifestUrl ?? DEFAULT_MANIFEST_URL;
  const sessionAppearancePreset = props.appearancePreset ?? 'semantic';
  return <TokamakCadViewerSession
    key={`${sessionViewerId}:${sessionManifestUrl}:${sessionAppearancePreset}`}
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
  efitFrame = null,
  efitStore = null,
  efitAlignment,
  efitOptions,
  diagnosticOverlayOptions,
  efitControls,
}: TokamakCadViewerProps = {}) {
  const { content, locale, t } = useI18n();
  const { resolvedTheme } = useTheme();
  const ehl2Session = isEhl2ViewerSession(viewerId, manifestUrl);
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
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const selectedPartIdsRef = useRef<Set<string>>(new Set());
  const hiddenPartIdsRef = useRef<Set<string>>(new Set());
  const isolatedPartIdsRef = useRef<Set<string>>(new Set());
  const opacityRef = useRef({ global: 1, selected: 1 });
  const analyticPlasmaVisibleRef = useRef(ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT);
  const viewSnapshotRef = useRef<ViewSnapshot | null>(null);
  const interactionRef = useRef<ViewerInteraction>({ ...defaultInteraction });
  const [activated, setActivated] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<ViewerStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [manifest, setManifest] = useState<DeviceManifest | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [lodNotice, setLodNotice] = useState('');
  const [ehl2RuntimePolicy, setEhl2RuntimePolicy] = useState<Ehl2RuntimePolicy | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [clipping, setClipping] = useState(defaultInteraction.clipping);
  const [clipAxis, setClipAxis] = useState<ClipAxis>(defaultInteraction.clipAxis);
  const [clipOffset, setClipOffset] = useState(defaultInteraction.clipOffset);
  const [globalOpacity, setGlobalOpacity] = useState(1);
  const [selectedOpacity, setSelectedOpacity] = useState(1);
  const [analyticPlasmaVisible, setAnalyticPlasmaVisible] = useState(
    ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT,
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [activeView, setActiveView] = useState<ViewPreset>('iso');
  const [stats, setStats] = useState<ViewerStats>({ meshes: 0, triangles: 0, renderer: 'WEBGL 2', parts: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedPartIds, setSelectedPartIds] = useState<Set<string>>(() => new Set());
  const [hiddenPartIds, setHiddenPartIds] = useState<Set<string>>(() => new Set());
  const [isolatedPartIds, setIsolatedPartIds] = useState<Set<string>>(() => new Set());
  const [openSystems, setOpenSystems] = useState<Set<string>>(() => new Set());

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

  const availableModels = useMemo(() => webModelVariants(manifest), [manifest]);
  const selectedModel = availableModels.find((asset) => asset.id === selectedModelId)
    ?? availableModels[0]
    ?? null;

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
    setStatus('loading');
    if (!activated) setActivated(true);
    if (activated || status === 'error') setAttempt((value) => value + 1);
  }, [activated, ehl2Session, status]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(manifestUrl, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(i18nRef.current.t('viewer.errorManifestHttp', { status: response.status }));
        const loadedManifest = parseDeviceManifest(await response.json(), { manifestUrl });
        if (loadedManifest.access.classification !== 'PUBLIC') throw new Error(i18nRef.current.t('viewer.errorPublicOnly'));
        if (!loadedManifest.access.redistributionAllowed) throw new Error(i18nRef.current.t('viewer.errorRedistribution'));
        if (controller.signal.aborted) return;
        const variants = webModelVariants(loadedManifest);
        const preview = variants.find((asset) => asset.quality === 'preview');
        const declaredDefault = variants.find((asset) => 'default' in asset && asset.default === true)
          ?? preview
          ?? variants[0];
        if (!declaredDefault) throw new Error(i18nRef.current.t('viewer.errorManifest'));
        const constrained = Boolean(preview) && variants.length > 1 && shouldPreferPreview();
        const preferred = constrained ? preview as ViewerModelChoice : declaredDefault;
        setManifest(loadedManifest);
        setOpenSystems(new Set(loadedManifest.systems.map((system) => system.id)));
        setSelectedModelId((current) => variants.some((asset) => asset.id === current) ? current : preferred.id);
        setLodNotice(constrained && preferred.id !== declaredDefault.id
          ? i18nRef.current.t('viewer.autoPreview')
          : '');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? i18nRef.current.content(error.message) : i18nRef.current.t('viewer.errorManifest'));
      });
    return () => controller.abort();
  }, [attempt, manifestUrl]);

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
    let localDisposableMaterials: Set<Material> | null = null;
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
    };

    async function initialise() {
      if (!supportsWebGL2()) throw new Error(i18nRef.current.t('viewer.errorWebgl2'));

      const environmentModulePromise = appearancePreset === 'industrial-silver-v1'
        ? import('three/examples/jsm/environments/RoomEnvironment.js')
        : Promise.resolve(null);
      const diagnosticOverlayModulePromise = ehl2Session
        ? import('./device-viewer/Ehl2DiagnosticThreeOverlay')
        : Promise.resolve(null);
      const [THREE, controlsModule, loaderModule, meshoptModule, efitOverlayModule, diagnosticOverlayModule, environmentModule] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
        import('./device-viewer/EfitThreeOverlay'),
        diagnosticOverlayModulePromise,
        environmentModulePromise,
      ]);
      if (disposed || !mountRef.current) return;
      if (!manifest || !selectedModel) throw new Error(i18nRef.current.t('viewer.errorModelNotReady'));
      const loadedManifest = manifest;
      const loadedModel = selectedModel;

      const mount = mountRef.current;
      const industrialAppearance = appearancePreset === 'industrial-silver-v1';
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
      renderer.domElement.setAttribute('aria-label', i18nRef.current.t('viewer.threeAria', {
        title: i18nRef.current.content(loadedManifest.title),
      }));
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.tabIndex = 0;
      mount.replaceChildren(renderer.domElement);

      const controls = new controlsModule.OrbitControls(camera, renderer.domElement);
      localControls = controls;
      controls.enableDamping = true;
      controls.dampingFactor = 0.075;
      controls.rotateSpeed = 0.62;
      controls.zoomSpeed = 0.72;
      controls.panSpeed = 0.55;
      controls.minDistance = 4.2;
      controls.maxDistance = 15;
      controls.autoRotateSpeed = 0.72;

      let applyLightTheme: (theme: ResolvedTheme) => void;
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
      const materialForSystem = (system: DeviceManifest['systems'][number] | undefined) => {
        const category = system?.category ?? 'structure';
        const appearanceKey = industrialAppearance
          ? `industrial:${resolveIndustrialMaterialPreset(system?.id ?? '', category)}`
          : `semantic:${category}`;
        const existing = materialByAppearanceKey.get(appearanceKey);
        if (existing) return existing;
        let material: MeshStandardMaterial;
        if (industrialAppearance) {
          const spec = resolveIndustrialMaterialSpec(system?.id ?? '', category);
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

      const meshoptDecoder = meshoptModule.MeshoptDecoder;
      const loader = new loaderModule.GLTFLoader();
      loader.setMeshoptDecoder(meshoptDecoder);
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
      loadedManifest.systems.forEach((system) => system.parts.forEach((part) => systemByNodeName.set(part.nodeName, { partId: part.id })));
      loadedManifest.systems.forEach((system) => system.parts.forEach((part) => systemByPartId.set(part.id, system)));
      let meshes = 0;
      let triangles = 0;
      let drawVertices = 0;

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
        materialList(mesh.material).forEach((material) => sourceMaterials.add(material));
        const inheritedPartId = partIdByNode.get(mesh);
        const system = inheritedPartId ? systemByPartId.get(inheritedPartId) : undefined;
        const replacement = materialForSystem(system);
        mesh.material = replacement;
        originalMaterials.set(mesh, replacement);
        const positionCount = mesh.geometry.attributes.position?.count ?? 0;
        drawVertices += positionCount;
        triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : positionCount / 3;
      });
      if (loadedModel.delivery === 'components'
        && (Math.round(triangles) !== loadedModel.sceneDrawTriangles
          || drawVertices !== loadedModel.sceneDrawVertices
          || meshes !== loadedModel.meshInstances)) {
        throw new Error(i18nRef.current.t('viewer.errorModelNotReady'));
      }
      const expectedParts = loadedManifest.systems.flatMap((system) => system.parts);
      const missingParts = expectedParts.filter((part) => !nodeByPartId.has(part.id));
      if (missingParts.length > 0) throw new Error(i18nRef.current.t('viewer.errorMissingNodes', {
        nodes: missingParts.map((part) => part.nodeName).join(', '),
      }));
      const unmappedMeshes = allMeshes(model).filter((mesh) => !partIdByNode.has(mesh));
      if (unmappedMeshes.length > 0) throw new Error(i18nRef.current.t('viewer.errorUnmappedMeshes', {
        count: unmappedMeshes.length,
      }));
      sourceMaterials.forEach((material) => material.dispose());

      const sourceBox = new THREE.Box3().setFromObject(model);
      const sourceSize = sourceBox.getSize(new THREE.Vector3());
      const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
      const longestSide = Math.max(sourceSize.x, sourceSize.y, sourceSize.z) || 1;
      const displayScale = 6.1 / longestSide;
      model.scale.setScalar(displayScale);
      model.position.copy(sourceCenter).multiplyScalar(-displayScale);
      scene.add(model);

      const fittedBox = new THREE.Box3().setFromObject(model);
      const fittedSphere = fittedBox.getBoundingSphere(new THREE.Sphere());
      const floorY = fittedBox.min.y - 0.42;
      const grid = new THREE.GridHelper(
        18,
        36,
        initialSceneTheme.grid.center,
        initialSceneTheme.grid.line,
      );
      grid.position.y = floorY;
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
      orbit.position.y = floorY + 0.03;
      scene.add(orbit);

      const setVisualTheme = (theme: ResolvedTheme) => {
        const next = resolveCadSceneTheme(theme, appearancePreset);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.setHex(next.fogColor);
          scene.fog.density = next.fogDensity;
        }
        renderer.toneMappingExposure = next.exposure;
        renderer.setClearColor(next.clearColor, next.clearAlpha);
        scene.environmentIntensity = next.environmentIntensity;
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
      };

      const target = fittedSphere.center.clone();
      const modelRadius = Math.max(fittedSphere.radius, 0.1);
      let currentPreset: ViewPreset = interactionRef.current.activeView;
      let preserveViewOnResize = false;
      const setView = (preset: ViewPreset) => {
        currentPreset = preset;
        preserveViewOnResize = false;
        const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(camera.aspect, 0.1));
        const limitingHalfFov = Math.max(0.08, Math.min(verticalHalfFov, horizontalHalfFov));
        const distance = (modelRadius / Math.sin(limitingHalfFov)) * 1.45;
        camera.near = Math.max(0.01, modelRadius * 0.005);
        camera.far = Math.max(distance * 4.5 + modelRadius * 2, modelRadius * 24);
        controls.minDistance = modelRadius * 1.2;
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
      const applyVisibility = (hidden: Set<string>, isolated: Set<string>) => {
        nodeByPartId.forEach((node, partId) => { node.visible = isolated.size > 0 ? isolated.has(partId) : !hidden.has(partId); });
      };
      const applyMaterialOpacity = (material: Material, opacity: number) => {
        material.opacity = Math.max(0.04, Math.min(1, opacity));
        material.transparent = material.opacity < 0.999;
        material.depthWrite = material.opacity >= 0.999;
        material.needsUpdate = true;
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
        ...selectionMaterials,
        ...(semanticHighlightMaterial ? [semanticHighlightMaterial] : []),
      ]);
      let highlightedPartIds = new Set<string>();
      const selectParts = (partIds: Set<string>) => {
        highlightedPartIds = new Set(partIds);
        originalMaterials.forEach((material, mesh) => { mesh.material = material; });
        partIds.forEach((partId) => {
          const node = nodeByPartId.get(partId);
          if (node) allMeshes(node).forEach((mesh) => {
            const baseMaterial = originalMaterials.get(mesh);
            if (baseMaterial) mesh.material = selectedMaterialFor(baseMaterial);
          });
        });
      };
      const setOpacity = (overall: number, selected: number) => {
        currentSelectedOpacity = selected;
        viewerMaterials.forEach((material) => applyMaterialOpacity(material, (baseOpacity.get(material) ?? 1) * overall));
        selectionMaterials.forEach((material) => applyMaterialOpacity(material, selected));
        if (semanticHighlightMaterial) applyMaterialOpacity(semanticHighlightMaterial, selected);
        selectParts(highlightedPartIds);
      };
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const pickPart = (event: PointerEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
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

      const resize = (refit = false) => {
        if (!mountRef.current) return;
        const width = Math.max(1, mountRef.current.clientWidth);
        const height = Math.max(1, mountRef.current.clientHeight);
        camera.aspect = width / height;
        renderer.setSize(width, height, false);
        localEfitOverlay?.resize(width, height);
        if (preserveViewOnResize && !refit) {
          camera.updateProjectionMatrix();
          controls.update();
        } else {
          setView(currentPreset);
        }
      };
      resize();
      if (viewSnapshotRef.current) {
        camera.position.fromArray(viewSnapshotRef.current.position);
        controls.target.fromArray(viewSnapshotRef.current.target);
        camera.up.fromArray(viewSnapshotRef.current.up);
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
        controls.update();
        preserveViewOnResize = true;
      }
      if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(() => resize()); resizeObserver.observe(mount); }
      else { resizeFallback = () => resize(); window.addEventListener('resize', resizeFallback); }
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
          interactiveMaterials().forEach((material) => {
            material.clippingPlanes = enabled ? [clippingPlane] : null;
            material.needsUpdate = true;
          });
          localEfitOverlay?.setClippingEnabled(enabled);
          if (analyticFluxBandRoot) analyticFluxBandRoot.visible = enabled && axis === 'z';
        },
        setOpacity,
        setVisualTheme,
        setAnalyticPlasmaVisible: (visible) => {
          if (analyticPlasmaRoot) analyticPlasmaRoot.visible = visible;
        },
        applyVisibility,
        selectParts,
        pickPart,
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
          preserveViewOnResize = true;
        },
        resize,
        efitOverlay: localEfitOverlay,
        diagnosticOverlay: localDiagnosticOverlay,
      };
      setVisualTheme(visualThemeRef.current);
      selectParts(selectedPartIdsRef.current);
      applyVisibility(hiddenPartIdsRef.current, isolatedPartIdsRef.current);
      setOpacity(opacityRef.current.global, opacityRef.current.selected);
      viewerRef.current.setWireframe(wireframeAllowed && interactionRef.current.wireframe);
      viewerRef.current.setClipping(
        interactionRef.current.clipping,
        interactionRef.current.clipAxis,
        interactionRef.current.clipOffset,
      );
      viewerRef.current.setAnalyticPlasmaVisible(analyticPlasmaVisibleRef.current);
      controls.autoRotate = interactionRef.current.autoRotate;
      setStats({ meshes, triangles: Math.round(triangles), renderer: renderer.capabilities.isWebGL2 ? 'WEBGL 2' : 'WEBGL', parts: nodeByPartId.size });
      setProgress(100);
      setStatus('ready');
      setLodNotice('');
    }

    initialise().catch((error: unknown) => {
      if (disposed) return;
      releaseResources();
      const preview = availableModels.find((asset) => asset.quality === 'preview');
      if (selectedModel.quality === 'high' && preview && preview.id !== selectedModel.id) {
        const reason = error instanceof Error ? i18nRef.current.content(error.message) : i18nRef.current.t('viewer.errorUnknown');
        setLodNotice(i18nRef.current.t('viewer.highFallback', { reason }));
        setProgress(0);
        setStatus('loading');
        setSelectedModelId(preview.id);
        return;
      }
      setStatus('error');
      setErrorMessage(error instanceof Error ? i18nRef.current.content(error.message) : i18nRef.current.t('viewer.errorModel'));
    });

    return () => { disposed = true; releaseResources(); viewerRef.current = null; };
  }, [activated, appearancePreset, attempt, availableModels, ehl2Session, manifest, selectedModel, wireframeAllowed]);

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
      viewerRef.current.renderer.domElement.setAttribute('aria-label', t('viewer.threeAria', { title: content(title) }));
    }
  }, [content, manifest?.title, status, t]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(document.fullscreenElement === fullscreenRef.current);
      requestAnimationFrame(() => requestAnimationFrame(() => viewerRef.current?.resize(true)));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const selectView = (preset: ViewPreset) => {
    viewSnapshotRef.current = null;
    interactionRef.current.activeView = preset;
    viewerRef.current?.setView(preset);
    setActiveView(preset);
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
    if (!next || next.id === selectedModel?.id) return;
    viewSnapshotRef.current = viewerRef.current?.captureView() ?? viewSnapshotRef.current;
    setLodNotice(t('viewer.switching', { model: content(next.label), size: megabytes(next.bytes) }));
    setProgress(0);
    if (activated) setStatus('loading');
    setSelectedModelId(next.id);
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
  const webModelPath = selectedModel?.delivery === 'monolithic'
    ? selectedModel.path
    : manifest?.assets.webModel?.path ?? `${packageBase}/${viewerId}.glb`;
  const posterPath = manifest?.assets.poster?.path ?? (workspace ? null : '/models/paramak-tokamak-demo/paramak-tokamak-demo-poster.png');
  const isParamakPackage = manifest?.devicePackage.kind === 'public-demonstrator' || viewerId.includes('paramak');
  const estimatedMegabytes = selectedModel?.bytes ? megabytes(selectedModel.bytes) : manifest?.assets.webModel?.bytes ? megabytes(manifest.assets.webModel.bytes) : workspace ? '2.2' : '1.1';
  const applicabilityStatement = manifest?.disclaimer ? content(manifest.disclaimer) : t('viewer.defaultDisclaimer');

  return (
    <section id={sectionId ?? (workspace ? 'prototype-workspace' : 'device-3d')} className={`tokamakCadSection${workspace ? ' tokamakCadSection--workspace' : ''} appearance-${appearancePreset}`} data-three-viewer={viewerId} data-cad-theme={resolvedTheme} aria-labelledby={`${viewerId}-title`}>
      <div className="tokamakCadIntro">
        <p className="tokamakCadIndex">{workspace ? 'WORKSPACE / FULL-DEVICE DIGITAL MOCK-UP' : '03D / DEVICE PACKAGE VIEWER'}</p>
        <div>
          <h2 id={`${viewerId}-title`}>{workspace ? t('viewer.introWorkspace') : t('viewer.introStandalone')}</h2>
          <p>{manifest ? t('viewer.manifestReady', { title: content(manifest.title) }) : t('viewer.onDemand')}</p>
        </div>
      </div>

      <div className={`tokamakCadShell status-${status}`} ref={fullscreenRef}>
        <div className="tokamakCadTopbar">
          <div className="tokamakCadIdentity"><span className="tokamakCadPulse" aria-hidden="true" /><div><b>{manifest?.title.toUpperCase() ?? 'MANIFEST-DRIVEN TOKAMAK PACKAGE'}</b><small>DEVICE-AGNOSTIC / LICENCE-AWARE PACKAGE CONTRACT</small></div></div>
          <div className="tokamakCadTopbarActions">
            {availableModels.length > 1 && <fieldset className="tokamakCadLodSelector" aria-label={t('viewer.modelPrecision')}>
              <legend className="srOnly">{t('viewer.modelPrecision')}</legend>
              {availableModels.map((asset) => <button
                type="button"
                key={asset.id}
                className={selectedModel?.id === asset.id ? 'active' : ''}
                aria-pressed={selectedModel?.id === asset.id}
                disabled={status === 'loading' && selectedModel?.id === asset.id}
                onClick={() => selectModel(asset.id)}
                title={`${content(asset.label)} · ${megabytes(asset.bytes)} MB${asset.decodedGpuBytes ? ` · ${t('viewer.decodedMemory', { size: megabytes(asset.decodedGpuBytes) })}` : ''}${asset.triangles ? ` · ${formatCount('sceneDrawTriangles' in asset ? asset.sceneDrawTriangles : asset.triangles, locale)} triangles` : ''}`}
              >{asset.quality === 'high' ? t('viewer.high') : t('viewer.standard')} <small>{megabytes(asset.bytes)} MB{asset.decodedGpuBytes ? ` · ${megabytes(asset.decodedGpuBytes)} MB RAM` : ''}</small></button>)}
            </fieldset>}
            <div className="tokamakCadStatus" aria-live="polite"><span>{ready ? `${content(selectedModel?.label ?? 'STANDARD')} · MODEL ONLINE` : status === 'loading' ? `STREAMING ${progress}%` : status === 'error' ? 'FALLBACK MODE' : 'STANDBY'}</span><i aria-hidden="true" /></div>
          </div>
        </div>

        <div className="tokamakCadWorkspace">
          <aside className="tokamakCadTree" aria-label={t('viewer.assemblyTree')}>
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
          </aside>

          <div className="tokamakCadViewportShell">
            {posterPath && <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="tokamakCadPoster" src={posterPath} alt={t('viewer.posterAlt', { title: content(manifest?.title ?? 'Tokamak') })} loading="lazy" decoding="async" />
            </>}
            <div className="tokamakCadViewport" ref={mountRef} />
            <div className="tokamakCadScan" aria-hidden="true" /><div className="tokamakCadReticle" aria-hidden="true"><i /><i /></div>
            {status === 'idle' && ehl2LoadBlocked && <div className="tokamakCadLaunch tokamakCadLaunch--blocked" role="status"><div className="tokamakCadLaunchGlyph" aria-hidden="true"><span /><i /><b /></div><p>EHL-2 DESKTOP LOAD GATE</p><h3>{t('viewer.ehlBlockedTitle')}</h3><span>{t('viewer.ehlRequirements')}</span><em className="tokamakCadLodNotice">{ehl2ConstraintMessage}</em></div>}
            {status === 'idle' && !ehl2LoadBlocked && <div className="tokamakCadLaunch"><div className="tokamakCadLaunchGlyph" aria-hidden="true"><span /><i /><b /></div><p>MANIFEST-DRIVEN DIGITAL ASSET / 01</p><h3>{t('viewer.launchTitle')}</h3><span>{ehl2Session ? t('viewer.ehlLaunchCopy', { size: estimatedMegabytes }) : t('viewer.launchCopy', { model: content(selectedModel?.label ?? t('viewer.standard')), size: estimatedMegabytes })}</span>{lodNotice && <em className="tokamakCadLodNotice">{lodNotice}</em>}<button type="button" onClick={activate} disabled={!manifest || !selectedModel}>{t('viewer.launch')} <i>→</i></button></div>}
            {status === 'loading' && <div className="tokamakCadLoading" role="status"><span>MANIFEST → {selectedModel?.quality === 'high' ? 'HIGH LOD' : 'PREVIEW LOD'} → GPU</span><div><i style={{ width: `${Math.max(6, progress)}%` }} /></div><b>{progress > 0 ? `${progress}% · ${content(selectedModel?.label ?? 'MODEL')} ${estimatedMegabytes} MB${selectedModel?.decodedGpuBytes ? ` · ${t('viewer.decodedMemory', { size: megabytes(selectedModel.decodedGpuBytes) })}` : ''}` : t('viewer.loadingModel', { model: content(selectedModel?.label ?? t('viewer.standard')) })}</b>{lodNotice && <em className="tokamakCadLodNotice">{lodNotice}</em>}</div>}
            {status === 'error' && <div className="tokamakCadFallback"><div className="tokamakFallbackTorus" aria-hidden="true"><span /><i /><b /></div><p>WEBGL FALLBACK</p><h3>{t('viewer.unavailable')}</h3><span>{errorMessage}</span><div><button type="button" onClick={activate}>{t('viewer.reload')}</button>{showDownloadActions && <a href={sourceCadPath} download>{t('viewer.downloadStep')}</a>}</div></div>}
            <div className="tokamakCadLegend" aria-label={t('viewer.legendAria')}><span title={manifest?.visualizations?.analyticPlasma ? t('viewer.analyticPlasmaHelp') : undefined}><i className="plasma" />{manifest?.visualizations?.analyticPlasma ? t('viewer.analyticPlasma') : 'PLASMA'}</span><span><i className="tf" />TF COILS</span><span><i className="pf" />PF COILS / CASES</span><span><i className="structure" />STRUCTURE</span></div>
            <div className="tokamakCadReadout" aria-label={t('viewer.statsAria')}><span><small>QUALITY</small><b>{content(selectedModel?.label ?? 'STANDARD')} · {estimatedMegabytes} MB</b></span><span><small>MESHES</small><b>{ready ? formatCount(stats.meshes, locale) : '—'}</b></span><span><small>TRIANGLES</small><b>{ready ? formatCount(stats.triangles, locale) : selectedModel?.triangles ? formatCount(selectedModel.triangles, locale) : '—'}</b></span><span><small>RENDER</small><b>{ready ? stats.renderer : 'ON DEMAND'}</b></span></div>
          </div>

          <aside className="tokamakCadProperties" aria-label={t('viewer.properties')}>
            <div className="tokamakCadPanelHead"><span>PROPERTIES</span><b>{selectedPartIds.size > 1 ? `${selectedPartIds.size} SELECTED` : selectedPart ? selectedPart.id : 'NO SELECTION'}</b></div>
            {selectedPart ? <div className="tokamakCadPropertyBody">
              <p className="tokamakCadPropertyKicker" style={{ color: selectedPart.color }}>{content(selectedPart.systemTitle)}</p><h3>{content(selectedPart.title)}</h3><p>{content(selectedPart.description)}</p>
              <dl><div><dt>{t('viewer.stableId')}</dt><dd>{selectedPart.id}</dd></div><div><dt>{t('viewer.engineeringTag')}</dt><dd>{selectedPart.engineeringTag}</dd></div><div><dt>{t('viewer.glbNode')}</dt><dd>{selectedPart.nodeName}</dd></div><div><dt>{t('viewer.classification')}</dt><dd>{manifest?.access.classification}</dd></div></dl>
              {selectedPartIds.size > 1 && <p className="tokamakCadSelectionSummary">{t('viewer.multiSelected', { count: selectedPartIds.size })}</p>}
              <div className="tokamakCadPropertyActions"><button type="button" onClick={() => togglePartVisibility(selectedPart.id)}>{hiddenPartIds.has(selectedPart.id) ? t('viewer.showCurrent') : t('viewer.hideCurrent')}</button><button type="button" className={isolatedPartIds.size > 0 ? 'active' : ''} onClick={isolateSelection}>{isolatedPartIds.size > 0 ? t('viewer.exitIsolation') : t('viewer.isolateCount', { count: selectedPartIds.size })}</button></div>
            </div> : <div className="tokamakCadPropertyEmpty"><span>◎</span><p>{t('viewer.selectHint')}</p></div>}
          </aside>
        </div>

        <div className="tokamakCadControls" aria-label={t('viewer.controlsAria')}>
          <div className="tokamakCadPresets"><span>VIEW</span>{(['iso', 'front', 'top'] as const).map((preset) => <button type="button" key={preset} disabled={!ready} className={activeView === preset ? 'active' : ''} aria-pressed={activeView === preset} onClick={() => selectView(preset)}>{preset === 'iso' ? '3/4' : preset === 'front' ? t('viewer.front') : t('viewer.top')}</button>)}</div>
          <div className="tokamakCadPrecisionControls">
            <div className="tokamakCadClipAxes" aria-label={t('viewer.clipAxes')}>{(['x', 'y', 'z'] as const).map((axis) => <button type="button" key={axis} disabled={!ready} className={clipAxis === axis ? 'active' : ''} aria-pressed={clipAxis === axis} onClick={() => updateClipAxis(axis)}>{axis.toUpperCase()}</button>)}</div>
            <div className="tokamakCadClipControl"><label><span>{t('viewer.clipPlane', { axis: clipAxis.toUpperCase() })}</span><b>{Math.round(clipOffset * 100)}%</b><input type="range" min="-0.9" max="0.9" step="0.02" value={clipOffset} disabled={!ready || !clipping} onChange={(event) => updateClipOffset(Number(event.target.value))} /></label></div>
            <div className="tokamakCadOpacityControl global"><label><span>{t('viewer.globalOpacity')}</span><b>{Math.round(globalOpacity * 100)}%</b><input type="range" min="0.1" max="1" step="0.05" value={globalOpacity} disabled={!ready} onChange={(event) => updateGlobalOpacity(Number(event.target.value))} /></label></div>
            <div className="tokamakCadOpacityControl global"><label><span>{t('viewer.selectedOpacity')}</span><b>{Math.round(selectedOpacity * 100)}%</b><input type="range" min="0.1" max="1" step="0.05" value={selectedOpacity} disabled={!ready || selectedPartIds.size === 0} onChange={(event) => updateSelectedOpacity(Number(event.target.value))} /></label></div>
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
        <p><b>{t('viewer.footnoteScience')}</b>{applicabilityStatement}{appearancePreset === 'industrial-silver-v1' && ` ${t('viewer.appearanceDisclaimer')}`}</p>
        <p><b>{t('viewer.footnoteDelivery')}</b>{securityNotice ? content(securityNotice) : t('viewer.deliveryDisclaimer')}<a href={manifestUrl}>{t('viewer.viewManifest')}</a><a href="/models/device-manifest.schema.json">{t('viewer.viewSchema')}</a>{isParamakPackage && <a href="https://github.com/fusion-energy/paramak/tree/0.9.11" target="_blank" rel="noreferrer">Paramak 0.9.11</a>}<a href="/licenses/THREE-LICENSE.txt">{t('viewer.threeLicense')}</a>{showDownloadActions && <><a href={sourceCadPath} download>{t('viewer.downloadStep')}</a><a href={webModelPath} download>{t('viewer.downloadGlb')}</a></>}</p>
      </div>}
    </section>
  );
}
