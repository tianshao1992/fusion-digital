export const graphNodeTypes = [
  'research',
  'paper',
  'code',
  'device',
  'tool',
  'task',
  'organization',
] as const;

export type GraphNodeType = (typeof graphNodeTypes)[number];
export type GraphDomain = 'physics' | 'engineering' | 'control' | 'diagnostics' | 'ai' | 'facility';

export type KnowledgeGraphNode = {
  id: string;
  type: GraphNodeType;
  domain: GraphDomain;
  label: string;
  subtitle?: string;
  description?: string;
  url?: string;
  year?: number;
  evidenceLevel?: string;
  deploymentLevel?: string;
  tags?: string[];
  sourceDomains?: GraphDomain[];
  degree: number;
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  relation: string;
  domain: GraphDomain;
  evidenceNodeId?: string;
  evidenceUrl?: string;
  evidenceLabel?: string;
};

export type KnowledgeGraphSnapshot = {
  schemaVersion: '1.0';
  generatedAt: string;
  asOf: string;
  provenance: {
    generator: string;
    sources: string[];
    policy: string;
  };
  statistics: {
    nodes: number;
    edges: number;
    byType: Record<GraphNodeType, number>;
    byDomain: Record<GraphDomain, number>;
  };
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
};

export type GraphQueryResponse = {
  schemaVersion: string;
  generatedAt: string;
  query: {
    q: string;
    domain: GraphDomain | 'all';
    type: GraphNodeType | 'all';
    device: string;
    focus: string;
    depth: 0 | 1 | 2;
    limit: number;
  };
  truncated: boolean;
  truncatedNodes: boolean;
  truncatedEdges: boolean;
  totalMatches: number;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
};
