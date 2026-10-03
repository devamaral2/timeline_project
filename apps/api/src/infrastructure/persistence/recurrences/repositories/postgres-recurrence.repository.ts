import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
  type Event,
  type NoteWrites,
  type Recurrence,
  type Task,
} from "../../../../domain";
import type { RecurrenceRepository } from "../../../../domain/ports";
import * as schema from "../../database/schema";
import { classifyUpdateFailure } from "../../shared/classify-update-failure";
import { insertEventAggregate, type Tx } from "../../events/repositories/postgres-event.repository";
import { insertTaskAggregate } from "../../tasks/repositories/postgres-task.repository";
import { writeNotes } from "../../notes/repositories/postgres-note.repository";
import { replaceRecurrenceNoteIds } from "../../notes/repositories/note-links";
import { pgTextArrayLiteral } from "../../shared/pg-text-array";
import { mapRecurrenceRow, recurrenceColumnsOf, type RecurrenceRow } from "../mappers/recurrence-row.mapper";

const errors = {
  notFound: (id: string) => () => new RecurrenceNotFoundError(`Recurrence not found: ${id}`),
  ownership: () => new RecurrenceOwnershipError(),
  conflict: (message: string) => new RecurrenceRevisionConflictError(message),
};

export class PostgresRecurrenceRepository implements RecurrenceRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async save(recurrence: Recurrence, notes?: NoteWrites): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.recurrences).values(recurrenceColumnsOf(recurrence));
      await writeNotes(tx, notes);
      await replaceRecurrenceNoteIds(tx, recurrence.id, recurrence.noteIds);
    });
  }

  async update(
    recurrence: Recurrence,
    actorUserId: string,
    expectedRevision: number,
    fromDay: string,
    notes?: NoteWrites,
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

      await writeNotes(tx, notes);
      await replaceRecurrenceNoteIds(tx, recurrence.id, recurrence.noteIds);
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
      // O vinculo herdado da serie vira da propria ocorrencia: a serie some, a note fica.
      await tx.execute(sql`
        UPDATE event_notes SET from_recurrence = false
        WHERE event_id IN (SELECT id FROM events WHERE recurrence_id = ${recurrenceId})
      `);
      await tx.execute(sql`
        UPDATE task_notes SET from_recurrence = false
        WHERE task_id IN (SELECT id FROM tasks WHERE recurrence_id = ${recurrenceId})
      `);

      const unlink = { recurrenceId: null, occurrenceOn: null, recurrenceDetached: false };
      await tx.update(schema.events).set(unlink).where(eq(schema.events.recurrenceId, recurrenceId));
      await tx.update(schema.tasks).set(unlink).where(eq(schema.tasks.recurrenceId, recurrenceId));

      await tx.delete(schema.recurrences).where(eq(schema.recurrences.id, recurrenceId));
    });
  }

  async attachNotes(
    recurrenceId: string,
    actorUserId: string,
    noteIds: readonly string[],
    fromDay: string,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [recurrence] = await tx
        .select({ userId: schema.recurrences.userId, target: schema.recurrences.targetKind })
        .from(schema.recurrences)
        .where(eq(schema.recurrences.id, recurrenceId));
      if (!recurrence) throw errors.notFound(recurrenceId)();
      if (recurrence.userId !== actorUserId) throw errors.ownership();

      // A mesma trava da materializacao: ou as ocorrencias novas ja nascem com
      // a note, ou esta transacao as ve e liga.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${recurrence.userId}))`);

      const linked = await tx
        .select({ noteId: schema.recurrenceNotes.noteId, position: schema.recurrenceNotes.position })
        .from(schema.recurrenceNotes)
        .where(eq(schema.recurrenceNotes.recurrenceId, recurrenceId));
      const already = new Set(linked.map((row) => row.noteId));
      const added = noteIds.filter((noteId) => !already.has(noteId));
      if (added.length === 0) return;

      const nextPosition = linked.reduce((max, row) => Math.max(max, row.position + 1), 0);
      await tx
        .insert(schema.recurrenceNotes)
        .values(added.map((noteId, index) => ({ recurrenceId, noteId, position: nextPosition + index })));

      // As ocorrencias de hoje em diante que ninguem destacou da serie ja existem
      // como linhas: a note entra no fim da lista de cada uma, sem tocar na revisao
      // delas — ligar a serie nao e uma edicao da ocorrencia.
      const [table, idColumn, linkTable] =
        recurrence.target === "event"
          ? (["events", "event_id", "event_notes"] as const)
          : (["tasks", "task_id", "task_notes"] as const);
      await tx.execute(sql`
        INSERT INTO ${sql.identifier(linkTable)} (${sql.identifier(idColumn)}, note_id, position, from_recurrence)
        SELECT o.id, n.note_id,
               COALESCE((SELECT max(l.position) + 1 FROM ${sql.identifier(linkTable)} l WHERE l.${sql.identifier(idColumn)} = o.id), 0)
                 + n.ord - 1,
               true
        FROM ${sql.identifier(table)} o
        CROSS JOIN unnest(${pgTextArrayLiteral(added)}::char(26)[]) WITH ORDINALITY AS n(note_id, ord)
        WHERE o.recurrence_id = ${recurrenceId}
          AND o.occurrence_on >= ${fromDay}
          AND o.recurrence_detached = false
          AND o.deleted_at IS NULL
        ON CONFLICT (${sql.identifier(idColumn)}, note_id) DO NOTHING
      `);

      // Uma geracao em andamento le a serie sem a note: a versao nova a faz recomecar.
      await tx
        .update(schema.recurrences)
        .set({ revision: sql`${schema.recurrences.revision} + 1`, updatedAt: sql`now()` })
        .where(eq(schema.recurrences.id, recurrenceId));
    });
  }

  async findById(recurrenceId: string): Promise<Recurrence | null> {
    const [row] = await this.db
      .select()
      .from(schema.recurrences)
      .where(eq(schema.recurrences.id, recurrenceId));
    if (!row) return null;
    const [recurrence] = await this.hydrate([row]);
    return recurrence ?? null;
  }

  async listByUserId(userId: string): Promise<Recurrence[]> {
    const rows = await this.db
      .select()
      .from(schema.recurrences)
      .where(eq(schema.recurrences.userId, userId))
      .orderBy(asc(schema.recurrences.startsOn), asc(schema.recurrences.id));
    return this.hydrate(rows);
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
    return this.hydrate(rows);
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

  /** As notes de "todas as ocorrencias" de cada serie, na ordem, numa consulta so. */
  private async hydrate(rows: readonly RecurrenceRow[]): Promise<Recurrence[]> {
    if (rows.length === 0) return [];

    const noteRows = await this.db
      .select({ recurrenceId: schema.recurrenceNotes.recurrenceId, noteId: schema.recurrenceNotes.noteId })
      .from(schema.recurrenceNotes)
      .innerJoin(schema.notes, eq(schema.recurrenceNotes.noteId, schema.notes.id))
      .where(
        and(
          inArray(
            schema.recurrenceNotes.recurrenceId,
            rows.map((row) => row.id),
          ),
          isNull(schema.notes.deletedAt),
        ),
      )
      .orderBy(asc(schema.recurrenceNotes.recurrenceId), asc(schema.recurrenceNotes.position));
    const noteIdsByRecurrence = new Map<string, string[]>();
    for (const { recurrenceId, noteId } of noteRows) {
      noteIdsByRecurrence.set(recurrenceId, [...(noteIdsByRecurrence.get(recurrenceId) ?? []), noteId]);
    }
    return rows.map((row) => mapRecurrenceRow(row, noteIdsByRecurrence.get(row.id) ?? []));
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
