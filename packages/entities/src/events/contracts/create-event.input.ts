import type { EventPriority } from "../types/event-priority";
import type { CreateEventItemInput } from "./event-item.dto";

export interface CreateEventInput {
  name?: string;
  description?: string;
  tags?: string[];
  /** Anotacao do usuario: um evento so nasce marcado se alguem disser isso. */
  missed?: boolean;
  priority?: EventPriority;
  items: CreateEventItemInput[];
}
