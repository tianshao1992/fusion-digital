import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const catalogPath = fileURLToPath(new URL('../../dist/client/models/device-catalog.json', import.meta.url));

const SITES_EXPANDED_LIMIT_BYTES = 256 * 1024 * 1024;
const REQUIRED_HEADROOM_BYTES = 3 * 1024 * 1024;
const OBSOLETE_RUNTIME_PACKAGES = Object.freeze([
  {
    id: 'paramak-tokamak-demo',
    distUrl: new URL('../../dist/client/models/paramak-tokamak-demo/', import.meta.url),
    forbiddenCatalogToken: '/models/paramak-tokamak-demo/',
  },
  {
    id: 'exl50u-secure-preview',
    distUrl: new URL('../../dist/client/models/exl50u-secure-preview/', import.meta.url),
    forbiddenCatalogToken: '/models/exl50u-secure-preview/',
  },
]);

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const path = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    return entry.isDirectory() ? filesUnder(path) : [path];
  }))).flat();
}

async function byteLength(directory) {
  const files = await filesUnder(directory);
  const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));
  return sizes.reduce((total, size) => total + size, 0);
}

const catalogSource = await readFile(catalogPath, 'utf8');
const catalog = JSON.parse(catalogSource);
const catalogManifests = new Set(
  (catalog.devices ?? []).flatMap((device) => [
    device.viewer?.manifestEndpoint,
    device.viewer?.turntableManifestEndpoint,
  ]).filter(Boolean),
);

if (catalog.securityPolicy?.showDownloadActions !== false) {
  throw new Error('Refusing to prune source-only files while catalog download actions are enabled.');
}

for (const assetPackage of OBSOLETE_RUNTIME_PACKAGES) {
  if (
    catalogSource.includes(assetPackage.forbiddenCatalogToken)
    || [...catalogManifests].some((endpoint) => endpoint.includes(assetPackage.id))
  ) {
    throw new Error(
      `Refusing to prune ${assetPackage.id}: the production device catalog still references it.`,
    );
  }
}

const removed = [];
for (const assetPackage of OBSOLETE_RUNTIME_PACKAGES) {
  let bytes = 0;
  try {
    bytes = await byteLength(assetPackage.distUrl);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await rm(assetPackage.distUrl, { recursive: true, force: true });
  removed.push({ id: assetPackage.id, bytes });
}

// The Paramak STEP remains tracked for collaborators and reproducible builds. The production
// viewer loads only the GLB, and the catalog explicitly disables all download actions.
const sourceOnlyStep = new URL(
  '../../dist/client/models/paramak-full-device/paramak-full-device.step',
  import.meta.url,
);
let sourceOnlyBytes = 0;
try {
  sourceOnlyBytes = (await stat(sourceOnlyStep)).size;
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
await rm(sourceOnlyStep, { force: true });
removed.push({ id: 'paramak-full-device.step', bytes: sourceOnlyBytes });

const expandedBytes = await byteLength(new URL('../../dist/', import.meta.url));
const maximumBytes = SITES_EXPANDED_LIMIT_BYTES - REQUIRED_HEADROOM_BYTES;
if (expandedBytes > maximumBytes) {
  throw new Error(
    `Sites package is still too large: ${expandedBytes} bytes; maximum with reserved headroom is ${maximumBytes}.`,
  );
}

const removedBytes = removed.reduce((total, item) => total + item.bytes, 0);
const headroomBytes = SITES_EXPANDED_LIMIT_BYTES - expandedBytes;
console.log(
  `[postbuild] Production runtime pruned ${removedBytes} obsolete bytes; `
  + `dist=${expandedBytes} bytes; Sites headroom=${headroomBytes} bytes.`,
);
