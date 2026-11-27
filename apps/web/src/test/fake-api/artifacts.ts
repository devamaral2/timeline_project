import type {
  ArtifactDto,
  ArtifactTaskLinkDto,
  ArtifactType,
  CreateArtifactRequest,
  TaskArtifactDto,
  TaskDto,
} from "@repo/contracts";
import { isTextBodyArtifactType } from "@repo/contracts/artifact-types";
import {
  artifactSchema,
  createArtifactRequestSchema,
  createArtifactResponseSchema,
  updateArtifactRequestSchema,
} from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeArea, FakeRequest, FakeResult, FakeStore } from ".";

/**
 * Área de artefatos: lista, leitura, criação, edição e remoção. As tarefas que
 * citam um artefato são lidas da tabela de tarefas (área de tarefas); a tabela
 * tem o mesmo nome que `TASKS` em `./tasks`, sem importá-la para não mexer nela.
 */

const ARTIFACTS = "artifacts";
const TASKS = "tasks";
const ARTIFACT_TYPES: readonly ArtifactType[] = [
  "text", "news", "email_summary", "youtube_transcript", "food", "sleep", "training", "workout", "skill", "agent", "router",
];
/** Arquivos do agente e roteador: a API não edita nem apaga por aqui (400). */
const FOLLOWS_FILES: ReadonlySet<ArtifactType> = new Set(["skill", "agent", "router"]);
const DEFAULT_NAMES: Partial<Record<ArtifactType, string>> = { text: "Nota", food: "Alimento", sleep: "Sono", training: "Treino" };
const EPOCH = "2026-09-01T00:00:00.000Z";
const ZERO_TOTALS = {
  totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0,
};

const createdArtifactSchema = createArtifactResponseSchema;
const numeric = new Intl.Collator("en", { numeric: true });

export interface ArtifactLink {
  taskId: string;
  relation: ArtifactTaskLinkDto["relation"];
  /** A posição na lista da tarefa (a ordem enviada no `PATCH` da tarefa). Sem ela, vale a ordem da tabela. */
  position?: number;
}

/** Como o artefato fica guardado: o que a leitura devolve, mais as relações com as tarefas. */
export interface StoredArtifact {
  id: string;
  name: string;
  type: ArtifactType;
  schemaVersion: number;
  data: unknown;
  global: boolean;
  derived: boolean;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
  links: ArtifactLink[];
  deleted: boolean;
}

/** Um artefato para o seed. Sem `data`, é um texto vazio; `links` diz em quais tarefas ele aparece. */
export function artifactFixture(overrides: Partial<StoredArtifact> & { id: string }): StoredArtifact {
  return {
    type: "text",
    name: "Nota",
    schemaVersion: 1,
    data: { body: "" },
    global: false,
    derived: false,
    tags: [],
    revision: 1,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    links: [],
    deleted: false,
    ...overrides,
  };
}

function table(store: FakeStore) {
  return store.table<StoredArtifact>(ARTIFACTS);
}

function tasksTable(store: FakeStore) {
  return store.table<TaskDto>(TASKS);
}

function visibleOne(store: FakeStore, id: string): StoredArtifact | undefined {
  const artifact = table(store).get(id);
  return artifact && !artifact.deleted ? artifact : undefined;
}

function isArtifactType(value: string): value is ArtifactType {
  return (ARTIFACT_TYPES as readonly string[]).includes(value);
}

function unique(ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}

/** As tarefas em que o artefato aparece; uma tarefa que não existe mais não entra. Global não tem tarefa. */
function linksOf(artifact: StoredArtifact, store: FakeStore): ArtifactTaskLinkDto[] {
  if (artifact.global) return [];
  const result: ArtifactTaskLinkDto[] = [];
  for (const link of artifact.links) {
    const task = tasksTable(store).get(link.taskId);
    if (!task) continue;
    result.push({
      taskId: task.id,
      relation: link.relation,
      name: task.name,
      actor: task.actor,
      kind: task.kind,
      startedAt: task.startedAt,
      estimatedFinishAt: task.estimatedFinishAt,
    });
  }
  return result;
}

/** Sem `store`, é o artefato como vem dentro de uma tarefa: sem `tasks`, que só as listas de artefatos trazem. */
function toDto(artifact: StoredArtifact, store?: FakeStore): ArtifactDto {
  const dto = {
    id: artifact.id,
    name: artifact.name,
    type: artifact.type,
    schemaVersion: artifact.schemaVersion,
    data: artifact.data,
    global: artifact.global,
    derived: artifact.derived,
    tags: artifact.tags,
    revision: artifact.revision,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
  return (store ? { ...dto, tasks: linksOf(artifact, store) } : dto) as ArtifactDto;
}

/**
 * Os artefatos ligados a uma tarefa, na ordem da tabela (a ordem em que foram semeados ou criados). É o que
 * `GET /api/tasks/{id}` embute em `artifacts`: cada um com a relação do vínculo e o artefato inteiro, globais
 * e cópias derivadas incluídos, e sem os apagados.
 */
export function artifactsOfTask(store: FakeStore, taskId: string): TaskArtifactDto[] {
  const found: { link: ArtifactLink; artifact: StoredArtifact }[] = [];
  for (const artifact of table(store).values()) {
    if (artifact.deleted) continue;
    const link = artifact.links.find((item) => item.taskId === taskId);
    if (link) found.push({ link, artifact });
  }
  // `Array.prototype.sort` é estável: sem posição, a ordem da tabela é a que fica.
  found.sort((a, b) => (a.link.position ?? Number.MAX_SAFE_INTEGER) - (b.link.position ?? Number.MAX_SAFE_INTEGER));
  // A API falsa não guarda a série que criou o vínculo, então nenhum vínculo vem dela.
  return found.map(({ link, artifact }) => ({ relation: link.relation, fromRecurrence: false, artifact: toDto(artifact) }));
}

/** Uma entrada da lista de artefatos do `PATCH` da tarefa: um artefato ligado, ou uma cópia nova de um alimento. */
export type TaskArtifactEntry = { id: string; relation?: ArtifactLink["relation"] } | { copyOf: string; quantity?: string };

/**
 * A cópia nova de um alimento, como a API a faz: um artefato derivado, com o conteúdo do original e a quantidade
 * da entrada, sem dono e fora das listas. Editar o original depois não muda a cópia. Devolve o id da cópia.
 */
function copyFood(store: FakeStore, original: StoredArtifact, quantity: string | undefined): string {
  const id = store.nextId("art");
  const now = new Date().toISOString();
  const data = quantity ? { ...(original.data as object), quantity } : original.data;
  table(store).set(id, {
    ...original,
    id,
    data,
    tags: [],
    global: false,
    derived: true,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    links: [],
    deleted: false,
  });
  return id;
}

/**
 * A lista completa de artefatos de uma tarefa, como o `PATCH` da tarefa a manda: a ordem da lista vira a posição
 * do vínculo, quem sai da lista perde o vínculo (o artefato continua), e a relação vem da entrada ou, se ela não
 * traz, do vínculo que já existia (ou `uses` para um artefato novo na lista). Uma cópia de alimento (`copyOf`) cria
 * a cópia derivada e a liga com `uses`. `false` quando algum artefato ou alimento não existe, ou quando `copyOf` não
 * aponta para um alimento; nada é gravado nesse caso.
 */
export function relinkTaskArtifacts(store: FakeStore, taskId: string, entries: readonly TaskArtifactEntry[]): boolean {
  for (const entry of entries) {
    if ("copyOf" in entry) {
      if (visibleOne(store, entry.copyOf)?.type !== "food") return false;
    } else if (!visibleOne(store, entry.id)) {
      return false;
    }
  }

  // Tudo conferido: agora criam-se as cópias, e a lista ganha os ids e as relações de cada entrada.
  const resolved = entries.map((entry) => {
    if ("copyOf" in entry) {
      const original = visibleOne(store, entry.copyOf);
      return { id: copyFood(store, original as StoredArtifact, entry.quantity), relation: "uses" as const };
    }
    return { id: entry.id, relation: entry.relation };
  });
  const ids = resolved.map((entry) => entry.id);

  for (const artifact of [...table(store).values()]) {
    const current = artifact.links.find((link) => link.taskId === taskId);
    const index = ids.indexOf(artifact.id);
    if (!current && index === -1) continue;
    const others = artifact.links.filter((link) => link.taskId !== taskId);
    const links = index === -1
      ? others
      : [...others, { taskId, relation: resolved[index]?.relation ?? current?.relation ?? "uses", position: index }];
    table(store).set(artifact.id, { ...artifact, links });
  }
  return true;
}

function matchesText(artifact: StoredArtifact, q: string): boolean {
  if (artifact.name.toLocaleLowerCase("pt-BR").includes(q)) return true;
  // Nos de texto (`text`, `router`), a busca também olha o corpo.
  if (isTextBodyArtifactType(artifact.type)) {
    const body = (artifact.data as { body?: string }).body ?? "";
    return body.toLocaleLowerCase("pt-BR").includes(q);
  }
  return false;
}

function byUpdatedDesc(a: StoredArtifact, b: StoredArtifact): number {
  return b.updatedAt.localeCompare(a.updatedAt) || numeric.compare(b.id, a.id);
}

function byName(a: StoredArtifact, b: StoredArtifact): number {
  return a.name.localeCompare(b.name, "pt-BR") || numeric.compare(a.id, b.id);
}

/** As tarefas tocadas por uma mudança de artefato ganham uma revisão, como na API. */
function reviseTasks(store: FakeStore, taskIds: readonly string[]): void {
  for (const id of taskIds) {
    const task = tasksTable(store).get(id);
    if (task) tasksTable(store).set(id, { ...task, revision: task.revision + 1 });
  }
}

function list(request: FakeRequest, store: FakeStore): FakeResult {
  const type = request.query.get("type");
  const scope = request.query.get("scope");
  const limitRaw = request.query.get("limit");
  const limit = limitRaw === null ? undefined : Number(limitRaw);
  if (type !== null && !isArtifactType(type)) return { status: 400 };
  if (scope !== null && scope !== "global") return { status: 400 };
  if (scope === "global" && type === null) return { status: 400 };
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) return { status: 400 };

  const tag = request.query.get("tag") ?? undefined;
  const q = request.query.get("q")?.toLocaleLowerCase("pt-BR");
  const taskId = request.query.get("taskId") ?? undefined;

  // Sem `scope`, a lista é do usuário (globais não têm dono); com `scope=global`, são os globais.
  let found = [...table(store).values()]
    .filter((artifact) => !artifact.deleted && !artifact.derived)
    .filter((artifact) => (scope === "global" ? artifact.global : !artifact.global))
    .filter((artifact) => !type || artifact.type === type)
    .filter((artifact) => !tag || artifact.tags.includes(tag))
    .filter((artifact) => !q || matchesText(artifact, q))
    .filter((artifact) => !taskId || artifact.links.some((link) => link.taskId === taskId))
    .sort(scope === "global" ? byName : byUpdatedDesc);
  if (limit !== undefined) found = found.slice(0, limit);

  return { status: 200, body: found.map((artifact) => toDto(artifact, store)) };
}

function initialData(input: CreateArtifactRequest): unknown {
  switch (input.type) {
    case "food":
      // O cálculo nasce pendente; a API abre um pedido de cálculo que a API falsa não modela.
      return {
        description: input.data.inputText,
        items: [],
        totals: ZERO_TOTALS,
        generation: { status: "pending" },
      };
    case "sleep":
      return { trackedSleepTime: input.data?.trackedSleepTime ?? 0, score: input.data?.score ?? 0 };
    case "training":
      return { workouts: input.data?.workouts ?? [], caloriesBurned: 0 };
    default:
      return { body: input.data.body };
  }
}

function create(request: FakeRequest, store: FakeStore): FakeResult {
  const input = request.body as CreateArtifactRequest;
  const taskIds = unique(input.taskIds);
  if (taskIds.some((id) => !tasksTable(store).has(id))) return { status: 404 };

  const type: ArtifactType = input.type ?? "text";
  const id = store.nextId("art");
  const now = new Date().toISOString();
  table(store).set(id, {
    id,
    name: input.name ?? DEFAULT_NAMES[type] ?? "",
    type,
    schemaVersion: 1,
    data: initialData(input),
    global: false,
    derived: false,
    tags: input.tags ?? [],
    revision: 1,
    createdAt: now,
    updatedAt: now,
    links: taskIds.map((taskId) => ({ taskId, relation: "creates" })),
    deleted: false,
  });
  reviseTasks(store, taskIds);
  return { status: 201, body: createdArtifactSchema.parse({ artifactId: id }) };
}

function read(request: FakeRequest, store: FakeStore): FakeResult {
  const artifact = visibleOne(store, request.params.artifactId ?? "");
  if (!artifact) return { status: 404 };
  return { status: 200, body: toDto(artifact, store) };
}

function update(request: FakeRequest, store: FakeStore): FakeResult {
  const current = visibleOne(store, request.params.artifactId ?? "");
  if (!current) return { status: 404 };
  if (current.global) return { status: 403 };
  if (FOLLOWS_FILES.has(current.type)) return { status: 400 };

  const input = request.body as {
    expectedRevision: number;
    name?: string;
    tags?: string[];
    taskIds?: string[];
    type?: ArtifactType;
    data?: unknown;
  };
  if (input.expectedRevision !== current.revision) return { status: 409 };

  const desired = input.taskIds === undefined ? undefined : unique(input.taskIds);
  if (desired?.some((id) => !tasksTable(store).has(id))) return { status: 404 };

  const currentIds = current.links.map((link) => link.taskId);
  const links: ArtifactLink[] =
    desired === undefined
      ? current.links
      : desired.map((taskId) => current.links.find((link) => link.taskId === taskId) ?? { taskId, relation: "uses" });
  // Só entrar ou sair da lista revisa a tarefa; quem fica não muda.
  const touched =
    desired === undefined
      ? []
      : [...desired.filter((id) => !currentIds.includes(id)), ...currentIds.filter((id) => !desired.includes(id))];

  table(store).set(current.id, {
    ...current,
    name: input.name ?? current.name,
    tags: input.tags ?? current.tags,
    type: input.type ?? current.type,
    data: input.type !== undefined ? input.data : current.data,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    links,
  });
  reviseTasks(store, touched);
  return { status: 204 };
}

/** Remoção é "soft": o artefato some das leituras e as relações com as tarefas ficam. */
function remove(request: FakeRequest, store: FakeStore): FakeResult {
  const current = visibleOne(store, request.params.artifactId ?? "");
  if (!current) return { status: 404 };
  if (current.global) return { status: 403 };
  if (FOLLOWS_FILES.has(current.type)) return { status: 400 };
  table(store).set(current.id, { ...current, deleted: true });
  return { status: 204 };
}

export const artifactsArea: FakeArea = {
  name: "artefatos",
  routes: [
    { method: "GET", path: "/api/artifacts", output: z.array(artifactSchema), handle: list },
    { method: "POST", path: "/api/artifacts", input: createArtifactRequestSchema, output: createdArtifactSchema, idempotent: true, handle: create },
    { method: "GET", path: "/api/artifacts/:artifactId", output: artifactSchema, handle: read },
    { method: "PATCH", path: "/api/artifacts/:artifactId", input: updateArtifactRequestSchema, handle: update },
    { method: "DELETE", path: "/api/artifacts/:artifactId", handle: remove },
  ],
};
