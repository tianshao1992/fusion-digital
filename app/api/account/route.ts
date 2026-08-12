import { getQuotaOverride } from "@/db/accounts";
import { DEFAULT_QUOTA, getUsageForDate } from "@/db/usage";
import { requirePrincipal } from "../_lib/auth";
import { apiRequestId, handleApiError, ok } from "../_lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = apiRequestId(request);
  try {
    const principal = await requirePrincipal();
    const override = await getQuotaOverride(principal.user.id);
    const quota = {
      dailyRequestLimit: override?.dailyRequestLimit ?? DEFAULT_QUOTA.dailyRequestLimit,
      dailyTokenLimit: override?.dailyTokenLimit ?? DEFAULT_QUOTA.dailyTokenLimit,
      maxTokensPerRequest: override?.maxTokensPerRequest ?? DEFAULT_QUOTA.maxTokensPerRequest,
    };
    const usage = await getUsageForDate(principal.user.id);
    return ok({
      id: principal.user.id,
      email: principal.user.email,
      displayName: principal.user.displayName,
      roles: principal.roles,
      quota,
      usage: usage ?? {
        requestCount: 0,
        reservedTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
    });
  } catch (error) {
    return handleApiError(error, requestId);
  }
}
