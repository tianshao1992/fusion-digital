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
