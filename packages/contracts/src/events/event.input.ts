import type { ArtifactDataInput, CreateArtifactInput } from "../artifacts/artifact.input";
import type { GeoPointInput } from "./place-suggestion.dto";
import type { EventArtifactRelation, EventPriority, HumanEventKind, HumanEventStatus } from "./event-types";
import type { NotificationOffsetMinutes } from "./notification-offset-minutes";

/**
 * Um alimento que ja existe, comido neste evento. O evento nao usa o original:
 * ganha uma copia so dele, com a quantidade, para que editar o original nao
 * mude o passado.
 */
export interface EventFoodCopyInput {
  copyOf: string;
  /** Quanto foi comido: "1 prato", "2 fatias". */
  quantity?: string;
}

/** Um artefato novo que nasce junto com o evento. */
export type CreateEventArtifactInput = CreateArtifactInput | EventFoodCopyInput;

/**
 * Uma entrada da lista de artefatos de um evento ao editar. Com `id` e sem
 * `data`, o artefato que existe so entra (ou continua) na lista; com `id` e
 * `data`, ele tambem e editado; sem `id`, nasce um artefato novo.
 */
export type UpdateEventArtifactInput =
  | { id: string; relation?: EventArtifactRelation; type?: undefined; data?: undefined; name?: string; tags?: string[] }
  | ({ id?: string; relation?: EventArtifactRelation; name?: string; tags?: string[]; schemaVersion?: number } & ArtifactDataInput)
  | EventFoodCopyInput;

interface EventFields {
  name?: string;
  description?: string;
  /** Onde acontece; vazio apaga. Evento de pessoa apenas. */
  location?: string;
  priority?: EventPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  /** Evento longo: fica fora da agenda, tem sempre status e nao se repete. */
  longRunning?: boolean;
  /** Os eventos de que este se segue ("segue-se de"): a lista completa. Qualquer evento, de pessoa ou de agente. */
  previousEventIds?: string[];
  /** Os eventos que se seguem a este ("da sequencia a"): a lista completa. Nenhum evento e revisado por isso. */
  nextEventIds?: string[];
}

export interface CreateEventInput extends EventFields {
  /** A natureza do evento. Ausente e rotina. */
  kind?: HumanEventKind;
  /** Ausente, o evento nasce de referencia: so marca um horario. O evento longo nasce `todo`. */
  status?: HumanEventStatus;
  /** Inicio planejado, em ISO-8601. Ausente no evento de referencia significa agora. */
  startedAt?: string;
  /** Fim planejado. Ausente no evento de referencia, e estimado pela duracao tipica do `kind`. */
  estimatedFinishAt?: string;
  /** Conclusao real. */
  finishedAt?: string;
  /**
   * Onde a pessoa esta ao criar. Sem `location`, a API usa o endereco destas coordenadas como local. Nao e
   * guardado no evento.
   */
  coordinates?: GeoPointInput;
  /** Artefatos novos, criados junto com o evento, na ordem em que aparecem. */
  artifacts?: CreateEventArtifactInput[];
  /** Artefatos que ja existem e passam a aparecer no evento, depois dos novos. */
  artifactIds?: string[];
}

/** `null` apaga o campo: sem status, o evento volta a ser de referencia. */
export interface UpdateEventInput extends EventFields {
  eventId: string;
  expectedRevision: number;
  kind?: HumanEventKind;
  status?: HumanEventStatus | null;
  startedAt?: string | null;
  estimatedFinishAt?: string | null;
  finishedAt?: string | null;
  /** A lista completa de artefatos do evento, na ordem. Os que saem dela deixam de aparecer, mas nao sao apagados. */
  artifacts?: UpdateEventArtifactInput[];
}
