import type { EventPriority } from "../types/event-priority";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";
import type { CreateNoteInput } from "../../notes/contracts/note.dto";
import type { EventKind } from "../types/event-kind";

export interface CreateEventInput {
  name?: string;
  description?: string;
  tags?: string[];
  /** Anotacao do usuario: um evento so nasce marcado se alguem disser isso. */
  missed?: boolean;
  priority?: EventPriority;
  /** Ausente nasce com aviso de 5 minutos antes — so uma lista vazia explicita desliga. */
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  /**
   * Quando o evento comeca, em ISO-8601. Ausente significa agora -- e nao "so
   * pode ser agora": a timeline registra passado, presente e futuro.
   */
  startedAt?: string;
  /** Quando o evento termina, em ISO-8601. Ausente estima pela duracao tipica do `kind`. */
  finishedAt?: string;
  /** A natureza do evento. Ausente e rotina. Nao exige nenhuma note. */
  kind?: EventKind;
  /** Notes novas, criadas junto com o evento, na ordem em que aparecem. */
  notes?: CreateNoteInput[];
  /** Notes que ja existem e passam a aparecer no evento, depois das novas. */
  noteIds?: string[];
  taskIds?: string[];
}
