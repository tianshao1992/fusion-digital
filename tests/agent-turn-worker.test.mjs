import assert from "node:assert/strict";
import test from "node:test";

async function loadBuiltWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("agent-turn-worker", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function parseSse(source) {
  return source
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/).find((line) => line.startsWith("data: ")))
    .filter(Boolean)
    .map((line) => JSON.parse(line.slice("data: ".length)));
}

test("built Vinext worker reconstructs Agent turns without cross-implementation Request cloning", async () => {
  const worker = await loadBuiltWorker();
  const response = await worker.fetch(
    new Request("http://localhost/api/agent/turns", {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
        origin: "http://localhost",
        "sec-fetch-site": "same-origin",
      },
      body: JSON.stringify({
        question: "请介绍 DINA",
        provider: "retrieval",
        conversationId: "built-worker-request-lifetime",
      }),
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream\b/);
  const events = parseSse(await response.text());
  assert.equal(events[0]?.event, "run.started");
  assert.equal(events.at(-1)?.event, "run.completed");
  assert.equal(events.some((event) => event.event === "run.failed"), false);
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));

  const deltas = events
    .filter((event) => event.event === "message.delta")
    .map((event) => event.delta)
    .join("");
  const completed = events.find((event) => event.event === "message.completed");
  assert.equal(completed?.message?.mode, "retrieval-only");
  assert.equal(completed?.message?.answer, deltas);
  assert.equal(completed?.message?.conversationId, "built-worker-request-lifetime");
  assert.ok(completed?.message?.citations?.length > 0);
});
