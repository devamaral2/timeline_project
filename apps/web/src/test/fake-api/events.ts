import type { CreateTaskInput, TaskCardDto, TaskDto } from "@repo/contracts";
import {
  agendaPageSchema,
  createTaskInputSchema,
  taskCardSchema,
  taskSchema,
  placeSuggestionSchema,
  tagSuggestionSchema,
  updateTaskInputSchema,
} from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeArea, FakeRequest, FakeResult, FakeStore } from ".";
import { type ArtifactLink, type EventArtifactEntry, artifactsOfEvent, relinkEventArtifacts } from "./artifacts";

/** Área de eventos: agenda, lista de tarefas, evento, sequência e tags. */

const EVENTS = "events";
const CARD_KEYS = [
  "id", "actor", "kind", "status", "priority", "name", "description", "location", "startedAt", "estimatedFinishAt",
  "finishedAt", "longRunning", "notifyOffsetsMinutes", "tags", "artifactTypes", "previousTaskIds",
  "recurrence", "revision",
] as const;
/** Campos que a edição aceita e que o fake aplica; `artifacts` não está aqui porque os vínculos vivem no artefato. */
const EDITABLE_KEYS = [
  "name", "description", "location", "priority", "notifyOffsetsMinutes", "tags", "longRunning", "previousTaskIds",
  "nextTaskIds", "kind", "status", "startedAt", "estimatedFinishAt", "finishedAt",
] as const;

const createdEventSchema = z.object({ taskId: z.string() }).strict();

/** Um evento completo para o seed: os campos que você não passa ganham o padrão de uma tarefa de pessoa. */
export function eventFixture(overrides: Partial<TaskDto> & { id: string }): TaskDto {
  return taskSchema.parse({
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    name: "Evento",
    description: "",
    location: "",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    previousTaskIds: [],
    nextTaskIds: [],
    requests: [],
    revision: 1,
    artifacts: [],
    ...overrides,
  });
}

type StoredEvent = TaskDto;

function table(store: FakeStore) {
  return store.table<StoredEvent>(EVENTS);
}

function toCard(event: StoredEvent): TaskCardDto {
  const card: Record<string, unknown> = {};
  for (const key of CARD_KEYS) if (event[key] !== undefined) card[key] = event[key];
  return card as unknown as TaskCardDto;
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
  const input = request.body as CreateTaskInput;
  // Ids de sequência que não existem a API recusa (404), antes de criar qualquer coisa.
  if (!allExist(store, [...(input.previousTaskIds ?? []), ...(input.nextTaskIds ?? [])])) return { status: 404 };
  const id = store.nextId("ev");
  const event: StoredEvent = taskSchema.parse({
    id,
    actor: "human",
    kind: input.kind ?? "common",
    status: input.status ?? (input.longRunning ? "todo" : undefined),
    priority: input.priority ?? "medium",
    name: input.name ?? "",
    description: input.description ?? "",
    location: input.location ?? "",
    startedAt: input.startedAt,
    estimatedFinishAt: input.estimatedFinishAt,
    finishedAt: input.finishedAt,
    longRunning: input.longRunning ?? false,
    notifyOffsetsMinutes: input.notifyOffsetsMinutes ?? [],
    tags: input.tags ?? [],
    artifactTypes: [],
    previousTaskIds: input.previousTaskIds ?? [],
    nextTaskIds: input.nextTaskIds ?? [],
    requests: [],
    revision: 1,
    artifacts: [],
  });
  table(store).set(id, event);
  relinkSequence(store, event, [], []);
  return { status: 201, body: createdEventSchema.parse({ taskId: id }) };
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
  // A sequência é informativa, mas só liga eventos que existem; o evento não se segue a si mesmo (422).
  const sequenceIds = [...stringList(input.previousTaskIds), ...stringList(input.nextTaskIds)];
  if (sequenceIds.includes(event.id)) return { status: 422 };
  if (!allExist(store, sequenceIds)) return { status: 404 };

  // A lista de artefatos é a completa, na ordem enviada: ligar por `id` e criar cópia de alimento (`copyOf`) são
  // modelados. Criar ou editar um artefato novo dentro do evento a API faz, mas a API falsa ainda não (400).
  if (Array.isArray(input.artifacts)) {
    const entries = input.artifacts as { id?: string; relation?: ArtifactLink["relation"]; copyOf?: string }[];
    if (entries.some((entry) => entry.id === undefined && entry.copyOf === undefined)) return { status: 400 };
    if (!relinkEventArtifacts(store, event.id, entries as EventArtifactEntry[])) return { status: 404 };
  }

  const next: Record<string, unknown> = { ...event };
  for (const key of EDITABLE_KEYS) {
    if (!(key in input)) continue;
    const value = input[key];
    if (value === null) delete next[key];
    else next[key] = value;
  }
  next.revision = event.revision + 1;
  table(store).set(event.id, taskSchema.parse(next));
  relinkSequence(store, event, event.previousTaskIds, event.nextTaskIds);
  return { status: 204 };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

function allExist(store: FakeStore, ids: string[]): boolean {
  return ids.every((id) => table(store).has(id));
}

/**
 * A sequência tem dois lados: este evento guarda os antecessores (`previousTaskIds`) e os sucessores
 * (`nextTaskIds`), e cada evento relacionado guarda este no lado oposto. Quem entra ou sai da lista é religado
 * no outro lado; ninguém além do evento do PATCH tem a revisão mexida, como na API real.
 * `oldPrevious`/`oldNext` são as listas de antes do PATCH (vazias na criação); o lado que não veio no corpo não muda e não se religa.
 */
function relinkSequence(store: FakeStore, event: StoredEvent, oldPrevious: string[], oldNext: string[]) {
  const stored = table(store).get(event.id) ?? event;
  syncSide(store, stored.id, oldPrevious, stored.previousTaskIds, "nextTaskIds");
  syncSide(store, stored.id, oldNext, stored.nextTaskIds, "previousTaskIds");
}

function syncSide(store: FakeStore, selfId: string, before: string[], after: string[], otherField: "previousTaskIds" | "nextTaskIds") {
  for (const id of before) if (!after.includes(id)) setSequenceLink(store, id, otherField, selfId, false);
  for (const id of after) if (!before.includes(id)) setSequenceLink(store, id, otherField, selfId, true);
}

function setSequenceLink(store: FakeStore, eventId: string, field: "previousTaskIds" | "nextTaskIds", otherId: string, linked: boolean) {
  const other = table(store).get(eventId);
  if (!other) return;
  const others = other[field].filter((id) => id !== otherId);
  table(store).set(eventId, { ...other, [field]: linked ? [...others, otherId] : others });
}

function remove(request: FakeRequest, store: FakeStore): FakeResult {
  const id = request.params.eventId ?? "";
  if (!table(store).delete(id)) return { status: 404 };
  return { status: 204 };
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

/** Com a posicao da pessoa (`lat` e `lon`), o local perto dela vem primeiro, como na API. */
function searchPlaces(request: FakeRequest): FakeResult {
  const query = (request.query.get("query") ?? "").trim();
  if (query.length < 3) return { status: 200, body: [] };
  const nearby = request.query.get("lat") && request.query.get("lon")
    ? [{ name: `${query} Perto`, address: "a 1 km de você", label: `${query} Perto, a 1 km de você` }]
    : [];
  return {
    status: 200,
    body: [
      ...nearby,
      { name: query, address: "São Paulo, SP, Brasil", label: `${query}, São Paulo, SP, Brasil` },
      { name: `${query} Centro`, address: "Rio de Janeiro, RJ, Brasil", label: `${query} Centro, Rio de Janeiro, RJ, Brasil` },
    ],
  };
}

export const eventsArea: FakeArea = {
  name: "eventos",
  routes: [
    { method: "GET", path: "/api/events", output: agendaPageSchema, handle: agenda },
    { method: "GET", path: "/api/events/tracked", output: z.array(taskCardSchema), handle: tracked },
    { method: "POST", path: "/api/events", input: createTaskInputSchema, output: createdEventSchema, idempotent: true, handle: create },
    { method: "GET", path: "/api/events/:eventId", output: taskSchema, handle: read },
    { method: "PATCH", path: "/api/events/:eventId", input: updateTaskInputSchema.omit({ taskId: true }), handle: update },
    { method: "DELETE", path: "/api/events/:eventId", handle: remove },
    { method: "GET", path: "/api/tags", output: z.array(tagSuggestionSchema), handle: suggestTags },
    { method: "GET", path: "/api/places", output: z.array(placeSuggestionSchema), handle: searchPlaces },
  ],
};
