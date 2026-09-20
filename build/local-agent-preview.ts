import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

const ENDPOINT = '/api/agent/native';
const BODY_LIMIT = 512 * 1024;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

type LocalRequest = {
  method?: string;
  headers: IncomingHttpHeaders;
  socket: { remoteAddress?: string };
};

/** Validate the actual connection before a browser can use the host's model key. */
export function acceptsLocalAgentRequest(
  request: LocalRequest,
  address: Pick<AddressInfo, 'address' | 'port'> | null,
  environment: { NODE_ENV?: string; FUSIONDIGITAL_LOCAL_AGENT?: string } = process.env,
): boolean {
  if (environment.NODE_ENV !== 'development' || environment.FUSIONDIGITAL_LOCAL_AGENT !== '1') return false;
  if (!address || !LOOPBACK.has(address.address) || !LOOPBACK.has(request.socket.remoteAddress ?? '')) return false;
  if (Object.keys(request.headers).some((header) => header === 'forwarded' || header.startsWith('x-forwarded-'))) return false;
  const host = request.headers.host;
  const allowedHosts = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`, `[::1]:${address.port}`]);
  if (!host || !allowedHosts.has(host)) return false;
  if (!['GET', 'POST'].includes(request.method ?? '')) return false;
  if (request.headers['sec-fetch-site'] && request.headers['sec-fetch-site'] !== 'same-origin'
    && request.headers['sec-fetch-site'] !== 'none') return false;
  const origin = request.headers.origin;
  if (request.method === 'POST' && origin !== `http://${host}`) return false;
  return origin === undefined || origin === `http://${host}`;
}

function sendError(response: ServerResponse, status: number, message: string) {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify({ error: message }));
}

async function readBody(request: IncomingMessage, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    signal.throwIfAborted();
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > BODY_LIMIT) throw new RangeError('Request too large');
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Development-only Node endpoint. Credentials remain in the host process;
 * no Worker vars, Vite define replacements, client imports, or preview builds.
 */
export function localAgentPreview(): Plugin {
  return {
    name: 'fusiondigital-local-native-agent',
    apply: 'serve',
    enforce: 'pre',
    configureServer(server) {
      if (process.env.NODE_ENV !== 'development' || process.env.FUSIONDIGITAL_LOCAL_AGENT !== '1') return;
      // tsImport uses a fresh namespace per call. Keep one module per server so
      // model runs and their session ownership survive successive HTTP turns.
      let nativeModule: Promise<{ handleNativeAgent: (input: Request) => Promise<Response> }> | undefined;
      const loadNativeModule = () => {
        nativeModule ??= import('tsx/esm/api').then(({ tsImport }) => {
          const moduleUrl = pathToFileURL(resolve(server.config.root, 'app/api/agent/native-runtime.ts')).href;
          return tsImport(moduleUrl, {
            parentURL: pathToFileURL(resolve(server.config.root, 'vite.config.ts')).href,
            tsconfig: resolve(server.config.root, 'tsconfig.json'),
          });
        }).catch((error: unknown) => { nativeModule = undefined; throw error; });
        return nativeModule;
      };
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== ENDPOINT) return next();
        const address = server.httpServer?.address();
        if (!acceptsLocalAgentRequest(request, typeof address === 'object' ? address : null)) {
          sendError(response, 403, 'Local agent access denied.');
          return;
        }
        if (request.method === 'POST' && !request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
          sendError(response, 415, 'JSON request required.');
          return;
        }
        const abort = new AbortController();
        const timeout = setTimeout(() => abort.abort(), 120_000);
        request.once('aborted', () => abort.abort());
        response.once('close', () => { if (!response.writableEnded) abort.abort(); });
        void (async () => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(request.headers)) {
            if (typeof value === 'string') headers.set(key, value);
            else if (value) headers.set(key, value.join(', '));
          }
          const body = request.method === 'POST' ? await readBody(request, abort.signal) : undefined;
          const input = new Request(`http://${request.headers.host}${ENDPOINT}`, {
            method: request.method,
            headers,
            body,
            signal: abort.signal,
          });
          // Loading outside the Vite/Worker module graph prevents environment
          // substitution and lets the native handler read server-only env vars.
          const handler = await loadNativeModule();
          const result: Response = await handler.handleNativeAgent(input);
          response.statusCode = result.status;
          result.headers.forEach((value, key) => response.setHeader(key, value));
          response.setHeader('Cache-Control', 'no-store');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          const reader = result.body?.getReader();
          if (reader) {
            try {
              while (true) {
                abort.signal.throwIfAborted();
                const { done, value } = await reader.read();
                if (done) break;
                response.write(value);
              }
            } finally { await reader.cancel().catch(() => undefined); }
          }
          response.end();
        })().catch((error: unknown) => {
          if (response.destroyed) return;
          if (response.headersSent) { response.destroy(); return; }
          if (error instanceof RangeError) sendError(response, 413, 'Request too large.');
          else if (abort.signal.aborted) sendError(response, 504, 'Local agent request timed out.');
          else sendError(response, 503, 'Local agent unavailable.');
        }).finally(() => clearTimeout(timeout));
      });
    },
  };
}
