import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderRequestError, requestProviderAnswer } from '../app/api/ask/provider-adapters.ts';
import { publicProviderEnvelope, resolveProvider, type LlmProviderId, type ProviderEnvironment } from '../app/api/ask/provider-registry.ts';

const groundedJson = JSON.stringify({ claims: [{ text: 'Supported claim', citationRefs: ['S1'] }], caveats: [] });
const schema = { type: 'object', properties: { claims: { type: 'array' } } };

test('provider catalog exposes availability and model metadata without secrets or endpoints', () => {
  const env = {
    OPENAI_API_KEY: 'SECRET_SENTINEL_OPENAI',
    OPENAI_MODEL: 'gpt-5.6',
    ANTHROPIC_API_KEY: 'SECRET_SENTINEL_ANTHROPIC',
    LLM_DEFAULT_PROVIDER: 'anthropic',
  } satisfies ProviderEnvironment;
  const envelope = publicProviderEnvelope(env);
  assert.equal(envelope.defaultProvider, 'anthropic');
  assert.deepEqual(envelope.providers.map(({ id }) => id), ['openai', 'anthropic', 'deepseek', 'kimi']);
  assert.equal(envelope.providers.find(({ id }) => id === 'openai')?.model, 'gpt-5.6');
  assert.equal(envelope.providers.find(({ id }) => id === 'deepseek')?.available, false);
  const serialized = JSON.stringify(envelope);
  assert.doesNotMatch(serialized, /SECRET_SENTINEL|api\.openai|api\.anthropic|API_KEY/);
});

test('provider resolution is allowlisted, supports explicit retrieval and never accepts client endpoints', () => {
  const env = { OPENAI_API_KEY: 'server-only-key' } satisfies ProviderEnvironment;
  assert.equal(resolveProvider('retrieval', env).status, 'retrieval');
  assert.equal(resolveProvider('openai', env).status, 'selected');
  assert.equal(resolveProvider('anthropic', env).status, 'unavailable');
  assert.equal(resolveProvider('http://169.254.169.254/latest/meta-data', env).status, 'invalid');
  assert.equal(resolveProvider('__proto__', env).status, 'invalid');
  assert.equal(resolveProvider({ provider: 'openai', baseUrl: 'file:///etc/passwd' }, env).status, 'invalid');
  const padded = resolveProvider('openai', { OPENAI_API_KEY: '  server-only-key  ' });
  assert.equal(padded.status, 'selected');
  if (padded.status === 'selected') assert.equal(padded.provider.apiKey, 'server-only-key');
  assert.equal(resolveProvider('openai', { OPENAI_API_KEY: 'server key' }).status, 'unavailable');
  assert.equal(resolveProvider('openai', { OPENAI_API_KEY: 'server-key-密钥' }).status, 'unavailable');
});

test('all provider adapters use fixed HTTPS endpoints, private auth headers and normalized output', async () => {
  const cases: Array<{
    id: LlmProviderId;
    env: ProviderEnvironment;
    endpoint: string;
    response: Record<string, unknown>;
    assertRequest(headers: Headers, body: Record<string, unknown>): void;
    expectedUsage: { inputTokens: number; outputTokens: number };
  }> = [
    {
      id: 'openai', env: { OPENAI_API_KEY: 'secret-openai' }, endpoint: 'https://api.openai.com/v1/responses',
      response: { status: 'completed', output_text: groundedJson, usage: { input_tokens: 11, output_tokens: 7 } },
      assertRequest(headers, body) {
        assert.equal(headers.get('authorization'), 'Bearer secret-openai');
        assert.equal(body.store, false);
        assert.equal((body.text as { format?: { type?: string } }).format?.type, 'json_schema');
      },
      expectedUsage: { inputTokens: 11, outputTokens: 7 },
    },
    {
      id: 'anthropic', env: { ANTHROPIC_API_KEY: 'secret-anthropic' }, endpoint: 'https://api.anthropic.com/v1/messages',
      response: { stop_reason: 'end_turn', content: [{ type: 'text', text: groundedJson }], usage: { input_tokens: 12, output_tokens: 8 } },
      assertRequest(headers, body) {
        assert.equal(headers.get('x-api-key'), 'secret-anthropic');
        assert.equal(headers.get('anthropic-version'), '2023-06-01');
        assert.equal(body.max_tokens, 1600);
      },
      expectedUsage: { inputTokens: 12, outputTokens: 8 },
    },
    {
      id: 'deepseek', env: { DEEPSEEK_API_KEY: 'secret-deepseek' }, endpoint: 'https://api.deepseek.com/chat/completions',
      response: { choices: [{ finish_reason: 'stop', message: { content: groundedJson } }], usage: { prompt_tokens: 13, completion_tokens: 9 } },
      assertRequest(headers, body) {
        assert.equal(headers.get('authorization'), 'Bearer secret-deepseek');
        assert.equal(body.max_tokens, 1600);
        assert.equal('max_completion_tokens' in body, false);
        assert.deepEqual(body.response_format, { type: 'json_object' });
        assert.deepEqual(body.thinking, { type: 'disabled' });
        assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'response_format', 'stream', 'thinking']);
      },
      expectedUsage: { inputTokens: 13, outputTokens: 9 },
    },
    {
      id: 'kimi', env: { MOONSHOT_API_KEY: 'secret-kimi' }, endpoint: 'https://api.moonshot.cn/v1/chat/completions',
      response: { choices: [{ finish_reason: 'stop', message: { content: groundedJson } }], usage: { prompt_tokens: 14, completion_tokens: 10 } },
      assertRequest(headers, body) {
        assert.equal(headers.get('authorization'), 'Bearer secret-kimi');
        assert.equal(body.max_completion_tokens, 1600);
        assert.equal('max_tokens' in body, false);
      },
      expectedUsage: { inputTokens: 14, outputTokens: 10 },
    },
  ];

  const originalFetch = globalThis.fetch;
  try {
    for (const entry of cases) {
      const resolution = resolveProvider(entry.id, entry.env);
      assert.equal(resolution.status, 'selected');
      if (resolution.status !== 'selected') throw new Error('provider was not selected');
      globalThis.fetch = async (request) => {
        assert.ok(request instanceof Request);
        assert.equal(request.url, entry.endpoint);
        assert.equal(request.redirect, 'error');
        assert.equal(request.cache, 'default');
        const headers = request.headers;
        const serializedBody = await request.clone().text();
        const body = JSON.parse(serializedBody) as Record<string, unknown>;
        entry.assertRequest(headers, body);
        assert.doesNotMatch(serializedBody, /secret-openai|secret-anthropic|secret-deepseek|secret-kimi/);
        return new Response(JSON.stringify(entry.response), { headers: { 'content-type': 'application/json' } });
      };
      const answer = await requestProviderAnswer({
        provider: resolution.provider,
        instructions: 'Return strict JSON.',
        modelInput: 'Grounded evidence.',
        maxOutputTokens: 1600,
        jsonSchema: schema,
        signal: new AbortController().signal,
      });
      assert.equal(answer.outputText, groundedJson);
      assert.deepEqual({ inputTokens: answer.inputTokens, outputTokens: answer.outputTokens }, entry.expectedUsage);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider adapter rejects non-JSON and oversized upstream responses without exposing bodies', async () => {
  const resolution = resolveProvider('openai', { OPENAI_API_KEY: 'secret-key' });
  assert.equal(resolution.status, 'selected');
  if (resolution.status !== 'selected') throw new Error('provider was not selected');
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html>upstream secret</html>', { headers: { 'content-type': 'text/html' } });
    await assert.rejects(() => requestProviderAnswer({
      provider: resolution.provider, instructions: 'json', modelInput: 'input', maxOutputTokens: 1600,
      jsonSchema: schema, signal: new AbortController().signal,
    }), /content-type/);
    globalThis.fetch = async () => new Response('{}', { headers: { 'content-type': 'application/json', 'content-length': '1048577' } });
    await assert.rejects(() => requestProviderAnswer({
      provider: resolution.provider, instructions: 'json', modelInput: 'input', maxOutputTokens: 1600,
      jsonSchema: schema, signal: new AbortController().signal,
    }), /oversized/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider adapter classifies request construction, network, timeout and incomplete output safely', async () => {
  const resolution = resolveProvider('deepseek', { DEEPSEEK_API_KEY: 'secret-deepseek' });
  assert.equal(resolution.status, 'selected');
  if (resolution.status !== 'selected') throw new Error('provider was not selected');
  const base = {
    instructions: 'json', modelInput: 'input', maxOutputTokens: 1600,
    jsonSchema: schema,
  };
  const originalFetch = globalThis.fetch;
  try {
    await assert.rejects(
      requestProviderAnswer({
        ...base,
        provider: { ...resolution.provider, apiKey: 'invalid\nsecret' },
        signal: new AbortController().signal,
      }),
      providerFailure('request'),
    );

    globalThis.fetch = async () => { throw new Error('SECRET_UPSTREAM_FAILURE'); };
    await assert.rejects(
      requestProviderAnswer({ ...base, provider: resolution.provider, signal: new AbortController().signal }),
      providerFailure('network'),
    );

    const timedOut = new AbortController();
    timedOut.abort(new DOMException('SECRET_TIMEOUT_DETAIL', 'TimeoutError'));
    await assert.rejects(
      requestProviderAnswer({ ...base, provider: resolution.provider, signal: timedOut.signal }),
      providerFailure('timeout'),
    );

    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message: { content: groundedJson } }],
    }), { headers: { 'content-type': 'application/json' } });
    await assert.rejects(
      requestProviderAnswer({ ...base, provider: resolution.provider, signal: new AbortController().signal }),
      providerFailure('truncated'),
    );

    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'content_filter', message: { content: groundedJson } }],
    }), { headers: { 'content-type': 'application/json' } });
    await assert.rejects(
      requestProviderAnswer({ ...base, provider: resolution.provider, signal: new AbortController().signal }),
      providerFailure('filtered'),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function providerFailure(kind: ProviderRequestError['kind']) {
  return (error: unknown) => error instanceof ProviderRequestError
    && error.kind === kind
    && !/SECRET_|invalid\nsecret/.test(error.message);
}
