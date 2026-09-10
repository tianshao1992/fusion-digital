import { normalizeEndpoint } from '../platform/compute-client.ts';
import { parseControlResult, type ControlRunSpec } from './contracts.ts';
export class ControlRequestRejected extends Error {}

export async function requestControl(endpoint: string, token: string, route: string, options: { body?: string; key?: string; signal?: AbortSignal; method?: 'GET' | 'POST' } = {}) {
  const origin = normalizeEndpoint(endpoint);
  if (token.length < 32) throw new Error('AUTH_REQUIRED');
  if (!/^\/v1\/(catalog|validate|jobs(?:\/(?:dina|fge)-[a-zA-Z0-9._-]+(?:\/(?:result|cancel))?)?)$/.test(route)) throw new Error('INVALID_CONTROL_ROUTE');
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
  const response = await fetch(origin + route, { method: options.method ?? 'GET', body: options.body, signal, credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.key ? { 'Idempotency-Key': options.key } : {}) } });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_RESPONSE');
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 20_000_000) throw new Error('RESPONSE_TOO_LARGE'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const raw = new Uint8Array(size); let offset = 0; for (const c of chunks) { raw.set(c, offset); offset += c.length; }
  const value = JSON.parse(new TextDecoder().decode(raw));
  if (!response.ok) {
    const code = typeof value?.error === 'string' && /^[A-Z0-9_]{1,100}$/.test(value.error) ? value.error : `HTTP_${response.status}`;
    if ([400, 401, 403, 404, 409, 413, 415].includes(response.status) && code !== 'IDEMPOTENCY_CONFLICT') throw new ControlRequestRejected(code);
    throw new Error(code);
  }
  return value;
}
export function matchControlResult(value: unknown, id: string, spec?: ControlRunSpec) {
  const r = parseControlResult(value);
  if (r.id !== id || spec && JSON.stringify(r.spec) !== JSON.stringify(spec)) throw new Error('CONTROL_RESULT_BINDING');
  return r;
}
