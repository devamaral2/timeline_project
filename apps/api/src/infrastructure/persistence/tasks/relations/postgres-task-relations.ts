import { sql } from "drizzle-orm";
import type { TaskRelation, TaskRelations } from "../../../../api-core/tasks/task-relations";
import type { Tx } from "../../shared/tx";

/** Grava a relação entre tarefas na transação do escritor em lote (`task_task_relation`). */
export class PostgresTaskRelations implements TaskRelations {
  async record(tx: unknown, { fromTaskId, toTaskId, relation }: TaskRelation): Promise<void> {
    await (tx as Tx).execute(sql`
      INSERT INTO task_task_relation (from_task_id, to_task_id, relation)
      VALUES (${fromTaskId}, ${toTaskId}, ${relation})
      ON CONFLICT DO NOTHING`);
  }
}
