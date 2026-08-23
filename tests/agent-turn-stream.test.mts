import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AGENT_CANVAS_LIMITS, type AgentStreamEvent } from "../app/agent/contracts.ts";
import {
  AGENT_STREAM_LIMITS,
  AgentEventStreamParser,
  AgentStreamProtocolError,
  encodeAgentStreamEvent,
} from "../app/agent/sse.ts";

const sameOriginHeaders = {
  "content-type": "application/json",
  accept: "text/event-stream",
  origin: "http://localhost",
  "sec-fetch-site": "same-origin",
};

test("verified retrieval is delivered as ordered SSE without an upstream call", async () => {
  const previousMode = process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;
  process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE = "public-anonymous";
  globalThis.fetch = async () => { upstreamCalled = true; throw new Error("must not call upstream"); };
  try {
    const { POST } = await import("../app/api/agent/turns/route.ts");
    const response = await POST(new Request("http://localhost/api/agent/turns", {
      method: "POST",
      headers: sameOriginHeaders,
      body: JSON.stringify({ question: "请介绍 DINA", provider: "deepseek", conversationId: "conversation-stream-20260823" }),
    }));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
    assert.equal(response.headers.get("cache-control"), "no-store, no-transform");
    assert.equal(response.headers.get("x-accel-buffering"), "no");

    const events = parseFragmented(await response.text(), 7);
    assert.equal(events[0].event, "run.started");
    assert.equal(events[0].sequence, 1);
    assert.equal(events.at(-1)?.event, "run.completed");
    assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
    assert.ok(events.some((event) => event.event === "message.delta"));

    const deltas = events.flatMap((event) => event.event === "message.delta" ? [event.delta] : []).join("");
    const completed = events.find((event) => event.event === "message.completed");
    assert.ok(completed && completed.event === "message.completed");
    assert.equal(completed.message.mode, "retrieval-only");
    assert.equal(completed.message.answer, deltas);
    assert.equal(completed.message.conversationId, "conversation-stream-20260823");
    assert.ok(completed.message.citations.length > 0);
    assert.equal(upstreamCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
    else process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE = previousMode;
  }
});

test("run.started is readable before the deferred grounded ask resolves", async () => {
  const { createAgentTurnResponse } = await import("../app/api/agent/turns/route.ts");
  const askResult = deferred<Response>();
  const executorStarted = deferred<void>();
  const response = createAgentTurnResponse(new Request("http://localhost/api/agent/turns", {
    method: "POST",
    headers: sameOriginHeaders,
    body: JSON.stringify({ question: "deferred verified answer" }),
  }), () => {
    executorStarted.resolve();
    return askResult.promise;
  });

  assert.ok(response instanceof Response);
  const reader = response.body!.getReader();
  const parser = new AgentEventStreamParser();
  const decoder = new TextDecoder();
  const firstChunk = await reader.read();
  assert.equal(firstChunk.done, false);
  const firstEvents = parser.push(decoder.decode(firstChunk.value, { stream: true }));
  assert.deepEqual(firstEvents.map((event) => event.event), ["run.started"]);
  assert.equal(askResult.settled, false);
  await executorStarted.promise;
  assert.equal(askResult.settled, false);

  askResult.resolve(jsonAskResponse("The grounded answer is now verified."));
  const remaining: AgentStreamEvent[] = [];
  const firstVerifiedChunk = await reader.read();
  assert.equal(firstVerifiedChunk.done, false);
  const firstVerifiedEvents = parser.push(decoder.decode(firstVerifiedChunk.value, { stream: true }));
  assert.deepEqual(firstVerifiedEvents.map((event) => event.event), ["message.delta"]);
  assert.equal(firstVerifiedEvents.some((event) => event.event === "message.completed"), false);
  remaining.push(...firstVerifiedEvents);
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    remaining.push(...parser.push(decoder.decode(chunk.value, { stream: true })));
  }
  remaining.push(...parser.push(decoder.decode()));
  parser.finish();
  assert.ok(remaining.some((event) => event.event === "message.delta"));
  assert.equal(remaining.at(-1)?.event, "run.completed");
});

test("cancelling the SSE reader aborts the injected ask request", async () => {
  const { createAgentTurnResponse } = await import("../app/api/agent/turns/route.ts");
  const executorStarted = deferred<AbortSignal>();
  const response = createAgentTurnResponse(new Request("http://localhost/api/agent/turns", {
    method: "POST",
    headers: sameOriginHeaders,
    body: JSON.stringify({ question: "cancel this turn" }),
  }), (forwardedRequest) => {
    executorStarted.resolve(forwardedRequest.signal);
    return new Promise<Response>((_resolve, reject) => {
      forwardedRequest.signal.addEventListener("abort", () => reject(forwardedRequest.signal.reason), { once: true });
    });
  });

  const reader = response.body!.getReader();
  const firstChunk = await reader.read();
  assert.equal(firstChunk.done, false);
  assert.match(new TextDecoder().decode(firstChunk.value), /event: run\.started/);
  const askSignal = await executorStarted.promise;
  assert.equal(askSignal.aborted, false);
  await reader.cancel(new DOMException("Test cancellation", "AbortError"));
  assert.equal(askSignal.aborted, true);
});

test("request rejection becomes a bounded run.failed event", async () => {
  const { POST } = await import("../app/api/agent/turns/route.ts");
  const response = await POST(new Request("http://localhost/api/agent/turns", {
    method: "POST",
    headers: { ...sameOriginHeaders, origin: "https://attacker.invalid", "sec-fetch-site": "cross-site" },
    body: JSON.stringify({ question: "请介绍 DINA", provider: "retrieval" }),
  }));
  const events = parseFragmented(await response.text(), 13);
  assert.deepEqual(events.map((event) => event.event), ["run.started", "run.failed"]);
  const failed = events[1];
  assert.ok(failed.event === "run.failed");
  assert.equal(failed.error.code, "forbidden");
  assert.doesNotMatch(JSON.stringify(failed), /stack|api[_-]?key|authorization/i);
});

test("oversized request bodies fail before delivery and the parser enforces finite input", async () => {
  const { POST } = await import("../app/api/agent/turns/route.ts");
  const response = await POST(new Request("http://localhost/api/agent/turns", {
    method: "POST",
    headers: sameOriginHeaders,
    body: JSON.stringify({ question: "DINA", padding: "x".repeat(49_000) }),
  }));
  const events = parseFragmented(await response.text(), 31);
  assert.deepEqual(events.map((event) => event.event), ["run.started", "run.failed"]);
  assert.ok(events[1].event === "run.failed" && events[1].error.code === "invalid_json");

  const parser = new AgentEventStreamParser();
  assert.throws(
    () => parser.push("x".repeat(AGENT_STREAM_LIMITS.maxStreamBytes + 1)),
    AgentStreamProtocolError,
  );
});

test("a streamed request without Content-Length is cancelled at the shared body limit", async () => {
  const { POST } = await import("../app/api/agent/turns/route.ts");
  let cancelled = false;
  const oversizedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"question":"DINA","padding":"'));
      controller.enqueue(new Uint8Array(48_001).fill(0x78));
    },
    cancel() {
      cancelled = true;
    },
  });
  const response = await POST(new Request("http://localhost/api/agent/turns", {
    method: "POST",
    headers: sameOriginHeaders,
    body: oversizedBody,
    duplex: "half",
  } as RequestInit & { duplex: "half" }));

  const events = parseFragmented(await response.text(), 17);
  assert.deepEqual(events.map((event) => event.event), ["run.started", "run.failed"]);
  assert.ok(events[1].event === "run.failed" && events[1].error.code === "invalid_json");
  assert.equal(cancelled, true);
});

test("event encoding preserves unicode and rejects invalid ordering", () => {
  const runId = "run-unicode";
  const blocks = [
    encodeAgentStreamEvent({ event: "run.started", runId, sequence: 1, delivery: "verified-delivery" }),
    encodeAgentStreamEvent({ event: "message.delta", runId, sequence: 2, delta: "聚变 plasma 🔥" }),
    encodeAgentStreamEvent({ event: "run.failed", runId, sequence: 3, error: { code: "test", message: "测试终止" } }),
  ];
  const events = parseFragmented(new TextDecoder().decode(concat(blocks)), 2);
  assert.ok(events[1].event === "message.delta" && events[1].delta === "聚变 plasma 🔥");

  const invalid = new TextDecoder().decode(encodeAgentStreamEvent({
    event: "message.delta",
    runId,
    sequence: 2,
    delta: "out of order",
  }));
  const parser = new AgentEventStreamParser();
  assert.throws(() => parser.push(invalid), AgentStreamProtocolError);
});

test("the parser rejects a completed answer that differs from accumulated deltas", () => {
  const runId = "run-integrity";
  const encoded = concat([
    encodeAgentStreamEvent({ event: "run.started", runId, sequence: 1, delivery: "verified-delivery" }),
    encodeAgentStreamEvent({ event: "message.delta", runId, sequence: 2, delta: "trusted prefix" }),
    encodeAgentStreamEvent({
      event: "message.completed",
      runId,
      sequence: 3,
      message: {
        mode: "assistant-direct",
        answer: "different final answer",
        citations: [],
        results: [],
      },
    }),
  ]);
  const parser = new AgentEventStreamParser();
  assert.throws(
    () => parser.push(new TextDecoder().decode(encoded)),
    /deltas do not match the completed answer/,
  );
});

test("the verified stream accepts bounded assistant-chat canvas artifacts and rejects oversized ones", () => {
  const runId = "run-assistant-canvas";
  const valid = concat([
    encodeAgentStreamEvent({ event: "run.started", runId, sequence: 1, delivery: "verified-delivery" }),
    encodeAgentStreamEvent({ event: "message.delta", runId, sequence: 2, delta: "对话答复" }),
    encodeAgentStreamEvent({
      event: "message.completed",
      runId,
      sequence: 3,
      message: {
        mode: "assistant-chat",
        answer: "对话答复",
        citations: [],
        results: [],
        canvas: { kind: "markdown", title: "步骤", content: "1. 第一步" },
      },
    }),
    encodeAgentStreamEvent({ event: "run.completed", runId, sequence: 4, status: "completed" }),
  ]);
  const parser = new AgentEventStreamParser();
  const events = parser.push(new TextDecoder().decode(valid));
  parser.finish();
  assert.equal(events[2]?.event, "message.completed");

  const invalidParser = new AgentEventStreamParser();
  const invalid = concat([
    encodeAgentStreamEvent({ event: "run.started", runId, sequence: 1, delivery: "verified-delivery" }),
    encodeAgentStreamEvent({ event: "message.delta", runId, sequence: 2, delta: "对话答复" }),
    encodeAgentStreamEvent({
      event: "message.completed",
      runId,
      sequence: 3,
      message: {
        mode: "assistant-chat",
        answer: "对话答复",
        citations: [],
        results: [],
        canvas: { kind: "markdown", title: "步骤", content: "x".repeat(AGENT_CANVAS_LIMITS.maxContentCharacters + 1) },
      },
    }),
  ]);
  assert.throws(() => invalidParser.push(new TextDecoder().decode(invalid)), AgentStreamProtocolError);
});

test("KnowledgeChat consumes only the bounded verified-delivery stream", () => {
  const source = readFileSync(new URL("../app/components/knowledge-chat/KnowledgeChat.tsx", import.meta.url), "utf8");
  assert.match(source, /fetch\('\/api\/agent\/turns'/);
  assert.match(source, /Accept: 'text\/event-stream'/);
  assert.match(source, /new AgentEventStreamParser\(\)/);
  assert.match(source, /new TextDecoder\(\)/);
  assert.match(source, /parser\.finish\(\)/);
  assert.match(source, /event\.event === 'message\.completed'/);
  assert.doesNotMatch(source, /fetch\('\/api\/ask'/);
});

function parseFragmented(source: string, width: number): AgentStreamEvent[] {
  const parser = new AgentEventStreamParser();
  const events: AgentStreamEvent[] = [];
  for (let index = 0; index < source.length; index += width) {
    events.push(...parser.push(source.slice(index, index + width)));
  }
  parser.finish();
  return events;
}

function concat(values: Uint8Array[]): Uint8Array {
  const total = values.reduce((sum, value) => sum + value.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.byteLength;
  }
  return result;
}

function jsonAskResponse(answer: string): Response {
  return new Response(JSON.stringify({
    mode: "assistant-direct",
    answer,
    citations: [],
    results: [],
    conversationId: "conversation-deferred-20260823",
  }), { headers: { "Content-Type": "application/json" } });
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const state = {
    settled: false,
    promise: new Promise<T>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    }),
    resolve(value: T) {
      state.settled = true;
      resolvePromise(value);
    },
    reject(reason?: unknown) {
      state.settled = true;
      rejectPromise(reason);
    },
  };
  return state;
}
