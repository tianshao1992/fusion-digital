import assert from 'node:assert/strict';
import test from 'node:test';
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
