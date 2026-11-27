import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { createFakeApi } from "@/test/fake-api";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
const session = vi.hoisted(() => ({ state: { user: { userId: "user-1" }, ready: true } }));

vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));
vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => session.state,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const { AgendaScreen } = await import("./agenda-screen");

const TODAY = "2026-09-14";

const tasks = [
  taskFixture({ id: "ev-1", name: "Revisar proposta", kind: "common", status: "todo", priority: "medium", tags: ["trabalho"], startedAt: "2026-09-14T09:00:00-03:00", estimatedFinishAt: "2026-09-14T10:30:00-03:00" }),
  taskFixture({ id: "ev-2", name: "Almoço no escritório", kind: "meal", status: undefined, startedAt: "2026-09-14T12:30:00-03:00", estimatedFinishAt: "2026-09-14T13:30:00-03:00" }),
  taskFixture({ id: "ev-3", name: "Pesquisar voos para novembro", actor: "agent", kind: "request", status: "running", startedAt: "2026-09-14T09:48:00-03:00" }),
  taskFixture({ id: "ev-4", name: "Café da manhã", kind: "meal", status: "missed", startedAt: "2026-09-14T07:30:00-03:00", estimatedFinishAt: "2026-09-14T08:00:00-03:00" }),
  taskFixture({ id: "ev-5", name: "Plantão", kind: "common", status: "doing", startedAt: "2026-09-13T22:00:00-03:00", estimatedFinishAt: "2026-09-14T06:00:00-03:00" }),
  taskFixture({ id: "ev-6", name: "Entrega longa", kind: "common", status: "doing", longRunning: true, startedAt: "2026-09-14T08:00:00-03:00", estimatedFinishAt: "2026-09-30T18:00:00-03:00" }),
];

function dayOf(dayKey: string): HTMLElement {
  const section = document.querySelector<HTMLElement>(`[data-agenda-day="${dayKey}"]`);
  if (!section) throw new Error(`Dia ${dayKey} não está na tela`);
  return section;
}

/** Os caminhos das linhas de tarefa do dia, na ordem em que aparecem (cada linha de tarefa é um link). */
function taskHrefsOn(dayKey: string): string[] {
  return within(dayOf(dayKey)).getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  net.authedFetch.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

function installApi(seed = tasks, pageSize?: number) {
  const api = createFakeApi({ areas: [tasksArea], seed: { tasks: seed }, pageSize });
  net.authedFetch.mockImplementation(api.authedFetch);
  return api;
}

test("the agenda reads the window through the API client and follows every page", async () => {
  const api = installApi(tasks, 2);
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);

  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));
  expect(api.calls.filter((call) => call.pathname === "/api/tasks")).toHaveLength(3);
  expect(taskHrefsOn(TODAY)).toEqual([
    "/user-1/tarefas/ev-5",
    "/user-1/tarefas/ev-4",
    "/user-1/tarefas/ev-1",
    "/user-1/tarefas/ev-3",
    "/user-1/tarefas/ev-2",
  ]);
});

test("each task is drawn as the single row: the agent card, the reference dot and the missed status", async () => {
  installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));
  const today = within(dayOf(TODAY));

  expect(today.getByRole("button", { name: "Só agenda. Mudar status de “Almoço no escritório”" })).toBeInTheDocument();
  expect(today.getByRole("button", { name: "Não realizado. Mudar status de “Café da manhã”" })).toBeInTheDocument();
  expect(today.getByRole("img", { name: "Agente, executando" })).toBeInTheDocument();
  expect(today.getByText("há 12 min")).toBeInTheDocument();
  expect(today.getByText("Hoje, 09:00")).toBeInTheDocument();
  expect(today.getByText("#trabalho")).toBeInTheDocument();
  expect(today.getByText("1h30")).toBeInTheDocument();
});

test("an task that crosses midnight shows on the day it started and on the day it ends", async () => {
  installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));

  expect(within(dayOf("2026-09-13")).getByRole("link", { name: /Plantão/ })).toBeInTheDocument();
  expect(within(dayOf(TODAY)).getByRole("link", { name: /Plantão/ })).toBeInTheDocument();
});

test("long-running tasks and steps do not show in the agenda", async () => {
  installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));

  expect(screen.queryByRole("link", { name: /Entrega longa/ })).not.toBeInTheDocument();
});

test("the free windows between tasks stay, computed on the new data", async () => {
  window.localStorage.setItem("braid-agenda-free-time", "on");
  installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));

  expect(within(dayOf(TODAY)).getByRole("button", { name: "Planejar com o Hermes a janela livre das 10:30 às 12:30" })).toBeInTheDocument();
  expect(within(dayOf(TODAY)).getByRole("button", { name: "Planejar com o Hermes a janela livre das 13:30 às 24:00" })).toBeInTheDocument();
});

test("a day without tasks shows the empty state", async () => {
  installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));

  expect(within(dayOf("2026-09-15")).getByText("Um dia livre, do seu jeito.")).toBeInTheDocument();
});

test("the header shows today's date while the week strip stays", async () => {
  installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));

  expect(screen.getByRole("heading", { level: 1, name: "14 de setembro de 2026" })).toBeInTheDocument();
  expect(document.querySelector('button[aria-current="date"]')).not.toBeNull();
});

test("the loading note shows while the window loads and goes away after it", async () => {
  installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);

  expect(screen.getByText("Carregando sua agenda…")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Carregando sua agenda…")).not.toBeInTheDocument());
});

test("a failed load shows the error alert", async () => {
  const api = installApi();
  api.failNext("GET", "/api/tasks", 500);
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar a agenda. Tente novamente.");
});

test("free time counts only person tasks: an agent task inside a free window does not split it", async () => {
  window.localStorage.setItem("braid-agenda-free-time", "on");
  installApi([
    taskFixture({ id: "ev-a", name: "Revisar proposta", kind: "common", status: "todo", startedAt: "2026-09-14T09:00:00-03:00", estimatedFinishAt: "2026-09-14T10:30:00-03:00" }),
    taskFixture({ id: "ev-g", name: "Agente compila o briefing", actor: "agent", kind: "request", status: "running", startedAt: "2026-09-14T11:00:00-03:00", estimatedFinishAt: "2026-09-14T11:30:00-03:00" }),
    taskFixture({ id: "ev-b", name: "Almoço no escritório", kind: "meal", status: undefined, startedAt: "2026-09-14T12:30:00-03:00", estimatedFinishAt: "2026-09-14T13:30:00-03:00" }),
  ]);
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(3));

  const freeWindows = within(dayOf(TODAY)).getAllByRole("button", { name: /Planejar com o Hermes a janela livre/ });
  expect(freeWindows.map((button) => button.getAttribute("aria-label"))).toEqual([
    "Planejar com o Hermes a janela livre das 10:30 às 12:30",
    "Planejar com o Hermes a janela livre das 13:30 às 24:00",
  ]);
  expect(within(dayOf(TODAY)).getByText("Livre")).toBeInTheDocument();
  expect(within(dayOf(TODAY)).getByTitle("Tempo livre: 120 min")).toBeInTheDocument();
});

test("tapping the dot of a reference task opens the seven person statuses", async () => {
  installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));

  fireEvent.click(within(dayOf(TODAY)).getByRole("button", { name: "Só agenda. Mudar status de “Almoço no escritório”" }));

  const list = screen.getByRole("listbox", { name: "Status da tarefa" });
  expect(within(list).getAllByRole("option").map((option) => option.textContent)).toEqual([
    "A fazer", "Sem data", "Em curso", "Em espera", "Feito", "Cancelado", "Não realizado",
  ]);
});

test("choosing a status sends the edit with the revision read, and the row shows the new glyph", async () => {
  const api = installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));

  fireEvent.click(within(dayOf(TODAY)).getByRole("button", { name: "Só agenda. Mudar status de “Almoço no escritório”" }));
  fireEvent.click(screen.getByRole("option", { name: "Feito" }));

  await waitFor(() => expect(api.calls.filter((call) => call.method === "PATCH")).toHaveLength(1));
  expect(api.calls.find((call) => call.method === "PATCH")).toMatchObject({
    pathname: "/api/tasks/ev-2",
    body: { expectedRevision: 1, status: "done", finishedAt: expect.stringMatching(/^2026-09-14T13:00:00\.\d{3}Z$/) },
  });
  await waitFor(() => expect(within(dayOf(TODAY)).getByRole("button", { name: "Feito. Mudar status de “Almoço no escritório”" })).toBeInTheDocument());
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});

test("a stale revision warns and reloads the agenda", async () => {
  const api = installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));
  const agendaReads = () => api.calls.filter((call) => call.method === "GET" && call.pathname === "/api/tasks").length;
  const readsBefore = agendaReads();

  api.failNext("PATCH", "/api/tasks/ev-2", 409);
  fireEvent.click(within(dayOf(TODAY)).getByRole("button", { name: "Só agenda. Mudar status de “Almoço no escritório”" }));
  fireEvent.click(screen.getByRole("option", { name: "Em curso" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Esta tarefa mudou em outro lugar. Carregamos a versão atual; confira e tente de novo.");
  await waitFor(() => expect(agendaReads()).toBeGreaterThan(readsBefore));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(within(dayOf(TODAY)).getByRole("button", { name: "Só agenda. Mudar status de “Almoço no escritório”" })).toBeInTheDocument();
});

test("a refused status change shows the retry message and keeps the row as it was", async () => {
  const api = installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));

  api.failNext("PATCH", "/api/tasks/ev-2", 500);
  fireEvent.click(within(dayOf(TODAY)).getByRole("button", { name: "Só agenda. Mudar status de “Almoço no escritório”" }));
  fireEvent.click(screen.getByRole("option", { name: "Em curso" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível trocar o status. Tente novamente.");
  expect(within(dayOf(TODAY)).getByRole("button", { name: "Só agenda. Mudar status de “Almoço no escritório”" })).toBeInTheDocument();
});

/** Quantas leituras da agenda saíram para a rede até agora. */
function agendaReads(api: ReturnType<typeof installApi>) {
  return () => api.calls.filter((call) => call.method === "GET" && call.pathname === "/api/tasks").length;
}

test("com tarefa de agente em aberto, a agenda se relê sozinha e a linha vira 'Agente, feito'", async () => {
  const api = installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));
  expect(within(dayOf(TODAY)).getByRole("img", { name: "Agente, executando" })).toBeInTheDocument();

  const table = api.store.table<TaskDto>("tasks");
  table.set("ev-3", { ...(table.get("ev-3") as TaskDto), status: "done" });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

  await waitFor(() => expect(within(dayOf(TODAY)).getByRole("img", { name: "Agente, feito" })).toBeInTheDocument());
  expect(within(dayOf(TODAY)).queryByRole("img", { name: "Agente, executando" })).not.toBeInTheDocument();
});

test("sem tarefa de agente em aberto, a agenda não se relê em intervalo", async () => {
  const api = installApi(tasks.map((task) => (task.id === "ev-3" ? { ...task, status: "done" as const } : task)));
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));
  const reads = agendaReads(api);
  const before = reads();

  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });

  expect(reads()).toBe(before);
});

test("a recarga troca os dados sem o carregando e mantém a mesma linha na tela", async () => {
  const api = installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));
  const rowBefore = within(dayOf(TODAY)).getByRole("img", { name: "Agente, executando" }).closest("li");

  const loadingSeen: boolean[] = [];
  const observer = new MutationObserver(() => loadingSeen.push(screen.queryByText("Carregando sua agenda…") !== null));
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  const table = api.store.table<TaskDto>("tasks");
  table.set("ev-3", { ...(table.get("ev-3") as TaskDto), status: "done" });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  await waitFor(() => expect(within(dayOf(TODAY)).getByRole("img", { name: "Agente, feito" })).toBeInTheDocument());
  observer.disconnect();

  expect(loadingSeen.some(Boolean)).toBe(false);
  expect(within(dayOf(TODAY)).getByRole("img", { name: "Agente, feito" }).closest("li")).toBe(rowBefore);
});

test("uma releitura que falha mantém a agenda na tela, sem o aviso de erro", async () => {
  const api = installApi();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);
  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5));

  api.failNext("GET", "/api/tasks", 500);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(5);
});

test("as linhas da agenda mostram a marca e o nome do projeto", async () => {
  installApi([
    taskFixture({ id: "ev-1", name: "Revisar proposta", status: "todo", startedAt: "2026-09-14T09:00:00-03:00", estimatedFinishAt: "2026-09-14T10:00:00-03:00", project: { id: "p-tp", name: "timeline_project", personal: false } }),
    taskFixture({ id: "ev-2", name: "Almoço", kind: "meal", status: undefined, startedAt: "2026-09-14T12:30:00-03:00", estimatedFinishAt: "2026-09-14T13:30:00-03:00" }),
  ]);
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);

  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(2));
  const lines = [...dayOf(TODAY).querySelectorAll("[data-project-line]")].map((line) => line.textContent);
  expect(lines).toEqual(["TPtimeline_project", "PEpersonal"]);
});
