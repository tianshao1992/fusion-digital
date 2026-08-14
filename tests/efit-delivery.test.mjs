import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = resolve(repositoryRoot, "public");
const approvedFiles = new Set([
  "index.json",
  "shot-18301.bin",
  "shot-18303.bin",
  "shot-18303-topology.bin",
  "shot-18304.bin",
  "shot-18308.bin",
]);
const approvedRoutes = [...approvedFiles].map((name) => `/device-data/exl50u-efit/${name}`);
const v2ChunkCounts = new Map([
  [20213, 33],
  [20289, 4],
  [20666, 45],
  [20669, 57],
  [20707, 38],
  [20708, 42],
]);
const approvedV2Files = new Set(["index.json"]);
for (const [shot, count] of v2ChunkCounts) {
  for (let part = 0; part < count; part += 1) {
    approvedV2Files.add(`shot-${shot}-part-${String(part).padStart(3, "0")}.jsonl.gz`);
  }
}
const representativeV2Routes = [
  "/device-data/exl50u-efit-v2/index.json",
  ...[...v2ChunkCounts].flatMap(([shot, count]) => [
    `/device-data/exl50u-efit-v2/shot-${shot}-part-000.jsonl.gz`,
    `/device-data/exl50u-efit-v2/shot-${shot}-part-${String(count - 1).padStart(3, "0")}.jsonl.gz`,
  ]),
];

async function walkFiles(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
      const path = resolve(root, entry.name);
      return entry.isDirectory() ? walkFiles(path) : [path];
    }));
    return nested.flat();
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function secureHeaders(response) {
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  assert.match(response.headers.get("cache-control") ?? "", /private/i);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.match(response.headers.get("content-disposition") ?? "", /^inline\b/i);
}

function parseRange(value, length) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value ?? "");
  if (!match || (!match[1] && !match[2])) return null;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, length - suffix);
    end = length - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : length - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= length || end < start) return null;
  return [start, Math.min(end, length - 1)];
}

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("efit-delivery", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function fetchFromWorker(pathname, init = {}) {
  const worker = await loadWorker();
  const assetRequests = [];
  const response = await worker.fetch(
    new Request(`http://localhost${pathname}`, init),
    {
      ASSETS: {
        fetch: async (request) => {
          assetRequests.push({ method: request.method, pathname: new URL(request.url).pathname, range: request.headers.get("range") });
          const pathname = new URL(request.url).pathname;
          const path = resolve(publicRoot, pathname.slice(1));
          let buffer;
          try {
            buffer = await readFile(path);
          } catch {
            return new Response("Not found", { status: 404 });
          }
          const headers = new Headers({
            "Accept-Ranges": "bytes",
            "Content-Length": String(buffer.byteLength),
          });
          const rangeHeader = request.headers.get("range");
          if (rangeHeader) {
            const range = parseRange(rangeHeader, buffer.byteLength);
            if (!range) {
              headers.set("Content-Range", `bytes */${buffer.byteLength}`);
              return new Response(null, { status: 416, headers });
            }
            const [start, end] = range;
            headers.set("Content-Range", `bytes ${start}-${end}/${buffer.byteLength}`);
            headers.set("Content-Length", String(end - start + 1));
            return new Response(request.method === "HEAD" ? null : buffer.subarray(start, end + 1), { status: 206, headers });
          }
          return new Response(request.method === "HEAD" ? null : buffer, { status: 200, headers });
        },
      },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
  return { response, assetRequests };
}

test("EFIT Worker allow-list serves GET and HEAD with defense-in-depth headers", async () => {
  for (const route of approvedRoutes) {
    const getResult = await fetchFromWorker(route);
    assert.equal(getResult.response.status, 200, `GET ${route}`);
    assert.equal(getResult.assetRequests.length, 1);
    assert.equal(getResult.assetRequests[0].method, "GET");
    assert.equal(getResult.assetRequests[0].pathname, route.replace("/device-data/", "/data/"));
    secureHeaders(getResult.response);
    assert.equal(getResult.response.headers.get("accept-ranges"), "bytes");
    assert.match(
      getResult.response.headers.get("content-type") ?? "",
      route.endsWith(".json") ? /^application\/json\b/ : /^application\/octet-stream\b/,
    );
    assert.ok((await getResult.response.arrayBuffer()).byteLength > 0);

    const headResult = await fetchFromWorker(route, { method: "HEAD" });
    assert.equal(headResult.response.status, 200, `HEAD ${route}`);
    assert.equal(headResult.assetRequests[0].method, "HEAD");
    secureHeaders(headResult.response);
    assert.equal((await headResult.response.arrayBuffer()).byteLength, 0);
  }
});

test("EFIT Worker preserves byte ranges and secures partial/error responses", async () => {
  for (const route of approvedRoutes) {
    const { response, assetRequests } = await fetchFromWorker(route, { headers: { Range: "bytes=0-63" } });
    assert.equal(response.status, 206);
    assert.equal(assetRequests[0].range, "bytes=0-63");
    assert.match(response.headers.get("content-range") ?? "", /^bytes 0-63\/\d+$/);
    secureHeaders(response);
    const payload = Buffer.from(await response.arrayBuffer());
    assert.equal(payload.byteLength, 64);
    if (route.endsWith("-topology.bin")) {
      assert.equal(payload.subarray(0, 8).toString("ascii"), "EXL50TP1");
    } else if (route.endsWith(".bin")) {
      assert.equal(payload.subarray(0, 8).toString("ascii"), "EXL50EF1");
    } else {
      assert.equal(payload.subarray(0, 1).toString("utf8"), "{");
    }

    const invalid = await fetchFromWorker(route, { headers: { Range: "bytes=999999999-" } });
    assert.equal(invalid.response.status, 416);
    assert.match(invalid.response.headers.get("content-range") ?? "", /^bytes \*\/\d+$/);
    secureHeaders(invalid.response);
  }
});

test("EFIT v2 Worker serves only raw-gzip reviewed chunks with no HTTP content decoding", async () => {
  for (const route of representativeV2Routes) {
    const getResult = await fetchFromWorker(route);
    assert.equal(getResult.response.status, 200, `GET ${route}`);
    assert.equal(getResult.assetRequests.length, 1);
    assert.equal(getResult.assetRequests[0].pathname, route.replace("/device-data/", "/data/"));
    secureHeaders(getResult.response);
    assert.equal(getResult.response.headers.get("content-encoding"), null);
    assert.match(
      getResult.response.headers.get("content-type") ?? "",
      route.endsWith(".json") ? /^application\/json\b/ : /^application\/gzip\b/,
    );
    const payload = Buffer.from(await getResult.response.arrayBuffer());
    assert.ok(payload.byteLength > 0);
    if (route.endsWith(".jsonl.gz")) assert.deepEqual([...payload.subarray(0, 2)], [0x1f, 0x8b]);

    const headResult = await fetchFromWorker(route, { method: "HEAD" });
    assert.equal(headResult.response.status, 200, `HEAD ${route}`);
    assert.equal(headResult.response.headers.get("content-encoding"), null);
    assert.equal((await headResult.response.arrayBuffer()).byteLength, 0);
  }

  const chunkRoute = representativeV2Routes.find((route) => route.endsWith(".jsonl.gz"));
  const ranged = await fetchFromWorker(chunkRoute, { headers: { Range: "bytes=0-63" } });
  assert.equal(ranged.response.status, 206);
  assert.equal(ranged.response.headers.get("content-encoding"), null);
  assert.match(ranged.response.headers.get("content-type") ?? "", /^application\/gzip\b/);
  assert.deepEqual([...Buffer.from(await ranged.response.arrayBuffer()).subarray(0, 2)], [0x1f, 0x8b]);
});

test("EFIT Worker blocks direct storage paths, unknown files, directories, and write methods", async () => {
  const denied = [
    "/device-data/exl50u-efit",
    "/device-data/exl50u-efit/",
    "/device-data/exl50u-efit/shot-99999.bin",
    "/device-data/exl50u-efit/shot-18301-topology.bin",
    "/device-data/exl50u-efit/shot-18303-topology.json",
    "/device-data/exl50u-efit/EFIT%E6%95%B0%E6%8D%AE.zip",
    "/device-data/exl50u-efit/IPs.h5",
    "/device-data/exl50u-efit/g018301.00100",
    "/data/exl50u-efit",
    "/data/exl50u-efit/",
    ...[...approvedFiles].map((name) => `/data/exl50u-efit/${name}`),
  ];
  for (const route of denied) {
    const { response, assetRequests } = await fetchFromWorker(route);
    assert.equal(response.status, 404, route);
    assert.equal(assetRequests.length, 0, `${route} must not touch the asset binding`);
    secureHeaders(response);
  }
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const { response, assetRequests } = await fetchFromWorker(approvedRoutes[0], { method });
    assert.equal(response.status, 404, method);
    assert.equal(assetRequests.length, 0);
    secureHeaders(response);
  }

  const deniedV2 = [
    "/device-data/exl50u-efit-v2",
    "/device-data/exl50u-efit-v2/",
    "/device-data/exl50u-efit-v2/private.zip",
    "/device-data/exl50u-efit-v2/g020289.00110",
    "/data/exl50u-efit-v2/index.json",
    ...[...v2ChunkCounts].flatMap(([shot, count]) => [
      `/device-data/exl50u-efit-v2/shot-${shot}-part-${String(count).padStart(3, "0")}.jsonl.gz`,
      `/data/exl50u-efit-v2/shot-${shot}-part-000.jsonl.gz`,
    ]),
  ];
  for (const route of deniedV2) {
    const { response, assetRequests } = await fetchFromWorker(route);
    assert.equal(response.status, 404, route);
    assert.equal(assetRequests.length, 0, `${route} must not touch the asset binding`);
    secureHeaders(response);
  }
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const { response, assetRequests } = await fetchFromWorker(representativeV2Routes[1], { method });
    assert.equal(response.status, 404, `${method} v2 chunk`);
    assert.equal(assetRequests.length, 0);
  }
});

test("public and built EFIT packages contain only reviewed derivatives and no raw experimental formats", async () => {
  for (const root of [resolve(repositoryRoot, "public"), resolve(repositoryRoot, "dist")]) {
    const files = await walkFiles(root);
    for (const path of files) {
      const normalized = relative(root, path).replaceAll("\\", "/");
      const name = basename(path);
      assert.doesNotMatch(name, /^g\d{6}\.\d+$/i, `G-EQDSK leaked into ${normalized}`);
      assert.ok(![".zip", ".h5", ".hdf5", ".nc", ".mat"].includes(extname(name).toLowerCase()), `raw data leaked into ${normalized}`);
    }
    const derivedRoot = resolve(root, root === resolve(repositoryRoot, "public") ? "data/exl50u-efit" : "client/data/exl50u-efit");
    const derived = await walkFiles(derivedRoot);
    const derivedRelative = derived.map((path) => relative(derivedRoot, path).replaceAll("\\", "/")).sort();
    assert.deepEqual(derivedRelative, [...approvedFiles].sort(), `${derivedRoot} must contain exactly the six reviewed derivatives`);
    for (const path of derived) assert.ok((await stat(path)).size > 0);
    const v2Root = resolve(root, root === resolve(repositoryRoot, "public") ? "data/exl50u-efit-v2" : "client/data/exl50u-efit-v2");
    const v2Derived = await walkFiles(v2Root);
    const v2Relative = v2Derived.map((path) => relative(v2Root, path).replaceAll("\\", "/")).sort();
    assert.deepEqual(v2Relative, [...approvedV2Files].sort(), `${v2Root} must contain exactly the reviewed v2 catalog and chunks`);
    for (const path of v2Derived) assert.ok((await stat(path)).size > 0);
  }
});

test("Vite run_worker_first covers both controlled proxy and direct storage namespaces", async () => {
  const source = await readFile(resolve(repositoryRoot, "vite.config.ts"), "utf8");
  for (const path of [
    "/device-data/exl50u-efit",
    "/device-data/exl50u-efit/*",
    "/data/exl50u-efit",
    "/data/exl50u-efit/*",
    "/device-data/exl50u-efit-v2",
    "/device-data/exl50u-efit-v2/*",
    "/data/exl50u-efit-v2",
    "/data/exl50u-efit-v2/*",
  ]) {
    assert.ok(source.includes(JSON.stringify(path)), `${path} must run through the Worker first`);
  }
});
