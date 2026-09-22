import type { Event } from "../../events/entities/event.entity";
import type { Task } from "../../tasks/entities/task.entity";
import type { Recurrence } from "../entities/recurrence.entity";

export interface RecurrenceRepository {
  save(recurrence: Recurrence): Promise<void>;
  /**
   * Grava a regra revisada e, na mesma transacao, apaga as ocorrencias de
   * `fromDay` em diante que ninguem destacou da serie. As proximas leituras
   * regeram essas ocorrencias com a regra nova.
   */
  update(recurrence: Recurrence, actorUserId: string, expectedRevision: number, fromDay: string): Promise<void>;
  /**
   * Apaga a regra e as ocorrencias de `fromDay` em diante. As anteriores ficam:
   * sao historia, e perdem so o vinculo com a serie.
   */
  delete(recurrenceId: string, actorUserId: string, fromDay: string): Promise<void>;
  findById(recurrenceId: string): Promise<Recurrence | null>;
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
