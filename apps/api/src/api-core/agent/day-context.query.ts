import type { EventKind } from "../../domain";

export interface DayContextEvent {
  id: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  recurrence_id: string | null;
  taskIds: string[];
  kind?: EventKind;
  [key: string]: unknown;
}

export interface DayContext {
  date: string;
  timeZone: string;
  events: DayContextEvent[];
  tasks: Array<{ id: string; [key: string]: unknown }>;
  notes: Array<{ id: string; [key: string]: unknown }>;
}

export interface DayContextQuery {
  get(input: { userId: string; date: string }): Promise<DayContext>;
}
