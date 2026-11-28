import {
  Task,
  TaskNotFoundError,
  TaskOwnershipError,
  TaskRevisionConflictError,
  SUBTASK_RELATION,
  FINAL_AGENT_STATUSES,
  KINDS_WITHOUT_SITUATION,
  type ArtifactLink,
  type ArtifactWrites,
  type Situation,
} from "../../../../domain/index";
import type { TaskRepository } from "../../../../domain/ports";
import { recurrenceExceptions, tasks, taskTags } from "../../database/tables";
import { sqlList } from "../../database/schema/sets";
import { c, NOW, rowDecoder, sql } from "@repo/sqlite";
import { resolveProjectId, type ProjectScope } from "../../projects/resolve-project";
import { writeArtifacts } from "../../artifacts/repositories/sqlite-artifact.repository";
import { occurrenceColumnsOf } from "../../recurrences/mappers/occurrence-columns";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import type { Db, Tx } from "../../shared/tx";
import { upsertTagIds } from "../../shared/upsert-tag-ids";
import { mapTaskRow, type TaskRow, type TaskRowParts } from "../mappers/task-row.mapper";
import {
  assertTaskReferences,
  deleteTaskRelations,
  insertTaskRelations,
} from "./task-relations";

export type { Tx } from "../../shared/tx";

async function insertChildren(tx: Tx, task: Task): Promise<void> {
  await assertTaskReferences(tx, task);
  await insertTaskRelations(tx, task);

  if (task.tags.length > 0) {
    const tagIds = await upsertTagIds(tx, task.userId, task.tags);
    await tx.execute(taskTags.insert(tagIds.map((tagId) => ({ taskId: task.id, tagId }))));
  }
}

/**
 * Insere a tarefa e o que sai dela. Devolve `false` quando a tarefa e uma
 * ocorrencia de um dia que a serie ja gerou: o indice unico recusa a linha e o
 * resto nem e tentado, porque apontaria para uma tarefa que nao entrou.
 */
export async function insertTaskAggregate(
  tx: Tx,
  task: Task,
  artifacts?: ArtifactWrites,
  scope?: ProjectScope,
): Promise<boolean> {
  const projectId = await resolveProjectId(tx, {
    ...scope,
    userId: task.userId,
    projectId: task.projectId,
    recurrenceId: task.occurrence?.recurrenceId,
  });
  const inserted = await tx.execute(sql`
    ${tasks.insert({
      id: task.id,
      revision: task.revision,
      userId: task.userId,
      projectId,
      actor: task.actor,
      kind: task.kind,
      status: task.status ?? null,
      situation: task.situation ?? null,
      priority: task.priority,
      name: task.name,
      description: task.description,
      location: task.location ?? null,
      startedAt: task.startedAt ?? null,
      estimatedFinishAt: task.estimatedFinishAt ?? null,
      finishedAt: task.finishedAt ?? null,
      notifyOffsetsMinutes: [...task.notifyOffsetsMinutes],
      longRunning: task.longRunning,
      data: task.data,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      ...occurrenceColumnsOf(task.occurrence),
    })}
    ON CONFLICT (recurrence_id, occurrence_on) WHERE recurrence_id IS NOT NULL DO NOTHING
    RETURNING id`);

  if (inserted.rows.length === 0) return false;
  await writeArtifacts(tx, artifacts);
  await insertChildren(tx, task);
  return true;
}

/**
 * Atualiza a linha e regrava o que sai da tarefa. Linha apagada conta como
 * inexistente: quem edita algo que outra aba ja apagou recebe "nao encontrado".
 * So tarefas de pessoa passam por aqui; as de agente mudam pelo proprio agente.
 */
export async function updateTaskAggregate(
  tx: Tx,
  task: Task,
  actorUserId: string,
  expectedRevision: number,
  artifacts?: ArtifactWrites,
): Promise<void> {
  // A tarefa lida sempre traz o projeto; `null` e a edicao que a devolve a `diario`. Quem nao tem projeto no
  // agregado (testes que montam a tarefa a mao) deixa a coluna como esta.
  const projectId =
    task.projectId === undefined ? undefined : await resolveProjectId(tx, { userId: actorUserId, projectId: task.projectId });
  const result = await tx.execute(sql`
    UPDATE tasks
    SET ${projectId === undefined ? sql.empty : sql`project_id = ${projectId},`}
        kind = ${task.kind},
        status = ${task.status ?? null},
        priority = ${task.priority},
        name = ${task.name},
        description = ${task.description},
        location = ${task.location ?? null},
        started_at = ${task.startedAt ?? null},
        estimated_finish_at = ${task.estimatedFinishAt ?? null},
        finished_at = ${task.finishedAt ?? null},
        notify_offsets_minutes = ${sql.json(task.notifyOffsetsMinutes)},
        long_running = ${task.longRunning},
        recurrence_detached = ${task.occurrence?.detached ?? false},
        revision = ${task.revision},
        updated_at = ${task.updatedAt}
    WHERE id = ${task.id}
      AND user_id = ${actorUserId}
      AND revision = ${expectedRevision}
      AND actor = 'human'
      AND deleted_at IS NULL
    RETURNING revision
  `);

  if (result.rows.length === 0) {
    const existing = await tx.get<{ userId: string; revision: number }>(sql`
      SELECT user_id AS "userId", revision FROM tasks WHERE id = ${task.id} AND actor = 'human' AND deleted_at IS NULL`);

    classifyUpdateFailure(existing, actorUserId, expectedRevision, {
      notFound: () => new TaskNotFoundError(`Task not found: ${task.id}`),
      ownership: () => new TaskOwnershipError(),
      conflict: (message) => new TaskRevisionConflictError(message),
    });
  }

  await writeArtifacts(tx, artifacts);
  await deleteTaskRelations(tx, task.id);
  await tx.execute(sql`DELETE FROM task_tags WHERE task_id = ${task.id}`);

  await insertChildren(tx, task);
}

/** Soft delete de uma tarefa de pessoa. As relacoes ficam e a leitura filtra `deleted_at IS NULL`. */
export async function softDeleteTask(tx: Tx, taskId: string, actorUserId: string): Promise<void> {
  const existing = await tx.get<{ userId: string; recurrenceId: string | null; occurrenceOn: string | null }>(sql`
    SELECT user_id AS "userId", recurrence_id AS "recurrenceId", occurrence_on AS "occurrenceOn"
    FROM tasks WHERE id = ${taskId} AND actor = 'human' AND deleted_at IS NULL`);

  if (!existing) {
    throw new TaskNotFoundError(`Task not found: ${taskId}`);
  }
  if (existing.userId !== actorUserId) {
    throw new TaskOwnershipError();
  }

  // A linha apagada ja ocupa o dia no indice unico, mas a edicao da serie faz
  // hard delete das ocorrencias futuras e regera: sem a excecao, o dia voltaria.
  if (existing.recurrenceId && existing.occurrenceOn) {
    await tx.execute(sql`
      ${recurrenceExceptions.insert({ recurrenceId: existing.recurrenceId, occurrenceOn: existing.occurrenceOn })}
      ON CONFLICT DO NOTHING`);
  }

  await tx.execute(sql`UPDATE tasks SET deleted_at = ${NOW}, updated_at = ${NOW} WHERE id = ${taskId}`);
}

interface MutableTaskParts extends TaskRowParts {
  tags: string[];
  artifactLinks: ArtifactLink[];
  parentId?: string;
  subtaskIds: string[];
}

const artifactLinkRow = rowDecoder({
  taskId: c.text,
  artifactId: c.text,
  relation: c.oneOf(["creates", "updates", "uses", "deletes"] as const),
  fromRecurrence: c.boolean,
});

/** O que completa cada tarefa, lido das outras tabelas em poucas consultas, para qualquer quantidade de tarefas. */
export async function loadTaskParts(db: Pick<Db | Tx, "all">, taskIds: readonly string[]): Promise<Map<string, TaskRowParts>> {
  const parts = new Map<string, MutableTaskParts>();
  for (const id of taskIds) {
    parts.set(id, { tags: [], artifactLinks: [], subtaskIds: [] });
  }
  if (taskIds.length === 0) return parts;
  const ids = [...taskIds];

  const [tagRows, artifactRows, outgoing, incoming] = await Promise.all([
    db.all<{ taskId: string; name: string }>(sql`
      SELECT tt.task_id AS "taskId", t.name AS "name"
      FROM task_tags tt JOIN tags t ON t.id = tt.tag_id
      WHERE tt.task_id IN ${sql.in(ids)}
      ORDER BY t.name`),
    db.all(
      sql`
        SELECT r.task_id AS "taskId", r.artifact_id AS "artifactId", r.relation AS "relation",
          r.from_recurrence AS "fromRecurrence"
        FROM task_artifact_relation r JOIN artifacts a ON a.id = r.artifact_id
        WHERE r.task_id IN ${sql.in(ids)} AND a.deleted_at IS NULL
        ORDER BY r.position, r.created_at`,
      artifactLinkRow,
    ),
    db.all<{ taskId: string; otherId: string }>(sql`
      SELECT r.from_task_id AS "taskId", r.to_task_id AS "otherId"
      FROM task_task_relation r JOIN tasks t ON t.id = r.to_task_id
      WHERE r.from_task_id IN ${sql.in(ids)} AND r.relation = ${SUBTASK_RELATION} AND t.deleted_at IS NULL
      ORDER BY r.created_at, r.to_task_id`),
    db.all<{ taskId: string; otherId: string }>(sql`
      SELECT r.to_task_id AS "taskId", r.from_task_id AS "otherId"
      FROM task_task_relation r JOIN tasks t ON t.id = r.from_task_id
      WHERE r.to_task_id IN ${sql.in(ids)} AND r.relation = ${SUBTASK_RELATION} AND t.deleted_at IS NULL
      ORDER BY r.created_at, r.from_task_id`),
  ]);

  for (const row of tagRows) parts.get(row.taskId)?.tags.push(row.name);
  for (const row of artifactRows) {
    const link: ArtifactLink = { artifactId: row.artifactId, relation: row.relation, fromRecurrence: row.fromRecurrence };
    parts.get(row.taskId)?.artifactLinks.push(link);
  }
  for (const row of outgoing) {
    parts.get(row.taskId)?.subtaskIds.push(row.otherId);
  }
  // O indice unico garante uma principal por tarefa.
  for (const row of incoming) {
    const part = parts.get(row.taskId);
    if (part) part.parentId = row.otherId;
  }
  return parts;
}

export async function hydrateTasks(db: Pick<Db | Tx, "all">, rows: readonly TaskRow[]): Promise<Task[]> {
  const parts = await loadTaskParts(db, rows.map((row) => row.id));
  return rows.map((row) => mapTaskRow(row, parts.get(row.id)));
}

export class SqliteTaskRepository implements TaskRepository {
  constructor(private readonly db: Db) {}

  async save(task: Task, artifacts?: ArtifactWrites): Promise<void> {
    await this.db.transaction(async (tx) => {
      await insertTaskAggregate(tx, task, artifacts);
    });
  }

  async update(task: Task, actorUserId: string, expectedRevision: number, artifacts?: ArtifactWrites): Promise<void> {
    await this.db.transaction(async (tx) => {
      await updateTaskAggregate(tx, task, actorUserId, expectedRevision, artifacts);
    });
  }

  async delete(taskId: string, actorUserId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await softDeleteTask(tx, taskId, actorUserId);
    });
  }

  async setSituation(taskId: string, userId: string, situation: Situation): Promise<boolean> {
    // O mesmo criterio de `acceptsSituation`, no comando: o status pode ter mudado desde a leitura.
    const updated = await this.db.execute(sql`
      UPDATE tasks SET situation = ${situation}, revision = revision + 1, updated_at = ${NOW}
      WHERE id = ${taskId} AND user_id = ${userId} AND deleted_at IS NULL
        AND actor = 'agent' AND kind NOT IN (${sqlList(KINDS_WITHOUT_SITUATION)})
        AND status IN (${sqlList(FINAL_AGENT_STATUSES)})
      RETURNING id`);
    return updated.rows.length > 0;
  }

  async findById(taskId: string): Promise<Task | null> {
    const [task] = await this.findByIds([taskId]);
    return task ?? null;
  }

  async findByIds(taskIds: readonly string[]): Promise<Task[]> {
    if (taskIds.length === 0) return [];
    const rows = await this.db.all(
      sql`SELECT ${tasks.select()} FROM tasks WHERE id IN ${sql.in(taskIds)} AND deleted_at IS NULL`,
      tasks,
    );
    return hydrateTasks(this.db, rows);
  }
}
