import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { type FakeApi, createFakeApi } from "@/test/fake-api";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn(), replace: vi.fn() }) }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { default: TaskPage } = await import("./page");

const OPEN = "Preparar a viagem";

/** A tarefa aberta: uma revisão de pessoa que se segue ao alerta de um agente e antecede uma tarefa de agente. */
function opened(overrides: Partial<TaskDto> = {}): TaskDto {
  return taskFixture({
    id: "ev-1",
    name: OPEN,
    kind: "common",
    status: "doing",
    startedAt: "2026-11-14T09:00:00-03:00",
    previousTaskIds: ["prev-1"],
    nextTaskIds: ["next-1", "next-2"],
    ...overrides,
  });
}

/** Antecessor: a tarefa de agente que monitora a aplicação e abriu a revisão. */
const PREVIOUS = taskFixture({
  id: "prev-1",
  actor: "agent",
  kind: "request",
  status: "done",
  name: "Monitorar a aplicação",
  startedAt: "2026-11-14T08:00:00-03:00",
  nextTaskIds: ["ev-1"],
});

const NEXT = [
  taskFixture({ id: "next-1", name: "Arrumar a mala", kind: "common", status: "todo", startedAt: "2026-11-15T07:00:00-03:00", previousTaskIds: ["ev-1"] }),
  taskFixture({ id: "next-2", actor: "agent", kind: "request", status: "queued", name: "Aplicar o conserto", startedAt: "2026-11-14T09:50:00-03:00", previousTaskIds: ["ev-1"] }),
];

let api: FakeApi;

function install(tasks: TaskDto[]) {
  api = createFakeApi({ areas: [tasksArea], seed: { tasks: tasks } });
  net.authedFetch.mockImplementation(api.authedFetch);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-11-14T10:00:00-03:00"));
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage() {
  return render(<TaskPage params={Promise.resolve({ userId: "user-1", taskId: "ev-1" })} />);
}

/** Espera a seção sair do estado de carregamento. */
async function loaded() {
  await waitFor(() => expect(screen.queryByText(/Carregando/)).not.toBeInTheDocument());
}

test("a seção Sequência mostra “Segue-se de” e “Da sequência a”, cada tarefa com nome, tipo e quando", async () => {
  install([opened(), PREVIOUS, ...NEXT]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Sequência" });
  const previous = within(section).getByRole("list", { name: "Segue-se de" });
  expect(within(previous).getByRole("link", { name: /Monitorar a aplicação/ })).toHaveAttribute("href", "/user-1/tarefas/prev-1");
  expect(within(previous).getByText("request")).toBeInTheDocument();

  const next = within(section).getByRole("list", { name: "Da sequência a" });
  expect(within(next).getByRole("link", { name: /Arrumar a mala/ })).toHaveAttribute("href", "/user-1/tarefas/next-1");
  expect(within(next).getByText("common")).toBeInTheDocument();
  expect(within(next).getByText("Amanhã, 07:00")).toBeInTheDocument();
});

test("as duas pontas podem ser tarefa de agente, e o glifo mostra o status delas", async () => {
  install([opened(), PREVIOUS, ...NEXT]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Sequência" });
  const previous = within(section).getByRole("list", { name: "Segue-se de" });
  expect(within(previous).getByRole("link", { name: /Monitorar a aplicação/ })).toBeInTheDocument();
  expect(within(previous).getByRole("img", { name: "Agente, feito" })).toBeInTheDocument();

  const next = within(section).getByRole("list", { name: "Da sequência a" });
  expect(within(next).getByRole("link", { name: /Aplicar o conserto/ })).toHaveAttribute("href", "/user-1/tarefas/next-2");
  expect(within(next).getByRole("img", { name: "Agente, na fila" })).toBeInTheDocument();
  expect(within(next).getByText("na fila · há 10 min")).toBeInTheDocument();
});

test("a sequência é informativa: não há “Espera por”, nem botão de status, nem escrita", async () => {
  install([opened({ status: "inHold" }), PREVIOUS, ...NEXT]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Sequência" });
  expect(screen.queryByText(/Espera por/)).not.toBeInTheDocument();
  expect(within(section).queryByRole("button")).not.toBeInTheDocument();
  expect(api.calls.filter((call) => call.method !== "GET")).toHaveLength(0);
});

test("com um lado só, só ele aparece", async () => {
  install([opened({ previousTaskIds: [] }), ...NEXT]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Sequência" });
  expect(within(section).queryByText("Segue-se de")).not.toBeInTheDocument();
  expect(within(section).getByRole("list", { name: "Da sequência a" })).toBeInTheDocument();
});

test("só os antecessores: aparece só “Segue-se de”", async () => {
  install([opened({ nextTaskIds: [] }), PREVIOUS]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Sequência" });
  expect(within(section).getByRole("list", { name: "Segue-se de" })).toBeInTheDocument();
  expect(within(section).queryByText("Da sequência a")).not.toBeInTheDocument();
});

test("sem sequência nenhuma, a seção não aparece", async () => {
  install([opened({ previousTaskIds: [], nextTaskIds: [] })]);
  renderPage();
  await screen.findByRole("heading", { name: OPEN });
  await loaded();

  expect(screen.queryByRole("region", { name: "Sequência" })).not.toBeInTheDocument();
});

test("uma tarefa da sequência que não carrega some da lista e aparece o aviso", async () => {
  install([opened({ nextTaskIds: ["next-1", "sumiu"] }), PREVIOUS, NEXT[0] as TaskDto]);
  renderPage();
  await loaded();

  const section = await screen.findByRole("region", { name: "Sequência" });
  expect(within(section).getByText("Algumas tarefas da sequência não carregaram.")).toBeInTheDocument();
  expect(within(section).getByRole("link", { name: /Arrumar a mala/ })).toBeInTheDocument();
});
