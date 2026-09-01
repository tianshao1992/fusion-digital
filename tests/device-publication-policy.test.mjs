import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(repositoryRoot, 'public');

const protectedDeviceTokens = new Set(['exl', 'exl50u', 'iter', 'ehl', 'ehl2']);
const exlDeviceTokens = new Set(['exl', 'exl50u']);
const iterDeviceTokens = new Set(['iter']);
const ehlDeviceTokens = new Set(['ehl', 'ehl2']);
const geometryOrSourceExtensions = new Set([
  '.3mf', '.7z', '.brep', '.fbx', '.glb', '.gltf', '.iges', '.igs',
  '.obj', '.ppt', '.pptx', '.rar', '.step', '.stl', '.stp', '.zip',
]);
const rasterExtensions = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);
const allowedViewerModes = new Set(['real-3d', 'turntable-3d', 'metadata-only']);
const maxParamakWebModelBytes = 3 * 1024 * 1024;
const maxExlPublicDerivativeBytes = 20 * 1024 * 1024;
const maxExlHighDerivativeBytes = 30 * 1024 * 1024;
const maxExlPreviewTriangles = 750_000;
const maxExlHighTriangles = 2_000_000;
const maxExlMobileDecodedGpuBytes = 160 * 1024 * 1024;
const iterManifestEndpoint = '/models/iter-public-simplified/model-manifest.json';
const ehlManifestEndpoint = '/models/ehl2-preliminary-v1/model-manifest.json';
const maxEhlPublicDerivativeBytes = 16 * 1024 * 1024;
const maxEhlDecodedGpuBytes = 128 * 1024 * 1024;
const reviewedEhlArtifact = Object.freeze({
  bytes: 14_219_976,
  sha256: '983c04152d78f5520e68646c31bde74557061df8d90862e07f649afff4040f07',
  triangles: 2_470_022,
  vertices: 1_227_655,
  decodedGpuBytes: 46_917_675,
});
const maxTurntableFrames = 36;
const maxTurntableFrameBytes = 64 * 1024;
const maxTurntableModeBytes = 1024 * 1024;
const maxTurntablePackageBytes = 3 * 1024 * 1024;
const maxTurntablePackageFrames = 96;
const localPathPattern = /(?:[a-z]:[\\/](?:downloads|users|documents|appdata|temp|work)[\\/]|file:\/\/|127\.0\.0\.1(?::\d+)?|localhost(?::\d+)?\/work\/|(?:^|["'(\s])(?:\.\.\/[\w.-]+\/)*(?:work\/)?(?:exl50u-cad-private|iter-cad-private)(?:[\/"')\s]|$))/i;

function pathTokens(pathname) {
  return pathname.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function identifiesProtectedDevice(pathname) {
  return pathTokens(pathname).some((token) => protectedDeviceTokens.has(token));
}

function identifiesExlDevice(pathname) {
  return pathTokens(pathname).some((token) => exlDeviceTokens.has(token));
}

function identifiesIterDevice(pathname) {
  return pathTokens(pathname).some((token) => iterDeviceTokens.has(token));
}

function identifiesEhlDevice(pathname) {
  return pathTokens(pathname).some((token) => ehlDeviceTokens.has(token));
}

function hasGeometryOrSourceExtension(pathname) {
  return geometryOrSourceExtensions.has(extname(pathname.split(/[?#]/, 1)[0]).toLowerCase());
}

async function walkFiles(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const path = resolve(root, entry.name);
      return entry.isDirectory() ? walkFiles(path) : [path];
    }));
    return nested.flat();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

function endpointToPublicPath(endpoint) {
  assert.doesNotMatch(endpoint, /(?:^|\/)\.\.(?:\/|$)/, `${endpoint} must not traverse directories`);
  assert.doesNotMatch(endpoint, /%/, `${endpoint} must not contain encoded path input`);
  assert.doesNotMatch(endpoint, /\/\//, `${endpoint} must use a canonical single-slash path`);
  if (endpoint.startsWith('/models/')) {
    assert.match(endpoint, /^\/models\/[a-z0-9_./-]+$/i, `${endpoint} must be a canonical /models/ endpoint`);
    return resolve(publicRoot, endpoint.slice(1));
  }
  const controlledPrefix = '/device-assets/exl50u-interactive/';
  assert.ok(endpoint.startsWith(controlledPrefix), `${endpoint} is not an approved controlled device-asset endpoint`);
  const filename = endpoint.slice(controlledPrefix.length);
  assert.ok(['model-manifest.json', 'exl50u-interactive.glb', 'exl50u-interactive-high.meshopt.glb', 'poster.webp'].includes(filename),
    `${endpoint} is not on the controlled device-asset allowlist`);
  return resolve(publicRoot, 'models/exl50u-interactive', filename);
}

function exactPublicPath(endpoint, expected) {
  assert.equal(endpoint, expected, `${endpoint} is not the approved public policy document`);
  return resolve(publicRoot, endpoint.slice(1));
}

function collectStrings(value, strings = []) {
  if (typeof value === 'string') strings.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, strings));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, strings));
  return strings;
}

function parseGlb(buffer, label) {
  assert.equal(buffer.subarray(0, 4).toString('ascii'), 'glTF', `${label} must be a real binary glTF asset`);
  assert.equal(buffer.readUInt32LE(4), 2, `${label} must use glTF 2.0`);
  assert.equal(buffer.readUInt32LE(8), buffer.byteLength, `${label} GLB header length must match the file`);
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, `${label} GLB must begin with a JSON chunk`);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function decodedAttributeBytes(glb) {
  const componentBytes = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
  const components = new Map([['SCALAR', 1], ['VEC2', 2], ['VEC3', 3], ['VEC4', 4], ['MAT2', 4], ['MAT3', 9], ['MAT4', 16]]);
  return (glb.accessors ?? []).reduce((total, accessor) => total
    + (componentBytes.get(accessor.componentType) ?? 0) * (components.get(accessor.type) ?? 0) * (accessor.count ?? 0), 0);
}

function glbGeometryCounts(glb) {
  let triangles = 0;
  let vertices = 0;
  for (const mesh of glb.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const position = glb.accessors?.[primitive.attributes?.POSITION];
      const indices = Number.isInteger(primitive.indices) ? glb.accessors?.[primitive.indices] : null;
      vertices += position?.count ?? 0;
      triangles += (indices?.count ?? position?.count ?? 0) / 3;
    }
  }
  return { triangles, vertices };
}

function accessorVector(accessor, vector) {
  if (!accessor.normalized) return vector;
  const divisors = new Map([[5120, 127], [5121, 255], [5122, 32767], [5123, 65535]]);
  const divisor = divisors.get(accessor.componentType);
  assert.ok(divisor, `unsupported normalized component type ${accessor.componentType}`);
  return vector.map((value) => Math.max(-1, value / divisor));
}

function meshNodeBounds(glb, node) {
  assert.equal(node.matrix, undefined, `${node.name} must not use an opaque matrix transform`);
  assert.equal(node.rotation, undefined, `${node.name} mesh transform must not rotate independently across LODs`);
  const scale = node.scale ?? [1, 1, 1];
  const translation = node.translation ?? [0, 0, 0];
  const mesh = glb.meshes[node.mesh];
  const bounds = mesh.primitives.map((primitive) => {
    const accessor = glb.accessors[primitive.attributes.POSITION];
    return { min: accessorVector(accessor, accessor.min), max: accessorVector(accessor, accessor.max) };
  });
  const rawMin = bounds.reduce((result, bound) => result.map((value, index) => Math.min(value, bound.min[index])), [Infinity, Infinity, Infinity]);
  const rawMax = bounds.reduce((result, bound) => result.map((value, index) => Math.max(value, bound.max[index])), [-Infinity, -Infinity, -Infinity]);
  const transformed = rawMin.map((value, axis) => [value * scale[axis] + translation[axis], rawMax[axis] * scale[axis] + translation[axis]]);
  return {
    min: transformed.map((pair) => Math.min(...pair)),
    max: transformed.map((pair) => Math.max(...pair)),
  };
}

function meshNodeSignatures(glb) {
  return new Map(glb.nodes.filter((node) => Number.isInteger(node.mesh)).map((node) => {
    const { min, max } = meshNodeBounds(glb, node);
    const center = min.map((value, index) => (value + max[index]) / 2);
    const extent = min.map((value, index) => max[index] - value);
    return [node.name, { center, extent }];
  }));
}

async function renderHomepageWorkspace() {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('publication-policy-test', `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request('http://localhost/', { headers: { accept: 'text/html' } }),
    { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function fetchFromWorker(pathname, init) {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('publication-header-test', `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`, init),
    { ASSETS: { fetch: async (request) => {
      const assetPathname = new URL(request.url).pathname;
      if (assetPathname.startsWith('/models/iter-high-detail-v1/')) {
        return new Response('Not found', { status: 404 });
      }
      const path = fileURLToPath(new URL(assetPathname.slice(1), new URL('../public/', import.meta.url)));
      try { return new Response(await readFile(path), { status: 200 }); } catch { return new Response('Not found', { status: 404 }); }
    } } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test('publishes only catalog-declared EXL, ITER and EHL browser derivatives and no protected source geometry', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'models/device-catalog.json'), 'utf8'));
  const exl = catalog.devices.find((device) => identifiesExlDevice(device.id));
  assert.equal(exl?.viewer?.mode, 'real-3d', 'EXL public geometry requires an explicit real-3d catalog entry');
  const exlManifestEndpoint = exl?.viewer?.manifestEndpoint;
  assert.equal(typeof exlManifestEndpoint, 'string');
  const exlManifest = JSON.parse(await readFile(endpointToPublicPath(exlManifestEndpoint), 'utf8'));
  assert.ok(Array.isArray(exlManifest.assets?.webModels));
  const allowedExlGeometry = new Set(exlManifest.assets.webModels.flatMap((asset) => {
    assert.equal(extname(asset.path).toLowerCase(), '.glb');
    const publicModelPath = relative(repositoryRoot, endpointToPublicPath(asset.path)).replaceAll('\\', '/').toLowerCase();
    return [publicModelPath, publicModelPath.replace(/^public\//, 'dist/client/')];
  }));
  const iter = catalog.devices.find((device) => identifiesIterDevice(device.id));
  assert.equal(iter?.viewer?.mode, 'real-3d', 'ITER public geometry requires an explicit real-3d catalog entry');
  assert.equal(iter.viewer.manifestEndpoint, iterManifestEndpoint);
  const iterManifest = JSON.parse(await readFile(endpointToPublicPath(iterManifestEndpoint), 'utf8'));
  assert.equal(iterManifest.assets?.webModels, undefined, 'ITER high detail must not be a monolithic LOD');
  assert.equal(iterManifest.assets?.componentBundles?.length, 1, 'ITER must expose one reviewed component-sharded high-detail bundle');
  assert.equal(iterManifest.assets.componentBundles[0].components.length, 18);
  assert.equal(iterManifest.assets?.webModel, undefined, 'ITER must not ship the invalid compact fallback model');
  const allowedIterGeometry = new Set();
  const ehl = catalog.devices.find((device) => identifiesEhlDevice(device.id));
  assert.equal(ehl?.viewer?.mode, 'real-3d', 'EHL public geometry requires an explicit real-3d catalog entry');
  assert.equal(ehl.viewer.manifestEndpoint, ehlManifestEndpoint);
  const ehlManifest = JSON.parse(await readFile(endpointToPublicPath(ehlManifestEndpoint), 'utf8'));
  assert.equal(ehlManifest.assets?.sourceCad, undefined, 'EHL source geometry must never be published');
  assert.equal(ehlManifest.assets?.webModels, undefined, 'EHL must expose one reviewed derivative, not an open-ended LOD list');
  const ehlAsset = ehlManifest.assets?.webModel;
  assert.equal(ehlAsset?.path, '/models/ehl2-preliminary-v1/ehl2-preliminary.meshopt.glb');
  assert.equal(ehlAsset?.bytes, reviewedEhlArtifact.bytes);
  assert.equal(ehlAsset?.sha256?.toLowerCase(), reviewedEhlArtifact.sha256);
  const allowedEhlGeometry = new Set([
    relative(repositoryRoot, endpointToPublicPath(ehlAsset.path)).replaceAll('\\', '/').toLowerCase(),
  ]);
  allowedEhlGeometry.add([...allowedEhlGeometry][0].replace(/^public\//, 'dist/client/'));

  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const published = [
    ...(await walkFiles(resolve(repositoryRoot, 'public'))),
    ...(await walkFiles(resolve(repositoryRoot, 'dist'))),
  ].map((path) => relative(repositoryRoot, path).replaceAll('\\', '/'));

  for (const pathname of new Set([...tracked, ...published])) {
    if (!hasGeometryOrSourceExtension(pathname)) continue;
    if (identifiesIterDevice(pathname)) {
      assert.ok(allowedIterGeometry.has(pathname.toLowerCase()),
        `undeclared ITER geometry/source must not be tracked or published: ${pathname}`);
    }
    if (identifiesExlDevice(pathname)) {
      assert.ok(allowedExlGeometry.has(pathname.toLowerCase()), `undeclared EXL geometry/source must not be tracked or published: ${pathname}`);
    }
    if (identifiesEhlDevice(pathname)) {
      assert.ok(allowedEhlGeometry.has(pathname.toLowerCase()), `undeclared EHL geometry/source must not be tracked or published: ${pathname}`);
    }
  }
});

test('public device catalog is fail-closed and authorizes only bounded, verifiable browser assets', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'models/device-catalog.json'), 'utf8'));
  assert.ok(Array.isArray(catalog.devices) && catalog.devices.length === 5);

  for (const device of catalog.devices) {
    const viewer = device.viewer;
    assert.ok(viewer && typeof viewer === 'object', `${device.id} must declare an explicit viewer policy`);
    assert.ok(allowedViewerModes.has(viewer.mode), `${device.id} has an unknown viewer mode; unknown modes must fail closed`);

    if (viewer.mode === 'real-3d') {
      assert.equal(device.delivery, 'public-static', `${device.id} real geometry must be explicitly public`);
      assert.equal(viewer.turntableManifestEndpoint, null);
      const manifestEndpoint = viewer.manifestEndpoint ?? device.manifestEndpoint;
      assert.equal(typeof manifestEndpoint, 'string', `${device.id} real-3d mode needs a public manifest`);
      const manifest = JSON.parse(await readFile(endpointToPublicPath(manifestEndpoint), 'utf8'));
      assert.equal(manifest.access?.classification, 'PUBLIC');
      assert.equal(manifest.access?.redistributionAllowed, true);
      assert.equal(manifest.access?.engineeringUseAllowed, false);
      const isExlDerivative = identifiesExlDevice(device.id);
      const isIterDerivative = identifiesIterDevice(device.id);
      const isEhlDerivative = identifiesEhlDevice(device.id);
      let glb = null;
      if (isIterDerivative) {
        assert.equal(manifest.schemaVersion, '1.3', 'component-only ITER delivery requires manifest 1.3');
        assert.equal(manifest.assets?.webModel, undefined, 'ITER must not expose a monolithic fallback model');
      } else {
        const byteBudget = isExlDerivative
          ? maxExlPublicDerivativeBytes
          : isEhlDerivative ? maxEhlPublicDerivativeBytes : maxParamakWebModelBytes;
        assert.ok(manifest.assets?.webModel?.bytes > 0 && manifest.assets.webModel.bytes <= byteBudget,
          `${device.id} browser model exceeds the ${byteBudget}-byte budget`);
        assert.match(manifest.assets.webModel.path, /^\/(?:models|device-assets\/exl50u-interactive)\/[a-z0-9_./-]+\.glb$/i);
        assert.ok(manifest.assets.webModel.path.startsWith(`${manifestEndpoint.slice(0, manifestEndpoint.lastIndexOf('/') + 1)}`),
          `${device.id} web model must stay inside its declared public package`);
        assert.match(manifest.assets.webModel.sha256, /^[a-f0-9]{64}$/i);
        const webModelPath = endpointToPublicPath(manifest.assets.webModel.path);
        const webModel = await readFile(webModelPath);
        assert.equal(webModel.byteLength, manifest.assets.webModel.bytes,
          `${device.id} manifest byte count must match the shipped browser model`);
        assert.equal(createHash('sha256').update(webModel).digest('hex'), manifest.assets.webModel.sha256.toLowerCase(),
          `${device.id} manifest hash must match the shipped browser model`);
        glb = parseGlb(webModel, `${device.id} webModel`);
      }

      if (manifest.assets.poster) {
        const posterPath = endpointToPublicPath(manifest.assets.poster.path);
        const poster = await readFile(posterPath);
        assert.ok(rasterExtensions.has(extname(posterPath).toLowerCase()), `${device.id} poster must be a raster image`);
        assert.equal(poster.byteLength, manifest.assets.poster.bytes, `${device.id} poster byte count must match its declaration`);
        assert.equal(createHash('sha256').update(poster).digest('hex'), manifest.assets.poster.sha256.toLowerCase(),
          `${device.id} poster hash must match its declaration`);
      }

      if (isExlDerivative) {
        assert.equal(manifest.devicePackage?.kind, 'public-simplified-derivative');
        assert.equal(manifest.devicePackage?.authority, 'illustrative');
        assert.equal(manifest.assets.sourceCad, undefined, 'EXL public derivative must never declare source CAD');
        assert.match(manifest.access.statement, /(?:user(?:\s+explicitly)?[- ]authorized|用户授权)/i);
        assert.match(manifest.access.statement, /(?:simplified(?:\s+browser)?\s+derivative|简化派生)/i);
        assert.match(manifest.disclaimer, /(?:not\s+(?:an?\s+)?engineering\s+authority|non-engineering-authority|非工程权威)/i);
        assert.equal(viewer.overlayEligible, false, 'EXL derivative must not be presented as comparison-grade geometry');
        assert.match(device.statement, /(?:technically saved|技术性保存|无法从技术上)/i,
          'catalog must disclose that browser-delivered geometry can be saved');
        const systems = Array.isArray(manifest.systems) ? manifest.systems : [];
        const parts = systems.flatMap((system) => Array.isArray(system.parts) ? system.parts : []);
        assert.equal(systems.length, 12, 'EXL public derivative must expose the 12 approved top-level systems');
        assert.equal(parts.length, 12, 'EXL public derivative must expose one selectable mesh for each approved system');
        assert.equal(new Set(parts.map((part) => part.id)).size, parts.length, 'EXL public derivative part IDs must be unique');
        assert.equal(new Set(parts.map((part) => part.nodeName)).size, parts.length, 'EXL public derivative node mappings must be unique');

        const approvedNodeNames = new Set(parts.map((part) => part.nodeName));
        assert.ok(Array.isArray(manifest.assets.webModels), 'EXL must declare preview and high LODs in one manifest');
        assert.equal(manifest.assets.webModels.length, 2, 'EXL must declare exactly two GLB LODs');
        assert.deepEqual(new Set(manifest.assets.webModels.map((asset) => asset.quality)), new Set(['preview', 'high']));
        assert.equal(new Set(manifest.assets.webModels.map((asset) => asset.id)).size, 2, 'EXL LOD IDs must be unique');
        const preview = manifest.assets.webModels.find((asset) => asset.quality === 'preview');
        const high = manifest.assets.webModels.find((asset) => asset.quality === 'high');
        assert.ok(preview && high);
        for (const field of ['path', 'format', 'bytes', 'sha256']) assert.equal(preview[field], manifest.assets.webModel[field], `compatibility webModel.${field} must equal preview`);
        assert.equal(manifest.assets.webModels.filter((asset) => asset.default === true).length, 1, 'EXL must declare exactly one desktop default LOD');
        assert.equal(high.default, true, 'desktop default must select the approved high LOD');
        assert.ok(preview.bytes <= maxExlPublicDerivativeBytes && preview.triangles <= maxExlPreviewTriangles);
        assert.ok(high.bytes <= maxExlHighDerivativeBytes && high.triangles <= maxExlHighTriangles);
        assert.equal(preview.path, '/device-assets/exl50u-interactive/exl50u-interactive.glb');
        assert.equal(high.path, '/device-assets/exl50u-interactive/exl50u-interactive-high.meshopt.glb');

        const parsedLods = [];
        for (const asset of manifest.assets.webModels) {
          assert.match(asset.sha256, /^[a-f0-9]{64}$/i);
          const pathname = endpointToPublicPath(asset.path);
          const contents = await readFile(pathname);
          assert.equal(contents.byteLength, asset.bytes, `${asset.id} byte count must match`);
          assert.equal(createHash('sha256').update(contents).digest('hex'), asset.sha256.toLowerCase(), `${asset.id} hash must match`);
          const parsed = parseGlb(contents, asset.id);
          assert.deepEqual(glbGeometryCounts(parsed), { triangles: asset.triangles, vertices: asset.vertices },
            `${asset.id} declared geometry counts must match the GLB`);
          const meshNodesForLod = parsed.nodes.filter((node) => Number.isInteger(node.mesh));
          assert.equal(parsed.meshes.length, 12, `${asset.id} must contain 12 meshes`);
          assert.equal(meshNodesForLod.length, 12, `${asset.id} must contain 12 mesh nodes`);
          assert.deepEqual(new Set(meshNodesForLod.map((node) => node.name)), approvedNodeNames, `${asset.id} node mapping must match manifest`);
          const decodedBytes = decodedAttributeBytes(parsed);
          assert.ok(decodedBytes > 0 && decodedBytes <= maxExlMobileDecodedGpuBytes,
            `${asset.id} decoded attribute/index estimate exceeds the mobile GPU budget: ${decodedBytes}`);
          parsedLods.push({ asset, parsed });
        }
        const highGlb = parsedLods.find(({ asset }) => asset.quality === 'high').parsed;
        const previewGlb = parsedLods.find(({ asset }) => asset.quality === 'preview').parsed;
        assert.ok(highGlb.extensionsRequired?.includes('EXT_meshopt_compression'), 'high LOD must require EXT_meshopt_compression');
        const previewSignatures = meshNodeSignatures(previewGlb);
        const highSignatures = meshNodeSignatures(highGlb);
        for (const nodeName of approvedNodeNames) {
          const previewSignature = previewSignatures.get(nodeName);
          const highSignature = highSignatures.get(nodeName);
          assert.ok(previewSignature && highSignature);
          for (const field of ['center', 'extent']) {
            for (let axis = 0; axis < 3; axis += 1) {
              const baseline = previewSignature[field][axis];
              const delta = Math.abs(highSignature[field][axis] - baseline);
              assert.ok(delta <= Math.max(2, Math.abs(baseline) * 0.01),
                `${nodeName} ${field}[${axis}] changed across LODs; possible semantic mesh-name mismatch`);
            }
          }
        }
        const conversion = manifest.generator.conversion;
        assert.equal(conversion.highLodAbsoluteDeflectionMillimetres, 0.35, 'manifest must record high LOD absolute deflection of 0.35 mm');
        assert.equal(conversion.highLodAngularDeflectionRadians, 0.25, 'manifest must record high LOD angular deflection of 0.25 rad');
        assert.equal(conversion.highLodSharpEdgeNormals, true, 'manifest must record sharp-edge normal handling');
        assert.match(manifest.disclaimer, /(?:non-engineering|not\s+(?:an?\s+)?engineering|非工程)/i, 'both LODs must remain non-engineering visualizations');

        const meshNodes = glb.nodes.filter((node) => Number.isInteger(node.mesh));
        assert.equal(glb.meshes.length, 12, 'EXL GLB must contain the 12 approved system meshes');
        assert.equal(meshNodes.length, 12, 'EXL GLB must contain one mesh node per approved system');
        assert.deepEqual(new Set(meshNodes.map((node) => node.name)), approvedNodeNames,
          'EXL GLB mesh node names must exactly match the manifest');
        const rootNode = glb.nodes.find((node) => node.name === 'EXL50U_Simplified_Public_Derivative');
        assert.deepEqual(rootNode?.scale, [0.001, 0.001, 0.001], 'EXL root must convert source millimetres to metres');
        assert.deepEqual(rootNode?.rotation, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], 'EXL root must convert source Z-up to web Y-up');
        assert.equal(rootNode?.extras?.sourceToWebScale, manifest.coordinateSystem.sourceToWebScale);
        assert.equal(rootNode?.extras?.webCoordinateUnit, manifest.coordinateSystem.linearUnit);
        assert.equal(glb.asset?.extras?.engineeringAuthority, false);
        assert.equal(glb.asset?.extras?.sourceUnit, 'millimetre after XCAF transfer',
          'EXL derivative must preserve its source-unit provenance');
        const nodeBounds = glb.nodes.filter((node) => Number.isInteger(node.mesh)).map((node) => meshNodeBounds(glb, node));
        const sourceMin = nodeBounds.reduce((result, bounds) => result.map((value, index) => Math.min(value, bounds.min[index])), [Infinity, Infinity, Infinity]);
        const sourceMax = nodeBounds.reduce((result, bounds) => result.map((value, index) => Math.max(value, bounds.max[index])), [-Infinity, -Infinity, -Infinity]);
        const worldMin = [sourceMin[0], sourceMin[2], -sourceMax[1]].map((value) => value * 0.001);
        const worldMax = [sourceMax[0], sourceMax[2], -sourceMin[1]].map((value) => value * 0.001);
        const worldExtents = worldMax.map((value, index) => value - worldMin[index]);
        assert.ok(worldExtents.every((extent) => extent > 1 && extent < 12), `EXL transformed world extents are implausible: ${worldExtents.join(', ')}`);

        const packageFiles = await walkFiles(resolve(endpointToPublicPath(manifestEndpoint), '..'));
        const licenseNoticePath = exactPublicPath(manifest.generator.licenseUrl, '/licenses/EXL50U-PUBLIC-DERIVATIVE.txt');
        assert.equal(extname(licenseNoticePath).toLowerCase(), '.txt');
        assert.match(await readFile(licenseNoticePath, 'utf8'), /user explicitly authorized public web delivery/i);
        const allowedPackageFiles = new Set([
          endpointToPublicPath(manifestEndpoint),
          ...manifest.assets.webModels.map((asset) => endpointToPublicPath(asset.path)),
          ...(manifest.assets.poster?.path?.startsWith(`${manifestEndpoint.slice(0, manifestEndpoint.lastIndexOf('/') + 1)}`)
            ? [endpointToPublicPath(manifest.assets.poster.path)] : []),
        ].map((pathname) => resolve(pathname).toLowerCase()));
        for (const pathname of packageFiles) {
          assert.ok(allowedPackageFiles.has(resolve(pathname).toLowerCase()),
            `EXL public derivative package contains an undeclared asset: ${relative(publicRoot, pathname)}`);
        }
        assert.equal(packageFiles.length, allowedPackageFiles.size, 'EXL package files must exactly match its declared public assets');
      } else if (isIterDerivative) {
        assert.equal(manifestEndpoint, iterManifestEndpoint, 'ITER must use the one reviewed public package namespace');
        assert.equal(manifest.devicePackage?.kind, 'public-simplified-derivative');
        assert.equal(manifest.devicePackage?.authority, 'illustrative');
        assert.equal(manifest.assets.sourceCad, undefined, 'ITER source CAD must remain private');
        assert.equal(manifest.assets.poster, undefined, 'ITER local Sites package must contain only its high-detail manifest');
        assert.equal(manifest.assets.webModels, undefined, 'ITER high detail must never be delivered as a monolithic LOD');
        assert.equal(manifest.assets.componentBundles?.length, 1, 'ITER must declare one reviewed high-detail component bundle');
        assert.equal(manifest.assets.webModel, undefined, 'ITER compact preview must be removed rather than used as a fallback');
        assert.match(manifest.access.statement, /(?:project[- ]owner[- ]authorized|project owner (?:explicitly )?authorized|项目方授权)/i);
        assert.match(manifest.disclaimer, /(?:not\s+(?:an?\s+)?(?:authoritative\s+)?(?:ITER\s+)?engineering|non-engineering|非工程)/i);
        assert.match(manifest.disclaimer, /(?:does not claim|no)\s+(?:ITER Organization\s+)?endorsement|不代表.*ITER.*认可/i);
        assert.equal(viewer.overlayEligible, false, 'ITER visualization must not be presented as comparison-grade geometry');
        assert.match(device.statement, /(?:technically saved|技术性保存|无法从技术上)/i,
          'catalog must disclose that browser-delivered geometry can be saved');

        const systems = Array.isArray(manifest.systems) ? manifest.systems : [];
        const parts = systems.flatMap((system) => Array.isArray(system.parts) ? system.parts : []);
        assert.equal(parts.length, 18, 'ITER high-detail bundle must expose all 18 approved component identities');
        assert.equal(new Set(parts.map((part) => part.id)).size, 18, 'ITER component IDs must be unique');
        const approvedNodeNames = new Set(parts.map((part) => part.nodeName));
        const approvedPartIds = new Set(parts.map((part) => part.id));
        assert.equal(approvedNodeNames.size, 18, 'ITER stable node mappings must be unique');
        for (const nodeName of approvedNodeNames) assert.match(nodeName, /^ITER_PART__[a-z0-9-]+$/,
          'ITER public nodes must use the stable ITER_PART__<id> contract');

        const highBundle = manifest.assets.componentBundles[0];
        assert.equal(highBundle.delivery, 'components');
        assert.equal(highBundle.quality, 'high');
        assert.ok(highBundle.bytes >= 80_000_000 && highBundle.bytes <= 110_000_000,
          'ITER high-detail transfer must remain near the reviewed ~100 MB target');
        assert.ok(highBundle.triangles > 10_000_000,
          'ITER high-detail bundle must retain a substantial reviewed geometry budget');
        assert.equal(highBundle.components.length, 18);
        assert.deepEqual(new Set(highBundle.components.map((component) => component.partId)), approvedPartIds);
        assert.deepEqual(new Set(highBundle.components.map((component) => component.nodeName)), approvedNodeNames);
        assert.equal(new Set(highBundle.components.map((component) => component.path)).size, 18);
        assert.equal(highBundle.components.reduce((sum, component) => sum + component.bytes, 0), highBundle.bytes);
        assert.equal(highBundle.components.reduce((sum, component) => sum + component.triangles, 0), highBundle.triangles);
        assert.equal(highBundle.components.reduce((sum, component) => sum + component.vertices, 0), highBundle.vertices);
        assert.equal(highBundle.components.reduce((sum, component) => sum + component.sceneDrawTriangles, 0), highBundle.sceneDrawTriangles);
        assert.equal(highBundle.components.reduce((sum, component) => sum + component.sceneDrawVertices, 0), highBundle.sceneDrawVertices);
        assert.equal(highBundle.components.reduce((sum, component) => sum + component.meshInstances, 0), highBundle.meshInstances);
        assert.ok(highBundle.meshInstances <= 1000, 'ITER high-detail bundle exceeds its reviewed draw-call budget');
        assert.equal(highBundle.components.reduce((sum, component) => sum + component.decodedGpuBytes, 0), highBundle.decodedGpuBytes);
        for (const component of highBundle.components) {
          assert.match(component.path, /^\/device-assets\/iter-high-detail\/v1\/[a-z0-9-]+\.[a-f0-9]{64}\.high\.meshopt\.glb$/);
          assert.match(component.sha256, /^[a-f0-9]{64}$/i);
          assert.ok(component.bytes > 0 && component.bytes < 24 * 1024 * 1024);
          assert.ok(component.triangles > 0 && component.vertices > 0
            && component.sceneDrawTriangles >= component.triangles
            && component.sceneDrawVertices >= component.vertices
            && component.meshInstances > 0 && component.meshInstances <= 300 && component.decodedGpuBytes > 0);
          assert.ok(Array.isArray(component.boundsMetres?.min) && Array.isArray(component.boundsMetres?.max));
        }
        assert.equal(manifest.visualizations?.analyticPlasma?.kind, 'analytic-design-proxy');
        assert.equal(manifest.visualizations?.analyticPlasma?.geometryOnly, true);
        assert.equal(manifest.visualizations?.analyticPlasma?.hasPsiGrid, false);
        assert.equal(manifest.visualizations?.analyticPlasma?.hasXPoint, false);
        assert.equal(manifest.visualizations?.analyticPlasma?.isEfit, false);

        const licenseNoticePath = exactPublicPath(
          manifest.generator.licenseUrl,
          '/licenses/ITER-PUBLIC-VISUALIZATION-DERIVATIVE.txt',
        );
        const licenseNotice = await readFile(licenseNoticePath, 'utf8');
        assert.match(licenseNotice, /project owner explicitly authorized public delivery/i);
        assert.match(licenseNotice, /does not claim endorsement.*ITER Organization/is);
        assert.match(licenseNotice, /must not be used for manufacturing.*CAE.*safety decisions/is);

        const packageFiles = await walkFiles(resolve(endpointToPublicPath(manifestEndpoint), '..'));
        const allowedPackageFiles = new Set([endpointToPublicPath(manifestEndpoint)]
          .map((pathname) => resolve(pathname).toLowerCase()));
        for (const pathname of packageFiles) {
          assert.ok(allowedPackageFiles.has(resolve(pathname).toLowerCase()),
            `ITER public derivative package contains an undeclared asset: ${relative(publicRoot, pathname)}`);
        }
        assert.equal(packageFiles.length, 1, 'ITER Sites package must contain exactly one manifest; geometry is external high-detail shards');
        for (const value of collectStrings(manifest)) {
          assert.doesNotMatch(value, localPathPattern, 'ITER manifest must not expose a private filesystem path');
          if (hasGeometryOrSourceExtension(value)) assert.ok(
            /^\/device-assets\/iter-high-detail\/v1\/[a-z0-9-]+\.[a-f0-9]{64}\.high\.meshopt\.glb$/.test(value),
            `ITER manifest exposes an undeclared geometry/source path: ${value}`,
          );
        }
      } else if (isEhlDerivative) {
        assert.equal(manifestEndpoint, ehlManifestEndpoint, 'EHL must use the reviewed preliminary derivative namespace');
        assert.equal(manifest.devicePackage?.kind, 'public-simplified-derivative');
        assert.equal(manifest.devicePackage?.authority, 'illustrative');
        assert.equal(manifest.assets.sourceCad, undefined, 'EHL source GLBs must remain private');
        assert.equal(manifest.assets.webModels, undefined, 'EHL must publish one bounded derivative rather than an open-ended LOD list');
        assert.equal(manifest.assets.componentBundles, undefined, 'EHL must not publish undeclared source-derived component files');
        assert.equal(manifest.assets.poster, undefined, 'EHL package is limited to its reviewed interactive derivative');
        assert.equal(manifest.assets.webModel.path, '/models/ehl2-preliminary-v1/ehl2-preliminary.meshopt.glb');
        assert.ok(manifest.assets.webModel.bytes > 0 && manifest.assets.webModel.bytes <= maxEhlPublicDerivativeBytes,
          'EHL transfer must remain below the reviewed 16 MiB public budget');
        assert.equal(manifest.assets.webModel.bytes, reviewedEhlArtifact.bytes);
        assert.equal(manifest.assets.webModel.sha256.toLowerCase(), reviewedEhlArtifact.sha256);
        assert.equal(manifest.assets.webModel.triangles, reviewedEhlArtifact.triangles);
        assert.equal(manifest.assets.webModel.vertices, reviewedEhlArtifact.vertices);
        assert.ok(Math.abs(manifest.assets.webModel.triangles / 4_957_856 - 0.5) <= 0.002,
          'EHL derivative must retain approximately 50% of the reviewed source triangle count');
        assert.match(manifest.access.statement, /(?:user(?:\s+explicitly)?[- ]authorized|用户授权)/i);
        assert.match(manifest.access.statement, /(?:simplified(?:\s+browser)?\s+derivative|简化派生)/i);
        assert.match(manifest.disclaimer, /(?:preliminary|not\s+(?:an?\s+)?engineering|non-authoritative|非工程|初步)/i);
        assert.equal(viewer.overlayEligible, false, 'EHL preliminary geometry must not be presented as comparison-grade geometry');
        assert.match(device.statement, /(?:technically saved|技术性保存|无法从技术上)/i,
          'catalog must disclose that browser-delivered EHL geometry can be saved');

        const systems = Array.isArray(manifest.systems) ? manifest.systems : [];
        const parts = systems.flatMap((system) => Array.isArray(system.parts) ? system.parts : []);
        assert.equal(parts.length, 6, 'EHL derivative must expose the six reviewed preliminary assembly identities');
        assert.equal(new Set(parts.map((part) => part.id)).size, 6, 'EHL part IDs must be unique');
        const approvedNodeNames = new Set(parts.map((part) => part.nodeName));
        assert.equal(approvedNodeNames.size, 6, 'EHL stable node mappings must be unique');
        for (const nodeName of approvedNodeNames) assert.match(nodeName, /^EHL2_PART__[a-z0-9-]+$/,
          'EHL public nodes must use the stable EHL2_PART__<id> contract');

        assert.deepEqual(glb.extensionsUsed, ['EXT_meshopt_compression'],
          'EHL must declare exactly the transport extension it uses');
        assert.deepEqual(glb.extensionsRequired, ['EXT_meshopt_compression'],
          'EHL must require exactly Meshopt; normalized Int8 normals are glTF core');
        assert.ok((glb.buffers ?? []).length > 0 && glb.buffers.every((buffer) => buffer.uri === undefined),
          'EHL GLB must be self-contained without external buffer URIs');
        assert.equal((glb.images ?? []).length, 0, 'EHL GLB must not embed or reference textures');
        assert.equal((glb.textures ?? []).length, 0, 'EHL GLB must not declare textures');
        assert.deepEqual(glbGeometryCounts(glb), {
          triangles: manifest.assets.webModel.triangles,
          vertices: manifest.assets.webModel.vertices,
        }, 'EHL declared geometry counts must match the shipped GLB');
        const meshNodes = glb.nodes.filter((node) => Number.isInteger(node.mesh));
        assert.equal(glb.meshes.length, 6, 'EHL GLB must contain exactly six renderable meshes');
        assert.equal(meshNodes.length, 6, 'EHL GLB must contain exactly six renderable mesh nodes');
        assert.deepEqual(new Set(meshNodes.map((node) => node.name)), approvedNodeNames,
          'EHL GLB mesh node names must exactly match the manifest');
        for (const mesh of glb.meshes) for (const primitive of mesh.primitives ?? []) {
          const position = glb.accessors?.[primitive.attributes?.POSITION];
          const normal = glb.accessors?.[primitive.attributes?.NORMAL];
          assert.equal(position?.componentType, 5126,
            'EHL POSITION must remain Float32 so thin-wall geometry is not collapsed by position quantization');
          assert.equal(position?.normalized, false, 'EHL Float32 POSITION must remain raw and non-normalized');
          assert.equal(normal?.componentType, 5120, 'EHL NORMAL must use signed Int8 quantization');
          assert.equal(normal?.normalized, true, 'EHL NORMAL must be normalized');
        }
        const decodedBytes = decodedAttributeBytes(glb);
        assert.ok(decodedBytes > 0 && decodedBytes <= maxEhlDecodedGpuBytes,
          `EHL decoded attribute/index estimate exceeds the 128 MiB budget: ${decodedBytes}`);
        assert.equal(decodedBytes, reviewedEhlArtifact.decodedGpuBytes);
        assert.equal(manifest.assets.webModel.decodedGpuBytes, decodedBytes,
          'EHL declared decoded GPU bytes must match the GLB accessor contract');

        const declaredPipelineScripts = [
          [manifest.generator?.script, 'scripts/ehl2/build_ehl2_preliminary.py'],
          [manifest.generator?.compressionScript, 'scripts/ehl2/meshopt_float_position.mjs'],
          [manifest.generator?.runtimeQa, 'scripts/ehl2/qa_ehl2_runtime.mjs'],
        ];
        for (const [declaration, expectedPath] of declaredPipelineScripts) {
          assert.equal(declaration?.path, expectedPath,
            'EHL provenance must reference the reviewed in-repository pipeline script');
          const pipelineBytes = await readFile(resolve(repositoryRoot, expectedPath));
          assert.equal(createHash('sha256').update(pipelineBytes).digest('hex'), declaration.sha256.toLowerCase(),
            `EHL provenance hash is stale for ${expectedPath}`);
        }

        const packageRoot = resolve(endpointToPublicPath(manifestEndpoint), '..');
        const packageFiles = await walkFiles(packageRoot);
        const noticePath = resolve(packageRoot, 'PUBLICATION-NOTICE.md');
        assert.equal(manifest.diagnosticData?.ports?.path, '/models/ehl2-preliminary-v1/diagview2-ports.json');
        assert.equal(manifest.diagnosticData?.ports?.recordCount, 41);
        assert.match(manifest.diagnosticData?.ports?.sha256 ?? '', /^[a-f0-9]{64}$/i);
        const portsPath = endpointToPublicPath(manifest.diagnosticData.ports.path);
        const allowedPackageFiles = new Set([
          endpointToPublicPath(manifestEndpoint),
          endpointToPublicPath(manifest.assets.webModel.path),
          portsPath,
          noticePath,
        ].map((pathname) => resolve(pathname).toLowerCase()));
        assert.deepEqual(new Set(packageFiles.map((pathname) => resolve(pathname).toLowerCase())), allowedPackageFiles,
          'EHL package must contain only the manifest, one reviewed derivative GLB, the reviewed 41-port table and its publication notice');
        const notice = await readFile(noticePath, 'utf8');
        assert.match(notice, /project owner explicitly requested.*public/is);
        assert.match(notice, /approximately 50% of the source triangle count/i);
        assert.match(notice, /must not be used for manufacturing.*engineering analysis.*safety\s+decisions/is);
        for (const sourceFilename of ['VV.glb', 'CenterPost.glb', 'Divertor.glb', 'bowenguan.glb', 'duwa.glb']) {
          assert.ok(!packageFiles.some((pathname) => pathname.toLowerCase().endsWith(sourceFilename.toLowerCase())),
            `EHL source file must not be published: ${sourceFilename}`);
        }
        for (const value of collectStrings(manifest)) {
          assert.doesNotMatch(value, /(?:(?:^|[\s"'(])[a-z]:[\\/]|file:\/\/|\\\\[^\\])/i,
            'EHL manifest must not expose a local or UNC filesystem path');
          if (hasGeometryOrSourceExtension(value)) assert.ok(
            value === manifest.assets.webModel.path || ['VV.glb', 'CenterPost.glb', 'Divertor.glb', 'bowenguan.glb', 'duwa.glb'].includes(value),
            `EHL manifest exposes an undeclared geometry/source path: ${value}`,
          );
        }
      }
    } else {
      assert.equal(viewer.manifestEndpoint ?? device.manifestEndpoint ?? null, null, `${device.id} non-real viewer must not expose geometry`);
    }

    if (viewer.mode === 'turntable-3d') {
      assert.equal(device.delivery, 'public-static-preview');
      assert.equal(typeof viewer.turntableManifestEndpoint, 'string');
      assert.match(viewer.turntableManifestEndpoint, /\/turntable-manifest\.json$/);
      const turntablePath = endpointToPublicPath(viewer.turntableManifestEndpoint);
      const turntable = JSON.parse(await readFile(turntablePath, 'utf8'));
      const modes = Array.isArray(turntable.modes) && turntable.modes.length > 0
        ? turntable.modes
        : [{ id: 'legacy', controls: { type: 'appearance' }, frames: turntable.frames }];
      assert.ok(modes.length <= 12, `${device.id} turntable exposes too many preview modes`);
      const modeIds = new Set();
      const referencedAssets = [];
      let packageBytes = (await stat(turntablePath)).size;
      for (const [modeIndex, mode] of modes.entries()) {
        assert.ok(mode && typeof mode === 'object', `${device.id} modes[${modeIndex}] must be an object`);
        assert.match(mode.id, /^[a-z][a-z0-9-]*$/, `${device.id} modes[${modeIndex}] has an invalid id`);
        assert.ok(!modeIds.has(mode.id), `${device.id} contains a duplicate turntable mode id`);
        modeIds.add(mode.id);
        assert.ok(['appearance', 'section', 'detail'].includes(mode.controls?.type), `${device.id}/${mode.id} has an unknown preview control type`);
        if (mode.controls?.type === 'section') assert.ok(['x', 'y', 'z'].includes(mode.controls?.axis), `${device.id}/${mode.id} has an invalid section axis`);

        const modeAssets = Array.isArray(mode.frames)
          ? mode.frames.map((frame) => frame?.src).filter((value) => typeof value === 'string')
          : [];
        assert.ok(modeAssets.length >= 1, `${device.id}/${mode.id} has no raster preview`);
        assert.ok(modeAssets.length <= maxTurntableFrames, `${device.id}/${mode.id} has too many eagerly addressable frames`);
        let modeBytes = 0;
        for (const asset of modeAssets) {
          assert.doesNotMatch(asset, localPathPattern, `${device.id} turntable leaks a local path`);
          assert.doesNotMatch(asset, /\/\//, `${device.id} turntable frame must use a canonical single-slash path`);
          assert.ok(!hasGeometryOrSourceExtension(asset), `${device.id} turntable references geometry/source data`);
          const assetUrl = asset.startsWith('/')
            ? asset
            : `${viewer.turntableManifestEndpoint.slice(0, viewer.turntableManifestEndpoint.lastIndexOf('/') + 1)}${asset}`;
          assert.ok(rasterExtensions.has(extname(assetUrl.split(/[?#]/, 1)[0]).toLowerCase()));
          const assetInfo = await stat(endpointToPublicPath(assetUrl));
          assert.ok(assetInfo.isFile(), `${assetUrl} must exist`);
          assert.ok(assetInfo.size <= maxTurntableFrameBytes, `${assetUrl} exceeds the per-frame raster budget`);
          modeBytes += assetInfo.size;
          referencedAssets.push(assetUrl);
        }
        assert.ok(modeBytes <= maxTurntableModeBytes, `${device.id}/${mode.id} exceeds the per-mode preview budget`);
        packageBytes += modeBytes;
      }
      assert.ok(referencedAssets.length >= 8, `${device.id} turntable must contain a useful raster sequence`);
      assert.ok(referencedAssets.length <= maxTurntablePackageFrames, `${device.id} turntable exposes too many raster frames in total`);
      assert.equal(new Set(referencedAssets).size, referencedAssets.length, `${device.id} turntable must not duplicate frame paths across modes`);
      assert.ok(packageBytes <= maxTurntablePackageBytes, `${device.id} turntable exceeds the public preview package budget`);

      for (const key of [
        'geometryPublished', 'sourceCadPublished', 'meshPublished',
        'assemblyTreePublished', 'dimensionsPublished', 'cadMetadataPublished',
        'measurementEnabled', 'interactiveGeometryDelivered', 'sectionCoordinatesPublished',
      ]) {
        assert.equal(turntable.securityBoundary?.[key], false, `${device.id} must explicitly deny ${key}`);
      }
      assert.equal(turntable.securityBoundary?.watermarkEmbeddedInEveryFrame, true);
      assert.equal(turntable.securityBoundary?.modeFramesOnly, true);

      const declaredHashes = turntable.integrity?.frameSha256;
      assert.ok(Array.isArray(declaredHashes), `${device.id} must declare raster integrity hashes`);
      assert.equal(declaredHashes.length, referencedAssets.length, `${device.id} integrity list must cover every mode frame`);
      const expectedHashes = new Set(declaredHashes.map((digest) => String(digest).toLowerCase()));
      assert.equal(expectedHashes.size, referencedAssets.length, `${device.id} integrity hashes must be unique`);
      for (const assetUrl of referencedAssets) {
        const digest = createHash('sha256').update(await readFile(endpointToPublicPath(assetUrl))).digest('hex');
        assert.ok(expectedHashes.has(digest), `${assetUrl} is not covered by the published integrity declaration`);
      }

      const previewFiles = await walkFiles(resolve(turntablePath, '..'));
      const allowedFiles = new Set([
        turntablePath,
        ...referencedAssets.map((assetUrl) => endpointToPublicPath(assetUrl)),
      ].map((pathname) => resolve(pathname).toLowerCase()));
      let actualPreviewPackageBytes = 0;
      for (const pathname of previewFiles) {
        assert.ok(allowedFiles.has(resolve(pathname).toLowerCase()), `${device.id} preview package contains an undeclared asset: ${relative(publicRoot, pathname)}`);
        assert.ok(pathname === turntablePath || rasterExtensions.has(extname(pathname).toLowerCase()), `${device.id} preview package may contain only its manifest and raster frames`);
        actualPreviewPackageBytes += (await stat(pathname)).size;
      }
      assert.equal(previewFiles.length, allowedFiles.size, `${device.id} preview package declarations and files must match exactly`);
      assert.equal(actualPreviewPackageBytes, packageBytes, `${device.id} package budget must cover every shipped preview asset`);

      for (const value of collectStrings(turntable)) {
        assert.doesNotMatch(value, localPathPattern, `${device.id} turntable manifest leaks a local path`);
        if (/^(?:[./]|[a-z][a-z0-9+.-]*:)/i.test(value)) {
          assert.ok(!hasGeometryOrSourceExtension(value), `${device.id} turntable manifest exposes geometry/source: ${value}`);
        }
      }
    } else {
      assert.equal(viewer.turntableManifestEndpoint, null, `${device.id} non-turntable viewer must not expose a turntable endpoint`);
    }

    if (viewer.mode === 'metadata-only') {
      assert.equal(device.delivery, 'local-only');
    }

    if (identifiesIterDevice(device.id)) {
      assert.equal(viewer.mode, 'real-3d', `${device.id} must use the authorized interactive browser package`);
      assert.equal(device.delivery, 'public-static', `${device.id} must explicitly declare the public simplified derivative`);
      assert.equal(viewer.manifestEndpoint, iterManifestEndpoint);
    }

    if (identifiesEhlDevice(device.id)) {
      assert.equal(viewer.mode, 'real-3d', `${device.id} must use the authorized preliminary interactive package`);
      assert.equal(device.delivery, 'public-static', `${device.id} must explicitly declare the public simplified derivative`);
      assert.equal(viewer.manifestEndpoint, ehlManifestEndpoint);
    }

    for (const value of collectStrings(device)) {
      assert.doesNotMatch(value, localPathPattern, `${device.id} catalog entry leaks a local path`);
      if (identifiesIterDevice(device.id)) assert.ok(!hasGeometryOrSourceExtension(value),
        `${device.id} catalog entry must expose only the manifest endpoint, never direct geometry/source: ${value}`);
    }
  }
});

test('homepage prototype workspace exposes no direct EXL/ITER/EHL model download link or private filesystem path', async () => {
  const response = await renderHomepageWorkspace();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, localPathPattern);

  const publicUrls = [...html.matchAll(/\b(?:href|src|data-[\w-]*(?:src|url))=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  for (const url of publicUrls) {
    if (!identifiesProtectedDevice(url) || !hasGeometryOrSourceExtension(url)) continue;
    assert.fail(`digital-prototype must not server-render a direct protected model/source URL: ${url}`);
  }
  assert.doesNotMatch(html, /<a\b[^>]*(?:href=["'][^"']*\.(?:glb|gltf|step|stp|zip|pptx?)[^"']*["']|\bdownload\b)[^>]*>/i,
    'homepage prototype workspace must expose no direct model/source download UI');
  assert.match(html, /(?:technically saved|技术性保存|无法从技术上(?:阻止|保证))/i,
    'page must disclose that browser-delivered geometry cannot be made non-copyable');
});

test('controlled raster previews and authorized EXL browser geometry receive defense-in-depth response headers', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'models/device-catalog.json'), 'utf8'));
  const exlManifestEndpoint = catalog.devices.find((device) => identifiesExlDevice(device.id))?.viewer?.manifestEndpoint;
  assert.equal(typeof exlManifestEndpoint, 'string');
  const exlManifest = JSON.parse(await readFile(endpointToPublicPath(exlManifestEndpoint), 'utf8'));
  for (const pathname of [exlManifestEndpoint, ...exlManifest.assets.webModels.map((asset) => asset.path), exlManifest.assets.poster.path]) {
    for (const init of [{ method: 'GET' }, { method: 'HEAD' }, { method: 'GET', headers: { Range: 'bytes=0-63' } }]) {
      const response = await fetchFromWorker(pathname, init);
      assert.ok([200, 206].includes(response.status), `${init.method} ${pathname} must be served`);
      assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*(?:private\s*,\s*)?no-store(?:\s*,|$)/i);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
      assert.match(response.headers.get('content-disposition') ?? '', /^inline\b/i);
    }
  }
  for (const pathname of [
    '/device-assets/exl50u-interactive/not-allowed.glb',
    '/device-assets/other-device/model-manifest.json',
    '/models/exl50u-interactive/exl50u-interactive.glb',
    '/models/exl50u-interactive/exl50u-interactive-high.meshopt.glb',
  ]) {
    const response = await fetchFromWorker(pathname);
    assert.equal(response.status, 404, `${pathname} must fail closed`);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
  }
});

test('ITER high-detail proxy enforces its content-addressed HTTP and header boundary', async (t) => {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('iter-proxy-contract-test', `${process.pid}-${Date.now()}`);
  const { proxyIterHighDetailAsset } = await import(workerUrl.href);
  assert.equal(typeof proxyIterHighDetailAsset, 'function');

  const payload = new Uint8Array(128);
  const digest = createHash('sha256').update(payload).digest('hex');
  const filename = `cs.${digest}.high.meshopt.glb`;
  const route = `/device-assets/iter-high-detail/v1/${filename}`;
  const asset = {
    bytes: payload.byteLength,
    upstreamUrl: `https://github.com/tianshao1992/fusion-physics-atlas-assets/releases/download/iter-education-hd-v1/${filename}`,
  };
  const partialResponse = (first, last, headers = {}) => new Response(payload.slice(first, last + 1), {
    status: 206,
    headers: {
      'Content-Length': String(last - first + 1),
      'Content-Range': `bytes ${first}-${last}/${payload.byteLength}`,
      ...headers,
    },
  });

  await t.test('forwards only byte validators, serves a verified 206 and strips unsafe response headers', async () => {
    let captured;
    const response = await proxyIterHighDetailAsset(new Request(`http://localhost${route}`, {
      headers: {
        Authorization: 'Bearer never-forward',
        Cookie: 'session=never-forward',
        'If-Modified-Since': 'Sat, 15 Aug 2026 12:00:00 GMT',
        'If-None-Match': '"component-v1"',
        'If-Range': '"range-v1"',
        Origin: 'https://sensitive.example',
        Range: 'bytes=0-63',
        Referer: 'https://sensitive.example/private',
        'X-Forwarded-For': '192.0.2.1',
      },
    }), asset, async (input, init) => {
      captured = { input, init };
      return partialResponse(0, 63, {
        'Clear-Site-Data': '"*"',
        'Content-Encoding': 'identity',
        'Content-Security-Policy': "default-src 'none'",
        ETag: '"component-v1"',
        'Last-Modified': 'Sat, 15 Aug 2026 12:00:00 GMT',
        'Set-Cookie': 'upstream=never-forward',
      });
    });

    assert.equal(captured.input, asset.upstreamUrl);
    assert.equal(captured.init.method, 'GET');
    assert.equal(captured.init.redirect, 'follow');
    const forwarded = new Headers(captured.init.headers);
    assert.equal(forwarded.get('accept-encoding'), 'identity');
    assert.equal(forwarded.get('range'), 'bytes=0-63');
    assert.equal(forwarded.get('if-range'), '"range-v1"');
    assert.equal(forwarded.get('if-none-match'), '"component-v1"');
    assert.equal(forwarded.get('if-modified-since'), 'Sat, 15 Aug 2026 12:00:00 GMT');
    for (const sensitive of ['authorization', 'cookie', 'origin', 'referer', 'x-forwarded-for']) {
      assert.equal(forwarded.get(sensitive), null, `${sensitive} must not reach the release host`);
    }

    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 64);
    assert.equal(response.headers.get('content-range'), 'bytes 0-63/128');
    assert.equal(response.headers.get('content-length'), '64');
    assert.equal(response.headers.get('etag'), '"component-v1"');
    assert.equal(response.headers.get('last-modified'), 'Sat, 15 Aug 2026 12:00:00 GMT');
    assert.match(response.headers.get('cache-control') ?? '', /public.*max-age=31536000.*immutable/i);
    assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.match(response.headers.get('content-disposition') ?? '', /^inline\b/i);
    for (const unsafe of ['clear-site-data', 'content-encoding', 'content-security-policy', 'set-cookie']) {
      assert.equal(response.headers.get(unsafe), null, `${unsafe} must not cross the proxy boundary`);
    }
  });

  await t.test('normalizes open, suffix and clamped ranges and rejects a mismatched upstream range', async () => {
    for (const [header, first, last] of [
      ['bytes=64-', 64, 127],
      ['bytes=-16', 112, 127],
      ['bytes=120-999', 120, 127],
      ['bytes=-999', 0, 127],
    ]) {
      const response = await proxyIterHighDetailAsset(
        new Request(`http://localhost${route}`, { headers: { Range: header } }),
        asset,
        async () => partialResponse(first, last),
      );
      assert.equal(response.status, 206, header);
      assert.equal(response.headers.get('content-range'), `bytes ${first}-${last}/128`);
    }
    const wrongRange = await proxyIterHighDetailAsset(
      new Request(`http://localhost${route}`, { headers: { Range: 'bytes=0-63' } }),
      asset,
      async () => partialResponse(64, 127),
    );
    assert.equal(wrongRange.status, 502);
    assert.match(wrongRange.headers.get('cache-control') ?? '', /no-store/i);

    const missingLength = await proxyIterHighDetailAsset(
      new Request(`http://localhost${route}`, { headers: { Range: 'bytes=0-63' } }),
      asset,
      async () => new Response(payload.slice(0, 64), {
        status: 206,
        headers: { 'Content-Range': 'bytes 0-63/128' },
      }),
    );
    assert.equal(missingLength.status, 502, 'a 206 without exact Content-Length must fail closed');
  });

  await t.test('accepts a full 200 when If-Range does not match and suppresses every HEAD body', async () => {
    let ifRange;
    const full = await proxyIterHighDetailAsset(new Request(`http://localhost${route}`, {
      headers: { Range: 'bytes=0-63', 'If-Range': '"stale"' },
    }), asset, async (_input, init) => {
      ifRange = new Headers(init.headers).get('if-range');
      return new Response(payload, { status: 200, headers: { 'Content-Length': '128' } });
    });
    assert.equal(ifRange, '"stale"');
    assert.equal(full.status, 200);
    assert.equal((await full.arrayBuffer()).byteLength, 128);

    const head = await proxyIterHighDetailAsset(
      new Request(`http://localhost${route}`, { method: 'HEAD' }),
      asset,
      async () => new Response(payload, { status: 200, headers: { 'Content-Length': '128' } }),
    );
    assert.equal(head.status, 200);
    assert.equal(head.body, null);
    assert.equal(head.headers.get('content-length'), '128');
  });

  await t.test('keeps 304 validators but never an upstream body or unsafe header', async () => {
    const response = await proxyIterHighDetailAsset(
      new Request(`http://localhost${route}`, { headers: { 'If-None-Match': '"component-v1"' } }),
      asset,
      async () => new Response(null, {
        status: 304,
        headers: {
          ETag: '"component-v1"',
          'Last-Modified': 'Sat, 15 Aug 2026 12:00:00 GMT',
          'Set-Cookie': 'upstream=never-forward',
        },
      }),
    );
    assert.equal(response.status, 304);
    assert.equal(response.body, null);
    assert.equal(response.headers.get('etag'), '"component-v1"');
    assert.equal(response.headers.get('last-modified'), 'Sat, 15 Aug 2026 12:00:00 GMT');
    assert.equal(response.headers.get('set-cookie'), null);

    const unsolicited = await proxyIterHighDetailAsset(
      new Request(`http://localhost${route}`),
      asset,
      async () => new Response(null, { status: 304, headers: { ETag: '"unexpected"' } }),
    );
    assert.equal(unsolicited.status, 502, 'an unconditional request must not accept an empty 304');
  });

  await t.test('rejects malformed, multiple and unsatisfiable ranges locally with 416', async () => {
    let calls = 0;
    const shouldNotFetch = async () => { calls += 1; return new Response(payload); };
    for (const header of ['bytes=0-1,4-5', 'items=0-1', 'bytes=64-63', 'bytes=128-', 'bytes=-0']) {
      const response = await proxyIterHighDetailAsset(
        new Request(`http://localhost${route}`, { headers: { Range: header } }),
        asset,
        shouldNotFetch,
      );
      assert.equal(response.status, 416, header);
      assert.equal(response.headers.get('content-range'), 'bytes */128');
      assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
    }
    assert.equal(calls, 0);
  });

  await t.test('preserves a valid upstream 416 and Retry-After on 429, while sanitizing both', async () => {
    const unsatisfied = await proxyIterHighDetailAsset(
      new Request(`http://localhost${route}`, { headers: { Range: 'bytes=0-63' } }),
      asset,
      async () => new Response('upstream detail', {
        status: 416,
        headers: { 'Content-Range': 'bytes */128', 'Set-Cookie': 'never=forward' },
      }),
    );
    assert.equal(unsatisfied.status, 416);
    assert.equal(unsatisfied.headers.get('content-range'), 'bytes */128');
    assert.equal(unsatisfied.headers.get('set-cookie'), null);
    assert.equal(unsatisfied.body, null);

    const limited = await proxyIterHighDetailAsset(
      new Request(`http://localhost${route}`),
      asset,
      async () => new Response('upstream detail', {
        status: 429,
        headers: { 'Retry-After': '120', 'Set-Cookie': 'never=forward' },
      }),
    );
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '120');
    assert.equal(limited.headers.get('set-cookie'), null);
    assert.equal(limited.body, null);
    assert.match(limited.headers.get('cache-control') ?? '', /no-store/i);
  });

  await t.test('maps upstream failures safely and rejects transformed or inconsistent representations', async () => {
    const serverFailure = await proxyIterHighDetailAsset(
      new Request(`http://localhost${route}`),
      asset,
      async () => new Response('upstream detail', { status: 500, headers: { 'Retry-After': '30' } }),
    );
    assert.equal(serverFailure.status, 503);
    assert.equal(serverFailure.headers.get('retry-after'), '30');

    const fetchFailure = await proxyIterHighDetailAsset(
      new Request(`http://localhost${route}`),
      asset,
      async () => { throw new Error('network unavailable'); },
    );
    assert.equal(fetchFailure.status, 502);

    for (const upstreamResponse of [
      new Response(payload, { status: 200, headers: { 'Content-Encoding': 'gzip', 'Content-Length': '128' } }),
      new Response(payload, { status: 200, headers: { 'Content-Length': '127' } }),
      new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(payload);
          controller.close();
        },
      }), { status: 200 }),
      new Response('missing', { status: 404 }),
      new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */127' } }),
    ]) {
      const response = await proxyIterHighDetailAsset(
        new Request(`http://localhost${route}`), asset, async () => upstreamResponse,
      );
      assert.equal(response.status, 502);
      assert.equal(response.body, null);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
    }
  });

  await t.test('unknown and legacy un-hashed paths never trigger the release host', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error('must not fetch'); };
    try {
      for (const pathname of [
        '/device-assets/iter-high-detail/v1/not-reviewed.high.meshopt.glb',
        '/device-assets/iter-high-detail/v1/cs.high.meshopt.glb',
        `/device-assets/iter-high-detail/v1/cs.${'f'.repeat(64)}.high.meshopt.glb`,
      ]) {
        const response = await fetchFromWorker(pathname);
        assert.equal(response.status, 404, pathname);
      }
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('ITER high-detail delivery is local-first and only uses a strictly configured mirror after a local 404', async (t) => {
  const manifest = JSON.parse(await readFile(endpointToPublicPath(iterManifestEndpoint), 'utf8'));
  const component = manifest.assets?.componentBundles?.[0]?.components?.find((item) => item.path.split('/').at(-1)?.startsWith('cs.'));
  assert.ok(component);
  const filename = component.path.split('/').at(-1);
  const localPath = `/models/iter-high-detail-v1/${filename}`;
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('iter-local-first-test', `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const context = { waitUntil() {}, passThroughOnException() {} };

  await t.test('serves the exact local allowlisted file before consulting any mirror', async () => {
    const originalFetch = globalThis.fetch;
    let remoteCalls = 0;
    let localRequest;
    globalThis.fetch = async () => {
      remoteCalls += 1;
      throw new Error('the mirror must not be reached');
    };
    try {
      const response = await worker.fetch(
        new Request(`http://localhost${component.path}`, {
          method: 'HEAD',
          headers: { Authorization: 'Bearer never-forward', Cookie: 'never=forward' },
        }),
        {
          ITER_HIGH_DETAIL_ASSET_BASE_URL: 'not a valid URL',
          ASSETS: { fetch: async (request) => {
            localRequest = request;
            return new Response(null, {
              status: 200,
              headers: { 'Content-Length': String(component.bytes), ETag: `"${component.sha256}"` },
            });
          } },
        },
        context,
      );
      assert.equal(new URL(localRequest.url).pathname, localPath);
      assert.equal(localRequest.method, 'HEAD');
      assert.equal(localRequest.headers.get('authorization'), null);
      assert.equal(localRequest.headers.get('cookie'), null);
      assert.equal(localRequest.headers.get('accept-encoding'), 'identity');
      assert.equal(response.status, 200);
      assert.equal(response.body, null);
      assert.equal(response.headers.get('content-length'), String(component.bytes));
      assert.equal(remoteCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('appends only the allowlisted filename to a valid mirror base', async () => {
    const originalFetch = globalThis.fetch;
    const mirrorBase = 'https://assets.internal.example/fusion/iter-v1/';
    let remoteRequest;
    let localCalls = 0;
    globalThis.fetch = async (input, init) => {
      remoteRequest = { input, init };
      return new Response(null, {
        status: 200,
        headers: { 'Content-Length': String(component.bytes), ETag: `"${component.sha256}"` },
      });
    };
    try {
      const response = await worker.fetch(
        new Request(`http://localhost${component.path}`, { method: 'HEAD' }),
        {
          ITER_HIGH_DETAIL_ASSET_BASE_URL: mirrorBase,
          ASSETS: { fetch: async (request) => {
            localCalls += 1;
            assert.equal(new URL(request.url).pathname, localPath);
            return new Response('Not found', { status: 404 });
          } },
        },
        context,
      );
      assert.equal(response.status, 200);
      assert.equal(localCalls, 1);
      assert.equal(remoteRequest.input, `${mirrorBase}${filename}`);
      assert.equal(remoteRequest.init.method, 'HEAD');
      assert.equal(new Headers(remoteRequest.init.headers).get('accept-encoding'), 'identity');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('fails closed for credentials, query, hash, non-http or non-canonical mirror values', async () => {
    const originalFetch = globalThis.fetch;
    let remoteCalls = 0;
    globalThis.fetch = async () => {
      remoteCalls += 1;
      return new Response(null, { status: 200, headers: { 'Content-Length': String(component.bytes) } });
    };
    try {
      for (const base of [
        'ftp://assets.internal.example/iter',
        'https://user:secret@assets.internal.example/iter',
        'https://assets.internal.example/iter?token=secret',
        'https://assets.internal.example/iter#release',
        '../relative',
        ' https://assets.internal.example/iter',
      ]) {
        const response = await worker.fetch(
          new Request(`http://localhost${component.path}`, { method: 'HEAD' }),
          {
            ITER_HIGH_DETAIL_ASSET_BASE_URL: base,
            ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
          },
          context,
        );
        assert.equal(response.status, 503, base);
        assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
      }
      assert.equal(remoteCalls, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await t.test('never exposes the hydrated storage path as a public bypass', async () => {
    let localCalls = 0;
    const response = await worker.fetch(
      new Request(`http://localhost${localPath}`, { method: 'HEAD' }),
      { ASSETS: { fetch: async () => { localCalls += 1; return new Response(null, { status: 200 }); } } },
      context,
    );
    assert.equal(response.status, 404);
    assert.equal(localCalls, 0);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
  });
});

test('ITER high-detail production allowlist exactly mirrors the reviewed manifest bundle', async () => {
  const manifest = JSON.parse(await readFile(endpointToPublicPath(iterManifestEndpoint), 'utf8'));
  const bundle = manifest.assets?.componentBundles?.[0];
  assert.ok(bundle, 'the reviewed component bundle must exist before the Worker allowlist is enabled');
  assert.equal(bundle.components?.length, 18);

  const releaseBase = 'https://github.com/tianshao1992/fusion-physics-atlas-assets/releases/download/iter-education-hd-v1/';
  const byUpstreamUrl = new Map(bundle.components.map((component) => {
    assert.match(component.path, /^\/device-assets\/iter-high-detail\/v1\/[a-z0-9-]+\.[a-f0-9]{64}\.high\.meshopt\.glb$/);
    const filename = component.path.split('/').at(-1);
    assert.ok(filename.includes(`.${component.sha256}.`), `${component.partId} route must embed its declared digest`);
    return [`${releaseBase}${filename}`, component];
  }));
  assert.equal(byUpstreamUrl.size, 18);

  const originalFetch = globalThis.fetch;
  const requested = new Set();
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const component = byUpstreamUrl.get(url);
    assert.ok(component, `Worker requested an undeclared release URL: ${url}`);
    assert.equal(init.method, 'HEAD');
    assert.equal(new Headers(init.headers).get('accept-encoding'), 'identity');
    requested.add(url);
    return new Response(null, {
      status: 200,
      headers: { 'Content-Length': String(component.bytes), ETag: `"${component.sha256}"` },
    });
  };
  try {
    for (const component of bundle.components) {
      const response = await fetchFromWorker(component.path, { method: 'HEAD' });
      assert.equal(response.status, 200, `${component.partId} must be on the exact Worker allowlist`);
      assert.equal(response.body, null);
      assert.equal(response.headers.get('content-length'), String(component.bytes));
      assert.match(response.headers.get('cache-control') ?? '', /public.*immutable/i);
    }
    assert.equal(requested.size, 18, 'every and only reviewed component release must be reachable');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Paramak interaction controls remain public-only and expose consistent accessible state', async () => {
  const source = await readFile(resolve(repositoryRoot, 'app/components/TokamakCadViewer.tsx'), 'utf8');
  const manifestParser = await readFile(resolve(repositoryRoot, 'app/components/deviceManifest.ts'), 'utf8');
  const catalogParser = await readFile(resolve(repositoryRoot, 'app/digital-prototype/deviceCatalog.ts'), 'utf8');
  const workspace = await readFile(resolve(repositoryRoot, 'app/digital-prototype/MultiDeviceWorkspace.tsx'), 'utf8');
  const turntableSource = await readFile(resolve(repositoryRoot, 'app/digital-prototype/TurntableDeviceViewer.tsx'), 'utf8');

  assert.match(source, /loadedManifest\.access\.classification\s*!==\s*['"]PUBLIC['"]/);
  assert.match(source, /!loadedManifest\.access\.redistributionAllowed/);
  assert.match(source, /type="search"[^>]*value=\{query\}/s);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /aria-pressed=\{selectedPartIds\.has\(part\.id\)\}/);
  assert.match(source, /aria-pressed=\{hiddenPartIds\.has\(part\.id\)\}/);
  assert.match(source, /aria-pressed=\{clipping\}/);
  assert.match(source, /<label><span>\{t\('viewer\.globalOpacity'\)\}<\/span>[\s\S]{0,180}<input type="range"/s);
  assert.match(source, /<label><span>\{t\('viewer\.clipPlane',[\s\S]{0,100}<input type="range"/s);
  assert.match(source, /setGlobalOpacity\(1\)/);
  assert.match(source, /setSelectedOpacity\(1\)/);
  assert.match(source, /setClipOffset\(defaultInteraction\.clipOffset\)/);
  assert.match(source, /setHiddenPartIds\(new Set\(\)\)/);
  assert.match(source, /setIsolatedPartIds\(new Set\(\)\)/);
  assert.match(source, /setSelectedPartIds\(new Set\(\)\)/);
  assert.match(await readFile(resolve(repositoryRoot, 'app/digital-prototype/TurntableDeviceViewer.tsx'), 'utf8'), /!value\.includes\('%'\)[\s\S]{0,80}!value\.includes\('\/\/'\)/);
  assert.match(source, /selectedPartIdsRef\.current\s*=\s*next/);
  assert.match(source, /semanticHighlightMaterial[^\n]*opacity:\s*1/);
  assert.match(source, /const selectedMaterial = baseMaterial\.clone\(\)/);
  assert.match(source, /opacityRef\.current\.global\s*=\s*value[\s\S]*?setOpacity\(value,\s*opacityRef\.current\.selected\)/,
    'global opacity must use the latest selected-opacity value rather than a render-time closure');
  assert.match(source, /opacityRef\.current\.selected\s*=\s*value[\s\S]*?setOpacity\(opacityRef\.current\.global,\s*value\)/,
    'selected opacity must use the latest global-opacity value rather than a render-time closure');
  for (const independentInteraction of [
    /updateClipAxis\s*=\s*\([^)]*\)\s*=>\s*\{[^}]*setClipping/,
    /toggleClipping\s*=\s*\(\)\s*=>\s*\{[^}]*setClipping/,
    /togglePartVisibility\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?applyVisibility/,
  ]) {
    const handler = source.match(independentInteraction)?.[0] ?? '';
    assert.doesNotMatch(handler, /setGlobalOpacity|setSelectedOpacity|setOpacity\(/,
      'clip-axis, clipping and visibility handlers must not reset opacity');
  }

  assert.match(manifestParser, /value\.startsWith\(['"]\/models\/['"]\)/);
  assert.match(manifestParser, /value\.startsWith\(['"]\/device-assets\/exl50u-interactive\/['"]\)/);
  assert.match(manifestParser, /value\.startsWith\(['"]\/device-assets\/iter-high-detail\/['"]\)/);
  assert.match(catalogParser, /result\.startsWith\(['"]\/device-assets\/exl50u-interactive\/['"]\)/);
  for (const rejectedPathToken of ["'..'", "'%'", "'//'" ]) {
    assert.ok(manifestParser.includes(`value.includes(${rejectedPathToken})`), `manifest parser must reject ${rejectedPathToken}`);
    assert.ok(catalogParser.includes(`result.includes(${rejectedPathToken})`), `catalog parser must reject ${rejectedPathToken}`);
  }

  assert.match(workspace, /device\.viewer\.mode === ['"]real-3d['"]/);
  assert.match(workspace, /showDownloadActions=\{false\}/);
  assert.match(workspace, /device\.viewer\.mode === ['"]turntable-3d['"]/);
  assert.match(turntableSource, /value\.startsWith\(['"]\/models\/exl50u-secure-preview\/['"]\)/);
  assert.match(turntableSource, /!value\.includes\(['"]%['"]\)/);
  assert.match(turntableSource, /!value\.includes\(['"]\/\/['"]\)/);
  assert.match(turntableSource, /tabIndex=\{0\}/);
  assert.match(turntableSource, /aria-pressed=\{candidate\.id === mode\.id\}/);
  assert.doesNotMatch(turntableSource, /(?:GLTFLoader|from\s+['"]three|\.glb|\.gltf|\.step|\.stp)/i,
    'EXL turntable viewer must remain raster-only and must not import geometry loaders');
});

test('EXL, ITER and EHL use lifecycle-safe industrial silver appearance without changing Paramak semantics', async () => {
  const source = await readFile(resolve(repositoryRoot, 'app/components/TokamakCadViewer.tsx'), 'utf8');
  const workspace = await readFile(resolve(repositoryRoot, 'app/digital-prototype/MultiDeviceWorkspace.tsx'), 'utf8');
  const appearanceSource = await readFile(resolve(repositoryRoot, 'app/components/device-viewer/industrialAppearance.ts'), 'utf8');
  const messagesSource = await readFile(resolve(repositoryRoot, 'app/i18n/messages.ts'), 'utf8');
  const manifest = JSON.parse(await readFile(resolve(publicRoot, 'models/exl50u-interactive/model-manifest.json'), 'utf8'));
  const ehlManifest = JSON.parse(await readFile(resolve(publicRoot, 'models/ehl2-preliminary-v1/model-manifest.json'), 'utf8'));
  const appearance = await import('../app/components/device-viewer/industrialAppearance.ts');

  assert.match(workspace, /appearancePreset=\{device\.id === ['"]exl-50u-2026-upgrade['"][\s\S]{0,220}device\.id === ['"]iter-educational-model['"][\s\S]{0,220}device\.id === ['"]ehl-2-preliminary['"][\s\S]{0,120}\? ['"]industrial-silver-v1['"][\s\S]{0,80}: ['"]semantic['"]\}/);
  assert.match(source, /RoomEnvironment\.js/);
  assert.match(source, /new THREE\.PMREMGenerator\(renderer\)/);
  assert.match(source, /scene\.environment = localEnvironmentTarget\.texture/);
  assert.match(source, /if \(localScene\) localScene\.environment = null;[\s\S]{0,120}localEnvironmentTarget\?\.dispose\(\)/,
    'the scene must release its environment reference before the PMREM render target');
  assert.match(source, /interactiveMaterials\(\)\.forEach\(\(material\) => \{[\s\S]{0,180}wireframe/s);
  assert.match(source, /interactiveMaterials\(\)\.forEach\(\(material\) => \{[\s\S]{0,180}clippingPlanes/s);
  assert.match(source, /const selectedMaterial = baseMaterial\.clone\(\)/);
  assert.match(source, /originalMaterials\.forEach\(\(material, mesh\) => \{ mesh\.material = baseMaterialByMesh\.get\(mesh\) \?\? material; \}\)/);
  assert.match(appearanceSource, /presentation-only appearance codes/);
  assert.match(source, /t\(['"]viewer\.appearanceDisclaimer['"]\)/);
  assert.match(messagesSource, /不代表真实材料、涂层、表面状态或温度场/);
  assert.match(messagesSource, /do not represent real materials, coatings, surface condition or temperature/i);
  assert.match(workspace, /showFootnotes=\{false\}/,
    'the compact digital-prototype workbench must suppress long-form viewer footnotes');

  const systemIds = manifest.systems.map((system) => system.id).sort();
  assert.deepEqual(Object.keys(appearance.EXL50U_INDUSTRIAL_SYSTEM_PRESETS).sort(), systemIds,
    'every reviewed EXL system must receive one explicit visual material preset');
  const ehlSystemIds = ehlManifest.systems.map((system) => system.id).sort();
  assert.deepEqual(Object.keys(appearance.EHL2_INDUSTRIAL_SYSTEM_PRESETS).sort(), ehlSystemIds,
    'every reviewed EHL system must receive one explicit industrial-silver material preset');
  assert.equal(ehlSystemIds.length, 5, 'the six EHL parts must remain grouped into five reviewed systems');
  assert.equal(appearance.resolveIndustrialMaterialPreset('unknown-system', 'structure'), 'brushed-steel');
  assert.ok(new Set(Object.values(appearance.EXL50U_INDUSTRIAL_SYSTEM_PRESETS)).size >= 5,
    'the silver scheme must retain enough finish contrast to distinguish structures');
});

test('EXL, ITER and EHL viewers open and reset to an active Z section through the device centre', async () => {
  const source = await readFile(resolve(repositoryRoot, 'app/components/TokamakCadViewer.tsx'), 'utf8');
  const workspace = await readFile(resolve(repositoryRoot, 'app/digital-prototype/MultiDeviceWorkspace.tsx'), 'utf8');

  assert.match(workspace, /const defaultCoreSection\s*=\s*Boolean\(efitOverlay\)\s*\|\|\s*device\.id\s*===\s*['"]iter-educational-model['"]\s*\|\|\s*device\.id\s*===\s*['"]ehl-2-preliminary['"]/);
  assert.match(workspace, /defaultClipping=\{defaultCoreSection\}/);
  assert.match(workspace, /defaultClipAxis=\{defaultCoreSection\s*\?\s*['"]z['"]\s*:\s*['"]x['"]\}/);
  assert.match(workspace, /defaultClipOffset=\{efitOverlay\s*\?\s*0\.08\s*:\s*0\}/);
  assert.match(source, /useState\(initialDiagnosticViewerState\?\.clipping \?\? defaultInteraction\.clipping\)/);
  assert.match(source, /useState<ClipAxis>\(initialDiagnosticViewerState\?\.clipAxis \?\? defaultInteraction\.clipAxis\)/);
  assert.match(source, /useState\(initialDiagnosticViewerState\?\.clipOffset \?\? defaultInteraction\.clipOffset\)/);
  assert.match(source, /clippingPlane\.constant\s*=\s*offset\s*\*\s*modelRadius/,
    'the non-zero default offset must be converted into a real model-space clipping plane');
  assert.match(source, /setClipping\(defaultInteraction\.clipping,\s*defaultInteraction\.clipAxis,\s*defaultInteraction\.clipOffset\)/,
    'reset must restore the EXL section instead of turning clipping off');
  assert.match(source, /key=\{`\$\{sessionViewerId\}:\$\{sessionManifestUrl\}:\$\{sessionAppearancePreset\}`\}/,
    'switching devices must create a fresh viewer session with the correct device defaults');
});

test('EHL viewer fails closed on constrained clients, bounds wireframe memory and scopes its Meshopt worker', async () => {
  const source = await readFile(resolve(repositoryRoot, 'app/components/TokamakCadViewer.tsx'), 'utf8');
  const policySource = await readFile(resolve(repositoryRoot, 'app/components/device-viewer/ehl2RuntimePolicy.ts'), 'utf8');
  const messagesSource = await readFile(resolve(repositoryRoot, 'app/i18n/messages.ts'), 'utf8');

  assert.match(policySource, /EHL2_MIN_VIEWPORT_WIDTH\s*=\s*651/);
  assert.match(policySource, /EHL2_MIN_DEVICE_MEMORY_GIB\s*=\s*4/);
  assert.match(policySource, /userAgentDataMobile[\s\S]{0,500}Android\|webOS\|iPhone\|iPad[\s\S]{0,500}Macintosh/,
    'mobile detection must cover UA Client Hints, conventional mobile UAs and iPad desktop-mode UAs');
  assert.match(policySource, /hints\.saveData[\s\S]{0,220}deviceMemoryGiB[\s\S]{0,180}EHL2_MIN_DEVICE_MEMORY_GIB/);
  assert.match(source, /const ehl2LoadBlocked\s*=\s*ehl2Session\s*&&\s*ehl2RuntimePolicy\?\.allowed\s*!==\s*true/,
    'an unknown or rejected EHL policy must not expose the load action');

  const activateBlock = source.slice(source.indexOf('const activate = useCallback'), source.indexOf("fetch(manifestUrl"));
  assert.ok(activateBlock.indexOf('currentEhl2RuntimePolicy()') < activateBlock.indexOf("setStatus('loading')"),
    'the EHL policy must be rechecked synchronously before explicit loading starts');
  assert.match(activateBlock, /if \(!policy\.allowed\)[\s\S]{0,180}return/);

  const blockedPanelLine = source.split(/\r?\n/).find((line) => line.includes("status === 'idle' && ehl2LoadBlocked")) ?? '';
  assert.match(blockedPanelLine, /viewer\.ehlRequirements/);
  assert.doesNotMatch(blockedPanelLine, /<button/,
    'blocked EHL sessions must explain requirements without exposing a launch button');
  assert.match(source, /\{wireframeAllowed\s*&&\s*<button[^>]*>[\s\S]{0,220}viewer\.wireframe/,
    'the EHL toolbar must omit the wireframe control');
  assert.match(source, /setWireframe:\s*\(enabled\)\s*=>\s*\{[\s\S]{0,220}if \(ehl2Session && enabled\) return/,
    'the viewer API must also reject programmatic EHL wireframe activation');

  const decodeBlock = source.slice(source.indexOf('globalModelDecodeGate.run(async'), source.indexOf('if (disposed)', source.indexOf('globalModelDecodeGate.run(async')));
  assert.match(decodeBlock, /ehl2Session[\s\S]{0,500}useWorkers\(1\)/,
    'only an EHL session may opt the shared decoder into one worker');
  assert.match(decodeBlock, /finally\s*\{[\s\S]{0,120}ehl2MeshoptWorkerEnabled[\s\S]{0,80}useWorkers\(0\)/,
    'the serialized decode lane must restore the shared decoder before another device can enter');

  assert.match(messagesSource, /WebGL 2[^\n]{0,180}651 px[^\n]{0,180}4 GB/,
    'the EHL load gate must state its desktop/WebGL, viewport and memory requirements');
  assert.match(messagesSource, /wireframe is disabled to bound memory/i);
});
