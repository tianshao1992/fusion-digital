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
};

function validDomain(value?: string): GraphDomain | 'all' {
  return ['physics', 'engineering', 'control', 'diagnostics', 'ai', 'facility'].includes(value ?? '')
    ? value as GraphDomain
    : 'all';
}

function validType(value?: string): GraphNodeType | 'all' {
  return graphNodeTypes.includes(value as GraphNodeType) ? value as GraphNodeType : 'all';
}

function nodeText(node: KnowledgeGraphNode) {
  return [node.label, node.subtitle, node.description, node.tags?.join(' ')].filter(Boolean).join(' ').toLocaleLowerCase('zh-CN');
}

export function queryKnowledgeGraph(raw: GraphQuery): GraphQueryResponse {
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
      return b.degree - a.degree || a.label.localeCompare(b.label, 'zh-CN');
    });
  const limited = ranked.slice(0, limit);
  const limitedIds = new Set(limited.map((node) => node.id));
  const matchingEdges = knowledgeGraph.edges.filter((edge) => limitedIds.has(edge.source) && limitedIds.has(edge.target));
  const edges = matchingEdges.slice(0, MAX_EDGES);

  return {
    schemaVersion: knowledgeGraph.schemaVersion,
    generatedAt: knowledgeGraph.generatedAt,
    query: { q: raw.q?.trim() ?? '', domain, type, device: raw.device?.trim() ?? '', focus, depth, limit },
    truncated: ranked.length > limited.length || matchingEdges.length > edges.length,
    truncatedNodes: ranked.length > limited.length,
    truncatedEdges: matchingEdges.length > edges.length,
    totalMatches: focus ? ranked.length : baseMatches.length,
    nodes: limited,
    edges,
  };
}

export function graphDevices() {
  return knowledgeGraph.nodes
    .filter((node) => node.type === 'device')
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label, 'zh-CN'));
}
