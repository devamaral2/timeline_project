export interface DayContextEvent {
  id: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  recurrence_id: string | null;
  taskIds: string[];
  items?: Array<{ type: string; is_primary: boolean }>;
  [key: string]: unknown;
}

export interface DayContext {
  date: string;
  timeZone: string;
  events: DayContextEvent[];
  tasks: Array<{ id: string; [key: string]: unknown }>;
  notes: Array<{ id: string; event_id?: string | null; task_id?: string | null; [key: string]: unknown }>;
}

export interface DayContextQuery {
  get(input: { userId: string; date: string }): Promise<DayContext>;
}
