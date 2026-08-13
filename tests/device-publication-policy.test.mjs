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
const geometryOrSourceExtensions = new Set([
  '.3mf', '.7z', '.brep', '.fbx', '.glb', '.gltf', '.iges', '.igs',
  '.obj', '.ppt', '.pptx', '.rar', '.step', '.stl', '.stp', '.zip',
]);
const rasterExtensions = new Set(['.avif', '.jpeg', '.jpg', '.png', '.webp']);
const allowedViewerModes = new Set(['real-3d', 'turntable-3d', 'metadata-only']);
const maxParamakWebModelBytes = 3 * 1024 * 1024;
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
  assert.match(endpoint, /^\/models\/[a-z0-9_./-]+$/i, `${endpoint} must be a same-origin /models/ endpoint`);
  assert.doesNotMatch(endpoint, /(?:^|\/)\.\.(?:\/|$)/, `${endpoint} must not traverse directories`);
  assert.doesNotMatch(endpoint, /\/\//, `${endpoint} must use a canonical single-slash path`);
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

test('never publishes protected EXL-50U or ITER geometry and source archives', async () => {
  const tracked = execFileSync('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  }).split('\0').filter(Boolean);
  const published = [
    ...(await walkFiles(resolve(repositoryRoot, 'public'))),
    ...(await walkFiles(resolve(repositoryRoot, 'dist'))),
  ].map((path) => relative(repositoryRoot, path).replaceAll('\\', '/'));

  for (const pathname of new Set([...tracked, ...published])) {
    assert.ok(
      !(identifiesProtectedDevice(pathname) && hasGeometryOrSourceExtension(pathname)),
      `protected device geometry/source must not be tracked or published: ${pathname}`,
    );
  }
});

test('public device catalog is fail-closed and turntables reference raster frames only', async () => {
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
      assert.ok(manifest.assets?.webModel?.bytes > 0 && manifest.assets.webModel.bytes <= maxParamakWebModelBytes,
        `${device.id} browser model exceeds the ${maxParamakWebModelBytes}-byte budget`);
      const webModelPath = endpointToPublicPath(manifest.assets.webModel.path);
      assert.equal((await stat(webModelPath)).size, manifest.assets.webModel.bytes,
        `${device.id} manifest byte count must match the shipped browser model`);
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

    if (identifiesProtectedDevice(device.id)) {
      assert.notEqual(viewer.mode, 'real-3d', `${device.id} is protected and must not send geometry to a public browser`);
    }

    for (const value of collectStrings(device)) {
      assert.doesNotMatch(value, localPathPattern, `${device.id} catalog entry leaks a local path`);
      if (identifiesProtectedDevice(device.id)) {
        assert.ok(!hasGeometryOrSourceExtension(value), `${device.id} catalog entry exposes geometry/source: ${value}`);
      }
    }
  }
});

test('digital-prototype HTML exposes no protected model link or private filesystem path', async () => {
  const response = await renderDigitalPrototype();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, localPathPattern);

  const publicUrls = [...html.matchAll(/\b(?:href|src|data-[\w-]*(?:src|url))=["']([^"']+)["']/gi)]
    .map((match) => match[1]);
  for (const url of publicUrls) {
    assert.ok(
      !(identifiesProtectedDevice(url) && hasGeometryOrSourceExtension(url)),
      `digital-prototype exposes a protected model/source link: ${url}`,
    );
  }
});

test('controlled raster previews receive defense-in-depth response headers', async () => {
  for (const pathname of [
    '/models/exl50u-secure-preview/turntable-manifest.json',
    '/models/exl50u-secure-preview/frame-00.webp',
  ]) {
    const response = await fetchFromWorker(pathname);
    assert.equal(response.status, 200, `${pathname} must be served`);
    assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*(?:private\s*,\s*)?no-store(?:\s*,|$)/i);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.match(response.headers.get('content-disposition') ?? '', /^inline\b/i);
  }
});

test('Paramak interaction controls remain public-only and expose consistent accessible state', async () => {
  const source = await readFile(resolve(repositoryRoot, 'app/components/TokamakCadViewer.tsx'), 'utf8');
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
