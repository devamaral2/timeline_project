import { expect, test } from "vitest";
import { parseCommand } from "./hub-commands";

test("a slash alone offers every command; the typed prefix narrows them", () => {
  expect(parseCommand("/")?.matches.map((command) => command.slug)).toEqual(["tarefa", "evento", "nota", "buscar"]);
  expect(parseCommand("/ev")?.matches.map((command) => command.slug)).toEqual(["evento"]);
  expect(parseCommand("/pesq")?.matches.map((command) => command.slug)).toEqual(["buscar"]);
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
