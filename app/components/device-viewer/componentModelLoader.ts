import type { Group, Object3D } from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  ANONYMOUS_SHARD_REQUIRED_EXTENSIONS,
  type DeviceAnonymousShardBundle,
  type DeviceAnonymousShardModel,
  type DeviceComponentBundle,
  type DeviceComponentModel,
  type DeviceWebModel,
} from '../deviceManifest';

type ComponentBundleLoadOptions = {
  loader: GLTFLoader;
  createGroup: () => Group;
  signal: AbortSignal;
  concurrency?: number;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
};

type MonolithicModelLoadOptions = {
  loader: GLTFLoader;
  signal: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
};

export type AnonymousShardLoadProgress = {
  quality: 'preview' | 'high';
  phase: 'download' | 'decode';
  loadedBytes: number;
  totalBytes: number;
  shardIndex: number | null;
  shardCount: number;
};

type AnonymousShardBundleLoadOptions = {
  loader: GLTFLoader;
  createGroup: () => Group;
  signal: AbortSignal;
  onProgress?: (progress: AnonymousShardLoadProgress) => void;
};

export type AnonymousDeviceModelLoadOptions = {
  loader: GLTFLoader;
  createGroup: () => Group;
  signal: AbortSignal;
  requestedQuality?: 'preview' | 'high';
  userInitiatedHighDetail?: boolean;
  onProgress?: (progress: AnonymousShardLoadProgress) => void;
  onFallback?: (highDetailError: Error) => void;
};

export type AnonymousDeviceModelLoadResult = {
  model: Object3D;
  quality: 'preview' | 'high';
  fallbackUsed: boolean;
  fallbackReason?: Error;
};

export type SerialTaskGate = {
  run<T>(task: () => Promise<T>): Promise<T>;
};

/**
 * Serializes non-abortable decode work across React effect generations. A
 * cancelled GLTF parse is allowed to settle and dispose before a later high
 * detail request begins, preventing rapid LOD toggles from multiplying peak
 * CPU/GPU memory.
 */
export function createSerialTaskGate(): SerialTaskGate {
  let tail = Promise.resolve();
  return {
    async run<T>(task: () => Promise<T>) {
      const previous = tail;
      let release = () => {};
      tail = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}

function abortError() {
  return new DOMException('Component model loading was aborted.', 'AbortError');
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

type EmbeddedGlbDocument = {
  buffers?: Array<{
    byteLength?: number;
    uri?: string;
    extensions?: { EXT_meshopt_compression?: { fallback?: boolean } };
  }>;
  bufferViews?: Array<{
    extensions?: { EXT_meshopt_compression?: unknown };
  }>;
  images?: Array<{ bufferView?: number; uri?: string }>;
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: Array<{
    extensions?: { EXT_mesh_gpu_instancing?: unknown };
  }>;
};

function assertSelfContainedGlb(bytes: ArrayBuffer, assetLabel: string) {
  const view = new DataView(bytes);
  if (bytes.byteLength < 28
    || view.getUint32(0, true) !== 0x46546c67
    || view.getUint32(4, true) !== 2
    || view.getUint32(8, true) !== bytes.byteLength
    || view.getUint32(16, true) !== 0x4e4f534a) {
    throw new Error(`Reviewed model ${assetLabel} is not a complete glTF 2.0 binary.`);
  }
  const jsonLength = view.getUint32(12, true);
  const jsonEnd = 20 + jsonLength;
  if (jsonEnd + 8 > bytes.byteLength) throw new Error(`Reviewed model ${assetLabel} has an invalid GLB chunk table.`);
  let document: EmbeddedGlbDocument;
  try {
    document = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)).trimEnd());
  } catch {
    throw new Error(`Reviewed model ${assetLabel} has invalid GLB JSON metadata.`);
  }
  const binaryLength = view.getUint32(jsonEnd, true);
  const binaryType = view.getUint32(jsonEnd + 4, true);
  const buffers = document.buffers ?? [];
  const primaryBuffer = buffers[0];
  if (binaryType !== 0x004e4942
    || jsonEnd + 8 + binaryLength !== bytes.byteLength
    || buffers.length === 0
    || typeof primaryBuffer?.byteLength !== 'number'
    || !Number.isSafeInteger(primaryBuffer.byteLength)
    || primaryBuffer.byteLength < 0
    || primaryBuffer.byteLength > binaryLength
    || binaryLength - primaryBuffer.byteLength > 3
    || buffers.some((buffer, index) => typeof buffer.uri === 'string'
      || (index > 0 && buffer.extensions?.EXT_meshopt_compression?.fallback !== true))) {
    throw new Error(`Reviewed model ${assetLabel} must contain only embedded BIN/Meshopt-fallback payloads.`);
  }
  if ((document.images ?? []).some((image) => typeof image.uri === 'string' || !Number.isSafeInteger(image.bufferView))) {
    throw new Error(`Reviewed model ${assetLabel} contains an unreviewed external image resource.`);
  }
  return document;
}

async function sha256Hex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function readVerifiedBytes(
  asset: Pick<DeviceWebModel, 'path' | 'sha256' | 'bytes'> & { partId?: string },
  signal: AbortSignal,
  onBytes: (loadedBytes: number) => void,
) {
  const assetLabel = asset.partId ?? asset.path;
  const response = await fetch(asset.path, { cache: 'force-cache', signal });
  if (!response.ok) throw new Error(`Reviewed model ${assetLabel} returned HTTP ${response.status}.`);
  const contentLengthHeader = response.headers.get('Content-Length');
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength !== asset.bytes)) {
    await response.body?.cancel();
    throw new Error(`Reviewed model ${assetLabel} declared an invalid byte length (${contentLengthHeader}/${asset.bytes}).`);
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      if (signal.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      if (received + value.byteLength > asset.bytes) {
        await reader.cancel();
        throw new Error(`Reviewed model ${assetLabel} exceeded its reviewed byte budget.`);
      }
      chunks.push(value);
      received += value.byteLength;
      onBytes(received);
    }
  } else {
    if (contentLength !== asset.bytes) {
      throw new Error(`Reviewed model ${assetLabel} cannot be safely streamed within its reviewed byte budget.`);
    }
    const fallback = new Uint8Array(await response.arrayBuffer());
    chunks.push(fallback);
    received = fallback.byteLength;
    onBytes(received);
  }
  if (received !== asset.bytes) {
    throw new Error(`Reviewed model ${assetLabel} byte length mismatch (${received}/${asset.bytes}).`);
  }
  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const digest = await sha256Hex(merged.buffer);
  if (digest !== asset.sha256.toLowerCase()) throw new Error(`Reviewed model ${assetLabel} SHA-256 mismatch.`);
  assertSelfContainedGlb(merged.buffer, assetLabel);
  return merged.buffer;
}

async function readVerifiedPreallocatedBytes(
  asset: Pick<DeviceWebModel, 'path' | 'sha256' | 'bytes'> & { id?: string },
  signal: AbortSignal,
  onBytes: (loadedBytes: number) => void,
) {
  const assetLabel = asset.id ?? asset.path;
  const response = await fetch(asset.path, { cache: 'force-cache', signal });
  if (!response.ok) throw new Error(`Reviewed model ${assetLabel} returned HTTP ${response.status}.`);
  const contentLengthHeader = response.headers.get('Content-Length');
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength !== asset.bytes)) {
    await response.body?.cancel();
    throw new Error(`Reviewed model ${assetLabel} declared an invalid byte length (${contentLengthHeader}/${asset.bytes}).`);
  }
  const target = new Uint8Array(asset.bytes);
  let received = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      if (signal.aborted) {
        await reader.cancel();
        throw abortError();
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (received + value.byteLength > target.byteLength) {
        await reader.cancel();
        throw new Error(`Reviewed model ${assetLabel} exceeded its reviewed byte budget.`);
      }
      target.set(value, received);
      received += value.byteLength;
      onBytes(received);
    }
  } else {
    if (contentLength !== asset.bytes) {
      throw new Error(`Reviewed model ${assetLabel} cannot be safely read within its reviewed byte budget.`);
    }
    const fallback = new Uint8Array(await response.arrayBuffer());
    if (fallback.byteLength !== target.byteLength) {
      throw new Error(`Reviewed model ${assetLabel} byte length mismatch (${fallback.byteLength}/${asset.bytes}).`);
    }
    target.set(fallback);
    received = fallback.byteLength;
    onBytes(received);
  }
  if (received !== target.byteLength) {
    throw new Error(`Reviewed model ${assetLabel} byte length mismatch (${received}/${asset.bytes}).`);
  }
  const digest = await sha256Hex(target.buffer);
  if (digest !== asset.sha256.toLowerCase()) throw new Error(`Reviewed model ${assetLabel} SHA-256 mismatch.`);
  return target.buffer;
}

function assertAnonymousTransportDocument(
  document: EmbeddedGlbDocument,
  assetLabel: string,
  requireInstancing: boolean,
) {
  const stack: unknown[] = [document];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'name' || key === 'extras') {
        throw new Error(`Anonymous visualization ${assetLabel} contains forbidden identifying metadata.`);
      }
      stack.push(child);
    }
  }
  if (document.scene !== 0
    || document.scenes?.length !== 1
    || document.scenes[0]?.nodes?.length !== 1
    || document.scenes[0].nodes[0] !== 0) {
    throw new Error(`Anonymous visualization ${assetLabel} must contain one default scene and one anonymous root.`);
  }
  if (!(document.extensionsUsed ?? []).includes('EXT_meshopt_compression')
    || !(document.extensionsRequired ?? []).includes('EXT_meshopt_compression')
    || !(document.bufferViews ?? []).some((view) => view.extensions?.EXT_meshopt_compression !== undefined)) {
    throw new Error(`Anonymous visualization ${assetLabel} does not contain its reviewed EXT_meshopt_compression payload.`);
  }
  if (requireInstancing) {
    for (const extension of ANONYMOUS_SHARD_REQUIRED_EXTENSIONS) {
      if (!(document.extensionsUsed ?? []).includes(extension)
        || !(document.extensionsRequired ?? []).includes(extension)) {
        throw new Error(`Anonymous shard ${assetLabel} does not require its reviewed ${extension} contract.`);
      }
    }
    if (!(document.nodes ?? []).some((node) => node.extensions?.EXT_mesh_gpu_instancing !== undefined)) {
      throw new Error(`Anonymous shard ${assetLabel} does not contain EXT_mesh_gpu_instancing placements.`);
    }
  }
}

function assertAnonymousInstancedShardGlb(bytes: ArrayBuffer, asset: DeviceAnonymousShardModel) {
  const document = assertSelfContainedGlb(bytes, asset.id);
  assertAnonymousTransportDocument(document, asset.id, true);
}

function assertAnonymousDecodedScene(scene: Object3D, assetLabel: string, requireInstancing: boolean) {
  let meshCount = 0;
  let instancedMeshCount = 0;
  scene.traverse((node) => {
    if ('isMesh' in node && node.isMesh === true) meshCount += 1;
    if ('isInstancedMesh' in node && node.isInstancedMesh === true) instancedMeshCount += 1;
  });
  if (scene.children.length !== 1) {
    throw new Error(`Anonymous visualization ${assetLabel} must decode to one scene root.`);
  }
  if (meshCount === 0) throw new Error('Anonymous visualization contains no renderable mesh.');
  if (requireInstancing && instancedMeshCount === 0) {
    throw new Error('Anonymous shard decoded without an EXT_mesh_gpu_instancing renderable.');
  }
  // Raw JSON has already proven that it contains no names or extras. Three's
  // GLTFLoader nevertheless synthesizes runtime labels such as `mesh_0` for
  // anonymous primitives. They are transport artifacts, not reviewed public
  // identities, so remove them before attaching the scene to our sole wrapper.
  scene.traverse((node) => {
    node.name = '';
    if (node.userData && Object.prototype.hasOwnProperty.call(node.userData, 'name')) {
      delete node.userData.name;
    }
  });
}

function assertAnonymousRuntimeWrapper(scene: Object3D, rootNodeName: string, requireInstancing: boolean) {
  const namedNodes: Object3D[] = [];
  let meshCount = 0;
  let instancedMeshCount = 0;
  scene.traverse((node) => {
    if (node.name) namedNodes.push(node);
    if ('isMesh' in node && node.isMesh === true) meshCount += 1;
    if ('isInstancedMesh' in node && node.isInstancedMesh === true) instancedMeshCount += 1;
  });
  if (namedNodes.length !== 1 || namedNodes[0] !== scene || scene.name !== rootNodeName) {
    throw new Error(`Anonymous visualization must expose only the runtime-controlled ${rootNodeName} wrapper.`);
  }
  if (meshCount === 0) throw new Error('Anonymous visualization contains no renderable mesh.');
  if (requireInstancing && instancedMeshCount === 0) {
    throw new Error('Anonymous shard decoded without an EXT_mesh_gpu_instancing renderable.');
  }
}

function assertStableComponentIdentity(scene: Object3D, asset: DeviceComponentModel) {
  const stableNodes: Object3D[] = [];
  scene.traverse((node) => {
    if (node.name.startsWith('ITER_PART__')) stableNodes.push(node);
  });
  if (stableNodes.length !== 1 || stableNodes[0]?.name !== asset.nodeName) {
    throw new Error(`ITER component ${asset.partId} does not contain its one reviewed stable node.`);
  }
  let meshCount = 0;
  stableNodes[0].traverse((node) => {
    if ('isMesh' in node && node.isMesh === true) meshCount += 1;
  });
  if (meshCount === 0) throw new Error(`ITER component ${asset.partId} contains no renderable mesh.`);
}

function disposeParsedScene(scene: Object3D) {
  scene.traverse((node) => {
    const renderable = node as Object3D & {
      geometry?: { dispose(): void };
      material?: { dispose(): void } | Array<{ dispose(): void }>;
    };
    renderable.geometry?.dispose();
    const materials = Array.isArray(renderable.material) ? renderable.material : renderable.material ? [renderable.material] : [];
    materials.forEach((material) => material.dispose());
  });
}

/**
 * Loads the compact/legacy monolithic model through the same reviewed byte,
 * digest and non-overlapping decode boundary as a component bundle. This keeps
 * preview fallback from becoming an unchecked or concurrently parsed path.
 */
export async function loadVerifiedMonolithicModel(
  asset: DeviceWebModel,
  options: MonolithicModelLoadOptions,
): Promise<Object3D> {
  const { loader, signal, onProgress } = options;
  if (signal.aborted) throw abortError();
  const bytes = await readVerifiedBytes(asset, signal, (loaded) => onProgress?.(loaded, asset.bytes));
  if (signal.aborted) throw abortError();
  const packageBase = asset.path.slice(0, asset.path.lastIndexOf('/') + 1);
  const gltf = await loader.parseAsync(bytes, packageBase);
  if (signal.aborted) {
    disposeParsedScene(gltf.scene);
    throw abortError();
  }
  onProgress?.(asset.bytes, asset.bytes);
  return gltf.scene;
}

/**
 * Fetches and verifies the reviewed 18-file ITER bundle without putting the
 * complete ~100 MB package in the Sites static archive. Parsed scenes are
 * assembled under one group so the existing selection, clipping and disposal
 * lifecycle remains identical to a monolithic GLB.
 */
export async function loadVerifiedComponentBundle(
  bundle: DeviceComponentBundle,
  options: ComponentBundleLoadOptions,
): Promise<Group> {
  const { loader, createGroup, signal, onProgress } = options;
  if (signal.aborted) throw abortError();
  const bundleController = new AbortController();
  const abortBundle = () => bundleController.abort();
  signal.addEventListener('abort', abortBundle, { once: true });
  const bundleSignal = bundleController.signal;
  const group = createGroup();
  group.name = `FusionDigitalComponentBundle__${bundle.id}`;
  const perPartProgress = new Map<string, number>();
  const updateProgress = (partId: string, loaded: number) => {
    perPartProgress.set(partId, loaded);
    onProgress?.(
      Array.from(perPartProgress.values()).reduce((sum, value) => sum + value, 0),
      bundle.bytes,
    );
  };
  let nextIndex = 0;
  const loadedScenes: Object3D[] = [];
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= bundle.components.length) return;
      if (bundleSignal.aborted) throw abortError();
      const asset = bundle.components[index];
      const bytes = await readVerifiedBytes(asset, bundleSignal, (loaded) => updateProgress(asset.partId, loaded));
      if (bundleSignal.aborted) throw abortError();
      const gltf = await loader.parseAsync(bytes, '');
      if (bundleSignal.aborted) {
        disposeParsedScene(gltf.scene);
        throw abortError();
      }
      try {
        assertStableComponentIdentity(gltf.scene, asset);
      } catch (error) {
        disposeParsedScene(gltf.scene);
        throw error;
      }
      loadedScenes[index] = gltf.scene;
      updateProgress(asset.partId, asset.bytes);
    }
  };
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, bundle.components.length));
  const workers = Array.from({ length: concurrency }, () => worker());
  try {
    await Promise.all(workers);
    for (const scene of loadedScenes) group.add(scene);
    signal.removeEventListener('abort', abortBundle);
    return group;
  } catch (error) {
    bundleController.abort();
    // `GLTFLoader.parseAsync()` is not abortable. Wait for every in-flight
    // parser to observe the shared abort before disposing, otherwise a late
    // parser could attach a scene after this catch block and leak GPU buffers.
    await Promise.allSettled(workers);
    signal.removeEventListener('abort', abortBundle);
    for (const scene of loadedScenes) if (scene) disposeParsedScene(scene);
    throw error;
  }
}

/**
 * Loads anonymous visualization shards strictly one at a time. The transfer,
 * digest check and non-abortable GLTF decode for one shard must settle before
 * the next shard starts, bounding peak compressed and decoded memory.
 */
export async function loadVerifiedAnonymousShardBundle(
  bundle: DeviceAnonymousShardBundle,
  options: AnonymousShardBundleLoadOptions,
): Promise<Group> {
  const { loader, createGroup, signal, onProgress } = options;
  if (signal.aborted) throw abortError();
  const group = createGroup();
  group.name = bundle.rootNodeName;
  const loadedScenes: Object3D[] = [];
  let completedBytes = 0;
  try {
    for (const asset of bundle.shards) {
      if (signal.aborted) throw abortError();
      const bytes = await readVerifiedPreallocatedBytes(asset, signal, (loadedBytes) => {
        onProgress?.({
          quality: 'high',
          phase: 'download',
          loadedBytes: completedBytes + loadedBytes,
          totalBytes: bundle.bytes,
          shardIndex: asset.index,
          shardCount: bundle.shards.length,
        });
      });
      assertAnonymousInstancedShardGlb(bytes, asset);
      if (signal.aborted) throw abortError();
      onProgress?.({
        quality: 'high',
        phase: 'decode',
        loadedBytes: completedBytes + asset.bytes,
        totalBytes: bundle.bytes,
        shardIndex: asset.index,
        shardCount: bundle.shards.length,
      });
      const gltf = await loader.parseAsync(bytes, '');
      if (signal.aborted) {
        disposeParsedScene(gltf.scene);
        throw abortError();
      }
      try {
        // Public GLBs contain no source or synthetic names. Their single
        // anonymous scene root remains untouched; only the in-memory wrapper
        // below receives the controlled visualization identity.
        assertAnonymousDecodedScene(gltf.scene, asset.id, true);
      } catch (error) {
        disposeParsedScene(gltf.scene);
        throw error;
      }
      loadedScenes.push(gltf.scene);
      completedBytes += asset.bytes;
      onProgress?.({
        quality: 'high',
        phase: 'decode',
        loadedBytes: completedBytes,
        totalBytes: bundle.bytes,
        shardIndex: asset.index,
        shardCount: bundle.shards.length,
      });
    }
    for (const scene of loadedScenes) group.add(scene);
    assertAnonymousRuntimeWrapper(group, bundle.rootNodeName, true);
    return group;
  } catch (error) {
    for (const scene of loadedScenes) disposeParsedScene(scene);
    throw error;
  }
}

/**
 * Preview is the fail-safe default. High detail is entered only by an explicit
 * user action; any non-abort high-detail failure disposes partial shards and
 * returns to the independently verified preview.
 */
export async function loadAnonymousDeviceModelWithFallback(
  preview: DeviceWebModel,
  bundle: DeviceAnonymousShardBundle,
  options: AnonymousDeviceModelLoadOptions,
): Promise<AnonymousDeviceModelLoadResult> {
  const { loader, createGroup, signal, onProgress } = options;
  const requestedHigh = options.requestedQuality === 'high' && options.userInitiatedHighDetail === true;
  const loadPreview = async () => {
    const bytes = await readVerifiedPreallocatedBytes(preview, signal, (loadedBytes) => onProgress?.({
        quality: 'preview',
        phase: 'download',
        loadedBytes,
        totalBytes: preview.bytes,
        shardIndex: null,
        shardCount: 0,
      }));
    const document = assertSelfContainedGlb(bytes, preview.path);
    assertAnonymousTransportDocument(document, preview.path, false);
    if (signal.aborted) throw abortError();
    const parsed = await loader.parseAsync(bytes, '');
    if (signal.aborted) {
      disposeParsedScene(parsed.scene);
      throw abortError();
    }
    try {
      assertAnonymousDecodedScene(parsed.scene, preview.path, false);
    } catch (error) {
      disposeParsedScene(parsed.scene);
      throw error;
    }
    const model = createGroup();
    model.name = bundle.rootNodeName;
    model.add(parsed.scene);
    assertAnonymousRuntimeWrapper(model, bundle.rootNodeName, false);
    onProgress?.({
      quality: 'preview',
      phase: 'decode',
      loadedBytes: preview.bytes,
      totalBytes: preview.bytes,
      shardIndex: null,
      shardCount: 0,
    });
    return model;
  };

  if (!requestedHigh) {
    return { model: await loadPreview(), quality: 'preview', fallbackUsed: false };
  }
  try {
    const model = await loadVerifiedAnonymousShardBundle(bundle, {
      loader,
      createGroup,
      signal,
      onProgress,
    });
    return { model, quality: 'high', fallbackUsed: false };
  } catch (error) {
    if (signal.aborted || isAbortError(error)) throw error;
    const fallbackReason = error instanceof Error ? error : new Error(String(error));
    options.onFallback?.(fallbackReason);
    const model = await loadPreview();
    return { model, quality: 'preview', fallbackUsed: true, fallbackReason };
  }
}
