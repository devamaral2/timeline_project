import type { AuditEventInput } from "../audit-event";
export const AUDIT_LOG = "AUDIT_LOG";
export interface AuditLog { record(event: AuditEventInput): Promise<void>; }
