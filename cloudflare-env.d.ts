declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}

declare namespace Cloudflare {
  interface D1Result<T = unknown> {
    results?: T[];
    success: boolean;
    meta: Record<string, unknown>;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
    run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]>;
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<D1Result>;
    dump(): Promise<ArrayBuffer>;
  }

  interface Env {
    DB?: D1Database;
    ITER_HIGH_DETAIL_ASSET_BASE_URL?: string;
    FUSIONDIGITAL_ANALYTICS_INGEST_SECRET?: string;
  }
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}
