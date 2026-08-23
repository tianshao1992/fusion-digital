import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { HeaderReader } from "./auth/contracts";
import { resolveRequestIdentity } from "./auth/resolve-request-identity";

export type ChatGPTUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const SIGN_IN_PATH = "/signin-with-chatgpt";
const SIGN_OUT_PATH = "/signout-with-chatgpt";
const CALLBACK_PATH = "/callback";

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  return getChatGPTUserFromHeaders(await headers());
}

/**
 * Resolve identity from an explicit request snapshot. Deferred route work must
 * use this path because framework-owned `next/headers` context can be cleared
 * as soon as the route handler has returned its streaming Response.
 */
export function getChatGPTUserFromHeaders(
  requestHeaders: HeaderReader,
): ChatGPTUser | null {
  const identity = resolveRequestIdentity(requestHeaders);
  if (!identity.authenticated) return null;

  return {
    userId: identity.subject,
    displayName: identity.displayName,
    email: identity.email,
    fullName: identity.fullName,
  };
}

export async function requireChatGPTUser(
  returnTo: string,
): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;

  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = "/"): string {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return "/";
  }
  if (url.origin !== "https://app.local") return "/";
  if (isReservedAuthPath(url.pathname)) return "/";

  return `${url.pathname}${url.search}${url.hash}`;
}

function isReservedAuthPath(pathname: string): boolean {
  return (
    pathname === SIGN_IN_PATH ||
    pathname === SIGN_OUT_PATH ||
    pathname === CALLBACK_PATH
  );
}
