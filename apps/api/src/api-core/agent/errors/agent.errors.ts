/** O ator não pode agir sobre os dados do usuário alvo. */
export class AgentTargetForbiddenError extends Error {
  constructor(message = "Sem permissão para acessar os dados deste usuário") {
    super(message);
    this.name = "AgentTargetForbiddenError";
  }
}

/** O agente bateu no teto de passos ou custo com mudanças pela metade; nada foi gravado. */
export class AgentLimitReachedError extends Error {
  constructor(
    message = "O pedido ficou grande demais para uma requisição e nada foi gravado. Divida em partes menores.",
  ) {
    super(message);
    this.name = "AgentLimitReachedError";
  }
}

/** Quem pediu cancelou (ou a conexão caiu) antes do commit; nada foi gravado. */
export class AgentRunCancelledError extends Error {
  constructor(message = "Pedido cancelado antes de gravar") {
    super(message);
    this.name = "AgentRunCancelledError";
  }
}

/** O provedor de LLM falhou ou não está configurado. */
export class LlmUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "LlmUnavailableError";
  }
}

/** O corpo da requisição não é utilizável. */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}
