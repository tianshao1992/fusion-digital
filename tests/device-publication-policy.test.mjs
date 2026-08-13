import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
    } else {
      assert.equal(viewer.manifestEndpoint ?? device.manifestEndpoint ?? null, null, `${device.id} non-real viewer must not expose geometry`);
    }

    if (viewer.mode === 'turntable-3d') {
      assert.equal(device.delivery, 'public-static-preview');
      assert.equal(typeof viewer.turntableManifestEndpoint, 'string');
      assert.match(viewer.turntableManifestEndpoint, /\/turntable-manifest\.json$/);
      const turntablePath = endpointToPublicPath(viewer.turntableManifestEndpoint);
      const turntable = JSON.parse(await readFile(turntablePath, 'utf8'));
      const referencedAssets = Array.isArray(turntable.frames)
        ? turntable.frames.map((frame) => frame?.src).filter((value) => typeof value === 'string')
        : [];
      assert.ok(referencedAssets.length >= 8, `${device.id} turntable must contain a useful raster sequence`);

      for (const asset of referencedAssets) {
        assert.doesNotMatch(asset, localPathPattern, `${device.id} turntable leaks a local path`);
        assert.ok(!hasGeometryOrSourceExtension(asset), `${device.id} turntable references geometry/source data`);
        const assetUrl = asset.startsWith('/')
          ? asset
          : `${viewer.turntableManifestEndpoint.slice(0, viewer.turntableManifestEndpoint.lastIndexOf('/') + 1)}${asset}`;
        assert.ok(rasterExtensions.has(extname(assetUrl.split(/[?#]/, 1)[0]).toLowerCase()));
        assert.ok((await stat(endpointToPublicPath(assetUrl))).isFile(), `${assetUrl} must exist`);
      }

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
