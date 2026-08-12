import { and, eq, isNull } from "drizzle-orm";
import type { ChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "./index";
import { newId } from "./ids";
import { quotaOverrides, userRoles, users } from "./schema";

export const ROLES = ["member", "contributor", "reviewer", "admin", "agent"] as const;
export type Role = (typeof ROLES)[number];

export type Principal = {
  user: typeof users.$inferSelect;
  roles: Role[];
};

/** Idempotently maps the platform SIWC subject to one internal account. */
export async function provisionUser(identity: ChatGPTUser): Promise<Principal> {
  const db = getDb();
  const emailNormalized = normalizeEmail(identity.email);
  const displayName = normalizeDisplayName(identity.displayName, identity.email);

  await db
    .insert(users)
    .values({
      id: newId("usr"),
      siwcSubject: identity.userId,
      email: identity.email.trim(),
      emailNormalized,
      displayName,
    })
    .onConflictDoUpdate({
      target: users.siwcSubject,
      set: {
        email: identity.email.trim(),
        emailNormalized,
        displayName,
        lastSeenAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

  const user = await db.query.users.findFirst({
    where: eq(users.siwcSubject, identity.userId),
  });
  if (!user) throw new Error("Unable to provision authenticated user");

  await db
    .insert(userRoles)
    .values({ userId: user.id, role: "member" })
    .onConflictDoNothing();

  const roles = await getActiveRoles(user.id);
  return { user, roles };
}

export async function getActiveRoles(userId: string): Promise<Role[]> {
  const rows = await getDb()
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.revokedAt)));
  return rows.map(({ role }) => role);
}

export async function getQuotaOverride(userId: string) {
  const row = await getDb().query.quotaOverrides.findFirst({
    where: eq(quotaOverrides.userId, userId),
  });
  if (!row || (row.validUntil && row.validUntil <= new Date().toISOString())) return null;
  return row;
}

export async function grantRole(input: {
  userId: string;
  role: Role;
  grantedByUserId: string;
}): Promise<void> {
  await getDb()
    .insert(userRoles)
    .values({
      userId: input.userId,
      role: input.role,
      grantedByUserId: input.grantedByUserId,
      grantedAt: new Date().toISOString(),
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: [userRoles.userId, userRoles.role],
      set: {
        grantedByUserId: input.grantedByUserId,
        grantedAt: new Date().toISOString(),
        revokedAt: null,
      },
    });
}

export async function revokeRole(input: {
  userId: string;
  role: Role;
}): Promise<boolean> {
  if (input.role === "member") throw new Error("The baseline member role cannot be revoked");
  const updated = await getDb()
    .update(userRoles)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(
        eq(userRoles.userId, input.userId),
        eq(userRoles.role, input.role),
        isNull(userRoles.revokedAt),
      ),
    )
    .returning({ userId: userRoles.userId });
  return updated.length === 1;
}

function normalizeEmail(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function normalizeDisplayName(displayName: string, email: string): string {
  const normalized = displayName.trim().replace(/\s+/g, " ");
  return (normalized || email.trim()).slice(0, 160);
}
