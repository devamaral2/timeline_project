import type { Recurrence } from "../../recurrences/entities/recurrence.entity";
import type { Actor, EventPriority, EventStatus } from "../../sets";
import type { Event } from "../entities/event.entity";

/** O que o cartao da agenda e da lista de tarefas mostra de um evento. */
export interface EventCard {
  event: Event;
  /** Os tipos dos artefatos do evento, na ordem em que aparecem. */
  artifactTypes: string[];
  /** A serie de que o evento e uma ocorrencia, para o cartao mostrar a regra. */
  recurrence?: Recurrence;
}

/** A janela da agenda: eventos com inicio, sem os longos e sem os passos. */
export interface AgendaQueryParams {
  userId: string;
  from?: Date;
  to?: Date;
  /** Ausente, pessoa e agente juntos. */
  actor?: Actor;
  kind?: string;
  tag?: string;
  cursor?: string;
  limit: number;
}

export interface AgendaPage {
  items: EventCard[];
  nextCursor?: string;
}

/** A lista de tarefas: eventos com status, incluindo os longos e sem os passos. */
export interface TrackedQueryParams {
  userId: string;
  actor?: Actor;
  status?: EventStatus[];
  priority?: EventPriority[];
  tag?: string;
  /** Busca no nome, sem diferenciar maiusculas. Ja normalizada (minuscula). */
  q?: string;
  /** Janela sobre o inicio planejado, ou o fim planejado quando nao ha inicio. Evento sem as duas datas fica de fora. */
  from?: Date;
  to?: Date;
  /** So os eventos longos, ou so os que nao sao. */
  longRunning?: boolean;
  limit?: number;
}

/** As leituras que alimentam o cartao da agenda e da lista de tarefas. */
export interface EventCardQuery {
  /** Do mais novo para o mais antigo, em paginas. */
  agenda(params: AgendaQueryParams): Promise<AgendaPage>;
  /** Uma serie aparece uma vez so, pela proxima ocorrencia em aberto. */
  tracked(params: TrackedQueryParams): Promise<EventCard[]>;
  /** Os eventos em que `parentEventId` se desdobra. */
  subtasks(params: { userId: string; parentEventId: string }): Promise<EventCard[]>;
  /** Os cartoes dos eventos vivos entre os ids, na ordem dos ids. */
  cardsOf(eventIds: readonly string[]): Promise<EventCard[]>;
}
