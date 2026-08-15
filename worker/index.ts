/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { ITER_HIGH_DETAIL_RELEASE_ASSETS } from "./iter-high-assets.generated";

export interface Env {
  ASSETS: Fetcher;
  DB: NonNullable<Cloudflare.Env["DB"]>;
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

const ITER_HIGH_DETAIL_RELEASE_BASE =
  "https://github.com/tianshao1992/fusion-physics-atlas-assets/releases/download/iter-education-hd-v1";
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
      upstreamUrl: `${ITER_HIGH_DETAIL_RELEASE_BASE}/${filename}`,
      bytes: asset.bytes,
    });
  }
  return result;
}

const controlledIterHighDetailAssets = createControlledIterHighDetailAssets(
  ITER_HIGH_DETAIL_RELEASE_ASSETS,
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
      redirect: "follow",
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
      return proxyIterHighDetailAsset(request, iterHighDetailAsset);
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
      url.pathname.startsWith("/models/exl50u-interactive/")
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
