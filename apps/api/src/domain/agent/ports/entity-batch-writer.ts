import type { Event } from "../../events/entities/event.entity";
import type { Note } from "../../notes/entities/note.entity";
import type { Recurrence } from "../../recurrences/entities/recurrence.entity";
import type { Task } from "../../tasks/entities/task.entity";

/** `expectedRevision` e a revisao lida quando a mudanca foi preparada. */
export type StagedChange<T> =
  | { op: "create"; entity: T }
  | { op: "update"; entity: T; expectedRevision: number }
  | { op: "delete"; id: string; expectedRevision: number };

/**
 * Mudanca numa serie que ja existe. Vale de `fromDay` em diante: as ocorrencias
 * desse dia para frente que ninguem destacou saem, e o passado fica.
 */
export type RecurrenceChange =
  | { op: "update"; recurrence: Recurrence; expectedRevision: number; fromDay: string }
  | { op: "delete"; id: string; fromDay: string };

export interface EntityBatch {
  userId: string;
  events: StagedChange<Event>[];
  tasks: StagedChange<Task>[];
  notes: StagedChange<Note>[];
  /**
   * Series novas. A serie e gravada antes das ocorrencias que o lote tambem
   * traz (a primeira, que o agente ja mostra na resposta); as demais saem da
   * materializacao preguicosa, na proxima leitura da timeline ou das tarefas.
   */
  recurrences?: readonly Recurrence[];
  /**
   * Series alteradas ou apagadas. Entram antes das ocorrencias novas do lote
   * (a primeira da serie revisada nasce no dia que a mudanca acabou de liberar).
   */
  recurrenceChanges?: readonly RecurrenceChange[];
  /**
   * Roda na mesma transacao, depois das entidades e antes de o job ser concluido: o que ela grava
   * (o passo de um processo, a fila de finalizacao) existe se e somente se as entidades existem.
   * O argumento e a transacao do escritor; so a infraestrutura que a entrega sabe o tipo.
   */
  afterWrite?: (tx: unknown) => Promise<void>;
}

/** O que o escritor devolve ao confirmar o lote; hoje nada alem do sucesso. */
export type EntityBatchResult = Record<string, never>;

/**
 * Grava o lote inteiro numa transacao so. Se qualquer alvo sumiu, mudou de
 * revisao ou nao e do usuario, nada e gravado (`EntityBatchConflictError`).
 */
export interface EntityBatchWriter {
  commit(batch: EntityBatch): Promise<EntityBatchResult>;
}
