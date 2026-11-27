import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { createFakeApi } from "@/test/fake-api";
import { projectsArea } from "@/test/fake-api/projects";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";

const route = vi.hoisted(() => ({ pathname: "/user-1/tarefas" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/session/use-session", () => ({ signOut: vi.fn(), useCurrentUser: () => null }));
// O chat tem os proprios testes; aqui so interessa quando o painel abre.
vi.mock("@/components/hub/agent-chat-panel", () => ({
  AgentChatPanel: () => <textarea aria-label="Mensagem para a IA" />,
  agentEntityHref: () => "#",
  useAgendaChat: () => ({ chat: { ready: true, startNewConversation: () => {} }, signedOut: true }),
}));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { AppShell } = await import("./app-shell");

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  net.authedFetch.mockReset();
  route.pathname = "/user-1/tarefas";
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

const TP = { id: "project-tp", name: "timeline_project", personal: false };

/** Uma execução de agente; `minute` define o início (quanto maior, mais recente). */
function run(id: string, name: string, minute: number, overrides: Partial<TaskDto> = {}): TaskDto {
  return taskFixture({
    id,
    name,
    actor: "agent",
    kind: "request",
    status: "running",
    startedAt: `2026-09-14T09:${String(minute).padStart(2, "0")}:00-03:00`,
    ...overrides,
  });
}

const FIVE: TaskDto[] = [
  run("r1", "Primeira execução", 10),
  run("r2", "Segunda execução", 20, { status: "queued" }),
  run("r3", "Terceira execução", 30, { status: "starting", project: TP }),
  run("r4", "Quarta execução", 40, { status: "preparing" }),
  run("r5", "Quinta execução", 50),
];

function serve(tasks: TaskDto[]) {
  const api = createFakeApi({ areas: [tasksArea, projectsArea], seed: { tasks } });
  net.authedFetch.mockImplementation(api.authedFetch);
  return api;
}

function mount() {
  return render(<AppShell userId="user-1">conteúdo</AppShell>);
}

const drawer = () => screen.queryByRole("region", { name: "Em andamento" });
const rowTitles = () => within(drawer() as HTMLElement).queryAllByRole("link").map((link) => link.textContent);

async function drawerReady() {
  return await screen.findByRole("region", { name: "Em andamento" });
}

test("sem execução em andamento a gaveta não existe", async () => {
  const api = serve([taskFixture({ id: "h1", name: "Minha tarefa", status: "doing" }), run("feita", "Já terminou", 5, { status: "completed" })]);
  mount();
  await waitFor(() => expect(api.calls.some((call) => call.pathname === "/api/tasks/tracked")).toBe(true));
  await act(async () => {});
  expect(drawer()).toBeNull();
});

test("lê a lista acompanhada pedindo só o executor agente e os status em andamento", async () => {
  const api = serve(FIVE);
  mount();
  await drawerReady();
  const call = api.calls.find((entry) => entry.pathname === "/api/tasks/tracked");
  expect(call?.query.actor).toBe("agent");
  expect(call?.query.status?.split(",").sort()).toEqual(["preparing", "queued", "running", "starting"]);
});

test("com cinco execuções mostra o cabeçalho com a contagem, três linhas e +2, da mais recente para a mais antiga", async () => {
  serve(FIVE);
  mount();
  const region = await drawerReady();

  const header = within(region).getByRole("button", { name: /5 tarefas de agente em andamento/ });
  expect(header).toHaveAttribute("aria-expanded", "false");
  expect(header).toHaveTextContent("Em andamento");
  expect(header).toHaveTextContent("5");
  expect(header).toHaveTextContent("+2");
  expect(rowTitles()).toHaveLength(3);
  expect(rowTitles()[0]).toContain("Quinta execução");
  expect(rowTitles()[1]).toContain("Quarta execução");
  expect(rowTitles()[2]).toContain("Terceira execução");
  expect(region).toHaveAttribute("data-mode", "three");
});

test("a linha traz a marca do projeto com o nome dele, o título e o nome e o ícone do status; tocar abre o detalhe do pedido", async () => {
  serve([run("r3", "Terceira execução", 30, { status: "starting", project: TP })]);
  mount();
  const region = await drawerReady();

  const link = within(region).getByRole("link", { name: /Terceira execução/ });
  expect(link).toHaveAttribute("href", "/user-1/tarefas/r3");
  expect(within(link).getByRole("img", { name: "timeline_project" })).toBeInTheDocument();
  expect(within(link).getByRole("img", { name: "Agente, iniciando" })).toBeInTheDocument();
  expect(link).toHaveTextContent("Iniciando");
});

test("tocar no cabeçalho mostra as cinco e tocar de novo volta a três; as linhas escondidas não recebem foco nem são lidas", async () => {
  serve(FIVE);
  mount();
  const region = await drawerReady();

  const hiddenRow = () => screen.getByText("Segunda execução", { selector: "span" }).closest("li") as HTMLElement;
  expect(hiddenRow()).toHaveAttribute("aria-hidden", "true");
  expect(hiddenRow()).toHaveAttribute("inert");
  expect(screen.queryByRole("link", { name: /Segunda execução/ })).toBeNull();

  fireEvent.click(within(region).getByRole("button", { name: /Mostrar todas/ }));
  expect(rowTitles()).toHaveLength(5);
  expect(region).toHaveAttribute("data-mode", "all");
  const header = within(region).getByRole("button", { name: /Mostrar só três/ });
  expect(header).toHaveAttribute("aria-expanded", "true");
  expect(header).not.toHaveTextContent("+2");
  expect(hiddenRow()).not.toHaveAttribute("inert");

  fireEvent.click(header);
  expect(rowTitles()).toHaveLength(3);
  expect(region).toHaveAttribute("data-mode", "three");
  expect(hiddenRow()).toHaveAttribute("inert");
});

test("a seta dupla recolhe a uma linha com a execução mais recente e tocar nela volta a três", async () => {
  serve(FIVE);
  mount();
  const region = await drawerReady();

  fireEvent.click(within(region).getByRole("button", { name: "Mostrar só a tarefa mais recente" }));
  expect(region).toHaveAttribute("data-mode", "one");
  // Só a execução mais recente fica à vista, com a contagem das demais; o cabeçalho sai do foco.
  expect(within(region).queryAllByRole("link")).toHaveLength(0);
  const collapsed = within(region).getByRole("button", { name: /5 tarefas de agente em andamento.*Quinta execução.*Mostrar três/ });
  expect(region).toHaveTextContent("+4");
  expect(within(region).queryByRole("button", { name: /Mostrar todas/ })).toBeNull();

  fireEvent.click(collapsed);
  expect(region).toHaveAttribute("data-mode", "three");
  expect(rowTitles()).toHaveLength(3);
});

test("com uma só execução não há +N na linha recolhida", async () => {
  serve([run("r1", "Única", 10)]);
  mount();
  const region = await drawerReady();
  expect(region).not.toHaveTextContent("+");
  fireEvent.click(within(region).getByRole("button", { name: "Mostrar só a tarefa mais recente" }));
  expect(region).not.toHaveTextContent("+0");
});

test("passos e execuções agendadas não entram na gaveta", async () => {
  serve([
    run("a", "Pedido do chat", 10),
    run("s", "Passo do pedido", 20, { kind: "step" }),
    run("c", "Resumo diário", 30, { kind: "cron" }),
  ]);
  mount();
  const region = await drawerReady();
  expect(rowTitles()).toHaveLength(1);
  expect(within(region).getByRole("link", { name: /Pedido do chat/ })).toBeInTheDocument();
  expect(within(region).getByRole("button", { name: /1 tarefa de agente em andamento/ })).toBeInTheDocument();
});

test("a execução que termina sai da gaveta na releitura seguinte e, sem nenhuma, a gaveta some", async () => {
  const api = serve([run("r1", "Primeira", 10), run("r2", "Segunda", 20)]);
  mount();
  await drawerReady();
  expect(rowTitles()).toHaveLength(2);

  const tasks = api.store.table<TaskDto>("tasks");
  tasks.set("r2", { ...(tasks.get("r2") as TaskDto), status: "completed" });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await waitFor(() => expect(rowTitles()).toHaveLength(1));

  tasks.set("r1", { ...(tasks.get("r1") as TaskDto), status: "waiting" });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await waitFor(() => expect(drawer()).toBeNull());
});

test("relê a cada 3 s enquanto há execução; parada, relê ao voltar ao foco, quando o cliente abre um pedido e a cada 30 s", async () => {
  const api = serve([run("r1", "Primeira", 10)]);
  const reads = () => api.calls.filter((call) => call.pathname === "/api/tasks/tracked").length;
  mount();
  await drawerReady();
  const afterFirst = reads();

  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(reads()).toBe(afterFirst + 1);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(reads()).toBe(afterFirst + 2);

  // Termina: a releitura seguinte esvazia a gaveta e a batida passa a ser de 30 s.
  const tasks = api.store.table<TaskDto>("tasks");
  tasks.set("r1", { ...(tasks.get("r1") as TaskDto), status: "completed" });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await waitFor(() => expect(drawer()).toBeNull());
  const idle = reads();

  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
  expect(reads()).toBe(idle);
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(reads()).toBe(idle + 1);

  await act(async () => { window.dispatchEvent(new Event("focus")); });
  await waitFor(() => expect(reads()).toBe(idle + 2));

  const { REQUEST_STARTED_SIGNAL } = await import("@/lib/api/requests");
  await act(async () => { window.dispatchEvent(new Event(REQUEST_STARTED_SIGNAL)); });
  await waitFor(() => expect(reads()).toBe(idle + 3));
});

test("aparece em Tarefas, Agenda e Documentos com a mesma altura escolhida e não aparece no detalhe, na edição nem no chat", async () => {
  serve(FIVE);
  const { rerender } = mount();
  const region = await drawerReady();
  fireEvent.click(within(region).getByRole("button", { name: /Mostrar todas/ }));
  const tab = () => rerender(<AppShell userId="user-1">conteúdo</AppShell>);

  for (const pathname of ["/user-1", "/user-1/notas", "/user-1/tarefas"]) {
    route.pathname = pathname;
    tab();
    expect(await drawerReady()).toHaveAttribute("data-mode", "all");
    expect(rowTitles()).toHaveLength(5);
  }

  for (const pathname of ["/user-1/tarefas/r1", "/user-1/tarefas/r1/editar", "/user-1/tarefas/nova", "/user-1/notas/n1", "/user-1/notas/nova"]) {
    route.pathname = pathname;
    tab();
    expect(drawer()).toBeNull();
  }

  route.pathname = "/user-1/notas";
  tab();
  expect(await drawerReady()).toHaveAttribute("data-mode", "all");

  // O chat (painel Buscar e criar) cobre a tela: a gaveta sai de vista e volta quando ele fecha.
  const chatButton = screen.getAllByRole("button", { name: "Buscar e criar" }).find((button) => button.hasAttribute("aria-controls")) as HTMLElement;
  fireEvent.click(chatButton);
  expect(drawer()).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Fechar chat com IA", hidden: true })[0]);
  expect(await drawerReady()).toHaveAttribute("data-mode", "all");
});

test("a altura escolhida fica guardada no aparelho e o padrão é três", async () => {
  serve(FIVE);
  const first = mount();
  const region = await drawerReady();
  expect(region).toHaveAttribute("data-mode", "three");
  fireEvent.click(within(region).getByRole("button", { name: /Mostrar todas/ }));
  expect(window.localStorage.getItem("braid-execution-drawer")).toBe("all");
  first.unmount();

  mount();
  expect(await drawerReady()).toHaveAttribute("data-mode", "all");
});

test("a tela reserva no fim a altura da gaveta: uma linha de 44 px, ou o cabeçalho mais as linhas à mostra", async () => {
  serve(FIVE);
  mount();
  const region = await drawerReady();
  const host = region.closest("[data-execution-host]") as HTMLElement;
  expect(host.style.getPropertyValue("--exec-rows")).toBe("3");
  expect(host.querySelector("[data-execution-spacer]")).not.toBeNull();

  fireEvent.click(within(region).getByRole("button", { name: /Mostrar todas/ }));
  expect(host.style.getPropertyValue("--exec-rows")).toBe("5");

  fireEvent.click(within(region).getByRole("button", { name: "Mostrar só a tarefa mais recente" }));
  expect(host.style.getPropertyValue("--exec-rows")).toBe("1");
  expect(host).toHaveAttribute("data-mode", "one");
});

test("a gaveta cresce com a marca de crescimento e encolhe sem ela", async () => {
  serve(FIVE);
  mount();
  const region = await drawerReady();
  expect(region).not.toHaveAttribute("data-grow");
  fireEvent.click(within(region).getByRole("button", { name: /Mostrar todas/ }));
  expect(region).toHaveAttribute("data-grow");
  fireEvent.click(within(region).getByRole("button", { name: /Mostrar só três/ }));
  expect(region).not.toHaveAttribute("data-grow");
});

test("a gaveta não existe sem usuário (telas de mockup)", async () => {
  const api = serve(FIVE);
  render(<AppShell>conteúdo</AppShell>);
  await act(async () => {});
  expect(drawer()).toBeNull();
  expect(api.calls.some((call) => call.pathname === "/api/tasks/tracked")).toBe(false);
});

/** Dá à gaveta um lugar na janela (jsdom não tem layout): ela ocupa `height` px acima do pé de 800 px. */
function placeDock(box: { top: number; height: number }) {
  const original = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this.parentElement?.hasAttribute("data-execution-host") && this.querySelector("[data-execution-drawer]")
      ? ({ ...box, bottom: box.top + box.height, left: 0, right: 0, width: 0, x: 0, y: box.top, toJSON: () => ({}) } as DOMRect)
      : original.call(this);
  });
}

test("a gaveta publica o quanto cobre do pé da tela, acompanha a altura e tira a medida ao sumir", async () => {
  const observers: Array<() => void> = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(800);
  const box = { top: 600, height: 200 };
  placeDock(box);
  serve(FIVE);
  const { unmount } = mount();
  await drawerReady();

  const clearance = () => document.documentElement.style.getPropertyValue("--execution-clearance");
  expect(clearance()).toBe("200px");

  // A gaveta cresce (de três para todas): a medida acompanha.
  box.top = 480;
  act(() => observers.forEach((callback) => callback()));
  expect(clearance()).toBe("320px");

  unmount();
  expect(clearance()).toBe("");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("sem execução em andamento nenhuma medida é publicada", async () => {
  const api = serve([taskFixture({ id: "h1", name: "Minha tarefa", status: "doing" })]);
  mount();
  await waitFor(() => expect(api.calls.some((call) => call.pathname === "/api/tasks/tracked")).toBe(true));
  await act(async () => {});
  expect(document.documentElement.style.getPropertyValue("--execution-clearance")).toBe("");
});
