'use client';
import { useEffect, useState } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import { useChartTheme } from '../components/charts/chart-theme';
import type { SimulationRun } from './contract';
import { loadInnerHistory, type DiagnosticsBundle, type InnerIteration } from './diagnostics';
import bundles from './data/diagnostics-bundles.json';
import { downloadJson } from './SimulationPanels';
export default function StationaryDiagnostics({ run, en, trusted }: { run: SimulationRun; en: boolean; trusted: boolean }) {
  const theme = useChartTheme(); const [iteration, setIteration] = useState(1);
  const [state, setState] = useState<{ id: string; rows?: InnerIteration[]; error?: boolean }>({ id: '' }); const [retry, setRetry] = useState(0);
  const bundle = trusted ? (bundles as DiagnosticsBundle[]).find(b => b.runId === run.id && b.recordSha256 === run.source.recordSha256 && run.source.artifacts.some(a => a.name === 'inner-history.json' && a.sha256 === b.rawSha256)) : undefined;
  useEffect(() => { const c = new AbortController(); if (bundle) void loadInnerHistory(bundle, c.signal).then(rows => { if (!c.signal.aborted) setState({ id: bundle.runId, rows }); }).catch(() => { if (!c.signal.aborted) setState({ id: bundle.runId, error: true }); }); return () => c.abort(); }, [bundle, retry]);
  if (!bundle) return null;
  const rows = state.id === run.id ? state.rows : undefined;
  if (!rows) return <section className="simPanel" role="status"><p>{state.error ? (en ? 'Per-iteration history verification failed.' : '逐轮历史校验失败。') : (en ? 'Verifying per-iteration history…' : '正在校验逐轮历史…')}</p>{state.error && <button className="simButton" onClick={() => setRetry(v => v + 1)}>{en ? 'Retry' : '重试'}</button>}</section>;
  const row = rows[iteration - 1];
  return <section className="simPanel simTransport"><div className="simPanelTitle"><h3>{en ? 'Every coupled iteration: inner solver history' : '耦合流程：逐轮内层求解历史'}</h3><button className="simButton" onClick={() => downloadJson(rows, `${run.id}-inner-history.json`)}>JSON ↓</button></div><div className="simExplorerControls"><label>{en ? 'Outer iteration' : '外层轮次'}<select value={iteration} onChange={e => setIteration(Number(e.target.value))}>{rows.map(r => <option key={r.iteration} value={r.iteration}>{r.iteration}</option>)}</select></label><span>{row.evaluationResiduals.length} {en ? 'function evaluations' : '次函数评估'} · {en ? 'selected residual' : '选定解残差'} {row.selectedResidual.toPrecision(8)}</span></div><ScientificChart id={`outer-inner-${run.id}`} eager height={290} ariaLabel={en ? 'Per-iteration function evaluation residuals' : '逐轮函数评估残差'} fallbackSrc="" fallbackAlt="" fallback={<p>{en ? 'Exact histories are in the JSON download.' : 'JSON 下载保留各轮精确历史。'}</p>} option={{ animation: false, tooltip: { trigger: 'axis' }, grid: { left: 75, right: 25, top: 35, bottom: 48 }, xAxis: { type: 'value', name: en ? 'Function evaluation index' : '函数评估序号', nameLocation: 'middle', nameGap: 28 }, yAxis: { type: 'log', name: en ? 'Residual norm' : '残差范数' }, series: [{ type: 'line', showSymbol: false, connectNulls: false, lineStyle: { color: theme.accent, width: 2 }, data: row.evaluationResiduals.map((v, i) => [i + 1, v === 0 ? null : v]) }] }}/><p className="simChartNote">{en ? 'Each inner history precedes that iteration’s current/equilibrium update. These norms are not outer profile-change errors or an experimental accuracy metric. Zero values are omitted only on the logarithmic plot; no termination reason is inferred.' : '每轮内层历史发生在该轮电流/平衡更新之前。此范数不是外层剖面变化误差，也不是实验精度指标；对数图仅省略零值，不推断原生终止原因。'}</p></section>;
}
