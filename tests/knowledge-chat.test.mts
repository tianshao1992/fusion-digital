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

test('conversation stores only provider/model metadata and rejects invalid provider values', () => {
  const restored = compactConversation([
    { ...turn(1, 'assistant'), provider: 'anthropic', model: 'claude-sonnet-5' },
    { ...turn(2, 'assistant'), provider: 'http://attacker.invalid', model: 'unsafe model value' },
  ]);
  assert.equal(restored[0].provider, 'anthropic');
  assert.equal(restored[0].model, 'claude-sonnet-5');
  assert.equal(restored[1].provider, undefined);
});

test('only the latest bounded user and assistant turns are sent as dialogue context', () => {
  const turns = Array.from({ length: 18 }, (_, index) => turn(index));
  const history = historyForRequest(turns);
  assert.equal(history.length, CHAT_LIMITS.maxRequestTurns);
  assert.equal(history[0].content, 'user message 8');
  assert.equal(history.at(-1)?.content, 'assistant message 17');
  assert.ok(history.every(({ role }) => role === 'user' || role === 'assistant'));
});

test('provider status endpoint returns only public configuration metadata', async () => {
  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'SECRET_SENTINEL_STATUS_ENDPOINT';
  try {
    const { GET } = await import('../app/api/ask/providers/route.ts');
    const response = await GET();
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(JSON.stringify(payload), /SECRET_SENTINEL|API_KEY|api\.openai/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
  }
});

test('ask endpoint rejects unknown providers before any upstream call', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('must not call upstream'); };
  try {
    const { POST } = await import('../app/api/ask/route.ts');
    const response = await POST(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ question: '请介绍 DINA', provider: 'http://169.254.169.254/latest/meta-data' }),
    }));
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ask endpoint uses prior dialogue and page focus for grounded retrieval fallback', async () => {
  const keyNames = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY', 'MOONSHOT_API_KEY'] as const;
  const previousKeys = Object.fromEntries(keyNames.map((name) => [name, process.env[name]]));
  for (const name of keyNames) delete process.env[name];
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
        provider: 'deepseek',
      }),
    }));
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(payload.mode, 'retrieval-only');
    assert.equal(payload.conversationId, 'conversation-20260816');
    assert.equal(payload.provider, 'deepseek');
    assert.match(String(payload.answer), /DINA/i);
    assert.ok(Array.isArray(payload.citations) && payload.citations.length > 0);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    for (const name of keyNames) {
      if (previousKeys[name] === undefined) delete process.env[name];
      else process.env[name] = previousKeys[name];
    }
  }
});
