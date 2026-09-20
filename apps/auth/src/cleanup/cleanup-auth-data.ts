import { insertAuditEvents } from '../audit/postgres-audit-log';
import type { AuditEventInput } from '../audit/audit-event';
import type { RequestContext } from '../common/request-context';
import type { Clock } from '../common/clock';
import type { AuthDatabase, AuthTransaction } from '../db/client';

export interface CleanupResult {
  lockAcquired: boolean;
  sessionsEnded: number;
  authenticationAttemptsDeleted: number;
  mfaChallengesDeleted: number;
  rateLimitBucketsDeleted: number;
  invitesDeleted: number;
  recoveryCodesDeleted: number;
  sessionsDeleted: number;
  signingKeysRetired: number;
}

const emptyResult = (): CleanupResult => ({
  lockAcquired: false,
  sessionsEnded: 0,
  authenticationAttemptsDeleted: 0,
  mfaChallengesDeleted: 0,
  rateLimitBucketsDeleted: 0,
  invitesDeleted: 0,
  recoveryCodesDeleted: 0,
  sessionsDeleted: 0,
  signingKeysRetired: 0,
});

const hours = (value: number) => value * 60 * 60 * 1000;
const days = (value: number) => value * 24 * hours(1);

function audit(action: AuditEventInput['action'], targetId: string | null, now: Date, context: RequestContext, metadata: Record<string, number>): AuditEventInput {
  return { correlationId: context.correlationId, actorUserId: null, action, targetType: action === 'key.retired' ? 'signing_key' : 'auth_data', targetId, result: 'succeeded', reason: null, metadata, context, occurredAt: now };
}

async function count(tx: AuthTransaction, sql: string, values: unknown[]): Promise<number> {
  const result = await tx.query(sql, values);
  return result.rowCount ?? 0;
}

/**
 * Removes only data whose security lifetime has ended.  Every mutation and its
 * audit trail share one transaction: an audit failure therefore leaves no
 * partially-cleaned state behind.
 */
export async function cleanupAuthData(input: { database: AuthDatabase; now: Date; context: RequestContext }): Promise<CleanupResult> {
  return input.database.transaction(async (tx) => {
    const locked = await tx.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired",
      ['timeline-auth:cleanup'],
    );
    if (!locked.rows[0]?.acquired) return emptyResult();

    const now = input.now;
    const attemptCutoff = new Date(now.getTime() - hours(24));
    const inviteCutoff = new Date(now.getTime() - days(30));
    const longCutoff = new Date(now.getTime() - days(90));
    const result = { ...emptyResult(), lockAcquired: true };

    // A session with no usable refresh token cannot be refreshed again.  Keep
    // consumed tokens while it remains live so reuse detection still works.
    result.sessionsEnded = await count(tx, `UPDATE sessions s SET ended_at=$1
      WHERE s.revoked_at IS NULL AND s.ended_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM refresh_tokens r WHERE r.session_id=s.id AND r.consumed_at IS NULL AND r.expires_at>$1)`, [now]);
    result.mfaChallengesDeleted = await count(tx, `DELETE FROM mfa_challenges c
      WHERE COALESCE(c.consumed_at, c.invalidated_at, c.expires_at) <= $1
        OR EXISTS (SELECT 1 FROM authentication_attempts a WHERE a.id=c.attempt_id AND COALESCE(a.consumed_at, a.invalidated_at, a.expires_at) <= $1)`, [attemptCutoff]);
    result.authenticationAttemptsDeleted = await count(tx, `DELETE FROM authentication_attempts
      WHERE COALESCE(consumed_at, invalidated_at, expires_at) <= $1`, [attemptCutoff]);
    result.rateLimitBucketsDeleted = await count(tx, 'DELETE FROM rate_limit_buckets WHERE window_expires_at <= $1', [attemptCutoff]);
    result.invitesDeleted = await count(tx, `DELETE FROM invites
      WHERE COALESCE(accepted_at, revoked_at, expires_at) <= $1`, [inviteCutoff]);
    result.recoveryCodesDeleted = await count(tx, `DELETE FROM recovery_codes
      WHERE COALESCE(used_at, revoked_at) <= $1`, [longCutoff]);
    result.sessionsDeleted = await count(tx, `DELETE FROM sessions
      WHERE COALESCE(revoked_at, ended_at) <= $1`, [longCutoff]);

    const retired = await tx.query<{ kid: string }>(`UPDATE signing_keys
      SET status='retired', encrypted_private_key=NULL, retired_at=$1
      WHERE status='retiring' AND retire_after <= $1
      RETURNING kid`, [now]);
    result.signingKeysRetired = retired.rowCount ?? 0;

    const events: AuditEventInput[] = retired.rows.map((key) => audit('key.retired', key.kid, now, input.context, {}));
    events.push(audit('cleanup.completed', null, now, input.context, {
      sessionsEnded: result.sessionsEnded,
      authenticationAttemptsDeleted: result.authenticationAttemptsDeleted,
      mfaChallengesDeleted: result.mfaChallengesDeleted,
      rateLimitBucketsDeleted: result.rateLimitBucketsDeleted,
      invitesDeleted: result.invitesDeleted,
      recoveryCodesDeleted: result.recoveryCodesDeleted,
      sessionsDeleted: result.sessionsDeleted,
      signingKeysRetired: result.signingKeysRetired,
    }));
    await insertAuditEvents(tx, events);
    return result;
  });
}

export async function runAuthDataCleanup(database: AuthDatabase, clock: Clock, context: RequestContext): Promise<CleanupResult> {
  return cleanupAuthData({ database, now: clock.now(), context });
}
