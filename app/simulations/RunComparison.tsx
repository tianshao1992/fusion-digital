'use client';
import { useState } from 'react';
import { compareRuns } from './comparison';
import { formatMetric, metricLabels, type SimulationRun } from './contract';

export default function RunComparison({ run, runs, en }: { run: SimulationRun; runs: SimulationRun[]; en: boolean }) {
  const text = (zh: string, english: string) => en ? english : zh;
  const [referenceId, setReferenceId] = useState('');
  const candidates = runs.filter(r => r.id !== run.id && r.caseId === run.caseId && r.resultProfile === run.resultProfile);
  const reference = candidates.find(r => r.id === referenceId) ?? candidates[0];
  const rows = reference ? compareRuns(run, reference) : [];
  const display = (value: number | undefined) => value === undefined ? '—' : formatMetric(value);
  return <div className="simPanel"><div className="simPanelTitle"><h3>{text('结果对照', 'Result comparison')}</h3><span>{text('描述性差异', 'Descriptive differences')}</span></div><div className="simPanelBody">
    <p className="simNotice">{text('仅比较同一结果 profile、同类算例的数值。尚未核验输入、求解配置及模型版本是否等价；差异不表示精度提升或装置验证通过。', 'Compares values from the same profile and case type. Equivalent inputs, solver settings and model revisions have not been verified. Differences do not imply improved accuracy or device validation.')}</p>
    {!reference ? <p className="simMuted">{text('请先导入另一份同类算例结果。FPP 与 DIII-D 不进行跨工况直接对照。', 'Import another result of this case type first. FPP and DIII-D are not compared directly across scenarios.')}</p> : <>
      <label className="simField">{text('选择参考结果', 'Reference result')}<select value={reference.id} onChange={e => setReferenceId(e.target.value)}>{candidates.map(r => <option key={r.id} value={r.id}>{r.id} · {r.engine.id} {r.engine.version}</option>)}</select></label>
      <dl className="simDefinitionList"><div><dt>{text('当前结果', 'Current result')}</dt><dd><code>{run.id}</code></dd></div><div><dt>{text('参考结果', 'Reference result')}</dt><dd><code>{reference.id}</code></dd></div></dl>
      <p className="simMuted">{text('差值 = 当前 − 参考；相对差异以参考绝对值为分母。参考为零或指标缺失时用 — 标示。', 'Delta = current − reference; relative difference uses the absolute reference as denominator. Zero references or missing quantities are marked —.')}</p>
      <div className="simTableScroll"><table className="simTable"><thead><tr><th>{text('物理量 / 单位', 'Quantity / unit')}</th><th>{text('当前', 'Current')}</th><th>{text('参考', 'Reference')}</th><th>Δ</th><th>Δ %</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{metricLabels[row.id]?.[en ? 'en' : 'zh'] ?? row.id}<small>{row.unit}</small></td><td>{display(row.current)}</td><td>{display(row.reference)}</td><td>{display(row.delta)}</td><td>{display(row.percent)}</td></tr>)}</tbody></table></div>
      {rows.length === 0 && <p>{text('两份结果均未提供可比较指标。', 'Neither result provides comparable quantities.')}</p>}
    </>}
  </div></div>;
}
