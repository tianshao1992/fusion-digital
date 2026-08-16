'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import { useMemo, useState } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import { useChartTheme } from '../components/charts/chart-theme';
import { roadmapPhases, type RoadmapPhase, type RoadmapWorkPackage } from './program-roadmap-data';

function chartData(params: unknown): unknown[] | null {
  if (!params || typeof params !== 'object' || !('data' in params)) return null;
  const data = (params as { data?: unknown }).data;
  return Array.isArray(data) ? data : null;
}

const renderWorkPackage: CustomSeriesRenderItem = (_params, api) => {
  const row = Number(api.value(0));
  const start = Number(api.value(1));
  const end = Number(api.value(2));
  const color = String(api.value(3));
  const label = String(api.value(5));
  const labelColor = String(api.value(6));
  const startPoint = api.coord([start, row]);
  const endPoint = api.coord([end, row]);
  const rawBandSize = api.size?.([0, 1]);
  const bandHeight = Array.isArray(rawBandSize) ? Number(rawBandSize[1]) : Number(rawBandSize ?? 42);
  const height = Math.max(22, Math.min(34, Math.abs(bandHeight) * 0.54));
  const width = Math.max(4, endPoint[0] - startPoint[0]);
  return {
    type: 'group',
    children: [
      {
        type: 'rect',
        cursor: 'pointer',
        shape: { x: startPoint[0], y: startPoint[1] - height / 2, width, height, r: 4 },
        style: { fill: color, opacity: 0.94, stroke: color, lineWidth: 1 },
        emphasis: { style: { opacity: 1, shadowBlur: 14, shadowColor: color, lineWidth: 2 } },
      },
      ...(width > 92 ? [{
        type: 'text' as const,
        silent: true,
        style: {
          x: startPoint[0] + 10,
          y: startPoint[1],
          text: label,
          fill: labelColor,
          font: '700 10px "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
          verticalAlign: 'middle' as const,
          width: Math.max(40, width - 18),
          overflow: 'truncate' as const,
        },
      }] : []),
    ],
  };
};

function phaseOption(phase: RoadmapPhase, colors: string[], chartTheme: ReturnType<typeof useChartTheme>): EChartsCoreOption {
  const lanes = phase.workPackages.map((item) => `${item.id}  ${item.lane}`);
  const data = phase.workPackages.map((item, index) => {
    const color = colors[index % colors.length];
    return [index, item.start - 0.5, item.end + 0.5, color, item.id, item.title, contrastingLabel(color)];
  });
  return {
    backgroundColor: chartTheme.background,
    animationDuration: 520,
    aria: {
      enabled: true,
      decal: { show: true },
      description: `${phase.device}${phase.duration}项目路线图。每条泳道表示一个工作包的建议执行区间；竖线表示必须以证据通过的阶段门，不表示按日期自动完成。`,
    },
    grid: { left: 178, right: 28, top: 34, bottom: 60 },
    tooltip: {
      trigger: 'item',
      borderWidth: 1,
      formatter: (params: unknown) => {
        const row = chartData(params);
        if (!row) return '';
        const item = phase.workPackages.find((candidate) => candidate.id === String(row[4]));
        if (!item) return '';
        return `<b>${item.id} · ${item.title}</b><br/>${phase.axisLabel} ${item.start}–${item.end}<br/><span style="color:${chartTheme.muted}">${item.owner}</span>`;
      },
    },
    xAxis: {
      type: 'value',
      min: 0.5,
      max: phase.axisMax + 0.5,
      interval: 1,
      name: phase.axisLabel,
      nameLocation: 'middle',
      nameGap: 34,
      axisTick: { show: false },
      axisLabel: { formatter: (value: number) => value > phase.axisMax ? '' : String(Math.round(value)).padStart(2, '0') },
      splitLine: { show: true, lineStyle: { type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: lanes,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { width: 156, overflow: 'truncate', fontSize: 10, fontWeight: 700, margin: 16 },
    },
    series: [{
      type: 'custom',
      name: '工作包',
      clip: true,
      renderItem: renderWorkPackage,
      encode: { x: [1, 2], y: 0 },
      data,
      markLine: {
        silent: true,
        symbol: ['none', 'none'],
        lineStyle: { type: 'dashed', width: 1.2, color: chartTheme.accent },
        label: { show: true, position: 'insideEndTop', formatter: (params: { name?: string }) => params.name ?? '', color: chartTheme.accent, fontSize: 9, fontWeight: 900 },
        data: phase.gates.map((gate) => ({ name: gate.id, xAxis: gate.at + 0.5 })),
      },
    }],
    media: [{
      query: { maxWidth: 680 },
      option: {
        grid: { left: 112, right: 18, top: 32, bottom: 58 },
        yAxis: { axisLabel: { width: 94, fontSize: 8, margin: 10 } },
      },
    }],
  };
}

function contrastingLabel(hex: string) {
  const channels = /^#([0-9a-f]{6})$/i.exec(hex)?.[1].match(/.{2}/g)?.map((part) => Number.parseInt(part, 16) / 255) ?? [0, 0, 0];
  const luminance = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const darkContrast = (luminance + 0.05) / 0.055;
  const lightContrast = 1.05 / (luminance + 0.05);
  return darkContrast >= lightContrast ? '#101412' : '#fffdf8';
}

function PhaseChart({ phase }: { phase: RoadmapPhase }) {
  const chartTheme = useChartTheme();
  const colors = useMemo(() => chartTheme.mode === 'dark'
    ? ['#e18766', '#65c7b4', '#ab9abe', '#d7a66d', '#7fa7c9', '#b2c980', '#d27785']
    : ['#b7593b', '#49766a', '#74667d', '#9b693b', '#557a9b', '#6f893d', '#a14d5a'], [chartTheme.mode]);
  const [selectedId, setSelectedId] = useState(phase.workPackages[0]?.id ?? '');
  const selected = phase.workPackages.find((item) => item.id === selectedId) ?? phase.workPackages[0];
  const option = useMemo(() => phaseOption(phase, colors, chartTheme), [phase, colors, chartTheme]);

  return <div className="programPhaseChartGrid">
    <div className="programPhaseChartMain">
      <ScientificChart
        id={`${phase.id}-program-roadmap`}
        option={option}
        ariaLabel={`${phase.device}${phase.duration}项目工作包与阶段门交互甘特图`}
        fallbackSrc=""
        fallbackAlt={`${phase.device}路线图静态回退`}
        height={phase.id === 'phase-1' ? 540 : 540}
        eager={phase.id === 'phase-1'}
        fallback={<table className="programChartFallback"><caption>{phase.device} 工作包计划</caption><thead><tr><th>工作包</th><th>区间</th></tr></thead><tbody>{phase.workPackages.map((item) => <tr key={item.id}><th>{item.id} · {item.title}</th><td>{item.start}–{item.end}</td></tr>)}</tbody></table>}
        onChartClick={(params) => {
          const data = chartData(params);
          const id = typeof data?.[4] === 'string' ? data[4] : null;
          if (id && phase.workPackages.some((item) => item.id === id)) setSelectedId(id);
        }}
      />
      <nav className="programWorkPackageTabs" aria-label={`${phase.device}工作包`}>
        {phase.workPackages.map((item) => <button type="button" key={item.id} className={item.id === selected.id ? 'isActive' : ''} aria-pressed={item.id === selected.id} onClick={() => setSelectedId(item.id)}><b>{item.id}</b><span>{item.lane}</span></button>)}
      </nav>
    </div>
    <WorkPackageDetail item={selected} phase={phase} />
  </div>;
}

function WorkPackageDetail({ item, phase }: { item: RoadmapWorkPackage; phase: RoadmapPhase }) {
  return <aside className="programWorkPackageDetail" aria-live="polite">
    <p><span>{item.id}</span>{phase.axisLabel} {item.start}–{item.end}（含首尾周期）</p>
    <h3>{item.title}</h3>
    <dl>
      <div><dt>责任主线</dt><dd>{item.owner}</dd></div>
      <div><dt>正式交付</dt><dd>{item.deliverable}</dd></div>
      <div><dt>过门证据</dt><dd>{item.evidence}</dd></div>
    </dl>
    <div className="programDetailModules"><small>关联知识模块</small>{item.modules.map((module) => <a href={`#module-${module}`} key={module}>{module}</a>)}</div>
  </aside>;
}

export default function ProgramRoadmapCharts() {
  return <>{roadmapPhases.map((phase) => <PhaseChart phase={phase} key={phase.id} />)}</>;
}

export function ProgramPhaseChart({ phaseId }: { phaseId: RoadmapPhase['id'] }) {
  const phase = roadmapPhases.find((item) => item.id === phaseId);
  return phase ? <PhaseChart phase={phase} /> : null;
}
