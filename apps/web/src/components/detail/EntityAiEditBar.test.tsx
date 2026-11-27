import type { RequestDto } from "@repo/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { MODEL_SELECTION_KEY } from "@/lib/agent-chat/model-selection";
import { advanceRequest, requestsArea } from "@/test/fake-api/requests";
import { EntityAiEditBar } from "./EntityAiEditBar";

vi.mock("@/lib/speech/use-speech-recognition", () => ({
  useSpeechRecognition: () => ({ supported: false, listening: false, interim: "", error: null, start: vi.fn(), stop: vi.fn() }),
}));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;

/** A API falsa com ou sem provedor com chave: sem nenhum, o campo fica sem o seletor de modelo. */
function serve(model: "on" | "off") {
  api = createFakeApi({ areas: [requestsArea({ model })] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => {
  window.localStorage.clear();
  serve("off");
});

function setup(props: Partial<React.ComponentProps<typeof EntityAiEditBar>> = {}) {
  const onEdited = vi.fn();
  render(<EntityAiEditBar userId="user-1" entityType="task" entityId="e1" onEdited={onEdited} pollMs={1} {...props} />);
  return { onEdited };
}

/** O pedido que o campo abriu: a API falsa guarda os pedidos em `requests`. */
function openedRequest(): string {
  const [id] = [...api.store.table<RequestDto>("requests").keys()];
  if (!id) throw new Error("O campo ainda não abriu pedido.");
  return id;
}

function editCall() {
  return api.calls.find((call) => call.pathname === "/api/requests/edit");
}

test("uma tarefa: o pedido leva o tipo e o id da tarefa, mostra o andamento e recarrega ao terminar", async () => {
  const { onEdited } = setup();
  const input = screen.getByRole("textbox", { name: "Pedir à IA para editar esta tarefa" });
  expect(input).toHaveAttribute("placeholder", "Peça uma mudança nesta tarefa");

  fireEvent.change(input, { target: { value: "mude para 19h" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => expect(editCall()).toBeDefined());
  expect(editCall()?.body).toEqual({ userId: "user-1", text: "mude para 19h", entityType: "task", entityId: "e1" });

  await waitFor(() => openedRequest());
  advanceRequest(api, openedRequest(), {
    status: "running",
    progress: "Trocando o horário",
    steps: [{ id: "s1", agent: "task-edit", label: "Editando tarefas", status: "running" }],
  });
  expect(await screen.findByText("Trocando o horário")).toBeInTheDocument();

  advanceRequest(api, openedRequest(), {
    status: "completed",
    message: "Troquei para 19h.",
    steps: [{ id: "s1", agent: "task-edit", label: "Editando tarefas", status: "completed" }],
    entities: [{ kind: "task", id: "e1", name: "Revisão semanal", operation: "update", linkedTo: [] }],
  });
  expect(await screen.findByText("Pronto")).toBeInTheDocument();
  expect(screen.getByText("Editando tarefas")).toBeInTheDocument();
  expect(screen.getByText("Troquei para 19h.")).toBeInTheDocument();
  await waitFor(() => expect(onEdited).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("textbox", { name: "Pedir à IA para editar esta tarefa" })).toHaveValue("");
});

test("um artefato de texto: o pedido leva o tipo artifact e o id da nota", async () => {
  setup({ entityType: "artifact", entityId: "art-1" });
  const input = screen.getByRole("textbox", { name: "Pedir à IA para editar esta nota" });
  expect(input).toHaveAttribute("placeholder", "Peça uma mudança nesta nota");

  fireEvent.change(input, { target: { value: "resuma em duas linhas" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => expect(editCall()).toBeDefined());
  expect(editCall()?.body).toEqual({ userId: "user-1", text: "resuma em duas linhas", entityType: "artifact", entityId: "art-1" });
});

test("enviar fica desligado sem texto", () => {
  setup();
  expect(screen.getByRole("button", { name: "Enviar pedido" })).toBeDisabled();
});

test("o robo da linha de status vem solto, sem o disco nem a cor do estado, e o campo nao repete o registro", async () => {
  setup();
  expect(screen.getByRole("status")).toHaveTextContent("Esperando o seu pedido");
  const bot = screen.getByRole("status").querySelector("[data-hermes-mark] [data-state]");
  expect(bot).toHaveAttribute("data-state", "idle");
  expect(bot).toHaveAttribute("data-plain", "true");

  fireEvent.change(screen.getByRole("textbox"), { target: { value: "pedido" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
  await waitFor(() => openedRequest());
  advanceRequest(api, openedRequest(), { status: "failed", errorCode: "unavailable" });
  expect(await screen.findByText("Não deu certo")).toBeInTheDocument();
  expect(bot).toHaveAttribute("data-state", "error");
  expect(bot).toHaveAttribute("data-plain", "true");

  expect(screen.getByRole("textbox").closest("form")?.children).toHaveLength(1);
});

test("com motivo para desligar, o campo fica desabilitado e mostra o motivo", () => {
  setup({ entityType: "food_artifact", disabledReason: "Aguarde a geração da refeição para editar a nota." });
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByText("Aguarde a geração da refeição para editar a nota.")).toBeInTheDocument();
});

test("um pedido que falha mostra a mensagem do código do erro e não recarrega", async () => {
  const { onEdited } = setup();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "pedido" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => openedRequest());
  advanceRequest(api, openedRequest(), { status: "failed", errorCode: "unavailable" });

  expect(await screen.findByText("Não deu certo")).toBeInTheDocument();
  expect(screen.getByText("A IA está indisponível agora. Tente de novo em instantes.")).toBeInTheDocument();
  expect(onEdited).not.toHaveBeenCalled();
});

test("pedido recusado devolve o texto ao campo para tentar de novo, e Fechar limpa o resultado", async () => {
  api.failNext("POST", "/api/requests/edit", 503);
  setup();
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: "pedido" } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));

  await waitFor(() => expect(input).toHaveValue("pedido"));
  expect(await screen.findByText("Não deu certo")).toBeInTheDocument();
  expect(screen.getByText("A IA está indisponível agora. Tente de novo em instantes.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fechar resultado" }));
  expect(screen.queryByText("Não deu certo")).not.toBeInTheDocument();
});

/** O campo ja tem a escolha do modelo (as opcoes do servidor chegaram), mesmo sem mostra-la. */
async function optionsRead() {
  await waitFor(() => expect(screen.getByRole("textbox").closest("form")).toHaveAttribute("data-model", "true"));
}

/** Escreve o comando no campo e envia. */
function command(text: string, how: "click" | "enter" = "click") {
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: text } });
  if (how === "enter") fireEvent.keyDown(input, { key: "Enter" });
  else fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
}

test("o campo nao mostra o modelo; /model abre a folha da escolha sem virar pedido", async () => {
  serve("on");
  setup();
  await optionsRead();
  const form = screen.getByRole("textbox").closest("form");
  expect(form).toHaveAttribute("data-layout", "pill");
  expect(screen.queryByRole("button", { name: /Trocar$/ })).toBeNull();
  // A folha fechada nao esta na tela: nada do modelo esta a vista.
  expect(screen.queryByRole("dialog", { name: "Escolha do modelo" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Sonnet 5.5" })).toBeNull();
  expect(screen.getByRole("textbox").parentElement).toContainElement(screen.getByRole("button", { name: "Enviar pedido" }));

  command("/model");
  expect(form).toHaveAttribute("data-model-open", "true");
  expect(screen.getByRole("dialog", { name: "Escolha do modelo" })).toBeInTheDocument();
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(editCall()).toBeUndefined();

  fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
  expect(form).toHaveAttribute("data-model-open", "false");
  expect(screen.getByRole("textbox")).toHaveFocus();
});

test("o pedido de edicao vai com a escolha, e a troca feita pelo /model vale no proximo pedido e fica no aparelho", async () => {
  serve("on");
  setup();
  await optionsRead();
  command("mude para 19h");
  await waitFor(() => expect(editCall()).toBeDefined());
  expect(editCall()?.body).toEqual({
    userId: "user-1", text: "mude para 19h", entityType: "task", entityId: "e1",
    model: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" },
  });
  advanceRequest(api, openedRequest(), { status: "completed", message: "Feito." });
  expect(await screen.findByText("Pronto")).toBeInTheDocument();
  api.calls.length = 0;

  const form = screen.getByRole("textbox").closest("form");
  command("/MODEL", "enter");
  expect(form).toHaveAttribute("data-model-open", "true");
  // A aba do provedor so mostra a lista: a escolha troca ao tocar no modelo.
  fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
  fireEvent.click(screen.getByRole("button", { name: "GPT 6.2 Sol" }));
  fireEvent.click(screen.getByRole("button", { name: "Máximo" }));
  fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
  expect(form).toHaveAttribute("data-model-open", "false");
  expect(JSON.parse(window.localStorage.getItem(MODEL_SELECTION_KEY) ?? "null").current)
    .toEqual({ provider: "openai", model: "gpt-6.2-sol", effort: "max" });

  command("resuma");
  await waitFor(() => expect(editCall()).toBeDefined());
  expect(editCall()?.body).toMatchObject({ text: "resuma", model: { provider: "openai", model: "gpt-6.2-sol", effort: "max" } });
});

test("o toque fora e o Escape fecham a folha e devolvem o foco ao texto", async () => {
  serve("on");
  setup();
  await optionsRead();
  const form = screen.getByRole("textbox").closest("form");
  const overlay = () => document.querySelector<HTMLElement>("[data-model-sheet]");

  command("/model");
  expect(overlay()).toHaveAttribute("data-open", "true");
  fireEvent.pointerDown(overlay() as HTMLElement);
  expect(form).toHaveAttribute("data-model-open", "false");
  expect(screen.getByRole("textbox")).toHaveFocus();

  command("/model");
  expect(form).toHaveAttribute("data-model-open", "true");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(form).toHaveAttribute("data-model-open", "false");
  expect(screen.getByRole("textbox")).toHaveFocus();
});

test("sem nenhum provedor neste ambiente o campo fica sem o seletor e o pedido vai sem escolha", async () => {
  setup();
  await waitFor(() => expect(api.calls.some((call) => call.pathname === "/api/requests/model/options")).toBe(true));
  expect(screen.queryByRole("button", { name: /Trocar$/ })).toBeNull();
  expect(screen.getByRole("textbox").parentElement).toContainElement(screen.getByRole("button", { name: "Enviar pedido" }));
});
