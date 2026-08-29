declare global {
  var __FUSIONDIGITAL_ANALYTICS_REPORT_SECRET__: string | undefined;
}

export function analyticsReportSecret(): string | undefined {
  return globalThis.__FUSIONDIGITAL_ANALYTICS_REPORT_SECRET__
    ?? process.env.FUSIONDIGITAL_ANALYTICS_REPORT_SECRET;
}
