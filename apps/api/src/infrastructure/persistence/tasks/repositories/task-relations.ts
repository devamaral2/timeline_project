import { and, eq, sql } from "drizzle-orm";
import { TaskValidationError, SEQUENCE_RELATION, type Task } from "../../../../domain/index";
import type { SequenceChange } from "../../../../domain/ports";
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

/** Grava as relacoes que saem da tarefa: os artefatos, na ordem. A sequencia entra pelo lote (`applySequenceChanges`). */
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
 * Aplica as arestas da sequencia: as duas pontas existem e sao do usuario, uma
 * aresta nao repete e a ordem nao fecha ciclo. Nenhum das tarefas e revisada:
 * a sequencia nao e campo de nenhuma delas, entao uma tarefa de agente tambem
 * pode ser ponta.
 */
export async function applySequenceChanges(tx: Tx, userId: string, changes: readonly SequenceChange[]): Promise<void> {
  if (changes.length === 0) return;
  // A conferencia de ciclo le o grafo inteiro do usuario: duas escritas ao mesmo tempo esperam uma pela outra.
  await lockUser(tx, userId);

  const added = changes.filter((change) => change.op === "add");
  const ids = [...new Set(added.flatMap((change) => [change.fromId, change.toId]))].sort();
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
          eq(schema.taskTaskRelation.fromTaskId, change.fromId),
          eq(schema.taskTaskRelation.toTaskId, change.toId),
          eq(schema.taskTaskRelation.relation, SEQUENCE_RELATION),
        ),
      );
  }
  if (added.length > 0) {
    await tx
      .insert(schema.taskTaskRelation)
      .values(added.map((change) => ({ fromTaskId: change.fromId, toTaskId: change.toId, relation: SEQUENCE_RELATION })))
      .onConflictDoNothing();
    for (const fromId of new Set(added.map((change) => change.fromId))) await assertAcyclic(tx, fromId);
  }
}

/** A sequencia nao fecha ciclo: seguindo a relacao a partir da tarefa, ela nao volta a si mesma. */
async function assertAcyclic(tx: Tx, taskId: string): Promise<void> {
  const result = await tx.execute(sql`
    WITH RECURSIVE reach(id) AS (
      SELECT to_task_id FROM task_task_relation
      WHERE from_task_id = ${taskId} AND relation = ${SEQUENCE_RELATION}
      UNION
      SELECT r.to_task_id FROM task_task_relation r
      JOIN reach ON r.from_task_id = reach.id
      WHERE r.relation = ${SEQUENCE_RELATION}
    )
    SELECT 1 FROM reach WHERE id = ${taskId} LIMIT 1
  `);
  if (result.rows.length > 0) throw new TaskValidationError("Tasks cannot follow each other in a cycle");
}
