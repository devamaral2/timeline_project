import type { AuditEventInput } from "../audit/audit-event";
import { assertSafeAuditEvent } from "../audit/audit-redaction";
import type { AuditLog } from "../audit/ports/audit-log";
export class InMemoryAuditLog implements AuditLog { readonly events: AuditEventInput[] = []; async record(event: AuditEventInput): Promise<void> { assertSafeAuditEvent(event); this.events.push(event); } }
