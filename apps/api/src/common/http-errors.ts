/**
 * Erros de request que nascem fora da borda HTTP: validacao de forma, alvo
 * inexistente, dono diferente, conflito de revisao. Carregam o status para que
 * o filtro atual (Nest) ou o error handler do Fastify traduzam sem que o
 * dominio, os casos de uso ou a infraestrutura conheçam o framework.
 *
 * A mensagem continua sendo o corpo `{ error }` que os clientes ja recebem.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad Request") {
    super(400, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden resource") {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not Found") {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict") {
    super(409, message);
  }
}
