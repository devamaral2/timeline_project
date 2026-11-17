import { expect, test } from "vitest";
import { parseChatCommand } from "./chat-mode-command";

test("/hermes entra no modo Hermes, com ou sem mensagem", () => {
  expect(parseChatCommand("/hermes crie uma nota")).toEqual({ kind: "hermes", text: "crie uma nota" });
  expect(parseChatCommand("  /HERMES   oi  ")).toEqual({ kind: "hermes", text: "oi" });
  expect(parseChatCommand("/hermes\nlinha 1\nlinha 2")).toEqual({ kind: "hermes", text: "linha 1\nlinha 2" });
  expect(parseChatCommand("/hermes")).toEqual({ kind: "hermes", text: null });
  expect(parseChatCommand("/hermes   ")).toEqual({ kind: "hermes", text: null });
});

test("/app, /assistente e /sair voltam ao assistente da agenda", () => {
  for (const text of ["/app", "/APP", " /assistente ", "/sair"]) {
    expect(parseChatCommand(text)).toEqual({ kind: "leave" });
  }
});

test("o resto e pedido comum", () => {
  for (const text of ["/hermesx oi", "fale com o /hermes agora", "/app agora", "almocei", "/tarefa comprar pao"]) {
    expect(parseChatCommand(text)).toBeNull();
  }
});
