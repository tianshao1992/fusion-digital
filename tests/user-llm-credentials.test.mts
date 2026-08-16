import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  cleanProviderId,
  normalizeProviderApiKey,
  resolveProviderWithCredential,
} from "../app/api/ask/provider-registry.ts";

const schemaSource = read("db/schema.ts");
const repositorySource = read("db/llm-credentials.ts");
const accountRouteSource = read("app/api/account/llm-credentials/route.ts");
const providerRouteSource = read("app/api/account/llm-credentials/[provider]/route.ts");
const managerSource = read("app/account/LlmCredentialManager.tsx");
const chatSource = read("app/components/knowledge-chat/KnowledgeChat.tsx");
const migrationSource = read("drizzle/0001_massive_madrox.sql");

test("personal provider resolution keeps fixed upstreams and accepts only allowlisted providers", () => {
  const cases = [
    ["openai", "https://api.openai.com/v1/responses"],
    ["anthropic", "https://api.anthropic.com/v1/messages"],
    ["deepseek", "https://api.deepseek.com/chat/completions"],
    ["kimi", "https://api.moonshot.ai/v1/chat/completions"],
  ] as const;
  for (const [provider, endpoint] of cases) {
    assert.equal(cleanProviderId(provider), provider);
    const resolved = resolveProviderWithCredential({
      provider,
      apiKey: `private-${provider}-credential`,
      model: `approved-${provider}-model`,
      region: provider === "kimi" ? "international" : null,
    });
    assert.equal(resolved?.endpoint, endpoint);
    assert.equal(resolved?.source, "personal");
    assert.equal(resolved?.model, `approved-${provider}-model`);
  }
  assert.equal(cleanProviderId("http://169.254.169.254/latest/meta-data"), null);
  assert.equal(cleanProviderId("__proto__"), null);
  assert.equal(resolveProviderWithCredential({ provider: "openai", apiKey: "short", model: "model" }), null);
  assert.equal(normalizeProviderApiKey("  private-api-key  "), "private-api-key");
  for (const invalid of ["private api key", "private\tapi-key", "private\napi-key", "private-api-密钥"]) {
    assert.equal(normalizeProviderApiKey(invalid), null);
    assert.equal(resolveProviderWithCredential({ provider: "openai", apiKey: invalid, model: "model" }), null);
  }
});

test("D1 schema and migration isolate credentials by user and provider", () => {
  assert.match(schemaSource, /primaryKey\(\{ columns: \[table\.userId, table\.provider\] \}\)/);
  assert.match(schemaSource, /references\(\(\) => users\.id, \{ onDelete: "cascade" \}\)/);
  assert.match(schemaSource, /ck_user_llm_credentials_provider/);
  assert.match(migrationSource, /PRIMARY KEY\(`user_id`,\s*`provider`\)/);
  assert.match(migrationSource, /ON DELETE cascade/i);
  assert.match(repositorySource, /eq\(userLlmCredentials\.userId, userId\)/);
  assert.match(repositorySource, /eq\(userLlmCredentials\.provider, provider\)/);
  assert.doesNotMatch(repositorySource, /apiKey|plaintext/i);
});

test("credential APIs derive ownership from the authenticated principal and never return encrypted fields", () => {
  assert.match(accountRouteSource, /requirePrincipal\(\)/);
  assert.match(providerRouteSource, /requirePrincipal\(\)/);
  assert.match(providerRouteSource, /assertSameOrigin\(request\)/);
  assert.match(providerRouteSource, /principal\.user\.id/);
  assert.doesNotMatch(providerRouteSource, /body\.userId|body\.ciphertext|body\.iv/);
  const responseProjection = providerRouteSource.match(/return ok\(\{[\s\S]*?\n    \}\);/)?.[0] ?? "";
  assert.ok(responseProjection);
  assert.doesNotMatch(responseProjection, /ciphertext:|iv:|apiKey:/);
  assert.match(providerRouteSource, /const apiKey = normalizeProviderApiKey\(body\.apiKey\)/);
  assert.match(providerRouteSource, /keyHint: keyHint\(apiKey\)/);
});

test("credential mutations and their success audits share one atomic D1 batch", () => {
  assert.match(repositorySource, /getD1\(\)\.batch|d1\.batch/);
  assert.match(repositorySource, /account\.llm_credential\.upsert/);
  assert.match(repositorySource, /account\.llm_credential\.delete/);
  assert.match(repositorySource, /account\.llm_preference\.update/);
  assert.match(repositorySource, /Credential mutations must be performed by their owning user/);
  assert.doesNotMatch(accountRouteSource, /appendAuditEvent/);
  assert.doesNotMatch(providerRouteSource, /appendAuditEvent/);
});

test("account UI treats API keys as one-time password inputs without browser persistence", () => {
  assert.match(managerSource, /type="password"/);
  assert.match(managerSource, /autoComplete="new-password"/);
  assert.match(managerSource, /setApiKeys\(\(current\) => \(\{ \.\.\.current, \[provider\.id\]: "" \}\)\)/);
  assert.doesNotMatch(managerSource, /localStorage|sessionStorage|dangerouslySetInnerHTML/);
  assert.doesNotMatch(chatSource, /knowledge-chat\.provider\.v1|PROVIDER_STORAGE_KEY/);
  assert.match(chatSource, /\/account#ai-models/);
});

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
