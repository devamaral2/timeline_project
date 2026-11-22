import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { useAgentChat } from "@/lib/agent-chat/use-agent-chat";
import { AgentChatPanel } from "./agent-chat-panel";

const { start, stop, cancel, speech } = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
  speech: { listening: false, heard: "" },
}));

vi.mock("@/lib/speech/use-speech-recognition", () => ({
  useSpeechRecognition: () => ({ supported: true, listening: speech.listening, interim: "", heard: speech.heard, error: null, start, stop, cancel }),
}));

type Chat = ReturnType<typeof useAgentChat>;

function chat(overrides: Partial<Chat> = {}): Chat {
  return {
    messages: [],
    pending: null,
    traces: [],
    ready: true,
    recover: async () => {},
    agentMode: null,
    model: { options: null, selection: null, chooseProvider: () => {}, chooseModel: () => {}, chooseEffort: () => {} },
    send: () => false,
    retry: () => {},
    cancel: () => {},
    startNewConversation: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  start.mockReset();
  cancel.mockReset();
  speech.listening = false;
  speech.heard = "";
});

test("the chat opens listening once the session is ready, even if it arrives after the panel", () => {
  const { rerender } = render(<AgentChatPanel chat={chat({ ready: false })} signedOut={false} listenOnOpen />);
  expect(start).not.toHaveBeenCalled();

  rerender(<AgentChatPanel chat={chat({ ready: true })} signedOut={false} listenOnOpen />);
  expect(start).toHaveBeenCalledTimes(1);
});

test("stopping the microphone or waiting for an answer does not start it again", () => {
  const { rerender } = render(<AgentChatPanel chat={chat()} signedOut={false} listenOnOpen />);
  expect(start).toHaveBeenCalledTimes(1);

  rerender(<AgentChatPanel chat={chat({ pending: { id: "pedido-1" } })} signedOut={false} listenOnOpen />);
  rerender(<AgentChatPanel chat={chat()} signedOut={false} listenOnOpen />);
  expect(start).toHaveBeenCalledTimes(1);
});

test("the first key stops listening and keeps what was already heard in the field", () => {
  const { rerender } = render(<AgentChatPanel chat={chat()} signedOut={false} listenOnOpen />);
  speech.listening = true;
  speech.heard = "almoço às sete";
  cancel.mockImplementation(() => {
    speech.listening = false;
  });
  rerender(<AgentChatPanel chat={chat()} signedOut={false} listenOnOpen />);

  const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });
  expect(textbox).toHaveValue("almoço às sete");

  fireEvent.keyDown(textbox, { key: "a" });
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(textbox).toHaveValue("almoço às sete");
  expect(start).toHaveBeenCalledTimes(1);
});
