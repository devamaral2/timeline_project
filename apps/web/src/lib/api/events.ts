import type {
  AgendaPageDto,
  CreateTaskInput,
  TaskCardDto,
  TaskDto,
  TaskPriority,
  TaskStatus,
  TagSuggestionDto,
  UpdateTaskInput,
} from "@repo/contracts";
import { apiRequest, newIdempotencyKey } from "./client-request";

/** Edição: a rota leva o `eventId`, então o corpo não o repete. `expectedRevision` vem do evento lido. */
export type EditEventInput = Omit<UpdateTaskInput, "taskId">;

/** Rota que cada função desta área chama, no formato do catálogo da API. `route-coverage.test.ts` confere. */
export const eventsRoutes = {
  listAgenda: "GET /api/events",
  listTrackedEvents: "GET /api/events/tracked",
  createEvent: "POST /api/events",
  getEvent: "GET /api/events/{eventId}",
  updateEvent: "PATCH /api/events/{eventId}",
  deleteEvent: "DELETE /api/events/{eventId}",
  suggestTags: "GET /api/tags",
} as const;

export interface AgendaWindow {
  from: string;
  to: string;
  actor?: "human" | "agent";
  tag?: string;
}

export interface TrackedFilters {
  actor?: "human" | "agent";
  status?: TaskStatus[];
  priority?: TaskPriority[];
  tag?: string;
  q?: string;
  longRunning?: boolean;
  from?: string;
  to?: string;
  limit?: number;
}

/** A agenda de uma janela, com todas as páginas: segue o `nextCursor` até acabar. */
export async function listAgenda(window: AgendaWindow): Promise<TaskCardDto[]> {
  const items: TaskCardDto[] = [];
  let cursor: string | undefined;
  do {
    const page = await apiRequest<AgendaPageDto>("GET", "/api/events", {
      query: { from: window.from, to: window.to, actor: window.actor, tag: window.tag, cursor },
    });
    items.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return items;
}

export function listTrackedEvents(filters: TrackedFilters = {}): Promise<TaskCardDto[]> {
  return apiRequest<TaskCardDto[]>("GET", "/api/events/tracked", {
    query: {
      actor: filters.actor,
      status: filters.status,
      priority: filters.priority,
      tag: filters.tag,
      q: filters.q,
      longRunning: filters.longRunning,
      from: filters.from,
      to: filters.to,
      limit: filters.limit,
    },
  });
}

/** Devolve o id do evento criado. Quem cria passa a chave de `newIdempotencyKey`, estável no formulário. */
export async function createEvent(
  input: CreateTaskInput,
  options: { idempotencyKey: string },
): Promise<string> {
  const created = await apiRequest<{ taskId: string }>("POST", "/api/events", {
    body: input,
    idempotencyKey: options.idempotencyKey,
  });
  return created.taskId;
}

export function getEvent(eventId: string): Promise<TaskDto> {
  return apiRequest<TaskDto>("GET", `/api/events/${encodeURIComponent(eventId)}`);
}

export function updateEvent(eventId: string, input: EditEventInput): Promise<void> {
  return apiRequest<void>("PATCH", `/api/events/${encodeURIComponent(eventId)}`, { body: input });
}

export function deleteEvent(eventId: string): Promise<void> {
  return apiRequest<void>("DELETE", `/api/events/${encodeURIComponent(eventId)}`);
}

export function suggestTags(query: string, limit?: number): Promise<TagSuggestionDto[]> {
  return apiRequest<TagSuggestionDto[]>("GET", "/api/tags", { query: { query, limit } });
}

export { newIdempotencyKey };
