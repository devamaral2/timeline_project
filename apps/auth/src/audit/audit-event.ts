import type { RequestContext } from "../common/request-context";

export type AuditResult = "succeeded" | "failed";
export type AuditAction =
  | "bootstrap.admin_created" | "bootstrap.admin_reissued" | "invite.created" | "invite.inspected"
  | "invite.acceptance_started" | "invite.accepted" | "invite.failed" | "login.started" | "login.succeeded" | "login.failed"
  | "session.issued" | "session.refreshed" | "session.revoked" | "session.revoked_all" | "token.reuse_detected"
  | "password.changed" | "key.created" | "key.rotated" | "key.retired" | "cleanup.completed";
export type AuditMetadataValue = string | number | boolean | null | readonly AuditMetadataValue[] | { readonly [key: string]: AuditMetadataValue };
export interface AuditEventInput {
  correlationId: string; actorUserId: string | null; action: AuditAction; targetType: string | null; targetId: string | null;
  result: AuditResult; reason: string | null; metadata: Readonly<Record<string, AuditMetadataValue>>; context: RequestContext; occurredAt: Date;
}
