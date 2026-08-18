'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import { useMemo, useState, type CSSProperties } from 'react';
import ScientificChart, { LocalizedChartRegion } from '../components/charts/ScientificChart';
import { useChartTheme } from '../components/charts/chart-theme';
import { useI18n } from '../i18n/I18nProvider';
import {
  knowledgeModuleRoutes,
  localizeKnowledgeModuleRoutes,
  localizeProgramPillars,
  localizeProgramSupportLinks,
  localizeRoadmapPhases,
  programSupportLinks,
  type ProgramPillar,
  type ProgramPillarId,
  type RoadmapPhase,
  type RoadmapWorkPackage,
} from './program-roadmap-data';
import {
  localizeProgramPillarRouteMaps,
  type PillarTechnicalRoute as ProgramPillarRoute,
  type ProgramPillarRouteMap,
  type ProgramToolRole,
} from './program-pillar-route-maps';

type RoadmapLocale = 'zh-CN' | 'en';

function ui(locale: RoadmapLocale, zh: string, en: string) {
  return locale === 'en' ? en : zh;
}

function useLocalizedRoadmapData() {
  const { locale } = useI18n();
  return useMemo(() => ({
    locale,
    pillars: localizeProgramPillars(locale),
    supportLinks: localizeProgramSupportLinks(locale),
    phases: localizeRoadmapPhases(locale),
    modules: localizeKnowledgeModuleRoutes(locale),
    routeMaps: localizeProgramPillarRouteMaps(locale),
  }), [locale]);
}

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

function pillarChartLabels(locale: RoadmapLocale): Record<ProgramPillarId, string> {
  return locale === 'en' ? {
    physics: '01\nCONFIGURATION &\nPLASMA PHYSICS',
    engineering: '02\nENGINEERING\nMULTIPHYSICS',
    control: '03\nINTEGRATED CONTROL &\nVIRTUAL COMMISSIONING',
    diagnostics: '04\nDIAGNOSTICS &\nRECONSTRUCTION',
    data: '05\nDATA, SEMANTICS &\nEVIDENCE',
  } : {
    physics: '01\n位形与\n等离子体物理',
    engineering: '02\n工程多物理场',
    control: '03\n集成控制与\n虚拟调试',
    diagnostics: '04\n诊断、重构与\n状态感知',
    data: '05\n数据、语义与\n证据基座',
  };
}

function systemMapOption(
  selectedId: ProgramPillarId,
  colors: PillarPalette,
  chartTheme: ReturnType<typeof useChartTheme>,
  pillars: readonly ProgramPillar[],
  supportLinks: typeof programSupportLinks,
  locale: RoadmapLocale,
): EChartsCoreOption {
  const labels = pillarChartLabels(locale);
  const pillarY: Record<ProgramPillarId, number> = { physics: 70, engineering: 180, control: 290, diagnostics: 400, data: 520 };
  const pillarNodes = pillars.map((pillar) => ({
    id: pillar.id,
    name: labels[pillar.id],
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
  const semanticLinks = supportLinks.map((link, index) => {
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
  const selectedPillar = pillars.find((pillar) => pillar.id === selectedId) ?? pillars[0];
  const compactNodes = [
    { id: 'mission', name: ui(locale, '装置事实与实验任务', 'Machine facts and experimental mission'), x: 50, y: 20, symbol: 'roundRect', symbolSize: [150, 50], category: 0, value: ui(locale, '受控装置描述、实验目标、配置与约束', 'Controlled Machine Description, objective, configuration and constraints'), itemStyle: { color: rootColor, borderColor: chartTheme.line, borderWidth: 2 }, label: { color: chartTheme.text } },
    { id: selectedId, name: `${selectedPillar.no} · ${selectedPillar.title}`, x: 50, y: 130, symbol: 'roundRect', symbolSize: [158, 54], category: 1, value: selectedPillar.mission, itemStyle: { color: colors[selectedId], borderColor: chartTheme.text, borderWidth: 3 }, label: { color: contrastingLabel(colors[selectedId]) } },
    { id: 'integration', name: ui(locale, '统一数字线程与 V&V', 'Common digital thread and V&V'), x: 50, y: 245, symbol: 'diamond', symbolSize: 88, category: 2, value: ui(locale, '统一身份、接口、运行清单、残差、适用域和阶段门', 'Common identity, interfaces, run manifests, residuals, applicability and evidence gates'), itemStyle: { color: hubColor, borderColor: chartTheme.line, borderWidth: 2 }, label: { color: contrastingLabel(hubColor) } },
    { id: 'phase-1-goal', name: ui(locale, '一期 · EXL‑50U\n3 个月闭环', 'PHASE I · EXL‑50U\n3-month closed loop'), x: 18, y: 365, symbol: 'roundRect', symbolSize: [132, 54], category: 3, value: ui(locale, 'EXL‑50U 三个月最小闭环', 'EXL‑50U three-month minimum closed loop'), itemStyle: { color: phaseOneColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(phaseOneColor) } },
    { id: 'phase-2-goal', name: ui(locale, '二期 · EHL‑2\n虚拟首炮就绪', 'PHASE II · EHL‑2\nVirtual first-plasma readiness'), x: 82, y: 365, symbol: 'roundRect', symbolSize: [132, 54], category: 3, value: ui(locale, 'EHL‑2 六个月虚拟 first-plasma readiness', 'EHL‑2 six-month virtual first-plasma readiness'), itemStyle: { color: phaseTwoColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(phaseTwoColor) } },
    { id: 'long-term-goal', name: ui(locale, '长期目标\n证据可追溯的实验支撑', 'LONG-TERM TARGET\nTraceable experimental support'), x: 50, y: 480, symbol: 'roundRect', symbolSize: [166, 64], category: 3, value: ui(locale, '持续服务实验规划、运行复盘、模型更新与工程决策', 'Sustained support for experiment planning, post-shot review, model revision and engineering decisions'), itemStyle: { color: finalColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(finalColor) } },
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
      description: ui(locale, '聚变数字孪生目标支撑总览。装置事实与实验任务进入位形物理、工程仿真、集成控制、诊断感知和数据模型基础设施；五个环节汇聚到统一数字线程与验证阶段门，依次支撑 EXL-50U 三个月最小闭环、EHL-2 六个月首等离子体虚拟调试和长期实验支撑目标。', 'Fusion digital-twin programme support map. Machine facts and experimental missions enter configuration physics, engineering simulation, integrated control, diagnostics and data / model infrastructure. These five pillars converge through a common digital thread and evidence gates to support the EXL-50U three-month minimum closed loop, EHL-2 six-month virtual first-plasma commissioning and long-term experimental support.'),
    },
    legend: {
      bottom: 2,
      data: locale === 'en' ? ['Mission inputs', 'Technical pillars', 'Integration and V&V', 'Programme goals'] : ['任务输入', '专业环节', '集成与验证', '阶段目标'],
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
          return `<b>${supportNodeLabel(data.source, pillars, locale)} → ${supportNodeLabel(data.target, pillars, locale)}</b><br/>${String(data.value ?? ui(locale, '受控接口', 'Controlled interface'))}`;
        }
        const pillar = pillars.find((item) => item.id === data.id);
        if (pillar) return `<b>${pillar.no} · ${pillar.title}</b><br/>${pillar.mission}`;
        return `<b>${String(data.name ?? '')}</b><br/>${String(data.value ?? '')}`;
      },
    },
    series: [{
      type: 'graph',
      name: ui(locale, '目标支撑关系', 'Programme support relationships'),
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
          id: 'mission', name: ui(locale, '装置事实与实验任务\nMachine · Shot · Scenario', 'MACHINE FACTS & MISSION\nMachine · Shot · Scenario'), x: 55, y: 290,
          symbol: 'roundRect', symbolSize: [174, 82], category: 0, value: ui(locale, '受控装置描述、实验目标、配置与约束', 'Controlled Machine Description, experimental objective, configuration and constraints'),
          itemStyle: { color: rootColor, borderColor: chartTheme.line, borderWidth: 2 }, label: { color: chartTheme.text },
        },
        ...pillarNodes,
        {
          id: 'integration', name: ui(locale, '统一数字线程与 V&V\n编排 · 比较 · 证据过门', 'COMMON DIGITAL THREAD & V&V\nOrchestrate · Compare · Gate evidence'), x: 620, y: 290,
          symbol: 'diamond', symbolSize: 136, category: 2, value: ui(locale, '统一身份、接口、运行清单、残差、适用域和阶段门', 'Common identity, interfaces, run manifests, residuals, applicability and evidence gates'),
          itemStyle: { color: hubColor, borderColor: chartTheme.line, borderWidth: 2 }, label: { color: contrastingLabel(hubColor) },
        },
        {
          id: 'phase-1-goal', name: ui(locale, '一期 · EXL‑50U\n3 个月最小闭环', 'PHASE I · EXL‑50U\n3-month minimum closed loop'), x: 900, y: 185,
          symbol: 'roundRect', symbolSize: [178, 86], category: 3, value: ui(locale, '计划—预演—控制测试—实验—重构—工程复核—回写', 'Plan—rehearse—test control—experiment—reconstruct—review engineering—revise'),
          itemStyle: { color: phaseOneColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(phaseOneColor) },
        },
        {
          id: 'phase-2-goal', name: ui(locale, '二期 · EHL‑2\n6 个月虚拟 first-plasma readiness', 'PHASE II · EHL‑2\n6-month virtual first-plasma readiness'), x: 900, y: 395,
          symbol: 'roundRect', symbolSize: [208, 92], category: 3, value: ui(locale, '虚拟调试、最小诊断、故障演练与只读 shadow；不代表实体装置在六个月内实现首等离子体', 'Virtual commissioning, minimum diagnostics, fault rehearsal and read-only shadow; this is not a claim that the physical machine will achieve first plasma within six months'),
          itemStyle: { color: phaseTwoColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(phaseTwoColor) },
        },
        {
          id: 'long-term-goal', name: ui(locale, '长期目标\n实验驱动、证据可追溯的\n聚变数字孪生基础设施', 'LONG-TERM TARGET\nExperiment-driven, evidence-traceable\nfusion digital-twin infrastructure'), x: 1140, y: 290,
          symbol: 'roundRect', symbolSize: [196, 104], category: 3, value: ui(locale, '持续服务实验规划、运行复盘、模型更新与工程决策', 'Sustained support for experiment planning, post-shot review, model revision and engineering decisions'),
          itemStyle: { color: finalColor, borderColor: chartTheme.background, borderWidth: 2 }, label: { color: contrastingLabel(finalColor) },
        },
      ],
      links: semanticLinks,
      categories: [
        { name: ui(locale, '任务输入', 'Mission inputs'), itemStyle: { color: rootColor } },
        { name: ui(locale, '专业环节', 'Technical pillars'), itemStyle: { color: colors.physics } },
        { name: ui(locale, '集成与验证', 'Integration and V&V'), itemStyle: { color: hubColor } },
        { name: ui(locale, '阶段目标', 'Programme goals'), itemStyle: { color: phaseOneColor } },
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

function supportNodeLabel(id: string, pillars: readonly ProgramPillar[], locale: RoadmapLocale) {
  return pillars.find((pillar) => pillar.id === id)?.title ?? (locale === 'en' ? {
    mission: 'Machine facts and experimental mission',
    integration: 'Common digital thread and V&V',
    'phase-1-goal': 'Phase I EXL‑50U minimum closed loop',
    'phase-2-goal': 'Phase II EHL‑2 virtual first-plasma readiness',
    'long-term-goal': 'Long-term experimental-support target',
  } : {
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
  const conditional = commitment !== '关键路径' && commitment !== 'Critical path';
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
  locale: RoadmapLocale,
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
      description: locale === 'en'
        ? `${phase.device} ${phase.duration} programme roadmap. Each swimlane is a proposed execution interval for one work package. Vertical lines are evidence-based gates, not automatic date-driven completion.`
        : `${phase.device}${phase.duration}项目路线图。每条泳道表示一个工作包的建议执行区间；竖线表示必须以证据通过的阶段门，不表示按日期自动完成。`,
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
      name: ui(locale, '工作包', 'Work packages'),
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

function phaseNames(phases: readonly RoadmapPhase['id'][], locale: RoadmapLocale) {
  return phases.map((phase) => phase === 'phase-1' ? ui(locale, '一期', 'Phase I') : ui(locale, '二期', 'Phase II')).join(' + ');
}

function moduleTitle(id: string, modules: ReturnType<typeof localizeKnowledgeModuleRoutes>) {
  return modules.find((module) => module.id === id)?.title ?? id;
}

function moduleHref(id: string) {
  return knowledgeModuleRoutes.find((module) => module.id === id)?.route ?? `/knowledge-graph#module-${id}`;
}

type ProgramRoutePhaseFilter = 'all' | RoadmapPhase['id'];

function phaseDeliveryMeta(locale: RoadmapLocale): Record<RoadmapPhase['id'], { short: string; title: string }> {
  return locale === 'en' ? {
    'phase-1': { short: 'Phase I', title: 'EXL‑50U · 3-month closed-loop delivery' },
    'phase-2': { short: 'Phase II', title: 'EHL‑2 · virtual first-plasma readiness delivery' },
  } : {
    'phase-1': { short: '一期', title: 'EXL‑50U · 3 个月闭环交付' },
    'phase-2': { short: '二期', title: 'EHL‑2 · 虚拟首炮就绪交付' },
  };
}

function programToolRoleLabels(locale: RoadmapLocale): Record<ProgramToolRole, string> {
  return locale === 'en' ? {
    'fact-archive': 'Authoritative source-of-record archive',
    'semantic-exchange': 'Cross-model semantic exchange',
    'pre-shot-forward': 'Pre-shot forward rehearsal',
    'as-shot-inverse': 'As-shot inverse reconstruction',
    'realtime-plant': 'Real-time control plant',
    'offline-hi-fi': 'Offline high-fidelity analysis',
    'synthetic-diagnostic': 'Synthetic-diagnostic forward model',
    'control-test': 'Control verification and fault injection',
    'supervisory-readonly': 'Supervisory read-only integration',
    'engineering-solver': 'Engineering multiphysics solver',
    vvuq: 'Verification, validation and uncertainty quantification',
    'evidence-ui': 'Evidence navigation and decision interface',
  } : {
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
}

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
  pillars: readonly ProgramPillar[],
  locale: RoadmapLocale,
): EChartsCoreOption {
  const routeMapTitle = pillars.find((pillar) => pillar.id === routeMap.pillarId)?.title ?? routeMap.pillarId;
  const deliveryMeta = phaseDeliveryMeta(locale);
  const roleLabels = programToolRoleLabels(locale);
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
      value: `${coverage.description}\n${ui(locale, '术语', 'Terms')}: ${coverage.terms.join(' · ')}`,
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
      value: `${tool.fullName}\n${roleLabels[tool.role]}\n${tool.maturity}`,
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
        .join(locale === 'en' ? '; ' : '；');
      return {
        id: `phase:${phase}`,
        entityId: phase,
        nodeKind: 'phase',
        name: `${deliveryMeta[phase].short}\n${compactChartLabel(deliveryMeta[phase].title, 12)}`,
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
          value: `${delivery.outcome}\n${delivery.workPackageIds.join(' / ')} → ${delivery.gateIds.join(' / ') || ui(locale, '非阶段门', 'Not a programme gate')}`,
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
      name: `L0 · ${ui(locale, '专业覆盖', 'Professional coverage')}\n${compactChartLabel(mobileCoverage.map((item) => item.label).join(' · '), 18)}`,
      value: mobileCoverage.map((item) => `${item.label}: ${item.description}`).join('\n'), x: 50, y: 40,
      symbol: 'roundRect', symbolSize: [270, 88], category: 0,
      itemStyle: { color: coverageColor, borderColor: pillarColor, borderWidth: 2 }, label: { color: chartTheme.text },
    },
    {
      id: 'mobile:tools', entityId: selectedRoute.id, nodeKind: 'route',
      name: `L1 · ${ui(locale, '候选工具链', 'Candidate toolchain')}\n${compactChartLabel(mobileTools.map((item) => item.label).join(' · '), 18)}`,
      value: mobileTools.map((item) => `${item.label}: ${roleLabels[item.role]}`).join('\n'), x: 50, y: 170,
      symbol: 'roundRect', symbolSize: [270, 88], category: 1,
      itemStyle: { color: toolColor, borderColor: pillarColor, borderWidth: 2 }, label: { color: chartTheme.text },
    },
    {
      id: `route:${selectedRoute.id}`, entityId: selectedRoute.id, nodeKind: 'route',
      name: `L2 · ${ui(locale, '技术子路线', 'Technical subroute')}\n${compactChartLabel(selectedRoute.title, 16)}`, value: selectedRoute.detail, x: 50, y: 300,
      symbol: 'diamond', symbolSize: 126, category: 2,
      itemStyle: { color: pillarColor, borderColor: chartTheme.text, borderWidth: 3 }, label: { color: contrastingLabel(pillarColor) },
    },
    ...mobileDeliveries.map((delivery, index) => ({
      id: `phase:${delivery.phase}`, entityId: delivery.phase, nodeKind: 'phase',
      name: `L3 · ${deliveryMeta[delivery.phase].short} ${ui(locale, '交付', 'delivery')}\n${compactChartLabel(delivery.outcome, 18)}`,
      value: `${delivery.outcome}\n${delivery.workPackageIds.join(' / ')} → ${delivery.gateIds.join(' / ') || ui(locale, '非阶段门', 'Not a programme gate')}`,
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
      description: locale === 'en'
        ? `${routeMapTitle} four-layer technical-subroute map. Professional coverage is implemented by candidate tools, assembled into verifiable subroutes and mapped to Phase I EXL‑50U and Phase II EHL‑2 deliveries. Current focus: ${selectedRoute?.title ?? 'first subroute'}.`
        : `${routeMapTitle}四层技术子路线图。专业覆盖经候选工具链形成可验证技术子路线，并映射到一期 EXL-50U 与二期 EHL-2 交付。当前聚焦${selectedRoute?.title ?? '第一条子路线'}。`,
    },
    legend: {
      bottom: 4,
      data: locale === 'en' ? ['Professional coverage', 'Candidate toolchain', 'Technical subroute', 'Phase I / II delivery'] : ['专业覆盖', '候选工具链', '技术子路线', '一期 / 二期交付'],
      itemWidth: 14,
      itemHeight: 9,
      textStyle: { fontSize: 10 },
    },
    graphic: [
      { type: 'text', left: '6%', top: 14, style: { text: `L0  ${ui(locale, '专业覆盖', 'PROFESSIONAL COVERAGE')}`, fill: chartTheme.muted, font: '800 11px sans-serif' } },
      { type: 'text', left: '31%', top: 14, style: { text: `L1  ${ui(locale, '候选工具链', 'CANDIDATE TOOLCHAIN')}`, fill: chartTheme.muted, font: '800 11px sans-serif' } },
      { type: 'text', left: '57%', top: 14, style: { text: `L2  ${ui(locale, '技术子路线', 'TECHNICAL SUBROUTE')}`, fill: chartTheme.muted, font: '800 11px sans-serif' } },
      { type: 'text', right: '6%', top: 14, style: { text: `L3  ${ui(locale, '阶段交付', 'PROGRAMME DELIVERY')}`, fill: chartTheme.muted, font: '800 11px sans-serif' } },
    ],
    tooltip: {
      trigger: 'item',
      borderWidth: 1,
      formatter: (params: unknown) => {
        const data = chartObjectData(params);
        if (!data) return '';
        if (typeof data.source === 'string' && typeof data.target === 'string') {
          return `<b>${ui(locale, '受控技术接口', 'Controlled technical interface')}</b><br/>${String(data.value ?? ui(locale, '输入 / 输出契约', 'Input / output contract'))}`;
        }
        const kind = data.nodeKind === 'coverage' ? ui(locale, '专业覆盖', 'Professional coverage')
          : data.nodeKind === 'tool' ? ui(locale, '候选工具链', 'Candidate toolchain')
            : data.nodeKind === 'route' ? ui(locale, '技术子路线', 'Technical subroute') : ui(locale, '阶段交付', 'Programme delivery');
        return `<b>${kind} · ${String(data.name ?? '').replaceAll('\n', ' ')}</b><br/>${String(data.value ?? '').replaceAll('\n', '<br/>')}`;
      },
    },
    series: [{
      type: 'graph',
      name: ui(locale, '专业覆盖', 'Professional coverage'),
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
        { name: ui(locale, '专业覆盖', 'Professional coverage'), itemStyle: { color: coverageColor } },
        { name: ui(locale, '候选工具链', 'Candidate toolchain'), itemStyle: { color: toolColor } },
        { name: ui(locale, '技术子路线', 'Technical subroute'), itemStyle: { color: pillarColor } },
        { name: ui(locale, '一期 / 二期交付', 'Phase I / II delivery'), itemStyle: { color: phaseColors['phase-1'] } },
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
  const { locale, pillars, modules, routeMaps } = useLocalizedRoadmapData();
  const colors = useMemo(() => pillarPalette(chartTheme), [chartTheme]);
  const routeMap = routeMaps[pillar.id];
  const [phaseFilter, setPhaseFilter] = useState<ProgramRoutePhaseFilter>('all');
  const [selectedRouteId, setSelectedRouteId] = useState(routeMap.routes[0]?.id ?? '');
  const visibleRoutes = phaseFilter === 'all' ? routeMap.routes : routeMap.routes.filter((route) => route.phases.includes(phaseFilter));
  const selectedRoute = visibleRoutes.find((route) => route.id === selectedRouteId) ?? visibleRoutes[0] ?? routeMap.routes[0];
  const selectedTools = selectedRoute ? routeTools(routeMap, selectedRoute) : [];
  const option = useMemo(
    () => pillarSubrouteOption(routeMap, selectedRouteId, phaseFilter, colors[pillar.id], chartTheme, pillars, locale),
    [routeMap, selectedRouteId, phaseFilter, colors, pillar.id, chartTheme, pillars, locale],
  );
  const deliveryMeta = phaseDeliveryMeta(locale);
  const roleLabels = programToolRoleLabels(locale);
  const chartId = `program-pillar-subroute-${pillar.id}`;
  function choosePhase(nextPhase: ProgramRoutePhaseFilter) {
    setPhaseFilter(nextPhase);
    const nextRoutes = nextPhase === 'all' ? routeMap.routes : routeMap.routes.filter((route) => route.phases.includes(nextPhase));
    if (!nextRoutes.some((route) => route.id === selectedRouteId)) setSelectedRouteId(nextRoutes[0]?.id ?? routeMap.routes[0]?.id ?? '');
  }
  return <LocalizedChartRegion><section className="programPillarSubrouteMap" aria-labelledby={`${chartId}-title`}>
    <header className="programPillarSubrouteHeader">
      <div><small>PROFESSIONAL SUBROUTE MAP</small><h4 id={`${chartId}-title`}>{ui(locale, '专业覆盖 → 工具链 → 技术子路线 → 阶段交付', 'Professional coverage → Toolchain → Technical subroute → Programme delivery')}</h4></div>
      <p>{ui(locale, '节点展示“研究覆盖什么、用什么工具、如何接成受控技术链、形成什么可验收结果”。工具为候选技术栈，须经装置基准题与适用域审查后固化。', 'Each node states the covered physics or engineering scope, selected tools, controlled technical chain and measurable result. Tools remain candidates until frozen by machine-specific benchmarks and an applicability-domain review.')}</p>
    </header>
    <div className="programPillarSubrouteControls">
      <nav className="programPillarPhaseFilter" aria-label={`${pillar.title} ${ui(locale, '路线阶段筛选', 'subroute phase filter')}`}>
        {([['all', ui(locale, '全部阶段', 'All phases')], ['phase-1', ui(locale, '一期 · EXL‑50U', 'Phase I · EXL‑50U')], ['phase-2', ui(locale, '二期 · EHL‑2', 'Phase II · EHL‑2')]] as const).map(([id, label]) => <button
          type="button"
          key={id}
          className={phaseFilter === id ? 'isActive' : ''}
          aria-pressed={phaseFilter === id}
          aria-controls={chartId}
          onClick={() => choosePhase(id)}
        >{label}</button>)}
      </nav>
      <nav className="programPillarRouteSelector" aria-label={`${pillar.title} ${ui(locale, '技术子路线', 'technical subroutes')}`}>
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
      ariaLabel={locale === 'en' ? `${pillar.title} four-layer map of professional coverage, candidate toolchains, technical subroutes and Phase I / II deliveries. Use the buttons above to select a phase or subroute, or select a graph node to focus a related route.` : `${pillar.title}专业覆盖、候选工具链、技术子路线与一期二期交付的四层关系图。可用上方原生按钮选择阶段和子路线，或点击图中节点聚焦关联路线。`}
      fallbackSrc=""
      fallbackAlt={`${pillar.title} ${ui(locale, '四层技术子路线静态回退', 'four-layer technical-subroute static fallback')}`}
      height={650}
      eager
      className="programPillarSubrouteChart"
      fallback={<table className="programChartFallback programPillarSubrouteFallback">
        <caption>{pillar.title}: {ui(locale, '专业覆盖—工具—子路线—交付映射', 'coverage—tool—subroute—delivery mapping')}</caption>
        <thead><tr><th>{ui(locale, '专业覆盖', 'Professional coverage')}</th><th>{ui(locale, '候选工具链', 'Candidate toolchain')}</th><th>{ui(locale, '技术子路线', 'Technical subroute')}</th><th>{ui(locale, '一期 / 二期交付', 'Phase I / II delivery')}</th></tr></thead>
        <tbody>{routeMap.routes.map((route) => <tr key={route.id}>
          <td>{routeCoverageLabels(routeMap, route).join(locale === 'en' ? '; ' : '；')}</td>
          <td>{routeTools(routeMap, route).map((tool) => `${tool.label} (${tool.maturity})`).join(locale === 'en' ? '; ' : '；')}</td>
          <th>{route.title}<small>{route.detail}</small><small>{ui(locale, '边界', 'Boundary')}: {route.boundary}</small></th>
          <td>{route.deliveries.map((delivery) => `${deliveryMeta[delivery.phase].short}: ${delivery.outcome}`).join(locale === 'en' ? '; ' : '；')}</td>
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
    {selectedRoute && <><span className="srOnly" aria-live="polite">{ui(locale, '已聚焦', 'Focused on')} {selectedRoute.id} {selectedRoute.title}</span><aside className="programPillarSubrouteFocus" id={`${chartId}-detail`} role="region" aria-labelledby={`${chartId}-focus-title`}>
      <header><small>{ui(locale, '当前聚焦', 'CURRENT FOCUS')} · {selectedRoute.status}</small><h4 id={`${chartId}-focus-title`}>{selectedRoute.title}</h4><p>{selectedRoute.detail}</p><b className="programPillarSubrouteBoundary">{ui(locale, '适用边界', 'Applicability boundary')}: {selectedRoute.boundary}</b></header>
      <section><h5>{ui(locale, '覆盖的聚变专业内容', 'Covered fusion-science and engineering scope')}</h5><ul>{selectedRoute.coverageIds.map((id) => {
        const coverage = routeMap.coverage.find((item) => item.id === id);
        return coverage ? <li key={coverage.id}><b>{coverage.label}</b><span>{coverage.description}</span><small>{ui(locale, '术语', 'Terms')}: {coverage.terms.join(' · ')}</small></li> : null;
      })}</ul></section>
      <section><h5>{ui(locale, '候选工具与输入 / 输出', 'Candidate tools and input / output contracts')}</h5><ul>{selectedTools.map((tool) => {
        return <li key={tool.id}><b>{tool.label}<em>{tool.maturity}</em></b><span>{tool.fullName} · {roleLabels[tool.role]}</span><small>{ui(locale, '输入', 'Inputs')}: {tool.inputs.join(locale === 'en' ? ', ' : '、')}; {ui(locale, '输出', 'Outputs')}: {tool.outputs.join(locale === 'en' ? ', ' : '、')}</small><small>V&amp;V: {tool.evidence}</small><small>{ui(locale, '边界', 'Boundary')}: {tool.boundary}</small><small className="programPillarToolResearch">{ui(locale, '关联调研', 'Related research')}: {tool.moduleIds.map((moduleId) => <a href={moduleHref(moduleId)} key={moduleId}>{moduleTitle(moduleId, modules)}</a>)}</small></li>;
      })}</ul></section>
      <section><h5>{ui(locale, '阶段交付与证据门', 'Programme deliveries and evidence gates')}</h5><ul>{selectedRoute.deliveries.map((delivery) => <li key={delivery.phase}><b>{deliveryMeta[delivery.phase].short} · {delivery.outcome}</b><span>{delivery.workPackageIds.join(' / ')} → {delivery.gateIds.join(' / ') || ui(locale, '非阶段门', 'Not a programme gate')}</span></li>)}</ul></section>
    </aside></>}
  </section></LocalizedChartRegion>;
}

function ProgramPillarDetail({ pillar }: { pillar: ProgramPillar }) {
  const { locale, phases, modules } = useLocalizedRoadmapData();
  const implementation = phases.map((phase) => {
    const workPackages = phase.workPackages.filter((item) => item.pillars.includes(pillar.id));
    const explicitGateIds = new Set(workPackages.flatMap((item) => item.gateIds));
    const gates = phase.gates.filter((gate) => explicitGateIds.has(gate.id));
    return { phase, workPackages, gates };
  });
  return <LocalizedChartRegion><article
    className="programPillarDetail"
    id="program-pillar-detail"
    role="region"
    aria-labelledby={`program-pillar-tab-${pillar.id}`}
  >
    <span className="srOnly" aria-live="polite">{ui(locale, '已展开', 'Expanded')} {pillar.title} {ui(locale, '技术路线', 'technical route')}</span>
    <header>
      <p><span>{pillar.no}</span>{pillar.english}</p>
      <h3>{pillar.title}</h3>
      <b>{pillar.mission}</b>
    </header>
    <div className="programPillarQuestion"><small>{ui(locale, '核心科学 / 工程问题', 'CORE SCIENCE / ENGINEERING QUESTION')}</small><p>{pillar.physicsQuestion}</p></div>
    <div className="programPillarPhaseContributions">
      <section><span>PHASE I · EXL‑50U</span><p>{pillar.phase1}</p></section>
      <section><span>PHASE II · EHL‑2</span><p>{pillar.phase2}</p></section>
    </div>
    <ProgramPillarSubrouteMap key={pillar.id} pillar={pillar} />
    <ol className="programPillarRoute" aria-label={`${pillar.title} ${ui(locale, '技术路线', 'technical route')}`}>
      {pillar.route.map((step, index) => <li key={step.id} data-route-status={step.status}>
        <div><small>{step.id}</small><i>{phaseNames(step.phases, locale)}</i><em>{step.status}</em></div>
        <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <section><h4>{step.title}</h4><p>{step.selection}</p><b>{ui(locale, '边界', 'Boundary')}: {step.boundary}</b></section>
      </li>)}
    </ol>
    <div className="programPillarContracts">
      <section><h4>{ui(locale, '输入约束', 'Input constraints')}</h4><ul>{pillar.inputs.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section><h4>{ui(locale, '结果产品', 'Output products')}</h4><ul>{pillar.outputs.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <section><h4>{ui(locale, '验证与过门证据', 'V&V and gate evidence')}</h4><ul>{pillar.verification.map((item) => <li key={item}>{item}</li>)}</ul></section>
      <aside><h4>{ui(locale, '不允许作出的结论', 'Claims explicitly out of scope')}</h4><p>{pillar.boundary}</p></aside>
    </div>
    <nav className="programPillarModules" aria-label={`${pillar.title} ${ui(locale, '关联知识模块', 'related knowledge modules')}`}>
      <small>{ui(locale, '关联知识模块', 'RELATED KNOWLEDGE MODULES')}</small>
      {pillar.modules.map((module) => <a href={`#module-${module}`} key={module}>{moduleTitle(module, modules)}</a>)}
    </nav>
    <div className="programPillarImplementation" aria-label={`${pillar.title} ${ui(locale, '实施工作包与阶段门', 'implementation work packages and evidence gates')}`}>
      {implementation.map(({ phase, workPackages, gates }) => <section key={phase.id}>
        <span>{phase.id === 'phase-1' ? 'PHASE I · EXL‑50U' : 'PHASE II · EHL‑2'}</span>
        <div>{workPackages.map((item) => <a href={phase.id === 'phase-1' ? '#phase-one' : '#phase-two'} key={item.id}><b>{item.id}</b>{item.title}<small>{item.gateIds.length ? `${item.commitment} · → ${item.gateIds.join(' / ')}` : `${item.commitment} · ${ui(locale, '非阶段门', 'Not a programme gate')}`}</small></a>)}</div>
        <p>{ui(locale, '本支柱汇总阶段门', 'Evidence gates reached by this pillar')}: {gates.map((gate) => `${gate.id} ${gate.title}`).join(' · ') || ui(locale, '无必过阶段门', 'No mandatory programme gate')}</p>
      </section>)}
    </div>
  </article></LocalizedChartRegion>;
}

export function ProgramSystemMap() {
  const chartTheme = useChartTheme();
  const { locale, pillars, supportLinks, phases, routeMaps } = useLocalizedRoadmapData();
  const colors = useMemo(() => pillarPalette(chartTheme), [chartTheme]);
  const [selectedId, setSelectedId] = useState<ProgramPillarId>('physics');
  const selected = pillars.find((pillar) => pillar.id === selectedId) ?? pillars[0];
  const option = useMemo(() => systemMapOption(selectedId, colors, chartTheme, pillars, supportLinks, locale), [selectedId, colors, chartTheme, pillars, supportLinks, locale]);
  const deliveryMeta = phaseDeliveryMeta(locale);
  const roleLabels = programToolRoleLabels(locale);

  return <LocalizedChartRegion><div className="programSystemMapShell">
    <div className="programRouteLevels" aria-label={ui(locale, '路线图信息层级', 'Roadmap information hierarchy')}>
      <span><small>L0</small>{ui(locale, '装置事实与实验任务', 'Machine facts and experimental mission')}</span>
      <i aria-hidden="true">→</i>
      <span><small>L1</small>{ui(locale, '五大专业环节', 'Five technical pillars')}</span>
      <i aria-hidden="true">→</i>
      <span><small>L2</small>{ui(locale, '统一数字线程与 V&V', 'Common digital thread and V&V')}</span>
      <i aria-hidden="true">→</i>
      <span><small>L3</small>{ui(locale, '两期目标与长期实验支撑', 'Two programme phases and long-term experimental support')}</span>
    </div>
    <ScientificChart
      id="fusion-twin-system-support-map"
      option={option}
      ariaLabel={ui(locale, '聚变数字孪生五大专业环节、统一证据链和两期目标支撑关系图。点击环节节点后，下方显示详细技术选型。', 'Fusion digital-twin map connecting five technical pillars through a common evidence chain to the two programme phases. Select a pillar to inspect its technical choices.')}
      fallbackSrc=""
      fallbackAlt={ui(locale, '聚变数字孪生目标支撑总览静态回退', 'Static fallback for the fusion digital-twin programme support map')}
      height={640}
      eager
      className="programSystemMapChart"
      fallback={<table className="programChartFallback programSystemFallback">
        <caption>{ui(locale, '五大专业环节如何支撑两期目标', 'How the five technical pillars support both programme phases')}</caption>
        <thead><tr><th>{ui(locale, '专业环节', 'Technical pillar')}</th><th>{ui(locale, '关键技术链', 'Critical technical chain')}</th><th>{ui(locale, '一期 EXL‑50U', 'Phase I EXL‑50U')}</th><th>{ui(locale, '二期 EHL‑2', 'Phase II EHL‑2')}</th></tr></thead>
        <tbody>{pillars.map((pillar) => <tr key={pillar.id}><th>{pillar.no} · {pillar.title}</th><td>{pillar.route.map((step) => step.title).join(' → ')}</td><td>{pillar.phase1}</td><td>{pillar.phase2}</td></tr>)}</tbody>
      </table>}
      onChartClick={(params) => {
        const data = chartObjectData(params);
        const id = typeof data?.id === 'string' ? data.id as ProgramPillarId : null;
        if (id && pillars.some((pillar) => pillar.id === id)) setSelectedId(id);
      }}
    />
    <nav className="programPillarTabs" aria-label={ui(locale, '选择专业技术环节', 'Select a technical pillar')}>
      {pillars.map((pillar) => <button
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
      {pillars.map((pillar) => {
        const routeMap = routeMaps[pillar.id];
        return <section key={pillar.id}>
        <h3>{pillar.no} · {pillar.title}</h3>
        <p>{pillar.mission}</p>
        <p><b>{ui(locale, '专业覆盖', 'Professional coverage')}: </b>{routeMap.coverage.map((item) => `${item.label} (${item.description})`).join(locale === 'en' ? '; ' : '；')}</p>
        <p><b>{ui(locale, '候选工具', 'Candidate tools')}: </b>{routeMap.tools.map((tool) => `${tool.label} / ${tool.fullName} (${tool.maturity}; ${roleLabels[tool.role]})`).join(locale === 'en' ? '; ' : '；')}</p>
        <h4>{ui(locale, '专业覆盖 → 工具 → 技术子路线 → 阶段交付', 'Professional coverage → Tool → Technical subroute → Programme delivery')}</h4>
        <ol>{routeMap.routes.map((route) => <li key={route.id}>
          <b>{route.title}</b>: {routeCoverageLabels(routeMap, route).join(locale === 'en' ? ', ' : '、')} → {routeTools(routeMap, route).map((tool) => tool.label).join(locale === 'en' ? ', ' : '、')} → {route.deliveries.map((delivery) => `${deliveryMeta[delivery.phase].short} ${delivery.outcome} (${delivery.workPackageIds.join('/')}→${delivery.gateIds.join('/') || ui(locale, '非阶段门', 'Not a programme gate')})`).join(locale === 'en' ? '; ' : '；')}; {ui(locale, '边界', 'Boundary')}: {route.boundary}
        </li>)}</ol>
        <h4>{ui(locale, '步骤详解', 'Route steps')}</h4>
        <ol>{pillar.route.map((step) => <li key={step.id}><b>{step.title}</b>: {step.selection} ({phaseNames(step.phases, locale)} · {step.status})</li>)}</ol>
        <p><b>{ui(locale, '一期', 'Phase I')}: </b>{pillar.phase1}</p><p><b>{ui(locale, '二期', 'Phase II')}: </b>{pillar.phase2}</p>
        <p><b>{ui(locale, '输入', 'Inputs')}: </b>{pillar.inputs.join(locale === 'en' ? '; ' : '；')}</p>
        <p><b>{ui(locale, '输出', 'Outputs')}: </b>{pillar.outputs.join(locale === 'en' ? '; ' : '；')}</p>
        <p><b>{ui(locale, '验证证据', 'V&V evidence')}: </b>{pillar.verification.join(locale === 'en' ? '; ' : '；')}</p>
        <p><b>{ui(locale, '工作包→阶段门', 'Work package → evidence gate')}: </b>{phases.flatMap((phase) => phase.workPackages.filter((item) => item.pillars.includes(pillar.id)).map((item) => `${item.id}→${item.gateIds.length ? item.gateIds.join('/') : ui(locale, '非阶段门', 'Not a programme gate')}`)).join(locale === 'en' ? '; ' : '；')}</p>
        <p><b>{ui(locale, '适用边界', 'Applicability boundary')}: </b>{pillar.boundary}</p>
      </section>})}
    </div>
    <noscript><style>{'.programSystemMapChart,.programPillarTabs,.programPillarDetail{display:none!important}.scientificChartStatus{display:none!important}'}</style><div className="programNoScriptPillars">{pillars.map((pillar) => {
      const routeMap = routeMaps[pillar.id];
      return <section key={pillar.id}>
      <h3>{pillar.no} · {pillar.title}</h3>
      <p>{pillar.mission}</p>
      <h4>{ui(locale, '核心科学问题', 'Core science / engineering question')}</h4><p>{pillar.physicsQuestion}</p>
      <h4>{ui(locale, '专业覆盖', 'Professional coverage')}</h4><ul>{routeMap.coverage.map((item) => <li key={item.id}><b>{item.label}</b>: {item.description}</li>)}</ul>
      <h4>{ui(locale, '候选工具链', 'Candidate toolchain')}</h4><ul>{routeMap.tools.map((tool) => <li key={tool.id}><b>{tool.label} / {tool.fullName}</b> ({tool.maturity}): {roleLabels[tool.role]}; {ui(locale, '输入', 'Inputs')}: {tool.inputs.join(locale === 'en' ? ', ' : '、')}; {ui(locale, '输出', 'Outputs')}: {tool.outputs.join(locale === 'en' ? ', ' : '、')}; {ui(locale, '证据', 'Evidence')}: {tool.evidence}; {ui(locale, '边界', 'Boundary')}: {tool.boundary}</li>)}</ul>
      <h4>{ui(locale, '专业覆盖 → 工具 → 技术子路线 → 阶段交付', 'Professional coverage → Tool → Technical subroute → Programme delivery')}</h4><ol>{routeMap.routes.map((route) => <li key={route.id}><b>{route.title}</b>: {routeCoverageLabels(routeMap, route).join(locale === 'en' ? ', ' : '、')} → {routeTools(routeMap, route).map((tool) => tool.label).join(locale === 'en' ? ', ' : '、')} → {route.deliveries.map((delivery) => `${deliveryMeta[delivery.phase].short} ${delivery.outcome} (${delivery.workPackageIds.join('/')}→${delivery.gateIds.join('/') || ui(locale, '非阶段门', 'Not a programme gate')})`).join(locale === 'en' ? '; ' : '；')}; {ui(locale, '边界', 'Boundary')}: {route.boundary}</li>)}</ol>
      <h4>{ui(locale, '技术链', 'Technical chain')}</h4><ol>{pillar.route.map((step) => <li key={step.id}><b>{step.title}</b>: {step.selection} ({phaseNames(step.phases, locale)} · {step.status}); {ui(locale, '边界', 'Boundary')}: {step.boundary}</li>)}</ol>
      <h4>{ui(locale, '一期 / 二期', 'Phase I / Phase II')}</h4><p>{pillar.phase1}</p><p>{pillar.phase2}</p>
      <h4>{ui(locale, '输入 / 输出', 'Inputs / outputs')}</h4><p>{pillar.inputs.join(locale === 'en' ? '; ' : '；')}</p><p>{pillar.outputs.join(locale === 'en' ? '; ' : '；')}</p>
      <h4>{ui(locale, '验证证据', 'V&V evidence')}</h4><p>{pillar.verification.join(locale === 'en' ? '; ' : '；')}</p>
      <h4>{ui(locale, '工作包→阶段门', 'Work package → evidence gate')}</h4><p>{phases.flatMap((phase) => phase.workPackages.filter((item) => item.pillars.includes(pillar.id)).map((item) => `${item.id}→${item.gateIds.length ? item.gateIds.join('/') : ui(locale, '非阶段门', 'Not a programme gate')}`)).join(locale === 'en' ? '; ' : '；')}</p>
      <h4>{ui(locale, '不允许作出的结论', 'Claims explicitly out of scope')}</h4><p>{pillar.boundary}</p>
    </section>})}</div></noscript>
  </div></LocalizedChartRegion>;
}

function PhaseChart({ phase }: { phase: RoadmapPhase }) {
  const chartTheme = useChartTheme();
  const { locale, pillars, modules } = useLocalizedRoadmapData();
  const colors = useMemo(() => pillarPalette(chartTheme), [chartTheme]);
  const [selectedId, setSelectedId] = useState(phase.workPackages[0]?.id ?? '');
  const selected = phase.workPackages.find((item) => item.id === selectedId) ?? phase.workPackages[0];
  const option = useMemo(() => phaseOption(phase, colors, selectedId, chartTheme, locale), [phase, colors, selectedId, chartTheme, locale]);

  return <LocalizedChartRegion><div className="programPhaseChartGrid">
    <div className="programPhaseChartMain">
      <ScientificChart
        id={`${phase.id}-program-roadmap`}
        option={option}
        ariaLabel={`${phase.device} ${phase.duration} ${ui(locale, '项目工作包与阶段门交互甘特图', 'interactive work-package and evidence-gate Gantt chart')}`}
        fallbackSrc=""
        fallbackAlt={`${phase.device} ${ui(locale, '路线图静态回退', 'roadmap static fallback')}`}
        height={phase.id === 'phase-1' ? 540 : 540}
        eager={phase.id === 'phase-1'}
        fallback={<table className="programChartFallback"><caption>{phase.device} {ui(locale, '工作包计划', 'work-package plan')}</caption><thead><tr><th>{ui(locale, '工作包', 'Work package')}</th><th>{ui(locale, '区间', 'Interval')}</th></tr></thead><tbody>{phase.workPackages.map((item) => <tr key={item.id}><th>{item.id} · {item.title}</th><td>{item.start}–{item.end}</td></tr>)}</tbody></table>}
        onChartClick={(params) => {
          const data = chartData(params);
          const id = typeof data?.[4] === 'string' ? data[4] : null;
          if (id && phase.workPackages.some((item) => item.id === id)) setSelectedId(id);
        }}
      />
      <nav className="programWorkPackageTabs" aria-label={`${phase.device} ${ui(locale, '工作包', 'work packages')}`}>
        {phase.workPackages.map((item) => <button type="button" key={item.id} className={item.id === selected.id ? 'isActive' : ''} aria-pressed={item.id === selected.id} onClick={() => setSelectedId(item.id)}><b>{item.id}</b><span>{item.lane}</span></button>)}
      </nav>
    </div>
    <WorkPackageDetail item={selected} phase={phase} pillars={pillars} modules={modules} locale={locale} />
  </div></LocalizedChartRegion>;
}

function WorkPackageDetail({ item, phase, pillars, modules, locale }: { item: RoadmapWorkPackage; phase: RoadmapPhase; pillars: readonly ProgramPillar[]; modules: ReturnType<typeof localizeKnowledgeModuleRoutes>; locale: RoadmapLocale }) {
  return <LocalizedChartRegion><aside className="programWorkPackageDetail" aria-live="polite">
    <p><span>{item.id}</span><em>{item.commitment}</em>{phase.axisLabel} {item.start}–{item.end} {ui(locale, '（含首尾周期）', '(inclusive periods)')}</p>
    <h3>{item.title}</h3>
    <dl>
      <div><dt>{ui(locale, '责任主线', 'Responsible workstream')}</dt><dd>{item.owner}</dd></div>
      <div><dt>{ui(locale, '技术环节', 'Technical pillars')}</dt><dd>{item.pillars.map((pillar) => pillars.find((candidate) => candidate.id === pillar)?.title ?? pillar).join(' · ')}</dd></div>
      <div><dt>{ui(locale, '正式交付', 'Formal deliverable')}</dt><dd>{item.deliverable}</dd></div>
      <div><dt>{ui(locale, '过门证据', 'Gate evidence')}</dt><dd>{item.evidence}</dd></div>
    </dl>
    <div className="programDetailModules"><small>{ui(locale, '关联知识模块', 'RELATED KNOWLEDGE MODULES')}</small>{item.modules.map((module) => <a href={`#module-${module}`} key={module}>{moduleTitle(module, modules)}</a>)}</div>
  </aside></LocalizedChartRegion>;
}

export default function ProgramRoadmapCharts() {
  const { phases } = useLocalizedRoadmapData();
  return <>{phases.map((phase) => <PhaseChart phase={phase} key={phase.id} />)}</>;
}

export function ProgramPhaseChart({ phaseId }: { phaseId: RoadmapPhase['id'] }) {
  const { phases } = useLocalizedRoadmapData();
  const phase = phases.find((item) => item.id === phaseId);
  return phase ? <PhaseChart phase={phase} /> : null;
}
