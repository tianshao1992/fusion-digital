import { and, asc, eq } from "drizzle-orm";
import { getD1, getDb } from "./index";
import { newId } from "./ids";
import { stringifyJson } from "./json";
import { userLlmCredentials, userLlmPreferences } from "./schema";

export const USER_LLM_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "deepseek",
  "kimi",
] as const;

export type UserLlmProviderId = (typeof USER_LLM_PROVIDER_IDS)[number];
export type UserLlmRegion = "cn" | "international";
export type UserLlmPreferenceProvider = UserLlmProviderId | "retrieval";

export type UserLlmCredentialMetadata = {
  provider: UserLlmProviderId;
  keyHint: string;
  model: string | null;
  region: UserLlmRegion | null;
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type EncryptedUserLlmCredential = UserLlmCredentialMetadata & {
  ciphertext: string;
  iv: string;
  keyVersion: number;
};

export type UserLlmPreference = {
  defaultProvider: UserLlmPreferenceProvider;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

type UserLlmMutationContext = {
  actorUserId: string;
  requestId: string;
};

export async function listUserLlmCredentials(
  userId: string,
): Promise<UserLlmCredentialMetadata[]> {
  requireUserId(userId);
  return getDb()
    .select({
      provider: userLlmCredentials.provider,
      keyHint: userLlmCredentials.keyHint,
      model: userLlmCredentials.model,
      region: userLlmCredentials.region,
      enabled: userLlmCredentials.enabled,
      version: userLlmCredentials.version,
      createdAt: userLlmCredentials.createdAt,
      updatedAt: userLlmCredentials.updatedAt,
    })
    .from(userLlmCredentials)
    .where(eq(userLlmCredentials.userId, userId))
    .orderBy(asc(userLlmCredentials.provider));
}

export async function getUserLlmCredential(
  userId: string,
  provider: UserLlmProviderId,
): Promise<EncryptedUserLlmCredential | null> {
  requireUserId(userId);
  requireProvider(provider);
  const row = await getDb().query.userLlmCredentials.findFirst({
    where: and(
      eq(userLlmCredentials.userId, userId),
      eq(userLlmCredentials.provider, provider),
    ),
    columns: {
      userId: false,
    },
  });
  return row ?? null;
}

export async function upsertUserLlmCredential(input: {
  userId: string;
  provider: UserLlmProviderId;
  ciphertext: string;
  iv: string;
  keyVersion: number;
  keyHint: string;
  model: string | null;
  region: UserLlmRegion | null;
  enabled: boolean;
  mutation: UserLlmMutationContext;
}): Promise<EncryptedUserLlmCredential> {
  requireUserId(input.userId);
  requireProvider(input.provider);
  requireEncryptedField(input.ciphertext, "ciphertext", 4096);
  requireEncryptedField(input.iv, "iv", 128);
  requirePositiveInteger(input.keyVersion, "keyVersion");
  requireBoundedText(input.keyHint, "keyHint", 64);
  const model = optionalBoundedText(input.model, "model", 120);
  const region = optionalRegion(input.region);
  const mutation = validatedMutation(input.userId, input.mutation);
  const updatedAt = new Date().toISOString();
  const d1 = getD1();
  const results = await d1.batch([
    d1.prepare(
      `INSERT INTO user_llm_credentials
        (user_id, provider, ciphertext, iv, key_version, key_hint, model, region, enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET
         ciphertext = excluded.ciphertext,
         iv = excluded.iv,
         key_version = excluded.key_version,
         key_hint = excluded.key_hint,
         model = excluded.model,
         region = excluded.region,
         enabled = excluded.enabled,
         version = user_llm_credentials.version + 1,
         updated_at = excluded.updated_at`,
    ).bind(
      input.userId,
      input.provider,
      input.ciphertext,
      input.iv,
      input.keyVersion,
      input.keyHint,
      model,
      region,
      input.enabled ? 1 : 0,
      updatedAt,
    ),
    d1.prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, request_id, action, resource_type, resource_id, outcome, metadata_json)
       SELECT ?, ?, ?, 'account.llm_credential.upsert', 'user_llm_credential', provider, 'success', ?
       FROM user_llm_credentials WHERE user_id = ? AND provider = ?`,
    ).bind(
      newId("aud"),
      mutation.actorUserId,
      mutation.requestId,
      stringifyJson({ provider: input.provider, model, region }),
      input.userId,
      input.provider,
    ),
  ]);
  if (!exactChanges(results, [1, 1])) {
    throw new Error("Unable to atomically persist user LLM credential and audit event");
  }
  const credential = await getUserLlmCredential(input.userId, input.provider);
  if (!credential) throw new Error("Unable to persist user LLM credential");
  return credential;
}

export async function deleteUserLlmCredential(
  userId: string,
  provider: UserLlmProviderId,
  mutationInput: UserLlmMutationContext,
): Promise<boolean> {
  requireUserId(userId);
  requireProvider(provider);
  const mutation = validatedMutation(userId, mutationInput);
  const updatedAt = new Date().toISOString();
  const d1 = getD1();
  const results = await d1.batch([
    d1.prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, request_id, action, resource_type, resource_id, outcome, metadata_json)
       SELECT ?, ?, ?, 'account.llm_credential.delete', 'user_llm_credential', provider, 'success', ?
       FROM user_llm_credentials WHERE user_id = ? AND provider = ?`,
    ).bind(
      newId("aud"),
      mutation.actorUserId,
      mutation.requestId,
      stringifyJson({ provider }),
      userId,
      provider,
    ),
    d1.prepare(
      `UPDATE user_llm_preferences
       SET default_provider = 'retrieval', revision = revision + 1, updated_at = ?
       WHERE user_id = ? AND default_provider = ?
         AND EXISTS (
           SELECT 1 FROM user_llm_credentials
           WHERE user_llm_credentials.user_id = ?
             AND user_llm_credentials.provider = ?
         )`,
    ).bind(updatedAt, userId, provider, userId, provider),
    d1.prepare(
      `DELETE FROM user_llm_credentials WHERE user_id = ? AND provider = ?`,
    ).bind(userId, provider),
  ]);
  const changes = results.map((entry) => entry.success ? entry.meta?.changes ?? -1 : -1);
  if (changes[0] === 0 && changes[1] === 0 && changes[2] === 0) return false;
  if (changes[0] !== 1 || (changes[1] !== 0 && changes[1] !== 1) || changes[2] !== 1) {
    throw new Error("Unable to atomically delete user LLM credential and write audit event");
  }
  return true;
}

export async function getUserLlmPreference(
  userId: string,
): Promise<UserLlmPreference | null> {
  requireUserId(userId);
  const row = await getDb().query.userLlmPreferences.findFirst({
    where: eq(userLlmPreferences.userId, userId),
    columns: { userId: false },
  });
  return row ?? null;
}

export async function setUserLlmPreference(
  userId: string,
  defaultProvider: UserLlmPreferenceProvider,
  mutationInput: UserLlmMutationContext,
): Promise<UserLlmPreference> {
  requireUserId(userId);
  requirePreferenceProvider(defaultProvider);
  const mutation = validatedMutation(userId, mutationInput);
  const updatedAt = new Date().toISOString();
  const d1 = getD1();
  const results = await d1.batch([
    d1.prepare(
      `INSERT INTO user_llm_preferences (user_id, default_provider, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         default_provider = excluded.default_provider,
         revision = user_llm_preferences.revision + 1,
         updated_at = excluded.updated_at`,
    ).bind(userId, defaultProvider, updatedAt),
    d1.prepare(
      `INSERT INTO audit_events
        (id, actor_user_id, request_id, action, resource_type, resource_id, outcome, metadata_json)
       VALUES (?, ?, ?, 'account.llm_preference.update', 'user_llm_preference', ?, 'success', ?)`,
    ).bind(
      newId("aud"),
      mutation.actorUserId,
      mutation.requestId,
      userId,
      stringifyJson({ defaultProvider }),
    ),
  ]);
  if (!exactChanges(results, [1, 1])) {
    throw new Error("Unable to atomically persist user LLM preference and audit event");
  }
  const preference = await getUserLlmPreference(userId);
  if (!preference) throw new Error("Unable to persist user LLM preference");
  return preference;
}

function requireUserId(value: string): void {
  if (!value || value !== value.trim() || value.length > 200) {
    throw new TypeError("userId must be a non-empty bounded identifier");
  }
}

function requireProvider(value: string): asserts value is UserLlmProviderId {
  if (!(USER_LLM_PROVIDER_IDS as readonly string[]).includes(value)) {
    throw new TypeError("Unsupported LLM provider");
  }
}

function requirePreferenceProvider(
  value: string,
): asserts value is UserLlmPreferenceProvider {
  if (value !== "retrieval") requireProvider(value);
}

function optionalRegion(value: UserLlmRegion | null | undefined): UserLlmRegion | null {
  if (value === undefined || value === null) return null;
  if (value !== "cn" && value !== "international") {
    throw new TypeError("Unsupported LLM provider region");
  }
  return value;
}

function requireEncryptedField(value: string, name: string, max: number): void {
  if (!value || value.length > max) {
    throw new TypeError(`${name} must be a non-empty bounded encrypted value`);
  }
}

function requireBoundedText(value: string, name: string, max: number): string {
  if (!value || value !== value.trim() || value.length > max) {
    throw new TypeError(`${name} must be a non-empty bounded string`);
  }
  return value;
}

function optionalBoundedText(
  value: string | null | undefined,
  name: string,
  max: number,
): string | null {
  if (value === undefined || value === null) return null;
  return requireBoundedText(value, name, max);
}

function requirePositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
}

function validatedMutation(
  userId: string,
  mutation: UserLlmMutationContext,
): UserLlmMutationContext {
  requireUserId(mutation.actorUserId);
  if (mutation.actorUserId !== userId) {
    throw new TypeError("Credential mutations must be performed by their owning user");
  }
  if (!mutation.requestId || mutation.requestId !== mutation.requestId.trim() || mutation.requestId.length > 128) {
    throw new TypeError("requestId must be a non-empty bounded identifier");
  }
  return mutation;
}

function exactChanges(
  results: Array<{ success: boolean; meta?: { changes?: number } }>,
  expected: number[],
): boolean {
  return results.length === expected.length && results.every(
    (entry, index) => entry.success && entry.meta?.changes === expected[index],
  );
}
