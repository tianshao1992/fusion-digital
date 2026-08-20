import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  codepointCompare,
  createExpectedByteLimit,
  validateStageOutput,
  verifyOfflineSource,
} from "../scripts/assets/runtime-assets.mjs";
import {
  handleIterHighDetailCache,
  pruneUnreferencedMirroredSsrWorkers,
  pruneUnreferencedVinextFonts,
  shouldEnforceSitesExpandedLimit,
} from "../scripts/deployment/prune-obsolete-runtime-assets.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK_PATH = join(ROOT, "assets", "runtime-assets.lock.json");
const MANIFEST_PATH = join(ROOT, "public", "models", "iter-public-simplified", "model-manifest.json");
const ALLOWLIST_PATH = join(ROOT, "worker", "iter-high-assets.generated.ts");
const SCRIPT_PATH = join(ROOT, "scripts", "assets", "runtime-assets.mjs");

async function readJson(pathname) {
  return JSON.parse(await readFile(pathname, "utf8"));
}

function directoryUrl(pathname) {
  return pathToFileURL(`${resolve(pathname)}${sep}`);
}

test("runtime asset lock covers the complete Git-managed public tree", async () => {
  const lock = await readJson(LOCK_PATH);
  assert.equal(lock.schemaVersion, "fusiondigital.runtime-assets.v1");
  assert.equal(lock.gitAssets.root, "public");
  assert.equal(lock.gitAssets.fileCount, lock.gitAssets.files.length);
  assert.equal(
    lock.gitAssets.totalBytes,
    lock.gitAssets.files.reduce((sum, file) => sum + file.bytes, 0),
  );

  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "-z", "--", "public"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const gitPaths = stdout.split("\0").filter(Boolean).sort(codepointCompare);
  const lockedPaths = lock.gitAssets.files.map((file) => file.path).sort(codepointCompare);
  assert.deepEqual(lockedPaths, gitPaths);
  assert.ok(lockedPaths.includes("public/models/exl50u-interactive/exl50u-interactive-high.meshopt.glb"));
  assert.ok(lockedPaths.includes("public/models/iter-public-simplified/model-manifest.json"));
  assert.ok(lockedPaths.includes("public/data/exl50u-efit-v2/index.json"));
});

test("ITER lock is identical to the current manifest and Worker allowlist", async () => {
  const lock = await readJson(LOCK_PATH);
  const manifest = await readJson(MANIFEST_PATH);
  const bundle = lock.externalBundles.find((item) => item.id === "iter-high-detail-v1");
  const manifestBundle = manifest.assets.componentBundles.find((item) => item.id === "iter-high-v1");
  assert.ok(bundle);
  assert.ok(manifestBundle);
  assert.equal(bundle.fileCount, 18);
  assert.equal(bundle.files.length, 18);
  assert.equal(bundle.totalBytes, 98_507_692);
  assert.equal(manifestBundle.bytes, 98_507_692);
  assert.equal(bundle.sourceCadIncluded, false);
  assert.equal(bundle.engineeringUseAllowed, false);
  assert.match(bundle.licensePath, /ITER-PUBLIC-VISUALIZATION-DERIVATIVE\.txt$/);

  const manifestBySlug = new Map(manifestBundle.components.map((component) => {
    const match = /^\/device-assets\/iter-high-detail\/v1\/([a-z0-9-]+)\.([a-f0-9]{64})\.high\.meshopt\.glb$/.exec(component.path);
    assert.ok(match, `unexpected ITER route: ${component.path}`);
    assert.equal(match[2], component.sha256);
    return [match[1], { sha256: component.sha256, bytes: component.bytes, route: component.path }];
  }));

  const allowlistSource = await readFile(ALLOWLIST_PATH, "utf8");
  const workerEntries = [...allowlistSource.matchAll(
    /\{\s*partId:\s*"([a-z0-9-]+)",\s*sha256:\s*"([a-f0-9]{64})",\s*bytes:\s*(\d+)\s*\}/g,
  )].map((match) => ({ partId: match[1], sha256: match[2], bytes: Number(match[3]) }));
  assert.equal(workerEntries.length, 18);

  const workerByPart = new Map(workerEntries.map((entry) => [entry.partId, entry]));
  for (const file of bundle.files) {
    assert.deepEqual(
      { sha256: file.sha256, bytes: file.bytes, route: file.route },
      manifestBySlug.get(file.partId),
    );
    assert.deepEqual(
      { partId: file.partId, sha256: file.sha256, bytes: file.bytes },
      workerByPart.get(file.partId),
    );
    assert.equal(file.filename, `${file.partId}.${file.sha256}.high.meshopt.glb`);
  }
  assert.equal(new Set(bundle.files.map((file) => file.partId)).size, 18);
  assert.equal(bundle.files.reduce((sum, file) => sum + file.bytes, 0), 98_507_692);
});

test("external ITER derivatives are ignored by Git and use credential-free HTTPS acquisition", async () => {
  const lock = await readJson(LOCK_PATH);
  const bundle = lock.externalBundles[0];
  const base = new URL(bundle.acquisition.defaultBaseUrl);
  assert.equal(base.protocol, "https:");
  assert.equal(base.username, "");
  assert.equal(base.password, "");
  assert.equal(base.search, "");
  assert.equal(base.hash, "");
  assert.equal(bundle.acquisition.baseUrlEnv, "FUSION_ASSET_BASE_URL");
  assert.equal(bundle.acquisition.sourceDirEnv, "FUSION_ASSET_SOURCE_DIR");

  const probe = `${bundle.destinationRoot}/${bundle.files[0].filename}`;
  const { stdout: tracked } = await execFileAsync("git", ["ls-files", "--", probe], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(tracked.trim(), "");
  const { stdout: ignored } = await execFileAsync("git", ["check-ignore", "-v", probe], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.match(ignored, /public\/models\/iter-high-detail-v1/);
});

test("postbuild prunes only the Sites ITER cache and preserves the public-anonymous bundle", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-postbuild-iter-"));
  const app = join(scratch, "app");
  const client = join(scratch, "dist", "client");
  const cache = join(client, "models", "iter-high-detail-v1");
  const manifest = join(client, "models", "iter-public-simplified", "model-manifest.json");
  const route = join(client, "device-assets-route.txt");
  const sourceAsset = join(scratch, "public", "models", "iter-high-detail-v1", "source.glb");
  const lockPath = join(scratch, "runtime-assets.lock.json");
  const files = [
    { filename: "alpha.high.meshopt.glb", bytes: 3 },
    { filename: "beta.high.meshopt.glb", bytes: 5 },
  ];

  try {
    await mkdir(app, { recursive: true });
    await mkdir(cache, { recursive: true });
    await mkdir(dirname(manifest), { recursive: true });
    await mkdir(dirname(sourceAsset), { recursive: true });
    await writeFile(join(app, "page.tsx"), "export default function Page() { return null; }");
    await writeFile(join(cache, files[0].filename), "abc");
    await writeFile(join(cache, files[1].filename), "12345");
    await writeFile(manifest, "manifest stays");
    await writeFile(route, "route stays");
    await writeFile(sourceAsset, "source stays");
    await writeFile(lockPath, JSON.stringify({
      externalBundles: [{
        id: "iter-high-detail-v1",
        destinationRoot: "public/models/iter-high-detail-v1",
        fileCount: files.length,
        totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
        files,
      }],
    }));

    const sharedOptions = {
      clientUrl: directoryUrl(client),
      applicationUrl: directoryUrl(app),
      lockUrl: pathToFileURL(lockPath),
    };
    const preserved = await handleIterHighDetailCache({
      ...sharedOptions,
      mode: "public-anonymous",
    });
    assert.deepEqual(preserved, {
      action: "preserved",
      bytes: 0,
      fileCount: 2,
      totalBytes: 8,
    });
    assert.equal(await readFile(join(cache, files[1].filename), "utf8"), "12345");
    assert.equal(shouldEnforceSitesExpandedLimit("aliyun-hk"), false);
    assert.equal(shouldEnforceSitesExpandedLimit("sites"), true);
    assert.throws(() => shouldEnforceSitesExpandedLimit("other"), /Unsupported FUSIONDIGITAL_BUILD_TARGET/);

    const removed = await handleIterHighDetailCache({ ...sharedOptions, mode: undefined });
    assert.deepEqual(removed, { action: "removed", bytes: 8, fileCount: 0, totalBytes: 0 });
    await assert.rejects(readFile(join(cache, files[0].filename)), /ENOENT/);
    assert.equal(await readFile(manifest, "utf8"), "manifest stays");
    assert.equal(await readFile(route, "utf8"), "route stays");
    assert.equal(await readFile(lockPath, "utf8").then((value) => JSON.parse(value).externalBundles[0].id), "iter-high-detail-v1");
    assert.equal(await readFile(sourceAsset, "utf8"), "source stays");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("postbuild refuses to prune ITER cache while app source exposes its internal URL", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-postbuild-iter-reference-"));
  const app = join(scratch, "app");
  const client = join(scratch, "dist", "client");
  const cachedAsset = join(client, "models", "iter-high-detail-v1", "asset.glb");

  try {
    await mkdir(app, { recursive: true });
    await mkdir(dirname(cachedAsset), { recursive: true });
    await writeFile(
      join(app, "page.ts"),
      'export const leaked = "/models/iter-high-detail-v1/asset.glb";',
    );
    await writeFile(cachedAsset, "must stay");

    await assert.rejects(
      handleIterHighDetailCache({
        clientUrl: directoryUrl(client),
        applicationUrl: directoryUrl(app),
      }),
      /still references the internal cache URL/,
    );
    assert.equal(await readFile(cachedAsset, "utf8"), "must stay");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("postbuild removes unreferenced vinext fonts and preserves unrelated dist assets", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-postbuild-vinext-fonts-"));
  const dist = join(scratch, "dist");
  const fonts = join(dist, "client", "assets", "_vinext_fonts");
  const font = join(fonts, "inter-latin.woff2");
  const clientBundle = join(dist, "client", "assets", "app.js");
  const serverBundle = join(dist, "server", "index.js");

  try {
    await mkdir(fonts, { recursive: true });
    await mkdir(dirname(serverBundle), { recursive: true });
    await writeFile(font, Buffer.alloc(17, 1));
    await writeFile(clientBundle, "export const fontFamily = 'system-ui';");
    await writeFile(serverBundle, "export default function handler() {}");

    assert.deepEqual(
      await pruneUnreferencedVinextFonts({
        distributionUrl: directoryUrl(dist),
        fontsUrl: directoryUrl(fonts),
      }),
      { bytes: 17 },
    );
    await assert.rejects(readFile(font), /ENOENT/);
    assert.equal(await readFile(clientBundle, "utf8"), "export const fontFamily = 'system-ui';");
    assert.equal(await readFile(serverBundle, "utf8"), "export default function handler() {}");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("postbuild keeps vinext fonts when any external text asset still references them", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-postbuild-vinext-font-reference-"));
  const dist = join(scratch, "dist");
  const fonts = join(dist, "client", "assets", "_vinext_fonts");
  const font = join(fonts, "inter-latin.woff2");
  const stylesheet = join(dist, "client", "assets", "app.css");

  try {
    await mkdir(fonts, { recursive: true });
    await writeFile(font, "must stay");
    await writeFile(
      stylesheet,
      "@font-face{src:url('./_vinext_fonts/inter-latin.woff2') format('woff2')}",
    );

    await assert.rejects(
      pruneUnreferencedVinextFonts({
        distributionUrl: directoryUrl(dist),
        fontsUrl: directoryUrl(fonts),
      }),
      /Refusing to prune _vinext_fonts: generated asset .*app\.css still references _vinext_fonts/,
    );
    assert.equal(await readFile(font, "utf8"), "must stay");
    assert.match(await readFile(stylesheet, "utf8"), /_vinext_fonts/);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("postbuild removes only byte-identical, client-referenced, server-unreferenced SSR Workers", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "fusion-postbuild-ssr-workers-"));
  const dist = join(scratch, "dist");
  const clientAssets = join(dist, "client", "assets");
  const serverAssets = join(dist, "server", "ssr", "assets");
  const workerNames = [
    "generateMeshBVH.worker-Abc_123.js",
    "ehl2DiagView2Forward.worker-Xyz-789.js",
  ];

  try {
    await mkdir(clientAssets, { recursive: true });
    await mkdir(serverAssets, { recursive: true });
    await writeFile(join(dist, "server", "index.js"), "export default function handler() {}");
    for (const [index, workerName] of workerNames.entries()) {
      const bytes = Buffer.alloc(80 + index, index + 1);
      await writeFile(join(clientAssets, workerName), bytes);
      await writeFile(join(serverAssets, workerName), bytes);
      await writeFile(
        join(clientAssets, `loader-${index}.js`),
        `new Worker(new URL('/assets/${workerName}', import.meta.url));`,
      );
    }
    const unrelatedSsrAsset = join(serverAssets, "route-runtime.js");
    await writeFile(unrelatedSsrAsset, "export const route = '/digital-prototype';");

    assert.deepEqual(
      await pruneUnreferencedMirroredSsrWorkers({ distributionUrl: directoryUrl(dist) }),
      { bytes: 161, fileCount: 2 },
    );
    for (const workerName of workerNames) {
      await assert.rejects(readFile(join(serverAssets, workerName)), /ENOENT/);
      assert.ok((await readFile(join(clientAssets, workerName))).byteLength > 0);
    }
    assert.equal(await readFile(unrelatedSsrAsset, "utf8"), "export const route = '/digital-prototype';");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("postbuild keeps mirrored SSR Workers when identity or reference proofs fail", async () => {
  async function arrange(caseName, {
    serverBytes = "same",
    clientBytes = "same",
    clientReference = true,
    serverReference = false,
    manifestReference = false,
  } = {}) {
    const scratch = await mkdtemp(join(tmpdir(), `fusion-postbuild-ssr-worker-${caseName}-`));
    const dist = join(scratch, "dist");
    const clientAssets = join(dist, "client", "assets");
    const serverAssets = join(dist, "server", "ssr", "assets");
    const workerName = "generateMeshBVH.worker-Proof123.js";
    await mkdir(clientAssets, { recursive: true });
    await mkdir(serverAssets, { recursive: true });
    await writeFile(join(clientAssets, workerName), clientBytes);
    await writeFile(join(serverAssets, workerName), serverBytes);
    await writeFile(
      join(clientAssets, "loader.js"),
      clientReference ? `new Worker('/assets/${workerName}')` : "export default {};",
    );
    await writeFile(
      join(dist, "server", "index.js"),
      serverReference ? `export const worker = '${workerName}';` : "export default {};",
    );
    if (manifestReference) {
      await mkdir(join(dist, ".openai"), { recursive: true });
      await writeFile(
        join(dist, ".openai", "manifest.json"),
        JSON.stringify({ entry: `server/ssr/assets/${workerName}` }),
      );
    }
    return { scratch, dist, serverWorker: join(serverAssets, workerName) };
  }

  const differing = await arrange("different", { serverBytes: "server", clientBytes: "client" });
  try {
    await assert.rejects(
      pruneUnreferencedMirroredSsrWorkers({ distributionUrl: directoryUrl(differing.dist) }),
      /client and SSR Worker copies differ/,
    );
    assert.equal(await readFile(differing.serverWorker, "utf8"), "server");
  } finally {
    await rm(differing.scratch, { recursive: true, force: true });
  }

  const referenced = await arrange("referenced", { serverReference: true });
  try {
    await assert.rejects(
      pruneUnreferencedMirroredSsrWorkers({ distributionUrl: directoryUrl(referenced.dist) }),
      /server asset .*index\.js still references it/,
    );
    assert.equal(await readFile(referenced.serverWorker, "utf8"), "same");
  } finally {
    await rm(referenced.scratch, { recursive: true, force: true });
  }

  const unreferenced = await arrange("unreferenced", { clientReference: false });
  try {
    await assert.rejects(
      pruneUnreferencedMirroredSsrWorkers({ distributionUrl: directoryUrl(unreferenced.dist) }),
      /no generated client asset references its mirror/,
    );
    assert.equal(await readFile(unreferenced.serverWorker, "utf8"), "same");
  } finally {
    await rm(unreferenced.scratch, { recursive: true, force: true });
  }

  const manifested = await arrange("manifested", { manifestReference: true });
  try {
    await assert.rejects(
      pruneUnreferencedMirroredSsrWorkers({ distributionUrl: directoryUrl(manifested.dist) }),
      /manifest\.json still addresses the SSR copy/,
    );
    assert.equal(await readFile(manifested.serverWorker, "utf8"), "same");
  } finally {
    await rm(manifested.scratch, { recursive: true, force: true });
  }
});

test("tracked-only CLI performs complete byte and SHA-256 verification", async () => {
  const lock = await readJson(LOCK_PATH);
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [SCRIPT_PATH, "verify", "--tracked-only"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  assert.equal(stderr, "");
  assert.match(stdout, new RegExp(`Verified ${lock.gitAssets.fileCount}/${lock.gitAssets.fileCount} Git-managed runtime assets`));
});

test("unsafe byte sources and undeclared stage files fail closed", async () => {
  let written = 0;
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      written += chunk.byteLength;
      callback();
    },
  });
  await assert.rejects(
    pipeline(Readable.from([Buffer.alloc(9)]), createExpectedByteLimit(8), sink),
    /exceeded locked byte length/,
  );
  assert.equal(written, 0, "the overflowing chunk must not reach disk/output");

  const scratch = await mkdtemp(join(tmpdir(), "fusion-assets-negative-"));
  try {
    const oversized = join(scratch, "asset.glb");
    await writeFile(oversized, Buffer.alloc(9));
    await assert.rejects(
      verifyOfflineSource(oversized, {
        filename: "asset.glb",
        bytes: 8,
        sha256: "0".repeat(64),
      }),
      /failed bytes verification/,
    );

    const stage = join(scratch, "stage");
    await mkdir(stage);
    await writeFile(join(stage, "undeclared.bin"), "must fail");
    await assert.rejects(
      validateStageOutput(stage, {
        stageDirectoryName: "iter-high-detail-v1",
        files: [],
      }),
      /undeclared entry: undeclared\.bin/,
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
