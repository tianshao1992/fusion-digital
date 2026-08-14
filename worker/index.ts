/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

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
