'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type * as THREE from 'three';
import { useChartTheme } from '../components/charts/chart-theme';
import { PSI_N_COLORS } from '../components/efit/psi-n-palette';
import type { PhysicsData, RZ } from './physics';
import type { FluxCoordinateMap } from './flux-coordinate-map';
import { buildEquilibriumFieldProjection, sampleSpatialFieldAtPsiNorm, spatialFieldSpec, spatialFieldUnavailableReason, SPATIAL_FIELD_SPECS, type SpatialFieldChannel } from './equilibrium-field';
import { buildPoloidalFieldSlice, revolveContours, type RevolvedSurface } from './flux-surface-geometry';
import './flux-surface-demo.css';

type CameraPose = { position: [number, number, number]; target: [number, number, number] };
type Props = { data: PhysicsData; coordinateMap?: FluxCoordinateMap; field: SpatialFieldChannel; onFieldChange: (field: SpatialFieldChannel) => void; en: boolean };

export default function FluxSurfaceDemo({ data, coordinateMap, field, onFieldChange, en }: Props) {
  const theme = useChartTheme();
  const levels = useMemo(() => [
    ...data.equilibrium.contours.filter(c => c.paths.length > 0).map(c => ({ value: c.psiNorm, paths: c.paths })),
    { value: 1, paths: [data.equilibrium.boundary] },
  ], [data]);
  const [level, setLevel] = useState(() => Math.max(0, levels.findIndex(c => c.value === 0.7)));
  const [degrees, setDegrees] = useState(270);
  const [frame, setFrame] = useState(true);
  const [slice, setSlice] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const host = useRef<HTMLDivElement>(null);
  const reset = useRef<(() => void) | null>(null);
  const pose = useRef<CameraPose | null>(null);
  const selection = levels[level] ?? levels[0];
  const fieldSpec = spatialFieldSpec(field);
  const fieldProjection = useMemo(() => {
    if (spatialFieldUnavailableReason(data, field, coordinateMap)) return null;
    try { return buildEquilibriumFieldProjection(data, field, coordinateMap); }
    catch { return null; }
  }, [coordinateMap, data, field]);
  const selectedField = useMemo(() => sampleSpatialFieldAtPsiNorm(data, field, selection.value, coordinateMap), [coordinateMap, data, field, selection.value]);
  const fieldSlice = useMemo(() => fieldProjection && slice ? buildPoloidalFieldSlice(fieldProjection.samples) : null, [fieldProjection, slice]);
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
      const palette = fieldProjection?.reversePalette ? [...PSI_N_COLORS].reverse() : [...PSI_N_COLORS];
      const colorAt = (value: number) => {
        if (!fieldProjection) return new T.Color(theme.mode === 'dark' ? '#83b6ad' : '#568d88');
        const span = fieldProjection.maximum - fieldProjection.minimum;
        const normalized = span > 0 ? Math.max(0, Math.min(1, (value - fieldProjection.minimum) / span)) : 0.5;
        const position = normalized * (palette.length - 1);
        const lower = Math.floor(position); const upper = Math.min(palette.length - 1, lower + 1);
        return new T.Color(palette[lower]).lerp(new T.Color(palette[upper]), position - lower);
      };
      const geometry = new T.BufferGeometry(); geometries.push(geometry);
      geometry.setAttribute('position', new T.BufferAttribute(surface.positions, 3));
      geometry.setIndex(new T.BufferAttribute(surface.indices, 1));
      geometry.computeVertexNormals();
      const material = selectedField
        ? new T.MeshBasicMaterial({ color: colorAt(selectedField.value), transparent: slice, opacity: slice ? 0.46 : 0.9, depthWrite: !slice, side: T.DoubleSide, toneMapped: false })
        : new T.MeshStandardMaterial({ color: theme.mode === 'dark' ? '#83b6ad' : '#568d88', metalness: 0.22, roughness: 0.32, side: T.DoubleSide });
      materials.push(material); scene.add(new T.Mesh(geometry, material));
      if (fieldSlice && fieldProjection) {
        const sliceGeometry = new T.BufferGeometry(); geometries.push(sliceGeometry);
        sliceGeometry.setAttribute('position', new T.BufferAttribute(fieldSlice.positions, 3));
        sliceGeometry.setIndex(new T.BufferAttribute(fieldSlice.indices, 1));
        const colors = new Float32Array(fieldSlice.values.length * 3);
        fieldSlice.values.forEach((value, index) => colorAt(value).toArray(colors, index * 3));
        sliceGeometry.setAttribute('color', new T.BufferAttribute(colors, 3));
        const sliceMaterial = new T.MeshBasicMaterial({ vertexColors: true, transparent: false, side: T.DoubleSide, toneMapped: false });
        materials.push(sliceMaterial);
        const sliceMesh = new T.Mesh(sliceGeometry, sliceMaterial); sliceMesh.renderOrder = 4; scene.add(sliceMesh);
      }
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
  }, [model, bounds, selection, degrees, frame, slice, fieldProjection, fieldSlice, selectedField, data, theme, en, attempt]);

  const path = (points: RZ) => points.map(([r, z], i) => `${i ? 'L' : 'M'}${r},${-z}`).join(' ');
  const span = Math.max(bounds.rMax - bounds.rMin, bounds.zMax - bounds.zMin, 0.1);
  const pad = span * 0.1;
  const failed = status === 'failed' || model.error;
  const displayPalette = fieldProjection?.reversePalette ? [...PSI_N_COLORS].reverse() : [...PSI_N_COLORS];
  const selectedFraction = selectedField && fieldProjection ? Math.max(0, Math.min(1, (selectedField.value - fieldProjection.minimum) / (fieldProjection.maximum - fieldProjection.minimum))) : 0.5;
  const selectedColor = displayPalette[Math.round(selectedFraction * (displayPalette.length - 1))];
  const style = { '--flux-accent': theme.accent, '--flux-line': theme.line, '--flux-field': selectedColor } as CSSProperties;
  const fieldUnavailable = spatialFieldUnavailableReason(data, field, coordinateMap);
  const authority = fieldSpec.authority === 'profile-mapped' ? 'PROFILE-MAPPED / AXISYMMETRIC' : fieldSpec.authority === 'native-grid' ? 'NATIVE R–Z / AXISYMMETRIC' : 'NORMALIZED ψ / AXISYMMETRIC';
  return <section className="fluxDemo" style={style} aria-label={en ? 'FUSE axisymmetric 3D field result' : 'FUSE 轴对称三维场结果'}>
    <header className="fluxHeader">
      <div><span className="fluxEyebrow">FUSE / SPATIAL FIELD RESULTS</span><h2>{en ? 'Axisymmetric 3D field' : '轴对称三维场云图'}</h2></div>
      <span className="fluxAuthority">SIMULATED / {authority}</span>
    </header>
    <div className="fluxLayout">
      <div className="fluxStage">
        <div ref={host} className="fluxViewport" />
        <div className="fluxCorner"><span>{en ? fieldSpec.labelEn.toUpperCase() : fieldSpec.labelZh}</span><strong>{selectedField ? `${selectedField.value.toPrecision(4)} ${selectedField.unit}` : '—'}</strong><small>ψ<sub>N</sub> = {selection.value.toFixed(2)} · {en ? 'selected surface' : '当前磁通面'}</small></div>
        {fieldProjection && <div className="fluxColorbar" aria-label={`${en ? fieldSpec.labelEn : fieldSpec.labelZh} ${fieldProjection.minimum} to ${fieldProjection.maximum} ${fieldProjection.unit}`}><span>{fieldProjection.maximum.toPrecision(4)}</span><i style={{ backgroundImage: `linear-gradient(to top, ${displayPalette.join(',')})` }} /><span>{fieldProjection.minimum.toPrecision(4)}</span><small>{fieldProjection.unit}</small></div>}
        {status === 'loading' && !failed && <p className="fluxStatus" role="status">{en ? 'Preparing the 3D surface…' : '正在生成三维磁通面…'}</p>}
        {failed && <div className="fluxStatus" role="status"><p>{en ? '3D unavailable. The source section and 2D results remain available.' : '三维暂不可用，右侧截面和下方二维结果仍可查看。'}</p>{!model.error && <button type="button" onClick={() => setAttempt(n => n + 1)}>{en ? 'Retry WebGL' : '重试 WebGL'}</button>}</div>}
        <div className="fluxStageFooter"><span>{en ? 'Drag to orbit · scroll to zoom' : '拖动旋转 · 滚轮缩放'}</span><button type="button" disabled={status !== 'ready' || failed} onClick={() => reset.current?.()}>{en ? 'Reset view' : '复位视角'}</button></div>
      </div>
      <aside className="fluxInspector">
        <div className="fluxInspectorTitle"><span>R–Z</span><strong>{en ? 'Source section' : '对应源截面'}</strong></div>
        <svg className="fluxSection" viewBox={`${bounds.rMin - pad} ${-bounds.zMax - pad} ${bounds.rMax - bounds.rMin + 2 * pad} ${bounds.zMax - bounds.zMin + 2 * pad}`} role="img" aria-label={en ? 'Selected exported R-Z contour in metres; horizontal R, vertical Z' : '选定导出轮廓，横轴 R、纵轴 Z，单位米'}>
          <path d={path(data.equilibrium.boundary)} fill="none" stroke={theme.line} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 4" />
          {selection.paths.map((p, i) => <path key={i} d={path(p)} fill="none" stroke={selectedColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
          <circle cx={data.equilibrium.axis[0]} cy={-data.equilibrium.axis[1]} r={span * 0.012} fill={theme.text} />
        </svg>
        <p className="fluxAxisNote">R → / Z ↑ · m</p>
        <label className="fluxControl">{en ? 'Field variable · linked with 2D' : '场变量 · 与二维联动'}<select value={field} onChange={event => onFieldChange(event.currentTarget.value as SpatialFieldChannel)}>{SPATIAL_FIELD_SPECS.map(spec => { const unavailable = spatialFieldUnavailableReason(data, spec.id, coordinateMap); return <option key={spec.id} value={spec.id} disabled={Boolean(unavailable)}>{en ? spec.labelEn : spec.labelZh} · {spec.displayUnit}{unavailable ? (en ? ' · unavailable' : ' · 暂不可用') : ''}</option>; })}</select></label>
        <label className="fluxControl">{en ? 'Exported flux level' : '导出的磁通层级'}<select value={level} onChange={e => setLevel(Number(e.target.value))}>{levels.map((c, i) => <option key={i} value={i}>ψN = {c.value.toFixed(2)}{c.value === 1 ? ' / LCFS' : ''}</option>)}</select></label>
        <label className="fluxControl">{en ? 'Toroidal display span' : '环向展示角度'}<span className="fluxRange"><input aria-label={en ? 'Toroidal display angle' : '环向展示角度'} type="range" min="90" max="360" step="15" value={degrees} onChange={e => setDegrees(Number(e.target.value))} /><output>{degrees}°</output></span></label>
        <label className="fluxCheck"><input type="checkbox" checked={slice} onChange={e => setSlice(e.target.checked)} />{en ? 'R–Z field-cloud cut plane' : 'R–Z 场云图剖切面'}</label>
        <label className="fluxCheck"><input type="checkbox" checked={frame} onChange={e => setFrame(e.target.checked)} />{en ? 'LCFS section guides' : 'LCFS 截面参考线'}</label>
        {fieldUnavailable && <p className="fluxUnavailable">{en ? 'Verified spatial mapping unavailable; the original 1-D profile remains available below.' : '已校验空间映射不可用；下方原一维剖面仍可查看。'}</p>}
        <dl className="fluxStats"><div><dt>{en ? 'Surface triangles' : '磁面三角形'}</dt><dd>{model.surface?.triangles.toLocaleString('en-US') ?? '—'}</dd></div><div><dt>{en ? 'Cloud cells' : '云图单元'}</dt><dd>{fieldSlice?.cells.toLocaleString('en-US') ?? '—'}</dd></div><div><dt>{en ? 'Source points' : '源轮廓点'}</dt><dd>{model.surface?.sourcePoints ?? '—'}</dd></div></dl>
      </aside>
    </div>
    <footer className="fluxEvidence"><p>{fieldSpec.authority === 'profile-mapped' ? (en ? 'The R–Z cloud and selected surface use the same bounded profile mapping. A flux-function is constant on each selected surface; radial gradients are visible on the cut plane. This is not a 3-D transport solve.' : 'R–Z 云图剖切面与选中磁面共用同一有界剖面映射。磁通函数在单一磁面上保持常值，径向梯度由剖切面显示；这不是三维输运求解。') : (en ? 'The cut plane retains the archived equilibrium grid; the surface is an axisymmetric revolution of an exported contour.' : '剖切面保留归档磁平衡网格；磁面由导出轮廓按轴对称假设旋转。')} {en ? 'Section guides are not magnetic field lines; cut edges are display cuts, not physical boundaries.' : '截面参考线不是磁力线；剖开边缘仅为显示切口，不是物理边界。'}</p><p>{data.equilibriumOrigin === 'model-solved' ? (en ? 'Model-solved equilibrium' : '模型求解平衡') : data.equilibriumOrigin === 'input-reconstruction' ? (en ? 'Input reconstruction, not a newly solved equilibrium' : '输入重建平衡，并非本次新求解') : (en ? 'Exported equilibrium; solve origin unspecified' : '导出平衡，未声明求解来源')}{en ? ' · Axisymmetric-derived display; no toroidal variation, MHD mode, turbulence structure or non-axisymmetric solution is implied.' : ' · 轴对称派生显示；不包含环向变化、MHD 模态、湍流结构或非轴对称解。'}</p><code>{data.runId}{coordinateMap && fieldSpec.authority === 'profile-mapped' ? ` · map ${coordinateMap.projectorSha256.slice(0, 8)}` : ''}</code></footer>
  </section>;
}
