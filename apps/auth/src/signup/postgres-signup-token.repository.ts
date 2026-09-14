import type { AuthDatabase, AuthTransaction } from "../db/client";
import type {
  CreatePendingAdminCommand,
  ReissueSignupTokenCommand,
  ReissueSignupTokenOutcome,
  RevokeSignupTokenCommand,
  SignupTokenRepository,
  SignupTokenWrite,
} from "./ports/signup-token-repository";

async function insertToken(tx: AuthTransaction, userId: string, token: SignupTokenWrite, now: Date): Promise<void> {
  await tx.query(
    "INSERT INTO signup_tokens (id, jti, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)",
    [token.id, token.jti, userId, token.expiresAt, now],
  );
}

async function revokeOpen(tx: AuthTransaction, userId: string, now: Date): Promise<number> {
  const result = await tx.query("UPDATE signup_tokens SET revoked_at = $1 WHERE user_id = $2 AND consumed_at IS NULL AND revoked_at IS NULL", [now, userId]);
  return result.rowCount ?? 0;
}

/**
 * Consome o token de signup dentro da transacao de quem chamou. So passa um
 * token com esse `jti`, desse usuario, ainda aberto e nao vencido. O `UPDATE`
 * condicional e a trava: duas requisicoes com o mesmo token disputam a mesma
 * linha e so uma encontra `consumed_at IS NULL`.
 */
export async function consumeSignupTokenInTransaction(tx: AuthTransaction, input: { jti: string; userId: string; now: Date }): Promise<boolean> {
  const result = await tx.query(
    "UPDATE signup_tokens SET consumed_at = $1 WHERE jti = $2 AND user_id = $3 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $1",
    [input.now, input.jti, input.userId],
  );
  return (result.rowCount ?? 0) === 1;
}

export class PostgresSignupTokenRepository implements SignupTokenRepository {
  constructor(private readonly db: AuthDatabase) {}

  createPendingAdmin(c: CreatePendingAdminCommand): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO users (id, name, status, created_at, updated_at) VALUES ($1, $2, 'pending_sign_up', $3, $3)",
        [c.userId, c.placeholderName, c.now],
      );
      await insertToken(tx, c.userId, c.token, c.now);
    });
  }

  reissue(c: ReissueSignupTokenCommand): Promise<ReissueSignupTokenOutcome> {
    return this.db.transaction(async (tx) => {
      const user = (await tx.query<{ status: string }>("SELECT status FROM users WHERE id = $1 FOR UPDATE", [c.userId])).rows[0];
      if (!user) return "not_found" as const;
      if (user.status !== "pending_sign_up") return "not_pending" as const;
      await revokeOpen(tx, c.userId, c.now);
      await insertToken(tx, c.userId, c.token, c.now);
      return "reissued" as const;
    });
  }

  revoke(c: RevokeSignupTokenCommand): Promise<boolean> {
    return this.db.transaction(async (tx) => (await revokeOpen(tx, c.userId, c.now)) > 0);
  }
}
