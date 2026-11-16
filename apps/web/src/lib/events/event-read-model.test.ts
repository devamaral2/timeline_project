import { describe, expect, test } from "vitest";
import type { TaskArtifactDto } from "@repo/contracts";
import { humanStatusOptions, mealCaloriesKcal, momentLabel, priorityPatch, recurrenceLines, reminderLabel, statusPatch } from "./event-read-model";

const now = new Date("2026-11-14T10:00:00-03:00");

describe("lembretes", () => {
  test("minutos e dias em cartão pequeno", () => {
    expect(reminderLabel(30)).toBe("30 min");
    expect(reminderLabel(90)).toBe("90 min");
    expect(reminderLabel(1440)).toBe("1 dia");
    expect(reminderLabel(2880)).toBe("2 dias");
  });
});

describe("momentos", () => {
  test("hora no fuso da timeline, com o dia da semana", () => {
    expect(momentLabel("2026-11-14T18:30:00-03:00")).toBe("Sáb, 14 nov · 18:30");
  });

  test("meia-noite local é só o dia, sem hora", () => {
    expect(momentLabel("2026-11-20T00:00:00-03:00")).toBe("Sex, 20 nov");
  });
});

describe("troca de status", () => {
  test("concluir envia finishedAt com o instante atual", () => {
    expect(statusPatch({ revision: 3, status: "doing" }, "done", now)).toEqual({
      expectedRevision: 3,
      status: "done",
      finishedAt: "2026-11-14T13:00:00.000Z",
    });
  });

  test("tirar de feito envia finishedAt nulo", () => {
    expect(statusPatch({ revision: 4, status: "done" }, "todo", now)).toEqual({
      expectedRevision: 4,
      status: "todo",
      finishedAt: null,
    });
  });

  test("outra troca não mexe em finishedAt", () => {
    const patch = statusPatch({ revision: 1, status: "todo" }, "inHold", now);
    expect(patch).toEqual({ expectedRevision: 1, status: "inHold" });
    expect(patch).not.toHaveProperty("finishedAt");
  });

  test("o evento longo não oferece não realizado", () => {
    expect(humanStatusOptions({ longRunning: false })).toContain("missed");
    expect(humanStatusOptions({ longRunning: true })).not.toContain("missed");
  });
});

describe("troca de prioridade", () => {
  test("manda a prioridade com a revisão lida", () => {
    expect(priorityPatch({ revision: 2 }, "high")).toEqual({ expectedRevision: 2, priority: "high" });
  });
});

describe("recorrência", () => {
  test("a regra, desde quando vale, sem fim, e se a ocorrência segue a série", () => {
    const lines = recurrenceLines({
      id: "rec-1",
      occurrenceOn: "2026-11-14",
      detached: false,
      rule: {
        frequency: "weekly",
        interval: 1,
        byWeekday: 42,
        timeOfDay: "18:30",
        timeZone: "America/Sao_Paulo",
        startsOn: "2026-11-03",
      },
    });
    expect(lines).toEqual({
      rule: "Seg, qua e sex, 18:30",
      detail: "desde 3 nov · sem fim · esta ocorrência segue a série",
    });
  });

  test("ocorrência destacada e com fim", () => {
    const lines = recurrenceLines({
      id: "rec-1",
      occurrenceOn: "2026-11-14",
      detached: true,
      rule: {
        frequency: "daily",
        interval: 1,
        timeOfDay: "07:00",
        timeZone: "America/Sao_Paulo",
        startsOn: "2026-11-03",
        endsOn: "2026-12-01",
      },
    });
    expect(lines.detail).toBe("desde 3 nov · até 1 dez · esta ocorrência não segue a série");
  });
});

describe("calorias da refeição", () => {
  /** Um vínculo de artefato com o tipo e, se for alimento, o total de calorias. */
  function link(type: string, kcal?: number): TaskArtifactDto {
    const data = kcal === undefined ? {} : { totals: { totalCaloriesKcal: kcal } };
    return { relation: "uses", fromRecurrence: false, artifact: { id: `a-${type}-${kcal}`, type, data } } as unknown as TaskArtifactDto;
  }

  test("é a soma das calorias dos alimentos ligados, cópias incluídas", () => {
    expect(mealCaloriesKcal([link("food", 200), link("food", 350.5)])).toBe(550.5);
  });

  test("artefatos que não são alimento não entram na soma", () => {
    expect(mealCaloriesKcal([link("food", 200), link("text"), link("workout")])).toBe(200);
  });

  test("sem alimento, o total é zero", () => {
    expect(mealCaloriesKcal([])).toBe(0);
    expect(mealCaloriesKcal([link("text")])).toBe(0);
  });
});
