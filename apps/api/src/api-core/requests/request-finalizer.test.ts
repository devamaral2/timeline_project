import { describe, expect, test } from "vitest";
import { JevUnavailableError } from "./jev.client";
import { linkable, orient } from "./request-finalizer";
import { toRequestDto } from "./request-view";
import { addStep, confident, result, scriptedJev, setupRequest } from "./testing/request-test-kit";

const iso = (hour: number) => `2026-10-25T${String(hour).padStart(2, "0")}:00:00-03:00`;
const evt = (name: string, kind: string, hour: number, over: Record<string, unknown> = {}) => ({
  name, kind, status: null, priority: null, longRunning: false, startedAt: iso(hour), estimatedFinishAt: null,
  description: null, tags: [], followsFrom: [], ...over,
});

/** O exemplo-guia ate os passos concluidos: tres tarefas e um alimento, cada um no seu passo. */
async function guideExample() {
  const ctx = setupRequest("comendo 300g de arroz com 200g de feijão, depois vou nadar na praia...");
  const tasks = await addStep(ctx, "s-tasks", "task-create", "many");
  const artifacts = await addStep(ctx, "s-artifacts", "artifact-create");
  ctx.gateway.outputs.set("task_create", { tasks: [
    evt("Refeição", "meal", 12), evt("Nadar na praia", "training", 13), evt("Voltar para casa", "common", 15),
  ] });
  ctx.gateway.outputs.set("artifact_create", { artifacts: [
    { type: "food", name: "Arroz e feijão", content: "300g de arroz, 200g de feijão" },
  ] });
  return { ctx, tasks, artifacts };
}

const entitiesOf = (ctx: ReturnType<typeof setupRequest>) => ctx.store.entities("r1");

describe("fila de finalizacao", () => {
  test("tarefas concluidas primeiro: o JEV nao liga nenhuma e o pedido segue aberto", async () => {
    const { ctx, tasks } = await guideExample();
    await ctx.worker.run("task-create", tasks);
    const jev = scriptedJev(() => result({ link: confident("none") }));

    await ctx.finalizer(jev.client).run(tasks);

    expect((await entitiesOf(ctx)).every((entity) => entity.finalized && entity.links.length === 0)).toBe(true);
    expect(ctx.store.require("r1").status).toBe("running");
  });

  test("o alimento concluido e ligado à tarefa da refeicao e o pedido fecha", async () => {
    const { ctx, tasks, artifacts } = await guideExample();
    await ctx.worker.run("task-create", tasks);
    await ctx.finalizer(scriptedJev(() => result({ link: confident("none") })).client).run(tasks);
    await ctx.worker.run("artifact-create", artifacts);

    const jev = scriptedJev((questions) => {
      const criteria = (questions.link as { criteria: Record<string, string> }).criteria;
      const meal = Object.entries(criteria).find(([, text]) => text.includes("Refeição"));
      return result({ link: confident(meal?.[0] ?? "none") });
    });
    await ctx.finalizer(jev.client).run(artifacts);

    // O JEV viu o pedido, o alimento e as tres tarefas (e "nenhum").
    const [, state, questions] = jev.ask.mock.calls[0] as unknown as [unknown, Record<string, string>, { link: { criteria: Record<string, string> } }];
    expect(state.message).toContain("300g de arroz");
    expect(state.entity).toContain("300g de arroz, 200g de feijão");
    expect(Object.keys(questions.link.criteria)).toEqual(["none", "c1", "c2", "c3"]);

    const entities = await entitiesOf(ctx);
    const food = entities.find((entity) => entity.kind === "artifact");
    const meal = entities.find((entity) => entity.summary.name === "Refeição");
    const link = { from: { kind: "artifact", id: food?.id }, to: { kind: "task", id: meal?.id } };
    // A ligacao vale para os dois lados.
    expect(food?.links).toEqual([link]);
    expect(meal?.links).toEqual([link]);

    // Quem e editado e a tarefa: ela passa a criar o artefato que o pedido fez para ele.
    const stored = await ctx.taskRepository.findById(meal?.id as string);
    expect(stored?.artifactLinks).toEqual([{ artifactId: food?.id, relation: "creates", fromRecurrence: false }]);
    const swim = entities.find((entity) => entity.summary.name === "Nadar na praia");
    expect((await ctx.taskRepository.findById(swim?.id as string))?.artifactLinks).toEqual([]);

    expect(ctx.store.require("r1")).toMatchObject({ status: "done", failedSteps: [] });
    expect(toRequestDto(ctx.store.require("r1"), ctx.store.stepRecords, entities).entities.find((entity) => entity.kind === "artifact"))
      .toMatchObject({ artifactType: "food", operation: "create", linkedTo: [{ kind: "task", id: meal?.id }] });
  });

  test("a ordem de termino nao importa: alimento primeiro, tarefa depois, e a ligacao acontece quando a tarefa chega", async () => {
    const { ctx, tasks, artifacts } = await guideExample();
    await ctx.worker.run("artifact-create", artifacts);
    await ctx.finalizer(scriptedJev(() => result({})).client).run(artifacts);
    await ctx.worker.run("task-create", tasks);

    // Cada tarefa que chega e comparada com o alimento (e com as outras tarefas); so a refeicao fica com ele.
    const jev = scriptedJev((questions, state) => {
      const criteria = (questions.link as { criteria: Record<string, string> }).criteria;
      const food = Object.entries(criteria).find(([, text]) => text.startsWith("artefato"));
      return result({ link: confident(String(state.entity).includes("Refeição") ? food?.[0] ?? "none" : "none") });
    });
    await ctx.finalizer(jev.client).run(tasks);

    expect(jev.ask).toHaveBeenCalledTimes(3);
    const entities = await entitiesOf(ctx);
    const food = entities.find((entity) => entity.kind === "artifact");
    const meal = entities.find((entity) => entity.summary.name === "Refeição");
    expect(meal?.links).toEqual([{ from: { kind: "artifact", id: food?.id }, to: { kind: "task", id: meal?.id } }]);
    expect((await ctx.taskRepository.findById(meal?.id as string))?.artifactLinks.map((link) => link.artifactId)).toEqual([food?.id]);
  });

  test("duas tarefas nao se ligam: a ordem entre elas nao e decidida na finalizacao, e nenhuma e revisada", async () => {
    const ctx = setupRequest("organizar a festa e comprar o bolo");
    const first = await addStep(ctx, "s1", "task-create");
    const second = await addStep(ctx, "s2", "task-create");
    ctx.gateway.outputs.set("task_create", { tasks: [evt("Organizar a festa", "common", 10, { status: "todo" })] });
    await ctx.worker.run("task-create", first);
    await ctx.finalizer(scriptedJev(() => result({})).client).run(first);
    ctx.gateway.outputs.set("task_create", { tasks: [evt("Comprar o bolo", "common", 11, { status: "todo" })] });
    await ctx.worker.run("task-create", second);

    const jev = scriptedJev(() => result({ link: confident("c1") }));
    await ctx.finalizer(jev.client).run(second);

    // Sem candidato ligavel (so ha outra tarefa), o JEV nem e consultado.
    expect(jev.ask).not.toHaveBeenCalled();
    const [party, cake] = ctx.database.tasks;
    expect(ctx.database.edges).toEqual([]);
    expect([party?.revision, cake?.revision]).toEqual([1, 1]);
    expect((await entitiesOf(ctx)).find((entity) => entity.id === cake?.id)).toMatchObject({ finalized: true, links: [] });
  });

  test("resposta incerta ou JEV fora do ar: entidade finalizada sem ligacao, nada some", async () => {
    for (const reply of [
      () => result({ link: confident("c1", 0.9) }),
      () => new JevUnavailableError("provider"),
    ]) {
      const { ctx, tasks, artifacts } = await guideExample();
      await ctx.worker.run("task-create", tasks);
      await ctx.worker.run("artifact-create", artifacts);
      await ctx.finalizer(scriptedJev(reply).client).run(artifacts);

      expect((await entitiesOf(ctx)).find((entity) => entity.kind === "artifact")).toMatchObject({ finalized: true, links: [] });
      expect(ctx.batchWriter.commits).toHaveLength(2);
    }
  });

  test("passo que falhou nao trava o pedido: ele fecha com a falha registrada", async () => {
    const { ctx, tasks, artifacts } = await guideExample();
    await ctx.worker.run("task-create", tasks);
    ctx.gateway.outputs.delete("artifact_create");
    await ctx.worker.run("artifact-create", artifacts);
    const jev = scriptedJev(() => result({}));
    await ctx.finalizer(jev.client).run(tasks);
    await ctx.finalizer(jev.client).run(artifacts);

    expect(ctx.store.require("r1")).toMatchObject({
      status: "done", failedSteps: [{ agent: "artifact-create", errorCode: "internal" }],
    });
  });

  test("todos os passos falharam: o pedido falhou", async () => {
    const ctx = setupRequest();
    const tasks = await addStep(ctx, "s1", "task-create");
    await ctx.worker.run("task-create", tasks);
    await ctx.finalizer(scriptedJev(() => result({})).client).run(tasks);
    expect(ctx.store.require("r1").status).toBe("failed");
  });

  test("pedido cancelado: a finalizacao que ainda estava na fila nao faz nada", async () => {
    const { ctx, tasks } = await guideExample();
    await ctx.worker.run("task-create", tasks);
    await ctx.store.cancel("r1");
    const jev = scriptedJev(() => result({}));
    await ctx.finalizer(jev.client).run(tasks);
    expect(jev.ask).not.toHaveBeenCalled();
    expect(ctx.store.require("r1").status).toBe("cancel");
  });
});

describe("explicacao da falha", () => {
  /** O pedido fecha na ultima finalizacao a rodar, seja de passo concluido ou de passo que falhou. */
  async function withFailedArtifacts(explanation?: string) {
    const { ctx, tasks, artifacts } = await guideExample();
    if (explanation) {
      ctx.gateway.outputs.set("failure_explainer", { message: explanation });
    }
    await ctx.worker.run("task-create", tasks);
    ctx.gateway.outputs.delete("artifact_create");
    await ctx.worker.run("artifact-create", artifacts);
    const jev = scriptedJev(() => result({}));
    await ctx.finalizer(jev.client).run(tasks);
    return { ctx, finalize: () => ctx.finalizer(jev.client).run(artifacts) };
  }

  test("so quando algum passo falha, uma chamada curta diz o que falhou e o que deu certo", async () => {
    const { ctx, finalize } = await withFailedArtifacts("Criei as tarefas, mas não consegui criar o alimento.");

    await finalize();

    const call = ctx.gateway.calls.find((candidate) => candidate.schemaName === "failure_explainer");
    expect(call?.user).toContain("Criando artefatos (código: internal)");
    expect(call?.user).toContain("Criando tarefas");
    const request = ctx.store.require("r1");
    expect(request).toMatchObject({ status: "done", answer: "Criei as tarefas, mas não consegui criar o alimento." });
    expect(toRequestDto(request, ctx.store.stepRecords, []).message).toBe("Criei as tarefas, mas não consegui criar o alimento.");
  });

  test("se a explicacao tambem falha, vale a linha predefinida", async () => {
    const { ctx, finalize } = await withFailedArtifacts();
    await finalize();
    const request = ctx.store.require("r1");
    expect(request.answer).toBeUndefined();
    expect(toRequestDto(request, ctx.store.stepRecords, []).message).toBe("Não consegui concluir: criando artefatos.");
  });

  test("sucesso total nunca chama o modelo de explicacao", async () => {
    const { ctx, tasks, artifacts } = await guideExample();
    await ctx.worker.run("task-create", tasks);
    await ctx.worker.run("artifact-create", artifacts);
    const jev = scriptedJev(() => result({ link: confident("none") }));
    await ctx.finalizer(jev.client).run(tasks);
    await ctx.finalizer(jev.client).run(artifacts);
    expect(ctx.store.require("r1").status).toBe("done");
    expect(ctx.gateway.calls.some((call) => call.schemaName === "failure_explainer")).toBe(false);
  });
});

describe("series na finalizacao", () => {
  test("a primeira ocorrencia de uma serie nao e ligada ao artefato: a ligacao valeria para um dia so", async () => {
    const ctx = setupRequest("corrida toda segunda, e anota que preciso de tênis");
    const series = await addStep(ctx, "s-series", "recurring-task-create");
    const artifacts = await addStep(ctx, "s-artifacts", "artifact-create");
    ctx.gateway.outputs.set("recurring_task_create", { series: [{
      name: "Corrida", kind: "training", status: null, priority: null, description: null, tags: [], frequency: "weekly",
      interval: null, weekdays: ["mon"], monthDay: null, month: null, timeOfDay: "07:00", durationMinutes: null,
      startsOn: null, endsOn: null,
    }] });
    ctx.gateway.outputs.set("artifact_create", { artifacts: [{ type: "text", name: "Tênis", content: "Preciso de tênis" }] });
    await ctx.worker.run("recurring-task-create", series);
    await ctx.worker.run("artifact-create", artifacts);
    const jev = scriptedJev(() => result({ link: confident("c1") }));

    await ctx.finalizer(jev.client).run(series);
    await ctx.finalizer(jev.client).run(artifacts);

    expect(jev.ask).not.toHaveBeenCalled();
    expect((await entitiesOf(ctx)).every((entity) => entity.finalized && entity.links.length === 0)).toBe(true);
  });
});

describe("sentido da ligacao", () => {
  test("o artefato pertence à tarefa; so um artefato e uma tarefa se ligam, nunca dois do mesmo tipo", () => {
    const artifact = { kind: "artifact" as const };
    const task = { kind: "task" as const };
    const other = { kind: "task" as const };
    expect(orient(task, artifact)).toEqual({ from: artifact, to: task });
    expect(orient(artifact, task)).toEqual({ from: artifact, to: task });
    expect(linkable(artifact, task)).toBe(true);
    expect(linkable(task, artifact)).toBe(true);
    expect(linkable(artifact, artifact)).toBe(false);
    expect(linkable(task, other)).toBe(false);
  });
});
