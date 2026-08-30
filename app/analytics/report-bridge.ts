import { parseAnalyticsReport, type AnalyticsReport, type AnalyticsReportDays } from "./contracts";

export const ANALYTICS_REPORT_BRIDGE_PATH = "/__fusiondigital_analytics_report_v1";
export const ANALYTICS_REPORT_BRIDGE_URL = `https://fusiondigital.club${ANALYTICS_REPORT_BRIDGE_PATH}`;

const REQUEST_KEY_LABEL = "fusiondigital.analytics.report.request-key.v1";
const RESPONSE_KEY_LABEL = "fusiondigital.analytics.report.response-key.v1";
const REQUEST_CONTEXT = "fusiondigital.analytics.report.request.v1";
const RESPONSE_CONTEXT = "fusiondigital.analytics.report.response.v1";
const MAX_RESPONSE_BYTES = 256 * 1024;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43,128}$/u;
const SIGNATURE_PATTERN = /^[a-f0-9]{64}$/u;
const TIMESTAMP_PATTERN = /^\d{10}$/u;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/u;

export class AnalyticsReportBridgeError extends Error {
  constructor(
    readonly stage:
      | "secret"
      | "nonce"
      | "fetch"
      | "fetch-timeout"
      | "response"
      | "response-body"
      | "response-signature"
      | "response-payload"
      | "unknown" = "unknown",
    message = "Analytics report service is unavailable",
  ) {
    super(message);
    this.name = "AnalyticsReportBridgeError";
  }
}

export async function fetchClubAnalyticsReport(
  days: AnalyticsReportDays,
  secret: string | undefined,
  options: {
    fetcher?: typeof fetch;
    now?: Date;
    nonce?: string;
  } = {},
): Promise<AnalyticsReport> {
  if (!secret || !SECRET_PATTERN.test(secret)) throw new AnalyticsReportBridgeError("secret");
  const now = options.now ?? new Date();
  const timestamp = String(Math.floor(now.getTime() / 1_000));
  const nonce = options.nonce ?? randomNonce();
  if (!NONCE_PATTERN.test(nonce)) throw new AnalyticsReportBridgeError("nonce");
  const body = JSON.stringify({ schemaVersion: 1, days });
  const signature = await reportSignature({ kind: "request", body, timestamp, nonce, secret, status: 0 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(ANALYTICS_REPORT_BRIDGE_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-fd-analytics-report-nonce": nonce,
        "x-fd-analytics-report-signature": signature,
        "x-fd-analytics-report-timestamp": timestamp,
      },
      body,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch {
    throw new AnalyticsReportBridgeError(controller.signal.aborted ? "fetch-timeout" : "fetch");
  } finally {
    clearTimeout(timeout);
  }
  const responseTimestamp = response.headers.get("x-fd-analytics-report-timestamp");
  const responseSignature = response.headers.get("x-fd-analytics-report-signature");
  const contentLengthHeader = response.headers.get("content-length");
  if (response.status !== 200
    || !response.headers.get("content-type")?.toLowerCase().startsWith("application/json")
    || (contentLengthHeader !== null
      && (!/^\d+$/u.test(contentLengthHeader) || Number(contentLengthHeader) > MAX_RESPONSE_BYTES))) {
    throw new AnalyticsReportBridgeError("response");
  }
  const responseBody = await readBoundedResponseBody(response);
  if (!responseTimestamp
    || !responseSignature
    || Math.abs(Math.floor(now.getTime() / 1_000) - Number(responseTimestamp)) > 300
    || !await verifyReportSignature({
      kind: "response",
      body: responseBody,
      timestamp: responseTimestamp,
      nonce,
      signature: responseSignature,
      secret,
      status: response.status,
    })) {
    throw new AnalyticsReportBridgeError("response-signature");
  }
  try {
    const envelope = JSON.parse(responseBody) as { schemaVersion?: unknown; report?: unknown };
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)
      || Object.keys(envelope).length !== 2 || envelope.schemaVersion !== 1) {
      throw new TypeError("invalid analytics report envelope");
    }
    return parseAnalyticsReport(envelope.report);
  } catch {
    throw new AnalyticsReportBridgeError("response-payload");
  }
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  if (!response.body) throw new AnalyticsReportBridgeError("response-body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new AnalyticsReportBridgeError("response-body");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AnalyticsReportBridgeError) throw error;
    throw new AnalyticsReportBridgeError("response-body");
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw new AnalyticsReportBridgeError("response-body");
  }
}

export async function verifyReportSignature(input: {
  kind: "request" | "response";
  body: string;
  timestamp: string;
  nonce: string;
  signature: string;
  secret: string;
  status: number;
}): Promise<boolean> {
  if (!TIMESTAMP_PATTERN.test(input.timestamp)
    || !NONCE_PATTERN.test(input.nonce)
    || !SIGNATURE_PATTERN.test(input.signature)
    || !SECRET_PATTERN.test(input.secret)) return false;
  const encoder = new TextEncoder();
  const key = await derivedReportKey(
    input.secret,
    input.kind === "request" ? REQUEST_KEY_LABEL : RESPONSE_KEY_LABEL,
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    hexBytes(input.signature),
    encoder.encode(await reportMessage(input)),
  );
}

export async function reportSignature(input: {
  kind: "request" | "response";
  body: string;
  timestamp: string;
  nonce: string;
  secret: string;
  status: number;
}): Promise<string> {
  if (!SECRET_PATTERN.test(input.secret)) throw new AnalyticsReportBridgeError();
  const label = input.kind === "request" ? REQUEST_KEY_LABEL : RESPONSE_KEY_LABEL;
  const derivedKey = await derivedReportKey(input.secret, label);
  return hex(await crypto.subtle.sign(
    "HMAC",
    derivedKey,
    new TextEncoder().encode(await reportMessage(input)),
  ));
}

async function derivedReportKey(secret: string, label: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const derivedBytes = await crypto.subtle.sign("HMAC", baseKey, encoder.encode(label));
  return crypto.subtle.importKey(
    "raw", derivedBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

async function reportMessage(input: {
  kind: "request" | "response";
  body: string;
  timestamp: string;
  nonce: string;
  status: number;
}): Promise<string> {
  const bodyDigest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.body)));
  const prefix = input.kind === "request"
    ? `${REQUEST_CONTEXT}\nPOST\n${ANALYTICS_REPORT_BRIDGE_PATH}`
    : `${RESPONSE_CONTEXT}\n${input.status}`;
  return `${prefix}\n${input.timestamp}\n${input.nonce}\n${bodyDigest}`;
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexBytes(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
