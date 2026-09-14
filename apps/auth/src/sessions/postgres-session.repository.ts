import type { AuthDatabase, AuthTransaction } from "../db/client";
import { resolveAccessInTransaction } from "../rbac/postgres-access";
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
  OpenSessionCommand,
  OpenedSession,
  RevokeAllOfUserCommand,
  RevokeAllOfTargetUserCommand,
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

/**
 * Abre a sessao, grava o primeiro refresh token e assina o access token, tudo
 * dentro da transacao de quem chamou. Exportada porque o signup precisa abrir a
 * sessao no mesmo commit em que ativa a conta.
 *
 * O status do usuario e relido com `FOR UPDATE`: um admin que desativa a conta
 * entre a conferencia da senha e este commit ganha a corrida.
 */
export async function openSessionInTransaction(
  tx: AuthTransaction,
  c: OpenSessionCommand & { issuer: string; audience: string },
  sign: SignAccessToken,
): Promise<OpenedSession | "invalid"> {
  const user = (await tx.query<{ status: string }>("SELECT status FROM users WHERE id = $1 FOR UPDATE", [c.userId])).rows[0];
  if (!user || user.status !== "active") return "invalid";
  await tx.query(
    "INSERT INTO sessions (id, user_id, amr, auth_time, initial_ip_address, initial_user_agent, last_used_at, created_at) VALUES ($1, $2, ARRAY['pwd'], $3, $4, $5, $3, $3)",
    [c.sessionId, c.userId, c.now, c.context.ipAddress, c.context.userAgent],
  );
  await tx.query(
    "INSERT INTO refresh_tokens (id, token_hash, session_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
    [c.refreshToken.id, c.refreshToken.hash, c.sessionId, c.refreshToken.expiresAt, c.now],
  );
  const access = await resolveAccessInTransaction(tx, c.userId);
  const key = await lockActiveSigningKey(tx, c.now);
  const accessToken = sign(
    key,
    buildUnsignedAccessTokenClaims({
      iss: c.issuer,
      aud: c.audience,
      sub: c.userId,
      sid: c.sessionId,
      perms: access.permissions,
      denies: access.denies,
      roles: access.roleKeys,
      now: c.now,
    }),
  );
  return { sessionId: c.sessionId, accessToken, access, refreshTokenExpiresAt: c.refreshToken.expiresAt };
}

export class PostgresSessionRepository implements SessionRepository {
  constructor(
    private readonly db: AuthDatabase,
    private readonly issuer: string,
    private readonly audience: string,
  ) {}

  openSession(c: OpenSessionCommand, sign: SignAccessToken): Promise<OpenedSession | "invalid"> {
    return this.db.transaction((tx) => openSessionInTransaction(tx, { ...c, issuer: this.issuer, audience: this.audience }, sign));
  }

  async rotateRefreshToken(c: RotateRefreshTokenCommand, sign: SignAccessToken): Promise<RotateRefreshTokenResult> {
    return this.db.transaction(async (tx) => {
      // Lookup inicial sem lock: so para descobrir qual sessao (e, por ela,
      // qual usuario) o hash aponta — precisamos do userId ANTES de comecar a
      // travar linha, senao nao da para respeitar a ordem abaixo.
      const lookup = await tx.query<{ session_id: string; user_id: string }>(
        "SELECT r.session_id, s.user_id FROM refresh_tokens r JOIN sessions s ON s.id = r.session_id WHERE r.token_hash = $1",
        [c.presentedTokenHash],
      );
      const found = lookup.rows[0];
      if (!found) return { kind: "invalid" };
      const { session_id: sessionId, user_id: userId } = found;

      // Ordem estavel de lock — a MESMA usada por revokeAllOfUser — usuario
      // -> sessao -> refresh token. Nao e cosmetico: um refresh e um
      // logout-all no mesmo usuario podem rodar em paralelo, e se cada
      // operacao travasse essas linhas em ordem diferente o Postgres
      // resolveria a corrida abortando uma delas com deadlock detected em vez
      // de so uma esperar a outra.
      const userRow = (
        await tx.query<{ status: string }>("SELECT status FROM users WHERE id = $1 FOR UPDATE", [userId])
      ).rows[0];

      const sessionRow = (
        await tx.query<SessionRow>("SELECT * FROM sessions WHERE id = $1 FOR UPDATE", [sessionId])
      ).rows[0];
      if (!sessionRow) return { kind: "invalid" };

      const refreshRow = (
        await tx.query<RefreshTokenRow>("SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE", [
          c.presentedTokenHash,
        ])
      ).rows[0];
      if (!refreshRow) return { kind: "invalid" };

      if (refreshRow.consumed_at) {
        if (!sessionRow.revoked_at) {
          await tx.query("UPDATE sessions SET revoked_at = $1, ended_at = $1 WHERE id = $2", [c.now, sessionId]);
        }
        return { kind: "reused" };
      }

      const expired = new Date(refreshRow.expires_at) <= c.now;
      const userInactive = !userRow || userRow.status !== "active";
      if (expired || sessionRow.revoked_at || userInactive) {
        if (!sessionRow.revoked_at) {
          await tx.query("UPDATE sessions SET revoked_at = $1, ended_at = $1 WHERE id = $2", [c.now, sessionId]);
        }
        return { kind: "invalid" };
      }

      // O sucessor entra antes do UPDATE: `successor_id` e FK para
      // refresh_tokens(id) e nao e deferrable, entao apontar para uma linha
      // que ainda nao existe aborta a transacao inteira.
      await tx.query(
        "INSERT INTO refresh_tokens (id, token_hash, session_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
        [c.successor.id, c.successor.hash, sessionId, c.successor.expiresAt, c.successor.issuedAt],
      );
      await tx.query("UPDATE refresh_tokens SET consumed_at = $1, successor_id = $2 WHERE id = $3", [
        c.now,
        c.successor.id,
        refreshRow.id,
      ]);
      await tx.query("UPDATE sessions SET last_used_at = $1 WHERE id = $2", [c.now, sessionId]);

      // A versao anterior deste metodo so lia user_roles e cravava
      // `permissions:[]`/`denies:[]` no token — o mesmo atalho que
      // completeInviteEnrollment ainda usa hoje. Prefiro nao repetir esse
      // atalho aqui: e exatamente o ponto que a issue chamava de "releia
      // RBAC", e um access token de 15 minutos com permissoes desatualizadas
      // e o tipo de bug que so aparece semanas depois, quando alguem revoga
      // uma permissao e o usuario continua agindo com ela. Repito a mesma
      // consulta que PostgresRbacRepository.resolvedAccessOf faz, so que
      // dentro desta transacao (o repositorio de RBAC so aceita AuthDatabase,
      // nao AuthTransaction, entao nao dava para reusa-lo direto aqui).
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

      // A versao anterior fazia `SELECT kid, encrypted_private_key FROM
      // signing_keys WHERE status='active' FOR UPDATE` na mao — o mesmo texto
      // que completeInviteEnrollment ainda tem. Troquei pelo helper que o
      // proprio modulo de crypto ja expoe: `lockActiveSigningKey` usa
      // `FOR KEY SHARE` (varias rotacoes simultaneas nao brigam por essa
      // linha, so brigam com uma rotacao de chave em andamento) atras de um
      // advisory lock, e atualiza `last_used_at` — informacao que
      // `rotate-signing-key.cli.ts` usa para saber quando pode aposentar a
      // chave antiga. A query manual nunca tocava esse campo.
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
          now: c.now,
        }),
      );

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
      const result = await tx.query(
        `UPDATE sessions s SET revoked_at = $1, ended_at = $1
         FROM refresh_tokens r
         WHERE r.session_id = s.id AND r.token_hash = $2 AND s.revoked_at IS NULL`,
        [c.now, c.presentedTokenHash],
      );
      return (result.rowCount ?? 0) > 0;
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
      return result.rowCount ?? 0;
    });
  }

  async revokeAllOfTargetUser(c: RevokeAllOfTargetUserCommand): Promise<number | "not_found"> {
    return this.db.transaction(async (tx) => {
      // Mesma ordem de lock do rotate e do logout-all: usuario -> sessao.
      const target = (await tx.query<{ id: string }>("SELECT id FROM users WHERE id = $1 FOR UPDATE", [c.targetUserId])).rows[0];
      if (!target) return "not_found" as const;
      const result = await tx.query("UPDATE sessions SET revoked_at = $1, ended_at = $1 WHERE user_id = $2 AND revoked_at IS NULL", [c.now, c.targetUserId]);
      return result.rowCount ?? 0;
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
