import {
  parseAnalyticsEventInput,
  shanghaiDate,
  type AnalyticsSource,
  type StoredAnalyticsEvent,
} from "./contracts";

const MAX_FORWARD_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;

export function storedAnalyticsEvent(
  value: unknown,
  source: AnalyticsSource,
  occurredAt = new Date(),
): StoredAnalyticsEvent {
  const event = parseAnalyticsEventInput(value);
  if (!Number.isFinite(occurredAt.getTime())) throw new TypeError("occurredAt is invalid");
  return {
    ...event,
    source,
    occurredAt: occurredAt.toISOString(),
    occurredDate: shanghaiDate(occurredAt),
  };
}

export function parseForwardedAnalyticsEvents(
  value: unknown,
  now = new Date(),
): StoredAnalyticsEvent[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Forwarded analytics payload must be an object");
  }
  const envelope = value as { schemaVersion?: unknown; events?: unknown };
  if (Object.keys(value as Record<string, unknown>).some((field) => field !== "schemaVersion" && field !== "events")) {
    throw new TypeError("Forwarded analytics payload contains an unsupported field");
  }
  if (envelope.schemaVersion !== 1 || !Array.isArray(envelope.events)) {
    throw new TypeError("Forwarded analytics payload has an unsupported schema");
  }
  if (envelope.events.length < 1 || envelope.events.length > 250) {
    throw new TypeError("Forwarded analytics batch size is invalid");
  }

  return envelope.events.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("Forwarded analytics event must be an object");
    }
    const { receivedAt: receivedAtValue, ...eventInput } = value as Record<string, unknown>;
    if (typeof receivedAtValue !== "string" || receivedAtValue.length > 64) {
      throw new TypeError("Forwarded analytics receivedAt is invalid");
    }
    const receivedAt = new Date(receivedAtValue);
    const age = now.getTime() - receivedAt.getTime();
    if (!Number.isFinite(age) || age > MAX_FORWARD_DELAY_MS || age < -MAX_FUTURE_SKEW_MS) {
      throw new TypeError("Forwarded analytics event is outside the accepted time window");
    }
    return storedAnalyticsEvent(eventInput, "club", receivedAt);
  });
}

export async function pseudonymizeAnalyticsEvents(
  events: readonly StoredAnalyticsEvent[],
  secret: string,
): Promise<StoredAnalyticsEvent[]> {
  if (secret.length < 32) throw new TypeError("Analytics pseudonymization secret is invalid");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = async (scope: "event" | "visitor" | "session", value: string) => {
    const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${scope}:${value}`)));
    let binary = "";
    for (const byte of signature.subarray(0, 18)) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
  };
  return Promise.all(events.map(async (event) => ({
    ...event,
    eventId: await digest("event", event.eventId),
    visitorId: await digest("visitor", event.visitorId),
    sessionId: await digest("session", event.sessionId),
  })));
}

export async function verifyAnalyticsSignature(input: {
  body: string;
  timestamp: string | null;
  signature: string | null;
  secret: string | undefined;
  now?: Date;
}): Promise<boolean> {
  const { body, timestamp, signature, secret, now = new Date() } = input;
  if (!secret || secret.length < 32 || !timestamp || !/^\d{10}$/u.test(timestamp)) return false;
  if (!signature || !/^[a-f0-9]{64}$/u.test(signature)) return false;
  const signedAt = Number(timestamp) * 1_000;
  if (!Number.isFinite(signedAt) || Math.abs(now.getTime() - signedAt) > 5 * 60 * 1_000) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    hexBytes(signature),
    encoder.encode(`${timestamp}.${body}`),
  );
}

function hexBytes(value: string): ArrayBuffer {
  const buffer = new ArrayBuffer(value.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return buffer;
}
