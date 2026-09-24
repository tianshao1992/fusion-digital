'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { FIELDLINE_COLORS, FIELDLINE_COPIES } from '../../components/efit/fieldlines';
import { useChartTheme } from '../../components/charts/chart-theme';
import { revolveContours } from '../flux-surface-geometry';
import { buildToraxQFieldLines } from '../simulation-fieldlines';
import type { SimulationFieldLineOverlay } from '../SimulationFieldLineOverlay';
import type { TransportResult } from './contracts';
import type { TransportGeometry } from './geometry';

type CameraPose = { position: [number, number, number]; target: [number, number, number] };

export default function TransportFieldLines({ result, geometry, geometrySha256, timeIndex, en }: {
  result: TransportResult; geometry: TransportGeometry | null; geometrySha256: string | null; timeIndex: number; en: boolean;
}) {
  const theme = useChartTheme();
  const [visible, setVisible] = useState(true);
  const [copies, setCopies] = useState<(typeof FIELDLINE_COPIES)[number]>(2);
  const [xray, setXray] = useState(true);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<SimulationFieldLineOverlay | null>(null);
  const occluder = useRef<THREE.Mesh | null>(null);
  const renderScene = useRef<(() => void) | null>(null);
  const resetCamera = useRef<(() => void) | null>(null);
  const pose = useRef<CameraPose | null>(null);
  const lineSet = useMemo(() => buildToraxQFieldLines(result, geometry, timeIndex), [result, geometry, timeIndex]);
  const lineSetAvailable = lineSet !== null;
  const view = useMemo(() => ({ identity: `${result.id}:${result.provenance.nativeSha256}:${timeIndex}`, lines: visible ? lineSet?.lines ?? [] : [], copies, xray }), [result.id, result.provenance.nativeSha256, timeIndex, visible, lineSet, copies, xray]);
  const currentView = useRef(view);
  useEffect(() => { currentView.current = view; layer.current?.setView(view); if (occluder.current) occluder.current.visible = !view.xray && view.lines.length > 0; renderScene.current?.(); }, [view]);

  const mesh = useMemo(() => {
    if (!geometry || geometry.kind !== 'shape-reconstruction') return null;
    // Keep the depth shell away from the five seeded paths to avoid coplanar flicker.
    const shell = geometry.rings.reduce((best, ring) => Math.abs(ring.rho - .65) < Math.abs(best.rho - .65) ? ring : best);
    try { return revolveContours([shell.points], 360, 64); }
    catch { return null; }
  }, [geometry]);

  useEffect(() => {
    const element = host.current;
    if (!element || !mesh || !geometry || !lineSetAvailable) return;
    let disposed = false;
    let cleanup = () => {};
    void Promise.all([import('three'), import('three/addons/controls/OrbitControls.js'), import('../SimulationFieldLineOverlay')]).then(([T, { OrbitControls }, { createSimulationFieldLineOverlay }]) => {
      if (disposed) return;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      const geometries: THREE.BufferGeometry[] = [];
      const materials: THREE.Material[] = [];
      let observer: ResizeObserver | null = null;
      let controls: InstanceType<typeof OrbitControls> | null = null;
      let onChange: (() => void) | null = null;
      let onContextLost: ((event: Event) => void) | null = null;
      cleanup = () => {
        observer?.disconnect();
        if (controls && onChange) controls.removeEventListener('change', onChange);
        controls?.dispose();
        if (onContextLost) renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        layer.current?.dispose(); layer.current = null; occluder.current = null; renderScene.current = null; resetCamera.current = null;
        geometries.forEach(item => item.dispose()); materials.forEach(item => item.dispose());
        renderer.dispose(); renderer.domElement.remove();
      };
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', en ? 'TORAX q-constrained 3D trajectory display, not a native magnetic-field integration' : 'TORAX q 约束三维轨迹示意，并非原生磁场积分');
      element.appendChild(renderer.domElement);
      const scene = new T.Scene();
      const outer = geometry.rings.at(-1)!.points;
      const radius = Math.max(...outer.map(point => point[0]), 0.1);
      const zMin = Math.min(...outer.map(point => point[1]));
      const zMax = Math.max(...outer.map(point => point[1]));
      const centerZ = (zMin + zMax) / 2;
      const camera = new T.PerspectiveCamera(38, 1, radius / 100, radius * 100);
      const orbit = new OrbitControls(camera, renderer.domElement);
      controls = orbit;
      orbit.enableDamping = false;
      orbit.minDistance = radius * 0.6;
      orbit.maxDistance = radius * 12;
      const home = () => { camera.position.set(radius * 2, centerZ + radius * 1.3, radius * 2.7); orbit.target.set(0, centerZ, 0); orbit.update(); };
      if (pose.current) { camera.position.fromArray(pose.current.position); orbit.target.fromArray(pose.current.target); orbit.update(); }
      else home();
      const render = () => {
        if (disposed || renderer.getContext().isContextLost()) return;
        pose.current = { position: camera.position.toArray(), target: orbit.target.toArray() };
        renderer.render(scene, camera);
      };
      onChange = render;
      orbit.addEventListener('change', render);
      renderScene.current = render;
      resetCamera.current = () => { home(); render(); };
      scene.add(new T.HemisphereLight(0xffffff, 0x536661, 2));
      const surfaceGeometry = new T.BufferGeometry(); geometries.push(surfaceGeometry);
      surfaceGeometry.setAttribute('position', new T.BufferAttribute(mesh.positions, 3));
      surfaceGeometry.setIndex(new T.BufferAttribute(mesh.indices, 1));
      surfaceGeometry.computeVertexNormals();
      const surfaceMaterial = new T.MeshStandardMaterial({ color: theme.mode === 'dark' ? '#86bdb2' : '#8baea4', transparent: true, opacity: 0.13, depthWrite: false, side: T.DoubleSide, roughness: 0.8 });
      materials.push(surfaceMaterial); scene.add(new T.Mesh(surfaceGeometry, surfaceMaterial));
      const depthOnly = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: T.DoubleSide });
      materials.push(depthOnly);
      const depthMesh = new T.Mesh(surfaceGeometry, depthOnly);
      depthMesh.renderOrder = 20;
      depthMesh.visible = !currentView.current.xray && currentView.current.lines.length > 0;
      occluder.current = depthMesh;
      scene.add(depthMesh);
      const sectionGeometry = new T.BufferGeometry().setFromPoints(outer.map(([r, z]) => new T.Vector3(r, z, 0))); geometries.push(sectionGeometry);
      const sectionMaterial = new T.LineBasicMaterial({ color: theme.muted, transparent: true, opacity: 0.45 }); materials.push(sectionMaterial);
      scene.add(new T.Line(sectionGeometry, sectionMaterial));
      layer.current = createSimulationFieldLineOverlay(scene, renderer);
      layer.current.setView(currentView.current);
      const lost = (event: Event) => { event.preventDefault(); setStatus('failed'); };
      onContextLost = lost;
      renderer.domElement.addEventListener('webglcontextlost', lost);
      const resize = () => {
        const { width, height } = element.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); layer.current?.resize(width, height); render();
      };
      observer = new ResizeObserver(resize); observer.observe(element); resize();
      setStatus('ready');
    }).catch(() => { cleanup(); if (!disposed) setStatus('failed'); });
    return () => { disposed = true; cleanup(); };
  }, [geometry, lineSetAvailable, mesh, theme.mode, theme.muted, en, attempt]);

  const t = (zh: string, english: string) => en ? english : zh;
  const explanation = geometry?.kind === 'input-equilibrium-grid'
    ? t('此输入网格未提供已审定闭合等值轮廓；暂不从碎片化等值线拼造磁力线。', 'This input grid has no reviewed closed contours; fragmented isolines are not promoted to field lines.')
    : t('缺少同一运行的已校验固定几何或当前时刻完整 q 剖面，轨迹显示不可用。', 'Verified fixed geometry or a complete same-run q profile is unavailable at this time.');
  return <section className="transportPanel transportLinePanel" aria-label={t('TORAX 三维磁力线走向示意', 'TORAX 3D field-line direction display')}>
    <div className="transportFieldHeading"><div><p className="transportEyebrow">3D / q-CONSTRAINED DISPLAY</p><h3>{t('三维磁力线走向示意', '3D field-line direction')}</h3></div><span className="transportTag">DERIVED DISPLAY · {geometry?.kind === 'shape-reconstruction' ? 'FIXED GEOMETRY' : 'UNAVAILABLE'}</span></div>
    {lineSet && mesh ? <div className="transportLineLayout"><div className="transportLineStage"><div ref={host} className="transportLineViewport" /><span className="transportLineQualifier">{t('q 约束示意 · 非 B 场积分', 'q-constrained display · not B-integrated')}</span>
      {status === 'loading' && <p className="transportLineStatus" role="status">{t('正在准备三维视图…', 'Preparing 3D view…')}</p>}
      {status === 'failed' && <div className="transportLineStatus" role="status"><p>{t('WebGL 暂不可用；二维云图与数值结果仍可使用。', 'WebGL unavailable; 2D fields and numeric results remain available.')}</p><button className="transportButton" onClick={() => { setStatus('loading'); setAttempt(v => v + 1); }}>{t('重试', 'Retry')}</button></div>}
      <div className="transportLineStageFoot"><span>{t('拖动旋转 · 滚轮缩放', 'Drag to orbit · scroll to zoom')}</span><button className="transportButton" disabled={status !== 'ready'} onClick={() => resetCamera.current?.()}>{t('复位视角', 'Reset view')}</button></div>
    </div><aside className="transportLineAside"><span className="transportEyebrow">t = {result.time.values[timeIndex]} s</span>
      <label><input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />{t('显示五色轨迹', 'Show five-color trajectories')}</label>
      <label>{t('环向播种副本', 'Toroidal seed copies')}<select disabled={!visible} value={copies} onChange={e => setCopies(Number(e.target.value) as (typeof FIELDLINE_COPIES)[number])}>{FIELDLINE_COPIES.map(count => <option key={count} value={count}>{count}×</option>)}</select></label>
      <label><input type="checkbox" checked={xray} onChange={e => setXray(e.target.checked)} />{t('透视磁面', 'X-ray through surface')}</label>
      <div className="transportLineLegend" aria-label={t('径向层与安全因子', 'Radial levels and safety factor')}>{lineSet.lines.map((line, index) => <span key={line.coordinateValue}><i style={{ backgroundColor: FIELDLINE_COLORS[index] }} />ρ {line.coordinateValue.toFixed(2)} · q {line.q.toFixed(2)}</span>)}</div>
    </aside></div> : <p className="transportLineUnavailable" role="status">{explanation}</p>}
    <p className="transportNote">{t('彩色轨迹仅将 TORAX 的 q(t,ρ) 总环绕数铺排在已校验的固定几何重建截面上；不是 B 矢量数值积分，也不是每时刻新求解的三维磁平衡。与 EXL-50U EFIT 轨迹使用相同五色与显示技术，但不共用装置数据。', 'Colored paths place TORAX q(t,ρ) winding on a verified fixed reconstructed section. They are not B-vector integrations or a newly solved 3D equilibrium at each time. The five-color display technology matches EXL-50U EFIT, but no device data is reused.')}</p>
    <code className="transportLineIdentity">{result.id} · native {result.provenance.nativeSha256.slice(0, 12)}{geometrySha256 ? ` · geometry ${geometrySha256.slice(0, 12)}` : ''}</code>
  </section>;
}
