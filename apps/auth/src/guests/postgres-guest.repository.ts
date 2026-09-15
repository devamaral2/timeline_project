import { buildUnsignedGuestTokenClaims, type MintToken } from "../crypto/jwt";
import { lockActiveSigningKey } from "../crypto/postgres-signing-key.repository";
import type { AuthDatabase } from "../db/client";
import { resolveAccessInTransaction } from "../rbac/postgres-access";
import { coversSuperAdmin } from "../rbac/resolve-user-permissions";
import type { GuestRepository, IssueGuestCommand, IssueGuestOutcome } from "./ports/guest-repository";

export class PostgresGuestRepository implements GuestRepository {
  constructor(private readonly db: AuthDatabase) {}

  /**
   * Um commit: confere o emissor e o alvo sob lock, cria a linha guest com o
   * papel `guest` e assina o token com as permissoes que esse papel da agora.
   *
   * O emissor e relido do banco — o `perms` do bearer tem ate 15 minutos. O
   * alvo e travado com `FOR SHARE` para nao sair de `active` no meio da
   * emissao; `observes_user_id` e a fonte de verdade que o `subj` so repete.
   */
  issueGuest(c: IssueGuestCommand, mint: MintToken): Promise<IssueGuestOutcome> {
    return this.db.transaction(async (tx) => {
      const issuer = (await tx.query<{ status: string }>(
        "SELECT u.status FROM users u JOIN sessions s ON s.user_id = u.id WHERE u.id = $1 AND s.id = $2 AND s.revoked_at IS NULL FOR SHARE OF u",
        [c.issuerUserId, c.issuerSessionId],
      )).rows[0];
      if (!issuer || issuer.status !== "active" || !coversSuperAdmin(await resolveAccessInTransaction(tx, c.issuerUserId))) return { kind: "issuer_not_admin" as const };

      const subject = (await tx.query<{ status: string }>("SELECT status FROM users WHERE id = $1 FOR SHARE", [c.subjectUserId])).rows[0];
      if (!subject) return { kind: "subject_not_found" as const };
      if (subject.status !== "active") return { kind: "subject_not_eligible" as const };

      await tx.query(
        "INSERT INTO users (id, name, status, observes_user_id, created_at, updated_at) VALUES ($1, $2, 'guest', $3, $4, $4)",
        [c.guestId, c.guestName, c.subjectUserId, c.now],
      );
      await tx.query("INSERT INTO user_roles (user_id, role_key) VALUES ($1, 'guest')", [c.guestId]);
      const access = await resolveAccessInTransaction(tx, c.guestId);
      const key = await lockActiveSigningKey(tx, c.now);
      const claims = buildUnsignedGuestTokenClaims({ iss: c.issuer, aud: c.audience, sub: c.guestId, subj: c.subjectUserId, perms: access.permissions, now: c.now });
      const { token, jti } = mint(key, claims);
      return { kind: "issued" as const, guestId: c.guestId, token, jti, expiresAt: new Date(claims.exp * 1000) };
    });
  }

  async deleteGuest(guestId: string): Promise<boolean> {
    const result = await this.db.query("DELETE FROM users WHERE id = $1 AND status = 'guest'", [guestId]);
    return (result.rowCount ?? 0) > 0;
  }
}
