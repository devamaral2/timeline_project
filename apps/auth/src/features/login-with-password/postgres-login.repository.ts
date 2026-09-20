import { randomUUID } from "node:crypto";
import type { AuthDatabase, AuthTransaction } from "../../db/client";
import type { SignAccessToken } from "../../auth-core/security/jwt";
import type { AuditEventInput } from "../../audit/audit-event";
import type { NewSessionWrite, ResolvedAccess } from "../../domain/users/user";
import { buildUnsignedAccessTokenClaims } from "../../auth-core/security/jwt";
import { resolveAccessInTransaction } from "../../auth-core/persistence/postgres-access";

export interface SessionCommit {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshTokenExpiresAt: Date;
  access: ResolvedAccess;
}

export interface CompleteLoginCommand {
  userId: string;
  newSession: NewSessionWrite;
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface AuthenticationRepository {
  completeLogin(command: CompleteLoginCommand, sign: SignAccessToken): Promise<SessionCommit | "invalid">;
}

async function audit(tx: AuthTransaction, events: readonly import("../../audit/audit-event").AuditEventInput[]) {
  for (const event of events) {
    await tx.query(
      "INSERT INTO audit_log(id,correlation_id,actor_user_id,action,target_type,target_id,result,reason,metadata,ip_address,user_agent,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [randomUUID(), event.correlationId, event.actorUserId, event.action, event.targetType, event.targetId, event.result, event.reason, event.metadata, event.context.ipAddress, event.context.userAgent, event.occurredAt],
    );
  }
}

export class PostgresLoginRepository implements AuthenticationRepository {
  constructor(private readonly db: AuthDatabase, private readonly issuer: string, private readonly audience: string) {}

  async completeLogin(command: CompleteLoginCommand, sign: SignAccessToken): Promise<SessionCommit | "invalid"> {
    return this.db.transaction(async (tx) => {
      const user = (await tx.query<{ status: string }>("SELECT status FROM users WHERE id=$1 AND status='active' FOR UPDATE", [command.userId])).rows[0];
      if (!user) return "invalid" as const;

      await tx.query(
        "INSERT INTO sessions(id,user_id,amr,auth_time,initial_ip_address,initial_user_agent,last_used_at,created_at) VALUES($1,$2,$3,$4,$5,$6,$4,$4)",
        [command.newSession.id, command.userId, command.newSession.amr, command.newSession.authTime, command.newSession.context.ipAddress, command.newSession.context.userAgent],
      );
      await tx.query(
        "INSERT INTO refresh_tokens(id,token_hash,session_id,expires_at,created_at) VALUES($1,$2,$3,$4,$5)",
        [command.newSession.refreshToken.id, command.newSession.refreshToken.hash, command.newSession.id, command.newSession.refreshToken.expiresAt, command.newSession.issuedAt],
      );

      const access = await resolveAccessInTransaction(tx, command.userId);
      const keyRow = (await tx.query<{ kid: string; encrypted_private_key: string | null }>("SELECT kid,encrypted_private_key FROM signing_keys WHERE status='active' FOR UPDATE")).rows[0];
      if (!keyRow || typeof keyRow.encrypted_private_key !== "string") throw new Error("no signing key");
      const key = { kid: keyRow.kid, encryptedPrivateKey: keyRow.encrypted_private_key };
      const accessToken = sign(key, buildUnsignedAccessTokenClaims({
        iss: this.issuer,
        aud: this.audience,
        sub: command.userId,
        sid: command.newSession.id,
        perms: access.permissions,
        denies: access.denies,
        roles: access.roleKeys,
        amr: [...command.newSession.amr],
        auth_time: Math.floor(command.newSession.authTime.getTime() / 1000),
        now: command.now,
      }));
      await audit(tx, command.auditEvents);
      return { userId: command.userId, sessionId: command.newSession.id, accessToken, refreshTokenExpiresAt: command.newSession.refreshToken.expiresAt, access };
    });
  }
}
