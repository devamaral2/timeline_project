import { TaskValidationError, SUBTASK_RELATION, type Task } from "../../../../domain/index";
import type { SubtaskChange } from "../../../../domain/ports";
import { taskArtifactRelation, taskTaskRelation } from "../../database/tables";
import { sql } from "../../sqlite/sql";
import type { Tx } from "../../shared/tx";

/**
 * O artefato ligado e do usuario ou global. O banco nao confere isso: confere aqui. A transacao e `IMMEDIATE` e o
 * escritor e um so, entao o alvo nao some antes do commit (o `FOR SHARE` do Postgres).
 */
export async function assertTaskReferences(tx: Tx, task: Task): Promise<void> {
  const artifactIds = task.artifactLinks.map((link) => link.artifactId);
  if (artifactIds.length > 0) {
    const found = await tx.all<{ id: string }>(sql`
      SELECT id FROM artifacts
      WHERE id IN ${sql.in(artifactIds)} AND (user_id = ${task.userId} OR user_id IS NULL) AND deleted_at IS NULL`);
    const known = new Set(found.map((row) => row.id));
    const missing = artifactIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new TaskValidationError(`Related artifacts not found: ${missing.join(", ")}`);
    }
  }
}

/** Grava as relacoes que saem da tarefa: os artefatos, na ordem. A hierarquia entra pelo lote (`applySubtaskChanges`). */
export async function insertTaskRelations(tx: Tx, task: Task): Promise<void> {
  if (task.artifactLinks.length === 0) return;
  await tx.execute(
    taskArtifactRelation.insert(
      task.artifactLinks.map((link, position) => ({
        taskId: task.id,
        artifactId: link.artifactId,
        relation: link.relation,
        position,
        fromRecurrence: link.fromRecurrence,
      })),
    ),
  );
}

export async function deleteTaskRelations(tx: Tx, taskId: string): Promise<void> {
  await tx.execute(sql`DELETE FROM task_artifact_relation WHERE task_id = ${taskId}`);
}

/**
 * Aplica as arestas da hierarquia: as duas pontas existem e sao do usuario,
 * cada subtarefa tem uma principal so (pôr sob outra tira da anterior) e a
 * hierarquia nao fecha ciclo. Nenhuma das tarefas e revisada: a hierarquia nao
 * e campo de nenhuma delas, entao uma tarefa de agente tambem pode ser ponta.
 *
 * A conferencia de ciclo le o grafo inteiro do usuario; o escritor unico ja faz duas escritas esperarem uma pela outra.
 */
export async function applySubtaskChanges(tx: Tx, userId: string, changes: readonly SubtaskChange[]): Promise<void> {
  if (changes.length === 0) return;

  const added = changes.filter((change) => change.op === "add");
  const ids = [...new Set(added.flatMap((change) => [change.parentId, change.subtaskId]))].sort();
  if (ids.length > 0) {
    const found = await tx.all<{ id: string }>(sql`
      SELECT id FROM tasks WHERE id IN ${sql.in(ids)} AND user_id = ${userId} AND deleted_at IS NULL`);
    const known = new Set(found.map((row) => row.id));
    const missing = ids.filter((id) => !known.has(id));
    if (missing.length > 0) throw new TaskValidationError(`Related tasks not found: ${missing.join(", ")}`);
  }

  for (const change of changes) {
    if (change.op !== "remove") continue;
    await tx.execute(sql`
      DELETE FROM task_task_relation
      WHERE from_task_id = ${change.parentId} AND to_task_id = ${change.subtaskId} AND relation = ${SUBTASK_RELATION}`);
  }
  for (const change of added) {
    // Uma principal so: a subtarefa sai da anterior, se tinha.
    await tx.execute(sql`
      DELETE FROM task_task_relation WHERE to_task_id = ${change.subtaskId} AND relation = ${SUBTASK_RELATION}`);
    await tx.execute(
      taskTaskRelation.insert({ fromTaskId: change.parentId, toTaskId: change.subtaskId, relation: SUBTASK_RELATION }),
    );
  }
  for (const parentId of new Set(added.map((change) => change.parentId))) await assertAcyclic(tx, parentId);
}

/** A hierarquia nao fecha ciclo: descendo a partir da tarefa, ela nao volta a si mesma. */
async function assertAcyclic(tx: Tx, taskId: string): Promise<void> {
  const cycle = await tx.get(sql`
    WITH RECURSIVE reach(id) AS (
      SELECT to_task_id FROM task_task_relation
      WHERE from_task_id = ${taskId} AND relation = ${SUBTASK_RELATION}
      UNION
      SELECT r.to_task_id FROM task_task_relation r
      JOIN reach ON r.from_task_id = reach.id
      WHERE r.relation = ${SUBTASK_RELATION}
    )
    SELECT 1 FROM reach WHERE id = ${taskId} LIMIT 1`);
  if (cycle) throw new TaskValidationError("A task cannot be a subtask of its own subtask");
}
