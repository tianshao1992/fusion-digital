import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, readdir, readFile, rm, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PUBLIC_ANONYMOUS_MODE,
  validateDeploymentBuildTarget,
} from './build-target.mjs';
import { precompressStaticAssets } from './precompress-static-assets.mjs';
import {
  EXL50U_GA_PUBLICATION_NOTICE,
  extractExl50uGeneralAssemblyAssets,
} from '../assets/exl50u-general-assembly-runtime-contract.mjs';
import { assertManifestMatchesLock } from '../../deploy/aliyun-hk/verify-runtime-assets.mjs';
import {
  POSTBUILD_PRUNED_GIT_ASSET_RULES,
  postbuildPrunedDistPath,
  postbuildPrunedGitAssetRule,
} from '../../deploy/aliyun-hk/postbuild-pruned-git-assets.mjs';

const distUrl = new URL('../../dist/', import.meta.url);
const distClientUrl = new URL('client/', distUrl);
const catalogPath = fileURLToPath(new URL('models/device-catalog.json', distClientUrl));
const SEARCH_INDEX_PRUNE_RULE = postbuildPrunedGitAssetRule('fusion-knowledge-index.client-copy');
const PARAMAK_STEP_PRUNE_RULE = postbuildPrunedGitAssetRule('paramak-full-device.step');
const searchIndexDistUrl = new URL(postbuildPrunedDistPath(SEARCH_INDEX_PRUNE_RULE), distClientUrl);
const searchIndexSourceUrl = new URL(`../../${SEARCH_INDEX_PRUNE_RULE.publicPath}`, import.meta.url);
const searchCoreUrl = new URL('../../app/search/search-core.ts', import.meta.url);
const appUrl = new URL('../../app/', import.meta.url);
const serverEntryUrl = new URL('../../dist/server/index.js', import.meta.url);
const runtimeAssetLockUrl = new URL('../../assets/runtime-assets.lock.json', import.meta.url);

const SITES_EXPANDED_LIMIT_BYTES = 256 * 1024 * 1024;
const REQUIRED_HEADROOM_BYTES = 3 * 1024 * 1024;
const BUILD_TARGET = process.env.FUSIONDIGITAL_BUILD_TARGET || 'sites';
const ITER_HIGH_DETAIL_ID = 'iter-high-detail-v1';
const EXL50U_GA_ID = 'exl50u-general-assembly-v1';
const EXTERNAL_RUNTIME_IDS = new Set([ITER_HIGH_DETAIL_ID, EXL50U_GA_ID]);
const OBSOLETE_RUNTIME_PACKAGES = Object.freeze(
  POSTBUILD_PRUNED_GIT_ASSET_RULES
    .filter((rule) => rule.kind === 'directory')
    .map((rule) => Object.freeze({
      id: rule.id,
      distUrl: new URL(postbuildPrunedDistPath(rule), distClientUrl),
      forbiddenCatalogToken: rule.forbiddenCatalogToken,
    })),
);
const READABLE_DIST_TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.htm',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.map',
  '.md',
  '.mjs',
  '.svg',
  '.ts',
  '.tsx',
  '.txt',
  '.webmanifest',
  '.xml',
]);
const VINEXT_FONTS_REFERENCE_TOKEN = '_vinext_fonts';
const MIRRORED_SSR_WORKER_PATTERNS = Object.freeze([
  /^generateMeshBVH\.worker-[A-Za-z0-9_-]+\.js$/,
  /^ehl2DiagView2Forward\.worker-[A-Za-z0-9_-]+\.js$/,
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

function pathIsWithin(pathname, directory) {
  const pathRelativeToDirectory = relative(directory, pathname);
  return pathRelativeToDirectory === '' || (
    pathRelativeToDirectory !== '..'
    && !pathRelativeToDirectory.startsWith(`..${sep}`)
    && !isAbsolute(pathRelativeToDirectory)
  );
}

/**
 * vinext can emit locally bundled font files even when no generated client or server asset uses
 * them. Removing those files is safe only after proving that the rest of dist has no reference to
 * the generated directory. Text read failures intentionally propagate so this cleanup fails closed.
 */
export async function pruneUnreferencedVinextFonts({
  distributionUrl = distUrl,
  fontsUrl,
} = {}) {
  const resolvedFontsUrl = fontsUrl ?? new URL('client/assets/_vinext_fonts/', distributionUrl);
  const distributionPath = resolve(fileURLToPath(distributionUrl));
  const fontsPath = resolve(fileURLToPath(resolvedFontsUrl));
  if (!pathIsWithin(fontsPath, distributionPath) || fontsPath === distributionPath) {
    throw new Error('Refusing to prune an unexpected _vinext_fonts target outside dist.');
  }

  let fontsStat;
  try {
    fontsStat = await stat(resolvedFontsUrl);
  } catch (error) {
    if (error?.code === 'ENOENT') return { bytes: 0 };
    throw error;
  }
  if (!fontsStat.isDirectory()) {
    throw new Error('Refusing to prune _vinext_fonts because the expected target is not a directory.');
  }

  const fontsBytes = await byteLength(resolvedFontsUrl);
  const distFiles = await filesUnder(distributionUrl);
  for (const file of distFiles) {
    const pathname = resolve(fileURLToPath(file));
    if (
      pathIsWithin(pathname, fontsPath)
      || !READABLE_DIST_TEXT_EXTENSIONS.has(extname(pathname).toLowerCase())
    ) {
      continue;
    }
    const source = await readFile(file, 'utf8');
    if (source.includes(VINEXT_FONTS_REFERENCE_TOKEN)) {
      throw new Error(
        `Refusing to prune _vinext_fonts: generated asset ${fileURLToPath(file)} still references `
        + `${VINEXT_FONTS_REFERENCE_TOKEN}.`,
      );
    }
  }

  await rm(resolvedFontsUrl, { recursive: true });
  return { bytes: fontsBytes };
}

/**
 * Vite currently writes browser Worker entry chunks to both the client asset directory and the
 * SSR asset directory. Only the client mirror is URL-addressable by the browser. Delete the SSR
 * copy only after proving that it is byte-identical to an actively referenced client asset and
 * that neither the server graph nor a generated manifest names the SSR copy.
 */
export async function pruneUnreferencedMirroredSsrWorkers({
  distributionUrl = distUrl,
  clientAssetsUrl,
  serverAssetsUrl,
} = {}) {
  const resolvedClientAssetsUrl = clientAssetsUrl ?? new URL('client/assets/', distributionUrl);
  const resolvedServerAssetsUrl = serverAssetsUrl ?? new URL('server/ssr/assets/', distributionUrl);
  const distributionPath = resolve(fileURLToPath(distributionUrl));
  const clientAssetsPath = resolve(fileURLToPath(resolvedClientAssetsUrl));
  const serverAssetsPath = resolve(fileURLToPath(resolvedServerAssetsUrl));
  if (
    clientAssetsPath !== resolve(distributionPath, 'client', 'assets')
    || serverAssetsPath !== resolve(distributionPath, 'server', 'ssr', 'assets')
  ) {
    throw new Error('Refusing to prune mirrored Workers outside the expected dist asset directories.');
  }

  let entries;
  try {
    entries = await readdir(resolvedServerAssetsUrl, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { bytes: 0, fileCount: 0 };
    throw error;
  }

  const matchingEntries = entries.filter((entry) => (
    MIRRORED_SSR_WORKER_PATTERNS.some((pattern) => pattern.test(entry.name))
  ));
  if (matchingEntries.some((entry) => !entry.isFile())) {
    throw new Error('Refusing to prune mirrored Workers because a matching SSR entry is not a file.');
  }
  if (matchingEntries.length === 0) return { bytes: 0, fileCount: 0 };

  const candidatePaths = new Set(matchingEntries.map((entry) => (
    resolve(fileURLToPath(new URL(entry.name, resolvedServerAssetsUrl)))
  )));
  const [serverFiles, clientFiles, distFiles] = await Promise.all([
    filesUnder(new URL('server/', distributionUrl)),
    filesUnder(new URL('client/', distributionUrl)),
    filesUnder(distributionUrl),
  ]);
  const readableServerFiles = serverFiles.filter((file) => {
    const pathname = resolve(fileURLToPath(file));
    return !candidatePaths.has(pathname)
      && READABLE_DIST_TEXT_EXTENSIONS.has(extname(pathname).toLowerCase());
  });
  const readableClientFiles = clientFiles.filter((file) => {
    const pathname = resolve(fileURLToPath(file));
    return READABLE_DIST_TEXT_EXTENSIONS.has(extname(pathname).toLowerCase());
  });
  const readableDistFiles = distFiles.filter((file) => {
    const pathname = resolve(fileURLToPath(file));
    return !candidatePaths.has(pathname)
      && READABLE_DIST_TEXT_EXTENSIONS.has(extname(pathname).toLowerCase());
  });
  const [serverSources, clientSources, distSources] = await Promise.all([
    Promise.all(readableServerFiles.map(async (file) => ({ file, source: await readFile(file, 'utf8') }))),
    Promise.all(readableClientFiles.map(async (file) => ({ file, source: await readFile(file, 'utf8') }))),
    Promise.all(readableDistFiles.map(async (file) => ({ file, source: await readFile(file, 'utf8') }))),
  ]);

  const verified = [];
  for (const entry of matchingEntries) {
    const serverFile = new URL(entry.name, resolvedServerAssetsUrl);
    const clientFile = new URL(entry.name, resolvedClientAssetsUrl);
    let serverBytes;
    let clientBytes;
    try {
      [serverBytes, clientBytes] = await Promise.all([readFile(serverFile), readFile(clientFile)]);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`Refusing to prune ${entry.name}: its byte-identical client mirror is missing.`);
      }
      throw error;
    }
    if (!serverBytes.equals(clientBytes)) {
      throw new Error(`Refusing to prune ${entry.name}: client and SSR Worker copies differ.`);
    }

    const serverReference = serverSources.find(({ source }) => source.includes(entry.name));
    if (serverReference) {
      throw new Error(
        `Refusing to prune ${entry.name}: server asset ${fileURLToPath(serverReference.file)} still references it.`,
      );
    }
    const clientReference = clientSources.find(({ source }) => source.includes(entry.name));
    if (!clientReference) {
      throw new Error(`Refusing to prune ${entry.name}: no generated client asset references its mirror.`);
    }
    const explicitSsrTokens = [
      `server/ssr/assets/${entry.name}`,
      `server\\ssr\\assets\\${entry.name}`,
      `ssr/assets/${entry.name}`,
      `ssr\\assets\\${entry.name}`,
    ];
    const explicitSsrReference = distSources.find(({ source }) => (
      explicitSsrTokens.some((token) => source.includes(token))
    ));
    if (explicitSsrReference) {
      throw new Error(
        `Refusing to prune ${entry.name}: generated asset ${fileURLToPath(explicitSsrReference.file)} `
        + 'still addresses the SSR copy.',
      );
    }
    verified.push({ file: serverFile, bytes: serverBytes.byteLength });
  }

  await Promise.all(verified.map(({ file }) => rm(file)));
  return {
    bytes: verified.reduce((total, item) => total + item.bytes, 0),
    fileCount: verified.length,
  };
}

export function shouldEnforceSitesExpandedLimit(buildTarget = 'sites') {
  return validateDeploymentBuildTarget(
    buildTarget,
    buildTarget === 'sites' ? undefined : PUBLIC_ANONYMOUS_MODE,
  ).isSites;
}

export async function assertAppHasNoPublicExternalCacheReference(
  bundleId,
  applicationUrl = appUrl,
) {
  if (!EXTERNAL_RUNTIME_IDS.has(bundleId)) {
    throw new Error(`Refusing to inspect unknown external runtime bundle ${bundleId}.`);
  }
  const appFiles = (await filesUnder(applicationUrl))
    .filter((file) => /\.[cm]?[jt]sx?$/.test(file.pathname));
  const sources = await Promise.all(appFiles.map(async (file) => ({
    file,
    source: await readFile(file, 'utf8'),
  })));
  const publicToken = `/models/${bundleId}/`;
  const publicReference = sources.find(({ source }) => source.includes(publicToken));
  if (publicReference) {
    throw new Error(
      `Refusing to prune ${bundleId}: application source ${fileURLToPath(publicReference.file)} `
      + `still references the internal cache URL ${publicToken}`,
    );
  }
}

export async function assertAppHasNoPublicIterCacheReference(applicationUrl = appUrl) {
  return assertAppHasNoPublicExternalCacheReference(ITER_HIGH_DETAIL_ID, applicationUrl);
}

async function sha256FileUrl(fileUrl) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(fileURLToPath(fileUrl))) hash.update(chunk);
  return hash.digest('hex');
}

async function assertReadableFile(fileUrl, expected) {
  const fileStat = await lstat(fileUrl);
  if (fileStat.isSymbolicLink() || !fileStat.isFile() || fileStat.size !== expected.bytes) {
    throw new Error(
      `Refusing public-anonymous build: ${fileURLToPath(fileUrl)} has ${fileStat.size} bytes; `
      + `runtime lock requires ${expected.bytes}.`,
    );
  }

  const handle = await open(fileUrl, 'r');
  try {
    if (expected.bytes > 0) {
      const probe = Buffer.allocUnsafe(1);
      const { bytesRead } = await handle.read(probe, 0, 1, expected.bytes - 1);
      if (bytesRead !== 1) {
        throw new Error(`could not read the final locked byte of ${fileURLToPath(fileUrl)}`);
      }
    }
  } finally {
    await handle.close();
  }
  if (!/^[a-f0-9]{64}$/u.test(expected.sha256) || await sha256FileUrl(fileUrl) !== expected.sha256) {
    throw new Error(
      `Refusing public-anonymous build: ${fileURLToPath(fileUrl)} does not match its locked SHA-256.`,
    );
  }
}

async function inspectExternalCacheTree(cacheUrl, { allowMissing = false } = {}) {
  const root = resolve(fileURLToPath(cacheUrl));
  let rootStat;
  try {
    rootStat = await lstat(root);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return { exists: false, glbs: [] };
    throw error;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`External runtime cache root must be a real directory: ${root}`);
  }

  const glbs = [];
  const pending = [{ pathname: root, relativePath: '' }];
  while (pending.length > 0) {
    const current = pending.pop();
    const entries = await readdir(current.pathname, { withFileTypes: true });
    for (const entry of entries) {
      const pathname = join(current.pathname, entry.name);
      const relativePath = current.relativePath
        ? `${current.relativePath}/${entry.name}`
        : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error(`External runtime cache contains a symbolic link: ${relativePath}`);
      }
      const hasGlbSuffix = /\.glb$/iu.test(entry.name);
      if (entry.isDirectory()) {
        if (hasGlbSuffix) {
          throw new Error(`External runtime cache GLB is not a regular file: ${relativePath}`);
        }
        pending.push({ pathname, relativePath });
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`External runtime cache contains a non-regular entry: ${relativePath}`);
      }
      if (hasGlbSuffix) {
        glbs.push({ pathname, relativePath, fileUrl: pathToFileURL(pathname) });
      }
    }
  }
  return { exists: true, glbs };
}

async function assertActiveExlManifestMatchesLock(cacheUrl, bundle) {
  const manifestUrl = new URL('model-manifest.json', cacheUrl);
  let manifestInfo;
  try {
    manifestInfo = await lstat(manifestUrl);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('Refusing build: active EXL-50U runtime bundle is missing model-manifest.json.');
    }
    throw error;
  }
  if (manifestInfo.isSymbolicLink() || !manifestInfo.isFile() || manifestInfo.size <= 0) {
    throw new Error('Refusing build: active EXL-50U model-manifest.json must be a non-empty regular file.');
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  } catch (error) {
    throw new Error(`Refusing build: active EXL-50U model-manifest.json is invalid: ${error.message}`);
  }
  try {
    extractExl50uGeneralAssemblyAssets(manifest);
    assertManifestMatchesLock(manifest, bundle);
  } catch (error) {
    throw new Error(`Refusing build: active EXL-50U manifest does not match its anonymous runtime contract: ${error.message}`);
  }

  const noticeUrl = new URL('PUBLICATION-NOTICE.md', cacheUrl);
  let noticeInfo;
  try {
    noticeInfo = await lstat(noticeUrl);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('Refusing build: active EXL-50U runtime bundle is missing PUBLICATION-NOTICE.md.');
    }
    throw error;
  }
  if (noticeInfo.isSymbolicLink() || !noticeInfo.isFile() || noticeInfo.size <= 0) {
    throw new Error('Refusing build: active EXL-50U PUBLICATION-NOTICE.md must be a non-empty regular file.');
  }
  if (await readFile(noticeUrl, 'utf8') !== EXL50U_GA_PUBLICATION_NOTICE) {
    throw new Error('Refusing build: active EXL-50U publication notice differs from the fixed anonymous public contract.');
  }
}

export async function verifyPublicAnonymousExternalCache({
  bundleId,
  cacheUrl,
  lockUrl = runtimeAssetLockUrl,
}) {
  const lock = JSON.parse(await readFile(lockUrl, 'utf8'));
  const bundle = (lock.externalBundles ?? []).find(({ id }) => id === bundleId);
  if (!bundle) {
    throw new Error(`Refusing public-anonymous build: runtime lock is missing ${bundleId}.`);
  }
  if (
    !EXTERNAL_RUNTIME_IDS.has(bundleId)
    || bundle.destinationRoot !== `public/models/${bundleId}`
    || bundle.fileCount !== bundle.files?.length
    || bundle.totalBytes !== bundle.files.reduce((sum, file) => sum + file.bytes, 0)
  ) {
    throw new Error(`Refusing public-anonymous build: ${bundleId} lock contract is invalid.`);
  }

  const expectedFiles = new Map();
  for (const file of bundle.files) {
    if (
      typeof file.filename !== 'string'
      || file.filename.length === 0
      || file.filename.includes('/')
      || file.filename.includes('\\')
      || !Number.isSafeInteger(file.bytes)
      || file.bytes <= 0
      || !/^[a-f0-9]{64}$/u.test(file.sha256)
      || expectedFiles.has(file.filename)
    ) {
      throw new Error(`Refusing public-anonymous build: ${bundleId} contains an unsafe lock entry.`);
    }
    expectedFiles.set(file.filename, file);
  }

  let tree;
  try {
    tree = await inspectExternalCacheTree(cacheUrl);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `Refusing public-anonymous build: hydrated ${bundleId} cache is missing from dist/client.`,
      );
    }
    throw error;
  }
  const actualGlbs = new Map(tree.glbs.map((file) => [file.relativePath, file]));
  if (
    actualGlbs.size !== expectedFiles.size
    || [...actualGlbs.keys()].some((relativePath) => !expectedFiles.has(relativePath))
    || [...expectedFiles.keys()].some((filename) => !actualGlbs.has(filename))
  ) {
    throw new Error(
      `Refusing public-anonymous build: ${bundleId} must contain every locked GLB and no undeclared GLB.`,
    );
  }

  await Promise.all([...expectedFiles].map(([filename, expected]) => (
    assertReadableFile(actualGlbs.get(filename).fileUrl, expected)
  )));

  return { fileCount: bundle.fileCount, totalBytes: bundle.totalBytes };
}

export async function verifyPublicAnonymousIterCache(options) {
  return verifyPublicAnonymousExternalCache({
    ...options,
    bundleId: ITER_HIGH_DETAIL_ID,
  });
}

export async function handleExternalRuntimeBundleCache({
  bundleId,
  mode,
  clientUrl = distClientUrl,
  applicationUrl = appUrl,
  lockUrl = runtimeAssetLockUrl,
}) {
  if (!EXTERNAL_RUNTIME_IDS.has(bundleId)) {
    throw new Error(`Refusing to process unknown external runtime bundle ${bundleId}.`);
  }
  const cacheUrl = new URL(`models/${bundleId}/`, clientUrl);
  const expectedCachePath = resolve(
    fileURLToPath(clientUrl),
    'models',
    bundleId,
  );
  if (resolve(fileURLToPath(cacheUrl)) !== expectedCachePath) {
    throw new Error(`Refusing to process an unexpected ${bundleId} cache target.`);
  }

  await assertAppHasNoPublicExternalCacheReference(bundleId, applicationUrl);

  const lock = JSON.parse(await readFile(lockUrl, 'utf8'));
  const bundle = (lock.externalBundles ?? []).find(({ id }) => id === bundleId);
  if (!bundle) {
    if (bundleId !== EXL50U_GA_ID) {
      throw new Error(`Runtime lock is missing ${bundleId}.`);
    }
    const tree = await inspectExternalCacheTree(cacheUrl, { allowMissing: true });
    const glbs = tree.glbs;
    if (mode === PUBLIC_ANONYMOUS_MODE) {
      if (glbs.length !== 0) {
        throw new Error(
          `Refusing public-anonymous build: inactive ${bundleId} contains unlocked GLBs.`,
        );
      }
      return { action: 'absent', bytes: 0, fileCount: 0, totalBytes: 0 };
    }
    let bytes = 0;
    for (const file of glbs) {
      bytes += (await lstat(file.fileUrl)).size;
      await rm(file.fileUrl);
    }
    const after = await inspectExternalCacheTree(cacheUrl, { allowMissing: true });
    if (after.glbs.length !== 0) {
      throw new Error(`Refusing Sites package: inactive ${bundleId} still contains GLBs after pruning.`);
    }
    return { action: 'removed', bytes, fileCount: 0, totalBytes: 0 };
  }

  if (bundleId === EXL50U_GA_ID) {
    await assertActiveExlManifestMatchesLock(cacheUrl, bundle);
  }

  if (mode === PUBLIC_ANONYMOUS_MODE) {
    const verified = await verifyPublicAnonymousExternalCache({ bundleId, cacheUrl, lockUrl });
    return { action: 'preserved', bytes: 0, ...verified };
  }

  const tree = await inspectExternalCacheTree(cacheUrl, { allowMissing: true });
  const expectedFilenames = new Set(bundle.files.map((file) => file.filename));
  const undeclaredGlb = tree.glbs.find((file) => !expectedFilenames.has(file.relativePath));
  if (undeclaredGlb) {
    throw new Error(`Refusing Sites package: undeclared external GLB remains: ${undeclaredGlb.relativePath}`);
  }

  let bytes = 0;
  for (const file of bundle.files) {
    const fileUrl = new URL(file.filename, cacheUrl);
    try {
      bytes += (await stat(fileUrl)).size;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await rm(fileUrl, { force: true });
  }
  try {
    const after = await inspectExternalCacheTree(cacheUrl, { allowMissing: true });
    if (after.glbs.length !== 0) {
      throw new Error(`Refusing Sites package: external GLBs remain after pruning: ${after.glbs[0].relativePath}`);
    }
    const entries = await readdir(cacheUrl, { withFileTypes: true });
    if (entries.length === 0) await rm(cacheUrl, { recursive: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return { action: 'removed', bytes, fileCount: 0, totalBytes: 0 };
}

export async function handleIterHighDetailCache(options) {
  return handleExternalRuntimeBundleCache({ ...options, bundleId: ITER_HIGH_DETAIL_ID });
}

export async function handleExternalRuntimeCaches({
  mode,
  clientUrl = distClientUrl,
  applicationUrl = appUrl,
  lockUrl = runtimeAssetLockUrl,
} = {}) {
  const lock = JSON.parse(await readFile(lockUrl, 'utf8'));
  const bundles = lock.externalBundles ?? [];
  if (!bundles.some(({ id }) => id === ITER_HIGH_DETAIL_ID)) {
    throw new Error(`Runtime lock is missing required ${ITER_HIGH_DETAIL_ID}.`);
  }
  if (bundles.some(({ id }) => !EXTERNAL_RUNTIME_IDS.has(id))) {
    throw new Error('Runtime lock contains an unknown external bundle.');
  }
  return Promise.all([...EXTERNAL_RUNTIME_IDS].map(async (bundleId) => ({
    bundleId,
    ...await handleExternalRuntimeBundleCache({
      bundleId,
      mode,
      clientUrl,
      applicationUrl,
      lockUrl,
    }),
  })));
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

  const externalCaches = await handleExternalRuntimeCaches({ mode });
  for (const cache of externalCaches) {
    if (cache.action === 'removed') {
      removed.push({
        id: `${cache.bundleId}.client-cache`,
        bytes: cache.bytes,
      });
    }
  }

  // The Paramak STEP remains tracked for collaborators and reproducible builds. The production
  // viewer loads only the GLB, and the catalog explicitly disables all download actions.
  const sourceOnlyStep = new URL(postbuildPrunedDistPath(PARAMAK_STEP_PRUNE_RULE), distClientUrl);
  let sourceOnlyBytes = 0;
  try {
    sourceOnlyBytes = (await stat(sourceOnlyStep)).size;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await rm(sourceOnlyStep, { force: true });
  removed.push({ id: PARAMAK_STEP_PRUNE_RULE.id, bytes: sourceOnlyBytes });

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
  removed.push({ id: SEARCH_INDEX_PRUNE_RULE.id, bytes: embeddedSearchIndexBytes });

  const vinextFonts = await pruneUnreferencedVinextFonts();
  removed.push({ id: '_vinext_fonts.client-assets', bytes: vinextFonts.bytes });

  const ssrWorkerMirrors = await pruneUnreferencedMirroredSsrWorkers();
  removed.push({ id: 'mirrored-ssr-workers', bytes: ssrWorkerMirrors.bytes });

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
      `[postbuild] Aliyun VM (${buildTarget}) public-anonymous runtime preserved `
      + `${externalCaches.reduce((sum, cache) => sum + cache.fileCount, 0)} locked external files `
      + `(${externalCaches.reduce((sum, cache) => sum + cache.totalBytes, 0)} bytes); `
      + `pruned ${removedBytes} other obsolete bytes; `
      + `precompressed ${precompressed.fileCount} JS/CSS assets `
      + `(${precompressed.sourceBytes} -> ${precompressed.compressedBytes} bytes); `
      + `dist=${expandedBytes} bytes; Sites package limit not applicable.`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await runPostbuildPrune();
}
