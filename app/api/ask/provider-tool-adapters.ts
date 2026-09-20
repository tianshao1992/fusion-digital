import { ProviderRequestError, type ProviderConversationMessage, type ProviderUsage } from './provider-adapters';
import { normalizeProviderApiKey, type ResolvedLlmProvider } from './provider-registry';

export type ProviderTool = { name: string; description: string; parameters: Record<string, unknown> };
export type ProviderToolCall = { id: string; name: string; arguments: Record<string, unknown> };
/** Server-only transcript, including opaque provider reasoning continuity. Never send to the browser. */
export type ProviderToolState = { protocol: ResolvedLlmProvider['protocol']; transcript: Record<string, unknown>[] };
export type ProviderToolTurn = ProviderUsage & { outputText: string; toolCalls: ProviderToolCall[]; state: ProviderToolState };
export type ProviderToolRequest = {
  provider: ResolvedLlmProvider; instructions: string; messages: ProviderConversationMessage[];
  tools: ProviderTool[]; state?: ProviderToolState; toolResult?: { callId: string; output: string };
  maxOutputTokens: number; signal: AbortSignal;
};
const endpoints = {
  openai: ['https://api.openai.com/v1/responses'], anthropic: ['https://api.anthropic.com/v1/messages'],
  deepseek: ['https://api.deepseek.com/chat/completions'],
  kimi: ['https://api.moonshot.cn/v1/chat/completions', 'https://api.moonshot.ai/v1/chat/completions'],
};
const MAX_BYTES = 1_048_576;
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown) => Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;

export async function requestProviderToolTurn(input: ProviderToolRequest): Promise<ProviderToolTurn> {
  const { provider, signal } = input;
  if (!endpoints[provider.id]?.includes(provider.endpoint) || normalizeProviderApiKey(provider.apiKey) !== provider.apiKey
    || !Number.isSafeInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > 8_000
    || !input.tools.length || input.tools.length > 40 || input.tools.some(tool => !/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name))
    || (input.state && input.state.protocol !== provider.protocol)) throw new ProviderRequestError('request');
  const transcript: Record<string, unknown>[] = input.state ? [...input.state.transcript] : input.messages.map(message => ({ ...message }));
  if (!transcript.length) throw new ProviderRequestError('request');
  if (input.toolResult) {
    if (!input.state || !input.toolResult.callId || input.toolResult.output.length > 36_000) throw new ProviderRequestError('request');
    transcript.push(provider.protocol === 'openai-responses'
      ? { type: 'function_call_output', call_id: input.toolResult.callId, output: input.toolResult.output }
      : provider.protocol === 'anthropic-messages'
        ? { role: 'user', content: [{ type: 'tool_result', tool_use_id: input.toolResult.callId, content: input.toolResult.output }] }
        : { role: 'tool', tool_call_id: input.toolResult.callId, content: input.toolResult.output });
  }
  const requestBody = bodyFor(input, transcript);
  if (new TextEncoder().encode(JSON.stringify(requestBody)).byteLength > 240_000) throw new ProviderRequestError('request');
  let response: Response;
  try {
    response = await fetch(provider.endpoint, {
      method: 'POST', redirect: 'manual', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json',
        ...(provider.protocol === 'anthropic-messages' ? { 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${provider.apiKey}` }) },
      body: JSON.stringify(requestBody),
    });
  } catch { throw new ProviderRequestError(signal.aborted ? 'aborted' : 'network'); }
  if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new ProviderRequestError('http', response.status); }
  const payload = await boundedJson(response);
  let content: unknown[];
  let outputText = '';
  let toolCalls: ProviderToolCall[];
  const usage = record(payload.usage);
  if (provider.protocol === 'openai-responses') {
    if (payload.status !== 'completed') throw new ProviderRequestError(payload.status === 'incomplete' ? 'truncated' : 'incomplete');
    content = Array.isArray(payload.output) ? payload.output : [];
    outputText = content.flatMap(item => Array.isArray(record(item).content) ? record(item).content as unknown[] : [])
      .filter(item => record(item).type === 'output_text').map(item => String(record(item).text ?? '')).join('\n');
    toolCalls = content.filter(item => record(item).type === 'function_call').map(item => {
      const call = record(item); return parseCall(call.call_id, call.name, call.arguments);
    });
    transcript.push(...content.map(record));
  } else if (provider.protocol === 'anthropic-messages') {
    if (!['end_turn', 'tool_use'].includes(String(payload.stop_reason))) throw new ProviderRequestError('incomplete');
    content = Array.isArray(payload.content) ? payload.content : [];
    outputText = content.filter(item => record(item).type === 'text').map(item => String(record(item).text ?? '')).join('\n');
    toolCalls = content.filter(item => record(item).type === 'tool_use').map(item => {
      const call = record(item); return parseCall(call.id, call.name, call.input);
    });
    transcript.push({ role: 'assistant', content });
  } else {
    const choice = record(Array.isArray(payload.choices) ? payload.choices[0] : null);
    if (!['stop', 'tool_calls'].includes(String(choice.finish_reason))) throw new ProviderRequestError('incomplete');
    const message = record(choice.message);
    outputText = typeof message.content === 'string' ? message.content : '';
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    toolCalls = calls.map(item => { const call = record(item); const fn = record(call.function); return parseCall(call.id, fn.name, fn.arguments); });
    transcript.push({ ...message, role: 'assistant' });
  }
  if (toolCalls.length > 1 || toolCalls.some(call => !input.tools.some(tool => tool.name === call.name))) throw new ProviderRequestError('malformed');
  if (!outputText.trim() && !toolCalls.length) throw new ProviderRequestError('empty');
  if (outputText.length > 12_000 || new TextEncoder().encode(JSON.stringify(transcript)).byteLength > 220_000) throw new ProviderRequestError('oversized');
  return { outputText: outputText.trim(), toolCalls, state: { protocol: provider.protocol, transcript },
    inputTokens: count(usage.input_tokens ?? usage.prompt_tokens), outputTokens: count(usage.output_tokens ?? usage.completion_tokens) };
}

function bodyFor(input: ProviderToolRequest, transcript: Record<string, unknown>[]): Record<string, unknown> {
  const common = { model: input.provider.model };
  if (input.provider.protocol === 'openai-responses') return { ...common, instructions: input.instructions, input: transcript,
    store: false, include: ['reasoning.encrypted_content'], max_output_tokens: input.maxOutputTokens, parallel_tool_calls: false,
    tools: input.tools.map(tool => ({ type: 'function', ...tool, strict: true })), tool_choice: 'auto' };
  if (input.provider.protocol === 'anthropic-messages') return { ...common, system: input.instructions, messages: transcript,
    max_tokens: input.maxOutputTokens, tools: input.tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
    tool_choice: { type: 'auto', disable_parallel_tool_use: true } };
  return { ...common, messages: [{ role: 'system', content: input.instructions }, ...transcript], stream: false, parallel_tool_calls: false,
    ...(input.provider.id === 'kimi' ? { max_completion_tokens: input.maxOutputTokens } : { max_tokens: input.maxOutputTokens }),
    ...(input.provider.id === 'deepseek' ? { thinking: { type: 'disabled' } } : {}),
    tools: input.tools.map(tool => ({ type: 'function', function: tool })), tool_choice: 'auto' };
}

function parseCall(id: unknown, name: unknown, args: unknown): ProviderToolCall {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(id) || typeof name !== 'string') throw new ProviderRequestError('malformed');
  let value: unknown = args;
  if (typeof args === 'string') { try { value = JSON.parse(args); } catch { throw new ProviderRequestError('malformed'); } }
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 4_000) throw new ProviderRequestError('malformed');
  return { id, name, arguments: value as Record<string, unknown> };
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new ProviderRequestError('content-type');
  if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new ProviderRequestError('oversized'); }
  if (!response.body) throw new ProviderRequestError('empty');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    total += value.byteLength; if (total > MAX_BYTES) { await reader.cancel(); throw new ProviderRequestError('oversized'); } chunks.push(value);
  }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { const value = JSON.parse(new TextDecoder().decode(bytes)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new ProviderRequestError('malformed'); }
}
