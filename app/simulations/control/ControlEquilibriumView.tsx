'use client';
import { useEffect, useMemo, useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import EfitCanvasChart from '../../components/efit/EfitCanvasChart';
import { PSI_N_COLORS } from '../../components/efit/psi-n-palette';
import { useChartTheme } from '../../components/charts/chart-theme';
import { gridCellBounds } from '../equilibrium-field';
import { loadScientificJson } from '../physics';
import { download, number } from '../platform/display';
import { bindControlEquilibrium, fieldContours, fieldRange, type ControlEquilibrium, type ControlEquilibriumEntry } from './equilibrium';
import type { ControlExample } from './examples';

export default function ControlEquilibriumView({ entry, example, index, en, active }: { entry: ControlEquilibriumEntry; example: ControlExample; index: number; en: boolean; active: boolean }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const theme = useChartTheme();
  const [data, setData] = useState<ControlEquilibrium | null>(null), [error, setError] = useState(false);
  const [overlays, setOverlays] = useState(true), [fixedScale, setFixedScale] = useState(true), [cloud, setCloud] = useState(true);
  const [revision, setRevision] = useState(0), [sample, setSample] = useState(0), [independentIndex, setIndependentIndex] = useState(0);
  useEffect(() => {
    if (!active || data || error) return;
    const abort = new AbortController();
    loadScientificJson(entry.artifact, abort.signal).then(value => bindControlEquilibrium(value, entry, example)).then(value => { if (!abort.signal.aborted) setData(value); }).catch(() => { if (!abort.signal.aborted) setError(true); });
    return () => abort.abort();
  }, [active, data, entry, error, example]);
  const at = entry.exampleId === null ? independentIndex : index;
  const allRange = useMemo(() => data ? fieldRange(data) : [0, 1], [data]);
  const localRange = useMemo(() => data ? fieldRange(data, at) : [0, 1], [data, at]);
  const [minimum, rawMaximum] = fixedScale ? allRange : localRange;
  const maximum = rawMaximum > minimum ? rawMaximum : minimum + Math.max(1, Math.abs(minimum)*.01);
  const frame = data?.flux.frames[at], boundary = data?.boundary.frames.find(f => f.timeIndex === at)?.rz;
  const cells = useMemo(() => {
    if (!data || !frame) return [];
    return frame.map((v, i) => {
      const ri = i % data.grid.r.length, zi = Math.floor(i / data.grid.r.length);
      const [rLo, rHi] = gridCellBounds(data.grid.r, ri), [zLo, zHi] = gridCellBounds(data.grid.z, zi);
      return [data.grid.r[ri], data.grid.z[zi], v, rLo, rHi, zLo, zHi, i];
    });
  }, [data, frame]);
  const contours = useMemo(() => data && overlays ? Array.from({ length: 15 }, (_, i) => {
    const level = minimum + (maximum-minimum)*(i+1)/16;
    return { level, points: fieldContours(data, at, level).flatMap(segment => [...segment, [null, null]]) };
  }) : [], [data, at, overlays, minimum, maximum]);
  const rangeR = data ? [data.grid.r[0], data.grid.r.at(-1)!] : [0, 1], rangeZ = data ? [data.grid.z[0], data.grid.z.at(-1)!] : [0, 1];
  const renderCell: CustomSeriesRenderItem = (params, api) => {
    const a = api.coord([api.value(3), api.value(5)]), b = api.coord([api.value(4), api.value(6)]);
    const c = params.coordSys as unknown as { x: number; y: number; width: number; height: number };
    const x = Math.max(Math.min(a[0],b[0]),c.x), y = Math.max(Math.min(a[1],b[1]),c.y);
    const right = Math.min(Math.max(a[0],b[0]),c.x+c.width), bottom = Math.min(Math.max(a[1],b[1]),c.y+c.height);
    if (right <= x || bottom <= y) return;
    const color = api.visual('color');
    return { type: 'rect', shape: { x, y, width: right-x, height: bottom-y }, style: { fill: typeof color === 'string' ? color : PSI_N_COLORS[0] }, transition: [] };
  };
  const option: EChartsCoreOption = {
    animation: false, backgroundColor: 'transparent',
    grid: { left: 58, right: 72, top: 26, bottom: 52 },
    xAxis: { type: 'value', min: rangeR[0], max: rangeR[1], name: 'R / m', nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: 'value', min: rangeZ[0], max: rangeZ[1], name: 'Z / m', nameLocation: 'middle', nameGap: 42 },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }, { type: 'inside', yAxisIndex: 0, filterMode: 'none' }],
    visualMap: cloud ? { type: 'continuous', min: minimum, max: maximum, dimension: 2, seriesIndex: 0, orient: 'vertical', right: 3, top: 'middle', itemWidth: 10, itemHeight: 170, precision: 3, text: ['code-unit', ''], inRange: { color: [...PSI_N_COLORS] }, textStyle: { color: theme.muted, fontSize: 12 } } : undefined,
    tooltip: { trigger: 'item', formatter: (params: unknown) => {
      const value = (params as { value?: number[] }).value;
      return Array.isArray(value) && value.length === 8 ? `R: ${number(value[0])} m<br/>Z: ${number(value[1])} m<br/>ψ: ${number(value[2])} code-unit` : '';
    } },
    series: [
      ...(cloud ? [{ name: t('原生磁通', 'Native poloidal flux'), type: 'custom' as const, coordinateSystem: 'cartesian2d' as const, renderItem: renderCell, data: cells, dimensions: ['R', 'Z', 'psi', 'rLo', 'rHi', 'zLo', 'zHi', 'sample'], encode: { x: 0, y: 1, value: 2 }, clip: true, progressive: 4000, progressiveThreshold: 8000, emphasis: { disabled: true }, z: 1 }] : []),
      ...contours.map(c => ({ name: `ψ ${number(c.level)}`, type: 'line' as const, data: c.points, connectNulls: false, showSymbol: false, silent: true, lineStyle: { color: theme.mode === 'dark' ? 'rgba(239,255,251,.62)' : 'rgba(39,68,58,.58)', width: 1.05 }, z: 8 })),
      ...(overlays && boundary ? [{ name: 'LCFS', type: 'line' as const, data: [...boundary, boundary[0]], showSymbol: false, silent: true, lineStyle: { color: theme.mode === 'dark' ? '#ffd5ef' : '#7d4e73', width: 2.6, shadowBlur: 8, shadowColor: theme.violet }, z: 12 }] : []),
    ],
  };
  const selected = cells[Math.min(sample, cells.length-1)];
  return <section className="transportPanel transportFieldPanel"><div className="transportFieldHeading"><div><p className="transportEyebrow">NATIVE R–Z FIELD</p><h3>{t('位形与磁通场', 'Configuration & poloidal flux')}</h3></div><span className="transportTag">SIMULATED · {t('原生磁通 / 非 ψN', 'Native flux / not ψN')}</span></div>
    <p>{en ? entry.labelEn : entry.labelZh} · {entry.frames} {t('帧', 'frames')} · R×Z = {entry.grid[0]}×{entry.grid[1]}</p>
    {entry.exampleId === null && <p role="note">{t('独立历史运行，不与上方响应曲线同步。使用此面板自己的时间。', 'Independent historical run, not synchronized with the response trace above. Use this panel’s own time.')}</p>}
    {error ? <p role="alert">{t('磁通工件校验或运行身份绑定失败，未展示任何替代场。', 'Flux integrity or run identity validation failed. No substitute field is displayed.')}</p> : !data ? <p role="status">{t('正在校验和加载原生磁通网格…', 'Verifying and loading native flux grids…')}</p> : <>
      {entry.exampleId === null && <label>{t('场归档时间', 'Field archive time')}<input type="range" min={0} max={data.time.values.length-1} value={independentIndex} onChange={e => setIndependentIndex(Number(e.target.value))} /></label>}
      <div className="transportFieldOptions"><label><input type="checkbox" checked={cloud} onChange={e => setCloud(e.target.checked)} />{t('磁通云图', 'Flux field')}</label><label><input type="checkbox" checked={overlays} onChange={e => setOverlays(e.target.checked)} />{t('边界与等值线', 'Boundary & isolines')}</label><label><input type="checkbox" checked={fixedScale} onChange={e => setFixedScale(e.target.checked)} />{t('全时段统一色标', 'Fixed scale across time')}</label><button className="transportButton" onClick={() => setRevision(r => r+1)}>{t('重置视图', 'Reset view')}</button><span>t = {number(data.time.values[at]*1000)} ms · {at+1}/{data.time.values.length}</span></div>
      <EfitCanvasChart key={`${data.id}-${revision}`} option={option} className="transportFieldCanvas" ariaLabel={t('原生 R–Z 磁通场及归档位形', 'Native R–Z poloidal flux and archived configuration')} dataAspectRatio={(rangeR[1]-rangeR[0])/(rangeZ[1]-rangeZ[0])} preserveDataZoom fallback={<p>{t('准备位形渲染；原始网格可在下方读取和下载。', 'Preparing the field; native samples are available below.')}</p>} onChartClick={params => { const value = (params as { value?: number[] }).value; if (Array.isArray(value) && Number.isInteger(value[7]) && cells[value[7]]) setSample(value[7]); }} />
      <p className="transportNote">{t('沿用 TORAX/FUSE 色带；这里颜色仅对应原生磁通数值，不代表 ψN、温度或电流密度。全域网格按原生采样着色，不插值帧；等值线仅在相邻网格边上作显示插值。', 'Uses the TORAX/FUSE palette. Colors represent native flux values, not ψN, temperature or current density. Full-domain native grid samples are colored without frame interpolation; isolines only interpolate crossings along grid edges.')}</p>
      <details className="transportFieldReadout"><summary>{t('网格读数、下载与来源', 'Grid readout, download & provenance')}</summary><label>{t('网格点', 'Grid sample')} {sample+1}/{cells.length}<input type="range" min={0} max={cells.length-1} value={sample} onChange={e => setSample(Number(e.target.value))} /></label>{selected && <output>R = {number(selected[0])} m · Z = {number(selected[1])} m · ψ = {number(selected[2])} code-unit</output>}<button className="transportButton" onClick={() => download(`${data.id}.json`, JSON.stringify(data))}>{t('下载完整原生场 JSON', 'Download complete native field JSON')}</button><p>{data.source.runId} · {data.source.nativeField} · {data.source.nativeLayout}</p><ul>{data.limitations.map(l => <li key={l.code}>{en ? l.en : l.zh}</li>)}</ul>{data.source.files.map(f => <p key={f.name} className="transportHash">{f.name} · SHA-256: {f.sha256}</p>)}</details>
    </>}
  </section>;
}
