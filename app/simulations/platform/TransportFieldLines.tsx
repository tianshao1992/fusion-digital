'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type * as THREE from 'three';
import { FIELDLINE_COLORS, FIELDLINE_COPIES } from '../../components/efit/fieldlines';
import { PSI_N_COLORS } from '../../components/efit/psi-n-palette';
import { useChartTheme } from '../../components/charts/chart-theme';
import { revolveContours, type RevolvedSurface } from '../flux-surface-geometry';
import { buildToraxQFieldLines } from '../simulation-fieldlines';
import { SURFACE_SCENE_STYLE } from '../surface-scene-style';
import type { SimulationFieldLineOverlay } from '../SimulationFieldLineOverlay';
import type { TransportResult } from './contracts';
import { label, number } from './display';
import { crossSectionCells, type TransportGeometry } from './geometry';
import { selectableTransportRings, transportCutPlane, transportSurfaceValue, type TransportColorScale, type TransportCutPlane } from './surface-display';
import '../flux-surface-demo.css';

type CameraPose = { position: [number, number, number]; target: [number, number, number] };
type Props = {
  result: TransportResult; geometry: TransportGeometry | null; geometrySha256: string | null;
  timeIndex: number; field: string; onFieldChange: (field: string) => void; colorScale: TransportColorScale; scaleAcrossTime: boolean;
  twoDMode: 'section' | 'time'; en: boolean;
};
const PROFILE_FIELDS = ['te', 'ti', 'ne', 'pressure', 'j_total', 'chi_e', 'chi_i'];

export default function TransportFieldLines({ result, geometry, geometrySha256, timeIndex, field, onFieldChange, colorScale, scaleAcrossTime, twoDMode, en }: Props) {
  const theme = useChartTheme();
  const t = (zh: string, english: string) => en ? english : zh;
  const [rho, setRho] = useState(.7);
  const [degrees, setDegrees] = useState(270);
  const [frame, setFrame] = useState(true);
  const [slice, setSlice] = useState(true);
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
  const updateField = useRef<((value: number | null, plane: TransportCutPlane | null, scale: TransportColorScale, showSlice: boolean) => void) | null>(null);
  const updateGeometry = useRef<((surface: RevolvedSurface, ring: TransportGeometry['rings'][number], sweep: number, showFrame: boolean) => void) | null>(null);
  const pose = useRef<CameraPose | null>(null);
  const rings = useMemo(() => selectableTransportRings(geometry, result), [geometry, result]);
  const selected = rings.reduce<(typeof rings)[number] | null>((best, ring) =>
    !best || Math.abs(ring.rho - rho) < Math.abs(best.rho - rho) ? ring : best, null);
  const model = useMemo(() => {
    if (!selected) return null;
    try { return revolveContours([selected.points], degrees); }
    catch { return null; }
  }, [selected, degrees]);
  const modelAvailable = model !== null;
  const cells = useMemo(() => {
    if (!rings.length || !geometry || !result.profiles.some(profile => profile.id === field)) return [];
    try { return crossSectionCells(geometry, result, field, timeIndex); }
    catch { return []; }
  }, [rings, geometry, result, field, timeIndex]);
  const cutPlane = useMemo(() => {
    if (!cells.length) return null;
    try { return transportCutPlane(cells); }
    catch { return null; }
  }, [cells]);
  const fieldValue = selected ? transportSurfaceValue(result, field, timeIndex, selected.rho) : null;
  const lineSet = useMemo(() => buildToraxQFieldLines(result, geometry, timeIndex), [result, geometry, timeIndex]);
  const view = useMemo(() => ({
    identity: result.id + ':' + result.provenance.nativeSha256 + ':' + timeIndex,
    lines: visible ? lineSet?.lines ?? [] : [], copies, xray,
  }), [result.id, result.provenance.nativeSha256, timeIndex, visible, lineSet, copies, xray]);
  const currentView = useRef(view);
  useEffect(() => {
    currentView.current = view;
    layer.current?.setView(view);
    if (occluder.current) occluder.current.visible = !view.xray && view.lines.length > 0;
    renderScene.current?.();
  }, [view]);
  const bounds = useMemo(() => {
    const points = geometry?.boundary ?? [];
    const r = points.map(point => point[0]), z = points.map(point => point[1]);
    return points.length
      ? { rMin: Math.min(...r), rMax: Math.max(...r), zMin: Math.min(...z), zMax: Math.max(...z) }
      : { rMin: 0, rMax: 1, zMin: -1, zMax: 1 };
  }, [geometry]);
  const span = Math.max(bounds.rMax - bounds.rMin, bounds.zMax - bounds.zMin, .1);
  const pad = span * .1;
  const palette = PSI_N_COLORS;
  const fraction = fieldValue === null ? .5 : Math.max(0, Math.min(1,
    (fieldValue * colorScale.scale - colorScale.minimum) / (colorScale.maximum - colorScale.minimum)));
  const selectedColor = palette[Math.round(fraction * (palette.length - 1))];
  const style = { '--flux-accent': theme.accent, '--flux-line': theme.line, '--flux-field': selectedColor } as CSSProperties;
  const latestField = useRef({ value: fieldValue, plane: cutPlane, scale: colorScale, showSlice: slice });
  useEffect(() => {
    latestField.current = { value: fieldValue, plane: cutPlane, scale: colorScale, showSlice: slice };
  }, [fieldValue, cutPlane, colorScale, slice]);
  const latestGeometry = useRef({ model, selected, degrees, frame });
  useEffect(() => {
    latestGeometry.current = { model, selected, degrees, frame };
    if (model && selected) updateGeometry.current?.(model, selected, degrees, frame);
  }, [model, selected, degrees, frame]);

  useEffect(() => {
    const element = host.current;
    if (!element || !modelAvailable || !geometry) return;
    let disposed = false;
    let cleanup = () => {};
    void Promise.all([import('three'), import('three/addons/controls/OrbitControls.js'), import('../SimulationFieldLineOverlay')]).then(([T, { OrbitControls }, { createSimulationFieldLineOverlay }]) => {
      if (disposed) return;
      setStatus('loading');
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      const materials: THREE.Material[] = [];
      const resources: { observer?: ResizeObserver; controls?: InstanceType<typeof OrbitControls> } = {};
      const lost = (event: Event) => { event.preventDefault(); setStatus('failed'); };
      let surfaceMaterial: THREE.Material | null = null;
      let planeMesh: THREE.Mesh | null = null;
      let planeGeometry: THREE.BufferGeometry | null = null;
      let planeMaterial: THREE.Material | null = null;
      let applyField: typeof updateField.current = null;
      let safeApplyField: typeof updateField.current = null;
      let safeApplyGeometry: typeof updateGeometry.current = null;
      let surfaceGeometry: THREE.BufferGeometry = new T.BufferGeometry();
      let guideGeometries: THREE.BufferGeometry[] = [];
      let guideLines: THREE.Line[] = [];
      cleanup = () => {
        resources.observer?.disconnect(); resources.controls?.dispose();
        renderer.domElement.removeEventListener('webglcontextlost', lost);
        if (updateField.current === safeApplyField) updateField.current = null;
        if (updateGeometry.current === safeApplyGeometry) updateGeometry.current = null;
        layer.current?.dispose(); layer.current = null;
        occluder.current = null; renderScene.current = null; resetCamera.current = null;
        surfaceMaterial?.dispose(); planeGeometry?.dispose(); planeMaterial?.dispose();
        surfaceGeometry.dispose(); guideGeometries.forEach(item => item.dispose());
        materials.forEach(item => item.dispose());
        renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
      };
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = SURFACE_SCENE_STYLE.exposure;
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.setAttribute('aria-label', en
        ? 'TORAX fixed reconstructed rho surface with profile-mapped cut plane; not a solved magnetic equilibrium'
        : 'TORAX 固定重建 ρ 磁面与剖面映射云图；并非新求解磁平衡');
      renderer.domElement.addEventListener('webglcontextlost', lost);
      element.appendChild(renderer.domElement);
      const scene = new T.Scene();
      const radius = Math.max(bounds.rMax, (bounds.zMax - bounds.zMin) / 2, .1);
      const centerZ = (bounds.zMin + bounds.zMax) / 2;
      const camera = new T.PerspectiveCamera(SURFACE_SCENE_STYLE.fov, 1, radius / 100, radius * 100);
      const orbit = new OrbitControls(camera, renderer.domElement); resources.controls = orbit;
      orbit.enableDamping = false;
      orbit.minDistance = radius * SURFACE_SCENE_STYLE.minDistance;
      orbit.maxDistance = radius * SURFACE_SCENE_STYLE.maxDistance;
      orbit.maxPolarAngle = SURFACE_SCENE_STYLE.maxPolarAngle;
      const home = () => {
        camera.position.set(radius * SURFACE_SCENE_STYLE.home[0], centerZ + radius * SURFACE_SCENE_STYLE.home[1], radius * SURFACE_SCENE_STYLE.home[2]);
        orbit.target.set(0, centerZ, 0); orbit.update();
      };
      if (pose.current) { camera.position.fromArray(pose.current.position); orbit.target.fromArray(pose.current.target); orbit.update(); }
      else home();
      const render = () => {
        if (disposed || renderer.getContext().isContextLost()) return;
        pose.current = { position: camera.position.toArray(), target: orbit.target.toArray() };
        renderer.render(scene, camera);
      };
      renderScene.current = render;
      orbit.addEventListener('change', render);
      resetCamera.current = () => { home(); render(); };
      scene.add(new T.HemisphereLight(0xfff6e6, 0x657b80, 3));
      const key = new T.DirectionalLight(0xfff0dc, 4); key.position.set(radius * 3, radius * 5, radius * 4); scene.add(key);
      const rim = new T.DirectionalLight(0xb9e2ed, 3); rim.position.set(-radius * 3, radius, -radius * 3); scene.add(rim);
      const colorAt = (value: number, scale: TransportColorScale) => {
        const normalized = Math.max(0, Math.min(1, (value - scale.minimum) / (scale.maximum - scale.minimum)));
        const position = normalized * (palette.length - 1);
        const lower = Math.floor(position), upper = Math.min(palette.length - 1, lower + 1);
        return new T.Color(palette[lower]).lerp(new T.Color(palette[upper]), position - lower);
      };
      surfaceMaterial = new T.MeshStandardMaterial({ color: theme.mode === 'dark' ? '#83b6ad' : '#568d88', metalness: .22, roughness: .32, side: T.DoubleSide });
      const surfaceMesh = new T.Mesh(surfaceGeometry, surfaceMaterial); scene.add(surfaceMesh);
      const depthOnly = new T.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: T.DoubleSide }); materials.push(depthOnly);
      const depthMesh = new T.Mesh(surfaceGeometry, depthOnly);
      depthMesh.renderOrder = 20;
      depthMesh.visible = !currentView.current.xray && currentView.current.lines.length > 0;
      occluder.current = depthMesh; scene.add(depthMesh);
      applyField = (value, plane, scale, showSlice) => {
        if (disposed) return;
        const nextSurfaceMaterial = value === null
          ? new T.MeshStandardMaterial({ color: theme.mode === 'dark' ? '#83b6ad' : '#568d88', metalness: .22, roughness: .32, side: T.DoubleSide })
          : new T.MeshBasicMaterial({ color: colorAt(value * scale.scale, scale), transparent: showSlice, opacity: showSlice ? .46 : .9, depthWrite: !showSlice, side: T.DoubleSide, toneMapped: false });
        surfaceMesh.material = nextSurfaceMaterial;
        surfaceMaterial?.dispose(); surfaceMaterial = nextSurfaceMaterial;
        if (planeMesh) scene.remove(planeMesh);
        planeGeometry?.dispose(); planeMaterial?.dispose();
        planeMesh = null; planeGeometry = null; planeMaterial = null;
        if (showSlice && plane) {
          planeGeometry = new T.BufferGeometry();
          planeGeometry.setAttribute('position', new T.BufferAttribute(plane.positions, 3));
          planeGeometry.setIndex(new T.BufferAttribute(plane.indices, 1));
          const colors = new Float32Array(plane.values.length * 3);
          for (let i = 0; i < plane.values.length; i++) colorAt(plane.values[i] * scale.scale, scale).toArray(colors, i * 3);
          planeGeometry.setAttribute('color', new T.BufferAttribute(colors, 3));
          planeMaterial = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, toneMapped: false });
          planeMesh = new T.Mesh(planeGeometry, planeMaterial); planeMesh.renderOrder = 4; scene.add(planeMesh);
        }
        render();
      };
      safeApplyField = (value, plane, scale, showSlice) => {
        try { applyField?.(value, plane, scale, showSlice); }
        catch { setStatus('failed'); }
      };
      const selectedMaterial = new T.LineBasicMaterial({ color: theme.accent, transparent: true, opacity: .88 });
      const guideMaterial = new T.LineBasicMaterial({ color: theme.muted, transparent: true, opacity: .35 });
      materials.push(selectedMaterial, guideMaterial);
      const sectionLine = (path: [number, number][], angle: number, material: THREE.LineBasicMaterial) => {
        const phi = angle * Math.PI / 180;
        const points = path.map(([r, z]) => new T.Vector3(r * Math.cos(phi), z, -r * Math.sin(phi)));
        const lineGeometry = new T.BufferGeometry().setFromPoints(points);
        const line = new T.Line(lineGeometry, material);
        guideGeometries.push(lineGeometry); guideLines.push(line); scene.add(line);
      };
      let shownSurface: RevolvedSurface | null = null;
      let shownRing: TransportGeometry['rings'][number] | null = null;
      let shownSweep = NaN, shownFrame = false;
      const applyGeometry = (surface: RevolvedSurface, ring: TransportGeometry['rings'][number], sweep: number, showFrame: boolean) => {
        if (disposed) return;
        if (shownSurface !== surface) {
          const next = new T.BufferGeometry();
          next.setAttribute('position', new T.BufferAttribute(surface.positions, 3));
          next.setIndex(new T.BufferAttribute(surface.indices, 1));
          next.computeVertexNormals();
          surfaceMesh.geometry = next; depthMesh.geometry = next;
          surfaceGeometry.dispose(); surfaceGeometry = next;
          shownSurface = surface;
        }
        if (shownRing !== ring || shownSweep !== sweep || shownFrame !== showFrame) {
          guideLines.forEach(line => scene.remove(line));
          guideGeometries.forEach(item => item.dispose());
          guideLines = []; guideGeometries = [];
          sectionLine(ring.points, 0, selectedMaterial);
          if (sweep < 360) sectionLine(ring.points, sweep, selectedMaterial);
          if (showFrame) for (let i = 0; i <= 12; i++) sectionLine(geometry.boundary, i / 12 * sweep, guideMaterial);
          shownRing = ring; shownSweep = sweep; shownFrame = showFrame;
        }
        render();
      };
      safeApplyGeometry = (surface, ring, sweep, showFrame) => {
        try { applyGeometry(surface, ring, sweep, showFrame); }
        catch { setStatus('failed'); }
      };
      layer.current = createSimulationFieldLineOverlay(scene, renderer);
      layer.current.setView(currentView.current);
      const initial = latestGeometry.current;
      if (!initial.model || !initial.selected) throw new Error('TRANSPORT_SURFACE_UNAVAILABLE');
      applyGeometry(initial.model, initial.selected, initial.degrees, initial.frame);
      updateGeometry.current = safeApplyGeometry;
      applyField(latestField.current.value, latestField.current.plane, latestField.current.scale, latestField.current.showSlice);
      updateField.current = safeApplyField;
      const resize = () => {
        const { width, height } = element.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
        layer.current?.resize(width, height); render();
      };
      const observer = new ResizeObserver(resize); resources.observer = observer; observer.observe(element); resize();
      setStatus('ready');
    }).catch(() => { cleanup(); if (!disposed) setStatus('failed'); });
    return () => { disposed = true; cleanup(); };
  }, [modelAvailable, geometry, bounds, palette, theme, en, attempt]);
  useEffect(() => {
    updateField.current?.(fieldValue, cutPlane, colorScale, slice);
  }, [fieldValue, cutPlane, colorScale, slice]);

  const path = (points: [number, number][]) => points.map(([r, z], index) => (index ? 'L' : 'M') + r + ',' + -z).join(' ');
  const unavailable = geometry?.kind === 'input-equilibrium-grid'
    ? t('输入 ψ 网格暂无审定闭合轮廓；二维云图可用，但不从碎片等值线拼造三维磁面。', 'The input ψ grid has no reviewed closed contours. 2-D fields remain available; 3-D surfaces are not fabricated from fragmented isolines.')
    : geometry
      ? t('同一运行的固定重建几何未形成合格闭合 ρ 轮廓；原生时间—径向结果仍可查看。', 'Same-run reconstructed geometry has no qualified closed ρ contour; native time–radius results remain available.')
      : t('同一运行的几何尚不可用；原生时间—径向结果仍可查看。', 'Same-run geometry is unavailable; native time–radius results remain available.');
  return <section className="fluxDemo transportSurfaceDemo" style={style} aria-label={t('TORAX 轴对称三维场结果', 'TORAX axisymmetric 3D field result')}>
    <header className="fluxHeader">
      <div><span className="fluxEyebrow">TORAX / SPATIAL FIELD RESULTS</span><h2>{t('轴对称三维场云图', 'Axisymmetric 3D field')}</h2></div>
      <span className="fluxAuthority">{model ? 'DERIVED DISPLAY / FIXED SHAPE / COCOS UNSET' : geometry?.kind === 'input-equilibrium-grid' ? 'INPUT GRID / 3D UNAVAILABLE' : 'GEOMETRY UNAVAILABLE'}</span>
    </header>
    <div className="fluxLayout">
      <div className="fluxStage">
        {model && <div ref={host} className="fluxViewport" />}
        {model && <div className="fluxCorner"><span>{label(field, en).toUpperCase()}</span>
          <strong>{fieldValue === null ? '—' : number(fieldValue * colorScale.scale) + ' ' + colorScale.unit}</strong>
          <small>ρ<sub>tor,N</sub> = {selected?.rho.toFixed(2)} · {t('当前重建磁面', 'selected reconstructed surface')}</small>
          {visible && lineSet && <small className="fluxLineQualifier">{t('q 约束示意 · 非 B 场积分', 'q-constrained display · not B-integrated')}</small>}
        </div>}
        {model && cells.length > 0 && <div className="fluxColorbar" aria-label={label(field, en) + ' ' + colorScale.minimum + ' to ' + colorScale.maximum + ' ' + colorScale.unit}>
          <span>{number(colorScale.maximum)}</span><i style={{ backgroundImage: 'linear-gradient(to top, ' + [...palette].join(',') + ')' }} /><span>{number(colorScale.minimum)}</span><small>{colorScale.unit}</small>
        </div>}
        {!model && <div className="fluxStatus" role="status">{unavailable}</div>}
        {model && status === 'loading' && <p className="fluxStatus" role="status">{t('正在生成三维磁面…', 'Preparing the 3D surface…')}</p>}
        {model && status === 'failed' && <div className="fluxStatus" role="status"><p>{t('三维暂不可用，二维云图与数值结果仍可查看。', '3D unavailable; 2-D fields and numeric results remain available.')}</p><button type="button" onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }}>{t('重试 WebGL', 'Retry WebGL')}</button></div>}
        <div className="fluxStageFooter"><span>{t('拖动旋转 · 滚轮缩放', 'Drag to orbit · scroll to zoom')}</span><button type="button" disabled={!model || status !== 'ready'} onClick={() => resetCamera.current?.()}>{t('复位视角', 'Reset view')}</button></div>
      </div>
      <aside className="fluxInspector">
        <div className="fluxInspectorTitle"><span>R–Z</span><strong>{t('对应源截面', 'Source section')}</strong></div>
        {geometry && <svg className="fluxSection" viewBox={[bounds.rMin - pad, -bounds.zMax - pad, bounds.rMax - bounds.rMin + 2 * pad, bounds.zMax - bounds.zMin + 2 * pad].join(' ')} role="img" aria-label={geometry.kind === 'input-equilibrium-grid' ? t('输入 R-Z 边界，横轴 R、纵轴 Z，单位米', 'Input R-Z boundary in metres; horizontal R, vertical Z') : t('重建 R-Z 截面，横轴 R、纵轴 Z，单位米', 'Reconstructed R-Z section in metres; horizontal R, vertical Z')}>
          <path d={path(geometry.boundary)} fill="none" stroke={theme.line} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
          {selected && <path d={path(selected.points)} fill="none" stroke={selectedColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
          <circle cx={geometry.axis[0]} cy={-geometry.axis[1]} r={span * .012} fill={theme.text} />
        </svg>}
        {!geometry && <p className="fluxUnavailable">{t('几何未导入', 'Geometry not imported')}</p>}
        <p className="fluxAxisNote">R → / Z ↑ · m</p>
        <label className="fluxControl">{t('场变量 · 与二维联动', 'Field variable · linked with 2D')}
          <select value={field} onChange={event => onFieldChange(event.currentTarget.value)}>
            {PROFILE_FIELDS.filter(id => result.profiles.some(profile => profile.id === id)).map(id => <option key={id} value={id}>{label(id, en)}</option>)}
            {field.startsWith('input_') && <option value={field}>{label(field, en)}</option>}
          </select>
        </label>
        <label className="fluxControl">{t('重建径向层级', 'Reconstructed radial level')}
          <select value={selected?.rho ?? ''} disabled={!rings.length} onChange={event => setRho(Number(event.currentTarget.value))}>
            {rings.map(ring => <option key={ring.rho} value={ring.rho}>ρtor,N = {ring.rho.toFixed(2)}{ring.rho === 1 ? ' / ' + t('重建边界', 'reconstructed edge') : ''}</option>)}
          </select>
        </label>
        <label className="fluxControl">{t('环向展示角度', 'Toroidal display span')}<span className="fluxRange"><input aria-label={t('环向展示角度', 'Toroidal display angle')} type="range" min="90" max="360" step="15" value={degrees} disabled={!model} onChange={event => setDegrees(Number(event.currentTarget.value))} /><output>{degrees}°</output></span></label>
        <label className="fluxCheck"><input type="checkbox" checked={slice} disabled={!cutPlane || !model} onChange={event => setSlice(event.target.checked)} />{t('R–Z 场云图剖切面', 'R–Z field-cloud cut plane')}</label>
        <label className="fluxCheck"><input type="checkbox" checked={frame} disabled={!model} onChange={event => setFrame(event.target.checked)} />{t('边界截面参考线', 'Boundary section guides')}</label>
        <div className="fluxFieldLineControls"><span className="fluxEyebrow">{t('磁力线走向 / q 约束示意', 'FIELD-LINE DIRECTION / q-CONSTRAINED')}</span>
          <label className="fluxCheck"><input type="checkbox" checked={visible} disabled={!lineSet || !model} onChange={event => setVisible(event.target.checked)} />{t('显示五色轨迹', 'Show five-color trajectories')}</label>
          <label className="fluxControl">{t('环向播种副本', 'Toroidal seed copies')}<select value={copies} disabled={!lineSet || !visible || !model} onChange={event => setCopies(Number(event.target.value) as (typeof FIELDLINE_COPIES)[number])}>{FIELDLINE_COPIES.map(count => <option key={count} value={count}>{count}×</option>)}</select></label>
          <label className="fluxCheck"><input type="checkbox" checked={xray} disabled={!lineSet || !visible || !model} onChange={event => setXray(event.target.checked)} />{t('透视磁面', 'X-ray through surface')}</label>
          {lineSet && model ? <div className="fluxFieldLineLegend" aria-label={t('q 约束轨迹层级', 'q-constrained trajectory levels')}>{lineSet.lines.map((line, index) => <span key={line.coordinateValue}><i style={{ backgroundColor: FIELDLINE_COLORS[index] }} />ρ {line.coordinateValue.toFixed(2)} · q {line.q.toFixed(2)}</span>)}</div>
            : <p className="fluxUnavailable">{model ? t('当前时刻缺少完整 q 剖面，轨迹不可用；磁面仍可单独查看。', 'Complete q profile unavailable at this time; the surface remains independently viewable.') : t('此算例没有可用的三维闭合磁面，轨迹不显示。', 'This case has no qualified closed 3-D surface, so trajectories are hidden.')}</p>}
        </div>
        <p className="fluxAxisNote">{model ? t('二维与三维同场量、同色标；固定几何不随时间变化', '2-D and 3-D share field and scale; fixed geometry does not evolve with time') : geometry?.kind === 'input-equilibrium-grid' ? t('输入 R–Z 二维云图可用；三维资格独立核验', 'Input R–Z 2-D fields remain available; 3-D eligibility is checked separately') : t('原生时间—径向结果可用；三维资格独立核验', 'Native time–radius results remain available; 3-D eligibility is checked separately')}</p>
        <dl className="fluxStats"><div><dt>{t('磁面三角形', 'Surface triangles')}</dt><dd>{model?.triangles.toLocaleString('en-US') ?? '—'}</dd></div><div><dt>{t('云图源单元', 'Source cloud cells')}</dt><dd>{cutPlane?.cells.toLocaleString('en-US') ?? '—'}</dd></div><div><dt>{t('源轮廓点', 'Source points')}</dt><dd>{model?.sourcePoints ?? '—'}</dd></div></dl>
      </aside>
    </div>
    <footer className="fluxEvidence"><p>{model ? <>{t('TORAX 原生结果是时间—径向剖面；三维磁面由已校验的固定参数化 R–Z 截面旋转而来。', 'TORAX natively solves time–radius profiles. The 3-D surface revolves a verified fixed parametric R–Z section.')} {twoDMode === 'section' ? t('三维剖切云图与当前二维 R–Z 视图共用源单元、场量、单位和色标。', 'The 3-D cut plane and current 2-D R–Z view share source cells, variable, unit and scale.') : t('当前二维视图为原生时间—径向样本；三维 R–Z 剖切与其共用场量、单位和色标，但不是同一批二维单元。', 'The current 2-D view shows native time–radius samples. The 3-D R–Z cut plane shares the variable, unit and scale, but not the same 2-D cells.')} {t('假设磁面内场量恒定，并非独立二维或三维输运求解。', 'Values are assumed constant on each surface; this is not an independent 2-D or 3-D transport solve.')}</> : geometry?.kind === 'input-equilibrium-grid' ? t('此输入网格仅支持二维 R–Z 场；未审定闭合等值轮廓前不会生成三维磁面或轨迹。', 'This input grid supports 2-D R–Z fields only. No 3-D surface or trajectory is generated without reviewed closed contours.') : t('当前没有合格的同运行重建几何，不能生成三维磁面或轨迹；原生时间—径向结果仍可查看。', 'Qualified same-run reconstructed geometry is unavailable, so no 3-D surface or trajectory is generated; native time–radius results remain available.')} {t('彩色轨迹仅为 q 约束几何示意，非 B 矢量积分；截面参考线不是磁力线。', 'Colored paths are q-constrained geometric displays, not B-vector integrations; section guides are not field lines.')}</p>
      <p>{t('径向坐标为 ρtor,N，不是 FUSE 的 ψN；几何固定，COCOS 未声明。两引擎相同色板不代表相同数值或同一装置数据。', 'The radial coordinate is ρtor,N, not FUSE ψN. Geometry is fixed and COCOS is unset. Matching palettes do not imply equal values or shared device data.')} t = {number(result.time.values[timeIndex])} s · {scaleAcrossTime ? t('全时段统一色标', 'all-time color scale') : t('当前时刻色标', 'current-time color scale')}</p>
      <code>{result.id} · native {result.provenance.nativeSha256.slice(0, 12)}{geometrySha256 ? ' · geometry ' + geometrySha256.slice(0, 12) : ''}</code>
    </footer>
  </section>;
}
