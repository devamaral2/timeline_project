/**
 * Erro de validacao de dominio: payload de TaskItem invalido, versao de
 * schema nao suportada, tipos incompativeis no mesmo Task, etc.
 */
export class TaskValidationError extends Error {}

export class TaskNotFoundError extends Error {}

export class TaskOwnershipError extends Error {
  constructor() {
    super("Only the task owner can modify it");
  }
}

export class TaskRevisionConflictError extends Error {}
