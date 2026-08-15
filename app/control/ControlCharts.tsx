'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import ScientificChart from '../components/charts/ScientificChart';
import { useChartTheme } from '../components/charts/chart-theme';
import {
  controlResearchItems,
  type ControlDeploymentLevel,
  type ControlEvidenceLevel,
  type ControlTaskId,
} from './controlResearch';

export type ControlTimescaleDatum = {
  id: ControlTaskId;
  label: string;
  timeLabel: string;
  minSeconds: number;
  maxSeconds: number;
  openEnded?: boolean;
};

const taskColors: Record<ControlTaskId, string> = {
  T0: '#38c2ac',
  T1: '#ff8738',
  T2: '#ff8738',
  T3: '#836dcc',
  T4: '#ce553e',
  T5: '#4f8ac1',
  T6: '#167760',
  T7: '#ce553e',
  T8: '#836dcc',
  T9: '#65e6d2',
};

const evidenceLevels: ControlEvidenceLevel[] = ['E0', 'E1', 'E2', 'E3', 'E4'];
const deploymentLevels: ControlDeploymentLevel[] = ['D1', 'D2', 'D3', 'D4', 'D5'];
const evidenceLabels: Record<ControlEvidenceLevel, string> = {
  E0: '概念 / 需求',
  E1: '数值闭环',
  E2: '装置离线',
  E3: '实时 / HIL / 影子',
  E4: '装置闭环',
};
const deploymentLabels: Record<ControlDeploymentLevel, string> = {
  D1: '研究原型',
  D2: '离线工作流',
  D3: '实时 / HIL 试点',
  D4: '正式在线 / 闭环',
  D5: '安全关键批准',
};

function eventData(params: unknown): unknown[] | null {
  if (!params || typeof params !== 'object' || !('data' in params)) return null;
  const data = (params as { data?: unknown }).data;
  return Array.isArray(data) ? data : null;
}

function formatTimescaleTick(value: number) {
  const ticks = new Map<number, string>([
    [1e-6, '1 μs'],
    [1e-5, '10 μs'],
    [1e-4, '100 μs'],
    [1e-3, '1 ms'],
    [1e-2, '10 ms'],
    [1e-1, '100 ms'],
    [1, '1 s'],
    [10, '10 s'],
    [100, '100 s'],
  ]);
  return ticks.get(value) ?? '';
}

const renderTimescaleRange: CustomSeriesRenderItem = (_params, api) => {
  const category = Number(api.value(0));
  const start = Number(api.value(1));
  const end = Number(api.value(2));
  const color = String(api.value(3));
  const openEnded = Number(api.value(4)) === 1;
  const startPoint = api.coord([start, category]);
  const endPoint = api.coord([end, category]);
  const rawBandSize = api.size?.([0, 1]);
  const bandHeight = Array.isArray(rawBandSize) ? Number(rawBandSize[1]) : Number(rawBandSize ?? 42);
  const barHeight = Math.max(10, Math.min(19, Math.abs(bandHeight) * 0.34));
  const arrowWidth = openEnded ? 12 : 0;
  const lineWidth = Math.max(2, endPoint[0] - startPoint[0] - arrowWidth);

  return {
    type: 'group',
    children: [
      {
        type: 'rect',
        cursor: 'pointer',
        shape: {
          x: startPoint[0],
          y: startPoint[1] - barHeight / 2,
          width: lineWidth,
          height: barHeight,
          r: barHeight / 2,
        },
        style: { fill: color, opacity: 0.94 },
        emphasis: { style: { opacity: 1, shadowBlur: 12, shadowColor: color } },
      },
      {
        type: 'circle',
        cursor: 'pointer',
        shape: { cx: startPoint[0], cy: startPoint[1], r: barHeight / 2 },
        style: { fill: color },
      },
      openEnded
        ? {
            type: 'polygon',
            cursor: 'pointer',
            shape: {
              points: [
                [endPoint[0] - arrowWidth, endPoint[1] - barHeight * 0.68],
                [endPoint[0], endPoint[1]],
                [endPoint[0] - arrowWidth, endPoint[1] + barHeight * 0.68],
              ],
            },
            style: { fill: color },
          }
        : {
            type: 'circle',
            cursor: 'pointer',
            shape: { cx: endPoint[0], cy: endPoint[1], r: barHeight / 2 },
            style: { fill: color },
          },
    ],
  };
};

export function ControlTimescaleChart({ tasks }: { tasks: ControlTimescaleDatum[] }) {
  const chartTheme = useChartTheme();
  const lightTaskColors: Record<ControlTaskId, string> = {
    T0: '#287b6f', T1: '#b85b37', T2: '#b85b37', T3: '#6c5a9f', T4: '#a14c3c',
    T5: '#436f98', T6: '#366b58', T7: '#a14c3c', T8: '#6c5a9f', T9: '#49766a',
  };
  const data = tasks.map((task, index) => [
    index,
    task.minSeconds,
    task.maxSeconds,
    chartTheme.mode === 'dark' ? taskColors[task.id] : lightTaskColors[task.id],
    task.openEnded ? 1 : 0,
    task.id,
    task.label,
    task.timeLabel,
  ]);

  const option: EChartsCoreOption = {
    backgroundColor: chartTheme.background,
    animationDuration: 520,
    grid: { left: 176, right: 40, top: 48, bottom: 58 },
    aria: {
      enabled: true,
      decal: { show: true },
      description: 'T0 到 T9 控制任务的典型时间尺度对数区间图。箭头表示开放端或数量级示意，点击任一任务进入对应研究目录。',
    },
    tooltip: {
      trigger: 'item',
      borderWidth: 1,
      borderColor: chartTheme.tooltipBorder,
      backgroundColor: chartTheme.tooltipBackground,
      textStyle: { color: chartTheme.tooltipText, fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 12 },
      formatter: (params: unknown) => {
        const row = eventData(params);
        if (!row) return '';
        const open = Number(row[4]) === 1;
        return `<b>${String(row[5])} · ${String(row[6])}</b><br/>典型时间：${String(row[7])}<br/><span style="color:${chartTheme.muted}">${open ? '箭头表示上限开放至脉冲生命周期；区间仅作架构数量级示意。' : '区间表示常见数量级，不是统一控制周期。'}</span><br/><span style="color:${chartTheme.info}">点击检索该任务工作 →</span>`;
      },
    },
    xAxis: {
      type: 'log',
      min: 1e-6,
      max: 100,
      logBase: 10,
      name: '典型响应 / 决策 / 执行时间尺度（对数）',
      nameLocation: 'middle',
      nameGap: 38,
      nameTextStyle: { color: chartTheme.muted, fontSize: 10 },
      axisLine: { lineStyle: { color: chartTheme.line } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: chartTheme.grid, type: 'dashed' } },
      minorSplitLine: { show: false },
      axisLabel: { color: chartTheme.muted, fontSize: 10, formatter: formatTimescaleTick },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: tasks.map((task) => `${task.id}  ${task.label}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: chartTheme.text, fontSize: 11, fontWeight: 700, margin: 16 },
    },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseMove: true }],
    series: [
      {
        type: 'custom',
        name: '任务时间尺度',
        renderItem: renderTimescaleRange,
        encode: { x: [1, 2], y: 0, tooltip: [5, 6, 7] },
        data,
        silent: false,
        z: 4,
      },
    ],
    media: [
      {
        query: { maxWidth: 680 },
        option: {
          grid: { left: 108, right: 20, top: 42, bottom: 58 },
          yAxis: { axisLabel: { fontSize: 9, width: 88, overflow: 'truncate', margin: 10 } },
          xAxis: { axisLabel: { fontSize: 9 }, nameTextStyle: { fontSize: 9 } },
        },
      },
    ],
  };

  return (
    <>
      <ScientificChart
        id="control-task-timescale"
        option={option}
        ariaLabel="T0 到 T9 控制任务典型时间尺度交互对数区间图。点击条带可筛选对应任务。"
        fallbackSrc="/figures/control-task-timescale-nature.png"
        fallbackAlt="T0 到 T9 控制任务在微秒到脉冲生命周期的典型时间尺度静态图"
        className="controlTimescaleEChart"
        height={610}
        dark
        onChartClick={(params) => {
          const row = eventData(params);
          const task = row?.[5];
          if (typeof task === 'string' && /^T[0-9]$/.test(task)) {
            window.location.assign(`/control?task=${task}#catalog`);
          }
        }}
      />
      <table className="srOnly">
        <caption>控制任务典型时间尺度</caption>
        <thead><tr><th>任务</th><th>名称</th><th>典型时间</th><th>说明</th></tr></thead>
        <tbody>{tasks.map((task) => <tr key={task.id}><th>{task.id}</th><td>{task.label}</td><td>{task.timeLabel}</td><td>{task.openEnded ? '上限开放至脉冲生命周期，数量级示意' : '常见数量级，非统一周期'}</td></tr>)}</tbody>
      </table>
    </>
  );
}

export function ControlEvidenceHeatmap() {
  const cells = evidenceLevels.flatMap((evidence, evidenceIndex) => deploymentLevels.map((deployment, deploymentIndex) => {
    const count = controlResearchItems.filter((item) => item.evidenceLevel === evidence && item.deploymentLevel === deployment).length;
    return [deploymentIndex, evidenceIndex, count, evidence, deployment];
  }));
  const maxCount = Math.max(1, ...cells.map((cell) => Number(cell[2])));

  const option: EChartsCoreOption = {
    backgroundColor: '#ffffff',
    animationDuration: 460,
    grid: { left: 78, right: 28, top: 34, bottom: 88 },
    aria: {
      enabled: true,
      decal: { show: true },
      description: '聚变控制研究工作按证据等级 E0 到 E4 与部署等级 D1 到 D5 聚合的五乘五热图。数字为工作数量，点击格子筛选目录。',
    },
    tooltip: {
      trigger: 'item',
      borderColor: '#aebeb5',
      backgroundColor: 'rgba(255,255,252,.97)',
      textStyle: { color: '#13231c', fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 12 },
      formatter: (params: unknown) => {
        const cell = eventData(params);
        if (!cell) return '';
        const evidence = String(cell[3]) as ControlEvidenceLevel;
        const deployment = String(cell[4]) as ControlDeploymentLevel;
        const count = Number(cell[2]);
        return `<b>${evidence} · ${evidenceLabels[evidence]}</b><br/>${deployment} · ${deploymentLabels[deployment]}<br/><strong style="font-size:18px;color:#b84e0e">${count}</strong> 项工作<br/><span style="color:#187358">点击按证据与部署筛选 →</span>`;
      },
    },
    xAxis: {
      type: 'category',
      data: deploymentLevels,
      name: '部署等级',
      nameLocation: 'middle',
      nameGap: 38,
      axisLine: { lineStyle: { color: '#aebdb5' } },
      axisTick: { show: false },
      axisLabel: { color: '#31463b', fontSize: 11, fontWeight: 700 },
      splitArea: { show: true, areaStyle: { color: ['#fafaf6', '#f4f6f2'] } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: evidenceLevels,
      name: '证据等级',
      nameLocation: 'middle',
      nameGap: 50,
      axisLine: { lineStyle: { color: '#aebdb5' } },
      axisTick: { show: false },
      axisLabel: { color: '#31463b', fontSize: 11, fontWeight: 700 },
      splitArea: { show: true, areaStyle: { color: ['#fafaf6', '#f4f6f2'] } },
    },
    visualMap: {
      min: 0,
      max: maxCount,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 16,
      text: ['多', '少'],
      textStyle: { color: '#5c6e64', fontSize: 9 },
      inRange: { color: ['#eef2ee', '#bde7d8', '#65e6d2', '#187358', '#ff8738'] },
    },
    series: [
      {
        name: '工作数量',
        type: 'heatmap',
        data: cells,
        label: {
          show: true,
          fontSize: 12,
          fontWeight: 800,
          formatter: (params: unknown) => {
            const count = Number(eventData(params)?.[2] ?? 0);
            return count >= maxCount * 0.34 ? `{light|${count}}` : `{dark|${count}}`;
          },
          rich: {
            light: { color: '#ffffff', fontWeight: 900, textShadowBlur: 3, textShadowColor: 'rgba(0,0,0,.35)' },
            dark: { color: '#10221a', fontWeight: 900 },
          },
        },
        itemStyle: { borderWidth: 4, borderColor: '#ffffff', borderRadius: 4 },
        emphasis: { itemStyle: { borderColor: '#ff8738', borderWidth: 3, shadowBlur: 12, shadowColor: 'rgba(20,54,42,.22)' } },
      },
    ],
    media: [
      {
        query: { maxWidth: 520 },
        option: {
          grid: { left: 56, right: 14, top: 26, bottom: 82 },
          xAxis: { axisLabel: { fontSize: 9 }, nameGap: 32 },
          yAxis: { axisLabel: { fontSize: 9 }, nameGap: 36 },
          series: [{ label: { fontSize: 10 }, itemStyle: { borderWidth: 2 } }],
        },
      },
    ],
  };

  return (
    <>
      <ScientificChart
        id="control-evidence-deployment-matrix"
        option={option}
        ariaLabel="控制研究工作 E0 到 E4 证据等级与 D1 到 D5 部署等级交互热图。点击格子可筛选目录。"
        fallbackSrc="/figures/control-verification-ladder-nature.png"
        fallbackAlt="聚变控制功能从数值验证到持续运行的验证阶梯静态图"
        className="controlEvidenceEChart"
        height={520}
        onChartClick={(params) => {
          const cell = eventData(params);
          const evidence = cell?.[3];
          const deployment = cell?.[4];
          if (typeof evidence === 'string' && typeof deployment === 'string') {
            window.location.assign(`/control?evidence=${evidence}&deployment=${deployment}#catalog`);
          }
        }}
      />
      <table className="srOnly">
        <caption>控制研究工作证据等级与部署等级矩阵</caption>
        <thead><tr><th>证据等级</th>{deploymentLevels.map((level) => <th key={level}>{level} · {deploymentLabels[level]}</th>)}</tr></thead>
        <tbody>{evidenceLevels.map((evidence) => <tr key={evidence}><th>{evidence} · {evidenceLabels[evidence]}</th>{deploymentLevels.map((deployment) => <td key={deployment}>{controlResearchItems.filter((item) => item.evidenceLevel === evidence && item.deploymentLevel === deployment).length}</td>)}</tr>)}</tbody>
      </table>
    </>
  );
}
