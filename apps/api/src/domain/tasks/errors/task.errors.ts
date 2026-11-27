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

/** A tarefa nao aceita situacao: e de pessoa, e passo ou execucao agendada, ou ainda esta aberta. */
export class TaskSituationNotAllowedError extends Error {
  constructor() {
    super("The task does not take a situation");
  }
}
