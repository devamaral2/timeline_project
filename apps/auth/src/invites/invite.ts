/**
 * O convite e a unica porta de entrada. Ele carrega o usuario ja criado em
 * `pending_invite` com o RBAC inteiro montado pelo admin — o aceite so preenche
 * senha e telefone, nunca decide acesso.
 *
 * O banco guarda so o hash do token, como qualquer segredo opaco: um dump nao
 * entrega convites utilizaveis.
 */
export interface Invite {
  id: string;
  /** Email para o qual o convite foi emitido, ja normalizado. */
  email: string;
  tokenHash: string;
  /** O usuario `pending_invite` criado junto. */
  userId: string;
  invitedBy: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export type InviteRejection = "not-found" | "expired" | "already-accepted" | "revoked";

/**
 * Diz por que um convite nao serve. O motivo e util no log e na tela do admin;
 * para quem clicou no link, tudo isso vira a mesma resposta generica.
 */
export function inviteRejection(invite: Invite | null, now: Date): InviteRejection | null {
  if (!invite) return "not-found";
  if (invite.revokedAt !== null) return "revoked";
  if (invite.acceptedAt !== null) return "already-accepted";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return null;
}
