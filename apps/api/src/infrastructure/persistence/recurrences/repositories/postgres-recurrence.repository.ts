import { and, asc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
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
import * as schema from "../../database/schema";
import { writeArtifacts } from "../../artifacts/repositories/postgres-artifact.repository";
import { insertTaskAggregate } from "../../tasks/repositories/postgres-task.repository";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import { lockUser, type Db, type Tx } from "../../shared/tx";
import { mapRecurrenceRow, recurrenceColumnsOf } from "../mappers/recurrence-row.mapper";

const errors = {
  notFound: (id: string) => () => new RecurrenceNotFoundError(`Recurrence not found: ${id}`),
  ownership: () => new RecurrenceOwnershipError(),
  conflict: (message: string) => new RecurrenceRevisionConflictError(message),
};

/** A regra. Os artefatos que o template aponta ja precisam estar gravados. */
export async function insertRecurrenceAggregate(tx: Tx, recurrence: Recurrence): Promise<void> {
  await tx.insert(schema.recurrences).values(recurrenceColumnsOf(recurrence));
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
  const updated = await tx
    .update(schema.recurrences)
    .set(columns)
    .where(
      and(
        eq(schema.recurrences.id, recurrence.id),
        eq(schema.recurrences.userId, actorUserId),
        eq(schema.recurrences.revision, expectedRevision),
      ),
    )
    .returning({ id: schema.recurrences.id });

  if (updated.length === 0) {
    const [existing] = await tx
      .select({ userId: schema.recurrences.userId, revision: schema.recurrences.revision })
      .from(schema.recurrences)
      .where(eq(schema.recurrences.id, recurrence.id));
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
    UPDATE task_artifact_relation SET from_recurrence = false
    WHERE task_id IN (SELECT id FROM tasks WHERE recurrence_id = ${recurrenceId})
  `);

  // O `set null` da chave estrangeira so soltaria `recurrence_id`; o dia tambem deixa de querer dizer
  // alguma coisa, entao os tres saem juntos, numa linha so: o check `tasks_occurrence_requires_day`
  // nao aceita um sem o outro.
  await tx
    .update(schema.tasks)
    .set({ recurrenceId: null, occurrenceOn: null, recurrenceDetached: false })
    .where(eq(schema.tasks.recurrenceId, recurrenceId));

  await tx.delete(schema.recurrences).where(eq(schema.recurrences.id, recurrenceId));
}

export class PostgresRecurrenceRepository implements RecurrenceRepository {
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
    const [row] = await this.db.select().from(schema.recurrences).where(eq(schema.recurrences.id, recurrenceId));
    return row ? mapRecurrenceRow(row) : null;
  }

  async findNextOccurrenceId(recurrenceId: string, fromDay: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.recurrenceId, recurrenceId),
          gte(schema.tasks.occurrenceOn, fromDay),
          eq(schema.tasks.recurrenceDetached, false),
          isNull(schema.tasks.deletedAt),
        ),
      )
      .orderBy(asc(schema.tasks.occurrenceOn))
      .limit(1);
    return row?.id ?? null;
  }

  async listByUserId(userId: string): Promise<Recurrence[]> {
    const rows = await this.db
      .select()
      .from(schema.recurrences)
      .where(eq(schema.recurrences.userId, userId))
      .orderBy(asc(schema.recurrences.startsOn), asc(schema.recurrences.id));
    return rows.map(mapRecurrenceRow);
  }

  async listPendingMaterialization(userId: string, horizon: string): Promise<Recurrence[]> {
    const { recurrences: table } = schema;
    const rows = await this.db
      .select()
      .from(table)
      .where(
        and(
          eq(table.userId, userId),
          or(isNull(table.materializedThrough), lt(table.materializedThrough, horizon)),
          // Uma serie que ja foi gerada ate o ultimo dia dela nao tem mais nada a fazer.
          or(isNull(table.endsOn), isNull(table.materializedThrough), lt(table.materializedThrough, table.endsOn)),
        ),
      );
    return rows.map(mapRecurrenceRow);
  }

  async listExceptions(recurrenceId: string): Promise<string[]> {
    const rows = await this.db
      .select({ day: schema.recurrenceExceptions.occurrenceOn })
      .from(schema.recurrenceExceptions)
      .where(eq(schema.recurrenceExceptions.recurrenceId, recurrenceId));
    return rows.map((row) => row.day);
  }

  async addException(recurrenceId: string, dayKey: string): Promise<void> {
    await this.db
      .insert(schema.recurrenceExceptions)
      .values({ recurrenceId, occurrenceOn: dayKey })
      .onConflictDoNothing();
  }

  async materialize(recurrence: Recurrence, occurrences: Task[], parentId?: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Duas abas lendo a agenda ao mesmo tempo esperam uma pela outra; o
      // indice unico por dia continua sendo a garantia, isto so poupa trabalho.
      await lockUser(tx, recurrence.userId);

      // Com o soft delete a principal continua na tabela e a chave estrangeira aceitaria a
      // ocorrencia, que ficaria visivel como subtarefa de uma tarefa escondida.
      const parents = parentId ? await liveTasks(tx, recurrence.userId, [parentId]) : [];
      if (parentId && parents.length === 0) occurrences = [];

      for (const occurrence of occurrences) {
        if (!(await insertTaskAggregate(tx, occurrence))) continue;
        if (!parentId) continue;
        // A relacao faz parte da criacao da ocorrencia: nao conta como edicao da principal.
        await tx
          .insert(schema.taskTaskRelation)
          .values({ fromTaskId: parentId, toTaskId: occurrence.id, relation: SUBTASK_RELATION });
      }

      // So avanca a marca d'agua se ninguem editou a regra no meio do caminho:
      // senao estas ocorrencias sao da regra velha, e a transacao volta inteira.
      const advanced = await tx
        .update(schema.recurrences)
        .set({ materializedThrough: recurrence.materializedThrough ?? null })
        .where(and(eq(schema.recurrences.id, recurrence.id), eq(schema.recurrences.revision, recurrence.revision)))
        .returning({ id: schema.recurrences.id });
      if (advanced.length === 0) {
        throw new RecurrenceRevisionConflictError(`Recurrence ${recurrence.id} changed while materializing`);
      }
    });
  }
}

async function assertOwned(tx: Tx, recurrenceId: string, actorUserId: string): Promise<void> {
  const [existing] = await tx
    .select({ userId: schema.recurrences.userId })
    .from(schema.recurrences)
    .where(eq(schema.recurrences.id, recurrenceId));
  if (!existing) throw errors.notFound(recurrenceId)();
  if (existing.userId !== actorUserId) throw errors.ownership();
}

async function liveTasks(tx: Tx, userId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const found = await tx.execute<{ id: string }>(sql`
    SELECT id FROM tasks
    WHERE id IN ${[...ids]} AND user_id = ${userId} AND deleted_at IS NULL
  `);
  return found.rows.map((row) => row.id);
}

/** As ocorrencias de `fromDay` em diante que ninguem mexeu a mao. As relacoes delas saem em cascata. */
async function deleteUpcomingOccurrences(tx: Tx, recurrenceId: string, fromDay: string): Promise<void> {
  await tx
    .delete(schema.tasks)
    .where(
      and(
        eq(schema.tasks.recurrenceId, recurrenceId),
        gte(schema.tasks.occurrenceOn, fromDay),
        eq(schema.tasks.recurrenceDetached, false),
      ),
    );
}
