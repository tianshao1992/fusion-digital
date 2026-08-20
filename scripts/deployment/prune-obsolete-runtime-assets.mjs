import { open, readdir, readFile, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PUBLIC_ANONYMOUS_MODE,
  validateDeploymentBuildTarget,
} from './build-target.mjs';
import { precompressStaticAssets } from './precompress-static-assets.mjs';

const distUrl = new URL('../../dist/', import.meta.url);
const distClientUrl = new URL('client/', distUrl);
const catalogPath = fileURLToPath(new URL('models/device-catalog.json', distClientUrl));
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
const runtimeAssetLockUrl = new URL('../../assets/runtime-assets.lock.json', import.meta.url);

const SITES_EXPANDED_LIMIT_BYTES = 256 * 1024 * 1024;
const REQUIRED_HEADROOM_BYTES = 3 * 1024 * 1024;
const BUILD_TARGET = process.env.FUSIONDIGITAL_BUILD_TARGET || 'sites';
const ITER_HIGH_DETAIL_ID = 'iter-high-detail-v1';
const ITER_HIGH_DETAIL_DESTINATION = `public/models/${ITER_HIGH_DETAIL_ID}`;
const ITER_HIGH_DETAIL_PUBLIC_TOKEN = `/models/${ITER_HIGH_DETAIL_ID}/`;
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

export function shouldEnforceSitesExpandedLimit(buildTarget = 'sites') {
  return validateDeploymentBuildTarget(
    buildTarget,
    buildTarget === 'sites' ? undefined : PUBLIC_ANONYMOUS_MODE,
  ).isSites;
}

export async function assertAppHasNoPublicIterCacheReference(applicationUrl = appUrl) {
  const appFiles = (await filesUnder(applicationUrl))
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file.pathname));
  const sources = await Promise.all(appFiles.map(async (file) => ({
    file,
    source: await readFile(file, 'utf8'),
  })));
  const publicReference = sources.find(({ source }) => source.includes(ITER_HIGH_DETAIL_PUBLIC_TOKEN));
  if (publicReference) {
    throw new Error(
      `Refusing to prune ${ITER_HIGH_DETAIL_ID}: application source ${fileURLToPath(publicReference.file)} `
      + `still references the internal cache URL ${ITER_HIGH_DETAIL_PUBLIC_TOKEN}`,
    );
  }
}

async function assertReadableFile(fileUrl, expectedBytes) {
  const fileStat = await stat(fileUrl);
  if (!fileStat.isFile() || fileStat.size !== expectedBytes) {
    throw new Error(
      `Refusing public-anonymous build: ${fileURLToPath(fileUrl)} has ${fileStat.size} bytes; `
      + `runtime lock requires ${expectedBytes}.`,
    );
  }

  const handle = await open(fileUrl, 'r');
  try {
    if (expectedBytes > 0) {
      const probe = Buffer.allocUnsafe(1);
      const { bytesRead } = await handle.read(probe, 0, 1, expectedBytes - 1);
      if (bytesRead !== 1) {
        throw new Error(`could not read the final locked byte of ${fileURLToPath(fileUrl)}`);
      }
    }
  } finally {
    await handle.close();
  }
}

export async function verifyPublicAnonymousIterCache({
  cacheUrl,
  lockUrl = runtimeAssetLockUrl,
}) {
  const lock = JSON.parse(await readFile(lockUrl, 'utf8'));
  const bundle = (lock.externalBundles ?? []).find(({ id }) => id === ITER_HIGH_DETAIL_ID);
  if (!bundle) {
    throw new Error(`Refusing public-anonymous build: runtime lock is missing ${ITER_HIGH_DETAIL_ID}.`);
  }
  if (
    bundle.destinationRoot !== ITER_HIGH_DETAIL_DESTINATION
    || bundle.fileCount !== bundle.files?.length
    || bundle.totalBytes !== bundle.files.reduce((sum, file) => sum + file.bytes, 0)
  ) {
    throw new Error(`Refusing public-anonymous build: ${ITER_HIGH_DETAIL_ID} lock contract is invalid.`);
  }

  const expectedFiles = new Map();
  for (const file of bundle.files) {
    if (
      typeof file.filename !== 'string'
      || file.filename.length === 0
      || file.filename.includes('/')
      || file.filename.includes('\\')
      || !Number.isSafeInteger(file.bytes)
      || file.bytes < 0
      || expectedFiles.has(file.filename)
    ) {
      throw new Error(`Refusing public-anonymous build: ${ITER_HIGH_DETAIL_ID} contains an unsafe lock entry.`);
    }
    expectedFiles.set(file.filename, file.bytes);
  }

  let entries;
  try {
    entries = await readdir(cacheUrl, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `Refusing public-anonymous build: hydrated ${ITER_HIGH_DETAIL_ID} cache is missing from dist/client.`,
      );
    }
    throw error;
  }
  if (
    entries.length !== bundle.fileCount
    || entries.some((entry) => !entry.isFile() || !expectedFiles.has(entry.name))
  ) {
    throw new Error(
      `Refusing public-anonymous build: ${ITER_HIGH_DETAIL_ID} must contain exactly `
      + `${bundle.fileCount} locked files.`,
    );
  }

  await Promise.all(entries.map((entry) => (
    assertReadableFile(new URL(entry.name, cacheUrl), expectedFiles.get(entry.name))
  )));

  return { fileCount: bundle.fileCount, totalBytes: bundle.totalBytes };
}

export async function handleIterHighDetailCache({
  mode,
  clientUrl = distClientUrl,
  applicationUrl = appUrl,
  lockUrl = runtimeAssetLockUrl,
}) {
  const cacheUrl = new URL(`models/${ITER_HIGH_DETAIL_ID}/`, clientUrl);
  const expectedCachePath = resolve(
    fileURLToPath(clientUrl),
    'models',
    ITER_HIGH_DETAIL_ID,
  );
  if (resolve(fileURLToPath(cacheUrl)) !== expectedCachePath) {
    throw new Error(`Refusing to process an unexpected ${ITER_HIGH_DETAIL_ID} cache target.`);
  }

  await assertAppHasNoPublicIterCacheReference(applicationUrl);

  if (mode === PUBLIC_ANONYMOUS_MODE) {
    const verified = await verifyPublicAnonymousIterCache({ cacheUrl, lockUrl });
    return { action: 'preserved', bytes: 0, ...verified };
  }

  let bytes = 0;
  try {
    bytes = await byteLength(cacheUrl);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await rm(cacheUrl, { recursive: true, force: true });
  return { action: 'removed', bytes, fileCount: 0, totalBytes: 0 };
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

export async function runPostbuildPrune({
  mode = process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE,
  buildTarget = BUILD_TARGET,
} = {}) {
  const buildContract = validateDeploymentBuildTarget(buildTarget, mode);
  const enforceSitesLimit = buildContract.isSites;
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

  const iterCache = await handleIterHighDetailCache({ mode });
  if (iterCache.action === 'removed') {
    removed.push({ id: `${ITER_HIGH_DETAIL_ID}.client-cache`, bytes: iterCache.bytes });
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

  const precompressed = buildContract.isAliyunVm
    ? await precompressStaticAssets({ assetsUrl: new URL('assets/', distClientUrl) })
    : { fileCount: 0, sourceBytes: 0, compressedBytes: 0 };

  const expandedBytes = await byteLength(distUrl);
  const removedBytes = removed.reduce((total, item) => total + item.bytes, 0);

  if (enforceSitesLimit) {
    const maximumBytes = SITES_EXPANDED_LIMIT_BYTES - REQUIRED_HEADROOM_BYTES;
    if (expandedBytes > maximumBytes) {
      throw new Error(
        `Sites package is still too large: ${expandedBytes} bytes; maximum with reserved headroom is ${maximumBytes}.`,
      );
    }
    const headroomBytes = SITES_EXPANDED_LIMIT_BYTES - expandedBytes;
    console.log(
      `[postbuild] Sites runtime pruned ${removedBytes} obsolete or externally served bytes; `
      + `dist=${expandedBytes} bytes; Sites headroom=${headroomBytes} bytes.`,
    );
  } else {
    console.log(
      `[postbuild] Aliyun VM (${buildTarget}) public-anonymous runtime preserved ${iterCache.fileCount} locked ITER files `
      + `(${iterCache.totalBytes} bytes); pruned ${removedBytes} other obsolete bytes; `
      + `precompressed ${precompressed.fileCount} JS/CSS assets `
      + `(${precompressed.sourceBytes} -> ${precompressed.compressedBytes} bytes); `
      + `dist=${expandedBytes} bytes; Sites package limit not applicable.`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await runPostbuildPrune();
}
