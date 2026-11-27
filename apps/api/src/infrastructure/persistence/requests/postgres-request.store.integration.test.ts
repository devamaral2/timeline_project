import type { AgentTraceDto } from "@repo/contracts";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { Artifact, Task } from "../../../domain";
import { toRequestDto } from "../../../api-core/requests/request-view";
import { PostgresEntityBatchWriter } from "../agent-batch/postgres-entity-batch-writer";
import { PostgresDatabase } from "../database/postgres-database";
import { PostgresTaskRepository } from "../tasks/repositories/postgres-task.repository";
import { PostgresTaskRequestLinkQuery } from "../tasks/queries/postgres-task-request-link.query";
import { createPostgresTestContext, type PostgresTestContext } from "../testing/postgres-test-context";
import { PostgresCandidateQuery } from "./postgres-candidate.query";
import { PostgresRequestStore } from "./postgres-request.store";
import { newOrderedId } from "./request-rows";

const USER = "user-1";

describe("PostgresRequestStore", () => {
  let ctx: PostgresTestContext;
  let store: PostgresRequestStore;
  let writer: PostgresEntityBatchWriter;

  beforeEach(async () => {
    if (!ctx) {
      ctx = await createPostgresTestContext();
      store = new PostgresRequestStore(new PostgresDatabase(ctx.pool));
      writer = new PostgresEntityBatchWriter(ctx.db);
    } else {
      await ctx.reset();
    }
  }, 60000);

  afterAll(async () => {
    if (ctx) await ctx.stop();
  });

  const start = (text = "almocei arroz e feijão", extra: Partial<Parameters<PostgresRequestStore["start"]>[0]> = {}) =>
    store.start({ userId: USER, route: "steps", text, job: "request-dispatch", ...extra });
  const rows = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) => (await ctx.pool.query<T>(sql, params)).rows;
  const jobs = () => rows<{ kind: string; task_id: string; concurrency_key: string | null; payload: unknown }>(
    "SELECT kind, task_id, concurrency_key, payload FROM jobs ORDER BY created_at, id");

  test("o pedido e uma tarefa de agente com a mensagem do usuario como primeira entrada e o job que o executa", async () => {
    const text = `almocei ${"muito bem ".repeat(20)}`;
    const { requestId, created } = await start(text, { context: { screen: "agenda" }, forceFallback: true });

    expect(created).toBe(true);
    const [task] = await rows("SELECT actor, kind, status, name, data, started_at, finished_at FROM tasks WHERE id = $1", [requestId]);
    expect(task).toMatchObject({
      actor: "agent", kind: "request", status: "queued", finished_at: null,
      data: { route: "steps", context: { screen: "agenda" }, forceFallback: true },
    });
    expect(String(task?.name).length).toBeLessThanOrEqual(80);
    expect(task?.started_at).toBeInstanceOf(Date);
    expect(await rows("SELECT kind, role, content FROM task_entries WHERE task_id = $1", [requestId]))
      .toEqual([{ kind: "message", role: "user", content: text }]);
    expect(await jobs()).toMatchObject([{ kind: "request-dispatch", task_id: requestId, payload: { requestId } }]);

    expect(await store.find(requestId)).toMatchObject({
      id: requestId, userId: USER, kind: "request", route: "steps", status: "queued", prompt: text,
      context: { screen: "agenda" }, forceFallback: true, failedSteps: [],
    });
  });

  test("reenviar a mesma mensagem devolve o pedido ja aceito: uma chave em idempotency_keys, um pedido, um job", async () => {
    const first = await start("almocei", { clientMessageId: "m1" });
    const again = await start("almocei", { clientMessageId: "m1" });
    const [left, right] = await Promise.all([start("jantei", { clientMessageId: "m2" }), start("jantei", { clientMessageId: "m2" })]);

    expect(again).toEqual({ requestId: first.requestId, created: false });
    expect(left.requestId).toBe(right.requestId);
    expect([left.created, right.created].sort()).toEqual([false, true]);
    expect(await rows("SELECT scope, key, response FROM idempotency_keys ORDER BY key")).toEqual([
      { scope: "request", key: "m1", response: { requestId: first.requestId } },
      { scope: "request", key: "m2", response: { requestId: left.requestId } },
    ]);
    expect(await rows("SELECT id FROM tasks")).toHaveLength(2);
    expect(await jobs()).toHaveLength(2);
    // A chave e por usuario: a mesma mensagem de outro usuario e outro pedido.
    const other = await store.start({ userId: "user-2", route: "steps", text: "almocei", job: "request-dispatch", clientMessageId: "m1" });
    expect(other.created).toBe(true);
  });

  test("os passos sao tarefas `step` ligados ao pedido por `step`, com o insumo numa entrada e um job por passo", async () => {
    const { requestId } = await start();
    const [first, second] = [newOrderedId(), newOrderedId()];
    const dispatch = {
      model: "jev-test", latencyMs: 12, answers: { task_create: { choice: "one", confidence: 0.99, probability: 0.98 } },
      uncertain: [], unsupported: [], candidates: { shortlisted: 3, selected: 1 },
    };
    await store.beginSteps(requestId, [
      { id: first, agent: "task-create", expected: "many" },
      {
        id: second, agent: "task-edit", expected: "one",
        input: { candidates: [{ kind: "task", id: "e1", name: "Pagar o aluguel" }] },
      },
    ], dispatch);

    expect(await rows("SELECT kind, status, name, data FROM tasks WHERE id = ANY($1::char(26)[]) ORDER BY id", [[first, second]])).toEqual([
      { kind: "step", status: "queued", name: "Criando tarefas", data: { agent: "task-create", expected: "many" } },
      { kind: "step", status: "queued", name: "Editando tarefas", data: { agent: "task-edit", expected: "one" } },
    ]);
    expect(await rows("SELECT to_task_id, relation FROM task_task_relation WHERE from_task_id = $1 ORDER BY to_task_id", [requestId]))
      .toEqual([first, second].map((id) => ({ to_task_id: id, relation: "step" })));
    expect((await jobs()).slice(1)).toMatchObject([
      { kind: "request-step", task_id: first, payload: { requestId, stepId: first } },
      { kind: "request-step", task_id: second },
    ]);

    // As escolhas ficam no pedido; as medidas, numa entrada de trace sem texto.
    const [request] = await rows("SELECT status, data FROM tasks WHERE id = $1", [requestId]);
    expect(request).toMatchObject({ status: "running", data: { dispatch: { answers: dispatch.answers, candidates: dispatch.candidates } } });
    expect(request?.data).not.toHaveProperty("dispatch.model");
    expect(await rows("SELECT content, data FROM task_entries WHERE task_id = $1 AND kind = 'trace'", [requestId]))
      .toEqual([{ content: null, data: { stage: "dispatch", model: "jev-test", latencyMs: 12, steps: 2 } }]);
    expect((await store.find(requestId))?.dispatch).toEqual(dispatch);

    const steps = await store.steps(requestId);
    expect(steps.map((step) => [step.agent, step.label, step.expected, step.status])).toEqual([
      ["task-create", "Criando tarefas", "many", "queued"],
      ["task-edit", "Editando tarefas", "one", "queued"],
    ]);
    expect(steps[0]?.input).toBeUndefined();
    expect(steps[1]?.input).toEqual({ candidates: [{ kind: "task", id: "e1", name: "Pagar o aluguel" }] });
  });

  test("as entradas de um passo ficam na ordem em que foram acrescentadas e nao mexem na revisao da tarefa", async () => {
    const { requestId } = await start();
    const stepId = newOrderedId();
    await store.beginSteps(requestId, [{
      id: stepId, agent: "task-edit", expected: "one", input: { candidates: [{ kind: "task", id: "e1", name: "Almoço" }] },
    }]);
    await store.markStepRunning(stepId);
    await store.recordThought(stepId, { text: "Preciso das tarefas de hoje.", at: "2026-10-25T15:00:01.000Z", model: "m" });
    await store.recordThought(stepId, { text: "Monto a consulta.", at: "2026-10-25T15:00:02.000Z" });
    await store.recordQueryResult({
      requestId, stepId, timings: { total: 850 },
      result: { columns: ["name"], rows: [["Almoço"]], truncated: false },
    });

    const entries = await rows("SELECT kind, role, content, data FROM task_entries WHERE task_id = $1 ORDER BY id", [stepId]);
    expect(entries.map((entry) => entry.kind)).toEqual(["input", "thought", "thought", "trace", "result"]);
    expect(entries[0]).toMatchObject({ content: null, role: null, data: { candidates: [{ kind: "task", id: "e1", name: "Almoço" }] } });
    expect(entries[3]).toEqual({ kind: "trace", role: null, content: null, data: { timings: { total: 850 } } });
    expect(entries[4]?.data).toEqual({ type: "query", columns: ["name"], rows: [["Almoço"]], truncated: false });
    expect(await rows("SELECT revision, status, finished_at IS NOT NULL AS finished FROM tasks WHERE id = $1", [stepId]))
      .toEqual([{ revision: 1, status: "done", finished: true }]);

    const [step] = await store.steps(requestId);
    expect(step).toMatchObject({
      status: "done", timings: { total: 850 }, result: { columns: ["name"], rows: [["Almoço"]], truncated: false },
      thoughts: [
        { text: "Preciso das tarefas de hoje.", at: "2026-10-25T15:00:01.000Z", model: "m" },
        { text: "Monto a consulta.", at: "2026-10-25T15:00:02.000Z" },
      ],
    });
    // A finalizacao do pedido roda em serie: o job aponta para o passo e leva a chave do pedido.
    expect((await jobs()).at(-1)).toMatchObject({ kind: "request-finalize", task_id: stepId, concurrency_key: `finalize:${requestId}` });
  });

  test("o que um passo tocou vira relacao partindo dele, na transacao das entidades; a finalizacao e uma entrada de resultado", async () => {
    const { requestId } = await start();
    const [createStep, editStep] = [newOrderedId(), newOrderedId()];
    await store.beginSteps(requestId, [
      { id: createStep, agent: "task-create", expected: "one" }, { id: editStep, agent: "artifact-edit", expected: "one" },
    ]);
    const meal = Task.create({ userId: USER, kind: "meal", name: "Almoço", startedAt: new Date("2026-10-25T15:00:00Z") });
    const food = Artifact.create({ userId: USER, type: "text", name: "Cardápio", data: { body: "arroz e feijão" } });
    const old = Artifact.create({ userId: USER, type: "text", name: "Velho", data: { body: "x" } });
    const gone = Task.create({ userId: USER, name: "Sumiu", startedAt: new Date("2026-10-25T10:00:00Z") });
    await writer.commit({ userId: USER, tasks: [{ op: "create", entity: gone }], artifacts: [{ op: "create", entity: old }] });

    await writer.commit({
      userId: USER,
      tasks: [{ op: "create", entity: meal }, { op: "delete", id: gone.id, expectedRevision: 1 }],
      artifacts: [{ op: "create", entity: food }],
      afterWrite: (tx) => store.recordStepSuccess(tx, {
        requestId, stepId: createStep, timings: { total: 10 },
        entities: [
          { kind: "task", id: meal.id, operation: "create" }, { kind: "task", id: gone.id, operation: "delete" },
          { kind: "artifact", id: food.id, operation: "create" },
        ],
      }),
    });
    await writer.commit({
      userId: USER, tasks: [],
      artifacts: [{ op: "update", entity: old.revise({ name: "Novo" }), expectedRevision: 1 }, { op: "delete", id: food.id, expectedRevision: 1 }],
      afterWrite: (tx) => store.recordStepSuccess(tx, {
        requestId, stepId: editStep, timings: {},
        entities: [{ kind: "artifact", id: old.id, operation: "update" }, { kind: "artifact", id: food.id, operation: "delete" }],
      }),
    });

    expect(await rows("SELECT to_task_id, relation FROM task_task_relation WHERE from_task_id = $1 ORDER BY relation", [createStep]))
      .toEqual([{ to_task_id: gone.id, relation: "deletes" }, { to_task_id: meal.id, relation: "generates" }]);
    // A tarefa tambem aponta para o pedido que o criou ou o apagou, alem do passo.
    expect(await rows("SELECT to_task_id, relation FROM task_task_relation WHERE from_task_id = $1 AND relation <> 'step' ORDER BY relation", [requestId]))
      .toEqual([{ to_task_id: gone.id, relation: "deletes" }, { to_task_id: meal.id, relation: "generates" }]);
    // O detalhe da tarefa le o pedido, nunca o passo.
    expect(await new PostgresTaskRequestLinkQuery(ctx.db).linksOf(meal.id))
      .toMatchObject([{ requestId, relation: "generates", name: "almocei arroz e feijão" }]);
    expect(await rows("SELECT task_id, artifact_id, relation, position FROM task_artifact_relation ORDER BY relation, artifact_id")).toEqual([
      { task_id: createStep, artifact_id: food.id, relation: "creates", position: null },
      { task_id: editStep, artifact_id: food.id, relation: "deletes", position: null },
      { task_id: editStep, artifact_id: old.id, relation: "updates", position: null },
    ].sort((a, b) => a.relation.localeCompare(b.relation) || a.artifact_id.localeCompare(b.artifact_id)));
    // Relacoes que partem de uma tarefa de agente nao contam como edicao de ninguem.
    expect(await rows("SELECT revision FROM tasks WHERE id = $1", [meal.id])).toEqual([{ revision: 1 }]);

    const entities = await store.entities(requestId);
    // A mesma entidade tocada por dois passos conta uma vez: vale o primeiro.
    expect(entities.map((entity) => [entity.kind, entity.summary.name, entity.operation, entity.stepId, entity.finalized]).sort()).toEqual([
      ["artifact", "Cardápio", "create", createStep, false],
      ["artifact", "Novo", "update", editStep, false],
      ["task", "Almoço", "create", createStep, false],
      ["task", "Sumiu", "delete", createStep, false],
    ]);
    expect(entities.find((entity) => entity.id === meal.id)?.summary).toMatchObject({ taskKind: "meal", startedAt: "2026-10-25T15:00:00.000Z" });
    expect(entities.find((entity) => entity.id === food.id)?.summary).toMatchObject({ artifactType: "text", text: "arroz e feijão" });

    const link = { from: { kind: "artifact" as const, id: food.id }, to: { kind: "task" as const, id: meal.id } };
    await store.markFinalized(undefined, { kind: "artifact", id: food.id, stepId: createStep }, [link]);
    await store.markFinalized(undefined, { kind: "task", id: gone.id, stepId: createStep }, []);
    expect(await rows("SELECT data FROM task_entries WHERE task_id = $1 AND kind = 'result' ORDER BY id", [createStep])).toEqual([
      { data: { type: "finalized", entity: { kind: "artifact", id: food.id }, links: [link] } },
      { data: { type: "finalized", entity: { kind: "task", id: gone.id }, links: [] } },
    ]);
    const after = await store.entities(requestId);
    // A ligacao vale para os dois lados.
    expect(after.find((entity) => entity.id === food.id)).toMatchObject({ finalized: true, links: [link] });
    expect(after.find((entity) => entity.id === meal.id)).toMatchObject({ finalized: false, links: [link] });
    const record = await store.find(requestId);
    if (!record) throw new Error("request not found");
    expect(toRequestDto(record, await store.steps(requestId), after).entities.find((entity) => entity.id === meal.id))
      .toMatchObject({ kind: "task", operation: "create", linkedTo: [{ kind: "artifact", id: food.id }] });
  });

  test("se o passo ja nao esta aberto, as entidades do lote nao sao gravadas", async () => {
    const { requestId } = await start();
    const stepId = newOrderedId();
    await store.beginSteps(requestId, [{ id: stepId, agent: "task-create", expected: "one" }]);
    await store.cancel(requestId);
    const task = Task.create({ userId: USER, name: "Almoço", startedAt: new Date() });

    await expect(writer.commit({
      userId: USER, tasks: [{ op: "create", entity: task }], artifacts: [],
      afterWrite: (tx) => store.recordStepSuccess(tx, { requestId, stepId, entities: [{ kind: "task", id: task.id, operation: "create" }], timings: {} }),
    })).rejects.toThrow("no longer open");

    expect(await rows("SELECT id FROM tasks WHERE id = $1", [task.id])).toEqual([]);
    expect((await store.steps(requestId))[0]?.status).toBe("cancel");
  });

  test("um passo que falha guarda o codigo e enfileira a finalizacao; fechar duas vezes nao muda nada", async () => {
    const { requestId } = await start();
    const stepId = newOrderedId();
    await store.beginSteps(requestId, [{ id: stepId, agent: "task-create", expected: "one" }]);

    await store.failStep({ requestId, stepId, errorCode: "agent_timeout", timings: { total: 8000 } });
    await store.failStep({ requestId, stepId, errorCode: "internal" });

    expect((await store.steps(requestId))[0]).toMatchObject({ status: "failed", errorCode: "agent_timeout", timings: { total: 8000 } });
    expect((await jobs()).filter((job) => job.kind === "request-finalize")).toHaveLength(1);
    expect(await rows("SELECT content, data FROM task_entries WHERE task_id = $1 AND kind = 'trace'", [stepId]))
      .toEqual([{ content: null, data: { timings: { total: 8000 }, errorCode: "agent_timeout" } }]);
  });

  test("o fim do pedido: a resposta e a ultima entrada, o raciocinio e um pensamento, e so fecha uma vez", async () => {
    const { requestId } = await start();
    await store.finish(requestId, "done", {
      failedSteps: [{ agent: "artifact-create", errorCode: "internal" }], message: "Criei a tarefa, mas não o alimento.",
      thought: "O passo de artefatos falhou.",
    });
    await store.finish(requestId, "failed", { message: "tarde demais" });

    expect((await rows("SELECT kind, role, content FROM task_entries WHERE task_id = $1 ORDER BY id", [requestId])).slice(1)).toEqual([
      { kind: "thought", role: null, content: "O passo de artefatos falhou." },
      { kind: "message", role: "agent", content: "Criei a tarefa, mas não o alimento." },
    ]);
    const request = await store.find(requestId);
    expect(request).toMatchObject({
      status: "done", answer: "Criei a tarefa, mas não o alimento.", answerThought: "O passo de artefatos falhou.",
      failedSteps: [{ agent: "artifact-create", errorCode: "internal" }],
    });
    expect(request?.finishedAt).toBeInstanceOf(Date);
    expect(request?.updatedAt.getTime()).toBeGreaterThanOrEqual(request?.createdAt.getTime() ?? 0);
  });

  test("o rastro do Hermes sobrevive ao job: os itens viram pensamentos e os numeros, um trace sem texto", async () => {
    const { requestId } = await start("crie uma tarefa", { route: "hermes", job: "hermes-turn" });
    await store.markRunning(requestId);
    expect((await store.find(requestId))?.status).toBe("running");
    const trace: AgentTraceDto = {
      route: "hermes", status: "done", startedAt: "2026-10-25T15:00:00.000Z", durationMs: 1200,
      fields: [{ label: "Modelo", value: "m" }],
      entries: [
        { id: "request", kind: "request", label: "Pedido", status: "done", summary: "crie uma tarefa" },
        { id: "t1", kind: "tool", label: "Criou uma tarefa", source: "mcp_braid_create_task", status: "done", sections: [{ title: "Entrada", text: "almoço", code: true }] },
        { id: "answer", kind: "answer", label: "Respondeu", status: "done" },
      ],
    };

    await store.finish(requestId, "done", { message: "Feito.", trace });

    const entries = await rows("SELECT kind, content, data FROM task_entries WHERE task_id = $1 ORDER BY id", [requestId]);
    expect(entries.map((entry) => entry.kind)).toEqual(["message", "thought", "thought", "thought", "trace", "message"]);
    expect(entries[4]).toEqual({
      kind: "trace", content: null,
      data: { stage: "turn", route: "hermes", status: "done", startedAt: trace.startedAt, durationMs: 1200, fields: trace.fields },
    });
    const request = await store.find(requestId);
    expect(request).toMatchObject({ route: "hermes", status: "done", answer: "Feito.", trace });
    expect(request?.answerThought).toBeUndefined();
    if (!request) throw new Error("request not found");
    expect(toRequestDto(request, [], [])).toMatchObject({
      message: "Feito.", trace, steps: [{ id: "t1", agent: "mcp_braid_create_task", label: "Criou uma tarefa", status: "done" }],
    });
  });

  test("a lista de pedidos traz as paginas guardadas e os videos a transcrever, e nao os passos", async () => {
  const request = await start("oi");
  const page = Task.create({ userId: USER, name: "Pagina", actor: "agent", kind: "save_content", status: "done" });
  const video = Task.create({
    userId: USER, name: "Video", actor: "agent", kind: "save_content_with_transcription", status: "awaiting_transcription",
  });
  const step = Task.create({ userId: USER, name: "Passo", actor: "agent", kind: "step", status: "done" });
  const tasks = new PostgresTaskRepository(ctx.db);
  for (const task of [page, video, step]) await tasks.save(task);
  const listed = await store.list(USER, 10);

  expect(listed.map((record) => record.id).sort()).toEqual([request.requestId, page.id, video.id].sort());
  expect(listed.find((record) => record.id === video.id)).toMatchObject({ kind: "save_content_with_transcription", status: "awaiting_transcription" });
});

test("cancelar o pedido de transcricao que espera o servico local o leva a cancel", async () => {
  const video = Task.create({
    userId: USER, name: "Video", actor: "agent", kind: "save_content_with_transcription", status: "awaiting_transcription",
  });
  await new PostgresTaskRepository(ctx.db).save(video);

  expect(await store.cancel(video.id)).toEqual([video.id]);

  expect(await store.find(video.id)).toMatchObject({ status: "cancel", errorCode: "cancelled" });
  expect(await store.cancel(video.id)).toEqual([]);
});

test("a sessao e a relacao `follow_up` do primeiro pedido para cada continuacao", async () => {
    const first = await start("oi");
    const second = await start("e amanhã?", { sessionId: first.requestId });
    const third = await start("e depois?", { sessionId: first.requestId });

    expect(await rows("SELECT from_task_id, to_task_id FROM task_task_relation WHERE relation = 'follow_up' ORDER BY to_task_id")).toEqual([
      { from_task_id: first.requestId, to_task_id: second.requestId },
      { from_task_id: first.requestId, to_task_id: third.requestId },
    ]);
    expect((await store.find(first.requestId))?.sessionId).toBeUndefined();
    expect((await store.find(second.requestId))?.sessionId).toBe(first.requestId);
    expect((await store.find(third.requestId))?.sessionId).toBe(first.requestId);
    // A relacao de sessao nao e uma entidade tocada nem um passo.
    expect(await store.entities(first.requestId)).toEqual([]);
    expect(await store.steps(first.requestId)).toEqual([]);
  });

  test("cancelar marca o pedido e os passos abertos, devolve as tarefas cujos jobs parar e so vale uma vez", async () => {
    const { requestId } = await start();
    const [open, done] = [newOrderedId(), newOrderedId()];
    await store.beginSteps(requestId, [{ id: open, agent: "task-create", expected: "one" }, { id: done, agent: "query", expected: "one" }]);
    await store.recordQueryResult({ requestId, stepId: done, result: { columns: [], rows: [], truncated: false }, timings: {} });

    expect(await store.cancel(requestId)).toEqual([requestId, open, done]);
    expect(await store.cancel(requestId)).toEqual([]);

    expect(await store.find(requestId)).toMatchObject({ status: "cancel", errorCode: "cancelled" });
    expect((await store.steps(requestId)).map((step) => step.status)).toEqual(["cancel", "done"]);
    // O que chega depois do cancelamento nao reabre nada.
    await store.failStep({ requestId, stepId: open, errorCode: "internal" });
    await store.finish(requestId, "done", { message: "x" });
    await store.beginSteps(requestId, [{ id: newOrderedId(), agent: "query", expected: "one" }]);
    expect(await store.find(requestId)).toMatchObject({ status: "cancel" });
    expect(await store.steps(requestId)).toHaveLength(2);
  });

  test("o fallback e o Hermes: o pedido muda de rota, guarda o despacho e o job do Hermes entra na fila", async () => {
    const { requestId } = await start("o que você acha disso?");
    const dispatch = { model: "jev-test", latencyMs: 9, answers: {}, uncertain: [], unsupported: [], fallbackReason: "no_step" };
    await store.handToHermes(requestId, dispatch);

    expect(await store.find(requestId)).toMatchObject({ route: "hermes", status: "queued", dispatch });
    expect(await store.steps(requestId)).toEqual([]);
    expect((await jobs()).slice(1)).toMatchObject([
      { kind: "hermes-turn", task_id: requestId, payload: { requestId } },
    ]);
    expect(await rows("SELECT data FROM task_entries WHERE task_id = $1 AND kind = 'trace'", [requestId]))
      .toEqual([{ data: { stage: "dispatch", model: "jev-test", latencyMs: 9, steps: 0 } }]);

    // Pedido que ja terminou nao volta a andar.
    await store.finish(requestId, "done", { message: "Oi." });
    await store.handToHermes(requestId, dispatch);
    expect(await jobs()).toHaveLength(2);
  });

  test("configuracao: o pedido muda para a rota do modelo, guarda o despacho e a escolha, e o turno do modelo entra na fila", async () => {
    const { requestId } = await start("qual modelo você está usando?");
    const dispatch = { model: "jev-test", latencyMs: 7, answers: {}, uncertain: [], route: "config" as const };
    const model = { provider: "anthropic", model: "claude-opus-5-5", effort: "medium" } as const;
    await store.handToModel(requestId, dispatch, model);

    expect(await store.find(requestId)).toMatchObject({ route: "model", status: "queued", model, dispatch });
    expect(await store.steps(requestId)).toEqual([]);
    expect((await jobs()).slice(1)).toMatchObject([
      { kind: "model-turn", task_id: requestId, payload: { requestId } },
    ]);

    // Pedido que ja terminou nao volta a andar.
    await store.finish(requestId, "done", { message: "Opus 5.5." });
    await store.handToModel(requestId, dispatch, model);
    expect(await jobs()).toHaveLength(2);
  });

  test("a voz: o pedido gera a tarefa de pessoa e termina na transacao dela", async () => {
    const { requestId } = await start("comecei a estudar", { route: "voice", job: "voice-task" });
    const task = Task.create({ userId: USER, name: "Estudar", startedAt: new Date("2026-10-25T15:00:00Z") });
    await writer.commit({
      userId: USER, tasks: [{ op: "create", entity: task }], artifacts: [],
      afterWrite: (tx) => store.completeVoice(tx, { requestId, taskId: task.id }),
    });

    expect(await rows("SELECT to_task_id, relation FROM task_task_relation WHERE from_task_id = $1", [requestId]))
      .toEqual([{ to_task_id: task.id, relation: "generates" }]);
    expect(await store.find(requestId)).toMatchObject({ route: "voice", status: "done" });
    expect(await store.entities(requestId)).toMatchObject([
      { kind: "task", id: task.id, operation: "create", stepId: requestId, finalized: true, summary: { name: "Estudar" } },
    ]);
    expect((await rows("SELECT kind, data FROM task_entries WHERE task_id = $1 ORDER BY id", [requestId])).at(-1))
      .toEqual({ kind: "result", data: { type: "voice", taskId: task.id } });
  });

  test("a lista traz os pedidos do usuario do mais novo para o mais antigo, e nunca um passo ou uma tarefa de pessoa", async () => {
    const first = await start("primeiro");
    const second = await start("segundo", { route: "hermes", job: "hermes-turn" });
    await store.beginSteps(first.requestId, [{ id: newOrderedId(), agent: "task-create", expected: "one" }]);
    await store.start({ userId: "user-2", route: "steps", text: "de outro", job: "request-dispatch" });
    // Um alimento pendente abre um pedido de construcao: tambem e um pedido do usuario.
    const food = Artifact.create({
      userId: USER, type: "food", name: "Almoço",
      data: { description: "banana", items: [], totals: { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 }, generation: { status: "pending" } },
    });
    await writer.commit({
      userId: USER, artifacts: [{ op: "create", entity: food }],
      tasks: [{ op: "create", entity: Task.create({ userId: USER, name: "Reunião", startedAt: new Date() }) }],
    });

    const list = await store.list(USER, 10);

    expect(list.map((request) => [request.route, request.kind, request.prompt]).sort()).toEqual([
      ["food", "build_request", "banana"], ["hermes", "request", "segundo"], ["steps", "request", "primeiro"],
    ]);
    const mine = list.filter((request) => request.route !== "food").map((request) => request.id);
    expect(mine).toEqual([second.requestId, first.requestId]);
    expect(await store.list(USER, 1)).toHaveLength(1);
    // O alimento que o pedido de construcao altera aparece como entidade dele.
    const build = list.find((request) => request.route === "food");
    expect(await store.entities(build?.id as string)).toMatchObject([{ kind: "artifact", id: food.id, operation: "update", finalized: true }]);
    // Um passo nunca e encontrado como pedido.
    const [step] = await store.steps(first.requestId);
    expect(await store.find(step?.id as string)).toBeUndefined();

    const plan = await rows<{ "QUERY PLAN": string }>(
      "EXPLAIN SELECT id FROM tasks e WHERE e.user_id = $1 AND e.actor = 'agent' AND e.kind <> 'step' AND e.deleted_at IS NULL ORDER BY e.id DESC LIMIT 20", [USER]);
    expect(plan.map((row) => row["QUERY PLAN"]).join("\n")).toContain("tasks_requests_idx");
  });

  test("candidatos de edicao: so tarefas de pessoa, artefatos de conteudo do usuario e series", async () => {
    const now = new Date("2026-10-25T15:00:00Z");
    const { requestId } = await start("pedido antigo");
    const today = Task.create({ userId: USER, name: "Reunião", startedAt: now });
    const tracked = Task.create({ userId: USER, name: "Pagar o aluguel", status: "todo" });
    const done = Task.create({ userId: USER, name: "Já feito", status: "done" });
    const far = Task.create({ userId: USER, name: "Mês passado", startedAt: new Date("2026-09-01T15:00:00Z") });
    const foreign = Task.create({ userId: "user-2", name: "De outro", startedAt: now });
    const text = Artifact.create({ userId: USER, name: "Ideia", data: { body: "Visão semanal" } });
    const skill = Artifact.create({ userId: USER, type: "skill", name: "cafe", data: { path: "hermes/skills/cafe/SKILL.md", hash: "a".repeat(64), missing: false } });
    await writer.commit({ userId: USER, tasks: [today, tracked, done, far].map((entity) => ({ op: "create" as const, entity })), artifacts: [text, skill].map((entity) => ({ op: "create" as const, entity })) });
    await writer.commit({ userId: "user-2", tasks: [{ op: "create", entity: foreign }], artifacts: [] });

    const candidates = await new PostgresCandidateQuery(new PostgresDatabase(ctx.pool)).shortlist({ userId: USER, now, kinds: ["task", "artifact", "recurrence"] });

    expect(candidates.map((candidate) => [candidate.kind, candidate.name]).sort()).toEqual([
      ["artifact", "Ideia"], ["task", "Pagar o aluguel"], ["task", "Reunião"],
    ]);
    expect(candidates.find((candidate) => candidate.name === "Pagar o aluguel")).toMatchObject({ status: "todo" });
    expect(candidates.find((candidate) => candidate.name === "Ideia")).toMatchObject({ artifactType: "text", text: "Visão semanal" });
    expect(candidates.some((candidate) => candidate.id === requestId)).toBe(false);
  });
});
