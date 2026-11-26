import { expect, test } from "vitest";
import { isDailyReading } from "./daily-reading";

test("reconhece a Leitura diária sem olhar acento, caixa nem espaço sobrando", () => {
  for (const name of ["Leitura diária", "leitura Diaria", "  LEITURA   DIÁRIA "]) {
    expect(isDailyReading({ actor: "human", name }), name).toBe(true);
  }
});

test("outra tarefa, ou uma tarefa de agente com esse nome, não é a Leitura diária", () => {
  expect(isDailyReading({ actor: "human", name: "Leitura" })).toBe(false);
  expect(isDailyReading({ actor: "agent", name: "Leitura diária" })).toBe(false);
});
