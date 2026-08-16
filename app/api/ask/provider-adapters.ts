import type { ResolvedLlmProvider } from "./provider-registry";

const MAX_PROVIDER_RESPONSE_BYTES = 1_048_576;

export type ProviderUsage = { inputTokens: number; outputTokens: number };
export type ProviderAnswer = ProviderUsage & { outputText: string };

export class ProviderRequestError extends Error {
  constructor(readonly kind: "http" | "content-type" | "oversized" | "malformed" | "empty", readonly status?: number) {
    super(`LLM provider request failed: ${kind}`);
    this.name = "ProviderRequestError";
  }
}

export async function requestProviderAnswer(input: {
  provider: ResolvedLlmProvider;
  instructions: string;
  modelInput: string;
  maxOutputTokens: number;
  jsonSchema: Record<string, unknown>;
  signal: AbortSignal;
}): Promise<ProviderAnswer> {
  const { provider } = input;
  const init = provider.protocol === "openai-responses"
    ? openAiRequest(input)
    : provider.protocol === "anthropic-messages"
      ? anthropicRequest(input)
      : chatCompletionRequest(input);
  const response = await fetch(provider.endpoint, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: input.signal,
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderRequestError("http", response.status);
  }
  const payload = await readBoundedJson(response);
  if (provider.protocol === "openai-responses") return parseOpenAi(payload);
  if (provider.protocol === "anthropic-messages") return parseAnthropic(payload);
  return parseChatCompletion(payload);
}

function openAiRequest(input: Parameters<typeof requestProviderAnswer>[0]): RequestInit {
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.provider.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: input.provider.model,
      store: false,
      max_output_tokens: input.maxOutputTokens,
      instructions: input.instructions,
      input: input.modelInput,
      text: {
        format: {
          type: "json_schema",
          name: "fusiondigital_grounded_answer",
          strict: true,
          schema: input.jsonSchema,
        },
      },
    }),
  };
}

function anthropicRequest(input: Parameters<typeof requestProviderAnswer>[0]): RequestInit {
  return {
    method: "POST",
    headers: {
      "x-api-key": input.provider.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: input.provider.model,
      max_tokens: input.maxOutputTokens,
      system: input.instructions,
      messages: [{ role: "user", content: input.modelInput }],
    }),
  };
}

function chatCompletionRequest(input: Parameters<typeof requestProviderAnswer>[0]): RequestInit {
  const isKimi = input.provider.id === "kimi";
  return {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.provider.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model: input.provider.model,
      messages: [
        { role: "system", content: input.instructions },
        { role: "user", content: input.modelInput },
      ],
      stream: false,
      ...(isKimi
        ? { max_completion_tokens: input.maxOutputTokens }
        : { max_tokens: input.maxOutputTokens }),
    }),
  };
}

async function readBoundedJson(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) throw new ProviderRequestError("content-type");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderRequestError("oversized");
  }
  if (!response.body) throw new ProviderRequestError("empty");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROVIDER_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ProviderRequestError("oversized");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new ProviderRequestError("malformed");
  }
}

function parseOpenAi(payload: Record<string, unknown>): ProviderAnswer {
  const direct = typeof payload.output_text === "string" ? payload.output_text : "";
  const output = Array.isArray(payload.output) ? payload.output : [];
  const nested = output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as { content?: unknown }).content;
    return Array.isArray(content) ? content : [];
  }).flatMap((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "output_text"
    ? [String((item as { text?: unknown }).text ?? "")]
    : []);
  const outputText = (direct || nested.join("\n")).trim();
  if (!outputText) throw new ProviderRequestError("empty");
  const usage = record(payload.usage);
  return {
    outputText,
    inputTokens: tokenCount(usage.input_tokens),
    outputTokens: tokenCount(usage.output_tokens),
  };
}

function parseAnthropic(payload: Record<string, unknown>): ProviderAnswer {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const outputText = content.flatMap((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "text"
    ? [String((item as { text?: unknown }).text ?? "")]
    : []).join("\n").trim();
  if (!outputText) throw new ProviderRequestError("empty");
  const usage = record(payload.usage);
  return {
    outputText,
    inputTokens: tokenCount(usage.input_tokens),
    outputTokens: tokenCount(usage.output_tokens),
  };
}

function parseChatCompletion(payload: Record<string, unknown>): ProviderAnswer {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = choices[0] && typeof choices[0] === "object" ? choices[0] as Record<string, unknown> : {};
  const message = record(first.message);
  const outputText = typeof message.content === "string" ? message.content.trim() : "";
  if (!outputText) throw new ProviderRequestError("empty");
  const usage = record(payload.usage);
  return {
    outputText,
    inputTokens: tokenCount(usage.prompt_tokens),
    outputTokens: tokenCount(usage.completion_tokens),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function tokenCount(value: unknown) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}
