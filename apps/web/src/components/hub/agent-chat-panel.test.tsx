import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { RequestDto } from "@repo/contracts";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AgentChatEntityRef } from "@/lib/api/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { advanceRequest, requestsArea } from "@/test/fake-api/requests";
import { AgentChatPanel, agentEntityHref, requestWithWindow, useAgendaChat } from "./agent-chat-panel";
import type { FreeWindow } from "./hub-events";

const { session, requestAgendaRefresh, net } = vi.hoisted(() => ({
  session: { user: { userId: "user-1", name: "Ana", email: null } as { userId: string } | null, ready: true },
  requestAgendaRefresh: vi.fn(),
  net: { authedFetch: vi.fn() },
}));
vi.mock("@/lib/session/use-session", () => ({ useSessionState: () => session }));
vi.mock("@/components/agenda/agenda-refresh", () => ({ requestAgendaRefresh }));
// A conversa fala com a API falsa de pedidos: é ela que aceita, avança e cancela.
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;

const requests = () => api.store.table<RequestDto>("requests");
const requestPosts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/requests");

/** Espera a API aceitar o pedido número `count` e o avança para `change` (o que o agente faria). */
async function answer(count: number, change: Partial<RequestDto>) {
  await waitFor(() => expect(requestPosts()).toHaveLength(count));
  const id = [...requests().keys()][count - 1];
  if (!id) throw new Error(`Pedido ${count} não existe na API falsa.`);
  advanceRequest(api, id, change);
}

const finished = { status: "done" as const, message: "Você tem um treino às 7h." };

function Harness({
  live = true,
  onCommand,
  onClose,
  entityHref,
  freeWindow,
  onClearFreeWindow,
  todayKey,
  listenOnOpen,
}: {
  listenOnOpen?: boolean;
  freeWindow?: FreeWindow;
  onClearFreeWindow?: () => void;
  todayKey?: string;
  live?: boolean;
  onCommand?: (command: string, argument: string) => void;
  onClose?: () => void;
  entityHref?: (entity: AgentChatEntityRef) => string | undefined;
}) {
  const agenda = useAgendaChat({
    live,
    pollMs: 5,
    automationApi: { start: vi.fn(), get: vi.fn() } as never,
  });
  return <AgentChatPanel {...agenda} onCommand={onCommand} onClose={onClose} entityHref={entityHref} freeWindow={freeWindow} onClearFreeWindow={onClearFreeWindow} todayKey={todayKey} listenOnOpen={listenOnOpen} />;
}

function ask(text: string) {
  const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });
  const form = textbox.closest("form");
  if (!form) throw new Error("O campo de mensagem precisa estar dentro de um formulário.");
  fireEvent.change(textbox, { target: { value: text } });
  fireEvent.submit(form);
}

beforeEach(() => {
  api = createFakeApi({ areas: [requestsArea()] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
  session.user = { userId: "user-1" };
  session.ready = true;
  requestAgendaRefresh.mockReset();
});

test("sends the message as a request for the session user, from the agenda", async () => {
  render(<Harness />);
  ask("o que tenho hoje?");

  await waitFor(() => expect(requestPosts()).toHaveLength(1));
  expect(requestPosts()[0]?.body).toEqual({
    userId: "user-1",
    text: "o que tenho hoje?",
    context: { screen: "agenda" },
    clientMessageId: expect.any(String),
  });
  const log = screen.getByRole("log");
  expect(within(log).getByText("o que tenho hoje?")).toBeInTheDocument();
  await answer(1, finished);
  await waitFor(() => expect(within(log).getByText("Você tem um treino às 7h.")).toBeInTheDocument());
  expect(requestAgendaRefresh).not.toHaveBeenCalled();
});

test("the conversation header says who answers, a new conversation clears it and the close button closes the chat", async () => {
  const onClose = vi.fn();
  render(<Harness onClose={onClose} />);
  ask("o que tenho hoje?");
  await answer(1, finished);

  const header = screen.getByRole("heading", { name: "Conversa" }).parentElement;
  expect(header).toHaveTextContent("Assistente");
  fireEvent.click(screen.getByRole("button", { name: "Fechar o chat" }));
  expect(onClose).toHaveBeenCalledTimes(1);

  await waitFor(() => expect(screen.getByRole("button", { name: "Nova conversa" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
  expect(screen.getByRole("heading", { name: "O que vamos fazer?" })).toBeInTheDocument();
});

test("the process view sits beside the conversation: it lists what the AI did for each request", async () => {
  render(<Harness onCommand={vi.fn()} />);
  expect(screen.queryByRole("group", { name: "Vista do chat" })).not.toBeInTheDocument();

  ask("o que tenho hoje?");
  await answer(1, {
    ...finished,
    trace: {
      route: "steps", status: "done", startedAt: "2026-11-11T12:00:00.000Z", durationMs: 1500, fields: [],
      entries: [
        { id: "p1-request", kind: "request", label: "Pedido", summary: "o que tenho hoje?", status: "done" },
        { id: "s1", kind: "agent", label: "Consultando a agenda", source: "query", status: "done", durationMs: 900 },
      ],
    },
  });
  await screen.findByText("Você tem um treino às 7h.");

  const views = within(screen.getByRole("group", { name: "Vista do chat" }));
  expect(views.getByRole("button", { name: "Conversa" })).toHaveAttribute("aria-pressed", "true");
  const process = views.getByRole("button", { name: /Processo/ });
  expect(process).toHaveTextContent("2");
  expect(process).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("log").closest("[data-pane]")).toHaveAttribute("data-pane", "chat");

  fireEvent.click(process);

  expect(process).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("log").closest("[data-pane]")).toHaveAttribute("data-pane", "process");
  const trace = within(screen.getByRole("region", { name: "Processo da IA" }));
  expect(trace.getByRole("article", { name: "Pedido: o que tenho hoje?" })).toBeInTheDocument();
  expect(trace.getByRole("button", { name: /Consultando a agenda/ })).toHaveTextContent("900 ms");

  // Os comandos da barra "/" moram na conversa: ao digitar um, e ela que aparece.
  fireEvent.change(screen.getByRole("textbox", { name: "Mensagem para a IA" }), { target: { value: "/" } });
  expect(screen.getByRole("list", { name: "Comandos" }).closest("[data-pane]")).toHaveAttribute("data-pane", "chat");
  expect(screen.queryByRole("region", { name: "Processo da IA" })).not.toBeInTheDocument();
});

test("the home offers notifications and settings next to create and search", () => {
  const onCommand = vi.fn();
  render(<Harness onCommand={onCommand} />);

  const actions = screen.getByRole("group", { name: "Criar, pesquisar e ajustar" });
  fireEvent.click(within(actions).getByRole("button", { name: "Notificações" }));
  fireEvent.click(within(actions).getByRole("button", { name: "Configurações" }));

  expect(onCommand).toHaveBeenNthCalledWith(1, "notifications", "");
  expect(onCommand).toHaveBeenNthCalledWith(2, "settings", "");
});

test("the conversation offers no command shortcuts: the field is the only way in", () => {
  render(<Harness onCommand={vi.fn()} />);
  ask("oi");

  expect(screen.queryByRole("group", { name: "Comandos rápidos" })).not.toBeInTheDocument();
  expect(screen.getByRole("form", { name: "Pedido ao Hermes" })).toBeInTheDocument();
  // Enquanto a IA responde, o enviar fica desligado e diz por quê.
  expect(screen.getByRole("button", { name: "Aguardando a resposta" })).toBeDisabled();
});

test("a free window from the agenda is attached to the field and travels with the request", () => {
  const onClearFreeWindow = vi.fn();
  const freeWindow = { dayKey: "2026-09-14", startMs: Date.parse("2026-09-14T10:30:00-03:00"), endMs: Date.parse("2026-09-14T12:30:00-03:00"), minutes: 120, endsAtMidnight: false };
  expect(requestWithWindow(freeWindow, " caminhar ")).toBe("Sobre a janela livre de seg, 14 de set, das 10:30 às 12:30 (2 h): caminhar");

  render(<Harness onCommand={vi.fn()} freeWindow={freeWindow} onClearFreeWindow={onClearFreeWindow} todayKey="2026-09-14" />);
  expect(screen.getByRole("heading", { name: "O que vamos fazer das 10:30 às 12:30?" })).toBeInTheDocument();
  expect(screen.getByText("Janela livre · hoje")).toBeInTheDocument();
  // Com a janela, os atalhos de criar saem: a pergunta já é o convite.
  expect(screen.queryByRole("group", { name: "Criar, pesquisar e ajustar" })).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toHaveAttribute("placeholder", "Diga o que quer fazer nesse tempo");

  fireEvent.click(screen.getByRole("button", { name: "Tirar a janela livre do pedido" }));
  expect(onClearFreeWindow).toHaveBeenCalled();
});

test("a record's page lives under the user; a deleted record has none", () => {
  expect(agentEntityHref("u1", { kind: "task", id: "01T", change: "created" })).toBe("/u1/tarefas/01T");
  expect(agentEntityHref("u1", { kind: "note", id: "01N", change: "updated" })).toBe("/u1/notas/01N");
  expect(agentEntityHref("u1", { kind: "event", id: "01E", change: "deleted" })).toBeUndefined();
});

test("a message that could not reach the API can be retried, with the same id: no second request", async () => {
  api.failNext("POST", "/api/requests", 500);
  render(<Harness />);
  ask("crie a tarefa");

  await waitFor(() => expect(screen.getByText(/Não consegui conectar ao assistente/)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

  await waitFor(() => expect(requestPosts()).toHaveLength(2));
  const firstClientId = (requestPosts()[0]?.body as { clientMessageId: string }).clientMessageId;
  expect(requestPosts()[1]?.body).toMatchObject({ text: "crie a tarefa", clientMessageId: firstClientId });
  expect(screen.queryByText(/Não consegui conectar ao assistente/)).not.toBeInTheDocument();
  expect(within(screen.getByRole("log")).getAllByText("crie a tarefa")).toHaveLength(1);
});

test("without a session the chat asks to sign in and sends nothing", () => {
  session.user = null;
  render(<Harness />);

  expect(screen.getByText("Entre na sua conta para conversar com a IA.")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toBeDisabled();
  expect(requestPosts()).toHaveLength(0);
});

test("the mockup never connects", () => {
  render(<Harness live={false} />);

  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toBeDisabled();
  expect(requestPosts()).toHaveLength(0);
});

test("the start is only the question and the field, with no suggestions or conversation list", () => {
  render(<Harness />);

  expect(screen.getByRole("heading", { name: "O que vamos fazer?" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toHaveAttribute(
    "placeholder",
    "Diga ou escreva o que precisa",
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
    "NotificaçõesAvisos recentes e próximos/notificacoes",
    "ConfiguraçõesTema e conta/configuracoes",
  ]);

  fireEvent.keyDown(textbox, { key: "ArrowDown" });
  expect(within(commands).getByRole("button", { name: /Criar evento/ })).toHaveAttribute("aria-current", "true");

  fireEvent.change(textbox, { target: { value: "/tarefa comprar pão" } });
  fireEvent.submit(textbox.closest("form") as HTMLFormElement);

  expect(onCommand).toHaveBeenCalledWith("task", "comprar pão");
  expect(requestPosts()).toHaveLength(0);
  expect(textbox).toHaveValue("");
});

test("an unknown slash command is just a message", async () => {
  const onCommand = vi.fn();
  render(<Harness onCommand={onCommand} />);

  ask("/xyz o que é isso?");

  expect(screen.queryByRole("list", { name: "Comandos" })).not.toBeInTheDocument();
  expect(onCommand).not.toHaveBeenCalled();
  await waitFor(() => expect(requestPosts()[0]?.body).toMatchObject({ text: "/xyz o que é isso?" }));
});

test("cancelling a request from the process box cancels it in the API", async () => {
  render(<Harness />);
  ask("crie uma nota");
  await waitFor(() => expect(requestPosts()).toHaveLength(1));

  fireEvent.click(await screen.findByRole("button", { name: "Cancelar pedido" }));

  await waitFor(() => expect(screen.getByText("Pedido cancelado.")).toBeInTheDocument());
  expect([...requests().values()][0]).toMatchObject({ status: "cancel" });
  expect(screen.queryByRole("button", { name: "Cancelar pedido" })).not.toBeInTheDocument();
});

/** O microfone do navegador, de mentira: guarda as sessões abertas e deixa o teste dizer o que foi ouvido. */
class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  aborted = false;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() { FakeSpeechRecognition.instances.push(this); }
  start(): void {}
  // Como o Chrome: ao parar, fecha a frase que estava saindo e so depois avisa o fim.
  stop(): void {
    if (this.lastHeard) this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: this.lastHeard }], { isFinal: true })] } as unknown as SpeechRecognitionEvent);
    this.onend?.();
  }
  abort(): void { this.aborted = true; }
  lastHeard = "";
  hear(transcript: string): void {
    this.lastHeard = transcript;
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal: false })] } as unknown as SpeechRecognitionEvent);
  }
}

function withMicrophone() {
  FakeSpeechRecognition.instances = [];
  vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);
}

afterEach(() => vi.unstubAllGlobals());

test("opened by the person, the chat is already listening", () => {
  withMicrophone();
  render(<Harness listenOnOpen />);

  expect(FakeSpeechRecognition.instances).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Parar de transcrever" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Ouvindo…");
});

test("otherwise the microphone waits for the wave button", () => {
  withMicrophone();
  render(<Harness />);

  expect(FakeSpeechRecognition.instances).toHaveLength(0);
  expect(screen.getByRole("button", { name: "Transcrever o que eu disser" })).toHaveAttribute("aria-pressed", "false");
});

test("the first typed letter turns the microphone off and keeps what was on the field", () => {
  withMicrophone();
  render(<Harness listenOnOpen />);
  const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });
  act(() => FakeSpeechRecognition.instances[0].hear("comprar pão"));
  expect(textbox).toHaveValue("comprar pão");

  fireEvent.change(textbox, { target: { value: "comprar pão e" } });

  expect(FakeSpeechRecognition.instances[0].aborted).toBe(true);
  expect(screen.getByRole("button", { name: "Transcrever o que eu disser" })).toHaveAttribute("aria-pressed", "false");
  expect(textbox).toHaveValue("comprar pão e");
});

test("what was said can be sent as it is, and sending closes the microphone", async () => {
  withMicrophone();
  render(<Harness listenOnOpen />);
  const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });
  act(() => FakeSpeechRecognition.instances[0].hear("o que tenho hoje?"));

  fireEvent.submit(textbox.closest("form") as HTMLFormElement);

  expect(FakeSpeechRecognition.instances[0].aborted).toBe(true);
  expect(textbox).toHaveValue("");
  await waitFor(() => expect(requestPosts()[0]?.body).toMatchObject({ userId: "user-1", text: "o que tenho hoje?", context: { screen: "agenda" } }));
});

test("a microphone that opened by itself does not complain about silence", () => {
  withMicrophone();
  render(<Harness listenOnOpen />);

  act(() => FakeSpeechRecognition.instances[0].onerror?.({ error: "no-speech" } as SpeechRecognitionErrorEvent));

  expect(screen.queryByText("Não ouvi nada. Tente de novo.")).not.toBeInTheDocument();
});

test("when the voice stops, what was said goes to the AI by itself", async () => {
  vi.useFakeTimers();
  try {
    withMicrophone();
    render(<Harness listenOnOpen />);
    act(() => FakeSpeechRecognition.instances[0].hear("o que tenho hoje?"));
    expect(requestPosts()).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(2000); });
  } finally {
    vi.useRealTimers();
  }

  await waitFor(() => expect(requestPosts()[0]?.body).toMatchObject({ userId: "user-1", text: "o que tenho hoje?", context: { screen: "agenda" } }));
  expect(screen.getByRole("textbox", { name: "Mensagem para a IA" })).toHaveValue("");
});

test("typing before the voice stops cancels the automatic send", () => {
  vi.useFakeTimers();
  try {
    withMicrophone();
    render(<Harness listenOnOpen />);
    const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });
    act(() => FakeSpeechRecognition.instances[0].hear("comprar pão"));

    fireEvent.change(textbox, { target: { value: "comprar pão e leite" } });
    act(() => { vi.advanceTimersByTime(5000); });

    expect(requestPosts()).toHaveLength(0);
    expect(textbox).toHaveValue("comprar pão e leite");
  } finally {
    vi.useRealTimers();
  }
});

/** Fala e espera a API receber o pedido número `count` e a resposta dele aparecer (o campo volta a aguardar). */
async function speakAndWaitForReply(text: string, count: number) {
  vi.useFakeTimers();
  try {
    act(() => FakeSpeechRecognition.instances.at(-1)?.hear(text));
    act(() => { vi.advanceTimersByTime(2000); });
  } finally {
    vi.useRealTimers();
  }
  await answer(count, finished);
  await waitFor(() => expect(screen.getByRole("status")).not.toHaveTextContent("…"));
}

test("after the answer to a spoken request, the chat listens again, over and over", async () => {
  withMicrophone();
  render(<Harness listenOnOpen />);

  await speakAndWaitForReply("o que tenho hoje?", 1);
  await waitFor(() => expect(FakeSpeechRecognition.instances).toHaveLength(2));
  expect(screen.getByRole("status")).toHaveTextContent("Ouvindo…");

  await speakAndWaitForReply("e amanhã?", 2);
  await waitFor(() => expect(FakeSpeechRecognition.instances).toHaveLength(3));
  expect(requestPosts()).toHaveLength(2);
});

test("saying stop ends the cycle without sending the word", async () => {
  withMicrophone();
  render(<Harness listenOnOpen />);
  await speakAndWaitForReply("o que tenho hoje?", 1);
  await waitFor(() => expect(FakeSpeechRecognition.instances).toHaveLength(2));

  vi.useFakeTimers();
  try {
    act(() => FakeSpeechRecognition.instances[1].hear("Pode parar."));
    act(() => { vi.advanceTimersByTime(2000); });
  } finally {
    vi.useRealTimers();
  }

  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(requestPosts()).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Transcrever o que eu disser" })).toHaveAttribute("aria-pressed", "false");
  expect(FakeSpeechRecognition.instances).toHaveLength(2);
});

test("tapping the wave while it listens ends the cycle", async () => {
  withMicrophone();
  render(<Harness listenOnOpen />);
  await speakAndWaitForReply("o que tenho hoje?", 1);
  await waitFor(() => expect(FakeSpeechRecognition.instances).toHaveLength(2));

  fireEvent.click(screen.getByRole("button", { name: "Parar de transcrever" }));

  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(FakeSpeechRecognition.instances).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Transcrever o que eu disser" })).toHaveAttribute("aria-pressed", "false");
});

test("typing ends the cycle too", async () => {
  withMicrophone();
  render(<Harness listenOnOpen />);
  await speakAndWaitForReply("o que tenho hoje?", 1);
  await waitFor(() => expect(FakeSpeechRecognition.instances).toHaveLength(2));

  fireEvent.change(screen.getByRole("textbox", { name: "Mensagem para a IA" }), { target: { value: "a" } });

  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(FakeSpeechRecognition.instances).toHaveLength(2);
});
