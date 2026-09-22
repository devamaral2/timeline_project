import { insertAuditEvents } from "../audit/postgres-audit-log";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import type { AuthDatabase } from "../db/client";
import { acquireAdvisoryLock, ADVISORY_LOCK } from "../db/transaction-locks";
import { normalizeEmail } from "../domain/users/user";

export async function updatePassword(
  database: AuthDatabase,
  input: { email: string; passwordHash: string; now?: Date },
): Promise<{ userId: string; revokedSessions: number }> {
  const email = normalizeEmail(input.email);
  const now = input.now ?? new Date();
  if (!email) throw new Error("email is required");

  return database.transaction(async (tx) => {
    await acquireAdvisoryLock(tx, `${ADVISORY_LOCK.passwordUpdate}:${email}`);
    const user = (
      await tx.query<{ id: string; status: string }>(
        "SELECT id, status FROM users WHERE email = $1 FOR UPDATE",
        [email],
      )
    ).rows[0];
    if (!user || user.status !== "active") throw new Error("active user not found");

    await tx.query("UPDATE users SET password_hash = $1, updated_at = $2 WHERE id = $3", [
      input.passwordHash,
      now,
      user.id,
    ]);
    const sessions = await tx.query(
      "UPDATE sessions SET revoked_at = $1, ended_at = $1 WHERE user_id = $2 AND revoked_at IS NULL",
      [now, user.id],
    );
    const revokedSessions = sessions.rowCount ?? 0;
    await insertAuditEvents(tx, [
      {
        correlationId: "password-update-cli",
        actorUserId: null,
        action: "password.changed",
        targetType: "user",
        targetId: user.id,
        result: "succeeded",
        reason: "password-update-cli",
        metadata: { source: "password-update-cli", revokedSessions },
        context: ANONYMOUS_CONTEXT,
        occurredAt: now,
      },
    ]);
    return { userId: user.id, revokedSessions };
  });
}
