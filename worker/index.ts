/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ITER_HIGH_DETAIL_RELEASE_ASSETS } from "./iter-high-assets.generated";
import { EXL50U_GENERAL_ASSEMBLY_RELEASE_ASSETS } from "./exl50u-general-assembly-assets.generated";

export interface Env {
  ASSETS: Fetcher;
  DB: NonNullable<Cloudflare.Env["DB"]>;
  FUSIONDIGITAL_ANALYTICS_REPORT_SECRET?: string;
  ITER_HIGH_DETAIL_ASSET_BASE_URL?: string;
  EXL50U_GENERAL_ASSEMBLY_ASSET_BASE_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

declare global {
  // A binding is immutable for the lifetime of a Worker isolate. Storing only
  // the D1 capability (rather than a request-scoped Env object) keeps the Node
  // SSR bundle free of `cloudflare:workers` and avoids cross-request mutation.
  var __FUSIONDIGITAL_DB__: Env["DB"] | undefined;
  var __FUSIONDIGITAL_ANALYTICS_REPORT_SECRET__: string | undefined;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const controlledDeviceAssets = new Map([
  ["/device-assets/exl50u-interactive/model-manifest.json", "/models/exl50u-interactive/model-manifest.json"],
  ["/device-assets/exl50u-interactive/exl50u-interactive.glb", "/models/exl50u-interactive/exl50u-interactive.glb"],
  ["/device-assets/exl50u-interactive/exl50u-interactive-high.meshopt.glb", "/models/exl50u-interactive/exl50u-interactive-high.meshopt.glb"],
  ["/device-assets/exl50u-interactive/poster.webp", "/models/exl50u-interactive/poster.webp"],
]);

const controlledIterHighDetailParts = [
  "cs", "pf1", "pf2", "pf3", "pf4", "pf5", "pf6", "tf-a", "tf-b",
  "cryostat-base", "cryostat-lower", "cryostat-top", "cryostat-upper", "divertor",
  "vv1", "vv2", "vv3", "vv4",
] as const;
type IterHighDetailPartId = (typeof controlledIterHighDetailParts)[number];

interface IterHighDetailReleaseAsset {
  partId: IterHighDetailPartId;
  sha256: string;
  bytes: number;
}

export interface IterHighDetailProxyAsset {
  upstreamUrl: string;
  filename?: string;
  localPath?: string;
  bytes: number;
}

function createControlledIterHighDetailAssets(
  assets: readonly IterHighDetailReleaseAsset[],
): ReadonlyMap<string, IterHighDetailProxyAsset> {
  if (assets.length === 0) return new Map();
  if (assets.length !== controlledIterHighDetailParts.length) {
    throw new Error("ITER high-detail release contract must contain all 18 components");
  }

  const approvedParts = new Set<string>(controlledIterHighDetailParts);
  const seenParts = new Set<string>();
  const seenDigests = new Set<string>();
  const result = new Map<string, IterHighDetailProxyAsset>();
  for (const asset of assets) {
    if (!approvedParts.has(asset.partId) || seenParts.has(asset.partId)) {
      throw new Error(`Invalid or duplicate ITER high-detail part: ${asset.partId}`);
    }
    if (!/^[a-f0-9]{64}$/.test(asset.sha256) || seenDigests.has(asset.sha256)) {
      throw new Error(`Invalid or duplicate ITER high-detail digest: ${asset.partId}`);
    }
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) {
      throw new Error(`Invalid ITER high-detail byte length: ${asset.partId}`);
    }
    seenParts.add(asset.partId);
    seenDigests.add(asset.sha256);
    const filename = `${asset.partId}.${asset.sha256}.high.meshopt.glb`;
    result.set(`/device-assets/iter-high-detail/v1/${filename}`, {
      // Local-first delivery ignores this logical name. A remote URL is
      // constructed only from an explicitly configured canonical mirror.
      upstreamUrl: filename,
      filename,
      localPath: `/models/iter-high-detail-v1/${filename}`,
      bytes: asset.bytes,
    });
  }
  return result;
}

const controlledIterHighDetailAssets = createControlledIterHighDetailAssets(
  ITER_HIGH_DETAIL_RELEASE_ASSETS,
);

interface Exl50uGeneralAssemblyReleaseAsset {
  role: string;
  filename: string;
  sha256: string;
  bytes: number;
}

const EXL50U_GA_ROUTE_ROOT = "/device-assets/exl50u-general-assembly/v1";
const EXL50U_GA_LOCAL_ROOT = "/models/exl50u-general-assembly-v1";
const EXL50U_GA_MANIFEST_PATH = `${EXL50U_GA_LOCAL_ROOT}/model-manifest.json`;
const EXL50U_GA_PUBLICATION_NOTICE_PATH = `${EXL50U_GA_LOCAL_ROOT}/PUBLICATION-NOTICE.md`;
const EXL50U_GA_REVIEW_MANIFEST_PATH = `${EXL50U_GA_ROUTE_ROOT}/model-manifest.json`;
const EXL50U_GA_PUBLIC_METADATA = new Map<string, { localPath: string; contentType: string }>([
  [EXL50U_GA_MANIFEST_PATH, {
    localPath: EXL50U_GA_MANIFEST_PATH,
    contentType: "application/json; charset=utf-8",
  }],
  [EXL50U_GA_REVIEW_MANIFEST_PATH, {
    localPath: EXL50U_GA_MANIFEST_PATH,
    contentType: "application/json; charset=utf-8",
  }],
  [EXL50U_GA_PUBLICATION_NOTICE_PATH, {
    localPath: EXL50U_GA_PUBLICATION_NOTICE_PATH,
    contentType: "text/markdown; charset=utf-8",
  }],
]);
const EXL50U_GA_MAX_BYTES = 300 * 1024 * 1024;
const RUNTIME_ASSET_MIRROR_ORIGIN = "https://raw.githubusercontent.com";
const RUNTIME_ASSET_MIRROR_REPOSITORY_PATH = "tianshao1992/fusion-physics-atlas-assets";
const ITER_HIGH_DETAIL_BUNDLE_ID = "iter-high-detail-v1";
const EXL50U_GA_BUNDLE_ID = "exl50u-general-assembly-v1";
type RuntimeAssetBundleId = typeof ITER_HIGH_DETAIL_BUNDLE_ID | typeof EXL50U_GA_BUNDLE_ID;
const FORBIDDEN_RUNTIME_ASSET_MIRROR_HOSTS = new Set([
  "fusiondigital.club",
  "www.fusiondigital.club",
  "fusion-physics-atlas-2026.tianyuanliu1992.chatgpt.site",
]);

function isForbiddenRuntimeAssetMirrorHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith(".")
    || FORBIDDEN_RUNTIME_ASSET_MIRROR_HOSTS.has(host)
    || host.endsWith(".fusiondigital.club")
    || host === "chatgpt.site"
    || host.endsWith(".chatgpt.site");
}

function isCanonicalRuntimeMirrorUrlText(value: string): boolean {
  return value !== ""
    && value === value.trim()
    && !/[\u0000-\u001f\u007f?#]/u.test(value)
    && !/^[a-z][a-z0-9+.-]*:\/\/[^/]*@/iu.test(value);
}

function createControlledExl50uGeneralAssemblyAssets(
  assets: readonly Exl50uGeneralAssemblyReleaseAsset[],
): ReadonlyMap<string, IterHighDetailProxyAsset> {
  // Empty is the committed fail-closed state until a reviewed public 1.5
  // manifest generates all 20 high-detail digest entries in one change.
  if (assets.length === 0) return new Map();
  if (assets.length !== 20) {
    throw new Error("EXL-50U general-assembly release contract must contain exactly 20 high-detail shards");
  }

  const routes = new Map<string, IterHighDetailProxyAsset>();
  const digests = new Set<string>();
  let totalBytes = 0;
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    const shardIndex = index + 1;
    const expectedRole = `anonymous-shard-${String(shardIndex).padStart(2, "0")}`;
    const expectedFilename = new RegExp(
      `^anonymous-shard-${String(shardIndex).padStart(2, "0")}\\.${asset.sha256}\\.high\\.meshopt\\.glb$`,
      "u",
    );
    if (
      asset.role !== expectedRole
      || !/^[a-f0-9]{64}$/u.test(asset.sha256)
      || digests.has(asset.sha256)
      || !expectedFilename.test(asset.filename)
      || !Number.isSafeInteger(asset.bytes)
      || asset.bytes <= 0
      || asset.bytes >= 24 * 1024 * 1024
    ) {
      throw new Error(`Invalid EXL-50U general-assembly allow-list entry: ${expectedRole}`);
    }
    totalBytes += asset.bytes;
    digests.add(asset.sha256);
    const route = `${EXL50U_GA_ROUTE_ROOT}/${asset.filename}`;
    routes.set(route, {
      // The local-first boundary ignores this logical name. A remote URL is
      // constructed only after a canonical HTTPS mirror has been validated.
      upstreamUrl: asset.filename,
      filename: asset.filename,
      localPath: `${EXL50U_GA_LOCAL_ROOT}/${asset.filename}`,
      bytes: asset.bytes,
    });
  }
  if (totalBytes > EXL50U_GA_MAX_BYTES) {
    throw new Error("EXL-50U general-assembly release contract exceeds 300 MiB");
  }
  return routes;
}

const controlledExl50uGeneralAssemblyAssets = createControlledExl50uGeneralAssemblyAssets(
  EXL50U_GENERAL_ASSEMBLY_RELEASE_ASSETS,
);

const controlledEfitAssets = new Map<string, string>([
  ["/device-data/exl50u-efit/index.json", "/data/exl50u-efit/index.json"],
  ["/device-data/exl50u-efit/shot-18301.bin", "/data/exl50u-efit/shot-18301.bin"],
  ["/device-data/exl50u-efit/shot-18303.bin", "/data/exl50u-efit/shot-18303.bin"],
  ["/device-data/exl50u-efit/shot-18303-topology.bin", "/data/exl50u-efit/shot-18303-topology.bin"],
  ["/device-data/exl50u-efit/shot-18304.bin", "/data/exl50u-efit/shot-18304.bin"],
  ["/device-data/exl50u-efit/shot-18308.bin", "/data/exl50u-efit/shot-18308.bin"],
]);

// This is an exact reviewed allow-list, generated from the immutable 16-frame
// chunk contract. It deliberately does not authorize a directory prefix.
const controlledEfitV2ChunkCounts = [
  [20213, 33],
  [20289, 4],
  [20666, 45],
  [20669, 57],
  [20707, 38],
  [20708, 42],
] as const;
controlledEfitAssets.set(
  "/device-data/exl50u-efit-v2/index.json",
  "/data/exl50u-efit-v2/index.json",
);
for (const [shot, partCount] of controlledEfitV2ChunkCounts) {
  for (let part = 0; part < partCount; part += 1) {
    const filename = `shot-${shot}-part-${String(part).padStart(3, "0")}.jsonl.gz`;
    controlledEfitAssets.set(
      `/device-data/exl50u-efit-v2/${filename}`,
      `/data/exl50u-efit-v2/${filename}`,
    );
  }
}

function isControlledEfitNamespace(pathname: string): boolean {
  return [
    "/device-data/exl50u-efit",
    "/device-data/exl50u-efit-v2",
    "/data/exl50u-efit",
    "/data/exl50u-efit-v2",
  ].some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

function controlledEfitContentType(pathname: string): string {
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".jsonl.gz")) return "application/gzip";
  return "application/octet-stream";
}

function secureInlineHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  headers.set("Cache-Control", "no-store, private, max-age=0");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Content-Disposition", "inline");
  return headers;
}

function controlledNotFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: secureInlineHeaders(new Headers({ "Content-Type": "text/plain; charset=utf-8" })),
  });
}

function iterHighDetailHeaders(cacheControl: string): Headers {
  return new Headers({
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    "Content-Disposition": "inline",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
}

function iterHighDetailError(
  status: 416 | 429 | 502 | 503,
  options: { contentRange?: string | null; retryAfter?: string | null } = {},
): Response {
  const headers = iterHighDetailHeaders("no-store, private, max-age=0");
  if (options.contentRange) headers.set("Content-Range", options.contentRange);
  if (options.retryAfter) headers.set("Retry-After", options.retryAfter);
  return new Response(null, { status, headers });
}

interface NormalizedByteRange {
  first: bigint;
  last: bigint;
}

function normalizeSingleByteRange(
  value: string,
  representationBytes: number,
): NormalizedByteRange | null {
  if (value.length > 128 || value.includes(",")) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  try {
    const total = BigInt(representationBytes);
    const finalByte = total - BigInt(1);
    if (!match[1]) {
      const suffixLength = BigInt(match[2]);
      if (suffixLength <= BigInt(0)) return null;
      return {
        first: suffixLength >= total ? BigInt(0) : total - suffixLength,
        last: finalByte,
      };
    }
    const first = BigInt(match[1]);
    if (first >= total) return null;
    if (!match[2]) return { first, last: finalByte };
    const requestedLast = BigInt(match[2]);
    if (requestedLast < first) return null;
    return { first, last: requestedLast > finalByte ? finalByte : requestedLast };
  } catch {
    return null;
  }
}

function parseContentLength(value: string | null): bigint | null | undefined {
  if (value === null) return null;
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function validPartialContentHeaders(
  headers: Headers,
  representationBytes: number,
  requestedRange: NormalizedByteRange,
): boolean {
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/i.exec(headers.get("Content-Range") ?? "");
  if (!range) return false;
  const first = BigInt(range[1]);
  const last = BigInt(range[2]);
  const total = BigInt(range[3]);
  if (
    first !== requestedRange.first
    || last !== requestedRange.last
    || first > last
    || last >= total
    || total !== BigInt(representationBytes)
  ) return false;
  const contentLength = parseContentLength(headers.get("Content-Length"));
  return contentLength !== undefined && contentLength !== null && contentLength === last - first + BigInt(1);
}

function validUnsatisfiedContentRange(value: string | null, representationBytes: number): value is string {
  const match = /^bytes \*\/(\d+)$/i.exec(value ?? "");
  return Boolean(match && BigInt(match[1]) === BigInt(representationBytes));
}

async function discardUpstreamBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is being replaced with a controlled local error. A failed
    // cancellation must not leak upstream content or alter that fail-closed result.
  }
}

/**
 * Proxy one already allow-listed, content-addressed ITER component.
 * Exported as a pure boundary so its HTTP/security contract can be exercised
 * without weakening the production path allow-list.
 */
export async function proxyIterHighDetailAsset(
  request: Request,
  asset: IterHighDetailProxyAsset,
  upstreamFetch: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") return controlledNotFound();

  const range = request.headers.get("Range");
  const normalizedRange = range === null ? null : normalizeSingleByteRange(range, asset.bytes);
  if (range !== null && normalizedRange === null) {
    return iterHighDetailError(416, { contentRange: `bytes */${asset.bytes}` });
  }

  const upstreamHeaders = new Headers({ "Accept-Encoding": "identity" });
  for (const name of ["If-None-Match", "If-Modified-Since"] as const) {
    const value = request.headers.get(name);
    if (value) upstreamHeaders.set(name, value);
  }
  if (range !== null) {
    upstreamHeaders.set("Range", range);
    const ifRange = request.headers.get("If-Range");
    if (ifRange) upstreamHeaders.set("If-Range", ifRange);
  }

  let upstream: Response;
  try {
    upstream = await upstreamFetch(asset.upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: "manual",
    });
  } catch {
    return iterHighDetailError(502);
  }

  if (upstream.status >= 500) {
    const retryAfter = upstream.headers.get("Retry-After");
    await discardUpstreamBody(upstream);
    return iterHighDetailError(503, { retryAfter });
  }
  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("Retry-After");
    await discardUpstreamBody(upstream);
    return iterHighDetailError(429, { retryAfter });
  }
  if (upstream.status === 416) {
    const contentRange = upstream.headers.get("Content-Range");
    await discardUpstreamBody(upstream);
    return validUnsatisfiedContentRange(contentRange, asset.bytes)
      ? iterHighDetailError(416, { contentRange })
      : iterHighDetailError(502);
  }
  if (![200, 206, 304].includes(upstream.status)) {
    await discardUpstreamBody(upstream);
    return iterHighDetailError(502);
  }
  const hasCacheValidator = request.headers.has("If-None-Match")
    || request.headers.has("If-Modified-Since");
  if (upstream.status === 304 && !hasCacheValidator) {
    await discardUpstreamBody(upstream);
    return iterHighDetailError(502);
  }

  const contentEncoding = upstream.headers.get("Content-Encoding");
  if (contentEncoding !== null && contentEncoding.trim().toLowerCase() !== "identity") {
    await discardUpstreamBody(upstream);
    return iterHighDetailError(502);
  }
  const upstreamLength = parseContentLength(upstream.headers.get("Content-Length"));
  const validLength = upstream.status === 304 || (
    upstreamLength !== undefined
    && upstreamLength !== null
    && (upstream.status !== 200 || upstreamLength === BigInt(asset.bytes))
  );
  const validPartial = upstream.status !== 206 || (
    normalizedRange !== null
    && validPartialContentHeaders(upstream.headers, asset.bytes, normalizedRange)
  );
  if (!validLength || !validPartial) {
    await discardUpstreamBody(upstream);
    return iterHighDetailError(502);
  }

  const headers = iterHighDetailHeaders("public, max-age=31536000, immutable");
  headers.set("Content-Type", "model/gltf-binary");
  for (const name of ["ETag", "Last-Modified"] as const) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength && upstream.status !== 304) headers.set("Content-Length", contentLength);
  if (upstream.status === 206) {
    headers.set("Content-Range", upstream.headers.get("Content-Range")!);
  }

  const suppressBody = request.method === "HEAD" || upstream.status === 304;
  if (suppressBody) await discardUpstreamBody(upstream);
  return new Response(suppressBody ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export function normalizeImmutableAssetMirrorBase(
  value: string | undefined,
  expectedBundleId: RuntimeAssetBundleId,
): string | null {
  if (value === undefined || value === "") return null;
  if (!isCanonicalRuntimeMirrorUrlText(value)) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:"
    || !parsed.hostname
    || parsed.origin !== RUNTIME_ASSET_MIRROR_ORIGIN
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.search !== ""
    || parsed.hash !== ""
    || isForbiddenRuntimeAssetMirrorHost(parsed.hostname)
    || /^[a-z]+:\/\/[^/]*@/i.test(value)
  ) return null;

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  const normalized = parsed.href.replace(/\/$/, "");
  const expectedPath = new RegExp(
    `^/${RUNTIME_ASSET_MIRROR_REPOSITORY_PATH}/[a-f0-9]{40}/${expectedBundleId}$`,
    "u",
  );
  return normalized === value.replace(/\/+$/, "") && expectedPath.test(parsed.pathname)
    ? normalized
    : null;
}

function validImmutableMirrorFinalResponse(
  response: Response,
  mirrorBase: string,
  filename: string,
): boolean {
  if (!isCanonicalRuntimeMirrorUrlText(response.url)) return false;
  let finalUrl: URL;
  let expected: URL;
  try {
    finalUrl = new URL(response.url);
    expected = new URL(`${mirrorBase}/${filename}`);
  } catch {
    return false;
  }
  return finalUrl.protocol === "https:"
    && response.redirected === false
    && finalUrl.username === ""
    && finalUrl.password === ""
    && finalUrl.search === ""
    && finalUrl.hash === ""
    && finalUrl.origin === expected.origin
    && finalUrl.pathname === expected.pathname
    && finalUrl.href === expected.href
    && !isForbiddenRuntimeAssetMirrorHost(finalUrl.hostname);
}

async function fetchControlledImmutableMirror(
  mirrorBase: string,
  filename: string,
  init: RequestInit | undefined,
): Promise<Response> {
  const expectedUrl = `${mirrorBase}/${filename}`;
  const response = await fetch(expectedUrl, { ...init, redirect: "manual" });
  if (
    (response.status >= 300 && response.status <= 399)
    || response.redirected
    || !validImmutableMirrorFinalResponse(response, mirrorBase, filename)
  ) {
    await discardUpstreamBody(response);
    return new Response(null, { status: 502 });
  }
  return response;
}

function createIterHighDetailLocalFirstFetch(
  request: Request,
  env: Env,
  asset: IterHighDetailProxyAsset,
): typeof fetch {
  return async (_input, init) => {
    if (!asset.filename || !asset.localPath) {
      throw new Error("ITER high-detail asset is missing its controlled local path");
    }

    const localRequest = new Request(new URL(asset.localPath, request.url), init);
    const localResponse = await env.ASSETS.fetch(localRequest);
    if (localResponse.status !== 404) return localResponse;
    await discardUpstreamBody(localResponse);

    const mirrorBase = normalizeImmutableAssetMirrorBase(
      env.ITER_HIGH_DETAIL_ASSET_BASE_URL,
      ITER_HIGH_DETAIL_BUNDLE_ID,
    );
    if (mirrorBase === null) return new Response(null, { status: 503 });
    return fetchControlledImmutableMirror(mirrorBase, asset.filename, init);
  };
}

function createExl50uGeneralAssemblyLocalFirstFetch(
  request: Request,
  env: Env,
  asset: IterHighDetailProxyAsset,
): typeof fetch {
  return async (_input, init) => {
    if (!asset.filename || !asset.localPath) {
      throw new Error("EXL-50U general-assembly asset is missing its controlled local path");
    }

    const localRequest = new Request(new URL(asset.localPath, request.url), init);
    const localResponse = await env.ASSETS.fetch(localRequest);
    if (localResponse.status !== 404) return localResponse;
    await discardUpstreamBody(localResponse);

    const mirrorBase = normalizeImmutableAssetMirrorBase(
      env.EXL50U_GENERAL_ASSEMBLY_ASSET_BASE_URL,
      EXL50U_GA_BUNDLE_ID,
    );
    if (mirrorBase === null) return new Response(null, { status: 503 });
    return fetchControlledImmutableMirror(mirrorBase, asset.filename, init);
  };
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // vinext's local production server does not inject platform bindings. Keep
    // public pages available there; database-backed routes will fail closed in
    // `requireD1Binding()` instead of crashing the whole server.
    if (env?.DB) {
      if (
        globalThis.__FUSIONDIGITAL_DB__ &&
        globalThis.__FUSIONDIGITAL_DB__ !== env.DB
      ) {
        throw new Error("D1 binding changed within an active Worker isolate");
      }
      globalThis.__FUSIONDIGITAL_DB__ = env.DB;
    }
    if (env?.FUSIONDIGITAL_ANALYTICS_REPORT_SECRET) {
      if (
        globalThis.__FUSIONDIGITAL_ANALYTICS_REPORT_SECRET__
        && globalThis.__FUSIONDIGITAL_ANALYTICS_REPORT_SECRET__ !== env.FUSIONDIGITAL_ANALYTICS_REPORT_SECRET
      ) {
        throw new Error("Analytics report secret changed within an active Worker isolate");
      }
      globalThis.__FUSIONDIGITAL_ANALYTICS_REPORT_SECRET__ = env.FUSIONDIGITAL_ANALYTICS_REPORT_SECRET;
    }
    const url = new URL(request.url);

    const controlledEfitPath = controlledEfitAssets.get(url.pathname);
    if (controlledEfitPath && (request.method === "GET" || request.method === "HEAD")) {
      const assetUrl = new URL(controlledEfitPath, request.url);
      const assetRequest = new Request(assetUrl, request);
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      const headers = secureInlineHeaders(assetResponse.headers);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Type", controlledEfitContentType(controlledEfitPath));
      // The v2 manifest hashes the compressed bytes. Browser fetch must receive
      // those bytes verbatim and perform its own verified decompression.
      if (controlledEfitPath.endsWith(".jsonl.gz")) headers.delete("Content-Encoding");
      return new Response(request.method === "HEAD" ? null : assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }
    if (isControlledEfitNamespace(url.pathname)) {
      return controlledNotFound();
    }

    const iterHighDetailAsset = controlledIterHighDetailAssets.get(url.pathname);
    if (iterHighDetailAsset && (request.method === "GET" || request.method === "HEAD")) {
      return proxyIterHighDetailAsset(
        request,
        iterHighDetailAsset,
        createIterHighDetailLocalFirstFetch(request, env, iterHighDetailAsset),
      );
    }

    const exl50uGeneralAssemblyAsset = controlledExl50uGeneralAssemblyAssets.get(url.pathname);
    if (exl50uGeneralAssemblyAsset && (request.method === "GET" || request.method === "HEAD")) {
      return proxyIterHighDetailAsset(
        request,
        exl50uGeneralAssemblyAsset,
        createExl50uGeneralAssemblyLocalFirstFetch(request, env, exl50uGeneralAssemblyAsset),
      );
    }

    // The Sites archive retains only the reviewed public manifest and its
    // publication notice; large GLBs are removed and served through the
    // digest-locked proxy above. Permit only those metadata files (plus the
    // review route's manifest alias) before the private cache namespace is
    // denied, without turning /models into a public directory-prefix bypass.
    const exl50uGeneralAssemblyMetadata = EXL50U_GA_PUBLIC_METADATA.get(url.pathname);
    if (
      exl50uGeneralAssemblyMetadata
      && (request.method === "GET" || request.method === "HEAD")
    ) {
      const manifestResponse = await env.ASSETS.fetch(new Request(
        new URL(exl50uGeneralAssemblyMetadata.localPath, request.url),
        { method: request.method },
      ));
      const headers = new Headers(manifestResponse.headers);
      headers.set("Cache-Control", "no-store, private, max-age=0");
      headers.set("Content-Type", exl50uGeneralAssemblyMetadata.contentType);
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      headers.set("Content-Disposition", "inline");
      headers.delete("Content-Encoding");
      headers.delete("Set-Cookie");
      return new Response(request.method === "HEAD" ? null : manifestResponse.body, {
        status: manifestResponse.status,
        statusText: manifestResponse.statusText,
        headers,
      });
    }

    const controlledAssetPath = controlledDeviceAssets.get(url.pathname);
    if (controlledAssetPath && (request.method === "GET" || request.method === "HEAD")) {
      const assetUrl = new URL(controlledAssetPath, request.url);
      const assetRequest = new Request(assetUrl, request);
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      const headers = new Headers(assetResponse.headers);
      headers.set("Cache-Control", "no-store, private, max-age=0");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cross-Origin-Resource-Policy", "same-origin");
      headers.set("Content-Disposition", "inline");
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }
    if (
      url.pathname.startsWith("/device-assets/") ||
      url.pathname.startsWith("/models/exl50u-interactive/") ||
      url.pathname === "/models/iter-high-detail-v1" ||
      url.pathname.startsWith("/models/iter-high-detail-v1/") ||
      url.pathname === EXL50U_GA_LOCAL_ROOT ||
      url.pathname.startsWith(`${EXL50U_GA_LOCAL_ROOT}/`)
    ) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Cache-Control": "no-store, private, max-age=0",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "same-origin",
        },
      });
    }
    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
