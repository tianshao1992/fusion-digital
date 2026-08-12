'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Material,
  Mesh,
  Object3D,
  Plane,
  Scene,
  WebGLRenderer,
} from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { parseDeviceManifest, type DeviceManifest } from './deviceManifest';
import './tokamak-cad-viewer.css';

const DEFAULT_MANIFEST_URL = '/models/paramak-tokamak-demo/model-manifest.json';

type TokamakCadViewerProps = {
  manifestUrl?: string;
  viewerId?: string;
  sectionId?: string;
  workspace?: boolean;
};

type ViewerStatus = 'idle' | 'loading' | 'ready' | 'error';
type ViewPreset = 'iso' | 'front' | 'top';
type ViewerStats = { meshes: number; triangles: number; renderer: string; parts: number };
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
  setClipping: (enabled: boolean, offset: number) => void;
  applyVisibility: (hidden: Set<string>, isolated: string | null) => void;
  selectPart: (partId: string | null) => void;
  pickPart: (event: PointerEvent) => string | null;
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

export default function TokamakCadViewer({
  manifestUrl = DEFAULT_MANIFEST_URL,
  viewerId = 'paramak-tokamak-demo',
  sectionId,
  workspace = false,
}: TokamakCadViewerProps = {}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerApi | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const [activated, setActivated] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<ViewerStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [manifest, setManifest] = useState<DeviceManifest | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [clipping, setClipping] = useState(false);
  const [clipOffset, setClipOffset] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeView, setActiveView] = useState<ViewPreset>('iso');
  const [stats, setStats] = useState<ViewerStats>({ meshes: 0, triangles: 0, renderer: 'WEBGL 2', parts: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [hiddenPartIds, setHiddenPartIds] = useState<Set<string>>(() => new Set());
  const [isolatedPartId, setIsolatedPartId] = useState<string | null>(null);
  const [openSystems, setOpenSystems] = useState<Set<string>>(() => new Set());

  const parts = useMemo(() => manifest?.systems.flatMap((system) => system.parts.map((part) => ({
    ...part,
    systemId: system.id,
    systemTitle: system.title,
    color: system.color,
  }))) ?? [], [manifest]);
  const partById = useMemo(() => new Map(parts.map((part) => [part.id, part])), [parts]);
  const selectedPart = selectedPartId ? partById.get(selectedPartId) ?? null : null;
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');

  const activate = useCallback(() => {
    setErrorMessage('');
    setProgress(0);
    setStatus('loading');
    if (activated) setAttempt((value) => value + 1);
    else setActivated(true);
  }, [activated]);

  useEffect(() => {
    if (!activated || !mountRef.current) return;

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
    let localDisposableMaterials: Set<Material> | null = null;
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

      const [manifestResponse, THREE, controlsModule, loaderModule] = await Promise.all([
        fetch(manifestUrl, { cache: 'no-store' }),
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
      ]);
      if (!manifestResponse.ok) throw new Error(`装置清单载入失败（HTTP ${manifestResponse.status}）。`);
      const loadedManifest = parseDeviceManifest(await manifestResponse.json());
      if (loadedManifest.access.classification !== 'PUBLIC') throw new Error('当前网页只允许加载 PUBLIC 级的浏览器派生资产。');
      if (!loadedManifest.access.redistributionAllowed) throw new Error('该装置包未授予公开再分发权，已拒绝在公网站点加载。');
      if (disposed || !mountRef.current) return;
      setManifest(loadedManifest);
      setOpenSystems(new Set(loadedManifest.systems.map((system) => system.id)));

      const mount = mountRef.current;
      const scene = new THREE.Scene();
      localScene = scene;
      scene.fog = new THREE.FogExp2(0x07110e, 0.032);
      const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 120);
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      localRenderer = renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.setClearColor(0x07110e, 0);
      renderer.localClippingEnabled = true;
      renderer.domElement.setAttribute('aria-label', '可旋转、缩放并选择部件的通用 Tokamak 三维模型');
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

      const materialByCategory = {
        plasma: new THREE.MeshPhysicalMaterial({ color: 0xff6a1e, emissive: 0xff3d09, emissiveIntensity: 3.4, roughness: 0.18, metalness: 0.08, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
        tf: new THREE.MeshStandardMaterial({ color: 0x42d9c8, emissive: 0x0a665f, emissiveIntensity: 0.48, roughness: 0.3, metalness: 0.72 }),
        pf: new THREE.MeshStandardMaterial({ color: 0x9476ff, emissive: 0x37216e, emissiveIntensity: 0.42, roughness: 0.32, metalness: 0.7 }),
        layer: new THREE.MeshStandardMaterial({ color: 0x8d775f, emissive: 0x170c05, emissiveIntensity: 0.06, roughness: 0.56, metalness: 0.68, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
        structure: new THREE.MeshStandardMaterial({ color: 0x7f958d, emissive: 0x10231d, emissiveIntensity: 0.18, roughness: 0.46, metalness: 0.78 }),
      };
      const viewerMaterials = new Set<Material>(Object.values(materialByCategory));
      const disposableMaterials = new Set<Material>(viewerMaterials);
      localDisposableMaterials = disposableMaterials;

      const loader = new loaderModule.GLTFLoader();
      const gltf = await loader.loadAsync(loadedManifest.assets.webModel.path, (event) => {
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
      const systemByNodeName = new Map<string, { category: keyof typeof materialByCategory; partId: string }>();
      const systemByPartId = new Map<string, DeviceManifest['systems'][number]>();
      loadedManifest.systems.forEach((system) => system.parts.forEach((part) => systemByNodeName.set(part.nodeName, { category: system.category, partId: part.id })));
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
        const replacement = materialByCategory[system?.category ?? 'structure'];
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
      const grid = new THREE.GridHelper(18, 36, 0x3ab7a4, 0x1b4238);
      grid.position.y = floorY;
      materialList(grid.material).forEach((material) => { material.transparent = true; material.opacity = 0.28; disposableMaterials.add(material); });
      scene.add(grid);
      const orbitMaterial = new THREE.MeshBasicMaterial({ color: 0x53e6cf, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(3.72, 0.008, 6, 180), orbitMaterial);
      disposableMaterials.add(orbitMaterial);
      orbit.rotation.x = Math.PI / 2;
      orbit.position.y = floorY + 0.03;
      scene.add(orbit);

      const target = fittedSphere.center.clone();
      const modelRadius = Math.max(fittedSphere.radius, 0.1);
      let currentPreset: ViewPreset = 'iso';
      const setView = (preset: ViewPreset) => {
        currentPreset = preset;
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
      const highlightMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffd06b, emissive: 0xff6a1e, emissiveIntensity: 1.8, roughness: 0.22, metalness: 0.56, transparent: true, opacity: 0.96, side: THREE.DoubleSide });
      disposableMaterials.add(highlightMaterial);
      const applyVisibility = (hidden: Set<string>, isolated: string | null) => {
        nodeByPartId.forEach((node, partId) => { node.visible = isolated ? partId === isolated : !hidden.has(partId); });
      };
      const selectPart = (partId: string | null) => {
        originalMaterials.forEach((material, mesh) => { mesh.material = material; });
        if (!partId) return;
        const node = nodeByPartId.get(partId);
        if (!node) return;
        allMeshes(node).forEach((mesh) => { mesh.material = highlightMaterial; });
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

      const resize = () => {
        if (!mountRef.current) return;
        const width = Math.max(1, mountRef.current.clientWidth);
        const height = Math.max(1, mountRef.current.clientHeight);
        camera.aspect = width / height;
        renderer.setSize(width, height, false);
        setView(currentPreset);
      };
      resize();
      if (typeof ResizeObserver !== 'undefined') { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(mount); }
      else { resizeFallback = resize; window.addEventListener('resize', resizeFallback); }
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
        setSelectedPartId(partId);
        selectPart(partId);
      };
      renderer.domElement.addEventListener('pointerdown', pointerDownHandler);
      renderer.domElement.addEventListener('pointerup', pointerUpHandler);

      const plasmaMaterial = materialByCategory.plasma;
      const startedAt = performance.now();
      const render = (now: number) => {
        if (disposed) return;
        if (pageVisible && inViewport) {
          plasmaMaterial.emissiveIntensity = 3.15 + Math.sin((now - startedAt) * 0.0022) * 0.35;
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
        setWireframe: (enabled) => viewerMaterials.forEach((material) => {
          if ('wireframe' in material) { (material as Material & { wireframe: boolean }).wireframe = enabled; material.needsUpdate = true; }
        }),
        setClipping: (enabled, offset) => {
          clippingPlane.constant = offset * modelRadius;
          viewerMaterials.forEach((material) => { material.clippingPlanes = enabled ? [clippingPlane] : null; material.needsUpdate = true; });
          highlightMaterial.clippingPlanes = enabled ? [clippingPlane] : null;
          highlightMaterial.needsUpdate = true;
        },
        applyVisibility,
        selectPart,
        pickPart,
      };
      setStats({ meshes, triangles: Math.round(triangles), renderer: renderer.capabilities.isWebGL2 ? 'WEBGL 2' : 'WEBGL', parts: nodeByPartId.size });
      setProgress(100);
      setStatus('ready');
    }

    initialise().catch((error: unknown) => {
      if (disposed) return;
      releaseResources();
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '模型载入失败，请稍后重试。');
    });

    return () => { disposed = true; releaseResources(); viewerRef.current = null; };
  }, [activated, attempt, manifestUrl]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === fullscreenRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const selectView = (preset: ViewPreset) => { viewerRef.current?.setView(preset); setActiveView(preset); };
  const toggleAutoRotate = () => { const next = !autoRotate; if (viewerRef.current) viewerRef.current.controls.autoRotate = next; setAutoRotate(next); };
  const toggleWireframe = () => { const next = !wireframe; viewerRef.current?.setWireframe(next); setWireframe(next); };
  const toggleClipping = () => { const next = !clipping; viewerRef.current?.setClipping(next, clipOffset); setClipping(next); };
  const updateClipOffset = (value: number) => { setClipOffset(value); viewerRef.current?.setClipping(clipping, value); };
  const resetView = () => {
    viewerRef.current?.reset();
    if (viewerRef.current) viewerRef.current.controls.autoRotate = false;
    setActiveView('iso'); setAutoRotate(false); setSelectedPartId(null); setIsolatedPartId(null); setHiddenPartIds(new Set());
    viewerRef.current?.selectPart(null); viewerRef.current?.applyVisibility(new Set(), null);
  };
  const selectPart = (partId: string) => { setSelectedPartId(partId); setIsolatedPartId(null); viewerRef.current?.selectPart(partId); viewerRef.current?.applyVisibility(hiddenPartIds, null); };
  const togglePartVisibility = (partId: string) => {
    const next = new Set(hiddenPartIds);
    if (next.has(partId)) next.delete(partId); else next.add(partId);
    setHiddenPartIds(next); setIsolatedPartId(null); viewerRef.current?.applyVisibility(next, null);
  };
  const isolatePart = (partId: string) => {
    const next = isolatedPartId === partId ? null : partId;
    setIsolatedPartId(next); setSelectedPartId(partId); viewerRef.current?.selectPart(partId); viewerRef.current?.applyVisibility(hiddenPartIds, next);
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
  const ready = status === 'ready';
  const packageBase = manifestUrl.slice(0, manifestUrl.lastIndexOf('/'));
  const sourceCadPath = manifest?.assets.sourceCad?.path ?? `${packageBase}/${viewerId}.step`;
  const webModelPath = manifest?.assets.webModel.path ?? `${packageBase}/${viewerId}.glb`;
  const posterPath = manifest?.assets.poster?.path ?? (workspace ? null : '/models/paramak-tokamak-demo/paramak-tokamak-demo-poster.png');
  const licensePath = `${packageBase}/PARAMAK-LICENSE.txt`;

  return (
    <section id={sectionId ?? (workspace ? 'prototype-workspace' : 'device-3d')} className={`tokamakCadSection${workspace ? ' tokamakCadSection--workspace' : ''}`} data-three-viewer={viewerId} aria-labelledby={`${viewerId}-title`}>
      <div className="tokamakCadIntro">
        <p className="tokamakCadIndex">{workspace ? 'WORKSPACE / FULL-DEVICE DIGITAL MOCK-UP' : '03D / DEVICE PACKAGE VIEWER'}</p>
        <div>
          <h2 id={`${viewerId}-title`}>{workspace ? '浏览完整主体装置，并保持每个部件可追溯' : '从网页三维样机，进入可替换的装置数据包'}</h2>
          <p>{workspace ? '当前工作台展示公开 Paramak 生成的 360° 通用 Tokamak 主体装置。装配树、稳定部件 ID、单位、坐标系、数据分级与许可均由 DeviceManifest 统一驱动；它验证数字样机工作流，不代表 ITER 或 EXL-50U 的工程几何。' : '查看器由 DeviceManifest 驱动：几何、单位、坐标系、许可分级、稳定部件 ID 与装配树均来自同一份清单。当前仅加载公开 Paramak 演示资产；未来 ITER 参考包或 EXL-50U 受控包沿用接口，但真实工程数据不进入公共站点。'}</p>
        </div>
      </div>

      <div className={`tokamakCadShell status-${status}`} ref={fullscreenRef}>
        <div className="tokamakCadTopbar">
          <div className="tokamakCadIdentity"><span className="tokamakCadPulse" aria-hidden="true" /><div><b>{manifest?.title.toUpperCase() ?? (workspace ? 'GENERIC FULL-DEVICE PARAMAK TOKAMAK' : 'GENERIC PARAMAK TOKAMAK')}</b><small>DEVICE-AGNOSTIC / EXL-ADAPTABLE PACKAGE CONTRACT</small></div></div>
          <div className="tokamakCadStatus" aria-live="polite"><span>{ready ? `${manifest?.access.classification ?? 'PUBLIC'} · MODEL ONLINE` : status === 'loading' ? `STREAMING ${progress}%` : status === 'error' ? 'FALLBACK MODE' : 'STANDBY'}</span><i aria-hidden="true" /></div>
        </div>

        <div className="tokamakCadWorkspace">
          <aside className="tokamakCadTree" aria-label="装配树">
            <div className="tokamakCadPanelHead"><span>ASSEMBLY TREE</span><b>{ready ? `${stats.parts} PARTS` : 'MANIFEST'}</b></div>
            <label className="tokamakCadSearch"><span className="srOnly">搜索部件</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、ID 或工程标签" disabled={!ready} /></label>
            <div className="tokamakCadTreeScroll">
              {manifest?.systems.map((system) => {
                const visibleParts = system.parts.filter((part) => !normalizedQuery || `${part.title} ${part.id} ${part.engineeringTag}`.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
                if (normalizedQuery && visibleParts.length === 0) return null;
                const expanded = normalizedQuery ? true : openSystems.has(system.id);
                return <div className="tokamakCadSystem" key={system.id}>
                  <button type="button" className="tokamakCadSystemButton" aria-expanded={expanded} onClick={() => toggleSystem(system.id)}><i style={{ background: system.color }} /><span>{system.title}<small>{system.shortTitle} · {system.parts.length}</small></span><b>{expanded ? '−' : '+'}</b></button>
                  {expanded && <div className="tokamakCadParts">{visibleParts.map((part) => <div className={`tokamakCadPart${selectedPartId === part.id ? ' active' : ''}`} key={part.id}>
                    <button type="button" className="tokamakCadPartSelect" onClick={() => selectPart(part.id)} aria-pressed={selectedPartId === part.id}><span>{part.title}</span><small>{part.id}</small></button>
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
              <img className="tokamakCadPoster" src={posterPath} alt="通用 Paramak Tokamak 三维模型预览" loading="lazy" decoding="async" />
            </>}
            <div className="tokamakCadViewport" ref={mountRef} />
            <div className="tokamakCadScan" aria-hidden="true" /><div className="tokamakCadReticle" aria-hidden="true"><i /><i /></div>
            {status === 'idle' && <div className="tokamakCadLaunch"><div className="tokamakCadLaunchGlyph" aria-hidden="true"><span /><i /><b /></div><p>MANIFEST-DRIVEN DIGITAL ASSET / 01</p><h3>启动装置数据包查看器</h3><span>按需加载约 {workspace ? '2.2' : '1.1'} MB 的公开 GLB 派生资产。可浏览装配树、点选部件、显隐/隔离、剖切、线框与属性信息。</span><button type="button" onClick={activate}>启动 3D VIEWER <i>→</i></button></div>}
            {status === 'loading' && <div className="tokamakCadLoading" role="status"><span>MANIFEST → GLB → GPU</span><div><i style={{ width: `${Math.max(6, progress)}%` }} /></div><b>{progress > 0 ? `${progress}%` : '正在验证装置清单与数据分级'}</b></div>}
            {status === 'error' && <div className="tokamakCadFallback"><div className="tokamakFallbackTorus" aria-hidden="true"><span /><i /><b /></div><p>WEBGL FALLBACK</p><h3>三维视图暂不可用</h3><span>{errorMessage}</span><div><button type="button" onClick={activate}>重新载入</button><a href={sourceCadPath} download>下载 STEP</a></div></div>}
            <div className="tokamakCadLegend" aria-label="部件颜色图例"><span><i className="plasma" />PLASMA</span><span><i className="tf" />TF COILS</span><span><i className="pf" />PF COILS / CASES</span><span><i className="structure" />STRUCTURE</span></div>
            <div className="tokamakCadReadout" aria-label="三维模型统计"><span><small>FORMAT</small><b>{manifest?.assets.webModel.format ?? 'GLB 2.0'}</b></span><span><small>MESHES</small><b>{ready ? formatCount(stats.meshes) : '—'}</b></span><span><small>TRIANGLES</small><b>{ready ? formatCount(stats.triangles) : '—'}</b></span><span><small>RENDER</small><b>{ready ? stats.renderer : 'ON DEMAND'}</b></span></div>
          </div>

          <aside className="tokamakCadProperties" aria-label="部件属性">
            <div className="tokamakCadPanelHead"><span>PROPERTIES</span><b>{selectedPart ? selectedPart.id : 'NO SELECTION'}</b></div>
            {selectedPart ? <div className="tokamakCadPropertyBody">
              <p className="tokamakCadPropertyKicker" style={{ color: selectedPart.color }}>{selectedPart.systemTitle}</p><h3>{selectedPart.title}</h3><p>{selectedPart.description}</p>
              <dl><div><dt>稳定部件 ID</dt><dd>{selectedPart.id}</dd></div><div><dt>工程标签</dt><dd>{selectedPart.engineeringTag}</dd></div><div><dt>GLB 节点</dt><dd>{selectedPart.nodeName}</dd></div><div><dt>数据级别</dt><dd>{manifest?.access.classification}</dd></div></dl>
              <div className="tokamakCadPropertyActions"><button type="button" onClick={() => togglePartVisibility(selectedPart.id)}>{hiddenPartIds.has(selectedPart.id) ? '显示部件' : '隐藏部件'}</button><button type="button" className={isolatedPartId === selectedPart.id ? 'active' : ''} onClick={() => isolatePart(selectedPart.id)}>{isolatedPartId === selectedPart.id ? '退出隔离' : '隔离部件'}</button></div>
            </div> : <div className="tokamakCadPropertyEmpty"><span>◎</span><p>在装配树或三维视图中选择部件，查看稳定 ID、工程标签与数据级别。</p></div>}
            <div className="tokamakCadTrust"><b>PUBLIC DERIVATIVE</b><p>{manifest?.access.statement ?? '该演示不包含 ITER 或 EXL-50U 受限工程数据。'}</p></div>
          </aside>
        </div>

        <div className="tokamakCadControls" aria-label="三维视图控制">
          <div className="tokamakCadPresets"><span>VIEW</span>{(['iso', 'front', 'top'] as const).map((preset) => <button type="button" key={preset} disabled={!ready} className={activeView === preset ? 'active' : ''} aria-pressed={activeView === preset} onClick={() => selectView(preset)}>{preset === 'iso' ? '3/4' : preset === 'front' ? '前视' : '俯视'}</button>)}</div>
          <div className="tokamakCadClipControl"><label><span>剖切 X</span><input type="range" min="-0.9" max="0.9" step="0.02" value={clipOffset} disabled={!ready || !clipping} onChange={(event) => updateClipOffset(Number(event.target.value))} /></label></div>
          <div className="tokamakCadTools"><button type="button" disabled={!ready} onClick={resetView}>复位</button><button type="button" disabled={!ready} className={autoRotate ? 'active' : ''} aria-pressed={autoRotate} onClick={toggleAutoRotate}>自转</button><button type="button" disabled={!ready} className={wireframe ? 'active' : ''} aria-pressed={wireframe} onClick={toggleWireframe}>线框</button><button type="button" disabled={!ready} className={clipping ? 'active' : ''} aria-pressed={clipping} onClick={toggleClipping}>剖切</button><button type="button" disabled={!ready} className={fullscreen ? 'active' : ''} aria-pressed={fullscreen} onClick={toggleFullscreen}>全屏</button></div>
        </div>
      </div>

      <div className="tokamakCadFootnotes">
        <p><b>科学与安全边界</b>当前模型是 Paramak 生成的通用 Tokamak 参数化几何，仅验证网页交互和装置包契约；它不是 EXL-50U、EHL-2 或其他在役装置的工程权威模型，也不是 ITER 工程 CAD，不能用于制造、尺寸校核、仿真计算或安全决策。</p>
        <p><b>开放来源与可替换接口</b>模型基于 MIT 许可的 <a href="https://github.com/fusion-energy/paramak/tree/0.9.11" target="_blank" rel="noreferrer">Paramak 0.9.11</a> 工作流；渲染采用 MIT 许可的 Three.js。<a href={sourceCadPath} download>下载 STEP</a><a href={webModelPath} download>下载 GLB</a><a href={manifestUrl}>查看 DeviceManifest</a><a href="/models/device-manifest.schema.json">查看清单 Schema</a><a href={licensePath}>Paramak 许可</a><a href="/licenses/THREE-LICENSE.txt">Three.js 许可</a></p>
      </div>
    </section>
  );
}
