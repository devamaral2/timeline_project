export class TaskValidationError extends Error {}

export class TaskNotFoundError extends Error {}

export class TaskOwnershipError extends Error {
  constructor() {
    super("Only the task owner can modify it");
  }
}

export class TaskRevisionConflictError extends Error {}

/** Pai escolhido criaria um ciclo na arvore de subtarefas. */
export class TaskHierarchyError extends Error {}
