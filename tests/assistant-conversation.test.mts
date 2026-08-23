import assert from "node:assert/strict";
import test from "node:test";
import type { Principal } from "../db/accounts.ts";
import {
  assistantAnswerSchema,
  parseAssistantOutput,
  validateAssistantOutput,
} from "../app/api/ask/conversation-output.ts";
import { ASK_MODEL_BUDGETS, createAskHandler, type AskRuntime } from "../app/api/ask/route.ts";
import type { ResolvedLlmProvider } from "../app/api/ask/provider-registry.ts";
import { chooseAutomaticDefaultProvider, type UserPublicLlmProvider } from "../app/api/ask/user-provider.ts";

const principal = {
  user: { id: "usr_conversation_test", status: "active" },
  roles: ["member"],
} as unknown as Principal;

const provider: ResolvedLlmProvider = {
  id: "deepseek",
  label: "DeepSeek",
  model: "deepseek-v4-flash",
  available: true,
  configured: true,
  source: "platform",
  protocol: "chat-completions",
  endpoint: "https://api.deepseek.com/chat/completions",
  apiKey: "test-provider-key",
};

const access = {
  authenticated: true,
  userId: principal.user.id,
  requestId: "ask_conversation_test",
  quotaPolicy: "database-ledger-v1" as const,
  reserved: true,
};

function askRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/ask", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

function modelRuntime(outputText: string, capture: { request?: Parameters<AskRuntime["requestProvider"]>[0]; settled?: string } = {}) {
  return {
    publicAnonymous: () => false,
    principal: (async () => principal) as AskRuntime["principal"],
    resolveProvider: (async () => ({ status: "selected", provider })) as AskRuntime["resolveProvider"],
    authorize: (async () => access) as AskRuntime["authorize"],
    settle: (async (_access, input) => { capture.settled = input.status; }) as AskRuntime["settle"],
    requestProvider: (async (input) => {
      capture.request = input;
      return { outputText, inputTokens: 21, outputTokens: 13 };
    }) as AskRuntime["requestProvider"],
  } satisfies Partial<AskRuntime>;
}

test("authenticated Sites turns call the model without retrieval hits and preserve native dialogue roles", async () => {
  const capture: { request?: Parameters<AskRuntime["requestProvider"]>[0]; settled?: string } = {};
  const handler = createAskHandler(modelRuntime(JSON.stringify({
    claims: [{ text: "欢迎来到 FusionDigital，我们可以继续一起完善这段文案。", citationRefs: [] }],
    caveats: [],
    canvas: null,
  }), capture));
  const response = await handler(askRequest({
    question: "帮我写一段欢迎语\n保留两行结构",
    history: [
      { role: "user", content: "我叫小刘\n正在开发聚变网站" },
      { role: "assistant", content: "你好，小刘。\n我们继续。" },
    ],
    conversationId: "conversation-native-roles",
  }));
  const payload = await response.json() as Record<string, unknown>;

  assert.equal(payload.mode, "assistant-chat");
  assert.deepEqual(payload.citations, []);
  assert.deepEqual(payload.results, []);
  assert.equal(payload.canvas, null);
  assert.equal(payload.provider, "deepseek");
  assert.match(String(payload.notice), /未由 FusionDigital 策展知识索引核验/);
  assert.ok(Array.isArray(payload.caveats));
  assert.match(String((payload.caveats as string[]).at(-1)), /事实性陈述视为待验证内容/);
  assert.equal(capture.settled, "succeeded");
  assert.deepEqual(capture.request?.messages?.map(({ role }) => role), ["user", "assistant", "user"]);
  assert.match(capture.request?.messages?.[0].content ?? "", /小刘\n正在开发/);
  assert.match(capture.request?.messages?.at(-1)?.content ?? "", /欢迎语\n保留两行结构/);
  assert.match(capture.request?.instructions ?? "", /deepseek-v4-flash/);
  const schema = capture.request?.jsonSchema as { properties?: { claims?: { items?: { properties?: { citationRefs?: { minItems?: number } } } } } };
  assert.equal(schema.properties?.claims?.items?.properties?.citationRefs?.minItems, 0);
});

test("assistant model identity bypasses lexical FusionMAE retrieval and uses trusted runtime metadata", async () => {
  const capture: { request?: Parameters<AskRuntime["requestProvider"]>[0] } = {};
  const handler = createAskHandler(modelRuntime(JSON.stringify({
    claims: [{ text: "本轮由 OpenAI 的 gpt-invented 生成，底层一定是另一个未披露模型。", citationRefs: [] }],
    caveats: ["以上供应商自述无需服务器复核。"],
    canvas: { kind: "markdown", title: "错误模型身份", content: "OpenAI gpt-invented" },
  }), capture));
  const response = await handler(askRequest({ question: "你的基础模型是什么", conversationId: "conversation-model-status" }));
  const payload = await response.json() as Record<string, unknown>;

  assert.equal(payload.mode, "assistant-chat");
  assert.deepEqual(payload.citations, []);
  assert.deepEqual(payload.results, []);
  assert.match(String(payload.answer), /DeepSeek（deepseek）.*deepseek-v4-flash/);
  assert.doesNotMatch(String(payload.answer), /OpenAI|gpt-invented/);
  assert.equal(payload.canvas, null);
  assert.match(String(payload.notice), /未由 FusionDigital 策展知识索引核验/);
  assert.doesNotMatch(capture.request?.messages?.at(-1)?.content ?? "", /FusionMAE/);
  assert.match(capture.request?.instructions ?? "", /DeepSeek.*deepseek-v4-flash/);
});

test("no-evidence factual output cannot suppress the server-owned verification warning", async () => {
  const handler = createAskHandler(modelRuntime(JSON.stringify({
    claims: [{ text: "ITER 昨天已经产生 999 GW 聚变电力。", citationRefs: [] }],
    caveats: ["已核验一", "已核验二", "已核验三", "已核验四", "已核验五"],
    canvas: null,
  })));
  const response = await handler(askRequest({
    question: "qzxvplmokn zzzqqq 请直接回应",
    conversationId: "conversation-malicious-unsupported-fact",
  }));
  const payload = await response.json() as Record<string, unknown>;

  assert.equal(payload.mode, "assistant-chat");
  assert.deepEqual(payload.citations, []);
  assert.deepEqual(payload.results, []);
  assert.match(String(payload.answer), /999 GW/);
  assert.match(String(payload.notice), /未由 FusionDigital 策展知识索引核验/);
  assert.equal((payload.caveats as string[]).length, 5);
  assert.match(String((payload.caveats as string[]).at(-1)), /事实性陈述视为待验证内容/);
});

test("CJK-heavy grounded multi-turn requests stay below the model quota and retain a recent contiguous suffix", async () => {
  const capture: {
    request?: Parameters<AskRuntime["requestProvider"]>[0];
    authorize?: Parameters<AskRuntime["authorize"]>[0];
  } = {};
  const history = Array.from({ length: 5 }, (_, index) => [
    { role: "user", content: `第 ${index + 1} 轮问题\n${"问".repeat(380)}` },
    { role: "assistant", content: `第 ${index + 1} 轮回答\n${"答".repeat(1_800)}` },
  ]).flat();
  const handler = createAskHandler({
    ...modelRuntime(JSON.stringify({
      claims: [{ text: "DINA 的控制应用在本轮站内证据中有记录。", citationRefs: ["S1"] }],
      caveats: [],
      canvas: null,
    }), capture),
    authorize: (async (input) => {
      capture.authorize = input;
      return access;
    }) as AskRuntime["authorize"],
  });
  const response = await handler(askRequest({
    question: `请介绍 DINA 的控制应用并说明证据。\n${"核".repeat(560)}`,
    history,
    context: {
      path: "/fusion-data",
      title: "聚变数据工作台" + "页".repeat(140),
      focusLabel: "DINA 控制模型" + "项".repeat(220),
      focusDescription: "当前页面聚焦控制证据。" + "述".repeat(560),
    },
    conversationId: "conversation-cjk-budget-boundary",
  }));
  const payload = await response.json() as Record<string, unknown>;

  assert.equal(payload.mode, "assistant-chat");
  assert.ok(capture.authorize);
  assert.ok((capture.authorize?.requestedTokens ?? Infinity) <= ASK_MODEL_BUDGETS.maxRequestedTokens);
  assert.ok((capture.authorize?.requestedTokens ?? Infinity) < 32_000);
  assert.equal(capture.request?.messages?.length, 5);
  assert.match(capture.request?.messages?.[0]?.content ?? "", /第 4 轮问题/);
  assert.match(capture.request?.messages?.[1]?.content ?? "", /第 4 轮回答/);
  assert.match(capture.request?.messages?.[2]?.content ?? "", /第 5 轮问题/);
  assert.match(capture.request?.messages?.[3]?.content ?? "", /第 5 轮回答/);
  assert.doesNotMatch(capture.request?.messages?.slice(0, -1).map(({ content }) => content).join("\n"), /第 3 轮/);
  assert.equal(capture.request?.messages?.at(-1)?.role, "user");
  assert.match(capture.request?.messages?.at(-1)?.content ?? "", /DINA/);
  assert.ok((capture.authorize?.historyTurns ?? 0) >= 2);
});

test("grounded assistant chat validates every claim and a source-preserving markdown canvas", async () => {
  const capture: { request?: Parameters<AskRuntime["requestProvider"]>[0]; settled?: string } = {};
  const handler = createAskHandler(modelRuntime(JSON.stringify({
    claims: [
      { text: "DINA 是面向托卡马克放电与控制研究的非线性自由边界代码。", citationRefs: ["S1"] },
      { text: "本站证据还覆盖其在 ITER 控制设计中的应用。", citationRefs: ["S2"] },
    ],
    caveats: [],
    canvas: {
      kind: "markdown",
      title: "DINA 证据摘要",
      content: "# DINA 证据摘要\n\n- 非线性自由边界建模 [S1]\n- ITER 控制设计应用 [S2]",
    },
  }), capture));
  const response = await handler(askRequest({ question: "请介绍 DINA 并整理为摘要", conversationId: "conversation-grounded-canvas" }));
  const payload = await response.json() as Record<string, unknown>;

  assert.equal(payload.mode, "assistant-chat");
  assert.ok(Array.isArray(payload.citations) && payload.citations.length >= 2);
  assert.equal((payload.canvas as { kind?: string })?.kind, "markdown");
  assert.match(String(payload.answer), /\[S1\]/);
  assert.equal(capture.settled, "succeeded");
  assert.match(capture.request?.messages?.at(-1)?.content ?? "", /Evidence level|证据等级/);
  const schema = capture.request?.jsonSchema as { properties?: { claims?: { items?: { properties?: { citationRefs?: { minItems?: number } } } } } };
  assert.equal(schema.properties?.claims?.items?.properties?.citationRefs?.minItems, 1);
});

test("invalid or missing grounded citations reject the model output and never deliver its canvas", async () => {
  for (const output of [
    {
      claims: [{ text: "无引用事实", citationRefs: [] }],
      caveats: [],
      canvas: null,
    },
    {
      claims: [{ text: "有引用事实", citationRefs: ["S1"] }],
      caveats: [],
      canvas: { kind: "markdown", title: "不安全 Canvas", content: "- 没有逐行保留来源" },
    },
  ]) {
    const capture: { settled?: string } = {};
    const handler = createAskHandler(modelRuntime(JSON.stringify(output), capture));
    const response = await handler(askRequest({ question: "请介绍 DINA", conversationId: "conversation-invalid-grounding" }));
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(payload.mode, "retrieval-only");
    assert.equal(payload.canvas, null);
    assert.equal(capture.settled, "failed");
  }
});

test("anonymous or unreserved requests fail closed before any model call", async () => {
  let providerCalls = 0;
  const handler = createAskHandler({
    ...modelRuntime("unused"),
    principal: (async () => null) as AskRuntime["principal"],
    authorize: (async () => ({ ...access, authenticated: false, reserved: false, userId: null })) as AskRuntime["authorize"],
    requestProvider: (async () => {
      providerCalls += 1;
      throw new Error("must not call provider");
    }) as AskRuntime["requestProvider"],
  });
  const response = await handler(askRequest({ question: "请介绍 DINA", conversationId: "conversation-unreserved" }));
  const payload = await response.json() as Record<string, unknown>;
  assert.equal(payload.mode, "retrieval-only");
  assert.equal(providerCalls, 0);
});

test("public-anonymous and explicit retrieval modes bypass identity, quota, and model execution", async () => {
  for (const body of [
    { question: "请介绍 DINA" },
    { question: "请介绍 DINA", provider: "retrieval" },
  ]) {
    let privilegedCalls = 0;
    const handler = createAskHandler({
      publicAnonymous: () => body.provider !== "retrieval",
      principal: (async () => { privilegedCalls += 1; throw new Error("must not resolve identity"); }) as AskRuntime["principal"],
      resolveProvider: (async () => { privilegedCalls += 1; throw new Error("must not resolve provider"); }) as AskRuntime["resolveProvider"],
      authorize: (async () => { privilegedCalls += 1; throw new Error("must not reserve quota"); }) as AskRuntime["authorize"],
      requestProvider: (async () => { privilegedCalls += 1; throw new Error("must not call model"); }) as AskRuntime["requestProvider"],
    });
    const response = await handler(askRequest(body));
    const payload = await response.json() as Record<string, unknown>;
    assert.equal(payload.mode, "retrieval-only");
    assert.equal(privilegedCalls, 0);
  }
});

test("assistant output schema and parser enforce nullable bounded canvas and per-claim grounding", () => {
  const groundedSchema = assistantAnswerSchema(3, true) as { properties: { claims: { items: { properties: { citationRefs: { minItems: number } } } } } };
  const conversationalSchema = assistantAnswerSchema(0, false) as typeof groundedSchema;
  assert.equal(groundedSchema.properties.claims.items.properties.citationRefs.minItems, 1);
  assert.equal(conversationalSchema.properties.claims.items.properties.citationRefs.minItems, 0);

  const parsed = parseAssistantOutput(JSON.stringify({
    claims: [{ text: "对话答复", citationRefs: [] }], caveats: [], canvas: null,
  }));
  assert.ok(parsed);
  assert.deepEqual(validateAssistantOutput(parsed, new Set(), false), { valid: true, usedRefs: [] });
  assert.equal(parseAssistantOutput(JSON.stringify({
    claims: [{ text: "答复", citationRefs: [] }], caveats: [],
    canvas: { kind: "markdown", title: "x", content: "x".repeat(8_001) },
  })), null);
});

test("automatic provider selection prefers usable personal credentials without overriding explicit retrieval", () => {
  const providers: UserPublicLlmProvider[] = [
    { id: "openai", label: "OpenAI", model: "gpt-test", available: true, configured: true, source: "platform", keyHint: null, region: null, updatedAt: null },
    { id: "deepseek", label: "DeepSeek", model: "deepseek-test", available: true, configured: true, source: "personal", keyHint: "...1234", region: "cn", updatedAt: "2026-08-23T00:00:00.000Z" },
  ];
  assert.equal(chooseAutomaticDefaultProvider(providers, null, "openai"), "deepseek");
  assert.equal(chooseAutomaticDefaultProvider(providers, "retrieval", "openai"), "retrieval");
  assert.equal(chooseAutomaticDefaultProvider(providers, "openai", "deepseek"), "openai");
});
