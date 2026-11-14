import type { EventDto } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { eventFixture } from "@/test/fake-api/events";
import { buildCreateEventInput, buildEventPatch, draftFromEvent, emptyEventDraft, instantFromDraft, rebaseDraft, validateEventDraft } from "./event-draft";

describe("emptyEventDraft e buildCreateEventInput", () => {
  it("o rascunho vazio é uma rotina sem status, com o nome do comando", () => {
    expect(emptyEventDraft("comprar pão")).toEqual({
      kind: "routine", name: "comprar pão", status: null, priority: "medium",
      startDate: "", startTime: "", endDate: "", endTime: "", description: "",
    });
  });

  it("sem status e sem data, o corpo é só o que foi preenchido: a API põe agora e estima o fim", () => {
    expect(buildCreateEventInput({ ...emptyEventDraft(), name: "  Dentista  " }, NOW)).toEqual({
      kind: "routine", name: "Dentista", description: "", priority: "medium",
    });
  });

  it("com status, data e hora, manda o status e os instantes no fuso da timeline", () => {
    const body = buildCreateEventInput({
      ...emptyEventDraft("Treino"), kind: "training", status: "todo", startDate: "2026-11-14", startTime: "18:30", endDate: "2026-11-14", endTime: "19:20",
    }, NOW);

    expect(body).toEqual({
      kind: "training", name: "Treino", description: "", priority: "medium", status: "todo",
      startedAt: "2026-11-14T21:30:00.000Z", estimatedFinishAt: "2026-11-14T22:20:00.000Z",
    });
  });

  it("criar já concluído manda finishedAt com o instante atual, como a troca de status", () => {
    const body = buildCreateEventInput({ ...emptyEventDraft("Pagar luz"), status: "done" }, NOW);

    expect(body).toMatchObject({ status: "done", finishedAt: "2026-11-14T13:00:00.000Z" });
  });
});

/** 10:00 em São Paulo: o relógio da edição não entra no corpo, só o instante de conclusão. */
const NOW = new Date("2026-11-14T13:00:00.000Z");

function training(overrides: Partial<EventDto> = {}): EventDto {
  return eventFixture({
    id: "ev-1",
    name: "Treino de força",
    kind: "training",
    status: "doing",
    priority: "medium",
    startedAt: "2026-11-14T18:30:00-03:00",
    estimatedFinishAt: "2026-11-14T19:20:00-03:00",
    revision: 3,
    ...overrides,
  });
}

describe("draftFromEvent", () => {
  it("separa data e hora no fuso da timeline", () => {
    const draft = draftFromEvent(training());

    expect(draft).toMatchObject({
      kind: "training",
      name: "Treino de força",
      status: "doing",
      priority: "medium",
      startDate: "2026-11-14",
      startTime: "18:30",
      endDate: "2026-11-14",
      endTime: "19:20",
    });
  });

  it("um início à meia-noite local é um dia sem hora", () => {
    const draft = draftFromEvent(training({ startedAt: "2026-11-15T00:00:00-03:00" }));

    expect(draft).toMatchObject({ startDate: "2026-11-15", startTime: "" });
  });

  it("um evento de referência sem data e sem status tem os campos vazios e o status nulo", () => {
    const draft = draftFromEvent(training({ status: undefined, startedAt: undefined, estimatedFinishAt: undefined }));

    expect(draft).toMatchObject({ status: null, startDate: "", startTime: "", endDate: "", endTime: "" });
  });
});

describe("instantFromDraft", () => {
  it("um dia sem hora é a meia-noite local", () => {
    expect(instantFromDraft("2026-11-15", "")).toBe("2026-11-15T03:00:00.000Z");
  });

  it("dia e hora são o instante no fuso da timeline", () => {
    expect(instantFromDraft("2026-11-14", "19:00")).toBe("2026-11-14T22:00:00.000Z");
  });

  it("sem data não há instante", () => {
    expect(instantFromDraft("", "")).toBeNull();
  });
});

describe("buildEventPatch", () => {
  it("sem nenhuma mudança não há o que enviar", () => {
    const event = training();

    expect(buildEventPatch(event, draftFromEvent(event), NOW)).toBeNull();
  });

  it("manda só os campos que mudaram, com a revisão lida", () => {
    const event = training();

    expect(buildEventPatch(event, { ...draftFromEvent(event), name: "Treino de peito", priority: "urgent" }, NOW)).toEqual({
      expectedRevision: 3,
      name: "Treino de peito",
      priority: "urgent",
    });
  });

  it("troca o tipo e a descrição", () => {
    const event = training({ description: "" });

    expect(buildEventPatch(event, { ...draftFromEvent(event), kind: "meal", description: "Frango e arroz" }, NOW)).toEqual({
      expectedRevision: 3,
      kind: "meal",
      description: "Frango e arroz",
    });
  });

  it("espaços nas pontas do título não contam como mudança", () => {
    const event = training();

    expect(buildEventPatch(event, { ...draftFromEvent(event), name: "  Treino de força " }, NOW)).toBeNull();
  });

  it("concluir envia finishedAt com o instante atual", () => {
    const event = training();

    expect(buildEventPatch(event, { ...draftFromEvent(event), status: "done" }, NOW)).toEqual({
      expectedRevision: 3,
      status: "done",
      finishedAt: "2026-11-14T13:00:00.000Z",
    });
  });

  it("tirar de feito envia finishedAt nulo", () => {
    const event = training({ status: "done", finishedAt: "2026-11-14T12:00:00.000Z" });

    expect(buildEventPatch(event, { ...draftFromEvent(event), status: "inHold" }, NOW)).toEqual({
      expectedRevision: 3,
      status: "inHold",
      finishedAt: null,
    });
  });

  it("sem status manda status nulo", () => {
    const event = training();

    expect(buildEventPatch(event, { ...draftFromEvent(event), status: null }, NOW)).toEqual({ expectedRevision: 3, status: null });
  });

  it("apagar a data remove o início", () => {
    const event = training();

    expect(buildEventPatch(event, { ...draftFromEvent(event), startDate: "", startTime: "" }, NOW)).toEqual({
      expectedRevision: 3,
      startedAt: null,
    });
  });

  it("uma data sem hora grava o início à meia-noite local", () => {
    const event = training();

    expect(buildEventPatch(event, { ...draftFromEvent(event), startDate: "2026-11-15", startTime: "" }, NOW)).toEqual({
      expectedRevision: 3,
      startedAt: "2026-11-15T03:00:00.000Z",
    });
  });

  it("não reenvia um horário que já está gravado, mesmo com segundos", () => {
    const event = training({ startedAt: "2026-11-14T18:30:15-03:00" });

    expect(buildEventPatch(event, draftFromEvent(event), NOW)).toBeNull();
  });
});

describe("validateEventDraft", () => {
  it("o título não pode ficar vazio", () => {
    const event = training();

    expect(validateEventDraft({ ...draftFromEvent(event), name: "   " })).toEqual({ name: "Dê um título ao evento." });
  });

  it("uma hora sem data é recusada no campo da hora", () => {
    const event = training();

    expect(validateEventDraft({ ...draftFromEvent(event), startDate: "", startTime: "18:30" })).toMatchObject({
      startTime: "Informe a data para marcar a hora.",
    });
  });

  it("o término não pode ser antes do início", () => {
    const event = training();

    expect(validateEventDraft({ ...draftFromEvent(event), endTime: "18:00" })).toEqual({
      endDate: "O término não pode ser antes do início.",
    });
  });

  it("uma entrada válida não tem erro", () => {
    const event = training();

    expect(validateEventDraft(draftFromEvent(event))).toEqual({});
  });
});

describe("lembretes e tags", () => {
  it("o rascunho lê os lembretes em ordem crescente e as tags como estão", () => {
    const draft = draftFromEvent(training({ notifyOffsetsMinutes: [1440, 30], tags: ["saúde", "pessoal"] }));

    expect(draft).toMatchObject({ reminders: [30, 1440], tags: ["saúde", "pessoal"] });
  });

  it("lembretes e tags trocados entram no corpo, com o conjunto inteiro", () => {
    const event = training({ notifyOffsetsMinutes: [30], tags: ["saúde"] });
    const draft = { ...draftFromEvent(event), reminders: [30, 1440], tags: ["saúde", "foco"] };

    expect(buildEventPatch(event, draft, NOW)).toEqual({
      expectedRevision: 3,
      notifyOffsetsMinutes: [30, 1440],
      tags: ["saúde", "foco"],
    });
  });

  it("uma lista com os mesmos valores, mesmo vinda de outra leitura, não é mudança", () => {
    const event = training({ notifyOffsetsMinutes: [1440, 30], tags: ["foco"] });

    expect(buildEventPatch(event, draftFromEvent(event), NOW)).toBeNull();
  });

  it("uma tag removida manda a lista sem ela, e a lista vazia vai como vazia", () => {
    const event = training({ tags: ["foco"], notifyOffsetsMinutes: [30] });

    expect(buildEventPatch(event, { ...draftFromEvent(event), tags: [], reminders: [] }, NOW)).toEqual({
      expectedRevision: 3,
      notifyOffsetsMinutes: [],
      tags: [],
    });
  });

  it("a lista que a pessoa não mexeu acompanha a versão nova na releitura", () => {
    const before = training({ tags: ["foco"], notifyOffsetsMinutes: [30] });
    const after = training({ revision: 4, tags: ["foco", "pessoal"], notifyOffsetsMinutes: [30, 1440] });
    const typed = { ...draftFromEvent(before), name: "Meu título" };

    expect(rebaseDraft(typed, before, after)).toMatchObject({
      name: "Meu título",
      tags: ["foco", "pessoal"],
      reminders: [30, 1440],
    });
  });

  it("a lista que a pessoa mexeu fica como ela deixou", () => {
    const before = training({ tags: ["foco"] });
    const after = training({ revision: 4, tags: ["pessoal"] });
    const typed = { ...draftFromEvent(before), tags: ["foco", "casa"] };

    expect(rebaseDraft(typed, before, after)).toMatchObject({ tags: ["foco", "casa"] });
  });
});

describe("rebaseDraft", () => {
  it("o campo que a pessoa não mexeu acompanha a versão nova, e o que ela digitou fica", () => {
    const before = training();
    const after = training({ revision: 4, priority: "high", name: "Outro nome" });
    const typed = { ...draftFromEvent(before), name: "Meu título" };

    expect(rebaseDraft(typed, before, after)).toMatchObject({ name: "Meu título", priority: "high" });
  });
});
