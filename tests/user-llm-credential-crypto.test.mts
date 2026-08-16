import assert from "node:assert/strict";
import test from "node:test";
import {
  CredentialCryptoError,
  decryptCredentialApiKey,
  encryptCredentialApiKey,
  type CredentialCryptoEnvironment,
  type EncryptedCredentialApiKey,
} from "../app/api/account/llm-credentials/credential-crypto.ts";

const KEK_A = Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index + 1)).toString("base64url");
const KEK_B = Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => 255 - index)).toString("base64url");
const ENV_A = { LLM_CREDENTIAL_KEK_V1: KEK_A } satisfies CredentialCryptoEnvironment;
const ENV_B = { LLM_CREDENTIAL_KEK_V1: KEK_B } satisfies CredentialCryptoEnvironment;
const API_KEY = "sk-private-user-credential-123456789";

test("AES-256-GCM credential encryption round-trips and uses a fresh 12-byte IV", async () => {
  const first = await encryptCredentialApiKey({
    apiKey: API_KEY,
    userId: "usr_alice",
    provider: "openai",
    env: ENV_A,
  });
  const second = await encryptCredentialApiKey({
    apiKey: API_KEY,
    userId: "usr_alice",
    provider: "openai",
    env: ENV_A,
  });

  assert.equal(first.cipherSuite, "AES-256-GCM");
  assert.equal(first.keyVersion, 1);
  assert.equal(Buffer.from(first.iv, "base64url").byteLength, 12);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.doesNotMatch(JSON.stringify(first), /sk-private-user-credential/);
  assert.equal(await decryptCredentialApiKey({
    encrypted: first,
    userId: "usr_alice",
    provider: "openai",
    env: ENV_A,
  }), API_KEY);
});

test("AAD prevents decrypting a credential as another user or provider", async () => {
  const encrypted = await encryptCredentialApiKey({
    apiKey: API_KEY,
    userId: "usr_alice",
    provider: "openai",
    env: ENV_A,
  });

  await assert.rejects(
    decryptCredentialApiKey({ encrypted, userId: "usr_bob", provider: "openai", env: ENV_A }),
    decryptionFailure,
  );
  await assert.rejects(
    decryptCredentialApiKey({ encrypted, userId: "usr_alice", provider: "anthropic", env: ENV_A }),
    decryptionFailure,
  );
});

test("ciphertext tampering fails authentication", async () => {
  const encrypted = await encryptCredentialApiKey({
    apiKey: API_KEY,
    userId: "usr_alice",
    provider: "deepseek",
    env: ENV_A,
  });
  const bytes = Buffer.from(encrypted.ciphertext, "base64url");
  bytes[bytes.length - 1] ^= 0x01;
  const tampered: EncryptedCredentialApiKey = {
    ...encrypted,
    ciphertext: bytes.toString("base64url"),
  };

  await assert.rejects(
    decryptCredentialApiKey({ encrypted: tampered, userId: "usr_alice", provider: "deepseek", env: ENV_A }),
    decryptionFailure,
  );
});

test("a different or malformed KEK cannot decrypt a credential", async () => {
  const encrypted = await encryptCredentialApiKey({
    apiKey: API_KEY,
    userId: "usr_alice",
    provider: "kimi",
    env: ENV_A,
  });

  await assert.rejects(
    decryptCredentialApiKey({ encrypted, userId: "usr_alice", provider: "kimi", env: ENV_B }),
    decryptionFailure,
  );
  await assert.rejects(
    encryptCredentialApiKey({ apiKey: API_KEY, userId: "usr_alice", provider: "kimi", env: { LLM_CREDENTIAL_KEK_V1: "too-short" } }),
    configurationFailure,
  );
});

test("API keys normalize surrounding ASCII spaces and reject non-visible ASCII", async () => {
  for (const apiKey of [
    "1234567",
    "x".repeat(513),
    "valid-key\nwith-newline",
    "valid-key\rwith-return",
    "valid-key\twith-tab",
    "valid key with space",
    "valid-key-密钥",
    `valid-key${String.fromCharCode(0x7f)}control`,
  ]) {
    await assert.rejects(
      encryptCredentialApiKey({ apiKey, userId: "usr_alice", provider: "openai", env: ENV_A }),
      validationFailure,
    );
  }

  const normalized = await encryptCredentialApiKey({
    apiKey: "  sk-pasted-with-padding  ",
    userId: "usr_alice",
    provider: "openai",
    env: ENV_A,
  });
  assert.equal(await decryptCredentialApiKey({
    encrypted: normalized,
    userId: "usr_alice",
    provider: "openai",
    env: ENV_A,
  }), "sk-pasted-with-padding");

  const boundary = "x".repeat(512);
  const encrypted = await encryptCredentialApiKey({
    apiKey: boundary,
    userId: "usr_alice",
    provider: "openai",
    env: ENV_A,
  });
  assert.equal(await decryptCredentialApiKey({
    encrypted,
    userId: "usr_alice",
    provider: "openai",
    env: ENV_A,
  }), boundary);
});

function decryptionFailure(error: unknown): boolean {
  return error instanceof CredentialCryptoError
    && error.kind === "decryption"
    && error.message === "Credential decryption failed";
}

function configurationFailure(error: unknown): boolean {
  return error instanceof CredentialCryptoError
    && error.kind === "configuration"
    && error.message === "Credential encryption is unavailable";
}

function validationFailure(error: unknown): boolean {
  return error instanceof CredentialCryptoError
    && error.kind === "validation"
    && error.message === "Credential input is invalid";
}
