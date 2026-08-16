import {
  deleteUserLlmCredential,
  getUserLlmPreference,
  upsertUserLlmCredential,
} from "@/db/llm-credentials";
import { requirePrincipal } from "../../../_lib/auth";
import {
  ApiError,
  apiRequestId,
  assertSameOrigin,
  handleApiError,
  ok,
  readJson,
} from "../../../_lib/http";
import {
  cleanProviderId,
  getProviderDefinition,
  normalizeProviderModel,
} from "../../../ask/provider-registry";
import {
  CredentialCryptoError,
  encryptCredentialApiKey,
} from "../credential-crypto";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ provider: string }> };

export async function PUT(request: Request, context: RouteContext) {
  const requestId = apiRequestId(request);
  let actorUserId: string | null = null;
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    actorUserId = principal.user.id;
    const provider = cleanProviderId((await context.params).provider);
    if (!provider) throw new ApiError(404, "NOT_FOUND", "Model provider was not found");
    const definition = getProviderDefinition(provider)!;
    const body = await readJson<{ apiKey?: unknown; model?: unknown; region?: unknown }>(request, 2_048);
    if (typeof body.apiKey !== "string") throw new ApiError(400, "BAD_REQUEST", "API key is required");
    const model = normalizeProviderModel(body.model, definition.defaultModel);
    if (!model) throw new ApiError(400, "BAD_REQUEST", "Model ID is invalid");
    const region = provider === "kimi"
      ? body.region === undefined || body.region === null || body.region === "cn"
        ? "cn"
        : body.region === "international" ? "international" : null
      : null;
    if (provider === "kimi" && !region) throw new ApiError(400, "BAD_REQUEST", "Kimi region must be cn or international");

    let encrypted;
    try {
      encrypted = await encryptCredentialApiKey({
        apiKey: body.apiKey,
        userId: principal.user.id,
        provider,
      });
    } catch (error) {
      if (error instanceof CredentialCryptoError && error.kind === "validation") {
        throw new ApiError(400, "BAD_REQUEST", "API key must be 8–512 bytes and contain no control characters");
      }
      throw new ApiError(503, "INTERNAL_ERROR", "Credential encryption is unavailable");
    }

    const row = await upsertUserLlmCredential({
      userId: principal.user.id,
      provider,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      keyVersion: encrypted.keyVersion,
      keyHint: keyHint(body.apiKey),
      model,
      region,
      enabled: true,
      mutation: {
        actorUserId: principal.user.id,
        requestId,
      },
    });
    return ok({
      provider: row.provider,
      configured: true,
      model: row.model,
      region: row.region,
      keyHint: row.keyHint,
      updatedAt: row.updatedAt,
    });
  } catch (error) {
    return handleApiError(error, requestId, {
      actorUserId,
      action: "account.llm_credential.write",
      resourceType: "user_llm_credential",
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = apiRequestId(request);
  let actorUserId: string | null = null;
  try {
    assertSameOrigin(request);
    const principal = await requirePrincipal();
    actorUserId = principal.user.id;
    const provider = cleanProviderId((await context.params).provider);
    if (!provider) throw new ApiError(404, "NOT_FOUND", "Model provider was not found");
    const deleted = await deleteUserLlmCredential(principal.user.id, provider, {
      actorUserId: principal.user.id,
      requestId,
    });
    if (!deleted) throw new ApiError(404, "NOT_FOUND", "Personal model credential was not found");
    const preference = await getUserLlmPreference(principal.user.id);
    const defaultProvider = preference?.defaultProvider ?? "retrieval";
    return ok({ provider, configured: false, defaultProvider });
  } catch (error) {
    return handleApiError(error, requestId, {
      actorUserId,
      action: "account.llm_credential.delete",
      resourceType: "user_llm_credential",
    });
  }
}

function keyHint(apiKey: string): string {
  return apiKey.slice(-4);
}
