'use client';
import { useEffect, useRef, useState } from 'react';
import ScientificChart from '../../components/charts/ScientificChart';
import { loadScientificJson } from '../physics';
import { download, number } from '../platform/display';
import { bindControlExample, type ControlExample, type ControlExampleEntry } from './examples';
import fieldCatalog from '../data/control-equilibria.json';
import type { ControlEquilibriumEntry } from './equilibrium';
import ControlEquilibriumView from './ControlEquilibriumView';

const names: Record<string, [string, string]> = {
  ip: ['等离子体电流', 'Plasma current'], r: ['径向位置 R', 'Radial position R'], z: ['垂直位置 Z', 'Vertical position Z'],
  r_min: ['内侧半径', 'Inner radius'], r_max: ['外侧半径', 'Outer radius'], kappa: ['伸长比', 'Elongation'], failure: ['模型失败标记', 'Model failure flag'],
};
function display(unit: string, en: boolean): [number, string] { return unit === 'A' ? [.001, 'kA'] : [1, unit === 'code-unit' ? en ? 'native unit (unverified)' : '原生单位（未核实）' : unit]; }

export default function ControlExampleView({ entry, en, active }: { entry: ControlExampleEntry; en: boolean; active: boolean }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const label = (id: string) => names[id]?.[en ? 1 : 0] ?? id;
  const fieldEntry = (fieldCatalog as ControlEquilibriumEntry[]).find(f => f.engineId === entry.engineId && (f.exampleId === entry.id || f.exampleId === null));
  const limitationText = (l: ControlExample['limitations'][number]) => fieldEntry && l.code === 'flux-unit-unverified' ? t('旧标量投影未包含 Fx；本版在独立校验的场工件中展示原生 Fx，仍不声明物理单位、ψN 或 TORAX 资格。', 'The earlier scalar projection omitted Fx. A separately verified field artifact now displays native Fx, without claiming physical units, ψN or TORAX qualification.') : en ? l.en : l.zh;
  const boundaryElement = useRef<HTMLDivElement>(null), [boundaryWidth, setBoundaryWidth] = useState(360);
  const [data, setData] = useState<ControlExample | null>(null), [error, setError] = useState('');
  useEffect(() => {
    if (!boundaryElement.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(items => setBoundaryWidth(items[0].contentRect.width));
    observer.observe(boundaryElement.current);
    return () => observer.disconnect();
  }, [active, data]);
  const [index, setIndex] = useState(0), [playing, setPlaying] = useState(false), [variable, setVariable] = useState('ip');
  useEffect(() => {
    const abort = new AbortController();
    loadScientificJson(entry.artifact, abort.signal).then(value => bindControlExample(value, entry)).then(value => { if (!abort.signal.aborted) setData(value); }).catch(() => { if (!abort.signal.aborted) setError('CONTROL_EXAMPLE_INTEGRITY_FAILED'); });
    return () => abort.abort();
  }, [entry]);
  useEffect(() => {
    if (!data || !playing || !active) return;
    const timer = setInterval(() => setIndex(i => (i + 1) % data.time.values.length), 180);
    return () => clearInterval(timer);
  }, [data, playing, active]);
  const trace = data?.signals.find(s => s.id === variable), target = data?.signals.find(s => s.id === `${variable}_target` && s.unit === trace?.unit);
  const [factor, unit] = display(trace?.unit ?? entry.units.ip, en);
  const time = data?.time.values[index];
  const frame = data?.boundary.frames.find(f => f.timeIndex === index);
  const radial = data?.signals.find(s => s.id === 'r'), vertical = data?.signals.find(s => s.id === 'z');
  const position = radial?.values[index] != null && vertical?.values[index] != null ? [radial.values[index], vertical.values[index]] : null;
  const positionInMetres = radial?.unit === 'm' && vertical?.unit === 'm';
  const locus = data?.time.values.flatMap((_, i) => radial?.values[i] == null || vertical?.values[i] == null ? [] : [[radial.values[i]!, vertical.values[i]!]]) ?? [];
  const points = [...(frame?.rz ?? []), ...locus];
  const xs = points.map(p => p[0]), zs = points.map(p => p[1]);
  const xLo = xs.length ? Math.min(...xs) : 0, xHi = xs.length ? Math.max(...xs) : 1, zLo = zs.length ? Math.min(...zs) : 0, zHi = zs.length ? Math.max(...zs) : 1;
  const span = Math.max(xHi - xLo, zHi - zLo, .001) * 1.12;
  const square = Math.max(60, Math.min(boundaryWidth - 90, 250));
  const base = { animation: false, grid: { left: 74, right: 24, top: 54, bottom: 54 }, tooltip: { trigger: 'axis' }, legend: { top: 2 } };
  function csv() {
    if (!data) return;
    download(`${data.id}.csv`, ['archive_time_s,' + data.signals.map(s => `${s.id}_${s.unit}`).join(','), ...data.time.values.map((v, i) => [v, ...data.signals.map(s => s.values[i] ?? '')].join(','))].join('\n'), 'text/csv');
  }
  return <>
    <section className="transportPanel"><div className="transportCaseHeading"><h2>{en ? entry.labelEn : entry.labelZh}</h2><span className="transportBadge">SIMULATED · HISTORICAL REPLAY</span></div><p>{t('已有 Docker 仿真归档，可离线回放；不是本轮云端新计算，也不是实验测量。', 'An existing Docker simulation archive for offline replay; not a new cloud run or an experimental measurement.')}</p><p>{entry.samples} {t('个记录点', 'recorded samples')} · {t('配置窗口', 'Configured window')} {number(entry.requestedDurationSeconds * 1000)} ms · {t('记录跨度', 'Recorded span')} {number(entry.recordedSpanSeconds * 1000)} ms</p></section>
    <div className="transportMetrics">{(['ip', 'r', 'z'] as const).map(id => {
      const signal = data?.signals.find(s => s.id === id), [scale, units] = display(signal?.unit ?? entry.units[id], en);
      const value = data ? signal?.values[index] : entry.initial[id];
      return <div key={id}><span>{label(id)}</span><strong>{number(value == null ? null : value * scale)} <small>{units}</small></strong><small>{time == null ? t('首个归档采样点', 'First archived sample') : `t = ${number(time * 1000)} ms`}</small></div>;
    })}<div><span>{t('结果身份', 'Result identity')}</span><strong>{t('历史示例', 'Archived example')}</strong><small>{t('不用于 TORAX 初始化', 'Not a TORAX initial state')}</small></div></div>
    {error ? <section className="transportPanel" role="alert">{t('示例数据完整性校验失败，请重新加载页面。', 'Example integrity validation failed. Reload the page.')} {error}</section> : !data ? <section className="transportPanel" role="status">{t('正在校验和加载示例曲线…', 'Verifying and loading example traces…')}</section> : <>
      <section className="transportPanel"><div className="transportPlayback"><button className="transportButton" onClick={() => setPlaying(!playing)} aria-pressed={playing}>{playing ? t('暂停', 'Pause') : t('播放', 'Play')}</button><label htmlFor={`${entry.id}-time`}>{t('归档相对时间', 'Archive-relative time')} <strong>{number(time! * 1000)} ms</strong></label><input id={`${entry.id}-time`} type="range" min={0} max={data.time.values.length - 1} value={index} onChange={e => { setIndex(Number(e.target.value)); setPlaying(false); }} /><span>{index + 1}/{data.time.values.length}</span></div><p>{t('按归档采样逐点回放，不插值或补造初始点；播放速度不是求解速度。', 'Replay uses recorded samples, without interpolation or invented initial points. Playback speed is not solver speed.')}</p></section>
      {fieldEntry ? <ControlEquilibriumView key={fieldEntry.id} entry={fieldEntry} example={data} index={index} en={en} active={active} /> : <section className="transportPanel transportFieldPanel"><h3>{t('位形与磁通场 · 数据待补齐', 'Configuration & flux · data unavailable')}</h3><p>{t('此 DINA 归档仅保存 Ip、R、Z 响应，没有 LCFS 或二维 ψ 网格。不能由位置曲线生成真实磁通场；需要从计算节点补导出 R/Z 网格、每帧 ψ、边界与时间戳。', 'This DINA archive contains only Ip, R and Z responses, without LCFS or a 2D ψ grid. Position traces cannot define a native flux field. The compute node must export R/Z grid axes, ψ frames, boundaries and timestamps.')}</p></section>}
      <div className="transportTwoColumns"><section className="transportPanel"><div className="transportControls"><h3>{t('时序响应', 'Time response')}</h3><label>{t('物理量', 'Quantity')} <select value={variable} onChange={e => setVariable(e.target.value)}>{data.signals.filter(s => !s.id.endsWith('_target')).map(s => <option key={s.id} value={s.id}>{label(s.id)}</option>)}</select></label></div><ScientificChart id={`${entry.id}-trace`} ariaLabel={label(variable)} fallbackSrc="" fallbackAlt="" height={350} eager option={{ ...base, xAxis: { type: 'value', name: 't / ms' }, yAxis: { type: 'value', name: unit, scale: true }, series: [trace, target].filter(s => !!s).map((s, j) => ({ name: j ? t('归档目标', 'Archived target') : label(variable), type: 'line', showSymbol: false, connectNulls: false, lineStyle: { width: j ? 1.5 : 2.5, type: j ? 'dashed' : 'solid' }, data: data.time.values.map((v, i) => [v * 1000, s.values[i] === null ? null : s.values[i]! * factor]), markLine: j ? undefined : { symbol: 'none', label: { show: false }, data: [{ xAxis: time! * 1000 }] } })) }} fallback={<p>{t('全部采样可在下方数据表和下载文件中读取。', 'All samples are available in the table and downloads below.')}</p>} /></section>
      <section className="transportPanel"><div ref={boundaryElement}><h3>{frame ? t('归档 LCFS 与位置', 'Archived LCFS and position') : t('R–Z 位置轨迹', 'R–Z position trajectory')}</h3><ScientificChart id={`${entry.id}-rz`} ariaLabel={frame ? 'Archived LCFS' : 'R-Z trajectory'} fallbackSrc="" fallbackAlt="" height={350} eager option={{ ...base, grid: { left: 60, top: 54, width: square, height: square }, tooltip: { trigger: 'item' }, xAxis: { type: 'value', name: `R / ${radial?.unit ?? 'unavailable'}`, min: (xLo + xHi - span) / 2, max: (xLo + xHi + span) / 2 }, yAxis: { type: 'value', name: `Z / ${vertical?.unit ?? 'unavailable'}`, min: (zLo + zHi - span) / 2, max: (zLo + zHi + span) / 2 }, series: [
        ...(frame && positionInMetres ? [{ name: 'LCFS', type: 'line', showSymbol: false, data: [...frame.rz, frame.rz[0]] }] : []),
        { name: t('位置轨迹', 'Position trajectory'), type: 'line', showSymbol: false, connectNulls: false, data: data.time.values.map((_, i) => radial?.values[i] == null || vertical?.values[i] == null ? [null, null] : [radial.values[i], vertical.values[i]]) },
        { name: t('当前采样', 'Selected sample'), type: 'scatter', symbolSize: 10, data: position ? [position] : [] },
      ] }} fallback={<p>R = {number(radial?.values[index])} · Z = {number(vertical?.values[index])}</p>} /><p>{frame ? t('仅展示已归档的边界点；未生成磁通面或 TORAX 几何。', 'Only archived boundary points are shown; no flux surfaces or TORAX geometry are generated.') : t('这是位置变化轨迹，不是等离子体边界；此归档未提供 LCFS。', 'This is a position trajectory, not a plasma boundary. This archive has no LCFS.')}</p></div></section></div>
      <details className="transportPanel"><summary>{t('采样数据与下载', 'Sample data & downloads')}</summary><div className="transportControls"><button className="transportButton" onClick={csv}>{t('下载时序 CSV', 'Download time-series CSV')}</button><button className="transportButton" onClick={() => download(`${data.id}.json`, JSON.stringify(data, null, 2))}>{t('下载示例 JSON', 'Download example JSON')}</button></div><p>{t('文件保留归档单位；未核实的电流不换算为 A，缺值保持为空。', 'Files retain archive units. Unverified current units are not converted to A; missing values stay empty.')}</p><div className="transportTableScroll"><table className="transportTable"><thead><tr><th>t / s</th>{data.signals.map(s => <th key={s.id}>{s.id} / {display(s.unit, en)[1] === 'kA' ? 'A' : display(s.unit, en)[1]}</th>)}</tr></thead><tbody>{data.time.values.map((v, i) => <tr key={i} aria-current={i === index ? 'true' : undefined}><td>{number(v)}</td>{data.signals.map(s => <td key={s.id}>{number(s.values[i])}</td>)}</tr>)}</tbody></table></div></details>
      <details className="transportPanel"><summary>{t('来源与适用边界', 'Provenance & limitations')}</summary><p>{t('源运行', 'Source run')}: <code>{data.source.runId}</code> · {t('源报告状态', 'Source-reported status')}: {data.source.reportedStatus}</p><p>{t('运行 Git 提交', 'Run Git commit')}: <code>{data.source.codeCommit ?? t('归档未记录', 'Not recorded')}</code></p><p className="transportHash">Docker Image ID: {data.source.imageId ?? t('归档未记录', 'Not recorded')}</p><ul>{data.limitations.map(l => <li key={l.code}>{limitationText(l)}</li>)}</ul><p>{t('数值收敛和装置验证均未建立；不能作为 TORAX 输入。', 'Numerical convergence and device validation are not established. Not qualified as TORAX input.')}</p>{data.source.files.map(f => <p key={f.name} className="transportHash">{f.name} · SHA-256: {f.sha256}</p>)}</details>
    </>}
  </>;
}
