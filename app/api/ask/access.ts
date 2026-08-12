export type AskAccess = {
  authenticated: boolean;
  userId: string | null;
  requestId: string;
  quotaPolicy: "database-ledger-v1" | "anonymous-retrieval-only";
  reserved: boolean;
};

export async function authorizeAsk(input: { requestedTokens: number; model: string; questionLength: number; contextEntries: number }): Promise<AskAccess> {
  const requestId = crypto.randomUUID();
  const { getChatGPTUser } = await import("@/app/chatgpt-auth");
  const identity = await getChatGPTUser();
  if (!identity) return { authenticated: false, userId: null, requestId, quotaPolicy: "anonymous-retrieval-only", reserved: false };

  const [accounts, usage] = await Promise.all([import("@/db/accounts"), import("@/db/usage")]);
  try {
    const principal = await accounts.provisionUser(identity);
    const override = await accounts.getQuotaOverride(principal.user.id);
    const quota = effectiveQuota(override, usage.DEFAULT_QUOTA);
    if (input.requestedTokens > quota.maxTokensPerRequest) throw new usage.QuotaExceededError("Requested token budget exceeds the per-request limit");
    await usage.reserveUsage({
      userId: principal.user.id,
      requestId,
      capability: "knowledge.ask",
      provider: "openai",
      model: input.model,
      requestedTokens: input.requestedTokens,
      quota,
      metadata: { questionLength: input.questionLength, contextEntries: input.contextEntries },
    });
    await safeAudit({ actorUserId: principal.user.id, requestId, outcome: "success", action: "knowledge.ask.reserve", model: input.model });
    return { authenticated: true, userId: principal.user.id, requestId, quotaPolicy: "database-ledger-v1", reserved: true };
  } catch (reason) {
    if (reason instanceof usage.QuotaExceededError) throw reason;
    // During local builds and before the first hosted D1 migration, identity may
    // exist while the binding does not. Never allow an unmetered model call.
    console.error("AI account ledger unavailable", reason instanceof Error ? reason.message : reason);
    return { authenticated: false, userId: null, requestId, quotaPolicy: "anonymous-retrieval-only", reserved: false };
  }
}

export async function settleAsk(access: AskAccess, input: { status: "succeeded" | "failed" | "cancelled"; inputTokens?: number; outputTokens?: number; model: string }) {
  if (!access.reserved || !access.userId) return;
  try {
    const { settleUsage } = await import("@/db/usage");
    const settled = await settleUsage({ userId: access.userId, requestId: access.requestId, status: input.status, inputTokens: input.inputTokens, outputTokens: input.outputTokens });
    await safeAudit({ actorUserId: access.userId, requestId: access.requestId, outcome: input.status === "succeeded" && settled ? "success" : "failure", action: "knowledge.ask.settle", model: input.model });
  } catch (reason) {
    console.error("Unable to settle AI usage ledger", reason instanceof Error ? reason.message : reason);
  }
}

function effectiveQuota(override: { dailyRequestLimit: number | null; dailyTokenLimit: number | null; maxTokensPerRequest: number | null } | null, defaults: { dailyRequestLimit: number; dailyTokenLimit: number; maxTokensPerRequest: number }) {
  return {
    dailyRequestLimit: override?.dailyRequestLimit ?? defaults.dailyRequestLimit,
    dailyTokenLimit: override?.dailyTokenLimit ?? defaults.dailyTokenLimit,
    maxTokensPerRequest: override?.maxTokensPerRequest ?? defaults.maxTokensPerRequest,
  };
}

async function safeAudit(input: { actorUserId: string; requestId: string; outcome: "success" | "failure"; action: string; model: string }) {
  try {
    const { appendAuditEvent } = await import("@/db/audit");
    await appendAuditEvent({ actorUserId: input.actorUserId, requestId: input.requestId, action: input.action, resourceType: "knowledge_answer", resourceId: input.model, outcome: input.outcome });
  } catch (reason) {
    console.error("Unable to append AI audit event", reason instanceof Error ? reason.message : reason);
  }
}
