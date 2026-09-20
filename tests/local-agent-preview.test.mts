import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { MinimalPluginContextWithoutEnvironment, ViteDevServer } from 'vite';
import { acceptsLocalAgentRequest, localAgentPreview } from '../build/local-agent-preview.ts';

const address = { address: '127.0.0.1', port: 5187 };
const environment = { NODE_ENV: 'development', FUSIONDIGITAL_LOCAL_AGENT: '1' };
const local = {
  method: 'POST',
  headers: { host: '127.0.0.1:5187', origin: 'http://127.0.0.1:5187', 'sec-fetch-site': 'same-origin' },
  socket: { remoteAddress: '127.0.0.1' },
};

test('local native agent requires explicit development opt-in', () => {
  assert.equal(acceptsLocalAgentRequest(local, address, environment), true);
  assert.equal(acceptsLocalAgentRequest(local, address, { ...environment, NODE_ENV: 'production' }), false);
  assert.equal(acceptsLocalAgentRequest(local, address, { NODE_ENV: 'development' }), false);
  assert.equal(localAgentPreview().apply, 'serve');
  assert.equal(localAgentPreview().configurePreviewServer, undefined);
});

test('native preview requires a real loopback connection and loopback listener', () => {
  assert.equal(acceptsLocalAgentRequest({ ...local, socket: { remoteAddress: '192.168.1.8' } }, address, environment), false);
  assert.equal(acceptsLocalAgentRequest(local, { ...address, address: '0.0.0.0' }, environment), false);
  assert.equal(acceptsLocalAgentRequest(local, null, environment), false);
  assert.equal(acceptsLocalAgentRequest({ ...local, socket: { remoteAddress: '::ffff:127.0.0.1' } }, address, environment), true);
});

test('native preview rejects DNS rebinding, foreign origins and ambiguous forwarded authority', () => {
  for (const headers of [
    { ...local.headers, host: 'evil.example:5187', origin: 'http://evil.example:5187' },
    { ...local.headers, host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' },
    { ...local.headers, origin: 'https://evil.example' },
    { ...local.headers, origin: undefined },
    { ...local.headers, 'sec-fetch-site': 'cross-site' },
    { ...local.headers, forwarded: 'host=127.0.0.1:5187' },
    { ...local.headers, 'x-forwarded-for': '127.0.0.1' },
  ]) {
    assert.equal(acceptsLocalAgentRequest({ ...local, headers }, address, environment), false);
  }
});

test('capability GET accepts direct local browsing but rejects cross-origin probing', () => {
  assert.equal(acceptsLocalAgentRequest({ ...local, method: 'GET', headers: { host: '127.0.0.1:5187' } }, address, environment), true);
  assert.equal(acceptsLocalAgentRequest({ ...local, method: 'GET', headers: { ...local.headers, origin: 'https://evil.example' } }, address, environment), false);
  assert.equal(acceptsLocalAgentRequest({ ...local, method: 'OPTIONS' }, address, environment), false);
});

test('successive middleware requests retain the same native module state', async () => {
  const artifacts = resolve(process.env.FUSIONDIGITAL_TEST_ARTIFACTS_DIR ?? join(tmpdir(), 'fusiondigital-native-preview-tests'));
  await mkdir(artifacts, { recursive: true });
  const root = await mkdtemp(join(artifacts, 'native-module-'));
  await mkdir(join(root, 'app/api/agent'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"module":"esnext"}}');
  await writeFile(join(root, 'app/api/agent/native-runtime.ts'), `
    let calls = 0;
    export async function handleNativeAgent() { return Response.json({ calls: ++calls }); }
  `);
  let middleware!: RequestListener;
  const server = createServer((request, response) => middleware(request, response));
  const originalMode = process.env.NODE_ENV;
  const originalOptIn = process.env.FUSIONDIGITAL_LOCAL_AGENT;
  const mutableEnv = process.env as Record<string, string | undefined>;
  mutableEnv.NODE_ENV = 'development';
  mutableEnv.FUSIONDIGITAL_LOCAL_AGENT = '1';
  try {
    const configure = localAgentPreview().configureServer;
    assert.equal(typeof configure, 'function');
    if (typeof configure !== 'function') throw new Error('Missing development middleware');
    configure.call({} as MinimalPluginContextWithoutEnvironment, { config: { root }, httpServer: server,
      middlewares: { use: (callback: RequestListener) => { middleware = callback; } },
    } as unknown as ViteDevServer);
    await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const first = await fetch(`${base}/api/agent/native`);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { calls: 1 });
    const second = await fetch(`${base}/api/agent/native`, {
      method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { calls: 2 });
    const denied = await fetch(`${base}/api/agent/native`, {
      method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(denied.status, 403);
  } finally {
    if (originalMode === undefined) delete mutableEnv.NODE_ENV; else mutableEnv.NODE_ENV = originalMode;
    if (originalOptIn === undefined) delete mutableEnv.FUSIONDIGITAL_LOCAL_AGENT; else mutableEnv.FUSIONDIGITAL_LOCAL_AGENT = originalOptIn;
    server.closeAllConnections();
    await new Promise<void>((accept) => server.close(() => accept()));
    // The only removed files are the generated fixture below this exact root.
    assert.equal(resolve(root).startsWith(`${artifacts}\\`) || resolve(root).startsWith(`${artifacts}/`), true);
    await rm(root, { recursive: true, force: true });
  }
});
