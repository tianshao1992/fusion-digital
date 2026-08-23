'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useMemo } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import { useChartTheme } from '../components/charts/chart-theme';
import type { FusionShotRecord } from './fusionDataContract';
import {
  buildCaeFieldFrame,
  buildDiagnosticQuality,
  buildEquilibriumFrame,
  buildRadialProfiles,
  diagnosticChannels,
  type DerivedAvailability,
} from './fusionDataDerived';

type SharedChartProps = {
  shot: FusionShotRecord;
  selectedIndex: number;
  en: boolean;
};

type QualityChartProps = SharedChartProps & {
  onSeek: (timeIndex: number) => void;
};

type UnavailableState = Extract<DerivedAvailability, { available: false }>;

function DerivedUnavailable({ availability, en, height }: { availability: UnavailableState; en: boolean; height: number }) {
  const qualityLabel = availability.quality === 'missing'
    ? (en ? 'MISSING SOURCE' : '源数据缺失')
    : (en ? 'INVALID SOURCE' : '源数据无效');
  const reasonLabel = availability.reason === 'signal-not-found'
    ? (en ? 'Required signal is not present in this record.' : '该记录中不存在所需信号。')
    : availability.reason === 'source-invalid'
      ? (en ? 'The source sample failed its quality gate.' : '源样本未通过质量门禁。')
      : (en ? 'The source sample has no value at this time.' : '该时刻的源样本没有数值。');

  return <div className="fusionDerivedUnavailable" style={{ minHeight: height }} role="status" aria-live="polite">
    <b className={`fusionDerivedUnavailable__badge fusionDerivedUnavailable__badge--${availability.quality}`}>{qualityLabel}</b>
    <h3>{en ? 'Derived view intentionally withheld' : '派生视图已按规则停用'}</h3>
    <p>{reasonLabel} <code>{availability.signalId}</code></p>
    <small>{en ? 'No zero fill, interpolation, or model imputation has been applied.' : '未执行补零、插值或模型填补。'}</small>
  </div>;
}

export function QualityHeatmap({ shot, selectedIndex, en, onSeek }: QualityChartProps) {
  const palette = useChartTheme();
  const cells = useMemo(() => buildDiagnosticQuality(shot), [shot]);
  const times = shot.signals[0].points.map(({ time }) => time);
  const option = useMemo<EChartsCoreOption>(() => ({
    aria: { enabled: true, decal: { show: true } },
    animationDuration: 220,
    tooltip: {
      trigger: 'item', confine: true,
      formatter: (params: unknown) => {
        const data = (params as { data?: unknown }).data;
        if (!Array.isArray(data)) return '';
        const channel = diagnosticChannels[Number(data[1])];
        return `${en ? channel.labelEn : channel.label}<br/>${times[Number(data[0])]?.toFixed(2)} s · ${String(data[3])}`;
      },
    },
    grid: { left: 128, right: 24, top: 18, bottom: 42 },
    xAxis: { type: 'category', data: times.map((time) => time.toFixed(2)), name: 'time / s', axisLabel: { interval: 15 }, splitArea: { show: false } },
    yAxis: { type: 'category', data: diagnosticChannels.map((channel) => en ? channel.labelEn : channel.label), axisLabel: { fontSize: 9 } },
    visualMap: {
      type: 'piecewise', orient: 'horizontal', left: 'center', bottom: 2,
      pieces: [
        { value: 3, label: en ? 'good' : '正常', color: palette.info },
        { value: 2, label: en ? 'warning' : '警告', color: '#d6a06c' },
        { value: 1, label: en ? 'invalid' : '无效', color: '#df8f83' },
        { value: 0, label: en ? 'missing' : '缺失', color: palette.surface },
      ],
    },
    series: [{
      name: en ? 'Diagnostic quality' : '诊断质量', type: 'heatmap',
      data: cells.map((cell) => [cell.timeIndex, cell.channelIndex, cell.code, cell.quality]),
      itemStyle: { borderColor: palette.background, borderWidth: 1 },
      emphasis: { itemStyle: { borderColor: palette.accent, borderWidth: 2 } },
      markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: palette.accent }, data: [{ xAxis: selectedIndex }] },
    }],
  }), [cells, en, palette, selectedIndex, times]);

  return <ScientificChart
    id="fusion-diagnostic-quality"
    option={option}
    ariaLabel={en ? 'Diagnostic quality by time and channel' : '按时间和通道排列的诊断质量热图'}
    fallbackSrc=""
    fallbackAlt=""
    height={306}
    onChartClick={(params) => {
      const data = (params as { data?: unknown }).data;
      if (Array.isArray(data) && Number.isInteger(Number(data[0]))) onSeek(Number(data[0]));
    }}
    keepFallbackAccessible
    fallback={<table><caption>{en ? 'Quality at selected time' : '当前时刻诊断质量'}</caption><thead><tr><th>{en ? 'Channel' : '通道'}</th><th>IDS</th><th>{en ? 'Quality' : '质量'}</th></tr></thead><tbody>{diagnosticChannels.map((channel, channelIndex) => { const cell = cells.find((candidate) => candidate.channelIndex === channelIndex && candidate.timeIndex === selectedIndex); return <tr key={channel.id}><th>{en ? channel.labelEn : channel.label}</th><td>{channel.ids}</td><td>{cell?.quality ?? 'missing'}</td></tr>; })}</tbody></table>}
  />;
}

export function RadialProfileChart({ shot, selectedIndex, en }: SharedChartProps) {
  const palette = useChartTheme();
  const profiles = useMemo(() => buildRadialProfiles(shot, selectedIndex), [selectedIndex, shot]);
  if (!profiles.availability.available) return <DerivedUnavailable availability={profiles.availability} en={en} height={306} />;
  const option: EChartsCoreOption = {
    aria: { enabled: true, decal: { show: true } },
    tooltip: { trigger: 'axis', confine: true },
    legend: { top: 4, data: [en ? 'Te / keV' : 'Te / keV', en ? 'ne / 10¹⁹ m⁻³' : 'ne / 10¹⁹ m⁻³', 'q'] },
    grid: { left: 54, right: 48, top: 38, bottom: 42 },
    xAxis: { type: 'value', min: 0, max: 1, name: 'ρtor,norm', nameLocation: 'middle', nameGap: 28 },
    yAxis: [
      { type: 'value', name: en ? 'profile value' : '剖面数值', scale: true },
      { type: 'value', name: 'q', min: 0.8, max: 5, splitLine: { show: false } },
    ],
    series: [
      { name: 'Te / keV', type: 'line', data: profiles.rho.map((rho, index) => [rho, profiles.electronTemperature[index]]), showSymbol: false, smooth: false, lineStyle: { color: palette.accent, width: 2 }, itemStyle: { color: palette.accent } },
      { name: 'ne / 10¹⁹ m⁻³', type: 'line', data: profiles.rho.map((rho, index) => [rho, profiles.electronDensity[index]]), showSymbol: false, smooth: false, lineStyle: { color: palette.info, width: 2 }, itemStyle: { color: palette.info } },
      { name: 'q', type: 'line', yAxisIndex: 1, data: profiles.rho.map((rho, index) => [rho, profiles.safetyFactor[index]]), showSymbol: false, smooth: false, lineStyle: { color: palette.violet, width: 1.7, type: 'dashed' }, itemStyle: { color: palette.violet } },
    ],
  };
  return <ScientificChart id="fusion-radial-profiles" option={option} ariaLabel={en ? 'Synthetic radial electron-temperature, density and q profiles' : '合成电子温度、密度和 q 径向剖面'} fallbackSrc="" fallbackAlt="" height={306} keepFallbackAccessible fallback={<table><caption>{en ? 'Radial profile landmarks' : '径向剖面特征点'}</caption><thead><tr><th>ρtor,norm</th><th>Te / keV</th><th>ne / 10¹⁹ m⁻³</th><th>q</th></tr></thead><tbody>{[0, 10, 20, 30].map((index) => <tr key={index}><td>{profiles.rho[index]}</td><td>{profiles.electronTemperature[index]}</td><td>{profiles.electronDensity[index]}</td><td>{profiles.safetyFactor[index]}</td></tr>)}</tbody></table>} />;
}

export function EquilibriumChart({ shot, selectedIndex, en }: SharedChartProps) {
  const palette = useChartTheme();
  const frame = useMemo(() => buildEquilibriumFrame(shot, selectedIndex), [selectedIndex, shot]);
  if (!frame.availability.available) return <DerivedUnavailable availability={frame.availability} en={en} height={344} />;
  const option: EChartsCoreOption = {
    aria: { enabled: true, decal: { show: true } },
    tooltip: { trigger: 'item', confine: true },
    grid: { left: 54, right: 58, top: 18, bottom: 40 },
    xAxis: { type: 'value', min: frame.r[0], max: frame.r.at(-1), name: 'R / m', nameLocation: 'middle', nameGap: 28 },
    yAxis: { type: 'value', min: frame.z[0], max: frame.z.at(-1), name: 'Z / m', scale: true },
    visualMap: { min: 0, max: 1.2, seriesIndex: 0, right: 2, top: 'middle', orient: 'vertical', calculable: true, text: ['ψN', '0'], inRange: { color: palette.mode === 'dark' ? ['#071410', '#2c6257', '#e18766', '#f5d4a7'] : ['#fffdf8', '#b6d4c8', '#d77e5e', '#6d3540'] } },
    series: [
      { name: 'ψN', type: 'heatmap', data: frame.psi, progressive: 3000, itemStyle: { opacity: 0.96 } },
      { name: 'LCFS', type: 'line', data: frame.boundary, showSymbol: false, lineStyle: { color: palette.text, width: 2 }, z: 4 },
      { name: en ? 'Magnetic axis' : '磁轴', type: 'scatter', data: [frame.magneticAxis], symbol: 'cross', symbolSize: 12, itemStyle: { color: palette.accent }, z: 5 },
      { name: en ? 'X point' : 'X 点', type: 'scatter', data: [frame.xPoint], symbol: 'diamond', symbolSize: 8, itemStyle: { color: palette.violet }, z: 5 },
    ],
  };
  return <ScientificChart id="fusion-equilibrium-frame" option={option} ariaLabel={en ? 'Synthetic R-Z equilibrium with normalized flux, LCFS, magnetic axis and X point' : '合成 R-Z 平衡截面，含归一化磁通、LCFS、磁轴和 X 点'} fallbackSrc="" fallbackAlt="" height={344} keepFallbackAccessible fallback={<dl><div><dt>{en ? 'Magnetic axis' : '磁轴'}</dt><dd>R {frame.magneticAxis[0]} m · Z {frame.magneticAxis[1]} m</dd></div><div><dt>{en ? 'X point' : 'X 点'}</dt><dd>R {frame.xPoint[0]} m · Z {frame.xPoint[1]} m</dd></div><div><dt>{en ? 'Authority' : '权威类型'}</dt><dd>synthetic / mapping-preview</dd></div></dl>} />;
}

export function CaeFieldPreview({ shot, selectedIndex, en }: SharedChartProps) {
  const palette = useChartTheme();
  const frame = useMemo(() => buildCaeFieldFrame(shot, selectedIndex), [selectedIndex, shot]);
  if (!frame.availability.available) return <DerivedUnavailable availability={frame.availability} en={en} height={344} />;
  const option: EChartsCoreOption = {
    aria: { enabled: true, decal: { show: true } },
    tooltip: { trigger: 'item', confine: true, formatter: (params: unknown) => { const data = (params as { data?: unknown }).data; return Array.isArray(data) ? `R ${Number(data[0]).toFixed(2)} m · Z ${Number(data[1]).toFixed(2)} m<br/>σvM ${Number(data[2]).toFixed(1)} MPa` : ''; } },
    grid: { left: 50, right: 62, top: 14, bottom: 38 },
    xAxis: { type: 'value', min: frame.r[0], max: frame.r.at(-1), name: 'R / m', nameLocation: 'middle', nameGap: 26 },
    yAxis: { type: 'value', min: frame.z[0], max: frame.z.at(-1), name: 'Z / m' },
    visualMap: { min: Math.floor(frame.min), max: Math.ceil(frame.max), right: 2, top: 'middle', orient: 'vertical', calculable: true, text: ['MPa', ''], inRange: { color: palette.mode === 'dark' ? ['#102a25', '#3e8373', '#d79b62', '#df665e'] : ['#e9f3ee', '#6da594', '#e3a467', '#b44943'] } },
    series: [{ name: 'von Mises', type: 'heatmap', data: frame.values, progressive: 3000 }],
  };
  return <ScientificChart id="fusion-cae-mock-field" option={option} ariaLabel={en ? 'Synthetic first-wall equivalent-stress field preview' : '合成第一壁等效应力场预览'} fallbackSrc="" fallbackAlt="" height={344} keepFallbackAccessible fallback={<dl><div><dt>{en ? 'Field' : '场量'}</dt><dd>von_mises_stress / MPa</dd></div><div><dt>{en ? 'Range' : '范围'}</dt><dd>{frame.min}—{frame.max} MPa</dd></div><div><dt>{en ? 'Rendering' : '渲染方式'}</dt><dd>ECharts synthetic preview</dd></div></dl>} />;
}
