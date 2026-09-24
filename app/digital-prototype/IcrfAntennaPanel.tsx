'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { antennaPlacement, ICRF_DEFAULT_OPTIONS, ICRF_DISPLAY_RADIUS_RANGE_MM,
  type IcrfAntennaOptions, type IcrfAntennaStatus } from '../components/device-viewer/icrfAntenna';
import './IcrfAntennaPanel.css';
import type { EfitStore } from '../components/efit/store';
import { useEfitStore } from '../components/efit/use-efit-store';
import { antennaFluxAtRadius } from '../components/efit/fieldlines';

export default function IcrfAntennaPanel({ options, status, onChange, onFocus, onRetry, store }: {
  store: EfitStore;
  options: IcrfAntennaOptions; status: IcrfAntennaStatus;
  onChange: (options: IcrfAntennaOptions) => void; onFocus: () => void; onRetry: () => void;
}) {
  const { locale } = useI18n();
  const en = locale === 'en';
  const id = useId();
  const snapshot = useEfitStore(store);
  const source = snapshot.currentFrame?.shot === snapshot.activeShot ? snapshot.currentFrame?.fieldlineFrame : undefined;
  const flux = antennaFluxAtRadius(source, options.radiusMm);
  const [radiusDraft, setRadiusDraft] = useState(String(options.radiusMm));
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) setRadiusDraft(String(options.radiusMm)); });
    return () => { active = false; };
  }, [options.radiusMm]);
  const placement = useMemo(() => antennaPlacement(options.radiusMm), [options.radiusMm]);
  const move = (value: string) => {
    if (!value.trim()) return;
    const radiusMm = Number(value);
    if (Number.isFinite(radiusMm) && radiusMm >= ICRF_DISPLAY_RADIUS_RANGE_MM[0]
      && radiusMm <= ICRF_DISPLAY_RADIUS_RANGE_MM[1]) onChange({ ...options, radiusMm });
  };
  return <section className="icrfPanel" aria-label={en ? 'ICRF antenna position' : '离子回旋天线位置'} data-icrf-status={status}>
    <header><div><small>ICRF · 300° · Z = 0</small><h3>{en ? 'ICRF antenna' : '离子回旋天线'}</h3></div>
      <label className="icrfVisibility"><input type="checkbox" checked={options.visible} onChange={(event) => onChange({ ...options, visible: event.target.checked })} />{en ? 'Show' : '显示'}</label>
    </header>
    <label htmlFor={`${id}-radius`}>{en ? 'Outer limiter surface R / mm' : '外侧限制器表面 R / mm'}</label>
    <div className="icrfRadius"><input id={`${id}-radius`} type="number" min={1100} max={1600} step={1} value={radiusDraft}
      onChange={(event) => { setRadiusDraft(event.target.value); move(event.target.value); }}
      onBlur={() => setRadiusDraft(String(options.radiusMm))} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
      <span>ΔR {options.radiusMm >= 1350 ? '+' : ''}{(options.radiusMm - 1350).toFixed(1)} mm</span></div>
    <input className="icrfSlider" type="range" aria-label={en ? 'Radial antenna position' : '天线径向位置'} min={1100} max={1600} step={1} value={options.radiusMm} onChange={(event) => move(event.target.value)} />
    <div className="icrfFlux" data-flux-state={flux ? 'available' : 'unavailable'}>
      <strong>{en ? 'Flux at the reference point' : '参考点磁通函数'}</strong>
      <dl><div><dt>ψ / Wb</dt><dd data-flux="psi">{flux ? flux.psiWb.toFixed(5) : '—'}</dd></div>
        <div><dt>ψN</dt><dd data-flux="normalized">{flux ? flux.psiN.toFixed(4) : '—'}</dd></div></dl>
      <p>{flux && source ? `#${source.shot} · ${(source.timeMs / 1000).toFixed(3)} s · ${flux.insideLcfs ? (en ? 'Inside LCFS' : 'LCFS 内') : (en ? 'Outside LCFS' : 'LCFS 外')}`
        : (en ? 'Flux is available for verified frames of #21066 / #21138.' : '仅 #21066 / #21138 的有效源帧提供磁通。')}</p>
      <p>{en ? 'Outer-limiter midplane point (R, Z=0), 300°. Not flux integrated through the antenna.' : '外侧限制器中平面参考点 (R, Z=0)，300°；不是穿过整副天线的积分磁通。'}</p>
    </div>
    <div className="icrfActions"><button type="button" disabled={status !== 'ready'} onClick={onFocus}>{en ? 'Inspect antenna' : '查看天线'}</button>
      <button type="button" onClick={() => onChange({ ...ICRF_DEFAULT_OPTIONS })}>{en ? 'Reset 1350 mm' : '复位 1350 mm'}</button></div>
    <p role="status">{status === 'ready' ? (en ? 'Fine CAD ready · 25 meshes' : '精细 CAD 已就绪 · 25 个网格部件')
      : status === 'loading' ? (en ? 'Loading fine CAD…' : '正在加载精细 CAD…')
      : status === 'error' ? (en ? 'Antenna failed to load. Host model is unaffected.' : '天线加载失败，装置模型不受影响。')
      : (en ? 'Waiting for device viewer…' : '等待装置视图就绪…')}
      {status === 'error' && <button type="button" onClick={onRetry}>{en ? 'Retry' : '重试'}</button>}</p>
    <details><summary>{en ? 'Installation reference' : '安装基准'}</summary>
      <p>{en ? 'Flux uses the same EFIT source time, without temporal interpolation. The 1 mm radial lookup is sampled from a 15.625 × 29.688 mm source grid; it does not imply 1 mm measurement accuracy. Moving the antenna does not change the equilibrium.' : '磁通采用同一 EFIT 源时间片，不作时间插值。径向查询步长 1 mm，原始网格为 15.625 × 29.688 mm，不代表 1 mm 测量精度。移动天线不改变平衡。'}</p>
      <p>{en ? `Inner limiter R = ${placement.innerRadiusMm.toFixed(1)} mm. The rigid assembly moves radially without deforming.` : `内侧限制器 R = ${placement.innerRadiusMm.toFixed(1)} mm；整套天线径向刚体移动。`}</p>
      <p>{en ? '300° / midplane / outer R1350 are user-confirmed. CAD axes and centring are geometry-derived, pending installation survey. Slider bounds are for display, not mechanical travel or safe clearance. Host slicing does not cut the antenna.' : '300°、中平面及外侧 R1350 已确认。CAD 轴向与中心由几何推定，待安装测绘复核。调节范围仅用于显示，不代表机械行程或安全间隙；装置剖切不裁切天线。'}</p>
    </details>
  </section>;
}
