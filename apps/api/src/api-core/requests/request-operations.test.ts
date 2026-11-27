import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkerAttemptsExhaustedError, type JobFailureHandler, type JobHandler } from "../../infrastructure/jobs/jobs.service";
import { RequestOperations, type RequestWorkers } from "./request-operations";
import { InMemoryRequestStore } from "./testing/in-memory-request-store";

const actor = { userId: "user-1" };
const SELECTION = { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" } as const;

function setup() {
  const store = new InMemoryRequestStore();
  const handlers = new Map<string, { run: JobHandler; onFailure?: JobFailureHandler }>();
  const jobs = {
    register: vi.fn((kind: string, run: JobHandler, options?: { onFailure?: JobFailureHandler }) => {
      handlers.set(kind, { run, onFailure: options?.onFailure });
    }),
    cancelOfTasks: vi.fn(async () => {}),
    progressOfTask: vi.fn(async (): Promise<unknown> => undefined),
  };
  const worker = () => ({ run: vi.fn(async () => {}) });
  const workers = {
    dispatcher: worker(), entity: worker(), edit: worker(), query: worker(), finalizer: worker(),
    editTarget: worker(), targetEdit: worker(), hermes: worker(), model: worker(), voice: worker(),
    food: { execute: vi.fn(async () => "completed"), fail: vi.fn(async () => "failed") },
  };
  const operations = new RequestOperations(jobs, store, workers as unknown as RequestWorkers);
  operations.onModuleInit();
  const context = { jobId: "j1", userId: "user-1", actorId: "user-1", attempt: 1, signal: new AbortController().signal, progress: vi.fn(async () => {}) };
  return { store, jobs, handlers, workers, operations, context };
}

afterEach(() => vi.unstubAllEnvs());

describe("fila dos pedidos", () => {
  test("um handler por tipo de job da IA, todos com o que fazer quando o job morre", () => {
    const { handlers } = setup();
    expect([...handlers.keys()].sort()).toEqual([
      "food-generation", "hermes-turn", "model-turn", "request-dispatch", "request-edit-target",
      "request-finalize", "request-step", "voice-task",
    ]);
    for (const [kind, handler] of handlers) expect(handler.onFailure, kind).toBeTypeOf("function");
  });

  test("o job do passo roda no worker do agente dele", async () => {
    const { store, handlers, workers, context } = setup();
    store.seed({ id: "r1", prompt: "x" });
    await store.beginSteps("r1", [
      { id: "s1", agent: "entity", expected: "many" }, { id: "s2", agent: "artifact-edit", expected: "one" },
      { id: "s3", agent: "food-edit", expected: "one" }, { id: "s4", agent: "query", expected: "one" },
    ]);
    const run = handlers.get("request-step")?.run as JobHandler;
    for (const stepId of ["s1", "s2", "s3", "s4"]) await run({ requestId: "r1", stepId }, context);

    expect(workers.entity.run).toHaveBeenCalledWith({ requestId: "r1", stepId: "s1" }, context.signal);
    expect(workers.edit.run).toHaveBeenCalledWith("artifact-edit", { requestId: "r1", stepId: "s2" }, context.signal);
    expect(workers.targetEdit.run).toHaveBeenCalledWith("food-edit", { requestId: "r1", stepId: "s3" }, context.signal);
    expect(workers.query.run).toHaveBeenCalledWith({ requestId: "r1", stepId: "s4" }, context.signal);
  });

  test("o job de um passo morreu: o passo fica vermelho com um codigo seguro e a finalizacao fecha o pedido", async () => {
    const { store, handlers, context } = setup();
    store.seed({ id: "r1", prompt: "x" });
    await store.beginSteps("r1", [{ id: "s1", agent: "entity", expected: "many" }]);

    await handlers.get("request-step")?.onFailure?.({ requestId: "r1", stepId: "s1" }, context, new Error("senha do banco: 123"));

    expect(store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "unavailable" });
    expect(store.jobs.at(-1)).toEqual({ kind: "request-finalize", requestId: "r1", stepId: "s1" });
  });

  test.each(["request-dispatch", "request-edit-target", "request-finalize", "hermes-turn", "voice-task"])(
    "o job %s morreu: o pedido nunca fica aberto", async (kind) => {
      const { store, handlers, context } = setup();
      store.seed({ id: "r1", prompt: "x", status: "running" });
      await handlers.get(kind)?.onFailure?.({ requestId: "r1" }, context, new Error("boom"));
      expect(store.require("r1")).toMatchObject({ status: "failed", errorCode: "unavailable" });
    },
  );

  test("o job abandonado por tentativas esgotadas interrompe o pedido que rodava; o que nao tinha comecado cai em failed", async () => {
    const { store, handlers, context } = setup();
    store.seed({ id: "r1", prompt: "x", status: "running" });
    store.seed({ id: "r2", prompt: "x", status: "queued" });
    for (const requestId of ["r1", "r2"]) {
      await handlers.get("hermes-turn")?.onFailure?.({ requestId }, context, new WorkerAttemptsExhaustedError());
    }
    expect(store.require("r1")).toMatchObject({ status: "interrupted", errorCode: "unavailable" });
    expect(store.require("r2")).toMatchObject({ status: "failed", errorCode: "unavailable" });
  });

  test("o alimento: o pedido de construcao passa a rodar, e a falha definitiva grava o estado de falha", async () => {
    const { store, handlers, workers, context } = setup();
    store.seed({ id: "b1", prompt: "banana", route: "food", kind: "build_request", status: "queued" });
    const payload = { artifactId: "a1" };
    await handlers.get("food-generation")?.run(payload, { ...context, taskId: "b1" });
    expect(store.require("b1").status).toBe("running");
    expect(workers.food.execute).toHaveBeenCalledWith(payload);
    await handlers.get("food-generation")?.onFailure?.(payload, context, new Error("x"));
    expect(workers.food.fail).toHaveBeenCalledWith(payload);
  });
});

describe("iniciar um pedido", () => {
  test("o pedido por passos nasce na fila do despacho, com o texto inteiro e o titulo curto", async () => {
    const { store, operations } = setup();
    const text = `almocei ${"muito ".repeat(30)}`;
    const id = await operations.start({ userId: "user-1", text, context: { screen: "agenda" } }, actor);

    expect(store.require(id)).toMatchObject({ route: "steps", status: "preparing", prompt: text, context: { screen: "agenda" } });
    expect(store.require(id).title.length).toBeLessThanOrEqual(80);
    expect(store.jobs).toEqual([{ kind: "request-dispatch", requestId: id }]);
    expect(store.require(id).model).toBeUndefined();
  });

  test("o pedido por passos guarda o modelo que o campo do chat mostrava, para os agentes rodarem com ele", async () => {
    const { store, operations } = setup();
    const id = await operations.start({ userId: "user-1", text: "o que tenho amanhã?", model: SELECTION }, actor);
    expect(store.require(id)).toMatchObject({ route: "steps", model: SELECTION });
    expect((await operations.view(id, actor)).model).toEqual(SELECTION);
  });

  test("o pedido que foi ao Hermes nao mostra a escolha: quem respondeu foi o modelo dele", async () => {
    const { store, operations } = setup();
    const id = await operations.start({ userId: "user-1", text: "pesquise um voo", model: SELECTION }, actor);
    await store.handToHermes(id, { answers: {}, uncertain: [] });
    expect((await operations.view(id, actor)).model).toBeUndefined();
  });

  test("`fallback: <pedido>` guarda so o pedido e marca o despacho para pular o JEV e ir ao Hermes", async () => {
    const { store, operations } = setup();
    const id = await operations.start({ userId: "user-1", text: "fallback: qual a capital da França?" }, actor);
    expect(store.require(id)).toMatchObject({ prompt: "qual a capital da França?", forceFallback: true });
  });

  test("reenviar a mesma mensagem devolve o pedido ja aceito, sem um segundo job", async () => {
    const { store, operations } = setup();
    const first = await operations.start({ userId: "user-1", text: "almocei", clientMessageId: "m1" }, actor);
    const again = await operations.start({ userId: "user-1", text: "almocei", clientMessageId: "m1" }, actor);
    expect(again).toBe(first);
    expect(store.jobs).toHaveLength(1);
  });

  test("a continuacao aponta para o primeiro pedido da sessao, que precisa ser do usuario e ser o primeiro", async () => {
    const { store, operations } = setup();
    const first = await operations.start({ userId: "user-1", text: "oi" }, actor);
    const next = await operations.start({ userId: "user-1", text: "e amanhã?", sessionId: first }, actor);
    expect(store.require(next).sessionId).toBe(first);
    expect(store.require(first).sessionId).toBeUndefined();

    await expect(operations.start({ userId: "user-1", text: "x", sessionId: next }, actor)).rejects.toBeInstanceOf(BadRequestException);
    await expect(operations.start({ userId: "user-1", text: "x", sessionId: "nao-existe" }, actor)).rejects.toBeInstanceOf(NotFoundException);
    store.seed({ id: "alheio", prompt: "x", userId: "outro" });
    await expect(operations.start({ userId: "user-1", text: "x", sessionId: "alheio" }, actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  test("o projectId das tres rotas que abrem pedido chega ao armazenamento, e o edit e a voz nao o aceitam", async () => {
    const { store, operations } = setup();
    const start = vi.spyOn(store, "start");
    const project = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

    await operations.start({ userId: "user-1", text: "a", projectId: project }, actor);
    await operations.startHermes({ userId: "user-1", text: "b", clientMessageId: "h1", projectId: project }, actor);
    await operations.startModel({ userId: "user-1", text: "c", clientMessageId: "m1", projectId: project, model: SELECTION }, actor);
    expect(start.mock.calls.map(([input]) => input.projectId)).toEqual([project, project, project]);

    await operations.start({ userId: "user-1", text: "d" }, actor);
    await operations.startEdit({ userId: "user-1", text: "e", entityType: "task", entityId: "t1" }, actor);
    await operations.startVoice({ transcript: "f" }, actor);
    expect(start.mock.calls.slice(3).map(([input]) => "projectId" in input)).toEqual([false, false, false]);
  });

  test("ninguem pede em nome de outro usuario", async () => {
    const { store, operations } = setup();
    await expect(operations.start({ userId: "outro", text: "x" }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(operations.startEdit({ userId: "outro", text: "x", entityType: "task", entityId: "e1" }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(operations.startHermes({ userId: "outro", text: "x", clientMessageId: "m" }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(operations.startModel({ userId: "outro", text: "x", clientMessageId: "m", model: SELECTION }, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.requests.size).toBe(0);
  });

  test("a edicao pela tela de detalhe nasce com o alvo, na fila que escolhe o agente", async () => {
    const { store, operations } = setup();
    const id = await operations.startEdit({ userId: "user-1", text: "mude para 19h", entityType: "task", entityId: "01H0TASK" }, actor);
    expect(store.require(id)).toMatchObject({
      route: "steps", prompt: "mude para 19h", status: "preparing",
      target: { entityType: "task", entityId: "01H0TASK" }, context: { screen: "detail", entityId: "01H0TASK" },
    });
    expect(store.jobs).toEqual([{ kind: "request-edit-target", requestId: id }]);
    expect(store.require(id).model).toBeUndefined();
  });

  test("a edicao pela tela de detalhe guarda o modelo que o campo mostrava", async () => {
    const { store, operations } = setup();
    const id = await operations.startEdit(
      { userId: "user-1", text: "mude para 19h", entityType: "task", entityId: "01H0TASK", model: SELECTION }, actor);
    expect(store.require(id)).toMatchObject({ target: { entityType: "task", entityId: "01H0TASK" }, model: SELECTION });
  });

  test.each(["skill_artifact", "agent_artifact"] as const)("%s: so o dono da configuracao edita (ADR 0004)", async (entityType) => {
    const { store, operations } = setup();
    const input = { userId: "user-1", text: "mude", entityType, entityId: "a1" };
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", "");
    await expect(operations.startEdit(input, actor)).rejects.toBeInstanceOf(ForbiddenException);
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", "alguem-mais");
    await expect(operations.startEdit(input, actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.requests.size).toBe(0);
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", "user-1");
    await expect(operations.startEdit(input, actor)).resolves.toEqual(expect.any(String));
  });

  test("a mensagem ao Hermes e a fala viram pedidos da rota certa, cada um com o seu job", async () => {
    const { store, operations } = setup();
    const hermes = await operations.startHermes({ userId: "user-1", text: "crie uma tarefa", clientMessageId: "m1" }, actor);
    const voice = await operations.startVoice({ transcript: "comecei a estudar" }, actor);

    expect(hermes).toMatchObject({ route: "hermes", status: "queued", text: "crie uma tarefa", steps: [], entities: [] });
    expect(store.require(voice)).toMatchObject({ route: "voice", userId: "user-1", prompt: "comecei a estudar" });
    expect(store.jobs.map((job) => job.kind)).toEqual(["hermes-turn", "voice-task"]);
  });

  test("a mensagem ao modelo vira um pedido da rota dele, com a escolha, na sessao da conversa", async () => {
    const { store, operations } = setup();
    store.seed({ id: "01FIRST", prompt: "oi", status: "completed" });
    const claude = await operations.startModel({ userId: "user-1", text: "o que tenho amanhã?", sessionId: "01FIRST", clientMessageId: "m1", model: SELECTION }, actor);

    expect(claude).toMatchObject({ route: "model", status: "queued", text: "o que tenho amanhã?", sessionId: "01FIRST", steps: [], model: SELECTION });
    expect(store.jobs.map((job) => job.kind)).toEqual(["model-turn"]);
  });

  test("com as ferramentas da agenda ligadas, so o dono do MCP usa o modo modelo", async () => {
    const { store, operations } = setup();
    const input = { userId: "user-1", text: "x", clientMessageId: "m1", model: SELECTION };
    await expect(operations.startModel(input, actor, "dono")).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.requests.size).toBe(0);
    await expect(operations.startModel(input, actor, "user-1")).resolves.toMatchObject({ route: "model" });
  });
});

describe("acompanhar e cancelar", () => {
  test("o pedido de outro usuario e um 404, como um id que nao existe", async () => {
    const { store, operations } = setup();
    store.seed({ id: "r1", prompt: "x", userId: "outro" });
    await expect(operations.view("r1", actor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(operations.view("nao-existe", actor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(operations.cancel("r1", actor)).rejects.toBeInstanceOf(NotFoundException);
  });

  test("enquanto o Hermes trabalha, o rastro e os passos vem do progresso do job; depois, do que ficou gravado", async () => {
    const { store, jobs, operations } = setup();
    store.seed({ id: "h1", prompt: "oi", route: "hermes", status: "running" });
    const live = {
      route: "hermes" as const, status: "running" as const, fields: [],
      entries: [{ id: "c1", kind: "tool" as const, label: "Listou a agenda", status: "running" as const }],
    };
    jobs.progressOfTask.mockResolvedValue({ trace: live });

    const running = await operations.view("h1", actor);
    expect(jobs.progressOfTask).toHaveBeenCalledWith("h1");
    expect(running).toMatchObject({ trace: live, progress: "Listou a agenda", steps: [{ id: "c1", label: "Listou a agenda", status: "running" }] });

    const final = { ...live, status: "done" as const, entries: [{ ...live.entries[0], status: "done" as const }] };
    await store.finish("h1", "completed", { message: "Pronto.", trace: final });
    jobs.progressOfTask.mockClear();
    const done = await operations.view("h1", actor);
    expect(jobs.progressOfTask).not.toHaveBeenCalled();
    expect(done).toMatchObject({ status: "completed", message: "Pronto.", trace: final });
    expect(done.progress).toBeUndefined();
  });

  test("a lista traz os pedidos do usuario do mais novo para o mais antigo, sem o rastro", async () => {
    const { store, operations } = setup();
    const first = await operations.start({ userId: "user-1", text: "primeiro" }, actor);
    const second = await operations.start({ userId: "user-1", text: "segundo" }, actor);
    store.seed({ id: "zzz-alheio", prompt: "x", userId: "outro" });

    const list = await operations.list(actor);

    expect(list.map((request) => request.id)).toEqual([second, first]);
    expect(list.every((request) => request.trace === undefined)).toBe(true);
    expect(await operations.list(actor, 1)).toHaveLength(1);
  });

  test("cancelar interrompe o pedido que rodava, cancela o passo que nao comecou e cancela os jobs vivos deles", async () => {
    const { store, jobs, operations } = setup();
    store.seed({ id: "r1", prompt: "x" });
    await store.beginSteps("r1", [{ id: "s1", agent: "entity", expected: "many" }, { id: "s2", agent: "query", expected: "one" }]);
    await store.markStepRunning("s2");
    await store.recordQueryResult({ requestId: "r1", stepId: "s2", result: { columns: [], rows: [], truncated: false }, timings: {} });

    const cancelled = await operations.cancel("r1", actor);

    expect(jobs.cancelOfTasks).toHaveBeenCalledWith(["r1", "s1", "s2"], "user-1");
    expect(cancelled).toMatchObject({ status: "interrupted", errorCode: "cancelled" });
    expect(cancelled.steps.map((step) => step.status)).toEqual(["cancelled", "completed"]);

    // Cancelar de novo, ou um pedido que ja terminou, nao muda nada.
    await operations.cancel("r1", actor);
    expect(jobs.cancelOfTasks).toHaveBeenLastCalledWith([], "user-1");
  });

  test("o pedido que calcula um alimento nao se cancela por aqui", async () => {
    const { store, jobs, operations } = setup();
    store.seed({ id: "b1", prompt: "banana", route: "food", kind: "build_request", status: "queued" });
    await expect(operations.cancel("b1", actor)).rejects.toBeInstanceOf(ConflictException);
    expect(jobs.cancelOfTasks).not.toHaveBeenCalled();
    expect(store.require("b1").status).toBe("queued");
  });
});
