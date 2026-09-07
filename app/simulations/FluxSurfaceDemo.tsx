'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type * as THREE from 'three';
import { useChartTheme } from '../components/charts/chart-theme';
import type { PhysicsData, RZ } from './physics';
import { revolveContours, type RevolvedSurface } from './flux-surface-geometry';
import './flux-surface-demo.css';

type CameraPose = { position: [number, number, number]; target: [number, number, number] };
type Props = { data: PhysicsData; en: boolean };

export default function FluxSurfaceDemo({ data, en }: Props) {
  const theme = useChartTheme();
  const levels = useMemo(() => [
    ...data.equilibrium.contours.filter(c => c.paths.length > 0).map(c => ({ value: c.psiNorm, paths: c.paths })),
    { value: 1, paths: [data.equilibrium.boundary] },
  ], [data]);
  const [level, setLevel] = useState(() => Math.max(0, levels.findIndex(c => c.value === 0.7)));
  const [degrees, setDegrees] = useState(270);
  const [frame, setFrame] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const host = useRef<HTMLDivElement>(null);
  const reset = useRef<(() => void) | null>(null);
  const pose = useRef<CameraPose | null>(null);
  const selection = levels[level] ?? levels[0];
  const model = useMemo(() => {
    try { return { surface: revolveContours(selection.paths, degrees), error: false }; }
    catch { return { surface: null, error: true }; }
  }, [selection, degrees]);
  const bounds = useMemo(() => {
    const points = [...data.equilibrium.boundary, ...selection.paths.flat()];
    let rMin = Infinity, rMax = -Infinity, zMin = Infinity, zMax = -Infinity;
    for (const [r, z] of points) { rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
    return { rMin, rMax, zMin, zMax };
  }, [data, selection]);

  useEffect(() => {
    const element = host.current;
    if (!element || !model.surface) return;
    const surface: RevolvedSurface = model.surface;
    let disposed = false;
    let cleanup = () => {};
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    void Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]).then(([T, { OrbitControls }]) => {
      if (disposed) return;
      setStatus('loading');
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      const resources: { observer?: ResizeObserver; controls?: InstanceType<typeof OrbitControls> } = {};
      const lost = (event: Event) => { event.preventDefault(); setStatus('failed'); };
      cleanup = () => {
        resources.observer?.disconnect();
        resources.controls?.dispose();
        renderer.domElement.removeEventListener('webglcontextlost', lost);
        geometries.forEach(g => g.dispose());
        materials.forEach(m => m.dispose());
        renderer.dispose();
        renderer.domElement.remove();
        reset.current = null;
      };
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', en ? 'Axisymmetric flux surface, derived from the exported R-Z contour' : '由导出 R-Z 轮廓旋转生成的轴对称磁通面');
      renderer.domElement.addEventListener('webglcontextlost', lost);
      element.appendChild(renderer.domElement);
      const scene = new T.Scene();
      const radius = Math.max(bounds.rMax, (bounds.zMax - bounds.zMin) / 2, 0.1);
      const centerZ = (bounds.zMin + bounds.zMax) / 2;
      const camera = new T.PerspectiveCamera(36, 1, radius / 100, radius * 100);
      const controls = new OrbitControls(camera, renderer.domElement);
      resources.controls = controls;
      controls.enableDamping = false;
      controls.minDistance = radius * 0.7;
      controls.maxDistance = radius * 12;
      controls.maxPolarAngle = Math.PI * 0.94;
      const home = () => {
        camera.position.set(radius * 2.7, centerZ + radius * 1.9, radius * 3.5);
        controls!.target.set(0, centerZ, 0);
        controls!.update();
      };
      if (pose.current) { camera.position.fromArray(pose.current.position); controls.target.fromArray(pose.current.target); controls.update(); }
      else home();
      const render = () => {
        if (disposed || renderer.getContext().isContextLost()) return;
        pose.current = { position: camera.position.toArray(), target: controls!.target.toArray() };
        renderer.render(scene, camera);
      };
      controls.addEventListener('change', render);
      reset.current = () => { home(); render(); };
      scene.add(new T.HemisphereLight(0xfff6e6, 0x657b80, 3));
      const key = new T.DirectionalLight(0xfff0dc, 4); key.position.set(radius * 3, radius * 5, radius * 4); scene.add(key);
      const rim = new T.DirectionalLight(0xb9e2ed, 3); rim.position.set(-radius * 3, radius, -radius * 3); scene.add(rim);
      const geometry = new T.BufferGeometry(); geometries.push(geometry);
      geometry.setAttribute('position', new T.BufferAttribute(surface.positions, 3));
      geometry.setIndex(new T.BufferAttribute(surface.indices, 1));
      geometry.computeVertexNormals();
      const material = new T.MeshStandardMaterial({ color: theme.mode === 'dark' ? '#83b6ad' : '#568d88', metalness: 0.22, roughness: 0.32, side: T.DoubleSide });
      materials.push(material); scene.add(new T.Mesh(geometry, material));
      const lineMaterial = new T.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.88 }); materials.push(lineMaterial);
      const referenceMaterial = new T.LineBasicMaterial({ color: theme.muted, transparent: true, opacity: 0.35 }); materials.push(referenceMaterial);
      const line = (path: RZ, angle: number, mat: THREE.LineBasicMaterial) => {
        const phi = angle * Math.PI / 180;
        const g = new T.BufferGeometry().setFromPoints(path.map(([r, z]) => new T.Vector3(r * Math.cos(phi), z, -r * Math.sin(phi))));
        geometries.push(g); scene.add(new T.Line(g, mat));
      };
      // Copper lines are section edges, not magnetic field lines.
      selection.paths.forEach(path => { line(path, 0, lineMaterial); if (degrees < 360) line(path, degrees, lineMaterial); });
      if (frame) for (let i = 0; i <= 12; i++) line(data.equilibrium.boundary, i / 12 * degrees, referenceMaterial);
      const resize = () => {
        const { width, height } = element.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); render();
      };
      const observer = new ResizeObserver(resize); resources.observer = observer; observer.observe(element); resize();
      setStatus('ready');
    }).catch(() => { cleanup(); if (!disposed) setStatus('failed'); });
    return () => { disposed = true; cleanup(); };
  }, [model, bounds, selection, degrees, frame, data, theme, en, attempt]);

  const path = (points: RZ) => points.map(([r, z], i) => `${i ? 'L' : 'M'}${r},${-z}`).join(' ');
  const span = Math.max(bounds.rMax - bounds.rMin, bounds.zMax - bounds.zMin, 0.1);
  const pad = span * 0.1;
  const failed = status === 'failed' || model.error;
  const style = { '--flux-accent': theme.accent, '--flux-line': theme.line } as CSSProperties;
  return <section className="fluxDemo" style={style} aria-label={en ? 'FUSE 3D result demo' : 'FUSE 三维结果演示'}>
    <header className="fluxHeader">
      <div><span className="fluxEyebrow">FUSE / SPATIAL RESULTS</span><h2>{en ? 'Inside the flux surface' : '走进磁通面'}</h2></div>
      <span className="fluxAuthority">SIMULATED / AXISYMMETRIC-DERIVED</span>
    </header>
    <div className="fluxLayout">
      <div className="fluxStage">
        <div ref={host} className="fluxViewport" />
        <div className="fluxCorner"><span>{en ? 'SELECTED SURFACE' : '当前磁通面'}</span><strong>ψ<sub>N</sub> = {selection.value.toFixed(2)}</strong><small>{en ? 'Metres · equal spatial scale' : '单位 m · 空间等比例'}</small></div>
        {status === 'loading' && !failed && <p className="fluxStatus" role="status">{en ? 'Preparing the 3D surface…' : '正在生成三维磁通面…'}</p>}
        {failed && <div className="fluxStatus" role="status"><p>{en ? '3D unavailable. The source section and 2D results remain available.' : '三维暂不可用，右侧截面和下方二维结果仍可查看。'}</p>{!model.error && <button type="button" onClick={() => setAttempt(n => n + 1)}>{en ? 'Retry WebGL' : '重试 WebGL'}</button>}</div>}
        <div className="fluxStageFooter"><span>{en ? 'Drag to orbit · scroll to zoom' : '拖动旋转 · 滚轮缩放'}</span><button type="button" disabled={status !== 'ready' || failed} onClick={() => reset.current?.()}>{en ? 'Reset view' : '复位视角'}</button></div>
      </div>
      <aside className="fluxInspector">
        <div className="fluxInspectorTitle"><span>R–Z</span><strong>{en ? 'Source section' : '对应源截面'}</strong></div>
        <svg className="fluxSection" viewBox={`${bounds.rMin - pad} ${-bounds.zMax - pad} ${bounds.rMax - bounds.rMin + 2 * pad} ${bounds.zMax - bounds.zMin + 2 * pad}`} role="img" aria-label={en ? 'Selected exported R-Z contour in metres; horizontal R, vertical Z' : '选定导出轮廓，横轴 R、纵轴 Z，单位米'}>
          <path d={path(data.equilibrium.boundary)} fill="none" stroke={theme.line} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
          {selection.paths.map((p, i) => <path key={i} d={path(p)} fill="none" stroke={theme.accent} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
          <circle cx={data.equilibrium.axis[0]} cy={-data.equilibrium.axis[1]} r={span * 0.012} fill={theme.text} />
        </svg>
        <p className="fluxAxisNote">R → / Z ↑ · m</p>
        <label className="fluxControl">{en ? 'Exported flux level' : '导出的磁通层级'}<select value={level} onChange={e => setLevel(Number(e.target.value))}>{levels.map((c, i) => <option key={i} value={i}>ψN = {c.value.toFixed(2)}{c.value === 1 ? ' / LCFS' : ''}</option>)}</select></label>
        <label className="fluxControl">{en ? 'Toroidal display span' : '环向展示角度'}<span className="fluxRange"><input aria-label={en ? 'Toroidal display angle' : '环向展示角度'} type="range" min="90" max="360" step="15" value={degrees} onChange={e => setDegrees(Number(e.target.value))} /><output>{degrees}°</output></span></label>
        <label className="fluxCheck"><input type="checkbox" checked={frame} onChange={e => setFrame(e.target.checked)} />{en ? 'LCFS section guides' : 'LCFS 截面参考线'}</label>
        <dl className="fluxStats"><div><dt>{en ? 'Display triangles' : '展示三角形'}</dt><dd>{model.surface?.triangles.toLocaleString('en-US') ?? '—'}</dd></div><div><dt>{en ? 'Source points' : '源轮廓点'}</dt><dd>{model.surface?.sourcePoints ?? '—'}</dd></div></dl>
      </aside>
    </div>
    <footer className="fluxEvidence"><p>{en ? 'Uniform surface colour is illustrative, not Te / Ti / density or stress. Section guides are not magnetic field lines. Cut edges are uncapped display cuts, not physical boundaries.' : '曲面统一颜色仅用于形态展示，不代表温度、密度或应力；参考线不是磁力线。剖开边缘不封盖，仅为展示切口，并非物理边界。'}</p><p>{data.equilibriumOrigin === 'model-solved' ? (en ? 'Model-solved equilibrium' : '模型求解平衡') : data.equilibriumOrigin === 'input-reconstruction' ? (en ? 'Input reconstruction, not a newly solved equilibrium' : '输入重建平衡，并非本次新求解') : (en ? 'Exported equilibrium; solve origin unspecified' : '导出平衡，未声明求解来源')}{en ? ' · 2D contours revolved axisymmetrically; not 3D CAD or a non-axisymmetric solution.' : ' · 二维轮廓按轴对称假设旋转，不是三维 CAD 或非轴对称求解结果。'}</p><code>{data.runId}</code></footer>
  </section>;
}
