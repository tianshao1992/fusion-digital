import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHAT_LIMITS,
  compactConversation,
  deserializeConversation,
  historyForRequest,
  knowledgeChatStorageKey,
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
    { ...turn(1, 'assistant'), mode: 'assistant-chat', provider: 'anthropic', model: 'claude-sonnet-5' },
    { ...turn(2, 'assistant'), provider: 'http://attacker.invalid', model: 'unsafe model value' },
  ]);
  assert.equal(restored[0].provider, 'anthropic');
  assert.equal(restored[0].model, 'claude-sonnet-5');
  assert.equal(restored[0].mode, 'assistant-chat');
  assert.equal(restored[1].provider, undefined);
});

test('request history keeps the newest contiguous turns within its UTF-8 byte budget', () => {
  const turns = Array.from({ length: 10 }, (_, index): ChatTurn => ({
    ...turn(index, 'assistant'),
    content: `${index}:${'聚'.repeat(CHAT_LIMITS.maxAssistantChars - 2)}`,
  }));
  const history = historyForRequest(turns);
  const bytes = new TextEncoder().encode(JSON.stringify(history)).byteLength;
  assert.ok(bytes <= CHAT_LIMITS.maxRequestHistoryBytes);
  assert.equal(history.at(-1)?.content, turns.at(-1)?.content);
  assert.ok(history.length < CHAT_LIMITS.maxRequestTurns);
  assert.deepEqual(history, historyForRequest(turns.slice(-history.length)));
});

test('only the latest bounded user and assistant turns are sent as dialogue context', () => {
  const turns = Array.from({ length: 18 }, (_, index) => turn(index));
  const history = historyForRequest(turns);
  assert.equal(history.length, CHAT_LIMITS.maxRequestTurns);
  assert.equal(history[0].content, 'user message 8');
  assert.equal(history.at(-1)?.content, 'assistant message 17');
  assert.ok(history.every(({ role }) => role === 'user' || role === 'assistant'));
});

test('English and Chinese conversations use isolated persistence keys', () => {
  assert.equal(knowledgeChatStorageKey('en'), 'fusiondigital.knowledge-chat.v1.en');
  assert.equal(knowledgeChatStorageKey('zh-CN'), 'fusiondigital.knowledge-chat.v1.zh-CN');
  assert.notEqual(knowledgeChatStorageKey('en'), knowledgeChatStorageKey('zh-CN'));
});

test('English assistant-direct and retrieval-only responses remain English without upstream calls', async () => {
  const { POST } = await import('../app/api/ask/route.ts');
  const headers = { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin', 'x-fusiondigital-locale': 'en' };
  const direct = await POST(new Request('http://localhost/api/ask', {
    method: 'POST', headers, body: JSON.stringify({ question: 'Who are you?', locale: 'en', provider: 'retrieval' }),
  }));
  const directPayload = await direct.json() as Record<string, unknown>;
  assert.equal(directPayload.mode, 'assistant-direct');
  assert.doesNotMatch(JSON.stringify(directPayload), /[\u3400-\u9fff]/u);

  const retrieval = await POST(new Request('http://localhost/api/ask', {
    method: 'POST', headers, body: JSON.stringify({ question: 'What are the limitations of DINA?', locale: 'en', provider: 'retrieval' }),
  }));
  const retrievalPayload = await retrieval.json() as Record<string, unknown>;
  assert.equal(retrievalPayload.mode, 'retrieval-only');
  assert.match(String(retrievalPayload.answer), /DINA/i);
  assert.doesNotMatch(JSON.stringify(retrievalPayload), /[\u3400-\u9fff]/u);
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

test('public-anonymous mode exposes retrieval only and never calls an upstream model', async () => {
  const previousMode = process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
  const originalFetch = globalThis.fetch;
  let called = false;
  process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE = 'public-anonymous';
  globalThis.fetch = async () => { called = true; throw new Error('must not call upstream'); };
  try {
    const [{ GET }, { POST }] = await Promise.all([
      import('../app/api/ask/providers/route.ts'),
      import('../app/api/ask/route.ts'),
    ]);
    const providerResponse = await GET();
    assert.deepEqual(await providerResponse.json(), {
      authenticated: false,
      defaultProvider: 'retrieval',
      providers: [],
    });

    const askResponse = await POST(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ question: '请介绍 DINA', provider: 'deepseek' }),
    }));
    const payload = await askResponse.json() as Record<string, unknown>;
    assert.equal(askResponse.status, 200);
    assert.equal(payload.mode, 'retrieval-only');
    assert.match(String(payload.notice), /公开匿名版/);
    assert.equal('provider' in payload, false);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
    else process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE = previousMode;
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

test('site-assistant identity questions bypass retrieval, provider calls and quota', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('must not call upstream'); };
  try {
    const { POST } = await import('../app/api/ask/route.ts');
    const response = await POST(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({ question: '你是谁', provider: 'deepseek', conversationId: 'conversation-identity-20260817' }),
    }));
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(payload.mode, 'assistant-direct');
    assert.equal(payload.conversationId, 'conversation-identity-20260817');
    assert.deepEqual(payload.citations, []);
    assert.deepEqual(payload.results, []);
    assert.equal('provider' in payload, false);
    assert.equal(called, false);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('standalone questions are not polluted by prior dialogue or page focus', async () => {
  const { POST } = await import('../app/api/ask/route.ts');
  const response = await POST(new Request('http://localhost/api/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' },
    body: JSON.stringify({
      question: 'zzqv987654xkcd',
      history: [{ role: 'user', content: '请先介绍 DINA' }],
      context: { path: '/knowledge-graph', title: '知识图谱', focusId: 'tool-dina', focusLabel: 'DINA' },
      conversationId: 'conversation-standalone-20260817',
      provider: 'retrieval',
    }),
  }));
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(payload.mode, 'retrieval-only');
  assert.deepEqual(payload.citations, []);
  assert.deepEqual(payload.results, []);
  assert.doesNotMatch(String(payload.answer), /DINA/i);
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

test('short elliptical follow-ups retain the latest entity anchor', async () => {
  const { POST } = await import('../app/api/ask/route.ts');
  for (const question of ['性能如何？', '有什么证据？', '再详细介绍一下']) {
    const response = await POST(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', 'sec-fetch-site': 'same-origin' },
      body: JSON.stringify({
        question,
        history: [{ role: 'user', content: '请先介绍 DINA' }],
        context: { path: '/knowledge-graph', title: '知识图谱', focusId: 'tool-dina', focusLabel: 'DINA' },
        provider: 'retrieval',
      }),
    }));
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(response.status, 200);
    assert.equal(payload.mode, 'retrieval-only');
    assert.match(String(payload.answer), /DINA/i);
  }
});
