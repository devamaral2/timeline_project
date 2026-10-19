import { describe, expect, it } from "vitest";
import type { StructuredCompletionGateway, StructuredCompletionInput } from "../gateways/structured-completion.gateway";
import { normalizePlan, TurnPlanner } from "./turn-planner";

const NOW = new Date("2026-09-16T15:00:00Z");
const operation = (over: Record<string, unknown> = {}) => ({
  ref: "a", skill: "save_meal_event", mode: "create", span: "comi arroz", date: "2026-09-16", linkTo: null, ...over,
});
const plan = (operations: unknown[], intent = "write", clarification: string | null = null) =>
  ({ intent, clarification, operations });

describe("normalizePlan", () => {
  it("mantem as operacoes de escrita, na ordem do pedido", () => {
    const result = normalizePlan(plan([operation(), operation({ ref: "b", skill: "save_training_event", date: "2026-09-15" })]), NOW);

    expect(result).toEqual({ kind: "write", operations: [
      { ref: "a", skill: "save_meal_event", mode: "create", span: "comi arroz", date: "2026-09-16" },
      { ref: "b", skill: "save_training_event", mode: "create", span: "comi arroz", date: "2026-09-15" },
    ] });
  });

  it("usa o dia de hoje no fuso do usuario quando o evento vem sem data valida", () => {
    const late = new Date("2026-09-17T01:30:00Z");

    expect(normalizePlan(plan([operation({ date: null })]), late)).toMatchObject({ operations: [{ date: "2026-09-16" }] });
    expect(normalizePlan(plan([operation({ date: "ontem" })]), late)).toMatchObject({ operations: [{ date: "2026-09-16" }] });
  });

  it("nao da data a tarefa nem a nota", () => {
    const result = normalizePlan(plan([operation({ skill: "save_task", date: "2026-09-16" })]), NOW);

    expect(result).toEqual({ kind: "write", operations: [{ ref: "a", skill: "save_task", mode: "create", span: "comi arroz" }] });
  });

  it("finish_event e sempre uma alteracao", () => {
    expect(normalizePlan(plan([operation({ skill: "finish_event" })]), NOW)).toMatchObject({
      operations: [{ skill: "finish_event", mode: "update" }],
    });
  });

  it("so liga nota a uma operacao anterior", () => {
    const ok = normalizePlan(plan([operation(), operation({ ref: "b", skill: "save_note", linkTo: "a" })]), NOW);
    const ahead = normalizePlan(plan([operation({ skill: "save_note", linkTo: "b" }), operation({ ref: "b" })]), NOW);
    const notNote = normalizePlan(plan([operation(), operation({ ref: "b", skill: "save_routine_event", linkTo: "a" })]), NOW);

    expect(ok).toMatchObject({ operations: [{}, { linkTo: "a" }] });
    expect(ahead).toMatchObject({ operations: [{ ref: "a" }, { ref: "b" }] });
    expect((ahead as { operations: Array<{ linkTo?: string }> }).operations[0].linkTo).toBeUndefined();
    expect((notNote as { operations: Array<{ linkTo?: string }> }).operations[1].linkTo).toBeUndefined();
  });

  it.each([
    ["consulta", plan([], "read"), "read"],
    ["apagar ou recorrencia", plan([], "other"), "other"],
    ["escrita sem operacoes", plan([]), "other"],
    ["alterar tarefa", plan([operation({ skill: "save_task", mode: "update" })]), "other"],
    ["alterar nota", plan([operation({ skill: "save_note", mode: "update" })]), "other"],
    ["ref repetido", plan([operation(), operation()]), "invalid"],
    ["skill desconhecida", plan([operation({ skill: "delete_entity" })]), "invalid"],
    ["pergunta sem texto", plan([], "clarify", "  "), "invalid"],
    ["forma errada", { oops: true }, "invalid"],
    ["nao e objeto", "texto", "invalid"],
  ])("manda para o caminho de sempre: %s", (_name, value, reason) => {
    expect(normalizePlan(value, NOW)).toEqual({ kind: "legacy", reason });
  });

  it("devolve a pergunta do planejador", () => {
    expect(normalizePlan(plan([], "clarify", " Qual refeição? "), NOW)).toEqual({ kind: "clarify", question: "Qual refeição?" });
  });
});

describe("TurnPlanner", () => {
  it("faz uma chamada estruturada com o orcamento do planejador e sem expor o pedido no prompt de sistema", async () => {
    const calls: StructuredCompletionInput[] = [];
    const gateway: StructuredCompletionGateway = {
      complete: async (input) => { calls.push(input); return { value: plan([operation()]), modelName: "m" }; },
    };

    const result = await new TurnPlanner(gateway).plan({ text: "Comi arroz às 12", now: NOW });

    expect(result.kind).toBe("write");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ stage: "planner", timeoutMs: 5000, schemaName: "turn_plan" });
    expect(calls[0].user).toContain("Comi arroz às 12");
    expect(calls[0].system).not.toContain("Comi arroz");
    expect(calls[0].system).toContain("quarta-feira, 16 de setembro de 2026");
    expect(calls[0].schema).not.toHaveProperty("$schema");
  });
});
