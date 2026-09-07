// Browser-only transport contract. Solver paths and credentials never enter uploads.
import { parseEngineSpec, parseProfileSnapshot, parseTransportResult, type EngineRunSpec, type ProfileSnapshot, type TransportResult } from './contracts.ts';

export const UPLOAD_LIMIT = 120_000;
export const JOB_STATES = ['queued', 'starting', 'running', 'cancellation-requested', 'succeeded', 'failed', 'timed-out', 'cancelled', 'collection-failed', 'reconciliation-required'] as const;
export type ComputeJob = { id: string; state: (typeof JOB_STATES)[number] | 'connection-lost'; processStopped?: boolean; elapsedSeconds?: number };
export type RunUpload = { schema: 'torax-run-upload.v1'; spec: EngineRunSpec; snapshot: ProfileSnapshot | null };
const requireValue = (ok: unknown, code: string): void => { if (!ok) throw new Error(code); };
export const jobId = (v: unknown): v is string => typeof v === 'string' && /^torax-[a-zA-Z0-9._-]{1,113}$/.test(v);
export const activeJob = (job: ComputeJob | null) => !!job && (!['succeeded', 'failed', 'timed-out', 'cancelled', 'collection-failed'].includes(job.state) || job.processStopped !== true);
export function normalizeEndpoint(value: string): string {
  let u: URL;
  try { u = new URL(value.trim()); } catch { throw new Error('INVALID_GATEWAY_URL'); }
  requireValue(!u.username && !u.password && !u.search && !u.hash && u.pathname === '/', 'GATEWAY_ORIGIN_REQUIRED');
  requireValue(u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname) && !!u.port), 'SECURE_GATEWAY_REQUIRED');
  return u.origin;
}
export function parseJob(value: unknown, expectedId?: string): ComputeJob {
  const v = value as Record<string, unknown> | null;
  requireValue(v && v.schema === 'engine-job.v1' && jobId(v.id) && (!expectedId || v.id === expectedId), 'INVALID_JOB_STATUS');
  requireValue(JOB_STATES.includes(v!.state as typeof JOB_STATES[number]) && typeof v!.processStopped === 'boolean', 'INVALID_JOB_STATUS');
  requireValue(typeof v!.elapsedSeconds === 'number' && Number.isFinite(v!.elapsedSeconds) && v!.elapsedSeconds >= 0, 'INVALID_JOB_STATUS');
  return { id: v!.id as string, state: v!.state as ComputeJob['state'], processStopped: v!.processStopped as boolean, elapsedSeconds: v!.elapsedSeconds as number };
}
export function parseSubmission(value: unknown): string {
  requireValue(!!value && typeof value === 'object' && jobId((value as { id?: unknown }).id), 'INVALID_SUBMISSION');
  return (value as { id: string }).id;
}
export const snapshotText = (snapshot: ProfileSnapshot) => JSON.stringify(parseProfileSnapshot(snapshot), null, 2) + '\n';
export async function snapshotDigest(snapshot: ProfileSnapshot): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshotText(snapshot))))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function parseUpload(text: string): Promise<RunUpload> {
  requireValue(new TextEncoder().encode(text).length <= UPLOAD_LIMIT, 'UPLOAD_TOO_LARGE');
  const v = JSON.parse(text);
  requireValue(v && !Array.isArray(v) && v.schema === 'torax-run-upload.v1' && Object.keys(v).length === 3 && Object.keys(v).every(k => ['schema', 'spec', 'snapshot'].includes(k)), 'INVALID_UPLOAD');
  const spec = parseEngineSpec(v.spec), snapshot = v.snapshot === null ? null : parseProfileSnapshot(v.snapshot);
  requireValue((snapshot === null) === (spec.input === null), 'SNAPSHOT_BINDING');
  if (snapshot) requireValue(await snapshotDigest(snapshot) === spec.input?.profileSnapshotSha256, 'SNAPSHOT_BINDING');
  return { schema: 'torax-run-upload.v1', spec, snapshot };
}
export function matchResult(value: unknown, id: string, spec?: EngineRunSpec): TransportResult {
  const r = parseTransportResult(value);
  requireValue(r.id === id && r.engine.id === 'torax', 'RESULT_IDENTITY');
  if (spec) requireValue(r.recipe === spec.recipe && r.engine.commit === spec.engine.commit && r.parameters.duration === spec.parameters.duration && r.parameters.radialCells === spec.parameters.radialCells && r.parameters.heatingScale === spec.parameters.heatingScale && (r.lineage?.snapshotSha256 ?? null) === (spec.input?.profileSnapshotSha256 ?? null), 'RESULT_SPEC_MISMATCH');
  return r;
}
export async function requestCompute(endpoint: string, token: string, route: string, options: { body?: string; method?: string; key?: string; signal?: AbortSignal } = {}): Promise<unknown> {
  const origin = normalizeEndpoint(endpoint);
  requireValue(token.length >= 32, 'AUTH_REQUIRED');
  requireValue(/^\/v1\/(catalog|inputs\/fuse-profile|validate|jobs(?:\/torax-[a-zA-Z0-9._-]+(?:\/(?:result|geometry|cancel))?)?)$/.test(route), 'INVALID_COMPUTE_ROUTE');
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000);
  const init: RequestInit & { targetAddressSpace?: string } = {
    method: options.method ?? 'GET', body: options.body, signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.key ? { 'Idempotency-Key': options.key } : {}) },
    ...(['localhost', '127.0.0.1'].includes(new URL(origin).hostname) ? { targetAddressSpace: 'local' } : {}),
  };
  const response = await fetch(origin + route, init);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('EMPTY_RESPONSE');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 24_000_000) throw new Error('RESPONSE_TOO_LARGE'); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const raw = new Uint8Array(size); let offset = 0;
  for (const c of chunks) { raw.set(c, offset); offset += c.length; }
  const value = JSON.parse(new TextDecoder().decode(raw));
  if (!response.ok) throw new Error(typeof value.error === 'string' && /^[A-Z0-9_]+$/.test(value.error) ? value.error : `HTTP_${response.status}`);
  return value;
}
