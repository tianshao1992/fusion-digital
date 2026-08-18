'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import { useMemo } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import { useI18n } from '../i18n';

const FONT_FAMILY = '"Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC",Arial,sans-serif';
const INK = '#17324d';
const MUTED = '#607068';
const GRID = '#d8e2e2';
const CYAN = '#238b91';
const ORANGE = '#ed7d31';
const RED = '#bd4b3f';

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
  if (seconds < 1) return `${Number((seconds * 1_000).toPrecision(2))} ms`;
  if (seconds < 60) return `${seconds.toLocaleString('zh-CN')} s`;
  if (seconds < 3_600) return `${Number((seconds / 60).toPrecision(2))} min`;
  if (seconds < 86_400) return `${Number((seconds / 3_600).toPrecision(2))} h`;
  if (seconds < 31_536_000) return `${Number((seconds / 86_400).toPrecision(2))} d`;
  return `${Number((seconds / 31_536_000).toPrecision(2))} y`;
}

const DECISION_WINDOWS = [
  { name: '磁位形控制', model: 'MEQ / LIUQE / EFIT / 响应模型', start: 1e-4, end: 1e-2, color: '#238b91' },
  { name: '破裂预警/缓解', model: '风险代理 + DREAM/JOREK 数据库', start: 1e-3, end: 1, color: '#bd4b3f' },
  { name: '放电场景设计', model: 'DINA/MEQ + 输运 + 源项', start: 10, end: 2e4, color: '#ed7d31' },
  { name: '实验解释', model: 'TRANSP/JINTRAC + 合成诊断', start: 30, end: 2e6, color: '#4c7ea3' },
  { name: '部件设计与安全', model: '中子学 + CFD/FEM + 氚/材料', start: 1e4, end: 3e7, color: '#b24b76' },
  { name: '维护与寿命', model: '损伤累积 + 状态估计 + RAMI', start: 3e3, end: 1e9, color: '#7664a8' },
  { name: '整厂优化', model: 'PROCESS/FUSE + 经济与电网', start: 1e4, end: 1e9, color: '#17324d' },
];
const DECISION_WINDOWS_EN = [
  { ...DECISION_WINDOWS[0], name: 'Magnetic-configuration control', model: 'MEQ / LIUQE / EFIT / response models' },
  { ...DECISION_WINDOWS[1], name: 'Disruption prediction / mitigation', model: 'Risk surrogates + DREAM/JOREK databases' },
  { ...DECISION_WINDOWS[2], name: 'Discharge-scenario design', model: 'DINA/MEQ + transport + source models' },
  { ...DECISION_WINDOWS[3], name: 'Experiment interpretation', model: 'TRANSP/JINTRAC + synthetic diagnostics' },
  { ...DECISION_WINDOWS[4], name: 'Component design and safety', model: 'Neutronics + CFD/FEM + tritium/materials' },
  { ...DECISION_WINDOWS[5], name: 'Maintenance and lifetime', model: 'Damage accumulation + state estimation + RAMI' },
  { ...DECISION_WINDOWS[6], name: 'Plant-level optimization', model: 'PROCESS/FUSE + economics and grid' },
];

const renderDecisionRange: CustomSeriesRenderItem = (_params, api) => {
  const category = Number(api.value(0));
  const start = Number(api.value(1));
  const end = Number(api.value(2));
  const color = String(api.value(3));
  const startPoint = api.coord([start, category]);
  const endPoint = api.coord([end, category]);
  const bandSize = api.size?.([0, 1]);
  const laneHeight = Array.isArray(bandSize) ? Math.abs(Number(bandSize[1])) : 42;
  const height = Math.max(12, Math.min(23, laneHeight * 0.42));
  return {
    type: 'group',
    children: [
      {
        type: 'rect',
        shape: { x: startPoint[0], y: startPoint[1] - height / 2, width: Math.max(3, endPoint[0] - startPoint[0]), height, r: height / 2 },
        style: { fill: color, opacity: 0.92 },
        emphasis: { style: { opacity: 1, shadowBlur: 10, shadowColor: `${color}66` } },
      },
      { type: 'circle', shape: { cx: startPoint[0], cy: startPoint[1], r: height / 2 }, style: { fill: color } },
      { type: 'circle', shape: { cx: endPoint[0], cy: endPoint[1], r: height / 2 }, style: { fill: color } },
    ],
  };
};

export function DecisionTimescaleChart() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const rows = en ? DECISION_WINDOWS_EN : DECISION_WINDOWS;
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff',
    textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: { enabled: true, description: en ? 'Logarithmic range chart of representative model timescales for seven fusion decision tasks, spanning 10^-4 to 10^9 seconds.' : '七类聚变决策任务从十的负四次方秒到十的九次方秒的典型模型时间窗口对数区间图。' },
    grid: { left: 112, right: 24, top: 30, bottom: 68 },
    tooltip: {
      trigger: 'item', confine: true, backgroundColor: '#ffffffee', borderColor: '#9fb2aa',
      textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params);
        if (!item) return '';
        const start = Number(item.value[1]);
        const end = Number(item.value[2]);
        return `<b>${String(item.value[4])}</b><br/>${String(item.value[5])}<br/>${en ? 'Representative window' : '典型窗口'}: ${formatDuration(start)} — ${formatDuration(end)}<br/><span style="color:${MUTED}">${en ? 'Editorial order-of-magnitude synthesis; not a solver benchmark or latency commitment' : '编辑性数量级综合，非求解器基准或时延承诺'}</span>`;
      },
    },
    xAxis: {
      type: 'log', logBase: 10, min: 1e-4, max: 1e9,
      name: en ? 'Decision / simulation time window / s (log scale)' : '决策 / 模拟时间窗口 / s（对数轴）', nameLocation: 'middle', nameGap: 40,
      nameTextStyle: { color: MUTED, fontSize: 10, fontFamily: FONT_FAMILY },
      axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false },
      axisLabel: { color: '#33463d', fontSize: 10, formatter: formatLogTick },
      splitLine: { show: true, lineStyle: { color: GRID } }, minorSplitLine: { show: false },
    },
    yAxis: {
      type: 'category', inverse: true, data: rows.map((item) => item.name),
      axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#273a32', fontSize: 10, margin: 12 },
    },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }],
    series: [{
      name: en ? 'Decision time window' : '决策时间窗口', type: 'custom', renderItem: renderDecisionRange, encode: { x: [1, 2], y: 0 },
      data: rows.map((item, index) => [index, item.start, item.end, item.color, item.name, item.model]),
    }],
    media: [{ query: { maxWidth: 560 }, option: { grid: { left: 86, right: 14, top: 24, bottom: 62 }, yAxis: { axisLabel: { fontSize: 8, width: 74, overflow: 'truncate' } }, xAxis: { axisLabel: { fontSize: 8 } } } }],
  }), [en, rows]);

  return (
    <>
      <ScientificChart id="physics-decision-timescale" option={option} ariaLabel={en ? 'Interactive logarithmic chart of fusion-model decision timescales; ranges are editorial orders of magnitude, not performance benchmarks' : '聚变模型决策时间尺度交互对数区间图；区间为编辑性数量级，不是性能基准'} fallbackSrc="/figures/decision-timescale-nature.png" fallbackAlt={en ? 'Static physics-model decision-timescale chart' : '物理模型决策时间尺度静态图'} fallback={en ? <table className="srOnly"><caption>Representative windows for fusion decision tasks</caption><thead><tr><th>Task</th><th>Model combination</th><th>Start</th><th>End</th></tr></thead><tbody>{rows.map((item) => <tr key={item.name}><th>{item.name}</th><td>{item.model}</td><td>{formatDuration(item.start)}</td><td>{formatDuration(item.end)}</td></tr>)}</tbody></table> : undefined} className="physicsChart physicsRangeChart" height={520} />
      <table className="srOnly"><caption>{en ? 'Representative windows for fusion decision tasks' : '聚变决策任务典型时间窗口'}</caption><thead><tr><th>{en ? 'Task' : '任务'}</th><th>{en ? 'Model combination' : '模型组合'}</th><th>{en ? 'Start' : '起点'}</th><th>{en ? 'End' : '终点'}</th></tr></thead><tbody>{rows.map((item) => <tr key={item.name}><th>{item.name}</th><td>{item.model}</td><td>{formatDuration(item.start)}</td><td>{formatDuration(item.end)}</td></tr>)}</tbody></table>
    </>
  );
}

const FIDELITY_POINTS = [
  { name: 'MEQ/LIUQE', seconds: 3e-4, dimension: 200, group: '在线模型', color: '#238b91' },
  { name: 'RAPTOR', seconds: 2e-2, dimension: 500, group: '在线模型', color: '#238b91' },
  { name: '代理/状态估计', seconds: 2e-4, dimension: 2e3, group: '在线模型', color: '#238b91' },
  { name: 'DINA', seconds: 3, dimension: 2e3, group: '场景模型', color: '#ed7d31' },
  { name: 'TGLF/QuaLiKiz', seconds: 50, dimension: 1e4, group: '场景模型', color: '#ed7d31' },
  { name: 'PROCESS/FUSE', seconds: 20, dimension: 100, group: '系统模型', color: '#7664a8' },
  { name: 'TRANSP/JINTRAC', seconds: 2e3, dimension: 2e4, group: '实验解释', color: '#4c7ea3' },
  { name: 'OpenMC/CFD/FEM', seconds: 5e4, dimension: 1e6, group: '工程证据', color: '#b24b76' },
  { name: 'SOLPS-ITER', seconds: 2e5, dimension: 5e4, group: '高保真证据', color: '#bd4b3f' },
  { name: 'GENE/CGYRO', seconds: 2e6, dimension: 5e5, group: '高保真证据', color: '#bd4b3f' },
  { name: 'JOREK', seconds: 5e6, dimension: 2e5, group: '高保真证据', color: '#bd4b3f' },
];
const FIDELITY_GROUPS_EN: Record<string, string> = {
  '在线模型': 'Online model', '场景模型': 'Scenario model', '系统模型': 'System model', '实验解释': 'Experiment interpretation',
  '工程证据': 'Engineering evidence', '高保真证据': 'High-fidelity evidence',
};

export function FidelityLatencyChart() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const points = FIDELITY_POINTS.map((point) => ({ ...point, name: en && point.name === '代理/状态估计' ? 'Surrogate / state estimation' : point.name, group: en ? FIDELITY_GROUPS_EN[point.group] : point.group }));
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff', textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: { enabled: true, description: en ? 'Log–log scatter plot of representative single-run solution time and effective state dimension for eleven classes of fusion model. Positions are editorial orders of magnitude.' : '十一类聚变模型的典型单次求解时间与有效状态维数双对数散点图，位置仅表示编辑性数量级。' },
    grid: { left: 68, right: 30, top: 34, bottom: 68 },
    tooltip: {
      trigger: 'item', confine: true, backgroundColor: '#ffffffee', borderColor: '#9fb2aa',
      textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params);
        if (!item) return '';
        return `<b>${item.name}</b><br/>${String(item.value[2])}<br/>${en ? 'Solution time: approximately' : '求解时间：约'} ${formatDuration(Number(item.value[0]))}<br/>${en ? 'Effective state dimension: approximately' : '有效状态维数：约'} ${Number(item.value[1]).toExponential(1)}<br/><span style="color:${MUTED}">${en ? 'Editorial order of magnitude; not a performance benchmark on common hardware' : '编辑性数量级，非统一硬件上的性能基准'}</span>`;
      },
    },
    xAxis: {
      type: 'log', logBase: 10, min: 1e-5, max: 1e8, name: en ? 'Representative single-run solution time / s (log scale)' : '典型单次求解时间 / s（对数轴）', nameLocation: 'middle', nameGap: 40,
      nameTextStyle: { color: MUTED, fontSize: 10 }, axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false },
      axisLabel: { color: '#33463d', fontSize: 10, formatter: formatLogTick }, splitLine: { show: true, lineStyle: { color: GRID } }, minorSplitLine: { show: false },
    },
    yAxis: {
      type: 'log', logBase: 10, min: 10, max: 1e7, name: en ? 'Effective state dimension (log scale)' : '有效状态维数（对数轴）', nameLocation: 'middle', nameGap: 48,
      nameTextStyle: { color: MUTED, fontSize: 10 }, axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false },
      axisLabel: { color: '#33463d', fontSize: 10, formatter: formatLogTick }, splitLine: { show: true, lineStyle: { color: GRID } }, minorSplitLine: { show: false },
    },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none' }, { type: 'inside', yAxisIndex: 0, filterMode: 'none' }],
    series: [{
      name: en ? 'Multi-fidelity models' : '多保真模型', type: 'scatter', symbolSize: 12,
      data: points.map((point) => ({ name: point.name, value: [point.seconds, point.dimension, point.group], itemStyle: { color: point.color } })),
      label: { show: true, formatter: '{b}', position: 'right', distance: 5, color: '#31443b', fontSize: 9, fontFamily: FONT_FAMILY },
      labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
      emphasis: { scale: 1.45, label: { show: true, fontWeight: 800, color: INK }, itemStyle: { borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: '#17324d40' } },
      markArea: {
        silent: true, label: { color: '#53636c', fontSize: 9, fontFamily: FONT_FAMILY },
        data: [
          [{ name: en ? 'Online control / estimation' : '在线控制 / 估计', xAxis: 1e-5, yAxis: 20, itemStyle: { color: '#238b9112' } }, { xAxis: 1e-1, yAxis: 4e3 }],
          [{ name: en ? 'Scenario / engineering trade space' : '场景 / 工程折中', xAxis: 1e-1, yAxis: 20, itemStyle: { color: '#ed7d3110' } }, { xAxis: 1e4, yAxis: 1e5 }],
          [{ name: en ? 'Offline reference / evidence' : '离线参考 / 证据', xAxis: 1e3, yAxis: 1e3, itemStyle: { color: '#b24b7610' } }, { xAxis: 1e8, yAxis: 1e7 }],
        ],
      },
    }],
    media: [{ query: { maxWidth: 560 }, option: { grid: { left: 54, right: 14, top: 28, bottom: 62 }, xAxis: { axisLabel: { fontSize: 8 } }, yAxis: { axisLabel: { fontSize: 8 }, nameGap: 38 }, series: [{ label: { fontSize: 8 } }] } }],
  }), [en, points]);

  return (
    <>
      <ScientificChart id="physics-fidelity-latency" option={option} ariaLabel={en ? 'Log–log scatter plot of model solution time and effective state dimension; positions are editorial orders of magnitude rather than performance rankings' : '模型求解时间与有效状态维数双对数散点图；位置是编辑性数量级而非性能排名'} fallbackSrc="/figures/model-fidelity-latency-nature.png" fallbackAlt={en ? 'Static cost-and-dimension view of multi-fidelity models' : '多保真模型成本与维数静态图'} fallback={en ? <table className="srOnly"><caption>Representative solution time and effective state dimension</caption><thead><tr><th>Model</th><th>Class</th><th>Solution time (s)</th><th>Effective dimension</th></tr></thead><tbody>{points.map((point) => <tr key={point.name}><th>{point.name}</th><td>{point.group}</td><td>{point.seconds}</td><td>{point.dimension}</td></tr>)}</tbody></table> : undefined} className="physicsChart physicsScatterChart" height={520} />
      <table className="srOnly"><caption>{en ? 'Representative solution time and effective state dimension' : '多保真模型典型求解时间和有效状态维数'}</caption><thead><tr><th>{en ? 'Model' : '模型'}</th><th>{en ? 'Class' : '类别'}</th><th>{en ? 'Solution time (s)' : '求解时间秒'}</th><th>{en ? 'Effective dimension' : '有效状态维数'}</th></tr></thead><tbody>{points.map((point) => <tr key={point.name}><th>{point.name}</th><td>{point.group}</td><td>{point.seconds}</td><td>{point.dimension}</td></tr>)}</tbody></table>
    </>
  );
}

const COUPLING_DOMAINS = ['平衡/控制', '核心输运', '湍流', '加热/快离子', 'MHD/破裂', '边界/SOL', '壁/杂质', '中子学', '氚/材料', '热流体', '结构', '整厂/RAMI'];
const COUPLING_DOMAINS_EN = ['Equilibrium / control', 'Core transport', 'Turbulence', 'Heating / fast ions', 'MHD / disruptions', 'Edge / SOL', 'Wall / impurities', 'Neutronics', 'Tritium / materials', 'Thermal fluids', 'Structures', 'Plant / RAMI'];
const COUPLING_MATRIX = [
  [3, 2, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 3, 1, 1, 1, 2, 0, 0, 0, 0, 0, 0],
  [0, 1, 3, 0, 0, 1, 0, 0, 0, 0, 0, 0],
  [1, 1, 0, 3, 1, 0, 1, 0, 0, 0, 0, 0],
  [1, 1, 0, 0, 3, 1, 1, 0, 0, 0, 1, 0],
  [0, 2, 1, 0, 1, 3, 2, 0, 0, 1, 0, 0],
  [0, 1, 0, 0, 0, 2, 3, 0, 1, 0, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 3, 2, 2, 1, 1],
  [0, 0, 0, 0, 0, 0, 1, 2, 3, 1, 0, 1],
  [0, 0, 0, 0, 0, 0, 0, 2, 1, 3, 2, 1],
  [0, 0, 0, 0, 1, 0, 1, 1, 0, 2, 3, 2],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3],
];
const COUPLING_LEVELS = ['无直接耦合', '单向载荷 / 边界', '需迭代的强反馈', '同一物理域'];
const COUPLING_LEVELS_EN = ['No direct coupling', 'One-way load / boundary transfer', 'Strong feedback requiring iteration', 'Within-domain'];

export function CouplingMatrixChart() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const domains = en ? COUPLING_DOMAINS_EN : COUPLING_DOMAINS;
  const levels = en ? COUPLING_LEVELS_EN : COUPLING_LEVELS;
  const data = useMemo(() => COUPLING_MATRIX.flatMap((row, rowIndex) => row.map((value, columnIndex) => [columnIndex, rowIndex, value])), []);
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff', textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: { enabled: true, description: en ? 'Directed coupling-strength matrix across twelve physics and engineering domains. Rows are information sources and columns are targets, so the matrix is not expected to be symmetric.' : '十二个物理与工程域的有向耦合强度矩阵；行表示信息来源，列表示信息去向，因此矩阵不要求对称。' },
    grid: { left: 92, right: 20, top: 36, bottom: 112 },
    tooltip: {
      trigger: 'item', confine: true, backgroundColor: '#ffffffee', borderColor: '#9fb2aa', textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params);
        if (!item) return '';
        const column = Number(item.value[0]); const row = Number(item.value[1]); const level = Number(item.value[2]);
        return `<b>${domains[row]} → ${domains[column]}</b><br/>${level} · ${levels[level]}<br/><span style="color:${MUTED}">${en ? 'Editorial interface strength, not a measured coupling coefficient; the matrix is directed' : '编辑性接口强度，非实测耦合系数；矩阵为有向关系'}</span>`;
      },
    },
    xAxis: { type: 'category', data: domains, axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false }, axisLabel: { interval: 0, rotate: 42, color: '#33463d', fontSize: 9, margin: 12 } },
    yAxis: { type: 'category', inverse: true, data: domains, axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false }, axisLabel: { color: '#273a32', fontSize: 9, margin: 10 } },
    visualMap: {
      type: 'piecewise', orient: 'horizontal', left: 'center', bottom: 14, selectedMode: false, itemWidth: 18, itemHeight: 10,
      textStyle: { color: MUTED, fontFamily: FONT_FAMILY, fontSize: 9 },
      pieces: [
        { value: 3, label: en ? '3 Within-domain' : '3 同域', color: '#17324d' }, { value: 2, label: en ? '2 Strong feedback' : '2 强反馈', color: '#238b91' },
        { value: 1, label: en ? '1 One-way transfer' : '1 单向载荷', color: '#c7dfdc' }, { value: 0, label: en ? '0 No direct coupling' : '0 无直接耦合', color: '#f6f7f3' },
      ],
    },
    series: [{ name: en ? 'Directed coupling strength' : '有向耦合强度', type: 'heatmap', data, label: { show: true, fontSize: 9, formatter: (params: unknown) => { const value = Number(readTooltipItem(params)?.value[2]); return `{${value >= 2 ? 'light' : 'dark'}|${value}}`; }, rich: { light: { color: '#ffffff' }, dark: { color: '#233b34' } } }, itemStyle: { borderColor: '#ffffff', borderWidth: 2 }, emphasis: { itemStyle: { borderColor: ORANGE, borderWidth: 2, shadowBlur: 8, shadowColor: '#17324d30' } } }],
    media: [{ query: { maxWidth: 560 }, option: { grid: { left: 72, right: 10, top: 28, bottom: 106 }, xAxis: { axisLabel: { fontSize: 7, rotate: 55 } }, yAxis: { axisLabel: { fontSize: 7 } }, visualMap: { itemWidth: 12, textStyle: { fontSize: 7 } } } }],
  }), [data, domains, en, levels]);

  return (
    <>
      <ScientificChart id="physics-coupling-matrix" option={option} ariaLabel={en ? 'Interactive directed coupling-strength heatmap across twelve physics and engineering domains; rows provide information to columns' : '十二个物理与工程域的有向耦合强度交互热图；行到列表示信息方向'} fallbackSrc="/figures/coupling-matrix-nature.png" fallbackAlt={en ? 'Static fusion-physics coupling matrix' : '聚变物理耦合矩阵静态图'} fallback={en ? <table className="srOnly"><caption>Directed physics–engineering coupling matrix: 0 no direct coupling, 1 one-way transfer, 2 strong feedback, 3 within-domain</caption><thead><tr><th>Source → target</th>{domains.map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{COUPLING_MATRIX.map((row, rowIndex) => <tr key={domains[rowIndex]}><th>{domains[rowIndex]}</th>{row.map((value, columnIndex) => <td key={domains[columnIndex]}>{value}</td>)}</tr>)}</tbody></table> : undefined} className="physicsChart physicsCouplingChart" height={650} />
      <table className="srOnly"><caption>{en ? 'Directed physics–engineering coupling matrix: 0 no direct coupling, 1 one-way transfer, 2 strong feedback, 3 within-domain' : '物理与工程域有向耦合矩阵，0 无直接耦合，1 单向载荷，2 强反馈，3 同域'}</caption><thead><tr><th>{en ? 'Source → target' : '来源到去向'}</th>{domains.map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody>{COUPLING_MATRIX.map((row, rowIndex) => <tr key={domains[rowIndex]}><th>{domains[rowIndex]}</th>{row.map((value, columnIndex) => <td key={domains[columnIndex]}>{value}</td>)}</tr>)}</tbody></table>
    </>
  );
}

const FRAMEWORK_PHASES = ['实验分析', '放电场景', '全装置物理', '聚变堆工程', '电厂/生命周期'];
const COUPLING_DEPTHS = ['文件/数据接口', '可复现工作流', '迭代自洽', '同步多物理', '在线状态闭环'];
const FRAMEWORK_PHASES_EN = ['Experiment analysis', 'Discharge scenario', 'Whole-device physics', 'Fusion-reactor engineering', 'Power plant / lifecycle'];
const COUPLING_DEPTHS_EN = ['File / data interface', 'Reproducible workflow', 'Iterative self-consistency', 'Synchronized multiphysics', 'Online state closed loop'];
const FRAMEWORK_POINTS = [
  { name: 'IMAS', x: 0.5, y: 0.8, group: '数据/分析平台', color: '#238b91' },
  { name: 'OMFIT/OMAS', x: 0.9, y: 1.45, group: '数据/分析平台', color: '#238b91' },
  { name: 'IPS', x: 1.3, y: 1.9, group: '工作流编排', color: '#2f8f83' },
  { name: 'ETS/PAF', x: 1.55, y: 2.55, group: '工作流编排', color: '#2f8f83' },
  { name: 'TRANSP', x: 1.2, y: 2.1, group: '脉冲集成', color: '#ed7d31' },
  { name: 'JINTRAC/HFPS', x: 1.65, y: 2.7, group: '脉冲集成', color: '#ed7d31' },
  { name: 'ASTRA/CRONOS', x: 1.25, y: 2.2, group: '脉冲集成', color: '#ed7d31' },
  { name: 'METIS/TOPICS', x: 1.4, y: 2.35, group: '快速场景', color: '#bc9533' },
  { name: 'IPS-FASTRAN', x: 1.9, y: 2.75, group: '脉冲集成', color: '#ed7d31' },
  { name: 'FACETS', x: 2.25, y: 2.8, group: '高保真多物理', color: '#b24b76' },
  { name: 'WDMApp/EFFIS', x: 2.65, y: 3.15, group: '高保真多物理', color: '#b24b76' },
  { name: 'MOOSE/SALAMANDER', x: 3.05, y: 3.05, group: '高保真多物理', color: '#b24b76' },
  { name: 'PROCESS', x: 3.75, y: 1.9, group: '整厂系统设计', color: '#69757a' },
  { name: 'bluemira', x: 3.55, y: 2.25, group: '整厂系统设计', color: '#69757a' },
  { name: 'FUSE', x: 3.55, y: 2.85, group: '整厂集成设计', color: '#17324d' },
  { name: 'STEP workflow', x: 3.8, y: 2.65, group: '整厂集成设计', color: '#17324d' },
  { name: 'Twin Builder/Simcenter', x: 4, y: 3.55, group: '工业孪生平台', color: '#bd4b3f' },
  { name: 'DINA/MEQ 服务', x: 1.55, y: 3.5, group: '控制服务', color: '#238b91' },
];
const FRAMEWORK_GROUPS_EN: Record<string, string> = {
  '数据/分析平台': 'Data / analysis platform', '工作流编排': 'Workflow orchestration', '脉冲集成': 'Discharge integration',
  '快速场景': 'Fast scenario modelling', '高保真多物理': 'High-fidelity multiphysics', '整厂系统设计': 'Plant systems design',
  '整厂集成设计': 'Integrated plant design', '工业孪生平台': 'Industrial twin platform', '控制服务': 'Control service',
};

export function FrameworkLandscapeChart() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const phases = en ? FRAMEWORK_PHASES_EN : FRAMEWORK_PHASES;
  const depths = en ? COUPLING_DEPTHS_EN : COUPLING_DEPTHS;
  const points = useMemo(() => FRAMEWORK_POINTS.map((point) => ({
    ...point,
    name: en && point.name === 'DINA/MEQ 服务' ? 'DINA/MEQ services' : point.name,
    group: en ? FRAMEWORK_GROUPS_EN[point.group] : point.group,
  })), [en]);
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff', textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: { enabled: true, description: en ? 'Scatter plot locating eighteen integrated-modelling frameworks by lifecycle coverage and coupling depth. Positions are an editorial synthesis, not official ratings.' : '十八类集成模拟框架在生命周期范围与耦合深度两个编辑性维度上的能力重心散点图，不代表官方评级。' },
    grid: { left: 78, right: 28, top: 36, bottom: 82 },
    tooltip: {
      trigger: 'item', confine: true, backgroundColor: '#ffffffee', borderColor: '#9fb2aa', textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params); if (!item) return '';
        const x = Number(item.value[0]); const y = Number(item.value[1]);
        return `<b>${item.name}</b><br/>${String(item.value[2])}<br/>${en ? 'Lifecycle emphasis' : '生命周期重心'}: ${phases[Math.round(x)]}<br/>${en ? 'Coupling-depth emphasis' : '耦合重心'}: ${depths[Math.round(y)]}<br/><span style="color:${MUTED}">${en ? 'Editorial capability placement; not an official rating, maturity certification or performance benchmark' : '编辑性能力定位，非官方评级、成熟度认证或性能基准'}</span>`;
      },
    },
    xAxis: {
      type: 'value', min: -0.3, max: 4.3, interval: 1, name: en ? 'Lifecycle coverage' : '生命周期范围', nameLocation: 'middle', nameGap: 54,
      nameTextStyle: { color: MUTED, fontSize: 10 }, axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false },
      axisLabel: { color: '#33463d', fontSize: 9, formatter: (value: number) => phases[value] ?? '' }, splitLine: { show: true, lineStyle: { color: GRID } },
    },
    yAxis: {
      type: 'value', min: -0.3, max: 4.3, interval: 1, name: en ? 'Coupling depth' : '耦合深度', nameLocation: 'middle', nameGap: 58,
      nameTextStyle: { color: MUTED, fontSize: 10 }, axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false },
      axisLabel: { color: '#33463d', fontSize: 9, formatter: (value: number) => depths[value] ?? '' }, splitLine: { show: true, lineStyle: { color: GRID } },
    },
    series: [{
      name: en ? 'Framework capability emphasis' : '框架能力重心', type: 'scatter', symbolSize: 12,
      data: points.map((point) => ({ name: point.name, value: [point.x, point.y, point.group], itemStyle: { color: point.color } })),
      label: { show: true, formatter: '{b}', position: 'right', distance: 5, color: '#31443b', fontSize: 8, fontFamily: FONT_FAMILY },
      labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
      emphasis: { scale: 1.45, label: { show: true, fontWeight: 800, color: INK }, itemStyle: { borderColor: '#fff', borderWidth: 2, shadowBlur: 8, shadowColor: '#17324d40' } },
      markArea: { silent: true, itemStyle: { color: '#bd4b3f0f' }, label: { show: true, formatter: en ? 'Operational digital-twin domain' : '数字孪生运行域', color: RED, fontSize: 9, fontWeight: 700 }, data: [[{ yAxis: 3.55 }, { yAxis: 4.3 }]] },
    }],
    media: [{ query: { maxWidth: 560 }, option: { grid: { left: 62, right: 12, top: 28, bottom: 92 }, xAxis: { axisLabel: { rotate: 35, fontSize: 7 } }, yAxis: { axisLabel: { fontSize: 7 }, nameGap: 46 }, series: [{ label: { fontSize: 7 } }] } }],
  }), [depths, en, phases, points]);

  return (
    <>
      <ScientificChart id="integrated-framework-landscape" option={option} ariaLabel={en ? 'Interactive scatter plot of integrated-modelling frameworks by lifecycle coverage and coupling depth; positions are editorial capability emphases rather than official ratings' : '集成模拟框架生命周期范围与耦合深度交互散点图；位置是编辑性能力重心而非官方评级'} fallbackSrc="/figures/integrated-framework-landscape-nature.svg" fallbackAlt={en ? 'Static landscape of integrated-modelling frameworks' : '集成模拟框架版图静态散点图'} fallback={en ? <table className="srOnly"><caption>Editorial capability placement of integrated-modelling frameworks</caption><thead><tr><th>Framework</th><th>Class</th><th>Lifecycle coordinate</th><th>Coupling-depth coordinate</th></tr></thead><tbody>{points.map((point) => <tr key={point.name}><th>{point.name}</th><td>{point.group}</td><td>{point.x}</td><td>{point.y}</td></tr>)}</tbody></table> : undefined} className="physicsChart frameworkLandscapeChart" height={570} />
      <table className="srOnly"><caption>{en ? 'Editorial capability placement of integrated-modelling frameworks' : '集成模拟框架能力重心，编辑性定位而非官方评级'}</caption><thead><tr><th>{en ? 'Framework' : '框架'}</th><th>{en ? 'Class' : '类别'}</th><th>{en ? 'Lifecycle coordinate' : '生命周期坐标'}</th><th>{en ? 'Coupling-depth coordinate' : '耦合深度坐标'}</th></tr></thead><tbody>{points.map((point) => <tr key={point.name}><th>{point.name}</th><td>{point.group}</td><td>{point.x}</td><td>{point.y}</td></tr>)}</tbody></table>
    </>
  );
}

const FRAMEWORK_CAPABILITIES = ['统一数据', '模型编排', '自洽闭合推进', '高保真耦合', '工程/整厂', '实验后验', 'UQ/优化', '在线部署', '配置/证据'];
const FRAMEWORK_CAPABILITIES_EN = ['Unified data', 'Model orchestration', 'Self-consistent closure', 'High-fidelity coupling', 'Engineering / plant', 'Experimental inference', 'UQ / optimization', 'Online deployment', 'Configuration / evidence'];
const FRAMEWORK_SCORES = [
  { name: 'IMAS', scores: [3, 2, 0, 1, 0, 2, 0, 1, 2] },
  { name: 'OMFIT/OMAS', scores: [2, 3, 1, 1, 0, 3, 2, 1, 2] },
  { name: 'IPS', scores: [1, 3, 2, 2, 0, 1, 2, 0, 2] },
  { name: 'ETS/PAF', scores: [3, 3, 3, 2, 0, 2, 1, 0, 2] },
  { name: 'TRANSP', scores: [2, 2, 3, 2, 0, 3, 1, 0, 2] },
  { name: 'JINTRAC/HFPS', scores: [3, 2, 3, 2, 1, 3, 1, 0, 2] },
  { name: 'ASTRA', scores: [1, 1, 3, 1, 0, 2, 0, 0, 1] },
  { name: 'CRONOS', scores: [1, 1, 3, 1, 0, 2, 0, 0, 1] },
  { name: 'METIS', scores: [1, 1, 3, 0, 1, 2, 2, 2, 1] },
  { name: 'TOPICS/TASK', scores: [1, 1, 3, 1, 0, 2, 0, 1, 1] },
  { name: 'CORSICA', scores: [1, 1, 3, 1, 0, 2, 0, 1, 1] },
  { name: 'IPS-FASTRAN', scores: [2, 3, 3, 2, 1, 3, 3, 1, 2] },
  { name: 'FACETS', scores: [1, 2, 3, 3, 1, 1, 1, 0, 1] },
  { name: 'WDMApp/EFFIS', scores: [1, 3, 3, 3, 1, 1, 1, 0, 2] },
  { name: 'MOOSE/SALAMANDER', scores: [1, 3, 3, 3, 3, 1, 2, 0, 3] },
  { name: 'PROCESS', scores: [1, 2, 1, 0, 3, 0, 3, 0, 2] },
  { name: 'FUSE', scores: [3, 3, 3, 2, 3, 2, 3, 1, 2] },
  { name: 'bluemira', scores: [1, 3, 1, 1, 3, 0, 3, 0, 2] },
  { name: 'STEP workflow', scores: [1, 2, 2, 1, 3, 1, 2, 0, 3] },
  { name: '工业孪生平台', scores: [2, 3, 2, 2, 3, 2, 3, 3, 3] },
];
const SCORE_LABELS = ['无公开证据 / 非目标', '初步', '可用', '强项'];
const SCORE_LABELS_EN = ['No public evidence / not targeted', 'Initial', 'Usable', 'Strength'];

export function FrameworkCapabilityChart() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const capabilities = en ? FRAMEWORK_CAPABILITIES_EN : FRAMEWORK_CAPABILITIES;
  const scoreLabels = en ? SCORE_LABELS_EN : SCORE_LABELS;
  const frameworks = useMemo(() => FRAMEWORK_SCORES.map((framework) => ({
    ...framework,
    name: en && framework.name === '工业孪生平台' ? 'Industrial digital-twin platform' : framework.name,
  })), [en]);
  const data = useMemo(() => frameworks.flatMap((framework, row) => framework.scores.map((score, column) => [column, row, score])), [frameworks]);
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff', textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: { enabled: true, description: en ? 'Heatmap of an editorial zero-to-three planning score for nine capabilities across twenty integrated-modelling frameworks. Scores are not official ratings.' : '二十类集成模拟框架在九项能力上的零到三级编辑性规划评分热图，不代表官方评级。' },
    grid: { left: 132, right: 20, top: 28, bottom: 108 },
    tooltip: {
      trigger: 'item', confine: true, backgroundColor: '#ffffffee', borderColor: '#9fb2aa', textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params); if (!item) return '';
        const column = Number(item.value[0]); const row = Number(item.value[1]); const score = Number(item.value[2]);
        return `<b>${frameworks[row]?.name}</b><br/>${capabilities[column]}: ${score} · ${scoreLabels[score]}<br/><span style="color:${MUTED}">${en ? 'Editorial planning score based on public evidence; not an official certification or comparative performance benchmark' : '基于公开材料的编辑性规划评分，非官方认证或横向性能基准'}</span>`;
      },
    },
    xAxis: { type: 'category', data: capabilities, axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false }, axisLabel: { interval: 0, rotate: 40, color: '#33463d', fontSize: 9, margin: 12 } },
    yAxis: { type: 'category', inverse: true, data: frameworks.map((framework) => framework.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#273a32', fontSize: 9, margin: 10 } },
    visualMap: {
      type: 'piecewise', orient: 'horizontal', left: 'center', bottom: 14, selectedMode: false, itemWidth: 18, itemHeight: 10,
      textStyle: { color: MUTED, fontFamily: FONT_FAMILY, fontSize: 9 },
      pieces: [
        { value: 3, label: en ? '3 Strength' : '3 强项', color: '#17324d' }, { value: 2, label: en ? '2 Usable' : '2 可用', color: '#65a8ad' },
        { value: 1, label: en ? '1 Initial' : '1 初步', color: '#dcebec' }, { value: 0, label: en ? '0 No evidence / not targeted' : '0 无证据/非目标', color: '#f7f8f5' },
      ],
    },
    series: [{ name: en ? 'Capability score' : '能力评分', type: 'heatmap', data, label: { show: true, fontSize: 8, formatter: (params: unknown) => { const value = Number(readTooltipItem(params)?.value[2]); return `{${value >= 2 ? 'light' : 'dark'}|${value}}`; }, rich: { light: { color: '#ffffff' }, dark: { color: '#233b34' } } }, itemStyle: { borderColor: '#fff', borderWidth: 2 }, emphasis: { itemStyle: { borderColor: ORANGE, borderWidth: 2, shadowBlur: 8, shadowColor: '#17324d30' } } }],
    media: [{ query: { maxWidth: 560 }, option: { grid: { left: 94, right: 8, top: 24, bottom: 104 }, xAxis: { axisLabel: { fontSize: 7, rotate: 55 } }, yAxis: { axisLabel: { fontSize: 7, width: 82, overflow: 'truncate' } }, visualMap: { itemWidth: 11, textStyle: { fontSize: 7 } }, series: [{ label: { fontSize: 7 } }] } }],
  }), [capabilities, data, en, frameworks, scoreLabels]);

  return (
    <>
      <ScientificChart id="integrated-framework-capability" option={option} ariaLabel={en ? 'Interactive heatmap of nine integrated-modelling capabilities across twenty frameworks; zero-to-three values are editorial planning scores based on public evidence' : '二十类集成模拟框架九项能力交互热图；零到三级为公开材料基础上的编辑性规划评分'} fallbackSrc="/figures/integrated-framework-capability-matrix-nature.png" fallbackAlt={en ? 'Static integrated-modelling capability matrix' : '集成模拟能力矩阵静态图'} fallback={en ? <table className="srOnly"><caption>Editorial capability scores: 0 no public evidence or not targeted, 1 initial, 2 usable, 3 strength</caption><thead><tr><th>Framework</th>{capabilities.map((capability) => <th key={capability}>{capability}</th>)}</tr></thead><tbody>{frameworks.map((framework) => <tr key={framework.name}><th>{framework.name}</th>{framework.scores.map((score, index) => <td key={capabilities[index]}>{score}</td>)}</tr>)}</tbody></table> : undefined} className="physicsChart frameworkCapabilityChart" height={820} />
      <table className="srOnly"><caption>{en ? 'Editorial capability scores: 0 no public evidence or not targeted, 1 initial, 2 usable, 3 strength' : '集成模拟框架能力编辑性规划评分，0 无证据或非目标，1 初步，2 可用，3 强项'}</caption><thead><tr><th>{en ? 'Framework' : '框架'}</th>{capabilities.map((capability) => <th key={capability}>{capability}</th>)}</tr></thead><tbody>{frameworks.map((framework) => <tr key={framework.name}><th>{framework.name}</th>{framework.scores.map((score, index) => <td key={capabilities[index]}>{score}</td>)}</tr>)}</tbody></table>
    </>
  );
}

const MATURITY_ROWS = [
  { name: '物理覆盖', current: 2.6, target: 3.4 }, { name: '数据语义', current: 2.3, target: 3.7 },
  { name: '数值耦合', current: 2.2, target: 3.4 }, { name: '实验确认', current: 2.0, target: 3.5 },
  { name: 'UQ/适用域', current: 1.4, target: 3.5 }, { name: '在线状态同步', current: 0.8, target: 3.8 },
  { name: '实时确定性', current: 0.7, target: 3.6 }, { name: '闭环安全', current: 0.6, target: 3.8 },
  { name: '生命周期配置', current: 1.0, target: 3.7 }, { name: '软件/网络治理', current: 1.3, target: 3.7 },
];
const MATURITY_NAMES_EN = ['Physics coverage', 'Data semantics', 'Numerical coupling', 'Experimental confirmation', 'UQ / applicability domain', 'Online state synchronization', 'Real-time determinism', 'Closed-loop safety', 'Lifecycle configuration', 'Software / network governance'];

export function MaturityGapChart() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const rows = useMemo(() => MATURITY_ROWS.map((row, index) => ({ ...row, name: en ? MATURITY_NAMES_EN[index] : row.name })), [en]);
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff', textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: { enabled: true, description: en ? 'Horizontal bullet chart comparing current editorial planning scores with digital-twin target scores for ten integrated-modelling capabilities. A score of three marks the operational-support gate.' : '集成模拟十项能力的当前规划评分与数字孪生目标评分水平横向子弹图，三分为运行支持门。' },
    grid: { left: 112, right: 34, top: 34, bottom: 48 },
    tooltip: {
      trigger: 'item', confine: true, backgroundColor: '#ffffffee', borderColor: '#9fb2aa', textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params); if (!item) return '';
        const current = Number(item.value[0]); const target = Number(item.value[2]);
        return `<b>${String(item.value[3])}</b><br/>${en ? 'Current' : '当前'}: ${current.toFixed(1)} / 4<br/>${en ? 'Target' : '目标'}: ${target.toFixed(1)} / 4<br/>${en ? 'Gap' : '差距'}: ${(target - current).toFixed(1)}<br/><span style="color:${MUTED}">${en ? 'Editorial planning score; not a measured quantity, certification result or industry benchmark' : '编辑性规划评分，非测量值、认证结论或行业基准'}</span>`;
      },
    },
    xAxis: { type: 'value', min: 0, max: 4, interval: 1, name: en ? 'Planning-maturity score (0–4)' : '规划成熟度评分（0—4）', nameLocation: 'middle', nameGap: 32, nameTextStyle: { color: MUTED, fontSize: 10 }, axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false }, axisLabel: { color: '#33463d', fontSize: 9 }, splitLine: { show: true, lineStyle: { color: GRID } } },
    yAxis: { type: 'category', inverse: true, data: rows.map((row) => row.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#273a32', fontSize: 9, margin: 10 } },
    series: [
      { name: en ? 'Target' : '目标', type: 'bar', silent: true, barWidth: 18, data: rows.map((row, index) => [row.target, index]), encode: { x: 0, y: 1 }, itemStyle: { color: '#e4e9e6', borderRadius: 9 } },
      {
        name: en ? 'Current' : '当前', type: 'bar', barWidth: 9, barGap: '-75%', z: 3,
        data: rows.map((row, index) => [row.current, index, row.target, row.name]), encode: { x: 0, y: 1 },
        itemStyle: { color: CYAN, borderRadius: 5 },
        markLine: { silent: true, symbol: ['none', 'none'], lineStyle: { color: RED, type: 'dashed', width: 1.5 }, label: { show: true, formatter: en ? 'Operational-support gate 3.0' : '运行支持门 3.0', color: RED, fontSize: 9 }, data: [{ xAxis: 3 }] },
      },
      { name: en ? 'Target marker' : '目标点', type: 'scatter', symbol: 'diamond', symbolSize: 10, z: 5, data: rows.map((row, index) => [row.target, index, row.target, row.name]), encode: { x: 0, y: 1 }, itemStyle: { color: ORANGE, borderColor: '#fff', borderWidth: 1 } },
    ],
    media: [{ query: { maxWidth: 560 }, option: { grid: { left: 82, right: 16, top: 28, bottom: 48 }, yAxis: { axisLabel: { fontSize: 7, width: 70, overflow: 'truncate' } }, xAxis: { axisLabel: { fontSize: 8 } } } }],
  }), [en, rows]);

  return (
    <>
      <ScientificChart id="integrated-maturity-gap" option={option} ariaLabel={en ? 'Horizontal bullet chart comparing current and target planning scores for ten integrated-modelling capabilities; scores are editorial planning judgements, not measured benchmarks' : '集成模拟十项能力当前与目标规划评分横向子弹图；评分是编辑性规划判断而非测量基准'} fallbackSrc="/figures/integrated-maturity-gap-nature.png" fallbackAlt={en ? 'Static integrated-modelling maturity-gap chart' : '集成模拟成熟度差距静态图'} fallback={en ? <table className="srOnly"><caption>Current and target editorial planning-maturity scores</caption><thead><tr><th>Capability</th><th>Current</th><th>Target</th><th>Gap</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.current}</td><td>{row.target}</td><td>{(row.target - row.current).toFixed(1)}</td></tr>)}</tbody></table> : undefined} className="physicsChart maturityGapChart" height={610} />
      <table className="srOnly"><caption>{en ? 'Current and target editorial planning-maturity scores' : '集成模拟当前和目标成熟度编辑性规划评分'}</caption><thead><tr><th>{en ? 'Capability' : '能力'}</th><th>{en ? 'Current' : '当前'}</th><th>{en ? 'Target' : '目标'}</th><th>{en ? 'Gap' : '差距'}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.current}</td><td>{row.target}</td><td>{(row.target - row.current).toFixed(1)}</td></tr>)}</tbody></table>
    </>
  );
}

export const physicsRoadmapStages = [
  { id: '01', title: '控制服务化', period: '0—18 个月', startMonth: 0, endMonth: 18, color: '#238b91', detail: '稳定封装 DINA/MEQ；统一平衡、线圈、诊断与放电事件数据；建立回放、影子运行、硬件在环和可信度看板。' },
  { id: '02', title: '等离子体孪生', period: '18—36 个月', startMonth: 18, endMonth: 36, color: '#ed7d31', detail: '接入快速输运、加热源项、边界与破裂风险模型；以状态估计器和代理模型向控制提供可解释预测。' },
  { id: '03', title: '聚变堆孪生', period: '3—5 年', startMonth: 36, endMonth: 60, color: '#b24b76', detail: '打通中子学、包层、氚、热流体、结构与维护；把脉冲、部件寿命、安全裕量放进同一场景账本。' },
  { id: '04', title: '电厂孪生', period: '5—8 年', startMonth: 60, endMonth: 96, color: '#17324d', detail: '连接 PROCESS/FUSE 类系统设计、RAMI、成本、电网和运行计划；形成设计—建造—调试—运行—退役数字线程。' },
];
const physicsRoadmapStagesEn = [
  { ...physicsRoadmapStages[0], title: 'Control services', period: '0–18 months', detail: 'Package DINA/MEQ as stable services; unify equilibrium, coil, diagnostic and discharge-event data; establish replay, shadow operation, hardware-in-the-loop testing and credibility dashboards.' },
  { ...physicsRoadmapStages[1], title: 'Plasma digital twin', period: '18–36 months', detail: 'Integrate fast transport, heating source, boundary and disruption-risk models; provide interpretable predictions to control through state estimators and surrogates.' },
  { ...physicsRoadmapStages[2], title: 'Fusion-reactor digital twin', period: '3–5 years', detail: 'Connect neutronics, blanket, tritium, thermal fluids, structures and maintenance; place discharge history, component life and safety margins in one scenario ledger.' },
  { ...physicsRoadmapStages[3], title: 'Fusion-power-plant digital twin', period: '5–8 years', detail: 'Connect PROCESS/FUSE-class system design, RAMI, cost, grid constraints and operating plans across a design–construction–commissioning–operation–decommissioning digital thread.' },
];

const renderRoadmapRange: CustomSeriesRenderItem = (_params, api) => {
  const stageIndex = Number(api.value(0));
  const startMonth = Number(api.value(1));
  const endMonth = Number(api.value(2));
  const start = api.coord([startMonth, stageIndex]);
  const end = api.coord([endMonth, stageIndex]);
  const laneSize = api.size?.([0, 1]);
  const laneHeight = Array.isArray(laneSize) ? Number(laneSize[1]) : 44;
  const height = Math.max(20, laneHeight * 0.52);
  const width = Math.max(3, end[0] - start[0]);
  const stage = physicsRoadmapStages[stageIndex];
  const rangeText = String(api.value(7));
  const rangeBar = {
    type: 'rect' as const,
    shape: { x: start[0], y: start[1] - height / 2, width, height, r: 5 },
    style: { fill: stage?.color ?? INK, opacity: 0.94 },
  };
  const rangeLabel = {
    type: 'text' as const,
    style: { text: rangeText, x: start[0] + 8, y: start[1], fill: '#fff', font: `700 10px ${FONT_FAMILY}`, verticalAlign: 'middle' as const },
  };
  return { type: 'group', children: width > 76 ? [rangeBar, rangeLabel] : [rangeBar] };
};

export function PhysicsRoadmapChart() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const stages = en ? physicsRoadmapStagesEn : physicsRoadmapStages;
  const option = useMemo<EChartsCoreOption>(() => ({
    backgroundColor: '#ffffff', textStyle: { fontFamily: FONT_FAMILY, color: INK },
    aria: { enabled: true, description: en ? 'Four-stage, zero-to-ninety-six-month planning chart progressing from control services through plasma and fusion-reactor digital twins to a fusion-power-plant digital twin.' : '从控制服务化到电厂孪生的零到九十六个月四阶段规划甘特图。' },
    grid: { left: 126, right: 24, top: 38, bottom: 58 },
    tooltip: {
      trigger: 'item', confine: true, backgroundColor: '#ffffffee', borderColor: '#9fb2aa', textStyle: { color: INK, fontFamily: FONT_FAMILY, fontSize: 12 },
      formatter: (params: unknown) => {
        const item = readTooltipItem(params); if (!item) return '';
        return `<b>${String(item.value[3])} · ${String(item.value[4])}</b><br/>${String(item.value[5])} ${en ? `(months ${Number(item.value[1])}–${Number(item.value[2])})` : `（第 ${Number(item.value[1])}—${Number(item.value[2])} 个月）`}<br/>${String(item.value[6])}<br/><span style="color:${MUTED}">${en ? 'Capability-gated planning window; not a committed project schedule' : '能力门驱动的规划窗口，非项目承诺工期'}</span>`;
      },
    },
    xAxis: {
      type: 'value', min: 0, max: 96, interval: 12, name: en ? 'Planning horizon / months' : '规划时间 / 月', nameLocation: 'middle', nameGap: 36,
      nameTextStyle: { color: MUTED, fontSize: 10 }, axisLine: { lineStyle: { color: '#82938b' } }, axisTick: { show: false },
      axisLabel: { color: '#33463d', fontSize: 9, formatter: (value: number) => value === 0 ? (en ? 'Now' : '当前') : (en ? `${value / 12} y` : `${value / 12} 年`) }, splitLine: { show: true, lineStyle: { color: GRID } },
    },
    yAxis: { type: 'category', inverse: true, data: stages.map((stage) => `${stage.id}  ${stage.title}`), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#273a32', fontSize: 10, margin: 12 } },
    series: [{
      name: en ? 'Roadmap planning window' : '路线规划区间', type: 'custom', clip: true, renderItem: renderRoadmapRange, encode: { x: [1, 2], y: 0 },
      data: stages.map((stage, index) => ({ name: `${stage.id} · ${stage.title}`, value: [index, stage.startMonth, stage.endMonth, stage.id, stage.title, stage.period, stage.detail, en ? `${stage.startMonth}–${stage.endMonth} months` : `${stage.startMonth}—${stage.endMonth} 月`] })),
    }],
    media: [{ query: { maxWidth: 560 }, option: { grid: { left: 92, right: 12, top: 30, bottom: 54 }, yAxis: { axisLabel: { fontSize: 8, width: 80, overflow: 'truncate' } }, xAxis: { axisLabel: { fontSize: 8 } } } }],
  }), [en, stages]);

  return (
    <>
      <ScientificChart id="physics-digital-twin-roadmap" option={option} ariaLabel={en ? 'Interactive four-stage roadmap from control services to a fusion-power-plant digital twin' : '从控制服务化到电厂孪生的四阶段交互规划甘特图'} fallbackSrc="/figures/roadmap-nature.png" fallbackAlt={en ? 'Static four-stage fusion digital-twin roadmap' : '聚变数字孪生四阶段路线静态图'} fallback={en ? <table className="srOnly"><caption>Four-stage fusion digital-twin planning windows</caption><thead><tr><th>Stage</th><th>Name</th><th>Period</th><th>Scope</th></tr></thead><tbody>{stages.map((stage) => <tr key={stage.id}><th>{stage.id}</th><td>{stage.title}</td><td>{stage.period}</td><td>{stage.detail}</td></tr>)}</tbody></table> : undefined} className="physicsChart physicsRoadmapChart" height={470} />
      <table className="srOnly"><caption>{en ? 'Four-stage fusion digital-twin planning windows' : '聚变数字孪生四阶段规划窗口'}</caption><thead><tr><th>{en ? 'Stage' : '阶段'}</th><th>{en ? 'Name' : '名称'}</th><th>{en ? 'Period' : '期间'}</th><th>{en ? 'Scope' : '内容'}</th></tr></thead><tbody>{stages.map((stage) => <tr key={stage.id}><th>{stage.id}</th><td>{stage.title}</td><td>{stage.period}</td><td>{stage.detail}</td></tr>)}</tbody></table>
    </>
  );
}
