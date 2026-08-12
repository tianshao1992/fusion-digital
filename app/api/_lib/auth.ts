import { getChatGPTUser } from "@/app/chatgpt-auth";
import { provisionUser, type Principal, type Role } from "@/db/accounts";
import { appendAuditEvent } from "@/db/audit";
import { ApiError } from "./http";

export async function optionalPrincipal(): Promise<Principal | null> {
  const identity = await getChatGPTUser();
  return identity ? provisionUser(identity) : null;
}

export async function requirePrincipal(): Promise<Principal> {
  const principal = await optionalPrincipal();
  if (!principal) throw new ApiError(401, "UNAUTHENTICATED", "Sign in with ChatGPT to continue");
  if (principal.user.status !== "active") {
    throw new ApiError(403, "FORBIDDEN", "This account is not active");
  }
  return principal;
}

export async function requireRole(
  allowedRoles: readonly Role[],
  context?: { requestId: string; action: string; resourceType: string; resourceId?: string },
): Promise<Principal> {
  const principal = await requirePrincipal();
  if (allowedRoles.some((role) => principal.roles.includes(role))) return principal;

  if (context) {
    await appendAuditEvent({
      actorUserId: principal.user.id,
      requestId: context.requestId,
      action: context.action,
      resourceType: context.resourceType,
      resourceId: context.resourceId,
      outcome: "denied",
      metadata: { requiredRoles: [...allowedRoles] },
    });
  }
  throw new ApiError(403, "FORBIDDEN", "You do not have permission for this operation");
}

export function hasRole(principal: Principal, ...roles: Role[]): boolean {
  return roles.some((role) => principal.roles.includes(role));
}
