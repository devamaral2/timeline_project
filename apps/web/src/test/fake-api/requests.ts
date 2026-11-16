import type { RequestDto } from "@repo/contracts";
import { requestSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeApi, FakeArea, FakeRequest, FakeResult, FakeStore } from ".";

/**
 * Área de pedidos ao agente: abrir (texto, edição da entidade, Hermes, voz), acompanhar, listar e cancelar.
 *
 * Os corpos de entrada não estão no pacote de contratos: declarados aqui, com a forma dos controllers de
 * `apps/api/src/features/start-*-request/` e de `agent-input.schemas.ts`. As respostas usam `requestSchema`.
 */

const REQUESTS = "requests";
const OWNERS = "requestOwners";
const CLIENT_MESSAGES = "clientMessages";
const OPEN = new Set<RequestDto["status"]>(["queued", "running", "waiting"]);

const requestId = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const clientMessageId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const text = z.string().trim().min(1).max(4000);
const userId = z.string().min(1).max(128);

const startRequestBody = z.object({
  userId,
  text,
  context: z.object({
    screen: z.string().regex(/^[a-z0-9_-]{1,64}$/),
    entityId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  }).optional(),
  sessionId: requestId.optional(),
  clientMessageId: clientMessageId.optional(),
});

const startEditBody = z.object({
  userId,
  text,
  entityType: z.enum(["task", "artifact", "food_artifact", "sleep_artifact", "training_artifact", "skill_artifact", "agent_artifact"]),
  entityId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
});

const startHermesBody = z.object({
  userId,
  text,
  sessionId: requestId.optional(),
  clientMessageId,
});

const startVoiceBody = z.object({
  transcript: z.string().trim().min(1).max(1000),
  clientMessageId: clientMessageId.optional(),
});

const acceptedSchema = z.object({ requestId: z.string() }).strict();
const listSchema = z.array(requestSchema);

export interface RequestsAreaOptions {
  /** Como `AI_AUTOMATION` da API. Padrão `off`, como em `.env.example`: a rota do Hermes responde 404. */
  hermes?: "on" | "off";
}

export function requestsArea(options: RequestsAreaOptions = {}): FakeArea {
  const hermesOn = options.hermes === "on";
  return {
    name: "pedidos",
    routes: [
      { method: "POST", path: "/api/requests", input: startRequestBody, output: acceptedSchema, handle: startText },
      { method: "POST", path: "/api/requests/edit", input: startEditBody, output: acceptedSchema, handle: startEdit },
      // Desligado, a API responde 404 antes de ler o corpo: a rota fica sem `input`, então o corpo não é conferido.
      hermesOn
        ? { method: "POST", path: "/api/requests/hermes", input: startHermesBody, output: requestSchema, handle: startHermes }
        : { method: "POST", path: "/api/requests/hermes", handle: () => ({ status: 404 }) },
      { method: "POST", path: "/api/requests/voice", input: startVoiceBody, output: acceptedSchema, handle: startVoice },
      { method: "GET", path: "/api/requests", output: listSchema, handle: list },
      { method: "GET", path: "/api/requests/:requestId", output: requestSchema, handle: read },
      { method: "POST", path: "/api/requests/:requestId/cancel", output: requestSchema, handle: cancel },
    ],
  };
}

/**
 * Um pedido válido do contrato para semear a API falsa. Só o que o teste diz; o resto vem preenchido, como em
 * `eventFixture`. Para avançá-lo depois, use `advanceRequest`.
 */
export function requestFixture(overrides: Partial<RequestDto> & { id: string }): RequestDto {
  return requestSchema.parse({
    kind: "request",
    route: "steps",
    status: "queued",
    title: "Pedido",
    createdAt: "2026-11-14T09:41:00-03:00",
    updatedAt: "2026-11-14T09:41:00-03:00",
    steps: [],
    entities: [],
    ...overrides,
  }) as RequestDto;
}

/**
 * Avança um pedido entre duas leituras, como o agente faria: o teste escreve o estado (fila, executando, feito,
 * falhou), os passos, as entidades e a resposta. O resultado passa pelo esquema do contrato.
 */
export function advanceRequest(api: FakeApi, id: string, change: Partial<RequestDto>): RequestDto {
  const table = requests(api.store);
  const current = table.get(id);
  if (!current) throw new Error(`Pedido ${id} não existe na API falsa.`);
  const next = requestSchema.parse({ ...current, updatedAt: new Date().toISOString(), ...change }) as RequestDto;
  table.set(id, next);
  return next;
}

function requests(store: FakeStore) {
  return store.table<RequestDto>(REQUESTS);
}

function owners(store: FakeStore) {
  return store.table<string>(OWNERS);
}

function clientMessages(store: FakeStore) {
  return store.table<string>(CLIENT_MESSAGES);
}

/** `01…` com a forma de ULID: 26 caracteres de Crockford, ordenados pela criação. */
function newRequestId(store: FakeStore): string {
  const n = Number(store.nextId("request").slice("request-".length));
  return `R${String(n).padStart(25, "0")}`;
}

/** Primeira linha do texto, com no máximo 80 caracteres (o último é `…`). */
function titleOf(value: string): string {
  const line = value.split("\n")[0]?.trim() ?? "";
  return line.length <= 80 ? line : `${line.slice(0, 79)}…`;
}

/** Reenviar o mesmo `clientMessageId` do mesmo usuário devolve o pedido já aceito. */
function replayed(store: FakeStore, owner: string, clientMessage: string | undefined): string | undefined {
  if (clientMessage === undefined) return undefined;
  return clientMessages(store).get(`${owner}\u0000${clientMessage}`);
}

/** `sessionId` tem de ser o primeiro pedido da sessão e do mesmo usuário. */
function sessionFault(store: FakeStore, owner: string, sessionId: string | undefined): FakeResult | undefined {
  if (sessionId === undefined) return undefined;
  const first = requests(store).get(sessionId);
  if (!first || owners(store).get(sessionId) !== owner) return { status: 404 };
  if (first.sessionId !== undefined) return { status: 400 };
  return undefined;
}

function accept(
  store: FakeStore,
  fields: { owner: string; route: RequestDto["route"]; text?: string; sessionId?: string; clientMessageId?: string },
): RequestDto {
  const id = newRequestId(store);
  const now = new Date().toISOString();
  const request = requestSchema.parse({
    id,
    kind: "request",
    route: fields.route,
    status: "queued",
    title: titleOf(fields.text ?? ""),
    sessionId: fields.sessionId,
    createdAt: now,
    updatedAt: now,
    text: fields.text,
    steps: [],
    entities: [],
  }) as RequestDto;
  requests(store).set(id, request);
  owners(store).set(id, fields.owner);
  if (fields.clientMessageId !== undefined) {
    clientMessages(store).set(`${fields.owner}\u0000${fields.clientMessageId}`, id);
  }
  return request;
}

function startText(request: FakeRequest, store: FakeStore): FakeResult {
  const body = request.body as z.infer<typeof startRequestBody>;
  const again = replayed(store, body.userId, body.clientMessageId);
  if (again) return { status: 202, body: { requestId: again } };
  const fault = sessionFault(store, body.userId, body.sessionId);
  if (fault) return fault;
  const created = accept(store, { owner: body.userId, route: "steps", text: body.text, sessionId: body.sessionId, clientMessageId: body.clientMessageId });
  return { status: 202, body: { requestId: created.id } };
}

function startEdit(request: FakeRequest, store: FakeStore): FakeResult {
  const body = request.body as z.infer<typeof startEditBody>;
  const created = accept(store, { owner: body.userId, route: "steps", text: body.text });
  return { status: 202, body: { requestId: created.id } };
}

function startHermes(request: FakeRequest, store: FakeStore): FakeResult {
  const body = request.body as z.infer<typeof startHermesBody>;
  const again = replayed(store, body.userId, body.clientMessageId);
  if (again) return { status: 202, body: requests(store).get(again) };
  const fault = sessionFault(store, body.userId, body.sessionId);
  if (fault) return fault;
  const created = accept(store, {
    owner: body.userId,
    route: "hermes",
    text: body.text,
    sessionId: body.sessionId,
    clientMessageId: body.clientMessageId,
  });
  return { status: 202, body: created };
}

function startVoice(request: FakeRequest, store: FakeStore): FakeResult {
  const body = request.body as z.infer<typeof startVoiceBody>;
  // A voz não traz `userId`: o gateway identifica quem fala, e a API falsa não tem sessão. Todos compartilham a chave "".
  const again = replayed(store, "", body.clientMessageId);
  if (again) return { status: 202, body: { requestId: again } };
  const created = accept(store, { owner: "", route: "voice", text: body.transcript, clientMessageId: body.clientMessageId });
  return { status: 202, body: { requestId: created.id } };
}

function list(request: FakeRequest, store: FakeStore): FakeResult {
  const raw = request.query.get("limit");
  const limit = raw === null ? 20 : Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { status: 400 };
  // Lista sem `trace`, como a API; do mais novo para o mais antigo.
  const items = [...requests(store).values()]
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .slice(0, limit)
    .map((item) => ({ ...item, trace: undefined }));
  return { status: 200, body: items };
}

function read(request: FakeRequest, store: FakeStore): FakeResult {
  const found = requests(store).get(request.params.requestId ?? "");
  if (!found) return { status: 404 };
  return { status: 200, body: found };
}

function cancel(request: FakeRequest, store: FakeStore): FakeResult {
  const id = request.params.requestId ?? "";
  const current = requests(store).get(id);
  if (!current) return { status: 404 };
  // Pedido de alimento se apaga pelo artefato: o cálculo não para por aqui.
  if (current.route === "food") return { status: 409 };
  if (!OPEN.has(current.status)) return { status: 200, body: current };
  const cancelled = requestSchema.parse({
    ...current,
    status: "cancel",
    errorCode: "cancelled",
    updatedAt: new Date().toISOString(),
  }) as RequestDto;
  requests(store).set(id, cancelled);
  return { status: 200, body: cancelled };
}
