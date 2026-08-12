'use client';

import type { EChartsCoreOption } from 'echarts/core';
import type { CustomSeriesRenderItem } from 'echarts/types/dist/option';
import type { CSSProperties } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import {
  diagnosticsDeviceProfiles,
  diagnosticsResearchItems,
  diagnosticsTaskMeta,
  type DiagnosticsDeploymentLevel,
  type DiagnosticsEvidenceLevel,
  type DiagnosticsTaskId,
} from './diagnosticsResearch';
import { diagnosticsRoadmapData, diagnosticsTimescaleData } from './diagnosticsVisualData';

const taskIds = Object.keys(diagnosticsTaskMeta) as DiagnosticsTaskId[];
const evidenceLevels: DiagnosticsEvidenceLevel[] = ['E0', 'E1', 'E2', 'E3', 'E4'];
const deploymentLevels: DiagnosticsDeploymentLevel[] = ['D1', 'D2', 'D3', 'D4', 'D5'];

const evidenceLabels: Record<DiagnosticsEvidenceLevel, string> = {
  E0: '需求 / 概念',
  E1: '数值 / 合成',
  E2: '实验室 / 标定',
  E3: '装置数据 / 交叉验证',
  E4: '在线 / 常规使用',
};

const deploymentLabels: Record<DiagnosticsDeploymentLevel, string> = {
  D1: '概念 / 需求',
  D2: '软件 / 实验室原型',
  D3: '安装 / 联调 / 影子 / HIL',
  D4: '常规装置工作流',
  D5: '经批准的安全关键用途',
};

function arrayData(params: unknown): unknown[] | null {
  if (!params || typeof params !== 'object' || !('data' in params)) return null;
  const data = (params as { data?: unknown }).data;
  return Array.isArray(data) ? data : null;
}

function objectData(params: unknown): Record<string, unknown> | null {
  if (!params || typeof params !== 'object' || !('data' in params)) return null;
  const data = (params as { data?: unknown }).data;
  return data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
}

function formatTimescaleTick(value: number) {
  const ticks = new Map<number, string>([
    [1e-6, '1 μs'], [1e-3, '1 ms'], [1, '1 s'], [1e3, '17 min'], [1e6, '12 d'], [1e9, '32 y'],
  ]);
  return ticks.get(value) ?? '';
}

const renderTimescaleRange: CustomSeriesRenderItem = (_params, api) => {
  const category = Number(api.value(0));
  const start = Number(api.value(1));
  const end = Number(api.value(2));
  const color = String(api.value(3));
  const startPoint = api.coord([start, category]);
  const endPoint = api.coord([end, category]);
  const rawBandSize = api.size?.([0, 1]);
  const bandHeight = Array.isArray(rawBandSize) ? Number(rawBandSize[1]) : Number(rawBandSize ?? 42);
  const height = Math.max(11, Math.min(20, Math.abs(bandHeight) * 0.34));
  return {
    type: 'group',
    children: [
      {
        type: 'rect',
        cursor: 'pointer',
        shape: { x: startPoint[0], y: startPoint[1] - height / 2, width: Math.max(3, endPoint[0] - startPoint[0]), height, r: height / 2 },
        style: { fill: color, opacity: 0.94 },
        emphasis: { style: { opacity: 1, shadowBlur: 12, shadowColor: color } },
      },
      { type: 'circle', shape: { cx: startPoint[0], cy: startPoint[1], r: height / 2 }, style: { fill: color } },
      { type: 'circle', shape: { cx: endPoint[0], cy: endPoint[1], r: height / 2 }, style: { fill: color } },
    ],
  };
};

export function DiagnosticsClosedLoopGraph() {
  const nodes = [
    { id: 'device', name: '真实装置', subtitle: 'PLASMA · PLANT', x: 70, y: 215, symbolSize: 84, category: 0 },
    { id: 'instrument', name: '诊断仪器', subtitle: 'RESPONSE · GEOMETRY', x: 250, y: 95, symbolSize: 76, category: 1 },
    { id: 'acquisition', name: '采集与校准', subtitle: 'DAQ · TIME · METROLOGY', x: 445, y: 95, symbolSize: 78, category: 1 },
    { id: 'inference', name: '反演与同化', subtitle: 'STATE · UQ', x: 635, y: 95, symbolSize: 80, category: 2 },
    { id: 'model', name: '数字孪生模型', subtitle: 'PHYSICS · ENGINEERING', x: 635, y: 335, symbolSize: 86, category: 3 },
    { id: 'synthetic', name: '合成诊断', subtitle: 'FORWARD OPERATOR', x: 445, y: 335, symbolSize: 80, category: 3 },
    { id: 'residual', name: '观测残差', subtitle: 'CALIBRATE · VALIDATE', x: 250, y: 335, symbolSize: 76, category: 4 },
    { id: 'quality', name: '质量与证据门', subtitle: 'QUALITY · AUTHORITY', x: 825, y: 215, symbolSize: 84, category: 4 },
    { id: 'decision', name: '实时决策 / 工程健康', subtitle: 'PCS · PROTECTION · HMI', x: 1015, y: 215, symbolSize: 92, category: 5 },
  ];
  const links = [
    { source: 'device', target: 'instrument', value: '真实响应' },
    { source: 'instrument', target: 'acquisition', value: '原始信号' },
    { source: 'acquisition', target: 'inference', value: '计量数据' },
    { source: 'inference', target: 'quality', value: '后验状态 + UQ' },
    { source: 'model', target: 'quality', value: '预测 + 适用域' },
    { source: 'quality', target: 'decision', value: '已授权产品' },
    { source: 'decision', target: 'device', value: '经验证动作' },
    { source: 'model', target: 'synthetic', value: '模拟状态' },
    { source: 'synthetic', target: 'residual', value: '虚拟通道' },
    { source: 'acquisition', target: 'residual', value: '真实通道' },
    { source: 'residual', target: 'model', value: '模型校准' },
    { source: 'residual', target: 'instrument', value: '仪器 / 几何诊断' },
  ];

  const option: EChartsCoreOption = {
    backgroundColor: '#07120f',
    animationDuration: 650,
    aria: {
      enabled: true,
      decal: { show: true },
      description: '聚变装置诊断感知闭环。真实装置经诊断仪器、采集标定、反演同化形成状态；数字孪生经合成诊断返回仪器空间形成残差；状态与模型经过质量证据门后进入实时决策和工程健康。',
    },
    tooltip: {
      trigger: 'item',
      borderWidth: 1,
      borderColor: '#4e6f63',
      backgroundColor: 'rgba(5,16,13,.97)',
      textStyle: { color: '#eef8f3', fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 12 },
      formatter: (params: unknown) => {
        const data = objectData(params);
        if (!data) return '';
        if (typeof data.source === 'string') return `<b>${String(data.value ?? '')}</b><br/><span style="color:#9db3a8">${data.source} → ${String(data.target ?? '')}</span>`;
        return `<b>${String(data.name ?? '')}</b><br/><span style="color:#7de8d2">${String(data.subtitle ?? '')}</span>`;
      },
    },
    legend: {
      bottom: 12,
      data: ['物理实体', '测量链', '状态', '数字模型', '证据治理', '决策'],
      textStyle: { color: '#9bb1a6', fontSize: 9 },
      itemWidth: 10,
      itemHeight: 10,
    },
    series: [{
      type: 'graph',
      layout: 'none',
      roam: true,
      zoom: 0.88,
      center: ['50%', '48%'],
      data: nodes,
      links,
      categories: [
        { name: '物理实体', itemStyle: { color: '#ff7a21' } },
        { name: '测量链', itemStyle: { color: '#33cdb5' } },
        { name: '状态', itemStyle: { color: '#7de8d2' } },
        { name: '数字模型', itemStyle: { color: '#816ddd' } },
        { name: '证据治理', itemStyle: { color: '#f1c667' } },
        { name: '决策', itemStyle: { color: '#f05b4f' } },
      ],
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 8],
      lineStyle: { color: '#6c8b7e', width: 1.5, opacity: 0.78, curveness: 0.08 },
      emphasis: { focus: 'adjacency', lineStyle: { width: 3, opacity: 1 } },
      label: {
        show: true,
        position: 'inside',
        color: '#07120f',
        fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif',
        fontSize: 10,
        fontWeight: 800,
        formatter: '{b}',
      },
      edgeLabel: {
        show: true,
        color: '#b9ccc2',
        fontSize: 8,
        backgroundColor: 'rgba(7,18,15,.8)',
        padding: [2, 3],
        formatter: (params: unknown) => String(objectData(params)?.value ?? ''),
      },
    }],
    media: [{
      query: { maxWidth: 720 },
      option: {
        legend: { show: false },
        series: [{ zoom: 0.55, label: { fontSize: 8 }, edgeLabel: { show: false } }],
      },
    }],
  };

  return (
    <>
      <ScientificChart
        id="diagnostics-observation-model-decision-loop"
        option={option}
        ariaLabel="聚变诊断真实观测、状态反演、合成诊断、证据门与实时决策交互闭环图。可拖动和缩放。"
        fallbackSrc="/figures/diagnostics-measurement-chain-nature.png"
        fallbackAlt="聚变诊断从传感器到可信状态和决策接口的测量链静态图"
        className="diagnosticsLoopChart"
        height={570}
        eager
        dark
      />
      <ol className="srOnly">
        <li>真实装置状态经诊断仪器形成原始响应。</li>
        <li>采集、计时与标定把原始信号转化为可追溯观测。</li>
        <li>反演和数据同化输出带不确定度的状态。</li>
        <li>数字孪生模型经合成诊断生成虚拟通道，并与真实通道形成残差。</li>
        <li>状态与模型结果经过质量、证据和权限门后进入实时决策或工程健康。</li>
      </ol>
    </>
  );
}

export function DiagnosticsTaskCoverageChart() {
  const rows = taskIds.map((taskId) => ({
    taskId,
    label: diagnosticsTaskMeta[taskId].label,
    role: diagnosticsTaskMeta[taskId].role,
    primary: diagnosticsResearchItems.filter((item) => item.primaryTask === taskId).length,
    associated: diagnosticsResearchItems.filter((item) => item.primaryTask === taskId || (item.relatedTasks as readonly DiagnosticsTaskId[]).includes(taskId)).length,
  }));
  const max = Math.max(...rows.map((row) => row.associated));
  const option: EChartsCoreOption = {
    backgroundColor: '#ffffff',
    animationDuration: 520,
    aria: {
      enabled: true,
      decal: { show: true },
      description: 'DG0 到 DG11 诊断任务研究覆盖条形图。深色表示以该任务为主分类的唯一工作数，浅色表示主任务或关联任务的合计覆盖数。',
    },
    grid: { left: 218, right: 48, top: 38, bottom: 58 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      borderColor: '#b3c2ba',
      backgroundColor: 'rgba(255,255,252,.98)',
      textStyle: { color: '#14251e', fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 12 },
      formatter: (params: unknown) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const first = params[0] as { data?: Record<string, unknown> };
        const data = first.data ?? {};
        return `<b>${String(data.taskId ?? '')} · ${String(data.label ?? '')}</b><br/>主任务：${String(data.primary ?? '')} 项<br/>含关联：${String(data.associated ?? '')} 项<br/><span style="color:#16745c">点击进入目录筛选 →</span>`;
      },
    },
    legend: { top: 6, right: 28, data: ['主任务（唯一计数）', '含关联任务'], textStyle: { color: '#53665d', fontSize: 9 } },
    xAxis: {
      type: 'value',
      max: Math.ceil(max / 5) * 5,
      name: '收录工作数',
      nameLocation: 'middle',
      nameGap: 36,
      axisLine: { lineStyle: { color: '#abbab2' } },
      axisTick: { show: false },
      axisLabel: { color: '#64746c', fontSize: 9 },
      splitLine: { lineStyle: { color: '#e2e8e4', type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: rows.map((row) => `${row.taskId}  ${row.label}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#20352b', fontSize: 10, fontWeight: 700, width: 190, overflow: 'truncate', margin: 14 },
    },
    series: [
      {
        name: '含关联任务',
        type: 'bar',
        barWidth: 18,
        data: rows.map((row) => ({ ...row, value: row.associated })),
        itemStyle: { color: '#cfeee6', borderRadius: [0, 4, 4, 0] },
        emphasis: { itemStyle: { color: '#86dfcf' } },
      },
      {
        name: '主任务（唯一计数）',
        type: 'bar',
        barWidth: 10,
        barGap: '-78%',
        data: rows.map((row) => ({ ...row, value: row.primary })),
        itemStyle: { color: (params: { dataIndex: number }) => rows[params.dataIndex]?.role === 'cross-cutting' ? '#7d6ad8' : '#ff7a21', borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: '#263a31', fontSize: 9, fontWeight: 800 },
      },
    ],
    media: [{
      query: { maxWidth: 650 },
      option: {
        grid: { left: 104, right: 30, top: 58, bottom: 52 },
        yAxis: { axisLabel: { width: 84, fontSize: 8 } },
        legend: { left: 10, top: 8 },
      },
    }],
  };

  return (
    <>
      <ScientificChart
        id="diagnostics-task-coverage"
        option={option}
        ariaLabel="DG0 到 DG11 诊断任务主分类工作数和关联覆盖数交互条形图。点击条形可筛选目录。"
        fallbackSrc="/figures/diagnostics-taxonomy-nature.png"
        fallbackAlt="聚变诊断任务分类静态图"
        className="diagnosticsCoverageChart"
        height={620}
        onChartClick={(params) => {
          const taskId = objectData(params)?.taskId;
          if (typeof taskId === 'string' && /^DG(?:[0-9]|1[01])$/.test(taskId)) {
            window.location.assign(`/diagnostics?task=${taskId}#catalog`);
          }
        }}
      />
      <table className="srOnly">
        <caption>诊断任务研究覆盖</caption>
        <thead><tr><th>任务</th><th>名称</th><th>主任务工作数</th><th>含关联工作数</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.taskId}><th>{row.taskId}</th><td>{row.label}</td><td>{row.primary}</td><td>{row.associated}</td></tr>)}</tbody>
      </table>
      <nav className="diagnosticsChartLinks diagnosticsTaskChartLinks" aria-label="按 DG0 到 DG11 筛选诊断目录">
        {rows.map((row) => <a key={row.taskId} href={`/diagnostics?task=${row.taskId}#catalog`}>{row.taskId}<span>{row.label}</span><b>{row.primary}</b></a>)}
      </nav>
    </>
  );
}

export function DiagnosticsEvidenceHeatmap() {
  const cells = evidenceLevels.flatMap((evidence, evidenceIndex) => deploymentLevels.map((deployment, deploymentIndex) => {
    const count = diagnosticsResearchItems.filter((item) => item.evidenceLevel === evidence && item.deploymentLevel === deployment).length;
    return [deploymentIndex, evidenceIndex, count, evidence, deployment];
  }));
  const maxCount = Math.max(1, ...cells.map((cell) => Number(cell[2])));
  const option: EChartsCoreOption = {
    backgroundColor: '#ffffff',
    animationDuration: 480,
    aria: {
      enabled: true,
      decal: { show: true },
      description: '聚变诊断工作按 E0 到 E4 科学运行证据和 D1 到 D5 工程部署责任交叉聚合的热图。',
    },
    grid: { left: 76, right: 30, top: 40, bottom: 96 },
    tooltip: {
      trigger: 'item',
      borderColor: '#aebeb5',
      backgroundColor: 'rgba(255,255,252,.98)',
      textStyle: { color: '#13231c', fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 12 },
      formatter: (params: unknown) => {
        const cell = arrayData(params);
        if (!cell) return '';
        const evidence = String(cell[3]) as DiagnosticsEvidenceLevel;
        const deployment = String(cell[4]) as DiagnosticsDeploymentLevel;
        return `<b>${evidence} · ${evidenceLabels[evidence]}</b><br/>${deployment} · ${deploymentLabels[deployment]}<br/><strong style="font-size:19px;color:#a64a13">${Number(cell[2])}</strong> 项工作<br/><span style="color:#16745c">点击按 E / D 筛选 →</span>`;
      },
    },
    xAxis: {
      type: 'category',
      data: deploymentLevels,
      name: '部署责任 D',
      nameLocation: 'middle',
      nameGap: 38,
      axisLine: { lineStyle: { color: '#aebdb5' } },
      axisTick: { show: false },
      axisLabel: { color: '#31463b', fontSize: 11, fontWeight: 800 },
      splitArea: { show: true, areaStyle: { color: ['#fafaf6', '#f4f6f2'] } },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: evidenceLevels,
      name: '科学证据 E',
      nameLocation: 'middle',
      nameGap: 48,
      axisLine: { lineStyle: { color: '#aebdb5' } },
      axisTick: { show: false },
      axisLabel: { color: '#31463b', fontSize: 11, fontWeight: 800 },
      splitArea: { show: true, areaStyle: { color: ['#fafaf6', '#f4f6f2'] } },
    },
    visualMap: {
      min: 0,
      max: maxCount,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 17,
      text: ['多', '少'],
      textStyle: { color: '#5c6e64', fontSize: 9 },
      inRange: { color: ['#eff2ef', '#c8ebe1', '#6fd8c4', '#257962', '#806bd4', '#ff7a21'] },
    },
    series: [{
      name: '工作数量',
      type: 'heatmap',
      data: cells,
      label: {
        show: true,
        fontSize: 12,
        fontWeight: 900,
        formatter: (params: unknown) => {
          const count = Number(arrayData(params)?.[2] ?? 0);
          return count >= maxCount * 0.3 ? `{light|${count}}` : `{dark|${count}}`;
        },
        rich: {
          light: { color: '#fff', fontWeight: 900, textShadowBlur: 3, textShadowColor: 'rgba(0,0,0,.4)' },
          dark: { color: '#10221a', fontWeight: 900 },
        },
      },
      itemStyle: { borderWidth: 4, borderColor: '#fff', borderRadius: 4 },
      emphasis: { itemStyle: { borderColor: '#ff7a21', borderWidth: 3, shadowBlur: 12, shadowColor: 'rgba(20,54,42,.24)' } },
    }],
    media: [{
      query: { maxWidth: 520 },
      option: {
        grid: { left: 56, right: 14, top: 30, bottom: 84 },
        xAxis: { axisLabel: { fontSize: 9 }, nameGap: 32 },
        yAxis: { axisLabel: { fontSize: 9 }, nameGap: 36 },
        series: [{ label: { fontSize: 10 }, itemStyle: { borderWidth: 2 } }],
      },
    }],
  };

  return (
    <>
      <ScientificChart
        id="diagnostics-evidence-deployment-matrix"
        option={option}
        ariaLabel="聚变诊断工作 E0 到 E4 科学证据与 D1 到 D5 部署责任交互热图。点击格子可筛选研究目录。"
        fallbackSrc=""
        fallbackAlt="聚变诊断科学证据与部署责任矩阵"
        fallback={(
          <table className="diagnosticsEvidenceFallback">
            <caption>诊断工作科学证据与部署责任矩阵</caption>
            <thead><tr><th>证据 / 部署</th>{deploymentLevels.map((level) => <th key={level}>{level}</th>)}</tr></thead>
            <tbody>{evidenceLevels.map((evidence) => <tr key={evidence}><th>{evidence}</th>{deploymentLevels.map((deployment) => {
              const count = diagnosticsResearchItems.filter((item) => item.evidenceLevel === evidence && item.deploymentLevel === deployment).length;
              return <td key={deployment} style={{ '--matrix-strength': count / maxCount } as CSSProperties}><span>{count}</span></td>;
            })}</tr>)}</tbody>
          </table>
        )}
        className="diagnosticsEvidenceChart"
        height={530}
        onChartClick={(params) => {
          const cell = arrayData(params);
          const evidence = cell?.[3];
          const deployment = cell?.[4];
          if (typeof evidence === 'string' && typeof deployment === 'string') {
            window.location.assign(`/diagnostics?evidence=${evidence}&deployment=${deployment}#catalog`);
          }
        }}
      />
      <table className="srOnly">
        <caption>诊断工作科学证据与部署责任矩阵</caption>
        <thead><tr><th>科学证据</th>{deploymentLevels.map((level) => <th key={level}>{level} · {deploymentLabels[level]}</th>)}</tr></thead>
        <tbody>{evidenceLevels.map((evidence) => <tr key={evidence}><th>{evidence} · {evidenceLabels[evidence]}</th>{deploymentLevels.map((deployment) => <td key={deployment}>{diagnosticsResearchItems.filter((item) => item.evidenceLevel === evidence && item.deploymentLevel === deployment).length}</td>)}</tr>)}</tbody>
      </table>
      <nav className="diagnosticsChartLinks diagnosticsEvidenceLinks" aria-label="按科学证据与部署责任筛选诊断目录">
        {evidenceLevels.flatMap((evidence) => deploymentLevels.map((deployment) => {
          const count = diagnosticsResearchItems.filter((item) => item.evidenceLevel === evidence && item.deploymentLevel === deployment).length;
          return count > 0 ? <a key={`${evidence}-${deployment}`} href={`/diagnostics?evidence=${evidence}&deployment=${deployment}#catalog`}>{evidence} / {deployment}<b>{count}</b></a> : null;
        }))}
      </nav>
    </>
  );
}

export function DiagnosticsTimescaleChart() {
  const data = diagnosticsTimescaleData.map((row, index) => [index, row.minSeconds, row.maxSeconds, row.color, row.label]);
  const option: EChartsCoreOption = {
    backgroundColor: '#ffffff',
    animationDuration: 520,
    grid: { left: 205, right: 40, top: 38, bottom: 66 },
    aria: {
      enabled: true,
      decal: { show: true },
      description: '聚变诊断从微秒快事件到数十年材料寿命的典型时间尺度对数区间图。范围是架构综合示意，不是装置性能承诺。',
    },
    tooltip: {
      trigger: 'item',
      borderColor: '#aebeb5',
      backgroundColor: 'rgba(255,255,252,.98)',
      textStyle: { color: '#14251e', fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 12 },
      formatter: (params: unknown) => {
        const row = arrayData(params);
        if (!row) return '';
        return `<b>${String(row[4])}</b><br/>典型范围：${Number(row[1]).toExponential()}–${Number(row[2]).toExponential()} s<br/><span style="color:#66786f">综合数量级示意；实际范围取决于仪器、信噪比、算法与决策用途。</span>`;
      },
    },
    xAxis: {
      type: 'log', min: 1e-6, max: 1e9, logBase: 10,
      name: '典型观测 / 状态 / 维护时间尺度（对数）', nameLocation: 'middle', nameGap: 42,
      nameTextStyle: { color: '#607269', fontSize: 10 },
      axisLine: { lineStyle: { color: '#aebdb5' } }, axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: '#e2e8e4', type: 'dashed' } }, minorSplitLine: { show: false },
      axisLabel: { color: '#5a6d63', fontSize: 9, formatter: formatTimescaleTick },
    },
    yAxis: {
      type: 'category', inverse: true, data: diagnosticsTimescaleData.map((row) => row.label),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: '#20352b', fontSize: 10, fontWeight: 700, width: 175, overflow: 'truncate', margin: 14 },
    },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseMove: true }],
    series: [{ type: 'custom', name: '典型时间尺度', renderItem: renderTimescaleRange, encode: { x: [1, 2], y: 0 }, data, z: 4 }],
    media: [{ query: { maxWidth: 620 }, option: { grid: { left: 112, right: 20, top: 32, bottom: 62 }, yAxis: { axisLabel: { width: 92, fontSize: 8 } } } }],
  };
  return (
    <>
      <ScientificChart
        id="diagnostics-nested-timescales"
        option={option}
        ariaLabel="聚变诊断从微秒快事件到数十年全寿命的典型时间尺度交互对数区间图。"
        fallbackSrc="/figures/diagnostics-timescale-nature.png"
        fallbackAlt="聚变诊断从微秒快事件到全生命周期的时间尺度静态图"
        className="diagnosticsTimescaleChart"
        height={510}
      />
      <table className="srOnly"><caption>聚变诊断典型时间尺度</caption><thead><tr><th>类别</th><th>下限（秒）</th><th>上限（秒）</th></tr></thead><tbody>{diagnosticsTimescaleData.map((row) => <tr key={row.label}><th>{row.label}</th><td>{row.minSeconds}</td><td>{row.maxSeconds}</td></tr>)}</tbody></table>
    </>
  );
}

export function DiagnosticsDeviceCoverageChart() {
  const cells = diagnosticsDeviceProfiles.flatMap((device, deviceIndex) => taskIds.map((taskId, taskIndex) => [taskIndex, deviceIndex, (device.primaryTasks as readonly DiagnosticsTaskId[]).includes(taskId) ? 1 : 0, taskId, device.name]));
  const option: EChartsCoreOption = {
    backgroundColor: '#ffffff',
    animationDuration: 500,
    grid: { left: 142, right: 30, top: 48, bottom: 72 },
    aria: {
      enabled: true,
      decal: { show: true },
      description: '十八个聚变装置档案与 DG0 到 DG11 诊断任务的公开证据索引矩阵。着色只表示本版档案存在公开关联证据，不代表系统同时可用或成熟度相同。',
    },
    tooltip: {
      trigger: 'item',
      borderColor: '#aebeb5', backgroundColor: 'rgba(255,255,252,.98)',
      textStyle: { color: '#14251e', fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 12 },
      formatter: (params: unknown) => {
        const cell = arrayData(params);
        if (!cell) return '';
        const taskId = String(cell[3]) as DiagnosticsTaskId;
        const covered = Number(cell[2]) === 1;
        return `<b>${String(cell[4])}</b><br/>${taskId} · ${diagnosticsTaskMeta[taskId].label}<br/><span style="color:${covered ? '#16745c' : '#76847d'}">${covered ? '本版装置档案记录了公开关联证据' : '本版档案未确认公开关联证据'}</span><br/><span style="color:#7a8981">这是证据索引，不代表同步可用或成熟度等同。</span>`;
      },
    },
    xAxis: { type: 'category', data: taskIds, position: 'top', axisLine: { lineStyle: { color: '#aebdb5' } }, axisTick: { show: false }, axisLabel: { color: '#274237', fontSize: 9, fontWeight: 800, interval: 0 } },
    yAxis: { type: 'category', inverse: true, data: diagnosticsDeviceProfiles.map((device) => device.name), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#20352b', fontSize: 9, fontWeight: 700, width: 118, overflow: 'truncate', margin: 12 } },
    visualMap: { show: false, min: 0, max: 1, inRange: { color: ['#e7ebe8', '#20aa9d'] } },
    series: [{
      type: 'heatmap', data: cells,
      label: { show: true, color: '#fff', fontSize: 8, formatter: (params: unknown) => Number(arrayData(params)?.[2] ?? 0) === 1 ? '●' : '' },
      itemStyle: { borderWidth: 2, borderColor: '#fff' },
      emphasis: { itemStyle: { borderColor: '#ff7a21', borderWidth: 2, shadowBlur: 8, shadowColor: 'rgba(20,54,42,.22)' } },
    }],
    dataZoom: [{ type: 'inside', yAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseMove: true }],
    media: [{ query: { maxWidth: 620 }, option: { grid: { left: 82, right: 12, top: 42, bottom: 58 }, yAxis: { axisLabel: { width: 64, fontSize: 8 } }, xAxis: { axisLabel: { fontSize: 8 } } } }],
  };
  return (
    <>
      <ScientificChart
        id="diagnostics-device-task-coverage"
        option={option}
        ariaLabel="十八个聚变装置与 DG0 到 DG11 诊断任务的公开证据覆盖交互矩阵。"
        fallbackSrc="/figures/diagnostics-device-coverage-nature.png"
        fallbackAlt="主要聚变装置与诊断任务公开证据覆盖静态矩阵"
        className="diagnosticsDeviceCoverageChart"
        height={660}
      />
      <table className="srOnly"><caption>装置与诊断任务公开证据索引</caption><thead><tr><th>装置</th>{taskIds.map((taskId) => <th key={taskId}>{taskId}</th>)}</tr></thead><tbody>{diagnosticsDeviceProfiles.map((device) => <tr key={device.id}><th>{device.name}</th>{taskIds.map((taskId) => <td key={taskId}>{(device.primaryTasks as readonly DiagnosticsTaskId[]).includes(taskId) ? '有关联证据' : '本版未确认'}</td>)}</tr>)}</tbody></table>
    </>
  );
}

const renderRoadmapRange: CustomSeriesRenderItem = (_params, api) => {
  const category = Number(api.value(0));
  const start = Number(api.value(1));
  const end = Number(api.value(2));
  const color = String(api.value(3));
  const startPoint = api.coord([start, category]);
  const endPoint = api.coord([end, category]);
  const rawBandSize = api.size?.([0, 1]);
  const bandHeight = Array.isArray(rawBandSize) ? Number(rawBandSize[1]) : Number(rawBandSize ?? 50);
  const height = Math.max(14, Math.min(24, Math.abs(bandHeight) * 0.42));
  return { type: 'rect', cursor: 'pointer', shape: { x: startPoint[0], y: startPoint[1] - height / 2, width: Math.max(3, endPoint[0] - startPoint[0]), height, r: height / 2 }, style: { fill: color, opacity: .95 }, emphasis: { style: { opacity: 1, shadowBlur: 12, shadowColor: color } } };
};

export function DiagnosticsRoadmapChart() {
  const data = diagnosticsRoadmapData.map((row, index) => [index, row.startMonth, row.endMonth, row.color, row.id, row.title, row.period, row.gate]);
  const option: EChartsCoreOption = {
    backgroundColor: '#ffffff', animationDuration: 520,
    grid: { left: 195, right: 46, top: 36, bottom: 58 },
    aria: { enabled: true, decal: { show: true }, description: 'FusionDigital 聚变诊断数字孪生建议路线图。阶段允许并行，以证据门晋级，月份区间不是已批准项目进度承诺。' },
    tooltip: {
      trigger: 'item', borderColor: '#aebeb5', backgroundColor: 'rgba(255,255,252,.98)',
      textStyle: { color: '#14251e', fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 12 },
      formatter: (params: unknown) => { const row = arrayData(params); return row ? `<b>${String(row[4])} · ${String(row[5])}</b><br/>建议区间：${String(row[6])}<br/>证据门：${String(row[7])}<br/><span style="color:#77867f">允许并行；不是已批准的进度或性能承诺。</span>` : ''; },
    },
    xAxis: { type: 'value', min: 0, max: 96, interval: 12, name: '建议时间窗口（月）', nameLocation: 'middle', nameGap: 36, axisLine: { lineStyle: { color: '#aebdb5' } }, axisTick: { show: false }, axisLabel: { color: '#617168', fontSize: 9 }, splitLine: { lineStyle: { color: '#e2e8e4', type: 'dashed' } } },
    yAxis: { type: 'category', inverse: true, data: diagnosticsRoadmapData.map((row) => `${row.id}  ${row.title}`), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#20352b', fontSize: 10, fontWeight: 700, width: 165, overflow: 'truncate', margin: 14 } },
    dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'shift', moveOnMouseMove: true }],
    series: [{ type: 'custom', name: '建议窗口', renderItem: renderRoadmapRange, encode: { x: [1, 2], y: 0 }, data, z: 4 }],
    media: [{ query: { maxWidth: 620 }, option: { grid: { left: 105, right: 20, top: 32, bottom: 56 }, yAxis: { axisLabel: { width: 84, fontSize: 8 } } } }],
  };
  return (
    <>
      <ScientificChart
        id="diagnostics-digital-twin-roadmap"
        option={option}
        ariaLabel="FusionDigital 聚变诊断数字孪生从配置基线到整厂诊断孪生的交互甘特图。"
        fallbackSrc="/figures/diagnostics-roadmap-nature.png"
        fallbackAlt="FusionDigital 聚变诊断数字孪生建议路线静态甘特图"
        className="diagnosticsRoadmapChart"
        height={500}
      />
      <table className="srOnly"><caption>FusionDigital 聚变诊断建议路线</caption><thead><tr><th>阶段</th><th>名称</th><th>开始月</th><th>结束月</th><th>证据门</th></tr></thead><tbody>{diagnosticsRoadmapData.map((row) => <tr key={row.id}><th>{row.id}</th><td>{row.title}</td><td>{row.startMonth}</td><td>{row.endMonth}</td><td>{row.gate}</td></tr>)}</tbody></table>
    </>
  );
}
