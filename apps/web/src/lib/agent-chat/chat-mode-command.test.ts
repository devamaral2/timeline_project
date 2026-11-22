import { expect, test } from "vitest";
import { parseChatCommand } from "./chat-mode-command";

test("/hermes entra no modo Hermes, com ou sem mensagem", () => {
  expect(parseChatCommand("/hermes crie uma nota")).toEqual({ kind: "agent", agent: "hermes", text: "crie uma nota" });
  expect(parseChatCommand("  /HERMES   oi  ")).toEqual({ kind: "agent", agent: "hermes", text: "oi" });
  expect(parseChatCommand("/hermes\nlinha 1\nlinha 2")).toEqual({ kind: "agent", agent: "hermes", text: "linha 1\nlinha 2" });
  expect(parseChatCommand("/hermes")).toEqual({ kind: "agent", agent: "hermes", text: null });
  expect(parseChatCommand("/hermes   ")).toEqual({ kind: "agent", agent: "hermes", text: null });
});

test("/modelo entra no modo modelo sem escolher provedor, com ou sem mensagem", () => {
  expect(parseChatCommand("/modelo o que tenho amanhã?")).toEqual({ kind: "agent", agent: "model", provider: null, text: "o que tenho amanhã?" });
  expect(parseChatCommand(" /MODELO ")).toEqual({ kind: "agent", agent: "model", provider: null, text: null });
});

test("/claude, /openai e /openrouter entram no modo modelo ja com o provedor", () => {
  expect(parseChatCommand("/claude oi")).toEqual({ kind: "agent", agent: "model", provider: "anthropic", text: "oi" });
  expect(parseChatCommand(" /Claude ")).toEqual({ kind: "agent", agent: "model", provider: "anthropic", text: null });
  expect(parseChatCommand("/openai")).toEqual({ kind: "agent", agent: "model", provider: "openai", text: null });
  expect(parseChatCommand("/OpenAI\nlinha 1\nlinha 2")).toEqual({ kind: "agent", agent: "model", provider: "openai", text: "linha 1\nlinha 2" });
  expect(parseChatCommand("/openrouter resuma")).toEqual({ kind: "agent", agent: "model", provider: "openrouter", text: "resuma" });
});

test("/app, /assistente e /sair voltam ao assistente da agenda", () => {
  for (const text of ["/app", "/APP", " /assistente ", "/sair"]) {
    expect(parseChatCommand(text)).toEqual({ kind: "leave" });
  }
});

test("o resto e pedido comum", () => {
  for (const text of ["/hermesx oi", "/claudes oi", "/modelos oi", "/openais oi", "/open", "fale com o /hermes agora", "/app agora", "almocei", "/tarefa comprar pao"]) {
    expect(parseChatCommand(text)).toBeNull();
  }
});
