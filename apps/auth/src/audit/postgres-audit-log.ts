import { ulid } from "ulid";
import type { AuthTransaction } from "../db/client";
import type { AuditEventInput } from "./audit-event";
import { assertSafeAuditEvent } from "./audit-redaction";
import type { AuditLog } from "./ports/audit-log";

type AuditQueryable = { query: (...args: unknown[]) => Promise<unknown> };
export async function insertAuditEvents(tx: AuthTransaction, events: readonly AuditEventInput[]): Promise<void> {
  if (events.length === 0) throw new Error("auditEvents must not be empty");
  for (const event of events) {
    assertSafeAuditEvent(event);
    await tx.query(`INSERT INTO audit_log (id, correlation_id, actor_user_id, action, target_type, target_id, result, reason, metadata, ip_address, user_agent, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [ulid(), event.correlationId, event.actorUserId, event.action, event.targetType, event.targetId, event.result, event.reason, JSON.stringify(event.metadata), event.context.ipAddress, event.context.userAgent, event.occurredAt]);
  }
}
export class PostgresAuditLog implements AuditLog {
  constructor(private readonly db: AuditQueryable) {}
  async record(event: AuditEventInput): Promise<void> {
    assertSafeAuditEvent(event);
    await this.db.query(`INSERT INTO audit_log (id, correlation_id, actor_user_id, action, target_type, target_id, result, reason, metadata, ip_address, user_agent, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [ulid(), event.correlationId, event.actorUserId, event.action, event.targetType, event.targetId, event.result, event.reason, JSON.stringify(event.metadata), event.context.ipAddress, event.context.userAgent, event.occurredAt]);
  }
}
