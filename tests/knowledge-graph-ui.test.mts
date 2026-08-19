import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { knowledgeGraph, queryKnowledgeGraph } from '../app/knowledge-graph/data.ts';
import { collectKnowledgeEvidenceSources, normalizeKnowledgeSourceUrl } from '../app/knowledge-graph/evidenceSources.ts';
import { formatKnowledgeGraphTooltip } from '../app/knowledge-graph/knowledgeGraphTooltip.ts';

test('knowledge graph tooltip uses semantic node fields instead of the ECharts label object', () => {
  const html = formatKnowledgeGraphTooltip({
    dataType: 'node',
    data: {
      name: 'fallback name',
      label: { show: true, formatter: 'style object' },
      entityLabel: 'J-TEXT',
      entityDescription: '聚变实验装置及其已收录研究证据。',
      entityType: 'device',
      entityDomain: 'facility',
      entityDegree: 14,
    },
  });

  assert.match(html, /J-TEXT/);
  assert.match(html, /聚变实验装置及其已收录研究证据/);
  assert.match(html, /关联 14 条/);
  assert.doesNotMatch(html, /\[object Object\]/);
});

test('knowledge graph tooltip escapes node and edge evidence text', () => {
  const node = formatKnowledgeGraphTooltip({ dataType: 'node', data: { entityLabel: '<ITER>', entityDescription: 'A & B', entityType: 'device', entityDomain: 'facility', entityDegree: 3 } });
  const edge = formatKnowledgeGraphTooltip({ dataType: 'edge', data: { relation: '<supports>', evidenceLabel: 'paper & data' } });
  assert.match(node, /&lt;ITER&gt;/);
  assert.match(node, /A &amp; B/);
  assert.match(edge, /&lt;supports&gt;/);
  assert.match(edge, /paper &amp; data/);
});

test('knowledge graph source URLs are absolute public web links without embedded credentials', () => {
  const sourceUrls = [
    ...knowledgeGraph.nodes.map((node) => node.url),
    ...knowledgeGraph.edges.map((edge) => edge.evidenceUrl),
  ].filter((url): url is string => Boolean(url));
  assert.ok(sourceUrls.length > 1_000, 'the evidence atlas should retain its curated source coverage');
  for (const url of sourceUrls) assert.ok(normalizeKnowledgeSourceUrl(url), `unsafe knowledge source URL: ${url}`);

  for (const unsafe of [
    'javascript:alert(1)',
    'data:text/html,unsafe',
    '//example.org/source',
    'https://user:secret@example.org/source',
    'https://example.org/source\nscript',
  ]) assert.equal(normalizeKnowledgeSourceUrl(unsafe), undefined, `must reject ${unsafe}`);
});

test('selected research projects expose linked papers and real repositories without inventing unavailable code', () => {
  const selected = knowledgeGraph.nodes.find((node) => node.id === 'research:ai:dia-02');
  assert.ok(selected, 'Hybrid Deep Learner research node must remain present');
  const relations = knowledgeGraph.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id);
  const nodeIndex = new Map(knowledgeGraph.nodes.map((node) => [node.id, node]));
  const sources = collectKnowledgeEvidenceSources(selected, relations, nodeIndex);

  assert.deepEqual(sources.map(({ url, kind }) => ({ url, kind })), [
    { url: 'https://doi.org/10.1088/1741-4326/abc664', kind: 'paper' },
    { url: 'https://github.com/MIT-PSFC/disruption-py', kind: 'code' },
    { url: 'https://www.ga.com/magnetic-fusion/diii-d', kind: 'official' },
    { url: 'https://english.hf.cas.cn/r/ResearchPrograms/PlasmaPhysics/', kind: 'official' },
  ]);
  assert.equal(sources.some((source) => /not-public|原论文模型/i.test(source.url)), false);
});

test('a one-hop task view projects each leaf research source even when paper and code nodes are outside the visible subgraph', () => {
  const result = queryKnowledgeGraph({ focus: 'task:ai:diagnostics', depth: 1, limit: 200 });
  const hybrid = result.nodes.find((node) => node.id === 'research:ai:dia-02');
  assert.ok(hybrid, 'the screenshot task neighbourhood must include the Hybrid Deep Learner record');
  assert.equal(result.nodes.some((node) => node.id === 'paper:https-doi-org-10-1088-1741-4326-abc664'), false, 'paper node should remain outside the one-hop chart');
  assert.ok(hybrid.evidenceSources?.some((source) => source.url === 'https://doi.org/10.1088/1741-4326/abc664' && source.kind === 'paper'));
  assert.ok(hybrid.evidenceSources?.some((source) => source.url === 'https://github.com/MIT-PSFC/disruption-py' && source.kind === 'code'));
});

test('knowledge graph evidence links are bilingual, keyboard-accessible and hardened for new tabs', async () => {
  const explorer = await readFile(new URL('../app/knowledge-graph/KnowledgeGraphExplorer.tsx', import.meta.url), 'utf8');
  assert.match(explorer, /相关文章与代码来源/);
  assert.match(explorer, /Related papers and code sources/);
  assert.match(explorer, /<noscript>/);
  assert.match(explorer, /rel="noopener noreferrer external"/);
  assert.match(explorer, /aria-label=\{ui\.sourceLinkAria/);
  assert.doesNotMatch(explorer, /href=\{edge\.evidenceUrl\}/);
});
