import assert from 'node:assert/strict';
import test from 'node:test';
import {
  knowledgeGraph,
  localizeKnowledgeGraphEdge,
  localizeKnowledgeGraphNode,
  queryKnowledgeGraph,
} from '../app/knowledge-graph/data';

const han = /\p{Script=Han}/u;

test('all English knowledge-graph presentation fields are Han-free', () => {
  assert.equal(knowledgeGraph.nodes.length, 1_485);
  assert.equal(knowledgeGraph.edges.length, 2_841);

  for (const source of knowledgeGraph.nodes) {
    const node = localizeKnowledgeGraphNode(source, 'en');
    const presentation = [node.label, node.subtitle, node.description, ...(node.tags ?? [])].filter(Boolean).join('\n');
    assert.equal(han.test(presentation), false, `${node.id} leaked Han text: ${presentation}`);
  }

  for (const source of knowledgeGraph.edges) {
    const edge = localizeKnowledgeGraphEdge(source, 'en');
    const presentation = [edge.relationLabel, edge.evidenceLabel].filter(Boolean).join('\n');
    assert.equal(han.test(presentation), false, `${edge.id} leaked Han text: ${presentation}`);
  }
});

test('English graph queries expose localized relation labels and locale metadata', () => {
  const result = queryKnowledgeGraph({ locale: 'en', limit: 800 });
  assert.equal(result.query.locale, 'en');
  assert.ok(result.nodes.length > 0);
  assert.ok(result.edges.length > 0);
  assert.ok(result.edges.every((edge) => edge.relationLabel && !han.test(edge.relationLabel)));
});
