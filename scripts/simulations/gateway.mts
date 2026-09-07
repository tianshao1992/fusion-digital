// Loopback-bound execution gateway; remote browsers reach it only through an
// explicitly configured HTTPS reverse proxy or private tunnel.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { engines, recipes } from '../../app/simulations/platform/catalog.ts';
import { parseEngineSpec } from '../../app/simulations/platform/contracts.ts';
import { parseRunSpec } from '../../app/simulations/run-spec.ts';
import * as runtime from './engine-service.mts';
import * as fuseRuntime from './fuse-engine-service.mts';

const MAX_ALLOWED_ORIGINS = 16;

export function parseGatewayOrigins(value: string | readonly string[]): string[] {
  const entries = (typeof value === 'string' ? value.split(',') : [...value]).map(origin => origin.trim());
  if (entries.length === 0 || entries.length > MAX_ALLOWED_ORIGINS || entries.some(origin => !origin)) {
    throw new Error('GATEWAY_ORIGINS must contain between 1 and 16 exact origins');
  }
  const unique = new Set<string>();
  for (const origin of entries) {
    const originUrl = new URL(origin);
    const loopbackOrigin = originUrl.hostname === '127.0.0.1' || originUrl.hostname === 'localhost';
    if (originUrl.hostname.includes('*') || originUrl.origin !== origin || (originUrl.protocol !== 'https:' && !(originUrl.protocol === 'http:' && loopbackOrigin))) {
      throw new Error('GATEWAY_ORIGINS entries must be loopback HTTP or HTTPS exact origins');
    }
    if (unique.has(origin)) throw new Error('GATEWAY_ORIGINS entries must be unique');
    unique.add(origin);
  }
  return [...unique];
}

export function createGateway(token: string, allowedOrigins: string | readonly string[], service = runtime, fuseService = fuseRuntime, allowedHost?: string) {
  if (token.length < 32) throw new Error('GATEWAY_TOKEN must contain at least 32 characters');
  const allowedOriginSet = new Set(parseGatewayOrigins(allowedOrigins));
  if (allowedHost && (new URL(`http://${allowedHost}`).host !== allowedHost || /[/@]/.test(allowedHost))) throw new Error('GATEWAY_ALLOWED_HOST must be an exact host');
  const terminal = new Set(['succeeded', 'failed', 'timed-out', 'cancelled', 'collection-failed', 'reconciliation-required']);
  const idempotency = new Map<string, { bodyHash: string; id: string }>();
  let submitting = false;
  let activeJobId: string | null = null;
  const serviceForJob = (id: string) => id.startsWith('fuse-diiid-') ? fuseService : id.startsWith('torax-') ? service : null;
  return createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const reply = (code: number, value: unknown) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    const origin = req.headers.origin;
    if (origin && !allowedOriginSet.has(origin)) return reply(403, { error: 'ORIGIN_REJECTED' });
    const requestHost = req.headers.host ?? '';
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(requestHost) && requestHost !== allowedHost) return reply(403, { error: 'HOST_REJECTED' });
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const authorization = Buffer.from(req.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (authorization.length !== expected.length || !timingSafeEqual(authorization, expected)) return reply(401, { error: 'AUTH_REQUIRED' });
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.search) return reply(400, { error: 'QUERY_NOT_ALLOWED' });
      if (req.method === 'GET' && url.pathname === '/v1/catalog') return reply(200, { schema: 'engine-catalog.v1', engines, recipes, executionEngineIds: ['fuse', 'torax'], concurrency: 1 });
      if (req.method === 'GET' && url.pathname === '/v1/inputs/fuse-profile') return reply(200, await service.createFuseSnapshot());
      const match = /^\/v1\/jobs\/([a-zA-Z0-9._-]+)(?:\/(cancel|result|geometry))?$/.exec(url.pathname);
      const matchedService = match ? serviceForJob(match[1]) : null;
      if (match && !matchedService) return reply(400, { error: 'INVALID_JOB_ID' });
      if (match && req.method === 'GET' && !match[2]) return reply(200, await matchedService!.status(match[1]));
      if (match && req.method === 'GET' && match[2] === 'result') return reply(200, await matchedService!.collect(match[1]));
      if (match && req.method === 'GET' && match[2] === 'geometry') {
        if (!match[1].startsWith('torax-')) return reply(404, { error: 'NOT_FOUND' });
        return reply(200, await service.collectGeometry(match[1]));
      }
      if (match && req.method === 'POST' && match[2] === 'cancel') return reply(202, await matchedService!.cancel(match[1]));
      if (req.method === 'POST' && ['/v1/validate', '/v1/jobs'].includes(url.pathname)) {
        if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'JSON_REQUIRED' });
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 128000) return reply(413, { error: 'BODY_TOO_LARGE' }); chunks.push(chunk); }
        const raw = Buffer.concat(chunks), body = JSON.parse(raw.toString());
        if (!body || Object.keys(body).some(k => !['spec', 'snapshot'].includes(k))) return reply(400, { error: 'INVALID_ENVELOPE' });
        const isFuse = body.spec?.schema === 'simulation-runspec.v1';
        const spec = isFuse ? parseRunSpec(body.spec) : parseEngineSpec(body.spec);
        if (isFuse && body.snapshot !== undefined) throw new Error('FUSE_INPUT_NOT_SUPPORTED');
        if (!isFuse) await service.validateInput(spec, body.snapshot);
        if (url.pathname === '/v1/validate') return reply(200, { valid: true, spec });
        const key = req.headers['idempotency-key'];
        if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) return reply(400, { error: 'IDEMPOTENCY_KEY_REQUIRED' });
        const hash = service.sha(raw), previous = idempotency.get(key);
        if (previous) return reply(previous.bodyHash === hash ? 200 : 409, previous.bodyHash === hash ? { id: previous.id } : { error: 'IDEMPOTENCY_CONFLICT' });
        if (submitting) return reply(409, { error: 'SUBMISSION_IN_PROGRESS' });
        if (activeJobId) return reply(409, { error: 'ENGINE_BUSY' });
        if (idempotency.size >= 1000) return reply(503, { error: 'SESSION_CAPACITY_REACHED' });
        submitting = true;
        try {
          const targetService = isFuse ? fuseService : service;
          const job = await targetService.submit(spec, body.snapshot);
          idempotency.set(key, { bodyHash: hash, id: job.id });
          activeJobId = job.id;
          job.completion.then(s => {
            if (terminal.has(s.state) && s.processStopped === true) {
              if (activeJobId === job.id) activeJobId = null;
            } else console.error('Job requires reconciliation:', job.id);
          }).catch(() => console.error('Job requires reconciliation:', job.id));
          return reply(202, { id: job.id, engineId: isFuse ? 'fuse' : 'torax' });
        } finally { submitting = false; }
      }
      reply(404, { error: 'NOT_FOUND' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const code = /^[A-Z][A-Z0-9_]{1,100}$/.test(message) ? message : 'REQUEST_FAILED';
      reply(code.includes('BUSY') || code.includes('SUCCEEDED') ? 409 : 400, { error: code });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.GATEWAY_PORT ?? 8791);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
  const origins = process.env.GATEWAY_ORIGINS ?? process.env.GATEWAY_ORIGIN ?? 'http://localhost:3012';
  const server = createGateway(process.env.GATEWAY_TOKEN ?? '', origins, runtime, fuseRuntime, process.env.GATEWAY_ALLOWED_HOST);
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.listen(port, '127.0.0.1', () => console.log(`Local simulation gateway: http://127.0.0.1:${port} (token required; concurrency 1)`));
}
