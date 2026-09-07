'use client';
import { useEffect, useMemo, useState } from 'react';
import ScientificChart from '../../components/charts/ScientificChart';
import { loadScientificJson } from '../physics';
import catalog from '../data/synthetic-diagnostics.json';
import { parseDiagnosticData, projectDensity, fitDensity, type DiagnosticCase, type DiagnosticData, type DiagnosticFrame } from './contracts';
import './diagnostics.css';

const fmt = (v: number, digits = 4) => new Intl.NumberFormat('en-US', { maximumSignificantDigits: digits }).format(v);
const emissionPalette = [[13,8,135],[126,3,168],[204,71,120],[248,148,65],[240,249,33]];
function emissionColor(value: number) {
  const position = Math.min(1, Math.max(0, value))*4, i = Math.min(3, Math.floor(position)), a = emissionPalette[i], b = emissionPalette[i+1];
  return `rgb(${a.map((v, j) => Math.round(v+(b[j]-v)*(position-i))).join(' ')})`;
}
const rms = (v: number[]) => Math.sqrt(v.reduce((s, x) => s+x*x, 0)/v.length);
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function DiagnosticWorkspace({ en }: { en: boolean }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const [data, setData] = useState<DiagnosticData | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState('fuse-diiid');
  useEffect(() => {
    const abort = new AbortController();
    loadScientificJson(catalog, abort.signal).then(raw => {
      const result = parseDiagnosticData(raw);
      for (const entry of catalog.cases) {
        const c = result.cases.find(c => c.id === entry.id);
        if (!c || c.runId !== entry.runId || c.engine !== entry.engine || c.device !== entry.device || c.frames.length !== entry.frames || c.geometry.kind !== entry.geometryKind) throw Error('DIAGNOSTIC_SOURCE_IDENTITY');
      }
      setData(result);
    }).catch(e => { if (!abort.signal.aborted) setError(String(e.message)); });
    return () => abort.abort();
  }, [revision]);
  const active = data?.cases.find(c => c.id === selected);
  return <main className="diagnosticStudio"><header className="diagnosticHeading"><div><p className="transportEyebrow">PHYSICS → SYNTHETIC DIAGNOSTICS</p><h1>{t('物理—诊断闭环', 'Physics–diagnostic loop')}</h1><p>{t('从已有等离子体状态出发，计算视线信号，再用合成观测检验重投影。', 'Project archived plasma states into sightline signals, then test the reprojection against synthetic observations.')}</p></div><div className="diagnosticBadge">CHERAB 1.5.0<br /><b>SYNTHETIC</b></div></header>
    <div className="diagnosticCasePicker" role="group" aria-label={t('诊断算例', 'Diagnostic case')}>{catalog.cases.map(c => <button key={c.id} aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}><b>{c.name}</b><span>{c.frames} {t('个时间截面', 'time slices')} · {c.geometryKind === 'native-equilibrium' ? t('原生平衡', 'Native equilibrium') : t('重建几何', 'Reconstructed geometry')}</span></button>)}</div>
    <ol className="diagnosticChain">{[t('物理状态', 'Plasma state'), t('轫致辐射近似', 'Free-free approximation'), t('CHERAB 视线积分', 'CHERAB sightlines'), t('合成观测', 'Synthetic observations'), t('反演与重投影', 'Fit & reproject')].map((s, i) => <li key={s}><span>0{i+1}</span>{s}</li>)}</ol>
    {error ? <div className="diagnosticPanel" role="alert"><p>{t('诊断结果加载或完整性校验失败。', 'Diagnostic loading or integrity verification failed.')} {error}</p><button onClick={() => { setError(''); setRevision(v => v+1); }}>{t('重试', 'Retry')}</button></div> : active && data ? <DiagnosticResult key={active.id} data={data} c={active} en={en} /> : <div className="diagnosticPanel" role="status">{t('正在校验并读取已计算的 72 个时间截面、12 条虚拟视线。', 'Verifying and loading 72 computed time slices and 12 virtual sightlines.')}</div>}
  </main>;
}

function DiagnosticResult({ data, c, en }: { data: DiagnosticData; c: DiagnosticCase; en: boolean }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const [index, setIndex] = useState(c.frames.length-1), [playing, setPlaying] = useState(false), [scale, setScale] = useState(1), [channel, setChannel] = useState(5);
  const f = c.frames[index], projected = projectDensity(f, scale), mask = c.geometry.channels.map(v => v.fit);
  const validation = projected.residual.filter((_, i) => !mask[i]);
  const fitted = fitDensity(f, mask);
  useEffect(() => { if (!playing || c.frames.length < 2) return; const timer = setInterval(() => setIndex(i => (i+1)%c.frames.length), 650); return () => clearInterval(timer); }, [playing, c.frames.length]);
  const labels = c.geometry.channels.map(v => v.id.replace('LOS-', ''));
  const base = { animation: false, grid: { left: 66, right: 20, top: 54, bottom: 44 }, tooltip: { trigger: 'axis' }, legend: { top: 0 } };
  const unit = 'kW m⁻² sr⁻¹';
  function csv() {
    download(`${c.id}-${f.time}s-diagnostic.csv`, 'channel,fit_channel,time_s,density_scale,predicted_W_m2_sr,synthetic_observed_W_m2_sr,sigma_W_m2_sr,residual_sigma\n'+c.geometry.channels.map((ch, i) => [ch.id,ch.fit,f.time,scale,projected.predicted[i],f.observed[i],f.sigma[i],projected.residual[i]].join(',')).join('\n'), 'text/csv');
  }
  return <><div className="diagnosticToolbar"><label>{t('时间截面', 'Time slice')} <b>{fmt(f.time)} s</b><input aria-label={t('时间截面', 'Time slice')} type="range" min={0} max={c.frames.length-1} value={index} disabled={c.frames.length === 1} onChange={e => setIndex(+e.target.value)} /></label><button disabled={c.frames.length === 1} aria-pressed={playing} onClick={() => setPlaying(v => !v)}>{playing ? t('暂停回放', 'Pause replay') : t('回放时序', 'Replay time series')}</button><label>{t('高亮通道', 'Highlight channel')}<select value={channel} onChange={e => setChannel(+e.target.value)}>{c.geometry.channels.map((ch, i) => <option key={ch.id} value={i}>{ch.id} · {ch.fit ? t('拟合', 'Fit') : t('留出', 'Held out')}</option>)}</select></label></div>
    <div className="diagnosticLayout"><section className="diagnosticPanel diagnosticField"><div className="diagnosticPanelHeading"><h2>{t('发射分布与诊断几何', 'Emission & sightlines')}</h2><span>{c.geometry.kind === 'native-equilibrium' ? t('FUSE 原生平衡映射', 'FUSE native equilibrium mapping') : t('TORAX 参数化几何', 'TORAX parametric geometry')}</span></div><FieldView c={c} frame={f} channel={channel} scale={scale} en={en} /><p className="diagnosticCaption">{t('正 R 侧极向截面 · 理想水平视线 · LCFS 外发射设为零。几何与 Te 固定，发射强度随密度倍率的平方变化。', 'Positive-R poloidal section · ideal horizontal sightlines · zero emission outside LCFS. Geometry and Te remain fixed; emission scales with density squared.')}</p></section>
    <section className="diagnosticPanel diagnosticSignals"><div className="diagnosticPanelHeading"><h2>{t('仪器会看到什么', 'What the diagnostic sees')}</h2><span>{unit}</span></div><ScientificChart id={`diagnostic-signals-${c.id}`} eager height={295} fallbackSrc="" fallbackAlt="" ariaLabel={t('通道信号与合成观测', 'Channel signals and synthetic observations')} fallback={<p>{t('全部通道数值见下方表格。', 'All channel values are available in the table below.')}</p>} option={{ ...base, xAxis: { type: 'category', data: labels, name: 'LOS' }, yAxis: { type: 'value', name: unit, min: 0 }, series: [{ name: t('源状态预测', 'Source prediction'), type: 'line', data: f.predicted.map(v => v/1000), lineStyle: { type: 'dashed', width: 1.5 } }, { name: t('当前重投影', 'Current reprojection'), type: 'line', data: projected.predicted.map(v => v/1000), lineStyle: { width: 3 } }, { name: t('合成观测', 'Synthetic observation'), type: 'scatter', symbolSize: 9, data: f.observed.map(v => v/1000) }] }} />
    <h3>{t('逐通道残差', 'Channel residuals')} <small>Δ / σ</small></h3><ScientificChart id={`diagnostic-residual-${c.id}`} eager height={190} fallbackSrc="" fallbackAlt="" ariaLabel={t('标准化重投影残差', 'Normalized reprojection residuals')} fallback={<p>{t('留出通道不参与拟合。', 'Held-out channels are excluded from fitting.')}</p>} option={{ ...base, grid: { left: 54, right: 20, top: 20, bottom: 36 }, legend: { show: false }, xAxis: { type: 'category', data: labels }, yAxis: { type: 'value', name: 'Δ / σ' }, series: [{ type: 'bar', data: projected.residual, markLine: { silent: true, symbol: 'none', label: { show: false }, data: [{ yAxis: 2 }, { yAxis: -2 }] } }] }} /></section></div>
    <section className="diagnosticPanel diagnosticFit"><div><p className="transportEyebrow">CLOSE THE LOOP</p><h2>{t('只反演一个密度倍率', 'Fit one density scale')}</h2><p>{t('固定温度、组分假设与几何。奇数通道拟合，偶数通道检验。', 'Hold temperature, composition assumptions and geometry fixed. Fit odd channels; check even channels.')}</p></div><label>{t('试探密度倍率', 'Trial density scale')}<output>{fmt(scale, 5)} ×</output><input aria-label={t('试探密度倍率', 'Trial density scale')} type="range" min="0.7" max="1.4" step="0.001" value={scale} onChange={e => setScale(+e.target.value)} /></label><div className="diagnosticFitActions"><button className="diagnosticPrimary" onClick={() => setScale(fitted)}>{t('拟合并重投影', 'Fit & reproject')}</button><button onClick={() => setScale(1)}>{t('恢复源状态', 'Reset to source')}</button></div><div className="diagnosticScore"><span>{t('留出通道 RMS', 'Held-out RMS')}</span><strong>{fmt(rms(validation), 3)} σ</strong><small>{t('拟合结果', 'Fitted scale')} {fmt(fitted, 5)} ×</small></div></section>
    <div className="diagnosticSecondary"><section className="diagnosticPanel"><h2>{t('物理状态：密度剖面', 'Plasma state: density profile')}</h2><ScientificChart id={`diagnostic-density-${c.id}`} eager height={265} fallbackSrc="" fallbackAlt="" ariaLabel={t('源密度与重建密度', 'Source and fitted density')} fallback={<p>ρtor,norm · ne / 10²⁰ m⁻³</p>} option={{ ...base, xAxis: { type: 'value', min: 0, max: 1, name: 'ρtor,norm' }, yAxis: { type: 'value', name: 'ne / 10²⁰ m⁻³' }, series: [{ name: t('源状态', 'Source state'), type: 'line', showSymbol: false, data: c.rho.map((r, i) => [r, f.ne[i]/1e20]) }, { name: t('当前估计', 'Current estimate'), type: 'line', showSymbol: false, data: c.rho.map((r, i) => [r, f.ne[i]*scale/1e20]) }] }} /><p className="diagnosticCaption">{t('轴上 Te', 'Axis Te')}: {fmt(f.te[0]/1000)} keV · {t('仅缩放密度，不重新求解输运或平衡。', 'Density scaling only; transport and equilibrium are not re-solved.')}</p></section><section className="diagnosticPanel"><h2>{t('诊断信号时序', 'Diagnostic time series')} · LOS-{String(channel+1).padStart(2, '0')}</h2><ScientificChart id={`diagnostic-time-${c.id}`} eager height={265} fallbackSrc="" fallbackAlt="" ariaLabel={t('所选视线的合成信号时序', 'Synthetic signal time series for selected sightline')} fallback={<p>{t('FUSE 为单时间截面，TORAX 保留原始输出时刻。', 'FUSE has one time slice; TORAX retains native output times.')}</p>} option={{ ...base, xAxis: { type: 'value', name: 't / s' }, yAxis: { type: 'value', name: unit }, series: [{ name: t('源状态预测', 'Source prediction'), type: 'line', showSymbol: c.frames.length === 1, symbolSize: 10, data: c.frames.map(v => [v.time, v.predicted[channel]/1000]), markLine: { symbol: 'none', label: { show: false }, data: [{ xAxis: f.time }] } }, { name: t('合成观测', 'Synthetic observation'), type: 'scatter', data: c.frames.map(v => [v.time, v.observed[channel]/1000]) }] }} /></section></div>
    <details className="diagnosticPanel"><summary>{t('通道数值与导出', 'Channel values & export')}</summary><div className="diagnosticExports"><button onClick={csv}>CSV</button><button onClick={() => download(`${c.id}-${f.time}s.json`, JSON.stringify({ authority: 'synthetic', source: c.source, runId: c.runId, model: data.model, closure: data.closure, geometry: c.geometry, frame: f, trialDensityScale: scale, ...projected }, null, 2), 'application/json')}>JSON</button><a href={catalog.path} download>{t('完整计算归档', 'Full computed archive')}</a></div><div className="diagnosticTable"><table><thead><tr>{['LOS', t('用途', 'Use'), t('预测', 'Prediction'), t('合成观测', 'Synthetic observation'), 'σ', 'Δ / σ'].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{c.geometry.channels.map((ch, i) => <tr key={ch.id}><th>{ch.id}</th><td>{ch.fit ? t('拟合', 'Fit') : t('留出', 'Held out')}</td><td>{fmt(projected.predicted[i])}</td><td>{fmt(f.observed[i])}</td><td>{fmt(f.sigma[i])}</td><td>{fmt(projected.residual[i])}</td></tr>)}</tbody></table><p>W m⁻² sr⁻¹</p></div></details>
    <details className="diagnosticPanel diagnosticEvidence"><summary>{t('模型、来源与验证范围', 'Model, provenance & verification scope')}</summary><p>{t('这是以模拟结果为输入的软件闭环；合成观测由独立梯形积分加 2% 高斯噪声生成，并注入已知密度倍率 1.12。前向与反演共享发射模型和几何，不能作为实验验证或唯一剖面反演的证据。', 'This software loop starts from simulation results. Synthetic observations use independent trapezoidal integration plus 2% Gaussian noise and a known density scale of 1.12. Forward and inverse calculations share emission physics and geometry; this is neither experimental validation nor proof of unique profile recovery.')}</p><p>{t('假设完全离化氢同位素等离子体，Zeff = 1、Gaunt = 1.2；只计算非相对论自由—自由辐射近似。没有谱线、同步辐射、吸收、有限孔径、CAD 遮挡、探测器响应或标定。灰体积分不是可见光波段预测，也不是总辐射损失。', 'Assumed fully ionised hydrogenic plasma, Zeff = 1 and Gaunt = 1.2; nonrelativistic free-free approximation only. No lines, synchrotron, absorption, finite aperture, CAD occlusion, detector response or calibration. Grey integration is neither a visible-band prediction nor total radiative loss.')}</p><dl><dt>{t('独立积分最大相对差', 'Maximum independent-integration difference')}</dt><dd>{fmt(c.verification.quadratureMaxRelativeError*100)}%</dd><dt>{t('末帧步长减半差', 'Final-frame step-halving difference')}</dt><dd>{fmt(c.verification.stepHalvingRelativeError*100)}%</dd><dt>{t('末帧网格加密差', 'Final-frame grid-refinement difference')}</dt><dd>{fmt(c.verification.gridRefinementRelativeError*100)}% · 129×161 → 257×321</dd><dt>{t('几何与坐标假设', 'Geometry & coordinate assumptions')}</dt><dd>{c.assumptions.join(' · ')}</dd><dt>{t('源运行', 'Source run')}</dt><dd>{c.runId}</dd>{Object.entries(c.source).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}<dt>CHERAB / Raysect</dt><dd>{data.provenance.versions.cherab} / {data.provenance.versions.raysect}</dd></dl><p>{t('源模拟的数值收敛和装置验证尚未确立。原始运行身份、输入与计算脚本哈希随完整归档保留。', 'Numerical convergence and device validation of the source simulations remain unestablished. Run identity and input/worker hashes are retained in the full archive.')}</p></details>
  </>;
}

function FieldView({ c, frame, channel, scale, en }: { c: DiagnosticCase; frame: DiagnosticFrame; channel: number; scale: number; en: boolean }) {
  const g = c.geometry, spanR = g.r.at(-1)!-g.r[0], spanZ = g.z.at(-1)!-g.z[0], s = Math.min(530/spanR, 405/spanZ);
  const left = (650-spanR*s)/2, top = 36+(405-spanZ*s)/2;
  const x = (v: number) => left+(v-g.r[0])*s, y = (v: number) => top+(g.z.at(-1)!-v)*s;
  const maximum = Math.max(...frame.emission), dr = (g.r[1]-g.r[0])*s, dz = (g.z[1]-g.z[0])*s;
  const colorMaximum = useMemo(() => c.frames.reduce((m, f) => Math.max(m, ...f.emission), 0)*1.4**2, [c]);
  return <svg className="diagnosticRz" viewBox="0 0 690 510" role="img" aria-label={en ? 'Free-free emission in R-Z with twelve horizontal synthetic sightlines' : 'R-Z 轫致辐射场与十二条水平合成视线'}><rect width="690" height="510" fill="#0c171c" />
    {frame.emission.map((v, i) => { if (!g.mask[i]) return null; return <rect key={i} x={x(g.r[i%g.r.length])-dr/2} y={y(g.z[Math.floor(i/g.r.length)])-dz/2} width={dr+.2} height={dz+.2} fill={emissionColor(v*scale*scale/colorMaximum)} />; })}
    <polyline points={g.boundary.map(p => `${x(p[0])},${y(p[1])}`).join(' ')} fill="none" stroke="#e3eae8" strokeWidth="1.4" />
    {g.channels.map((ch, i) => <g key={ch.id}><line x1={x(ch.start[0])} y1={y(ch.start[1])} x2={x(ch.end[0])} y2={y(ch.end[1])} stroke={i === channel ? '#ffe08a' : '#9bcee2'} strokeOpacity={i === channel ? 1 : .38} strokeWidth={i === channel ? 2.5 : .8} strokeDasharray={ch.fit ? undefined : '5 4'} /><text x={x(ch.start[0])+10} y={y(ch.start[1])+4} fill={i === channel ? '#ffe08a' : '#b8c5ca'} fontSize="12">{i+1}</text></g>)}
    <circle cx={x(g.axis[0])} cy={y(g.axis[1])} r="3" fill="white" />
    {Array.from({length:64}, (_, i) => <rect key={`color-${i}`} x="621" y={85+(63-i)*4} width="13" height="4.2" fill={emissionColor(i/63)} />)}
    {[0,.25,.5,.75,1].map(v => <text key={`scale-${v}`} x="683" y={345-v*256} textAnchor="end" fill="#b8c5ca" fontSize="12">{fmt(colorMaximum*v/1000,3)}</text>)}
    <text x="649" y="365" textAnchor="middle" fill="#b8c5ca" fontSize="11">kW m⁻³</text>
    {[0,.25,.5,.75,1].map(v => <g key={v}><text x={x(g.r[0]+spanR*v)} y={top+spanZ*s+23} textAnchor="middle" fill="#b8c5ca" fontSize="12">{fmt(g.r[0]+spanR*v,3)}</text><text x={left-12} y={y(g.z[0]+spanZ*v)+4} textAnchor="end" fill="#b8c5ca" fontSize="12">{fmt(g.z[0]+spanZ*v,3)}</text></g>)}
    <text x="325" y="489" fill="#dce6ea" textAnchor="middle" fontSize="14">R / m</text><text transform="translate(20 250) rotate(-90)" fill="#dce6ea" textAnchor="middle" fontSize="14">Z / m</text>
    <text x="28" y="23" fill="#dce6ea" fontSize="13">εff: 0 — {fmt(maximum*scale*scale/1000)} kW m⁻³</text><text x="660" y="489" textAnchor="end" fill="#b8c5ca" fontSize="12">SYNTHETIC · 65 × 81</text>
  </svg>;
}
