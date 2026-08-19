import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const catalogPath = fileURLToPath(new URL('../../dist/client/models/device-catalog.json', import.meta.url));
const searchIndexDistUrl = new URL(
  '../../dist/client/data/fusion-knowledge-index.json',
  import.meta.url,
);
const searchIndexSourceUrl = new URL(
  '../../public/data/fusion-knowledge-index.json',
  import.meta.url,
);
const searchCoreUrl = new URL('../../app/search/search-core.ts', import.meta.url);
const appUrl = new URL('../../app/', import.meta.url);
const serverEntryUrl = new URL('../../dist/server/index.js', import.meta.url);

const SITES_EXPANDED_LIMIT_BYTES = 256 * 1024 * 1024;
const REQUIRED_HEADROOM_BYTES = 3 * 1024 * 1024;
const BUILD_TARGET = process.env.FUSIONDIGITAL_BUILD_TARGET || 'sites';
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

async function assertSearchIndexIsServerEmbedded() {
  const publicRuntimePath = '/data/fusion-knowledge-index.json';
  const appFiles = (await filesUnder(appUrl)).filter((file) => /\.[cm]?[jt]sx?$/.test(file.pathname));
  const appSources = await Promise.all(appFiles.map(async (file) => readFile(file, 'utf8')));
  const publicPathLiterals = [
    `"${publicRuntimePath}"`,
    `'${publicRuntimePath}'`,
    `\`${publicRuntimePath}\``,
  ];
  if (appSources.some((source) => publicPathLiterals.some((literal) => source.includes(literal)))) {
    throw new Error(
      `Refusing to prune ${publicRuntimePath}: application source still references its public URL.`,
    );
  }

  const searchCoreSource = await readFile(searchCoreUrl, 'utf8');
  if (!searchCoreSource.includes(
    'import knowledgeIndex from "../../public/data/fusion-knowledge-index.json" with { type: "json" };',
  )) {
    throw new Error('Refusing to prune the public search index copy: its static server import changed.');
  }

  const indexSource = await readFile(searchIndexSourceUrl, 'utf8');
  const index = JSON.parse(indexSource);
  const entries = Array.isArray(index.entries) ? index.entries : [];
  if (!index.schemaVersion || entries.length === 0 || index.statistics?.total !== entries.length) {
    throw new Error('Refusing to prune the public search index copy: its source contract is invalid.');
  }

  const serverSource = await readFile(serverEntryUrl, 'utf8');
  const markerEntries = [entries[0], entries[Math.floor(entries.length / 2)], entries.at(-1)];
  const embeddedMarkers = [
    `schemaVersion: ${JSON.stringify(index.schemaVersion)}`,
    `"total": ${entries.length}`,
    ...markerEntries.map((entry) => `"id": ${JSON.stringify(entry.id)}`),
  ];
  if (embeddedMarkers.some((marker) => !serverSource.includes(marker))) {
    throw new Error('Refusing to prune the public search index copy: the server bundle is not self-contained.');
  }
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

// The search API statically imports this index, so Vite embeds the complete dataset in the
// Worker bundle. Keeping the public-directory copy in dist/client duplicates the same payload;
// no browser route or download action addresses it. Preserve the tracked source for rebuilds.
await assertSearchIndexIsServerEmbedded();
let embeddedSearchIndexBytes = 0;
try {
  embeddedSearchIndexBytes = (await stat(searchIndexDistUrl)).size;
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
await rm(searchIndexDistUrl, { force: true });
removed.push({ id: 'fusion-knowledge-index.client-copy', bytes: embeddedSearchIndexBytes });

const expandedBytes = await byteLength(new URL('../../dist/', import.meta.url));
const maximumBytes = SITES_EXPANDED_LIMIT_BYTES - REQUIRED_HEADROOM_BYTES;
if (BUILD_TARGET !== 'sites' && BUILD_TARGET !== 'aliyun-hk') {
  throw new Error(`Unsupported FUSIONDIGITAL_BUILD_TARGET: ${BUILD_TARGET}.`);
}
if (
  BUILD_TARGET === 'aliyun-hk'
  && process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE !== 'public-anonymous'
) {
  throw new Error(
    'Aliyun Hong Kong builds require NEXT_PUBLIC_FUSIONDIGITAL_MODE=public-anonymous.',
  );
}
if (BUILD_TARGET === 'sites' && expandedBytes > maximumBytes) {
  throw new Error(
    `Sites package is still too large: ${expandedBytes} bytes; maximum with reserved headroom is ${maximumBytes}.`,
  );
}

const removedBytes = removed.reduce((total, item) => total + item.bytes, 0);
if (BUILD_TARGET === 'sites') {
  const headroomBytes = SITES_EXPANDED_LIMIT_BYTES - expandedBytes;
  console.log(
    `[postbuild] Sites runtime pruned ${removedBytes} obsolete bytes; `
    + `dist=${expandedBytes} bytes; Sites headroom=${headroomBytes} bytes.`,
  );
} else {
  console.log(
    `[postbuild] Aliyun Hong Kong runtime pruned ${removedBytes} obsolete bytes; `
    + `dist=${expandedBytes} bytes; Sites size limit intentionally not applied.`,
  );
}
