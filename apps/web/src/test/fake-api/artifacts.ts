import type {
  ArtifactDto,
  ArtifactEventLinkDto,
  ArtifactType,
  CreateArtifactRequest,
  EventDto,
} from "@repo/contracts";
import {
  artifactSchema,
  createArtifactRequestSchema,
  createArtifactResponseSchema,
  updateArtifactRequestSchema,
} from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeArea, FakeRequest, FakeResult, FakeStore } from ".";

/**
 * Área de artefatos: lista, leitura, criação, edição e remoção. Os eventos que
 * citam um artefato são lidos da tabela de eventos (área de eventos); a tabela
 * tem o mesmo nome que `EVENTS` em `./events`, sem importá-la para não mexer nela.
 */

const ARTIFACTS = "artifacts";
const EVENTS = "events";
const ARTIFACT_TYPES: readonly ArtifactType[] = ["text", "food", "sleep", "training", "workout", "skill", "agent", "router"];
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
  eventId: string;
  relation: ArtifactEventLinkDto["relation"];
}

/** Como o artefato fica guardado: o que a leitura devolve, mais as relações com os eventos. */
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

/** Um artefato para o seed. Sem `data`, é um texto vazio; `links` diz em quais eventos ele aparece. */
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

function events(store: FakeStore) {
  return store.table<EventDto>(EVENTS);
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

/** Os eventos em que o artefato aparece; um evento que não existe mais não entra. Global não tem evento. */
function linksOf(artifact: StoredArtifact, store: FakeStore): ArtifactEventLinkDto[] {
  if (artifact.global) return [];
  const result: ArtifactEventLinkDto[] = [];
  for (const link of artifact.links) {
    const event = events(store).get(link.eventId);
    if (!event) continue;
    result.push({
      eventId: event.id,
      relation: link.relation,
      name: event.name,
      actor: event.actor,
      kind: event.kind,
      startedAt: event.startedAt,
      estimatedFinishAt: event.estimatedFinishAt,
    });
  }
  return result;
}

function toDto(artifact: StoredArtifact, store: FakeStore): ArtifactDto {
  return {
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
    events: linksOf(artifact, store),
  } as ArtifactDto;
}

function matchesText(artifact: StoredArtifact, q: string): boolean {
  if (artifact.name.toLocaleLowerCase("pt-BR").includes(q)) return true;
  // Nos de texto (`text`, `router`), a busca também olha o corpo.
  if (artifact.type === "text" || artifact.type === "router") {
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

/** Os eventos tocados por uma mudança de artefato ganham uma revisão, como na API. */
function reviseEvents(store: FakeStore, eventIds: readonly string[]): void {
  for (const id of eventIds) {
    const event = events(store).get(id);
    if (event) events(store).set(id, { ...event, revision: event.revision + 1 });
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
  const eventId = request.query.get("eventId") ?? undefined;

  // Sem `scope`, a lista é do usuário (globais não têm dono); com `scope=global`, são os globais.
  let found = [...table(store).values()]
    .filter((artifact) => !artifact.deleted && !artifact.derived)
    .filter((artifact) => (scope === "global" ? artifact.global : !artifact.global))
    .filter((artifact) => !type || artifact.type === type)
    .filter((artifact) => !tag || artifact.tags.includes(tag))
    .filter((artifact) => !q || matchesText(artifact, q))
    .filter((artifact) => !eventId || artifact.links.some((link) => link.eventId === eventId))
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
  const input = request.body as CreateArtifactRequest & { eventIds?: string[] };
  const eventIds = unique(input.eventIds);
  if (eventIds.some((id) => !events(store).has(id))) return { status: 404 };

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
    links: eventIds.map((eventId) => ({ eventId, relation: "creates" })),
    deleted: false,
  });
  reviseEvents(store, eventIds);
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
    eventIds?: string[];
    type?: ArtifactType;
    data?: unknown;
  };
  if (input.expectedRevision !== current.revision) return { status: 409 };

  const desired = input.eventIds === undefined ? undefined : unique(input.eventIds);
  if (desired?.some((id) => !events(store).has(id))) return { status: 404 };

  const currentIds = current.links.map((link) => link.eventId);
  const links: ArtifactLink[] =
    desired === undefined
      ? current.links
      : desired.map((eventId) => current.links.find((link) => link.eventId === eventId) ?? { eventId, relation: "uses" });
  // Só entrar ou sair da lista revisa o evento; quem fica não muda.
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
  reviseEvents(store, touched);
  return { status: 204 };
}

/** Remoção é "soft": o artefato some das leituras e as relações com os eventos ficam. */
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
