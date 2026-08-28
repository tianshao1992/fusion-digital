import { analyticsPublicIdDigest } from "./contracts";

export const ANALYTICS_CONTENT_EVENT = "fusiondigital:analytics-content" as const;

export type AnalyticsContentDetail = {
  kind: string;
  id: string;
};

/**
 * Records only an approved public content identifier. Never pass search text,
 * account data, free-form user input, email, IP, or credentials here.
 */
export function trackAnalyticsContent(kind: string, id: string): void {
  if (typeof window === "undefined") return;
  const safeId = kind === "knowledge-node" ? analyticsPublicIdDigest(id) : id;
  window.dispatchEvent(new CustomEvent<AnalyticsContentDetail>(ANALYTICS_CONTENT_EVENT, {
    detail: { kind, id: safeId },
  }));
}
