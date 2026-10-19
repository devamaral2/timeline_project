import { beforeEach, describe, expect, test, vi } from "vitest";
import type { CreateEventInput } from "@repo/contracts";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { createEventsKit } from "../events/testing/in-memory-events-kit";
import { StubMealParsingGateway } from "../events/testing/stub-meal-parsing.gateway";
import { InMemoryTaskRepository } from "../tasks/testing/in-memory-task.repository";
import type { DayContext, DayContextQuery } from "./day-context.query";
import { FastStageError } from "./errors/agent.errors";
import type { EntitySpecialist, SpecialistRequest, SpecialistResult } from "./fast/entity-specialist";
import type { FastPipeline } from "./fast/fast-pipeline";
import type { PlannedOperation, TurnPlan } from "./fast/turn-planner";
import { RunAgentUseCase } from "./run-agent.usecase";
import type { TurnTraceRecord } from "./services/turn-trace";
import { InMemoryEntityBatchWriter } from "./testing/in-memory-entity-batch-writer";
import { ScriptedAgentGateway } from "./testing/scripted-agent.gateway";
import { StubScopedSqlQuery } from "./testing/stub-scoped-sql-query";

const NOW = new Date("2026-09-16T15:00:00Z");
const owner: AuthenticatedUser = { userId: "user-1" };
const local = (hour: number, minute = 0) =>
  `2026-09-16T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`;

type Fill = (request: SpecialistRequest) => SpecialistResult | Promise<SpecialistResult>;
const command = (args: Record<string, unknown>): SpecialistResult => ({ kind: "command", args, modelName: "stub" });

function op(partial: Partial<PlannedOperation> & Pick<PlannedOperation, "ref" | "skill">): PlannedOperation {
  return { mode: "create", span: "trecho", date: "2026-09-16", ...partial };
}

function setup(plan: TurnPlan | (() => Promise<TurnPlan>), fill: Fill = () => command({}), dayRef: { current?: DayContext } = {}) {
  const { eventRepository: events, noteRepository: notes, createEvent } = createEventsKit({
    mealParsingGateway: new StubMealParsingGateway({ items: [], modelProvider: "stub", modelName: "stub" }),
    clock: () => NOW,
  });
  const tasks = new InMemoryTaskRepository();
  const writer = new InMemoryEntityBatchWriter({ events, tasks, notes });
  const agent = new ScriptedAgentGateway([], JSON.stringify({ commands: [] }));
  const specialistCalls: SpecialistRequest[] = [];
  const fast: FastPipeline = {
    planner: { plan: typeof plan === "function" ? plan : async () => plan },
    specialist: { fill: async (request) => { specialistCalls.push(request); return fill(request); } } as Pick<EntitySpecialist, "fill">,
  };
  const dayRequests: string[] = [];
  const dayContext: DayContextQuery = {
    get: async ({ date }) => {
      dayRequests.push(date);
      const day = dayRef.current;
      return day && day.date === date ? day : { date, timeZone: "America/Sao_Paulo", events: [], tasks: [], notes: [] };
    },
  };
  const records: TurnTraceRecord[] = [];
  const routed = vi.fn(async () => ({ kind: "read" as const }));
  const useCase = new RunAgentUseCase(
    agent, new StubScopedSqlQuery(), writer, { events, tasks, notes }, createEvent,
    undefined, undefined, () => NOW, { route: routed }, dayContext, undefined,
    { record: async (trace) => { records.push(trace); } }, fast,
  );
  return { useCase, writer, agent, events, tasks, notes, createEvent, specialistCalls, dayRequests, records, routed };
}

let consoleInfo: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("pipeline rapido", () => {
  test("um relato de refeicao vira evento e nota num unico commit, sem o agente nem o roteador", async () => {
    const ctx = setup(
      { kind: "write", operations: [op({ ref: "a", skill: "save_meal_event" })] },
      () => command({ inputText: "200g de arroz, 200g de feijao e 200g de carne moida", startedAt: local(11, 30) }),
    );

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Comi 200g de arroz..." }, owner);

    expect(ctx.writer.commits).toHaveLength(1);
    expect(response.createdEntities).toHaveLength(1);
    expect(response.createdEntities[0]).toMatchObject({ kind: "event" });
    expect(ctx.writer.commits[0].notes).toHaveLength(1);
    expect(ctx.agent.lastInput).toBeUndefined();
    expect(ctx.routed).not.toHaveBeenCalled();
    expect(ctx.dayRequests).toEqual(["2026-09-16"]);
    expect(ctx.records).toHaveLength(1);
    expect(ctx.records[0]).toMatchObject({ pipeline: "fast", fastFallback: null, route: "fast", outcome: "ok", changes: 1 });
    expect(ctx.records[0].tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["planner", "specialist:save_meal_event", "get_day_context"]),
    );
    expect(Object.keys(ctx.records[0].stages)).toEqual(
      expect.arrayContaining(["planMs", "specialistsMs", "commandsMs", "commitMs"]),
    );
    consoleInfo.mockRestore();
  });

  test("varias operacoes rodam os especialistas em paralelo e entram no mesmo commit", async () => {
    let running = 0;
    let peak = 0;
    const ctx = setup(
      { kind: "write", operations: [
        op({ ref: "a", skill: "save_meal_event", span: "almocei" }),
        op({ ref: "b", skill: "save_training_event", span: "treinei" }),
        op({ ref: "c", skill: "save_task", span: "comprar pao", date: undefined }),
      ] },
      async ({ operation }) => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running -= 1;
        if (operation.skill === "save_meal_event") return command({ inputText: "arroz", startedAt: local(12) });
        if (operation.skill === "save_training_event") return command({ name: "Treino", startedAt: local(18), finishedAt: local(19), workouts: [{ type: "free", calories: 300, duration: 60 }] });
        return command({ name: "Comprar pão" });
      },
    );

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Almocei, treinei e comprar pao" }, owner);

    expect(peak).toBe(3);
    expect(ctx.writer.commits).toHaveLength(1);
    expect(response.createdEntities.map((item) => item.kind).sort()).toEqual(["event", "event", "task"]);
    expect(response.agentResponse).toContain("Comprar pão");
  });

  test("a nota ligada a uma operacao anterior recebe o id do evento criado pelo servidor", async () => {
    const ctx = setup(
      { kind: "write", operations: [
        op({ ref: "a", skill: "save_routine_event", span: "reuniao" }),
        op({ ref: "b", skill: "save_note", span: "anote que foi boa", date: undefined, linkTo: "a" }),
      ] },
      ({ operation }) => operation.skill === "save_note"
        ? command({ content: "Reunião foi boa", eventId: "id-inventado" })
        : command({ name: "Reunião", startedAt: local(10), finishedAt: local(11) }),
    );

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Reuniao das 10 e anote que foi boa" }, owner);

    const event = response.createdEntities.find((item) => item.kind === "event");
    const note = ctx.writer.commits[0].notes.find((change) => change.op === "create" && change.entity.type !== "meal");
    expect(event).toBeDefined();
    expect(note).toBeDefined();
    const linked = ctx.writer.commits[0].events.find((change) => change.op !== "delete" && change.entity.id === event?.id);
    expect(linked && linked.op !== "delete" && linked.entity.noteLinks.map((link) => link.noteId)).toContain(
      note && note.op !== "delete" ? note.entity.id : "",
    );
  });

  test("o servidor rearranja o dia depois dos especialistas, como no caminho de sempre", async () => {
    const ctx = setup(
      { kind: "write", operations: [
        op({ ref: "a", skill: "save_routine_event" }),
        op({ ref: "b", skill: "save_routine_event" }),
      ] },
      ({ operation }) => operation.ref === "a"
        ? command({ name: "Estudo", startedAt: local(13), finishedAt: local(14) })
        : command({ name: "Trabalho", startedAt: local(12), finishedAt: local(15) }),
    );

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Estudei e trabalhei" }, owner);

    expect(ctx.writer.commits).toHaveLength(1);
    const study = response.createdEntities.find((item) => item.name === "Estudo");
    expect(study).toMatchObject({ startedAt: new Date(local(15)).toISOString(), finishedAt: new Date(local(16)).toISOString() });
  });

  test("um horario que cai em outro dia faz o servidor ler esse dia antes de gravar", async () => {
    const ctx = setup(
      { kind: "write", operations: [op({ ref: "a", skill: "save_sleep_event" })] },
      () => command({ trackedSleepTime: 480, startedAt: "2026-09-15T23:00:00-03:00", finishedAt: "2026-09-16T07:00:00-03:00" }),
    );

    await ctx.useCase.execute({ userId: "user-1", text: "Dormi 8 horas" }, owner);

    expect(ctx.dayRequests.sort()).toEqual(["2026-09-15", "2026-09-16"]);
    expect(ctx.writer.commits).toHaveLength(1);
  });

  test("alterar um evento entrega ao especialista os eventos do dia e grava a alteracao", async () => {
    const dayRef: { current?: DayContext } = {};
    let id = "";
    const ctx = setup(
      { kind: "write", operations: [op({ ref: "a", skill: "save_routine_event", mode: "update" })] },
      () => command({ id, startedAt: local(13), finishedAt: local(14) }), dayRef,
    );
    const seed: CreateEventInput = { name: "Almoço", kind: "routine", startedAt: local(12), finishedAt: local(13) };
    id = (await ctx.createEvent.execute(seed, owner)).eventId;
    dayRef.current = {
      date: "2026-09-16", timeZone: "America/Sao_Paulo", tasks: [], notes: [],
      events: [{ id, name: "Almoço", started_at: local(12), finished_at: local(13), recurrence_id: null, taskIds: [], kind: "routine" }],
    };

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Mude o almoço para as 13h" }, owner);

    expect(ctx.specialistCalls[0].dayEvents?.map((event) => event.id)).toEqual([id]);
    expect(response.updatedEntities.map((item) => item.id)).toEqual([id]);
    expect((await ctx.events.findById(id))?.startedAt).toEqual(new Date(local(13)));
  });

  test("a pergunta do planejador volta ao usuario sem chamar especialista nem gravar", async () => {
    const ctx = setup({ kind: "clarify", question: "Qual refeição?" });

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Comi" }, owner);

    expect(response.agentResponse).toBe("Qual refeição?");
    expect(ctx.specialistCalls).toHaveLength(0);
    expect(ctx.writer.commits).toHaveLength(0);
    expect(ctx.records[0]).toMatchObject({ outcome: "clarification", pipeline: "fast" });
  });

  test("a pergunta de um especialista cancela o lote inteiro", async () => {
    const ctx = setup(
      { kind: "write", operations: [
        op({ ref: "a", skill: "save_meal_event" }), op({ ref: "b", skill: "save_routine_event" }),
      ] },
      ({ operation }) => operation.ref === "a"
        ? command({ inputText: "arroz" })
        : { kind: "clarify", question: "Qual evento?", modelName: "stub" },
    );

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Comi arroz e mude o evento" }, owner);

    expect(response.agentResponse).toBe("Qual evento?");
    expect(ctx.writer.commits).toHaveLength(0);
  });

  test("consulta, apagar e o que o fluxo rapido nao cobre seguem o roteador e o agente de sempre", async () => {
    const ctx = setup({ kind: "legacy", reason: "read" });

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Quantos treinos fiz?" }, owner);

    expect(ctx.routed).toHaveBeenCalledOnce();
    expect(ctx.agent.lastInput).toBeDefined();
    expect(response.createdEntities).toEqual([]);
    expect(ctx.records[0]).toMatchObject({ pipeline: "legacy", fastFallback: "read", route: "read", outcome: "ok" });
  });

  test("etapa que estoura o orcamento falha rapido, sem gravar e sem cair no agente", async () => {
    const ctx = setup(
      { kind: "write", operations: [op({ ref: "a", skill: "save_meal_event" })] },
      () => { throw new FastStageError("specialist", "timeout"); },
    );

    await expect(ctx.useCase.execute({ userId: "user-1", text: "Comi arroz" }, owner)).rejects.toBeInstanceOf(FastStageError);

    expect(ctx.writer.commits).toHaveLength(0);
    expect(ctx.agent.lastInput).toBeUndefined();
    expect(ctx.routed).not.toHaveBeenCalled();
    expect(ctx.records[0]).toMatchObject({
      pipeline: "fast", outcome: "stage_failed", errorCode: "FastStageError",
      tools: expect.arrayContaining([{ name: "specialist:save_meal_event", ms: expect.any(Number), ok: false }]),
    });
  });

  test("sem plano o pedido segue o caminho de sempre, marcado na trilha", async () => {
    const ctx = setup(async () => { throw new FastStageError("planner", "timeout"); });

    const response = await ctx.useCase.execute({ userId: "user-1", text: "Comi arroz" }, owner);

    expect(response.createdEntities).toEqual([]);
    expect(ctx.routed).toHaveBeenCalledOnce();
    expect(ctx.records[0]).toMatchObject({ pipeline: "legacy", fastFallback: "planner_timeout", outcome: "ok" });
    expect(ctx.records[0].tools).toContainEqual({ name: "planner", ms: expect.any(Number), ok: false });
  });

  test("um erro que nao e do planejador nao vira fallback", async () => {
    const ctx = setup(async () => { throw new Error("bug"); });

    await expect(ctx.useCase.execute({ userId: "user-1", text: "Comi arroz" }, owner)).rejects.toThrow("bug");

    expect(ctx.routed).not.toHaveBeenCalled();
  });

  test("cancelar depois do planejador nao chama especialistas nem grava", async () => {
    const controller = new AbortController();
    const ctx = setup(async () => {
      controller.abort();
      return { kind: "write", operations: [op({ ref: "a", skill: "save_meal_event" })] };
    });

    await expect(
      ctx.useCase.execute({ userId: "user-1", text: "Comi arroz" }, owner, { signal: controller.signal }),
    ).rejects.toThrow("cancelado");

    expect(ctx.specialistCalls).toHaveLength(0);
    expect(ctx.writer.commits).toHaveLength(0);
  });
});
