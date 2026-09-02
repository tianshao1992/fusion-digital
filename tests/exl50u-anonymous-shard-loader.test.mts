import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  ANONYMOUS_SHARD_BUNDLE_FORMAT,
  ANONYMOUS_SHARD_REQUIRED_EXTENSIONS,
  EXL50U_ANONYMOUS_SHARD_COUNT,
  EXL50U_GA_VISUALIZATION_ROOT,
  MAX_ANONYMOUS_DELIVERY_BYTES,
  MAX_ANONYMOUS_PREVIEW_BYTES,
  MAX_ANONYMOUS_PREVIEW_DECODED_BYTES,
  MAX_ANONYMOUS_SHARD_PLACEMENT_INSTANCES,
  parseDeviceManifest,
  type DeviceAnonymousShardBundle,
  type DeviceAnonymousShardModel,
  type DeviceWebModel,
} from '../app/components/deviceManifest';
import {
  loadAnonymousDeviceModelWithFallback,
  loadVerifiedAnonymousShardBundle,
} from '../app/components/device-viewer/componentModelLoader';

class FakeNode {
  name = '';
  children: FakeNode[] = [];
  isMesh?: boolean;
  isInstancedMesh?: boolean;
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

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function glbBytes(
  marker: number,
  instanced: boolean,
  mutate?: (document: Record<string, unknown>, node: Record<string, unknown>) => void,
) {
  const node: Record<string, unknown> = {};
  const document: Record<string, unknown> = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 4 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [node],
  };
  document.extensionsUsed = instanced
    ? [...ANONYMOUS_SHARD_REQUIRED_EXTENSIONS]
    : ['EXT_meshopt_compression'];
  document.extensionsRequired = instanced
    ? [...ANONYMOUS_SHARD_REQUIRED_EXTENSIONS]
    : ['EXT_meshopt_compression'];
  document.bufferViews = [{
    extensions: { EXT_meshopt_compression: { buffer: 0, byteOffset: 0, byteLength: 4, byteStride: 4, count: 1, mode: 'ATTRIBUTES' } },
  }];
  if (instanced) {
    node.extensions = { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 0 } } };
  }
  mutate?.(document, node);
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

function renderableScene(instanced: boolean, counters?: { geometry: number; material: number }) {
  const scene = new FakeNode();
  const root = new FakeNode();
  root.name = 'node_0';
  const mesh = new FakeNode();
  mesh.name = 'mesh_0';
  mesh.isMesh = true;
  mesh.isInstancedMesh = instanced;
  mesh.geometry = { dispose: () => { if (counters) counters.geometry += 1; } };
  mesh.material = { dispose: () => { if (counters) counters.material += 1; } };
  root.add(mesh);
  scene.add(root);
  return scene;
}

function response(bytes: Uint8Array, contentLength = bytes.byteLength) {
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, { headers: { 'Content-Length': String(contentLength) } });
}

function previewAsset(bytes = glbBytes(0, false)): DeviceWebModel {
  const digest = sha256(bytes);
  return {
    path: `/device-assets/exl50u-general-assembly/v1/device.preview.${digest}.meshopt.glb`,
    format: 'glTF 2.0 binary + EXT_meshopt_compression; anonymous browser preview',
    sha256: digest,
    bytes: bytes.byteLength,
    triangles: 10,
    vertices: 30,
    decodedGpuBytes: 1_024,
    boundsMetres: { min: [-1, -1, -1], max: [1, 1, 1] },
  };
}

function shard(index: number, bytes = glbBytes(index, true)): DeviceAnonymousShardModel {
  const digest = sha256(bytes);
  const suffix = String(index).padStart(2, '0');
  return {
    id: `anonymous-shard-${suffix}`,
    index,
    path: `/device-assets/exl50u-general-assembly/v1/anonymous-shard-${suffix}.${digest}.high.meshopt.glb`,
    sha256: digest,
    bytes: bytes.byteLength,
    uniqueGeometryMeshes: 1,
    uniqueGeometryTriangles: 10,
    uniqueGeometryVertices: 30,
    placementInstances: 2,
    drawCalls: 1,
    sceneDrawTriangles: 20,
    decodedGpuBytes: 2_048,
    boundsMetres: { min: [-1, -1, -1], max: [1, 1, 1] },
  };
}

function shardBundle(shards = Array.from({ length: EXL50U_ANONYMOUS_SHARD_COUNT }, (_, index) => shard(index + 1))): DeviceAnonymousShardBundle {
  const sum = (field: keyof DeviceAnonymousShardModel) => shards.reduce((total, asset) => total + Number(asset[field]), 0);
  return {
    id: 'exl50u-ga-anonymous-high-v1',
    label: '匿名高精度分片',
    quality: 'high',
    delivery: 'shards',
    format: ANONYMOUS_SHARD_BUNDLE_FORMAT,
    rootNodeName: EXL50U_GA_VISUALIZATION_ROOT,
    extensionsRequired: [...ANONYMOUS_SHARD_REQUIRED_EXTENSIONS],
    grouping: {
      kind: 'anonymous-transport',
      engineeringSemantic: false,
      engineeringUseAllowed: false,
      representsBom: false,
      representsEngineeringSystems: false,
      representsAssemblyTree: false,
    },
    bytes: sum('bytes'),
    uniqueGeometryMeshes: sum('uniqueGeometryMeshes'),
    uniqueGeometryTriangles: sum('uniqueGeometryTriangles'),
    uniqueGeometryVertices: sum('uniqueGeometryVertices'),
    placementInstances: sum('placementInstances'),
    drawCalls: sum('drawCalls'),
    sceneDrawTriangles: sum('sceneDrawTriangles'),
    decodedGpuBytes: sum('decodedGpuBytes'),
    boundsMetres: { min: [-1, -1, -1], max: [1, 1, 1] },
    shards,
  };
}

function manifestCandidate() {
  const preview = previewAsset();
  return {
    $schema: '/models/device-manifest.schema.json',
    schemaVersion: '1.4',
    id: 'exl50u-general-assembly-v1',
    title: 'EXL-50U integrated assembly anonymous browser visualization derivative',
    asOf: '2026-09-02',
    devicePackage: {
      kind: 'public-simplified-derivative',
      deviceClass: 'EXL-50U integrated-assembly visualization',
      authority: 'illustrative',
      replacementContract: ['anonymous browser transport groups only; no engineering assembly semantics'],
    },
    access: {
      classification: 'PUBLIC',
      redistributionAllowed: true,
      engineeringUseAllowed: false,
      statement: 'Anonymous visualization derivative only; it is not an engineering model or assembly authority.',
    },
    coordinateSystem: { linearUnit: 'metre', upAxis: 'Y', handedness: 'right', sourceToWebScale: 1 },
    derivationEvidence: {
      kind: 'anonymous-public-derivative',
      selectedAttempt: 1,
      selectedRatios: { preview: 0.1, high: 0.4 },
      qem: {
        receiptCount: 40,
        receiptSha256: 'b'.repeat(64),
        targetMissCount: 2,
        retainedIrreducibleCount: 2,
      },
      coverage: {
        renderableDefinitions: 20,
        renderableOccurrences: 40,
        skippedDefinitions: 2,
        skippedOccurrences: 3,
        sourceDefinitions: 22,
        sourceOccurrences: 43,
        previewMissingDefinitions: 0,
        previewMissingOccurrences: 0,
        highMissingDefinitions: 0,
        highMissingOccurrences: 0,
      },
    },
    assets: { webModel: preview, shardBundles: [shardBundle()] },
    systems: [{
      id: 'visualization',
      title: '总装外观',
      shortTitle: '总装',
      category: 'structure',
      color: '#AAB5B2',
      description: 'Anonymous visualization surface without BOM or engineering-system meaning.',
      parts: [{
        id: 'EXL50U-GA-VISUALIZATION',
        title: '总装外观',
        nodeName: EXL50U_GA_VISUALIZATION_ROOT,
        description: 'One controlled visualization root only.',
        engineeringTag: 'VISUALIZATION_ONLY_NOT_ENGINEERING',
      }],
    }],
    generator: {
      name: 'FusionDigital anonymous assembly derivative builder',
      version: '1.0.0',
      repository: 'https://github.com/tianshao1992/fusion-digital',
      license: 'Project-owner-authorized public visualization derivative',
      licenseUrl: '/models/exl50u-general-assembly-v1/PUBLICATION-NOTICE.md',
      conversion: {
        pipeline: 'anonymous instanced shard derivation',
        converter: 'FusionDigital anonymous shard builder',
        converterVersion: '1.0.0',
      },
    },
    disclaimer: 'Illustrative anonymous browser visualization only; not for design, manufacturing, metrology, safety, analysis or operational decisions.',
  };
}

test('manifest 1.4 accepts only the controlled 20-shard anonymous transport contract', async () => {
  const candidate = manifestCandidate();
  const parsed = parseDeviceManifest(candidate, {
    manifestUrl: '/models/exl50u-general-assembly-v1/model-manifest.json',
  });
  assert.equal(parsed.schemaVersion, '1.4');
  assert.equal(parsed.assets.shardBundles?.[0]?.shards.length, 20);
  assert.equal(parsed.assets.shardBundles?.[0]?.rootNodeName, EXL50U_GA_VISUALIZATION_ROOT);
  assert.deepEqual(parsed.assets.shardBundles?.[0]?.grouping, {
    kind: 'anonymous-transport',
    engineeringSemantic: false,
    engineeringUseAllowed: false,
    representsBom: false,
    representsEngineeringSystems: false,
    representsAssemblyTree: false,
  });

  const schema = JSON.parse(await readFile(new URL('../public/models/device-manifest.schema.json', import.meta.url), 'utf8'));
  assert.ok(schema.properties.schemaVersion.enum.includes('1.4'));
  assert.equal(schema.$defs.anonymousShardBundle.properties.shards.minItems, 20);
  assert.equal(schema.$defs.anonymousShardBundle.properties.sceneDrawTriangles.maximum, 30_000_000);
  assert.equal(schema.$defs.anonymousShardBundle.properties.drawCalls.maximum, 800);
  assert.equal(schema.$defs.anonymousShardModel.properties.sceneDrawTriangles.maximum, 30_000_000);
  assert.equal(schema.$defs.anonymousShardModel.properties.drawCalls.maximum, 800);
  assert.equal(schema.$defs.anonymousShardModel.properties.placementInstances.maximum, 250_000);
  assert.equal(schema.$defs.anonymousShardBundle.properties.placementInstances.maximum, 5_000_000);
  assert.equal(schema.$defs.anonymousDerivationEvidence.properties.qem.properties.receiptCount.minimum, 1);
  assert.equal(schema.$defs.componentBundle.properties.delivery.const, 'components', 'ITER 1.3 component contract remains exact');
  const shardConditional = schema.allOf.find((entry: { then?: { properties?: { access?: unknown } } }) => entry.then?.properties?.access);
  const shardAccessPolicy = shardConditional?.then?.properties?.access as {
    properties?: Record<string, { const?: unknown }>;
  } | undefined;
  assert.equal(shardAccessPolicy?.properties?.classification?.const, 'PUBLIC');
  assert.equal(shardAccessPolicy?.properties?.redistributionAllowed?.const, true);
  assert.equal(shardAccessPolicy?.properties?.engineeringUseAllowed?.const, false);
});

test('manifest 1.4 fails closed on identity, semantics, ordering, digest, budget and extension drift', () => {
  const mutations: Array<(candidate: ReturnType<typeof manifestCandidate>) => void> = [
    (candidate) => { candidate.schemaVersion = '1.3'; },
    (candidate) => { candidate.id = 'another-device'; },
    (candidate) => { candidate.access.classification = 'INTERNAL'; },
    (candidate) => { candidate.access.redistributionAllowed = false; },
    (candidate) => { candidate.access.engineeringUseAllowed = true; },
    (candidate) => { candidate.assets.shardBundles[0].rootNodeName = 'EXL50U_GA_PART__host-system' as never; },
    (candidate) => { candidate.assets.shardBundles[0].grouping.engineeringSemantic = true as never; },
    (candidate) => { candidate.assets.shardBundles[0].grouping.representsBom = true as never; },
    (candidate) => { candidate.assets.shardBundles[0].extensionsRequired = ['EXT_meshopt_compression', 'EXT_mesh_gpu_instancing'] as never; },
    (candidate) => { candidate.assets.shardBundles[0].shards.pop(); },
    (candidate) => { candidate.assets.shardBundles[0].shards[0].index = 2; },
    (candidate) => { candidate.assets.shardBundles[0].shards[0].path = candidate.assets.shardBundles[0].shards[0].path.replace(/[a-f0-9]{64}/, 'f'.repeat(64)); },
    (candidate) => { candidate.assets.shardBundles[0].bytes += 1; },
    (candidate) => { candidate.assets.webModel.bytes = MAX_ANONYMOUS_PREVIEW_BYTES + 1; },
    (candidate) => { candidate.assets.webModel.decodedGpuBytes = MAX_ANONYMOUS_PREVIEW_DECODED_BYTES + 1; },
    (candidate) => {
      const shard = candidate.assets.shardBundles[0].shards[0];
      const increase = MAX_ANONYMOUS_SHARD_PLACEMENT_INSTANCES + 1 - shard.placementInstances;
      shard.placementInstances += increase;
      candidate.assets.shardBundles[0].placementInstances += increase;
    },
    (candidate) => { candidate.derivationEvidence.coverage.previewMissingDefinitions = 1; },
    (candidate) => { candidate.derivationEvidence.coverage.sourceOccurrences += 1; },
    (candidate) => { candidate.derivationEvidence.qem.retainedIrreducibleCount += 1; },
    (candidate) => { candidate.assets.shardBundles[0].sceneDrawTriangles = 30_000_001; },
    (candidate) => { candidate.assets.shardBundles[0].drawCalls = 801; },
  ];
  for (const mutate of mutations) {
    const candidate = manifestCandidate();
    mutate(candidate);
    assert.throws(() => parseDeviceManifest(candidate, {
      manifestUrl: '/models/exl50u-general-assembly-v1/model-manifest.json',
    }));
  }

  const oversized = manifestCandidate();
  oversized.assets.webModel.bytes = MAX_ANONYMOUS_DELIVERY_BYTES;
  assert.throws(() => parseDeviceManifest(oversized), /预算|合同/);

  const sourceCad = manifestCandidate() as ReturnType<typeof manifestCandidate> & { assets: Record<string, unknown> };
  sourceCad.assets.sourceCad = { ...sourceCad.assets.webModel };
  assert.throws(() => parseDeviceManifest(sourceCad), /仅允许/);
});

test('anonymous shard loader preallocates verified bytes and serializes all 20 decodes', async () => {
  const bundle = shardBundle();
  const bytesByPath = new Map(bundle.shards.map((asset) => [asset.path, glbBytes(asset.index, true)]));
  const originalFetch = globalThis.fetch;
  let activeParsers = 0;
  let maximumParsers = 0;
  const order: number[] = [];
  const progress: number[] = [];
  globalThis.fetch = (async (input) => response(bytesByPath.get(String(input))!)) as typeof fetch;
  try {
    const result = await loadVerifiedAnonymousShardBundle(bundle, {
      loader: {
        parseAsync: async (buffer: ArrayBuffer) => {
          const marker = new Uint8Array(buffer).at(-4) ?? 0;
          activeParsers += 1;
          maximumParsers = Math.max(maximumParsers, activeParsers);
          await new Promise((resolve) => setTimeout(resolve, 1));
          order.push(marker);
          activeParsers -= 1;
          return { scene: renderableScene(true) };
        },
      } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
      onProgress: ({ loadedBytes, totalBytes }) => {
        assert.ok(loadedBytes >= 0 && loadedBytes <= totalBytes);
        progress.push(loadedBytes);
      },
    });
    assert.equal((result as unknown as FakeNode).children.length, 20);
    const namedNodes: string[] = [];
    (result as unknown as FakeNode).traverse((node) => { if (node.name) namedNodes.push(node.name); });
    assert.deepEqual(namedNodes, [EXL50U_GA_VISUALIZATION_ROOT]);
    assert.equal(maximumParsers, 1);
    assert.deepEqual(order, Array.from({ length: 20 }, (_, index) => index + 1));
    assert.equal(progress.at(-1), bundle.bytes);
    assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('anonymous device loader defaults to preview and falls back after a high-detail integrity failure', async () => {
  const previewBytes = glbBytes(0, false);
  const preview = previewAsset(previewBytes);
  const bundle = shardBundle();
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  try {
    globalThis.fetch = (async (input) => {
      requested.push(String(input));
      return response(previewBytes);
    }) as typeof fetch;
    const defaultResult = await loadAnonymousDeviceModelWithFallback(preview, bundle, {
      loader: { parseAsync: async () => ({ scene: renderableScene(false) }) } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
    });
    assert.equal(defaultResult.quality, 'preview');
    assert.equal(defaultResult.fallbackUsed, false);
    assert.deepEqual(requested, [preview.path]);
    const previewNames: string[] = [];
    (defaultResult.model as unknown as FakeNode).traverse((node) => {
      if (node.name) previewNames.push(node.name);
    });
    assert.deepEqual(previewNames, [EXL50U_GA_VISUALIZATION_ROOT]);

    requested.length = 0;
    let fallbackError: Error | undefined;
    globalThis.fetch = (async (input) => {
      const path = String(input);
      requested.push(path);
      if (path === preview.path) return response(previewBytes);
      const expected = glbBytes(1, true);
      const corrupt = new Uint8Array(expected);
      corrupt[corrupt.length - 1] ^= 0xff;
      return response(corrupt);
    }) as typeof fetch;
    const fallbackResult = await loadAnonymousDeviceModelWithFallback(preview, bundle, {
      loader: { parseAsync: async () => ({ scene: renderableScene(false) }) } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
      requestedQuality: 'high',
      userInitiatedHighDetail: true,
      onFallback: (error) => { fallbackError = error; },
    });
    assert.equal(fallbackResult.quality, 'preview');
    assert.equal(fallbackResult.fallbackUsed, true);
    assert.match(fallbackError?.message ?? '', /SHA-256 mismatch/);
    assert.deepEqual(requested, [bundle.shards[0].path, preview.path]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('high-detail fallback disposes every completed shard before loading preview', async () => {
  const previewBytes = glbBytes(0, false);
  const preview = previewAsset(previewBytes);
  const bundle = shardBundle();
  const counters = { geometry: 0, material: 0 };
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (input) => {
      const path = String(input);
      if (path === preview.path) return response(previewBytes);
      const asset = bundle.shards.find((candidate) => candidate.path === path)!;
      const bytes = glbBytes(asset.index, true);
      if (asset.index === 2) bytes[bytes.length - 1] ^= 0xff;
      return response(bytes);
    }) as typeof fetch;
    const result = await loadAnonymousDeviceModelWithFallback(preview, bundle, {
      loader: {
        parseAsync: async (bytes: ArrayBuffer) => ({
          scene: renderableScene((new Uint8Array(bytes).at(-4) ?? 0) !== 0, counters),
        }),
      } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
      requestedQuality: 'high',
      userInitiatedHighDetail: true,
    });
    assert.equal(result.quality, 'preview');
    assert.equal(result.fallbackUsed, true);
    assert.deepEqual(counters, { geometry: 1, material: 1 }, 'the first decoded high shard is disposed before preview settles');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('anonymous shard loader recognizes required GPU instancing and never converts abort into fallback', async () => {
  const previewBytes = glbBytes(0, false);
  const preview = previewAsset(previewBytes);
  const missingExtensionBytes = glbBytes(1, false);
  const badFirst = shard(1, missingExtensionBytes);
  const rest = Array.from({ length: 19 }, (_, index) => shard(index + 2));
  const invalidBundle = shardBundle([badFirst, ...rest]);
  const originalFetch = globalThis.fetch;
  let parseCalls = 0;
  try {
    globalThis.fetch = (async () => response(missingExtensionBytes)) as typeof fetch;
    await assert.rejects(loadVerifiedAnonymousShardBundle(invalidBundle, {
      loader: { parseAsync: async () => { parseCalls += 1; return { scene: renderableScene(true) }; } } as never,
      createGroup: () => new FakeNode() as never,
      signal: new AbortController().signal,
    }), /EXT_mesh_gpu_instancing/);
    assert.equal(parseCalls, 0);

    const controller = new AbortController();
    controller.abort();
    let fallbackCalled = false;
    await assert.rejects(loadAnonymousDeviceModelWithFallback(preview, shardBundle(), {
      loader: { parseAsync: async () => ({ scene: renderableScene(true) }) } as never,
      createGroup: () => new FakeNode() as never,
      signal: controller.signal,
      requestedQuality: 'high',
      userInitiatedHighDetail: true,
      onFallback: () => { fallbackCalled = true; },
    }), (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
    assert.equal(fallbackCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('anonymous transport rejects embedded names and multiple scene roots before decode', async () => {
  const namedBytes = glbBytes(1, true, (_document, node) => { node.name = 'source-part-name'; });
  const multipleRootsBytes = glbBytes(1, true, (document) => {
    document.scenes = [{ nodes: [0, 0] }];
  });
  const originalFetch = globalThis.fetch;
  let parseCalls = 0;
  try {
    for (const [bytes, pattern] of [
      [namedBytes, /forbidden identifying metadata/],
      [multipleRootsBytes, /one default scene and one anonymous root/],
    ] as const) {
      const first = shard(1, bytes);
      const candidate = shardBundle([first, ...Array.from({ length: 19 }, (_, index) => shard(index + 2))]);
      globalThis.fetch = (async () => response(bytes)) as typeof fetch;
      await assert.rejects(loadVerifiedAnonymousShardBundle(candidate, {
        loader: {
          parseAsync: async () => {
            parseCalls += 1;
            return { scene: renderableScene(true) };
          },
        } as never,
        createGroup: () => new FakeNode() as never,
        signal: new AbortController().signal,
      }), pattern);
    }
    assert.equal(parseCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
