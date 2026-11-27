import { sql } from "drizzle-orm";
import {
  EntityBatchConflictError,
  TaskValidationError,
  RecurrenceNotFoundError,
  RecurrenceOwnershipError,
  RecurrenceRevisionConflictError,
} from "../../../domain";
import type {
  EntityBatch,
  EntityBatchResult,
  EntityBatchWriter,
  RecurrenceChange,
  StagedChange,
} from "../../../domain/ports";
import { completeCurrentJob } from "../../jobs/job-context";
import {
  insertArtifact,
  insertDerivations,
  softDeleteArtifact,
  updateArtifactAggregate,
} from "../artifacts/repositories/postgres-artifact.repository";
import { applySubtaskChanges } from "../tasks/repositories/task-relations";
import {
  insertTaskAggregate,
  softDeleteTask,
  updateTaskAggregate,
} from "../tasks/repositories/postgres-task.repository";
import {
  deleteRecurrenceAggregate,
  insertRecurrenceAggregate,
  updateRecurrenceAggregate,
} from "../recurrences/repositories/postgres-recurrence.repository";
import type { Db, Tx } from "../shared/tx";

type TargetTable = "tasks" | "artifacts";

interface LockedRow extends Record<string, unknown> {
  id: string;
  revision: number;
}

export class PostgresEntityBatchWriter implements EntityBatchWriter {
  constructor(private readonly db: Db) {}

  async commit(batch: EntityBatch): Promise<EntityBatchResult> {
    // O que nasce de um pedido fica no projeto dele.
    const scope = batch.requestId ? { requestId: batch.requestId } : undefined;
    return this.db.transaction(async (tx): Promise<EntityBatchResult> => {
      await lockTargets(tx, "tasks", batch.userId, batch.tasks);
      await lockTargets(tx, "artifacts", batch.userId, batch.artifacts);

      // Artefatos primeiro: as relacoes de uma tarefa apontam para eles.
      for (const artifact of created(batch.artifacts)) {
        await insertArtifact(tx, artifact);
      }
      for (const change of batch.artifacts) {
        if (change.op === "update") {
          await updateArtifactAggregate(tx, change.entity, batch.userId, change.expectedRevision);
        }
      }
      await insertDerivations(tx, batch.derivations ?? []);

      // A serie antes das ocorrencias: elas apontam para ela por `recurrence_id`.
      for (const recurrence of batch.recurrences ?? []) {
        await insertRecurrenceAggregate(tx, recurrence, scope);
      }
      // Antes das ocorrencias novas: a serie revisada libera o dia da primeira delas.
      for (const change of batch.recurrenceChanges ?? []) {
        await applyRecurrenceChange(tx, batch.userId, change);
      }

      try {
        for (const task of created(batch.tasks)) {
          if (!(await insertTaskAggregate(tx, task, undefined, scope))) {
            throw new EntityBatchConflictError(`Tarefa ${task.id} já existe`);
          }
        }
        for (const change of batch.tasks) {
          if (change.op === "update") {
            await updateTaskAggregate(tx, change.entity, batch.userId, change.expectedRevision);
          }
        }
        // Depois de todas as tarefas: uma ponta da hierarquia pode ser uma tarefa nova do lote.
        await applySubtaskChanges(tx, batch.userId, batch.subtasks ?? []);
      } catch (error) {
        // Um alvo de relacao que sumiu entre preparar e gravar: o lote inteiro volta.
        if (error instanceof TaskValidationError && /not found/.test(error.message)) {
          throw new EntityBatchConflictError(error.message);
        }
        throw error;
      }

      // O artefato apagado continua ligado à tarefa (soft delete); a leitura o esconde.
      for (const change of batch.artifacts) {
        if (change.op === "delete") await softDeleteArtifact(tx, change.id, batch.userId);
      }
      for (const change of batch.tasks) {
        if (change.op === "delete") await softDeleteTask(tx, change.id, batch.userId);
      }

      await batch.afterWrite?.(tx);
      await completeCurrentJob(tx);
      return {};
    });
  }
}

async function applyRecurrenceChange(tx: Tx, userId: string, change: RecurrenceChange): Promise<void> {
  try {
    if (change.op === "update") {
      await updateRecurrenceAggregate(tx, change.recurrence, userId, change.expectedRevision, change.fromDay);
    } else {
      await deleteRecurrenceAggregate(tx, change.id, userId, change.fromDay);
    }
  } catch (error) {
    // O lote inteiro volta: quem leu a serie antes de outra requisicao mexer nela tenta de novo.
    if (
      error instanceof RecurrenceRevisionConflictError ||
      error instanceof RecurrenceNotFoundError ||
      error instanceof RecurrenceOwnershipError
    ) {
      throw new EntityBatchConflictError(error.message);
    }
    throw error;
  }
}

function created<T>(changes: readonly StagedChange<T>[]): T[] {
  return changes.flatMap((change) => (change.op === "create" ? [change.entity] : []));
}

/**
 * Trava as linhas alvo e confere dono, existencia e revisao antes de qualquer
 * escrita. `ORDER BY id` fixa a ordem das travas entre requisicoes paralelas.
 */
async function lockTargets<T extends { id: string }>(
  tx: Tx,
  table: TargetTable,
  userId: string,
  changes: readonly StagedChange<T>[],
): Promise<void> {
  const expected = new Map<string, number>();
  for (const change of changes) {
    if (change.op === "update") expected.set(change.entity.id, change.expectedRevision);
    if (change.op === "delete") expected.set(change.id, change.expectedRevision);
  }
  if (expected.size === 0) return;

  const ids = [...expected.keys()];
  const locked = await tx.execute<LockedRow>(sql`
    SELECT id, revision FROM ${sql.identifier(table)}
    WHERE id IN ${ids} AND user_id = ${userId} AND deleted_at IS NULL
    ORDER BY id
    FOR UPDATE
  `);
  const found = new Map(locked.rows.map((row) => [row.id, Number(row.revision)]));
  for (const [id, revision] of expected) {
    if (!found.has(id)) {
      throw new EntityBatchConflictError(`${table}: ${id} não existe mais ou não pertence ao usuário`);
    }
    if (found.get(id) !== revision) {
      throw new EntityBatchConflictError(`${table}: ${id} foi alterado por outra requisição`);
    }
  }
}
