import type { AuthTransaction } from "./client";
export const ADVISORY_LOCK = { bootstrapAdmin: "timeline-auth:bootstrap-admin", signingKey: "timeline-auth:signing-key", cleanup: "timeline-auth:cleanup", passwordUpdate: "timeline-auth:password-update" } as const;
export async function acquireAdvisoryLock(tx: AuthTransaction, name: string): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [name]);
}
