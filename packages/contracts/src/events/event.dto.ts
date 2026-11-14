import type { ArtifactDto, ArtifactType } from "../artifacts/artifact.dto";
import type { RecurrenceRule } from "../recurrences/recurrence-rule";
import type { EventActor, EventArtifactRelation, EventKind, EventPriority, EventStatus } from "./event-types";
import type { NotificationOffsetMinutes } from "./notification-offset-minutes";

/** A serie de que o evento e uma ocorrencia. */
export interface EventRecurrenceDto {
  id: string;
  /** O dia civil da ocorrencia, `YYYY-MM-DD`. */
  occurrenceOn: string;
  /** Alguem editou esta ocorrencia: ela deixou de acompanhar a serie. */
  detached: boolean;
  rule: RecurrenceRule;
}

/**
 * O cartao da agenda e da lista de tarefas: as duas telas usam o mesmo. Todo
 * campo e o dado como esta gravado; rotulos ("Hoje", "ha 12 min", "atrasado")
 * sao calculados na tela.
 */
export interface EventCardDto {
  id: string;
  actor: EventActor;
  kind: EventKind;
  /** Ausente no evento de referencia, que so marca um horario. */
  status?: EventStatus;
  priority: EventPriority;
  name: string;
  description: string;
  /** Inicio planejado. A meia-noite local significa "o dia, sem hora". */
  startedAt?: string;
  /** Fim planejado: o fim do bloco ou, no evento longo, o prazo. */
  estimatedFinishAt?: string;
  /** Conclusao real. */
  finishedAt?: string;
  /** Evento longo: fica fora da agenda. */
  longRunning: boolean;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  tags: string[];
  /** Os tipos dos artefatos do evento, na ordem em que aparecem. */
  artifactTypes: ArtifactType[];
  /** Os eventos maiores de que este e subtarefa. */
  parentEventIds: string[];
  /** Os eventos que precisam terminar antes deste. */
  blockedByEventIds: string[];
  recurrence?: EventRecurrenceDto;
  /** Para o `PATCH` direto da lista (`expectedRevision`), sem ler o detalhe antes. */
  revision: number;
}

export interface EventArtifactDto {
  relation: EventArtifactRelation;
  /** O vinculo veio da serie, e nao de uma edicao desta ocorrencia. */
  fromRecurrence: boolean;
  artifact: ArtifactDto;
}

export interface EventDto extends EventCardDto {
  /** Os artefatos do evento, na ordem em que aparecem. */
  artifacts: EventArtifactDto[];
  /** Os eventos em que este se desdobra. */
  subtaskEventIds: string[];
  /** Os eventos que so sao liberados quando este termina. */
  blocksEventIds: string[];
}

export interface AgendaPageDto {
  items: EventCardDto[];
  nextCursor?: string;
}
