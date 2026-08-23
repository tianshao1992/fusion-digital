import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { optionalPrincipal } from "../app/api/_lib/auth.ts";
import type { Principal } from "../db/accounts.ts";
import {
  getIdentityTrustProfile,
  IDENTITY_TRUST_PROFILES,
  resolveIdentityTrustProfile,
} from "../app/auth/identity-trust-profile.ts";
import { resolveRequestIdentity } from "../app/auth/resolve-request-identity.ts";
import { SITES_SIWC_HEADERS, parseSitesSiwcIdentity } from "../app/auth/sites-siwc.ts";
import { createAgentRepository, AgentRepositoryUnavailableError } from "../app/agent/repository.ts";

function forgedSitesHeaders() {
  return new Headers({
    [SITES_SIWC_HEADERS.userId]: "attacker-subject",
    [SITES_SIWC_HEADERS.email]: "attacker@example.invalid",
    [SITES_SIWC_HEADERS.fullName]: encodeURIComponent("伪造用户"),
    [SITES_SIWC_HEADERS.fullNameEncoding]: "percent-encoded-utf-8",
  });
}

test("public-anonymous identity resolution ignores forged Sites headers", () => {
  const identity = resolveRequestIdentity(forgedSitesHeaders(), {
    publicAnonymous: true,
    trustProfile: "sites-siwc",
  });
  assert.deepEqual(identity, { authenticated: false, source: "anonymous" });
});

test("the Sites adapter parses identity only behind an explicitly trusted profile", () => {
  const parsed = parseSitesSiwcIdentity(forgedSitesHeaders());
  assert.ok(parsed?.authenticated);
  assert.equal(parsed.source, "sites-siwc");
  assert.equal(parsed.subject, "attacker-subject");
  assert.equal(parsed.fullName, "伪造用户");

  const resolved = resolveRequestIdentity(forgedSitesHeaders(), {
    publicAnonymous: false,
    trustProfile: "sites-siwc",
  });
  assert.deepEqual(resolved, parsed);
});

test("missing, unknown, and future identity profiles fail closed", () => {
  for (const trustProfile of [undefined, "", "site-siwc", "hk-oidc-v2"]) {
    const identity = resolveRequestIdentity(forgedSitesHeaders(), {
      publicAnonymous: false,
      trustProfile,
    });
    assert.deepEqual(identity, { authenticated: false, source: "anonymous" });
  }

  assert.equal(resolveIdentityTrustProfile(), IDENTITY_TRUST_PROFILES.anonymous);
  assert.equal(
    getIdentityTrustProfile({
      NEXT_PUBLIC_FUSIONDIGITAL_MODE: undefined,
      FUSIONDIGITAL_IDENTITY_TRUST_PROFILE: undefined,
    }),
    IDENTITY_TRUST_PROFILES.anonymous,
  );
});

test("public-anonymous mode overrides an explicitly configured Sites profile", () => {
  assert.equal(
    getIdentityTrustProfile({
      NEXT_PUBLIC_FUSIONDIGITAL_MODE: "public-anonymous",
      FUSIONDIGITAL_IDENTITY_TRUST_PROFILE: "sites-siwc",
    }),
    IDENTITY_TRUST_PROFILES.anonymous,
  );
});

test("incomplete or malformed Sites identity remains anonymous", () => {
  assert.equal(parseSitesSiwcIdentity(new Headers({ [SITES_SIWC_HEADERS.userId]: "subject-only" })), null);
  const malformedName = forgedSitesHeaders();
  malformedName.set(SITES_SIWC_HEADERS.fullName, "%E0%A4%A");
  const identity = parseSitesSiwcIdentity(malformedName);
  assert.equal(identity?.displayName, "attacker@example.invalid");
  assert.equal(identity?.fullName, null);
});

test("Sites subjects are length-bounded instead of truncated", () => {
  const headers = forgedSitesHeaders();
  headers.set(SITES_SIWC_HEADERS.userId, "s".repeat(513));
  assert.equal(parseSitesSiwcIdentity(headers), null);
});

test("Sites subjects remain opaque and Unicode-distinct", () => {
  const subjectHeaders = (subject: string) => {
    const base = forgedSitesHeaders();
    return {
      get(name: string) {
        return name === SITES_SIWC_HEADERS.userId ? subject : base.get(name);
      },
    };
  };
  const ascii = subjectHeaders("Account-A");
  const fullWidth = subjectHeaders("Account-Ａ");

  assert.equal(parseSitesSiwcIdentity(ascii)?.subject, "Account-A");
  assert.equal(parseSitesSiwcIdentity(fullWidth)?.subject, "Account-Ａ");
  assert.notEqual(
    parseSitesSiwcIdentity(ascii)?.subject,
    parseSitesSiwcIdentity(fullWidth)?.subject,
  );
});

test("Sites subjects reject surrounding whitespace and control characters", () => {
  const subjectHeaders = (subject: string) => {
    const base = forgedSitesHeaders();
    return {
      get(name: string) {
        return name === SITES_SIWC_HEADERS.userId ? subject : base.get(name);
      },
    };
  };

  assert.equal(parseSitesSiwcIdentity(subjectHeaders(" subject")), null);
  assert.equal(parseSitesSiwcIdentity(subjectHeaders("subject\u0000suffix")), null);
});

test("deferred ask authentication uses the explicit Request headers snapshot", async () => {
  const previousMode = process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
  const previousTrustProfile = process.env.FUSIONDIGITAL_IDENTITY_TRUST_PROFILE;
  delete process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
  process.env.FUSIONDIGITAL_IDENTITY_TRUST_PROFILE = "sites-siwc";
  const expected = { user: { id: "usr_explicit_headers" }, roles: ["member"] } as unknown as Principal;
  let capturedSubject = "";
  try {
    const principal = await optionalPrincipal(forgedSitesHeaders(), async (identity) => {
      capturedSubject = identity.userId;
      return expected;
    });
    assert.equal(principal, expected);
    assert.equal(capturedSubject, "attacker-subject");

    const askRoute = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
    assert.match(askRoute, /runtime\.principal\(request\.headers\)/);
    assert.doesNotMatch(askRoute, /principal\s*=\s*await optionalPrincipal\(\)/);
  } finally {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
    else process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE = previousMode;
    if (previousTrustProfile === undefined) {
      delete process.env.FUSIONDIGITAL_IDENTITY_TRUST_PROFILE;
    } else {
      process.env.FUSIONDIGITAL_IDENTITY_TRUST_PROFILE = previousTrustProfile;
    }
  }
});

test("durable agent persistence is explicitly unavailable until an adapter is configured", async () => {
  const repository = createAgentRepository();
  assert.equal(repository.available, false);
  await assert.rejects(repository.getThread("thread", "owner"), AgentRepositoryUnavailableError);
  await assert.rejects(repository.saveThread({ id: "thread", ownerSubject: "owner", createdAt: "2026-08-23T00:00:00.000Z", updatedAt: "2026-08-23T00:00:00.000Z" }), AgentRepositoryUnavailableError);
});
