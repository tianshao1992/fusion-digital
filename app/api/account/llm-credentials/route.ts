import { setUserLlmPreference } from "@/db/llm-credentials";
import { requirePrincipal } from "../../_lib/auth";
import {
  ApiError,
  apiRequestId,
  assertSameOrigin,
  handleApiError,
  ok,
  readJson,
} from "../../_lib/http";
import { cleanProviderId, getProviderDefinition } from "../../ask/provider-registry";
import { userProviderEnvelope } from "../../ask/user-provider";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = apiRequestId(request);
  try {
    const principal = await requirePrincipal();
    const envelope = await userProviderEnvelope(principal);
    return ok({
      defaultProvider: envelope.defaultProvider ?? "retrieval",
      providers: envelope.providers.map((provider) => ({
        ...provider,
        defaultModel: getProviderDefinition(provider.id)?.defaultModel ?? provider.model,
      })),
    });
  } catch (error) {
    return handleApiError(error, requestId);
  }
}

export async function PATCH(request: Request) {
  const requestId = apiRequestId(request);
  let actorUserId: string | null = null;
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    actorUserId = principal.user.id;
    const body = await readJson<{ defaultProvider?: unknown }>(request, 2_048);
    const defaultProvider = body.defaultProvider === "retrieval"
      ? "retrieval"
      : cleanProviderId(body.defaultProvider);
    if (!defaultProvider) throw new ApiError(400, "BAD_REQUEST", "Unsupported default model provider");
    if (defaultProvider !== "retrieval") {
      const envelope = await userProviderEnvelope(principal);
      const selected = envelope.providers.find((provider) => provider.id === defaultProvider);
      if (!selected?.available) {
        throw new ApiError(400, "BAD_REQUEST", "Configure this provider before making it the default");
      }
    }
    const preference = await setUserLlmPreference(principal.user.id, defaultProvider, {
      actorUserId: principal.user.id,
      requestId,
    });
    return ok({ defaultProvider: preference.defaultProvider, revision: preference.revision });
  } catch (error) {
    return handleApiError(error, requestId, {
      actorUserId,
      action: "account.llm_preference.update",
      resourceType: "user_llm_preference",
    });
  }
}
