import { beforeEach, describe, expect, test, vi } from "vitest";
import { createFakeApi, type FakeApi } from "@/test/fake-api";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";
import { ApiRequestError } from "./client-request";
import {
  createTask,
  deleteTask,
  getTask,
  listAgenda,
  listTrackedTasks,
  newIdempotencyKey,
  suggestTags,
  updateTask,
} from "./tasks";

// A tela troca o authedFetch pela API falsa: a costura que os testes de tela usam.
const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;

function install(seed: Parameters<typeof createFakeApi>[0]["seed"] = {}, pageSize?: number) {
  api = createFakeApi({ areas: [tasksArea], seed, pageSize });
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => install());

const MORNING = "2026-09-14T";
const window = { from: "2026-09-14T00:00:00-03:00", to: "2026-09-15T00:00:00-03:00" };

describe("agenda", () => {
  test("segue o nextCursor até a janela acabar e devolve uma lista só, em ordem de início", async () => {
    install(
      {
        tasks: [
          taskFixture({ id: "ev-3", startedAt: `${MORNING}11:00:00-03:00` }),
          taskFixture({ id: "ev-1", startedAt: `${MORNING}08:00:00-03:00` }),
          taskFixture({ id: "ev-2", startedAt: `${MORNING}09:00:00-03:00` }),
          taskFixture({ id: "ev-4", startedAt: `${MORNING}12:00:00-03:00` }),
          taskFixture({ id: "ev-5", startedAt: `${MORNING}13:00:00-03:00` }),
        ],
      },
      2,
    );

    const items = await listAgenda(window);

    expect(items.map((item) => item.id)).toEqual(["ev-1", "ev-2", "ev-3", "ev-4", "ev-5"]);
    const cursors = api.calls.map((call) => call.query.cursor);
    expect(cursors).toEqual([undefined, "2", "4"]);
  });

  test("manda a janela e o ator na consulta, e não manda cursor na primeira página", async () => {
    await listAgenda({ ...window, actor: "human", tag: "saude" });

    expect(api.calls[0]).toMatchObject({
      method: "GET",
      pathname: "/api/tasks",
      query: { from: window.from, to: window.to, actor: "human", tag: "saude" },
    });
    expect(api.calls[0].query).not.toHaveProperty("cursor");
  });

  test("não traz tarefa longa nem tarefa sem horário", async () => {
    install({
      tasks: [
        taskFixture({ id: "ev-1", startedAt: `${MORNING}08:00:00-03:00` }),
        taskFixture({ id: "ev-longo", longRunning: true, status: "doing", startedAt: `${MORNING}09:00:00-03:00` }),
        taskFixture({ id: "ev-sem-hora" }),
      ],
    });

    expect((await listAgenda(window)).map((item) => item.id)).toEqual(["ev-1"]);
  });
});

describe("lista de tarefas", () => {
  test("manda status e prioridade como valores separados por vírgula", async () => {
    install({
      tasks: [
        taskFixture({ id: "ev-1", status: "todo", priority: "urgent" }),
        taskFixture({ id: "ev-2", status: "done", priority: "urgent" }),
        taskFixture({ id: "ev-3", status: "doing", priority: "low" }),
      ],
    });

    const tasks = await listTrackedTasks({ status: ["todo", "doing"], priority: ["urgent", "high"] });

    expect(api.calls[0]).toMatchObject({
      pathname: "/api/tasks/tracked",
      query: { status: "todo,doing", priority: "urgent,high" },
    });
    expect(tasks.map((task) => task.id)).toEqual(["ev-1"]);
  });

  test("manda longRunning, tag, q e ator quando a tela os passa", async () => {
    await listTrackedTasks({ actor: "human", tag: "casa", q: "lixo", longRunning: false });

    expect(api.calls[0].query).toEqual({ actor: "human", tag: "casa", q: "lixo", longRunning: "false" });
  });
});

describe("criação", () => {
  test("envia a chave de idempotência e devolve o id da tarefa criada", async () => {
    const key = newIdempotencyKey();

    const taskId = await createTask({ name: "Caminhada", tags: ["saude"] }, { idempotencyKey: key });

    expect(taskId).toBe("ev-1");
    expect(api.calls[0]).toMatchObject({
      method: "POST",
      pathname: "/api/tasks",
      idempotencyKey: key,
      body: { name: "Caminhada", tags: ["saude"] },
    });
    expect(api.store.table<{ name: string }>("tasks").get("ev-1")?.name).toBe("Caminhada");
  });

  test("repetir a mesma chave não cria outra tarefa", async () => {
    const key = newIdempotencyKey();

    const first = await createTask({ name: "Caminhada" }, { idempotencyKey: key });
    const second = await createTask({ name: "Caminhada" }, { idempotencyKey: key });

    expect(second).toBe(first);
    expect(api.store.table("tasks").size).toBe(1);
  });

  test("a mesma chave com outro corpo vira entrada inválida na tela", async () => {
    const key = newIdempotencyKey();
    await createTask({ name: "Caminhada" }, { idempotencyKey: key });

    const error = await createTask({ name: "Corrida" }, { idempotencyKey: key }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ kind: "invalid_input", status: 422 });
  });

  test("um corpo fora do contrato derruba o teste, não vira erro de tela", async () => {
    const error = await createTask(
      { name: "Caminhada", status: "inventado" as never },
      { idempotencyKey: newIdempotencyKey() },
    ).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(ApiRequestError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/Fora do contrato/);
  });
});

describe("leitura, edição e remoção", () => {
  test("lê uma tarefa; um id que não existe vira não encontrado", async () => {
    install({ tasks: [taskFixture({ id: "ev-1", name: "Caminhada" })] });

    expect((await getTask("ev-1")).name).toBe("Caminhada");
    await expect(getTask("ev-404")).rejects.toMatchObject({ kind: "not_found", status: 404 });
  });

  test("edita com a revisão lida, sem mandar o taskId no corpo, e sobe a revisão", async () => {
    install({ tasks: [taskFixture({ id: "ev-1", status: "todo", revision: 4 })] });

    await updateTask("ev-1", { expectedRevision: 4, status: "done" });

    expect(api.calls[0]).toMatchObject({
      method: "PATCH",
      pathname: "/api/tasks/ev-1",
      body: { expectedRevision: 4, status: "done" },
    });
    expect(api.calls[0].body).not.toHaveProperty("taskId");
    expect(api.store.table<{ revision: number }>("tasks").get("ev-1")?.revision).toBe(5);
  });

  test("null apaga um campo", async () => {
    install({ tasks: [taskFixture({ id: "ev-1", status: "todo" })] });

    await updateTask("ev-1", { expectedRevision: 1, status: null });

    expect(api.store.table<{ status?: string }>("tasks").get("ev-1")?.status).toBeUndefined();
  });

  test("uma edição com revisão antiga vira revisão desatualizada", async () => {
    install({ tasks: [taskFixture({ id: "ev-1", revision: 2 })] });

    await expect(updateTask("ev-1", { expectedRevision: 1, name: "Nova" })).rejects.toMatchObject({
      kind: "stale_revision",
      status: 409,
    });
  });

  test("apagar responde 204 e não quebra; depois a tarefa não existe", async () => {
    install({ tasks: [taskFixture({ id: "ev-1" })] });

    await expect(deleteTask("ev-1")).resolves.toBeUndefined();
    await expect(getTask("ev-1")).rejects.toMatchObject({ kind: "not_found" });
  });

  test("sem permissão vira forbidden; 5xx segue como erro original", async () => {
    install({ tasks: [taskFixture({ id: "ev-1" })] });
    api.failNext("PATCH", "/api/tasks/ev-1", 403);
    api.failNext("DELETE", "/api/tasks/ev-1", 503);

    await expect(updateTask("ev-1", { expectedRevision: 1, name: "x" })).rejects.toMatchObject({ kind: "forbidden" });
    await expect(deleteTask("ev-1")).rejects.toMatchObject({ kind: "unavailable", status: 503 });
  });

  test("entrada inválida do servidor (400) vira invalid_input", async () => {
    install({ tasks: [taskFixture({ id: "ev-1" })] });
    api.failNext("PATCH", "/api/tasks/ev-1", 400);

    await expect(updateTask("ev-1", { expectedRevision: 1, name: "x" })).rejects.toMatchObject({ kind: "invalid_input" });
  });
});

describe("tags", () => {
  test("sugere tags pelo começo do texto", async () => {
    install({
      tasks: [
        taskFixture({ id: "ev-1", tags: ["saude", "casa"] }),
        taskFixture({ id: "ev-2", tags: ["sala"] }),
      ],
    });

    const suggestions = await suggestTags("sau");

    expect(suggestions).toEqual([{ id: "saude", name: "saude" }]);
    expect(api.calls[0]).toMatchObject({ pathname: "/api/tags", query: { query: "sau" } });
  });
});
