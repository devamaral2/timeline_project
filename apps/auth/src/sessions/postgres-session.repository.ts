import type { AuditAction, AuditEventInput, AuditMetadataValue } from "../audit/audit-event";
import { insertAuditEvents } from "../audit/postgres-audit-log";
import type { RequestContext } from "../common/request-context";
import type { AuthDatabase } from "../db/client";
import { lockActiveSigningKey } from "../crypto/postgres-signing-key.repository";
import { buildUnsignedAccessTokenClaims, type SignAccessToken } from "../crypto/jwt";
import { AuthenticationFailedError } from "../common/errors";
import type { DirectPermission } from "../rbac/effective-permissions";
import { resolveUserPermissions } from "../rbac/resolve-user-permissions";
import type { Permission } from "../rbac/permissions";
import type { AuthenticationMethod } from "../users/user";
import type { Session } from "./session";
import type {
  FindActiveSessionQuery,
  RevokeAllOfUserCommand,
  RevokeByRefreshTokenCommand,
  RotateRefreshTokenCommand,
  RotateRefreshTokenResult,
  SessionRepository,
} from "./ports/session-repository";

interface SessionRow {
  id: string;
  user_id: string;
  amr: AuthenticationMethod[];
  auth_time: Date;
  initial_ip_address: string | null;
  initial_user_agent: string | null;
  last_used_at: Date;
  revoked_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
}

interface RefreshTokenRow {
  id: string;
  expires_at: Date;
  consumed_at: Date | null;
}

function sessionFromRow(row: SessionRow, lastUsedAt: Date): Session {
  return {
    id: row.id,
    userId: row.user_id,
    amr: row.amr,
    authTime: row.auth_time,
    initialIpAddress: row.initial_ip_address,
    initialUserAgent: row.initial_user_agent,
    lastUsedAt,
    revokedAt: row.revoked_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

function sessionAuditEvent(
  context: RequestContext,
  now: Date,
  userId: string,
  sessionId: string,
  action: AuditAction,
  reason: string | null,
  metadata: Readonly<Record<string, AuditMetadataValue>> = {},
): AuditEventInput {
  return {
    correlationId: context.correlationId,
    actorUserId: userId,
    action,
    targetType: "session",
    targetId: sessionId,
    result: "succeeded",
    reason,
    metadata,
    context,
    occurredAt: now,
  };
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(
    private readonly db: AuthDatabase,
    private readonly issuer: string,
    private readonly audience: string,
  ) {}

  async rotateRefreshToken(c: RotateRefreshTokenCommand, sign: SignAccessToken): Promise<RotateRefreshTokenResult> {
    return this.db.transaction(async (tx) => {
      // Lookup inicial sem lock: so para descobrir qual sessao o hash aponta.
      const lookup = await tx.query<{ session_id: string }>(
        "SELECT session_id FROM refresh_tokens WHERE token_hash = $1",
        [c.presentedTokenHash],
      );
      const sessionId = lookup.rows[0]?.session_id;
      if (!sessionId) return { kind: "invalid" };

      // Ordem estavel de lock, para nao colidir com revokeAllOfUser nem com
      // outra rotacao concorrente: usuario -> sessao -> refresh token.
      const sessionRow = (
        await tx.query<SessionRow>("SELECT * FROM sessions WHERE id = $1 FOR UPDATE", [sessionId])
      ).rows[0];
      if (!sessionRow) return { kind: "invalid" };

      const userRow = (
        await tx.query<{ status: string }>("SELECT status FROM users WHERE id = $1 FOR UPDATE", [sessionRow.user_id])
      ).rows[0];

      const refreshRow = (
        await tx.query<RefreshTokenRow>("SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE", [
          c.presentedTokenHash,
        ])
      ).rows[0];
      if (!refreshRow) return { kind: "invalid" };

      if (refreshRow.consumed_at) {
        if (!sessionRow.revoked_at) {
          await tx.query("UPDATE sessions SET revoked_at = $1, ended_at = $1 WHERE id = $2", [c.now, sessionId]);
          await insertAuditEvents(tx, [
            sessionAuditEvent(c.context, c.now, sessionRow.user_id, sessionId, "token.reuse_detected", "refresh_token_reused"),
          ]);
        }
        return { kind: "reused" };
      }

      const expired = new Date(refreshRow.expires_at) <= c.now;
      const userInactive = !userRow || userRow.status !== "active";
      if (expired || sessionRow.revoked_at || userInactive) {
        if (!sessionRow.revoked_at) {
          await tx.query("UPDATE sessions SET revoked_at = $1, ended_at = $1 WHERE id = $2", [c.now, sessionId]);
          await insertAuditEvents(tx, [
            sessionAuditEvent(
              c.context,
              c.now,
              sessionRow.user_id,
              sessionId,
              "session.revoked",
              userInactive ? "user_inactive" : "refresh_token_expired",
            ),
          ]);
        }
        return { kind: "invalid" };
      }

      await tx.query("UPDATE refresh_tokens SET consumed_at = $1, successor_id = $2 WHERE id = $3", [
        c.now,
        c.successor.id,
        refreshRow.id,
      ]);
      await tx.query(
        "INSERT INTO refresh_tokens (id, token_hash, session_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
        [c.successor.id, c.successor.hash, sessionId, c.successor.expiresAt, c.successor.issuedAt],
      );
      await tx.query("UPDATE sessions SET last_used_at = $1 WHERE id = $2", [c.now, sessionId]);

      const roleKeys = (
        await tx.query<{ role_key: string }>("SELECT role_key FROM user_roles WHERE user_id = $1 ORDER BY role_key", [
          sessionRow.user_id,
        ])
      ).rows.map((row) => row.role_key);
      const rolePermissions = roleKeys.length
        ? (
            await tx.query<{ permission: Permission }>(
              "SELECT DISTINCT permission FROM role_permissions WHERE role_key = ANY($1)",
              [roleKeys],
            )
          ).rows.map((row) => row.permission)
        : [];
      const directPermissions = (
        await tx.query<DirectPermission>("SELECT permission, effect FROM user_permissions WHERE user_id = $1", [
          sessionRow.user_id,
        ])
      ).rows;
      const access = resolveUserPermissions(roleKeys, { rolePermissions, directPermissions });

      const key = await lockActiveSigningKey(tx, c.now);
      const accessToken = sign(
        key,
        buildUnsignedAccessTokenClaims({
          iss: this.issuer,
          aud: this.audience,
          sub: sessionRow.user_id,
          sid: sessionId,
          perms: access.permissions,
          denies: access.denies,
          roles: access.roleKeys,
          amr: sessionRow.amr,
          auth_time: Math.floor(new Date(sessionRow.auth_time).getTime() / 1000),
          now: c.now,
        }),
      );

      await insertAuditEvents(tx, [sessionAuditEvent(c.context, c.now, sessionRow.user_id, sessionId, "session.refreshed", null)]);

      return {
        kind: "rotated",
        accessToken,
        access,
        session: sessionFromRow(sessionRow, c.now),
        refreshTokenExpiresAt: c.successor.expiresAt,
      };
    });
  }

  async revokeByRefreshToken(c: RevokeByRefreshTokenCommand): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const result = await tx.query<{ id: string; user_id: string }>(
        `UPDATE sessions s SET revoked_at = $1, ended_at = $1
         FROM refresh_tokens r
         WHERE r.session_id = s.id AND r.token_hash = $2 AND s.revoked_at IS NULL
         RETURNING s.id, s.user_id`,
        [c.now, c.presentedTokenHash],
      );
      const revoked = result.rows[0];
      if (!revoked) return false;
      await insertAuditEvents(tx, [
        sessionAuditEvent(c.context, c.now, revoked.user_id, revoked.id, "session.revoked", "logout"),
      ]);
      return true;
    });
  }

  async revokeAllOfUser(c: RevokeAllOfUserCommand): Promise<number> {
    return this.db.transaction(async (tx) => {
      // Mesma ordem de lock do rotate: usuario -> sessao. Um bearer ainda
      // criptograficamente valido nao pode revogar tudo se a sua propria
      // sessao (ou o usuario) ja nao estiver ativa.
      const userRow = (
        await tx.query<{ status: string }>("SELECT status FROM users WHERE id = $1 FOR UPDATE", [c.actor.userId])
      ).rows[0];
      if (!userRow || userRow.status !== "active") throw new AuthenticationFailedError("user not active");

      const sessionRow = (
        await tx.query<{ revoked_at: Date | null }>(
          "SELECT revoked_at FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE",
          [c.actor.sessionId, c.actor.userId],
        )
      ).rows[0];
      if (!sessionRow || sessionRow.revoked_at) throw new AuthenticationFailedError("session not active");

      const result = await tx.query(
        "UPDATE sessions SET revoked_at = $1, ended_at = $1 WHERE user_id = $2 AND revoked_at IS NULL",
        [c.now, c.actor.userId],
      );
      const count = result.rowCount ?? 0;
      if (count > 0) {
        await insertAuditEvents(tx, [
          sessionAuditEvent(c.context, c.now, c.actor.userId, c.actor.sessionId, "session.revoked_all", null, { count }),
        ]);
      }
      return count;
    });
  }

  async findActiveSession(query: FindActiveSessionQuery): Promise<Session | null> {
    const result = await this.db.query<SessionRow>(
      "SELECT * FROM sessions WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL",
      [query.sessionId, query.userId],
    );
    const row = result.rows[0];
    return row ? sessionFromRow(row, row.last_used_at) : null;
  }
}
