import type { Principal } from "@/db/accounts";
import {
  getUserLlmCredential,
  getUserLlmPreference,
  listUserLlmCredentials,
  type UserLlmProviderId,
} from "@/db/llm-credentials";
import {
  decryptCredentialApiKey,
  type EncryptedCredentialApiKey,
} from "@/app/api/account/llm-credentials/credential-crypto";
import {
  cleanProviderId,
  getDefaultProviderId,
  getProviderDefinition,
  listPublicProviders,
  resolveProvider,
  resolveProviderWithCredential,
  type LlmProviderId,
  type ProviderEnvironment,
  type PublicLlmProvider,
  type ResolvedLlmProvider,
} from "./provider-registry";

export type UserPublicLlmProvider = PublicLlmProvider & {
  configured: boolean;
  source: "personal" | "platform" | "none";
  keyHint: string | null;
  region: "cn" | "international" | null;
  updatedAt: string | null;
};

export type UserProviderEnvelope = {
  authenticated: boolean;
  defaultProvider: LlmProviderId | "retrieval" | null;
  providers: UserPublicLlmProvider[];
};

export function chooseAutomaticDefaultProvider(
  providers: readonly UserPublicLlmProvider[],
  preference: LlmProviderId | "retrieval" | null,
  platformDefault: LlmProviderId | null,
): LlmProviderId | "retrieval" {
  if (preference === "retrieval") return "retrieval";
  if (preference) {
    return providers.some((provider) => provider.id === preference && provider.available)
      ? preference
      : "retrieval";
  }
  const personal = providers.find((provider) => provider.available && provider.source === "personal");
  if (personal) return personal.id;
  if (platformDefault && providers.some((provider) => provider.id === platformDefault && provider.available)) {
    return platformDefault;
  }
  return providers.find((provider) => provider.available)?.id ?? "retrieval";
}

type Resolution =
  | { status: "selected"; provider: ResolvedLlmProvider }
  | { status: "retrieval" }
  | { status: "unavailable"; provider: UserPublicLlmProvider }
  | { status: "invalid" };

export async function userProviderEnvelope(
  principal: Principal | null,
  env: ProviderEnvironment = process.env,
): Promise<UserProviderEnvelope> {
  const platform = new Map(listPublicProviders(env).map((provider) => [provider.id, provider]));
  if (!principal) {
    return {
      authenticated: false,
      defaultProvider: getDefaultProviderId(env),
      providers: [...platform.values()].map((provider) => publicStatus(provider, null)),
    };
  }

  const [credentials, preference] = await Promise.all([
    listUserLlmCredentials(principal.user.id),
    getUserLlmPreference(principal.user.id),
  ]);
  const personal = new Map(credentials.map((credential) => [credential.provider, credential]));
  const providers = [...platform.values()].map((provider) => {
    const credential = personal.get(provider.id);
    if (!credential) return publicStatus(provider, null);
    return {
      id: provider.id,
      label: provider.label,
      model: credential.model || provider.model,
      available: credential.enabled && encryptionSecretPresent(env),
      configured: true,
      source: "personal" as const,
      keyHint: credential.keyHint,
      region: credential.region,
      updatedAt: credential.updatedAt,
    };
  });
  return {
    authenticated: true,
    defaultProvider: chooseAutomaticDefaultProvider(
      providers,
      preference?.defaultProvider ?? null,
      getDefaultProviderId(env),
    ),
    providers,
  };
}

export async function resolveProviderForUser(
  value: unknown,
  principal: Principal | null,
  env: ProviderEnvironment = process.env,
): Promise<Resolution> {
  if (value === "retrieval") return { status: "retrieval" };
  const explicit = value !== undefined && value !== null && value !== "";
  let requested = explicit ? cleanProviderId(value) : null;
  if (explicit && !requested) return { status: "invalid" };

  if (!requested && principal) {
    const preference = await getUserLlmPreference(principal.user.id);
    if (preference?.defaultProvider === "retrieval") return { status: "retrieval" };
    requested = preference?.defaultProvider ?? null;
    if (!requested) {
      const credentials = await listUserLlmCredentials(principal.user.id);
      requested = credentials.find((credential) => credential.enabled)?.provider ?? null;
    }
  }
  requested ??= getDefaultProviderId(env);
  if (!requested) return { status: "retrieval" };

  if (principal) {
    const credential = await getUserLlmCredential(principal.user.id, requested as UserLlmProviderId);
    if (credential) {
      const definition = getProviderDefinition(requested);
      const unavailable = personalUnavailableStatus(requested, credential, env);
      if (!credential.enabled || !definition) return { status: "unavailable", provider: unavailable };
      try {
        if (credential.keyVersion !== 1) throw new Error("Unsupported credential key version");
        const apiKey = await decryptCredentialApiKey({
          encrypted: {
            cipherSuite: "AES-256-GCM",
            keyVersion: 1,
            iv: credential.iv,
            ciphertext: credential.ciphertext,
          } satisfies EncryptedCredentialApiKey,
          userId: principal.user.id,
          provider: requested,
        });
        const provider = resolveProviderWithCredential({
          provider: requested,
          apiKey,
          model: credential.model,
          region: credential.region,
        });
        return provider ? { status: "selected", provider } : { status: "unavailable", provider: unavailable };
      } catch {
        // A personal row is authoritative. Corruption or a missing KEK must
        // fail closed instead of silently charging a site-wide credential.
        return { status: "unavailable", provider: unavailable };
      }
    }
  }

  const platformResolution = resolveProvider(requested, env);
  if (platformResolution.status === "selected") {
    return { status: "selected", provider: { ...platformResolution.provider, configured: true, source: "platform" } };
  }
  if (platformResolution.status === "unavailable") {
    return { status: "unavailable", provider: publicStatus(platformResolution.provider, null) };
  }
  return platformResolution;
}

function publicStatus(
  provider: PublicLlmProvider,
  personal: null,
): UserPublicLlmProvider {
  void personal;
  return {
    ...provider,
    configured: provider.available,
    source: provider.available ? "platform" : "none",
    keyHint: null,
    region: null,
    updatedAt: null,
  };
}

function personalUnavailableStatus(
  providerId: LlmProviderId,
  credential: Awaited<ReturnType<typeof getUserLlmCredential>> & {},
  env: ProviderEnvironment,
): UserPublicLlmProvider {
  const definition = getProviderDefinition(providerId)!;
  const platform = listPublicProviders(env).find((candidate) => candidate.id === providerId);
  return {
    id: providerId,
    label: definition.label,
    model: credential.model || platform?.model || definition.defaultModel,
    available: false,
    configured: true,
    source: "personal",
    keyHint: credential.keyHint,
    region: credential.region,
    updatedAt: credential.updatedAt,
  };
}

function encryptionSecretPresent(env: ProviderEnvironment): boolean {
  const value = env.LLM_CREDENTIAL_KEK_V1?.trim();
  return Boolean(value && value.length === 43);
}
