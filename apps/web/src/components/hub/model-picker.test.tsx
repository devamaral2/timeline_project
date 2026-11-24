import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { RequestDto } from "@repo/contracts";
import { beforeEach, expect, test, vi } from "vitest";
import { MODEL_FAVORITES_KEY } from "@/lib/agent-chat/model-favorites";
import { MODEL_SELECTION_KEY } from "@/lib/agent-chat/model-selection";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { advanceRequest, modelOptionsFixture, requestsArea } from "@/test/fake-api/requests";
import { AgentChatPanel, useAgendaChat } from "./agent-chat-panel";

const { net, session } = vi.hoisted(() => ({
  net: { authedFetch: vi.fn() },
  session: { user: { userId: "user-1" } as { userId: string } | null, ready: true },
}));
vi.mock("@/lib/session/use-session", () => ({ useSessionState: () => session }));
vi.mock("@/components/agenda/agenda-refresh", () => ({ requestAgendaRefresh: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

let api: FakeApi;

const modelPosts = () => api.calls.filter((call) => call.method === "POST" && call.pathname === "/api/requests/model");

function Harness() {
  const agenda = useAgendaChat({ live: true, pollMs: 5 });
  return <AgentChatPanel {...agenda} />;
}

function ask(text: string) {
  const textbox = screen.getByRole("textbox", { name: "Mensagem para a IA" });
  const form = textbox.closest("form");
  if (!form) throw new Error("O campo de mensagem precisa estar dentro de um formulário.");
  fireEvent.change(textbox, { target: { value: text } });
  fireEvent.submit(form);
}

const overlay = () => document.querySelector<HTMLElement>("[data-model-sheet]");
const sheet = () => screen.queryByRole("dialog", { name: "Escolha do modelo" });
/** As abas da folha (os favoritos e cada provedor), pelo nome. */
const tabs = () => [...document.querySelectorAll<HTMLElement>("[data-model-tab]")].map((tab) => tab.getAttribute("aria-label"));
const tab = (name: string) => within(screen.getByRole("group", { name: "Provedor" })).getByRole("button", { name });
/** As linhas da lista de modelos: o nome (na aba de favoritos, o nome e o provedor). */
const models = () => [...document.querySelectorAll<HTMLElement>("[data-model-row]")].map((row) => row.getAttribute("aria-label") ?? row.textContent);
const closeSheet = () => fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
const savedChoice = () => JSON.parse(window.localStorage.getItem(MODEL_SELECTION_KEY) ?? "{}").current;
const field = () => screen.getByRole("textbox", { name: "Mensagem para a IA" });
const form = () => field().closest("form");
const modeName = () => screen.getByRole("heading", { name: "Conversa" }).parentElement;

/** O campo ja tem a escolha (as opcoes do servidor chegaram), mesmo sem mostra-la. */
async function choiceReady() {
  await waitFor(() => expect(form()).toHaveAttribute("data-model", "true"));
}

/** Envia `/model` e espera a folha aberta. */
function openPanel() {
  ask("/model");
  expect(form()).toHaveAttribute("data-model-open", "true");
  expect(sheet()).toBeInTheDocument();
}

async function enterModelMode(command = "/claude") {
  render(<Harness />);
  ask(command);
  await waitFor(() => expect(modeName()).toHaveTextContent("Modelo"));
  await choiceReady();
}

beforeEach(() => {
  window.localStorage.clear();
  api = createFakeApi({ areas: [requestsArea({ model: "on" })] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
  session.user = { userId: "user-1" };
});

test("the field shows nothing of the model; /model opens the choice in the assistant, in the model mode and back", async () => {
  render(<Harness />);
  await choiceReady();
  // O campo e a pilula: o texto, a onda e a seta, sem o modelo, o esforco nem o provedor.
  expect(form()).toHaveAttribute("data-layout", "pill");
  expect(screen.queryByRole("button", { name: /Trocar$/ })).toBeNull();
  expect(screen.queryByText("via anthropic")).toBeNull();
  expect(screen.queryByRole("button", { name: "Sonnet 5.5" })).toBeNull();
  expect(field().parentElement).toContainElement(screen.getByRole("button", { name: "Enviar mensagem" }));

  openPanel();
  expect(field()).toHaveValue("");
  closeSheet();
  expect(form()).toHaveAttribute("data-model-open", "false");
  expect(sheet()).toBeNull();
  expect(field()).toHaveFocus();
  // O /model nao vira mensagem.
  expect(api.calls.some((call) => call.method === "POST")).toBe(false);

  // `/modelo` segue sendo o modo modelo do chat, e nele o /model abre a mesma escolha.
  ask("/modelo");
  await waitFor(() => expect(modeName()).toHaveTextContent("Modelo"));
  openPanel();
  closeSheet();

  ask("/app");
  await waitFor(() => expect(modeName()).toHaveTextContent("Assistente"));
  openPanel();
});

test("in a new chat /model opens the panel and the pick goes with the next request to the agenda assistant", async () => {
  render(<Harness />);
  await choiceReady();

  openPanel();
  fireEvent.click(screen.getByRole("button", { name: "Opus 5.5" }));
  fireEvent.click(screen.getByRole("button", { name: "Alto" }));
  closeSheet();

  ask("o que tenho amanhã?");

  const sent = () => api.calls.find((call) => call.method === "POST" && call.pathname === "/api/requests");
  await waitFor(() => expect(sent()).toBeDefined());
  expect(sent()?.body).toMatchObject({
    text: "o que tenho amanhã?", model: { provider: "anthropic", model: "claude-opus-5-5", effort: "high" },
  });
  expect(modelPosts()).toHaveLength(0);
});

test("the Hermes answers with its own model: in its mode the field has no choice", async () => {
  render(<Harness />);
  await choiceReady();

  ask("/hermes");
  await waitFor(() => expect(form()).toHaveAttribute("data-model", "false"));

  ask("/app");
  await choiceReady();
});

test("with no provider key in this environment the field has no choice and keeps the send button beside the text", async () => {
  api = createFakeApi({ areas: [requestsArea()] });
  net.authedFetch.mockImplementation(api.authedFetch);
  render(<Harness />);

  await waitFor(() => expect(api.calls.some((call) => call.pathname === "/api/requests/model/options")).toBe(true));
  expect(form()).toHaveAttribute("data-model", "false");
  expect(field().parentElement).toContainElement(screen.getByRole("button", { name: "Enviar mensagem" }));
});

test("the sheet starts closed: it is not on the page", async () => {
  await enterModelMode();
  expect(sheet()).toBeNull();
  expect(overlay()).toBeNull();
  expect(form()).toHaveAttribute("data-model-open", "false");
});

test("the open sheet shows the provider tabs, the models with the current choice and the effort, with no explanations", async () => {
  await enterModelMode();
  openPanel();

  // Os favoritos vêm antes dos provedores; a folha abre na aba do provedor da escolha.
  expect(tabs()).toEqual(["Favoritos", "Anthropic", "OpenAI", "OpenRouter"]);
  expect(tab("Anthropic")).toHaveAttribute("aria-pressed", "true");
  expect(tab("OpenAI")).toHaveAttribute("aria-pressed", "false");
  expect(tab("Favoritos")).toHaveAttribute("aria-pressed", "false");

  expect(models()).toEqual(["Opus 5.5", "Sonnet 5.5"]);
  expect(within(screen.getByRole("group", { name: "Modelos" })).getByRole("button", { name: "Sonnet 5.5" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("searchbox", { name: "Buscar modelo" })).toHaveValue("");

  const effort = screen.getByRole("group", { name: "Esforço" });
  expect(within(effort).getAllByRole("button").map((button) => button.textContent)).toEqual(["Baixo", "Médio", "Alto", "Máximo"]);
  expect(within(effort).getByRole("button", { name: "Médio" })).toHaveAttribute("aria-pressed", "true");
  // A escolha vale no toque: a folha não tem "Selecionar", título próprio nem descrições.
  expect(screen.queryByRole("button", { name: "Selecionar" })).toBeNull();
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Provedor", "Modelos", "Esforço"]);
});

test("a tab only shows its list; the choice changes when a model is tapped, at once, and stays after closing", async () => {
  await enterModelMode();
  openPanel();

  fireEvent.click(tab("OpenAI"));
  expect(tab("OpenAI")).toHaveAttribute("aria-pressed", "true");
  expect(models()).toEqual(["GPT 6.2 Sol", "GPT 6.2 Mini"]);
  // Olhar outro provedor não troca nada: nenhuma linha dele está marcada e a escolha guardada segue a mesma.
  expect(document.querySelector('[data-model-row][aria-pressed="true"]')).toBeNull();
  expect(savedChoice()).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" });

  fireEvent.click(screen.getByRole("button", { name: "GPT 6.2 Mini" }));
  fireEvent.click(screen.getByRole("button", { name: "Máximo" }));
  expect(savedChoice()).toEqual({ provider: "openai", model: "gpt-6.2-mini", effort: "max" });
  // Escolher não fecha a folha.
  expect(sheet()).toBeInTheDocument();

  closeSheet();
  expect(form()).toHaveAttribute("data-model-open", "false");
  expect(field()).toHaveFocus();
  expect(sheet()).toBeNull();

  // Aberta de novo, a folha começa na aba do provedor escolhido e mostra o que ficou.
  openPanel();
  expect(tab("OpenAI")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "GPT 6.2 Mini" })).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByRole("group", { name: "Esforço" })).getByRole("button", { name: "Máximo" })).toHaveAttribute("aria-pressed", "true");
});

test("the star keeps a model in the favorites tab, on the device, and picking there switches provider and model", async () => {
  await enterModelMode();
  openPanel();

  fireEvent.click(tab("Favoritos"));
  expect(models()).toEqual([]);
  expect(screen.getByText("Nenhum favorito ainda. Toque na estrela de um modelo para guardá-lo aqui.")).toBeInTheDocument();

  fireEvent.click(tab("Anthropic"));
  fireEvent.click(screen.getByRole("button", { name: "Favoritar: Opus 5.5" }));
  expect(screen.getByRole("button", { name: "Tirar dos favoritos: Opus 5.5" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(tab("OpenAI"));
  fireEvent.click(screen.getByRole("button", { name: "Favoritar: GPT 6.2 Mini" }));
  // Favoritar não escolhe.
  expect(savedChoice()).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" });
  expect(JSON.parse(window.localStorage.getItem(MODEL_FAVORITES_KEY) ?? "[]")).toEqual([
    { provider: "anthropic", model: "claude-opus-5-5" },
    { provider: "openai", model: "gpt-6.2-mini" },
  ]);

  // A aba de favoritos junta os provedores, na ordem em que foram guardados, e diz de quem é cada modelo.
  fireEvent.click(tab("Favoritos"));
  expect(models()).toEqual(["Opus 5.5, Anthropic", "GPT 6.2 Mini, OpenAI"]);
  fireEvent.click(screen.getByRole("button", { name: "GPT 6.2 Mini, OpenAI" }));
  expect(savedChoice()).toEqual({ provider: "openai", model: "gpt-6.2-mini", effort: "medium" });
  expect(screen.getByRole("button", { name: "GPT 6.2 Mini, OpenAI" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("button", { name: "Tirar dos favoritos: GPT 6.2 Mini" }));
  expect(models()).toEqual(["Opus 5.5, Anthropic"]);

  // Os favoritos ficam no aparelho: fechar e abrir a folha os mantém.
  closeSheet();
  openPanel();
  fireEvent.click(tab("Favoritos"));
  expect(models()).toEqual(["Opus 5.5, Anthropic"]);
});

test("a tap outside and Escape close the sheet, and the focus goes back to the text", async () => {
  await enterModelMode();

  openPanel();
  expect(overlay()).toHaveAttribute("data-open", "true");
  fireEvent.pointerDown(overlay() as HTMLElement);
  expect(form()).toHaveAttribute("data-model-open", "false");
  // Enquanto desce, a folha segue na página, mas fora da leitura.
  expect(overlay()).toHaveAttribute("data-open", "false");
  expect(sheet()).toBeNull();
  expect(field()).toHaveFocus();

  openPanel();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(form()).toHaveAttribute("data-model-open", "false");
  expect(field()).toHaveFocus();
});

test("a message goes with the picked model and its answer carries the footer", async () => {
  await enterModelMode();
  openPanel();
  fireEvent.click(tab("OpenAI"));
  fireEvent.click(screen.getByRole("button", { name: "GPT 6.2 Sol" }));
  fireEvent.click(screen.getByRole("button", { name: "Alto" }));
  closeSheet();

  ask("o que tenho amanhã?");
  await waitFor(() => expect(modelPosts()).toHaveLength(1));
  expect(modelPosts()[0]?.body).toMatchObject({
    text: "o que tenho amanhã?",
    model: { provider: "openai", model: "gpt-6.2-sol", effort: "high" },
  });
  expect(await screen.findByText("Falando com GPT 6.2 Sol…")).toBeInTheDocument();

  const id = [...api.store.table<RequestDto>("requests").keys()][0] as string;
  advanceRequest(api, id, { status: "done", message: "Amanhã você tem dentista." });
  const log = screen.getByRole("log");
  await waitFor(() => expect(within(log).getByText("Amanhã você tem dentista.")).toBeInTheDocument());
  expect(within(log).getByText("gpt 6.2 sol · alto · openai")).toBeInTheDocument();
});

test("only the providers with a key are offered, and a saved choice outside the options is corrected", async () => {
  const options = modelOptionsFixture();
  api = createFakeApi({ areas: [requestsArea({ model: "on", modelOptions: { ...options, providers: [options.providers[0], options.providers[2]] as never } })] });
  net.authedFetch.mockImplementation(api.authedFetch);
  window.localStorage.setItem(MODEL_SELECTION_KEY, JSON.stringify({ current: { provider: "openrouter", model: "x", effort: "low" }, models: {} }));
  await enterModelMode("/modelo");
  openPanel();

  expect(tabs()).toEqual(["Favoritos", "Anthropic", "OpenRouter"]);
  expect(tab("OpenRouter")).toHaveAttribute("aria-pressed", "true");
  // O modelo desconhecido vira o padrao do provedor; o esforco guardado vale.
  expect(within(screen.getByRole("group", { name: "Modelos" })).getByRole("button", { name: "Gemini 4 Neon" })).toHaveAttribute("aria-pressed", "true");
  expect(within(screen.getByRole("group", { name: "Esforço" })).getByRole("button", { name: "Baixo" })).toHaveAttribute("aria-pressed", "true");
});

test("the search matches the name or the id inside the open tab, without accents or case", async () => {
  const router = [
    "google/gemini-4-neon:Google: Gemini 4 Neon", "x-ai/grok-4.7:SpaceXAI: Grok 4.7",
    "anthropic/claude-sonnet-5.5:Anthropic: Claude Sonnet 5.5", "anthropic/claude-opus-5.5:Anthropic: Claude Opus 5.5",
    "deepseek/deepseek-v4-pro:DeepSeek: DeepSeek V4 Pro", "qwen/qwen4-max:Qwen: Qwen4 Max",
    "z-ai/glm-5.3:Z.ai: GLM 5.3", "baidu/ernie-5.5:Baidu: ERNIÊ 5.5",
  ].map((entry) => {
    const [id, ...name] = entry.split(":");
    return { id: id as string, name: name.join(":").trim() };
  });
  const options = modelOptionsFixture();
  api = createFakeApi({ areas: [requestsArea({
    model: "on",
    modelOptions: { ...options, providers: options.providers.map((provider) => (provider.id === "openrouter" ? { ...provider, models: router } : provider)) },
  })] });
  net.authedFetch.mockImplementation(api.authedFetch);
  await enterModelMode("/openrouter");
  openPanel();

  const search = screen.getByRole("searchbox", { name: "Buscar modelo" });

  fireEvent.change(search, { target: { value: "CLAUDE" } });
  expect(models()).toEqual(["Anthropic: Claude Sonnet 5.5", "Anthropic: Claude Opus 5.5"]);
  fireEvent.change(search, { target: { value: "x-ai" } });
  expect(models()).toEqual(["SpaceXAI: Grok 4.7"]);
  fireEvent.change(search, { target: { value: "ernie" } });
  expect(models()).toEqual(["Baidu: ERNIÊ 5.5"]);
  fireEvent.change(search, { target: { value: "nada assim" } });
  expect(screen.getByText("Nenhum modelo com esse nome.")).toBeInTheDocument();

  // O "x" do campo limpa a busca, e trocar de aba também; a busca fica mesmo numa lista curta.
  fireEvent.click(screen.getByRole("button", { name: "Limpar a busca" }));
  expect(search).toHaveValue("");
  expect(models()).toHaveLength(8);
  fireEvent.change(search, { target: { value: "grok" } });
  fireEvent.click(tab("Anthropic"));
  expect(screen.getByRole("searchbox", { name: "Buscar modelo" })).toHaveValue("");
  expect(models()).toEqual(["Opus 5.5", "Sonnet 5.5"]);
});
