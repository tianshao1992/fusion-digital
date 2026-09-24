'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { createFieldlineSource, FIELDLINE_COLORS, fieldlineTimeSelection,
  type FieldlineCatalog, type FieldlineFrame, type FieldlineView } from '../components/efit/fieldlines';
import './EfitFieldlinePanel.css';

export default function EfitFieldlinePanel({ active, antennaRadiusMm, onView }: {
  active: boolean; antennaRadiusMm: number; onView: (view: FieldlineView) => void;
}) {
  const { locale } = useI18n(); const en = locale === 'en'; const id = useId();
  const [catalog, setCatalog] = useState<FieldlineCatalog | null>(null);
  const [shotId, setShotId] = useState(21066);
  const [timeMs, setTimeMs] = useState(400);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(0.05);
  const [xray, setXray] = useState(true);
  const [clip, setClip] = useState(false);
  const [loaded, setLoaded] = useState<FieldlineFrame | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const timeRef = useRef(timeMs);
  const readyRef = useRef(false);
  const sessionRef = useRef<{ source: ReturnType<typeof createFieldlineSource>; controller: AbortController } | null>(null);
  const shot = catalog?.shots.find((s) => s.shot === shotId);
  const selection = shot ? fieldlineTimeSelection(shot.frames, timeMs) : null;
  const selectedIndex = selection?.index ?? -1;
  const frame = active && !selection?.gap && loaded?.shot === shotId && loaded.index === selectedIndex ? loaded : null;
  const displayed = frame?.state === 'valid' ? frame : null;

  useEffect(() => { timeRef.current = timeMs; }, [timeMs]);
  useEffect(() => { readyRef.current = Boolean(frame || selection?.gap); }, [frame, selection?.gap]);
  useEffect(() => {
    if (!active) return;
    const source = createFieldlineSource(); const controller = new AbortController();
    void source.catalog(controller.signal).then(setCatalog).catch(() => {
      if (!controller.signal.aborted) setError(en ? 'Unable to load the two-shot catalogue.' : '两炮数据目录加载失败。');
    });
    return () => controller.abort();
  }, [active, retry, en]);
  useEffect(() => {
    // A fresh session also survives React's setup-cleanup-setup development check.
    const controller = new AbortController(); const source = createFieldlineSource();
    sessionRef.current = { controller, source };
    return () => { controller.abort(); source.clear(); };
  }, [shotId, retry]);
  useEffect(() => {
    if (!active || !shot || selectedIndex < 0) { sessionRef.current?.source.retain(); return; }
    let current = true;
    const { source, controller } = sessionRef.current!;
    source.retain(shot, selectedIndex);
    void source.frame(shot, selectedIndex, controller.signal).then((next) => {
      if (!current) return; setLoaded(next); setError('');
      // Verify the adjacent chunk ahead of playback; no unbounded whole-shot allocation.
      const chunk = shot.chunks.find((c) => selectedIndex >= c.firstIndex && selectedIndex < c.firstIndex + c.frameCount);
      const nextIndex = chunk ? chunk.firstIndex + chunk.frameCount : shot.frames.length;
      if (nextIndex < shot.frames.length) void source.frame(shot, nextIndex, controller.signal).catch(() => undefined);
    }).catch(() => {
      if (current && !controller.signal.aborted) {
        setPlaying(false); setError(en ? 'Frame verification failed. Retry to download again.' : '帧数据校验失败，请重试下载。');
      }
    });
    return () => { current = false; };
  }, [active, shot, selectedIndex, retry, en]);
  useEffect(() => {
    let cancelled = false;
    if (!active) queueMicrotask(() => { if (!cancelled) setPlaying(false); });
    return () => { cancelled = true; };
  }, [active]);
  useEffect(() => { onView({ frame: displayed, xray, clip }); }, [displayed, xray, clip, onView]);
  useEffect(() => () => onView({ frame: null, xray: true, clip: false }), [onView]);
  useEffect(() => {
    if (!playing || !active || !shot) return;
    let handle = 0; let last = performance.now(); let lastPaint = last; let target = timeRef.current;
    const end = shot.frames.at(-1)!.timeMs;
    const tick = (now: number) => {
      if (document.hidden) { setPlaying(false); return; }
      // Buffer at the current physical time if the next verified chunk is not ready.
      // Do not race ahead and spawn an unbounded network/decode queue at 1x.
      if (readyRef.current) target += (now - last) * speed;
      last = now;
      if (now - lastPaint >= 32 || target >= end) { setTimeMs(Math.min(target, end)); lastPaint = now; }
      if (target >= end) { setPlaying(false); return; }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, active, shot, speed]);

  const seek = (index: number) => { if (shot) { setPlaying(false); setTimeMs(shot.frames[Math.max(0, Math.min(shot.frames.length - 1, index))].timeMs); } };
  const referenceTime = selection?.gap ? timeMs : shot?.frames[selectedIndex]?.timeMs;
  const gaps = shot?.frames.filter((f, i) => i > 0 && f.timeMs - shot.frames[i - 1].timeMs > 1.5).length ?? 0;
  const boundary = displayed?.boundaryRz ?? [];
  const rzPath = boundary.reduce((path, value, i) => i % 2 ? path : `${path}${i ? ' L' : 'M'}${30 + (value - 0.2) * 70},${155 - boundary[i + 1] * 70}`, '');

  return <section className="fieldlinePanel" aria-label={en ? 'Axisymmetric EFIT field lines' : '轴对称 EFIT 磁力线'} data-fieldline-shot={shotId} data-fieldline-frame={displayed?.index ?? 'none'}>
    <header><div><small>EXL-50U · EFIT · 3D</small><h3>{en ? 'Magnetic field lines' : '三维磁力线'}</h3></div>
      <label>{en ? 'Shot' : '炮号'}<select value={shotId} onChange={(event) => {
        setPlaying(false); setLoaded(null); setError(''); setTimeMs(400); setShotId(Number(event.target.value));
      }}><option value={21066}>#21066</option><option value={21138}>#21138</option></select></label></header>
    <div className="fieldlineTime"><strong>{referenceTime === undefined ? '—' : `${(referenceTime / 1000).toFixed(3)} s`}</strong>
      <span>{shot ? `${selectedIndex + 1} / ${shot.frames.length}` : '…'} {en ? 'source frames' : '原始时间片'}</span></div>
    <div className="fieldlineStatus" role="status">{error || (selection?.gap
      ? (en ? `Missing interval ${selection.afterMs}–${selection.beforeMs} ms · lines hidden` : `缺帧区间 ${selection.afterMs}–${selection.beforeMs} ms · 已隐藏磁力线`)
      : frame?.state === 'unavailable' ? (en ? 'This frame did not pass tracing checks.' : '此帧未通过磁力线追踪检查。')
      : displayed ? (en ? 'Axisymmetric reconstruction · source timestamps' : '轴对称重建 · 原始时间戳')
      : (en ? 'Loading and verifying trajectories…' : '正在加载并校验轨迹…'))}
      {error && <button type="button" onClick={() => { setError(''); setLoaded(null); setRetry((n) => n + 1); }}>{en ? 'Retry' : '重试'}</button>}</div>
    <input type="range" aria-label={en ? 'Field-line frame' : '磁力线时间片'} min={0} max={(shot?.frames.length ?? 1) - 1}
      value={Math.max(0, selectedIndex)} disabled={!shot} onChange={(event) => seek(Number(event.target.value))} />
    <div className="fieldlinePlayback">
      <button type="button" disabled={!shot || selectedIndex <= 0} onClick={() => seek(selectedIndex - 1)} aria-label={en ? 'Previous source frame' : '上一时间片'}>←</button>
      <button type="button" disabled={!shot || !!error || (!playing && !frame && !selection?.gap)} onClick={() => {
        if (shot && timeMs >= shot.frames.at(-1)!.timeMs) { timeRef.current = shot.frames[0].timeMs; setTimeMs(timeRef.current); }
        setPlaying((value) => !value);
      }}>{playing ? (en ? 'Pause' : '暂停') : (en ? 'Play' : '播放')}</button>
      <button type="button" disabled={!shot || selectedIndex >= shot.frames.length - 1} onClick={() => seek(selectedIndex + 1)} aria-label={en ? 'Next source frame' : '下一时间片'}>→</button>
      <label>{en ? 'Speed' : '速度'}<select value={speed} onChange={(event) => { setPlaying(false); setSpeed(Number(event.target.value)); }}>
        <option value={0.02}>0.02×</option><option value={0.05}>0.05×</option><option value={0.1}>0.1×</option><option value={0.25}>0.25×</option><option value={1}>1×</option>
      </select></label>
    </div>
    <div className="fieldlineOptions"><label><input type="checkbox" checked={xray} onChange={(event) => setXray(event.target.checked)} />{en ? 'X-ray view' : '透视显示'}</label>
      <label><input type="checkbox" checked={clip} onChange={(event) => setClip(event.target.checked)} />{en ? 'Follow device cut' : '随装置剖切'}</label></div>
    <div className="fieldlineLegend" aria-label={en ? 'Seed flux surfaces' : '播种磁面'}>ψN {catalog?.seedPsiN.map((n, i) => <span key={n}><i style={{ background: FIELDLINE_COLORS[i] }} />{n.toFixed(2)}</span>)}</div>
    <figure className="fieldlineSection"><svg viewBox="0 0 230 318" role="img" aria-labelledby={`${id}-section`}>
      <title id={`${id}-section`}>{en ? 'Source boundary and antenna radial reference at 300 degrees' : '300° 截面的原始边界与天线径向基准'}</title>
      <path d="M30 22 V288 H170" className="fieldlineAxes" /><path d="M30 155 H170" className="fieldlineAxes" />
      {[0.5, 1, 1.5, 2].map((r) => <text key={r} x={30 + (r - .2) * 70} y={303} textAnchor="middle">{r}</text>)}
      {[-1, 0, 1].map((z) => <text key={z} x={24} y={159 - z * 70} textAnchor="end">{z}</text>)}
      <text x={187} y={300}>R / m</text><text x={6} y={15}>Z / m</text>
      <path d={rzPath} className="fieldlineBoundary" />
      <path d={`M${30 + (antennaRadiusMm / 1000 - .2) * 70},141 v28`} className="fieldlineAntennaMark" />
      {displayed?.lines.map((line, i) => { const mid = Math.floor(line.points.length / 6) * 3; return <circle key={line.psiN} cx={30 + (line.points[mid] - .2) * 70} cy={155 - line.points[mid + 2] * 70} r={3.5} fill={FIELDLINE_COLORS[i]} stroke="#111" strokeWidth={1} />; })}
    </svg><figcaption>{en ? '300° section · antenna outer limiter' : '300° 截面 · 天线外侧限制器'}<br />R = {(antennaRadiusMm / 1000).toFixed(3)} m</figcaption></figure>
    <p>{en ? '5 core flux surfaces, traced both ways. Moving the antenna changes geometry only—not the EFIT field.' : '5 个芯部磁面，沿磁场双向追踪。移动天线只改变几何位置，不改变 EFIT 磁场。'}</p>
    <details><summary>{en ? 'Data and limits' : '数据与适用范围'}</summary>
      <p>{en ? `${gaps} time gaps; missing frames are not interpolated. Lines follow the stored field convention, not independent magnetic measurements.` : `${gaps} 段时间缺口，不插补。磁力线采用源数据磁场约定，不是独立磁测验证结果。`}</p>
      <p>{en ? 'Seeds: outboard flux surfaces at 300° and the instantaneous magnetic-axis height—not the antenna surface. Each independent equilibrium is traced afresh; this is not a particle trajectory.' : '种子位于 300°、当帧磁轴高度的外侧磁面，不在天线表面。各平衡帧独立追踪，动画不代表粒子运动。'}</p>
      <p>{en ? 'Core region only (ψN ≤ 0.97); at most one toroidal turn or 10 m in each direction. No SOL, wall intersections, connection lengths, 3D perturbations or RF coupling. CAD registration remains provisional; grid spacing is 15.625 × 29.688 mm.' : '仅芯部 ψN≤0.97；每向最多一圈或 10 m。暂不计算 SOL、碰壁、连接长度、三维扰动或射频耦合。CAD 配准待复核；场网格间距约 15.625 × 29.688 mm。'}</p>
      {frame?.reason && <p>{en ? 'Rejected: ' : '拒绝原因：'}{frame.reason}</p>}
      <p>ΔψN ≤ {displayed ? Math.max(...displayed.lines.map((line) => line.maxPsiNDrift)).toExponential(2) : '—'} · {catalog?.algorithmVersion}</p>
      <p className="fieldlineDigest">IMAS H5 SHA-256: {shot?.sourceSha256}</p>
    </details>
  </section>;
}
