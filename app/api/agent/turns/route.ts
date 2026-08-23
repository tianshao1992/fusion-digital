import { POST as ask } from "@/app/api/ask/route";
import { readBoundedRequestBody } from "@/app/api/ask/request-body";
import type {
  AgentCompletedMessage,
  AgentRunFailedEvent,
  AgentStreamEvent,
} from "@/app/agent/contracts";
import {
  AGENT_STREAM_LIMITS,
  encodeAgentStreamEvent,
  isAgentCompletedMessage,
  splitVerifiedAnswer,
} from "@/app/agent/sse";

export const dynamic = "force-dynamic";

const VERIFIED_RESPONSE_LIMIT = 700_000;
const textEncoder = new TextEncoder();

export type AskExecutor = (request: Request) => Response | Promise<Response>;

export async function POST(request: Request): Promise<Response> {
  // Vinext may supply a Request implementation that cannot be passed to the
  // native Request constructor without violating its private brand checks.
  // Snapshot portable primitives before the asynchronous SSE pump begins.
  const snapshot = await snapshotAskRequest(request);
  return createAgentTurnResponseFromSnapshot(request.signal, Promise.resolve(snapshot), ask);
}

/**
 * Create the transport immediately and defer the grounded ask execution to the
 * stream pump. Tests can inject an executor to verify timing and cancellation
 * without changing the production `/api/ask` security boundary.
 */
export function createAgentTurnResponse(request: Request, executeAsk: AskExecutor): Response {
  // Tests and other direct callers still get an immediate Response, but body
  // consumption begins synchronously before that Response is returned.
  const snapshot = snapshotAskRequest(request);
  return createAgentTurnResponseFromSnapshot(request.signal, snapshot, executeAsk);
}

type AskRequestSnapshot = {
  url: string;
  method: string;
  headers: Headers;
  body: ArrayBuffer;
};

async function snapshotAskRequest(request: Request): Promise<AskRequestSnapshot> {
  const url = request.url;
  const method = request.method;
  const headers = new Headers(request.headers);
  const boundedBody = await readBoundedRequestBody(request);
  // Rebuild the internal request with a measured body. Hop-by-hop framing from
  // the public request must not survive the snapshot, and a rejected body is
  // represented as invalid JSON so `/api/ask` preserves its public error.
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  const body = boundedBody ?? new TextEncoder().encode("{").buffer;
  return { url, method, headers, body };
}

function createAgentTurnResponseFromSnapshot(
  requestSignal: AbortSignal,
  requestSnapshot: Promise<AskRequestSnapshot>,
  executeAsk: AskExecutor,
): Response {
  const runId = crypto.randomUUID();
  const started: AgentStreamEvent = {
    event: "run.started",
    runId,
    sequence: 1,
    delivery: "verified-delivery",
  };
  const askController = new AbortController();
  const abortFromRequest = () => askController.abort(requestSignal.reason);
  if (requestSignal.aborted) abortFromRequest();
  else requestSignal.addEventListener("abort", abortFromRequest, { once: true });

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // Establish the SSE run before beginning any potentially slow retrieval
      // or provider work. Answer bytes are still withheld until `/api/ask` has
      // completed its full grounding and citation checks.
      controller.enqueue(encodeAgentStreamEvent(started));
      queueMicrotask(() => void pumpVerifiedTurn({
        requestSnapshot,
        executeAsk,
        controller,
        askController,
        started,
        cleanup: () => requestSignal.removeEventListener("abort", abortFromRequest),
      }));
    },
    cancel(reason) {
      askController.abort(reason ?? new DOMException("Agent stream cancelled", "AbortError"));
      requestSignal.removeEventListener("abort", abortFromRequest);
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });
}

type PumpInput = {
  requestSnapshot: Promise<AskRequestSnapshot>;
  executeAsk: AskExecutor;
  controller: ReadableStreamDefaultController<Uint8Array>;
  askController: AbortController;
  started: AgentStreamEvent;
  cleanup: () => void;
};

async function pumpVerifiedTurn(input: PumpInput): Promise<void> {
  const { requestSnapshot, executeAsk, controller, askController, started, cleanup } = input;
  try {
    if (askController.signal.aborted) return;
    const snapshot = await requestSnapshot;
    if (askController.signal.aborted) return;
    const askRequest = new Request(snapshot.url, {
      method: snapshot.method,
      headers: snapshot.headers,
      body: snapshot.body.byteLength > 0 ? snapshot.body : undefined,
      signal: askController.signal,
    });
    const verifiedResponse = await executeAsk(askRequest);
    if (askController.signal.aborted) return;

    const raw = await verifiedResponse.text();
    if (askController.signal.aborted) return;
    if (textEncoder.encode(raw).byteLength > VERIFIED_RESPONSE_LIMIT) {
      enqueueEvent(controller, failed(started.runId, 2, "response_too_large", "The verified response exceeds the delivery limit."));
      return;
    }

    const payload = parseJson(raw);
    if (!isAgentCompletedMessage(payload)) {
      const publicError = readPublicError(payload);
      enqueueEvent(controller, failed(started.runId, 2, publicError.code, publicError.message));
      return;
    }

    const blocks = encodeVerifiedMessage(started.runId, payload);
    for (let index = 0; index < blocks.length; index += 1) {
      if (askController.signal.aborted) return;
      controller.enqueue(blocks[index]);
      // Yield between protocol events so the consumer can render or cancel
      // even when the complete verified answer is already available locally.
      if (index < blocks.length - 1) await nextEventLoopTurn();
    }
  } catch {
    if (!askController.signal.aborted) {
      try {
        enqueueEvent(controller, failed(started.runId, 2, "turn_failed", "The agent turn could not be completed."));
      } catch {
        // The consumer may have closed the stream between the abort check and
        // this enqueue. Cancellation is not converted into a public failure.
      }
    }
  } finally {
    cleanup();
    try {
      controller.close();
    } catch {
      // A cancelled response stream is already closed by the consumer.
    }
  }
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function encodeVerifiedMessage(runId: string, message: AgentCompletedMessage): Uint8Array[] {
  let sequence = 1;
  const events: AgentStreamEvent[] = [];
  for (const delta of splitVerifiedAnswer(message.answer)) {
    events.push({ event: "message.delta", runId, sequence: ++sequence, delta });
  }
  events.push({ event: "message.completed", runId, sequence: ++sequence, message });
  events.push({ event: "run.completed", runId, sequence: ++sequence, status: "completed" });

  const blocks = events.map(encodeAgentStreamEvent);
  const startedBytes = encodeAgentStreamEvent({
    event: "run.started",
    runId,
    sequence: 1,
    delivery: "verified-delivery",
  }).byteLength;
  const totalBytes = blocks.reduce((sum, block) => sum + block.byteLength, startedBytes);
  if (totalBytes > AGENT_STREAM_LIMITS.maxStreamBytes) {
    throw new Error("Agent stream exceeds the size limit");
  }
  return blocks;
}

function enqueueEvent(controller: ReadableStreamDefaultController<Uint8Array>, event: AgentStreamEvent) {
  controller.enqueue(encodeAgentStreamEvent(event));
}

function failed(runId: string, sequence: number, code: string, message: string): AgentRunFailedEvent {
  return {
    event: "run.failed",
    runId,
    sequence,
    error: {
      code: cleanPublicText(code, 80) || "turn_failed",
      message: cleanPublicText(message, 600) || "The agent turn could not be completed.",
    },
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readPublicError(value: unknown): { code: string; message: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { code: "invalid_response", message: "The agent turn returned an invalid response." };
  }
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return { code: "turn_failed", message: "The agent turn could not be completed." };
  }
  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : "turn_failed",
    message: typeof record.message === "string" ? record.message : "The agent turn could not be completed.",
  };
}

function cleanPublicText(value: string, limit: number) {
  return value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}
