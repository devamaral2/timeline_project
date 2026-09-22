import { describe, expect, test } from "vitest";
import {
  AgentConversation,
  EntityBatchConflictError,
  Note,
  Task,
  type MealItem,
  type SleepItem,
  type TrainingData,
} from "../../domain";
import type { AgentEntityItem, CreateEventInput } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { ParsedMealFoodItem } from "../events/gateways/meal-parsing.gateway";
import { InMemoryEventDatabase } from "../events/testing/in-memory-event-database";
import { InMemoryEventRepository } from "../events/testing/in-memory-event.repository";
import { InMemoryWorkoutCatalog } from "../events/testing/in-memory-workout.catalog";
import { statusOfThrown } from "../events/testing/status-of";
import { StubMealParsingGateway } from "../events/testing/stub-meal-parsing.gateway";
import { CreateEventUseCase } from "../events/create-event.usecase";
import { InMemoryNoteRepository } from "../notes/testing/in-memory-note.repository";
import { InMemoryTaskRepository } from "../tasks/testing/in-memory-task.repository";
import { AgentRunCancelledError, LlmUnavailableError } from "./errors/agent.errors";
import type { AgentGateway } from "./gateways/agent.gateway";
import { InMemoryEntityBatchWriter } from "./testing/in-memory-entity-batch-writer";
import { ScriptedAgentGateway, type ScriptedToolCall } from "./testing/scripted-agent.gateway";
import { StubScopedSqlQuery } from "./testing/stub-scoped-sql-query";
import { claimsAWrite, RunAgentUseCase } from "./run-agent.usecase";

const NOW = new Date("2026-09-16T15:00:00.000Z");
const owner: AuthenticatedUser = { userId: "user-1" };

const RICE: ParsedMealFoodItem = {
  food: "Arroz",
  portion: "100 g",
  approximateWeightGrams: 100,
  caloriesKcal: 130,
  macronutrients: { carbohydratesGrams: 28, proteinsGrams: 2.5, totalFatGrams: 0.3, fiberGrams: 0.4 },
  mainMicronutrients: {},
  otherData: {},
};

function setup(
  options: { calls?: ScriptedToolCall[]; text?: string; stoppedByLimit?: boolean; gateway?: AgentGateway } = {},
) {
  const events = new InMemoryEventRepository(new InMemoryEventDatabase());
  const tasks = new InMemoryTaskRepository();
  const notes = new InMemoryNoteRepository();
  const createEvent = new CreateEventUseCase(
    events,
    new StubMealParsingGateway({ items: [RICE], modelProvider: "stub", modelName: "stub" }),
    new InMemoryWorkoutCatalog(),
    undefined,
    () => NOW,
  );
  const scripted = new ScriptedAgentGateway(options.calls, options.text, options.stoppedByLimit);
  const query = new StubScopedSqlQuery();
  const writer = new InMemoryEntityBatchWriter({ events, tasks, notes });
  const useCase = new RunAgentUseCase(
    options.gateway ?? scripted,
    query,
    writer,
    { events, tasks, notes },
    createEvent,
    undefined,
    undefined,
    () => NOW,
  );

  const seedEvent = async (input: CreateEventInput, userId = "user-1") => {
    const { eventId } = await createEvent.execute(input, { userId });
    return eventId;
  };
  const seedTask = async (userId = "user-1") => {
    const task = Task.create({ userId, name: "Casa", description: "", tags: [] });
    await tasks.save(task);
    return task;
  };

  return { useCase, scripted, query, writer, events, tasks, notes, seedEvent, seedTask };
}

function run(useCase: RunAgentUseCase, overrides: Partial<Parameters<RunAgentUseCase["execute"]>[0]> = {}, actor = owner) {
  return useCase.execute({ userId: "user-1", text: "pedido", ...overrides }, actor);
}

function dataOf(item: AgentEntityItem | undefined): unknown {
  if (item?.kind !== "event") throw new Error("expected an event");
  return item.items.find((eventItem) => eventItem.isPrimary)?.data;
}

function idOf(result: unknown): string {
  return (result as { id: string }).id;
}

describe("RunAgentUseCase — writes", () => {
  test("creates a training event for the target user and reports it", async () => {
    const { useCase, events } = setup({
      calls: [
        {
          name: "save_training_event",
          args: { workouts: [{ type: "running", distance: 5, duration: 30, pace: 6, calories: 300 }] },
        },
      ],
      text: "Registrei a corrida.",
    });

    const response = await run(useCase);

    expect(response.agentResponse).toBe("Registrei a corrida.");
    expect(response.createdEntities).toHaveLength(1);
    const created = response.createdEntities[0];
    expect(created.kind).toBe("event");
    expect((await events.findById(created.id))?.userId).toBe("user-1");
    expect((dataOf(created) as TrainingData).workouts[0].workoutName).toBe("Corrida");
  });

  test("a sleep correction replaces the values of the existing sleep", async () => {
    const { useCase, scripted, seedEvent, events } = setup();
    const sleepId = await seedEvent({ items: [{ type: "sleep", data: { trackedSleepTime: 420, score: 70 } }] });
    scripted.respondWith([{ name: "save_sleep_event", args: { id: sleepId, trackedSleepTime: 240 } }]);

    const response = await run(useCase);

    expect(response.updatedEntities.map((item) => item.id)).toEqual([sleepId]);
    const stored = await events.findById(sleepId);
    expect(stored?.items[0].data as SleepItem).toEqual({ trackedSleepTime: 240, score: 70 });
    expect(stored?.revision).toBe(2);
  });

  test("a meal update appends the parsed foods and recomputes the totals", async () => {
    const ctx = setup();
    const mealId = await ctx.seedEvent({ items: [{ type: "meal", data: { inputText: "100g de arroz" } }] });
    const { useCase, events } = setupWith(ctx, [{ name: "save_meal_event", args: { id: mealId, inputText: "mais 100g de arroz" } }]);

    await run(useCase);

    const meal = (await events.findById(mealId))?.items[0].data as MealItem;
    expect(meal.foodItems).toHaveLength(2);
    expect(meal.totals.totalCaloriesKcal).toBe(260);
    expect(meal.description).toBe("100g de arroz; mais 100g de arroz");
  });

  test("a training update keeps the previous workouts", async () => {
    const ctx = setup();
    const trainingId = await ctx.seedEvent({
      items: [{ type: "training", data: { workouts: [{ workoutCode: "free", duration: 20, calories: 50 }] } }],
    });
    const { useCase, events } = setupWith(ctx, [
      {
        name: "save_training_event",
        args: { id: trainingId, workouts: [{ type: "treadmill", duration: 30, calories: 200, pace: 6, distance: 5 }] },
      },
    ]);

    await run(useCase);

    const training = (await events.findById(trainingId))?.items[0].data as TrainingData;
    expect(training.workouts.map((workout) => workout.workoutCode)).toEqual(["free", "treadmill"]);
    expect(training.caloriesBurned).toBe(250);
  });

  test("creates a subtask under a task created in the same request", async () => {
    const { useCase, tasks } = setup({
      calls: [
        { name: "save_task", args: { name: "Limpar a casa" } },
        { name: "save_task", args: (results: unknown[]) => ({ name: "Varrer", parentTaskId: idOf(results[0]) }) },
      ],
    });

    const response = await run(useCase);

    const [parent, child] = response.createdEntities;
    expect((await tasks.findById(child.id))?.parentTaskId).toBe(parent.id);
  });

  test("uses the screen context to create a subtask in the task on screen", async () => {
    const ctx = setup();
    const onScreen = await ctx.seedTask();
    const { useCase, scripted, tasks } = setupWith(ctx, [
      { name: "save_task", args: { name: "Varrer a casa", parentTaskId: onScreen.id } },
    ]);

    await run(useCase, { text: "crie a subtarefa varrer a casa", context: { screen: "task", entityId: onScreen.id } });

    expect(scripted.lastInput?.systemPrompt).toContain(`registro com id ${onScreen.id}`);
    const [subtask] = await tasks.listByParentTaskId(onScreen.id);
    expect(subtask.name).toBe("Varrer a casa");
  });

  test("never touches another user's records and reports them as not found", async () => {
    const ctx = setup();
    const foreignId = await ctx.seedEvent(
      { items: [{ type: "sleep", data: { trackedSleepTime: 420, score: 0 } }] },
      "user-2",
    );
    const foreignTask = await ctx.seedTask("user-2");
    const { useCase, scripted, writer } = setupWith(ctx, [
      { name: "save_sleep_event", args: { id: foreignId, trackedSleepTime: 1 } },
      { name: "delete_entity", args: { kind: "task", id: foreignTask.id } },
      { name: "save_task", args: { name: "Filha", parentTaskId: foreignTask.id } },
    ]);

    const response = await run(useCase);

    expect(scripted.results).toEqual([
      { ok: false, error: `Não encontrei o registro ${foreignId}.` },
      { ok: false, error: `Não encontrei o registro ${foreignTask.id}.` },
      expect.objectContaining({ ok: false }),
    ]);
    expect(writer.commits).toEqual([]);
    expect(response.updatedEntities).toEqual([]);
  });

  test("reports the wrong tool for the event type back to the model", async () => {
    const ctx = setup();
    const sleepId = await ctx.seedEvent({ items: [{ type: "sleep", data: { trackedSleepTime: 420, score: 0 } }] });
    const { useCase, scripted } = setupWith(ctx, [{ name: "save_meal_event", args: { id: sleepId, inputText: "arroz" } }]);

    await run(useCase);

    expect(scripted.results[0]).toEqual({
      ok: false,
      error: `O evento ${sleepId} é do tipo sleep, não meal. Use a ferramenta desse tipo.`,
    });
  });

  test("a delete after an update keeps the revision read from the database", async () => {
    const ctx = setup();
    const task = await ctx.seedTask();
    const { useCase, writer, tasks } = setupWith(ctx, [
      { name: "save_task", args: { id: task.id, name: "Renomeada" } },
      { name: "delete_entity", args: { kind: "task", id: task.id } },
    ]);

    const response = await run(useCase);

    expect(writer.commits[0].tasks).toEqual([{ op: "delete", id: task.id, expectedRevision: 1 }]);
    expect(response.deletedEntities.map((item) => item.kind === "task" && item.name)).toEqual(["Casa"]);
    expect(await tasks.findById(task.id)).toBeNull();
  });

  test("refuses to update something created in the same request", async () => {
    const { useCase, scripted } = setup({
      calls: [
        { name: "save_note", args: { content: "a" } },
        { name: "save_note", args: (results: unknown[]) => ({ id: idOf(results[0]), content: "b" }) },
      ],
    });

    const response = await run(useCase);

    expect(scripted.results[1]).toMatchObject({ ok: false });
    expect(response.createdEntities).toHaveLength(1);
  });

  test("attaches a note to an existing task and refuses an unknown one", async () => {
    const ctx = setup();
    const task = await ctx.seedTask();
    const { useCase, scripted, notes } = setupWith(ctx, [
      { name: "save_note", args: { content: "Comprar vassoura", taskId: task.id } },
      { name: "save_note", args: { content: "x", taskId: "01UNKNOWN" } },
    ]);

    const response = await run(useCase);

    expect(scripted.results[1]).toEqual({ ok: false, error: "Não encontrei a tarefa 01UNKNOWN." });
    const [created] = response.createdEntities;
    expect(((await notes.findById(created.id)) as Note).taskId).toBe(task.id);
  });

  test("returns a summary when the model ends without text", async () => {
    const { useCase } = setup({ calls: [{ name: "save_note", args: { content: "a" } }], text: "   " });

    const response = await run(useCase);

    expect(response.agentResponse).toBe("Pronto. Criados: 1. Alterados: 0. Apagados: 0.");
  });
});

describe("RunAgentUseCase — queries and limits", () => {
  test("query_data always runs as the target user, whatever the model sends", async () => {
    const { useCase, query, writer } = setup({
      calls: [{ name: "query_data", args: { sql: "SELECT count(*) FROM events", userId: "user-2" } }],
      text: "Você tem 3 eventos.",
    });

    const response = await run(useCase);

    expect(query.calls).toEqual([
      { userId: "user-1", sql: "SELECT count(*) FROM events", scope: { includeChat: true } },
    ]);
    expect(writer.commits).toEqual([]);
    expect(response).toEqual({
      agentResponse: "Você tem 3 eventos.",
      createdEntities: [],
      updatedEntities: [],
      deletedEntities: [],
    });
  });

  test("o historico de chat sai do escopo quando o ator nao e o dono", async () => {
    const { useCase, query, scripted } = setup({
      calls: [{ name: "query_data", args: { sql: "SELECT 1" } }],
      text: "ok",
    });
    const admin = { userId: "admin", permissions: ["*:manage"], denies: [] };

    await useCase.execute({ userId: "user-1", text: "pedido" }, admin);

    // O texto que o usuario escreveu para um modelo ler nao entra no run de
    // outra pessoa — nem pela ferramenta, nem pela descricao no prompt.
    expect(query.calls).toEqual([{ userId: "user-1", sql: "SELECT 1", scope: { includeChat: false } }]);
    expect(query.describedScopes).toEqual([{ includeChat: false }]);
    // Nem a tabela na lista, nem a regra que mandaria consulta-la.
    expect(scripted.lastInput?.systemPrompt).not.toContain("chat_messages");
  });

  test("gives the model the schema, the São Paulo time and every tool", async () => {
    const { useCase, scripted } = setup();

    await run(useCase);

    expect(scripted.lastInput?.systemPrompt).toContain("events: Eventos da timeline.");
    expect(scripted.lastInput?.systemPrompt).toContain("16 de setembro de 2026 às 12:00");
    // A tabela na lista nao basta: sem a regra o modelo nao pensa em consultar
    // a propria conversa quando o usuario cita algo dito antes.
    expect(scripted.lastInput?.systemPrompt).toContain("chat_messages: consulte quando ele se");
    expect(scripted.lastInput?.tools.map((tool) => tool.name)).toEqual([
      "query_data",
      "save_training_event",
      "save_meal_event",
      "save_sleep_event",
      "save_routine_event",
      "save_task",
      "save_note",
      "delete_entity",
    ]);
  });

  test("a limit reached with staged changes writes nothing and answers 422", async () => {
    const { useCase, writer } = setup({
      calls: [{ name: "save_note", args: { content: "a" } }],
      stoppedByLimit: true,
    });

    expect(await statusOfThrown(() => run(useCase))).toBe(422);
    expect(writer.commits).toEqual([]);
  });

  test("a commit conflict answers 409", async () => {
    const ctx = setup({ calls: [{ name: "save_note", args: { content: "a" } }] });
    ctx.writer.commit = async () => {
      throw new EntityBatchConflictError("mudou");
    };

    expect(await statusOfThrown(() => run(ctx.useCase))).toBe(409);
  });

  test("a model failure answers 502 and writes nothing", async () => {
    const { useCase, writer } = setup({
      gateway: {
        run: async () => {
          throw new LlmUnavailableError("Falha ao consultar o modelo");
        },
      },
    });

    expect(await statusOfThrown(() => run(useCase))).toBe(502);
    expect(writer.commits).toEqual([]);
  });
});

describe("RunAgentUseCase — chat", () => {
  test("sends the quoted history and the conversational rules to the model", async () => {
    const { useCase, scripted } = setup({ text: "Pode deixar." });

    await useCase.execute({ userId: "user-1", text: "mude a prioridade dela" }, owner, {
      conversational: true,
      history: [
        { role: "user", text: "crie a tarefa limpar a casa" },
        {
          role: "assistant",
          text: "Criei a tarefa.",
          entities: [{ kind: "task", id: "01TASK", change: "created", label: "Limpar a casa" }],
        },
      ],
    });

    expect(scripted.lastInput?.text).toContain("Usuário: crie a tarefa limpar a casa");
    expect(scripted.lastInput?.text).toContain("tarefa 01TASK criada — Limpar a casa");
    expect(scripted.lastInput?.text?.endsWith("\nmude a prioridade dela")).toBe(true);
    expect(scripted.lastInput?.systemPrompt).toContain("pergunte o que falta");
    expect(scripted.lastInput?.systemPrompt).toContain("não use markdown");
    expect(scripted.lastInput?.systemPrompt).not.toContain("não há segunda rodada");
  });

  test("a single request keeps forbidding follow-up questions", async () => {
    const { useCase, scripted } = setup();

    await run(useCase);

    expect(scripted.lastInput?.text).toBe("pedido");
    expect(scripted.lastInput?.systemPrompt).toContain("não há segunda rodada");
  });

  test("reports each tool's progress label and the save before committing", async () => {
    const { useCase, writer } = setup({
      calls: [
        { name: "query_data", args: { sql: "SELECT 1" } },
        { name: "save_note", args: { content: "a" } },
      ],
    });
    const progress: string[] = [];
    const commitsSeenAtSave: number[] = [];

    await useCase.execute({ userId: "user-1", text: "pedido" }, owner, {
      onProgress: (label) => {
        progress.push(label);
        if (label === "Salvando") commitsSeenAtSave.push(writer.commits.length);
      },
    });

    expect(progress).toEqual(["Consultando seus dados", "Preparando nota", "Salvando"]);
    expect(commitsSeenAtSave).toEqual([0]);
    expect(writer.commits).toHaveLength(1);
  });

  test("a cancel before the commit writes nothing", async () => {
    const { useCase, scripted, writer } = setup({ calls: [{ name: "save_note", args: { content: "a" } }] });
    const controller = new AbortController();
    let release = () => {};
    scripted.holdUntil(new Promise<void>((resolve) => (release = resolve)));

    const running = useCase.execute({ userId: "user-1", text: "pedido" }, owner, { signal: controller.signal });
    controller.abort();
    release();

    await expect(running).rejects.toThrow(AgentRunCancelledError);
    expect(writer.commits).toEqual([]);
  });

  test("a cancel that arrives as the model finishes still writes nothing", async () => {
    const controller = new AbortController();
    const { useCase, writer } = setup({
      gateway: {
        run: async (input) => {
          await input.tools.find((tool) => tool.name === "save_note")?.execute({ content: "a" });
          controller.abort();
          return { text: "Feito.", modelName: "m", stoppedByLimit: false };
        },
      },
    });

    await expect(
      useCase.execute({ userId: "user-1", text: "pedido" }, owner, { signal: controller.signal }),
    ).rejects.toThrow(AgentRunCancelledError);
    expect(writer.commits).toEqual([]);
  });
});

describe("RunAgentUseCase — answers that claim a write", () => {
  /** Um modelo que responde uma coisa por rodada, chamando as ferramentas dadas. */
  function rounds(...answers: Array<{ text: string; calls?: ScriptedToolCall[] }>) {
    const inputs: string[] = [];
    const gateway: AgentGateway = {
      run: async (input) => {
        const answer = answers[inputs.length] ?? { text: "Fim." };
        inputs.push(input.text);
        for (const call of answer.calls ?? []) {
          await input.tools.find((tool) => tool.name === call.name)?.execute(call.args);
        }
        return { text: answer.text, modelName: "m", stoppedByLimit: false };
      },
    };
    return { gateway, inputs };
  }

  test("an answer that claims a change nobody prepared gets one more round, told nothing was saved", async () => {
    const model = rounds(
      { text: "Prioridade da tarefa alterada para alta." },
      { text: "Nota criada.", calls: [{ name: "save_note", args: { content: "a" } }] },
    );
    const { useCase, writer } = setup({ gateway: model.gateway });

    const response = await run(useCase, { text: "anote a" });

    expect(model.inputs).toHaveLength(2);
    expect(model.inputs[1]).toContain("nenhuma ferramenta de gravação foi chamada");
    expect(model.inputs[1]).toContain('"Prioridade da tarefa alterada para alta."');
    expect(response.agentResponse).toBe("Nota criada.");
    expect(writer.commits).toHaveLength(1);
  });

  test("the second round has the last word, even if it repeats the claim", async () => {
    const model = rounds({ text: "Tarefa criada." }, { text: "Tarefas criadas nesta semana: 3." });
    const { useCase, writer } = setup({ gateway: model.gateway });

    const response = await run(useCase);

    expect(model.inputs).toHaveLength(2);
    expect(response.agentResponse).toBe("Tarefas criadas nesta semana: 3.");
    expect(writer.commits).toEqual([]);
  });

  test("answers that claim nothing, or whose claim was prepared, run once", async () => {
    const report = rounds({ text: "Você dormiu 7 horas em média." });
    await run(setup({ gateway: report.gateway }).useCase);
    expect(report.inputs).toHaveLength(1);

    const honest = rounds({ text: "Nota criada.", calls: [{ name: "save_note", args: { content: "a" } }] });
    await run(setup({ gateway: honest.gateway }).useCase);
    expect(honest.inputs).toHaveLength(1);
  });

  test.each([
    ["Criei a tarefa.", true],
    ["Prioridade da tarefa limpar a casa alterada para alta.", true],
    ["O sono foi registrado.", true],
    ["Excluí a nota.", true],
    ["Você dormiu 7 horas em média.", false],
    ["Qual foi o horário do almoço?", false],
  ])("claimsAWrite(%s) is %s", (text, expected) => {
    expect(claimsAWrite(text)).toBe(expected);
  });
});

/** Os repositorios ja semeados, com o roteiro que depende dos ids semeados. */
function setupWith(ctx: ReturnType<typeof setup>, calls: ScriptedToolCall[]) {
  ctx.scripted.respondWith(calls);
  return ctx;
}

describe("conversation turns", () => {
  const conversation = () => {
    const created = AgentConversation.create({ userId: "user-1" });
    return { conversationId: created.id, create: created };
  };

  test("the REST path commits nothing when there is no entity to write", async () => {
    const { useCase, writer } = setup({ text: "Hoje você não tem nada." });

    await run(useCase);

    expect(writer.commits).toEqual([]);
  });

  test("a pure query turn in a conversation still commits, without announcing a save", async () => {
    const { useCase, writer } = setup({ text: "Hoje você não tem nada." });
    const labels: string[] = [];

    await useCase.execute({ userId: "user-1", text: "o que tenho hoje?" }, owner, {
      conversation: conversation(),
      onProgress: (label) => labels.push(label),
    });

    expect(writer.commits).toHaveLength(1);
    expect(writer.commits[0].conversation?.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    // "Salvando" anunciaria uma gravacao de entidade que nao houve.
    expect(labels).not.toContain("Salvando");
  });

  test("a turn that writes an entity still announces the save", async () => {
    const { useCase } = setup({
      calls: [{ name: "save_task", args: { op: "create", name: "Limpar" } }],
      text: "Tarefa criada.",
    });
    const labels: string[] = [];

    await useCase.execute({ userId: "user-1", text: "crie a tarefa" }, owner, {
      conversation: conversation(),
      onProgress: (label) => labels.push(label),
    });

    expect(labels).toContain("Salvando");
  });

  test("the stored user message is what the user typed, not the rendered conversation", async () => {
    const { useCase, writer } = setup({ text: "Pronto." });

    await useCase.execute({ userId: "user-1", text: "e agora?" }, owner, {
      conversation: conversation(),
      history: [
        { role: "user", text: "registre o sono" },
        { role: "assistant", text: "Feito." },
      ],
    });

    const [userMessage, assistantMessage] = writer.commits[0].conversation?.messages ?? [];
    expect(userMessage?.content).toBe("e agora?");
    expect(userMessage?.content).not.toContain("Conversa até aqui");
    expect(userMessage?.content).not.toContain("registre o sono");
    expect(assistantMessage?.content).toBe("Pronto.");
  });

  test("the assistant message carries the records the answer touched", async () => {
    const { useCase, writer } = setup({
      calls: [{ name: "save_task", args: { op: "create", name: "Limpar" } }],
      text: "Tarefa criada.",
    });

    await useCase.execute({ userId: "user-1", text: "crie a tarefa" }, owner, {
      conversation: conversation(),
    });

    const assistant = writer.commits[0].conversation?.messages.at(-1);
    expect(assistant?.entities).toEqual([
      expect.objectContaining({ kind: "task", change: "created", label: "Limpar" }),
    ]);
  });

  test("a cancelled turn writes neither the entity nor the conversation", async () => {
    const controller = new AbortController();
    const { useCase, writer } = setup({
      calls: [{ name: "save_task", args: { op: "create", name: "Limpar" } }],
      text: "Tarefa criada.",
    });
    controller.abort();

    await expect(
      useCase.execute({ userId: "user-1", text: "crie a tarefa" }, owner, {
        conversation: conversation(),
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(AgentRunCancelledError);
    expect(writer.commits).toEqual([]);
  });

  test("where the turn landed comes back from the commit", async () => {
    const { useCase } = setup({ text: "Pronto." });
    const target = conversation();
    const seqs: Array<{ firstSeq: number; lastSeq: number }> = [];
    const onConversationWritten = (value: { firstSeq: number; lastSeq: number }) => void seqs.push(value);

    await useCase.execute({ userId: "user-1", text: "oi" }, owner, {
      conversation: target,
      onConversationWritten,
    });
    await useCase.execute({ userId: "user-1", text: "e agora?" }, owner, {
      conversation: { conversationId: target.conversationId },
      onConversationWritten,
    });

    expect(seqs).toEqual([
      { firstSeq: 1, lastSeq: 2 },
      { firstSeq: 3, lastSeq: 4 },
    ]);
  });
});
