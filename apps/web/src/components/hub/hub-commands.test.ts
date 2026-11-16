import { expect, test } from "vitest";
import { isStopSpeech, parseCommand } from "./hub-commands";

test("a slash alone offers every command; the typed prefix narrows them", () => {
  expect(parseCommand("/")?.matches.map((command) => command.slug)).toEqual(["evento", "nota", "buscar", "notificacoes", "configuracoes"]);
  expect(parseCommand("/ev")?.matches.map((command) => command.slug)).toEqual(["evento"]);
  expect(parseCommand("/pesq")?.matches.map((command) => command.slug)).toEqual(["buscar"]);
});

test("there is no task shortcut: an task with a status is the task", () => {
  expect(parseCommand("/tarefa")).toBeNull();
  expect(parseCommand("/tarefa comprar pão")).toBeNull();
});

test("the text after a known command is its argument", () => {
  expect(parseCommand("/nota  ideias para a proposta ")).toEqual({
    matches: [expect.objectContaining({ id: "note" })],
    argument: "ideias para a proposta",
  });
});

test("text without a slash, or an unknown command, is not a command", () => {
  expect(parseCommand("crie uma tarefa")).toBeNull();
  expect(parseCommand("/ev amanhã")).toBeNull();
  expect(parseCommand("/xyz")).toBeNull();
});

test("recognizes the spoken request to stop listening", () => {
  for (const phrase of ["para", "Para.", "pode parar", "parar de ouvir", "Chega!", "stop"]) expect(isStopSpeech(phrase)).toBe(true);
  for (const phrase of ["para amanhã", "o que tenho para hoje", "parar o treino de quinta"]) expect(isStopSpeech(phrase)).toBe(false);
});
