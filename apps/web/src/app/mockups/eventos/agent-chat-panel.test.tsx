import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { AgentChatClientOptions, AgentChatEvent } from "@/lib/agent-chat/agent-chat-client";
import type { AgentChatMessageFrame } from "@/lib/api/contracts";
import { AgentChatPanel, useAgendaChat } from "./agent-chat-panel";

const { session, requestAgendaRefresh } = vi.hoisted(() => ({
  session: { user: { userId: "user-1", name: "Ana", email: null } as { userId: string } | null, ready: true },
  requestAgendaRefresh: vi.fn(),
}));
vi.mock("@/lib/session/use-session", () => ({ useSessionState: () => session }));
vi.mock("./agenda-refresh", () => ({ requestAgendaRefresh }));

let sent: Array<Omit<AgentChatMessageFrame, "type">>;
let cancelled: string[];
let emit: (event: AgentChatEvent) => void;
let clientUserId: string | undefined;

const createClient = (options: AgentChatClientOptions) => {
  clientUserId = options.userId;
  emit = (event) => act(() => options.onEvent(event));
  return {
    send: async (message: Omit<AgentChatMessageFrame, "type">) => {
      sent.push(message);
    },
    cancel: (id: string) => cancelled.push(id),
    close: () => {},
  };
};

function Harness({ live = true }: { live?: boolean }) {
  return <AgentChatPanel {...useAgendaChat({ live, createClient })} />;
}

function ask(text: string) {
  fireEvent.change(screen.getByRole("textbox", { name: "Mensagem para a IA" }), { target: { value: text } });
  fireEvent.submit(screen.getByRole("textbox", { name: "Mensagem para a IA" }).closest("form")!);
}

const reply = (
  id: string,
  agentResponse: string,
  entities: Extract<AgentChatEvent, { type: "reply" }>["entities"] = [],
): AgentChatEvent => ({ type: "reply", id, agentResponse, entities, createdEntities: [], updatedEntities: [], deletedEntities: [] });

beforeEach(() => {
  sent = [];
  cancelled = [];
  clientUserId = undefined;
  session.user = { userId: "user-1" };
  session.ready = true;
  requestAgendaRefresh.mockReset();
});

test("sends the message for the session user, from the agenda, and shows the progress", () => {
  render(<Harness />);

  ask("crie a tarefa limpar a casa");

  expect(clientUserId).toBe("user-1");
  expect(sent).toEqual([
    { id: expect.any(String), text: "crie a tarefa limpar a casa", context: { screen: "agenda" }, history: [] },
  ]);
  expect(within(screen.getByRole("log")).getByText("crie a tarefa limpar a casa")).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Pensando…");
  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toHaveValue("");

  emit({ type: "status", id: sent[0].id, label: "Preparando tarefa" });
  expect(screen.getByRole("status")).toHaveTextContent("Preparando tarefa…");
});

test("shows the reply as text with its records and refreshes the agenda", () => {
  render(<Harness />);
  ask("crie a tarefa");

  emit(
    reply(sent[0].id, "Criei a tarefa <b>Limpar</b>.", [
      { kind: "task", id: "01TASK", change: "created", label: "Limpar a casa" },
    ]),
  );

  const log = screen.getByRole("log");
  expect(within(log).getByText("Criei a tarefa <b>Limpar</b>.")).toBeInTheDocument();
  expect(within(log).getByRole("list", { name: "Registros desta resposta" })).toHaveTextContent(
    "Tarefa criada · Limpar a casa",
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(requestAgendaRefresh).toHaveBeenCalledTimes(1);
});

test("a reply that touched nothing does not refresh the agenda", () => {
  render(<Harness />);
  ask("quanto dormi?");

  emit(reply(sent[0].id, "Você dormiu 7 horas."));

  expect(requestAgendaRefresh).not.toHaveBeenCalled();
});

test("the next message carries the conversation, records included", () => {
  render(<Harness />);
  ask("crie a tarefa");
  emit(reply(sent[0].id, "Criei.", [{ kind: "task", id: "01TASK", change: "created", label: "Limpar" }]));

  ask("mude a prioridade dela");

  expect(sent[1].history).toEqual([
    { role: "user", text: "crie a tarefa" },
    { role: "assistant", text: "Criei.", entities: [{ kind: "task", id: "01TASK", change: "created", label: "Limpar" }] },
  ]);
});

test("the stop button cancels the running message", () => {
  render(<Harness />);
  ask("relatório da semana");

  fireEvent.click(screen.getByRole("button", { name: "Parar resposta" }));

  expect(cancelled).toEqual([sent[0].id]);
  expect(screen.getByRole("status")).toHaveTextContent("Cancelando…");
  expect(screen.getByRole("button", { name: "Parar resposta" })).toBeDisabled();
  // A ferramenta em curso ainda reporta progresso ate o servidor confirmar.
  emit({ type: "status", id: sent[0].id, label: "Preparando refeição" });
  expect(screen.getByRole("status")).toHaveTextContent("Cancelando…");

  emit({ type: "error", id: sent[0].id, code: "cancelled" });

  expect(screen.getByText("Cancelado. Nada foi gravado.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Enviar mensagem" })).not.toBeInTheDocument();
});

test("a failed message can be retried, and it stays out of the history", () => {
  render(<Harness />);
  ask("crie a tarefa");
  emit({ type: "error", id: sent[0].id, code: "conflict" });

  expect(screen.getByText(/Os dados mudaram/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({ text: "crie a tarefa", history: [] });
  expect(screen.queryByText(/Os dados mudaram/)).not.toBeInTheDocument();
  expect(within(screen.getByRole("log")).getAllByText("crie a tarefa")).toHaveLength(1);
});

test("a dropped connection warns before resending and refreshes the agenda", () => {
  render(<Harness />);
  ask("crie a tarefa");

  emit({ type: "error", id: sent[0].id, code: "connection_lost" });

  expect(screen.getByText(/confira a agenda antes de reenviar/)).toBeInTheDocument();
  expect(requestAgendaRefresh).toHaveBeenCalledTimes(1);
});

test("without a session the chat asks to sign in and sends nothing", () => {
  session.user = null;
  render(<Harness />);

  expect(screen.getByText("Entre na sua conta para conversar com a IA.")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toBeDisabled();
  expect(clientUserId).toBeUndefined();
});

test("the mockup never connects", () => {
  render(<Harness live={false} />);

  expect(clientUserId).toBeUndefined();
  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toBeDisabled();
});
