import type { ResolvedLlmProvider } from "./provider-registry";

const MAX_PROVIDER_RESPONSE_BYTES = 1_048_576;

export type ProviderUsage = { inputTokens: number; outputTokens: number };
export type ProviderAnswer = ProviderUsage & { outputText: string };
export type ProviderRequestErrorKind =
  | "request"
  | "network"
  | "timeout"
  | "aborted"
  | "http"
  | "content-type"
  | "oversized"
  | "malformed"
  | "empty"
  | "truncated"
  | "filtered"
  | "incomplete";

export class ProviderRequestError extends Error {
  constructor(readonly kind: ProviderRequestErrorKind, readonly status?: number) {
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
  let request: Request;
  try {
    const init = provider.protocol === "openai-responses"
      ? openAiRequest(input)
      : provider.protocol === "anthropic-messages"
        ? anthropicRequest(input)
        : chatCompletionRequest(input);
    request = new Request(provider.endpoint, {
      ...init,
      redirect: "error",
      signal: input.signal,
    });
  } catch {
    throw new ProviderRequestError("request");
  }

  let response: Response;
  try {
    response = await fetch(request);
  } catch {
    throw new ProviderRequestError(abortedRequestKind(input.signal));
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ProviderRequestError("http", response.status);
  }
  const payload = await readBoundedJson(response, input.signal);
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
  const isDeepSeek = input.provider.id === "deepseek";
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
      ...(isDeepSeek
        ? {
            response_format: { type: "json_object" },
            thinking: { type: "disabled" },
          }
        : {}),
      ...(isKimi
        ? { max_completion_tokens: input.maxOutputTokens }
        : { max_tokens: input.maxOutputTokens }),
    }),
  };
}

async function readBoundedJson(response: Response, signal: AbortSignal): Promise<Record<string, unknown>> {
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
  try {
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
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(abortedRequestKind(signal));
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
  const responseStatus = typeof payload.status === "string" ? payload.status : "";
  if (responseStatus === "incomplete") {
    const reason = String(record(payload.incomplete_details).reason ?? "");
    if (reason === "max_output_tokens") throw new ProviderRequestError("truncated");
    if (reason === "content_filter") throw new ProviderRequestError("filtered");
    throw new ProviderRequestError("incomplete");
  }
  if (responseStatus === "failed" || responseStatus === "cancelled") {
    throw new ProviderRequestError("incomplete");
  }
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
  const stopReason = typeof payload.stop_reason === "string" ? payload.stop_reason : "";
  if (stopReason === "max_tokens" || stopReason === "model_context_window_exceeded") {
    throw new ProviderRequestError("truncated");
  }
  if (stopReason === "refusal") throw new ProviderRequestError("filtered");
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
  const finishReason = typeof first.finish_reason === "string" ? first.finish_reason : "";
  if (finishReason === "length") throw new ProviderRequestError("truncated");
  if (finishReason === "content_filter") throw new ProviderRequestError("filtered");
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

function abortedRequestKind(signal: AbortSignal): "network" | "timeout" | "aborted" {
  if (!signal.aborted) return "network";
  const reason = signal.reason;
  return reason instanceof DOMException && reason.name === "TimeoutError" ? "timeout" : "aborted";
}
