import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_ROOT = join(ROOT, "public");
const LOCK_PATH = join(ROOT, "assets", "sites-static-offload.lock.json");
const ASSET_SOURCE_COMMIT = "72810e61c9fc207d1f168ec8f828566cc52c7bdf";
const REPORTS = Object.freeze([
  "fusion-ai-native-research-report.docx",
  "fusion-diagnostics-research-report.docx",
  "fusion-integrated-control-research-report.docx",
  "fusion-physics-simulation-report.pdf",
  "FusionDigital-technical-roadmap-2026-08-15.docx",
  "tokamak-engineering-simulation-report.docx",
  "tokamak-engineering-simulation-report.pdf",
  "xjtu-engineering-digital-twin-phase1-brief.docx",
]);
const CONTENT_TYPES = Object.freeze({
  ".bin": "application/octet-stream",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".gz": "application/gzip",
  ".pdf": "application/pdf",
});

function codepointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosix(pathname) {
  return pathname.split(sep).join("/");
}

function contentType(pathname) {
  const extension = Object.keys(CONTENT_TYPES).find((candidate) => pathname.endsWith(candidate));
  if (!extension) throw new Error(`Unsupported Sites offload content type: ${pathname}`);
  return CONTENT_TYPES[extension];
}

function publicRoute(sourcePath) {
  return sourcePath.startsWith("data/exl50u-efit")
    ? `/device-data/${sourcePath.slice("data/".length)}`
    : `/${sourcePath}`;
}

async function sha256(pathname) {
  const bytes = await readFile(pathname);
  return createHash("sha256").update(bytes).digest("hex");
}

async function listFiles(directory, extension) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => toPosix(relative(PUBLIC_ROOT, join(directory, entry.name))))
    .sort(codepointCompare);
}

async function buildLock() {
  await execFileAsync("git", ["cat-file", "-e", `${ASSET_SOURCE_COMMIT}^{commit}`], { cwd: ROOT });
  const sourcePaths = [
    ...REPORTS,
    ...await listFiles(join(PUBLIC_ROOT, "data", "exl50u-efit"), ".bin"),
    ...await listFiles(join(PUBLIC_ROOT, "data", "exl50u-efit-v2"), ".jsonl.gz"),
  ].sort(codepointCompare);
  if (sourcePaths.length !== 232) {
    throw new Error(`Sites static offload contract expected 232 files; found ${sourcePaths.length}.`);
  }

  const { stdout: changedPublic } = await execFileAsync(
    "git",
    ["diff", "--name-only", ASSET_SOURCE_COMMIT, "--", "public"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  const changed = new Set(changedPublic.split(/\r?\n/u).filter(Boolean).map((path) => path.slice("public/".length)));
  const changedOffload = sourcePaths.find((path) => changed.has(path));
  if (changedOffload) {
    throw new Error(
      `Offloaded file ${changedOffload} differs from fixed source commit ${ASSET_SOURCE_COMMIT}. `
      + "Publish the assets first, then advance the lock in a separate commit.",
    );
  }

  const files = await Promise.all(sourcePaths.map(async (sourcePath) => {
    const pathname = resolve(PUBLIC_ROOT, ...sourcePath.split("/"));
    const metadata = await stat(pathname);
    if (!metadata.isFile()) throw new Error(`Sites offload source is not a file: ${sourcePath}`);
    return {
      route: publicRoute(sourcePath),
      sourcePath,
      bytes: metadata.size,
      sha256: await sha256(pathname),
      contentType: contentType(sourcePath),
    };
  }));

  return {
    schemaVersion: "fusiondigital.sites-static-offload.v1",
    bundleId: "sites-static-offload-v1",
    source: {
      origin: "https://raw.githubusercontent.com",
      repository: "tianshao1992/fusion-digital",
      commitSha: ASSET_SOURCE_COMMIT,
      publicRoot: "public",
    },
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
}

const expected = `${JSON.stringify(await buildLock(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  const actual = await readFile(LOCK_PATH, "utf8");
  if (actual !== expected) {
    throw new Error("Sites static offload lock is stale; regenerate it before release.");
  }
  console.log("Sites static offload lock is current (232 files).");
} else {
  await writeFile(LOCK_PATH, expected, "utf8");
  console.log(`Wrote ${LOCK_PATH}`);
}
