import type { EventPriority } from "../types/event-priority";
import type { NotificationOffsetMinutes } from "../../notifications/types/notification-offset-minutes";
import type { CreateEventItemInput } from "./event-item.dto";

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
  /** Quando o evento termina, em ISO-8601. Ausente estima pela duracao tipica do item principal. */
  finishedAt?: string;
  items: CreateEventItemInput[];
  taskIds?: string[];
}
