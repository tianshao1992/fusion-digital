'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import ScientificChart from '@/app/components/charts/ScientificChart';
import { useChartTheme, type ChartThemePalette } from '@/app/components/charts/chart-theme';
import KnowledgeChat from '@/app/components/knowledge-chat/KnowledgeChat';
import type { GraphQueryResponse, KnowledgeGraphNode } from './types';

type ExplorerProps = {
  initial: GraphQueryResponse;
  devices: { id: string; label: string; degree: number }[];
};

const domainMeta = {
  physics: { label: '物理模拟', color: '#ff8738' },
  engineering: { label: '工程仿真', color: '#ffc857' },
  control: { label: '集成控制', color: '#65e6d2' },
  diagnostics: { label: '诊断感知', color: '#4eb8ff' },
  ai: { label: '智能原生', color: '#bf8cff' },
  facility: { label: '装置', color: '#f2f4ef' },
} as const;

const typeMeta = {
  research: { label: '研究工作', symbol: 'roundRect' },
  paper: { label: '论文', symbol: 'rect' },
  code: { label: '代码', symbol: 'diamond' },
  device: { label: '装置', symbol: 'circle' },
  tool: { label: '工具', symbol: 'triangle' },
  task: { label: '任务', symbol: 'pin' },
  organization: { label: '机构', symbol: 'hexagon' },
} as const;

function escapeTooltip(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function graphOption(data: GraphQueryResponse, selectedId: string, chartTheme: ChartThemePalette): EChartsCoreOption {
  const domainColor = (domain: keyof typeof domainMeta) => {
    if (chartTheme.mode === 'dark') return domainMeta[domain].color;
    const lightColors: Record<keyof typeof domainMeta, string> = {
      physics: '#b85b37', engineering: '#9b7633', control: '#49766a', diagnostics: '#426f98', ai: '#75617e', facility: '#52685b',
    };
    return lightColors[domain];
  };
  const categories = Object.entries(domainMeta).map(([name]) => ({ name, itemStyle: { color: domainColor(name as keyof typeof domainMeta) } }));
  const relationCounts = new Map<string, number>();
  for (const edge of data.edges) relationCounts.set(edge.relation, (relationCounts.get(edge.relation) ?? 0) + 1);
  return {
    backgroundColor: 'transparent',
    animationDurationUpdate: 420,
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: chartTheme.tooltipBackground,
      borderColor: chartTheme.tooltipBorder,
      textStyle: { color: chartTheme.tooltipText, fontFamily: 'Microsoft YaHei UI, Microsoft YaHei, sans-serif', fontSize: 11 },
      formatter(params: unknown) {
        const p = params as { dataType?: string; data?: Record<string, unknown> };
        if (p.dataType === 'edge') return `<b>${escapeTooltip(p.data?.relation)}</b><br/>${escapeTooltip(p.data?.evidenceLabel ?? '点击端点查看证据')}`;
        const node = p.data as unknown as KnowledgeGraphNode;
        return `<b>${escapeTooltip(node.label)}</b><br/>${escapeTooltip(typeMeta[node.type]?.label ?? node.type)} · ${escapeTooltip(domainMeta[node.domain]?.label ?? node.domain)}<br/>关联 ${node.degree} 条`;
      },
    },
    legend: [{ data: categories.map((item) => item.name), left: 18, top: 12, textStyle: { color: chartTheme.muted, fontSize: 10 }, itemWidth: 11, itemHeight: 8 }],
    series: [{
      type: 'graph',
      layout: data.nodes.length > 20 ? 'force' : 'circular',
      roam: true,
      draggable: true,
      data: data.nodes.map((node) => ({
        ...node,
        name: node.label,
        category: Object.keys(domainMeta).indexOf(node.domain),
        symbol: typeMeta[node.type]?.symbol ?? 'circle',
        symbolSize: Math.min(42, 10 + Math.sqrt(node.degree + 1) * 3.25) + (node.id === selectedId ? 7 : 0),
        itemStyle: { color: domainColor(node.domain), borderColor: node.id === selectedId ? chartTheme.text : chartTheme.background, borderWidth: node.id === selectedId ? 3 : 1, shadowBlur: node.id === selectedId ? 18 : 5, shadowColor: domainColor(node.domain) },
        label: { show: node.id === selectedId || node.degree >= Math.max(8, Math.ceil(data.nodes.length / 18)), color: chartTheme.text, fontSize: 9, formatter: node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label },
      })),
      links: data.edges.map((edge) => ({
        ...edge,
        value: edge.relation,
        lineStyle: { color: domainColor(edge.domain), opacity: chartTheme.mode === 'dark' ? .22 : .34, width: Math.min(2.2, 0.7 + Math.log2((relationCounts.get(edge.relation) ?? 1) + 1) * .18), curveness: .07 },
        emphasis: { lineStyle: { opacity: .9, width: 2.2 } },
      })),
      categories,
      force: { repulsion: Math.min(560, 155 + data.nodes.length * 1.45), gravity: .045, edgeLength: [58, 135], layoutAnimation: data.nodes.length < 500 },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 4],
      emphasis: { focus: 'adjacency', scale: 1.35, lineStyle: { opacity: .86 } },
      blur: { itemStyle: { opacity: .18 }, lineStyle: { opacity: .04 } },
      labelLayout: { hideOverlap: true },
    }],
    aria: { enabled: true, label: { description: `FusionDigital 知识图谱，当前显示 ${data.nodes.length} 个实体和 ${data.edges.length} 条关系。` } },
  };
}

function nodeDescription(node: KnowledgeGraphNode) {
  return node.description || `${typeMeta[node.type].label}实体，共有 ${node.degree} 条已记录关系。`;
}

export default function KnowledgeGraphExplorer({ initial, devices }: ExplorerProps) {
  const chartTheme = useChartTheme();
  const [data, setData] = useState(initial);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('all');
  const [type, setType] = useState('all');
  const [device, setDevice] = useState('');
  const [selectedId, setSelectedId] = useState(initial.nodes.find((node) => node.type === 'device')?.id ?? initial.nodes[0]?.id ?? '');
  const [depth, setDepth] = useState<1 | 2>(1);
  const [limit, setLimit] = useState(350);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  const selected = data.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedRelations = useMemo(() => data.edges.filter((edge) => edge.source === selectedId || edge.target === selectedId).slice(0, 60), [data.edges, selectedId]);
  const nodeIndex = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);
  const option = useMemo(() => graphOption(data, selectedId, chartTheme), [chartTheme, data, selectedId]);

  async function load(params: { focus?: string; requestedDepth?: 0 | 1 | 2; requestedLimit?: number } = {}) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPending(true);
    setError('');
    const url = new URL('/api/knowledge-graph', window.location.origin);
    if (params.focus) url.searchParams.set('focus', params.focus);
    else {
      if (query.trim()) url.searchParams.set('q', query.trim());
      if (domain !== 'all') url.searchParams.set('domain', domain);
      if (type !== 'all') url.searchParams.set('type', type);
      if (device) url.searchParams.set('device', device);
    }
    url.searchParams.set('depth', String(params.requestedDepth ?? (params.focus ? depth : 0)));
    url.searchParams.set('limit', String(params.requestedLimit ?? limit));
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = await response.json() as GraphQueryResponse;
      setData(next);
      const nextSelected = params.focus && next.nodes.some((node) => node.id === params.focus) ? params.focus : next.nodes[0]?.id ?? '';
      setSelectedId(nextSelected);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError('图谱查询暂时不可用，请稍后重试。');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  useEffect(() => () => requestRef.current?.abort(), []);

  function handleChartClick(params: unknown) {
    const event = params as { dataType?: string; data?: { id?: string } };
    if (event.dataType === 'node' && event.data?.id) setSelectedId(event.data.id);
  }

  return <><section className="kgWorkspace" aria-label="FusionDigital 交互式知识图谱工作区">
    <aside className="kgFilters">
      <p className="kgPanelIndex">01 / QUERY</p>
      <h2>从问题进入证据网络</h2>
      <form onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label><span>实体或主题</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：EXL-50U、DINA、破裂预测" /></label>
        <label><span>知识域</span><select value={domain} onChange={(event) => setDomain(event.target.value)}><option value="all">全部知识域</option>{Object.entries(domainMeta).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></label>
        <label><span>实体类型</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部实体</option>{Object.entries(typeMeta).map(([value, meta]) => <option value={value} key={value}>{meta.label}</option>)}</select></label>
        <label><span>关联装置</span><select value={device} onChange={(event) => setDevice(event.target.value)}><option value="">全部装置</option>{devices.slice(0, 90).map((item) => <option value={item.label} key={item.id}>{item.label} · {item.degree}</option>)}</select></label>
        <button type="submit" disabled={pending}>{pending ? '检索中…' : '检索图谱'}</button>
      </form>
      <div className="kgFilterFoot">
        <button type="button" onClick={() => { setQuery(''); setDomain('all'); setType('all'); setDevice(''); setLimit(350); setData(initial); setSelectedId(initial.nodes[0]?.id ?? ''); }}>重置</button>
        <a href="/data/fusion-knowledge-graph.json">下载完整快照</a>
      </div>
      <div className="kgTypeLegend" aria-label="节点形状图例">{Object.entries(typeMeta).map(([key, meta]) => <span key={key}><i data-type={key} />{meta.label}</span>)}</div>
    </aside>

    <div className="kgCanvasPanel">
      <header className="kgCanvasHeader">
        <div><p className="kgPanelIndex">02 / EXPLORE</p><h2>{data.query.focus ? `${depth} 跳邻域` : '全域检索子图'}</h2></div>
        <div className="kgLiveStats" aria-live="polite"><span><b>{data.nodes.length}</b>实体</span><span><b>{data.edges.length}</b>关系</span>{data.truncated && <span className="kgWarning">已按关联度截断</span>}</div>
      </header>
      {error && <p className="kgError" role="alert">{error}</p>}
      <ScientificChart id="fusion-knowledge-graph" option={option} ariaLabel="论文、代码、装置、工具、任务和机构构成的 FusionDigital 交互知识图谱" fallbackSrc="" fallbackAlt="" height={670} eager dark onChartClick={handleChartClick} fallback={<div className="kgChartFallback"><b>ENTITY → CLAIM → EVIDENCE</b><span>正在加载论文、代码、装置与任务的关系子图；下方文本列表提供完整的键盘浏览入口。</span></div>} />
      <div className="kgCanvasTools">
        <span>滚轮缩放 · 拖动平移 · 点击节点查看关系</span>
        <label>节点上限 <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}><option value="200">200</option><option value="350">350</option><option value="500">500</option><option value="800">800</option></select></label>
        {data.truncated && limit < 800 && <button type="button" onClick={() => { const next = Math.min(800, limit + 150); setLimit(next); void load({ requestedLimit: next, focus: data.query.focus || undefined }); }}>加载更多</button>}
      </div>
      <details className="kgAccessibleList">
        <summary>使用文本列表浏览当前 {data.nodes.length} 个实体</summary>
        <div>{data.nodes.map((node) => <button type="button" key={node.id} onClick={() => setSelectedId(node.id)} aria-pressed={node.id === selectedId}><b>{typeMeta[node.type].label}</b><span>{node.label}</span><small>{domainMeta[node.domain].label} · {node.degree} 条关系</small></button>)}</div>
      </details>
    </div>

    <aside className="kgDetail" aria-live="polite">
      <p className="kgPanelIndex">03 / EVIDENCE</p>
      {selected ? <>
        <div className="kgDetailType" style={{ '--node-accent': domainMeta[selected.domain].color } as React.CSSProperties}><span>{typeMeta[selected.type].label}</span><b>{domainMeta[selected.domain].label}</b></div>
        <h2>{selected.label}</h2>
        {selected.subtitle && <p className="kgSubtitle">{selected.subtitle}</p>}
        <p className="kgDescription">{nodeDescription(selected)}</p>
        <div className="kgBadges">{selected.evidenceLevel && <span>{selected.evidenceLevel} 证据</span>}{selected.deploymentLevel && <span>{selected.deploymentLevel} 部署</span>}<span>{selected.degree} 条关系</span></div>
        <div className="kgNeighborhood">
          <label>展开深度 <select value={depth} onChange={(event) => setDepth(Number(event.target.value) as 1 | 2)}><option value="1">1 跳 · 直接关系</option><option value="2">2 跳 · 关系链</option></select></label>
          <button type="button" disabled={pending} onClick={() => void load({ focus: selected.id })}>以此为中心展开</button>
        </div>
        {selected.url && <a className="kgPrimarySource" href={selected.url} target="_blank" rel="noreferrer">打开实体来源 ↗</a>}
        <section className="kgRelationList"><h3>当前子图中的关系</h3>{selectedRelations.length ? <ul>{selectedRelations.map((edge) => {
          const neighborId = edge.source === selected.id ? edge.target : edge.source;
          const neighbor = nodeIndex.get(neighborId);
          return neighbor ? <li key={edge.id}><button type="button" onClick={() => setSelectedId(neighborId)}><b>{edge.relation}</b><span>{neighbor.label}</span></button>{edge.evidenceUrl && <a href={edge.evidenceUrl} target="_blank" rel="noreferrer" aria-label={`查看 ${edge.evidenceLabel ?? neighbor.label} 的来源`}>证据 ↗</a>}</li> : null;
        })}</ul> : <p>当前子图未包含其相邻节点，可点击“以此为中心展开”。</p>}</section>
        {selected.tags && selected.tags.length > 0 && <div className="kgTags">{selected.tags.slice(0, 9).map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      </> : <p className="kgDescription">选择一个节点查看实体详情、关系和原始证据。</p>}
    </aside>
  </section><KnowledgeChat
    context={{
      path: '/knowledge-graph',
      title: 'FusionDigital 知识图谱',
      domain: selected?.domain,
      focusId: selected?.id,
      focusLabel: selected?.label,
      focusDescription: selected ? nodeDescription(selected) : undefined,
    }}
    title="围绕图谱持续提问"
    titleEn="Continue from the knowledge graph"
  /></>;
}
