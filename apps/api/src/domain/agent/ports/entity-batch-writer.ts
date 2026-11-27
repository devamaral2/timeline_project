import type { Artifact } from "../../artifacts/entities/artifact.entity";
import type { Task } from "../../tasks/entities/task.entity";
import type { Recurrence } from "../../recurrences/entities/recurrence.entity";

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

/**
 * Uma aresta da hierarquia entre tarefas: `parentId` e a tarefa principal de
 * `subtaskId`. Nenhuma das duas tarefas e revisada. Pôr uma subtarefa sob
 * outra principal tira a ligacao com a anterior: cada tarefa tem uma so.
 */
export interface SubtaskChange {
  op: "add" | "remove";
  parentId: string;
  subtaskId: string;
}

export interface EntityBatch {
  userId: string;
  /** O pedido que gerou o lote: as tarefas e as series novas ficam no projeto dele. */
  requestId?: string;
  tasks: StagedChange<Task>[];
  /** Entram antes das tarefas: as relacoes de uma tarefa apontam para eles. */
  artifacts: StagedChange<Artifact>[];
  /** De qual original saiu cada copia nova do lote. */
  derivations?: readonly { originalId: string; copyId: string }[];
  /**
   * A hierarquia entre tarefas. Entra depois de todas as tarefas do lote, para
   * que uma ponta possa ser uma tarefa nova do mesmo lote.
   */
  subtasks?: readonly SubtaskChange[];
  /**
   * Series novas. A serie e gravada antes das ocorrencias que o lote tambem
   * traz (a primeira, que o agente ja mostra na resposta); as demais saem da
   * materializacao preguicosa, na proxima leitura da agenda ou das tarefas.
   */
  recurrences?: readonly Recurrence[];
  /**
   * Series alteradas ou apagadas. Entram antes das ocorrencias novas do lote
   * (a primeira da serie revisada nasce no dia que a mudanca acabou de liberar).
   */
  recurrenceChanges?: readonly RecurrenceChange[];
  /**
   * Roda na mesma transacao, depois das entidades: o que ela grava (o passo de
   * um pedido, a relacao do passo com o que ele tocou) existe se e somente se
   * as entidades existem. O argumento e a transacao do escritor; so a
   * infraestrutura que a entrega sabe o tipo.
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
