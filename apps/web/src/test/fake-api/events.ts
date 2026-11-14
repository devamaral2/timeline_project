import type { CreateEventInput, EventCardDto, EventDto } from "@repo/contracts";
import {
  agendaPageSchema,
  createEventInputSchema,
  eventCardSchema,
  eventSchema,
  tagSuggestionSchema,
  updateEventInputSchema,
} from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeArea, FakeRequest, FakeResult, FakeStore } from ".";

/** Área de eventos: agenda, lista de tarefas, evento, subtarefas e tags. */

const EVENTS = "events";
const CARD_KEYS = [
  "id", "actor", "kind", "status", "priority", "name", "description", "startedAt", "estimatedFinishAt",
  "finishedAt", "longRunning", "notifyOffsetsMinutes", "tags", "artifactTypes", "parentEventIds",
  "blockedByEventIds", "recurrence", "revision",
] as const;
/** Campos que a edição aceita e que o fake aplica; `artifacts` fica para a área de artefatos. */
const EDITABLE_KEYS = [
  "name", "description", "priority", "notifyOffsetsMinutes", "tags", "longRunning", "subtaskEventIds",
  "blocksEventIds", "parentEventIds", "blockedByEventIds", "kind", "status", "startedAt", "estimatedFinishAt", "finishedAt",
] as const;

const createdEventSchema = z.object({ eventId: z.string() }).strict();

/** Um evento completo para o seed: os campos que você não passa ganham o padrão de uma tarefa de pessoa. */
export function eventFixture(overrides: Partial<EventDto> & { id: string }): EventDto {
  return eventSchema.parse({
    actor: "human",
    kind: "routine",
    status: "todo",
    priority: "medium",
    name: "Evento",
    description: "",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    parentEventIds: [],
    blockedByEventIds: [],
    revision: 1,
    artifacts: [],
    subtaskEventIds: [],
    blocksEventIds: [],
    ...overrides,
  });
}

type StoredEvent = EventDto;

function table(store: FakeStore) {
  return store.table<StoredEvent>(EVENTS);
}

function toCard(event: StoredEvent): EventCardDto {
  const card: Record<string, unknown> = {};
  for (const key of CARD_KEYS) if (event[key] !== undefined) card[key] = event[key];
  return card as unknown as EventCardDto;
}

function instant(value: string | null): number | undefined {
  if (value === null) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NaN : time;
}

function byStart(a: StoredEvent, b: StoredEvent): number {
  const left = a.startedAt ? Date.parse(a.startedAt) : Number.POSITIVE_INFINITY;
  const right = b.startedAt ? Date.parse(b.startedAt) : Number.POSITIVE_INFINITY;
  return left - right || a.id.localeCompare(b.id);
}

function listParam(request: FakeRequest, name: string): string[] | undefined {
  const raw = request.query.get(name);
  return raw ? raw.split(",") : undefined;
}

function inWindow(event: StoredEvent, from: number | undefined, to: number | undefined): boolean {
  if (from === undefined && to === undefined) return true;
  if (!event.startedAt) return false;
  const at = Date.parse(event.startedAt);
  return (from === undefined || at >= from) && (to === undefined || at < to);
}

function agenda(request: FakeRequest, store: FakeStore): FakeResult {
  const from = instant(request.query.get("from"));
  const to = instant(request.query.get("to"));
  if (from === undefined || to === undefined || Number.isNaN(from) || Number.isNaN(to)) return { status: 400 };

  const actor = request.query.get("actor") ?? undefined;
  const tag = request.query.get("tag") ?? undefined;
  const cursor = request.query.get("cursor");
  const offset = cursor === null ? 0 : Number(cursor);
  if (!Number.isInteger(offset) || offset < 0) return { status: 400 };
  const limit = Math.min(Number(request.query.get("limit") ?? store.pageSize), 100);

  // A agenda mostra o que tem horário e não é evento longo; passos nunca aparecem.
  const events = [...table(store).values()]
    .filter((event) => event.kind !== "step" && !event.longRunning)
    .filter((event) => inWindow(event, from, to))
    .filter((event) => !actor || event.actor === actor)
    .filter((event) => !tag || event.tags.includes(tag))
    .sort(byStart);

  const items = events.slice(offset, offset + limit).map(toCard);
  const next = offset + limit < events.length ? { nextCursor: String(offset + limit) } : {};
  return { status: 200, body: { items, ...next } };
}

function tracked(request: FakeRequest, store: FakeStore): FakeResult {
  const actor = request.query.get("actor") ?? undefined;
  const statuses = listParam(request, "status");
  const priorities = listParam(request, "priority");
  const tag = request.query.get("tag") ?? undefined;
  const q = request.query.get("q")?.toLocaleLowerCase("pt-BR");
  const longRunning = request.query.get("longRunning");
  const from = instant(request.query.get("from"));
  const to = instant(request.query.get("to"));
  if (longRunning !== null && longRunning !== "true" && longRunning !== "false") return { status: 400 };
  if (from !== undefined && to !== undefined && (Number.isNaN(from) || Number.isNaN(to))) return { status: 400 };

  const events = [...table(store).values()]
    .filter((event) => event.status !== undefined)
    .filter((event) => !actor || event.actor === actor)
    .filter((event) => !statuses || (event.status !== undefined && statuses.includes(event.status)))
    .filter((event) => !priorities || priorities.includes(event.priority))
    .filter((event) => !tag || event.tags.includes(tag))
    .filter((event) => !q || `${event.name} ${event.description}`.toLocaleLowerCase("pt-BR").includes(q))
    .filter((event) => longRunning === null || event.longRunning === (longRunning === "true"))
    .filter((event) => (from === undefined && to === undefined) || inWindow(event, from, to))
    .sort(byStart)
    .slice(0, Math.min(Number(request.query.get("limit") ?? 100), 100));

  return { status: 200, body: events.map(toCard) };
}

function create(request: FakeRequest, store: FakeStore): FakeResult {
  const input = request.body as CreateEventInput;
  const id = store.nextId("ev");
  const event: StoredEvent = eventSchema.parse({
    id,
    actor: "human",
    kind: input.kind ?? "routine",
    status: input.status ?? (input.longRunning ? "todo" : undefined),
    priority: input.priority ?? "medium",
    name: input.name ?? "",
    description: input.description ?? "",
    startedAt: input.startedAt,
    estimatedFinishAt: input.estimatedFinishAt,
    finishedAt: input.finishedAt,
    longRunning: input.longRunning ?? false,
    notifyOffsetsMinutes: input.notifyOffsetsMinutes ?? [],
    tags: input.tags ?? [],
    artifactTypes: [],
    parentEventIds: input.parentEventIds ?? [],
    blockedByEventIds: input.blockedByEventIds ?? [],
    revision: 1,
    artifacts: [],
    subtaskEventIds: input.subtaskEventIds ?? [],
    blocksEventIds: input.blocksEventIds ?? [],
  });
  table(store).set(id, event);
  return { status: 201, body: createdEventSchema.parse({ eventId: id }) };
}

function read(request: FakeRequest, store: FakeStore): FakeResult {
  const event = table(store).get(request.params.eventId ?? "");
  if (!event) return { status: 404 };
  return { status: 200, body: event };
}

function update(request: FakeRequest, store: FakeStore): FakeResult {
  const event = table(store).get(request.params.eventId ?? "");
  if (!event) return { status: 404 };
  const input = request.body as Record<string, unknown> & { expectedRevision: number };
  if (input.expectedRevision !== event.revision) return { status: 409 };

  const next: Record<string, unknown> = { ...event };
  for (const key of EDITABLE_KEYS) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === null) delete next[key];
    else next[key] = value;
  }
  next.revision = event.revision + 1;
  table(store).set(event.id, eventSchema.parse(next));
  return { status: 204 };
}

function remove(request: FakeRequest, store: FakeStore): FakeResult {
  const id = request.params.eventId ?? "";
  if (!table(store).delete(id)) return { status: 404 };
  return { status: 204 };
}

function subtasks(request: FakeRequest, store: FakeStore): FakeResult {
  const event = table(store).get(request.params.eventId ?? "");
  if (!event) return { status: 404 };
  const cards = event.subtaskEventIds
    .map((id) => table(store).get(id))
    .filter((child): child is StoredEvent => child !== undefined)
    .map(toCard);
  return { status: 200, body: cards };
}

function suggestTags(request: FakeRequest, store: FakeStore): FakeResult {
  const prefix = (request.query.get("query") ?? "").toLocaleLowerCase("pt-BR");
  const limit = Math.min(Number(request.query.get("limit") ?? 10), 100);
  const names = new Set<string>();
  for (const event of table(store).values()) for (const tag of event.tags) names.add(tag);
  const suggestions = [...names]
    .filter((name) => name.toLocaleLowerCase("pt-BR").startsWith(prefix))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .slice(0, limit)
    .map((name) => ({ id: name, name }));
  return { status: 200, body: suggestions };
}

export const eventsArea: FakeArea = {
  name: "eventos",
  routes: [
    { method: "GET", path: "/api/events", output: agendaPageSchema, handle: agenda },
    { method: "GET", path: "/api/events/tracked", output: z.array(eventCardSchema), handle: tracked },
    { method: "POST", path: "/api/events", input: createEventInputSchema, output: createdEventSchema, idempotent: true, handle: create },
    { method: "GET", path: "/api/events/:eventId", output: eventSchema, handle: read },
    { method: "PATCH", path: "/api/events/:eventId", input: updateEventInputSchema.omit({ eventId: true }), handle: update },
    { method: "DELETE", path: "/api/events/:eventId", handle: remove },
    { method: "GET", path: "/api/events/:eventId/subtasks", output: z.array(eventCardSchema), handle: subtasks },
    { method: "GET", path: "/api/tags", output: z.array(tagSuggestionSchema), handle: suggestTags },
  ],
};
