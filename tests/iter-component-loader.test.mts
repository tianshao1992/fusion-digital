import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { DeviceComponentBundle, DeviceComponentModel, DeviceWebModel } from '../app/components/deviceManifest';
import { createSerialTaskGate, loadVerifiedComponentBundle, loadVerifiedMonolithicModel } from '../app/components/device-viewer/componentModelLoader';

class FakeNode {
  name = '';
  children: FakeNode[] = [];
  isMesh?: boolean;
  geometry?: { dispose(): void };
  material?: { dispose(): void } | Array<{ dispose(): void }>;

  add(...nodes: FakeNode[]) {
    this.children.push(...nodes);
    return this;
  }

  traverse(callback: (node: FakeNode) => void) {
    callback(this);
    this.children.forEach((child) => child.traverse(callback));
  }
}

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function glbBytes(
  marker: number,
  external: 'buffer' | 'image' | null = null,
  meshoptFallback = false,
) {
  const document: Record<string, unknown> = {
    asset: { version: '2.0', extras: { marker } },
    buffers: [{ byteLength: 4 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ name: `marker-${marker}` }],
  };
  if (meshoptFallback) {
    document.buffers = [
      { byteLength: 4 },
      { byteLength: 64, extensions: { EXT_meshopt_compression: { fallback: true } } },
    ];
  }
  if (external === 'buffer') document.buffers = [{ byteLength: 4, uri: '/unreviewed.bin' }];
  if (external === 'image') document.images = [{ uri: '/unreviewed.png' }];
  const encoded = Buffer.from(JSON.stringify(document), 'utf8');
  const jsonPadding = (4 - (encoded.byteLength % 4)) % 4;
  const json = Buffer.concat([encoded, Buffer.alloc(jsonPadding, 0x20)]);
  const binary = Buffer.from([marker, 0, 0, 0]);
  const result = Buffer.alloc(20 + json.byteLength + 8 + binary.byteLength);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.byteLength, 8);
  result.writeUInt32LE(json.byteLength, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  json.copy(result, 20);
  result.writeUInt32LE(binary.byteLength, 20 + json.byteLength);
  result.writeUInt32LE(0x004e4942, 24 + json.byteLength);
  binary.copy(result, 28 + json.byteLength);
  return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
}

function glbMarker(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const jsonLength = view.getUint32(12, true);
  const document = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)).trimEnd());
  return document.asset.extras.marker as number;
}

function component(partId: string, byte: number): DeviceComponentModel {
  const bytes = glbBytes(byte);
  return {
    partId,
    nodeName: `ITER_PART__${partId}`,
    path: `/device-assets/iter-high-detail/${partId}.high.meshopt.glb`,
    format: 'glTF 2.0 binary + Meshopt',
    sha256: digest(bytes),
    bytes: bytes.byteLength,
    triangles: 1,
    vertices: 3,
    sceneDrawTriangles: 1,
    sceneDrawVertices: 3,
    meshInstances: 1,
    decodedGpuBytes: 42,
    boundsMetres: { min: [0, 0, 0], max: [1, 1, 1] },
  };
}

function bundle(components: DeviceComponentModel[]): DeviceComponentBundle {
  return {
    id: 'iter-high-test',
    label: 'HIGH',
    quality: 'high',
    delivery: 'components',
    format: components[0]?.format ?? 'glTF 2.0 binary + Meshopt',
    bytes: components.reduce((sum, asset) => sum + asset.bytes, 0),
    triangles: components.reduce((sum, asset) => sum + (asset.triangles ?? 0), 0),
    vertices: components.reduce((sum, asset) => sum + (asset.vertices ?? 0), 0),
    sceneDrawTriangles: components.reduce((sum, asset) => sum + asset.sceneDrawTriangles, 0),
    sceneDrawVertices: components.reduce((sum, asset) => sum + asset.sceneDrawVertices, 0),
    meshInstances: components.reduce((sum, asset) => sum + asset.meshInstances, 0),
    decodedGpuBytes: components.reduce((sum, asset) => sum + (asset.decodedGpuBytes ?? 0), 0),
    boundsMetres: { min: [0, 0, 0], max: [1, 1, 1] },
    components,
  };
}

function renderableScene(nodeName: string, counters?: { geometry: number; material: number }) {
  const root = new FakeNode();
  const stable = new FakeNode();
  stable.name = nodeName;
  const mesh = new FakeNode();
  mesh.isMesh = true;
  mesh.geometry = { dispose: () => { if (counters) counters.geometry += 1; } };
  mesh.material = { dispose: () => { if (counters) counters.material += 1; } };
  stable.add(mesh);
  root.add(stable);
  return root;
}

function response(bytes: Uint8Array, contentLength = bytes.byteLength) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { 'Content-Length': String(contentLength) } });
}

function requestUrl(input: string | URL | Request) {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

test('component loader verifies bytes and reports bounded monotonic progress', async () => {
  const assets = [component('a', 1), component('b', 2)];
  const progress: number[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const path = requestUrl(input);
    return response(glbBytes(path.includes('/a.') ? 1 : 2));
  }) as typeof fetch;
  try {
    const result = await loadVerifiedComponentBundle(bundle(assets), {
      loader: {
        parseAsync: async (buffer: ArrayBuffer) => {
          const byte = glbMarker(buffer);
          return { scene: renderableScene(byte === 1 ? assets[0].nodeName : assets[1].nodeName) };
        },
      } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
      concurrency: 2,
      onProgress: (loaded, total) => {
        assert.ok(loaded >= 0 && loaded <= total);
        progress.push(loaded);
      },
    });
    assert.equal((result as unknown as FakeNode).children.length, 2);
    assert.equal(progress.at(-1), assets.reduce((sum, asset) => sum + asset.bytes, 0));
    assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('serial task gate prevents cancelled non-abortable decoders from overlapping a later generation', async () => {
  const gate = createSerialTaskGate();
  let active = 0;
  let maximumActive = 0;
  let releaseFirst = () => {};
  let markFirstStarted = () => {};
  const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve; });
  const firstBlocker = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const order: string[] = [];

  const first = gate.run(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    order.push('first:start');
    markFirstStarted();
    await firstBlocker;
    order.push('first:end');
    active -= 1;
  });
  await firstStarted;
  const second = gate.run(async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    order.push('second:start');
    active -= 1;
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(order, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(maximumActive, 1);
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start']);
});

test('component loader rejects declared and streamed byte overruns before parsing', async () => {
  const asset = component('a', 1);
  const originalFetch = globalThis.fetch;
  let parseCalls = 0;
  try {
    globalThis.fetch = (async () => response(new Uint8Array(asset.bytes + 1), asset.bytes + 1)) as typeof fetch;
    await assert.rejects(loadVerifiedComponentBundle(bundle([asset]), {
      loader: { parseAsync: async () => { parseCalls += 1; return { scene: renderableScene(asset.nodeName) }; } } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
    }), /invalid byte length/);

    let cancelled = false;
    globalThis.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(asset.bytes + 1)); },
      cancel() { cancelled = true; },
    }))) as typeof fetch;
    await assert.rejects(loadVerifiedComponentBundle(bundle([asset]), {
      loader: { parseAsync: async () => { parseCalls += 1; return { scene: renderableScene(asset.nodeName) }; } } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
    }), /exceeded its reviewed byte budget/);
    assert.equal(cancelled, true);
    assert.equal(parseCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('component loader disposes a late parser after another concurrent component fails', async () => {
  const assets = [component('a', 1), component('b', 2)];
  const counters = { geometry: 0, material: 0 };
  let resolveSecondStarted: (() => void) | undefined;
  const secondStarted = new Promise<void>((resolve) => { resolveSecondStarted = resolve; });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const path = requestUrl(input);
    return response(glbBytes(path.includes('/a.') ? 1 : 2));
  }) as typeof fetch;
  try {
    await assert.rejects(loadVerifiedComponentBundle(bundle(assets), {
      loader: {
        parseAsync: async (buffer: ArrayBuffer) => {
          const byte = glbMarker(buffer);
          if (byte === 1) {
            await secondStarted;
            throw new Error('first parser failed');
          }
          resolveSecondStarted?.();
          await new Promise((resolve) => setTimeout(resolve, 20));
          return { scene: renderableScene(assets[1].nodeName, counters) };
        },
      } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
      concurrency: 2,
    }), /first parser failed/);
    assert.deepEqual(counters, { geometry: 1, material: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('component loader rejects extra stable identities and empty reviewed parts', async () => {
  const asset = component('a', 1);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => response(glbBytes(1))) as typeof fetch;
  try {
    const extraRoot = renderableScene(asset.nodeName);
    const extraStable = new FakeNode();
    extraStable.name = 'ITER_PART__extra';
    extraRoot.add(extraStable);
    await assert.rejects(loadVerifiedComponentBundle(bundle([asset]), {
      loader: { parseAsync: async () => ({ scene: extraRoot }) } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
    }), /one reviewed stable node/);

    const emptyRoot = new FakeNode();
    const stable = new FakeNode();
    stable.name = asset.nodeName;
    emptyRoot.add(stable);
    await assert.rejects(loadVerifiedComponentBundle(bundle([asset]), {
      loader: { parseAsync: async () => ({ scene: emptyRoot }) } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
    }), /contains no renderable mesh/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('monolithic preview uses the same byte, digest and late-abort disposal boundary', async () => {
  const reviewedBytes = glbBytes(7, null, true);
  const asset: DeviceWebModel = {
    path: '/models/iter-public-simplified/preview.glb',
    format: 'glTF 2.0 binary + Meshopt',
    sha256: digest(reviewedBytes),
    bytes: reviewedBytes.byteLength,
    triangles: 1,
    vertices: 3,
    decodedGpuBytes: 42,
    boundsMetres: { min: [0, 0, 0], max: [1, 1, 1] },
  };
  const originalFetch = globalThis.fetch;
  let parseCalls = 0;
  try {
    globalThis.fetch = (async () => response(glbBytes(8, null, true))) as typeof fetch;
    await assert.rejects(loadVerifiedMonolithicModel(asset, {
      loader: { parseAsync: async () => { parseCalls += 1; return { scene: renderableScene('preview') }; } } as never,
      signal: new AbortController().signal,
    }), /SHA-256 mismatch/);
    assert.equal(parseCalls, 0);

    const counters = { geometry: 0, material: 0 };
    let markParserStarted = () => {};
    let releaseParser = () => {};
    const parserStarted = new Promise<void>((resolve) => { markParserStarted = resolve; });
    const parserBlocker = new Promise<void>((resolve) => { releaseParser = resolve; });
    globalThis.fetch = (async () => response(reviewedBytes)) as typeof fetch;
    const controller = new AbortController();
    const pending = loadVerifiedMonolithicModel(asset, {
      loader: {
        parseAsync: async () => {
          parseCalls += 1;
          markParserStarted();
          await parserBlocker;
          return { scene: renderableScene('preview', counters) };
        },
      } as never,
      signal: controller.signal,
    });
    await parserStarted;
    controller.abort();
    releaseParser();
    await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
    assert.deepEqual(counters, { geometry: 1, material: 1 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reviewed GLB containers reject external buffers and image URIs before parsing', async () => {
  const originalFetch = globalThis.fetch;
  let parseCalls = 0;
  try {
    for (const external of ['buffer', 'image'] as const) {
      const bytes = glbBytes(9, external);
      const asset: DeviceWebModel = {
        path: `/models/external-${external}.glb`,
        format: 'glTF 2.0 binary',
        sha256: digest(bytes),
        bytes: bytes.byteLength,
      };
      globalThis.fetch = (async () => response(bytes)) as typeof fetch;
      await assert.rejects(loadVerifiedMonolithicModel(asset, {
        loader: { parseAsync: async () => { parseCalls += 1; return { scene: renderableScene('unused') }; } } as never,
        signal: new AbortController().signal,
      }), external === 'buffer' ? /embedded BIN\/Meshopt-fallback payloads/ : /external image resource/);
    }
    assert.equal(parseCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
