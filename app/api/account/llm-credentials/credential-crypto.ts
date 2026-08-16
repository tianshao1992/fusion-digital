import type { LlmProviderId } from "../../ask/provider-registry";

const CIPHER_SUITE = "AES-256-GCM" as const;
const CREDENTIAL_KEY_VERSION = 1 as const;
const KEK_ENV_NAME = "LLM_CREDENTIAL_KEK_V1" as const;
const AES_KEY_BYTES = 32;
const GCM_IV_BYTES = 12;
const GCM_TAG_BITS = 128;
const GCM_TAG_BYTES = GCM_TAG_BITS / 8;
const MIN_API_KEY_BYTES = 8;
const MAX_API_KEY_BYTES = 512;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const PROVIDERS = new Set<LlmProviderId>(["openai", "anthropic", "deepseek", "kimi"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export type CredentialCryptoEnvironment = Readonly<{
  LLM_CREDENTIAL_KEK_V1?: string;
}>;

export type EncryptedCredentialApiKey = Readonly<{
  cipherSuite: typeof CIPHER_SUITE;
  keyVersion: typeof CREDENTIAL_KEY_VERSION;
  iv: string;
  ciphertext: string;
}>;

export class CredentialCryptoError extends Error {
  constructor(readonly kind: "configuration" | "validation" | "decryption") {
    super(
      kind === "configuration"
        ? "Credential encryption is unavailable"
        : kind === "validation"
          ? "Credential input is invalid"
          : "Credential decryption failed",
    );
    this.name = "CredentialCryptoError";
  }
}

export async function encryptCredentialApiKey(input: {
  apiKey: string;
  userId: string;
  provider: LlmProviderId;
  env?: CredentialCryptoEnvironment;
}): Promise<EncryptedCredentialApiKey> {
  const apiKeyBytes = validateApiKey(input.apiKey);
  const aad = credentialAad(input.userId, input.provider, CREDENTIAL_KEY_VERSION);
  const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES));
  const key = await importKek(runtimeEnvironment(input.env));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ownedBuffer(iv),
      additionalData: ownedBuffer(aad),
      tagLength: GCM_TAG_BITS,
    },
    key,
    ownedBuffer(apiKeyBytes),
  );

  return {
    cipherSuite: CIPHER_SUITE,
    keyVersion: CREDENTIAL_KEY_VERSION,
    iv: encodeBase64Url(iv),
    ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptCredentialApiKey(input: {
  encrypted: EncryptedCredentialApiKey;
  userId: string;
  provider: LlmProviderId;
  env?: CredentialCryptoEnvironment;
}): Promise<string> {
  try {
    validateEncryptedEnvelope(input.encrypted);
    const iv = decodeBase64Url(input.encrypted.iv, GCM_IV_BYTES);
    const ciphertext = decodeBase64Url(input.encrypted.ciphertext);
    if (
      ciphertext.byteLength < MIN_API_KEY_BYTES + GCM_TAG_BYTES
      || ciphertext.byteLength > MAX_API_KEY_BYTES + GCM_TAG_BYTES
    ) {
      throw new CredentialCryptoError("decryption");
    }
    const aad = credentialAad(input.userId, input.provider, input.encrypted.keyVersion);
    const key = await importKek(runtimeEnvironment(input.env));
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ownedBuffer(iv),
        additionalData: ownedBuffer(aad),
        tagLength: GCM_TAG_BITS,
      },
      key,
      ownedBuffer(ciphertext),
    );
    const apiKey = decoder.decode(validateApiKeyBytes(new Uint8Array(plaintext)));
    validateApiKey(apiKey);
    return apiKey;
  } catch (error) {
    if (error instanceof CredentialCryptoError && error.kind === "configuration") throw error;
    throw new CredentialCryptoError("decryption");
  }
}

function credentialAad(
  userId: string,
  provider: LlmProviderId,
  keyVersion: typeof CREDENTIAL_KEY_VERSION,
): Uint8Array {
  if (
    typeof userId !== "string"
    || userId.length < 1
    || userId.length > 256
    || CONTROL_CHARACTERS.test(userId)
    || !PROVIDERS.has(provider)
    || keyVersion !== CREDENTIAL_KEY_VERSION
  ) {
    throw new CredentialCryptoError("validation");
  }
  // JSON array encoding prevents delimiter ambiguity while binding ciphertext
  // to its immutable owner, provider, purpose and key version.
  return encoder.encode(JSON.stringify([
    "fusiondigital",
    "llm-credential-api-key",
    1,
    userId,
    provider,
    keyVersion,
  ]));
}

async function importKek(env: CredentialCryptoEnvironment): Promise<CryptoKey> {
  const encoded = env[KEK_ENV_NAME];
  if (typeof encoded !== "string" || encoded.length !== 43 || !BASE64URL.test(encoded)) {
    throw new CredentialCryptoError("configuration");
  }
  let raw: Uint8Array;
  try {
    raw = decodeBase64Url(encoded, AES_KEY_BYTES);
  } catch {
    throw new CredentialCryptoError("configuration");
  }
  return crypto.subtle.importKey("raw", ownedBuffer(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function runtimeEnvironment(env?: CredentialCryptoEnvironment): CredentialCryptoEnvironment {
  return env ?? { LLM_CREDENTIAL_KEK_V1: process.env.LLM_CREDENTIAL_KEK_V1 };
}

function validateApiKey(value: string): Uint8Array {
  if (typeof value !== "string" || CONTROL_CHARACTERS.test(value)) {
    throw new CredentialCryptoError("validation");
  }
  return validateApiKeyBytes(encoder.encode(value));
}

function validateApiKeyBytes(value: Uint8Array): Uint8Array {
  if (value.byteLength < MIN_API_KEY_BYTES || value.byteLength > MAX_API_KEY_BYTES) {
    throw new CredentialCryptoError("validation");
  }
  return value;
}

function validateEncryptedEnvelope(value: EncryptedCredentialApiKey): void {
  if (
    !value
    || value.cipherSuite !== CIPHER_SUITE
    || value.keyVersion !== CREDENTIAL_KEY_VERSION
    || typeof value.iv !== "string"
    || typeof value.ciphertext !== "string"
  ) {
    throw new CredentialCryptoError("decryption");
  }
}

function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string, expectedBytes?: number): Uint8Array {
  if (!value || !BASE64URL.test(value)) throw new Error("Invalid base64url");
  const padding = (4 - (value.length % 4)) % 4;
  const standard = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padding);
  const binary = atob(standard);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (expectedBytes !== undefined && bytes.byteLength !== expectedBytes) {
    throw new Error("Unexpected byte length");
  }
  if (encodeBase64Url(bytes) !== value) throw new Error("Non-canonical base64url");
  return bytes;
}

function ownedBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
