/** Algo mudou entre preparar e gravar o lote; nada foi gravado. */
export class EntityBatchConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityBatchConflictError";
  }
}
