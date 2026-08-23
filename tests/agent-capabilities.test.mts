import assert from "node:assert/strict";
import test from "node:test";
import {
  SITES_WORKSPACE_ORIGIN,
  buildAgentCapabilities,
} from "../app/agent/capabilities.ts";

test("standalone public profile is honest about identity and model boundaries", () => {
  const capabilities = buildAgentCapabilities(true);
  assert.equal(capabilities.profile, "standalone-public");
  assert.equal(capabilities.authentication.available, false);
  assert.equal(capabilities.authentication.signInPath, null);
  assert.equal(capabilities.authentication.authenticatedWorkspaceOrigin, SITES_WORKSPACE_ORIGIN);
  assert.equal(capabilities.tools.modelGateway, false);
  assert.equal(capabilities.tools.siteSearch, true);
  assert.equal(capabilities.tools.imageInput, false);
  assert.equal(capabilities.tools.fileInput, false);
  assert.equal(capabilities.tools.externalUrlReader, false);
});

test("Sites profile exposes only platform-owned sign-in and current implemented tools", () => {
  const capabilities = buildAgentCapabilities(false);
  assert.equal(capabilities.profile, "sites");
  assert.deepEqual(capabilities.authentication, {
    mode: "sites-siwc",
    available: true,
    signInPath: "/signin-with-chatgpt",
    authenticatedWorkspaceOrigin: null,
  });
  assert.equal(capabilities.tools.modelGateway, true);
  assert.equal(capabilities.conversation.persistence, "browser-local");
  assert.equal(capabilities.conversation.streaming, false);
  assert.equal(capabilities.tools.canvas, "local-workspace");
});

test("capabilities endpoint never leaks provider or credential configuration", async () => {
  const previousMode = process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE = "public-anonymous";
  process.env.OPENAI_API_KEY = "SECRET_SENTINEL_AGENT_CAPABILITIES";
  try {
    const { GET } = await import("../app/api/agent/capabilities/route.ts");
    const response = await GET();
    const body = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(body, /SECRET_SENTINEL|API_KEY|api\.openai\.com/i);
  } finally {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
    else process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE = previousMode;
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  }
});
