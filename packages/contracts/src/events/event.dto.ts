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
  /** Onde acontece, como o texto que o Google Maps entende; vazio sem local. So eventos de pessoa tem. */
  location: string;
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
  /** Os eventos de que este se segue ("segue-se de"): os que vem antes dele na sequencia. */
  previousEventIds: string[];
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

/**
 * Um pedido ao agente que criou ou alterou o evento ("criado por", "atualizado
 * por"). A lista tem uma linha por relacao: o evento criado por um pedido e
 * alterado depois por outro traz as duas.
 */
export interface EventRequestDto {
  /** O evento do pedido: a tela de detalhe dele abre por este id. */
  id: string;
  /** O inicio do que o usuario pediu. */
  name: string;
  relation: "generates" | "updates";
  /** Quando o pedido gravou a mudanca (ISO 8601). */
  at: string;
}

export interface EventDto extends EventCardDto {
  /** Os artefatos do evento, na ordem em que aparecem. */
  artifacts: EventArtifactDto[];
  /** Os eventos que se seguem a este ("da sequencia a"). */
  nextEventIds: string[];
  /** Os pedidos que criaram e alteraram o evento, do mais antigo ao mais novo. So o detalhe traz. */
  requests: EventRequestDto[];
}

export interface AgendaPageDto {
  items: EventCardDto[];
  nextCursor?: string;
}
