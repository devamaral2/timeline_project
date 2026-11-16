import type { TaskCardDto } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  cardDurationLabel,
  cardIsOverdue,
  cardWhenLabel,
  recurrenceRuleLabel,
} from "./card-text";

// Relogio e fuso fixos: a timeline formata no America/Sao_Paulo (-03:00).
const NOW = new Date("2026-11-14T10:00:00-03:00");

function card(overrides: Partial<TaskCardDto> = {}): TaskCardDto {
  return {
    id: "ev-1",
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    name: "Revisar proposta",
    description: "",
    location: "",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    previousTaskIds: [],
    revision: 1,
    ...overrides,
  };
}

describe("cardWhenLabel", () => {
  it("mostra o dia e a hora de um a fazer com hora, sem o antigo status agendado", () => {
    const label = cardWhenLabel(card({ startedAt: "2026-11-14T09:00:00-03:00" }), NOW);
    expect(label).toBe("Hoje, 09:00");
    expect(label).not.toMatch(/agendad/i);
  });

  it("mostra so o dia quando o inicio e a meia-noite local", () => {
    expect(cardWhenLabel(card({ startedAt: "2026-11-14T00:00:00-03:00" }), NOW)).toBe("Hoje");
  });

  it("diz 'Era ontem' para um a fazer cujo dia passou, e ele conta como atrasado", () => {
    const yesterday = card({ startedAt: "2026-11-13T09:00:00-03:00" });
    expect(cardWhenLabel(yesterday, NOW)).toBe("Era ontem");
    expect(cardIsOverdue(yesterday, NOW)).toBe(true);
  });

  it("diz a data para um a fazer vencido ha mais de um dia", () => {
    const older = card({ startedAt: "2026-11-11T00:00:00-03:00" });
    expect(cardWhenLabel(older, NOW)).toBe("Era 11 nov");
    expect(cardIsOverdue(older, NOW)).toBe(true);
  });

  it("um a fazer de hoje nao esta atrasado", () => {
    expect(cardIsOverdue(card({ startedAt: "2026-11-14T09:00:00-03:00" }), NOW)).toBe(false);
  });

  it("mostra o prazo do evento longo, sem data de inicio", () => {
    const longEvent = card({ longRunning: true, estimatedFinishAt: "2026-11-30T00:00:00-03:00" });
    expect(cardWhenLabel(longEvent, NOW)).toBe("Prazo 30 nov");
    expect(cardIsOverdue(longEvent, NOW)).toBe(false);
  });

  it("evento longo com o prazo vencido continua mostrando o prazo e conta como atrasado", () => {
    const late = card({ longRunning: true, estimatedFinishAt: "2026-11-13T00:00:00-03:00" });
    expect(cardWhenLabel(late, NOW)).toBe("Prazo 13 nov");
    expect(cardIsOverdue(late, NOW)).toBe(true);
  });

  it("evento longo concluido com prazo passado nao esta atrasado", () => {
    const done = card({
      status: "done",
      longRunning: true,
      estimatedFinishAt: "2026-11-01T00:00:00-03:00",
    });
    expect(cardIsOverdue(done, NOW)).toBe(false);
  });

  it("evento sem data mostra 'Sem data'", () => {
    expect(cardWhenLabel(card({ status: "toDefine" }), NOW)).toBe("Sem data");
  });

  it("ocorrencia de serie mostra a regra no lugar do horario quando a lista pede", () => {
    const occurrence = card({
      actor: "agent",
      kind: "cron",
      status: "queued",
      startedAt: "2026-11-14T18:00:00-03:00",
      recurrence: {
        id: "rec-1",
        occurrenceOn: "2026-11-14",
        detached: false,
        rule: {
          frequency: "daily",
          interval: 1,
          timeOfDay: "18:00",
          timeZone: "America/Sao_Paulo",
          startsOn: "2026-11-01",
        },
      },
    });
    expect(cardWhenLabel(occurrence, NOW, { ruleInPlaceOfTime: true })).toBe("Todo dia, 18:00");
  });

  it("ocorrencia desligada da serie nao mostra a regra", () => {
    const detached = card({
      startedAt: "2026-11-14T19:00:00-03:00",
      recurrence: {
        id: "rec-1",
        occurrenceOn: "2026-11-14",
        detached: true,
        rule: {
          frequency: "daily",
          interval: 1,
          timeOfDay: "18:00",
          timeZone: "America/Sao_Paulo",
          startsOn: "2026-11-01",
        },
      },
    });
    expect(cardWhenLabel(detached, NOW, { ruleInPlaceOfTime: true })).toBe("Hoje, 19:00");
  });

  it("serie semanal lista os dias do bitmask", () => {
    const weekly = card({
      startedAt: "2026-11-16T18:30:00-03:00",
      recurrence: {
        id: "rec-2",
        occurrenceOn: "2026-11-16",
        detached: false,
        rule: {
          frequency: "weekly",
          interval: 1,
          // segunda (bit 1), quarta (bit 3) e sexta (bit 5)
          byWeekday: 2 + 8 + 32,
          timeOfDay: "18:30",
          timeZone: "America/Sao_Paulo",
          startsOn: "2026-11-02",
        },
      },
    });
    expect(cardWhenLabel(weekly, NOW, { ruleInPlaceOfTime: true })).toBe("Seg, qua e sex, 18:30");
  });

  it("evento de agente em execucao mostra o tempo decorrido desde o inicio", () => {
    const running = card({ actor: "agent", kind: "request", status: "running", startedAt: "2026-11-14T09:48:00-03:00" });
    expect(cardWhenLabel(running, NOW)).toBe("há 12 min");
  });

  it("evento de agente na fila mostra 'na fila' com o tempo decorrido", () => {
    const queued = card({ actor: "agent", kind: "review_request", status: "queued", startedAt: "2026-11-14T09:57:00-03:00" });
    expect(cardWhenLabel(queued, NOW)).toBe("na fila · há 3 min");
  });

  it("evento de agente aguardando mostra 'aguarda sua resposta'", () => {
    const waiting = card({ actor: "agent", kind: "build_request", status: "waiting", startedAt: "2026-11-14T09:12:00-03:00" });
    expect(cardWhenLabel(waiting, NOW)).toBe("aguarda sua resposta");
  });
});

describe("cardDurationLabel", () => {
  it("e o fim planejado menos o inicio, em horas e minutos", () => {
    expect(
      cardDurationLabel(card({ startedAt: "2026-11-14T09:00:00-03:00", estimatedFinishAt: "2026-11-14T10:30:00-03:00" })),
    ).toBe("1h30");
  });

  it("abaixo de uma hora mostra so minutos, e em hora cheia mostra so horas", () => {
    expect(
      cardDurationLabel(card({ startedAt: "2026-11-14T09:00:00-03:00", estimatedFinishAt: "2026-11-14T09:50:00-03:00" })),
    ).toBe("50 min");
    expect(
      cardDurationLabel(card({ startedAt: "2026-11-14T09:00:00-03:00", estimatedFinishAt: "2026-11-14T11:00:00-03:00" })),
    ).toBe("2h");
  });

  it("sem os dois instantes nao ha duracao", () => {
    expect(cardDurationLabel(card({ startedAt: "2026-11-14T09:00:00-03:00" }))).toBeNull();
    expect(cardDurationLabel(card({ estimatedFinishAt: "2026-11-14T10:00:00-03:00" }))).toBeNull();
  });

  it("dia sem hora e evento longo nao tem duracao", () => {
    expect(
      cardDurationLabel(card({ startedAt: "2026-11-14T00:00:00-03:00", estimatedFinishAt: "2026-11-14T10:00:00-03:00" })),
    ).toBeNull();
    expect(
      cardDurationLabel(card({ longRunning: true, startedAt: "2026-11-14T09:00:00-03:00", estimatedFinishAt: "2026-11-30T00:00:00-03:00" })),
    ).toBeNull();
  });
});

describe("recurrenceRuleLabel", () => {
  it("descreve a frequencia diaria com o horario", () => {
    expect(
      recurrenceRuleLabel({ frequency: "daily", interval: 1, timeOfDay: "18:00", timeZone: "America/Sao_Paulo", startsOn: "2026-11-01" }),
    ).toBe("Todo dia, 18:00");
  });
});
