import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import type { AiProcessDto } from "@/lib/api/contracts";
import type { AgentChatEntityRef } from "@/lib/api/contracts";
import { AgentChatPanel, agentEntityHref, useAgendaChat } from "./agent-chat-panel";

const { session, requestAgendaRefresh } = vi.hoisted(() => ({
  session: { user: { userId: "user-1", name: "Ana", email: null } as { userId: string } | null, ready: true },
  requestAgendaRefresh: vi.fn(),
}));
vi.mock("@/lib/session/use-session", () => ({ useSessionState: () => session }));
vi.mock("./agenda-refresh", () => ({ requestAgendaRefresh }));

const done: AiProcessDto = {
  id: "p1",
  title: "Realizando processos:",
  status: "completed",
  steps: [],
  entities: [],
  message: "Você tem um treino às 7h.",
};

let processStart: ReturnType<typeof vi.fn>;
let processGet: ReturnType<typeof vi.fn>;

function Harness({
  live = true,
  onCommand,
  onClose,
  entityHref,
}: {
  live?: boolean;
  onCommand?: (command: string, argument: string) => void;
  onClose?: () => void;
  entityHref?: (entity: AgentChatEntityRef) => string | undefined;
}) {
  const agenda = useAgendaChat({
    live,
    processApi: { start: processStart, get: processGet } as never,
    automationApi: { start: vi.fn(), get: vi.fn() } as never,
  });
  return <AgentChatPanel {...agenda} onCommand={onCommand} onClose={onClose} entityHref={entityHref} />;
}

function ask(text: string) {
  const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });
  const form = textbox.closest("form");
  if (!form) throw new Error("O campo de mensagem precisa estar dentro de um formulário.");
  fireEvent.change(textbox, { target: { value: text } });
  fireEvent.submit(form);
}

beforeEach(() => {
  processStart = vi.fn(async () => ({ processId: "p1" }));
  processGet = vi.fn(async () => done);
  session.user = { userId: "user-1" };
  session.ready = true;
  requestAgendaRefresh.mockReset();
});

test("sends the message through the process route for the session user, from the agenda", async () => {
  render(<Harness />);
  ask("o que tenho hoje?");

  expect(processStart).toHaveBeenCalledWith({ userId: "user-1", text: "o que tenho hoje?", context: { screen: "agenda" } });
  const log = screen.getByRole("log");
  expect(within(log).getByText("o que tenho hoje?")).toBeInTheDocument();
  await waitFor(() => expect(within(log).getByText("Você tem um treino às 7h.")).toBeInTheDocument());
  expect(requestAgendaRefresh).not.toHaveBeenCalled();
});

test("the conversation header says who answers, a new conversation clears it and the close button closes the chat", async () => {
  const onClose = vi.fn();
  render(<Harness onClose={onClose} />);
  ask("o que tenho hoje?");

  const header = screen.getByRole("heading", { name: "Conversa" }).parentElement;
  expect(header).toHaveTextContent("Assistente");
  fireEvent.click(screen.getByRole("button", { name: "Fechar o chat" }));
  expect(onClose).toHaveBeenCalledTimes(1);

  await waitFor(() => expect(screen.getByRole("button", { name: "Nova conversa" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
  expect(screen.getByRole("heading", { name: "O que vamos fazer?" })).toBeInTheDocument();
});

test("the composer shortcuts write the command in the field", () => {
  const onCommand = vi.fn();
  render(<Harness onCommand={onCommand} />);
  ask("oi");

  const shortcuts = screen.getByRole("group", { name: "Comandos rápidos" });
  expect(within(shortcuts).getAllByRole("button").map((button) => button.textContent)).toEqual(["/tarefa", "/evento", "/nota"]);

  fireEvent.click(within(shortcuts).getByRole("button", { name: "/tarefa" }));
  const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });
  expect(textbox).toHaveValue("/tarefa ");
  expect(textbox).toHaveFocus();
  expect(screen.getByRole("list", { name: "Comandos" })).toBeInTheDocument();
  expect(onCommand).not.toHaveBeenCalled();
});

test("a record's page lives under the user; a deleted record has none", () => {
  expect(agentEntityHref("u1", { kind: "task", id: "01T", change: "created" })).toBe("/u1/tarefas/01T");
  expect(agentEntityHref("u1", { kind: "note", id: "01N", change: "updated" })).toBe("/u1/notas/01N");
  expect(agentEntityHref("u1", { kind: "event", id: "01E", change: "deleted" })).toBeUndefined();
});

test("a failed message can be retried", async () => {
  processStart.mockRejectedValueOnce(new Error("boom"));
  render(<Harness />);
  ask("crie a tarefa");

  await waitFor(() => expect(screen.getByText(/Não consegui conectar ao assistente/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

  await waitFor(() => expect(processStart).toHaveBeenCalledTimes(2));
  expect(processStart).toHaveBeenLastCalledWith(expect.objectContaining({ text: "crie a tarefa" }));
  expect(screen.queryByText(/Não consegui conectar ao assistente/)).not.toBeInTheDocument();
  expect(within(screen.getByRole("log")).getAllByText("crie a tarefa")).toHaveLength(1);
});

test("without a session the chat asks to sign in and sends nothing", () => {
  session.user = null;
  render(<Harness />);

  expect(screen.getByText("Entre na sua conta para conversar com a IA.")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toBeDisabled();
  expect(processStart).not.toHaveBeenCalled();
});

test("the mockup never connects", () => {
  render(<Harness live={false} />);

  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toBeDisabled();
  expect(processStart).not.toHaveBeenCalled();
});

test("the start is only the question and the field, with no suggestions or conversation list", () => {
  render(<Harness />);

  expect(screen.getByRole("heading", { name: "O que vamos fazer?" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toHaveAttribute(
    "placeholder",
    "Pergunte ou digite / para comandos",
  );
  expect(screen.queryByRole("button", { name: "O que tenho na agenda hoje?" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Todas as conversas" })).not.toBeInTheDocument();
});

test("typing a slash lists the commands and Enter runs the highlighted one, nothing goes to the AI", () => {
  const onCommand = vi.fn();
  render(<Harness onCommand={onCommand} />);
  const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });

  fireEvent.change(textbox, { target: { value: "/" } });
  const commands = screen.getByRole("list", { name: "Comandos" });
  expect(within(commands).getAllByRole("button").map((button) => button.textContent)).toEqual([
    "Criar tarefaNome, status, prioridade e dia/tarefa",
    "Criar eventoTipo, início e término/evento",
    "Criar notaA primeira linha vira o título/nota",
    "PesquisarEventos, tarefas e notas/buscar",
  ]);

  fireEvent.keyDown(textbox, { key: "ArrowDown" });
  expect(within(commands).getByRole("button", { name: /Criar evento/ })).toHaveAttribute("aria-current", "true");

  fireEvent.change(textbox, { target: { value: "/tarefa comprar pão" } });
  fireEvent.submit(textbox.closest("form") as HTMLFormElement);

  expect(onCommand).toHaveBeenCalledWith("task", "comprar pão");
  expect(processStart).not.toHaveBeenCalled();
  expect(textbox).toHaveValue("");
});

test("an unknown slash command is just a message", () => {
  const onCommand = vi.fn();
  render(<Harness onCommand={onCommand} />);

  ask("/xyz o que é isso?");

  expect(screen.queryByRole("list", { name: "Comandos" })).not.toBeInTheDocument();
  expect(onCommand).not.toHaveBeenCalled();
  expect(processStart).toHaveBeenCalledWith(expect.objectContaining({ text: "/xyz o que é isso?" }));
});
