/**
 * Erro de validacao de dominio: payload de EventItem invalido, versao de
 * schema nao suportada, tipos incompativeis no mesmo Event, etc.
 */
export class EventValidationError extends Error {}

export class EventNotFoundError extends Error {}

export class EventOwnershipError extends Error {
  constructor() {
    super("Only the event owner can modify it");
  }
}

export class EventRevisionConflictError extends Error {}
