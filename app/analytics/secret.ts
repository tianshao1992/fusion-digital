declare global {
  var __FUSIONDIGITAL_ANALYTICS_INGEST_SECRET__: string | undefined;
}

export function analyticsIngestSecret(): string | undefined {
  return globalThis.__FUSIONDIGITAL_ANALYTICS_INGEST_SECRET__
    ?? process.env.FUSIONDIGITAL_ANALYTICS_INGEST_SECRET;
}
