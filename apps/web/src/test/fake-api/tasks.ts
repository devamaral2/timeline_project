import { isFinalAgentStatus } from "@repo/contracts";
import type { AgentTaskStatus, CreateTaskInput, RequestDto, TaskCardDto, TaskDto, TaskSituation } from "@repo/contracts";
import {
  agendaPageSchema,
  createTaskInputSchema,
  setTaskSituationInputSchema,
  taskCardSchema,
  taskSchema,
  placeSuggestionSchema,
  tagSuggestionSchema,
  updateTaskInputSchema,
} from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeArea, FakeRequest, FakeResult, FakeStore } from ".";
import { FAKE_PERSONAL_PROJECT, fakeProjectById } from "./projects";
import { type ArtifactLink, type TaskArtifactEntry, artifactsOfTask, relinkTaskArtifacts } from "./artifacts";

/** Área de tarefas: agenda, lista acompanhada, tarefa, hierarquia (tarefa principal e subtarefas) e tags. */

const TASKS = "tasks";
const CARD_KEYS = [
  "id", "actor", "kind", "status", "situation", "priority", "name", "description", "project", "location", "startedAt", "estimatedFinishAt",
  "finishedAt", "longRunning", "notifyOffsetsMinutes", "tags", "artifactTypes", "parentTaskId",
  "recurrence", "revision", "createdAt", "updatedAt", "model",
] as const;
/**
 * Campos que a edição aceita e que o fake aplica; `artifacts` não está aqui porque os vínculos vivem no artefato, e
 * `parentTaskId`/`subtaskIds` também não, porque a hierarquia mexe nas duas pontas (`planHierarchy`).
 */
const EDITABLE_KEYS = [
  "name", "description", "location", "priority", "notifyOffsetsMinutes", "tags", "longRunning",
  "kind", "status", "startedAt", "estimatedFinishAt", "finishedAt",
] as const;

/** O id provisório da tarefa que a criação ainda não gravou, para conferir a hierarquia antes de gastar um id. */
const NEW_TASK = "\u0000nova";

const createdTaskSchema = z.object({ taskId: z.string() }).strict();

/** Uma tarefa completa para o seed: os campos que você não passa ganham o padrão de uma tarefa de pessoa. */
export function taskFixture(overrides: Partial<TaskDto> & { id: string }): TaskDto {
  return taskSchema.parse({
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    name: "Tarefa",
    description: "",
    project: FAKE_PERSONAL_PROJECT,
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    subtaskIds: [],
    requests: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    artifacts: [],
    ...overrides,
  });
}

type StoredTask = TaskDto;

function table(store: FakeStore) {
  return store.table<StoredTask>(TASKS);
}

function toCard(task: StoredTask): TaskCardDto {
  const card: Record<string, unknown> = {};
  for (const key of CARD_KEYS) if (task[key] !== undefined) card[key] = task[key];
  return card as unknown as TaskCardDto;
}

function instant(value: string | null): number | undefined {
  if (value === null) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? Number.NaN : time;
}

function byStart(a: StoredTask, b: StoredTask): number {
  const left = a.startedAt ? Date.parse(a.startedAt) : Number.POSITIVE_INFINITY;
  const right = b.startedAt ? Date.parse(b.startedAt) : Number.POSITIVE_INFINITY;
  return left - right || a.id.localeCompare(b.id);
}

function listParam(request: FakeRequest, name: string): string[] | undefined {
  const raw = request.query.get(name);
  return raw ? raw.split(",") : undefined;
}

function inWindow(task: StoredTask, from: number | undefined, to: number | undefined): boolean {
  if (from === undefined && to === undefined) return true;
  if (!task.startedAt) return false;
  const at = Date.parse(task.startedAt);
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

  // A agenda mostra o que tem horário e não é tarefa longa; passos nunca aparecem.
  const tasks = [...table(store).values()]
    .filter((task) => task.kind !== "step" && !task.longRunning)
    .filter((task) => inWindow(task, from, to))
    .filter((task) => !actor || task.actor === actor)
    .filter((task) => !tag || task.tags.includes(tag))
    .sort(byStart);

  const items = tasks.slice(offset, offset + limit).map(toCard);
  const next = offset + limit < tasks.length ? { nextCursor: String(offset + limit) } : {};
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

  const tasks = [...table(store).values()]
    .filter((task) => task.status !== undefined)
    .filter((task) => !actor || task.actor === actor)
    .filter((task) => !statuses || (task.status !== undefined && statuses.includes(task.status)))
    .filter((task) => !priorities || priorities.includes(task.priority))
    .filter((task) => !tag || task.tags.includes(tag))
    .filter((task) => !q || `${task.name} ${task.description}`.toLocaleLowerCase("pt-BR").includes(q))
    .filter((task) => longRunning === null || task.longRunning === (longRunning === "true"))
    .filter((task) => (from === undefined && to === undefined) || inWindow(task, from, to))
    .sort(byStart)
    .slice(0, Math.min(Number(request.query.get("limit") ?? 100), 100));

  return { status: 200, body: tasks.map(toCard) };
}

function create(request: FakeRequest, store: FakeStore): FakeResult {
  const input = request.body as CreateTaskInput;
  // A hierarquia que a API recusa (ponta que não existe, ciclo) é recusada antes de criar qualquer coisa.
  const plan = planHierarchy(store, NEW_TASK, [], { parentTaskId: input.parentTaskId, subtaskIds: input.subtaskIds });
  if ("status" in plan) return plan;
  // O projeto escolhido tem de existir (e ser do usuário: a API falsa só tem um usuário); sem escolha, é o `personal`.
  const project = input.projectId === undefined ? FAKE_PERSONAL_PROJECT : fakeProjectById(store, input.projectId);
  if (!project) return { status: 404 };
  // O contador não sabe das tarefas semeadas: pula os ids já usados, para a nova não sobrescrever uma delas.
  let id = store.nextId("ev");
  while (table(store).has(id)) id = store.nextId("ev");
  const task: StoredTask = taskSchema.parse({
    id,
    actor: "human",
    kind: input.kind ?? "common",
    status: input.status ?? (input.longRunning ? "todo" : undefined),
    priority: input.priority ?? "medium",
    name: input.name ?? "",
    description: input.description ?? "",
    project,
    // So o local informado entra na tarefa.
    ...(input.location?.trim() ? { location: input.location.trim() } : {}),
    startedAt: input.startedAt,
    estimatedFinishAt: input.estimatedFinishAt,
    finishedAt: input.finishedAt,
    longRunning: input.longRunning ?? false,
    notifyOffsetsMinutes: input.notifyOffsetsMinutes ?? [],
    tags: input.tags ?? [],
    artifactTypes: [],
    subtaskIds: [],
    requests: [],
    revision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    artifacts: [],
  });
  table(store).set(id, task);
  const moves = plan.moves.map(([child, parent]): Move => [child === NEW_TASK ? id : child, parent === NEW_TASK ? id : parent]);
  applyHierarchy(store, id, moves, input.subtaskIds);
  return { status: 201, body: createdTaskSchema.parse({ taskId: id }) };
}

function read(request: FakeRequest, store: FakeStore): FakeResult {
  const task = table(store).get(request.params.taskId ?? "");
  if (!task) return { status: 404 };
  // Os vínculos vivem no artefato (área de artefatos): o detalhe os monta aqui, na ordem da tabela.
  return { status: 200, body: { ...task, artifacts: artifactsOfTask(store, task.id) } };
}

function update(request: FakeRequest, store: FakeStore): FakeResult {
  const task = table(store).get(request.params.taskId ?? "");
  if (!task) return { status: 404 };
  const input = request.body as Record<string, unknown> & { expectedRevision: number };
  if (input.expectedRevision !== task.revision) return { status: 409 };
  // A hierarquia é informativa, mas só liga tarefas que existem (404) e não fecha ciclo (400).
  const desired = {
    parentTaskId: input.parentTaskId as string | null | undefined,
    subtaskIds: input.subtaskIds as string[] | undefined,
  };
  const plan = planHierarchy(store, task.id, task.subtaskIds, desired);
  if ("status" in plan) return plan;

  // A lista de artefatos é a completa, na ordem enviada: ligar por `id` e criar cópia de alimento (`copyOf`) são
  // modelados. Criar ou editar um artefato novo dentro da tarefa a API faz, mas a API falsa ainda não (400).
  if (Array.isArray(input.artifacts)) {
    const entries = input.artifacts as { id?: string; relation?: ArtifactLink["relation"]; copyOf?: string }[];
    if (entries.some((entry) => entry.id === undefined && entry.copyOf === undefined)) return { status: 400 };
    if (!relinkTaskArtifacts(store, task.id, entries as TaskArtifactEntry[])) return { status: 404 };
  }

  // Ausente não muda o projeto; `null` devolve a tarefa a `personal`; um id precisa existir.
  const projectId = input.projectId as string | null | undefined;
  const project = projectId === undefined ? task.project : projectId === null ? FAKE_PERSONAL_PROJECT : fakeProjectById(store, projectId);
  if (!project) return { status: 404 };

  const next: Record<string, unknown> = { ...task, project };
  for (const key of EDITABLE_KEYS) {
    if (!(key in input)) continue;
    const value = input[key];
    // `null` apaga o campo; no local, texto vazio tambem.
    if (value === null || (key === "location" && typeof value === "string" && !value.trim())) delete next[key];
    else next[key] = value;
  }
  next.revision = task.revision + 1;
  next.updatedAt = new Date().toISOString();
  table(store).set(task.id, taskSchema.parse(next));
  applyHierarchy(store, task.id, plan.moves, desired.subtaskIds);
  return { status: 204 };
}

function allExist(store: FakeStore, ids: string[]): boolean {
  return ids.every((id) => table(store).has(id));
}

/** Uma subtarefa e a principal nova dela (`undefined`: fica sem principal). */
type Move = [child: string, parent: string | undefined];

/**
 * A hierarquia é uma árvore: cada tarefa guarda a principal (`parentTaskId`) e as subtarefas (`subtaskIds`), e as
 * duas pontas se mantêm juntas. Aqui se confere o pedido e se calcula quem muda de principal, sem gravar nada:
 * ausente não muda aquele lado, `parentTaskId: null` tira a tarefa de baixo da principal, e `subtaskIds` é a lista
 * completa. Uma subtarefa que estava sob outra principal muda para esta. Ponta que não existe é 404; a tarefa
 * como principal ou subtarefa de si mesma, ou um ciclo, é 400, como a API.
 */
function planHierarchy(
  store: FakeStore,
  selfId: string,
  currentSubtasks: string[],
  desired: { parentTaskId?: string | null; subtaskIds?: string[] },
): { moves: Move[] } | { status: number } {
  const linked = [...(desired.parentTaskId ? [desired.parentTaskId] : []), ...(desired.subtaskIds ?? [])];
  if (linked.includes(selfId)) return { status: 400 };
  if (!allExist(store, linked)) return { status: 404 };

  const moves = new Map<string, string | undefined>();
  if (desired.parentTaskId !== undefined) moves.set(selfId, desired.parentTaskId ?? undefined);
  if (desired.subtaskIds) {
    for (const id of currentSubtasks) if (!desired.subtaskIds.includes(id)) moves.set(id, undefined);
    for (const id of desired.subtaskIds) moves.set(id, selfId);
  }

  // Sobe a partir de cada tarefa que mudou de principal, já com as mudanças: voltar a ela é ciclo.
  const parentOf = (id: string) => (moves.has(id) ? moves.get(id) : table(store).get(id)?.parentTaskId);
  for (const child of moves.keys()) {
    const seen = new Set<string>();
    for (let at = parentOf(child); at !== undefined; at = parentOf(at)) {
      if (at === child) return { status: 400 };
      if (seen.has(at)) break;
      seen.add(at);
    }
  }
  return { moves: [...moves] };
}

/**
 * Grava as mudanças de `planHierarchy` nas duas pontas: a subtarefa sai da lista da principal antiga e entra no fim
 * da nova. Ninguém tem a revisão mexida aqui, como na API real; a tarefa do PATCH sobe a revisão no próprio
 * `update`. Quando o pedido trouxe `subtaskIds`, a lista dela fica na ordem enviada.
 */
function applyHierarchy(store: FakeStore, selfId: string, moves: Move[], subtaskIds: string[] | undefined) {
  const tasks = table(store);
  for (const [child, parent] of moves) {
    const stored = tasks.get(child);
    if (!stored || stored.parentTaskId === parent) continue;
    const old = stored.parentTaskId ? tasks.get(stored.parentTaskId) : undefined;
    if (old) tasks.set(old.id, { ...old, subtaskIds: old.subtaskIds.filter((id) => id !== child) });
    const { parentTaskId: _dropped, ...rest } = stored;
    tasks.set(child, parent ? { ...rest, parentTaskId: parent } : rest);
    const next = parent ? tasks.get(parent) : undefined;
    if (next && !next.subtaskIds.includes(child)) tasks.set(next.id, { ...next, subtaskIds: [...next.subtaskIds, child] });
  }
  const self = tasks.get(selfId);
  if (self && subtaskIds) tasks.set(selfId, { ...self, subtaskIds: [...subtaskIds] });
}

function remove(request: FakeRequest, store: FakeStore): FakeResult {
  const id = request.params.taskId ?? "";
  if (!table(store).delete(id)) return { status: 404 };
  return { status: 204 };
}

/** A API aceita só o pedido de agente que terminou: pessoa, passo, execução agendada e tarefa aberta dão 409. */
function setSituation(request: FakeRequest, store: FakeStore): FakeResult {
  const task = table(store).get(request.params.taskId ?? "");
  if (!task) return { status: 404 };
  const accepts = task.actor === "agent" && task.kind !== "step" && task.kind !== "cron"
    && task.status !== undefined && isFinalAgentStatus(task.status as AgentTaskStatus);
  if (!accepts) return { status: 409 };
  const { situation } = request.body as { situation: TaskSituation };
  const next = taskSchema.parse({ ...task, situation, revision: task.revision + 1, updatedAt: new Date().toISOString() });
  table(store).set(task.id, next);
  // O pedido tem o mesmo id da tarefa: a leitura dele traz a mesma situação.
  const requests = store.table<RequestDto>("requests");
  const stored = requests.get(task.id);
  if (stored) requests.set(task.id, { ...stored, situation });
  return { status: 200, body: toCard(next) };
}

function suggestTags(request: FakeRequest, store: FakeStore): FakeResult {
  const prefix = (request.query.get("query") ?? "").toLocaleLowerCase("pt-BR");
  const limit = Math.min(Number(request.query.get("limit") ?? 10), 100);
  const names = new Set<string>();
  for (const task of table(store).values()) for (const tag of task.tags) names.add(tag);
  const suggestions = [...names]
    .filter((name) => name.toLocaleLowerCase("pt-BR").startsWith(prefix))
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .slice(0, limit)
    .map((name) => ({ id: name, name }));
  return { status: 200, body: suggestions };
}

/** Busca so pelo texto, como na API: a posicao da pessoa nunca e enviada. */
function searchPlaces(request: FakeRequest): FakeResult {
  const query = (request.query.get("query") ?? "").trim();
  if (query.length < 3) return { status: 200, body: [] };
  return {
    status: 200,
    body: [
      { name: query, address: "São Paulo, SP, Brasil", label: `${query}, São Paulo, SP, Brasil` },
      { name: `${query} Centro`, address: "Rio de Janeiro, RJ, Brasil", label: `${query} Centro, Rio de Janeiro, RJ, Brasil` },
    ],
  };
}

export const tasksArea: FakeArea = {
  name: "tarefas",
  routes: [
    { method: "GET", path: "/api/tasks", output: agendaPageSchema, handle: agenda },
    { method: "GET", path: "/api/tasks/tracked", output: z.array(taskCardSchema), handle: tracked },
    { method: "POST", path: "/api/tasks", input: createTaskInputSchema, output: createdTaskSchema, idempotent: true, handle: create },
    { method: "GET", path: "/api/tasks/:taskId", output: taskSchema, handle: read },
    { method: "PATCH", path: "/api/tasks/:taskId", input: updateTaskInputSchema.omit({ taskId: true }), handle: update },
    { method: "PUT", path: "/api/tasks/:taskId/situation", input: setTaskSituationInputSchema, output: taskCardSchema, handle: setSituation },
    { method: "DELETE", path: "/api/tasks/:taskId", handle: remove },
    { method: "GET", path: "/api/tags", output: z.array(tagSuggestionSchema), handle: suggestTags },
    { method: "GET", path: "/api/places", output: z.array(placeSuggestionSchema), handle: searchPlaces },
  ],
};
