import { expect, test } from "vitest";
import type { AgentConversationDto } from "@/lib/api/contracts";
import { conversationTime, groupConversations, parseCommand } from "./hub-commands";

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

const conversation = (id: string, lastMessageAt: string): AgentConversationDto => ({
  id,
  preview: id,
  lastMessageAt,
  revision: 1,
  createdAt: lastMessageAt,
  updatedAt: lastMessageAt,
});

test("conversations are grouped by today, the last seven days and the rest, newest first", () => {
  const now = new Date(2026, 9, 18, 15, 0);
  const groups = groupConversations(
    [
      conversation("old", new Date(2026, 8, 28, 9, 0).toISOString()),
      conversation("morning", new Date(2026, 9, 18, 9, 10).toISOString()),
      conversation("tuesday", new Date(2026, 9, 13, 20, 0).toISOString()),
      conversation("afternoon", new Date(2026, 9, 18, 14, 32).toISOString()),
    ],
    now,
  );

  expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
    ["Hoje", ["afternoon", "morning"]],
    ["Esta semana", ["tuesday"]],
    ["Antes", ["old"]],
  ]);
});

test("the time reads as the hour today, the weekday this week and the date before", () => {
  const now = new Date(2026, 9, 18, 15, 0);

  expect(conversationTime(new Date(2026, 9, 18, 14, 32).toISOString(), now)).toBe("14:32");
  expect(conversationTime(new Date(2026, 9, 13, 20, 0).toISOString(), now)).toBe("ter.");
  expect(conversationTime(new Date(2026, 8, 28, 9, 0).toISOString(), now)).toBe("28 set.");
});
