'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './tokamak-cad-viewer.css';

const MODEL_URL = '/models/paramak-tokamak-demo/paramak-tokamak-demo.glb';
const STEP_URL = '/models/paramak-tokamak-demo/paramak-tokamak-demo.step';

type ViewerStatus = 'idle' | 'loading' | 'ready' | 'error';
type ViewPreset = 'iso' | 'front' | 'top';

type ViewerStats = {
  meshes: number;
  triangles: number;
  renderer: string;
};

type ViewerApi = {
  controls: OrbitControls;
  camera: PerspectiveCamera;
  scene: Scene;
  renderer: WebGLRenderer;
  model: Object3D;
  distance: number;
  target: Vector3;
  materials: Set<Material>;
  disposableMaterials: Set<Material>;
  setView: (preset: ViewPreset) => void;
  reset: () => void;
  setWireframe: (enabled: boolean) => void;
};

function formatCount(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function classifyPart(name: string) {
  const id = name.toLowerCase().replace(/[\s_-]+/g, '');
  if (/plasma/.test(id)) return 'plasma';
  if (/(tfcoil|toroidalfield|toroidalmagnet|tfmagnet)/.test(id)) return 'tf';
  if (/(pfcoil|poloidalfield|poloidalmagnet|pfmagnet|solenoid|cscoil)/.test(id)) return 'pf';
  if (/(layer|extraintersect|blanket|firstwall|divertor|shield|vacuumvessel|vessel|wall)/.test(id)) return 'layer';
  return 'structure';
}

function supportsWebGL2() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(window.WebGL2RenderingContext && probe.getContext('webgl2'));
  } catch {
    return false;
  }
}

function disposeObject(root: Object3D) {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    source.forEach((material) => material?.dispose());
  });
}

export default function TokamakCadViewer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerApi | null>(null);
  const [activated, setActivated] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<ViewerStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [activeView, setActiveView] = useState<ViewPreset>('iso');
  const [stats, setStats] = useState<ViewerStats>({ meshes: 0, triangles: 0, renderer: 'WEBGL 2' });
  const [errorMessage, setErrorMessage] = useState('');

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
    let pageVisible = !document.hidden;
    let inViewport = true;
    let api: ViewerApi | null = null;
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
      if (!supportsWebGL2()) {
        throw new Error('当前浏览器或显卡未启用 WebGL 2，无法启动三维视图。');
      }

      const [THREE, controlsModule, loaderModule] = await Promise.all([
        import('three'),
        import('three/examples/jsm/controls/OrbitControls.js'),
        import('three/examples/jsm/loaders/GLTFLoader.js'),
      ]);

      if (disposed || !mountRef.current) return;
      const mount = mountRef.current;
      const scene = new THREE.Scene();
      localScene = scene;
      scene.fog = new THREE.FogExp2(0x07110e, 0.032);

      const camera = new THREE.PerspectiveCamera(36, 1, 0.02, 120);
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      localRenderer = renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      renderer.setClearColor(0x07110e, 0);
      renderer.domElement.setAttribute('aria-label', '可旋转缩放的通用 Paramak Tokamak 三维模型');
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
      controls.autoRotate = false;
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

      const materialByClass = {
        plasma: new THREE.MeshPhysicalMaterial({
          color: 0xff6a1e,
          emissive: 0xff3d09,
          emissiveIntensity: 3.4,
          roughness: 0.18,
          metalness: 0.08,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
        }),
        tf: new THREE.MeshStandardMaterial({
          color: 0x42d9c8,
          emissive: 0x0a665f,
          emissiveIntensity: 0.48,
          roughness: 0.3,
          metalness: 0.72,
        }),
        pf: new THREE.MeshStandardMaterial({
          color: 0x9476ff,
          emissive: 0x37216e,
          emissiveIntensity: 0.42,
          roughness: 0.32,
          metalness: 0.7,
        }),
        layer: new THREE.MeshStandardMaterial({
          color: 0x8d775f,
          emissive: 0x170c05,
          emissiveIntensity: 0.06,
          roughness: 0.56,
          metalness: 0.68,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
        structure: new THREE.MeshStandardMaterial({
          color: 0x7f958d,
          emissive: 0x10231d,
          emissiveIntensity: 0.18,
          roughness: 0.46,
          metalness: 0.78,
        }),
      };
      const viewerMaterials = new Set<Material>(Object.values(materialByClass));
      const disposableMaterials = new Set<Material>(viewerMaterials);
      localDisposableMaterials = disposableMaterials;

      const loader = new loaderModule.GLTFLoader();
      const gltf = await loader.loadAsync(MODEL_URL, (event) => {
        if (!disposed && event.total > 0) {
          setProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        }
      });

      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }

      const model = gltf.scene;
      localModel = model;
      const sourceMaterials = new Set<Material>();
      let meshes = 0;
      let triangles = 0;

      model.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        const mesh = node as Mesh;
        meshes += 1;
        const previous = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        previous.forEach((material) => sourceMaterials.add(material));
        const category = classifyPart(`${node.name} ${node.parent?.name ?? ''}`);
        mesh.material = materialByClass[category];
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        const positionCount = mesh.geometry.attributes.position?.count ?? 0;
        triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : positionCount / 3;
      });
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
      const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
      gridMaterials.forEach((material) => {
        material.transparent = true;
        material.opacity = 0.28;
        disposableMaterials.add(material);
      });
      scene.add(grid);

      const orbitMaterial = new THREE.MeshBasicMaterial({
        color: 0x53e6cf,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
      });
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(3.72, 0.008, 6, 180), orbitMaterial);
      disposableMaterials.add(orbitMaterial);
      orbit.rotation.x = Math.PI / 2;
      orbit.position.y = floorY + 0.03;
      scene.add(orbit);

      const target = fittedSphere.center.clone();
      const modelRadius = Math.max(fittedSphere.radius, 0.1);
      const fitMargin = 1.45;
      let distance = 0;
      let currentPreset: ViewPreset = 'iso';
      const setView = (preset: ViewPreset) => {
        currentPreset = preset;
        const verticalHalfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
        const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * Math.max(camera.aspect, 0.1));
        const limitingHalfFov = Math.max(0.08, Math.min(verticalHalfFov, horizontalHalfFov));
        distance = (modelRadius / Math.sin(limitingHalfFov)) * fitMargin;
        camera.near = Math.max(0.01, modelRadius * 0.005);
        camera.far = Math.max(distance * 4.5 + modelRadius * 2, modelRadius * 24);
        controls.minDistance = modelRadius * 1.2;
        controls.maxDistance = distance * 3.8;
        camera.up.set(0, 1, 0);
        const direction = new THREE.Vector3(0.92, 0.58, 1).normalize();
        if (preset === 'front') direction.set(0, 0.025, 1).normalize();
        if (preset === 'top') {
          camera.up.set(0, 0, -1);
          direction.set(0, 1, 0.001).normalize();
        }
        camera.position.copy(target).addScaledVector(direction, distance);
        controls.target.copy(target);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        controls.update();
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
      controls.saveState();
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);
      } else {
        resizeFallback = resize;
        window.addEventListener('resize', resizeFallback);
      }
      if (typeof IntersectionObserver !== 'undefined') {
        intersectionObserver = new IntersectionObserver(([entry]) => { inViewport = entry.isIntersecting; }, { rootMargin: '120px' });
        intersectionObserver.observe(mount);
      }
      visibilityHandler = () => { pageVisible = !document.hidden; };
      document.addEventListener('visibilitychange', visibilityHandler);

      const plasmaMaterial = materialByClass.plasma;
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

      api = {
        controls,
        camera,
        scene,
        renderer,
        model,
        distance,
        target,
        materials: viewerMaterials,
        disposableMaterials,
        setView,
        reset: () => {
          setView('iso');
        },
        setWireframe: (enabled: boolean) => {
          viewerMaterials.forEach((material) => {
            if ('wireframe' in material) {
              (material as Material & { wireframe: boolean }).wireframe = enabled;
              material.needsUpdate = true;
            }
          });
        },
      };
      viewerRef.current = api;
      setStats({
        meshes,
        triangles: Math.round(triangles),
        renderer: renderer.capabilities.isWebGL2 ? 'WEBGL 2' : 'WEBGL',
      });
      setProgress(100);
      setStatus('ready');
    }

    initialise().catch((error: unknown) => {
      if (disposed) return;
      releaseResources();
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : '模型载入失败，请稍后重试。');
    });

    return () => {
      disposed = true;
      releaseResources();
      viewerRef.current = null;
    };
  }, [activated, attempt]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === fullscreenRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const selectView = (preset: ViewPreset) => {
    viewerRef.current?.setView(preset);
    setActiveView(preset);
  };

  const toggleAutoRotate = () => {
    const next = !autoRotate;
    if (viewerRef.current) viewerRef.current.controls.autoRotate = next;
    setAutoRotate(next);
  };

  const toggleWireframe = () => {
    const next = !wireframe;
    viewerRef.current?.setWireframe(next);
    setWireframe(next);
  };

  const resetView = () => {
    viewerRef.current?.reset();
    if (viewerRef.current) viewerRef.current.controls.autoRotate = false;
    setActiveView('iso');
    setAutoRotate(false);
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await fullscreenRef.current?.requestFullscreen();
      }
    } catch {
      setFullscreen(false);
    }
  };

  const ready = status === 'ready';

  return (
    <section id="device-3d" className="tokamakCadSection" data-three-viewer="paramak-tokamak-demo" aria-labelledby="tokamak-cad-title">
      <div className="tokamakCadIntro">
        <p className="tokamakCadIndex">03D / INTERACTIVE DEVICE MODEL</p>
        <div>
          <h2 id="tokamak-cad-title">从二维知识图谱，进入可交互装置空间</h2>
          <p>
            以开源 Paramak 参数化模型作为首个网页三维样机，验证 CAD 轻量化、部件语义、交互浏览与数字孪生界面的连接方式。
            后续可替换为经过授权和脱敏的 EXL-50U 几何、传感器位置与仿真结果。
          </p>
        </div>
      </div>

      <div className={`tokamakCadShell status-${status}`} ref={fullscreenRef}>
        <div className="tokamakCadTopbar">
          <div className="tokamakCadIdentity">
            <span className="tokamakCadPulse" aria-hidden="true" />
            <div>
              <b>GENERIC PARAMAK TOKAMAK</b>
              <small>OPEN-SOURCE CAD · WEB VISUALIZATION MESH</small>
            </div>
          </div>
          <div className="tokamakCadStatus" aria-live="polite">
            <span>{status === 'ready' ? 'MODEL ONLINE' : status === 'loading' ? `STREAMING ${progress}%` : status === 'error' ? 'FALLBACK MODE' : 'STANDBY'}</span>
            <i aria-hidden="true" />
          </div>
        </div>

        <div className="tokamakCadViewportShell">
          {/* The poster is a pre-compressed visualization asset and remains a plain lazy image for the WebGL fallback path. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="tokamakCadPoster" src="/models/paramak-tokamak-demo/paramak-tokamak-demo-poster.png" alt="通用 Paramak Tokamak 三维模型预览" loading="lazy" decoding="async" />
          <div className="tokamakCadViewport" ref={mountRef} />
          <div className="tokamakCadScan" aria-hidden="true" />
          <div className="tokamakCadReticle" aria-hidden="true"><i /><i /></div>

          {status === 'idle' && (
            <div className="tokamakCadLaunch">
              <div className="tokamakCadLaunchGlyph" aria-hidden="true"><span /><i /><b /></div>
              <p>INTERACTIVE DIGITAL ASSET / 01</p>
              <h3>启动 Tokamak 三维样机</h3>
              <span>点击后加载约束在本页面内的 WebGL 交互模块；拖动旋转、滚轮缩放、右键平移。</span>
              <button type="button" onClick={activate}>启动 3D VIEWER <i>↗</i></button>
            </div>
          )}

          {status === 'loading' && (
            <div className="tokamakCadLoading" role="status">
              <span>CAD → GLB → GPU</span>
              <div><i style={{ width: `${Math.max(6, progress)}%` }} /></div>
              <b>{progress > 0 ? `${progress}%` : '正在初始化渲染管线'}</b>
            </div>
          )}

          {status === 'error' && (
            <div className="tokamakCadFallback">
              <div className="tokamakFallbackTorus" aria-hidden="true"><span /><i /><b /></div>
              <p>WEBGL FALLBACK</p>
              <h3>三维视图暂不可用</h3>
              <span>{errorMessage}</span>
              <div>
                <button type="button" onClick={activate}>重新载入</button>
                <a href={STEP_URL} download>下载 STEP</a>
              </div>
            </div>
          )}

          <div className="tokamakCadLegend" aria-label="部件颜色图例">
            <span><i className="plasma" />PLASMA</span>
            <span><i className="tf" />TF COILS</span>
            <span><i className="pf" />PF COILS / CASES</span>
            <span><i className="structure" />LAYERS</span>
          </div>

          <div className="tokamakCadReadout" aria-label="三维模型统计">
            <span><small>FORMAT</small><b>GLB 2.0</b></span>
            <span><small>MESHES</small><b>{ready ? formatCount(stats.meshes) : '—'}</b></span>
            <span><small>TRIANGLES</small><b>{ready ? formatCount(stats.triangles) : '—'}</b></span>
            <span><small>RENDER</small><b>{ready ? stats.renderer : 'ON DEMAND'}</b></span>
          </div>
        </div>

        <div className="tokamakCadControls" aria-label="三维视图控制">
          <div className="tokamakCadPresets">
            <span>VIEW</span>
            {(['iso', 'front', 'top'] as const).map((preset) => (
              <button
                type="button"
                key={preset}
                disabled={!ready}
                className={activeView === preset ? 'active' : ''}
                aria-pressed={activeView === preset}
                onClick={() => selectView(preset)}
              >
                {preset === 'iso' ? '3/4' : preset === 'front' ? '前视' : '俯视'}
              </button>
            ))}
          </div>
          <div className="tokamakCadTools">
            <button type="button" disabled={!ready} onClick={resetView}>复位</button>
            <button type="button" disabled={!ready} className={autoRotate ? 'active' : ''} aria-pressed={autoRotate} onClick={toggleAutoRotate}>自转</button>
            <button type="button" disabled={!ready} className={wireframe ? 'active' : ''} aria-pressed={wireframe} onClick={toggleWireframe}>线框</button>
            <button type="button" disabled={!ready} className={fullscreen ? 'active' : ''} aria-pressed={fullscreen} onClick={toggleFullscreen}>全屏</button>
          </div>
        </div>
      </div>

      <div className="tokamakCadFootnotes">
        <p><b>科学边界</b>本演示是 Paramak 生成的通用 Tokamak 参数化几何，用于验证网页交互与数字资产管线；它不是 EXL-50U、EHL-2 或其他在役装置的工程权威模型。</p>
        <p><b>开放来源</b>模型基于 MIT 许可的 <a href="https://github.com/fusion-energy/paramak/tree/0.9.11" target="_blank" rel="noreferrer">Paramak 0.9.11</a> 工作流生成；交互渲染采用 MIT 许可的 Three.js。<a href={STEP_URL} download>下载原始 STEP</a><a href={MODEL_URL} download>下载网页 GLB</a><a href="/models/paramak-tokamak-demo/model-manifest.json">查看模型清单</a><a href="/models/paramak-tokamak-demo/PARAMAK-LICENSE.txt">Paramak 许可</a><a href="/licenses/THREE-LICENSE.txt">Three.js 许可</a></p>
      </div>
    </section>
  );
}
