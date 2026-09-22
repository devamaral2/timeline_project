import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { AgentChatClientOptions, AgentChatEvent } from "@/lib/agent-chat/agent-chat-client";
import type {
  AgentChatMessagePageDto,
  AgentChatMessageFrame,
  AgentConversationPageDto,
} from "@/lib/api/contracts";
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
/** A lista e a thread que o "servidor" devolve; os testes trocam quando importa. */
let conversationPage: AgentConversationPageDto;
let messagePage: AgentChatMessagePageDto;
let removed: string[];

const loadConversations = async () => conversationPage;
const loadMessages = async () => messagePage;
const removeConversation = async (id: string) => void removed.push(id);

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
  return (
    <AgentChatPanel
      {...useAgendaChat({ live, createClient, loadConversations, loadMessages, removeConversation })}
    />
  );
}

function ask(text: string) {
  const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });
  const form = textbox.closest("form");
  if (!form) throw new Error("O campo de mensagem precisa estar dentro de um formulário.");
  fireEvent.change(textbox, { target: { value: text } });
  fireEvent.submit(form);
}

const CONVERSATION_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

/** `seq` cresce de dois em dois: cada turno grava o pedido e a resposta. */
let nextSeq = 2;

const reply = (
  id: string,
  agentResponse: string,
  entities: Extract<AgentChatEvent, { type: "reply" }>["entities"] = [],
  overrides: Partial<Extract<AgentChatEvent, { type: "reply" }>> = {},
): AgentChatEvent => ({
  type: "reply",
  id,
  conversationId: CONVERSATION_ID,
  assistantSeq: nextSeq,
  agentResponse,
  entities,
  createdEntities: [],
  updatedEntities: [],
  deletedEntities: [],
  ...overrides,
});

beforeEach(() => {
  sent = [];
  cancelled = [];
  removed = [];
  nextSeq = 2;
  conversationPage = { items: [] };
  messagePage = { items: [] };
  clientUserId = undefined;
  session.user = { userId: "user-1" };
  session.ready = true;
  requestAgendaRefresh.mockReset();
});

test("sends the message for the session user, from the agenda, and shows the progress", () => {
  render(<Harness />);

  ask("crie a tarefa limpar a casa");

  expect(clientUserId).toBe("user-1");
  // Conversa nova: o frame vai sem id, e o servidor devolve o dele no `reply`.
  expect(sent).toEqual([
    { id: expect.any(String), text: "crie a tarefa limpar a casa", context: { screen: "agenda" } },
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

test("the next message carries the conversation the server opened, not the history", () => {
  render(<Harness />);
  ask("crie a tarefa");
  emit(reply(sent[0].id, "Criei.", [{ kind: "task", id: "01TASK", change: "created", label: "Limpar" }]));

  ask("mude a prioridade dela");

  // O histórico ficou no servidor: o cliente só diz em qual conversa está.
  expect(sent[1]).toMatchObject({ text: "mude a prioridade dela", conversationId: CONVERSATION_ID });
  expect(sent[1]).not.toHaveProperty("history");
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

test("a failed message can be retried, and the failed turn left no conversation behind", () => {
  render(<Harness />);
  ask("crie a tarefa");
  emit({ type: "error", id: sent[0].id, code: "conflict" });

  expect(screen.getByText(/Os dados mudaram/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

  expect(sent).toHaveLength(2);
  // O primeiro turno falhou, então nada foi gravado — nem a conversa. O reenvio
  // recomeça do zero, sem id, em vez de apontar para uma conversa inexistente.
  expect(sent[1]).toMatchObject({ text: "crie a tarefa" });
  expect(sent[1]).not.toHaveProperty("conversationId");
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

const conversation = (id: string, preview: string): AgentConversationPageDto["items"][number] => ({
  id,
  preview,
  lastMessageAt: "2026-09-17T12:00:00.000Z",
  revision: 1,
  createdAt: "2026-09-17T11:00:00.000Z",
  updatedAt: "2026-09-17T12:00:00.000Z",
});

const OTHER_CONVERSATION = "01ARZ3NDEKTSV4RRFFQ69G5FB0";

test("opening a conversation from the list loads it from the server", async () => {
  conversationPage = { items: [conversation(OTHER_CONVERSATION, "quanto dormi ontem?")] };
  messagePage = {
    items: [
      { id: "s2", seq: 2, role: "assistant", content: "Sete horas.", entities: [], createdAt: "2026-09-17T12:00:00.000Z" },
      { id: "s1", seq: 1, role: "user", content: "quanto dormi ontem?", entities: [], createdAt: "2026-09-17T11:59:00.000Z" },
    ],
  };
  render(<Harness />);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Suas conversas" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "quanto dormi ontem?" }));
  });

  const log = screen.getByRole("log");
  // Da mais velha para a mais nova, como a conversa aconteceu.
  expect(within(log).getAllByText(/quanto dormi ontem\?|Sete horas\./).map((node) => node.textContent)).toEqual([
    "quanto dormi ontem?",
    "Sete horas.",
  ]);

  ask("e anteontem?");
  expect(sent[0]).toMatchObject({ text: "e anteontem?", conversationId: OTHER_CONVERSATION });
});

test("starting a new conversation drops the id the server had given", () => {
  render(<Harness />);
  ask("crie a tarefa");
  emit(reply(sent[0].id, "Criei."));

  fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));

  expect(screen.queryByRole("log")).not.toBeInTheDocument();
  ask("outra coisa");
  expect(sent[1]).not.toHaveProperty("conversationId");
});

test("a seq that jumped means another tab wrote: the thread is reloaded", async () => {
  render(<Harness />);
  ask("primeira");
  emit(reply(sent[0].id, "Uma."));

  // Enquanto o segundo turno rodava, outra aba gravou um turno nesta conversa:
  // o `seq` da resposta pula de 4 para 6.
  messagePage = {
    items: [
      { id: "s6", seq: 6, role: "assistant", content: "Seis.", entities: [], createdAt: "2026-09-17T12:03:00.000Z" },
      { id: "s5", seq: 5, role: "user", content: "segunda", entities: [], createdAt: "2026-09-17T12:02:00.000Z" },
      { id: "s4", seq: 4, role: "assistant", content: "da outra aba", entities: [], createdAt: "2026-09-17T12:01:00.000Z" },
      { id: "s3", seq: 3, role: "user", content: "outra aba", entities: [], createdAt: "2026-09-17T12:00:30.000Z" },
      { id: "s2", seq: 2, role: "assistant", content: "Uma.", entities: [], createdAt: "2026-09-17T12:00:00.000Z" },
      { id: "s1", seq: 1, role: "user", content: "primeira", entities: [], createdAt: "2026-09-17T11:59:00.000Z" },
    ],
  };
  ask("segunda");
  await act(async () => {
    emit(reply(sent[1].id, "Seis.", [], { assistantSeq: 6 }));
  });

  // O turno da outra aba aparece, em vez de a tela seguir mentindo.
  expect(within(screen.getByRole("log")).getByText("da outra aba")).toBeInTheDocument();
});

test("deleting the open conversation starts a fresh one", async () => {
  conversationPage = { items: [conversation(OTHER_CONVERSATION, "quanto dormi ontem?")] };
  render(<Harness />);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Suas conversas" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "quanto dormi ontem?" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Suas conversas" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Apagar conversa: quanto dormi ontem?" }));
  });

  expect(removed).toEqual([OTHER_CONVERSATION]);
  ask("começando de novo");
  expect(sent[0]).not.toHaveProperty("conversationId");
});
