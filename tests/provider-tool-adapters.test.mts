import assert from 'node:assert/strict';
import test from 'node:test';
import { requestProviderToolTurn, type ProviderToolRequest } from '../app/api/ask/provider-tool-adapters.ts';
import { ProviderRequestError } from '../app/api/ask/provider-adapters.ts';
import type { ResolvedLlmProvider } from '../app/api/ask/provider-registry.ts';

const providers: ResolvedLlmProvider[] = [
  { id: 'openai', label: 'OpenAI', model: 'test', available: true, protocol: 'openai-responses', endpoint: 'https://api.openai.com/v1/responses', apiKey: 'test-only-key' },
  { id: 'anthropic', label: 'Anthropic', model: 'test', available: true, protocol: 'anthropic-messages', endpoint: 'https://api.anthropic.com/v1/messages', apiKey: 'test-only-key' },
  { id: 'deepseek', label: 'DeepSeek', model: 'test', available: true, protocol: 'chat-completions', endpoint: 'https://api.deepseek.com/chat/completions', apiKey: 'test-only-key' },
];
const tool = { name: 'site__navigate', description: 'Navigate', parameters: { type: 'object', properties: { path: { type: 'string', enum: ['/'] } }, required: ['path'], additionalProperties: false } };
const input = (provider = providers[0]): ProviderToolRequest => ({ provider, instructions: 'Operate site', messages: [{ role: 'user', content: 'Open home' }], tools: [tool], maxOutputTokens: 1024, signal: new AbortController().signal });
const first = [
  { status: 'completed', output: [{ type: 'reasoning', encrypted_content: 'opaque-reasoning' }, { type: 'function_call', call_id: 'call_1', name: tool.name, arguments: '{"path":"/"}' }], usage: { input_tokens: 10, output_tokens: 20 } },
  { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: 'private', signature: 'opaque' }, { type: 'tool_use', id: 'call_1', name: tool.name, input: { path: '/' } }], usage: { input_tokens: 10, output_tokens: 20 } },
  { choices: [{ finish_reason: 'tool_calls', message: { role: 'assistant', reasoning_content: 'opaque', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: tool.name, arguments: '{"path":"/"}' } }] } }], usage: { prompt_tokens: 10, completion_tokens: 20 } },
];
const last = [
  { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Done' }] }] },
  { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done' }] },
  { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'Done' } }] },
];

for (const [index, provider] of providers.entries()) test(`${provider.id} native protocol preserves tool call identity and reasoning across real request shapes`, async () => {
  const original = globalThis.fetch; const requests: { body: Record<string, unknown>; init: RequestInit }[] = [];
  globalThis.fetch = async (_url, init) => { requests.push({ body: JSON.parse(String(init?.body)), init: init! }); return Response.json(requests.length === 1 ? first[index] : last[index]); };
  try {
    const one = await requestProviderToolTurn(input(provider));
    assert.equal(one.outputText, ''); assert.deepEqual(one.toolCalls, [{ id: 'call_1', name: tool.name, arguments: { path: '/' } }]); assert.equal(one.inputTokens, 10);
    const two = await requestProviderToolTurn({ ...input(provider), state: one.state, toolResult: { callId: 'call_1', output: '{"receipt":"applied"}' } });
    assert.equal(two.outputText, 'Done'); assert.deepEqual(two.toolCalls, []);
    assert.equal(requests[0].init.redirect, 'manual');
    assert.match(JSON.stringify(requests[1].body), /opaque/); assert.match(JSON.stringify(requests[1].body), /call_1/); assert.match(JSON.stringify(requests[1].body), /applied/);
    if (index === 0) { assert.equal(requests[0].body.store, false); assert.equal(requests[0].body.parallel_tool_calls, false); assert.deepEqual(requests[0].body.include, ['reasoning.encrypted_content']); }
  } finally { globalThis.fetch = original; }
});

test('native provider adapter rejects arbitrary credential destinations before fetch', async () => {
  const original = globalThis.fetch; let invoked = false;
  globalThis.fetch = async () => { invoked = true; throw new Error(); };
  try { await assert.rejects(requestProviderToolTurn({ ...input(), provider: { ...providers[0], endpoint: 'https://example.com/steal' } }), ProviderRequestError); assert.equal(invoked, false); }
  finally { globalThis.fetch = original; }
});

test('native provider adapter rejects multiple or invented tools and malformed argument JSON', async () => {
  const original = globalThis.fetch;
  try {
    for (const output of [
      [{ type: 'function_call', call_id: 'one', name: tool.name, arguments: '{}' }, { type: 'function_call', call_id: 'two', name: tool.name, arguments: '{}' }],
      [{ type: 'function_call', call_id: 'one', name: 'shell_run', arguments: '{}' }],
      [{ type: 'function_call', call_id: 'one', name: tool.name, arguments: 'not-json' }],
    ]) { globalThis.fetch = async () => Response.json({ status: 'completed', output }); await assert.rejects(requestProviderToolTurn(input()), ProviderRequestError); }
  } finally { globalThis.fetch = original; }
});

test('native provider HTTP errors expose only status and cancel bounded response body', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('secret provider diagnostics', { status: 401 });
    await assert.rejects(requestProviderToolTurn(input()), error => error instanceof ProviderRequestError && error.status === 401 && !error.message.includes('secret'));
    globalThis.fetch = async () => new Response('x', { headers: { 'content-type': 'application/json', 'content-length': '2000000' } });
    await assert.rejects(requestProviderToolTurn(input()), error => error instanceof ProviderRequestError && error.kind === 'oversized');
  } finally { globalThis.fetch = original; }
});
