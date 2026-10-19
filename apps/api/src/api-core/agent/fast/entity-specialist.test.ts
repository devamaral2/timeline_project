import { describe, expect, it } from "vitest";
import { FastStageError } from "../errors/agent.errors";
import type { StructuredCompletionGateway, StructuredCompletionInput } from "../gateways/structured-completion.gateway";
import { routineEventSkill } from "../skills/routine-event.skill";
import { taskSkill } from "../skills/task.skill";
import { EntitySpecialist } from "./entity-specialist";
import type { PlannedOperation } from "./turn-planner";

const NOW = new Date("2026-09-16T15:00:00Z");
const create: PlannedOperation = { ref: "a", skill: "save_routine_event", mode: "create", span: "reunião às 10", date: "2026-09-16" };
const update: PlannedOperation = { ...create, mode: "update" };
const dayEvents = [{ id: "e1", name: "Almoço", started_at: "2026-09-16T15:00:00Z", finished_at: null, recurrence_id: null, taskIds: [], kind: "routine" as const }];

function specialist(value: unknown) {
  const calls: StructuredCompletionInput[] = [];
  const gateway: StructuredCompletionGateway = {
    complete: async (input) => { calls.push(input); return { value, modelName: "m" }; },
  };
  return { calls, specialist: new EntitySpecialist(gateway) };
}

describe("EntitySpecialist", () => {
  it("devolve os argumentos validados e trata null como ausencia", async () => {
    const { specialist: s, calls } = specialist({
      clarification: null, args: { name: "Reunião", startedAt: "2026-09-16T10:00:00-03:00", description: null, tags: null },
    });

    const result = await s.fill({ operation: create, skill: routineEventSkill, request: "reunião às 10", now: NOW });

    expect(result).toEqual({ kind: "command", args: { name: "Reunião", startedAt: "2026-09-16T10:00:00-03:00" }, modelName: "m" });
    expect(calls[0]).toMatchObject({ stage: "specialist", timeoutMs: 15000 });
    expect(calls[0].system).toContain("save_routine_event");
    expect(calls[0].user).toContain("reunião às 10");
    // Criar nao paga o custo de enviar o dia.
    expect(calls[0].user).not.toContain("Eventos de");
  });

  it("usa o horario do envelope e descarta um fim que nao vem depois do inicio", async () => {
    const { specialist: s } = specialist({
      startedAt: "2026-09-16T14:00:00-03:00", finishedAt: "2026-09-16T14:00:00-03:00", clarification: null, args: { name: "Reunião" },
    });

    const result = await s.fill({ operation: create, skill: routineEventSkill, request: "r", now: NOW });

    expect(result).toMatchObject({ kind: "command", args: { name: "Reunião", startedAt: "2026-09-16T14:00:00-03:00" } });
    expect((result as { args: object }).args).not.toHaveProperty("finishedAt");
  });

  it("o horario dentro dos argumentos vence o do envelope", async () => {
    const { specialist: s } = specialist({
      startedAt: "2026-09-16T09:00:00-03:00", finishedAt: "2026-09-16T10:00:00-03:00",
      clarification: null, args: { name: "Reunião", startedAt: "2026-09-16T08:00:00-03:00" },
    });

    const result = await s.fill({ operation: create, skill: routineEventSkill, request: "r", now: NOW });

    expect(result).toMatchObject({ args: { startedAt: "2026-09-16T08:00:00-03:00", finishedAt: "2026-09-16T10:00:00-03:00" } });
  });

  it("pede o horario como campo proprio, antes dos argumentos, so para eventos", async () => {
    const event = specialist({ clarification: null, args: { name: "Reunião" } });
    const task = specialist({ clarification: null, args: { name: "Pão" } });

    await event.specialist.fill({ operation: create, skill: routineEventSkill, request: "r", now: NOW });
    await task.specialist.fill({ operation: { ...create, skill: "save_task" }, skill: taskSkill, request: "r", now: NOW });

    expect(Object.keys((event.calls[0].schema as { properties: object }).properties)).toEqual(["startedAt", "finishedAt", "args", "clarification"]);
    expect(Object.keys((task.calls[0].schema as { properties: object }).properties)).toEqual(["args", "clarification"]);
  });

  it("descarta o id de uma criacao: quem cria nao altera", async () => {
    const { specialist: s } = specialist({ clarification: null, args: { id: "x", name: "Reunião" } });

    const result = await s.fill({ operation: create, skill: routineEventSkill, request: "r", now: NOW });

    expect(result).toMatchObject({ kind: "command", args: { name: "Reunião" } });
    expect((result as { args: object }).args).not.toHaveProperty("id");
  });

  it("para alterar, envia os eventos do dia e aceita so um id que esta neles", async () => {
    const ok = specialist({ clarification: null, args: { id: "e1", name: "Almoço longo" } });
    const bad = specialist({ clarification: null, args: { id: "inventado", name: "X" } });

    const accepted = await ok.specialist.fill({ operation: update, skill: routineEventSkill, request: "r", now: NOW, dayEvents });
    const refused = await bad.specialist.fill({ operation: update, skill: routineEventSkill, request: "r", now: NOW, dayEvents });

    expect(ok.calls[0].user).toContain("Eventos de 2026-09-16");
    expect(ok.calls[0].user).toContain("\"id\":\"e1\"");
    expect(accepted).toMatchObject({ kind: "command", args: { id: "e1" } });
    expect(refused.kind).toBe("clarify");
  });

  it("repassa a pergunta do modelo em vez de gravar", async () => {
    const { specialist: s } = specialist({ clarification: " Qual evento? ", args: { name: "ignorado" } });

    expect(await s.fill({ operation: create, skill: routineEventSkill, request: "r", now: NOW }))
      .toEqual({ kind: "clarify", question: "Qual evento?", modelName: "m" });
  });

  it.each([
    ["sem args nem pergunta", { args: null, clarification: null }],
    ["forma errada", "texto"],
    ["campo que a skill nao conhece", { args: { name: "x", inventado: 1 }, clarification: null }],
    ["tipo errado", { args: { name: 42 }, clarification: null }],
  ])("recusa resposta invalida: %s", async (_name, value) => {
    const { specialist: s } = specialist(value);

    await expect(s.fill({ operation: create, skill: routineEventSkill, request: "r", now: NOW }))
      .rejects.toMatchObject({ name: "FastStageError", stage: "specialist", reason: "invalid" });
  });

  it("alterar tarefa nao exige id do dia", async () => {
    const { specialist: s } = specialist({ clarification: null, args: { id: "t1", status: "done" } });

    const result = await s.fill({ operation: { ...update, skill: "save_task" }, skill: taskSkill, request: "r", now: NOW });

    expect(result).toMatchObject({ kind: "command", args: { id: "t1" } });
  });

  it("propaga a falha da etapa", async () => {
    const gateway: StructuredCompletionGateway = { complete: async () => { throw new FastStageError("specialist", "timeout"); } };

    await expect(new EntitySpecialist(gateway).fill({ operation: create, skill: routineEventSkill, request: "r", now: NOW }))
      .rejects.toBeInstanceOf(FastStageError);
  });
});
