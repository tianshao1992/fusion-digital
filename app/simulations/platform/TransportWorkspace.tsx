'use client';
import { useEffect, useState } from 'react';
import ScientificChart from '../../components/charts/ScientificChart';
import { loadScientificJson } from '../physics';
import published from '../data/transport-runs.json';
import { recipes, getRecipe } from './catalog';
import { canCompare, parseTransportResult, type TransportRunEntry, type TransportResult } from './contracts';
import { displayUnit, download, label, number, profileAtTime } from './display';
import RunConfiguration from './RunConfiguration';
import TransportFields from './TransportFields';
import type { TransportGeometry } from './geometry';
import { createComparisonRecord } from './comparison';

const entries = published as TransportRunEntry[];
async function loadEntry(entry: TransportRunEntry, signal: AbortSignal) {
  const r = parseTransportResult(await loadScientificJson(entry.artifact, signal));
  if (r.id !== entry.id || r.recipe !== entry.recipe || r.device !== entry.device || r.comparisonGroup !== entry.comparisonGroup || r.engine.id !== entry.engineId) throw new Error('RESULT_IDENTITY');
  return r;
}
export default function TransportWorkspace({ en, onFuse }: { en: boolean; onFuse: () => void }) {
  const [recipeId, setRecipe] = useState('iter-hybrid');
  const t = (zh: string, english: string) => en ? english : zh;
  const recipe = getRecipe(recipeId), entry = entries.find(e => e.recipe === recipeId);
  return <main className="transportStudio"><header className="transportHeading"><div><p className="transportEyebrow">TRANSPORT & PULSE EVOLUTION</p><h1>TORAX <span>{t('输运工作台', 'Transport studio')}</span></h1><p>{t('探索径向剖面、脉冲演化与跨引擎输入。', 'Explore radial profiles, pulse evolution and connected engine inputs.')}</p></div><div className="transportIdentity"><span className="transportBadge">SIMULATED</span><span>v1.4.3 · JAX · CPU / float64</span></div></header>
    <div className="transportLayout"><aside className="transportRecipes" aria-label={t('算例库', 'Case library')}><div className="transportRailTitle"><h2>{t('算例库', 'Case library')}</h2><span>{entries.length}/{recipes.length}</span></div>{(['upstream', 'derived', 'coupled'] as const).map(origin => <section key={origin}><h3>{origin === 'upstream' ? t('官方场景', 'Official scenarios') : origin === 'derived' ? t('参数与网格研究', 'Parameter & grid studies') : t('跨引擎联动', 'Connected engines')}</h3>{recipes.filter(r => r.origin === origin).map(r => <button key={r.id} aria-pressed={r.id === recipeId} onClick={() => setRecipe(r.id)}><span>{en ? r.en : r.zh}</span><small>{r.device} · {r.defaults.duration} s · {r.defaults.radialCells} {t('单元', 'cells')}</small><em>{entries.some(e => e.recipe === r.id) ? t('已计算', 'Computed') : t('待计算', 'Not computed')}</em></button>)}</section>)}</aside>
    <section className="transportContent"><div className="transportCaseHeading"><div><h2>{en ? recipe.en : recipe.zh}</h2><p>{en ? recipe.descriptionEn : recipe.descriptionZh}</p></div><span className="transportTag">{recipe.model}</span></div>{entry ? <ResultView key={entry.id} entry={entry} en={en} onFuse={onFuse} /> : <div className="transportPanel"><p>{t('此配置尚无已验证的运行结果。完成本地执行和导入后即可浏览。', 'No verified run is available for this configuration. Execute and import it locally to explore results.')}</p></div>}</section></div>
  </main>;
}
function ResultView({ entry, en, onFuse }: { entry: TransportRunEntry; en: boolean; onFuse: () => void }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const [result, setResult] = useState<TransportResult | null>(null), [error, setError] = useState('');
  const [liveGeometry, setLiveGeometry] = useState<{ data: TransportGeometry; sha256: string } | null>(null);
  const [tab, setTab] = useState('results'), [timeIndex, setTime] = useState(entry.steps), [playing, setPlaying] = useState(false);
  const [variable, setVariable] = useState('te'), [scalar, setScalar] = useState('fusion_power');
  const [compareId, setCompareId] = useState(''), [comparison, setComparison] = useState<TransportResult | null>(null), [comparisonError, setComparisonError] = useState('');
  useEffect(() => { const abort = new AbortController(); loadEntry(entry, abort.signal).then(setResult).catch(e => { if (!abort.signal.aborted) setError(String(e.message)); }); return () => abort.abort(); }, [entry]);
  useEffect(() => {
    if (!playing || !result) return;
    const interval = setInterval(() => setTime(i => (i + 1) % result.time.values.length), 500);
    return () => clearInterval(interval);
  }, [playing, result]);
  useEffect(() => {
    if (!compareId) return;
    const abort = new AbortController(), e = entries.find(e => e.id === compareId)!;
    loadEntry(e, abort.signal).then(setComparison).catch(e => { if (!abort.signal.aborted) setComparisonError(String(e.message)); });
    return () => abort.abort();
  }, [compareId]);
  const time = result?.time.values[timeIndex] ?? entry.duration;
  const metricIds = ['fusion_power', 'fusion_gain', 'plasma_current', 'thermal_energy'];
  const profile = result?.profiles.find(p => p.id === variable), axis = result?.axes.find(a => a.id === profile?.axisId);
  const [scale, unit] = displayUnit(profile?.unit ?? 'eV');
  const trace = result?.scalars.find(s => s.id === scalar), [traceScale, traceUnit] = displayUnit(trace?.unit ?? 'W');
  const compatible = entries.filter(e => e.id !== entry.id && canCompare(e, entry));
  const lines = profile && axis ? [{ name: `${t('当前', 'Current')} · ${number(time)} s`, data: axis.values.map((x, i) => [x, profile.values[timeIndex][i] === null ? null : profile.values[timeIndex][i]! * scale]) }, { name: `${t('初始', 'Initial')} · ${result!.time.values[0]} s`, data: axis.values.map((x, i) => [x, profile.values[0][i] === null ? null : profile.values[0][i]! * scale]) }] : [];
  if (comparison && compareId === comparison.id && result && canCompare(result, comparison)) {
    const p = profileAtTime(comparison, variable, time);
    if (p && p.unit === profile?.unit) lines.push({ name: `${en ? getRecipe(comparison.recipe).en : getRecipe(comparison.recipe).zh} · ${number(time)} s`, data: p.x.map((x, i) => [x, p.y[i] === null ? null : p.y[i]! * scale]) });
  }
  const reference = result?.referenceProfiles?.profiles.find(p => p.id === variable);
  if (reference) lines.push({ name: t('FUSE 输入参考', 'FUSE input reference'), data: result!.referenceProfiles!.rho.map((x, i) => [x, reference.values[i] * scale]) });
  const base = { animation: false, grid: { left: 74, right: 24, top: 60, bottom: 48 }, tooltip: { trigger: 'axis' }, legend: { top: 2, type: 'scroll' } };
  function csv() {
    if (!result || !profile || !axis) return;
    download(`${result.id}-${variable}-${time}s.csv`, `time_s,rho_tor_norm,${variable}_${profile.unit}\n` + axis.values.map((x, i) => `${time},${x},${profile.values[timeIndex][i] ?? ''}`).join('\n'), 'text/csv');
  }
  return <><details className="transportRunMeta"><summary>{t('当前运行', 'Current run')} · {result?.parameters.radialCells ?? entry.radialCells} {t('单元', 'cells')} · {result?.parameters.duration ?? entry.duration} s</summary><code>{result?.id ?? entry.id}</code></details><div className="transportMetrics">{metricIds.map(id => {
    const m = entry.metrics.find(m => m.id === id), live = result?.scalars.find(s => s.id === id), [factor, display] = displayUnit(m?.unit ?? '1');
    const v = live ? live.values[timeIndex] : m?.value;
    return <div key={id}><span>{label(id, en)}</span><strong>{number(v == null ? null : v * factor)} <small>{display}</small></strong><small>t = {number(time)} s</small></div>;
  })}</div><nav className="transportTabs" aria-label={t('运行视图', 'Run views')}>{[['results', t('结果探索', 'Explore results')], ['configure', t('配置与运行', 'Configure & run')], ['data', t('数据与导出', 'Data & export')], ['evidence', t('来源与验证', 'Provenance & checks')]].map(([id, name]) => <button key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setPlaying(false); }}>{name}</button>)}</nav>
    {error ? <div role="alert" className="transportPanel">{t('结果加载或完整性校验失败', 'Result loading or integrity check failed')}: {error}</div> : !result ? <div className="transportPanel" role="status">{t('正在验证并读取结果…', 'Verifying and loading results…')}</div> : <>
      {tab === 'results' && <><section className="transportPanel"><div className="transportPlayback"><button className="transportButton" onClick={() => setPlaying(!playing)} aria-pressed={playing}>{playing ? t('暂停', 'Pause') : t('播放', 'Play')}</button><label htmlFor="transport-time">{t('模拟时间', 'Simulation time')} <strong>{number(time)} s</strong></label><input id="transport-time" aria-label={t('模拟时间步', 'Simulation time step')} type="range" min={0} max={result.time.values.length - 1} value={timeIndex} onChange={e => { setTime(Number(e.target.value)); setPlaying(false); }} /><span>{timeIndex}/{result.execution.steps} {t('步', 'steps')}</span></div></section><TransportFields key={result.id} liveGeometry={liveGeometry?.data} liveGeometrySha256={liveGeometry?.sha256} result={result} timeIndex={timeIndex} en={en} onTime={i => { setTime(i); setPlaying(false); }} /><section className="transportPanel"><div className="transportControls"><label>{t('剖面量', 'Profile')}<select value={variable} onChange={e => setVariable(e.target.value)}>{result.profiles.map(p => <option key={p.id} value={p.id}>{label(p.id, en)}</option>)}</select></label><label>{t('兼容算例对比', 'Compatible comparison')}<select value={compareId} onChange={e => { setCompareId(e.target.value); setComparison(null); setComparisonError(''); }}><option value="">{t('仅当前算例', 'Current case only')}</option>{compatible.map(e => <option key={e.id} value={e.id}>{en ? getRecipe(e.recipe).en : getRecipe(e.recipe).zh}</option>)}</select></label></div>{comparisonError && <p role="alert">{comparisonError}</p>}{comparison && compareId === comparison.id && time >= comparison.time.values[0] && time <= comparison.time.values.at(-1)! && <button className="transportButton" onClick={() => download('comparison-record.json', JSON.stringify(createComparisonRecord(result, comparison, time), null, 2))}>{t('导出对比记录', 'Export comparison record')}</button>}
      <ScientificChart id={`transport-profile-${entry.id}`} ariaLabel={label(variable, en)} fallbackSrc="" fallbackAlt="" height={380} eager option={{ ...base, xAxis: { type: 'value', name: 'ρtor,norm', min: 0, max: 1, nameLocation: 'middle', nameGap: 30 }, yAxis: { type: 'value', name: `${label(variable, en)} (${unit})` }, series: lines.map((line, i) => ({ ...line, type: 'line', showSymbol: false, connectNulls: false, lineStyle: { width: i === 0 ? 3 : 1.8, type: i === 1 ? 'dashed' : 'solid' } })) }} fallback={<p>{t('交互图加载期间，可在数据页查看和下载全部数值。', 'While the chart loads, all values remain available under Data & export.')}</p>} />
      <p className="transportNote">{t('原生径向网格；对比曲线在同一模拟时间线性插值，超出时间范围不外推。网格加密仅用于敏感性观察。', 'Native radial grids. Comparison curves use linear interpolation at the same simulation time, without extrapolation. Grid refinement illustrates sensitivity only.')}</p></section>
      <section className="transportPanel"><div className="transportControls"><h3>{t('时序演化', 'Time evolution')}</h3><label>{t('全局量', 'Global quantity')}<select value={scalar} onChange={e => setScalar(e.target.value)}>{result.scalars.map(s => <option key={s.id} value={s.id}>{label(s.id, en)}</option>)}</select></label></div><ScientificChart id={`transport-trace-${entry.id}`} ariaLabel={label(scalar, en)} fallbackSrc="" fallbackAlt="" height={300} eager option={{ ...base, xAxis: { type: 'value', name: t('时间 (s)', 'Time (s)'), nameLocation: 'middle', nameGap: 28 }, yAxis: { type: 'value', name: traceUnit }, series: [{ name: label(scalar, en), type: 'line', showSymbol: false, connectNulls: false, data: result.time.values.map((v, i) => [v, trace?.values[i] == null ? null : trace.values[i]! * traceScale]), markLine: { symbol: 'none', data: [{ xAxis: time }], label: { show: false } } }] }} fallback={<p>{t('完整时序包含于结果 JSON。', 'The full time series is included in the result JSON.')}</p>} /></section>{result.lineage && <section className="transportPanel"><h3>FUSE → TORAX</h3><p>{t('剖面已实际传入并核验初始单元值。仅 Te/Ti/ne；圆截面几何、简化源项与固定密度假设见来源页。', 'Profiles were actually transferred and initial cell values checked. Te/Ti/ne only; see provenance for circular geometry, simplified sources and fixed density.')}</p><button className="transportButton" onClick={onFuse}>{t('查看 FUSE 工作台', 'Open FUSE workbench')}</button><code className="transportHash">{result.lineage.sourceRunId}</code></section>}</>}
      <div hidden={tab !== 'configure'}><RunConfiguration key={entry.id} result={result} en={en} onCollected={(r, g, sha256) => { setResult(r); setLiveGeometry(g && sha256 ? { data: g, sha256 } : null); setTime(r.execution.steps); setPlaying(false); setTab('results'); }} /></div>
      {tab === 'data' && <section className="transportPanel"><h3>{t('变量数据', 'Variable data')}</h3><div className="transportControls"><label>{t('剖面量', 'Profile')}<select value={variable} onChange={e => setVariable(e.target.value)}>{result.profiles.map(p => <option key={p.id} value={p.id}>{label(p.id, en)}</option>)}</select></label><span>t = {number(time)} s</span><button className="transportButton" onClick={csv}>{t('导出当前剖面 CSV', 'Export current profile CSV')}</button><button className="transportButton" onClick={() => download(`${result.id}.json`, JSON.stringify(result, null, 2))}>{t('完整结果 JSON', 'Full result JSON')}</button></div><p>{t('CSV 与 JSON 保留标准契约原单位（温度为 eV）；图表按 keV、MW 等展示。缺失值保留为空。', 'CSV and JSON retain contract units (temperature in eV); charts display keV, MW and similar units. Missing values remain empty.')}</p><div className="transportTableScroll"><table className="transportTable"><thead><tr><th>ρtor,norm</th><th>{label(variable, en)} ({profile?.unit})</th></tr></thead><tbody>{axis?.values.map((x, i) => <tr key={i}><td>{number(x)}</td><td>{number(profile!.values[timeIndex][i])}</td></tr>)}</tbody></table></div></section>}
      {tab === 'evidence' && <section className="transportPanel"><h3>{t('运行与数据证据', 'Execution & data evidence')}</h3><div className="transportCheckGrid"><div><strong>{t('执行成功', 'Execution succeeded')}</strong><span>sim_error = 0 · {result.execution.steps} {t('步', 'steps')}</span></div><div><strong>{t('数据检查通过', 'Data checks passed')}</strong><span>{t('有限值、正值、完整时间范围', 'Finite values, positivity, complete time range')}</span></div><div><strong>{t('收敛资格未确立', 'Convergence not established')}</strong><span>{t('尚非完整网格/时间收敛研究', 'Not a full grid/time convergence study')}</span></div><div><strong>{t('装置验证未确立', 'Device validation not established')}</strong><span>{t('没有实验精度声明', 'No experimental accuracy claim')}</span></div></div><dl className="transportProvenance"><dt>Run ID</dt><dd>{result.id}</dd><dt>Engine commit</dt><dd>{result.engine.commit}</dd><dt>{t('求解耗时', 'Solver wall time')}</dt><dd>{number(result.execution.elapsedSeconds)} s</dd>{Object.entries(result.provenance).filter(([key]) => key !== 'scientificAssets').map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl><h3>{t('物理与映射边界', 'Physics & mapping scope')}</h3><ul>{result.limitations.map(l => <li key={l}>{l}</li>)}</ul>{result.lineage && <><h3>{t('输入血缘', 'Input lineage')}</h3><dl className="transportProvenance">{Object.entries(result.lineage).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl></>}</section>}
    </>}</>;
}
