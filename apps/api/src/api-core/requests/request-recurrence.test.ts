import { describe, expect, test } from "vitest";
import { Recurrence } from "../../domain";
import { buildRule, changesNothing, DEFAULT_TIME_OF_DAY, planSeriesEdit, RuleError, seriesInput } from "./request-recurrence";
import { addStep, setupRequest } from "./testing/request-test-kit";

const cadence = {
  interval: null, weekdays: null, monthDay: null, month: null, timeOfDay: null, durationMinutes: null, startsOn: null, endsOn: null,
};
const series = (over: Record<string, unknown> = {}) => ({
  name: "Corrida", kind: "training", status: null, priority: null, description: null, tags: [], frequency: "weekly",
  ...cadence, weekdays: ["mon"], timeOfDay: "07:00", ...over,
});
const noEdit = { id: "", name: null, description: null, priority: null, tags: null, frequency: null, ...cadence };

describe("regra da serie a partir do que o agente escreveu", () => {
  test("padroes do servidor: intervalo 1, dia da semana e do mes de inicio, 09:00", () => {
    // 2026-10-26 e segunda-feira.
    const weekly = buildRule({ frequency: "weekly", timeOfDay: DEFAULT_TIME_OF_DAY }, "2026-10-26", "America/Sao_Paulo");
    expect(weekly).toMatchObject({ interval: 1, byWeekday: 1 << 1, timeOfDay: "09:00", startsOn: "2026-10-26" });
    const monthly = buildRule({ frequency: "monthly", timeOfDay: "09:00" }, "2026-10-26", "America/Sao_Paulo");
    expect(monthly.byMonthDay).toBe(26);
  });

  test("dias uteis viram a mascara de segunda a sexta", () => {
    const rule = buildRule({ frequency: "weekly", weekdays: ["mon", "tue", "wed", "thu", "fri"], timeOfDay: "10:00" }, "2026-10-26", "America/Sao_Paulo");
    expect(rule.byWeekday).toBe(0b011_1110);
  });

  test.each([
    ["dias da semana numa serie mensal", { frequency: "monthly" as const, weekdays: ["mon" as const], timeOfDay: "09:00" }],
    ["dia do mes numa serie diaria", { frequency: "daily" as const, monthDay: 5, timeOfDay: "09:00" }],
    ["termina antes de comecar", { frequency: "daily" as const, startsOn: "2026-11-01", endsOn: "2026-10-01", timeOfDay: "09:00" }],
  ])("recusa %s", (_, args) => {
    expect(() => buildRule(args, "2026-10-26", "America/Sao_Paulo")).toThrow(RuleError);
  });

  test("o template leva o status e a prioridade so quando foram ditos; hora nao dita vira 09:00", () => {
    const input = seriesInput(
      { ...series({ name: "Pagar o aluguel", kind: "routine", status: "todo", priority: "high", frequency: "monthly", weekdays: null, monthDay: 5, timeOfDay: null }) } as never,
      "2026-10-26", "America/Sao_Paulo",
    );
    expect(input).toMatchObject({ timeOfDay: "09:00", byMonthDay: 5, template: { name: "Pagar o aluguel", status: "todo", priority: "high" } });
    expect(seriesInput(series() as never, "2026-10-26", "America/Sao_Paulo").template).toEqual({ kind: "training", name: "Corrida" });
  });
});

describe("passo de editar series", () => {
  async function seedSeries(ctx: ReturnType<typeof setupRequest>) {
    const payload = await addStep(ctx, "seed", "recurring-event-create");
    ctx.gateway.outputs.set("recurring_event_create", { series: [series()] });
    await ctx.worker.run("recurring-event-create", payload);
    const [created] = ctx.batchWriter.commits[0]?.recurrences ?? [];
    return created as Recurrence;
  }

  test("trocar so a hora: a serie e revisada de hoje em diante, o resto da regra fica", async () => {
    const ctx = setupRequest("mude a corrida para as 8h");
    const created = await seedSeries(ctx);
    const payload = await addStep(ctx, "s2", "recurring-event-edit", "one", {
      candidates: [{ kind: "recurrence", id: created.id, name: "Corrida", cadence: "toda segunda às 07:00" }],
    });
    ctx.gateway.outputs.set("recurring_event_edit", { edits: [{ ...noEdit, id: created.id, timeOfDay: "08:00" }], query: null });

    await ctx.editWorker.run("recurring-event-edit", payload);

    expect(ctx.store.stepRecords.find((step) => step.id === "s2")?.status).toBe("done");
    const batch = ctx.batchWriter.commits[1];
    expect(batch?.recurrenceChanges).toMatchObject([{ op: "update", recurrence: { rule: { timeOfDay: "08:00", frequency: "weekly", byWeekday: 1 << 1 } } }]);
    expect(batch?.artifacts).toHaveLength(0);
    // A ocorrencia que a mudanca mostra e nova no banco, mas fruto de uma edicao.
    const shown = (await ctx.store.entities("r1")).filter((entity) => entity.stepId === "s2");
    expect(shown).toMatchObject([{ kind: "event", operation: "update", summary: { series: true } }]);
  });

  const stored = (kind: string, name: string, extra: Record<string, unknown> = {}) => Recurrence.create({
    userId: "user-1", rule: buildRule({ frequency: "weekly", weekdays: ["mon"], timeOfDay: "07:00" }, "2026-10-26", "America/Sao_Paulo"),
    template: { kind, name, description: "", tags: [], priority: "medium", notifyOffsetsMinutes: [], artifactIds: [], parentEventIds: [], ...extra },
  });

  test("trocar a frequencia descarta os dias da semana da anterior", () => {
    const current = stored("training", "Corrida");
    const revision = planSeriesEdit(current, { ...noEdit, id: current.id, frequency: "daily" }, "America/Sao_Paulo");
    expect(revision.rule).toMatchObject({ frequency: "daily", byWeekday: undefined });
    expect(revision.template).toBeUndefined();
  });

  test("renomear a serie troca o template e mantem os artefatos, o status e os eventos maiores dela", () => {
    const current = stored("meal", "Almoço", { status: "todo", artifactIds: ["a1"], parentEventIds: ["e1"] });
    const revision = planSeriesEdit(current, { ...noEdit, id: current.id, name: "Almoço fixo", priority: "high" }, "America/Sao_Paulo");
    expect(revision).toMatchObject({
      keepArtifacts: true, template: { kind: "meal", name: "Almoço fixo", status: "todo", priority: "high", parentEventIds: ["e1"] },
    });
    expect(revision.template).not.toHaveProperty("artifactIds");
  });

  test("edicao sem campo novo e reconhecida", () => {
    expect(changesNothing({ ...noEdit, id: "x" })).toBe(true);
    expect(changesNothing({ ...noEdit, id: "x", interval: 2 })).toBe(false);
  });

  test("serie que nao existe: passo vermelho", async () => {
    const ctx = setupRequest();
    const payload = await addStep(ctx, "s1", "recurring-event-edit", "one", {
      candidates: [{ kind: "recurrence", id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", name: "X" }],
    });
    ctx.gateway.outputs.set("recurring_event_edit", { edits: [{ ...noEdit, id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", timeOfDay: "08:00" }], query: null });
    await ctx.editWorker.run("recurring-event-edit", payload);
    expect(ctx.store.stepRecords[0]).toMatchObject({ status: "failed", errorCode: "rejected" });
  });
});
