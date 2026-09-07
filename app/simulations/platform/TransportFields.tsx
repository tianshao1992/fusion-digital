'use client';
import { useEffect, useMemo, useState } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import EfitCanvasChart from '../../components/efit/EfitCanvasChart';
import { useChartTheme } from '../../components/charts/chart-theme';
import { PSI_N_COLORS } from '../../components/efit/psi-n-palette';
import { loadScientificJson } from '../physics';
import catalog from '../data/transport-geometries.json';
import type { TransportResult } from './contracts';
import { crossSectionCells, inputContourSegments, parseTransportGeometry, spaceTimeCells, type GeometryEntry, type TransportGeometry } from './geometry';
import { displayUnit, download, label, number } from './display';

export default function TransportFields({ result, timeIndex, en, onTime, liveGeometry }: { result: TransportResult; timeIndex: number; en: boolean; onTime: (index: number) => void; liveGeometry?: TransportGeometry | null }) {
  const t = (zh: string, english: string) => en ? english : zh;
  const theme = useChartTheme();
  const [mode, setMode] = useState<'section' | 'time'>('section'), [field, setField] = useState('te');
  const [geometry, setGeometry] = useState<TransportGeometry | null>(liveGeometry ?? null), [error, setError] = useState('');
  const [overlays, setOverlays] = useState(true), [fixedScale, setFixedScale] = useState(true), [revision, setRevision] = useState(0);
  const [sample, setSample] = useState(0);
  const entry = (catalog as GeometryEntry[]).find(g => g.runId === result.id && g.sourceNativeSha256 === result.provenance.nativeSha256);
  useEffect(() => {
    if (!entry) return;
    const abort = new AbortController();
    loadScientificJson(entry.artifact, abort.signal).then(value => {
      const g = parseTransportGeometry(value);
      if (g.runId !== result.id || g.sourceNativeSha256 !== result.provenance.nativeSha256 || g.kind !== entry.kind) throw new Error('GEOMETRY_IDENTITY');
      setGeometry(g);
    }).catch(e => { if (!abort.signal.aborted) setError(String(e.message)); });
    return () => abort.abort();
  }, [entry, result.id, result.provenance.nativeSha256]);
  const inputField = field.startsWith('input_');
  const selected = mode === 'time' && inputField ? 'te' : field;
  const profile = result.profiles.find(p => p.id === selected);
  const [scale, unit] = displayUnit(selected === 'input_psi' ? 'Wb' : selected === 'input_psi_norm' ? '1' : profile?.unit ?? '1');
  const cells = useMemo(() => mode === 'time' ? spaceTimeCells(result, selected) : geometry ? crossSectionCells(geometry, result, selected, timeIndex) : [], [mode, result, selected, geometry, timeIndex]);
  const contours = useMemo(() => {
    if (!geometry) return [];
    if (geometry.grid) return [.2, .4, .6, .8].map(level => ({ name: `ψN ${level}`, data: inputContourSegments(geometry, level).flatMap(segment => [...segment, [null,null]]) }));
    return geometry.rings.filter((_, i) => i > 0 && i % Math.max(1, Math.round((geometry.rings.length-1)/5)) === 0).map(r => ({ name: `ρ ${number(r.rho)}`, data: r.points }));
  }, [geometry]);
  const title = selected === 'input_psi_norm' ? t('输入磁通 ψN', 'Input flux ψN') : selected === 'input_psi' ? t('输入磁通 ψ', 'Input flux ψ') : label(selected, en);
  const globalValues = fixedScale && profile ? profile.values.flat().filter((v): v is number => v !== null) : cells.map(c => c.value);
  let minimum = Infinity, maximum = -Infinity;
  for (const v of globalValues) { minimum = Math.min(minimum, v*scale); maximum = Math.max(maximum, v*scale); }
  if (!Number.isFinite(minimum)) { minimum = 0; maximum = 1; }
  if (minimum === maximum) maximum = minimum+Math.max(1, Math.abs(minimum)*.01);
  const r = geometry?.boundary.map(p => p[0]) ?? [0,1], z = geometry?.boundary.map(p => p[1]) ?? [0,1];
  const padding = Math.max(Math.max(...r)-Math.min(...r),Math.max(...z)-Math.min(...z))*.04;
  const xRange = mode === 'time' ? [result.time.values[0],result.time.values.at(-1)!] : [Math.min(...r)-padding,Math.max(...r)+padding];
  const yRange = mode === 'time' ? [0,1] : [Math.min(...z)-padding,Math.max(...z)+padding];
  const renderCell: CustomSeriesRenderItem = (_params, api) => {
    const index = Number(api.value(3)), cell = cells[index];
    if (!cell) return;
    const color = api.visual('color');
    return { type: 'polygon', shape: { points: cell.polygon.map(p => api.coord(p)) }, style: { fill: typeof color === 'string' ? color : theme.accent, stroke: typeof color === 'string' ? color : theme.accent, lineWidth: .25 } };
  };
  const option: EChartsCoreOption = {
    animation: false, grid: { left: 62, right: 90, top: 28, bottom: 50 },
    xAxis: { type: 'value', min: xRange[0], max: xRange[1], name: mode === 'time' ? t('时间 / s', 'Time / s') : 'R / m', nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: 'value', min: yRange[0], max: yRange[1], name: mode === 'time' ? 'ρtor,norm' : 'Z / m', nameLocation: 'middle', nameGap: 42 },
    visualMap: { type: 'continuous', dimension: 2, seriesIndex: 0, min: minimum, max: maximum, orient: 'vertical', right: 4, top: 'middle', itemWidth: 10, itemHeight: 170, precision: 3, text: [unit, ''], inRange: { color: [...PSI_N_COLORS] }, textStyle: { color: theme.muted, fontSize: 12 } },
    tooltip: { trigger: 'item', formatter: (params: unknown) => {
      const v = (params as { value?: number[] })?.value;
      if (!Array.isArray(v) || v.length < 4) return '';
      const c = cells[v[3]]; if (!c) return '';
      return `${title}: ${number(c.value*scale)} ${unit}<br/>${mode === 'time' ? 't / ρ' : 'R / Z'}: ${number(c.x)} / ${number(c.y)}<br/>${t('离散样本', 'Discrete sample')}`;
    } },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }, { type: 'inside', yAxisIndex: 0, filterMode: 'none' }],
    series: [{ name: title, type: 'custom', coordinateSystem: 'cartesian2d', renderItem: renderCell, clip: true, progressive: 4000, progressiveThreshold: 8000, dimensions: ['x','y','value','sample'], encode: { x: 0, y: 1, value: 2 }, data: cells.map((c,i) => [c.x,c.y,c.value*scale,i]), emphasis: { disabled: true } },
      ...(mode === 'section' && geometry && overlays ? [
        ...contours.map(c => ({ ...c, type: 'line' as const, connectNulls: false, showSymbol: false, silent: true, lineStyle: { color: theme.mode === 'dark' ? '#e6fff4' : '#476458', width: 1, opacity: .6 } })),
        { name: geometry.grid ? 'LCFS' : t('重建边界', 'Reconstructed boundary'), type: 'line' as const, data: geometry.boundary, showSymbol: false, silent: true, lineStyle: { color: theme.violet, width: 2.5 } },
        { name: t('参考轴', 'Reference axis'), type: 'scatter' as const, data: [geometry.axis], symbol: 'diamond', symbolSize: 10, itemStyle: { color: theme.accent } },
      ] : []),
      ...(mode === 'time' ? [{ type: 'line' as const, data: [[result.time.values[timeIndex],0],[result.time.values[timeIndex],1]], showSymbol: false, silent: true, lineStyle: { color: theme.mode === 'dark' ? '#fff' : '#233c33', width: 2, type: 'dashed' as const } }] : []),
    ],
  };
  const current = cells[Math.min(sample, Math.max(0,cells.length-1))];
  const sectionAvailable = !!geometry && !error;
  const description = mode === 'time' ? t('原生二维时空结果', 'Native time–radius results') : geometry?.kind === 'input-equilibrium-grid' ? t(inputField ? '输入磁平衡 · 固定几何' : '输运结果映射至输入几何', inputField ? 'Input equilibrium · fixed geometry' : 'Transport mapped onto input geometry') : t('径向结果 · 参数化截面重建', 'Radial results · parametric section reconstruction');
  return <section className="transportPanel transportFieldPanel"><div className="transportFieldHeading"><div><p className="transportEyebrow">2D FIELD VIEW</p><h3>{t('二维云图', 'Two-dimensional fields')}</h3></div><span className="transportTag">{description}</span></div>
    <div className="transportControls"><div className="engineSegments"><button aria-pressed={mode === 'section'} onClick={() => { setMode('section'); setSample(0); }}>{t('R–Z 截面', 'R–Z cross-section')}</button><button aria-pressed={mode === 'time'} onClick={() => { setMode('time'); setSample(0); }}>{t('时间—半径', 'Time–radius')}</button></div><label>{t('物理量', 'Quantity')}<select value={selected} onChange={e => { setField(e.target.value); setSample(0); }}>{['te','ti','ne','pressure','j_total','chi_e','chi_i'].filter(id => result.profiles.some(p => p.id === id)).map(id => <option key={id} value={id}>{label(id,en)}</option>)}{mode === 'section' && geometry?.grid && <><option value="input_psi_norm">{t('输入磁通 ψN', 'Input flux ψN')}</option><option value="input_psi">{t('输入磁通 ψ / Wb', 'Input flux ψ / Wb')}</option></>}</select></label></div>
    <div className="transportFieldOptions"><label><input type="checkbox" checked={fixedScale} onChange={e => setFixedScale(e.target.checked)} />{t('全时段统一色标', 'Fixed scale across time')}</label>{mode === 'section' && <label><input type="checkbox" checked={overlays} onChange={e => setOverlays(e.target.checked)} />{t('边界、轴与等值线', 'Boundary, axis & contours')}</label>}<button className="transportButton" onClick={() => setRevision(r => r+1)}>{t('重置视图', 'Reset view')}</button><span>{mode === 'section' && inputField ? t('输入磁平衡不随回放时间改变', 'Input equilibrium stays fixed during playback') : `t = ${number(result.time.values[timeIndex])} s`}</span></div>
    {mode === 'section' && !sectionAvailable ? <p role="status">{error ? `${t('几何校验失败', 'Geometry validation failed')}: ${error}` : entry ? t('正在校验几何数据…', 'Verifying geometry…') : t('此新运行尚未导入几何，可先查看原生时间—半径云图。', 'Geometry has not been imported for this new run. Native time–radius fields are available.')}</p> : <EfitCanvasChart key={`${result.id}-${mode}-${revision}`} option={option} ariaLabel={`${description}: ${title}`} className="transportFieldCanvas" dataAspectRatio={mode === 'section' ? (xRange[1]-xRange[0])/(yRange[1]-yRange[0]) : undefined} preserveDataZoom fallback={<p>{t('准备二维云图；数据读数可通过下方键盘控件查看。', 'Preparing field; the keyboard readout below provides sample values.')}</p>} onChartClick={params => {
      const values = (params as { value?: number[] })?.value;
      if (!Array.isArray(values) || !Number.isInteger(values[3]) || !cells[values[3]]) return;
      setSample(values[3]);
      if (mode === 'time') { const at = result.time.values.indexOf(cells[values[3]].x); if (at >= 0) onTime(at); }
    }} />}
    <p className="transportNote">{mode === 'time' ? t('直接绘制 TORAX 离散时间×径向输出；保留非均匀步长，不进行时空插值。点击云图可跳转时间。', 'Direct TORAX time × radius samples; nonuniform steps are retained without space/time interpolation. Click the field to select a time.') : geometry?.grid ? t(`${geometry.grid.r.length}×${geometry.grid.z.length} 官方 STEP 输入网格；磁通为固定输入。Te/Ti/ne 等剖面按源文件 ψ→ρtor 映射，并假定磁面内为常数；不是独立二维输运求解。超出源坐标范围的点留空。`, `${geometry.grid.r.length}×${geometry.grid.z.length} official STEP input grid; flux is fixed input. Profiles use the source ψ→ρtor map and are assumed constant on surfaces; this is not an independent 2D transport solve. Out-of-domain samples remain empty.`) : t('使用归档 R内/R外、伸长比及上下三角形变重建截面，假设轴高 Z=0；常数磁面上显示径向结果。圆几何的伸长修正以椭圆示意，不代表原生二维平衡。', 'Section reconstructed from archived R-in/R-out, elongation and triangularity, with Z-axis assumed zero. Radial values are constant on surfaces. Circular-model elongation is visualized as ellipses, not native 2D equilibrium.')}</p>
    {geometry?.grid && <p className="transportNote">T. A. Brown, F. J. Casson et al. / UKAEA · <a href="https://doi.org/10.14468/07jt-s540" target="_blank" rel="noreferrer">OpenSTEP SPP-001 (2025)</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · {t('已转置数组、作 LCFS 掩膜与剖面映射。', 'Array transposed, LCFS mask applied and profiles mapped.')}</p>}
    {cells.length > 0 && <details className="transportFieldReadout"><summary>{t('采样读数与导出', 'Sample readout & export')}</summary><label>{t('样本', 'Sample')} {Math.min(sample+1,cells.length)} / {cells.length}<input aria-label={t('二维场采样', '2D field sample')} type="range" min={0} max={cells.length-1} value={Math.min(sample,cells.length-1)} onChange={e => setSample(Number(e.target.value))} /></label><output>{mode === 'time' ? 't / ρ' : 'R / Z'}: {number(current?.x)} / {number(current?.y)} · {title}: {number(current ? current.value*scale : null)} {unit}</output><button className="transportButton" onClick={() => download(`${result.id}-${mode}-${selected}.json`, JSON.stringify({ schema: 'display-field-samples.v1', authority: mode === 'time' ? 'simulation-samples' : 'derived-display', sourceAttribution: geometry?.grid && mode === 'section' ? 'T. A. Brown, F. J. Casson et al. / UKAEA, OpenSTEP SPP-001 (2025), https://doi.org/10.14468/07jt-s540, CC BY 4.0; modified by transpose, LCFS mask and profile mapping' : null, sourceRunId: result.id, nativeSha256: result.provenance.nativeSha256, geometrySha256: mode === 'section' ? entry?.artifact.rawSha256 : null, variable: selected, unit: profile?.unit ?? (selected === 'input_psi' ? 'Wb' : '1'), timeSeconds: mode === 'section' && !inputField ? result.time.values[timeIndex] : null, samples: cells }, null, 2))}>{t('导出当前场数据', 'Export displayed field')}</button></details>}
  </section>;
}
