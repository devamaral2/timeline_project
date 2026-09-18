import { and, asc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  type Event,
  type Recurrence,
  type Task,
} from "@repo/entities";
import type { RecurrenceRepository } from "@repo/entities/ports";
import * as schema from "../../database/schema";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import { insertEventAggregate, type Tx } from "../../events/repositories/postgres-event.repository";
import { insertTaskAggregate } from "../../tasks/repositories/postgres-task.repository";
import { mapRecurrenceRow, recurrenceColumnsOf } from "../mappers/recurrence-row.mapper";

const errors = {
  notFound: (id: string) => () => new RecurrenceNotFoundError(`Recurrence not found: ${id}`),
  ownership: () => new RecurrenceOwnershipError(),
  conflict: (message: string) => new RecurrenceRevisionConflictError(message),
};

export class PostgresRecurrenceRepository implements RecurrenceRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(recurrence: Recurrence): Promise<void> {
    await this.db.insert(schema.recurrences).values(recurrenceColumnsOf(recurrence));
  }

  async update(
    recurrence: Recurrence,
    actorUserId: string,
    expectedRevision: number,
    fromDay: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const { id: _id, userId: _userId, ...columns } = recurrenceColumnsOf(recurrence);
      const updated = await tx
        .update(schema.recurrences)
        .set({ ...columns, updatedAt: sql`now()` })
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
    });
  }

  async delete(recurrenceId: string, actorUserId: string, fromDay: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await assertOwned(tx, recurrenceId, actorUserId);
      await deleteUpcomingOccurrences(tx, recurrenceId, fromDay);

      // O `set null` do FK so soltaria `recurrence_id`; o dia tambem deixa de
      // querer dizer alguma coisa, entao os tres saem juntos, numa linha so —
      // o check `*_occurrence_requires_day` nao aceita um sem o outro.
      const unlink = { recurrenceId: null, occurrenceOn: null, recurrenceDetached: false };
      await tx.update(schema.events).set(unlink).where(eq(schema.events.recurrenceId, recurrenceId));
      await tx.update(schema.tasks).set(unlink).where(eq(schema.tasks.recurrenceId, recurrenceId));

      await tx.delete(schema.recurrences).where(eq(schema.recurrences.id, recurrenceId));
    });
  }

  async findById(recurrenceId: string): Promise<Recurrence | null> {
    const [row] = await this.db
      .select()
      .from(schema.recurrences)
      .where(eq(schema.recurrences.id, recurrenceId));
    return row ? mapRecurrenceRow(row) : null;
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
          or(
            isNull(table.endsOn),
            isNull(table.materializedThrough),
            lt(table.materializedThrough, table.endsOn),
          ),
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

  async materialize(recurrence: Recurrence, occurrences: Event[] | Task[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Duas abas lendo a timeline ao mesmo tempo esperam uma pela outra; o
      // indice unico por dia continua sendo a garantia, isto so poupa trabalho.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${recurrence.userId}))`);

      if (recurrence.target === "task" && (await templateParentIsDeleted(tx, occurrences as Task[]))) {
        occurrences = [];
      }

      for (const occurrence of occurrences) {
        if (recurrence.target === "event") await insertEventAggregate(tx, occurrence as Event);
        else await insertTaskAggregate(tx, occurrence as Task);
      }

      // So avanca a marca d'agua se ninguem editou a regra no meio do caminho:
      // senao estas ocorrencias sao da regra velha, e a transacao volta inteira.
      const advanced = await tx
        .update(schema.recurrences)
        .set({ materializedThrough: recurrence.materializedThrough ?? null })
        .where(
          and(
            eq(schema.recurrences.id, recurrence.id),
            eq(schema.recurrences.revision, recurrence.revision),
          ),
        )
        .returning({ id: schema.recurrences.id });
      if (advanced.length === 0) {
        throw new RecurrenceRevisionConflictError(
          `Recurrence ${recurrence.id} changed while materializing`,
        );
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

/**
 * Com o soft delete o pai continua na tabela e o FK aceita a subtarefa — que
 * ficaria visivel sob um pai escondido. Todas as ocorrencias vem do mesmo
 * template, entao o pai da primeira vale para a leva inteira.
 */
async function templateParentIsDeleted(tx: Tx, occurrences: readonly Task[]): Promise<boolean> {
  const parentTaskId = occurrences[0]?.parentTaskId;
  if (!parentTaskId) return false;

  const [parent] = await tx
    .select({ deletedAt: schema.tasks.deletedAt })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, parentTaskId));
  return parent?.deletedAt != null;
}

/** As ocorrencias de `fromDay` em diante que ninguem mexeu a mao. */
async function deleteUpcomingOccurrences(tx: Tx, recurrenceId: string, fromDay: string): Promise<void> {
  await tx
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.recurrenceId, recurrenceId),
        gte(schema.events.occurrenceOn, fromDay),
        eq(schema.events.recurrenceDetached, false),
      ),
    );
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
