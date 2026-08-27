/** O agente rodou, mas não conseguiu registrar nenhum evento a partir do texto. */
export class EventAgentUndecidedError extends Error {
  constructor(message = "Não foi possível identificar um evento nesse texto") {
    super(message);
    this.name = "EventAgentUndecidedError";
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
