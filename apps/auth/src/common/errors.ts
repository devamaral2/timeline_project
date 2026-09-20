/**
 * Os erros de dominio do auth. Quem os traduz para HTTP e o
 * `AuthExceptionFilter` — nenhum usecase conhece status code.
 *
 * A regra que atravessa todos eles: **a mensagem que o usuario ve nao diz o que
 * deu errado**. "Email nao existe" e "senha errada" precisam ser indistinguiveis
 * do lado de fora, senao o formulario de login vira uma consulta de quem tem
 * conta aqui. O motivo real vai para o log e para a auditoria.
 */
export type SemanticInputCode =
  | "password_length"
  | "password_control"
  | "password_context"
  | "password_compromised"
  | "invalid_phone"
  | "channel_unavailable";

export type ConflictCode =
  | "email_already_exists"
  | "invalid_status_transition"
  | "would_remove_last_admin"
  | "already_initialized";

export class AuthenticationFailedError extends Error {
  constructor(readonly internalReason: string) {
    super("authentication failed");
  }
}

export class AccessDeniedError extends Error {}

export class SemanticInputError extends Error {
  constructor(readonly safeCode: SemanticInputCode) {
    super(safeCode);
  }
}

export class ConflictError extends Error {
  constructor(readonly safeCode: ConflictCode) {
    super(safeCode);
  }
}

export class NotFoundError extends Error {}

export class RateLimitedError extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    readonly internalReason: string,
  ) {
    super("rate limited");
  }
}

export class RequiredDependencyUnavailableError extends Error {
  constructor(readonly internalReason: string, options?: ErrorOptions) {
    super("required dependency unavailable", options);
  }
}
