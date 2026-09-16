import type { EventPriority } from "../types/event-priority";
import type { CreateEventItemInput } from "./event-item.dto";

export interface CreateEventInput {
  name?: string;
  description?: string;
  tags?: string[];
  /** Anotacao do usuario: um evento so nasce marcado se alguem disser isso. */
  missed?: boolean;
  priority?: EventPriority;
  /**
   * Quando o evento comeca, em ISO-8601. Ausente significa agora -- e nao "so
   * pode ser agora": a timeline registra passado, presente e futuro.
   */
  startedAt?: string;
  /** Quando o evento termina, em ISO-8601. Ausente e um evento sem fim declarado. */
  finishedAt?: string;
  items: CreateEventItemInput[];
  taskIds?: string[];
}
