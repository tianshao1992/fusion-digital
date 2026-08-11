'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import { useMemo } from 'react';
import ScientificChart from '../components/charts/ScientificChart';

const FONT_FAMILY = '"Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC",Arial,sans-serif';
const INK = '#17324d';
const MUTED = '#607068';
const GRID = '#d8e2e2';

type TooltipItem = {
  name: string;
  value: unknown[];
};

function readTooltipItem(params: unknown): TooltipItem | null {
  const candidate = Array.isArray(params) ? params[0] : params;
  if (!candidate || typeof candidate !== 'object') return null;
  const record = candidate as Record<string, unknown>;
  const data = record.data;
  const name = typeof record.name === 'string' ? record.name : '';

  if (Array.isArray(data)) return { name, value: data };
  if (!data || typeof data !== 'object') return null;
  const dataRecord = data as Record<string, unknown>;
  return {
    name: typeof dataRecord.name === 'string' ? dataRecord.name : name,
    value: Array.isArray(dataRecord.value) ? dataRecord.value : [],
  };
}

const TIME_WINDOWS = ['μs–ms', 'ms–s', 's–min', 'min–h', '脉冲–年'];

const DOMAIN_WINDOWS = [
  { name: '瞬态电磁', values: [0, 1, 2, 1, 0], tools: 'DINA / CARIDDI / ThinCurr' },
  { name: '结构动力学', values: [0, 1, 2, 1, 0], tools: 'Abaqus / Ansys / Code_Aster' },
  { name: '磁体失超', values: [0, 1, 2, 1, 1], tools: '4C / THEA / JackPot' },
  { name: 'PFC 热机械', values: [0, 1, 2, 1, 1], tools: 'HEAT / MEMENTO / FEM' },
  { name: '冷却 CFD', values: [0, 0, 1, 2, 1], tools: 'CFX / OpenFOAM / NekRS' },
  { name: '中子输运', values: [1, 1, 2, 1, 1], tools: 'MCNP / OpenMC / TRIPOLI-4' },
  { name: '活化/剂量', values: [0, 0, 0, 2, 1], tools: 'FISPACT-II / R2S / D1S' },
  { name: '包层 MHD', values: [0, 1, 2, 1, 1], tools: 'HIMAG / FreeMHD / COMSOL' },
  { name: '氚迁移', values: [0, 0, 1, 2, 1], tools: 'FESTIM / TMAP8 / mHIT' },
  { name: '真空/低温', values: [0, 1, 2, 1, 1], tools: 'Molflow+ / 4C / 系统码' },
  { name: '安全瞬态', values: [0, 0, 1, 2, 1], tools: 'MELCOR Fusion / ATHENA' },
  { name: '远程维护', values: [0, 0, 0, 2, 1], tools: 'DELMIA / ROS / VR' },
];

const DOMAIN_HEATMAP_DATA = DOMAIN_WINDOWS.flatMap((domain, domainIndex) =>
  domain.values.map((value, windowIndex) => [windowIndex, domainIndex, value, domain.tools]),
);

const TOOL_CATEGORIES = [
  '控制/平衡',
  '瞬态电磁',
  '结构',
  '磁体/低温',
  'PFC/CFD',
  '中子/活化',
  '包层/氚',
  '安全系统',
  '维护/RAMI',
];

const CATEGORY_COLORS: Record<string, string> = {
  '控制/平衡': '#2c8fa3',
  '瞬态电磁': '#35789a',
  结构: '#d97a3a',
  '磁体/低温': '#b24b76',
  'PFC/CFD': '#49a99f',
  '中子/活化': '#c59b32',
  '包层/氚': '#2f879d',
  安全系统: '#b4473f',
  '维护/RAMI': '#17324d',
};

const TOOL_POINTS = [
  { name: 'MEQ', category: '控制/平衡', seconds: 0.001 },
  { name: 'DINA', category: '控制/平衡', seconds: 2 },
  { name: 'ThinCurr', category: '瞬态电磁', seconds: 100 },
  { name: 'CARIDDI / Maxwell', category: '瞬态电磁', seconds: 20_000 },
  { name: 'Code_Aster', category: '结构', seconds: 10_000 },
  { name: 'Ansys / Abaqus', category: '结构', seconds: 30_000 },
  { name: '4C / THEA', category: '磁体/低温', seconds: 2_000 },
  { name: 'JackPot', category: '磁体/低温', seconds: 100_000 },
  { name: 'HEAT', category: 'PFC/CFD', seconds: 300 },
  { name: 'OpenFOAM / NekRS', category: 'PFC/CFD', seconds: 100_000 },
  { name: 'CFX / STAR-CCM+', category: 'PFC/CFD', seconds: 200_000 },
  { name: 'FISPACT / R2S', category: '中子/活化', seconds: 100_000 },
  { name: 'OpenMC / Serpent', category: '中子/活化', seconds: 200_000 },
  { name: 'MCNP / TRIPOLI', category: '中子/活化', seconds: 500_000 },
  { name: 'GETTHEM', category: '包层/氚', seconds: 100 },
  { name: 'FESTIM / TMAP8', category: '包层/氚', seconds: 20_000 },
  { name: 'FreeMHD / HIMAG', category: '包层/氚', seconds: 200_000 },
  { name: 'MELCOR Fusion', category: '安全系统', seconds: 2_000 },
  { name: 'ATHENA-INTRA', category: '安全系统', seconds: 5_000 },
  { name: 'DELMIA / ROS', category: '维护/RAMI', seconds: 200 },
  { name: 'RAMI / 离散事件', category: '维护/RAMI', seconds: 1_000 },
];

export const engineeringRoadmapStages = [
  {
    id: 'E0',
    title: '载荷接口基线',
    period: '0—12 个月',
    startMonth: 0,
    endMonth: 12,
    detail: 'DINA/MEQ 历史回放；建立资产 ID、CAD/线圈/导体版本、场景时间线、单位和守恒检查。',
    color: '#17324d',
  },
  {
    id: 'E1',
    title: '破裂电磁窄孪生',
    period: '12—24 个月',
    startMonth: 12,
    endMonth: 24,
    detail: '接入三维导体模型和结构 ROM；比较磁探针、壁电压、应变、位移与反力；先影子运行，再影响阈值。',
    color: '#15849a',
  },
  {
    id: 'E2',
    title: '热与磁体状态',
    period: '2—3 年',
    startMonth: 24,
    endMonth: 36,
    detail: '以 IR/量热校准 PFC 热状态；以电压、流量、压力和模型线圈数据校准 CICC/低温状态估计。',
    color: '#ed7d31',
  },
  {
    id: 'E3',
    title: '核—包层—氚',
    period: '3—5 年',
    startMonth: 36,
    endMonth: 60,
    detail: '连接核热/TBR/活化、冷却/MHD、氚渗透和库存；形成部件寿命、停机剂量和材料批次账本。',
    color: '#c2386b',
  },
  {
    id: 'E4',
    title: '整厂运行与 RAMI',
    period: '4—8 年',
    startMonth: 48,
    endMonth: 96,
    detail: '把安全、维护、备件、可用率、功率转换、电网和许可证据接入全生命周期数字线程。',
    color: '#6554c0',
  },
];

const renderEngineeringRoadmapRange: CustomSeriesRenderItem = (_params, api) => {
  const stageIndex = Number(api.value(0));
  const startMonth = Number(api.value(1));
  const endMonth = Number(api.value(2));
  const start = api.coord([startMonth, stageIndex]);
  const end = api.coord([endMonth, stageIndex]);
  const rawLaneSize = api.size?.([0, 1]);
  const laneHeight = Array.isArray(rawLaneSize) ? Math.abs(Number(rawLaneSize[1])) : 44;
  const barHeight = Math.max(18, laneHeight * 0.54);
  const stage = engineeringRoadmapStages[stageIndex];

  return {
    type: 'rect',
    shape: {
      x: start[0],
      y: start[1] - barHeight / 2,
      width: Math.max(2, end[0] - start[0]),
      height: barHeight,
      r: 5,
    },
    style: { fill: stage?.color ?? INK, opacity: 0.94 },
    emphasis: {
      style: { opacity: 1, shadowBlur: 8, shadowColor: '#17324d40' },
    },
  };
};

function formatLogTick(value: number | string) {
  const numeric = Number(value);
  if (!(numeric > 0)) return '';
  const exponent = Math.round(Math.log10(numeric));
  const superscript = String(exponent)
    .replace('-', '⁻')
    .replaceAll('0', '⁰')
    .replaceAll('1', '¹')
    .replaceAll('2', '²')
    .replaceAll('3', '³')
    .replaceAll('4', '⁴')
    .replaceAll('5', '⁵')
    .replaceAll('6', '⁶')
    .replaceAll('7', '⁷')
    .replaceAll('8', '⁸')
    .replaceAll('9', '⁹');
  return `10${superscript}`;
}

function formatDuration(seconds: number) {
  if (seconds < 1) return `${Math.round(seconds * 1_000)} ms`;
  if (seconds < 60) return `${seconds.toLocaleString('zh-CN')} s`;
  if (seconds < 3_600) return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86_400) return `${(seconds / 3_600).toFixed(1)} h`;
  return `${(seconds / 86_400).toFixed(1)} d`;
}

export function EngineeringDomainMatrixChart() {
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff',
    textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: {
      enabled: true,
      description: '十二类工程仿真域在五个时间窗口中的相关尺度和主要决策尺度矩阵。',
    },
    grid: { left: 96, right: 18, top: 22, bottom: 78, containLabel: false },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: '#ffffffee',
      borderColor: '#9fb2aa',
      textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params);
        if (!item) return '';
        const windowIndex = Number(item.value[0]);
        const domainIndex = Number(item.value[1]);
        const level = Number(item.value[2]);
        const tools = String(item.value[3] ?? '');
        const levelLabel = level === 2 ? '主要决策尺度' : level === 1 ? '相关尺度' : '非主要窗口';
        return `<b>${DOMAIN_WINDOWS[domainIndex]?.name ?? ''}</b><br/>${TIME_WINDOWS[windowIndex] ?? ''} · ${levelLabel}<br/>典型工具：${tools}<br/><span style="color:${MUTED}">编辑性尺度分类，非性能承诺</span>`;
      },
    },
    xAxis: {
      type: 'category',
      data: TIME_WINDOWS,
      splitArea: { show: true, areaStyle: { color: ['#f8faf8', '#f8faf8'] } },
      axisLine: { lineStyle: { color: '#82938b' } },
      axisTick: { show: false },
      axisLabel: { interval: 0, rotate: 18, color: '#33463d', fontSize: 10, margin: 12 },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: DOMAIN_WINDOWS.map((domain) => domain.name),
      axisLine: { lineStyle: { color: '#82938b' } },
      axisTick: { show: false },
      axisLabel: { color: '#273a32', fontSize: 10, margin: 10 },
    },
    visualMap: {
      type: 'piecewise',
      orient: 'horizontal',
      left: 'center',
      bottom: 12,
      selectedMode: false,
      itemWidth: 20,
      itemHeight: 10,
      textStyle: { color: MUTED, fontFamily: FONT_FAMILY, fontSize: 10 },
      pieces: [
        { value: 2, label: '主要尺度', color: '#17324d' },
        { value: 1, label: '相关尺度', color: '#d9e8e8' },
        { value: 0, label: '非主要窗口', color: '#f7f8f5' },
      ],
    },
    series: [{
      name: '工程域时间尺度',
      type: 'heatmap',
      data: DOMAIN_HEATMAP_DATA,
      itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
      emphasis: {
        itemStyle: { borderColor: '#ff8738', borderWidth: 2, shadowBlur: 8, shadowColor: '#17324d30' },
      },
    }],
  }), []);

  return (
    <ScientificChart
      id="engineering-domain-timescale"
      option={option}
      ariaLabel="工程域与时间尺度交互热图；深色为主要决策尺度，浅色为相关尺度"
      fallbackSrc="/figures/engineering-domain-matrix-nature.png"
      fallbackAlt="工程仿真时间尺度矩阵"
      className="engineeringChart engineeringHeatmapChart"
      height={600}
    />
  );
}

export function EngineeringToolLandscapeChart() {
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff',
    textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: {
      enabled: true,
      description: '工程仿真工具按任务类别和典型单次任务耗时数量级排列的对数散点图。',
    },
    grid: { left: 82, right: 24, top: 26, bottom: 64 },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: '#ffffffee',
      borderColor: '#9fb2aa',
      textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params);
        if (!item) return '';
        const seconds = Number(item.value[0]);
        const category = String(item.value[1] ?? '');
        return `<b>${item.name}</b><br/>${category}<br/>典型量级：约 ${formatDuration(seconds)}（${seconds.toLocaleString('zh-CN')} s）<br/><span style="color:${MUTED}">编辑性数量级，非求解器性能承诺</span>`;
      },
    },
    xAxis: {
      type: 'log',
      logBase: 10,
      min: 1e-4,
      max: 1e8,
      name: '典型单次任务耗时 / s（对数轴）',
      nameLocation: 'middle',
      nameGap: 38,
      nameTextStyle: { color: MUTED, fontSize: 10, fontFamily: FONT_FAMILY },
      axisLine: { lineStyle: { color: '#82938b' } },
      axisTick: { show: false },
      axisLabel: { color: '#33463d', fontSize: 10, formatter: formatLogTick },
      splitLine: { show: true, lineStyle: { color: GRID, width: 1 } },
      minorSplitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: TOOL_CATEGORIES,
      axisLine: { lineStyle: { color: '#82938b' } },
      axisTick: { show: false },
      axisLabel: { color: '#273a32', fontSize: 10, margin: 10 },
      splitLine: { show: true, lineStyle: { color: '#eef2ef' } },
    },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
    series: [{
      name: '典型任务耗时',
      type: 'scatter',
      symbolSize: 12,
      data: TOOL_POINTS.map((point) => ({
        name: point.name,
        value: [point.seconds, point.category],
        itemStyle: { color: CATEGORY_COLORS[point.category] },
      })),
      label: {
        show: true,
        formatter: '{b}',
        position: 'right',
        distance: 5,
        color: '#31443b',
        fontFamily: FONT_FAMILY,
        fontSize: 9,
      },
      labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
      emphasis: {
        scale: 1.45,
        label: { show: true, fontWeight: 800, color: INK },
        itemStyle: { borderColor: '#ffffff', borderWidth: 2, shadowBlur: 8, shadowColor: '#17324d40' },
      },
    }],
  }), []);

  return (
    <ScientificChart
      id="engineering-tool-runtime-landscape"
      option={option}
      ariaLabel="工程仿真工具典型任务耗时对数散点图；位置是编辑性数量级，不是性能承诺"
      fallbackSrc="/figures/engineering-tool-landscape-nature.png"
      fallbackAlt="工程仿真工具版图"
      className="engineeringChart engineeringLandscapeChart"
      height={600}
    />
  );
}

export function EngineeringRoadmapChart() {
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff',
    textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: {
      enabled: true,
      description: '工程数字孪生 E0 到 E4 五阶段的零到九十六个月规划区间图；E3 与 E4 在第四到第五年并行。',
    },
    grid: { left: 132, right: 24, top: 38, bottom: 58 },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: '#ffffffee',
      borderColor: '#9fb2aa',
      textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params);
        if (!item) return '';
        const start = Number(item.value[1]);
        const end = Number(item.value[2]);
        const id = String(item.value[3] ?? '');
        const title = String(item.value[4] ?? '');
        const period = String(item.value[5] ?? '');
        const detail = String(item.value[6] ?? '');
        return `<b>${id} · ${title}</b><br/>${period}（第 ${start}—${end} 个月）<br/>${detail}<br/><span style="color:${MUTED}">路线规划区间，非项目进度承诺</span>`;
      },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 96,
      interval: 12,
      name: '规划时间 / 月',
      nameLocation: 'middle',
      nameGap: 36,
      nameTextStyle: { color: MUTED, fontSize: 10, fontFamily: FONT_FAMILY },
      axisLine: { lineStyle: { color: '#82938b' } },
      axisTick: { show: false },
      axisLabel: {
        color: '#33463d',
        fontSize: 10,
        formatter: (value: number) => value === 0 ? '当前' : `${value / 12} 年`,
      },
      splitLine: { show: true, lineStyle: { color: GRID } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: engineeringRoadmapStages.map((stage) => `${stage.id}  ${stage.title}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#273a32', fontSize: 10, margin: 12 },
    },
    series: [{
      name: '路线规划区间',
      type: 'custom',
      clip: true,
      encode: { x: [1, 2], y: 0 },
      renderItem: renderEngineeringRoadmapRange,
      data: engineeringRoadmapStages.map((stage, index) => ({
        name: `${stage.id} · ${stage.title}`,
        value: [index, stage.startMonth, stage.endMonth, stage.id, stage.title, stage.period, stage.detail],
      })),
      markArea: {
        silent: true,
        itemStyle: { color: '#8a6bd514' },
        label: { show: true, color: '#6554c0', fontFamily: FONT_FAMILY, fontSize: 9, formatter: 'E3 / E4 并行窗' },
        data: [[{ xAxis: 48 }, { xAxis: 60 }]],
      },
    }],
  }), []);

  return (
    <ScientificChart
      id="engineering-digital-twin-roadmap"
      option={option}
      ariaLabel="工程数字孪生 E0 到 E4 路线规划甘特图；E3 为三到五年，E4 为四到八年并行推进"
      fallbackSrc="/figures/engineering-roadmap-nature.png"
      fallbackAlt="DINA MEQ 到工程数字孪生路线图"
      className="engineeringChart engineeringRoadmapChart"
      height={480}
    />
  );
}
