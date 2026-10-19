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

/** Cancelamento explícito antes do commit; desconectar não cancela um job. */
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

/** Preserves the HTTP status for bounded queue retries, without storing provider bodies. */
export class LlmHttpError extends Error {
  constructor(readonly status: number) {
    super(`OpenRouter request failed with status ${status}`);
    this.name = "LlmHttpError";
  }
}

/** O corpo da requisição não é utilizável. */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

/**
 * Uma etapa do pipeline rapido (planejador ou especialista) estourou o orcamento de tempo ou
 * respondeu algo inutilizavel. Nada foi gravado. Nao e retentavel de proposito: refazer o turno
 * inteiro e o que travava a fila do usuario por minutos. Quando vem de HTTP 429/5xx carrega o
 * `status`, que o `AiJobsService` trata como transitorio.
 */
export class FastStageError extends Error {
  constructor(
    readonly stage: "planner" | "specialist",
    readonly reason: "timeout" | "provider" | "invalid",
    readonly status?: number,
  ) {
    super("Não consegui processar o pedido a tempo. Tente de novo em instantes.");
    this.name = "FastStageError";
  }
}
