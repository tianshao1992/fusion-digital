import { resolveAnalyticsDays } from "@/app/analytics/contracts";
import { isPublicAnonymousMode } from "@/app/deployment-mode";
import { requireRole } from "@/app/api/_lib/auth";
import { apiRequestId, handleApiError, ok } from "@/app/api/_lib/http";
import { getAnalyticsReport } from "@/db/analytics";

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
    return ok({ report: await getAnalyticsReport(days), requestId });
  } catch (error) {
    return handleApiError(error, requestId);
  }
}
