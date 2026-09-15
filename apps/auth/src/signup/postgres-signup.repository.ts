import type { DatabaseError } from "pg";
import type { SignAccessToken } from "../crypto/jwt";
import type { AuthDatabase } from "../db/client";
import { openSessionInTransaction } from "../sessions/postgres-session.repository";
import type { CompleteSignupCommand, CompleteSignupOutcome, SignupRepository } from "./ports/signup-repository";
import { consumeSignupTokenInTransaction } from "./postgres-signup-token.repository";

/** `AuthDatabase.transaction` so desfaz quando o callback lanca. */
class Rollback extends Error {
  constructor(readonly outcome: CompleteSignupOutcome) { super("signup rolled back"); }
}

function uniqueViolation(error: unknown): "email_taken" | "phone_taken" | null {
  const pg = error as Partial<DatabaseError>;
  if (pg?.code !== "23505") return null;
  if (pg.constraint === "users_phone_unique") return "phone_taken";
  if (pg.constraint?.includes("email")) return "email_taken";
  return null;
}

export class PostgresSignupRepository implements SignupRepository {
  constructor(private readonly db: AuthDatabase, private readonly issuer: string, private readonly audience: string) {}

  /**
   * Tudo num commit so, nesta ordem:
   *
   * 1. consome o `jti` (UPDATE condicional — a segunda requisicao com o mesmo
   *    token espera o lock da linha e depois nao encontra mais `consumed_at IS NULL`);
   * 2. ativa a conta com `UPDATE ... WHERE status = 'pending_sign_up'`, sem
   *    ler antes: zero linhas afetadas e falha, nunca "leu pendente, gravou ativo";
   * 3. concede `admin`;
   * 4. abre a sessao e assina o token de usuario.
   *
   * Qualquer passo que falhe desfaz os anteriores, inclusive o consumo do token:
   * um email ja usado nao queima o link.
   */
  async completeSignup(c: CompleteSignupCommand, sign: SignAccessToken): Promise<CompleteSignupOutcome> {
    try {
      return await this.db.transaction(async (tx) => {
        if (!(await consumeSignupTokenInTransaction(tx, { jti: c.tokenJti, userId: c.userId, now: c.now }))) throw new Rollback({ kind: "invalid" });

        let activated: number;
        try {
          const result = await tx.query(
            "UPDATE users SET status = 'active', email = $2, phone = $3, name = $4, password_hash = $5, updated_at = $6 WHERE id = $1 AND status = 'pending_sign_up'",
            [c.userId, c.email, c.phone, c.name, c.passwordHash, c.now],
          );
          activated = result.rowCount ?? 0;
        } catch (error) {
          const taken = uniqueViolation(error);
          if (taken) throw new Rollback({ kind: taken });
          throw error;
        }
        if (activated !== 1) throw new Rollback({ kind: "invalid" });

        await tx.query("INSERT INTO user_roles (user_id, role_key) VALUES ($1, 'admin') ON CONFLICT DO NOTHING", [c.userId]);
        const session = await openSessionInTransaction(tx, {
          userId: c.userId,
          sessionId: c.session.id,
          refreshToken: c.session.refreshToken,
          now: c.now,
          context: c.context,
          issuer: this.issuer,
          audience: this.audience,
        }, sign);
        if (session === "invalid") throw new Rollback({ kind: "invalid" });
        return { kind: "completed" as const, session };
      });
    } catch (error) {
      if (error instanceof Rollback) return error.outcome;
      throw error;
    }
  }
}
