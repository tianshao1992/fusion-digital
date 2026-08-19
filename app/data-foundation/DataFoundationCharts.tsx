'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useMemo } from 'react';
import ScientificChart from '../components/charts/ScientificChart';
import { useChartTheme } from '../components/charts/chart-theme';
import { useI18n } from '../i18n';
import {
  dataCategoryMeta,
  dataFoundationRecords,
  dataFoundationRoute,
  type DataCategory,
} from './dataFoundation';

const FONT = 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC","PingFang SC","Microsoft YaHei UI","Microsoft YaHei",Arial,sans-serif';

type RouteId = (typeof dataFoundationRoute)[number]['id'];

const ROUTE_NODE_LABELS = {
  L0: { zh: 'L0\n事实源与采集', en: 'L0\nSource systems\n& acquisition' },
  L1: { zh: 'L1\n权威源档案\n与锁定快照', en: 'L1\nAuthoritative\narchive & locked\nsnapshot' },
  L2: { zh: 'L2\n统一访问与对时', en: 'L2\nUnified access\n& time alignment' },
  L3: { zh: 'L3\n语义交换与映射', en: 'L3\nSemantic exchange\n& mapping' },
  L4: { zh: 'L4\n策展科学产品', en: 'L4\nCurated scientific\nproducts' },
  L5: { zh: 'L5\n目录、血缘与权限', en: 'L5\nCatalogue, lineage\n& authorization' },
  L6: { zh: 'L6\n工作流与\n近数据计算', en: 'L6\nWorkflow &\ncompute-to-data' },
  L7: { zh: 'L7\n版本快照与\n证据发布', en: 'L7\nVersioned evidence\npublication' },
} satisfies Record<RouteId, { zh: string; en: string }>;

const ARCHITECTURE_BRANCH_ROWS = [
  {
    id: 'H0',
    zh: '确定性控制热路径',
    en: 'Deterministic control hot path',
    tools: 'Native PCS · machine protection · hard real-time interlocks',
    deliverable: '有界时延且独立于网页和数据平台的控制与保护闭环',
    deliverableEn: 'Bounded-latency control and protection loop independent of the web and data platform',
  },
  {
    id: 'H1',
    zh: '只读影子服务',
    en: 'Read-only shadow services',
    tools: 'Read-only adapters · between-shot analysis · monitoring',
    deliverable: '无机器控制写权限的受治理分析与证据视图',
    deliverableEn: 'Governed analysis and evidence views with no machine-control write authority',
  },
  {
    id: 'H2',
    zh: '证据与发布门',
    en: 'Evidence and release gate',
    tools: 'Context of use · validation domain · UQ · ownership · access policy',
    deliverable: '通过用途、验证域、不确定度、责任人与访问策略审查的发布包',
    deliverableEn: 'Release package reviewed for context of use, validation domain, uncertainty, ownership and access policy',
  },
] as const;

type RouteNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  symbol: 'roundRect' | 'diamond';
  symbolSize: [number, number];
  itemStyle: { color: string; borderColor: string; borderWidth: number };
  label: {
    show: true;
    position: 'inside';
    align: 'center';
    verticalAlign: 'middle';
    width: number;
    overflow: 'break';
    color: string;
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
  };
  tooltipText: string;
};

type LandscapeLabelPosition = 'left' | 'right' | 'top' | 'bottom';

type LandscapePointLayout = {
  symbolOffset: [number, number];
  labelPosition: LandscapeLabelPosition;
};

const LANDSCAPE_CLUSTER_OFFSETS: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [[-28, -18], [28, 18]],
  3: [[0, -34], [-32, 22], [32, 22]],
  4: [[-32, -28], [32, -28], [-32, 28], [32, 28]],
  5: [[0, -40], [-38, -12], [38, -12], [-24, 34], [24, 34]],
  6: [[-40, -32], [0, -42], [40, -32], [-40, 32], [0, 42], [40, 32]],
};

/**
 * Several catalogues share the same editorial score. Keep the real integer
 * values intact and separate only their rendered symbols, so labels and
 * pointer targets remain discoverable without implying false score precision.
 */
function buildLandscapePointLayout(): Map<string, LandscapePointLayout> {
  const clusters = new Map<string, typeof dataFoundationRecords>();
  for (const record of dataFoundationRecords) {
    const key = `${record.lifecycleReach}:${record.interoperability}`;
    clusters.set(key, [...(clusters.get(key) ?? []), record]);
  }

  const layout = new Map<string, LandscapePointLayout>();
  for (const records of clusters.values()) {
    const sorted = [...records].sort((left, right) => left.id.localeCompare(right.id));
    const offsets = LANDSCAPE_CLUSTER_OFFSETS[sorted.length] ?? LANDSCAPE_CLUSTER_OFFSETS[6];
    sorted.forEach((record, index) => {
      const symbolOffset = offsets[index] ?? [0, 0];
      const labelPosition: LandscapeLabelPosition = record.lifecycleReach >= 4
        ? 'left'
        : record.lifecycleReach <= 2
          ? 'right'
          : symbolOffset[0] < 0
            ? 'left'
            : symbolOffset[0] > 0
              ? 'right'
              : symbolOffset[1] < 0 ? 'top' : 'bottom';
      layout.set(record.id, { symbolOffset, labelPosition });
    });
  }
  return layout;
}

const LANDSCAPE_POINT_LAYOUT = buildLandscapePointLayout();

export function DataArchitectureChart() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const palette = useChartTheme();
  const option = useMemo<EChartsCoreOption>(() => {
    const routeColors = ['#52685b', '#526d62', '#2f706a', '#397670', '#a94f34', '#6b5e73', '#4e6c8b', '#7f5436'];
    const nodes: RouteNode[] = dataFoundationRoute.map((step, index) => ({
      id: step.id,
      name: en ? ROUTE_NODE_LABELS[step.id].en : ROUTE_NODE_LABELS[step.id].zh,
      x: 110 + index * 130,
      y: 230,
      symbol: 'roundRect',
      symbolSize: [116, 66],
      itemStyle: { color: routeColors[index], borderColor: palette.background, borderWidth: 2 },
      label: { show: true, position: 'inside', align: 'center', verticalAlign: 'middle', width: 100, overflow: 'break', color: '#fffdf8', fontFamily: FONT, fontSize: 10, fontWeight: 700, lineHeight: 14 },
      tooltipText: `<b>${step.id} · ${en ? step.en : step.zh}</b><br/>${step.tools}<br/>${en ? step.deliverableEn : step.deliverable}`,
    }));
    nodes.push(
      {
        id: 'hot-path',
        name: en ? 'Deterministic\ncontrol hot path' : '确定性\n控制热路径',
        x: 250,
        y: 72,
        symbol: 'diamond',
        symbolSize: [128, 72],
        itemStyle: { color: '#a4472e', borderColor: palette.background, borderWidth: 2 },
        label: { show: true, position: 'inside', align: 'center', verticalAlign: 'middle', width: 82, overflow: 'break', color: '#fffdf8', fontFamily: FONT, fontSize: 10, fontWeight: 800, lineHeight: 15 },
        tooltipText: en
          ? '<b>Deterministic control hot path</b><br/>Native PCS / protection interfaces; bounded latency; independent interlocks.'
          : '<b>确定性控制热路径</b><br/>原生 PCS / 保护接口、确定时延、独立联锁。',
      },
      {
        id: 'read-only',
        name: en ? 'Read-only\nshadow services' : '只读\n影子服务',
        x: 550,
        y: 72,
        symbol: 'roundRect',
        symbolSize: [128, 62],
        itemStyle: { color: '#355f70', borderColor: palette.background, borderWidth: 2 },
        label: { show: true, position: 'inside', align: 'center', verticalAlign: 'middle', width: 108, overflow: 'break', color: '#fffdf8', fontFamily: FONT, fontSize: 10, fontWeight: 800, lineHeight: 15 },
        tooltipText: en
          ? '<b>Read-only shadow services</b><br/>Between-shot analysis, monitoring and evidence views; no machine-control write authority.'
          : '<b>只读影子服务</b><br/>炮间分析、监测与证据视图；无机器控制写权限。',
      },
      {
        id: 'evidence-gate',
        name: en ? 'Evidence &\nrelease gate' : '证据与\n发布门',
        x: 970,
        y: 72,
        symbol: 'diamond',
        symbolSize: [122, 72],
        itemStyle: { color: '#705f75', borderColor: palette.background, borderWidth: 2 },
        label: { show: true, position: 'inside', align: 'center', verticalAlign: 'middle', width: 78, overflow: 'break', color: '#fffdf8', fontFamily: FONT, fontSize: 10, fontWeight: 800, lineHeight: 15 },
        tooltipText: en
          ? '<b>Evidence and release gate</b><br/>Context of use, validation domain, uncertainty, owner and access policy are mandatory.'
          : '<b>证据与发布门</b><br/>用途、验证域、不确定度、责任人与访问策略缺一不可。',
      },
    );
    const compactNodes = nodes.map((node) => {
      const routeIndex = dataFoundationRoute.findIndex((step) => step.id === node.id);
      if (routeIndex >= 0) {
        return {
          ...node,
          x: 0,
          y: routeIndex * 80,
          symbolSize: [104, 52] as [number, number],
          label: { ...node.label, width: 88, fontSize: 8, lineHeight: 11 },
        };
      }
      const positions: Record<string, number> = { 'hot-path': 72, 'read-only': 264, 'evidence-gate': 520 };
      return {
        ...node,
        x: 280,
        y: positions[node.id],
        symbolSize: [106, 56] as [number, number],
        label: { ...node.label, width: node.symbol === 'diamond' ? 72 : 92, fontSize: 8, lineHeight: 11 },
      };
    });
    const links: Array<{ source: string; target: string; lineStyle: Record<string, unknown> }> = dataFoundationRoute.slice(0, -1).map((step, index) => ({
      source: step.id,
      target: dataFoundationRoute[index + 1].id,
      lineStyle: { color: palette.info, width: 2.4, opacity: .86 },
    }));
    links.push(
      { source: 'L0', target: 'hot-path', lineStyle: { color: '#a4472e', width: 2.6, opacity: .92 } },
      { source: 'hot-path', target: 'read-only', lineStyle: { color: '#a4472e', width: 2.2, opacity: .82, type: 'dashed' } },
      { source: 'L2', target: 'read-only', lineStyle: { color: '#355f70', width: 2.2, opacity: .86 } },
      { source: 'read-only', target: 'L5', lineStyle: { color: '#355f70', width: 2.2, opacity: .86 } },
      { source: 'L7', target: 'evidence-gate', lineStyle: { color: '#705f75', width: 2.4, opacity: .9 } },
    );
    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        extraCssText: 'max-width:min(360px,calc(100vw - 32px));white-space:normal;line-height:1.55;overflow-wrap:anywhere;',
        formatter: (params: { data?: { tooltipText?: string; source?: string; target?: string } }) => params.data?.tooltipText ?? `${params.data?.source ?? ''} → ${params.data?.target ?? ''}`,
      },
      aria: { enabled: true, decal: { show: true } },
      series: [{
        type: 'graph',
        layout: 'none',
        left: 82,
        right: 82,
        top: 66,
        bottom: 62,
        data: nodes,
        links,
        label: { show: true, position: 'inside' },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 9],
        lineStyle: { curveness: 0, width: 2 },
        emphasis: { focus: 'adjacency', scale: 1.04, label: { show: true }, lineStyle: { width: 4 } },
        roam: false,
      }],
      media: [{
        query: { maxWidth: 700 },
        option: {
          series: [{
            left: 64,
            right: 64,
            top: 40,
            bottom: 40,
            data: compactNodes,
            lineStyle: { curveness: .08, width: 2 },
          }],
        },
      }],
    };
  }, [en, palette]);

  return <ScientificChart
    id="fusion-data-foundation-architecture"
    option={option}
    ariaLabel={en ? 'Layered fusion-data architecture from source acquisition through authoritative archives and policy-locked snapshots, IMAS semantics, provenance and evidence publication, with a separate deterministic control hot path' : '从事实源采集、权威源档案和策略锁定快照、IMAS 语义、血缘到证据发布的分层聚变数据架构，并单独显示确定性控制热路径'}
    fallbackSrc=""
    fallbackAlt=""
    fallback={<table className="dataChartTable"><caption>{en ? 'Fusion-data architecture and deliverables' : '聚变数据架构与交付物'}</caption><thead><tr><th>{en ? 'Layer' : '层级'}</th><th>{en ? 'Purpose' : '目的'}</th><th>{en ? 'Candidate technologies' : '候选技术'}</th><th>{en ? 'Evidence deliverable' : '证据交付'}</th></tr></thead><tbody>{dataFoundationRoute.map((step) => <tr key={step.id}><th>{step.id}</th><td>{en ? step.en : step.zh}</td><td>{step.tools}</td><td>{en ? step.deliverableEn : step.deliverable}</td></tr>)}{ARCHITECTURE_BRANCH_ROWS.map((step) => <tr key={step.id}><th>{step.id}</th><td>{en ? step.en : step.zh}</td><td>{step.tools}</td><td>{en ? step.deliverableEn : step.deliverable}</td></tr>)}</tbody></table>}
    className="dataArchitectureChart"
    height={500}
    eager
    keepFallbackAccessible
  />;
}

export function DataLandscapeChart() {
  const { locale } = useI18n();
  const en = locale === 'en';
  const palette = useChartTheme();
  const option = useMemo<EChartsCoreOption>(() => {
    const categories = Object.keys(dataCategoryMeta) as DataCategory[];
    return {
      tooltip: {
        trigger: 'item',
        confine: true,
        extraCssText: 'max-width:min(360px,calc(100vw - 32px));white-space:normal;line-height:1.55;overflow-wrap:anywhere;',
        formatter: (params: { data?: { name?: string; value?: number[]; organization?: string; scope?: string; access?: string } }) => {
          const item = params.data;
          return item ? `<b>${item.name}</b><br/>${item.organization}<br/>${item.scope}<br/>${en ? 'Lifecycle / interoperability' : '生命周期 / 语义互操作'}: ${item.value?.[0]}/5 · ${item.value?.[1]}/5<br/>${en ? 'Access' : '访问'}: ${item.access}` : '';
        },
      },
      legend: { top: 12, type: 'scroll', data: categories.map((category) => en ? dataCategoryMeta[category].en : dataCategoryMeta[category].zh) },
      grid: { left: 66, right: 28, top: 80, bottom: 58 },
      xAxis: {
        min: .7,
        max: 5.3,
        interval: 1,
        name: en ? 'Lifecycle reach →' : '生命周期覆盖 →',
        nameLocation: 'middle',
        nameGap: 38,
        axisLabel: { formatter: (value: number) => ({ 1: en ? 'single task' : '单任务', 3: en ? 'shot / campaign' : '炮次/实验轮次', 5: en ? 'plant lifecycle' : '装置全寿期' }[value] ?? '') },
      },
      yAxis: {
        min: .7,
        max: 5.3,
        interval: 1,
        name: en ? 'Semantic interoperability →' : '语义互操作 →',
        nameLocation: 'middle',
        nameGap: 48,
        axisLabel: { formatter: (value: number) => ({ 1: en ? 'facility-specific' : '装置专用', 3: en ? 'mapped' : '可映射', 5: en ? 'shared contract' : '共享契约' }[value] ?? '') },
      },
      aria: { enabled: true, decal: { show: true } },
      series: categories.map((category) => ({
        name: en ? dataCategoryMeta[category].en : dataCategoryMeta[category].zh,
        type: 'scatter',
        symbolSize: (value: number[]) => 10 + Math.min(16, value[2] * 3),
        itemStyle: { color: dataCategoryMeta[category].color, opacity: .9, borderColor: palette.mode === 'light' ? palette.muted : palette.background, borderWidth: 1.8 },
        label: {
          show: true,
          formatter: '{b}',
          distance: 5,
          color: palette.text,
          fontFamily: FONT,
          fontSize: 9,
          fontWeight: 700,
          width: 112,
          overflow: 'truncate',
          padding: [3, 5],
          borderWidth: .6,
          borderColor: palette.tooltipBorder,
          borderRadius: 3,
          backgroundColor: palette.tooltipBackground,
        },
        labelLayout: { hideOverlap: false, moveOverlap: 'shiftY' },
        emphasis: {
          focus: 'series',
          scale: 1.3,
          label: { show: true, fontSize: 10, fontWeight: 800, width: 190, overflow: 'break' },
        },
        data: dataFoundationRecords.filter((record) => record.category === category).map((record) => {
          const pointLayout = LANDSCAPE_POINT_LAYOUT.get(record.id) ?? { symbolOffset: [0, 0] as [number, number], labelPosition: 'top' as const };
          return {
            name: record.name,
            value: [record.lifecycleReach, record.interoperability, record.sources.length],
            symbolOffset: pointLayout.symbolOffset,
            label: { position: pointLayout.labelPosition },
            organization: en ? record.organizationEn : record.organization,
            scope: en ? record.scopeEn : record.scope,
            access: en ? ({ open: 'Open', 'open-conditional': 'Open with scientific-use conditions', licensed: 'Licensed / purchased', registered: 'Registered', controlled: 'Controlled', consortium: 'Consortium', 'facility-internal': 'Facility-internal' } as const)[record.access] : ({ open: '公开', 'open-conditional': '公开但有科学使用条款', licensed: '许可/购买访问', registered: '注册访问', controlled: '受控访问', consortium: '成员/联盟访问', 'facility-internal': '装置内部' } as const)[record.access],
          };
        }),
      })),
      media: [{
        query: { maxWidth: 700 },
        option: {
          legend: { top: 8, textStyle: { fontSize: 8 } },
          grid: { left: 52, right: 18, top: 118, bottom: 66 },
          xAxis: { axisLabel: { fontSize: 7 }, nameTextStyle: { fontSize: 9 }, nameGap: 34 },
          yAxis: { axisLabel: { fontSize: 7 }, nameTextStyle: { fontSize: 9 }, nameGap: 39 },
          series: categories.map(() => ({
            symbolSize: (value: number[]) => 8 + Math.min(12, value[2] * 2),
            label: { fontSize: 7, width: 72, padding: [2, 3], distance: 3 },
            labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
            emphasis: { label: { show: true, fontSize: 9, width: 126, overflow: 'break' } },
          })),
        },
      }],
    };
  }, [en, palette]);

  return <ScientificChart
    id="fusion-data-platform-landscape"
    option={option}
    ariaLabel={en ? 'Editorial landscape of fusion data standards, archives, platforms, workflow libraries and reference databases by lifecycle reach and semantic interoperability' : '按生命周期覆盖与语义互操作展示聚变数据标准、档案、平台、工作流代码和参考数据库的编辑性版图'}
    fallbackSrc=""
    fallbackAlt=""
    fallback={<table className="dataChartTable"><caption>{en ? 'Fusion-data evidence landscape' : '聚变数据证据版图'}</caption><thead><tr><th>{en ? 'Record' : '条目'}</th><th>{en ? 'Class' : '类别'}</th><th>{en ? 'Lifecycle' : '生命周期'}</th><th>{en ? 'Interoperability' : '互操作'}</th></tr></thead><tbody>{dataFoundationRecords.map((record) => <tr key={record.id}><th>{record.name}</th><td>{en ? dataCategoryMeta[record.category].en : dataCategoryMeta[record.category].zh}</td><td>{record.lifecycleReach}/5</td><td>{record.interoperability}/5</td></tr>)}</tbody></table>}
    className="dataLandscapeChart"
    height={760}
    keepFallbackAccessible
  />;
}
