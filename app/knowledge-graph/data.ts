import snapshot from '@/public/data/fusion-knowledge-graph.json';
import {
  graphNodeTypes,
  type GraphDomain,
  type GraphNodeType,
  type GraphQueryResponse,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
  type KnowledgeGraphSnapshot,
} from './types';

export const knowledgeGraph = snapshot as KnowledgeGraphSnapshot;

const nodeById = new Map(knowledgeGraph.nodes.map((node) => [node.id, node]));
const adjacency = new Map<string, KnowledgeGraphEdge[]>();
for (const edge of knowledgeGraph.edges) {
  adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge]);
  adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge]);
}

const normalize = (value: string) => value.trim().toLocaleLowerCase('zh-CN');
const clampLimit = (value: number) => Math.max(25, Math.min(Number.isFinite(value) ? value : 350, 800));
const MAX_EDGES = 2400;

export type GraphQuery = {
  q?: string;
  domain?: string;
  type?: string;
  device?: string;
  focus?: string;
  depth?: number;
  limit?: number;
  locale?: string;
};

export const graphRelationLabels: Record<string, { zh: string; en: string }> = {
  APPLIES_TO: { zh: '应用于', en: 'Applies to' },
  CONTRIBUTED_TO: { zh: '贡献于', en: 'Contributed to' },
  DOCUMENTED_BY: { zh: '由文献记录', en: 'Documented by' },
  HAS_CODE: { zh: '具有代码实现', en: 'Has code implementation' },
  OPERATES: { zh: '运行 / 运营', en: 'Operates' },
  PRIMARY_TASK: { zh: '主要任务', en: 'Primary task' },
  RELATED_TASK: { zh: '关联任务', en: 'Related task' },
  SUPPORTED_BY: { zh: '由其支撑', en: 'Supported by' },
  USED_FOR: { zh: '用于', en: 'Used for' },
  USES_CODE: { zh: '使用代码', en: 'Uses code' },
  VALIDATED_ON: { zh: '在装置上验证', en: 'Validated on' },
};

const englishTypeLabels: Record<GraphNodeType, string> = {
  research: 'Research activity', paper: 'Publication', code: 'Code asset', device: 'Fusion device',
  tool: 'Modelling tool', task: 'Technical task', organization: 'Organization',
};
const englishDomainLabels: Record<GraphDomain, string> = {
  physics: 'Physics modelling', engineering: 'Engineering simulation', control: 'Integrated control',
  diagnostics: 'Diagnostics and sensing', ai: 'AI-native methods', facility: 'Fusion facilities',
};
const HAN = /\p{Script=Han}/u;
const machineSubtitle = /^(?:official-|not-public|public|peer-reviewed|open|closed|unknown)/i;

function englishTokens(value: string) {
  return value.match(/[A-Za-z][A-Za-z0-9+./_\-]*(?:\s+[A-Za-z][A-Za-z0-9+./_\-]*)*/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
}

function recordReference(node: KnowledgeGraphNode) {
  let hash = 0x811c9dc5;
  for (const character of node.id) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return `${englishTypeLabels[node.type]} record · ${(hash >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
}

export function localizeKnowledgeGraphNode(node: KnowledgeGraphNode, locale: 'zh-CN' | 'en'): KnowledgeGraphNode {
  if (locale !== 'en') return node;
  let localizationStatus: KnowledgeGraphNode['localizationStatus'] = 'source';
  let label = node.labelEn?.trim();
  if (label && HAN.test(label)) label = undefined;
  if (!label && !HAN.test(node.label)) label = node.label;
  if (!label && node.subtitleEn?.trim() && !HAN.test(node.subtitleEn)) label = node.subtitleEn.trim();
  if (!label && node.subtitle && !HAN.test(node.subtitle) && !machineSubtitle.test(node.subtitle)) label = node.subtitle;
  if (!label) {
    const tokens = englishTokens(node.label).filter((token) => token.length > 1);
    label = tokens.length ? `${tokens.slice(0, 3).join(' / ')} — ${englishTypeLabels[node.type]}` : recordReference(node);
    localizationStatus = tokens.length ? 'derived' : 'placeholder';
  }

  let subtitle = node.subtitleEn?.trim();
  if (subtitle && HAN.test(subtitle)) subtitle = undefined;
  if (!subtitle && node.subtitle && !HAN.test(node.subtitle)) subtitle = node.subtitle;
  if (!subtitle) subtitle = `${englishDomainLabels[node.domain]} · ${englishTypeLabels[node.type]}`;

  let description = node.descriptionEn?.trim();
  if (description && HAN.test(description)) description = undefined;
  if (!description && node.description && !HAN.test(node.description)) description = node.description;
  if (!description) {
    description = `${englishTypeLabels[node.type]} in ${englishDomainLabels[node.domain]}. The curated source record is currently available in Chinese; this English placeholder preserves identity and provenance without inferring additional scientific claims.`;
    localizationStatus = localizationStatus === 'source' ? 'placeholder' : localizationStatus;
  }

  const tags = (node.tagsEn ?? node.tags ?? []).filter((tag) => !HAN.test(tag));
  return { ...node, label, subtitle, description, tags, localizationStatus };
}

export function localizeKnowledgeGraphEdge(edge: KnowledgeGraphEdge, locale: 'zh-CN' | 'en'): KnowledgeGraphEdge {
  const rawRelationLabel = graphRelationLabels[edge.relation]?.[locale === 'en' ? 'en' : 'zh'] ?? edge.relation.replaceAll('_', ' ').toLocaleLowerCase(locale);
  const relationLabel = locale === 'en' && HAN.test(rawRelationLabel) ? 'Unclassified relation' : rawRelationLabel;
  if (locale !== 'en') return { ...edge, relationLabel };
  const sourceEvidence = edge.evidenceLabelEn?.trim() && !HAN.test(edge.evidenceLabelEn)
    ? edge.evidenceLabelEn.trim()
    : edge.evidenceLabel && !HAN.test(edge.evidenceLabel) ? edge.evidenceLabel : undefined;
  return {
    ...edge,
    relationLabel,
    evidenceLabel: sourceEvidence ?? 'Open the connected entity to inspect its curated source and provenance.',
  };
}

function validDomain(value?: string): GraphDomain | 'all' {
  return ['physics', 'engineering', 'control', 'diagnostics', 'ai', 'facility'].includes(value ?? '')
    ? value as GraphDomain
    : 'all';
}

function validType(value?: string): GraphNodeType | 'all' {
  return graphNodeTypes.includes(value as GraphNodeType) ? value as GraphNodeType : 'all';
}

function nodeText(node: KnowledgeGraphNode) {
  const english = localizeKnowledgeGraphNode(node, 'en');
  return [node.label, node.subtitle, node.description, node.tags?.join(' '), english.label, english.subtitle, english.description, english.tags?.join(' ')]
    .filter(Boolean).join(' ').toLocaleLowerCase('en');
}

export function queryKnowledgeGraph(raw: GraphQuery): GraphQueryResponse {
  const locale = raw.locale === 'en' ? 'en' : 'zh-CN';
  const q = normalize(raw.q ?? '');
  const device = normalize(raw.device ?? '');
  const domain = validDomain(raw.domain);
  const type = validType(raw.type);
  const focus = nodeById.has(raw.focus ?? '') ? raw.focus! : '';
  const depth = Math.max(0, Math.min(Number.isFinite(raw.depth) ? Math.trunc(raw.depth!) : (focus ? 1 : 0), 2)) as 0 | 1 | 2;
  const limit = clampLimit(Number(raw.limit ?? 350));

  const deviceIds = device
    ? new Set(knowledgeGraph.nodes.filter((node) => node.type === 'device' && nodeText(node).includes(device)).map((node) => node.id))
    : new Set<string>();
  const connectedToDevice = new Set<string>(deviceIds);
  for (const id of deviceIds) {
    for (const edge of adjacency.get(id) ?? []) connectedToDevice.add(edge.source === id ? edge.target : edge.source);
  }

  const baseMatches = knowledgeGraph.nodes.filter((node) => {
    if (domain !== 'all' && node.domain !== domain && !node.sourceDomains?.includes(domain)) return false;
    if (type !== 'all' && node.type !== type) return false;
    if (device && !connectedToDevice.has(node.id)) return false;
    return !q || nodeText(node).includes(q);
  });

  const selected = new Set<string>();
  if (focus) {
    selected.add(focus);
    let frontier = new Set([focus]);
    for (let hop = 0; hop < depth; hop += 1) {
      const next = new Set<string>();
      for (const id of frontier) {
        for (const edge of adjacency.get(id) ?? []) {
          const neighbor = edge.source === id ? edge.target : edge.source;
          if (!selected.has(neighbor)) next.add(neighbor);
          selected.add(neighbor);
        }
      }
      frontier = next;
    }
  } else {
    for (const node of baseMatches) selected.add(node.id);
  }

  const ranked = [...selected]
    .map((id) => nodeById.get(id))
    .filter((node): node is KnowledgeGraphNode => Boolean(node))
    .sort((a, b) => {
      if (a.id === focus) return -1;
      if (b.id === focus) return 1;
      const aLabel = locale === 'en' ? localizeKnowledgeGraphNode(a, locale).label : a.label;
      const bLabel = locale === 'en' ? localizeKnowledgeGraphNode(b, locale).label : b.label;
      return b.degree - a.degree || aLabel.localeCompare(bLabel, locale);
    });
  const limited = ranked.slice(0, limit);
  const limitedIds = new Set(limited.map((node) => node.id));
  const matchingEdges = knowledgeGraph.edges.filter((edge) => limitedIds.has(edge.source) && limitedIds.has(edge.target));
  const edges = matchingEdges.slice(0, MAX_EDGES);

  return {
    schemaVersion: knowledgeGraph.schemaVersion,
    generatedAt: knowledgeGraph.generatedAt,
    query: { q: raw.q?.trim() ?? '', domain, type, device: raw.device?.trim() ?? '', focus, depth, limit, locale },
    truncated: ranked.length > limited.length || matchingEdges.length > edges.length,
    truncatedNodes: ranked.length > limited.length,
    truncatedEdges: matchingEdges.length > edges.length,
    totalMatches: focus ? ranked.length : baseMatches.length,
    nodes: limited.map((node) => localizeKnowledgeGraphNode(node, locale)),
    edges: edges.map((edge) => localizeKnowledgeGraphEdge(edge, locale)),
  };
}

export function graphDevices(locale: 'zh-CN' | 'en' = 'zh-CN') {
  return knowledgeGraph.nodes
    .filter((node) => node.type === 'device')
    .map((node) => localizeKnowledgeGraphNode(node, locale))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label, locale));
}
