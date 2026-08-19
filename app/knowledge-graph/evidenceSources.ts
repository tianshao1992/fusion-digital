import type { KnowledgeEvidenceSource, KnowledgeEvidenceSourceKind, KnowledgeGraphEdge, KnowledgeGraphNode } from './types';

export type { KnowledgeEvidenceSource, KnowledgeEvidenceSourceKind } from './types';

const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const MAX_SOURCE_URL_LENGTH = 2_048;

/**
 * Accept only absolute web URLs without embedded credentials. The graph is a
 * public data surface, so an invalid source is omitted rather than repaired or
 * resolved against the current origin.
 */
export function normalizeKnowledgeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_SOURCE_URL_LENGTH || CONTROL_CHARACTER.test(candidate)) return undefined;
  try {
    const parsed = new URL(candidate);
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname || parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch {
    return undefined;
  }
}

function sourceKind(node?: KnowledgeGraphNode): KnowledgeEvidenceSourceKind {
  if (node?.type === 'paper') return 'paper';
  if (node?.type === 'code') return 'code';
  return 'official';
}

function sourceHost(url: string) {
  return new URL(url).hostname.replace(/^www\./i, '');
}

export function collectKnowledgeEvidenceSources(
  selected: KnowledgeGraphNode,
  relations: readonly KnowledgeGraphEdge[],
  nodeIndex: ReadonlyMap<string, KnowledgeGraphNode>,
): KnowledgeEvidenceSource[] {
  const sources = new Map<string, KnowledgeEvidenceSource & { order: number }>();
  let order = 0;

  const add = (rawUrl: unknown, node: KnowledgeGraphNode | undefined, fallbackLabel: string | undefined, relation?: string) => {
    const url = normalizeKnowledgeSourceUrl(rawUrl);
    if (!url || sources.has(url)) return;
    const label = node?.label?.trim() || fallbackLabel?.trim();
    if (!label) return;
    sources.set(url, { url, label, kind: sourceKind(node), host: sourceHost(url), relation, order: order++ });
  };

  for (const projected of selected.evidenceSources ?? []) {
    const url = normalizeKnowledgeSourceUrl(projected.url);
    const label = projected.label?.trim();
    if (!url || !label || sources.has(url)) continue;
    const kind = projected.kind === 'paper' || projected.kind === 'code' ? projected.kind : 'official';
    sources.set(url, { url, label, kind, host: sourceHost(url), relation: projected.relation, order: order++ });
  }

  add(selected.url, selected, selected.label);

  for (const edge of relations) {
    const neighborId = edge.source === selected.id ? edge.target : edge.source;
    const neighbor = nodeIndex.get(neighborId);
    const evidenceNode = edge.evidenceNodeId ? nodeIndex.get(edge.evidenceNodeId) : undefined;
    const evidenceUrl = normalizeKnowledgeSourceUrl(edge.evidenceUrl);
    const matchingOwner = [evidenceNode, neighbor, selected].find((node) => normalizeKnowledgeSourceUrl(node?.url) === evidenceUrl);

    add(evidenceUrl, matchingOwner ?? evidenceNode, edge.evidenceLabel ?? neighbor?.label, edge.relation);
    add(neighbor?.url, neighbor, edge.evidenceLabel, edge.relation);
  }

  const priority: Record<KnowledgeEvidenceSourceKind, number> = { paper: 0, code: 1, official: 2 };
  return [...sources.values()]
    .sort((left, right) => priority[left.kind] - priority[right.kind] || left.order - right.order)
    .map((source) => ({ url: source.url, label: source.label, kind: source.kind, host: source.host, relation: source.relation }));
}
