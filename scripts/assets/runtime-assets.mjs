#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
export const LOCK_PATH = join(REPO_ROOT, "assets", "runtime-assets.lock.json");
const ITER_MANIFEST_PATH = join(
  REPO_ROOT,
  "public",
  "models",
  "iter-public-simplified",
  "model-manifest.json",
);
const ITER_ALLOWLIST_PATH = join(REPO_ROOT, "worker", "iter-high-assets.generated.ts");
const WORKER_PATH = join(REPO_ROOT, "worker", "index.ts");
const DEFAULT_DESTINATION = "public/models/iter-high-detail-v1";
const DEFAULT_STAGE_DIRECTORY = "iter-high-detail-v1";
const DEFAULT_STAGE_OUTPUT = ".runtime-assets/iter-high-detail-v1-stage";
const BASE_URL_ENV = "FUSION_ASSET_BASE_URL";
const SOURCE_DIR_ENV = "FUSION_ASSET_SOURCE_DIR";
const EXPECTED_ITER_COMPONENTS = 18;
const EXPECTED_ITER_BYTES = 98_507_692;

function toPosix(value) {
  return value.split(sep).join("/");
}

export function codepointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function formatBytes(value) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let unit = 0;
  let number = value;
  while (number >= 1024 && unit < units.length - 1) {
    number /= 1024;
    unit += 1;
  }
  return `${number.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

async function exists(pathname) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(pathname) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(pathname)) hash.update(chunk);
  return hash.digest("hex");
}

function canonicalTreeDigest(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => codepointCompare(a.path, b.path))) {
    hash.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`);
  }
  return hash.digest("hex");
}

function canonicalBundleDigest(files) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => codepointCompare(a.filename, b.filename))) {
    hash.update(`${file.filename}\0${file.bytes}\0${file.sha256}\n`);
  }
  return hash.digest("hex");
}

function assertRelativeRepositoryPath(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || isAbsolute(value)
    || value.split(/[\\/]+/).includes("..")
  ) {
    throw new Error(`${label} must be a safe repository-relative path`);
  }
}

function resolveRepositoryPath(value, label) {
  assertRelativeRepositoryPath(value, label);
  const absolute = resolve(REPO_ROOT, value);
  const rel = relative(REPO_ROOT, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`${label} resolves outside the repository`);
  }
  return absolute;
}

function normalizeHttpsBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Asset base URL must be a valid HTTPS URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Asset base URL must use HTTPS; use --source-dir for offline or local transfer");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Asset base URL must not contain credentials, query parameters, or a fragment");
  }
  return parsed.href.replace(/\/+$/, "");
}

async function gitTrackedPublicPaths() {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", "--", "public"],
    { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout
    .split("\0")
    .filter(Boolean)
    .map((value) => value.replaceAll("\\", "/"))
    .filter((value) => !value.startsWith(`${DEFAULT_DESTINATION}/`))
    .sort(codepointCompare);
}

async function readIterSourceContract() {
  const manifest = JSON.parse(await readFile(ITER_MANIFEST_PATH, "utf8"));
  const bundle = manifest?.assets?.componentBundles?.find((item) => item.id === "iter-high-v1");
  if (!bundle || !Array.isArray(bundle.components)) {
    throw new Error("ITER manifest does not contain assets.componentBundles[id=iter-high-v1]");
  }

  const allowlistSource = await readFile(ITER_ALLOWLIST_PATH, "utf8");
  const generatedEntries = [...allowlistSource.matchAll(
    /\{\s*partId:\s*"([a-z0-9-]+)",\s*sha256:\s*"([a-f0-9]{64})",\s*bytes:\s*(\d+)\s*\}/g,
  )].map((match) => ({
    partId: match[1],
    sha256: match[2],
    bytes: Number(match[3]),
  }));
  if (generatedEntries.length !== EXPECTED_ITER_COMPONENTS) {
    throw new Error(`Worker allowlist must contain exactly ${EXPECTED_ITER_COMPONENTS} ITER assets`);
  }

  const workerSource = await readFile(WORKER_PATH, "utf8");
  const baseMatch = /const ITER_HIGH_DETAIL_RELEASE_BASE\s*=\s*"([^"]+)"/.exec(workerSource);
  if (!baseMatch) throw new Error("Worker ITER release base URL was not found");
  const defaultBaseUrl = normalizeHttpsBaseUrl(baseMatch[1]);
  const generatedByPart = new Map(generatedEntries.map((entry) => [entry.partId, entry]));

  const files = bundle.components.map((component) => {
    const route = String(component.path ?? "");
    const routeMatch = /^\/device-assets\/iter-high-detail\/v1\/([a-z0-9-]+)\.([a-f0-9]{64})\.high\.meshopt\.glb$/.exec(route);
    if (!routeMatch) throw new Error(`Invalid ITER component route: ${route}`);
    const partId = routeMatch[1];
    const sha256 = String(component.sha256 ?? "").toLowerCase();
    const bytes = Number(component.bytes);
    const generated = generatedByPart.get(partId);
    if (
      !generated
      || generated.sha256 !== sha256
      || generated.bytes !== bytes
      || routeMatch[2] !== sha256
    ) {
      throw new Error(`ITER manifest and worker allowlist disagree for ${partId}`);
    }
    return {
      partId,
      manifestPartId: String(component.partId),
      filename: `${partId}.${sha256}.high.meshopt.glb`,
      route,
      bytes,
      sha256,
    };
  });

  const parts = new Set(files.map((file) => file.partId));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (
    files.length !== EXPECTED_ITER_COMPONENTS
    || parts.size !== EXPECTED_ITER_COMPONENTS
    || generatedByPart.size !== EXPECTED_ITER_COMPONENTS
    || totalBytes !== EXPECTED_ITER_BYTES
    || Number(bundle.bytes) !== EXPECTED_ITER_BYTES
  ) {
    throw new Error(
      `ITER runtime contract must be ${EXPECTED_ITER_COMPONENTS} unique files totalling ${EXPECTED_ITER_BYTES} bytes`,
    );
  }

  return { defaultBaseUrl, files, totalBytes };
}

export async function refreshLock() {
  const paths = await gitTrackedPublicPaths();
  const files = [];
  for (const pathname of paths) {
    const absolute = resolveRepositoryPath(pathname, "Tracked asset path");
    const info = await stat(absolute);
    if (!info.isFile()) throw new Error(`Tracked public path is not a file: ${pathname}`);
    files.push({
      path: toPosix(pathname),
      bytes: info.size,
      sha256: await sha256File(absolute),
    });
  }
  const iter = await readIterSourceContract();
  const lock = {
    schemaVersion: "fusiondigital.runtime-assets.v1",
    generatedAt: "2026-08-16",
    gitAssets: {
      root: "public",
      acquisition: "git",
      excludes: [`${DEFAULT_DESTINATION}/`],
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      treeSha256: canonicalTreeDigest(files),
      files,
    },
    externalBundles: [
      {
        id: "iter-high-detail-v1",
        title: "ITER reviewed high-detail browser visualization derivative",
        classification: "PUBLIC_VISUALIZATION_DERIVATIVE",
        engineeringUseAllowed: false,
        sourceCadIncluded: false,
        licensePath: "public/licenses/ITER-PUBLIC-VISUALIZATION-DERIVATIVE.txt",
        destinationRoot: DEFAULT_DESTINATION,
        stageDirectoryName: DEFAULT_STAGE_DIRECTORY,
        routeRoot: "/device-assets/iter-high-detail/v1",
        acquisition: {
          defaultBaseUrl: iter.defaultBaseUrl,
          baseUrlEnv: BASE_URL_ENV,
          sourceDirEnv: SOURCE_DIR_ENV,
        },
        fileCount: iter.files.length,
        totalBytes: iter.totalBytes,
        aggregateSha256: canonicalBundleDigest(iter.files),
        files: iter.files,
      },
    ],
  };
  await mkdir(dirname(LOCK_PATH), { recursive: true });
  await writeFile(LOCK_PATH, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  console.log(
    `Refreshed ${toPosix(relative(REPO_ROOT, LOCK_PATH))}: `
      + `${files.length} Git assets, ${iter.files.length} external assets.`,
  );
  return lock;
}

export async function loadLock() {
  const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
  if (lock?.schemaVersion !== "fusiondigital.runtime-assets.v1") {
    throw new Error("Unsupported or missing runtime asset lock schemaVersion");
  }
  if (!Array.isArray(lock?.gitAssets?.files) || !Array.isArray(lock?.externalBundles)) {
    throw new Error("Runtime asset lock is incomplete");
  }
  if (lock.externalBundles.length !== 1 || lock.externalBundles[0].id !== "iter-high-detail-v1") {
    throw new Error("Runtime asset lock must contain exactly the ITER high-detail v1 external bundle");
  }
  return lock;
}

async function inspectLockedFile(absolute, expected) {
  let info;
  try {
    info = await stat(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: false, state: "missing" };
    throw error;
  }
  if (!info.isFile()) return { ok: false, state: "not-a-file" };
  if (info.size !== expected.bytes) {
    return { ok: false, state: "bytes", actualBytes: info.size };
  }
  const actualSha256 = await sha256File(absolute);
  if (actualSha256 !== expected.sha256) {
    return { ok: false, state: "sha256", actualSha256 };
  }
  return { ok: true, state: "verified" };
}

async function verifyTracked(lock, { throwOnError = true } = {}) {
  const failures = [];
  const files = lock.gitAssets.files;
  for (const file of files) {
    const absolute = resolveRepositoryPath(file.path, "Git asset path");
    const result = await inspectLockedFile(absolute, file);
    if (!result.ok) failures.push({ path: file.path, ...result });
  }

  const computedBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const computedTree = canonicalTreeDigest(files);
  if (
    files.length !== lock.gitAssets.fileCount
    || computedBytes !== lock.gitAssets.totalBytes
    || computedTree !== lock.gitAssets.treeSha256
  ) {
    failures.push({ path: "assets/runtime-assets.lock.json", state: "invalid-git-summary" });
  }

  try {
    const currentPaths = await gitTrackedPublicPaths();
    const lockedPaths = files.map((file) => file.path).sort(codepointCompare);
    if (JSON.stringify(currentPaths) !== JSON.stringify(lockedPaths)) {
      failures.push({ path: "public", state: "tracked-path-set-drift" });
    }
  } catch {
    // A source archive can be verified without .git; the full file list in the
    // lock still verifies every required runtime asset.
  }

  if (failures.length && throwOnError) {
    const sample = failures.slice(0, 5).map((item) => `${item.path} (${item.state})`).join(", ");
    throw new Error(`Git-managed runtime assets failed verification: ${sample}`);
  }
  return { ok: failures.length === 0, verified: files.length - failures.length, failures };
}

function iterBundle(lock) {
  const bundle = lock.externalBundles[0];
  assertRelativeRepositoryPath(bundle.destinationRoot, "External bundle destinationRoot");
  if (
    bundle.fileCount !== EXPECTED_ITER_COMPONENTS
    || bundle.files.length !== EXPECTED_ITER_COMPONENTS
    || bundle.totalBytes !== EXPECTED_ITER_BYTES
    || bundle.files.reduce((sum, file) => sum + file.bytes, 0) !== EXPECTED_ITER_BYTES
    || canonicalBundleDigest(bundle.files) !== bundle.aggregateSha256
    || bundle.sourceCadIncluded !== false
  ) {
    throw new Error("ITER external bundle summary is invalid");
  }
  return bundle;
}

async function verifyExternal(lock, { throwOnError = true } = {}) {
  const bundle = iterBundle(lock);
  const destination = resolveRepositoryPath(bundle.destinationRoot, "External bundle destinationRoot");
  const failures = [];
  let verified = 0;
  for (const file of bundle.files) {
    if (file.filename.includes("/") || file.filename.includes("\\")) {
      throw new Error(`Unsafe external asset filename: ${file.filename}`);
    }
    const result = await inspectLockedFile(join(destination, file.filename), file);
    if (result.ok) verified += 1;
    else failures.push({ filename: file.filename, ...result });
  }
  if (failures.length && throwOnError) {
    const sample = failures.slice(0, 5).map((item) => `${item.filename} (${item.state})`).join(", ");
    throw new Error(`External runtime assets failed verification: ${sample}`);
  }
  return { ok: failures.length === 0, verified, failures };
}

async function verifyCommand({ trackedOnly = false } = {}) {
  const lock = await loadLock();
  const tracked = await verifyTracked(lock);
  console.log(
    `Verified ${tracked.verified}/${lock.gitAssets.fileCount} Git-managed runtime assets `
      + `(${formatBytes(lock.gitAssets.totalBytes)}).`,
  );
  if (trackedOnly) return;
  const bundle = iterBundle(lock);
  const external = await verifyExternal(lock);
  console.log(
    `Verified ${external.verified}/${bundle.fileCount} ${bundle.id} assets `
      + `(${formatBytes(bundle.totalBytes)}).`,
  );
}

async function statusCommand() {
  const lock = await loadLock();
  const tracked = await verifyTracked(lock, { throwOnError: false });
  const bundle = iterBundle(lock);
  const external = await verifyExternal(lock, { throwOnError: false });
  console.log(`Git assets     ${tracked.ok ? "ready" : "drift"}  ${tracked.verified}/${lock.gitAssets.fileCount}`);
  console.log(`ITER HD assets ${external.ok ? "ready" : "missing/incomplete"}  ${external.verified}/${bundle.fileCount}`);
  console.log(`ITER target    ${bundle.destinationRoot}`);
  console.log(
    `Acquisition   npm run assets:hydrate (HTTPS), or --source-dir / ${bundle.acquisition.sourceDirEnv}`,
  );
  if (!tracked.ok) {
    for (const item of tracked.failures.slice(0, 5)) console.log(`  git: ${item.path} [${item.state}]`);
  }
  if (!external.ok) {
    for (const item of external.failures.slice(0, 5)) console.log(`  iter: ${item.filename} [${item.state}]`);
  }
}

async function atomicInstall(tempPath, targetPath) {
  try {
    await rename(tempPath, targetPath);
    return;
  } catch (error) {
    if (!new Set(["EEXIST", "EPERM", "EACCES"]).has(error?.code) || !(await exists(targetPath))) {
      throw error;
    }
  }

  const backup = `${targetPath}.previous-${process.pid}-${randomBytes(4).toString("hex")}`;
  await rename(targetPath, backup);
  try {
    await rename(tempPath, targetPath);
    await rm(backup, { force: true });
  } catch (error) {
    if (await exists(backup)) await rename(backup, targetPath);
    throw error;
  }
}

export function createExpectedByteLimit(expectedBytes, onOverflow = () => {}) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0) {
    throw new Error("Expected byte limit must be a non-negative safe integer");
  }
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.byteLength;
      if (received > expectedBytes) {
        const error = new Error(
          `Asset stream exceeded locked byte length: expected ${expectedBytes}, received at least ${received}`,
        );
        onOverflow(error);
        callback(error);
        return;
      }
      callback(null, chunk);
    },
  });
}

export async function verifyOfflineSource(source, file) {
  const result = await inspectLockedFile(source, file);
  if (!result.ok) {
    throw new Error(`Offline source failed ${result.state} verification for ${file.filename}`);
  }
}

async function installOne({ file, destination, sourceDir, baseUrl }) {
  const target = join(destination, file.filename);
  const present = await inspectLockedFile(target, file);
  if (present.ok) return { state: "skipped", filename: file.filename };

  const temp = `${target}.partial-${process.pid}-${randomBytes(5).toString("hex")}`;
  try {
    if (sourceDir) {
      const direct = join(sourceDir, file.filename);
      const staged = join(sourceDir, DEFAULT_STAGE_DIRECTORY, file.filename);
      const source = (await exists(direct)) ? direct : staged;
      if (!(await exists(source))) throw new Error(`Offline source file is missing: ${file.filename}`);
      // Validate the source before copy so a wrong or unexpectedly large file
      // is never duplicated into the hydration directory. The copied temp file
      // is verified again below to close the source-change race as well.
      await verifyOfflineSource(source, file);
      await copyFile(source, temp);
    } else {
      const url = `${baseUrl}/${encodeURIComponent(file.filename)}`;
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error(`Download timed out for ${file.filename}`)),
        120_000,
      );
      try {
        const response = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            Accept: "application/octet-stream",
            "Accept-Encoding": "identity",
          },
        });
        if (!response.ok || !response.body) {
          throw new Error(`Download failed (${response.status}) for ${file.filename}`);
        }
        if (new URL(response.url).protocol !== "https:") {
          throw new Error(`Download redirected away from HTTPS for ${file.filename}`);
        }
        const contentLength = response.headers.get("content-length");
        if (contentLength && Number(contentLength) !== file.bytes) {
          controller.abort();
          throw new Error(
            `Content-Length mismatch for ${file.filename}: expected ${file.bytes}, received ${contentLength}`,
          );
        }
        const byteLimit = createExpectedByteLimit(file.bytes, (error) => controller.abort(error));
        await pipeline(
          Readable.fromWeb(response.body),
          byteLimit,
          createWriteStream(temp, { flags: "wx" }),
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    const verified = await inspectLockedFile(temp, file);
    if (!verified.ok) {
      throw new Error(`Downloaded bytes failed ${verified.state} verification for ${file.filename}`);
    }
    await atomicInstall(temp, target);
    return { state: "installed", filename: file.filename };
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

async function runPool(items, concurrency, task) {
  let cursor = 0;
  const results = new Array(items.length);
  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function hydrateCommand(options) {
  const lock = await loadLock();
  await verifyTracked(lock);
  const bundle = iterBundle(lock);
  const destination = resolveRepositoryPath(bundle.destinationRoot, "External bundle destinationRoot");
  await mkdir(destination, { recursive: true });

  const sourceDirValue = options.sourceDir ?? process.env[SOURCE_DIR_ENV];
  const sourceDir = sourceDirValue ? resolve(sourceDirValue) : undefined;
  if (sourceDir && !(await exists(sourceDir))) {
    throw new Error(`Offline source directory does not exist: ${sourceDir}`);
  }
  const baseUrl = sourceDir
    ? undefined
    : normalizeHttpsBaseUrl(
      options.baseUrl ?? process.env[BASE_URL_ENV] ?? bundle.acquisition.defaultBaseUrl,
    );
  const concurrency = Number(options.concurrency ?? 3);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("--concurrency must be an integer from 1 through 8");
  }

  console.log(sourceDir ? `Hydrating from ${sourceDir}` : `Hydrating from ${baseUrl}`);
  const results = await runPool(bundle.files, concurrency, (file) => installOne({
    file,
    destination,
    sourceDir,
    baseUrl,
  }));
  const installed = results.filter((result) => result.state === "installed").length;
  const skipped = results.length - installed;
  await verifyExternal(lock);
  console.log(`ITER runtime assets ready: ${installed} installed, ${skipped} already verified.`);
}

export async function validateStageOutput(output, bundle, { requireComplete = false } = {}) {
  const expectedNames = new Set(bundle.files.map((file) => file.filename));
  const rootExists = await exists(output);
  if (!rootExists) {
    if (requireComplete) throw new Error("Stage output is missing");
    return;
  }
  const rootInfo = await lstat(output);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Stage output must be a real directory, not a file or symbolic link");
  }

  const rootEntries = await readdir(output, { withFileTypes: true });
  const allowedRootEntries = new Set([bundle.stageDirectoryName, "runtime-assets.lock.json"]);
  for (const entry of rootEntries) {
    if (!allowedRootEntries.has(entry.name)) {
      throw new Error(`Stage output contains undeclared entry: ${entry.name}`);
    }
    if (entry.isSymbolicLink()) throw new Error(`Stage output contains symbolic link: ${entry.name}`);
  }

  const assetOutput = join(output, bundle.stageDirectoryName);
  const assetDirectoryExists = await exists(assetOutput);
  if (assetDirectoryExists) {
    const assetDirectoryInfo = await lstat(assetOutput);
    if (!assetDirectoryInfo.isDirectory() || assetDirectoryInfo.isSymbolicLink()) {
      throw new Error(`Stage asset path must be a real directory: ${bundle.stageDirectoryName}`);
    }
    const assetEntries = await readdir(assetOutput, { withFileTypes: true });
    for (const entry of assetEntries) {
      if (!expectedNames.has(entry.name)) {
        throw new Error(`Stage output contains undeclared asset: ${entry.name}`);
      }
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new Error(`Stage asset must be a regular file: ${entry.name}`);
      }
      const file = bundle.files.find((item) => item.filename === entry.name);
      const result = await inspectLockedFile(join(assetOutput, entry.name), file);
      if (!result.ok) {
        throw new Error(`Stage output contains stale or invalid asset: ${entry.name} (${result.state})`);
      }
    }
    if (requireComplete && assetEntries.length !== bundle.files.length) {
      throw new Error(`Stage output must contain exactly ${bundle.files.length} declared assets`);
    }
  } else if (requireComplete) {
    throw new Error(`Stage output is missing ${bundle.stageDirectoryName}`);
  }

  const stagedLockPath = join(output, "runtime-assets.lock.json");
  if (await exists(stagedLockPath)) {
    const stagedLockInfo = await lstat(stagedLockPath);
    if (!stagedLockInfo.isFile() || stagedLockInfo.isSymbolicLink()) {
      throw new Error("Staged runtime-assets.lock.json must be a regular file");
    }
    const [actualLock, expectedLock] = await Promise.all([
      readFile(stagedLockPath),
      readFile(LOCK_PATH),
    ]);
    if (!actualLock.equals(expectedLock)) {
      throw new Error("Stage output contains an old or modified runtime-assets.lock.json");
    }
  } else if (requireComplete) {
    throw new Error("Stage output is missing runtime-assets.lock.json");
  }

  if (requireComplete && rootEntries.length !== 2) {
    throw new Error("Stage output must contain exactly the asset directory and runtime-assets.lock.json");
  }
}

async function stageCommand(options) {
  const lock = await loadLock();
  await verifyTracked(lock);
  await verifyExternal(lock);
  const bundle = iterBundle(lock);
  const source = resolveRepositoryPath(bundle.destinationRoot, "External bundle destinationRoot");
  const output = resolve(options.output ?? DEFAULT_STAGE_OUTPUT);
  if (output === REPO_ROOT || output === source) {
    throw new Error("Stage output must not be the repository root or hydrated asset directory");
  }
  // Existing output is accepted only when every present entry belongs to the
  // current lock and is already valid. Unknown/stale files fail closed rather
  // than being silently mixed into a new upload bundle.
  await validateStageOutput(output, bundle);
  const assetOutput = join(output, bundle.stageDirectoryName);
  await mkdir(assetOutput, { recursive: true });
  for (const file of bundle.files) {
    const target = join(assetOutput, file.filename);
    const current = await inspectLockedFile(target, file);
    if (current.ok) continue;
    const temp = `${target}.partial-${process.pid}-${randomBytes(5).toString("hex")}`;
    try {
      await copyFile(join(source, file.filename), temp);
      const verified = await inspectLockedFile(temp, file);
      if (!verified.ok) throw new Error(`Stage verification failed for ${file.filename}`);
      await atomicInstall(temp, target);
    } finally {
      await rm(temp, { force: true }).catch(() => {});
    }
  }
  const stagedLockPath = join(output, "runtime-assets.lock.json");
  if (!(await exists(stagedLockPath))) {
    const lockTemp = `${stagedLockPath}.partial-${process.pid}-${randomBytes(5).toString("hex")}`;
    try {
      await copyFile(LOCK_PATH, lockTemp);
      await atomicInstall(lockTemp, stagedLockPath);
    } finally {
      await rm(lockTemp, { force: true }).catch(() => {});
    }
  }
  await validateStageOutput(output, bundle, { requireComplete: true });
  console.log(`Staged ${bundle.fileCount} verified assets (${formatBytes(bundle.totalBytes)}) at ${output}`);
}

function parseArguments(argv) {
  const [command = "status", ...rest] = argv;
  const options = {};
  const takeValue = (index, token) => {
    const equals = token.indexOf("=");
    if (equals >= 0) return { value: token.slice(equals + 1), consumed: 0 };
    if (!rest[index + 1] || rest[index + 1].startsWith("--")) {
      throw new Error(`${token} requires a value`);
    }
    return { value: rest[index + 1], consumed: 1 };
  };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--tracked-only") {
      options.trackedOnly = true;
      continue;
    }
    const key = ["--base-url", "--source-dir", "--concurrency", "--output"]
      .find((candidate) => token === candidate || token.startsWith(`${candidate}=`));
    if (!key) throw new Error(`Unknown option: ${token}`);
    const { value, consumed } = takeValue(index, token);
    index += consumed;
    options[{ "--base-url": "baseUrl", "--source-dir": "sourceDir", "--concurrency": "concurrency", "--output": "output" }[key]] = value;
  }
  return { command, options };
}

function printHelp() {
  console.log(`Usage: node scripts/assets/runtime-assets.mjs <command> [options]

Commands:
  status                         Report Git and external runtime asset readiness
  verify [--tracked-only]        Verify bytes and SHA-256 against the lock
  hydrate [options]              Fetch or import the 18 ITER high-detail files
  stage [--output <directory>]   Copy a verified upload-ready offline bundle
  refresh-lock                   Regenerate the lock from Git, manifest, and worker allowlist

Hydrate options:
  --base-url <https-url>         HTTPS mirror; default can use ${BASE_URL_ENV}
  --source-dir <directory>       Offline extracted bundle; default can use ${SOURCE_DIR_ENV}
  --concurrency <1-8>            Concurrent HTTPS downloads (default: 3)
`);
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArguments(argv);
  if (command === "status") return statusCommand();
  if (command === "verify") return verifyCommand(options);
  if (command === "hydrate") return hydrateCommand(options);
  if (command === "stage") return stageCommand(options);
  if (command === "refresh-lock") return refreshLock();
  if (command === "help" || command === "--help" || command === "-h") return printHelp();
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`runtime-assets: ${error.message}`);
    process.exitCode = 1;
  });
}
