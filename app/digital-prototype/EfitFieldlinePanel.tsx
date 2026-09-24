'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '../i18n';
import { FIELDLINE_COLORS, FIELDLINE_COPIES, type FieldlineView } from '../components/efit/fieldlines';
import type { EfitStore } from '../components/efit/store';
import { useEfitStore } from '../components/efit/use-efit-store';
import './EfitFieldlinePanel.css';

/** An overlay control, not a second shot selector or playback clock. */
export default function EfitFieldlinePanel({ active, store, onView }: {
  active: boolean; store: EfitStore; onView: (view: FieldlineView) => void;
}) {
  const { locale } = useI18n(); const en = locale === 'en';
  const snapshot = useEfitStore(store);
  const [shown, setShown] = useState(false);
  const [copies, setCopies] = useState(2);
  const [xray, setXray] = useState(true);
  const [clip, setClip] = useState(false);
  const current = snapshot.currentFrame;
  const source = current?.shot === snapshot.activeShot ? current.fieldlineFrame : undefined;
  const supported = snapshot.activeShot === 21066 || snapshot.activeShot === 21138;
  const displayed = active && shown && source?.state === 'valid' ? source : null;
  const enabled = active && shown && supported;
  // Send settings only. The viewer subscribes to the same EFIT store directly;
  // lifting every source frame would re-render the entire assembly workspace.
  useEffect(() => { onView({ frame: null, enabled, xray, clip, copies }); }, [enabled, xray, clip, copies, onView]);
  useEffect(() => () => onView({ frame: null, xray: true, clip: false }), [onView]);

  return <section className="fieldlinePanel" aria-label={en ? 'Magnetic field-line overlay' : '磁力线叠加'}
    data-fieldline-shot={snapshot.activeShot ?? 'none'} data-fieldline-frame={displayed?.sourceIndex ?? 'none'}>
    <header><label className="fieldlineToggle"><input type="checkbox" checked={shown} disabled={!supported}
      onChange={(event) => setShown(event.target.checked)} />{en ? 'Show 3D field lines' : '显示三维磁力线'}</label>
      <span>{supported ? (en ? 'Same EFIT shot & time' : '与 EFIT 同炮、同时间') : (en ? 'Available for #21066 / #21138' : '仅 #21066 / #21138 已有数据')}</span></header>
    {supported && shown && <>
      <div className="fieldlineOptions">
        <label>{en ? 'Line density' : '磁力线疏密'}<select value={copies} onChange={(event) => setCopies(Number(event.target.value))}>
          {FIELDLINE_COPIES.map((n) => <option key={n} value={n}>{n * 5} {en ? 'lines' : '条'}</option>)}
        </select></label>
        <label><input type="checkbox" checked={xray} onChange={(event) => setXray(event.target.checked)} />{en ? 'X-ray view' : '透视显示'}</label>
        <label><input type="checkbox" checked={clip} onChange={(event) => setClip(event.target.checked)} />{en ? 'Follow device cut' : '随装置剖切'}</label>
      </div>
      <p role="status">{source?.state === 'valid'
        ? (en ? 'Source frame ' : '源时间片 ') + (source.timeMs / 1000).toFixed(3) + ' s · ' + (en ? 'full poloidal coverage' : '完整极向覆盖')
        : source ? (en ? 'Tracing rejected for this frame; EFIT and flux remain independent.' : '此帧磁力线未通过校验；EFIT 和磁通独立显示。')
        : (en ? 'Waiting for the verified EFIT frame…' : '等待当前 EFIT 帧校验…')}</p>
      <div className="fieldlineLegend">ψN {[.25, .5, .75, .9, .97].map((n, i) => <span key={n}><i style={{ background: FIELDLINE_COLORS[i] }} />{n.toFixed(2)}</span>)}</div>
      <details><summary>{en ? 'Field-line interpretation' : '磁力线说明'}</summary>
        <p>{en ? 'Line count controls visualization sampling, not field strength. Axisymmetric toroidal seed rotations retain the same five core surfaces; each base trace covers a full poloidal cycle.' : '条数只改变显示采样，不代表磁场强弱。利用轴对称性在不同环向角播种，保留五个芯部磁面；每条基础轨迹覆盖完整极向一周。'}</p>
        <p>{en ? 'Independent equilibria, not particle paths. No SOL, wall collisions, 3D perturbations or RF coupling. Source field convention has not been independently confirmed; CAD registration remains provisional.' : '逐帧平衡，不是粒子轨迹；不包含 SOL、碰壁、三维扰动或射频耦合。源磁场约定尚无独立验证，CAD 配准待复核。'}</p>
        {source?.reason && <p>{source.reason}</p>}
      </details>
    </>}
  </section>;
}
