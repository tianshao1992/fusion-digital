'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import { useMemo, useState, type CSSProperties } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import { useChartTheme } from '../components/charts/chart-theme';
import {
  knowledgeModuleRoutes,
  programPillars,
  programSupportLinks,
  roadmapPhases,
  type ProgramPillar,
  type ProgramPillarId,
  type RoadmapPhase,
  type RoadmapWorkPackage,
} from './program-roadmap-data';
import {
  programPillarRouteMaps,
  type PillarTechnicalRoute as ProgramPillarRoute,
  type ProgramPillarRouteMap,
  type ProgramToolRole,
} from './program-pillar-route-maps';

function chartData(params: unknown): unknown[] | null {
  if (!params || typeof params !== 'object' || !('data' in params)) return null;
  const data = (params as { data?: unknown }).data;
  return Array.isArray(data) ? data : null;
}

function chartObjectData(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== 'object' || !('data' in params)) return null;
  const data = (params as { data?: unknown }).data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
}

type PillarPalette = Record<ProgramPillarId, string>;

function pillarPalette(chartTheme: ReturnType<typeof useChartTheme>): PillarPalette {
  return chartTheme.mode === 'dark'
    ? { physics: '#e18766', engineering: '#d7a66d', control: '#ab9abe', diagnostics: '#65c7b4', data: '#7fa7c9' }
    : { physics: '#b7593b', engineering: '#9b693b', control: '#74667d', diagnostics: '#49766a', data: '#557a9b' };
}

const pillarSymbols: Record<ProgramPillarId, { symbol: string; size: number | [number, number] }> = {
  physics: { symbol: 'circle', size: 112 },
  engineering: { symbol: 'rect', size: [164, 72] },
  control: { symbol: 'diamond', size: 124 },
  diagnostics: { symbol: 'roundRect', size: [164, 72] },
  data: { symbol: 'roundRect', size: [184, 72] },
};

const pillarChartLabels: Record<ProgramPillarId, string> = {
  physics: '01\n位形与\n等离子体物理',
  engineering: '02\n工程多物理场',
  control: '03\n集成控制与\n虚拟调试',
  diagnostics: '04\n诊断、重构与\n状态感知',
  data: '05\n数据、语义与\n证据基座',
};

function systemMapOption(
  selectedId: ProgramPillarId,
  colors: PillarPalette,
  chartTheme: ReturnType<typeof useChartTheme>,
): EChartsCoreOption {
  const pillarY: Record<ProgramPillarId, number> = { physics: 70, engineering: 180, control: 290, diagnostics: 400, data: 520 };
  const pillarNodes = programPillars.map((pillar) => ({
    id: pillar.id,
    name: pillarChartLabels[pillar.id],
    x: 310,
    y: pillarY[pillar.id],
    symbol: pillarSymbols[pillar.id].symbol,
    symbolSize: pillarSymbols[pillar.id].size,
    selected: pillar.id === selectedId,
    category: 1,
    value: pillar.mission,
    itemStyle: {
      color: colors[pillar.id],
      borderColor: pillar.id === selectedId ? chartTheme.text : chartTheme.background,
      borderWidth: pillar.id === selectedId ? 4 : 2,
      shadowBlur: pillar.id === selectedId ? 16 : 5,
      shadowColor: colors[pillar.id],
    },
    label: { color: contrastingLabel(colors[pillar.id]), fontSize: 11, fontWeight: 800, lineHeight: 15, align: 'center' },
  }));
  const rootColor = chartTheme.mode === 'dark' ? '#23372e' : '#e9e1d5';
  const hubColor = chartTheme.mode === 'dark' ? '#dbe8e1' : '#2f3c35';
  const phaseOneColor = chartTheme.mode === 'dark' ? '#e18766' : '#b7593b';
  const phaseTwoColor = chartTheme.mode === 'dark' ? '#9ec7b8' : '#45695e';
  const finalColor = chartTheme.mode === 'dark' ? '#c7b5d0' : '#66566f';
  const semanticLinks = programSupportLinks.map((link, index) => {
    if (link.kind === 'foundation') return {
      source: link.source, target: link.target, value: link.payload,
      lineStyle: { type: 'dashed', opacity: 0.78, width: 1.45, curveness: 0.08 + index * 0.012, color: colors.data },
    };
    if (link.kind === 'input') return {
      source: link.source, target: link.target, value: link.payload,
      lineStyle: { opacity: 0.82, width: 1.5, curveness: (index - 2) * 0.035, color: chartTheme.text },
    };
    if (link.kind === 'coupling') return {
      source: link.source, target: link.target, value: link.payload,
      lineStyle: { type: 'dotted', opacity: 0.9, width: 1.9, curveness: 0.18, color: chartTheme.accent },
    };
    if (link.kind === 'evidence') {
      const source = link.source as ProgramPillarId;
      return {
        source: link.source, target: link.target, value: link.payload,
        lineStyle: { opacity: 0.78, width: source === selectedId ? 3.8 : 2.3, curveness: 0.03, color: colors[source] },
      };
    }
    const color = link.target === 'phase-1-goal' || link.source === 'phase-1-goal'
      ? phaseOneColor
      : link.target === 'phase-2-goal' || link.source === 'phase-2-goal'
        ? phaseTwoColor
        : finalColor;
    return { source: link.source, target: link.target, value: link.payload, lineStyle: { opacity: 0.82, width: 2.8, color } };
  });
  const selectedPillar = programPillars.find((pillar) => pillar.id === selectedId) ?? programPillars[0];
  const compactNodes = [
    { id: 'mission', name: '装置事实与实验任务', x: 50, y: 20, symbol: 'roundRect', symbolSize: [150, 50], category: 0, value: '受控装置描述、实验目标、配置与约束', itemStyle: { color: rootColor, borderColor: chartTheme.line, borderWidth: 2 }, label: { color: chartTheme.text } },
    { id: selectedId, name: `${selectedPillar.no} · ${selectedPillar.title}`, x: 50, y: 130, symbol: 'roundRect', symbolSize: [158, 54], category: 1, value: selectedPillar.mission, itemStyle: { color: colors[selectedId], borderColor: chartTheme.text, borderWidth: 3 }, label: { color: contrastingLabel(colors[selectedId]) } },
    { id: 'integration', name: '统一数字线程与 V&V', x: 50, y: 245, symbol: 'diamond', symbolSize: 88, category: 2, value: '统一身份、接口、运行清单、残差、适用域和阶段门', itemStyle: { color: hubColor, borderColor: chartTheme.line, borderWidth: 2 }, label: { color: contrastingLabel(hubColor) } },
    { id: 'phase-1-goal', name: '一期 · EXL‑50U\n3 个月闭环', x: 18, y: 365, symbol: 'roundRect', symbolSize: [132, 54], category: 3, value: 'EXL‑50U 三个月最小闭环', itemStyle: { color: phaseOneColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(phaseOneColor) } },
    { id: 'phase-2-goal', name: '二期 · EHL‑2\n虚拟首炮就绪', x: 82, y: 365, symbol: 'roundRect', symbolSize: [132, 54], category: 3, value: 'EHL‑2 六个月虚拟 first-plasma readiness', itemStyle: { color: phaseTwoColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(phaseTwoColor) } },
    { id: 'long-term-goal', name: '长期目标\n证据可追溯的实验支撑', x: 50, y: 480, symbol: 'roundRect', symbolSize: [166, 64], category: 3, value: '持续服务实验规划、运行复盘、模型更新与工程决策', itemStyle: { color: finalColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(finalColor) } },
  ];
  const compactLinks = [
    { source: 'mission', target: selectedId, lineStyle: { color: chartTheme.text, opacity: 0.84, width: 2 } },
    { source: selectedId, target: 'integration', lineStyle: { color: colors[selectedId], opacity: 0.9, width: 3 } },
    { source: 'integration', target: 'phase-1-goal', lineStyle: { color: phaseOneColor, opacity: 0.9, width: 2.5 } },
    { source: 'integration', target: 'phase-2-goal', lineStyle: { color: phaseTwoColor, opacity: 0.9, width: 2.5 } },
    { source: 'phase-1-goal', target: 'long-term-goal', lineStyle: { color: phaseOneColor, opacity: 0.85, width: 2 } },
    { source: 'phase-2-goal', target: 'long-term-goal', lineStyle: { color: phaseTwoColor, opacity: 0.85, width: 2 } },
  ];
  return {
    backgroundColor: chartTheme.background,
    animationDuration: 420,
    aria: {
      enabled: true,
      decal: { show: true },
      description: '聚变数字孪生目标支撑总览。装置事实与实验任务进入位形物理、工程仿真、集成控制、诊断感知和数据模型基础设施；五个环节汇聚到统一数字线程与验证阶段门，依次支撑 EXL-50U 三个月最小闭环、EHL-2 六个月首等离子体虚拟调试和长期实验支撑目标。',
    },
    legend: {
      bottom: 2,
      data: ['任务输入', '专业环节', '集成与验证', '阶段目标'],
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { fontSize: 10 },
    },
    tooltip: {
      trigger: 'item',
      borderWidth: 1,
      formatter: (params: unknown) => {
        const data = chartObjectData(params);
        if (!data) return '';
        if (typeof data.source === 'string' && typeof data.target === 'string') {
          return `<b>${supportNodeLabel(data.source)} → ${supportNodeLabel(data.target)}</b><br/>${String(data.value ?? '受控接口')}`;
        }
        const pillar = programPillars.find((item) => item.id === data.id);
        if (pillar) return `<b>${pillar.no} · ${pillar.title}</b><br/>${pillar.mission}`;
        return `<b>${String(data.name ?? '')}</b><br/>${String(data.value ?? '')}`;
      },
    },
    series: [{
      type: 'graph',
      name: '目标支撑关系',
      layout: 'none',
      left: 110,
      right: 110,
      top: 60,
      bottom: 60,
      roam: false,
      selectedMode: 'single',
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 8],
      data: [
        {
          id: 'mission', name: '装置事实与实验任务\nMachine · Shot · Scenario', x: 55, y: 290,
          symbol: 'roundRect', symbolSize: [174, 82], category: 0, value: '受控装置描述、实验目标、配置与约束',
          itemStyle: { color: rootColor, borderColor: chartTheme.line, borderWidth: 2 }, label: { color: chartTheme.text },
        },
        ...pillarNodes,
        {
          id: 'integration', name: '统一数字线程与 V&V\n编排 · 比较 · 证据过门', x: 620, y: 290,
          symbol: 'diamond', symbolSize: 136, category: 2, value: '统一身份、接口、运行清单、残差、适用域和阶段门',
          itemStyle: { color: hubColor, borderColor: chartTheme.line, borderWidth: 2 }, label: { color: contrastingLabel(hubColor) },
        },
        {
          id: 'phase-1-goal', name: '一期 · EXL‑50U\n3 个月最小闭环', x: 900, y: 185,
          symbol: 'roundRect', symbolSize: [178, 86], category: 3, value: '计划—预演—控制测试—实验—重构—工程复核—回写',
          itemStyle: { color: phaseOneColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(phaseOneColor) },
        },
        {
          id: 'phase-2-goal', name: '二期 · EHL‑2\n6 个月虚拟 first-plasma readiness', x: 900, y: 395,
          symbol: 'roundRect', symbolSize: [208, 92], category: 3, value: '虚拟调试、最小诊断、故障演练与只读 shadow；不代表实体装置在六个月内实现首等离子体',
          itemStyle: { color: phaseTwoColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(phaseTwoColor) },
        },
        {
          id: 'long-term-goal', name: '长期目标\n实验驱动、证据可追溯的\n聚变数字孪生基础设施', x: 1140, y: 290,
          symbol: 'roundRect', symbolSize: [196, 104], category: 3, value: '持续服务实验规划、运行复盘、模型更新与工程决策',
          itemStyle: { color: finalColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(finalColor) },
        },
      ],
      links: semanticLinks,
      categories: [
        { name: '任务输入', itemStyle: { color: rootColor } },
        { name: '专业环节', itemStyle: { color: colors.physics } },
        { name: '集成与验证', itemStyle: { color: hubColor } },
        { name: '阶段目标', itemStyle: { color: phaseOneColor } },
      ],
      label: { show: true, position: 'inside', fontSize: 11, fontWeight: 750, lineHeight: 17 },
      lineStyle: { opacity: 0.58, width: 1.5, curveness: 0.04 },
      emphasis: { focus: 'adjacency', blurScope: 'coordinateSystem', lineStyle: { opacity: 1, width: 3 } },
      blur: { itemStyle: { opacity: 0.28 }, label: { opacity: 0.34 }, lineStyle: { opacity: 0.08 } },
      select: { itemStyle: { borderWidth: 4 } },
    }],
    media: [{
      query: { maxWidth: 700 },
      option: {
        legend: { show: false },
        series: [{
          left: 72,
          right: 72,
          top: 36,
          bottom: 36,
          data: compactNodes,
          links: compactLinks,
          label: { fontSize: 10, lineHeight: 14 },
          edgeLabel: { show: false },
        }],
      },
    }],
  };
}

function supportNodeLabel(id: string) {
  return programPillars.find((pillar) => pillar.id === id)?.title ?? ({
    mission: '装置事实与实验任务',
    integration: '统一数字线程与 V&V',
    'phase-1-goal': '一期 EXL‑50U 最小闭环',
    'phase-2-goal': '二期 EHL‑2 虚拟首炮就绪',
    'long-term-goal': '长期实验支撑目标',
  } as Record<string, string>)[id] ?? id;
}

const renderWorkPackage: CustomSeriesRenderItem = (_params, api) => {
  const row = Number(api.value(0));
  const start = Number(api.value(1));
  const end = Number(api.value(2));
  const color = String(api.value(3));
  const label = String(api.value(5));
  const labelColor = String(api.value(6));
  const selected = Number(api.value(7)) === 1;
  const commitment = String(api.value(8));
  const conditional = commitment !== '关键路径';
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
        style: {
          fill: color,
          opacity: 1,
          stroke: color,
          lineWidth: selected ? 2.4 : 1,
          lineDash: conditional ? [7, 4] : undefined,
        },
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

function phaseOption(
  phase: RoadmapPhase,
  colors: PillarPalette,
  selectedId: string,
  chartTheme: ReturnType<typeof useChartTheme>,
): EChartsCoreOption {
  const lanes = phase.workPackages.map((item) => `${item.id}  ${item.lane}`);
  const data = phase.workPackages.map((item, index) => {
    const color = colors[item.pillars[0]];
    return [index, item.start - 0.5, item.end + 0.5, color, item.id, item.title, contrastingLabel(color), item.id === selectedId ? 1 : 0, item.commitment];
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
        return `<b>${item.id} · ${item.title}</b><br/>${phase.axisLabel} ${item.start}–${item.end}<br/>${item.commitment}<br/><span style="color:${chartTheme.muted}">${item.owner}</span>`;
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
        yAxis: { axisLabel: { width: 94, fontSize: 11, margin: 10 } },
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

function phaseNames(phases: readonly RoadmapPhase['id'][]) {
  return phases.map((phase) => phase === 'phase-1' ? '一期' : '二期').join(' + ');
}

function moduleTitle(id: string) {
  return knowledgeModuleRoutes.find((module) => module.id === id)?.title ?? id;
}

function moduleHref(id: string) {
  return knowledgeModuleRoutes.find((module) => module.id === id)?.route ?? `/knowledge-graph#module-${id}`;
}

type ProgramRoutePhaseFilter = 'all' | RoadmapPhase['id'];

const phaseDeliveryMeta: Record<RoadmapPhase['id'], { short: string; title: string }> = {
  'phase-1': { short: '一期', title: 'EXL‑50U · 3 个月闭环交付' },
  'phase-2': { short: '二期', title: 'EHL‑2 · 虚拟首炮就绪交付' },
};

const programToolRoleLabels: Record<ProgramToolRole, string> = {
  'fact-archive': '权威事实档案',
  'semantic-exchange': '跨模型语义交换',
  'pre-shot-forward': '实验前正问题预演',
  'as-shot-inverse': '实验后逆问题重构',
  'realtime-plant': '实时控制 plant',
  'offline-hi-fi': '离线高保真分析',
  'synthetic-diagnostic': '合成诊断前向模型',
  'control-test': '控制验证与故障注入',
  'supervisory-readonly': '监督层只读接入',
  'engineering-solver': '工程多物理场求解',
  vvuq: '验证、确认与不确定度',
  'evidence-ui': '证据导航与决策界面',
};

function evenlySpacedY(index: number, count: number, start = 68, end = 550) {
  return count <= 1 ? (start + end) / 2 : start + (end - start) * index / (count - 1);
}

function compactChartLabel(value: string, maxCharacters = 11) {
  const characters = Array.from(value);
  if (characters.length <= maxCharacters) return value;
  const lines: string[] = [];
  for (let index = 0; index < characters.length && lines.length < 3; index += maxCharacters) {
    lines.push(characters.slice(index, index + maxCharacters).join(''));
  }
  const consumed = lines.join('').length;
  if (consumed < characters.length) lines[lines.length - 1] = `${lines.at(-1)?.slice(0, -1) ?? ''}…`;
  return lines.join('\n');
}

function pillarSubrouteOption(
  routeMap: ProgramPillarRouteMap,
  selectedRouteId: string,
  phaseFilter: ProgramRoutePhaseFilter,
  pillarColor: string,
  chartTheme: ReturnType<typeof useChartTheme>,
): EChartsCoreOption {
  const routeMapTitle = programPillars.find((pillar) => pillar.id === routeMap.pillarId)?.title ?? routeMap.pillarId;
  const visibleRoutes = phaseFilter === 'all'
    ? routeMap.routes
    : routeMap.routes.filter((route) => route.phases.includes(phaseFilter));
  const selectedRoute = visibleRoutes.find((route) => route.id === selectedRouteId) ?? visibleRoutes[0] ?? routeMap.routes[0];
  const visibleCoverageIds = new Set(visibleRoutes.flatMap((route) => route.coverageIds));
  const visibleToolIds = new Set(visibleRoutes.flatMap((route) => route.toolIds));
  const coverages = routeMap.coverage.filter((item) => visibleCoverageIds.has(item.id)).sort((a, b) => a.order - b.order);
  const tools = routeMap.tools.filter((item) => visibleToolIds.has(item.id)).sort((a, b) => a.order - b.order);
  const phases = (['phase-1', 'phase-2'] as const).filter((phase) => phaseFilter === 'all' || phase === phaseFilter);
  const activeCoverageIds = new Set(selectedRoute?.coverageIds ?? []);
  const activeToolIds = new Set(selectedRoute?.toolIds ?? []);
  const activePhases = new Set(selectedRoute?.phases ?? []);
  const coverageColor = chartTheme.mode === 'dark' ? '#315044' : '#dbe9e2';
  const toolColor = chartTheme.mode === 'dark' ? '#30485b' : '#d7e5ef';
  const phaseColors: Record<RoadmapPhase['id'], string> = chartTheme.mode === 'dark'
    ? { 'phase-1': '#e18766', 'phase-2': '#93c5b2' }
    : { 'phase-1': '#b7593b', 'phase-2': '#477365' };
  const nodes = [
    ...coverages.map((coverage, index) => ({
      id: `coverage:${coverage.id}`,
      entityId: coverage.id,
      nodeKind: 'coverage',
      name: compactChartLabel(coverage.label),
      value: `${coverage.description}\n术语：${coverage.terms.join(' · ')}`,
      x: 95,
      y: evenlySpacedY(index, coverages.length),
      symbol: 'roundRect',
      symbolSize: [178, 54],
      category: 0,
      itemStyle: {
        color: coverageColor,
        borderColor: activeCoverageIds.has(coverage.id) ? pillarColor : chartTheme.line,
        borderWidth: activeCoverageIds.has(coverage.id) ? 3 : 1.4,
        opacity: 1,
      },
      label: { color: chartTheme.text },
    })),
    ...tools.map((tool, index) => ({
      id: `tool:${tool.id}`,
      entityId: tool.id,
      nodeKind: 'tool',
      name: compactChartLabel(tool.label),
      value: `${tool.fullName}\n${programToolRoleLabels[tool.role]}\n${tool.maturity}`,
      x: 405,
      y: evenlySpacedY(index, tools.length),
      symbol: 'rect',
      symbolSize: [188, 56],
      category: 1,
      itemStyle: {
        color: toolColor,
        borderColor: activeToolIds.has(tool.id) ? pillarColor : chartTheme.line,
        borderWidth: activeToolIds.has(tool.id) ? 3 : 1.4,
        opacity: 1,
      },
      label: { color: chartTheme.text },
    })),
    ...visibleRoutes.map((route, index) => ({
      id: `route:${route.id}`,
      entityId: route.id,
      nodeKind: 'route',
      name: compactChartLabel(route.title),
      value: route.detail,
      x: 725,
      y: evenlySpacedY(index, visibleRoutes.length),
      symbol: 'diamond',
      symbolSize: route.id === selectedRoute?.id ? 118 : 104,
      category: 2,
      selected: route.id === selectedRoute?.id,
      itemStyle: {
        color: pillarColor,
        borderColor: route.id === selectedRoute?.id ? chartTheme.text : chartTheme.background,
        borderWidth: route.id === selectedRoute?.id ? 4 : 2,
        opacity: 1,
        shadowBlur: route.id === selectedRoute?.id ? 16 : 0,
        shadowColor: pillarColor,
      },
      label: { color: contrastingLabel(pillarColor) },
    })),
    ...phases.map((phase, index) => {
      const outcome = visibleRoutes
        .flatMap((route) => route.deliveries)
        .filter((delivery) => delivery.phase === phase)
        .map((delivery) => delivery.outcome)
        .join('；');
      return {
        id: `phase:${phase}`,
        entityId: phase,
        nodeKind: 'phase',
        name: `${phaseDeliveryMeta[phase].short}\n${compactChartLabel(phaseDeliveryMeta[phase].title, 12)}`,
        value: outcome,
        x: 1045,
        y: evenlySpacedY(index, phases.length, 168, 450),
        symbol: 'roundRect',
        symbolSize: [202, 76],
        category: 3,
        itemStyle: {
          color: phaseColors[phase],
          borderColor: chartTheme.background,
          borderWidth: activePhases.has(phase) ? 3 : 2,
          opacity: 1,
        },
        label: { color: contrastingLabel(phaseColors[phase]) },
      };
    }),
  ];
  const links = [
    ...tools.flatMap((tool) => tool.coverageIds
      .filter((coverageId) => visibleCoverageIds.has(coverageId))
      .map((coverageId) => {
        const active = activeCoverageIds.has(coverageId) && activeToolIds.has(tool.id);
        return {
          source: `coverage:${coverageId}`,
          target: `tool:${tool.id}`,
          value: tool.role,
          lineStyle: { color: active ? pillarColor : chartTheme.text, opacity: active ? 0.92 : 0.48, width: active ? 2.8 : 1.2, curveness: 0.04 },
        };
      })),
    ...visibleRoutes.flatMap((route) => route.toolIds
      .filter((toolId) => visibleToolIds.has(toolId))
      .map((toolId) => {
        const active = route.id === selectedRoute?.id;
        return {
          source: `tool:${toolId}`,
          target: `route:${route.id}`,
          value: route.detail,
          lineStyle: { color: active ? pillarColor : chartTheme.text, opacity: active ? 0.94 : 0.48, width: active ? 3 : 1.2, curveness: 0.04 },
        };
      })),
    ...visibleRoutes.flatMap((route) => route.deliveries
      .filter((delivery) => phases.includes(delivery.phase))
      .map((delivery) => {
        const active = route.id === selectedRoute?.id;
        return {
          source: `route:${route.id}`,
          target: `phase:${delivery.phase}`,
          value: `${delivery.outcome}\n${delivery.workPackageIds.join(' / ')} → ${delivery.gateIds.join(' / ') || '非阶段门'}`,
          lineStyle: { color: active ? phaseColors[delivery.phase] : chartTheme.text, opacity: active ? 0.94 : 0.48, width: active ? 3 : 1.2, curveness: 0.04 },
        };
      })),
  ];
  const mobileCoverage = selectedRoute
    ? routeMap.coverage.filter((coverage) => selectedRoute.coverageIds.includes(coverage.id))
    : [];
  const mobileTools = selectedRoute ? routeMap.tools.filter((tool) => selectedRoute.toolIds.includes(tool.id)) : [];
  const mobileDeliveries = selectedRoute?.deliveries.filter((delivery) => phaseFilter === 'all' || delivery.phase === phaseFilter) ?? [];
  const mobileNodes = selectedRoute ? [
    {
      id: 'mobile:coverage', entityId: selectedRoute.id, nodeKind: 'route',
      name: `L0 · 专业覆盖\n${compactChartLabel(mobileCoverage.map((item) => item.label).join(' · '), 18)}`,
      value: mobileCoverage.map((item) => `${item.label}：${item.description}`).join('\n'), x: 50, y: 40,
      symbol: 'roundRect', symbolSize: [270, 88], category: 0,
      itemStyle: { color: coverageColor, borderColor: pillarColor, borderWidth: 2 }, label: { color: chartTheme.text },
    },
    {
      id: 'mobile:tools', entityId: selectedRoute.id, nodeKind: 'route',
      name: `L1 · 候选工具链\n${compactChartLabel(mobileTools.map((item) => item.label).join(' · '), 18)}`,
      value: mobileTools.map((item) => `${item.label}：${item.role}`).join('\n'), x: 50, y: 170,
      symbol: 'roundRect', symbolSize: [270, 88], category: 1,
      itemStyle: { color: toolColor, borderColor: pillarColor, borderWidth: 2 }, label: { color: chartTheme.text },
    },
    {
      id: `route:${selectedRoute.id}`, entityId: selectedRoute.id, nodeKind: 'route',
      name: `L2 · 技术子路线\n${compactChartLabel(selectedRoute.title, 16)}`, value: selectedRoute.detail, x: 50, y: 300,
      symbol: 'diamond', symbolSize: 126, category: 2,
      itemStyle: { color: pillarColor, borderColor: chartTheme.text, borderWidth: 3 }, label: { color: contrastingLabel(pillarColor) },
    },
    ...mobileDeliveries.map((delivery, index) => ({
      id: `phase:${delivery.phase}`, entityId: delivery.phase, nodeKind: 'phase',
      name: `L3 · ${phaseDeliveryMeta[delivery.phase].short}交付\n${compactChartLabel(delivery.outcome, 18)}`,
      value: `${delivery.outcome}\n${delivery.workPackageIds.join(' / ')} → ${delivery.gateIds.join(' / ') || '非阶段门'}`,
      x: 50, y: 430 + index * 122, symbol: 'roundRect', symbolSize: [278, 88], category: 3,
      itemStyle: { color: phaseColors[delivery.phase], borderColor: chartTheme.background, borderWidth: 2 },
      label: { color: contrastingLabel(phaseColors[delivery.phase]) },
    })),
  ] : [];
  const mobileLinks = selectedRoute ? [
    { source: 'mobile:coverage', target: 'mobile:tools', lineStyle: { color: pillarColor, opacity: 0.9, width: 2.6 } },
    { source: 'mobile:tools', target: `route:${selectedRoute.id}`, lineStyle: { color: pillarColor, opacity: 0.9, width: 2.8 } },
    ...mobileDeliveries.map((delivery) => ({
      source: `route:${selectedRoute.id}`, target: `phase:${delivery.phase}`,
      lineStyle: { color: phaseColors[delivery.phase], opacity: 0.92, width: 2.8 },
    })),
  ] : [];
  return {
    backgroundColor: chartTheme.background,
    animationDuration: 420,
    aria: {
      enabled: true,
      decal: { show: true },
      description: `${routeMapTitle}四层技术子路线图。专业覆盖经候选工具链形成可验证技术子路线，并映射到一期 EXL-50U 与二期 EHL-2 交付。当前聚焦${selectedRoute?.title ?? '第一条子路线'}。`,
    },
    legend: {
      bottom: 4,
      data: ['专业覆盖', '候选工具链', '技术子路线', '一期 / 二期交付'],
      itemWidth: 14,
      itemHeight: 9,
      textStyle: { fontSize: 10 },
    },
    graphic: [
      { type: 'text', left: '6%', top: 14, style: { text: 'L0  专业覆盖', fill: chartTheme.muted, font: '800 11px sans-serif' } },
      { type: 'text', left: '31%', top: 14, style: { text: 'L1  候选工具链', fill: chartTheme.muted, font: '800 11px sans-serif' } },
      { type: 'text', left: '57%', top: 14, style: { text: 'L2  技术子路线', fill: chartTheme.muted, font: '800 11px sans-serif' } },
      { type: 'text', right: '6%', top: 14, style: { text: 'L3  阶段交付', fill: chartTheme.muted, font: '800 11px sans-serif' } },
    ],
    tooltip: {
      trigger: 'item',
      borderWidth: 1,
      formatter: (params: unknown) => {
        const data = chartObjectData(params);
        if (!data) return '';
        if (typeof data.source === 'string' && typeof data.target === 'string') {
          return `<b>受控技术接口</b><br/>${String(data.value ?? '输入 / 输出契约')}`;
        }
        const kind = data.nodeKind === 'coverage' ? '专业覆盖'
          : data.nodeKind === 'tool' ? '候选工具链'
            : data.nodeKind === 'route' ? '技术子路线' : '阶段交付';
        return `<b>${kind} · ${String(data.name ?? '').replaceAll('\n', ' ')}</b><br/>${String(data.value ?? '').replaceAll('\n', '<br/>')}`;
      },
    },
    series: [{
      type: 'graph',
      name: '专业覆盖',
      layout: 'none',
      left: 64,
      right: 64,
      top: 44,
      bottom: 52,
      roam: false,
      selectedMode: 'single',
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 8],
      data: nodes,
      links,
      categories: [
        { name: '专业覆盖', itemStyle: { color: coverageColor } },
        { name: '候选工具链', itemStyle: { color: toolColor } },
        { name: '技术子路线', itemStyle: { color: pillarColor } },
        { name: '一期 / 二期交付', itemStyle: { color: phaseColors['phase-1'] } },
      ],
      label: { show: true, position: 'inside', fontSize: 10, fontWeight: 750, lineHeight: 14, overflow: 'break' },
      lineStyle: { color: chartTheme.text, opacity: 0.48, width: 1.2, curveness: 0.04 },
      emphasis: { focus: 'adjacency', blurScope: 'coordinateSystem', lineStyle: { opacity: 1, width: 3 } },
      blur: { itemStyle: { opacity: 0.2 }, label: { opacity: 0.28 }, lineStyle: { opacity: 0.06 } },
      select: { itemStyle: { borderWidth: 4 } },
    }],
    media: [{
      query: { maxWidth: 700 },
      option: {
        legend: { show: false },
        graphic: [],
        series: [{
          left: 48,
          right: 48,
          top: 34,
          bottom: 34,
          data: mobileNodes,
          links: mobileLinks,
          label: { fontSize: 10, lineHeight: 15 },
        }],
      },
    }],
  };
}

function routeCoverageLabels(routeMap: ProgramPillarRouteMap, route: ProgramPillarRoute) {
  return route.coverageIds.map((id) => routeMap.coverage.find((item) => item.id === id)?.label ?? id);
}

function routeTools(routeMap: ProgramPillarRouteMap, route: ProgramPillarRoute) {
  return route.toolIds.map((id) => routeMap.tools.find((item) => item.id === id)).filter((item): item is ProgramPillarRouteMap['tools'][number] => Boolean(item));
}

function ProgramPillarSubrouteMap({ pillar }: { pillar: ProgramPillar }) {
  const chartTheme = useChartTheme();
  const colors = useMemo(() => pillarPalette(chartTheme), [chartTheme]);
  const routeMap = programPillarRouteMaps[pillar.id];
  const [phaseFilter, setPhaseFilter] = useState<ProgramRoutePhaseFilter>('all');
  const [selectedRouteId, setSelectedRouteId] = useState(routeMap.routes[0]?.id ?? '');
  const visibleRoutes = phaseFilter === 'all' ? routeMap.routes : routeMap.routes.filter((route) => route.phases.includes(phaseFilter));
  const selectedRoute = visibleRoutes.find((route) => route.id === selectedRouteId) ?? visibleRoutes[0] ?? routeMap.routes[0];
  const selectedTools = selectedRoute ? routeTools(routeMap, selectedRoute) : [];
  const option = useMemo(
    () => pillarSubrouteOption(routeMap, selectedRouteId, phaseFilter, colors[pillar.id], chartTheme),
    [routeMap, selectedRouteId, phaseFilter, colors, pillar.id, chartTheme],
  );
  const chartId = `program-pillar-subroute-${pillar.id}`;
  function choosePhase(nextPhase: ProgramRoutePhaseFilter) {
    setPhaseFilter(nextPhase);
    const nextRoutes = nextPhase === 'all' ? routeMap.routes : routeMap.routes.filter((route) => route.phases.includes(nextPhase));
    if (!nextRoutes.some((route) => route.id === selectedRouteId)) setSelectedRouteId(nextRoutes[0]?.id ?? routeMap.routes[0]?.id ?? '');
  }
  return <section className="programPillarSubrouteMap" aria-labelledby={`${chartId}-title`}>
    <header className="programPillarSubrouteHeader">
      <div><small>PROFESSIONAL SUBROUTE MAP</small><h4 id={`${chartId}-title`}>专业覆盖 → 工具链 → 技术子路线 → 阶段交付</h4></div>
      <p>节点展示“研究覆盖什么、用什么工具、如何接成受控技术链、形成什么可验收结果”。工具为候选技术栈，须经装置基准题与适用域审查后固化。</p>
    </header>
    <div className="programPillarSubrouteControls">
      <nav className="programPillarPhaseFilter" aria-label={`${pillar.title}路线阶段筛选`}>
        {([['all', '全部阶段'], ['phase-1', '一期 · EXL‑50U'], ['phase-2', '二期 · EHL‑2']] as const).map(([id, label]) => <button
          type="button"
          key={id}
          className={phaseFilter === id ? 'isActive' : ''}
          aria-pressed={phaseFilter === id}
          aria-controls={chartId}
          onClick={() => choosePhase(id)}
        >{label}</button>)}
      </nav>
      <nav className="programPillarRouteSelector" aria-label={`${pillar.title}技术子路线`}>
        {visibleRoutes.map((route, index) => <button
          type="button"
          key={route.id}
          className={route.id === selectedRoute?.id ? 'isActive' : ''}
          aria-pressed={route.id === selectedRoute?.id}
          aria-controls={`${chartId} ${chartId}-detail`}
          style={{ '--program-pillar-color': colors[pillar.id] } as CSSProperties}
          onClick={() => setSelectedRouteId(route.id)}
        ><small>{String(index + 1).padStart(2, '0')}</small><b>{route.title}</b><span>{route.status}</span></button>)}
      </nav>
    </div>
    <ScientificChart
      id={chartId}
      option={option}
      ariaLabel={`${pillar.title}专业覆盖、候选工具链、技术子路线与一期二期交付的四层关系图。可用上方原生按钮选择阶段和子路线，或点击图中节点聚焦关联路线。`}
      fallbackSrc=""
      fallbackAlt={`${pillar.title}四层技术子路线静态回退`}
      height={650}
      eager
      className="programPillarSubrouteChart"
      fallback={<table className="programChartFallback programPillarSubrouteFallback">
        <caption>{pillar.title}：专业覆盖—工具—子路线—交付映射</caption>
        <thead><tr><th>专业覆盖</th><th>候选工具链</th><th>技术子路线</th><th>一期 / 二期交付</th></tr></thead>
        <tbody>{routeMap.routes.map((route) => <tr key={route.id}>
          <td>{routeCoverageLabels(routeMap, route).join('；')}</td>
          <td>{routeTools(routeMap, route).map((tool) => `${tool.label}（${tool.maturity}）`).join('；')}</td>
          <th>{route.title}<small>{route.detail}</small><small>边界：{route.boundary}</small></th>
          <td>{route.deliveries.map((delivery) => `${phaseDeliveryMeta[delivery.phase].short}：${delivery.outcome}`).join('；')}</td>
        </tr>)}</tbody>
      </table>}
      onChartClick={(params) => {
        const data = chartObjectData(params);
        const kind = typeof data?.nodeKind === 'string' ? data.nodeKind : '';
        const id = typeof data?.entityId === 'string' ? data.entityId : '';
        if (kind === 'route' && routeMap.routes.some((route) => route.id === id)) {
          setSelectedRouteId(id);
          return;
        }
        if (kind === 'phase' && (id === 'phase-1' || id === 'phase-2')) {
          choosePhase(id);
          return;
        }
        const related = visibleRoutes.find((route) => kind === 'tool' ? route.toolIds.includes(id) : kind === 'coverage' ? route.coverageIds.includes(id) : false);
        if (related) setSelectedRouteId(related.id);
      }}
    />
    {selectedRoute && <><span className="srOnly" aria-live="polite">已聚焦 {selectedRoute.id} {selectedRoute.title}</span><aside className="programPillarSubrouteFocus" id={`${chartId}-detail`} role="region" aria-labelledby={`${chartId}-focus-title`}>
      <header><small>当前聚焦 · {selectedRoute.status}</small><h4 id={`${chartId}-focus-title`}>{selectedRoute.title}</h4><p>{selectedRoute.detail}</p><b className="programPillarSubrouteBoundary">适用边界：{selectedRoute.boundary}</b></header>
      <section><h5>覆盖的聚变专业内容</h5><ul>{selectedRoute.coverageIds.map((id) => {
        const coverage = routeMap.coverage.find((item) => item.id === id);
        return coverage ? <li key={coverage.id}><b>{coverage.label}</b><span>{coverage.description}</span><small>术语：{coverage.terms.join(' · ')}</small></li> : null;
      })}</ul></section>
      <section><h5>候选工具与输入 / 输出</h5><ul>{selectedTools.map((tool) => {
        return <li key={tool.id}><b>{tool.label}<em>{tool.maturity}</em></b><span>{tool.fullName} · {programToolRoleLabels[tool.role]}</span><small>输入：{tool.inputs.join('、')}；输出：{tool.outputs.join('、')}</small><small>V&amp;V：{tool.evidence}</small><small>边界：{tool.boundary}</small><small className="programPillarToolResearch">关联调研：{tool.moduleIds.map((moduleId) => <a href={moduleHref(moduleId)} key={moduleId}>{moduleTitle(moduleId)}</a>)}</small></li>;
      })}</ul></section>
      <section><h5>阶段交付与证据门</h5><ul>{selectedRoute.deliveries.map((delivery) => <li key={delivery.phase}><b>{phaseDeliveryMeta[delivery.phase].short} · {delivery.outcome}</b><span>{delivery.workPackageIds.join(' / ')} → {delivery.gateIds.join(' / ') || '非阶段门'}</span></li>)}</ul></section>
    </aside></>}
  </section>;
}

function ProgramPillarDetail({ pillar }: { pillar: ProgramPillar }) {
  const implementation = roadmapPhases.map((phase) => {
    const workPackages = phase.workPackages.filter((item) => item.pillars.includes(pillar.id));
    const explicitGateIds = new Set(workPackages.flatMap((item) => item.gateIds));
    const gates = phase.gates.filter((gate) => explicitGateIds.has(gate.id));
    return { phase, workPackages, gates };
  });
  return <article
    className="programPillarDetail"
    id="program-pillar-detail"
    role="region"
    aria-labelledby={`program-pillar-tab-${pillar.id}`}
  >
    <span className="srOnly" aria-live="polite">已展开{pillar.title}技术路线</span>
    <header>
      <p><span>{pillar.no}</span>{pillar.english}</p>
      <h3>{pillar.title}</h3>
      <b>{pillar.mission}</b>
    </header>
    <div className="programPillarQuestion"><small>核心科学 / 工程问题</small><p>{pillar.physicsQuestion}</p></div>
    <div className="programPillarPhaseContributions">
      <section><span>PHASE I · EXL‑50U</span><p>{pillar.phase1}</p></section>
      <section><span>PHASE II · EHL‑2</span><p>{pillar.phase2}</p></section>
    </div>
    <ProgramPillarSubrouteMap key={pillar.id} pillar={pillar} />
    <ol className="programPillarRoute" aria-label={`${pillar.title}技术路线`}>
      {pillar.route.map((step, index) => <li key={step.id} data-route-status={step.status}>
        <div><small>{step.id}</small><i>{phaseNames(step.phases)}</i><em>{step.status}</em></div>
        <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <section><h4>{step.title}</h4><p>{step.selection}</p><b>边界：{step.boundary}</b></section>
      </li>)}
    </ol>
    <div className="programPillarContracts">
      <section><h4>输入约束</h4><ul>{pillar.inputs.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section><h4>结果产品</h4><ul>{pillar.outputs.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section><h4>验证与过门证据</h4><ul>{pillar.verification.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <aside><h4>不允许作出的结论</h4><p>{pillar.boundary}</p></aside>
    </div>
    <nav className="programPillarModules" aria-label={`${pillar.title}关联知识模块`}>
      <small>关联知识模块</small>
      {pillar.modules.map((module) => <a href={`#module-${module}`} key={module}>{moduleTitle(module)}</a>)}
    </nav>
    <div className="programPillarImplementation" aria-label={`${pillar.title}实施工作包与阶段门`}>
      {implementation.map(({ phase, workPackages, gates }) => <section key={phase.id}>
        <span>{phase.id === 'phase-1' ? 'PHASE I · EXL‑50U' : 'PHASE II · EHL‑2'}</span>
        <div>{workPackages.map((item) => <a href={phase.id === 'phase-1' ? '#phase-one' : '#phase-two'} key={item.id}><b>{item.id}</b>{item.title}<small>{item.gateIds.length ? `${item.commitment} · → ${item.gateIds.join(' / ')}` : `${item.commitment} · 非阶段门`}</small></a>)}</div>
        <p>本支柱汇总阶段门：{gates.map((gate) => `${gate.id} ${gate.title}`).join(' · ') || '无必过阶段门'}</p>
      </section>)}
    </div>
  </article>;
}

export function ProgramSystemMap() {
  const chartTheme = useChartTheme();
  const colors = useMemo(() => pillarPalette(chartTheme), [chartTheme]);
  const [selectedId, setSelectedId] = useState<ProgramPillarId>('physics');
  const selected = programPillars.find((pillar) => pillar.id === selectedId) ?? programPillars[0];
  const option = useMemo(() => systemMapOption(selectedId, colors, chartTheme), [selectedId, colors, chartTheme]);

  return <div className="programSystemMapShell">
    <div className="programRouteLevels" aria-label="路线图信息层级">
      <span><small>L0</small>装置事实与实验任务</span>
      <i aria-hidden="true">→</i>
      <span><small>L1</small>五大专业环节</span>
      <i aria-hidden="true">→</i>
      <span><small>L2</small>统一数字线程与 V&amp;V</span>
      <i aria-hidden="true">→</i>
      <span><small>L3</small>两期目标与长期实验支撑</span>
    </div>
    <ScientificChart
      id="fusion-twin-system-support-map"
      option={option}
      ariaLabel="聚变数字孪生五大专业环节、统一证据链和两期目标支撑关系图。点击环节节点后，下方显示详细技术选型。"
      fallbackSrc=""
      fallbackAlt="聚变数字孪生目标支撑总览静态回退"
      height={640}
      eager
      className="programSystemMapChart"
      fallback={<table className="programChartFallback programSystemFallback">
        <caption>五大专业环节如何支撑两期目标</caption>
        <thead><tr><th>专业环节</th><th>关键技术链</th><th>一期 EXL‑50U</th><th>二期 EHL‑2</th></tr></thead>
        <tbody>{programPillars.map((pillar) => <tr key={pillar.id}><th>{pillar.no} · {pillar.title}</th><td>{pillar.route.map((step) => step.title).join(' → ')}</td><td>{pillar.phase1}</td><td>{pillar.phase2}</td></tr>)}</tbody>
      </table>}
      onChartClick={(params) => {
        const data = chartObjectData(params);
        const id = typeof data?.id === 'string' ? data.id as ProgramPillarId : null;
        if (id && programPillars.some((pillar) => pillar.id === id)) setSelectedId(id);
      }}
    />
    <nav className="programPillarTabs" aria-label="选择专业技术环节">
      {programPillars.map((pillar) => <button
        type="button"
        id={`program-pillar-tab-${pillar.id}`}
        aria-pressed={pillar.id === selected.id}
        aria-controls="program-pillar-detail"
        className={pillar.id === selected.id ? 'isActive' : ''}
        style={{ '--program-pillar-color': colors[pillar.id] } as CSSProperties}
        onClick={() => setSelectedId(pillar.id)}
        key={pillar.id}
      ><small>{pillar.no}</small><b>{pillar.title}</b><span>{pillar.english}</span></button>)}
    </nav>
    <ProgramPillarDetail pillar={selected} />
    <div className="programPrintPillars">
      {programPillars.map((pillar) => {
        const routeMap = programPillarRouteMaps[pillar.id];
        return <section key={pillar.id}>
        <h3>{pillar.no} · {pillar.title}</h3>
        <p>{pillar.mission}</p>
        <p><b>专业覆盖：</b>{routeMap.coverage.map((item) => `${item.label}（${item.description}）`).join('；')}</p>
        <p><b>候选工具：</b>{routeMap.tools.map((tool) => `${tool.label} / ${tool.fullName}（${tool.maturity}；${programToolRoleLabels[tool.role]}）`).join('；')}</p>
        <h4>专业覆盖 → 工具 → 技术子路线 → 阶段交付</h4>
        <ol>{routeMap.routes.map((route) => <li key={route.id}>
          <b>{route.title}</b>：{routeCoverageLabels(routeMap, route).join('、')} → {routeTools(routeMap, route).map((tool) => tool.label).join('、')} → {route.deliveries.map((delivery) => `${phaseDeliveryMeta[delivery.phase].short} ${delivery.outcome}（${delivery.workPackageIds.join('/')}→${delivery.gateIds.join('/') || '非阶段门'}）`).join('；')}；边界：{route.boundary}
        </li>)}</ol>
        <h4>步骤详解</h4>
        <ol>{pillar.route.map((step) => <li key={step.id}><b>{step.title}</b>：{step.selection}（{phaseNames(step.phases)} · {step.status}）</li>)}</ol>
        <p><b>一期：</b>{pillar.phase1}</p><p><b>二期：</b>{pillar.phase2}</p>
        <p><b>输入：</b>{pillar.inputs.join('；')}</p>
        <p><b>输出：</b>{pillar.outputs.join('；')}</p>
        <p><b>验证证据：</b>{pillar.verification.join('；')}</p>
        <p><b>工作包→阶段门：</b>{roadmapPhases.flatMap((phase) => phase.workPackages.filter((item) => item.pillars.includes(pillar.id)).map((item) => `${item.id}→${item.gateIds.length ? item.gateIds.join('/') : '非阶段门'}`)).join('；')}</p>
        <p><b>适用边界：</b>{pillar.boundary}</p>
      </section>})}
    </div>
    <noscript><style>{'.programSystemMapChart,.programPillarTabs,.programPillarDetail{display:none!important}.scientificChartStatus{display:none!important}'}</style><div className="programNoScriptPillars">{programPillars.map((pillar) => {
      const routeMap = programPillarRouteMaps[pillar.id];
      return <section key={pillar.id}>
      <h3>{pillar.no} · {pillar.title}</h3>
      <p>{pillar.mission}</p>
      <h4>核心科学问题</h4><p>{pillar.physicsQuestion}</p>
      <h4>专业覆盖</h4><ul>{routeMap.coverage.map((item) => <li key={item.id}><b>{item.label}</b>：{item.description}</li>)}</ul>
      <h4>候选工具链</h4><ul>{routeMap.tools.map((tool) => <li key={tool.id}><b>{tool.label} / {tool.fullName}</b>（{tool.maturity}）：{programToolRoleLabels[tool.role]}；输入：{tool.inputs.join('、')}；输出：{tool.outputs.join('、')}；证据：{tool.evidence}；边界：{tool.boundary}</li>)}</ul>
      <h4>专业覆盖 → 工具 → 技术子路线 → 阶段交付</h4><ol>{routeMap.routes.map((route) => <li key={route.id}><b>{route.title}</b>：{routeCoverageLabels(routeMap, route).join('、')} → {routeTools(routeMap, route).map((tool) => tool.label).join('、')} → {route.deliveries.map((delivery) => `${phaseDeliveryMeta[delivery.phase].short} ${delivery.outcome}（${delivery.workPackageIds.join('/')}→${delivery.gateIds.join('/') || '非阶段门'}）`).join('；')}；边界：{route.boundary}</li>)}</ol>
      <h4>技术链</h4><ol>{pillar.route.map((step) => <li key={step.id}><b>{step.title}</b>：{step.selection}（{phaseNames(step.phases)} · {step.status}）；边界：{step.boundary}</li>)}</ol>
      <h4>一期 / 二期</h4><p>{pillar.phase1}</p><p>{pillar.phase2}</p>
      <h4>输入 / 输出</h4><p>{pillar.inputs.join('；')}</p><p>{pillar.outputs.join('；')}</p>
      <h4>验证证据</h4><p>{pillar.verification.join('；')}</p>
      <h4>工作包→阶段门</h4><p>{roadmapPhases.flatMap((phase) => phase.workPackages.filter((item) => item.pillars.includes(pillar.id)).map((item) => `${item.id}→${item.gateIds.length ? item.gateIds.join('/') : '非阶段门'}`)).join('；')}</p>
      <h4>不允许作出的结论</h4><p>{pillar.boundary}</p>
    </section>})}</div></noscript>
  </div>;
}

function PhaseChart({ phase }: { phase: RoadmapPhase }) {
  const chartTheme = useChartTheme();
  const colors = useMemo(() => pillarPalette(chartTheme), [chartTheme]);
  const [selectedId, setSelectedId] = useState(phase.workPackages[0]?.id ?? '');
  const selected = phase.workPackages.find((item) => item.id === selectedId) ?? phase.workPackages[0];
  const option = useMemo(() => phaseOption(phase, colors, selectedId, chartTheme), [phase, colors, selectedId, chartTheme]);

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
    <p><span>{item.id}</span><em>{item.commitment}</em>{phase.axisLabel} {item.start}–{item.end}（含首尾周期）</p>
    <h3>{item.title}</h3>
    <dl>
      <div><dt>责任主线</dt><dd>{item.owner}</dd></div>
      <div><dt>技术环节</dt><dd>{item.pillars.map((pillar) => programPillars.find((candidate) => candidate.id === pillar)?.title ?? pillar).join(' · ')}</dd></div>
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
