export const LLM_PROVIDER_IDS = ["openai", "anthropic", "deepseek", "kimi"] as const;

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];
export type LlmProviderProtocol = "openai-responses" | "anthropic-messages" | "chat-completions";
export type ProviderEnvironment = Readonly<Record<string, string | undefined>>;

export type ProviderDefinition = {
  id: LlmProviderId;
  label: string;
  protocol: LlmProviderProtocol;
  endpoint: string;
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
};

export type PublicLlmProvider = {
  id: LlmProviderId;
  label: string;
  model: string;
  available: boolean;
  configured?: boolean;
  source?: "personal" | "platform" | "none";
  keyHint?: string | null;
  region?: "cn" | "international" | null;
  updatedAt?: string | null;
};

export type ResolvedLlmProvider = PublicLlmProvider & {
  protocol: LlmProviderProtocol;
  endpoint: string;
  apiKey: string;
};

const PROVIDERS: readonly ProviderDefinition[] = Object.freeze([
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai-responses",
    endpoint: "https://api.openai.com/v1/responses",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-5.6-terra",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    protocol: "anthropic-messages",
    endpoint: "https://api.anthropic.com/v1/messages",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-5",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "chat-completions",
    endpoint: "https://api.deepseek.com/chat/completions",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    defaultModel: "deepseek-v4-flash",
  },
  {
    id: "kimi",
    label: "Kimi / Moonshot",
    protocol: "chat-completions",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
    apiKeyEnv: "MOONSHOT_API_KEY",
    modelEnv: "MOONSHOT_MODEL",
    defaultModel: "kimi-k3",
  },
]);

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/;

export function getProviderDefinition(value: unknown): ProviderDefinition | null {
  const id = cleanProviderId(value);
  return id ? PROVIDERS.find((candidate) => candidate.id === id) ?? null : null;
}

export function listProviderDefinitions(): readonly ProviderDefinition[] {
  return PROVIDERS;
}

export function normalizeProviderModel(value: unknown, fallback: string): string | null {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return null;
  const model = value.trim();
  return model && MODEL_ID.test(model) ? model : null;
}

export function resolveProviderWithCredential(input: {
  provider: LlmProviderId;
  apiKey: string;
  model?: string | null;
  region?: "cn" | "international" | null;
}): ResolvedLlmProvider | null {
  const definition = getProviderDefinition(input.provider);
  if (!definition) return null;
  const apiKey = readSecret(input.apiKey);
  const apiKeyBytes = new TextEncoder().encode(apiKey).byteLength;
  const model = normalizeProviderModel(input.model, definition.defaultModel);
  if (!apiKey || apiKeyBytes < 8 || /[\u0000-\u001f\u007f-\u009f]/.test(apiKey) || !model) return null;
  return {
    id: definition.id,
    label: definition.label,
    model,
    available: true,
    configured: true,
    source: "personal",
    protocol: definition.protocol,
    endpoint: definition.id === "kimi" && input.region === "international"
      ? "https://api.moonshot.ai/v1/chat/completions"
      : definition.endpoint,
    apiKey,
  };
}

export function cleanProviderId(value: unknown): LlmProviderId | null {
  return typeof value === "string" && (LLM_PROVIDER_IDS as readonly string[]).includes(value)
    ? value as LlmProviderId
    : null;
}

export function listPublicProviders(env: ProviderEnvironment = process.env): PublicLlmProvider[] {
  return PROVIDERS.map((definition) => {
    const model = readModel(env[definition.modelEnv], definition.defaultModel);
    return {
      id: definition.id,
      label: definition.label,
      model,
      available: Boolean(readSecret(env[definition.apiKeyEnv])),
    };
  });
}

export function getDefaultProviderId(env: ProviderEnvironment = process.env): LlmProviderId | null {
  const available = listPublicProviders(env).filter((provider) => provider.available);
  const requested = cleanProviderId(env.LLM_DEFAULT_PROVIDER);
  if (requested && available.some((provider) => provider.id === requested)) return requested;
  return available[0]?.id ?? null;
}

export function resolveProvider(value: unknown, env: ProviderEnvironment = process.env):
  | { status: "selected"; provider: ResolvedLlmProvider }
  | { status: "retrieval" }
  | { status: "unavailable"; provider: PublicLlmProvider }
  | { status: "invalid" } {
  if (value === "retrieval") return { status: "retrieval" };
  const requested = value === undefined || value === null || value === ""
    ? getDefaultProviderId(env)
    : cleanProviderId(value);
  if (!requested) return value === undefined || value === null || value === ""
    ? { status: "retrieval" }
    : { status: "invalid" };

  const definition = PROVIDERS.find((candidate) => candidate.id === requested);
  if (!definition) return { status: "invalid" };
  const model = readModel(env[definition.modelEnv], definition.defaultModel);
  const apiKey = readSecret(env[definition.apiKeyEnv]);
  const publicProvider: PublicLlmProvider = {
    id: definition.id,
    label: definition.label,
    model,
    available: Boolean(apiKey),
  };
  if (!apiKey) return { status: "unavailable", provider: publicProvider };
  return {
    status: "selected",
    provider: {
      ...publicProvider,
      protocol: definition.protocol,
      endpoint: moonshotEndpoint(definition, env),
      apiKey,
    },
  };
}

export function publicProviderEnvelope(env: ProviderEnvironment = process.env) {
  return {
    defaultProvider: getDefaultProviderId(env),
    providers: listPublicProviders(env),
  };
}

function moonshotEndpoint(definition: ProviderDefinition, env: ProviderEnvironment) {
  if (definition.id !== "kimi") return definition.endpoint;
  return env.MOONSHOT_REGION?.trim().toLowerCase() === "international"
    ? "https://api.moonshot.ai/v1/chat/completions"
    : definition.endpoint;
}

function readModel(value: string | undefined, fallback: string) {
  const model = value?.trim();
  return model && MODEL_ID.test(model) ? model : fallback;
}

function readSecret(value: string | undefined) {
  const key = value?.trim();
  return key && key.length <= 512 ? key : "";
}
