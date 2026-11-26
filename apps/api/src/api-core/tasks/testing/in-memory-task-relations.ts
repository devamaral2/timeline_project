import type { TaskRelation, TaskRelations } from "../task-relations";

/** O equivalente em memória de `task_task_relation`: guarda o que o lote registrou. */
export class InMemoryTaskRelations implements TaskRelations {
  readonly recorded: TaskRelation[] = [];

  async record(_tx: unknown, relation: TaskRelation): Promise<void> {
    this.recorded.push(relation);
  }
}
