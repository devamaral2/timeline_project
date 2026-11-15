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
import { artifactsOfEvent } from "./artifacts";

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
  const parents = (input.parentEventIds ?? []).map((parentId) => table(store).get(parentId));
  if (parents.some((parent) => parent === undefined)) return { status: 404 };
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
  // A subtarefa criada com `parentEventIds` entra na lista do pai, e a revisão dele sobe, como na API real.
  for (const parent of parents) {
    if (!parent) continue;
    table(store).set(parent.id, eventSchema.parse({ ...parent, subtaskEventIds: [...parent.subtaskEventIds, id], revision: parent.revision + 1 }));
  }
  return { status: 201, body: createdEventSchema.parse({ eventId: id }) };
}

function read(request: FakeRequest, store: FakeStore): FakeResult {
  const event = table(store).get(request.params.eventId ?? "");
  if (!event) return { status: 404 };
  // Os vínculos vivem no artefato (área de artefatos): o detalhe os monta aqui, na ordem da tabela.
  return { status: 200, body: { ...event, artifacts: artifactsOfEvent(store, event.id) } };
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
  if (Array.isArray(input.subtaskEventIds)) relinkSubtasks(store, event, input.subtaskEventIds as string[]);
  if (Array.isArray(input.blockedByEventIds)) relinkBlockers(store, event, input.blockedByEventIds as string[]);
  if (Array.isArray(input.blocksEventIds)) relinkBlocked(store, event, input.blocksEventIds as string[]);
  return { status: 204 };
}

/**
 * Quem bloqueia é a origem da relação, como na API real: entrar ou sair dela revisa o bloqueador (sobe a revisão
 * e ganha este evento em `blocksEventIds`). Este evento não tem a sua revisão mexida por isso: o PATCH dele já a sobe.
 */
function relinkBlockers(store: FakeStore, target: StoredEvent, nextIds: string[]) {
  const before = new Set(target.blockedByEventIds);
  const after = new Set(nextIds);
  for (const id of before) if (!after.has(id)) setBlockLink(store, id, "blocksEventIds", target.id, false, true);
  for (const id of after) if (!before.has(id)) setBlockLink(store, id, "blocksEventIds", target.id, true, true);
}

/** Este evento é a origem de "Bloqueia": o evento bloqueado não é revisado, só passa a listar este como bloqueador. */
function relinkBlocked(store: FakeStore, source: StoredEvent, nextIds: string[]) {
  const before = new Set(source.blocksEventIds);
  const after = new Set(nextIds);
  for (const id of before) if (!after.has(id)) setBlockLink(store, id, "blockedByEventIds", source.id, false, false);
  for (const id of after) if (!before.has(id)) setBlockLink(store, id, "blockedByEventIds", source.id, true, false);
}

function setBlockLink(
  store: FakeStore,
  eventId: string,
  field: "blockedByEventIds" | "blocksEventIds",
  otherId: string,
  linked: boolean,
  revise: boolean,
) {
  const other = table(store).get(eventId);
  if (!other) return;
  const others = other[field].filter((id) => id !== otherId);
  const next = { ...other, [field]: linked ? [...others, otherId] : others };
  table(store).set(eventId, revise ? { ...next, revision: other.revision + 1 } : next);
}

/** A relação de subtarefa tem dois lados: o pai guarda os filhos, e cada filho guarda o pai em `parentEventIds`. */
function relinkSubtasks(store: FakeStore, parent: StoredEvent, nextIds: string[]) {
  const before = new Set(parent.subtaskEventIds);
  const after = new Set(nextIds);
  for (const id of before) if (!after.has(id)) setParentLink(store, id, parent.id, false);
  for (const id of after) if (!before.has(id)) setParentLink(store, id, parent.id, true);
}

/** Tirar a ligação não apaga o filho: só o `parentEventIds` dele muda. */
function setParentLink(store: FakeStore, childId: string, parentId: string, linked: boolean) {
  const child = table(store).get(childId);
  if (!child) return;
  const others = child.parentEventIds.filter((id) => id !== parentId);
  table(store).set(childId, { ...child, parentEventIds: linked ? [...others, parentId] : others });
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
