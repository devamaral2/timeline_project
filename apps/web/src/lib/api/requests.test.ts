import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeApi, type FakeApi } from "@/test/fake-api";
import { advanceRequest, requestsArea } from "@/test/fake-api/requests";
import { ApiRequestError } from "./client-request";
import {
  cancelRequest,
  FoodCancelConflictError,
  getRequest,
  HermesOffError,
  listRequests,
  sendHermesMessage,
  startEditRequest,
  startRequest,
  startVoiceRequest,
} from "./requests";

// A tela troca o authedFetch pela API falsa: a mesma costura dos testes de eventos.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;

function install(hermes: "on" | "off" = "off") {
  api = createFakeApi({ areas: [requestsArea({ hermes })] });
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => install());

const ana = { userId: "ana", text: "Quanto falta para a prova?" };

describe("contrato na API falsa", () => {
  test("um pedido com texto vazio não passa no esquema, e o teste quebra no lugar do bug", async () => {
    await expect(startRequest({ userId: "ana", text: "   " })).rejects.toThrow(/Fora do contrato em POST \/api\/requests; corpo recebido/);
  });
});

describe("pedido em texto", () => {
  test("abre o pedido e devolve só o id; a leitura mostra a fila", async () => {
    const requestId = await startRequest(ana);

    expect(requestId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const request = await getRequest(requestId);
    expect(request).toMatchObject({ id: requestId, status: "queued", route: "steps", text: ana.text });
  });

  test("o teste avança o pedido entre duas leituras: executando, depois feito com passos, entidades e resposta", async () => {
    const requestId = await startRequest(ana);
    expect((await getRequest(requestId)).status).toBe("queued");

    advanceRequest(api, requestId, {
      status: "running",
      progress: "Consultando a agenda",
      steps: [{ id: "s1", agent: "agenda", label: "Lendo a agenda", status: "running" }],
    });
    expect(await getRequest(requestId)).toMatchObject({ status: "running", progress: "Consultando a agenda" });

    advanceRequest(api, requestId, {
      status: "done",
      progress: undefined,
      message: "Faltam 3 dias.",
      steps: [{ id: "s1", agent: "agenda", label: "Lendo a agenda", status: "done" }],
      entities: [{ kind: "task", id: "ev-9", name: "Prova", operation: "create", linkedTo: [] }],
    });
    const done = await getRequest(requestId);
    expect(done).toMatchObject({ status: "done", message: "Faltam 3 dias." });
    expect(done.steps.map((step) => step.status)).toEqual(["done"]);
    expect(done.entities.map((entity) => entity.id)).toEqual(["ev-9"]);
  });

  test("o título é o começo do texto numa linha, com no máximo 80 caracteres", async () => {
    const requestId = await startRequest({ userId: "ana", text: "a".repeat(120) });

    expect((await getRequest(requestId)).title).toBe(`${"a".repeat(79)}…`);
  });

  test("reenviar o mesmo id de mensagem devolve o pedido já aceito, sem abrir outro", async () => {
    const first = await startRequest({ ...ana, clientMessageId: "msg-1" });
    const again = await startRequest({ ...ana, clientMessageId: "msg-1" });

    expect(again).toBe(first);
    expect(await listRequests()).toHaveLength(1);
  });

  test("um sessionId que não é pedido do usuário responde não encontrado", async () => {
    const anaFirst = await startRequest(ana);

    await expect(startRequest({ userId: "bia", text: "oi", sessionId: anaFirst })).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  test("um sessionId que já é continuação de outra sessão é entrada inválida", async () => {
    const first = await startRequest(ana);
    const second = await startRequest({ ...ana, sessionId: first });

    await expect(startRequest({ ...ana, sessionId: second })).rejects.toMatchObject({ kind: "invalid_input" });
  });

  test("a continuação leva o id do primeiro pedido como sessionId", async () => {
    const first = await startRequest(ana);
    const second = await startRequest({ ...ana, sessionId: first });

    expect((await getRequest(second)).sessionId).toBe(first);
  });
});

describe("edição da entidade aberta e voz", () => {
  test("o pedido de edição devolve o id do pedido", async () => {
    const requestId = await startEditRequest({
      userId: "ana",
      text: "Mude o nome",
      entityType: "task",
      entityId: "ev-1",
    });

    expect(await getRequest(requestId)).toMatchObject({ id: requestId, status: "queued" });
  });

  test("o pedido de voz devolve o id; o evento criado aparece nas entidades quando o pedido termina", async () => {
    const requestId = await startVoiceRequest({ transcript: "Dentista amanhã às 10", clientMessageId: "voz-1" });
    advanceRequest(api, requestId, {
      status: "done",
      entities: [{ kind: "task", id: "ev-2", name: "Dentista", operation: "create", linkedTo: [] }],
    });

    const request = await getRequest(requestId);
    expect(request).toMatchObject({ route: "voice", status: "done" });
    expect(request.entities[0]).toMatchObject({ kind: "task", id: "ev-2", operation: "create" });
  });
});

describe("Hermes", () => {
  test("com o Hermes ligado, a mensagem devolve o pedido inteiro, e não só o id", async () => {
    install("on");

    const request = await sendHermesMessage({ userId: "ana", text: "oi", clientMessageId: "h-1" });

    expect(request).toMatchObject({ route: "hermes", status: "queued", text: "oi" });
    expect(request.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test("com o Hermes desligado, a rota responde não encontrado antes de ler o corpo, e o cliente diz que está desligado", async () => {
    // Corpo inválido de propósito: a resposta tem de ser 404, não 400.
    await expect(
      api.authedFetch("/api/requests/hermes", { method: "POST", body: JSON.stringify({ userId: "ana" }) }),
    ).rejects.toMatchObject({ status: 404 });

    await expect(sendHermesMessage({ userId: "ana", text: "oi", clientMessageId: "h-2" })).rejects.toBeInstanceOf(
      HermesOffError,
    );
  });

  test("a mensagem ao Hermes com o mesmo id de cliente devolve o pedido já aceito", async () => {
    install("on");

    const first = await sendHermesMessage({ userId: "ana", text: "oi", clientMessageId: "h-3" });
    const again = await sendHermesMessage({ userId: "ana", text: "oi de novo", clientMessageId: "h-3" });

    expect(again.id).toBe(first.id);
    expect(await listRequests()).toHaveLength(1);
  });
});

describe("acompanhar, listar e cancelar", () => {
  test("a lista traz os pedidos do mais novo para o mais antigo", async () => {
    const older = await startRequest({ ...ana, text: "primeiro" });
    const newer = await startRequest({ ...ana, text: "segundo" });

    const list = await listRequests();

    expect(list.map((request) => request.id)).toEqual([newer, older]);
  });

  test("cancelar um pedido em andamento devolve o pedido cancelado", async () => {
    const requestId = await startRequest(ana);
    advanceRequest(api, requestId, { status: "running" });

    const cancelled = await cancelRequest(requestId);

    expect(cancelled.status).toBe("cancel");
    expect((await getRequest(requestId)).status).toBe("cancel");
  });

  test("cancelar um pedido que já terminou devolve o pedido como estava", async () => {
    const requestId = await startRequest(ana);
    advanceRequest(api, requestId, { status: "done", message: "Feito." });

    const result = await cancelRequest(requestId);

    expect(result).toMatchObject({ status: "done", message: "Feito." });
  });

  test("cancelar um pedido que calcula um alimento devolve o conflito próprio desse caso", async () => {
    const requestId = await startRequest(ana);
    advanceRequest(api, requestId, { route: "food", status: "running" });

    await expect(cancelRequest(requestId)).rejects.toBeInstanceOf(FoodCancelConflictError);
    expect((await getRequest(requestId)).status).toBe("running");
  });

  test("ler um pedido que não existe é não encontrado", async () => {
    await expect(getRequest("01ARZ3NDEKTSV4RRFFQ69G5FAV")).rejects.toBeInstanceOf(ApiRequestError);
    await expect(getRequest("01ARZ3NDEKTSV4RRFFQ69G5FAV")).rejects.toMatchObject({ kind: "not_found" });
  });
});
