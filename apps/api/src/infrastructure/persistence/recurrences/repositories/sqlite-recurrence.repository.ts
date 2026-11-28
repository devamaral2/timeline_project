import {
  SUBTASK_RELATION,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  type ArtifactWrites,
  type Task,
  type Recurrence,
} from "../../../../domain";
import type { RecurrenceRepository } from "../../../../domain/ports";
import { recurrenceExceptions, recurrences, taskTaskRelation } from "../../database/tables";
import { sql } from "@repo/sqlite";
import { writeArtifacts } from "../../artifacts/repositories/sqlite-artifact.repository";
import { resolveProjectId, type ProjectScope } from "../../projects/resolve-project";
import { insertTaskAggregate } from "../../tasks/repositories/sqlite-task.repository";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import type { Db, Tx } from "../../shared/tx";
import { mapRecurrenceRow, recurrenceColumnsOf } from "../mappers/recurrence-row.mapper";

const errors = {
  notFound: (id: string) => () => new RecurrenceNotFoundError(`Recurrence not found: ${id}`),
  ownership: () => new RecurrenceOwnershipError(),
  conflict: (message: string) => new RecurrenceRevisionConflictError(message),
};

/**
 * O projeto que o modelo da serie escolheu, ou `undefined` quando nao escolheu nenhum. A coluna
 * `recurrences.project_id` guarda a resolucao; o `projectId` do modelo e de onde ela sai.
 */
function projectOfTemplate(recurrence: Recurrence): string | undefined {
  const { projectId } = recurrence.template as { projectId?: unknown };
  return typeof projectId === "string" ? projectId : undefined;
}

/** A regra. Os artefatos que o template aponta ja precisam estar gravados. */
export async function insertRecurrenceAggregate(tx: Tx, recurrence: Recurrence, scope?: ProjectScope): Promise<void> {
  // O projeto que o modelo escolheu vale antes das regras do pedido (`scope`); sem escolha, valem elas e depois `diario`.
  const projectId = await resolveProjectId(tx, { ...scope, userId: recurrence.userId, projectId: projectOfTemplate(recurrence) });
  await tx.execute(recurrences.insert({ ...recurrenceColumnsOf(recurrence), projectId }));
}

/**
 * Grava a regra revisada e, na mesma transacao, apaga as ocorrencias de
 * `fromDay` em diante que ninguem destacou. `artifacts`: os artefatos novos do
 * template, gravados antes.
 */
export async function updateRecurrenceAggregate(
  tx: Tx,
  recurrence: Recurrence,
  actorUserId: string,
  expectedRevision: number,
  fromDay: string,
  artifacts?: ArtifactWrites,
): Promise<void> {
  await writeArtifacts(tx, artifacts);

  const { id: _id, userId: _userId, createdAt: _createdAt, ...columns } = recurrenceColumnsOf(recurrence);
  // O modelo escolheu um projeto: a serie passa a ele. Sem `projectId` no modelo o projeto da serie nao muda (ela pode
  // ter nascido no projeto de um pedido, que o modelo nao guarda); para voltar a `diario`, o modelo leva o id dele.
  const chosen = projectOfTemplate(recurrence);
  const projectId = chosen === undefined ? undefined : await resolveProjectId(tx, { userId: actorUserId, projectId: chosen });
  const updated = await tx.execute(sql`
    UPDATE recurrences
    SET ${recurrences.set(projectId === undefined ? columns : { ...columns, projectId })}
    WHERE id = ${recurrence.id} AND user_id = ${actorUserId} AND revision = ${expectedRevision}
    RETURNING id`);

  if (updated.rows.length === 0) {
    const existing = await tx.get<{ userId: string; revision: number }>(sql`
      SELECT user_id AS "userId", revision FROM recurrences WHERE id = ${recurrence.id}`);
    classifyUpdateFailure(existing, actorUserId, expectedRevision, {
      notFound: errors.notFound(recurrence.id),
      ownership: errors.ownership,
      conflict: errors.conflict,
    });
  }

  await deleteUpcomingOccurrences(tx, recurrence.id, fromDay);
}

/** Apaga a regra e as ocorrencias de `fromDay` em diante; as anteriores ficam, sem o vinculo. */
export async function deleteRecurrenceAggregate(
  tx: Tx,
  recurrenceId: string,
  actorUserId: string,
  fromDay: string,
): Promise<void> {
  await assertOwned(tx, recurrenceId, actorUserId);
  await deleteUpcomingOccurrences(tx, recurrenceId, fromDay);

  // A relacao herdada da serie vira da propria ocorrencia: a serie some, o artefato fica.
  await tx.execute(sql`
    UPDATE task_artifact_relation SET from_recurrence = 0
    WHERE task_id IN (SELECT id FROM tasks WHERE recurrence_id = ${recurrenceId})
  `);

  // O `set null` da chave estrangeira so soltaria `recurrence_id`; o dia tambem deixa de querer dizer
  // alguma coisa, entao os tres saem juntos, numa linha so: o check `tasks_occurrence_requires_day`
  // nao aceita um sem o outro.
  await tx.execute(sql`
    UPDATE tasks SET recurrence_id = NULL, occurrence_on = NULL, recurrence_detached = 0
    WHERE recurrence_id = ${recurrenceId}`);

  await tx.execute(sql`DELETE FROM recurrences WHERE id = ${recurrenceId}`);
}

export class SqliteRecurrenceRepository implements RecurrenceRepository {
  constructor(private readonly db: Db) {}

  async save(recurrence: Recurrence, artifacts?: ArtifactWrites): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Os artefatos antes: o template da serie aponta para eles.
      await writeArtifacts(tx, artifacts);
      await insertRecurrenceAggregate(tx, recurrence);
    });
  }

  async update(
    recurrence: Recurrence,
    actorUserId: string,
    expectedRevision: number,
    fromDay: string,
    artifacts?: ArtifactWrites,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await updateRecurrenceAggregate(tx, recurrence, actorUserId, expectedRevision, fromDay, artifacts);
    });
  }

  async delete(recurrenceId: string, actorUserId: string, fromDay: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await deleteRecurrenceAggregate(tx, recurrenceId, actorUserId, fromDay);
    });
  }

  async findById(recurrenceId: string): Promise<Recurrence | null> {
    const row = await this.db.get(sql`SELECT ${recurrences.select()} FROM recurrences WHERE id = ${recurrenceId}`, recurrences);
    return row ? mapRecurrenceRow(row) : null;
  }

  async findNextOccurrenceId(recurrenceId: string, fromDay: string): Promise<string | null> {
    const row = await this.db.get<{ id: string }>(sql`
      SELECT id FROM tasks
      WHERE recurrence_id = ${recurrenceId} AND occurrence_on >= ${fromDay}
        AND recurrence_detached = 0 AND deleted_at IS NULL
      ORDER BY occurrence_on
      LIMIT 1`);
    return row?.id ?? null;
  }

  async listByUserId(userId: string): Promise<Recurrence[]> {
    const rows = await this.db.all(
      sql`SELECT ${recurrences.select()} FROM recurrences WHERE user_id = ${userId} ORDER BY starts_on, id`,
      recurrences,
    );
    return rows.map(mapRecurrenceRow);
  }

  async listPendingMaterialization(userId: string, horizon: string): Promise<Recurrence[]> {
    const rows = await this.db.all(
      sql`SELECT ${recurrences.select()} FROM recurrences
          WHERE user_id = ${userId}
            AND (materialized_through IS NULL OR materialized_through < ${horizon})
            -- Uma serie que ja foi gerada ate o ultimo dia dela nao tem mais nada a fazer.
            AND (ends_on IS NULL OR materialized_through IS NULL OR materialized_through < ends_on)`,
      recurrences,
    );
    return rows.map(mapRecurrenceRow);
  }

  async listExceptions(recurrenceId: string): Promise<string[]> {
    const rows = await this.db.all<{ day: string }>(sql`
      SELECT occurrence_on AS "day" FROM recurrence_exceptions WHERE recurrence_id = ${recurrenceId}`);
    return rows.map((row) => row.day);
  }

  async addException(recurrenceId: string, dayKey: string): Promise<void> {
    await this.db.execute(sql`${recurrenceExceptions.insert({ recurrenceId, occurrenceOn: dayKey })} ON CONFLICT DO NOTHING`);
  }

  async materialize(recurrence: Recurrence, occurrences: Task[], parentId?: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // O escritor unico faz duas abas lendo a agenda ao mesmo tempo esperarem uma pela outra; o indice unico
      // por dia continua sendo a garantia.
      // Com o soft delete a principal continua na tabela e a chave estrangeira aceitaria a
      // ocorrencia, que ficaria visivel como subtarefa de uma tarefa escondida.
      const parents = parentId ? await liveTasks(tx, recurrence.userId, [parentId]) : [];
      if (parentId && parents.length === 0) occurrences = [];

      for (const occurrence of occurrences) {
        if (!(await insertTaskAggregate(tx, occurrence))) continue;
        if (!parentId) continue;
        // A relacao faz parte da criacao da ocorrencia: nao conta como edicao da principal.
        await tx.execute(
          taskTaskRelation.insert({ fromTaskId: parentId, toTaskId: occurrence.id, relation: SUBTASK_RELATION }),
        );
      }

      // So avanca a marca d'agua se ninguem editou a regra no meio do caminho:
      // senao estas ocorrencias sao da regra velha, e a transacao volta inteira.
      const advanced = await tx.execute(sql`
        UPDATE recurrences SET materialized_through = ${recurrence.materializedThrough ?? null}
        WHERE id = ${recurrence.id} AND revision = ${recurrence.revision}
        RETURNING id`);
      if (advanced.rows.length === 0) {
        throw new RecurrenceRevisionConflictError(`Recurrence ${recurrence.id} changed while materializing`);
      }
    });
  }
}

async function assertOwned(tx: Tx, recurrenceId: string, actorUserId: string): Promise<void> {
  const existing = await tx.get<{ userId: string }>(sql`SELECT user_id AS "userId" FROM recurrences WHERE id = ${recurrenceId}`);
  if (!existing) throw errors.notFound(recurrenceId)();
  if (existing.userId !== actorUserId) throw errors.ownership();
}

async function liveTasks(tx: Tx, userId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await tx.all<{ id: string }>(sql`
    SELECT id FROM tasks
    WHERE id IN ${sql.in(ids)} AND user_id = ${userId} AND deleted_at IS NULL
  `);
  return found.map((row) => row.id);
}

/** As ocorrencias de `fromDay` em diante que ninguem mexeu a mao. As relacoes delas saem em cascata. */
async function deleteUpcomingOccurrences(tx: Tx, recurrenceId: string, fromDay: string): Promise<void> {
  await tx.execute(sql`
    DELETE FROM tasks
    WHERE recurrence_id = ${recurrenceId} AND occurrence_on >= ${fromDay} AND recurrence_detached = 0`);
}
