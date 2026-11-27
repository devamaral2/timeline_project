/** A relação de uma tarefa de agente com a tarefa que ela gerou ou alterou (ADR 0012). */
export interface TaskRelation {
  fromTaskId: string;
  toTaskId: string;
  relation: "generates" | "updates";
}

/**
 * Persistência da relação entre tarefas que o lote de entidades não cobre.
 * `record` roda na transação do escritor em lote (`EntityBatch.afterWrite`),
 * para que a tarefa de agente, o que ela produziu e a relação existam se e
 * somente se existem juntos.
 */
export interface TaskRelations {
  record(tx: unknown, relation: TaskRelation): Promise<void>;
}
