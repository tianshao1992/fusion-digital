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
import {
  INDUSTRIAL_STUDIO,
  resolveIndustrialMaterialPreset,
  resolveIndustrialMaterialSpec,
  type TokamakAppearancePreset,
} from './device-viewer/industrialAppearance';
import { resolveShotGeometry, type EfitFrame, type EfitStore } from './efit';
import {
  parseDeviceManifest,
  type DeviceManifest,
  type DeviceWebModelVariant,
} from './deviceManifest';
import './tokamak-cad-viewer.css';

const DEFAULT_MANIFEST_URL = '/models/paramak-tokamak-demo/model-manifest.json';

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
  applyVisibility: (hidden: Set<string>, isolated: Set<string>) => void;
  selectParts: (partIds: Set<string>) => void;
  pickPart: (event: PointerEvent) => string | null;
  captureView: () => ViewSnapshot;
  applyView: (snapshot: ViewSnapshot) => void;
  resize: (refit?: boolean) => void;
  efitOverlay: EfitThreeOverlay | null;
};

function formatCount(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
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

function webModelVariants(manifest: DeviceManifest | null): DeviceWebModelVariant[] {
  if (!manifest) return [];
  return manifest.assets.webModels ?? [{
    ...manifest.assets.webModel,
    id: 'standard',
    label: '标准',
    quality: 'preview',
    default: true,
  }];
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
  showFootnotes = true,
  securityNotice,
  defaultClipping = false,
  defaultClipAxis = 'x',
  defaultClipOffset = 0,
  appearancePreset = 'semantic',
  efitFrame = null,
  efitStore = null,
  efitAlignment,
  efitOptions,
  efitControls,
}: TokamakCadViewerProps = {}) {
  const defaultInteraction = defaultInteractionFor(defaultClipping, defaultClipAxis, defaultClipOffset);
  const mountRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerApi | null>(null);
  const efitStateRef = useRef({
    frame: efitFrame,
    store: efitStore,
    alignment: efitAlignment,
    options: efitOptions,
  });
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const selectedPartIdsRef = useRef<Set<string>>(new Set());
  const hiddenPartIdsRef = useRef<Set<string>>(new Set());
  const isolatedPartIdsRef = useRef<Set<string>>(new Set());
  const opacityRef = useRef({ global: 1, selected: 1 });
  const viewSnapshotRef = useRef<ViewSnapshot | null>(null);
  const interactionRef = useRef<ViewerInteraction>({ ...defaultInteraction });
  const [activated, setActivated] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<ViewerStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [manifest, setManifest] = useState<DeviceManifest | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [lodNotice, setLodNotice] = useState('');
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [clipping, setClipping] = useState(defaultInteraction.clipping);
  const [clipAxis, setClipAxis] = useState<ClipAxis>(defaultInteraction.clipAxis);
  const [clipOffset, setClipOffset] = useState(defaultInteraction.clipOffset);
  const [globalOpacity, setGlobalOpacity] = useState(1);
  const [selectedOpacity, setSelectedOpacity] = useState(1);
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
    const nextState = { frame: efitFrame, store: efitStore, alignment: efitAlignment, options: efitOptions };
    efitStateRef.current = nextState;
    const overlay = viewerRef.current?.efitOverlay;
    if (!overlay) return;
    overlay.setAlignment(nextState.alignment);
    overlay.setOptions(nextState.options);
    overlay.setFrame(nextState.frame ?? currentEfitFrame(nextState.store));
  }, [efitAlignment, efitFrame, efitOptions, efitStore]);

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
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  const filteredPartIds = useMemo(() => new Set(parts.filter((part) => !normalizedQuery
    || `${part.title} ${part.id} ${part.engineeringTag}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery)).map((part) => part.id)), [normalizedQuery, parts]);

  const activate = useCallback(() => {
    setErrorMessage('');
    setProgress(0);
    setStatus('loading');
    if (!activated) setActivated(true);
    if (activated || status === 'error') setAttempt((value) => value + 1);
  }, [activated, status]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(manifestUrl, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`装置清单载入失败（HTTP ${response.status}）。`);
        const loadedManifest = parseDeviceManifest(await response.json());
        if (loadedManifest.access.classification !== 'PUBLIC') throw new Error('当前网页只允许加载 PUBLIC 级的浏览器派生资产。');
        if (!loadedManifest.access.redistributionAllowed) throw new Error('该装置包未授予公开再分发权，已拒绝在公网站点加载。');
        if (controller.signal.aborted) return;
        const variants = webModelVariants(loadedManifest);
        const preview = variants.find((asset) => asset.quality === 'preview') ?? variants[0];
        const declaredDefault = variants.find((asset) => asset.default === true) ?? preview;
        const constrained = variants.length > 1 && shouldPreferPreview();
        const preferred = constrained ? preview : declaredDefault;
        setManifest(loadedManifest);
        setOpenSystems(new Set(loadedManifest.systems.map((system) => system.id)));
        setSelectedModelId((current) => variants.some((asset) => asset.id === current) ? current : preferred.id);
        setLodNotice(constrained && preferred.id !== declaredDefault.id
          ? '已根据窄屏、节省流量或低内存设备自动选择标准模型；可手动切换高清。'
          : '');
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : '装置清单载入失败。');
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
    let localDisposableMaterials: Set<Material> | null = null;
    let localEnvironmentTarget: WebGLRenderTarget | null = null;
    let resourcesReleased = false;

    const releaseResources = () => {
      if (resourcesReleased) return;
      resourcesReleased = true;
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      if (resizeFallback) window.removeEventListener('resize', resizeFallback);
      if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
      if (pointerDownHandler) localRenderer?.domElement.removeEventListener('pointerdown', pointerDownHandler);
      if (pointerUpHandler) localRenderer?.domElement.removeEventListener('pointerup', pointerUpHandler);
      localControls?.dispose();
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
      if (!supportsWebGL2()) throw new Error('当前浏览器或显卡未启用 WebGL 2，无法启动三维视图。');

      const environmentModulePromise = appearancePreset === 'industrial-silver-v1'
        ? import('three/examples/jsm/environments/RoomEnvironment.js')
        : Promise.resolve(null);
      const [THREE, controlsModule, loaderModule, meshoptModule, efitOverlayModule, environmentModule] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/libs/meshopt_decoder.module.js'),
        import('./device-viewer/EfitThreeOverlay'),
        environmentModulePromise,
      ]);
      if (disposed || !mountRef.current) return;
      if (!manifest || !selectedModel) throw new Error('模型清单或质量版本尚未就绪。');
      const loadedManifest = manifest;
      const loadedModel = selectedModel;

      const mount = mountRef.current;
      const industrialAppearance = appearancePreset === 'industrial-silver-v1';
      const scene = new THREE.Scene();
      localScene = scene;
      scene.fog = new THREE.FogExp2(
        industrialAppearance ? INDUSTRIAL_STUDIO.fogColor : 0x07110e,
        industrialAppearance ? INDUSTRIAL_STUDIO.fogDensity : 0.032,
      );
      const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 120);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      localRenderer = renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = industrialAppearance ? INDUSTRIAL_STUDIO.exposure : 1.2;
      renderer.setClearColor(industrialAppearance ? INDUSTRIAL_STUDIO.clearColor : 0x07110e, 0);
      renderer.localClippingEnabled = true;
      renderer.domElement.setAttribute('aria-label', `可旋转、缩放并选择部件的${loadedManifest.title}三维模型`);
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

      if (industrialAppearance) {
        if (!environmentModule) throw new Error('银色工业外观环境模块载入失败。');
        const roomEnvironment = new environmentModule.RoomEnvironment();
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        try {
          pmremGenerator.compileEquirectangularShader();
          localEnvironmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
          scene.environment = localEnvironmentTarget.texture;
          scene.environmentIntensity = INDUSTRIAL_STUDIO.environmentIntensity;
        } finally {
          roomEnvironment.dispose();
          pmremGenerator.dispose();
        }
        const hemisphere = INDUSTRIAL_STUDIO.hemisphere;
        scene.add(new THREE.HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity));
        const key = new THREE.DirectionalLight(INDUSTRIAL_STUDIO.key.color, INDUSTRIAL_STUDIO.key.intensity);
        key.position.set(...INDUSTRIAL_STUDIO.key.position);
        const fill = new THREE.DirectionalLight(INDUSTRIAL_STUDIO.fill.color, INDUSTRIAL_STUDIO.fill.intensity);
        fill.position.set(...INDUSTRIAL_STUDIO.fill.position);
        const rim = new THREE.DirectionalLight(INDUSTRIAL_STUDIO.rim.color, INDUSTRIAL_STUDIO.rim.intensity);
        rim.position.set(...INDUSTRIAL_STUDIO.rim.position);
        scene.add(key, fill, rim);
      } else {
        scene.add(new THREE.HemisphereLight(0xbdeee2, 0x11100f, 2.4));
        const cyanLight = new THREE.DirectionalLight(0x67eed8, 3.2);
        cyanLight.position.set(4, 5, 6);
        scene.add(cyanLight);
        const orangeLight = new THREE.PointLight(0xff6b24, 26, 20, 1.7);
        orangeLight.position.set(-4, 1.5, 3);
        scene.add(orangeLight);
        const violetLight = new THREE.PointLight(0x8e6cff, 25, 16, 1.8);
        violetLight.position.set(1, -3, -4);
        scene.add(violetLight);
      }

      const viewerMaterials = new Set<Material>();
      const disposableMaterials = new Set<Material>();
      const materialByAppearanceKey = new Map<string, MeshStandardMaterial>();
      const plasmaMaterials = new Set<MeshStandardMaterial>();
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

      const loader = new loaderModule.GLTFLoader();
      loader.setMeshoptDecoder(meshoptModule.MeshoptDecoder);
      const gltf = await loader.loadAsync(loadedModel.path, (event) => {
        if (!disposed && event.total > 0) setProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      });
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }

      const model = gltf.scene;
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

      model.traverse((node) => {
        const mapped = systemByNodeName.get(node.name);
        if (mapped) {
          if (nodeByPartId.has(mapped.partId)) throw new Error(`GLB 中存在重复节点映射：${node.name}`);
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
        triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : positionCount / 3;
      });
      const expectedParts = loadedManifest.systems.flatMap((system) => system.parts);
      const missingParts = expectedParts.filter((part) => !nodeByPartId.has(part.id));
      if (missingParts.length > 0) throw new Error(`GLB 缺少清单节点：${missingParts.map((part) => part.nodeName).join('、')}`);
      const unmappedMeshes = allMeshes(model).filter((mesh) => !partIdByNode.has(mesh));
      if (unmappedMeshes.length > 0) throw new Error(`GLB 含有 ${unmappedMeshes.length} 个未纳入装置清单的网格，已拒绝加载。`);
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
        industrialAppearance ? INDUSTRIAL_STUDIO.grid.center : 0x3ab7a4,
        industrialAppearance ? INDUSTRIAL_STUDIO.grid.line : 0x1b4238,
      );
      grid.position.y = floorY;
      materialList(grid.material).forEach((material) => {
        material.transparent = true;
        material.opacity = industrialAppearance ? INDUSTRIAL_STUDIO.grid.opacity : 0.28;
        disposableMaterials.add(material);
      });
      scene.add(grid);
      const orbitMaterial = new THREE.MeshBasicMaterial({
        color: industrialAppearance ? INDUSTRIAL_STUDIO.orbit.color : 0x53e6cf,
        transparent: true,
        opacity: industrialAppearance ? INDUSTRIAL_STUDIO.orbit.opacity : 0.22,
        side: THREE.DoubleSide,
      });
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(3.72, 0.008, 6, 180), orbitMaterial);
      disposableMaterials.add(orbitMaterial);
      orbit.rotation.x = Math.PI / 2;
      orbit.position.y = floorY + 0.03;
      scene.add(orbit);

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
            material.emissiveIntensity = 3.15 + Math.sin((now - startedAt) * 0.0022) * 0.35;
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
        setWireframe: (enabled) => interactiveMaterials().forEach((material) => {
          if ('wireframe' in material) { (material as Material & { wireframe: boolean }).wireframe = enabled; material.needsUpdate = true; }
        }),
        setClipping: (enabled, axis, offset) => {
          clippingPlane.normal.set(axis === 'x' ? -1 : 0, axis === 'y' ? -1 : 0, axis === 'z' ? -1 : 0);
          clippingPlane.constant = offset * modelRadius;
          interactiveMaterials().forEach((material) => {
            material.clippingPlanes = enabled ? [clippingPlane] : null;
            material.needsUpdate = true;
          });
          localEfitOverlay?.setClippingEnabled(enabled);
        },
        setOpacity,
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
      };
      selectParts(selectedPartIdsRef.current);
      applyVisibility(hiddenPartIdsRef.current, isolatedPartIdsRef.current);
      setOpacity(opacityRef.current.global, opacityRef.current.selected);
      viewerRef.current.setWireframe(interactionRef.current.wireframe);
      viewerRef.current.setClipping(
        interactionRef.current.clipping,
        interactionRef.current.clipAxis,
        interactionRef.current.clipOffset,
      );
      controls.autoRotate = interactionRef.current.autoRotate;
      setStats({ meshes, triangles: Math.round(triangles), renderer: renderer.capabilities.isWebGL2 ? 'WEBGL 2' : 'WEBGL', parts: nodeByPartId.size });
      setProgress(100);
      setStatus('ready');
      setLodNotice((notice) => notice.startsWith('正在切换到') ? '' : notice);
    }

    initialise().catch((error: unknown) => {
      if (disposed) return;
      releaseResources();
      const preview = manifest.assets.webModels?.find((asset) => asset.quality === 'preview');
      if (selectedModel.quality === 'high' && preview && preview.id !== selectedModel.id) {
        const reason = error instanceof Error ? error.message : '未知加载错误';
        setLodNotice(`高清模型加载失败，已回退标准模型：${reason}`);
        setProgress(0);
        setStatus('loading');
        setSelectedModelId(preview.id);
        return;
      }
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '模型载入失败，请稍后重试。');
    });

    return () => { disposed = true; releaseResources(); viewerRef.current = null; };
  }, [activated, appearancePreset, attempt, manifest, selectedModel]);

  useEffect(() => {
    const overlay = viewerRef.current?.efitOverlay;
    if (!overlay || !efitStore) return;
    const sync = () => overlay.setFrame(efitStateRef.current.frame ?? currentEfitFrame(efitStore));
    sync();
    return efitStore.subscribe(sync);
  }, [efitStore, selectedModelId, status]);

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
    setLodNotice(`正在切换到${next.label}模型（约 ${megabytes(next.bytes)} MB）…`);
    setProgress(0);
    if (activated) setStatus('loading');
    setSelectedModelId(next.id);
  };
  const ready = status === 'ready';
  const packageBase = manifestUrl.slice(0, manifestUrl.lastIndexOf('/'));
  const sourceCadPath = manifest?.assets.sourceCad?.path ?? `${packageBase}/${viewerId}.step`;
  const webModelPath = selectedModel?.path ?? manifest?.assets.webModel.path ?? `${packageBase}/${viewerId}.glb`;
  const posterPath = manifest?.assets.poster?.path ?? (workspace ? null : '/models/paramak-tokamak-demo/paramak-tokamak-demo-poster.png');
  const isParamakPackage = manifest?.devicePackage.kind === 'public-demonstrator' || viewerId.includes('paramak');
  const estimatedMegabytes = selectedModel?.bytes ? megabytes(selectedModel.bytes) : manifest?.assets.webModel.bytes ? megabytes(manifest.assets.webModel.bytes) : workspace ? '2.2' : '1.1';
  const applicabilityStatement = manifest?.disclaimer ?? '该浏览器派生模型仅用于网页预览，不能用于制造、尺寸校核、仿真计算或安全决策。';

  return (
    <section id={sectionId ?? (workspace ? 'prototype-workspace' : 'device-3d')} className={`tokamakCadSection${workspace ? ' tokamakCadSection--workspace' : ''} appearance-${appearancePreset}`} data-three-viewer={viewerId} aria-labelledby={`${viewerId}-title`}>
      <div className="tokamakCadIntro">
        <p className="tokamakCadIndex">{workspace ? 'WORKSPACE / FULL-DEVICE DIGITAL MOCK-UP' : '03D / DEVICE PACKAGE VIEWER'}</p>
        <div>
          <h2 id={`${viewerId}-title`}>{workspace ? '浏览完整主体装置，并保持每个部件可追溯' : '从网页三维样机，进入可替换的装置数据包'}</h2>
          <p>{manifest ? `${manifest.title}由 DeviceManifest 驱动装配树、稳定部件 ID、单位、坐标系、数据分级与许可；当前交付的是浏览器派生几何，不等同于原始工程 CAD。` : '查看器由 DeviceManifest 驱动：几何、单位、坐标系、许可分级、稳定部件 ID 与装配树均来自同一份清单。'}</p>
        </div>
      </div>

      <div className={`tokamakCadShell status-${status}`} ref={fullscreenRef}>
        <div className="tokamakCadTopbar">
          <div className="tokamakCadIdentity"><span className="tokamakCadPulse" aria-hidden="true" /><div><b>{manifest?.title.toUpperCase() ?? 'MANIFEST-DRIVEN TOKAMAK PACKAGE'}</b><small>DEVICE-AGNOSTIC / LICENCE-AWARE PACKAGE CONTRACT</small></div></div>
          <div className="tokamakCadTopbarActions">
            {availableModels.length > 1 && <fieldset className="tokamakCadLodSelector" aria-label="模型精度">
              <legend className="srOnly">模型精度</legend>
              {availableModels.map((asset) => <button
                type="button"
                key={asset.id}
                className={selectedModel?.id === asset.id ? 'active' : ''}
                aria-pressed={selectedModel?.id === asset.id}
                disabled={status === 'loading'}
                onClick={() => selectModel(asset.id)}
                title={`${asset.label} · ${megabytes(asset.bytes)} MB${asset.triangles ? ` · ${formatCount(asset.triangles)} triangles` : ''}`}
              >{asset.quality === 'high' ? '高清' : '标准'} <small>{megabytes(asset.bytes)} MB</small></button>)}
            </fieldset>}
            <div className="tokamakCadStatus" aria-live="polite"><span>{ready ? `${selectedModel?.label ?? 'STANDARD'} · MODEL ONLINE` : status === 'loading' ? `STREAMING ${progress}%` : status === 'error' ? 'FALLBACK MODE' : 'STANDBY'}</span><i aria-hidden="true" /></div>
          </div>
        </div>

        <div className="tokamakCadWorkspace">
          <aside className="tokamakCadTree" aria-label="装配树">
            <div className="tokamakCadPanelHead"><span>ASSEMBLY TREE</span><b>{ready ? `${stats.parts} PARTS` : 'MANIFEST'}</b></div>
            <label className="tokamakCadSearch"><span className="srOnly">搜索部件</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、ID 或工程标签" disabled={!ready} /></label>
            <div className="tokamakCadTreeActions" aria-label="装配树批量操作">
              <button type="button" disabled={!ready || filteredPartIds.size === 0} onClick={selectFilteredParts}>选择筛选项</button>
              <button type="button" disabled={!ready || selectedPartIds.size === 0} onClick={clearSelection}>清除选择</button>
              <button type="button" disabled={!ready || filteredPartIds.size === 0} onClick={() => setPartIdsVisibility(filteredPartIds, false)}>隐藏筛选项</button>
              <button type="button" disabled={!ready || hiddenPartIds.size === 0} onClick={() => setPartIdsVisibility(new Set(hiddenPartIds), true)}>全部显示</button>
              <button type="button" className={isolatedPartIds.size > 0 ? 'active' : ''} disabled={!ready || selectedPartIds.size === 0} onClick={isolateSelection}>{isolatedPartIds.size > 0 ? '退出隔离' : '隔离选中'}</button>
            </div>
            <div className="tokamakCadTreeScroll">
              {manifest?.systems.map((system) => {
                const visibleParts = system.parts.filter((part) => !normalizedQuery || `${part.title} ${part.id} ${part.engineeringTag}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
                if (normalizedQuery && visibleParts.length === 0) return null;
                const expanded = normalizedQuery ? true : openSystems.has(system.id);
                return <div className="tokamakCadSystem" key={system.id}>
                  <button type="button" className="tokamakCadSystemButton" aria-expanded={expanded} onClick={() => toggleSystem(system.id)}><i style={{ background: system.color }} /><span>{system.title}<small>{system.shortTitle} · {system.parts.length}</small></span><b>{expanded ? '−' : '+'}</b></button>
                  {expanded && <div className="tokamakCadParts">{visibleParts.map((part) => <div className={`tokamakCadPart${selectedPartIds.has(part.id) ? ' active' : ''}${hiddenPartIds.has(part.id) ? ' hidden' : ''}`} key={part.id}>
                    <button type="button" className="tokamakCadPartToggle" onClick={() => selectPart(part.id, true)} aria-label={`${selectedPartIds.has(part.id) ? '取消选择' : '加入选择'}${part.title}`} aria-pressed={selectedPartIds.has(part.id)}>{selectedPartIds.has(part.id) ? '✓' : ''}</button>
                    <button type="button" className="tokamakCadPartSelect" onClick={(event) => selectPart(part.id, event.ctrlKey || event.metaKey || event.shiftKey)} aria-pressed={selectedPartIds.has(part.id)}><span>{part.title}</span><small>{part.id}</small></button>
                    <button type="button" className="tokamakCadIconButton" onClick={() => togglePartVisibility(part.id)} aria-label={`${hiddenPartIds.has(part.id) ? '显示' : '隐藏'}${part.title}`} aria-pressed={hiddenPartIds.has(part.id)}>{hiddenPartIds.has(part.id) ? '○' : '●'}</button>
                  </div>)}</div>}
                </div>;
              })}
              {ready && normalizedQuery && manifest?.systems.every((system) => system.parts.every((part) => !`${part.title} ${part.id} ${part.engineeringTag}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery))) && <p className="tokamakCadEmpty">未找到匹配部件</p>}
            </div>
          </aside>

          <div className="tokamakCadViewportShell">
            {posterPath && <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="tokamakCadPoster" src={posterPath} alt={`${manifest?.title ?? 'Tokamak'}三维模型预览`} loading="lazy" decoding="async" />
            </>}
            <div className="tokamakCadViewport" ref={mountRef} />
            <div className="tokamakCadScan" aria-hidden="true" /><div className="tokamakCadReticle" aria-hidden="true"><i /><i /></div>
            {status === 'idle' && <div className="tokamakCadLaunch"><div className="tokamakCadLaunchGlyph" aria-hidden="true"><span /><i /><b /></div><p>MANIFEST-DRIVEN DIGITAL ASSET / 01</p><h3>启动装置数据包查看器</h3><span>当前选择{selectedModel?.label ?? '标准'}质量，按需加载约 {estimatedMegabytes} MB。可浏览装配树、点选部件、显隐/隔离、透明度、X/Y/Z 剖切、线框与属性信息。</span>{lodNotice && <em className="tokamakCadLodNotice">{lodNotice}</em>}<button type="button" onClick={activate} disabled={!manifest || !selectedModel}>启动 3D VIEWER <i>→</i></button></div>}
            {status === 'loading' && <div className="tokamakCadLoading" role="status"><span>MANIFEST → {selectedModel?.quality === 'high' ? 'HIGH LOD' : 'PREVIEW LOD'} → GPU</span><div><i style={{ width: `${Math.max(6, progress)}%` }} /></div><b>{progress > 0 ? `${progress}% · ${selectedModel?.label ?? '模型'} ${estimatedMegabytes} MB` : `正在载入${selectedModel?.label ?? '选定'}模型`}</b>{lodNotice && <em className="tokamakCadLodNotice">{lodNotice}</em>}</div>}
            {status === 'error' && <div className="tokamakCadFallback"><div className="tokamakFallbackTorus" aria-hidden="true"><span /><i /><b /></div><p>WEBGL FALLBACK</p><h3>三维视图暂不可用</h3><span>{errorMessage}</span><div><button type="button" onClick={activate}>重新载入</button>{showDownloadActions && <a href={sourceCadPath} download>下载 STEP</a>}</div></div>}
            <div className="tokamakCadLegend" aria-label="部件颜色图例"><span><i className="plasma" />PLASMA</span><span><i className="tf" />TF COILS</span><span><i className="pf" />PF COILS / CASES</span><span><i className="structure" />STRUCTURE</span></div>
            <div className="tokamakCadReadout" aria-label="三维模型统计"><span><small>QUALITY</small><b>{selectedModel?.label ?? 'STANDARD'} · {estimatedMegabytes} MB</b></span><span><small>MESHES</small><b>{ready ? formatCount(stats.meshes) : '—'}</b></span><span><small>TRIANGLES</small><b>{ready ? formatCount(stats.triangles) : selectedModel?.triangles ? formatCount(selectedModel.triangles) : '—'}</b></span><span><small>RENDER</small><b>{ready ? stats.renderer : 'ON DEMAND'}</b></span></div>
          </div>

          <aside className="tokamakCadProperties" aria-label="部件属性">
            <div className="tokamakCadPanelHead"><span>PROPERTIES</span><b>{selectedPartIds.size > 1 ? `${selectedPartIds.size} SELECTED` : selectedPart ? selectedPart.id : 'NO SELECTION'}</b></div>
            {selectedPart ? <div className="tokamakCadPropertyBody">
              <p className="tokamakCadPropertyKicker" style={{ color: selectedPart.color }}>{selectedPart.systemTitle}</p><h3>{selectedPart.title}</h3><p>{selectedPart.description}</p>
              <dl><div><dt>稳定部件 ID</dt><dd>{selectedPart.id}</dd></div><div><dt>工程标签</dt><dd>{selectedPart.engineeringTag}</dd></div><div><dt>GLB 节点</dt><dd>{selectedPart.nodeName}</dd></div><div><dt>数据级别</dt><dd>{manifest?.access.classification}</dd></div></dl>
              {selectedPartIds.size > 1 && <p className="tokamakCadSelectionSummary">已多选 {selectedPartIds.size} 个部件；按 Ctrl / ⌘ / Shift 点击可增减选择。</p>}
              <div className="tokamakCadPropertyActions"><button type="button" onClick={() => togglePartVisibility(selectedPart.id)}>{hiddenPartIds.has(selectedPart.id) ? '显示当前部件' : '隐藏当前部件'}</button><button type="button" className={isolatedPartIds.size > 0 ? 'active' : ''} onClick={isolateSelection}>{isolatedPartIds.size > 0 ? '退出隔离' : `隔离选中（${selectedPartIds.size}）`}</button></div>
            </div> : <div className="tokamakCadPropertyEmpty"><span>◎</span><p>在装配树或三维视图中选择部件，查看稳定 ID、工程标签与数据级别。</p></div>}
            <div className="tokamakCadTrust"><b>PUBLIC DERIVATIVE</b><p>{manifest?.access.statement ?? '该演示不包含 ITER 或 EXL-50U 受限工程数据。'}</p></div>
          </aside>
        </div>

        <div className="tokamakCadControls" aria-label="三维视图控制">
          <div className="tokamakCadPresets"><span>VIEW</span>{(['iso', 'front', 'top'] as const).map((preset) => <button type="button" key={preset} disabled={!ready} className={activeView === preset ? 'active' : ''} aria-pressed={activeView === preset} onClick={() => selectView(preset)}>{preset === 'iso' ? '3/4' : preset === 'front' ? '前视' : '俯视'}</button>)}</div>
          <div className="tokamakCadPrecisionControls">
            <div className="tokamakCadClipAxes" aria-label="剖切轴">{(['x', 'y', 'z'] as const).map((axis) => <button type="button" key={axis} disabled={!ready} className={clipAxis === axis ? 'active' : ''} aria-pressed={clipAxis === axis} onClick={() => updateClipAxis(axis)}>{axis.toUpperCase()}</button>)}</div>
            <div className="tokamakCadClipControl"><label><span>切面 {clipAxis.toUpperCase()}</span><b>{Math.round(clipOffset * 100)}%</b><input type="range" min="-0.9" max="0.9" step="0.02" value={clipOffset} disabled={!ready || !clipping} onChange={(event) => updateClipOffset(Number(event.target.value))} /></label></div>
            <div className="tokamakCadOpacityControl global"><label><span>全局透明度</span><b>{Math.round(globalOpacity * 100)}%</b><input type="range" min="0.1" max="1" step="0.05" value={globalOpacity} disabled={!ready} onChange={(event) => updateGlobalOpacity(Number(event.target.value))} /></label></div>
            <div className="tokamakCadOpacityControl global"><label><span>选中透明度</span><b>{Math.round(selectedOpacity * 100)}%</b><input type="range" min="0.1" max="1" step="0.05" value={selectedOpacity} disabled={!ready || selectedPartIds.size === 0} onChange={(event) => updateSelectedOpacity(Number(event.target.value))} /></label></div>
          </div>
          <div className="tokamakCadTools"><button type="button" disabled={!ready} onClick={resetView}>复位</button><button type="button" disabled={!ready} className={autoRotate ? 'active' : ''} aria-pressed={autoRotate} onClick={toggleAutoRotate}>自转</button><button type="button" disabled={!ready} className={wireframe ? 'active' : ''} aria-pressed={wireframe} onClick={toggleWireframe}>线框</button><button type="button" disabled={!ready} className={clipping ? 'active' : ''} aria-pressed={clipping} onClick={toggleClipping}>剖切</button><button type="button" disabled={!ready} className={fullscreen ? 'active' : ''} aria-pressed={fullscreen} onClick={toggleFullscreen}>全屏</button></div>
        </div>
        {efitControls && <div className="tokamakCadEfitControls" aria-label="EFIT 三维叠加设置">
          <span>EFIT OVERLAY</span>
          <button type="button" className={efitControls.mode === 'xray' ? 'active' : ''} aria-pressed={efitControls.mode === 'xray'} onClick={() => efitControls.onModeChange(efitControls.mode === 'xray' ? 'physical' : 'xray')}>{efitControls.mode === 'xray' ? '透视可见' : '物理遮挡'}</button>
          <label title="颜色表示归一化极向磁通 ψN，不代表温度或密度"><input type="checkbox" checked={efitControls.showSection} onChange={(event) => efitControls.onShowSectionChange(event.currentTarget.checked)} />ψN 分带剖面</label>
          <label><input type="checkbox" checked={efitControls.showSurface} onChange={(event) => efitControls.onShowSurfaceChange(event.currentTarget.checked)} />LCFS 旋转面</label>
          <label><input type="checkbox" checked={efitControls.showMagneticAxis} onChange={(event) => efitControls.onShowMagneticAxisChange(event.currentTarget.checked)} />磁轴</label>
        </div>}
      </div>

      {showFootnotes && <div className="tokamakCadFootnotes">
        <p><b>科学与安全边界</b>{applicabilityStatement}{appearancePreset === 'industrial-silver-v1' && ' 银色、深合金、铜色及 CFC 外观仅用于结构辨识，不代表真实材料、涂层、表面状态或温度场。'}</p>
        <p><b>预览交付与可替换接口</b>{securityNotice ?? '模型以浏览器派生资产发送到用户设备；界面可隐藏下载操作，但无法从技术上阻止浏览器缓存、网络调试或复制已传输的数据。原始工程 CAD 不由此查看器交付。'}<a href={manifestUrl}>查看 DeviceManifest</a><a href="/models/device-manifest.schema.json">查看清单 Schema</a>{isParamakPackage && <a href="https://github.com/fusion-energy/paramak/tree/0.9.11" target="_blank" rel="noreferrer">Paramak 0.9.11</a>}<a href="/licenses/THREE-LICENSE.txt">Three.js 许可</a>{showDownloadActions && <><a href={sourceCadPath} download>下载 STEP</a><a href={webModelPath} download>下载 GLB</a></>}</p>
      </div>}
    </section>
  );
}
