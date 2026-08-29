import { resolveAnalyticsDays } from "@/app/analytics/contracts";
import { isPublicAnonymousMode } from "@/app/deployment-mode";
import { requireRole } from "@/app/api/_lib/auth";
import { ApiError, apiRequestId, handleApiError, ok } from "@/app/api/_lib/http";
import { analyticsReportSecret } from "@/app/analytics/secret";
import { AnalyticsReportBridgeError, fetchClubAnalyticsReport } from "@/app/analytics/report-bridge";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (isPublicAnonymousMode()) return new Response(null, { status: 404 });
  const requestId = apiRequestId(request);
  try {
    await requireRole(["admin"], {
      requestId,
      action: "analytics.report.read",
      resourceType: "analytics_report",
    });
    const days = resolveAnalyticsDays(new URL(request.url).searchParams.get("days"));
    const report = await fetchClubAnalyticsReport(days, analyticsReportSecret());
    return ok({ report, requestId });
  } catch (error) {
    return handleApiError(
      error instanceof AnalyticsReportBridgeError
        ? new ApiError(502, "INTERNAL_ERROR", "Analytics report service is unavailable")
        : error,
      requestId,
    );
  }
}
