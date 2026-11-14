import { describe, expect, it } from "vitest";
import {
  addReminder,
  addTag,
  normalizeTag,
  reminderLabel,
  reminderMinutes,
  removeReminder,
  removeTag,
  sameList,
} from "./event-reminders-tags";

describe("reminderMinutes", () => {
  it("minutos entram como estão", () => {
    expect(reminderMinutes(30, "minutes")).toBe(30);
    expect(reminderMinutes(1, "minutes")).toBe(1);
  });

  it("dias viram minutos", () => {
    expect(reminderMinutes(1, "days")).toBe(1440);
    expect(reminderMinutes(30, "days")).toBe(43200);
  });

  it("fora de 1 minuto a 30 dias não é lembrete", () => {
    expect(reminderMinutes(0, "minutes")).toBeNull();
    expect(reminderMinutes(43201, "minutes")).toBeNull();
    expect(reminderMinutes(31, "days")).toBeNull();
    expect(reminderMinutes(1.5, "minutes")).toBeNull();
    expect(reminderMinutes(Number.NaN, "minutes")).toBeNull();
  });
});

describe("reminderLabel", () => {
  it("minutos mostram min e dias exatos mostram dia ou dias", () => {
    expect(reminderLabel(30)).toBe("30 min");
    expect(reminderLabel(90)).toBe("90 min");
    expect(reminderLabel(1440)).toBe("1 dia");
    expect(reminderLabel(2880)).toBe("2 dias");
  });
});

describe("addReminder e removeReminder", () => {
  it("o lembrete entra em ordem crescente e sem repetir", () => {
    expect(addReminder([1440], 30)).toEqual([30, 1440]);
    expect(addReminder([30, 1440], 30)).toEqual([30, 1440]);
  });

  it("remover tira só o lembrete pedido", () => {
    expect(removeReminder([30, 1440], 30)).toEqual([1440]);
  });
});

describe("normalizeTag e addTag", () => {
  it("a tag vai em minúsculas e sem espaços nas pontas", () => {
    expect(normalizeTag("  Foco Diário ")).toBe("foco diário");
  });

  it("um texto vazio ou só de espaços não vira tag", () => {
    expect(addTag(["foco"], "   ")).toEqual(["foco"]);
  });

  it("uma tag repetida não entra de novo, mesmo com outra caixa", () => {
    expect(addTag(["foco"], " FOCO ")).toEqual(["foco"]);
  });

  it("a tag nova vai para o fim da lista", () => {
    expect(addTag(["foco"], "pessoal")).toEqual(["foco", "pessoal"]);
  });

  it("remover tira só a tag pedida", () => {
    expect(removeTag(["foco", "pessoal"], "foco")).toEqual(["pessoal"]);
  });
});

describe("sameList", () => {
  it("compara conteúdo e ordem", () => {
    expect(sameList([30, 1440], [30, 1440])).toBe(true);
    expect(sameList([1440, 30], [30, 1440])).toBe(false);
    expect(sameList([30], [30, 1440])).toBe(false);
  });
});
