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

/** A tarefa aberta: uma tarefa de pessoa, subtarefa do alerta de um agente e com uma subtarefa de pessoa e uma de agente. */
function opened(overrides: Partial<TaskDto> = {}): TaskDto {
  return taskFixture({
    id: "ev-1",
    name: OPEN,
    kind: "common",
    status: "doing",
    startedAt: "2026-11-14T09:00:00-03:00",
    parentTaskId: "parent-1",
    subtaskIds: ["sub-1", "sub-2"],
    ...overrides,
  });
}

/** A tarefa principal: a tarefa de agente que monitora a aplicação. */
const PARENT = taskFixture({
  id: "parent-1",
  actor: "agent",
  kind: "request",
  status: "completed",
  name: "Monitorar a aplicação",
  startedAt: "2026-11-14T08:00:00-03:00",
  subtaskIds: ["ev-1"],
});

const SUBTASKS = [
  taskFixture({ id: "sub-1", name: "Arrumar a mala", kind: "common", status: "todo", startedAt: "2026-11-15T07:00:00-03:00", parentTaskId: "ev-1" }),
  taskFixture({ id: "sub-2", actor: "agent", kind: "request", status: "queued", name: "Aplicar o conserto", startedAt: "2026-11-14T09:50:00-03:00", parentTaskId: "ev-1" }),
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

/** Espera as seções saírem do estado de carregamento. */
async function loaded() {
  await waitFor(() => expect(screen.queryByText(/Carregando/)).not.toBeInTheDocument());
}

test("“Tarefa principal” mostra a única principal e “Subtarefas”, cada uma, com nome, tipo e quando", async () => {
  install([opened(), PARENT, ...SUBTASKS]);
  renderPage();
  await loaded();

  const parent = await screen.findByRole("region", { name: "Tarefa principal" });
  const parentList = within(parent).getByRole("list", { name: "Tarefa principal" });
  expect(within(parentList).getAllByRole("listitem")).toHaveLength(1);
  expect(within(parentList).getByRole("link", { name: /Monitorar a aplicação/ })).toHaveAttribute("href", "/user-1/tarefas/parent-1");
  expect(within(parentList).getByText("request")).toBeInTheDocument();

  const subtasks = screen.getByRole("region", { name: "Subtarefas" });
  const list = within(subtasks).getByRole("list", { name: "Subtarefas" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(within(list).getByRole("link", { name: /Arrumar a mala/ })).toHaveAttribute("href", "/user-1/tarefas/sub-1");
  expect(within(list).getByText("common")).toBeInTheDocument();
  expect(within(list).getByText("Amanhã, 07:00")).toBeInTheDocument();
});

test("as duas pontas podem ser tarefa de agente, e o glifo mostra o status delas", async () => {
  install([opened(), PARENT, ...SUBTASKS]);
  renderPage();
  await loaded();

  const parent = await screen.findByRole("region", { name: "Tarefa principal" });
  expect(within(parent).getByRole("img", { name: "Agente, concluído" })).toBeInTheDocument();

  const subtasks = screen.getByRole("region", { name: "Subtarefas" });
  expect(within(subtasks).getByRole("link", { name: /Aplicar o conserto/ })).toHaveAttribute("href", "/user-1/tarefas/sub-2");
  expect(within(subtasks).getByRole("img", { name: "Agente, na fila" })).toBeInTheDocument();
  expect(within(subtasks).getByText("na fila · há 10 min")).toBeInTheDocument();
});

test("a hierarquia é informativa: não há “Espera por”, nem fração de progresso, nem botão, nem escrita", async () => {
  install([opened({ status: "inHold" }), PARENT, ...SUBTASKS]);
  renderPage();
  await loaded();

  const parent = await screen.findByRole("region", { name: "Tarefa principal" });
  const subtasks = screen.getByRole("region", { name: "Subtarefas" });
  expect(screen.queryByText(/Espera por/)).not.toBeInTheDocument();
  expect(within(subtasks).queryByText(/\d\/\d/)).not.toBeInTheDocument();
  expect(within(parent).queryByRole("button")).not.toBeInTheDocument();
  expect(within(subtasks).queryByRole("button")).not.toBeInTheDocument();
  expect(api.calls.filter((call) => call.method !== "GET")).toHaveLength(0);
});

test("sem tarefa principal, só “Subtarefas” aparece", async () => {
  install([opened({ parentTaskId: undefined }), ...SUBTASKS]);
  renderPage();
  await loaded();

  expect(await screen.findByRole("region", { name: "Subtarefas" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Tarefa principal" })).not.toBeInTheDocument();
});

test("sem subtarefas, só “Tarefa principal” aparece", async () => {
  install([opened({ subtaskIds: [] }), PARENT]);
  renderPage();
  await loaded();

  expect(await screen.findByRole("region", { name: "Tarefa principal" })).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Subtarefas" })).not.toBeInTheDocument();
});

test("fora de qualquer hierarquia, nenhuma das duas seções aparece", async () => {
  install([opened({ parentTaskId: undefined, subtaskIds: [] })]);
  renderPage();
  await screen.findByRole("heading", { name: OPEN });
  await loaded();

  expect(screen.queryByRole("region", { name: "Tarefa principal" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Subtarefas" })).not.toBeInTheDocument();
});

test("uma subtarefa que não carrega some da lista e aparece o aviso", async () => {
  install([opened({ subtaskIds: ["sub-1", "sumiu"] }), PARENT, SUBTASKS[0] as TaskDto]);
  renderPage();
  await loaded();

  const subtasks = await screen.findByRole("region", { name: "Subtarefas" });
  expect(within(subtasks).getByText("Algumas subtarefas não carregaram.")).toBeInTheDocument();
  expect(within(subtasks).getByRole("link", { name: /Arrumar a mala/ })).toBeInTheDocument();
});

test("a tarefa principal que não carrega mostra o aviso no lugar dela", async () => {
  install([opened({ parentTaskId: "sumiu", subtaskIds: [] })]);
  renderPage();
  await loaded();

  const parent = await screen.findByRole("region", { name: "Tarefa principal" });
  expect(within(parent).getByText("A tarefa principal não carregou.")).toBeInTheDocument();
  expect(within(parent).queryByRole("link")).not.toBeInTheDocument();
});
