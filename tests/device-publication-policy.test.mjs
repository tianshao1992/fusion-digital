import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(repositoryRoot, 'public');

const protectedDeviceTokens = new Set(['exl', 'exl50u', 'iter']);
const exlDeviceTokens = new Set(['exl', 'exl50u']);
const iterDeviceTokens = new Set(['iter']);
const geometryOrSourceExtensions = new Set([
  '.3mf', '.7z', '.brep', '.fbx', '.glb', '.gltf', '.iges', '.igs',
  '.obj', '.ppt', '.pptx', '.rar', '.step', '.stl', '.stp', '.zip',
]);
const rasterExtensions = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);
const allowedViewerModes = new Set(['real-3d', 'turntable-3d', 'metadata-only']);
const maxParamakWebModelBytes = 3 * 1024 * 1024;
const maxExlPublicDerivativeBytes = 20 * 1024 * 1024;
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
  assert.ok(['model-manifest.json', 'exl50u-interactive.glb', 'poster.webp'].includes(filename),
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

async function renderDigitalPrototype() {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('publication-policy-test', `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request('http://localhost/digital-prototype', { headers: { accept: 'text/html' } }),
    { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function fetchFromWorker(pathname) {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('publication-header-test', `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${pathname}`),
    { ASSETS: { fetch: async (request) => {
      const path = fileURLToPath(new URL(new URL(request.url).pathname.slice(1), new URL('../public/', import.meta.url)));
      try { return new Response(await readFile(path), { status: 200 }); } catch { return new Response('Not found', { status: 404 }); }
    } } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test('publishes only the catalog-authorized EXL simplified GLB and no ITER geometry or protected sources', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'models/device-catalog.json'), 'utf8'));
  const exl = catalog.devices.find((device) => identifiesExlDevice(device.id));
  assert.equal(exl?.viewer?.mode, 'real-3d', 'EXL public geometry requires an explicit real-3d catalog entry');
  const exlManifestEndpoint = exl?.viewer?.manifestEndpoint;
  assert.equal(typeof exlManifestEndpoint, 'string');
  const exlManifest = JSON.parse(await readFile(endpointToPublicPath(exlManifestEndpoint), 'utf8'));
  const authorizedWebModelEndpoint = exlManifest.assets?.webModel?.path;
  assert.equal(typeof authorizedWebModelEndpoint, 'string');
  assert.equal(extname(authorizedWebModelEndpoint).toLowerCase(), '.glb');
  endpointToPublicPath(authorizedWebModelEndpoint);
  const publicModelPath = relative(repositoryRoot, endpointToPublicPath(authorizedWebModelEndpoint)).replaceAll('\\', '/').toLowerCase();
  const builtModelPath = publicModelPath.replace(/^public\//, 'dist/client/');
  const allowedExlGeometry = new Set([publicModelPath, builtModelPath]);

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
      assert.fail(`ITER geometry/source must not be tracked or published: ${pathname}`);
    }
    if (identifiesExlDevice(pathname)) {
      assert.ok(allowedExlGeometry.has(pathname.toLowerCase()), `undeclared EXL geometry/source must not be tracked or published: ${pathname}`);
    }
  }
});

test('public device catalog is fail-closed and authorizes only bounded, verifiable browser assets', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'models/device-catalog.json'), 'utf8'));
  assert.ok(Array.isArray(catalog.devices) && catalog.devices.length >= 3);

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
      const byteBudget = isExlDerivative ? maxExlPublicDerivativeBytes : maxParamakWebModelBytes;
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
      assert.equal(webModel.subarray(0, 4).toString('ascii'), 'glTF', `${device.id} webModel must be a real binary glTF asset`);
      assert.equal(webModel.readUInt32LE(4), 2, `${device.id} webModel must use glTF 2.0`);
      assert.equal(webModel.readUInt32LE(8), webModel.byteLength, `${device.id} GLB header length must match the file`);

      const glbJsonLength = webModel.readUInt32LE(12);
      assert.equal(webModel.readUInt32LE(16), 0x4e4f534a, `${device.id} GLB must begin with a JSON chunk`);
      const glb = JSON.parse(webModel.subarray(20, 20 + glbJsonLength).toString('utf8').trim());

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
        const bounds = glb.accessors.filter((accessor) => accessor.type === 'VEC3' && Array.isArray(accessor.min) && Array.isArray(accessor.max));
        const sourceMin = bounds.reduce((result, accessor) => result.map((value, index) => Math.min(value, accessor.min[index])), [Infinity, Infinity, Infinity]);
        const sourceMax = bounds.reduce((result, accessor) => result.map((value, index) => Math.max(value, accessor.max[index])), [-Infinity, -Infinity, -Infinity]);
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
          webModelPath,
          ...(manifest.assets.poster?.path?.startsWith(`${manifestEndpoint.slice(0, manifestEndpoint.lastIndexOf('/') + 1)}`)
            ? [endpointToPublicPath(manifest.assets.poster.path)] : []),
        ].map((pathname) => resolve(pathname).toLowerCase()));
        for (const pathname of packageFiles) {
          assert.ok(allowedPackageFiles.has(resolve(pathname).toLowerCase()),
            `EXL public derivative package contains an undeclared asset: ${relative(publicRoot, pathname)}`);
        }
        assert.equal(packageFiles.length, allowedPackageFiles.size, 'EXL package files must exactly match its declared public assets');
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
      assert.equal(viewer.mode, 'metadata-only', `${device.id} must remain metadata-only`);
      assert.equal(device.delivery, 'local-only', `${device.id} must keep all geometry local-only`);
    }

    for (const value of collectStrings(device)) {
      assert.doesNotMatch(value, localPathPattern, `${device.id} catalog entry leaks a local path`);
      if (identifiesIterDevice(device.id)) {
        assert.ok(!hasGeometryOrSourceExtension(value), `${device.id} catalog entry exposes geometry/source: ${value}`);
      }
    }
  }
});

test('digital-prototype HTML exposes no direct EXL/ITER model download link or private filesystem path', async () => {
  const response = await renderDigitalPrototype();
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
    'digital-prototype must expose no direct model/source download UI');
  assert.match(html, /(?:technically saved|技术性保存|无法从技术上(?:阻止|保证))/i,
    'page must disclose that browser-delivered geometry cannot be made non-copyable');
});

test('controlled raster previews and authorized EXL browser geometry receive defense-in-depth response headers', async () => {
  const catalog = JSON.parse(await readFile(resolve(publicRoot, 'models/device-catalog.json'), 'utf8'));
  const exlManifestEndpoint = catalog.devices.find((device) => identifiesExlDevice(device.id))?.viewer?.manifestEndpoint;
  assert.equal(typeof exlManifestEndpoint, 'string');
  const exlManifest = JSON.parse(await readFile(endpointToPublicPath(exlManifestEndpoint), 'utf8'));
  for (const pathname of [exlManifestEndpoint, exlManifest.assets.webModel.path, exlManifest.assets.poster.path]) {
    const response = await fetchFromWorker(pathname);
    assert.equal(response.status, 200, `${pathname} must be served`);
    assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*(?:private\s*,\s*)?no-store(?:\s*,|$)/i);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.match(response.headers.get('content-disposition') ?? '', /^inline\b/i);
  }
  for (const pathname of [
    '/device-assets/exl50u-interactive/not-allowed.glb',
    '/device-assets/other-device/model-manifest.json',
    '/models/exl50u-interactive/exl50u-interactive.glb',
  ]) {
    const response = await fetchFromWorker(pathname);
    assert.equal(response.status, 404, `${pathname} must fail closed`);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
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
  assert.match(source, /<label><span>[^<]*透明度[^<]*<\/span>[\s\S]{0,180}<input type="range"/s);
  assert.match(source, /<label><span>[^<]*(?:剖切|切面)[^<]*<\/span>[\s\S]{0,180}<input type="range"/s);
  assert.match(source, /setGlobalOpacity\(1\)/);
  assert.match(source, /setSelectedOpacity\(1\)/);
  assert.match(source, /setClipOffset\(0\)/);
  assert.match(source, /setHiddenPartIds\(new Set\(\)\)/);
  assert.match(source, /setIsolatedPartIds\(new Set\(\)\)/);
  assert.match(source, /setSelectedPartIds\(new Set\(\)\)/);
  assert.match(await readFile(resolve(repositoryRoot, 'app/digital-prototype/TurntableDeviceViewer.tsx'), 'utf8'), /!value\.includes\('%'\)[\s\S]{0,80}!value\.includes\('\/\/'\)/);
  assert.match(source, /selectedPartIdsRef\.current\s*=\s*next/);
  assert.match(source, /highlightMaterial[^\n]*opacity:\s*1/);
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

  assert.match(manifestParser, /asset\.path\.startsWith\(['"]\/models\/['"]\)/);
  assert.match(manifestParser, /asset\.path\.startsWith\(['"]\/device-assets\/exl50u-interactive\/['"]\)/);
  assert.match(catalogParser, /result\.startsWith\(['"]\/device-assets\/exl50u-interactive\/['"]\)/);
  for (const rejectedPathToken of ["'..'", "'%'", "'//'" ]) {
    assert.ok(manifestParser.includes(`asset.path.includes(${rejectedPathToken})`), `manifest parser must reject ${rejectedPathToken}`);
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
