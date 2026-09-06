'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import { useI18n } from '../i18n';
import sourceRuns from './data/fuse-demo.json';
import { createDraft, formatMetric, metricLabels, parseSimulationRun } from './contract';
import SimulationPanels, { downloadJson, useLocalizedNotice, type StudioTab } from './SimulationPanels';
import RunEvidence from './RunEvidence';
import PhysicsWorkbench from './PhysicsWorkbench';
import EngineWorkspace from './EngineWorkspace';

export default function SimulationStudio() {
  const { locale } = useI18n(); const en = locale === 'en';
  const text = (zh: string, english: string) => en ? english : zh;
  const [runs, setRuns] = useState(() => sourceRuns.map(parseSimulationRun));
  const [tab, setTab] = useState<StudioTab>('overview');
  const [notice, setNotice] = useLocalizedNotice(en);
  const [draft, setDraft] = useState(() => createDraft('FPP study 01'));
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [logScale, setLogScale] = useState(true);
  const importRef = useRef<HTMLInputElement>(null);
  const importBusyRef = useRef(false);
  const [importing, setImporting] = useState(false);
  const [selectedId, setSelectedId] = useState(runs[0].id);
  const [domain, setDomain] = useState<'physics' | 'engineering'>('physics');
  const run = runs.find(r => r.id === selectedId) ?? runs[0];
  const fpp = run.caseId === 'fpp-stationary';
  const stationary = run.convergence.kind === 'iterations';
  const chartOption = !fpp && run.traces?.length ? {
    animation: false, grid: { left: 65, right: 25, top: 55, bottom: 50 }, tooltip: { trigger: 'axis' }, legend: { top: 8 },
    xAxis: { type: 'value', name: text('函数调用次数', 'Function calls'), nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: logScale ? 'log' : 'value', name: text('日志记录残差', 'Logged residual') },
    series: run.traces.map(t => ({ name: t.model, type: 'line', showSymbol: false, connectNulls: false, data: t.observations.map(p => [p.calls, logScale && p.residual === 0 ? null : p.residual]), lineStyle: { width: 2 } })),
  } : {
    animation: false, grid: { left: 60, right: 25, top: 30, bottom: 45 }, tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: run.convergence.labels, name: stationary ? text('迭代', 'Iteration') : text('代理模型', 'Surrogate'), nameLocation: 'middle', nameGap: 28 },
    yAxis: { type: 'value', name: text('误差 / 残差', 'Error / residual'), min: 0 },
    series: [{ name: text('报告值', 'Reported value'), type: stationary ? 'line' : 'bar', data: run.convergence.values, symbolSize: 9, barMaxWidth: 55, lineStyle: { width: 3 } }, ...(run.convergence.threshold === null ? [] : [{ name: text('配置阈值', 'Configured threshold'), type: 'line', data: run.convergence.labels.map(() => run.convergence.threshold), symbol: 'none', lineStyle: { type: 'dashed', width: 1.5 } }])],
  };
  async function importResult(file: File | undefined) {
    if (!file || importBusyRef.current) return;
    if (runs.length >= 32) { setNotice(text('当前会话最多保留 32 份结果，请导出需要保留的结果后刷新页面。', 'This session holds up to 32 results. Export records you want to keep before refreshing.')); if (importRef.current) importRef.current.value = ''; return; }
    importBusyRef.current = true; setImporting(true);
    try {
      if (file.size > 512 * 1024) throw new Error('FILE_TOO_LARGE');
      const candidate = parseSimulationRun(JSON.parse(await file.text()));
      if (runs.some(r => r.id === candidate.id || r.source.recordSha256 === candidate.source.recordSha256)) { setNotice(text('该结果已存在，未覆盖归档记录。', 'This result already exists; the archive was not overwritten.')); return; }
      setRuns(current => [...current, candidate]); setImportedIds(current => [...current, candidate.id]); setSelectedId(candidate.id); setDomain('physics'); setTab('overview');
      setNotice(text('已导入到本次浏览器会话。结构检查通过；原始制品与来源尚未独立核验。', 'Imported into this browser session. Structure checked; source artifacts have not been independently verified.'));
    } catch { setNotice(text('导入失败：请选择不超过 512 KB 的 simulation-result.v1 安全结果包；不接受原始日志或 IMAS 文件。', 'Import failed: choose a simulation-result.v1 safe result package under 512 KB, not raw logs or IMAS files.')); }
    finally { importBusyRef.current = false; setImporting(false); if (importRef.current) importRef.current.value = ''; }
  }
  return <main className="simStudio">
    <header className="simHeading"><div><p className="simEyebrow">FUSIONDIGITAL / SIMULATION STUDIO</p><h1>{text('仿真模拟', 'Simulations')}<span>FUSE</span></h1><p>{text('从计算工况，到可追溯的物理与工程结果。', 'From a defined scenario to traceable physics and engineering results.')}</p></div><div className="simWorkspaceActions"><span>{text('结果回放与研究准备', 'Result replay & study preparation')}</span><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={e => void importResult(e.target.files?.[0])} /><button className="simButton" disabled={importing} onClick={() => importRef.current?.click()}>{importing ? text('校验中…', 'Validating…') : text('导入结果', 'Import result')}</button><button hidden={domain !== 'physics'} className="simButton" onClick={() => downloadJson(run, `${run.id}.json`)}>{text('导出结果', 'Export result')}</button><button hidden={domain !== 'physics'} className="simButton simButtonPrimary" onClick={() => { setTab('engine'); setDomain('physics'); }}>{text('配置研究', 'Configure study')} ↗</button></div></header>
    <div className="simDomainBar" role="group" aria-label={text('仿真领域', 'Simulation domain')}><button aria-pressed={domain === 'physics'} onClick={() => setDomain('physics')}><span>01</span>{text('物理模拟', 'Physics')}</button><button aria-pressed={domain === 'engineering'} onClick={() => setDomain('engineering')}><span>02</span>{text('工程仿真', 'Engineering')}</button><p>{text('集成设计工作台', 'Integrated design workspace')}</p><Link href={domain === 'physics' ? '/physics' : '/engineering'}>{text('领域知识', 'Domain knowledge')} ↗</Link></div>
    <p className="simFeedback" role="status" aria-live="polite">{notice}</p>
    <div className="simCaseSwitcher"><label>{text('计算工况', 'Run')}<select aria-label={text('选择计算结果', 'Select simulation result')} value={run.id} onChange={e=>{setSelectedId(e.target.value);setTab('overview');}}>{runs.map(item=><option value={item.id} key={item.id}>{item.caseId==='fpp-stationary'?'FPP':item.caseId==='diiid-stationary'?'DIII-D · coupled':`DIII-D · ${item.convergence.labels.join('/')}`} · {item.id} {importedIds.includes(item.id)?text('· 来源待核验','· unverified'):''}</option>)}</select></label><span>{run.engine.id} {run.engine.version} · {run.engine.runtime.name} {run.engine.runtime.version}</span><span>SIMULATED · {text('装置资格：未验证','Device: Not validated')}</span></div>
    <div className="simGrid">
      <section className="simCanvas" aria-label={text('计算结果', 'Simulation results')}>
        {domain === 'engineering' ? <PhysicsWorkbench run={run} en={en} engineering trusted={!importedIds.includes(run.id)} /> : <>
        <div className="simTabs" role="group" aria-label={text('工作台视图', 'Workspace view')}>{([['overview', '结果概览', 'Overview'], ['engine', '计算引擎', 'Engine'], ['parameters', '设计草稿', 'Design draft'], ['data', '数据与输出', 'Outputs'], ['comparison', '结果对照', 'Compare'], ['provenance', '版本与证据', 'Evidence'], ['guide', '运行指引', 'Run guide']] as const).map(([key, zh, english]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{text(zh, english)}</button>)}</div>
        {importedIds.includes(run.id) && <p className="simNotice">{text('导入结果的来源待核验；下方展示该文件声明的执行与评估信息。', 'Imported source not verified; execution and assessment below are claims from the supplied record.')}</p>}
        {tab === 'engine' ? <EngineWorkspace en={en}/> : tab !== 'overview' ? <SimulationPanels tab={tab} run={run} runs={runs} en={en} draft={draft} setDraft={setDraft} /> : <>
        <div className="simMetrics">{stationary && !run.metrics.length ? <div><span>{text('指标未提供', 'Metrics unavailable')}</span><strong>—</strong></div> : run.metrics.length ? run.metrics.slice(0, 6).map(metric => <div key={metric.id}><span>{metricLabels[metric.id]?.[en ? 'en' : 'zh'] ?? metric.id}</span><strong>{formatMetric(metric.value)}<small>{metric.unit === '1' ? (metric.id === 'fusion_gain_Q' ? 'Q' : '') : metric.unit}</small></strong></div>) : run.convergence.labels.map((label, i) => <div key={label}><span>{label}</span><strong>{run.convergence.values[i].toExponential(2)}</strong><small>{run.convergence.calls?.[i] ?? '—'} {text('次调用', 'calls')}</small></div>)}</div>
        <PhysicsWorkbench run={run} en={en} trusted={!importedIds.includes(run.id)} />
        <div className="simPanel simConvergence"><div className="simPanelTitle"><h3>{text('收敛与数值诊断', 'Convergence & diagnostics')}</h3><span className={run.assessment === 'passed-demo-criterion' ? 'simGood' : 'simWarning'}>{run.assessment === 'passed-demo-criterion' ? text('达到示例阈值', 'Demo criterion met') : text('严格收敛未确立', 'Strict convergence not established')}</span></div>{!fpp && run.traces?.length ? <div className="simChartControls"><span>{text('日志观测采样 · 可点击图例切换曲线', 'Logged observations · toggle curves in the legend')}</span><label><input type="checkbox" checked={logScale} onChange={e => setLogScale(e.target.checked)} />{text('对数坐标', 'Log scale')}</label></div> : null}<ScientificChart key={run.id} id={`sim-${run.id}`} option={chartOption} height={310} eager ariaLabel={text('运行记录报告的收敛数据', 'Convergence values reported by the run record')} fallbackSrc="" fallbackAlt="" keepFallbackAccessible fallback={<table className="simTable"><thead><tr><th>{text('迭代 / 模型', 'Iteration / model')}</th><th>{text('报告值', 'Reported value')}</th><th>{text('配置阈值', 'Threshold')}</th></tr></thead><tbody>{run.convergence.labels.map((label, i) => <tr key={label}><td>{label}</td><td>{run.convergence.values[i]}</td><td>{run.convergence.threshold ?? '—'}</td></tr>)}</tbody></table>} /><p className="simChartNote">{stationary ? text(`${run.convergence.values.length} 个报告迭代点；虚线为 ${run.convergence.threshold} 示例阈值，不代表装置精度。`, `${run.convergence.values.length} reported iterations; the dashed line is the ${run.convergence.threshold} demo criterion, not device accuracy.`) : run.traces?.length ? text('横轴是函数调用次数，不是物理时间；没有已确认的残差收敛阈值。对数视图不绘制零值。', 'The horizontal axis is function calls, not physical time; no residual convergence criterion is established. Zero values are omitted on the log axis.') : run.resultProfile==='fuse-physics-run.v1' ? text('此处为选定解摘要；完整函数评估历史见上方。残差阈值未确立。', 'Selected-solution summary; full evaluation history is shown above. No residual criterion is established.') : text('按模型展示最终残差摘要；未提供过程曲线，没有已确认的残差收敛阈值。', 'Final residuals by model; no progress traces or established residual convergence criterion are available.')}</p></div>
        <div className="simScopeNote"><strong>{text('结果适用范围', 'Scope of these results')}</strong><p>{importedIds.includes(run.id) ? text('此导入文件的模型配置、输入工况及适用域未独立核验，不能继承内置示例的资格。', 'The imported model configuration, inputs and applicability are unverified; bundled-example qualifications do not transfer.') : fpp ? text('稳态设计点示例，核心输运模型为 none。尚无 EXL-50U 验证；已导出内容以此运行的数据覆盖清单为准，未求解工程网格响应。', 'Stationary design-point demo with core transport set to none. No EXL-50U validation. Exported fields follow this run’s coverage inventory; engineering mesh responses are not solved.') : text('DIII-D 离线算例的模型输出；输入参考、固定平衡与耦合预测分别标注。不是实时诊断或全尺度湍流求解。', 'DIII-D offline model outputs with explicit input-reference and equilibrium provenance; neither live diagnostics nor full-scale turbulence solutions.')}</p></div>
        </>}
        </>}
      </section>
      {tab === 'provenance' && <RunEvidence run={run} imported={importedIds.includes(run.id)} engineering={domain === 'engineering'} en={en} />}
    </div>
  </main>;
}
