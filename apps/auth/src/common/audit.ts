/**
 * Trilha de auditoria. Um servico de autenticacao sem ela nao consegue
 * responder a unica pergunta que importa depois de um incidente: quem entrou,
 * de onde, e quem deu acesso a que.
 *
 * Escreve em tabela propria, append-only. Nada de segredo entra aqui — nem
 * codigo de 2FA, nem token, nem hash de senha.
 */
export type AuditAction =
  | "login.succeeded"
  | "login.failed"
  | "login.unknown_identity"
  | "mfa.sent"
  | "mfa.verified"
  | "mfa.failed"
  | "token.refreshed"
  | "token.reuse_detected"
  | "session.revoked"
  | "invite.created"
  | "invite.accepted"
  | "invite.revoked"
  | "access.changed"
  | "grant.created"
  | "grant.revoked"
  | "key.rotated";

export interface AuditEntry {
  id: string;
  /** Quem fez. Nulo quando a acao falhou antes de identificar alguem. */
  actorUserId: string | null;
  action: AuditAction;
  /** Sobre quem/o que: id de usuario, de convite, de concessao. */
  target: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditLog {
  record(entry: AuditEntry): Promise<void>;
  list(params: { limit: number; actorUserId?: string }): Promise<AuditEntry[]>;
}
