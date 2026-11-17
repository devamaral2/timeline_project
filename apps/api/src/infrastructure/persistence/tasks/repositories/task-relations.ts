import { and, eq, sql } from "drizzle-orm";
import { TaskValidationError, SUBTASK_RELATION, type Task } from "../../../../domain/index";
import type { SubtaskChange } from "../../../../domain/ports";
import * as schema from "../../database/schema/index";
import { lockUser, type Tx } from "../../shared/tx";

/**
 * O artefato ligado e do usuario ou global. O banco nao confere isso: confere
 * aqui, e o `FOR SHARE` impede que o alvo suma antes do commit.
 */
export async function assertTaskReferences(tx: Tx, task: Task): Promise<void> {
  const artifactIds = task.artifactLinks.map((link) => link.artifactId);
  if (artifactIds.length > 0) {
    const found = await tx.execute<{ id: string }>(sql`
      SELECT id FROM artifacts
      WHERE id IN ${artifactIds} AND (user_id = ${task.userId} OR user_id IS NULL) AND deleted_at IS NULL
      ORDER BY id
      FOR SHARE
    `);
    const known = new Set(found.rows.map((row) => row.id));
    const missing = artifactIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new TaskValidationError(`Related artifacts not found: ${missing.join(", ")}`);
    }
  }
}

/** Grava as relacoes que saem da tarefa: os artefatos, na ordem. A hierarquia entra pelo lote (`applySubtaskChanges`). */
export async function insertTaskRelations(tx: Tx, task: Task): Promise<void> {
  if (task.artifactLinks.length === 0) return;
  await tx.insert(schema.taskArtifactRelation).values(
    task.artifactLinks.map((link, position) => ({
      taskId: task.id,
      artifactId: link.artifactId,
      relation: link.relation,
      position,
      fromRecurrence: link.fromRecurrence,
    })),
  );
}

export async function deleteTaskRelations(tx: Tx, taskId: string): Promise<void> {
  await tx.delete(schema.taskArtifactRelation).where(eq(schema.taskArtifactRelation.taskId, taskId));
}

/**
 * Aplica as arestas da hierarquia: as duas pontas existem e sao do usuario,
 * cada subtarefa tem uma principal so (pôr sob outra tira da anterior) e a
 * hierarquia nao fecha ciclo. Nenhuma das tarefas e revisada: a hierarquia nao
 * e campo de nenhuma delas, entao uma tarefa de agente tambem pode ser ponta.
 */
export async function applySubtaskChanges(tx: Tx, userId: string, changes: readonly SubtaskChange[]): Promise<void> {
  if (changes.length === 0) return;
  // A conferencia de ciclo le o grafo inteiro do usuario: duas escritas ao mesmo tempo esperam uma pela outra.
  await lockUser(tx, userId);

  const added = changes.filter((change) => change.op === "add");
  const ids = [...new Set(added.flatMap((change) => [change.parentId, change.subtaskId]))].sort();
  if (ids.length > 0) {
    const found = await tx.execute<{ id: string }>(sql`
      SELECT id FROM tasks
      WHERE id IN ${ids} AND user_id = ${userId} AND deleted_at IS NULL
      ORDER BY id
      FOR SHARE
    `);
    const known = new Set(found.rows.map((row) => row.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new TaskValidationError(`Related tasks not found: ${missing.join(", ")}`);
  }

  for (const change of changes) {
    if (change.op !== "remove") continue;
    await tx
      .delete(schema.taskTaskRelation)
      .where(
        and(
          eq(schema.taskTaskRelation.fromTaskId, change.parentId),
          eq(schema.taskTaskRelation.toTaskId, change.subtaskId),
          eq(schema.taskTaskRelation.relation, SUBTASK_RELATION),
        ),
      );
  }
  for (const change of added) {
    // Uma principal so: a subtarefa sai da anterior, se tinha.
    await tx
      .delete(schema.taskTaskRelation)
      .where(and(eq(schema.taskTaskRelation.toTaskId, change.subtaskId), eq(schema.taskTaskRelation.relation, SUBTASK_RELATION)));
    await tx
      .insert(schema.taskTaskRelation)
      .values({ fromTaskId: change.parentId, toTaskId: change.subtaskId, relation: SUBTASK_RELATION });
  }
  for (const parentId of new Set(added.map((change) => change.parentId))) await assertAcyclic(tx, parentId);
}

/** A hierarquia nao fecha ciclo: descendo a partir da tarefa, ela nao volta a si mesma. */
async function assertAcyclic(tx: Tx, taskId: string): Promise<void> {
  const result = await tx.execute(sql`
    WITH RECURSIVE reach(id) AS (
      SELECT to_task_id FROM task_task_relation
      WHERE from_task_id = ${taskId} AND relation = ${SUBTASK_RELATION}
      UNION
      SELECT r.to_task_id FROM task_task_relation r
      JOIN reach ON r.from_task_id = reach.id
      WHERE r.relation = ${SUBTASK_RELATION}
    )
    SELECT 1 FROM reach WHERE id = ${taskId} LIMIT 1
  `);
  if (result.rows.length > 0) throw new TaskValidationError("A task cannot be a subtask of its own subtask");
}
