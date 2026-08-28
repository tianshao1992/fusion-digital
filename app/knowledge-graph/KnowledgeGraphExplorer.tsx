'use client';

import type { EChartsCoreOption } from 'echarts/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { trackAnalyticsContent } from '@/app/analytics/client';
import ScientificChart from '@/app/components/charts/ScientificChart';
import { useChartTheme, type ChartThemePalette } from '@/app/components/charts/chart-theme';
import { useAgentWorkspace } from '@/app/components/agent-workspace/AgentWorkspace';
import { useI18n, type AppLocale } from '@/app/i18n';
import { collectKnowledgeEvidenceSources, normalizeKnowledgeSourceUrl, type KnowledgeEvidenceSourceKind } from './evidenceSources';
import { formatKnowledgeGraphTooltip } from './knowledgeGraphTooltip';
import type { GraphQueryResponse, KnowledgeGraphNode } from './types';

type ExplorerProps = {
  initial: GraphQueryResponse;
  devices: { id: string; label: string; degree: number }[];
};

const domainMeta = {
  physics: { zh: '物理模拟', en: 'Physics modelling' },
  engineering: { zh: '工程仿真', en: 'Engineering simulation' },
  control: { zh: '集成控制', en: 'Integrated control' },
  diagnostics: { zh: '诊断感知', en: 'Diagnostics and sensing' },
  ai: { zh: '智能原生', en: 'AI-native methods' },
  facility: { zh: '装置', en: 'Fusion facilities' },
} as const;

type DomainKey = keyof typeof domainMeta;
type DomainAppearance = { fill: string; border: string; line: string };

const graphDomainPalettes: Record<ChartThemePalette['mode'], Record<DomainKey, DomainAppearance>> = {
  dark: {
    physics: { fill: '#f28c52', border: '#ffd1b0', line: '#d97236' },
    engineering: { fill: '#e4b84d', border: '#ffe6a0', line: '#b78a28' },
    control: { fill: '#55cdb2', border: '#aaf3df', line: '#3aa58e' },
    diagnostics: { fill: '#58aee5', border: '#b5ddf7', line: '#3a80b0' },
    ai: { fill: '#a77bd6', border: '#dec5f6', line: '#7652a0' },
    facility: { fill: '#b8c8bf', border: '#f2f7f4', line: '#7d9789' },
  },
  light: {
    physics: { fill: '#e98c5c', border: '#8f3f22', line: '#b44d28' },
    engineering: { fill: '#dbb553', border: '#7a5a15', line: '#96701f' },
    control: { fill: '#69bfa9', border: '#236858', line: '#347d6b' },
    diagnostics: { fill: '#67a9d5', border: '#245f86', line: '#3678a3' },
    ai: { fill: '#a487c2', border: '#563f74', line: '#735694' },
    facility: { fill: '#9aafa2', border: '#3f594b', line: '#5b7566' },
  },
};

function graphDomainAppearance(domain: DomainKey, mode: ChartThemePalette['mode']) {
  return graphDomainPalettes[mode][domain];
}

const typeMeta = {
  research: { zh: '研究工作', en: 'Research activity', symbol: 'roundRect' },
  paper: { zh: '论文', en: 'Publication', symbol: 'rect' },
  code: { zh: '代码', en: 'Code asset', symbol: 'diamond' },
  device: { zh: '装置', en: 'Fusion device', symbol: 'circle' },
  tool: { zh: '工具', en: 'Modelling tool', symbol: 'triangle' },
  task: { zh: '任务', en: 'Technical task', symbol: 'pin' },
  organization: { zh: '机构', en: 'Organization', symbol: 'hexagon' },
} as const;

const copy = {
  zh: {
    workspace: 'FusionDigital 交互式知识图谱工作区', heading: '从问题进入证据网络', entityTopic: '实体或主题',
    queryExample: '例如：EXL-50U、DINA、破裂预测', domain: '知识域', allDomains: '全部知识域', type: '实体类型',
    allTypes: '全部实体', device: '关联装置', allDevices: '全部装置', searching: '检索中…', search: '检索图谱', reset: '重置',
    snapshot: '下载完整快照', shapeLegend: '节点形状图例', neighborhood: (depth: number) => `${depth} 跳邻域`, subgraph: '全域检索子图',
    entities: '实体', relations: '关系', truncated: '已按关联度截断', loadError: '图谱查询暂时不可用，请稍后重试。',
    chartAria: '论文、代码、装置、工具、任务和机构构成的 FusionDigital 交互知识图谱',
    loading: '正在加载论文、代码、装置与任务的关系子图；下方文本列表提供完整的键盘浏览入口。',
    controls: '滚轮缩放 · 拖动平移 · 点击节点查看关系', nodeLimit: '节点上限', more: '加载更多',
    browse: (count: number) => `使用文本列表浏览当前 ${count} 个实体`, recorded: (count: number) => `${count} 条关系`,
    evidence: '证据', deployment: '部署', depth: '展开深度', oneHop: '1 跳 · 直接关系', twoHops: '2 跳 · 关系链',
    expand: '以此为中心展开', source: '打开实体来源 ↗', currentRelations: '当前子图中的关系', evidenceLink: '证据 ↗',
    sourceAria: (label: string) => `查看 ${label} 的来源`, emptyRelations: '当前子图未包含其相邻节点，可点击“以此为中心展开”。',
    sourcesTitle: '相关文章与代码来源', sourcesIntro: '链接直接来自图谱的结构化一手来源字段，不为未公开代码补造仓库。',
    sourceKinds: { paper: '原始论文', code: '代码库 / 代码资产', official: '官方 / 一手来源' },
    sourceLinkAria: (kind: string, label: string) => `在新标签页打开${kind}：${label}`,
    noSources: '当前子图没有可直接访问的一手来源；可展开邻域或下载完整快照继续核对。',
    noScript: '未启用 JavaScript 时仍可打开当前实体的一手来源；切换节点请下载完整快照。',
    select: '选择一个节点查看实体详情、关系和原始证据。', chatContext: 'FusionDigital 知识图谱', openAgent: '在智能体中继续',
  },
  en: {
    workspace: 'FusionDigital interactive knowledge-graph workspace', heading: 'Enter the evidence network through a question', entityTopic: 'Entity or topic',
    queryExample: 'For example: EXL-50U, DINA, disruption prediction', domain: 'Knowledge domain', allDomains: 'All domains', type: 'Entity type',
    allTypes: 'All entities', device: 'Associated device', allDevices: 'All devices', searching: 'Searching…', search: 'Search graph', reset: 'Reset',
    snapshot: 'Download full snapshot', shapeLegend: 'Node-shape legend', neighborhood: (depth: number) => `${depth}-hop neighbourhood`, subgraph: 'Cross-domain result subgraph',
    entities: 'entities', relations: 'relations', truncated: 'Truncated by graph relevance', loadError: 'The knowledge-graph query is temporarily unavailable. Please try again.',
    chartAria: 'Interactive FusionDigital knowledge graph of publications, code, devices, tools, tasks and organizations',
    loading: 'Loading the relation subgraph for publications, code, devices and tasks. The text list below provides complete keyboard access.',
    controls: 'Wheel to zoom · drag to pan · select a node to inspect relations', nodeLimit: 'Node limit', more: 'Load more',
    browse: (count: number) => `Browse the ${count} entities in this view as a text list`, recorded: (count: number) => `${count} relations`,
    evidence: 'evidence', deployment: 'deployment', depth: 'Expansion depth', oneHop: '1 hop · direct relations', twoHops: '2 hops · relation chains',
    expand: 'Expand around this entity', source: 'Open primary entity source ↗', currentRelations: 'Relations in the current subgraph', evidenceLink: 'Evidence ↗',
    sourceAria: (label: string) => `Open the source for ${label}`, emptyRelations: 'Adjacent nodes are not present in this subgraph. Expand around this entity to retrieve them.',
    sourcesTitle: 'Related papers and code sources', sourcesIntro: 'Links come directly from structured primary-source fields; no repository is inferred for unpublished code.',
    sourceKinds: { paper: 'Primary paper', code: 'Repository / code asset', official: 'Official / primary source' },
    sourceLinkAria: (kind: string, label: string) => `Open ${kind} for ${label} in a new tab`,
    noSources: 'No directly accessible primary source is recorded in this subgraph. Expand the neighbourhood or inspect the full snapshot.',
    noScript: 'With JavaScript disabled, the current entity sources remain available. Download the full snapshot to inspect other nodes.',
    select: 'Select a node to inspect entity details, relations and primary evidence.', chatContext: 'FusionDigital Knowledge Graph', openAgent: 'Continue in Agent',
  },
} as const;

function localeKey(locale: AppLocale) { return locale === 'en' ? 'en' : 'zh'; }
const HAN = /\p{Script=Han}/u;

function clientRecordCode(id: string) {
  let hash = 0x811c9dc5;
  for (const character of id) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(7, '0');
}

function nodeLabel(node: KnowledgeGraphNode, locale: AppLocale) {
  if (locale !== 'en' || !HAN.test(node.label)) return node.label;
  if (node.subtitle && !HAN.test(node.subtitle) && !/^(?:official-|not-public|public|unknown)/i.test(node.subtitle)) return node.subtitle;
  return `${typeMeta[node.type].en} record · ${clientRecordCode(node.id)}`;
}

function nodeSubtitle(node: KnowledgeGraphNode, locale: AppLocale) {
  if (!node.subtitle) return '';
  return locale === 'en' && HAN.test(node.subtitle) ? `${domainMeta[node.domain].en} · ${typeMeta[node.type].en}` : node.subtitle;
}

const relationEnglish: Record<string, string> = {
  APPLIES_TO: 'Applies to', CONTRIBUTED_TO: 'Contributed to', DOCUMENTED_BY: 'Documented by',
  HAS_CODE: 'Has code implementation', OPERATES: 'Operates', PRIMARY_TASK: 'Primary task', RELATED_TASK: 'Related task',
  SUPPORTED_BY: 'Supported by', USED_FOR: 'Used for', USES_CODE: 'Uses code', VALIDATED_ON: 'Validated on',
};

function edgeRelationLabel(relation: string, localized: string | undefined, locale: AppLocale) {
  if (localized && !(locale === 'en' && HAN.test(localized))) return localized;
  return locale === 'en' ? relationEnglish[relation] ?? 'Unclassified relation' : relation;
}

function graphOption(data: GraphQueryResponse, selectedId: string, chartTheme: ChartThemePalette, locale: AppLocale): EChartsCoreOption {
  const key = localeKey(locale);
  const categories = Object.entries(domainMeta).map(([name, meta]) => {
    const appearance = graphDomainAppearance(name as DomainKey, chartTheme.mode);
    return { name: meta[key], itemStyle: { color: appearance.fill, borderColor: appearance.border, borderWidth: 1.5 } };
  });
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
      formatter: (params: unknown) => formatKnowledgeGraphTooltip(params, locale),
    },
    legend: [{
      data: categories.map((item) => item.name),
      left: 18,
      top: 12,
      padding: 8,
      backgroundColor: chartTheme.mode === 'dark' ? 'rgba(7,16,13,.86)' : 'rgba(255,253,248,.94)',
      borderColor: chartTheme.line,
      borderWidth: 1,
      textStyle: { color: chartTheme.mode === 'dark' ? '#dce8e2' : '#3d3935', fontSize: 10, fontWeight: 700 },
      itemWidth: 11,
      itemHeight: 8,
    }],
    series: [{
      type: 'graph',
      layout: data.nodes.length > 20 ? 'force' : 'circular',
      roam: true,
      draggable: true,
      data: data.nodes.map((node) => {
        const selected = node.id === selectedId;
        const appearance = graphDomainAppearance(node.domain, chartTheme.mode);
        const label = nodeLabel(node, locale);
        return {
          ...node,
          name: label,
          entityLabel: label,
          entityDescription: nodeDescription(node, locale),
          entityType: node.type,
          entityDomain: node.domain,
          entityDegree: node.degree,
          category: Object.keys(domainMeta).indexOf(node.domain),
          symbol: typeMeta[node.type]?.symbol ?? 'circle',
          symbolSize: Math.min(42, 10 + Math.sqrt(node.degree + 1) * 3.25) + (selected ? 7 : 0),
          itemStyle: {
            color: appearance.fill,
            borderColor: selected ? chartTheme.text : appearance.border,
            borderWidth: selected ? 4 : 1.5,
            shadowBlur: selected ? 10 : 0,
            shadowColor: appearance.line,
          },
          label: {
            show: selected || node.degree >= Math.max(8, Math.ceil(data.nodes.length / 18)),
            color: chartTheme.mode === 'dark' ? '#f8fbf9' : '#17201b',
            fontSize: selected ? 10 : 9,
            fontWeight: 700,
            lineHeight: 13,
            textBorderColor: chartTheme.mode === 'dark' ? 'rgba(4,10,8,.96)' : 'rgba(255,253,248,.98)',
            textBorderWidth: 3,
            formatter: label.length > 22 ? `${label.slice(0, 21)}…` : label,
          },
        };
      }),
      links: data.edges.map((edge) => {
        const appearance = graphDomainAppearance(edge.domain, chartTheme.mode);
        const relationLabel = edgeRelationLabel(edge.relation, edge.relationLabel, locale);
        return {
          ...edge,
          relationLabel,
          evidenceLabel: locale === 'en' && edge.evidenceLabel && HAN.test(edge.evidenceLabel)
            ? 'Open the connected entity to inspect its curated source and provenance.'
            : edge.evidenceLabel,
          value: relationLabel,
          lineStyle: {
            color: appearance.line,
            opacity: chartTheme.mode === 'dark' ? .48 : .6,
            width: Math.min(2.6, .9 + Math.log2((relationCounts.get(edge.relation) ?? 1) + 1) * .2),
            curveness: .07,
          },
          emphasis: { lineStyle: { opacity: .95, width: 2.6 } },
        };
      }),
      categories,
      force: { repulsion: Math.min(560, 155 + data.nodes.length * 1.45), gravity: .045, edgeLength: [58, 135], layoutAnimation: data.nodes.length < 500 },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 5],
      emphasis: { focus: 'adjacency', scale: 1.18, label: { show: true }, lineStyle: { opacity: .95, width: 2.6 } },
      blur: { itemStyle: { opacity: chartTheme.mode === 'dark' ? .42 : .34 }, lineStyle: { opacity: .14 } },
      labelLayout: { hideOverlap: true },
    }],
    aria: { enabled: true, label: { description: locale === 'en' ? `FusionDigital knowledge graph showing ${data.nodes.length} entities and ${data.edges.length} relations.` : `FusionDigital 知识图谱，当前显示 ${data.nodes.length} 个实体和 ${data.edges.length} 条关系。` } },
  };
}

function nodeDescription(node: KnowledgeGraphNode, locale: AppLocale) {
  const key = localeKey(locale);
  const sourceDescription = node.description && !(locale === 'en' && HAN.test(node.description)) ? node.description : '';
  return sourceDescription || (locale === 'en'
    ? `${typeMeta[node.type][key]} with ${node.degree} recorded relations.`
    : `${typeMeta[node.type][key]}实体，共有 ${node.degree} 条已记录关系。`);
}

export default function KnowledgeGraphExplorer({ initial, devices }: ExplorerProps) {
  const agentWorkspace = useAgentWorkspace();
  const { locale } = useI18n();
  const key = localeKey(locale);
  const ui = copy[key];
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
  const selectedAppearance = selected ? graphDomainAppearance(selected.domain, chartTheme.mode) : null;
  const selectedRelations = useMemo(() => data.edges.filter((edge) => edge.source === selectedId || edge.target === selectedId).slice(0, 60), [data.edges, selectedId]);
  const nodeIndex = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);
  const evidenceSources = useMemo(() => selected ? collectKnowledgeEvidenceSources(selected, selectedRelations, nodeIndex) : [], [nodeIndex, selected, selectedRelations]);
  const option = useMemo(() => graphOption(data, selectedId, chartTheme, locale), [chartTheme, data, locale, selectedId]);

  useEffect(() => {
    if (selectedId) trackAnalyticsContent('knowledge-node', selectedId);
  }, [selectedId]);

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
    url.searchParams.set('locale', locale);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = await response.json() as GraphQueryResponse;
      setData(next);
      const nextSelected = params.focus && next.nodes.some((node) => node.id === params.focus) ? params.focus : next.nodes[0]?.id ?? '';
      setSelectedId(nextSelected);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(ui.loadError);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  useEffect(() => () => requestRef.current?.abort(), []);
  const previousLocale = useRef(initial.query.locale ?? 'zh-CN');
  useEffect(() => {
    if (previousLocale.current === locale) return;
    previousLocale.current = locale;
    void load({ focus: selectedId || undefined });
    // load intentionally reuses the current filter state when locale changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  function handleChartClick(params: unknown) {
    const event = params as { dataType?: string; data?: { id?: string } };
    if (event.dataType === 'node' && event.data?.id) setSelectedId(event.data.id);
  }

  return <section className="kgWorkspace" aria-label={ui.workspace}>
    <aside className="kgFilters">
      <p className="kgPanelIndex">01 / QUERY</p>
      <h2>{ui.heading}</h2>
      <form onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label><span>{ui.entityTopic}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ui.queryExample} /></label>
        <label><span>{ui.domain}</span><select value={domain} onChange={(event) => setDomain(event.target.value)}><option value="all">{ui.allDomains}</option>{Object.entries(domainMeta).map(([value, meta]) => <option value={value} key={value}>{meta[key]}</option>)}</select></label>
        <label><span>{ui.type}</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">{ui.allTypes}</option>{Object.entries(typeMeta).map(([value, meta]) => <option value={value} key={value}>{meta[key]}</option>)}</select></label>
        <label><span>{ui.device}</span><select value={device} onChange={(event) => setDevice(event.target.value)}><option value="">{ui.allDevices}</option>{devices.slice(0, 90).map((item) => <option value={item.label} key={item.id}>{locale === 'en' && HAN.test(item.label) ? `Fusion device · ${clientRecordCode(item.id)}` : item.label} · {item.degree}</option>)}</select></label>
        <button type="submit" disabled={pending}>{pending ? ui.searching : ui.search}</button>
      </form>
      <div className="kgFilterFoot">
        <button type="button" onClick={() => { setQuery(''); setDomain('all'); setType('all'); setDevice(''); setLimit(350); setData(initial); setSelectedId(initial.nodes[0]?.id ?? ''); }}>{ui.reset}</button>
        <button type="button" onClick={() => agentWorkspace.open({ context: {
          path: '/knowledge-graph',
          title: ui.chatContext,
          domain: selected?.domain,
          focusId: selected?.id,
          focusLabel: selected ? nodeLabel(selected, locale) : undefined,
          focusDescription: selected ? nodeDescription(selected, locale) : undefined,
        } })}>{ui.openAgent}</button>
        <a href="/data/fusion-knowledge-graph.json">{ui.snapshot}</a>
      </div>
      <div className="kgTypeLegend" aria-label={ui.shapeLegend}>{Object.entries(typeMeta).map(([typeKey, meta]) => <span key={typeKey}><i data-type={typeKey} />{meta[key]}</span>)}</div>
    </aside>

    <div className="kgCanvasPanel">
      <header className="kgCanvasHeader">
        <div><p className="kgPanelIndex">02 / EXPLORE</p><h2>{data.query.focus ? ui.neighborhood(depth) : ui.subgraph}</h2></div>
        <div className="kgLiveStats" aria-live="polite"><span><b>{data.nodes.length}</b>{ui.entities}</span><span><b>{data.edges.length}</b>{ui.relations}</span>{data.truncated && <span className="kgWarning">{ui.truncated}</span>}</div>
      </header>
      {error && <p className="kgError" role="alert">{error}</p>}
      <ScientificChart id="fusion-knowledge-graph" option={option} ariaLabel={ui.chartAria} fallbackSrc="" fallbackAlt="" height={670} eager onChartClick={handleChartClick} fallback={<div className="kgChartFallback"><b>ENTITY → CLAIM → EVIDENCE</b><span>{ui.loading}</span></div>} />
      <div className="kgCanvasTools">
        <span>{ui.controls}</span>
        <label>{ui.nodeLimit} <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}><option value="200">200</option><option value="350">350</option><option value="500">500</option><option value="800">800</option></select></label>
        {data.truncated && limit < 800 && <button type="button" onClick={() => { const next = Math.min(800, limit + 150); setLimit(next); void load({ requestedLimit: next, focus: data.query.focus || undefined }); }}>{ui.more}</button>}
      </div>
      <noscript><p className="kgNoScriptNotice">{ui.noScript} <a href="/data/fusion-knowledge-graph.json">{ui.snapshot}</a></p></noscript>
      <details className="kgAccessibleList">
        <summary>{ui.browse(data.nodes.length)}</summary>
        <div>{data.nodes.map((node) => <button type="button" key={node.id} onClick={() => setSelectedId(node.id)} aria-pressed={node.id === selectedId}><b>{typeMeta[node.type][key]}</b><span>{nodeLabel(node, locale)}</span><small>{domainMeta[node.domain][key]} · {ui.recorded(node.degree)}</small></button>)}</div>
      </details>
    </div>

    <aside className="kgDetail" aria-live="polite">
      <p className="kgPanelIndex">03 / EVIDENCE</p>
      {selected ? <>
        <div className="kgDetailType" style={{
          '--node-accent': selectedAppearance?.fill,
          '--node-border': selectedAppearance?.border,
          '--node-accent-ink': chartTheme.mode === 'dark' ? '#07100d' : '#17201b',
        } as React.CSSProperties}><span>{typeMeta[selected.type][key]}</span><b>{domainMeta[selected.domain][key]}</b></div>
        <h2>{nodeLabel(selected, locale)}</h2>
        {nodeSubtitle(selected, locale) && <p className="kgSubtitle">{nodeSubtitle(selected, locale)}</p>}
        <p className="kgDescription">{nodeDescription(selected, locale)}</p>
        <div className="kgBadges">{selected.evidenceLevel && <span>{selected.evidenceLevel} {ui.evidence}</span>}{selected.deploymentLevel && <span>{selected.deploymentLevel} {ui.deployment}</span>}<span>{ui.recorded(selected.degree)}</span></div>
        <div className="kgNeighborhood">
          <label>{ui.depth} <select value={depth} onChange={(event) => setDepth(Number(event.target.value) as 1 | 2)}><option value="1">{ui.oneHop}</option><option value="2">{ui.twoHops}</option></select></label>
          <button type="button" disabled={pending} onClick={() => void load({ focus: selected.id })}>{ui.expand}</button>
        </div>
        <section className="kgEvidenceSources" aria-labelledby="kg-evidence-sources-title">
          <h3 id="kg-evidence-sources-title">{ui.sourcesTitle}</h3>
          <p>{ui.sourcesIntro}</p>
          {evidenceSources.length ? <ul>{evidenceSources.map((source) => {
            const kind = ui.sourceKinds[source.kind as KnowledgeEvidenceSourceKind];
            return <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer external" aria-label={ui.sourceLinkAria(kind, source.label)}><b>{kind}</b><span>{source.label}</span><small>{source.host}<i aria-hidden="true"> ↗</i></small></a></li>;
          })}</ul> : <p className="kgNoEvidence">{ui.noSources}</p>}
        </section>
        <section className="kgRelationList"><h3>{ui.currentRelations}</h3>{selectedRelations.length ? <ul>{selectedRelations.map((edge) => {
          const neighborId = edge.source === selected.id ? edge.target : edge.source;
          const neighbor = nodeIndex.get(neighborId);
          const relationSourceUrl = normalizeKnowledgeSourceUrl(edge.evidenceUrl);
          return neighbor ? <li key={edge.id}><button type="button" onClick={() => setSelectedId(neighborId)}><b>{edgeRelationLabel(edge.relation, edge.relationLabel, locale)}</b><span>{nodeLabel(neighbor, locale)}</span></button>{relationSourceUrl && <a href={relationSourceUrl} target="_blank" rel="noopener noreferrer external" aria-label={ui.sourceAria(edge.evidenceLabel && !(locale === 'en' && HAN.test(edge.evidenceLabel)) ? edge.evidenceLabel : nodeLabel(neighbor, locale))}>{ui.evidenceLink}</a>}</li> : null;
        })}</ul> : <p>{ui.emptyRelations}</p>}</section>
        {selected.tags && selected.tags.length > 0 && <div className="kgTags">{selected.tags.filter((tag) => locale !== 'en' || !HAN.test(tag)).slice(0, 9).map((tag) => <span key={tag}>#{tag}</span>)}</div>}
      </> : <p className="kgDescription">{ui.select}</p>}
    </aside>
  </section>;
}
