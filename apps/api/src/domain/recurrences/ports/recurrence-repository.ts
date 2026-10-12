import type { NoteWrites } from "../../notes/types/note-writes";
import type { Event } from "../../events/entities/event.entity";
import type { Task } from "../../tasks/entities/task.entity";
import type { Recurrence } from "../entities/recurrence.entity";

export interface RecurrenceRepository {
  /** `notes`: as notes novas do template, gravadas antes e na mesma transacao dos vinculos da serie. */
  save(recurrence: Recurrence, notes?: NoteWrites): Promise<void>;
  /**
   * Grava a regra revisada e, na mesma transacao, apaga as ocorrencias de
   * `fromDay` em diante que ninguem destacou da serie. As proximas leituras
   * regeram essas ocorrencias com a regra nova.
   */
  update(
    recurrence: Recurrence,
    actorUserId: string,
    expectedRevision: number,
    fromDay: string,
    notes?: NoteWrites,
  ): Promise<void>;
  /**
   * Apaga a regra e as ocorrencias de `fromDay` em diante. As anteriores ficam:
   * sao historia, e perdem so o vinculo com a serie.
   */
  delete(recurrenceId: string, actorUserId: string, fromDay: string): Promise<void>;
  /**
   * Liga as notes a "todas as ocorrencias": passam a fazer parte da serie, e as
   * ocorrencias de `fromDay` em diante que ja existem e nao foram destacadas
   * ganham o vinculo — as passadas e as destacadas ficam como estao. As
   * ocorrencias geradas depois herdam da serie.
   */
  attachNotes(recurrenceId: string, actorUserId: string, noteIds: readonly string[], fromDay: string): Promise<void>;
  findById(recurrenceId: string): Promise<Recurrence | null>;
  /**
   * A proxima ocorrencia (de `fromDay` em diante) que editar ou apagar a serie
   * levaria embora: nao destacada e nao apagada. Serve para a resposta do
   * agente mostrar o que mudou, sem listar a serie inteira.
   */
  findNextOccurrenceId(recurrenceId: string, fromDay: string): Promise<string | null>;
  listByUserId(userId: string): Promise<Recurrence[]>;
  /** Regras do usuario cuja marca d'agua ainda nao chegou em `horizon`. */
  listPendingMaterialization(userId: string, horizon: string): Promise<Recurrence[]>;
  listExceptions(recurrenceId: string): Promise<string[]>;
  /** Pula um dia da serie: a ocorrencia dele nao volta quando a serie for regerada. */
  addException(recurrenceId: string, dayKey: string): Promise<void>;
  /**
   * Insere as ocorrencias ja montadas e avanca a marca d'agua, tudo numa
   * transacao so. Uma ocorrencia de um dia que ja existe e ignorada — duas
   * leituras ao mesmo tempo nao duplicam nada.
   */
  materialize(recurrence: Recurrence, occurrences: Event[] | Task[]): Promise<void>;
}
