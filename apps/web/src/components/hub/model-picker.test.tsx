import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { RequestDto } from "@repo/contracts";
import { beforeEach, expect, test, vi } from "vitest";
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

const picker = () => screen.getByRole("button", { name: /^Modelo .*\. Trocar$/ });
const scrim = () => document.querySelector<HTMLElement>("button[tabindex='-1'][aria-hidden='true']");

async function enterModelMode(command = "/claude") {
  render(<Harness />);
  ask(command);
  await waitFor(() => expect(screen.getByRole("button", { name: /Trocar$/ })).toBeInTheDocument());
}

beforeEach(() => {
  window.localStorage.clear();
  api = createFakeApi({ areas: [requestsArea({ model: "on" })] });
  net.authedFetch.mockReset();
  net.authedFetch.mockImplementation(api.authedFetch);
  session.user = { userId: "user-1" };
});

test("the picker only exists in model mode; the header names the mode", async () => {
  render(<Harness />);
  expect(screen.queryByRole("button", { name: /Trocar$/ })).toBeNull();

  ask("/claude");
  await waitFor(() => expect(picker()).toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "Conversa" }).parentElement).toHaveTextContent("Modelo");
  expect(screen.getByText("Agora você está falando com Sonnet 5.5 (Anthropic). Escreva /app para voltar ao assistente da agenda.")).toBeInTheDocument();

  ask("/app");
  await waitFor(() => expect(screen.queryByRole("button", { name: /Trocar$/ })).toBeNull());
});

test("the picker shows the model, the effort and the provider, and starts closed", async () => {
  await enterModelMode();

  const button = picker();
  expect(button).toHaveAccessibleName("Modelo Sonnet 5.5, esforço médio, via Anthropic. Trocar");
  expect(button).toHaveAttribute("aria-expanded", "false");
  expect(button).toHaveTextContent("Sonnet 5.5 · Médio");
  expect(button).toHaveTextContent("via anthropic");
  // Fechado, o painel nao e lido nem recebe foco.
  expect(screen.queryByRole("button", { name: "Selecionar" })).toBeNull();
  expect(button.closest("form")).toHaveAttribute("data-model-open", "false");
});

test("opening the picker shows the four blocks with the current choice and no explanations", async () => {
  await enterModelMode();
  fireEvent.click(picker());

  expect(picker()).toHaveAttribute("aria-expanded", "true");
  expect(picker().closest("form")).toHaveAttribute("data-model-open", "true");
  const providers = screen.getByRole("group", { name: "Provedor" });
  expect(within(providers).getAllByRole("button").map((button) => button.textContent)).toEqual(["Anthropic", "OpenAI", "OpenRouter"]);
  expect(within(providers).getByRole("button", { name: "Anthropic" })).toHaveAttribute("aria-pressed", "true");
  expect(within(providers).getByRole("button", { name: "OpenAI" })).toHaveAttribute("aria-pressed", "false");

  const models = screen.getByRole("group", { name: "Modelo" });
  expect(within(models).getAllByRole("button").map((button) => button.textContent)).toEqual(["Opus 5.5", "Sonnet 5.5"]);
  expect(within(models).getByRole("button", { name: "Sonnet 5.5" })).toHaveAttribute("aria-pressed", "true");

  const effort = screen.getByRole("group", { name: "Esforço" });
  expect(within(effort).getAllByRole("button").map((button) => button.textContent)).toEqual(["Baixo", "Médio", "Alto", "Máximo"]);
  expect(within(effort).getByRole("button", { name: "Médio" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Selecionar" })).toBeInTheDocument();
  // O painel de escolha nao tem titulo proprio nem descricoes.
  expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["Provedor", "Modelo", "Esforço"]);
});

test("picks apply at once: the picker, the models list and the saved choice follow, and Selecionar only closes", async () => {
  await enterModelMode();
  fireEvent.click(picker());

  fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
  expect(picker()).toHaveAccessibleName("Modelo GPT 6.2 Sol, esforço médio, via OpenAI. Trocar");
  const models = screen.getByRole("group", { name: "Modelo" });
  expect(within(models).getAllByRole("button").map((button) => button.textContent)).toEqual(["GPT 6.2 Sol", "GPT 6.2 Mini"]);

  fireEvent.click(within(models).getByRole("button", { name: "GPT 6.2 Mini" }));
  fireEvent.click(screen.getByRole("button", { name: "Máximo" }));
  expect(picker()).toHaveAccessibleName("Modelo GPT 6.2 Mini, esforço máximo, via OpenAI. Trocar");
  expect(picker()).toHaveTextContent("GPT 6.2 Mini · Máximo");
  expect(picker()).toHaveTextContent("via openai");
  expect(JSON.parse(window.localStorage.getItem(MODEL_SELECTION_KEY) ?? "{}").current).toEqual({
    provider: "openai",
    model: "gpt-6.2-mini",
    effort: "max",
  });

  fireEvent.click(screen.getByRole("button", { name: "Selecionar" }));
  expect(picker()).toHaveAttribute("aria-expanded", "false");
  expect(picker()).toHaveFocus();
  expect(screen.queryByRole("button", { name: "Selecionar" })).toBeNull();
  expect(picker()).toHaveTextContent("GPT 6.2 Mini · Máximo");
});

test("the scrim and Escape close the panel, and Escape returns the focus to the picker", async () => {
  await enterModelMode();

  fireEvent.click(picker());
  expect(scrim()).toHaveAttribute("data-open", "true");
  fireEvent.click(scrim() as HTMLElement);
  expect(picker()).toHaveAttribute("aria-expanded", "false");
  expect(scrim()).toHaveAttribute("data-open", "false");

  fireEvent.click(picker());
  fireEvent.keyDown(window, { key: "Escape" });
  expect(picker()).toHaveAttribute("aria-expanded", "false");
  expect(picker()).toHaveFocus();

  // Tocar no botao de novo tambem fecha.
  fireEvent.click(picker());
  fireEvent.click(picker());
  expect(picker()).toHaveAttribute("aria-expanded", "false");
});

test("a message goes with the picked model and its answer carries the footer", async () => {
  await enterModelMode();
  fireEvent.click(picker());
  fireEvent.click(screen.getByRole("button", { name: "OpenAI" }));
  fireEvent.click(screen.getByRole("button", { name: "Alto" }));
  fireEvent.click(screen.getByRole("button", { name: "Selecionar" }));

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

  // O modelo desconhecido vira o padrao do provedor; o esforco guardado vale.
  expect(picker()).toHaveAccessibleName("Modelo Gemini 4 Neon, esforço baixo, via OpenRouter. Trocar");
  fireEvent.click(picker());
  const providers = screen.getByRole("group", { name: "Provedor" });
  expect(within(providers).getAllByRole("button").map((button) => button.textContent)).toEqual(["Anthropic", "OpenRouter"]);
});

test("a long list gets a search that matches the name or the id, without accents or case", async () => {
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
  fireEvent.click(picker());

  const search = screen.getByRole("searchbox", { name: "Buscar modelo" });
  const models = () => within(screen.getByRole("group", { name: "Modelo" })).getAllByRole("button").map((button) => button.textContent);

  fireEvent.change(search, { target: { value: "CLAUDE" } });
  expect(models()).toEqual(["Anthropic: Claude Sonnet 5.5", "Anthropic: Claude Opus 5.5"]);
  fireEvent.change(search, { target: { value: "x-ai" } });
  expect(models()).toEqual(["SpaceXAI: Grok 4.7"]);
  fireEvent.change(search, { target: { value: "ernie" } });
  expect(models()).toEqual(["Baidu: ERNIÊ 5.5"]);
  fireEvent.change(search, { target: { value: "nada assim" } });
  expect(screen.getByText("Nenhum modelo encontrado.")).toBeInTheDocument();

  // Trocar de provedor limpa a busca; a lista curta nao tem busca.
  fireEvent.click(within(screen.getByRole("group", { name: "Provedor" })).getByRole("button", { name: /Anthropic/ }));
  expect(screen.queryByRole("searchbox", { name: "Buscar modelo" })).toBeNull();
});
