import type { AuthenticatedRequestIdentity, HeaderReader } from "./contracts";

export const SITES_SIWC_HEADERS = Object.freeze({
  userId: "oai-authenticated-user-id",
  email: "oai-authenticated-user-email",
  fullName: "oai-authenticated-user-full-name",
  fullNameEncoding: "oai-authenticated-user-full-name-encoding",
});

const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const MAX_SUBJECT_LENGTH = 512;
const MAX_EMAIL_LENGTH = 320;
const MAX_NAME_LENGTH = 512;

/**
 * Parse identity headers supplied by the Sites trusted hosting boundary.
 * Callers must first establish that the current deployment profile is Sites;
 * these headers are never self-authenticating on a standalone server.
 */
export function parseSitesSiwcIdentity(headers: HeaderReader): AuthenticatedRequestIdentity | null {
  const subject = readOpaqueSubject(headers.get(SITES_SIWC_HEADERS.userId));
  const email = cleanDisplayHeader(headers.get(SITES_SIWC_HEADERS.email), MAX_EMAIL_LENGTH);
  if (!subject || !email) return null;

  const encodedFullName = headers.get(SITES_SIWC_HEADERS.fullName);
  const fullName = encodedFullName
    && headers.get(SITES_SIWC_HEADERS.fullNameEncoding) === PERCENT_ENCODED_UTF8
      ? cleanDisplayHeader(safeDecodeURIComponent(encodedFullName), MAX_NAME_LENGTH)
      : null;

  return {
    authenticated: true,
    source: "sites-siwc",
    subject,
    email,
    displayName: fullName ?? email,
    fullName,
  };
}

/**
 * A platform subject is an opaque security identifier. Preserve every code
 * point exactly: normalization or truncation could merge two distinct users.
 */
function readOpaqueSubject(value: string | null): string | null {
  if (!value || value.length > MAX_SUBJECT_LENGTH) return null;
  if (value !== value.trim() || /\p{Cc}/u.test(value)) return null;
  return value;
}

function cleanDisplayHeader(value: string | null, limit: number): string | null {
  if (!value) return null;
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return normalized && normalized.length <= limit ? normalized : null;
}

function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
