import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT_LIMITS,
  compactConversation,
  deserializeConversation,
  historyForRequest,
  serializeConversation,
  type ChatTurn,
} from '../app/components/knowledge-chat/conversation.ts';

function turn(index: number, role: 'user' | 'assistant' = index % 2 ? 'assistant' : 'user'): ChatTurn {
  return { id: `turn-${index}`, role, content: `${role} message ${index}`, createdAt: new Date(2026, 7, 16, 0, 0, index).toISOString() };
}

test('conversation storage is bounded, normalized and safe to restore', () => {
  const compact = compactConversation([
    { role: 'system', content: 'must be rejected' },
    ...Array.from({ length: 40 }, (_, index) => turn(index)),
    { role: 'assistant', content: '', id: 'empty' },
  ]);
  assert.equal(compact.length, CHAT_LIMITS.maxStoredTurns);
  assert.equal(compact[0].id, 'turn-16');
  assert.equal(compact.at(-1)?.id, 'turn-39');
  const encoded = serializeConversation(compact);
  assert.ok(new TextEncoder().encode(encoded).byteLength <= CHAT_LIMITS.maxStoredBytes);
  assert.deepEqual(deserializeConversation(encoded), compact);
  assert.deepEqual(deserializeConversation('{broken'), []);
});

test('only the latest bounded user and assistant turns are sent as dialogue context', () => {
  const turns = Array.from({ length: 18 }, (_, index) => turn(index));
  const history = historyForRequest(turns);
  assert.equal(history.length, CHAT_LIMITS.maxRequestTurns);
  assert.equal(history[0].content, 'user message 8');
  assert.equal(history.at(-1)?.content, 'assistant message 17');
  assert.ok(history.every(({ role }) => role === 'user' || role === 'assistant'));
});

test('ask endpoint uses prior dialogue and page focus for grounded retrieval fallback', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const { POST } = await import('../app/api/ask/route.ts');
    const response = await POST(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({
        question: '它与实时控制是什么关系？',
        history: [{ role: 'user', content: '请先介绍 DINA' }, { role: 'assistant', content: '上一轮回答只用于解析指代。' }],
        context: { path: '/knowledge-graph', title: '知识图谱', focusId: 'tool-dina', focusLabel: 'DINA' },
        conversationId: 'conversation-20260816',
      }),
    }));
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(payload.mode, 'retrieval-only');
    assert.equal(payload.conversationId, 'conversation-20260816');
    assert.match(String(payload.answer), /DINA/i);
    assert.ok(Array.isArray(payload.citations) && payload.citations.length > 0);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
