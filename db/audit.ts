import { getDb } from "./index";
import { newId } from "./ids";
import { stringifyJson, type JsonValue } from "./json";
import { auditEvents } from "./schema";

export type AuditInput = {
  actorUserId?: string | null;
  requestId: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome?: "success" | "denied" | "failure";
  metadata?: Record<string, JsonValue>;
};

/** Append-only audit writer. Audit events intentionally have no update/delete API. */
export async function appendAuditEvent(input: AuditInput): Promise<string> {
  const id = newId("aud");
  await getDb().insert(auditEvents).values({
    id,
    actorUserId: input.actorUserId ?? null,
    requestId: input.requestId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    outcome: input.outcome ?? "success",
    metadataJson: stringifyJson(input.metadata),
  });
  return id;
}
